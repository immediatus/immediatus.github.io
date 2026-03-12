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

The three preceding parts addressed capabilities that live within a single node or a cluster that can communicate internally. [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) established what the system faces: {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}s where partition is the default, and {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier L0-L4 from heartbeat-only survival to full fleet integration; each level requires minimum connectivity and consumes proportionally more energy") %}capability levels{% end %} that define what must be preserved. [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md) established how the system knows its own state: local anomaly detection, {% term(url="@/blog/2026-01-22/index.md#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %}-based health propagation with bounded staleness, and {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %}-tolerant aggregation. [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) established what the system does about failures: the {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} autonomic loop, confidence-gated healing actions, recovery ordering by dependency, and cascade prevention.

Each of those capabilities assumed a cluster's internal state was knowable. The remaining problem is what happens *between* clusters.

When {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}'s vehicles split at a mountain pass, each group continues operating independently. Each heals its own members, updates its own state, makes its own authority-delegated decisions — all drawing on the contested-connectivity baseline, self-measurement, and self-healing frameworks. When the groups reunite, their states have diverged. Neither group made an error. But they are inconsistent, and some of their decisions may conflict.

Fleet coherence is the problem of managing this divergence: bounding how far state can drift during partition, and resolving conflicts efficiently at reconnection. The CAP theorem (Brewer, 2000) makes the trade-off explicit: no distributed system can simultaneously guarantee consistency, availability, and partition tolerance. The contested-connectivity, self-measurement, and self-healing articles committed this series to *availability* — systems keep operating during partition. This article addresses what that commitment costs and how to pay it: the reconciliation protocols, {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} semantics, and authority structures that make eventual consistency tractable in physical edge deployments.

---

## Overview

Fleet coherence maintains consistent state when the network prevents communication. Each concept integrates theory with design consequence:

| Concept | Formal Contribution | Design Consequence |
| :--- | :--- | :--- |
| **State Divergence** | {% katex() %}\mathbb{E}[D(\tau)] = 1 - e^{-\lambda\tau}{% end %} | Size reconciliation buffers from event rate |
| **CRDTs** | Merge \\(\sqcup\\) forms join-semilattice | Choose CRDT type matching state semantics |
| **Authority Tiers** | {% katex() %}\mathcal{Q}^* = \arg\max [V_{\text{mission}} - C_{\text{reconcile}}]{% end %} | Delegate bounded authority during partition |
| **Merkle Reconciliation** | \\(O(k \log(n/k) + k)\\) messages for \\(k\\) divergent items | Efficient sync for large state with sparse changes |
| **Entity Resolution** | Confidence update {% katex() %}c' = f(c_1, c_2, \text{agreement}){% end %} | Merge multi-observer data probabilistically |

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

**Problem**: Local autonomy is required during partition — but it causes state divergence. Each cluster makes correct decisions given its own information. When they reconnect, their states are inconsistent, and some decisions may conflict. Neither cluster made an error; the inconsistency is a structural consequence of operating without communication.

**Solution**: Bound divergence with a formal model (Proposition 12), choose data structures with merge-safe semantics (CRDTs), and resolve conflicts using authority tiers that determine who wins when clusters disagree.

**Trade-off**: More predetermined coordination rules enable more coherence but reduce adaptability. A fully pre-specified decision policy achieves perfect coherence but cannot adapt to novel situations. The right balance gives critical decisions deterministic resolution while leaving operational decisions flexible.

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

> **Physical translation**: \\(|\Sigma_A \triangle \Sigma_B|\\) counts the key-value pairs that differ between the two states — entries present in one but not the other, or present in both but with different values. Dividing by the total combined key space normalizes to \\([0,1]\\). At \\(D = 0\\) the replicas are byte-for-byte identical; at \\(D = 1\\) they share no information at all. In practice, \\(D\\) between 0.05 and 0.15 after a short partition is common for tactical edge systems.

- **Use**: Gives the normalized fraction of state entries differing between two replicas (0 = identical, 1 = fully diverged); monitor {% katex() %}D{% end %} per object class during partition and alarm when {% katex() %}D > D_{\max}{% end %} to catch coherence decay before it surfaces as conflicting commands in the field.
- **Parameters**: {% katex() %}D_{\max} \approx 0.1{% end %} for safety-critical objects; {% katex() %}\approx 0.3{% end %} for operational data stores; measure per object type.
- **Field note**: One fleet-wide {% katex() %}D{% end %} number hides safety-critical divergence — always measure {% katex() %}D{% end %} separately per object class.

*where \\(D \in [0, 1]\\), with \\(D = 0\\) indicating identical states and \\(D = 1\\) indicating completely disjoint states.*

In other words, divergence is the fraction of the combined key space on which the two states disagree; zero means byte-for-byte identical, one means no key-value pair is shared.

During partition, state diverges through multiple mechanisms:

**Environmental inputs differ**. Each cluster observes different events. Cluster A sees threat T1 approach from the west. Cluster B, on the other side of the partition, sees nothing. Their threat models diverge.

**Decisions made independently**. [Self-healing](@/blog/2026-01-29/index.md) requires local decisions. Cluster A decides to redistribute workload after node failure. Cluster B, unaware of the failure, continues assuming the failed node is operational. Their understanding of fleet configuration diverges.

**Time drift**. Without network time synchronization, clocks diverge. After 6 hours of partition at 100ppm drift, clocks differ by 2 seconds. Timestamps become unreliable for ordering events.

**Message loss**. Before partition fully established, some {% term(url="@/blog/2026-01-22/index.md#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} messages reach some nodes. The partial propagation creates uneven knowledge. Node A heard about event E before partition. Node B did not. Their histories diverge.

<span id="def-11b"></span>
**Definition 11b** (Burst Process). *State-changing events follow an alternating renewal process with two phases:*

- **Burst phase**: Duration {% katex() %}\tau_{\text{burst}}{% end %}, event rate {% katex() %}\lambda_{\text{burst}} = F \cdot \lambda_{\text{mean}}{% end %}
- **Quiet phase**: Duration {% katex() %}T_{\text{quiet}}{% end %}, event rate {% katex() %}\lambda_{\text{quiet}} \approx 0.1 \cdot \lambda_{\text{mean}}{% end %}

*Typical parameters for tactical edge:*

| System | {% katex() %}\tau_{\text{burst}}{% end %} | {% katex() %}T_{\text{quiet}}{% end %} | \\(F\\) |
| :--- | :--- | :--- | :--- |
| RAVEN | 5 s | 300 s | 8 |
| CONVOY | 10 s | 600 s | 12 |

*Fano factor {% katex() %}F = \mathrm{Var}[N(t)] / \mathbb{E}[N(t)]{% end %} measured from operational logs.*

<span id="prop-12"></span>
**Proposition 12** (Divergence Growth Rate). *If state-changing events arrive according to a Poisson process with rate \\(\lambda\\), the expected divergence after partition duration \\(\tau\\) is:*

{% katex(block=true) %}
E[D(\tau)] = 1 - e^{-\lambda \tau}
{% end %}

> **Physical translation**: {% katex() %}e^{-\lambda\tau}{% end %} is the probability that a given key has received zero updates during the partition window — i.e., the probability it is still synchronized. The complement {% katex() %}1 - e^{-\lambda\tau}{% end %} is the probability it has diverged. At \\(\tau = 0\\): zero divergence. As {% katex() %}\tau \to \infty{% end %}: divergence approaches 1.0. The \\(1/\lambda\\) time constant marks when expected divergence crosses 63%: a system with \\(\lambda = 0.01\\) updates/s reaches 63% divergence after 100 seconds of partition.

- **Use**: Predicts expected divergence after {% katex() %}\tau{% end %} seconds of partition at update rate {% katex() %}\lambda{% end %}; use this to estimate worst-case {% katex() %}D{% end %} at partition end for sizing the reconciliation buffer in Corollary 5b, preventing buffer undersizing from underestimating how fast state diverges.
- **Parameters**: {% katex() %}\lambda{% end %} = update events per second (0.01–1 Hz for edge fleets); {% katex() %}\tau{% end %} = expected partition duration in hours.
- **Field note**: Use {% katex() %}\lambda{% end %} at the 95th percentile of your update rate — burst writes dominate reconciliation cost, not the mean.

*Proof sketch*: Model state as a binary indicator per key: identical (0) or divergent (1). Under independent Poisson arrivals with rate \\(\lambda\\), the probability a given key remains synchronized is {% katex() %}e^{-\lambda \tau}{% end %}. The expected fraction of divergent keys follows the complementary probability. For sparse state changes, {% katex() %}E[D(\tau)] \approx 1 - e^{-\lambda \tau}{% end %} provides a tight upper bound.

**Why Poisson fails for tactical edge**: Operational update streams alternate between burst and quiet phases (Definition 11b). The Fano factor {% katex() %}F = \mathrm{Var}[\text{updates}] / \mathbb{E}[\text{updates}]{% end %} for tactical edge systems is 3–15 (measured on {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} exercises), not \\(F = 1.0\\) as Poisson assumes. Burst events cluster temporally — contact events, terrain transitions, and threat detections arrive in correlated waves, followed by extended quiet periods. A uniform Poisson rate collapses this structure: it underestimates divergence at burst onset and overestimates it during quiet, making it unreliable for buffer sizing in either regime.

<span id="prop-12b"></span>
**Proposition 12b** (Burst-Averaged Divergence). *For an alternating burst/quiet process (Definition 11b), expected divergence after partition duration \\(\tau\\) is:*

{% katex(block=true) %}
E[D(\tau)] = p_{\text{burst}} \cdot E[D_{\text{burst}}(\tau)] + p_{\text{quiet}} \cdot E[D_{\text{quiet}}(\tau)]
{% end %}

*where:*
- {% katex() %}p_{\text{burst}} = \tau_{\text{burst}} / (\tau_{\text{burst}} + T_{\text{quiet}}){% end %} — fraction of time in burst phase
- {% katex() %}E[D_{\text{burst}}(\tau)] = 1 - e^{-F \cdot \lambda \cdot \min(\tau,\, \tau_{\text{burst}})}{% end %} — divergence during burst
- {% katex() %}E[D_{\text{quiet}}(\tau)] = 1 - e^{-0.1 \cdot \lambda \cdot \max(0,\, \tau - \tau_{\text{burst}})}{% end %} — divergence during quiet phase

*For worst-case buffer sizing, condition on partition onset coinciding with burst start:*

{% katex(block=true) %}
D_{\text{worst}}(\tau) = 1 - e^{-F \cdot \lambda \cdot \min(\tau,\, \tau_{\text{burst}}) \;-\; 0.1 \cdot \lambda \cdot \max(0,\, \tau - \tau_{\text{burst}})}
{% end %}

*For {% katex() %}\tau \gg \tau_{\text{burst}}{% end %}, the burst exponent saturates and the quiet term dominates growth:*

{% katex(block=true) %}
D_{\text{worst}}(\tau) \approx 1 - e^{-F \cdot \lambda \cdot \tau_{\text{burst}}} \cdot e^{-0.1 \cdot \lambda \cdot (\tau - \tau_{\text{burst}})}
{% end %}

*Proof sketch*: Model each key as a binary indicator (synchronized / diverged). During the burst epoch of duration {% katex() %}\min(\tau, \tau_{\text{burst}}){% end %}, events arrive at rate \\(F \cdot \lambda\\); the probability a given key survives synchronized is {% katex() %}e^{-F \cdot \lambda \cdot \min(\tau, \tau_{\text{burst}})}{% end %}. During the subsequent quiet epoch, the surviving fraction faces event rate \\(0.1 \cdot \lambda\\); the joint survival probability is the product of the two exponentials. The worst-case analysis conditions on partition onset at burst start, removing the mixture weight {% katex() %}p_{\text{burst}}{% end %} and instead accumulating burst divergence first — this is the relevant bound for buffer sizing since it maximises the fraction of keys diverged per unit partition time. For {% katex() %}\tau \leq \tau_{\text{burst}}{% end %}, the formula reduces to the Poisson model at elevated rate \\(F \cdot \lambda\\), recovering the original Proposition 12 result.*

In other words, divergence grows quickly at first and then saturates: a long partition does not drive divergence much higher than a medium one, because most keys diverge within the first few event intervals.

**Corollary 5**. *Reconciliation cost is linear in divergence: {% katex() %}\text{Cost}(\tau) = c \cdot D(\tau) \cdot |S_A \cup S_B|{% end %} where \\(c\\) is per-item sync cost.*

In other words, the total work at reconnection scales with how many key-value pairs diverged multiplied by the constant cost to transfer and merge one item; sizing the reconciliation budget requires estimating both the divergence fraction and the total state size.

<span id="cor-5b"></span>
**Corollary 5b** (Reconciliation Buffer Sizing). *Buffer size should accommodate worst-case divergence over the maximum expected partition duration {% katex() %}\tau_{\text{max}}{% end %}:*

{% katex(block=true) %}
\text{Buffer}_{\min} = |S| \cdot D_{\text{worst}}(\tau_{\text{max}}) \cdot b_{\text{item}}
{% end %}

- **Use**: Computes minimum on-device buffer in bytes to absorb worst-case post-partition divergence; apply during hardware BOM to size reconciliation memory and prevent buffer overflow at reconnect that permanently drops state deltas.
- **Parameters**: {% katex() %}|S|{% end %} = object count; {% katex() %}D_{\text{worst}}{% end %} from burst-corrected Proposition 12; {% katex() %}b_{\text{item}} = 64\text{--}256{% end %} bytes per object.
- **Field note**: Add a \\(2\\times\\) safety factor on top of the formula result — production networks always have higher burst rates than spec assumes.

*where \\(|S|\\) is total state items and {% katex() %}b_{\text{item}}{% end %} is bytes per item. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (\\(|S| = 500\\), \\(\lambda = 2\\) events/s, \\(F = 8\\), {% katex() %}\tau_{\text{burst}} = 5\text{s}{% end %}, {% katex() %}\tau_{\text{max}} = 1800\text{s}{% end %}):*

{% katex(block=true) %}
D_{\text{worst}}(1800) = 1 - e^{-F \cdot \lambda \cdot \tau_{\text{burst}} - 0.1 \cdot \lambda \cdot (\tau_{\text{max}} - \tau_{\text{burst}})} = 1 - e^{-80 - 359} \approx 1.0
{% end %}

*Both exponents are large — the burst phase alone ({% katex() %}F \cdot \lambda \cdot \tau_{\text{burst}} = 80{% end %}) saturates divergence near 1.0 within seconds. Buffer {% katex() %}\approx 500 \times 32{% end %} bytes \\(\approx 16\\) KB (size for full state copy). For short partitions ({% katex() %}\tau < \tau_{\text{burst}}{% end %}), the formula reduces to Poisson at elevated rate:*

{% katex(block=true) %}
\text{Buffer}_{\text{short}} \approx |S| \cdot \bigl(1 - e^{-F \cdot \lambda \cdot \tau_{\text{max}}}\bigr) \cdot b_{\text{item}}
{% end %}

**Practical implications**:

1. **Short partitions ({% katex() %}\tau < \tau_{\text{burst}}{% end %})**: Burst assumption is correct; size buffers using {% katex() %}D_{\text{worst}} = 1 - e^{-F \cdot \lambda \cdot \tau}{% end %}.
2. **Long partitions ({% katex() %}\tau > \tau_{\text{burst}} + T_{\text{quiet}}{% end %})**: Divergence saturates near 100%; buffer a full state copy.
3. **Medium partitions ({% katex() %}\tau_{\text{burst}} < \tau < T_{\text{quiet}}{% end %})**: Use the full {% katex() %}D_{\text{worst}}(\tau){% end %} formula from Proposition 12b.

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} ({% katex() %}\tau_{\text{burst}} = 5\text{s}{% end %}), the large \\(F \cdot \lambda = 16\\) means divergence saturates within seconds of any burst, so buffer sizing defaults to full state copy for all but the briefest partitions. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} ({% katex() %}\tau_{\text{burst}} = 10\text{s}{% end %}, {% katex() %}T_{\text{quiet}} = 600\text{s}{% end %}, \\(F = 12\\)), medium partitions (10–600 s) are common during terrain-induced shadows and require the full two-phase formula to avoid over-allocating buffer for the extended quiet period.

> **Cognitive Map**: State divergence is not a failure — it is the mathematically inevitable consequence of operating without communication. Proposition 12 quantifies it: divergence grows as {% katex() %}1 - e^{-\lambda\tau}{% end %}, saturating as most keys diverge within the first burst epoch. The burst-aware extension (Proposition 12b) is essential for sizing reconciliation buffers — Poisson underestimates divergence at burst onset and overestimates it during the quiet phase. The key design output from this section is the minimum reconciliation buffer: {% katex() %}|S| \cdot D_{\text{worst}}(\tau_{\max}) \cdot b_{\text{item}}{% end %}. For RAVEN, burst saturation means buffering a full state copy regardless of partition duration. Next: choosing data structures with provably safe merge semantics eliminates the "who wins" conflict at reconciliation time.

---

## Conflict-Free Data Structures

**Problem**: When two clusters reconnect after partition, their states have diverged. A naive merge — last-writer-wins by wall-clock timestamp — is incorrect under clock drift. Arbitrary merge logic can produce inconsistent state that violates application invariants.

**Solution**: Choose data structures (CRDTs) whose merge function is provably commutative, associative, and idempotent. These three properties guarantee that any two replicas receiving the same set of updates converge to the same final state, regardless of merge order or network delay.

**Trade-off**: The right CRDT type depends on the state semantics. LWW-Register is simplest but strategically manipulable (favor faster clocks). Intersection is safest for authorization but produces false negatives. The merge function embeds a fairness decision — making it explicit prevents silent design errors.

### CRDTs at the Edge

<span id="def-12"></span>
**Definition 12** (Conflict-Free Replicated Data Type). *A state-based {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} is a tuple \\((S, s^0, q, u, m)\\) where \\(S\\) is the state space, \\(s^0\\) is the initial state, \\(q\\) is the query function, \\(u\\) is the update function, and \\(m: S \times S \rightarrow S\\) is a merge function satisfying:*
- *Commutativity: \\(m(s_1, s_2) = m(s_2, s_1)\\)*
- *Associativity: {% katex() %}m(m(s_1, s_2), s_3) = m(s_1, m(s_2, s_3)){% end %}*
- *Idempotency: \\(m(s, s) = s\\)*

*These properties make \\((S, m)\\) a join-semilattice, guaranteeing convergence regardless of merge order.*

<span id="def-12b"></span>
**Definition 12b** (Reputation-Weighted Merge). *For a fleet of \\(n\\) nodes with reputation weights \\(w_i \in [0,1]\\) ({% katex() %}\sum_i w_i = 1{% end %}) and a global trust threshold {% katex() %}\Theta_{\text{trust}} \in (0, 1]{% end %}, define the reputation-weighted join {% katex() %}\sqcup_{\mathcal{W}}{% end %} as a two-stage operation:*

*Stage 1 — {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} admission filter:*

{% katex(block=true) %}
\text{Admitted}(\mathcal{U}) = \bigl\{ s_i \in \mathcal{U} \;\big|\; \exists\, Q \subseteq \mathcal{U} : \textstyle\sum_{k \in Q} w_k > \Theta_{\text{trust}} \text{ and } s_i \text{ is consistent with } Q \bigr\}
{% end %}

*Stage 2 — standard semilattice merge on admitted updates:*

{% katex(block=true) %}
s' = \bigsqcup_{\mathcal{W}}(\mathcal{U}) = \bigsqcup_{s_i \in \text{Admitted}(\mathcal{U})} s_i
{% end %}

*where \\(\sqcup\\) is the standard {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} join from Definition 12. Reputation weights are initialized to \\(w_i = 1/n\\) and updated from Phase 0 attestation results and historical accuracy. Default threshold: {% katex() %}\Theta_{\text{trust}} = 0.67{% end %}, matching the BFT quorum of Proposition 44.*

*Semilattice properties under {% katex() %}\sqcup_{\mathcal{W}}{% end %}: the underlying \\(\sqcup\\) in Stage 2 retains commutativity, associativity, and idempotency for any fixed admitted set. {% katex() %}\sqcup_{\mathcal{W}}{% end %} itself is a **quorum-admission gate** rather than a classical semilattice operator — it does not satisfy commutativity over all inputs by design, because {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} tolerance requires distinguishing honest from dishonest contributors. When the number of {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} nodes satisfies {% katex() %}f < n(1 - \Theta_{\text{trust}}){% end %}, the honest quorum dominates Stage 1 and Stage 2 convergence is guaranteed. A compromised node with attestation weight {% katex() %}w_i < \Theta_{\text{trust}} / n{% end %} cannot alone drive a state update — its contribution is discarded in Stage 1 regardless of the {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} value it presents.*

*Corollary (Poison Resistance): A "signed but compromised" node cannot poison swarm state unless it controls a coalition with collective weight {% katex() %}> \Theta_{\text{trust}}{% end %}. For {% katex() %}\Theta_{\text{trust}} = 0.67{% end %} and uniform weights, this requires \\(f > n/3\\) {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} nodes — exactly the BFT threshold.*

**Connection to semantic convergence (Definition 1b)**: Definition 12b guarantees {% katex() %}\gamma_{\text{data}} = 1{% end %} — every admitted update is data-consistent after Stage 2 join. It does not guarantee \\(\gamma = 1\\): merged state may still violate system policy even when no {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} node contributed (e.g., two clusters both committed the same exclusive resource independently). For the stability condition \\(\gamma \geq 1 - \varepsilon\\) and its effect on reconciliation cost, see Definition 1b.

*Note: \\(\\sqcup_W\\) is a **gated union operator**, not a classical semilattice. For any fixed admitted set (all quorum checks pass), it satisfies the commutativity, associativity, and idempotency of Definition 12. The admission gate is monotone: once a node's trust score exceeds {% katex() %}\Theta_{\text{trust}}{% end %}, it remains admitted absent explicit revocation — so the {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} convergence guarantee (Proposition 13) holds within the admitted partition.*

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

<sup>†</sup> Requires {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} timestamps (Definition 40, defined below in the Hybrid Logical Clocks section of this post) for correctness under clock drift — plain wall-clock LWW-Register does not satisfy semilattice idempotency in contested environments where clocks diverge.

**MV-Register vs. LWW-Register decision criterion**: The choice is primarily driven by write semantics, with cost analysis as confirmation.

- **LWW-Register** applies when writes are *superseding*: each new write represents the authoritative current state, so older concurrent values are irrelevant. Condition: {% katex() %}\beta_{\text{lose}} \leq \beta_{\text{preserve}}{% end %}.
- **MV-Register** applies when writes are *independent observations*: concurrent writes from separate partitions each contribute information that LWW would silently discard. Condition: {% katex() %}\beta_{\text{lose}} > \beta_{\text{preserve}}{% end %}.

The causal history \\(H(v)\\) of an MV-Register value \\(v\\) must remain bounded to prevent unbounded memory growth on constrained edge nodes:

{% katex(block=true) %}
|H(v)| \leq k_{\max}
{% end %}

where {% katex() %}k_{\max}{% end %} is the maximum number of concurrent write versions to retain. Values exceeding {% katex() %}k_{\max}{% end %} are resolved by applying LWW with {% katex() %}\prec_{\text{ext}}{% end %} ordering to the oldest conflicting pair, progressively reducing the conflict set.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} example**: Drone position updates are superseding writes — Drone 7's position at \\(t = 12\\) makes its position at \\(t = 9\\) irrelevant regardless of which cluster observed it. LWW-Register with {% katex() %}\prec_{\text{ext}}{% end %} ordering applies directly. Threat assessments from separate clusters are independent observations — Cluster A's classification of a contact as hostile and Cluster B's simultaneous classification as unknown must both reach human analysts; discarding either is a tactical intelligence loss. MV-Register applies, with {% katex() %}\beta_{\text{lose}} = \text{missed intelligence} \gg \beta_{\text{preserve}} \approx |H(v)| \cdot 64\ \text{bytes}{% end %}.

