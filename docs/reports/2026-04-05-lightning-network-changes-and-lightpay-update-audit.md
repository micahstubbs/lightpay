# Lightning Network Changes 2018-2026 and LightPay Update Audit

**Generated:** 2026-04-05
**Topic:** Comprehensive research on Lightning Network ecosystem changes since 2018 and exhaustive audit of what needs updating in the LightPay (Orion) codebase.

## Executive Summary

LightPay was last updated circa 2018 when the Lightning Network was in its infancy (~225 BTC capacity, ~12,500 channels). Eight years later, the network has grown to ~5,000 BTC capacity with 12M+ monthly transactions, and the entire technology stack has undergone fundamental transformations. The codebase's core dependencies -- bitcoinjs-lib (v3.3.2), ln-service (v2.0.1), and node-bitcoin-rpc (v1.1.3) -- are all deeply obsolete, with bitcoinjs-lib alone having gone through four breaking major versions. The project runs on Node.js 8.9.4, which has been end-of-life since December 2019.

Updating LightPay is effectively a rewrite of the swap logic, transaction construction, and Lightning integration layers while preserving the architectural concepts (which remain sound -- submarine swaps are now a $1B+ monthly volume category). The swap script patterns pioneered in this codebase directly influenced Boltz Exchange, the leading non-custodial swap service.

This report catalogs every component requiring updates, organized by severity and dependency order.

---

## Part 1: What Changed in Bitcoin Lightning (2018-2026)

### 1.1 Protocol and Specification Changes

**New BOLTs:**
- **BOLT 12 (Offers)** -- Merged 2024, the first new BOLT since 2017. Reusable payment codes replacing single-use BOLT 11 invoices. Supported by CLN, Eclair, LDK; LND still implementing prerequisites.

**Major BOLT revisions:**
- **BOLT 2** -- v2 channel establishment (interactive-tx) for dual-funded channels, splicing, and taproot channels. Channel quiescence (stfu protocol) added.
- **BOLT 3** -- Anchor output variants (`option_anchors_zero_fee_htlc_tx`), work on taproot commitment formats.
- **BOLT 4** -- Route blinding (blinded paths) and onion messages (type 387).
- **BOLT 9** -- Dozens of new feature flags for anchors, dual-funding, route blinding, onion messages, splicing (bits 62/63).

**bLIP process established** -- Bitcoin Lightning Improvement Proposals for optional features: keysend (bLIP-3), channel jamming endorsement (bLIP-4), LSP specs (LSPS0/1/2).

### 1.2 Taproot Integration (Nov 2021 activation)

- **Simple taproot channels**: P2TR funding outputs with MuSig2 for 2-of-2 multisig. Cooperative closes indistinguishable from single-sig spends. LND experimental since v0.17 (2023); Eclair added taproot+splice+dual-fund (2025).
- **MuSig2 in production**: Lightning Labs deployed MuSig2 in Loop submarine swaps (Feb 2025).
- **PTLCs**: Theoretically possible post-Taproot but no production deployment. Still research-phase.

### 1.3 Major New Features Deployed Since 2018

| Feature | Status | Impact on Swap Services |
|---------|--------|------------------------|
| Multi-Part Payments (MPP) | Universal | Payments can be split across paths; improves reliability |
| Anchor outputs | Universal | Fee bumping for commitment txs; standard for all new channels |
| Route blinding | CLN/Eclair/LDK | Receiver privacy; used by BOLT 12 |
| Splicing | CLN/Eclair/LDK | Resize channels without closing; improves liquidity management |
| Dual-funded channels | CLN/Eclair/partial LDK | Both parties fund channel opens |
| Onion messages | CLN/Eclair/LDK | Transport layer for BOLT 12; no HTLC required |
| AMP (keysend multipath) | LND only | Spontaneous multipath payments |
| Trampoline routing | Eclair/Phoenix only | Delegated pathfinding for mobile clients |
| Async payments | Eclair/Phoenix | Pay offline nodes via trampoline relay |

