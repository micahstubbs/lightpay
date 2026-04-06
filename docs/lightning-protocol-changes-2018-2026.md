# Lightning Network Protocol and Specification Changes (2018-2026)

A comprehensive survey of major BOLT specification updates, new protocol features, and implementation progress across the Lightning Network ecosystem.

---

## 1. BOLT Spec Updates

The original Lightning specification comprised BOLTs 0 through 11 (with BOLT 6 superseded by BOLT 7), published in 2017. These cover:

| BOLT | Title |
|------|-------|
| 0 | Introduction and Index |
| 1 | Base Protocol (encoding, messaging, transport framing) |
| 2 | Peer Protocol for Channel Management (open, close, update) |
| 3 | Bitcoin Transaction and Script Formats (funding, commitment, HTLC txs) |
| 4 | Onion Routing Protocol (payment routing, onion messages) |
| 5 | Recommendations for On-chain Transaction Handling |
| 7 | P2P Node and Channel Discovery (gossip) |
| 8 | Encrypted and Authenticated Transport (Noise protocol) |
| 9 | Assigned Feature Flags |
| 10 | DNS Bootstrap and Assisted Node Location |
| 11 | Invoice Protocol for Lightning Payments |
| 12 | Offers (merged 2024 -- first new BOLT since 2017) |

**Key changes since 2018:**

- **BOLT 2** was substantially revised to add the v2 channel establishment protocol (interactive-tx), which underpins dual-funded channels, splicing, and eventually taproot channels. Channel quiescence (stfu protocol) was also added to safely pause channel operations during splice or upgrade.
- **BOLT 3** gained anchor output variants (`option_anchors_zero_fee_htlc_tx`), and work is underway for taproot-based commitment transaction formats.
- **BOLT 4** was extended with route blinding (blinded paths) and onion messages (type 387).
- **BOLT 9** continuously grew with new feature flag assignments for each protocol feature (anchors, dual-funding, route blinding, onion messages, splicing feature bits 62/63, etc.).
- **BOLT 12** (Offers) was officially merged into the bolts repository in 2024, the first new BOLT added since the original specification. It is supported by CLN, Eclair/Phoenix, and LDK.

Beyond BOLTs, the **bLIP** (Bitcoin Lightning Improvement Proposal) process was established for optional, implementation-specific features that do not require universal adoption. Notable bLIPs include keysend (bLIP-3), experimental endorsement signaling for channel jamming (bLIP-4), onion message DNS resolution (bLIP-32), and LSPS (Lightning Service Provider Specifications) for standardized LSP-wallet APIs.

