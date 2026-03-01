+++
authors = ["Yuriy Polyulya"]
title = "Fleet Coherence Under Partition"
description = "When two clusters reconnect after hours apart, merging their state means choosing between information loss and accepting Byzantine-injected garbage — neither is acceptable. This article covers CRDT merge with HLC timestamps, a reputation-gated admission filter for Byzantine state, and a burst-process divergence model that's more realistic than the usual Poisson assumption."
date = 2026-02-05
slug = "autonomic-edge-part4-fleet-coherence"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "eventual-consistency", "consensus"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 4
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Edge systems can't treat disconnection as an exceptional error — it's the default condition. This series builds the formal foundations for systems that self-measure, self-heal, and improve under stress without human intervention, grounded in control theory, Markov models, and CRDT state reconciliation. Every quantitative claim comes with an explicit assumption set."""
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

<span id="def-11b"></span>
**Definition 11b** (Burst Process). *State-changing events follow an alternating renewal process with two phases:*

- **Burst phase**: Duration \\(\tau_{\text{burst}}\\), event rate \\(\lambda_{\text{burst}} = F \cdot \lambda_{\text{mean}}\\)
- **Quiet phase**: Duration \\(T_{\text{quiet}}\\), event rate \\(\lambda_{\text{quiet}} \approx 0.1 \cdot \lambda_{\text{mean}}\\)

*Typical parameters for tactical edge:*

| System | \\(\tau_{\text{burst}}\\) | \\(T_{\text{quiet}}\\) | \\(F\\) |
| :--- | :--- | :--- | :--- |
| RAVEN | 5 s | 300 s | 8 |
| CONVOY | 10 s | 600 s | 12 |

*Fano factor \\(F = \mathrm{Var}[N(t)] / \mathbb{E}[N(t)]\\) measured from operational logs.*

<span id="prop-12"></span>
**Proposition 12** (Divergence Growth Rate). *If state-changing events arrive according to a Poisson process with rate \\(\lambda\\), the expected divergence after partition duration \\(\tau\\) is:*

{% katex(block=true) %}
E[D(\tau)] = 1 - e^{-\lambda \tau}
{% end %}

*Proof sketch*: Model state as a binary indicator per key: identical (0) or divergent (1). Under independent Poisson arrivals with rate \\(\lambda\\), the probability a given key remains synchronized is \\(e^{-\lambda \tau}\\). The expected fraction of divergent keys follows the complementary probability. For sparse state changes, \\(E[D(\tau)] \approx 1 - e^{-\lambda \tau}\\) provides a tight upper bound.

**Why Poisson fails for tactical edge**: Operational update streams alternate between burst and quiet phases (Definition 11b). The Fano factor \\(F = \mathrm{Var}[\text{updates}] / \mathbb{E}[\text{updates}]\\) for tactical edge systems is 3–15 (measured on CONVOY exercises), not \\(F = 1.0\\) as Poisson assumes. Burst events cluster temporally — contact events, terrain transitions, and threat detections arrive in correlated waves, followed by extended quiet periods. A uniform Poisson rate collapses this structure: it underestimates divergence at burst onset and overestimates it during quiet, making it unreliable for buffer sizing in either regime.

<span id="prop-12b"></span>
**Proposition 12b** (Burst-Averaged Divergence). *For an alternating burst/quiet process (Definition 11b), expected divergence after partition duration \\(\tau\\) is:*

{% katex(block=true) %}
E[D(\tau)] = p_{\text{burst}} \cdot E[D_{\text{burst}}(\tau)] + p_{\text{quiet}} \cdot E[D_{\text{quiet}}(\tau)]
{% end %}

*where:*
- \\(p_{\text{burst}} = \tau_{\text{burst}} / (\tau_{\text{burst}} + T_{\text{quiet}})\\) — fraction of time in burst phase
- \\(E[D_{\text{burst}}(\tau)] = 1 - e^{-F \cdot \lambda \cdot \min(\tau,\, \tau_{\text{burst}})}\\) — divergence during burst
- \\(E[D_{\text{quiet}}(\tau)] = 1 - e^{-0.1 \cdot \lambda \cdot \max(0,\, \tau - \tau_{\text{burst}})}\\) — divergence during quiet phase

*For worst-case buffer sizing, condition on partition onset coinciding with burst start:*

{% katex(block=true) %}
D_{\text{worst}}(\tau) = 1 - e^{-F \cdot \lambda \cdot \min(\tau,\, \tau_{\text{burst}}) \;-\; 0.1 \cdot \lambda \cdot \max(0,\, \tau - \tau_{\text{burst}})}
{% end %}

*For \\(\tau \gg \tau_{\text{burst}}\\), the burst exponent saturates and the quiet term dominates growth:*

{% katex(block=true) %}
D_{\text{worst}}(\tau) \approx 1 - e^{-F \cdot \lambda \cdot \tau_{\text{burst}}} \cdot e^{-0.1 \cdot \lambda \cdot (\tau - \tau_{\text{burst}})}
{% end %}

*Proof sketch*: Model each key as a binary indicator (synchronized / diverged). During the burst epoch of duration \\(\min(\tau, \tau_{\text{burst}})\\), events arrive at rate \\(F \cdot \lambda\\); the probability a given key survives synchronized is \\(e^{-F \cdot \lambda \cdot \min(\tau, \tau_{\text{burst}})}\\). During the subsequent quiet epoch, the surviving fraction faces event rate \\(0.1 \cdot \lambda\\); the joint survival probability is the product of the two exponentials. The worst-case analysis conditions on partition onset at burst start, removing the mixture weight \\(p_{\text{burst}}\\) and instead accumulating burst divergence first — this is the relevant bound for buffer sizing since it maximises the fraction of keys diverged per unit partition time. For \\(\tau \leq \tau_{\text{burst}}\\), the formula reduces to the Poisson model at elevated rate \\(F \cdot \lambda\\), recovering the original Proposition 12 result.*

In other words, divergence grows quickly at first and then saturates: a long partition does not drive divergence much higher than a medium one, because most keys diverge within the first few event intervals.

**Corollary 5**. *Reconciliation cost is linear in divergence: \\(\text{Cost}(\tau) = c \cdot D(\tau) \cdot |S_A \cup S_B|\\) where \\(c\\) is per-item sync cost.*

In other words, the total work at reconnection scales with how many key-value pairs diverged multiplied by the constant cost to transfer and merge one item; sizing the reconciliation budget requires estimating both the divergence fraction and the total state size.

<span id="cor-5b"></span>
**Corollary 5b** (Reconciliation Buffer Sizing). *Buffer size should accommodate worst-case divergence over the maximum expected partition duration \\(\tau_{\text{max}}\\):*

{% katex(block=true) %}
\text{Buffer}_{\min} = |S| \cdot D_{\text{worst}}(\tau_{\text{max}}) \cdot b_{\text{item}}
{% end %}

*where \\(|S|\\) is total state items and \\(b_{\text{item}}\\) is bytes per item. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (\\(|S| = 500\\), \\(\lambda = 2\\) events/s, \\(F = 8\\), \\(\tau_{\text{burst}} = 5\text{s}\\), \\(\tau_{\text{max}} = 1800\text{s}\\)):*

{% katex(block=true) %}
D_{\text{worst}}(1800) = 1 - e^{-F \cdot \lambda \cdot \tau_{\text{burst}} - 0.1 \cdot \lambda \cdot (\tau_{\text{max}} - \tau_{\text{burst}})} = 1 - e^{-80 - 359} \approx 1.0
{% end %}

*Both exponents are large — the burst phase alone (\\(F \cdot \lambda \cdot \tau_{\text{burst}} = 80\\)) saturates divergence near 1.0 within seconds. Buffer ≈ 500 × 32 bytes ≈ 16 KB (size for full state copy). For short partitions (\\(\tau < \tau_{\text{burst}}\\)), the formula reduces to Poisson at elevated rate:*

{% katex(block=true) %}
\text{Buffer}_{\text{short}} \approx |S| \cdot \bigl(1 - e^{-F \cdot \lambda \cdot \tau_{\text{max}}}\bigr) \cdot b_{\text{item}}
{% end %}

**Practical implications**:

1. **Short partitions (\\(\tau < \tau_{\text{burst}}\\))**: Burst assumption is correct; size buffers using \\(D_{\text{worst}} = 1 - e^{-F \cdot \lambda \cdot \tau}\\).
2. **Long partitions (\\(\tau > \tau_{\text{burst}} + T_{\text{quiet}}\\))**: Divergence saturates near 100%; buffer a full state copy.
3. **Medium partitions (\\(\tau_{\text{burst}} < \tau < T_{\text{quiet}}\\))**: Use the full \\(D_{\text{worst}}(\tau)\\) formula from Proposition 12b.

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (\\(\tau_{\text{burst}} = 5\text{s}\\)), the large \\(F \cdot \lambda = 16\\) means divergence saturates within seconds of any burst, so buffer sizing defaults to full state copy for all but the briefest partitions. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} (\\(\tau_{\text{burst}} = 10\text{s}\\), \\(T_{\text{quiet}} = 600\text{s}\\), \\(F = 12\\)), medium partitions (10–600 s) are common during terrain-induced shadows and require the full two-phase formula to avoid over-allocating buffer for the extended quiet period.

---

## Conflict-Free Data Structures

### CRDTs at the Edge

<span id="def-12"></span>
**Definition 12** (Conflict-Free Replicated Data Type). *A state-based {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} is a tuple \\((S, s^0, q, u, m)\\) where \\(S\\) is the state space, \\(s^0\\) is the initial state, \\(q\\) is the query function, \\(u\\) is the update function, and \\(m: S \times S \rightarrow S\\) is a merge function satisfying:*
- *Commutativity: \\(m(s_1, s_2) = m(s_2, s_1)\\)*
- *Associativity: \\(m(m(s_1, s_2), s_3) = m(s_1, m(s_2, s_3))\\)*
- *Idempotency: \\(m(s, s) = s\\)*

*These properties make \\((S, m)\\) a join-semilattice, guaranteeing convergence regardless of merge order.*

<span id="def-12b"></span>
**Definition 12b** (Reputation-Weighted Merge). *For a fleet of \\(n\\) nodes with reputation weights \\(w_i \in [0,1]\\) (\\(\sum_i w_i = 1\\)) and a global trust threshold \\(\Theta_{\text{trust}} \in (0, 1]\\), define the reputation-weighted join \\(\sqcup_{\mathcal{W}}\\) as a two-stage operation:*

*Stage 1 — Byzantine admission filter:*

{% katex(block=true) %}
\text{Admitted}(\mathcal{U}) = \bigl\{ s_i \in \mathcal{U} \;\big|\; \exists\, Q \subseteq \mathcal{U} : \textstyle\sum_{k \in Q} w_k > \Theta_{\text{trust}} \text{ and } s_i \text{ is consistent with } Q \bigr\}
{% end %}

*Stage 2 — standard semilattice merge on admitted updates:*

{% katex(block=true) %}
s' = \bigsqcup_{\mathcal{W}}(\mathcal{U}) = \bigsqcup_{s_i \in \text{Admitted}(\mathcal{U})} s_i
{% end %}

*where \\(\sqcup\\) is the standard CRDT join from Definition 12. Reputation weights are initialized to \\(w_i = 1/n\\) and updated from Phase 0 attestation results and historical accuracy. Default threshold: \\(\Theta_{\text{trust}} = 0.67\\), matching the BFT quorum of Proposition 44.*

*Semilattice properties under \\(\sqcup_{\mathcal{W}}\\): the underlying \\(\sqcup\\) in Stage 2 retains commutativity, associativity, and idempotency for any fixed admitted set. \\(\sqcup_{\mathcal{W}}\\) itself is a **quorum-admission gate** rather than a classical semilattice operator — it does not satisfy commutativity over all inputs by design, because Byzantine tolerance requires distinguishing honest from dishonest contributors. When the number of Byzantine nodes satisfies \\(f < n(1 - \Theta_{\text{trust}})\\), the honest quorum dominates Stage 1 and Stage 2 convergence is guaranteed. A compromised node with attestation weight \\(w_i < \Theta_{\text{trust}} / n\\) cannot alone drive a state update — its contribution is discarded in Stage 1 regardless of the CRDT value it presents.*

*Corollary (Poison Resistance): A "signed but compromised" node cannot poison swarm state unless it controls a coalition with collective weight \\(> \Theta_{\text{trust}}\\). For \\(\Theta_{\text{trust}} = 0.67\\) and uniform weights, this requires \\(f > n/3\\) Byzantine nodes — exactly the BFT threshold.*

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
| **LWW-Register** | Last-writer-wins value | Device configuration values and node status, where the latest write is authoritative<sup>†</sup> |
| **MV-Register** | Multi-value (preserve conflicts) | Fields where concurrent updates from separate clusters must both be preserved for later review |

<sup>†</sup> Requires HLC timestamps (Definition 40) for correctness under clock drift — plain wall-clock LWW-Register does not satisfy semilattice idempotency in contested environments where clocks diverge.

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

**Hierarchical authority for allocation conflicts**: When two warehouses simultaneously commit the last unit of inventory to different orders, the winning warehouse is the one whose commit timestamp is earlier — \\(\text{HLC}_{\text{commit}}(w)\\) is the Hybrid Logical Clock timestamp (Definition 40) at which warehouse \\(w\\) recorded its commitment.

{% katex(block=true) %}
\text{Winner} = \arg\min_{w \in \{A, B\}} \text{HLC}_{\text{commit}}(w)
{% end %}

Commit timestamps must use HLC ordering (Definition 40) rather than wall-clock time to preserve correctness under clock drift during partition; see [Proposition 30](#prop-30) for the complete NTP-Free Split-Brain Resolution.

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

**Bandwidth budget verification**: CONVOY (12 vehicles, 4-byte integers, 100 state updates/minute, 9.6 kbps half-duplex link at 60\% duty cycle = 5,760 bits/s available): vector clock overhead per update = \\(12 \times 4 = 48\\) bytes; at 100/min: \\(48 \times 100/60 = 80\\) bytes/s = 640 bits/s. Overhead fraction: \\(640/5760 \approx 11\\%\\) — acceptable. RAVEN (47 drones, 200 updates/minute per node, same link class): \\(47 \times 4 = 188\\) bytes/update; at 200/min: \\(188 \times 200/60 \approx 627\\) bytes/s = 5,016 bits/s \\(\approx 52\\%\\) overhead — marginal and breaks under burst traffic. **Mitigation for RAVEN**: switch to interval tree clocks (Mukund & Kulkarni 2016) or dotted version vectors — these encode \\(O(\text{clusters})\\) integers instead of \\(O(\text{nodes})\\), reducing per-update overhead to ~48 bytes (8 cluster IDs x 4 bytes + 8 sequence numbers x 4 bytes), dropping link overhead from 52\% to ~10\%. Causality guarantees are preserved at cluster granularity rather than node granularity.

**Mitigation**: Hybrid Logical Clocks add a monotonic counter to wall time to handle NTP skew; see Kulkarni et al. (2014) for the foundational analysis. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, LWW on route decisions is unreliable because a vehicle with a fast clock always wins regardless of information freshness — application semantics require considering intel recency, not just decision timestamp. Def 40–42 below formalize the HLC structure, the causality-aware merge function, and the re-sync protocol for massively drifted nodes.

<span id="def-40"></span>
**Definition 40** (Hybrid Logical Clock). *A Hybrid Logical Clock on node \\(j\\) is a tuple \\(h_j = (l_j, c_j)\\) where \\(l_j\\) is the logical watermark — the maximum physical timestamp ever observed by node \\(j\\) from its own clock or received messages — and \\(c_j\\) is a counter that increments when consecutive events share the same watermark. HLC tuples are ordered lexicographically:*

{% katex(block=true) %}
(l_1, c_1) \prec (l_2, c_2) \;\iff\; l_1 < l_2, \;\text{or}\; (l_1 = l_2 \text{ and } c_1 < c_2)
{% end %}

*On a local send or write event at node \\(j\\), letting \\(l_j^{\mathrm{prev}}\\) denote the watermark before the event and \\(\lfloor \mathrm{pt}_j \rfloor\\) the current physical clock reading:*

{% katex(block=true) %}
l_j \leftarrow \max(l_j^{\mathrm{prev}},\, \lfloor \mathrm{pt}_j \rfloor), \qquad
c_j \leftarrow \begin{cases} c_j + 1 & \text{if } l_j = l_j^{\mathrm{prev}} \\ 0 & \text{otherwise} \end{cases}
{% end %}

*On receiving a message with HLC \\((l_m, c_m)\\), letting {% katex() %}l' = \max(l_j, l_m, \lfloor \mathrm{pt}_j \rfloor){% end %}:*

{% katex(block=true) %}
c_j \leftarrow \begin{cases}
\max(c_j, c_m) + 1 & \text{if } l' = l_j = l_m \\
c_j + 1            & \text{if } l' = l_j > l_m \\
c_m + 1            & \text{if } l' = l_m > l_j \\
0                  & \text{otherwise}
\end{cases}, \qquad l_j \leftarrow l'
{% end %}

*Each CRDT operation carries metadata \\((n_j, h_j)\\) where \\(n_j\\) is the node identifier. The pair \\((n_j, h_j)\\) globally and uniquely identifies the operation.*

<span id="def-40b"></span>
**Definition 40b** (Message Delay Bound). *Let \\(\tau_{\max}(C)\\) be the maximum expected one-way message delivery time under normal network conditions at connectivity level \\(C\\), measured in physical time units:*

{% katex(block=true) %}
\tau_{\max}(C) = \begin{cases}
100\,\text{ms} & C > 0.8 \quad (\text{local mesh}) \\
5\,\text{s}    & 0.3 < C \leq 0.8 \quad (\text{degraded link}) \\
60\,\text{s}   & C \leq 0.3 \quad (\text{intermittent or contested})
\end{cases}
{% end %}

*\\(\tau_{\max}\\) bounds the 99th-percentile one-way delivery time under normal (non-adversarial) conditions and is calibrated from operational measurements. It does not bound adversarially injected delay. The anomaly detection threshold in Proposition 41 depends on \\(\tau_{\max}\\) at the current connectivity level.*

<span id="prop-41"></span>
**Proposition 41** (HLC Causal Ordering Properties). *For any two events \\(e\\), \\(f\\) with HLC timestamps \\(h_e\\), \\(h_f\\) on a fleet with maximum physical clock skew \\(\epsilon\\):*

1. *\\(l_j \geq \lfloor \mathrm{pt}_j \rfloor\\) at all times — the HLC watermark never lags physical time.*
2. *If \\(e \to f\\) (e causally precedes f ), then \\(h_e \prec h_f\\).*
3. *\\(l_j - \lfloor \mathrm{pt}_j \rfloor \leq \epsilon\\) — the watermark exceeds physical time by at most the fleet-wide clock skew.*
4. *If a received message has {% katex() %}l_m - \lfloor \mathrm{pt}_j \rfloor > \epsilon + \tau_{\max}{% end %} (Def 40b at current connectivity), then either (a) the sender's clock is anomalous — the watermark violates property 3 — or (b) message delivery exceeded \\(\tau_{\max}\\) (a network anomaly). Single-message violations are ambiguous; if multiple consecutive messages from the same sender satisfy this condition, conclude (a).*

*Proof sketch*: Properties 1–2 follow from the update rules: \\(l\\) always advances by at least the current physical timestamp, and a receive event produces \\(h_j\\) strictly greater than \\(h_m\\) (by incrementing \\(c\\) when watermarks coincide), preserving causal monotonicity. Property 3 holds when fleet clocks are bounded by a common authority (GPS PPS or NTP stratum 1) with skew \\(\leq \epsilon\\). Property 4: let \\(t_s\\) be the physical send time and \\(\tau_{\mathrm{del}}\\) the one-way delivery delay. Property 3 at the sender gives {% katex() %}l_m \leq \lfloor \mathrm{pt}_{\mathrm{send}}(t_s) \rfloor + \epsilon{% end %}. At the receiver, {% katex() %}\lfloor \mathrm{pt}_j \rfloor{% end %} is evaluated at receive time \\(t_s + \tau_{\mathrm{del}}\\); if the receiver's clock lags the sender's by the delivery interval the watermark leads receiver physical time by up to \\(\epsilon + \tau_{\mathrm{del}}\\). Therefore under normal delivery (\\(\tau_{\mathrm{del}} \leq \tau_{\max}\\)):

{% katex(block=true) %}
l_m - \lfloor \mathrm{pt}_j \rfloor \;\leq\; \epsilon + \tau_{\mathrm{del}} \;\leq\; \epsilon + \tau_{\max}
{% end %}

If the observed difference exceeds \\(\epsilon + \tau_{\max}\\), either the sender violated property 3 (clock anomaly) or \\(\tau_{\mathrm{del}} > \tau_{\max}\\) (network anomaly). \\(\square\\)

**Calibration**: Set \\(\tau_{\max}\\) to the 99th percentile of measured one-way delivery times during normal operation. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} on a local mesh with GPS-disciplined clocks (\\(\epsilon \approx 1\\)s): measured \\(\tau_{99} \approx 80\\)ms → \\(\tau_{\max} = 100\\)ms → anomaly threshold \\(\epsilon + \tau_{\max} = 1.1\\)s. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} in mountain terrain: \\(\tau_{99} \approx 3\\)s → \\(\tau_{\max} = 5\\)s → threshold 6s. Both thresholds are evaluated against the current connectivity regime (Def 40b); \\(\tau_{\max}\\) updates when regime transitions are detected.

<span id="def-41"></span>
**Definition 41** (HLC-Aware CRDT Merge Function). *Let \\(s_1, s_2\\) be CRDT states with HLC timestamps \\(h_1, h_2\\) and node identifiers \\(n_1, n_2\\). The HLC-Aware Merge function replaces the physical-timestamp LWW comparator \\(t_{s_1} > t_{s_2}\\):*

{% katex(block=true) %}
\mathbf{Merge}(s_1, h_1;\; s_2, h_2) =
\begin{cases}
s_2      & \text{if } h_1 \prec h_2 \\
s_1      & \text{if } h_2 \prec h_1 \\
s_1 \sqcup s_2 & \text{if } h_1 \parallel h_2
\end{cases}
{% end %}

*where \\(h_1 \parallel h_2\\) denotes causal concurrency (neither precedes the other) and \\(\sqcup\\) is the CRDT join (least upper bound in the semilattice). When \\(h_1 \parallel h_2\\), no write is discarded — the join resolves the conflict without relying on clock ordering.*

Per-type instantiation of the concurrent case:

| CRDT type | Causal case | Concurrent case (\\(s_1 \sqcup s_2\\)) |
| :--- | :--- | :--- |
| LWW-Register | Higher \\(h\\) wins | Deterministic tiebreaker: higher \\(n\\) wins |
| G-Counter | Not applicable | Componentwise max per node |
| OR-Set | Not applicable | Union of (element, tag) pairs |
| RGA sequence | Insert ordered by \\(h\\) | Concurrent inserts ordered by \\((h, n)\\) |

The node-ID tiebreaker for concurrent LWW-Register writes gives every node a deterministic, agreed-upon total order extension — no coordination required. A clock that drifts 10 minutes fast no longer silently wins all concurrent decisions; it simply dominates the \\(l\\) field, which after Phase 2 repair (Def 42) is corrected before merging.

<span id="def-42"></span>
**Definition 42** (Drift-Quarantine Re-sync Protocol). *When partitioned node \\(j\\) rejoins with signed drift \\(\Delta_j = l_j - \max_{i \in \mathrm{peers}} l_i\\) (positive: clock ran fast; negative: clock ran slow), execute the following four phases:*

**Phase 0 — Detection**: Compute \\(\Delta_j = l_j - \max_{i \in \mathrm{peers}} l_i\\) on first peer message exchange. Let \\(\tau_{\max}\\) be the current connectivity-regime delay bound (Def 40b).

- \\(|\Delta_j| \leq \epsilon\\): normal rejoin — drift within fleet-wide clock skew.
- \\(\epsilon < |\Delta_j| \leq \epsilon + \tau_{\max}\\): ambiguous — drift exceeds skew but within delivery-delay range. Flag for monitoring; do not quarantine. Resolve by requesting a second exchange after \\(\tau_{\max}\\): if \\(|\Delta_j|\\) persists, conclude clock drift (proceed to quarantine); if \\(|\Delta_j|\\) reduces, conclude transient delay.
- \\(|\Delta_j| > \epsilon + \tau_{\max}\\): quarantine with high confidence — drift exceeds both clock skew and maximum delivery delay.

**Phase 1 — Quarantine**: Node \\(j\\) enters read-only mode — no new local writes are accepted; only incoming gossip is processed.

**Phase 2 — HLC Repair**: Reset the watermark and advance the counter past all observed peers:

{% katex(block=true) %}
l_j \leftarrow \max\!\left(l_j,\; \max_{i \in \mathrm{peers}} l_i\right), \qquad c_j \leftarrow \max_{i \in \mathrm{peers}} c_i + 1
{% end %}

**Phase 3 — Causality Audit**: For each operation \\(o = (s, h_{\mathrm{local}}, n_j)\\) generated during the partition:

- **Concurrent** (\\(h_{\mathrm{local}} \parallel h_{\mathrm{peers}}\\) for all conflicting peers at that key): legitimate concurrent write — apply \\(\mathbf{Merge}\\) (Def 41) using the CRDT join \\(\sqcup\\). No data is discarded.
- **Fast-clock** (\\(\Delta_j > 0\\)): \\(h_{\mathrm{local}}\\) may dominate peer HLCs at causally prior positions. Reissue \\(o\\) with repaired HLC \\((l_j^{\mathrm{repaired}}, c_j + k)\\) where \\(k\\) preserves causal order among local operations. The operation joins the fleet as concurrent, not as "future winner."
- **Slow-clock** (\\(\Delta_j < 0\\)): \\(h_{\mathrm{local}} \prec h_{\mathrm{peers}}\\) — \\(o\\) is causally prior. \\(\mathbf{Merge}\\) overrides \\(o\\) only if a peer write is its causal successor; concurrent peer writes are joined via \\(\sqcup\\), not silently discarded.

**Phase 4 — Exit Quarantine**: When all partition operations are audited and CRDT state has converged with peers, exit read-only mode and resume normal HLC operation.

<span id="prop-42"></span>
**Proposition 42** (Re-sync Correctness). *The Drift-Quarantine Protocol (Def 42) guarantees:*

1. *Convergence: after re-sync, all nodes agree on the same CRDT state in \\(O(|P| \cdot n)\\) gossip rounds, where \\(|P|\\) is the number of partition operations and \\(n\\) the fleet size.*
2. *Completeness: no partition operation is silently discarded — every operation is classified as causally ordered or concurrent and handled by Def 41.*
3. *Fast-clock neutralization: no reissued operation retains an HLC watermark above the repaired network watermark. The "future writes win" failure mode is eliminated.*
4. *Slow-clock protection: operations with low HLC watermarks are not silently overwritten; they survive as concurrent when no peer operation is their causal successor.*

*Proof sketch*: Property 1 follows from CRDT convergence (Prop 13): the merged state is the join of all operations, converging regardless of evaluation order. Property 2 follows from Phase 3: every operation is explicitly classified. Properties 3–4 follow from Phase 2 HLC repair: after repair, \\(l_j = \max(l_j, l_{\mathrm{network}}) \geq l_{\mathrm{network}}\\), neutralizing the fast-clock advantage; concurrent operations survive via \\(\sqcup\\). \\(\square\\)

**Concrete scenario**: Drone 23 partitioned for 47 minutes; its RTC drifted 12 minutes fast (\\(\Delta_j = +720\\)s). Without HLC: all 847 local writes have {% katex() %}\mathrm{ts}_{\mathrm{local}} > \mathrm{ts}_{\mathrm{network}} + 720{% end %}s, silently overwriting 12 minutes of correct fleet state on rejoin — the fleet loses cohesion. With Def 42: Drone 23 enters quarantine, Phase 2 repairs \\(l_j\\), Phase 3 classifies all 847 writes as causally concurrent with peer writes in the same time window, and they are merged via OR-Set and RGA join operations — not silently winning. Convergence completes in 3 gossip rounds (consistent with Prop 4 on the RAVEN 47-drone topology).

**Phase timeline clarification — 3 rounds vs. O(|P|·n) rounds**: The "3 gossip rounds" figure refers to CRDT state propagation only (Phase 4 of Def 42: disseminating the merged CRDT join to all peers). The Phase 3 Causality Audit — classifying all 847 partition operations as causally ordered or concurrent — runs asynchronously and takes \\(O(|P| \cdot n)\\) gossip rounds, where \\(|P| = 847\\) (partition operations) and \\(n = 47\\) (fleet size). At the RAVEN gossip rate of \\(\lambda = 1\\) Hz and average convergence time of ~10 seconds per round (Prop 4), the full audit requires \\(847 \times 47 \approx 39,\!809\\) audit-exchanges at 1 Hz, completing in approximately 11 hours under continuous connectivity. In practice, the audit parallelizes across nodes (each node classifies its own \\(|P_j|\\) operations independently), reducing wall-clock time to \\(O(|P| / n \cdot D / \lambda) \approx 18 \times 8 / 1 \approx 144\\) seconds (18 operations per drone, diameter 8). The causality audit is not on the critical path for mission continuation — the node exits quarantine and resumes operations after state propagation completes in 3 rounds; the audit runs as a background verification process. The distinction matters operationally: "re-sync complete in 3 gossip rounds" means the fleet has a consistent CRDT state, not that causality has been fully audited.

### Logical Validation: Peer Corroboration and Byzantine-Resilient Quorum

Secure Boot attestation (Phase 0 in the FAC, Def 37) proves a node runs verified firmware — it does not prove its sensors report truthful physical state. A physically compromised node with valid attestation can inject false position, sensor readings, or health data, passing all cryptographic checks while corrupting the fleet's shared state model. The following definitions address logical validation: truth as what the fleet independently verifies from physics, not what a node asserts.

<span id="def-43"></span>
**Definition 43** (Peer-Validation Layer). *For claim \\(c = (\tau_c, v, h, \sigma_j)\\) of type \\(\tau_c\\) with value \\(v\\), HLC timestamp \\(h\\), and signature \\(\sigma_j\\) from node \\(j\\), define the physical plausibility predicate at neighbor \\(i\\) as \\(\phi(c, i) \in \{0, 1\}\\). Per claim type:*

| Claim type | Plausibility condition (\\(\phi(c,i) = 1\\) when) |
| :--- | :--- |
| Position | i's LIDAR/radar detects an object within \\(\epsilon_{\mathrm{pos}}\\) of claimed coordinates |
| Sensor reading | reading deviation from neighbor is bounded by physical gradient times separation distance |
| Battery state | reported level is within energy-model margin \\(B_{\mathrm{margin}}\\) of the predicted value |

For sensor readings, the condition is \\(\vert v_i - v \vert \leq \sigma_{\mathrm{grad}} \cdot d(i, j)\\), where \\(\sigma_{\mathrm{grad}}\\) is the maximum physical field gradient (e.g., temperature \\(^\circ\text{C/m}\\)). *The corroboration count over \\(k\\) nearest neighbors \\(N_k(j)\\) is:*

{% katex(block=true) %}
\kappa(c, j) = \sum_{i \in N_k(j)} \phi(c, i)
{% end %}

*Claim \\(c\\) from node \\(j\\) is accepted into shared CRDT state only if \\(\kappa(c, j) \geq k_{\mathrm{accept}}\\). For RAVEN: \\(k = 6\\) nearest neighbors, \\(k_{\mathrm{accept}} = 4\\) (two-thirds majority of neighbors).*

<span id="prop-43"></span>
**Proposition 43** (Peer-Validation False-Acceptance Bound). *Let \\(p_{\mathrm{fool}}\\) be the probability that a single neighbor sensor is independently fooled into corroborating a false claim. Under independent sensor compromise, the probability a false claim is accepted is:*

{% katex(block=true) %}
P(\text{false claim accepted}) = \sum_{m=k_{\mathrm{accept}}}^{k} \binom{k}{m} p_{\mathrm{fool}}^{\,m} (1 - p_{\mathrm{fool}})^{k-m}
{% end %}

*For RAVEN (\\(k = 6\\), \\(k_{\mathrm{accept}} = 4\\), \\(p_{\mathrm{fool}} = 0.10\\)):*

{% katex(block=true) %}
P(\text{false accepted}) = \binom{6}{4}(0.1)^4(0.9)^2 + \binom{6}{5}(0.1)^5(0.9) + (0.1)^6 \approx 1.22 \times 10^{-3}
{% end %}

**Correlated attack caveat**: Independence fails under coordinated GPS spoofing or cluster-level physical compromise. Countermeasure: require corroboration from sensors of distinct physical modalities (LIDAR, radar, optical, magnetometer) — spatial correlation of spoofing across modalities is far lower than within a single modality. An adversary simultaneously fooling \\(k_{\mathrm{accept}}\\) independent sensing principles has achieved a level of compromise that is qualitatively outside the Byzantine fault model of Def 7.

**Topology-aware adversary attack (defeats Prop 43 with probability 1)**: The independence assumption in Proposition 43 fails not only under correlated sensor spoofing but also under formation-aware positioning. An adversary with knowledge of the drone formation map can place a compromised node at a position where its \\(k\\) nearest neighbors are all within the same sensor shadow — a terrain feature, building, or signal reflector that makes all neighbor readings consistent with the false claim. Example: Drone 23 reports a false position 50 m north of its actual location. If the adversary knows that Drones 14, 18, 22, 27, 31, and 36 are all north of Drone 23 (in the same direction as the false displacement), their LIDAR returns from Drone 23's general direction will be consistent with the false position within \\(\epsilon_{\text{pos}}\\) — all 6 neighbors independently corroborate a false claim deterministically, not probabilistically. The multi-modal countermeasure partially addresses this: magnetometer readings are invariant to LIDAR-visible terrain shadows. **Required supplemental countermeasure**: cross-modal corroboration must include at least one modality with independent failure geometry (e.g., RF time-of-flight ranging, which requires adversary control of radio propagation rather than optical/terrain knowledge). Additionally, require that corroborating neighbors span at least two distinct angular sectors from the claimant's perspective — a corroboration quorum from a single sector is vulnerable to formation-aware adversaries regardless of how many nodes it contains.

<span id="def-44"></span>
**Definition 44** (Reputation-Weighted Fleet Coherence Vote). *Each node \\(i\\) maintains a reputation vector \\(\mathbf{r}(t) = [r_1(t), \ldots, r_n(t)]\\) with \\(r_j \in [0, 1]\\), updated by EWMA on corroboration outcomes:*

{% katex(block=true) %}
r_j(t) \leftarrow \alpha_r \cdot \mathbf{1}[\kappa(c_j, \cdot) \geq k_{\mathrm{accept}}] + (1 - \alpha_r) \cdot r_j(t-1)
{% end %}

*where \\(\alpha_r \ll 1\\) (slow adaptation — prevents Byzantine manipulation of the reputation update itself). The weighted vote of node \\(i\\) on claim \\(c\\) from node \\(j\\) is \\(V_i(c) = r_i(t) \cdot \phi(c, i)\\). Claim \\(c\\) is accepted under reputation weighting if:*

{% katex(block=true) %}
\frac{\sum_{i \in N_k(j)} V_i(c)}{\sum_{i \in N_k(j)} r_i(t)} \geq \theta_{\mathrm{vote}}
{% end %}

*The effective Byzantine fraction after \\(T\\) gossip rounds, as Byzantine nodes consistently fail corroboration and receive EWMA weight 0 each round:*

{% katex(block=true) %}
f_{\mathrm{eff}}(T) = \frac{\sum_{j \in \mathcal{B}} r_j(T)}{\sum_{j \in V} r_j(T)} \approx \frac{f_0 \cdot (1-\alpha_r)^T}{1 - f_0 + f_0 \cdot (1-\alpha_r)^T}
{% end %}

*where \\(f_0 = \vert \mathcal{B} \vert / n\\). Byzantine nodes decay toward \\(r_j = 0\\) without removal — their vote weight becomes negligible.*

**Connection to Prop 6**: Prop 6 (Byzantine Tolerance Bound) requires \\(f < n/3\\) under uniform trust weights. Def 44 relaxes this: once \\(f_{\mathrm{eff}}(T) < 1/3\\), the weighted scheme satisfies the tolerance bound even if the physical count \\(\vert \mathcal{B} \vert \geq n/3\\) — provided the reputation system has accumulated sufficient rounds. The minimum round count is \\(T_{\mathrm{excl}} \approx \ln(3f_0 / (1 - 3f_0)) / \alpha_r\\) (the time for \\(f_{\mathrm{eff}}\\) to fall below \\(1/3\\) when \\(f_0 < 1/3\\)).

<span id="def-45"></span>
**Definition 45** (Logical Quorum for High-Stakes Decisions). *For capability level L3 and above transitions (Collaborative Planning, Full Integration) or commanded terminal safety state triggers (Def 36), a logical quorum \\(Q \subseteq V\\) must satisfy all five conditions simultaneously:*

1. **Size**: \\(\vert Q \vert \geq \lceil 2n/3 \rceil + 1\\)
2. **Reputation**: \\(\sum_{i \in Q} r_i(t) \geq \theta_Q \cdot \sum_{i \in V} r_i(t)\\)
3. **Corroboration currency**: every \\(i \in Q\\) has passed peer validation (\\(\kappa(c_i, \cdot) \geq k_{\mathrm{accept}}\\)) within the last \\(T_{\mathrm{stale}}\\) seconds (Prop 40)
4. **Causal consistency**: \\(\max_{i \in Q} h_i - \min_{i \in Q} h_i \leq \tau_Q\\) where \\(h_i\\) is the HLC vote timestamp (Def 40) — all quorum votes lie in the same causal window
5. **Spatial diversity**: no single communication cluster contributes more than \\(\lfloor \vert Q \vert / 2 \rfloor\\) votes — the quorum spans at least two physically separated clusters

*Decision \\(D\\) is logically validated if a valid logical quorum \\(Q\\) exists and:*

{% katex(block=true) %}
\left|\left\{i \in Q : \mathrm{vote}_i(D) = \mathrm{YES}\right\}\right| \geq \left\lceil \frac{2\,|Q|}{3} \right\rceil
{% end %}

**RAVEN "Change Mission" parameters** (\\(n = 47\\), \\(f \leq 15\\)):
- Size: \\(\vert Q \vert \geq \lceil 94/3 \rceil + 1 = 33\\)
- Reputation threshold: \\(\theta_Q = 0.75\\)
- Causal window: \\(\tau_Q = 11.2\\)s (Contested \\(T_{\mathrm{stale}}\\) from Prop 40)

**HSS trigger asymmetry** (Def 36, Prop 37): Autonomous local HSS trigger (battery below \\(E_{\mathrm{HSS}}\\) and threat conditions met) requires no quorum — it is a unilateral safety action that must remain available in the Denied regime (C=0) where quorum is unreachable. Remotely commanded HSS requires a logical quorum plus pre-enrolled cryptographic command authority. In the Denied regime, commanded HSS must fall back to pre-authorized standing orders in L0 firmware, established at deployment enrollment; real-time quorum formation is impossible when partition is complete.

<span id="prop-44"></span>
**Proposition 44** (Logical Quorum BFT Resistance). *Under Def 7 with at most \\(f < n/3\\) Byzantine nodes — including nodes with valid Secure Boot attestation:*

1. *Safety: no two contradictory decisions \\(D\\) and \\(\lnot D\\) can both be logically validated — any two valid logical quorums intersect in at least one honest node.*
2. *Liveness: if \\(n - f\\) honest nodes are connected and currently corroborated, a valid logical quorum exists.*
3. *Reputation convergence: after \\(T_{\mathrm{excl}} \approx \ln(3f_0 / (1 - 3f_0)) / \alpha_r\\) rounds, Byzantine nodes' combined weight falls below \\(\theta_Q \cdot \sum r_i\\), excluding them from condition 2.*
4. *Anti-Sybil via spatial diversity: condition 5 prevents a single compromised cluster from unilaterally forming a quorum even if every node in that cluster holds valid attestation.*

*Proof sketch*: **Property 1** — By condition 1, \\(\vert Q_1 \vert + \vert Q_2 \vert \geq 2(\lceil 2n/3 \rceil + 1) > 4n/3\\). By inclusion-exclusion, \\(\vert Q_1 \cap Q_2 \vert \geq \vert Q_1 \vert + \vert Q_2 \vert - n > n/3 > f\\). At least one node in \\(Q_1 \cap Q_2\\) is honest; an honest node votes consistently, so \\(Q_1\\) and \\(Q_2\\) cannot simultaneously validate \\(D\\) and \\(\lnot D\\). **Property 2** — With \\(n - f > 2n/3\\) honest corroborated nodes, condition 1 is satisfiable; conditions 2–4 are satisfiable because honest nodes maintain high and growing reputation, and the fleet topology (Prop 4) ensures multi-cluster connectivity. **Property 3** — Byzantine nodes accumulate EWMA weight 0 each round; \\(f_{\mathrm{eff}}(T) \to 0\\) geometrically at rate \\((1-\alpha_r)\\). **Property 4** — Any single cluster \\(C\\) with \\(\vert C \vert < 2n/3\\) cannot satisfy condition 1 alone; condition 5 forces a second cluster to contribute, and that cluster contains honest nodes whose votes are not controlled by the compromised cluster. \\(\square\\)

### Causal Commit Ordering: NTP-Free Split-Brain Resolution

The CONVOY mitigation above surfaces a deeper structural flaw: wall-clock time defines an ordering that is neither causal nor semantic. It correlates with "which node last touched this value," not "which value is operationally correct." A vehicle whose clock is 3 seconds fast wins every concurrent route decision — regardless of information quality — and this bias is exploitable under active GPS jamming. The fix replaces the \\(t_1 > t_2\\) comparison with a three-level lexicographic ordering that needs no synchronized clocks.

<span id="def-29"></span>
**Definition 29** (Semantic Commit Order). *For two concurrent update records \\(u_1 = (v_1, V_1, p_1, \mathrm{id}_1)\\) and \\(u_2 = (v_2, V_2, p_2, \mathrm{id}_2)\\) — where \\(V_i\\) is the vector clock (Definition 13), \\(p_i \in \mathbb{Z}^+\\) is the application-assigned semantic priority, and \\(\mathrm{id}_i = (\mathrm{tier}_i, \mathrm{nid}_i)\\) is the authority-tier identity (Definition 14, with \\(\mathrm{nid}\\) fixed at manufacturing) — the Semantic Commit Order \\(\prec\\) is determined by applying the following rule in sequence until a winner is found:*

1. *Causal dominance (no wall clock): if \\(V_1 < V_2\\), then \\(u_2 \succ u_1\\); if \\(V_2 < V_1\\), then \\(u_1 \succ u_2\\). If incomparable (concurrent), proceed to step 2.*
2. *Semantic priority: the higher-\\(p_i\\) record wins when \\(p_1 \neq p_2\\). If equal, proceed to step 3.*
3. *Authority tie-breaker: lower tier number wins (L0 authority outranks L1; Definition 14). Among equal tiers, higher \\(\mathrm{nid}\\) wins (globally unique; assigned at manufacture).*

*The order is total: because \\(\mathrm{nid}\\) values are globally unique, step 3 never produces a tie.*

**Semantic priority assignment for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}**:

| Update type | Priority \\(p\\) | Rationale |
| :--- | :--- | :--- |
| Threat sighting (confirmed) | 100 | Overrides all other route data |
| Route closure (kinetic) | 90 | Safety-critical path change |
| Checkpoint status | 50 | Operational but non-urgent |
| Fuel and logistics estimate | 20 | Informational; tolerates staleness |
| Maintenance and comfort report | 5 | Yields to all operational data |

<span id="prop-30"></span>
**Proposition 30** (NTP-Free Split-Brain Resolution). *The Semantic Commit Order (Definition 29) satisfies all four properties required for correct split-brain resolution:*

1. *Totality: for any two distinct records \\(u_1 \neq u_2\\), exactly one of \\(u_1 \succ u_2\\) or \\(u_2 \succ u_1\\) holds.*
2. *Causal consistency: if \\(u_1 \to u_2\\) (\\(u_1\\) causally precedes \\(u_2\\)), then \\(u_2 \succ u_1\\).*
3. *Clock independence: steps 2 and 3 compare fields \\((p_i, \mathrm{id}_i)\\) fixed at write and manufacture time; no wall-clock timestamp appears.*
4. *Determinism: every node computes the same winner from the same two records, regardless of arrival order or local clock.*

*Proof*: (1) Step 3 compares globally unique \\(\mathrm{nid}\\) values — ties are impossible. (2) \\(u_1 \to u_2\\) iff \\(V_1 < V_2\\) by Proposition 14; step 1 resolves this before reaching steps 2–3. (3) \\(p_i\\) and \\(\mathrm{id}_i\\) are integer constants assigned at write and manufacture time; no clock participates. (4) The rule is a deterministic function of \\((V_1, p_1, \mathrm{id}_1, V_2, p_2, \mathrm{id}_2)\\). \\(\square\\)

**Connection to LWW**: When \\(p_1 = p_2\\) and updates are concurrent, the authority-tier tie-breaker acts as a deterministic LWW with a "clock" that cannot drift — the \\(\mathrm{nid}\\) is fixed at boot and invariant under GPS jamming, NTP failure, and deliberate clock manipulation. This is strictly stronger than wall-clock LWW: consistent under arbitrary clock skew and adversarial time sources.

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

**RGA tombstone accumulation**: Every deletion in RGA creates a tombstone — the deleted character record is marked but retained, not hard-removed, because any peer that has not yet received the deletion message would re-insert the character on merge. In a 256KB microcontroller running 30-plus minutes of offline {% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} edits, unacknowledged tombstones accumulate without bound.

<span id="def-30"></span>
**Definition 30** (RGA Tombstone Pruning Strategy). *An RGA causal sequence is a set of records \\(\mathcal{S}\\), each of the form \\((c, \mathrm{id}, \mathrm{parent}, d, K)\\), where \\(c\\) is the character value (\\(\perp\\) for a tombstone), \\(\mathrm{id} = (\mathrm{site}, \mathrm{seq})\\) is a globally unique causal identifier, \\(\mathrm{parent}\\) is the causal predecessor's \\(\mathrm{id}\\), \\(d \in \\{0,1\\}\\) is the tombstone flag, and \\(K \subseteq V\\) is the set of nodes that have acknowledged this record.*

*The acknowledgement vector \\(A_i[j]\\) at node \\(i\\) stores the highest sequence number from site \\(j\\) that node \\(i\\) has received. A tombstone \\(r\\) satisfies the **global acknowledgement condition** — and is safe to remove — when:*

{% katex(block=true) %}
\text{safe}(r) \;\iff\; d_r = 1 \;\wedge\; \min_{j \in V}\, A_j[\text{site}(r)] \geq \text{seq}(r)
{% end %}

*The pruning operation removes all \\(\text{safe}(r)\\) records from \\(\mathcal{S}\\) and re-points parent references in surviving records to the nearest non-pruned ancestor, preserving the causal chain for all live characters. Pruning is triggered when RGA memory consumption exceeds \\(B_{\mathrm{RGA}}/2\\) — the half-budget threshold from the memory budget enforcement above.*

<span id="prop-31"></span>
**Proposition 31** (Tombstone Pruning Safety Bound). *In an \\(n\\)-node fleet with gossip rate \\(\lambda\\), mesh diameter \\(D\\), and per-message loss probability \\(p_{\mathrm{loss}}\\), the expected time until a tombstone satisfies the global acknowledgement condition is bounded by the convergence time from Proposition 26. At steady state, the unpruned tombstone count and memory footprint satisfy:*

{% katex(block=true) %}
N_{\text{tombstone}} \leq r_{\text{del}} \cdot \frac{2D\ln n}{\lambda\,(1 - p_{\text{loss}})}, \qquad
M_{\text{tombstone}} = B_r \cdot N_{\text{tombstone}}
{% end %}

*where \\(r_{\mathrm{del}}\\) is the fleet-wide deletion rate (deletions per second) and \\(B_r\\) is the per-record byte cost (site + seq + parent pointer + flags). Proof: by Proposition 26, acknowledgement propagates to all nodes within \\(T_{\mathrm{conv}} = 2D\ln n / (\lambda(1-p_{\mathrm{loss}}))\\) seconds with probability \\(\geq 1 - 1/n\\). Tombstones younger than \\(T_{\mathrm{conv}}\\) are unprunable; older ones satisfy the safe condition. The steady-state count follows from Little's Law (\\(N = r \cdot T\\)). \\(\square\\)*

**{% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} calibration** (\\(n = 12\\), \\(D = 3\\), \\(p_{\mathrm{loss}} = 0.1\\), \\(\lambda = 1\\,\text{Hz}\\), \\(r_{\mathrm{del}} = 2\\,\text{s}^{-1}\\), \\(B_r = 24\\,\text{bytes}\\)):

{% katex(block=true) %}
N_{\text{tombstone}} \leq 2 \times \frac{2 \cdot 3 \cdot \ln 12}{1.0 \cdot 0.9} \approx 17\;\text{records}
\quad\Longrightarrow\quad 17 \times 24 = 408\;\text{bytes}
{% end %}

Negligible under normal operation. The risk materialises during extended partitions: a 30-minute offline period at \\(r_{\mathrm{del}} = 2\\,\text{s}^{-1}\\) accumulates \\(2 \times 1800 = 3600\\) tombstones, approximately 86KB — crossing the \\(B_{\mathrm{RGA}}/2\\) pruning threshold and triggering the archival step (step 4 of the memory budget enforcement above).

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

### Delta-Sync Protocol: Bounded Partial Synchronization

The priority ordering above specifies *what* to sync first but not *how* to bound the sync to a short connectivity window. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicles that reconnect for 5-second windows before returning to dead zones, a protocol that assumes unlimited connectivity will stall mid-sync when the window closes, leaving partial state applied. The Delta-Sync Protocol formalizes the sync as a sequence of atomic, self-contained steps that are safe to interrupt at any point.

<span id="def-31"></span>
**Definition 31** (Delta-Sync Protocol). *Given reconnected nodes \\(i\\) and \\(j\\) with connectivity window \\(T_W\\) seconds and bandwidth \\(B\\) bits per second, the Delta-Sync Protocol operates in three phases:*

**Phase 1 — Fingerprint exchange** (fixed overhead \\(C_F\\) bytes regardless of state size): Node \\(i\\) transmits a compact fingerprint \\(\Psi_i = (\vec{V}_i, \vec{h}_i)\\), where \\(\vec{V}_i\\) is \\(i\\)'s current vector clock and \\(\vec{h}_i\\) is the vector of Merkle hash roots for each priority tier. Node \\(j\\) reciprocates. Total fingerprint cost: \\(2C_F\\) bytes, completing in \\(2C_F / B\\) seconds.

**Phase 2 — Priority-ordered delta generation**: For each priority tier \\(k \in \\{1,2,3,4\\}\\), node \\(i\\) computes the tier-\\(k\\) delta:

{% katex(block=true) %}
\Delta_k = \bigl\{\, s \in \mathcal{S}_k \;\big|\; V_i[\text{site}(s)] > V_j[\text{site}(s)] \bigr\}
{% end %}

Items are serialized in tier order — all \\(\Delta_1\\) items first, then \\(\Delta_2\\), then \\(\Delta_3\\), then \\(\Delta_4\\). Each item is self-contained, carrying its own causal identifier (\\(\mathrm{id} = (\mathrm{site}, \mathrm{seq})\\) from Definition 30) and its full CRDT value.

**Phase 3 — Windowed transmission**: Items from the serialized delta are transmitted in priority order. Transmission halts cleanly at the end of the connectivity window. Because each item is self-contained, a partial sync leaves the recipient in a consistent state — no item is ever half-applied.

<span id="prop-32"></span>
**Proposition 32** (Delta-Sync Coverage Bound). *Given window \\(T_W\\), bandwidth \\(B\\), fingerprint overhead \\(C_F\\), and per-item byte cost \\(b_k\\) at tier \\(k\\), the number of tier-1 items transmitted in a single window is:*

{% katex(block=true) %}
n_1^{\max} = \left\lfloor \frac{B \cdot T_W - 2\,C_F}{b_1} \right\rfloor
{% end %}

*Priority-2 items begin only after all priority-1 items are transmitted, and so on. The minimum window for full-tier coverage is:*

{% katex(block=true) %}
T_W^* = \frac{2\,C_F + \sum_{k=1}^{4} S_k}{B}
{% end %}

*where \\(S_k\\) is the byte size of \\(\Delta_k\\). Proof: Phase 1 consumes \\(2C_F\\) bytes. The remaining \\(B \cdot T_W - 2C_F\\) bytes are allocated to delta items in priority order. \\(n_1^{\max}\\) follows from integer division. \\(T_W^\*\\) is the window at which all tiers fit. \\(\square\\)*

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calibration** (\\(T_W = 5\\,\text{s}\\), \\(B = 250\\,\text{kbps}\\), \\(C_F = 64\\,\text{bytes}\\)):

Available for state sync: \\(31250 \times 5 - 2 \times 64 = 156{,}122\\,\text{bytes} \approx 152\\,\text{KB}\\).

| Tier | Content | Size | Synced in 5 s? |
| :--- | :--- | :--- | :--- |
| 1 — Safety-critical | Threat locations, node liveness | 2 KB | Yes — first 0.06 s |
| 2 — Mission-critical | Objective status, positions | 12 KB | Yes — first 0.4 s |
| 3 — Operational | Sensor readings, health metrics | 40 KB | Yes — first 1.7 s |
| 4 — Audit and logging | Decision logs, timestamps | 80 KB | Yes — first 4.3 s |

At 250 kbps, CONVOY achieves full-state sync in 4.3 seconds — inside the 5-second window. Under partial jamming at 50 kbps: \\(6{,}250 \times 5 \approx 30\\,\text{KB}\\) available, covering tiers 1 and 2 with 16 KB to spare. Safety-critical and mission-critical state converges even under heavy jamming; audit logs queue for the next window.

**Why self-contained items matter**: If the window closes mid-transmission, untransmitted items remain in \\(\Delta_{i \to j}\\) for the next window. Transmitted items are applied atomically on receipt. The receiver's state is always the union of fully-applied CRDT records — never a partial merge — because each delta item is a complete causal record, not a raw byte fragment.

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
