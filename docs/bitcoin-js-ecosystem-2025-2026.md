# Bitcoin & Lightning Network JS/Node.js Library Ecosystem: 2025-2026 State

Research conducted April 2026. This project (lightpay/orion) was last active circa 2018
with Node 8.9.4, npm 5.6.0, and the dependency versions listed in package.json.

---

## 1. bitcoinjs-lib

**Project version in package.json:** 3.3.2 (2018)
**Current version:** 7.0.1 (published ~February 2026)
**Repository:** https://github.com/bitcoinjs/bitcoinjs-lib

### Breaking Changes from v3 to v7

The library has undergone four major version bumps since this project was written. Each one
introduced significant breaking changes:

#### v3 -> v4 (2018-2019)
- **ECPair constructor removed from public API.** Must use `ECPair.fromPrivateKey()`,
  `ECPair.fromWIF()`, `ECPair.makeRandom()`, or `ECPair.fromPublicKey()`.
- **`bigi` dependency removed**, replaced with `bn.js` internally.
- **Script template functions removed** (`script.*.input/output/check`). Replaced by
  `payments.*` API (e.g., `payments.p2pkh`, `payments.p2wpkh`).
- Added `bip32` as a primary export.

#### v4 -> v5 (2019-2020)
- **Full TypeScript rewrite.** The library is now written in TypeScript.
- `TransactionBuilder.sign()` switched to a **single object parameter** with stricter
  type checks.
- `TransactionBuilder` deprecated with warnings that it would be removed in v6.

#### v5 -> v6 (2022)
- **`TransactionBuilder` removed entirely.** All transaction construction must use the
  **`Psbt` class** (BIP174 Partially Signed Bitcoin Transactions).
- **`ECPair` removed from the main library.** Install separately: `npm install ecpair`.
  This significantly reduces bundle size for apps that don't need crypto operations.
- **Taproot (BIP341/BIP342) support added.** `payments.p2tr` for Taproot key-path and
  script-path spends.
- Full SegWit native support (p2wpkh, p2wsh) solidified.

#### v6 -> v7 (2025)
- **Buffer -> Uint8Array migration.** The library moved away from Node.js `Buffer` toward
  `Uint8Array` for better browser compatibility. The `uint8array-tools` package (^0.0.9)
  provides polyfills for Buffer-like helper functions (reading little-endian integers, etc.).
- **ESM support work.** Efforts toward ESM module support using the browser's native
  crypto API.
- Minimum Node.js version: targets the current Node Maintenance LTS (Node 18+).
  TypeScript target matches ECMAScript features supported by Active Node LTS.

### Migration Impact on This Project

This project uses `TransactionBuilder`, `ECPair`, and `Buffer` extensively throughout
`/swaps` and `/chain`. All of these APIs have been removed or fundamentally changed.
Migration requires:

1. Replace all `TransactionBuilder` usage with `Psbt` class
2. Install `ecpair` and `bip32` as separate packages
3. Update all `Buffer` usage to `Uint8Array` (or use compatibility layer)
4. Replace `script.*` template calls with `payments.*` API
5. Update `bitcoin-ops` dependency (now integrated differently)

---

## 2. ln-service

**Project version in package.json:** 2.0.1 (2018)
**Current version:** 57.27.3 (published ~March 2026)
**Repository:** https://github.com/alexbosworth/ln-service
**Author:** Alex Bosworth (same author as this lightpay project)

### Key Changes

- The package has seen **55 major versions** since v2.0.1 -- an extraordinarily active
  development pace.
- Now depends on the `lightning` package (v10.26.2) for core gRPC interaction.
- Supports LND versions through at least v0.18.x and v0.19.x-beta. Some methods like
  `getRoutingFeeEstimate` require LND 0.19+.
- LND v0.19.0-beta (released June 2025) focuses on security, scalability, and reliability
  for bitcoin and stablecoin transactions.
- The package remains actively maintained and is the de facto standard Node.js interface
  to LND.

### Migration Impact

The API has changed dramatically over 55 major versions. The v2 API used in this project
will bear little resemblance to v57. A full API audit against the current README/types
would be necessary. However, the core pattern (connect to LND via macaroon+TLS, call
methods) remains the same conceptually.

---

## 3. bcoin

**Not a dependency of this project, but relevant as an alternative Bitcoin implementation.**
**Last major release:** v2.x series. The v1.0.0 stable release was in 2018.
**Repository:** https://github.com/bcoin-org/bcoin

### Current Status

Bcoin appears to be in **low-maintenance mode**. Key indicators:

- The last blog post/roadmap was from early 2019
- GitHub activity has significantly declined compared to 2017-2018
- No v3 release was found in search results
- The project was historically used in production at Purse.io (now shut down) and Bitpay
- The npm package page references metadata from July 2018

### Alternatives

