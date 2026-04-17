const {authenticatedLndGrpc, createChainAddress} = require('ln-service');

const {OCW_LND_GRPC_HOST} = process.env;
const {OCW_LND_MACAROON} = process.env;
const {OCW_LND_TLS_CERT} = process.env;

/** Create an address on the Lightning Daemon

  {}

  @returns via cbk
  {
    chain_address: <Chain Address String>
  }
*/
module.exports = ({}, cbk) => {
  const {lnd} = authenticatedLndGrpc({
    cert: OCW_LND_TLS_CERT,
    macaroon: OCW_LND_MACAROON,
    socket: OCW_LND_GRPC_HOST,
  });

  return createChainAddress({lnd, format: 'p2wpkh'}, (err, res) => {
    if (!!err) {
      return cbk([503, 'FailedToCreateAddress', err]);
    }

    return cbk(null, {chain_address: res.address});
  });
};
