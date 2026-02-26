+++
authors = ["Yuriy Polyulya"]
title = "Fleet Coherence Under Partition"
description = "During partition, each cluster makes decisions independently. When connectivity returns, those decisions must be reconciled - but some conflicts have no clean resolution. This article develops practical approaches to fleet-wide consistency: CRDTs for conflict-free state merging, Merkle-based reconciliation protocols for efficient sync, and hierarchical decision authority that determines who gets the final word when clusters disagree. The goal isn't perfect consistency - it's sufficient coherence for the mission to succeed."
date = 2026-02-05
slug = "autonomic-edge-part4-fleet-coherence"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "eventual-consistency", "consensus"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 4
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Traditional distributed systems assume connectivity as the norm and partition as the exception. Edge systems invert this assumption: disconnection is the default operating state, and connectivity is the opportunity to synchronize. This series develops the engineering principles for autonomic architectures - systems that self-measure, self-heal, and self-optimize when human operators cannot intervene. Through tactical scenarios (RAVEN drone swarm, CONVOY ground vehicles, OUTPOST forward base) and commercial deployments (STOCKSYNC inventory, MULTIWRITE collaboration, distributed IoT fleets), we derive the mathematical foundations and design patterns for systems that thrive under contested connectivity."""
+++

---

## Prerequisites

The three preceding parts addressed capabilities that live within a single node or a cluster that can communicate internally. [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) established what the system faces: {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}s where partition is the default, and capability levels that define what must be preserved. [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md) established how the system knows its own state: local anomaly detection, {% term(url="@/blog/2026-01-22/index.md#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %}-based health propagation with bounded staleness, and Byzantine-tolerant aggregation. [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) established what the system does about failures: the MAPE-K autonomic loop, confidence-gated healing actions, recovery ordering by dependency, and cascade prevention.

Each of those capabilities assumed a cluster's internal state was knowable. The remaining problem is what happens *between* clusters.

When {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}'s vehicles split at a mountain pass, each group continues operating independently. Each heals its own members, updates its own state, makes its own authority-delegated decisions — all drawing on the contested-connectivity baseline, self-measurement, and self-healing frameworks. When the groups reunite, their states have diverged. Neither group made an error. But they are inconsistent, and some of their decisions may conflict.

Fleet coherence is the problem of managing this divergence: bounding how far state can drift during partition, and resolving conflicts efficiently at reconnection. The CAP theorem (Brewer, 2000) makes the trade-off explicit: no distributed system can simultaneously guarantee consistency, availability, and partition tolerance. The contested-connectivity, self-measurement, and self-healing articles committed this series to *availability* — systems keep operating during partition. This article addresses what that commitment costs and how to pay it: the reconciliation protocols, {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} semantics, and authority structures that make eventual consistency tractable in physical edge deployments.

---

## Overview

Fleet coherence maintains consistent state when the network prevents communication. Each concept integrates theory with design consequence:

| Concept | Formal Contribution | Design Consequence |
| :--- | :--- | :--- |
| **State Divergence** | \\(\mathbb{E}[D(\tau)] = 1 - e^{-\lambda\tau}\\) | Size reconciliation buffers from event rate |
| **CRDTs** | Merge \\(\sqcup\\) forms join-semilattice | Choose CRDT type matching state semantics |
| **Authority Tiers** | \\(\mathcal{Q}^* = \arg\max [V_{\text{mission}} - C_{\text{reconcile}}]\\) | Delegate bounded authority during partition |
| **Merkle Reconciliation** | \\(O(k \log(n/k) + k)\\) messages for \\(k\\) divergent items | Efficient sync for large state with sparse changes |
| **Entity Resolution** | Confidence update \\(c\' = f(c_1, c_2, \text{agreement})\\) | Merge multi-observer data probabilistically |

This extends [eventual consistency](https://queue.acm.org/detail.cfm?id=1466448) and [{% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s](https://inria.hal.science/inria-00555588/document) for physical edge deployments.

---

## Opening Narrative: CONVOY Split

{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}: 12 vehicles traverse a mountain pass. At km 47, terrain creates radio shadow.

**Forward group (vehicles 1-5)** receives SATCOM: bridge at km 78 destroyed, reroute via Route B. They adjust course.

**Rear group (vehicles 6-12)** receives ground relay minutes later: Route B blocked by landslide, continue to bridge. They maintain course.

When both groups emerge from the radio shadow with full connectivity:
- Vehicles 1-5: 8km west on Route B
- Vehicles 6-12: 8km east toward bridge
- Both acted correctly on available information

The coherence challenge: physical positions cannot be reconciled, but fleet state - route plan, decisions, threat assessments - must converge to consistent view.

---

## The Coherence Challenge

### Local Autonomy vs Fleet Coordination

The contested-connectivity, self-measurement, and self-healing articles developed local autonomy — essential, since without it partition means failure. But local autonomy creates coordination problems. Independent actions may:

- **Complement**: Node A handles zone X, Node B zone Y (good)
- **Duplicate**: Both handle zone X (wasted resources)
- **Conflict**: Incompatible actions (mission failure)

The table below contrasts the two operating modes across four dimensions to make the tension concrete; the correct design point lies between these extremes.

<style>
#tbl_tension + table th:first-of-type { width: 30%; }
#tbl_tension + table th:nth-of-type(2) { width: 35%; }
#tbl_tension + table th:nth-of-type(3) { width: 35%; }
</style>
<div id="tbl_tension"></div>

| Dimension | Local Autonomy | Fleet Coordination |
| :--- | :--- | :--- |
| Decision speed | Fast (local) | Slow (consensus) |
| Information used | Local sensors only | Fleet-wide picture |
| Failure mode | Suboptimal but functional | Complete if quorum lost |
| Partition behavior | Continues operating | Blocks waiting for consensus |

**Coordination without communication** is only possible through predetermined rules. If every node follows the same rules and starts with the same information, they will make the same decisions. But partition means information diverges - different nodes observe different events.

The tradeoff: **more predetermined rules enable more coherence, but reduce adaptability**. A fleet that pre-specifies every possible decision achieves perfect coherence but cannot adapt to novel situations. A fleet with maximum adaptability achieves minimum coherence - each node does its own thing.

Edge architecture must find the balance: enough rules for critical coherence, enough flexibility for operational adaptation.

### State Divergence Sources

<span id="def-11"></span>
**Definition 11** (State Divergence). *For system states \\(\Sigma_A\\) and \\(\Sigma_B\\) (state \\(\Sigma_A\\) denotes the key-value pair set of node A) represented as key-value pairs, the divergence \\(D(\Sigma_A, \Sigma_B)\\) is the normalized symmetric difference:*

{% katex(block=true) %}
D(\Sigma_A, \Sigma_B) = \frac{|\Sigma_A \triangle \Sigma_B|}{|\Sigma_A \cup \Sigma_B|}
{% end %}

*where \\(D \in [0, 1]\\), with \\(D = 0\\) indicating identical states and \\(D = 1\\) indicating completely disjoint states.*

In other words, divergence is the fraction of the combined key space on which the two states disagree; zero means byte-for-byte identical, one means no key-value pair is shared.

During partition, state diverges through multiple mechanisms:

**Environmental inputs differ**. Each cluster observes different events. Cluster A sees threat T1 approach from the west. Cluster B, on the other side of the partition, sees nothing. Their threat models diverge.

**Decisions made independently**. [Self-healing](@/blog/2026-01-29/index.md) requires local decisions. Cluster A decides to redistribute workload after node failure. Cluster B, unaware of the failure, continues assuming the failed node is operational. Their understanding of fleet configuration diverges.

**Time drift**. Without network time synchronization, clocks diverge. After 6 hours of partition at 100ppm drift, clocks differ by 2 seconds. Timestamps become unreliable for ordering events.

**Message loss**. Before partition fully established, some {% term(url="@/blog/2026-01-22/index.md#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} messages reach some nodes. The partial propagation creates uneven knowledge. Node A heard about event E before partition. Node B did not. Their histories diverge.

<span id="prop-12"></span>
**Proposition 12** (Divergence Growth Rate). *If state-changing events arrive according to a Poisson process with rate \\(\lambda\\), the expected divergence after partition duration \\(\tau\\) is:*

{% katex(block=true) %}
E[D(\tau)] = 1 - e^{-\lambda \tau}
{% end %}

*Proof sketch*: Model state as a binary indicator per key: identical (0) or divergent (1). Under independent Poisson arrivals with rate \\(\lambda\\), the probability a given key remains synchronized is \\(e^{-\lambda \tau}\\). The expected fraction of divergent keys follows the complementary probability. For sparse state changes, \\(E[D(\tau)] \approx 1 - e^{-\lambda \tau}\\) provides a tight upper bound.

In other words, divergence grows quickly at first and then saturates: a long partition does not drive divergence much higher than a medium one, because most keys diverge within the first few event intervals.

**Corollary 5**. *Reconciliation cost is linear in divergence: \\(\text{Cost}(\tau) = c \cdot D(\tau) \cdot |S_A \cup S_B|\\) where \\(c\\) is per-item sync cost.*

In other words, the total work at reconnection scales with how many key-value pairs diverged multiplied by the constant cost to transfer and merge one item; sizing the reconciliation budget requires estimating both the divergence fraction and the total state size.

---

## Conflict-Free Data Structures

### CRDTs at the Edge

<span id="def-12"></span>
**Definition 12** (Conflict-Free Replicated Data Type). *A state-based {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} is a tuple \\((S, s^0, q, u, m)\\) where \\(S\\) is the state space, \\(s^0\\) is the initial state, \\(q\\) is the query function, \\(u\\) is the update function, and \\(m: S \times S \rightarrow S\\) is a merge function satisfying:*
- *Commutativity: \\(m(s_1, s_2) = m(s_2, s_1)\\)*
- *Associativity: \\(m(m(s_1, s_2), s_3) = m(s_1, m(s_2, s_3))\\)*
- *Idempotency: \\(m(s, s) = s\\)*

*These properties make \\((S, m)\\) a join-semilattice, guaranteeing convergence regardless of merge order.*

In other words, any two replicas that have received the same set of updates will reach the same final state, regardless of the order in which they applied those updates or exchanged state with each other.

Six standard {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} types cover the majority of edge state patterns; selecting the right one depends on whether state grows only, shrinks too, or requires last-writer semantics.

<style>
#tbl_crdts + table th:first-of-type { width: 20%; }
#tbl_crdts + table th:nth-of-type(2) { width: 40%; }
#tbl_crdts + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_crdts"></div>

| CRDT Type | Operation | Edge Application |
| :--- | :--- | :--- |
| **G-Counter** | Increment only | Message counts, observation counts |
| **PN-Counter** | Increment and decrement | Resource tracking (\\(\pm\\)) |
| **G-Set** | Add only | Surveyed zones, detected threats |
| **2P-Set** | Add and remove (once) | Active targets, current alerts |
| **LWW-Register** | Last-writer-wins value | Device configuration values and node status, where the latest write is authoritative |
| **MV-Register** | Multi-value (preserve conflicts) | Fields where concurrent updates from separate clusters must both be preserved for later review |

**G-Set example**: {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} surveillance coverage

Each drone maintains a local set of surveyed grid cells. When drones reconnect, the merged coverage is simply the union of all cells observed by either cluster — no coordination or conflict resolution is needed because adding a new cell never invalidates any other cell.

{% katex(block=true) %}
\text{Coverage}_{\text{merged}} = \text{Coverage}_A \cup \text{Coverage}_B
{% end %}

<span id="prop-13"></span>
**Proposition 13** ({% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} Convergence). *If all updates eventually propagate to all nodes (eventual delivery), and the merge function satisfies commutativity, associativity, and idempotency, then all replicas converge to the same state.*

In other words, as long as no update is permanently lost and the merge function obeys the three semilattice rules, two clusters that were partitioned for any finite duration will always reach identical state once they exchange updates.

*Proof sketch*: Eventual delivery ensures all nodes receive all updates. The semilattice properties ensure merge order doesn't matter.

**Edge suitability**: {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s require no coordination during partition. Updates are local. Merge is deterministic. This matches edge constraints perfectly.

The diagram below shows how two clusters independently add items to a G-Set during partition and arrive at identical merged state upon reconnection, with no coordination required.

{% mermaid() %}
graph TD
    subgraph During_Partition["During Partition (independent updates)"]
    A1["Cluster A<br/>State: {1,2,3}"] -->|"adds item 4"| A2["Cluster A<br/>State: {1,2,3,4}"]
    B1["Cluster B<br/>State: {1,2,3}"] -->|"adds item 5"| B2["Cluster B<br/>State: {1,2,3,5}"]
    end
    subgraph After_Reconnection["After Reconnection"]
    M["CRDT Merge<br/>(set union)"]
    R["Merged State<br/>{1,2,3,4,5}"]
    end
    A2 --> M
    B2 --> M
    M --> R

    style M fill:#c8e6c9,stroke:#388e3c
    style R fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style During_Partition fill:#fff3e0
    style After_Reconnection fill:#e8f5e9
{% end %}

The merge operation is **automatic and deterministic** - no conflict resolution logic needed. Both clusters' contributions are preserved.

**Limitations**: {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s impose semantic constraints. A counter that only increments cannot represent a value that should decrease. A set that only adds cannot represent removal. Application data must be structured to fit available {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} semantics.

**Choosing the right {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}**: The choice depends on application semantics. The mapping from requirements to type is a function of three inputs — the permitted operations, the desired conflict resolution policy, and the available memory budget:

{% katex(block=true) %}
\text{CRDT\_Type} = f(\text{Operations}, \text{Conflict\_Resolution}, \text{Space\_Budget})
{% end %}

- **G-Set**: Simplest, lowest overhead, but no removal
- **2P-Set**: Supports removal but element cannot be re-added
- **OR-Set**: Full add/remove semantics but higher overhead (unique tags per add)
- **LWW-Element-Set**: Timestamp-based resolution, requires clock synchronization

### Bounded-Memory Tactical CRDT Variants

Standard {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s assume unbounded state growth - problematic for edge nodes with constrained memory. We introduce bounded-memory variants tailored for tactical operations.

**Sliding-Window G-Counter**:

The bounded counter \\(C_{\text{bounded}}(t)\\) sums only the counts from active time windows, discarding history older than \\(T_{\text{window}}\\); here \\(c_w\\) is the count accumulated during window \\(w\\), and \\(W(t)\\) is the set of windows that fall within the retention interval ending at time \\(t\\):

{% katex(block=true) %}
C_{\text{bounded}}(t) = \sum_{w \in W(t)} c_w
{% end %}

where \\(W(t) = \{w : t - T_{\text{window}} \leq w < t\}\\) is the active window set. Memory: \\(O(T_{\text{window}} / \Delta_w)\\) instead of unbounded.

*{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} application*: Track observation counts per sector for the last hour. Older counts archived to fusion node when connectivity permits, then pruned locally.

**Bounded OR-Set with Eviction**:

The Add operation inserts element \\(e\\) into set \\(S\\) directly when capacity allows, and otherwise evicts the lowest-priority existing element \\(e_{\text{min}}\\) before inserting; \\(M_{\text{max}}\\) is the fixed capacity bound:

{% katex(block=true) %}
\text{Add}(e, S) = \begin{cases}
S \cup \{e\} & \text{if } |S| < M_{\text{max}} \\
(S \setminus \{e_{\text{min}}\}) \cup \{e\} & \text{otherwise}
\end{cases}
{% end %}

where \\(e_{\text{min}} = \arg\min_{e\' \in S} \text{priority}(e\')\\). The eviction maintains {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} properties:

*Eviction commutativity proof sketch*: Define \\(\text{evict}(S) = S \setminus \{e_{\text{min}}\}\\). For deterministic priority function, \\(\text{evict}(\text{merge}(S_A, S_B)) = \text{merge}(\text{evict}(S_A), \text{evict}(S_B))\\) when both exceed \\(M_{\text{max}}\\).

**Prerequisite:** This maintains CRDT properties only when the priority function is deterministic and identical across all nodes given the same inputs. If priority depends on observation time or local state, evictions at different nodes may produce non-deterministic merge outcomes. {% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} uses {% katex() %}\text{threat\_level} \times (1/\text{age}){% end %} as a stable priority; deployments with node-specific priority functions must use a tie-breaking rule (e.g., node ID) to preserve idempotency.

**Priority functions for tactical state**:
- Threat entities: Priority = threat level \\(\times\\) recency
- Coverage cells: Priority = strategic value \\(\times\\) observation freshness
- Health records: Priority = criticality \\(\times\\) staleness (inverse)

*{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} application*: Track at most 50 active threats. When capacity exceeded, evict lowest-priority (low-threat, stale) entities. Memory: fixed \\(50 \times \text{sizeof(entity)}\\) regardless of operation duration.

**Compressed Delta-{% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}**:

Standard delta-{% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s transmit state changes. We compress deltas using domain-specific encoding. The compressed delta size equals \\(H(\Delta)\\), the information-theoretic entropy of the delta (the minimum achievable size), plus a logarithmic overhead term from the encoding scheme itself.

{% katex(block=true) %}
\text{size}(\Delta_{\text{compressed}}) = H(\Delta) + O(\log |\Delta|)
{% end %}

where \\(H(\Delta)\\) is the entropy of the delta. For state with predictable patterns (low entropy deltas), compression can achieve significant reduction; the ratio depends on the specific entropy characteristics of the application.

**Compression techniques**:
1. **Spatial encoding**: Position updates as offsets from predicted trajectory
2. **Temporal batching**: Multiple updates to same entity merged before transmission
3. **Dictionary encoding**: Common values (status codes, threat types) as indices

*{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} application*: Sensor health updates compressed to 2-3 bytes per sensor versus 32 bytes uncompressed. 127-sensor mesh health fits in single packet.

**Hierarchical State Pruning**:

Tactical systems naturally have hierarchical state importance. The table below defines four retention levels ordered by operational criticality, together with the retention duration and the condition that triggers pruning at each level.

| Level | Retention | Pruning Trigger |
|:------|:----------|:----------------|
| Critical (threats, failures) | Indefinite | Never auto-prune |
| Operational (positions, status) | 1 hour | Time-based |
| Diagnostic (detailed health) | 10 minutes | Memory pressure |
| Debug (raw sensor data) | 1 minute | Aggressive |

State automatically demotes under memory pressure. The level of state item \\(s\\) at time \\(t\\) drops by one tier per pressure event but never falls below the minimum level \\(\text{level}_{\min}(s)\\) defined for that state type:

{% katex(block=true) %}
\text{level}(s, t) = \max(\text{level}(s, t-1) - 1, \text{level}_{\min}(s))
{% end %}

where \\(\text{level}_{\min}(s)\\) is the minimum level for state type \\(s\\).

**Memory budget enforcement**:

Each {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} type has a memory budget \\(B_i\\). The constraint requires that the sum of memory consumed by all {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} instances \\(M_i\\) stays within total available memory minus the reserved headroom \\(M_{\text{reserve}}\\) needed for runtime overhead:

{% katex(block=true) %}
\sum_i M_i \leq M_{\text{total}} - M_{\text{reserve}}
{% end %}

When approaching limit, the system:
1. Prunes diagnostic/debug state
2. Compresses operational state
3. Evicts low-priority entries from bounded sets
4. Archives to persistent storage if available
5. Drops new low-priority updates as last resort

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} memory profile**: \\(50 \times 2\\)KB state budget = 100KB {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} state. Bounded OR-Set for 200 threats (4KB), sliding-window counters for 100 sectors (2KB), health registers for 50 nodes (1.6KB). Total: ~8KB active {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} state, well within budget.

<span id="scenario-stocksync"></span>

### Commercial Application: {% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} Multi-Warehouse Inventory

{% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} manages inventory across multiple distribution centers. Each center must continue during outages - receiving, fulfilling, counting - while maintaining eventual consistency with central systems and peers.

**The inventory coherence challenge**: Traditional inventory systems use centralized databases with strong consistency. When connectivity fails, warehouses either stop operations (unacceptable) or operate blind (leads to overselling, stockouts, allocation conflicts). {% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} uses {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s to enable continuous operation with guaranteed convergence.

**{% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} selection for inventory operations**:

Each inventory operation maps to a {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} type chosen to match the operation's semantics — the key observation is that receiving events can only increment, while holds require add-and-remove capability.

<style>
#tbl_stocksync_crdts + table th:first-of-type { width: 22%; }
#tbl_stocksync_crdts + table th:nth-of-type(2) { width: 22%; }
#tbl_stocksync_crdts + table th:nth-of-type(3) { width: 28%; }
#tbl_stocksync_crdts + table th:nth-of-type(4) { width: 28%; }
</style>
<div id="tbl_stocksync_crdts"></div>

| Inventory Operation | CRDT Type | Why This Type | Merge Behavior |
| :--- | :--- | :--- | :--- |
| Receiving | G-Counter per warehouse | Shipments only add inventory | Sum across warehouses |
| Shipping/Sales | PN-Counter (or G-Counter for deductions) | Orders remove inventory | Sum of additions minus deductions |
| Location transfers | 2P-Set of (item, from, to, qty) | Transfers are atomic events | Union; dedup by transfer ID |
| Cycle count adjustments | LWW-Register | Latest count is authoritative | Most recent timestamp wins |
| Inventory holds | OR-Set of (item, order, qty) | Holds can be added/removed | Add-wins semantics |

**Inventory quantity as {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}**: The total available quantity for SKU S at warehouse W is computed:

{% katex(block=true) %}
\text{Qty}(S, W) = \text{Received}(S, W) - \text{Shipped}(S, W) + \text{TransferIn}(S, W) - \text{TransferOut}(S, W) + \text{Adjustment}(S, W)
{% end %}

Each term is tracked separately:
- **Received**: G-Counter incremented on each receiving event
- **Shipped**: G-Counter incremented on each shipment
- **TransferIn/Out**: Derived from transfer events set
- **Adjustment**: LWW-Register from latest cycle count

The diagram below shows how two warehouses independently receive and ship inventory during partition, then merge into a single consistent quantity via {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} union — with no coordination step required.

{% mermaid() %}
graph TD
    subgraph "Warehouse A (during partition)"
        A_RCV["Receive: +100 units SKU-123"]
        A_SHIP["Ship: -30 units SKU-123"]
        A_STATE["Local state:<br/>Received: 100<br/>Shipped: 30<br/>Available: 70"]
    end

    subgraph "Warehouse B (during partition)"
        B_RCV["Receive: +50 units SKU-123"]
        B_SHIP["Ship: -20 units SKU-123"]
        B_STATE["Local state:<br/>Received: 50<br/>Shipped: 20<br/>Available: 30"]
    end

    subgraph "After Reconnection"
        MERGE["CRDT Merge"]
        FINAL["Combined state:<br/>Received: 150 (100+50)<br/>Shipped: 50 (30+20)<br/>Total Available: 100"]
    end

    A_RCV --> A_STATE
    A_SHIP --> A_STATE
    B_RCV --> B_STATE
    B_SHIP --> B_STATE
    A_STATE --> MERGE
    B_STATE --> MERGE
    MERGE --> FINAL

    style MERGE fill:#c8e6c9,stroke:#388e3c
    style FINAL fill:#e8f5e9,stroke:#388e3c
{% end %}

**Handling overselling during partition**: The primary risk of disconnected operation is overselling - both warehouses selling the same inventory. {% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} mitigates through **local reservation quotas**: the sellable quantity for SKU \\(S\\) at warehouse \\(W\\) is capped at whichever is smaller — the local on-hand quantity or the pre-assigned partition quota — so that combined sales across all warehouses cannot exceed total available stock.

{% katex(block=true) %}
\text{Sellable}(S, W) = \min\left(\text{Qty}(S, W), \text{Quota}(S, W)\right)
{% end %}

During normal operation, quotas are set generously (typically 80-90% of on-hand). When partition begins, each warehouse can only sell its quota - preventing combined sales from exceeding total inventory.

**Scope:** This bound assumes warehouse inventories are physically disjoint (no shared stock pools). If multiple warehouses hold claims on the same physical inventory, the safety factor \\(f_s\\) must cover cross-claim risk in addition to measurement error.

**Quota calculation**: The quota for SKU \\(S\\) at warehouse \\(W\\) is its proportional share of total inventory, weighted by local sales velocity relative to the fleet-wide total and reduced by a safety factor to absorb uncertainty during partition.

{% katex(block=true) %}
\text{Quota}(S, W) = \frac{\text{Qty}(S, W) \cdot \text{SalesVelocity}(S, W)}{\sum_{w} \text{SalesVelocity}(S, w)} \cdot \text{SafetyFactor}
{% end %}

where SafetyFactor \\(\approx 0.85\\) provides margin for uncertainty.

**Reconciliation protocol**: When connectivity restores between warehouses, {% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} performs a three-phase reconciliation:

**Phase 1 - Summary Exchange** (2-5 seconds):
- Exchange Merkle roots of inventory state
- Identify SKUs with divergent state
- Typically 2-5% of SKUs require detailed sync

**Phase 2 - Divergent State Sync** (10-60 seconds):
- Transfer {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} state for divergent SKUs
- Priority: high-velocity SKUs, items with pending orders, items near stockout

**Phase 3 - Operational Reconciliation** (background):
- Identify any oversells that occurred during partition
- Initiate cross-warehouse transfers to fulfill commitments
- Update quotas based on new combined state

**Correctness analysis**:

**Assumption Set** \\(\mathcal{A}_{SS}\\): Bounded counters initialized to actual inventory, quota sum \\(\leq\\) total inventory, {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge semantics.

**Oversell probability bound**: Under \\(\mathcal{A}_{SS}\\), oversells occur only when:
1. Quota was set incorrectly (human error, rate \\(\epsilon_h\\))
2. Race condition in local quota enforcement (system bug, rate \\(\epsilon_s\\))

The bound states that the oversell probability under quotas is at most \\(\epsilon_h + \epsilon_s\\), which is far smaller than the baseline oversell probability without quotas (the product of partition probability and concurrent-sale probability).

{% katex(block=true) %}
P(\text{oversell}) \leq \epsilon_h + \epsilon_s \ll P(\text{oversell}|\text{no\_quota}) = P(\text{partition}) \cdot P(\text{concurrent\_sale})
{% end %}

**Reconciliation time**: Dominated by Merkle tree traversal \\(O(k \log(n/k) + k)\\) where \\(k\\) is divergent items. For sparse divergence (\\(k \ll n\\)): \\(T_{\text{reconcile}} \approx k \cdot T_{\text{sync}}\\).

**Data integrity**: {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge guarantees no data loss under assumption \\(\mathcal{A}_{SS}\\). Convergence follows from semilattice properties.

**Hierarchical authority for allocation conflicts**: When two warehouses simultaneously commit the last unit of inventory to different orders, the winning warehouse is the one whose commit timestamp is earlier — \\(\text{CommitTime}(w)\\) is the wall-clock time at which warehouse \\(w\\) recorded its commitment.

{% katex(block=true) %}
\text{Winner} = \arg\min_{w \in \{A, B\}} \text{CommitTime}(w)
{% end %}

The warehouse with the earlier commit time fulfills its order. The losing warehouse must either source from another location or backorder. This creates occasional customer friction but maintains system integrity.

The authority hierarchy:
- **Warehouse Manager**: Can override quotas locally (L1 authority)
- **Regional Director**: Can reallocate between warehouses (L2 authority)
- **Central Operations**: Can globally rebalance inventory (L3 authority)

### Last-Writer-Wins vs Application Semantics

**Last-Writer-Wins (LWW)** is a common conflict resolution strategy: when values conflict, the most recent timestamp wins.

{% katex(block=true) %}
\text{merge}(v_1, t_1, v_2, t_2) = \begin{cases}
v_1 & \text{if } t_1 > t_2 \\
v_2 & \text{otherwise}
\end{cases}
{% end %}

If \\(t_1 = t_2\\), resolve with a stable tie-breaker (e.g., lower node ID wins).

LWW works for:
- Configuration values (latest config should apply)
- Status updates (latest status is most relevant)
- Position reports (latest position is current)

LWW fails for:
- Counters (later increment doesn't override earlier; both should apply)
- Sets with removal (later add doesn't mean earlier remove didn't happen)
- Causal chains (effect can have earlier timestamp than cause)

**Edge complication**: LWW assumes reliable timestamps. Clock drift makes "latest" ambiguous. If Cluster A's clock is 3 seconds ahead of Cluster B, Cluster A's updates always win - even if they're actually older.

**Vector Clocks for Causality**

Before examining hybrid approaches, consider pure {% term(url="#def-13", def="Per-node logical counters tracking causal order of events; if neither node's vector dominates the other, the events are concurrent and require merge resolution rather than simple ordering") %}vector clocks{% end %}. Each node \\(i\\) maintains a vector \\(V_i[1..n]\\) where \\(V_i[j]\\) represents node \\(i\\)'s knowledge of node \\(j\\)'s logical time.

<span id="def-13"></span>
**Definition 13** (Vector Clock). *A {% term(url="#def-13", def="Per-node logical counters tracking causal order of events; if neither node's vector dominates the other, the events are concurrent and require merge resolution rather than simple ordering") %}vector clock{% end %} \\(V\\) is a function from node identifiers to non-negative integers. The {% term(url="#def-13", def="Per-node logical counters tracking causal order of events; if neither node's vector dominates the other, the events are concurrent and require merge resolution rather than simple ordering") %}vector clock{% end %} ordering \\(\leq\\) is defined as:*

{% katex(block=true) %}
V_A \leq V_B \iff \forall i: V_A[i] \leq V_B[i]
{% end %}

*Events are causally related iff their {% term(url="#def-13", def="Per-node logical counters tracking causal order of events; if neither node's vector dominates the other, the events are concurrent and require merge resolution rather than simple ordering") %}vector clocks{% end %} are comparable; concurrent events have incomparable vectors.*

In other words, \\(V_A \leq V_B\\) means node A's clock can only have happened before node B's clock; if neither \\(V_A \leq V_B\\) nor \\(V_B \leq V_A\\) holds, the two events occurred concurrently with no causal dependency between them.

<span id="prop-14"></span>
**Proposition 14** (Vector Clock Causality). *For events \\(e_1\\) and \\(e_2\\) with vector timestamps \\(V_1\\) and \\(V_2\\):*
- *\\(e_1 \rightarrow e_2\\) (\\(e_1\\) happened before \\(e_2\\)) iff \\(V_1 < V_2\\)*
- *\\(e_1 \parallel e_2\\) (concurrent) iff \\(V_1 \not\leq V_2\\) and \\(V_2 \not\leq V_1\\)*

In other words, you can determine the causal relationship between any two events purely by comparing their vector timestamps: strict component-wise ordering means one caused the other, while incomparable vectors mean the events happened independently and neither influenced the other.

The update rules are:
- **Local event**: \\(V_i[i] \gets V_i[i] + 1\\)
- **Send message**: Attach current \\(V_i\\) to message
- **Receive message with \\(V_m\\)**: \\(V_i[j] \gets \max(V_i[j], V_m[j])\\) for all \\(j\\), then \\(V_i[i] \gets V_i[i] + 1\\)

**Edge limitation**: Vector clocks grow linearly with node count. For a 50-drone swarm, each message carries 50 integers. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} with 12 vehicles, overhead is acceptable. For larger fleets, compressed representations or hierarchical clocks are needed.

**Mitigation**: Hybrid Logical Clocks add a monotonic counter to wall time to handle NTP skew; see Kulkarni et al. (2014) for details. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, LWW on route decisions is unreliable because a vehicle with a fast clock always wins regardless of information freshness — application semantics require considering intel recency, not just decision timestamp.

### Custom Merge Functions

When standard {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s don't fit, define custom merge functions satisfying the same semilattice requirements as Definition 12: commutativity, associativity, and idempotency.

**Example: Surveillance priority list**

Each cluster maintains a list of priority targets. During partition, both clusters may add or reorder targets.

Merge function:
1. Union of all targets: \\(T_{\text{merged}} = T_A \cup T_B\\)
2. Priority = maximum priority assigned by any cluster
3. Flag conflicts where clusters assigned significantly different priorities

The merged priority of target \\(t\\) is the higher of the two clusters' individual priority scores, so that important targets identified by either cluster are never downgraded during reconciliation.

{% katex(block=true) %}
\text{priority}_{\text{merged}}(t) = \max(\text{priority}_A(t), \text{priority}_B(t))
{% end %}

This is commutative and associative. Conflicts are flagged for human review rather than silently resolved.

**Example: Engagement authorization**

Critical: a target should only be engaged if both clusters agree.

The merged authorization set contains only targets that both clusters independently authorized — using intersection rather than union ensures that a single cluster's unilateral authorization is insufficient to commit the fleet to an engagement.

{% katex(block=true) %}
\text{authorized}_{\text{merged}} = \text{authorized}_A \cap \text{authorized}_B
{% end %}

If Cluster A authorized target T but Cluster B did not, the merged state does not authorize T. Conservative resolution for high-stakes decisions.

**Verification**: Custom merge functions must be proven correct. For each function, verify:
1. Commutativity: formal proof or exhaustive testing
2. Associativity: formal proof or exhaustive testing
3. Idempotency: formal proof or exhaustive testing
4. Safety: merged state satisfies application invariants

### Game-Theoretic Extension: Merge Semantics as Fair Division

Each {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge function implicitly makes a fairness decision about whose divergent state takes precedence. The game-theoretic framing makes these choices explicit.

**Fair division framework**: When clusters A and B hold divergent states \\(s_A \neq s_B\\), the merge function \\(m(s_A, s_B)\\) allocates value. Under the **Nash bargaining solution**, the fair merge maximizes the product of utility gains over each cluster's fallback:
{% katex(block=true) %}
m^*_{\text{Nash}} = \arg\max_{s} \prod_{k \in \{A,B\}} \bigl(U_k(s) - U_k(s_{\text{fallback}})\bigr)
{% end %}

**Merge function fairness audit**:
- **LWW-Register** (last-write-wins): favors the cluster with faster clocks or lower node ID tie-breaker - asymmetric, strategically manipulable by controlling commit timing
- **Intersection** (engagement authorization): unanimity rule - minimizes false authorizations but maximizes false negatives; correct when \\(C_{\text{false auth}} \gg C_{\text{missed auth}}\\)
- **Maximum** (surveillance priority): appropriate when priorities are independent across targets; over-allocates when two clusters assign effort to the same target (substitutable priorities)
- **Union** (G-Set coverage): correct for additive capabilities with no conflict
- **Proportional quota** ({% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %}): satisfies Nash bargaining axioms when fallback utilities are zero

**Practical implication**: For each {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} in the system, document the merge function against the fairness criterion it satisfies. For resource allocation (quotas, task assignments), use proportional or Nash bargaining allocation. For irreversible decisions (engagement authorization), use intersection. For additive state (coverage maps, sensor readings), use union or maximum as appropriate to whether the underlying quantities are complementary or substitutable.

---

## Hierarchical Decision Authority

### Decision Scope Classification

<span id="def-14"></span>
**Definition 14** (Authority Tier). *The {% term(url="#def-14", def="Level in the decision hierarchy (node, cluster, fleet, command); determines which decisions a node makes autonomously versus escalates when connectivity to higher tiers is lost") %}authority tier{% end %} \\(\mathcal{Q}_j\\) for \\(j \in \\{0,1,2,3\\}\\) classifies decisions by the scope of affected nodes. The scope \\(\text{scope}(d)\\) of a decision \\(d\\) is the set of nodes whose state is affected by \\(d\\).*

In other words, a decision belongs to tier \\(\mathcal{Q}_j\\) based solely on how many nodes its outcome touches: a self-repair action on one drone is tier 0, a formation change within a cluster is tier 1, a mission-wide route update is tier 2, and anything requiring external command approval is tier 3.

| Tier | Name | Scope | Example |
| :---: | :--- | :--- | :--- |
| \\(\mathcal{Q}_0\\) | Node | Single node | Local healing action |
| \\(\mathcal{Q}_1\\) | Cluster | Local cluster | Formation adjustment |
| \\(\mathcal{Q}_2\\) | Fleet | All nodes | Mission parameter change |
| \\(\mathcal{Q}_3\\) | Command | Beyond fleet | Rules of engagement |

Not all decisions have the same scope. The authority tier hierarchy is defined in Definition 14 above. During partition: \\(\mathcal{Q}_0\\) and \\(\mathcal{Q}_1\\) decisions continue normally; \\(\mathcal{Q}_2\\) decisions become problematic since fleet-wide coordination is impossible; \\(\mathcal{Q}_3\\) decisions cannot be made and the system must operate within pre-authorized bounds.

The diagram contrasts the full four-tier hierarchy under normal connectivity with the collapsed two-tier structure after partition, highlighting how the cluster lead absorbs elevated authority in the absence of higher tiers.

{% mermaid() %}
graph TD
    subgraph Connected["Connected State (full hierarchy)"]
    A3C["A3: Command<br/>(strategic decisions)"] --> A2C["A2: Fleet<br/>(fleet-wide coordination)"]
    A2C --> A1C["A1: Cluster<br/>(local coordination)"]
    A1C --> A0C["A0: Node<br/>(self-management)"]
    end
    subgraph Partitioned["Partitioned State (delegated authority)"]
    A1P["A1: Cluster Lead<br/>(elevated to A2 authority)"] --> A0P["A0: Node<br/>(autonomous operation)"]
    end

    A1C -.->|"partition<br/>event"| A1P

    style A3C fill:#ffcdd2,stroke:#c62828
    style A2C fill:#fff9c4,stroke:#f9a825
    style A1C fill:#c8e6c9,stroke:#388e3c
    style A0C fill:#e8f5e9,stroke:#388e3c
    style A1P fill:#fff9c4,stroke:#f9a825
    style A0P fill:#e8f5e9,stroke:#388e3c
{% end %}

**Authority elevation during partition**: When connectivity is lost, authority must be explicitly delegated downward. The system cannot simply assume lower levels can make higher-level decisions.

### Authority Delegation Under Partition

**Formal Decision Problem**:

**Objective Function**:

The objective selects the {% term(url="#def-14", def="Level in the decision hierarchy (node, cluster, fleet, command); determines which decisions a node makes autonomously versus escalates when connectivity to higher tiers is lost") %}authority tier{% end %} \\(\mathcal{Q}^*\\) that maximizes expected mission value minus the cost of reconciling any decisions made at that authority level when connectivity resumes.

{% katex(block=true) %}
\mathcal{Q}^* = \arg\max_{\mathcal{Q}_j \in \{\mathcal{Q}_0, \ldots, \mathcal{Q}_2\}} \left[\mathbb{E}[V_{\text{mission}}(\mathcal{Q}_j) \mid \Xi = \mathcal{N}] - C_{\text{reconciliation}}(\mathcal{Q}_j)\right]
{% end %}

Higher authority enables more effective local action but increases reconciliation cost upon reconnection.

**Constraint Set**:

Four constraints bound the delegation: authority cannot exceed what was pre-authorized, must be warranted by partition duration, is capped below command-tier, and must remain within an approved decision scope.

{% katex(block=true) %}
\begin{aligned}
g_1: && \mathcal{Q}_j &\leq \mathcal{Q}_{\text{pre-authorized}} && \text{(pre-delegation bound)} \\
g_2: && \tau_{\text{partition}} &\geq \tau_{\min}(\mathcal{Q}_j) && \text{(duration threshold)} \\
g_3: && \mathcal{Q}_j &\leq \mathcal{Q}_2 && \text{(command reserved)} \\
g_4: && \text{scope}(\mathcal{Q}_j) &\subseteq \text{scope}_{\text{authorized}} && \text{(bounded scope)}
\end{aligned}
{% end %}

**State Transition Model**:

The delegated authority level grows by one tier per \\(\tau_{\text{escalation}}\\) time units of continuous partition, saturating at \\(\mathcal{Q}_2\\) so that command-tier authority is never granted automatically.

{% katex(block=true) %}
\mathcal{Q}_{\text{delegated}}(\tau) = \min\left(\mathcal{Q}_2, \mathcal{Q}_0 + \left\lfloor \frac{\tau}{\tau_{\text{escalation}}} \right\rfloor\right)
{% end %}

Authority increases by one tier per \\(\tau_{\text{escalation}}\\) time units of partition, capped at {% katex() %}\mathcal{Q}_2{% end %}. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, \\(\tau_{\text{escalation}} = 15\\) minutes — after 15 minutes of partition, the cluster lead's authority escalates by one tier.

The effective authority at the next time step depends on the current {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %} \\(\Xi(t)\\): when the fleet is connected or degraded (\\(\mathcal{C}\\) or \\(\mathcal{D}\\)), authority is restored to the cluster's pre-configured ceiling; when the fleet is isolated or nominal-partition (\\(\mathcal{I}\\) or \\(\mathcal{N}\\)), authority falls back to the time-escalated delegated level.

{% katex(block=true) %}
\mathcal{Q}_{\text{effective}}(t+1) = \begin{cases}
\min(\mathcal{Q}_3, \mathcal{Q}_{\text{cluster}}) & \text{if } \Xi(t) \in \{\mathcal{C}, \mathcal{D}\} \\
\mathcal{Q}_{\text{delegated}}(\tau_{\text{partition}}) & \text{if } \Xi(t) \in \{\mathcal{I}, \mathcal{N}\}
\end{cases}
{% end %}

**Pre-delegated authority rules**:
- "If partitioned for more than 30 minutes, cluster leads have \\(\mathcal{Q}_2\\) authority for routing decisions."
- "If command unreachable for more than 2 hours, convoy lead has \\(\mathcal{Q}_3\\) authority for mission continuation."

**Bounded delegation constraints**:
- "\\(\mathcal{Q}_2\\) authority for maximum 4 hours, then revert to \\(\mathcal{Q}_1\\)."
- "\\(\mathcal{Q}_2\\) authority for route changes only, not for objective changes."

**Authority vacuum scenario**: When delegated authority expires and higher tiers remain unreachable, the system enters a constrained operating mode. The cluster continues \\(\mathcal{Q}_1\\) operations (local decisions only) but cannot make fleet-affecting choices. This may result in suboptimal fleet behavior but prevents unauthorized scope expansion. **Escape hatch**: Pre-configured "mission abort" or "rally point" behavior activates after extended authority vacuum (e.g., 8+ hours), returning assets to safe configuration without requiring higher authority.

**Mission-phase dependent modulation**:
- "During critical phases, maintain strict \\(\mathcal{Q}_1\\) only."
- "During emergency withdrawal, cluster leads have emergency \\(\mathcal{Q}_2\\) authority."

During critical phases, \\(\mathcal{Q}_1\\) authority takes precedence over partition duration rules: a 30-minute partition does not elevate to \\(\mathcal{Q}_2\\) while a critical phase is active.

**Risk**: Parallel partitions may both claim authority. Cluster A and Cluster B both think they're the senior cluster and both make L2 decisions. On reconnection, they have conflicting fleet-wide decisions.

**Mitigation**: Tie-breaking rules defined in advance.
- "Cluster containing node with lowest ID has priority."
- "Cluster with most recent command contact has priority."
- GPS-based: "Cluster closest to objective has priority."

### Game-Theoretic Extension: Incentive-Compatible Delegation

The delegation optimization addresses *what authority to grant* but not *whether the agent will exercise it aligned with the principal's interests*. During partition, a cluster lead faces situations where mission-aligned actions conflict with asset preservation — the **moral hazard risk** is that a disconnected cluster lead with pre-committed authority may exercise that authority in ways that serve local asset preservation over mission objectives, and the principal (command tier) cannot observe or correct this during partition.

**Actionable design**: Pre-commit authority grants based on threat level, and require a post-reconnection accountability audit scaled to the authority exercised. A cluster lead that claims high threat to access elevated authority must submit a complete decision log and debrief at reconnection. This creates a cost for false threat inflation that exceeds the decision-making benefit unless the threat is genuine, making truthful reporting the dominant strategy without requiring complex mechanism design.

**Practical implication**: Extend pre-delegation rules with a self-reporting component: cluster leads submit a threat assessment at the start of isolation that determines their authority scope. Non-standard decisions are logged against this assessment and reviewed at reconnection, creating reputational accountability.

### Conflict Detection at Reconciliation

**Reconciliation Strategy Selection: Formal Problem**

When clusters reconnect, multiple reconciliation strategies \\(r \in \mathcal{R}\\) are available — differing in bandwidth use, latency, and residual divergence — and the objective is to pick the strategy that minimizes total reconciliation cost while staying within coherence and bandwidth constraints.

**Objective Function**: The optimal strategy \\(r^*\\) minimizes the weighted sum of reconciliation time \\(T_{\text{reconcile}}(r)\\) and residual divergence \\(D_{\text{residual}}(r)\\), where weight \\(w\\) reflects the relative cost of leaving divergence unresolved.

{% katex(block=true) %}
r^* = \arg\min_{r \in \mathcal{R}} \left[ T_{\text{reconcile}}(r) + w \cdot D_{\text{residual}}(r) \right]
{% end %}

Minimize reconciliation time subject to bounded residual divergence.

**Constraint Set**: Three constraints bound the feasible strategies: residual divergence must stay below threshold \\(D_{\max}\\), bandwidth consumed by the strategy must not exceed what the current {% term(url="@/blog/2026-01-15/index.md#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} \\(C(t)\\) provides, and any conflict arising from the strategy must be resolvable deterministically (the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} property).

{% katex(block=true) %}
\begin{aligned}
g_1: && D_{\text{residual}}(r) &\leq D_{\max} && \text{(coherence bound)} \\
g_2: && B_{\text{required}}(r) &\leq B_{\text{available}}(C(t)) && \text{(bandwidth)} \\
g_3: && \text{conflict}(r) &\Rightarrow \text{deterministic\_resolution}(r) && \text{(CRDT property)}
\end{aligned}
{% end %}

**State Transition Model**: After all partition clusters merge, the unified state \\(\Sigma_{\text{merged}}\\) is the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} join of every cluster's local state — the join operator \\(\bigsqcup\\) applies the same commutative, associative, idempotent merge across all partitions simultaneously.

{% katex(block=true) %}
\Sigma_{\text{merged}} = \bigsqcup_{i \in \text{partitions}} \Sigma_i
{% end %}

where \\(\sqcup\\) is the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} join (commutative, associative, idempotent).

### Game-Theoretic Extension: VCG-Based Conflict Resolution

First-commit-wins and LWW-based conflict resolution create **commitment races**: both clusters have incentives to commit decisions early (to win the race), discarding information that arrives after commitment. The mechanism design solution eliminates this race.

**The commitment race**: Under LWW, if cluster A prefers decision \\(d_A\\) and knows cluster B will commit at \\(\hat{t}_B\\), cluster A commits at \\(t_A < \hat{t}_B\\) regardless of information quality. Nash equilibrium: both commit immediately, discarding all post-commitment information.

**Second-price rule**: Resolve conflicts in favor of the cluster whose commitment carries the highest declared value, with the winner paying the second-highest value to the loser (as compensation for opportunity cost). This is strategy-proof - no cluster benefits from misrepresenting decision value:
{% katex(block=true) %}
d^* = \arg\max_{k \in \{A,B\}} \text{Value}_k(d_k), \quad \text{transfer} = \text{Value}_{\text{loser}}(d_{\text{loser}})
{% end %}

**{% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} application**: Replace "first commit fulfills the order" with a sealed-bid allocation: each warehouse submits the order's declared value alongside the commitment. The highest-value commitment fulfills the order; the losing warehouse receives a credit equal to the declared value of its lost opportunity. This eliminates the commitment race and allocates inventory to the highest-value use.

**{% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} application**: For field service documentation conflicts, the cluster whose documentation covers the higher-priority task resolution wins, with the other cluster's additions merged as supplementary notes. The priority ordering is determined by the task severity taxonomy, not commit timing.

**Practical implication**: For state variables where both clusters may legitimately have valid divergent values (routing decisions, inventory commitments, task assignments), implement value-weighted conflict resolution with compensation transfers rather than pure LWW. The transfer mechanism incentivizes clusters to report true decision values rather than strategically inflating them.

When clusters reconnect, compare decision logs:

**Detection**: Identify overlapping authority claims. The conflict set collects all pairs of decisions \\((d_A, d_B)\\) where both the scope of \\(d_A\\) and the scope of \\(d_B\\) cover at least one common node, and the two decisions differ in content.

{% katex(block=true) %}
\text{conflict} = \{d_A, d_B : \text{scope}(d_A) \cap \text{scope}(d_B) \neq \emptyset \land d_A \neq d_B\}
{% end %}

Two decisions conflict if they affect overlapping scope and differ.

**Classification**: Reversible vs irreversible.

- **Reversible**: Route decisions before execution, target prioritization, resource allocation
- **Irreversible**: Physical actions taken, resources consumed, information disclosed

**Resolution for reversible**: Apply hierarchy.

If Cluster A made decision \\(d_A\\) and Cluster B made decision \\(d_B\\):
1. If \\(\text{authority}(A) > \text{authority}(B)\\): \\(d_A\\) wins
2. If \\(\text{authority}(A) = \text{authority}(B)\\): Apply tie-breaker
3. Update both clusters to winning decision

**Resolution for irreversible**: Flag for human review.

Cannot undo physical actions. Log the conflict, document both decisions and outcomes, present to command for analysis. Learn from the conflict to improve future protocols.

<span id="scenario-multiwrite"></span>

### Commercial Application: MULTIWRITE Field Service Documentation

{% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} enables field technicians to edit work orders and documentation in locations with intermittent connectivity: industrial facilities, remote infrastructure, underground installations. Technicians collaborate on a shared system that must remain available regardless of connectivity.

**The collaboration coherence challenge**: Traditional document systems require online access. Field technicians working in basements, tunnels, or remote sites lose access precisely when they need documentation most. {% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} uses {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s to enable offline editing with automatic merge on reconnection.

**Document structure as {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} composition**:

The diagram shows how a single work-order document is decomposed into a hierarchy of {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} types, with the appropriate merge semantics chosen for each element — note how text sections use RGA while attachments use the simpler G-Set.

{% mermaid() %}
graph TD
    subgraph "Document CRDT Structure"
        DOC["Document<br/>LWW-Register (metadata)"]
        SECTIONS["Sections<br/>OR-Set (add/remove sections)"]
        SEC1["Section 1<br/>RGA (text sequence)"]
        SEC2["Section 2<br/>RGA (text sequence)"]
        MEDIA["Media<br/>G-Set (attachments)"]
        COMMENTS["Comments<br/>OR-Set (threaded)"]
    end

    DOC --> SECTIONS
    SECTIONS --> SEC1
    SECTIONS --> SEC2
    DOC --> MEDIA
    DOC --> COMMENTS

    style DOC fill:#e3f2fd,stroke:#1976d2
    style SEC1 fill:#e8f5e9,stroke:#388e3c
    style SEC2 fill:#e8f5e9,stroke:#388e3c
{% end %}

**{% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} selection by document element**:

| Element | CRDT Type | Concurrent Edit Behavior |
| :--- | :--- | :--- |
| Document title | LWW-Register | Latest edit wins |
| Section list | OR-Set | Both additions preserved |
| Section text | RGA (Replicated Growable Array) | Character-level merge |
| Checklist items | OR-Set with LWW status | Items merged; status by timestamp |
| Photos/attachments | G-Set with metadata | All attachments preserved |
| Signatures | LWW-Register per signatory | Latest signature wins |

**RGA for text editing**: The Replicated Growable Array preserves insertion order across concurrent edits. Each character has a unique identifier based on (site_id, sequence_number), enabling deterministic ordering:

{% katex(block=true) %}
\text{position}(c) = (\text{site\_id}, \text{seq}, \text{parent\_id})
{% end %}

When technicians A and B both insert text at position P during partition:
- A inserts "valve" - creates characters with A's site_id
- B inserts "pump" - creates characters with B's site_id
- After merge: both insertions appear, ordered by (site_id, seq) tie-breaker

This may create awkward text ("valvepump replaced") but never loses edits. Technicians resolve semantic conflicts on review.

**Real-world example**: Two technicians simultaneously edit an equipment inspection report:

| Technician | Location | Edit | Timestamp |
| :--- | :--- | :--- | :--- |
| Alice | Basement (offline) | Adds "Motor bearing wear detected" | 14:32 |
| Bob | Control room (online) | Changes status to "Requires immediate attention" | 14:35 |
| Alice | Returns to lobby | Adds photo of bearing damage | 14:41 |

When Alice's tablet syncs at 14:42:
1. Her text insertion merges into document (RGA preserves position)
2. Bob's status change applies (LWW, Bob's edit was later)
3. Her photo adds to media set (G-Set union)
4. Document now contains both contributions with correct status

**Hierarchical authority for documentation**: The three documentation roles form a strict authority containment chain — every action a technician can take is also permitted to a supervisor, and every supervisor action is also permitted to an engineer, but not vice versa.

{% katex(block=true) %}
\text{Authority}(\text{Technician}) \subset \text{Authority}(\text{Supervisor}) \subset \text{Authority}(\text{Engineer})
{% end %}

Decision scope for documentation:
- **L0 (Technician)**: Create observations, add photos, draft findings
- **L1 (Supervisor)**: Approve work orders, modify assignments, override findings
- **L2 (Engineer)**: Certify inspections, approve safety-critical changes
- **L3 (Compliance)**: Lock documents, regulatory submissions

During partition, technicians can create and edit at L0. Supervisor actions queue for sync. If urgency requires L1 decision offline, the supervisor can invoke **elevated offline authority** with mandatory post-sync review.

**Conflict resolution for regulatory documents**: Some fields require single authoritative value (serial numbers, measurement readings). {% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} handles these specially: the merge outcome is last-writer-wins when the two recorded values are compatible (differ by less than tolerance \\(\epsilon\\)), and an explicit conflict flag requiring human resolution when they exceed that tolerance.

{% katex(block=true) %}
\text{Regulatory field merge} = \begin{cases}
\text{LWW} & \text{if values compatible} \\
\text{CONFLICT} & \text{if values differ by } > \epsilon
\end{cases}
{% end %}

When two technicians record different measurement values for the same reading:
1. If difference < measurement tolerance: Average values
2. If difference > tolerance: Flag as conflict, require re-measurement
3. Maintain audit trail of both original values

**Sync prioritization for field operations**: When bandwidth is limited, {% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} transmits data in the order shown below — priority 1 goes first because safety observations may trigger immediate field action, while lower-priority data such as photos and notes can safely wait for a more stable connection.

| Priority | Data Type | Rationale |
| ---: | :--- | :--- |
| 1 | Safety observations | May trigger immediate action |
| 2 | Work order status | Affects scheduling and dispatch |
| 3 | Equipment readings | Time-sensitive data |
| 4 | Photos and attachments | Large but deferrable |
| 5 | Comments and notes | Contextual, can wait |

Field tablets opportunistically sync whenever connectivity permits, prioritizing safety-critical data even over brief connections.

**Correctness analysis**:

**Assumption Set** \\(\mathcal{A}_{MW}\\): RGA for text, G-Counter for quantities, LWW for metadata, semantic conflict detection for measurements.

**Automatic merge rate bound**: Conflicts occur when:
1. Same text position edited (probability \\(p_{\text{collision}} = P(i = j | \text{concurrent edits})\\))
2. Measurement discrepancy exceeds tolerance (probability \\(p_{\text{discrepancy}}\\))

The automatic merge succeeds when neither collision event occurs; the union bound gives the conservative lower bound \\(1 - p_{\text{collision}} - p_{\text{discrepancy}}\\) by treating the two failure modes as independent.

{% katex(block=true) %}
P(\text{auto\_merge}) = (1 - p_{\text{collision}}) \cdot (1 - p_{\text{discrepancy}}) \geq 1 - p_{\text{collision}} - p_{\text{discrepancy}}
{% end %}

For disjoint work regions (\\(p_{\text{collision}} \approx 0\\)) and consistent measurement technique (\\(p_{\text{discrepancy}} < 0.01\\)): \\(P(\text{auto\\_merge}) > 0.99\\).

**Data loss bound**: Under {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} semantics, \\(P(\text{data\\_loss}) = 0\\) by construction - all operations merge via semilattice join.

**Utility improvement**: \\(\Delta U = T_{\text{wait}} \cdot V_{\text{productivity}}\\), where \\(T_{\text{wait}}\\) is eliminated waiting time for connectivity.

---

## Reconnection Protocols

### State Reconciliation Sequence

When partition heals, clusters must reconcile state efficiently. Bandwidth may be limited during reconnection window. Protocol must be robust to partial completion if partition recurs.

**Phase 1: State Summary Exchange**

Each cluster computes a compact summary of its state using Merkle trees:

{% katex(block=true) %}
\text{MerkleRoot}(S) = H(H(s_1) || H(s_2) || \ldots || H(s_n))
{% end %}

Where \\(H\\) is a hash function and \\(s_i\\) are state elements.

Exchange roots. If roots match, states are identical - no further sync needed.

**Phase 2: Divergence Identification**

If roots differ, descend Merkle tree to identify divergent subtrees. Exchange hashes at each level until divergent leaves are found.

<span id="prop-15"></span>
**Proposition 15** (Reconciliation Complexity). *For \\(n\\)-item state with \\(k\\) divergent items, Merkle-based reconciliation requires \\(O(k \log(n/k) + k)\\) messages to identify and transfer divergences. When divergent items are spatially concentrated in the tree, this reduces to \\(O(\log n + k)\\).*

In other words, when only a small fraction of state actually diverged, Merkle-based sync is far cheaper than exchanging the full state: instead of \\(O(n)\\) messages you need only \\(O(k \log n)\\) in the general case and \\(O(\log n + k)\\) when divergent keys are clustered together.

*Proof*: The Merkle tree has height \\(O(\log n)\\). In each traversal round, parties exchange hashes for differing subtrees. At depth \\(i\\), at most \\(\min(k, 2^i)\\) subtrees differ. Traversal terminates after \\(O(\log(n/k))\\) levels, when each subtree contains at most one divergent item, yielding \\(O(k \log(n/k))\\) hash comparisons. Adding \\(O(k)\\) data transfers gives total message complexity \\(O(k \log(n/k) + k)\\). When all \\(k\\) divergences fall within a single subtree (spatially concentrated case — common when related state keys are grouped), the traversal depth is \\(O(\log n)\\) regardless of \\(k\\), reducing total complexity to \\(O(\log n + k)\\). For sparse divergence (\\(k \ll n\\)), \\(k \log(n/k) \approx k \log n\\) provides the general upper bound.

**Phase 3: Divergent Data Exchange**

Transfer the actual divergent key-value pairs. Prioritize by importance (see Priority Ordering for Sync below).

**Phase 4: Merge Execution**

Apply {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge or custom merge functions to divergent items. Compute unified state.

**Phase 5: Consistency Verification**

Recompute Merkle roots. Exchange and verify they now match. If mismatch, identify remaining divergences and repeat from Phase 3.

**Phase 6: Coordinated Operation Resumption**

With consistent state, resume fleet-wide coordination. Notify all nodes that coherence is restored.

The diagram shows the complete six-phase reconciliation protocol as a loop: the key pattern is that root comparison acts as a fast-path gate — only divergent states proceed through the Merkle traversal and merge stages.

{% mermaid() %}
graph TD
    A["Partition Heals<br/>(connectivity restored)"] --> B["Exchange Merkle Roots<br/>(state fingerprints)"]
    B --> C{"Roots<br/>Match?"}
    C -->|"Yes"| G["Resume Coordination<br/>(fleet coherent)"]
    C -->|"No"| D["Identify Divergences<br/>(traverse Merkle tree)"]
    D --> E["Exchange Divergent Data<br/>(priority-ordered)"]
    E --> F["Merge States<br/>(CRDT merge)"]
    F --> B

    style A fill:#c8e6c9,stroke:#388e3c
    style G fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style C fill:#fff9c4,stroke:#f9a825
    style D fill:#bbdefb
    style E fill:#bbdefb
    style F fill:#bbdefb
{% end %}

### Priority Ordering for Sync

Limited bandwidth during reconnection requires prioritization.

**Priority 1: Safety-critical state**
- Node availability (who is alive?)
- Threat locations (where is danger?)
- Critical failures (what is broken?)

**Priority 2: Mission-critical state**
- Objective status (what is complete?)
- Resource levels (what remains?)
- Current positions (where is everyone?)

**Priority 3: Operational state**
- Detailed sensor readings
- Historical positions
- Non-critical health metrics

**Priority 4: Audit and logging**
- Decision logs
- Event timestamps
- Diagnostic data

Sync Priority 1 first. If partition recurs, at least safety-critical state is consistent. Lower priorities can wait for more stable connectivity.

**Optimization**: Within each priority level, order sync items by expected information value: the value of syncing state item \\(s\\) is the product of its operational impact (how much mission outcome depends on this state) and its staleness (how long it has been out of date).

{% katex(block=true) %}
\text{Value}(s) = \text{Impact}(s) \times \text{Staleness}(s)
{% end %}

High-impact, stale items should sync first. Low-impact, fresh items can wait.

### Handling Actions Taken During Partition

Physical actions cannot be "merged" logically. If Cluster A drove north and Cluster B drove south, they cannot merge to "drove north and south simultaneously."

**Classification of partition actions**:

**Complementary actions**: Both clusters did useful, non-overlapping work.
- Cluster A surveyed zone X, Cluster B surveyed zone Y
- Combined coverage is union: excellent outcome

**Redundant actions**: Both clusters did the same work.
- Both surveyed zone X
- Wasted effort but no harm

**Conflicting actions**: Actions are mutually incompatible.
- Cluster A classified entity T as anomaly and flagged for intervention
- Cluster B classified entity T as normal and continued monitoring
- Cannot reconcile: T was either anomalous or normal

The table below maps each action type to its detection signature and the appropriate resolution action at reconnection.

| Type | Detection | Resolution |
| :--- | :--- | :--- |
| Complementary | Non-overlapping scope | Accept both; update state |
| Redundant | Identical scope and action | Deduplicate; note inefficiency |
| Conflicting | Overlapping scope, different action | Flag for review; assess damage |

**Audit trail**: All partition decisions must be logged with:
- Timestamp and node ID
- Information available at decision time
- Decision made and rationale
- Outcome observed

Post-mission review uses audit trail to:
- Identify conflict patterns
- Improve decision rules
- Update training data for future operations

---

## CONVOY Coherence Protocol

Return to the {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} partition at the mountain pass.

### State During Partition

**Forward group (vehicles 1-5)**:
- Route: Via Route B
- Lead: Vehicle 1
- Intel: Bridge destroyed (received first)
- Decision authority: L2 (lead assumed authority after 35 minutes partition)

**Rear group (vehicles 6-12)**:
- Route: Via bridge
- Lead: Vehicle 6
- Intel: Route B blocked (received minutes later)
- Decision authority: L2 (lead assumed authority after 35 minutes partition)

{% term(url="#def-11", def="Normalized [0,1] measure of how far a node's local state has drifted from fleet consensus; above threshold it triggers CRDT reconciliation to re-establish coherence across the fleet") %}State divergence{% end %}:
- Route plan: CONFLICTING (Route B vs bridge)
- Position: DIVERGENT (8 km separation)
- Intel database: DIVERGENT (different threat reports)

### Reconnection at Mountain Base

Radio contact restored as both groups clear the mountain pass.

**Phase 1**: Vehicle 1 and Vehicle 6 exchange state summaries.
- Merkle roots differ
- Quick comparison shows route divergence

**Phase 2**: Identify specific divergences.
- Route decision differs
- Position differs
- Intel items differ

**Phase 3**: Exchange divergent data.
- Forward group shares Route B success
- Rear group shares bridge status (actually intact!)
- Both share complete intel received

**Phase 4**: Merge states.

Intel merge reconciles conflicting reports: bridge status marked UNCERTAIN from conflicting regional command intel, but updated to INTACT based on rear group visual confirmation. Route B status marked UNCERTAIN from forward group initial report, but updated to PASSABLE based on forward group successful traverse.

Route decision merge:
- Both groups made valid L2 decisions
- Neither can be "undone" (physical positions fixed)
- Resolution: Accept current positions, plan convergence point

**Phase 5**: Verify consistency.
- Both groups now have unified intel
- Both acknowledge divergent routes are fait accompli
- Both agree on convergence plan

**Phase 6**: Resume coordinated operation.
- Forward group continues on Route B
- Rear group continues to bridge
- Groups converge at km 95 junction
- Unified convoy from km 95 onward

### Lessons Learned

1. **Intel conflict**: Regional command and forward group gave conflicting information. Neither was fully accurate. Convoy should have intel confidence scores.

2. **Route lock**: Once route decisions executed, cannot reverse. Pre-agree routing rules for partition scenarios.

3. **Communication shadow mapped**: km 47-52 is now known radio shadow. Future transits prepare for partition at this location.

4. **Independent operation validated**: Vehicles 6-12 operated successfully for 45 minutes under local lead. Confirms L2 delegation works.

The fleet emerges from partition with improved knowledge, demonstrating that the reconciliation architecture produces state no individual node held before the partition event.

---

## RAVEN Coherence Protocol

The {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm of 47 drones experiences partition due to terrain and jamming, splitting into three clusters.

### State During Partition

**Cluster A (20 drones, led by Drone 1)**:
- Coverage: Zones X1-X5
- Detections: Threat T1 at position (34.5, -118.2)
- Health: 2 drones degraded (low battery)

**Cluster B (18 drones, led by Drone 21)**:
- Coverage: Zones Y1-Y4
- Detections: Threat T2 at position (34.7, -118.4)
- Health: 1 drone lost (collision with terrain)

**Cluster C (9 drones, led by Drone 40)**:
- Coverage: Zones Z1-Z2
- Detections: None
- Health: All nominal

### Reconnection as Swarm Reforms

Clusters gradually reconnect as jamming subsides.

**Coverage merge (G-Set)**: The swarm's total surveyed coverage after reconnection is the set union of all zones covered by each cluster independently during partition.

{% katex(block=true) %}
\text{Coverage}_{\text{swarm}} = X \cup Y \cup Z = \{X1, X2, X3, X4, X5, Y1, Y2, Y3, Y4, Z1, Z2\}
{% end %}

Simple union. No conflicts possible.

**Threat merge**: The swarm's unified threat picture is the union of threats detected by each cluster; since T1 and T2 were observed at distinct positions, no deduplication is needed.

{% katex(block=true) %}
\text{Threats}_{\text{swarm}} = \{T1, T2\}
{% end %}

Union of detected threats. No conflict - different threats at different positions.

**Health merge**:

Each drone's health is LWW-Register. Latest observation wins.
- Cluster A degraded drones: Update swarm health map
- Cluster B lost drone: Mark as LOST in swarm roster

**Coherence challenge**: What if Cluster A and B both detected threats near zone W boundary?

**Entity resolution**: Compare threat attributes.

| Attribute | Cluster A (T1) | Cluster B (T3) |
| :--- | :--- | :--- |
| Position | (34.5102, -118.2205) | (34.5114, -118.2193) |
| Time offset | First observation | +2.5 minutes |
| Signature | Vehicle, moving NE | Vehicle, moving NE |

Position difference: 170 meters. Time difference: roughly 2.5 minutes. Same signature. Likely same entity observed from different angles at different times.

**Resolution**: Merge into single threat T1 with combined observations:
- Position: Average weighted by observation confidence
- Trajectory: Computed from multiple observations
- Confidence: Increased (multiple independent observations)

The merged position is the confidence-weighted average of the two observed positions, where \\(c_A\\) and \\(c_B\\) are each cluster's observation confidence scores and \\(p_A\\), \\(p_B\\) are the corresponding position vectors.

{% katex(block=true) %}
\text{position}_{\text{merged}} = \frac{c_A \cdot p_A + c_B \cdot p_B}{c_A + c_B}
{% end %}

Where \\(c\\) is confidence and \\(p\\) is position.

### Entity Resolution Formalization

For distributed observation systems, entity resolution is critical. Multiple observers may detect the same entity and assign different identifiers.

**Observation tuple**: \\((id, pos, time, sig, observer)\\)

**Match probability**: Given two observations \\(o_1\\) and \\(o_2\\), the probability they describe the same physical entity is a function \\(f\\) of the distance between their positions, the gap between their timestamps, and the similarity between their sensor signatures \\(\text{sim}(sig_1, sig_2)\\).

{% katex(block=true) %}
P(\text{same entity} | o_1, o_2) = f(\|pos_1 - pos_2\|, |time_1 - time_2|, \text{sim}(sig_1, sig_2))
{% end %}

Where \\(\text{sim}\\) is signature similarity function.

**Merge criteria**: If \\(P(\text{same}) > \theta\\), merge observations. Otherwise, keep as separate entities.

**Confidence update**: Merging two independent observations of the same entity raises the combined confidence using the complementary-probability rule: \\(c_{\text{merged}}\\) is 1 minus the probability that both observers were simultaneously wrong.

{% katex(block=true) %}
c_{\text{merged}} = 1 - (1 - c_1)(1 - c_2)
{% end %}

**Note:** This assumes observation errors are independent across nodes. If both observers share the same sensor model or environmental bias (e.g., both use identical LIDAR firmware with the same calibration error), confidence-weighted averaging amplifies the shared error rather than averaging it out. Use cross-sensor validation (Self-Measurement Without Central Observability, Proposition 7) to detect and correct correlated errors before entity resolution.

---

## OUTPOST Coherence Protocol

The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensor mesh faces distinct coherence challenges: ultra-low bandwidth, extended partition durations (days to weeks), and hierarchical fusion architecture.

### State Classification for Mesh Coherence

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} state partitions into categories with different reconciliation priorities:

<style>
#tbl_outpost_state + table th:first-of-type { width: 20%; }
#tbl_outpost_state + table th:nth-of-type(2) { width: 25%; }
#tbl_outpost_state + table th:nth-of-type(3) { width: 30%; }
#tbl_outpost_state + table th:nth-of-type(4) { width: 25%; }
</style>
<div id="tbl_outpost_state"></div>

| State Type | Update Frequency | Reconciliation Strategy | Priority |
| :--- | :--- | :--- | :--- |
| Detection events | Per-event | Union with deduplication | Highest |
| Sensor health | Per-minute | Latest-timestamp-wins | High |
| Coverage map | Per-hour | Merge with confidence weighting | Medium |
| Configuration | Per-day | Version-based with rollback | Low |

### Multi-Fusion Coordination

When multiple fusion nodes operate, they must coordinate coverage and avoid duplicate alerts:

The diagram highlights the overlap zone where Sensor 6 reports to both fusion nodes simultaneously — that shared coverage is where deduplication coordination between nodes is required.

{% mermaid() %}
graph TD
    subgraph Zone_A["Zone A (Fusion A responsibility)"]
    S1[Sensor 1]
    S2[Sensor 2]
    S3[Sensor 3]
    end
    subgraph Zone_B["Zone B (Fusion B responsibility)"]
    S4[Sensor 4]
    S5[Sensor 5]
    end
    subgraph Overlap["Overlap Zone (shared responsibility)"]
    S6["Sensor 6<br/>(reports to both)"]
    end
    subgraph Fusion_Layer["Fusion Layer"]
    F1[Fusion A]
    F2[Fusion B]
    end

    S1 --> F1
    S2 --> F1
    S3 --> F1
    S4 --> F2
    S5 --> F2
    S6 --> F1
    S6 --> F2
    F1 <-.->|"deduplication<br/>coordination"| F2

    style Overlap fill:#fff3e0,stroke:#f57c00
    style Zone_A fill:#e3f2fd
    style Zone_B fill:#e8f5e9
{% end %}

**Overlapping coverage reconciliation**: When sensors report to multiple fusion nodes:

{% katex(block=true) %}
\text{Detection}_{\text{canonical}} = \text{resolve}(\text{Detection}_{F_1}, \text{Detection}_{F_2})
{% end %}

Resolution rules:
1. **Same event, same timestamp**: Deduplicate by event ID
2. **Same event, different timestamps**: Use earliest detection time
3. **Conflicting assessments**: Combine confidence, flag for review

### Long-Duration Partition Handling

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} may operate for days without fusion node contact. Special handling for extended autonomy:

**Local decision authority**: Each sensor can make detection decisions locally. Decisions are logged for later reconciliation.

**Detection event structure** for eventual consistency:

{% katex(block=true) %}
\text{Event} = (\text{sensor\_id}, \text{timestamp}, \text{type}, \text{confidence}, \text{local\_decision}, \text{reconciled})
{% end %}

The \\(\text{reconciled}\\) flag tracks whether the event has been confirmed by fusion node. Unreconciled events are treated with lower confidence.

**Bandwidth-efficient reconciliation**: Given ultra-low bandwidth (often < 1 Kbps), {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} uses compact delta encoding. The delta \\(\Delta_{\text{state}}\\) is the set difference between the current state and the state at the last successful sync point \\(t_{\text{last\\_sync}}\\) — only this incremental change is transmitted rather than the full state.

{% katex(block=true) %}
\Delta_{\text{state}} = \text{State}(t_{\text{now}}) - \text{State}(t_{\text{last\_sync}})
{% end %}

Only changed state transmits. Merkle tree roots validate completeness without transmitting full state.

### Sensor-Fusion Authority Hierarchy

The three {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} tiers form a strict authority containment chain, with each higher tier's permitted actions fully including those of the tier below — authority over the outer network and policy does not flow down to individual sensors, and sensor-level detections do not directly authorize responses without passing through the fusion and uplink tiers.

{% katex(block=true) %}
\text{Authority}(\text{Sensor}) \subset \text{Authority}(\text{Fusion}) \subset \text{Authority}(\text{Uplink})
{% end %}

Decision scopes:

- **Sensor authority**: Detection reporting, self-health assessment, local alert
- **Fusion authority**: Alert correlation, threat classification, response recommendation
- **Uplink authority**: Response authorization, policy updates, threat escalation

During partition:
- Sensors continue detecting and logging
- Fusion (if reachable) continues correlating
- Uplink authority decisions are deferred until reconnection

<span id="prop-16"></span>
**Proposition 16** ({% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} Coherence Bound). *For an {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} mesh with \\(n\\) sensors, \\(k\\) fusion nodes, and partition duration \\(T_p\\), the expected {% term(url="#def-11", def="Normalized [0,1] measure of how far a node's local state has drifted from fleet consensus; above threshold it triggers CRDT reconciliation to re-establish coherence across the fleet") %}state divergence{% end %} is bounded by:*

{% katex(block=true) %}
D_{\text{expected}} \leq \lambda \cdot T_p \cdot \frac{n - k}{k}
{% end %}

*where \\(\lambda\\) is the event arrival rate and the factor \\((n-k)/k\\) reflects the sensor-to-fusion ratio.*

In other words, divergence grows proportionally with both the event rate and the partition duration, and scales with how many sensors share each fusion node — deploying more fusion nodes (increasing \\(k\\)) shrinks the ratio and keeps divergence bounded even during long partitions.

---

## The Limits of Coherence

### Irreconcilable Conflicts

Some conflicts cannot be resolved through merge functions or hierarchy.

**Physical impossibilities**: Cluster A reports target destroyed. Cluster B reports target escaped. Both cannot be true. The merge function cannot determine which is correct from state alone.

**Resolution**: Flag for external verification. Use sensor data from both clusters. Accept uncertainty if verification impossible.

**Resource allocation conflicts**: Cluster A allocated sensor drones to zone X. Cluster B allocated same drones to zone Y. The drones are physically in one place - but which?

**Resolution**: Trust current position reports. Update state to reflect actual positions. Flag allocation discrepancy for review.

### Byzantine Actors

A compromised node may deliberately create conflicts:
- Inject false threat reports to trigger responses
- Report false positions to disrupt coordination
- Create state inconsistencies that prevent merge

**Detection**: Byzantine behavior often creates patterns:
- Inconsistent with multiple other observers
- Reports change implausibly fast
- State updates violate physical constraints

**Isolation**: Nodes detected as potentially Byzantine:
1. Reduce trust weight in aggregation
2. Quarantine from decision-making
3. Flag for human review

Byzantine-tolerant {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s exist but are expensive. Recent work by [Kleppmann et al.](https://martin.kleppmann.com/papers/bft-crdt-papoc22.pdf) addresses making {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s Byzantine fault-tolerant, but the overhead is significant. Edge systems often use lightweight detection plus isolation rather than full Byzantine tolerance.

### Stale-Forever State

Some state may never reconcile:
- Node destroyed before sync completes
- Observation made during partition lost when node fails
- History gap cannot be filled

**Acceptance**: Perfect consistency is impossible in distributed systems under partition and failure. The fleet must operate with incomplete history.

**Mitigation**: Redundant observation. If multiple nodes observe the same event, loss of one doesn't lose the observation.

### The Coherence-Autonomy Tradeoff

Perfect coherence requires consensus before action. Consensus requires communication. Communication may be impossible.

{% katex(block=true) %}
\text{Coherence} \propto \frac{1}{\text{Autonomy}}
{% end %}

Maximum coherence means no action without agreement - the system blocks during partition. Maximum autonomy means action without coordination - coherence is minimal.

Edge architecture accepts imperfect coherence in exchange for operational autonomy. The question is not "how to achieve perfect coherence" but "how to achieve sufficient coherence for mission success."

**Sufficient coherence**: The minimum consistency needed for the mission to succeed.
- Safety-critical state: High coherence required
- Mission-critical state: Medium coherence acceptable
- Operational state: Low coherence tolerable
- Logging state: Eventual consistency sufficient

### Engineering Judgment

When should the system accept incoherence as the lesser evil?

- When enforcing coherence would prevent critical action
- When coherence delay exceeds mission window
- When coherence cost exceeds incoherence cost

This is engineering judgment, not algorithmic decision. The architect must define coherence requirements per state type and accept that perfect coherence is unachievable.

---

## Model Scope and Failure Envelope

Each mechanism has bounded validity. When assumptions fail, so does the mechanism.

### CRDT Eventual Consistency

**Validity Domain**:

{% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} convergence is guaranteed only when updates reach all nodes eventually and the merge function is a true semilattice join; failures in either condition break convergence regardless of {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} type.

{% katex(block=true) %}
\mathcal{D}_{\text{CRDT}} = \{S \mid A_1 \land A_2 \land A_3\}
{% end %}

where:
- \\(A_1\\): All updates are eventually delivered (no permanent partition with unreachable nodes)
- \\(A_2\\): Merge function satisfies semilattice properties (associative, commutative, idempotent)
- \\(A_3\\): No Byzantine corruption of {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} state

**Failure Envelope**:

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Permanent partition | Clusters diverge forever | Partition duration > mission | Accept divergence; human reconciliation |
| Merge function violation | Non-deterministic convergence | Same inputs yield different outputs | Formal verification of merge |
| Byzantine state corruption | Invalid state propagates | State invariant violations | Authenticated updates; Byzantine CRDT |

**Counter-scenario**: Node destroyed before synchronizing updates. Its updates are permanently lost. The fleet converges to state that excludes its contributions - potentially missing critical observations. Detection: membership protocol shows node loss before sync. Mitigation: critical updates require acknowledgment from multiple nodes.

### Merkle Reconciliation

**Validity Domain**:

The \\(O(k \log(n/k))\\) complexity advantage over full-state transfer holds only when divergences are sparse relative to total state size; dense divergence collapses the advantage to \\(O(n)\\).

{% katex(block=true) %}
\mathcal{D}_{\text{Merkle}} = \{S \mid B_1 \land B_2 \land B_3\}
{% end %}

where:
- \\(B_1\\): Hash function is collision-resistant
- \\(B_2\\): Tree is approximately balanced
- \\(B_3\\): Divergences are sparse (\\(k \ll n\\))

**Complexity Bound**: \\(O(k \log(n/k) + k)\\) general case; \\(O(\log n + k)\\) when divergences are spatially concentrated (Proposition 15).

**Failure Envelope**:

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Dense divergence (\\(k \approx n\\)) | \\(O(n)\\) complexity | Compare \\(k\\) to \\(n\\) | Full sync; skip Merkle |
| Unbalanced tree | Worst-case \\(O(n)\\) | Tree depth exceeds \\(2\log n\\) | Rebalance triggers |
| Hash collision (unlikely) | Missed divergence | Independent verification fails | Cryptographic hash |

**Uncertainty bound**: "Sparse divergence" means \\(k/n < 0.1\\). Above this threshold, Merkle advantage diminishes. For extended partitions with high update rates, expect \\(k/n > 0.1\\) and plan for linear reconciliation time.

### Hierarchical Authority Resolution

**Validity Domain**:

Deterministic authority resolution requires that tie-breaker inputs exist, rules are identical on all nodes, and no node strategically reports different priorities to different peers.

{% katex(block=true) %}
\mathcal{D}_{\text{authority}} = \{S \mid C_1 \land C_2 \land C_3\}
{% end %}

where:
- \\(C_1\\): Tie-breaker inputs are available (node ID, timestamp, GPS)
- \\(C_2\\): Rules are consistently pre-distributed to all nodes
- \\(C_3\\): No node equivocates (claims different priorities to different peers)

**Failure Envelope**:

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Tie-breaker unavailable | Cannot resolve authority | Missing required input | Fallback rule; multiple tie-breakers |
| Rule inconsistency | Different nodes reach different conclusions | Authority claim conflicts | Version-controlled rules |
| Equivocation | Split-brain persists | Same node, different claims | Equivocation detection; isolation |

**Counter-scenario**: GPS denied environment - timestamp is tie-breaker. But clock drift during partition means timestamps are unreliable. Nodes may have conflicting "most recent" claims. Detection: clock skew exceeds threshold. Mitigation: use relative ordering ({% term(url="#def-13", def="Per-node logical counters tracking causal order of events; if neither node's vector dominates the other, the events are concurrent and require merge resolution rather than simple ordering") %}vector clock{% end %}s) instead of absolute time.

### Summary: Claim-Assumption-Failure Table

| Claim | Key Assumptions | Valid When | Fails When |
| :--- | :--- | :--- | :--- |
| CRDTs guarantee convergence | Eventual delivery, no Byzantine | Temporary partition | Permanent partition; Byzantine |
| Merkle sync is \\(O(k \log(n/k) + k)\\) | Sparse divergence, balanced tree | Brief partition | Extended partition; skewed updates |
| Authority resolution is deterministic | Tie-breaker available, rules consistent | GPS/time available | GPS denied; rule version mismatch |
| Conflict resolution is correct | Conflict rules capture semantics | Well-defined conflicts | Semantic ambiguity; novel conflicts |

---

## Irreducible Trade-offs

No design eliminates these tensions. The architect selects a point on each Pareto front.

### Trade-off 1: Consistency vs. Availability (CAP Theorem)

**Multi-objective formulation**:

The CAP constraint makes this a true Pareto problem: any design choice \\(a\\) trades off consistency utility against availability utility, and the partition-possible constraint prohibits any point that achieves full consistency and full availability simultaneously.

{% katex(block=true) %}
\max_{a} \left( U_{\text{consistency}}(a), U_{\text{availability}}(a) \right) \quad \text{s.t.} \quad \text{partition possible}
{% end %}

Under partition, cannot simultaneously maximize both.

**Pareto front**: The three rows below span the design space from maximum consistency (CP mode, which blocks under partition) through maximum availability (AP mode, which accepts all writes and merges later) to tunable systems that choose per-operation.

| System Mode | Consistency | Availability | Partition Behavior |
| :--- | :---: | :---: | :--- |
| CP (strong) | High | Low | Block writes; wait for quorum |
| AP (eventual) | Low | High | Accept writes; merge later |
| Tunable | Varies | Varies | Per-operation choice |

Edge architecture chooses AP (availability): operations always succeed, but concurrent operations may conflict. The cost is eventual consistency - temporary divergence that must be reconciled.

### Trade-off 2: Reconciliation Speed vs. Bandwidth

**Multi-objective formulation**:

Merkle tree depth \\(d\\) parameterizes the trade-off: deeper trees transmit more hash data per round to pinpoint divergences faster, but this bandwidth cost rises with depth while latency falls.

{% katex(block=true) %}
\max_{d} \left( U_{\text{speed}}(d), -C_{\text{bandwidth}}(d) \right)
{% end %}

where \\(d\\) is Merkle tree depth.

**Pareto front**: The three depth settings below illustrate how increasing tree depth shifts bandwidth cost upward while driving total sync latency downward — each row is a distinct operating point on the trade-off curve.

| Tree Depth | Rounds to Sync | Bandwidth per Round | Total Latency |
| :--- | ---: | ---: | ---: |
| 4 | \\(O(\log_2 n)\\) | Low | High |
| 8 | \\(O(\log_2 n)\\) | Medium | Medium |
| 16 | \\(O(\log_2 n)\\) | High | Low |

Deeper trees enable finer-grained sync (less bandwidth per round) but require more rounds (higher latency). Optimal depth depends on divergence fraction \\(k/n\\).

### Trade-off 3: Authority Granularity vs. Conflict Probability

**Multi-objective formulation**:

More authority levels \\(k\\) increase operational flexibility but raise both conflict probability (multiple active tiers may issue contradictory decisions during partition) and coordination overhead — the objective makes all three tensions explicit.

{% katex(block=true) %}
\max_{k} \left( U_{\text{flexibility}}(k), -P_{\text{conflict}}(k), -C_{\text{coordination}}(k) \right)
{% end %}

where \\(k\\) is number of authority levels.

**Pareto front**: All three metrics move together as \\(k\\) increases — finer authority granularity uniformly raises flexibility, conflict risk, and coordination cost, so the architect must choose how much conflict exposure the mission can tolerate.

| Authority Levels | Flexibility | Conflict Risk | Coordination Cost |
| :--- | :---: | :---: | :---: |
| 2 (binary) | Low | Low | Low |
| 4 (standard) | Medium | Medium | Medium |
| 8 (fine-grained) | High | High | High |

More authority levels enable nuanced delegation but increase conflict probability when multiple levels activate simultaneously during partition.

### Trade-off 4: State Completeness vs. Sync Cost

**Multi-objective formulation**:

Retaining more history depth \\(s\\) improves conflict resolution quality by providing more context, but both storage cost and synchronization cost grow with \\(s\\) — the objective balances all three across the available history-depth choices.

{% katex(block=true) %}
\max_{s} \left( U_{\text{completeness}}(s), -C_{\text{storage}}(s), -C_{\text{sync}}(s) \right)
{% end %}

where \\(s\\) is retained state history depth.

The following table shows how completeness, storage, and synchronization costs scale across four representative history-depth choices.

| History Depth | Completeness | Storage Cost | Sync Cost |
| :--- | :---: | :---: | :---: |
| Current only | Low | Low | Low |
| 1 hour | Medium | Medium | Medium |
| 24 hours | High | High | High |
| Full history | Complete | Very High | Very High |

Longer history enables better conflict resolution (more context) but increases storage and synchronization costs.

### Cost Surface: Coherence Under Partition

The total cost of maintaining coherence decomposes into three additive terms — divergence that accumulates during partition, reconciliation work on reconnection, and residual conflict resolution — each driven by partition duration \\(\tau_p\\).

{% katex(block=true) %}
C_{\text{coherence}}(\tau_p) = C_{\text{divergence}}(\tau_p) + C_{\text{reconcile}}(\tau_p) + C_{\text{conflict}}(\tau_p)
{% end %}

where \\(\tau_p\\) is partition duration.

**Divergence cost**: Divergence accumulates linearly in partition duration, where \\(\alpha\\) is the per-operation divergence weight and \\(\mathbb{E}[\text{operations}]\\) is the expected operation rate.

{% katex(block=true) %}
C_{\text{divergence}}(\tau_p) = \alpha \cdot \mathbb{E}[\text{operations}] \cdot \tau_p
{% end %}

**Reconciliation cost** (for \\(k\\) divergent items): The cost has two terms — Merkle traversal proportional to \\(k \log(n/k)\\) and pairwise conflict handling proportional to \\(k^2 \cdot p_{\text{conflict}}\\), where \\(\beta\\) is the per-item reconciliation weight and \\(p_{\text{conflict}}\\) is the probability that two divergent items conflict.

{% katex(block=true) %}
C_{\text{reconcile}}(k) = \beta \cdot (k \log(n/k) + k^2 \cdot p_{\text{conflict}})
{% end %}

**Conflict resolution cost**: Each detected conflict incurs a per-conflict resolution cost \\(C_{\text{resolve}}\\), scaled by \\(\gamma\\), the fraction of conflicts that require intervention beyond automatic merge rules.

{% katex(block=true) %}
C_{\text{conflict}} = \gamma \cdot |\text{conflicts}| \cdot C_{\text{resolve}}
{% end %}

### Resource Shadow Prices

Each shadow price quantifies how much the total coherence cost changes per unit increase in the corresponding resource constraint, enabling direct comparison across heterogeneous resources.

| Resource | Shadow Price \\(\lambda\\) | Interpretation |
| :--- | ---: | :--- |
| Sync bandwidth | \$1.50/KB | Value of faster reconciliation |
| State storage | \$0.02/KB-hr | Cost of history retention |
| Conflict resolution | \$5.00/conflict | Cost of manual intervention |
| Consistency | \$0.80/%-deviation | Value of tighter consistency |

### Irreducible Trade-off Summary

The following table consolidates the four Pareto conflicts: in each row, the third column names the physical or logical constraint that prevents both objectives from being fully satisfied at once.

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Consistency-Availability | Strong consistency vs. always writable | Both under partition (CAP) |
| Speed-Bandwidth | Fast reconciliation vs. low network cost | Both with large divergence |
| Granularity-Conflicts | Fine authority vs. low conflict rate | Both with concurrent partitions |
| Completeness-Cost | Full history vs. low storage/sync | Both with limited resources |

---

## Closing: What Fleet Coherence Establishes

Four articles — contested-connectivity foundations, self-measurement, self-healing, and fleet coherence — developed the foundational capabilities for autonomic edge systems: connectivity-regime awareness, local self-measurement, autonomous self-healing, and fleet coherence under partition. {% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} warehouse inventory converges via {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge without central coordination; {% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} field documentation auto-merges character-level edits from offline technicians; {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} recovers from a route split with unified intel and a convergence plan.

{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} at the mountain pass learned concrete facts unavailable before partition:
- Intel conflicts require confidence scoring (two regional sources gave contradictory bridge status)
- Route B is passable (forward group confirmed by traversal)
- Vehicles 6-12 can operate independently for 45+ minutes under local lead authority
- Communication shadow exists at km 47-52 (now mapped for future transits)

*Quantified information gain*: Let \\(I_{\text{pre}}\\) and \\(I_{\text{post}}\\) denote fleet knowledge (measured as entropy reduction in route/threat models) before and after partition:

{% katex(block=true) %}
\Delta I = I_{\text{post}} - I_{\text{pre}} > 0 \quad \text{iff conflict occurred and was resolved}
{% end %}

The condition \\(\Delta I > 0\\) is a verifiable structural property of the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} reconciliation architecture: divergent beliefs that no single node could hold simultaneously are resolved into a joint state with strictly lower entropy. Fleet coherence does not merely eliminate divergence - it converts the divergence itself into fleet-wide knowledge.

Three design decisions determine how much coherence is achievable for a given deployment: the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} types selected for each state variable, the authority delegation rules pre-distributed before partition, and the Merkle tree depth configured for the expected divergence fraction. All three can be calibrated at design time against the mission's coherence requirements, leaving no residual ambiguity at runtime.
