const {mkdtempSync, rmSync} = require('fs');
const {networks, payments} = require('bitcoinjs-lib');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const chainServer = require('./conf/chain_server');
const errCode = require('./conf/error_codes');

const rpcServerReady = /Bound to.*127\.0\.0\.1|init message: Done loading/;
const alreadyRunning = /Cannot obtain a lock on data directory/;

const defaultDaemonBinary = 'bitcoind';
const daemonBinary = process.env.OCW_CHAIN_DAEMON_BIN || defaultDaemonBinary;

/** Spawn a Bitcoin Core regtest daemon for integration tests.

  Derives a P2WPKH mining address from the given public key and exposes
  it on the resolved daemon object so callers can mine to it later via
  `generatetoaddress`.

  Two operating modes:

  - **Spawn mode (default)**: forks `bitcoind -regtest` and manages its
    lifecycle. Requires `bitcoind` on PATH (override with
    OCW_CHAIN_DAEMON_BIN). Suitable for dev machines with a local
    Bitcoin Core install.

  - **External mode** (`OCW_CHAIN_DAEMON_EXTERNAL=1`): assumes a
    regtest daemon is already running on the RPC port configured in
    chain/conf/chain_server.json and credentials match. Suitable for
    CI and Docker Compose setups where `docker compose up bitcoind`
    owns the daemon.

  {
    mining_public_key: <Mining Public Key Hex String>
  }

  @returns via cbk
  {
    daemon: <Spawned ChildProcess | null (external mode)>
    datadir: <Temporary Data Directory String | null>
    mining_address: <P2WPKH Mining Address String>
  }
*/
module.exports = (args, cbk) => {
  if (!args.mining_public_key) {
    return cbk([errCode.local_err, 'ExpectedMiningPublicKey']);
  }

  const miningKey = Buffer.from(args.mining_public_key, 'hex');

  const {address: miningAddress} = payments.p2wpkh({
    pubkey: miningKey,
    network: networks.regtest,
  });

  if (process.env.OCW_CHAIN_DAEMON_EXTERNAL === '1') {
    return cbk(null, {
      daemon: null,
      datadir: null,
      mining_address: miningAddress,
    });
  }

  const datadir = mkdtempSync(path.join(os.tmpdir(), 'lightpay-regtest-'));

  const {rpc_host, rpc_port, rpc_user, rpc_pass} = chainServer.regtest;

  const daemon = spawn(daemonBinary, [
    '-regtest',
    `-datadir=${datadir}`,
    '-server=1',
    '-txindex=1',
    '-fallbackfee=0.0002',
    `-rpcbind=${rpc_host}`,
    `-rpcallowip=${rpc_host}`,
    `-rpcport=${rpc_port}`,
    `-rpcuser=${rpc_user}`,
    `-rpcpassword=${rpc_pass}`,
    '-printtoconsole',
  ]);

  let settled = false;
  const resolve = (err, res) => {
    if (settled) { return; }
    settled = true;
    return cbk(err, res);
  };

  daemon.stderr.on('data', data => console.log(`bitcoind[err]: ${data}`));

  daemon.stdout.on('data', data => {
    const text = `${data}`;

    if (alreadyRunning.test(text)) {
      return resolve([errCode.local_err, 'ChainDaemonAlreadyRunning']);
    }

    if (rpcServerReady.test(text)) {
      return resolve(null, {daemon, datadir, mining_address: miningAddress});
    }
  });

  daemon.on('error', err => {
    return resolve([errCode.local_err, 'SpawnDaemonFailure', err]);
  });

  daemon.on('close', () => {
    try { rmSync(datadir, {force: true, recursive: true}); } catch (e) {}
  });

  process.on('uncaughtException', err => {
    console.log(err);
    daemon.kill();
    process.exit(1);
  });

  return;
};
