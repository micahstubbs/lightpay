// @ts-check
// Centralised bitcoinjs-lib ECC library initialization.
// P2TR / Schnorr operations in bitcoinjs-lib v6 require initEccLib() to be
// called exactly once before any payments.p2tr / Transaction.signSchnorr call.
// We run it eagerly on require so downstream modules can use taproot APIs
// without coordinating init order.

const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');

let initialised = false;

if (!initialised) {
  bitcoin.initEccLib(ecc);
  initialised = true;
}

module.exports = ecc;
