const {authenticatedLndGrpc, payViaPaymentRequest} = require('ln-service');

const {OCW_LND_GRPC_HOST} = process.env;
const {OCW_LND_MACAROON} = process.env;
const {OCW_LND_TLS_CERT} = process.env;

/** Pay Lightning Invoice

  {
    invoice: <BOLT 11 Invoice String>
  }

  @returns via cbk
  {
    payment_secret: <Payment Preimage Hex String>
  }
*/
module.exports = ({invoice}, cbk) => {
  if (!invoice) {
    return cbk([400, 'ExpectedInvoice']);
  }

  const {lnd} = authenticatedLndGrpc({
    cert: OCW_LND_TLS_CERT,
    macaroon: OCW_LND_MACAROON,
    socket: OCW_LND_GRPC_HOST,
  });

  return payViaPaymentRequest({lnd, request: invoice}, (err, res) => {
    if (!!err) {
      return cbk([503, 'FailedToPayInvoice', err]);
    }

    return cbk(null, {payment_secret: res.secret});
  });
};
