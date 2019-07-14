pragma solidity 0.5.2;

import "@etherisc/gif/contracts/Product.sol";


contract Windstorm is Product {
    bytes32 public constant NAME = "Windstorm";
    bytes32 public constant POLICY_FLOW = "PolicyFlowDefault";

    event LogRequestForApplication(
        uint256 requestId,
        bytes32 latlng,
        uint256 exposure
    );

    event LogRequestPayout(
        uint256 claimId,
        uint256 payoutId,
        uint256 amount
    );

    event LogRequestPolicyStatus(
        uint256 requestId,
        bytes32 latlng
    );

    struct Risk {
        bytes32 latlng;
        bytes32 perilContractId;
        uint256 cumulatedExposure;
        uint bucket;
        uint distance;
    }

    struct RequestMetadata {
        uint256 applicationId;
        uint256 policyId;
        bytes32 riskId;
    }

    mapping (bytes32 => Risk) public risks;
    mapping (uint256 => RequestMetadata) public requests;

    bytes32[1] public currencies = [bytes32("USD")];

    uint256 requestIds = 1;

    constructor(address _productController) public Product(_productController, NAME, POLICY_FLOW) {
        createRole("applicationManager");
        createRole("underwriterManager");
        createRole("payoutManager");

        addRoleToAccount(msg.sender, "applicationManager");
        addRoleToAccount(msg.sender, "underwriterManager");
        addRoleToAccount(msg.sender, "payoutManager");
    }

    function applyForPolicy(
        // domain specific struct
        bytes32 _latlng,
        bytes32 _perilContractId,
        // premium struct
        uint256 _premium,
        bytes32 _currency,
        uint256[] calldata _payoutOptions,
        // customer struct
        bytes32 _externalId
    ) external onlyWithRole("applicationManager") {
        // Validate input parameters
        require(_latlng != "", "ERROR::INVALID_LOCATION");
        require(_currency == currencies[0], "ERROR:INVALID_CURRENCY");

        // Create risk if not exists
        bytes32 riskId = keccak256(abi.encodePacked(_latlng, _perilContractId));
        Risk storage risk = risks[riskId];

        if (risk.latlng == "") {
            risk.latlng = _latlng;
            risk.perilContractId = _perilContractId;
            risk.cumulatedExposure = 0;
        }

        // Create new application
        uint256 applicationId = _newApplication(_externalId, _premium, _currency, _payoutOptions);

        // New request
        uint256 requestId = requestIds++;
        RequestMetadata storage requestMetadata = requests[requestId];
        requestMetadata.applicationId = applicationId;
        requestMetadata.riskId = riskId;

        emit LogRequestForApplication(requestId, _latlng, _payoutOptions[18]);
    }

    function applicationCallback (uint256 _requestId, bool _declineApplication) external onlyWithRole("underwriterManager") {
        uint256 applicationId = requests[_requestId].applicationId;

        require(applicationId != 0, "ERROR::INVALID_APPLICATION_ID");

        if (_declineApplication) {
            _decline(applicationId);
            return;
        }

        bytes32 riskId = requests[_requestId].riskId;

        uint256 policyId = _underwrite(applicationId);
        uint256[] memory payoutOptions = _getPayoutOptions(applicationId);

        // Update cumulated exposure for risk
        // Cat5 at 25mi is total exposure for a policy
        uint256 maxPayout = payoutOptions[18];
        risks[riskId].cumulatedExposure = risks[riskId].cumulatedExposure + maxPayout;

        // New policy trigger request, this will not have a specific
        // time to callback but rather will be triggered once the data
        // source indicates that a payout should be processed
        uint256 newRequestId = requestIds++;
        RequestMetadata storage requestMetadata = requests[newRequestId];
        requestMetadata.applicationId = applicationId;
        requestMetadata.policyId = policyId;

        emit LogRequestPolicyStatus(newRequestId, risks[riskId].latlng);
    }

    function policyStatusCallback (
        uint256 _requestId,
        uint _bucket,
        uint _distance
    ) external onlyWithRole("underwriterManager") {
        require(_requestId != 0, "ERROR::INVALID_REQUEST_ID");

        uint256 payoutAmount = 0;

        uint256 policyId = requests[_requestId].policyId;
        uint256 applicationId = requests[_requestId].applicationId;
        uint256[] memory payoutOptions = _getPayoutOptions(applicationId);

        uint payoutIndex = _bucket * 3 - _distance;

        require(payoutOptions[payoutIndex] != 0, "ERROR::NO_PAYOUT_FOR_BUCKET");
        payoutAmount = payoutOptions[payoutIndex];

        uint256 claimId = _newClaim(policyId);
        uint256 payoutId = _confirmClaim(claimId, payoutAmount);

        emit LogRequestPayout(claimId, payoutId, payoutAmount);
    }

    function confirmPayout(uint256 _payoutId, uint256 _sum) external onlyWithRole("payoutManager") {
        _payout(_payoutId, _sum);
    }
}
