const bitcoin = require('bitcoinjs-lib');
const {ECPairFactory} = require('ecpair');
const ecc = require('tiny-secp256k1');

const {networks, payments, Psbt} = bitcoin;
const {regtest} = networks;
const ECPair = ECPairFactory(ecc);

/** Send some tokens to an address (P2WPKH in → destination)

  Uses Psbt (bitcoinjs-lib v6). The funding UTXO is assumed to be a
  P2WPKH output for the key derived from the given private_key — which
  is what test/macros/spawn_chain_daemon.js mines to.

  {
    coinbase_tokens: <Coinbase Output Amount Number> (defaults to 50e8 BTC)
    destination: <Destination Address String>
    private_key: <WIF Serialized Private Key String>
    spend_transaction_id: <Transaction Id to Spend Hex String>
    spend_vout: <Vout to Spend Number>
    tokens: <Tokens to Send Number>
  }

  @returns via cbk
  {
    transaction: <Transaction Hex Serialized String>
  }
*/
module.exports = (args, cbk) => {
  const keyPair = ECPair.fromWIF(args.private_key, [
    networks.bitcoin,
    networks.testnet,
    regtest,
  ]);

  const p2wpkh = payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: regtest,
  });

  const inputTokens = args.coinbase_tokens || args.tokens;
  // Flat minimum-relay fee; regtest accepts 1 sat/vbyte so anything above
  // the min-relay threshold is fine.
  const txFee = 500;
  const outputTokens = Math.max(args.tokens - txFee, 0);

  const psbt = new Psbt({network: regtest});

  psbt.addInput({
    hash: args.spend_transaction_id,
    index: args.spend_vout,
    witnessUtxo: {
      script: p2wpkh.output,
      value: inputTokens,
    },
  });

  psbt.addOutput({address: args.destination, value: outputTokens});

  psbt.signInput(0, {
    publicKey: Buffer.from(keyPair.publicKey),
    sign: hash => Buffer.from(keyPair.sign(hash)),
  });

  psbt.finalizeAllInputs();

  return cbk(null, {transaction: psbt.extractTransaction().toHex()});
};