### 1.4 Network Growth

| Metric | 2018 | 2026 |
|--------|------|------|
| Nodes | ~4,070 | ~17,000 |
| Channels | ~12,500 | ~40,000 |
| Capacity | 225 BTC | ~4,900 BTC |
| Monthly transactions | Minimal | 12M+ |
| Monthly volume | Negligible | $1B+ |

### 1.5 Ecosystem Evolution

- **LSPs** (Lightning Service Providers): Breez, Voltage, ACINQ/Phoenix, Lightspark -- abstract channel management for end users
- **LNURL protocol suite**: lnurl-pay, lnurl-withdraw, lnurl-auth, lnurl-channel -- HTTP-based payment coordination
- **Lightning Address**: user@domain.com identifiers built on LNURL-pay
- **Nostr Wallet Connect (NWC)**: Remote wallet control via Nostr relays (NIP-47)
- **WebLN**: Browser-based Lightning payment API (Alby dominant extension)
- **Submarine swaps matured**: Loop (Lightning Labs) and Boltz Exchange now handle multi-asset swaps including USDT

### 1.6 Security

- **Replacement cycling attack** (CVE-2023-40231 et al.): Exploits RBF to cycle honest HTLC-timeout transactions from mempool. Mitigated but not fully solved.
- **Channel jamming**: Ongoing research; bLIP-4 experimental endorsement is most concrete deployable step.
- **Watchtowers**: LND built-in; altruistic model only (no economic incentive layer).
- **Static Channel Backups (SCB)**: Standard in LND since v0.6 (2019).

### 1.7 Regulatory

- **US**: FinCEN has not definitively classified LN routing nodes. Non-custodial swap services in gray area. GENIUS Act (Jul 2025) brought stablecoins under BSA.
- **EU**: MiCA Phase 2 (Dec 2024) + Travel Rule enforcement. Every crypto transfer must include sender/recipient details -- fundamentally conflicts with Lightning's onion routing. Mid-2026 deadline for full compliance.

---

## Part 2: Exhaustive LightPay Update Audit

### Critical Priority (Blockers -- Must Fix First)

#### 2.1 Node.js Runtime: 8.9.4 -> 22 LTS

**Current:** Node 8.9.4 (EOL since December 2019)
**Required:** Node 22 LTS (Active LTS through October 2027)

**What breaks:**
- All current versions of project dependencies require Node 18+
- 7 major Node.js versions of V8 engine changes
- ES module support, `globalThis`, optional chaining, nullish coalescing, top-level await
- `Buffer` API changes (constructor deprecation, `Buffer.alloc`/`Buffer.from` required)
- Native `crypto` module improvements
- `http` module changes (keep-alive default behavior)

**Files affected:** Every `.js` file in the project (runtime compatibility)

**Action:** Update `engines` field in `package.json` to `"node": ">=22"`, update npm to latest.

---

#### 2.2 bitcoinjs-lib: 3.3.2 -> 7.0.1

**This is the single largest migration effort.** Four breaking major versions with fundamental API redesign.

##### 2.2.1 TransactionBuilder -> Psbt (Removed in v6)

`TransactionBuilder` was the core API for building transactions and was removed entirely in v6. All transaction construction must use the `Psbt` (BIP174 Partially Signed Bitcoin Transactions) class.

**Files requiring rewrite:**