Sources:
- [lightning/bolts GitHub repository](https://github.com/lightning/bolts)
- [lightning/blips GitHub repository](https://github.com/lightning/blips)
- [Bitcoin Optech Newsletter #385: 2025 Year-in-Review](https://bitcoinops.org/en/newsletters/2025/12/19/)

---

## 2. Taproot/Schnorr Integration

Bitcoin's Taproot soft fork activated in November 2021 (block 709,632), enabling Schnorr signatures (BIP 340), Tapscript (BIP 342), and pay-to-taproot (P2TR) outputs. The implications for Lightning are profound:

### Simple Taproot Channels

"Simple taproot channels" use P2TR funding outputs with MuSig2 (BIP 327) for the 2-of-2 multisig, making cooperative channel closes indistinguishable from single-sig spends on-chain. This reduces transaction weight and significantly improves privacy.

**Implementation timeline:**
- **2023**: LND v0.17.0-beta shipped experimental simple taproot channels (unannounced channels only), the first production deployment.
- **2024-2025**: LND continued refinement, adding taproot-aware RBF cooperative closing with JIT (Just-In-Time) nonce management for MuSig2 signing during RBF iterations (LND PR #10063).
- **2025**: Eclair #3103 added support for dual funding and splicing within simple taproot channels, the first implementation to combine all three features.

### MuSig2 in Production

MuSig2 moved beyond channels into broader Lightning infrastructure. In February 2025, Lightning Labs deployed MuSig2 in Loop (their submarine swap service), upgrading Loop In UTXOs so they are indistinguishable from normal single-sig UTXOs on-chain, reducing costs and improving privacy.

### Remaining Work

Simple taproot channels currently still use HTLCs internally. The transition to PTLCs (see below) is a separate, subsequent step. Announced (public/gossip) taproot channels require gossip protocol upgrades (gossip v1.5/v2) that are still in progress.

Sources:
- [Lightning Labs: MuSig2 Powering Loop](https://lightning.engineering/posts/2025-02-13-loop-musig2/)
- [Bitcoin Optech: Simple Taproot Channels](https://bitcoinops.org/en/topics/simple-taproot-channels/)
- [LND Taproot RBF Close PR #10063](https://github.com/lightningnetwork/lnd/pull/10063)

---

## 3. PTLCs vs HTLCs

### Background

Hash Time-Locked Contracts (HTLCs) use hash preimages (SHA-256) to conditionally route payments. Every hop along a payment route shares the same hash, creating a correlation vector: any two colluding nodes on the route can confirm they are part of the same payment.

Point Time-Locked Contracts (PTLCs) replace the hash with elliptic curve point/scalar pairs (adaptor signatures). Each hop uses a different point, breaking the correlation and making multi-hop payments private against colluding intermediaries.

### Status (as of early 2026)

PTLCs became theoretically possible after Taproot's activation (Schnorr signatures enable the required adaptor signature schemes). However, adoption requires:

1. **All channel types on the route** to support PTLCs -- a network-wide transition.
2. Specification work on PTLC-based commitment transactions and routing.
3. Implementation across all major nodes.

**Current state:** PTLCs remain in the research/early-specification phase. Simple taproot channels (deployed in LND since 2023) explicitly still use HTLCs, deferring PTLC support to a later upgrade. Suredbits built an early proof-of-concept using ECDSA adaptor signatures on Eclair, but production deployment has not occurred in any major implementation.

The consensus in the developer community is that PTLCs will come after simple taproot channels are widely deployed and after the gossip protocol is upgraded, making this a medium-to-long-term roadmap item.

Sources:
- [Bitcoin Optech: PTLCs](https://bitcoinops.org/en/topics/ptlc/)
- [Voltage: Point Time Locked Contracts](https://voltage.cloud/blog/lightning-network-faq/point-time-locked-contracts/)
- [Suredbits PTLC Proof of Concept](https://suredbits.com/ptlc-proof-of-concept/)

---

## 4. Route Blinding (Blinded Paths)

Route blinding (authored by t-bast/Bastien Teinturier) was merged into the BOLT specification under BOLT 4. It allows a payment recipient to provide a "blinded path" -- an encrypted set of route hints where intermediate node IDs and channel IDs are hidden from the sender.

### How It Works

The recipient constructs a blinded route from an introduction node to themselves. Each hop's information is encrypted so that only the node at that hop can decrypt its own forwarding instructions. The sender can reach the introduction node but learns nothing about the nodes or channels beyond it.

### Specification Status

- Merged into BOLT 4 (master branch of lightning/bolts).
- Integral to BOLT 12 Offers (blinded paths are used in invoice requests and invoices to protect receiver identity).
- Can also be used independently with BOLT 11 invoices, contrary to a common misconception that blinded paths are exclusively tied to BOLT 12.

### Implementation

- **CLN, Eclair, LDK**: Full support for creating and using blinded paths.
- **LND**: Pathfinding to blinded routes tracked in issue #7200; onion messaging (prerequisite) is being implemented as part of the BOLT 12 epic (issue #10220).
- **LDK (2025)**: Added support for dummy hops on blinded paths -- receivers can inject decoy hops (up to 10) that serve no routing purpose but obscure the true path length.

### Privacy Caveats

Payment probing can potentially unblind channels. Recipients should use sufficiently long blinded paths and rotate them to mitigate this.

Sources:
- [lightning/bolts: route-blinding.md](https://github.com/lightning/bolts/blob/master/proposals/route-blinding.md)
- [Voltage: What are Blinded Paths](https://www.voltage.cloud/blog/what-are-blinded-paths-and-how-do-they-work)
- [Lightning Privacy Research: Blinded Paths + Trampoline](https://lightningprivacy.com/en/blinded-trampoline)

---

## 5. BOLT 12 / Offers

BOLT 12 is the most significant new specification since the original BOLTs. It introduces "offers" -- reusable, static payment codes that replace single-use BOLT 11 invoices.

### Key Features

- **Reusable payment codes**: An offer can be paid multiple times (unlike BOLT 11 invoices which are single-use).
- **Native onion messaging**: Invoice request/response happens over onion messages, eliminating the need for external servers (HTTP, LNURL, etc.).
- **Blinded paths**: Built-in receiver privacy via route blinding.
- **Refunds**: Protocol-level support for refund flows.
- **Subscriptions**: Supports recurring payments natively.
- **Payer proofs**: Cryptographic proof that a specific payer made a payment.

### Specification and Merge History

- Proposed by Rusty Russell (Blockstream/CLN).
- Officially merged into the bolts repository in 2024, the first new BOLT since 2017.
- 2026: BOLTs #1316 clarified that `offer_amount` must be greater than zero when present.

### Implementation Support

| Implementation | BOLT 12 Status |
|---------------|---------------|
| Core Lightning | Full support (shipped 2024) |
| Eclair/Phoenix | Full support |
| LDK | Full support (announced "BOLT12 Has Arrived") |
| LND | In progress -- onion messaging epic (issue #10220) is the prerequisite; BOLT 12 support downstream |
| Strike | Announced support via LNDK backend (August 2024) |

### Adoption Trajectory

BOLT 12 adoption is accelerating but not yet universal. The LND ecosystem (the largest by node count) is still implementing the prerequisite onion messaging layer, which is needed before BOLT 12 invoices can be fetched and paid natively.

Sources:
- [bolt12.org](https://bolt12.org/)
- [Bitcoin Optech: Offers](https://bitcoinops.org/en/topics/offers/)
- [LDK Blog: BOLT12 Has Arrived](https://lightningdevkit.org/blog/bolt12-has-arrived/)
- [LND BOLT12 Epic: Issue #10220](https://github.com/lightningnetwork/lnd/issues/10220)

---

## 6. Splicing

Splicing allows a Lightning channel to be resized (funds added or removed) without closing and reopening it. The channel remains operational during the splice, and payments continue to flow.

### Types

- **Splice-in**: Add funds to an existing channel from on-chain.
- **Splice-out**: Remove funds from a channel to an on-chain address.

### Specification

Tracked as feature bits 62/63 in BOLT 9. The specification PR (BOLTs #1160) by t-bast defines the splice protocol built on top of the interactive-tx and quiescence protocols.

Notable spec refinements in 2025:
- BOLTs #1270: Increased delay before marking a channel as closed (from 12 to 72 blocks) to allow splice transaction propagation.
- BOLTs #1289: Reconnection logic for synchronized splice state.

### Implementation Progress (2024-2025)

| Implementation | Splicing Status |
|---------------|----------------|
| Core Lightning | Shipped; interop with Eclair finalized May 2025 (CLN 25.05) |
| Eclair | Full support including RBF for splice txs (#2925), on-the-fly funding via liquidity ads + splicing (#2861), and splicing in simple taproot channels (#3103) |
| LDK | Complete as of 2025: splice-out added August 2025, quiescence integration September 2025, shipped in LDK 0.2 release |
| LND | Not yet implemented; channel quiescence protocol added (#8270) as a prerequisite |

### Relationship to Liquidity Ads

Splicing integrates with liquidity ads: a node can advertise willingness to contribute funds to a splice operation, creating an on-chain marketplace for channel liquidity. Eclair implemented on-the-fly funding using liquidity ads with either dual-funding or splicing.

Sources:
- [Bitcoin Optech: Splicing](https://bitcoinops.org/en/topics/splicing/)
- [BOLTs PR #1160: Channel Splicing](https://github.com/lightning/bolts/pull/1160)
- [OpenSats: Advancements in Lightning Infrastructure](https://opensats.org/blog/advancements-in-lightning-infrastructure)

---

## 7. Dual-Funded Channels

Traditional Lightning channel opens are single-funded: only the initiator contributes funds. Dual-funded channels allow both parties to contribute, immediately enabling bidirectional payments and splitting opening costs.

### Protocol

The "v2 channel establishment protocol" (interactive-tx) in BOLT 2 enables dual funding. Two peers collaboratively construct the funding transaction using an interactive message exchange (`tx_add_input`, `tx_add_output`, `tx_complete`).

### Specification Status

Dual funding was officially merged into the Lightning specification. The first dual-funded mainnet channel was opened using Core Lightning.

### Implementation Support

| Implementation | Dual-Funding Status |
|---------------|-------------------|
| Core Lightning | Full support (first to ship) |
| Eclair | Full support, including dual-funding in taproot channels (#3103) |
| LDK | Accepting peer-initiated dual-funded channels (#3137 merged 2024); initiating still in progress |
| LND | Not yet implemented natively; Balance of Satoshi (BOS) tool provides a workaround |

### Liquidity Ads

Closely related to dual funding is the "liquidity ads" specification, where nodes advertise channel lease terms (duration, fee rate) via the gossip protocol. A node wanting inbound liquidity can accept an ad and open a dual-funded channel where the advertising node contributes the requested liquidity.

Eclair has been the most active implementation: extensible liquidity ads (#2848), griefing attack mitigation (#2982), and integration with splicing for on-the-fly funding (#2861).

Sources:
- [Bitcoin Optech: Dual Funding](https://bitcoinops.org/en/topics/dual-funding/)
- [Lightspark: Dual Funding](https://www.lightspark.com/glossary/dual-funding)
- [Blockstream: Lightning's Missing Piece -- A Decentralized Liquidity Market](https://blog.blockstream.com/lightnings-missing-piece-a-decentralized-liquidity-market/)

---

## 8. Anchor Outputs

### The Problem

Commitment transactions in Lightning channels have their feerate set when created, but may be broadcast much later when fees are different. Too-low fees can prevent timely confirmation, enabling fund theft via expired timelocks.

### Solution: Anchor Outputs

Anchor outputs are small additional outputs on commitment transactions that enable fee bumping via CPFP (Child Pays For Parent). Each party gets one anchor output they can spend to attach a child transaction with higher fees.

### Evolution

1. **`option_anchor_outputs` (original)**: Added two anchor outputs to commitment transactions. Used CPFP carve-out to mitigate pinning attacks.
2. **`option_anchors_zero_fee_htlc_tx` (improved)**: HTLC second-level transactions pay zero fees themselves, relying on CPFP from anchor spends. This is now the preferred variant and is considered superior if both are negotiated.
3. **Zero-fee commitments with v3 transactions (proposed, BOLTs #1228)**: Leverages Bitcoin Core's v3 transaction relay policy, pay-to-anchor (P2A) outputs, and ephemeral dust to create commitment transactions that pay zero mining fees. Eliminates `update_fee` entirely, preventing fee-disagreement force-closes and offering better pinning resistance.

### Current Status

Anchor outputs (`option_anchors_zero_fee_htlc_tx`) are the established standard for new channels across all major implementations (LND, CLN, Eclair, LDK). The v3/ephemeral-anchor upgrade is the next evolution, pending broader v3 relay support in the Bitcoin Core network.

Pay-to-Anchor (P2A) output support was added to Bitcoin Core v0.28, providing a cheaper anchor mechanism (a single shared anchor instead of two per-party anchors).

Sources:
- [Bitcoin Optech: Anchor Outputs](https://bitcoinops.org/en/topics/anchor-outputs/)
- [BOLTs PR #1228: Zero-fee commitments using v3 transactions](https://github.com/lightning/bolts/pull/1228)
- [Bitcoin Optech: Ephemeral Anchors](https://bitcoinops.org/en/topics/ephemeral-anchors/)

---

## 9. Async Payments

### The Problem

Standard Lightning payments require both sender and receiver to be online simultaneously. Mobile wallets and intermittently-connected devices cannot reliably receive payments.

### Approaches

1. **Trampoline relay hold (Eclair)**: A trampoline node temporarily holds the payment HTLC until the offline recipient reconnects. Eclair #2435 proposed this mechanism. In 2024, Eclair implemented waking up disconnected mobile peers for async payments or onion messages.

2. **Lightning Rod (Breez)**: A service that completes payments asynchronously on behalf of mobile users, acting as a trusted intermediary.

3. **PTLCs + async (future)**: PTLCs offer a cleaner async payment mechanism because adaptor signatures can be pre-shared, reducing the trust required in intermediaries. This remains theoretical pending PTLC deployment.

### Current Status

Async payments are partially implemented in Eclair/Phoenix (using the trampoline relay approach). This is a pragmatic solution that works today but involves trust in the trampoline node. A fully trustless async payment protocol is a longer-term goal tied to PTLC adoption.

Sources:
- [Bitcoin Optech: Async Payments](https://bitcoinops.org/en/topics/async-payments/)
- [Breez: Introducing Lightning Rod](https://medium.com/breez-technology/introducing-lightning-rod-2e0a40d3e44a)

---

## 10. Trampoline Routing

### Concept

Trampoline routing allows lightweight nodes (especially mobile wallets) to delegate pathfinding to specialized "trampoline nodes." Instead of computing a full route, the sender constructs a partial route to a trampoline node that handles the rest.

### How It Works

1. Sender knows a path to a trampoline node but not to the final recipient.
2. Sender creates a layered onion: outer layer routes to the trampoline, inner layer instructs the trampoline where to forward.
3. Multiple trampoline hops can be chained for privacy (sender -> trampoline A -> trampoline B -> recipient).
4. Trampoline nodes maintain full network graph; lightweight clients only need to know their local neighborhood.

### Specification Status

Trampoline routing has been proposed as a BOLT extension but has not been merged into the main specification. It exists as an experimental feature primarily in Eclair/Phoenix.

### Implementation

- **Eclair/Phoenix**: Production deployment; Phoenix wallet uses trampoline routing by default.
- **Other implementations**: Not widely adopted. LND, CLN, and LDK do not implement trampoline routing.

### Privacy Integration

Research has explored combining blinded paths with trampoline routing for enhanced privacy: the sender uses a trampoline node for pathfinding, while the receiver uses a blinded path to hide their identity. This combination preserves both sender and receiver privacy while allowing lightweight clients.

Sources:
- [Voltage: Trampoline Payments](https://www.voltage.cloud/blog/what-are-trampoline-payments-on-lightning-network)
- [Lightspark: Trampoline Payments](https://www.lightspark.com/glossary/trampoline-payments)
- [Lightning Privacy: Blinded Paths + Trampoline](https://lightningprivacy.com/en/blinded-trampoline)

---

## 11. Multi-Part Payments (MPP)

### Overview

Multi-Part Payments (also called "base MPP" or "basic MPP") allow a single payment to be split into multiple smaller HTLC parts that travel along different routes and are recombined at the recipient. This was one of the most impactful protocol upgrades for payment reliability.

### How It Works

All payment parts share the same payment hash (from the invoice). The recipient waits until all parts arrive before settling any of them. If any part fails, the recipient does not claim any parts, and the sender can retry.

### Specification

MPP support is signaled via feature bits in BOLT 9 (`basic_mpp`, feature bits 16/17). It was added to the specification around 2019-2020 and is now universally supported.

### Impact

MPP dramatically improved payment success rates by allowing payments larger than any single channel's capacity and by enabling better utilization of available liquidity across the network. Before MPP, a 1 BTC payment required a single path with 1 BTC of liquidity at every hop. With MPP, it can be split across many paths.

### Universal Adoption

All four major implementations (LND, CLN, Eclair, LDK) support MPP for both sending and receiving. It is considered a mature, production-stable feature.

Sources:
- [Lightning Labs: Multi-Path Payments in LND](https://lightning.engineering/posts/2020-05-07-mpp/)
- [nullcount: Difference Between MPP and AMP](https://nullcount.com/what-is-the-difference-between-mpp-and-amp-payment-splitting/)

---

## 12. Atomic Multi-Path (AMP)

### Overview

AMP (Atomic Multi-Path payments), designed by Lightning Labs, is an alternative multipath payment scheme that differs from base MPP in important ways:

- **Atomicity**: AMP payments are truly atomic -- all parts settle simultaneously or none do, enforced cryptographically rather than by recipient cooperation.
- **No invoice required**: AMP uses keysend (spontaneous payments) -- the sender needs only the recipient's public key.
- **Unique payment hashes per part**: Each AMP shard uses a different payment hash derived from a shared secret, making individual shards uncorrelatable to intermediate routing nodes.

### How It Works

The sender generates a random root seed and derives unique preimages for each payment shard using the shard index. The recipient can only reconstruct all preimages once all shards arrive, ensuring atomicity.

### Implementation

- **LND**: Shipped in v0.13.0-beta (2021). Full send and receive support.
- **Other implementations**: Not widely adopted. AMP is primarily an LND feature and is not part of the BOLT specification (it was proposed as a bLIP-level feature).

### MPP vs AMP

| Property | Base MPP | AMP |
|----------|---------|-----|
| Invoice required | Yes | No (keysend) |
| Same payment hash | Yes (correlatable) | No (uncorrelatable) |
| Atomicity | Recipient-enforced | Cryptographic |
| Specification | BOLT (universal) | LND-specific |

Sources:
- [Lightning Labs: AMP Documentation](https://docs.lightning.engineering/lightning-network-tools/lnd/amp)
- [What Is Bitcoin: Lightning Atomic Multipath Payments](https://www.whatisbitcoin.com/lightning-network/lightning-atomic-multipath-payments)

---

## 13. Onion Messages

### Overview

Onion messages (type 387) allow nodes to send arbitrary encrypted messages across the Lightning Network using the same onion routing used for payments, but without creating HTLCs or locking any funds.

### Technical Design

- Variable-size onion payloads (unlike the fixed 1300-byte payment onions).
- Uses a "blinding point" for route blinding.
- Nodes can relay messages without knowing the sender or final recipient.
- Nodes advertising `option_provide_storage` can store up to 65,531 bytes for peers.

### Why It Matters

Onion messages are the transport layer for BOLT 12. When a sender wants to pay an offer, they send an invoice_request via onion messages to the recipient (through a blinded path), and the recipient responds with an invoice via onion messages. No external server or HTTP endpoint is needed.

### Implementation Status

| Implementation | Onion Messages Status |
|---------------|---------------------|
| Core Lightning | Full support |
| Eclair | Full support |
| LDK | Full support |
| LND | In progress (tracked in epic #10220); prerequisite for BOLT 12 |

### DoS Concerns

Onion messages are free to send (no HTLC fees), raising denial-of-service concerns. Proposed mitigations include rate limiting and separating onion message relay from HTLC relay (discussed in 2025 specification meetings), allowing nodes to opt out of relaying onion messages without affecting payment routing.

Sources:
- [Bitcoin Optech: Onion Messages](https://bitcoinops.org/en/topics/onion-messages/)
- [Rusty Russell: Onion Messaging In Depth](https://rusty-lightning.medium.com/onion-messaging-in-depth-d8e384ee4184)
- [LND Onion Messaging Epic #10220](https://github.com/lightningnetwork/lnd/issues/10220)

---

## 14. Channel Jamming Mitigations

### The Attack

Channel jamming is a cheap denial-of-service attack where an adversary sends payments through target channels and either:
- **Slow jamming**: Holds HTLCs open until timeout (hours), locking channel capacity.
- **Fast jamming**: Rapidly sends and fails payments, consuming routing slots.

The attacker pays no routing fees for failed payments, making the attack nearly free.

### Proposed Mitigations

#### Monetary Approaches

1. **Upfront fees**: Charge a small fee for all payment attempts, not just successful ones. Can be refundable (returned on success) or non-refundable. This makes jamming proportionally expensive but also increases costs for legitimate failed payment attempts.

2. **Token-based routing**: Nodes issue routing tokens. Valid tokens allow free routing; tokens are reissued on successful payment. This amortizes the cost over time but requires bootstrapping.

#### Reputation Approaches

3. **Local reputation**: Each node tracks the behavior of its direct peers. Peers that route payments that resolve quickly build reputation; peers whose HTLCs time out lose reputation. Low-reputation peers get restricted access to channel capacity.

4. **Experimental endorsement signaling (bLIP-4)**: Active status. Nodes can signal endorsement of payments based on local reputation, allowing downstream nodes to prioritize endorsed payments. This is an incremental, deployable step that does not require global coordination.

#### Combined Approaches

The influential paper "Unjamming Lightning: A Systematic Approach" (Clara Shikhelman and Sergei Tikhomirov, 2022) proposed combining unconditional fees with local reputation as the most practical near-term solution.

### Current Status

No single mitigation has been deployed network-wide. The community consensus is that:
- Fully eliminating jamming while preserving permissionlessness is likely impossible.
- Incremental mitigations (reputation + small fees) are the practical path forward.
- bLIP-4 experimental endorsement signaling is the most concrete deployable step, with active status in the bLIP repository.
- Long-term fundamental solutions (e.g., proof-of-work per HTLC, stake certificates) require additional research.

Sources:
- [Unjamming Lightning (ePrint 2022/1454)](https://eprint.iacr.org/2022/1454.pdf)
- [Bitcoin Magazine: Proposal to Stop Lightning Attacks](https://bitcoinmagazine.com/technical/proposal-to-stop-bitcoin-lightning-attacks)
- [Bitcoin Problems: Channel Jamming](https://bitcoinproblems.org/problems/channel-jamming.html)
- [bLIP-4: Experimental Endorsement Signaling](https://github.com/lightning/blips/blob/master/blip-0004.md)

---

## Implementation Feature Matrix (as of early 2026)

| Feature | LND | Core Lightning | Eclair | LDK |
|---------|-----|---------------|--------|-----|
| Anchor outputs (zero-fee HTLC) | Yes | Yes | Yes | Yes |
| Multi-Part Payments (MPP) | Yes | Yes | Yes | Yes |
| AMP (keysend multipath) | Yes | No | No | No |
| Simple taproot channels | Yes (experimental) | No | Yes (with dual-fund/splice) | No |
| BOLT 12 / Offers | In progress | Yes | Yes | Yes |
| Onion messages | In progress | Yes | Yes | Yes |
| Route blinding | In progress | Yes | Yes | Yes |
| Dual-funded channels | No (native) | Yes | Yes | Partial (accept only) |
| Splicing | No | Yes | Yes | Yes |
| Trampoline routing | No | No | Yes | No |
| Liquidity ads | No | Yes | Yes | No |

---

## Timeline Summary

| Year | Major Milestones |
|------|-----------------|
| 2018 | Original BOLT specs stabilize; early LN mainnet deployment |
| 2019 | MPP proposals; anchor output designs begin |
| 2020 | MPP shipped in LND; anchor outputs specified; keysend deployed |
| 2021 | AMP shipped in LND v0.13; Taproot activates (Nov); dual-funding spec advances |
| 2022 | Route blinding merged into BOLT 4; "Unjamming Lightning" paper; BOLT 12 nears completion |
| 2023 | LND v0.17 ships simple taproot channels (experimental); CLN ships first dual-funded mainnet channel |
| 2024 | BOLT 12 officially merged; CLN/Eclair splicing interop; LDK accepts dual-funded channels; v3/ephemeral anchor proposals |
| 2025 | LDK completes splicing; Eclair ships taproot+splice+dual-fund combo; MuSig2 in production (Loop); LND building onion messaging for BOLT 12 |
| 2026 | Spec refinements continue (BOLT 12 amount clarification); LND BOLT 12 implementation ongoing; PTLCs remain future roadmap |
