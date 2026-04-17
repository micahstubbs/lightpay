# Session Summary: Phase 2 Integration Layer Modernization

**Date:** 2026-04-16
**Starting state:** Phase 1 complete (bitcoinjs-lib v6, Node 22+, unit tests green)
**Ending state:** Phase 2 complete — modern fetch-based RPC, ln-service v58, modernized middleware + esbuild bundler, configurable network

## Summary

Executed the entire Phase 2 integration layer from the 2026-04-05 audit.
The project now runs on modern Express middleware, current ln-service
(58.0.3 vs the 8-year-old 2.0.1), a fetch-based Bitcoin RPC client, and
an esbuild-powered browser bundle — with network selection moved behind
an env var.

## Completed Work

Created beads epic `lightpay-2ji` and 4 sub-issues. All closed.

**Commits (local, not pushed — SSH still broken):**

- `9d81604` `lightpay-3cv`: Replace node-bitcoin-rpc with fetch-based
  JSON-RPC client in `chain/chain_rpc.js`. Preserves the existing
  `({cmd, network, params}, cbk)` signature so all 9 call sites in
  `chain/*.js` continue to work unchanged.
- `6d6b878` `lightpay-1k8`: Migrate ln-service 2.0.1 → 58.0.3. Rewrote
  `lightning/create_address.js` and `lightning/pay_invoice.js`:
  - `lightningDaemon({cert, host, macaroon})` →
    `authenticatedLndGrpc({cert, macaroon, socket})`
  - `createAddress` → `createChainAddress({lnd, format: 'p2wpkh'})`
  - `payInvoice` → `payViaPaymentRequest({lnd, request: invoice})`;
    return field `payment_secret` → `secret`. We still expose the
    public shape as `payment_secret` externally for API stability.
- `3057261` `lightpay-1io`: Middleware/bundler refresh.
  - helmet 3.12 → 8 (`helmet.hidePoweredBy()` now accessed via the
    default export)
  - pug 2 → 3, express 4.16 → 4.22, morgan/cors/compression patched
  - Drop body-parser; `routers/api.js` uses `express.json()`
  - Remove walnut (unmaintained dep checker)
  - Replace browserify-middleware with an esbuild build step
    (`npm run build`, wired via `prestart`). Generated bundle at
    `public/js/blockchain.js` is gitignored.
- `0c0ad24` `lightpay-2s7`: Network config extraction. New
  `service/network.js` resolves the active network from `OCW_NETWORK`
  (default: testnet), validates it, and is consumed by
  `create_swap.js`, `check_swap_status.js`, and `routers/api.js`.
  `chain/conf/chain_server.json` gained a mainnet section and
  `chain/chain_rpc.js` now derives per-network credentials from that
  config dynamically.

## Key Changes

**Dependencies added:**
- esbuild, esbuild-plugin-polyfill-node (dev)

**Dependencies removed:**
- node-bitcoin-rpc (unmaintained since 2018)
- body-parser (built into Express 4.16+)
- browserify-middleware (replaced by esbuild)
- walnut (unmaintained dependency-update checker)

**Dependencies upgraded:**
- ln-service 2.0.1 → ^58.0.3 (55 major versions)
- helmet 3.12 → ^8.1.0
- pug 2.0.3 → ^3.0.4
- express 4.16.3 → ^4.22.1
- morgan 1.9.0 → ^1.10.1
- cors 2.8.4 → ^2.8.6
- compression 1.7.2 → ^1.8.1

**New env vars:**
- `OCW_NETWORK` — one of `mainnet|regtest|testnet`, default `testnet`

## Non-Obvious Findings

**tiny-secp256k1 v2 in browser bundles**: tiny-secp256k1 v2 ships its
WASM via `import * as wasm from "./secp256k1.wasm"` (WebAssembly ESM
integration). esbuild doesn't support this natively — the first-try
wasm plugin pulls in top-level await, which is incompatible with both
es2020 target and IIFE output. Solution: a tiny custom esbuild plugin
in `scripts/build-bundle.js` that inlines the .wasm as base64 and calls
`new WebAssembly.Instance(new WebAssembly.Module(bytes), imports)`
synchronously. Keeps the IIFE/es2020 output intact and the existing
`<script src="/js/blockchain.js">` tag works unchanged.

**ln-service upgrade fixed integration-test module load**: the
pre-existing integration tests (`claim_success.js`, `refund_success.js`)
used to crash during module import because old ln-service pulled in
the deprecated native `grpc` binary module, which no longer builds on
Node 22+. After the migration to ln-service 58 (which uses
`@grpc/grpc-js`), those files import cleanly — the remaining test
failures are now pre-existing logic issues, not module-loading
failures.

## Pending / Blocked

- **Integration tests still failing, but for older reasons.**
  `test/claim_success.js` and `test/refund_success.js` now fail with
  "Callback was already called" errors from `async/internal/onlyOnce.js`
  — this is the `async` 2.x library interacting badly with newer
  Node internals. Fixing it means either bumping `async` to 3.x (minor
  breaking changes) or migrating the relevant tests to async/await.
  Not in Phase 2 scope. Also blocked by the bcoin regtest daemon
  question from Phase 1.
- **Git push still blocked.** SSH auth to github.com fails. 9 commits
  ahead of origin now. User needs to either start ssh-agent + add
  key, or switch remote to HTTPS to use gh's credential helper.
- **Pre-existing side-effect on module load.**
  `service/server_swap_key_pair.js` calls `process.exit()` if
  `OCW_CLAIM_BIP39_SEED` isn't set. Starting the server now requires
  that env var. This should probably be moved to a lazy check, but
  it's a separate task.

## Next Session Context

- Phase 2 is done. Phases 3 (testing) and 4 (modernization) remain
  from the audit.
- Next critical-path item is **Phase 3: testing**. The bcoin daemon
  test setup is 8 years old and the audit suggests replacing it with
  Bitcoin Core regtest. Also worth bumping `async` 2 → 3 and `bip39`
  2 → 3 to unblock the integration tests.
- Phase 4 items (frontend updates, WebLN/LNURL, async/await migration,
  TypeScript, BOLT 12, Taproot swap scripts) are all optional and
  not on the critical path.
- `bitcoin-ops`, `pushdata-bitcoin`, and `varuint-bitcoin` are still in
  `package.json`. These are used by `swaps/claim_transaction.js` and
  `swaps/refund_transaction.js`. Internalizing them (audit §2.16) is a
  later cleanup, not a blocker.

## Verification

- All 40 unit test assertions still pass (test_claim_transaction,
  test_refund_transaction, test_swap_address, test_swap_details,
  async-util).
- Server verified live: `curl http://localhost:9889/` → 200 OK,
  `curl http://localhost:9889/js/blockchain.js` → valid 2.9 MB IIFE
  bundle, `X-Powered-By` header absent.
- `OCW_NETWORK=mainnet|regtest|testnet` resolved correctly;
  `OCW_NETWORK=bogus` throws `UnknownNetwork:bogus` at startup.