| File | Current API | Required Migration |
|------|-------------|-------------------|
| `swaps/claim_transaction.js` | `new Transaction()`, `tx.addInput()`, `tx.addOutput()`, `tx.hashForSignature()`, `tx.hashForWitnessV0()`, `tx.setInputScript()`, `tx.setWitness()` | Rewrite using `new Psbt()`, `psbt.addInput()`, `psbt.addOutput()`, `psbt.signInput()`, `psbt.finalizeInput()` with custom finalizer for HTLC scripts |
| `swaps/refund_transaction.js` | Same as above plus unsigned tx generation | Same Psbt migration; unsigned case uses `psbt.toBase64()` instead of raw tx hex |
| `swaps/swap_output.js` | `Transaction.fromHex()`, `transaction.getId()` | `Transaction.fromHex()` still exists but API may differ |
| `swaps/swap_script_in_tx.js` | `Transaction.fromHex()`, `crypto.sha256()` | Update import paths |
| `service/transaction_has_scriptpub.js` | `Transaction.fromHex()` | Update import paths |
| `test/macros/send_chain_tokens_tx.js` | Transaction construction | Full Psbt rewrite |

**Key challenge:** The claim and refund transactions use custom HTLC scripts with non-standard signing paths (preimage reveal in witness, CLTV timelock). The Psbt class requires custom `finalizeInput` callbacks for non-standard scripts. This is the most complex migration task.

##### 2.2.2 ECPair Extraction (Removed from main lib in v6)

`ECPair` was extracted to a separate `ecpair` npm package.

**Files affected:**

| File | Usage |
|------|-------|
| `chain/generate_key_pair.js` | `ECPair.makeRandom()`, `.getAddress()` |
| `swaps/claim_transaction.js` | `ECPair.fromWIF()`, `.sign()`, `ECSignature.toScriptSignature()` |
| `swaps/refund_transaction.js` | Same as claim |
| `service/server_swap_key_pair.js` | Key derivation output |
| `test/macros/address_for_public_key.js` | Public key operations |
| `test/macros/send_chain_tokens_tx.js` | Key operations |

**Action:** Install `ecpair` and `@noble/secp256k1` (or `tiny-secp256k1`) as separate dependencies. Update all imports. `ECSignature` no longer exists -- use `script.signature.encode()` instead.

##### 2.2.3 Script Template API -> Payments API (Changed in v4)

The `script.*.input/output/check` templates were replaced by `payments.*` API.

**Files affected:**

| File | Current API | Required Migration |
|------|-------------|-------------------|
| `swaps/swap_address.js` | `script.scriptHash.output.encode()`, `script.witnessScriptHash.output.encode()`, `script.witnessPubKeyHash.output.encode()` | `payments.p2sh()`, `payments.p2wsh()`, `payments.p2wpkh()` |
| `swaps/swap_script_details.js` | `script.decompile()`, `toASM()`, `script.scriptHash.output.encode()`, `script.witnessScriptHash.output.encode()`, `script.witnessPubKeyHash.output.encode()` | `payments.*` API + `script.decompile()` (still exists but output format changed) |

##### 2.2.4 HDNode -> bip32 Package (Changed in v4)

`HDNode` was extracted to the `bip32` package.

**Files affected:**

| File | Current API | Required Migration |
|------|-------------|-------------------|
| `service/server_swap_key_pair.js` | `HDNode.fromSeedBuffer()`, `.derivePath()`, `.keyPair.toWIF()`, `.keyPair.getPublicKeyBuffer()` | `bip32.fromSeed()`, `.derivePath()`, `.toWIF()`, `.publicKey` |

##### 2.2.5 Buffer -> Uint8Array (Changed in v7)

bitcoinjs-lib v7 migrated from Node.js `Buffer` to `Uint8Array`. The `uint8array-tools` package provides helper functions.

**Files affected:** Every file that creates or manipulates `Buffer` objects for Bitcoin data -- essentially ALL files in `swaps/`, `chain/`, and `service/`.

**Action:** Either pin to bitcoinjs-lib v6 (keeps Buffer) or migrate all Buffer usage to Uint8Array with `uint8array-tools`.

##### 2.2.6 New Dependencies Required

```json
{
  "ecpair": "^3.x",
  "bip32": "^4.x",
  "tiny-secp256k1": "^2.x",
  "uint8array-tools": "^0.0.9"
}
```

Remove: `bitcoin-ops` (opcodes now accessed via bitcoinjs-lib), `pushdata-bitcoin`, `varuint-bitcoin` (may be internalized).