For a full JS Bitcoin node implementation, bcoin remains the only serious option.
For library-level Bitcoin functionality (transaction building, address generation),
**bitcoinjs-lib** is the clear standard. For RPC interaction with Bitcoin Core,
see section 4 below.

---

## 4. node-bitcoin-rpc and Alternatives

**Project version in package.json:** node-bitcoin-rpc 1.1.3 (2018)

### Current State of RPC Libraries

| Package | Version | Last Published | Status |
|---------|---------|---------------|--------|
| `node-bitcoin-rpc` | 1.1.3 | ~2018 | Unmaintained |
| `bitcoind-rpc` | 0.9.1 | ~2022 | Low activity |
| `bitcoin-core` | 4.x | ~2022 | Best option, but low recent activity |
| `bcrpc` | - | - | Minimal wrapper |
| `node-bitcoin` (jb55) | - | - | Zero-dependency, minimal |

### Recommended Replacement: `bitcoin-core`

The `bitcoin-core` package by ruimarinho is the most fully-featured modern option:
- GitHub: https://github.com/ruimarinho/bitcoin-core
- Exposes all Bitcoin Core RPC methods as camelCase'd functions
- Supports REST API in addition to RPC
- Has had security issues flagged (vulnerable `json-bigint` dependency in v3)

### Alternative Approach

Given the age of all these libraries, a modern approach would be to use a simple
HTTP client (`fetch` or `undici`) to call Bitcoin Core's JSON-RPC API directly.
The RPC interface is stable and well-documented, making a thin wrapper trivial.

---

## 5. Lightning Libraries

### bolt11

**Project dependency:** `bolt11` from `bitcoinjs/bolt11#wip` (git reference, 2018)
**Current npm version:** Available as `bolt11` on npm
**Repository:** https://github.com/bitcoinjs/bolt11

The bolt11 package provides encoding, decoding, and signing of Lightning invoices
per BOLT #11 specification. It remains the standard JS library for this purpose.

**Alternatives:**
- `light-bolt11-decoder` (v3.2.0) -- lightweight decode-only, no signature verification,
  minimal dependencies
- `@node-lightning/invoice` -- part of the node-lightning project

### LDK (Lightning Dev Kit) JavaScript Bindings

**Repository:** https://github.com/lightningdevkit
**npm:** `lightningdevkit`
**Status:** Beta (as of late 2025)

LDK provides autogenerated bindings for garbage-collected languages including
TypeScript/JavaScript/Wasm. The bindings were updated in December 2025.

Key points:
- TypeScript bindings are in **beta** with active bug-fixing for early adopters
- LDK Node (the ready-to-go node implementation) has UniFFI bindings for Swift,
  Kotlin, and Python -- but JS bindings come through the GC bindings, not UniFFI
- LDK is backed by Spiral (Block/Square) and is actively developed
- Provides an alternative to running LND -- you can embed a Lightning node directly
  in your application

### Other Lightning Libraries

- `lnd` npm package -- another way to interact with LND via gRPC
- `ln-sync` -- synchronization utilities for Lightning
- `@node-lightning/*` -- a collection of Lightning protocol libraries

---

## 6. Submarine Swap Libraries

### boltz-core

**npm:** `boltz-core`
**Repository:** https://github.com/BoltzExchange/boltz-core
**Type:** TypeScript reference library

Boltz is the most active submarine swap project with a JS/TS library:
- Used by the Boltz Web App and Boltz Backend
- Supports Bitcoin, Lightning, Liquid, and Rootstock
- Swap scripts originally based on Alex Bosworth's `submarineswaps/swaps-service`
  (the predecessor to this lightpay project)
- Recent versions bumped to use ECPair v3 and swap contracts v5
- Backend v3.12.0 (November 2025) added swap restoration, batch sweeps, self-payment
  support, and Magic Routing Hints

### boltz-client SDKs

Boltz provides client SDKs for multiple platforms:
- TypeScript/JavaScript (reference)
- Kotlin, Flutter, Python, React Native, Swift
- WebAssembly support for browser apps

### Lightning Loop

**Repository:** https://github.com/lightninglabs/loop
**Maintained by:** Lightning Labs

Loop is a non-custodial submarine swap service (Loop In/Loop Out). It is primarily
a Go service with a gRPC API, not an npm library. You interact with it via:
- `loopd` daemon + `loop` CLI
- gRPC API (JavaScript client available)

**2025 updates:**
- MuSig2 integration for advance funding of Loop In swaps
- Instant Loop Out without waiting for block confirmations

### This Project's Swap Code

The `/swaps` directory in this project contains Alex Bosworth's original submarine swap
implementation, which predates both Boltz and Loop. The swap script patterns here were
influential in the ecosystem -- Boltz explicitly credits `submarineswaps/swaps-service`.

---

## 7. Node.js Version Requirements

**This project specifies:** Node 8.9.4, npm 5.6.0

### Current Node.js LTS Versions (April 2026)

