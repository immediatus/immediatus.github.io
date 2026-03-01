+++
authors = ["Yuriy Polyulya"]
title = "Why Edge Is Not Cloud Minus Bandwidth"
description = "At the edge, a radio transmission costs 100x more energy than a local computation, and the network may be unreachable for hours. This article builds the formal foundation: how to model contested connectivity with Markov chains, when local autonomy mathematically beats cloud control, and what keeps autonomous control loops stable when they can't phone home."
date = 2026-01-15
slug = "autonomic-edge-part1-contested-connectivity"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "system-design", "optimization"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 1
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Edge systems can't treat disconnection as an exceptional error — it's the default condition. This series builds the formal foundations for systems that self-measure, self-heal, and improve under stress without human intervention, grounded in control theory, Markov models, and CRDT state reconciliation. Every quantitative claim comes with an explicit assumption set."""
info = """This series targets engineers building systems where connectivity cannot be guaranteed: tactical military platforms, remote industrial operations, autonomous mining fleets, smart grid substations, disaster response networks, and autonomous vehicle fleets. The mathematical frameworks - optimization theory, Markov processes, queueing theory, control systems - apply wherever systems must make autonomous decisions under uncertainty. Each part builds toward a unified theory of autonomic edge architecture: self-measuring, self-healing, self-optimizing systems that improve under stress rather than merely survive it."""
+++

<span id="scenario-raven"></span>

The {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} monitoring swarm - forty-seven autonomous drones maintaining coordinated surveillance over a 12-kilometer grid - loses backhaul connectivity without warning. The satellite link drops. One moment the swarm streams 2.4 gigabits of sensor data to operations; the next, forty-seven nodes face a decision cloud-native systems never confront: *What do we do when no one is listening?*

The swarm's behavioral envelope was designed for brief interruptions - thirty seconds, maybe sixty. The jamming shows no sign of clearing. Mission remains: maintain surveillance, detect threats, report findings.

Continue the patrol pattern? Contract formation? Break off a subset to seek connectivity at altitude? And critically: who decides? Leadership was an emergent property of connectivity. Now everyone has link quality zero.

Partition is the baseline operating state, not an exception to handle.

---

## Overview

This article establishes the formal framework for contested connectivity. Each concept integrates theory with design consequence:

| Concept | Formal Contribution | Design Consequence |
| :--- | :--- | :--- |
| **Inversion Thesis** | Threshold \\(P(C = 0) > 0.15\\) marks cloud pattern failure | Design for disconnection as baseline |
| **Connectivity Model** | Continuous-time Markov chain over regimes | Size buffers and timeouts from stationary distribution |
| **Capability Coupling** | \\(\mathbb{E}[\text{Cap}] = \sum_i P(C \geq \theta_i) \cdot \Delta V_i\\) | Place thresholds in distribution tails |
| **Coordination Crossover** | Distributed dominates when \\(\pi_{\mathcal{C}} + \pi_{\mathcal{D}} < 0.8\\) | Choose coordination mode from regime distribution |
| **Constraint Sequence** | Prerequisite graph \\(G = (V, E)\\) over capabilities | Build survival before optimization |

This framework extends [partition-tolerant systems](https://users.ece.cmu.edu/~adrian/731-sp04/readings/GL-cap.pdf), [delay-tolerant networking](https://www.rfc-editor.org/rfc/rfc4838), and [autonomic computing](https://ieeexplore.ieee.org/document/1160055) for contested environments where adversarial interference compounds natural connectivity challenges.

---

## Epistemic Positioning and Methodology

### Nature of Claims

<span id="def-0"></span>
**Definition 0** (Framework Scope). *The scope of this framework is:*

The set \\(\mathcal{S}\\) below enumerates the three modes of inference this framework employs; every claim in the series is produced by one of these three operations.

{% katex(block=true) %}
\mathcal{S} = \{\text{formal reasoning}, \text{constraint modeling}, \text{engineering pattern synthesis}\}
{% end %}

### What This Framework Is

- **Theoretical**: Models are analytical constructs derived from first principles and constraint reasoning
- **Architectural**: The output is design patterns and structural relationships, not performance predictions
- **Deductive**: Conclusions follow from stated assumptions via logical implication
- **Prescriptive**: Given assumptions \\(\mathcal{A}\\), the framework prescribes mechanisms \\(\mathcal{M}\\) such that \\(\mathcal{A} \Rightarrow \mathcal{M}\\) satisfies objectives \\(\mathcal{O}\\)

### What This Framework Is Not

- **Empirically validated**: No experimental measurements validate the quantitative claims
- **Predictive**: Specific numeric outcomes (latencies, success rates) are illustrative, not forecasts
- **Universal**: Conclusions hold only within stated assumption sets \\(\mathcal{A}_i\\)
- **Prescriptive for all contexts**: Applicability requires verifying that deployment conditions satisfy \\(\mathcal{A}_i\\)

### Methodological Principles

**Principle 1** (Assumption Explicitness). *Every mechanism \\(M\\) is paired with an assumption set \\(\mathcal{A}_M\\). The validity of \\(M\\) is conditional on \\(\mathcal{A}_M\\) holding in the deployment context.*

**Principle 2** (Derivation from Constraints). *Mechanisms are not chosen arbitrarily but derived as logical consequences of constraints. If constraint \\(c\\) implies mechanism \\(m\\), we write \\(c \vdash m\\).*

**Principle 3** (Architectural Coherence over Empirical Benchmarking). *The primary goal is internal consistency of the architectural framework - that mechanisms compose correctly and satisfy stated objectives - not comparison against measured baselines.*

### Interpretation of Quantitative Elements

Throughout this series, quantitative elements appear in three forms:

| Element Type | Interpretation | Example |
| :--- | :--- | :--- |
| **Bounds** | Theoretical limits derived from model structure | \\(O(\sqrt{T \ln T})\\) regret |
| **Thresholds** | Decision boundaries derived from cost analysis | \\(\theta^* = C_{FP}/(C_{FP} + C_{FN})\\) |
| **Illustrations** | Concrete numbers for pedagogical clarity | "3-5 observations" for detection |

Illustrations are not claims about real-world performance. They demonstrate how the framework applies under specific parameter choices.

### Relationship to Practice

This framework provides **architectural templates** and **reasoning patterns** for practitioners. Implementation requires:

1. **Assumption verification**: Does the deployment context satisfy \\(\mathcal{A}_i\\)?
2. **Parameter instantiation**: What are the concrete values for \\(\theta, \tau, \lambda, \ldots\\) in this context?
3. **Empirical validation**: Does the implemented system achieve acceptable performance?

### Notation for Conditional Claims

Throughout the series, we use the following notation for conditional claims:

The expression below reads: "under the listed assumptions, property \\(P\\) holds" — making explicit that every conclusion is logically implied by stated assumptions, not validated by experiment.

{% katex(block=true) %}
\mathcal{A} \vdash P \quad \text{means} \quad \text{"under assumptions } \mathcal{A}, \text{ property } P \text{ holds"}
{% end %}

---

## Formal Foundations

System state evolves under connectivity uncertainty. Core notation first; detailed treatment follows.

### Core State Variables

Five quantities fully describe an edge node's operational state at any instant. All other framework parameters derive from these.

| Variable | Range | What it measures | Why it matters |
| :--- | :--- | :--- | :--- |
| \\(C(t)\\) — link quality | 0 = disconnected, 1 = full capacity | Fraction of nominal link capacity currently available. At \\(C=0\\) no bits flow; at \\(C=1\\) full datarate is available. | Gates which capability level is achievable; determines the operating regime |
| \\(\Xi(t)\\) — operating regime | Connected (\\(\mathcal{C}\\)), Degraded (\\(\mathcal{D}\\)), Intermittent (\\(\mathcal{I}\\)), None (\\(\mathcal{N}\\)) | Discrete label derived from \\(C(t)\\) thresholds. Each regime activates different protocols, timeouts, and consensus rules — the RAVEN swarm runs four distinct behavioral envelopes based on this variable alone. | Selects which coordination and synchronization behaviors are active |
| \\(\mathcal{L}(t)\\) — capability level | 0 = survival-only, 4 = full optimization | Integer tier of service the node currently delivers. \\(\mathcal{L}_0\\): basic sensing and local storage only. \\(\mathcal{L}_4\\): full coordinated learning across the fleet. | Determines which functions are available; degrades gracefully as \\(C(t)\\) drops |
| \\(\mathbf{H}(t)\\) — health vector | One score per subsystem, each in \\([0,1]\\) where 0 = failed, 1 = nominal | Per-subsystem health across \\(n\\) monitored components. For RAVEN with \\(n=6\\) subsystems, a vector like \\([0.9, 0.3, 1.0, \ldots]\\) immediately flags the second subsystem as critically degraded. | Primary input to anomaly detection; triggers self-healing actions |
| \\(D(t)\\) — state divergence | 0 = in sync with fleet, 1 = fully isolated state | How far this node's local state has drifted from fleet consensus during a disconnection. High \\(D\\) at reconnection means expensive reconciliation — the cost the system pays for operating autonomously. | Determines reconciliation priority and cost when connectivity resumes |
| \\(R(t)\\) — resource availability | \\([0, 1]\\) | Resource availability (normalized composite of battery SOC, free memory, and idle CPU); formal weighted definition in Part 3 Definition 47 / Part 6 Definition 19b. Critical threshold: \\(R_{\text{crit}} \approx 0.2\\). | Bounds achievable capability level; triggers graceful degradation when resources are critically low |

Part 6 uses 'Denied' for \\(0 < C \leq 0.3\\) and 'Emergency' for \\(C = 0\\) as an illustrative simplification of the Intermittent/None boundary; the authoritative label for complete disconnection remains \\(\mathcal{N}\\) (None) as defined here.

### Notation Legend

Each symbol that appears in more than one role across the series is listed below, with the subscript or context that disambiguates it.

| Symbol | Meaning | Notes |
| :--- | :--- | :--- |
| \\(\mathcal{A}_x\\) | Assumption set — subscript names the scenario | Also used for authority tier, anti-fragility coefficient, and action space in later articles; subscript always disambiguates |
| \\(\mathcal{Q}_j\\) | Authority tier — Node (0), Cluster (1), Fleet (2), Command (3) | Numeric subscript selects level; text variant \\(\mathcal{Q}_{\text{delegated}}\\) |
| \\(\mathbb{A}\\) | Anti-fragility coefficient \\((P_1 - P_0)/\sigma\\) — scalar | Double-struck A; distinct from assumption set \\(\mathcal{A}\\) |
| \\(\mathcal{U}\\) | Action or control space in optimization | Domain of optimization: \\(a \in \mathcal{U}\\) |
| \\(\Gamma\\) | Constraint set of all deployment constraints | Appears as \\(c \in \Gamma\\) and \\(\sigma: \Gamma \to \mathbb{N}\\) |
| \\(\mathcal{C}\\) | Connected regime — highest connectivity state | Also: constraint set in Part 6; context selects; regime tuple \\(\mathcal{C}, \mathcal{D}, \mathcal{I}, \mathcal{N}\\) |
| \\(E\\) | Edge-ness Score \\(\in [0,1]\\) classifying deployment type | Threshold comparisons: \\(E < 0.3\\) = edge, \\(E \geq 0.6\\) = cloud |
| \\(T_d\\) | Energy per local compute decision — joules, range 10–100 \\(\mu\text{J}\\) | Subscript d = "decide"; never a time value |
| \\(T_s\\) | Energy per radio packet transmission — joules, range 1–10 mJ | Subscript s = "send"; \\(T_s / T_d \approx 10^2\\)–\\(10^3\\) |
| \\(\tau\\) | Loop delay \\(\tau_{\text{fb}}\\); staleness \\(\tau_{\text{stale}}\\); partition duration \\(\tau_{\text{partition}}\\); burst duration \\(\tau_{\text{burst}}\\) | Subscript selects role; bare \\(\tau\\) = \\(\tau_{\text{fb}}\\); \\(\tau^*\\) = Inversion Threshold |
| \\(\gamma\\) | Semantic convergence factor ([Def 1b](#def-1b)); age-decay rate; Holt-Winters seasonality; Byzantine reputation rates \\(\gamma_{\text{decay}}, \gamma_{\text{recover}}\\) | Bare \\(\gamma\\) = Def 1b in this article; subscript selects other roles |
| \\(\beta\\) | Reconciliation cost ([Prop 1](#prop-1)); Holt-Winters trend coefficient; bandwidth asymmetry \\(\beta = B_{\text{backhaul}}/B_{\text{local}}\\); Gamma prior rate \\(\beta_i^0\\) | Subscript or context selects meaning across articles |

### Constraint Structure

Three constraints bound all subsequent analysis: \\(B(t)\\) is available bandwidth, \\(R(t)\\) is remaining resource budget (power, compute, memory combined), \\(K\\) is control loop gain, and \\(\tau\\) is loop delay — the third constraint is the stability condition \\(K < 1/(1 + \tau/T_{\text{tick}})\\) preventing oscillation (Proposition 9, Part 3; Proposition 39 for stochastic \\(\tau\\)). Here \\(\tau\\) means \\(\tau_{\text{fb}}\\); for all four roles \\(\tau\\) plays across the series see the Notation Legend above.

{% katex(block=true) %}
\begin{aligned}
&B(t) \leq B_{\max} \cdot C(t) && \text{(bandwidth scales with connectivity)} \\
&\mathcal{L}(t) \leq f(C(t), R(t)) && \text{(capability bounded by connectivity + resources)} \\
&K < \frac{1}{1 + \tau/T_{\text{tick}}} && \text{(control loop stability; Proposition 9, Part 3; Proposition 39 for stochastic \(\tau\))}
\end{aligned}
{% end %}

A fourth constraint captures the energy asymmetry that distinguishes edge from cloud: radio transmission costs two to three orders of magnitude more energy than local computation.

{% katex(block=true) %}
T_s / T_d \gg 1 \quad \text{(radio dominates the energy budget)}
{% end %}

<span id="def-21"></span>
**Definition 21** (Energy-per-Decision Metric). *The total energy cost of decision \\(a\\) is:*

{% katex(block=true) %}
\mathcal{E}(a,\,C) = n_c(a)\cdot T_d \;+\; n_s(a,\,C)\cdot T_s
{% end %}

*where \\(n_c(a)\\) is the number of local compute cycles required, \\(n_s(a, C)\\) is the number of radio packets required (zero when \\(C = 0\\)), \\(T_d\\) is joules per compute operation, and \\(T_s\\) is joules per transmitted packet.*

This metric reframes every architectural choice as an energy budget problem. Sending one gossip packet costs the same as running \\(T_s/T_d \approx 10^3\\) local inference cycles. The system that offloads decisions to the cloud to "save compute" actually spends orders of magnitude more energy on the radio link than it saves on silicon.

<span id="prop-23"></span>
**Proposition 23** (Compute-Transmit Dominance Threshold). *Local computation is energetically dominant — cheaper than radio-assisted offloading — for any decision requiring fewer than \\(1/\rho\\) compute cycles, where \\(\rho = T_d/T_s\\):*

{% katex(block=true) %}
\mathcal{E}(a,\,C > 0) < \mathcal{E}(a,\,C = 0) \iff n_c(a) < \frac{1}{\rho} = \frac{T_s}{T_d}
{% end %}

*For \\(\rho = 10^{-3}\\) (tactical radio): any decision requiring fewer than 1,000 local compute cycles is cheaper to run locally than to transmit — even when connectivity is available.*

**Design consequence**: The inversion threshold \\(\tau^\*\\) from Proposition 1 has an energy analog. Even when \\(C(t) > \tau^*\\) and distributed autonomy does not strictly dominate cloud control on latency or capability grounds, it may still dominate on energy grounds if \\(n_c < 1/\rho\\). At the edge, physics — not just connectivity — mandates local compute.

**Illustrative hardware parameters** (order-of-magnitude estimates consistent with representative datasheets for each platform class; not measured values — calibrate \\(T_d\\) and \\(T_s\\) for the target hardware):

| System | \\(T_d\\) | \\(T_s\\) | \\(\rho\\) | Local-dominant threshold |
| :--- | :--- | :--- | :--- | :--- |
| RAVEN drone MCU | \\(50\,\mu\text{J}\\) | \\(5\,\text{mJ}\\) | \\(10^{-2}\\) | \\(<100\\) compute cycles |
| CONVOY vehicle ECU | \\(20\,\mu\text{J}\\) | \\(8\,\text{mJ}\\) | \\(2.5\times10^{-3}\\) | \\(<400\\) compute cycles |
| OUTPOST sensor node | \\(10\,\mu\text{J}\\) | \\(10\,\text{mJ}\\) | \\(10^{-3}\\) | \\(<1000\\) compute cycles |

**Detection-value extension**: Proposition 23 assumes all local computation has equivalent value per unit energy. For decision processes that prevent high-cost downstream events — anomaly detection avoiding cascading failure, intrusion detection preventing node compromise — the effective dominance threshold extends. Let \\(U_{\text{detect}}\\) denote the energy-equivalent value of a correct detection (joules of downstream cost avoided). The extended dominance condition is:

{% katex(block=true) %}
n_c < \frac{T_s + U_{\text{detect}}}{T_d}
{% end %}

For \\(U_{\text{detect}} = k \cdot T_s\\), the local-dominant region expands by factor \\((1 + k)\\):

| \\(U_{\text{detect}}\\) | RAVEN extended threshold | Design implication |
| :--- | :--- | :--- |
| \\(T_s\\) (one avoided spurious alert) | \\(n_c < 200\\) | Models up to 2x more complex are local-dominant |
| \\(5\,T_s\\) (cluster-level false positive) | \\(n_c < 600\\) | Medium-complexity models (autoencoder, small TCN) justified |
| \\(10\,T_s\\) (mission-abort cost) | \\(n_c < 1{,}100\\) | Full TCN ensemble remains energetically dominant |

Quantifying \\(U_{\text{detect}}\\) requires estimating the failure cost — the energy and mission consequence of missing an anomaly — which is system-specific. The [anomaly detection framework in Part 2](@/blog/2026-01-22/index.md) applies this extended threshold when selecting between EWMA, TCN, and ensemble models on resource-constrained edge nodes.

### Prerequisite Ordering

Capabilities form a directed acyclic graph where \\(A \prec B\\) means "\\(A\\) must be validated before \\(B\\) is useful":

{% katex(block=true) %}
\text{Hardware Trust} \prec \mathcal{L}_0 \prec \text{Self-Measurement} \prec \text{Self-Healing} \prec \text{Fleet Coherence} \prec \text{Anti-Fragility}
{% end %}

**Design consequence**: Building anti-fragility before self-healing wastes effort.

### Objective Hierarchy

The system optimizes lexicographically ordered objectives - each satisfied before the next is considered:

| Priority | Objective | Formula | Design Consequence |
| :---: | :--- | :--- | :--- |
| 1 | **Survival** | \\(\min P(\mathcal{L} \to 0)\\) | Never sacrifice L0 for higher capability |
| 2 | **Autonomy** | \\(\max \mathbb{E}[\mathcal{L} \mid \Xi = \mathcal{N}]\\) | Capability under partition drives architecture |
| 3 | **Coherence** | \\(\min \mathbb{E}[\tau_{\text{reconcile}}]\\) | Design for fast merge at reconnection |
| 4 | **Anti-fragility** | \\(\max \mathbb{A}\\) | Learn from stress; improve under adversity |

**Primary metric**: Expected integrated capability \\(\mathbb{E}[\int_0^T \mathcal{L}(t) \, dt]\\). This drives threshold placement and resource allocation.

### System Boundaries

Decision scope determines protocol complexity and partition tolerance:

| Boundary | Duration | Protocol | Partition Impact |
| :--- | :--- | :--- | :--- |
| **Node** | ms | Local state | None - fully autonomous |
| **Cluster** | sec-min | Gossip | Cluster operates independently |
| **Fleet** | min-hr | Hierarchical sync | Delegate to cluster leads |
| **Command** | hr-days | Human-in-loop | Defer or use pre-authorized bounds |

Authority tier \\(\mathcal{Q}_j\\) for \\(j \in \\{0,1,2,3\\}\\) classifies decisions by scope: \\(\mathcal{Q}_0\\) (node), \\(\mathcal{Q}_1\\) (cluster), \\(\mathcal{Q}_2\\) (fleet), \\(\mathcal{Q}_3\\) (command). Higher authority requires higher connectivity; partition triggers delegation to lower tiers with bounded autonomy.

---

<span id="term-inversion"></span>
## The Inversion Thesis

*Context*: Existing edge paradigms - fog computing (Cisco 2012, IEEE 1934-2018), mobile edge computing (ETSI MEC), and the edge-cloud continuum - assume connectivity as baseline with graceful degradation during partition. The thesis below inverts this assumption: partition as baseline, connectivity as opportunity. This positioning relative to mainstream paradigms is elaborated after the formal derivation.

Cloud architecture assumes \\(P(C = 0) < 0.01\\) and \\(\mathbb{E}[T_{\text{partition}}] < 60\\) seconds. Partition handling exists but receives minimal optimization effort.

Edge architecture operates under \\(P(C = 0) > 0.15\\) and \\(\mathbb{E}[T_{\text{partition}}] > 1800\\) seconds. Under these conditions, designing for disconnection as baseline may outperform designing for connectivity as baseline.

**Bounded claim**: The difference becomes categorical above threshold \\(\tau^*\\). Below \\(\tau^\*\\), cloud patterns may suffice.

**Assumption Set** \\(\mathcal{A}_{inv}\\):
- \\(A_1\\): Mission continues during partition (no external abort trigger)
- \\(A_2\\): Decisions have bounded latency requirement \\(T_d < \infty\\)
- \\(A_3\\): Synchronization period \\(T_s\\) is finite and \\(T_s \geq T_d\\)
- \\(A_4\\): Retry overhead \\(\rho > 0\\) on failed coordination attempts

<style>
#tbl_cloud_vs_edge + table th:first-of-type { width: 28%; }
#tbl_cloud_vs_edge + table th:nth-of-type(2) { width: 36%; }
#tbl_cloud_vs_edge + table th:nth-of-type(3) { width: 36%; }
</style>
<div id="tbl_cloud_vs_edge"></div>

The table below contrasts how cloud-native and tactical edge systems differ across eight structural assumptions, making explicit the qualitative shift that motivates the inversion thesis.

| Assumption | Cloud-Native Systems | Tactical Edge Systems |
| :--- | :--- | :--- |
| **Connectivity baseline** | Available, reliable, optimizable | Contested, intermittent, adversarial |
| **Partition frequency** | Exceptional (<0.1% of operating time)* | Normal (>50% of operating time) |
| **Latency character** | Variable but bounded | Unbounded (including \\(\infty\\)) |
| **Central coordination** | Always reachable (eventually) | May never be reachable |
| **Human operators** | Available for escalation | Cannot assume availability |
| **Decision authority** | Centralized, delegated on failure | Distributed, aggregated on connection |
| **State synchronization** | Continuous or near-continuous | Opportunistic, burst-oriented |
| **Trust model** | Network is trusted | Network is actively hostile |

*\*Based on major cloud provider SLAs (AWS, GCP, Azure) targeting 99.9%+ availability. Actual partition rates vary by region and service tier.*

<span id="def-1"></span>
**Definition 1** (Connectivity State). *The {% term(url="#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} \\(C(t): \mathbb{R}^+ \rightarrow [0,1]\\) is a right-continuous stochastic process where \\(C(t) = 1\\) denotes full connectivity, \\(C(t) = 0\\) denotes complete partition, and intermediate values represent degraded connectivity as a fraction of nominal bandwidth.* (Right-continuous means transitions occur instantaneously - when connectivity drops, the new state applies immediately without intermediate values.)

<span id="def-2"></span>
**Definition 2** (Connectivity Regime). *A system operates in the cloud regime if \\(\mathbb{E}[C(t)] > 0.95\\) and \\(P(C(t) = 0) < 0.01\\). A system operates in the contested edge regime if \\(\mathbb{E}[C(t)] < 0.5\\) and \\(P(C(t) = 0) > 0.1\\).*

In other words, a system is cloud-regime when connectivity is nearly always available (less than 1% chance of full disconnection), and contested-edge when it is disconnected more than 10% of the time with average quality below half-nominal.

<span id="prop-1"></span>
**Proposition 1** ({% term(url="#prop-1", def="The connectivity level below which distributed autonomy outperforms cloud control") %}Inversion Threshold{% end %}). *Under assumption set \\(\mathcal{A}_{inv}\\), there exists a threshold \\(\tau^\*\\) such that cloud-native coordination patterns yield lower expected utility than partition-first patterns when \\(P(C(t) = 0) > \tau^\*\\).*

In other words, once the fraction of time spent fully disconnected exceeds \\(\tau^*\\), designing for partition as the baseline outperforms designing for connectivity as the baseline — the architecture "inverts."

*Formal Derivation*:

Let \\(U_{\text{cloud}}(p)\\) denote expected utility under cloud-native patterns and \\(U_{\text{edge}}(p)\\) under partition-first patterns, where \\(p = P(C(t) = 0)\\).

**Cloud-native utility**: Coordination waits for connectivity. The formula below computes expected decision latency as a function of partition probability \\(p\\), where \\(T_s\\) is the synchronization period and \\(\rho\\) is the per-attempt retry overhead.

{% katex(block=true) %}
\mathbb{E}[T_{\text{cloud}}] = T_s \cdot \frac{1}{1-p} + \rho \cdot \frac{p}{1-p}
{% end %}

where the second term captures retry overhead. The formula below expresses cloud-native utility \\(U_{\text{cloud}}\\) as baseline utility \\(U_0\\) minus a latency penalty weighted by \\(\alpha\\), the rate at which utility degrades per unit of delay.

{% katex(block=true) %}
U_{\text{cloud}}(p) = U_0 - \alpha \cdot \mathbb{E}[T_{\text{cloud}}] = U_0 - \alpha T_s \cdot \frac{1 + \rho/T_s \cdot p}{1-p}
{% end %}

**Partition-first utility**: Decisions proceed locally with reconciliation cost \\(\beta\\) on reconnection:

{% katex(block=true) %}
U_{\text{edge}}(p) = U_0 - \alpha T_d - \beta \cdot (1-p)
{% end %}

**Threshold derivation**: Setting the two utility expressions equal and solving for the crossover partition probability yields the {% term(url="#prop-1", def="The connectivity level below which distributed autonomy outperforms cloud control") %}inversion threshold{% end %} \\(\tau^*\\) as a closed-form ratio of system parameters.

{% katex(block=true) %}
\tau^* = \frac{T_s - T_d - \beta/\alpha}{T_s + \rho - \beta/\alpha}
{% end %}

For systems where \\(T_s = kT_d\\) with \\(k \geq 5\\) (synchronization slower than decisions) and \\(\rho \approx T_s\\), \\(\beta/\alpha \ll T_s\\):

{% katex(block=true) %}
\tau^* \approx \frac{(k-1)T_d}{2kT_d} = \frac{k-1}{2k}
{% end %}

For \\(k = 5\\): \\(\tau^* = 0.4\\). Including retry storms (\\(\rho\\) increases superlinearly with \\(p\\)), the effective threshold drops to \\(\tau^* \in [0.12, 0.18]\\).

The retry storm correction is derived as follows. Under TCP-like congestion collapse, each retry attempt contends with active retries: \\(\rho(p) \approx \rho_0/(1-p)\\) (linear in availability pressure). Substituting into the \\(\tau^*\\) formula with \\(k=5\\), \\(\rho = \rho_0/(1-p)\\), and solving \\(U_{\text{cloud}} = U_{\text{edge}}\\) numerically for \\(p\\): at \\(\rho_0 = T_s\\) (retry cost equals one sync period), the crossover shifts from \\(p = 0.40\\) to \\(p \approx 0.17\\). At \\(\rho_0 = 2T_s\\): \\(p \approx 0.13\\). The range \\([0.12, 0.18]\\) corresponds to \\(\rho_0 \in [T_s, 2T_s]\\) — one to two sync periods of retry overhead, consistent with measured backoff behavior on contested tactical links.

**\\(\tau^\*\\) uniqueness caveat**: The derivation above assumes \\(\rho(p)\\) is monotonically increasing in \\(p\\), which makes \\(U_{\text{cloud}} - U_{\text{edge}}\\) a monotone function with at most one zero crossing — guaranteeing a unique \\(\tau^\*\\). When \\(\rho(p) = \rho_0/(1-p)\\) (linear retry storm), this still holds. However, if \\(\rho_0\\) is itself correlated with \\(p\\) — for instance, because backoff duration depends on congestion level, which is a function of \\(p\\) — the effective retry cost becomes \\(\rho_{\text{eff}}(p) = \rho_0(p)/(1-p)\\), a nonlinear function that can create two crossover points: a lower \\(\tau^\*_1\\) where partition-first becomes preferable, and an upper \\(\tau^\*_2\\) where extreme availability loss makes the utility functions cross back. In such cases, solve {% katex() %}U_{\text{cloud}} = U_{\text{edge}}{% end %} numerically and verify only one root exists in \\([0, 1]\\) before applying the threshold. The RAVEN and CONVOY calibrations use measured constant \\(\rho_0\\), so uniqueness holds; systems with load-dependent backoff (e.g., exponential backoff with jitter correlated with congestion level) must verify this explicitly.

**Utility improvement under partition-first design**: The formula below quantifies the net utility gain from switching to partition-first design, expressed as the difference between the coordination delay saved and the reconciliation cost incurred.

{% katex(block=true) %}
\Delta U = U_{\text{edge}} - U_{\text{cloud}} = \alpha T_s \cdot \frac{p + \rho p / T_s}{1-p} - \alpha(T_s - T_d) - \beta(1-p)
{% end %}

\\(\text{sign}(\Delta U) > 0\\) when \\(p > \tau^*\\) because the coordination delay term grows as \\(O(1/(1-p))\\) while reconciliation cost grows only as \\(O(1-p)\\).

**Validity domain**: This derivation holds when:
- \\(T_s / T_d \geq 5\\) (synchronization substantially slower than local decisions)
- \\(\rho > 0\\) (retries have non-zero cost)
- \\(\beta < \alpha T_s\\) (reconciliation cheaper than prolonged waiting)
- **Conflict rate bounded**: \\(|\text{conflicts}| / \tau_{\text{partition}} < \kappa\\) for some threshold \\(\kappa\\). When clusters make incompatible decisions, reconciliation cost decomposes into data and semantic components: \\(\beta_{\text{actual}} = \beta(1-p) + \beta_c^{\text{data}} \cdot N_d^2 + \beta_c^{\text{sem}} \cdot (1-\gamma)^2 |S_{\text{merged}}|^2\\), where \\(N_d\\) is the CRDT-resolvable data-conflict count and \\(\gamma\\) is the semantic convergence factor (Definition 1b). The CRDT data-conflict term is bounded; the semantic term is not.
- **Semantic convergence**: \\(\gamma \geq 1 - \varepsilon\\) (policy-violation fraction below tolerance \\(\varepsilon\\); Definition 1b). When this fails, the semantic conflict term can reverse the inversion advantage regardless of how fast data syncs.

<span id="def-1b"></span>
**Definition 1b** (Semantic Convergence Factor). *Let \\(S_{\text{merged}}\\) be the set of all state items produced by a reconciliation event, and \\(S_{\text{merged}}^{\text{consistent}} \subseteq S_{\text{merged}}\\) the subset with no policy violations after merge. The semantic convergence factor is:*

{% katex(block=true) %}
\gamma = \frac{|S_{\text{merged}}^{\text{consistent}}|}{|S_{\text{merged}}|}
{% end %}

*\\(\gamma = 1\\) means all merged state satisfies system policy. When \\(\gamma < 1 - \varepsilon\\), policy violations accumulate faster than they can be resolved — nodes must re-negotiate conflicting decisions, driving the \\(\beta_c^{\text{sem}}\\) term into the storm regime regardless of CRDT sync speed. CRDTs guarantee data convergence (\\(\gamma_{\text{data}} = 1\\)) but have no effect on \\(\gamma\\): CRDT merge is syntactic, policy compliance is semantic.*

**Note:** Setting \\(U_{cloud} = U_{edge}\\) yields a quadratic in the availability parameter \\(p\\): \\(\alpha T_s(1 + \rho p / T_s) = (\alpha T_d + \beta(1-p))(1-p)\\). The closed-form \\(\tau^*\\) is a first-order linear approximation valid when \\(\beta(1-p)\\) is small relative to \\(\alpha T_d\\). For large \\(\beta\\) (high penalty for remote coordination failures), the quadratic root should be solved numerically.

**Counter-scenario where inversion fails**: A system with \\(P(C = 0) = 0.20\\) but very short partition durations (mean 5 seconds) and tolerant decision latency (\\(T_d > 30\\) seconds). Store-and-forward suffices; full partition-first architecture adds unnecessary complexity.

**Second counter-scenario (conflict cascade)**: Two clusters independently allocate the same exclusive resource. Upon reconnection, one allocation must be revoked - potentially cascading to dependent decisions. When \\(|\text{conflicts}| \cdot C_{\text{revoke}} > \beta_{\text{assumed}}\\), partition-first yields lower utility than blocking.

### Game-Theoretic Extension: Adversarial Inversion Threshold

Proposition 1 assumes partition probability \\(p\\) is exogenous - a property of the environment. In contested environments, \\(p\\) is set by an adversary who can respond to the architecture choice. The Stackelberg game formalization reveals a critical asymmetry.

**Stackelberg Game**: The defender (designer) commits to an architecture; the adversary observes it and selects jamming intensity \\(p \in [0, \bar{p}]\\) to minimize defender utility.

Under cloud-native architecture, \\(U_D(\text{cloud}, p)\\) is strictly decreasing and convex in \\(p\\) (the \\(1/(1-p)\\) term). The adversary's best response is \\(p = \bar{p}\\) (maximum feasible jamming).

Under partition-first architecture, the defender utility depends on \\(p\\) through only the reconciliation term \\(\beta(1-p)\\), where \\(\beta\\) is the cost of merging state accumulated during partition.

{% katex(block=true) %}
U_D(\text{edge}, p) = U_0 - \alpha T_d - \beta(1-p)
{% end %}

This is *increasing* in \\(p\\) - more jamming reduces reconciliation overhead \\(\beta(1-p)\\). The adversary facing a partition-first defender has no beneficial jamming strategy; their optimal response is to restore connectivity.

**Adversarially robust threshold**: The two expressions below give each architecture's worst-case utility when the adversary applies maximum feasible jamming \\(\bar{p}\\); the partition-first guarantee is a constant, while the cloud-native guarantee collapses as \\(\bar{p} \to 1\\).

{% katex(block=true) %}
U_D^*(\text{edge}) = U_0 - \alpha T_d - \beta(1-\bar{p})
{% end %}

{% katex(block=true) %}
U_D^*(\text{cloud}) = U_0 - \alpha T_s \cdot \frac{1 + \rho\bar{p}/T_s}{1-\bar{p}}
{% end %}

The game-theoretic threshold {% katex() %}\tau^*_{GT}{% end %} (where \\(U_D^\*(\text{edge}) = U_D^\*(\text{cloud})\\)) satisfies \\(\tau^\*_{GT} < \tau^\*\\). Systems in the hybrid zone \\(0.3 \leq E < 0.6\\) of the Edge-ness Score should be reassessed: an adversary can push them to the wrong side of \\(\tau^\*\\) at will, but cannot degrade a partition-first system below its adversarially-robust guarantee.

**Practical implication**: For contested deployments, use \\(\bar{p}\\) (maximum feasible jamming given the threat model) rather than expected \\(p\\) when evaluating the {% term(url="#prop-1", def="The connectivity level below which distributed autonomy outperforms cloud control") %}inversion threshold{% end %}. Partition-first architecture is strategically dominant against jamming adversaries - a property not captured by the expected-utility analysis of Proposition 1.

### Architectural Response: Hierarchical Edge Tiers

The inversion thesis requires **layered autonomy**: each tier operates independently when partitioned, contributes to fleet objectives when connected. Tiers differ by capability, connectivity probability, and decision authority.

The key structural property to observe is that links between T0 and T1 are dashed (opportunistic sync only), while links from T2 downward are solid (local mesh, always available) — the architecture is designed so that the tiers that must make safety-critical decisions are never connectivity-dependent.

{% mermaid() %}
graph TB
    subgraph "Tier 0: Cloud/Regional"
        C1["Regional Command<br/>Full compute, persistent storage<br/>Global optimization"]
    end

    subgraph "Tier 1: Edge Gateway"
        G1["Gateway Alpha<br/>Local coordination<br/>Tier 2 aggregation"]
        G2["Gateway Beta<br/>Local coordination<br/>Tier 2 aggregation"]
    end

    subgraph "Tier 2: Edge Cluster"
        E1["Cluster Lead<br/>Intra-cluster consensus"]
        E2["Cluster Lead<br/>Intra-cluster consensus"]
        E3["Cluster Lead<br/>Intra-cluster consensus"]
    end

    subgraph "Tier 3: Edge Node"
        N1["Node"]
        N2["Node"]
        N3["Node"]
        N4["Node"]
        N5["Node"]
        N6["Node"]
    end

    C1 -.->|"Opportunistic<br/>sync"| G1
    C1 -.->|"Opportunistic<br/>sync"| G2
    G1 -->|"Cluster<br/>coordination"| E1
    G1 -->|"Cluster<br/>coordination"| E2
    G2 -->|"Cluster<br/>coordination"| E3
    E1 -->|"Local mesh"| N1
    E1 -->|"Local mesh"| N2
    E2 -->|"Local mesh"| N3
    E2 -->|"Local mesh"| N4
    E3 -->|"Local mesh"| N5
    E3 -->|"Local mesh"| N6

    style C1 fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style G1 fill:#fff3e0,stroke:#f57c00
    style G2 fill:#fff3e0,stroke:#f57c00
    style E1 fill:#e8f5e9,stroke:#388e3c
    style E2 fill:#e8f5e9,stroke:#388e3c
    style E3 fill:#e8f5e9,stroke:#388e3c
    style N1 fill:#fce4ec,stroke:#c2185b
    style N2 fill:#fce4ec,stroke:#c2185b
    style N3 fill:#fce4ec,stroke:#c2185b
    style N4 fill:#fce4ec,stroke:#c2185b
    style N5 fill:#fce4ec,stroke:#c2185b
    style N6 fill:#fce4ec,stroke:#c2185b
{% end %}

T0 operates with cloud assumptions. T3 must function indefinitely without higher-tier contact - the system does not depend on T0.

<style>
#tbl_tier_characteristics + table th:first-of-type { width: 12%; }
#tbl_tier_characteristics + table th:nth-of-type(2) { width: 22%; }
#tbl_tier_characteristics + table th:nth-of-type(3) { width: 22%; }
#tbl_tier_characteristics + table th:nth-of-type(4) { width: 22%; }
#tbl_tier_characteristics + table th:nth-of-type(5) { width: 22%; }
</style>
<div id="tbl_tier_characteristics"></div>

The table below summarizes, for each tier, the resource envelope, decision scope, and the maximum disconnection duration that tier must survive without higher-tier contact.

| Tier | Compute | Storage | Authority Scope | Partition Tolerance |
| :--- | :--- | :--- | :--- | :--- |
| **T0** | Unlimited | Petabytes | Global policy, historical analysis | None required |
| **T1** | High (GPU clusters) | Terabytes | Regional coordination, model updates | Hours to days |
| **T2** | Moderate (edge servers) | Gigabytes | Cluster consensus, task allocation | Minutes to hours |
| **T3** | Limited (embedded) | Megabytes | Local action, immediate response | Indefinite |

Lower tiers must tolerate longer disconnections. T3 nodes function indefinitely in isolation - the primary operating mode, not degradation.

### Game-Theoretic Extension: Dynamic Coalition Formation Under Partition

The tier architecture pre-assigns nodes to fixed clusters. When partition severs cluster communication, nodes must form operating coalitions without centralized assignment - a **hedonic coalition formation game**.

**Model**: Each node \\(i\\) has preferences over coalitions \\(S \ni i\\) based on:
- Aggregate capability: \\(\sum_{j \in S} \mathcal{L}_j\\)
- Communication overhead: \\(|S| \cdot c_{\text{msg}}\\)
- MVS achievability: \\(P(\text{MVS achievable} \mid S)\\)

A **Nash-stable partition** is one where no node prefers to join a different coalition or operate alone: no \\(i\\) with current coalition \\(S_i\\) prefers any \\(S\' \neq S_i\\) containing \\(i\\).

**Partition-duration trade-off**: For short partitions, larger coalitions are preferred - less fragmentation to reconcile at reconnection. For long partitions, smaller self-sufficient coalitions are preferred - lower communication overhead and conflict probability. The formula below selects the coalition size \\(k\\) that maximizes the difference between the probability of achieving Minimum Viable System functionality and the cumulative messaging cost \\(c_{\text{msg}}\\) scaled by expected partition duration \\(\mathbb{E}[T_{\text{partition}}]\\).

{% katex(block=true) %}
|S^*| = \arg\max_{k} \left[ P(\text{MVS} \mid k) - k \cdot c_{\text{msg}} \cdot \mathbb{E}[T_{\text{partition}}] \right]
{% end %}

**Practical implication**: When partition duration forecasts predict a short partition, preserve existing clusters. When they predict extended isolation, allow cluster fragmentation into smaller self-sufficient units. The hedonic stability condition provides the formal criterion: fragment if and only if any sub-coalition satisfies \\(v_i(S_{\text{sub}}) > v_i(S_{\text{full}})\\) for a majority of members.

### Capability Level Transition: Multi-Objective Decision Problem

**Competing Objectives**: The node selects a target {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} \\(\mathcal{L}_{k\'}\\) by jointly optimizing mission value, probability of sustaining that level without forced downgrade, and transition cost — three objectives that pull in different directions.

{% katex(block=true) %}
\max_{\mathcal{L}_{k'}} \left( U_{\text{capability}}(\mathcal{L}_{k'}), U_{\text{stability}}(\mathcal{L}_{k'}), -C_{\text{transition}}(\mathcal{L}_{k'}) \right)
{% end %}

where:
- \\(U_{\text{capability}}\\): Mission value from operating at level \\(\mathcal{L}_{k\'}\\)
- \\(U_{\text{stability}}\\): Probability of maintaining level without forced downgrade
- \\(C_{\text{transition}}\\): Cost of transitioning (coordination, state sync, risk)

**Single-objective simplification** (when stability dominates): This selects the {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} that maximizes expected accumulated value over a planning horizon \\(\tau\\), given the current system state \\(\Sigma_t\\) (connectivity estimate, health vector, resource levels).

{% katex(block=true) %}
\mathcal{L}^* = \arg\max_{\mathcal{L}_{k'} \in \{\mathcal{L}_0, \ldots, \mathcal{L}_4\}} \mathbb{E}\left[\int_t^{t+\tau} V(\mathcal{L}_{k'}, C(s)) \, ds \mid \Sigma_t\right]
{% end %}

where \\(V(\mathcal{L}, C) = \mathcal{L} \cdot \mathbb{1}[C \geq C_{\min}(\mathcal{L})]\\) awards {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} only when connectivity supports it.

**Trade-off**: Higher {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %}s yield more mission value but are less stable under connectivity variation. The objective weights determine the Pareto-optimal choice.

**Constraint Set**: Three conditions gate any capability upgrade: the current link quality must meet the level's minimum, available resources must cover the level's budget, and the node can only step up or down by one level per transition.

{% katex(block=true) %}
\begin{aligned}
g_1: && C(t) &\geq C_{\min}(\mathcal{L}_{k'}) && \text{(connectivity threshold)} \\
g_2: && R(t) &\geq R_{\min}(\mathcal{L}_{k'}) && \text{(resource requirement)} \\
g_3: && |k' - k| &\leq 1 && \text{(single-step transitions)}
\end{aligned}
{% end %}

**Capability Thresholds**: The table below lists, for each {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %}, the minimum link quality \\(C_{\min}\\) and resource fraction \\(R_{\min}\\) that must be available before that level can be activated.

| Capability | \\(C_{\min}\\) | \\(R_{\min}\\) | Functions Enabled |
| :--- | :--- | :--- | :--- |
| \\(\mathcal{L}_0\\) | 0.0 | 5% | Survival, distress beacon |
| \\(\mathcal{L}_1\\) | 0.0 | 20% | Core mission, local autonomy |
| \\(\mathcal{L}_2\\) | 0.3 | 40% | Cluster coordination, gossip |
| \\(\mathcal{L}_3\\) | 0.8 | 60% | Fleet integration, hierarchical sync |
| \\(\mathcal{L}_4\\) | 0.9 | 80% | Full capability, streaming |

**State Transition Model**: The rule below captures the asymmetric update logic: an upgrade requires all three constraints satisfied simultaneously, while a downgrade fires automatically when any single constraint is violated.

{% katex(block=true) %}
\mathcal{L}_{t+1} = \begin{cases}
\mathcal{L}_{k'} & \text{if } g_1, g_2, g_3 \text{ satisfied and } \mathcal{L}_{k'} > \mathcal{L}_k \\
\max(\mathcal{L}_0, \mathcal{L}_k - 1) & \text{if } C(t) < C_{\min}(\mathcal{L}_k) \lor R(t) < R_{\min}(\mathcal{L}_k) \\
\mathcal{L}_k & \text{otherwise}
\end{cases}
{% end %}

The transition is asymmetric: upgrades require all constraints satisfied; downgrades occur automatically when any constraint is violated.

<span id="scenario-autohauler"></span>

### Commercial Application: {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} Mining Fleet

The {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} system operates a fleet of 34 autonomous haul trucks in an open-pit copper mine spanning 8 kilometers. The mine's terrain - steep ramps, ore crusher canyons, and processing facilities - creates persistent RF shadows. Underground ore passes and maintenance tunnels introduce complete connectivity blackouts lasting 2-15 minutes per truck cycle.

The tier architecture maps directly to {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}'s operational structure — note that the dashed links from T0 to pit controllers carry only shift-level plans every 8 hours, while the solid links from T2 segments to individual trucks carry real-time commands, reflecting that the tiers making safety-critical decisions are the ones with always-available local connectivity.

{% mermaid() %}
graph TB
    subgraph "T0: Mine Operations Center"
        MOC["Operations Center<br/>Fleet scheduling, shift planning<br/>Global optimization"]
    end

    subgraph "T1: Pit Controllers"
        PC1["North Pit Controller<br/>Zone coordination<br/>12 trucks"]
        PC2["South Pit Controller<br/>Zone coordination<br/>14 trucks"]
        PC3["Processing Controller<br/>Crusher queue management<br/>8 trucks in queue"]
    end

    subgraph "T2: Haul Road Segments"
        HR1["Segment Alpha<br/>Ramp traffic control"]
        HR2["Segment Beta<br/>Ore pass queuing"]
        HR3["Segment Gamma<br/>Dump coordination"]
    end

    subgraph "T3: Autonomous Trucks"
        T1["Truck 01"]
        T2["Truck 02"]
        T3["Truck 03"]
        T4["Truck 04"]
    end

    MOC -.->|"Shift plans<br/>every 8h"| PC1
    MOC -.->|"Shift plans<br/>every 8h"| PC2
    MOC -.->|"Demand signal"| PC3
    PC1 -->|"Route<br/>assignment"| HR1
    PC2 -->|"Route<br/>assignment"| HR2
    PC3 -->|"Queue<br/>position"| HR3
    HR1 -->|"Local<br/>mesh"| T1
    HR1 -->|"Local<br/>mesh"| T2
    HR2 -->|"Local<br/>mesh"| T3
    HR3 -->|"Local<br/>mesh"| T4

    style MOC fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style PC1 fill:#fff3e0,stroke:#f57c00
    style PC2 fill:#fff3e0,stroke:#f57c00
    style PC3 fill:#fff3e0,stroke:#f57c00
    style HR1 fill:#e8f5e9,stroke:#388e3c
    style HR2 fill:#e8f5e9,stroke:#388e3c
    style HR3 fill:#e8f5e9,stroke:#388e3c
    style T1 fill:#fce4ec,stroke:#c2185b
    style T2 fill:#fce4ec,stroke:#c2185b
    style T3 fill:#fce4ec,stroke:#c2185b
    style T4 fill:#fce4ec,stroke:#c2185b
{% end %}

**T0 (Operations Center)** handles shift-level planning: which trucks service which loading points, maintenance scheduling, production targets. These decisions have 8-hour horizons and tolerate hours of disconnection from the pit.

**T1 (Pit Controllers)** manage zone-level coordination: balancing truck allocation between loading points as ore grades vary, responding to equipment breakdowns, adjusting for weather. These controllers maintain 15-minute planning horizons and must operate autonomously when satellite links drop.

**T2 (Haul Road Segments)** coordinate local traffic: managing passing bays, controlling single-lane ramp traffic, sequencing trucks at dump points. Segment controllers see 5-minute horizons and handle disconnection from pit controllers routinely.

**T3 (Trucks)** make immediate decisions: collision avoidance, obstacle response, speed regulation, emergency stops. Each truck must operate safely with zero external connectivity - the most critical tier has the least connectivity dependency.

The component interaction at each tier follows a consistent pattern. Each tier exposes a **state interface** to its parent (current position, load status, estimated completion), a **command interface** from its parent (route assignment, speed limits, destination), and a **peer interface** for same-tier coordination (precedence negotiation, passing coordination). When parent connectivity fails, the tier activates **delegated authority** - bounded decision rights that enable continued operation without escalation.

**{% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} connectivity model** derives from terrain geometry and RF propagation constraints:

**Assumption Set** \\(\mathcal{A}_{AH}\\):
- \\(A_1\\): RF propagation follows free-space path loss with terrain shadowing
- \\(A_2\\): Ore passes create complete RF occlusion (Faraday cage effect)
- \\(A_3\\): Truck cycle follows fixed route graph with known segment lengths

**Connectivity by Location** (derived from \\(\mathcal{A}_{AH}\\)): The table below gives the link quality \\(C \in [0,1]\\) at each segment of a truck cycle, derived from the assumption set; ore pass tunnels produce the only complete blackouts.

| Location | Connectivity \\(C\\) | Derivation |
| :--- | ---: | :--- |
| Open pit benches | \\(\geq 0.9\\) | Line-of-sight to base station |
| Haul road switchbacks | \\(\approx 0.7\\) | \\(P_{\text{shadow}} = 1 - \cos(\theta_{\text{wall}})\\) |
| Ore pass tunnel | \\(= 0\\) | Complete RF occlusion (\\(A_2\\)) |
| Crusher queue | \\(\approx 0.85\\) | Partial occlusion from equipment |

**Blackout duration**: Given route graph \\(G\\) with tunnel segments of length \\(L_t\\) and speed \\(v\\), blackout duration \\(T_b = L_t / v\\). For typical \\(L_t \in [400m, 600m]\\) and \\(v \approx 0.8\\) m/s (loaded through narrow ore pass): \\(T_b \in [8, 12]\\) minutes.

The tier architecture ensures \\(\Delta U_{\text{blackout}} \approx 0\\): trucks maintain \\(\mathcal{L}_1\\) capability during blackouts, Segment controllers maintain \\(\mathcal{L}_2\\) coordination, and reconciliation occurs at \\(\mathcal{L}_3\\) when connectivity restores.

**Tier Transition Protocol**: When a tier loses parent connectivity, it promotes to autonomous mode:

1. **Detect**: No acknowledgment within \\(T_{\text{timeout}} = 3 \times T_{\text{RTT\\_baseline}}\\)
2. **Broadcast**: Partition event to siblings with timestamp and last-known parent state
3. **Assume authority**: Inherit bounded decision rights from parent (T2 clusters make T1-level allocation decisions)
4. **Log**: All delegated-authority decisions with causality for later merge
5. **Reconnect**: Exponential backoff \\(T_{\text{retry}}(k) = \min(T_{\text{base}} \cdot 2^k, T_{\text{max}})\\)

### Quantifying Edge-ness

Formally, the Edge-ness Score is defined as \\(E = w_c C + w_\ell \mathcal{L} + w_r R\\) with \\(E \in [0,1]\\) and \\(w_c + w_\ell + w_r = 1\\), where \\(C\\) is connectivity score, \\(\mathcal{L}\\) is latency sensitivity, and \\(R\\) is resource constraint severity. The operational instantiation below expands each component into measurable sub-dimensions:

The **Edge-ness Score** \\(E \in [0,1]\\) quantifies edge characteristics across four dimensions:

{% katex(block=true) %}
E = w_1 \cdot \frac{P(C=0)}{0.3} + w_2 \cdot \frac{1 - R_{\text{avg}}}{0.8} + w_3 \cdot \frac{T_{\text{decision}}}{T_{\text{sync}}} + w_4 \cdot \frac{f_{\text{adversarial}}}{0.5}
{% end %}

where:
- \\(P(C=0)\\) - partition probability (normalized against 0.3 threshold)
- \\(R_{\text{avg}}\\) - average decision reversibility (inverted; lower = more edge)
- \\(T_{\text{decision}}/T_{\text{sync}}\\) - ratio of decision deadline to sync period
- \\(f_{\text{adversarial}}\\) - fraction of failures that are adversarial vs. accidental

**Weight derivation** from constraint analysis: each weight \\(w_i\\) is proportional to the marginal impact of dimension \\(x_i\\) (partition probability, reversibility, timing ratio, adversarial fraction) on system utility, evaluated at the critical operating point \\(x_{\text{critical}}\\) where the architectural regime boundary occurs.

{% katex(block=true) %}
w_i \propto \frac{\partial U_{\text{system}}}{\partial x_i} \bigg|_{x = x_{\text{critical}}}
{% end %}

Partition probability \\(w_1 = 0.35\\) dominates because \\(\partial U / \partial P(C=0)\\) has discontinuous behavior at the {% term(url="#prop-1", def="The connectivity level below which distributed autonomy outperforms cloud control") %}inversion threshold{% end %}. Reversibility \\(w_2 = 0.25\\) and timing ratio \\(w_3 = 0.25\\) contribute equally as they both affect decision quality linearly. Adversarial fraction \\(w_4 = 0.15\\) has lower weight because adversarial scenarios are a subset of partition scenarios. Practitioners should adjust weights via sensitivity analysis: \\(w_i\' = w_i \cdot (\text{Var}[x_i] / \text{Var}[x_i]_{\text{baseline}})\\).

**Interpretation thresholds**:
- \\(E < 0.3\\): Cloud-native patterns viable; edge patterns optional
- \\(0.3 \leq E < 0.6\\): Hybrid architecture required; selective edge patterns
- \\(E \geq 0.6\\): Full edge architecture mandatory; cloud patterns will fail

<span id="scenario-convoy"></span>

*{% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calculation*: With \\(P(C=0) = 0.21\\), \\(R_{\text{avg}} \approx 0.35\\), \\(T_{\text{decision}}/T_{\text{sync}} = 0.8\\), and \\(f_{\text{adversarial}} = 0.4\\):

{% katex(block=true) %}
E_{\text{CONVOY}} = 0.35 \cdot \frac{0.21}{0.3} + 0.25 \cdot \frac{0.65}{0.8} + 0.25 \cdot 0.8 + 0.15 \cdot \frac{0.4}{0.5} = 0.77
{% end %}

{% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}'s \\(E = 0.77\\) places it firmly in full-edge territory - consistent with requiring the full hierarchical tier architecture with autonomous operation at every level.

**Commercial System Calculations**:

*{% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} calculation*: With \\(P(C=0) = 0.13\\) (ore pass blackouts), \\(R_{\text{avg}} \approx 0.25\\) (route commitments, loading decisions), \\(T_{\text{decision}}/T_{\text{sync}} = 0.6\\) (collision avoidance faster than coordination), and \\(f_{\text{adversarial}} = 0.05\\) (minimal malicious interference):

{% katex(block=true) %}
E_{\text{AUTOHAULER}} = 0.35 \cdot \frac{0.13}{0.3} + 0.25 \cdot \frac{0.75}{0.8} + 0.25 \cdot 0.6 + 0.15 \cdot \frac{0.05}{0.5} = 0.55
{% end %}

{% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}'s \\(E = 0.55\\) falls in the hybrid zone - edge patterns mandatory for safety-critical collision avoidance and tunnel operations, but some coordination can use reliable pit-top connectivity.

<span id="scenario-gridedge"></span>

*{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} calculation*: With \\(P(C=0) = 0.16\\) (storm-correlated outages), \\(R_{\text{avg}} \approx 0.1\\) (protective relay trips are permanent until manual reset), \\(T_{\text{decision}}/T_{\text{sync}} = 0.02\\) (500ms fault response vs. 30s SCADA polling), and \\(f_{\text{adversarial}} = 0.02\\):

{% katex(block=true) %}
E_{\text{GRIDEDGE}} = 0.35 \cdot \frac{0.16}{0.3} + 0.25 \cdot \frac{0.9}{0.8} + 0.25 \cdot 0.02 + 0.15 \cdot \frac{0.02}{0.5} = 0.48
{% end %}

{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}'s \\(E = 0.48\\) is driven by decision irreversibility and decision-to-sync ratio. The extremely low \\(T_{\text{decision}}/T_{\text{sync}}\\) (millisecond fault response) overwhelms other factors - fog-layer autonomy is essential for grid protection.

---

*Detailed positioning against fog computing, edge-cloud continuum, and multi-agent system paradigms is collected in the [Reference section](#reference-paradigm-positioning) at the end of this article.*

The inversion thesis establishes *when* edge autonomy is preferable to cloud coordination. Formalizing *how often* and *how long* connectivity fails requires a stochastic model of connectivity states — the Connectivity Spectrum introduces this model and grounds the analysis in measurable parameters.

## The Contested Connectivity Spectrum

Not all disconnection is equal. The difference between "bandwidth is reduced" and "adversary is actively injecting false packets" demands different architectural responses. We define four {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regimes{% end %}, each with distinct characteristics and required countermeasures:

<style>
#tbl_connectivity_regimes + table th:first-of-type { width: 18%; }
#tbl_connectivity_regimes + table th:nth-of-type(2) { width: 27%; }
#tbl_connectivity_regimes + table th:nth-of-type(3) { width: 25%; }
#tbl_connectivity_regimes + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_connectivity_regimes"></div>
<span id="scenario-outpost"></span>

| Regime | Characteristics | Example Scenario | Architectural Response |
| :--- | :--- | :--- | :--- |
| **Degraded** | Reduced bandwidth, elevated latency, increased packet loss | CONVOY in mountain terrain with intermittent line-of-sight | Prioritized sync, compressed protocols, delta encoding |
| **Intermittent** | Unpredictable connectivity windows, unknown duration | RAVEN beyond relay horizon, periodic satellite passes | Store-and-forward, opportunistic burst sync, prediction models |
| **Denied** | No connectivity for extended periods, possibly permanent | {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} under sustained jamming, cable cut | Full autonomy, local decision authority, self-contained operation |
| **Adversarial** | Connectivity exists but is compromised or manipulated | Man-in-the-middle, replay attacks, GPS spoofing | Authenticated channels, Byzantine fault tolerance, trust verification |

### Markov Model of Connectivity Transitions

The continuous {% term(url="#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} \\(C(t) \in [0,1]\\) (Definition 1) can be discretized into regimes for tractable analysis. We define a state quantization mapping \\(q: [0,1] \rightarrow S\\) where thresholds \\(0 = \theta_N < \theta_I < \theta_D < \theta_F = 1\\) partition the connectivity range into discrete regimes. For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, we use \\(\theta_N = 0\\), \\(\theta_I = 0.1\\), \\(\theta_D = 0.3\\), \\(\theta_F = 0.8\\) - thresholds calibrated from operational telemetry where mesh connectivity below 10% effectively means denied, below 30% limits coordination, and below 80% prevents synchronized maneuvers.

<span id="def-3"></span>
**Definition 3** (Connectivity Markov Chain). *Let \\(\Xi \in \\{\mathcal{C}, \mathcal{D}, \mathcal{I}, \mathcal{N}\\}\\) denote the {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %} space (Connected, Degraded, Intermittent, Denied). The regime process {% katex() %}\{\Xi(t) = q(C(t))\}_{t \geq 0} {% end %} is modeled as a continuous-time {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov chain{% end %} with generator matrix \\(Q\\) where \\(q_{ij}\\) represents the instantaneous transition rate from regime \\(i\\) to regime \\(j\\).*

In other words, the continuous link quality \\(C(t)\\) is bucketed into four named regimes, and the frequency with which the system jumps between those regimes is captured in the matrix \\(Q\\) — which is all we need to predict long-run behavior. The generic form of \\(Q\\) is shown below.

{% katex(block=true) %}
Q = \begin{bmatrix}
-q_F & q_{FD} & q_{FI} & q_{FN} \\
q_{DF} & -q_D & q_{DI} & q_{DN} \\
q_{IF} & q_{ID} & -q_I & q_{IN} \\
q_{NF} & q_{ND} & q_{NI} & -q_N
\end{bmatrix}
{% end %}

where \\(q_X = \sum_{Y \neq X} q_{XY}\\) ensures row sums equal zero.

For the {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} scenario - a ground vehicle network operating in mountainous terrain with potential electronic warfare threats - we estimate transition rates from operational telemetry. Rows correspond to the current regime (Connected, Degraded, Intermittent, Denied) and columns to the destination regime; off-diagonal entries are rates in transitions per hour.

{% katex(block=true) %}
Q_{\text{CONVOY}} = \begin{bmatrix}
-0.15 & 0.08 & 0.05 & 0.02 \\
0.12 & -0.22 & 0.07 & 0.03 \\
0.06 & 0.10 & -0.24 & 0.08 \\
0.02 & 0.04 & 0.09 & -0.15
\end{bmatrix} \text{ (transitions per hour)}
{% end %}

The stationary distribution \\(\pi\\) satisfies \\(\pi Q = 0\\) with \\(\sum_i \pi_i = 1\\). Solving for {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}:

{% katex(block=true) %}
\pi_{\text{CONVOY}} = (\pi_{\mathcal{C}}, \pi_{\mathcal{D}}, \pi_{\mathcal{I}}, \pi_{\mathcal{N}}) = (0.32, 0.25, 0.22, 0.21)
{% end %}

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, \\(\pi_{\mathcal{C}} = 0.32\\) - the system spends only 32% of operating time in the Connected regime. Any architecture assuming full connectivity as baseline fails to match operational reality more than two-thirds of the time.

**{% term(url="#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}Connectivity State{% end %} Transition Diagram** (rates per hour, edge thickness = frequency, node size = stationary probability): The diagram shows all twelve regime-to-regime transition rates for {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}; the key pattern is that recovery from Denied (N) flows first through Intermittent rather than directly back to Connected, while the Connected-to-Degraded edge carries the highest outbound rate.

{% mermaid() %}
stateDiagram-v2
    direction LR

    C: Connected (pi=0.32)
    D: Degraded (pi=0.25)
    I: Intermittent (pi=0.22)
    N: Denied (pi=0.21)

    C --> D: 0.08/hr
    C --> I: 0.05/hr
    C --> N: 0.02/hr

    D --> C: 0.12/hr
    D --> I: 0.07/hr
    D --> N: 0.03/hr

    I --> C: 0.06/hr
    I --> D: 0.10/hr
    I --> N: 0.08/hr

    N --> C: 0.02/hr
    N --> D: 0.04/hr
    N --> I: 0.09/hr

    note right of C
        Capability: L4
        Full coordination
    end note

    note right of D
        Capability: L2
        Priority queuing
    end note

    note right of I
        Capability: L1
        Store-and-forward
    end note

    note right of N
        Capability: L0-L1
        Full autonomy
    end note
{% end %}

**Interpreting the diagram**: {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} transitions most frequently between adjacent states (Full-Degraded, Degraded-Intermittent, Intermittent-Denied); direct jumps to Denied are rare (0.02-0.03/hr). Recovery from Denied follows a gradual path - the Denied-to-Intermittent rate (0.09/hr) exceeds Denied-to-Full (0.02/hr). Partition recovery architectures must anticipate phased restoration, not instant full connectivity.

**Partition Event Timeline**:

A typical 8-hour {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} operation might experience the following connectivity pattern:

{% mermaid() %}
gantt
    title CONVOY Connectivity Timeline (8-hour mission)
    dateFormat HH:mm
    axisFormat %H:%M

    section Connectivity
    Connected (L4)                :f1, 00:00, 90m
    Degraded (L2)                  :d1, 01:30, 45m
    Intermittent (L1)              :i1, 02:15, 30m
    Denied - Partition (L0-L1)    :crit, n1, 02:45, 75m
    Intermittent Recovery         :i2, 04:00, 20m
    Degraded                      :d2, 04:20, 40m
    Connected                     :f2, 05:00, 60m
    Degraded                      :d3, 06:00, 30m
    Denied - Jamming              :crit, n2, 06:30, 45m
    Intermittent                  :i3, 07:15, 25m
    Connected                     :f3, 07:40, 20m

    section Authority
    Central Coordination          :active, a1, 00:00, 90m
    Delegated Authority           :a2, 01:30, 75m
    Local Autonomy Active         :crit, a3, 02:45, 75m
    Delegated Recovery            :a4, 04:00, 60m
    Central Coordination          :active, a5, 05:00, 60m
    Delegated Authority           :a6, 06:00, 30m
    Local Autonomy Active         :crit, a7, 06:30, 45m
    Delegated Recovery            :a8, 07:15, 25m
    Central Coordination          :active, a9, 07:40, 20m

    section State Sync
    Continuous Sync               :s1, 00:00, 90m
    Priority Sync                 :s2, 01:30, 45m
    Buffering                     :s3, 02:15, 30m
    Local State Only              :crit, s4, 02:45, 75m
    Reconciliation                :done, r1, 04:00, 20m
    Priority Sync                 :s5, 04:20, 40m
    Continuous Sync               :s6, 05:00, 60m
    Priority Sync                 :s7, 06:00, 30m
    Local State Only              :crit, s8, 06:30, 45m
    Reconciliation                :done, r2, 07:15, 25m
    Continuous Sync               :s9, 07:40, 20m
{% end %}

{% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} experiences two partition events totaling 120 minutes (25% of mission time in Denied state). The architecture handles authority transitions, state buffering, and reconciliation - automatically, without human intervention.

<span id="prop-2"></span>
**Proposition 2** (Architectural Regime Boundaries). *Under stated assumptions, the stationary distribution \\(\pi\\) provides guidance for architectural choices:*

*(i) Centralized coordination may become impractical when \\(\pi_{\mathcal{C}} + \pi_{\mathcal{D}} < 0.8\\)*

*(ii) Local decision authority becomes beneficial when \\(\pi_{\mathcal{N}} > 0.1\\)*

*(iii) Opportunistic synchronization may outperform scheduled synchronization when \\(\pi_{\mathcal{I}} > 0.25\\)*

*Reasoning*: Boundary (i) follows from coordination message complexity analysis - centralized protocols require \\(O(n)\\) messages per decision, achievable only when coordinator reachability is high. Boundary (ii) follows from decision latency constraints - waiting for central authority when denial probability exceeds 10% increases expected decision delay. Boundary (iii) derives from sync window analysis - intermittent connectivity above 25% makes scheduled synchronization less reliable.

**Uncertainty note**: These boundaries are approximate. The actual transition points depend on specific system parameters (message complexity, latency tolerance, sync period). Use as heuristics, not hard rules. Systems near boundaries warrant empirical evaluation.

**Corollary 1**. *{% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} with \\(\pi = (0.32, 0.25, 0.22, 0.21)\\) falls decisively in the contested edge regime: \\(\pi_{\mathcal{C}} + \pi_{\mathcal{D}} = 0.57 < 0.8\\) precludes centralized coordination, and \\(\pi_{\mathcal{N}} = 0.21 > 0.1\\) mandates local decision authority.*

### Architectural Response: Fog Computing Layers

The connectivity spectrum suggests a natural architectural pattern: **process data at the earliest viable point** given current connectivity. This fog computing model distributes computation along the data path, with each layer adapted to the {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %} it typically experiences.

{% mermaid() %}
graph LR
    subgraph "Device Layer"
        D1["Sensor<br/>Raw data generation"]
        D2["Actuator<br/>Physical action"]
    end

    subgraph "Fog Layer"
        F1["Fog Node<br/>Filtering, aggregation<br/>Local inference"]
        F2["Fog Node<br/>Filtering, aggregation<br/>Local inference"]
    end

    subgraph "Edge Layer"
        E1["Edge Server<br/>Complex inference<br/>Multi-node correlation"]
    end

    subgraph "Cloud Layer"
        C1["Cloud<br/>Training, archival<br/>Global analytics"]
    end

    D1 -->|"100 kbps<br/>raw"| F1
    D2 <-->|"Commands"| F2
    F1 -->|"10 kbps<br/>filtered"| E1
    F2 -->|"10 kbps<br/>filtered"| E1
    E1 -.->|"1 kbps<br/>events"| C1
    C1 -.->|"Model<br/>updates"| E1
    E1 -->|"Policy<br/>updates"| F1
    E1 -->|"Policy<br/>updates"| F2

    style D1 fill:#fce4ec,stroke:#c2185b
    style D2 fill:#fce4ec,stroke:#c2185b
    style F1 fill:#e8f5e9,stroke:#388e3c
    style F2 fill:#e8f5e9,stroke:#388e3c
    style E1 fill:#fff3e0,stroke:#f57c00
    style C1 fill:#e3f2fd,stroke:#1976d2
{% end %}

The connection to the {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %} is direct: each layer operates in a different {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}. The Device-to-Fog link typically experiences Full or Degraded connectivity (local mesh). The Fog-to-Edge link experiences Intermittent connectivity (cluster boundaries). The Edge-to-Cloud link experiences Denied or Adversarial regimes under contested conditions. The architecture matches processing capability to expected connectivity.

**Data Reduction Cascade**: Each layer applies transformations that reduce data volume while preserving decision-relevant information:

{% katex(block=true) %}
\text{Volume}_{\text{cloud}} = \text{Volume}_{\text{device}} \cdot \prod_{i} r_i
{% end %}

where \\(r_i < 1\\) is the reduction ratio at layer \\(i\\). For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with \\(r_{\text{fog}} = 0.1\\) and \\(r_{\text{edge}} = 0.1\\):

{% katex(block=true) %}
\text{Volume}_{\text{cloud}} = 2.4 \text{ Gbps} \times 0.1 \times 0.1 = 24 \text{ Mbps}
{% end %}

A \\(100\times\\) reduction makes satellite backhaul feasible even during Degraded regime. But each reduction stage must preserve information sufficient for its downstream consumers. The fog layer discards raw pixels but preserves detection events. The edge layer discards individual detections but preserves track hypotheses.

**Fog processing pipeline**:

1. **Validate**: Check integrity, timestamp freshness, source authentication
2. **Filter**: Apply domain filters ({% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}: motion detection, background subtraction, ROI extraction)
3. **Infer**: Run lightweight classifiers, producing structured detections rather than raw imagery
4. **Aggregate**: Combine across time windows, suppress duplicates, compute confidence
5. **Forward**: Transmit based on novelty, confidence threshold, or heartbeat interval

### Commercial Application: GRIDEDGE Power Distribution

{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} manages a distribution network: 180,000 customers, \\(12{,}000\,\text{km}^2\\), with 847 transformers, 156 reclosers, 43 capacitor banks, and 12 substations. Smart grid sensors must coordinate protection decisions in milliseconds while regional control center connectivity may be unavailable.

Power distribution faces a unique connectivity challenge: the very events that require coordination - storms, equipment failures, vegetation contact - are the same events that damage communication infrastructure. A storm that causes a line fault likely also damages the cellular tower serving that feeder.

The Markov connectivity model for {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} captures this correlation. Compared to {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, note the elevated Intermittent-to-Denied rate \\(q_{IN}\\) and the faster recovery from Denied, reflecting correlated storm-driven outages that are severe but finite in duration.

{% katex(block=true) %}
Q_{\text{GRIDEDGE}} = \begin{bmatrix}
-0.08 & 0.05 & 0.02 & 0.01 \\
0.15 & -0.25 & 0.07 & 0.03 \\
0.04 & 0.12 & -0.28 & 0.12 \\
0.01 & 0.03 & 0.11 & -0.15
\end{bmatrix} \text{ (transitions per hour)}
{% end %}

The elevated \\(q_{IN} = 0.12\\) and \\(q_{DN} = 0.03\\) rates reflect fault-communication correlation: grid disturbances that push connectivity from Full to Degraded or Intermittent frequently cascade to Denied as the underlying cause affects both systems.

Solving \\(\pi Q = 0\\) for {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} yields the long-run fraction of time spent in each regime; the result below shows that {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} is predominantly connected but cannot rely on that — one in five hours is in Denied state.

{% katex(block=true) %}
\pi_{\text{GRIDEDGE}} = (0.46, 0.19, 0.16, 0.19)
{% end %}

{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} spends 46% of time in Full connectivity - substantially better than tactical environments, but still insufficient for cloud-dependent architecture. Critically, the 19% Denied state coincides with the highest-consequence operational decisions: fault isolation, load shedding, and protective relay coordination.

The fog computing architecture for {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} implements hierarchical protection. The diagram below shows data and command flows between each layer; dashed arrows indicate SCADA polling that may be unavailable during a storm, while solid arrows carry protection commands that must always succeed.

{% mermaid() %}
graph LR
    subgraph "Device Layer"
        S1["Smart Meter<br/>Voltage, current<br/>15-min intervals"]
        S2["Line Sensor<br/>Fault detection<br/>Sub-cycle response"]
        R1["Recloser<br/>Fault isolation<br/>60ms operation"]
    end

    subgraph "Fog Layer"
        F1["Feeder Controller<br/>Protection coordination<br/>Fault location"]
        F2["Feeder Controller<br/>Protection coordination<br/>Fault location"]
    end

    subgraph "Edge Layer"
        SUB["Substation<br/>SCADA integration<br/>Multi-feeder coordination"]
    end

    subgraph "Cloud Layer"
        RCC["Regional Control<br/>Load forecasting<br/>Outage management"]
    end

    S1 -->|"96 reads/day"| F1
    S2 -->|"Events only"| F1
    R1 <-->|"Trip/close<br/>commands"| F1
    F1 -->|"Feeder status"| SUB
    F2 -->|"Feeder status"| SUB
    SUB -.->|"SCADA<br/>polling"| RCC
    RCC -.->|"Settings<br/>updates"| SUB
    SUB -->|"Coordination<br/>settings"| F1
    SUB -->|"Coordination<br/>settings"| F2

    style S1 fill:#fce4ec,stroke:#c2185b
    style S2 fill:#fce4ec,stroke:#c2185b
    style R1 fill:#fce4ec,stroke:#c2185b
    style F1 fill:#e8f5e9,stroke:#388e3c
    style F2 fill:#e8f5e9,stroke:#388e3c
    style SUB fill:#fff3e0,stroke:#f57c00
    style RCC fill:#e3f2fd,stroke:#1976d2
{% end %}

**Device Layer** sensors generate continuous telemetry but have minimal local intelligence. Smart meters report 15-minute interval data; line sensors report event-triggered fault signatures; reclosers execute protection logic but don't coordinate independently.

**Fog Layer** feeder controllers implement the critical protection coordination. When a fault occurs, the feeder controller must:
1. Detect fault location from sensor signatures (within 100ms)
2. Determine isolation strategy - which switches to open (within 200ms)
3. Coordinate with adjacent feeders to prevent upstream trips (within 300ms)
4. Execute switching sequence (within 500ms total)

This 500ms budget is the survival constraint - slower response causes upstream breaker trips, expanding outages from tens to thousands of customers. The fog controller cannot wait for substation or regional center involvement.

**Edge Layer** substations coordinate multi-feeder response: if Feeder A trips, can Feeder B absorb transferred load? This decision requires 2-5 seconds and can tolerate intermittent fog-to-edge connectivity.

**Cloud Layer** (Regional Control Center) handles non-time-critical functions: outage reporting, crew dispatch, load forecasting, rate optimization. These tolerate minutes to hours of disconnection.

**Data reduction through fog processing**: A single 12kV feeder with 1,200 smart meters, 45 line sensors, and 8 reclosers generates approximately 11 MB/day of raw telemetry. The fog layer reduces this to 400 KB/day of processed events and status summaries - a \\(27\times\\) reduction.

### Learning Transition Rates Online

Static estimates of \\(Q\\) are insufficient for systems that must adapt to changing environments. An anti-fragile system learns its connectivity dynamics online, updating estimates as new transitions are observed.

Define \\(N_{ij}(t)\\) as the count of observed transitions from state \\(i\\) to state \\(j\\) by time \\(t\\), and \\(T_i(t)\\) as total time spent in state \\(i\\). The maximum likelihood estimate of transition rates is:

{% katex(block=true) %}
\hat{q}_{ij}(t) = \frac{N_{ij}(t)}{T_i(t)}
{% end %}

But raw MLE is unstable with sparse observations. Placing a Gamma prior over each rate \\(q_{ij}\\) — parameterized by prior pseudo-count \\(\alpha_{ij}^0\\) and prior time \\(\beta_i^0\\) — and then updating with observed transition counts \\(N_{ij}\\) and dwell time \\(T_i\\) yields a posterior that shrinks toward the prior when data are sparse.

{% katex(block=true) %}
q_{ij} \sim \text{Gamma}(\alpha_{ij}^0, \beta_i^0) \quad \Rightarrow \quad q_{ij} \mid \text{data} \sim \text{Gamma}(\alpha_{ij}^0 + N_{ij}(t), \beta_i^0 + T_i(t))
{% end %}

The prior hyperparameters \\(\alpha^0, \beta^0\\) encode baseline expectations from similar environments. The posterior concentrates around observed rates as data accumulates.

**This is where models meet their limits.** The Bayesian update assumes transitions are Markovian - future connectivity depends only on current state, not history. Real adversaries learn and adapt. A jamming system that observes {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}'s movement patterns may *change its transition rates* to maximize disruption. The model provides a useful baseline, but engineering judgment must recognize when adversarial adaptation has invalidated the model's assumptions.

### Semi-Markov Extension for Realistic Dwell Times

The basic CTMC assumes exponentially distributed dwell times in each state. Operational data often shows non-exponential patterns - jamming may have a characteristic duration, or network recovery may follow a heavy-tailed distribution.

The **semi-Markov extension** replaces exponential dwell times with general distributions \\(F_i(t)\\) for each state \\(i\\):

{% katex(block=true) %}
P(\text{dwell in state } i > t) = 1 - F_i(t) = \bar{F}_i(t)
{% end %}

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, operational telemetry suggests:
- **Connected (\\(\mathcal{C}\\))**: Exponential with rate \\(\lambda_{\mathcal{C}} = 0.15\\)/hour (memoryless)
- **Degraded (\\(\mathcal{D}\\))**: Log-normal with \\(\mu = 0.5\\), \\(\sigma = 0.8\\) (terrain-dependent)
- **Intermittent (\\(\mathcal{I}\\))**: Weibull with \\(k = 1.5\\), \\(\lambda = 2.0\\) (jamming burst patterns)
- **Denied (\\(\mathcal{N}\\))**: Pareto with \\(\alpha = 1.2\\), \\(x_m = 0.5\\) (heavy-tailed adversarial denial) (empirically calibrated to adversarial denial durations measured in {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} red-team exercises; the heavy tail captures coordinated jamming events where denial periods cluster at multiples of base duration)

The semi-Markov stationary distribution \\(\pi^{SM}\\) weights each state by how long the system actually stays there, not just how often it visits: a state visited rarely but for long periods gets more probability mass than a state visited often but briefly.

{% katex(block=true) %}
\pi_i^{SM} = \frac{\pi_i^{EMC} \cdot E[T_i]}{\sum_j \pi_j^{EMC} \cdot E[T_j]}
{% end %}

where \\(\pi^{EMC}\\) is the embedded {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov chain{% end %} distribution and \\(E[T_i]\\) is the mean sojourn time in state \\(i\\).

### Adversarial Adaptation Detection

When an adversary adapts to our connectivity patterns, the transition rates become non-stationary. We detect this through **change-point analysis** on the rate estimates.

Define the CUSUM statistic for detecting rate increase in \\(q_{ij}\\):

{% katex(block=true) %}
S_t = \max(0, S_{t-1} + (\hat{q}_{ij}(t) - q_{ij}^{baseline} - \delta))
{% end %}

where \\(\delta\\) is the minimum detectable shift. An alarm triggers when \\(S_t > h\\) for threshold \\(h\\).

**Adversarial indicators** (any triggers investigation; thresholds are configurable):
1. Transition rates to Denied (\\(\mathcal{N}\\)) state increase significantly from baseline (e.g., >50%)
2. Dwell time in Connected (\\(\mathcal{C}\\)) state decreases significantly (e.g., >30%)
3. Correlation between own actions and subsequent transitions is positive and significant
4. Recovery times from Denied state follow bimodal distribution (adversary sometimes releases, sometimes persists)

When adversarial adaptation is detected:
- Switch to pessimistic \\(Q\\) estimates (upper credible bounds)
- Reduce coordination attempts that reveal position or intent
- Increase randomization in timing and routing
- Alert operators if reachable

**Structural inconsistency with the adversarial game model (Part 5)**: The CTMC formulation above treats the generator matrix \\(Q\\) as stationary — the transition rates \\(\lambda_{CN}\\), \\(\lambda_{NC}\\) are fixed properties of the environment, and the stationary distribution \\(\pi\\) is well-defined. This is incompatible with the adversarial Markov game (Definition 32 in the anti-fragile decision-making article), where the adversary's strategy \\(\sigma_A\\) controls exactly these rates. Under an adaptive adversary, \\(Q\\) is a function of both the defender's and adversary's joint policy: \\(Q(t) = Q(\pi_D(t), \sigma_A(t))\\). The stationary distribution \\(\pi_N \approx 0.17\\) derived from the CTMC is therefore invalid when an adversary is present — the system never reaches stationarity because the adversary continuously adjusts \\(Q\\) in response to observed defender behavior. **Correct interpretation**: the CTMC model applies in non-adversarial partitioned environments (physical obstacles, atmospheric conditions, hardware faults). For adversarially contested environments, the CTMC provides an optimistic baseline that bounds performance under no adversary; actual performance under an adaptive adversary requires the game-theoretic analysis of the anti-fragile decision-making article. The adversarial indicators above are the operational bridge: they signal when to switch from the CTMC regime assumption to the adversarial game regime.

---

## Illustrative Connectivity Profiles

### Representative Parameterizations by Environment

**Methodological note**: These profiles are illustrative examples showing plausible parameter ranges. Actual deployments would derive parameters from operational data.

**Industrial IoT**: Connectivity ranges from near-cloud (clean rooms: \\(\pi_{\mathcal{C}} \approx 0.94\\)) to contested-edge (underground mining: \\(\pi_{\mathcal{C}} \approx 0.31\\)), driven by EMI, physical obstacles, and environmental extremes.

**Drone Operations**: Terrain dominates - flat terrain yields \\(\pi_{\mathcal{C}} \approx 0.89\\), mountainous terrain drops to \\(\pi_{\mathcal{C}} \approx 0.41\\). Combined adverse conditions approach tactical contested levels.

**Connected Vehicles**: Urban dense achieves \\(\pi_{\mathcal{C}} \approx 0.91\\), but tunnels create deterministic denied states (\\(\pi_{\mathcal{N}} \approx 0.86\\)). Mountain passes and urban canyons degrade reliability despite cellular coverage.

### Latency Distribution Analysis

Beyond {% term(url="#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %}, latency distribution within each regime determines operational viability. Raw connectivity percentage obscures critical timing behavior.

**Representative Latency Distributions by Regime**: The diagram shows how median latency grows from 12 ms in full connectivity to unbounded in the Denied regime; the critical pattern to observe is the extreme tail growth — p99 is already \\(10\times\\) the median in Degraded, making tail-based design mandatory.

{% mermaid() %}
graph LR
    subgraph "Full Connectivity"
        F_LAT["Median: 12ms<br/>p95: 45ms<br/>p99: 120ms"]
    end

    subgraph "Degraded"
        D_LAT["Median: 180ms<br/>p95: 850ms<br/>p99: 2.4s"]
    end

    subgraph "Intermittent"
        I_LAT["Median: 3.2s<br/>p95: 18s<br/>p99: 45s<br/>(when connected)"]
    end

    subgraph "Denied"
        N_LAT["Latency: unbounded<br/>Queue until<br/>reconnection"]
    end

    F_LAT --> D_LAT --> I_LAT --> N_LAT

    style F_LAT fill:#c8e6c9,stroke:#388e3c
    style D_LAT fill:#fff3e0,stroke:#f57c00
    style I_LAT fill:#ffcdd2,stroke:#c62828
    style N_LAT fill:#e0e0e0,stroke:#757575
{% end %}

**Statistical characterization**: Full connectivity typically follows log-normal distribution. Degraded follows gamma. Intermittent exhibits **heavy-tailed Pareto** - occasional latencies orders of magnitude higher than median. Designing for p95 latency fails on the tail.

**Latency-Capability Mapping**:

Different capabilities have different latency tolerance. We define the **viability threshold** \\(\tau_c\\) for capability \\(c\\):

{% katex(block=true) %}
P(\text{Latency} \leq \tau_c | \text{Regime}) \geq 0.95 \Rightarrow \text{Capability } c \text{ viable in regime}
{% end %}

<style>
#tbl_latency_capability + table th:first-of-type { width: 35%; }
#tbl_latency_capability + table th:nth-of-type(2) { width: 13%; }
#tbl_latency_capability + table th:nth-of-type(3) { width: 13%; }
#tbl_latency_capability + table th:nth-of-type(4) { width: 13%; }
#tbl_latency_capability + table th:nth-of-type(5) { width: 13%; }
#tbl_latency_capability + table th:nth-of-type(6) { width: 13%; }
</style>
<div id="tbl_latency_capability"></div>

The table below applies the viability condition to five capability types: a "Yes" entry means the p95 latency in that regime falls within the capability's threshold \\(\tau_c\\), making it viable there; "No" means latency exceeds the threshold at least 5% of the time.

| Capability | \\(\tau_c\\) | Full | Degraded | Intermittent | Denied |
| :--- | ---: | :---: | :---: | :---: | :---: |
| Real-time video streaming | 100ms | Yes | No | No | No |
| Synchronized coordination | 500ms | Yes | Yes | No | No |
| State reconciliation | 5s | Yes | Yes | Yes | No |
| Opportunistic sync | 60s | Yes | Yes | Yes | No |
| Store-and-forward | \\(\infty\\) | Yes | Yes | Yes | Yes |

This matrix determines which capabilities can be offered in each regime. An architecture that assumes synchronized coordination (500ms threshold) will fail most of the time in Intermittent regime - not because connectivity is zero, but because latency exceeds the viability threshold (p95 latency of 2400ms in the illustrative distribution far exceeds 500ms).

### Probabilistic Partition Models

The {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %} predicts long-run behavior but doesn't answer operational questions: *What is the probability of a partition lasting more than 1 hour? If we're currently in Degraded state, how long until we likely enter Denied?*

**First Passage Time Analysis**:

The first passage time \\(T_{ij}\\) from state \\(i\\) to state \\(j\\) has distribution determined by the generator matrix \\(Q\\). For the absorbing case (time to first reach Denied):

{% katex(block=true) %}
E[T_{\mathcal{C} \rightarrow \mathcal{N}}] = \frac{1}{q_{FN}} + \sum_{k \neq N} \frac{q_{Fk}}{q_F} E[T_{k \rightarrow N}]
{% end %}

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} with \\(Q_{\text{CONVOY}}\\):

| Starting State | Mean Time to Denied | Std Dev | p95 |
| :--- | ---: | ---: | ---: |
| Full | 8.2 hours | 6.4 hours | 19.1 hours |
| Degraded | 5.1 hours | 4.8 hours | 13.2 hours |
| Intermittent | 2.8 hours | 3.1 hours | 8.4 hours |

**Partition Duration Distribution**:

How long do partitions (Denied state) last? The formula below gives the survival function \\(P(T_N > t)\\) — the probability that a partition lasts longer than \\(t\\) hours — modeled as a mixture of two exponentials with rates \\(\lambda_1\\) (short bursts, 70% of partitions) and \\(\lambda_2\\) (extended outages, 30% of partitions).

{% katex(block=true) %}
P(T_N > t) = \begin{cases}
e^{-\lambda_1 t} \cdot 0.7 + e^{-\lambda_2 t} \cdot 0.3 & \text{(mixture model)} \\
\lambda_1 = 2.1/\text{hour}, \lambda_2 = 0.15/\text{hour}
\end{cases}
{% end %}

The **bimodal mixture** captures two partition types:
- **Short partitions** (70%): Mean 29 minutes, caused by terrain shadowing, temporary interference
- **Long partitions** (30%): Mean 6.7 hours, caused by equipment failure, extended RF denial

This has profound architectural implications: systems must handle both brief interruptions (store-and-forward sufficient) and extended autonomy (local decision authority required).

**Conditional Partition Probability**: Longer dwell in degraded states increases partition probability. Semi-{% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %}s capture this non-Markovian behavior, suggesting proactive measures (state sync, authority delegation) when degraded dwell time exceeds thresholds.

### Module Placement Strategies

**Placement Optimization Formulation**:

Let \\(M\\) be the set of modules and \\(L\\) be the set of placement locations (device, fog, edge, cloud). For module \\(m\\) placed at location \\(l\\), the binary decision variable \\(x_{ml} = 1\\) if module \\(m\\) is assigned to location \\(l\\). The objective minimizes total expected latency across all modules.

{% katex(block=true) %}
\text{minimize} \sum_{m \in M} \sum_{l \in L} x_{ml} \cdot E[\text{Latency}(m, l)]
{% end %}

The three constraints below enforce that each module is placed exactly once, and that CPU and memory capacity at each location is not exceeded.

{% katex(block=true) %}
\begin{aligned}
\sum_{l \in L} x_{ml} &= 1 \quad \forall m && \text{(each module placed once)} \\
\sum_{m \in M} x_{ml} \cdot \text{CPU}(m) &\leq \text{CPU}(l) \quad \forall l && \text{(CPU constraint)} \\
\sum_{m \in M} x_{ml} \cdot \text{Mem}(m) &\leq \text{Mem}(l) \quad \forall l && \text{(memory constraint)} \\
x_{ml} &\in \{0, 1\}
\end{aligned}
{% end %}

**Expected latency** is the connectivity-weighted average of latency across all regimes, where the stationary probabilities \\(\pi_\Xi\\) serve as weights and cloud-dependent modules contribute infinite latency in the Denied regime.

{% katex(block=true) %}
E[\text{Latency}(m, l)] = \sum_{\Xi \in \{\mathcal{C},\mathcal{D},\mathcal{I},\mathcal{N}\}} \pi_{\Xi} \cdot \text{Latency}(m, l, \Xi)
{% end %}

where \\(\text{Latency}(m, l, \mathcal{N}) = \infty\\) for cloud-dependent modules during Denied regime.

**Placement Heuristics by Module Type**:

<style>
#tbl_placement_strategy + table th:first-of-type { width: 22%; }
#tbl_placement_strategy + table th:nth-of-type(2) { width: 20%; }
#tbl_placement_strategy + table th:nth-of-type(3) { width: 28%; }
#tbl_placement_strategy + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_placement_strategy"></div>

| Module Type | Optimal Placement | Rationale | Example |
| :--- | :--- | :--- | :--- |
| Safety-critical | Device/Fog | Must function in Denied | Collision avoidance |
| Time-critical (<100ms) | Fog | Latency budget excludes cloud | Fault detection |
| Coordination | Edge | Needs multi-node visibility | Formation control |
| Learning/adaptation | Cloud (cached at edge) | Compute-intensive, tolerates delay | Model training |
| Archival/audit | Cloud | Not time-sensitive | Log storage |

**Connectivity-Aware Placement Algorithm**:

The placement proceeds in phases, respecting the constraint sequence:

**Phase 1 (Survival)**: Place all modules that must function in Denied regime at device or fog layer. These are non-negotiable - if \\(\pi_N > 0.05\\), any cloud-dependent safety function is architectural malpractice.

**Phase 2 (Time-critical)**: For modules with latency threshold \\(\tau < 500\\)ms, verify that the placement meets the constraint below, which requires the total probability mass of regimes where the module can respond within \\(\tau\\) to be at least 95%.

{% katex(block=true) %}
\sum_{r: \text{Latency}(m,l,r) \leq \tau} \pi_r \geq 0.95
{% end %}

If cloud placement fails this test, move to edge. If edge fails, move to fog.

**Phase 3 (Optimization)**: Remaining modules placed to minimize cost subject to latency SLO. Cloud preferred for compute cost; edge/fog preferred for latency.

**{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} Placement Example**:

| Module | Latency Requirement | Placement | Rationale |
| :--- | :--- | :--- | :--- |
| Fault detection | <100ms | Fog (feeder controller) | p95 latency to edge = 340ms |
| Protection coordination | <500ms | Fog | Must function during storm |
| Load balancing | <5s | Edge (substation) | Multi-feeder visibility needed |
| Demand forecasting | <1 hour | Cloud | Compute-intensive ML |
| Regulatory reporting | <24 hours | Cloud | Not time-sensitive |

### Redundancy Planning Framework

Connectivity regimes determine redundancy requirements. The goal: maintain capability despite connectivity loss and component failure.

**Redundancy Dimensions**:

1. **Compute redundancy**: Multiple nodes capable of running critical modules
2. **Data redundancy**: State replicated across connectivity boundaries
3. **Path redundancy**: Multiple communication paths to higher tiers
4. **Authority redundancy**: Backup decision-makers when primary unreachable

**Redundancy Factor Calculation**:

The required redundancy factor \\(R\\) for capability \\(c\\) with availability target \\(A_c\\):

{% katex(block=true) %}
R_c = \left\lceil \frac{\ln(1 - A_c)}{\ln(1 - a)} \right\rceil
{% end %}

where \\(a\\) is single-component availability. For \\(a = 0.95\\) and \\(A_c = 0.999\\):

{% katex(block=true) %}
R_c = \left\lceil \frac{\ln(0.001)}{\ln(0.05)} \right\rceil = \left\lceil \frac{-6.9}{-3.0} \right\rceil = 3
{% end %}

**Connectivity-Adjusted Redundancy**:

Component availability varies by {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}. The formula below computes effective availability \\(a_{\text{eff}}\\) as the regime-weighted average of per-regime availability \\(a_r\\), using the stationary distribution \\(\pi_r\\) as weights.

{% katex(block=true) %}
a_{\text{eff}} = \sum_{r \in \{F,D,I,N\}} \pi_r \cdot a_r
{% end %}

For a cloud-dependent component with \\(a_F = 0.99, a_D = 0.95, a_I = 0.7, a_N = 0\\):

{% katex(block=true) %}
a_{\text{eff}} = 0.32 \cdot 0.99 + 0.25 \cdot 0.95 + 0.22 \cdot 0.7 + 0.21 \cdot 0 = 0.71
{% end %}

To achieve 99.9% availability with \\(a_{\text{eff}} = 0.71\\):

{% katex(block=true) %}
R_c = \left\lceil \frac{\ln(0.001)}{\ln(0.29)} \right\rceil = 6
{% end %}

**Six redundant cloud instances** are needed - versus three if connectivity were reliable. This quantifies the cost of building on unreliable connectivity.

**Hierarchical Redundancy Architecture**: The diagram shows how redundancy factor increases from R=1 at the device layer to R=3 at the cloud layer, reflecting that cloud components depend on connectivity probability multiplied with component availability — the further from the device, the more replicas are needed to reach the same effective availability.

{% mermaid() %}
graph TD
    subgraph "Device Layer (R=1)"
        D1["Sensor"]
        D2["Sensor"]
    end

    subgraph "Fog Layer (R=2)"
        F1["Fog Node A<br/>(primary)"]
        F2["Fog Node B<br/>(standby)"]
    end

    subgraph "Edge Layer (R=2)"
        E1["Edge Server 1<br/>(active)"]
        E2["Edge Server 2<br/>(active)"]
    end

    subgraph "Cloud Layer (R=3)"
        C1["Region A"]
        C2["Region B"]
        C3["Region C"]
    end

    D1 --> F1
    D1 -.-> F2
    D2 --> F1
    D2 -.-> F2
    F1 --> E1
    F1 -.-> E2
    F2 --> E1
    F2 -.-> E2
    E1 -.-> C1
    E1 -.-> C2
    E2 -.-> C2
    E2 -.-> C3

    style F2 fill:#fff3e0,stroke:#f57c00
    style E2 fill:#fff3e0,stroke:#f57c00
    style C2 fill:#e3f2fd,stroke:#1976d2
    style C3 fill:#e3f2fd,stroke:#1976d2
{% end %}

**Redundancy decreases toward device layer** because device-layer components must function independently (R=1 is acceptable if the device itself is the unit of survival). **Redundancy increases toward cloud layer** because cloud availability is multiplied by connectivity probability.

**State Replication Strategy**:

For CRDT-based state, replication factor determines reconciliation complexity:

| State Type | Replication | Rationale |
| :--- | :--- | :--- |
| Safety-critical | 3+ (fog layer) | Must survive any single failure |
| Coordination | 2 (edge layer) | Cluster-level redundancy |
| Archival | 3 (cloud, geo-distributed) | Durability over availability |

**Cross-Boundary Replication**:

State that must survive connectivity loss should be replicated *across* connectivity boundaries:

{% katex(block=true) %}
\text{Replication set} = \{l_1, l_2, ..., l_R\} \text{ where } \forall i,j: P(\text{simultaneous denial}) < \epsilon
{% end %}

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, placing one replica at each vehicle (T3), one at platoon controller (T2), and one at convoy coordinator (T1) ensures state survives any single connectivity boundary failure.

**Redundancy Cost-Benefit Analysis**: The table below shows how effective availability and cost scale together as redundancy increases, using the {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} \\(a_{\text{eff}} = 0.71\\) baseline; the Break-even column gives the minimum per-hour downtime cost that justifies each additional replica.

| Redundancy Level | Compute Cost | Storage Cost | Availability | Break-even |
| :--- | :--- | :--- | :--- | :--- |
| R=1 | 1x | 1x | 71% | Baseline |
| R=2 | 2x | 2x | 92% | If downtime >$50/hr |
| R=3 | 3x | 3x | 98% | If downtime >$200/hr |
| R=4 | 4x | 4x | 99.4% | If downtime >$800/hr |

The economic break-even depends on downtime cost. Safety-critical systems (infinite downtime cost) justify maximum redundancy; informational systems may accept R=1.

### Synthesis: From Connectivity Analysis to Architecture

The illustrative profiles, latency distributions, and redundancy calculations converge on architectural guidance:

**For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}-like environments** (\\(\pi_N > 0.2\\), partition duration potentially hours):
- Place all safety-critical modules at device layer
- Assume no cloud availability for operational decisions
- Design for 14+ hour autonomous operation
- Redundancy factor 3+ for coordination state

**For {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}-like environments** (\\(\pi_N \approx 0.13\\), partitions short but frequent):
- Place time-critical modules at fog layer
- Design for rapid state reconciliation on reconnection
- Redundancy factor 2 for coordination state
- Exploit predictable partition patterns (tunnel schedules)

**For {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}-like environments** (\\(\pi_N \approx 0.19\\), fault-connectivity correlation):
- Place protection logic at fog layer with zero cloud dependency
- Design for correlated failures (grid fault = communication fault)
- Redundancy factor 3 for protection state
- Pre-position restoration authority at fog layer

The {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %} analysis transforms abstract architectural principles into quantified design decisions.

### Component Interactions: From Theory to Implementation

The theoretical framework - Markov connectivity, capability hierarchy, tiered architecture - manifests in concrete component interfaces. Understanding these interactions clarifies how autonomic behavior emerges from well-defined contracts between system layers.

**{% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} Component Interfaces**

Each tier exposes three interface categories to adjacent tiers:

<style>
#tbl_autohauler_interfaces + table th:first-of-type { width: 15%; }
#tbl_autohauler_interfaces + table th:nth-of-type(2) { width: 20%; }
#tbl_autohauler_interfaces + table th:nth-of-type(3) { width: 30%; }
#tbl_autohauler_interfaces + table th:nth-of-type(4) { width: 35%; }
</style>
<div id="tbl_autohauler_interfaces"></div>

The table below enumerates every inter-tier message type in {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}, including the cadence (Message Pattern) and the information carried; the peer coordination row is the only one that operates without any parent involvement.

| Tier | Interface Type | Message Pattern | Content |
| :--- | :--- | :--- | :--- |
| **T3 to T2** | Status Report | Every 2s + on-event | Position, speed, load state, obstacle detections |
| **T2 to T3** | Route Command | On-change | Waypoint sequence, speed limits, priority |
| **T3 peer** | Peer Coordination | Ad-hoc | Precedence negotiation, passing intention |
| **T2 to T1** | Segment Status | Every 30s + on-event | Truck positions, queue lengths, incidents |
| **T1 to T2** | Zone Policy | Every 5min + on-change | Traffic rules, speed limits, restricted areas |
| **T1 to T0** | Production Data | Every 15min | Tonnes moved, cycle times, equipment status |
| **T0 to T1** | Shift Plan | Every 8h | Route assignments, maintenance windows |

The **delegated authority** model governs what happens when connectivity fails. The diagram below shows how each tier's responsibilities expand when its parent tier becomes unreachable; read left-to-right to compare normal operation with the two partition cases.

{% mermaid() %}
flowchart LR
    subgraph "Normal Operation"
        T3N["Truck: Execute route<br/>Report status"]
        T2N["Segment: Coordinate traffic<br/>Forward commands"]
        T1N["Pit: Optimize allocation<br/>Handle exceptions"]
    end

    subgraph "T2 Disconnected from T1"
        T3D["Truck: No change<br/>Continue route"]
        T2D["Segment: ELEVATED<br/>+Route reassignment<br/>+Exception handling"]
    end

    subgraph "T3 Disconnected from T2"
        T3I["Truck: AUTONOMOUS<br/>+Obstacle response<br/>+Peer-only coord<br/>+Safe stop if needed"]
    end

    T3N --> T3D
    T2N --> T2D
    T3N --> T3I

    style T3N fill:#e8f5e9,stroke:#388e3c
    style T2N fill:#e8f5e9,stroke:#388e3c
    style T1N fill:#e8f5e9,stroke:#388e3c
    style T2D fill:#fff3e0,stroke:#f57c00
    style T3D fill:#e8f5e9,stroke:#388e3c
    style T3I fill:#fce4ec,stroke:#c2185b
{% end %}

When a truck enters an ore pass tunnel (T3 disconnected from T2), it activates autonomous mode:
- Maintain current route
- Use LIDAR for collision avoidance
- Broadcast position on short-range radio for peer coordination
- If blocked >90s: initiate safe stop, await reconnection or human intervention

**{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} Message Flows**

Protection coordination requires precise timing. The fog-layer feeder controller implements a state machine with strict timing bounds:

<style>
#tbl_gridedge_states + table th:first-of-type { width: 18%; }
#tbl_gridedge_states + table th:nth-of-type(2) { width: 15%; }
#tbl_gridedge_states + table th:nth-of-type(3) { width: 32%; }
#tbl_gridedge_states + table th:nth-of-type(4) { width: 35%; }
</style>
<div id="tbl_gridedge_states"></div>

The table below defines the feeder controller state machine; the Max Duration column is the hard time budget for each state — exceeding it causes upstream protection to operate and enlarges the outage.

| State | Max Duration | Inputs | Outputs |
| :--- | :--- | :--- | :--- |
| **MONITORING** | Indefinite | Sensor telemetry at 4 samples/cycle | Aggregated status to substation |
| **FAULT_DETECTED** | 50ms | Fault signatures from line sensors | Block signal to upstream, location estimate |
| **ISOLATING** | 150ms | Confirmation from adjacent controllers | Trip commands to sectionalizing switches |
| **VERIFYING** | 200ms | Switch position feedback | Isolation complete message to substation |
| **RESTORATION** | 5s | Substation authorization (if available) | Reclose commands, load transfer requests |

The critical path - from fault detection to isolation - must complete within 200ms with zero upstream communication. The fog controller makes the isolation decision locally, using pre-configured coordination tables that define which switches to open for each fault location.

Inter-feeder coordination uses a simple protocol: when Feeder A detects a fault, it broadcasts a **block signal** containing fault location and estimated magnitude. Adjacent feeders receiving this signal suppress their own upstream trip for a coordination window (100ms), allowing Feeder A to isolate the fault before upstream protection operates. If Feeder A fails to isolate within the window, adjacent feeders proceed with their own protection logic.

This protocol is **connectivity-agnostic**: if the inter-feeder link is available, coordination improves selectivity (smaller outage scope); if unavailable, each feeder protects independently with wider isolation (larger outage scope but still safe). The system degrades gracefully rather than failing catastrophically.

**API Patterns Common to Both Systems**

Both {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} and {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} implement three API patterns that emerge from the theoretical framework:

1. **Heartbeat with Capability**: Regular status messages include not just health indicators but current {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %}. A truck reporting "L1 capability" signals it can follow routes but cannot coordinate with peers. A feeder controller reporting "L2 capability" signals it can coordinate with adjacent feeders but cannot optimize with substation.

2. **Command with Deadline**: All commands include an expiration timestamp. A route command expiring in 30 seconds gives the truck time to request clarification; a route command expiring in 3 seconds indicates urgency. Expired commands are discarded, not executed - preventing stale instructions from causing harm after connectivity restoration.

3. **State Merge on Reconnection**: When connectivity restores, components exchange state digests (compact representations of decisions made during disconnection). Conflicts are resolved using domain-specific rules: for {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}, completed actions are facts (a truck that already dumped cannot un-dump); for {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}, switch positions are facts but restoration sequences can be adjusted.

---

## Why Mobile Offline-First Doesn't Transfer

A common misconception in edge architecture: "We solved offline-first for mobile apps. Edge computing is just the same problem at larger scale."

This reasoning fails in three critical dimensions:

### Scale of Autonomous Decision Authority

Mobile offline-first caches user data locally for eventual synchronization. The app can show a spinner, display stale content, or prompt the user to retry later. No permanent decisions are made without eventual confirmation.

Tactical edge systems must make **irrevocable decisions** without central coordination. The {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm cannot display a spinner while waiting to confirm target classification. The {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} cannot defer route selection until connectivity resumes. The {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} cannot pause defensive response pending approval from headquarters.

Define decision reversibility \\(R(d)\\) as the probability that decision \\(d\\) can be undone given reconnection within time horizon \\(T\\):

{% katex(block=true) %}
R(d) = P(\text{can undo } d \mid \text{reconnection within } T)
{% end %}

For mobile applications, \\(R(d) \approx 1\\) for most decisions. Cached writes can be reconciled. Optimistic updates can be rolled back. Conflicts can be resolved by user intervention.

For tactical edge systems, \\(R(d) \ll 1\\) for critical decisions:

<style>
#tbl_decision_reversibility + table th:first-of-type { width: 30%; }
#tbl_decision_reversibility + table th:nth-of-type(2) { width: 20%; }
#tbl_decision_reversibility + table th:nth-of-type(3) { width: 50%; }
</style>
<div id="tbl_decision_reversibility"></div>

The table below ranks five tactical decision types by reversibility \\(R(d)\\); a value of 0.0 means the action cannot be undone under any reconnection scenario, while a value of 0.7 means a later central authority can usually correct the outcome.

| Decision Type | R(d) | Consequence of Error |
| :--- | :--- | :--- |
| Physical intervention | 0.0 | Physical actions cannot be recalled |
| Route commitment | 0.1 | Fuel consumed, position revealed, time lost |
| Resource expenditure | 0.2 | Power, fuel, consumables depleted |
| Formation change | 0.4 | Coordination state diverged, reconvergence costly |
| Priority adjustment | 0.7 | Opportunity cost, suboptimal allocation |

Irreversibility adds regret cost to the decision function. The formula below expresses total decision cost as the sum of the immediate cost and a regret term scaled by \\((1 - R(d))\\) — decisions that cannot be undone carry their full worst-case loss, while reversible decisions carry none.

{% katex(block=true) %}
\text{Cost}(d) = \text{immediate\_cost}(d) + (1 - R(d)) \cdot \text{regret\_bound}(d)
{% end %}

where \\(\text{regret\\_bound}(d)\\) is the worst-case loss from decision \\(d\\) if it cannot be undone and proves incorrect.

### Adversarial Environment

Mobile offline assumes benign network failure. Contested edge assumes **active adversary** exploiting partition:

- **Jam selectively**: Disrupt coordination while monitoring response
- **Partition strategically**: Isolate high-value nodes
- **Inject false data**: Poison state during reconnection
- **Time attacks**: Trigger partition at maximum-consequence moments

Every protocol must consider "what if the network is being used against us." {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} in mountain transit: vehicle 2's position updates conflict with vehicle 3's direct observation. Software bug? GPS multipath? Adversary spoofing?

Mobile apps trust platform identity infrastructure. Tactical edge must verify peer identity continuously, detect compromise anomalies, and isolate corrupted nodes without fragmenting the fleet.

### Fleet Coordination Requirements

Mobile devices operate independently; state divergence between phones is tolerable. Edge fleets must maintain **coordinated behavior** across partitioned subgroups. When {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} fragments into three clusters, each must:

- Avoid duplicating surveillance coverage
- Maintain coherent operational policies
- Preserve formation geometry enabling rapid reconvergence
- Make decisions consistent when other clusters' decisions are revealed

Coordination without communication is the defining challenge of tactical edge architecture.

---

## The Edge Constraint Triangle

Three fundamental constraints compete in every edge communication decision; the diagram below shows the triangle structure where each edge label names the mechanism by which improving one vertex degrades an adjacent one.

{% mermaid() %}
graph TD
    B["Bandwidth<br/>(bits per second)"] ---|"FEC overhead<br/>reduces throughput"| R["Reliability<br/>(delivery probability)"]
    R ---|"retransmissions<br/>add delay"| L["Latency<br/>(end-to-end delay)"]
    L ---|"faster = less<br/>error correction"| B

    style B fill:#e3f2fd,stroke:#1976d2
    style L fill:#fff3e0,stroke:#f57c00
    style R fill:#e8f5e9,stroke:#388e3c
{% end %}

**The Edge Triangle Theorem** (informal): You cannot simultaneously maximize bandwidth, minimize latency, and ensure reliability in a contested communication environment. Improving any one dimension requires sacrificing at least one other.

### Mathematical Formalization

Define the achievable operating point as a vector in \\(\mathbb{R}^3\\): \\((B, L^{-1}, R)\\) where higher is better for all dimensions. The achievable region is bounded by fundamental constraints:

**Shannon-limited bandwidth-reliability tradeoff:**

For a channel with capacity \\(C\\) bits/second and target bit error rate \\(\epsilon\\), the achievable information rate \\(R\\) is bounded by:

{% katex(block=true) %}
R \leq C \cdot (1 - H(\epsilon))
{% end %}

where \\(H(\epsilon) = -\epsilon \log_2 \epsilon - (1-\epsilon) \log_2(1-\epsilon)\\) is the binary entropy. Lower error rates (higher reliability) require more redundancy, reducing effective throughput.

**Latency-reliability tradeoff (ARQ protocols):**

With per-packet success probability \\(p\\), the expected number of transmissions until success follows a geometric distribution:

{% katex(block=true) %}
E[L] = L_{\text{base}} + L_{\text{RTT}} \cdot \frac{1-p}{p}
{% end %}

To guarantee reliability \\(R_{\text{target}}\\) with bounded retries, the required attempt count \\(k\\) satisfies \\(1-(1-p)^k \geq R_{\text{target}}\\), yielding:

{% katex(block=true) %}
k \geq \left\lceil \frac{\ln(1 - R_{\text{target}})}{\ln(1 - p)} \right\rceil
{% end %}

Higher reliability targets require exponentially more retransmission attempts as \\(R_{\text{target}} \to 1\\).

**Power-constrained bandwidth**: The Shannon capacity bound below gives the maximum achievable bit rate as a function of transmit power \\(P\\), path gain \\(G\\), noise density \\(N_0\\), and channel width \\(W\\) — increasing transmit power yields diminishing returns due to the logarithmic relationship.

{% katex(block=true) %}
B \leq W \log_2\left(1 + \frac{P \cdot G}{N_0 \cdot W}\right)
{% end %}

where \\(P\\) is transmit power, \\(G\\) is path gain, \\(N_0\\) is noise spectral density, and \\(W\\) is channel bandwidth.

### The Pareto Frontier

These constraints define a Pareto frontier - the set of achievable operating points where no dimension can be improved without degrading another. The frontier surface can be parameterized by the power allocation \\(\alpha \in [0,1]\\) between error correction (improving \\(R\\)) and raw transmission (improving \\(B\\)):

{% katex(block=true) %}
\begin{aligned}
B(\alpha) &= (1-\alpha) \cdot C \cdot (1 - H(\epsilon)) \\
R(\alpha) &= 1 - (1-\alpha) \cdot \epsilon^{k(\alpha)} \\
L(\alpha) &= L_{\text{base}} + \alpha \cdot L_{\text{FEC}}
\end{aligned}
{% end %}

where \\(k(\alpha)\\) is the error correction coding gain and \\(L_{\text{FEC}}\\) is the latency overhead of forward error correction.

*Concrete example*: For {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} with \\(C = 9600\\) bps, \\(\epsilon = 0.01\\), \\(L_{\text{base}} = 50\\)ms, \\(L_{\text{FEC}} = 100\\)ms:
- At \\(\alpha = 0\\) (no FEC): \\(B = 8800\\) bps, \\(R = 0.99\\), \\(L = 50\\)ms
- At \\(\alpha = 0.5\\) (balanced): \\(B = 4400\\) bps, \\(R = 0.9999\\), \\(L = 100\\)ms
- At \\(\alpha = 1\\) (max reliability): \\(B = 0\\) bps, \\(R = 1.0\\), \\(L = 150\\)ms

The optimal operating point depends on mission requirements. For {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} alert distribution, reliability dominates (\\(\alpha \rightarrow 1\\)). For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} sensor streaming, bandwidth dominates (\\(\alpha \rightarrow 0\\)). For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} coordination, latency dominates (minimize \\(L\\) subject to \\(R \geq R_{\min}\\)).

### Architectural Response: Distributed Proxy Mesh

The edge constraint triangle suggests that different message types require different operating points. A **distributed proxy mesh** pattern addresses this by placing intelligent intermediaries throughout the network that can dynamically select operating points per-message-class.

{% mermaid() %}
graph TB
    subgraph "Application Tier"
        A1["App Instance"]
        A2["App Instance"]
        A3["App Instance"]
    end

    subgraph "Proxy Mesh"
        P1["Proxy<br/>Local queue<br/>Protocol bridge"]
        P2["Proxy<br/>Local queue<br/>Protocol bridge"]
        P3["Proxy<br/>Local queue<br/>Protocol bridge"]
        P4["Proxy<br/>Local queue<br/>Protocol bridge"]
    end

    subgraph "Backend Services"
        S1["Service A"]
        S2["Service B"]
    end

    A1 --> P1
    A2 --> P2
    A3 --> P3
    P1 <--> P2
    P2 <--> P3
    P3 <--> P4
    P1 <--> P4
    P4 --> S1
    P4 --> S2
    P2 -.->|"Failover<br/>path"| S1

    style A1 fill:#fce4ec,stroke:#c2185b
    style A2 fill:#fce4ec,stroke:#c2185b
    style A3 fill:#fce4ec,stroke:#c2185b
    style P1 fill:#e8f5e9,stroke:#388e3c
    style P2 fill:#e8f5e9,stroke:#388e3c
    style P3 fill:#e8f5e9,stroke:#388e3c
    style P4 fill:#e8f5e9,stroke:#388e3c
    style S1 fill:#e3f2fd,stroke:#1976d2
    style S2 fill:#e3f2fd,stroke:#1976d2
{% end %}

Each proxy navigates the constraint triangle via four responsibilities:

1. **Queue management**: Persistent outbound queue, accumulating when downstream unreachable
2. **Protocol translation**: Bridge between verbose protocols (gRPC, HTTP/2) on local links and compact protocols (CBOR over CoAP) on tactical links
3. **Route discovery**: Maintain topology, compute paths, shift to alternates when primary routes fail
4. **Load distribution**: Shed load by priority during congestion - critical messages proceed, bulk defers

**Message routing phases**:

1. **Resolve**: Look up destination in routing table; flood discovery to neighbors (TTL-limited) if not found
2. **Select path**: Evaluate paths by cost \\(C_{\text{path}} = w_1 \cdot \text{latency} + w_2 \cdot \text{loss\\_rate} + w_3 \cdot \text{congestion}\\); choose minimum
3. **Transmit**: Send on selected path, start ack timer \\(T_{\text{ack}} = 2 \times \text{RTT}_{\text{estimated}}\\)
4. **Handle outcome**: On ack: complete; on timeout: retry or mark path degraded, return to step 2

### OUTPOST Power Optimization Problem

The {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} remote monitoring station operates with severe power constraints. Solar panels and batteries provide 50W average for communications. The mesh network must support three mission-critical functions:

1. **Sensor fusion**: Aggregating data from 100+ perimeter sensors
2. **Command relay**: Maintaining contact with {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} and {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} when possible
3. **Alert distribution**: Ensuring threat warnings reach all defended positions

Three communication channels are available:

<style>
#tbl_outpost_channels + table th:first-of-type { width: 18%; }
#tbl_outpost_channels + table th:nth-of-type(2) { width: 18%; }
#tbl_outpost_channels + table th:nth-of-type(3) { width: 18%; }
#tbl_outpost_channels + table th:nth-of-type(4) { width: 18%; }
#tbl_outpost_channels + table th:nth-of-type(5) { width: 28%; }
</style>
<div id="tbl_outpost_channels"></div>

| Channel | Power | Bandwidth | Reliability | Vulnerability |
| :--- | ---: | ---: | ---: | :--- |
| HF Radio | 15W | 4.8 kbps | 0.92 | Low (beyond line-of-sight jamming) |
| SATCOM | 25W | 256 kbps | 0.75 | High (contested orbital environment) |
| Mesh WiFi | 8W | 54 Mbps | 0.98 | Medium (local jamming effective) |

Define decision variables \\(x_i \in [0,1]\\) as allocation fraction for channel \\(i\\), and let \\(a_i \in \{0,1\}\\) indicate whether channel \\(i\\) is designated for critical alerts. The optimization problem:

{% katex(block=true) %}
\begin{aligned}
\max_{x,a} \quad & U(x) = \sum_i w_i \cdot B_i \cdot R_i \cdot x_i \\
\text{s.t.} \quad & \sum_i P_i \cdot x_i \leq 50W & \text{(power budget)} \\
& 1 - \prod_i (1 - R_i)^{a_i} \geq 0.99 & \text{(alert reliability)} \\
& \min_{i: a_i=1} L_i \leq 2s & \text{(alert latency)} \\
& a_i \leq \mathbf{1}_{x_i > 0} \quad \forall i & \text{(can only alert on active channels)} \\
& x_i \geq 0 \quad \forall i
\end{aligned}
{% end %}

where \\(w_i\\) are importance weights and \\(L_i\\) is latency for channel \\(i\\). The alert reliability constraint requires sufficient channel diversity; the latency constraint bounds worst-case alert delivery time.

**Solution structure**: At optimum, {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} allocates Mesh WiFi for bulk sensor fusion (high bandwidth, local reliability), HF Radio for alert distribution (unjammable, acceptable latency), and SATCOM opportunistically for external coordination when available and not contested.

**Model limits**: Reliability estimates \\(R_i\\) assume steady-state. An adversary observing {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}'s allocation can adapt - jamming relied-upon channels, backing off abandoned ones. The system must periodically *test* channel assumptions, not merely optimize on stale estimates.

---

## Latency as Survival Constraint

In cloud systems, latency is a UX metric with smooth economic cost. In tactical edge systems, latency is a **survival constraint** - the difference between detecting a threat at \\(t\\) versus \\(t + \Delta t\\) may determine mission success.

### Adversarial Decision Loop Model

Define the adversary's Observe-Decide-Act (ODA) loop time as \\(T_A\\), and our own ODA loop time as \\(T_O\\). The **decision advantage** \\(\Delta\\) is:

{% katex(block=true) %}
\Delta = T_A - T_O
{% end %}

- If \\(\Delta > 0\\): We complete our decision loop before the adversary can respond to our previous action
- If \\(\Delta < 0\\): The adversary has initiative; we are always reacting to their completed actions
- If \\(\Delta \approx 0\\): Parity; outcomes depend on decision quality rather than speed

For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} conducting surveillance of a mobile threat:

{% katex(block=true) %}
T_O = T_{\text{sense}} + T_{\text{process}} + T_{\text{coordinate}} + T_{\text{act}}
{% end %}

<style>
#tbl_raven_latency + table th:first-of-type { width: 25%; }
#tbl_raven_latency + table th:nth-of-type(2) { width: 20%; }
#tbl_raven_latency + table th:nth-of-type(3) { width: 55%; }
</style>
<div id="tbl_raven_latency"></div>

| Component | Time | Notes |
| :--- | ---: | :--- |
| Sensor acquisition | 50ms | Radar/optical capture, fixed by physics |
| Local classification | 100ms | On-node ML inference, hardware-limited |
| Swarm notification | Variable | Depends on connectivity regime |
| Coordinated response | 200ms | Formation adjustment, task allocation |

Total ODA: \\(T_O = 350\text{ms} + T_{\text{coordinate}}\\)

Intelligence estimates adversary anti-drone system response at \\(T_A \approx 800\text{ms}\\). For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} to maintain decision advantage:

{% katex(block=true) %}
T_{\text{coordinate}} < T_A - 350\text{ms} = 450\text{ms}
{% end %}

This 450ms coordination budget is the binding constraint on {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s communication architecture.

### Latency Distribution Analysis

Mean latency tells only part of the story. For survival-critical systems, the **tail distribution** determines whether occasional slow responses become fatal delays.

Assume coordination latency follows an exponential distribution with rate \\(\mu\\) under normal conditions, but exhibits heavy tails under jamming. The composite distribution:

{% katex(block=true) %}
F(t) = (1-p) \cdot (1 - e^{-\mu t}) + p \cdot (1 - e^{-\mu_{\text{jammed}} t})
{% end %}

where \\(p\\) is the probability of encountering jamming conditions and \\(\mu_{\text{jammed}} \ll \mu\\).

*For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with \\(\mu = 10/\text{s}\\) (mean 100ms), \\(\mu_{\text{jammed}} = 1/\text{s}\\) (mean 1000ms), and \\(p = 0.3\\):*
- **Mean latency**: \\(E[T] = 0.7 \times 100 + 0.3 \times 1000 = 370\\)ms
- **95th percentile**: ~1800ms (far exceeds 450ms budget)
- **99th percentile**: ~3400ms (\\(9.2\times\\) mean)

The heavy tail means roughly 20% of coordination attempts will miss the 450ms deadline, potentially causing {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} to lose decision advantage during those windows. Design implications: either reduce \\(p\\) through better anti-jamming, or accept frequent degraded-mode operation.

### Queueing Theory Application

Model swarm notification as a message distribution problem. When a node detects a threat, it must propagate this detection to \\(n-1\\) peer nodes. In contested environments, not all nodes are reachable directly.

Under full connectivity, epidemic (gossip) protocols achieve logarithmic propagation time \\(T_{\text{gossip}} = O(\ln n / \ln k) \cdot T_{\text{round}}\\), where \\(k\\) is fanout. This follows from the logistic dynamics of information spread: each informed node informs \\(k\\) peers per round, leading to exponential growth until saturation. For tactical parameters (\\(n = 50\\), \\(k = 6\\), \\(T_{\text{round}} = 20\text{ms}\\)), this yields \\(\approx 44\text{ms}\\) - within coordination budgets, versus \\(1000\text{ms}\\) for linear broadcast.

Under partition, the swarm fragments. If jamming divides {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} into three clusters of sizes \\(n_1 = 20\\), \\(n_2 = 18\\), \\(n_3 = 9\\), intra-cluster gossip completes quickly, but inter-cluster propagation requires relay through connectivity bridges - if any exist.

Define \\(p_{\text{bridge}}\\) as the probability that at least one node maintains connectivity across cluster boundaries. If \\(p_{\text{bridge}} = 0\\), clusters operate independently with no shared awareness. The coordination time becomes undefined (or infinite).

**The optimization problem**: Choose swarm geometry (inter-node distances, altitude distribution, relay positioning) to maximize \\(p_{\text{bridge}}\\) while maintaining surveillance coverage.

This is a multi-objective optimization with competing constraints: spread for coverage implies larger inter-node distances; clustering for relay reliability implies smaller inter-node distances; altitude variation for bridge probability increases power consumption. The Pareto frontier of this tradeoff is not analytically tractable. Numerical optimization with mission-specific parameters yields operational guidance. But once again, the model assumes a static adversary. An adaptive jammer that observes swarm geometry can target bridge nodes specifically. The anti-fragile response: vary geometry stochastically, making bridge node identity unpredictable.

---

## Central Coordination Failure Modes

Cloud architectures assume central coordinators exist and are reachable. Load balancers, service meshes, orchestrators - all depend on some node having global (or near-global) visibility and authority.

Tactical edge architectures cannot make this assumption. We identify three coordination failure modes:

<style>
#tbl_coordination_failure + table th:first-of-type { width: 22%; }
#tbl_coordination_failure + table th:nth-of-type(2) { width: 26%; }
#tbl_coordination_failure + table th:nth-of-type(3) { width: 26%; }
#tbl_coordination_failure + table th:nth-of-type(4) { width: 26%; }
</style>
<div id="tbl_coordination_failure"></div>

| Failure Mode | Cause | Detection Challenge | Required Response |
| :--- | :--- | :--- | :--- |
| **Coordinator Unreachable** | Partition between coordinator and nodes | Distinguish coordinator failure from network failure | Elect local coordinator or operate autonomously |
| **Coordinator Compromised** | Adversary has taken control | Coordinator issues plausible but malicious instructions | Byzantine fault tolerance, instruction verification |
| **Coordinator Overloaded** | Too many nodes requesting coordination | Increased latency indistinguishable from degraded connectivity | Load shedding, priority queuing, hierarchical delegation |

### Distributed Coordination Cost Analysis

Compare the cost of centralized versus distributed coordination for achieving consistent state across \\(n\\) nodes.

**Centralized coordination cost**:
- Each node sends state to coordinator: \\(n\\) messages
- Coordinator computes consistent state
- Coordinator broadcasts result: \\(n\\) messages
- Total: \\(2n\\) messages, \\(2 \cdot L_{\text{coord}}\\) latency

But in contested environments, we must account for reachability probability \\(p_r\\). If the coordinator is unreachable, nodes retry. Expected message cost:

{% katex(block=true) %}
E[\text{messages}]_{\text{central}} = \frac{2n}{p_r}
{% end %}

**Distributed coordination cost** (consensus protocols):
- All-to-all communication: \\(O(n^2)\\) messages for basic Paxos
- Optimized protocols (e.g., EPaxos): \\(O(n \cdot f)\\) where \\(f\\) is failure tolerance
- Not affected by single-point reachability

The **crossover condition** determines when distributed coordination becomes more efficient:

{% katex(block=true) %}
\frac{2n}{p_r} > n \cdot f \quad \Rightarrow \quad p_r < \frac{2}{f}
{% end %}

The crossover is independent of fleet size \\(n\\) - it depends only on reachability and fault tolerance. For Byzantine fault tolerance requiring \\(f = 3\\) replicas (to tolerate 1 Byzantine failure per the \\(3f+1\\) bound), the threshold is \\(p_{r} < 2/3 \approx 67\\%\\). Derivation: Byzantine agreement requires \\(n \geq 3f + 1\\), so with \\(f = 1\\) tolerated failure, we need \\(n \geq 4\\) replicas and \\(f = 3\\) in our cost formula. Thus distributed coordination dominates when coordinator reachability falls below \\(2/3\\).

In contested environments where \\(p_r\\) typically ranges 0.3-0.5, you're well below crossover. **Design for distributed coordination as primary mode, with centralized coordination as optimization when connectivity permits**.

### Hysteresis-Based Coordination Mode Selection

Naive mode switching at the crossover point causes oscillation: reachability briefly exceeds threshold, system switches to centralized, latency increases during transition, reachability appears to drop, system switches back. This thrashing wastes resources and creates inconsistent behavior.

We introduce **hysteresis** with distinct thresholds for mode transitions:

{% katex(block=true) %}
\begin{aligned}
\text{Switch to CENTRALIZED:} \quad & p_r > \theta_{\text{up}} = \frac{2}{f} + \epsilon \\
\text{Switch to DISTRIBUTED:} \quad & p_r < \theta_{\text{down}} = \frac{2}{f} - \epsilon
\end{aligned}
{% end %}

where \\(\epsilon\\) is the hysteresis margin (typically 0.1-0.15). The system remains in its current mode when \\(\theta_{\text{down}} \leq p_r \leq \theta_{\text{up}}\\).

**Coordination mode selection**:

1. **Compute smoothed reachability**: \\(\bar{p}_r = \text{EWMA}(\text{history}, \alpha = 0.2)\\)
2. **Detect adversarial gaming**: If variance >0.04, fall back to distributed (high variance suggests connectivity manipulation)
3. **Apply hysteresis** with stability requirement:

| Current Mode | Condition | Action |
|:-------------|:----------|:-------|
| CENTRALIZED | {% katex() %}\bar{p}_{r} < \theta_{\text{down}} {% end %} | Switch to DISTRIBUTED |
| DISTRIBUTED | {% katex() %}\bar{p}_{r} > \theta_{\text{up}} {% end %} AND stable for 30s | Switch to CENTRALIZED |
| Either | Otherwise | Maintain current mode |

The stability check prevents switching on transient connectivity spikes - centralized mode is only entered after sustained high reachability.

**Mode transition costs** must also be considered. The formula below decomposes total transition cost into three components: the cost of synchronizing state between nodes, the cost of electing a new leader, and the cost of recovering a consistent view after the mode switch.

{% katex(block=true) %}
C_{\text{transition}} = C_{\text{state\_sync}} + C_{\text{leadership\_election}} + C_{\text{consistency\_recovery}}
{% end %}

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, \\(C_{\text{transition}} \approx 8\\) seconds of reduced capability. The algorithm only switches when expected benefit exceeds this cost over a planning horizon (typically 5 minutes).

---

## Degraded Operation as Primary Design Mode

The inversion thesis implies that architects should optimize explicitly for the partition case rather than treating it as an edge condition. When more than half of operating time is spent in Intermittent or Denied regimes, "degraded" is the primary operating mode and "connected" is the bonus state. The formal design objective follows: find the architecture policy \\(\pi\\) that maximizes expected {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} \\(\mathcal{L}(t)\\) conditioned on the system being in the Denied regime, subject to maintaining at least basic-mission capability \\(\mathcal{L}_1\\).

{% katex(block=true) %}
\max_{\pi} \mathbb{E}[\mathcal{L}(t) \mid \Xi(t) = \mathcal{N}] \quad \text{subject to} \quad \mathcal{L} \geq \mathcal{L}_1
{% end %}

When \\(P(\Xi \in \{\mathcal{I}, \mathcal{N}\}) > 0.5\\), "degraded" is the primary operating mode.

<span id="term-capability-level"></span>
### Capability Hierarchy Framework

Define {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %}s from basic survival to full integration:

<style>
#tbl_capability_levels + table th:first-of-type { width: 10%; }
#tbl_capability_levels + table th:nth-of-type(2) { width: 22%; }
#tbl_capability_levels + table th:nth-of-type(3) { width: 28%; }
#tbl_capability_levels + table th:nth-of-type(4) { width: 18%; }
#tbl_capability_levels + table th:nth-of-type(5) { width: 22%; }
</style>
<div id="tbl_capability_levels"></div>

| Level | Name | Description | Threshold \\(\theta_i\\) | Marginal Value \\(\Delta V_i\\) |
| :--- | :--- | :--- | :--- | :--- |
| L0 | Survival | Avoid collision, maintain safe state | 0.0 | 1.0 (baseline) |
| L1 | Basic Mission | Continue patrol, maintain formation | 0.0 | 2.5 |
| L2 | Local Coordination | Synchronized maneuver within cluster | 0.3 | 4.0 |
| L3 | Fleet Coordination | Cross-cluster task allocation | 0.8 | 6.0 |
| L4 | Full Integration | Real-time coordination, full sensor streaming | 0.9 | 8.0 |

*Unit definition*: \\(\Delta V_i\\) values are dimensionless mission utility scores, normalized so that maximum full-integration performance = 21.5 points. For RAVEN, each level's \\(\Delta V_i\\) was calibrated as: \\(P(\text{mission success} \mid \text{level achieved}) \times \text{expected coverage fraction} \times 10\\), measured over 200 simulation runs. The span from \\(\Delta V_4 = 8.0\\) to \\(\Delta V_0 = 0\\) (coverage contribution) reflects the RAVEN mission structure: L0 alone provides no operational coverage, while L4 enables real-time cross-cluster coordination that saturates the coverage function (the table assigns \\(\Delta V_0 = 1.0\\) as a survival-credit baseline, not a coverage score). AUTOHAULER weights L3 at 9.0 (vs. RAVEN's 6.0) because hauling throughput is dominated by fleet-level task allocation. These values are scenario-specific inputs, not universal constants.

Each level requires minimum connectivity \\(\theta_i\\) and contributes marginal value \\(\Delta V_i\\). Total capability is the sum of achieved levels: a system at L3 achieves \\(\Delta V_0 + \Delta V_1 + \Delta V_2 + \Delta V_3 = 13.5\\) out of maximum 21.5.

**Capability level evaluation** (continuous, per-node):

1. **Measure**: Estimate \\(C(t)\\) via EWMA: \\(\hat{C}(t) = 0.3 \cdot C_{\text{observed}} + 0.7 \cdot \hat{C}(t-1)\\)

   (The gain \\(\alpha = 0.3\\) is not a universal constant. The optimal \\(\alpha = 1 - e^{-\lambda_{\min} \cdot \Delta t}\\), where \\(\lambda_{\min}\\) is the fastest connectivity transition rate worth tracking and \\(\Delta t\\) is the measurement interval. At \\(\Delta t = 1\\)s and RAVEN's observed transition rate of ~0.35 transitions/min \\(\approx 0.006\\)/s: \\(\alpha = 1 - e^{-0.006} \approx 0.006\\) — very slow adaptation. At 0.35 transitions/s: \\(\alpha \approx 0.30\\). The value 0.3 is calibrated to a system that transitions regimes roughly once every 3 seconds; slower-changing environments should use smaller \\(\alpha\\).)

2. **Determine level**: Find highest \\(L_i\\) where \\(\hat{C}(t) \geq \theta_i\\)
3. **Check peer consensus**: For L2+, verify peers report same capability; downgrade if mismatch
4. **Apply hysteresis**: Maintain level unless threshold crossed for \\(T_{\text{stable}} = 10\\)s
5. **Execute**: Activate selected level's behaviors, deactivate higher levels

### Hardened Hierarchy: Dependency Isolation

The capability table above lists five levels. A critical implementation constraint governs
the relationship between them: no level may depend on any level above it at runtime. Without
this constraint, an L4 model-update service that L0 boot logic imports creates a circular
failure — when the autonomic stack degrades, it may take L0 survival with it.

<span id="def-35"></span>
**Definition 35** (Dependency Isolation Requirement). *A capability stack satisfies the
{% term(url="#def-35", def="Structural constraint requiring that each capability level's runtime dependencies are confined to equal or lower levels; L0 has zero dependencies on any L1-L4 component") %}dependency isolation requirement{% end %} if the runtime dependency set of each
level is confined to equal or lower levels:*

{% katex(block=true) %}
\forall\, i \in \{0,1,2,3,4\}:\quad \mathrm{deps}(L_i) \subseteq \bigcup_{j \leq i} L_j
{% end %}

*The L0 constraint is the binding one:*

{% katex(block=true) %}
\mathrm{deps}(L_0) \cap \bigcup_{i \geq 1} L_i = \emptyset
{% end %}

*Operationally, L0 code must:*
- *Be compiled as an independent firmware image with no shared-library dependencies on L1-L4*
- *Use only C or Rust — no garbage collector, no managed runtime, no dynamic dispatch into upper layers*
- *Pass a static symbol-dependency graph check: zero upward references*
- *Fit entirely in on-chip SRAM — no swap, no dynamic allocation requiring heap from upper layers*

<span id="prop-36"></span>
**Proposition 36** (Hardened Hierarchy Fail-Down). *If a system satisfies Definition 35,
then failure of level \\(L_i\\) cannot cause failure of any level \\(L_j\\) with \\(j < i\\):*

{% katex(block=true) %}
\mathrm{failure}(L_i) \;\Rightarrow\; \forall\, j < i : L_j \text{ remains operational}
{% end %}

*Proof*: By Definition 35, every component at level \\(j < i\\) satisfies
\\(\mathrm{deps}(L_j) \subseteq \bigcup_{k \leq j} L_k\\). Since \\(j < i\\), we have
\\(L_i \notin \mathrm{deps}(L_j)\\). Failure of \\(L_i\\) therefore creates no failed
dependency in \\(L_j\\). By induction over all \\(j < i\\), the entire stack below \\(L_i\\)
remains operational. \\(\square\\)

**Corollary**: The CONVOY failure case in the [constraint sequence article](@/blog/2026-02-19/index.md)
— L3 fleet analytics built before L0 survival was validated — violates Definition 35. The
analytics service imported the health-monitoring framework (L1+), which in turn depended on
dynamic memory allocation not present in the bare-metal boot environment. When the stack
degraded, L0 could not re-initialize because its required allocator was in a crashed L1 process.
Definition 35, verified statically before deployment, would have caught this at link time.

### Expected Capability Under Contested Connectivity

The expected capability under the stationary connectivity distribution takes the form:

{% katex(block=true) %}
E[\text{Capability}] = \sum_{i=0}^{n} P(C(t) \geq \theta_i) \cdot \Delta V_i
{% end %}

Expected capability is the convolution of connectivity distribution \\(\pi\\) (environment-determined) with capability thresholds \\(\theta_i\\) (design-determined). The architect controls \\(\theta_i\\) but not \\(\pi\\).

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}'s stationary distribution \\(\pi = (0.32, 0.25, 0.22, 0.21)\\), we compute expected capability by mapping states to connectivity thresholds. Full connectivity (F) exceeds all thresholds; Degraded (D) exceeds \\(\theta_2 = 0.3\\) but not \\(\theta_3 = 0.8\\); Intermittent (I) and Denied (N) exceed only \\(\theta_0 = 0\\):

{% katex(block=true) %}
\begin{aligned}
E[\text{Capability}] &= 1.0 \cdot (1.0 + 2.5) + (\pi_F + \pi_D) \cdot 4.0 + \pi_F \cdot 6.0 + \pi_F \cdot 8.0 \\
&= 3.5 + 0.57 \cdot 4.0 + 0.32 \cdot 6.0 + 0.32 \cdot 8.0 \\
&= 3.5 + 2.28 + 1.92 + 2.56 = 10.26
\end{aligned}
{% end %}

With maximum capability of 21.5, {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} achieves roughly **48% of theoretical maximum capability**. That's the capability gap contested connectivity imposes. You can't eliminate it - you design around it.

**Commercial System Capability Hierarchies** (domain-specific instantiation of framework):

| System | Level | Capability | \\(\theta_i\\) | \\(\Delta V_i\\) |
| :--- | :--- | :--- | :--- | :--- |
| AUTOHAULER | L0-L1 | Collision avoidance, route following | 0.0 | 2.8 |
| | L2 | Segment coordination | 0.3 | 3.2 |
| | L3 | Pit optimization | 0.5 | 4.5 |
| | L4 | Fleet optimization | 0.8 | 5.5 |
| GRIDEDGE | L0-L1 | Local protection, feeder isolation | 0.0 | 3.2 |
| | L2 | Adjacent coordination | 0.25 | 3.8 |
| | L3 | Substation optimization | 0.5 | 4.2 |
| | L4 | System coordination | 0.85 | 5.0 |

**Expected capability** (applying the framework):
- {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}: \\(\pi = (0.42, 0.28, 0.17, 0.13)\\) yields \\(E[\text{Cap}] = 10.5\\) (**66%** of max 16.0)
- {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}: \\(\pi = (0.46, 0.19, 0.16, 0.19)\\) yields \\(E[\text{Cap}] = 10.70\\) (**66%** of max 16.2)

Critical insight: L0-L1 capabilities require \\(\theta = 0\\) - safety functions operate at zero connectivity because fog-layer controllers have complete local authority.

**Capability variance**: \\(\sigma \approx 6.2\\) for {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} (\\(\pm 30\\%\\) swings) drives the graceful degradation requirement.

### Threshold Optimization Problem

The \\(\theta_i\\) thresholds are design variables, not fixed constants. The optimization problem balances capability against implementation cost:

{% katex(block=true) %}
\max_{\theta \in \Theta} \quad E_\pi\left[\sum_i \mathbf{1}_{C \geq \theta_i} \cdot V_i\right] - \sum_i c_i(\theta_i)
{% end %}

where \\(c_i(\theta_i)\\) captures the cost of achieving {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} \\(i\\) at connectivity threshold \\(\theta_i\\). Lower thresholds require more aggressive error correction protocols, weaker consistency guarantees, and more complex failure handling logic.

The cost function \\(c_i\\) is typically convex and increasing as \\(\theta_i \rightarrow 0\\), reflecting the exponentially increasing difficulty of maintaining coordination at lower connectivity levels.

Optimal threshold placement depends on the connectivity CDF derivative. Place thresholds where \\(dF_C/d\theta\\) is small - in the distribution tails where small threshold changes cause small probability changes.

**Anti-fragility through threshold learning**: A system that learns to lower its thresholds under degraded connectivity becomes *more capable* under stress. Adapting \\(\theta_i\\) based on operational experience yields measurable capability gains - a manifestation of positive anti-fragility where \\(\mathbb{A} = (P_{\text{post-stress}} - P_{\text{pre-stress}})/\sigma > 0\\).

---

## The Edge Constraint Sequence

Which architectural problems should we solve first? In complex systems, dependencies create ordering constraints. Solving problem B before problem A may be wasted effort if A is a prerequisite for B.

### Proposed Sequence for Edge Architecture

Based on the dependency structure of edge capabilities; each node is a prerequisite for the next, and the dashed annotations give the diagnostic question that verifies each level is satisfied before proceeding.

{% mermaid() %}
graph TD
    A["1\. Survival Under Partition"] --> B["2\. Local Cluster Coherence"]
    B --> C["3\. Fleet-Wide Consistency"]
    C --> D["4\. Optimized Connected Operation"]

    A -.- A1["Can each node operate independently?"]
    B -.- B1["Can nearby nodes coordinate?"]
    C -.- C1["Can partitioned groups reconcile?"]
    D -.- D1["Can we exploit full connectivity?"]

    style A fill:#e8f5e9,stroke:#388e3c,stroke-width:3px
    style B fill:#fff3e0,stroke:#f57c00
    style C fill:#e3f2fd,stroke:#1976d2
    style D fill:#fce4ec,stroke:#c2185b
    style A1 fill:#fff,stroke:#ccc,stroke-dasharray: 5 5
    style B1 fill:#fff,stroke:#ccc,stroke-dasharray: 5 5
    style C1 fill:#fff,stroke:#ccc,stroke-dasharray: 5 5
    style D1 fill:#fff,stroke:#ccc,stroke-dasharray: 5 5
{% end %}

**Priority 1: Survival Under Partition**
Every node must be capable of safe, autonomous operation when completely disconnected. This is the foundation on which all other capabilities build. If a {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} drone cannot avoid collision, maintain safe altitude, and preserve itself when alone, no amount of coordination capability matters.

**Priority 2: Local Cluster Coherence**
When nodes can communicate with neighbors but not the broader fleet, they should be able to coordinate local actions. {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicles in line-of-sight should synchronize movement even if the convoy commander is unreachable.

**Priority 3: Fleet-Wide Eventual Consistency**
When partitions heal, the system must reconcile divergent state. Actions taken by isolated clusters must be merged into a coherent fleet state. This is technically challenging but not survival-critical - the fleet operated safely while partitioned.

**Priority 4: Optimized Connected Operation**
Only after the foundation is solid should we optimize for the connected case. Centralized algorithms, global optimization, real-time streaming - these enhance capability but depend on connectivity that may not exist.

### Mathematical Justification

Define the dependency graph \\(G = (V, E)\\) where \\(V = \\{\text{capabilities}\\}\\) and directed edge \\((A, B) \in E\\) means A is prerequisite for B.

The constraint sequence is a topological sort of \\(G\\), weighted by priority:

{% katex(block=true) %}
\text{Priority}(c) = P(c \text{ is binding constraint}) \cdot \text{Cost}(c \text{ violation})
{% end %}

- \\(P(c \text{ is binding})\\) - How often is this capability the limiting factor?
- \\(\text{Cost}(c \text{ violation})\\) - What happens if this capability fails?

For survival under partition:
- \\(P(\text{binding}) = \pi_N = 0.21\\) (from {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} stationary distribution)
- \\(\text{Cost}(\text{violation}) = \infty\\) (loss of platform)

{% katex(block=true) %}
\text{Priority}(\text{survival}) = 0.21 \cdot \infty = \infty
{% end %}

Survival is infinitely prioritized - solve it first regardless of frequency.

For optimized connected operation, the binding probability is low and the cost is finite, yielding a modest priority score that confirms this problem should be addressed last:
- \\(P(\text{binding}) = P(C(t) > 0.9) \approx 0.14\\)
- \\(\text{Cost}(\text{violation}) = \Delta V_4 = 8.0\\) (capability reduction, not failure)

{% katex(block=true) %}
\text{Priority}(\text{optimization}) = 0.14 \cdot 8.0 = 1.12
{% end %}

Finite and modest. Solve after higher priorities are addressed.

### Constraint Sequence Validation

**Constraint sequence validation checks**:

1. **Survival independence**: Disable all network interfaces on a single node; verify safe operation for \\(10\times\\) typical partition duration
2. **Cluster degradation**: Partition fleet into isolated clusters; each cluster must maintain coordinated operation at L2
3. **Reconvergence correctness**: Restore connectivity; divergent state must merge with no lost updates or conflicts
4. **Connected enhancement**: With full connectivity, centralized optimizations activate and exceed cluster-only performance

---

## The Limits of Abstraction

Throughout this analysis, we have built models: {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov chains{% end %} for connectivity, optimization problems for resource allocation, queueing theory for latency, capability hierarchies for design prioritization. These models are powerful tools - they turn vague intuitions into quantitative frameworks, enabling principled decision-making.

But every model is an abstraction, and every abstraction has boundaries. The edge architect must recognize where models end and engineering judgment begins.

### Model Validation Methodology

Before trusting model predictions, we must continuously validate that model assumptions hold. The **Model Health Score** \\(H_M \in [0,1]\\) aggregates validation checks:

{% katex(block=true) %}
H_M = \frac{1}{4}\left( H_{\text{Markov}} + H_{\text{stationary}} + H_{\text{independence}} + H_{\text{coverage}} \right)
{% end %}

**Markovianity test** (\\(H_{\text{Markov}}\\)): The future should depend only on present state. Compute lag-1 autocorrelation of transition indicators:

{% katex(block=true) %}
H_{\text{Markov}} = 1 - \left| \text{Corr}(X_t, X_{t-2} \mid X_{t-1}) \right|
{% end %}

If \\(H_{\text{Markov}} < 0.7\\), history matters - consider Hidden Markov or semi-{% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %}s.

**Stationarity test** (\\(H_{\text{stationary}}\\)): Transition rates should be stable over time. Apply Kolmogorov-Smirnov test between early and late observation windows:

{% katex(block=true) %}
H_{\text{stationary}} = 1 - D_{KS}(\hat{Q}_{\text{early}}, \hat{Q}_{\text{late}})
{% end %}

If \\(H_{\text{stationary}} < 0.6\\), rates are drifting - trigger model retraining or adversarial investigation.

**Independence test** (\\(H_{\text{independence}}\\)): Different nodes' transitions should be independent (or model correlation explicitly). Compute pairwise correlation of transition times:

{% katex(block=true) %}
H_{\text{independence}} = 1 - \max_{i \neq j} \left| \text{Corr}(T^{(i)}, T^{(j)}) \right|
{% end %}

If \\(H_{\text{independence}} < 0.5\\), transitions are correlated - likely coordinated jamming affecting multiple nodes.

**Coverage test** (\\(H_{\text{coverage}}\\)): Observations should span the state space. Track time since last visit to each state:

{% katex(block=true) %}
H_{\text{coverage}} = \min_i \left( 1 - e^{-\lambda_{\text{visit}} \cdot t_{\text{since\_visit}}(i)} \right)
{% end %}

If \\(H_{\text{coverage}} < 0.4\\), rare states are under-observed - confidence intervals on those transition rates are unreliable.

**Operational guidance** when \\(H_M < 0.5\\) (model unreliable):
- Widen confidence intervals by factor \\(1/(2H_M)\\)
- Increase validation check frequency
- Fall back to conservative operating modes
- Alert operators to model degradation

### When Models Fail

**Adversarial adaptation**: Our Markov connectivity model assumes transition rates are stationary. An adaptive adversary changes rates in response to our behavior. The model becomes a game, not a stochastic process.

**Novel environments**: The optimization for {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} power allocation assumed known channel characteristics. Deploy {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} in a new RF environment with different propagation, and the optimized allocation may be catastrophically wrong.

**Emergent interactions**: The queueing model for {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} coordination analyzed message propagation in isolation. Real systems have interactions: high message load increases power consumption, which triggers power-saving modes, which reduce message transmission rates, which increases coordination latency beyond model predictions.

**Black swan events**: Capability hierarchies assign finite costs to failures. Some failures - complete fleet loss, mission compromise, cascading system destruction - have costs that no model adequately captures.

**Concrete failure examples** from deployed systems:

1. *{% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} model failure*: Transition rates estimated during summer operations proved wrong in winter. Ice-induced link failures occurred \\(4\times\\) more frequently than modeled, and the healing time constants doubled. The fleet operated in L1 (basic survival) for 6 hours instead of the designed 45 minutes before parameters could be retuned.

2. *{% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} coordination collapse*: A firmware bug caused gossip messages to include stale timestamps. The staleness-confidence model interpreted all peer data as unreliable, causing each drone to operate in isolation. Fleet coherence dropped to zero despite 80% actual connectivity.

3. *{% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} cascade*: Solar panel degradation followed an exponential (not linear) curve after year 2. The power-aware scheduling model underestimated nighttime power deficit by 40%, causing sensor brownouts that corrupted the anomaly detection baseline, which then flagged normal readings as anomalies, which triggered unnecessary alerts, which depleted batteries further.

These failures were not edge cases - they were model boundary violations that operational testing should have caught.

### The Engineering Judgment Protocol

When models reach their limits, the edge architect falls back to first principles:

1. **What is the worst case?** Not the expected case, not the likely case - the worst case. What happens if every assumption fails simultaneously?

2. **Is the worst case survivable?** If not, redesign until it is. No optimization justifies catastrophic risk.

3. **What would falsify my model?** Identify the observations that would indicate model assumptions have been violated. Build monitoring for those observations.

4. **What is the recovery path?** When the model fails - not if - how does the system recover? Fallback behaviors, degradation paths, human intervention triggers.

5. **What did we learn?** Every model failure is data for the next model. The anti-fragile system improves its models from operational stress.

---

## Comparative Analysis: Edge vs. State-of-the-Art Frameworks

How do the principles developed here compare with established frameworks in edge and distributed systems?

<style>
#tbl_framework_comparison + table th:first-of-type { width: 20%; }
#tbl_framework_comparison + table th:nth-of-type(2) { width: 20%; }
#tbl_framework_comparison + table th:nth-of-type(3) { width: 20%; }
#tbl_framework_comparison + table th:nth-of-type(4) { width: 20%; }
#tbl_framework_comparison + table th:nth-of-type(5) { width: 20%; }
</style>
<div id="tbl_framework_comparison"></div>

| Framework | Partition Assumption | Decision Model | Coordination | Adversarial Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud-Native (K8s)** | Transient, recoverable | Central orchestrator | Service mesh | None (trusted network) |
| **DTN (RFC 4838)** | Expected, store-forward | Per-hop decisions | Opportunistic contacts | Integrity checks |
| **MANET Protocols** | Dynamic topology | Distributed routing | Local broadcast | Limited (DoS resilience) |
| **This Framework** | Default state | Hierarchical autonomy | Capability-adaptive | Byzantine + adversarial |

**Key differentiators**:

1. **Capability hierarchy**: Unlike DTN's flat store-forward or MANET's routing-focused approach, we define explicit {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %}s tied to {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regimes{% end %}. This enables graceful degradation with quantified trade-offs.

2. **Adversarial modeling**: Most edge frameworks assume benign failures. Our {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %} explicitly incorporates adversarial state transitions and adaptation detection - essential for contested environments.

3. **Decision authority distribution**: Cloud-native assumes central authority with delegation on failure. MANET assumes peer equality. Our hierarchical tier model provides structured authority with bounded autonomy at each level.

4. **Reconvergence focus**: DTN optimizes for eventual delivery; MANET optimizes for route discovery. We optimize for *coherent state merge* after partition - ensuring that actions taken in isolation produce consistent combined outcomes.

---

## Self-Diagnosis: Is Your System Truly Edge?

Before applying edge architecture patterns, verify that your system actually faces edge constraints. Many systems labeled "edge" are simply distributed cloud deployments with higher latency. True edge systems exhibit specific characteristics.

<style>
#tbl_edge_diagnosis + table th:first-of-type { width: 25%; }
#tbl_edge_diagnosis + table th:nth-of-type(2) { width: 35%; }
#tbl_edge_diagnosis + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_edge_diagnosis"></div>

| Test | Edge System (PASS) | Distributed Cloud (FAIL) |
| :--- | :--- | :--- |
| **Partition frequency** | >10% of operating time disconnected | <1% disconnection, always eventually reachable |
| **Decision authority** | Must make irrevocable decisions locally | Can always defer to central authority |
| **Adversarial environment** | Active attempts to disrupt/deceive | Failures are accidental, not malicious |
| **Human escalation** | Operators may be unreachable for hours/days | Operators always reachable within minutes |
| **State reconciliation** | Complex merge of divergent actions | Simple last-writer-wins or conflict-free |

**Decision Rule**: If your system passes \\(\geq 3\\) of these tests, edge architecture patterns apply. If you pass \\(\leq 2\\), standard distributed systems patterns may suffice.

The distinction matters because edge patterns carry costs: increased local storage and compute for autonomous operation, complex reconciliation logic for partition recovery, Byzantine fault tolerance for adversarial resilience, and reduced optimization efficiency from distributed coordination.

These costs are justified only when the operating environment demands them. A retail IoT deployment with reliable cellular connectivity does not need Byzantine fault tolerance. A tactical drone swarm operating under jamming does.

---

## Model Scope and Failure Envelope

Each mechanism has bounded validity. When assumptions fail, so does the mechanism.

### Markov Connectivity Model

**Validity Domain**: The {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %} applies to a deployment \\(S\\) only when all four conditions listed below hold simultaneously; violation of any one makes the model's predictions unreliable.

{% katex(block=true) %}
\mathcal{D}_{\text{Markov}} = \{S \mid A_1 \land A_2 \land A_3 \land A_4\}
{% end %}

where:
- \\(A_1\\): Transition rates are approximately stationary over mission duration \\(T_{\text{mission}}\\)
- \\(A_2\\): Connectivity states are distinguishable by measurement (thresholds \\(\theta_I, \theta_D, \theta_F\\) separate regimes)
- \\(A_3\\): Transitions are approximately memoryless (future state depends on current state, not history)
- \\(A_4\\): Generator matrix \\(Q\\) is estimable from observation data with sufficient samples (\\(N > 100\\) transitions per rate)

**Failure Envelope**: The table below maps each assumption to the specific failure mode that results when it is violated, and provides the detection signal and recommended mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Non-stationary adversary | Transition rates drift; predictions degrade | CUSUM on rate estimates | Windowed estimation; pessimistic bounds |
| Correlated jamming | State dependencies violate memoryless | Lagged correlation > 0.3 | Semi-Markov extension |
| State indistinguishability | Misclassification; wrong policy | Confusion matrix analysis | Wider threshold margins |
| Sparse observations | High variance estimates | Confidence intervals | Bayesian priors; conservative defaults |

**Counter-scenario**: A sophisticated adversary observes {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} movement patterns and varies jamming to maximize disruption. Transition rates become time-dependent and correlated with {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} actions. The {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %}'s predictions diverge from reality. Detection: correlation between {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} actions and subsequent transitions exceeds 0.4. Response: switch to pessimistic bounds, increase randomization.

### Capability Hierarchy (\\(\mathcal{L}_0\\)-\\(\mathcal{L}_4\\))

**Validity Domain**: The graded-degradation capability hierarchy applies to deployment \\(S\\) when three structural conditions hold; if any is violated, the hierarchy collapses and graceful degradation does not occur.

{% katex(block=true) %}
\mathcal{D}_{\text{hierarchy}} = \{S \mid B_1 \land B_2 \land B_3\}
{% end %}

where:
- \\(B_1\\): Capabilities are separable (can measure and control independently)
- \\(B_2\\): Degradation is approximately monotonic (losing {% katex() %}\mathcal{L}_k{% end %} does not restore {% katex() %}\mathcal{L}_{k-1}{% end %})
- \\(B_3\\): Resource allocation is divisible (can shed capabilities incrementally)

**Failure Envelope**: The table below maps each assumption to the failure mode and recommended mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Capability coupling | Cannot shed one without losing another | Dependency analysis shows cycles | Redesign interfaces; accept coupled shedding |
| Non-monotonic degradation | Intermediate states worse than extremes | Bimodal performance distribution | Skip intermediate levels |
| Indivisible resources | All-or-nothing transitions | Resource granularity > capability granularity | Pre-allocate at boundaries |

**Counter-scenario**: A system where coordination (\\(\mathcal{L}_2\\)) is required to achieve basic mission (\\(\mathcal{L}_1\\)) because sensors are distributed across nodes. Losing connectivity loses coordination, which loses mission capability entirely. The hierarchy collapses to binary: full operation or survival only. The graded degradation model does not apply.

### Inversion Threshold (\\(\tau^* \approx 0.15\\))

**Validity Domain**: The {% term(url="#prop-1", def="The connectivity level below which distributed autonomy outperforms cloud control") %}inversion threshold{% end %} result holds for deployment \\(S\\) when the three conditions below are satisfied; the most commonly violated is \\(C_1\\) — systems with external abort triggers never enter the long-partition operating mode the threshold assumes.

{% katex(block=true) %}
\mathcal{D}_{\text{threshold}} = \{S \mid C_1 \land C_2 \land C_3\}
{% end %}

where:
- \\(C_1\\): Mission continues during partition (no external abort trigger)
- \\(C_2\\): Decision latency requirements are bounded (\\(T_d < \infty\\))
- \\(C_3\\): Partition events are distinguishable from transient delays

**Uncertainty Bounds**:

The threshold \\(\tau^* = 0.15\\) is derived from tactical deployments with specific characteristics. For different contexts:

| Context | \\(\tau^*\\) Range | Basis |
| :--- | :--- | :--- |
| Tactical military | 0.12-0.18 | Decision latency constraints |
| Industrial IoT | 0.08-0.20 | Safety-criticality variation |
| Consumer applications | 0.05-0.15 | User tolerance for degradation |

**Counter-scenario**: Urban IoT deployment with fiber backhaul where partition probability is 0.005 and mean partition duration is 30 seconds. Cloud-native patterns perform well. Applying partition-first design adds coordination overhead (estimated 15-25% latency increase) and state management complexity without commensurate benefit. The inversion is not justified.

### Edge-ness Score Limitations

**Validity Domain**: The Edge-ness Score \\(E\\) assumes:
- Component metrics are independent (no interaction effects)
- Linear weighting captures importance
- Threshold boundaries (0.3, 0.6) apply across domains

**Known Limitations**: The three limitations below are structural — they cannot be eliminated by parameter tuning, only mitigated by the guidance given in the right-hand column.

| Limitation | Impact | Guidance |
| :--- | :--- | :--- |
| Weight selection is domain-dependent | Score may misrank systems across domains | Calibrate weights to domain-specific deployments |
| Metric independence violated | Interaction effects ignored | Use as heuristic, not deterministic classifier |
| Threshold sensitivity | Systems near boundaries may be misclassified | Add margin (\\(\pm 0.05\\)) to boundary decisions |

### Authority Delegation Model

**Validity Domain**: The authority delegation model is valid for deployment \\(S\\) when the three conditions below hold; \\(D_1\\) (scenario anticipatability) is the hardest to guarantee in practice, since novel operational situations cannot be fully predicted at design time.

{% katex(block=true) %}
\mathcal{D}_{\text{delegation}} = \{S \mid D_1 \land D_2 \land D_3\}
{% end %}

where:
- \\(D_1\\): Scenarios are anticipatable (delegation rules cover expected cases)
- \\(D_2\\): Delegation bounds are sufficient (autonomous authority matches required decisions)
- \\(D_3\\): Cluster leads are not Byzantine (trusted to execute delegation correctly)

**Failure Envelope**: The table below lists each condition's failure mode and mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Unanticipated scenario | System blocks or violates authority | Action blocked by policy | Conservative fallback; defer decision |
| Insufficient delegation | Required action exceeds authority | Authority check fails | Staged delegation; emergency override |
| Byzantine cluster lead | Delegation misused | Anomalous decision pattern | Multi-party delegation; audit trail |

**Counter-scenario**: Novel threat type emerges during partition - not covered by delegation rules. The cluster lead faces a dilemma: take unauthorized action or accept mission degradation. Neither outcome is covered by the model. This is a fundamental limitation: delegation frameworks cannot anticipate all scenarios. Residual risk must be accepted or addressed through broader delegation bounds (with associated risk).

### Summary: Claim-Assumption-Failure Table

The table below consolidates the five major claims of this article, the key assumptions each depends on, the operational contexts where the claim holds, and the conditions that cause it to break down.

| Claim | Key Assumptions | Valid When | Fails When |
| :--- | :--- | :--- | :--- |
| Connectivity follows CTMC | Stationary rates, memoryless transitions | Adversary behavior stable; natural connectivity | Adversary adapts; correlated jamming |
| \\(\tau^* \approx 0.15\\) threshold | Mission continues; decisions bounded | Tactical, industrial contexts | Consumer IoT; always-connected scenarios |
| Capability hierarchy degrades gracefully | Capabilities separable, monotonic | Well-architected systems | Tightly coupled systems; binary capabilities |
| Authority delegation enables autonomy | Scenarios anticipated, cluster leads trusted | Known operational envelope | Novel scenarios; Byzantine compromise |
| Edge-ness Score classifies architecture need | Metrics independent, weights calibrated | Domain where weights derived | Cross-domain comparison; metric correlation |

---

## Irreducible Trade-offs

No design eliminates these tensions. The architect selects a point on each Pareto front.

### Trade-off 1: Autonomy vs. Coordination Efficiency

{% katex(block=true) %}
\max_{a \in \mathcal{U}_{\text{arch}}} \left( U_{\text{autonomy}}(a), U_{\text{coordination}}(a), -C_{\text{complexity}}(a) \right)
{% end %}

| Design Point | Autonomy | Coordination | Complexity | Optimal When |
| :--- | :---: | :---: | :---: | :--- |
| Cloud-native | Low | High | Low | \\(P(C=0) < 0.05\\) |
| Hybrid tier | Medium | Medium | Medium | \\(P(C=0) \in [0.05, 0.20]\\) |
| Full partition-first | High | Low | High | \\(P(C=0) > 0.20\\) |

Constraint surface: \\(U_{\text{coordination}} \leq f(1 - U_{\text{autonomy}}) - \alpha \cdot C_{\text{complexity}}\\)

### Trade-off 2: Responsiveness vs. Consistency (CAP)

Under partition: choose availability over consistency. CRDTs provide eventual consistency without coordination. As \\(C(t) \rightarrow 0\\), consistency approaches zero while responsiveness remains high.

### Trade-off 3: Capability Level vs. Resource Consumption

**Multi-objective formulation**: Raising {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} \\(\mathcal{L}\\) increases mission value but simultaneously increases compute, power, and bandwidth costs — the formula captures all four dimensions so no single objective is invisibly sacrificed.

{% katex(block=true) %}
\max_{\mathcal{L}} \left( U_{\text{capability}}(\mathcal{L}), -C_{\text{compute}}(\mathcal{L}), -C_{\text{power}}(\mathcal{L}), -C_{\text{bandwidth}}(\mathcal{L}) \right)
{% end %}

| Capability | Compute (%) | Power (W) | Bandwidth (Kbps) | Mission Value |
| :--- | ---: | ---: | ---: | ---: |
| \\(\mathcal{L}_0\\) (Survival) | 5 | 2 | 0 | 0.1 |
| \\(\mathcal{L}_1\\) (Basic) | 20 | 8 | 1 | 0.4 |
| \\(\mathcal{L}_2\\) (Coordination) | 40 | 15 | 10 | 0.6 |
| \\(\mathcal{L}_3\\) (Fleet) | 60 | 25 | 50 | 0.8 |
| \\(\mathcal{L}_4\\) (Full) | 80 | 40 | 200 | 1.0 |

### Resource Shadow Prices

The shadow price \\(\lambda_i = \partial \mathcal{L} / \partial g_i\\) quantifies the marginal value of relaxing constraint \\(g_i\\):

| Resource | RAVEN \\(\lambda\\) | CONVOY \\(\lambda\\) | GRIDEDGE \\(\lambda\\) | Interpretation |
| :--- | ---: | ---: | ---: | :--- |
| Bandwidth | \$3.20/Mbps-hr | \$2.40/Mbps-hr | \$0.30/Mbps-hr | Sync capacity value |
| Compute | \$0.08/GFLOP | \$0.12/GFLOP | \$0.05/GFLOP | Local decision value |
| Battery/Power | \$12.00/kWh | \$4.50/kWh | N/A | Extended operation |
| Latency | \$0.50/ms | \$0.30/ms | \$25.00/ms | Response speed |

**Investment implication**: High shadow price indicates binding constraint where investment yields highest returns. {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s high bandwidth shadow price justifies compression and priority queuing investment. {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}'s extreme latency shadow price justifies sub-cycle response hardware.

### Trade-off 4: Tier Depth vs. Coordination Overhead

{% katex(block=true) %}
\max_{k} \left( U_{\text{granularity}}(k), -C_{\text{overhead}}(k), -C_{\text{latency}}(k) \right)
{% end %}

| Tiers | Granularity | Overhead (msgs/decision) | Latency (hops) |
| :--- | :---: | ---: | ---: |
| 2 | Low | \\(O(n)\\) | 1 |
| 3 | Medium | \\(O(n \log n)\\) | 2 |
| 4 | High | \\(O(n \log^2 n)\\) | 3 |

### Cost Surface: Coordination Under Connectivity Regimes

{% katex(block=true) %}
C_{\text{coord}}(n, \Xi) = \begin{cases}
O(n) & \Xi = \mathcal{C} \\
O(n \log n) & \Xi = \mathcal{D} \\
O(n^2) & \Xi = \mathcal{I} \\
\infty & \Xi = \mathcal{N}
\end{cases}
{% end %}

### Irreducible Trade-off Summary

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Autonomy-Coordination | Independent operation vs. fleet optimization | Both maximized under partition |
| Response-Consistency | Fast local decisions vs. fleet-wide agreement | Both under partition (CAP) |
| Capability-Resources | High capability vs. low consumption | High capability with low resources |
| Tier Depth-Overhead | Fine authority vs. low coordination cost | Both with large fleets |

These trade-offs are irreducible: no design eliminates them. The operating environment — specifically the partition probability \\(p\\), mission criticality, and fleet size — determines which point on each Pareto front is correct; the framework's value is making those tradeoffs explicit and quantifiable rather than implicit.

---

## Reference: Paradigm Positioning

How does this framework relate to fog computing, mobile edge computing, and distributed intelligence? Where do existing paradigms fail, and what gaps remain?

### Fog Computing: Overlaps and Divergences

**Fog computing** (Cisco 2012, IEEE 1934-2018) places compute closer to data sources to reduce latency and bandwidth. The comparison table shows the key structural difference: fog assumes cloud remains authoritative and reachable; autonomic edge assumes cloud may be permanently unreachable.

<style>
#tbl_fog_comparison + table th:first-of-type { width: 25%; }
#tbl_fog_comparison + table th:nth-of-type(2) { width: 37%; }
#tbl_fog_comparison + table th:nth-of-type(3) { width: 38%; }
</style>
<div id="tbl_fog_comparison"></div>

| Dimension | Fog Computing | Autonomic Edge Architecture |
| :--- | :--- | :--- |
| **Primary motivation** | Latency reduction, bandwidth optimization | Operation under contested/denied connectivity |
| **Connectivity assumption** | Degraded but available; cloud reachable | Partition is normal; cloud may be unreachable indefinitely |
| **Hierarchy purpose** | Computation offloading, data aggregation | Delegation of authority, autonomous operation |
| **Failure model** | Graceful degradation to cloud | Graceful promotion to local authority |
| **State management** | Cache/sync with authoritative cloud | CRDT-based eventual consistency, no authoritative source |
| **Decision authority** | Cloud-delegated, fog-executed | Locally originated, cloud-informed |

The unique contribution here is formalizing what fog leaves implicit: who decides when cloud is unreachable, how divergent state is merged after extended partition, and whether the system improves from disconnection events.

### Edge-Cloud Continuum: Shared Foundations, Different Emphases

The **edge-cloud continuum** (HORIZON Europe, GAIA-X, Linux Foundation Edge) treats compute resources as a spectrum from device to cloud. The table shows where the frameworks share assumptions and where they diverge structurally.

<style>
#tbl_continuum_comparison + table th:first-of-type { width: 25%; }
#tbl_continuum_comparison + table th:nth-of-type(2) { width: 37%; }
#tbl_continuum_comparison + table th:nth-of-type(3) { width: 38%; }
</style>
<div id="tbl_continuum_comparison"></div>

| Dimension | Edge-Cloud Continuum | Autonomic Edge Architecture |
| :--- | :--- | :--- |
| **Resource model** | Fluid placement along continuum | Fixed placement with partition tolerance |
| **Orchestration** | Centralized (Kubernetes, OpenStack) | Distributed with delegated authority |
| **Workload mobility** | Dynamic migration based on conditions | Static deployment with behavioral adaptation |
| **Network model** | Variable latency, generally available | Contested, intermittent, potentially adversarial |
| **Optimization target** | Resource efficiency, cost, latency | Mission completion, survival, coherence |
| **Failure recovery** | Restart elsewhere, stateless preferred | Local healing, stateful by necessity |

The continuum's recognition that "edge is not a location but a capability profile" aligns with the Edge-ness Score. The structural gap: continuum orchestrators (KubeEdge, Azure IoT Edge, AWS Greengrass) require connectivity to a control plane and favor stateless workloads — neither assumption holds for tactical or industrial edge systems where physical deployment is fixed and state is mission-critical. This architecture layers partition protocols and CRDT coherence atop continuum stacks rather than replacing them.

### Distributed Intelligence Frameworks: Complementary Perspectives

**Distributed intelligence** encompasses frameworks for distributed AI/ML, multi-agent systems, and swarm intelligence. These paradigms share our interest in decentralized decision-making but approach it from different angles.

#### Multi-Agent Systems (MAS)

MAS theory provides formal models for autonomous agents with local perception, communication, and action. Contract net protocols and BDI architectures are directly applicable to MAPE-K knowledge base design and task allocation during partition.

<style>
#tbl_mas_comparison + table th:first-of-type { width: 25%; }
#tbl_mas_comparison + table th:nth-of-type(2) { width: 37%; }
#tbl_mas_comparison + table th:nth-of-type(3) { width: 38%; }
</style>
<div id="tbl_mas_comparison"></div>

| Dimension | Multi-Agent Systems | Autonomic Edge Architecture |
| :--- | :--- | :--- |
| **Agent model** | BDI, reactive, hybrid | MAPE-K autonomic loop |
| **Communication** | Message passing, assumed reliable | Gossip protocols, partition-tolerant |
| **Coordination** | Auctions, voting, negotiation | Hierarchical authority, CRDT merge |
| **Learning** | Reinforcement learning, imitation | Anti-fragile adaptation, bandit algorithms |
| **Failure model** | Agent crash/recovery | Byzantine tolerance, adversarial |

The gap: MAS assumes reliable message delivery and focuses on agent-level reasoning without system-level convergence guarantees. CRDT-based state reconciliation adds those guarantees for contested environments where MAS coordination mechanisms would otherwise produce divergent state.

#### Related Paradigms

**Federated learning** extends to contested environments through staleness-weighted aggregation and Byzantine-tolerant aggregation. **Swarm intelligence** inspires gossip protocols and formation maintenance, but lacks the formal convergence bounds, authority hierarchies, and reconciliation protocols that constrained-connectivity systems require.

### Reference Architecture Comparison

How the architecture maps to major reference frameworks:

<style>
#tbl_reference_arch + table th:first-of-type { width: 20%; }
#tbl_reference_arch + table th:nth-of-type(2) { width: 18%; }
#tbl_reference_arch + table th:nth-of-type(3) { width: 18%; }
#tbl_reference_arch + table th:nth-of-type(4) { width: 22%; }
#tbl_reference_arch + table th:nth-of-type(5) { width: 22%; }
</style>
<div id="tbl_reference_arch"></div>

| Capability | OpenFog (IEEE 1934) | ETSI MEC | Industrial IoT (IIC) | Autonomic Edge |
| :--- | :--- | :--- | :--- | :--- |
| **Partition protocol** | Not specified | Not specified | Partial (OPC-UA redundancy) | Formal (Definition 3, Markov model) |
| **Authority delegation** | Implicit | Application-defined | Device profiles | Explicit hierarchy (L0-L3) |
| **State reconciliation** | Sync to cloud | Stateless preferred | Historian-based | CRDT-based (conflict-free merge) |
| **Self-healing** | Platform restart | Orchestrator-driven | Redundancy failover | MAPE-K autonomic control loop |
| **Anti-fragility** | Not addressed | Not addressed | Not addressed | Core principle (learn from stress) |
| **Adversarial model** | Security perimeter | TLS/authentication | Defense-in-depth | Byzantine tolerance |

### Positioning Summary

The autonomic edge architecture occupies a specific niche in the edge computing landscape; the diagram maps connectivity assumptions to paradigms and decision authority, showing that autonomic edge is the only paradigm that spans both Intermittently and Usually Disconnected assumptions while distributing authority all the way to fully autonomous.

{% mermaid() %}
graph TD
    subgraph "Connectivity Assumptions"
        CA1["Always Connected"]
        CA2["Usually Connected"]
        CA3["Intermittently Connected"]
        CA4["Usually Disconnected"]
    end

    subgraph "Paradigms"
        P1["Cloud Native"]
        P2["Edge-Cloud Continuum"]
        P3["Fog Computing"]
        P4["Autonomic Edge"]
    end

    subgraph "Decision Authority"
        DA1["Centralized"]
        DA2["Delegated"]
        DA3["Distributed"]
        DA4["Autonomous"]
    end

    CA1 --> P1
    CA2 --> P2
    CA2 --> P3
    CA3 --> P3
    CA3 --> P4
    CA4 --> P4

    P1 --> DA1
    P2 --> DA2
    P3 --> DA2
    P4 --> DA3
    P4 --> DA4

    style P4 fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style CA4 fill:#ffcdd2,stroke:#c62828
{% end %}

The frameworks are complementary. KubeEdge or fog patterns handle orchestration and latency optimization when connected; autonomic edge protocols layer partition tolerance and CRDT coherence on top. The unique contribution here is formal treatment of contested connectivity — the {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %}s, authority hierarchies, convergence guarantees, and anti-fragile adaptation that other paradigms assume away or delegate to application developers.

---

## Closing

This article established three interlocking results. The **inversion thesis** (Proposition 1) showed that when partition probability exceeds \\(\tau^* \approx 0.15\\), designing for disconnection as baseline outperforms designing for connectivity — not marginally, but categorically. The **Markov connectivity model** (Definition 3) provides a tractable quantitative framework: estimate transition rates from telemetry, compute the stationary distribution, derive architectural choices from that distribution. The **capability hierarchy** (\\(\mathcal{L}_0\\)–\\(\mathcal{L}_4\\)) translates the stochastic connectivity picture into a graceful degradation contract: every capability level has an explicit connectivity threshold and resource requirement, and transitions between levels are governed by well-defined rules.

Applied to {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}, the framework explains why ore-pass blackouts are non-events: the tier architecture places safety-critical decisions at the fog layer, which never requires upward connectivity. Applied to {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}, it explains why fault isolation must complete within 500 ms with zero cloud dependency: the stationary distribution \\(\pi_{\mathcal{N}} = 0.19\\) means the highest-consequence decisions correlate with lost connectivity.

The framework specifies *what properties emerge under what assumptions*. Every model has a validity domain — the Markov assumptions, the capability separability conditions, the inversion threshold's bounded-latency requirement — and the Model Scope section mapped each claim to its failure envelope. Operational deployment requires verifying that those assumptions hold before trusting the framework's prescriptions.

The architecture so far addresses the structural question: *how should an edge system be organized?* But a correctly structured system can still fail silently if it cannot tell whether it is healthy. A {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} drone operating autonomously has no external reference point — it cannot call home to check whether its sensor readings are anomalous, its battery model is drifting, or its peers' state has diverged beyond safe bounds. The next problem in the constraint sequence is therefore measurement: how does an edge node assess its own health and the health of its cluster without central observability infrastructure? That question, and the gossip protocols, anomaly detection formulations, and Byzantine fault tolerance that answer it, is the subject of [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md).