---

#### 2.3 ln-service: 2.0.1 -> 57.x

**55 major versions** of API evolution. The core pattern (connect to LND via macaroon+TLS) remains, but the API surface has changed dramatically.

**Files affected:**

| File | Current API | Notes |
|------|-------------|-------|
| `lightning/create_address.js` | `lightningDaemon({cert, host, macaroon})`, `createAddress({lnd})` | Connection API likely changed; `lightningDaemon` may be renamed |
| `lightning/pay_invoice.js` | `payInvoice({lnd, invoice, wss: []})` returns `{payment_secret}` | Return format likely changed; MPP support added |

**Action:** Audit current ln-service v57 API documentation. The `authenticatedLndGrpc` function likely replaces `lightningDaemon`. `payInvoice` likely returns different fields. Payment now supports MPP, keysend, AMP, and BOLT 12.

**LND version requirement:** ln-service v57 requires LND v0.18+ (ideally v0.19+). The project's LND integration must target a modern LND release.

---

#### 2.4 node-bitcoin-rpc: 1.1.3 -> Replace Entirely

**Status:** Unmaintained since 2018.

**Files affected:**

| File | Usage |
|------|-------|
| `chain/chain_rpc.js` | All Bitcoin RPC calls (12 different commands) |

**Options:**
1. **`bitcoin-core` package** (ruimarinho) -- most fully-featured replacement
2. **Raw `fetch`/`undici`** -- minimal wrapper over JSON-RPC (recommended for modern Node.js)
3. **Keep custom wrapper** but replace underlying HTTP client

**Action:** Replace `node-bitcoin-rpc` with either `bitcoin-core` or a thin `fetch`-based wrapper. The RPC command interface itself (getblock, sendrawtransaction, etc.) is stable.

---

### High Priority (Core Functionality)

#### 2.5 Swap Script Updates

The swap scripts in `swaps/pk_swap_script.js` and `swaps/pkhash_swap_script.js` use OP_SHA256 for the payment hash lock. This is still correct for HTLC-based swaps, but several improvements are needed:

| Issue | File(s) | Action |
|-------|---------|--------|
| Script construction uses raw opcode arrays with `bitcoin-ops` | `pk_swap_script.js`, `pkhash_swap_script.js` | Update to use bitcoinjs-lib v7 script compilation API |
| No Taproot script path support | Both script files | Add P2TR script-path spend option for Taproot-aware wallets (optional but recommended) |
| Fee calculation uses legacy weight estimation | `claim_transaction.js` lines 164-188 | Update weight estimation for Taproot inputs if adding P2TR support |
| Hardcoded `witness_byte_discount_denominator: 4` | `chain/conf/constants.json` | Still correct, but verify against current library constants |

#### 2.6 Address Format Updates

**File:** `swaps/swap_address.js`

Currently generates three address formats: P2SH, P2SH-P2WSH, P2WSH. Updates needed:

| Issue | Action |
|-------|--------|
| Uses deprecated `script.scriptHash.output.encode()` API | Migrate to `payments.p2sh()`, `payments.p2wsh()` |
| No P2TR (Taproot) address generation | Add `payments.p2tr()` option for Taproot-compatible swaps |
| Frontend defaults to P2SH (legacy) address | `public/js/main.js` line 810: Change default to P2WSH or P2TR |
| Bech32m encoding for P2TR | Ensure address library supports bech32m (BIP350) |

#### 2.7 Address Validation Updates

**File:** `service/get_address_details.js`

| Issue | Action |
|-------|--------|
| Uses `address.fromBase58Check()` and `address.fromBech32()` | Update to current bitcoinjs-lib address parsing API |
| No bech32m (P2TR) address validation | Add support for `bc1p...` / `tb1p...` addresses |
| Hardcoded testnet-only validation (line 94) | Make network configurable; add mainnet support |

#### 2.8 Key Generation and Derivation

**File:** `chain/generate_key_pair.js`

