const {test} = require('tap');

const chainServer = require('./../chain/conf/chain_server');

const networkModulePath = require.resolve('./../service/network');

// Reload service/network.js with a specific OCW_NETWORK value.
const loadNetwork = value => {
  if (value === undefined) {
    delete process.env.OCW_NETWORK;
  } else {
    process.env.OCW_NETWORK = value;
  }

  delete require.cache[networkModulePath];

  return require('./../service/network');
};

test('defaults to testnet when OCW_NETWORK is unset', t => {
  t.equal(loadNetwork(undefined), 'testnet');
  t.end();
});

test('accepts mainnet, regtest, testnet', t => {
  t.equal(loadNetwork('mainnet'), 'mainnet');
  t.equal(loadNetwork('regtest'), 'regtest');
  t.equal(loadNetwork('testnet'), 'testnet');
  t.end();
});

test('throws UnknownNetwork on unknown value', t => {
  t.throws(() => loadNetwork('bogus'), /UnknownNetwork:bogus/);
  t.end();
});

test('chain_server.json has all three networks', t => {
  t.ok(chainServer.mainnet, 'mainnet section present');
  t.ok(chainServer.mainnet.rpc_host, 'mainnet rpc_host');
  t.ok(chainServer.mainnet.rpc_port, 'mainnet rpc_port');
  t.ok(chainServer.mainnet.rpc_user, 'mainnet rpc_user');
  t.ok(chainServer.testnet, 'testnet section present');
  t.ok(chainServer.regtest, 'regtest section present');
  t.end();
});

test('mainnet uses Bitcoin Core default port 8332', t => {
  t.equal(chainServer.mainnet.rpc_port, 8332);
  t.end();
});

// Reset to testnet for subsequent tests.
loadNetwork('testnet');
