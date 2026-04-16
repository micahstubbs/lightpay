# Session Summary: Phase 1 bitcoinjs-lib v6 Migration

**Date:** 2026-04-16
**Duration:** Single session
**Starting state:** Research/audit complete, zero implementation started
**Ending state:** Phase 1 complete — all unit tests passing on modern stack

## Summary

Executed the entire Phase 1 foundation update from the 2026-04-05 audit.
The codebase now runs on Node 22+ with bitcoinjs-lib v6 and its extracted
packages (ecpair, bip32, tiny-secp256k1). All 40 existing unit test
assertions pass.

## Completed Work

Created beads epic `lightpay-3d4` and 9 sub-issues for Phase 1. All closed.

**Commits (local, not pushed — SSH still broken):**

- `81a3703` `lightpay-340`: Bump engines.node from 8.9.4 to >=22
- `9241789` `lightpay-1gm` + `lightpay-1po`: Upgrade bitcoinjs-lib to ^6.1.7;
  add ecpair ^2.1.0, bip32 ^3.1.0, tiny-secp256k1 ^2.2.3; switch bolt11
  from dead `bitcoinjs/bolt11#wip` git ref to ^1.4.1 npm release
- `bfc8639` `lightpay-2mh,2z1,84e,3mw,3ez,1tr`: Migrate swap/chain code
  to v6 API

## Key Changes

**Package/dependency changes:**

- Node engine: 8.9.4 → >=22 (npm >=10)
- bitcoinjs-lib: 3.3.2 → ^6.1.7
- Added: ecpair, bip32, tiny-secp256k1
- bolt11 git#wip (dead branch) → ^1.4.1 npm
- package-lock.json regenerated (685 packages, clean install on Node 24)

**Code migrations:**

- `chain/generate_key_pair.js` — ECPair factory + payments.p2pkh + `.publicKey`
- `service/server_swap_key_pair.js` — bip32.fromSeed via BIP32Factory
- `swaps/swap_address.js` — payments.p2sh / p2wsh / p2sh(p2wsh) composition
- `swaps/swap_script_details.js` — payments API (same pattern)
- `swaps/swap_script_in_tx.js` — payments API for output-script candidates
- `swaps/claim_transaction.js` — ECPair from `ecpair` package;
  `script.signature.encode(keyPair.sign(hash, true), hashType)` replaces the
  old `.sign().toScriptSignature()` chain; **low-R grinding enabled** to
  produce canonical signatures and (critically) deterministic fee
  estimation
- `swaps/refund_transaction.js` — same migration; dummy-key sizing also
  uses low-R

**Test fixtures:**

- `test/test_claim_transaction.js` line ~98 — updated legacy-P2SH expected
  output to match low-R signature (shorter, canonical)
- `test/test_refund_transaction.js` line ~82 — same

## Key Insight (Non-Obvious)

The audit assumed both `TransactionBuilder` → `Psbt` rewrites and custom
HTLC finalizers. **They were not needed.** The existing code already uses
bitcoinjs-lib's low-level `Transaction` class directly (stable across v3
→ v6), not the removed `TransactionBuilder`. Migration reduced to:

1. ECPair import path (`bitcoinjs-lib` → `ecpair`)
2. Signature encoding API (`.toScriptSignature(t)` → `script.signature.encode(sig, t)`)
3. Public key getter (`.getPublicKeyBuffer()` → `.publicKey`)
4. Script template API (`script.*.output.encode` → `payments.*`)
5. Low-R grinding (not default in ecpair v2; must pass `lowR=true` explicitly)

The low-R gotcha is the most important finding: without it, dummy-key
signing for fee estimation produces 71- or 72-byte signatures non-
deterministically, which cascades into non-deterministic fee → output
value → final signature. Tests pass in isolation but fail in batch.

## Pending / Blocked

- **Integration tests not run** — `test/claim_success.js` /
  `test/refund_success.js` spawn a bcoin regtest daemon; the audit flags
  bcoin as possibly needing replacement with Bitcoin Core regtest in
  Phase 3. Not attempted this session.
- **Git push still blocked** — SSH auth to github.com fails (same as
  last session). 5 commits ahead of origin. User needs to either start
  ssh-agent + add key, or switch remote to HTTPS to use gh's credential
  helper.
- **Phase 2 not started** — ln-service (v2 → v57), node-bitcoin-rpc
  replacement, Express middleware updates, hardcoded-config extraction,
  etc.

## Next Session Context

- Phase 1 is the foundation; Phases 2–4 from the audit remain. Next
  critical-path item is **ln-service v2 → v57** — 55 major versions of
  API drift; the integration layer in `lightning/create_address.js` and
  `lightning/pay_invoice.js` needs a full rewrite against current
  ln-service docs, and the connection API likely changed
  (`lightningDaemon` → `authenticatedLndGrpc`).
- Before starting Phase 2, consider fixing the SSH/push situation so
  progress doesn't pile up locally.
- The bitcoin-ops and varuint-bitcoin packages are still in use by
  `swaps/claim_transaction.js` and `swaps/refund_transaction.js`;
  internalizing these (audit §2.16) is a later cleanup, not a blocker.
- Consider whether to bump bitcoinjs-lib to v7 (Uint8Array migration) or
  stay on v6 indefinitely. Staying on v6 is currently fine and stable.
