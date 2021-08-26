import { EventEmitter } from 'events';
import HdKey from 'hdkey';
import Web3 from 'web3';
import BigNumber from 'bignumber.js';
import { generateMnemonic, mnemonicToSeed, mnemonicToSeedSync } from 'bip39';
import { privateToPublic, publicToAddress, toChecksumAddress } from 'ethereumjs-util';
import { Transaction as Tx } from 'ethereumjs-tx';
import erc20Tokens from './tokens';
import erc20ContractAbi from './abis/erc20';
import allERC20ContractABI from './abis/all-erc20-tokens';
import axios from 'axios';
import { hdkey } from 'ethereumjs-wallet';

import {
  NetTypes,
  WalletTypes,
  TokenTypes,
  EventType,
  IWalletClass,
  IWallet,
  ITransaction,
  ICreateWalletOptions,
  IGetBalanceOptions,
  ISend,
  BN,
  TToken,
  IEstimate,
  ITContractResponseData,
  IDecodedERC20Event,
} from './types';
import { globalEmitter, config, logger } from './utils';
import {
  mainnetForwardContract,
  testnetNewForwardContract,
  testnetControllerForwarderContract,
  mainnetControllerForwarderContract,
} from './contracts/forwarderContract';
import fs from 'fs';
const abiDecoder = require('abi-decoder');
import erc20EventABI from './abis/events/erc20';
const solc = require('solc');

export default class Wallet extends EventEmitter implements IWalletClass {
  net: NetTypes;
  provider: Web3;
  socketProvider: Web3;
  private static DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0/0";

  constructor(net: NetTypes = NetTypes.TEST, providerId: string, websocketId: string) {
    super();
    this.net = net;

    switch (net) {
      case NetTypes.MAIN:
        if (config.MAINNET_PROVIDER == 'MORALIS') {
          this.provider = this.initProvider(config.MORALIS_MAINNET_PROVIDER);
          this.socketProvider = this.initSocketProvider(config.MORALIS_MAINNET_PROVIDER_WEB_SOCKET);
        } else {
          this.provider = this.initProvider(`https://mainnet.infura.io/v3/${providerId}`);
          this.socketProvider = this.initSocketProvider(`wss://mainnet.infura.io/ws/v3/${websocketId}`);
        }

        console.log('MAINNET_PROVIDER', config.MAINNET_PROVIDER);

        break;
      default:
        if (config.TESTNET_PROVIDER == 'MORALIS') {
          this.provider = this.initProvider(config.MORALIS_TESTNET_PROVIDER);
          this.socketProvider = this.initSocketProvider(config.MORALIS_TESTNET_PROVIDER_WEB_SOCKET);
        } else {
          this.provider = this.initProvider(`https://ropsten.infura.io/v3/${providerId}`);

          this.socketProvider = this.initSocketProvider(`wss://ropsten.infura.io/ws/v3/${websocketId}`);
        }

        console.log('TESTNET_PROVIDER', config.TESTNET_PROVIDER);

        break;
    }

    //logger.info(this.provider)

    // this.provider = this.initProvider(
    //   `https://${net === NetTypes.MAIN ? "mainnet" : "ropsten"
    //   }.infura.io/v3/${providerId}`
    // );

    // this.socketProvider = this.initSocketProvider(
    //   `wss://${net === NetTypes.MAIN ? "mainnet" : "ropsten"
    //   }.infura.io/ws/v3/${websocketId}`
    // );
  }

  public static newInstance(net: NetTypes, providerId: string, websocketId: string) {
    return new Wallet(net, providerId, websocketId);
  }

  public setNet(net: NetTypes) {
    this.net = net;
  }

  public setJsonRcpUrl(url: string) {
    this.initProvider(url);
  }

  private initProvider(url: string) {
    this.provider = new Web3(url);
    return this.provider;
  }

  private initSocketProvider(url: string) {
    this.socketProvider = new Web3(url);
    return this.socketProvider;
  }

