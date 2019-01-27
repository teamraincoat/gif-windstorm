pragma solidity 0.5.2;

import "@etherisc/gif/contracts/InsuranceProduct.sol";


contract Windstorm is InsuranceProduct {
    bytes32 public constant NAME = "Windstorm";
    bytes32 public constant POLICY_FLOW = "PolicyFlowDefault";

    event LogRequestForApplication(
        uint256 requestId,
        bytes32 latlng,
        uint256 seasonStartTime,
        uint256 seasonEndTime
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
        uint256 seasonStartTime;
        uint256 seasonEndTime;
        uint category;
        uint distance;
    }

    struct RequestMetadata {
        uint256 applicationId;
        uint256 policyId;
        bytes32 riskId;
    }

    RequestMetadata[] public requests;

    mapping (bytes32 => Risk) public risks;

    // The payoutMap is an abstraction to easily calculate
    // which payout option to apply for a particular policy
    // given the data provided from the windspeed oracle
    mapping (uint => uint) private payoutMap;

    constructor(address _productController) public InsuranceProduct(_productController, NAME, POLICY_FLOW) {
        createRole("applicationManager");
        createRole("underwriterManager");
        createRole("payoutManager");

        addRoleToAccount(msg.sender, "applicationManager");
        addRoleToAccount(msg.sender, "underwriterManager");
        addRoleToAccount(msg.sender, "payoutManager");

        setPayoutMap();
    }

    function applyForPolicy(
        // domain specific struct
        bytes32 _latlng,
        uint256 _seasonStartTime,
        uint256 _seasonEndTime,
        // premium struct
        uint256 _premium,
        uint256 _currency,
        uint256[] calldata _payoutOptions,
        // customer struct
        bytes32 _customerExternalId
    ) external onlyWithRole("applicationManager") {
        // Validate input parameters
        require(_latlng != "", "ERROR::INVALID_LOCATION");
        require(_seasonStartTime <= block.timestamp, "ERROR::INVALID_SEASON_START_TIME"); // solium-disable-line
        require(_seasonEndTime > _seasonStartTime, "ERROR::INVALID_SEASON_END_TIME");

        // Create risk if not exists
        bytes32 riskId = keccak256(abi.encodePacked(_latlng, _seasonStartTime, _seasonEndTime));
        Risk storage risk = risks[riskId];

        if (risk.latlng == "") {
            risk.latlng = _latlng;
            risk.seasonStartTime = _seasonStartTime;
            risk.seasonEndTime = _seasonEndTime;
        }

        // Create new application
        uint256 applicationId = newApplication(_customerExternalId, _premium, _currency, _payoutOptions);

        // New request
        uint256 requestId = requests.length++;
        RequestMetadata storage requestMetadata = requests[requestId];
        requestMetadata.applicationId = applicationId;
        requestMetadata.riskId = riskId;

        emit LogRequestForApplication(requestId, _latlng, _seasonStartTime, _seasonEndTime);
    }

    function applicationCallback (uint256 _requestId, bool _decline) external onlyWithRole("underwriterManager") {
        require(_requestId != 0, "ERROR::INVALID_REQUEST_ID");

        uint256 applicationId = requests[_requestId].applicationId;

        if (_decline) {
            decline(applicationId);
            return;
        }

        bytes32 riskId = requests[_requestId].riskId;
        uint256 policyId = underwrite(applicationId);

        // New policy trigger request, this will not have a specific
        // time to callback but rather will be triggered once the data
        // source indicates that a payout should be processed
        uint256 newRequestId = requests.length++;
        RequestMetadata storage requestMetadata = requests[newRequestId];
        requestMetadata.policyId = policyId;

        emit LogRequestPolicyStatus(newRequestId, risks[riskId].latlng);
    }

    function policyStatusCallback (
        uint256 _requestId,
        uint _category,
        uint _distance
    ) external onlyWithRole("underwriterManager") {
        require(_requestId != 0, "ERROR::INVALID_REQUEST_ID");
        require(_category > 2 && _category <= 5, "ERROR::INVALID_CATEGORY");

        uint256 policyId = requests[_requestId].policyId;
        uint256 applicationId = requests[_requestId].applicationId;
        uint256[] memory payoutOptions = getPayoutOptions(applicationId);

        // If the trigger puts the policy further away than 30 miles
        // then tranche will be 0 and it will not pay out
        uint tranche = getDistanceTranche(_distance);
        require(tranche > 0, "ERROR::TOO_FAR_FOR_PAYOUT");

        uint score = _category * tranche;
        uint payoutIndex = payoutMap[score];

        // We get the index for the payout option by calculating the
        // score and using it to get the index from the payoutMap
        uint256 payoutAmount = payoutOptions[payoutIndex];

        uint256 claimId = newClaim(policyId);
        uint256 payoutId = confirmClaim(claimId, payoutAmount);

        emit LogRequestPayout(claimId, payoutId, payoutAmount);
    }

    function confirmPayout(uint256 _payoutId, uint256 _sum) external onlyWithRole("payoutManager") {
        payout(_payoutId, _sum);
    }

    function setPayoutMap () internal {
        // (category)(distance-tranche) = score which is mapped to index
        // of payout data where 0-5 is 1; 5-15 is 2; 15-30 is 3
        //
        // (3)(3)  (4)(3)  (5)(3) - 15-30 miles
        // (3)(2)  (4)(2)  (5)(2) - 5-15 miles
        // (3)(1)  (4)(1)  (5)(1) - 0-5 miles
        //
        // 0-5 miles
        payoutMap[3] = 0;  // Category 3
        payoutMap[4] = 1;  // Category 4
        payoutMap[5] = 2;  // Category 5
        // 5-15 miles
        payoutMap[6] = 3;  // Category 3
        payoutMap[8] = 4;  // Category 4
        payoutMap[10] = 5; // Category 5
        // 15-30 miles
        payoutMap[9] = 6;  // Category 3
        payoutMap[12] = 7; // Category 4
        payoutMap[15] = 8; // Category 5
    }

    function getDistanceTranche (uint _distance) internal pure returns (uint _tranche) {
        // Distance is provided in meters
        uint tranche = 0;
        // 0 - 5 miles
        if (_distance < 8048) {
            tranche = 1;
        }
        // 5 - 15 miles
        if (8048 < _distance && _distance < 24141) {
            tranche = 2;
        }
        // 15 - 30 miles
        if (24141 < _distance && _distance < 48280) {
            tranche = 3;
        }
        return tranche;
    }
}
