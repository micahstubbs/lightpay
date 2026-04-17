// @ts-check
require('./ecc_init');

const bip65Encode = require('bip65').encode;
const bitcoin = require('bitcoinjs-lib');
const {ECPairFactory} = require('ecpair');
const ecc = require('tiny-secp256k1');

const taprootSwapAddress = require('./taproot_swap_address');

const ECPair = ECPairFactory(ecc);
const {Transaction, crypto, script: bscript} = bitcoin;
const {taggedHash} = crypto;

const {TAPLEAF_VERSION} = taprootSwapAddress;

const hashTypeDefault = 0x00; // SIGHASH_DEFAULT (implicit; Schnorr sig = 64 bytes)
const dummySigByteLength = 64;
const preimageByteLength = 32;
const sequenceFinal = 0xffffffff;
const sequenceNonFinal = 0xfffffffe;
const feeEstimateFallbackVbytes = 150; // ~vsize upper bound for taproot HTLC claim

const encodeTapleaf = ({script, version}) => {
  const prefix = Buffer.from([version]);
  const lenPrefix = bscript.number.encode(script.length);
  // BIP-341: tagged hash of (version || compact_size(script) || script)
  const varInt = require('varuint-bitcoin').encode(script.length);
  return Buffer.concat([prefix, Buffer.from(varInt), script]);
};

const tapleafHash = ({script, version}) => {
  return taggedHash('TapLeaf', encodeTapleaf({script, version}));
};

/** Build a Taproot swap claim transaction (script-path spend).

  Spends a single input (the funding UTXO) via the claim leaf of the
  TapTree defined in taproot_swap_address. Witness order (bottom→top):

    <destination_schnorr_sig>
    <preimage>
    <claim_script>
    <claim_control_block>

  The signature is BIP-340 Schnorr with SIGHASH_DEFAULT over the
  BIP-341 tapscript sigmsg (ext_flag=1, key_version=0, annex absent).

  {
    current_block_height: <Current Best Block Height for Locktime Number>
    destination: <Sweep Destination Address String>
    fee_tokens_per_vbyte: <Fee Rate Tokens Per Virtual Byte Number>
    network: 'mainnet' | 'regtest' | 'testnet'
    payment_hash: <32-byte SHA256 Payment Hash Hex String>
    preimage: <32-byte Preimage Hex String>
    private_key: <Destination Private Key WIF String>
    refund_x_only_public_key: <32-byte hex string>
    timeout_block_height: <CLTV Locktime Number (required for tree)>
    utxos: [{
      tokens: <Tokens Number>
      transaction_id: <Funding Transaction Id Hex String>
      vout: <Funding Output Index Number>
    }]
  }

  @throws <Error>

  @returns
  {
    transaction: <Signed Claim Transaction Hex String>
  }
*/
module.exports = args => {
  if (!args.current_block_height) { throw new Error('ExpectedCurrentBlockHeight'); }
  if (!args.destination) { throw new Error('ExpectedSweepDestination'); }
  if (!args.fee_tokens_per_vbyte) { throw new Error('ExpectedFeeRate'); }
  if (!args.network) { throw new Error('ExpectedNetwork'); }
  if (!args.payment_hash) { throw new Error('ExpectedPaymentHash'); }
  if (!args.preimage) { throw new Error('ExpectedPreimage'); }
  if (!args.private_key) { throw new Error('ExpectedPrivateKey'); }
  if (!args.refund_x_only_public_key) { throw new Error('ExpectedRefundXOnly'); }
  if (!args.timeout_block_height) { throw new Error('ExpectedTimeout'); }
  if (!Array.isArray(args.utxos) || !args.utxos.length) { throw new Error('ExpectedUtxos'); }

  const preimage = Buffer.from(args.preimage, 'hex');
  if (preimage.length !== preimageByteLength) { throw new Error('InvalidPreimageLength'); }

  const network = bitcoin.networks[args.network === 'mainnet' ? 'bitcoin' : args.network];
  // Accept a WIF from any of our supported networks — validate later via signature.
  const keyPair = ECPair.fromWIF(args.private_key, [
    bitcoin.networks.bitcoin,
    bitcoin.networks.testnet,
    bitcoin.networks.regtest,
  ]);

  // Schnorr requires the x-only pubkey (drop the 1-byte parity prefix).
  const destinationXOnly = Buffer.from(keyPair.publicKey).subarray(1, 33);

  const addressInfo = taprootSwapAddress({
    destination_x_only_public_key: destinationXOnly.toString('hex'),
    network: args.network,
    payment_hash: args.payment_hash,
    refund_x_only_public_key: args.refund_x_only_public_key,
    timeout_block_height: args.timeout_block_height,
  });

  const claimScript = Buffer.from(addressInfo.claim_script, 'hex');
  const outputScript = Buffer.from(addressInfo.output_script, 'hex');
  const controlBlock = Buffer.from(addressInfo.claim_control_block, 'hex');

  const totalInputTokens = args.utxos.reduce((sum, u) => sum + u.tokens, 0);

  // Build the unsigned tx once to get the sigmsg for each input.
  const tx = new Transaction();
  tx.version = 2;
  tx.locktime = bip65Encode({blocks: args.current_block_height});

  args.utxos.forEach(u => {
    const txidBytes = Buffer.from(u.transaction_id, 'hex').reverse();
    tx.addInput(txidBytes, u.vout, sequenceFinal);
  });

  // First pass: estimate fee with a dummy 64-byte signature in the witness.
  const leafHash = tapleafHash({script: claimScript, version: TAPLEAF_VERSION});
  const dummySig = Buffer.alloc(dummySigByteLength, 0);
  const dummyWitness = [dummySig, preimage, claimScript, controlBlock];
  args.utxos.forEach((_, i) => tx.setWitness(i, dummyWitness));

  // Add destination output with provisional amount; refined after we know fee.
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
    throw new Error('FeesTooHighToClaim');
  }

  // Replace the provisional output amount.
  tx.outs[0].value = sweepTokens;

  // Second pass: sign each input.
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

    tx.setWitness(i, [sigBytes, preimage, claimScript, controlBlock]);
  });

  return {transaction: tx.toHex()};
};
