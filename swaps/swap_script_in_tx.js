const {networks, payments, Transaction} = require('bitcoinjs-lib');

const {testnet} = networks;

const notFound = -1;

/** Find outputs with matching script in transaction

  {
    redeem_script: <Redeem Script For ScriptPub Hex String>
    transaction: <Transaction Hex String>
  }

  @throws
  <Error> on invalid arguments

  @returns
  {
    matching_outputs: [{
      redeem: <Redeem Script Hex String>
      script: <ScriptPub Hex String>
      tokens: <Tokens Number>
      transaction_id: <Transaction Id Hex String>
      vout: <Vout Number>
    }]
  }
*/
module.exports = args => {
  if (!args.redeem_script) {
    throw new Error('ExpectedRedeemScript');
  }

  if (!args.transaction) {
    throw new Error('ExpectedTransaction');
  }

  const redeem = Buffer.from(args.redeem_script, 'hex');
  const transaction = Transaction.fromHex(args.transaction);

  const txId = transaction.getId();

  const p2sh = payments.p2sh({
    redeem: {output: redeem, network: testnet},
    network: testnet,
  });

  const p2wsh = payments.p2wsh({
    redeem: {output: redeem, network: testnet},
    network: testnet,
  });

  const p2shP2wsh = payments.p2sh({redeem: p2wsh, network: testnet});

  const outputScripts = [
    p2sh.output,
    p2shP2wsh.output,
    p2wsh.output,
  ]
    .map(n => n.toString('hex'));

  const matchingOutputs = transaction.outs
    .map(({script, value}, vout) => {
      return {
        vout,
        redeem: redeem.toString('hex'),
        script: script.toString('hex'),
        tokens: value,
        transaction_id: txId,
      };
    })
    .filter(({script}) => outputScripts.indexOf(script) !== notFound);

  return {matching_outputs: matchingOutputs};
};
