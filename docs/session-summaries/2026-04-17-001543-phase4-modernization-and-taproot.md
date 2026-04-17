# Session Summary: Phase 4 Modernization + Taproot Swap Scripts

**Date:** 2026-04-17
**Starting state:** Phases 1–3 complete. Stack on Node 22, bitcoinjs-lib v6, ln-service 58, tap 21. All unit tests green.
**Ending state:** Phase 4 complete — Docker deployment, BOLT 12 detection, WebLN frontend, async/await + JSDoc type-check setup, and a fully-implemented Taproot (BIP-341) swap script path with verified Schnorr signatures.

## Summary

Executed the optional Phase 4 modernization from the 2026-04-05 audit,
ending with a methodical Taproot swap implementation — the audit's
highest-risk Phase 4 item — done with a full design doc, NUMS internal
key, BIP-341-correct sigmsg, and signature-verifying tests.

## Completed Work

Created beads epic `lightpay-2l4` and 7 sub-issues. All closed.

**Commits (local, not pushed — SSH still broken):**

- `89371aa` `lightpay-3ps`: JSDoc type-check opt-in via `// @ts-check`.
  jsconfig.json + tsc 5.9 + `npm run typecheck`. Non-breaking: checkJs
  off by default; individual files opt in with one-line pragma.
- `dcdfc4b` `lightpay-1hv`: Convert `lightning/create_address.js` and
  `lightning/pay_invoice.js` to async/await while keeping the
  callback-style external API stable.
- `e578752` `lightpay-3jf`: Detect BOLT 12 offers (`lno1...`) and
  invoices (`lni1...`) in `service/get_invoice_details.js` and return
  structured errors (`Bolt12OffersNotSupported` /
  `Bolt12InvoicesNotSupported`). Added
  `test/test_get_invoice_details.js`.
- `62bbae2` `lightpay-36t`: Progressive-enhancement WebLN detection
  in `public/js/main.js`. If `window.webln` is present, show a badge
  and a "Get invoice from wallet" button.
- `1dca9cb` (approx) `lightpay-3a6`: Docker deployment.
  Two-stage Dockerfile on node:22-alpine + docker-compose.yml wiring
  lightpay + bitcoind regtest (lncm/bitcoind:v28.0). `.dockerignore`.
  Compose validates cleanly.
- `???????` `lightpay-1rs`: Taproot swap scripts — the big one. See
  below.

## Taproot swap implementation (lightpay-1rs)

**Design doc:** `docs/taproot-swap-design.md` covers script-tree
layout, NUMS internal-key rationale, sigmsg computation, control
block format, fee weight, security considerations.

**New modules:**

- `swaps/ecc_init.js` — centralises `bitcoin.initEccLib(ecc)` so
  downstream taproot code doesn't need to coordinate init order.
- `swaps/taproot_swap_script.js` — compiles two tapscripts:
  - Claim: `OP_SIZE 0x20 OP_EQUALVERIFY OP_SHA256 <hash> OP_EQUALVERIFY <dst_xonly> OP_CHECKSIG`
  - Refund: `<timeout> OP_CLTV OP_DROP <refund_xonly> OP_CHECKSIG`
- `swaps/taproot_swap_address.js` — assembles the 2-leaf TapTree
  with the BIP-341-recommended NUMS x-only internal key
  (`50929b74...803ac0`). Derives the bech32m address and exposes
  control blocks for both leaves.
- `swaps/taproot_claim_transaction.js` — builds a claim tx with
  `Transaction.hashForWitnessV1` (tapscript sigmsg), SIGHASH_DEFAULT
  (64-byte Schnorr sig), witness `[sig, preimage, script, control]`.
- `swaps/taproot_refund_transaction.js` — refund via the refund
  leaf; `nLockTime = timelock`, sequence `0xfffffffe` (non-final so
  CLTV is enforced).

**Tests:**

- `test/test_taproot_swap_address.js` — 9 tests: address determinism,
  network separation, script opcode presence, control block shape,
  input validation.
