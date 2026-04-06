# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LightPay (package name: "orion") enables paying Lightning Network invoices using any Bitcoin wallet via atomic swaps. A swap provider pays the Lightning invoice on the user's behalf in exchange for an on-chain Bitcoin payment plus a small fee. Built at the C4YT Hackathon.

Requires Node.js 8.9.4 / npm 5.6.0.

## Commands

```bash
npm install          # Install dependencies
npm start            # Start server (port 9889, or PORT/OCW_PORT env vars)
npm test             # Run all tests (tap test/*.js) — spawns bcoin regtest daemon
npx tap test/test_swap_address.js   # Run a single test file
```

Integration tests (`claim_success.js`, `refund_success.js`) automatically spawn and stop a bcoin regtest daemon. Unit tests (`test_swap_address.js`, `test_swap_details.js`, etc.) run standalone.

## Architecture

Express server (`server.js`) with Pug templates and a REST API at `/api/v0`.

### Core Modules

- **`swaps/`** — Pure swap logic: Bitcoin script generation (`pk_swap_script`, `pkhash_swap_script`), swap address derivation, claim/refund transaction building. Uses `bitcoinjs-lib`.
- **`service/`** — Server-side orchestration: creating swaps, checking status, finding swap transactions in blocks/mempool, invoice/address details, price lookups.
- **`chain/`** — Bitcoin chain RPC interaction (`chain_rpc` wraps `node-bitcoin-rpc`): block queries, tx broadcast, key generation, regtest daemon management.
- **`lightning/`** — Lightning Network via `ln-service`: paying invoices, creating addresses.
- **`routers/api.js`** — REST API routes delegating to service functions.
- **`async-util/`** — Callback helpers (`returnJson`, `returnResult`) for the async/callback pattern used throughout.

### API Endpoints (`/api/v0`)

- `GET /address_details/:address` — Chain address info
- `GET /invoice_details/:invoice` — Lightning invoice details (min 100k sats)
- `POST /swap_outputs/` — Find swap outpoint by redeem script
- `POST /swaps/` — Create a new swap
- `POST /swaps/:payment_hash/` — Check swap status

### Frontend

Pug templates in `views/` (index, refund, layout). `public/browserify/index.js` is browserified and served at `/js/blockchain.js`.

### Coding Patterns

- Node-style callbacks with `async/auto` for multi-step orchestration
- Error arrays: `[error_code, 'ErrorMessage', detail]`
- Each module has an `index.js` barrel file
- Test framework: `tap`

### Using bv as an AI sidecar

bv is a graph-aware triage engine for Beads projects (.beads/beads.jsonl). Instead of parsing JSONL or hallucinating graph traversal, use robot flags for deterministic, dependency-aware outputs with precomputed metrics (PageRank, betweenness, critical path, cycles, HITS, eigenvector, k-core).

**Scope boundary:** bv handles *what to work on* (triage, priority, planning). For agent-to-agent coordination (messaging, work claiming, file reservations), use [MCP Agent Mail](https://github.com/Dicklesworthstone/mcp_agent_mail).

**⚠️ CRITICAL: Use ONLY `--robot-*` flags. Bare `bv` launches an interactive TUI that blocks your session.**

#### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns everything you need in one call:
- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command

#### Other Commands

**Planning:**
| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with `unblocks` lists |
| `--robot-priority` | Priority misalignment detection with confidence |

**Graph Analysis:**
| Command | Returns |
|---------|---------|
| `--robot-insights` | Full metrics: PageRank, betweenness, HITS (hubs/authorities), eigenvector, critical path, cycles, k-core, articulation points, slack |
| `--robot-label-health` | Per-label health: `health_level` (healthy\|warning\|critical), `velocity_score`, `staleness`, `blocked_count` |
| `--robot-label-flow` | Cross-label dependency: `flow_matrix`, `dependencies`, `bottleneck_labels` |
| `--robot-label-attention [--attention-limit=N]` | Attention-ranked labels by: (pagerank × staleness × block_impact) / velocity |

**History & Change Tracking:**
| Command | Returns |
|---------|---------|
| `--robot-history` | Bead-to-commit correlations: `stats`, `histories` (per-bead events/commits/milestones), `commit_index` |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified issues, cycles introduced/resolved |

**Other Commands:**
| Command | Returns |
|---------|---------|
| `--robot-burndown <sprint>` | Sprint burndown, scope changes, at-risk items |
| `--robot-forecast <id\|all>` | ETA predictions with dependency-aware scheduling |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-suggest` | Hygiene: duplicates, missing deps, label suggestions, cycle breaks |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export |
| `--export-graph <file.html>` | Self-contained interactive HTML visualization |

#### Scoping & Filtering

bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank scores
bv --robot-triage --robot-triage-by-track    # Group by parallel work streams
bv --robot-triage --robot-triage-by-label    # Group by domain

#### Understanding Robot Output

**All robot JSON includes:**
- `data_hash` — Fingerprint of source beads.jsonl (verify consistency across calls)
- `status` — Per-metric state: `computed|approx|timeout|skipped` + elapsed ms
- `as_of` / `as_of_commit` — Present when using `--as-of`; contains ref and resolved SHA

**Two-phase analysis:**
- **Phase 1 (instant):** degree, topo sort, density — always available immediately
- **Phase 2 (async, 500ms timeout):** PageRank, betweenness, HITS, eigenvector, cycles — check `status` flags

**For large graphs (>500 nodes):** Some metrics may be approximated or skipped. Always check `status`.

#### jq Quick Reference

bv --robot-triage | jq '.quick_ref'                        # At-a-glance summary
bv --robot-triage | jq '.recommendations[0]'               # Top recommendation
bv --robot-plan | jq '.plan.summary.highest_impact'        # Best unblock target
bv --robot-insights | jq '.status'                         # Check metric readiness
bv --robot-insights | jq '.Cycles'                         # Circular deps (must fix!)
bv --robot-label-health | jq '.results.labels[] | select(.health_level == "critical")'

**Performance:** Phase 1 instant, Phase 2 async (500ms timeout). Prefer `--robot-plan` over `--robot-insights` when speed matters. Results cached by data hash.

Use bv instead of parsing beads.jsonl—it computes PageRank, critical paths, cycles, and parallel tracks deterministically.