**G-Set example**: {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} surveillance coverage

Each drone maintains a local set of surveyed grid cells. When drones reconnect, the merged coverage is simply the union of all cells observed by either cluster — no coordination or conflict resolution is needed because adding a new cell never invalidates any other cell.

{% katex(block=true) %}
\text{Coverage}_{\text{merged}} = \text{Coverage}_A \cup \text{Coverage}_B
{% end %}

<span id="prop-13"></span>
**Proposition 13** ({% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} Convergence). *If all updates eventually propagate to all nodes (eventual delivery), and the merge function satisfies commutativity, associativity, and idempotency, then all replicas converge to the same state.*

In other words, as long as no update is permanently lost and the merge function obeys the three semilattice rules, two clusters that were partitioned for any finite duration will always reach identical state once they exchange updates.

*Proof sketch*: Eventual delivery ensures all nodes receive all updates. The semilattice properties ensure merge order doesn't matter.

> **Liveness, not safety**: Proposition 13 is a *liveness* property — Strong Eventual Consistency (SEC): replicas that receive the same update set will eventually agree on state. It is not a *safety* property and makes no claim about whether concurrent actions on that consistent state are conflict-free. Two nodes that both read `drone_C.battery_low = true` from a fully converged CRDT and both carry a Healer role will both dispatch to drone C's coordinate — the CRDT records both dispatches correctly, but convergence does not prevent the duplicate commitment or the physical conflict. **Safety — "at most one node commits to an exclusive resource per task" — is a separate property that requires a coordination layer operating *before* commitment, not after.** Under connectivity, Definition 45 (Logical Quorum) enforces hard mutual exclusion for high-stakes decisions. Under partition, hard mutual exclusion for exclusive resources is *impossible without communication* — a direct consequence of the CAP theorem's partition branch: no leaderless protocol can prevent two isolated nodes from both deciding to act on the same target without some form of coordination signal. The achievable bound under partition is probabilistic: Definition 56 (Conflict-Aware Claim Probability) lowers each node's unilateral action probability so that the expected number of redundant commits is bounded by Proposition 53. CRDTs handle *what happened* (state consistency); the arbitration layer governs *whether to act* (action coordination). Both are required for fleet coherence — convergence alone is not enough.

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

**Choosing the right {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}**: The choice depends on application semantics. The mapping from requirements to type is a function of four inputs — the permitted operations, the desired conflict resolution policy, the available memory budget, and the relative cost of discarding a concurrent write versus preserving it:

{% katex(block=true) %}
\text{CRDT\_Type} = f\!\left(\text{Operations},\; \text{Conflict\_Resolution},\; \text{Space\_Budget},\; \frac{\beta_{\text{lose}}}{\beta_{\text{preserve}}}\right)
{% end %}

- **G-Set**: Simplest, lowest overhead, but no removal
- **2P-Set**: Supports removal but element cannot be re-added
- **OR-Set**: Full add/remove semantics but higher overhead (unique tags per add)
- **LWW-Element-Set**: **Must use HLC timestamps (Definition 40), never wall-clock time.** Wall-clock LWW-Element-Set is incorrect at the edge — a fast-clock node's stale elements permanently overwrite slow-clock nodes' current elements. With HLC: concurrent additions resolve via Add-wins (OR-Set semantics); causal ordering via {% katex() %}\prec_{\text{ext}}{% end %} replaces the physical-time comparator.

### Bounded-Memory Tactical CRDT Variants

Standard {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s assume unbounded state growth - problematic for edge nodes with constrained memory. We introduce bounded-memory variants tailored for tactical operations.

**Sliding-Window G-Counter**:

The bounded counter {% katex() %}C_{\text{bounded}}(t){% end %} sums only the counts from active time windows, discarding history older than {% katex() %}T_{\text{window}}{% end %}; here \\(c_w\\) is the count accumulated during window \\(w\\), and \\(W(t)\\) is the set of windows that fall within the retention interval ending at time \\(t\\):

{% katex(block=true) %}
C_{\text{bounded}}(t) = \sum_{w \in W(t)} c_w
{% end %}

where {% katex() %}W(t) = \{w : t - T_{\text{window}} \leq w < t\}{% end %} is the active window set. Memory: {% katex() %}O(T_{\text{window}} / \Delta_w){% end %} instead of unbounded.

*{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} application*: Track observation counts per sector for the last hour. Older counts archived to fusion node when connectivity permits, then pruned locally.

**Bounded OR-Set with Eviction**:

The Add operation inserts element \\(e\\) into set \\(S\\) directly when capacity allows, and otherwise evicts the lowest-priority existing element {% katex() %}e_{\text{min}}{% end %} before inserting; {% katex() %}M_{\text{max}}{% end %} is the fixed capacity bound:

{% katex(block=true) %}
\text{Add}(e, S) = \begin{cases}
S \cup \{e\} & \text{if } |S| < M_{\text{max}} \\
(S \setminus \{e_{\text{min}}\}) \cup \{e\} & \text{otherwise}
\end{cases}
{% end %}

where {% katex() %}e_{\text{min}} = \arg\min_{e' \in S} \text{priority}(e'){% end %}. The eviction maintains {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} properties:

*Eviction commutativity proof sketch*: Define {% katex() %}\text{evict}(S) = S \setminus \{e_{\text{min}}\}{% end %}. For deterministic priority function, {% katex() %}\text{evict}(\text{merge}(S_A, S_B)) = \text{merge}(\text{evict}(S_A), \text{evict}(S_B)){% end %} when both exceed {% katex() %}M_{\text{max}}{% end %}.

**Prerequisite:** This maintains {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} properties only when the priority function is deterministic and identical across all nodes given the same inputs. If priority depends on observation time or local state, evictions at different nodes may produce non-deterministic merge outcomes. {% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} uses {% katex() %}\text{threat\_level} \times (1/\text{age}){% end %} as a stable priority; deployments with node-specific priority functions must use a tie-breaking rule (e.g., node ID) to preserve idempotency.

**Priority functions for tactical state**:
- Threat entities: Priority = threat level \\(\times\\) recency
- Coverage cells: Priority = strategic value \\(\times\\) observation freshness
- Health records: Priority = criticality \\(\times\\) staleness (inverse)

*{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} application*: Track at most 50 active threats. When capacity exceeded, evict lowest-priority (low-threat, stale) entities. Memory: fixed {% katex() %}50 \times \text{sizeof(entity)}{% end %} regardless of operation duration.

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

State automatically demotes under memory pressure. The level of state item \\(s\\) at time \\(t\\) drops by one tier per pressure event but never falls below the minimum level {% katex() %}\text{level}_{\min}(s){% end %} defined for that state type:

{% katex(block=true) %}
\text{level}(s, t) = \max(\text{level}(s, t-1) - 1, \text{level}_{\min}(s))
{% end %}

where {% katex() %}\text{level}_{\min}(s){% end %} is the minimum level for state type \\(s\\).

**Memory budget enforcement**:

Each {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} type has a memory budget \\(B_i\\). The constraint requires that the sum of memory consumed by all {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} instances \\(M_i\\) stays within total available memory minus the reserved headroom {% katex() %}M_{\text{reserve}}{% end %} needed for runtime overhead:

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

**Assumption Set** {% katex() %}\mathcal{A}_{SS}{% end %}: Bounded counters initialized to actual inventory, quota sum \\(\leq\\) total inventory, {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge semantics.

**Oversell probability bound**: Under {% katex() %}\mathcal{A}_{SS}{% end %}, oversells occur only when:
1. Quota was set incorrectly (human error, rate \\(\epsilon_h\\))
2. Race condition in local quota enforcement (system bug, rate \\(\epsilon_s\\))

The bound states that the oversell probability under quotas is at most {% katex() %}\epsilon_h + \epsilon_s{% end %}, which is far smaller than the baseline oversell probability without quotas (the product of partition probability and concurrent-sale probability).

{% katex(block=true) %}
P(\text{oversell}) \leq \epsilon_h + \epsilon_s \ll P(\text{oversell}|\text{no\_quota}) = P(\text{partition}) \cdot P(\text{concurrent\_sale})
{% end %}

**Reconciliation time**: Dominated by Merkle tree traversal \\(O(k \log(n/k) + k)\\) where \\(k\\) is divergent items. For sparse divergence (\\(k \ll n\\)): {% katex() %}T_{\text{reconcile}} \approx k \cdot T_{\text{sync}}{% end %}.

**Data integrity**: {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge guarantees no data loss under assumption {% katex() %}\mathcal{A}_{SS}{% end %}. Convergence follows from semilattice properties.

**Hierarchical authority for allocation conflicts**: When two warehouses simultaneously commit the last unit of inventory to different orders, the winning warehouse is the one whose commit timestamp is earlier — {% katex() %}\text{HLC}_{\text{commit}}(w){% end %} is the {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}Hybrid Logical Clock{% end %} timestamp (Definition 40) at which warehouse \\(w\\) recorded its commitment.

{% katex(block=true) %}
\text{Winner} = \arg\min_{w \in \{A, B\}} \text{HLC}_{\text{commit}}(w)
{% end %}

Commit timestamps must use {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} ordering (Definition 40) rather than wall-clock time to preserve correctness under clock drift during partition; see [Proposition 30](#prop-30) for the complete NTP-Free Split-Brain Resolution.

The warehouse with the earlier commit time fulfills its order. The losing warehouse must either source from another location or backorder. This creates occasional customer friction but maintains system integrity.

The authority hierarchy:
- **Warehouse Manager**: Can override quotas locally (L1 authority)
- **Regional Director**: Can reallocate between warehouses (L2 authority)
- **Central Operations**: Can globally rebalance inventory (L3 authority)

### Last-Writer-Wins vs Application Semantics

**Last-Writer-Wins (LWW)** is a common conflict resolution strategy: when values conflict, the most recent timestamp wins. The correct form for edge deployments uses HLC timestamps \\(h = (l, c, n)\\) via the {% katex() %}\prec_{\text{ext}}{% end %} ordering of Definition 41 — **not** raw wall-clock time \\(t\\):

{% katex(block=true) %}
\text{merge}(v_1, h_1, v_2, h_2) = \begin{cases}
v_1 & \text{if } h_2 \prec_{\text{ext}} h_1 \quad \text{(}h_1\text{ causally later)} \\
v_2 & \text{if } h_1 \prec_{\text{ext}} h_2 \quad \text{(}h_2\text{ causally later)} \\
v_1 \sqcup v_2 & \text{if } h_1 \parallel h_2 \quad \text{(concurrent — CRDT join)}
\end{cases}
{% end %}

*(Warning: the wall-clock form {% katex() %}\text{merge}(v_1, t_1, v_2, t_2) = v_1 \text{ if } t_1 > t_2{% end %} is incorrect at the edge. At {% katex() %}\pm 500\,\text{ms}{% end %} of clock drift — reachable in under 83 minutes on a 100 ppm crystal oscillator under normal conditions, and in under 42 minutes under thermal stress at 200 ppm — a fast-clock node's causally older update permanently overwrites a slow-clock node's causally newer update. Replacing \\(t\\) with {% katex() %}h \in \text{HLC}{% end %} is not an optimization; it is a correctness requirement. See the PPM drift analysis below.)*

LWW works for:
- Configuration values (latest config should apply)
- Status updates (latest status is most relevant)
- Position reports: **causal** recency ({% katex() %}\prec_{\text{ext}}{% end %} ordering), not wall-clock recency — at {% katex() %}\pm 500\,\text{ms}{% end %} drift "latest" is physically ambiguous. When HLC concurrency is detected (\\(h_1 \parallel h_2\\)), prefer the position with higher associated confidence score: {% katex() %}v_{\text{winner}} = \arg\max_{v \in \{v_1, v_2\}} \text{confidence}(v){% end %} (Confidence-wins semantic, see semantic resolution table below).

LWW fails for:
- Counters (later increment doesn't override earlier; both should apply)
- Sets with removal (later add doesn't mean earlier remove didn't happen)
- Causal chains (effect can have earlier timestamp than cause)

**Oscillator PPM analysis — {% katex() %}\pm 500\,\text{ms}{% end %} drift budget**: The {% katex() %}\pm 500\,\text{ms}{% end %} figure is not a hypothetical; it is the regime that breaks plain LWW in a single operational session.

| Clock source | Drift rate \\(\delta\\) | Time to {% katex() %}\pm 500\,\text{ms}{% end %} divergence | LWW status |
| :--- | :--- | :--- | :--- |
| GPS-disciplined | 1 ppm = {% katex() %}10^{-6}{% end %} s/s | {% katex() %}500\,\text{ms} / 10^{-6} = 138.9{% end %} h | Safe for all missions |
| TCXO (no GPS) | 2 ppm = {% katex() %}2\times10^{-6}{% end %} s/s | 69.4 h | Safe for most deployments |
| Crystal (\\(20^\circ\text{C}\\)) | 50 ppm = {% katex() %}5\times10^{-5}{% end %} s/s | 2.8 h | **Exceeded within a single watch** |
| Crystal (thermal stress, \\(70^\circ\text{C}\\)) | 200 ppm = {% katex() %}2\times10^{-4}{% end %} s/s | **42 min** | **Exceeded mid-sortie** |
| RC oscillator (L0 beacon) | 10,000 ppm = {% katex() %}10^{-2}{% end %} s/s | **50 s** | **Exceeded immediately** |

At 100 ppm (a conservative OUTPOST sensor specification), {% katex() %}\delta = 10^{-4}{% end %} s/s, so the {% katex() %}\pm 500\,\text{ms}{% end %} budget exhausts in {% katex() %}500\,\text{ms} / 10^{-4}\,\text{s/s} = 5{,}000\,\text{s} \approx 83\,\text{min}{% end %}. Any crystal-oscillator edge deployment with partitions exceeding 83 minutes **will experience LWW inversions** without HLC correction — this includes every OUTPOST mission scenario and most CONVOY urban-canyon transit periods. The HLC pivot in Definition 98 (Clock Trust Window) fires before this threshold; the Drift-Quarantine Re-sync Protocol (Definition 42) repairs clocks on reconnection.

**Edge complication**: Wall-clock LWW assumes reliable timestamps. The oscillator analysis above shows "latest" becomes meaningless at timescales under 2 hours for thermal-stressed crystals. The structural fix is not a heuristic timeout but a causal ordering system (HLC + vector clocks) that is correct regardless of oscillator quality.

**Semantic resolution — choosing the right merge logic by data type**:

When HLC detects \\(h_1 \parallel h_2\\) (concurrent writes, neither causally dominates), the CRDT join \\(s_1 \sqcup s_2\\) is the formally correct result — but "CRDT join" is an abstraction that maps to different concrete policies depending on the data type. Selecting the wrong policy here is where most LWW bugs lurk:

| Data type | Concurrent-update policy | Rationale |
| :--- | :--- | :--- |
| Observed zone set | **Add-wins** (OR-Set join: \\(S_1 \cup S_2\\)) | Discarding an observed zone is always a tactical loss — OR-Set is correct by definition |
| Inventory count | **Max-wins** (\\(\max(v_1, v_2)\\)) | Over-reporting is recoverable; under-reporting causes oversell |
| Node health score | **Min-wins** (\\(\min(v_1, v_2)\\)) | Fail-safe: take the most pessimistic concurrent health reading |
| Drone position | **Confidence-wins** ({% katex() %}\arg\max \text{conf}(v_i){% end %}) | GPS fix beats dead-reckoning regardless of timestamp; {% katex() %}\prec_{\text{ext}}{% end %} ordering is second tiebreaker |
| Mission parameters | **Authority-wins** (higher {% katex() %}\text{tier}(\text{id}_i){% end %} from Def 14) | L0 commander override beats field node regardless of clock order |
| Configuration values | **Causal-LWW** ({% katex() %}h_1 \prec_{\text{ext}} h_2 \Rightarrow v_2{% end %}) | Superseding writes; HLC ordering is sufficient when clocks within {% katex() %}T_{\text{trust}}{% end %} |
| Log entries / audit records | **All-wins** (MV-Register / RGA append) | No entry is ever discarded; use RGA (Definition 30) for ordered log semantics |

**The pattern**: LWW (time-wins) is correct only for superseding writes within the clock trust window. Outside that window, or for non-superseding semantics, one of the seven policies above applies. The Semantic Commit Order (Definition 29) formalizes the authority-wins and causal-LWW paths; this table extends it to the full semantic space.

**Conflict Resolution Logic: LWW-to-Causal Pivot**

The clock drift problem cannot be patched within LWW — it requires a structural pivot to causal ordering when physical time becomes untrusted. The trigger is the partition accumulator {% katex() %}T_{\mathrm{acc}}{% end %} from Definition 68: once {% katex() %}T_{\mathrm{acc}}{% end %} exceeds the maximum duration for which hardware clock drift remains within the HLC skew bound {% katex() %}\varepsilon{% end %}, the {% katex() %}l{% end %} component of every HLC timestamp is no longer reliable.

<span id="def-98"></span>

**Definition 98** (Clock Trust Window). *Given hardware clock drift rate {% katex() %}\delta_{\max}{% end %} (seconds per second, a constant from the hardware manufacturer's datasheet — not a tunable system parameter) and HLC skew bound {% katex() %}\varepsilon{% end %} from Proposition 41, the Clock Trust Window is:*

{% katex(block=true) %}
T_{\mathrm{trust}} = \frac{\varepsilon}{\delta_{\max}}
{% end %}

> **Derivation**: After partition duration \\(T\\), physical clocks diverge by at most {% katex() %}|\Delta l| \leq \varepsilon + \delta_{\text{ppm}} \cdot T{% end %}. The HLC timestamp remains trustworthy while the drift contribution has not dominated the initial uncertainty: {% katex() %}\delta_{\text{ppm}} \cdot T \leq \varepsilon \implies T \leq \varepsilon / \delta_{\text{ppm}} \equiv T_{\text{trust}}{% end %}. Beyond \\(T_{\text{trust}}\\), accumulated drift exceeds the initial uncertainty and the system pivots to pure logical ordering. **Calibration**: crystal oscillator (\\(\delta_{\text{ppm}} = 10^{-4}\\), \\(\varepsilon = 1\\) ms) gives \\(T_{\text{trust}} \approx 2.8\\) h. GPS-denied tactical (\\(\delta_{\text{ppm}} = 10^{-3}\\)) gives \\(T_{\text{trust}} \approx 17\\) min.

*During {% katex() %}T_{\mathrm{acc}} \leq T_{\mathrm{trust}}{% end %}, the HLC physical watermark {% katex() %}l_j{% end %} remains within {% katex() %}\varepsilon{% end %} of true time; full HLC ordering {% katex() %}\prec{% end %} (Definition 40) is used. When {% katex() %}T_{\mathrm{acc}} > T_{\mathrm{trust}}{% end %}, the system pivots to pure logical ordering {% katex() %}\prec_{\mathrm{logic}}{% end %}, comparing only the counter and node-ID components {% katex() %}(c_j, n_j){% end %} and ignoring {% katex() %}l_j{% end %}.*

| Node class | Clock source | {% katex() %}\delta_{\max}{% end %} | {% katex() %}\varepsilon{% end %} (Prop 41) | {% katex() %}T_{\mathrm{trust}}{% end %} | Implication |
| :--- | :--- | :--- | :--- | :--- | :--- |
| RAVEN drone | GPS-disciplined | {% katex() %}10^{-6}{% end %} s/s (1 ppm) | 1 s | \\(\approx\\) 11.6 days | GPS partition safe through typical mission cycles |
| CONVOY ECU | TCXO + GPS fallback | {% katex() %}2 \times 10^{-6}{% end %} s/s (2 ppm) | 3 s | \\(\approx\\) 17 days | Safe through most operational deployments |
| OUTPOST sensor | Crystal oscillator | {% katex() %}10^{-4}{% end %} s/s (100 ppm) | 1 s | \\(\approx\\) 2.8 h | Physical time untrusted after 3 hours of partition |
| Ultra-L0 beacon | RC oscillator | {% katex() %}10^{-2}{% end %} s/s (10,000 ppm) | 1 s | \\(\approx\\) 100 s | Physical time untrusted within 2 minutes |

For 30-day partitions ({% katex() %}T_{\mathrm{acc}} = 2{,}592{,}000\,\text{s}{% end %}), only GPS-disciplined nodes with {% katex() %}\delta < 0.39\,\text{ppm}{% end %} remain within {% katex() %}T_{\mathrm{trust}}{% end %}. All crystal-oscillator nodes pivot to {% katex() %}\prec_{\mathrm{logic}}{% end %} automatically.

- **Computes**: Maximum partition duration for which the HLC physical watermark remains trustworthy; above this, the system pivots to logical-only ordering.
- **Apply when**: Initialized at node start-up from hardware datasheet; evaluated at each MAPE-K tick by comparing {% katex() %}T_{\mathrm{acc}}{% end %} against {% katex() %}T_{\mathrm{trust}}{% end %}.
- **Parameters**: {% katex() %}\delta_{\max}{% end %} from hardware datasheet (GPS: 1 ppm; TCXO: 2–5 ppm; crystal: 50–200 ppm; RC oscillator: 1%–3%); {% katex() %}\varepsilon{% end %} from Proposition 41 calibration.
- **Prevents**: Silent LWW inversion — without the pivot, a crystal-oscillator node drifting 259 seconds over 30 days overwrites 4 minutes of peer updates on reconnect with timestamps that are physically "newer" but logically older.

> **Physical translation**: How long can you trust a wall-clock timestamp for LWW (Last-Write-Wins) ordering before accumulated drift invalidates it? T_trust is that window. After T_trust seconds without an NTP sync, all timestamps are ambiguous within the drift envelope — the HLC (Definition 40) takes over as the ordering authority.

The complete conflict resolution decision tree, combining Definition 98 with Definition 41's merge rules:

{% mermaid() %}
flowchart TD
    S["Two versions arrive: v₁,h₁ and v₂,h₂"] --> P{"T_acc > T_trust?<br/>Def 98: physical clock untrusted"}
    P -->|"No — T_acc ≤ T_trust<br/>full HLC trusted"| F["Compare h₁ ≺ h₂<br/>Def 40 lexicographic ordering"]
    P -->|"Yes — T_acc > T_trust<br/>drop l component"| G["Compare (c₁,n₁) vs (c₂,n₂)<br/>≺_logic: logical-only ordering"]
    F --> D{"Causally ordered?"}
    G --> D
    D -->|"h₁ ≺ h₂ — v₁ caused v₂"| W1["v₂ wins"]
    D -->|"h₂ ≺ h₁ — v₂ caused v₁"| W2["v₁ wins"]
    D -->|"h₁ ∥ h₂ — concurrent"| M["CRDT join: s₁ ⊔ s₂<br/>Def 41 Merge"]
    W1 --> Z(["Deliver result"])
    W2 --> Z
    M --> Z
{% end %}

<span id="prop-74"></span>

**Proposition 74** (LWW-to-Causal Pivot Correctness). *The pivot from HLC ordering {% katex() %}\prec{% end %} to logical ordering {% katex() %}\prec_{\mathrm{logic}}{% end %} at {% katex() %}T_{\mathrm{acc}} > T_{\mathrm{trust}}{% end %} (Definition 98) satisfies:*

1. **Monotonicity**: No previously committed value is overridden; {% katex() %}\prec_{\mathrm{logic}}{% end %} reclassifies some causal pairs as concurrent, never the reverse.
2. **Completeness**: Every update pair is classified as causally ordered (one dominates) or concurrent (requiring CRDT join) — no update is silently discarded.
3. **Conservative correctness**: {% katex() %}\prec_{\mathrm{logic}}{% end %} over-approximates concurrency — it may classify causally ordered updates as concurrent (triggering a safe CRDT join), but never classifies concurrent updates as causally ordered (which would silently discard one).
4. **Post-repair convergence**: After Definition 42 Drift-Quarantine repair, updates classified as concurrent under {% katex() %}\prec_{\mathrm{logic}}{% end %} converge to the same final state as if they had been correctly classified; the CRDT join is idempotent and commutative.

*Proof.* Property 1: {% katex() %}\prec_{\mathrm{logic}}{% end %} uses {% katex() %}(c_j, n_j){% end %} — sub-components of {% katex() %}\prec_{\mathrm{ext}}{% end %} (Definition 41, defined below in the Hybrid Logical Clocks section of this post). Any pair with {% katex() %}h_1 \prec_{\mathrm{logic}} h_2{% end %} also satisfies {% katex() %}h_1 \prec_{\mathrm{ext}} h_2{% end %} — logical dominance is a necessary condition for causal dominance. Incorrectly concurrent pairs resolve via CRDT join, which is monotone by Definition 12 (semilattice). Property 2: {% katex() %}\prec_{\mathrm{logic}}{% end %} is a total preorder on {% katex() %}(c, n){% end %} pairs; every pair is comparable or equal-then-tied. Property 3: follows from Property 1. Property 4: after Definition 42 Phase 2 (HLC repair), {% katex() %}l_j{% end %} is corrected; Phase 3 (causality audit) reclassifies previously-concurrent pairs; Definition 12 idempotency guarantees re-merge produces the same join result. \\(\square\\)

- **Computes**: Formal correctness guarantees for the physical-to-logical clock pivot under long partitions.
- **Apply when**: Verify at integration time that all CRDT types satisfy Definition 12 semilattice properties before deploying the Definition 98 pivot.
- **Parameters**: {% katex() %}\varepsilon{% end %}, {% katex() %}T_{\mathrm{trust}}{% end %} from Definition 98; all CRDT types must satisfy Definition 12 (idempotency, commutativity, associativity).
- **Prevents**: Pivot-induced data loss — Properties 1–3 prove the pivot only adds CRDT merges, never removes causally ordered updates.

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
- *\\(e_1 \parallel e_2\\) (concurrent) iff {% katex() %}V_1 \not\leq V_2{% end %} and {% katex() %}V_2 \not\leq V_1{% end %}*

In other words, you can determine the causal relationship between any two events purely by comparing their vector timestamps: strict component-wise ordering means one caused the other, while incomparable vectors mean the events happened independently and neither influenced the other.

The update rules are:
- **Local event**: \\(V_i[i] \gets V_i[i] + 1\\)
- **Send message**: Attach current \\(V_i\\) to message
- **Receive message with \\(V_m\\)**: {% katex() %}V_i[j] \gets \max(V_i[j], V_m[j]){% end %} for all \\(j\\), then \\(V_i[i] \gets V_i[i] + 1\\)

**Edge limitation**: Vector clocks grow linearly with node count. For a 50-drone swarm, each message carries 50 integers. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} with 12 vehicles, overhead is acceptable. For larger fleets, compressed representations or hierarchical clocks are needed.

**Bandwidth budget verification**: {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} (12 vehicles, 4-byte integers, 100 state updates/minute, 9.6 kbps half-duplex link at 60\% duty cycle = 5,760 bits/s available): vector clock overhead per update = \\(12 \times 4 = 48\\) bytes; at 100/min: \\(48 \times 100/60 = 80\\) bytes/s = 640 bits/s. Overhead fraction: \\(640/5760 \approx 11\\%\\) — acceptable. {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (47 drones, 200 updates/minute per node, same link class): \\(47 \times 4 = 188\\) bytes/update; at 200/min: \\(188 \times 200/60 \approx 627\\) bytes/s = 5,016 bits/s \\(\approx 52\\%\\) overhead — marginal and breaks under burst traffic. **Mitigation for {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}**: switch to interval tree clocks (Mukund & Kulkarni 2016) or dotted version vectors — these encode {% katex() %}O(\text{clusters}){% end %} integers instead of {% katex() %}O(\text{nodes}){% end %}, reducing per-update overhead to ~48 bytes (8 cluster IDs x 4 bytes + 8 sequence numbers x 4 bytes), dropping link overhead from 52\% to ~10\%. Causality guarantees are preserved at cluster granularity rather than node granularity.

**Mitigation**: Hybrid Logical Clocks add a monotonic counter to wall time to handle NTP skew; see Kulkarni et al. (2014) for the foundational analysis. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, LWW on route decisions is unreliable because a vehicle with a fast clock always wins regardless of information freshness — application semantics require considering intel recency, not just decision timestamp. Def 40–42 below formalize the {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} structure, the causality-aware merge function, and the re-sync protocol for massively drifted nodes.

<span id="def-40"></span>
**Definition 40** ({% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}Hybrid Logical Clock{% end %}). *A {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}Hybrid Logical Clock{% end %} on node \\(j\\) is a tuple \\(h_j = (l_j, c_j)\\) where \\(l_j\\) is the logical watermark — the maximum physical timestamp ever observed by node \\(j\\) from its own clock or received messages — and \\(c_j\\) is a counter that increments when consecutive events share the same watermark. {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} tuples are ordered lexicographically:*

{% katex(block=true) %}
(l_1, c_1) \prec (l_2, c_2) \;\iff\; l_1 < l_2, \;\text{or}\; (l_1 = l_2 \text{ and } c_1 < c_2)
{% end %}

*On a local send or write event at node \\(j\\), letting {% katex() %}l_j^{\mathrm{prev}}{% end %} denote the watermark before the event and {% katex() %}\lfloor \mathrm{pt}_j \rfloor{% end %} the current physical clock reading:*

{% katex(block=true) %}
l_j \leftarrow \max(l_j^{\mathrm{prev}},\, \lfloor \mathrm{pt}_j \rfloor), \qquad
c_j \leftarrow \begin{cases} c_j + 1 & \text{if } l_j = l_j^{\mathrm{prev}} \\ 0 & \text{otherwise} \end{cases}
{% end %}

*On receiving a message with {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} \\((l_m, c_m)\\), letting {% katex() %}l' = \max(l_j, l_m, \lfloor \mathrm{pt}_j \rfloor){% end %}:*

{% katex(block=true) %}
c_j \leftarrow \begin{cases}
\max(c_j, c_m) + 1 & \text{if } l' = l_j = l_m \\
c_j + 1            & \text{if } l' = l_j > l_m \\
c_m + 1            & \text{if } l' = l_m > l_j \\
0                  & \text{otherwise}
\end{cases}, \qquad l_j \leftarrow l'
{% end %}

*Each {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} operation carries metadata \\((n_j, h_j)\\) where \\(n_j\\) is the node identifier. The pair \\((n_j, h_j)\\) globally and uniquely identifies the operation.*

<span id="def-40b"></span>
**Definition 40b** (Message Delay Bound). *Let {% katex() %}\tau_{\max}(C){% end %} be the maximum expected one-way message delivery time under normal network conditions at connectivity level \\(C\\), measured in physical time units:*

{% katex(block=true) %}
\tau_{\max}(C) = \begin{cases}
100\,\text{ms} & C > 0.8 \quad (\text{local mesh}) \\
5\,\text{s}    & 0.3 < C \leq 0.8 \quad (\text{degraded link}) \\
60\,\text{s}   & C \leq 0.3 \quad (\text{intermittent or contested})
\end{cases}
{% end %}

*{% katex() %}\tau_{\max}{% end %} bounds the 99th-percentile one-way delivery time under normal (non-adversarial) conditions and is calibrated from operational measurements. It does not bound adversarially injected delay. The anomaly detection threshold in Proposition 41 depends on {% katex() %}\tau_{\max}{% end %} at the current connectivity level.*

> **Notation**: \\(\tau_{\max}\\) here denotes maximum one-way network message delivery time (milliseconds to seconds). This is distinct from the staleness time constant \\(\tau_{\text{stale}}^{\max}\\) in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-116), which measures the observation expiry window (minutes to hours).

<span id="prop-41"></span>
**Proposition 41** ({% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} Causal Ordering Properties). *For any two events \\(e\\), \\(f\\) with {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} timestamps \\(h_e\\), \\(h_f\\) on a fleet with maximum physical clock skew \\(\epsilon\\):*

1. *{% katex() %}l_j \geq \lfloor \mathrm{pt}_j \rfloor{% end %} at all times — the {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} watermark never lags physical time.*
2. *If \\(e \to f\\) (e causally precedes f ), then \\(h_e \prec h_f\\).*
3. *{% katex() %}l_j - \lfloor \mathrm{pt}_j \rfloor \leq \epsilon{% end %} — the watermark exceeds physical time by at most the fleet-wide clock skew.*
4. *If a received message has {% katex() %}l_m - \lfloor \mathrm{pt}_j \rfloor > \epsilon + \tau_{\max}{% end %} (Def 40b at current connectivity), then either (a) the sender's clock is anomalous — the watermark violates property 3 — or (b) message delivery exceeded {% katex() %}\tau_{\max}{% end %} (a network anomaly). Single-message violations are ambiguous; if multiple consecutive messages from the same sender satisfy this condition, conclude (a).*

*Proof sketch*: Properties 1–2 follow from the update rules: \\(l\\) always advances by at least the current physical timestamp, and a receive event produces \\(h_j\\) strictly greater than \\(h_m\\) (by incrementing \\(c\\) when watermarks coincide), preserving causal monotonicity. Property 3 holds when fleet clocks are bounded by a common authority (GPS PPS or NTP stratum 1) with skew \\(\leq \epsilon\\). Property 4: let \\(t_s\\) be the physical send time and {% katex() %}\tau_{\mathrm{del}}{% end %} the one-way delivery delay. Property 3 at the sender gives {% katex() %}l_m \leq \lfloor \mathrm{pt}_{\mathrm{send}}(t_s) \rfloor + \epsilon{% end %}. At the receiver, {% katex() %}\lfloor \mathrm{pt}_j \rfloor{% end %} is evaluated at receive time {% katex() %}t_s + \tau_{\mathrm{del}}{% end %}; if the receiver's clock lags the sender's by the delivery interval the watermark leads receiver physical time by up to {% katex() %}\epsilon + \tau_{\mathrm{del}}{% end %}. Therefore under normal delivery ({% katex() %}\tau_{\mathrm{del}} \leq \tau_{\max}{% end %}):

{% katex(block=true) %}
l_m - \lfloor \mathrm{pt}_j \rfloor \;\leq\; \epsilon + \tau_{\mathrm{del}} \;\leq\; \epsilon + \tau_{\max}
{% end %}

If the observed difference exceeds {% katex() %}\epsilon + \tau_{\max}{% end %}, either the sender violated property 3 (clock anomaly) or {% katex() %}\tau_{\mathrm{del}} > \tau_{\max}{% end %} (network anomaly). \\(\square\\)

**Calibration**: Set {% katex() %}\tau_{\max}{% end %} to the 99th percentile of measured one-way delivery times during normal operation. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} on a local mesh with GPS-disciplined clocks (\\(\epsilon \approx 1\\)s): measured {% katex() %}\tau_{99} \approx 80\,\text{ms}{% end %}, so {% katex() %}\tau_{\max} = 100\,\text{ms}{% end %}, giving anomaly threshold {% katex() %}\epsilon + \tau_{\max} = 1.1\,\text{s}{% end %}. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} in mountain terrain: {% katex() %}\tau_{99} \approx 3\,\text{s}{% end %}, so {% katex() %}\tau_{\max} = 5\,\text{s}{% end %}, giving threshold 6 s. Both thresholds are evaluated against the current connectivity regime (Def 40b); {% katex() %}\tau_{\max}{% end %} updates when regime transitions are detected.

<span id="def-41"></span>
**Definition 41** ({% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %}-Aware {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} Merge Function). *Let \\(s_1, s_2\\) be {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} states with {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} timestamps \\(h_1, h_2\\) and node identifiers \\(n_1, n_2\\). The {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %}-Aware Merge function replaces the physical-timestamp LWW comparator {% katex() %}t_{s_1} > t_{s_2}{% end %}:*

{% katex(block=true) %}
\mathbf{Merge}(s_1, h_1;\; s_2, h_2) =
\begin{cases}
s_2      & \text{if } h_1 \prec h_2 \\
s_1      & \text{if } h_2 \prec h_1 \\
s_1 \sqcup s_2 & \text{if } h_1 \parallel h_2
\end{cases}
{% end %}

*where \\(h_1 \parallel h_2\\) denotes causal concurrency (neither precedes the other) and \\(\sqcup\\) is the {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} join (least upper bound in the semilattice). When \\(h_1 \parallel h_2\\), no write is discarded — the join resolves the conflict without relying on clock ordering.*

Per-type instantiation of the concurrent case:

| CRDT type | Causal case | Concurrent case (\\(s_1 \sqcup s_2\\)) |
| :--- | :--- | :--- |
| LWW-Register | Higher \\(h\\) wins | Deterministic tiebreaker: higher \\(n\\) wins |
| G-Counter | Not applicable | Componentwise max per node |
| OR-Set | Not applicable | Union of (element, tag) pairs |
| RGA sequence | Insert ordered by \\(h\\) | Concurrent inserts ordered by \\((h, n)\\) |

The node-ID tiebreaker for concurrent LWW-Register writes gives every node a deterministic, agreed-upon total order extension — no coordination required. A clock that drifts 10 minutes fast no longer silently wins all concurrent decisions; it simply dominates the \\(l\\) field, which after Phase 2 repair (Def 42) is corrected before merging.

**Formal {% katex() %}\prec_{\text{ext}}{% end %} extension**: The tiebreaker in the table above is the lexicographic extension of {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} ordering with node identifier as a third level:

{% katex(block=true) %}
(l_1, c_1, n_1) \prec_{\text{ext}} (l_2, c_2, n_2) \iff l_1 < l_2, \;\text{or}\; (l_1 = l_2 \text{ and } c_1 < c_2), \;\text{or}\; (l_1 = l_2 \text{ and } c_1 = c_2 \text{ and } n_1 < n_2)
{% end %}

The LWW-Register merge is then \\(s_1\\) if {% katex() %}(h_2, n_2) \prec_{\text{ext}} (h_1, n_1){% end %}, \\(s_2\\) otherwise — a total order on \\((h, n)\\) pairs requiring no coordination. The three-level comparison subsumes the general \\(h_1 \parallel h_2\\) concurrent case from Definition 41.

**Clock drift bound** (Proposition 41, Property 3): With drift rate \\(\delta_{\text{ppm}}\\) (\\(\delta_{\text{ppm}}\\) denotes fractional clock drift rate; distinct from the compute-to-transmit energy ratio \\(\rho = T_d/T_s\\) in *Why Edge Is Not Cloud Minus Bandwidth*) (fractional; {% katex() %}10^{-4}{% end %} for crystal oscillators, {% katex() %}10^{-3}{% end %} for GPS-denied tactical edge), maximum clock divergence after partition duration \\(T\\) is:

> **Multi-part symbol disambiguation.** Several Greek letters carry different meanings across this series:
>
> | Symbol | Meaning in this article | Meaning elsewhere |
> |--------|------------------------|-------------------|
> | \\(\delta_{\text{ppm}}\\) | Crystal oscillator drift rate (ppm) | Not used elsewhere with this subscript |
> | \\(\rho\\) | (not used in this article) | Energy ratio \\(T_d/T_s\\) in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md); stability margin \\(\rho_q\\) in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) |
> | \\(\delta_m^x\\) | Delta-state CRDT mutant (Definition 72) | Distinct from staleness decay \\(\delta(t_{\text{stale}})\\) in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) |
> | \\(\tau_{\max}\\) | Maximum one-way message delivery time | Staleness time constant renamed \\(\tau_{\text{stale}}^{\max}\\) in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) |

