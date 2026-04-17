const chainServer = require('./conf/chain_server');
const errCode = require('./conf/error_codes');

// Resolve per-network credentials from chain_server.json. Non-regtest
// networks read their RPC password from OCW_CHAIN_RPC_PASS so it stays
// out of version control.
const credentialsFor = network => {
  const conf = chainServer[network];

  if (!conf) {
    return null;
  }

  return {
    host: conf.rpc_host,
    pass: conf.rpc_pass || process.env.OCW_CHAIN_RPC_PASS,
    port: conf.rpc_port,
    user: conf.rpc_user,
  };
};

let requestId = 0;

/** Execute Chain RPC command

  {
    cmd: <Chain RPC Command String>
    network: <Network Name String>
    [params]: <RPC Arguments Array>
  }

  @returns via cbk
  <Result Object>
*/
module.exports = ({cmd, network, params}, cbk) => {
  if (!network) {
    return cbk([errCode.local_err, 'ExpectedNetwork']);
  }

  const creds = credentialsFor(network);

  if (!creds || !creds.host || !creds.port || !creds.user) {
    return cbk([errCode.local_err, 'MissingChainRpcCredentials', {network}]);
  }

  const {host, pass, port, user} = creds;

  const niceParams = !Array.isArray(params || []) ? [params] : params || [];
  const auth = Buffer.from(`${user}:${pass || ''}`).toString('base64');
  const url = `http://${host}:${port}/`;

  const body = JSON.stringify({
    jsonrpc: '1.0',
    id: `lightpay-${++requestId}`,
    method: cmd,
    params: niceParams,
  });

  return fetch(url, {
    body,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  .then(async res => {
    const text = await res.text();

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (parseErr) {
      // Bitcoin Core returns plain-text bodies on auth/HTTP errors.
      return cbk([errCode.service_unavailable, 'ChainDaemonError', {
        detail: text,
        status: res.status,
      }]);
    }

    if (payload && payload.error) {
      return cbk([errCode.service_unavailable, 'ChainDaemonError', payload.error]);
    }

    if (!payload || payload.result === undefined) {
      return cbk([errCode.service_unavailable, 'BadChainResponse']);
    }

    return cbk(null, payload.result);
  })
  .catch(err => {
    return cbk([errCode.service_unavailable, 'ChainDaemonError', err]);
  });
};
