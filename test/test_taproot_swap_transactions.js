const {createHash} = require('crypto');
const {test} = require('tap');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
bitcoin.initEccLib(ecc);
const {ECPairFactory} = require('ecpair');
const varuint = require('varuint-bitcoin');

const taprootClaimTransaction = require('./../swaps/taproot_claim_transaction');
const taprootRefundTransaction = require('./../swaps/taproot_refund_transaction');
const taprootSwapAddress = require('./../swaps/taproot_swap_address');

const ECPair = ECPairFactory(ecc);

const network = bitcoin.networks.testnet;

const destKey = ECPair.fromPrivateKey(
  Buffer.from('0101010101010101010101010101010101010101010101010101010101010101', 'hex'),
  {network},
);
const refundKey = ECPair.fromPrivateKey(
  Buffer.from('0202020202020202020202020202020202020202020202020202020202020202', 'hex'),
  {network},
);

const destXOnly = Buffer.from(destKey.publicKey).subarray(1, 33).toString('hex');
const refundXOnly = Buffer.from(refundKey.publicKey).subarray(1, 33).toString('hex');
const preimage = Buffer.alloc(32, 0x03);
const paymentHash = createHash('sha256').update(preimage).digest().toString('hex');
const timeout = 700;
const fundingTokens = 100000;
const feeRate = 10;
const sweepAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

const utxos = [{
  tokens: fundingTokens,
  transaction_id: '00'.repeat(32),
  vout: 0,
}];

const tapleafHash = script => {
  const enc = Buffer.concat([
    Buffer.from([0xc0]),
    Buffer.from(varuint.encode(script.length)),
    script,
  ]);
  return bitcoin.crypto.taggedHash('TapLeaf', enc);
};

const swapOutputScript = () => {
  const info = taprootSwapAddress({
    destination_x_only_public_key: destXOnly,
    network: 'testnet',
    payment_hash: paymentHash,
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
  });
  return Buffer.from(info.output_script, 'hex');
};

test('claim transaction: witness shape and Schnorr sig verifies', t => {
  const result = taprootClaimTransaction({
    current_block_height: 600,
    destination: sweepAddress,
    fee_tokens_per_vbyte: feeRate,
    network: 'testnet',
    payment_hash: paymentHash,
    preimage: preimage.toString('hex'),
    private_key: destKey.toWIF(),
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
    utxos,
  });

  const tx = bitcoin.Transaction.fromHex(result.transaction);

  t.equal(tx.ins.length, 1, 'single input');
  t.equal(tx.outs.length, 1, 'single output');
  t.equal(tx.outs[0].value < fundingTokens, true, 'output less than input (fee)');
  t.equal(tx.version, 2);

  const witness = tx.ins[0].witness;
  t.equal(witness.length, 4, 'witness has 4 elements [sig, preimage, script, control]');
  t.equal(witness[0].length, 64, 'Schnorr sig is 64 bytes (SIGHASH_DEFAULT)');
  t.equal(witness[1].length, 32, 'preimage is 32 bytes');
  t.equal(witness[3].length, 65, 'control block is 65 bytes for 2-leaf tree');

  // Verify the Schnorr signature.
  const claimScript = witness[2];
  const leafHash = tapleafHash(claimScript);
  const outScript = swapOutputScript();
  const sighash = tx.hashForWitnessV1(0, [outScript], [fundingTokens], 0, leafHash);
  const ok = ecc.verifySchnorr(
    sighash,
    Buffer.from(destXOnly, 'hex'),
    witness[0],
  );

  t.ok(ok, 'Schnorr signature verifies against destination x-only pubkey');
  t.end();
});

test('claim witness preimage matches payment_hash via SHA256', t => {
  const result = taprootClaimTransaction({
    current_block_height: 600,
    destination: sweepAddress,
    fee_tokens_per_vbyte: feeRate,
    network: 'testnet',
    payment_hash: paymentHash,
    preimage: preimage.toString('hex'),
    private_key: destKey.toWIF(),
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
    utxos,
  });

  const tx = bitcoin.Transaction.fromHex(result.transaction);
  const witnessPreimage = tx.ins[0].witness[1];
  const hashed = createHash('sha256').update(witnessPreimage).digest('hex');
  t.equal(hashed, paymentHash);
  t.end();
});

test('refund transaction: CLTV locktime, non-final sequence, Schnorr verifies', t => {
  const result = taprootRefundTransaction({
    destination: sweepAddress,
    destination_x_only_public_key: destXOnly,
    fee_tokens_per_vbyte: feeRate,
    network: 'testnet',
    payment_hash: paymentHash,
    private_key: refundKey.toWIF(),
    timelock_block_height: timeout,
    utxos,
  });

  const tx = bitcoin.Transaction.fromHex(result.transaction);

  t.equal(tx.locktime, timeout, 'nLockTime = timelock_block_height');
  t.equal(tx.ins[0].sequence, 0xfffffffe, 'non-final sequence (CLTV enforceable)');

  const witness = tx.ins[0].witness;
  t.equal(witness.length, 3, 'refund witness has 3 elements [sig, script, control]');
  t.equal(witness[0].length, 64, 'Schnorr sig is 64 bytes');

  const refundScript = witness[1];
  const leafHash = tapleafHash(refundScript);
  const outScript = swapOutputScript();
  const sighash = tx.hashForWitnessV1(0, [outScript], [fundingTokens], 0, leafHash);
  const ok = ecc.verifySchnorr(
    sighash,
    Buffer.from(refundXOnly, 'hex'),
    witness[0],
  );
  t.ok(ok, 'Schnorr signature verifies against refund x-only pubkey');
  t.end();
});

test('claim fails when fee rate makes output non-positive', t => {
  t.throws(
    () => taprootClaimTransaction({
      current_block_height: 600,
      destination: sweepAddress,
      fee_tokens_per_vbyte: 1e9, // absurdly high
      network: 'testnet',
      payment_hash: paymentHash,
      preimage: preimage.toString('hex'),
      private_key: destKey.toWIF(),
      refund_x_only_public_key: refundXOnly,
      timeout_block_height: timeout,
      utxos,
    }),
    /FeesTooHighToClaim/,
  );
  t.end();
});

test('refund fails when fee rate makes output non-positive', t => {
  t.throws(
    () => taprootRefundTransaction({
      destination: sweepAddress,
      destination_x_only_public_key: destXOnly,
      fee_tokens_per_vbyte: 1e9,
      network: 'testnet',
      payment_hash: paymentHash,
      private_key: refundKey.toWIF(),
      timelock_block_height: timeout,
      utxos,
    }),
    /RefundOutputTooSmall/,
  );
  t.end();
});