| Issue | Action |
|-------|--------|
| `ECPair.makeRandom({network})` | Use `ecpair` package: `ECPairFactory(ecc).makeRandom({network})` |
| `.getAddress()` method | Removed; use `payments.p2wpkh({pubkey}).address` |
| `.hash160()` method | Use `crypto.hash160()` from bitcoinjs-lib |

**File:** `service/server_swap_key_pair.js`

| Issue | Action |
|-------|--------|
| `HDNode.fromSeedBuffer()` | Use `bip32.fromSeed()` from `bip32` package |
| `.keyPair.toWIF()` / `.keyPair.getPublicKeyBuffer()` | Use `.toWIF()` / `.publicKey` directly on bip32 node |
| `bip39.mnemonicToSeed()` returns Buffer | May need Uint8Array conversion for bip32 v4+ |

---

### Medium Priority (Infrastructure and Tooling)

#### 2.9 bolt11 Invoice Library

**Current:** `bolt11` from `bitcoinjs/bolt11#wip` (git reference)
**Action:** Switch to `bolt11` npm package (stable release). Or consider `light-bolt11-decoder` for decode-only use cases.

**Files affected:**
- `service/get_invoice_details.js` -- decode API
- `test/macros/generate_invoice.js` -- encode + sign API

**BOLT 12 consideration:** If adding BOLT 12 (Offers) support, a separate library is needed. No mature JS BOLT 12 library exists yet; this would require ln-service integration or LDK bindings.

#### 2.10 Express and Middleware Updates

| Package | Current | Latest | Breaking Changes |
|---------|---------|--------|-----------------|
| `express` | 4.16.3 | 4.21.x / 5.x | v5 is a major rewrite; v4.21 is safe update |
| `body-parser` | 1.18.2 | Built into Express 4.16+ | Can remove; use `express.json()` |
| `helmet` | 3.12.0 | 8.x | v4+ changed to opt-in; `.hidePoweredBy()` -> `helmet()` |
| `compression` | 1.7.2 | 1.8.x | Minor updates only |
| `cors` | 2.8.4 | 2.8.5 | Compatible |
| `morgan` | 1.9.0 | 1.10.0 | Compatible |
| `pug` | 2.0.3 | 3.0.3 | v3 has breaking API changes |
| `browserify-middleware` | 8.1.0 | 8.1.1 | Compatible but consider replacing with Vite/esbuild |

**Files affected:**
- `server.js` -- all middleware setup
- `views/*.pug` -- may need updates for pug v3

#### 2.11 Frontend Modernization

**File:** `public/js/main.js` (~1056 lines of jQuery + Fetch)

| Issue | Action |
|-------|--------|
| jQuery dependency for DOM manipulation | Consider vanilla JS (modern browsers) or lightweight framework |
| `browserify-middleware` for client bundling | Replace with esbuild, Vite, or Rollup |
| QR code library (`kjua`) | Verify still maintained; update if needed |
| Hardcoded 1.5% swap fee (line 728) | Make configurable |
| No LNURL/Lightning Address support | Add LNURL-pay for payment UX |
| No WebLN integration | Add `window.webln` support for browser wallet payments |
| Default swap address is P2SH (line 810) | Default to P2WSH or P2TR |
| No mobile-responsive design updates | Modern CSS/responsive layout |

#### 2.12 Test Framework

**Current:** tap 11.1.1
**Target:** tap 21.x or Node.js built-in test runner

**Files affected:**
- `test/test_swap_address.js`
- `test/test_claim_transaction.js`
- `test/test_refund_transaction.js`
- `test/test_swap_details.js`
- `test/claim_success.js`
- `test/refund_success.js`
- `test/macros/*.js`

**Basic assertions (`t.ok`, `t.equal`) are likely compatible.** Configuration and CLI may need updates.

