const {address, networks, payments} = require('bitcoinjs-lib');

const {fromOutputScript} = address;
const {testnet} = networks;

const pkSwapScript = require('./pk_swap_script');
const pkHashSwapScript = require('./pkhash_swap_script');

/** Derive a chain swap address for a swap

  @param
  {
    destination_public_key: <Destination Public Key Serialized String>
    payment_hash: <Payment Hash String>
    [refund_public_key]: <Refund Public Key Serialized String>
    [refund_public_key_hash]: <Refund Public Key Hash Hex String>
    timeout_block_height: <Swap Expiration Date Number>
  }

  @throws
  <Error> on chain address creation failure

  @returns
  {
    p2sh_address: <Legacy P2SH Base58 Address String>
    p2sh_output_script: <Legacy P2SH Output Script Hex String>
    p2sh_p2wsh_output_script: <P2SH Nested Output Script Hex String>
    p2sh_p2wsh_address: <Nested Pay to Witness Script Address String>
    p2wsh_address: <Pay to Witness Script Hash Address String>
    redeem_script: <Redeem Script Hex String>
    witness_output_script: <Witness Output Script Hex String>
  }
*/
module.exports = args => {
  let redeemScriptHex;

  if (!!args.refund_public_key) {
    redeemScriptHex = pkSwapScript({
      destination_public_key: args.destination_public_key,
      payment_hash: args.payment_hash,
      refund_public_key: args.refund_public_key,
      timeout_block_height: args.timeout_block_height,
    });
  } else if (!!args.refund_public_key_hash) {
    redeemScriptHex = pkHashSwapScript({
      destination_public_key: args.destination_public_key,
      payment_hash: args.payment_hash,
      refund_public_key_hash: args.refund_public_key_hash,
      timeout_block_height: args.timeout_block_height,
    });
  } else {
    throw new Error('ExpectedRefundKey');
  }

  const redeemScript = Buffer.from(redeemScriptHex, 'hex');

  // Legacy P2SH: script-hash of the raw redeem script
  const p2sh = payments.p2sh({
    redeem: {output: redeemScript, network: testnet},
    network: testnet,
  });

  // P2WSH: witness-script-hash of the raw redeem script
  const p2wsh = payments.p2wsh({
    redeem: {output: redeemScript, network: testnet},
    network: testnet,
  });

  // P2SH-wrapped P2WSH (nested segwit)
  const p2shP2wsh = payments.p2sh({
    redeem: p2wsh,
    network: testnet,
  });

  return {
    p2sh_address: p2sh.address,
    p2sh_output_script: p2sh.output.toString('hex'),
    p2sh_p2wsh_output_script: p2shP2wsh.output.toString('hex'),
    p2sh_p2wsh_address: p2shP2wsh.address,
    p2wsh_address: p2wsh.address,
    redeem_script: redeemScriptHex.toString('hex'),
    witness_output_script: p2wsh.output.toString('hex'),
  };
};