{% katex(block=true) %}
|\Delta l| \leq \varepsilon + \delta_{\text{ppm}} \cdot T
{% end %}

For a 2-hour GPS-denied partition (\\(T = 7200\\) s, {% katex() %}\delta_{\text{ppm}} = 10^{-3}{% end %}): {% katex() %}|\Delta l| \leq \varepsilon + 7.2{% end %} s. Since {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} watermarks track the maximum observed physical time rather than raw wall clocks, logical counters absorb any remaining tie-breaking load without requiring NTP.

<span id="def-42"></span>
**Definition 42** (Drift-Quarantine Re-sync Protocol). *When partitioned node \\(j\\) rejoins with signed drift {% katex() %}\Delta_j = l_j - \max_{i \in \mathrm{peers}} l_i{% end %} (positive: clock ran fast; negative: clock ran slow), execute the following four phases:*

**Phase 0 — Detection**: Compute {% katex() %}\Delta_j = l_j - \max_{i \in \mathrm{peers}} l_i{% end %} on first peer message exchange. Let {% katex() %}\tau_{\max}{% end %} be the current connectivity-regime delay bound (Def 40b).

- {% katex() %}|\Delta_j| \leq \epsilon{% end %}: normal rejoin — drift within fleet-wide clock skew.
- {% katex() %}\epsilon < |\Delta_j| \leq \epsilon + \tau_{\max}{% end %}: ambiguous — drift exceeds skew but within delivery-delay range. Flag for monitoring; do not quarantine. Resolve by requesting a second exchange after {% katex() %}\tau_{\max}{% end %}: if \\(|\Delta_j|\\) persists, conclude clock drift (proceed to quarantine); if \\(|\Delta_j|\\) reduces, conclude transient delay.
- {% katex() %}|\Delta_j| > \epsilon + \tau_{\max}{% end %}: quarantine with high confidence — drift exceeds both clock skew and maximum delivery delay.

**Phase 1 — Quarantine**: Node \\(j\\) enters read-only mode — no new local writes are accepted; only incoming {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} is processed.

**Phase 2 — {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} Repair**: Reset the watermark and advance the counter past all observed peers:

{% katex(block=true) %}
l_j \leftarrow \max\!\left(l_j,\; \max_{i \in \mathrm{peers}} l_i\right), \qquad c_j \leftarrow \max_{i \in \mathrm{peers}} c_i + 1
{% end %}

**Phase 3 — Causality Audit**: For each operation {% katex() %}o = (s, h_{\mathrm{local}}, n_j){% end %} generated during the partition:

- **Concurrent** ({% katex() %}h_{\mathrm{local}} \parallel h_{\mathrm{peers}}{% end %} for all conflicting peers at that key): legitimate concurrent write — apply {% katex() %}\mathbf{Merge}{% end %} (Def 41) using the {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} join \\(\sqcup\\). No data is discarded.
- **Fast-clock** (\\(\Delta_j > 0\\)): {% katex() %}h_{\mathrm{local}}{% end %} may dominate peer HLCs at causally prior positions. Reissue \\(o\\) with repaired {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} {% katex() %}(l_j^{\mathrm{repaired}}, c_j + k){% end %} where \\(k\\) preserves causal order among local operations. The operation joins the fleet as concurrent, not as "future winner."
- **Slow-clock** (\\(\Delta_j < 0\\)): {% katex() %}h_{\mathrm{local}} \prec h_{\mathrm{peers}}{% end %} — \\(o\\) is causally prior. {% katex() %}\mathbf{Merge}{% end %} overrides \\(o\\) only if a peer write is its causal successor; concurrent peer writes are joined via \\(\sqcup\\), not silently discarded.

**Phase 4 — Exit Quarantine**: When all partition operations are audited and {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} state has converged with peers, exit read-only mode and resume normal {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} operation.

**Permanent isolation**: If a quarantined node's partition duration accumulator {% katex() %}T_{\mathrm{acc}}{% end %} exceeds {% katex() %}Q_{0.95}{% end %} (the Proposition 92 Weibull circuit-breaker threshold from [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md)) without re-sync completing, the node self-transitions to Terminal Safety State ([Definition 124](@/blog/2026-01-29/index.md#def-124)): ceases all write operations, freezes its CRDT state, and broadcasts a `QUARANTINE_PERMANENT` flag to any reachable peers for audit logging. This prevents a permanently isolated node's stale state from contaminating fleet state on a surprise reconnect after an operationally long isolation.

<span id="prop-42"></span>
**Proposition 42** (Re-sync Correctness). *The Drift-Quarantine Protocol (Def 42) guarantees:*

1. *Convergence: after re-sync, all nodes agree on the same {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} state in \\(O(|P| \cdot n)\\) {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} rounds, where \\(|P|\\) is the number of partition operations and \\(n\\) the fleet size.*
2. *Completeness: no partition operation is silently discarded — every operation is classified as causally ordered or concurrent and handled by Def 41.*
3. *Fast-clock neutralization: no reissued operation retains an {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} watermark above the repaired network watermark. The "future writes win" failure mode is eliminated.*
4. *Slow-clock protection: operations with low {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} watermarks are not silently overwritten; they survive as concurrent when no peer operation is their causal successor.*

*Proof sketch*: Property 1 follows from {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} convergence (Prop 13): the merged state is the join of all operations, converging regardless of evaluation order. Property 2 follows from Phase 3: every operation is explicitly classified. Properties 3–4 follow from Phase 2 {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} repair: after repair, {% katex() %}l_j = \max(l_j, l_{\mathrm{network}}) \geq l_{\mathrm{network}}{% end %}, neutralizing the fast-clock advantage; concurrent operations survive via \\(\sqcup\\). \\(\square\\)

**Concrete scenario**: Drone 23 partitioned for 47 minutes; its RTC drifted 12 minutes fast (\\(\Delta_j = +720\\)s). Without {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %}: all 847 local writes have {% katex() %}\mathrm{ts}_{\mathrm{local}} > \mathrm{ts}_{\mathrm{network}} + 720{% end %}s, silently overwriting 12 minutes of correct fleet state on rejoin — the fleet loses cohesion. With Def 42: Drone 23 enters quarantine, Phase 2 repairs \\(l_j\\), Phase 3 classifies all 847 writes as causally concurrent with peer writes in the same time window, and they are merged via OR-Set and RGA join operations — not silently winning. Convergence completes in 3 {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} rounds (consistent with Prop 4 on the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} 47-drone topology).