**Integration tests** (`claim_success.js`, `refund_success.js`) spawn a btcd regtest daemon. This may need updating:
- btcd may need to be replaced with Bitcoin Core regtest
- Block maturity count (432) should be verified
- Mining RPC commands may differ

#### 2.13 Configuration Hardcoding

| Hardcoded Value | File | Line(s) | Action |
|----------------|------|---------|--------|
| Network: always `'testnet'` | Multiple | Throughout | Make configurable (mainnet/testnet/regtest/signet) |
| Swap fee: 1.5% | `service/create_swap.js` | 12 | Make configurable via env var |
| Swap timeout: 144 blocks | `service/create_swap.js` | 13 | Make configurable; consider shorter for Taproot channels |
| Min swap: 100,000 sats | `service/create_swap.js` | 10 | Review; network can handle smaller swaps now |
| Block search depth: 288 | `service/find_swap_outpoint.js` | 10 | Make configurable |
| Fee cache: 15 minutes | `service/get_price.js` | 8 | Review; fee market volatility has increased |
| RPC credentials | `chain/conf/chain_server.json` | All | Move to environment variables |
| Bitcoin testnet addresses only | `service/get_address_details.js` | 94 | Add mainnet + signet support |

---

### Lower Priority (Nice-to-Have Modernizations)

#### 2.14 Async/Callback Pattern Modernization

The entire codebase uses Node.js callback style with `async/auto` for orchestration. While functional, this predates `async/await`.

**Current pattern:**
```javascript
asyncAuto({
  step1: cbk => doSomething(cbk),
  step2: ['step1', ({step1}, cbk) => doNext(step1, cbk)]
}, returnResult({of: 'step2'}, cbk));
```

**Modern equivalent:**
```javascript
const step1 = await doSomething();
const step2 = await doNext(step1);
return step2;
```

**Scope:** Every file in `service/`, `chain/`, `lightning/`, and the router. This is a large refactor but would dramatically improve readability and debuggability.

**Recommendation:** Keep `async/auto` for the initial update (it still works) and modernize incrementally. The `async` package v2.6.0 -> v3.x supports native promises alongside callbacks.

#### 2.15 Error Handling Modernization

Error arrays `[errorCode, 'ErrorMessage', detail]` are non-standard. Modern approach: use Error subclasses with `code` and `detail` properties.

**Files affected:** Every service function and route handler.

#### 2.16 Additional Dependency Updates

| Package | Current | Action |
|---------|---------|--------|
| `async` | 2.6.0 | Update to 3.x (adds native promise support) |
| `bip39` | 2.5.0 | Update to 3.x (wordlist changes, async API) |
| `bip65` | 1.0.3 | Check compatibility; likely still works |
| `coin-ticker` | 3.2.0 | Likely broken; Bitfinex API may have changed. Replace with modern price API |
| `uuid` | 3.2.1 | Update to 11.x; API changed from `uuid.v4()` to `import { v4 } from 'uuid'` |
| `walnut` | 0.0.3 | Version checker; remove or replace |
| `ora` (dev) | 2.0.0 | Update to 8.x if still needed |
| `prompt` (dev) | 1.0.0 | Replace with `readline` or `inquirer` |
| `rimraf` (dev) | 2.6.2 | Update to 6.x or use `fs.rm({recursive: true})` (Node 16+) |

#### 2.17 Security Updates

| Issue | Action |
|-------|--------|
| No rate limiting on API endpoints | Add express-rate-limit |
| No input validation library | Add joi or zod for request validation |
| Helmet v3 defaults are weaker than v8 | Update helmet; enable all protections |
| No CSRF protection | Add if serving forms |
| BIP39 seed in environment variable | Consider encrypted storage or HSM |
| RPC credentials in JSON config file | Move all secrets to env vars |
| No TLS on Express server | Add HTTPS or run behind reverse proxy |

#### 2.18 New Feature Opportunities

These are not required for basic functionality but would bring LightPay to modern standards:

