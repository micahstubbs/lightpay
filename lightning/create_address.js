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
module.exports = async ({}, cbk) => {
  try {
    const {lnd} = authenticatedLndGrpc({
      cert: OCW_LND_TLS_CERT,
      macaroon: OCW_LND_MACAROON,
      socket: OCW_LND_GRPC_HOST,
    });

    const {address} = await createChainAddress({lnd, format: 'p2wpkh'});

    return cbk(null, {chain_address: address});
  } catch (err) {
    return cbk([503, 'FailedToCreateAddress', err]);
  }
};