**Phase timeline clarification — 3 gossip rounds vs. \\(O(|P| \\times n)\\) audit rounds**: The "3 {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} rounds" figure refers to {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} state propagation only (Phase 4 of Def 42: disseminating the merged {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} join to all peers). The Phase 3 Causality Audit — classifying all 847 partition operations as causally ordered or concurrent — runs asynchronously and takes \\(O(|P| \cdot n)\\) {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} rounds, where \\(|P| = 847\\) (partition operations) and \\(n = 47\\) (fleet size). At the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} rate of \\(\lambda = 1\\) Hz and average convergence time of ~10 seconds per round (Prop 4), the full audit requires \\(847 \times 47 \approx 39,\!809\\) audit-exchanges at 1 Hz, completing in approximately 11 hours under continuous connectivity. In practice, the audit parallelizes across nodes (each node classifies its own \\(|P_j|\\) operations independently), reducing wall-clock time to {% katex() %}O(|P| / n \cdot D / \lambda) \approx 18 \times 8 / 1 \approx 144{% end %} seconds (18 operations per drone, diameter 8). The causality audit is not on the critical path for mission continuation — the node exits quarantine and resumes operations after state propagation completes in 3 rounds; the audit runs as a background verification process. The distinction matters operationally: "re-sync complete in 3 {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} rounds" means the fleet has a consistent {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} state, not that causality has been fully audited.

### Logical Validation: Peer Corroboration and Byzantine-Resilient Quorum

The CRDTs and vector clocks in the previous sections solve *consistency* — ensuring all nodes converge to the same state after partition. They say nothing about *correctness*: a node that merges consistently can still inject false sensor readings into the shared state, and those readings will propagate to the entire fleet with the same convergence guarantees as honest ones. Secure Boot attestation (Phase 0 in the FAC, Def 37) proves a node runs verified firmware — it does not prove its sensors report truthful physical state. A physically compromised node with valid attestation can inject false position, sensor readings, or health data, passing all cryptographic checks while corrupting the fleet's shared state model. The following three definitions address logical validation: truth as what the fleet independently verifies from physics, not what a node asserts. They build in order — first detecting false claims at a single node (Def 43), then weighting voters by track record (Def 44), then requiring a supermajority of high-trust nodes before any irreversible decision (Def 45).

<span id="def-43"></span>
**Definition 43** (Peer-Validation Layer). *For claim \\(c = (\tau_c, v, h, \sigma_j)\\) of type \\(\tau_c\\) with value \\(v\\), {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} timestamp \\(h\\), and signature \\(\sigma_j\\) from node \\(j\\), define the physical plausibility predicate at neighbor \\(i\\) as {% katex() %}\phi(c, i) \in \{0, 1\}{% end %}. Per claim type:*

| Claim type | Plausibility condition (\\(\phi(c,i) = 1\\) when) |
| :--- | :--- |
| Position | i's LIDAR/radar detects an object within {% katex() %}\epsilon_{\mathrm{pos}}{% end %} of claimed coordinates |
| Sensor reading | reading deviation from neighbor is bounded by physical gradient times separation distance |
| Battery state | reported level is within energy-model margin {% katex() %}B_{\mathrm{margin}}{% end %} of the predicted value |

For sensor readings, the condition is {% katex() %}\vert v_i - v \vert \leq \sigma_{\mathrm{grad}} \cdot d(i, j){% end %}, where {% katex() %}\sigma_{\mathrm{grad}}{% end %} is the maximum physical field gradient (e.g., temperature {% katex() %}^\circ\text{C/m}{% end %}). *The corroboration count over \\(k\\) nearest neighbors \\(N_k(j)\\) is:*

{% katex(block=true) %}
\kappa(c, j) = \sum_{i \in N_k(j)} \phi(c, i)
{% end %}

*Claim \\(c\\) from node \\(j\\) is accepted into shared {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} state only if {% katex() %}\kappa(c, j) \geq k_{\mathrm{accept}}{% end %}. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}: \\(k = 6\\) nearest neighbors, {% katex() %}k_{\mathrm{accept}} = 4{% end %} (two-thirds majority of neighbors).*

> **Physical translation**: Drone 23 reports it is at grid position X. Before that claim enters the shared CRDT state, at least 4 of its 6 nearest neighbors must independently confirm — using their own LIDAR, radar, or optical sensors — that there is an object at position X. A compromised drone fabricating a false position cannot pass this check unless it also controls at least 4 surrounding drones' sensor readings.

<span id="prop-43"></span>
**Proposition 43** (Peer-Validation False-Acceptance Bound). *Let {% katex() %}p_{\mathrm{fool}}{% end %} be the probability that a single neighbor sensor is independently fooled into corroborating a false claim. Under independent sensor compromise, the probability a false claim is accepted is:*

{% katex(block=true) %}
P(\text{false claim accepted}) = \sum_{m=k_{\mathrm{accept}}}^{k} \binom{k}{m} p_{\mathrm{fool}}^{\,m} (1 - p_{\mathrm{fool}})^{k-m}
{% end %}

- **Use**: Gives the probability a Byzantine node passes peer validation given quorum size {% katex() %}k{% end %}; use when selecting {% katex() %}k{% end %} to satisfy your mission's false-acceptance risk tolerance and prevent insufficient quorum from trivially accepting malicious state claims.
- **Parameters**: {% katex() %}k \geq 3{% end %} gives {% katex() %}P < 3\%{% end %}; {% katex() %}k \geq 5{% end %} gives {% katex() %}P < 0.4\%{% end %}; assume {% katex() %}p_{\text{fool}} = 0.1{% end %} per validator (use 0.3 in contested environments).
- **Field note**: {% katex() %}k=1{% end %} (single validator) is trivially compromised; {% katex() %}k=2{% end %} allows 11% false acceptance — always use {% katex() %}k \geq 3{% end %} in any safety-relevant context.

*For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (\\(k = 6\\), {% katex() %}k_{\mathrm{accept}} = 4{% end %}, {% katex() %}p_{\mathrm{fool}} = 0.10{% end %}):*

{% katex(block=true) %}
P(\text{false accepted}) = \binom{6}{4}(0.1)^4(0.9)^2 + \binom{6}{5}(0.1)^5(0.9) + (0.1)^6 \approx 1.22 \times 10^{-3}
{% end %}

**Correlated attack caveat**: Independence fails under coordinated GPS spoofing or cluster-level physical compromise. Countermeasure: require corroboration from sensors of distinct physical modalities (LIDAR, radar, optical, magnetometer) — spatial correlation of spoofing across modalities is far lower than within a single modality. An adversary simultaneously fooling {% katex() %}k_{\mathrm{accept}}{% end %} independent sensing principles has achieved a level of compromise that is qualitatively outside the {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} fault model of Def 7.

**Topology-aware adversary attack (defeats Prop 43 with probability 1)**: The independence assumption in Proposition 43 fails not only under correlated sensor spoofing but also under formation-aware positioning. An adversary with knowledge of the drone formation map can place a compromised node at a position where its \\(k\\) nearest neighbors are all within the same sensor shadow — a terrain feature, building, or signal reflector that makes all neighbor readings consistent with the false claim. Example: Drone 23 reports a false position 50 m north of its actual location. If the adversary knows that Drones 14, 18, 22, 27, 31, and 36 are all north of Drone 23 (in the same direction as the false displacement), their LIDAR returns from Drone 23's general direction will be consistent with the false position within {% katex() %}\epsilon_{\text{pos}}{% end %} — all 6 neighbors independently corroborate a false claim deterministically, not probabilistically. The multi-modal countermeasure partially addresses this: magnetometer readings are invariant to LIDAR-visible terrain shadows. **Required supplemental countermeasure**: cross-modal corroboration must include at least one modality with independent failure geometry (e.g., RF time-of-flight ranging, which requires adversary control of radio propagation rather than optical/terrain knowledge). Additionally, require that corroborating neighbors span at least two distinct angular sectors from the claimant's perspective — a corroboration quorum from a single sector is vulnerable to formation-aware adversaries regardless of how many nodes it contains.

<span id="def-44"></span>
**Definition 44** (Reputation-Weighted Fleet Coherence Vote). *Each node \\(i\\) maintains a reputation vector {% katex() %}\mathbf{r}(t) = [r_1(t), \ldots, r_n(t)]{% end %} with \\(r_j \in [0, 1]\\), updated by EWMA on corroboration outcomes:*

{% katex(block=true) %}
r_j(t) \leftarrow \alpha_r \cdot \mathbf{1}[\kappa(c_j, \cdot) \geq k_{\mathrm{accept}}] + (1 - \alpha_r) \cdot r_j(t-1)
{% end %}

- **Use**: Exponentially smooths reputation scores with additive recovery on passes and multiplicative decay on failures; update after every peer-validation check or gossip event to prevent Byzantine nodes from accumulating trust through easy low-stakes interactions.
- **Parameters**: {% katex() %}\alpha_r{% end %} = EMA smoothing factor (0.1–0.3); starts at 1.0; asymmetric decay is intentional — fast down, slow up.
- **Field note**: Equal gain/loss rates let a node recover in one success after a dangerous failure — the asymmetry must be at least 5:1.

*where \\(\alpha_r \ll 1\\) (slow adaptation — prevents {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} manipulation of the reputation update itself). The weighted vote of node \\(i\\) on claim \\(c\\) from node \\(j\\) is {% katex() %}V_i(c) = r_i(t) \cdot \phi(c, i){% end %}. Claim \\(c\\) is accepted under reputation weighting if:*

{% katex(block=true) %}
\frac{\sum_{i \in N_k(j)} V_i(c)}{\sum_{i \in N_k(j)} r_i(t)} \geq \theta_{\mathrm{vote}}
{% end %}

*The effective {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} fraction after \\(T\\) {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} rounds, as {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} nodes consistently fail corroboration and receive EWMA weight 0 each round:*

{% katex(block=true) %}
f_{\mathrm{eff}}(T) = \frac{\sum_{j \in \mathcal{B}} r_j(T)}{\sum_{j \in V} r_j(T)} \approx \frac{f_0 \cdot (1-\alpha_r)^T}{1 - f_0 + f_0 \cdot (1-\alpha_r)^T}
{% end %}

*where {% katex() %}f_0 = \vert \mathcal{B} \vert / n{% end %}. {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} nodes decay toward \\(r_j = 0\\) without removal — their vote weight becomes negligible.*

> **Physical translation**: A drone that repeatedly submits claims its neighbors cannot corroborate — fabricated positions, impossible battery levels — accumulates a poor reputation score. After enough failed validations, its votes on future claims are weighted near zero, so it can no longer influence fleet decisions even if it has not been formally expelled. This matters during partition, when expulsion requires quorum: reputation weighting silences a bad actor immediately, without requiring coordination.

**Connection to Prop 6**: Prop 6 ({% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} Tolerance Bound) requires \\(f < n/3\\) under uniform trust weights. Def 44 relaxes this: once {% katex() %}f_{\mathrm{eff}}(T) < 1/3{% end %}, the weighted scheme satisfies the tolerance bound even if the physical count {% katex() %}\vert \mathcal{B} \vert \geq n/3{% end %} — provided the reputation system has accumulated sufficient rounds. The minimum round count is {% katex() %}T_{\mathrm{excl}} \approx \ln(3f_0 / (1 - 3f_0)) / \alpha_r{% end %} (the time for {% katex() %}f_{\mathrm{eff}}{% end %} to fall below \\(1/3\\) when \\(f_0 < 1/3\\)).

<span id="def-45"></span>
**Definition 45** (Logical Quorum for High-Stakes Decisions). *For {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier L0-L4 from heartbeat-only survival to full fleet integration; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %} L3 and above transitions (Collaborative Planning, Full Integration) or commanded {% term(url="@/blog/2026-01-29/index.md#def-124", def="Operating mode entered when the entire autonomic framework has failed; selected by L0 hardware alone based on remaining energy; no L1-L4 software involvement") %}terminal safety state{% end %} triggers (Def 124), a logical quorum \\(Q \subseteq V\\) must satisfy all five conditions simultaneously:*

1. **Size**: {% katex() %}\vert Q \vert \geq \lceil 2n/3 \rceil + 1{% end %}
2. **Reputation**: {% katex() %}\sum_{i \in Q} r_i(t) \geq \theta_Q \cdot \sum_{i \in V} r_i(t){% end %}
3. **Corroboration currency**: every \\(i \in Q\\) has passed peer validation ({% katex() %}\kappa(c_i, \cdot) \geq k_{\mathrm{accept}}{% end %}) within the last {% katex() %}T_{\mathrm{stale}}{% end %} seconds (Prop 79)
4. **Causal consistency**: {% katex() %}\max_{i \in Q} h_i - \min_{i \in Q} h_i \leq \tau_Q{% end %} where \\(h_i\\) is the {% term(url="#def-40", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} vote timestamp (Def 40) — all quorum votes lie in the same causal window
5. **Spatial diversity**: no single communication cluster contributes more than {% katex() %}\lfloor \vert Q \vert / 2 \rfloor{% end %} votes — the quorum spans at least two physically separated clusters

*Decision \\(D\\) is logically validated if a valid logical quorum \\(Q\\) exists and:*

{% katex(block=true) %}
\left|\left\{i \in Q : \mathrm{vote}_i(D) = \mathrm{YES}\right\}\right| \geq \left\lceil \frac{2\,|Q|}{3} \right\rceil
{% end %}

- **Use**: Requires a 2/3 supermajority of reputation-filtered voters before any irreversible high-stakes decision; verify this condition before every such decision to prevent simple-majority capture, which a 34% Byzantine coalition can break at 50%+1.
- **Parameters**: {% katex() %}|Q|{% end %} = voters with reputation {% katex() %}\geq \rho_{\min}{% end %}; 2/3 threshold tolerates up to 1/3 Byzantine members in {% katex() %}Q{% end %}.
- **Field note**: The reputation filter on {% katex() %}Q{% end %} matters as much as the 2/3 ratio — a quorum of low-trust nodes provides no Byzantine safety.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} "Change Mission" parameters** (\\(n = 47\\), \\(f \leq 15\\)):
- Size: {% katex() %}\vert Q \vert \geq \lceil 94/3 \rceil + 1 = 33{% end %}
- Reputation threshold: \\(\theta_Q = 0.75\\)
- Causal window: \\(\tau_Q = 11.2\\)s (Contested {% katex() %}T_{\mathrm{stale}}{% end %} from Prop 79)

**HSS trigger asymmetry** (Def 124, Prop 93): Autonomous local HSS trigger (battery below {% katex() %}E_{\mathrm{HSS}}{% end %} and threat conditions met) requires no quorum — it is a unilateral safety action that must remain available in the Denied regime (C=0) where quorum is unreachable. Remotely commanded HSS requires a logical quorum plus pre-enrolled cryptographic command authority. In the Denied regime, commanded HSS must fall back to pre-authorized standing orders in L0 firmware, established at deployment enrollment; real-time quorum formation is impossible when partition is complete.

> **Physical translation**: Before the RAVEN swarm changes its mission assignment — an irreversible act that disperses 47 drones to new grid sectors — at least 33 drones must vote YES, the voters must collectively hold 75% of the fleet's total reputation weight, every voter must have passed peer validation within the last 11 seconds, and their votes must span at least two physically separated communication clusters. This five-condition gate ensures that neither a single compromised cluster nor a coalition of reputation-degraded nodes can redirect the swarm.

<span id="prop-44"></span>
**Proposition 44** (Logical Quorum BFT Resistance). *Under Def 7 with at most \\(f < n/3\\) {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} nodes — including nodes with valid Secure Boot attestation:*

1. *Safety: no two contradictory decisions \\(D\\) and \\(\lnot D\\) can both be logically validated — any two valid logical quorums intersect in at least one honest node.*
2. *Liveness: if \\(n - f\\) honest nodes are connected and currently corroborated, a valid logical quorum exists.*
3. *Reputation convergence: after {% katex() %}T_{\mathrm{excl}} \approx \ln(3f_0 / (1 - 3f_0)) / \alpha_r{% end %} rounds, {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} nodes' combined weight falls below \\(\theta_Q \cdot \sum r_i\\), excluding them from condition 2.*
4. *Anti-Sybil via spatial diversity: condition 5 prevents a single compromised cluster from unilaterally forming a quorum even if every node in that cluster holds valid attestation.*

*Proof sketch*: **Property 1** — By condition 1, {% katex() %}\vert Q_1 \vert + \vert Q_2 \vert \geq 2(\lceil 2n/3 \rceil + 1) > 4n/3{% end %}. By inclusion-exclusion, {% katex() %}\vert Q_1 \cap Q_2 \vert \geq \vert Q_1 \vert + \vert Q_2 \vert - n > n/3 > f{% end %}. At least one node in \\(Q_1 \cap Q_2\\) is honest; an honest node votes consistently, so \\(Q_1\\) and \\(Q_2\\) cannot simultaneously validate \\(D\\) and \\(\lnot D\\). **Property 2** — With \\(n - f > 2n/3\\) honest corroborated nodes, condition 1 is satisfiable; conditions 2–4 are satisfiable because honest nodes maintain high and growing reputation, and the fleet topology (Prop 4) ensures multi-cluster connectivity. **Property 3** — {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} nodes accumulate EWMA weight 0 each round; {% katex() %}f_{\mathrm{eff}}(T) \to 0{% end %} geometrically at rate \\((1-\alpha_r)\\). **Property 4** — Any single cluster \\(C\\) with \\(\vert C \vert < 2n/3\\) cannot satisfy condition 1 alone; condition 5 forces a second cluster to contribute, and that cluster contains honest nodes whose votes are not controlled by the compromised cluster. \\(\square\\)

> **Physical translation**: The inclusion-exclusion argument says that any two quorums of 33+ drones in a 47-drone fleet must share at least 16 drones — more than the 15-drone Byzantine fault tolerance limit — so at least one of those overlapping drones is honest and will refuse to vote YES for both a decision and its contradiction. The geometry of the quorum size requirement is what makes contradictory decisions structurally impossible, not just unlikely.

### Causal Commit Ordering: NTP-Free Split-Brain Resolution

The {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} mitigation above surfaces a deeper structural flaw: wall-clock time defines an ordering that is neither causal nor semantic. It correlates with "which node last touched this value," not "which value is operationally correct." A vehicle whose clock is 3 seconds fast wins every concurrent route decision — regardless of information quality — and this bias is exploitable under active GPS jamming. The fix replaces the \\(t_1 > t_2\\) comparison with a three-level lexicographic ordering that needs no synchronized clocks.

<span id="def-29"></span>
**Definition 29** (Semantic Commit Order). *For two concurrent update records {% katex() %}u_1 = (v_1, V_1, p_1, \mathrm{id}_1){% end %} and {% katex() %}u_2 = (v_2, V_2, p_2, \mathrm{id}_2){% end %} — where \\(V_i\\) is the vector clock (Definition 13), \\(p_i \in \mathbb{Z}^+\\) is the application-assigned semantic priority, and {% katex() %}\mathrm{id}_i = (\mathrm{tier}_i, \mathrm{nid}_i){% end %} is the authority-tier identity (Definition 14, with {% katex() %}\mathrm{nid}{% end %} fixed at manufacturing) — the Semantic Commit Order \\(\prec\\) is determined by applying the following rule in sequence until a winner is found:*

1. *Causal dominance (no wall clock): if \\(V_1 < V_2\\), then \\(u_2 \succ u_1\\); if \\(V_2 < V_1\\), then \\(u_1 \succ u_2\\). If incomparable (concurrent), proceed to step 2.*
2. *Semantic priority: the higher-\\(p_i\\) record wins when \\(p_1 \neq p_2\\). If equal, proceed to step 3.*
3. *Authority tie-breaker: lower tier number wins (L0 authority outranks L1; Definition 14). Among equal tiers, higher {% katex() %}\mathrm{nid}{% end %} wins (globally unique; assigned at manufacture).*

*The order is total: because {% katex() %}\mathrm{nid}{% end %} values are globally unique, step 3 never produces a tie.*

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
3. *Clock independence: steps 2 and 3 compare fields {% katex() %}(p_i, \mathrm{id}_i){% end %} fixed at write and manufacture time; no wall-clock timestamp appears.*
4. *Determinism: every node computes the same winner from the same two records, regardless of arrival order or local clock.*

*Proof*: (1) Step 3 compares globally unique {% katex() %}\mathrm{nid}{% end %} values — ties are impossible. (2) \\(u_1 \to u_2\\) iff \\(V_1 < V_2\\) by Proposition 14; step 1 resolves this before reaching steps 2–3. (3) \\(p_i\\) and {% katex() %}\mathrm{id}_i{% end %} are integer constants assigned at write and manufacture time; no clock participates. (4) The rule is a deterministic function of {% katex() %}(V_1, p_1, \mathrm{id}_1, V_2, p_2, \mathrm{id}_2){% end %}. \\(\square\\)

**Connection to LWW**: When \\(p_1 = p_2\\) and updates are concurrent, the authority-tier tie-breaker acts as a deterministic LWW with a "clock" that cannot drift — the {% katex() %}\mathrm{nid}{% end %} is fixed at boot and invariant under GPS jamming, NTP failure, and deliberate clock manipulation. This is strictly stronger than wall-clock LWW: consistent under arbitrary clock skew and adversarial time sources.

> **Physical translation**: Authority tier breaks symmetry — the higher-authority node's version wins, with no need for a neutral majority. Two fleet vehicles that diverged during a 45-minute blackout resolve their conflict the moment they reconnect, without waiting for a third vehicle to cast a deciding vote.

### Custom Merge Functions