  /**
   * Create a new ethereum wallet with erc20 token support
   * @param type the type of wallet to be create (DEFAULT | HD | MultiSig)
   */
  public async createWallet(opts?: ICreateWalletOptions): Promise<IWallet> {
    if (opts && opts.type === WalletTypes.MULTISIG) {
      throw new Error('Wallet type not supported yet.');
    }

    const mnemonics = opts?.mnemonics || generateMnemonic();

    const seed = await mnemonicToSeed(mnemonics);

    const root = HdKey.fromMasterSeed(seed);

    const addressNode = root.derive(Wallet.DEFAULT_DERIVATION_PATH);

    const privateKey = opts?.privateKey ? Buffer.from(opts?.privateKey) : addressNode.privateKey;

    const pubKey = privateToPublic(privateKey);
    const address = '0x' + publicToAddress(pubKey).toString('hex');
    const checkSumAddress = toChecksumAddress(address);

    return {
      address,
      checkSumAddress,
      publicKey: addressNode.publicKey.toString('hex'),
      privateKey: privateKey.toString('hex'),
      mnemonics,
    };
  }

  public async estimateFees(opts: ISend): Promise<IEstimate> {
    const { from, to, token, amount } = opts;
    const trxCount = await this.transactionCount(from);
    const nonce: unknown = this.provider.utils.toHex(trxCount);
    const gasPrice = await this.provider.eth.getGasPrice();

    let trxObj = {};
    if (token && !this.isEth(token)) {
      const netSupportedTokens: TToken[] = erc20Tokens[this.net];
      const _token = netSupportedTokens.find((t) => t.symbol === (token || '').toLowerCase());
      const contractAddress = _token ? _token.contractAddress : '';

      const contract = this.getTokenContract(token, contractAddress, from);

      const _amount = this.provider.utils.toBN(amount);
      const decimal = this.provider.utils.toBN(_token ? _token.decimals : 18);
      const value = _amount.mul(this.provider.utils.toBN(10).pow(decimal));
      const data = contract.methods.transfer(to, value.toString()).encodeABI();

      trxObj = {
        nonce: nonce as number,
        to: contractAddress,
        data,
      };

      const gasLimit = await this.provider.eth.estimateGas({
        ...trxObj,
        from,
      });

      trxObj = {
        ...trxObj,
        value: '0x0',
        gasLimit,
        gasPrice,
      };
    } else {
      const value = this.provider.utils.toHex(this.provider.utils.toWei(amount, 'ether'));

      trxObj = {
        nonce: nonce as number,
        to,
        value,
      };

      const gasLimit = await this.provider.eth.estimateGas({
        ...trxObj,
        from,
      });

      trxObj = {
        ...trxObj,
        gasLimit,
        gasPrice,
      };
    }

    return trxObj as IEstimate;
  }

  public async send(opts: IEstimate, privKey: string): Promise<ITransaction> {
    const { to, nonce, value, data, gasLimit, gasPrice } = opts;

    const trxObj = {
      nonce,
      to,
      value,
      gasLimit: this.provider.utils.toHex(gasLimit),
      gasPrice: this.provider.utils.toHex(gasPrice),
      data,
    };

    const trx = new Tx(trxObj, {
      chain: this.net === NetTypes.MAIN ? 'mainnet' : 'ropsten',
    });

    trx.sign(Buffer.from(privKey, 'hex'));

    const serialized = trx.serialize();
    const raw = '0x' + serialized.toString('hex');

    logger.info('raw', raw);

    const transaction = await this.broadcastTransaction(raw);
    return transaction as ITransaction;
  }

  /**
   *
   * @param opts Just transfer from one address to another
   * @param privKey
   * @returns
   */
  public async sendEtherTest(opts: IEstimate, privKey: string, from: string): Promise<any> {
    const { to, nonce, value, data, gasLimit, gasPrice } = opts;

    logger.info('gasLimit', gasLimit);
    logger.info('gasPrice', gasPrice);

    const gasPrices = await this.getCurrentGasPrices();

    const trxObj = {
      nonce,
      to: '0x7a42de9f402130046485ea84e692ab5c279f148c',
      value: this.provider.utils.toHex(this.provider.utils.toWei('0.0005', 'ether')),
      gasLimit,
      gasPrice: gasPrices.low * 1000000000,
      data,
    };

    var fromData = this.provider.eth.accounts.privateKeyToAccount(
      'f03bc8bd4bf30f549dc2fc60a765b8e9b803fd588643d8780c01b2bafaa912d1'
    );
    logger.info(fromData);

    //logger.info("trxObj",trxObj)

    const newPrivKey = 'f03bc8bd4bf30f549dc2fc60a765b8e9b803fd588643d8780c01b2bafaa912d1';

    const trx = new Tx(trxObj, {
      chain: 'ropsten',
    });

    logger.info('privKey', newPrivKey);

    trx.sign(Buffer.from(newPrivKey, 'hex'));

    const serialized = trx.serialize();
    const raw = '0x' + serialized.toString('hex');

    const transaction = await this.broadcastTransaction(raw);
    return transaction as ITransaction;
  }

