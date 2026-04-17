const {test} = require('tap');

const getAddressDetails = require('./../service/get_address_details');

// Known address fixtures (deterministic, from bitcoinjs-lib test vectors + BIP-350 spec)
const fixtures = {
  p2pkh_mainnet: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  p2pkh_testnet: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
  p2sh_mainnet:  '3P14159f73E4gFr7JterCCQh9QjiTjiZrG',
  p2sh_testnet:  '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc',
  p2wpkh_mainnet: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  p2wpkh_testnet: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  p2wsh_mainnet: 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
  // Generated from the BIP-341 example private key 0x01... via payments.p2tr
  p2tr_mainnet: 'bc1p33wm0auhr9kkahzd6l0kqj85af4cswn276hsxg6zpz85xe2r0y8syx4e5t',
  p2tr_testnet: 'tb1p33wm0auhr9kkahzd6l0kqj85af4cswn276hsxg6zpz85xe2r0y8snwrkwy',
};

test('decodes P2PKH mainnet', t => {
  return getAddressDetails({address: fixtures.p2pkh_mainnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2pkh');
    t.equal(res.is_testnet, false);
    t.equal(res.version, 0);
    t.ok(res.hash);
    t.end();
  });
});

test('decodes P2PKH testnet', t => {
  return getAddressDetails({address: fixtures.p2pkh_testnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2pkh');
    t.equal(res.is_testnet, true);
    t.equal(res.version, 111);
    t.end();
  });
});

test('decodes P2SH mainnet', t => {
  return getAddressDetails({address: fixtures.p2sh_mainnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2sh');
    t.equal(res.is_testnet, false);
    t.equal(res.version, 5);
    t.end();
  });
});

test('decodes P2SH testnet', t => {
  return getAddressDetails({address: fixtures.p2sh_testnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2sh');
    t.equal(res.is_testnet, true);
    t.equal(res.version, 196);
    t.end();
  });
});

test('decodes P2WPKH mainnet', t => {
  return getAddressDetails({address: fixtures.p2wpkh_mainnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2wpkh');
    t.equal(res.is_testnet, false);
    t.equal(res.version, 0);
    t.equal(res.prefix, 'bc');
    t.end();
  });
});

test('decodes P2WPKH testnet', t => {
  return getAddressDetails({address: fixtures.p2wpkh_testnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2wpkh');
    t.equal(res.is_testnet, true);
    t.equal(res.prefix, 'tb');
    t.end();
  });
});

test('decodes P2WSH mainnet', t => {
  return getAddressDetails({address: fixtures.p2wsh_mainnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2wsh');
    t.equal(res.is_testnet, false);
    t.equal(res.version, 0);
    t.end();
  });
});

test('decodes P2TR (bech32m) mainnet', t => {
  return getAddressDetails({address: fixtures.p2tr_mainnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2tr');
    t.equal(res.is_testnet, false);
    t.equal(res.version, 1);
    t.equal(res.prefix, 'bc');
    t.end();
  });
});

test('decodes P2TR (bech32m) testnet', t => {
  return getAddressDetails({address: fixtures.p2tr_testnet}, (err, res) => {
    t.equal(err, null);
    t.equal(res.type, 'p2tr');
    t.equal(res.is_testnet, true);
    t.equal(res.version, 1);
    t.end();
  });
});

test('rejects invalid address', t => {
  return getAddressDetails({address: 'not-a-real-address'}, (err, res) => {
    t.same(err, [400, 'ExpectedValidAddress']);
    t.end();
  });
});

test('rejects missing address', t => {
  return getAddressDetails({}, (err, res) => {
    t.same(err, [400, 'ExpectedAddress']);
    t.end();
  });
});