- `test/test_taproot_swap_transactions.js` — 5 tests: claim witness
  shape + verified Schnorr signature against destination x-only
  pubkey using the correctly-computed BIP-341 sigmsg; refund locktime,
  sequence, verified Schnorr; fee-too-high rejection paths;
  `SHA256(preimage) == payment_hash` invariant.

All Schnorr signatures verify against the expected x-only pubkeys
using tiny-secp256k1's `verifySchnorr` — this is the real test that
the BIP-341 tapscript sigmsg is computed correctly and the keys line
up with the script.

## Key Design Choices

**NUMS internal key, not MuSig2.** The BIP-341 recommended NUMS point
(`50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0`)
has no known discrete log, which makes the key-path spend provably
unreachable. That's exactly what we want for an HTLC: both parties
must reveal either the preimage (claim) or wait for the timeout
(refund). MuSig2 would add a cooperative-close shortcut that isn't
needed for first-pass taproot support and significantly increases
protocol complexity.

**OP_SHA256 instead of OP_HASH160.** The legacy HTLC in
`pk_swap_script.js` uses `OP_HASH160(sha256(payment_hash))`. Taproot
supports `OP_SHA256` directly, so we use a single hash — saving bytes
and eliminating the pointless ripemd160 step.

**`OP_SIZE <0x20> OP_EQUALVERIFY` preimage length check.** Standard
mitigation against preimage-length griefing. The legacy code doesn't
have this; adding it for the taproot version is defence in depth.

**Script-path spends only.** Since the key-path is NUMS-blocked, all
spends must be via the script tree, which means the witness reveals
which path was taken (but not the whole tree). This is the standard
privacy/auditability trade-off for taproot HTLCs.

## Test Suite Status

- Unit-test files: 12 (up from 5 at start of Phase 1).
- All 10 non-integration test files pass.
- Integration tests (`claim_success.js`, `refund_success.js`) still
  fail at `spawn_chain_daemon` because `bitcoind` isn't installed on
  this machine. The docker-compose setup ships a working bitcoind
  regtest, which is the intended end-to-end test path now.

## Pending / Blocked

- **Taproot not wired into `service/create_swap.js`.** This was
  deliberate scope-slicing: integrating taproot as an alternative
  witness type needs UI design for the user choice (legacy P2SH /
  P2SH-P2WSH / P2WSH / Taproot). The plumbing is all there — the
  service just needs a new `witness_type` argument to route to the
  right script-building module. Beads issue can be filed when the
  UI choice is known.
- **Git push still blocked.** 18 commits + Phase 4's new commits
  ahead of origin (roughly 26 total). SSH auth to github.com still
  fails.
- **Integration tests require bitcoind.** `docker compose up
  bitcoind` would provide it in the docker path; installing
  `bitcoind` locally would provide it for `npm test`.

## Next Session Context

- The migration arc (Phases 1–4) is complete. What remains is real
  feature work, not modernization:
  1. Wire taproot into `service/create_swap.js` with a UI selector
  2. True BOLT 12 support via `fetchBolt12Invoice` + `payViaPaymentRequest`
  3. LNURL-pay / Lightning Address resolution server-side
  4. A deployment target (which cloud? the Docker artifact is
     platform-neutral)
- Practical next step: run the integration tests against the
  docker-compose bitcoind to verify Phase 3's spawn-daemon rewrite
  and confirm the swap round-trip against a real regtest chain.

## Verification

- `npm test`: 10 unit-test files green, 2 integration files fail at
  daemon-spawn (expected — bitcoind not installed).
- `npm run typecheck`: clean.
- `npm run build`: regenerates the 2.9 MB browser bundle with
  taproot modules excluded (only the original browserify entry points
  ship to the browser).
- `docker compose config`: valid.
- Schnorr signatures produced by the taproot claim/refund modules
  verify against the correct x-only pubkeys using independently-
  computed BIP-341 tapleaf hashes and sighash_default sigmsg.