  async getCurrentGasPrices() {
    let response = await axios.get('https://ethgasstation.info/json/ethgasAPI.json');
    let prices = {
      low: response.data.safeLow / 10,
      medium: response.data.average / 10,
      high: response.data.fast / 10,
    };
    return prices;
  }

  /**
   * Broadcast bulk raw txt
   * @param rawTrxs array of raw tx to broadcast
   */

  public broadcastBulkTransaction(rawTrxs: string[]): Promise<any> {
    const rawPromises = rawTrxs.map(
      (rawTrx) =>
        new Promise((res, rej) => {
          this.broadcastTransaction(rawTrx)
            .then((value) => {
              res(value);
            })
            .catch((e) => {
              rej(e);
            });
        })
    );
    return Promise.all([...rawPromises]);
  }

  /**
   * Prepare raw transaction
   * @param opts details to sign raw tx
   */
  public async prepareRawTransaction(opts: IEstimate & { privKey: string }): Promise<string> {
    const { to, nonce, value, data, gasLimit, gasPrice, privKey } = opts;

    const trxObj = {
      nonce,
      to,
      value,
      gasLimit: this.provider.utils.toHex(gasLimit),
      gasPrice: this.provider.utils.toHex(gasPrice),
      data,
    };

    const trx = new Tx(trxObj, {
      chain: this.net === NetTypes.MAIN ? 'mainnet' : 'ropsten',
    });

    trx.sign(Buffer.from(privKey, 'hex'));

    const serialized = trx.serialize();
    const raw = '0x' + serialized.toString('hex');
    return raw;
  }

  public async bulkSend(opts: IEstimate[] & { privKey: string }[]): Promise<ITransaction[]> {
    const transactions: ITransaction[] = [];

    for (const opt of opts) {
      const { to, nonce, value, data, gasLimit, gasPrice, privKey } = opt;

      const trxObj = {
        nonce,
        to,
        value,
        gasLimit: this.provider.utils.toHex(gasLimit),
        gasPrice: this.provider.utils.toHex(gasPrice),
        data,
      };

      const trx = new Tx(trxObj, {
        chain: this.net === NetTypes.MAIN ? 'mainnet' : 'ropsten',
      });

      trx.sign(Buffer.from(privKey, 'hex'));

      const serialized = trx.serialize();
      const raw = '0x' + serialized.toString('hex');

      const transaction = await this.broadcastTransaction(raw);
      transactions.push(transaction);
    }

    return transactions as ITransaction[];
  }

  /**
   * Get the token balance of given address - gets the ether balance default
   * @param address The address to get it's balance
   * @param token The balance of which token to get - Defaults to ether (eth)
   */
  public async getBalance(opts: IGetBalanceOptions): Promise<string> {
    let balance: BN | string = '';

    if (opts.token && !this.isEth(opts.token)) {
      const netSupportedTokens: TToken[] = erc20Tokens[this.net];
      const token = netSupportedTokens.find((token) => token.symbol === (opts.token || '').toLowerCase());
      const contractAddress = token ? token.contractAddress : '';

      const contract = this.getTokenContract(opts.token, contractAddress);

      const bigNumberBalance = new BigNumber(Number(await this.contractBalanceOf(contract, opts.address)));
      const bigNumberDecimal = new BigNumber(10).exponentiatedBy(token?.decimals || 18);

      balance = bigNumberBalance.dividedBy(bigNumberDecimal).toString();
    } else {
      balance = this.provider.utils.fromWei(await this.balanceOf(opts.address), 'ether');
    }

    return balance as string;
  }

  /**
   * Generate a new address for a given HD wallet (provided it's mnemonic's available)
   * @param mnemonics The HD wallet's mnemonics code for address generation
   * @param derivationIndex The derivation index for the address to be generated
   */
  public async generateAddress(mnemonics: string, derivationIndex: number = 1): Promise<any> {
    if (!this.isValidMnemonic(mnemonics)) throw new Error('Invalid Mnemonics');
    const seed = await mnemonicToSeed(mnemonics);

    const root = HdKey.fromMasterSeed(seed);
    const masterPrivateKey = root.privateKey.toString('hex');
    const masterPublicKey = root.publicKey.toString('hex');

    const addressNode = root.derive(`m/44'/60'/0'/0/${derivationIndex}`);
    const pubKey = privateToPublic(addressNode.privateKey);
    const address = '0x' + publicToAddress(pubKey).toString('hex');
    const checkSumAddress = toChecksumAddress(address);

    return {
      address,
      checkSumAddress,
      publicKey: masterPublicKey,
      privateKey: masterPrivateKey,
      mnemonics,
    };
  }

