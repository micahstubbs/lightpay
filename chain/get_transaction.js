const chainRpc = require('./chain_rpc');

const {getRawTransaction} = require('./conf/rpc_commands');

const notFoundPattern = /No such mempool or blockchain transaction/i;

/** Get a raw transaction

  Looking up a transaction that doesn't exist is not an error — callers
  rely on a null `transaction` field to mean "not broadcast yet". Only
  genuine RPC failures (connectivity, auth, etc.) propagate as errors.

  {
    network: <Network Name String>
    transaction_id: <Transaction Id String>
  }

  @returns via cbk
  {
    [transaction]: <Transaction Hex String | null>
  }
*/
module.exports = (args, cbk) => {
  if (!args.network) {
    return cbk([500, 'ExpectedNetwork']);
  }

  if (!args.transaction_id) {
    return cbk([500, 'ExpectedTransactionId']);
  }

  return chainRpc({
    cmd: getRawTransaction,
    network: args.network,
    params: [args.transaction_id],
  },
  (err, transaction) => {
    if (!!err) {
      // Bitcoin Core returns an error when the txid is unknown. That's not
      // an error from the caller's perspective — return "no tx".
      const detail = err[2];
      const message = detail && detail.message ? detail.message : '';

      if (notFoundPattern.test(message)) {
        return cbk(null, {transaction: null});
      }

      return cbk(err);
    }

    return cbk(null, {transaction});
  });
};
