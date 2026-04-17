const {opcodes, script} = require('bitcoinjs-lib');

const hashByteLength = 32;
const preimageByteLength = 32;
const xOnlyPubkeyByteLength = 32;

/** Build the two Taproot swap script leaves.

  BIP-341 script-path HTLC. Both leaves are TapLeaf version 0xc0.

  Claim leaf (destination reveals preimage + signs):
    OP_SIZE <0x20> OP_EQUALVERIFY
    OP_SHA256 <payment_hash> OP_EQUALVERIFY
    <destination_x_only_pubkey> OP_CHECKSIG

  Refund leaf (refund party after timeout):
    <timeout_block_height> OP_CHECKLOCKTIMEVERIFY OP_DROP
    <refund_x_only_pubkey> OP_CHECKSIG

  See docs/taproot-swap-design.md for the full rationale.

  {
    destination_x_only_public_key: <32-byte hex string>
    payment_hash: <32-byte SHA256 Payment Hash Hex String>
    refund_x_only_public_key: <32-byte hex string>
    timeout_block_height: <CLTV Locktime Number>
  }

  @throws <Error> on invalid arguments

  @returns
  {
    claim_script: <Tapscript Buffer> (Claim leaf)
    refund_script: <Tapscript Buffer> (Refund leaf)
  }
*/
module.exports = args => {
  if (!args.destination_x_only_public_key) {
    throw new Error('ExpectedDestinationXOnlyPublicKey');
  }

  if (!args.payment_hash) {
    throw new Error('ExpectedPaymentHash');
  }

  if (!args.refund_x_only_public_key) {
    throw new Error('ExpectedRefundXOnlyPublicKey');
  }

  if (!args.timeout_block_height) {
    throw new Error('ExpectedTimeoutBlockHeight');
  }

  const dst = Buffer.from(args.destination_x_only_public_key, 'hex');
  const refund = Buffer.from(args.refund_x_only_public_key, 'hex');
  const hash = Buffer.from(args.payment_hash, 'hex');

  if (dst.length !== xOnlyPubkeyByteLength) {
    throw new Error('InvalidDestinationXOnlyPublicKeyLength');
  }

  if (refund.length !== xOnlyPubkeyByteLength) {
    throw new Error('InvalidRefundXOnlyPublicKeyLength');
  }

  if (hash.length !== hashByteLength) {
    throw new Error('InvalidPaymentHashLength');
  }

  const claimScript = script.compile([
    opcodes.OP_SIZE,
    script.number.encode(preimageByteLength),
    opcodes.OP_EQUALVERIFY,
    opcodes.OP_SHA256,
    hash,
    opcodes.OP_EQUALVERIFY,
    dst,
    opcodes.OP_CHECKSIG,
  ]);

  const refundScript = script.compile([
    script.number.encode(args.timeout_block_height),
    opcodes.OP_CHECKLOCKTIMEVERIFY,
    opcodes.OP_DROP,
    refund,
    opcodes.OP_CHECKSIG,
  ]);

  return {
    claim_script: claimScript,
    refund_script: refundScript,
  };
};
