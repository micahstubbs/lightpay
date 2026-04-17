const chainRpc = require('./chain_rpc');

const {stop} = require('./conf/rpc_commands');

/** Stop the chain daemon

  {
    network: <Network Name String>
  }

  No-op when OCW_CHAIN_DAEMON_EXTERNAL=1 — the daemon's lifecycle is
  managed outside this process (docker compose, systemd, etc.) and
  shouldn't be killed between test runs.
*/
module.exports = ({network}, cbk) => {
  if (process.env.OCW_CHAIN_DAEMON_EXTERNAL === '1') {
    return cbk();
  }

  return chainRpc({network, cmd: stop}, cbk);
};
