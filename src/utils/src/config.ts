import * as dotenv from 'dotenv';
dotenv.config();
const path = require('path');
const rootPath = path.resolve(__dirname, '../../../');

const config = {
  hashSalt: 15,
  jwt: {
    secret: {
      forgetPassword: 'Corona viruuuuuus, shit is reaaaaaaaaal.',
      verifyEmail: 'colonial vilus, will never know lion family',
      authTokenVerification: 'egungun be carefule',
    },
  },
  baseURL: process.env.BASE_URL,
  MAINNET_PROVIDER: process.env.MAINNET_PROVIDER ?? '',
  TESTNET_PROVIDER: process.env.TESTNET_PROVIDER ?? '',
  MORALIS_MAINNET_PROVIDER: process.env.MORALIS_MAINNET_PROVIDER ?? '',
  MORALIS_MAINNET_PROVIDER_WEB_SOCKET: process.env.MORALIS_MAINNET_PROVIDER_WEB_SOCKET ?? '',
  MORALIS_TESTNET_PROVIDER: process.env.MORALIS_TESTNET_PROVIDER ?? '',
  MORALIS_TESTNET_PROVIDER_WEB_SOCKET: process.env.MORALIS_TESTNET_PROVIDER_WEB_SOCKET ?? '',
  ETH_CENTRAL_ADDRESS: process.env.ETH_CENTRAL_ADDRESS ?? '',
  CONTRACT_ROOT_PATH: rootPath + '/contracts',
  API_ACCESS_KEY: process.env.API_ACCESS_KEY ?? '',
  APP_ENVIRONMENT: process.env.ENVIRONMENT ?? '',
  TESTNET_TOKEN_CONTRACT_ADDRESS: process.env.TESTNET_TOKEN_CONTRACT_ADDRESS ?? '',
  MERCHANT_WEBHOOK_URL: process.env.MERCHANT_WEBHOOK_URL ?? '',
  FEE_WALLET_ACCOUNT: process.env.FEE_WALLET_ACCOUNT ?? '',
  MONGO_DB_ID_TO_SCANN_FOR_TESTING: process.env.MONGO_DB_ID_TO_SCANN_FOR_TESTING ?? '',
  INFURA_KEYS: process.env.INFURA_KEYS ?? '',
  TEST_DB_CONNECTION_URI: process.env.TEST_DB_CONNECTION_URI ?? '',
  LIVE_DB_CONNECTION_URI: process.env.LIVE_DB_CONNECTION_URI ?? '',
  SERVER_PORT: process.env.PORT ?? 5000,
};

export default config;
