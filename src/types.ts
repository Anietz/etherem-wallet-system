export type { default as BN } from 'bn.js';
export enum NetTypes {
  MAIN = 'main',
  TEST = 'test',
}

export enum WalletTypes {
  DEFAULT = 'DEFAULT',
  HD = 'HD',
  MULTISIG = 'MULTISIG',
}

export enum TokenTypes {
  'ETH' = 'eth',
  'USDT' = 'usdt',
  'USDC' = 'usdc',
  'BNB' = 'bnb',
  'BUSD' = 'busd',
  'NGNT' = 'ngnt',
  'UNI' = 'uni',
  'LINK' = 'link',
  'DAI' = 'dai',
  'AEZZ' = 'aezz',
}

export enum EventType {
  'NEW_PAYMENT' = 'NEW_PAYMENT',
  'UNCONFIRMED' = 'UNCONFIRMED',
  'DATA' = 'DATA',
  'NEW_ERC20_PAYMENT' = 'NEW_ERC20_PAYMENT',
}

export interface IWalletClass {
  createWallet(opts?: ICreateWalletOptions): Promise<IWallet>;
  estimateFees(opts: ISend): Promise<IEstimate>;
  send(opts: IEstimate, privateKey: string): Promise<ITransaction>;
  getBalance(opts: IGetBalanceOptions): Promise<string>;
  generateAddress(mnemonics: string, derivationIndex: number): Promise<any>;
  getTransaction(trxHash: string): Promise<ITransaction>;
  subscribeETH(vault: string[]): void;
  subscribeERC20(): void;
}

export interface IWallet {
  privateKey: string;
  mnemonics?: string;
  address: string;
  checkSumAddress: string;
  publicKey: string;
}

export interface ITransaction {
  blockHash: string;
  blockNumber: number;
  from: string;
  gas: number;
  gasPrice: string | number;
  hash: string;
  input: string;
  nonce: number;
  to: string;
  transactionIndex: number;
  value: string | number;
  [key: string]: string | number;
}

export interface ITransactions {
  transactions: ITransaction[];
  balance: string;
  length: number;
}

export interface ICreateWalletOptions {
  type?: WalletTypes;
  privateKey?: string;
  mnemonics?: string;
}

export interface IGetBalanceOptions {
  address: string;
  token?: TokenTypes;
}

export interface IEstimate {
  nonce: string;
  to: string;
  value: string | number;
  gasLimit: string | number;
  gasPrice: string | number;
  data?: string;
}

export interface ISend {
  from: string;
  to: string;
  amount: string;
  token?: TokenTypes;
}

export interface TToken {
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  description: string;
  url: string;
}

export interface ITContractResponseData {
  blockHash: string;
  blockNumber: number;
  contractAddress: string;
  cumulativeGasUsed: number;
  effectiveGasPrice?: string;
  from: string;
  gasUsed: number;
  logs: any[];
  logsBloom: string;
  status: boolean;
  to: string;
  transactionHash: string;
  transactionIndex: number;
  type?: string;
}

export enum AddressTypes {
  CONTRACT = 'CONTRACT',
  NORMAL = 'NORMAL',
}

export enum AddressPurpose {
  FEE_PAYMENT = 'FEE_PAYMENT',
  EXCHANGE = 'EXCHANGE',
  OTHERS = 'OTHERS',
}

export interface IDecodedERC20EventData {
  name: string;
  type: string;
  value: string;
}

export interface IDecodedERC20Event {
  name: string;
  events: [IDecodedERC20EventData, IDecodedERC20EventData, IDecodedERC20EventData];
  address: string;
}

export interface ITransactionScanner {
  scanned?: boolean;
  _id?: string;
  scanCount?: number | any;
  $or?: Array<any>;
}
