const truffleAssert = require('truffle-assertions');
const { addMonths } = require('date-fns');

const Windstorm = artifacts.require('Windstorm');
const { fromAscii, sha3 } = web3.utils;

contract('Windstorm', (accounts) => {
  const _managerAccount = accounts[0];
  const _perilContractId = 'pr_wind_2019';

  let _contract;
  let _externalId1 = sha3('96600c37-79c1-4009-aef8-f1c1dd117d0d');
  let _externalId2 = sha3('051fc525-17e8-4745-b2cd-7c29141f18b4');
  let _externalId3 = sha3('85d8e547-c345-4830-a9b1-7e92aa0a0753');
  let _externalId4 = sha3('fc422d71-f378-4679-8874-5db7dfe9d67e');
  let _applicationRequestId1;
  let _applicationRequestId2;
  let _applicationRequestId3;
  let _applicationRequestId4;
  let _statusRequestId1;
  let _statusRequestId2;
  let _statusRequestId3;
  let _payoutId1;
  let _payoutId2;
  let _payoutId3;

  // bucket * 3 - (1|2|3) = payout index
  // 25mi, 50mi, 75mi
  const _payoutOptions1 = [
    25000,  12500,  5000,     // Cat1
    50000,  25000,  12500,    // Cat2
    100000, 37500,  18750,    // Cat3.a
    150000, 50000,  25000,    // Cat3.b
    250000, 100000, 37500,    // Cat4.a
    375000, 175000, 50000,    // Cat4.b
    500000, 300000, 150000,   // Cat5
  ];
  const _payoutOptions2 = [
    0,       0,      0,       // Cat1
    0,       0,      0,       // Cat2
    0,       0,      0,       // Cat3.a
    0,       0,      0,       // Cat3.b
    500000,  200000, 75000,   // Cat4.a
    750000,  350000, 100000,  // Cat4.b
    1000000, 600000, 300000,  // Cat5
  ];
  const _payoutOptions3 = [
    50000,   25000,  10000,   // Cat1
    100000,  50000,  25000,   // Cat2
    200000,  75000,  37500,   // Cat3.a
    300000,  100000, 50000,   // Cat3.b
    500000,  200000, 75000,   // Cat4.a
    750000,  350000, 100000,  // Cat4.b
    1000000, 600000, 300000,  // Cat5
  ];
  const _payoutOptions4 = [
    0,       0,      0,       // Cat1
    0,       0,      0,       // Cat2
    0,       0,      0,       // Cat3.a
    0,       0,      0,       // Cat3.b
    0,       0,      0,       // Cat4.a
    0,       0,      0,       // Cat4.b
    1000000, 600000, 300000,  // Cat5
  ];

  before(async function () {
    _contract = await Windstorm.deployed();
  });

  it('should return an instance of the Windstorm contract', function () {
    assert.isTrue(typeof _contract !== 'undefined');
  });

  describe('applyForPolicy', function () {
    it('should throw an error for invalid location parameter', async () => {
      try {
        await _contract.applyForPolicy(
          fromAscii(''),
          fromAscii(_perilContractId),
          37854,
          fromAscii('USD'),
          _payoutOptions1,
          _externalId1,
          { from: _managerAccount },
        );
      } catch (error) {
        const hasLocationError = /(ERROR\:\:INVALID_LOCATION)/.test(error.message);
        assert.equal(hasLocationError, true);
      }
    });

    it('should emit LogRequestForApplication event for successful application', async () => {
      const txn = await _contract.applyForPolicy(
        fromAscii('18.3892246,-66.1305132'),
        fromAscii(_perilContractId),
        37854,
        fromAscii('USD'),
        _payoutOptions1,
        _externalId1,
        { from: _managerAccount },
      );
      truffleAssert.eventEmitted(txn, 'LogRequestForApplication', (ev) => {
        // Set request id for next test
        _applicationRequestId1 = ev.requestId;
        return true;
      });
    });
  });

  describe('applicationCallback', function () {
    before(async () => {
      const txn = await _contract.applyForPolicy(
        fromAscii('19.5781246,-64.2416041'),
        fromAscii(_perilContractId),
        37854,
        fromAscii('USD'),
        _payoutOptions2,
        _externalId2,
        { from: _managerAccount },
      );
      truffleAssert.eventEmitted(txn, 'LogRequestForApplication', (ev) => {
        // Set request id for next test
        _applicationRequestId2 = ev.requestId;
        return true;
      });
    });

    it('should throw an error for invalid request id parameter', async () => {
      try {
        await _contract.applicationCallback(0, false, { from: _managerAccount });
      } catch (error) {
        const hasRequestIdError = /(ERROR\:\:INVALID_APPLICATION_ID)/.test(error.message);
        assert.equal(hasRequestIdError, true);
      }
    });

    it('should decline a policy provided a valid request id', async () => {
      const txn = await _contract.applicationCallback(
        _applicationRequestId1,
        true,
        { from: _managerAccount }
      );
      assert.equal(typeof txn.tx !== 'undefined', true);
    });

    it('should emit LogRequestPolicyStatus event for successfull underwrite', async () => {
      const txn = await _contract.applicationCallback(
        _applicationRequestId2,
        false,
        { from: _managerAccount }
      );
      truffleAssert.eventEmitted(txn, 'LogRequestPolicyStatus', (ev) => {
        // Set request id for next test
        _statusRequestId1 = ev.requestId;
        return true;
      });
    });
  });

  describe('policyStatusCallback', function () {
    before(async () => {
      // Apply policy
      const txn1 = await _contract.applyForPolicy(
        fromAscii('19.5781246,-64.2416041'),
        fromAscii(_perilContractId),
        20672,
        fromAscii('USD'),
        _payoutOptions3,
        _externalId3,
        { from: _managerAccount },
      );
      // Apply policy
      const txn2 = await _contract.applyForPolicy(
        fromAscii('19.5781246,-64.2416041'),
        fromAscii(_perilContractId),
        37854,
        fromAscii('USD'),
        _payoutOptions4,
        _externalId4,
        { from: _managerAccount },
      );
      truffleAssert.eventEmitted(txn1, 'LogRequestForApplication', (ev) => {
        // Set request id for next test
        _applicationRequestId3 = ev.requestId;
        return true;
      });
      truffleAssert.eventEmitted(txn2, 'LogRequestForApplication', (ev) => {
        // Set request id for next test
        _applicationRequestId4 = ev.requestId;
        return true;
      });
      // Underwrite policies
      const txn3 = await _contract.applicationCallback(_applicationRequestId3, false, { from: _managerAccount });
      const txn4 = await _contract.applicationCallback(_applicationRequestId4, false, { from: _managerAccount });
      // Set status request ids
      truffleAssert.eventEmitted(txn3, 'LogRequestPolicyStatus', (ev) => {
        // Set request id for next test
        _statusRequestId2 = ev.requestId;
        return true;
      });
      truffleAssert.eventEmitted(txn4, 'LogRequestPolicyStatus', (ev) => {
        // Set request id for next test
        _statusRequestId3 = ev.requestId;
        return true;
      });
    });

    it('should throw an error for invalid request id parameter', async () => {
      try {
        await _contract.policyStatusCallback(0, 0, 0, { from: _managerAccount });
      } catch (error) {
        const hasRequestIdError = /(ERROR\:\:INVALID_REQUEST_ID)/.test(error.message);
        assert.equal(hasRequestIdError, true);
      }
    });

    it('should throw an error when no payout for bucket', async () => {
      try {
        await _contract.policyStatusCallback(_statusRequestId1, 4, 2, { from: _managerAccount });
      } catch (error) {
        const hasOutOfBoundsError = /(ERROR\:\:NO_PAYOUT_FOR_BUCKET)/.test(error.message);
        assert.equal(hasOutOfBoundsError, true);
      }
    });

    it('should emit LogRequestPayout event for successful processing of payout option', async () => {
      const txn =
        await _contract.policyStatusCallback(_statusRequestId1, 7, 2, { from: _managerAccount });

      truffleAssert.eventEmitted(txn, 'LogRequestPayout', (ev) => {
        // Set request id for next test
        _payoutId1 = ev.payoutId;
        return ev.amount.toNumber() === 600000;
      });
    });

    it('should emit LogRequestPayout event for successful processing of payout option 2', async () => {
      const txn =
        await _contract.policyStatusCallback(_statusRequestId2, 5, 1, { from: _managerAccount });

      truffleAssert.eventEmitted(txn, 'LogRequestPayout', (ev) => {
        // Set request id for next test
        _payoutId2 = ev.payoutId;
        return ev.amount.toNumber() === 75000;
      });
    });

    it('should emit LogRequestPayout event for successful processing of payout option 3', async () => {
      const txn =
        await _contract.policyStatusCallback(_statusRequestId3, 7, 3, { from: _managerAccount });

      truffleAssert.eventEmitted(txn, 'LogRequestPayout', (ev) => {
        // Set request id for next test
        _payoutId3 = ev.payoutId;
        return ev.amount.toNumber() === 1000000;
      });
    });
  });

  describe('confirmPayout', function () {
    it('should set the payout confirmation and amount', async () => {
      const txn = await _contract.confirmPayout(_payoutId1, 600000, { from: _managerAccount });
      assert.equal(typeof txn.receipt.transactionHash === 'string', true);
    });
  });
});
