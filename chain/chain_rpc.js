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

  // Settle the promise to a result tuple, THEN call cbk. Calling cbk from
  // inside .then would trigger async/auto synchronous chaining, which can
  // throw from downstream tasks; those throws would land in a .catch and
  // call cbk a second time. Separating the phases avoids that.
  const run = async () => {
    let res;
    try {
      res = await fetch(url, {
        body,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
    } catch (err) {
      return [errCode.service_unavailable, 'ChainDaemonError', err];
    }

    const text = await res.text();

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (parseErr) {
      return [errCode.service_unavailable, 'ChainDaemonError', {
        detail: text,
        status: res.status,
      }];
    }

    if (payload && payload.error) {
      return [errCode.service_unavailable, 'ChainDaemonError', payload.error];
    }

    if (!payload || payload.result === undefined) {
      return [errCode.service_unavailable, 'BadChainResponse'];
    }

    return payload.result;
  };

  run().then(result => {
    if (Array.isArray(result) && result.length >= 2 && typeof result[1] === 'string') {
      return cbk(result);
    }
    return cbk(null, result);
  });
};
