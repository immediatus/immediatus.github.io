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

The {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm — forty-seven autonomous drones holding a 12-kilometer surveillance grid — loses backhaul without warning. One moment they're streaming 2.4 Gb/s of sensor data to operations. The next, forty-seven nodes face a decision that cloud-native systems are never designed to answer:

> *What do we do when no one is listening?*

The behavioral envelope was designed for brief interruptions — thirty seconds, maybe sixty. Jamming shows no sign of clearing. The mission hasn't changed: maintain surveillance, detect threats, report findings.

Continue the patrol pattern? Contract formation? Break off a subset to seek connectivity at altitude? And critically — **who decides?** Leadership was an emergent property of connectivity. Now everyone reads link quality zero.

**This is not an edge case. Partition is the baseline operating condition.** The rest of this series builds the formal machinery to architect systems that treat it that way.

---

## Overview

This article establishes the formal framework for contested connectivity. Each concept connects theory directly to a structural design consequence — if you understand the design consequence, you can implement the right architecture without necessarily working through every proof.

| Concept | What It Tells You | Design Consequence |
| :--- | :--- | :--- |
| **Inversion Thesis** | Once disconnection exceeds 15% of operating time — \\(P(C=0)>0.15\\) — cloud-first architecture costs more than it saves | **Design for disconnection as baseline**, not as an exception handler |
| **Connectivity Model** | A semi-Markov chain with Weibull sojourn times captures how long partitions actually last, including the heavy tail of very long blackouts | **Size buffers and timeouts from the stationary distribution**, not from a worst-case guess |
| **Capability Coupling** | {% katex() %}\mathbb{E}[\text{Cap}] = \sum_i P(C \geq \theta_i) \cdot \Delta V_i{% end %} — capability gain accumulates only above connectivity thresholds | **Place feature-enable thresholds in the tail of the connectivity distribution**, so they activate reliably when connectivity exists |
| **Coordination Crossover** | Distributed coordination dominates when the fraction of time in Connected + Degraded regimes drops below 80% | **Pick your coordination mode from the regime distribution, not from peak-link assumptions** |
| **Constraint Sequence** | Capabilities must be built in a strict prerequisite order: survival \\(\to\\) measurement \\(\to\\) healing \\(\to\\) coherence \\(\to\\) anti-fragility | **You cannot safely build fleet coordination before self-healing is stable** |

> **Physical translation for {% katex() %}\mathbb{E}[\text{Cap}]{% end %}**: Think of this as a weighted sum. Each capability level — anomaly detection, fleet sync, anti-fragility learning — only "pays out" when connectivity is high enough to enable it. If connectivity almost never reaches a threshold, that capability contributes nothing to expected mission performance, no matter how well it's implemented.

This framework extends [partition-tolerant systems](https://users.ece.cmu.edu/~adrian/731-sp04/readings/GL-cap.pdf), [delay-tolerant networking](https://www.rfc-editor.org/rfc/rfc4838), and [autonomic computing](https://ieeexplore.ieee.org/document/1160055) for contested environments where adversarial interference compounds natural connectivity challenges.

**Three constraints you must answer before the framework can claim practical validity.** These are introduced here as structural design constraints — not afterthoughts — because each shapes the formal machinery from the ground up:

1. **Clock drift.** Crystal-oscillator nodes drift by seconds per hour and by minutes over 30-day partitions. Last-Write-Wins conflict resolution silently inverts causal order when physical timestamps are untrustworthy. *Constraint: the framework must not assume NTP availability for correctness guarantees.* Answered in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md) by Definition 85 (Clock Trust Window) and Definition 86 (Causality Header), which pivot from physical HLC ordering to pure logical ordering when the partition accumulator {% katex() %}T_{\mathrm{acc}}{% end %} exceeds the drift tolerance.

2. **Resource floor.** The full autonomic monitoring stack — EWMA, Merkle health tree, gossip table, EXP3-IX weight vector, event queue, vector clock — totals approximately 13 KB of SRAM. A 4 KB MCU has an autonomic ceiling of roughly 800 bytes under Proposition 21. The stack exceeds its own budget by \\(16\\times\\) before a single line of mission code runs. *Constraint: the stack must have a zero-tax tier that fits within 200 bytes.* Answered in [The Constraint Sequence and the Handover Boundary](@/blog/2026-02-19/index.md#zero-tax-autonomic) by Definitions 82–84 (Zero-Tax State Machine, In-Place Hash Chain, Fixed-Point EWMA) and Proposition 82 (Wakeup Latency Bound).

3. **Stability under mode-switching.** Proposition 9's gain bound {% katex() %}K < 1/(1 + \tau/T_{\mathrm{tick}}){% end %} assumes linear, time-invariant plant dynamics. Power-shedding makes {% katex() %}T_{\mathrm{tick}}{% end %} a discrete function of capability level \\(q\\) — the closed loop is a switched linear system that jumps between modes as resources degrade. The LTI stability proof does not transfer across mode boundaries. *Constraint: the stability proof must remain valid under mode transitions, including transitions forced by the resource floor constraint above.* Answered in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) by Proposition 80 (CBF mode-invariant safety), Theorem PWL (SMJLS mean-square stability), and Proposition 86 (CBF-derived refractory bound).

4. **Health observability without central infrastructure.** This article defines the health vector \\(\mathbf{H}(t)\\) and the resource state \\(R(t)\\), but provides no mechanism for a node to populate those vectors without a central collector. During partition, there is no ground truth: a node can only observe its own sensors and neighbors it can reach. *Constraint: anomaly detection and health propagation must operate locally on partial information.* Answered in [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md) by Definitions 4–7 (Local Anomaly Detection, Gossip Health Protocol, Staleness, Byzantine Node) and Propositions 3–7.

5. **State divergence under partition — the reconciliation debt.** The state divergence metric \\(D(t)\\) grows during every partition but this article provides no mechanism for bounding or resolving that debt when connectivity resumes. Fleet-wide consistency requires concurrent writes on disconnected nodes to converge without centralized arbitration. *Constraint: merge must be deterministic, commutative, and correct regardless of partition duration.* Answered in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md) by Definitions 11–14 (State Divergence, CRDT, Vector Clock, Authority Tier) and Propositions 12–16.

6. **Decision quality under sustained uncertainty.** The capability hierarchy \\(\mathcal{L}_0\\)–\\(\mathcal{L}_4\\) specifies *what* to run at each connectivity level, but says nothing about *how* to improve decision quality over time. A system that degrades gracefully but never learns from partition events is structurally correct but operationally stagnant. *Constraint: the system must improve its decisions after stress events, not merely survive them.* Answered in [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md) by Definition 15 (Anti-Fragility), Propositions 17–18, and the EXP3-IX / UCB bandit framework.

These six constraints are not independent. The resource floor (Constraint 2) directly tightens the mode-switching envelope (Constraint 3): a node entering OBSERVE state deactivates MAPE-K, rendering the healing stability proof vacuously satisfied but also providing zero healing coverage. The clock drift (Constraint 1) interacts with mode-switching: an OUTPOST crystal-oscillator node exceeds {% katex() %}T_{\mathrm{trust}}{% end %} in under three hours, meaning the causal pivot fires before most fault scenarios escalate. The first three fixes compose into a single 20-byte field — the [Unified Autonomic Header](@/blog/2026-02-05/index.md#def-100-uah) (Definition 100 in Fleet Coherence Under Partition) — that carries the clock fix, stability flag, and resource-tier signal in every gossip exchange without increasing per-item MTU. Constraints 4–6 are addressed independently in their respective articles but share the same gossip transport and state-vector substrate.

---

## Epistemic Positioning and Methodology

Before we build any formal machinery, we need to be precise about what kind of claims this framework makes — and what it doesn't. Misreading a theoretical bound as a measured benchmark is a common failure mode in distributed systems literature.

### What Kind of Claims Does This Framework Make?

<span id="def-0"></span>
**Definition 0** (Framework Scope). Every claim in this series is produced by exactly one of three operations:

{% katex(block=true) %}
\mathcal{S} = \{\text{formal reasoning},\ \text{constraint modeling},\ \text{engineering pattern synthesis}\}
{% end %}

**This framework is:**

- **Theoretical** — models are analytical constructs derived from first principles, not fitted to experimental data
- **Architectural** — the output is design patterns and structural relationships, not performance predictions
- **Deductive** — conclusions follow from stated assumptions via logical implication; change an assumption, the conclusion may not hold
- **Prescriptive** — given assumptions \\(\mathcal{A}\\), the framework prescribes mechanisms \\(\mathcal{M}\\) such that {% katex() %}\mathcal{A} \Rightarrow \mathcal{M}{% end %} satisfies objectives \\(\mathcal{O}\\)

*(Notation: \\(\mathcal{A}\\) denotes the assumption set in this section; it also appears as authority tier in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md), as the anti-fragility coefficient in [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md), and as the action space in game-theoretic contexts. Subscripts and section context differentiate the four roles throughout the series.)*

**This framework is not:**

- **Empirically validated** — no experimental measurements validate the quantitative claims
- **Predictive** — specific numeric outcomes (latencies, success rates) are illustrative, not forecasts
- **Universal** — conclusions hold only within stated assumption sets \\(\mathcal{A}_i\\); apply them outside those sets at your own risk
- **One-size-fits-all** — applicability requires verifying that your deployment conditions satisfy \\(\mathcal{A}_i\\)

### Methodological Principles

Three principles govern how every mechanism in this series was derived:

**Principle 1** (Assumption Explicitness). Every mechanism \\(M\\) is paired with an assumption set \\(\mathcal{A}_M\\). The validity of \\(M\\) is conditional on \\(\mathcal{A}_M\\) holding in the deployment context. If you skip verifying the assumptions, you've skipped the validity check.

**Principle 2** (Derivation from Constraints). Mechanisms are not chosen arbitrarily — they are derived as logical consequences of constraints. If constraint \\(c\\) implies mechanism \\(m\\), we write \\(c \vdash m\\). The notation signals that a mechanism is *forced*, not selected.

**Principle 3** (Architectural Coherence over Empirical Benchmarking). The primary goal is internal consistency — mechanisms compose correctly and satisfy stated objectives — not comparison against measured baselines. The framework succeeds if it's *coherent*; proving it's *fast* requires a separate empirical study.

### How to Read Quantitative Elements

Throughout this series, numbers appear in three distinct roles. Conflating them is the most common misreading:

| Element Type | What It Means | Example |
| :--- | :--- | :--- |
| **Bounds** | Theoretical limits derived from model structure — the system *cannot* exceed these | {% katex() %}O(\sqrt{T \ln T}){% end %} regret for the EXP3-IX bandit |
| **Thresholds** | Decision boundaries derived from cost analysis — *if* your costs match the model, use this value | {% katex() %}\theta^* = C_{FP}/(C_{FP} + C_{FN}){% end %} |
| **Illustrations** | Concrete numbers for pedagogical clarity only — they show *how* the framework applies, not *what will happen* on your hardware | "3–5 observations" for anomaly detection |

> Illustrations are not performance claims. They show the framework in action under specific parameter choices. Calibrate every illustration against your own hardware before relying on it.

### From Theory to Practice

This framework provides **architectural templates** and **reasoning patterns**. Putting it into production requires three steps that the framework itself cannot do for you:

1. **Assumption verification** — Does your deployment context satisfy \\(\mathcal{A}_i\\)? If not, which mechanisms need re-derivation?
2. **Parameter instantiation** — What are the concrete values for \\(\theta, \tau, \lambda, \ldots\\) in your system?
3. **Empirical validation** — Does the implemented system actually achieve acceptable performance?

### Reading Conditional Claims

Throughout the series, every conclusion is expressed in this form:

{% katex(block=true) %}
\mathcal{A} \vdash P \quad \text{means} \quad \text{"under assumptions } \mathcal{A} \text{, property } P \text{ holds"}
{% end %}

> **Plain English**: "{% katex() %}\mathcal{A} \vdash P{% end %}" reads as "if the listed assumptions hold, then property \\(P\\) is guaranteed." It is *not* saying \\(P\\) holds in general — only conditionally. Every time you see this notation, ask yourself: do my deployment conditions actually satisfy \\(\mathcal{A}\\)?

---

## Formal Foundations

An edge node is always doing one of two things: adapting to changing conditions, or failing to. Five state variables capture everything the node needs to know about itself to make that distinction precise.

### Core State Variables

Five quantities fully describe an edge node's operational state at any instant. Every other framework parameter derives from these five.

| Variable | Range | What It Measures | What Happens at the Limits |
| :--- | :--- | :--- | :--- |
| \\(C(t)\\) — link quality | 0 = disconnected, 1 = full capacity | Fraction of nominal link capacity currently available | At \\(C=0\\): no bits flow, all cloud-dependent capabilities stop. At \\(C=1\\): full datarate available, all regimes enabled |
| \\(\Xi(t)\\) — operating regime | \\(\mathcal{C}\\) (Connected), \\(\mathcal{D}\\) (Degraded), \\(\mathcal{I}\\) (Intermittent), \\(\mathcal{N}\\) (None) | Discrete behavioral label derived from \\(C(t)\\) thresholds — the RAVEN swarm runs four distinct behavioral envelopes based on this variable alone | At \\(\mathcal{C}\\): full consensus and fleet sync. At \\(\mathcal{N}\\): local autonomy only, no external coordination |
| \\(\mathcal{L}(t)\\) — capability level | 0 = survival-only, 4 = full optimization | Integer tier of service the node currently delivers. \\(\mathcal{L}_0\\): basic sensing and local storage. \\(\mathcal{L}_4\\): full coordinated learning across the fleet | At \\(\mathcal{L}_0\\): the node survives but does nothing beyond staying alive. At \\(\mathcal{L}_4\\): every optimization layer is running |
| \\(\mathbf{H}(t)\\) — health vector | One score per subsystem, each in \\([0,1]\\) | Per-subsystem health across \\(n\\) monitored components. For RAVEN with \\(n=6\\), a vector like \\([0.9, 0.3, 1.0, \ldots]\\) immediately flags the second subsystem as critically degraded | Any component at 0 = failed; triggers self-healing. All at 1.0 = nominal; no action required |
| \\(D(t)\\) — state divergence | 0 = in sync with fleet, 1 = fully isolated state | How far this node's local state has drifted from fleet consensus during disconnection — the debt the system accumulates by operating autonomously | At \\(D=0\\): zero reconciliation cost at reconnection. At \\(D=1\\): maximum reconciliation cost — the node may need to replay the entire partition period |
| \\(R(t)\\) — resource availability | \\([0, 1]\\) | Normalized composite of battery SOC, free memory, and idle CPU. Critical threshold: {% katex() %}R_{\text{crit}} \approx 0.2{% end %}. Formal definition: [Definition 19b](#def-19b) below | At \\(R > 0.2\\): normal degraded operation. At \\(R < 0.2\\): emergency resource shedding; capability drops to \\(\mathcal{L}_0\\) |

<span id="def-19b"></span>
**Definition 19b** (Resource State). *Let \\(R(t) \in [0, 1]\\) denote the normalized composite resource availability at time \\(t\\):*

{% katex(block=true) %}
R(t) = \frac{E_{\text{battery}}(t)}{E_{\min}} \cdot w_E + \frac{M_{\text{free}}(t)}{M_{\text{total}}} \cdot w_M + \frac{\text{CPU}_{\text{idle}}(t)}{\text{CPU}_{\text{total}}} \cdot w_C
{% end %}

*with weights \\(w_E + w_M + w_C = 1\\). Critical threshold: {% katex() %}R_{\text{crit}} \approx 0.2{% end %} — 20% composite resource availability triggers survival mode regardless of connectivity state.*

- **Use**: Compare {% katex() %}R(t) < R_{\text{crit}}{% end %} at each MAPE-K tick to trigger survival mode; the composite prevents single-dimension blindness — a full-battery node crashing from memory exhaustion reads {% katex() %}R \gg R_{\text{crit}}{% end %} on battery alone but is captured by the \\(w_M\\) term.
- **Parameters**: RAVEN: {% katex() %}w_E=0.5,\, w_M=0.25,\, w_C=0.25{% end %}; OUTPOST: \\(w_E=0.7\\) (battery-dominated site). Weights are deployment-tuned offline; the structure of \\(R(t)\\) is fixed.
- **Field note**: Memory is the most-overlooked resource dimension — in OUTPOST, OOM kills caused 40% of node failures that appeared as power events in energy-only monitoring.

The constraint sequence article uses 'Denied' for \\(0 < C \leq 0.3\\) and 'Emergency' for \\(C = 0\\) as an illustrative simplification of the Intermittent/None boundary; the authoritative label for complete disconnection remains \\(\mathcal{N}\\) (None) as defined here.

### Notation Legend

Several symbols carry different meanings depending on context. The table below lists every symbol with multiple roles across the series — the subscript or context always resolves ambiguity.

| Symbol | Primary Meaning | Other Roles (subscript disambiguates) |
| :--- | :--- | :--- |
| \\(\mathcal{A}_x\\) | Assumption set — subscript names the scenario | Authority tier, anti-fragility coefficient, and action space in later articles |
| \\(\mathcal{Q}_j\\) | Authority tier: Node (0), Cluster (1), Fleet (2), Command (3) | Text variant {% katex() %}\mathcal{Q}_{\text{delegated}}{% end %} for delegated authority |
| \\(\mathbb{A}\\) | Anti-fragility coefficient \\((P_1 - P_0)/\sigma\\) — scalar | Distinct from assumption set \\(\mathcal{A}\\); double-struck A signals this |
| \\(\mathcal{U}\\) | Action or control space in optimization | Domain of optimization: \\(a \in \mathcal{U}\\) |
| \\(\Gamma\\) | Constraint set of all deployment constraints | Appears as \\(c \in \Gamma\\) and {% katex() %}\sigma: \Gamma \to \mathbb{N}{% end %} |
| \\(\mathcal{C}\\) | Connected regime — highest connectivity state | Also: constraint set in the constraint sequence article; regime tuple {% katex() %}\mathcal{C}, \mathcal{D}, \mathcal{I}, \mathcal{N}{% end %} |
| \\(E\\) | Edge-ness Score \\(\in [0,1]\\) classifying deployment type | Threshold comparisons: \\(E < 0.3\\) = edge, \\(E \geq 0.6\\) = cloud |
| \\(T_d\\) | Energy per local compute decision — joules, range 10–100 \\(\mu\text{J}\\) | Subscript d = "decide"; never a time value |
| \\(T_s\\) | Energy per radio packet transmission — joules, range 1–10 mJ | Subscript s = "send"; \\(T_s / T_d \approx 10^2\\)–\\(10^3\\) |
| \\(\tau\\) | Loop delay {% katex() %}\tau_{\text{fb}}{% end %}; staleness {% katex() %}\tau_{\text{stale}}{% end %}; partition duration {% katex() %}\tau_{\text{partition}}{% end %}; burst duration {% katex() %}\tau_{\text{burst}}{% end %} | Subscript selects role; bare \\(\tau\\) = {% katex() %}\tau_{\text{fb}}{% end %}; \\(\tau^\*\\) = Inversion Threshold |
| \\(\gamma\\) | Semantic convergence factor ([Def 1b](#def-1b)); age-decay rate; Holt-Winters seasonality; Byzantine reputation rates {% katex() %}\gamma_{\text{decay}}, \gamma_{\text{recover}}{% end %} | Bare \\(\gamma\\) = Def 1b in this article; subscript selects other roles |
| \\(k_i\\) | Weibull shape for regime \\(i\\) — controls partition tail heaviness | \\(k_\mathcal{N} < 1\\) = heavy tail; \\(k=1\\) = exponential; \\(k>1\\) = light tail. Distinct from uppercase \\(K\\) (control loop gain) — \\(k_\mathcal{N}\\) is a Weibull parameter never used as a gain |
| \\(\lambda_i\\) | Weibull scale for regime \\(i\\) — sets characteristic sojourn time | {% katex() %}\mathbb{E}[T_i] = \lambda_i\,\Gamma(1+1/k_i){% end %}; at \\(k=1\\): \\(\lambda_i = 1/q_i\\) |
| {% katex() %}T_{\mathrm{acc}}{% end %} | Partition duration accumulator — contiguous time in \\(\mathcal{N}\\) | Reset to 0 on partition end; input to \\(\theta^\*(t)\\) and circuit breaker ([Proposition 92](@/blog/2026-01-29/index.md#prop-92) — forward reference, defined in Self-Healing Without Connectivity) |
| {% katex() %}Q_{0.95}{% end %} | P95 partition duration planning threshold | {% katex() %}Q_{0.95} = \lambda_\mathcal{N}(\ln 20)^{1/k_\mathcal{N}}{% end %}; MCU: one `pow()` call |
| {% katex() %}\gamma_{\mathrm{FN}}{% end %} | False-negative cost escalation rate \\(\geq 0\\) | 0 = static threshold; 2.0 = OUTPOST calibration; bounded by \\([0, 5]\\) in practice |
| \\(\beta\\) | Reconciliation cost ([Prop 1](#prop-1)); Holt-Winters trend coefficient; bandwidth asymmetry {% katex() %}\beta = B_{\text{backhaul}}/B_{\text{local}}{% end %}; Gamma prior rate \\(\beta_i^0\\) | Subscript or context selects meaning across articles |
| \\(\rho\\) | Compute-to-transmit energy ratio {% katex() %}\rho = T_d/T_s \approx 10^{-3}\text{–}10^{-2}{% end %} — used in Proposition 23 dominance threshold; the local-dominant compute-cycle ceiling is {% katex() %}1/\rho = T_s/T_d \approx 10^2\text{–}10^3{% end %} | Subscript \\(\rho_q\\) = CBF stability margin in [Proposition 80](@/blog/2026-01-29/index.md#prop-80) (forward reference — defined in Self-Healing Without Connectivity); bare \\(\rho\\) always = compute-to-transmit energy ratio |
| {% katex() %}\rho_J{% end %} | Spatial jamming correlation factor {% katex() %}\rho_J \in [0,1]{% end %} — scales how strongly a neighbor's denial state elevates a node's own Denied transition rate (Definition 90) | Distinct from bare \\(\rho\\) (compute-to-transmit ratio above); {% katex() %}\rho_J = 0{% end %} = independent fading; {% katex() %}\rho_J = 1{% end %} = full area-denial coupling |
| \\(\lambda\\) | Bare \\(\lambda\\) = state update rate (events/s) in [Proposition 12](@/blog/2026-02-05/index.md#prop-12); subscript \\(\lambda_i\\) = Weibull scale above | Also used as gossip contact rate in [Proposition 4](@/blog/2026-01-22/index.md#prop-4) and drift coefficient in [Proposition 9](@/blog/2026-01-29/index.md#prop-9); subscript always disambiguates |
| \\(\lambda_{\text{drift}}\\) | Kalman process noise rate (\\(s^{-1}\\)) — controls how fast the adaptive baseline adjusts across capability levels | Distinct from: Weibull scale \\(\lambda_i\\) (Definition 66), gossip fanout rate \\(\lambda\\) (Proposition 4), and information decay rate \\(\lambda_c\\) (Definition 1b) |

### Constraint Structure

Three hard constraints govern everything that follows. If any one of them is violated, the architecture fails — not degrades, fails. \\(B(t)\\) is available bandwidth, \\(R(t)\\) is remaining resource budget (power, compute, memory combined), \\(K\\) is control loop gain, and \\(\tau\\) is loop delay. Here \\(\tau\\) means {% katex() %}\tau_{\text{fb}}{% end %}; for all four roles \\(\tau\\) plays across the series see the Notation Legend above.

{% katex(block=true) %}
\begin{aligned}
&B(t) \leq B_{\max} \cdot C(t) && \text{(bandwidth scales with connectivity)} \\
&\mathcal{L}(t) \leq f(C(t), R(t)) && \text{(capability bounded by connectivity + resources)} \\
&K < \frac{1}{1 + \tau/T_{\text{tick}}} && \text{(control loop stability; Proposition 9; Proposition 78 for stochastic \(\tau\))}
\end{aligned}
{% end %}

> **Physical translation**:
> - **Constraint 1**: The radio link is the ceiling. When \\(C(t)\\) drops, available bandwidth drops proportionally — not gradually but directly. At \\(C=0\\), the ceiling is zero.
> - **Constraint 2**: You cannot run capabilities you cannot power. If connectivity or resources fall below a threshold, the corresponding capability level shuts down — this is not optional.
> - **Constraint 3**: If the control loop gain \\(K\\) is too high relative to the feedback delay \\(\tau\\), the healing loop oscillates rather than converges. Think of it as driving: the faster the road curves, the earlier you must steer.

A fourth constraint captures the energy asymmetry that distinguishes edge from cloud — and it forces every architectural choice from the ground up.

{% katex(block=true) %}
T_s / T_d \gg 1 \quad \text{(radio dominates the energy budget)}
{% end %}

> **Physical translation**: Transmitting one radio packet costs roughly 1,000 times more energy than running one local compute operation. The system that offloads decisions to the cloud to "save compute" actually burns orders of magnitude more energy on the radio link than it saves on silicon.

<span id="def-21"></span>
**Definition 21** (Energy-per-Decision Metric). *The total energy cost of decision \\(a\\) is:*

{% katex(block=true) %}
\mathcal{E}(a,\,C) = n_c(a)\cdot T_d \;+\; n_s(a,\,C)\cdot T_s
{% end %}

- **Use**: Computes Joules per decision as {% katex() %}(n_c \cdot T_d) + (n_s \cdot T_s){% end %}; check before executing any action to catch energy-wasteful transmissions that silently drain battery before {% katex() %}T_{\text{surv}}{% end %}.
- **Parameters**: {% katex() %}T_d = 10\text{--}100\,\mu\text{J}{% end %} (compute); {% katex() %}T_s = 1\text{--}10\,\text{mJ}{% end %} (radio); {% katex() %}T_s/T_d \approx 1000{% end %} in practice, so radio dominates.
- **Field note**: One radio packet costs {% katex() %}\approx 1000{% end %} compute steps — batch aggressively or the energy budget never closes.

*where \\(n_c(a)\\) is the number of local compute cycles required, \\(n_s(a, C)\\) is the number of radio packets required (zero when \\(C = 0\\)), \\(T_d\\) is joules per compute operation, and \\(T_s\\) is joules per transmitted packet.*

This metric reframes every architectural choice as an energy budget problem. Sending one {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} packet costs the same as running \\(T_s/T_d \approx 10^3\\) local inference cycles. The system that offloads decisions to the cloud to "save compute" actually spends orders of magnitude more energy on the radio link than it saves on silicon.

<span id="prop-23"></span>
**Proposition 23** (Compute-Transmit Dominance Threshold). *Local computation is energetically dominant — cheaper than radio-assisted offloading — for any decision requiring fewer than \\(1/\rho\\) compute cycles, where \\(\rho = T_d/T_s\\):*

{% katex(block=true) %}
\mathcal{E}(a,\,C > 0) < \mathcal{E}(a,\,C = 0) \iff n_c(a) < \frac{1}{\rho} = \frac{T_s}{T_d}
{% end %}

> **Physical translation**: Running a decision locally is cheaper than transmitting it whenever the local compute footprint is less than \\(T_s/T_d \approx 1000\\) cycles. This threshold is a hardware constant, not a policy choice. Any algorithm with fewer than ~1,000 operations should run locally — unconditionally, regardless of whether connectivity is available — because the radio link costs more energy than the silicon.

- **Use**: Gives the compute-count threshold below which one radio packet costs more than all local work; use it to decide whether local batching or per-reading transmission is the energy-efficient choice.
- **Parameters**: {% katex() %}\rho = T_d/T_s{% end %} compute-to-transmit ratio (0.001–0.01); threshold {% katex() %}= 1/\rho = T_s/T_d{% end %}, about 100–1000 compute cycles per packet.
- **Field note**: Buffer at least 200 local operations per packet — anything less puts you in transmit-dominated territory regardless of algorithm efficiency.

*For {% katex() %}\rho = 10^{-3}{% end %} (tactical radio): any decision requiring fewer than 1,000 local compute cycles is cheaper to run locally than to transmit — even when connectivity is available.*

**Design consequence**: The {% term(url="#term-inversion", def="Availability threshold tau* above which partition-first architecture outperforms cloud-first; derived from the U_edge = U_cloud crossover condition") %}inversion threshold{% end %} \\(\tau^\*\\) from Proposition 1 has an energy analog. Even when \\(C(t) > \tau^\*\\) and distributed autonomy does not strictly dominate cloud control on latency or capability grounds, it may still dominate on energy grounds if \\(n_c < 1/\rho\\). At the edge, physics — not just connectivity — mandates local compute.

**Illustrative hardware parameters** (order-of-magnitude estimates consistent with representative datasheets for each platform class; not measured values — calibrate \\(T_d\\) and \\(T_s\\) for the target hardware):

| System | \\(T_d\\) | \\(T_s\\) | \\(\rho\\) | Local-dominant threshold |
| :--- | :--- | :--- | :--- | :--- |
| RAVEN drone MCU | \\(50\\,\mu\text{J}\\) | {% katex() %}5\,\text{mJ}{% end %} | {% katex() %}10^{-2}{% end %} | \\(<100\\) compute cycles |
| CONVOY vehicle ECU | \\(20\\,\mu\text{J}\\) | {% katex() %}8\,\text{mJ}{% end %} | {% katex() %}2.5\times10^{-3}{% end %} | \\(<400\\) compute cycles |
| OUTPOST sensor node | \\(10\\,\mu\text{J}\\) | {% katex() %}10\,\text{mJ}{% end %} | {% katex() %}10^{-3}{% end %} | \\(<1000\\) compute cycles |

**Detection-value extension**: Proposition 23 assumes all local computation has equivalent value per unit energy. For decision processes that prevent high-cost downstream events — anomaly detection avoiding cascading failure, intrusion detection preventing node compromise — the effective dominance threshold extends. Let {% katex() %}U_{\text{detect}}{% end %} denote the energy-equivalent value of a correct detection (joules of downstream cost avoided). The extended dominance condition is:

{% katex(block=true) %}
n_c < \frac{T_s + U_{\text{detect}}}{T_d}
{% end %}

For {% katex() %}U_{\text{detect}} = k \cdot T_s{% end %}, the local-dominant region expands by factor \\((1 + k)\\):

| {% katex() %}U_{\text{detect}}{% end %} | RAVEN extended threshold | Design implication |
| :--- | :--- | :--- |
| \\(T_s\\) (one avoided spurious alert) | \\(n_c < 200\\) | Models up to 2x more complex are local-dominant |
| \\(5\\,T_s\\) (cluster-level false positive) | \\(n_c < 600\\) | Medium-complexity models (autoencoder, small TCN) justified |
| \\(10\\,T_s\\) (mission-abort cost) | \\(n_c < 1{,}100\\) | Full TCN ensemble remains energetically dominant |

Quantifying {% katex() %}U_{\text{detect}}{% end %} requires estimating the failure cost — the energy and mission consequence of missing an anomaly — which is system-specific. The [anomaly detection framework](@/blog/2026-01-22/index.md) applies this extended threshold when selecting between EWMA, TCN, and ensemble models on resource-constrained edge nodes.

**The autonomic floor problem.** The energy analysis above assumes the autonomic management stack itself fits within the available headroom. On ultra-constrained MCUs with 4–32 KB of SRAM, even a minimal EWMA baseline (80 B) paired with a Merkle-tree health ledger (8 KB) and gossip table (1 KB) can exceed the autonomic ceiling from Proposition 21 — before a single mission byte runs. This is the *autonomic floor problem*: the monitoring stack outweighs its subject. The [Constraint Sequence and the Handover Boundary](@/blog/2026-02-19/index.md#zero-tax-autonomic) addresses this directly with a Zero-Tax implementation tier that drops the active footprint from 13 KB to under 200 bytes by deferring stack initialization until anomaly evidence accumulates.

**Power-contingent operating modes and the switched-system regime.** The energy analysis above treats \\(T_d\\) and \\(T_s\\) as fixed hardware constants. In practice, thermal throttling and power-shedding make \\(T_d\\) a function of the current capability level \\(q\\). A node under 50% thermal throttle doubles compute time per operation, directly inflating \\(\mathcal{E}(a, C)\\):

| System | \\(T_d\\) (L3, full) | \\(T_d\\) (L1, 50% throttle) | \\(T_d\\) (L0, monitor only) |
| :--- | :--- | :--- | :--- |
| RAVEN drone MCU | \\(50\\,\mu\text{J}\\) | \\(100\\,\mu\text{J}\\) | \\(150\\,\mu\text{J}\\) |
| CONVOY vehicle ECU | \\(20\\,\mu\text{J}\\) | \\(40\\,\mu\text{J}\\) | \\(65\\,\mu\text{J}\\) |
| OUTPOST sensor node | \\(10\\,\mu\text{J}\\) | \\(22\\,\mu\text{J}\\) | \\(35\\,\mu\text{J}\\) |

This mode-dependence is the surface symptom of a deeper structural problem. The healing control loop — developed formally in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) — assumes constant \\(A\\) and \\(B\\) matrices in \\(\dot{x} = Ax + Bu\\). Power-shedding changes {% katex() %}T_{\text{tick}}(q){% end %} (the MAPE-K sampling period) and \\(K(q)\\) (the control gain); the system becomes a **switched linear system** that jumps between discrete stability envelopes as capability degrades. Two definitions anchor the full stability analysis in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md).

<span id="def-78"></span>

**Definition 78** (Hybrid Capability Automaton). *The edge node's closed-loop autonomic dynamics are modeled as a hybrid automaton:*

{% katex(block=true) %}
\mathcal{H} = \bigl(Q,\; X,\; f,\; \mathrm{Inv},\; \mathrm{Guard},\; \Pi\bigr)
{% end %}

*where {% katex() %}Q = \{L_0, L_1, L_2, L_3, L_4\}{% end %} are the discrete capability modes; {% katex() %}X \subseteq \mathbb{R}^{d_{\max}+1}{% end %} is the continuous error-state space with {% katex() %}x = [e(t),\, e(t-1),\, \ldots,\, e(t - d_{\max})]^\top{% end %} (the MAPE-K anomaly-threshold error history); \\(f_q(x, u) = A_q x + B_q u\\) is the mode-\\(q\\) flow with delay-chain companion matrix \\(A_q\\) and gain vector {% katex() %}B_q = [-K_q, 0, \ldots, 0]^\top{% end %}; {% katex() %}\mathrm{Inv}_q = \{R(t) \in [R_q^{\mathrm{lo}},\, R_q^{\mathrm{hi}})\}{% end %} is the mode-\\(q\\) invariant using the composite resource state \\(R(t)\\) from Definition 19b; {% katex() %}\mathrm{Guard}_{q \to q'}{% end %} fires when \\(R(t)\\) exits {% katex() %}\mathrm{Inv}_q{% end %}; and \\(\Pi\\) is the semi-Markov transition matrix governed by the Weibull partition model (Definition 66, below).*

> **Physical translation**: Think of this as a state machine where each mode has its own stability rules. The guard fires when the resource state \\(R(t)\\) drops out of a mode's valid range — like a thermostat tripping a relay. Crucially, the error history \\(x\\) carries over across transitions with no reset, meaning every mode jump inherits the full consequence of what came before.

State resets are **absent**: the error history \\(x\\) is continuous across mode transitions. Every capability-level change is therefore a potential stability hazard that requires explicit pre-transition verification by Definition 110 (Nonlinear Safety Guardrail, defined in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-110)).

<span id="def-79"></span>

**Definition 79** (Stability Region). *For capability level \\(q \in Q\\), the Stability Region \\(\mathcal{R}_q \subset X\\) is the maximal forward-invariant ellipsoidal set under mode-\\(q\\) dynamics — the set of error states from which the healing loop provably converges to equilibrium:*

{% katex(block=true) %}
\mathcal{R}_q = \bigl\{\, x \in X \;\big|\; x^\top P_q\, x \;<\; c_q \,\bigr\}
{% end %}

*where \\(P_q \succ 0\\) is the mode-\\(q\\) Lyapunov matrix computed offline via LMI (Theorem PWL, proved in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md)) and \\(c_q > 0\\) is the level-set radius. The stability margin at time \\(t\\) is:*

{% katex(block=true) %}
\rho_q(t) \;=\; 1 - \frac{x(t)^\top P_q\, x(t)}{c_q} \;\in\; (-\infty,\, 1]
{% end %}

> **Physical translation**: \\(\mathcal{R}_q\\) is the safety envelope for the healing loop at capability level \\(q\\). When the error state \\(x(t)\\) stays inside this ellipse, healing converges. When it exits — \\(\rho_q < 0\\) — the loop diverges and must be suspended. The ellipse **shrinks** as the node degrades.

- **Use**: Log \\(\rho_q(t)\\) every MAPE-K tick as a mission telemetry signal — a value consistently below 0.3 predicts healing-loop instability before oscillation becomes visible in behavior.
- **Parameters**: \\(\rho_q = 1\\) at equilibrium (\\(x = 0\\)); \\(\rho_q = 0\\) at the safe-set boundary; \\(\rho_q < 0\\) means the error state has exited \\(\mathcal{R}_q\\) — suspend healing immediately.
- **Field note**: Unlike the LTI stability condition (binary pass/fail), \\(\rho_q(t)\\) is continuous and loggable. Treat it as a stability fuel gauge, not a circuit breaker.

**The shrinking stability envelope.** Computed from the LMI solution for RAVEN parameters ({% katex() %}\tau_{\text{fb}} = 5\,\text{s}{% end %}, P99 delay \\(= 25\\,\text{s}\\), Weibull \\(k_N = 0.62\\) — Definition 66, below):

| Mode \\(q\\) | {% katex() %}T_{\text{tick}}(q){% end %} | {% katex() %}K_{\max}^{\mathrm{LTI}}(q){% end %} | {% katex() %}K_{\mathrm{gs}}{% end %} at \\(\rho = 0.5\\) | \\(\mathcal{R}_q\\) diameter |
| :--- | :--- | :--- | :--- | :--- |
| L3 (nominal) | 5 s | 0.50 | 0.43 | \\(4.2\sigma\\) |
| L2 (reduced sensing) | 8 s | 0.38 | 0.32 | \\(3.5\sigma\\) |
| L1 (thermal throttle) | 10 s | 0.33 | 0.28 | \\(2.8\sigma\\) |
| L0 (monitoring only) | 60 s | 0 | — | — |

A fault at \\(3.2\sigma\\) lies safely inside {% katex() %}\mathcal{R}_{L3}{% end %} (diameter \\(4.2\sigma\\)) and is correctable. The **identical fault** under L1 thermal throttle exceeds {% katex() %}\mathcal{R}_{L1}{% end %} (diameter \\(2.8\sigma\\)) — the healing loop diverges without a prior gain reduction. Definition 110 (Nonlinear Safety Guardrail, [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-110)) detects this pre-transition and enforces the required derate automatically.

### Prerequisite Ordering

Capabilities form a directed acyclic graph where \\(A \prec B\\) means "\\(A\\) must be validated before \\(B\\) is useful":

{% katex(block=true) %}
\text{Hardware Trust} \prec \mathcal{L}_0 \prec \text{Self-Measurement} \prec \text{Self-Healing} \prec \text{Fleet Coherence} \prec \text{Anti-Fragility}
{% end %}

**Design consequence**: Building {% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} before self-healing wastes effort. A node that learns from stress but cannot heal itself amplifies its own failures.

### Objective Hierarchy

The system optimizes four objectives in strict lexicographic order — each must be satisfied before the next is considered. This ordering is not a preference; it is a correctness condition.

| Priority | Objective | Formula | Design Consequence |
| :---: | :--- | :--- | :--- |
| 1 | **Survival** | {% katex() %}\min P(\mathcal{L} \to 0){% end %} | Never sacrifice L0 for higher capability |
| 2 | **Autonomy** | {% katex() %}\max \mathbb{E}[\mathcal{L} \mid \Xi = \mathcal{N}]{% end %} | Capability under partition drives architecture |
| 3 | **Coherence** | {% katex() %}\min \mathbb{E}[\tau_{\text{reconcile}}]{% end %} | Design for fast merge at reconnection |
| 4 | **Anti-fragility** | \\(\max \mathbb{A}\\) | Learn from stress; improve under adversity |

**Primary metric**: Expected integrated capability {% katex() %}\mathbb{E}[\int_0^T \mathcal{L}(t)\, dt]{% end %}. This quantity drives threshold placement, resource allocation, and every protocol design trade-off throughout the series.

### System Boundaries

Decision scope determines protocol complexity and partition tolerance. Wider scope demands higher connectivity to execute — narrower scope succeeds even in full partition.

| Boundary | Timescale | Protocol | What Happens at Partition |
| :--- | :--- | :--- | :--- |
| **Node** | Milliseconds | Local state only | Fully autonomous — partition has no effect |
| **Cluster** | Seconds–minutes | Gossip | Cluster operates independently; no external coordination needed |
| **Fleet** | Minutes–hours | Hierarchical sync | Delegate to cluster leads with pre-authorized bounds |
| **Command** | Hours–days | Human-in-loop | Defer non-critical decisions; execute within pre-authorized envelope |

Authority tier \\(\mathcal{Q}_j\\) for {% katex() %}j \in \{0,1,2,3\}{% end %} classifies decisions by scope: \\(\mathcal{Q}_0\\) (node), \\(\mathcal{Q}_1\\) (cluster), \\(\mathcal{Q}_2\\) (fleet), \\(\mathcal{Q}_3\\) (command). Higher authority requires higher connectivity; partition triggers delegation to lower tiers with bounded autonomy.

---

<span id="term-inversion"></span>
## The Inversion Thesis

Fog computing, mobile edge computing, and the edge-cloud continuum all share a foundational assumption: connectivity is the baseline state, and disconnection is a degraded exception to recover from. This section inverts that assumption formally. **Partition is the baseline. Connectivity is the opportunity.** The formal derivation below establishes exactly where the crossover happens.

**Cloud architecture** assumes \\(P(C = 0) < 0.01\\) and {% katex() %}\mathbb{E}[T_{\text{partition}}] < 60{% end %} seconds. Partition handling exists but receives minimal optimization effort — it's a fallback, not a design mode.

**Edge architecture** operates under \\(P(C = 0) > 0.15\\) and {% katex() %}\mathbb{E}[T_{\text{partition}}] > 1800{% end %} seconds. Under these conditions, designing for disconnection as baseline *provably* outperforms designing for connectivity as baseline — above a computable threshold.

**Bounded claim**: The difference becomes categorical above threshold \\(\tau^\*\\). Below \\(\tau^\*\\), cloud patterns may suffice. Above it, they cannot.

**Assumption Set** {% katex() %}\mathcal{A}_{inv}{% end %}:
- \\(A_1\\): Mission continues during partition (no external abort trigger)
- \\(A_2\\): Decisions have bounded latency requirement \\(\delta_d < \infty\\) (\\(\delta_d\\) = decision latency in seconds; distinct from \\(T_d\\), the energy-per-decision metric in Definition 21)
- \\(A_3\\): Synchronization period \\(\delta_s\\) is finite and \\(\delta_s \geq \delta_d\\)
- \\(A_4\\): Retry overhead {% katex() %}\rho(p) \geq \rho_0 > 0{% end %} on failed coordination attempts; functional form underdetermined. Baseline derivation ({% katex() %}\tau^* \approx 0.40{% end %}) assumes constant {% katex() %}\rho = \rho_0{% end %} (fixed overhead, e.g., TDMA or polling MAC); adjusted range (\\(\tau^\* \in [0.12, 0.18]\\)) additionally assumes {% katex() %}\rho(p) = \rho_0/(1-p){% end %} (TCP-like congestion growth). Model-agnostic bounds are developed in "Retry Model Sensitivity" within the Proposition 1 proof.

<style>
#tbl_cloud_vs_edge + table th:first-of-type { width: 28%; }
#tbl_cloud_vs_edge + table th:nth-of-type(2) { width: 36%; }
#tbl_cloud_vs_edge + table th:nth-of-type(3) { width: 36%; }
</style>
<div id="tbl_cloud_vs_edge"></div>

The table below makes explicit the eight structural assumptions where cloud-native and tactical edge systems differ. Each row is not a performance difference — it is a **different architectural universe**.

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
**Definition 1** (Connectivity State). The {% term(url="#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} {% katex() %}C(t): \mathbb{R}^+ \rightarrow [0,1]{% end %} is a right-continuous stochastic process where \\(C(t) = 1\\) denotes full connectivity, \\(C(t) = 0\\) denotes complete partition, and intermediate values represent degraded connectivity as a fraction of nominal bandwidth.

> **Plain English**: \\(C(t)\\) is simply the fraction of your radio link that's working right now — a continuous dial from zero (blackout) to one (full capacity). "Right-continuous" means when the link drops, it drops instantly; there's no grace period. The regime \\(\Xi(t)\\) then maps this continuous signal to one of four discrete behaviors.

<span id="def-2"></span>
**Definition 2** (Connectivity Regime). A system operates in the **cloud regime** if \\(\mathbb{E}[C(t)] > 0.95\\) and \\(P(C(t) = 0) < 0.01\\). A system operates in the **contested edge regime** if \\(\mathbb{E}[C(t)] < 0.5\\) and \\(P(C(t) = 0) > 0.1\\).

> **Plain English**: Cloud regime means connectivity is nearly always there — less than 1% chance of full blackout. Contested edge means the link is below half-capacity on average and fully dark more than 10% of the time. Most tactical and industrial deployments measured in the field sit firmly in the edge regime before architecture is chosen.

*Note on terminology: "Partition" refers to a contiguous duration spent in the Denied regime (C(t) = 0); "Denied regime" (state \\(\mathcal{N}\\)) is the connectivity state itself; "disconnection" is a generic informal term for either. These are used precisely: "partition duration" is always a time interval, never a state label.*

<span id="prop-1"></span>
**Proposition 1** ({% term(url="#prop-1", def="The connectivity level below which distributed autonomy outperforms cloud control") %}Inversion Threshold{% end %}). Under assumption set {% katex() %}\mathcal{A}_{inv}{% end %}, there exists a threshold \\(\tau^\*\\) such that cloud-native coordination patterns yield lower expected utility than partition-first patterns when \\(P(C(t) = 0) > \tau^\*\\).

> **The Problem**: Cloud-native systems wait for connectivity to make decisions. When the link is down 15–40% of the time, that wait compounds into unbounded latency — coordination overhead grows superlinearly as partition probability approaches the retry-storm regime.
>
> **The Solution**: Compute \\(\tau^\*\\) explicitly from your system's cost parameters and field-measured retry behavior. If your deployment's \\(P(C=0)\\) exceeds \\(\tau^\*\\), switch to partition-first architecture.
>
> **The Trade-off**: Partition-first architecture pays a reconciliation cost \\(\beta\\) every time connectivity resumes. You are trading per-reconnection overhead for freedom from coordination stalls during partition.

*Formal Derivation*:

Let {% katex() %}U_{\text{cloud}}(p){% end %} denote expected utility under cloud-native patterns and {% katex() %}U_{\text{edge}}(p){% end %} under partition-first patterns, where \\(p = P(C(t) = 0)\\).

**Cloud-native utility** — coordination waits for connectivity. Expected decision latency grows with partition probability \\(p\\), where \\(T_s\\) is the synchronization period and \\(\rho\\) is the per-attempt retry overhead:

{% katex(block=true) %}
\mathbb{E}[T_{\text{cloud}}] = T_s \cdot \frac{1}{1-p} + \rho \cdot \frac{p}{1-p}
{% end %}

> **Physical translation**: The \\(1/(1-p)\\) factor is the geometric series of retry attempts. At \\(p = 0.5\\), expected latency doubles. At \\(p = 0.9\\), it is \\(10\\times\\) nominal — the system spends most of its time in the retry queue, not executing decisions.

{% katex(block=true) %}
U_{\text{cloud}}(p) = U_0 - \alpha \cdot \mathbb{E}[T_{\text{cloud}}] = U_0 - \alpha T_s \cdot \frac{1 + \rho/T_s \cdot p}{1-p}
{% end %}

**Partition-first utility** — decisions proceed locally; reconciliation cost \\(\beta\\) is paid at reconnection:

{% katex(block=true) %}
U_{\text{edge}}(p) = U_0 - \alpha T_d - \beta \cdot (1-p)
{% end %}

> **Physical translation**: Edge utility has two costs — the fixed cost of a local decision (\\(\alpha T_d\\)) and the reconciliation cost at reconnection (\\(\beta(1-p)\\), which shrinks as \\(p\\) increases because reconnection happens less often). As \\(p \to 1\\), the edge pays almost no reconciliation cost — it never reconnects.

**Threshold derivation** — setting {% katex() %}U_{\text{cloud}} = U_{\text{edge}}{% end %} and solving for the crossover:

{% katex(block=true) %}
\tau^* = \frac{T_s - T_d - \beta/\alpha}{T_s + \rho - \beta/\alpha}
{% end %}

> *Notation: In this formula, \\(T_s\\) denotes the synchronization period and \\(T_d\\) denotes decision latency — both time quantities in seconds. These are distinct from the energy symbols \\(T_d\\) (joules, energy per decision) and \\(T_s\\) (joules, energy per transmission) defined in Definition 21. To avoid ambiguity, the time quantities are also written \\(\delta_s\\) (synchronization period) and \\(\delta_d\\) (decision latency) elsewhere in this section.*

> **Physical translation**: \\(\tau^\*\\) is the break-even disconnection rate. Below it, cloud coordination is cheaper; above it, local autonomy wins. The numerator is the savings from avoiding cloud sync (\\(T_s - T_d\\)) minus the amortized reconnection cost (\\(\beta/\alpha\\)). The denominator normalizes by the full retry-inclusive sync burden. Plug in your field-measured \\(P(C=0)\\): if it exceeds \\(\tau^\*\\), cloud-native architecture is provably suboptimal for your deployment.

- **Use**: Computes {% katex() %}\tau^*{% end %}, the connectivity crossover below which edge-first architecture has lower expected cost than cloud-first; apply at design time using empirical connectivity probability from field trials to avoid over-building cloud dependency into systems that spend most of their time disconnected.
- **Parameters**: {% katex() %}\alpha{% end %} = loss-cost slope; {% katex() %}\beta{% end %} = disconnection overhead per unit; {% katex() %}\rho = T_s/T_d{% end %} ratio.
- **Field note**: Most tactical sites measure {% katex() %}\tau < 0.7{% end %} in field trials — nearly all are already past the inversion point before architecture is chosen.

For systems where \\(T_s = kT_d\\) with \\(k \geq 5\\) (synchronization slower than decisions) and \\(\rho \approx T_s\\), \\(\beta/\alpha \ll T_s\\):

{% katex(block=true) %}
\tau^* \approx \frac{(k-1)T_d}{2kT_d} = \frac{k-1}{2k}
{% end %}

*(where \\(k = \delta_s/\delta_d\\) is the sync-to-decision time ratio)*

For \\(k = 5\\): \\(\tau^\* = 0.4\\). Including retry storms (\\(\rho\\) increases superlinearly with \\(p\\)), the effective threshold drops to \\(\tau^\* \in [0.12, 0.18]\\).

The retry storm correction is derived as follows. Under TCP-like congestion collapse, each retry attempt contends with active retries: {% katex() %}\rho(p) \approx \rho_0/(1-p){% end %} (linear in availability pressure). Substituting into the \\(\tau^\*\\) formula with \\(k=5\\), {% katex() %}\rho = \rho_0/(1-p){% end %}, and solving {% katex() %}U_{\text{cloud}} = U_{\text{edge}}{% end %} numerically for \\(p\\): at \\(\rho_0 = T_s\\) (retry cost equals one sync period), the crossover shifts from \\(p = 0.40\\) to \\(p \approx 0.17\\). At \\(\rho_0 = 2T_s\\): \\(p \approx 0.13\\). The range \\([0.12, 0.18]\\) corresponds to \\(\rho_0 \in [T_s, 2T_s]\\) — one to two sync periods of retry overhead, consistent with measured backoff behavior on contested tactical links.

**Uniqueness caveat**: The derivation assumes \\(\rho(p)\\) is monotonically increasing, which guarantees at most one zero crossing — a unique \\(\tau^\*\\). When \\(\rho_0\\) is itself correlated with \\(p\\) (e.g., load-dependent exponential backoff), the effective retry cost becomes nonlinear and can produce two crossover points: a lower \\(\tau^\*_1\\) where partition-first becomes preferable, and an upper \\(\tau^\*_2\\) where extreme availability loss reverses the advantage. In such cases, solve {% katex() %}U_{\text{cloud}} = U_{\text{edge}}{% end %} numerically and verify only one root exists in \\([0, 1]\\) before applying the threshold.

**Retry Model Sensitivity Analysis**: The threshold \\(\tau^\*\\) is sensitive to the functional form of \\(\rho(p)\\). Define the **retry elasticity** {% katex() %}\eta_\rho(p) = \frac{d \ln \rho}{d \ln p}{% end %}. {% katex() %}\eta_\rho = 0{% end %} means retry cost does not grow with partition rate; {% katex() %}\eta_\rho = 1{% end %} means it grows proportionally. Four representative models bracket the practical range (all entries assume \\(k = T_s/T_d = 5\\), \\(\rho_0 = T_s\\)):

| Retry Model | \\(\rho(p)\\) Form | Physical Mechanism | \\(\eta_\rho\\) | \\(\tau^\*\\) range |
| :--- | :--- | :--- | :--- | :--- |
| Fixed overhead | \\(\rho_0\\) | TDMA slot reservation, Link-16 fixed slot | 0 | ~0.40 |
| Soft exponential backoff | {% katex() %}\rho_0 e^{p}{% end %} | CSMA/CA at low-to-moderate channel load | 0 to 1 | ~0.25–0.38 |
| TCP-like linear congestion | \\(\rho_0/(1-p)\\) | AIMD; each retry competes with concurrent retries | 1 | ~0.12–0.18 |
| Hard channel saturation | {% katex() %}\rho_0/(1-p/p_{\max}){% end %}, {% katex() %}p_{\max} < 1{% end %} | Frequency-limited tactical net; no retry above {% katex() %}p_{\max}{% end %} | 1 to \\(\infty\\) near {% katex() %}p_{\max}{% end %} | Below 0.12 near {% katex() %}p_{\max}{% end %} |

**Robust bound (model-agnostic)**: For any \\(\rho(p)\\) with {% katex() %}\eta_\rho \geq 0{% end %} — retry overhead non-decreasing in \\(p\\) — the threshold satisfies {% katex() %}\tau^* \leq \tau^*_{\text{fixed}} \approx 0.40{% end %}. No physically realistic MAC protocol with non-negative congestion response can produce a \\(\tau^\*\\) above 0.40. The MAC protocol, not the synchronization ratio \\(k\\), drives most of the variation — systems with identical \\(k\\) values but different protocols can differ in \\(\tau^\*\\) by a factor of 3–4.

**Empirical calibration**: Measure mean per-attempt retry cost at \\(p_1 = 0.10\\) (light jamming) and \\(p_2 = 0.30\\) (moderate jamming). Estimate retry elasticity:

{% katex(block=true) %}
\hat{\eta}_\rho = \frac{\ln\bigl(\hat{\rho}(0.30) / \hat{\rho}(0.10)\bigr)}{\ln 3}
{% end %}

If {% katex() %}\hat{\eta}_\rho < 0.3{% end %}: use {% katex() %}\tau^* \in [0.35, 0.40]{% end %}. If {% katex() %}0.3 \leq \hat{\eta}_\rho \leq 1.2{% end %}: use {% katex() %}\tau^* \in [0.12, 0.30]{% end %}. If {% katex() %}\hat{\eta}_\rho > 1.2{% end %}: solve {% katex() %}U_{\text{cloud}} = U_{\text{edge}}{% end %} numerically and use \\(\tau^\* = 0.10\\) as a conservative threshold pending that solution. {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s measured {% katex() %}\hat{\rho}{% end %} at two jamming intensities placed it in the {% katex() %}\hat{\eta}_\rho \in [0.9, 1.1]{% end %} range, justifying the TCP-like model and the \\([0.12, 0.18]\\) threshold.

**Utility gain from switching to partition-first**:

{% katex(block=true) %}
\Delta U = U_{\text{edge}} - U_{\text{cloud}} = \alpha T_s \cdot \frac{p + \rho p / T_s}{1-p} - \alpha(T_s - T_d) - \beta(1-p)
{% end %}

{% katex() %}\text{sign}(\Delta U) > 0{% end %} when \\(p > \tau^\*\\) because the coordination delay term grows as \\(O(1/(1-p))\\) while reconciliation cost grows only as \\(O(1-p)\\).

**Validity domain** — this derivation holds when:
- \\(T_s / T_d \geq 5\\) (synchronization substantially slower than local decisions)
- \\(\rho > 0\\) (retries have non-zero cost)
- \\(\beta < \alpha T_s\\) (reconciliation cheaper than prolonged waiting)
- **Conflict rate bounded**: {% katex() %}|\text{conflicts}| / \tau_{\text{partition}} < \kappa{% end %} for some threshold \\(\kappa\\). When clusters make incompatible decisions, reconciliation cost decomposes into data and semantic components: {% katex() %}\beta_{\text{actual}} = \beta(1-p) + \beta_c^{\text{data}} \cdot N_d^2 + \beta_c^{\text{sem}} \cdot (1-\gamma)^2 |S_{\text{merged}}|^2{% end %}, where \\(N_d\\) is the {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %}-resolvable data-conflict count and \\(\gamma\\) is the semantic convergence factor (Definition 1b). The {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} data-conflict term is bounded; the semantic term is not.
- **Semantic convergence**: {% katex() %}\gamma \geq 1 - \varepsilon{% end %} (policy-violation fraction below tolerance \\(\varepsilon\\); Definition 1b). When this fails, the semantic conflict term can reverse the inversion advantage regardless of how fast data syncs.

**Heavy-tail correction**: Under the Weibull partition model (Definition 66, below), individual partitions have {% katex() %}\mathrm{CV} > 1{% end %}, meaning the expected retry cost during a *specific ongoing* partition is higher than the time-average suggests — long partitions generate disproportionate storm traffic. The effective threshold:

{% katex(block=true) %}
\tau^*_{\mathrm{HT}} \leq \tau^* \quad \text{with equality only when } k_\mathcal{N} = 1
{% end %}

For \\(k_\mathcal{N} = 0.62\\) (CONVOY calibration): {% katex() %}\tau^*_{\mathrm{HT}} \approx 0.85\,\tau^*{% end %}. Systems near \\(\tau^\*\\) under the exponential assumption should re-evaluate — they may already be past the inversion point.

<span id="def-1b"></span>
**Definition 1b** (Semantic Convergence Factor). Let {% katex() %}S_{\text{merged}}{% end %} be the set of all state items produced by a reconciliation event, and {% katex() %}S_{\text{merged}}^{\text{consistent}} \subseteq S_{\text{merged}}{% end %} the subset with no policy violations after merge. The semantic convergence factor is:

{% katex(block=true) %}
\gamma = \frac{|S_{\text{merged}}^{\text{consistent}}|}{|S_{\text{merged}}|}
{% end %}

\\(\gamma = 1\\) means all merged state satisfies system policy. When \\(\gamma < 1 - \varepsilon\\), policy violations accumulate faster than they can be resolved — nodes must re-negotiate conflicting decisions, driving the {% katex() %}\beta_c^{\text{sem}}{% end %} term into the storm regime regardless of {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} sync speed.

> **Critical distinction**: {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDTs{% end %} guarantee *data* convergence ({% katex() %}\gamma_{\text{data}} = 1{% end %}) but have no effect on \\(\gamma\\). CRDT merge is syntactic — it resolves which bytes win. Policy compliance is semantic — it resolves whether the merged state is *valid*. These are independent problems.

**Note**: Setting {% katex() %}U_{\text{cloud}} = U_{\text{edge}}{% end %} yields a quadratic in \\(p\\). The closed-form \\(\tau^\*\\) is a first-order linear approximation valid when \\(\beta(1-p)\\) is small relative to \\(\alpha T_d\\). For large \\(\beta\\), solve the quadratic numerically.

**When the inversion fails** — two counter-scenarios worth stress-testing against your deployment:

1. **Short partitions, tolerant latency**: A system with \\(P(C = 0) = 0.20\\) but mean partition duration of 5 seconds and \\(T_d > 30\\) seconds. Store-and-forward suffices; partition-first architecture adds unnecessary complexity. The inversion threshold assumes partitions are long enough to matter.

2. **Conflict cascade**: Two clusters independently allocate the same exclusive resource. Upon reconnection, one allocation must be revoked — potentially cascading to dependent decisions. When {% katex() %}|\text{conflicts}| \cdot C_{\text{revoke}} > \beta_{\text{assumed}}{% end %}, partition-first yields *lower* utility than blocking. The \\(\beta\\) estimate must account for semantic conflict cost, not just data merge cost.

### Game-Theoretic Extension: Adversarial Inversion Threshold

Proposition 1 treats partition probability \\(p\\) as a property of the environment — exogenous, stable, measurable. In contested deployments, \\(p\\) is set by an adversary who observes your architecture and responds to it. This changes the analysis fundamentally.

> **The Problem**: A cloud-native system with \\(p = 0.10\\) in peacetime may face \\(p = 0.80\\) when an adversary learns it depends on connectivity. The architecture that was "below the threshold" in design becomes catastrophically above it in operation.
>
> **The Solution**: Model the adversary as a rational actor in a Stackelberg game — the defender commits to an architecture first, then the adversary selects jamming intensity to minimize defender utility. The game reveals which architecture is *strategically dominant*, not just expected-value optimal.
>
> **The Trade-off**: Game-theoretic robustness requires committing to partition-first architecture even when current \\(p\\) is below \\(\tau^\*\\) — accepting mild reconciliation overhead in exchange for removing the adversary's most effective lever.

**Stackelberg Game**: The defender commits to an architecture; the adversary observes it and selects jamming intensity \\(p \in [0, \bar{p}]\\) to minimize defender utility.

Under **cloud-native** architecture, {% katex() %}U_D(\text{cloud}, p){% end %} is strictly decreasing and convex in \\(p\\) via the \\(1/(1-p)\\) term. The adversary's best response is trivial: apply maximum feasible jamming \\(p = \bar{p}\\). Every unit of jamming degrades the defender.

Under **partition-first** architecture, defender utility depends on \\(p\\) only through the reconciliation term:

{% katex(block=true) %}
U_D(\text{edge}, p) = U_0 - \alpha T_d - \beta(1-p)
{% end %}

> **Physical translation**: This expression is *increasing* in \\(p\\) — more jamming means fewer reconnections, which means lower reconciliation overhead. The adversary facing a partition-first defender has no beneficial jamming strategy. Their rational response is to *restore* connectivity, not deny it.

**Adversarially robust guarantee**: The worst-case utility under each architecture when the adversary applies maximum jamming \\(\bar{p}\\):

{% katex(block=true) %}
U_D^*(\text{edge}) = U_0 - \alpha T_d - \beta(1-\bar{p})
{% end %}

{% katex(block=true) %}
U_D^*(\text{cloud}) = U_0 - \alpha T_s \cdot \frac{1 + \rho\bar{p}/T_s}{1-\bar{p}}
{% end %}

> **Physical translation**: The partition-first guarantee is a constant — it does not depend on how hard the adversary jams. The cloud-native guarantee collapses as {% katex() %}\bar{p} \to 1{% end %}; it diverges to \\(-\infty\\) because the \\(1/(1-\bar{p})\\) term blows up. An adversary with access to heavy jamming can make cloud-native architecture arbitrarily bad; they cannot do the same to a partition-first system.

The game-theoretic threshold {% katex() %}\tau^*_{GT}{% end %} (where {% katex() %}U_D^*(\text{edge}) = U_D^*(\text{cloud}){% end %}) satisfies {% katex() %}\tau^*_{GT} < \tau^*{% end %}. Systems in the hybrid zone \\(0.3 \leq E < 0.6\\) of the Edge-ness Score should be reassessed: an adversary can push them past \\(\tau^\*\\) at will, but cannot degrade a partition-first system below its adversarially-robust guarantee.

**Practical implication**: For contested deployments, evaluate the {% term(url="#prop-1", def="The connectivity level below which distributed autonomy outperforms cloud control") %}inversion threshold{% end %} using \\(\bar{p}\\) — maximum feasible jamming given the threat model — rather than expected \\(p\\). Partition-first architecture is strategically dominant against jamming adversaries. This property does not appear in the expected-utility analysis of Proposition 1 and only emerges from the game-theoretic formulation.

### Non-Linear Inversion Threshold: Age of Information and Tiered Value Decay

Proposition 1 treats \\(\alpha\\) as a constant loss-cost slope: every second of waiting incurs the same \\(\alpha\\) utility penalty. This **linear \\(\alpha\\) assumption** holds in bulk data systems where a 10-second delay is mildly worse than a 5-second delay and both are tolerable. It fails completely for tactical, medical, and safety-critical operations where information has a **hard expiry**. A drone position fix that is 3 seconds old is useful; the same fix 30 seconds old is operationally worthless. These are not points on a line — they are separated by a cliff.

The formal framework for this distinction is **Age of Information (AoI)**: the elapsed time \\(\Delta(t) = t - u(t)\\) since the last update \\(u(t)\\) was generated. The value of an observation is a function of its AoI, not merely its transmission delay. Crucially, different data classes have fundamentally different value-versus-age shapes.

<span id="def-86"></span>

**Definition 86** (Tiered Value Decay Function). The *value decay function* \\(v_c : [0,\infty) \to [0,1]\\) for data class \\(c\\) maps AoI \\(\Delta\\) to residual information value as a fraction of maximum value \\(V_0(c)\\). Three operational tiers are distinguished:

{% katex(block=true) %}
v_c(\Delta) = \begin{cases}
\max\!\bigl(0,\; 1 - \Delta/D_c\bigr) & \text{Soft (linear decay to deadline } D_c\text{)} \\
e^{-\lambda_c \Delta} & \text{Tactical (exponential continuous decay)} \\
\mathbf{1}_{\Delta \leq D_c} & \text{Safety-critical (hard deadline, binary value)}
\end{cases}
{% end %}

- **Soft** (\\(\lambda_c \to 0\\)): diagnostic telemetry, audit logs, configuration hashes. Value degrades uniformly. The original Proposition 1 model uses {% katex() %}v(\Delta) = 1 - \alpha\Delta/U_0{% end %}, which is the linear tier.
- **Tactical** ({% katex() %}\lambda_c \in [0.01, 1]\,\text{s}^{-1}{% end %}): position fixes, sensor readings, threat alerts. Value decays continuously; half-life {% katex() %}\tau_{1/2} = \ln 2 / \lambda_c{% end %} characterizes urgency.
- **Safety-critical** (\\(D_c\\) in milliseconds to seconds): fire control solutions, collision avoidance vectors, defibrillator timing windows, weapon release authorization. Full value before \\(D_c\\); zero value after. There is no meaningful "slightly late" state.

*Note*: \\(\lambda_c\\) here is the per-class information decay rate in s{% katex() %}{}^{-1}{% end %}; distinct from the gossip fanout rate \\(\lambda\\) of [Proposition 4](@/blog/2026-01-22/index.md#prop-4) and from the connectivity-regime rate {% katex() %}\lambda_{\text{drift}}{% end %} of [Definition 23](@/blog/2026-01-22/index.md#def-23). Subscript \\(c\\) selects data class.

> **Physical translation**: A configuration update (soft tier, \\(\lambda_c \approx 0\\)) sent 10 minutes late costs 10% of baseline utility if the linear model fits. A drone position fix (tactical tier, {% katex() %}\lambda_c = 0.14\,\text{s}^{-1}{% end %}) sent 10 seconds late retains only {% katex() %}e^{-1.4} \approx 25\%{% end %} of its value — the remaining 75% is lost regardless of how efficiently it eventually arrives. A fire control solution (safety-critical tier, \\(D_c = 2\\,\text{s}\\)) sent 3 seconds late has zero utility. The linear model conflates all three into the same slope \\(\alpha\\); the error is not a rounding problem, it is a structural misrepresentation.

#### AoI-Corrected Utility Functions

Under exponential decay {% katex() %}v(\Delta) = e^{-\lambda_c\Delta}{% end %}, the value of a cloud decision depends on how long the system waited before connectivity was available. Let {% katex() %}r_c \equiv e^{-\lambda_c \delta_s}{% end %} denote the fraction of information value surviving one complete sync period \\(\delta_s\\) (the synchronization period in seconds; see Assumption \\(A_3\\) — distinct from the energy-per-transmission \\(T_s\\) in Definition 21).

The cloud system makes retry attempts spaced \\(T_s\\) apart; the number of attempts before success is geometrically distributed with success probability \\(1-p\\), so the waiting time is {% katex() %}T_{\text{cloud}} = T_s \cdot G{% end %} where {% katex() %}G \sim \mathrm{Geom}(1-p){% end %}. The expected residual value at the moment the decision executes is:

{% katex(block=true) %}
\mathbb{E}[v_c(T_{\text{cloud}})] = \mathbb{E}\!\left[r_c^G\right] = \frac{(1-p)\,r_c}{1 - p\,r_c}
{% end %}

using the probability generating function of the geometric distribution {% katex() %}\mathbb{E}[r^G] = (1-p)r/(1-pr){% end %}. The AoI-corrected cloud utility is:

{% katex(block=true) %}
U_{\text{cloud}}^{\mathrm{AoI}}(p) = U_0 \cdot \frac{(1-p)\,r_c}{1 - p\,r_c}
{% end %}

> **Physical translation**: As \\(p \to 1\\), {% katex() %}U_{\text{cloud}}^{\mathrm{AoI}} \to 0{% end %} — the information is worthless by the time connectivity is restored, regardless of how little reconciliation costs. At \\(r_c = 0.5\\) (half-life equals one sync period), a 50% partition probability reduces cloud utility to {% katex() %}U_0 \times 0.5/(1-0.5\times0.5) = U_0/1.5 \approx 0.33U_0{% end %} — a 67% utility reduction, not the 50% the linear model would predict.

The edge decision executes immediately at local latency \\(T_d\\); the AoI-corrected edge utility becomes:

{% katex(block=true) %}
U_{\text{edge}}^{\mathrm{AoI}}(p) = U_0 \cdot e^{-\lambda_c T_d} - \beta\,(1-p)
{% end %}

Since \\(T_d \ll T_s\\) in practice (local compute is \\(10^3\times\\) faster than sync), {% katex() %}e^{-\lambda_c T_d} \approx 1{% end %} and the edge retains essentially full information value.

#### Re-Deriving the Inversion Threshold

<span id="prop-64"></span>

**Proposition 64** (Non-Linear Inversion Threshold). *Under tiered value decay (Definition 86), the AoI-corrected inversion threshold {% katex() %}\tau^*_{\mathrm{NL}}{% end %} satisfies:*

{% katex(block=true) %}
\tau^*_{\mathrm{NL}} < \tau^* \quad \text{for any } \lambda_c T_s > 0
{% end %}

*with equality only in the degenerate case \\(\lambda_c \to 0\\) (no decay). For the exponential-decay tier, {% katex() %}\tau^*_{\mathrm{NL}}{% end %} solves:*

{% katex(block=true) %}
\frac{(1-p)\,r_c}{1-p\,r_c} = e^{-\lambda_c T_d} - \frac{\beta}{U_0}(1-p)
{% end %}

*Setting {% katex() %}U_{\text{cloud}}^{\mathrm{AoI}} = U_{\text{edge}}^{\mathrm{AoI}}{% end %} and rearranging yields the exact crossover condition:*

{% katex(block=true) %}
U_0\,(1 - r_c) = \beta\,(1-p)\,(1 - p\,r_c)
{% end %}

*This quadratic in \\(p\\) admits a valid threshold {% katex() %}\tau^*_{\mathrm{NL}} \in [0,1]{% end %} only when the reconciliation cost exceeds the per-period value loss:*

{% katex(block=true) %}
\beta \;\geq\; U_0\,(1 - r_c) \quad \text{(threshold-existence condition)}
{% end %}

*When the condition fails — i.e., \\(\beta < U_0(1-r_c)\\) — there is no crossover: edge-first is unconditionally preferred regardless of partition probability \\(p\\).*

*Two tractable special cases illustrate the boundary:*

**Case A — fast decay** (\\(r_c \ll 1\\), i.e., \\(\lambda_c T_s \gg 1\\)): Cloud utility collapses because information expires before connectivity resumes. The threshold-existence condition becomes \\(\beta \geq U_0\\) — reconciliation cost must be at least as large as the total information value. For typical deployments with \\(\beta \ll U_0\\), no valid threshold exists:

{% katex(block=true) %}
\beta < U_0(1 - r_c) \;\Rightarrow\; \text{edge-first is always preferred regardless of } p
{% end %}

The edge advantage at \\(p = 0\\) (always connected) — the cloud's best-case — is:

{% katex(block=true) %}
\Delta U|_{p=0} = U_{\text{edge}}^{\mathrm{AoI}}(0) - U_{\text{cloud}}^{\mathrm{AoI}}(0) = (U_0 - \beta) - U_0\,r_c = U_0(1-r_c) - \beta
{% end %}

For \\(\beta/U_0 = 0.05\\) and \\(r_c = 0.50\\) (RAVEN position): {% katex() %}\Delta U = U_0(0.50 - 0.05) = 0.45\,U_0{% end %}. Edge-first delivers 45% more utility even when cloud connectivity is perfect — the data expires during the sync period itself.

**Case B — hard deadline** (safety-critical tier {% katex() %}v_c = \mathbf{1}_{\Delta \leq D_c}{% end %}): When the deadline \\(D_c < T_s\\) (deadline shorter than a single sync period), only the *first attempt* can succeed within the window. The cloud utility collapses to:

{% katex(block=true) %}
U_{\text{cloud}}^{\mathrm{hard}}(p) = U_0 \cdot (1-p)
{% end %}

Setting {% katex() %}U_{\text{cloud}}^{\mathrm{hard}} = U_{\text{edge}}^{\mathrm{hard}} = U_0 - \beta(1-p){% end %}:

{% katex(block=true) %}
\tau^*_{\mathrm{hard}} = \frac{\beta}{U_0 + \beta}
{% end %}

For \\(\beta/U_0 = 0.05\\): {% katex() %}\tau^*_{\mathrm{hard}} = 0.048{% end %} — the inversion crosses at less than **5% partition probability**.

*Proof sketch (Case B)*: From \\(U_0(1-p) = U_0 - \beta(1-p)\\): \\((1-p)(U_0 + \beta) = U_0\\), giving \\(p = \beta/(U_0+\beta)\\). For \\(n\\) sync periods available before deadline (\\(D_c = nT_s\\)), {% katex() %}U_{\text{cloud}}^{\mathrm{hard}} = U_0(1 - p^n){% end %}; the threshold satisfies \\(\beta(1-p) = U_0 p^n\\), which converges to 1 as \\(n \to \infty\\) — confirming that only *tight* deadlines drive the threshold below the linear result. \\(\square\\)

**Threshold existence table**: The following shows whether a valid {% katex() %}\tau^*_{\mathrm{NL}}{% end %} exists by data class (\\(T_s = 5\\,\text{s}\\), \\(\beta/U_0 = 0.05\\)); if none, the edge-advantage at \\(p=0\\) (best-case cloud) quantifies how unconditionally edge-first wins.

<style>
#tbl_tau_nl + table th:first-of-type { width: 22%; }
#tbl_tau_nl + table th:nth-of-type(2) { width: 12%; }
#tbl_tau_nl + table th:nth-of-type(3) { width: 10%; }
#tbl_tau_nl + table th:nth-of-type(4) { width: 12%; }
#tbl_tau_nl + table th:nth-of-type(5) { width: 44%; }
</style>
<div id="tbl_tau_nl"></div>

| Data class | \\(\lambda_c\\) (s{% katex() %}{}^{-1}{% end %}) | \\(1 - r_c\\) | Threshold exists? | Implication |
| :--- | ---: | ---: | :--- | :--- |
| Config / audit log | \\(\approx 0\\) | \\(\approx 0\\) | Yes — {% katex() %}\tau^*_{\mathrm{NL}} \approx \tau^* = 0.40{% end %} | Linear model valid; no AoI correction needed |
| {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} thermal reading | 0.01 | 0.05 | Marginal (\\(\beta/U_0 = 1-r_c\\)) — {% katex() %}\tau^*_{\mathrm{NL}} \approx 0{% end %} | Edge preferred for any \\(p > 0\\); cloud viable only at \\(p=0\\) |
| {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} position fix | 0.07 | 0.29 | **No** — \\(U_0(1-r_c) > \beta\\) | Edge advantage at \\(p=0\\): \\(+24\\%\\,U_0\\). Always use edge-first |
| {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} position / collision | 0.14 | 0.50 | **No** — \\(U_0(1-r_c) \gg \beta\\) | Edge advantage at \\(p=0\\): \\(+45\\%\\,U_0\\). Always use edge-first |
| Threat alert / fire control | 1.00 | 0.993 | **No** — nearly all value lost per period | Edge advantage at \\(p=0\\): \\(+94\\%\\,U_0\\). Cloud-native is architecturally incoherent for this class |

> **Physical translation**: The correct question is not "what threshold drives the switch to edge-first?" — it is "does a threshold even exist for this data class?" For RAVEN collision-avoidance data, cloud-native delivers 45% less utility than local autonomy even when connectivity is perfect (\\(p=0\\)), because the data expires during the sync period itself. A system designer who uses the linear \\(\tau^\* = 0.40\\) threshold to justify cloud-native coordination for position tracking is not near the boundary — they are off the map entirely. The inversion is unconditional for any data with \\(1 - r_c > \beta/U_0\\), which is true of every tactical real-time data class.

**Revised validity condition**: The linear model's condition \\(\beta < \alpha T_s\\) ("reconciliation cheaper than prolonged waiting") generalizes under exponential decay to:

{% katex(block=true) %}
\beta < U_0 \cdot \left(1 - \frac{r_c}{1 + r_c}\right) = \frac{U_0\,(1-r_c)}{1+r_c}
{% end %}

As \\(r_c \to 0\\): the bound approaches \\(U_0\\) — almost any reconciliation cost is acceptable because the stale data being reconciled has negligible value anyway. As \\(r_c \to 1\\) (slow decay): the bound approaches {% katex() %}\beta < U_0/2 \approx \alpha T_s / 2{% end %} — stricter than the original condition by a factor of 2 in the slow-decay limit, due to the geometric compounding of sync latency.

#### Value-Density Routing

<span id="def-87"></span>

**Definition 87** (Value-Density Metric). For a message \\(m\\) of data class \\(c\\) with current AoI \\(\Delta_m\\), the *value density* is:

{% katex(block=true) %}
\nu(m, \Delta_m) = \frac{V_0(m) \cdot \lambda_c \cdot e^{-\lambda_c \Delta_m}}{\mathrm{size}(m)}
{% end %}

where {% katex() %}\mathrm{size}(m){% end %} is the transmission size in bytes. At generation time (\\(\Delta_m = 0\\)): {% katex() %}\nu(m,0) = V_0(m)\lambda_c / \mathrm{size}(m){% end %}. Value density equals the marginal rate of value loss per byte of channel capacity consumed.

- **Use**: Rank queued messages by \\(\nu(m, \Delta_m)\\) at each transmission opportunity; transmit the highest-density message first. Re-rank at each opportunity as AoI evolves.
- **Field note**: A message whose value density has decayed below the value density of new messages in the queue should yield channel access — it is less valuable per byte *and* getting worse.

<span id="prop-86"></span>

**Proposition 86** (AoI-Optimal Routing Priority). *Among all non-preemptive transmission schedules with bounded channel capacity \\(B\\) bytes/s and a queue of \\(n\\) messages with independent exponential decay, the schedule minimizing total value lost in \\([0, T]\\) is the greedy schedule that transmits messages in decreasing order of \\(\nu(m, \Delta_m)\\) at each decision epoch.*

*Proof sketch*: By exchange argument — swapping any two adjacent messages in the queue that are out of value-density order strictly increases total transmitted value. The greedy rule is therefore optimal among single-channel non-preemptive schedulers. \\(\square\\)

> **Physical translation**: Transmit the message that is losing value fastest *per byte of bandwidth it consumes*. A brief high-urgency alert (small, fast-decaying) should always preempt a large low-urgency diagnostic bundle. This is the operational implementation of the non-linear inversion insight: data classes with high \\(\lambda_c\\) must move first, not just because they are important, but because their value-per-byte ratio deteriorates faster than any other resource cost.

**Multi-class implementation**: Partition messages into priority classes {% katex() %}\mathcal{C}_{\mathrm{hard}} \succ \mathcal{C}_{\mathrm{tactical}} \succ \mathcal{C}_{\mathrm{soft}}{% end %} using static \\(\lambda_c\\) thresholds. Within each class, sort by \\(\nu(m, \Delta_m)\\). Head-of-line blocking rules: {% katex() %}\mathcal{C}_{\mathrm{hard}}{% end %} messages with \\(\Delta_m > D_c/2\\) pre-empt any lower class unconditionally — the deadline is approaching and no soft-class transmission can recover the lost value.

#### Criticality-Aware TTL

<span id="def-88"></span>

**Definition 88** (Criticality-Aware TTL). For data class \\(c\\) with decay rate \\(\lambda_c\\) and a minimum value floor {% katex() %}V_{\min}/V_0{% end %} below which a message is operationally worthless, the *criticality-aware TTL* is the AoI at which the floor is crossed:

{% katex(block=true) %}
D_c^{\mathrm{TTL}} = \frac{\ln(V_0/V_{\min})}{\lambda_c}
{% end %}

A message that has not been reconciled (applied to state, forwarded, or acknowledged) by {% katex() %}\Delta_m = D_c^{\mathrm{TTL}}{% end %} is self-deleted from the queue. Delivery after this point consumes channel bandwidth without delivering operationally useful information.

- **Parameters**: Default {% katex() %}V_{\min}/V_0 = 0.01{% end %} (1% floor) gives {% katex() %}D_c^{\mathrm{TTL}} = 4.61/\lambda_c{% end %}.
- **Field note**: Setting {% katex() %}V_{\min}/V_0 = 0.01{% end %} is conservative — operational experience in contested environments often warrants {% katex() %}V_{\min}/V_0 = 0.05{% end %} ({% katex() %}D_c^{\mathrm{TTL}} = 3.0/\lambda_c{% end %}) to prevent the channel from filling with barely-useful stale updates during reconnection storms.

**TTL calibration table**:

<style>
#tbl_ttl_cal + table th:first-of-type { width: 26%; }
#tbl_ttl_cal + table th:nth-of-type(2) { width: 14%; }
#tbl_ttl_cal + table th:nth-of-type(3) { width: 14%; }
#tbl_ttl_cal + table th:nth-of-type(4) { width: 46%; }
</style>
<div id="tbl_ttl_cal"></div>

| Data class | \\(\lambda_c\\) (s{% katex() %}{}^{-1}{% end %}) | {% katex() %}D_c^{\mathrm{TTL}}{% end %} (1% floor) | Operational meaning |
| :--- | ---: | ---: | :--- |
| Config / policy | 0.001 | 77 min | Survives any realistic partition; always transmit |
| {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} perimeter reading | 0.01 | 7.7 min | Drop if still queued after 7 minutes |
| {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} position fix | 0.07 | 66 s | Drop if not delivered within 1 minute |
| {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} collision-avoidance | 0.14 | 33 s | Drop if not delivered within 33 seconds |
| Fire control solution | 1.00 | 4.6 s | Drop if not delivered within 5 seconds |
| Defibrillator timing | 10.0 | 0.46 s | Drop if not delivered within 0.5 seconds |

> **Physical translation**: The TTL is the inverse of urgency. Do not transmit a fire control solution that was generated 10 seconds ago — it is worse than sending nothing, because it consumes bandwidth needed for the current solution. The reconnection storm after a long partition should *not* retransmit every queued message: only messages with {% katex() %}\Delta_m < D_c^{\mathrm{TTL}}{% end %} carry residual value. Transmitting the rest is channel pollution.

**Reconnection storm TTL filter**: When connectivity resumes after a partition of duration {% katex() %}T_{\mathrm{acc}}{% end %}, apply a TTL pre-filter before reconciliation (Definition 31 in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md#def-31)): discard all queued messages with {% katex() %}D_c^{\mathrm{TTL}} < T_{\mathrm{acc}}{% end %}. These messages have already expired by the time the reconnection window opens. For RAVEN with {% katex() %}T_{\mathrm{acc}} = 5\,\text{min}{% end %}: every position fix and collision-avoidance vector in the queue is discarded — the fleet must re-acquire current position from fresh sensor readings, not from stale gossip.

**{% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration**: 47 drones, position update rate 1 Hz, message size 48 bytes. Without value-density routing, position fixes ({% katex() %}\nu = 0.14 \times V_{\mathrm{pos}} / 48{% end %}) compete equally with diagnostic telemetry ({% katex() %}\nu = 0.001 \times V_{\mathrm{diag}} / 200{% end %}). With value-density routing, position fixes have \\(\nu\\) ratio \\(140\times\\) higher per byte — they clear the queue first on every reconnection. CONVOY calibration at 250 kbps uplink: with 15 stale position fixes queued ({% katex() %}T_{\mathrm{acc}} = 90\,\text{s} > D_{\mathrm{pos}}^{\mathrm{TTL}} = 66\,\text{s}{% end %}), the TTL filter discards all 15 before transmission, freeing the channel for the 3 messages with residual value (config updates, still within their 77-minute TTL).

**Causal Ordering Hazard in Physical-Time TTL Filtering**

The TTL filter above uses the physical timestamp embedded in each message to compute AoI. Physical timestamps are only as reliable as the generating node's local clock. A node whose clock drifts forward by \\(\varepsilon\\) seconds produces timestamps that are \\(\varepsilon\\) seconds too large — its messages appear artificially newer than they are. A node whose clock drifts backward by \\(\varepsilon\\) produces timestamps that are \\(\varepsilon\\) seconds too old — its messages appear artificially staler, potentially crossing the TTL boundary and being discarded while causally later messages (with more accurate clocks) survive. The consequence is **causal inversion**: effects arrive at the reconciling node without their causes, which the TTL filter has already discarded as stale.

*Example*: Node A (clock +500ms fast) detects a target at real time \\(t = 0\\) and stamps the detection \\(E_1\\) with physical time 500ms. Node B (accurate clock) receives \\(E_1\\), acts on it, and stamps "Target Neutralized" \\(E_2\\) with physical time 200ms. Node C, sorting by physical timestamp, orders \\(E_2(200\\,\text{ms}) < E_1(500\\,\text{ms})\\) — effects before cause. The TTL filter exacerbates this: if the TTL for fire control events is tight, \\(E_1\\) may be discarded (500ms old) while \\(E_2\\) survives (200ms old), leaving the event log with a neutralization and no detection.

<span id="def-94"></span>
**Definition 94** (HLC-Augmented Message Stamp with Dotted Version Vector). *Each message \\(m\\) in the queue carries a compound causality stamp:*

{% katex(block=true) %}
\mathrm{stamp}(m) \;=\; \bigl(\,\underbrace{(pt_m,\; c_m)}_{\text{HLC}},\;\; \underbrace{\{(i,\, n_i)\}}_{\text{DVV}}\bigr)
{% end %}

*where {% katex() %}(pt_m, c_m){% end %} is the Hybrid Logical Clock timestamp (Definition 40 in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md#def-40)) and {% katex() %}\{(i, n_i)\}{% end %} is a Dotted Version Vector (DVV) — the set of dot pairs encoding every causal predecessor of \\(m\\). A dot {% katex() %}(i, n){% end %} means "I have seen all events from node \\(i\\) through sequence number \\(n\\)." The generating node assigns {% katex() %}n_{\mathrm{self}} \leftarrow n_{\mathrm{self}} + 1{% end %} and inherits all dots from the causal predecessors it observed before generating \\(m\\) (following the dot-kernel model of Definition 72 in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md#def-72)).*

*Causal precedence*: \\(m_1 \prec m_2\\) iff {% katex() %}(i_1, n_1) \in \mathrm{dvv}(m_2){% end %} for \\(m_1\\)'s self-dot. Under this relation, the reconciliation queue forms a partial order, not a linear sequence. Physical timestamps and HLC provide a total order for tie-breaking non-causally-related events; DVV is the ground truth for causally-related events.

- **Generation rule**: At send time, set {% katex() %}pt_m = \max(pt_{\mathrm{local}}, pt_{\mathrm{max\,received}}){% end %}, increment \\(c\\) if {% katex() %}pt_m = pt_{\mathrm{prev}}{% end %} (HLC tie-break rule from Definition 40). Append self-dot {% katex() %}(\mathrm{self}, n_\mathrm{self}){% end %}; inherit all dots from incoming messages that causally precede \\(m\\).
- **Size**: 10 bytes per message overhead — 5 bytes HLC (4-byte microsecond timestamp + 1-byte counter) + 5 bytes DVV (1 origin ID byte + 4-byte sequence number) for single-dependency events; multi-predecessor DVVs add 5 bytes per additional ancestor.

<span id="def-95"></span>
**Definition 95** (Clock Uncertainty Window). *Given per-node maximum clock drift \\(\varepsilon\\) (seconds) relative to a reference, define the uncertainty window of message \\(m\\) as the interval:*

{% katex(block=true) %}
\mathcal{W}_\varepsilon(m) \;=\; [pt_m - \varepsilon,\;\; pt_m + \varepsilon]
{% end %}

*Two messages {% katex() %}m_1, m_2{% end %} are **uncertainty-concurrent** iff their windows overlap:*

{% katex(block=true) %}
\mathcal{W}_\varepsilon(m_1) \cap \mathcal{W}_\varepsilon(m_2) \neq \emptyset \;\iff\; |pt_{m_1} - pt_{m_2}| < 2\varepsilon
{% end %}

*When two messages are uncertainty-concurrent, physical-time ordering is unreliable — either ordering is consistent with both clocks being within their drift bounds. The system must not act on the physical-time ordering alone; it must enter the **Conflict Resolution Branch**:*

1. *Check DVV precedence: if {% katex() %}(i_1, n_1) \in \mathrm{dvv}(m_2){% end %}, then {% katex() %}m_1 \prec m_2{% end %} is definitive — apply \\(m_1\\) first.*
2. *Check HLC ordering: if DVV does not resolve the order (concurrent events, neither is an ancestor of the other), use {% katex() %}(pt_{m_1}, c_{m_1}) < (pt_{m_2}, c_{m_2}){% end %} as the tiebreaker (lexicographic HLC comparison).*
3. *If \\(m_2\\)'s DVV references a dot that is not yet in the local event log (a missing predecessor), hold \\(m_2\\) in a **pending buffer** until the predecessor arrives or the causal dependency times out.*

- **Parameters**: {% katex() %}\varepsilon{% end %} is the GPS-denied clock drift bound — for OUTPOST sensors without NTP, {% katex() %}\varepsilon = 500\,\text{ms}{% end %} over a 10-minute partition (50 ppm TCXO); for CONVOY units with periodic GPS fixes, {% katex() %}\varepsilon = 50\,\text{ms}{% end %}.

<span id="prop-69"></span>
**Proposition 69** (Causal Anti-Inversion Guarantee). *Under Definition 94 stamps and Definition 95 uncertainty windows, if event {% katex() %}E_1{% end %} (Target Detection) causally precedes event {% katex() %}E_2{% end %} (Target Neutralized) — i.e., {% katex() %}\mathrm{dot}(E_1) \in \mathrm{dvv}(E_2){% end %} — then at every node in the fleet, {% katex() %}E_1{% end %} is applied to state before {% katex() %}E_2{% end %}, regardless of clock drift {% katex() %}\varepsilon \leq \varepsilon_{\max}{% end %}.*

*Proof*: Since {% katex() %}\mathrm{dot}(E_1) \in \mathrm{dvv}(E_2){% end %}, the DVV check in the Conflict Resolution Branch immediately resolves the order as {% katex() %}E_1 \prec E_2{% end %}. Physical-time ordering is overridden. If {% katex() %}E_1{% end %} has not yet arrived when {% katex() %}E_2{% end %} is received, \\(E_2\\) is held in the pending buffer until {% katex() %}E_1{% end %} arrives (bounded by its TTL). The pending buffer prevents \\(E_2\\) from being applied with a missing causal predecessor. \\(\square\\)

*Note on TTL interaction*: if {% katex() %}E_1{% end %} expires ({% katex() %}\Delta_{E_1} > D_c^{\mathrm{TTL}}{% end %}) before it arrives, \\(E_2\\) is also discarded from the pending buffer — both events are stale. A neutralization without a detectable cause is operationally invalid, and discarding both is safer than applying \\(E_2\\) alone with an unresolvable causal gap.

**Three-Node OUTPOST Scenario: 500ms Drift**

Nodes A (sensor, +500ms fast clock), B (actuator, accurate clock), C (command, accurate clock). Drift bound {% katex() %}\varepsilon = 500\,\text{ms}{% end %}. Fire control TTL {% katex() %}D_{\mathrm{fire}}^{\mathrm{TTL}} = 4.6\,\text{s}{% end %}.

| Time | Event | Physical stamp | HLC stamp | DVV dot | Notes |
| ---: | :--- | ---: | :--- | :--- | :--- |
| real 0ms | A detects target, emitting \\(E_1\\) | 500ms (A fast) | (500ms, 0) | (A, 1) | A's clock is 500ms ahead |
| real 50ms | B receives \\(E_1\\); B's HLC advances | — | (500ms, 0) | — | B inherits A's HLC on receipt |
| real 200ms | B neutralizes, emitting \\(E_2\\) | 200ms (B accurate) | (500ms, 1) | {(A,1),(B,1)} | HLC = max(200ms, 500ms prev) + counter; DVV records causal dep on E_1 |
| real 600ms | C reconnects; receives \\(E_2\\) first, then \\(E_1\\) | — | — | — | Network may deliver in any order |

**Without HLC+DVV (physical-time only)**:
- C sorts by physical stamp: \\(E_2(200\\,\text{ms}) < E_1(500\\,\text{ms})\\) — **causal inversion**: Target Neutralized processed before Target Detected.

**With HLC+DVV (Proposition 69)**:
1. C receives \\(E_2\\); notes {% katex() %}\mathrm{dvv}(E_2) = \{(A,1),(B,1)\}{% end %}; checks local log for dot (A,1) — not present.
2. \\(E_2\\) enters pending buffer; pending timer set to {% katex() %}D_{\mathrm{fire}}^{\mathrm{TTL}} = 4.6\,\text{s}{% end %}.
3. C receives \\(E_1\\); dot (A,1) satisfies pending dependency for \\(E_2\\).
4. Conflict Resolution Branch: {% katex() %}|pt_{E_1} - pt_{E_2}| = |500 - 200| = 300\,\text{ms} < 2\varepsilon = 1000\,\text{ms}{% end %} — uncertainty-concurrent; physical order unreliable.
5. DVV check: {% katex() %}\mathrm{dot}(E_1) = (A,1) \in \mathrm{dvv}(E_2){% end %}; therefore \\(E_1 \prec E_2\\) definitively.
6. HLC order confirms: {% katex() %}(500\,\text{ms},\, 0) < (500\,\text{ms},\, 1){% end %} — consistent.
7. C applies \\(E_1\\) then \\(E_2\\): **Target Detected then Target Neutralized**. \\(\square\\)

The 500ms clock error on Node A is entirely absorbed by the HLC's {% katex() %}\max{% end %} rule: B's HLC advances to match A's, making \\(E_2\\)'s HLC timestamp strictly greater than \\(E_1\\)'s. Physical-time inversion is impossible under this construction for any {% katex() %}\varepsilon \leq D_{\mathrm{fire}}^{\mathrm{TTL}}/2 = 2.3\,\text{s}{% end %} — drift bound is not 500ms but over two seconds for fire control events.

### Architectural Response: Hierarchical Edge Tiers

Knowing *when* partition-first architecture wins is necessary but not sufficient. The inversion thesis requires a concrete structural response: **layered autonomy**, where each tier operates independently when partitioned and contributes to fleet objectives when connected. Tiers differ by compute capacity, connectivity probability, and decision authority — and the architecture is explicitly designed so that the tiers making safety-critical decisions are *never* connectivity-dependent.

> **Read the diagram carefully**: dashed links (T0 \\(\to\\) T1) represent opportunistic sync — they may not exist. Solid links (T2 \\(\to\\) T3) represent local mesh — always available. The architecture guarantees mission continuity without any dashed link ever firing.

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

<style>
#tbl_tier_characteristics + table th:first-of-type { width: 12%; }
#tbl_tier_characteristics + table th:nth-of-type(2) { width: 22%; }
#tbl_tier_characteristics + table th:nth-of-type(3) { width: 22%; }
#tbl_tier_characteristics + table th:nth-of-type(4) { width: 22%; }
#tbl_tier_characteristics + table th:nth-of-type(5) { width: 22%; }
</style>
<div id="tbl_tier_characteristics"></div>

Each tier has a different **partition survival requirement**. T0 assumes connectivity. T3 must survive indefinitely without it — disconnection is its default operating condition, not a degraded state.

| Tier | Compute | Storage | Authority Scope | Partition Tolerance |
| :--- | :--- | :--- | :--- | :--- |
| **T0** | Unlimited | Petabytes | Global policy, historical analysis | None required |
| **T1** | High (GPU clusters) | Terabytes | Regional coordination, model updates | Hours to days |
| **T2** | Moderate (edge servers) | Gigabytes | Cluster consensus, task allocation | Minutes to hours |
| **T3** | Limited (embedded) | Megabytes | Local action, immediate response | Indefinite |

**The design rule this forces**: never place a safety-critical decision at a tier that requires higher-tier contact to execute it. T3 nodes handling immediate threat response, collision avoidance, or power management cannot wait for T2 coordination — and the architecture must guarantee they never have to.

### Game-Theoretic Extension: Dynamic Coalition Formation Under Partition

The tier architecture pre-assigns nodes to fixed clusters. Partition breaks those assignments. When cluster communication is severed, nodes must form operating coalitions *without centralized coordination* — a **hedonic coalition formation game** where each node acts in its own interest and the architecture must guarantee the outcome is still collectively safe.

> **The Problem**: Pre-assigned clusters may be split by a partition into subgroups that can no longer communicate with each other. Each subgroup must decide independently: stay as-is, merge with another reachable subgroup, or operate alone? Making that decision incorrectly wastes resources (too large a coalition) or risks missing {% term(url="@/blog/2026-01-29/index.md#def-121", def="Smallest set of components that must remain operational to sustain the mission-critical L1 survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} (too small).
>
> **The Solution**: Model each node's preferences formally and find the Nash-stable coalition size — the size where no node has an incentive to defect. The optimal size is a function of *expected partition duration*: short partition \\(\to\\) larger coalition; long partition \\(\to\\) smaller self-sufficient unit.
>
> **The Trade-off**: Larger coalitions deliver more aggregate capability but accumulate more state divergence \\(D(t)\\) and create costlier reconciliation at reconnection. Smaller coalitions are cheap to reconcile but may fall below the {% term(url="@/blog/2026-01-29/index.md#def-121", def="Smallest set of components that must remain operational to sustain the mission-critical L1 survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} threshold and lose mission-critical function.

**Model**: Each node \\(i\\) has preferences over coalitions \\(S \ni i\\) based on three competing factors:
- Aggregate capability: {% katex() %}\sum_{j \in S} \mathcal{L}_j{% end %}
- Communication overhead: {% katex() %}|S| \cdot c_{\text{msg}}{% end %}
- {% term(url="@/blog/2026-01-29/index.md#def-121", def="Smallest set of components that must remain operational to sustain the mission-critical L1 survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} achievability: {% katex() %}P(\text{MVS achievable} \mid S){% end %}

A **Nash-stable partition** is one where no node prefers to join a different coalition or operate alone: no \\(i\\) with current coalition \\(S_i\\) prefers any \\(S\' \neq S_i\\) containing \\(i\\).

**Optimal coalition size** — the size \\(k\\) that maximizes the difference between {% term(url="@/blog/2026-01-29/index.md#def-121", def="Smallest set of components that must remain operational to sustain the mission-critical L1 survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} achievability and cumulative messaging cost scaled by expected partition duration:

{% katex(block=true) %}
|S^*| = \arg\max_{k} \left[ P(\text{MVS} \mid k) - k \cdot c_{\text{msg}} \cdot \mathbb{E}[T_{\text{partition}}] \right]
{% end %}

> **Physical translation**: As {% katex() %}\mathbb{E}[T_{\text{partition}}]{% end %} grows, the messaging cost term {% katex() %}k \cdot c_{\text{msg}} \cdot \mathbb{E}[T_{\text{partition}}]{% end %} dominates and pushes \\(|S^\*|\\) toward smaller coalitions. As partition duration shrinks toward zero, the {% katex() %}P(\text{MVS} \mid k){% end %} term dominates and the optimal coalition grows to capture maximum aggregate capability. The Weibull partition model (Definition 66, below) provides the {% katex() %}\mathbb{E}[T_{\text{partition}}]{% end %} estimate directly from \\(\lambda_\mathcal{N}\\) and \\(k_\mathcal{N}\\).

**Practical implication**: When partition duration forecasts predict a short partition, preserve existing clusters. When they predict extended isolation, allow cluster fragmentation into smaller self-sufficient units. The formal fragmentation criterion: fragment if and only if any sub-coalition satisfies {% katex() %}v_i(S_{\text{sub}}) > v_i(S_{\text{full}}){% end %} for a majority of members.

### Capability Level Transition: Multi-Objective Decision Problem

Every connectivity change forces a decision: which {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} should the node target next? Three objectives compete and cannot all be maximized simultaneously — this is the core tension in every capability transition.

**Competing Objectives**: The node selects target level {% katex() %}\mathcal{L}_{k'}{% end %} by jointly optimizing:

{% katex(block=true) %}
\max_{\mathcal{L}_{k'}} \left( U_{\text{capability}}(\mathcal{L}_{k'}),\ U_{\text{stability}}(\mathcal{L}_{k'}),\ -C_{\text{transition}}(\mathcal{L}_{k'}) \right)
{% end %}

- {% katex() %}U_{\text{capability}}{% end %}: Mission value from operating at level {% katex() %}\mathcal{L}_{k'}{% end %} — higher is better
- {% katex() %}U_{\text{stability}}{% end %}: Probability of *sustaining* that level without forced downgrade — higher is better
- {% katex() %}C_{\text{transition}}{% end %}: Cost of transitioning (coordination overhead, state sync, stability risk) — lower is better

> **The core tension**: \\(\mathcal{L}_4\\) maximizes mission value but is the least stable — one connectivity fluctuation below \\(C = 0.9\\) forces an immediate downgrade. \\(\mathcal{L}_1\\) is maximally stable (no connectivity required) but delivers minimal mission value. The optimal level sits between these extremes, weighted by how volatile the current connectivity regime is.

**Single-objective simplification** (when stability dominates): Select the {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} that maximizes expected accumulated value over a planning horizon \\(\tau\\), given the current system state \\(\Sigma_t\\) (connectivity estimate, health vector, resource levels):

{% katex(block=true) %}
\mathcal{L}^* = \arg\max_{\mathcal{L}_{k'} \in \{\mathcal{L}_0, \ldots, \mathcal{L}_4\}} \mathbb{E}\left[\int_t^{t+\tau} V(\mathcal{L}_{k'}, C(s)) \, ds \mid \Sigma_t\right]
{% end %}

where {% katex() %}V(\mathcal{L}, C) = \mathcal{L} \cdot \mathbb{1}[C \geq C_{\min}(\mathcal{L})]{% end %} awards capability value only when connectivity supports it.

> **Physical translation**: The integral accumulates value over the planning horizon only during intervals when \\(C(s)\\) stays above the level's minimum threshold. A level that nominally delivers value 4 but requires \\(C \geq 0.9\\) in a regime where connectivity drops frequently will accumulate *less expected value* than a level that delivers value 2 but requires only \\(C \geq 0.3\\). The Weibull connectivity model (Definition 66, below) feeds the \\(C(s)\\) distribution directly into this integral.

**Constraint Set**: Three conditions gate every capability transition. All three must hold simultaneously for an upgrade; any single violation triggers an automatic downgrade.

{% katex(block=true) %}
\begin{aligned}
g_1: && C(t) &\geq C_{\min}(\mathcal{L}_{k'}) && \text{(connectivity threshold)} \\
g_2: && R(t) &\geq R_{\min}(\mathcal{L}_{k'}) && \text{(resource requirement)} \\
g_3: && |k' - k| &\leq 1 && \text{(single-step transitions only)}
\end{aligned}
{% end %}

> **Physical translation for \\(g_3\\)**: Single-step transitions prevent jumping from \\(\mathcal{L}_0\\) (survival) to \\(\mathcal{L}_4\\) (full optimization) in one move. Each step requires the previous level to be stable first — this is the architectural enforcement of the prerequisite ordering from the Formal Foundations section.

**Capability Thresholds**: The minimum link quality and resource fraction required to *enter* each level. A deployment where \\(P(C \geq 0.9)\\) is small should not architect \\(\mathcal{L}_4\\) as a primary operating mode.

| Capability | {% katex() %}C_{\min}{% end %} | {% katex() %}R_{\min}{% end %} | Functions Enabled |
| :--- | :--- | :--- | :--- |
| \\(\mathcal{L}_0\\) | 0.0 | 5% | Survival, distress beacon |
| \\(\mathcal{L}_1\\) | 0.0 | 20% | Core mission, local autonomy |
| \\(\mathcal{L}_2\\) | 0.3 | 40% | Cluster coordination, gossip |
| \\(\mathcal{L}_3\\) | 0.8 | 60% | Fleet integration, hierarchical sync |
| \\(\mathcal{L}_4\\) | 0.9 | 80% | Full capability, streaming |

**State Transition Model**: Upgrades are deliberate; downgrades are automatic. This asymmetry is intentional — the system never hesitates to shed capability when constraints are violated, but requires explicit satisfaction of all three gates before assuming higher capability.

{% katex(block=true) %}
\mathcal{L}_{t+1} = \begin{cases}
\mathcal{L}_{k'} & \text{if } g_1, g_2, g_3 \text{ satisfied and } \mathcal{L}_{k'} > \mathcal{L}_k \\
\max(\mathcal{L}_0, \mathcal{L}_k - 1) & \text{if } C(t) < C_{\min}(\mathcal{L}_k) \lor R(t) < R_{\min}(\mathcal{L}_k) \\
\mathcal{L}_k & \text{otherwise}
\end{cases}
{% end %}

> **Physical translation**: (1) *All gates pass, upgrade requested* \\(\to\\) step up one level. (2) *Any gate fails for the current level* \\(\to\\) immediate single-step downgrade, never below \\(\mathcal{L}_0\\). (3) *Gates pass, no upgrade requested* \\(\to\\) hold. The downgrade branch fires without delay — there is no grace period when connectivity or resources fall below threshold.

<span id="scenario-autohauler"></span>

### Commercial Application: {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} Mining Fleet

The {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} fleet is a commercial proof of the inversion thesis in an environment without jammers. Thirty-four autonomous haul trucks navigate an open-pit copper mine spanning 8 kilometers. The terrain — steep ramps, ore crusher canyons, underground ore passes — creates RF shadows and complete connectivity blackouts lasting 2–15 minutes per truck cycle, purely from physics. **No adversary required.** The environment itself exceeds \\(\tau^\*\\).

The tier architecture maps directly to the mine's operational structure. Dashed links from T0 to pit controllers carry only shift-level plans every 8 hours — safety-critical decisions never depend on them. Solid links from T2 haul road segments to individual trucks carry real-time collision avoidance and route commands — always available via local mesh.

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

**T0 (Operations Center)** handles shift-level planning — which trucks service which loading points, maintenance scheduling, production targets. 8-hour decision horizon; tolerates hours of disconnection from the pit.

**T1 (Pit Controllers)** manage zone-level coordination — balancing truck allocation as ore grades vary, responding to equipment breakdowns, adjusting for weather. 15-minute horizon; operate autonomously when satellite links drop.

**T2 (Haul Road Segments)** coordinate local traffic — managing passing bays, controlling single-lane ramp traffic, sequencing trucks at dump points. 5-minute horizon; handle T1 disconnection routinely.

**T3 (Trucks)** make immediate decisions — collision avoidance, obstacle response, speed regulation, emergency stops. **Zero connectivity dependency.** The tier with the most safety-critical decisions has the least connectivity requirement.

Each tier exposes three interfaces: a **state interface** to its parent (position, load, estimated completion), a **command interface** from its parent (route, speed limits, destination), and a **peer interface** for same-tier coordination (precedence negotiation, passing). When parent connectivity fails, the tier activates **delegated authority** — bounded decision rights that enable continued operation without escalation.

**Connectivity Model** — from terrain geometry and RF propagation under assumption set {% katex() %}\mathcal{A}_{AH}{% end %}:
- \\(A_1\\): RF propagation follows free-space path loss with terrain shadowing
- \\(A_2\\): Ore passes create complete RF occlusion (Faraday cage effect)
- \\(A_3\\): Truck cycle follows a fixed route graph with known segment lengths

| Location | Connectivity \\(C\\) | Derivation |
| :--- | ---: | :--- |
| Open pit benches | \\(\geq 0.9\\) | Line-of-sight to base station |
| Haul road switchbacks | \\(\approx 0.7\\) | {% katex() %}P_{\text{shadow}} = 1 - \cos(\theta_{\text{wall}}){% end %} |
| Ore pass tunnel | \\(= 0\\) | Complete RF occlusion (\\(A_2\\)) |
| Crusher queue | \\(\approx 0.85\\) | Partial occlusion from equipment |

**Blackout duration**: Given tunnel segment length \\(L_t\\) and truck speed \\(v\\), blackout duration \\(T_b = L_t / v\\). For typical {% katex() %}L_t \in [400\text{m}, 600\text{m}]{% end %} and \\(v \approx 0.8\\) m/s (loaded through narrow ore pass): \\(T_b \in [8, 12]\\) minutes.

> **What this means**: A truck entering an ore pass tunnel at \\(\mathcal{L}_3\\) (fleet integration active) drops to \\(C = 0\\) — immediately triggering a downgrade to \\(\mathcal{L}_1\\) (local autonomy). For 8–12 minutes it must handle collision avoidance, speed control, and ore pass queuing without any external input. This is not a failure mode — it is the designed operating condition.

The tier architecture ensures {% katex() %}\Delta U_{\text{blackout}} \approx 0{% end %}: trucks maintain \\(\mathcal{L}_1\\) capability during blackouts, Segment controllers maintain \\(\mathcal{L}_2\\) coordination, and reconciliation occurs at \\(\mathcal{L}_3\\) when connectivity restores.

**Tier Transition Protocol** — when a tier loses parent connectivity, it activates delegated authority in five steps:

1. **Detect** — no acknowledgment within {% katex() %}T_{\text{timeout}} = 3 \times T_{\text{RTT\_baseline}}{% end %}
2. **Broadcast** — partition event to siblings with timestamp and last-known parent state
3. **Assume authority** — inherit bounded decision rights from parent (T2 clusters make T1-level allocation decisions within pre-authorized bounds)
4. **Log** — all delegated-authority decisions with causality chain for later merge
5. **Reconnect** — exponential backoff {% katex() %}T_{\text{retry}}(k) = \min(T_{\text{base}} \cdot 2^k, T_{\text{max}}){% end %}

> **Why Step 4 matters**: Logging causality is what makes reconciliation cheap at reconnection. A truck that made 15 autonomous decisions during a 12-minute blackout produces a compact, ordered log that the T2 segment can replay and merge in seconds. Without it, reconciliation requires full state comparison — the \\(D(t)\\) divergence cost grows quadratically.

### Quantifying Edge-ness

The inversion thesis tells you *whether* a system needs edge architecture. The Edge-ness Score tells you *how much* — giving a single scalar that classifies any deployment and drives architectural regime selection.

The **Edge-ness Score** \\(E \in [0,1]\\) quantifies edge characteristics across four independently measurable dimensions:

{% katex(block=true) %}
E = w_1 \cdot \frac{P(C=0)}{0.3} + w_2 \cdot \frac{1 - R_{\text{avg}}}{0.8} + w_3 \cdot \frac{T_{\text{decision}}}{T_{\text{sync}}} + w_4 \cdot \frac{f_{\text{adversarial}}}{0.5}
{% end %}

> **What each term measures**:
> - \\(P(C=0)/0.3\\) — how often the link is completely down, normalized to the 30% partition boundary. At \\(P(C=0) = 0.30\\), this term contributes its full weight.
> - {% katex() %}(1 - R_{\text{avg}})/0.8{% end %} — decision irreversibility, inverted. Low reversibility (protective relay trips, route commitments) means high edge pressure. At {% katex() %}R_{\text{avg}} = 0.2{% end %}, this term is near maximum.
> - {% katex() %}T_{\text{decision}}/T_{\text{sync}}{% end %} — the timing mismatch. When decisions must be made in milliseconds but sync takes seconds, the ratio approaches zero — but at {% katex() %}T_{\text{decision}} = T_{\text{sync}}{% end %}, it equals 1 and contributes maximally.
> - {% katex() %}f_{\text{adversarial}}/0.5{% end %} — the fraction of failures that are deliberate, normalized to a 50% ceiling. Adversarial failures require authentication and Byzantine-tolerant protocols that accidental failures do not.

**Weight derivation** — each weight \\(w_i\\) is proportional to the marginal impact of its dimension on system utility at the critical operating point:

{% katex(block=true) %}
w_i \propto \frac{\partial U_{\text{system}}}{\partial x_i} \bigg|_{x = x_{\text{critical}}}
{% end %}

Partition probability \\(w_1 = 0.35\\) dominates because {% katex() %}\partial U / \partial P(C=0){% end %} is discontinuous at \\(\tau^\*\\) — a small increase near the threshold causes a large utility collapse. Reversibility \\(w_2 = 0.25\\) and timing ratio \\(w_3 = 0.25\\) contribute equally — both affect decision quality linearly. Adversarial fraction \\(w_4 = 0.15\\) has lower weight because adversarial scenarios are a subset of partition scenarios already captured by \\(w_1\\). Adjust weights for your deployment via: {% katex() %}w_i' = w_i \cdot (\text{Var}[x_i] / \text{Var}[x_i]_{\text{baseline}}){% end %}.

**Interpretation thresholds**:

| \\(E\\) range | Regime | Architectural implication |
| :--- | :--- | :--- |
| \\(E < 0.3\\) | Cloud-viable | Cloud-native patterns work; edge patterns optional |
| \\(0.3 \leq E < 0.6\\) | Hybrid | Edge patterns mandatory for safety-critical paths; cloud usable for coordination |
| \\(E \geq 0.6\\) | Full-edge | Cloud-native patterns will fail; full edge architecture required |

<span id="scenario-convoy"></span>

*{% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calculation* — \\(P(C=0) = 0.21\\), {% katex() %}R_{\text{avg}} \approx 0.35{% end %}, {% katex() %}T_{\text{decision}}/T_{\text{sync}} = 0.8{% end %}, {% katex() %}f_{\text{adversarial}} = 0.4{% end %}:

{% katex(block=true) %}
E_{\text{CONVOY}} = 0.35 \cdot \frac{0.21}{0.3} + 0.25 \cdot \frac{0.65}{0.8} + 0.25 \cdot 0.8 + 0.15 \cdot \frac{0.4}{0.5} = 0.77
{% end %}

\\(E = 0.77\\) — firmly full-edge. Active EW forces autonomous operation at every tier; no cloud-first assumption survives contact with the threat model.

*{% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} calculation* — \\(P(C=0) = 0.13\\), {% katex() %}R_{\text{avg}} \approx 0.25{% end %}, {% katex() %}T_{\text{decision}}/T_{\text{sync}} = 0.6{% end %}, {% katex() %}f_{\text{adversarial}} = 0.05{% end %}:

{% katex(block=true) %}
E_{\text{AUTOHAULER}} = 0.35 \cdot \frac{0.13}{0.3} + 0.25 \cdot \frac{0.75}{0.8} + 0.25 \cdot 0.6 + 0.15 \cdot \frac{0.05}{0.5} = 0.55
{% end %}

\\(E = 0.55\\) — hybrid zone. Edge patterns are mandatory for collision avoidance and tunnel operations; pit-top coordination can still use reliable connectivity for non-safety functions.

<span id="scenario-gridedge"></span>

*{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} calculation* — \\(P(C=0) = 0.16\\), {% katex() %}R_{\text{avg}} \approx 0.1{% end %} (relay trips permanent until manual reset), {% katex() %}T_{\text{decision}}/T_{\text{sync}} = 0.02{% end %} (500ms fault response vs. 30s SCADA polling), {% katex() %}f_{\text{adversarial}} = 0.02{% end %}:

{% katex(block=true) %}
E_{\text{GRIDEDGE}} = 0.35 \cdot \frac{0.16}{0.3} + 0.25 \cdot \frac{0.9}{0.8} + 0.25 \cdot 0.02 + 0.15 \cdot \frac{0.02}{0.5} = 0.48
{% end %}

\\(E = 0.48\\) — hybrid zone, but driven by an unusual combination. Partition probability alone would classify it cloud-viable; irreversibility and timing mismatch override it. This is why all four dimensions must be evaluated — single-metric classification would misclassify GRIDEDGE.

---

*Detailed positioning against fog computing, edge-cloud continuum, and multi-agent system paradigms is in the [Reference section](#reference-paradigm-positioning) at the end of this article.*

The inversion thesis establishes *when* edge autonomy outperforms cloud coordination. Formalizing *how often* and *how long* connectivity fails requires a stochastic model of connectivity states — the Connectivity Spectrum introduces this model and grounds the analysis in measurable parameters.

## The Contested Connectivity Spectrum

Not all disconnection is equal. Reduced bandwidth demands different protocols than an adversary injecting false packets. We define four {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regimes{% end %}, each with distinct characteristics and required countermeasures:

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

The continuous {% term(url="#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} \\(C(t) \in [0,1]\\) (Definition 1) can be discretized into regimes for tractable analysis. We define a state quantization mapping \\(q: [0,1] \rightarrow S\\) where thresholds {% katex() %}0 = \theta_N < \theta_I < \theta_D < \theta_F = 1{% end %} partition the connectivity range into discrete regimes. For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, we use \\(\theta_N = 0\\), \\(\theta_I = 0.1\\), \\(\theta_D = 0.3\\), \\(\theta_F = 0.8\\) - thresholds calibrated from operational telemetry where mesh connectivity below 10% effectively means denied, below 30% limits coordination, and below 80% prevents synchronized maneuvers.

<span id="def-3"></span>
**Definition 3** (Connectivity Semi-Markov Process). Let {% katex() %}\Xi \in \{\mathcal{C}, \mathcal{D}, \mathcal{I}, \mathcal{N}\}{% end %} denote the {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %} space. The regime process {% katex() %}\{\Xi(t)\}_{t \geq 0}{% end %} is modeled as a **semi-Markov process** with two components:

**1. Embedded {% term(url="#def-3", def="Semi-Markov connectivity model: embedded Markov chain governs which regime follows next; Weibull sojourn times govern how long each regime lasts — k < 1 captures heavy-tailed partition risk absent from the memoryless CTMC baseline") %}Markov chain{% end %}** {% katex() %}P = [p_{ij}]{% end %}, where {% katex() %}p_{ij} \geq 0{% end %} is the probability of transitioning to regime \\(j\\) upon leaving regime \\(i\\), with {% katex() %}\sum_{j \neq i} p_{ij} = 1{% end %}. Derived from operational telemetry by normalizing each row of the rate matrix: {% katex() %}p_{ij} = q_{ij}/q_i{% end %} where {% katex() %}q_i = \sum_{j \neq i} q_{ij}{% end %}.

**2. Sojourn distribution** {% katex() %}T_i \sim \text{Weibull}(k_i, \lambda_i){% end %} in regime \\(i\\), where \\(k_i > 0\\) is the shape parameter and \\(\lambda_i > 0\\) is the scale parameter:

{% katex(block=true) %}
\mathbb{E}[T_i] = \lambda_i\,\Gamma\!\left(1 + \tfrac{1}{k_i}\right), \qquad
\mathrm{Var}[T_i] = \lambda_i^2\!\left[\Gamma\!\left(1 + \tfrac{2}{k_i}\right) - \Gamma\!\left(1 + \tfrac{1}{k_i}\right)^{\!2}\right]
{% end %}

The stationary distribution of the semi-Markov process is:

{% katex(block=true) %}
\pi_i^{\mathrm{SM}} = \frac{\pi_i^{\mathrm{emb}}\,\mathbb{E}[T_i]}{\displaystyle\sum_{j} \pi_j^{\mathrm{emb}}\,\mathbb{E}[T_j]}
{% end %}

> **Plain English.** Each regime's share of total time equals its "frequency of visits" times its "average stay." A regime that is visited rarely but lasts a long time can still dominate the stationary distribution. This is why Denied — though not the most common destination — accounts for 21% of CONVOY's operating time: partitions last much longer than transitions suggest.

where {% katex() %}\pi^{\mathrm{emb}}{% end %} satisfies {% katex() %}\pi^{\mathrm{emb}} P = \pi^{\mathrm{emb}}{% end %}. **Special case**: when \\(k_i = 1\\) for all \\(i\\), each {% katex() %}T_i \sim \text{Exp}(q_i){% end %}, {% katex() %}P_{ij} = q_{ij}/q_i{% end %}, and {% katex() %}\pi^{\mathrm{SM}} = \pi^{\mathrm{CTMC}}{% end %} exactly — the original continuous-time Markov chain is recovered.

We separate *which regime comes next* (governed by \\(P\\)) from *how long we stay there* (governed by Weibull). The original CTMC assumed both were memoryless exponentials; the semi-Markov process lets each regime have its own sojourn distribution.

> **Why Weibull, not exponential?** Exponential sojourn times assume a constant hazard rate: the probability of recovery in the next minute is the same whether you've been Denied for 5 minutes or 5 hours. Operational data from tactical networks contradicts this. Denied periods show **decreasing hazard rates** — the longer a partition has lasted, the less likely recovery becomes in the next instant. Weibull with \\(k < 1\\) captures exactly this behavior. The exponential model (\\(k = 1\\)) systematically underestimates how long the worst partitions last.

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, the rate matrix from operational telemetry is:

{% katex(block=true) %}
Q_{\text{CONVOY}} = \begin{bmatrix}
-0.15 & 0.08 & 0.05 & 0.02 \\
0.12 & -0.22 & 0.07 & 0.03 \\
0.06 & 0.10 & -0.24 & 0.08 \\
0.02 & 0.04 & 0.09 & -0.15
\end{bmatrix} \text{ (transitions per hour)}
{% end %}

The embedded chain \\(P\\) is derived by row-normalizing the off-diagonal entries ({% katex() %}p_{ij} = q_{ij}/q_i{% end %}):

{% katex(block=true) %}
P_{\text{CONVOY}} = \begin{bmatrix}
0      & 0.533 & 0.333 & 0.133 \\
0.545  & 0     & 0.318 & 0.136 \\
0.250  & 0.417 & 0     & 0.333 \\
0.133  & 0.267 & 0.600 & 0
\end{bmatrix}
{% end %}

Fitting Weibull parameters to partition telemetry from 120 missions (regimes \\(\mathcal{C}\\), \\(\mathcal{D}\\), \\(\mathcal{I}\\) retain \\(k=1\\) — their exponential fit is adequate; only the Denied regime shows a heavy tail requiring \\(k < 1\\)):

| Regime | \\(k_i\\) | \\(\lambda_i\\) (hr) | \\(\mathbb{E}[T_i]\\) (hr) | Sojourn model |
| :--- | :---: | :---: | :---: | :--- |
| \\(\mathcal{C}\\) | 1.00 | 6.67 | 6.67 | Exponential (\\(k=1\\)) |
| \\(\mathcal{D}\\) | 1.00 | 4.55 | 4.55 | Exponential (\\(k=1\\)) |
| \\(\mathcal{I}\\) | 1.00 | 4.17 | 4.17 | Exponential (\\(k=1\\)) |
| \\(\mathcal{N}\\) | **0.62** | **4.62** | **6.67** | **Weibull heavy-tail** |

The stationary distribution {% katex() %}\pi^{\mathrm{SM}}{% end %} is computed via the semi-Markov formula. The Weibull model preserves the CTMC mean sojourn times exactly — the scale parameter \\(\lambda_\mathcal{N} = 4.62\\) hr with \\(k_\mathcal{N} = 0.62\\) gives {% katex() %}\mathbb{E}[T_\mathcal{N}] = \lambda_\mathcal{N}\,\Gamma(1+1/k_\mathcal{N}) = 4.62 \times 1.443 = 6.67{% end %} hr, matching {% katex() %}1/q_\mathcal{N} = 1/0.15 = 6.67{% end %} hr. The other three regimes use \\(k=1\\) (exponential), so their means also equal the CTMC inverses. Because all \\(\mathbb{E}[T_i]\\) match the CTMC values, {% katex() %}\pi^{\mathrm{SM}}{% end %} equals {% katex() %}\pi^{\mathrm{CTMC}}{% end %} exactly: the semi-Markov formula (line above) reduces to {% katex() %}\pi^{\mathrm{SM}}_i \propto \pi^{\mathrm{emb}}_i \cdot (1/q_i){% end %}, which is the standard CTMC result when the embedded chain is derived from row-normalizing \\(Q\\):

{% katex(block=true) %}
\pi^{\mathrm{SM}}_{\text{CONVOY}} = (\pi_\mathcal{C}, \pi_\mathcal{D}, \pi_\mathcal{I}, \pi_\mathcal{N}) = (0.32, 0.25, 0.22, 0.21)
{% end %}

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, \\(\pi_\mathcal{C} = 0.32\\) — the system spends only 32% of operating time in the Connected regime. Any architecture assuming full connectivity as baseline fails to match operational reality more than two-thirds of the time.

**Why {% katex() %}\pi^{\mathrm{SM}} = \pi^{\mathrm{CTMC}}{% end %} yet the models differ.** The stationary fractions are identical by calibration — but individual partition durations are not. Under Weibull (\\(k_\mathcal{N} = 0.62\\)), the coefficient of variation is CV = 1.69 versus CV = 1.00 for the exponential; the P95 extends from 20.0 hr (CTMC) to 27.1 hr (Weibull). An architecture sized for a 20-hour self-sufficiency window will fail to cover 5% of actual partitions that last up to 27 hours. The CTMC systematically underestimates the tail.

| Tail metric | CTMC (\\(k=1\\)) | Weibull (\\(k=0.62\\)) | Underestimate |
| :--- | :---: | :---: | :---: |
| \\(\mathbb{E}[T_\mathcal{N}]\\) | 6.67 hr | 6.67 hr | 0% |
| SD\\([T_\mathcal{N}]\\) | 6.67 hr | 11.26 hr | \\(-69\\%\\) |
| CV | 1.00 | 1.69 | — |
| P95 | 20.0 hr | 27.1 hr | \\(-35\\%\\) |

> **Physical translation.** The means match by calibration — but the tails diverge. An architecture sized for a 20-hour self-sufficiency window (CTMC P95) will fail to cover 5% of actual partitions that last up to 27 hours. The 7-hour gap is not a rounding error; it is the difference between a system that survives extended jamming and one that runs out of local state before connectivity returns.

**Regime Transition Rates and Recovery Paths** (rates per hour, edge thickness = frequency, node size = stationary probability): The diagram shows all twelve regime-to-regime transition rates for {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}; the key pattern is that recovery from Denied (N) flows first through Intermittent rather than directly back to Connected, while the Connected-to-Degraded edge carries the highest outbound rate.

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
    tickInterval 1h

    section Connectivity
    Connected (L4)                :f1, 00:00, 01:30
    Degraded (L2)                  :d1, after f1, 45m
    Intermittent (L1)              :i1, after d1, 30m
    Denied - Partition (L0-L1)    :crit, n1, after i1, 75m
    Intermittent Recovery         :i2, after n1, 20m
    Degraded                      :d2, after i2, 40m
    Connected                     :f2, after d2, 60m
    Degraded                      :d3, after f2, 30m
    Denied - Jamming              :crit, n2, after d3, 45m
    Intermittent                  :i3, after n2, 25m
    Connected                     :f3, after i3, 20m

    section Authority
    Central Coordination          :active, a1, 00:00, 90m
    Delegated Authority           :a2, after a1, 75m
    Local Autonomy Active         :crit, a3, after a2, 75m
    Delegated Recovery            :a4, after a3, 60m
    Central Coordination          :active, a5, after a4, 60m
    Delegated Authority           :a6, after a5, 30m
    Local Autonomy Active         :crit, a7, after a6, 45m
    Delegated Recovery            :a8, after a7, 25m
    Central Coordination          :active, a9, after a8, 20m

    section State Sync
    Continuous Sync               :s1, 00:00, 90m
    Priority Sync                 :s2, after s1, 45m
    Buffering                     :s3, after s2, 30m
    Local State Only              :crit, s4, after s3, 75m
    Reconciliation                :done, r1, after s4, 20m
    Priority Sync                 :s5, after r1, 40m
    Continuous Sync               :s6, after s5, 60m
    Priority Sync                 :s7, after s6, 30m
    Local State Only              :crit, s8, after s7, 45m
    Reconciliation                :done, r2, after s8, 25m
    Continuous Sync               :s9, after r2, 20m
{% end %}

{% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} experiences two partition events totaling 120 minutes (25% of mission time in Denied state). The architecture handles authority transitions, state buffering, and reconciliation — automatically, without human intervention.

> **Cognitive Map — Section 11.** Connectivity regimes (Table) \\(\to\\) Semi-Markov model separating transition probabilities from sojourn durations (Definition 3) \\(\to\\) Weibull captures heavy tails that exponential misses \\(\to\\) Stationary distribution shows CONVOY is Denied 21% of the time \\(\to\\) P95 underestimate (20 hr vs. 27 hr) drives the self-sufficiency design target.


---

<span id="def-66"></span>
**Definition 66** (Weibull Partition Duration Model). *The sojourn time of the Denied regime \\(\mathcal{N}\\) in Definition 3 is modeled as {% katex() %}T_\mathcal{N} \sim \text{Weibull}(k_\mathcal{N}, \lambda_\mathcal{N}){% end %} with shape \\(k_\mathcal{N} \in (0, 1)\\) and scale \\(\lambda_\mathcal{N} > 0\\). The expected partition duration, variance, and planning quantiles are:*

{% katex(block=true) %}
\mathbb{E}[T_\mathcal{N}] = \lambda_\mathcal{N}\,\Gamma\!\left(1 + \tfrac{1}{k_\mathcal{N}}\right)
{% end %}

{% katex(block=true) %}
\mathrm{Var}[T_\mathcal{N}] = \lambda_\mathcal{N}^2\!\left[\Gamma\!\left(1 + \tfrac{2}{k_\mathcal{N}}\right) - \Gamma\!\left(1 + \tfrac{1}{k_\mathcal{N}}\right)^{\!2}\right]
{% end %}

{% katex(block=true) %}
Q_p = \lambda_\mathcal{N}\,\bigl(-\ln(1-p)\bigr)^{1/k_\mathcal{N}}
\quad\Rightarrow\quad
Q_{0.95} = \lambda_\mathcal{N}\,(\ln 20)^{1/k_\mathcal{N}}
{% end %}

> **Physical translation**: The 95th-percentile partition duration — how long 95 in 100 blackouts will last. With Weibull shape k < 1 (heavy-tailed, typical in contested environments), this value is far larger than the mean duration. Exponential models catastrophically underestimate it; the Weibull shape parameter k is the difference between "probably back in 5 minutes" and "plan for 2 hours."

- **Use**: Computes the p-th percentile of partition duration from the fitted Weibull model; use {% katex() %}Q_{0.95}{% end %} as the {% katex() %}T_{\text{acc}}{% end %} ceiling for the circuit breaker in Proposition 92 to catch heavy-tailed outages that an exponential ({% katex() %}k=1{% end %}) model underestimates by 2–5x.
- **Parameters**: {% katex() %}k_N < 1{% end %} for heavy-tailed environments (RAVEN {% katex() %}k \approx 0.62{% end %}); {% katex() %}\lambda_N{% end %} = scale in hours; fit both from real partition logs.
- **Field note**: Actual {% katex() %}k_N{% end %} differs from spec by 2–3x routinely — never assume the exponential default; always fit from field data.

**MCU implementation**: \\(\Gamma(1 + 1/k)\\) and \\(\Gamma(1 + 2/k)\\) are pre-computed offline and stored in a static 8-entry look-up table (LUT) for {% katex() %}k \in \{0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0\}{% end %}; values between table entries are linearly interpolated. The {% katex() %}Q_{0.95}{% end %} formula requires one `pow()` call on the constant \\(\ln 20 \approx 2.996\\) — the only floating-point primitive needed at runtime.

| \\(k\\) | \\(\Gamma(1+1/k)\\) | \\(\Gamma(1+2/k)\\) | CV |
| :---: | :---: | :---: | :---: |
| 0.30 | 9.260 | 2.59 \\(\times 10^3\\) | 5.41 |
| 0.40 | 3.323 | 120.0 | 3.14 |
| 0.50 | 2.000 | 24.00 | 2.24 |
| 0.60 | 1.505 | 9.261 | 1.76 |
| 0.70 | 1.266 | 5.029 | 1.46 |
| 0.80 | 1.133 | 3.323 | 1.26 |
| 0.90 | 1.052 | 2.479 | 1.11 |
| 1.00 | 1.000 | 2.000 (exact: \\(\Gamma(3)=2\\)) | 1.00 |

*For \\(k < 0.30\\), {% katex() %}\mathrm{Var}[T_\mathcal{N}]{% end %} grows rapidly; use {% katex() %}Q_{0.50} = \lambda_\mathcal{N}(\ln 2)^{1/k_\mathcal{N}}{% end %} (median) for mission planning rather than the mean.*

---

<span id="def-67"></span>
**Definition 67** (Adaptive Weibull Shape Parameter). *The shape parameter \\(k_\mathcal{N}\\) is not static; it is maintained by an {% term(url="@/blog/2026-02-12/index.md#def-33", def="Adversarial bandit algorithm providing O(sqrt(T)) regret even under adversarial reward sequences; used for action selection under non-stationary conditions") %}EXP3-IX{% end %} multi-armed bandit (Definition 33) with arms indexed over {% katex() %}k \in \{0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0\}{% end %}. The reward signal for arm \\(k\\) at partition end is:*

{% katex(block=true) %}
r(k,\, t_{\mathrm{end}}) = -\max\!\left(0,\; T_{\mathrm{acc}}(t_{\mathrm{end}}) - \mathbb{E}[T_\mathcal{N} \mid k]\right) \Big/ Q_{0.95}(k)
{% end %}

- **Use**: Computes a scalar EXP3-IX reward combining mission progress, link quality, and battery cost at each partition end; include the battery term to prevent the bandit from reward-hacking toward high-transmission arms that maximize mission score but deplete the battery.
- **Parameters**: {% katex() %}w_1 + w_2 + w_3 = 1{% end %}; RAVEN: {% katex() %}w_1=0.5,\, w_2=0.3,\, w_3=0.2{% end %}; tune weights to operational priority before deployment.
- **Field note**: Battery weight {% katex() %}w_3{% end %} is a physical regularizer — omit it and the bandit converges to arms that eventually kill the device.

*A partition shorter than \\(\mathbb{E}[T_\mathcal{N} | k]\\) gives \\(r = 0\\); one longer than expected gives a negative reward proportional to the normalized excess. Arms with smaller \\(k\\) (heavier tails) are penalized less by unexpectedly long partitions, so the bandit shifts \\(k_\mathcal{N}\\) downward as the node accumulates evidence of heavy-tail behavior — **mathematically bracing itself for longer, deeper denied periods**.*

*Prior: \\(k_\mathcal{N} = 0.7\\) for tactical environments (RAVEN, CONVOY, OUTPOST); \\(k_\mathcal{N} = 1.0\\) for commercial environments (AUTOHAULER, GRIDEDGE). Bandit requires \\(\approx 18\\) partition events to converge; \\(k_\mathcal{N}\\) is frozen at the prior during warm-up.*

---

<span id="def-68"></span>
**Definition 68** (Partition Duration Accumulator). *The partition duration accumulator {% katex() %}T_{\mathrm{acc}}(t){% end %} tracks contiguous time in the Denied regime \\(\mathcal{N}\\):*

{% katex(block=true) %}
T_{\mathrm{acc}}(t) = \int_0^t \mathbf{1}[\Xi(s) = \mathcal{N}]\,ds
{% end %}

*Updated at each {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} tick:*

{% katex(block=true) %}
T_{\mathrm{acc}}[n+1] = T_{\mathrm{acc}}[n] + T_{\mathrm{tick}} \cdot \mathbf{1}[\Xi[n] = \mathcal{N}]
{% end %}

- **Use**: Tracks continuous disconnection time in seconds, resetting to zero on each reconnection; feeds the Weibull circuit breaker and time-varying anomaly threshold at each MAPE-K tick, making brief flaps and sustained blackouts distinguishable rather than identical.
- **Parameters**: {% katex() %}T_{\text{tick}}{% end %} = MAPE-K cycle period (e.g., 5 s); accumulator ceiling {% katex() %}Q_{0.95}{% end %} triggers protective state transitions.
- **Field note**: Reset-on-reconnect is essential — without it, a 30-second blip accumulates the same weight as a 4-hour outage.

*Reset condition: {% katex() %}T_{\mathrm{acc}} \leftarrow 0{% end %} when \\(\Xi\\) transitions out of \\(\mathcal{N}\\) (partition ends). The accumulator is the input to both the time-varying anomaly threshold (Proposition 3 in the self-measurement article) and the circuit breaker (Proposition 92).*

---

<span id="def-89"></span>
**Definition 89** (Gilbert-Elliott Bursty Channel Model). *A 2-state hidden Markov chain operating at packet timescale models bursty RF interference on each link {% katex() %}(i, j){% end %}.*

**Channel states**: \\(\mathcal{G}\\) (Good) and \\(\mathcal{B}\\) (Bad) with transition matrix:

{% katex(block=true) %}
P_{\mathrm{GE}} = \begin{pmatrix} 1-p & p \\ r & 1-r \end{pmatrix}
{% end %}

where {% katex() %}p = P(\mathcal{G} \to \mathcal{B}){% end %} is the burst-onset rate and {% katex() %}r = P(\mathcal{B} \to \mathcal{G}){% end %} is the recovery rate.

**Packet error rates**: {% katex() %}\varepsilon_{\mathcal{G}} \ll 1{% end %} (near-zero in Good state) and {% katex() %}\varepsilon_{\mathcal{B}} \approx 1{% end %} (near-total loss in Bad state).

**Connectivity signal**: The regime-level connectivity metric \\(C(t)\\) is derived from the GE output via a sliding-window moving average over \\(W\\) packet slots:

{% katex(block=true) %}
C(t) = \frac{1}{W} \sum_{\tau=t-W+1}^{t} \bigl(1 - \mathrm{loss}(\tau)\bigr)
{% end %}

where {% katex() %}\mathrm{loss}(\tau) \in \{0, 1\}{% end %} is the packet loss indicator at slot \\(\tau\\). The GE model operates at millisecond-to-second packet timescale; \\(C(t)\\) smoothed over \\(W\\) feeds into the regime-transition process of Definition 3, which operates at minutes-to-hours timescale. This two-timescale coupling preserves the semi-Markov structure of Definition 3 while capturing bursty loss patterns that a memoryless Markov chain cannot represent.

- **Parameters**: {% katex() %}p \in (0,\, 0.05]{% end %} (burst onset), {% katex() %}r \in [0.1,\, 1){% end %} (recovery); stationary Bad-state fraction {% katex() %}\pi_{\mathcal{B}} = p/(p+r){% end %}; mean burst length {% katex() %}1/r{% end %} packets.
- **CONVOY calibration**: {% katex() %}p = 0.02{% end %}, {% katex() %}r = 0.15{% end %} (mean burst = 6.7 packets; {% katex() %}\pi_{\mathcal{B}} \approx 0.12{% end %}); window {% katex() %}W = 200{% end %} packets at 10 ms/packet gives 2-second smoothing before \\(C(t)\\) is presented to the regime model.

---

<span id="def-90"></span>
**Definition 90** (Spatial Jamming Correlation). *Let {% katex() %}\mathcal{N}_i{% end %} denote the set of neighbors of node \\(i\\) visible via gossip (Definition 5). The neighborhood denial fraction at time \\(t\\) is:*

{% katex(block=true) %}
f_N(t) = \frac{\bigl|\{j \in \mathcal{N}_i : \Xi_j(t) \in \{\mathcal{D},\, \mathcal{N}\}\}\bigr|}{|\mathcal{N}_i|}
{% end %}

*The spatial jamming correlation factor {% katex() %}\rho_J \in [0, 1]{% end %} modifies the transition rates of the embedded Markov chain in Definition 3. For any node \\(i\\) currently in a connected or degraded state, the rate toward the Denied regime is amplified and the recovery rate is suppressed:*

{% katex(block=true) %}
\tilde{q}_{i \to \mathcal{N}}(t) = q_{i \to \mathcal{N}} \cdot \bigl(1 + \rho_J \cdot f_N(t)\bigr)
{% end %}

{% katex(block=true) %}
\tilde{q}_{\mathcal{N} \to i}(t) = \frac{q_{\mathcal{N} \to i}}{1 + \rho_J \cdot f_N(t)}
{% end %}

*When {% katex() %}\rho_J = 0{% end %} the model reduces to the spatially independent case (Definition 3). When {% katex() %}\rho_J = 1{% end %} and all neighbors are denied, the denial onset rate doubles and the recovery rate halves — modeling coordinated area-denial jamming where a node's own survival probability is strongly coupled to its neighbors' fates.*

- **{% katex() %}\rho_J{% end %} calibration**: {% katex() %}\rho_J = 0{% end %} (independent Rayleigh fading), {% katex() %}\rho_J = 0.5{% end %} (partial area denial), {% katex() %}\rho_J = 1{% end %} (full coordinated jamming).
- **RAVEN calibration**: {% katex() %}\rho_J = 0.8{% end %} for the 47-drone swarm under coordinated RF jamming; {% katex() %}f_N(t){% end %} is computed from the gossip state table (Definition 5) refreshed every MAPE-K tick.
- **Interaction with Definition 3**: The modified rates \\(\tilde{q}\\) replace the static \\(q\\) values in the embedded chain, making the semi-Markov process time-inhomogeneous. The Weibull sojourn distributions (Definition 66) remain; only the jump probabilities change with \\(f_N(t)\\).

---

<span id="prop-67"></span>
**Proposition 67** (Mode-Switching Hysteresis). *To prevent oscillation when the connectivity signal \\(C(t)\\) fluctuates at a regime boundary, each transition in the embedded chain of Definition 3 uses asymmetric Schmitt-trigger thresholds.*

*Let {% katex() %}\theta_k{% end %} be the nominal regime boundary between adjacent regimes \\(k\\) and \\(k+1\\), and let {% katex() %}\delta_h > 0{% end %} be the hysteresis half-width. The transition rule is:*

{% katex(block=true) %}
\text{upward crossing: fire only if } C(t) > \theta_k + \delta_h
{% end %}

{% katex(block=true) %}
\text{downward crossing: fire only if } C(t) < \theta_k - \delta_h
{% end %}

*Once a transition fires, the trigger is locked out for the refractory period {% katex() %}\tau_{\mathrm{ref}}{% end %} (Definition 117) before the opposite threshold becomes active. A signal flickering within the dead band {% katex() %}[\theta_k - \delta_h,\, \theta_k + \delta_h]{% end %} produces at most one transition per refractory window.*

*Corollary*: Under the Gilbert-Elliott model (Definition 89), a burst of duration {% katex() %}1/r{% end %} packets produces a transient dip in \\(C(t)\\) of expected magnitude {% katex() %}\pi_{\mathcal{B}} \cdot (1 - \varepsilon_{\mathcal{G}}) \approx \pi_{\mathcal{B}}{% end %}. Setting {% katex() %}\delta_h \geq \pi_{\mathcal{B}}{% end %} ensures that a single burst cannot cross the downward threshold unilaterally, eliminating spurious regime transitions during burst events.

*Reasoning*: The dead band absorbs transient \\(C(t)\\) dips without triggering architectural mode changes. The refractory lockout (Definition 117) ensures that even a sustained boundary-straddling signal cannot produce unbounded transition chatter; combined, these two mechanisms bound the switching rate independently of jamming intensity.

- **CONVOY calibration**: {% katex() %}\delta_h = 0.08{% end %} for the {% katex() %}\mathcal{C}/\mathcal{D}{% end %} boundary (nominal {% katex() %}\theta = 0.70{% end %}); {% katex() %}\delta_h = 0.05{% end %} for the {% katex() %}\mathcal{D}/\mathcal{I}{% end %} boundary (nominal {% katex() %}\theta = 0.40{% end %}). With {% katex() %}\pi_{\mathcal{B}} = 0.12{% end %} and mean burst 6.7 packets, the corollary condition is satisfied at both boundaries.
- **Interaction with Definition 118**: The Schmitt-trigger hysteresis here operates on regime-level \\(C(t)\\) at minutes timescale; Definition 118 operates on sensor-level MAPE-K thresholds at seconds timescale. They are complementary, not redundant.

---

<span id="prop-2"></span>
**Proposition 2** (Architectural Regime Boundaries). *Under stated assumptions, the stationary distribution \\(\pi\\) provides guidance for architectural choices:*

*(i) Centralized coordination may become impractical when {% katex() %}\pi_{\mathcal{C}} + \pi_{\mathcal{D}} < 0.8{% end %}*

*(ii) Local decision authority becomes beneficial when {% katex() %}\pi_{\mathcal{N}} > 0.1{% end %}*

*(iii) Opportunistic synchronization may outperform scheduled synchronization when {% katex() %}\pi_{\mathcal{I}} > 0.25{% end %}*

*Reasoning*: Boundary (i) follows from coordination message complexity analysis - centralized protocols require \\(O(n)\\) messages per decision, achievable only when coordinator reachability is high. Boundary (ii) follows from decision latency constraints - waiting for central authority when denial probability exceeds 10% increases expected decision delay. Boundary (iii) derives from sync window analysis - intermittent connectivity above 25% makes scheduled synchronization less reliable.

**Uncertainty note**: These boundaries are approximate. The actual transition points depend on specific system parameters (message complexity, latency tolerance, sync period). Use as heuristics, not hard rules. Systems near boundaries warrant empirical evaluation.

**Corollary 1**. *{% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} with \\(\pi = (0.32, 0.25, 0.22, 0.21)\\) falls decisively in the contested edge regime: {% katex() %}\pi_{\mathcal{C}} + \pi_{\mathcal{D}} = 0.57 < 0.8{% end %} precludes centralized coordination, and {% katex() %}\pi_{\mathcal{N}} = 0.21 > 0.1{% end %} mandates local decision authority. Under the Weibull semi-Markov model (Definition 3), {% katex() %}\pi^{\mathrm{SM}}{% end %} is computed via the stationary formula; for CONVOY with \\(k_\mathcal{N} = 0.62\\) calibrated to preserve \\(\mathbb{E}[T_\mathcal{N}]\\), the regime fractions are unchanged. However, the P95 self-sufficiency requirement extends from 20 hr to 27.1 hr (Definition 66) — this must be reflected in resource buffer sizing even though the boundary conditions themselves remain satisfied.*

### Architectural Response: Fog Computing Layers

The connectivity spectrum suggests a natural architectural pattern: **process data at the earliest viable point** given current connectivity. This fog computing model distributes computation along the data path, with each layer adapted to the {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %} it typically experiences.

> **Problem**: Forwarding all raw sensor data to the cloud for processing requires a reliable uplink. When connectivity is Intermittent or Denied, unprocessed data queues until reconnection — creating dangerous decision lag precisely when decisions matter most.
>
> **Solution**: Place computation as close to the data source as hardware allows. Each layer processes and reduces data before forwarding; higher layers receive structured insights, not raw streams, so they can function even if lower-layer feeds are delayed.
>
> **Trade-off**: Each processing hop discards information. A fog node reducing 2.4 Gbps to 10 kbps preserves detection events but loses raw pixels. If the classifier was wrong, there is no recovery path. Fog processing trades reversibility for connectivity resilience — an explicit design choice, not an oversight.

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

> **Read the diagram carefully.** Solid arrows carry data and commands that must always succeed; dashed arrows carry model updates that flow down when connectivity permits. The architecture is designed so every solid-arrow path works independently — cloud unavailability degrades precision but never stops operation.

The connection to the {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %} is direct: each layer operates in a different {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}. The Device-to-Fog link typically experiences Full or Degraded connectivity (local mesh). The Fog-to-Edge link experiences Intermittent connectivity (cluster boundaries). The Edge-to-Cloud link experiences Denied or Adversarial regimes under contested conditions. The architecture matches processing capability to expected connectivity.

**Data Reduction Cascade**: Each layer applies transformations that reduce data volume while preserving decision-relevant information:

{% katex(block=true) %}
\text{Volume}_{\text{cloud}} = \text{Volume}_{\text{device}} \cdot \prod_{i} r_i
{% end %}

where \\(r_i < 1\\) is the reduction ratio at layer \\(i\\). For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with {% katex() %}r_{\text{fog}} = 0.1{% end %} and {% katex() %}r_{\text{edge}} = 0.1{% end %}:

{% katex(block=true) %}
\text{Volume}_{\text{cloud}} = 2.4 \text{ Gbps} \times 0.1 \times 0.1 = 24 \text{ Mbps}
{% end %}

A \\(100\times\\) reduction makes satellite backhaul feasible even during Degraded regime. But each reduction stage must preserve information sufficient for its downstream consumers. The fog layer discards raw pixels but preserves detection events. The edge layer discards individual detections but preserves track hypotheses.

> **Physical translation.** Multiply all the reduction ratios together to find what fraction of raw data reaches the cloud. RAVEN's two-stage \\(10\\times\\) reduction at fog and edge leaves 1% of source bandwidth — 24 Mbps from 2.4 Gbps — which fits a satellite uplink. Losing a layer means losing the decisions that depended on it: if the fog node fails, 2.4 Gbps arrives at the edge with no preprocessing budget to absorb it.

**Fog processing pipeline**:

1. **Validate**: Check integrity, timestamp freshness, source authentication
2. **Filter**: Apply domain filters ({% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}: motion detection, background subtraction, ROI extraction)
3. **Infer**: Run lightweight classifiers, producing structured detections rather than raw imagery
4. **Aggregate**: Combine across time windows, suppress duplicates, compute confidence
5. **Forward**: Transmit based on novelty, confidence threshold, or heartbeat interval

### Commercial Application: GRIDEDGE Power Distribution

{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} manages a power distribution network at a scale that makes cloud-dependent architecture immediately untenable: 180,000 customers, {% katex() %}12{,}000\,\text{km}^2{% end %}, with 847 transformers, 156 reclosers, 43 capacitor banks, and 12 substations. The 500 ms fault-isolation mandate is not a performance goal — it is a physical constraint imposed by upstream breaker trip times. Fog processing is the only architecture that meets it.

Power distribution faces a unique connectivity challenge: the very events that require coordination - storms, equipment failures, vegetation contact - are the same events that damage communication infrastructure. A storm that causes a line fault likely also damages the cellular tower serving that feeder.

The Markov connectivity model for {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} captures this correlation. Compared to {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, note the elevated Intermittent-to-Denied rate {% katex() %}q_{IN}{% end %} and the faster recovery from Denied, reflecting correlated storm-driven outages that are severe but finite in duration.

{% katex(block=true) %}
Q_{\text{GRIDEDGE}} = \begin{bmatrix}
-0.08 & 0.05 & 0.02 & 0.01 \\
0.15 & -0.25 & 0.07 & 0.03 \\
0.04 & 0.12 & -0.28 & 0.12 \\
0.01 & 0.03 & 0.11 & -0.15
\end{bmatrix} \text{ (transitions per hour)}
{% end %}

The elevated {% katex() %}q_{IN} = 0.12{% end %} and {% katex() %}q_{DN} = 0.03{% end %} rates reflect fault-communication correlation: grid disturbances that push connectivity from Full to Degraded or Intermittent frequently cascade to Denied as the underlying cause affects both systems.

Solving \\(\pi Q = 0\\) for {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} yields the long-run fraction of time spent in each regime; the result below shows that {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} is predominantly connected but cannot rely on that — one in five hours is in Denied state.

{% katex(block=true) %}
\pi_{\text{GRIDEDGE}} = (0.46, 0.19, 0.16, 0.19)
{% end %}

{% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} spends 46% of time in Full connectivity — substantially better than tactical environments, but still insufficient for cloud-dependent architecture.

> **What this tells you.** GRIDEDGE looks connected on average. But the 19% Denied fraction coincides with the highest-consequence decisions: fault isolation, load shedding, and protective relay coordination. The fog architecture must be designed for the 19%, not sized for the 46%.

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

Static estimates of \\(Q\\) are insufficient for systems that must adapt to changing environments. An {% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}anti-fragile{% end %} system learns its connectivity dynamics online, updating estimates as new transitions are observed.

Define {% katex() %}N_{ij}(t){% end %} as the count of observed transitions from state \\(i\\) to state \\(j\\) by time \\(t\\), and \\(T_i(t)\\) as total time spent in state \\(i\\). The maximum likelihood estimate of transition rates is:

{% katex(block=true) %}
\hat{q}_{ij}(t) = \frac{N_{ij}(t)}{T_i(t)}
{% end %}

But raw MLE is unstable with sparse observations. Placing a Gamma prior over each rate {% katex() %}q_{ij}{% end %} — parameterized by prior pseudo-count {% katex() %}\alpha_{ij}^0{% end %} and prior time \\(\beta_i^0\\) — and then updating with observed transition counts {% katex() %}N_{ij}{% end %} and dwell time \\(T_i\\) yields a posterior that shrinks toward the prior when data are sparse.

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
- **Connected (\\(\mathcal{C}\\))**: Exponential with rate {% katex() %}\lambda_{\mathcal{C}} = 0.15{% end %}/hour (memoryless)
- **Degraded (\\(\mathcal{D}\\))**: Log-normal with \\(\mu = 0.5\\), \\(\sigma = 0.8\\) (terrain-dependent)
- **Intermittent (\\(\mathcal{I}\\))**: Weibull with \\(k = 1.5\\), \\(\lambda = 2.0\\) (jamming burst patterns)
- **Denied (\\(\mathcal{N}\\))**: Pareto with \\(\alpha = 1.2\\), \\(x_m = 0.5\\) (heavy-tailed adversarial denial) (empirically calibrated to adversarial denial durations measured in {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} red-team exercises; the heavy tail captures coordinated jamming events where denial periods cluster at multiples of base duration)

> *Note: The Pareto model here is an illustrative fit for adversarially-constrained denial scenarios (extended jamming). The authoritative analytical model for CONVOY's Denied regime is Weibull(\\(k=0.62\\), \\(\lambda=4.62\\)) per Definition 66. The Pareto and bimodal-mixture models in this section serve as sensitivity examples for heavy-tailed conditions; they do not replace Definition 66 as the canonical representation.*

The semi-Markov stationary distribution {% katex() %}\pi^{SM}{% end %} weights each state by how long the system actually stays there, not just how often it visits: a state visited rarely but for long periods gets more probability mass than a state visited often but briefly.

{% katex(block=true) %}
\pi_i^{SM} = \frac{\pi_i^{EMC} \cdot E[T_i]}{\sum_j \pi_j^{EMC} \cdot E[T_j]}
{% end %}

where {% katex() %}\pi^{EMC}{% end %} is the embedded {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov chain{% end %} distribution and \\(E[T_i]\\) is the mean sojourn time in state \\(i\\).

### Adversarial Adaptation Detection

When an adversary adapts to our connectivity patterns, the transition rates become non-stationary. We detect this through **change-point analysis** on the rate estimates.

Define the CUSUM statistic for detecting rate increase in {% katex() %}q_{ij}{% end %}:

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

**Structural inconsistency with the adversarial game model** — and when to switch models: The CTMC formulation above treats the generator matrix \\(Q\\) as stationary — the transition rates {% katex() %}\lambda_{CN}{% end %}, {% katex() %}\lambda_{NC}{% end %} are fixed properties of the environment, and the stationary distribution \\(\pi\\) is well-defined. This is incompatible with the adversarial Markov game (Definition 32 in the {% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}anti-fragile{% end %} decision-making article), where the adversary's strategy \\(\sigma_A\\) controls exactly these rates. Under an adaptive adversary, \\(Q\\) is a function of both the defender's and adversary's joint policy: {% katex() %}Q(t) = Q(\pi_D(t), \sigma_A(t)){% end %}. The stationary distribution \\(\pi_N \approx 0.17\\) derived from the CTMC is therefore invalid when an adversary is present — the system never reaches stationarity because the adversary continuously adjusts \\(Q\\) in response to observed defender behavior. **Correct interpretation**: the CTMC model applies in non-adversarial partitioned environments (physical obstacles, atmospheric conditions, hardware faults). For adversarially contested environments, the CTMC provides an optimistic baseline that bounds performance under no adversary; actual performance under an adaptive adversary requires the game-theoretic analysis of the {% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}anti-fragile{% end %} decision-making article. The adversarial indicators above are the operational bridge: they signal when to switch from the CTMC regime assumption to the adversarial game regime.

> **Cognitive Map — Section 12.** Connectivity spectrum \\(\to\\) fog computing places computation at the earliest viable layer \\(\to\\) four-layer architecture with \\(100\\times\\) bandwidth reduction \\(\to\\) GRIDEDGE shows commercial fog: 500 ms budget forces fog-layer protection logic \\(\to\\) stationary distribution (19% Denied) drives design to the tail, not the mean \\(\to\\) Bayesian online learning updates Q as conditions change \\(\to\\) adversarial adaptation detection signals when to switch from CTMC to game-theoretic analysis.


---

## Illustrative Connectivity Profiles

The connectivity analysis so far has used CONVOY as the worked example. These profiles extend the same framework to commercial environments — confirming that the inversion thesis is not a tactical anomaly, and extracting design rules that apply across environments.

### Representative Parameterizations by Environment

**Methodological note**: These profiles are illustrative examples showing plausible parameter ranges. Actual deployments would derive parameters from operational data.

**Industrial IoT**: Connectivity ranges from near-cloud (clean rooms: {% katex() %}\pi_{\mathcal{C}} \approx 0.94{% end %}) to contested-edge (underground mining: {% katex() %}\pi_{\mathcal{C}} \approx 0.31{% end %}), driven by EMI, physical obstacles, and environmental extremes.

**Drone Operations**: Terrain dominates - flat terrain yields {% katex() %}\pi_{\mathcal{C}} \approx 0.89{% end %}, mountainous terrain drops to {% katex() %}\pi_{\mathcal{C}} \approx 0.41{% end %}. Combined adverse conditions approach tactical contested levels.

**Connected Vehicles**: Urban dense achieves {% katex() %}\pi_{\mathcal{C}} \approx 0.91{% end %}, but tunnels create deterministic denied states ({% katex() %}\pi_{\mathcal{N}} \approx 0.86{% end %}). Mountain passes and urban canyons degrade reliability despite cellular coverage.

### Latency Distribution Analysis

Beyond {% term(url="#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %}, **latency distribution within each regime** determines operational viability. "Connectivity" percentage conceals the fact that p99 latency in Degraded is already \\(10\\times\\) the median — and Intermittent delivers occasional latencies \\(25\\times\\) higher than p95. Designing for median or p95 latency fails for any capability where tail events matter.

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

**Statistical characterization**: Full connectivity typically follows log-normal distribution. Degraded follows gamma. Intermittent exhibits **heavy-tailed Pareto** — occasional latencies orders of magnitude higher than median. Designing for p95 latency fails on the tail.

**Latency-Capability Mapping**:

Different capabilities have different latency tolerance. We define the **viability threshold** \\(\tau_c\\) for capability \\(c\\):

{% katex(block=true) %}
P(\text{Latency} \leq \tau_c | \text{Regime}) \geq 0.95 \Rightarrow \text{Capability } c \text{ viable in regime}
{% end %}

> **Physical translation.** Capability \\(c\\) is viable in a regime only if at least 95% of requests in that regime complete within threshold \\(\tau_c\\). A synchronized coordination system with \\(\tau_c = 500\\) ms is not viable in Intermittent — not because you're disconnected, but because more than 5% of requests take longer than 500 ms even when connected. The capability table below shows exactly where each function loses viability.

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

The first passage time {% katex() %}T_{ij}{% end %} from state \\(i\\) to state \\(j\\) has distribution determined by the generator matrix \\(Q\\). For the absorbing case (time to first reach Denied):

{% katex(block=true) %}
E[T_{\mathcal{C} \rightarrow \mathcal{N}}] = \frac{1}{q_{FN}} + \sum_{k \neq N} \frac{q_{Fk}}{q_F} E[T_{k \rightarrow N}]
{% end %}

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} with {% katex() %}Q_{\text{CONVOY}}{% end %}:

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

> **Physical translation.** Short partitions are terrain-driven transients — handle with store-and-forward buffering. Long partitions are equipment failures or extended RF denial — they require full local decision authority. Designing only for the short partition type leaves the system without a plan for 30% of events. The mixture model is the mathematical statement that one architecture cannot serve both; you need layers, with each layer sized for the partition type it must survive.

This has profound architectural implications: systems must handle both brief interruptions (store-and-forward sufficient) and extended autonomy (local decision authority required).

**Conditional Partition Probability**: Longer dwell in degraded states increases partition probability. Semi-{% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %}s capture this non-Markovian behavior, suggesting proactive measures (state sync, authority delegation) when degraded dwell time exceeds thresholds.

### Module Placement Strategies

**Placement Optimization Formulation**:

Let \\(M\\) be the set of modules and \\(L\\) be the set of placement locations (device, fog, edge, cloud). For module \\(m\\) placed at location \\(l\\), the binary decision variable {% katex() %}x_{ml} = 1{% end %} if module \\(m\\) is assigned to location \\(l\\). The objective minimizes total expected latency across all modules.

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

where {% katex() %}\text{Latency}(m, l, \mathcal{N}) = \infty{% end %} for cloud-dependent modules during Denied regime.

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

Component availability varies by {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}. The formula below computes effective availability {% katex() %}a_{\text{eff}}{% end %} as the regime-weighted average of per-regime availability \\(a_r\\), using the stationary distribution \\(\pi_r\\) as weights.

{% katex(block=true) %}
a_{\text{eff}} = \sum_{r \in \{F,D,I,N\}} \pi_r \cdot a_r
{% end %}

For a cloud-dependent component with {% katex() %}a_F = 0.99, a_D = 0.95, a_I = 0.7, a_N = 0{% end %}:

{% katex(block=true) %}
a_{\text{eff}} = 0.32 \cdot 0.99 + 0.25 \cdot 0.95 + 0.22 \cdot 0.7 + 0.21 \cdot 0 = 0.71
{% end %}

To achieve 99.9% availability with {% katex() %}a_{\text{eff}} = 0.71{% end %}:

{% katex(block=true) %}
R_c = \left\lceil \frac{\ln(0.001)}{\ln(0.29)} \right\rceil = 6
{% end %}

**Six redundant cloud instances** are needed — versus three if connectivity were reliable.

> **Physical translation.** With reliable connectivity, three cloud replicas achieve 99.9% availability. Multiply the component availability by the connectivity availability (0.71 effective), and you need six replicas for the same target. The two extra replicas are the direct cost of unreliable connectivity — a cost invisible to architects who treat connectivity as a baseline assumption.

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

For {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %}-based state, replication factor determines reconciliation complexity:

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

> **Physical translation.** Replicas that fail together provide no redundancy. The constraint requires that each pair of replica locations has negligibly correlated failure probability. Jamming one vehicle does not guarantee jamming another. Placing all replicas in the cloud violates this constraint: a connectivity denial takes all cloud replicas simultaneously, regardless of how many there are.

**Redundancy Cost-Benefit Analysis**: The table below shows how effective availability and cost scale together as redundancy increases, using the {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} {% katex() %}a_{\text{eff}} = 0.71{% end %} baseline; the Break-even column gives the minimum per-hour downtime cost (in normalized cost units, c.u.; calibrate to actual downtime cost for your system) that justifies each additional replica.

| Redundancy Level | Compute Cost | Storage Cost | Availability | Break-even |
| :--- | :--- | :--- | :--- | :--- |
| R=1 | 1x | 1x | 71% | Baseline |
| R=2 | 2x | 2x | 92% | If downtime >50 c.u./hr |
| R=3 | 3x | 3x | 98% | If downtime >200 c.u./hr |
| R=4 | 4x | 4x | 99.4% | If downtime >800 c.u./hr |

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

> **Cognitive Map — Section 13.** Illustrative profiles calibrate the framework to real environments \\(\to\\) latency distributions show tail behavior is the actual constraint \\(\to\\) viability matrix converts latency to per-capability regime viability \\(\to\\) probabilistic partition models answer "how long until Denied?" \\(\to\\) placement optimization formalizes fog-vs-cloud decisions \\(\to\\) redundancy framework quantifies how unreliable connectivity multiplies replica count \\(\to\\) synthesis translates all of this into environment-specific design rules.


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

Offline-first mobile apps and tactical edge systems share one surface feature — both operate without guaranteed connectivity. That surface similarity is a trap. Three structural differences make every mobile offline-first pattern either insufficient or dangerously misleading when applied to edge systems.

### Scale of Autonomous Decision Authority

The mobile offline model defers commitment: cache locally, sync when connected, let the user resolve conflicts. This works because the user is in the loop. Tactical edge systems cannot defer — the drone cannot display a spinner, the convoy cannot pause, the sensor mesh cannot wait for headquarters to resolve a merge conflict.

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

where {% katex() %}\text{regret\_bound}(d){% end %} is the worst-case loss from decision \\(d\\) if it cannot be undone and proves incorrect.

> **Physical translation.** For a reversible decision (\\(R = 1\\)), regret cost disappears — if you're wrong, you can undo it. For an irreversible decision (\\(R = 0\\)), you carry the full worst-case loss regardless of outcome. A RAVEN drone committing to a target track (\\(R \approx 0.1\\)) cannot be given the same decision budget as a mobile app saving a draft (\\(R \approx 1\\)). The formula forces this asymmetry to be explicit in system design: high-regret decisions require higher confidence thresholds before acting.

### Adversarial Environment

Mobile offline-first assumes the network fails randomly. Contested edge must assume the network fails *intentionally* — an adversary that observes how you respond to partition and optimizes the next one to be worse:

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

> **The core challenge.** Coordination without communication is the defining problem of tactical edge architecture. Mobile offline-first never faces it: phones that diverge during partition simply show different cached content. Drones that diverge during partition may collide, break formation, or surveil the same area twice while leaving a gap elsewhere.

> **Cognitive Map — Section 14.** Mobile offline-first and tactical edge share only the surface problem \\(\to\\) three structural breaks: irrevocable decisions, adversarial intent, fleet coordination requirements \\(\to\\) irreversibility adds regret cost to every decision function \\(\to\\) adversarial environment requires continuous peer identity verification, not just platform trust \\(\to\\) fleet coordination under partition is the problem mobile offline-first never solved.


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

> **Problem**: Every communication decision requires choosing between bandwidth (move more bits), reliability (lose fewer packets), and latency (deliver faster). No protocol can maximize all three simultaneously on a constrained physical channel.
>
> **Solution**: Parameterize the trade-off explicitly using \\(\alpha\\) (power allocation fraction). Different message classes operate at different points on the Pareto frontier — alerts at high reliability, sensor streams at high bandwidth, coordination at low latency.
>
> **Trade-off**: The \\(\alpha\\) parameter is not a dial you set once. Mission-critical messages may switch operating point within a single operation as conditions change. Proxy mesh infrastructure is what makes per-message-class switching feasible at runtime.

### Mathematical Formalization

Define the achievable operating point as a vector in \\(\mathbb{R}^3\\): {% katex() %}(B, L^{-1}, R){% end %} where higher is better for all dimensions. The achievable region is bounded by fundamental constraints:

**Shannon-limited bandwidth-reliability tradeoff:**

For a channel with capacity \\(C\\) bits/second and target bit error rate \\(\epsilon\\), the achievable information rate \\(R\\) is bounded by:

{% katex(block=true) %}
R \leq C \cdot (1 - H(\epsilon))
{% end %}

where {% katex() %}H(\epsilon) = -\epsilon \log_2 \epsilon - (1-\epsilon) \log_2(1-\epsilon){% end %} is the binary entropy. Lower error rates (higher reliability) require more redundancy, reducing effective throughput.

> **Physical translation.** Adding redundancy to catch bit errors reduces the information you can carry. A channel that delivers 9,600 bps raw can only carry about 8,800 bps of useful data at 1% bit error rate, because 8% of capacity goes to error detection. Pushing for 0.1% error rate costs even more capacity. You cannot get reliable bits without spending bandwidth to achieve that reliability.

**Latency-reliability tradeoff (ARQ protocols):**

With per-packet success probability \\(p\\), the expected number of transmissions until success follows a geometric distribution:

{% katex(block=true) %}
E[L] = L_{\text{base}} + L_{\text{RTT}} \cdot \frac{1-p}{p}
{% end %}

To guarantee reliability {% katex() %}R_{\text{target}}{% end %} with bounded retries, the required attempt count \\(k\\) satisfies {% katex() %}1-(1-p)^k \geq R_{\text{target}}{% end %}, yielding:

{% katex(block=true) %}
k \geq \left\lceil \frac{\ln(1 - R_{\text{target}})}{\ln(1 - p)} \right\rceil
{% end %}

Higher reliability targets require exponentially more retransmission attempts as {% katex() %}R_{\text{target}} \to 1{% end %}.

> **Physical translation.** Each retransmission adds a full round-trip delay. At 70% per-packet success (\\(p = 0.7\\)), you expect 0.43 extra round-trips on average. At 50% success under heavy jamming, you expect a full extra round-trip per packet — doubling base latency before the packet gets through. High reliability under bad channel conditions is expensive in time, not just in bandwidth.

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

where \\(k(\alpha)\\) is the error correction coding gain and {% katex() %}L_{\text{FEC}}{% end %} is the latency overhead of forward error correction.

*Concrete example*: For {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} with \\(C = 9600\\) bps, \\(\epsilon = 0.01\\), {% katex() %}L_{\text{base}} = 50{% end %}ms, {% katex() %}L_{\text{FEC}} = 100{% end %}ms:
- At \\(\alpha = 0\\) (no FEC): \\(B = 8800\\) bps, \\(R = 0.99\\), \\(L = 50\\)ms
- At \\(\alpha = 0.5\\) (balanced): \\(B = 4400\\) bps, \\(R = 0.9999\\), \\(L = 100\\)ms
- At \\(\alpha = 1\\) (max reliability): \\(B = 0\\) bps, \\(R = 1.0\\), \\(L = 150\\)ms

The optimal operating point depends on mission requirements. For {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} alert distribution, reliability dominates (\\(\alpha \rightarrow 1\\)). For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} sensor streaming, bandwidth dominates (\\(\alpha \rightarrow 0\\)). For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} coordination, latency dominates (minimize \\(L\\) subject to {% katex() %}R \geq R_{\min}{% end %}).

> **Physical translation.** At \\(\alpha = 0\\) (no FEC), OUTPOST transmits at maximum rate but accepts 1% bit errors — fine for sensor telemetry where occasional bad readings are tolerable. At \\(\alpha = 1\\) (maximum reliability), OUTPOST achieves near-perfect delivery but carries zero payload — useful only for presence beacons. The operational setting sits between: alerts near \\(\alpha = 0.5\\) (near-perfect delivery, acceptable latency), sensor streams near \\(\alpha = 0.1\\) (high throughput, tolerable error rate).

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

> **Read the diagram.** Solid arrows carry primary traffic; the dashed arrow is a failover path that activates only when P4's primary connection to Service A is unavailable. This is not load balancing — it is the proxy mesh absorbing a topology change without application involvement.

Each proxy navigates the constraint triangle via four responsibilities:

1. **Queue management**: Persistent outbound queue, accumulating when downstream unreachable
2. **Protocol translation**: Bridge between verbose protocols (gRPC, HTTP/2) on local links and compact protocols (CBOR over CoAP) on tactical links
3. **Route discovery**: Maintain topology, compute paths, shift to alternates when primary routes fail
4. **Load distribution**: Shed load by priority during congestion - critical messages proceed, bulk defers

**Message routing phases**:

1. **Resolve**: Look up destination in routing table; flood discovery to neighbors (TTL-limited) if not found
2. **Select path**: Evaluate paths by cost {% katex() %}C_{\text{path}} = w_1 \cdot \text{latency} + w_2 \cdot \text{loss\_rate} + w_3 \cdot \text{congestion}{% end %}; choose minimum
3. **Transmit**: Send on selected path, start ack timer {% katex() %}T_{\text{ack}} = 2 \times \text{RTT}_{\text{estimated}}{% end %}
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

Define decision variables \\(x_i \in [0,1]\\) as allocation fraction for channel \\(i\\), and let {% katex() %}a_i \in \{0,1\}{% end %} indicate whether channel \\(i\\) is designated for critical alerts. The optimization problem:

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

> **Physical translation.** This is the Pareto frontier applied operationally: each channel occupies a different corner of the triangle. Mesh WiFi wins on bandwidth (54 Mbps, low power per bit). HF Radio wins on survivability (unjammable at range). SATCOM wins on reach but loses on power cost and adversarial vulnerability. The optimization assigns each function to the channel whose position on the triangle best matches that function's requirements — not to the single "best" channel.

**Model limits**: Reliability estimates \\(R_i\\) assume steady-state. An adversary observing {% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}'s allocation can adapt — jamming relied-upon channels, backing off abandoned ones. The system must periodically *test* channel assumptions, not merely optimize on stale estimates.

> **Cognitive Map — Section 15.** Three constraints form a triangle: bandwidth \\(\leftrightarrow\\) reliability \\(\leftrightarrow\\) latency \\(\to\\) improving one degrades at least one other \\(\to\\) Shannon bound formalizes bandwidth-reliability \\(\to\\) ARQ formalizes latency-reliability \\(\to\\) Pareto frontier parameterized by \\(\alpha\\) lets each message class pick its optimal point \\(\to\\) proxy mesh makes per-class switching feasible at runtime \\(\to\\) OUTPOST applies the full framework: three channels, three mission functions, optimization assigns each function to its best corner.


---

## Latency as Survival Constraint

In cloud systems, a slow response is a UX problem. In tactical edge systems, a slow response can be a mission-ending event. The adversary's decision loop does not pause while you wait for network acknowledgment.

### Adversarial Decision Loop Model

Define the adversary's Observe-Decide-Act (ODA) loop time as \\(T_A\\), and our own ODA loop time as \\(T_O\\). The **decision advantage** \\(\Delta\\) is:

{% katex(block=true) %}
\Delta = T_A - T_O
{% end %}

- If \\(\Delta > 0\\): We complete our decision loop before the adversary can respond to our previous action
- If \\(\Delta < 0\\): The adversary has initiative; we are always reacting to their completed actions
- If {% katex() %}\Delta \approx 0{% end %}: Parity; outcomes depend on decision quality rather than speed

For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} conducting surveillance of a mobile threat:

{% katex(block=true) %}
T_O = T_{\text{sense}} + T_{\text{process}} + T_{\text{coordinate}} + T_{\text{act}}
{% end %}

> **Physical translation.** Sensor acquisition and local classification are fixed by hardware physics — they cannot be optimized in software. Coordinated response time is fixed by formation geometry. **Only swarm notification is architecture-controllable.** The entire communication architecture of RAVEN exists to minimize a single variable: {% katex() %}T_{\text{coordinate}}{% end %}.

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

Total ODA: {% katex() %}T_O = 350\text{ms} + T_{\text{coordinate}}{% end %}

Intelligence estimates adversary anti-drone system response at {% katex() %}T_A \approx 800\text{ms}{% end %}. For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} to maintain decision advantage:

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

where \\(p\\) is the probability of encountering jamming conditions and {% katex() %}\mu_{\text{jammed}} \ll \mu{% end %}.

*For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with \\(\mu = 10/\text{s}\\) (mean 100ms), {% katex() %}\mu_{\text{jammed}} = 1/\text{s}{% end %} (mean 1000ms), and \\(p = 0.3\\):*
- **Mean latency**: {% katex() %}E[T] = 0.7 \times 100 + 0.3 \times 1000 = 370{% end %}ms
- **95th percentile**: ~1800ms (far exceeds 450ms budget)
- **99th percentile**: ~3400ms (\\(9.2\times\\) mean)

The heavy tail means roughly 20% of coordination attempts will miss the 450ms deadline, potentially causing {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} to lose decision advantage during those windows.

> **Physical translation.** 30% jamming probability sounds manageable. But the heavy tail means 20% of coordination attempts miss the 450ms deadline entirely — not by a small margin, but by \\(4\\times\\) (1800ms vs 450ms at p95). In a 50-drone swarm running at 10 coordination cycles per minute, that is one missed deadline every 30 seconds. Architecture that ignores the tail is not degraded-resilient; it just has not been tested under the right conditions yet.

Design implications: either reduce \\(p\\) through better anti-jamming, or accept frequent degraded-mode operation.

### Queueing Theory Application

Model swarm notification as a message distribution problem. When a node detects a threat, it must propagate this detection to \\(n-1\\) peer nodes. In contested environments, not all nodes are reachable directly.

Under full connectivity, epidemic ({% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %}) protocols achieve logarithmic propagation time {% katex() %}T_{\text{gossip}} = O(\ln n / \ln k) \cdot T_{\text{round}}{% end %}, where \\(k\\) is fanout. This follows from the logistic dynamics of information spread: each informed node informs \\(k\\) peers per round, leading to exponential growth until saturation. For tactical parameters (\\(n = 50\\), \\(k = 6\\), {% katex() %}T_{\text{round}} = 20\text{ms}{% end %}), this yields {% katex() %}\approx 44\text{ms}{% end %} — within coordination budgets, versus {% katex() %}1000\text{ms}{% end %} for linear broadcast.

> **Physical translation.** Gossip achieves 44ms because each round doubles the informed set — a detection that reaches 6 nodes in round 1 reaches 36 in round 2, 216 in round 3. The logarithm in {% katex() %}O(\ln n / \ln k){% end %} is the mathematical signature of this exponential growth. Linear broadcast (one-by-one) takes 1000ms for the same 50 nodes. The \\(23\\times\\) speedup from gossip is what keeps swarm notification inside the 450ms coordination budget.

Under partition, the swarm fragments. If jamming divides {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} into three clusters of sizes \\(n_1 = 20\\), \\(n_2 = 18\\), \\(n_3 = 9\\), intra-cluster {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} completes quickly, but inter-cluster propagation requires relay through connectivity bridges - if any exist.

Define {% katex() %}p_{\text{bridge}}{% end %} as the probability that at least one node maintains connectivity across cluster boundaries. If {% katex() %}p_{\text{bridge}} = 0{% end %}, clusters operate independently with no shared awareness. The coordination time becomes undefined (or infinite).

**The optimization problem**: Choose swarm geometry (inter-node distances, altitude distribution, relay positioning) to maximize {% katex() %}p_{\text{bridge}}{% end %} while maintaining surveillance coverage.

This is a multi-objective optimization with competing constraints: spread for coverage implies larger inter-node distances; clustering for relay reliability implies smaller inter-node distances; altitude variation for bridge probability increases power consumption. The Pareto frontier of this tradeoff is not analytically tractable. Numerical optimization with mission-specific parameters yields operational guidance. But once again, the model assumes a static adversary. An adaptive jammer that observes swarm geometry can target bridge nodes specifically. The {% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}anti-fragile{% end %} response: vary geometry stochastically, making bridge node identity unpredictable.

> **Cognitive Map — Section 16.** Latency is a survival constraint, not a UX metric \\(\to\\) adversary ODA loop sets the hard deadline (\\(T_A \approx 800\\)ms) \\(\to\\) \\(T_O\\) decomposition reveals that only {% katex() %}T_{\text{coordinate}}{% end %} is architecture-controllable \\(\to\\) heavy-tail jamming distribution pushes p95 to \\(4\\times\\) the 450ms budget \\(\to\\) gossip achieves \\(23\\times\\) speedup over linear broadcast \\(\to\\) partition fragments the swarm, making bridge node placement the critical architecture decision.


---

## Central Coordination Failure Modes

Cloud architectures assume central coordinators exist and are reachable. Load balancers, service meshes, and orchestrators all depend on some node having global visibility and authority. Tactical edge architectures cannot make this assumption — and the math confirms it: when coordinator reachability drops below 67%, distributed coordination is cheaper than centralized, independent of fleet size.

We identify three coordination failure modes:

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
- Total: \\(2n\\) messages, {% katex() %}2 \cdot L_{\text{coord}}{% end %} latency

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

The crossover is independent of fleet size \\(n\\) — it depends only on reachability and fault tolerance. For {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} fault tolerance requiring \\(f = 3\\) replicas (to tolerate 1 {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} failure per the \\(3f+1\\) bound), the threshold is {% katex() %}p_{r} < 2/3 \approx 67\%{% end %}. Derivation: P99 agreement requires \\(n \geq 3f + 1\\), so with \\(f = 1\\) tolerated failure, we need \\(n \geq 4\\) replicas and \\(f = 3\\) in our cost formula. Thus distributed coordination dominates when coordinator reachability falls below \\(2/3\\).

> **Physical translation.** The crossover point is 67% reachability — independent of how many nodes are in the fleet. A 12-vehicle CONVOY and a 127-sensor OUTPOST both switch to distributed coordination at the same threshold. In contested environments where \\(p_r\\) ranges 0.3–0.5, you are already far below crossover. **Design for distributed coordination as primary mode, with centralized coordination as an optimization when high reachability is sustained.**

### Hysteresis-Based Coordination Mode Selection

Naive mode switching at the crossover point causes oscillation: reachability briefly exceeds threshold, system switches to centralized, latency increases during transition, reachability appears to drop, system switches back. This thrashing wastes resources and creates inconsistent behavior.

We introduce **hysteresis** with distinct thresholds for mode transitions:

{% katex(block=true) %}
\begin{aligned}
\text{Switch to CENTRALIZED:} \quad & p_r > \theta_{\text{up}} = \frac{2}{f} + \epsilon \\
\text{Switch to DISTRIBUTED:} \quad & p_r < \theta_{\text{down}} = \frac{2}{f} - \epsilon
\end{aligned}
{% end %}

where \\(\epsilon\\) is the hysteresis margin (typically 0.1–0.15). The system remains in its current mode when {% katex() %}\theta_{\text{down}} \leq p_r \leq \theta_{\text{up}}{% end %}.

> **Physical translation.** Without hysteresis, a system at the crossover point (\\(p_r \approx 0.67\\)) oscillates: reachability briefly exceeds the threshold, triggering a costly transition to centralized mode, which increases coordination latency, which makes reachability appear to drop, which triggers a switch back. With \\(\epsilon = 0.1\\), the system only switches to centralized at \\(p_r > 0.77\\) and only switches back to distributed at \\(p_r < 0.57\\) — creating a 20-point wide stable band that absorbs transient fluctuations.

**Coordination mode selection**:

1. **Compute smoothed reachability**: {% katex() %}\bar{p}_r = \text{EWMA}(\text{history}, \alpha = 0.2){% end %}
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

For {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, {% katex() %}C_{\text{transition}} \approx 8{% end %} seconds of reduced capability. The algorithm only switches when expected benefit exceeds this cost over a planning horizon (typically 5 minutes).

> **Cognitive Map — Section 17.** Three failure modes for central coordinators (unreachable, compromised, overloaded) \\(\to\\) cost analysis shows centralized has \\(2n/p_r\\) expected message cost \\(\to\\) crossover at \\(p_r < 2/f\\) is fleet-size independent \\(\to\\) for Byzantine tolerance with \\(f = 3\\), threshold is 67% — well above typical contested \\(p_r\\) \\(\to\\) design primary mode as distributed \\(\to\\) hysteresis prevents oscillation at the crossover point \\(\to\\) transition cost (8s for CONVOY) further penalizes frequent mode switching.


---

## Degraded Operation as Primary Design Mode

The inversion thesis implies that architects should optimize explicitly for the partition case rather than treating it as an edge condition. When more than half of operating time is spent in Intermittent or Denied regimes, "degraded" is the primary operating mode and "connected" is the bonus state. The formal design objective follows: find the architecture policy \\(\pi\\) that maximizes expected {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} \\(\mathcal{L}(t)\\) conditioned on the system being in the Denied regime, subject to maintaining at least basic-mission capability \\(\mathcal{L}_1\\).

{% katex(block=true) %}
\max_{\pi} \mathbb{E}[\mathcal{L}(t) \mid \Xi(t) = \mathcal{N}] \quad \text{subject to} \quad \mathcal{L} \geq \mathcal{L}_1
{% end %}

> **Physical translation.** This is not "design for failure." It is "design for the primary mode." When 43% of CONVOY's operating time is Intermittent or Denied, the Denied regime is not an edge case — it is a first-class operating mode that must be optimized on its own terms. The objective says: maximize what you can do when disconnected, not just how gracefully you degrade.

When {% katex() %}P(\Xi \in \{\mathcal{I}, \mathcal{N}\}) > 0.5{% end %}, "degraded" is the primary operating mode.

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

*Unit definition*: \\(\Delta V_i\\) values are dimensionless mission utility scores, normalized so that maximum full-integration performance = 21.5 points. For {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}, each level's \\(\Delta V_i\\) was calibrated as: {% katex() %}P(\text{mission success} \mid \text{level achieved}) \times \text{expected coverage fraction} \times 10{% end %}, measured over 200 simulation runs. The span from \\(\Delta V_4 = 8.0\\) to \\(\Delta V_0 = 0\\) (coverage contribution) reflects the {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} mission structure: L0 alone provides no operational coverage, while L4 enables real-time cross-cluster coordination that saturates the coverage function (the table assigns \\(\Delta V_0 = 1.0\\) as a survival-credit baseline, not a coverage score). {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2-15 min require edge-local collision avoidance") %}AUTOHAULER{% end %} weights L3 at 9.0 (vs. {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s 6.0) because hauling throughput is dominated by fleet-level task allocation. These values are scenario-specific inputs, not universal constants.

> **Read this table as a design contract.** Each level's threshold \\(\theta_i\\) is not a measurement — it is the minimum connectivity fraction at which that capability must become reliably available. Each \\(\Delta V_i\\) quantifies the marginal mission value gained by achieving that level. The entire column is an architecture budget: you decide which capabilities to invest in for which connectivity thresholds.

Each level requires minimum connectivity \\(\theta_i\\) and contributes marginal value \\(\Delta V_i\\). Total capability is the sum of achieved levels: a system at L3 achieves {% katex() %}\Delta V_0 + \Delta V_1 + \Delta V_2 + \Delta V_3 = 13.5{% end %} out of maximum 21.5.

**Capability level evaluation** (continuous, per-node):

1. **Measure**: Estimate \\(C(t)\\) via EWMA: {% katex() %}\hat{C}(t) = 0.3 \cdot C_{\text{observed}} + 0.7 \cdot \hat{C}(t-1){% end %}

   (The gain \\(\alpha = 0.3\\) is not a universal constant. The optimal {% katex() %}\alpha = 1 - e^{-\lambda_{\min} \cdot \Delta t}{% end %}, where {% katex() %}\lambda_{\min}{% end %} is the fastest connectivity transition rate worth tracking and \\(\Delta t\\) is the measurement interval. At \\(\Delta t = 1\\)s and {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s observed transition rate of ~0.35 transitions/min \\(\approx 0.006\\)/s: {% katex() %}\alpha = 1 - e^{-0.006} \approx 0.006{% end %} — very slow adaptation. At 0.35 transitions/s: \\(\alpha \approx 0.30\\). The value 0.3 is calibrated to a system that transitions regimes roughly once every 3 seconds; slower-changing environments should use smaller \\(\alpha\\).)

2. **Determine level**: Find highest \\(L_i\\) where {% katex() %}\hat{C}(t) \geq \theta_i{% end %}
3. **Check peer consensus**: For L2+, verify peers report same capability; downgrade if mismatch
4. **Apply hysteresis**: Maintain level unless threshold crossed for {% katex() %}T_{\text{stable}} = 10{% end %}s
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
{% katex() %}\mathrm{deps}(L_j) \subseteq \bigcup_{k \leq j} L_k{% end %}. Since \\(j < i\\), we have
{% katex() %}L_i \notin \mathrm{deps}(L_j){% end %}. Failure of \\(L_i\\) therefore creates no failed
dependency in \\(L_j\\). By induction over all \\(j < i\\), the entire stack below \\(L_i\\)
remains operational. \\(\square\\)

**Corollary**: The {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} failure case in the [constraint sequence article](@/blog/2026-02-19/index.md)
— L3 fleet analytics built before L0 survival was validated — violates Definition 35. The
analytics service imported the health-monitoring framework (L1+), which in turn depended on
dynamic memory allocation not present in the bare-metal boot environment. When the stack
degraded, L0 could not re-initialize because its required allocator was in a crashed L1 process.
Definition 35, verified statically before deployment, would have caught this at link time.

> **Physical translation.** L0 must boot and run on a bare microcontroller with no network, no allocator, and no runtime from upper layers. If a crashed L4 analytics service can prevent L0 from restarting, your survival layer is not actually a survival layer. The dependency isolation requirement converts a design principle into a statically checkable property: zero upward symbol references at link time.

**Multi-failure note**: When power degradation (L0), connectivity partition (\\(\Xi = \mathcal{N}\\)), and clock drift coincide simultaneously, Proposition 36 applies in sequence: the hardware veto (Definition 54 in [The Constraint Sequence and the Handover Boundary](@/blog/2026-02-19/index.md)) fires first, freezing all actuator commands; the MAPE-K loop then operates in read-only diagnostic mode until power recovers above L1 threshold.

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

> **What 48% means operationally.** CONVOY achieves L4 (full integration) only 32% of the time — when in the Connected regime. L3 is available 57% of the time (Connected + Degraded). L0 and L1 are always available. The capability gap is not a defect; it is the mathematical consequence of a contested environment. The architect's job is to maximize mission effectiveness within that gap — not to eliminate it.

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
- {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}: \\(\pi = (0.42, 0.28, 0.17, 0.13)\\) yields {% katex() %}E[\text{Cap}] = 10.5{% end %} (**66%** of max 16.0)
- {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}: \\(\pi = (0.46, 0.19, 0.16, 0.19)\\) yields {% katex() %}E[\text{Cap}] = 10.70{% end %} (**66%** of max 16.2)

Critical insight: L0-L1 capabilities require \\(\theta = 0\\) - safety functions operate at zero connectivity because fog-layer controllers have complete local authority.

**Capability variance**: \\(\sigma \approx 6.2\\) for {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} (\\(\pm 30\\%\\) swings) drives the graceful degradation requirement.

### Threshold Optimization Problem

The \\(\theta_i\\) thresholds are design variables, not fixed constants. The optimization problem balances capability against implementation cost:

{% katex(block=true) %}
\max_{\theta \in \Theta} \quad E_\pi\left[\sum_i \mathbf{1}_{C \geq \theta_i} \cdot V_i\right] - \sum_i c_i(\theta_i)
{% end %}

where \\(c_i(\theta_i)\\) captures the cost of achieving {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %} \\(i\\) at connectivity threshold \\(\theta_i\\). Lower thresholds require more aggressive error correction protocols, weaker consistency guarantees, and more complex failure handling logic.

> **Physical translation.** Lowering \\(\theta_i\\) means the system attempts to provide that capability at lower connectivity — which requires more aggressive protocols, weaker consistency, and more complex failure handling. Each point of threshold reduction has an implementation cost. The optimization finds the thresholds where marginal capability gain (from the connectivity CDF) outweighs implementation cost. Place thresholds in the CDF's flat regions — where small threshold changes produce small probability changes — to get the most mission value per unit of implementation effort.

The cost function \\(c_i\\) is typically convex and increasing as {% katex() %}\theta_i \rightarrow 0{% end %}, reflecting the exponentially increasing difficulty of maintaining coordination at lower connectivity levels.

Optimal threshold placement depends on the connectivity CDF derivative. Place thresholds where \\(dF_C/d\theta\\) is small — in the distribution tails where small threshold changes cause small probability changes.

**{% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %} through threshold learning**: A system that learns to lower its thresholds under degraded connectivity becomes *more capable* under stress. Adapting \\(\theta_i\\) based on operational experience yields measurable capability gains — a manifestation of positive {% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} where {% katex() %}\mathbb{A} = (P_{\text{post-stress}} - P_{\text{pre-stress}})/\sigma > 0{% end %}.

> **Cognitive Map — Section 18.** Partition is the primary mode, not an edge case \\(\to\\) capability hierarchy L0–L4 defines what's achievable at each connectivity threshold \\(\to\\) dependency isolation requirement (Definition 35) guarantees lower levels survive upper-level failures — statically verifiable \\(\to\\) expected capability formula convolves environment (connectivity distribution) with design choices (thresholds) \\(\to\\) CONVOY achieves 48% of theoretical max: the gap is the environment's cost, not a design failure \\(\to\\) threshold optimization balances capability gain against implementation cost \\(\to\\) anti-fragile systems lower thresholds through operational learning, improving under stress.


---

## The Edge Constraint Sequence

Which architectural problems do you solve first? The answer is not a matter of taste — dependency structure forces an order. A team that builds fleet-wide coordination before individual node survival has inverted the sequence. When the stack degrades, nothing survives.

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

Define the dependency graph \\(G = (V, E)\\) where {% katex() %}V = \{\text{capabilities}\}{% end %} and directed edge \\((A, B) \in E\\) means A is prerequisite for B.

The constraint sequence is a topological sort of \\(G\\), weighted by priority:

{% katex(block=true) %}
\text{Priority}(c) = P(c \text{ is binding constraint}) \cdot \text{Cost}(c \text{ violation})
{% end %}

- {% katex() %}P(c \text{ is binding}){% end %} - How often is this capability the limiting factor?
- {% katex() %}\text{Cost}(c \text{ violation}){% end %} - What happens if this capability fails?

For survival under partition:
- {% katex() %}P(\text{binding}) = \pi_N = 0.21{% end %} (from {% term(url="#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} stationary distribution)
- {% katex() %}\text{Cost}(\text{violation}) = \infty{% end %} (loss of platform)

{% katex(block=true) %}
\text{Priority}(\text{survival}) = 0.21 \cdot \infty = \infty
{% end %}

Survival is infinitely prioritized — solve it first regardless of frequency.

> **Physical translation.** Infinite priority is not hyperbole — it is the mathematical statement that no finite capability benefit justifies deferring survival. A 10% improvement in fleet coordination efficiency does not compensate for a 0.001% probability of platform loss. Solve survival first, unconditionally.

For optimized connected operation, the binding probability is low and the cost is finite, yielding a modest priority score that confirms this problem should be addressed last:
- {% katex() %}P(\text{binding}) = P(C(t) > 0.9) \approx 0.14{% end %}
- {% katex() %}\text{Cost}(\text{violation}) = \Delta V_4 = 8.0{% end %} (capability reduction, not failure)

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

Every model in this framework is an approximation. The {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov{% end %} connectivity model, the threshold optimization, the queueing analysis — all are useful precisely because they make assumptions. Recognizing when those assumptions break is not an afterthought; it is part of the architect's core discipline.

### Model Validation Methodology

Before trusting model predictions, we must continuously validate that model assumptions hold. The **Model Health Score** \\(H_M \in [0,1]\\) aggregates validation checks:

{% katex(block=true) %}
H_M = \frac{1}{4}\left( H_{\text{Markov}} + H_{\text{stationary}} + H_{\text{independence}} + H_{\text{coverage}} \right)
{% end %}

> **Physical translation.** Each component tests a different model assumption. {% katex() %}H_{\text{Markov}}{% end %} tests whether history still doesn't matter. {% katex() %}H_{\text{stationary}}{% end %} tests whether the environment is still the same. {% katex() %}H_{\text{independence}}{% end %} tests whether failures are still uncorrelated. {% katex() %}H_{\text{coverage}}{% end %} tests whether rare states are still being observed. When any component drops below threshold, the model's predictions in that dimension are unreliable — fall back to conservative modes rather than trusting stale estimates.

**Markovianity test** ({% katex() %}H_{\text{Markov}}{% end %}): The future should depend only on present state. Compute lag-1 autocorrelation of transition indicators:

{% katex(block=true) %}
H_{\text{Markov}} = 1 - \left| \text{Corr}(X_t, X_{t-2} \mid X_{t-1}) \right|
{% end %}

If {% katex() %}H_{\text{Markov}} < 0.7{% end %}, history matters - consider Hidden Markov or semi-{% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %}s.

**Stationarity test** ({% katex() %}H_{\text{stationary}}{% end %}): Transition rates should be stable over time. Apply Kolmogorov-Smirnov test between early and late observation windows:

{% katex(block=true) %}
H_{\text{stationary}} = 1 - D_{KS}(\hat{Q}_{\text{early}}, \hat{Q}_{\text{late}})
{% end %}

If {% katex() %}H_{\text{stationary}} < 0.6{% end %}, rates are drifting - trigger model retraining or adversarial investigation.

**Independence test** ({% katex() %}H_{\text{independence}}{% end %}): Different nodes' transitions should be independent (or model correlation explicitly). Compute pairwise correlation of transition times:

{% katex(block=true) %}
H_{\text{independence}} = 1 - \max_{i \neq j} \left| \text{Corr}(T^{(i)}, T^{(j)}) \right|
{% end %}

If {% katex() %}H_{\text{independence}} < 0.5{% end %}, transitions are correlated - likely coordinated jamming affecting multiple nodes.

**Coverage test** ({% katex() %}H_{\text{coverage}}{% end %}): Observations should span the state space. Track time since last visit to each state:

{% katex(block=true) %}
H_{\text{coverage}} = \min_i \left( 1 - e^{-\lambda_{\text{visit}} \cdot t_{\text{since\_visit}}(i)} \right)
{% end %}

If {% katex() %}H_{\text{coverage}} < 0.4{% end %}, rare states are under-observed - confidence intervals on those transition rates are unreliable.

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

2. *{% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} coordination collapse*: A firmware bug caused {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} messages to include stale timestamps. The staleness-confidence model interpreted all peer data as unreliable, causing each drone to operate in isolation. Fleet coherence dropped to zero despite 80% actual connectivity.

3. *{% term(url="#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} cascade*: Solar panel degradation followed an exponential (not linear) curve after year 2. The power-aware scheduling model underestimated nighttime power deficit by 40%, causing sensor brownouts that corrupted the anomaly detection baseline, which then flagged normal readings as anomalies, which triggered unnecessary alerts, which depleted batteries further.

These failures were not edge cases - they were model boundary violations that operational testing should have caught.

### The Engineering Judgment Protocol

When models reach their limits, the edge architect falls back to first principles:

1. **What is the worst case?** Not the expected case, not the likely case - the worst case. What happens if every assumption fails simultaneously?

2. **Is the worst case survivable?** If not, redesign until it is. No optimization justifies catastrophic risk.

3. **What would falsify my model?** Identify the observations that would indicate model assumptions have been violated. Build monitoring for those observations.

4. **What is the recovery path?** When the model fails - not if - how does the system recover? Fallback behaviors, degradation paths, human intervention triggers.

5. **What did we learn?** Every model failure is data for the next model. The {% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}anti-fragile{% end %} system improves its models from operational stress.

> **Cognitive Map — Section 19.** Dependency structure forces a build order: survival first, cluster coherence second, fleet consistency third, connected optimization last \\(\to\\) priority formula confirms this mathematically (survival has infinite priority) \\(\to\\) model health score monitors four model assumptions in parallel \\(\to\\) adversarial adaptation, novel environments, emergent interactions, and black swans are the four failure modes that break each assumption \\(\to\\) engineering judgment protocol provides the fallback when models reach their limits.


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

> **How to use this table.** The comparison shows where each framework's design assumptions diverge. Cloud-Native (Kubernetes) excels when partition is transient and the network is trusted — the exact opposite of contested edge conditions. DTN handles store-and-forward but has no concept of capability levels or adversarial handling. MANET handles dynamic topology but lacks the authority delegation model. This framework occupies the intersection of contested partition, Byzantine tolerance, and graded capability — a quadrant the other three don't address.

**Key differentiators**:

1. **Capability hierarchy**: Unlike DTN's flat store-forward or MANET's routing-focused approach, we define explicit {% term(url="#term-capability-level", def="Five-tier hierarchy from partition survival (L0) to cloud-equivalent operation (L4)") %}capability level{% end %}s tied to {% term(url="#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regimes{% end %}. This enables graceful degradation with quantified trade-offs.

2. **Adversarial modeling**: Most edge frameworks assume benign failures. Our {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %} explicitly incorporates adversarial state transitions and adaptation detection - essential for contested environments.

3. **Decision authority distribution**: Cloud-native assumes central authority with delegation on failure. MANET assumes peer equality. Our hierarchical tier model provides structured authority with bounded autonomy at each level.

4. **Reconvergence focus**: DTN optimizes for eventual delivery; MANET optimizes for route discovery. We optimize for *coherent state merge* after partition - ensuring that actions taken in isolation produce consistent combined outcomes.

---

## Self-Diagnosis: Is Your System Truly Edge?

Before applying edge architecture patterns, run this five-test diagnostic. Applying partition-first design to a system that doesn't need it adds coordination overhead, state management complexity, and Byzantine fault tolerance code — with zero benefit. The diagnostic protects against over-engineering as much as under-engineering.

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

The distinction matters because edge patterns carry costs: increased local storage and compute for autonomous operation, complex reconciliation logic for partition recovery, {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} fault tolerance for adversarial resilience, and reduced optimization efficiency from distributed coordination.

These costs are justified only when the operating environment demands them. A retail IoT deployment with reliable cellular connectivity does not need {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} fault tolerance. A tactical drone swarm operating under jamming does.

---

## Model Scope and Failure Envelope

Each mechanism has bounded validity. When assumptions fail, so does the mechanism.

### Markov Connectivity Model

**Validity Domain**: The {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %} applies to a deployment \\(S\\) only when all four conditions listed below hold simultaneously; violation of any one makes the model's predictions unreliable.

{% katex(block=true) %}
\mathcal{D}_{\text{Markov}} = \{S \mid A_1 \land A_2 \land A_3 \land A_4\}
{% end %}

> **Physical translation.** The four conditions must all hold simultaneously. A contested environment where rates are stationary on average (A1 holds) but where the adversary causes correlated failures (A3 fails) still invalidates the model. Validity is a conjunction, not a majority vote: one violated assumption is enough to make predictions unreliable.

where:
- \\(A_1\\): Transition rates are approximately stationary over mission duration {% katex() %}T_{\text{mission}}{% end %}
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

### Inversion Threshold (\\(\tau^\* \approx 0.15\\))

**Validity Domain**: The {% term(url="#prop-1", def="The connectivity level below which distributed autonomy outperforms cloud control") %}inversion threshold{% end %} result holds for deployment \\(S\\) when the three conditions below are satisfied; the most commonly violated is \\(C_1\\) — systems with external abort triggers never enter the long-partition operating mode the threshold assumes.

{% katex(block=true) %}
\mathcal{D}_{\text{threshold}} = \{S \mid C_1 \land C_2 \land C_3\}
{% end %}

where:
- \\(C_1\\): Mission continues during partition (no external abort trigger)
- \\(C_2\\): Decision latency requirements are bounded (\\(T_d < \infty\\))
- \\(C_3\\): Partition events are distinguishable from transient delays

**Uncertainty Bounds**:

The threshold \\(\tau^\* = 0.15\\) is derived from tactical deployments with specific characteristics. For different contexts:

| Context | \\(\tau^\*\\) Range | Basis |
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
- \\(D_3\\): Cluster leads are not {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} (trusted to execute delegation correctly)

**Failure Envelope**: The table below lists each condition's failure mode and mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Unanticipated scenario | System blocks or violates authority | Action blocked by policy | Conservative fallback; defer decision |
| Insufficient delegation | Required action exceeds authority | Authority check fails | Staged delegation; emergency override |
| Byzantine cluster lead | Delegation misused | Anomalous decision pattern | Multi-party delegation; audit trail |

**Counter-scenario**: Novel threat type emerges during partition - not covered by delegation rules. The cluster lead faces a dilemma: take unauthorized action or accept mission degradation. Neither outcome is covered by the model. This is a fundamental limitation: delegation frameworks cannot anticipate all scenarios. Residual risk must be accepted or addressed through broader delegation bounds (with associated risk).

### Summary: Claim-Assumption-Failure Table

> **How to use this table.** For each claim you rely on in your architecture, find its row. Check whether your deployment matches the "Valid When" column. If it matches "Fails When" instead, the claim does not apply and the framework's recommendations in that area should not be followed without modification. This is not a limitation — it is the framework being epistemically honest about its own scope.

The table below consolidates the five major claims of this article, the key assumptions each depends on, the operational contexts where the claim holds, and the conditions that cause it to break down.

| Claim | Key Assumptions | Valid When | Fails When |
| :--- | :--- | :--- | :--- |
| Connectivity follows CTMC | Stationary rates, memoryless transitions | Adversary behavior stable; natural connectivity | Adversary adapts; correlated jamming |
| {% katex() %}\tau^* \approx 0.15{% end %} threshold | Mission continues; decisions bounded | Tactical, industrial contexts | Consumer IoT; always-connected scenarios |
| Capability hierarchy degrades gracefully | Capabilities separable, monotonic | Well-architected systems | Tightly coupled systems; binary capabilities |
| Authority delegation enables autonomy | Scenarios anticipated, cluster leads trusted | Known operational envelope | Novel scenarios; Byzantine compromise |
| Edge-ness Score classifies architecture need | Metrics independent, weights calibrated | Domain where weights derived | Cross-domain comparison; metric correlation |

> **Cognitive Map — Sections 20–21.** Framework comparison shows contested-partition + adversarial + graded-capability is a distinct quadrant \\(\to\\) self-diagnosis test determines whether edge patterns apply to your system \\(\to\\) each model has a validity domain: all conditions must hold simultaneously \\(\to\\) the summary table maps every major claim to its failure conditions \\(\to\\) use the table to verify your deployment before trusting the framework's recommendations.


---

## Irreducible Trade-offs

No design eliminates these tensions. The architect selects a point on each Pareto front.

> **How to use this section.** For each trade-off: (1) identify which objective your mission prioritizes, (2) find the table row matching your operating regime, (3) accept that you cannot do better than the Pareto frontier. These are physical and information-theoretic constraints, not engineering limitations.

### Trade-off 1: Autonomy vs. Coordination Efficiency

{% katex(block=true) %}
\max_{a \in \mathcal{U}_{\text{arch}}} \left( U_{\text{autonomy}}(a), U_{\text{coordination}}(a), -C_{\text{complexity}}(a) \right)
{% end %}

| Design Point | Autonomy | Coordination | Complexity | Optimal When |
| :--- | :---: | :---: | :---: | :--- |
| Cloud-native | Low | High | Low | \\(P(C=0) < 0.05\\) |
| Hybrid tier | Medium | Medium | Medium | \\(P(C=0) \in [0.05, 0.20]\\) |
| Full partition-first | High | Low | High | \\(P(C=0) > 0.20\\) |

Constraint surface: {% katex() %}U_{\text{coordination}} \leq f(1 - U_{\text{autonomy}}) - \alpha \cdot C_{\text{complexity}}{% end %}

> **Physical translation.** The table gives the crossover point: when \\(P(C=0) > 0.20\\), the coordination efficiency you sacrifice for autonomy is smaller than the coordination you would lose to connectivity failures anyway. CONVOY at {% katex() %}\pi_\mathcal{N} = 0.21{% end %} sits just above the crossover — partition-first is the correct choice, not a preference.

### Trade-off 2: Responsiveness vs. Consistency (CAP)

Under partition: choose availability over consistency. {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDTs{% end %} provide eventual consistency without coordination. As \\(C(t) \rightarrow 0\\), consistency approaches zero while responsiveness remains high.

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

The shadow price {% katex() %}\lambda_i = \partial \mathcal{L} / \partial g_i{% end %} quantifies the marginal value of relaxing constraint \\(g_i\\):

| Resource | RAVEN \\(\lambda\\) (c.u.) | CONVOY \\(\lambda\\) (c.u.) | GRIDEDGE \\(\lambda\\) (c.u.) | Interpretation |
| :--- | ---: | ---: | ---: | :--- |
| Bandwidth | 3.20/Mbps-hr | 2.40/Mbps-hr | 0.30/Mbps-hr | Sync capacity value |
| Compute | 0.08/GFLOP | 0.12/GFLOP | 0.05/GFLOP | Local decision value |
| Battery/Power | 12.00/kWh | 4.50/kWh | N/A | Extended operation |
| Latency | 0.50/ms | 0.30/ms | 25.00/ms | Response speed |

*(Shadow prices in normalized cost units (c.u.) — illustrative relative values; ratios between rows convey resource scarcity ordering. GRIDEDGE compute (0.05 c.u./GFLOP) is the smallest unit; all others express how many times more valuable that resource is per unit. Calibrate to platform-specific costs.)*

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

> **Physical translation.** Coordination cost grows from \\(O(n)\\) in Full connectivity to \\(O(n^2)\\) in Intermittent — a quadratic penalty for designs that assume fleet-wide coordination under uncertain links. In Denied, coordination cost becomes infinite: you cannot coordinate with unreachable nodes. Design for Denied means eliminating fleet-wide coordination dependencies at L0 and L1.

### Irreducible Trade-off Summary

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Autonomy-Coordination | Independent operation vs. fleet optimization | Both maximized under partition |
| Response-Consistency | Fast local decisions vs. fleet-wide agreement | Both under partition (CAP) |
| Capability-Resources | High capability vs. low consumption | High capability with low resources |
| Tier Depth-Overhead | Fine authority vs. low coordination cost | Both with large fleets |

These trade-offs are irreducible: no design eliminates them. The operating environment — specifically the partition probability \\(p\\), mission criticality, and fleet size — determines which point on each Pareto front is correct; the framework's value is making those trade-offs explicit and quantifiable rather than implicit.

> **Cognitive Map — Section 21.** Four irreducible trade-offs exist: autonomy vs. coordination efficiency, responsiveness vs. consistency (CAP), capability vs. resources, tier depth vs. overhead \\(\to\\) each has a Pareto frontier that cannot be escaped \\(\to\\) shadow prices quantify which resource is most binding for each scenario \\(\to\\) cost surface shows coordination grows quadratically in Intermittent and becomes infinite in Denied \\(\to\\) accept the trade-off; design for the Pareto point that matches your mission priority.


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

The continuum's recognition that "edge is not a location but a capability profile" aligns with the Edge-ness Score. The structural gap: continuum orchestrators (KubeEdge, Azure IoT Edge, AWS Greengrass) require connectivity to a control plane and favor stateless workloads — neither assumption holds for tactical or industrial edge systems where physical deployment is fixed and state is mission-critical. This architecture layers partition protocols and {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} coherence atop continuum stacks rather than replacing them.

### Distributed Intelligence Frameworks: Complementary Perspectives

**Distributed intelligence** encompasses frameworks for distributed AI/ML, multi-agent systems, and swarm intelligence. These paradigms share our interest in decentralized decision-making but approach it from different angles.

#### Multi-Agent Systems (MAS)

MAS theory provides formal models for autonomous agents with local perception, communication, and action. Contract net protocols and BDI architectures are directly applicable to {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} knowledge base design and task allocation during partition.

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

The gap: MAS assumes reliable message delivery and focuses on agent-level reasoning without system-level convergence guarantees. {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %}-based state reconciliation adds those guarantees for contested environments where MAS coordination mechanisms would otherwise produce divergent state.

#### Related Paradigms

**Federated learning** extends to contested environments through staleness-weighted aggregation and {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %}-tolerant aggregation. **Swarm intelligence** inspires {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} protocols and formation maintenance, but lacks the formal convergence bounds, authority hierarchies, and reconciliation protocols that constrained-connectivity systems require.

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

The frameworks are complementary. KubeEdge or fog patterns handle orchestration and latency optimization when connected; autonomic edge protocols layer partition tolerance and {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} coherence on top. The unique contribution here is formal treatment of contested connectivity — the {% term(url="#def-3", def="Continuous-time stochastic model of how a node transitions between connectivity regimes; steady-state probabilities derived from operational telemetry predict partition exposure and architecture requirements") %}Markov model{% end %}s, authority hierarchies, convergence guarantees, and {% term(url="@/blog/2026-02-12/index.md#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}anti-fragile{% end %} adaptation that other paradigms assume away or delegate to application developers.

> **Read the positioning diagram.** The two axes are connectivity assumption (top = always connected, bottom = usually disconnected) and decision authority (left = centralized, right = autonomous). The green node (Autonomic Edge) is the only paradigm that spans both intermittent and usually-disconnected assumptions while distributing authority all the way to fully autonomous. The red node (Usually Disconnected) marks the operating regime where no other paradigm applies.

> **Cognitive Map — Section 22.** Fog computing overlaps in latency motivation but assumes cloud remains authoritative \\(\to\\) edge-cloud continuum handles resource fluid placement but requires control plane connectivity \\(\to\\) MAS provides agent models but lacks convergence guarantees under partition \\(\to\\) reference architecture table shows anti-fragility and formal partition protocol are unique contributions \\(\to\\) autonomic edge layers atop existing continuum stacks rather than replacing them.


---

## Closing

This article established three interlocking results. The **inversion thesis** (Proposition 1) showed that when partition probability exceeds \\(\tau^\* \approx 0.15\\), designing for disconnection as baseline outperforms designing for connectivity — not marginally, but categorically. The **Markov connectivity model** (Definition 3) provides a tractable quantitative framework: estimate transition rates from telemetry, compute the stationary distribution, derive architectural choices from that distribution. The **capability hierarchy** (\\(\mathcal{L}_0\\)–\\(\mathcal{L}_4\\)) translates the stochastic connectivity picture into a graceful degradation contract: every {% term(url="#term-capability-level", def="Operational capability tier L0-L4 from heartbeat-only survival to full fleet integration; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %} has an explicit connectivity threshold and resource requirement, and transitions between levels are governed by well-defined rules.

Applied to {% term(url="#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}, the framework explains why ore-pass blackouts are non-events: the tier architecture places safety-critical decisions at the fog layer, which never requires upward connectivity. Applied to {% term(url="#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}, it explains why fault isolation must complete within 500 ms with zero cloud dependency: the stationary distribution {% katex() %}\pi_{\mathcal{N}} = 0.19{% end %} means the highest-consequence decisions correlate with lost connectivity.

The framework specifies *what properties emerge under what assumptions*. Every model has a validity domain — the Markov assumptions, the capability separability conditions, the {% term(url="#term-inversion", def="Availability threshold tau* above which partition-first architecture outperforms cloud-first; derived from the U_edge = U_cloud crossover condition") %}inversion threshold{% end %}'s bounded-latency requirement — and the Model Scope section mapped each claim to its failure envelope. Operational deployment requires verifying that those assumptions hold before trusting the prescriptions.

The architecture so far addresses the structural question: *how should an edge system be organized?* But a correctly structured system can still fail silently if it cannot tell whether it is healthy. A {% term(url="#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} drone operating autonomously has no external reference point — it cannot call home to check whether its sensor readings are anomalous, its battery model is drifting, or its peers' state has diverged beyond safe bounds. The next problem in the constraint sequence is therefore measurement: how does an edge node assess its own health and the health of its cluster without central observability infrastructure? That question, and the {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} protocols, anomaly detection formulations, and {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} fault tolerance that answer it, is the subject of [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md).

**Series roadmap** — each article solves the next constraint in the sequence:

1. [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) *(this article)* — contested connectivity model, inversion threshold, capability hierarchy
2. [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md) — anomaly detection, gossip health propagation, Byzantine tolerance without a central collector
3. [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) — MAPE-K autonomic control loops, gain scheduling under stochastic delay, mode-invariant stability
4. [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md) — CRDTs, vector clocks, authority tiers, NTP-free split-brain resolution
5. [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md) — adversarial Markov games, EXP3-IX bandit algorithms, stress-information duality
6. [The Constraint Sequence and the Handover Boundary](@/blog/2026-02-19/index.md) — prerequisite graph, phase gates, certification completeness, zero-tax autonomic stack
