const {generateMnemonic, mnemonicToSeed, validateMnemonic} = require('bip39');
const {networks} = require('bitcoinjs-lib');
const {BIP32Factory} = require('bip32');
const ecc = require('tiny-secp256k1');

const bip32 = BIP32Factory(ecc);

const {OCW_CLAIM_BIP39_SEED} = process.env;

const minIndex = 0;
const maxIndex = 4294967295;

if (!validateMnemonic(OCW_CLAIM_BIP39_SEED)) {
  console.log([500, 'ExpectedValidMnemonic', generateMnemonic()]);
  process.exit();
}

/** Server swap key pair

  {
    index: <Key Index Number>
    network: <Network Name String>
  }

  @throws
  <Error> on invalid index or network

  @returns
  {
    private_key: <Private Key WIF String>
    public_key: <Public Key Hex String>
  }
*/
module.exports = ({index, network}) => {
  if (index === undefined || index < minIndex || index > maxIndex) {
    throw new Error('ExpectedValidIndex');
  }

  if (!network || !networks[network]) {
    throw new Error('ExpectedValidNetwork');
  }

  const seed = mnemonicToSeed(OCW_CLAIM_BIP39_SEED);

  const root = bip32.fromSeed(seed, networks[network]);

  const child = root.derivePath(`m/0'/0/${index}`);

  return {
    private_key: child.toWIF(),
    public_key: child.publicKey.toString('hex'),
  };
};
