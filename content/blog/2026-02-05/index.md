+++
authors = ["Yuriy Polyulya"]
title = "Fleet Coherence Under Partition"
description = "During partition, each cluster makes decisions independently. When connectivity returns, those decisions must be reconciled—but some conflicts have no clean resolution. This article develops practical approaches to fleet-wide consistency: CRDTs for conflict-free state merging, Merkle-based reconciliation protocols for efficient sync, and hierarchical decision authority that determines who gets the final word when clusters disagree. The goal isn't perfect consistency—it's sufficient coherence for the mission to succeed."
date = 2026-02-05
slug = "autonomic-edge-part4-fleet-coherence"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "eventual-consistency", "consensus"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 4
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Traditional distributed systems assume connectivity as the norm and partition as the exception. Tactical edge systems invert this assumption: disconnection is the default operating state, and connectivity is the opportunity to synchronize. This series develops the engineering principles for autonomic architectures—systems that self-measure, self-heal, and self-optimize when human operators cannot intervene."""
+++

---

## Prerequisites

This article addresses the coordination challenge that emerges from the preceding foundations:

- **[Contested Connectivity](@/blog/2026-01-15/index.md)**: The Markov connectivity model establishes partition as the default state. The capability hierarchy (L0-L4) defines what must remain coherent under partition.
- **[Self-Measurement](@/blog/2026-01-22/index.md)**: Gossip-based health propagation creates distributed health knowledge, but gossip cannot reach all nodes during partition. State diverges.
- **[Self-Healing](@/blog/2026-01-29/index.md)**: Self-healing requires local decisions. Each cluster heals independently. When clusters reconnect, their healing histories may conflict.

The preceding articles give each node and cluster the capability to survive independently. But survival is not the mission. The mission requires coordination across the fleet. When partition separates clusters, each makes decisions based on local information. When partition heals, those decisions must be reconciled.

This is the coherence problem: maintaining consistent fleet-wide state when the network prevents communication. The CAP theorem tells us we cannot have both consistency and availability during partition. Edge systems choose availability—continue operating—and must reconcile consistency when partition heals.

---

## Theoretical Contributions

This article develops the theoretical foundations for maintaining fleet coherence in partitioned distributed systems. We make the following contributions:

1. **State Divergence Metric**: We formalize divergence as a normalized symmetric difference and derive its growth rate as a function of partition duration and event arrival rate.

2. **CRDT Applicability Analysis**: We characterize the class of edge state that admits conflict-free replication and identify the semantic constraints imposed by different CRDT types.

3. **Hierarchical Authority Framework**: We formalize decision scope classification and derive conditions for safe authority delegation during partition.

4. **Merkle-Based Reconciliation Protocol**: We analyze the communication complexity of state reconciliation and prove \\(O(\log n + k)\\) message complexity for \\(k\\) divergent items in \\(n\\)-item state.

5. **Entity Resolution Theory**: We formalize the observation merge problem and derive confidence update rules for multi-observer scenarios.

These contributions connect to and extend prior work on [eventual consistency](https://queue.acm.org/detail.cfm?id=1466448), [CRDTs](https://inria.hal.science/inria-00555588/document), and [Byzantine agreement](https://lamport.azurewebsites.net/pubs/byz.pdf), adapting these frameworks for edge deployments with physical constraints.

---

## Opening Narrative: CONVOY Split

CONVOY: 12 vehicles traverse a mountain pass. At km 47, terrain creates radio shadow.

**Forward group (vehicles 1-5)** receives SATCOM: bridge at km 78 destroyed, reroute via Route B. They adjust course.

**Rear group (vehicles 6-12)** receives ground relay minutes later: Route B blocked by landslide, continue to bridge. They maintain course.

When both groups emerge from the radio shadow with full connectivity:
- Vehicles 1-5: 8km west on Route B
- Vehicles 6-12: 8km east toward bridge
- Both acted correctly on available information

The coherence challenge: physical positions cannot be reconciled, but fleet state—route plan, decisions, threat assessments—must converge to consistent view.

---

## The Coherence Challenge

### Local Autonomy vs Fleet Coordination

Parts 1-3 developed local autonomy—essential, since without it partition means failure. But local autonomy creates coordination problems. Independent actions may:

- **Complement**: Node A handles zone X, Node B zone Y (good)
- **Duplicate**: Both handle zone X (wasted resources)
- **Conflict**: Incompatible actions (mission failure)

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

**Coordination without communication** is only possible through predetermined rules. If every node follows the same rules and starts with the same information, they will make the same decisions. But partition means information diverges—different nodes observe different events.

The tradeoff: **more predetermined rules enable more coherence, but reduce adaptability**. A fleet that pre-specifies every possible decision achieves perfect coherence but cannot adapt to novel situations. A fleet with maximum adaptability achieves minimum coherence—each node does its own thing.

Edge architecture must find the balance: enough rules for critical coherence, enough flexibility for operational adaptation.

### State Divergence Sources

**Definition 11** (State Divergence). *For state sets \\(S_A\\) and \\(S_B\\) represented as key-value pairs, the divergence \\(D(S_A, S_B)\\) is the normalized symmetric difference:*

{% katex(block=true) %}
D(S_A, S_B) = \frac{|S_A \triangle S_B|}{|S_A \cup S_B|}
{% end %}

*where \\(D \in [0, 1]\\), with \\(D = 0\\) indicating identical states and \\(D = 1\\) indicating completely disjoint states.*

During partition, state diverges through multiple mechanisms:

**Environmental inputs differ**. Each cluster observes different events. Cluster A sees threat T1 approach from the west. Cluster B, on the other side of the partition, sees nothing. Their threat models diverge.

**Decisions made independently**. [Self-healing](@/blog/2026-01-29/index.md) requires local decisions. Cluster A decides to redistribute workload after node failure. Cluster B, unaware of the failure, continues assuming the failed node is operational. Their understanding of fleet configuration diverges.

**Time drift**. Without network time synchronization, clocks diverge. After 6 hours of partition at 100ppm drift, clocks differ by 2 seconds. Timestamps become unreliable for ordering events.

**Message loss**. Before partition fully established, some gossip messages reach some nodes. The partial propagation creates uneven knowledge. Node A heard about event E before partition. Node B did not. Their histories diverge.

**Proposition 12** (Divergence Growth Rate). *If state-changing events arrive according to a Poisson process with rate \\(\lambda\\), the expected divergence after partition duration \\(\tau\\) is:*

{% katex(block=true) %}
E[D(\tau)] = 1 - e^{-\lambda \tau}
{% end %}

*Proof sketch*: Model state as a binary indicator per key: identical (0) or divergent (1). Under independent Poisson arrivals with rate \\(\lambda\\), the probability a given key remains synchronized is \\(e^{-\lambda \tau}\\). The expected fraction of divergent keys follows the complementary probability. For sparse state changes, \\(E[D(\tau)] \approx 1 - e^{-\lambda \tau}\\) provides a tight upper bound.
**Corollary 5**. *Reconciliation cost is linear in divergence: \\(\text{Cost}(\tau) = c \cdot D(\tau) \cdot |S_A \cup S_B|\\) where \\(c\\) is per-item sync cost.*

---

## Conflict-Free Data Structures

### CRDTs at the Edge

**Definition 12** (Conflict-Free Replicated Data Type). *A state-based CRDT is a tuple \\((S, s^0, q, u, m)\\) where \\(S\\) is the state space, \\(s^0\\) is the initial state, \\(q\\) is the query function, \\(u\\) is the update function, and \\(m: S \times S \rightarrow S\\) is a merge function satisfying:*
- *Commutativity: \\(m(s_1, s_2) = m(s_2, s_1)\\)*
- *Associativity: \\(m(m(s_1, s_2), s_3) = m(s_1, m(s_2, s_3))\\)*
- *Idempotency: \\(m(s, s) = s\\)*

*These properties make \\((S, m)\\) a join-semilattice, guaranteeing convergence regardless of merge order.*

**Conflict-free Replicated Data Types (CRDTs)** are data structures designed for eventual consistency without coordination. Each node can update its local replica independently. When nodes reconnect, replicas merge deterministically to the same result regardless of message ordering.

If the merge operation is mathematically well-behaved, you get consistency for free.

<style>
#tbl_crdts + table th:first-of-type { width: 20%; }
#tbl_crdts + table th:nth-of-type(2) { width: 40%; }
#tbl_crdts + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_crdts"></div>

| CRDT Type | Operation | Edge Application |
| :--- | :--- | :--- |
| **G-Counter** | Increment only | Message counts, observation counts |
| **PN-Counter** | Increment and decrement | Resource tracking (±) |
| **G-Set** | Add only | Surveyed zones, detected threats |
| **2P-Set** | Add and remove (once) | Active targets, current alerts |
| **LWW-Register** | Last-writer-wins value | Configuration, status |
| **MV-Register** | Multi-value (preserve conflicts) | Concurrent updates |

**G-Set example**: RAVEN surveillance coverage

Each drone maintains a local set of surveyed grid cells. When drones reconnect:

{% katex(block=true) %}
\text{Coverage}_{\text{merged}} = \text{Coverage}_A \cup \text{Coverage}_B
{% end %}

The union is commutative (order doesn't matter), associative (grouping doesn't matter), and idempotent (merging twice gives same result). These properties guarantee convergence.

**Proposition 13** (CRDT Convergence). *If all updates eventually propagate to all nodes (eventual delivery), and the merge function satisfies commutativity, associativity, and idempotency, then all replicas converge to the same state.*

*Proof sketch*: Eventual delivery ensures all nodes receive all updates. The semilattice properties ensure merge order doesn't matter. Therefore, all nodes applying all updates in any order reach the same state.
**Edge suitability**: CRDTs require no coordination during partition. Updates are local. Merge is deterministic. This matches edge constraints perfectly.

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

The merge operation is **automatic and deterministic**—no conflict resolution logic needed. Both clusters' contributions are preserved.

**Limitations**: CRDTs impose semantic constraints. A counter that only increments cannot represent a value that should decrease. A set that only adds cannot represent removal. Application data must be structured to fit available CRDT semantics.

**Choosing the right CRDT**: The choice depends on application semantics:

{% katex(block=true) %}
\text{CRDT\_Type} = f(\text{Operations}, \text{Conflict\_Resolution}, \text{Space\_Budget})
{% end %}

- **G-Set**: Simplest, lowest overhead, but no removal
- **2P-Set**: Supports removal but element cannot be re-added
- **OR-Set**: Full add/remove semantics but higher overhead (unique tags per add)
- **LWW-Element-Set**: Timestamp-based resolution, requires clock synchronization

### Bounded-Memory Tactical CRDT Variants

Standard CRDTs assume unbounded state growth—problematic for edge nodes with constrained memory. We introduce bounded-memory variants tailored for tactical operations.

**Sliding-Window G-Counter**:

Maintain counts only for recent time windows, discarding old history:

{% katex(block=true) %}
C_{\text{bounded}}(t) = \sum_{w \in W(t)} c_w
{% end %}

where \\(W(t) = \{w : t - T_{\text{window}} \leq w < t\}\\) is the active window set. Memory: \\(O(T_{\text{window}} / \Delta_w)\\) instead of unbounded.

*RAVEN application*: Track observation counts per sector for the last hour. Older counts archived to fusion node when connectivity permits, then pruned locally.

**Bounded OR-Set with Eviction**:

Limit set cardinality with priority-based eviction:

{% katex(block=true) %}
\text{Add}(e, S) = \begin{cases}
S \cup \{e\} & \text{if } |S| < M_{\text{max}} \\
(S \setminus \{e_{\text{min}}\}) \cup \{e\} & \text{otherwise}
\end{cases}
{% end %}

where \\(e_{\text{min}} = \arg\min_{e\' \in S} \text{priority}(e\')\\). The eviction maintains CRDT properties:

*Eviction commutativity proof sketch*: Define \\(\text{evict}(S) = S \setminus \{e_{\text{min}}\}\\). For deterministic priority function, \\(\text{evict}(\text{merge}(S_A, S_B)) = \text{merge}(\text{evict}(S_A), \text{evict}(S_B))\\) when both exceed \\(M_{\text{max}}\\).

**Priority functions for tactical state**:
- Threat entities: Priority = threat level × recency
- Coverage cells: Priority = strategic value × observation freshness
- Health records: Priority = criticality × staleness (inverse)

*CONVOY application*: Track at most 50 active threats. When capacity exceeded, evict lowest-priority (low-threat, stale) entities. Memory: fixed 50 × sizeof(entity) regardless of operation duration.

**Compressed Delta-CRDT**:

Standard delta-CRDTs transmit state changes. We compress deltas using domain-specific encoding:

{% katex(block=true) %}
\text{size}(\Delta_{\text{compressed}}) = H(\Delta) + O(\log |\Delta|)
{% end %}

where \\(H(\Delta)\\) is the entropy of the delta. For tactical state with predictable patterns, compression achieves 3-5× reduction.

**Compression techniques**:
1. **Spatial encoding**: Position updates as offsets from predicted trajectory
2. **Temporal batching**: Multiple updates to same entity merged before transmission
3. **Dictionary encoding**: Common values (status codes, threat types) as indices

*OUTPOST application*: Sensor health updates compressed to 2-3 bytes per sensor versus 32 bytes uncompressed. 127-sensor mesh health fits in single packet.

**Hierarchical State Pruning**:

Tactical systems naturally have hierarchical state importance:

| Level | Retention | Pruning Trigger |
|:------|:----------|:----------------|
| Critical (threats, failures) | Indefinite | Never auto-prune |
| Operational (positions, status) | 1 hour | Time-based |
| Diagnostic (detailed health) | 10 minutes | Memory pressure |
| Debug (raw sensor data) | 1 minute | Aggressive |

State automatically demotes under memory pressure:

{% katex(block=true) %}
\text{level}(s, t) = \max(\text{level}(s, t-1) - 1, \text{level}_{\min}(s))
{% end %}

where \\(\text{level}_{\min}(s)\\) is the minimum level for state type \\(s\\).

**Memory budget enforcement**:

Each CRDT type has a memory budget \\(B_i\\). Total memory:

{% katex(block=true) %}
\sum_i M_i \leq M_{\text{total}} - M_{\text{reserve}}
{% end %}

When approaching limit, the system:
1. Prunes diagnostic/debug state
2. Compresses operational state
3. Evicts low-priority entries from bounded sets
4. Archives to persistent storage if available
5. Drops new low-priority updates as last resort

**RAVEN memory profile**: 50 drones × 2KB state budget = 100KB CRDT state. Bounded OR-Set for 200 threats (4KB), sliding-window counters for 100 sectors (2KB), health registers for 50 nodes (1.6KB). Total: ~8KB active CRDT state, well within budget.

### Last-Writer-Wins vs Application Semantics

**Last-Writer-Wins (LWW)** is a common conflict resolution strategy: when values conflict, the most recent timestamp wins.

{% katex(block=true) %}
\text{merge}(v_1, t_1, v_2, t_2) = \begin{cases}
v_1 & \text{if } t_1 > t_2 \\
v_2 & \text{otherwise}
\end{cases}
{% end %}

LWW works for:
- Configuration values (latest config should apply)
- Status updates (latest status is most relevant)
- Position reports (latest position is current)

LWW fails for:
- Counters (later increment doesn't override earlier; both should apply)
- Sets with removal (later add doesn't mean earlier remove didn't happen)
- Causal chains (effect can have earlier timestamp than cause)

**Edge complication**: LWW assumes reliable timestamps. Clock drift makes "latest" ambiguous. If Cluster A's clock is 3 seconds ahead of Cluster B, Cluster A's updates always win—even if they're actually older.

**Vector Clocks for Causality**

Before examining hybrid approaches, consider pure vector clocks. Each node \\(i\\) maintains a vector \\(V_i[1..n]\\) where \\(V_i[j]\\) represents node \\(i\\)'s knowledge of node \\(j\\)'s logical time.

**Definition 13** (Vector Clock). *A vector clock \\(V\\) is a function from node identifiers to non-negative integers. The vector clock ordering \\(\leq\\) is defined as:*

{% katex(block=true) %}
V_A \leq V_B \iff \forall i: V_A[i] \leq V_B[i]
{% end %}

*Events are causally related iff their vector clocks are comparable; concurrent events have incomparable vectors.*

**Proposition 14** (Vector Clock Causality). *For events \\(e_1\\) and \\(e_2\\) with vector timestamps \\(V_1\\) and \\(V_2\\):*
- *\\(e_1 \rightarrow e_2\\) (\\(e_1\\) happened before \\(e_2\\)) iff \\(V_1 < V_2\\)*
- *\\(e_1 \parallel e_2\\) (concurrent) iff \\(V_1 \not\leq V_2\\) and \\(V_2 \not\leq V_1\\)*

The update rules are:
- **Local event**: \\(V_i[i] \gets V_i[i] + 1\\)
- **Send message**: Attach current \\(V_i\\) to message
- **Receive message with \\(V_m\\)**: \\(V_i[j] \gets \max(V_i[j], V_m[j])\\) for all \\(j\\), then \\(V_i[i] \gets V_i[i] + 1\\)

**Edge limitation**: Vector clocks grow linearly with node count. For a 50-drone swarm, each message carries 50 integers. For CONVOY with 12 vehicles, overhead is acceptable. For larger fleets, compressed representations or hierarchical clocks are needed.

**Mitigation: Hybrid Logical Clocks (HLC)** combine physical time with logical counters:

{% katex(block=true) %}
HLC = (\max(\text{physical}_{\text{local}}, \text{physical}_{\text{received}}), \text{logical})
{% end %}

HLCs provide causal ordering when clocks are close and total ordering otherwise. The physical component bounds divergence even when logical ordering fails.

**CONVOY routing example**: Vehicles 3 and 8 both update route:
- Vehicle 3: "Route via checkpoint A" at 14:32:17
- Vehicle 8: "Route via checkpoint B" at 14:32:19

With LWW, Vehicle 8's route wins. But what if Vehicle 3 had more recent intel that arrived at 14:32:15 and took 2 seconds to process? The "winning" route may be based on stale information.

Application semantics matter. Route decisions should consider information freshness, not just decision timestamp.

### Custom Merge Functions

When standard CRDTs don't fit, define custom merge functions. The requirements are the same:

**Commutative**: \\(\text{merge}(A, B) = \text{merge}(B, A)\\)

**Associative**: \\(\text{merge}(\text{merge}(A, B), C) = \text{merge}(A, \text{merge}(B, C))\\)

**Idempotent**: \\(\text{merge}(A, A) = A\\)

**Example: Surveillance priority list**

Each cluster maintains a list of priority targets. During partition, both clusters may add or reorder targets.

Merge function:
1. Union of all targets: \\(T_{\text{merged}} = T_A \cup T_B\\)
2. Priority = maximum priority assigned by any cluster
3. Flag conflicts where clusters assigned significantly different priorities

{% katex(block=true) %}
\text{priority}_{\text{merged}}(t) = \max(\text{priority}_A(t), \text{priority}_B(t))
{% end %}

This is commutative and associative. Conflicts are flagged for human review rather than silently resolved.

**Example: Engagement authorization**

Critical: a target should only be engaged if both clusters agree.

Merge function: intersection, not union.

{% katex(block=true) %}
\text{authorized}_{\text{merged}} = \text{authorized}_A \cap \text{authorized}_B
{% end %}

If Cluster A authorized target T but Cluster B did not, the merged state does not authorize T. Conservative resolution for high-stakes decisions.

**Verification**: Custom merge functions must be proven correct. For each function, verify:
1. Commutativity: formal proof or exhaustive testing
2. Associativity: formal proof or exhaustive testing
3. Idempotency: formal proof or exhaustive testing
4. Safety: merged state satisfies application invariants

---

## Hierarchical Decision Authority

### Decision Scope Classification

**Definition 14** (Decision Scope). *The scope \\(\text{scope}(d)\\) of a decision \\(d\\) is the set of nodes whose state is affected by \\(d\\). Decisions are classified by scope cardinality: L0 (single node), L1 (local cluster), L2 (fleet-wide), L3 (command-level).*

Not all decisions have the same scope. A decision affecting only one node is different from a decision affecting the entire fleet. Decision authority should match decision scope.

<style>
#tbl_authority + table th:first-of-type { width: 15%; }
#tbl_authority + table th:nth-of-type(2) { width: 30%; }
#tbl_authority + table th:nth-of-type(3) { width: 55%; }
</style>
<div id="tbl_authority"></div>

| Level | Scope | Examples |
| :--- | :--- | :--- |
| **L0** | Single node | Self-healing, local sensor adjustment, power management |
| **L1** | Local cluster | Formation adjustment, local task redistribution, cluster healing |
| **L2** | Fleet-wide | Route changes, objective prioritization, resource reallocation |
| **L3** | Command | Rules of engagement, mission abort, strategic reposition |

**L0 decisions** can always be made locally. No coordination required. If a drone's sensor needs recalibration, it recalibrates. No need to consult the swarm.

**L1 decisions** require cluster-level coordination but not fleet-wide. If a cluster needs to adjust formation due to member failure, the cluster lead coordinates locally. Other clusters don't need to know immediately.

**L2 decisions** should involve fleet-wide coordination when possible. Route changes affect the entire convoy. Objective prioritization affects how all clusters allocate effort. These decisions benefit from fleet-wide information.

**L3 decisions** require external authority. Engagement rules come from command. Mission abort requires command approval. These cannot be made autonomously regardless of connectivity.

**During partition**: L0 and L1 decisions continue normally. L2 decisions become problematic—fleet-wide coordination is impossible. L3 decisions cannot be made; the system must operate within pre-authorized bounds.

{% mermaid() %}
graph TD
    subgraph Connected["Connected State (full hierarchy)"]
    L3C["L3: Command<br/>(strategic decisions)"] --> L2C["L2: Fleet<br/>(fleet-wide coordination)"]
    L2C --> L1C["L1: Cluster<br/>(local coordination)"]
    L1C --> L0C["L0: Node<br/>(self-management)"]
    end
    subgraph Partitioned["Partitioned State (delegated authority)"]
    L1P["L1: Cluster Lead<br/>(elevated to L2 authority)"] --> L0P["L0: Node<br/>(autonomous operation)"]
    end

    L1C -.->|"partition<br/>event"| L1P

    style L3C fill:#ffcdd2,stroke:#c62828
    style L2C fill:#fff9c4,stroke:#f9a825
    style L1C fill:#c8e6c9,stroke:#388e3c
    style L0C fill:#e8f5e9,stroke:#388e3c
    style L1P fill:#fff9c4,stroke:#f9a825
    style L0P fill:#e8f5e9,stroke:#388e3c
{% end %}

**Authority elevation during partition**: When connectivity is lost, authority must be explicitly delegated downward. The system cannot simply assume lower levels can make higher-level decisions.

### Authority Delegation Under Partition

When fleet-wide coordination is impossible, what authority do local nodes have?

**Pre-delegated authority**: Before mission start, define contingency authorities.
- "If partitioned for more than 30 minutes, cluster leads have L2 authority for routing decisions."
- "If command unreachable for more than 2 hours, convoy lead has L3 authority for mission continuation."

**Bounded delegation**: Authority expires or is limited in scope.
- "L2 authority for maximum 4 hours, then revert to L1."
- "L2 authority for route changes only, not for objective changes."

**Mission-phase dependent**: Authority varies by mission phase.
- "During critical phases, maintain strict L1 only."
- "During emergency withdrawal, cluster leads have emergency L2 authority."

**Risk**: Parallel partitions may both claim authority. Cluster A and Cluster B both think they're the senior cluster and both make L2 decisions. On reconnection, they have conflicting fleet-wide decisions.

**Mitigation**: Tie-breaking rules defined in advance.
- "Cluster containing node with lowest ID has priority."
- "Cluster with most recent command contact has priority."
- GPS-based: "Cluster closest to objective has priority."

### Conflict Detection at Reconciliation

When clusters reconnect, compare decision logs:

**Detection**: Identify overlapping authority claims.

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

Exchange roots. If roots match, states are identical—no further sync needed.

**Phase 2: Divergence Identification**

If roots differ, descend Merkle tree to identify divergent subtrees. Exchange hashes at each level until divergent leaves are found.

**Proposition 15** (Reconciliation Complexity). *For \\(n\\)-item state with \\(k\\) divergent items, Merkle-based reconciliation requires \\(O(\log n + k)\\) messages: \\(O(\log n)\\) to traverse the tree and identify divergences, plus \\(O(k)\\) to transfer divergent data.*

*Proof*: The Merkle tree has height \\(O(\log n)\\). In each round, parties exchange hashes for differing subtrees. At level \\(i\\), at most \\(\min(k, 2^i)\\) subtrees differ. Summing across \\(O(\log(n/k))\\) levels until subtrees contain \\(\leq 1\\) divergent item yields \\(O(k)\\) hash comparisons. Adding \\(O(k)\\) data transfers gives total complexity \\(O(k \log(n/k) + k) = O(k \log n)\\) in the worst case, or \\(O(\log n + k)\\) when divergent items cluster spatially.
**Phase 3: Divergent Data Exchange**

Transfer the actual divergent key-value pairs. Prioritize by importance (Phase 4.2).

**Phase 4: Merge Execution**

Apply CRDT merge or custom merge functions to divergent items. Compute unified state.

**Phase 5: Consistency Verification**

Recompute Merkle roots. Exchange and verify they now match. If mismatch, identify remaining divergences and repeat from Phase 3.

**Phase 6: Coordinated Operation Resumption**

With consistent state, resume fleet-wide coordination. Notify all nodes that coherence is restored.

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

**Optimization**: Order sync items by expected information value:

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

**Resolution by type**:

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

Return to the CONVOY partition at the mountain pass.

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

State divergence:
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

The fleet emerges from partition with improved knowledge—an [anti-fragile outcome](@/blog/2026-02-12/index.md).

---

## RAVEN Coherence Protocol

The RAVEN swarm of 47 drones experiences partition due to terrain and jamming, splitting into three clusters.

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

**Coverage merge (G-Set)**:

{% katex(block=true) %}
\text{Coverage}_{\text{swarm}} = X \cup Y \cup Z = \{X1, X2, X3, X4, X5, Y1, Y2, Y3, Y4, Z1, Z2\}
{% end %}

Simple union. No conflicts possible.

**Threat merge**:

{% katex(block=true) %}
\text{Threats}_{\text{swarm}} = \{T1, T2\}
{% end %}

Union of detected threats. No conflict—different threats at different positions.

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

{% katex(block=true) %}
\text{position}_{\text{merged}} = \frac{c_A \cdot p_A + c_B \cdot p_B}{c_A + c_B}
{% end %}

Where \\(c\\) is confidence and \\(p\\) is position.

### Entity Resolution Formalization

For distributed observation systems, entity resolution is critical. Multiple observers may detect the same entity and assign different identifiers.

**Observation tuple**: \\((id, pos, time, sig, observer)\\)

**Match probability**:

{% katex(block=true) %}
P(\text{same entity} | o_1, o_2) = f(\|pos_1 - pos_2\|, |time_1 - time_2|, \text{sim}(sig_1, sig_2))
{% end %}

Where \\(\text{sim}\\) is signature similarity function.

**Merge criteria**: If \\(P(\text{same}) > \theta\\), merge observations. Otherwise, keep as separate entities.

**Confidence update**: Merged entity has increased confidence:

{% katex(block=true) %}
c_{\text{merged}} = 1 - (1 - c_1)(1 - c_2)
{% end %}

Two 80% confident observations merge to 96% confident entity.

---

## OUTPOST Coherence Protocol

The OUTPOST sensor mesh faces distinct coherence challenges: ultra-low bandwidth, extended partition durations (days to weeks), and hierarchical fusion architecture.

### State Classification for Mesh Coherence

OUTPOST state partitions into categories with different reconciliation priorities:

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

OUTPOST may operate for days without fusion node contact. Special handling for extended autonomy:

**Local decision authority**: Each sensor can make detection decisions locally. Decisions are logged for later reconciliation.

**Detection event structure** for eventual consistency:

{% katex(block=true) %}
\text{Event} = (\text{sensor\_id}, \text{timestamp}, \text{type}, \text{confidence}, \text{local\_decision}, \text{reconciled})
{% end %}

The \\(\text{reconciled}\\) flag tracks whether the event has been confirmed by fusion node. Unreconciled events are treated with lower confidence.

**Bandwidth-efficient reconciliation**: Given ultra-low bandwidth (often < 1 Kbps), OUTPOST uses compact delta encoding:

{% katex(block=true) %}
\Delta_{\text{state}} = \text{State}(t_{\text{now}}) - \text{State}(t_{\text{last\_sync}})
{% end %}

Only changed state transmits. Merkle tree roots validate completeness without transmitting full state.

### Sensor-Fusion Authority Hierarchy

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

**Proposition 16** (OUTPOST Coherence Bound). *For an OUTPOST mesh with \\(n\\) sensors, \\(k\\) fusion nodes, and partition duration \\(T_p\\), the expected state divergence is bounded by:*

{% katex(block=true) %}
D_{\text{expected}} \leq \lambda \cdot T_p \cdot \frac{n - k}{k}
{% end %}

*where \\(\lambda\\) is the event arrival rate and the factor \\((n-k)/k\\) reflects the sensor-to-fusion ratio.*

---

## The Limits of Coherence

### Irreconcilable Conflicts

Some conflicts cannot be resolved through merge functions or hierarchy.

**Physical impossibilities**: Cluster A reports target destroyed. Cluster B reports target escaped. Both cannot be true. The merge function cannot determine which is correct from state alone.

**Resolution**: Flag for external verification. Use sensor data from both clusters. Accept uncertainty if verification impossible.

**Resource allocation conflicts**: Cluster A allocated sensor drones to zone X. Cluster B allocated same drones to zone Y. The drones are physically in one place—but which?

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

Byzantine-tolerant CRDTs exist but are expensive. Recent work by [Kleppmann et al.](https://martin.kleppmann.com/papers/bft-crdt-papoc22.pdf) addresses making CRDTs Byzantine fault-tolerant, but the overhead is significant. Edge systems often use lightweight detection plus isolation rather than full Byzantine tolerance.

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

Maximum coherence means no action without agreement—the system blocks during partition. Maximum autonomy means action without coordination—coherence is minimal.

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

## Closing: From Coherence to Anti-Fragility

The preceding articles developed resilience: the ability to survive partition and return to coordinated operation.

- **[Contested connectivity](@/blog/2026-01-15/index.md)**: Survive by designing for disconnection
- **[Self-measurement](@/blog/2026-01-22/index.md)**: Measure health even when central observability is unavailable
- **[Self-healing](@/blog/2026-01-29/index.md)**: Heal locally when human escalation is impossible
- **Fleet coherence**: Restore coordinated state when partition heals

But resilience—returning to baseline—is not the complete goal. The fleet that experiences partition should emerge better than before.

CONVOY at the mountain pass learned:
- Intel conflicts require confidence scoring
- Route B is actually passable (despite initial report)
- Vehicles 6-12 can operate independently for 45+ minutes
- Communication shadow exists at km 47-52
- Local lead authority delegation works in practice

This knowledge makes future operations stronger. The partition was stressful—but it generated valuable information.

The [next article on anti-fragility](@/blog/2026-02-12/index.md) develops systems that improve from stress rather than merely surviving it. The coherence challenge becomes a learning opportunity. Conflicts reveal hidden assumptions. Reconciliation tests merge logic. Each partition makes the fleet more robust.

The goal is not to prevent partition. The goal is to design systems that thrive despite partition—and grow stronger through it.
