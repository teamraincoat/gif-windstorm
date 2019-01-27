Windstorm Product on GIF Framework
==================================

Development
-----------

* Clone [GIF Framework](https://github.com/etherisc/GIF) and follow instructions to deploy in development blockchain.
* When GIF contracts have been deployed, copy the `ProductController` contract address.
* Create a `.env` file in the root of this project and add `PRODUCT_CONTROLLER_ADDRESS=<the copied address>`
* Run migrations `truffle migrate`
* Run tests `truffle test`
