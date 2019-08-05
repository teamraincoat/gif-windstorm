// Load env vars from .env
const dotenv = require('dotenv');
const env = dotenv.config({ path: '../.env' });
const { info } = require('@etherisc/microservice/io/log');

const { fromAscii } = web3.utils;

const {
  LICENSE_CONTROLLER_ADDRESS,
  PRODUCT_CONTROLLER_ADDRESS,
  INSTANCE_OPERATOR_ADDRESS,
} = env.parsed;

const ProductService = artifacts.require('ProductService');
const InstanceOperatorService = artifacts.require('InstanceOperatorService');
const LicenseController = artifacts.require('LicenseController');
const Windstorm = artifacts.require('Windstorm.sol');


module.exports = async (deployer, network, accounts) => {
  const productService = await ProductService.at(PRODUCT_CONTROLLER_ADDRESS);

  await deployer.deploy(Windstorm, productService.address, { gas: 3000000 });

  if (network === 'rinkeby') return;

  const licenseController = await LicenseController.at(LICENSE_CONTROLLER_ADDRESS);
  const instanceOperator = await InstanceOperatorService.at(INSTANCE_OPERATOR_ADDRESS);

  const windstorm = await Windstorm.deployed();

  const windstormName = await windstorm.NAME.call();

  info('Register product');
  const receipt = await licenseController.register(windstormName, windstorm.address, fromAscii('PolicyFlowDefault'))
    .on('transactionHash', txHash => info(`transaction hash: ${txHash}\n`));

  const productId = receipt.logs[0].args.productId.toString();

  info(`Approve product id: ${productId}`);
  await instanceOperator.approveProduct(productId, { gas: 200000 })
    .on('transactionHash', txHash => info(`transaction hash: ${txHash}\n`));
};
