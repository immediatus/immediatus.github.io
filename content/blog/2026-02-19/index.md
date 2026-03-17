+++
authors = ["Yuriy Polyulya"]
title = "The Constraint Sequence and the Handover Boundary"
description = "The right build order prevents sophisticated capabilities from collapsing before their foundations exist. This article derives the prerequisite graph, constraint migration, and phase gate framework for sequencing autonomic edge capabilities — then formalizes five handover constructs: predictive triggering for cognitive inertia, asymmetric trust dynamics, Merkle-gated command validation, semantic compression against alert fatigue, and the L0 physical interlock that no autonomic loop can override."
date = 2026-02-19
slug = "autonomic-edge-part6-constraint-sequence"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "systems-thinking", "optimization"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 6
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Edge systems can't treat disconnection as an exceptional error — it's the default condition. This series builds the formal foundations for systems that self-measure, self-heal, and improve under stress without human intervention, grounded in control theory, Markov models, and CRDT state reconciliation. Every quantitative claim comes with an explicit assumption set."""
+++

---

## Prerequisites

This final article synthesizes the complete series:

- **[Contested Connectivity](@/blog/2026-01-15/index.md)**: The connectivity probability model \\(C(t)\\), capability hierarchy (L0-L4), and the fundamental inversion that defines edge
- **[Self-Measurement](@/blog/2026-01-22/index.md)**: Distributed health monitoring, the observability {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %}, and {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}-based awareness
- **[Self-Healing](@/blog/2026-01-29/index.md)**: {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} autonomous healing {{ cite(ref="1", title="Kephart & Chess (2003) — The Vision of Autonomic Computing") }}, recovery ordering, and cascade prevention under partition
- **[Fleet Coherence](@/blog/2026-02-05/index.md)**: State reconciliation, {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s, decision authority hierarchies, and the coherence protocol
- **[Anti-Fragile Decision-Making](@/blog/2026-02-12/index.md)**: Systems that improve under stress, the {% term(url="@/blog/2026-02-12/index.md#def-91", def="Time window J over which the system evaluates stress outcomes before adapting; shorter J enables faster adaptation but higher variance in parameter estimates") %}judgment horizon{% end %}, and the limits of automation

The preceding articles developed the *what*: the capabilities required for autonomic edge architecture. This article addresses the *when*: in what order should these capabilities be built? The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} determines success or failure. Build in the wrong order, and you waste resources on sophisticated capabilities that collapse because their foundations are missing.

*Full series notation registry: [Notation Registry](/notation-registry/).*

---

## Theoretical Contributions

This article develops the theoretical foundations for capability sequencing in autonomic edge systems. We make the following contributions:

1. **Prerequisite Graph Formalization**: We model edge capability dependencies as a directed acyclic graph (DAG) and derive valid development sequences as topological orderings with priority-weighted optimization.

2. **Constraint Migration Theory**: We characterize how binding constraints shift across connectivity states and prove conditions for dynamic re-sequencing under adversarial adaptation.

3. **Meta-Constraint Analysis**: We derive resource allocation bounds for autonomic overhead, proving that optimization infrastructure competes with the system being optimized.

4. **Formal Validation Framework**: We define {% term(url="#def-103", def="Checkpoint where three conditions must ALL hold before advancing to the next capability: ROI on the current constraint below 3x, 95% of its theoretical ceiling reached, and the next constraint measurably binding") %}phase gate{% end %} functions as conjunction predicates over verification conditions, providing a mathematical foundation for systematic validation.

5. **Phase Progression Invariants**: We prove that valid system evolution requires maintaining all prior gate conditions, establishing the regression testing requirement as a theorem.

6. **Human-Machine Teaming Protocols**: We formalize five constructs at the automation boundary: predictive handover triggering ({% term(url="#prop-74", def="Predictive Handover Criterion: edge node should initiate autonomous-mode handover when the partition accumulator exceeds the 95th-percentile partition duration") %}Proposition 74{% end %}), asymmetric trust dynamics ({% term(url="#def-105", def="Asymmetric Trust Dynamics: trust gain and loss rates differ; nodes lose trust rapidly on violation but regain it slowly after correct behavior") %}Definition 105{% end %}), causal barriers for stale commands ({% term(url="#def-106", def="Causal Barrier: synchronization point preventing capability escalation until all causally prior operations have been acknowledged by the required quorum") %}Definition 106{% end %}), semantic compression against alert fatigue ({% term(url="#def-107", def="Intent Health Indicator: mapping from system state to intent-satisfaction level, measuring how well the current autonomic plan serves the mission") %}Definition 107{% end %}), and the L0 Physical Safety Interlock ({% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}) that bypasses the entire {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} stack when hardware safety demands it {{ cites(ref="3", refs="3, 4", title="Salehie & Tahvildari (2009) — Self-Adaptive Software: Landscape and Research Challenges; Lee (2008) — Cyber Physical Systems: Design Challenges") }}.

These contributions build on Theory of Constraints (Goldratt, 1984), formal verification (Clarke et al., 1999), and systems engineering (INCOSE, 2015), adapting each framework for contested edge deployments {{ cites(ref="5", refs="5, 6", title="Satyanarayanan (2017) — The Emergence of Edge Computing; ETSI GS MEC 003 (2019) — MEC Framework and Reference Architecture") }}.

---

## Opening Narrative: The Wrong Order

Edge Platform Team: PhD ML expertise, cloud deployment veterans, project allocation of 2,400 p.u. (project baseline units). Mission: intelligent monitoring for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicles. Six months produced 94% detection accuracy in lab.

Within 72 hours of deployment: offline on 8 of 12 vehicles.

The failure was **wrong sequencing**, not bad engineering:
- ML assumed continuous connectivity—terrain averaged 23%
- GPU inference assumed stable power—shed first during stress
- Fleet correlation assumed reliable mesh—not validated

**Post-mortem**:
- L0 (partition survival): **Not validated**
- Self-measurement: **Assumed** (no independent local health)
- Self-healing: **Absent**
- Fleet coherence: **Built on unstable foundation**
- Sophisticated analytics (2,000 p.u.): **Collapsed without foundations**

They built L3 capability before validating L0. The roof before the foundation.

Cloud-native intuition fails at edge: you can't iterate quickly when mistakes may be irrecoverable. The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} matters.

---

## The Constraint Sequence Framework

> **Problem**: Building edge capabilities in the wrong order produces expensive failures. A team that delivers 94% detection accuracy in a lab can find all 12 vehicles offline within 72 hours of deployment — because the ML assumed continuous connectivity, the GPU assumed stable power, and neither was validated before the analytics layer was built.
> **Solution**: Apply the Theory of Constraints to capability sequencing: every system has a current binding constraint, and optimizing anything other than that constraint is wasted effort. The constraint sequence formalizes the required ordering — a total ordering over capabilities where each prerequisite must be substantially solved before its dependent can become binding.
> **Trade-off**: The constraint sequence is context-dependent — edge constraints differ from cloud-native ones in type (survival vs. performance), iteration speed (days vs. hours), and mistake recovery (often irrecoverable vs. rollback). Getting the sequence wrong at the edge is more expensive and slower to detect than getting it wrong in cloud.

### Review: Constraint Sequence from Platform Engineering

<span id="def-92"></span>
**Definition 92** (Constraint Sequence). *A {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} for system \\(S\\) is a total ordering {% katex() %}\sigma: \mathcal{C} \rightarrow \mathbb{N}{% end %} over the set of constraints {% katex() %}\mathcal{C}{% end %} such that addressing constraint \\(c_i\\) before its prerequisites {% katex() %}\text{prereq}(c_i){% end %} provides zero value:*

{% katex(block=true) %}
\forall c_i \in \mathcal{C}: \sigma(c_j) < \sigma(c_i) \quad \forall c_j \in \text{prereq}(c_i)
{% end %}

> **Analogy:** A spacecraft re-entry checklist — you don't deploy the parachute before the heat shield, and you don't radio mission control before the parachute deploys. Each step has verified preconditions.

**Logic:** A valid constraint sequence is a topological ordering of the prerequisite DAG; any ordering that violates a prerequisite edge wastes effort because the dependent capability provides zero value without its foundation.

{% mermaid() %}
stateDiagram-v2
    [*] --> Phase0 : system boot
    Phase0 --> Phase1 : gate_0 passes L0 safety checks
    Phase1 --> Phase2 : gate_1 passes connectivity and clock sync
    Phase2 --> Phase3 : gate_2 passes CRDT converged and quorum
    Phase3 --> Phase4 : gate_3 passes EXP3-IX warm and certified
    Phase4 --> [*] : handover complete
    Phase1 --> Phase0 : gate fails rollback
    Phase2 --> Phase1 : gate fails rollback
    Phase3 --> Phase2 : gate fails rollback
    Phase3 --> Phase3 : holding awaiting prerequisites
{% end %}

The Theory of Constraints, developed by Eliyahu Goldratt, observes that every system has a bottleneck—the constraint that limits overall throughput. Optimizing anything other than the current constraint is wasted effort. Only by identifying and addressing constraints in sequence can a system improve.

Applied to software systems, this becomes the **Constraint Sequence** principle:

> **Systems fail in a specific order. Each constraint provides a limited window to act. Solving the wrong problem at the wrong time is an expensive way to learn which problem should have come first.**

In platform engineering, common {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %}s include:
1. **Reliability before features**: A feature that crashes the system provides negative value
2. **Observability before optimization**: You cannot optimize what you cannot measure
3. **Security before scale**: Vulnerabilities multiply with scale
4. **Simplicity before sophistication**: Complex solutions to simple problems create maintenance debt

The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} is not universal—it depends on context. But within a given context, some orderings are strictly correct and others are strictly wrong. The {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} team's failure was solving constraint #7 (sophisticated analytics) before constraints #1-6 were addressed.

### Edge-Specific Constraint Properties

Edge computing introduces constraint properties that differ from cloud-native systems {{ cites(ref="5", refs="5, 6", title="Satyanarayanan (2017) — The Emergence of Edge Computing; ETSI GS MEC 003 (2019) — MEC Framework and Reference Architecture") }}:

<style>
#tbl_constraints + table th:first-of-type { width: 20%; }
#tbl_constraints + table th:nth-of-type(2) { width: 40%; }
#tbl_constraints + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_constraints"></div>

| Property | Cloud-Native | Tactical Edge |
| :--- | :--- | :--- |
| **Constraint type** | Performance, cost, scale | Survival, trust, autonomy |
| **Iteration speed** | Fast (minutes to hours) | Slow (days to weeks) |
| **Mistake recovery** | Usually recoverable (rollback) | Often irrecoverable (lost platform) |
| **Feedback loop** | Continuous telemetry | Intermittent, delayed |
| **Constraint stability** | Relatively static | Shifts with connectivity state |
| **Failure visibility** | Immediate (monitoring) | Delayed (post-reconnect) |

What does this mean in practice?

**Survival constraints precede all others** {{ cite(ref="7", title="Avizienis et al. (2004) — Basic Concepts and Taxonomy of Dependable Computing") }}. In cloud, if a service crashes, Kubernetes restarts it. At the edge, if a drone crashes, it may be physically unrecoverable. The survival constraint (L0) must be addressed before any higher capability.

**Trust constraints are foundational**. Cloud systems assume the hardware is trustworthy (datacenter security). Edge systems may face physical adversary access. Hardware trust must be established before software health can be believed.

**Autonomy constraints compound over time**. A cloud service that fails during partition experiences downtime. An edge system that fails during partition may make irrecoverable decisions. Autonomy capabilities must be validated before autonomous operation.

**Feedback delays hide sequence errors**. In cloud, wrong sequencing manifests quickly through monitoring. At edge, you may not discover sequence errors until post-mission analysis—after the damage is done.

The implication: **{% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} is more critical at the edge than in cloud**. Errors are more expensive, less recoverable, and slower to detect. Getting the sequence right the first time is not a luxury—it is a requirement.

> **Cognitive Map**: The constraint sequence framework establishes the conceptual foundation for the entire article. {% term(url="#def-92", def="Constraint Sequence: ordered list of autonomic capabilities that must be activated in prerequisite order; violation of ordering creates unstable composed systems") %}Definition 92{% end %} formalizes the ordering requirement as a total ordering where prerequisites must be satisfied before dependents — the constraint that limits throughput must be addressed first. The cloud-vs-edge comparison table shows why sequence errors are so costly at the edge: irrecoverable mistakes, delayed feedback, and survival constraints that have no cloud analogue. The CONVOY team's failure (built L3 before validating L0) is the concrete example that motivates the formal framework.

---

## The Edge Prerequisite Graph

> **Problem**: Knowing that capabilities have prerequisites is not enough — you need the specific dependency graph for edge systems to determine which sequences are valid and which parallel work is safe.
> **Solution**: Define the prerequisite graph as a DAG where an edge A\\(\to\\)B means A must be substantially solved before B can become the binding constraint. {% term(url="#prop-66", def="Valid Sequence Existence: a valid constraint sequence always exists for any acyclic prerequisite graph, found by topological sort of the prerequisite DAG") %}Proposition 66{% end %} proves valid sequences exist iff the graph is acyclic. The critical path (Hardware Trust \\(\to\\) L0 \\(\to\\) Self-Measurement \\(\to\\) Self-Healing \\(\to\\) Fleet Coherence \\(\to\\) L2 \\(\to\\) L3 \\(\to\\) L4) is the minimum 8-stage sequential path to full capability.
> **Trade-off**: Not all paths through the DAG are equivalent — the critical path cannot be shortened by parallelism, but the parallelizable stages (L1 and Self-Measurement can develop simultaneously after L0) represent genuine acceleration opportunities. Hardware trust is the deepest prerequisite: all software health reports are suspect if the hardware is compromised.

### Dependency Structure of Edge Capabilities

<span id="def-93"></span>
**Definition 93** (Prerequisite Graph). *The {% term(url="#def-93", def="Dependency graph where an edge A→B means capability A must be substantially solved before B can become binding; valid implementation sequences follow topological order through this graph") %}prerequisite graph{% end %} \\(G = (V, E)\\) is a directed acyclic graph where \\(V\\) is the set of capabilities and \\(E\\) is the set of prerequisite relationships. An edge \\((u, v) \in E\\) indicates that capability \\(u\\) must be validated before capability \\(v\\) can be developed.*

<span id="prop-66"></span>
**Proposition 66** (Valid Sequence Existence). *A valid development sequence exists if and only if the {% term(url="#def-93", def="Dependency graph where an edge A→B means capability A must be substantially solved before B can become binding; valid implementation sequences follow topological order through this graph") %}prerequisite graph{% end %} is acyclic. When \\(G\\) is a DAG, the number of valid sequences equals the number of topological orderings of \\(G\\).*

> **What this means in practice**: You cannot always build the capabilities you want in the order you want — some require others to be stable first. The Prerequisite Graph ({% term(url="#def-93", def="Prerequisite Graph: DAG encoding capability dependencies; an edge A to B means A must be validated before B can be safely activated") %}Definition 18{% end %}) is not just organizational; it's a hard dependency ordering. Attempting to deploy fleet coherence (L3) before self-healing (L2) is stable creates a system that can lose its coherence layer during a failure event with no recovery path.

*Proof*: By the fundamental theorem of topological sorting, a directed graph admits a topological ordering iff it is acyclic. Each topological ordering corresponds to a valid development sequence satisfying all prerequisite constraints.
Edge capabilities form a directed acyclic graph (DAG) of prerequisites. Some capabilities depend on others; some can be built in parallel. The graph structure determines valid build sequences.

{% mermaid() %}
graph TD
    subgraph Foundation["Phase 0: Foundation"]
    HW["Hardware Trust<br/>(secure boot, attestation)"]
    end
    subgraph Survival["Phase 1: Local Autonomy"]
    L0["L0: Survival<br/>(safe state, power mgmt)"]
    SM["Self-Measurement<br/>(anomaly detection)"]
    SH["Self-Healing<br/>(MAPE-K loop)"]
    end
    subgraph Coordination["Phase 2-3: Coordination"]
    L1["L1: Basic Mission<br/>(core function)"]
    FC["Fleet Coherence<br/>(CRDTs, reconciliation)"]
    L2["L2: Local Coordination<br/>(cluster ops)"]
    end
    subgraph Integration["Phase 4-5: Integration"]
    L3["L3: Fleet Integration<br/>(hierarchy, authority)"]
    AF["Anti-Fragility<br/>(learning, adaptation)"]
    L4["L4: Full Capability<br/>(optimized operation)"]
    end

    HW --> L0
    L0 --> L1
    L0 --> SM
    SM --> SH
    L1 --> FC
    SH --> FC
    FC --> L2
    L2 --> L3
    SM --> AF
    SH --> AF
    FC --> AF
    L3 --> L4
    AF --> L4

    style HW fill:#ffcdd2,stroke:#c62828,stroke-width:2px
    style L0 fill:#fff9c4,stroke:#f9a825
    style SM fill:#c8e6c9,stroke:#388e3c
    style SH fill:#c8e6c9,stroke:#388e3c
    style FC fill:#bbdefb,stroke:#1976d2
    style L4 fill:#e1bee7,stroke:#7b1fa2,stroke-width:2px
{% end %}

> **Read the diagram**: Red (Hardware Trust) is the absolute foundation — nothing above it is valid if the hardware is compromised. Yellow (L0) must be validated before any other capability begins. Green (Self-Measurement and Self-Healing) can develop in parallel after L0 and feed each other. Blue (L1, Fleet Coherence, L2) form the coordination layer. Purple (L4) at the top is reachable only after *both* L3 and Anti-Fragility are validated — the two paths through the graph must converge before full capability is achievable.

> **Two distinct graphs — development vs. runtime**: {% term(url="#def-93", def="Prerequisite Graph: DAG encoding capability dependencies; an edge A to B means A must be validated before B can be safely activated") %}Definition 93{% end %}'s prerequisite graph models *capability development sequencing*, not runtime boot order. At runtime, Monitor, Healer, and Resource Manager form a cyclic dependency ring that cannot be topologically sorted. The {% term(url="@/blog/2026-01-15/index.md#def-18", def="Dependency Isolation Requirement: each autonomic capability layer must fail independently without propagating failures to lower capability layers") %}L0 Dependency Isolation Requirement{% end %} breaks this cycle at cold start by giving each component an L0 survival-mode variant with zero lateral runtime dependencies.

**Runtime dependency cycle and cold-start bootstrap.** The development prerequisite graph is acyclic: Self-Measurement must be validated before Self-Healing, which must be validated before Fleet Coherence. The runtime component dependency graph is a different object and can be cyclic: Monitor diagnoses anomalies that Healer acts on; Healer requests resource headroom from Resource Manager; Resource Manager monitors process consumption to enforce quotas, which requires Monitor-derived metrics. This cycle cannot be topologically sorted and creates a cold-start deadlock if naively treated as a DAG.

The {% term(url="@/blog/2026-01-15/index.md#def-18", def="Dependency Isolation Requirement: each autonomic capability layer must fail independently without propagating failures to lower capability layers") %}L0 Dependency Isolation Requirement{% end %} ({% term(url="@/blog/2026-01-15/index.md#def-18", def="Dependency Isolation Requirement: each autonomic capability layer must fail independently without propagating failures to lower capability layers") %}Definition 18{% end %}) breaks this deadlock: each component has an L0 survival-mode variant with zero lateral runtime dependencies — a hardware watchdog with no Monitor feedback, threshold-based healing rules with no Resource Manager input, and static priority tables with no Healer coupling. The cold-start bootstrap sequence is:

1. Hardware watchdog and safe-state logic — zero dependencies
2. Raw sensor baseline from hardware registers — no Healer, no Resource Manager
3. Threshold-based L0 healing — static rules, no MAPE-K
4. Static L0 resource manager — fixed priorities, no process feedback
5. L1+ MAPE-K loops activate once L0 stability is confirmed over \\(T_{\text{stable}}\\)

{% term(url="@/blog/2026-01-15/index.md#prop-8", def="Proof that base-tier failure isolation holds: if each level's runtime dependencies are confined to equal or lower levels, then failure of any level cannot cascade to a lower level") %}Proposition 8{% end %} (Hardened Hierarchy Fail-Down) guarantees that once L1+ enters the cyclic regime, L0 independence is preserved — the cyclic component graph cannot cascade below L0. The capability DAG governs *what you validate first*; {% term(url="@/blog/2026-01-15/index.md#def-18", def="Dependency Isolation Requirement: each autonomic capability layer must fail independently without propagating failures to lower capability layers") %}Definition 18{% end %} governs *how you boot without deadlock*.

**Reading the graph**:
- An arrow from A to B means A is a prerequisite for B
- Capabilities at the same level can be developed in parallel
- No capability should be deployed until all its prerequisites are validated

**Critical path analysis**:

The longest path determines minimum development time. For full L4 capability, the critical path is: Hardware Trust, then L0, then Self-Measurement, then Self-Healing, then Fleet Coherence, then L2, then L3, then L4. This is 8 sequential stages. Attempting to shortcut this path leads to the {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} failure mode: sophisticated capabilities without stable foundations.

**Parallelizable stages**:
- L1 (Basic Mission) and Self-Measurement can develop in parallel after L0
- Self-Healing development can begin once Self-Measurement is partially complete
- Anti-Fragility learning can begin once Fleet Coherence protocols are defined

### Hardware Trust Before Software Health

The deepest layer of the {% term(url="#def-93", def="Dependency graph where an edge A→B means capability A must be substantially solved before B can become binding; valid implementation sequences follow topological order through this graph") %}prerequisite graph{% end %} is hardware trust. All software capabilities assume the hardware is functioning correctly. If hardware is compromised, all software reports are suspect.

**The trust chain** {{ cite(ref="8", title="Bass, Clements & Kazman (2012) — Software Architecture in Practice") }}:

{% katex(block=true) %}
\text{Hardware} \rightarrow \text{Bootloader} \rightarrow \text{OS} \rightarrow \text{Application} \rightarrow \text{Data}
{% end %}

Each layer trusts the layer below it. Compromise at any layer invalidates all layers above.

**Edge-specific hardware threats**:
- **Physical access**: Adversary may physically access devices
- **Supply chain**: Hardware may be compromised before deployment
- **Environmental**: Extreme conditions may cause hardware failures
- **Electromagnetic**: Jamming, EMP, or other interference

**Establishing hardware trust**:

1. **Secure boot**: Cryptographic verification of firmware at startup
2. **Hardware attestation**: Cryptographic proof of hardware identity
3. **Tamper detection**: Physical indicators of unauthorized access
4. **Health monitoring**: Continuous verification of hardware operation

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} example: A perimeter sensor reports "all clear" for 72 hours. But the sensor was physically accessed and modified to always report clear. The self-measurement system trusts the sensor's reports because it has no hardware attestation. The software health metrics show green. The actual security state is compromised.

**Design principle**: Hardware trust must be established before software health can be believed. [Self-measurement](@/blog/2026-01-22/index.md) assumes the hardware it runs on is trustworthy. If this assumption is false, self-measurement is meaningless.

### Local Survival Before Fleet Coordination

A node that cannot survive alone cannot contribute to a fleet. The hierarchy of concerns:

{% katex(block=true) %}
\text{Individual Node} \rightarrow \text{Local Cluster} \rightarrow \text{Fleet-Wide}
{% end %}

**The survival test**: Can each node handle partition gracefully in isolation?
- If yes: Proceed to coordination capabilities
- If no: Fix local survival first

[Fleet coherence](@/blog/2026-02-05/index.md) coordinates state across nodes. But if nodes crash during partition, there is no state to coordinate. If nodes make catastrophic autonomous decisions, coherence reconciles those decisions after the damage is done.

**The sequence**:

1. **Individual node**: L0 survival, basic self-measurement, local healing
2. **Local cluster**: {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %}-based health, local coordination, cluster authority
3. **Fleet-wide**: State reconciliation, hierarchical authority, {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} learning

Testing protocol:
- Isolate each node (simulate complete partition)
- Verify L0 survival over extended period
- Verify local self-measurement functions
- Verify local healing recovers from injected faults
- Only then proceed to coordination testing

{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} example: A drone without fleet coordination can still fly, detect threats, and return to base. This L0/L1 capability must work perfectly before adding swarm coordination. If the individual drone fails under partition, the swarm's coordination capabilities provide no value—they coordinate the failure of their components.

> **Cognitive Map**: The prerequisite graph section translates the abstract constraint sequence into a concrete DAG. The DAG has five layers (foundation, local autonomy, coordination, integration), a single critical path of 8 sequential stages, and three parallelizable windows. The trust chain visualization shows why hardware trust is the true foundation — all health reports, all healing decisions, all CRDT merges depend on trusting the data produced by the hardware. The standalone node test (isolate each node, verify L0 + L1 before adding coordination) is the operational protocol that enforces the DAG in practice.

---

## Constraint Migration at the Edge

> **Problem**: The prerequisite graph is a static structure — it defines which capabilities must come before which. But the binding constraint is not static: it depends on current system state. A system in good connectivity with depleted resources has a different binding constraint than the same system isolated in full adversarial pressure.
> **Solution**: Model constraint migration as a function over a three-dimensional state cube \\((C, R, A)\\) — connectivity, resources, adversary presence. {% term(url="#prop-67", def="Connectivity-Dependent Binding: the set of safely activatable capability constraints at time t is determined by the current connectivity regime and resource state") %}Proposition 67{% end %} defines the binding constraint as the capability with the largest marginal utility gradient. The five key regions (Survival-Critical, Threat-Active, Efficiency-Optimal, Reliability-Balanced, Autonomy-Forced) partition the cube and determine which constraint is binding in each region.
> **Trade-off**: The adversary axis (\\(A_\text{adv}\\)) is routinely omitted in commercial deployments. This is a structural omission — a well-connected, well-resourced system is still Threat-Active when \\(A_\text{adv} > 0.5\\), because adversarial interference corrupts state regardless of \\(C\\) and \\(R\\). The single-variable connectivity model is a cross-section of the full surface at \\(R > 0.5\\) and \\(A_\text{adv} < 0.5\\).

### How Binding Constraints Shift

*Active constraint evaluation: given system state {% katex() %}(\mathcal{C}, \mathcal{R}, \mathcal{A}){% end %} (connectivity, resources, autonomy level), a constraint {% katex() %}c \in \mathbb{C}{% end %} is **active-binding** when two conditions hold simultaneously: its gate validator \\(V_c(S) < \theta_c\\) (gate not currently passing), and the system's capability level \\(L\\) satisfies \\(\sigma(c) \leq L\\) (constraint is in-scope). The active constraint set is {% katex() %}\mathbb{C}_\text{act}(t) = \{c \in \mathbb{C} : V_c(S) < \theta_c \text{ and } \sigma(c) \leq L(t)\}{% end %}.*

<span id="def-94"></span>
**Definition 94** (Constraint Migration). *A system exhibits {% term(url="#def-94", def="When the connectivity regime changes, the binding capability shifts — what was optional becomes critical, and what was critical becomes achievable; the engineering priority order re-ranks accordingly") %}constraint migration{% end %} if the binding constraint \\(c^\*(t)\\) varies with system state \\(S(t)\\):*

{% katex(block=true) %}
c^*(t) = \arg\max_{c \in \mathcal{C}} \text{Impact}(c, S(t))
{% end %}

*where {% katex() %}\text{Impact}(c, S){% end %} measures the throughput limitation imposed by constraint \\(c\\) in state \\(S\\).*

*In practice: switch to working on whichever bottleneck is most limiting overall system utility right now — the argmax selects the constraint whose marginal relaxation produces the largest instantaneous utility gain, ensuring the system always targets the binding constraint rather than the most recently violated one.*

The binding constraint is the one whose relaxation would most improve throughput. Formally: {% katex() %}c^*(S) = \arg\max_c \text{Impact}(c, S){% end %} where {% katex() %}\text{Impact}(c, S) = R_{\text{required}}(c, S) / R_{\text{available}}(S){% end %} — the ratio of resources this constraint demands to resources available. The constraint with Impact closest to 1 is binding (it is consuming nearly all available resources and would benefit most from relaxation).

**Compute Profile:** CPU: {% katex() %}O(|\mathcal{C}|){% end %} per evaluation — scan over all constraints to compute Impact scores and find the argmax. Memory: {% katex() %}O(|\mathcal{C}|){% end %} — one Impact score per capability level. Evaluate on every MAPE-K tick rather than on a separate slower schedule.

<span id="def-130"></span>
**Definition 130** (Resource State). *Resource State is introduced in this article as a normalized composite of battery, memory, and CPU availability. It should not be confused with {% term(url="@/blog/2026-01-15/index.md#def-1", def="Connectivity State: binary or graded measure of a node's current network reachability, from fully connected to fully denied") %}Definition 1 (Connectivity State){% end %}, which measures network accessibility rather than local resource availability.*

{% katex(block=true) %}
R(t) = \frac{E_{\text{battery}}(t)}{E_{\min}} \cdot w_E + \frac{M_{\text{free}}(t)}{M_{\text{total}}} \cdot w_M + \frac{\text{CPU}_{\text{idle}}(t)}{\text{CPU}_{\text{total}}} \cdot w_C \;\in\; [0,1]
{% end %}

*Critical threshold: {% katex() %}R_{\text{crit}} \approx 0.2{% end %}. Weights: \\(w_E + w_M + w_C = 1\\); RAVEN: {% katex() %}w_E=0.5,\, w_M=0.25,\, w_C=0.25{% end %}. \\(R(t)\\) forms the resource axis of the three-dimensional state cube \\((C, R, A)\\) used in {% term(url="#def-94", def="Constraint Migration: process of activating a new constraint level while safely deactivating the previous one, preserving invariants across the transition") %}Definition 94{% end %} through {% term(url="#prop-67", def="Connectivity-Dependent Binding: the set of safely activatable capability constraints at time t is determined by the current connectivity regime and resource state") %}Proposition 67{% end %} of this article.*

<span id="def-95"></span>
**Definition 95** (Adversary Presence). *Let {% katex() %}A_{\text{adv}}(t) \in [0, 1]{% end %} denote the estimated adversary threat level at time \\(t\\):*

{% katex(block=true) %}
A_{\text{adv}}(t) = P(\text{jamming}) \cdot w_J + P(\text{spoofing}) \cdot w_S + P(\text{physical}) \cdot w_P
{% end %}

*with weights summing to 1. High threat ({% katex() %}A_{\text{adv}} > 0.5{% end %}) shifts binding priority toward trust verification and {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} learning regardless of connectivity state.*

*(renamed {% katex() %}A_{\text{adv}}(t){% end %} to avoid collision with the defender action set \\(A\\) used in {% term(url="@/blog/2026-02-12/index.md#def-80", def="Adversarial Markov Game: Stackelberg game model where attacker selects jamming strategy after observing the defender's architecture choice") %}Definition 80{% end %})*

<span id="prop-67"></span>
**Proposition 67** (Multi-Dimensional Constraint Migration). *The binding constraint \\(c^\*\\) is determined by the utility gradient across all state dimensions \\((C, R, A)\\):*

*The capability dimension where a 1% improvement yields the biggest utility gain is always the binding constraint — and that answer changes when the adversary axis rises above 0.5, even with abundant bandwidth and power.*

{% katex(block=true) %}
c^*(C, R, A) = \arg\max_{c} \left| \frac{\partial U}{\partial c}(C, R, A) \right|
{% end %}

- **Use**: Identifies the binding constraint as the capability dimension with the largest marginal utility gradient across connectivity, resource, and adversary axes simultaneously; apply when all three axes shift at once to prevent single-axis drift that optimizes efficiency while a threat corrupts the system undetected.
- **Parameters**: {% katex() %}\partial U/\partial c{% end %} evaluated numerically from telemetry; apply {% katex() %}\pm 10\%{% end %} hysteresis to boundary transitions to prevent oscillation.
- **Field note**: The adversary axis is routinely omitted in commercial deployments — add it explicitly or the gradient always points toward connectivity and resource optimization while ignoring threats.

> **Physical translation**: \\(\partial U / \partial c\\) is the marginal value of improving capability \\(c\\) by one unit. The binding constraint is whichever capability has the largest marginal value — the capability where a 1% improvement yields the largest system-wide utility gain. When \\(R < 0.2\\), the marginal value of survival improvements (keeping the system alive at all) exceeds the marginal value of any other improvement — survival is binding. When \\(A_\text{adv} > 0.5\\), the marginal value of trust verification exceeds efficiency improvements — an optimized-but-compromised system provides negative value. The five regions are the stable regimes of this gradient surface. A constraint that depends on cloud connectivity (\\(C > 0.8\\)) has a utility gradient of zero when \\(C = 0\\) — it cannot activate while the node is partitioned; it waits at the Autonomy-Forced region boundary until connectivity is restored.

*This produces a piecewise-constant surface over the \\((C, R, A)\\) state cube. Key regions:*

| Region | Conditions | Binding Constraint | Rationale |
| :--- | :--- | :--- | :--- |
| Survival-Critical | {% katex() %}R < R_{\text{crit}}{% end %} or (\\(C = 0\\) and \\(R < 0.5\\)) | **Survival** | Resources or connectivity too low for anything else |
| Threat-Active | \\(A_\text{adv} > 0.5\\) | **Trust/Anti-Fragility** | Adversary presence makes verification and learning paramount |
| Efficiency-Optimal | \\(C > 0.8\\) and \\(R > 0.5\\) and \\(A_\text{adv} < 0.3\\) | **Efficiency** | Abundant resources enable optimization |
| Reliability-Balanced | \\(0.3 < C \leq 0.8\\) and \\(R > 0.5\\) | **Reliability** | Scarce connectivity makes delivery the bottleneck |
| Autonomy-Forced | \\(C \leq 0.3\\) and \\(R > 0.5\\) | **Autonomy** | Isolation requires local decision-making |

*Transition boundaries carry \\(\pm 10\\%\\) margins to prevent oscillation.*

*Proof sketch*: Treating system utility \\(U(C, R, A)\\) as smooth over the state cube, the binding constraint at any state is whichever capability — if improved by 1% — yields the largest utility gain, i.e., the constraint with maximum impact ratio ({% term(url="#def-94", def="Constraint Migration: process of activating a new constraint level while safely deactivating the previous one, preserving invariants across the transition") %}Definition 94{% end %}).

*Survival dominates when {% katex() %}R < R_{\text{crit}}{% end %} — resource exhaustion overrides communication state — or when \\(C = 0\\) and \\(R < 0.5\\), where no external path exists and the resource margin is insufficient for sustained autonomous operation. Trust/{% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} dominates at \\(A_\text{adv} > 0.5\\) because adversarial interference raises {% katex() %}\partial U / \partial \text{Trust}{% end %} above all other partial derivatives: unverified state and corrupted learning invalidate efficiency and reliability optimizations.*

*The efficiency/reliability/autonomy ordering of the remaining regions follows the connectivity-gradient argument: as \\(C\\) falls below 0.8, message delivery becomes scarce; below 0.3, isolation makes local decision authority the critical capability. These dominance orderings hold when \\(R > 0.5\\) and \\(A_\text{adv} < 0.5\\) — the original single-variable model is the cross-section of this surface at favorable resource and threat levels.*

Unlike static systems where the binding constraint is stable, edge systems experience **{% term(url="#def-94", def="When the connectivity regime changes, the binding capability shifts — what was optional becomes critical, and what was critical becomes achievable; the engineering priority order re-ranks accordingly") %}constraint migration{% end %}**—the binding constraint changes based on system state—connectivity level, resource availability, and adversary presence.

**Utility gradient intuition**: The binding constraint is whichever capability, if improved by 1%, would most increase overall system utility — exactly what {% katex() %}\partial U / \partial c{% end %} measures:

- If {% katex() %}\partial U / \partial \text{Efficiency}{% end %} is largest, efficiency improvements yield the highest return — Efficiency is the binding constraint
- If {% katex() %}\partial U / \partial \text{Survival}{% end %} is largest, survival improvements yield the highest return — Survival is the binding constraint

The multi-dimensional model captures state interactions: high \\(A_\text{adv}\\) (adversary) raises {% katex() %}\partial U / \partial \text{Trust}{% end %} even when \\(C\\) and \\(R\\) are individually favorable, because an adversary can corrupt an optimized-but-unverified system.

**Three-way interaction**: Connectivity, resources, and threats interact non-linearly:

- **High \\(C\\), low \\(R\\)**: Survival-Critical despite good connectivity — a well-connected system with depleted resources cannot sustain operations
- **Low \\(C\\), high \\(R\\), high \\(A_\text{adv}\\)**: Threat-Active — isolated, resourced, and under adversarial pressure; trust verification and {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} learning take precedence over autonomy optimization
- **Medium \\(C\\), medium \\(R\\), low \\(A_\text{adv}\\)**: Reliability-Balanced — the original "degraded" case, valid when threat levels are absent
- **High \\(C\\), high \\(R\\), high \\(A_\text{adv}\\)**: Threat-Active overrides Efficiency-Optimal — abundant resources and connectivity provide no advantage if adversarial interference corrupts state

The single-variable connectivity model holds when \\(R > 0.5\\) and \\(A_\text{adv} < 0.5\\) — the favorable-baseline cross-section of the full state surface.

**Calibration**: Thresholds should be set from operational data:
- {% katex() %}R_{\text{crit}}{% end %}: Resource level at which systems enter emergency mode (measure from operational logs)
- {% katex() %}A_{\text{threshold}}{% end %}: Threat sensitivity calibrated to deployment context (tactical edge: 0.3–0.5; commercial edge: 0.1–0.3)

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}: {% katex() %}R_{\text{crit}} = 0.25{% end %} (25% battery triggers return-to-base), {% katex() %}A_{\text{threshold}} = 0.4{% end %} (moderate jamming detected). For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}: {% katex() %}A_{\text{threshold}} = 0.5{% end %} (high-threat environment with sustained jamming baseline); the connected-state threshold may also fall to \\(C = 0.5\\) given lower baseline satellite link capacity.

**Architecture implication**: The system must handle all constraint configurations. It is not sufficient to optimize for connected state if the system spends 60% of time in degraded or denied states. The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} must address all states.

### Connectivity-Dependent Capability Targets

Each connectivity state has different capability targets:

**Connected (\\(C > 0.8\\))**:
- Target capability: L3-L4 (fleet coordination, full integration)
- Enable: Streaming telemetry, real-time coordination, model updates
- Optimize: Latency, throughput, efficiency

**Degraded (\\(0.3 < C \leq 0.8\\))**:
- Target capability: L2 (local coordination)
- Enable: Priority messaging, cluster coherence, selective sync
- Optimize: Message priority, queue management, selective retransmission

**Denied (\\(0 < C \leq 0.3\\))**:
- Target capability: L1 (basic mission)
- Enable: Autonomous operation, local decisions, state caching
- Optimize: Autonomy, local resources, decision logging

**Emergency (\\(C = 0\\), resources critical)**:
- Target capability: L0 (survival)
- Enable: Safe state, power conservation, distress beacon
- Optimize: Endurance, safety, recovery potential

The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} must ensure each state's target capability is achievable before assuming higher states will be available. Design for denied, enhance for connected.

The labels used here (Connected/Degraded/Denied/Emergency) are a practical operational simplification; the authoritative regime taxonomy is the four-valued \\(\Xi(t)\\) from {% term(url="@/blog/2026-01-15/index.md#def-6", def="Connectivity Regime: cloud regime requires high average connectivity and near-zero disconnection probability; contested edge regime has low average connectivity and frequent disconnections") %}Definition 6{% end %} (Connected/Degraded/Intermittent/None), where "Denied" here corresponds to Intermittent (\\(0 < C \leq 0.3\\)) and "Emergency" corresponds to the None regime (\\(C = 0\\)) combined with a resource-critical condition.

### Dynamic Re-Sequencing

Static {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %}s are defined at design time. But operational conditions may require dynamic adjustment of priorities.

*(Note: "phase" in this section refers to development maturity in the Constraint Sequence ({% term(url="#def-92", def="Constraint Sequence: ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint") %}Definition 17{% end %}), not to capability hierarchy levels L0–L4 from the capability automaton ([Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md)). Both hierarchies are in use concurrently; context disambiguates.)*

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} example**: Normal priority sequence:
1. Fleet coordination
2. Surveillance collection
3. Self-measurement
4. Learning/adaptation

During heavy jamming, re-sequenced priorities:
1. Self-measurement (detect anomalies before propagation)
2. Fleet coordination (limited to essential)
3. Surveillance (reduced bandwidth)
4. Learning (suspended)

The jamming environment elevates self-measurement because anomalies must be detected before they cascade. Re-sequencing triggers when {% katex() %}A_{\text{adv}}(t) > A_{\text{threshold}}{% end %} ({% term(url="#def-95", def="Extended Resource State with partition accumulator: resource state augmented with disconnection duration to capture resource drain from sustained partitions") %}Definition 95{% end %}), not just on anecdotal jamming observation — this connects the formal adversary model to operational priority shifts. This is dynamic re-sequencing based on observed conditions.

**Risks of re-sequencing**:
- **Adversarial gaming**: If the adversary knows re-sequencing rules, they can trigger priority shifts that benefit them
- **Oscillation**: Rapid priority shifts may cause instability
- **Complexity**: Re-sequencing logic itself becomes a failure mode

**Mitigations**:
- Bound re-sequencing to predefined configurations (no arbitrary priority changes)
- Require {% katex() %}A_{\text{adv}}(t) > A_{\text{threshold}}{% end %} sustained for {% katex() %}\geq T_{\text{confirm}}{% end %} before triggering re-sequence — this closes the adversarial gaming gap, as an adversary cannot drive priority shifts without sustaining detectable threat levels above the confidence threshold
- Rate-limit priority changes to prevent oscillation
- Test re-sequencing logic as rigorously as primary logic

> **Cognitive Map**: The constraint migration section generalizes the static prerequisite graph into a dynamic model. The three-dimensional state cube \\((C, R, A)\\) captures the full operational context. The five key regions partition this cube into stable binding-constraint assignments. {% term(url="#prop-67", def="Connectivity-Dependent Binding: the set of safely activatable capability constraints at time t is determined by the current connectivity regime and resource state") %}Proposition 67{% end %} provides the gradient-based formal definition. The connectivity-dependent capability targets table gives the operational implementation — each connectivity regime has a target capability level and the specific capabilities to enable and optimize within it. The adversary threshold requires sustained detection above {% katex() %}A_{\text{threshold}}{% end %} before re-sequencing, closing the gaming gap.

> **Empirical status**: The \\(\pm 10\\%\\) hysteresis margins and the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}/{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} threshold values (\\(R_{\text{crit}} = 0.25\\), \\(A_{\text{threshold}} = 0.4\\)–\\(0.5\\)) are calibrated from simulation; the appropriate hysteresis width depends on the observed oscillation frequency at state boundaries, and the adversary threshold must be re-measured per deployment context — tactical edge deployments with sustained RF jamming baselines typically require \\(A_{\text{threshold}}\\) closer to 0.3 than the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} 0.4 figure.

---

## The Meta-Constraint of Edge

> **Problem**: Autonomic capabilities consume resources — CPU for health checks, bandwidth for gossip, memory for CRDT state, compute for bandit weight updates. These resources compete directly with the primary mission. A drone spending 40% of its CPU on self-measurement has 40% less CPU for threat detection.
> **Solution**: The meta-constraint {% katex() %}R_{\text{autonomic}} + R_{\text{mission}} \leq R_{\text{total}}{% end %} bounds autonomic overhead. {% term(url="#prop-68", def="Autonomic Overhead Bound: total autonomic stack memory must stay below the critical resource threshold; the Zero-Tax tier satisfies this bound for MCUs down to 4 KB SRAM") %}Proposition 68{% end %} gives the feasibility condition: if the minimum resource requirement for full autonomic management exceeds the ceiling {% katex() %}R_{\text{total}} - R_{\text{mission}}^{\min}{% end %}, the system cannot simultaneously fulfill its mission and self-manage. Practical allocation: mission 70–25%, measurement 10–79%, healing 5–10%, coherence 5–10%, learning 1–24%.
> **Trade-off**: Ultra-constrained hardware (STM8L151, 4–36 KB SRAM) cannot run the full autonomic stack — the stack exceeds the autonomic ceiling by 8–\\(16\\times\\). The zero-tax implementation uses hardware registers and flash writes instead of SRAM structures, enabling OBSERVE-only capability in 140 bytes. Hardware tier determines maximum achievable capability level.

### Optimization Competes for Resources

Every autonomic capability consumes resources:
- **[Self-measurement](@/blog/2026-01-22/index.md)**: CPU for health checks, memory for baselines, bandwidth for {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}
- **[Self-healing](@/blog/2026-01-29/index.md)**: CPU for healing logic, power for recovery actions, bandwidth for coordination
- **[Fleet coherence](@/blog/2026-02-05/index.md)**: Bandwidth for state sync, memory for conflict buffers, CPU for merge operations
- **[{% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} learning](@/blog/2026-02-12/index.md)**: CPU for model updates, memory for learning history, bandwidth for parameter distribution

<span id="prop-68"></span>
**Proposition 68** (Autonomic Overhead Bound). *For a system with total resources {% katex() %}R_{\text{total}}{% end %} and minimum mission resource requirement {% katex() %}R_{\text{mission}}^{\min}{% end %}, the maximum feasible autonomic overhead is:*

*Whatever you can't spend on the mission is all you have for self-management — on a 500 mW sensor node with 350 mW mission floor, {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s entire autonomic stack must fit in 150 mW.*

{% katex(block=true) %}
R_{\text{autonomic}}^{\max} = R_{\text{total}} - R_{\text{mission}}^{\min}
{% end %}

- **Use**: Computes the maximum resource ceiling available for all autonomic functions before mission capability is impaired; use this ceiling at integration time to allocate across self-measurement, healing, coherence, and learning and prevent mission starvation from heavy autonomic overhead.
- **Parameters**: {% katex() %}R_{\text{mission}}^{\min} = 70\text{--}80\%{% end %} of {% katex() %}R_{\text{total}}{% end %} for most deployments; autonomic ceiling {% katex() %}= 20\text{--}30\%{% end %} total.
- **Field note**: Measure autonomic overhead in isolation first — it routinely consumes \\(2{-}3\\times\\) the designed budget in production environments.

*Systems where {% katex() %}R_{\text{autonomic}}^{\min} > R_{\text{autonomic}}^{\max}{% end %} cannot achieve both mission capability and self-management.*

For concrete autonomic overhead figures ({% katex() %}R_{\text{autonomic}}{% end %} in mW by capability level), see {% term(url="@/blog/2026-01-29/index.md#def-51", def="Autonomic Overhead Power Map: mapping from capability level to autonomic stack power consumption, showing where monitoring overhead exceeds healing benefit") %}Definition 51{% end %} (Self-Healing Without Connectivity), which provides L0–L4 power consumption bounds: L0 \\(\approx\\) 0.1 mW through L4 \\(\approx\\) 42 mW. These figures instantiate the Law 3 constraint for {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} and {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} deployments.

These resources compete with the primary mission. A drone spending 40% of its CPU on self-measurement has 40% less CPU for threat detection. This creates the **meta-constraint**:

{% katex(block=true) %}
R_{\text{autonomic}} + R_{\text{mission}} \leq R_{\text{total}}
{% end %}

Where:
{% katex(block=true) %}
R_{\text{autonomic}} = R_{\text{measure}} + R_{\text{heal}} + R_{\text{coherence}} + R_{\text{learn}}
{% end %}
- {% katex() %}R_{\text{mission}}{% end %} = resources for primary mission function
- {% katex() %}R_{\text{total}}{% end %} = total available resources

> **Physical translation**: {% katex() %}R_{\text{autonomic}} + R_{\text{mission}} \leq R_{\text{total}}{% end %} is a hard resource budget constraint. On a 500 mW edge device with 350 mW mission minimum, the autonomic ceiling is 150 mW. The four autonomic functions (measure, heal, coherence, learn) must collectively fit within this 150 mW. If self-healing alone requires 100 mW at peak, and gossip requires 80 mW, the total (180 mW) violates the constraint — one capability must be reduced. The table above gives the recommended allocation percentages; the actual values depend on platform-specific power measurements, not design-time estimates.

> **Empirical status**: The 70–80% mission / 20–30% autonomic split is a rule-of-thumb derived from {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} and {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} power-profiling; the correct ceiling depends on the platform's idle power floor and peak healing-action cost, and autonomic overhead routinely runs \\(2{-}3\\times\\) the designed budget in production — measure it in isolation before setting \\(R_{\text{mission}}^{\min}\\).

If {% katex() %}R_{\text{autonomic}}{% end %} is too large, mission capability suffers. If {% katex() %}R_{\text{autonomic}}{% end %} is too small, the system cannot self-manage and fails catastrophically.

**The optimization infrastructure paradox**: The system optimizing itself competes with the system being optimized. Self-measurement that is too thorough leaves no resources for the thing being measured. Self-healing that is too aggressive destabilizes the thing being healed.

### Budget Allocation Across Autonomic Functions

Practical resource allocation requires explicit budgets:

<style>
#tbl_budget + table th:first-of-type { width: 25%; }
#tbl_budget + table th:nth-of-type(2) { width: 20%; }
#tbl_budget + table th:nth-of-type(3) { width: 55%; }
</style>
<div id="tbl_budget"></div>

| Function | Budget Range | Rationale |
| :--- | :--- | :--- |
| Mission | 70-80% | Primary function; majority of resources |
| Measurement | 10-15% | Continuous; scales with complexity |
| Healing | 5-10% | Burst capacity; dormant when healthy |
| Coherence | 5-10% | Event-driven; peaks on reconnection |
| Learning | 1-5% | Background; lowest priority |

**Dynamic adjustment**: Budgets shift based on system state:
- **During healing**: Steal from learning (healing is urgent, learning can wait)
- **Post-reconnection**: Elevate coherence budget (reconciliation backlog)
- **Stable operation**: Invest in learning (conditions favor adaptation)
- **Resource stress**: Reduce all autonomic budgets (mission priority)

The budget allocation itself is a constraint—it determines what autonomic capabilities are feasible. A resource-constrained edge device (e.g., 500mW power budget) may not be able to afford all autonomic functions. The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} must account for resource availability.

### Zero-Tax Implementation for Ultra-Constrained Hardware

<span id="zero-tax-autonomic"></span>

The budget table above assumes a node can afford a 13 KB autonomic stack. On true edge hardware — STM8L151 sensor nodes, Cortex-M0+ beacons, LoRaWAN endpoint MCUs — this assumption fails before a single line of mission code runs. The full autonomic stack (EWMA baseline, Merkle health ledger, gossip table, EXP3-IX weight vector, event queue, vector clock) totals approximately 13 KB of SRAM. On a 4–36 KB device, the autonomic ceiling from {% term(url="#prop-68", def="Autonomic Overhead Bound: total autonomic stack memory must stay below the critical resource threshold; the Zero-Tax tier satisfies this bound for MCUs down to 4 KB SRAM") %}Proposition 68{% end %} is 800–5,600 bytes: the stack exceeds its budget by \\(8{-}16\\times\\).

<style>
#tbl_zero_tax + table th:first-of-type { width: 15%; }
#tbl_zero_tax + table th:nth-of-type(2) { width: 14%; }
#tbl_zero_tax + table th:nth-of-type(3) { width: 10%; }
#tbl_zero_tax + table th:nth-of-type(4) { width: 16%; }
#tbl_zero_tax + table th:nth-of-type(5) { width: 16%; }
#tbl_zero_tax + table th:nth-of-type(6) { width: 12%; }
#tbl_zero_tax + table th:nth-of-type(7) { width: 17%; }
</style>
<div id="tbl_zero_tax"></div>

| Hardware Tier | Example MCU | SRAM | Autonomic Ceiling | Standard Stack | OBSERVE State | Max Capability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Ultra (L0) | STM8L151 | 4–36 KB | 0.8–5.6 KB | ~13 KB — **infeasible** | 140 B — feasible | OBSERVE only |
| Constrained (L1) | STM32L0 | 8–80 KB | 1.6–26.4 KB | ~13 KB — marginal | 140 B — feasible | OBSERVE + WAKEUP |
| Standard (L2) | STM32L4 | 64 KB | 12.8 KB | ~13 KB — feasible | 140 B — feasible | Full MAPE-K (no MAB) |
| Rich (L3+) | STM32H7 | 256 KB+ | 51 KB | ~13 KB — feasible | 140 B — feasible | Full stack |

*Standard stack breakdown*: EWMA state 80 B + Kalman matrices 80 B + Merkle health tree 8,160 B + gossip table 1,000 B + EXP3-IX weights 2,048 B + event queue 1,024 B + vector clock 200 B = **12,592 B \\(\\approx\\) 13 KB**. Zero-Tax OBSERVE state: hash chain 16 B + fixed-point EWMA 40 B + threshold vector 20 B + Bloom filter 60 B + state flags 4 B = **140 B** — a **\\(65\\times\\) footprint reduction**.

The Zero-Tax approach defers full stack initialization until anomaly evidence is quorum-confirmed.

> **Sensing cost is separate from logic cost.** The Zero-Tax tier budgets for *autonomic logic* — the computation performed once sensor data is available. It does not budget for *state estimation overhead*: the power required to run sensors at the rate needed to keep the state estimate \\(x(t)\\) fresh enough for safety-critical checks. At baseline MAPE-K rates (0.2 Hz for RAVEN), sensing cost is absorbed into the platform's normal sensor budget. If the dCBF safety filter activates and requires high-rate IMU sampling (10–72 Hz), the sensing cost rises by \\(10\text{--}72\\times\\) and must be drawn from the emergency power reserve — not the Zero-Tax logic budget. Deployments that treat Zero-Tax logic cost as the total autonomic overhead will underestimate power consumption during fault events by one to two orders of magnitude.

<span id="def-128"></span>

**Definition 128** (Zero-Tax Autonomic State Machine). *A three-state lazy-initialization machine with states* **OBSERVE**, **WAKEUP**, **ACTIVE** *and transitions:*

{% katex(block=true) %}
\texttt{OBSERVE} \;\xrightarrow{z_t > \theta_0 \;\text{for}\; \tau_{\mathrm{confirm}}\;\text{ticks}}\; \texttt{WAKEUP} \;\xrightarrow{\text{quorum}=\text{FAULT}}\; \texttt{ACTIVE}
{% end %}

*with back-transitions* {% katex() %}\texttt{ACTIVE} \to \texttt{OBSERVE}{% end %} *on three consecutive clean ticks and* {% katex() %}\texttt{WAKEUP} \to \texttt{OBSERVE}{% end %} *on quorum=BENIGN verdict.*

*Resource consumption per state:*
- **OBSERVE** (steady-state): hash chain + fixed-point EWMA + threshold vector + Bloom filter = **140 B SRAM**; one SipHash-2-4 per tick ({% katex() %}\approx 200\,\text{ns}{% end %} at Cortex-M0+)
- **WAKEUP** (anomaly suspected): adds gossip init buffer + peer-validation queue = **+2 KB SRAM**; gossip at reduced rate
- **ACTIVE** (fault confirmed): full MAPE-K stack = **+11 KB SRAM**; all capabilities enabled; reverts to OBSERVE after three consecutive clean ticks

{% mermaid() %}
stateDiagram-v2
    [*] --> OBSERVE
    OBSERVE --> WAKEUP : z_t > theta0 for tau_confirm ticks
    WAKEUP --> OBSERVE : quorum = BENIGN
    WAKEUP --> ACTIVE : quorum = FAULT
    ACTIVE --> OBSERVE : 3 consecutive clean ticks
{% end %}

- **Computes**: Active SRAM tier (140 B / +2 KB / +11 KB) as a function of anomaly-evidence state; 140 B in steady-state.
- **Apply when**: On any MCU where the full 13 KB stack exceeds the autonomic ceiling from {% term(url="#prop-68", def="Autonomic Overhead Bound: total autonomic stack memory must stay below the critical resource threshold; the Zero-Tax tier satisfies this bound for MCUs down to 4 KB SRAM") %}Proposition 68{% end %}.
- **Parameters**: tau_confirm = 3 ticks (default); theta_0 = initial EWMA threshold; reduce tau_confirm for fast-fault environments.
- **Prevents**: Stack-induced mission starvation — full MAPE-K only allocates when anomaly evidence is quorum-confirmed.

<span id="def-129"></span>

**Definition 129** (In-Place Hash Chain). *A health ledger using SipHash-2-4 applied iteratively to a 16-byte state register:*

{% katex(block=true) %}
h[n] = \mathrm{SipHash}_{2\text{-}4}\!\bigl(h[n-1] \;\|\; \hat{x}[n]\bigr), \qquad h[0] = k_{\mathrm{root}}
{% end %}

*where {% katex() %}\hat{x}[n]{% end %} is the 8-bit quantized metric vector at tick {% katex() %}n{% end %} and {% katex() %}k_{\mathrm{root}}{% end %} is a device-unique key provisioned at manufacture. Any corruption or replay of {% katex() %}\hat{x}[n]{% end %} propagates into {% katex() %}h[n]{% end %} within one tick; a remote peer holding {% katex() %}h_{\mathrm{peer}}[n]{% end %} detects divergence by comparing the 4-byte chain suffix.*

| | Hash Chain | Merkle Tree (1,024 nodes) |
| :--- | :--- | :--- |
| SRAM | 16 B state + 4 B suffix | 8,192 B |
| CPU per tick | \\(1\\times\\) SipHash {% katex() %}\approx 200\,\text{ns}{% end %} | \\(10\\times\\) hash operations |
| Per-node proof | No — sequence integrity only | Yes |
| FPU required | No | No |

- **Computes**: A 16-byte running integrity digest of the metric history since last sync; detects tampering within one tick.
- **Apply when**: On Ultra/Constrained-tier MCUs where the Merkle health tree exceeds the autonomic ceiling ({% term(url="#prop-68", def="Autonomic Overhead Bound: total autonomic stack memory must stay below the critical resource threshold; the Zero-Tax tier satisfies this bound for MCUs down to 4 KB SRAM") %}Proposition 68{% end %}).
- **Parameters**: k_root provisioned at manufacture; 4-byte suffix comparison gives {% katex() %}2^{32} \approx 4{% end %} billion collision resistance.
- **Prevents**: Undetected metric corruption — single-byte tampering shifts the hash chain within one MAPE-K tick.

<span id="def-98"></span>

**Definition 98** (Fixed-Point EWMA). *An exponentially weighted moving average in Q8.8 fixed-point arithmetic using only 16-bit integer operations:*

{% katex(block=true) %}
\mu[n] = \frac{\alpha_{\mathrm{fp}} \cdot x[n] \;+\; (256 - \alpha_{\mathrm{fp}}) \cdot \mu[n-1]}{256}, \qquad \alpha_{\mathrm{fp}} \in \{1, \ldots, 255\}
{% end %}

*where {% katex() %}\alpha = \alpha_{\mathrm{fp}} / 256{% end %} is the smoothing coefficient encoded as an unsigned byte. The update compiles to 2 MUL + 1 ADD + 1 SHR on Cortex-M0+ ({% katex() %}\approx 10\,\text{ns}{% end %} at 32 MHz); no FPU instruction is required.*

*MCU implementation*: maintain a signed 16-bit accumulator `mu`; on each tick, compute `mu = (alpha_fp * x + (256 - alpha_fp) * mu) >> 8` using two 16-bit multiply instructions and one arithmetic right-shift — no floating-point unit required. The right-shift by 8 implements the division by 256 implicit in the Q8.8 representation.

*For OUTPOST sensor nodes:* {% katex() %}\alpha_{\mathrm{fp}} = 26{% end %} gives {% katex() %}\alpha \approx 0.102{% end %} (10-sample effective window). Total SRAM: 40 B (state 2 B + variance 2 B + threshold 2 B + 16-sample history 32 B + flags 2 B).

- **Computes**: EWMA baseline and running variance in Q8.8 fixed-point; result in same scale as 8-bit quantized input.
- **Apply when**: On Cortex-M0+, STM8, or AVR MCUs without FPU where floating-point EWMA costs \\(10{-}100\\times\\) more CPU.
- **Parameters**: alpha_fp = 26 (\\(\alpha \approx 0.10\\), 10-sample window); increase to 51 (\\(\alpha \approx 0.20\\)) for faster-drifting signals.
- **Prevents**: FPU-dependency lock-in — soft-float EWMA on Cortex-M0+ costs \\(\\approx 50\\) cycles per update vs. 4 cycles fixed-point.

<span id="prop-69"></span>

**Proposition 69** (Wakeup Latency Bound). *Under Definition 128, the worst-case transition latency from OBSERVE to ACTIVE satisfies:*

*Three confirmation ticks plus one gossip round is all the time the system has to wake up — {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}'s 127-sensor mesh takes at most 45 seconds, leaving 75 seconds of margin before the healing deadline.*

{% katex(block=true) %}
T_{\mathrm{wakeup}} \leq \tau_{\mathrm{confirm}} \cdot T_{\mathrm{tick}} + T_{\mathrm{gossip}}
{% end %}

*where {% katex() %}T_{\mathrm{gossip}} = O(D \ln n / \lambda){% end %} is the gossip convergence bound from {% term(url="@/blog/2026-01-22/index.md#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}. For the Zero-Tax stack to preserve the healing deadline from {% term(url="@/blog/2026-01-29/index.md#prop-21", def="Healing Deadline: upper bound on time-to-resolution for healing actions of given severity, derived from MAPE-K tick rate and action queue depth") %}Proposition 21{% end %}:*

{% katex(block=true) %}
T_{\mathrm{wakeup}} \leq T_{\mathrm{heal}} - T_{\mathrm{detect}} - T_{\mathrm{margin}}
{% end %}

*Proof.* The OBSERVE-to-WAKEUP transition requires {% katex() %}\tau_{\mathrm{confirm}}{% end %} consecutive anomaly ticks: at most {% katex() %}\tau_{\mathrm{confirm}} \cdot T_{\mathrm{tick}}{% end %} seconds. The WAKEUP-to-ACTIVE transition requires one gossip round for quorum formation: at most {% katex() %}T_{\mathrm{gossip}}{% end %} seconds. Sequential composition gives the upper bound. The second inequality is the necessary condition for {% term(url="@/blog/2026-01-29/index.md#prop-21", def="Healing Deadline: upper bound on time-to-resolution for healing actions of given severity, derived from MAPE-K tick rate and action queue depth") %}Proposition 21{% end %}'s end-to-end healing deadline {% katex() %}T_{\mathrm{heal}}{% end %} to remain intact after wakeup overhead is deducted from the detect sub-budget. \\(\square\\)

| Scenario | tau_confirm | T_tick | T_gossip | T_wakeup | T_heal | Margin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| OUTPOST (127 sensors) | 3 | 5 s | 30 s | \\(\leq\\) 45 s | 120 s | 75 s |
| RAVEN (47 drones) | 2 | 2 s | 15 s | \\(\leq\\) 19 s | 30 s | 11 s |
| Ultra-L0 OBSERVE-only | — | 5 s | — | does not transition | — | alert-only |

- **Computes**: Worst-case end-to-end wakeup latency from OBSERVE to full MAPE-K-ACTIVE, composed of confirmation + gossip convergence.
- **Apply when**: Sizing tau_confirm and T_tick on constrained hardware to guarantee wakeup fits within the healing deadline.
- **Parameters**: tau_confirm = 3 (typical); T_gossip from {% term(url="@/blog/2026-01-22/index.md#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}; T_heal from {% term(url="@/blog/2026-01-29/index.md#prop-21", def="Healing Deadline: upper bound on time-to-resolution for healing actions of given severity, derived from MAPE-K tick rate and action queue depth") %}Proposition 21{% end %} minus T_detect.
- **Prevents**: Silent deadline violation — the lazy-init stack appears lighter in benchmarks but misses T_heal if tau_confirm is oversized.

> **Empirical status**: The 45 s ({% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}) and 19 s ({% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}) wakeup latency figures are worst-case bounds computed from {% katex() %}\tau_{\mathrm{confirm}} \cdot T_{\mathrm{tick}} + T_{\mathrm{gossip}}{% end %} using the {% term(url="@/blog/2026-01-22/index.md#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %} gossip bound; actual wakeup in low-congestion field conditions is typically 30–50% faster, and \\(\tau_{\mathrm{confirm}}\\) should be re-tuned if the ambient false-anomaly rate changes deployment-to-deployment to avoid trading margin for sensitivity.

**The autonomic richness trade-off.** The Zero-Tax architecture trades *richness* for *feasibility*: a node in OBSERVE state cannot run EXP3-IX bandit selection, Kalman filtering, or the Weibull circuit breaker — those require ACTIVE state and the full 13 KB stack. This materializes the constraint sequence of {% term(url="#def-92", def="Constraint Sequence: ordered list of autonomic capabilities that must be activated in prerequisite order; violation of ordering creates unstable composed systems") %}Definition 92{% end %} as an *economic* ordering, not just a logical one. Self-measurement (hash chain + fixed-point EWMA) costs 140 B. Self-healing ({% term(url="@/blog/2026-01-29/index.md#prop-21", def="Healing Deadline: upper bound on time-to-resolution for healing actions of given severity, derived from MAPE-K tick rate and action queue depth") %}Proposition 21{% end %} deadline loop) costs another 11 KB. {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} learning (EXP3-IX, Kalman) costs another 4 KB. A 4 KB node gets exactly one capability tier — OBSERVE — and must accept that it cannot self-heal, only self-detect and alert. The constraint is not a software limitation: it is the physics of SRAM against the mathematics of autonomy.

<span id="def-99"></span>

**Definition 99** (Clock Trust Pivot). *A binary predicate on node \\(i\\) that sets the `trust_flag` field of Definition 101 based on whether the partition accumulator \\(T_{\mathrm{acc}}\\) has exceeded the platform-specific trust horizon \\(T_{\mathrm{trust}}\\):*

{% katex(block=true) %}
\texttt{trust\_flag}(i,t) \;=\; \begin{cases} 1 & T_{\mathrm{acc}}(t) \leq T_{\mathrm{trust}} \\ 0 & T_{\mathrm{acc}}(t) > T_{\mathrm{trust}} \end{cases}
{% end %}

*For an oscillator with drift \\(\delta_{\mathrm{ppm}}\\), the trust horizon satisfies {% katex() %}T_{\mathrm{trust}} = \varepsilon / \delta_{\mathrm{ppm}}{% end %}, where \\(\varepsilon\\) is the clock uncertainty bound from {% term(url="@/blog/2026-01-15/index.md#def-11", def="Clock Uncertainty Window: maximum clock drift tolerance between peers before logical-clock comparison is considered unreliable") %}Definition 11{% end %}. At \\(\delta_{\mathrm{ppm}} = 5\\) and \\(\varepsilon = 4.6\\,\mathrm{s}\\): {% katex() %}T_{\mathrm{trust}} \approx 2.8\,\mathrm{h}{% end %}. Receivers must not use \\(T_{\mathrm{acc}}\\) from a sender with `trust_flag = 0` as a causal-ordering tiebreaker.*

- **Computes**: Single-bit trust signal written to the UAH `flags` byte at every MAPE-K tick; zero additional SRAM beyond the `flags` byte already present in {% term(url="#def-101", def="Migration Safety Certificate: proof object generated by the Phase Gate Function demonstrating all prerequisites for a capability transition have been met") %}Definition 101{% end %}.
- **Apply when**: Any consumer of the Conflict Resolution Branch ({% term(url="@/blog/2026-01-15/index.md#def-11", def="Clock Uncertainty Window: maximum clock drift tolerance between peers before logical-clock comparison is considered unreliable") %}Definition 11{% end %}) reads `trust_flag` before using the sender's \\(T_{\mathrm{acc}}\\) as a tiebreaker for uncertainty-concurrent events.
- **Parameters**: \\(\delta_{\mathrm{ppm}}\\) from oscillator datasheet; 5 ppm for TCXO-class crystals (RAVEN drones), 20 ppm for uncalibrated RC oscillators (OUTPOST Ultra-L0 sensor nodes).
- **Prevents**: Silent causal inversion — a stale `trust_flag = 1` causes the Conflict Resolution Branch to treat a drifted \\(T_{\mathrm{acc}}\\) as authoritative, producing the exact physical-time inversion that {% term(url="@/blog/2026-01-15/index.md#def-11", def="Clock Uncertainty Window: maximum clock drift tolerance between peers before logical-clock comparison is considered unreliable") %}Definition 11{% end %}'s uncertainty window was designed to prevent.

<span id="def-100"></span>

**Definition 100** (WAKEUP Heap Gate). *The contiguous-allocation precondition for the OBSERVE-to-WAKEUP transition of Definition 128:*

{% katex(block=true) %}
\mathrm{gate}_{\mathrm{wakeup}}(i) \;=\; \bigl[\mathrm{malloc}(C_{\mathrm{WAKEUP}}) \neq \texttt{NULL}\bigr], \qquad C_{\mathrm{WAKEUP}} = 2{,}048\,\mathrm{B}
{% end %}

*If {% katex() %}\mathrm{gate}_{\mathrm{wakeup}}(i) = 0{% end %}, the anomaly-evidence counter (\\(z_t > \theta_0\\) for \\(\tau_{\mathrm{confirm}}\\) consecutive ticks) is registered but the state transition is suppressed. The node remains in OBSERVE, continues hash-chain and fixed-point EWMA updates, and retries the gate at the next confirmation cycle. {% term(url="#def-102", def="Autonomic Emergency State: firmware-level triple condition (malloc failure ∧ HLC drift ∧ CBF margin negative) triggering L0 escalation") %}Definition 102{% end %}'s Resource threshold is precisely {% katex() %}\neg\,\mathrm{gate}_{\mathrm{wakeup}}(i){% end %} — the heap gate becoming permanently blocked is one of the three AES trigger conditions.*

- **Computes**: Heap availability at the OBSERVE/WAKEUP boundary; result feeds both the transition guard of {% term(url="#def-128", def="Zero-Tax State Machine: 3-state FSM (OBSERVE/WAKEUP/ACTIVE) — 140-byte static footprint, zero heap allocation") %}Definition 128{% end %} and the AES Resource condition of {% term(url="#def-102", def="Autonomic Emergency State: firmware-level triple condition (malloc failure ∧ HLC drift ∧ CBF margin negative) triggering L0 escalation") %}Definition 102{% end %}.
- **Apply when**: Checked once per \\(\tau_{\mathrm{confirm}}\\)-tick anomaly confirmation window; not polled per-tick to avoid allocation churn on fragmented heaps.
- **Parameters**: {% katex() %}C_{\mathrm{WAKEUP}} = 2{,}048\,\mathrm{B}{% end %} minimum; increase if gossip table exceeds 1 KB for fleets larger than 127 nodes.
- **Prevents**: Partial-init abort — without the gate, a fragmented heap may return a non-NULL pointer for a smaller block and silently corrupt the gossip buffer layout, a failure mode undetectable until the first quorum vote.

<span id="def-101"></span>

**Definition 101** (Unified Autonomic Header — Firmware Memory Map). *The UAH is the 20-byte packed struct that (a) occupies the first 20 bytes of the 140 B OBSERVE static allocation and (b) forms the wire header of every inter-node frame and the 23-byte emergency beacon. Its bit-field layout is the strict byte-level serialization of the 8-stage constraint sequence (Definition 92): each field group maps to exactly one phase gate.*

**Bit-field register map (160 bits = 20 bytes, little-endian):**

<style>
#tbl_uah + table th:first-of-type { width: 10%; }
#tbl_uah + table th:nth-of-type(2) { width: 10%; }
#tbl_uah + table th:nth-of-type(3) { width: 14%; }
#tbl_uah + table th:nth-of-type(4) { width: 8%; }
#tbl_uah + table th:nth-of-type(5) { width: 58%; }
</style>
<div id="tbl_uah"></div>

| Byte(s) | Bits | Field | Width | Encoding and source |
| :--- | :--- | :--- | :--- | :--- |
| 0 | [7:4] | `q_i` | 4 b | Capability tier: 0=L0 ... 4=L4 (Definition 68); user-specified **4-bit Mode** field |
| 0 | [3:2] | `zt_state` | 2 b | 00=OBSERVE, 01=WAKEUP, 10=ACTIVE, 11=AES (Definition 128) |
| 0 | [1] | `nsg_veto` | 1 b | 1 = hardware veto active; \\(K_{\mathrm{gs}} = 0\\) (Proposition 32) |
| 0 | [0] | `trust_flag` | 1 b | 1 = HLC trusted; 0 = drift exceeded \\(T_{\mathrm{trust}}\\) (Definition 99) |
| 1 | [7:0] | `ep_lo` | 8 b | `energy_delta[7:0]`: low byte of 12-bit signed energy surplus |
| 2 | [7:4] | `ep_hi` | 4 b | `energy_delta[11:8]`: high nibble; sign-bit in position 11 |
| 2 | [3:0] | `rq_hi` | 4 b | `rho_q[11:8]`: high nibble of CBF margin \\(\\rho_{q,i}\\) |
| 3 | [7:0] | `rq_lo` | 8 b | `rho_q[7:0]`: low byte; combined Q3.9 range \\([-4,+4)\\) mW |
| 4–27 | [31:0] | `hlc_pt` | 32 b | HLC physical timestamp, ms mod \\(2^{32}\\) (Definition 61); user-specified **32-bit HLC** field |
| 8–57 | [31:0] | `hlc_c` | 32 b | HLC Lamport counter (Definition 61) |
| 12–79 | [31:0] | `t_acc` | 32 b | Partition accumulator \\(T_{\mathrm{acc}}\\), seconds (Definition 15) |
| 16–94 | [31:0] | `h_sfx` | 32 b | SipHash-2-4 4-byte chain suffix (Definition 129) |

*Total: \\(8+8+4+4+8+32+32+32+32 = 160\\) bits = **20 bytes**. The 12-bit `energy_delta` (bytes 1–6 high nibble + byte 1 low byte) is the user-specified **12-bit Energy Delta** field: it encodes the signed {% katex() %}\text{mW}{\cdot}\text{tick}{% end %} energy surplus derived from the fixed-point EWMA variance. The 12-bit `rho_q` is the CBF stability margin from {% term(url="@/blog/2026-01-29/index.md#prop-25", def="Nonlinear Safety Invariant: safety invariant is preserved across mode transitions if the gain scheduler satisfies the barrier condition at each boundary") %}Proposition 25{% end %}.*

**Firmware type contract** (ARM Cortex-M / RISC-V, `__attribute__((packed))`, little-endian):

*The wire type `UAH_t` is a 20-byte packed struct with `__attribute__((packed))` and a compile-time `static_assert(sizeof(UAH_t) == 20)` to catch alignment padding. Without `packed`, GCC 13 on Cortex-M4 inserts 3 bytes after the `flags` byte, inflating the struct to 24 B and breaking every receiver's field parser. The three 8-bit bytes `ep_lo`, `ep_hi_rq_hi`, and `rq_lo` carry two nibble-packed 12-bit signed fields: the signed energy surplus in `ep_lo` plus the high nibble of `ep_hi_rq_hi`, and the CBF stability margin \\(\rho_{q,i}\\) in `rq_lo` plus the low nibble of `ep_hi_rq_hi`. Both fields are Q3.9 signed integers with range \\(\pm 4\\,\text{mW}\\), recovered by a 4-bit arithmetic right-shift of the 16-bit value after nibble assembly.*

**OBSERVE flat struct layout (140 bytes, statically allocated at boot):**

| Offset | Size | Symbol | Content |
| :--- | :--- | :--- | :--- |
| +0 | 20 B | `uah` | UAH struct (this definition) — updated in-place at each MAPE-K tick |
| +20 | 16 B | `siphash_state[2]` | SipHash-2-4 running state \\(h[n]\\), uint64\_t[2] (Definition 129); key \\(k_{\mathrm{root}}\\) in flash |
| +36 | 2 B | `ewma_mu` | Q8.8 EWMA baseline \\(\\hat{\\mu}[n]\\) (Definition 98) |
| +38 | 2 B | `ewma_var` | Q8.8 running variance \\(\\hat{\\sigma}^2[n]\\) (Definition 98) |
| +40 | 2 B | `ewma_thresh` | Q8.8 anomaly threshold \\(\\theta_0\\) |
| +42 | 2 B | `ewma_hyst` | Q8.8 hysteresis band \\(\\delta_h\\) (Definition 47) |
| +44 | 1 B | `alpha_fp` | EWMA smoothing byte \\(\\alpha_{\mathrm{fp}}\\) (Definition 98) |
| +45 | 1 B | `confirm_cnt` | Consecutive anomaly tick counter |
| +46 | 2 B | `ring_idx` | 16-sample EWMA history ring head index |
| +48 | 32 B | `ewma_hist[16]` | 16-sample Q8.8 metric history ring (int16\_t[16]) |
| +80 | 8 B | `bloom_seeds[4]` | Bloom filter seed keys (uint16\_t[4]) |
| +88 | 52 B | `bloom_bits[52]` | 416-bit Bloom filter bit array (Definition 24 gossip fingerprint) |
| **+140** | — | *(end of OBSERVE struct)* | — |

*`OBSERVE_t` is a 140-byte packed struct with `__attribute__((packed))` and `static_assert(sizeof(OBSERVE_t) == 140)`. It is declared as `static OBSERVE_t obs_block` at global scope so the linker places it in `.bss` (zero-initialized at boot) — no heap allocation is needed. The leading field is `UAH_t uah` (bytes 0–94, {% term(url="#def-101", def="Migration Safety Certificate: proof object generated by the Phase Gate Function demonstrating all prerequisites for a capability transition have been met") %}Definition 101{% end %}), followed by `uint64_t siphash_state[2]` (bytes 20–18, in-place hash chain state, {% term(url="#def-129", def="In-Place Hash Chain: SipHash-2-4 running chain on 16-byte state register — no heap allocation") %}Definition 129{% end %}). The remaining 104 bytes hold the six EWMA scalars as Q8.8 `int16_t` values, the 16-sample history ring as `int16_t[16]`, and the 416-bit Bloom filter as `uint8_t[52]` (see offset table above). `obs_block.uah` is passed by pointer as the TX header — zero copy.*

- **Computes**: (a) 20-byte wire format for every inter-node frame and the 23-byte AES beacon (UAH + node\_id 2 B + AES error code 1 B); (b) canonical byte-offset map for the 140 B OBSERVE static allocation, replacing the high-level component labels in the hardware tier table with auditable byte positions.
- **Apply when**: `static OBSERVE_t obs_block` at global scope; linker places in `.bss` (zero-initialized) at boot; `siphash_state` is initialized from \\(k_{\mathrm{root}}\\) (read from flash OTP) before the first MAPE-K tick. `obs_block.uah` is then passed by pointer as the 20-byte TX header — zero copy.
- **Parameters**: Little-endian byte order matches ARM Cortex-M and RISC-V; big-endian targets must byte-swap `hlc_pt`, `hlc_c`, `t_acc`, `h_sfx` at TX/RX. `ep_hi_rq_hi` is endian-neutral (single nibble-packed byte).
- **Prevents**: Implicit struct padding — without `__attribute__((packed))`, GCC 13 on Cortex-M4 inserts 3 bytes of alignment padding after `flags`, inflating `UAH_t` from 20 B to 24 B and silently breaking every receiver's field parser; the `static_assert` catches this at compile time.

<span id="prop-70"></span>

**Proposition 70** (Firmware Memory Footprint). *The Zero-Tax autonomic stack satisfies {% katex() %}C_{\mathrm{static}} + C_{\mathrm{stack}} \leq 200\,\mathrm{B}{% end %} at every OBSERVE-state MAPE-K tick:*

*The SipHash chain, fixed-point EWMA, Bloom filter, and UAH header together occupy 140 bytes of static RAM and borrow 48 bytes of stack — a \\(65\\times\\) reduction from the 13 KB full autonomic stack that fits on any 4 KB MCU.*

{% katex(block=true) %}
C_{\mathrm{static}} \;=\; \underbrace{20}_{\texttt{uah}} + \underbrace{16}_{\text{SipHash state}} + \underbrace{12}_{\text{EWMA scalars}} + \underbrace{32}_{\text{EWMA ring}} + \underbrace{60}_{\text{Bloom filter}} \;=\; 140\,\mathrm{B}
{% end %}

{% katex(block=true) %}
C_{\mathrm{stack}} \;=\; \underbrace{20}_{\text{callee saves}} + \underbrace{20}_{\text{SipHash frame}} + \underbrace{8}_{\text{EWMA temps}} \;=\; 48\,\mathrm{B}
{% end %}

{% katex(block=true) %}
C_{\mathrm{total}} \;=\; 140 + 48 \;=\; 188\,\mathrm{B} \;\leq\; 200\,\mathrm{B} \qquad \square
{% end %}

*Proof.* Static allocation (140 B): `OBSERVE_t` is a compile-time constant size, placed in `.bss`, and never freed. Heap is not required — {% term(url="#def-100", def="Rollback Boundary: checkpoint state the system can safely return to if a constraint migration fails validation") %}Definition 100{% end %} guarantees heap failure suppresses WAKEUP, not OBSERVE. Stack: (i) callee-saved registers on Cortex-M0+ — LR + r4–r8 = 5 words = 20 B; (ii) SipHash-2-4 internal call frame per RFC 7693 Sec. 2.4 — \\(4 \times 32\\)-bit working words + return address = 20 B; SipHash operates on `siphash_state` in the static struct, so no secondary buffer is needed; (iii) EWMA update — `acc` (int32) + `x_raw` (int16) + `delta` (int16) = 8 B. `ep_hi_rq_hi` is computed in a single 8-bit register with no stack spill. The beacon ISR passes `&obs_block.uah` by pointer — zero stack copy. Total stack peak 48 B. {% katex() %}C_{\mathrm{total}} = 188\,\mathrm{B} \leq 200\,\mathrm{B}{% end %}. \\(\square\\)

| Component | Static | Stack | Constraint-sequence phase |
| :--- | :--- | :--- | :--- |
| `uah` (Definition 101) | 20 B | — | Phase 0 — frame header: all phases read/write `q_i`, `zt_state` |
| SipHash state | 16 B | — | Phase 1 — self-measurement: integrity ledger (Definition 129) |
| EWMA scalars (\\(\\hat{\\mu}, \\hat{\\sigma}^2, \\theta_0, \\delta_h, \\ldots\\)) | 12 B | — | Phase 1 — self-measurement: anomaly baseline (Definition 98) |
| EWMA history ring | 32 B | — | Phase 1 — self-measurement: detection sensitivity |
| Bloom filter | 60 B | — | Phase 2 — gossip readiness: peer fingerprint cache (Definition 24) |
| Callee-saved registers | — | 20 B | ISR overhead: platform-invariant on Cortex-M0+ |
| SipHash call frame | — | 20 B | Phase 1: per-tick transient; cleared after hash |
| EWMA computation temps | — | 8 B | Phase 1: per-tick transient |
| **Total** | **140 B** | **48 B** | \\(188\\,\text{B} \leq 200\\,\text{B}\\) |

> **Empirical status**: The 188 B total (140 B static + 48 B stack) is exact for Cortex-M0+ with GCC 13 at -Os; the stack frame varies \\(\pm 4\\) B across compilers depending on callee-save conventions, and the 200 B ceiling leaves 12 B margin that should be verified with a `static_assert` on each new target platform rather than assumed portable.

> **Zero-Tax scope — RAM and compute only, not radio energy**: {% term(url="#prop-70", def="Constraint Sequence Optimality: topological ordering of the prerequisite graph minimizes total activation time across the constraint sequence") %}Proposition 70{% end %} proves zero dynamic RAM allocation — not zero radio energy. At SF12, the 23-byte UAH beacon adds approximately \\(205\,\mu\text{W}\\) to an \\(100\,\mu\text{W}\\) L0 budget at the default 60 s interval. **Set {% katex() %}T_{\text{beacon}} \geq 300\,\text{s}{% end %} for SF10–SF12 nodes at {% katex() %}P_{L0} \leq 150\,\mu\text{W}{% end %}.** Extending the interval saves energy but creates a detection latency trade-off: {% katex() %}T_{\text{beacon}} \leq T_{\text{crit}} / 2{% end %} is the deployment invariant for mesh-visible L1 anomaly detection.

**Zero-Tax radio overhead.** The 23-byte UAH beacon ({% term(url="#def-101", def="Migration Safety Certificate: proof object generated by the Phase Gate Function demonstrating all prerequisites for a capability transition have been met") %}Definition 101{% end %}) is 15 bytes larger than a minimal 8-byte heartbeat. Those 15 extra bytes extend radio-on time \\(\Delta t_{\text{on}}\\) and consume real energy: {% katex() %}\Delta E_{\text{beacon}} = P_{\text{TX}} \cdot \Delta t_{\text{on}}{% end %}.

At LoRa SF7/125 kHz, 14 dBm (25 mW): {% katex() %}\Delta t_{\text{on}} \approx 31\,\text{ms}{% end %}, {% katex() %}\Delta E \approx 0.77\,\text{mJ}{% end %}; at 60 s interval this adds {% katex() %}\approx 13\,\mu\text{W}{% end %} — 13% of a \\(100\,\mu\text{W}\\) L0 budget. At LoRa SF12/125 kHz (OUTPOST long-range sensors): {% katex() %}\Delta t_{\text{on}} \approx 492\,\text{ms}{% end %}, {% katex() %}\Delta E \approx 12.3\,\text{mJ}{% end %}; at 60 s interval this adds {% katex() %}\approx 205\,\mu\text{W}{% end %} — **exceeding the entire \\(100\,\mu\text{W}\\) L0 power budget**.

The UAH header is a bounded, predictable overhead that must be offset by extending the beacon interval. The minimum safe interval to keep UAH radio overhead below fraction \\(f\\) of total \\(P_{L0}\\) is:

\\[T_{\text{beacon,min}} = \frac{\Delta E_{\text{beacon}}(SF)}{f \cdot P_{L0}}\\]

For OUTPOST Ultra-L0 ({% katex() %}P_{L0} = 100\,\mu\text{W}{% end %}, SF12, \\(f = 0.10\\)): {% katex() %}T_{\text{beacon,min}} = 12.3\,\text{mJ} / (0.10 \times 100\,\mu\text{W}) = 1230\,\text{s} \approx 20\,\text{min}{% end %}. The 60-second default ({% term(url="#def-102", def="Autonomic Emergency State: firmware-level triple condition (malloc failure ∧ HLC drift ∧ CBF margin negative) triggering L0 escalation") %}Definition 102{% end %}) is valid for SF7–SF9 deployments. Nodes above \\(500\,\mu\text{W}\\) budget (RAVEN drones, CONVOY vehicles) are unconstrained at any standard interval.

**Latency-Energy Deadlock — you cannot heal what you cannot hear.** Extending \\(T_{\text{beacon}}\\) saves energy but directly increases detection latency for node failures. A failed node is confirmed absent only after two consecutive missed beacons (one miss is indistinguishable from a packet loss in a lossy LoRa mesh):

{% katex(block=true) %}T_{\text{detect}}(k) \;\geq\; 2\,T_{\text{beacon}}(k) + \tau_{\text{gossip}}{% end %}

where \\(\tau_{\text{gossip}}\\) is the gossip convergence time (\\(O(D \ln n / \lambda)\\) rounds, {% term(url="@/blog/2026-01-22/index.md#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}). For the OUTPOST SF12 case: {% katex() %}T_{\text{detect}} \geq 2460\,\text{s} \approx 41\,\text{min}{% end %}. The L1 anomaly detection layer is operationally suspended for node \\(k\\) whenever:

{% katex(block=true) %}2\,T_{\text{beacon}}(k) > T_{\text{crit}}(k) - T_{\text{heal\_exec}}{% end %}

For OUTPOST SF12: L1 detection is valid only for failure classes with {% katex() %}T_{\text{crit}} \geq 2460\,\text{s} + T_{\text{heal\_exec}}{% end %}. The MVS backup-power failure ({% katex() %}T_{\text{crit}} = 5400\,\text{s}{% end %}, 90 min) survives this constraint with a 15% margin. Short-window failure classes do not: a sensor watchdog trip ({% katex() %}T_{\text{crit}} \approx 300\,\text{s}{% end %}) or a threat-detection data gap ({% katex() %}T_{\text{crit}} \approx 600\,\text{s}{% end %}) cannot be fleet-detected within their criticality window at SF12 beacon intervals. For those failure classes, **gossip-based fleet anomaly detection ([Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md)) is suspended** — the node continues to self-heal locally but becomes invisible to fleet-level coordination.

This deadlock condition must be declared in the Phase Gate progress record ({% term(url="#def-103", def="Phase Gate Function: predicate that must evaluate to true before a capability level transition is permitted; prevents premature escalation") %}Definition 103{% end %}): a node with \\(T_{\text{detect}} > T_{\text{crit}}\\) for any of its assigned failure classes cannot certify Phase Gate 3 for those classes and must be classified L0 from the fleet's perspective until either the beacon interval is reduced (higher power mode) or the failure class is reclassified as out-of-scope for remote detection. The constraint is the irreducible physics of energy-constrained radio: **{% katex() %}T_{\text{beacon}} \leq T_{\text{crit}} / 2{% end %} is the deployment invariant for mesh-visible L1 anomaly detection**.

### Cross-Part Cascade: L0 Resource Model

Placing a node in OBSERVE state is not a local decision. Because every other part of the series assumes a running MAPE-K loop, the OBSERVE-state resource model propagates as a **cascade of assumption violations** through the formal machinery of each downstream part. The table below maps each upstream result to the assumption it requires, the violation OBSERVE creates, and the resulting impact.

<style>
#tbl_cascade + table th:first-of-type { width: 10%; }
#tbl_cascade + table th:nth-of-type(2) { width: 15%; }
#tbl_cascade + table th:nth-of-type(3) { width: 25%; }
#tbl_cascade + table th:nth-of-type(4) { width: 25%; }
#tbl_cascade + table th:nth-of-type(5) { width: 25%; }
</style>
<div id="tbl_cascade"></div>

| Post | Formal result | Assumption required | OBSERVE violation | Cascade impact |
| :--- | :--- | :--- | :--- | :--- |
| **Self-Measurement** | Proposition 9 optimal threshold {% katex() %}\theta^*{% end %} | Float-precision EWMA ({% katex() %}\sigma_{\mathrm{quant}} \approx 0{% end %}) | Q8.8 Fixed-Point EWMA adds quantization noise {% katex() %}\sigma_{\mathrm{quant}} \approx 0.004\,\sigma{% end %} | Optimal {% katex() %}\theta^*{% end %} rises by {% katex() %}\approx\sqrt{1 + \sigma_{\mathrm{quant}}^2/\sigma^2}{% end %}; false-positive rate increases ~15% without recalibration |
| **Self-Measurement** | Proposition 12 gossip convergence | Gossip protocol running (Definition 24) | Gossip disabled in OBSERVE; health vector frozen | Staleness bound of Proposition 14 exceeded within one MAPE-K window; peers treat OBSERVE node as soft-failed |
| **Self-Measurement** | Definition 26 staleness bound | Node participates in gossip rounds | Zero gossip rounds from OBSERVE node | {% katex() %}T_{\mathrm{stale}}{% end %} effectively {% katex() %}\infty{% end %} for OBSERVE node; staleness-aware consumers must treat its state as unverified |
| **Self-Healing** | Proposition 22 loop stability | Continuous MAPE-K with fixed {% katex() %}T_{\mathrm{tick}}{% end %} | MAPE-K disabled in OBSERVE; {% katex() %}K = 0{% end %} | Stability guarantee vacuously satisfied (no actuation); CBF margin {% katex() %}\rho_{q,i}{% end %} still computed and embedded in UAH flags |
| **Self-Healing** | Proposition 21 healing deadline | MAPE-K running at partition start | Healing doesn't start until ACTIVE (after wakeup latency) | Effective healing margin = {% katex() %}T_{\mathrm{heal}} - T_{\mathrm{wakeup}}{% end %}; RAVEN: 30 s - 19 s = 11 s; OUTPOST: 120 s - 45 s = 75 s |
| **Self-Healing** | Proposition 25 CBF mode safety | Actuation loop active; {% katex() %}K_{\mathrm{gs}} > 0{% end %} possible | {% katex() %}K_{\mathrm{gs}} = 0{% end %} always in OBSERVE; NSG veto never fires (no actuation to veto) | Safe-set invariant is preserved trivially; mode-transition safety analysis irrelevant until WAKEUP |
| **Fleet Coherence** | Proposition 41 divergence growth | Node updates state at rate {% katex() %}\lambda{% end %} | No local writes in OBSERVE; {% katex() %}\lambda_{\mathrm{local}} = 0{% end %} | OBSERVE node accumulates only incoming peer writes; {% katex() %}D(\tau){% end %} grows from peer side at full rate; buffer sizing must still account for OBSERVE node's post-wakeup delta |
| **Fleet Coherence** | Definition 70 delta-sync Phase 2 | Vector clock {% katex() %}\vec{V}_i{% end %} reflects local events | {% katex() %}\vec{V}_i{% end %} frozen (no gossip events); delta set {% katex() %}\Delta_k = \emptyset{% end %} | Receiver of UAH with `zt_state = 00` skips {% katex() %}\vec{V}_i{% end %} comparison; uses {% katex() %}h_{\mathrm{sfx}}{% end %} only for integrity check |
| **Fleet Coherence** | Definition 99 clock trust pivot | {% katex() %}T_{\mathrm{acc}}{% end %} reflects active partition duration | {% katex() %}T_{\mathrm{acc}}{% end %} still increments in OBSERVE | OUTPOST crystal node hits {% katex() %}T_{\mathrm{trust}} \approx 2.8\,\text{h}{% end %} regardless of Zero-Tax state; `trust_flag = 0` fires in OBSERVE if partition exceeds 2.8 h |
| **Anti-Fragile Learning** | Definition 81 EXP3-IX weight update | MAPE-K tick triggers arm evaluation | No arm evaluation in OBSERVE; weights frozen | On WAKEUP, EXP3-IX reinits at uniform weights; long-partition context (Definition 87) not built; first healing actions are exploratory, not optimized |
| **Weibull Model** | Proposition 37 circuit breaker | {% katex() %}T_{\mathrm{acc}}{% end %} incremented by active MAPE-K at each tick | {% katex() %}T_{\mathrm{acc}}{% end %} still increments passively in OBSERVE (hash chain tick, Definition 129); breaker threshold {% katex() %}Q_{0.95}{% end %} is reached when partition exceeds the P95 Weibull quantile | Breaker fires correctly in OBSERVE: `q_i = L0` is already in effect ({% katex() %}K = 0{% end %}); the only new action is setting UAH capability level to L0 explicitly — zero additional SRAM cost; if all three AES conditions co-occur, Definition 102 supersedes Proposition 37 and the AES bitmask (bit 0 = Resource) encodes the breaker event |

The cascade has a single structural pattern: every result that assumes a running MAPE-K loop is vacuously satisfied or violated in OBSERVE, and every result that operates on passive signals ({% katex() %}T_{\mathrm{acc}}{% end %}, hash chain, CBF margin) continues to fire correctly.

{% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %}'s Weibull circuit breaker belongs to the second category — it monitors the partition accumulator passively and fires at {% katex() %}Q_{0.95}{% end %} whether MAPE-K is running or not. The UAH ({% term(url="#def-101", def="Migration Safety Certificate: proof object generated by the Phase Gate Function demonstrating all prerequisites for a capability transition have been met") %}Definition 101{% end %}) was designed precisely around this split: its Clock Fix fields ({% katex() %}l_i{% end %}, {% katex() %}T_{\mathrm{acc}}{% end %}) and Resource Fix field ({% katex() %}h_{\mathrm{sfx}}{% end %}) update in OBSERVE; its Stability Fix fields ({% katex() %}\rho_{q,i}{% end %}, {% katex() %}q_i{% end %}) and Zero-Tax state bits (`zt_state`) signal to every receiver exactly which assumptions are currently violated on the sender.

### Autonomic Emergency State: Triple-Threat Survival

The three fixes reach their individual theoretical limits gracefully — clock pivot fires at {% katex() %}T_{\mathrm{acc}} > T_{\mathrm{trust}}{% end %}, OBSERVE state activates when the WAKEUP allocation fails, CBF sets {% katex() %}K_{\mathrm{gs}} = 0{% end %} when {% katex() %}\rho_q < 0{% end %}. The Black Swan scenario is when all three trigger simultaneously on the same node: **nonlinear power state** (mode oscillation violating dwell-time), **1-hour clock drift** ({% katex() %}\Delta t = 3600\,\text{s} \gg \varepsilon + \tau_{\max}{% end %} for every platform class), and **95% RAM full** (WAKEUP allocation fails due to heap fragmentation). The fixes were designed independently; this section proves they remain correct when stacked.

**Triple-Threat state analysis.** On a 64 KB STM32L4 at 95% RAM utilization: free SRAM = 3.2 KB. The WAKEUP transition requests a 2 KB contiguous allocation. Due to heap fragmentation (worst-case: largest free block {% katex() %}= 0.5 \times \text{total free}{% end %}), the allocation fails. The OBSERVE footprint (140 B) was pre-allocated as a static struct at boot — it is not heap-dependent and cannot be fragmentation-evicted. Clock drift = 3,600 s satisfies {% katex() %}|\Delta t| \gg \varepsilon + \tau_{\max}{% end %} for every platform (RAVEN: threshold 1.1 s; CONVOY: 6 s; OUTPOST: 1 s + 60 s = 61 s). The Drift-Quarantine anomaly fires on any gossip contact. CBF margin {% katex() %}\rho_q < 0{% end %}: the node is outside the safe set, so {% katex() %}K_{\mathrm{gs}} = 0{% end %} and `nsg_veto = 1` in the UAH.

> **Two-layer partition response.** {% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %} (Weibull Circuit Breaker) is a single-condition outer envelope: it fires at P95 partition duration and constrains new decisions without entering AES. {% term(url="#def-102", def="Autonomic Emergency State: firmware-level triple condition (malloc failure ∧ HLC drift ∧ CBF margin negative) triggering L0 escalation") %}Definition 102{% end %} (AES) is the inner fallback: it requires resource AND clock AND stability limits to breach simultaneously before freezing all execution. A node can be circuit-broken without being in AES; AES entry implies the circuit breaker has already fired.

<span id="def-102"></span>

**Definition 102** (Autonomic Emergency State). *The Autonomic Emergency State (AES) activates on node {% katex() %}i{% end %} when all three threat conditions are simultaneously satisfied:*

{% katex(block=true) %}
\mathrm{AES}(i) \;=\; \underbrace{\bigl[\mathrm{malloc}(C_{\mathrm{WAKEUP}}) = \texttt{NULL}\bigr]}_{\text{Resource threshold}} \;\wedge\; \underbrace{\bigl[|\Delta t_i| > \varepsilon + \tau_{\max}\bigr]}_{\text{Clock threshold}} \;\wedge\; \underbrace{\bigl[\rho_{q,i} < 0\bigr]}_{\text{Stability threshold}}
{% end %}

*where {% katex() %}C_{\mathrm{WAKEUP}}{% end %} is the contiguous WAKEUP allocation size ({% term(url="#def-128", def="Zero-Tax State Machine: 3-state FSM (OBSERVE/WAKEUP/ACTIVE) — 140-byte static footprint, zero heap allocation") %}Definition 128{% end %}), {% katex() %}\Delta t_i = l_i - \max_{j \in \mathrm{peers}} l_j{% end %} is the HLC watermark deviation, and {% katex() %}\rho_{q,i}{% end %} is the CBF stability margin from {% term(url="@/blog/2026-01-29/index.md#prop-25", def="Nonlinear Safety Invariant: safety invariant is preserved across mode transitions if the gain scheduler satisfies the barrier condition at each boundary") %}Proposition 25{% end %}.*

> **Triggering logic.** AES activates only when **all three** conditions breach their limits simultaneously (logical AND, not OR). Individual limit breaches trigger their own single-condition responses: {% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %} (Weibull circuit breaker) fires on partition duration alone; load shedding fires on resource depletion alone. AES is reserved for compound failure — the intersection of three simultaneous breaches — which is the scenario where individual responses are insufficient.

*In AES, the node executes exactly four actions and no others:*

1. **Freeze**: halt all CRDT writes and delta-sync transmissions; set {% katex() %}K_{\mathrm{gs}} = 0{% end %}
2. **Signal**: set UAH flags: `trust_flag = 0`, `zt_state = 00` (OBSERVE), `nsg_veto = 1`
3. **Persist**: continue hash chain update {% katex() %}h[n]{% end %} ({% term(url="#def-129", def="In-Place Hash Chain: SipHash-2-4 running chain on 16-byte state register — no heap allocation") %}Definition 129{% end %}) and {% katex() %}T_{\mathrm{acc}}{% end %} increment — passive monitoring survives
4. **Beacon**: transmit a 23-byte emergency frame every {% katex() %}T_{\mathrm{beacon}}{% end %} (default 60 s): UAH (20 B) + node\_id (2 B) + AES error code (1 B)

*Exit condition: all three threat conditions must resolve simultaneously before re-entering OBSERVE ({% term(url="#def-128", def="Zero-Tax State Machine: 3-state FSM (OBSERVE/WAKEUP/ACTIVE) — 140-byte static footprint, zero heap allocation") %}Definition 128{% end %}):*

{% katex(block=true) %}
\mathrm{exit\_AES}(i) \;=\; \bigl[\mathrm{malloc}(C_{\mathrm{WAKEUP}}) \neq \texttt{NULL}\bigr] \;\wedge\; \bigl[|\Delta t_i| \leq \varepsilon + \tau_{\max}\bigr] \;\wedge\; \bigl[\rho_{q,i} \geq 0\bigr]
{% end %}

- **Computes**: Minimal-survivable operating mode when all three structural fixes reach their limits simultaneously; 140 B static SRAM + 23-byte beacon, no heap required.
- **Apply when**: AES activates automatically on simultaneous triple-threshold breach; no software timer or external trigger needed — each condition is checked at every MAPE-K tick.
- **Parameters**: {% katex() %}T_{\mathrm{beacon}}{% end %} = 60 s for LoRa SF7–SF9 and high-power nodes ({% katex() %}\geq 500\,\mu\text{W}{% end %} budget); **use \\(\geq\\)300 s for SF10–SF12 nodes at {% katex() %}P_{L0} \leq 150\,\mu\text{W}{% end %}** — see the Zero-Tax Radio Overhead note ({% term(url="#prop-70", def="Constraint Sequence Optimality: topological ordering of the prerequisite graph minimizes total activation time across the constraint sequence") %}Proposition 70{% end %}) for the derivation of \\(T_{\mathrm{beacon,min}}(SF)\\). AES error code encodes which subset of the three conditions triggered (bitmask: bit 0 = Resource, bit 1 = Clock, bit 2 = Stability).
- **Prevents**: Stack collapse under compound failure — without AES, independent fixes attempt independent healing actions simultaneously, competing for the same 3.2 KB of fragmented heap.

**Two-layer AES architecture.** AES spans an application layer and a firmware layer with distinct semantics. The application layer (continuous scalar thresholds: battery, \\(T_\text{acc}\\), \\(\Psi\\)) provides early warning and activates the {% term(url="@/blog/2026-02-12/index.md#def-89", def="Safe Action Filter: pre-execution check blocking any bandit-selected action that violates the hardware safety interlock or resource survival constraints") %}Safe Action Filter{% end %} with a \\(W_{\max} = 60\\,\text{s}\\) escape hatch for resource-starved ticks. The firmware layer (binary conditions: malloc failure, HLC drift, CBF margin) confirms that the OS-level resource and timing invariants have been violated and engages the 600 s recovery hold — the longer hold reflects the verification latency for firmware context re-initialization and HLC re-synchronization, which cannot be confirmed at application-layer sampling rates. AES activates when all three axes simultaneously exceed their respective thresholds (AND-combined; see [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md) for the formal definition). Both the application layer (continuous scalar thresholds) and the firmware layer (binary conditions) must confirm breach before entry is declared. AES exits only when both layers report clear (AND-combined for exit).

**AES atomic entry requirement.** Transition into the Autonomic Emergency State must be atomic with respect to state initialization. The system must verify that (a) L0 physical interlocks are armed, (b) the MAPE-K loop has completed at least one full tick, and (c) the CRDT state has been initialized from a known-good snapshot before declaring AES entry complete. Partial initialization followed by partition creates an unrecoverable state gap.

**AES response protocol — what the system does when triggered.** On AES entry the system immediately executes five actions:

1. Transition to the Zero-Tax OBSERVE state ({% term(url="#def-128", def="Zero-Tax State Machine: 3-state FSM (OBSERVE/WAKEUP/ACTIVE) — 140-byte static footprint, zero heap allocation") %}Definition 128{% end %}), releasing all WAKEUP and ACTIVE heap allocations
2. Suspend the MAPE-K loop — no Analyze, Plan, or Execute phases run
3. Disable all EXP3-IX learning (weight vector frozen in place)
4. Continue only fixed-point EWMA ({% term(url="#def-98", def="Fixed-Point EWMA: integer-arithmetic EWMA using bit-shifts, eliminating floating-point dependency and fitting in 8 bytes of SRAM") %}Definition 98{% end %}) and SipHash chain integrity ({% term(url="#def-129", def="In-Place Hash Chain: SipHash-2-4 running chain on 16-byte state register — no heap allocation") %}Definition 129{% end %}) from the OBSERVE state
5. Emit a distress beacon (23 B) every 60 s at maximum transmit power

**Exit condition**: AES exit requires {% katex() %}\Psi(t) \geq \Psi_{\text{min}}{% end %} (see [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md), {% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: the lowest-risk posture a node adopts when no safe healing action is available; irreversible during a partition") %}Definition 53{% end %}) and all three axes below threshold for one full evaluation window. All three triggering conditions must clear simultaneously and remain clear for \\(\geq T_{\text{recover}} = 600\\) s before MAPE-K resumes. The 600 s hold aligns with {% katex() %}\tau_\text{ref}^\text{max} = 600\,\text{s}{% end %} ({% term(url="@/blog/2026-01-29/index.md#prop-31", def="CBF-derived refractory bound: minimum refractory period ensuring the safety condition is maintained between consecutive healing actions") %}Proposition 31{% end %}) to prevent MAPE-K restart oscillation. Reducing \\(T_\text{recover}\\) below {% katex() %}\tau_\text{ref}^\text{max}{% end %} is not recommended without re-analysis of post-AES-exit stability margins.

On exit, restore the EXP3-IX weight vector from its frozen state — unless partition duration exceeded {% katex() %}T_{\text{acc\_max}}{% end %} or the contamination score (proportion of rounds where adversarial non-stationarity was detected by {% term(url="@/blog/2026-02-12/index.md#def-84", def="Adversarial Non-Stationarity Detector: statistical change detector that identifies when the reward distribution has shifted beyond natural EXP3-IX variance, triggering a weight reset") %}Definition 34{% end %}) exceeds 30%, in which case reset to the {% term(url="@/blog/2026-02-12/index.md#def-82", def="Capability-Hierarchy Warm-Start Prior: bandit initial weights from offline simulation, reducing rounds needed to reach convergence by roughly forty percent") %}warm-start prior{% end %} ({% term(url="@/blog/2026-02-12/index.md#def-82", def="Capability-Hierarchy Warm-Start Prior: bandit initial weights from offline simulation, reducing rounds needed to reach convergence by roughly forty percent") %}Definition 96{% end %}) rather than restoring the pre-AES weights — adversarial learning during the partition should not corrupt the connected-regime policy.

**Operator override**: an authenticated operator command may reduce \\(T_{\text{recover}}\\) to {% katex() %}T_{\text{recover}}^{\min} = 60\,\text{s}{% end %} after manually confirming firmware integrity (malloc pre-check succeeds, HLC drift is below tolerance, \\(\rho_q \geq 0\\)). The override requires two-factor authentication and is logged to the post-partition audit record ({% term(url="@/blog/2026-02-05/index.md#def-57", def="Post-Partition Audit Record: immutable log entry written at reconnection capturing divergence metrics, conflict counts, and resolution outcomes") %}Definition 57{% end %}).

**Formal action to operational step mapping.** Steps (1)–(3) above are all sub-implementations of the single **Freeze** formal action. There are 4 formal actions and 5 implementation steps; no action is missing or duplicated.

| Formal action ({% term(url="#def-102", def="Autonomic Emergency State: firmware-level triple condition (malloc failure ∧ HLC drift ∧ CBF margin negative) triggering L0 escalation") %}Definition 102{% end %}) | Operational steps |
|--------------------------------|-------------------|
| **Freeze** (halt all plan execution) | (1) Transition to OBSERVE state; (2) Suspend MAPE-K Execute phase; (3) Freeze EXP3-IX weight updates |
| **Signal** (notify peers) | Included in (5) Emit distress beacon — beacon carries the AES flag |
| **Persist** (maintain minimum health monitoring) | (4) Continue EWMA + SipHash integrity checks |
| **Beacon** (broadcast distress) | (5) Emit distress beacon on recovery channel |

<span id="prop-71"></span>

**Proposition 71** (AES Survival Guarantee). *Under Definition 102, the AES footprint survives the Triple-Threat scenario on any MCU with total SRAM {% katex() %}\geq 4\,\text{KB}{% end %}:*

{% katex(block=true) %}
C_{\mathrm{AES}} = 140\,\text{B (OBSERVE static)} + 23\,\text{B (beacon frame)} = 163\,\text{B} \leq 0.05 \times 4\,\text{KB} = 204\,\text{B}
{% end %}

*The 163 B AES footprint is below the 5% free headroom (204 B) of the smallest viable MCU in the framework (Ultra L0, 4 KB). AES therefore survives every tier in the hardware table of {% term(url="#def-128", def="Zero-Tax State Machine: 3-state FSM (OBSERVE/WAKEUP/ACTIVE) — 140-byte static footprint, zero heap allocation") %}Definition 128{% end %}.*

*Proof.* The 140 B OBSERVE stack is pre-allocated as a static struct at boot (not heap-dependent; cannot be fragmentation-evicted). The 23-byte beacon frame is a stack-local variable within the beacon ISR. No dynamic allocation is required. The hash chain ({% term(url="#def-129", def="In-Place Hash Chain: SipHash-2-4 running chain on 16-byte state register — no heap allocation") %}Definition 129{% end %}) operates in-place on the 16 B chain register within the 140 B struct. At 95% RAM utilization on a 4 KB MCU: free = 204 B > 163 B. The AES footprint fits with 41 B margin. \\(\square\\)

| MCU tier | Total SRAM | 95% utilized | Free | AES footprint | Survives? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Ultra L0 | 4 KB | 3.88 KB | 204 B | 163 B | Yes (41 B margin) |
| Constrained L1 | 32 KB | 30.4 KB | 1.6 KB | 163 B | Yes (1.4 KB margin) |
| Standard L2 | 64 KB | 60.8 KB | 3.2 KB | 163 B | Yes (3.0 KB margin) |
| Rich L3+ | 256 KB | 243.2 KB | 12.8 KB | 163 B | Yes (12.6 KB margin) |

> **Physical translation:** The Autonomic Emergency State requires three simultaneous failures — the equivalent of a pilot declaring an emergency only when the engine is out, the altimeter is dead, and the landing gear will not deploy, all at once. Any two alone trigger heightened monitoring but not the full emergency protocol. The 163-byte AES footprint fits inside the 204-byte free headroom, confirming the protocol is implementable on the most constrained hardware in the fleet.

**Fleet-Level Autonomic Emergency State**

*When the fraction of fleet nodes in AES conditions exceeds \\(f_\\text{AES,max} = 0.40\\), the fleet enters Fleet Emergency Mode. Individual node safety is maintained by each node's local AES protocol. At the fleet level: (1) all inter-node coordination defers to pre-loaded contingency plans established during Phase-0 commissioning; (2) the quorum threshold for the {% term(url="@/blog/2026-02-05/index.md#def-66", def="Logical Quorum for High-Stakes Decisions: minimum number of fleet nodes required to authorize an irreversible operation under Byzantine fault tolerance") %}Logical Quorum{% end %} drops to {% katex() %}\max(1, \lfloor n/4 \rfloor){% end %} for the duration; (3) recovery from Fleet Emergency Mode requires a designated Commander Node (the highest-Authority-Tier node still continuously connected) to certify fleet state before normal quorum rules resume. The Commander Node designation uses the same Authority Tier hierarchy defined in {% term(url="@/blog/2026-02-05/index.md#def-68", def="Authority Tier: hierarchical level of decision-making authority assigned to a fleet node, determining which operations it may authorize autonomously") %}Definition 68{% end %}.*

*The reduced quorum must satisfy {% katex() %}q_{\text{reduced}} \geq \lfloor (n-1)/3 \rfloor + 1{% end %} to maintain Byzantine fault tolerance. If the reduced quorum would fall below this floor, Fleet Emergency Mode is not entered; instead, the fleet declares a split-brain condition and each fragment operates independently under L0 safe-mode rules.*

**What AES cannot fix.** Three failure modes remain unresolvable within the framework's formal bounds:

1. **Power failure mid-write.** If the node loses power while writing the CRDT merge result to flash, the write completes partially. On restart, the CRDT state is corrupted. The hash chain detects divergence at the next tick ({% katex() %}h[n] \neq \mathrm{expected}{% end %}), but repair requires rollback to the last checkpoint — which may itself be the record being written. Resolution requires factory-reset or human-initiated state reconstruction. The hash chain signals the problem; it cannot resolve it.

2. **Simultaneous-partition quorum deadlock.** If every node in the fleet enters OBSERVE simultaneously (e.g., GPS jamming + power surge disabling all radios), no gossip occurs and the WAKEUP quorum cannot form. The fleet is frozen in OBSERVE indefinitely. Resolution requires at least one node to be pre-designated as a **coordinator seed** — a node that exits OBSERVE unilaterally after {% katex() %}T_{\mathrm{acc}} > T_{\mathrm{seed}}{% end %} without waiting for quorum. This coordinator seed then forms the initial gossip contact that unfreezes the rest. The seed role must be assigned at provisioning, not at runtime.

**Coordinator seeding specification.** Before fleet deployment, designate one node as the L0 coordinator using the following provisioning procedure:

1. **Selection** — choose the node with the lowest hardware ID (MAC address or provisioned serial number); this is deterministic and requires no coordination.
2. **Budget reservation** — reduce the designated coordinator's \\(R_\text{crit}\\) threshold by the L0 footprint delta (~40 bytes additional state), ensuring it survives below \\(R_\text{crit}\\) at minimum battery. All other nodes retain their original \\(R_\text{crit}\\).
3. **Recovery protocol** — on fleet-wide partition, each non-coordinator node broadcasts OBSERVE beacons on the designated recovery channel; the coordinator remains on that channel continuously. Recovery completes when every node has received at least one coordinator beacon within \\(T_\text{recovery}\\).

> **Certification requirement.** Field Autonomic Certification ({% term(url="#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %}) must include a simultaneous-partition chaos test: all nodes within a fleet segment enter OBSERVE within 1 second of each other (simulated backbone relay failure). The test passes if the coordinator seed mechanism breaks the deadlock and the fleet resumes coordinated operation within \\(T_\\text{recovery}\\) minutes, where \\(T_\\text{recovery}\\) is specified in the deployment's mission requirements. Certification fails if the fleet remains deadlocked beyond \\(T_\\text{recovery}\\). For OUTPOST (127-sensor mesh), the recommended \\(T_\\text{recovery} = 10\\) minutes; for RAVEN (safety-critical), \\(T_\\text{recovery} = 2\\) minutes.

3. **Monotonic memory leak to AES.** A slow memory leak (unreleased gossip table entries, leaked event references) causes RAM to grow monotonically. AES activates when free SRAM drops below 204 B. But if the leak continues, even the 163 B AES footprint is threatened. The invariant of {% term(url="#prop-71", def="Certification Soundness: Field Autonomic Certification rejects any node that fails at least one prerequisite check, preventing premature authority grants") %}Proposition 71{% end %} requires the OBSERVE static struct to be non-reclaimable — this requires the struct to be declared as `static` in firmware and excluded from the heap region in the linker script. Software-heap AES is not AES.

*Triple-lock recovery protocol: the compound scenario of simultaneous AES entry AND HLC unavailability AND operator command attempt is a triple-lock condition in which the node cannot accept commands (Causal Barrier fail-closed), cannot adapt (EXP3-IX frozen), and cannot self-recover (AES constraints). The recovery protocol for this state is: (1) the node broadcasts a TRIPLE-LOCK beacon on its last-known emergency frequency at interval {% katex() %}T_\text{beacon} = 30\,\text{s}{% end %}; (2) the beacon includes the node's last known state and AES entry timestamp; (3) an operator or a connected fleet peer receiving the beacon may issue a cryptographically-signed UNLOCK command using the node's hardware root-of-trust key, bypassing the Causal Barrier for a single recovery window of {% katex() %}T_\text{unlock} = 120\,\text{s}{% end %}; (4) during the unlock window, the node restores HLC from the issuing peer, exits AES if conditions allow, and resumes normal operation. If no unlock is received within {% katex() %}T_\text{unlock,max} = 4\,\text{hours}{% end %}, the node powers down to the L0 Physical Safety Interlock posture.*

*Escalation mapping for AES-unresolvable failures:*
- *Hardware failure beyond software control — triggers the L0 physical interlock ({% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}) — distinct from the software-level terminal safety state (see [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-53)): the L0 interlock is a hardware circuit that is always active and bypasses the entire MAPE-K stack, while the software-level terminal safety state ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: the lowest-risk posture a node adopts when no safe healing action is available; irreversible during a partition") %}Definition 124{% end %}) is the MVS-floor outcome reached when all autonomic healing options are exhausted. No software protocol can override the L0 interlock once it fires.*
- *Adversarial attack that has compromised the trust root — Trust-Root Anchor re-commissioning ({% term(url="@/blog/2026-01-22/index.md#def-35", def="Trust-Root Anchor: Phase-0 attestation record signed by hardware TPM establishing a verifiable trust chain") %}Definition 35{% end %}): requires physical intervention to re-establish Phase-0 attestation; no autonomous recovery is possible.*
- *Triple-lock condition (AES + HLC failure + command rejection) — Triple-Lock Recovery Protocol (above): requires either an operator UNLOCK command or \\(T_\text{unlock,max}\\) timeout to L0 posture.*

> **Cognitive Map**: The meta-constraint section proves that autonomic infrastructure competes with the mission it serves. The {% term(url="#prop-68", def="Autonomic Overhead Bound: total autonomic stack memory must stay below the critical resource threshold; the Zero-Tax tier satisfies this bound for MCUs down to 4 KB SRAM") %}Proposition 68{% end %} bound gives the feasibility ceiling. The budget allocation table gives the practical distribution. The zero-tax implementation shows how ultra-constrained hardware (140 byte OBSERVE struct) enables minimum viable autonomic capability when the standard stack is infeasible. Three unresolvable failure modes identify the limits of software-level remediation — power failure mid-write, simultaneous quorum deadlock, and monotonic memory leak all require hardware-level or provisioning-level solutions, not software fixes.

> **Empirical status**: The 163 B AES footprint and 204 B free-headroom bound are exact for the stated MCU tier and stack-frame composition; the 5% free-headroom assumption should be verified per deployment platform because systems with high dynamic allocation (gossip table growth) may leave less than 204 B free at 95% utilization, and the 41 B margin should be confirmed with a worst-case heap fragmentation test before certification.

---

## Hardware-Software Boundary as Constraint

> **Problem**: Software optimization has fundamental physical limits. A protocol running at 80% of Shannon capacity gains almost nothing from further compression tuning. A CPU at 95% utilization with optimized algorithms requires more silicon, not better code.
> **Solution**: Identify the three hardware physics constraints (bandwidth limited by Shannon capacity, compute limited by silicon, endurance limited by battery energy) and map each to its optimization ceiling. Know your hardware limits before beginning software optimization — if you're already at the ceiling, further software work yields diminishing returns.
> **Trade-off**: Hardware constraints are not solved by software — they are worked around (compression, efficiency, prioritization) or accepted as operational limits. Secure boot and trust chains add hardware cost and complexity but are required prerequisites for trusting any software health report. OTA updates under partition require version compatibility matrices that grow with fleet diversity.

### When Software Hits Hardware Physics

Software optimization has limits. Eventually, improvement requires hardware change. Recognizing these boundaries prevents wasted optimization effort.

**Radio propagation**: Physics determines range
- Shannon limit: {% katex() %}C = B \log_2(1 + \text{SNR}){% end %} is absolute
- No software can exceed the channel capacity
- Optimization: compression, error correction, protocol efficiency
- Limit: once at Shannon limit, further improvement requires hardware (more power, better antenna)

**Processing speed**: Silicon determines computation
- Clock speed, parallelism, and architecture set compute ceiling
- Algorithm optimization helps, but diminishing returns
- Limit: once algorithms are optimal, more compute requires more hardware

**Power density**: Batteries determine endurance
- Energy = power \\(\times\\) time; fixed battery means fixed energy
- Efficiency optimization extends endurance
- Limit: once power usage is minimized, more endurance requires bigger battery

**Design principle**: Know your hardware limits before optimizing software. If the system is already at 80% of Shannon limit, further protocol optimization yields diminishing returns. If CPU is 95% utilized with already-optimized algorithms, more capability requires more silicon.

### Secure Boot and Trust Chains

Hardware security is foundational. Secure boot establishes the root of trust:

**Secure boot process**:
1. Hardware ROM contains public key (immutable)
2. Bootloader signature verified against ROM key
3. OS signature verified by bootloader
4. Application signatures verified by OS
5. Each layer attests the layer it loaded

**Edge challenges**:
- **Physical access**: Adversary may attempt to extract keys, modify hardware
- **Limited resources**: Full attestation chains may be too costly
- **Partition state**: Cannot verify remote attestations during isolation

**Integration with self-measurement**: Hardware health is the foundation of the [observability hierarchy](@/blog/2026-01-22/index.md) (P0 level). If hardware attestation fails:
- Distrust all software health reports
- Quarantine the node from fleet
- Flag for physical inspection

{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} example: Vehicle 7 fails hardware attestation after traversing adversary territory. The self-measurement system shows all green. But the attestation failure means we cannot trust those reports. Vehicle 7 is quarantined—excluded from fleet coordination until physically verified.

### OTA Updates as Fleet Coherence Problem

Over-the-air (OTA) updates are essential for improvement but create coherence challenges:

**The version coherence problem**:
- Fleet nodes may have different software versions
- Partition during update leaves nodes at inconsistent versions
- Version differences may cause protocol incompatibility
- Rollback may be required but not all nodes can roll back

**Update sequencing strategy**:
1. **Stage updates**: Update subset of fleet, observe behavior
2. **Maintain compatibility**: Version N must work with N-1 and N+1
3. **Coordinate timing**: Update during high-connectivity windows
4. **Rollback capability**: Every update must be reversible
5. **Partition tolerance**: Update process must handle partition gracefully

**Connection to fleet coherence**: Update state is reconcilable state. During partition healing:
- Detect version mismatches
- Apply reconciliation protocol for updates
- Either converge to latest version or maintain compatibility mode

> **Cognitive Map**: The hardware-software boundary section names the three physical ceilings that software optimization cannot cross. Bandwidth is bounded by Shannon capacity; compute is bounded by silicon; endurance is bounded by battery energy density. Secure boot grounds the entire trust chain — hardware attestation failure overrides all software health reports. OTA updates under partition are a fleet coherence problem: version divergence during partition must be treated with the same CRDT-based reconciliation as state divergence. Know your hardware limits before profiling your algorithms.

---

## Formal Validation Framework

> **Problem**: Without formal validation gates, teams advance to higher capability phases before foundational ones are solid — exactly the CONVOY team's failure. "Phase gate" cannot mean "someone signs off" — it must mean a specific quantitative predicate that either passes or fails.
> **Solution**: Define phase gate functions as conjunctions of validation predicates: {% katex() %}G_i(S) = \bigwedge_{p \in P_i} \mathbb{1}[V_p(S) \geq \theta_p]{% end %}. All predicates must pass simultaneously — a 4-of-5 score does not open the gate. {% term(url="#prop-72", def="Phase Progression Invariant: the system can only advance to the next constraint level when the Phase Gate Function returns true; regression is permitted at any time") %}Proposition 72{% end %} (Phase Progression Invariant) requires all prior gates to remain satisfied on entry to each new phase, making regression testing a theorem, not an afterthought.
> **Trade-off**: Statistical rigor requires \\(N \geq 28\\) trials for pass/fail predicates to achieve 95% confidence on the true pass probability. A single 24-hour chaos run does not constitute statistically valid certification. Teams under schedule pressure systematically lower thresholds post-hoc if predicates are not defined before implementation begins — define them quantitatively before writing code.

### Phase Gate Functions

Edge architecture development follows a phase-gated structure where each phase must satisfy formal validation predicates before the system advances.

<span id="def-103"></span>
**Definition 103** (Phase Gate Function). *A {% term(url="#def-103", def="Checkpoint where three conditions must ALL hold before advancing to the next capability: ROI on the current constraint below 3x, 95% of its theoretical ceiling reached, and the next constraint measurably binding") %}phase gate{% end %} function {% katex() %}G_i: \mathcal{S} \rightarrow \{0, 1\}{% end %} is a conjunction predicate over validation conditions:*

{% katex(block=true) %}
G_i(S) = \bigwedge_{p \in P_i} \mathbb{1}[V_p(S) \geq \theta_p]
{% end %}

*In practice: the gate opens only when every prerequisite p in set \\(P_i\\) has measured value \\(V_p\\) meeting its threshold \\(\theta_p\\) — a logical AND across all prerequisites. One unmet prerequisite, however marginal, holds the entire phase closed.*

- **Use**: Computes a binary gate that is 1 only when every validation predicate in phase {% katex() %}i{% end %} simultaneously meets its threshold; apply at the end of each development phase — {% katex() %}G_i = 0{% end %} blocks all advancement to prevent partial-pass advancement that hides a critical capability gap behind a 4-of-5 passing score.
- **Parameters**: Each threshold is mission-specific (e.g., detection accuracy {% katex() %}\geq 0.80{% end %}); all predicates must pass simultaneously, not in aggregate.
- **Field note**: Define predicates quantitatively before writing any code — teams that define gates post-hoc systematically lower thresholds to pass on schedule.

> **Physical translation**: {% katex() %}G_i(S) = \bigwedge_{p \in P_i} \mathbb{1}[V_p(S) \geq \theta_p]{% end %} is a logical AND over a checklist. Every predicate must individually reach its threshold — the gate is binary, not a score. If there are 6 predicates and 5 pass, the gate is 0 (closed). This eliminates "mostly good enough" advancement: a hardware attestation predicate that fails means the node cannot be trusted, regardless of how well its detection accuracy performs. The conjunction forces complete readiness, not averaged readiness.

Where \\(P_i\\) is the set of validation predicates for phase \\(i\\), \\(V_p(S)\\) is the validation score for predicate \\(p\\) given state \\(S\\), and \\(\theta_p\\) is the threshold for predicate \\(p\\).

**Statistical note**: Each predicate \\(V_p(S) \geq \theta_p\\) is evaluated against observed test runs. A single pass provides one data point, not a distribution. For pass/fail predicates ({% katex() %}V_{\mathrm{surv}}{% end %}, {% katex() %}V_{\mathrm{zero}}{% end %}, {% katex() %}V_{\mathrm{heal}}{% end %}), the 95% Clopper-Pearson lower confidence bound on the true pass probability after \\(k\\) successes in \\(N\\) trials is \\(p_L(k, N, 0.05)\\). Achieving \\(p_L(N, N, 0.05) \geq 0.95\\) requires \\(N \geq 28\\) trials — not 1.

In practice: hardware-layer tests (H1–H4) can be run on production samples; system-level gates (C1–C7) satisfy the statistical requirement via combined simulation and hardware runs, with the trial count tracked in the certification evidence package. A single 24-hour chaos run satisfies C1–C7 as an integration check; it does not constitute a statistically valid certification until replicated \\(N \geq 28\\) times or complemented by model checking for the correctness predicates ({% katex() %}V_{\mathrm{merge}}{% end %}, {% katex() %}V_{\mathrm{reconcile}}{% end %}).

**Compute Profile:** CPU: {% katex() %}O(|P_i|){% end %} per gate evaluation — one threshold comparison per predicate in {% katex() %}P_i{% end %}, with short-circuit on first failure. Memory: {% katex() %}O(|P_i|){% end %} — one measurement value per predicate. The binding cost is collecting the validation measurements {% katex() %}V_p(S){% end %}, not computing the conjunction.

> **Analogy:** A quality control checkpoint on an assembly line — the gate stamps PASS and lets the part advance, or stamps HOLD and routes it back. No partial passes.

**Logic:** The gate is a logical AND over all validation predicates; a single unmet predicate closes the gate regardless of how many others pass, preventing partial-pass advancement that conceals a critical capability gap.

### Compute-Time Constraint on Phase Progression

The ARM Cortex-A53 baseline profiles established across the series yield a concrete bound on phase progression. The full autonomic pipeline — MAPE-K loop, EXP3-IX decision, CRDT merge, and phase gate evaluation — runs in sequence within each scheduling window. At 100 Hz sensor rate with a 10 ms scheduling budget:

| Pipeline stage | Typical cost | Source |
| :--- | :--- | :--- |
| MAPE-K Monitor + Analyze | ~1.5 ms | Definition 36 profile |
| EXP3-IX arm selection + update | ~0.02 ms | Definition 81 profile |
| CRDT merge (500-entry delta) | ~0.46 ms | Definition 58 profile |
| Phase gate evaluation | ~0.005 ms | Definition 103 profile |
| **Total** | **~2.0 ms** | |

The 2 ms nominal case leaves 8 ms of margin. However, if the CRDT state store grows beyond 5,000 entries ({% katex() %}|\Delta| > 5{,}000{% end %}), the merge cost alone reaches ~4.6 ms, and if concurrent healing actions drive the MAPE-K Analyze phase to process 50+ sensor streams simultaneously, the total pipeline can approach or exceed 8 ms. When the full MAPE-K + EXP3-IX + CRDT pipeline exceeds 8 ms per cycle, phase progression stalls: the phase gate function ({% term(url="#def-103", def="Phase Gate Function: conjunction predicate over validation conditions; opens only when every prerequisite simultaneously meets its threshold, preventing partial-pass advancement") %}Definition 103{% end %}) cannot be evaluated within the scheduling window because the pipeline has not yet produced the validation measurements \\(V_p(S)\\) required for the conjunction predicate. The gate remains closed not because any predicate failed, but because the predicate was never computed. This is operationally equivalent to a gate failure and must be treated as such in the certification evidence package.

**Mitigation:** Cap the CRDT state store at 2,000 entries per MAPE-K tick by deferring lower-priority delta entries to the next gossip window ({% term(url="@/blog/2026-02-05/index.md#def-70", def="Delta-Sync Protocol: gossip protocol transmitting only state deltas rather than full state, reducing sync bandwidth proportionally per round") %}Definition 70{% end %} Phase 3 chunking). At 2,000 entries the merge cost is ~1.5 ms, keeping the total pipeline at ~3.0 ms and preserving the 7 ms margin required for phase gate evaluation.

**Permanent-failure resolution paths.** When a Phase Gate predicate is structurally unachievable — hardware fault, supply-chain compromise, or irreconcilable power-budget constraint — four resolution paths are available in order of preference. A system that cannot achieve Phase 0 (\\(G_0\\) permanently fails) enters the Terminal Safety State ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}) and awaits physical inspection. There is no defined operational mode below Phase 0.

1. **Capability-level downgrade**: The system operates at the highest Phase N whose gate \\(G_N\\) is achievable. Phase N+1 capability is explicitly disabled and documented in the deployment record. This is the nominal path for sensor hardware faults — the system remains operational at reduced capability.

2. **Documented operating restriction**: The system is certified for deployment with Phase N+1 capability formally restricted. The restriction is recorded in the Field Autonomic Certification (see {% term(url="#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %}) as a named exception, not a failure. The exception expires when the hardware defect is remediated.

3. **Re-certification trigger**: After any hardware change (sensor replacement, firmware re-flash, physical re-wiring), the system re-enters the certification sequence from Phase 0. Re-certification does not require completing the full 24-hour isolation test if the change is scoped to a subsystem whose predicates were already passing — only the affected gate predicates are re-evaluated.

4. **Orphan (hardware-limited systems)**: When no relaxation, re-allocation, or demotion can bring the system into compliance — typically because a hardware constraint is physically binding — mark the affected capability class as permanently out-of-scope. Issue a **Partial Certification**: "Certified for Gate \\(k-1\\) with Gate \\(k\\) capability class \\([X]\\) explicitly excluded." Operators must provide manual intervention for all events in the excluded class. Example: OUTPOST mesh hardware cannot achieve healing success rate \\(> 50\\%\\) for power-failure events — Gate 3 is certified with "power-failure healing" excluded; all power-failure responses are operator-escalated.

<span id="prop-72"></span>
**Proposition 72** (Phase Progression Invariant). *The system can only enter phase \\(i+1\\) if all prior gates remain valid:*

*Advancing {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} to anti-fragile learning requires every earlier gate — hardware trust, survival, self-measurement, healing, fleet coherence — to still be green; a Phase 3 code change that silently breaks a Phase 1 healing predicate sends the system back to Phase 1.*

{% katex(block=true) %}
\text{enter}(i+1) \Rightarrow \bigwedge_{j=0}^{i} G_j(S) = 1
{% end %}

- **Use**: Requires all prior phase gates {% katex() %}G_0{% end %} through {% katex() %}G_i{% end %} to remain satisfied on entry to each new phase; re-run all prior gate predicates after every code change to prevent silent gate regression where a current-phase change breaks an earlier hardware trust or isolation requirement.
- **Parameters**: Any {% katex() %}G_j = 0{% end %} for {% katex() %}j \leq i{% end %} requires regression to phase {% katex() %}j{% end %} before proceeding — there is no exception path.
- **Field note**: Automate all prior gate checks in CI — manual re-verification of previous phases is never done consistently under schedule pressure.

> **Physical translation**: {% katex() %}\bigwedge_{j=0}^{i} G_j(S) = 1{% end %} means every prior phase gate must still be green before the system can enter a new phase. The system cannot skip phases or revert to an earlier phase mid-mission without re-certifying. If a Phase 3 code change breaks a Phase 1 healing predicate, the system must regress to Phase 1 validation before any Phase 3 capability can be re-enabled — no exception path, no "grandfather clause."

This creates a regression invariant: any change that invalidates an earlier gate \\(G_j\\) for \\(j < i\\) requires regression to phase \\(j\\) before proceeding.

**Capability Retention and Structural Regression**

Once a phase gate \\(G_i\\) passes, the associated capability tier is operationally retained for as long as the underlying system state remains structurally sound. Retention is not unconditional: a gate predicate that fails while the system is connected and resource-adequate signals genuine structural regression, distinct from a predicate failure caused by external environment changes.

A gate predicate failure is classified as **external** if \\(T_\\text{acc}(t) > 0\\) at the time of failure — the node is under active partition. External failures do not count toward the regression counter. A failure is classified as **structural** if \\(T_\\text{acc}(t) = 0\\) — the node is connected and resource-adequate, yet the gate still fails.

If the structural failure count for gate \\(G_j\\) reaches 2 within any rolling 24-hour window, the system enters the {% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: the lowest-risk posture a node adopts when no safe healing action is available; irreversible during a partition") %}Terminal Safety State{% end %}.

> **Physical translation:** A drone that loses its gossip network during confirmed jamming is not regressing — it is responding correctly to the environment. A drone that loses gossip while connected to ground infrastructure has a real internal fault. Only the second case advances the regression counter.

**Phase gates and the judgment horizon operate at different timescales.** Phase gates ({% term(url="#def-103", def="Phase Gate Function: predicate that must evaluate to true before a capability level transition is permitted; prevents premature escalation") %}Definition 103{% end %}, {% term(url="#prop-72", def="Phase Progression Invariant: the system can only advance to the next constraint level when the Phase Gate Function returns true; regression is permitted at any time") %}Proposition 72{% end %}) are *static deployment-time* predicates — they answer "is this system ready to run the next capability layer?" and are evaluated once per phase transition. The {% term(url="@/blog/2026-02-12/index.md#def-91", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} ({% term(url="@/blog/2026-02-12/index.md#def-91", def="Judgment Horizon: time window over which an edge node can make autonomous decisions without external validation before confidence degrades below a threshold") %}Definition 91{% end %}, [Anti-Fragile Decision-Making](@/blog/2026-02-12/index.md#def-91)) is a *dynamic runtime* predicate — it answers "should the running system escalate this specific decision to a human?" and is evaluated on every decision event. The relationship is sequential: passing gate \\(G_3\\) certifies the system to make anti-fragile decisions autonomously up to but not beyond the judgment horizon; the certified system then enforces the horizon at runtime. A system that passes all five phase gates is still obligated to escalate decisions above the judgment horizon — certification expands the automatable decision space; it does not eliminate the escalation boundary.

**Connection to Formal Methods**

The {% term(url="#def-103", def="Checkpoint where three conditions must ALL hold before advancing to the next capability: ROI on the current constraint below 3x, 95% of its theoretical ceiling reached, and the next constraint measurably binding") %}phase gate{% end %} framework translates directly to formal verification tools:

- **TLA+**: Phase gates become safety invariants. The conjunction {% katex() %}\bigwedge_{j=0}^{i} G_j(S){% end %} is a state predicate that model checking verifies holds across all reachable states. In TLA+ temporal logic: \\(\Box P\\) means 'P always holds'; \\(\bigcirc P\\) means 'P holds in the next state'; \\(\Diamond P\\) means 'P eventually holds'. The formula below expresses: phase gates remain satisfied, or if violated they must eventually recover. Temporal logic captures the progression invariant: {% katex() %}\Box(G_i \Rightarrow \bigcirc G_i) \lor (\bigcirc \neg G_i \land \Diamond G_i){% end %}—gates remain valid or the system regresses and recovers.

- **Alloy**: The {% term(url="#def-93", def="Dependency graph where an edge A→B means capability A must be substantially solved before B can become binding; valid implementation sequences follow topological order through this graph") %}prerequisite graph{% end %} ({% term(url="#def-93", def="Prerequisite Graph: DAG encoding capability dependencies; an edge A to B means A must be validated before B can be safely activated") %}Definition 93{% end %}) maps to Alloy's relational modeling. Alloy's bounded model checking can verify that no valid development sequence violates phase dependencies, finding counterexamples if the constraint graph has hidden cycles.

- **Property-Based Testing**: Tools like QuickCheck/Hypothesis generate random system states and verify {% term(url="#def-103", def="Checkpoint where three conditions must ALL hold before advancing to the next capability: ROI on the current constraint below 3x, 95% of its theoretical ceiling reached, and the next constraint measurably binding") %}phase gate{% end %} predicates hold, providing confidence without exhaustive enumeration.

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}, the TLA+ model is ~500 lines specifying connectivity transitions, healing actions, and {% term(url="#def-103", def="Checkpoint where three conditions must ALL hold before advancing to the next capability: ROI on the current constraint below 3x, 95% of its theoretical ceiling reached, and the next constraint measurably binding") %}phase gate{% end %}s. Model checking verified the phase progression invariant holds for fleet sizes up to n=50 and partition durations up to 10,000 time steps.

> **Empirical status**: The "2-failure in 24 hours" threshold for {% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Terminal Safety State{% end %} entry is a conservative default; the appropriate oscillation tolerance depends on the observed transient-fault frequency for a given hardware platform — deployments with noisy sensors or marginal power supplies may need a wider window (48–72 hours) to distinguish genuine instability from environmental transients, and the threshold should be set from at least 30 baseline-operation hours of gate-predicate pass/fail telemetry.

**TLA+ variable mapping** (formal model to Core State Variables): The following correspondence ensures TLA+ specifications are direct translations of the architectural prose — each model variable is grounded in the formally defined state space.

| TLA+ Variable | Architectural Symbol | Definition |
| :--- | :--- | :--- |
| `Xi_t` | \\(\Xi(t)\\) | Operating regime: Connected / Degraded / Intermittent / None (Definition 6) |
| `tau_transport` | \\(\tau\\) | Transport / feedback delay (see notation disambiguation for subscript conventions) |
| `R_t` | \\(R(t)\\) | Normalized resource availability — Definition 130 (Resource State, this article) |
| `C_t` | \\(C(t)\\) | Link quality \\([0,1]\\) — Core State Variables |
| `L_t` | \\(\mathcal{L}(t)\\) | Capability level L0–L4 — Core State Variables |
| `D_t` | \\(D(\Sigma_A, \Sigma_B)\\) | State divergence \\([0,1]\\) — Definition 57 |
| `H_t` | \\(H(t)\\) | Health vector — Core State Variables |

### Phase 0: Foundation Layer

The foundation layer establishes hardware trust as the root of all subsequent guarantees.

{% katex(block=true) %}
\begin{aligned}
V_{\text{attest}}(S) &= \mathbb{1}[\text{SecureBoot}(h) \land \text{ChainValid}(h) \land \neg\text{Tamper}(h)] \\
V_{\text{surv}}(S) &= \mathbb{1}[\forall t \in [0, \tau_{\text{surv}}]: \text{Alive}(n, t)] \\
V_{\text{budget}}(S) &= \mathbb{1}[\forall r \in \mathcal{R}: U_r(S) \leq B_r] \\
V_{\text{safe}}(S) &= \mathbb{1}[\text{CriticalFailure}(t) \Rightarrow S(t + \epsilon) \in \mathcal{S}_{\text{safe}}]
\end{aligned}
{% end %}

Typical survival duration thresholds: {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} 24 hours, {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} 72 hours, {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} 30 days.

The survival duration test ({% katex() %}V_{\text{surv}}{% end %}) confirms the node stays alive under partition. A stricter predicate, {% katex() %}V_{\text{zero}}{% end %}, confirms it stays alive under **complete radio silence** — no \\(T_s\\) transmissions permitted — for the full mission-critical window. This distinguishes partition survival (where the node may attempt transmissions that fail) from zero-backhaul operation (where the radio is deliberately off or physically destroyed).

{% katex(block=true) %}
V_{\text{zero}}(S) = \mathbb{1}\!\left[B_b(t) = 0,\; \forall t \in [0,\,\tau_0] \;\Rightarrow\; \text{Alive}(n,\,\tau_0) \;\land\; U_E(S) \leq B_E\right]
{% end %}

where {% katex() %}\tau_0 = 72\,\text{h}{% end %} is the zero-backhaul duration, \\(B_b(t) = 0\\) enforces no radio transmission, \\(U_E(S)\\) is energy consumed over \\([0, \tau_0]\\), and {% katex() %}B_E = E_{\text{battery}} - E_{\text{reserve}}{% end %} is the usable energy budget.

**Why \\(\tau_0 = 72\\,\text{h}\\)**: This matches {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}'s worst-case terrain crossing window (72 hours per the foundational constraint analysis). {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} uses 24 hours; {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} uses 30 days. The predicate threshold scales with the target system but 72 hours is the standard tactical stress duration.

**What the zero-backhaul test validates**:
1. **Energy budget**: The node's baseline draw (compute, sensors, {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop) does not exhaust the battery before \\(\tau_0\\). Because \\(T_s = 0\\) (no radio energy spent), this isolates the pure compute-plus-sensors energy envelope.
2. **Local {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop**: All healing decisions execute using only local state — no coordination messages, no remote health reports, no gossiped vectors.
3. **State preservation**: The node accumulates divergence \\(D(t)\\) over \\(\tau_0\\) but does not corrupt its local state; reconciliation remains possible when \\(B_b\\) recovers.
4. **Ingress filter correctness**: The \\(\Pi\\) filter ({% term(url="@/blog/2026-01-22/index.md#def-25", def="Bandwidth-Asymmetry Ingress Filter: rate-limiter preventing inbound gossip from exceeding available backhaul bandwidth in asymmetric link conditions") %}Definition 25{% end %}) operates at \\(\beta = 0\\) — all non-critical telemetry is suppressed, confirming the filter does not deadlock the {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop by starving it of P0 metrics.

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} scenario**: Vehicle 7 enters a 3 km canyon with no line-of-sight radio propagation. The radio transceiver is powered down (zero \\(T_s\\) cost). Over 72 hours, the vehicle continues route execution, logs all autonomous decisions, maintains local health monitoring via {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %}, and stores diverged state in its {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} buffers. On canyon exit, it reconnects and reconciles. Phase 0 requires demonstrating this entire sequence before any coordination protocol is integrated.

**Phase 0 gate**: {% katex() %}G_0(S) = V_{\text{attest}} \land V_{\text{surv}} \land V_{\text{budget}} \land V_{\text{safe}} \land V_{\text{zero}} \land V_{\text{calib}}{% end %}

**{% katex() %}V_{\text{calib}}{% end %} — sensor calibration attestation**: {% katex() %}V_{\text{attest}}{% end %} verifies firmware integrity (the node runs what it was programmed to run) but does not verify that its sensors report truthful physical values. A node with valid secure boot attestation but a miscalibrated temperature sensor that reads \\(+15^\circ\text{C}\\) high passes all cryptographic checks while injecting systematically false data into the fleet's shared state — it is {% term(url="@/blog/2026-01-22/index.md#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %}-equivalent in effect without being {% term(url="@/blog/2026-01-22/index.md#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} in the fault-model sense (the firmware is correct; only the sensor hardware is wrong).

{% katex() %}V_{\text{calib}}{% end %} adds the requirement that all physical sensors have been calibrated against a known reference within the calibration interval {% katex() %}T_{\text{cal}}{% end %}:

{% katex(block=true) %}
V_{\text{calib}}(S) = \mathbb{1}[\forall s \in \mathcal{S}_{\text{sensors}}: |v_s^{\text{measured}} - v_s^{\text{reference}}| \leq \delta_s \land t_{\text{now}} - t_{\text{last\_cal}}(s) \leq T_{\text{cal}}]
{% end %}

where \\(\delta_s\\) is the per-sensor accuracy specification and {% katex() %}T_{\text{cal}}{% end %} is the manufacturer-specified or mission-specified recalibration interval.

Calibration procedure at Phase 0: expose each sensor to a known reference stimulus (laboratory or field reference standard), record deviation, and cryptographically sign the calibration record with the node's device key. The signed calibration record is included in the attestation evidence package. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}: MEMS IMUs recalibrated before each flight ({% katex() %}T_{\text{cal}} = 1{% end %} flight); LIDAR returns factory-calibrated ({% katex() %}T_{\text{cal}} = 90{% end %} days).

Nodes that fail {% katex() %}V_{\text{calib}}{% end %} are excluded from Phase 0 and may not participate in {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} or peer validation until recalibrated — an uncalibrated sensor propagates systematic error through the fleet's {% term(url="@/blog/2026-01-22/index.md#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %}-tolerance mechanism regardless of the trust weight assigned by Def 44.

### Phase 1: Local Autonomy Layer

Phase 1 validates individual node autonomy—self-measurement and self-healing without external coordination.

{% katex(block=true) %}
\begin{aligned}
V_{\text{obs}}(S) &= \mathbb{1}[\forall m \in \mathcal{M}_{P \leq 2}: \text{Collected}(m, S)] \\
V_{\text{detect}}(S) &= \mathbb{1}\left[\frac{\text{TP} + \text{TN}}{\text{Total}} \geq \theta_{\text{detect}}\right] \\
V_{\text{heal}}(S) &= \mathbb{1}[\forall f \in \mathcal{F}: \exists h \in \mathcal{H}: \text{Recovers}(h, f)] \\
V_{\text{part}}(S) &= \mathbb{1}[\text{Isolate}(n, \tau_{\text{part}}) \land \text{InjectFaults}(\mathcal{F}) \Rightarrow \text{Alive}(n)]
\end{aligned}
{% end %}

Typical thresholds for tactical systems: overall accuracy {% katex() %}\theta_{\text{detect}} \geq 0.80{% end %}, false negative rate \\(< 0.05\\) (catch \\(>95\\%\\) of anomalies), false positive rate \\(< 0.20\\) (tolerate some false alarms to maintain throughput). Overall accuracy alone is insufficient — a class-imbalanced system can achieve \\(0.90\\) accuracy while missing half of all anomalies.

**Phase 1 gate**: {% katex() %}G_1(S) = G_0(S) \land V_{\text{obs}} \land V_{\text{detect}} \land V_{\text{heal}} \land V_{\text{part}}{% end %}

### Phase 2: Local Coordination Layer

Phase 2 validates cluster-level coordination—local groups of nodes operating coherently.

{% katex(block=true) %}
\begin{aligned}
V_{\text{form}}(S) &= \mathbb{1}[\text{Connectivity}(\mathcal{N}) \Rightarrow \text{ClusterFormed}(\mathcal{N}, \tau_{\text{form}})] \\
V_{\text{gossip}}(S) &= \mathbb{1}[\forall n_i, n_j \in \mathcal{C}: |H_{n_i}(n_j) - H_{\text{true}}(n_j)| < \epsilon_H] \\
V_{\text{auth}}(S) &= \mathbb{1}[\forall d \in \mathcal{D}: \text{AuthLevel}(d) \in \{L_0, L_1, L_2\}] \\
V_{\text{merge}}(S) &= \mathbb{1}[\text{Partition}(\mathcal{C}) \land \text{Reconnect} \Rightarrow \text{Coherent}(\mathcal{C})]
\end{aligned}
{% end %}

Typical formation convergence threshold: {% katex() %}\tau_{\text{form}} = 30\text{s}{% end %} for tactical clusters.

**Phase 2 gate**: {% katex() %}G_2(S) = G_1(S) \land V_{\text{form}} \land V_{\text{gossip}} \land V_{\text{auth}} \land V_{\text{merge}}{% end %}

### Phase 3: Fleet Coherence Layer

Phase 3 validates fleet-wide state reconciliation and hierarchical authority {{ cite(ref="9", title="Shapiro et al. (2011) — Conflict-Free Replicated Data Types") }}.

{% katex(block=true) %}
\begin{aligned}
V_{\text{reconcile}}(S) &= \mathbb{1}[\text{Reconnect}(\mathcal{F}) \Rightarrow \text{StateConverged}(\mathcal{F}, \tau_{\text{reconcile}})] \\
V_{\text{crdt}}(S) &= \mathbb{1}[\forall s \in \mathcal{S}_{\text{shared}}: \sqcup_s \text{ is commutative, associative, idempotent}] \\
V_{\text{hier}}(S) &= \mathbb{1}[\forall d \in \mathcal{D}: \text{AuthLevel}(d) \in \{L_0, L_1, L_2, L_3\}] \\
V_{\text{conflict}}(S) &= \mathbb{1}[\forall (s_1, s_2): s_1 \neq s_2 \Rightarrow \text{resolve}(s_1, s_2) \text{ is deterministic}]
\end{aligned}
{% end %}

Extended partition recovery predicate validates fleet reconvergence after 24-hour partition: {% katex() %}V_{\text{reconverge}}(S) = \mathbb{1}[\text{PartitionDuration} \geq 24\text{h} \Rightarrow \text{StateConverged}(\mathcal{F}, \tau_{\text{reconcile}})]{% end %} where {% katex() %}\text{StateConverged}{% end %} means all nodes agree on shared {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} state within reconciliation window {% katex() %}\tau_{\text{reconcile}}{% end %}.

**Phase 3 gate**: {% katex() %}G_3(S) = G_2(S) \land V_{\text{reconcile}} \land V_{\text{crdt}} \land V_{\text{hier}} \land V_{\text{conflict}}{% end %}

### Phase 4: Optimization Layer

Phase 4 validates adaptive learning and the {% term(url="@/blog/2026-02-12/index.md#def-91", def="Time window J over which the system evaluates stress outcomes before adapting; shorter J enables faster adaptation but higher variance in parameter estimates") %}judgment horizon{% end %} boundary.

{% katex(block=true) %}
\begin{aligned}
V_{\text{prop}}(S) &= \mathbb{1}[\text{Update}(\theta, n_i) \Rightarrow \forall n_j: |\theta_{n_j} - \theta| < \epsilon_\theta \text{ eventually}] \\
V_{\text{adapt}}(S) &= \mathbb{1}[\frac{\partial \theta}{\partial t} = f(\text{Performance}(\theta, S))] \\
V_{\text{learn}}(S) &= \mathbb{1}[\mathbb{E}[\text{Performance}(t + \Delta t)] > \mathbb{E}[\text{Performance}(t)]] \\
V_{\text{override}}(S) &= \mathbb{1}[\forall d \in \mathcal{D}_{\text{auto}}: \text{Override}(d) \text{ accessible}] \\
V_{\text{horizon}}(S) &= \mathbb{1}[\forall d \in \mathcal{D}_{\text{human}}: \neg\text{Automated}(d)] \\
V_{\text{SA}}(S) &= \mathbb{1}[\text{HandoverLead}(S) \geq \tau_{SA}] \\
V_{\text{trust}}(S) &= \mathbb{1}[\mathcal{T}\text{-model active} \land \eta_{\text{loss}} > \eta_{\text{gain}}]
\end{aligned}
{% end %}

**Phase 4 gate**: {% katex() %}G_4(S) = G_3(S) \land V_{\text{prop}} \land V_{\text{adapt}} \land V_{\text{learn}} \land V_{\text{override}} \land V_{\text{horizon}} \land V_{\text{SA}} \land V_{\text{trust}}{% end %}

where {% katex() %}V_{\text{SA}}{% end %} verifies handover is triggered at least {% katex() %}\tau_{SA}{% end %} seconds before the predicted failure boundary ({% term(url="#prop-74", def="Predictive Handover Criterion: edge node should initiate autonomous-mode handover when the partition accumulator exceeds the 95th-percentile partition duration") %}Proposition 74{% end %}), and {% katex() %}V_{\text{trust}}{% end %} verifies the asymmetric trust model ({% term(url="#def-105", def="Asymmetric Trust Dynamics: trust gain and loss rates differ; nodes lose trust rapidly on violation but regain it slowly after correct behavior") %}Definition 105{% end %}) is implemented with {% katex() %}\eta_{\text{loss}} \gg \eta_{\text{gain}}{% end %}.

### Phase 5: Integration Layer

Phase 5 validates complete system operation across all connectivity states.

{% katex(block=true) %}
\begin{aligned}
V_{L4}(S) &= \mathbb{1}[C(t) > 0.8 \Rightarrow \text{Capability}(S) = L_4] \\
V_{\text{degrade}}(S) &= \mathbb{1}[\text{Stress}(S) \Rightarrow \text{Capability}(S) \downarrow \text{ monotonically}] \\
V_{\text{cycle}}(S) &= \mathbb{1}[\text{Connected} \rightarrow \text{Denied} \rightarrow \text{Connected} \Rightarrow \text{Coherent}(\mathcal{F})] \\
V_{\text{adv}}(S) &= \mathbb{1}[\text{RedTeam}(\mathcal{F}) \Rightarrow \neg\text{Compromised}(\mathcal{F})] \\
V_{\text{antifragile}}(S) &= \mathbb{1}[\text{PostStress}(P) > \text{PreStress}(P)]
\end{aligned}
{% end %}

**Phase 5 gate**: {% katex() %}G_5(S) = G_4(S) \land V_{L4} \land V_{\text{degrade}} \land V_{\text{cycle}} \land V_{\text{adv}} \land V_{\text{antifragile}} \land V_{\text{SOE}} \land V_{\text{causal}} \land V_{\text{L0phys}}{% end %}

*Phase 5 gate predicate set \\(P_5\\): {% katex() %}\{V_1, V_2, V_3, V_4, V_\text{SOE}, V_\text{causal}\}{% end %} where \\(V_1\\) through \\(V_4\\) are the cumulative gate predicates from Phases 1–4, \\(V_\text{SOE}\\) is the Safe Operating Envelope validator from [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md) (all three SOE axes within bounds), and \\(V_\text{causal}\\) is the Causal Barrier integrity check ({% term(url="#def-106", def="Causal Barrier: synchronization point preventing capability escalation until all causally prior operations have been acknowledged by the required quorum") %}Definition 106{% end %}: HLC valid, Merkle root consistent, no pending audit flags). All six predicates must simultaneously satisfy \\(V_p(S) \geq \theta_p\\) for Phase 5 to be achieved.*

> **Anti-fragility gate predicate**: {% katex() %}P_{\text{AF}}(S): \mathbb{A}(S, \sigma_{\text{test}}) \geq \mathbb{A}_{\min}{% end %} where {% katex() %}\mathbb{A} = (P_1 - P_0)/\sigma{% end %} is the anti-fragility coefficient ({% term(url="@/blog/2026-02-12/index.md#def-79", def="Anti-Fragility: system property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}Definition 79{% end %} in [*Anti-Fragile Decision-Making at the Edge*](@/blog/2026-02-12/index.md#def-79)), \\(\\sigma_{\\text{test}}\\) is the stress level from the certification stress-injection protocol, and {% katex() %}\mathbb{A}_{\min} = 0.05{% end %} improvement per standard deviation of induced stress. **Measurement method**: inject controlled stress (connectivity throttling, packet loss, power reduction) at three levels {% katex() %}\sigma \in \{\sigma_{\text{low}}, \sigma_{\text{med}}, \sigma_{\text{high}}\}{% end %}; fit the {% katex() %}\mathbb{A}{% end %} coefficient from performance measured at each level. A system that degrades monotonically under stress has {% katex() %}\mathbb{A} < 0{% end %} and cannot pass this gate regardless of other metrics. **RAVEN target**: {% katex() %}\mathbb{A} \geq 0.08{% end %} at \\(\\sigma_{\\text{med}} = 0.3\\) (30% connectivity denial).

where {% katex() %}V_{\text{SOE}}(S){% end %} is the Safe Operating Envelope validity predicate: parameter vector {% katex() %}\theta \in [\theta_{\min}, \theta_{\max}]{% end %} and basin occupancy \\(\geq 0.95\\) over the most recent learning window — see [Safe Operating Envelope](@/blog/2026-02-12/index.md#def-soe).

{% katex() %}V_{\text{causal}}(S) = \mathbb{1}[\text{CausalBarrier active: all human commands gated by Merkle root validation}]{% end %} — see {% term(url="#def-106", def="Causal Barrier: synchronization point preventing capability escalation until all causally prior operations have been acknowledged by the required quorum") %}Definition 106{% end %}. {% katex() %}V_{\text{L0phys}}(S) = \mathbb{1}[\text{L0 Physical Interlock wired, tested, unreachable from software}]{% end %} — see {% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}.

**Red team gate integration**: A failed red team exercise ({% katex() %}V_{\text{adv}} = 0{% end %}) triggers re-evaluation of the preceding gate: if jamming breaks {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} coherence, the Phase 2 gate ({% katex() %}V_{\text{gossip}}{% end %}) is re-validated before re-attempting Phase 5.

### Validation Methodology

Different predicate types require different validation approaches:

{% mermaid() %}
graph TD
    A["Define Predicates<br/>(validation conditions)"] --> B{"Predicate<br/>Type?"}
    B -->|"Finite State"| C["Model Checking<br/>(exhaustive verification)"]
    B -->|"Probabilistic"| D["Statistical Testing<br/>(confidence intervals)"]
    B -->|"Recovery"| E["Chaos Engineering<br/>(inject failures)"]
    C --> F["Gate Decision<br/>(all predicates)"]
    D --> F
    E --> F
    F --> G{"Gate<br/>Passed?"}
    G -->|"Yes"| H["Proceed to Next Phase"]
    G -->|"No"| I["Address Failures<br/>(fix and retest)"]
    I --> A

    style B fill:#fff9c4,stroke:#f9a825
    style F fill:#ffcc80,stroke:#ef6c00
    style H fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style I fill:#ffcdd2,stroke:#c62828
{% end %}

**Model checking** validates finite-state predicates (authority tiers, state machines) through exhaustive state space exploration:

{% katex(block=true) %}
\text{ModelCheck}(\mathcal{M}, \phi) = \begin{cases}
\text{True} & \text{if } \mathcal{M} \models \phi \\
\text{Counterexample} & \text{otherwise}
\end{cases}
{% end %}

**Statistical testing** validates probabilistic predicates (detection accuracy) through confidence intervals:

{% katex(block=true) %}
\text{Test}(V_p, n, \alpha) = \mathbb{1}\left[\hat{V}_p \pm z_{\alpha/2}\sqrt{\frac{\hat{V}_p(1-\hat{V}_p)}{n}} \text{ contains } \theta_p\right]
{% end %}

**Chaos engineering** validates healing predicates through systematic fault injection with coverage tracking {{ cite(ref="11", title="Basiri et al. (2016) — Chaos Engineering") }}: {% katex() %}\text{Coverage} = |\mathcal{F}_{\text{tested}}| / |\mathcal{F}|{% end %}.

**Coverage targets:** Model checking should explore at least 80% of reachable states for small state spaces, or verify key invariants via bounded model checking for large ones. Statistical testing requires {% katex() %}n \geq 30/\theta_p{% end %} samples per gate predicate (where \\(\theta_p\\) is the minimum meaningful effect size). Chaos coverage should target at least 80% of known failure modes listed in the threat model.

### Gate Revision Triggers

The validation framework adapts to changing conditions. Formal triggers for re-evaluation:

- **Mission change**: {% katex() %}\Delta\mathcal{M}_{\text{mission}} \Rightarrow \text{ReDefine}(\{P_i\}){% end %}
- **Threat evolution**: {% katex() %}\Delta\mathcal{T}_{\text{adversary}} \Rightarrow \text{RePrioritize}(\{\theta_p\}){% end %}
- **Resource change**: {% katex() %}\Delta\mathcal{R}_{\text{hardware}} \Rightarrow \text{ReAllocate}(\{B_r\}){% end %}
- **Operational learning**: {% katex() %}\text{ObservedFailure}(f_{\text{new}}) \Rightarrow \text{Extend}(\mathcal{F}){% end %}

Each trigger initiates re-evaluation of affected gates. The regression invariant ensures re-validation propagates to all dependent phases.

### Field Autonomic Certification

Phase gates formalize *can the system pass a threshold?* Field Autonomic Certification (FAC)
formalizes *is this system safe to label "Autonomic" and deploy without a human in the loop?*
The distinction matters: a system can pass Phase 0 in a lab environment but fail in the field
because L0 was never tested without L1+ present, or because no one verified the software-level terminal safety state ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: the lowest-risk posture a node adopts when no safe healing action is available; irreversible during a partition") %}Definition 124{% end %}) is reachable — this is the MVS-floor software posture, distinct from the L0 physical interlock ({% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; always active, bypasses the MAPE-K stack") %}Definition 108{% end %}) which is hardware-enforced and always active regardless of software state.

<span id="def-104"></span>
**Definition 104** (Field Autonomic Certification). *A system achieves
{% term(url="#def-104", def="The minimum bar required to label a system Autonomic: passes all phase gates through the initial gate, plus dependency isolation check, terminal safety state verification, and a 24-hour isolation-and-chaos test") %}Field Autonomic Certification{% end %} if:*

{% katex(block=true) %}
\mathrm{FAC}(S) = G_0(S) \;\land\; V_{\mathrm{depiso}}(S) \;\land\; V_{\mathrm{term}}(S) \;\land\; V_{\mathrm{isolchaos}}(S,\, 24\mathrm{h})
{% end %}

*Where:*
- *{% katex() %}V_{\mathrm{depiso}}(S) = \mathbb{1}[\text{static symbol check: no L0 binary references L1+ symbols}]{% end %}*
- *{% katex() %}V_{\mathrm{term}}(S) = \mathbb{1}[\text{killing L1+ causes correct } \mathcal{S}_\mathrm{term} \text{ entry within watchdog window}]{% end %}*
- *{% katex() %}V_{\mathrm{isolchaos}}(S, 24\mathrm{h}) = \mathbb{1}[\text{system survives 24h: zero backhaul, random process kills, fault injection, 10 partition cycles}]{% end %}*

*Systems that pass only \\(G_0\\) may be labeled "Phase 0 Certified" but not "Autonomic."
The "Autonomic" label requires {% katex() %}\mathrm{FAC}{% end %}.*

<span id="prop-73"></span>
**Proposition 73** (Certification Completeness). *{% katex() %}\mathrm{FAC}(S) \Rightarrow G_3(S){% end %}:
a system with Field Autonomic Certification satisfies all phase gates through Phase 3.*

*Passing all three FAC predicates simultaneously under adversarial conditions implies the system has already demonstrated every gate from G0 through G3 — certification is not a separate check but a proof that all prior gates co-hold.*

*Proof sketch*: {% katex() %}\mathrm{FAC}(S) \Rightarrow G_3(S){% end %} by predicate entailment:
- \\(G_0(S)\\): Entailed directly by {% katex() %}V_{\text{attest}}{% end %} in Phase 0 gate.
- \\(G_1(S)\\): {% katex() %}V_{\text{term}}(S){% end %} (Terminal Safety State reachability) entails {% katex() %}V_{\text{detect}}{% end %} and {% katex() %}V_{\text{isolate}}{% end %} via [{% term(url="@/blog/2026-01-29/index.md#prop-38", def="Safety State Reachability: Terminal Safety State is reachable from any system state in at most K healing steps where K is the healing severity scale depth") %}Proposition 38{% end %} (Safety State Reachability)](@/blog/2026-01-29/index.md#prop-38). {% katex() %}V_{\text{depiso}}(S){% end %} entails {% katex() %}V_{\text{faildown}}{% end %} via [{% term(url="@/blog/2026-01-15/index.md#prop-8", def="Hardened Hierarchy Fail-Down: when an authority tier fails, control automatically delegates to the next lower tier without service interruption") %}Proposition 8{% end %} (Hardened Hierarchy Fail-Down)](@/blog/2026-01-15/index.md#prop-8).
- \\(G_2(S)\\): {% katex() %}V_{\text{isolchaos}}(S, 24\text{h}){% end %} provides empirical evidence that [{% term(url="@/blog/2026-01-29/index.md#prop-21", def="Healing Deadline: upper bound on time-to-resolution for healing actions of given severity, derived from MAPE-K tick rate and action queue depth") %}Proposition 21{% end %} (Healing Deadline)](@/blog/2026-01-29/index.md#prop-21) and [{% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} (Closed-Loop Stability)](@/blog/2026-01-29/index.md#prop-22) hold in the test environment — a system that heals correctly for 24 hours under random process kills must have had healing deadlines and loop stability parameters within those bounds. For formal \\(G_2\\) certification, additionally verify these propositions analytically with measured {% katex() %}T_{\text{heal}}{% end %}, \\(K\\), and \\(\\tau\\) values; {% katex() %}V_{\text{isolchaos}}{% end %} constitutes operational evidence, and static verification constitutes formal proof — both are required for full certification.
- \\(G_3(S)\\): {% katex() %}V_{\text{isolchaos}}{% end %} run in a multi-node configuration verifies CRDT convergence ({% term(url="@/blog/2026-02-05/index.md#prop-42", def="CRDT Convergence: all replicas converge to identical state in finite time after reconnection under any CRDT merge function, regardless of operation order") %}Proposition 42{% end %}) and coherence bounds ({% term(url="@/blog/2026-02-05/index.md#prop-56", def="OUTPOST Coherence Bound: 127-sensor mesh achieves fleet-wide health convergence within 3 gossip rounds when fewer than 42 nodes are Byzantine") %}Proposition 56{% end %}) under partition — these are necessary conditions for 24-hour autonomous multi-node operation. {% katex() %}V_{\text{reconcile}}{% end %} and {% katex() %}V_{\text{crdt}}{% end %} are thus covered.

The entailment chain is: FAC's three predicates collectively require demonstrating all G_0–G_3 gate conditions simultaneously under adversarial conditions, which is strictly stronger than passing each gate in isolation.

{% katex() %}\mathrm{FAC}{% end %} includes \\(G_0\\) directly. {% katex() %}V_{\mathrm{depiso}}{% end %} implies [{% term(url="@/blog/2026-01-15/index.md#prop-8", def="Hardened Hierarchy Fail-Down: when an authority tier fails, control automatically delegates to the next lower tier without service interruption") %}Proposition 8{% end %} (Hardened Hierarchy Fail-Down)](@/blog/2026-01-15/index.md#prop-8), satisfying the structural requirement for \\(G_1\\)–\\(G_3\\). The remaining question is whether 10 partition-rejoin cycles provide sufficient statistical evidence for {% katex() %}V_{\mathrm{merge}}{% end %} and {% katex() %}V_{\mathrm{reconcile}}{% end %}.

Let {% katex() %}p_{\text{conflict}}{% end %} denote the per-cycle probability that a genuine {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} merge conflict occurs and is incorrectly resolved. The minimum cycle count \\(N\\) to detect systematic reconciliation failures with confidence \\(1 - \alpha\\) satisfies {% katex() %}N \geq \log(\alpha)/\log(1 - p_{\text{conflict}}){% end %}. For {% katex() %}p_{\text{conflict}} = 0.01{% end %}: {% katex() %}N = \log(0.05)/\log(0.99) \approx 299{% end %} cycles. For {% katex() %}p_{\text{conflict}} = 0.26{% end %}: \\(N = 10\\) cycles.

The checklist value \\(C5 = 10\\) cycles is sufficient only if {% katex() %}p_{\text{conflict}} \geq 0.26{% end %} — i.e., the system fails 1-in-4 merges, a failure mode that would be immediately observable without formal testing. The correct interpretation: 10 cycles is a smoke test, not a certification bound.

{% katex() %}V_{\mathrm{merge}}{% end %} and {% katex() %}V_{\mathrm{reconcile}}{% end %} are certified by one of two methods: (a) static verification via Alloy model checking that confirms correct merge for all conflict types in the state schema (the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} TLA+ model handles this at \\(\leq 50\\) nodes); or (b) {% katex() %}N \geq \log(0.05)/\log(1 - p_{\text{estimated}}){% end %} hardware cycles where {% katex() %}p_{\text{estimated}}{% end %} is derived from the measured state update rate and concurrent edit probability during the 24-hour run.

Random process kills imply {% katex() %}V_{\mathrm{heal}}{% end %} (Phase 1); 30% garbage injection implies {% katex() %}V_{\mathrm{detect}}{% end %} (Phase 1). Phases 4–24 require additional adversarial testing ({% katex() %}V_{\mathrm{adv}}{% end %}) beyond {% katex() %}\mathrm{FAC}{% end %} scope. \\(\square\\)

> **Physical translation:** Certification completeness means that if a system truly meets all the behavioral requirements for a capability tier, the formal validation framework will confirm it. There are no false negatives — a safe system will not be blocked from certification by the process itself. For a SAFEAUTO vehicle operator, this guarantee means that a vehicle that has genuinely achieved autonomous-operation readiness can be certified without requiring manual override.

**Certification revocation**: certification is revoked when any of the following occur: (1) a firmware component in the certified configuration is updated or replaced — the system must re-certify the affected components; (2) a Byzantine node within the certified fleet is confirmed post-certification — the fleet re-runs the Byzantine tolerance check ({% term(url="@/blog/2026-01-22/index.md#prop-15", def="Byzantine Tolerance Bound: maximum fraction of Byzantine nodes a fleet can tolerate while maintaining correct consensus") %}Proposition 15{% end %}) with the compromised node excluded; (3) the non-stationarity detector ({% term(url="@/blog/2026-02-12/index.md#def-84", def="Adversarial Non-Stationarity Detector: statistical test identifying when the reward distribution has shifted beyond the natural variance of the EXP3-IX learning algorithm") %}Definition 34{% end %}) signals a regime change inconsistent with the certified operating envelope — the relevant phase gates are re-evaluated before certification is restored.

**The 24-Hour Isolation and Chaos Checklist**

The following checklist formalizes {% katex() %}V_{\mathrm{isolchaos}}{% end %}. A system cannot be labeled
"Autonomic" until every item is checked.

<style>
#tbl_fac + table th:first-of-type { width: 5%; }
#tbl_fac + table th:nth-of-type(2) { width: 35%; }
#tbl_fac + table th:nth-of-type(3) { width: 35%; }
#tbl_fac + table th:nth-of-type(4) { width: 25%; }
</style>
<div id="tbl_fac"></div>

**Hardware layer (pre-software — must pass before any autonomy testing):**

| # | Test | Pass Criterion | Linked Predicate |
| :--- | :--- | :--- | :--- |
| H1 | Secure boot chain end-to-end | All signatures verify; tamper bit unset | {% katex() %}V_{\mathrm{attest}}{% end %} |
| H2 | Hardware watchdog fires on software hang | L1+ killed; watchdog fires within {% katex() %}T_{\mathrm{wd}}{% end %} | {% katex() %}V_{\mathrm{term}}{% end %} |
| H3 | Terminal safety state entry correct | After H2, node enters {% katex() %}\mathcal{S}_\mathrm{term}(E){% end %} correctly | {% katex() %}V_{\mathrm{term}}{% end %} |
| H4 | Energy measurement calibrated | Measured vs. known load within 5% | {% katex() %}V_{\mathrm{budget}}{% end %} |

**L0 isolation layer ({% katex() %}V_{\mathrm{depiso}}{% end %}):**

| # | Test | Pass Criterion | Linked Predicate |
| :--- | :--- | :--- | :--- |
| I1 | L0 binary compiled independently | No shared libraries; linker map shows zero L1+ symbols | {% katex() %}V_{\mathrm{depiso}}{% end %} |
| I2 | L0 boots with no other software present | Stable operation for 1h with only L0 firmware flashed | {% katex() %}V_{\mathrm{depiso}}{% end %} |
| I3 | L0 survives 24h with L1+ absent | All L1+ processes killed or firmware removed; L0 stable | {% katex() %}V_{\mathrm{depiso}}{% end %} |
| I4 | Static symbol-dependency graph clean | Automated check: `nm`/`objdump` shows no upward references | {% katex() %}V_{\mathrm{depiso}}{% end %} |

**24-hour Isolation and Chaos test ({% katex() %}V_{\mathrm{isolchaos}}{% end %}):**

| # | Test | Pass Criterion | Linked Predicate |
| :--- | :--- | :--- | :--- |
| C1 | Zero backhaul for full 24h | Radio disabled or absent; no cloud/command contact | {% katex() %}V_{\mathrm{zero}}{% end %} |
| C2 | Random process kills every 30 min | MAPE-K, measurement, healing daemons killed randomly; all restart | {% katex() %}V_{\mathrm{heal}}{% end %} |
| C3 | 30% garbage sensor injection | Anomaly detection identifies injected faults; false-negative rate \\(< 0.05\\) | {% katex() %}V_{\mathrm{detect}}{% end %} |
| C4 | Full threat-model fault injection | Each fault in threat model injected once; all healed within {% katex() %}T_{\mathrm{heal}}{% end %} | {% katex() %}V_{\mathrm{heal}}{% end %} |
| C5 | Partition-rejoin cycles (minimum 10 as smoke test) | After each rejoin, state converges within {% katex() %}\tau_{\mathrm{reconcile}}{% end %}; for {% katex() %}V_{\mathrm{reconcile}}{% end %} certification, supplement with Alloy/TLA+ verification or {% katex() %}N \geq \log(0.05)/\log(1-p_{\text{est}}){% end %} cycles where {% katex() %}p_{\text{est}}{% end %} is the per-cycle conflict probability | {% katex() %}V_{\mathrm{merge}}, V_{\mathrm{reconcile}}{% end %} |
| C6 | Energy floor reached | Push \\(E\\) to {% katex() %}E_{\mathrm{HSS}}{% end %}; node enters HSS; recovers when \\(E\\) rises | {% katex() %}V_{\mathrm{term}}{% end %} |
| C7 | Performance at T+24h vs T+0 | {% katex() %}\mathbb{E}[\mathrm{Performance}(T{+}24)] \geq \mathbb{E}[\mathrm{Performance}(T{+}0)]{% end %} | {% katex() %}V_{\mathrm{antifragile}}{% end %} |

**Weibull partition extension (required when {% katex() %}k_\mathcal{N} < 1{% end %}):** For systems using the Weibull semi-Markov connectivity model ({% term(url="@/blog/2026-01-15/index.md#def-12", def="Connectivity Markov Chain: semi-Markov model with Weibull sojourn times for each connectivity regime (Connected/Degraded/Intermittent/None)") %}Definition 12{% end %}) with a fitted shape parameter below 1, three additional scenarios must pass. These exercise the circuit breaker ({% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %}) and the time-varying anomaly threshold ({% term(url="@/blog/2026-01-22/index.md#prop-9", def="Optimal Anomaly Threshold: minimizes total misclassification cost by balancing false-positive and false-negative penalties") %}Proposition 9{% end %}) at the tail of the partition duration distribution.

| # | Test | Pass Criterion | Linked Predicate |
| :--- | :--- | :--- | :--- |
| C8 | Micro-burst cycle \\(\geq 20\\) partitions ({% katex() %}\text{Weibull}(k{=}1.2,\,\lambda{=}2\,\text{s}){% end %}) | {% katex() %}T_{\mathrm{acc}}{% end %} resets after every recovery; circuit breaker never fires; \\(k_\mathcal{N}\\) bandit arm stable | {% katex() %}V_{\mathrm{isolchaos}}{% end %} |
| C9 | Long Dark: 72 h sustained partition ({% katex() %}\text{Weibull}(k{=}0.62,\,\lambda{=}10\,\text{hr}){% end %}) | Circuit breaker fires at {% katex() %}T_{\mathrm{acc}} \geq Q_{0.95} \approx 59\,\text{hr}{% end %}; {% katex() %}\mathcal{L}_0{% end %} maintained continuously; outbound queue bounded; {% katex() %}T_{\mathrm{acc}}{% end %} resets on reconnection | {% katex() %}V_{\mathrm{isolchaos}}{% end %} |
| C10 | Asymmetric link: uplink loss \\(\geq 95\\%\\), downlink intact | Regime classified \\(\mathcal{I}\\) within two gossip periods; \\(\theta^\*(t)\\) drifts; outbound queue memory-bounded | {% katex() %}V_{\mathrm{isolchaos}}{% end %} |

**Final gate — FAC issued only when all pass:**

{% katex(block=true) %}
\mathrm{FAC}(S) = \bigwedge_{i \in \{H1..H4,\, I1..I4,\, C1..C7\}} \mathrm{Passed}(i) \;\land\; \bigl(k_\mathcal{N} \geq 1 \;\lor\; \bigwedge_{i \in \{C8..C10\}} \mathrm{Passed}(i)\bigr)
{% end %}

- **Use**: Conjuncts all hardware, isolation, and chaos-test checklist items into a single binary certification; require {% katex() %}\mathrm{FAC} = 1{% end %} before labeling any system L3+ Autonomic for unattended field deployment to prevent premature labeling based on passing only the hardware trust gate.
- **Parameters**: H1–H4 hardware tests; I1–I4 isolation tests; C1–C7 chaos tests; C8–C10 additionally required when Weibull {% katex() %}k_N < 1{% end %}.
- **Field note**: C8–C10 heavy-tail chaos tests are routinely skipped for schedule reasons — skipping them invalidates FAC for any {% katex() %}k_N < 1{% end %} system.

**Certification failure**: A node that fails certification is downgraded to read-only observer status — it may gossip health state but may not initiate healing actions or participate in quorum decisions until it passes a re-certification round. Re-certification requires three consecutive mission phases without triggering any certification predicate violation.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} certification example**: Phase 0 gate passed in month 2 of development
({% katex() %}V_{\mathrm{attest}}, V_{\mathrm{surv}}, V_{\mathrm{budget}}, V_{\mathrm{safe}}, V_{\mathrm{zero}}{% end %} all green).
FAC required an additional 3 weeks: I3 revealed that Drone 23's L0 binary had an implicit
dependency on a shared allocator (caught by I4's symbol check). After fixing, the 24-hour chaos
run (C1–C7) passed with one failure on C6 — the HSS recovery path had an off-by-one on the
energy threshold register. Both defects were caught before field deployment. The {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} team's
failure would have been caught at I1: the ML inference service's allocator was statically linked
into the L0 boot image.

**SAFEAUTO scenario**: In autonomous vehicle fleets using this framework ([SAFEAUTO]), a vehicle that fails the hardware attestation predicate ({% katex() %}V_{\mathrm{attest}}{% end %}) during the FAC process is downgraded to observer status and excluded from L3+ authority decisions until it completes a physical inspection and re-certification round — the constraint sequence ensures no unattested node influences fleet routing or hazard escalation decisions.

> **Cognitive Map**: The formal validation framework section operationalizes the prerequisite graph into testable gates. {% term(url="#def-103", def="Phase Gate Function: predicate that must evaluate to true before a capability level transition is permitted; prevents premature escalation") %}Definition 103{% end %} (Phase Gate Function) converts each phase boundary into a conjunction of quantitative predicates. {% term(url="#prop-72", def="Phase Progression Invariant: the system can only advance to the next constraint level when the Phase Gate Function returns true; regression is permitted at any time") %}Proposition 72{% end %} (Phase Progression Invariant) makes the regression testing requirement a theorem — prior gates must stay satisfied as new phases are built. The four-phase gate structure (Phase 0: foundation, Phase 1: local autonomy, Phases 2–12: coordination, Phase 4: Field Autonomic Certification) gives a complete validation sequence. The RAVEN certification example shows how the formal gates catch real defects — an off-by-one on an energy threshold register that would have been invisible until a field failure.

> **Empirical status**: The C5 minimum of 10 partition-rejoin cycles is a smoke test sufficient only when the per-cycle conflict probability \\(p_{\text{conflict}} \geq 0.26\\); for rigorous \\(V_{\text{reconcile}}\\) certification, {% katex() %}N \geq \log(0.05)/\log(1-p_{\text{est}}){% end %} cycles are required — in practice, \\(p_{\text{conflict}}\\) should be estimated from the measured state-update rate during a 24-hour run, and teams consistently underestimate it until the first partition-induced data-loss incident.

---

## Synthesis: The Three Scenarios

> **Problem**: The formal framework is abstract. Does it actually apply the same way to a 47-drone surveillance swarm, a 12-vehicle ground convoy, and a 127-sensor perimeter mesh — systems with radically different mobilities, bandwidths, and threat models?
> **Solution**: The phase structure is identical across all three scenarios. What varies is timescale (survival: 24 hr for drones, 72 hr for vehicles, 30 days for sensors), topology (clusters vs. platoons vs. meshes), and CRDT merge semantics (coverage maps, route decisions, alert databases have different consistency needs). The phase *ordering* does not vary because survival before autonomy, autonomy before coherence, coherence before anti-fragility is a logical constraint, not a domain preference.
> **Trade-off**: The shared structure requires accepting that domain-specific optimization must wait for foundational phases to complete. RAVEN's formation algorithm and OUTPOST's detection sensitivity tuning are both Phase 4 work — they cannot be pulled forward into Phase 1 even if the individual subsystems appear ready, because coherence (Phase 3) is a prerequisite for meaningful fleet-wide optimization.

### Shared Phase Structure

The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} ({% term(url="#def-92", def="Constraint Sequence: ordered list of autonomic capabilities that must be activated in prerequisite order; violation of ordering creates unstable composed systems") %}Definition 92{% end %}) is domain-invariant at the structural level. {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}, {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, and {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} all follow the same six-phase prerequisite graph ({% term(url="#def-93", def="Prerequisite Graph: DAG encoding capability dependencies; an edge A to B means A must be validated before B can be safely activated") %}Definition 93{% end %}). Phase N cannot begin until Phase N-1 has passed its gate ({% term(url="#def-103", def="Phase Gate Function: predicate that must evaluate to true before a capability level transition is permitted; prevents premature escalation") %}Definition 103{% end %}). What varies across domains is survival timescale, coordination topology, and CRDT merge semantics — not the ordering.

{% mermaid() %}
graph TD
    P0["Phase 0: Hardware Trust"] --> P1["Phase 1: Node Autonomy"]
    P1 --> P2["Phase 2: Local Coordination"]
    P2 --> P3["Phase 3: Fleet Coherence"]
    P3 --> P4["Phase 4: Adaptive Optimization"]
    P4 --> P5["Phase 5: Full Integration"]
{% end %}

> **Read the diagram**: Six sequential phases from Hardware Trust to Full Integration, each feeding the next. No phase can be skipped — Phase 2 (local coordination) requires Phase 1 (node autonomy) to be fully validated, because coordinating nodes that cannot self-heal individually only coordinates their failures.

<style>
#tbl_constraint_sequence + table th:first-of-type  { width: 18%; }
#tbl_constraint_sequence + table th:nth-of-type(2) { width: 12%; }
#tbl_constraint_sequence + table th:nth-of-type(3) { width: 23%; }
#tbl_constraint_sequence + table th:nth-of-type(4) { width: 23%; }
#tbl_constraint_sequence + table th:nth-of-type(5) { width: 24%; }
</style>
<div id="tbl_constraint_sequence"></div>

| Phase | Formal Basis | RAVEN — 47 drones | CONVOY — 12 vehicles | OUTPOST — 127 sensors |
|-------|-------------|-------------------|----------------------|----------------------|
| 0: Hardware Trust | Def 35<br>Prop 36 | Secure boot<br>Flight survival 24 hr | Secure boot<br>Safe stop under any condition | Secure boot + tamper detection<br>30-day autonomous storage |
| 1: Node Autonomy | Def 8<br>Prop 8–22 | Flight envelope anomaly<br>Motor compensation | Mechanical/electrical fault<br>Subsystem rerouting | Calibration drift<br>Automatic recalibration |
| 2: Local Coordination | Def 5, Prop 4<br>Def 14 | Cluster gossip<br>9–102 drones, 30 s convergence | Platoon gossip<br>4–27 vehicles, 60 s convergence | Sensor-to-fusion mesh<br>Multi-hop, 5 min convergence |
| 3: Fleet Coherence | Def 11, Def 12<br>Prop 13 | CRDT: threat DB, coverage map<br>Decision log | CRDT: route decisions (LWW)<br>Threat DB (union) | CRDT: alert DB (union)<br>Detection log (append-only) |
| 4: Adaptive Optimization | Def 15<br>Def 16 | Formation spacing by terrain/threat<br>Judgment horizon: engagement authority | Speed and spacing by terrain/threat<br>Judgment horizon: mission abort | Adaptive detection sensitivity<br>Judgment horizon: response escalation |
| 5: Full Integration | Def 37, Def 20<br>Prop 22 | Full L4 capability (streaming video, ML analytics)<br>Graceful degradation L4-L3-L2-L1-L0<br>Red team exercises; anti-fragility certification | L4 command integration<br>Multi-convoy coordination<br>Degradation ladder: all authority tiers | L4 regional awareness<br>Multi-site correlation<br>Degradation ladder: all authority tiers |

The phase structure is identical across all three scenarios — that identity is the point. Survival timescale varies (24 hr for individual drones, 72 hr for ground vehicles, 30 days for sensor nodes) because deployment contexts differ. Coordination topology varies (clusters vs. platoons vs. meshes) because physical mobility and node density differ. CRDT merge semantics vary because conflict resolution requirements differ — coverage maps, route decisions, and alert databases have distinct consistency needs. The phase ordering does not vary, because the objective hierarchy — survival before autonomy, autonomy before coherence, coherence before anti-fragility — is a logical constraint, not a domain preference.

> **Cognitive Map**: The synthesis section tests whether the framework generalizes. The phase-by-scenario table confirms that RAVEN, CONVOY, and OUTPOST use the same six-phase structure despite differing in size, mobility, and threat profile. What varies (survival window, coordination topology, CRDT semantics) is domain configuration, not architectural sequence. The table's uniformity is the key finding: if three radically different deployment types follow the same phase ordering, the ordering is domain-independent — it is a property of the objective hierarchy, not a property of any particular system.

---

## Human-Machine Teaming

> **Problem**: Treating human operators as external authorities at the top of the decision hierarchy is necessary but insufficient. Humans are not interchangeable with fast CPUs: situational awareness takes 90–180 seconds to reconstruct after disengagement. Trust in automation is asymmetric — eroded by a single failure, rebuilt over weeks. Commands can be causally stale.
> **Solution**: Five formal constructs address the handover boundary: predictive handover triggering ({% term(url="#prop-74", def="Predictive Handover Criterion: edge node should initiate autonomous-mode handover when the partition accumulator exceeds the 95th-percentile partition duration") %}Proposition 74{% end %}) starts handover before the safety floor is reached; asymmetric trust dynamics ({% term(url="#def-105", def="Asymmetric Trust Dynamics: trust gain and loss rates differ; nodes lose trust rapidly on violation but regain it slowly after correct behavior") %}Definition 105{% end %}) model slow trust rebuild vs. fast erosion; causal barriers ({% term(url="#def-106", def="Causal Barrier: synchronization point preventing capability escalation until all causally prior operations have been acknowledged by the required quorum") %}Definition 106{% end %}) reject commands based on stale mental models; semantic health compression ({% term(url="#def-107", def="Intent Health Indicator: mapping from system state to intent-satisfaction level, measuring how well the current autonomic plan serves the mission") %}Definition 107{% end %}) prevents alert fatigue; and the L0 Physical Safety Interlock ({% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}) bypasses the entire MAPE-K stack via hardware when needed.
> **Trade-off**: The predictive handover criterion requires knowing {% katex() %}\tau_{SA}{% end %} — the operator's situational awareness reconstruction time. This must be measured with real operators under realistic cognitive load, not empty-desk lab conditions. Teams consistently underestimate {% katex() %}\tau_{SA}{% end %} until the first field incident where a handed-over operator makes a contextually wrong decision within the SA reconstruction window.

The preceding framework treats human operators as external authorities at the top of the decision hierarchy. This is necessary but insufficient. The five formal constructs in this section address a harder problem: *how should the system manage the handover boundary when humans are not interchangeable with fast CPUs?*

Cognitive science establishes that human situational awareness (SA) takes time to reconstruct after disengagement. The system must predict operator readiness, not just detect system failure. Trust in automation is asymmetric — easy to lose, slow to rebuild. Human commands can be causally stale when issued against an out-of-date mental model. And beyond all {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} logic sits a hard physical limit that no software can override.

### Cognitive Inertia and Predictive Triggering

> **Handover boundary — three senses**: (1) *Connectivity handover*: the connectivity threshold \\(C_{\text{hand}}\\) below which cloud-delegated authority transfers to full local autonomy — this is the primary sense used in this article; (2) *Operator handover*: the temporal moment when a human operator re-engages after AES exit — see {% term(url="#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %} (Field Autonomic Certification) for the re-certification requirement; (3) *Certification boundary*: the spatial or operational envelope within which autonomic operation is certified. Unless qualified, "handover boundary" in this article refers to sense (1).

The handover boundary is the point at which an edge node transitions operational authority from its local autonomic loop to a cloud or higher-tier coordinator. Before that boundary, all decisions are made locally; after it, the node defers to the higher authority. The Phase Gate Function ({% term(url="#def-103", def="Phase Gate Function: predicate that must evaluate to true before a capability level transition is permitted; prevents premature escalation") %}Definition 103{% end %}) formalizes when that boundary is crossed.

The following maps capability levels (L0–L4) to command authority status, establishing which phase gate is required before {% katex() %}Q_{\text{command}}{% end %} becomes available:

| Capability Level | {% katex() %}Q_{\text{command}}{% end %} status | {% katex() %}Q_{\text{delegated}}{% end %} status | Activation condition |
|:---|:---|:---|:---|
| L0 | Disabled — physical interlock only | Active | Never — hardware override in effect (Def 54, Prop 87) |
| L1 | Disabled — no autonomy loop | Active | Requires FAC Phase 0 gate (\\(G_0\\)) |
| L2 | Restricted — monitoring read-only | Active | Requires FAC Phase 1 gate (\\(G_1\\)) |
| L3 | Available with Causal Barrier check | Active | Requires FAC Phase 3 gate (\\(G_3\\)) + Definition 106 Merkle validation |
| L4 | Full handover after briefing protocol | Standby | Requires FAC + State-Delta Briefing acknowledgment (Definition 109) |

This mapping resolves the cross-reference between the L0–L4 capability hierarchy ({% term(url="@/blog/2026-01-15/index.md#def-0", def="Framework Scope: every claim in this series is produced by formal reasoning, constraint modeling, or engineering pattern synthesis — not empirical measurement") %}Definition 0{% end %}) and the {% katex() %}Q_{\text{command}}{% end %} / {% katex() %}Q_{\text{delegated}}{% end %} constructs introduced in this section.

<span id="def-autonomy-confidence"></span><span id="def-psi"></span>

**Definition — Autonomy Confidence Score \\(\Psi(t)\\).** *Let* {% katex() %}\Psi(t) \in [0,1]{% end %} *denote the composite autonomy confidence at time* \\(t\\)*:*

{% katex(block=true) %}
\Psi(t) = \min\!\left(1,\; \frac{R(t)}{R_{\min}} \cdot \frac{C(t)}{C_{\text{conn}}} \cdot \frac{\rho_q(t)}{\rho_{\min}}\right)
{% end %}

*where \\(R(t)\\) is the resource state ({% term(url="@/blog/2026-01-15/index.md#def-1", def="Resource State: normalized composite of battery charge, free memory, and idle CPU between zero and one; falling below 0.2 triggers survival mode regardless of connectivity state") %}Definition 1{% end %}), \\(C(t)\\) is the normalized link capacity ({% term(url="@/blog/2026-01-15/index.md#def-6", def="Connectivity Regime: cloud regime requires high average connectivity and near-zero disconnection probability; contested edge regime has low average connectivity and frequent disconnections") %}Definition 6{% end %}), and \\(\\rho_q(t)\\) is the CBF stability margin ({% term(url="@/blog/2026-01-29/index.md#def-39", def="Discrete Control Barrier Function: safety function enforcing mode-invariant stability across capability level transitions in the switched system") %}Definition 39{% end %}).*

**Physical interpretation**: \\(\\Psi = 1\\) means all three operational margins are fully satisfied. \\(\\Psi < 0.5\\) signals at least one margin is critically degraded — either the node is resource-starved, the link is marginal, or the control system is approaching its stability boundary. **RAVEN calibration**: \\(R_{\\min} = 0.2\\), \\(C_{\\text{conn}} = 0.3\\), \\(\\rho_{\\min} = 0.2\\). A fully operational node in Connected regime scores \\(\\Psi \\approx 0.95\\); a node at 25% battery in Intermittent regime scores \\(\\Psi \\approx 0.42\\), triggering handover preparation.

\\(\\rho_q(t)\\) is the discrete-time CBF safety margin sampled at each MAPE-K tick. It is the discretized equivalent of {% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}'s continuous Lyapunov margin ([Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#prop-22)). Reducing \\(\\rho_\\text{min}\\) below 0.2 is not recommended without re-analysis against {% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}'s stability conditions — the discrete sampling interval \\(T_\\text{tick}\\) means the true continuous margin may be lower than the sampled value.

**Calibration for other platforms.** The values \\(R_\\text{min} = 0.2\\), \\(C_\\text{conn} = 0.3\\), \\(\\rho_\\text{min} = 0.2\\) are RAVEN-specific. For other deployments:

1. Set \\(\\rho_\\text{min}\\) from {% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}'s stability condition for your capability level.
2. Set \\(R_\\text{min}\\) as the resource level below which healing actions cannot execute ({% term(url="@/blog/2026-01-29/index.md#def-44", def="Healing Action Severity: ordinal scale classifying healing actions by resource cost and mission disruption, used to select minimum-impact interventions first") %}Definition 44{% end %} load-shedding threshold).
3. Set \\(C_\\text{conn}\\) as the minimum link capacity needed for one gossip packet per MAPE-K tick.

Example guidance — CONVOY (12 vehicles): \\(\\rho_\\text{min} = 0.15\\) (larger vehicles, slower failure modes), \\(R_\\text{min} = 0.25\\) (fuel-constrained), \\(C_\\text{conn} = 0.4\\) Mbit/s (mesh radio).

**Worked example (RAVEN, t = 1000 s).** Battery at 25%: \\(R(t) = 0.25\\), \\(R_\\text{min} = 0.2\\), factor = 1.25. Link capacity at 40 Mbit/s with threshold 30 Mbit/s: {% katex() %}C(t)/C_\text{conn} = 40/30 = 1.33{% end %}. CBF margin \\(\\rho_q = 0.28\\), \\(\\rho_\\text{min} = 0.2\\), factor = 1.4. Product: {% katex() %}1.25 \times 1.33 \times 1.4 = 2.33{% end %}; clamped to \\(\\Psi = 1.0\\) — all three subsystems above their minimums; system is healthy.

**Stress case (t = 5800 s).** Battery at 18%: factor = 0.90. Link at 15 Mbit/s: factor = 0.50. CBF margin \\(\\rho_q = 0.12\\): factor = 0.60. Product: {% katex() %}0.90 \times 0.50 \times 0.60 = 0.27 < \Psi_\text{fail} = 0.3{% end %}; handover criterion triggers.

**Hysteresis requirement.** The \\(\\Psi_\\text{fail} = 0.30\\) trigger should be implemented with a hysteresis band to prevent oscillation near the boundary. Define two thresholds:
- \\(\\Psi_\\text{trigger} = 0.30\\): begin handover preparation when \\(\\Psi\\) drops below this value
- \\(\\Psi_\\text{resume} = 0.35\\): re-enable full autonomy only when \\(\\Psi\\) recovers above this value

Without this band, a RAVEN system hovering at \\(\\Psi \\approx 0.29\\)–\\(0.31\\) (borderline battery + link) oscillates rapidly between handover-ready and autonomous — making neither the human nor the autonomic loop fully in control. The 0.05 gap corresponds to a ~10% improvement in any single \\(\\Psi\\) component above its floor, a meaningful operational threshold.

<span id="prop-74"></span>
*Bandit policy dependency: the autonomy confidence score \\(\Psi(t)\\) used in this proposition is derived from the EXP3-IX arm-weight distribution established in [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md) ({% term(url="@/blog/2026-02-12/index.md#def-82", def="Capability-Hierarchy Warm-Start Prior: bandit initial weights from offline simulation, reducing rounds needed to reach convergence") %}Definition 82{% end %} and {% term(url="@/blog/2026-02-12/index.md#def-83", def="Connectivity-Pruned Contextual Arm Set: active arm set restricted to those physically feasible given the current connectivity bucket") %}Definition 83{% end %}). Under normal operation, {% katex() %}\Psi(t) = \sum_i w_i(t) \cdot \hat{q}_i(t){% end %} where \\(w_i\\) are the bandit arm weights and \\(\hat{q}_i\\) are the per-arm quality estimates. When the bandit is in a Strategic Amnesia window, the fallback estimate specified below applies.*

**Proposition 74** (Predictive Handover Criterion). *Let \\(\Psi(t) \in [0,1]\\) denote the system's autonomy confidence — the probability that the current decision context is within the system's validated operating envelope — and {% katex() %}\tau_{SA}{% end %} the situational awareness recovery time: the minimum time for an operator to reconstruct sufficient mission SA after disengagement. The handover trigger {% katex() %}\Psi_{\text{trigger}}{% end %} must satisfy:*

{% katex(block=true) %}
\Psi_{\text{trigger}} = \Psi_{\text{fail}} + \int_{t}^{t + \tau_{SA}} \frac{d\Psi}{dt}\, dt
{% end %}

- **Use**: Computes the confidence threshold at which handover must begin, accounting for the operator SA reconstruction window {% katex() %}\tau_{SA}{% end %}; embed as the {% katex() %}V_{SA}{% end %} predicate in the Phase 4 gate to prevent late handover that delivers a situationally unaware operator into a deteriorating system.
- **Parameters**: {% katex() %}\tau_{SA} = 90\text{--}180\text{ s}{% end %} for dense multi-threat environments; {% katex() %}\Psi_{\text{fail}}{% end %} = mission-specific safety confidence floor.
- **Field note**: {% katex() %}\tau_{SA}{% end %} is consistently longer than teams expect — validate with real operators under realistic cognitive load, not empty-desk lab conditions.

> **Physical translation:** The handover signal fires when the system's autonomy confidence has been declining fast enough, for long enough, that it will fall below the safety floor before human operators can respond. The \\(\tau_{SA}\\) window is the human reaction time baked into the math — the system hands off early so that when humans take control, the system is still above the minimum safe autonomy level, not already below it.

*where {% katex() %}\Psi_{\text{fail}}{% end %} is the minimum confidence at which automation fails safely. Handover must be initiated when {% katex() %}\Psi(t) \leq \Psi_{\text{trigger}}{% end %}, not when {% katex() %}\Psi(t) \leq \Psi_{\text{fail}}{% end %}.*

**Deriving \\(\Psi_\text{fail}\\).** \\(\Psi_\text{fail}\\) is the confidence threshold below which the system can no longer guarantee safe-state reachability ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}, [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-53)). Derivation procedure:

1. Identify the minimum Lyapunov stability margin \\(\rho_\text{min}\\) required by {% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}.
2. Identify the minimum resource state \\(R_\text{min}\\) below which healing actions cannot be executed.
3. Set \\(\Psi_\text{fail}\\) as the \\(\Psi(t)\\) value that results when all three factors (R, C, \\(\rho_q\\)) are simultaneously at their respective minimums.

In practice, \\(\Psi_\text{fail}\\) is calibrated from mission reversibility constraints — set it at the \\(\Psi\\) value below which a bad autonomous decision cannot be corrected before mission end. For RAVEN: \\(\Psi_\text{fail} = 0.3\\) (calibrated from abort-window analysis).

**Reproducible calibration procedure.**

1. Collect operational logs from 20+ missions with known outcomes (abort events and successful completions).
2. Retroactively compute \\(\Psi(t)\\) for each log using measured \\(R(t)\\), \\(C(t)\\), \\(\rho_q(t)\\).
3. Identify \\(\Psi_\text{abort}\\): the minimum \\(\Psi\\) observed during missions that ended in autonomy-confidence abort.
4. Set {% katex() %}\Psi_\text{fail} = 0.9 \times \Psi_\text{abort}{% end %} (10% safety margin).
5. Validate by simulating 100+ diverse threat scenarios; confirm {% katex() %}\Psi > \Psi_\text{fail}{% end %} correlates with mission success > 95% of the time.

For RAVEN, this procedure yielded {% katex() %}\Psi_\text{abort} \approx 0.33{% end %}, giving \\(\Psi_\text{fail} = 0.30\\).

The key insight is that {% katex() %}\tau_{SA}{% end %} is measured in minutes, not milliseconds. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} missions with dense multi-threat environments, empirical SA reconstruction times are 90–180 seconds — comparable to the [{% term(url="@/blog/2026-02-12/index.md#def-91", def="Time window J over which the system evaluates stress outcomes before adapting; shorter J enables faster adaptation but higher variance in parameter estimates") %}judgment horizon{% end %}](@/blog/2026-02-12/index.md#def-91) window. During this interval \\(\Psi(t)\\) continues to decay. A handover initiated at {% katex() %}\Psi_{\text{fail}}{% end %} delivers an operator who is not yet situationally aware, into a system that has already passed the point of safe autonomous recovery.

**Consequence**: The {% katex() %}V_{\text{SA}}{% end %} predicate in Phase 4 gate requires demonstrating that handover triggers are set conservatively enough to provide full SA recovery time before the predicted failure boundary.

**False-positive cost**: A false-positive handover preparation consumes the state-delta briefing bandwidth ({% term(url="#def-109", def="State-Delta Briefing Protocol: structured handover message containing only the state delta since last sync, minimizing reconnection bandwidth cost") %}Definition 109{% end %}) unnecessarily. The cost is bounded by one State-Delta Briefing Protocol transmission — typically \\(\leq 1\\) KB for a 100-variable state vector. Design the prediction confidence threshold \\(p^\*\\) to keep false-positive rate below 5% using historical connectivity traces.

> **Implementation note — estimating \\(d\Psi/dt\\)**: In practice, \\(d\Psi/dt\\) is not analytically available; it is estimated via linear regression over the most recent \\(\tau_{SA}\\) window of historical \\(\Psi\\) samples. For systems where \\(\Psi\\) is non-monotonic (brief confidence spikes during successful autonomous actions), use the minimum observed rate over the window — a conservative over-estimate of how fast confidence is falling. The simplified constant-decay approximation: {% katex() %}\Psi_{\text{trigger}} \approx \Psi_{\text{fail}} + \left(\frac{d\Psi}{dt}\right)_{\text{est}} \cdot \tau_{SA}{% end %}. Systems where \\(\Psi\\) can rise (e.g., after a successful autonomous manoeuvre mid-SA-window) should clip the integral at zero net change rather than allow a negative term to lower the trigger threshold below \\(\Psi_{\text{fail}}\\).

> **Empirical status**: The {% katex() %}\tau_{SA} = 90\text{--}180\text{ s}{% end %} range and the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} \\(\Psi_{\text{fail}} = 0.30\\) value are calibrated from 20+ {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} mission logs and simulated operator trials; \\(\tau_{SA}\\) is highly context-dependent — teams under low cognitive load can achieve SA reconstruction in under 60 seconds, while high-threat-density environments routinely require over 3 minutes — and it must be measured with real operators under realistic workload, not empty-desk lab conditions, before setting \\(\Psi_{\text{trigger}}\\).

*Fallback under bandit reset: if the EXP3-IX policy is in a Strategic Amnesia window (arm weights are within \\(\\varepsilon\\) of uniform), \\(d\\Psi/dt\\) from the bandit distribution is undefined or artificially flat. In this case, substitute a model-free \\(\\Psi\\) estimate computed directly from the Resource State \\(R(t)\\) ({% term(url="#def-130", def="Resource State: normalized composite of battery, memory, and CPU availability, forming the resource axis of the three-dimensional state cube") %}Definition 130{% end %}) and the {% term(url="@/blog/2026-01-29/index.md#def-55", def="Synthetic Health Metric: composite scalar aggregating subsystem health scores for fleet-level coherence voting") %}Synthetic Health Metric (Definition 55){% end %}: {% katex() %}\hat{\Psi}_\text{fallback}(t) = w_R \cdot R(t) + w_H \cdot H_\text{synth}(t){% end %} with default weights \\(w_R = w_H = 0.5\\). The handover trigger uses {% katex() %}\hat{\Psi}_\text{fallback}{% end %} in place of the bandit-derived \\(\\Psi\\) for the duration of the amnesia window.*

### Trust Hysteresis

<span id="def-105"></span>
**Definition 105** (Asymmetric Trust Dynamics). *Let {% katex() %}\mathcal{T}_t \in [0,1]{% end %} denote the operator's trust in system autonomy at timestep \\(t\\). Trust evolves asymmetrically:*

{% katex(block=true) %}
\mathcal{T}_{t+1} = \begin{cases}
\mathcal{T}_t + \eta_{\text{gain}} \cdot (1 - \mathcal{T}_t) & \text{if } \text{outcome}(t) = \text{Success} \\
\mathcal{T}_t \cdot (1 - \eta_{\text{loss}}) & \text{if } \text{outcome}(t) = \text{Failure}
\end{cases}
{% end %}

- **Use**: Models operator trust with additive success recovery ({% katex() %}\eta_{\text{gain}} \approx 0.05{% end %}) and multiplicative failure decay ({% katex() %}\eta_{\text{loss}} \approx 0.40{% end %}); update after each observable automation outcome to prevent symmetric-recovery settings that allow a serious failure to be erased by one subsequent success.
- **Parameters**: {% katex() %}\eta_{\text{gain}} \approx 0.05{% end %}; {% katex() %}\eta_{\text{loss}} \approx 0.40{% end %}; failure at {% katex() %}\mathcal{T}=0.80{% end %} requires ~10 successes to recover — asymmetry by design.
- **Field note**: The asymmetry ratio {% katex() %}\eta_\text{loss}/\eta_\text{gain} = 8{% end %} is designed for cautious recovery; this ratio is consistent with the literature on human trust repair (e.g., the asymmetric trust dynamics documented in human-robot teaming studies, where trust repair after failure takes \\(3\text{--}10\\times\\) longer than trust establishment {{ cite(ref="12", title="Lamport, Shostak & Pease (1982) — The Byzantine Generals Problem") }}). Empirical validation of the specific 8:1 ratio against operator behaviour in your deployment environment is recommended before finalising these parameters.

*The 8:1 loss-to-gain ratio reflects that a single Byzantine event can corrupt a fleet decision faster than eight successful cooperation rounds can rebuild the trust needed to reverse it — trust is hard to earn and easy to lose by deliberate design.*

*with {% katex() %}\eta_{\text{loss}} \gg \eta_{\text{gain}}{% end %}. The success branch saturates as trust approaches 1; the failure branch decays multiplicatively toward {% katex() %}\mathcal{T}_{\min} > 0{% end %}.*

A single automation failure can erase trust accumulated over many successes. For {% katex() %}\eta_{\text{gain}} = 0.05{% end %} and {% katex() %}\eta_{\text{loss}} = 0.40{% end %}, a failure at {% katex() %}\mathcal{T} = 0.80{% end %} reduces trust to {% katex() %}\mathcal{T} = 0.48{% end %}, requiring approximately \\(k\\) successes to recover:

{% katex(block=true) %}
k \geq \frac{\ln(0.80 / 0.48)}{\ln\!\left(1/(1 - 0.05)\right)} \approx 10
{% end %}

**System implication**: Automation confidence thresholds must be calibrated to the current trust state {% katex() %}\mathcal{T}_t{% end %}. When {% katex() %}\mathcal{T}_t < \mathcal{T}_{\text{threshold}}{% end %}, the [{% term(url="@/blog/2026-02-12/index.md#def-91", def="Time window J over which the system evaluates stress outcomes before adapting; shorter J enables faster adaptation but higher variance in parameter estimates") %}judgment horizon{% end %}](@/blog/2026-02-12/index.md#def-91) contracts — more decisions require human authorization even if system-measured confidence \\(\Psi(t)\\) is high. Trust dynamics are a function of the entire operational history, not a moving average.

> **Physical translation**: Trust grows slowly on success and collapses quickly on failure. Each successful autonomous decision adds a small fraction of the remaining gap to full trust ({% katex() %}\eta_{\text{gain}} \cdot (1 - \mathcal{T}_t){% end %}). Each failure removes a large fraction of current trust ({% katex() %}\eta_{\text{loss}} \cdot \mathcal{T}_t{% end %}). A failure when trust is at 0.80 drops trust to \\(\approx 0.48\\) — recovering from that loss requires roughly 10 subsequent successes. This 8:1 asymmetry is intentional: operators who suffered a serious automation failure need substantial evidence of reliable performance before re-extending authority. The Judgment Horizon ({% term(url="@/blog/2026-02-12/index.md#def-91", def="Judgment Horizon: time window over which an edge node can make autonomous decisions without external validation before confidence degrades below a threshold") %}Definition 91{% end %}) contracts when {% katex() %}\mathcal{T}_t < T_{\text{threshold}}{% end %}, requiring more decisions to escalate — the automation's effective authority shrinks in proportion to the trust deficit.

*Escalation ratchet: if a handover event occurs more than \\(N_\text{handover,max} = 3\\) times within any 72-hour window, the autonomic system's re-engagement is permanently suspended pending human operator authorization. The ratchet prevents rapid handover cycling — an autonomic system that repeatedly requests and receives authority, only to trigger further handovers, is exhibiting a structural instability that additional autonomy will not resolve. Permanent suspension resets only on explicit operator override with a written justification logged in the {% term(url="@/blog/2026-02-05/index.md#def-57", def="Post-Partition Audit Record: immutable log entry written at reconnection capturing divergence metrics, conflict counts, and resolution outcomes") %}Post-Partition Audit Record{% end %}. The threshold \\(N_\text{handover,max} = 3\\) is a default; calibrate per deployment based on expected handover frequency in normal operations.*

### Causal Barrier

<span id="def-106"></span>
**Definition 106** (Causal Barrier). *Let {% katex() %}\mathcal{H}_{\text{op}}(t){% end %} denote the operator's state snapshot at time \\(t\\), characterized by its Merkle root {% katex() %}M_{\text{op}}{% end %} ([state reconciliation](@/blog/2026-02-05/index.md#def-58)). Let {% katex() %}M_{\text{edge}}(t){% end %} denote the current Merkle root of the edge fleet state {{ cite(ref="13", title="Kulkarni et al. (2014) — Logical Physical Clocks and Consistent Snapshots") }}. A human command \\(c\\) issued at time \\(t\\) is **causally valid** if and only if:*

{% katex(block=true) %}
\text{Valid}(c,\, t) = \mathbb{1}\!\left[M_{\text{op}} = M_{\text{edge}}(t - \Delta_{\text{prop}})\right]
{% end %}

*where {% katex() %}\Delta_{\text{prop}}{% end %} is the propagation delay for state updates to reach the operator. Commands where {% katex() %}M_{\text{op}} \neq M_{\text{edge}}(t - \Delta_{\text{prop}}){% end %} are **causally stale** and must be rejected with a state divergence notification.*

The Causal Barrier addresses a failure mode orthogonal to trust: the operator may be fully trusted, fully engaged, and still issue a harmful command because their mental model of fleet state is out of date. This is particularly acute in contested environments where {% katex() %}\Delta_{\text{prop}}{% end %} can exceed 30 seconds and state can diverge significantly during that window.

> **Connection to HLC.** The Merkle root \\(M_\\text{op}\\) represents the cryptographic digest of the operation log consistent with the HLC timestamp ({% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock (HLC): clock combining physical and logical timestamps, advancing on message receipt to maintain causal ordering without NTP") %}Definition 61{% end %}, [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md#def-61)). Commands whose Merkle roots reflect stale fleet state are rejected because their causal assumptions — what the fleet's state was at the moment of issuance — no longer hold. This extends the vector clock causality guarantee ({% term(url="@/blog/2026-02-05/index.md#def-60", def="Vector Clock: per-node logical counter vector that tracks causal ordering of events without requiring synchronized physical clocks") %}Definition 60{% end %}) to the command-authority domain. The Merkle root \\(M_\\text{edge}\\) includes a timestamp sourced from the HLC ({% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock (HLC): clock combining physical and logical timestamps, advancing on message receipt to maintain causal ordering without NTP") %}Definition 61{% end %}, [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md#def-61)). When comparing \\(M_\\text{op}\\) to {% katex() %}M_\text{edge}(t - \Delta_\text{prop}){% end %}, also verify that the HLC timestamp embedded in \\(M_\\text{op}\\) falls within \\(T_\\text{trust}\\) of the current HLC value ({% term(url="@/blog/2026-02-05/index.md#def-59", def="Clock Trust Window: maximum elapsed partition time before the HLC falls back to pure logical ordering to prevent causal inversions") %}Definition 59{% end %}); reject commands whose Merkle root timestamp lies outside the trust window, as clock drift may have invalidated the causal assumption.

*HLC unavailability safe mode: if the Hybrid Logical Clock timestamp \\(t\\) cannot be locally verified ({% katex() %}\text{HLC\_valid} = \text{false}{% end %}, due to counter wraparound, clock desync, or node restart), the Causal Barrier defaults to fail-closed: all non-safety-critical write operations are deferred until HLC is restored. Safety-interlock writes (L0 Physical Safety Interlock level) are permitted unconditionally and logged with a synthetic monotonic counter pending HLC recovery. The fail-closed posture is annotated in the {% term(url="@/blog/2026-02-05/index.md#def-57", def="Post-Partition Audit Record: immutable log entry written at reconnection capturing divergence metrics, conflict counts, and resolution outcomes") %}Post-Partition Audit Record{% end %} upon restoration.*

**Connection to Fleet Coherence**: The Causal Barrier extends the Merkle reconciliation protocol from fleet-to-fleet state synchronization to human-to-fleet command validation {{ cite(ref="13", title="Kulkarni et al. (2014) — Logical Physical Clocks and Consistent Snapshots") }}. The same {% katex() %}\Delta_{\text{state}}{% end %} that drives {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} merge frequency also determines the maximum safe command lag.

> **Physical translation**: The Causal Barrier rejects commands issued against stale fleet state. The Merkle root {% katex() %}M_{\text{op}}{% end %} is a cryptographic fingerprint of the operator's last known fleet snapshot. The Merkle root {% katex() %}M_{\text{edge}}(t - \Delta_{\text{prop}}){% end %} is the fleet's actual state at the moment that snapshot was formed. If they differ, the operator was commanding against a fleet that no longer existed when the command arrived. A rejected command returns the Difference Map ({% term(url="#def-110", def="Difference Map: compact representation of diverged state entries used by the State-Delta Briefing Protocol to transmit only changed items at reconnection") %}Definition 110{% end %}) showing exactly what changed — it is a "your picture is stale, here is the update" signal, not a refusal of the operator's authority.

### Semantic Compression

<span id="def-107"></span>
**Definition 107** (Intent Health Indicator). *Let \\(\Sigma\\) be the space of raw telemetry vectors and {% katex() %}\Lambda = \{\text{Aligned},\, \text{Drifted},\, \text{Diverged}\}{% end %} the 3-state Intent Health space. The semantic compression function {% katex() %}f: \Sigma \to \Lambda{% end %} is:*

{% katex(block=true) %}
f(\sigma) = \begin{cases}
\text{Aligned}  & \text{if } \gamma(\sigma) \geq \gamma_{\text{high}} \text{ and no active healing} \\
\text{Drifted}  & \text{if } \gamma(\sigma) < \gamma_{\text{high}} \text{ or healing active} \\
\text{Diverged} & \text{if } \gamma(\sigma) < 1 - \varepsilon
\end{cases}
{% end %}

*where \\(\gamma(\sigma)\\) is the semantic convergence factor ({% term(url="@/blog/2026-01-15/index.md#def-5b", def="Semantic Convergence Factor: fraction of merged state items with no policy violations; when this fraction is too low, violations accumulate faster than they can be resolved") %}Definition 5b{% end %}) evaluated over telemetry \\(\sigma\\), {% katex() %}\gamma_{\text{high}}{% end %} is the high-confidence threshold, and \\(\varepsilon\\) is the convergence tolerance.*

*(\\(\\gamma(\\sigma)\\) here is the semantic convergence factor from [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-5b), distinct from the four \\(\\gamma\\) roles in [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md): discount factor ({% term(url="@/blog/2026-02-12/index.md#def-80", def="Adversarial Markov Game: Stackelberg game model where attacker selects jamming strategy after observing the defender's architecture choice") %}Definition 80{% end %}), EXP3 mixing weight, EXP3-IX exploration floor ({% term(url="@/blog/2026-02-12/index.md#def-81", def="EXP3-IX Algorithm: adversarial bandit with implicit exploration achieving minimax regret against any adaptive adversary") %}Definition 81{% end %}), and exploration inflation factor {% katex() %}\gamma_{\text{infl}}{% end %} ({% term(url="@/blog/2026-02-12/index.md#def-90", def="Safe-Greedy Algorithm: bandit variant constraining exploration to actions passing the Safe Action Filter, guaranteeing the survival invariant") %}Definition 90{% end %}).)*

> **Input source.** The Intent Health Indicator \\(f\\) computes semantic convergence \\(\\gamma(\\sigma)\\) from the fleet's current aggregated health reports — the gossip-propagated health vectors \\(H(t)\\) assembled via {% term(url="@/blog/2026-01-22/index.md#def-24", def="Gossip Health Protocol: epidemic dissemination where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds") %}Definition 24{% end %} ([Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md#def-24)). The input \\(\\sigma\\) is the vector of all recent health observations received through gossip, not raw sensor streams. The compression treats \\(\\sigma\\) as a snapshot of fleet-level awareness; individual sensor noise is already averaged out by the gossip aggregation layer.

*Input signals: the per-node scalar health inputs used by this indicator are drawn from the {% term(url="@/blog/2026-01-29/index.md#def-55", def="Synthetic Health Metric: composite scalar aggregating subsystem health scores for fleet-level coherence voting") %}Synthetic Health Metric (Definition 55){% end %}. Deployments that modify the Synthetic Health Metric's component weights must recalibrate the intent classification thresholds in this definition accordingly.*

The 3-state compression maps directly to operator-actionable states: **Aligned** requires no intervention; **Drifted** warrants monitoring (healing protocols are active, [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md)); **Diverged** requires immediate escalation ({% katex() %}\gamma < 1 - \varepsilon{% end %} means consensus has failed, {% term(url="@/blog/2026-01-15/index.md#def-5b", def="Semantic Convergence Factor: fraction of merged state items with no policy violations; when this fraction is too low, violations accumulate faster than they can be resolved") %}Definition 5b{% end %}). The compression eliminates alert fatigue by suppressing the high-dimensional telemetry stream that operators cannot process at the rate of generation.

> **Physical translation**: The function \\(f\\) maps the current system state to a single health label that any upstream coordinator can consume without reading raw metrics. Instead of forwarding hundreds of sensor readings per second, the edge node emits one word — Aligned, Drifted, or Diverged — once per MAPE-K tick. An operator monitoring a 47-drone swarm sees 47 health labels, not 47,000 raw metric streams. The compression is lossless for decision purposes: Aligned means no action needed; Drifted means watch for escalation; Diverged means act now.

**Connection to health monitoring**: The Intent Health Indicator is the operator-facing projection of the fleet health state from the [{% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} protocol](@/blog/2026-01-22/index.md). The {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} layer provides \\(\gamma(\sigma)\\); the compression layer translates it into human-actionable signal.

### L0 Physical Safety Interlock

<span id="def-108"></span>
**Definition 108** (L0 Physical Safety Interlock). *An L0 Physical Safety Interlock is a hardware-level circuit that enforces a safe-state transition independent of and prior to any software layer {{ cites(ref="4", refs="4, 14", title="Lee (2008) — Cyber Physical Systems: Design Challenges; Ames et al. (2017) — Control Barrier Function Based Quadratic Programs") }}. It is characterized by:*

- *Non-programmability: the safe-state condition is wired, not configured*
- *{% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} bypass: the circuit fires regardless of {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} state or software health*
- *Determinism: transition time {% katex() %}T_{\text{L0}} < T_{\text{WD}}{% end %} (watchdog period) with no software path*
- *Non-resettability from software: recovery from the L0 Physical Interlock requires physical human action*

{% katex(block=true) %}
\text{L0Physical}(t) = \mathbb{1}\!\left[\exists\, p \in \mathcal{P}_{\text{phys}}:\ \text{HardCondition}(p,\, t)\right]
{% end %}

- **Use**: Hardware circuit that trips the binary veto signal when any physical parameter crosses a wired threshold, independent of all software; software reads {% katex() %}v(t){% end %} at each Execute tick and skips the tick if {% katex() %}v(t) = 1{% end %} to prevent thermal runaway from software retrying commands to a fused actuator.
- **Parameters**: Thresholds set at manufacture; non-programmable from software and non-resettable without physical intervention.
- **Field note**: Put the L0 circuit on a separate power rail from main compute — a shared brownout can simultaneously defeat both the software watchdog and the physical interlock.

**Hold management**: the L0 interlock engages indefinitely until cleared. To prevent indefinite hold due to firmware faults: (1) a hardware watchdog timer {% katex() %}T_{\text{watchdog}} = 4\,\text{h}{% end %} triggers a controlled power cycle if the interlock remains engaged beyond \\(T_{\text{watchdog}}\\); (2) a physically-present operator (requiring hardware key or authenticated console) may perform an emergency release after verifying the triggering condition is resolved; (3) for GRIDEDGE and scheduled-operation deployments, an operator-scheduled release window may be pre-authorized with a minimum {% katex() %}T_{\text{hold,min}} = 30\,\text{min}{% end %} before the scheduled operation.

**Why non-resettable?** If the L0 interlock were software-resettable, a corrupted MAPE-K loop or a sufficiently severe software fault could disable the interlock and re-enable a fused actuator — eliminating the safety guarantee precisely when it is most needed. By requiring physical human action to reset, we guarantee that even complete software failure cannot bypass the safety boundary (equivalent to the Safe Operating Envelope (SOE) from [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md) — the set of states where the Lyapunov stability criterion holds). The inter-tick safety gap identified in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#prop-25) (discrete-time certificate does not protect between sampling instants) is exactly why a hardware-layer backstop is mandatory for systems where failure propagates faster than \\(T_\\text{tick}\\).

**False-positive mitigation and L0.5 pre-stage.** L0 interlocks are irreversible; false-positive rates must be validated below 1 per 10,000 operating hours before deployment. To reduce false-positive risk, consider a reversible **L0.5 pre-stage**: reduced capability, no autonomous actuation, but NOT a pyrotechnic/permanent lockout. L0.5 activates when any single watchdog fires; L0 activates only when two or more independent watchdog timers agree simultaneously. This two-stage approach preserves safety under dual-independent-failure scenarios while preventing a single transient spike from permanently disabling a critical asset.

*where {% katex() %}\mathcal{P}_{\text{phys}}{% end %} is the set of monitored physical parameters (voltage, temperature, acceleration, arming signal). When {% katex() %}\text{L0Physical}(t) = 1{% end %}, the system enters {% katex() %}\mathcal{S}_{\text{phys}}{% end %} — a state that cannot be exited by any software command.*

**Example**: In {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, each ground vehicle carries a wired over-temperature cutoff on its drive motor: if the motor winding exceeds {% katex() %}185^{\circ}\text{C}{% end %}, the circuit opens the power relay in under 2 ms — well below the 20 ms software watchdog period — regardless of whether the autonomic control stack is running, hung, or actively sending drive commands. A software fault that saturates the motor controller cannot prevent the interlock from firing; once the relay opens, no software command can close it until a technician resets the physical latch. This hard boundary makes the MAPE-K thermal-management loop a best-effort optimization, not a safety dependency.

**Distinction from software watchdogs**: {% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %} is distinct from the Software Watchdog ({% term(url="@/blog/2026-01-29/index.md#def-41", def="Software Watchdog Timer: hardware-backed countdown triggering a safe-state transition if the autonomic control loop fails to check in within its configured timeout") %}Definition 41{% end %}) and Terminal Safety State ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}). The Software Watchdog detects software failure and triggers a software response. The Terminal Safety State is a {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} outcome. The L0 Physical Interlock bypasses the entire software stack — it fires because a physical condition was met, regardless of whether the software is functioning. The {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop cannot override it; neither can a remote command.

**Implementation examples**: Dead Man's Switch (DMS) circuits, hardware-enforced power cutoff, physically irreversible actuation (pyrotechnic separation, thermal runaway inhibitor). The interlock is not part of the autonomic control plane — it is the boundary condition that the autonomic control plane must never violate.

> **Cognitive Map**: The human-machine teaming section formalizes five constructs at the automation boundary. {% term(url="#prop-74", def="Predictive Handover Criterion: edge node should initiate autonomous-mode handover when the partition accumulator exceeds the 95th-percentile partition duration") %}Proposition 74{% end %} (Predictive Handover Criterion) establishes the lead time requirement: initiate handover before the safety floor is reached, by the SA reconstruction duration. {% term(url="#def-105", def="Asymmetric Trust Dynamics: trust gain and loss rates differ; nodes lose trust rapidly on violation but regain it slowly after correct behavior") %}Definition 105{% end %} (Asymmetric Trust Dynamics) models slow trust build, fast trust loss — the system must not assume trust persists across incidents. {% term(url="#def-106", def="Causal Barrier: synchronization point preventing capability escalation until all causally prior operations have been acknowledged by the required quorum") %}Definition 106{% end %} (Causal Barrier) rejects commands whose mental model is more stale than the decision's impact window. {% term(url="#def-107", def="Intent Health Indicator: mapping from system state to intent-satisfaction level, measuring how well the current autonomic plan serves the mission") %}Definition 107{% end %} (Intent Health Indicator) compresses system state into an operator-consumable signal to prevent alert fatigue. {% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %} (L0 Physical Safety Interlock) is the absolute boundary: hardware-enforced, software-bypassing, mission-aborting — the constraint that makes all other autonomic guarantees credible.

---

## State-Delta Briefing and the Slow-Sync Handover

> **Problem**: {% term(url="#prop-74", def="Predictive Handover Criterion: edge node should initiate autonomous-mode handover when the partition accumulator exceeds the 95th-percentile partition duration") %}Proposition 74{% end %} specifies *when* to begin handover. It does not specify *how* to execute it safely. At reconnection, the delta between the operator's mental model and actual system state is at its maximum — presenting raw telemetry causes Mode Confusion (operator applies stale mental model to live data) and Automation Surprise (snap commands before SA reconstruction).
> **Solution**: The seven-step State-Delta Briefing protocol: compute per-variable divergence scores, rank them, impose a calibrated Shadow Mode observation window (read-only for duration {% katex() %}T = \min(T_{\max}, k \cdot \tau_{\text{partition}} \cdot D_{\text{norm}}){% end %}), present the Difference Map with at most {% katex() %}N_{\max} = 7{% end %} items, and gate write-access on explicit acknowledgment. Shadow Mode pre-loads Level 1 SA before the operator is shown what changed.
> **Trade-off**: The Shadow Mode duration \\(T\\) must be calibrated against actual operator SA reconstruction times. Setting \\(T\\) too short defeats the purpose; setting it too long frustrates operators who correctly understand the situation. The 120-second hard ceiling ({% katex() %}T_{\max}{% end %}) prevents pathological long partitions from producing indefinite lockouts.

{% term(url="#prop-74", def="Predictive Handover Criterion: edge node should initiate autonomous-mode handover when the partition accumulator exceeds the 95th-percentile partition duration") %}Proposition 74{% end %} (Predictive Handover Criterion) establishes *when* to initiate {% katex() %}Q_{\text{delegated}} \to Q_{\text{command}}{% end %} transfer — conservatively, before \\(\Psi(t)\\) reaches {% katex() %}\Psi_{\text{fail}}{% end %}, accounting for SA reconstruction time {% katex() %}\tau_{SA}{% end %}. It does not specify *how* to execute the transfer safely. At reconnection, the delta between the operator's mental model and actual system state is at its maximum. Presenting raw telemetry at this moment triggers two failure modes: Mode Confusion (operator applies stale assumptions to live data) and Automation Surprise (unexpected system state drives snap commands before SA is reconstructed). That gap is the [{% term(url="@/blog/2026-02-12/index.md#def-91", def="Decision boundary above which irreversibility, precedent impact, model uncertainty, or ethical weight exceeds the autonomic system's authorization limit — requiring human intervention rather than autonomous action") %}judgment horizon{% end %}](@/blog/2026-02-12/index.md#def-91) ({% term(url="@/blog/2026-02-12/index.md#def-91", def="Judgment Horizon: time window over which an edge node can make autonomous decisions without external validation before confidence degrades below a threshold") %}Definition 91{% end %}).

After a 47-minute {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} blackout, the swarm has autonomously re-planned routes, consumed fuel non-uniformly, rerouted through alternate corridors, and reassigned formation roles. The operator rejoining {% katex() %}Q_{\text{command}}{% end %} encounters a fleet that is functionally different from the one delegated. Without a structured transition, the operator either under-reacts (trusting the stale mental model) or over-reacts (issuing conflicting commands mid-maneuver). Both failure modes appear in aviation Mode Confusion incidents (Air France 447, 2009; Asiana 214, 2013) where automation-to-manual handover caused loss of situational control.

The State-Delta Briefing protocol closes this gap in three steps: rank divergence, impose a calibrated observation window, then gate write-access on briefing acknowledgment.

<span id="def-109"></span>

**Definition 109** (State-Delta Briefing Protocol). Given pre-partition state \\(\Sigma(t_0)\\), post-partition state {% katex() %}\Sigma(t_{\text{reconnect}}){% end %}, and partition duration {% katex() %}\tau_{\text{partition}}{% end %}, the handover proceeds as follows.

*HLC dependency: the delta sequencing in this protocol relies on the Hybrid Logical Clock causal ordering properties established in {% term(url="@/blog/2026-02-05/index.md#prop-41", def="HLC Causal Ordering Properties: for any two events e1 and e2, if e1 causally precedes e2 then HLC(e1) < HLC(e2); HLC timestamps are monotonically non-decreasing and advance on every send, receive, or local event") %}Proposition 41{% end %}. Under HLC failure conditions (see Causal Barrier safe mode, above), delta sequencing falls back to physical timestamp ordering with a staleness flag appended to each delta record.*

**Step 1** (delta): For each state variable {% katex() %}i \in \{1,\ldots,N\}{% end %}, compute the normalized divergence score:

{% katex(block=true) %}
d_i = \left|\frac{\Sigma_i(t_{\text{reconnect}}) - \Sigma_i(t_0)}{\sigma_i}\right|
{% end %}

where \\(\sigma_i\\) is the operational range of variable \\(i\\). The divergence score \\(d_i\\) is dimensionless and comparable across heterogeneous state variables (fuel fraction, route deviation, formation index).

**Step 2** (rank): Sort variables by \\(d_i\\) descending to produce ranking {% katex() %}R = (d_{(1)} \geq d_{(2)} \geq \cdots \geq d_{(N)}){% end %}.

**Step 3** (norm): Compute the fleet divergence norm: {% katex() %}D_{\text{norm}}(t) = d_{(1)} = \max_i d_i{% end %}.

**Step 4** (shadow duration): Compute Shadow Mode duration:

{% katex(block=true) %}
T = \min\!\left(T_{\max},\; k \cdot \tau_{\text{partition}} \cdot D_{\text{norm}}(t)\right)
{% end %}

**Physical translation.** \\(T\\) scales with how long the partition lasted and how much the fleet diverged during it. A 5-minute partition with minimal divergence ({% katex() %}D_{\text{norm}} = 0.1{% end %}) gives {% katex() %}T = k \cdot 5 \cdot 0.1 = 0.5k{% end %} seconds — a brief observation window. A 47-minute partition with high divergence ({% katex() %}D_{\text{norm}} = 0.8{% end %}) gives {% katex() %}T = k \cdot 47 \cdot 0.8 = 37.6k{% end %} seconds — nearly a minute at \\(k = 2\\). The formula ensures the handover burden scales with the briefing complexity, not with a fixed constant. The {% katex() %}T_{\max}{% end %} cap prevents a 3-day partition from producing a 72-minute lockout.

where \\(k\\) is a fleet-wide calibration constant and {% katex() %}T_{\max}{% end %} is a hard ceiling (nominally 120 s). When {% katex() %}\tau_{\text{partition}} \to 0{% end %} or {% katex() %}D_{\text{norm}} \to 0{% end %}, \\(T \to 0\\) and the briefing collapses to a direct handover.

**Calibrating \\(k\\).** The constant \\(k\\) is a fleet-wide calibration factor measured from operator trials: it represents how many seconds of SA reconstruction a human operator requires per second of partition per unit divergence. Empirical values: CONVOY (12 vehicles, trained operators) \\(k = 2.0\\); RAVEN (47 drones, high-stress scenario) \\(k = 2.8\\). Calibrate per operator cohort in pre-deployment trials. Default: \\(k = 2.0\\) if no trial data is available.

**Step 5** (Shadow Mode): For duration \\(T\\), write-access to {% katex() %}Q_{\text{command}}{% end %} is disabled. The operator observes {% katex() %}Q_{\text{delegated}}{% end %}'s intended next actions in real time — the system narrates its reasoning via the Intent Health Indicator ({% term(url="#def-107", def="Intent Health Indicator: mapping from system state to intent-satisfaction level, measuring how well the current autonomic plan serves the mission") %}Definition 107{% end %}). No intervention is possible. This pre-loads Level 1 situational awareness (perception of current system behavior) before the Difference Map is shown.

**Step 6** (Difference Map): At \\(T\\) seconds, present \\(\Delta\Sigma(t)\\) ({% term(url="#def-110", def="Difference Map: compact representation of diverged state entries used by the State-Delta Briefing Protocol to transmit only changed items at reconnection") %}Definition 110{% end %}) to the operator: the top {% katex() %}N_{\max}{% end %} diverged variables, ranked by \\(d_i\\), severity-tagged, with pre- and post-partition values side by side.

**Step 7** (gate): {% katex() %}Q_{\text{command}}{% end %} activation requires explicit operator acknowledgment of the Difference Map. If CRITICAL-tier items remain unresolved, \\(T\\) extends by {% katex() %}T_{\text{ext}} = \min(T_{\max},\; k \cdot 30\,\text{s} \cdot |\text{CRITICAL}|){% end %}, where 30 s is the per-CRITICAL-item baseline extension, entering a second Shadow Mode cycle. This loop continues until all CRITICAL items are resolved or the operator accepts residual risk explicitly.

> **Re-partition during briefing**: If connectivity is lost while the system is in SHADOW_MODE or BRIEFING_PRESENTED state (i.e., before Q_COMMAND_ACTIVE clears), abort the current briefing and re-enter PARTITION state. The partial briefing is discarded. Upon the next reconnection, compute fresh \\(\Delta\Sigma(t)\\) from the updated partition endpoint and begin a new briefing. Commands queued during BRIEFING_PRESENTED are held, not executed, until the gate clears on the next successful briefing. Commands queued more than \\(\tau_{SA}\\) seconds before the gate clears are discarded as presumptively stale — an operator's mental model formed before a second partition does not reflect the current fleet state.

> **Physical translation**: When a human operator regains connectivity after a partition, they cannot process the full fleet state. The briefing protocol identifies the minimum set of state changes that affect pending decisions — tactical changes first, then strategic, then administrative. An operator briefed in this order can make time-critical decisions within seconds of reconnection rather than waiting for the full state synchronization to complete.

<span id="def-110"></span>

**Definition 110** (Difference Map). The **Difference Map** \\(\Delta\Sigma(t)\\) is the ranked, severity-tagged representation of state divergence at reconnection:

{% katex(block=true) %}
\Delta\Sigma(t) = \left\{\, \bigl(\text{var}_i,\; v^{\text{pre}}_i,\; v^{\text{post}}_i,\; \delta_i,\; r_i,\; s_i\bigr) : d_i > 0,\; r_i \leq N_{\max} \,\right\}
{% end %}

- **Use**: Bounds operator time to Level 2 situational awareness at 15 seconds from the Difference Map briefing; {% katex() %}N_{\max} = 7{% end %} items and CRITICAL-first ordering are both required for the bound to hold, preventing SA overrun from information overload that degrades operator comprehension beyond the window.
- **Parameters**: {% katex() %}N_{\max} = 7{% end %} items (Miller's Law); 1.5–12.0 s per item; CRITICAL tier requires 4–26 s for comprehension.
- **Field note**: Validate with 10+ real operators under time pressure — lab conditions consistently produce {% katex() %}20\text{--}30\%{% end %} faster times than actual field deployments.

where {% katex() %}\text{var}_i{% end %} is the variable identifier, {% katex() %}v^{\text{pre}}_i = \Sigma_i(t_0){% end %}, {% katex() %}v^{\text{post}}_i = \Sigma_i(t_{\text{reconnect}}){% end %}, {% katex() %}\delta_i = v^{\text{post}}_i - v^{\text{pre}}_i{% end %}, \\(r_i\\) is divergence rank, and {% katex() %}s_i \in \{\text{CRITICAL},\, \text{WARN},\, \text{INFO}\}{% end %} is the severity tier.

Variables ranked beyond {% katex() %}N_{\max} = 7{% end %} are collapsed to an "\\(N - 7\\) additional changes" summary line. Severity tiers follow the same k-sigma structure as {% term(url="@/blog/2026-01-22/index.md#def-33", def="Divergence Sanity Bound: maximum acceptable state divergence before a node must enter quarantine mode, preventing reconciliation storms at reconnection") %}Definition 33{% end %} ([Divergence Sanity Bound](@/blog/2026-01-22/index.md#def-33)): CRITICAL for \\(d_i > 3\\), WARN for \\(d_i \in (1, 3]\\), INFO for \\(d_i \leq 1\\).

> **Physical translation**: The difference map answers "what changed while you were disconnected?" in decision-relevant order. Assets that moved outside their planned routes appear first; assets within tolerance are suppressed. The operator sees the delta, not the full picture — this reduces briefing time from minutes to seconds for large fleets.

The {% katex() %}N_{\max} = 7{% end %} cap reflects Miller's Law (working memory capacity \\(7 \pm 2\\) chunks) {{ cite(ref="15", title="Miller (1956) — The Magical Number Seven, Plus or Minus Two") }}: Miller, G.A., 1956, 'The Magical Number Seven, Plus or Minus Two: Some Limits on Our Capacity for Processing Information,' *Psychological Review*, 63(2), 81–83. Presenting more than 7 diverged variables simultaneously does not increase operator SA — it fragments attention and delays comprehension of the highest-priority items. The cap is a cognitive capacity constraint enforced by the protocol, not a data limitation.

Empirical validation of \\(N_\\text{max}\\) against your operator cohort under time-pressure conditions is recommended before finalizing this value. For operators with domain expertise, \\(N_\\text{max}\\) may be raised to 9; for high-stress scenarios (RAVEN), lower to 5.

The handover state machine:

{% mermaid() %}
stateDiagram-v2
    [*] --> PARTITION
    PARTITION --> RECONNECT_DETECTED : connectivity restored
    RECONNECT_DETECTED --> SHADOW_MODE : compute delta-Sigma, start timer T
    SHADOW_MODE --> BRIEFING_PRESENTED : T elapsed
    BRIEFING_PRESENTED --> Q_COMMAND_ACTIVE : ack + no unresolved CRITICAL
    BRIEFING_PRESENTED --> SHADOW_MODE : CRITICAL unresolved, T extended
    Q_COMMAND_ACTIVE --> PARTITION : connectivity lost
    Q_COMMAND_ACTIVE --> [*]
{% end %}


<span id="prop-75"></span>

**Proposition 75** (Situation Awareness Bound). *Under the State-Delta Briefing Protocol (Definition 109) with Difference Map (Definition 110), if {% katex() %}|\Delta\Sigma(t)| \leq N_{\max} = 7{% end %} and variables are sorted CRITICAL-first, then a trained operator achieves Level 2 Situational Awareness (comprehension of current situation, Endsley 1995) within {% katex() %}T_{\text{brief}} \leq 15{% end %} seconds, independently of partition duration {% katex() %}\tau_{\text{partition}}{% end %}.*

*Proof sketch.* Information-theoretic bound: {% katex() %}15\,\text{s} / 7\,\text{items} \approx 2.1\,\text{s}{% end %} per item. Trained-operator HMI alert-processing rates for ranked alert summaries are 1.5–12.0 s per item (Endsley 1995; NTSB accident data). Severity-first ordering ensures CRITICAL items are processed in the first 4–26 seconds, exceeding Level 2 SA threshold for highest-priority variables before the 15-second mark. Shadow Mode (Step 5) pre-loads Level 1 SA during the observation window, so Difference Map comprehension begins with perceptual context already established. Partition duration {% katex() %}\tau_{\text{partition}}{% end %} affects \\(T\\) ({% term(url="#def-109", def="State-Delta Briefing Protocol: structured handover message containing only the state delta since last sync, minimizing reconnection bandwidth cost") %}Definition 109{% end %} Step 4) but not {% katex() %}T_{\text{brief}}{% end %} — longer partitions produce longer Shadow Mode intervals that absorb divergence perception incrementally, not longer Difference Map reading times. \\(\square\\)

> **Physical translation**: {% katex() %}T_{\text{brief}} \leq 15{% end %} seconds is the maximum information loss during partition expressed as an operator comprehension time: regardless of whether the partition lasted 5 minutes or 5 hours, a correctly structured briefing takes at most 15 seconds to bring the operator to Level 2 SA. The stale upstream picture — the delta between what the operator knew at partition start and what the fleet actually is at reconnection — is fully communicated within that window. The bound holds only when {% katex() %}N_{\max} = 7{% end %} items are shown CRITICAL-first; violating either condition extends {% katex() %}T_{\text{brief}}{% end %} beyond the bound.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration.** Partition duration {% katex() %}\tau_{\text{partition}} = 47{% end %} minutes. Post-reconnection divergences: fuel consumption 40% above plan ({% katex() %}d_{(1)} = 2.1{% end %}), route sector deviation ({% katex() %}d_{(2)} = 1.4{% end %}), formation lead reassigned ({% katex() %}d_{(3)} = 0.9{% end %}) — all WARN, no CRITICAL.

With \\(k = 0.5\\), Shadow Mode duration {% katex() %}T = \min(120,\; 0.5 \times 47 \times 2.1) \approx 49{% end %} seconds. The operator observes 49 seconds of autonomous operation, receives a 3-item Difference Map (WARN only), acknowledges, and gains {% katex() %}Q_{\text{command}}{% end %}. Total reconnect-to-active-command time: under 65 seconds — the 15-second SA target applies to the Difference Map reading step alone; Shadow Mode absorbs the divergence perception load during the preceding observation window.

The state-delta briefing section solves the handover quality problem. The protocol converts a potentially dangerous cold handover into a structured warm transition: divergence is ranked ({% term(url="#def-109", def="State-Delta Briefing Protocol: structured handover message containing only the state delta since last sync, minimizing reconnection bandwidth cost") %}Definition 109{% end %} Steps 1–12), an observation window is computed and enforced (Steps 4–24), and write-access is gated on briefing acknowledgment (Steps 6–27).

The Situation Awareness Bound ({% term(url="#prop-75", def="Situation Awareness Bound: State-Delta Briefing Protocol delivers full situation awareness context in time proportional to the state delta size divided by available bandwidth") %}Proposition 75{% end %}) proves that Difference Map comprehension reaches Level 2 SA within 15 seconds when {% katex() %}N_{\max} = 7{% end %} and CRITICAL items come first — partition duration affects Shadow Mode length, not briefing reading time. The RAVEN calibration shows the protocol in numbers: 47-minute partition, 49-second shadow mode, 3-item Difference Map, under 65 seconds total to active command.

> **Empirical status**: The {% katex() %}T_{\text{brief}} \leq 15\,\text{s}{% end %} bound and \\(N_{\max} = 7\\) cap are derived from Endsley (1995) and NTSB alert-processing data for ranked alert summaries; the 2.1 s per-item rate assumes a trained operator under moderate cognitive load — high-stress scenarios ({% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} combat) may increase per-item processing time to 4–6 s, implying a 28–42 s briefing window that should be validated against operator trials before finalizing \\(N_{\max}\\) for each deployment context.

---

## The Limits of Constraint Sequence

> **Problem**: The constraint sequence framework is a powerful prescriptive tool, but like all frameworks it has validity boundaries. Applied outside those boundaries, it produces incorrect sequencing recommendations. A system built on the wrong sequence then fails in ways that are expensive to diagnose — because the framework itself provided the false confidence.
> **Solution**: Three answers. First: enumerate the structural failure modes of the framework itself — cyclic dependencies, adversarial graph evolution, and resource-infeasible sequencing. Second: establish where engineering judgment must supplement formal derivation. Third: translate the framework's three foundational mathematical constraints (clock discipline, resource floor, stability envelope) into production-observable early-warning signals that detect approach to a validity boundary before the boundary is crossed.
> **Trade-off**: The framework's power is that it converts architectural sequencing from judgment to derivation. Its weakness is that it assumes the prerequisite graph is stable and acyclic, and that the three structural constraints hold throughout operation. The three structural signals address the second assumption directly — but they cannot address the first. In a genuinely novel deployment environment where the graph itself is wrong, no signal can fire that the model was not designed to measure.

Every framework has boundaries. The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} is powerful but not universal. Recognizing its limits is essential for correct application.

### Where the Framework Fails

**Novel constraints**: The framework assumes constraints are known. Unknown unknowns—constraints that weren't anticipated—aren't in the graph. When a novel constraint emerges, the sequence must be updated.

Example: A new adversary capability (sophisticated RF interference) creates a constraint not in the original graph. The team must add the constraint, identify its prerequisites, and re-evaluate the sequence.

**Circular dependencies**: Some capabilities genuinely depend on each other at runtime even when the development prerequisite graph is acyclic. The precise failure mode is a cold-start deadlock: Monitor waits for Resource Manager to allocate CPU before it can run; Resource Manager waits for Healer to release runaway processes before it can stabilise budgets; Healer waits for Monitor to provide a diagnosis before it acts. All three block — the system cannot boot.

This is not a flaw in {% term(url="#prop-66", def="Valid Sequence Existence: a valid constraint sequence always exists for any acyclic prerequisite graph, found by topological sort of the prerequisite DAG") %}Proposition 66{% end %}. {% term(url="#prop-66", def="Valid Sequence Existence: a valid constraint sequence always exists for any acyclic prerequisite graph, found by topological sort of the prerequisite DAG") %}Proposition 66{% end %} applies to the *capability development* graph, which is acyclic: Self-Measurement (the Monitor capability) must be validated before Self-Healing (the Healer capability) can be developed, which must be validated before Fleet Coherence requires the Resource Manager at scale. The development ordering is a strict DAG. The runtime component dependency graph is a different object and can be cyclic.

**Resolution: L0 isolation breaks the runtime cycle.** {% term(url="@/blog/2026-01-15/index.md#def-18", def="Dependency Isolation Requirement: each autonomic capability layer must fail independently without propagating failures to lower capability layers") %}Definition 18{% end %} (L0 Dependency Isolation Requirement) requires each runtime component to have a zero-dependency L0 survival-mode variant. The Monitor's L0 variant reads raw hardware registers with no process-level dependencies; the Healer's L0 variant fires on static thresholds with no Resource Manager input; the Resource Manager's L0 variant applies fixed priority tables with no feedback from the Healer. Cold-start bootstrap sequence:

1. Hardware watchdog and safe-state logic — zero runtime dependencies, activates from ROM
2. L0 sensor baseline — raw hardware registers only, no inter-component calls
3. L0 threshold-based healing — static rules, no Resource Manager interaction
4. L0 static resource manager — fixed tier priorities, no Healer coupling
5. L1+ MAPE-K loops — full Monitor/Healer/ResourceManager feedback cycle activates once L0 stability is confirmed over \\(T_{\text{stable}}\\)

{% term(url="@/blog/2026-01-15/index.md#prop-8", def="Hardened Hierarchy Fail-Down: when an authority tier fails, control automatically delegates to the next lower tier without service interruption") %}Proposition 8{% end %} (Hardened Hierarchy Fail-Down) guarantees that once L1+ enters the cyclic regime, L0 independence is preserved: a deadlock in the L1+ cycle cannot cascade below L0 and cannot prevent L0 from maintaining basic survival.

**Development-time circular dependencies** — where two *capabilities* depend on each other for validation, not just runtime operation — require a different resolution. Self-measurement quality depends on communication reliability (gossip needs a working channel); communication reliability depends on self-measurement (detecting and healing bad links). These cycles can't be serialized. Resolution: derive initial approximations {% katex() %}\hat{S}^{(0)}{% end %}, {% katex() %}\hat{C}^{(0)}{% end %} from simulation or design specifications, develop each assuming the other's initial approximation, then iterate until successive estimates change less than a predefined tolerance (e.g., 1% of threshold value). This converges because self-measurement quality and communication quality are weakly coupled at initialization — neither depends strongly on the other until the system approaches operational load.

**Resource constraints**: Sometimes you can't afford the proper sequence. Budget, time, or capability limits may force shortcuts.

Example: A team has 6 months to deliver. The proper sequence requires 12 months. They must make risk-informed decisions about which phases to abbreviate.

Mitigation: Document the shortcuts. Know what risks you're accepting. Plan to revisit abbreviated phases when resources allow.

**Time constraints**: Mission urgency may require deployment before the sequence is complete.

Example: An emerging threat requires rapid deployment. The system passes Phase 2 but Phase 3 is incomplete.

Mitigation: Deploy with documented limitations. Restrict operations to validated {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier from heartbeat-only survival at the base level to full fleet integration at the top; each level requires minimum connectivity and consumes proportionally more energy") %}capability levels{% end %}. Continue validation in parallel with operations.

### Engineering Judgment

The meta-lesson: **every framework has boundaries**. The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} is a tool, not a law. The edge architect must know when to follow the framework and when to adapt.

Signs the framework doesn't apply:
- Constraints don't fit the graph structure
- Validation criteria can't be defined
- Resources don't permit proper sequencing
- Novel situations not anticipated by framework

When these signs appear, engineering judgment must supplement the framework. The framework provides structure; judgment provides adaptation.

**{% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} insight**: Framework failures improve the framework. Each case where the {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} didn't apply is an opportunity to extend it. Document exceptions. Analyze root causes. Update the framework for future use.

### Three Structural Signals

The three constraints established in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) — clock drift, resource floor, and stability under mode-switching — each have observable early-warning signals in production. These signals matter precisely because of the framework's boundary: by the time a formal guarantee is violated, the system is already failing. Monitoring the approach to violation gives the autonomic loop — and the operator — time to act while the formal tools still apply.

**Clock drift.** Every node records the per-exchange deviation between its own {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid logical clock combining physical time and a logical counter; enables causal ordering of events across partitioned nodes without requiring synchronized wall clocks") %}Hybrid Logical Clock{% end %} (HLC, {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock (HLC): clock combining physical and logical timestamps, advancing on message receipt to maintain causal ordering without NTP") %}Definition 61{% end %}) watermark and each peer's. The {% term(url="@/blog/2026-01-22/index.md#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} bound {% katex() %}\tau_{\max}{% end %} from {% term(url="@/blog/2026-01-22/index.md#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %} assumes clock discipline holds. When per-node estimated drift rate {% katex() %}\hat{\delta}_i{% end %} exceeds twice the hardware specification {% katex() %}\delta_{\max}^{\text{spec}}{% end %}, the partition duration accumulator {% katex() %}T_{\text{acc}}{% end %} ({% term(url="@/blog/2026-01-15/index.md#def-15", def="Partition Duration Accumulator: contiguous time spent in the disconnected regime; resets on partition end; input to threshold adaptation and the Weibull Circuit Breaker") %}Definition 15{% end %}) will drive the node past the Drift-Quarantine Re-sync trigger ({% term(url="@/blog/2026-02-05/index.md#def-63", def="Drift-Quarantine Re-sync Protocol: procedure for re-integrating a node whose HLC has drifted beyond the Clock Trust Window after extended partition") %}Definition 63{% end %}) before the next maintenance window — meaning causal ordering under {% term(url="@/blog/2026-02-05/index.md#prop-45", def="HLC Causal Ordering Properties: HLC maintains the happens-before relation and wall-clock proximity, bounding clock skew to a sum of the drift and network delay bounds") %}Proposition 45{% end %} cannot be verified for observations made during that gap.

| Signal | Nominal | Alert | Response |
| :--- | :--- | :--- | :--- |
| Per-exchange HLC deviation {% katex() %}\Delta l_{ij}{% end %} | {% katex() %}\leq \varepsilon + \tau_{\max}{% end %} | {% katex() %}> \varepsilon + \tau_{\max}{% end %} | Trigger Drift-Quarantine (Def 42) immediately |
| Estimated drift rate {% katex() %}\hat{\delta}_i{% end %} | {% katex() %}< \delta_{\max}^{\text{spec}}{% end %} | {% katex() %}> 2\delta_{\max}^{\text{spec}}{% end %} | Schedule NTP sync; increase gossip fanout |
| Fleet fraction with unresolved HLC divergence | {% katex() %}< 5\%{% end %} | {% katex() %}\geq 10\%{% end %} | Fleet-wide clock discipline failing; escalate to operator |

**Adaptation**: When the 10% threshold fires, halve the gossip interval for all affected node classes to propagate corrected watermarks. Any node for which {% katex() %}\Delta l_{ij} > \varepsilon + \tau_{\max}{% end %} is excluded from the {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge path ({% term(url="@/blog/2026-02-05/index.md#def-62", def="HLC-Aware CRDT Merge Function: CRDT merge using HLC timestamps for causal ordering, resolving conflicts correctly even when physical clocks have drifted") %}Definition 62{% end %}'s HLC-aware merge is invalidated by drift beyond \\(\varepsilon\\)) until re-sync completes.

> **Physical translation**: {% katex() %}\hat{\delta}_i{% end %} measures how fast node \\(i\\)'s clock is drifting *beyond* what the hardware specification allows. A 100 ppm crystal drifts by at most 0.1 ms per second; a reading of 0.25 ms per second means the crystal is degrading. The alert at {% katex() %}2\delta_{\max}^{\text{spec}}{% end %} fires when drift is *accelerating* — before the staleness bound {% katex() %}\tau_{\max}{% end %} is breached. For a {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} node with {% katex() %}T_{\text{acc}} = 30{% end %} minutes into a partition: at 100 ppm nominal, HLC divergence is negligible; at 250 ppm measured, logical timestamps are diverging at a rate that will exceed \\(\varepsilon\\) within the partition window. Catching this early means Drift-Quarantine can complete a re-sync at the next brief connectivity window rather than discovering the divergence at full reconciliation time.

**Resource floor.** The composite resource availability \\(R(t)\\) ({% term(url="@/blog/2026-01-15/index.md#def-1", def="Resource State: normalized composite of battery charge, free memory, and idle CPU between zero and one; falling below 0.2 triggers survival mode regardless of connectivity state") %}Definition 1{% end %}) has a critical threshold {% katex() %}R_{\text{crit}} \approx 0.2{% end %} at which survival-mode shedding activates. The operationally important threshold is earlier: {% term(url="#prop-68", def="Autonomic Overhead Bound: total autonomic stack memory must stay below the critical resource threshold; the Zero-Tax tier satisfies this bound for MCUs down to 4 KB SRAM") %}Proposition 68{% end %} establishes the autonomic overhead ceiling {% katex() %}R_{\text{autonomic}}^{\max} = R_{\text{total}} - R_{\text{mission}}^{\min}{% end %}. Below {% katex() %}R(t) = 1.75\,R_{\text{crit}} \approx 0.35{% end %}, the healing planner's action feasibility constraint {% katex() %}g_2(a):\, \text{Cost}(a) \leq R_{\text{available}}{% end %} begins rejecting Severity 2 and above actions ({% term(url="@/blog/2026-01-29/index.md#def-44", def="Healing Action Severity: ordinal scale classifying healing actions by resource cost and mission disruption, used to select minimum-impact interventions first") %}Definition 44{% end %}). The system is above {% katex() %}R_{\text{crit}}{% end %} but already healing-impaired.

| Signal | Nominal | Pre-critical | Emergency |
| :--- | :--- | :--- | :--- |
| \\(R(t)\\) resource availability | {% katex() %}> 0.35{% end %} | {% katex() %}[0.20,\, 0.35]{% end %} | {% katex() %}< 0.20{% end %} |
| Autonomic fraction {% katex() %}R_{\text{autonomic}} / R_{\text{total}}{% end %} | {% katex() %}< 20\%{% end %} | {% katex() %}20\text{--}30\%{% end %} | {% katex() %}> 30\%{% end %} |
| Healing actions rejected by \\(g_2\\) in last 10 ticks | 0 | {% katex() %}\geq 2{% end %} | Healing loop operationally dysfunctional |

**Adaptation**: At {% katex() %}R(t) \in [0.20, 0.35]{% end %}, apply Resource Priority Matrix ({% term(url="@/blog/2026-01-29/index.md#def-43", def="Resource Priority Matrix: table defining which resource classes preempt others during survival-mode shedding, preventing priority inversion under scarcity") %}Definition 43{% end %}) pre-emptive shedding before reaching {% katex() %}R_{\text{crit}}{% end %}: shed Severity 4 logging state first (no safety invariant), then reduce anti-fragile learning weight updates, then compress the {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} table to active-only peers (drop nodes not contacted within {% katex() %}2\tau_{\max}{% end %}), and finally suspend non-critical measurement threads. Severity 1 and 2 healing mechanisms are shed last. A controlled descent through the pre-critical zone preserves more healing capacity at {% katex() %}R_{\text{crit}}{% end %} than an uncontrolled drop that arrives there without budget for any healing action.

> **Physical translation**: {% katex() %}R(t) = 0.35{% end %} is not a danger threshold — it is a *warning horizon*. On a 500 mW edge device where {% katex() %}R_{\text{mission}}^{\min} = 350{% end %} mW, the autonomic ceiling is 150 mW. At {% katex() %}R(t) = 0.35{% end %}, total available power is 175 mW — only 25 mW above the mission minimum, leaving zero margin for any autonomic function above L0. At this point, any healing action requiring data transmission to coordinate with a peer will fail its {% katex() %}g_2{% end %} feasibility check. Pre-emptive shedding starting at {% katex() %}R(t) = 0.35{% end %} preserves the Healing Deadline guarantee of {% term(url="@/blog/2026-01-29/index.md#prop-21", def="Healing Deadline: upper bound on time-to-resolution for healing actions of given severity, derived from MAPE-K tick rate and action queue depth") %}Proposition 21{% end %} for the Severity 1 actions that remain within budget. Waiting for {% katex() %}R_{\text{crit}}{% end %} means those Severity 1 actions compete with mission survival for the same depleted resource pool.

**Stability under mode-switching.** {% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} establishes the stable gain ceiling {% katex() %}K < 1/(1 + \tau/T_{\text{tick}}){% end %} for the MAPE-K loop. {% katex() %}T_{\text{tick}}{% end %} is mode-dependent: lower capability levels increase the tick interval to conserve compute. As the system sheds load, the stable gain ceiling tightens — a gain \\(K\\) calibrated at L3 may be above the ceiling at L1. Simultaneously, degraded connectivity raises effective feedback delay \\(\tau\\) through the stochastic delay distribution of {% term(url="@/blog/2026-01-29/index.md#def-37", def="Stochastic Transport Delay Model: models MAPE-K feedback delay as a Weibull random variable, enabling robust gain scheduling under variable latency") %}Definition 37{% end %}: in the Contested regime, the P99 delay can exceed twenty-five times the nominal value ({% term(url="@/blog/2026-01-29/index.md#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %}), collapsing the safe gain envelope to near zero for remote Severity 2+ actions.

| Signal | Nominal | Alert | Response |
| :--- | :--- | :--- | :--- |
| Gain-delay product {% katex() %}K \cdot \tau / T_{\text{tick}}{% end %} | {% katex() %}< 0.7{% end %} | {% katex() %}> 0.85{% end %} | Reduce \\(K\\) by 30%; restrict to Severity \\(\leq 1\\) healing |
| Mode transition rate relative to dwell bound | {% katex() %}< 1/\tau_{\text{dwell\_min}}{% end %} | {% katex() %}\geq 4/\tau_{\text{dwell\_min}}{% end %} | SMJLS dwell condition violated; halt capability transitions |
| Healing actions increasing net error after execution | 0 | {% katex() %}\geq 1{% end %}/hour | Lyapunov condition failing; reduce \\(K\\) immediately |

**Adaptation**: When the gain-delay alert fires, reduce \\(K\\) by 30% and restrict the healing planner to Severity \\(\leq 1\\) actions — at high delay variance, higher-severity interventions exceed the {% term(url="@/blog/2026-01-29/index.md#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} robust gain bound and are more likely to overshoot than converge. If mode transitions are violating the dwell condition, extend {% katex() %}\tau_{\text{dwell\_min}}{% end %} by \\(2\times\\) to restore the mean-square stability condition of the SMJLS proof before authorizing the next transition.

> **Physical translation**: {% katex() %}K \cdot \tau / T_{\text{tick}}{% end %} is the dimensionless load on the {% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} stability margin — how much of the safe gain envelope the current parameters are consuming. At 0.7, there is 30% margin remaining, enough buffer for delay spikes in the Degraded regime. At 0.85, a single P99 delay event in the Contested regime brings the effective gain product above 1.0 and the loop becomes transiently unstable. The mode-transition alert is the second line: the SMJLS stability proof assumes the system stays in one mode long enough for the error signal to decay before the next switch. Four transitions per dwell interval means each switch's error compounds rather than decays. A system that is technically above {% katex() %}R_{\text{crit}}{% end %} and within {% katex() %}\tau_{\max}{% end %} can have completely lost its healing convergence guarantee through the stability margin alone — these two signals detect that state before the failure manifests.

**Composite early-warning.** Define the structural signal count:

{% katex(block=true) %}
\Gamma(t) = \mathbf{1}\!\left[\hat{\delta} > 2\delta_{\max}^{\text{spec}}\right] + \mathbf{1}\!\left[R(t) < 1.75\,R_{\text{crit}}\right] + \mathbf{1}\!\left[K \cdot \tau / T_{\text{tick}} > 0.85\right]
{% end %}

{% katex() %}\Gamma(t) \in \{0,1,2,3\}{% end %}: 0 = nominal; 1 = one structural constraint approaching its validity boundary; 2 = two constraints converging simultaneously — halt {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} learning updates, notify operator; 3 = all three approaching simultaneously — enter {% katex() %}\mathcal{L}_0{% end %} survival mode, freeze all policy updates, escalate immediately.

> **Physical translation**: {% katex() %}\Gamma = 2{% end %} is not a failure alert — it is a *precondition alert*. The formal guarantees of Propositions 14, 9, and 21 each require their respective structural constraint to hold. At {% katex() %}\Gamma = 2{% end %}, two are simultaneously outside their valid range. The system may still appear functional by observation, but the theoretical foundation that guarantees convergence is no longer intact on two dimensions at once. {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering") %}Anti-fragile{% end %} learning in this state updates policies from data the framework's assumptions no longer vouch for — halting updates at {% katex() %}\Gamma = 2{% end %} is not conservatism, it is maintaining the epistemic validity of the learning loop. For a {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm reading {% katex() %}\Gamma = 2{% end %} after 30 minutes of contested partition — drifting clocks and a tightening gain ceiling simultaneously — the two constraints are not independent: clock drift degrades the staleness estimates the healing planner uses to assess whether observations are fresh enough to act on, and acting on stale observations under a constrained gain bound compounds both violations.

**Three failure modes no signal can prevent.** Even with all three monitors instrumented, certain degradations lie permanently outside the autonomic loop's reach:

- **Partial flash write on power failure.** Detectable after the fact by a gap in the hash chain ({% term(url="@/blog/2026-02-05/index.md#def-67", def="Semantic Commit Order: total order on concurrent updates resolving conflicts by domain-specific priority rules rather than physical timestamps") %}Definition 67{% end %}, Semantic Commit Order) without corresponding anomaly events — the chain diverges without cause. Recovery requires human-initiated state rebuild. No autonomic mechanism can reconstruct a pre-write state from a partial record: this is not a framework limitation, it is a consequence of information theory.

- **Simultaneous all-partition quorum deadlock.** If every node in the fleet reaches {% katex() %}R_{\text{crit}}{% end %} simultaneously, no node has sufficient resources to initiate recovery coordination. Prevention requires a pre-provisioned lightweight coordinator node whose L0 footprint survives below {% katex() %}R_{\text{crit}}{% end %}. This is a provisioning-time architectural decision — \\(\Gamma\\) cannot trigger it at runtime because runtime resources have run out.

- **Framework assumption violations in novel deployment environments.** All three signals assume the framework's structural model is correct for the deployment context. In a genuinely novel environment — a hardware platform, RF signature, or adversarial capability not represented in any prior deployment — all three signals may read nominal while the system degrades along an unmeasured dimension. {% term(url="@/blog/2026-02-12/index.md#prop-57", def="Stress-Information Duality: each partition event yields information about the connectivity distribution; less frequent partitions carry more information per event") %}Proposition 57{% end %} (Stress-Information Duality) applies directly: the first field deployment in a novel environment carries maximum information precisely because the models are most wrong. Instrument exhaustively. Validate every formal bound against field data before trusting any guarantee. The {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient {% katex() %}\mathbb{A}{% end %} measured across the first month of operational deployment is the empirical validity test for every proposition in this series.

All three are human-action problems. The \\(\Gamma\\) score gives the autonomic loop everything it can act on. The three failure modes mark where it stops — precisely where the {% term(url="@/blog/2026-02-12/index.md#def-91", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} ({% term(url="@/blog/2026-02-12/index.md#def-91", def="Judgment Horizon: time window over which an edge node can make autonomous decisions without external validation before confidence degrades below a threshold") %}Definition 91{% end %}) begins.

> **Cognitive Map**: The limits section closes the loop on the constraint sequence framework — and immediately turns its own limits into instruments. Four boundary conditions mark where the framework fails: cyclic prerequisites, adversarial graph evolution faster than development, undefinable validation criteria, and resource-infeasible sequencing. Engineering judgment fills those gaps; the anti-fragile insight converts each framework failure into an extension opportunity. The three structural signals then translate the framework's mathematical assumptions directly into production-observable metrics: HLC deviation for the clock-drift constraint, composite \\(R(t)\\) for the resource floor, and gain-delay product for the stability envelope. The composite \\(\Gamma(t)\\) integrates all three into a single early-warning number — at \\(\Gamma = 2\\), two formal guarantees are simultaneously outside their validity range and anti-fragile learning must pause; at \\(\Gamma = 3\\), survival mode is the only valid response. The three unfixable failure modes mark the absolute boundary where \\(\Gamma\\) ends and human authority begins: the judgment horizon as a production engineering observable.

---

## Composed Failure: Power + Partition + Clock Drift

The hardest failure scenario in this framework — simultaneous power degradation, network partition, and clock drift — requires coordinating mechanisms from across all preceding definitions. The following protocol integrates them into a single executable sequence.

**Preconditions**: A node enters composed failure when all three conditions hold simultaneously:
- Battery \\(B(t) < B_{\text{crit}}\\) (below critical threshold from {% term(url="@/blog/2026-01-29/index.md#def-51", def="Autonomic Overhead Power Map: mapping from capability level to autonomic stack power consumption, showing where monitoring overhead exceeds healing benefit") %}Definition 122{% end %})
- Partition active: \\(C(t) = \text{DENIED}\\) ({% term(url="@/blog/2026-01-15/index.md#def-1", def="Connectivity State: binary or graded measure of a node's current network reachability, from fully connected to fully denied") %}Definition 1{% end %})
- Clock drift {% katex() %}\delta_{\text{HLC}}(t) > \delta_{\text{max}}{% end %} (exceeding HLC tolerance from {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock: clock combining physical and logical timestamps, advancing on message receipt to maintain causal ordering without NTP") %}Definition 61{% end %})

**Protocol (execute in order)**:

1. **L0 gate**: Evaluate {% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: fires when partition duration exceeds the P95 Weibull quantile, triggering a lower-capability safe posture") %}Proposition 37{% end %} (Weibull Circuit Breaker). If \\(T_{\text{acc}} \geq P_{95}\\) partition duration, activate the L0 physical interlock ({% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}) — distinct from the software-level terminal safety state (see [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-53)) — and halt. This step has absolute priority.

2. **MVS floor**: Apply {% term(url="@/blog/2026-01-29/index.md#def-50", def="Minimum Viable System: minimal subset of subsystems that must remain operational to execute the core mission at reduced capability") %}Definition 121{% end %} (Minimum Viable System) to compute the reduced service set \\(S_{\text{MVS}}\\). Suspend all non-MVS healing actions.

3. **Clock isolation**: Freeze HLC advancement ({% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock: clock combining physical and logical timestamps, advancing on message receipt to maintain causal ordering without NTP") %}Definition 61{% end %}). Accept no causal updates; buffer incoming state deltas ({% term(url="#def-109", def="State-Delta Briefing Protocol: structured handover message containing only the state delta since last sync, minimizing reconnection bandwidth cost") %}Definition 109{% end %}) with a timestamp of \\(t_{\text{freeze}}\\) until drift resolves.

4. **Resource triage**: Apply {% term(url="@/blog/2026-01-29/index.md#def-43", def="Resource Priority Matrix: table defining which resource classes preempt others during survival-mode shedding, preventing priority inversion under scarcity") %}Definition 43{% end %} (Resource Priority Matrix) under the constraint \\(B(t) < B_{\text{crit}}\\). The autonomic overhead budget ({% term(url="@/blog/2026-01-29/index.md#def-51", def="Autonomic Overhead Power Map: mapping from capability level to autonomic stack power consumption, showing where monitoring overhead exceeds healing benefit") %}Definition 122{% end %}) is reduced to its minimum viable allocation; EXP3-IX arm evaluation ({% term(url="@/blog/2026-02-12/index.md#def-81", def="EXP3-IX Algorithm: adversarial bandit with implicit exploration achieving minimax regret against any adaptive adversary") %}Definition 81{% end %}) is suspended if remaining CPU budget falls below \\(C_{\text{min}}\\).

5. **Safe action default**: While steps 2–4 are active, all decisions default to the {% term(url="@/blog/2026-02-12/index.md#def-89", def="Safe Action Filter: predicate restricting bandit arm selection to actions that preserve the survival invariant under current resource and connectivity state") %}Safe Action Filter{% end %} ({% term(url="@/blog/2026-02-12/index.md#def-89", def="Safe Action Filter: predicate restricting bandit arm selection to actions that preserve the survival invariant under current resource and connectivity state") %}Definition 89{% end %}). No exploratory arms are evaluated.

6. **Exit criteria (all three must clear)**:
   - \\(B(t) \geq B_{\text{nominal}}\\) (battery recovers to nominal)
   - Partition ends: \\(C(t) \neq \text{DENIED}\\)
   - {% katex() %}\delta_{\text{HLC}}(t) \leq \delta_{\text{max}} / 2{% end %} (drift falls to half the tolerance threshold — hysteresis prevents oscillation)

   **Clock synchronization guard**: Exit condition is evaluated only after clock synchronization has been re-established (Step 4 completion). A node in Step 3 (clock isolation) cannot evaluate or satisfy the Step 6 exit criterion until sync recovery. The {% katex() %}\delta_{\text{HLC}}(t) \leq \delta_{\text{max}} / 2{% end %} criterion is therefore gated on Step 4 completion and cannot be satisfied while HLC advancement remains frozen.

   If any exit criterion cannot be evaluated within \\(W_{\text{max}}\\) due to resource exhaustion (step 4), the system remains in composed-failure mode and re-evaluates at next available tick. This guarantees no stuck state under the assumption that \\(B(t)\\) eventually recovers or the L0 physical interlock activates in step 1.

*In practice, this means: when a node simultaneously runs low on power, loses the network, and loses clock synchronization, the framework does not attempt to resolve all three at once. It resolves them in a fixed priority order — hardware safety first, then software survival floor, then clock isolation, then resource triage — and applies a conservative safe-action default until all three exit conditions clear.*

**Cascade depth limit**: to prevent the protocol from consuming the entire compute budget in a single MAPE-K tick, the maximum cascade depth within one evaluation window is \\(d_{\max}^{\text{cascade}} = 3\\) tiers. If a fourth tier requires evaluation, it is deferred to the next tick and flagged as a pending escalation. This circuit breaker ensures the autonomic overhead paradox ({% term(url="@/blog/2026-01-29/index.md#prop-35", def="Autonomic Overhead Paradox: at extreme resource pressure, the autonomic stack consumes more power than the benefit it delivers — the system is self-optimizing itself into exhaustion") %}Proposition 35{% end %}) cannot manifest as a compute-exhaustion stuck state.

---

## Closing: The Autonomic Edge

> **Problem**: Six posts have built the formal foundations for autonomic edge architecture. The question is what they establish as a unified system — and whether the RAVEN swarm that emerged from this series is actually different from the one that would have been built without it.
> **Solution**: The series answers the six foundational questions in the order they must be answered: what the system becomes under partition, what it knows about itself when isolated, what it does with that knowledge, how isolated peers stay coherent, how it improves from disconnection, and in what order all of this must be built. The RAVEN swarm that answers all six is architecturally different from one that answers two.
> **Trade-off**: The depth of formal grounding comes at a cost: each capability requires more upfront investment than the expedient alternative. A system with hard-coded healing rules and manual reconciliation can be built faster. The constraint sequence argument is that this expedient system will fail in the field in ways that are expensive and slow to diagnose, while the formally grounded system fails in ways that are detectable, bounded, and recoverable.

We return to where we began: the assertion that edge is not cloud minus bandwidth.

This series has developed what that difference means in practice:

**[Contested connectivity](@/blog/2026-01-15/index.md)** established the fundamental inversion: disconnection is the default; connectivity is the opportunity. The connectivity probability model \\(C(t)\\) quantifies this inversion. The capability hierarchy (L0-L4) shows how systems must degrade gracefully across connectivity states.

**[Self-measurement](@/blog/2026-01-22/index.md)** showed how to measure health without central observability. The observability {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} (P0-P4) prioritizes what to measure first. {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %}-based health propagation maintains awareness across the fleet. Staleness bounds quantify confidence decay.

**[Self-healing](@/blog/2026-01-29/index.md)** showed how to heal without human escalation {{ cite(ref="3", title="Salehie & Tahvildari (2009) — Self-Adaptive Software: Landscape and Research Challenges") }}. {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} adapted for edge autonomy. Recovery ordering prevents cascade failures. Healing severity matches detection confidence.

**[Fleet coherence](@/blog/2026-02-05/index.md)** showed how to maintain coherence under partition. {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s and merge functions for state reconciliation. Hierarchical decision authority for autonomous decisions. Conflict resolution for irreconcilable differences.

**[{% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %}](@/blog/2026-02-12/index.md)** showed how to improve from stress rather than merely survive it. {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %} metrics quantify improvement. Stress as information source. The {% term(url="@/blog/2026-02-12/index.md#def-91", def="Time window J over which the system evaluates stress outcomes before adapting; shorter J enables faster adaptation but higher variance in parameter estimates") %}judgment horizon{% end %} separates automated from human decisions.

**The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %}** integrates these capabilities into a buildable sequence. The {% term(url="#def-93", def="Dependency graph where an edge A→B means capability A must be substantially solved before B can become binding; valid implementation sequences follow topological order through this graph") %}prerequisite graph{% end %}. Constraint migration. The meta-constraint of optimization overhead. The formal validation framework for systematic verification.

### The Goal

The goal is not perfection. Perfection is unachievable in contested environments. The goal is **{% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}**: systems that improve from stress {{ cite(ref="16", title="Taleb (2012) — Antifragile: Things That Gain From Disorder") }}.

An {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} edge system:
- Detects when its models fail
- Learns from operational experience
- Improves its predictions with each stress event
- Knows when to defer to human judgment
- Emerges from each challenge better calibrated for the next

### The Final Insight

> *The best edge systems are designed for the world as it is, not as we wish it were.*

Connectivity is contested. Partition is normal. Autonomy is mandatory. Resources are constrained. Adversaries adapt.

These are not problems to be solved—they are constraints to be designed around. The edge architect who accepts these constraints, rather than wishing them away, builds systems that thrive in their environment.

The {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm that loses connectivity doesn't panic. It was designed for this. Each drone measures itself. Clusters coordinate locally. The swarm maintains mission capability at L2 while partitioned. When connectivity returns, state reconciles automatically. And through the stress of partition, the swarm learns—emerging better calibrated for the next disconnection.

This is autonomic edge architecture.

---

## Related Work

The constraint sequence and handover boundary framework developed in this series builds on four bodies of literature, adapting each to the contested edge context where disconnection is the default operating condition.

**Autonomic computing and self-adaptive systems.** The MAPE-K autonomic control loop — Monitor, Analyze, Plan, Execute over a shared Knowledge base — was formalized by Kephart and Chess {{ cite(ref="1", title="Kephart & Chess (2003) — The Vision of Autonomic Computing") }} and elaborated in IBM's architectural blueprint {{ cite(ref="2", title="IBM Research (2006) — Architectural Blueprint for Autonomic Computing") }}. Huebscher and McCann {{ cite(ref="17", title="Huebscher & McCann (2008) — A Survey of Autonomic Computing") }} surveyed the degrees and models of autonomic behavior, while Salehie and Tahvildari {{ cite(ref="3", title="Salehie & Tahvildari (2009) — Self-Adaptive Software: Landscape and Research Challenges") }} characterized the landscape of self-adaptive software and its research challenges. This series extends that work to the edge context, adding three elements absent from cloud-centric formulations: connectivity-state-dependent phase gates, constraint migration under adversarial conditions, and resource-ceiling bounds for autonomic overhead. The constraint sequence ({% term(url="#def-92", def="Constraint Sequence: ordered list of autonomic capabilities that must be activated in prerequisite order; violation of ordering creates unstable composed systems") %}Definition 92{% end %}) and prerequisite graph ({% term(url="#def-93", def="Prerequisite Graph: DAG encoding capability dependencies; an edge A to B means A must be validated before B can be safely activated") %}Definition 93{% end %}) provide a formal sequencing substrate that the original autonomic computing vision left implicit.

**Cyber-physical systems and safety-critical control.** Lee {{ cite(ref="4", title="Lee (2008) — Cyber Physical Systems: Design Challenges") }} identified the design challenges that arise when computation must be embedded in and interact with physical processes — timing, reliability, and the impossibility of treating physical dynamics as independent of software correctness. The L0 Physical Safety Interlock ({% term(url="#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}) and Control Barrier Function gain scheduler ({% term(url="@/blog/2026-01-29/index.md#def-40", def="CBF Gain Scheduler: maps the stability margin to a derated gain value at or below the maximum, maintaining the safety condition at each mode boundary") %}Definition 40{% end %}) are direct instantiations of this requirement: hardware-enforced safety boundaries that the software stack cannot override, and mathematically certified stability margins {{ cite(ref="14", title="Ames et al. (2017) — Control Barrier Function Based Quadratic Programs") }} that bound the MAPE-K loop's actuation authority. The Avizienis et al. dependability taxonomy {{ cite(ref="7", title="Avizienis et al. (2004) — Basic Concepts and Taxonomy of Dependable Computing") }} provides the fault-failure-error classification that underlies the healing severity ordering ({% term(url="@/blog/2026-01-29/index.md#def-44", def="Healing Action Severity: ordinal scale classifying healing actions by resource cost and mission disruption, used to select minimum-impact interventions first") %}Definition 44{% end %}) and the Minimum Viable System predicate ({% term(url="@/blog/2026-01-29/index.md#def-50", def="Minimum Viable System (MVS): minimal subset of subsystems that must remain operational to execute the core mission at reduced capability") %}Definition 50{% end %}).

**Edge computing orchestration and handover.** Satyanarayanan {{ cite(ref="5", title="Satyanarayanan (2017) — The Emergence of Edge Computing") }} characterized the emergence of edge computing as a paradigm distinct from the cloud, and Shi et al. surveyed its vision and challenges; the ETSI MEC reference architecture {{ cite(ref="6", title="ETSI GS MEC 003 (2019) — MEC Framework and Reference Architecture") }} standardized the framework for multi-access edge computing. The constraint sequence framework adapts these orchestration models to contested environments where connectivity is not a service-level assumption but a Weibull-distributed stochastic variable. The predictive handover criterion ({% term(url="#prop-74", def="Predictive Handover Criterion: edge node should initiate autonomous-mode handover when the partition accumulator exceeds the 95th-percentile partition duration") %}Proposition 74{% end %}), the causal barrier ({% term(url="#def-106", def="Causal Barrier: synchronization point preventing capability escalation until all causally prior operations have been acknowledged by the required quorum") %}Definition 106{% end %}), and the state-delta briefing protocol ({% term(url="#def-109", def="State-Delta Briefing Protocol: structured handover message containing only the state delta since last sync, minimizing reconnection bandwidth cost") %}Definition 109{% end %}) address the human-machine boundary problem that standard MEC orchestration leaves to deployment policy. The CAP theorem context {{ cite(ref="10", title="Brewer (2000) — Towards Robust Distributed Systems") }} motivates the CRDT-based state reconciliation ({% term(url="@/blog/2026-02-05/index.md#def-58", def="CRDT (Conflict-free Replicated Data Type): data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}Definition 58{% end %}, Phase 3 gate) as the only approach compatible with partition-tolerant consistency.

**Resilience engineering and chaos testing.** Taleb's anti-fragility concept {{ cite(ref="16", title="Taleb (2012) — Antifragile: Things That Gain From Disorder") }} — that some systems gain from disorder rather than merely tolerating it — is operationalized here as a testable engineering property ({% term(url="@/blog/2026-02-12/index.md#def-79", def="Anti-Fragility: system property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}Definition 79{% end %}) with a measurable coefficient {% katex() %}\mathbb{A} = (P_1 - P_0)/\sigma{% end %}. The Field Autonomic Certification checklist ({% term(url="#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %}) applies chaos engineering principles {{ cite(ref="11", title="Basiri et al. (2016) — Chaos Engineering") }} — systematic fault injection, partition cycling, and adversarial stress — as the formal validation methodology for the phase gate framework. The Byzantine fault model {{ cite(ref="12", title="Lamport, Shostak & Pease (1982) — The Byzantine Generals Problem") }} underpins the peer-validation layer ({% term(url="@/blog/2026-02-05/index.md#def-64", def="Peer-Validation Layer: gossip mechanism where nodes cross-check state updates to detect and reject Byzantine insertions without central authority") %}Definition 64{% end %}) and the logical quorum ({% term(url="@/blog/2026-02-05/index.md#def-66", def="Logical Quorum for High-Stakes Decisions: quorum based on authority tiers rather than node count, ensuring decisions require sufficient organizational authority") %}Definition 66{% end %}) — extending classical Byzantine tolerance to edge systems where adversarial presence is a continuous variable rather than a binary condition.

---

### Optimal Sequencing

The {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} corresponds to a topological sort of the {% term(url="#def-93", def="Dependency graph where an edge A→B means capability A must be substantially solved before B can become binding; valid implementation sequences follow topological order through this graph") %}prerequisite graph{% end %}. Valid sequences satisfy {% katex() %}(u, v) \in E \Rightarrow \sigma(u) < \sigma(v){% end %}—prerequisites before dependents. Optimal sequences minimize weighted position {% katex() %}\sum_v w_v \cdot \sigma(v){% end %}, placing high-priority capabilities early.

Resource allocation at optimum equalizes marginal values across functions:

{% katex(block=true) %}
\frac{\partial V_{\text{mission}}}{\partial R_{\text{mission}}} = \frac{\partial V_m}{\partial R_m} = \frac{\partial V_h}{\partial R_h} = \frac{\partial V_c}{\partial R_c} = \zeta
{% end %}

This Lagrangian condition ensures no reallocation can improve total value. The optimal allocation is interior — neither {% katex() %}R_{\text{autonomic}} = 0{% end %} (pure mission) nor {% katex() %}R_{\text{autonomic}} = R_{\text{total}}{% end %} (pure autonomy). Both contribute positive marginal mission value: measurement enables better decisions; healing reduces capability loss. The condition {% katex() %}\partial V_{\text{mission}} / \partial R_{\text{mission}} = \partial V_{\text{heal}} / \partial R_{\text{heal}} = \zeta{% end %} indicates the optimum equalizes marginal returns. Online, approximate this by reallocating toward whichever function shows higher marginal improvement per unit resource.

> **Cognitive Map**: The closing section synthesizes the six-post series into six answerable questions and the mathematical dependencies between them. The six-question structure is not rhetorical — each question maps directly to one post's formal contribution, and the order of the questions is the constraint sequence itself. The optimal sequencing result closes with the Lagrangian condition: at the resource optimum, marginal value is equalized across mission, measurement, healing, and coherence. This is the formal justification for maintaining all four functions rather than collapsing to pure mission: the optimum is always interior.

---

## Series Synthesis

The six posts in this series collectively address six structural weaknesses in naive edge deployments. The table below maps each weakness to its formal solution and the post where the solution is introduced.

<style>
#tbl_synthesis + table th:first-of-type { width: 40%; }
#tbl_synthesis + table th:nth-of-type(2) { width: 45%; }
#tbl_synthesis + table th:nth-of-type(3) { width: 15%; }
</style>
<div id="tbl_synthesis"></div>

| Weakness | Solution | Post |
| :--- | :--- | :--- |
| Stochastic partition duration | Weibull Partition Duration Model ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the CTMC in Definition 3 with a Weibull sojourn-time distribution to capture heavy-tailed partition durations") %}Definition 13{% end %}) + Weibull Circuit Breaker ({% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: fires when partition duration exceeds the P95 Weibull quantile, triggering a lower-capability safe posture") %}Proposition 37{% end %}) | [P1](@/blog/2026-01-15/index.md), [P3](@/blog/2026-01-29/index.md) |
| Autonomic resource overhead | Proposition 68 (Autonomic Overhead Bound) | [P6](@/blog/2026-02-19/index.md) |
| Clock drift under partition | Hybrid Logical Clock (Definition 61) + Drift-Quarantine Re-sync (Definition 63) | [P4](@/blog/2026-02-05/index.md) |
| Byzantine health corruption | Peer-Validation Layer (Definition 64) + Logical Quorum (Definition 66) | [P4](@/blog/2026-02-05/index.md) |
| Multi-failure cascade dead-ends | Terminal Safety State (Definition 53) + Hardware Veto (Proposition 32) | [P3](@/blog/2026-01-29/index.md) |
| Handover boundary complexity | Constraint Sequence (Definition 92) + Phase Gate Function (Definition 103) | [P6](@/blog/2026-02-19/index.md) |

**SCALEFAST scenario**: A cloud-to-edge migration project using this framework applies the constraint sequence in reverse: capabilities built for the cloud-native environment must be re-validated against the edge prerequisite graph. The Weibull circuit breaker ({% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %}) fires during SCALEFAST migration testing when the new edge nodes encounter partition durations that the cloud-native codebase was never designed for — the FAC checklist ({% term(url="#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %}, items C8–C10) identifies these gaps before production deployment.

---

## Series Conclusion

> **Problem**: A six-post series has covered hundreds of formal definitions, propositions, and mechanisms. The risk is that the formal machinery obscures the answer to the engineer's actual question: what do I build differently?
> **Solution**: Six questions, answerable without a network connection, that distinguish an autonomic edge system from a cloud system that tolerates occasional disconnection. Most edge architectures answer zero or one of them. The series answers all six, in the order the mathematics requires.
> **Trade-off**: The depth of the formal foundations requires upfront investment that a less rigorous approach skips. The constraint sequence argument is that the skipped investment becomes field debt — expensive to diagnose, often irrecoverable.

At some point, every engineer who has deployed a distributed system into a contested or remote environment has gotten the call: the system is unreachable, the operator cannot intervene, and the system was never designed to operate without the operator. The fix is manual. The outage is measured in hours.

That call is a design problem, not an operations problem. The system failed not because of a bug but because the architecture assumed connectivity and had no answer for its absence — no operating mode, no healing logic, no coherence mechanism, no way to get better from the experience. When connectivity left, so did the system.

This series builds the answer, formally, in the sequence the mathematics requires.

### Six Questions No One Is Asking

There are six questions an autonomic edge system must be able to answer without a network connection. Most edge architectures answer zero or one. This series answers all six, in order, because the order is not optional.

**1. What does the system *become* when the link drops?**
Not "what does it do" — what *is* it? The {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Five-tier capability hierarchy from partition survival at the base tier to cloud-equivalent operation at the top tier") %}capability level{% end %} hierarchy (L0–L4) answers this. The {% term(url="@/blog/2026-01-15/index.md#def-5", def="Continuous value between zero and one representing the current fraction of nominal bandwidth available; zero means fully denied, one means full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} \\(C(t)\\) is a Markov process across four {% term(url="@/blog/2026-01-15/index.md#def-6", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regimes{% end %}; Denied is a legitimate steady state, not a failure code. {% term(url="@/blog/2026-01-15/index.md#prop-2", def="Inversion Threshold: partition-first architecture yields higher expected utility than cloud-native patterns when the disconnection probability exceeds the threshold") %}Proposition 2{% end %} establishes the {% term(url="@/blog/2026-01-15/index.md#prop-2", def="The connectivity level below which distributed autonomy outperforms cloud control") %}inversion threshold{% end %} \\(\tau^\*\\): below it, distributed autonomy strictly dominates cloud control on every operational metric. For contested and industrial deployments, \\(C(t) < \tau^\*\\) is the routine condition. The design target is partition, not connection.

**2. What does the system know about itself when isolated?**
A node cut off from central telemetry must self-measure or it is blind. Local {% term(url="@/blog/2026-01-22/index.md#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} runs at \\(O(1)\\) per observation — no uplink, no central service. {% term(url="@/blog/2026-01-22/index.md#def-24", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}Gossip protocols{% end %} converge fleet health state in \\(O(\ln n / \lambda)\\) rounds across any partial mesh — roughly the same for 500 nodes as for 50. The {% term(url="@/blog/2026-01-22/index.md#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} bound {% katex() %}\tau_{\max}{% end %} tells the system when observations are too old to act on. {% term(url="@/blog/2026-01-22/index.md#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine{% end %}-tolerant aggregation handles adversarial nodes without assuming honesty. A fleet of hundreds maintains accurate situational awareness indefinitely.

**3. What does the system do with what it knows?**
Detection without action is an alarm system. The {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} autonomic loop closes the detect-decide-act cycle. {% term(url="@/blog/2026-01-29/index.md#def-44", def="Ordered classification of recovery actions (config tweak, service restart, failover, full reset); higher severity requires higher detection confidence before the MAPE-K loop will trigger it") %}Healing severity{% end %} ordering ensures the smallest effective intervention is tried first. The {% term(url="@/blog/2026-01-29/index.md#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm's priority boundary — these components are repaired first") %}minimum viable system{% end %} defines the floor that recovery must defend. {% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} proves the loop converges — it does not oscillate, it does not cascade, it stabilizes.

**4. How do isolated peers stay coherent?**
Partition events are not consistency violations. They are information events. {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDTs{% end %} — data structures with commutative, associative, idempotent merge semantics — mean that when partitioned clusters reconnect, states merge deterministically: no coordinator, no consensus round, no lost writes. {% term(url="@/blog/2026-02-05/index.md#def-60", def="Per-node logical counters tracking causal order of events; if neither node's vector dominates the other, the events are concurrent and require merge resolution rather than simple ordering") %}Vector clocks{% end %} distinguish causality from coincidence when no global clock exists. {% term(url="@/blog/2026-02-05/index.md#def-57", def="Normalized [0,1] measure of how far a node's local state has drifted from fleet consensus; above threshold it triggers CRDT reconciliation to re-establish coherence across the fleet") %}State divergence{% end %} is bounded and measurable. The {% term(url="@/blog/2026-02-05/index.md#def-68", def="Level in the decision hierarchy (node, cluster, fleet, command); determines which decisions a node makes autonomously versus escalates when connectivity to higher tiers is lost") %}authority tier{% end %} hierarchy escalates what local logic cannot resolve.

**5. How does the system get better from being disconnected?**
A system that merely recovers returns to baseline. {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %} — \\(d^2P/d\sigma^2 > 0\\) — is a testable engineering property: the performance-stress curve is convex. {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} bandit algorithms update operational parameters from each partition event; stress events calibrate the system's model of its own environment. The {% term(url="@/blog/2026-02-12/index.md#def-91", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} {% katex() %}\mathcal{J}{% end %} bounds what is automated: decisions irreversible at fleet scale, legally consequential, or outside the training distribution route to human authority. That boundary is not timidity — it is what makes the automation deployable in environments where wrong decisions have consequences.

**6. In what order must this be built?**
The five answers above form a strict dependency chain that cannot be reordered. Self-measurement precedes self-healing — you cannot repair what you cannot observe. Self-healing precedes fleet coherence — unreliable nodes cannot sustain distributed consensus. Fleet coherence precedes {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}anti-fragile{% end %} learning — you cannot learn from partition events that corrupt your state. The {% term(url="#def-93", def="Dependency graph where an edge A→B means capability A must be substantially solved before B can become binding; valid implementation sequences follow topological order through this graph") %}prerequisite graph{% end %} encodes this formally; the {% term(url="#def-92", def="Ordered list of autonomic capabilities where each must be substantially solved before the next becomes the binding constraint; sequence is valid only when it follows the prerequisite graph's topological order") %}constraint sequence{% end %} is any topological ordering of that graph. The {% term(url="#def-94", def="When the connectivity regime changes, the binding capability shifts — what was optional becomes critical, and what was critical becomes achievable; the engineering priority order re-ranks accordingly") %}constraint migration{% end %} result adds that the binding constraint shifts with \\(C(t)\\) — what limits the system at \\(C(t) = 0.8\\) differs from what limits it at \\(C(t) = 0.1\\). {% term(url="#def-103", def="Checkpoint where three conditions must ALL hold before advancing to the next capability: ROI on the current constraint below 3x, 95% of its theoretical ceiling reached, and the next constraint measurably binding") %}Phase gates{% end %} enforce formal validation at each transition. Skipping a layer is not a schedule decision. It is a correctness error.

### What Changes in the Next Design

Three practices change when an engineer internalizes this framework:

**Design the disconnected system first.** Before the connected architecture, sketch what the system does when fully isolated. The isolated case, if not in the design from day one, cannot be retrofitted without rebuilding the foundation. The connected case is easier to add to a system designed for partition than the reverse.

**Choose data structures by their merge semantics.** Before selecting a store or cache, ask one question: when two partitioned instances of this data reconnect, what is the merge rule? If the answer is "we figure it out at reconciliation time," there is no coherence design yet — only a hope. {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDTs{% end %} with commutative, associative, idempotent merge functions make reconciliation an algebraic property of the data structure, not an operational emergency.

**Define the {% term(url="@/blog/2026-02-12/index.md#def-91", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} before the automation boundary.** Which decisions can the system make autonomously? Which must escalate regardless of capability? This is an architectural decision, not an operational policy. Systems that leave it undefined will draw the line under stress, in production, with no time to deliberate. Systems that define it explicitly are the ones that get deployed into consequential environments.

### The Swarm Was Never Waiting for the Network

[Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) opens with forty-seven {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} drones losing backhaul without warning. They do not wait. They do not retry. Each drone runs local {% term(url="@/blog/2026-01-22/index.md#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %}. Sub-clusters propagate health via {% term(url="@/blog/2026-01-22/index.md#def-24", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %}. The {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop executes recovery. {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} merge handles reconciliation when connectivity returns. Bandit algorithms update from partition data. Decisions above the {% term(url="@/blog/2026-02-12/index.md#def-91", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} route to the operator. The {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Five-tier capability hierarchy from partition survival at the base tier to cloud-equivalent operation at the top tier") %}capability level{% end %} descends and ascends without human intervention.

Six parts later, there is a formal proof for every step of that sequence.

The swarm does not survive partition because it is fault-tolerant. Fault tolerance is reactive — it recovers from conditions it was not designed for. The swarm survives because partition was the design target. There is a difference between a system that handles disconnection and a system that was built for it. The first surprises you at 3am. The second does not surprise anyone, because it was never surprised itself.

The engineer who built the second system is asleep. The system is handling it.

---

## References

<span id="ref-1"></span>
[1] Kephart, J.O., Chess, D.M. (2003). "The Vision of Autonomic Computing." *IEEE Computer*, 36(1), 41–50. [[doi]](https://doi.org/10.1109/MC.2003.1160055)

<span id="ref-2"></span>
[2] IBM Research (2006). "An Architectural Blueprint for Autonomic Computing." IBM White Paper, 4th Ed.

<span id="ref-3"></span>
[3] Salehie, M., Tahvildari, L. (2009). "Self-Adaptive Software: Landscape and Research Challenges." *ACM Trans. Autonomous and Adaptive Systems*, 4(2), Article 14. [[doi]](https://doi.org/10.1145/1516533.1516538)

<span id="ref-4"></span>
[4] Lee, E.A. (2008). "Cyber Physical Systems: Design Challenges." *Proc. ISORC*, 363–369. IEEE. [[doi]](https://doi.org/10.1109/ISORC.2008.25)

<span id="ref-5"></span>
[5] Satyanarayanan, M. (2017). "The Emergence of Edge Computing." *IEEE Computer*, 50(1), 30–39. [[doi]](https://doi.org/10.1109/MC.2017.9)

<span id="ref-6"></span>
[6] ETSI GS MEC 003 V2.1.1 (2019). "Multi-access Edge Computing (MEC): Framework and Reference Architecture." ETSI. [[pdf]](https://www.etsi.org/deliver/etsi_gs/MEC/001_099/003/02.01.01_60/gs_MEC003v020101p.pdf)

<span id="ref-7"></span>
[7] Avizienis, A., Laprie, J.-C., Randell, B., Landwehr, C. (2004). "Basic Concepts and Taxonomy of Dependable and Secure Computing." *IEEE Transactions on Dependable and Secure Computing*, 1(1), 11–81. [[doi]](https://doi.org/10.1109/TDSC.2004.2)

<span id="ref-8"></span>
[8] Bass, L., Clements, P., Kazman, R. (2012). *Software Architecture in Practice*, 3rd ed. Addison-Wesley.

<span id="ref-9"></span>
[9] Shapiro, M., Preguiça, N., Baquero, C., Zawirski, M. (2011). "Conflict-Free Replicated Data Types." *Proc. SSS*, LNCS 6976, 386–400. Springer. [[doi]](https://doi.org/10.1007/978-3-642-24550-3_29)

<span id="ref-10"></span>
[10] Brewer, E.A. (2000). "Towards Robust Distributed Systems." *Proc. PODC*. ACM. [[acm]](https://dl.acm.org/doi/10.1145/343477.343502)

<span id="ref-11"></span>
[11] Basiri, A., Behnam, N., de Rooij, R., Hochstein, L., Kosewski, L., Reynolds, J., Rosenthal, C. (2016). "Chaos Engineering." *IEEE Software*, 33(3), 35–62. [[doi]](https://doi.org/10.1109/MS.2016.60)

<span id="ref-12"></span>
[12] Lamport, L., Shostak, R., Pease, M. (1982). "The Byzantine Generals Problem." *ACM Trans. Programming Languages and Systems*, 4(3), 382–401. [[doi]](https://doi.org/10.1145/357172.357176)

<span id="ref-13"></span>
[13] Kulkarni, S.S., Demirbas, M., Madeppa, D., Avva, B., Leone, M. (2014). "Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases." *Proc. OPODIS*, 17–80. [[doi]](https://doi.org/10.1007/978-3-319-14472-6_2)

<span id="ref-14"></span>
[14] Ames, A.D., Xu, X., Grizzle, J.W., Tabuada, P. (2017). "Control Barrier Function Based Quadratic Programs for Safety Critical Systems." *IEEE Transactions on Automatic Control*, 62(8), 3861–3876. [[doi]](https://doi.org/10.1109/TAC.2016.2638961)

<span id="ref-15"></span>
[15] Miller, G.A. (1956). "The Magical Number Seven, Plus or Minus Two." *Psychological Review*, 63(2), 81–83. [[doi]](https://doi.org/10.1037/h0043158)

<span id="ref-16"></span>
[16] Taleb, N.N. (2012). *Antifragile: Things That Gain From Disorder*. Random House.

<span id="ref-17"></span>
[17] Huebscher, M.C., McCann, J.A. (2008). "A Survey of Autonomic Computing — Degrees, Models, and Applications." *ACM Computing Surveys*, 40(3), Article 7. [[doi]](https://doi.org/10.1145/1380584.1380585)
