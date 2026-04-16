const {crypto, networks, payments} = require('bitcoinjs-lib');
const {ECPairFactory} = require('ecpair');
const ecc = require('tiny-secp256k1');

const ECPair = ECPairFactory(ecc);
const {hash160} = crypto;

/** Generate a keypair

  {
    network: <Network Name String>
  }

  @throws
  <Error> on invalid arguments

  @returns
  {
    p2pkh_address: <Pay to Public Key Hash Base58 Address String>
    pk_hash: <Public Key Hash String>
    private_key: <Private Key WIF Encoded String>
    public_key: <Public Key Hex String>
  }
*/
module.exports = ({network}) => {
  if (!network) {
    throw new Error('ExpectedNetwork');
  }

  const net = network === 'regtest' ? 'testnet' : network;
  const btcNetwork = networks[net];

  const keyPair = ECPair.makeRandom({network: btcNetwork});

  const {address} = payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: btcNetwork,
  });

  return {
    p2pkh_address: address,
    pk_hash: hash160(keyPair.publicKey).toString('hex'),
    private_key: keyPair.toWIF(),
    public_key: keyPair.publicKey.toString('hex'),
  };
};
