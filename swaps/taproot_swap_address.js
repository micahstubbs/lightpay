require('./ecc_init');

const {networks, payments} = require('bitcoinjs-lib');

const taprootSwapScript = require('./taproot_swap_script');

// BIP-341 recommended NUMS x-only pubkey. No one knows the discrete log,
// which makes the key-path spend provably unreachable — both parties
// must use the script path.
const NUMS_INTERNAL_PUBKEY = Buffer.from(
  '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
  'hex',
);

const tapleafVersion = 0xc0;

const networkForName = name => {
  const entry = networks[name === 'mainnet' ? 'bitcoin' : name];

  if (!entry) { throw new Error(`UnknownNetwork:${name}`); }

  return entry;
};

/** Derive the Taproot swap address and spend metadata.

  Composes a two-leaf TapTree with the BIP-341 NUMS internal key. The
  output pubkey is the tap-tweaked result; the control blocks let
  callers spend either leaf.

  {
    destination_x_only_public_key: <32-byte hex string>
    network: 'mainnet' | 'regtest' | 'testnet'
    payment_hash: <32-byte SHA256 Payment Hash Hex String>
    refund_x_only_public_key: <32-byte hex string>
    timeout_block_height: <CLTV Locktime Number>
  }

  @throws <Error> on invalid arguments

  @returns
  {
    address: <P2TR bech32m Address String>
    claim_control_block: <BIP-341 Control Block Hex String>
    claim_script: <Claim Tapscript Hex String>
    output_script: <P2TR Output Script Hex String> (OP_1 <32-byte Q>)
    refund_control_block: <BIP-341 Control Block Hex String>
    refund_script: <Refund Tapscript Hex String>
  }
*/
module.exports = args => {
  const {claim_script, refund_script} = taprootSwapScript({
    destination_x_only_public_key: args.destination_x_only_public_key,
    payment_hash: args.payment_hash,
    refund_x_only_public_key: args.refund_x_only_public_key,
    timeout_block_height: args.timeout_block_height,
  });

  const network = networkForName(args.network);

  const scriptTree = [
    {output: claim_script},
    {output: refund_script},
  ];

  const committed = payments.p2tr({
    internalPubkey: NUMS_INTERNAL_PUBKEY,
    scriptTree,
    network,
  });

  const claim = payments.p2tr({
    internalPubkey: NUMS_INTERNAL_PUBKEY,
    redeem: {output: claim_script, redeemVersion: tapleafVersion},
    scriptTree,
    network,
  });

  const refund = payments.p2tr({
    internalPubkey: NUMS_INTERNAL_PUBKEY,
    redeem: {output: refund_script, redeemVersion: tapleafVersion},
    scriptTree,
    network,
  });

  // p2tr with a redeem returns witness = [script, controlBlock]
  const claimControlBlock = claim.witness[claim.witness.length - 1];
  const refundControlBlock = refund.witness[refund.witness.length - 1];

  return {
    address: committed.address,
    claim_control_block: claimControlBlock.toString('hex'),
    claim_script: claim_script.toString('hex'),
    output_script: committed.output.toString('hex'),
    refund_control_block: refundControlBlock.toString('hex'),
    refund_script: refund_script.toString('hex'),
  };
};

module.exports.NUMS_INTERNAL_PUBKEY = NUMS_INTERNAL_PUBKEY;
module.exports.TAPLEAF_VERSION = tapleafVersion;
