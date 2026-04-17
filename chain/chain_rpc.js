const chainServer = require('./conf/chain_server');
const errCode = require('./conf/error_codes');

const credentials = {
  host: {
    regtest: chainServer.regtest.rpc_host,
    testnet: chainServer.testnet.rpc_host,
  },
  pass: {
    regtest: chainServer.regtest.rpc_pass,
    testnet: process.env.OCW_CHAIN_RPC_PASS,
  },
  port: {
    regtest: chainServer.regtest.rpc_port,
    testnet: chainServer.testnet.rpc_port,
  },
  user: {
    regtest: chainServer.regtest.rpc_user,
    testnet: chainServer.testnet.rpc_user,
  },
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

  const host = credentials.host[network];
  const pass = credentials.pass[network];
  const port = credentials.port[network];
  const user = credentials.user[network];

  if (!host || !port || !user) {
    return cbk([errCode.local_err, 'MissingChainRpcCredentials', {network}]);
  }

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
