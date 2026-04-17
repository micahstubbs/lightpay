const {createHash, randomBytes} = require('crypto');
const {networks} = require('bitcoinjs-lib');
const {encode, sign} = require('bolt11');
const {ECPairFactory} = require('ecpair');
const ecc = require('tiny-secp256k1');

const ECPair = ECPairFactory(ecc);
const {testnet} = networks;

const preimageByteCount = 32;

/** Generate a fake invoice payment preimage and payment hash pair

  {
    private_key: <WIF Encoded Private Key String>
  }

  @returns via cbk
  {
    invoice: <Lightning Invoice String>
    payment_hash: <Payment Hash Hex String>
    payment_preimage: <Payment Preimage Hex String>
  }
*/
module.exports = (args, cbk) => {
  if (!args.private_key) {
    return cbk([0, 'Expected private key']);
  }

  const keyPair = ECPair.fromWIF(args.private_key, testnet);
  const preimage = randomBytes(preimageByteCount);

  // The invoice requires a payment hash and is signed with a private key.
  const payHash = createHash('sha256').update(preimage).digest('hex');
  const privKey = Buffer.from(keyPair.privateKey).toString('hex');

  const invoice = encode({tags: [{tagName: 'payment_hash', data: payHash}]});

  return cbk(null, {
    invoice: sign(invoice, privKey).paymentRequest,
    payment_hash: payHash,
    payment_preimage: preimage.toString('hex'),
  });
};