When standard {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s don't fit, define custom merge functions satisfying the same semilattice requirements as Definition 12: commutativity, associativity, and idempotency.

**Example: Surveillance priority list**

Each cluster maintains a list of priority targets. During partition, both clusters may add or reorder targets.

Merge function:
1. Union of all targets: {% katex() %}T_{\text{merged}} = T_A \cup T_B{% end %}
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
- **Intersection** (engagement authorization): unanimity rule - minimizes false authorizations but maximizes false negatives; correct when {% katex() %}C_{\text{false auth}} \gg C_{\text{missed auth}}{% end %}
- **Maximum** (surveillance priority): appropriate when priorities are independent across targets; over-allocates when two clusters assign effort to the same target (substitutable priorities)
- **Union** (G-Set coverage): correct for additive capabilities with no conflict
- **Proportional quota** ({% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %}): satisfies Nash bargaining axioms when fallback utilities are zero

**Practical implication**: For each {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network deal") %}CRDT{% end %} in the system, document the merge function against the fairness criterion it satisfies. For resource allocation (quotas, task assignments), use proportional or Nash bargaining allocation. For irreversible decisions (engagement authorization), use intersection. For additive state (coverage maps, sensor readings), use union or maximum as appropriate to whether the underlying quantities are complementary or substitutable.

> **Cognitive Map**: CRDTs solve the "who wins" problem structurally, not procedurally — the merge function determines the outcome at design time, not at reconciliation time. The three semilattice properties (commutativity, associativity, idempotency) are what make this work: any replica that has seen the same updates reaches the same state. The Reputation-Weighted extension (Definition 12b) adds a Byzantine admission gate before the semilattice merge — a compromised node cannot poison fleet state unless it controls a coalition above {% katex() %}\Theta_{\text{trust}}{% end %}. The six standard CRDT types (G-Counter, PN-Counter, G-Set, 2P-Set, LWW-Register, MV-Register) cover the majority of edge state patterns; the selection criterion is the semantic intent of concurrent writes, not implementation convenience. Next: when CRDT semantics cannot resolve a conflict (two clusters both committed the same exclusive resource), authority tiers determine precedence.

---

## Hierarchical Decision Authority

**Problem**: CRDTs handle data-level convergence but cannot resolve decisions. When two clusters independently commit an exclusive resource — a target engagement authorization, a shared processing slot — no merge function can make both assignments valid simultaneously.

**Solution**: Classify decisions by scope (node, cluster, fleet, command) and pre-delegate authority for the appropriate tier before partition occurs. Each node knows which decisions it is authorized to make autonomously and which require escalation to a higher tier.

**Trade-off**: Broader pre-delegated authority enables faster autonomous operation during partition but increases the risk of conflicting decisions. The optimal delegation scope minimizes expected reconciliation cost — bounded delegation is always better than either full autonomy or full lockout.

### Decision Scope Classification

<span id="def-14"></span>
**Definition 14** (Authority Tier). *The {% term(url="#def-14", def="Level in the decision hierarchy (node, cluster, fleet, command); determines which decisions a node makes autonomously versus escalates when connectivity to higher tiers is lost") %}authority tier{% end %} \\(\mathcal{Q}_j\\) for {% katex() %}j \in \{0,1,2,3\}{% end %} classifies decisions by the scope of affected nodes. The scope {% katex() %}\text{scope}(d){% end %} of a decision \\(d\\) is the set of nodes whose state is affected by \\(d\\).*

In other words, a decision belongs to tier \\(\mathcal{Q}_j\\) based solely on how many nodes its outcome touches: a self-repair action on one drone is tier 0, a formation change within a cluster is tier 1, a mission-wide route update is tier 2, and anything requiring external command approval is tier 3.

| Tier | Name | Scope | Example |
| :---: | :--- | :--- | :--- |
| \\(\mathcal{Q}_0\\) | Node | Single node | Local healing action |
| \\(\mathcal{Q}_1\\) | Cluster | Local cluster | Formation adjustment |
| \\(\mathcal{Q}_2\\) | Fleet | All nodes | Mission parameter change |
| \\(\mathcal{Q}_3\\) | Command | Beyond fleet | Rules of engagement |

*Notation: {% katex() %}Q_i \in \{Q_0, Q_1, Q_2, Q_3\}{% end %} (higher index = higher authority) denotes a tier level (a compile-time constant per node class). {% katex() %}Q_{\text{effective}}(t){% end %} is the runtime effective tier at time \\(t\\) — may be downgraded from the design tier during partition. {% katex() %}Q_{\text{delegated}}(\tau){% end %} is the tier granted by a higher-authority node for a partition of duration \\(\\tau\\). All three share the codomain {% katex() %}\{Q_0, \ldots, Q_3\}{% end %}.* (See also the Constraint Sequence in [Constraint Sequence](@/blog/2026-02-19/index.md#def-17), which formalizes the prerequisite ordering under which authority tiers must be satisfied before capability levels advance.)

> **Authority Tiers vs. Capability Levels.** These are two orthogonal hierarchies that both use the term "level" but govern different aspects of node behaviour:
>
> | Concept | Symbol | Determined by | Governs |
> |---------|--------|--------------|---------|
> | Capability Level (L_0–L_4) | \\(q\\) | Remaining battery / resource budget | Energy fidelity, MAPE-K tick rate, measurement stack activation |
> | Authority Tier | \\(Q_j\\) | Partition duration + pre-delegation rules | Decision scope, write authority, which actions a node may take autonomously |
>
> A node at capability level L1 (low battery) may simultaneously hold authority tier Q3 (high autonomy) if it was pre-delegated before the partition. The two hierarchies are independent.
>
> **Disambiguation — capability level vs. authority tier**: *Capability level* (\\(\mathcal{L}_0\\)–\\(\mathcal{L}_4\\), *Why Edge Is Not Cloud Minus Bandwidth*) describes what functional service a node delivers. *Authority tier* (\\(\mathcal{Q}_j\\), this definition) describes what decisions a node may make autonomously. These are orthogonal: a node at \\(\mathcal{L}_0\\) (heartbeat survival only) may hold \\(\mathcal{Q}_0\\) command authority; an \\(\mathcal{L}_4\\) node (full mission capability) may hold only field-level \\(\mathcal{Q}_3\\) authority. When other sections say "escalate to L0," context determines which hierarchy is meant: in the healing framework (*Self-Healing Without Connectivity*), "L0" always means capability level (functional degradation); in conflict-resolution rules in this article, "authority tier" always means decision scope.

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

> **Read the diagram**: Left side (Connected State): the full four-tier hierarchy, red at top (Command, strategic decisions) flowing down through Fleet \\(\to\\) Cluster \\(\to\\) Node. Right side (Partitioned State): only two tiers remain — the Cluster Lead (yellow, elevated to A2 authority) and the individual Node (green). The dotted arrow from A1-Connected to A1-Partitioned marks the partition event trigger. The elevation is explicit delegation, not automatic assumption: the cluster lead received pre-authorized A2 authority before the partition began.

**Authority elevation during partition**: When connectivity is lost, authority must be explicitly delegated downward. The system cannot simply assume lower levels can make higher-level decisions.

> **Interaction with healing admission**: The Authority Tier check precedes the Healing Admission Condition (HAC) in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md). A node whose {% katex() %}Q_{\text{effective}}(t) < Q_{\text{required}}(\text{action}){% end %} does not evaluate HAC — the action is rejected before the Lyapunov gate is reached. This ordering ensures partitioned nodes with temporarily elevated effective tier cannot issue healing actions they lack the authority to perform.

### Authority Delegation Under Partition

**Formal Decision Problem**:

**Objective Function**:

The objective selects the {% term(url="#def-14", def="Level in the decision hierarchy (node, cluster, fleet, command); determines which decisions a node makes autonomously versus escalates when connectivity to higher tiers is lost") %}authority tier{% end %} \\(\mathcal{Q}^\*\\) that maximizes expected mission value minus the cost of reconciling any decisions made at that authority tier when connectivity resumes.

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

The delegated authority tier grows by one level per {% katex() %}\tau_{\text{escalation}}{% end %} time units of continuous partition, saturating at \\(\mathcal{Q}_2\\) so that command-tier authority is never granted automatically.

{% katex(block=true) %}
\mathcal{Q}_{\text{delegated}}(\tau) = \min\left(\mathcal{Q}_2, \mathcal{Q}_0 + \left\lfloor \frac{\tau}{\tau_{\text{escalation}}} \right\rfloor\right)
{% end %}

Authority increases by one tier per {% katex() %}\tau_{\text{escalation}}{% end %} time units of partition, capped at {% katex() %}\mathcal{Q}_2{% end %}. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, {% katex() %}\tau_{\text{escalation}} = 15{% end %} minutes — after 15 minutes of partition, the cluster lead's authority escalates by one tier.

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

**Objective Function**: The optimal strategy \\(r^\*\\) minimizes the weighted sum of reconciliation time {% katex() %}T_{\text{reconcile}}(r){% end %} and residual divergence {% katex() %}D_{\text{residual}}(r){% end %}, where weight \\(w\\) reflects the relative cost of leaving divergence unresolved.

{% katex(block=true) %}
r^* = \arg\min_{r \in \mathcal{R}} \left[ T_{\text{reconcile}}(r) + w \cdot D_{\text{residual}}(r) \right]
{% end %}

Minimize reconciliation time subject to bounded residual divergence.

**Constraint Set**: Three constraints bound the feasible strategies: residual divergence must stay below threshold {% katex() %}D_{\max}{% end %}, bandwidth consumed by the strategy must not exceed what the current {% term(url="@/blog/2026-01-15/index.md#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} \\(C(t)\\) provides, and any conflict arising from the strategy must be resolvable deterministically (the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} property).

{% katex(block=true) %}
\begin{aligned}
g_1: && D_{\text{residual}}(r) &\leq D_{\max} && \text{(coherence bound)} \\
g_2: && B_{\text{required}}(r) &\leq B_{\text{available}}(C(t)) && \text{(bandwidth)} \\
g_3: && \text{conflict}(r) &\Rightarrow \text{deterministic\_resolution}(r) && \text{(CRDT property)}
\end{aligned}
{% end %}

**State Transition Model**: After all partition clusters merge, the unified state {% katex() %}\Sigma_{\text{merged}}{% end %} is the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} join of every cluster's local state — the join operator \\(\bigsqcup\\) applies the same commutative, associative, idempotent merge across all partitions simultaneously.

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
1. If {% katex() %}\text{authority}(A) > \text{authority}(B){% end %}: \\(d_A\\) wins
2. If {% katex() %}\text{authority}(A) = \text{authority}(B){% end %}: Apply tie-breaker
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
**Definition 30** (RGA Tombstone Pruning Strategy). *An RGA causal sequence is a set of records \\(\mathcal{S}\\), each of the form {% katex() %}(c, \mathrm{id}, \mathrm{parent}, d, K){% end %}, where \\(c\\) is the character value (\\(\perp\\) for a tombstone), {% katex() %}\mathrm{id} = (\mathrm{site}, \mathrm{seq}){% end %} is a globally unique causal identifier, {% katex() %}\mathrm{parent}{% end %} is the causal predecessor's {% katex() %}\mathrm{id}{% end %}, {% katex() %}d \in \{0,1\}{% end %} is the tombstone flag, and \\(K \subseteq V\\) is the set of nodes that have acknowledged this record.*

*The acknowledgement vector \\(A_i[j]\\) at node \\(i\\) stores the highest sequence number from site \\(j\\) that node \\(i\\) has received. A tombstone \\(r\\) satisfies the **global acknowledgement condition** — and is safe to remove — when:*

{% katex(block=true) %}
\text{safe}(r) \;\iff\; d_r = 1 \;\wedge\; \min_{j \in V}\, A_j[\text{site}(r)] \geq \text{seq}(r)
{% end %}

*The pruning operation removes all {% katex() %}\text{safe}(r){% end %} records from \\(\mathcal{S}\\) and re-points parent references in surviving records to the nearest non-pruned ancestor, preserving the causal chain for all live characters. Pruning is triggered when RGA memory consumption exceeds {% katex() %}B_{\mathrm{RGA}}/2{% end %} — the half-budget threshold from the memory budget enforcement above.*

**Permanent-failure case**: If a node's acknowledgment vector has not advanced for {% katex() %}T_{\text{ack-stale}}{% end %} seconds (recommended default: twice the Weibull P95 partition duration, Definition 66), treat that node as having acknowledged all prior tombstones: advance its ack to the global maximum before evaluating the pruning condition. This prevents RGA memory deadlock when a node suffers a hardware casualty rather than a temporary partition. {% katex() %}T_{\text{ack-stale}}{% end %} must be set conservatively larger than the longest anticipated recoverable partition.

*Interaction with Byzantine ejection*: A soft-ejected node ([Definition 59](@/blog/2026-01-22/index.md#def-59)) remains in the RGA acknowledgment set — ejection removes it from merge decisions (\\(w_j \leftarrow 0\\)) but does not remove it from gossip participation. A live ejected node continues to send ack confirmations normally; no tombstone deadlock arises from ejection alone. The T_ack-stale rule applies when an ejected node is *also* partitioned or suffers a hardware casualty — in that case, both conditions are handled identically by the staleness timeout above.

<span id="prop-31"></span>
**Proposition 31** (Tombstone Pruning Safety Bound). *In an \\(n\\)-node fleet with {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} rate \\(\lambda\\), mesh diameter \\(D\\), and per-message loss probability {% katex() %}p_{\mathrm{loss}}{% end %}, the expected time until a tombstone satisfies the global acknowledgement condition is bounded by the convergence time from Proposition 26. At steady state, the unpruned tombstone count and memory footprint satisfy:*

{% katex(block=true) %}
N_{\text{tombstone}} \leq r_{\text{del}} \cdot \frac{2D\ln n}{\lambda\,(1 - p_{\text{loss}})}, \qquad
M_{\text{tombstone}} = B_r \cdot N_{\text{tombstone}}
{% end %}

*where {% katex() %}r_{\mathrm{del}}{% end %} is the fleet-wide deletion rate (deletions per second) and \\(B_r\\) is the per-record byte cost (site + seq + parent pointer + flags). Proof: by Proposition 26, acknowledgement propagates to all nodes within {% katex() %}T_{\mathrm{conv}} = 2D\ln n / (\lambda(1-p_{\mathrm{loss}})){% end %} seconds with probability \\(\geq 1 - 1/n\\). Tombstones younger than {% katex() %}T_{\mathrm{conv}}{% end %} are unprunable; older ones satisfy the safe condition. The steady-state count follows from Little's Law (\\(N = r \cdot T\\)). \\(\square\\)*

**{% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} calibration** (\\(n = 12\\), \\(D = 3\\), {% katex() %}p_{\mathrm{loss}} = 0.1{% end %}, {% katex() %}\lambda = 1\,\text{Hz}{% end %}, {% katex() %}r_{\mathrm{del}} = 2\,\text{s}^{-1}{% end %}, {% katex() %}B_r = 24\,\text{bytes}{% end %}):

{% katex(block=true) %}
N_{\text{tombstone}} \leq 2 \times \frac{2 \cdot 3 \cdot \ln 12}{1.0 \cdot 0.9} \approx 17\;\text{records}
\quad\Longrightarrow\quad 17 \times 24 = 408\;\text{bytes}
{% end %}

Negligible under normal operation. The risk materialises during extended partitions: a 30-minute offline period at {% katex() %}r_{\mathrm{del}} = 2\,\text{s}^{-1}{% end %} accumulates \\(2 \times 1800 = 3600\\) tombstones, approximately 86KB — crossing the {% katex() %}B_{\mathrm{RGA}}/2{% end %} pruning threshold and triggering the archival step (step 4 of the memory budget enforcement above).

> **Physical translation**: A deletion record (tombstone) is safe to compact only after every live node has confirmed receipt. Pruning too early — before an offline node catches up — would make the deleted item "reappear" when that node reconnects. The safety bound defines the minimum observation window before garbage collection.

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

**Assumption Set** {% katex() %}\mathcal{A}_{MW}{% end %}: RGA for text, G-Counter for quantities, LWW for metadata, semantic conflict detection for measurements.

**Automatic merge rate bound**: Conflicts occur when:
1. Same text position edited (probability {% katex() %}p_{\text{collision}} = P(i = j | \text{concurrent edits}){% end %})
2. Measurement discrepancy exceeds tolerance (probability {% katex() %}p_{\text{discrepancy}}{% end %})

The automatic merge succeeds when neither collision event occurs; the union bound gives the conservative lower bound {% katex() %}1 - p_{\text{collision}} - p_{\text{discrepancy}}{% end %} by treating the two failure modes as independent.

{% katex(block=true) %}
P(\text{auto\_merge}) = (1 - p_{\text{collision}}) \cdot (1 - p_{\text{discrepancy}}) \geq 1 - p_{\text{collision}} - p_{\text{discrepancy}}
{% end %}

For disjoint work regions ({% katex() %}p_{\text{collision}} \approx 0{% end %}) and consistent measurement technique ({% katex() %}p_{\text{discrepancy}} < 0.01{% end %}): {% katex() %}P(\text{auto\_merge}) > 0.99{% end %}.

**Data loss bound**: Under {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} semantics, {% katex() %}P(\text{data\_loss}) = 0{% end %} by construction - all operations merge via semilattice join.

**Utility improvement**: {% katex() %}\Delta U = T_{\text{wait}} \cdot V_{\text{productivity}}{% end %}, where {% katex() %}T_{\text{wait}}{% end %} is eliminated waiting time for connectivity.

> **Cognitive Map**: Authority tiers convert the "who wins" decision from an ad-hoc judgment into a pre-agreed structure. The four tiers (node, cluster, fleet, command) map directly to the scope of each decision's effects. The key insight from Proposition 15 and the MULTIWRITE scenario: authority delegation is bounded in both scope and time — the cluster lead receives \\(\mathcal{Q}_2\\) authority *for partition duration* \\(\tau\\), with the delegated authority expiring automatically on reconnection. The VCG mechanism and Nash bargaining extension make the delegation incentive-compatible: nodes cannot improve their outcome by misreporting their decision scope. Next: when reconnection occurs, the reconciliation protocol must efficiently identify and merge the divergent state accumulated during partition.

---

## Reconnection Protocols

**Problem**: When two clusters reconnect after partition, they may have hours of diverged state. Exchanging the full state is too expensive on bandwidth-constrained links. The protocol must identify only the divergent items, transfer them efficiently, and handle re-partition mid-sync gracefully.

**Solution**: Merkle tree reconciliation identifies the \\(k\\) divergent items in \\(O(k \log(n/k) + k)\\) messages rather than \\(O(n)\\). Delta-Sync then transfers only the changes. HLC timestamps provide causal ordering without NTP, enabling correct LWW resolution under clock drift.

**Trade-off**: Merkle reconciliation is efficient for sparse divergence (small \\(k\\)). When \\(k\\) approaches \\(n\\) (full divergence after a long burst partition), a full state copy is cheaper than Merkle traversal. The burst-corrected divergence model (Proposition 12b) determines which regime a given deployment falls in.

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

> **Physical translation**: Doubling the fleet roughly doubles the sync cost for small divergences (\\(O(k \log n)\\) scales slowly in \\(n\\)), but doubling the divergence itself doubles the cost directly (\\(O(k)\\) factor). At fleet scale this means a 100-vehicle fleet with 5 divergent items needs ~35 messages; a 200-vehicle fleet with the same 5 divergent items needs only ~38 messages — nearly identical. But 100 divergent items in a 100-vehicle fleet needs ~700 messages. The practical implication: keep partition durations short to bound \\(k\\), not fleet size.

*Proof*: The Merkle tree has height \\(O(\log n)\\). In each traversal round, parties exchange hashes for differing subtrees. At depth \\(i\\), at most \\(\min(k, 2^i)\\) subtrees differ. Traversal terminates after \\(O(\log(n/k))\\) levels, when each subtree contains at most one divergent item, yielding \\(O(k \log(n/k))\\) hash comparisons. Adding \\(O(k)\\) data transfers gives total message complexity \\(O(k \log(n/k) + k)\\). When all \\(k\\) divergences fall within a single subtree (spatially concentrated case — common when related state keys are grouped), the traversal depth is \\(O(\log n)\\) regardless of \\(k\\), reducing total complexity to \\(O(\log n + k)\\). For sparse divergence (\\(k \ll n\\)), {% katex() %}k \log(n/k) \approx k \log n{% end %} provides the general upper bound.

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

**Phase 1 — Fingerprint exchange** (fixed overhead \\(C_F\\) bytes regardless of state size): Node \\(i\\) transmits a compact fingerprint {% katex() %}\Psi_i = (\vec{V}_i, \vec{h}_i){% end %}, where \\(\vec{V}_i\\) is \\(i\\)'s current vector clock and \\(\vec{h}_i\\) is the vector of Merkle hash roots for each priority tier. Node \\(j\\) reciprocates. Total fingerprint cost: \\(2C_F\\) bytes, completing in \\(2C_F / B\\) seconds.

**Phase 2 — Priority-ordered delta generation**: For each priority tier {% katex() %}k \in \{1,2,3,4\}{% end %}, node \\(i\\) computes the tier-\\(k\\) delta:

{% katex(block=true) %}
\Delta_k = \bigl\{\, s \in \mathcal{S}_k \;\big|\; V_i[\text{site}(s)] > V_j[\text{site}(s)] \bigr\}
{% end %}

Items are serialized in tier order — all \\(\Delta_1\\) items first, then \\(\Delta_2\\), then \\(\Delta_3\\), then \\(\Delta_4\\). Each item is self-contained, carrying its own causal identifier ({% katex() %}\mathrm{id} = (\mathrm{site}, \mathrm{seq}){% end %} from Definition 30) and its full {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} value.

**Phase 3 — Windowed transmission**: Items from the serialized delta are transmitted in priority order. Transmission halts cleanly at the end of the connectivity window. Because each item is self-contained, a partial sync leaves the recipient in a consistent state — no item is ever half-applied.

> **Physical translation**: Only the state differences are synced — not the full state snapshot. If two CONVOY vehicles have 10,000 shared state entries but only 500 changed during a 6-hour partition, only those 500 entries (plus the 64-byte fingerprint) cross the link. The ratio of changed to total state is the bandwidth reduction factor: 5% update fraction yields \\(20\times\\) less data transferred versus a full-state exchange.

<span id="prop-32"></span>
**Proposition 32** (Delta-Sync Coverage Bound). *Given window \\(T_W\\), bandwidth \\(B\\), fingerprint overhead \\(C_F\\), and per-item byte cost \\(b_k\\) at tier \\(k\\), the number of tier-1 items transmitted in a single window is:*

{% katex(block=true) %}
n_1^{\max} = \left\lfloor \frac{B \cdot T_W - 2\,C_F}{b_1} \right\rfloor
{% end %}

*Priority-2 items begin only after all priority-1 items are transmitted, and so on. The minimum window for full-tier coverage is:*

{% katex(block=true) %}
T_W^* = \frac{2\,C_F + \sum_{k=1}^{4} S_k}{B}
{% end %}

*where \\(S_k\\) is the byte size of \\(\Delta_k\\). Proof: Phase 1 consumes \\(2C_F\\) bytes. The remaining \\(B \cdot T_W - 2C_F\\) bytes are allocated to delta items in priority order. {% katex() %}n_1^{\max}{% end %} follows from integer division. \\(T_W^\*\\) is the window at which all tiers fit. \\(\square\\)*

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calibration** (\\(T_W = 5\\,\text{s}\\), {% katex() %}B = 250\,\text{kbps}{% end %}, {% katex() %}C_F = 64\,\text{bytes}{% end %}):

Available for state sync: {% katex() %}31250 \times 5 - 2 \times 64 = 156{,}122\,\text{bytes} \approx 152\,\text{KB}{% end %}.

| Tier | Content | Size | Synced in 5 s? |
| :--- | :--- | :--- | :--- |
| 1 — Safety-critical | Threat locations, node liveness | 2 KB | Yes — first 0.06 s |
| 2 — Mission-critical | Objective status, positions | 12 KB | Yes — first 0.4 s |
| 3 — Operational | Sensor readings, health metrics | 40 KB | Yes — first 1.7 s |
| 4 — Audit and logging | Decision logs, timestamps | 80 KB | Yes — first 4.3 s |

At 250 kbps, {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} achieves full-state sync in 4.3 seconds — inside the 5-second window. Under partial jamming at 50 kbps: {% katex() %}6{,}250 \times 5 \approx 30\,\text{KB}{% end %} available, covering tiers 1 and 2 with 16 KB to spare. Safety-critical and mission-critical state converges even under heavy jamming; audit logs queue for the next window.

**Why self-contained items matter**: If the window closes mid-transmission, untransmitted items remain in {% katex() %}\Delta_{i \to j}{% end %} for the next window. Transmitted items are applied atomically on receipt. The receiver's state is always the union of fully-applied {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} records — never a partial merge — because each delta item is a complete causal record, not a raw byte fragment.

> **Physical translation**: Only changed items are transmitted on reconnection — but coverage is guaranteed. A node that missed 1,000 updates during a partition receives exactly those 1,000 delta-mutants, not a full state dump. Sync overhead grows with edit count, not total state size.

### Causality Header: Zero-Overhead HLC Integration

The Delta-Sync fingerprint {% katex() %}\Psi_i = (\vec{V}_i, \vec{h}_i){% end %} from Definition 31 already travels in Phase 1. Embedding the HLC state and clock-trust signal into this fingerprint costs 10 additional bytes — absorbed entirely within the constant {% katex() %}C_F{% end %} — leaving per-item and per-packet structure unchanged.

<span id="def-99"></span>

**Definition 99** (Causal Packet Header). *The extended fingerprint {% katex() %}\tilde{\Psi}_i{% end %} augments Definition 31's {% katex() %}\Psi_i{% end %} with a 10-byte Causality Header:*

{% katex(block=true) %}
\tilde{\Psi}_i = \Bigl(\underbrace{\vec{V}_i}_{\text{vector clock}},\;\underbrace{\vec{h}_i}_{\text{Merkle roots}},\;\underbrace{l_i}_{\text{HLC watermark (4 B)}},\;\underbrace{c_i}_{\text{HLC counter (2 B)}},\;\underbrace{T_{\mathrm{acc},\,i}}_{\text{partition age (4 B)}}\Bigr)
{% end %}

*On receiving {% katex() %}\tilde{\Psi}_j{% end %} from peer {% katex() %}j{% end %}, node {% katex() %}i{% end %} immediately determines — with no additional round-trips:*

- *Whether {% katex() %}j{% end %}'s clock is trusted:* {% katex() %}T_{\mathrm{acc},j} \leq T_{\mathrm{trust}}{% end %} *(Definition 98) — selects {% katex() %}\prec{% end %} vs {% katex() %}\prec_{\mathrm{logic}}{% end %} before applying any delta*
- *{% katex() %}j{% end %}'s current HLC state:* {% katex() %}(l_j, c_j){% end %} *for the receive-update rule of Definition 40*
- *Whether Drift-Quarantine (Definition 42) is required:* {% katex() %}|l_j - l_i| > \varepsilon + \tau_{\max}{% end %} *— quarantine before accepting any delta item*

| Field | Size | Source | Receiver action |
| :--- | :--- | :--- | :--- |
| {% katex() %}l_i{% end %} — HLC watermark | 4 B | Definition 40 send rule | Apply receive rule of Def 40; check anomaly condition of Prop 41 |
| {% katex() %}c_i{% end %} — HLC counter | 2 B | Definition 40 send rule | Merge into local HLC counter |
| {% katex() %}T_{\mathrm{acc},\,i}{% end %} — partition age | 4 B | {% katex() %}T_{\mathrm{acc}}{% end %} accumulator (Def 68) | Select {% katex() %}\prec{% end %} vs {% katex() %}\prec_{\mathrm{logic}}{% end %} (Def 98); decide quarantine (Def 42) |
| **Total** | **10 B** | — | Absorbed into {% katex() %}C_F{% end %}; zero per-item overhead |

- **Computes**: Three-signal causality header (HLC state, clock trust, quarantine decision) embedded in the Phase 1 fingerprint; 10 B total addition to {% katex() %}C_F{% end %}.
- **Apply when**: Replace Definition 31's {% katex() %}\Psi_i{% end %} with {% katex() %}\tilde{\Psi}_i{% end %} at every reconnection handshake; no per-delta-item changes required.
- **Parameters**: {% katex() %}l_i{% end %}, {% katex() %}c_i{% end %} from Definition 40 send rule; {% katex() %}T_{\mathrm{acc},i}{% end %} from Definition 68 accumulator; all three fields updated at each MAPE-K tick.
- **Prevents**: Clock-blindness on reconnect — without {% katex() %}T_{\mathrm{acc}}{% end %} in the fingerprint, the receiver cannot determine whether incoming HLC timestamps are trustworthy before applying 30 days of accumulated deltas.

<span id="prop-75"></span>

**Proposition 75** (Causality Header Overhead Bound). *Adding the 10-byte Causality Header to the Definition 31 fingerprint increases {% katex() %}C_F{% end %} by 10 bytes. The coverage loss relative to Proposition 32 is:*

{% katex(block=true) %}
\Delta n_1^{\max} = \left\lfloor \frac{B \cdot T_W - 2\,(C_F + 10)}{b_1} \right\rfloor - \left\lfloor \frac{B \cdot T_W - 2\,C_F}{b_1} \right\rfloor = -\left\lfloor \frac{20}{b_1} \right\rfloor \geq -1
{% end %}

*For any {% katex() %}b_1 \geq 20\,\text{bytes}{% end %} (minimum self-contained causal record), the coverage loss is zero items. For {% katex() %}b_1 = 16\,\text{bytes}{% end %} (minimum viable record: site\_id 2 B + seq 4 B + HLC 6 B + CRDT value 4 B), the loss is at most 1 item per window.*

*Proof.* The window budget changes from {% katex() %}B \cdot T_W - 2C_F{% end %} to {% katex() %}B \cdot T_W - 2(C_F + 10) = B \cdot T_W - 2C_F - 20{% end %}. Coverage loss is exactly {% katex() %}\lfloor 20 / b_1 \rfloor{% end %} items. At {% katex() %}b_1 = 16\,\text{B}{% end %}: loss is {% katex() %}\lfloor 20/16 \rfloor = 1{% end %} item. \\(\square\\)

| Scenario | {% katex() %}C_F{% end %} before | {% katex() %}C_F + 10{% end %} | {% katex() %}B \cdot T_W{% end %} | Coverage loss | Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CONVOY (250 kbps, 5 s) | 64 B | 74 B | 156 KB | 1 item (16 B) | < 0.01% |
| OUTPOST (9.6 kbps, 30 s) | 64 B | 74 B | 36 KB | 1 item (16 B) | < 0.05% |
| RAVEN (1 Mbps, 2 s) | 64 B | 74 B | 250 KB | 1 item (16 B) | < 0.01% |

- **Computes**: Exact item-count coverage loss from adding the 10-byte Causality Header to the Phase 1 fingerprint.
- **Apply when**: Confirming the Causality Header is acceptable before updating the wire format to {% katex() %}\tilde{\Psi}_i{% end %}.
- **Parameters**: {% katex() %}b_1{% end %} from the delta-item encoding spec (minimum 16 B for a viable causal record); {% katex() %}C_F{% end %}, {% katex() %}B{% end %}, {% katex() %}T_W{% end %} from deployment configuration.
- **Prevents**: MTU surprise — engineers assume any header addition linearly costs throughput; this proposition proves the impact is bounded to 1 item per 5-second reconnection window across all deployment scenarios.

### Unified Autonomic Header: Synthesis of Three Fixes

<span id="def-100-uah"></span>

Definitions 98 and 99 (Clock Fix), the Nonlinear Safety Guardrail from [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#prop-80) (Stability Fix), and the Zero-Tax Hash Chain from [The Constraint Sequence and the Handover Boundary](@/blog/2026-02-19/index.md#def-102) (Resource Fix) each add fields to the gossip fingerprint. Rather than three independent headers, they compose into a single 20-byte **Unified Autonomic Header (UAH)** — the concrete answer to the three structural design constraints introduced in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md).

<span id="def-100"></span>

**Definition 100** (Unified Autonomic Header). *The UAH is a 20-byte field appended to the Phase 1 fingerprint of Definition 99, structured as follows:*

{% katex(block=true) %}
\underbrace{l_i\;(4\,\text{B}),\;c_i\;(2\,\text{B}),\;T_{\mathrm{acc},i}\;(4\,\text{B})}_{\text{Clock Fix — Def 99}},\quad
\underbrace{\rho_{q,i}\;(1\,\text{B}),\;q_i\;(1\,\text{B})}_{\text{Stability Fix}},\quad
\underbrace{h_{\mathrm{sfx},i}\;(4\,\text{B})}_{\text{Resource Fix}},\quad
\underbrace{\mathtt{flags}_i\;(1\,\text{B}),\;\mathtt{pad}\;(3\,\text{B})}_{\text{control}}
{% end %}

| Offset | Field | Size | Source | Receiver action |
| :--- | :--- | :--- | :--- | :--- |
| 0–3 | {% katex() %}l_i{% end %} — HLC watermark | 4 B | Definition 40 send rule | Apply Def 40 receive rule; check Prop 41 anomaly condition |
| 4–5 | {% katex() %}c_i{% end %} — HLC counter | 2 B | Definition 40 send rule | Merge into local HLC counter |
| 6–9 | {% katex() %}T_{\mathrm{acc},i}{% end %} — partition age | 4 B | Definition 68 accumulator | Select {% katex() %}\prec{% end %} vs {% katex() %}\prec_{\mathrm{logic}}{% end %} (Def 98); decide quarantine (Def 42) |
| 10 | {% katex() %}\rho_{q,i}{% end %} — CBF margin | 1 B | Prop 80, Q0.8 encoding | Check NSG veto; {% katex() %}\rho_{q,i} = 0{% end %} means outside safe set |
| 11 | {% katex() %}q_i{% end %} — mode index | 1 B | Capability level L0–L4 | Skip high-severity healing requests if {% katex() %}q_i = 0{% end %} (OBSERVE) |
| 12–15 | {% katex() %}h_{\mathrm{sfx},i}{% end %} — hash suffix | 4 B | Definition 83 chain suffix | Compare to local suffix; divergence within one tick = metric corruption |
| 16 | {% katex() %}\mathtt{flags}_i{% end %} | 1 B | Computed each tick | See flag table below |
| 17–19 | padding | 3 B | — | 4-byte boundary alignment |

*Flag byte {% katex() %}\mathtt{flags}_i{% end %}:*

| Bits | Name | Meaning |
| :--- | :--- | :--- |
| 0 | `trust_flag` | 1 when {% katex() %}T_{\mathrm{acc},i} \leq T_{\mathrm{trust}}{% end %} — physical clock trusted; use full HLC {% katex() %}\prec{% end %} |
| 2:1 | `zt_state` | 00 = OBSERVE, 01 = WAKEUP, 10 = ACTIVE ([Definition 101](@/blog/2026-02-19/index.md#def-101) Zero-Tax state) |
| 3 | `nsg_veto` | 1 when {% katex() %}\rho_{q,i} < 0{% end %} — sender outside CBF safe set; {% katex() %}K_{\mathrm{gs}} = 0{% end %} enforced |
| 7:4 | reserved | Must be zero |

The three fixes are mutually reinforcing: a receiver seeing `zt_state = 00` (OBSERVE) knows simultaneously that the sender's vector clock is frozen (no delta items expected), the hash suffix is the sole integrity signal, and {% katex() %}K_{\mathrm{gs}} = 0{% end %} on the sender — no healing requests should be directed to it. A receiver seeing `nsg_veto = 1` suppresses high-severity healing requests regardless of the local anomaly score {% katex() %}z_t{% end %}. A receiver seeing `trust_flag = 0` applies {% katex() %}\prec_{\mathrm{logic}}{% end %} to all sender deltas before merging.

- **Computes**: 20-byte synthesis of Clock Fix (HLC + {% katex() %}T_{\mathrm{acc}}{% end %}), Stability Fix (CBF margin + mode index), and Resource Fix (hash suffix + Zero-Tax state).
- **Apply when**: Replace Definition 99's {% katex() %}\tilde{\Psi}_i{% end %} with the UAH at every gossip exchange; all fields updated at each MAPE-K tick.
- **Parameters**: {% katex() %}\rho_{q,i}{% end %} encoded as unsigned byte (0 = margin 0.0, 255 = margin 1.0); {% katex() %}h_{\mathrm{sfx},i}{% end %} = last 4 bytes of Definition 83 chain; {% katex() %}q_i \in \{0,1,2,3,4\}{% end %} matching L0–L4.
- **Prevents**: Header proliferation — three independent fixes would grow the fingerprint by 16 B with redundant alignment; the UAH absorbs all three into 20 B with a single 3-byte pad.

> **Scope of the UAH's causal ordering guarantee — 20 bytes cannot hold a 47-node vector clock**: The UAH is not a compressed vector clock. The `c_i` field (2 B) is the HLC sub-second disambiguator: it increments only when two events share the same physical second, and resets to zero at the next clock tick. Under typical MAPE-K operation (5 s/tick), `c_i ∈ {0, 1}` at almost every tick — 2 bytes is not a constraint in practice.
>
> **The counter-wrap risk lives in `vec{V}_i`, not in the UAH.** Under `≺_logic` (physical clock untrusted, `T_acc > T_trust`), the system discards `l_i` and orders events by `(c_i, n_i)`. Because `c_i` resets every second, this ordering has no cross-second resolution: a day-1 event and a day-29 event can both have `c_i = 0` and be indistinguishable under `≺_logic` alone. The mechanism that provides day-level causal ordering is the vector clock `vec{V}_i` — the separate, variable-size component of the Phase 1 fingerprint, not part of the 20-byte UAH.
>
> For RAVEN (47 drones), `vec{V}_i` is a 4-byte-per-node integer vector (188 bytes at full size). The bandwidth analysis above shows this exceeds the link budget; the mitigation — dotted version vectors at 8 clusters \\(\times\\) 4-byte counters = 64 bytes — preserves causal ordering at cluster granularity. **Counter-wrap check at mission timescale**: at 200 updates/min from ~6 drones per cluster, the per-cluster sequence number accumulates {% katex() %}200 \times 1{,}440 \times 30 \approx 8.6\,\text{M}{% end %} events over 30 days. A 4-byte counter holds 4.29 B — no wrap for a 30-day mission. If 1-byte counters were erroneously substituted (255 max), the first wrap would occur in 255 / 200 min \\(\approx\\) **77 seconds**, and over 30 days each counter would wrap \\(\approx\\) 33,880 times, producing false causal links on reconnection that could overwrite 30 days of valid data with a stale update that happens to carry a higher wrapped-index.
>
> **OUTPOST deployment timescale — the Day-497 bug**: RAVEN is mission-bound to 30 days; OUTPOST is a persistent installation operating for months to years. A "hot" sensor node running high-frequency telemetry (100 Hz — plausible for seismic or acoustic threat detection) generates 6,000 events/min. Its per-cluster sequence number wraps at {% katex() %}4{,}294{,}967{,}295 / 6{,}000 \approx 716{,}000\,\text{min}{% end %} \\(\approx\\) **497 days**. On Day 498, the counter wraps to low values. When the fusion node next reconciles, it sees the cluster's sequence number as apparently smaller than its last known value and — without wrap-detection — treats all post-wrap events as causally prior, potentially overwriting 497 days of current state with stale data.
>
> **Stale Vector Counter (SVC) quarantine**: During Phase 1 fingerprint exchange, apply sequence-number arithmetic (RFC 1323 Sec. 3 — the same technique TCP uses to detect wrapped sequence numbers) to each cluster entry received:
>
> {% katex(block=true) %}\text{suspect\_wrap}(k) = \bigl(V_{\mathrm{recv}}[k] - V_{\mathrm{last}}[k]\bigr) \bmod 2^{32} > 2^{31}{% end %}
>
> A received counter that appears to have *decreased* by more than \\(2^{31}\\) modulo the counter width is flagged as a suspected wrap. Response mirrors the Drift-Quarantine Re-sync Protocol (Definition 42): (1) enter read-only mode for node \\(k\\)'s state; (2) broadcast a **counter-epoch request** to peer nodes — any peer whose last-known sequence for \\(k\\) is near \\(2^{32}\\) (within \\(2^{29}\\)) confirms the wrap; (3) if quorum confirms, increment an **epoch counter** \\(e_k\\) stored out-of-band and re-order events as \\((e_k, V[k])\\) tuples — the epoch promotes all post-wrap events above all pre-wrap events; (4) exit quarantine when all local entries are epoch-consistent with the quorum.
>
> **Deployment decision**: for OUTPOST, either (a) use 8-byte sequence counters in the dotted version vector — wraps at {% katex() %}4.29\text{ B} \times 2^{32} / 6{,}000\,\text{min} \approx 305{,}000\,\text{years}{% end %}, problem eliminated; or (b) deploy the SVC quarantine above with 4-byte counters and accept the minor coordination cost on Day 497. For RAVEN, 4-byte counters are sufficient without quarantine at all mission-relevant timescales.
>
> The UAH's `trust_flag` and `T_acc` fields signal *which* ordering to use; the vector clock `vec{V}_i` is the ordering mechanism itself. Both are required. The UAH alone, without `vec{V}_i`, provides only within-second causal disambiguation — correct for clock-trust signaling and HLC integration, but insufficient for post-partition reconciliation of multi-day accumulated state.

### Reconnection Storm Mitigation

Definition 31 assumes bandwidth \\(B\\) is known a priori and the link remains stable throughout the sync window. In practice, the first opportunistic uplink after a long Weibull partition is marginal — MANET RF at the edge of coverage, or a satellite bounce during a brief atmospheric window. Transmitting the full {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} state before measuring the link saturates the channel before any critical state is exchanged. Four extensions close this gap in sequence: a formal delta-state CRDT (Definition 72) reduces payload size; a pre-sync bandwidth probe (Definition 73) measures \\(\hat{B}\\) before Phase 1 of Definition 31; a QoS byte budget (Definition 74) translates \\(\hat{B}\\) into guaranteed tier allocations; and an exponential backoff condition (Proposition 61) detects link saturation mid-sync and pauses before destabilizing the uplink.

<span id="def-72"></span>

**Definition 72** (Delta-State {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} Mutant). For a join-semilattice \\((S, \sqcup)\\) (Definition 12), the **delta mutant** for operation \\(m\\) applied at state \\(x \in S\\) is the minimal sub-state satisfying:

{% katex(block=true) %}
\delta_m^x = \inf\!\bigl\{\, d \in S \;\big|\; d \sqcup x = m(x) \bigr\}
{% end %}

- **Use**: Extracts the minimal lattice sub-state produced by one mutation for transmission in place of full state; accumulate delta groups since the last sync epoch to prevent full-state retransmission on every sync regardless of how few fields changed.
- **Parameters**: CONVOY sparse updates: update fraction {% katex() %}f \approx 5\%{% end %} of full state {% katex() %}\to 20\times{% end %} bandwidth reduction per sync cycle (\\(\delta_m^x\\) notation follows Def 72; \\(f\\) is the sparse-update fraction, distinct from Def 11 state divergence \\(D\\)).
- **Field note**: Delta extraction only pays when batching multiple mutations per transmission — individual deltas still carry full message header overhead.
- **Dot-kernel connection**: In Shapiro et al.'s dot-kernel representation, each lattice element carries a **dot** — a pair \\((i, e)\\) where \\(i\\) is the node identifier and \\(e\\) is a per-node event counter. The delta mutant \\(\delta_m^x\\) produced by mutation \\(m\\) at node \\(i\\) corresponds to generating exactly one new dot \\((i, e)\\): the minimal sub-state containing that dot and no others. The delta group {% katex() %}\Delta_i^{(e)}{% end %} is then the **dot store** — the join of all dots generated at node \\(i\\) since epoch \\(e\\). This correspondence makes causal context explicit in every delta transmission without requiring a full vector clock per message: the receiver can reconstruct which dots it is missing from {% katex() %}\Delta_i^{(e)}{% end %} alone, without exchanging a \\(|N|\\)-dimensional clock vector.

> **Physical translation**: Only the changed portion of the CRDT state is transmitted, not the full state. A vehicle that updated 500 of its 10,000 position-history entries during a partition transmits those 500 entries as a delta group — not all 10,000. The semilattice join guarantees the peer can merge the delta group into its own state correctly without receiving the unchanged 9,500 entries.

> **Notation note.** \\(\delta_m^x\\) denotes the delta-state CRDT structure. This is distinct from the staleness decay function \\(\delta(t_{\text{stale}})\\) defined in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-116); the shared \\(\delta\\) symbol is disambiguated by subscript.

The **delta group** accumulated since sync epoch \\(e\\) is the join of all delta mutants produced by mutations \\(m_1, m_2, \ldots\\) applied at states \\(x_1, x_2, \ldots\\) since \\(e\\):

{% katex(block=true) %}
\Delta_i^{(e)} = \bigsqcup_{t > e}\, \delta_{m_t}^{x_t}
{% end %}

Three properties follow from the semilattice structure: (1) **Correctness** — {% katex() %}\Delta_i^{(e)} \sqcup s_j = m_n(\cdots m_1(s_j) \cdots){% end %} for any {% katex() %}s_j \leq s_i^{(e)}{% end %}; (2) **Size bound** — {% katex() %}|\Delta_i^{(e)}| \leq |S|{% end %} always; (3) **Sparse reduction** — for updates covering fraction \\(f\\) of \\(S\\), {% katex() %}|\Delta_i^{(e)}| \approx f \cdot |S|{% end %}. Definition 31 Phase 2 implicitly constructs {% katex() %}\Delta_i^{(e)}{% end %} via vector-clock comparison; Definition 72 makes the delta-state structure explicit, enabling MCU-local delta storage without retaining the full join history.

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calibration**: 10,000-entry {% term(url="#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} state ({% katex() %}|S| = 640\,\text{KB}{% end %}); 500 entries updated during a 6.7 hr partition (\\(f = 0.05\\)). Definition 72 reduces Phase 2 payload from 640 KB to {% katex() %}\approx 32\,\text{KB}{% end %} — a \\(20\times\\) reduction, shifting from a 20-second sync at 250 kbps to under 1 second.

<span id="def-73"></span>

**Definition 73** (Link Bandwidth Probe). A **bandwidth probe** fires at link detection, completing before Definition 31 Phase 1. The probe consists of a single request-response pair: transmit a probe packet of {% katex() %}L_{\text{probe}}{% end %} bytes (default: 512 bytes), record {% katex() %}\mathrm{RTT}_{\text{probe}} = t_{\text{ACK}} - t_{\text{send}}{% end %}. The instantaneous bandwidth estimate is:

{% katex(block=true) %}
\hat{B}_{\text{sample}} = \frac{L_{\text{probe}} \cdot 8}{\mathrm{RTT}_{\text{probe}}}
{% end %}

- **Use**: Estimates current bandwidth from a 512-byte probe with {% katex() %}\alpha{% end %}-EMA smoothing before each reconnection sync session; prevents link saturation from transmitting a full Merkle fingerprint over a marginal link without first knowing its actual capacity.
- **Parameters**: {% katex() %}L_{\text{probe}} = 512{% end %} bytes; {% katex() %}\alpha = 0.25{% end %} EMA factor; fall back to {% katex() %}B_{\min} = 9.6{% end %} kbps if RTT {% katex() %}> 2{% end %} s or {% katex() %}\hat{B} < B_{\min}{% end %}.
- **Field note**: Probe at every reconnect — link quality after a partition is routinely worse than before it and must be re-measured each time.

Updated via \\(\alpha\\)-exponential moving average across successive probe windows:

{% katex(block=true) %}
\hat{B}_{n} = \alpha\,\hat{B}_{\text{sample}} + (1 - \alpha)\,\hat{B}_{n-1}, \quad \alpha = 0.25
{% end %}

If {% katex() %}\mathrm{RTT}_{\text{probe}} > T_{\text{timeout}}{% end %} (default: 2 s) or {% katex() %}\hat{B}_{n} < B_{\min}{% end %} (default: 9.6 kbps): set {% katex() %}\hat{B}_{n} = B_{\min}{% end %} and flag as **marginal link** — only Service Level \\(\mathcal{L}_1\\) items (Definition 74) are transmitted. Probe cost: {% katex() %}L_{\text{probe}} + L_{\text{ACK}} \leq 560{% end %} bytes, 1 RTT — negligible against any usable link.

<span id="def-74"></span>

**Definition 74** (QoS Byte Budget). Note: 'service level' here refers to capability-level tiers (\\(\mathcal{L}_1\\)–\\(\mathcal{L}_4\\) from [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md)), not the authority-tier concept (\\(Q_j\\) from Definition 14). Given probed bandwidth \\(\hat{B}\\) and connectivity window \\(T_W\\), the **total byte budget** (fingerprint overhead pre-deducted per Definition 31 Phase 1) is:

{% katex(block=true) %}
\Omega = \hat{B} \cdot T_W - 2\,C_F
{% end %}

- **Use**: Computes usable bytes for the current sync window after subtracting two-way framing overhead; allocate by service level immediately after probing to prevent Service Level \\(\mathcal{L}_1\\) critical state from being crowded out by large lower-priority deltas.
- **Parameters**: {% katex() %}\alpha_1=0.50,\, \alpha_2=0.25,\, \alpha_3=0.15,\, \alpha_4=0.10{% end %}; unused budget from service level {% katex() %}k{% end %} cascades to service level {% katex() %}k+1{% end %}.
- **Field note**: Cap Service Level \\(\mathcal{L}_3\\) absolute size even when cascade budget is available — the cascade rule becomes a footgun for large low-priority payloads.

> **Note**: 'service level' here refers to the capability level (\\(\mathcal{L}_0\\)–\\(\mathcal{L}_4\\)) that reserves this bandwidth allocation — distinct from the decision-scope *authority tier* (\\(\mathcal{Q}_j\\)) of Definition 14.

The budget is partitioned into service-level-reserved allocations:

| Service Level | Content | Reservation \\(\alpha_k\\) | Guaranteed bytes |
| :--- | :--- | :--- | :--- |
| \\(\mathcal{L}_1\\) (safety/control) — \\(\mathcal{L}_0\\) critical | Threat vectors, node liveness | \\(\alpha_1 = 0.50\\) | \\(0.50\\,\Omega\\) |
| \\(\mathcal{L}_2\\) (mission) — Mission | Position, objectives | \\(\alpha_2 = 0.25\\) | \\(0.25\\,\Omega\\) |
| \\(\mathcal{L}_3\\) (operational) — Operational | Sensor readings, health | \\(\alpha_3 = 0.15\\) | \\(0.15\\,\Omega\\) |
| \\(\mathcal{L}_4\\) (telemetry) — \\(\mathcal{L}_4\\) telemetry | Logs, timestamps | \\(\alpha_4 = 0.10\\) | \\(0.10\\,\Omega\\) |

Unused Service Level {% katex() %}\mathcal{L}_k{% end %} allocation cascades to {% katex() %}\mathcal{L}_{k+1}{% end %}: if \\(|\Delta_k| < \alpha_k\\,\Omega\\), the surplus \\(\alpha_k\\,\Omega - |\Delta_k|\\) is added to the Service Level \\(\mathcal{L}_{k+1}\\) budget. Critical state receives its floor regardless of link quality: at {% katex() %}\hat{B} = B_{\min} = 9.6\,\text{kbps}{% end %} with \\(T_W = 5\\,\text{s}\\), {% katex() %}\Omega \approx 6\,\text{KB}{% end %} and {% katex() %}0.50\,\Omega = 3\,\text{KB}{% end %} is reserved for threat vectors and liveness — sufficient for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}'s 2 KB Service Level \\(\mathcal{L}_1\\) delta.

> **Physical translation**: Safety-critical messages always get their 50% slice of the byte budget, even when bandwidth collapses to the minimum 9.6 kbps link. At that floor, a 5-second window yields only 6 KB total — but 3 KB is hard-reserved for threat vectors and node liveness. Audit logs and telemetry queue for the next window. The service-level system prevents a flood of operational data from crowding out the life-safety state during link degradation.

**Budget starvation**: When the total byte budget falls below the Service Level \\(\mathcal{L}_1\\) minimum reservation ({% katex() %}\alpha_1 \cdot B_{\min} \cdot T_W{% end %}), the node enters communication blackout: only L0 hardware-level heartbeats (\\(\leq 8\\) bytes/s) are permitted. All autonomic sync is suspended until {% katex() %}B_{\text{available}} > \alpha_1 \cdot B_{\min}{% end %} for two consecutive probe intervals.

<span id="prop-61"></span>

**Proposition 61** (Sync Stability Bound). During Definition 31 Phase 3, monitor ACK round-trip time {% katex() %}\mathrm{RTT}(t){% end %} continuously. A **saturation event** is declared when:

{% katex(block=true) %}
\mathrm{RTT}(t) > \beta \cdot \mathrm{RTT}_{\text{probe}}, \quad \beta = 2.0
{% end %}

On saturation event \\(n\\) (\\(n = 0, 1, 2, \ldots\\)), pause transmission for {% katex() %}T_{\text{backoff}}(n) = T_0 \cdot 2^n{% end %}, then resume from the first un-ACKed item (safe because Definition 31 items are self-contained). The total sync time satisfies:

{% katex(block=true) %}
T_{\text{total}} \leq T_{\text{sync}} + T_0 \cdot (2^{N_{\text{sat}}} - 1)
{% end %}

- **Use**: Bounds total sync duration including exponential backoff from link saturation events; verify the bound fits within the available reconnection window to prevent indefinite retransmission on a degraded link beyond the window.
- **Parameters**: {% katex() %}T_0 = 100{% end %} ms base backoff interval; {% katex() %}N_{\text{sat}}{% end %} = saturation event count per session (0–3 typical); {% katex() %}T_{\text{sync}}{% end %} = baseline sync time.
- **Field note**: Add a hard abort at {% katex() %}N_{\text{sat}} = 4{% end %} — continuing past that indicates persistent link degradation, not a transient saturation event.

where {% katex() %}T_{\text{sync}} = \Omega / \hat{B}{% end %} and {% katex() %}N_{\text{sat}}{% end %} is the number of saturation events. **Service Level \\(\mathcal{L}_1\\) safety invariant**: Service Level \\(\mathcal{L}_1\\) items transmit in the first {% katex() %}T_1 = \alpha_1\,\Omega / \hat{B}{% end %} seconds; since \\(T_1 < T_0\\) for all {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}-class links (\\(T_1 = 0.06\\,\text{s}\\), \\(T_0 = 0.1\\,\text{s}\\)), Service Level \\(\mathcal{L}_1\\) completes before the first backoff period can fire. The first backoff delays only Service Level \\(\mathcal{L}_2\\) and below.

*Proof sketch.* Each backoff period \\(T_0 \cdot 2^n\\) is bounded. The geometric sum {% katex() %}\sum_{n=0}^{N_{\text{sat}}-1} T_0 \cdot 2^n = T_0 \cdot (2^{N_{\text{sat}}} - 1){% end %} gives total backoff overhead. The Service Level \\(\mathcal{L}_1\\) safety invariant follows from the ordering guarantee of Definition 74 (Service Level \\(\mathcal{L}_1\\) transmitted first) and {% katex() %}T_1 = 0.5\,\Omega / \hat{B} \leq 0.5 \cdot T_W{% end %}, so Service Level \\(\mathcal{L}_1\\) finishes well before the first backoff fires at {% katex() %}T_0 = 100\,\text{ms}{% end %}. \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calibration** ({% katex() %}T_0 = 100\,\text{ms}{% end %}, \\(T_W = 5\\,\text{s}\\), {% katex() %}\hat{B} = 50\,\text{kbps}{% end %} marginal link): maximum tolerable saturation events before window expires — {% katex() %}N_{\text{sat}}^{\max} = \lfloor \log_2((T_W - T_{\text{sync}}) / T_0 + 1) \rfloor = \lfloor \log_2(49) \rfloor = 5{% end %}. After 5 saturation events, total backoff overhead is {% katex() %}100 \cdot (2^5 - 1) = 3{,}100\,\text{ms}{% end %}. Service Level \\(\mathcal{L}_1\\) and \\(\mathcal{L}_2\\) state (16 KB at 50 kbps \\(= 2.6\\,\text{s}\\)) is already committed; audit logs queue for the next window.

> **Physical translation**: The exponential backoff \\(T_0 \cdot 2^n\\) prevents sync storms during partition recovery. Without backoff, a congested link would cause both vehicles to retransmit simultaneously, collide, retransmit again, and lock the channel. With backoff: after the first saturation event the sender pauses 100 ms, after the second 200 ms, after the third 400 ms. The total penalty for 5 saturation events is only 3.1 seconds — well inside the 5-second window, and Service Level \\(\mathcal{L}_1\\) critical state was already committed in the first 60 ms before any backoff could fire.

> **Cognitive Map**: Reconnection protocols address three overlapping challenges: identifying what diverged (Merkle trees in \\(O(k \log n)\\)); transferring only the delta (Delta-Sync with QoS byte budget); and ordering ambiguous concurrent updates without NTP (Hybrid Logical Clocks). HLC is the linchpin: it provides causal ordering that survives partition and re-sync by combining physical and logical timestamps — LWW-Register becomes correct only with HLC, not wall-clock. The Drift-Quarantine Re-sync Protocol handles the case where clocks have drifted too far for HLC to bridge; Proposition 42 bounds the correctness condition. Delta-Sync's QoS service levels ensure safety-critical state (Service Level \\(\mathcal{L}_1\\)) completes before the first backoff event can fire. Next: even with correct reconciliation, some partition actions conflict at the semantic level and require arbitration rather than merge.

---

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

## Conflict-Aware Arbitration Layer

> **Problem**: CRDTs guarantee that state converges after reconnection — but convergence describes *what happened*, not whether what happened was efficient. Two clusters that each expend the only EOD-capable platform solve the same problem twice and leave the fleet with nothing in reserve.
> **Solution**: Add a probabilistic reservation layer that operates *before* commitment. Each node computes a claim probability from local health and divergence, samples once, and either emits an intent token or abstains. No leader required.
> **Trade-off**: The mechanism is probabilistic — it reduces but does not eliminate redundancy and omission. Under Denied connectivity the intent token cannot propagate and nodes fall back to uncoordinated baseline. Fleet size is the primary lever: doubling the cluster size halves per-node claim probability at the same fleet-level target.

The action-classification table above identifies redundant outcomes but does not prevent them. Prevention requires a coordination mechanism that operates *during* partition — before both clusters commit the same finite resource. The constraint is severe: no leader exists (leadership is an emergent property of connectivity that may be absent), and available bandwidth may be zero. The solution must be leaderless, local, and probabilistic.

### The Double-Spend Problem

<span id="scenario-double-spend"></span>

Return to {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} at the mountain pass. Before the two clusters lost contact, both knew that Sector 7 needed EOD clearance and that the convoy has exactly one EOD-capable platform (Vehicle 4). During the 47-minute partition:

- **Cluster Alpha** (Vehicles 1–6): assessed Sector 7 as the primary threat. Dispatched Vehicle 4 north. Vehicle 4 expended its full kit — 8 controlled detonations. Kit cannot be restocked until the base resupply depot is reached.
- **Cluster Bravo** (Vehicles 7–12): independently reached the same threat assessment. Attempted to dispatch Vehicle 4 — found it absent from local mesh. Concluded it had self-tasked and proceeded to Sector 7 via alternate route, deploying their own improvised countermeasures at \\(3\times\\) the time cost.

At reconnection, the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge completes correctly: both clusters' observations are reconciled, Vehicle 4's kit-expended state is propagated, and the sector-cleared event is logged. State is *consistent*. But the resource is gone, and the improvised countermeasures cost 47 additional minutes.

This is the double-spend problem. {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s guarantee convergence of *what happened* — they cannot prevent *what was done* from being wasteful. A coordination layer is needed that operates before commitment.

### Quantifying the Risk: Redundant-Omission Loss Function

<span id="def-55"></span>

**Definition 55** (Redundant-Omission Loss Function). *Let task \\(\tau_k\\) have mission value \\(v_k > 0\\) and finite resource cost \\(c_k > 0\\). Define the per-task loss:*

{% katex(block=true) %}
J(\text{redundant}) = \alpha \cdot c_k \qquad J(\text{omission}) = \beta \cdot v_k
{% end %}

*where \\(\alpha > 0\\) is the waste coefficient (marginal cost of expending a resource unnecessarily) and \\(\beta > 0\\) is the opportunity coefficient (marginal cost of failing to complete the task). The* **coordination target** *\\(p^\* \in (0, 1)\\) minimises expected fleet-wide loss per task:*

{% katex(block=true) %}
p^* = \frac{\beta \cdot v_k}{\alpha \cdot c_k + \beta \cdot v_k}
{% end %}

- **Use**: Gives the per-node claim probability that minimizes total cost by balancing redundancy waste against omission loss per task tier; configure per tier to prevent uniform-probability allocation from treating critical telemetry identically to low-priority logs.
- **Parameters**: {% katex() %}\alpha{% end %} = redundancy cost per unit; {% katex() %}\beta{% end %} = omission penalty per unit; set {% katex() %}\beta/\alpha \geq 5{% end %} for data-loss-averse workloads.
- **Field note**: In MULTIWRITE field tests, tiered {% katex() %}p^*{% end %} cut redundant writes by 40% while keeping critical-tier omission probability below 0.1%.

> **Physical translation**: \\(p^\*\\) is the mission-value-weighted fraction of total expected cost attributable to omission. If omitting the task costs five times more than wasting the resource (\\(\beta v_k = 5 \alpha c_k\\)), then \\(p^\* = 5/6 \approx 0.83\\) — act eagerly, redundancy is cheap. If the resource is irreplaceable and the task can be mitigated (\\(\alpha c_k = 9 \beta v_k\\)), then \\(p^\* = 1/10\\) — be conservative, only claim when confident. The formula converts a policy judgment (how bad is waste vs. omission?) into a dimensionless probability that every node can compute independently from its local cost estimates.

**Interpretation.** When \\(\beta v_k \gg \alpha c_k\\) — high-value task, cheap or abundant resource — \\(p^\* \to 1\\): both clusters should attempt the task and accept the possibility of redundancy. When \\(\alpha c_k \gg \beta v_k\\) — expensive or irreplaceable resource, low-value task — \\(p^\* \to 0\\): be conservative and risk omission rather than waste. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}'s EOD platform, \\(\alpha c_k \gg \beta v_k\\): the kit is irreplaceable mid-mission, and Sector 7 can be partially mitigated by other means. The correct \\(p^\*\\) is low — closer to 0.3 than 0.9.

The coefficients \\(\alpha\\) and \\(\beta\\) are fleet-wide policy parameters calibrated from post-partition audit history (Definition 57). During partition, each node uses its cached {% katex() %}(\hat{\alpha}, \hat{\beta}){% end %} pair — stale estimates are safe to use because \\(p^\*\\) is bounded in \\((0, 1)\\) regardless of coefficient drift.

### Probabilistic Reservation: Conflict-Aware Claim Probability

<span id="def-56"></span>

**Definition 56** (Conflict-Aware Claim Probability). *Let node \\(i\\) have health score \\(H_i(t) \in [0,1]\\) (from the {% term(url="@/blog/2026-01-22/index.md#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} health vector of Definition 5) and local divergence estimate \\(D_i(t) \in [0,1]\\) (a per-node scalar approximation of Definition 11's pairwise metric, computed against the node's last-known fleet consensus snapshot). The* **claim probability** *for task \\(\tau_k\\) is:*

{% katex(block=true) %}
P(a_i \mid \tau_k) = p^* \cdot H_i(t) \cdot \bigl(1 - D_i(t)\bigr)
{% end %}

> **Physical translation**: \\(P(a_i \mid \tau_k)\\) multiplies three independent gates. \\(p^\*\\) sets the fleet-wide target — how often, across all nodes, should this task be claimed. \\(H_i(t)\\) scales that target down for unhealthy nodes — a drone at 30% health should not be committing scarce resources. \\((1 - D_i(t))\\) scales it down further for nodes with stale state — a cluster that has been partitioned for three hours knows less about current fleet posture than one partitioned for five minutes. All three factors must be non-negligible for a node to claim.

**Claim mechanics.** Before committing resource \\(c_k\\) to task \\(\tau_k\\), node \\(i\\):

1. Computes \\(P(a_i \mid \tau_k)\\) from local state.
2. Samples {% katex() %}u \sim \mathrm{Uniform}(0, 1){% end %}.
3. If \\(u > P(a_i \mid \tau_k)\\): abstains. Task may be claimed by a healthier or lower-divergence node.
4. If \\(u \leq P(a_i \mid \tau_k)\\): emits an **intent token** {% katex() %}\langle \tau_k,\, i,\, t \rangle{% end %} via the {% term(url="@/blog/2026-01-22/index.md#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} protocol.
5. Any node receiving a prior intent token for \\(\tau_k\\) *before* committing resource \\(c_k\\) cancels its pending claim and does not commit. Under connected conditions, this window corresponds to {% katex() %}T_{\mathrm{gossip}}{% end %} (Proposition 4); under Denied regime the token may never arrive, in which case the node proceeds at its own \\(P(a_i \mid \tau_k)\\) risk.
6. Node \\(i\\) commits resource \\(c_k\\) only after {% katex() %}T_{\mathrm{gossip}}{% end %} expires without receiving a counter-token.

**No-leader guarantee.** Each node decides independently using only local state \\((H_i(t),\\, D_i(t))\\) and the broadcast gossip record. No coordinator is required: the probability function itself is the coordination mechanism. During Denied connectivity (Definition 2), {% katex() %}T_{\mathrm{gossip}} \to \infty{% end %} and the intent token cannot propagate — the protocol degrades gracefully to the uncoordinated baseline, which the loss function already accounts for.

**Byzantine resistance.** Intent tokens are gossip-propagated and subject to the reputation-weighted admission filter of Definition 12b (Stage 1). A compromised node cannot reliably suppress a legitimate intent token: doing so requires controlling a quorum of the claimant's \\(k\\) nearest gossip neighbors — the same threshold as Proposition 43.

**Self-suppression under degradation.** As \\(H_i(t) \to 0\\) (node is failing) or \\(D_i(t) \to 1\\) (node has severely divergent state), {% katex() %}P(a_i \mid \tau_k) \to 0{% end %}. Degraded nodes automatically yield resource commitments to healthier peers — the same gradient that governs healing action gating (Proposition 84) now governs resource stewardship.

<span id="prop-53"></span>

**Proposition 53** (Claim Collision Bound). *For \\(n\\) independent nodes each claiming task \\(\tau_k\\) with probability \\(P(a)\\), the probability of omission (no node claims) and the expected number of redundant claims (claims beyond the first) are:*

{% katex(block=true) %}
P(\text{omission}) = (1 - P(a))^n
{% end %}

- **Use**: Computes the probability all {% katex() %}n{% end %} nodes independently skip a task given per-node claim probability {% katex() %}P(a){% end %}; verify this is below mission tolerance for each tier before deployment to prevent under-claiming in small fleets from producing non-negligible omission risk.
- **Parameters**: {% katex() %}n{% end %} = fleet size; {% katex() %}P(a) = p^*{% end %} from Definition 55; example: {% katex() %}n=12{% end %}, {% katex() %}P(a)=0.5 \to P(\text{omission}) \approx 0.02\%{% end %}.
- **Field note**: Fleet size {% katex() %}n{% end %} is the strongest lever — adding 2 nodes to a 5-node fleet reduces omission probability by 75% at a fixed claim probability.

{% katex(block=true) %}
\mathbb{E}[\text{redundant claims}] = n \cdot P(a) - 1 + (1 - P(a))^n
{% end %}

*The fleet-optimal claim probability — distributing \\(p^\*\\) across \\(n\\) peers — sets {% katex() %}P(a) = 1 - (1 - p^*)^{1/n}{% end %}, which for small \\(p^\*\\) approximates \\(P(a) \approx p^\* / n\\). At this threshold, the probability that at least one node claims \\(\tau_k\\) equals \\(p^\*\\), achieving the inter-cluster coordination target under the independent-node assumption.*

*Proof sketch.* Model claims as independent Bernoulli trials. {% katex() %}P(\text{omission}) = (1-P(a))^n{% end %} by independence. Expected claims above 1 {% katex() %}= n \cdot P(a) - (1 - (1-P(a))^n){% end %} by substitution. The fleet-optimal \\(P(a)\\) follows from a target-probability argument: setting {% katex() %}P(\text{at least one of } n \text{ nodes claims } \tau_k) = p^*{% end %} gives \\((1-P(a))^n = 1-p^\*\\), hence {% katex() %}P(a) = 1-(1-p^*)^{1/n}{% end %}. This distributes the inter-cluster action target \\(p^\*\\) across \\(n\\) symmetric peers. The small-\\(p^\*\\) approximation \\(P(a) \approx p^\*/n\\) follows from the first-order Taylor expansion of {% katex() %}(1-p^*)^{1/n}{% end %}. \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calibration.** With \\(n = 6\\) peers in each cluster and \\(p^\* = 0.30\\) for the EOD platform, the fleet-optimal per-node claim probability is \\(P(a) \approx 0.30 / 6 = 0.05\\). Expected redundant claims: {% katex() %}6 \times 0.05 - 1 + 0.95^6 \approx 0.035{% end %}. Expected omission probability: \\(0.95^6 \approx 0.74\\). At \\(p^\* = 0.30\\), omission is the intended outcome \\(74\\%\\) of the time — only one vehicle in the cluster should claim the EOD platform, not both clusters simultaneously.

### Post-Partition Auditing and Fleet Policy Update

<span id="def-57"></span>

**Definition 57** (Post-Partition Audit Record). *Upon reconnection, each cluster emits an audit record:*

{% katex(block=true) %}
\mathcal{R}_i = \bigl\{ (\tau_k,\; a_i^{(k)},\; c_k^{\mathrm{actual}},\; t_k) \bigr\}
{% end %}

*where \\(\tau_k\\) is the task identifier, {% katex() %}a_i^{(k)} \in \{0, 1\}{% end %} indicates whether cluster \\(i\\) committed the resource, {% katex() %}c_k^{\mathrm{actual}}{% end %} is the resource consumed, and \\(t_k\\) is the HLC-stamped commitment time (Definition 40). Audit records from all reconnecting clusters are merged via a {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} G-Set (grow-only set — commutative, associative, idempotent), converging at the first reconnection regardless of merge order.*

**Trigger**: Audit record generation is automatic — triggered by the first successful gossip exchange after partition end, before any CRDT merge operations begin. Operator review is required within 24 hours for any audit flagging claim collisions above the Proposition 53 bound.

**Outcome classification.** The merged audit identifies, for each task, three mutually exclusive outcomes:

| Outcome | Condition | {% katex() %}\hat{\alpha}{% end %} update | {% katex() %}\hat{\beta}{% end %} update |
| :--- | :--- | :--- | :--- |
| **Clean** | Exactly one cluster acted | None | None |
| **Redundant** | Both clusters acted ({% katex() %}a_A^{(k)} = a_B^{(k)} = 1{% end %}) | Increment | None |
| **Omission** | Neither cluster acted ({% katex() %}a_A^{(k)} = a_B^{(k)} = 0{% end %}) | None | Increment |

**Coefficient update.** After each audit cycle the fleet updates its {% katex() %}(\hat{\alpha}, \hat{\beta}){% end %} policy pair using exponential smoothing with learning rate \\(\eta \in (0, 1)\\):

{% katex(block=true) %}
\hat{\alpha}_{t+1} = (1 - \eta)\,\hat{\alpha}_t + \eta \cdot \frac{\sum_k c_k^{\mathrm{actual}} \cdot \mathbf{1}[\text{redundant}_k]}{\text{total resource budget}_t}
{% end %}

{% katex(block=true) %}
\hat{\beta}_{t+1} = (1 - \eta)\,\hat{\beta}_t + \eta \cdot \frac{\sum_k v_k \cdot \mathbf{1}[\text{omission}_k]}{\text{total task value}_t}
{% end %}

> **Physical translation**: Each formula is an exponential moving average over audit outcomes. {% katex() %}\hat{\alpha}{% end %} tracks the fraction of the resource budget consumed redundantly — if 30% of this partition's resource spend was duplicated work, {% katex() %}\hat{\alpha}{% end %} drifts toward 0.30. {% katex() %}\hat{\beta}{% end %} tracks the fraction of task value that went unserved — if 15% of mission value was left uncaptured, {% katex() %}\hat{\beta}{% end %} drifts toward 0.15. The learning rate \\(\eta\\) controls how fast historical patterns are forgotten: small \\(\eta\\) (0.05) gives stable policy but slow adaptation; large \\(\eta\\) (0.3) reacts quickly to regime changes but oscillates under noise.

The updated {% katex() %}(\hat{\alpha}, \hat{\beta}){% end %} pair is propagated to all nodes as an LWW-Register {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}, arbitrated by HLC timestamp (Definition 41, Proposition 41). This write requires L4 capability (full fleet integration): the policy update is a fleet-wide commitment that should not be issued by a single disconnected cluster. Clusters reconnecting below L4 (Degraded or Intermittent regime) queue the pending policy write locally; it executes when {% katex() %}C \geq C_{\min}(L4){% end %} is re-established.

**No-leader guarantee.** The G-Set audit merge is commutative, associative, and idempotent — any node with reconnection can initiate it, in any order, with any subset of peers. The LWW-Register policy update is arbitrated by HLC, not by a designated writer. Simultaneous policy updates from two reconnecting clusters resolve deterministically via Proposition 41 without a coordinator. Neither the audit merge nor the policy update requires a leader at any step.

**Connection to the CONVOY protocol.** The CONVOY Coherence Protocol in the next section demonstrates the overall reconciliation sequence. The arbitration layer operates *before* that sequence: it governs which resources were committed during partition. The audit record \\(\mathcal{R}_i\\) is an input to post-partition reconciliation — it feeds the "Handling Actions Taken During Partition" classification table above, replacing the informal "note inefficiency" entry for redundant actions with a structured feedback loop that updates \\(p^\*\\) for the next partition.

> **Cognitive Map**: The arbitration layer solves a coordination problem without a coordinator. The loss function (Definition 55) converts policy values into a claim probability \\(p^\*\\). The claim probability (Definition 56) gates each node's commitment attempt using local health and divergence. The collision bound (Proposition 53) proves the fleet-level omission and redundancy rates that result. The audit record (Definition 57) closes the loop — post-partition outcomes update {% katex() %}\hat{\alpha}{% end %} and {% katex() %}\hat{\beta}{% end %}, which shift \\(p^\*\\) for the next partition. The system learns to be less redundant when waste is costly and less conservative when omissions hurt.

---

## CONVOY Coherence Protocol

> **Problem**: Two vehicle groups execute separate missions for 45 minutes with no shared communication. Each makes locally valid decisions — different routes, different threat assessments. When they reconnect, their states conflict on facts that can no longer be undone.
> **Solution**: Six-phase reconnection sequence: exchange Merkle roots, identify divergences, share divergent data, merge states, verify consistency, resume coordinated operation. Irreconcilable physical decisions (position, route already traveled) are accepted as fait accompli; divergent *knowledge* is merged.
> **Trade-off**: The protocol recovers information coherence but cannot undo resource expenditure or physical commitment. Pre-agreed routing rules for partition scenarios (Lesson 2) reduce the probability of irreconcilable route conflicts in future partitions.

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

> **Cognitive Map**: CONVOY's reconciliation follows the six-phase protocol in sequence: Merkle root exchange surfaces divergence cheaply; targeted data exchange resolves it efficiently; merge produces a unified view richer than either cluster held alone. Physical commitments (route traveled, resources expended) are accepted and moved forward from — the protocol's goal is knowledge coherence, not history revision. Three actionable improvements emerge: confidence-scored intel, pre-agreed partition routing rules, and mapped communication shadows for future transits.

---

## RAVEN Coherence Protocol

> **Problem**: Three drone clusters operate independently under terrain and jamming-induced partition. Each cluster observes different zones, detects different threats, and loses one drone to a collision. When they reconnect, their observation sets may overlap — two clusters may have independently detected the same physical threat.
> **Solution**: Coverage and threats merge as G-Sets (union, no conflicts possible for distinct observations). Health merges as LWW-Registers (latest wins). For potentially duplicate observations, entity resolution uses confidence-weighted position averaging and the complementary-probability confidence update.
> **Trade-off**: Entity resolution requires an explicit similarity threshold \\(\theta\\) — set it too high and genuine matches are missed (duplicate threat entries); set it too low and distinct threats are collapsed (false identity merge). The independence assumption in confidence fusion fails when sensor models share correlated errors.

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

> **Physical translation**: The merged position is a weighted average that pulls toward whichever cluster's observation was more confident. If Cluster A had confidence 0.9 and Cluster B had confidence 0.3, the merged position is \\(0.9/(0.9+0.3) = 75\\%\\) of the way toward Cluster A's reading — not a simple midpoint. High-confidence observations dominate; low-confidence observations contribute proportionally.

Where \\(c\\) is confidence and \\(p\\) is position.

### Entity Resolution Formalization

For distributed observation systems, entity resolution is critical. Multiple observers may detect the same entity and assign different identifiers.

**Observation tuple**: \\((id, pos, time, sig, observer)\\)

**Match probability**: Given two observations \\(o_1\\) and \\(o_2\\), the probability they describe the same physical entity is a function \\(f\\) of the distance between their positions, the gap between their timestamps, and the similarity between their sensor signatures {% katex() %}\text{sim}(sig_1, sig_2){% end %}.

{% katex(block=true) %}
P(\text{same entity} | o_1, o_2) = f(\|pos_1 - pos_2\|, |time_1 - time_2|, \text{sim}(sig_1, sig_2))
{% end %}

Where {% katex() %}\text{sim}{% end %} is signature similarity function.

**Merge criteria**: If {% katex() %}P(\text{same}) > \theta{% end %}, merge observations. Otherwise, keep as separate entities.

**Confidence update**: Merging two independent observations of the same entity raises the combined confidence using the complementary-probability rule: {% katex() %}c_{\text{merged}}{% end %} is 1 minus the probability that both observers were simultaneously wrong.

{% katex(block=true) %}
c_{\text{merged}} = 1 - (1 - c_1)(1 - c_2)
{% end %}

> **Physical translation**: {% katex() %}c_{\text{merged}}{% end %} is the probability that at least one of the two observers was correct — the complement of both being wrong simultaneously. If each observer has a 20% error rate (confidence 0.8), the merged confidence is \\(1 - (0.2)(0.2) = 0.96\\) — two independent eyes are much harder to fool than one. The formula assumes errors are uncorrelated; the note below explains when that assumption breaks.

**Note:** This assumes observation errors are independent across nodes. If both observers share the same sensor model or environmental bias (e.g., both use identical LIDAR firmware with the same calibration error), confidence-weighted averaging amplifies the shared error rather than averaging it out. Use cross-sensor validation (Self-Measurement Without Central Observability, Proposition 7) to detect and correct correlated errors before entity resolution.

> **Cognitive Map**: RAVEN's reconvergence demonstrates CRDT semantics in practice. Coverage and threat sets merge as G-Sets — union is always correct because coverage is monotonically additive. Health merges as LWW-Registers — latest timestamp wins per drone. Entity resolution handles the hard case: same physical threat, two local identifiers. Confidence-weighted averaging fuses the position observations; the complementary-probability rule fuses the confidence scores. The correlated-error warning is the critical constraint: independent sensors are powerful; sensors with shared firmware or calibration flaws are not independent.

---

## OUTPOST Coherence Protocol

> **Problem**: A 127-sensor perimeter mesh may be partitioned for days. Each sensor makes local detection decisions without access to the fusion node. When bandwidth-constrained reconnection arrives, transmitting full state is infeasible, and detection events from the partition window are unreconciled.
> **Solution**: Stratify state by priority and assign CRDT semantics per tier: G-Set union for detection events, LWW-Register for sensor health, confidence-weighted coverage maps. Delta encoding reduces bandwidth by transmitting only state changes since the last sync. Merkle roots verify completeness without full transmission.
> **Trade-off**: The coherence bound (Proposition 16) shows divergence grows with both event rate and partition duration. Deploying more fusion nodes (increasing \\(k\\)) shrinks the sensor-to-fusion ratio and bounds divergence — but each fusion node adds hardware cost and maintenance burden.

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

The {% katex() %}\text{reconciled}{% end %} flag tracks whether the event has been confirmed by fusion node. Unreconciled events are treated with lower confidence.

**Bandwidth-efficient reconciliation**: Given ultra-low bandwidth (often < 1 Kbps), {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} uses compact delta encoding. The delta {% katex() %}\Delta_{\text{state}}{% end %} is the set difference between the current state and the state at the last successful sync point {% katex() %}t_{\text{last\_sync}}{% end %} — only this incremental change is transmitted rather than the full state.

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

> **Physical translation**: \\(\lambda \cdot T_p\\) is the expected number of events that arrive at one sensor during the partition — the raw volume of unreconciled data. The factor \\((n-k)/k\\) is the sensor-to-fusion ratio minus 1: with 127 sensors and 3 fusion nodes, that ratio is 41. A 1-hour partition at 1 event/minute produces \\(60 \times 41 = 2460\\) expected divergence events. Deploying 6 fusion nodes instead of 3 cuts the bound in half; halving the event rate (coarser detection thresholds) cuts it in half again. Divergence has two independent control levers.

> **Cognitive Map**: OUTPOST's coherence strategy is tiered by urgency. Detection events get highest priority and G-Set semantics — no event is ever lost, just deduplicated. Health state uses LWW-Register — latest wins because stale health reports are useless. Configuration changes are deferred until uplink authority reconnects. The bandwidth constraint makes delta encoding mandatory: the Merkle tree confirms completeness without transmitting what you already have. Proposition 16 gives the bound that tells you whether your fusion-node deployment is sufficient for your expected partition duration and event rate.

---

## The Limits of Coherence

> **Problem**: The coherence mechanisms described so far — CRDTs, Merkle reconciliation, authority tiers — assume conflicts can be resolved through merge functions. Some cannot: physical facts may be contradictory, resources may be permanently consumed, and nodes may have been destroyed before syncing.
> **Solution**: Accept that perfect coherence is unachievable. Stratify state by coherence requirement — safety-critical state demands high coherence, logging state tolerates eventual consistency. Apply Byzantine detection and isolation for adversarial cases. For irreconcilable conflicts, flag for human verification.
> **Trade-off**: The coherence-autonomy inverse relationship is a fundamental constraint, not an engineering failure. Requiring consensus before action blocks the system during partition. The architect's task is choosing the minimum coherence needed per state tier, not maximizing coherence everywhere.

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

**Detection**: {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} behavior often creates patterns:
- Inconsistent with multiple other observers
- Reports change implausibly fast
- State updates violate physical constraints

**Isolation**: Nodes detected as potentially {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %}:
1. Reduce trust weight in aggregation
2. Quarantine from decision-making
3. Flag for human review

{% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %}-tolerant {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s exist but are expensive. Recent work by [Kleppmann et al.](https://martin.kleppmann.com/papers/bft-crdt-papoc22.pdf) addresses making {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} fault-tolerant, but the overhead is significant. Edge systems often use lightweight detection plus isolation rather than full {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} tolerance.

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

> **Cognitive Map**: The limits section reframes the problem. Irreconcilable conflicts are not architecture failures — they are physical facts (a target cannot be both destroyed and escaped). Byzantine actors require lightweight detection and isolation, not full BFT CRDT overhead. Stale-forever state is an acceptance criterion, not a bug. The coherence-autonomy tradeoff formalizes what every partition scenario demonstrated: maximum coherence blocks the system; maximum autonomy loses state. The architect's only choice is where to stand on the inverse curve, per state tier.

---

## Model Scope and Failure Envelope

> **Problem**: Every coherence mechanism in this post relies on assumptions that may be violated in the field — CRDTs require eventual delivery, Merkle reconciliation requires sparse divergence, authority resolution requires available tie-breakers. Knowing the mechanism is not enough; knowing when it breaks is equally important.
> **Solution**: Enumerate the validity domain and failure envelope for each mechanism. For each assumption, identify the failure mode, how it is detected, and what mitigates it. Treat the summary claim-assumption-failure table as a deployment checklist.
> **Trade-off**: Failure envelopes do not disappear — they expand or shift with mitigations. Cryptographic hashes reduce collision probability but add compute. Byzantine CRDTs add correctness guarantees but add overhead. The architect's goal is to push the failure envelope outside the expected operating range, not to make it infinite.

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
- \\(A_3\\): No {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} corruption of {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} state

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

> **Cognitive Map**: The model scope section is a deployment-readiness checklist. CRDT validity requires three properties: eventual delivery, semilattice merge, and no Byzantine corruption. Merkle validity requires three: collision resistance, balanced tree, and sparse divergence. Authority resolution validity requires three: available tie-breakers, consistent rules, and no equivocation. The table at the end maps assumption violations directly to failure modes and mitigations — consult it before deploying any mechanism in a new environment or adversarial scenario.

---

## Irreducible Trade-offs

> **Problem**: Fleet coherence mechanisms solve specific problems within specific validity envelopes. But some tensions cannot be resolved — they are fundamental Pareto fronts where improving one objective unavoidably degrades another.
> **Solution**: Name the four irreducible trade-offs explicitly: CAP (consistency vs. availability), speed vs. bandwidth, authority granularity vs. conflict rate, and state completeness vs. sync cost. For each, give the multi-objective formulation so architects can make principled Pareto choices rather than ad hoc compromises.
> **Trade-off**: The shadow price table converts the abstract trade-offs into concrete resource comparisons. Conflict resolution (5.00 c.u./conflict) costs \\(250\\times\\) more than state storage (0.02 c.u./KB-hr) — this ordering should drive architectural choices about which conflicts to prevent vs. accept.

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
| 4 | {% katex() %}O(\log_2 n){% end %} | Low | High |
| 8 | {% katex() %}O(\log_2 n){% end %} | Medium | Medium |
| 16 | {% katex() %}O(\log_2 n){% end %} | High | Low |

Deeper trees enable finer-grained sync (less bandwidth per round) but require more rounds (higher latency). Optimal depth depends on divergence fraction \\(k/n\\).

### Trade-off 3: Authority Granularity vs. Conflict Probability

**Multi-objective formulation**:

More authority tiers \\(k\\) increase operational flexibility but raise both conflict probability (multiple active tiers may issue contradictory decisions during partition) and coordination overhead — the objective makes all three tensions explicit.

{% katex(block=true) %}
\max_{k} \left( U_{\text{flexibility}}(k), -P_{\text{conflict}}(k), -C_{\text{coordination}}(k) \right)
{% end %}

where \\(k\\) is number of authority tiers.

**Pareto front**: All three metrics move together as \\(k\\) increases — finer authority granularity uniformly raises flexibility, conflict risk, and coordination cost, so the architect must choose how much conflict exposure the mission can tolerate.

| Authority Tiers | Flexibility | Conflict Risk | Coordination Cost |
| :--- | :---: | :---: | :---: |
| 2 (binary) | Low | Low | Low |
| 4 (standard) | Medium | Medium | Medium |
| 8 (fine-grained) | High | High | High |

More authority tiers enable nuanced delegation but increase conflict probability when multiple tiers activate simultaneously during partition.

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

> **Physical translation**: {% katex() %}C_{\text{coherence}}{% end %} has three additive terms that operate on different timescales. Divergence cost grows *during* partition — every operation that executes on one side but not the other adds to the bill. Reconciliation cost is paid *at reconnection* — it is bounded by divergence count, but the \\(k^2\\) conflict term can dominate for high-update-rate partitions. Conflict resolution cost is paid *after reconciliation* — it scales with the fraction of conflicts that escape automated merge rules and require human judgment. Short partitions minimize all three; long partitions inflate divergence and may trigger \\(k^2\\) reconciliation explosion.

**Divergence cost**: Divergence accumulates linearly in partition duration, where \\(\alpha\\) is the per-operation divergence weight and {% katex() %}\mathbb{E}[\text{operations}]{% end %} is the expected operation rate.

{% katex(block=true) %}
C_{\text{divergence}}(\tau_p) = \alpha \cdot \mathbb{E}[\text{operations}] \cdot \tau_p
{% end %}

**Reconciliation cost** (for \\(k\\) divergent items): The cost has two terms — Merkle traversal proportional to \\(k \log(n/k)\\) and pairwise conflict handling proportional to {% katex() %}k^2 \cdot p_{\text{conflict}}{% end %}, where \\(\beta\\) is the per-item reconciliation weight and {% katex() %}p_{\text{conflict}}{% end %} is the probability that two divergent items conflict.

{% katex(block=true) %}
C_{\text{reconcile}}(k) = \beta \cdot (k \log(n/k) + k^2 \cdot p_{\text{conflict}})
{% end %}

**Conflict resolution cost**: Each detected conflict incurs a per-conflict resolution cost {% katex() %}C_{\text{resolve}}{% end %}, scaled by \\(\gamma\\), the fraction of conflicts that require intervention beyond automatic merge rules.

{% katex(block=true) %}
C_{\text{conflict}} = \gamma \cdot |\text{conflicts}| \cdot C_{\text{resolve}}
{% end %}

### Resource Shadow Prices

Each shadow price quantifies how much the total coherence cost changes per unit increase in the corresponding resource constraint, enabling direct comparison across heterogeneous resources.

| Resource | Shadow Price \\(\lambda\\) (c.u.) | Interpretation |
| :--- | ---: | :--- |
| Sync bandwidth | 1.50/KB | Value of faster reconciliation |
| State storage | 0.02/KB-hr | Cost of history retention |
| Conflict resolution | 5.00/conflict | Cost of manual intervention |
| Consistency | 0.80/%-deviation | Value of tighter consistency |

*(Shadow prices in normalized cost units (c.u.) — illustrative relative values; ratios convey coherence resource scarcity ordering. State storage (0.02 c.u./KB-hr) is the reference unit. Calibrate to platform-specific costs.)*

### Irreducible Trade-off Summary

The following table consolidates the four Pareto conflicts: in each row, the third column names the physical or logical constraint that prevents both objectives from being fully satisfied at once.

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Consistency-Availability | Strong consistency vs. always writable | Both under partition (CAP) |
| Speed-Bandwidth | Fast reconciliation vs. low network cost | Both with large divergence |
| Granularity-Conflicts | Fine authority vs. low conflict rate | Both with concurrent partitions |
| Completeness-Cost | Full history vs. low storage/sync | Both with limited resources |

> **Cognitive Map**: The four trade-offs share a common structure: a multi-objective formulation with a "cannot simultaneously achieve" constraint. CAP is the foundational one — it bounds what any distributed system can guarantee under partition. The cost surface decomposes total coherence cost into three time-ordered terms (during partition, at reconnection, after resolution), making clear that the \\(k^2\\) reconciliation term is the explosive risk for high-update workloads. The shadow price table gives the relative cost ratios that should drive architecture: avoid manual conflict resolution (5.00 c.u.) by pre-designing authority rules; accept storage cost (0.02 c.u.) over sync cost (1.50 c.u.) when bandwidth is the constraint.

---

## Closing: What Fleet Coherence Establishes

> **Problem**: After four posts, the reader has a toolkit of mechanisms — CRDTs, Merkle trees, authority tiers, probabilistic reservation, audit feedback loops. The question is what this toolkit *enables* at the fleet level, and what it establishes as a foundation for the next layer of capability.
> **Solution**: Fleet coherence is not just consistency — it is *information gain*. When two clusters with divergent beliefs merge, the joint state contains knowledge that neither cluster held alone. The \\(\Delta I > 0\\) property formalizes this: partition + reconciliation strictly increases fleet knowledge when conflicts exist and are resolved.
> **Trade-off**: The three design-time choices (CRDT type per state variable, authority delegation rules, Merkle tree depth) fully determine achievable coherence. None of these can be adjusted at runtime under Denied connectivity — they must be calibrated before deployment against the mission's coherence requirements.

Four articles — contested-connectivity foundations, self-measurement, self-healing, and fleet coherence — developed the foundational capabilities for autonomic edge systems: connectivity-regime awareness, local self-measurement, autonomous self-healing, and fleet coherence under partition. {% term(url="#scenario-stocksync", def="Multi-warehouse inventory using CRDTs; distribution centers continue receiving and fulfilling during outages and merge without overselling on reconnection") %}STOCKSYNC{% end %} warehouse inventory converges via {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge without central coordination; {% term(url="#scenario-multiwrite", def="Field service work-order system for basements, tunnels, and remote sites; CRDT merging resolves concurrent offline edits automatically on reconnection") %}MULTIWRITE{% end %} field documentation auto-merges character-level edits from offline technicians; {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} recovers from a route split with unified intel and a convergence plan.

{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} at the mountain pass learned concrete facts unavailable before partition:
- Intel conflicts require confidence scoring (two regional sources gave contradictory bridge status)
- Route B is passable (forward group confirmed by traversal)
- Vehicles 6-12 can operate independently for 45+ minutes under local lead authority
- Communication shadow exists at km 47-52 (now mapped for future transits)

*Quantified information gain*: Let {% katex() %}I_{\text{pre}}{% end %} and {% katex() %}I_{\text{post}}{% end %} denote fleet knowledge (measured as entropy reduction in route/threat models) before and after partition:

{% katex(block=true) %}
\Delta I = I_{\text{post}} - I_{\text{pre}} > 0 \quad \text{iff conflict occurred and was resolved}
{% end %}

> **Physical translation**: \\(\Delta I > 0\\) means that after reconciliation, the fleet knows more than any individual cluster knew before. This is not trivially true — it requires that the conflict was *resolved*, not just *flagged*. CONVOY learned the bridge was intact (Cluster Bravo's visual confirmation) and that Route B was passable (Cluster Alpha's successful traverse). Neither cluster held both facts before partition. The entropy of the fleet's route model dropped after reconciliation because two independent observations, each reducing uncertainty from a different direction, combined into a sharper joint belief.

The condition \\(\Delta I > 0\\) is a verifiable structural property of the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} reconciliation architecture: divergent beliefs that no single node could hold simultaneously are resolved into a joint state with strictly lower entropy. Fleet coherence does not merely eliminate divergence - it converts the divergence itself into fleet-wide knowledge.

Three design decisions determine how much coherence is achievable for a given deployment: the {% term(url="#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} types selected for each state variable, the authority delegation rules pre-distributed before partition, and the Merkle tree depth configured for the expected divergence fraction. All three can be calibrated at design time against the mission's coherence requirements, leaving no residual ambiguity at runtime.