| Feature | Description | Complexity |
|---------|-------------|-----------|
| BOLT 12 invoice support | Accept offers in addition to BOLT 11 invoices | High (requires ln-service v57+) |
| Taproot swap scripts | P2TR script-path swaps for privacy and lower fees | High |
| LNURL-pay integration | User-friendly payment flow | Medium |
| Lightning Address | Receive swap requests via user@domain | Medium |
| WebLN browser support | One-click payments from Alby etc. | Low |
| MPP-aware fee estimation | Account for multi-part payment routing | Medium |
| Signet support | Modern testnet alternative | Low |
| Docker containerization | Reproducible deployment | Low |
| TypeScript migration | Type safety for Bitcoin script construction | High |
| Mainnet support | Production deployment beyond testnet | Medium (config + testing) |

---

## Part 3: Recommended Update Sequence

### Phase 1: Foundation (Must complete first)

1. **Update Node.js** to 22 LTS
2. **Update package.json** engine requirements
3. **Install new core dependencies**: `ecpair`, `bip32`, `tiny-secp256k1`, `uint8array-tools`
4. **Update bitcoinjs-lib** to v6 (not v7 -- defer Uint8Array migration)
5. **Rewrite swap transaction builders** (`claim_transaction.js`, `refund_transaction.js`) using Psbt
6. **Rewrite address generation** (`swap_address.js`) using payments API
7. **Update key generation** (`generate_key_pair.js`, `server_swap_key_pair.js`)
8. **Update script parsing** (`swap_script_details.js`) for new decompile API

### Phase 2: Integration Layer

9. **Replace node-bitcoin-rpc** with `bitcoin-core` or fetch wrapper
10. **Update ln-service** to v57; rewrite Lightning connection and payment code
11. **Update bolt11** to npm package release
12. **Update Express middleware** (helmet, body-parser removal, pug)
13. **Fix all hardcoded configurations** (network, fees, timeouts)

### Phase 3: Testing and Verification

14. **Update tap** to v21 or migrate to Node.js built-in test runner
15. **Fix integration tests** (btcd -> Bitcoin Core regtest if needed)
16. **Rewrite unit tests** for new API surfaces
17. **Add address validation tests** for bech32m/P2TR
18. **Add mainnet configuration tests**

### Phase 4: Modernization (Optional)

19. **Frontend updates** (bundler, WebLN, LNURL)
20. **Async/await migration** (incremental)
21. **TypeScript migration** (incremental)
22. **BOLT 12 support**
23. **Taproot swap scripts**
24. **Docker deployment**

---

## Part 4: Dependency Version Mapping

| Dependency | Current | Target | Breaking? |
|-----------|---------|--------|-----------|
| Node.js | 8.9.4 | 22.x | Yes - 7 major versions |
| bitcoinjs-lib | 3.3.2 | 6.1.x (then 7.x) | Yes - 4 major versions |
| ln-service | 2.0.1 | 57.x | Yes - 55 major versions |
| node-bitcoin-rpc | 1.1.3 | Remove (use bitcoin-core or fetch) | Yes - full replacement |
| bolt11 | git#wip | npm latest | Likely breaking |
| async | 2.6.0 | 3.x | Minor (adds promises) |
| bip39 | 2.5.0 | 3.x | Yes (async API) |
| bip65 | 1.0.3 | 1.0.3 | No |
| bitcoin-ops | 1.4.1 | Remove (internalized) | N/A |
| body-parser | 1.18.2 | Remove (use express.json()) | N/A |
| browserify-middleware | 8.1.0 | Replace with esbuild/Vite | Yes |
| coin-ticker | 3.2.0 | Replace entirely | Yes |
| compression | 1.7.2 | 1.8.x | No |
| cors | 2.8.4 | 2.8.5 | No |
| express | 4.16.3 | 4.21.x | No (stay on v4) |
| helmet | 3.12.0 | 8.x | Yes |
| morgan | 1.9.0 | 1.10.0 | No |
| pug | 2.0.3 | 3.0.x | Yes |
| pushdata-bitcoin | 1.0.1 | Remove or update | Check |
| uuid | 3.2.1 | 11.x | Yes (import style) |
| varuint-bitcoin | 1.1.0 | Update or remove | Check |
| walnut | 0.0.3 | Remove | N/A |
| ecpair | N/A | 3.x | New dependency |
| bip32 | N/A | 4.x | New dependency |
| tiny-secp256k1 | N/A | 2.x | New dependency |
| uint8array-tools | N/A | 0.0.9 | New dependency |
| tap | 11.1.1 | 21.x | Yes |
| ora | 2.0.0 | 8.x | Yes |
| rimraf | 2.6.2 | Remove (use fs.rm) | N/A |

