// @ts-check
require('./ecc_init');

const bip65Encode = require('bip65').encode;
const bitcoin = require('bitcoinjs-lib');
const {ECPairFactory} = require('ecpair');
const ecc = require('tiny-secp256k1');

const taprootSwapAddress = require('./taproot_swap_address');

const ECPair = ECPairFactory(ecc);
const {Transaction, crypto} = bitcoin;
const {taggedHash} = crypto;

const {TAPLEAF_VERSION} = taprootSwapAddress;

const hashTypeDefault = 0x00;
const dummySigByteLength = 64;
// Non-final (enables CLTV check) but high enough to avoid RBF signal.
const sequenceForCltv = 0xfffffffe;
const feeEstimateFallbackVbytes = 120;

const tapleafHash = ({script, version}) => {
  const varint = require('varuint-bitcoin').encode(script.length);
  return taggedHash(
    'TapLeaf',
    Buffer.concat([Buffer.from([version]), Buffer.from(varint), script]),
  );
};

/** Build a Taproot swap refund transaction (script-path spend, refund leaf).

  Spends the funding UTXO via the refund leaf after the CLTV timeout.
  Witness (bottom→top):

    <refund_schnorr_sig>
    <refund_script>
    <refund_control_block>

  nLockTime is set to timelock_block_height; input sequence is 0xfffffffe
  (non-final so CLTV is enforced, but not RBF-signalling — LightPay's
  refund flow expects finality).

  {
    destination: <Sweep Destination Address String>
    destination_x_only_public_key: <32-byte hex string>
    fee_tokens_per_vbyte: <Fee Rate Tokens Per Virtual Byte Number>
    network: 'mainnet' | 'regtest' | 'testnet'
    payment_hash: <32-byte SHA256 Payment Hash Hex String>
    private_key: <Refund Private Key WIF String>
    timelock_block_height: <CLTV Locktime Number>
    utxos: [{
      tokens: <Tokens Number>
      transaction_id: <Funding Transaction Id Hex String>
      vout: <Funding Output Index Number>
    }]
  }

  @throws <Error>

  @returns
  {
    transaction: <Signed Refund Transaction Hex String>
  }
*/
module.exports = args => {
  if (!args.destination) { throw new Error('ExpectedSweepDestination'); }
  if (!args.destination_x_only_public_key) { throw new Error('ExpectedDestinationXOnly'); }
  if (!args.fee_tokens_per_vbyte) { throw new Error('ExpectedFeeRate'); }
  if (!args.network) { throw new Error('ExpectedNetwork'); }
  if (!args.payment_hash) { throw new Error('ExpectedPaymentHash'); }
  if (!args.private_key) { throw new Error('ExpectedPrivateKey'); }
  if (!args.timelock_block_height) { throw new Error('ExpectedTimelockHeight'); }
  if (!Array.isArray(args.utxos) || !args.utxos.length) { throw new Error('ExpectedUtxos'); }

  const network = bitcoin.networks[args.network === 'mainnet' ? 'bitcoin' : args.network];
  const keyPair = ECPair.fromWIF(args.private_key, [
    bitcoin.networks.bitcoin,
    bitcoin.networks.testnet,
    bitcoin.networks.regtest,
  ]);
  const refundXOnly = Buffer.from(keyPair.publicKey).subarray(1, 33);

  const addressInfo = taprootSwapAddress({
    destination_x_only_public_key: args.destination_x_only_public_key,
    network: args.network,
    payment_hash: args.payment_hash,
    refund_x_only_public_key: refundXOnly.toString('hex'),
    timeout_block_height: args.timelock_block_height,
  });

  const refundScript = Buffer.from(addressInfo.refund_script, 'hex');
  const outputScript = Buffer.from(addressInfo.output_script, 'hex');
  const controlBlock = Buffer.from(addressInfo.refund_control_block, 'hex');

  const totalInputTokens = args.utxos.reduce((sum, u) => sum + u.tokens, 0);

  const tx = new Transaction();
  tx.version = 2;
  tx.locktime = bip65Encode({blocks: args.timelock_block_height});

  args.utxos.forEach(u => {
    const txidBytes = Buffer.from(u.transaction_id, 'hex').reverse();
    tx.addInput(txidBytes, u.vout, sequenceForCltv);
  });

  const leafHash = tapleafHash({script: refundScript, version: TAPLEAF_VERSION});
  const dummySig = Buffer.alloc(dummySigByteLength, 0);
  const dummyWitness = [dummySig, refundScript, controlBlock];
  args.utxos.forEach((_, i) => tx.setWitness(i, dummyWitness));

  tx.addOutput(
    bitcoin.address.toOutputScript(args.destination, network),
    totalInputTokens,
  );

  const estimatedVbytes = tx.virtualSize();
  const fee = Math.max(
    Math.ceil(estimatedVbytes * args.fee_tokens_per_vbyte),
    feeEstimateFallbackVbytes * args.fee_tokens_per_vbyte,
  );
  const sweepTokens = totalInputTokens - fee;

  if (sweepTokens <= 0) {
    throw new Error('RefundOutputTooSmall');
  }

  tx.outs[0].value = sweepTokens;

  const prevOutScripts = args.utxos.map(() => outputScript);
  const prevOutValues = args.utxos.map(u => u.tokens);

  args.utxos.forEach((u, i) => {
    const sighash = tx.hashForWitnessV1(
      i,
      prevOutScripts,
      prevOutValues,
      hashTypeDefault,
      leafHash,
    );

    const sigBytes = Buffer.from(
      ecc.signSchnorr(sighash, keyPair.privateKey),
    );

    tx.setWitness(i, [sigBytes, refundScript, controlBlock]);
  });

  return {transaction: tx.toHex()};
};
