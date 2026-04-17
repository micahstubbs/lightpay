const {test} = require('tap');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
bitcoin.initEccLib(ecc);

const taprootSwapAddress = require('./../swaps/taproot_swap_address');
const taprootSwapScript = require('./../swaps/taproot_swap_script');

// Fixed test vectors: deterministic inputs → deterministic outputs.
const destXOnly = '33d1b09a8c2e43d5e9ca6f1f0b72c7e4e4c2c15b5b0ed4a3a1b6e2b9f2e3d4c5b';
const refundXOnly = 'b5a5b4e3e1f2a3b1c5b4a3c2d1e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8';
const paymentHash = '0000000000000000000000000000000000000000000000000000000000000000';
const timeout = 500;

test('taproot address is a P2TR (bech32m) address', t => {
  const r = taprootSwapAddress({
    destination_x_only_public_key: destXOnly,
    network: 'testnet',
    payment_hash: paymentHash,
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
  });

  t.ok(r.address.startsWith('tb1p'), 'testnet bech32m prefix');
  t.end();
});

test('taproot address is deterministic for identical inputs', t => {
  const args = {
    destination_x_only_public_key: destXOnly,
    network: 'testnet',
    payment_hash: paymentHash,
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
  };

  const r1 = taprootSwapAddress(args);
  const r2 = taprootSwapAddress(args);

  t.equal(r1.address, r2.address);
  t.equal(r1.claim_script, r2.claim_script);
  t.equal(r1.refund_script, r2.refund_script);
  t.equal(r1.claim_control_block, r2.claim_control_block);
  t.equal(r1.refund_control_block, r2.refund_control_block);
  t.end();
});

test('taproot address differs on testnet vs mainnet', t => {
  const base = {
    destination_x_only_public_key: destXOnly,
    payment_hash: paymentHash,
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
  };

  const testnet = taprootSwapAddress({...base, network: 'testnet'});
  const mainnet = taprootSwapAddress({...base, network: 'mainnet'});

  t.ok(testnet.address.startsWith('tb1p'));
  t.ok(mainnet.address.startsWith('bc1p'));
  t.not(testnet.address, mainnet.address);
  // Scripts themselves are network-independent
  t.equal(testnet.claim_script, mainnet.claim_script);
  t.equal(testnet.refund_script, mainnet.refund_script);
  t.end();
});

test('claim script has expected BIP-342 opcodes', t => {
  const {claim_script} = taprootSwapScript({
    destination_x_only_public_key: destXOnly,
    payment_hash: paymentHash,
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
  });

  const asm = bitcoin.script.toASM(claim_script);
  t.match(asm, /OP_SIZE/, 'has preimage size check');
  t.match(asm, /OP_SHA256/, 'uses OP_SHA256 hashlock');
  t.match(asm, /OP_CHECKSIG$/, 'ends with CHECKSIG');
  t.end();
});

test('refund script has CLTV and CHECKSIG', t => {
  const {refund_script} = taprootSwapScript({
    destination_x_only_public_key: destXOnly,
    payment_hash: paymentHash,
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
  });

  const asm = bitcoin.script.toASM(refund_script);
  t.match(asm, /OP_CHECKLOCKTIMEVERIFY/, 'has CLTV');
  t.match(asm, /OP_DROP/, 'drops timeout');
  t.match(asm, /OP_CHECKSIG$/, 'ends with CHECKSIG');
  t.end();
});

test('control blocks have correct length for a 2-leaf tree', t => {
  const r = taprootSwapAddress({
    destination_x_only_public_key: destXOnly,
    network: 'testnet',
    payment_hash: paymentHash,
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
  });

  // BIP-341: 1 (version|parity) + 32 (internal key) + 32·(depth) bytes
  // For a 2-leaf tree, depth = 1, so total = 65 bytes = 130 hex chars.
  t.equal(r.claim_control_block.length, 130);
  t.equal(r.refund_control_block.length, 130);
  t.end();
});

test('control block version byte is tapleaf 0xc0 (with parity)', t => {
  const r = taprootSwapAddress({
    destination_x_only_public_key: destXOnly,
    network: 'testnet',
    payment_hash: paymentHash,
    refund_x_only_public_key: refundXOnly,
    timeout_block_height: timeout,
  });

  // Low bit is parity (0 or 1); other bits must be leaf version 0xc0
  const claimByte = parseInt(r.claim_control_block.slice(0, 2), 16);
  const refundByte = parseInt(r.refund_control_block.slice(0, 2), 16);

  t.equal(claimByte & 0xfe, 0xc0);
  t.equal(refundByte & 0xfe, 0xc0);
  t.end();
});

test('rejects invalid x-only pubkey length', t => {
  t.throws(
    () => taprootSwapScript({
      destination_x_only_public_key: 'aa',
      payment_hash: paymentHash,
      refund_x_only_public_key: refundXOnly,
      timeout_block_height: timeout,
    }),
    /InvalidDestinationXOnlyPublicKeyLength/,
  );
  t.end();
});

test('rejects invalid payment hash length', t => {
  t.throws(
    () => taprootSwapScript({
      destination_x_only_public_key: destXOnly,
      payment_hash: 'aabbcc',
      refund_x_only_public_key: refundXOnly,
      timeout_block_height: timeout,
    }),
    /InvalidPaymentHashLength/,
  );
  t.end();
});
