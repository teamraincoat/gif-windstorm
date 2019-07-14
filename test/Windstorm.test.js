const truffleAssert = require('truffle-assertions');
const { addMonths } = require('date-fns');

const Windstorm = artifacts.require('Windstorm');
const { fromAscii } = web3.utils;

const removeHyphens = (str) => str.replace(/-/g, '');

contract('Windstorm', (accounts) => {
  const _managerAccount = accounts[0];
  const _perilContractId = 'pr_wind_2019';

  let _contract;
  let _externalId1 = removeHyphens('96600c37-79c1-4009-aef8-f1c1dd117d0d');
  let _externalId2 = removeHyphens('051fc525-17e8-4745-b2cd-7c29141f18b4');
  let _externalId3 = removeHyphens('85d8e547-c345-4830-a9b1-7e92aa0a0753');
  let _externalId4 = removeHyphens('fc422d71-f378-4679-8874-5db7dfe9d67e');
  let _applicationRequestId1;
  let _applicationRequestId2;
  let _applicationRequestId3;
  let _applicationRequestId4;
  let _statusRequestId1;
  let _payoutId1;

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
          fromAscii(_externalId1),
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
        fromAscii(_externalId1),
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
        fromAscii(_externalId2),
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
  });

  describe('confirmPayout', function () {
    it('should set the payout confirmation and amount', async () => {
      const txn = await _contract.confirmPayout(_payoutId1, 600000, { from: _managerAccount });
      assert.equal(typeof txn.receipt.transactionHash === 'string', true);
    });
  });
});