  /**
   * Generate a new address for a given HD wallet (provided it's mnemonic's available)
   * @param mnemonics The HD wallet's mnemonics code for address generation
   * @param derivationIndex The derivation index for the address to be generated
   */
  public async generateAddressNew(mnemonics: string, derivationIndex: number = 1): Promise<any> {
    if (!this.isValidMnemonic(mnemonics)) throw new Error('Invalid Mnemonics');
    const seed = mnemonicToSeedSync(mnemonics);

    let hdwallet = hdkey.fromMasterSeed(seed);
    let wallet_hdpath = "m/44'/60'/0'/0/";

    let wallet = hdwallet.derivePath(wallet_hdpath + derivationIndex).getWallet();
    let address = '0x' + wallet.getAddress().toString('hex');

    let privateKey = wallet.getPrivateKey().toString('hex');
    const publicKey = wallet.getPublicKey().toString('hex');
    const checkSumAddress = wallet.getChecksumAddressString();

    return {
      address,
      privateKey,
      publicKey,
      mnemonics,
      checkSumAddress,
    };
  }

  /**
   * Get a transaction by it's hash
   * @param trxHash the transaction's hash
   */
  public async getTransaction(trxHash: string): Promise<ITransaction> {
    return (await this.provider.eth.getTransaction(trxHash)) as ITransaction;
  }

  /**
   * starts monitoring new transactions on the blockchain
   */
  public subscribeETH(): void {
    const subscription = this.socketProvider.eth.subscribe('pendingTransactions', (err) => {
      if (err) console.error(err);
    });

    subscription.on('data', async (hash) => {
      //this.emit(EventType.DATA, hash);
      //globalEmitter.emit(EventType.DATA, hash);

      // try {
      //   const tx = await this.provider.eth.getTransaction(hash);
      //     logger.info(tx);
      //   // if (tx && tx.to && vault.includes(tx.to)) {
      //   //   this.emit(EventType.NEW_PAYMENT, tx);
      //   // }
      // } catch (e) {
      //   logger.info(e)
      //   //this.emit(EventType.UNCONFIRMED, e, hash);
      // }

      setTimeout(async () => {
        try {
          globalEmitter.emit(EventType.DATA, hash);
          //const tx = await this.provider.eth.getTransaction(hash);
          //logger.info(tx);
          // if (tx && tx.to && vault.includes(tx.to)) {
          //   this.emit(EventType.NEW_PAYMENT, tx);
          // }
        } catch (e) {
          globalEmitter.emit(EventType.UNCONFIRMED, e, hash);
        }
      }, 1000 * 60 * 5);
    });
  }

  /**
   * starts the monitoring ERC20 new transactions
   */
  public async subscribeERC20(): Promise<void> {
    if (this.net === NetTypes.TEST) {
      // Instantiate token contract object with JSON ABI and address
      const tokenContract = new this.socketProvider.eth.Contract(
        allERC20ContractABI,
        config.TESTNET_TOKEN_CONTRACT_ADDRESS
      );

      //logger.info(tokenContract.methods);
      const tokenName = await tokenContract.methods.name().call();
      logger.info(`ERC20 monitoring as started on TESTNET - ${tokenName}`);

      // Generate filter options
      const options = {
        // filter: {
        //   _from:  process.env.WALLET_FROM,
        //   _to:    process.env.WALLET_TO,
        //   _value: process.env.AMOUNT
        // },
        fromBlock: 'latest',
      };

      // Subscribe to Transfer events matching filter criteria
      tokenContract.events.Transfer(options, async (error: any, event: any) => {
        if (error) {
          logger.info(error.message);
          return;
        }
        logger.info('New ERC20 transaction detected');
        globalEmitter.emit(EventType.NEW_ERC20_PAYMENT, event);

        logger.info(event.returnValues);

        //  {
        //     removed: false,
        //     logIndex: 14,
        //     transactionIndex: 8,
        //     transactionHash: '0xea36b011dbf20a0e1ba820b165991fb1478698be58ccb05ae4bc03c0ae53edad',
        //     blockHash: '0x5786149a05a6421ca716b68c4ac649295c0afadee7aa5d1da42dbd7f858a7d7c',
        //     blockNumber: 10779556,
        //     address: '0x25e5430457A033C7a0F3e55ff149A4C7371C9001',
        //     id: 'log_1b740477',
        //     returnValues: Result {
        //       '0': '0x54faee9c0447abB6f2f40F850BC12035a48f4c45',
        //       '1': '0xDBa0a1BD853d33619e19E23658D7C5116bFf4ec6',
        //       '2': '2700',
        //       _from: '0x54faee9c0447abB6f2f40F850BC12035a48f4c45',
        //       _to: '0xDBa0a1BD853d33619e19E23658D7C5116bFf4ec6',
        //       _value: '2700'
        //     },
        //     event: 'Transfer',
        //     signature: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        //     raw: {
        //       data: '0x0000000000000000000000000000000000000000000000000000000000000a8c',
        //       topics: [
        //         '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        //         '0x00000000000000000000000054faee9c0447abb6f2f40f850bc12035a48f4c45',
        //         '0x000000000000000000000000dba0a1bd853d33619e19e23658d7c5116bff4ec6'
        //       ]
        //     }
        //   }
      });
    } else {
      //using mainnet
    }
  }

