const {test} = require('tap');
const path = require('path');

// Mock external dependencies so tests can exercise the branching logic
// in create_swap.js without a live bitcoind, BIP39 seed, or real invoice.
const fakeBlockHeight = 1000;
const fakePaymentHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const fakeInvoiceTokens = 200000;
const serverPubkey =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

// Preserve chain.constants (needed by swap modules loaded transitively) and
// override only getBlockchainInfo.
const chain = require('./../chain');
chain.getBlockchainInfo = ({network}, cbk) => {
  return cbk(null, {
    current_hash: 'aa'.repeat(32),
    current_height: fakeBlockHeight,
  });
};

// Stub getInvoiceDetails to avoid needing a real BOLT 11 invoice.
const invoicePath = require.resolve('./../service/get_invoice_details');
require.cache[invoicePath] = {
  id: invoicePath,
  filename: invoicePath,
  loaded: true,
  exports: ({invoice}, cbk) => cbk(null, {
    id: fakePaymentHash,
    tokens: fakeInvoiceTokens,
  }),
};

// Stub getAddressDetails to avoid re-running bech32/base58 decode logic —
// this test is about the witness_type branching, not address parsing.
const addrPath = require.resolve('./../service/get_address_details');
require.cache[addrPath] = {
  id: addrPath,
  filename: addrPath,
  loaded: true,
  exports: ({address}, cbk) => {
    if (!address) { return cbk([400, 'ExpectedAddress']); }
    return cbk(null, {
      data: null,
      hash: 'ab'.repeat(20),
      is_testnet: true,
      type: 'p2pkh',
    });
  },
};

const keyPairPath = require.resolve('./../service/server_swap_key_pair');
require.cache[keyPairPath] = {
  id: keyPairPath,
  filename: keyPairPath,
  loaded: true,
  exports: () => ({
    private_key: 'cVt4o7BGAig1UXywgGSmARhxMdzP5qvQsxKkSsc1XEkw3tDTQFpy',
    public_key: serverPubkey,
  }),
};

const createSwap = require('./../service/create_swap');

// Invoice string is opaque to the stubbed getInvoiceDetails — any
// non-empty value passes the basic args.invoice check.
const testnetInvoice = 'lntb200u1xxx-stubbed-invoice';

const testnetRefundAddress = 'mgWUuj1J1N882jmqFxtDepEC73Rr22E9GU';
// A real SEC1-compressed secp256k1 public key (the generator point G).
const compressedRefundPubkey =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

test('rejects unknown witness_type', t => {
  return createSwap({
    currency: 'tBTC',
    invoice: testnetInvoice,
    refund_address: testnetRefundAddress,
    witness_type: 'schnorr-bls-2026',
  }, err => {
    t.ok(Array.isArray(err), 'error array returned');
    t.equal(err[0], 400);
    t.equal(err[1], 'UnknownWitnessType');
    t.end();
  });
});

test('rejects taproot without refund_public_key', t => {
  return createSwap({
    currency: 'tBTC',
    invoice: testnetInvoice,
    refund_address: testnetRefundAddress,
    witness_type: 'taproot',
  }, err => {
    t.ok(Array.isArray(err));
    t.equal(err[0], 400);
    t.equal(err[1], 'ExpectedRefundPublicKey');
    t.end();
  });
});

test('rejects taproot with wrong-length refund_public_key', t => {
  return createSwap({
    currency: 'tBTC',
    invoice: testnetInvoice,
    refund_address: testnetRefundAddress,
    refund_public_key: 'aabb',
    witness_type: 'taproot',
  }, err => {
    t.ok(Array.isArray(err));
    t.equal(err[0], 400);
    t.equal(err[1], 'ExpectedCompressedRefundPublicKey');
    t.end();
  });
});

test('rejects missing refund_address', t => {
  return createSwap({
    currency: 'tBTC',
    invoice: testnetInvoice,
  }, err => {
    t.ok(Array.isArray(err));
    t.equal(err[0], 400);
    // Either ExpectedRefundAddress from validate or ExpectedAddress from
    // getAddressDetails — both are correct reasons to reject. The specific
    // code depends on async/auto task scheduling order.
    t.ok(['ExpectedRefundAddress', 'ExpectedAddress'].includes(err[1]));
    t.end();
  });
});

test('legacy witness_type returns bundled P2SH / P2WSH addresses', t => {
  return createSwap({
    currency: 'tBTC',
    invoice: testnetInvoice,
    refund_address: testnetRefundAddress,
    // witness_type omitted — defaults to legacy
  }, (err, res) => {
    t.error(err);
    t.ok(res);
    t.equal(res.witness_type, 'legacy');
    t.ok(res.swap_p2sh_address, 'has p2sh address');
    t.ok(res.swap_p2sh_p2wsh_address, 'has p2sh-p2wsh address');
    t.ok(res.swap_p2wsh_address, 'has p2wsh address');
    t.ok(res.redeem_script, 'has redeem script');
    t.ok(res.refund_public_key_hash, 'has refund pubkey hash');
    t.notOk(res.swap_p2tr_address, 'no taproot address');
    t.equal(res.timeout_block_height, fakeBlockHeight + 144);
    t.end();
  });
});

test('taproot witness_type returns P2TR address + control blocks', t => {
  return createSwap({
    currency: 'tBTC',
    invoice: testnetInvoice,
    refund_address: testnetRefundAddress,
    refund_public_key: compressedRefundPubkey,
    witness_type: 'taproot',
  }, (err, res) => {
    t.error(err);
    t.ok(res);
    t.equal(res.witness_type, 'taproot');
    t.ok(res.swap_p2tr_address, 'has p2tr address');
    t.ok(
      res.swap_p2tr_address.startsWith('tb1p'),
      'p2tr is testnet bech32m',
    );
    t.ok(res.claim_script, 'has claim tapscript');
    t.ok(res.refund_script, 'has refund tapscript');
    t.ok(res.claim_control_block, 'has claim control block');
    t.ok(res.refund_control_block, 'has refund control block');
    t.ok(res.output_script, 'has p2tr output script');
    t.equal(res.refund_public_key, compressedRefundPubkey);
    t.notOk(res.swap_p2sh_address, 'no legacy p2sh address');
    t.notOk(res.redeem_script, 'no legacy redeem script');
    // Control blocks: 1 (version) + 32 (internal) + 32 (sibling) = 65 bytes
    t.equal(res.claim_control_block.length, 130);
    t.equal(res.refund_control_block.length, 130);
    t.end();
  });
});
