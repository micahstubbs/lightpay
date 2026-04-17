# Taproot (BIP-341) Swap Script Design

**Status:** Implemented alongside existing P2WSH/P2SH HTLC paths. Not wired into `service/create_swap.js` yet — that's a separate follow-up.

## Goal

Add a Taproot (P2TR / bech32m) variant of LightPay's atomic swap so users can:

- Receive change into modern taproot outputs (cheaper on-chain footprint)
- Spend via Schnorr signatures (64 bytes vs ECDSA's 72 bytes)
- Leak less metadata on the claim/refund path (script-path spends reveal only the path used, not the entire HTLC structure)

## Script tree

Two leaves, both TapLeaf version `0xc0`:

### Claim leaf

Alice (destination) claims by revealing the preimage and signing with her key.

```
OP_SIZE <0x20> OP_EQUALVERIFY
OP_SHA256 <payment_hash> OP_EQUALVERIFY
<destination_x_only_pubkey> OP_CHECKSIG
```

Witness to spend (bottom of stack → top):

```
<destination_schnorr_sig> <preimage> <claimScript> <controlBlock>
```

Compared to the legacy HTLC:
- `OP_SIZE <0x20> OP_EQUALVERIFY` enforces a 32-byte preimage (a known mitigation against preimage-length griefing attacks).
- `OP_SHA256` directly instead of the legacy `OP_HASH160(sha256(payment_hash))` double-hash. Taproot has native `OP_SHA256` semantics, the extra ripemd160 step saves no size and leaks less.

### Refund leaf

Bob (refund) gets his money back after the CLTV timeout if no claim happened.

```
<timeout_block_height> OP_CHECKLOCKTIMEVERIFY OP_DROP
<refund_x_only_pubkey> OP_CHECKSIG
```

Witness:

```
<refund_schnorr_sig> <refundScript> <controlBlock>
```

CLTV semantics are identical to the legacy design: `nLockTime` on the spending transaction must be ≥ `timeout_block_height`, and the input's sequence must not be `0xffffffff`.

## Internal key: NUMS

We use the BIP-341-recommended NUMS point:

```
x-only: 50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0
```

**Why NUMS and not a MuSig2 aggregate key?** A NUMS internal key makes the key-path spend provably unreachable (no one knows the discrete log). That's exactly the property we want for an HTLC: both parties should be forced to use the script path, revealing either the preimage or the timeout. MuSig2 would add a cooperative-close shortcut, but it's significantly more complex, needs an interactive signing protocol, and doesn't materially improve the typical non-cooperative swap flow.

## On-chain output

```
payments.p2tr({
  internalPubkey: NUMS_X_ONLY,
  scriptTree: [
    {output: claimScript},
    {output: refundScript},
  ],
  network,
})
```

The tap-tweak output pubkey Q = lift_x(NUMS) + int(hashTapTweak(NUMS || merkle_root))·G.

`payments.p2tr` handles this. Output is a 34-byte `OP_1 <32-byte-Q>` script, bech32m-encoded to a `bc1p.../tb1p...` address.

## Signing

Both leaves use `OP_CHECKSIG` against an x-only pubkey, so Schnorr signatures (BIP-340) — NOT ECDSA. Since we use `SIGHASH_DEFAULT` (0x00, implicit), the signature is the canonical 64 bytes with no appended sighash byte.

BIP-341 §4.1 sigmsg computation:

- `hash_type = 0x00` (DEFAULT)
- `ext_flag = 0x01` (tapscript)
- `key_version = 0x00` (untweaked-leaf key)
- Include `tapleaf_hash = tapLeaf(0xc0, scriptBytes)`
- Include `annex = <none>` (we don't use annex)

bitcoinjs-lib v6 exposes `Transaction.prototype.hashForWitnessV1(input_index, script_pubkeys, values, hash_type, leaf_hash)` which computes this correctly.

The private key is used **untweaked** when signing for a script-path spend — the CHECKSIG in the script references the raw x-only pubkey in the script, not the tap-tweaked output key. This is different from key-path spends (where the tweak is applied).

## Control block

Per BIP-341:

```
control = c | P | [branch_hashes...]
```

- `c = leaf_version | parity_bit`, where `parity_bit` is the Y-parity of the tweaked output pubkey Q.
- `P` is the 32-byte x-only internal key.
- `[branch_hashes...]` is the Merkle inclusion proof for the leaf being spent. For a two-leaf tree, it's a single 32-byte hash (the sibling leaf's TapLeaf hash).

bitcoinjs-lib's `payments.p2tr({redeem: {output: scriptBeingSpent}, scriptTree: [...]})` returns the control block in `result.witness[result.witness.length - 1]`.

## Fee weight

Schnorr signatures (64 bytes) save 8-9 bytes per input vs ECDSA. The script-path witness is:

| Element | Bytes (approx) |
|---------|----------------|
| Schnorr sig | 64 |
| preimage (claim) or OP_FALSE equivalent (refund) | 32 / 0 |
| Script | ~40 claim / ~36 refund |
| Control block (single branch) | 33 |

Divide by `witness_byte_discount_denominator = 4` for vBytes.

## Security notes

1. **SIGHASH_DEFAULT**: applies to all inputs/outputs, equivalent to `SIGHASH_ALL` for taproot. Do NOT use `SIGHASH_ANYONECANPAY` — that breaks the HTLC invariant.
2. **Preimage length check**: `OP_SIZE <0x20> OP_EQUALVERIFY` is required. A claim attempt with a short preimage whose SHA256 still matches `payment_hash` (effectively impossible but formally possible for an adversary who controls the hash) would otherwise pass.
3. **Tapscript leaf version 0xc0**: only version currently defined by BIP-342. Future SOFT-forks might introduce new leaf versions; we hardcode 0xc0.
4. **Parity of output key**: captured in the control block's `c` byte. `payments.p2tr` computes it; don't manually flip it.
5. **CLTV disables mempool replacement**: do NOT set `RBF=0xfffffffd` sequence on the refund input if the mempool policy version cares — use `0xfffffffe` (non-final, allows CLTV check).

## Files implemented

- `swaps/taproot_swap_script.js` — build the two tapscripts + metadata
- `swaps/taproot_swap_address.js` — compose the scriptTree, derive the P2TR address, expose control blocks
- `swaps/taproot_claim_transaction.js` — build a claim tx spending the claim leaf
- `swaps/taproot_refund_transaction.js` — build a refund tx spending the refund leaf
- `test/test_taproot_swap_address.js` — deterministic vector: same inputs → same address, scripts, controls
- `test/test_taproot_swap_transactions.js` — round-trip claim/refund with verifiable sigs

## Deliberately out of scope for this change

- `service/create_swap.js` integration (would need UI choice between witness types)
- LND-side taproot invoice handling (ln-service already handles this on pay side)
- MuSig2 cooperative-close path (deferred until a use case requires it)
- Mainnet address-version validation updates in `get_address_details.js` (already done in Phase 3)