  /**
   * Checks a transaction hash for ERC20 tx and decodes the contract data
   * @param hash transaction hash
   * @returns
   */
  public async decodeTransactionHashEvent(hash: string): Promise<IDecodedERC20Event | undefined> {
    try {
      abiDecoder.addABI(erc20EventABI);
      let receipt = await this.provider.eth.getTransactionReceipt(hash);
      const decodedLogs = abiDecoder.decodeLogs(receipt.logs);

      if (decodedLogs.length > 0) {
        //the transaction is an ERC20 type
        //check if event is a Transfer type only
        const filterData = this.filterLog(decodedLogs as IDecodedERC20Event[], 'transfer');

        if (filterData) {
          logger.info(filterData);
          return filterData;
        }
      }
    } catch (err) {
      logger.info(err);
    }
  }

  private filterLog(logDate: IDecodedERC20Event[], filterType: string = 'transfer'): IDecodedERC20Event | undefined {
    const filteredData = logDate.find((v) => v.name.toLowerCase() === filterType.toLowerCase());
    return filteredData;
  }

  /**
   * This checks if an address is a contract type and also supported by the platform
   * @param address   contract address
   * @returns
   */
  public filterAddressIfSupported(address: string): TToken | undefined {
    let tokenData;

    if (this.net === NetTypes.TEST) {
      const testTokens = erc20Tokens.test;
      testTokens.forEach((val) => {
        if (val.contractAddress.toLowerCase() === address.toLowerCase()) {
          tokenData = val;
        }
      });
    } else {
      const mainnetTokens = erc20Tokens.test;
    }

    return tokenData;
  }

  private balanceOf(address: string, defaultBlock?: any): Promise<string | BN> {
    return new Promise((res, rej) => {
      if (defaultBlock) {
        this.provider.eth.getBalance(address, defaultBlock, (err, balance) => {
          if (err) rej(err);
          res(balance);
        });
      } else {
        this.provider.eth.getBalance(address, (err, balance) => {
          if (err) rej(err);
          res(balance);
        });
      }
    });
  }

  private getTokenContract(token: TokenTypes, contractAddress: string, from?: string) {
    return new this.provider.eth.Contract(erc20ContractAbi[token], contractAddress, { from });
  }

  private getTokenInfoFromContractAddress(contractAddress: string) {
    return new this.provider.eth.Contract(allERC20ContractABI, contractAddress);
  }

  private contractBalanceOf(contract: any, address: string): Promise<any> {
    return new Promise((res, rej) => {
      contract.methods.balanceOf(address).call((err: any, balanceOf: any) => {
        if (err) rej(err);
        res(balanceOf);
      });
    });
  }

  private transactionCount(address: string): Promise<number> {
    return new Promise((res, rej) => {
      this.provider.eth.getTransactionCount(address, (err, count) => {
        if (err) rej(err);
        res(count);
      });
    });
  }

  private broadcastTransaction(rawTrx: string): Promise<any> {
    return new Promise((res, rej) => {
      this.provider.eth.sendSignedTransaction(rawTrx).on('receipt', (receipt) => {
        if (!receipt) rej('Broadcast Transaction Failed!');
        res(receipt);
      });
    });
  }

