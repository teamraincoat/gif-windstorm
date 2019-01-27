// Load env vars from .env
const dotenv = require('dotenv');
const truffleAssert = require('truffle-assertions');
const { addMonths } = require('date-fns');

const env = dotenv.config();
const { PRODUCT_CONTROLLER_ADDRESS } = env.parsed;

const Windstorm = artifacts.require('Windstorm');
const { fromAscii } = web3.utils;

contract('Windstorm', (accounts) => {
  const _managerAccount = accounts[0];

  let _contract;
  let _customerId1 = fromAscii('a1b2c3');
  let _customerId2 = fromAscii('b2c3d4');
  let _applicationRequestId1;
  let _applicationRequestId2;
  let _statusRequestId1;
  let _payoutId1;

  const _seasonStart = Math.round(Date.now() / 1000);
  const _seasonEnd = Math.round(addMonths(new Date(), 6).getTime() / 1000);

  const _payoutOptions1 = [120000, 140000, 150000, 90000, 100000, 110000, 60000, 70000, 80000];
  const _payoutOptions2 = [140000, 150000, 160000, 100000, 110000, 120000, 70000, 80000, 90000];

  before(async function () {
    _contract = await Windstorm.new(PRODUCT_CONTROLLER_ADDRESS);
  });

  it('should return an instance of the Windstorm contract', function () {
    assert.isTrue(typeof _contract !== 'undefined');
  });

  describe('applyForPolicy', function () {
    it('should throw an error for invalid location parameter', async () => {
      try {
        await _contract.applyForPolicy(
          fromAscii(''),
          _seasonStart,
          _seasonEnd,
          30000,
          1,
          _payoutOptions1,
          _customerId1,
          { from: _managerAccount },
        );
      } catch (error) {
        const hasLocationError = /(ERROR\:\:INVALID_LOCATION)/.test(error.message);
        assert.equal(hasLocationError, true);
      }
    });

    it('should throw an error for invalid season start parameter', async () => {
      try {
        await _contract.applyForPolicy(
          fromAscii('18.3892246,-66.1305132'),
          0,
          _seasonEnd,
          30000,
          1,
          _payoutOptions1,
          _customerId1,
          { from: _managerAccount },
        );
      } catch (error) {
        const hasStartTimeError = /(ERROR\:\:INVALID_SEASON_START_TIME)/.test(error.message);
        assert.equal(hasStartTimeError, true);
      }
    });

    it('should throw an error for invalid season end parameter', async () => {
      try {
        await _contract.applyForPolicy(
          fromAscii('18.3892246,-66.1305132'),
          _seasonStart,
          0,
          30000,
          1,
          _payoutOptions1,
          _customerId1,
          { from: _managerAccount },
        );
      } catch (error) {
        const hasEndTimeError = /(ERROR\:\:INVALID_SEASON_END_TIME)/.test(error.message);
        assert.equal(hasEndTimeError, true);
      }
    });

    it('should emit LogRequestForApplication event for successful application', async () => {
      const txn = await _contract.applyForPolicy(
        fromAscii('18.3892246,-66.1305132'),
        _seasonStart,
        _seasonEnd,
        30000,
        1,
        _payoutOptions1,
        _customerId1,
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
        _seasonStart,
        _seasonEnd,
        35000,
        1,
        _payoutOptions2,
        _customerId2,
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
        const hasRequestIdError = /(ERROR\:\:INVALID_REQUEST_ID)/.test(error.message);
        assert.equal(hasRequestIdError, true);
      }
    });

    it('should decline a policy provided a valid request id', async () => {
      const txn = await _contract.applicationCallback(
        _applicationRequestId2,
        true,
        { from: _managerAccount }
      );
      assert.equal(typeof txn.tx !== 'undefined', true);
    });

    it('should emit LogRequestPolicyStatus event for successful underwrite', async () => {
      const txn = await _contract.applicationCallback(
        _applicationRequestId1,
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

    it('should throw an error when distance is to far for payout > 30 miles', async () => {
      try {
        await _contract.policyStatusCallback(_statusRequestId1, 3, 50000, { from: _managerAccount });
      } catch (error) {
        const hasOutOfBoundsError = /(ERROR\:\:TOO_FAR_FOR_PAYOUT)/.test(error.message);
        assert.equal(hasOutOfBoundsError, true);
      }
    });

    it('should throw an error when category is invalid', async () => {
      try {
        await _contract.policyStatusCallback(_statusRequestId1, 2, 1000, { from: _managerAccount });
      } catch (error) {
        const hasOutOfBoundsError = /(ERROR\:\:INVALID_CATEGORY)/.test(error.message);
        assert.equal(hasOutOfBoundsError, true);
      }
    });

    it('should emit LogRequestPayout event for successful processing of payout option', async () => {
      const txn =
        await _contract.policyStatusCallback(_statusRequestId1, 3, 1000, { from: _managerAccount });

      truffleAssert.eventEmitted(txn, 'LogRequestPayout', (ev) => {
        // Set request id for next test
        _payoutId1 = ev.payoutId;
        return ev.amount.toNumber() === 120000;
      });
    });
  });

  describe('confirmPayout', function () {
    it('should set the payout confirmation and amount', async () => {
      const txn = await _contract.confirmPayout(_payoutId1, 120000, { from: _managerAccount });
      assert.equal(typeof txn.receipt.transactionHash === 'string', true);
    });
  });
});
