const asyncAuto = require('async/auto');

const getAddressDetails = require('./get_address_details');
const {getBlockchainInfo} = require('./../chain');
const getInvoiceDetails = require('./get_invoice_details');
const network = require('./network');
const {returnResult} = require('./../async-util');
const serverSwapKeyPair = require('./server_swap_key_pair');
const {swapAddress, taprootSwapAddress} = require('./../swaps');

const minSwapTokens = 1e5;
const swapRate = 0.015;
const timeoutBlockCount = 144;

const legacyWitnessType = 'legacy';
const taprootWitnessType = 'taproot';
const validWitnessTypes = new Set([legacyWitnessType, taprootWitnessType]);

const compressedPubkeyHexLength = 66; // 33 bytes
const xOnlyPrefixByteLength = 1;

const xOnlyFromCompressed = hex => {
  // BIP-340 x-only keys drop the 1-byte parity prefix from the 33-byte
  // SEC1-compressed encoding.
  return Buffer.from(hex, 'hex')
    .subarray(xOnlyPrefixByteLength)
    .toString('hex');
};

/** Create a swap quote.

  Legacy (default) response bundles all three non-taproot encodings of
  the same redeem script (P2SH, P2SH-P2WSH, P2WSH). Taproot response
  returns a single P2TR address plus control blocks and tapscripts that
  a client needs to spend either leaf.

  {
    currency: <Currency Code String>
    invoice: <Lightning Invoice String>
    refund_address: <Chain Address String>
    [refund_public_key]: <Compressed Refund Public Key Hex String> (required when witness_type='taproot')
    [witness_type]: 'legacy' | 'taproot' (default 'legacy')
  }

  @returns via cbk

  Legacy:
  {
    destination_public_key: <Destination Public Key Hex String>
    invoice: <Lightning Invoice String>
    payment_hash: <Payment Hash Hex String>
    redeem_script: <Redeem Script Hex String>
    refund_address: <Refund Address String>
    refund_public_key_hash: <Refund Public Key Hash Hex String>
    swap_amount: <Swap Amount Number>
    swap_fee: <Swap Fee Tokens Number>
    swap_key_index: <Swap Key Index Number>
    swap_p2sh_address: <Swap Chain Legacy P2SH Base58 Address String>
    swap_p2sh_p2wsh_address: <Swap Chain P2SH Nested SegWit Address String>
    swap_p2wsh_address: <Swap Chain P2WSH Bech32 Address String>
    timeout_block_height: <Swap Expiration Date Number>
    witness_type: 'legacy'
  }

  Taproot:
  {
    claim_control_block: <BIP-341 Control Block Hex String>
    claim_script: <Claim Tapscript Hex String>
    destination_public_key: <Destination Public Key Hex String>
    invoice: <Lightning Invoice String>
    output_script: <P2TR Output Script Hex String>
    payment_hash: <Payment Hash Hex String>
    refund_address: <Refund Address String>
    refund_control_block: <BIP-341 Control Block Hex String>
    refund_public_key: <Refund Public Key Hex String>
    refund_script: <Refund Tapscript Hex String>
    swap_amount: <Swap Amount Number>
    swap_fee: <Swap Fee Tokens Number>
    swap_key_index: <Swap Key Index Number>
    swap_p2tr_address: <Swap P2TR Bech32m Address String>
    timeout_block_height: <Swap Expiration Date Number>
    witness_type: 'taproot'
  }
*/
module.exports = (args, cbk) => {
  const witnessType = args.witness_type || legacyWitnessType;

  return asyncAuto({
    // Decode the refund address
    getAddressDetails: cbk => {
      return getAddressDetails({address: args.refund_address}, cbk);
    },

    // Get info about the state of the chain
    getBlockchainInfo: cbk => getBlockchainInfo({network}, cbk),

    // Decode the invoice to pay
    getInvoiceDetails: cbk => {
      return getInvoiceDetails({invoice: args.invoice}, cbk);
    },

    // Validate basic arguments
    validate: cbk => {
      if (args.currency !== 'tBTC') {
        return cbk([400, 'ExpectedKnownCurrency']);
      }

      if (!args.invoice) {
        return cbk([400, 'ExpectedInvoice']);
      }

      if (!args.refund_address) {
        return cbk([400, 'ExpectedRefundAddress']);
      }

      if (!validWitnessTypes.has(witnessType)) {
        return cbk([400, 'UnknownWitnessType']);
      }

      if (witnessType === taprootWitnessType) {
        if (!args.refund_public_key) {
          return cbk([400, 'ExpectedRefundPublicKey']);
        }

        if (args.refund_public_key.length !== compressedPubkeyHexLength) {
          return cbk([400, 'ExpectedCompressedRefundPublicKey']);
        }
      }

      return cbk();
    },

    // Determine the HD key index for the swap key
    swapKeyIndex: ['getBlockchainInfo', ({getBlockchainInfo}, cbk) => {
      return cbk(null, getBlockchainInfo.current_height);
    }],

    // Make a temporary server public key to send the swap to
    serverDestinationKey: ['swapKeyIndex', ({swapKeyIndex}, cbk) => {
      try {
        return cbk(null, serverSwapKeyPair({network, index: swapKeyIndex}));
      } catch (e) {
        return cbk([500, 'ExpectedValidSwapKeyPair', e]);
      }
    }],

    // Determine the refund address hash
    refundAddress: ['getAddressDetails', ({getAddressDetails}, cbk) => {
      const details = getAddressDetails;

      if (details.type !== 'p2pkh' && details.type !== 'p2wpkh') {
        return cbk([400, 'ExpectedPayToPublicKeyHashAddress']);
      }

      if (!details.is_testnet) {
        return cbk([400, 'ExpectedTestnetAddress']);
      }

      return cbk(null, {public_key_hash: details.hash || details.data});
    }],

    timeoutBlockHeight: ['getBlockchainInfo', ({getBlockchainInfo}, cbk) => {
      return cbk(null, getBlockchainInfo.current_height + timeoutBlockCount);
    }],

    // Create the legacy (P2SH/P2WSH/P2SH-P2WSH) swap address bundle
    legacySwapAddress: [
      'getInvoiceDetails',
      'refundAddress',
      'serverDestinationKey',
      'timeoutBlockHeight',
      'validate',
      (res, cbk) =>
    {
      if (witnessType !== legacyWitnessType) {
        return cbk();
      }

      try {
        return cbk(null, swapAddress({
          destination_public_key: res.serverDestinationKey.public_key,
          payment_hash: res.getInvoiceDetails.id,
          refund_public_key_hash: res.refundAddress.public_key_hash,
          timeout_block_height: res.timeoutBlockHeight,
        }));
      } catch (e) {
        return cbk([500, 'SwapAddressCreationFailure', e]);
      }
    }],

    // Create the taproot swap address + control blocks
    taprootSwapAddress: [
      'getInvoiceDetails',
      'refundAddress',
      'serverDestinationKey',
      'timeoutBlockHeight',
      'validate',
      (res, cbk) =>
    {
      if (witnessType !== taprootWitnessType) {
        return cbk();
      }

      try {
        return cbk(null, taprootSwapAddress({
          destination_x_only_public_key: xOnlyFromCompressed(
            res.serverDestinationKey.public_key,
          ),
          network,
          payment_hash: res.getInvoiceDetails.id,
          refund_x_only_public_key: xOnlyFromCompressed(args.refund_public_key),
          timeout_block_height: res.timeoutBlockHeight,
        }));
      } catch (e) {
        return cbk([500, 'TaprootSwapAddressCreationFailure', e]);
      }
    }],

    // Swap fee component
    fee: ['getInvoiceDetails', ({getInvoiceDetails}, cbk) => {
      return cbk(null, Math.round(getInvoiceDetails.tokens * swapRate));
    }],

    // Make sure the amount is enough
    checkAmount: ['getInvoiceDetails', ({getInvoiceDetails}, cbk) => {
      if (getInvoiceDetails.tokens < minSwapTokens) {
        return cbk([400, 'SwapAmountTooSmall']);
      }

      return cbk();
    }],

    // Swap details
    swap: [
      'checkAmount',
      'fee',
      'getInvoiceDetails',
      'legacySwapAddress',
      'refundAddress',
      'serverDestinationKey',
      'swapKeyIndex',
      'taprootSwapAddress',
      'timeoutBlockHeight',
      (res, cbk) =>
    {
      const base = {
        destination_public_key: res.serverDestinationKey.public_key,
        invoice: args.invoice,
        payment_hash: res.getInvoiceDetails.id,
        refund_address: args.refund_address,
        swap_amount: res.getInvoiceDetails.tokens + res.fee,
        swap_fee: res.fee,
        swap_key_index: res.swapKeyIndex,
        timeout_block_height: res.timeoutBlockHeight,
        witness_type: witnessType,
      };

      if (witnessType === taprootWitnessType) {
        return cbk(null, {
          ...base,
          claim_control_block: res.taprootSwapAddress.claim_control_block,
          claim_script: res.taprootSwapAddress.claim_script,
          output_script: res.taprootSwapAddress.output_script,
          refund_control_block: res.taprootSwapAddress.refund_control_block,
          refund_public_key: args.refund_public_key,
          refund_script: res.taprootSwapAddress.refund_script,
          swap_p2tr_address: res.taprootSwapAddress.address,
        });
      }

      return cbk(null, {
        ...base,
        redeem_script: res.legacySwapAddress.redeem_script,
        refund_public_key_hash: res.refundAddress.public_key_hash,
        swap_p2sh_address: res.legacySwapAddress.p2sh_address,
        swap_p2sh_p2wsh_address: res.legacySwapAddress.p2sh_p2wsh_address,
        swap_p2wsh_address: res.legacySwapAddress.p2wsh_address,
      });
    }],
  },
  returnResult({of: 'swap'}, cbk));
};