  private isEth(token: string): boolean {
    return token === TokenTypes.ETH;
  }

  private isValidMnemonic(phrase: string): boolean {
    return phrase.trim().split(/\s+/g).length >= 12;
  }

  /***
   * Deploys an instant forwarder contract
   *
   */
  public async deployForwarderContract(accountForDeployment: {
    address: string;
    privateKey: string;
  }): Promise<ITContractResponseData> {
    //Compile contract and get ABI and byte codes
    const forwarderContractInfo = await this.compileForwarderContract();

    if (!forwarderContractInfo) throw new Error('Error occured generating contract address');
    // Retrieve the ABI
    let abi = forwarderContractInfo.abi;
    // Retrieve the byte code
    let bytecode = forwarderContractInfo.bytecode;

    // Retrieve the ABI
    // let abi = testnetForwardContract.ABI;
    // // Retrieve the byte code
    // let bytecode = testnetForwardContract.bytecode;

    let tokenContract = new this.provider.eth.Contract(abi);

    try {
      const incrementerTx = tokenContract.deploy({
        data: bytecode,
        //arguments: [5],
      });

      //logger.info( await incrementerTx.estimateGas());

      // Sign Transacation and Send
      const createTransaction = await this.provider.eth.accounts.signTransaction(
        {
          data: incrementerTx.encodeABI(),
          //gas: await incrementerTx.estimateGas(),
          gas: 500544,
        },
        accountForDeployment.privateKey
      );

      //logger.info(createTransaction);

      if (createTransaction) {
        const rawTx = createTransaction.rawTransaction || '';
        // Send Tx and Wait for Receipt
        const createReceipt = await this.provider.eth.sendSignedTransaction(rawTx);
        //logger.info(createReceipt);

        return createReceipt as ITContractResponseData;
      }
    } catch (error) {
      logger.info(error.message);
    }

    return Promise.reject('Could not create contract address');
  }

  /**
   * For compliling the forwarder contract
   * @param fileName file name containing the forwarder contract
   * @param fnName the contract class name
   * @returns
   */
  public async compileForwarderContract(
    fileName: string = 'ForwarderBitgo.sol',
    fnName: string = 'ForwarderBitgo'
  ): Promise<
    | {
        abi: [];
        bytecode: string;
      }
    | undefined
  > {
    const sourcePath = config.CONTRACT_ROOT_PATH + '/' + fileName;
    // Get Path and Load Contract

    const source = fs.readFileSync(sourcePath, 'utf8');

    let sources: any = {};

    sources[fileName] = {
      content: source,
    };

    // Compile Contract
    const input = {
      language: 'Solidity',
      sources: sources,
      settings: {
        outputSelection: {
          '*': {
            '*': ['*'],
          },
        },
      },
    };

    try {
      const tempFile = JSON.parse(solc.compile(JSON.stringify(input), { import: this.findImports }));

      const contractFile = tempFile.contracts[fileName][fnName];

      const bytecode = contractFile.evm.bytecode.object;
      const abi = contractFile.abi;

      //logger.info(JSON.stringify(abi));

      return {
        abi,
        bytecode,
      };
    } catch (error) {
      logger.info(error.message);
    }
    //logger.info(contractFile)
  }

  private findImports(path: string) {
    const sourcePath1 = config.CONTRACT_ROOT_PATH + '/TransferHelper.sol';
    const sourcePath2 = config.CONTRACT_ROOT_PATH + '/ERC20Interface.sol';
    // Get Path and Load Contract
    const transferHelperSource = fs.readFileSync(sourcePath1, 'utf8');
    const ERC20InterfaceSource = fs.readFileSync(sourcePath2, 'utf8');

    if (path === 'TransferHelper.sol') {
      return {
        contents: transferHelperSource,
      };
    } else if (path === 'ERC20Interface.sol') {
      return {
        contents: ERC20InterfaceSource,
      };
    } else return { error: 'File not found' };
  }

  /**
   * Gets the bytcode from the controller forwarder contract owner
   * @param addressOwner
   * @returns
   */
  public async getOwnerByteCode(addressOwner?: string): Promise<string> {
    try {
      let contract;
      if (this.net === NetTypes.TEST) {
        contract = new this.provider.eth.Contract(
          testnetControllerForwarderContract.ABI as any,
          testnetControllerForwarderContract.contractAddress
        );
      } else {
        contract = new this.provider.eth.Contract(
          mainnetControllerForwarderContract.ABI as any,
          mainnetControllerForwarderContract.contractAddress
        );
      }
      const response = await contract.methods.getBytesCode(addressOwner).call();
      return response;
    } catch (error) {
      logger.error(error);
      throw new Error(error);
    }
  }

