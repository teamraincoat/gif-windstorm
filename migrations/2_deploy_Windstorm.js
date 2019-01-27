// Load env vars from .env
const dotenv = require('dotenv');
const env = dotenv.config({ path: '../.env' });
const { PRODUCT_CONTROLLER_ADDRESS } = env.parsed;

const Windstorm = artifacts.require('./Windstorm.sol');

module.exports = function(deployer) {
  deployer.deploy(Windstorm, PRODUCT_CONTROLLER_ADDRESS);
};
