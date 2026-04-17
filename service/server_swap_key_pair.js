const {mnemonicToSeedSync, validateMnemonic} = require('bip39');
const {networks} = require('bitcoinjs-lib');
const {BIP32Factory} = require('bip32');
const ecc = require('tiny-secp256k1');

const bip32 = BIP32Factory(ecc);

const minIndex = 0;
const maxIndex = 4294967295;

// mnemonicToSeedSync runs 2048 rounds of PBKDF2 and was being called on
// every swap operation, blocking the event loop for ~100ms each time.
// Cache the root node keyed by (mnemonic, network) so we do this once.
const rootCache = new Map();

const cacheKey = (mnemonic, network) => `${network}|${mnemonic}`;

const getRoot = (mnemonic, networkName) => {
  const key = cacheKey(mnemonic, networkName);
  const cached = rootCache.get(key);

  if (cached) {
    return cached;
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, networks[networkName]);

  rootCache.set(key, root);

  return root;
};

/** Server swap key pair

  {
    index: <Key Index Number>
    network: <Network Name String>
  }

  @throws
  <Error> on invalid index, network, or missing/invalid OCW_CLAIM_BIP39_SEED

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

  const {OCW_CLAIM_BIP39_SEED} = process.env;

  if (!validateMnemonic(OCW_CLAIM_BIP39_SEED || '')) {
    throw new Error('ExpectedValidMnemonic');
  }

  const root = getRoot(OCW_CLAIM_BIP39_SEED, network);
  const child = root.derivePath(`m/0'/0/${index}`);

  return {
    private_key: child.toWIF(),
    public_key: child.publicKey.toString('hex'),
  };
};