  /**
   * Generates an off-chain address using Create2 algorithm
   * @param saltHex used in generating a unique address
   * @param bytecode compiled code - bytcode of the smart contract to be deployed
   * @returns an address computed by the smart contract
   */
  public async buildCreate2Address(salt: string): Promise<string> {
    try {
      let contract;
      let byteCode;
      if (this.net === NetTypes.TEST) {
        byteCode = testnetControllerForwarderContract.contractDeployerByteCode; //Gotten from the smart contract interation with the controller
        contract = new this.provider.eth.Contract(
          testnetControllerForwarderContract.ABI as any,
          testnetControllerForwarderContract.contractAddress
        );
      } else {
        byteCode = mainnetControllerForwarderContract.contractDeployerByteCode; //Gotten from the smart contract interation with the controller
        contract = new this.provider.eth.Contract(
          mainnetControllerForwarderContract.ABI as any,
          mainnetControllerForwarderContract.contractAddress
        );
      }

      const response = await contract.methods.getAddress(byteCode, salt).call();
      return response;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Gas limit estimation for smart contract interaction
   * @param from the address to sign the transaction
   * @param to smart contract to interact with
   * @param data encoded data to be processed in smart contract
   * @returns gasLimit value
   */
  public async getGasLimit(from: string, to: string, data: any, useMultiplier: boolean = true): Promise<number> {
    const trxCount = await this.transactionCount(from);
    const nonce: unknown = this.provider.utils.toHex(trxCount);

    const trxObj = {
      nonce: nonce as number,
      to: to,
      data,
    };

    const gasLimit = await this.provider.eth.estimateGas({
      ...trxObj,
      from,
    });

    if (useMultiplier) {
      return gasLimit * 7;
    }

    return gasLimit;
  }

  /**
   * Deploys a forwarder contract that was created using Create2 algorithm
   * @param salt used in generating the create2 address
   * @returns
   */
  public async deployCreate2Address(
    salt: string,
    accountForDeployment: {
      privateKey: string;
      address: string;
    }
  ) {
    try {
      let contract;
      let byteCode;
      let contractAddress;
      if (this.net === NetTypes.TEST) {
        byteCode = testnetControllerForwarderContract.contractDeployerByteCode;
        contractAddress = testnetControllerForwarderContract.contractAddress;
        contract = new this.provider.eth.Contract(testnetControllerForwarderContract.ABI as any, contractAddress);
      } else {
        byteCode = mainnetControllerForwarderContract.contractDeployerByteCode;
        contractAddress = mainnetControllerForwarderContract.contractAddress;
        contract = new this.provider.eth.Contract(mainnetControllerForwarderContract.ABI as any, contractAddress);
      }

      const deploymentData = await contract.methods.deploy(byteCode, salt).encodeABI();

      const gasPrice = await this.getGasLimit(accountForDeployment.address, contractAddress, deploymentData);
      console.log('gasPrice for forwarder contract', gasPrice);

      // Sign Transacation and Send
      const createTransaction = await this.provider.eth.accounts.signTransaction(
        {
          data: deploymentData,
          //gas: gasPrice,
          to: contractAddress,
          gas: gasPrice,
        },
        accountForDeployment.privateKey
      );

      logger.info(createTransaction);
      console.log('createTransaction', createTransaction);

      if (createTransaction) {
        const rawTx = createTransaction.rawTransaction || '';
        // Send Tx and Wait for Receipt
        const createReceipt = await this.provider.eth.sendSignedTransaction(rawTx);
        logger.info(createReceipt);
        console.log('createReceipt', createReceipt);

        return createReceipt as ITContractResponseData;
      }

      throw new Error('Unable to deploy address');
    } catch (error) {
      console.log(error);
      throw new Error(error.message);
    }
  }

  /**
   * Change a forwarder contract destination address
   * @param contractAddress
   * @param newDestinationAddress
   * @param accountForDeployment
   * @returns
   */
  public async changeForwarderContractDestinationAddress(
    contractAddress: string,
    newDestinationAddress: string,
    accountForDeployment: {
      privateKey: string;
      address: string;
    }
  ) {
    try {
      const contract = this.getContractInstanceForForwarder(contractAddress);

      const deploymentData = await contract.methods.changeERC20Parent(newDestinationAddress).encodeABI();
      const gasPrice = await this.getGasLimit(accountForDeployment.address, contractAddress, deploymentData);

      // Sign Transacation and Send
      const createTransaction = await this.provider.eth.accounts.signTransaction(
        {
          data: deploymentData,
          //gas: gasPrice,
          to: contractAddress,
          gas: gasPrice,
        },
        accountForDeployment.privateKey
      );

      // console.log("createTransaction",createTransaction)

      if (createTransaction) {
        const rawTx = createTransaction.rawTransaction || '';
        // Send Tx and Wait for Receipt
        const createReceipt = await this.provider.eth.sendSignedTransaction(rawTx);
        //logger.info(createReceipt);
        console.log('createReceipt', createReceipt);

        return createReceipt as ITContractResponseData;
      }

      throw new Error('Unable to deploy address');
    } catch (error) {
      console.log(error);
      throw new Error(error.message);
    }
  }

  /**
   * Flush ETH from a forwarder contract address
   * @param contractAddress
   * @param accountForDeployment
   * @returns
   */
  public async flushETH(
    contractAddress: string,
    accountForDeployment: {
      privateKey: string;
      address: string;
    }
  ) {
    try {
      const contract = this.getContractInstanceForForwarder(contractAddress);

      const deploymentData = await contract.methods.flush().encodeABI();
      const gasPrice = await this.getGasLimit(accountForDeployment.address, contractAddress, deploymentData);

      // Sign Transacation and Send
      const createTransaction = await this.provider.eth.accounts.signTransaction(
        {
          data: deploymentData,
          //gas: gasPrice,
          to: contractAddress,
          gas: gasPrice,
        },
        accountForDeployment.privateKey
      );

      // console.log("createTransaction",createTransaction)

      if (createTransaction) {
        const rawTx = createTransaction.rawTransaction || '';
        // Send Tx and Wait for Receipt
        const createReceipt = await this.provider.eth.sendSignedTransaction(rawTx);
        //logger.info(createReceipt);
        console.log('createReceipt', createReceipt);

        return createReceipt as ITContractResponseData;
      }

      throw new Error('Unable to deploy address');
    } catch (error) {
      console.log(error);
      throw new Error(error.message);
    }
  }

  /**
   * Flush ETH from a forwarder contract address
   * @param contractAddress the account to be flushed
   * @param ERC20ContractAddress  ERC 20 contract address
   * @param accountForDeployment deployment credentials
   * @returns
   */
  public async flushERC20Account(
    ERC20ContractAddress: string,
    contractAddress: string,
    accountForDeployment: {
      privateKey: string;
      address: string;
    }
  ) {
    try {
      const contract = this.getContractInstanceForForwarder(contractAddress);

      const deploymentData = await contract.methods.flushERC20Tokens(ERC20ContractAddress).encodeABI();
      const gasPrice = await this.getGasLimit(accountForDeployment.address, contractAddress, deploymentData);

      // Sign Transacation and Send
      const createTransaction = await this.provider.eth.accounts.signTransaction(
        {
          data: deploymentData,
          //gas: gasPrice,
          to: contractAddress,
          gas: gasPrice,
        },
        accountForDeployment.privateKey
      );

      // console.log("createTransaction",createTransaction)

      if (createTransaction) {
        const rawTx = createTransaction.rawTransaction || '';
        // Send Tx and Wait for Receipt
        const createReceipt = await this.provider.eth.sendSignedTransaction(rawTx);
        //logger.info(createReceipt);
        console.log('createReceipt', createReceipt);

        return createReceipt as ITContractResponseData;
      }

      throw new Error('Unable to deploy address');
    } catch (error) {
      console.log(error);
      throw new Error(error.message);
    }
  }

  public async getForwarderParentAddress(contractAddress: string) {
    try {
      const contract = this.getContractInstanceForForwarder(contractAddress);
      const deploymentData = await contract.methods.destinationAddress().call();
      return deploymentData;
    } catch (error) {
      console.log(error);
      throw new Error(error.message);
    }
  }

  private getContractInstanceForForwarder(contractAddress: string) {
    let contract;
    if (this.net === NetTypes.TEST) {
      contract = new this.provider.eth.Contract(testnetNewForwardContract.ABI as any, contractAddress);
    } else {
      contract = new this.provider.eth.Contract(mainnetForwardContract.ABI as any, contractAddress);
    }

    return contract;
  }
}