---

## Sources

### Protocol and Specification
- [lightning/bolts GitHub](https://github.com/lightning/bolts)
- [Bitcoin Optech 2025 Year-in-Review](https://bitcoinops.org/en/newsletters/2025/12/19/)
- [bolt12.org](https://bolt12.org/)
- [Bitcoin Optech Topics](https://bitcoinops.org/en/topics/)
- [Lightning Labs Blog](https://lightning.engineering/blog/)
- [OpenSats: Advancements in Lightning Infrastructure](https://opensats.org/blog/advancements-in-lightning-infrastructure)
- [Lightning Labs: MuSig2 Powering Loop](https://lightning.engineering/posts/2025-02-13-loop-musig2/)

### Library Ecosystem
- [bitcoinjs-lib GitHub](https://github.com/bitcoinjs/bitcoinjs-lib)
- [bitcoinjs-lib CHANGELOG](https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/CHANGELOG.md)
- [ln-service GitHub](https://github.com/alexbosworth/ln-service)
- [ln-service npm](https://www.npmjs.com/package/ln-service)
- [bcoin GitHub](https://github.com/bcoin-org/bcoin)
- [bitcoin-core npm](https://www.npmjs.com/package/bitcoin-core)
- [LDK Documentation](https://lightningdevkit.org/)
- [bolt11 GitHub](https://github.com/bitcoinjs/bolt11)
- [boltz-core npm](https://www.npmjs.com/package/boltz-core)
- [tap (node-tap) website](https://node-tap.org/)

### Network and Ecosystem
- [Bitcoin Lightning Network Usage Statistics 2026 - CoinLaw](https://coinlaw.io/bitcoin-lightning-network-usage-statistics/)
- [Lightning Network Statistics - Bitcoin Visuals](https://bitcoinvisuals.com/lightning)
- [LSP Spec GitHub](https://github.com/BitcoinAndLightningLayerSpecs/lsp)
- [Boltz Exchange - Bitcoin Magazine](https://bitcoinmagazine.com/business/boltz-exchange-launches-atomic-usdt-swaps-for-lightning-network-users)
- [LND v0.19.0-beta](https://lightning.engineering/posts/2025-6-3-lnd-0.19-launch/)
- [Core Lightning v25.12 - Blockstream](https://blog.blockstream.com/core-lightning-25-12-boltzs-seamless-upgrade-experience/)

### Security
- [Replacement Cycling Attacks - Bitcoin Magazine](https://bitcoinmagazine.com/technical/postmortem-on-the-lightning-replacement-cycling-attack)
- [Channel Jamming - Bitcoin Optech](https://bitcoinops.org/en/topics/channel-jamming-attacks/)
- [bLIP-4: Experimental Endorsement Signaling](https://github.com/lightning/blips/blob/master/blip-0004.md)

### Regulatory
- [EU MiCA Regulation Guide 2026 - InnReg](https://www.innreg.com/blog/eu-crypto-regulation-guide)
- [Crypto Travel Rule Guide 2026 - InnReg](https://www.innreg.com/blog/crypto-travel-rule-guide)
- [FinCEN Guidelines - CoinGeek](https://coingeek.com/what-fincens-new-guidelines-mean-for-dapps-lightning-network-and-privacy-coins/)