| Version | Status | End of Life |
|---------|--------|------------|
| Node 8 | **EOL since December 2019** | No security patches |
| Node 10 | EOL since April 2021 | No security patches |
| Node 12 | EOL since April 2022 | No security patches |
| Node 14 | EOL since April 2023 | No security patches |
| Node 16 | EOL since September 2023 | No security patches |
| Node 18 | **EOL** (ended ~April 2025) | No security patches |
| Node 20 | **Maintenance LTS** | April 2026 (imminent) |
| Node 22 | **Active LTS** | October 2027 |
| Node 24 | Current (not yet LTS) | - |

### Library Requirements

| Library | Minimum Node.js |
|---------|----------------|
| bitcoinjs-lib v7 | Node 18+ (targets Maintenance LTS) |
| ln-service v57 | Node 18+ (modern ES features) |
| tap v21 | Node 18+ |
| bolt11 (current) | Node 14+ likely, Node 18+ recommended |

**Bottom line:** This project needs to move from Node 8 to **Node 22 LTS** at minimum.
Node 20 is about to enter EOL. The jump from Node 8 to Node 22 spans 7 major versions
and involves fundamental V8 engine changes, ES module support, `globalThis`, optional
chaining, nullish coalescing, top-level await, and much more.

---

## 8. npm/yarn Ecosystem Changes

### package-lock.json Format

| npm Version | Lockfile Version | Bundled With Node |
|-------------|-----------------|-------------------|
| npm 5-6 | lockfileVersion: 1 | Node 8-14 |
| npm 7-8 | lockfileVersion: 2 | Node 16-18 |
| npm 9-10 | lockfileVersion: 3 | Node 20-22 |

This project's `package-lock.json` uses lockfileVersion 1. Running `npm install` on
Node 20+ will automatically upgrade it to lockfileVersion 3. The formats are backwards
compatible, but the newer format includes complete dependency resolution information
(no longer needs to read from `node_modules/` or the registry).

### Other Ecosystem Changes

- **`npm audit`** is now built-in and runs automatically on `npm install`
- **Yarn Classic (v1)** is in maintenance mode; Yarn Berry (v2+) uses Plug'n'Play
  by default (no `node_modules/`)
- **`engines` field enforcement:** npm 7+ respects `engines` in package.json by default
  with `engine-strict`
- **Peer dependencies:** npm 7+ auto-installs peer dependencies (npm 6 and below did not)
- **Workspaces** are now natively supported in npm
- **`exports` field** in package.json controls module entry points (ESM/CJS dual packages)

---

## 9. tap Test Framework

**Project version in devDependencies:** tap 11.1.1 (2018)
**Current version:** 21.6.2 (published ~March 2026)
**Website:** https://node-tap.org/
**Repository:** https://github.com/tapjs/tapjs

### Major Changes from v11 to v21

The tap framework has undergone a complete rewrite:

- **Full TypeScript support** with type-checked assertions
- **ESM support** natively
- **Snapshot testing** built-in
- **Object/method spies and module mocking** included
- **File system fixtures** for test setup/teardown
- **Comprehensive code coverage** analysis integrated
- **Color-accessible test reporters**
- **Node.js built-in test runner interop** -- can output serialized test messages
  when run with `NODE_TEST_CONTEXT=child-v8`
- **TypeScript strip-types support** via `--type-strip-only` flag (for Node's
  `--experimental-strip-types`)

### Migration Impact

The test files in `/test/*.js` use tap v11 API. While tap maintains reasonable
backwards compatibility for basic assertions (`t.ok`, `t.equal`, `t.deepEqual`),
the configuration, CLI flags, and advanced features have changed significantly.
The `tap test/*.js` script in package.json should still work conceptually, but
the test files may need updates for API changes.

### Alternative: Node.js Built-in Test Runner

Node 18+ includes a built-in test runner (`node:test` module) that outputs TAP
format. For a project this size, migrating to the built-in test runner could
eliminate the tap dependency entirely.

---

## Summary: Migration Effort

Bringing this project to the current ecosystem would require:

| Area | Effort | Notes |
|------|--------|-------|
| Node.js 8 -> 22 | High | 7 major versions, fundamental runtime changes |
| bitcoinjs-lib 3 -> 7 | **Very High** | Every API surface has changed |
| ln-service 2 -> 57 | **Very High** | 55 major versions of API evolution |
| node-bitcoin-rpc | Medium | Replace with `bitcoin-core` or raw fetch |
| bolt11 | Medium | Update from git ref to npm package |
| tap 11 -> 21 | Low-Medium | Basic API compatible, config changes |
| package-lock.json | Automatic | Regenerated on first `npm install` |
| Buffer -> Uint8Array | High | Pervasive change if following bitcoinjs-lib v7 |

The biggest blockers are bitcoinjs-lib and ln-service, both of which have
fundamentally different APIs. The swap logic in `/swaps` would need to be
substantially rewritten using the Psbt class and current payment APIs.
