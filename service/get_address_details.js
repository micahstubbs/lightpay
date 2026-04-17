const {address} = require('bitcoinjs-lib');

const publicKeyHashLength = 20;
const taprootDataLength = 32;
const witnessScriptHashLength = 32;

const testnetBech32Prefixes = new Set(['tb', 'bcrt']);

const legacyVersionTypes = {
  0:   {type: 'p2pkh', is_testnet: false},
  5:   {type: 'p2sh',  is_testnet: false},
  111: {type: 'p2pkh', is_testnet: true},
  196: {type: 'p2sh',  is_testnet: true},
};

/** Get address details

  Recognises:
  - Legacy base58 addresses: P2PKH and P2SH, mainnet and testnet
  - Bech32 witness v0: P2WPKH (20-byte) and P2WSH (32-byte)
  - Bech32m witness v1: P2TR (32-byte, BIP-350)

  {
    address: <Address String>
  }

  @returns via cbk
  {
    [data]: <Witness Address Data Hex String>
    [hash]: <Address Hash Data Hex String>
    is_testnet: <Is Testnet Address Bool>
    [prefix]: <Witness Prefix String>
    type: <Address Type String>
    version: <Address Version Number>
  }
*/
module.exports = (args, cbk) => {
  if (!args.address) {
    return cbk([400, 'ExpectedAddress']);
  }

  let base58Address;
  try { base58Address = address.fromBase58Check(args.address); }
  catch (e) { base58Address = null; }

  if (base58Address) {
    const info = legacyVersionTypes[base58Address.version];

    if (!info) {
      return cbk([400, 'UnknownAddressVersion']);
    }

    return cbk(null, {
      type: info.type,
      data: null,
      hash: base58Address.hash.toString('hex'),
      is_testnet: info.is_testnet,
      prefix: undefined,
      version: base58Address.version,
    });
  }

  let bech32Address;
  try { bech32Address = address.fromBech32(args.address); }
  catch (e) { bech32Address = null; }

  if (!bech32Address) {
    return cbk([400, 'ExpectedValidAddress']);
  }

  const isTestnet = testnetBech32Prefixes.has(bech32Address.prefix);
  let type;

  switch (bech32Address.version) {
  case 0:
    if (bech32Address.data.length === publicKeyHashLength) {
      type = 'p2wpkh';
    } else if (bech32Address.data.length === witnessScriptHashLength) {
      type = 'p2wsh';
    } else {
      return cbk([400, 'UnknownWitnessProgramLength']);
    }
    break;

  case 1:
    if (bech32Address.data.length !== taprootDataLength) {
      return cbk([400, 'UnknownWitnessProgramLength']);
    }
    type = 'p2tr';
    break;

  default:
    return cbk([400, 'UnknownAddressVersion']);
  }

  return cbk(null, {
    type,
    data: bech32Address.data.toString('hex'),
    hash: null,
    is_testnet: isTestnet,
    prefix: bech32Address.prefix,
    version: bech32Address.version,
  });
};
