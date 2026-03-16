+++
authors = ["Yuriy Polyulya"]
title = "Self-Measurement Without Central Observability"
description = "When the monitoring service is unreachable, anomaly detection has to run on the node being monitored. This article covers on-device detection, gossip health propagation with bounded staleness, Byzantine-tolerant aggregation, and a proxy-observer pattern for legacy hardware — along with a frank note on what happens when you miscalibrate your priors."
date = 2026-01-22
slug = "autonomic-edge-part2-self-measurement"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "observability", "anomaly-detection"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 2
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Edge systems can't treat disconnection as an exceptional error — it's the default condition. This series builds the formal foundations for systems that self-measure, self-heal, and improve under stress without human intervention, grounded in control theory, Markov models, and CRDT state reconciliation. Every quantitative claim comes with an explicit assumption set."""
+++

---

## Prerequisites

The measurement problem addressed here doesn't exist in a vacuum - it emerges directly from the framework developed in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md).

Three results from that foundation shape everything in this article. First, the Semi-Markov connectivity model ({% term(url="@/blog/2026-01-15/index.md#def-12", def="Connectivity Markov Chain: semi-Markov model with Weibull sojourn times for each connectivity regime (Connected/Degraded/Intermittent/None)") %}Definition 12{% end %}) establishes *when* measurement becomes the system's only source of truth. During the None regime ({% katex() %}\mathcal{N}{% end %}), there is no external observability infrastructure - no central monitoring, no cloud metrics, no human operator in the loop. Every judgment the system makes about its own health must be drawn from local evidence alone. Self-measurement is not about building better dashboards; it is about survival during partition.

Second, the capability hierarchy ({% katex() %}\mathcal{L}_0{% end %}–{% katex() %}\mathcal{L}_4{% end %}) establishes *what* measurement must protect. A system that cannot assess its own {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier from heartbeat-only survival at the base level to full fleet integration at the top; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %} cannot make sound decisions about which recovery actions to attempt, how aggressively to heal, or when to shed load. Accurate health knowledge is the prerequisite for any subsequent autonomous action.

Third, the inversion thesis - "design for disconnected, enhance for connected" - establishes the design constraint. The observation mechanisms developed here must function in complete isolation from day one. Reporting to a central collector, when connectivity permits, is an enhancement. It is never a dependency.

The state variables \\(\Sigma(t)\\) and \\(\mathbf{H}(t)\\) defined in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) exist formally in the model. This article addresses how they are actually estimated: from local sensor readings, from inter-node {% term(url="#def-24", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} when the mesh is intact, and from statistical inference when observations age and certainty decays. These mechanisms assume {% katex() %}\mathcal{L}_0{% end %} survival capability (stable power, safe-state defaults, and basic mission function in complete isolation) is already in place — anomaly detection operating on a node that cannot maintain power or safe state is architecturally unsound regardless of detection accuracy.

*Throughout this series: **Node** = a logical autonomous control unit (a drone, vehicle, or embedded MCU running the autonomic stack). **Device** = the physical platform hosting a node. **Sensor** = a data source on a device. These are distinct roles: a single device may host one node and dozens of sensors.*

---

> **Memory budget prerequisite.** All definitions and propositions in this article assume the zero-tax autonomic tier ({% term(url="@/blog/2026-02-19/index.md#def-95", def="Lightweight autonomic constructs enabling zero-overhead autonomy on severely memory-constrained MCUs") %}Definitions 95–97{% end %}, [The Constraint Sequence and the Handover Boundary](@/blog/2026-02-19/index.md)) is active, providing a ~200-byte baseline for health tracking. On platforms where the full measurement stack cannot fit (< 4 KB SRAM), the definitions below cannot activate and the system degrades to heartbeat-only L0 observation. Verify your platform's memory budget against the constraint sequence before implementing any definition in this article.

> **Architectural prerequisite.** This article assumes the Inversion Threshold condition ({% term(url="@/blog/2026-01-15/index.md#prop-2", def="Inversion Threshold: partition-first architecture yields higher expected utility than cloud-native patterns when the disconnection probability exceeds the threshold") %}Proposition 2{% end %}, [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#prop-2)) is satisfied: \\(P(C(t) = 0) > \tau^\*\\) for your deployment. If partition probability is below \\(\tau^\*\\), cloud-connected diagnostics dominate and the autonomy stack in this article is over-engineered for your environment.

## Overview

Self-measurement enables autonomous systems to know their own state without external infrastructure. Each concept integrates theory with design consequence:

| Concept | What It Tells You | Design Consequence |
| :--- | :--- | :--- |
| **Anomaly Detection** | Flag anomaly when {% katex() %}P(H_1 \mid z_t) > C_{\text{FP}}/(C_{\text{FP}} + C_{\text{FN}}){% end %} | Set detection sensitivity from error costs |
| **Gossip Propagation** | Convergence {% katex() %}O(\ln n / f_g){% end %} | Size fleet from acceptable propagation delay |
| **Staleness Theory** | {% katex() %}\tau_{\max} = (\Delta h / (z_{\alpha/2}\sigma))^2{% end %} | Bound observation age from acceptable drift and diffusion coefficient |
| **Byzantine Tolerance** | {% katex() %}\sum_{\text{Byz}} T_i < \frac{1}{3}\sum_{\text{all}} T_i{% end %} | Trust-weight nodes to bound adversarial influence |

> **Decoding the overview table.**
> - **Anomaly detection threshold**: Set your detection trigger at the ratio of false-positive cost to total error cost. If missing a failure costs \\(10\\times\\) more than a false alarm, detect at \\(\geq 91\\%\\) posterior probability, not 50%.
> - **Gossip convergence {% katex() %}O(\ln n / f_g){% end %}**: Fleet-wide health state propagates in logarithmic time. A 127-node OUTPOST mesh converges in ~5 gossip rounds at a 0.5/s fanout rate — under 15 seconds.
> - **Maximum staleness bound**: Observation age has a hard ceiling: beyond {% katex() %}\tau_{\max}{% end %}, the estimate has drifted so far that acting on it is worse than having no data.
> - **Byzantine bound**: If compromised nodes control more than one-third of aggregate trust weight, the fleet's health picture can be corrupted. Design trust weighting to enforce this ceiling even under adversarial enrollment.

This extends fault detection (Cristian, 1991) and epidemic algorithms *(also called gossip protocol or epidemic dissemination — terms used interchangeably in this series)* {{ cite(ref="1", title="Demers et al. (1987) — Epidemic Algorithms for Replicated Database Maintenance") }} for contested edge environments.

---

## Opening Narrative: {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} Under Observation

Early morning. {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} BRAVO's 127-sensor perimeter mesh has been operating for 43 days. Without warning, the satellite uplink goes dark - no graceful degradation. Seconds later, Sensor 47 stops reporting. Last transmission: routine, battery at 73%, mesh connectivity strong. Then silence.

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} needs to answer: *how do you diagnose this failure without external systems?*

- **Hardware failure**: Route around the sensor
- **Communication failure**: Attempt alternative paths
- **Environmental occlusion**: Wait and retry
- **Adversarial action**: Alert defensive posture

Each diagnosis implies different response. Without central observability, {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} must diagnose itself — analyze patterns, correlate with neighbors, assess probabilities, decide on response. All locally. All autonomously.

The sensor cannot speak for itself. Everything OUTPOST knows about Sensor 47 must be inferred from what Sensor 47 is *not* saying, what its neighbors observed last, and what the baseline predicted it should be doing right now.

This is self-measurement: assessing health and diagnosing anomalies without external assistance. You can't heal what you haven't diagnosed, and you can't diagnose what you haven't measured.

---

## The Self-Measurement Challenge

Cloud-native observability assumes continuous connectivity:

The diagram below traces the cloud observability pipeline from raw metrics to human-driven remediation; every arrow is a network call that fails when connectivity is denied.

{% mermaid() %}
graph LR
    A[Metrics] -->|"network"| B[Collector]
    B -->|"network"| C[Storage]
    C -->|"network"| D[Analysis]
    D -->|"network"| E[Alerting]
    E -->|"network"| F[Human Operator]
    F -->|"network"| G[Remediation]

    style A fill:#e8f5e9
    style F fill:#ffcdd2
    linkStyle 0,1,2,3,4,5 stroke:#f44336,stroke-width:2px,stroke-dasharray: 5 5
{% end %}

Every arrow represents a network call. For edge systems, this architecture fails at the first arrow - when connectivity is denied, the entire observability pipeline is severed.

> **Read the diagram.** Every arrow is a network call. In the Denied regime, the first arrow fails — and with it, the entire pipeline. Human operators and cloud analysis are not "later steps"; they are load-bearing columns. Remove them and the structure collapses.

The edge alternative inverts the data flow {{ cite(ref="2", title="Satyanarayanan (2017) — The Emergence of Edge Computing") }}: sensors, analysis, and actuation all reside on the device, and the feedback loop closes locally without any external network call.

{% mermaid() %}
graph LR
    A[Local Sensors] --> B[Local Analyzer]
    B --> C[Health State]
    C --> D[Autonomic Controller]
    D --> E[Self-Healing Action]
    E -->|"feedback"| A

    style A fill:#e8f5e9
    style B fill:#c8e6c9
    style C fill:#fff9c4
    style D fill:#ffcc80
    style E fill:#ffab91
{% end %}

Analysis happens locally. Alerting goes to an autonomic controller, not human operators. The loop closes locally without external connectivity.

> **Read the diagram.** No arrow leaves the device. The feedback loop closes from local sensors through local analysis to autonomic action and back. Cloud reporting, when connectivity permits, is an out-of-band enhancement — not a dependency.

The table below shows how every dimension of the observability problem differs between the two architectures — not just the technical constraints but also the economic cost structure of errors.

<style>
#tbl_obs_compare + table th:first-of-type { width: 25%; }
#tbl_obs_compare + table th:nth-of-type(2) { width: 35%; }
#tbl_obs_compare + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_obs_compare"></div>

| Aspect | Cloud Observability | Edge Self-Measurement |
| :--- | :--- | :--- |
| Analysis location | Central service | Local device |
| Alerting target | Human operator | Autonomic controller |
| Training data | Abundant historical data | Limited local samples |
| Ground truth | Labels from past incidents | Uncertain, inferred |
| Compute budget | Elastic (scale up) | Fixed (device limits) |
| Memory budget | Practically unlimited | Constrained (MB range) |
| Response latency | Minutes acceptable | Seconds required |

**Analysis must happen locally, and alerting must be autonomous**. You can't wait for human operators or external analysis services. The system must detect, diagnose, and decide — all within the constraints of local compute and memory.

> **Physical translation.** The asymmetry in the cost column is the design driver. A false positive triggers an unnecessary healing action — wasteful but recoverable. A false negative leaves a failure undetected — potentially cascading in environments where one missed sensor failure enables adversarial exploitation of the coverage gap. This asymmetry should set your detection threshold before you write a single line of code.

> **Cognitive Map — Section 1.** Three results from [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) motivate self-measurement: Denied regime eliminates external observability, capability hierarchy requires accurate health to trigger recovery, inversion thesis requires measurement to function in complete isolation \\(\to\\) cloud observability pipeline has six network dependencies, all failing together \\(\to\\) edge local loop has zero external dependencies \\(\to\\) false-negative cost asymmetry drives detection threshold design.

---

## Local Anomaly Detection

### The Detection Problem

Anomaly detection is signal classification. The sensor produces a sequence of scalar observations \\(x_1, x_2, \ldots, x_t\\) indexed by time, where each \\(x_t\\) is a single reading (voltage, temperature, signal strength, etc.) at step \\(t\\).

{% katex(block=true) %}
x_1, x_2, \ldots, x_t
{% end %}

At each timestep, the local analyzer must decide: is this observation normal, or anomalous?

This is a binary classification under uncertainty:
- **\\(H_0\\) (null hypothesis)**: The observation is from the normal distribution
- **\\(H_1\\) (alternative)**: The observation is from an anomalous process

<span id="def-19"></span>
**Definition 19** (Local Anomaly Detection Problem). *Given a time series {% katex() %}\{x_t\}_{t \geq 0}{% end %} generated by process \\(P\\), the local {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} problem is to determine, for each observation \\(x_t\\), whether \\(P\\) has transitioned from nominal behavior \\(P_0\\) to anomalous behavior \\(P_1\\), subject to:*
- *Computational budget \\(O(1)\\) per observation*
- *Memory budget \\(O(m)\\) for fixed \\(m\\)*
- *No access to ground truth labels*
- *Real-time decision requirement*

In other words, the detector must classify each incoming reading as normal or anomalous using only a fixed-size memory footprint and constant work per sample — ruling out batch methods or model retraining on the fly.

> **Mode-Transition Safety Requirement.** Upon any capability-level transition ({% term(url="@/blog/2026-01-15/index.md#def-3", def="Hybrid Capability Automaton: models the edge node as a hybrid automaton with discrete capability modes and continuous error-state dynamics") %}Definition 3{% end %}, [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md)), the anomaly detector must immediately recompute both the dynamic threshold \\(\theta^\*(t)\\) and the stability-region lower bound \\(\delta_q\\) using the new mode's parameters (\\(T_\text{tick}(q)\\), Stability Region from {% term(url="@/blog/2026-01-15/index.md#def-4", def="Stability Region: maximal forward-invariant region under the current mode dynamics; error states outside this region cause the healing loop to diverge") %}Definition 4{% end %}). Do not carry over \\(\theta^\*(t)\\) from the previous mode; recompute it with the current \\(T_\text{acc}\\) value and the new \\(\delta_q\\) floor. This ensures the detector never operates outside the new mode's Stability Region boundary, as required by the series' mode-switching stability guarantee.
>
> **T_acc carry-over.** Since \\(T_\text{acc}\\) does not reset on mode transitions ({% term(url="@/blog/2026-01-15/index.md#def-15", def="Partition Duration Accumulator: contiguous time spent in the disconnected regime; resets on partition end; input to threshold adaptation and the Weibull Circuit Breaker") %}Definition 15{% end %}, [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-15)), the threshold recomputation uses the **old** \\(T_\text{acc}\\) value with the **new** mode's \\(\delta_q\\) and \\(\gamma_\text{FN}\\). The net effect: entering a more degraded mode mid-partition produces a tighter threshold (the new mode's smaller Stability Region means \\(\delta_q\\) consumes more headroom) applied to the same accumulated partition age.
>
> **Simultaneous transition + partition crossing.** When a mode transition and a partition boundary crossing occur in the same MAPE-K tick (e.g., battery drops to L0 while connectivity fails simultaneously): apply the **mode transition first** (compute new \\(\theta^\*(t)\\) using the new mode's \\(\delta_q\\) and current \\(T_\text{acc}\\)), then evaluate partition-dependent triggers ({% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %} circuit breaker, threshold tightening). This order ensures the new mode's Stability Region is respected before partition-specific thresholds are applied. Reversing the order would evaluate the circuit breaker against a pre-transition \\(\delta_q\\), potentially firing at the wrong threshold.

<style>
#tbl_detection + table th:first-of-type { width: 25%; }
#tbl_detection + table th:nth-of-type(2) { width: 35%; }
#tbl_detection + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_detection"></div>

| Constraint | Cloud Detection | Edge Detection |
| :--- | :--- | :--- |
| Compute | GPU clusters, distributed | Single CPU, milliwatts |
| Memory | Terabytes for models | Megabytes for everything |
| Training data | Petabytes historical | Days of local history |
| Ground truth | Labels from incident response | Inference from outcomes |
| FP cost | Human review time | Unnecessary healing action |
| FN cost | Delayed response | Undetected failure, potential loss |

The asymmetry of costs is critical. A false positive triggers an unnecessary healing action - wasteful but recoverable. A false negative leaves a failure undetected - potentially catastrophic in contested environments where undetected failures cascade.

### Statistical Approaches

*MAPE-K (Monitor–Analyse–Plan–Execute with Knowledge Base): the four-phase autonomic control loop executing periodically at tick interval T_tick(q). The Monitor phase collects measurements; Analyse applies anomaly detection; Plan selects healing actions; Execute issues commands. The Knowledge Base K provides shared state across all four phases. [7, 8]*

**Problem**: Cloud detection pipelines assume unlimited compute, persistent labels, and continuous connectivity. An edge device running under a milliwatt power budget must classify each reading as normal or anomalous in constant time — using only data already in its fixed-size ring buffer, with no retraining and no access to ground truth.

**Solution**: Three lightweight algorithms cover the anomaly spectrum: EWMA for rapid scalar spikes, CUSUM for slow sustained drift, and Isolation Forest or Autoencoder for multivariate correlation anomalies.

**Trade-off**: Simpler methods (EWMA, CUSUM) need no labeled training data and run in two multiply-adds per tick, but miss correlated multi-sensor faults. Richer models (Isolation Forest, Autoencoder, TCN) catch those faults but require offline training and a few hundred bytes of model storage.

Edge {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} requires algorithms that are:
- **Computationally lightweight**: O(1) per observation
- **Memory-efficient**: Constant or logarithmic memory
- **Adaptive**: Adjust to changing baselines without retraining
- **Interpretable**: Provide confidence, not just binary classification

Three approaches meet these requirements:

**Exponential Weighted Moving Average (EWMA)**

The simplest effective approach. The two equations below update the running mean \\(\mu_t\\) and running variance {% katex() %}\sigma_t^2{% end %} after each new observation \\(x_t\\), where \\(\alpha \in (0,1)\\) is the smoothing weight that trades recency for stability.

{% katex(block=true) %}
\begin{aligned}
\mu_t &= \alpha x_t + (1 - \alpha) \mu_{t-1} \\
\sigma_t^2 &= \alpha (x_t - \mu_{t-1})^2 + (1 - \alpha) \sigma_{t-1}^2
\end{aligned}
{% end %}

> **Physical translation**: \\(\mu_t\\) is a weighted average that remembers recent readings at weight \\(\alpha\\) and forgets old ones at rate \\((1 - \alpha)\\). {% katex() %}\sigma_t^2{% end %} tracks how much the signal bounces around its own recent mean. Together they define "what normal looks like right now" — updating in two multiply-adds per observation tick.

- **Use**: Computes an exponentially weighted moving average baseline for metric {% katex() %}x{% end %}; apply at every MAPE-K monitor tick to maintain an adaptive baseline and prevent stale-mean drift from flooding false anomaly alerts during normal load ramp-up.
- **Parameters**: {% katex() %}\alpha = 0.05\text{--}0.3{% end %}; {% katex() %}\alpha = 0.1{% end %} gives {% katex() %}\approx 10{% end %}-sample effective window; larger {% katex() %}\alpha{% end %} reacts faster but produces noisier baselines.
- **Field note**: Match {% katex() %}\alpha{% end %} to your metric's ramp-up time constant — the window should cover 2–12 full ramp cycles.

**Mode-indexed smoothing — the stability-region coupling.** When {% katex() %}T_{\text{tick}}{% end %} changes across capability levels ({% term(url="@/blog/2026-01-15/index.md#def-3", def="Hybrid Capability Automaton: models the edge node as a hybrid automaton with discrete capability modes and continuous error-state dynamics") %}Definition 3{% end %} in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-3)), a fixed \\(\alpha\\) produces windows of different physical duration. At L1 with {% katex() %}T_{\text{tick}}{% end %} doubled, \\(\alpha = 0.1\\) tracks a 100-second window instead of 50 seconds, halving baseline responsiveness exactly when the system's Stability Region ({% term(url="@/blog/2026-01-15/index.md#def-4", def="Stability Region: maximal forward-invariant region under the current mode dynamics; error states outside this region cause the healing loop to diverge") %}Definition 4{% end %} in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-4)) is smallest.

To preserve a constant physical time constant {% katex() %}T_{\text{window}}{% end %} across modes, the smoothing weight must be mode-indexed:

{% katex(block=true) %}
\alpha_q = 1 - e^{-\kappa_{\mathrm{drift}} \cdot T_{\mathrm{tick}}(q)}
{% end %}

> **Physical translation:** The smoothing coefficient grows with the tick interval — in survival mode where \\(T_\text{tick}\\) is longer, \\(\alpha\\) is larger, meaning the baseline updates faster per tick but is still updated less frequently in wall-clock time. This prevents a sudden switch to a low-frequency survival schedule from freezing the baseline at a stale value: the first post-switch observation still gets appropriate weight. Without this correction, a baseline appropriately tuned at L3 becomes underresponsive at L1 — suppressing the anomaly score exactly when the healing loop's corrective authority is most reduced.

where {% katex() %}\kappa_{\text{drift}}{% end %} is the process drift rate in s{% katex() %}{}^{-1}{% end %}, calibrated from stationary field data.

*Example*: {% katex() %}\kappa_{\text{drift}} = 0.02\,\text{s}^{-1}{% end %} gives {% katex() %}\alpha_{L3} \approx 0.095{% end %} (5 s tick, 53 s effective window) and {% katex() %}\alpha_{L1} \approx 0.181{% end %} (10 s tick, 55 s effective window) — windows matched to within 4%.

Without this correction, a baseline that is appropriately tuned at L3 becomes systematically underresponsive at L1, suppressing {% katex() %}z_t^K{% end %} below the detection threshold precisely when the healing loop's corrective authority ({% term(url="@/blog/2026-01-29/index.md#def-40", def="CBF Gain Scheduler: maps the stability margin to a derated gain value at or below the maximum, maintaining the safety condition at each mode boundary") %}Definition 40{% end %} in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-40)) is most reduced.

*{% katex() %}\kappa_{\text{drift}}{% end %} (process drift rate, \\(s^{-1}\\)) is the Kalman model noise rate calibrated from stationary field data. Distinct from: Weibull scale \\(\lambda_i\\) ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %}), gossip contact rate \\(f_g\\) ({% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}), and information decay rate \\(\lambda_c\\) ({% term(url="@/blog/2026-01-15/index.md#def-5b", def="Semantic Convergence Factor: fraction of merged state items with no policy violations; when this fraction is too low, violations accumulate faster than they can be resolved") %}Definition 5b{% end %}).*

**\\(\lambda\\) notation legend.** \\(\lambda\\) carries six distinct roles in this article; subscripts and function notation are the sole disambiguators at each occurrence:

1. **Gossip contact rate** — \\(f_g > 0\\) (exchanges per second per node); see {% term(url="#def-24", def="Gossip Health Protocol: epidemic dissemination where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds") %}Definition 24{% end %} and {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in O(ln n / f_g) expected rounds under the Gossip Health Protocol on a fully-connected network") %}Propositions 12–13{% end %}.
2. **Weibull scale / drift rate** — \\(\lambda_i\\) or \\(\lambda_W\\); Weibull scale parameter for partition duration ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %} in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md)).
3. **Adaptive L2 regularization coefficient** — \\(\lambda_\text{reg}\\); used in the online SVM weight update.
4. **Distributional shift decay constant** — \\(\xi_\text{shift}\\); model accuracy decay under covariate shift.
5. **Eigenvalue notation** — {% katex() %}\lambda_{\max}(\cdot){% end %} and \\(\lambda_i(\cdot)\\); standard linear algebra convention throughout.
6. **Shadow price** — {% katex() %}\zeta_i = \partial U / \partial g_i{% end %}; Lagrangian multiplier on observability constraint \\(g_i\\).

> **Key distinction**: \\(\kappa_\text{drift}\\) (local baseline drift rate, calibrated from stationary field data) and \\(\lambda_c\\) (partition-induced information decay rate, [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md)) are separate quantities. During partition, \\(\lambda_c\\) governs staleness of received peer data; \\(\kappa_\text{drift}\\) governs the local baseline update.

> **Physical translation**: A drift rate of \\(0.02\\,s^{-1}\\) sounds negligible — but in 60 seconds the baseline has shifted by a factor of \\(3{\times}\\) without adaptive correction. This is why the EMA window must track wall-clock elapsed time, not tick count: at L2 throttling (double the tick interval), the window must double too, or baseline drift appears as a false anomaly.

Where \\(\alpha \in (0, 1)\\) controls the decay rate. Smaller \\(\alpha\\) means longer memory. Note: variance uses {% katex() %}\mu_{t-1}{% end %} to keep the estimate independent of \\(x_t\\), consistent with the anomaly score calculation.

The anomaly score \\(z_t\\) normalizes the current observation's deviation from the running mean by the running standard deviation, yielding a dimensionless measure of surprise that can be compared against a fixed threshold regardless of the signal's units or scale.

{% katex(block=true) %}
z_t = \frac{|x_t - \mu_{t-1}|}{\sigma_{t-1}}
{% end %}

> **Physical translation**: Divide the current reading's distance from the running mean by the running standard deviation. A result of 2.5 means this observation is 2.5 standard deviations from what the sensor has been reporting recently — statistically unlikely under a normal distribution regardless of the signal's units or absolute scale.

- **Use**: Computes the Z-score of each reading against the adaptive EWMA baseline in standard deviations; compare against threshold from {% term(url="#prop-9", def="Optimal Anomaly Threshold: minimizes total misclassification cost by balancing false-positive and false-negative penalties") %}Proposition 9{% end %} at every monitor tick to catch anomalies while preventing absolute-threshold brittleness when metric scale shifts after reconfiguration.
- **Parameters**: Uses EWMA variance; enforce {% katex() %}\sigma_{\min} \approx 0.01 \cdot \bar{x}{% end %} to prevent divide-by-zero on constant-output sensors.
- **Field note**: Always set {% katex() %}\sigma_{\min}{% end %} — a constant-reading sensor causes silent division-by-zero that disables the entire anomaly detector.

**Anomaly Classification Decision Problem**:

**Objective Function**: The formula selects the binary decision \\(d\\) (flag or not flag) that maximizes expected utility given the current observation \\(x_t\\), where false positive cost {% katex() %}C_{\text{FP}}{% end %} and false negative cost {% katex() %}C_{\text{FN}}{% end %} are the key parameters.

{% katex(block=true) %}
d^* = \arg\max_{d \in \{0, 1\}} \mathbb{E}[U(d \mid x_t)] = \arg\max_{d \in \{0, 1\}} \left[ -C_{\text{FP}} \cdot P(H_0 \mid x_t) \cdot d - C_{\text{FN}} \cdot P(H_1 \mid x_t) \cdot (1-d) \right]
{% end %}

where \\(d = 1\\) indicates "anomaly detected".

**Optimal Decision Rule**:

The system flags an observation as anomalous when {% katex() %}z_t > \theta^*{% end %}. The optimal threshold \\(\theta^\*\\) is the inverse-normal quantile that balances the prior probabilities of the two hypotheses against their respective error costs, shifting the decision boundary toward sensitivity when missed detections are more costly than false alarms.

*Throughout this article, \\(\theta^\*\\) denotes the anomaly-classification threshold (a dimensionless z-score boundary). In [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md), \\(\tau^\*\\) denotes the Inversion Threshold (a partition-probability boundary). When citing results from both articles in the same context, use {% katex() %}\theta^*_\text{anom}{% end %} for the anomaly threshold and {% katex() %}\tau^*_\text{inv}{% end %} for the inversion threshold.*

{% katex(block=true) %}
\theta^* = \Phi^{-1}\left(1 - \frac{C_{\text{FN}} \cdot P(H_1)}{C_{\text{FP}} \cdot P(H_0) + C_{\text{FN}} \cdot P(H_1)}\right)
{% end %}

> **Physical translation**: \\(\theta^\*\\) shifts the alarm boundary based on how bad each type of mistake is. If missing a fault costs ten times more than raising a false alarm ({% katex() %}C_{\text{FN}}/C_{\text{FP}} = 10{% end %}), the detector triggers on weaker signals, accepting more false alarms to avoid catastrophic misses. When both costs are equal, the formula reduces to the standard 50th-percentile boundary.

- **Use**: Computes the Gaussian-optimal detection threshold balancing FP and FN costs; use during integration testing with labeled fault-injection data to prevent symmetric-cost miscalibration that underweights the mission cost of missed faults.
- **Parameters**: {% katex() %}C_{\text{FN}}/C_{\text{FP}}{% end %} ratio = 3–10 for critical systems; larger ratio lowers the threshold (act sooner on weaker signals).
- **Field note**: Most mission systems need {% katex() %}C_{\text{FN}}/C_{\text{FP}} \geq 5{% end %} — operators consistently underestimate missed-fault cost until a real incident occurs.

<span id="prop-9"></span>
**Proposition 9** (Optimal Anomaly Threshold). *Applies the anomaly classification problem of {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}Definition 19{% end %} to derive: given asymmetric error costs {% katex() %}C_{\text{FP}}{% end %} for false positives and {% katex() %}C_{\text{FN}}{% end %} for false negatives, the optimal detection threshold \\(\theta^\*\\) satisfies the likelihood ratio condition:*

*Flag an anomaly when the anomalous distribution is more likely than normal, scaled by the relative cost of each mistake.*

{% katex(block=true) %}
\frac{f_1(\theta)}{f_0(\theta)} = \frac{C_{\text{FP}}}{C_{\text{FN}}}
{% end %}

*where \\(f_1\\) is the probability density under \\(H_1\\) (anomaly) and \\(f_0\\) under \\(H_0\\) (normal). The decision boundary lies where the anomaly likelihood exceeds the normal likelihood by the cost ratio.*

In other words, the detector should flag an observation as anomalous exactly when the data is more likely to have come from the anomalous distribution \\(H_1\\) than from the normal distribution \\(H_0\\), scaled by the relative cost of each type of error.

*Proof*: The expected cost is the sum of false-positive cost weighted by the false-positive rate and false-negative cost weighted by the false-negative rate, both functions of the chosen threshold \\(\theta\\).

{% katex(block=true) %}
\mathbb{E}[\text{Cost}(\theta)] = C_{\text{FP}} \cdot P_{\text{FP}}(\theta) + C_{\text{FN}} \cdot P_{\text{FN}}(\theta)
{% end %}

Setting the derivative of the expected cost with respect to \\(\theta\\) to zero gives the first-order condition, where \\(f_0\\) and \\(f_1\\) are the probability densities under \\(H_0\\) and \\(H_1\\) evaluated at the boundary point \\(x_\theta\\).

{% katex(block=true) %}
\frac{d\mathbb{E}[\text{Cost}]}{d\theta} = C_{\text{FP}} \cdot f_0(x_\theta) - C_{\text{FN}} \cdot f_1(x_\theta) = 0
{% end %}

This yields the Neyman-Pearson condition. Equivalently, flagging when {% katex() %}z_t > \theta^*{% end %} is identical to the posterior-probability rule below: declare anomaly when the probability of \\(H_1\\) given the current score exceeds the ratio of false-positive cost to total error cost (see {% term(url="#prop-9", def="Optimal anomaly detection threshold balancing false-positive cost against missed-detection cost; calibrated per action severity") %}Proposition 9{% end %}).

{% katex(block=true) %}
P(H_1 \mid z_t) > \frac{C_{\text{FP}}}{C_{\text{FP}} + C_{\text{FN}}}
{% end %}

Both formulations select the same decision boundary; the z-score form is computationally convenient while the posterior form makes the cost trade-off explicit. For tactical edge systems where {% katex() %}C_{\text{FN}} \gg C_{\text{FP}}{% end %}, both shift toward sensitive detection.

**Partition-Duration-Aware Threshold ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %} extension)**: Under the Weibull partition model, the relative cost of false negatives rises as partition duration grows — missed anomalies cannot be externally remediated. Let {% katex() %}T_{\mathrm{acc}}(t){% end %} be the partition duration accumulator ({% term(url="@/blog/2026-01-15/index.md#def-15", def="Partition Duration Accumulator: contiguous time spent in the disconnected regime; resets on partition end; input to threshold adaptation and the Weibull Circuit Breaker") %}Definition 15{% end %}) and {% katex() %}Q_{0.95}{% end %} the P95 planning threshold ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %}). The cost ratio evolves as:

{% katex(block=true) %}
\frac{C_{\mathrm{FN}}(t)}{C_{\mathrm{FP}}(t)} = \frac{C_{\mathrm{FN}}}{C_{\mathrm{FP}}} \cdot \left(1 + \gamma_{\mathrm{FN}} \cdot \frac{T_{\mathrm{acc}}(t)}{Q_{0.95}}\right)
{% end %}

> **Physical translation**: As the device stays disconnected longer, missing a fault becomes costlier — there is no central system to compensate. This term scales the false-negative cost upward proportionally with partition age, so the detector automatically becomes more sensitive the longer it operates in isolation.

where {% katex() %}\gamma_{\mathrm{FN}} \geq 0{% end %} is the false-negative cost escalation rate (deployment parameter; {% katex() %}\gamma_{\mathrm{FN}} = 0{% end %} recovers the static threshold). Substituting into the Neyman-Pearson condition yields the **time-varying optimal threshold**:

{% katex(block=true) %}
\theta^*(t) = \frac{\theta^*_0}{1 + \gamma_{\mathrm{FN}} \cdot T_{\mathrm{acc}}(t)/Q_{0.95}}
{% end %}

> **Physical translation**: At partition start, {% katex() %}\theta^*(t) = \theta^*_0{% end %} — baseline sensitivity. As partition age approaches the P95 planning horizon {% katex() %}Q_{0.95}{% end %}, the alarm threshold shrinks by a factor of {% katex() %}(1 + \gamma_{\text{FN}}){% end %}. When help is farthest away, the detector is most alert.

- **Use**: Tightens the anomaly detection threshold as {% katex() %}T_{\text{acc}}{% end %} approaches {% katex() %}Q_{0.95}{% end %} during sustained partition; replaces the static threshold at each MAPE-K tick to prevent the miss surge that occurs when the system normalizes to a degraded state.
- **Parameters**: Initial threshold {% katex() %}\theta^*_0 = 2\text{--}3\sigma{% end %}; {% katex() %}\gamma_{\mathrm{FN}}{% end %} tunes tightening rate; calibrate so {% katex() %}\theta^*(Q_{0.95}) \approx 0.5 \cdot \theta^*_0{% end %}.
- **Field note**: Inject faults at {% katex() %}T_{\text{acc}} > Q_{0.95}{% end %} in integration testing — this corner case is routinely skipped and routinely fails in field deployments.

where {% katex() %}\theta^*_0{% end %} is the static baseline threshold from the likelihood ratio condition above.

*Interpretation*: As {% katex() %}T_{\mathrm{acc}} \to 0{% end %}, {% katex() %}\theta^*(t) \to \theta^*_0{% end %} (partition just started, baseline sensitivity). As {% katex() %}T_{\mathrm{acc}} \to Q_{0.95}{% end %}, {% katex() %}\theta^*(t) \to \theta^*_0 / (1 + \gamma_{\mathrm{FN}}){% end %} — the detector becomes {% katex() %}(1 + \gamma_{\mathrm{FN}}){% end %} times more sensitive. For {% katex() %}T_{\mathrm{acc}} > Q_{0.95}{% end %}: the circuit breaker ({% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %}) fires, the system enters L0, and \\(\theta^\*(t)\\) is frozen at its current value — further threshold drift is irrelevant since healing actions are suspended.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration**: With {% katex() %}\gamma_{\mathrm{FN}} = 2.0{% end %} (anomalies during long denied periods cost \\(3\times\\) baseline due to inability to request sensor replacement), the threshold drops from {% katex() %}\theta^*_0 = 2.5\,\sigma{% end %} at partition start to {% katex() %}\theta^*_0 / 3 \approx 0.83\,\sigma{% end %} at the P95 boundary. This triggers more sensitive detection of health anomalies precisely when external recovery is least available.

**Calibration example (RAVEN).** Missed motor degradation costs 1000 J (lost drone); false alarm costs 50 J (wasted diagnostics). Cost ratio \\(C_\text{FN}/C_\text{FP} = 20\\). With \\(P(H_0) = 0.95\\) (nominal operation 95% of flight time), the optimal threshold \\(\theta^\*\\) requires a posterior anomaly probability \\(\geq 95.2\\%\\) — substantially tighter than a naive 50% threshold. In practice, deploy {% katex() %}\theta^* \approx 1.8\hat{\sigma}{% end %} for this scenario, where \\(\hat{\sigma}\\) is the estimated noise standard deviation from the baseline estimator.

As partition age grows toward \\(Q_{95}\\), the denominator reaches \\((1 + \gamma_\text{FN})\\): {% katex() %}\theta^*(Q_{95}) = \theta^*_0 / (1 + \gamma_\text{FN}){% end %}. For OUTPOST with \\(\gamma_\text{FN} = 2\\), a threshold initially set at \\(2.5\hat{\sigma}\\) becomes \\(0.83\hat{\sigma}\\) — nearly three times more sensitive. The system grows progressively trigger-happy as partition age approaches the planning horizon, prioritising missed-fault detection over false-alarm suppression.

**Circuit breaker interaction.** The threshold tightening in this proposition applies only while \\(T_\text{acc} \leq Q_{95}\\). When \\(T_\text{acc}\\) exceeds \\(Q_{95}\\) (the P95 partition duration from {% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %}), {% term(url="@/blog/2026-01-29/index.md#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %} ([Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#prop-37)) fires — the Weibull circuit breaker suspends all healing actions and halts threshold tightening. The system enters L0 monitoring-only mode regardless of currently detected anomalies. Treat \\(Q_{95}\\) as the hard ceiling on \\(T_\text{acc}\\) for the purposes of this proposition.

**Worked example — OUTPOST with n = 127 sensors.** For OUTPOST Weibull parameters \\(k = 1.4\\) (shape) and \\(\lambda_W = 14400\\,\text{s}\\) (scale, 4 h), the P95 partition duration is {% katex() %}Q_{0.95} \approx 32{,}400\,\text{s}{% end %} (about 9 hours). With {% katex() %}\theta^*_0 = 2.5\sigma{% end %} and \\(\gamma_\text{FN} = 2.0\\):

- At partition onset (\\(T_\text{acc} = 0\\)): \\(\theta^\*(0) = 2.5\sigma\\) — baseline sensitivity, one alarm per ~80 healthy observations.
- At the circuit-breaker boundary (\\(T_\text{acc} = Q_{0.95}\\)): {% katex() %}\theta^*(Q_{0.95}) \approx 0.83\sigma{% end %} — nearly three times more sensitive, one alarm per ~3 healthy observations.
- Beyond \\(Q_{0.95}\\): \\(\theta^\*\\) is frozen at \\(0.83\sigma\\) and healing actions are suspended.

The \\(\theta^\*(t)\\) state transitions follow four cases:

1. **Partition onset**: \\(\theta^\*(t)\\) tightens as \\(T_\text{acc}\\) accumulates, converging toward {% katex() %}\theta^*_0 / (1 + \gamma_\text{FN}){% end %}.
2. **Circuit-breaker fire** (\\(T_\text{acc} > Q_{0.95}\\)): \\(\theta^\*(t)\\) is frozen at its current value; healing actions are suspended.
3. **Reconnection** (\\(T_\text{acc}\\) resets): \\(\theta^\*(t)\\) unfreezes and resumes from its frozen value — the prior partition's accumulated sensitivity is preserved as the new baseline.
4. **Re-partition with a previously frozen \\(\theta^\*\\)**: tightening resumes from the frozen value, so a node that survived a prior long partition starts the new one already at heightened sensitivity.

**Reconnection recovery rule.** When the partition ends and \\(T_\text{acc}\\) resets to zero, the threshold does not snap back to {% katex() %}\theta^*_0{% end %}. Instead it decays back toward baseline via:

{% katex() %}\theta^*(t_{\text{reconnect}}) = \max(\theta^*_{\text{frozen}},\; \theta^*_0 \cdot e^{-\kappa_{\text{recover}} \cdot T_{\text{connected}}}){% end %}

where {% katex() %}\kappa_{\text{recover}}{% end %} is a decay constant (default: \\(1/T_\\text{quarantine}\\)) and \\(T_\\text{connected}\\) is elapsed time since reconnection. The \\(\\max\\) ensures the threshold does not fall below the frozen sensitivity level until the node has observed sufficient connected-regime data to justify a looser threshold, preventing chronic false alarms after repeated partitions while preserving the heightened vigilance earned through long isolation.

*(Notation: \\(\delta\\)-subscripted symbols in this section carry distinct roles: \\(\delta_q\\) is the monitoring guard band (stability margin floor); {% katex() %}\delta_{\text{flat}}{% end %}, {% katex() %}\delta_{\text{noise}}{% end %} are chi-squared test bounds ({% term(url="#prop-11", def="Sensor Death Override Condition: if a sensor produces zero variance for a configured number of consecutive ticks, the node treats it as failed rather than anomaly-free") %}Proposition 11{% end %}); {% katex() %}\delta_{\max}{% end %} is the SVM weight-norm bound; {% katex() %}\delta_{\text{crit}}{% end %}, {% katex() %}\delta_{\text{norm}}{% end %} are gossip convergence time parameters. Each is dimensionally distinct; subscripts are the sole disambiguator.)*

**Stability-region lower bound on \\(\theta^\*(t)\\).** The time-varying threshold tightens \\(\theta^\*(t)\\) as partition grows. However, there is a lower bound below which tightening itself destabilizes the healing loop: if \\(\theta^\*(t)\\) drops too far, the error signal {% katex() %}e(t) = z_t^K - \theta^*(t){% end %} grows even for an unchanged {% katex() %}z_t^K{% end %}, consuming stability margin without any healing action firing. Under the Stability Region framework ({% term(url="@/blog/2026-01-15/index.md#def-4", def="Stability Region: maximal forward-invariant region under the current mode dynamics; error states outside this region cause the healing loop to diverge") %}Definition 4{% end %} in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-4)), the minimum safe threshold is:

{% katex(block=true) %}
\theta^*(t) \;\geq\; \delta_q \;=\; \sqrt{c_q \,/\, \lambda_{\max}(P_q)} - \varepsilon
{% end %}

> **Physical translation**: Every stability region has a minimum guard band \\(\delta_q\\). Tightening the alarm threshold below \\(\delta_q\\) makes the detector itself a source of instability — small deviations in \\(z_t\\) generate large error signals that consume control authority without triggering any healing action. Stop tightening at \\(\delta_q\\).

where \\(\delta_q\\) is the **monitoring guard band** for mode \\(q\\), {% katex() %}\lambda_{\max}(P_q){% end %} is the largest eigenvalue of the Lyapunov matrix, and \\(\varepsilon > 0\\) is a small margin. Tightening \\(\theta^\*(t)\\) past \\(\delta_q\\) pushes the initial error state toward {% katex() %}\partial \mathcal{R}_q{% end %} before any healing action fires — the detector becomes a destabilizing input. In practice, for RAVEN L3 parameters, {% katex() %}\delta_{L3} \approx 0.6\sigma{% end %}, and for L1 thermal throttle, {% katex() %}\delta_{L1} \approx 0.9\sigma{% end %} — the guard band is tighter exactly when the stability region is smaller.

**Local Observability During Partition**: The threshold behavior above is only verifiable after the fact — central telemetry is unavailable while {% katex() %}\Xi = \mathcal{N}{% end %}. Each node must maintain a compact ring buffer (depth \\(\geq 1{,}024\\) ticks) of five scalar metrics per {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} tick: (i) {% katex() %}T_{\mathrm{acc}}{% end %}; (ii) \\(\theta^\*(t)\\); (iii) outbound queue depth; (iv) 60-second rolling battery drain rate; (v) MAPE-K execution count since partition start. These five scalars are the minimum evidence required to validate chaos scenario pass/fail criteria after connectivity resumes.

> **What this means in practice**: The optimal detection threshold is not a tuning knob — it's determined by the cost ratio between wrong action types. If a false positive (acting on noise) costs 10x less than a missed detection (ignoring a real failure), the threshold should be set low to favor sensitivity. If the opposite, set it high. Measure C_FP and C_FN from your actual deployment data; don't guess.

**Constraint Set**: Any algorithm implementing the optimal decision rule must satisfy these three resource limits; they rule out batch-processing and unbounded-memory approaches that would otherwise be valid statistical choices.

{% katex(block=true) %}
\begin{aligned}
g_1: && \text{compute}(d) &\leq O(1) && \text{(constant-time per observation)} \\
g_2: && \text{memory}(d) &\leq O(m) && \text{(bounded memory)} \\
g_3: && \theta &\in [\theta_{\min}, \theta_{\max}] && \text{(threshold bounds)}
\end{aligned}
{% end %}

**State Transition Model**: The paired update rule below shows how the EWMA accumulates the new observation \\(x_t\\) into the running mean and variance estimates in a single constant-time step.

{% katex(block=true) %}
(\mu_t, \sigma_t^2) = \left(\alpha x_t + (1-\alpha)\mu_{t-1}, \alpha(x_t - \mu_{t-1})^2 + (1-\alpha)\sigma_{t-1}^2\right)
{% end %}

- **Compute**: O(1) per observation (two multiply-adds)
- **Memory**: O(1) (store \\(\mu\\), \\(\sigma^2\\))
- **Adaptation**: Automatic through exponential decay

**Holt-Winters for Seasonal Patterns**

For signals with periodic structure (day/night cycles, shift patterns), Holt-Winters captures level, trend, and seasonality. The three equations below update, respectively, the deseasonalized level \\(L_t\\), the local trend \\(T_t\\), and the seasonal correction \\(S_t\\), each controlled by its own smoothing coefficient (\\(\alpha\\), \\(\beta\\), {% katex() %}s_{\text{hw}}{% end %}) and a period length \\(p\\).

{% katex(block=true) %}
\begin{aligned}
L_t &= \alpha (x_t - S_{t-p}) + (1 - \alpha)(L_{t-1} + T_{t-1}) \\
T_t &= \beta (L_t - L_{t-1}) + (1 - \beta) T_{t-1} \\
S_t &= s_{\mathrm{hw}} (x_t - L_t) + (1 - s_{\mathrm{hw}}) S_{t-p}
\end{aligned}
{% end %}

> **Physical translation**: \\(L_t\\) strips the seasonal swing to expose the true underlying level. \\(T_t\\) tracks whether that level is rising or falling. \\(S_t\\) records the repeating up-and-down pattern for this time of day or week. Combine all three for a one-step-ahead forecast — flag an anomaly when the actual reading diverges from that forecast beyond the calibrated threshold.

Where \\(L_t\\) is level, \\(T_t\\) is trend, \\(S_t\\) is seasonal component, and \\(p\\) is period length.

- **Compute**: O(1) per observation
- **Memory**: O(p) to store one period of seasonal factors
- **Adaptation**: Continuous updates to all components

*Period examples by scenario*:
- **{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}**: p=1 (no meaningful seasonality in flight telemetry) - use EWMA instead
- **{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}**: p=24 hours for communication quality (terrain/atmospheric effects), p=8 hours for engine metrics (thermal cycles)
- **{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}**: p=24 hours for solar/thermal cycles, p=7 days for activity patterns near defended perimeter

**Isolation Forest Sketch for Multivariate**

For multivariate {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} with limited memory, streaming isolation forest assigns each point an anomaly score based on how quickly it can be isolated in a random tree ensemble. The formula below maps expected isolation path length \\(E[h(x)]\\) — normalized by the average path length \\(c(n)\\) in a random tree of \\(n\\) points — to a score between 0 and 1, where scores near 1 indicate anomalies that isolate unusually quickly.

{% katex(block=true) %}
\text{Anomaly Score} = 2^{-E[h(x)] / c(n)}
{% end %}

> **Physical translation**: Points that are easy to isolate (short path through random trees) score near 1 — they stand apart from the crowd and are anomalies. Normal points are hard to isolate (long paths through dense regions) and score near 0.5. The exponential mapping compresses path-length ratios into a 0–5 range regardless of tree depth or dataset size.

Where \\(h(x)\\) is path length to isolate \\(x\\), and \\(c(n)\\) is average path length in a random tree.

- **Compute**: O(log n) per query, O(t) per tree
- **Memory**: \\(O(t \times d)\\) for t trees with depth limit d
- **Adaptation**: Reservoir sampling for tree updates

**Parameter derivation for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}**:

Under assumption set {% katex() %}\mathcal{A}_{IF}{% end %} (memory budget \\(M \leq 32\\)KB, anomaly rate \\(\pi_1 \approx 0.02\\), feature dimension \\(d = 12\\)), the three equations below derive the number of trees \\(t\\), maximum tree depth {% katex() %}d_{\max}{% end %}, and resulting memory footprint \\(M\\) from the stated constraints.

{% katex(block=true) %}
\begin{aligned}
t &= \lceil \ln(1/\delta) / \ln(2) \rceil = 50 \text{ trees for } \delta = 10^{-15} \text{ failure probability} \\
d_{\max} &= \lceil \log_2(n_{\text{sample}}) \rceil = 8 \text{ for } n = 128 \\
M &= t \times d_{\max} \times d \times 4 \text{ bytes} \approx 25\text{KB}
\end{aligned}
{% end %}

**Detection rate derivation**: Under {% katex() %}\mathcal{A}_{IF}{% end %}, the formula below lower-bounds the true positive rate as a function of \\(t\\) and {% katex() %}d_{\max}{% end %}; the approximation uses {% katex() %}1-(1-p)^t \geq 1-e^{-pt}{% end %} and evaluates to roughly 0.85 for these parameters.

{% katex(block=true) %}
\text{TPR} = 1 - \left(1 - \frac{1}{2^{d_{\max}}}\right)^t \geq 1 - e^{-t/2^{d_{\max}}} \approx 0.85
{% end %}

False positive rate {% katex() %}\text{FPR} = \pi_0 \cdot P(\text{anomaly score} > \theta) \approx 0.03{% end %} for threshold at 95th percentile.

**CUSUM for Change-Point Detection**

When the goal is detecting *when* a change occurred (not just that it occurred), CUSUM provides optimal detection for shifts in mean {{ cite(ref="3", title="Page (1954) — Continuous Inspection Schemes") }}. The statistic \\(S_t\\) accumulates evidence of a positive shift above the slack \\(k\\) relative to nominal mean \\(\mu_0\\), resetting to zero whenever evidence goes negative, and triggers an alarm when it exceeds threshold \\(h\\).

{% katex(block=true) %}
S_t = \max(0, S_{t-1} + x_t - \mu_0 - k)
{% end %}

> **Physical translation**: \\(S_t\\) accumulates evidence of a persistent upward shift. Each sample contributes \\(x_t - \mu_0 - k\\): negative when the reading is within the allowable slack \\(k\\), positive when it consistently exceeds it. The \\(\max(0, \cdot)\\) reset forgets evidence when readings return to normal, so CUSUM only alarms when the shift is *sustained* — not just occasional — making it ideal for catching slow-onset degradation that EWMA adapts to and misses.

- **Use**: Accumulates evidence of a sustained mean shift above allowable drift {% katex() %}k{% end %}; run in parallel with EWMA z-score and alarm when {% katex() %}S_t > h{% end %} to catch slow drift that {% katex() %}z_t{% end %} misses because EWMA adapts to gradual changes.
- **Parameters**: {% katex() %}k{% end %} = allowable slack ({% katex() %}0.5\text{--}1\sigma{% end %}); {% katex() %}h{% end %} = alarm threshold ({% katex() %}4\text{--}5\sigma \cdot n{% end %}); reset {% katex() %}S_t{% end %} to 0 after each alarm.
- **Field note**: CUSUM and EWMA together cover both spike and slow-drift fault modes — alarm on either, not both.

where \\(\mu_0\\) is the nominal mean and \\(k\\) is the allowable slack. Alarm when \\(S_t > h\\).

*Detection speed comparison*: For a shift of magnitude \\(\delta\\), the formula below gives the expected number of samples CUSUM needs before triggering, as a function of alarm threshold \\(h\\), slack \\(k\\), and shift \\(\delta\\).

{% katex(block=true) %}
N_{\text{CUSUM}} = \frac{h}{\delta - k} \quad \text{for } \delta > k
{% end %}

EWMA with smoothing \\(\alpha\\) detects when {% katex() %}\bar{x}_t{% end %} crosses the control limit {% katex() %}h_{\text{EWMA}} = L \cdot \sigma\sqrt{\alpha/(2-\alpha)}{% end %}. The average run length under \\(H_1\\) (ARL\\(_1\\)) depends on both \\(\delta\\) and \\(\alpha\\) and has no simple closed form — it is computed from Markov chain approximations or simulation. For standard operating parameters (\\(\delta = \sigma\\), \\(\alpha = 0.3\\), control limit \\(L = 2.5\\)), the standard ARL table entry is shown below.

{% katex(block=true) %}
\text{ARL}_1(\text{EWMA}) \approx 12.9 \text{ samples (from standard ARL tables)}
{% end %}

**Detection speedup analysis**:

Under assumption {% katex() %}\delta \in [0.5\sigma, 1.5\sigma]{% end %}, {% katex() %}\Delta U_{\text{speed}} \in [1.15, 1.29]{% end %}. The speedup increases with shift magnitude because CUSUM is parameterized for a known step change (\\(k = \delta/2\\) is optimal for shift \\(\delta\\)) while EWMA is a general-purpose smoother not tuned to any specific shift. CUSUM's optimality for step changes (proven by Moustakides, 1986) means it dominates EWMA for the abrupt sensor failure scenario.

**Error rate derivation**:

With threshold {% katex() %}\theta = z_\alpha \sigma{% end %} where \\(z_\alpha = 2.5\\) and anomaly score {% katex() %}z_t = |x_t - \mu|/\sigma{% end %}, the two-sided normal distribution gives the following false positive and false negative rates; the FNR assumes a shift of {% katex() %}\delta = 4\sigma{% end %} from the anomalous distribution.

{% katex(block=true) %}
\begin{aligned}
\text{FPR} &= P(|Z| > z_\alpha \mid H_0) = 2\Phi(-z_\alpha) \approx 0.012 \\
\text{FNR} &= P(|Z| \leq z_\alpha \mid H_1) = \Phi(z_\alpha - \delta/\sigma) \approx 0.07 \text{ for } \delta = 4\sigma
\end{aligned}
{% end %}

**Detection latency**: EWMA effective memory spans \\(1/\alpha\\) to {% katex() %}(2-\alpha)/\alpha{% end %} observations. For \\(\alpha = 0.3\\): \\(N \in [3, 5]\\) observations contribute meaningfully to the statistic.

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} Sensor 47 uses EWMA for primary detection: temperature, motion intensity, battery voltage each tracked independently. Cross-sensor correlation uses a lightweight covariance estimate between Sensor 47 and its mesh neighbors.

### Adaptive Change-Point Detection: From Static to Kalman-Optimal Baseline

The CUSUM statistic above uses a fixed nominal mean \\(\mu_0\\). In practice, sensor baselines drift: {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} thermal sensors track diurnal temperature cycles, {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} engine metrics shift with load and altitude, {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} RF interference patterns change with formation geometry. When \\(\mu_0\\) is stale, every observation accumulates evidence of a "change" that is simply baseline drift — generating false alarms continuously. The fix is to replace the static \\(\mu_0\\) with a Kalman-optimal adaptive estimator that tracks "normal" as it evolves.

<span id="def-20"></span>
**Definition 20** (Adaptive Baseline Estimator). *Given a sensor time series {% katex() %}\{x_t\}{% end %}, the adaptive baseline is the Kalman-optimal estimate of the true instantaneous mean \\(\mu_t\\) under the first-order drift model {{ cite(ref="4", title="Kalman (1960) — A New Approach to Linear Filtering and Prediction Problems") }}:*

{% katex(block=true) %}
\begin{aligned}
\text{State model:} \quad & \mu_t = \mu_{t-1} + w_t, \quad w_t \sim \mathcal{N}(0,\, Q) \\
\text{Observation model:} \quad & x_t = \mu_t + v_t, \quad v_t \sim \mathcal{N}(0,\, R)
\end{aligned}
{% end %}

*The recursive Kalman update at each timestep is:*

{% katex(block=true) %}
\begin{aligned}
\hat{P}_{t|t-1} &= P_{t-1} + Q && \text{(prediction: uncertainty grows with drift)} \\
K_t &= \frac{\hat{P}_{t|t-1}}{\hat{P}_{t|t-1} + R} && \text{(Kalman gain } \in (0,1)\text{)} \\
\hat{\mu}_t &= \hat{\mu}_{t-1} + K_t\!\left(x_t - \hat{\mu}_{t-1}\right) && \text{(update: weighted correction)} \\
P_t &= (1 - K_t)\,\hat{P}_{t|t-1} && \text{(updated variance)}
\end{aligned}
{% end %}

*The Kalman anomaly score (normalized innovation) is:*

{% katex(block=true) %}
z_t^K = \frac{x_t - \hat{\mu}_{t-1}}{\sqrt{\hat{P}_{t|t-1} + R}}
{% end %}

*Under \\(H_0\\) (no anomaly) at steady state: {% katex() %}z_t^K \sim \mathcal{N}(0,1){% end %}.*

**Design parameter** {% katex() %}r_{QR} = Q/R{% end %} (drift-to-noise ratio) controls the adaptation rate:
- {% katex() %}r_{QR} \to 0{% end %}: baseline nearly frozen — correct for very slow drift, wrong for fast environmental shifts
- {% katex() %}r_{QR} \to 1{% end %}: aggressive tracking — follows rapid changes, more false alarms during genuine transients

*(Notation: {% katex() %}r_{QR} = Q/R{% end %} is the drift-to-noise ratio used in this adaptive estimator. This is distinct from \\(\rho = T_d/T_s\\) — the compute-to-transmit energy ratio defined in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md)'s Notation Legend.)*

**Connection to EWMA**: The update {% katex() %}\hat{\mu}_t = \hat{\mu}_{t-1} + K_t(x_t - \hat{\mu}_{t-1}){% end %} is structurally identical to the EWMA update {% katex() %}\mu_t = \alpha x_t + (1-\alpha)\mu_{t-1}{% end %}, with \\(K_t\\) in place of \\(\alpha\\). The critical difference: EWMA uses a fixed \\(\alpha\\); the Kalman gain \\(K_t\\) starts large (high initial uncertainty, learns fast) and converges to a smaller steady-state value \\(K_\infty\\) (tracks at the optimal rate for the observed noise level). Fixed-\\(\alpha\\) EWMA is a degenerate Kalman filter with {% katex() %}P_{t-1}{% end %} forced constant at \\(\alpha R/(1-\alpha)\\) every step.

> **Physical translation**: The adaptive estimator tracks the sensor's "normal" behavior using exponential smoothing. A new reading updates the mean estimate, with the learning rate \\(\alpha_q\\) scaled by how fast the connectivity regime is changing: when the node is transitioning between regimes ({% katex() %}\kappa_{\mathrm{drift}}{% end %} large), the estimator adapts quickly to the new baseline. When connectivity is stable, it adapts slowly — preventing false alarms from random fluctuations around a steady operating point.

> **Empirical status**: The cost ratio {% katex() %}C_{\text{FN}}/C_{\text{FP}} = 3\text{–}10{% end %} and the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} example value of 20 are engineering estimates from mission-cost analysis, not statistically derived from field data. The Neyman-Pearson threshold formula is exact given the ratio; the ratio itself requires calibration per deployment. The partition-duration escalation parameter {% katex() %}\gamma_{\text{FN}}{% end %} has no published empirical baseline — treat as a design choice until validated in integration testing.

<span id="prop-10"></span>
**Proposition 10** (Kalman Baseline Convergence Rate). *The Kalman gain sequence {% katex() %}\{K_t\}{% end %} converges geometrically to the steady-state value \\(K_\infty\\), where:*

*The adaptive learning rate settles to the unique value balancing process noise against sensor noise.*

{% katex(block=true) %}
P_\infty = \frac{-Q + \sqrt{Q^2 + 4QR}}{2}, \qquad K_\infty = \frac{P_\infty + Q}{P_\infty + Q + R}
{% end %}

- **Use**: Computes the steady-state Kalman gain that minimizes MSE between noisy sensor readings and the true baseline; replace EWMA on high-noise sensors (vibration probes, IMUs) where {% katex() %}Q_{\text{proc}}/R_{\text{obs}}{% end %} can be estimated, preventing noise-dominated baselines that EWMA cannot correct.
- **Parameters**: {% katex() %}Q_{\text{proc}}{% end %} = process noise variance; {% katex() %}R_{\text{obs}}{% end %} = sensor noise variance; larger {% katex() %}Q_{\text{proc}}/R_{\text{obs}}{% end %} gives gain closer to 1 (fast tracking).
- **Field note**: {% katex() %}r_{QR} = Q/R{% end %} is the only tuning knob — calibrate it from 5–10 minutes of stationary field data before first deployment.

*For small drift {% katex() %}r_{QR} = Q/R \ll 1{% end %}: {% katex() %}K_\infty \approx \sqrt{r_{QR}}{% end %} — the steady-state gain scales as the square root of the process-to-noise ratio. Convergence to \\(K_\infty\\) is geometric with rate {% katex() %}(1 - K_\infty)^t{% end %} from any initial \\(P_0\\), reaching steady state in approximately \\(1/K_\infty\\) samples.*

*Proof*: Substitute {% katex() %}P_t = P_{t-1}{% end %} into the Riccati recursion {% katex() %}P_t = R(P_{t-1}+Q)/(P_{t-1}+Q+R){% end %} and solve the resulting quadratic {% katex() %}P_\infty^2 + QP_\infty - QR = 0{% end %}. Convergence rate follows from linearization of the recursion near \\(P_\infty\\). \\(\square\\)

**Design consequence**: After a transient of approximately \\(1/K_\infty\\) samples, the false positive rate for the Kalman anomaly score is *exactly* \\(2\Phi(-\theta^\*)\\) — not an approximation. The EWMA-based score with fixed \\(\alpha\\) is only asymptotically calibrated and may carry excess false-alarm rate during the warm-up period.

**Validity condition — white noise assumption**: The Kalman gain convergence (Prop 24) and the \\(H_0\\) distribution {% katex() %}z_t^K \sim N(0,1){% end %} both require measurement noise \\(v_t\\) to be approximately i.i.d. Gaussian with stationary variance \\(R\\). Real MEMS sensors violate this: \\(1/f\\) noise dominates below ~1 Hz; variance is temperature-correlated ({% katex() %}R(T) \approx R_0(1 + \beta \cdot \Delta T){% end %} for thermistors); aging causes slow \\(R\\) drift.

Practical remediation:

1. Estimate \\(R\\) from a stationary calibration sequence at deployment temperature before each mission.
2. Run a chi-squared test on the rolling innovation variance — if {% katex() %}\mathrm{Var}[z_t^K]/1.0{% end %} exceeds 1.5 over a 5-minute window, \\(R\\) is miscalibrated and must be re-estimated.
3. If temperature correlation is strong ({% katex() %}\beta \cdot \Delta T_{\max} > 0.3{% end %}), use an adaptive-\\(R\\) Kalman (Sage-Husa estimator).

The false-alarm guarantee is void if \\(R\\) is off by more than 50% — the actual false-alarm rate scales as {% katex() %}P(|N(0,1)| > \theta \cdot \sqrt{R_{\text{assumed}}/R_{\text{actual}}}){% end %}.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration**: Temperature sensors drift at {% katex() %}\approx 1\,^\circ\text{C}\,\text{day}^{-1}{% end %} with sensor noise {% katex() %}\sigma_{\text{sens}} = 0.1\,^\circ\text{C}{% end %}. At {% katex() %}f_s = 1\,\text{Hz}{% end %} (sensor sampling rate): {% katex() %}Q = (1/86400)^2 \approx 1.3 \times 10^{-10}\,\text{K}^2/\text{sample}{% end %}, \\(R = 0.01\\,\text{K}^2\\), giving {% katex() %}r_{QR} \approx 1.3 \times 10^{-8}{% end %} and {% katex() %}K_\infty \approx 1.1 \times 10^{-4}{% end %}. Baseline adapts on a timescale of {% katex() %}1/K_\infty \approx 9000\,\text{s} \approx 2.5\,\text{h}{% end %} — slow enough to track seasonal drift without following measurement noise.

> **Empirical status**: The steady-state formulas for \\(P_\infty\\) and \\(K_\infty\\) are exact given \\(Q\\) and \\(R\\). The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} drift figure of {% katex() %}1\,^\circ\text{C}\,\text{day}^{-1}{% end %} and \\(R = 0.01\\,\text{K}^2\\) are representative sensor-datasheet values; actual calibration requires pre-deployment measurement. The "50% \\(R\\) misestimation voids the false-alarm guarantee" bound is analytically derived, not empirically measured.

<span id="def-21"></span>
**Definition 21** (Bayesian Surprise Metric). *The Bayesian Surprise statistic {% katex() %}S_t^K{% end %} is the adaptive-baseline generalization of CUSUM, accumulating Kalman log-likelihood ratios:*

{% katex(block=true) %}
S_t^K = \max\!\left(0,\; S_{t-1}^K + \Lambda_t^K - \kappa\right)
{% end %}

*where the log-likelihood ratio under a \\(\delta\\)-standard-deviation shift is:*

{% katex(block=true) %}
\Lambda_t^K = \delta \cdot z_t^K - \frac{\delta^2}{2}
{% end %}

- **Use**: Scores each Kalman innovation as a log-likelihood ratio against the baseline model; use as a complementary anomaly signal to catch distribution-shape changes (bimodal fault signatures) that EWMA and CUSUM miss because they only track the mean.
- **Parameters**: {% katex() %}\delta{% end %} = effect size from historical fault events; scores above 3 nats consistently warrant investigation.
- **Field note**: Bimodal sensor signatures (normal vs. failed state) produce large surprise scores even when the mean appears unchanged.

*and \\(\kappa > 0\\) is the allowance that prevents indefinite accumulation. Alert condition: {% katex() %}S_t^K > h{% end %} for threshold \\(h\\).*

*In practice, this means: when the Kalman filter tracks a drifting baseline, each day's {% katex() %}\Lambda_t^K{% end %} stays near zero even as the raw sensor mean climbs — the accumulator only fires when a genuine anomaly diverges from the tracked trend, not when the trend itself shifts. Tune \\(\kappa\\) (the leak rate) to match your mission's decision latency: a small \\(\kappa\\) detects slow subtle changes but takes longer to reset after a false alarm clears.*

**Difference from static CUSUM**: The static form {% katex() %}S_t = \max(0, S_{t-1} + x_t - \mu_0 - k){% end %} uses a fixed \\(\mu_0\\). {% term(url="#def-21", def="Bayesian Surprise Metric: per-reading surprise score measuring deviation from the adaptive baseline in standard-deviation units") %}Definition 21{% end %} replaces \\(x_t - \mu_0\\) with {% katex() %}\Lambda_t^K{% end %}, computed from the Kalman innovation {% katex() %}z_t^K{% end %} normalized by the current innovation variance {% katex() %}\hat{P}_{t|t-1} + R{% end %}. When the baseline drifts by \\(5\\,^\circ\text{C}\\) over a season, {% katex() %}\Lambda_t^K \approx 0{% end %} throughout (the Kalman filter tracks the drift), while the static form accumulates \\(S_t \propto 5/\sigma\\) — triggering continuous false alarms.

**Bayesian interpretation**: {% katex() %}S_t^K{% end %} is a discounted accumulation of log Bayes factors {{ cite(ref="5", title="Gelman et al. (2003) — Bayesian Data Analysis") }}. An alarm at {% katex() %}S_t^K > h{% end %} corresponds to posterior odds {% katex() %}P(\text{change} \mid x_{1:t})/P(\text{no change}) > e^h{% end %} — the detector declares a change when the Bayesian evidence ratio exceeds \\(e^h\\).

<span id="prop-11"></span>
**Proposition 11** (Sensor Death Override Condition). *The Brownian diffusion confidence interval ({% term(url="#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %}) is derived under the assumption that the sensor innovation {% katex() %}z_t^K{% end %} is {% katex() %}\mathcal{N}(0,1){% end %}. Two sensor death modes violate this assumption in opposite directions; both are detected by the sample chi-squared statistic over window \\(w\\):*

*A stuck or exploding sensor is caught by checking whether recent innovation variance is too small or too large.*

{% katex(block=true) %}
\chi^2_w(t) = \frac{1}{w} \sum_{s=t-w+1}^{t} \left(z_s^K\right)^2
{% end %}

*Under \\(H_0\\) (alive sensor): {% katex() %}\mathbb{E}[\chi^2_w] = 1{% end %}. The diffusion model is overridden — and the node is flagged P_CRITICAL regardless of staleness — whenever:*

{% katex(block=true) %}
\chi^2_w(t) \notin [\delta_{\text{flat}},\; \delta_{\text{noise}}]
{% end %}

*Failure modes detected:*
- *{% katex() %}\chi^2_w < \delta_{\text{flat}}{% end %}*: **Flatline death** — sensor stuck at constant value, innovations collapse to zero. The diffusion model produces an artificially narrow CI suggesting high confidence, but the reading is uninformative.
- *{% katex() %}\chi^2_w > \delta_{\text{noise}}{% end %}*: **Noise death** — sensor producing random garbage, innovations explode. The diffusion model produces a wide CI suggesting uncertainty, but the reading is adversarially misleading.

*Proof*: Under \\(H_0\\), {% katex() %}z_s^K \overset{\text{i.i.d.}}{\sim} \mathcal{N}(0,1){% end %} asymptotically ({% term(url="#prop-10", def="Kalman Baseline Convergence Rate: adaptive EWMA baseline converges to the true mean within a target tolerance in a number of steps proportional to the inverse drift rate") %}Proposition 10{% end %}), so {% katex() %}w \cdot \chi^2_w \sim \chi^2_w{% end %} (chi-squared with \\(w\\) degrees of freedom). For window \\(w = 30\\): {% katex() %}P(\chi^2_{30}/30 < 0.1) = P(\chi^2_{30} < 3) \approx 2 \times 10^{-10}{% end %} and {% katex() %}P(\chi^2_{30}/30 > 10) = P(\chi^2_{30} > 300) < 10^{-50}{% end %} — false override rates are negligible. \\(\square\\)

**Calibration**: Set {% katex() %}\delta_{\text{flat}} = 0.1{% end %}, {% katex() %}\delta_{\text{noise}} = 10{% end %}, {% katex() %}w = \max(30, \tau_{\max} \cdot f_s){% end %} (\\(\tau_\text{max}\\) is the Maximum Useful Staleness bound, formally derived at Proposition 14 later in this article; a provisional calibration value of {% katex() %}\tau_\text{max} = 45\,\text{s}{% end %} is used here for OUTPOST parameters), where \\(f_s\\) is the sensor sampling rate in Hz. The window must span at least {% katex() %}\tau_{\max}{% end %} seconds (Prop 5) to ensure the chi-squared test has power against slow-onset flatline failures.

| Failure mode | \\(\chi^2_w(t)\\) signature | CI behavior | Override effect |
| :--- | :--- | :--- | :--- |
| Alive sensor | \\(\approx 1.0\\) | Correct width | No override |
| Flatline death | \\(\to 0\\) | Falsely narrow (high false confidence) | Flags P_CRITICAL |
| Noise death | \\(\gg 1\\) | Wide but misleading | Flags P_CRITICAL |

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} scenario**: In the 127-sensor perimeter mesh, flatline and noise deaths were the two most common hardware failure modes in field trials, making this chi-squared override the primary health guard for sensor trust decisions.

> **Empirical status**: The thresholds {% katex() %}\delta_{\text{flat}} = 0.1{% end %} and {% katex() %}\delta_{\text{noise}} = 10{% end %} and window \\(w = 30\\) are analytically justified by chi-squared tail probabilities (\\(<10^{-10}\\) false-override rate). The claim that flatline and noise deaths dominate {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} failure modes is a scenario illustration, not a measured failure-mode frequency from field data.

The minimum viable sensor set required for continued operation and the transition to reduced capability mode under growing P_CRITICAL count are addressed in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-50) ({% term(url="@/blog/2026-01-29/index.md#def-50", def="Minimum Viable System: smallest subset of components sustaining mission-critical survival capability; defines the healing algorithm's priority boundary") %}Definition 121{% end %}, {% term(url="@/blog/2026-01-29/index.md#def-50", def="Minimum Viable System: reduced service set guaranteeing safe operation under severe resource constraints") %}Minimum Viable System{% end %}).

### Optional: Game-Theoretic Extension — Adversarial Threshold Selection

{% term(url="#prop-9", def="Optimal Anomaly Threshold: minimizes total misclassification cost by balancing false-positive and false-negative penalties") %}Proposition 9{% end %} derives \\(\theta^\*\\) against a non-strategic anomaly distribution. An adversary who controls a compromised sensor (as in the {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} scenario) can output {% katex() %}z_t = \theta^* - \varepsilon{% end %} continuously, evading detection with zero effort. The correct defense is a **randomized threshold** - the Nash equilibrium of the inspection game.

**Inspection game**: Inspector selects threshold \\(\theta\\) (possibly mixed strategy \\(\pi(\theta)\\)); evader selects signal pattern {% katex() %}a \in \mathcal{U}{% end %} to minimize detection probability.

At the Nash equilibrium \\((\pi^\*, a^\*)\\), the inspector is indifferent over all thresholds in the support of \\(\pi^\*\\), and the evader is indifferent over all evasion strategies. The equation below states the equilibrium condition: the mixed threshold strategy \\(\pi^\*(\theta)\\) must produce the same expected detection probability against every evasion action \\(a\\) the adversary might choose, so the adversary gains nothing by switching strategies.

{% katex(block=true) %}
\int_{\theta} P(\text{detect} \mid \theta, a) \, \pi^*(\theta) \, d\theta = \text{const} \quad \forall a \in \mathcal{U}
{% end %}

> **Physical translation**: A fixed threshold of \\(\theta^\* = 2.5\sigma\\) is an open invitation — an adversary-controlled sensor need only output exactly \\(2.4\sigma\\) indefinitely. Using a *randomized* threshold drawn fresh each round forces the adversary to erase any calibration advantage: they cannot tune their evasion signal to a moving target. The Nash equilibrium mixes over a range of thresholds so that every evasion strategy faces the same expected detection probability, closing the calibration exploit entirely.

**Cross-sensor defense**: For the {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} mesh, cross-sensor consistency - checking whether sensor \\(i\\)'s report is consistent with what \\(i\\)'s neighbors' models predict - defeats the threshold-calibration attack, since exploiting it requires simultaneous compromise of multiple sensors.

**Practical implication**: In adversarial settings, draw {% katex() %}\theta_t \sim \pi^*{% end %} fresh each detection round rather than using a fixed \\(\theta^\*\\). For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}'s 127-sensor mesh, cross-sensor consistency checks are the primary {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} detection layer; randomized thresholds are a secondary defense for individual sensor evaluation.

### Distinguishing Failure Modes

Detection answers "is something wrong?" Diagnosis answers "what is wrong?"

For Sensor 47's silence, the fusion node must distinguish:

**Sensor hardware failure**:
- Signature: Gradual degradation before silence (increasing noise, drifting calibration)
- Correlation: Neighboring sensors unaffected
- Battery trend: Unusual power consumption before failure

**Communication failure**:
- Signature: Abrupt silence, no prior degradation
- Correlation: Multiple sensors in same mesh region affected
- Path analysis: Common relay nodes show degradation

**Environmental occlusion**:
- Signature: Specific sensor types affected (e.g., optical but not acoustic)
- Correlation: Geographic pattern (flooding, debris)
- Recovery pattern: Intermittent function as conditions change

**Adversarial action**:
- Signature: Precise silence, no RF emissions
- Correlation: Tactical pattern (sensors on approach path silenced)
- Timing: Coordinated with other events

The fusion node maintains **causal models** for each failure mode. Given observed evidence \\(E\\), the formula below applies Bayes' theorem to compute the posterior probability of each candidate cause, combining the prior likelihood of that failure mode with the likelihood of observing the evidence given that cause.

{% katex(block=true) %}
P(\text{cause} | E) = \frac{P(E | \text{cause}) \cdot P(\text{cause})}{P(E)}
{% end %}

Priors {% katex() %}P(\text{cause}){% end %} come from historical failure rates. Likelihoods {% katex() %}P(E | \text{cause}){% end %} come from the signature patterns.

For Sensor 47:
- Abrupt silence (no degradation): Weights against hardware failure
- Neighbors functioning normally: Weights against communication failure
- Single sensor affected: Weights against environmental occlusion
- Location on approach path: Weights toward adversarial action

The diagnosis is probabilistic, not certain. Self-measurement provides confidence levels, not ground truth.

### Machine Learning Approaches for Edge Anomaly Detection

ML extends detection to multivariate anomalies under edge constraints (<1MB models, <10ms inference, milliwatts power budget).

**Lightweight Autoencoder for Multivariate Anomaly Detection**

Autoencoders learn to compress and reconstruct normal behavior; anomalies produce high reconstruction error.

Architecture for edge deployment; the bottleneck at the latent layer (dim=3) forces the encoder to discard information that cannot be recovered by the decoder, so reconstruction error is high precisely when the input lies outside the learned normal manifold.

{% mermaid() %}
graph LR
    subgraph "Encoder"
        I["Input<br/>d=12 sensors"]
        E1["Dense 8<br/>ReLU"]
        E2["Dense 4<br/>ReLU"]
        L["Latent<br/>dim=3"]
    end

    subgraph "Decoder"
        D1["Dense 4<br/>ReLU"]
        D2["Dense 8<br/>ReLU"]
        O["Output<br/>d=12"]
    end

    I --> E1 --> E2 --> L --> D1 --> D2 --> O

    style L fill:#fff3e0,stroke:#f57c00
{% end %}

> **Read the diagram**: Sensor readings enter as a 12-dimensional vector. The encoder compresses them through layers of decreasing width down to a 3-number latent summary (highlighted). The decoder then tries to reconstruct the original 12 values from those 3 numbers alone. When the system operates normally, reconstruction is accurate and the error is small. When something is wrong, the decoder cannot recover the anomalous pattern — the reconstruction error becomes the anomaly score.

**Model specification for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}** (12-sensor vehicle telemetry):
- Input: 12 dimensions (engine temp, oil pressure, RPM, coolant, transmission temp, brake pressure, fuel flow, battery voltage, alternator output, exhaust temp, vibration, GPS quality)
- Architecture: {% katex() %}12 \to 8 \to 4 \to 3 \to 4 \to 8 \to 12{% end %}
- Parameters: {% katex() %}12\times8 + 8\times4 + 4\times3 + 3\times4 + 4\times8 + 8\times12 = 280{% end %} weights
- Quantized to INT8: **280 bytes** model size
- Inference: 280 multiply-adds = **<0.1ms** on ARM Cortex-M4

The anomaly score for input \\(x\\) is the squared reconstruction error \\(\|x - \hat{x}\|^2\\) normalized by the baseline variance {% katex() %}\sigma^2_{\text{baseline}}{% end %} estimated from validation data, so that a score near 1 indicates normal behavior and scores well above 1 indicate anomaly.

{% katex(block=true) %}
\text{AnomalyScore}(x) = \frac{\|x - \hat{x}\|^2}{\sigma^2_{\text{baseline}}}
{% end %}

where {% katex() %}\hat{x} = \text{Decoder}(\text{Encoder}(x)){% end %} and {% katex() %}\sigma^2_{\text{baseline}}{% end %} is computed from validation data.

**Training methodology for edge autoencoders**:

1. **Offline training**: Train on cloud with historical normal data (exclude known anomalies)
2. **Quantization-aware training**: Use INT8 quantization during training to avoid accuracy loss at deployment
3. **Validation**: Test on held-out anomalies to verify detection capability
4. **Deployment**: Export quantized weights to edge device
5. **Threshold calibration**: Compute threshold on-device from first 1000 observations

**Performance bounds** (derived from model capacity analysis): Under assumption set {% katex() %}\mathcal{A}_{perf}{% end %} — anomaly distribution \\(P_1\\) separable from normal \\(P_0\\) with overlap \\(\epsilon\\), model capacity \\(C_m\\), sample complexity \\(n\\) — the table below gives worst-case precision and recall bounds, per-inference computational complexity, memory footprint, and drift protection mechanism for each edge-viable detector family.

| Method | Precision Bound | Recall Bound | Complexity | Memory | Drift Protection |
| :--- | :--- | :--- | :--- | ---: | :--- |
| EWMA (per-sensor) | {% katex() %}1 - \epsilon_{\text{marginal}}{% end %} | {% katex() %}1 - \text{FNR}(z_\alpha){% end %} | \\(O(1)\\) | 96 bytes | Kalman baseline tracking |
| Isolation Forest | {% katex() %}1 - \epsilon \cdot 2^{-d}{% end %} | \\(1 - (1-1/2^d)^t\\) | \\(O(\log n)\\) | 25 KB | Periodic forest replacement |
| Autoencoder (INT8) | {% katex() %}1 - \epsilon_{\text{joint}}{% end %} | {% katex() %}1 - e^{-C_m/d}{% end %} | \\(O(d^2)\\) | 280 bytes | {% katex() %}\sigma_{\text{baseline}}{% end %} recalibration |
| One-Class SVM | \\(1 - \nu\\) | {% katex() %}1 - \text{VC}(d)/(n\nu){% end %} | \\(O(d)\\) | 20 bytes | {% katex() %}\lambda_{\text{reg}} + \rho(\mathbf{J}_w) < 1{% end %} |
| Ensemble | {% katex() %}\max(P_i) + \delta_{\text{ensemble}}{% end %} | {% katex() %}1 - \prod(1-R_i){% end %} | {% katex() %}O(\sum C_i){% end %} | 376 bytes | Component-wise drift checks |

**Utility improvement of autoencoder over EWMA**: The net utility gain \\(\Delta U\\) decomposes into a precision improvement term (joint detection catches more true positives per alarm) minus a recall-reciprocal term penalizing the relative miss rate of each detector weighted by the false-negative cost {% katex() %}C_{\text{FN}}{% end %}.

{% katex(block=true) %}
\Delta U = U_{\text{AE}} - U_{\text{EWMA}} = (P_{\text{AE}} - P_{\text{EWMA}}) \cdot V_{\text{TP}} - (R_{\text{AE}}^{-1} - R_{\text{EWMA}}^{-1}) \cdot C_{\text{FN}}
{% end %}

{% katex() %}\text{sign}(\Delta U) > 0{% end %} when {% katex() %}\epsilon_{\text{joint}} < \epsilon_{\text{marginal}}{% end %}: autoencoder captures correlated deviations (e.g., simultaneous small shifts in engine temp, oil pressure, RPM) that per-sensor EWMA misses because joint anomaly probability exceeds the product of marginal probabilities.

**Tiny Neural Network for Failure Classification**

Beyond detection, classification identifies *which* failure mode is occurring. The formula below gives the probability distribution over failure classes produced by a two-layer network: weights \\(W_1, b_1\\) map the anomaly feature vector \\(x\\) to a hidden layer, \\(W_2, b_2\\) map to class logits, and softmax normalizes these into a probability vector summing to 1.

{% katex(block=true) %}
P(\text{failure\_type} | \text{anomaly\_vector}) = \text{softmax}(W_2 \cdot \text{ReLU}(W_1 \cdot x + b_1) + b_2)
{% end %}

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} failure classifier**:
- Input: 8-dimensional anomaly feature vector (motor currents, IMU residuals, GPS error, battery voltage deviation)
- Architecture: {% katex() %}8 \to 6 \to 5{% end %} classes (motor degradation, sensor drift, communication fault, power issue, unknown)
- Parameters: {% katex() %}8\times6 + 6\times5 = 78{% end %} weights = **78 bytes** INT8

**Classification accuracy bound**: The bound below gives the minimum guaranteed classification accuracy as a function of the number of classes \\(K\\), the VC dimension of the hidden layer {% katex() %}\text{VC}(h){% end %}, the training sample count \\(n\\), and the confidence parameter \\(\delta\\).

{% katex(block=true) %}
\text{Accuracy} \geq 1 - \frac{K \cdot \text{VC}(h)}{n} - \sqrt{\frac{\ln(1/\delta)}{2n}}
{% end %}

For sufficient training samples (\\(n > 100 \cdot K\\)) and well-separated failure modes, the lower bound exceeds \\(0.9\\).

> **Diagnosis-to-action mapping.** Classification without a prescribed response is observational theater. Each fault class maps directly to a prescribed autonomic action; without this mapping, the classifier is inert.

**Fault class to autonomic action.** Priority order for simultaneous faults: Power issue > Communication fault > Motor degradation > Sensor drift > Unknown. The highest-priority fault's prescribed action governs the current MAPE-K tick; lower-severity actions are deferred to the next tick, preventing action thrashing.

| Fault class | Immediate action | Autonomic consequence |
|-------------|-----------------|----------------------|
| Motor degradation | Reduce mission authority | Fall back to L2 heartbeat-only behavior |
| Sensor drift | Reweight sensor to 50% confidence in aggregation | Escalate gossip priority for this metric |
| Communication fault | Increase retry window for peer contacts | Assume local isolation; do not propagate stale data |
| Power issue | Trigger load shedding ({% term(url="@/blog/2026-01-29/index.md#def-44", def="Healing Action Severity: ordinal scale classifying healing actions by resource cost and mission disruption, used to select minimum-impact interventions first") %}Definition 44{% end %}) | Enter L1 capability level |
| Unknown | Enter Safety Mode ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}) | Freeze actuator outputs; await self-test pass on two consecutive MAPE-K ticks |
| Multiple faults simultaneously | Apply highest-severity action above; defer lower-severity actions to next tick | Priority order as above |

> Safety Mode entry (Unknown fault class) persists until two consecutive MAPE-K ticks pass with all signals within normal thresholds and no new anomalies detected ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}, [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-53)).

**One-Class SVM for Novelty Detection**

When anomalies are rare and diverse, one-class SVM learns the boundary of normal behavior. The objective below finds the weight vector \\(w\\) and margin \\(\rho\\) that enclose the training data as tightly as possible, with the hyperparameter \\(\nu \in (0,1)\\) bounding the fraction of training points allowed outside the boundary and \\(\phi(x_i)\\) the feature mapping for point \\(x_i\\).

{% katex(block=true) %}
\min_{w, \rho} \frac{1}{2}\|w\|^2 - \rho + \frac{1}{\nu n} \sum_{i=1}^{n} \max(0, \rho - w^T \phi(x_i))
{% end %}

For edge deployment, use **linear kernel** with explicit feature mapping. The feature vector \\(\phi(x)\\) below summarizes a raw observation \\(x\\) into five scalars derived from the running EWMA statistics, trend estimate, CUSUM accumulator, and nearest-neighbor cross-correlation.

{% katex(block=true) %}
\phi(x) = [\mu_{\text{EWMA}}, \sigma_{\text{EWMA}}, \text{trend}, \text{cusum}, \text{cross\_corr}]
{% end %}

This 5-dimensional feature space captures statistical summaries, enabling efficient linear SVM:
- Training: Offline on normal data
- Inference: Single dot product = **<0.01ms**
- Memory: 5 support vector weights = **20 bytes** (float32)

**Drift-aware weight update**: Under non-stationary conditions, the distribution of "normal" shifts over time. Without regularization, weights drift toward the current distribution and lose generalization across connectivity regimes. The regularized gradient penalizes deviation from the baseline weight vector \\(w_0\\) calibrated on clean training data:

{% katex(block=true) %}
\nabla_w \mathcal{L}_{\text{reg}} = \frac{\partial \mathcal{L}}{\partial w} + \lambda_{\text{reg}} \cdot (w_t - w_0)
{% end %}

where {% katex() %}\lambda_{\text{reg}} = \alpha \cdot \|x_t - x_{t-1}\|^2{% end %} scales with local input variation as an edge-practical proxy for distributional shift. (This is a point-to-point heuristic; a sliding-window variance estimate is more robust when compute permits.)

**Jacobian stability check**: Define the weight update map {% katex() %}\Phi: w_{t-1} \mapsto w_t = w_{t-1} - \eta \nabla_w \mathcal{L}_{\text{reg}}(w_{t-1}){% end %}. Its Jacobian is {% katex() %}\mathbf{J}_w = I - \eta H_{\text{reg}}{% end %}, where {% katex() %}H_{\text{reg}} = \partial^2\mathcal{L}/\partial w^2 + \lambda_{\text{reg}} I{% end %} is the regularized Hessian. The autonomic layer becomes a noise generator when the spectral radius exceeds 1:

{% katex(block=true) %}
\rho(\mathbf{J}_w) = \max_i \lvert\lambda_i(\mathbf{J}_w)\rvert = \max_i \lvert 1 - \eta\,\lambda_i(H_{\text{reg}})\rvert < 1
{% end %}

*(Notation: \\(\\rho(\\cdot)\\) here denotes spectral radius. This is distinct from the SVM margin hyperparameter \\(\\rho\\) in the one-class SVM objective, from the {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} observation-age tracker \\(\\rho_i[j]\\) used in the staleness model, and from the per-source critical-message rate ceiling {% katex() %}\rho_{\text{max}}{% end %} in the anti-flood protocol. Subscripts and function notation differentiate the four in all occurrences. For \\(\\lambda\\) disambiguation — gossip contact rate, Weibull scale, L2 regularization, distributional shift, eigenvalue, and shadow price — see the \\(\\lambda\\) notation legend in the Notation note above.)*

If {% katex() %}\rho(\mathbf{J}_w) > 1 + \varepsilon{% end %}, weights are diverging and the SVM must be recalibrated or reverted to \\(w_0\\). For edge deployment with limited compute, estimate the dominant eigenvalue via power iteration:

{% katex(block=true) %}
\begin{aligned}
v_{k+1} &= \mathbf{J}_w v_k \;/\; \|\mathbf{J}_w v_k\| \\
\rho(\mathbf{J}_w) &\approx v_k^T \mathbf{J}_w v_k
\end{aligned}
{% end %}

Convergence rate is {% katex() %}O(\log(1/\varepsilon)\,/\,\log(\lambda_1/\lambda_2)){% end %}, where {% katex() %}\lambda_1/\lambda_2{% end %} is the dominant spectral gap. For \\(d = 5\\) features with well-separated eigenvalues, typically fewer than 10 iterations.

**Detection rate derivation for {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}**:

For one-class SVM with \\(\nu\\)-parameterization, the fraction of training points outside the boundary is at most \\(\nu\\). Setting \\(\nu = 0.02\\) (the expected anomaly rate), the bounds below give the worst-case false positive rate and the minimum true positive rate as a function of VC dimension {% katex() %}\text{VC}(d){% end %} and training size \\(n\\).

{% katex(block=true) %}
\text{FPR} \leq \nu = 0.02, \quad \text{TPR} \geq 1 - \frac{\text{VC}(d)}{n} \cdot \nu^{-1}
{% end %}

For \\(d=5\\) features and \\(n > 500\\) training samples: {% katex() %}\text{TPR} \geq 0.80{% end %}. The low FPR is critical for battery-constrained sensors where false positives waste power {% katex() %}P_{\text{alert}}{% end %} on unnecessary transmissions.

**Drift detection trigger**: Recalibrate or revert SVM weights when either condition holds:

{% katex(block=true) %}
\rho(\mathbf{J}_w) > 1 + \varepsilon \quad \lor \quad \|w_t - w_{t-1}\| > \delta_{\max}
{% end %}

Typical parameters: \\(\varepsilon = 0.1\\), {% katex() %}\delta_{\max} = 0.5 \cdot \|w_0\|{% end %}. The spectral condition catches divergence before it compounds; the weight-norm condition catches slow persistent drift that Jacobian monitoring alone may miss.

**RFF Extension: Non-Linear Boundary Approximation**

The linear kernel assumption holds when failure modes cluster in linearly separable regions of the 5-dimensional feature space. In practice, bursty RF interference, partial jamming onset, and intermodulation products produce overlapping, non-convex clusters that a flat hyperplane cannot separate. Two drop-in replacements keep the same SRAM footprint.

<span id="def-22"></span>
**Definition 22** (Random Fourier Feature Map). *For the RBF kernel {% katex() %}k(\phi, \psi) = \exp(-\gamma_{\text{rbf}}\|\phi-\psi\|^2){% end %}, a D-dimensional RFF approximation draws offline {% katex() %}W \in \mathbb{R}^{D \times 5}{% end %} with {% katex() %}W_{ji} \sim \mathcal{N}(0, \gamma_{\text{rbf}}){% end %} and {% katex() %}b_j \sim \mathcal{U}[0, 2\pi]{% end %}, then maps each pre-scaled feature vector \\(\phi\\) to:*

{% katex(block=true) %}
z(\phi) = \sqrt{\frac{2}{D}} \begin{bmatrix} \cos(W_1^T \phi + b_1) \\ \vdots \\ \cos(W_D^T \phi + b_D) \end{bmatrix} \in \mathbb{R}^D
{% end %}

*The one-class SVM operates on \\(z(\phi)\\) in place of \\(\phi\\) with the same linear objective (above), yielding decision value {% katex() %}f(\phi) = w^T z(\phi) - \rho{% end %}. By Bochner's theorem, {% katex() %}\mathbb{E}[z(\phi)^T z(\psi)] = k(\phi, \psi){% end %} for all \\(\phi, \psi\\), so a linear classifier in RFF space approximates the full RBF kernel classifier.*

- **D=4 on edge MCU**: W is \\(5 \times 4 = 20\\) Q15 values (40 bytes SRAM); b is 4 Q15 values (8 bytes SRAM); w is 4 Q15 values (8 bytes SRAM). Total working set: **56 bytes** — larger than the 20-byte linear weight budget but well within a 128-byte SRAM block allocation.
- **{% katex() %}\gamma_{\text{rbf}}{% end %} calibration**: {% katex() %}\gamma_{\text{rbf}} = 1/(2\,\hat{\sigma}_\phi^2){% end %} where {% katex() %}\hat{\sigma}_\phi^2{% end %} is the empirical variance of \\(\phi\\) on clean training data; for {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensors, {% katex() %}\gamma_{\text{rbf}} \approx 0.5{% end %}.
- **Alternative — Decision Stump Forest**: When RFF code overhead is unacceptable, five single-threshold stumps — one per \\(\phi_i\\) (threshold: 2 bytes Q15, direction: 1 bit, weight: 1 byte signed = {% katex() %}4\,\text{bytes/stump} \times 5{% end %} = **20 bytes total**) — provide a piecewise-constant boundary with zero trigonometric computation.

<span id="def-23"></span>
**Definition 23** (Q15 Pre-Scaling for RF Feature Dimensions). *Before any classification step, each of the five feature dimensions is normalized to the fixed-point range {% katex() %}[-1, +1]{% end %} using stored per-dimension statistics {% katex() %}\mu_i{% end %} (Q15 mean) and {% katex() %}\texttt{inv3s}_i{% end %} (Q15 encoding of {% katex() %}1/(3\sigma_i){% end %}):*

{% katex(block=true) %}
\phi_i^{(\text{Q15})} = \operatorname{clamp}\!\left(\frac{x_i - \mu_i}{3\,\sigma_i},\;-1,\;+1\right) \times 32767
{% end %}

*All subsequent arithmetic — RFF projection, dot product, confidence comparison — operates on 16-bit signed integers. No floating-point unit is required.*

- **Why Q15**: One 16-bit multiply + arithmetic right-shift in ARM Thumb-2 = two instructions. Division by {% katex() %}3\sigma_i{% end %} is precomputed as {% katex() %}\texttt{inv3s}[i]{% end %} at calibration time; inference is multiply-shift only.
- **Storage**: {% katex() %}\mu[5]{% end %} + {% katex() %}\texttt{inv3s}[5]{% end %} = 20 bytes — may reside in flash (read-only) to leave SRAM for working buffers.
- **Separability gain**: The 3-sigma clamp concentrates 99.7% of normal-condition samples across the full {% katex() %}[-1, +1]{% end %} dynamic range, pushing anomalous samples to the rail and increasing the margin for both the linear and RFF classifiers without touching training data.

**Confidence Gate and Safety Mode Fallthrough**

The decision value {% katex() %}f(\phi) = w^T z(\phi) - \rho{% end %} is a signed margin distance. On ambiguous RF conditions — partial jamming onset, marginal connectivity, sensor degradation — the value may be non-negative but small, indicating a boundary-straddling sample. Acting on an inconclusive score risks both false positives (wasted power on spurious transmissions) and false negatives (missed threat transitions).

*Fallthrough rule*: The Q15 integer equivalent of a 0.6 confidence threshold is {% katex() %}\lfloor 0.6 \times 32767 \rfloor = 19660{% end %}. When the scaled decision value falls below this gate:

1. **Do not act** on the current classification — treat as inconclusive.
2. **Enter Safety Mode**: freeze actuator outputs at their last confirmed-safe state; reduce MAPE-K to the minimum viable tick rate ({% term(url="@/blog/2026-01-29/index.md#def-52", def="Observation Regime Schedule: adaptive polling schedule reducing sensor sampling rate as battery drops, extending the survivable observation window") %}Definition 52{% end %}); suppress non-critical radio transmissions.
3. **Re-evaluate** after one refractory window ({% term(url="@/blog/2026-01-29/index.md#def-46", def="Healing Dead-Band and Refractory State: dual-threshold mechanism preventing the healing loop from issuing back-to-back actions faster than the refractory period") %}Definition 46{% end %}): if the confidence gate is passed on two consecutive ticks, resume normal operation; otherwise escalate to the Terminal Safety State ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}).

*If the confidence gate has not cleared within \\(N_\\text{ref,max} = 5\\) consecutive refractory cycles, the node elevates to the lowest-cost available safe posture locally: it freezes its anomaly classifier outputs (returning only the last known classification), logs a stale-output flag in its health vector, and defers escalation to the Terminal Safety State ({% term(url="@/blog/2026-01-29/index.md#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}, [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-53)) until the next connectivity window. This local dwell bound prevents indefinite Safety Mode persistence during prolonged partitions.*

Wall-clock maximum: regardless of connectivity state, if the node has been in Safety Mode for longer than {% katex() %}T_\text{safe,max} = 4 \times T_\text{quarantine,max}{% end %} (default: 4 hours), it must declare a local emergency state and freeze all outputs at their last known-good values pending connectivity recovery or manual intervention. This prevents indefinite Safety Mode persistence during multi-hour denied-regime partitions.

**Emergency state operational behavior.** Once a node enters the local emergency state, four behaviors engage unconditionally:

1. **L0 heartbeat continues.** The physical-layer heartbeat (L0 watchdog ping) is never suspended, even in emergency state. A silent node is indistinguishable from a dead node; the heartbeat allows the fleet to distinguish "alive but isolated" from "failed."
2. **Actuator outputs are frozen.** All actuator command outputs hold at the last confirmed-safe value. No new classifications, setpoints, or control actions are issued until the state is exited. Outputs marked stale-output in the health vector remain frozen.
3. **Distress beacon transmitted once per \\(T_\text{quarantine}\\).** A compact distress packet (node ID, \\(T_\text{acc}\\), last health score) is broadcast on every available radio channel at the start of each quarantine interval. The beacon is rate-limited to prevent collapsing the bandwidth budget during fleet-wide emergencies.
4. **State exits on connectivity recovery or operator override.** The emergency state clears automatically when the connectivity regime returns to *degraded* or *connected* (i.e., \\(T_\text{acc}\\) resets) or when an authenticated operator override is received. On exit, the node resumes the normal MAPE-K loop from its frozen state — not from the initial baseline — and applies the reconnection recovery rule for \\(\theta^*(t)\\).

The 0.6 threshold is calibrated empirically: at \\(\nu = 0.02\\) and \\(n > 500\\) training samples, the margin distribution of normal samples has a median near 0.85 in the normalized scale; 0.6 sits two standard deviations below the median, catching genuine boundary straddlers while passing well-separated normal readings.

**RFF Inference Pipeline: Code Budget Verification**

The three sequential stages — pre-scale, RFF projection, and classification with confidence gate — occupy fewer than 150 bytes of compiled ARM Thumb-2 code. The budget is verified by enumerating the dominant instruction patterns per stage.

| Stage | Algorithm | Thumb-2 instructions | Code budget |
| :--- | :--- | :--- | :--- |
| Pre-scale (Definition 23) | 5 Q15 multiply-shifts followed by saturating clamp to \\([-32767, +32767]\\) | \\(\approx 10\\) | 20 B |
| RFF projection (Definition 22) | 4 inner products \\(W_j^T \varphi + b_j\\) (Q15 multiply-accumulate, 5 terms each); 16-entry symmetric cosine LUT with 2-bit quadrant sign flip | \\(\approx 28\\) | 56 B |
| Classify + confidence gate | Inner product \\(w_{\mathrm{svm}}^T z\\) (Q15, 4 terms); compare to 19660 (\\(\lfloor 0.6 \times 32767 \rfloor\\)); tail-call to Safety Mode if below gate | \\(\approx 30\\) | 60 B |
| **Total** | | **\\(\approx 68\\)** | **136 B — below the 150 B target** |

Stack during classification (freed on return): 5 pre-scaled Q15 values \\(\varphi[5]\\) = 10 B plus 4 RFF features \\(z[4]\\) = 8 B = **18 B stack**. The Safety Mode call is a tail-call with no additional frame. Non-stack SRAM (parameters W, b, w\_svm, cosine LUT) totals 72 B and may reside in flash read-only data.

*Implementation notes*: (i) `cos_lut[16]` holds one symmetric quarter-period of cosine in Q15 (values from cos(0)=32767 down to cos(\\(\pi/2\\))=0); full-period wrapping uses bits 14–79 of the index for sign. The maximum LUT approximation error is {% katex() %}|\cos(\pi/32)-\cos(0)| \approx 0.005{% end %}, well above Q15 quantization noise ({% katex() %}1/32768 \approx 3 \times 10^{-5}{% end %}) but negligible for anomaly detection where margin differences of {% katex() %}\gg 0.01{% end %} drive classification. (ii) `enter_safety_mode()` is a tail-call and does not add to the classification code budget. (iii) Instruction counts assume ARM Cortex-M0+ (no single-cycle 32-bit multiply); Cortex-M4 is cheaper by roughly 30% due to the hardware MAC unit in `rff_map`.

**Temporal Convolutional Network (TCN) for Sequence Anomalies**

Some anomalies are only visible in temporal patterns - normal individual readings but abnormal sequences. The diagram below shows the tiny TCN architecture: three dilated Conv1D layers with exponentially increasing dilation rates (1, 2, 4) extend the receptive field to 15 timesteps without adding parameters, followed by global average pooling and a sigmoid output that produces an anomaly probability.

{% mermaid() %}
graph LR
    subgraph "Dilated Convolutions"
        C1["Conv1D<br/>k=3, d=1<br/>8 filters"]
        C2["Conv1D<br/>k=3, d=2<br/>8 filters"]
        C3["Conv1D<br/>k=3, d=4<br/>4 filters"]
    end

    subgraph "Output"
        P["GlobalAvgPool"]
        O["Dense 1<br/>Sigmoid"]
    end

    I["Input<br/>32 timesteps<br/>4 channels"] --> C1 --> C2 --> C3 --> P --> O

    style C1 fill:#e8f5e9,stroke:#388e3c
    style C2 fill:#e8f5e9,stroke:#388e3c
    style C3 fill:#e8f5e9,stroke:#388e3c
{% end %}

> **Read the diagram**: A 32-timestep window of 4 sensor channels enters from the left. Three dilated convolution layers process it with increasing gaps between positions (dilation 1, 2, 4), letting each layer see longer temporal context without adding parameters — the receptive field grows to 15 timesteps at no extra cost. Global average pooling collapses the temporal dimension into a single summary vector; the final sigmoid outputs an anomaly probability between 0 and 1.

**Specification**:
- Input: \\(32\\) timesteps \\(\times 4\\) channels (160 samples at 5Hz)
- Receptive field: \\(1 + 2\times(1+2+4) = 15\\) timesteps (3 seconds)
- Parameters: **388 bytes**
- Input buffer: **128 bytes** (ring buffer, reused)
- Total footprint: **~520 bytes** (parameters + buffer)
- Inference: **<1ms** on Cortex-M4

**Energy feasibility on {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}**: {% term(url="@/blog/2026-01-15/index.md#def-2", def="Energy-per-Decision Metric: total energy cost combines compute and transmit costs; one radio packet costs roughly one thousand times a local compute operation") %}Definition 2{% end %} establishes local dominance when \\(n_c < T_s/T_d\\). For the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} platform (\\(T_d = 50\\,\mu\text{J}\\), {% katex() %}T_s = 5\,\text{mJ}{% end %}) the threshold is \\(n_c < 100\\) inference passes. The TCN uses \\(n_c = 1\\) — one forward pass per anomaly check — and the 9,000 internal MACs determine the *cost of that pass*, not the value of \\(n_c\\). At approximately 5 nJ per MAC on a Cortex-M4, one TCN inference costs {% katex() %}E_{\text{TCN}} \approx 9000 \times 5\,\text{nJ} = 45\,\mu\text{J}{% end %}. The energy ratio versus a single radio transmission is:

{% katex(block=true) %}
\frac{E_{\text{TCN}}}{T_s} = \frac{9000 \cdot e_{\text{MAC}}}{T_s} \approx \frac{45\,\mu\text{J}}{5\,\text{mJ}} = 0.009 \ll 1
{% end %}

Running at 5 Hz, the continuous inference power is {% katex() %}45\,\mu\text{J} \times 5\,\text{Hz} = 225\,\mu\text{W}{% end %}. Avoiding a single unnecessary radio transmission (5 mJ) recovers 22 seconds of continuous inference — a favorable exchange whenever detection accuracy suppresses even one spurious transmission per 22-second window.

**Energy-adaptive scheduling**: For deployments where the energy margin is tighter than the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} reference, scale anomaly detection frequency with the [connectivity regime](@/blog/2026-01-15/index.md#def-6). The radio-savings justification weakens as connectivity degrades; inference frequency should follow:

| Regime | Detection rate | Primary method | Energy logic |
| :--- | :--- | :--- | :--- |
| Connected (\\(C \approx 1.0\\)) | 5 Hz | TCN ensemble | Radio available as fallback; ML precision maximizes detection quality |
| Degraded (\\(C \approx 0.5\\)) | 1 Hz | TCN + EWMA | Reduced inference budget; EWMA fills inter-TCN intervals |
| Intermittent (\\(C \approx 0.25\\)) | 0.2 Hz | EWMA + CUSUM | Conserve for mission-critical windows only |
| None (\\(C = 0\\)) | On-demand | CUSUM only | Minimal power; inference triggers only when CUSUM threshold is crossed |

This schedule keeps {% katex() %}E_{\text{TCN}}/T_s < 1{% end %} across all connectivity states by reducing inference frequency proportionally with the radio-savings justification.

**Application**: {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} motor {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %}. Individual current readings appear normal, but the temporal signature of a failing bearing shows characteristic oscillation.

**Utility improvement of TCN over EWMA**: The formula expresses the gain entirely as a recall improvement — since both models produce the same value per true positive, the difference is how many additional anomalies the TCN catches by exploiting temporal context that the per-sample EWMA cannot see.

{% katex(block=true) %}
\Delta U_{\text{TCN}} = U_{\text{TCN}} - U_{\text{EWMA}} = (R_{\text{TCN}} - R_{\text{EWMA}}) \cdot V_{\text{detect}}
{% end %}

TCN's receptive field (15 timesteps) captures oscillation patterns with period \\(T \leq 15/f_s\\). EWMA operates per-sample without temporal context. For anomalies where {% katex() %}P(\text{anomaly} | x_{t-k:t}) > P(\text{anomaly} | x_t){% end %}, TCN achieves higher recall by design: {% katex() %}R_{\text{TCN}} / R_{\text{EWMA}} \approx T_{\text{pattern}} / T_{\text{sample}}{% end %}.

**Model Ensemble Strategy**

Production edge systems combine multiple models into a single weighted anomaly score. The formula below is a linear combination of the four individual model scores — EWMA z-score, autoencoder reconstruction error, TCN output, and one-class SVM decision value — with weights \\(w_i\\) that balance each detector's contribution.

{% katex(block=true) %}
\text{FinalScore} = w_1 \cdot z_{\text{EWMA}} + w_2 \cdot s_{\text{AE}} + w_3 \cdot s_{\text{TCN}} + w_4 \cdot s_{\text{OCSVM}}
{% end %}

The table below shows the weights learned via logistic regression on validation anomalies, together with the rationale for each model's relative contribution.

| Model | Weight | Rationale |
| :--- | ---: | :--- |
| EWMA | 0.25 | Fast, catches obvious anomalies |
| Autoencoder | 0.35 | Catches multivariate correlations |
| TCN | 0.25 | Catches temporal patterns |
| One-class SVM | 0.15 | Catches novel out-of-distribution |

**Ensemble utility derivation**:

For \\(K\\) independent models with per-model recall \\(R_i\\), the ensemble recall under the union rule is strictly at least as high as the best individual model's recall, because a true anomaly is detected if *any* model flags it.

{% katex(block=true) %}
R_{\text{ensemble}} = 1 - \prod_{i=1}^{K}(1 - R_i) \geq \max_i R_i
{% end %}

**Utility improvement**: The net gain from using the ensemble over the single best model equals the additional recall it achieves multiplied by the detection value, minus the overhead cost of running multiple models.

{% katex(block=true) %}
\Delta U_{\text{ensemble}} = (R_{\text{ensemble}} - \max_i R_i) \cdot V_{\text{detect}} - C_{\text{overhead}}
{% end %}

{% katex() %}\text{sign}(\Delta U) > 0{% end %} when models detect different anomaly subsets (low {% katex() %}\rho_{ij}{% end %} correlation). For \\(K=4\\) models with \\(R_i \approx 0.8\\) and {% katex() %}\rho_{ij} < 0.5{% end %}: {% katex() %}R_{\text{ensemble}} \geq 0.92{% end %}.

**Model Update and Drift Management**

Edge models degrade as operating conditions change. Detecting and managing model drift:

**Drift indicators**:
1. **Reconstruction error baseline shift**: If mean reconstruction error increases >20% over 7 days, model may be stale
2. **False positive rate increase**: Tracked via operator feedback loop
3. **Confidence calibration**: Predicted probabilities should match empirical rates

**Update strategies**: The table orders four responses by increasing intervention severity; the Connectivity Required column is the key constraint — the first two strategies work entirely offline, while the last requires a connected interval.

| Strategy | Trigger | Method | Connectivity Required |
| :--- | :--- | :--- | :--- |
| Threshold adjustment | FP rate >5% | Local recalibration | None |
| Incremental update | Drift detected | Online gradient step | None |
| Full retrain | Major drift | Federated learning | Intermittent |
| Model replacement | Architecture obsolete | OTA update | Connected |

**Drift handling strategy derivation**:

When covariate shift occurs ({% katex() %}P_{\text{deploy}}(X) \neq P_{\text{train}}(X){% end %}), detection accuracy degrades exponentially with the KL-divergence between deployment and training distributions, as shown below; {% katex() %}\xi_{\text{shift}}{% end %} is the sensitivity of the particular model to distributional shift.

{% katex(block=true) %}
\text{Accuracy}(t) = \text{Accuracy}_0 \cdot e^{-\xi_{\text{shift}} \cdot D_{KL}(P_{\text{deploy}} \| P_{\text{train}})}
{% end %}

Local threshold adjustment (recomputing \\(\theta\\) from recent \\(X\\)) restores accuracy when \\(P(Y|X)\\) is unchanged. Full retraining required when \\(P(Y|X)\\) shifts.

> **Cognitive Map**: Local anomaly detection scales from a 2-line EWMA update (constant time, constant memory) through CUSUM (optimal for step changes and sustained drift), Kalman adaptive baselines (optimal when the "normal" baseline itself evolves), and ML ensembles (optimal for correlated multi-sensor faults that no single-sensor method catches). The threshold \\(\theta^\*\\) is not a fixed value — it tightens automatically as partition age grows, and has a hard lower bound at the stability-region guard band \\(\delta_q\\). Every algorithm in this section fits in under 1 KB and runs on a microcontroller. Next: gossip protocols aggregate these local health scores across the fleet without any central coordinator.

---

## Distributed Health Inference

Phase-0 attestation is the initial fleet commissioning window — a bounded interval during which every node registers its identity, public key, and baseline health metrics with its direct neighbors before any autonomous operation begins. Attestation records established in Phase-0 serve as the trust root for subsequent Byzantine detection and ejection decisions.

### Gossip-Based Health Propagation

**Problem**: Individual nodes detect local anomalies, but acting on fleet-wide health — assigning healing tasks, routing around failed nodes, rebalancing load — requires every node to know every other node's status. A central health server is the obvious solution and the first casualty of a partition.

**Solution**: Gossip protocol. Each node periodically picks a random neighbor and swaps health vectors. Information spreads like an epidemic — logarithmically fast in the number of nodes, without any coordinator.

**Trade-off**: Gossip is bandwidth-efficient and partition-tolerant, but convergence takes {% katex() %}O(D \ln n / \lambda){% end %} seconds in sparse contested meshes ({% term(url="#prop-13", def="Gossip Convergence on Lossy Sparse Mesh: convergence time bound for gossip when packet loss stays below fifty percent; degrades gracefully with increasing loss") %}Proposition 13{% end %}), which can be minutes — not the 10-second guarantee the simpler {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %} formula implies. Size the gossip rate and fleet architecture for the *actual* mesh, not the fully-connected assumption.

Individual nodes detect local anomalies. Fleet-wide health requires aggregation without a central coordinator.

> **Scope note — H\\(^\\text{fleet}\\) vs H\\(^\\text{node}\\)**: The fleet health vector {% katex() %}\mathbf{H}^\text{fleet} = [h_1, \ldots, h_n] \in [0,1]^n{% end %} in this definition is indexed over the \\(n\\) *nodes* in the fleet — distinct from the per-component \\(\\mathbf{H}^\\text{node}(t)\\) in *Why Edge Is Not Cloud Minus Bandwidth*, which is indexed over the subsystems within a single node (antenna, battery, CPU, etc.). For RAVEN: \\(\\mathbf{H}^\\text{fleet}\\) has 47 elements; \\(\\mathbf{H}^\\text{node}(t)\\) has 6 elements. Do not confuse these when sizing gossip payloads or CRDT health-state records.

<span id="def-24"></span>
**Definition 24** ({% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} Health Protocol). *A {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} health protocol is a tuple \\((\mathbf{H}, f_g, M, T)\\) where {{ cite(ref="1", title="Demers et al. (1987) — Epidemic Algorithms for Replicated Database Maintenance") }}:*
- *{% katex() %}\mathbf{H}^{\text{fleet}} = [h_1, \ldots, h_n] \in [0,1]^n{% end %} is the fleet-wide health vector indexed over \\(n\\) nodes (distinct from the per-component {% katex() %}\mathbf{H}^{\text{node}}(t){% end %} vector in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md), which is indexed over subsystems within a single node)*
- *\\(f_g > 0\\) is the {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate (exchanges per second per node)*
- *{% katex() %}M: [0,1]^n \times [0,1]^n \rightarrow [0,1]^n{% end %} is the merge function*
- *{% katex() %}T: \mathbb{R}^+ \rightarrow \mathbb{R}^+{% end %} is the {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} decay function*

In other words, every node keeps a score between 0 and 1 for each fleet member, periodically swaps that list with a random neighbor, and combines the two copies using a merge rule that discounts older entries via the {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} function \\(T\\).

> **Algebraic contract on M.** For gossip to converge regardless of message ordering, the merge function must be commutative, associative, and idempotent. Simple averaging and last-write-wins both fail at least one property under out-of-order delivery — verify your implementation before deployment.

**Required properties of the merge function M.** Conservative merge \\(M(h_a, h_b) = \max(h_a, h_b)\\) satisfies all three. Staleness-weighted blend {% katex() %}M_\tau(h_a, h_b) = (w_a h_a + w_b h_b)/(w_a + w_b){% end %} with {% katex() %}w_i = e^{-\gamma_s \tau_i}{% end %} is idempotent only when both observations carry equal staleness weights.

| Property | Formal requirement | Why it matters |
|----------|--------------------|----------------|
| **Commutativity** | \\(M(H_a, H_b) = M(H_b, H_a)\\) | Node A merging B's view must reach the same result as B merging A's |
| **Associativity** | \\(M(H_a, M(H_b, H_c)) = M(M(H_a, H_b), H_c)\\) | Three messages that cross mid-network resolve to the same state regardless of arrival order |
| **Idempotence** | \\(M(H, H) = H\\) | Duplicate messages from gossip fan-out do not shift the estimate |

**Metadata overhead analysis.** Each gossip packet carries two mandatory overhead fields: a Unified Autonomic Header (UAH, ~20 bytes, constant per packet) and a Dotted Version Vector (DVV, ~2 bytes × N nodes, scaling with fleet size). For RAVEN (N = 47), total overhead is ~114 bytes; a 10-byte temperature payload achieves only ~8% protocol efficiency. For OUTPOST (N = 127), efficiency drops to ~4%.

> **DVV scaling warning.** Above N ≈ 100, the DVV alone can exceed LoRaWAN/BLE MTUs (≤ 255 bytes). Evaluate Bloom-clock or epoch-scoped DVV when fleet size N > 100 and typical health payload size < 20 bytes. The autonomic detection logic is independent of this choice; the overhead affects *transport*, not *detection*.

**DVV strategy comparison.**

| Strategy | DVV size | Trade-off |
|----------|---------|-----------|
| Full DVV | 2N bytes | Exact causal ordering; impractical above N \\(\\approx\\) 100 |
| Bloom-clock (probabilistic) | 16–80 bytes fixed | 0.1–5% false-positive causal violation rate |
| Epoch-scoped DVV (partition-local) | \\(2 \\times K\\) bytes (K = partition subgroup size) | Exact within partition; requires epoch reconciliation on reconnect |

<span id="def-proxy-observer"></span>
<span id="def-36"></span>

**Definition 36** (Synthetic Observability — Proxy-Observer). *For {% katex() %}\mathcal{L}_0{% end %}-incompatible hardware without native health APIs, define the proxy health signal:*

{% katex(block=true) %}
H_{\text{proxy}}(t) = w_I \cdot I_{\text{norm}}(t) + w_V \cdot V_{\text{norm}}(t) + w_H \cdot H_{\text{norm}}(t)
{% end %}

*where:*
- {% katex() %}I_{\text{norm}}(t) = \operatorname{clamp}\!\left(\frac{\text{current\_draw}(t) - I_{\min}}{I_{\max} - I_{\min}},\, 0,\, 1\right){% end %} — normalized current draw (0 = overcurrent/short, 1 = nominal)
- {% katex() %}V_{\text{norm}}(t) = 1 - \operatorname{clamp}\!\left(\frac{\text{vibration}(t)}{V_{\max}},\, 0,\, 1\right){% end %} — inverted vibration index (0 = excessive, 1 = nominal)
- {% katex() %}H_{\text{norm}}(t) = e^{-t_{\text{silence}} / T_{\text{heartbeat}}}{% end %} — heartbeat freshness (decays exponentially with silence duration {% katex() %}t_{\text{silence}}{% end %})
- \\(w_I + w_V + w_H = 1\\), with defaults {% katex() %}w_I = 0.5,\, w_V = 0.3,\, w_H = 0.2{% end %}

*The proxy confidence bound is {% katex() %}C_{\text{proxy}}(t) = 1 - \sigma_{\text{proxy}} / H_{\text{proxy}}(t){% end %} where {% katex() %}\sigma_{\text{proxy}}{% end %} is estimated from calibration measurements. The legacy device is admitted to the autonomic fleet when {% katex() %}C_{\text{proxy}}(t) \geq C_{\text{threshold}}{% end %} and {% katex() %}H_{\text{proxy}}(t) \geq H_{\min}{% end %}, establishing Phase 0 (Hardware Trust) without requiring a native self-health API.*

*Typical deployments: Modbus RTU sensors, Serial/RS-485 actuators, GPIO-only embedded controllers. Current draw and heartbeat timeout are available from virtually any embedded device; vibration is optional and replaced by {% katex() %}H_{\text{norm}}{% end %} doubling its weight if absent.*

The protocol operates in rounds:
1. **Local update**: Node \\(i\\) updates \\(h_i\\) based on local {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %}
2. **Peer selection**: Node \\(i\\) selects random peer \\(j\\)
3. **Exchange**: Nodes \\(i\\) and \\(j\\) exchange health vectors
4. **Merge**: Each node merges received vector with local knowledge

The diagram below illustrates a single {% term(url="#def-24", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} exchange: before the exchange each node holds only its own health vector, and after the merge both nodes hold the combined view of the pair.

{% mermaid() %}
graph LR
    subgraph Before Exchange
    A1["Node A: H_A"] -.->|"sends H_A"| B1["Node B: H_B"]
    B1 -.->|"sends H_B"| A1
    end
    subgraph After Merge
    A2["Node A: merge(H_A, H_B)"]
    B2["Node B: merge(H_A, H_B)"]
    end
    A1 --> A2
    B1 --> B2

    style A1 fill:#e8f5e9
    style B1 fill:#e3f2fd
    style A2 fill:#c8e6c9
    style B2 fill:#bbdefb
{% end %}

> **Read the diagram**: Before the exchange (left), Node A knows only its own health and Node B knows only its own. Both send their full vector to the other. After the merge (right), both nodes hold the union of what either knew — each exchange doubles the amount of current knowledge held at each endpoint. Repeat this across the fleet and health propagates like an epidemic.

The merge function must handle:
- **Staleness**: Older observations are less reliable
- **Conflicts**: Different nodes may observe different values
- **Adversarial injection**: Compromised nodes may inject false health values

The merge function combines two health estimates for node \\(k\\) into a single value by taking a trust-weighted average, where each source's weight \\(w\\) reflects how recently its observation was made.

{% katex(block=true) %}
h_k^{\text{merged}} = \frac{w_A \cdot h_k^A + w_B \cdot h_k^B}{w_A + w_B}
{% end %}

> **Physical translation**: When two nodes disagree on a third node's health, neither report is simply discarded. Both estimates are blended, with the fresher estimate counting more. A 1-second-old reading outweighs a 30-second-old reading by the ratio of their exponential weights.

The weight assigned to each observation decays exponentially with its staleness \\(\tau_\text{stale}\\) ({% term(url="#def-26", def="Staleness: elapsed time since an observation was made; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}Definition 26{% end %}) at rate \\(\gamma_s\\), so a 10-second-old reading contributes far less than a fresh one.

{% katex(block=true) %}
w = e^{-\gamma_s \tau_{\text{stale}}}
{% end %}

With \\(\tau_\text{stale}\\) as time since observation ({% term(url="#def-26", def="Staleness: elapsed time since an observation was made; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}Definition 26{% end %}) and \\(\gamma_s\\) as decay rate (distinct from the {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate \\(\lambda\\), from {% katex() %}\gamma_{\mathrm{FN}}{% end %} the false-negative cost escalation rate in {% term(url="#prop-9", def="Optimal Anomaly Threshold: minimizes total misclassification cost by balancing false-positive and false-negative penalties") %}Proposition 9{% end %}, and from \\(\gamma\\) in the Holt-Winters equations above where it denotes the seasonal smoothing coefficient).

<span id="prop-12"></span>
**Proposition 12** ({% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} Convergence). *For a {% term(url="#def-24", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip protocol{% end %} with contact rate \\(f_g\\) and \\(n\\) nodes in a fully-connected network (any node can reach any other), the expected time for information originating at one node to reach all nodes is {{ cite(ref="6", title="Kermarrec et al. (2003) — Probabilistic Reliable Dissemination in Large-Scale Systems") }}:*

*The expected time for information to reach all n nodes is \\(O(\\ln n / f_g)\\). For a \\(1 - 1/n\\) high-probability guarantee (via Markov's inequality), plan for {% katex() %}n \cdot O(\ln n / f_g) = O(n \ln n / f_g){% end %}.*

{% katex(block=true) %}
\mathbb{E}[T_{\text{convergence}}] = O\left(\frac{\ln n}{f_g}\right)
{% end %}

> **Physical translation**: Doubling the fleet adds only {% katex() %}\ln 2 / f_g \approx 0.7/f_g{% end %} seconds to convergence — not double the time. At {% katex() %}f_g = 0.2\,\text{Hz}{% end %}, adding 47 drones to a 47-drone swarm adds roughly 3.5 seconds to health convergence, not the 39 seconds a linear model would predict.

In other words, fleet-wide awareness scales only logarithmically with fleet size: doubling the number of nodes adds a fixed {% katex() %}O(\ln 2 / f_g){% end %} seconds to convergence, not a proportional delay.

*For sparse topologies with network diameter \\(D\\), convergence scales as {% katex() %}O(D \cdot \ln n / f_g){% end %} since information must traverse \\(D\\) hops.*

*Proof sketch*: The information spread follows logistic dynamics \\(dI/dt = f_g I(1 - I)\\) where \\(I\\) is the fraction of informed nodes. Solving with initial condition \\(I(0) = 1/n\\) and computing time to reach \\(I = 1 - 1/n\\) yields {% katex() %}T = (2 \ln(n-1))/f_g{% end %}.
**Corollary 2**. *Doubling swarm size adds only {% katex() %}O(\ln 2 / f_g) \approx 0.69/f_g{% end %} seconds to convergence time, making {% term(url="#def-24", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip protocol{% end %}s inherently scalable for edge fleets.*

The lossless fully-connected model of {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %} is a lower bound. Real edge meshes are sparse and contested: {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} operates on a 127-sensor mesh with diameter \\(D \approx 8\\) hops under sustained jamming at {% katex() %}p_{\text{loss}} = 0.35{% end %}. The actual convergence time is not \\(O(\ln n / \lambda)\\) but a function of both topology and loss rate.

> **Empirical status**: The \\(O(\ln n / f_g)\\) bound is a mathematically proven result for fully-connected lossless networks. The {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} figure of adding ~3.5 s for 47 additional drones at \\(f_g = 0.2\\,\text{Hz}\\) is a direct application of the formula, not a measurement. Actual gossip convergence in field deployments depends on radio topology and interference — treat this as a lower bound.

<span id="prop-13"></span>
**Proposition 13** ({% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} Convergence on Lossy Sparse Mesh). *Let \\(G = (V, E)\\) be a connected graph with \\(n\\) nodes and edge conductance:*

*Sparse topology and packet loss slow gossip multiplicatively; the bottleneck is graph conductance, not just fleet size.*

{% katex(block=true) %}
\Phi = \min_{\substack{S \subseteq V \\ 0 < |S| \leq n/2}} \frac{|E(S,\, V \setminus S)|}{|S| \cdot (n - |S|)/n}
{% end %}

*Under push-pull {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} with contact rate \\(f_g\\) and independent per-message loss probability {% katex() %}p_{\text{loss}} \in [0, 1){% end %}, the expected convergence time satisfies:*

{% katex(block=true) %}
\mathbb{E}[T_{\text{convergence}}] \leq \frac{2\ln n}{f_g \cdot (1 - p_{\text{loss}}) \cdot \Phi}
{% end %}

*in expectation. For any connected graph with diameter \\(D\\), the operational bound {% katex() %}\Phi \geq 1/D{% end %} gives:*

{% katex(block=true) %}
\mathbb{E}[T_{\text{convergence}}] \leq \frac{2 D \ln n}{f_g \cdot (1 - p_{\text{loss}})}
{% end %}

*Proof sketch*: Let \\(S_t\\) denote the informed set at {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} round \\(t\\), with \\(|S_t| = k\\). By definition of \\(\Phi\\), the number of boundary edges is at least \\(\Phi \cdot k(n-k)/n\\). Each boundary edge activates — an informed node contacts an uninformed neighbor and the message arrives — with probability {% katex() %}(1-p_{\text{loss}})/\bar{d}{% end %} per round (\\(\bar{d}\\) = average degree). The expected growth satisfies {% katex() %}\mathbb{E}[|S_{t+1}| - |S_t|] \geq (1-p_{\text{loss}}) \cdot \Phi \cdot k(n-k)/n{% end %}.*

*This is the discrete logistic equation with rate {% katex() %}r = (1-p_{\text{loss}})\Phi{% end %}. The logistic ODE solution \\(dI/dt = r \cdot I(1-I)\\) reaches \\(I = 1 - 1/n\\) from \\(I = 1/n\\) in \\(T = (2\ln(n-1))/r\\). Applying \\(\Phi \geq 1/D\\) gives the diameter bound.*

*The bound holds in expectation; the stopping time is a non-negative random variable, so by Markov's inequality {% katex() %}P(T > c \cdot \mathbb{E}[T]) \leq 1/c{% end %}. For operational planning, use {% katex() %}3 \times \mathbb{E}[T_{\text{convergence}}]{% end %} as the minimum safety budget; budget {% katex() %}n \times \mathbb{E}[T_{\text{convergence}}]{% end %} when \\(1-1/n\\) coverage is required. Chernoff-style analysis with bounded increments improves the tail to {% katex() %}\mathbb{E}[T] + O(\sqrt{\mathbb{E}[T] \log n}){% end %}. \\(\square\\)*

**Probability tail caveat — Markov vs. Chernoff.**

Markov's inequality gives {% katex() %}P(T > c \cdot \mathbb{E}[T]) \leq 1/c{% end %} for any non-negative random variable. The \\(1-1/n\\) probability guarantee therefore holds only at \\(c = n\\): the convergence time must be bounded by {% katex() %}n \cdot \mathbb{E}[T]{% end %}, not {% katex() %}\mathbb{E}[T]{% end %} itself.

At the mean {% katex() %}T = \mathbb{E}[T_{\text{convergence}}]{% end %}, Markov guarantees only {% katex() %}P(T \leq \mathbb{E}[T]) \geq 0{% end %} — trivially true but operationally useless for planning.

For a high-probability bound at the \\(O(\ln n / \lambda)\\) scale, the correct tool is a Chernoff or Azuma-Hoeffding concentration inequality applied to the martingale \\(|S_t|/n\\). Under the logistic growth model, convergence time concentrates around the mean with sub-Gaussian tails:

{% katex(block=true) %}
P\!\left(T_{\text{convergence}} > (1 + \delta)\,\mathbb{E}[T]\right) \leq \exp\!\bigl(-\Omega(\delta^2 n)\bigr)
{% end %}

**Practical implication**: budget {% katex() %}3 \times \mathbb{E}[T_{\text{convergence}}]{% end %} as the \\(1-1/n\\) operational target — the factor-3 overhead covers the gap between median convergence time and the high-probability tail. The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration table below uses the correct diameter bound directly; the \\(1-1/n\\) language in the proposition statement should be read as an asymptotic characterization, not a tight guarantee at {% katex() %}\mathbb{E}[T]{% end %}.

**Specializations**:

| Graph topology | \\(\Phi\\) | Expected convergence |
| :--- | :--- | :--- |
| Fully connected, lossless | \\(1\\) | {% katex() %}O(\ln n / f_g){% end %} — recovers Prop 4 |
| \\(k\\)-regular expander, lossless | \\(\Omega(1)\\) | {% katex() %}O(\ln n / f_g){% end %} |
| Grid ({% katex() %}\sqrt{n} \times \sqrt{n}{% end %}), lossless | {% katex() %}\Omega(1/\sqrt{n}){% end %} | {% katex() %}O(\sqrt{n}\ln n / f_g){% end %} |
| OUTPOST mesh (\\(D=8\\), {% katex() %}p_{\text{loss}}=0.35{% end %}) | \\(\geq 1/8\\) | {% katex() %}\leq 2 \cdot 8 \cdot \ln(127)/(f_g \cdot 0.65) \approx 119/f_g\,\text{s}{% end %} |

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration gap**: At {% katex() %}f_g = 0.5\,\text{Hz}{% end %}, {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %} predicts \\(T \approx 9.7\\,\text{s}\\); {% term(url="#prop-13", def="Gossip Convergence on Lossy Sparse Mesh: convergence time bound for gossip when packet loss stays below fifty percent; degrades gracefully with increasing loss") %}Proposition 13{% end %} predicts {% katex() %}T \leq 238\,\text{s} \approx 4\,\text{min}{% end %} under jamming. Designing for 10-second health awareness and receiving 4-minute convergence is a mission-critical gap. The correct design response is to either increase \\(\lambda\\) (higher energy cost from {% term(url="@/blog/2026-01-15/index.md#def-2", def="Energy-per-Decision Metric: total energy cost combines compute and transmit costs; one radio packet costs roughly one thousand times a local compute operation") %}Definition 2{% end %}), decrease \\(D\\) by adding mesh relay nodes, or build decision logic that tolerates 4-minute-stale health data (increasing {% katex() %}\tau_{\max}{% end %} from {% term(url="#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %} accordingly).

> **Physical translation — {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %} vs. {% term(url="#prop-13", def="Gossip Convergence on Lossy Sparse Mesh: convergence time bound for gossip when packet loss stays below fifty percent; degrades gracefully with increasing loss") %}Proposition 13{% end %}.** In a lab environment (full mesh, negligible packet loss), health converges in \\(O(\ln n / f_g)\\) seconds per {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}. In field conditions (contested mesh, jamming, sparse links), convergence is {% katex() %}O(D \cdot \ln n / (\lambda \cdot (1 - p_\text{loss}))){% end %} per {% term(url="#prop-13", def="Gossip Convergence on Lossy Sparse Mesh: convergence time bound for gossip when packet loss stays below fifty percent; degrades gracefully with increasing loss") %}Proposition 13{% end %}, where \\(D\\) is mesh diameter. OUTPOST example: \\(D = 8\\) hops, \\(p_\text{loss} = 0.35\\), \\(\lambda = 0.5\\) Hz transforms {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}'s predicted 9.7 s into {% term(url="#prop-13", def="Gossip Convergence on Lossy Sparse Mesh: convergence time bound for gossip when packet loss stays below fifty percent; degrades gracefully with increasing loss") %}Proposition 13{% end %}'s observed 238 s (4 minutes). **Always use {% term(url="#prop-13", def="Gossip Convergence on Lossy Sparse Mesh: convergence time bound for gossip when packet loss stays below fifty percent; degrades gracefully with increasing loss") %}Proposition 13{% end %} for deployment planning.**

**Corollary 3** (Loss-Rate {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} Budget). *To maintain convergence within target time \\(T^\*\\) under loss probability {% katex() %}p_{\text{loss}}{% end %} on a diameter-\\(D\\) mesh, the minimum {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate is:*

{% katex(block=true) %}
f_g^* \geq \frac{2 D \ln n}{T^* \cdot (1 - p_{\text{loss}})}
{% end %}

**{% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} Rate Selection: Formal Optimization**

**Objective Function**: The formula finds the {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate \\(\lambda^\*\\) that best balances convergence speed (which benefits from higher \\(\lambda\\)) against communication power cost (which scales linearly with \\(\lambda\\)).

{% katex(block=true) %}
f_g^* = \arg\max_{f_g \in [f_{g,\min}, f_{g,\max}]} \left[ -w_1 \cdot T_{\text{converge}}(f_g) - w_2 \cdot P_{\text{comm}}(f_g) \right]
{% end %}

where {% katex() %}T_{\text{converge}}(f_g) = \frac{2 \ln n}{f_g}{% end %} is convergence time and {% katex() %}P_{\text{comm}}(f_g) = f_g \cdot E_{\text{msg}}{% end %} is power consumption.

**Constraint Set**: Three hard limits bound the feasible rate range — the binding constraint (whichever is most restrictive) determines {% katex() %}f_g^*{% end %}.

{% katex(block=true) %}
\begin{aligned}
g_1: && f_g \cdot E_{\text{msg}} &\leq P_{\text{budget}} && \text{(power constraint)} \\
g_2: && f_g \cdot B_{\text{msg}} &\leq B_{\text{available}}(C(t)) && \text{(bandwidth)} \\
g_3: && \frac{2\ln n}{f_g} &\leq \tau_{\text{staleness}}^{\max} && \text{(freshness requirement)}
\end{aligned}
{% end %}

**Optimal Solution**: The formula below takes the minimum of the three per-constraint maximum rates; whichever constraint is most restrictive determines {% katex() %}f_g^*{% end %}, and the other two are automatically satisfied.

{% katex(block=true) %}
f_g^* = \min\left(\frac{P_{\text{budget}}}{E_{\text{msg}}}, \frac{B_{\text{available}}}{B_{\text{msg}}}, \frac{2\ln n}{\tau_{\text{staleness}}^{\max}}\right)
{% end %}

> **Physical translation**: Take the three per-constraint speed limits — the maximum rate your power budget allows, the maximum rate your bandwidth allows, and the minimum rate needed to keep data fresh enough — and pick the smallest. Whichever constraint binds first sets {% katex() %}f_g^*{% end %}; the other two are automatically satisfied.

**State Transition Model**: The rule below describes how a node's {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} either resets to zero (when a fresh {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} exchange occurs, with probability proportional to rate \\(\lambda\\)) or grows by \\(\Delta t\\) when no exchange happens in the current interval.

{% katex(block=true) %}
\tau_{\text{staleness}}(t+1) = \begin{cases}
0 & \text{with probability } 1 - e^{-f_g \cdot \Delta t} \\
\tau_{\text{staleness}}(t) + \Delta t & \text{otherwise}
\end{cases}
{% end %}

For tactical parameters (\\(n \sim 50\\), \\(f_g \sim 0.2\\) Hz), {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %} gives \\(T = 2\ln(49)/0.2 \approx 39\\) seconds - convergence within 30-40 seconds, fast enough to establish fleet-wide health awareness within a single mission phase. Broadcast approaches scale linearly with \\(n\\), which is why {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} wins at scale.

For strategic health reporting scenarios where nodes have incentives to misreport, see below.

> **Empirical status**: The {% term(url="#prop-13", def="Gossip Convergence on Lossy Sparse Mesh: convergence time bound for gossip when packet loss stays below fifty percent; degrades gracefully with increasing loss") %}Proposition 13{% end %} bound {% katex() %}T \leq 2D\ln n / (f_g(1-p_{\text{loss}})){% end %} is analytically derived. The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} values \\(D = 8\\), {% katex() %}p_{\text{loss}} = 0.35{% end %} are scenario parameters, not measured from a deployed system. The "\\(3\\times\\) overhead" recommendation for operational planning is a conservative engineering heuristic, not derived from measured tail distributions in adversarial radio environments.

### Optional: Game-Theoretic Extensions

#### Strategic Health Reporting

The {% term(url="#def-24", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} merge assumes truthful health reporting. Nodes competing for limited healing resources have incentives to under-report health (appear more sick) to attract healing attention.

**Cheap-talk game** (Crawford-Sobel): Node \\(i\\) with true health \\(h_i\\) sends report \\(\hat{h}_i\\). Healing resources are allocated proportional to reported sickness \\(1 - \hat{h}_i\\). If node \\(i\\) values healing resources, the equilibrium report satisfies \\(\hat{h}_i < h_i\\) - systematic under-reporting.

**Crawford-Sobel equilibrium**: With \\(k\\) nodes, reports are only coarsely informative - the equilibrium partitions the health space into \\(k\\) intervals, revealing only which interval each node's health falls in, not the exact value.

**Incentive-compatible allocation**: Replace proportional allocation with a **Groves mechanism** for healing priority: each node reports health and the mechanism allocates healing proportional to the *marginal value of healing* (not reported sickness). Truthful reporting becomes a dominant strategy when the node's healing benefit is fully internalized.

**Practical implication**: Implement comparative health reporting - nodes rank their own health relative to neighbors rather than reporting absolute values. Rank-based reports are harder to manipulate strategically and preserve the ordering needed for healing priority assignment while reducing the incentive for absolute-value inflation.

#### Gossip as a Public Goods Game

The {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate optimization assumes a central planner selects \\(\lambda\\). In an autonomous fleet, each node independently selects its {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate - and {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} is a **public good**: each message costs the sender (power, bandwidth) but benefits all nodes' health awareness.

**Public goods game**: Node \\(i\\) selects rate \\(\lambda_i \geq 0\\). The formula below expresses aggregate health quality \\(Q\\) as a function of the mean {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate {% katex() %}\bar{\lambda}{% end %} across all \\(n\\) nodes, where \\(t\\) is elapsed time; quality rises toward 1 as {% katex() %}\bar{\lambda}{% end %} increases but each individual node bears the full cost of its own transmissions while sharing the benefit equally with all peers.

{% katex(block=true) %}
Q(\boldsymbol{\lambda}) = 1 - e^{-\bar{\lambda} t}, \quad \bar{\lambda} = \frac{1}{n}\sum_i \lambda_i
{% end %}

> **Physical translation**: Fleet health quality is a shared resource that approaches 1 as the average gossip rate rises, but each node pays the full radio and battery cost of its own transmissions while the benefit is split equally among all \\(n\\) nodes. Every selfish node has an incentive to under-gossip and free-ride on neighbors' transmissions — exactly as in a public goods game. The result is a fleet that under-monitors itself in the absence of explicit coordination.

Node \\(i\\) captures only \\(1/n\\) of the benefit of its own {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}. The Nash equilibrium satisfies {% katex() %}\frac{\partial Q}{\partial \lambda_i}\big|_{\text{NE}} = \frac{t}{n} e^{-\bar{\lambda}^{\text{NE}} t} = c_i'(\lambda_i){% end %}, while the social optimum satisfies {% katex() %}t \cdot e^{-\bar{\lambda}^{\text{OPT}} t} = c_i'(\lambda_i){% end %}. Since \\(1/n < 1\\), the comparison below holds and the equilibrium rate falls short of the social optimum.

{% katex(block=true) %}
\bar{\lambda}^{\text{NE}} < \bar{\lambda}^{\text{OPT}}
{% end %}

> **Physical translation**: Left to their own devices, autonomous nodes gossip at \\(1/n\\) of the rate that maximizes fleet health quality. Uncoordinated gossip achieves roughly \\(1/n\\) of the optimal gossip frequency, yielding convergence times approximately \\(n\times\\) longer than a coordinated protocol. For RAVEN (\\(n=47\\)), this means gossip convergence takes roughly \\(47\\times\\) longer than it would under a centrally coordinated schedule — making coordination subsidies economically justified even at significant per-message overhead cost.

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (\\(n = 47\\)), autonomous {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} equilibrium provides approximately \\(1/47\\) of the socially optimal convergence rate.

**VCG mechanism**: A Groves mechanism assigns task-allocation transfers to nodes proportional to their {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} contribution: nodes that {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} more receive fewer computational tasks (reducing effective cost). Under this mechanism, truthful power-budget reporting is a dominant strategy and the social optimum is achieved.

> **Physical translation**: Reward high gossip contributors with lighter computational workloads — the battery cost of extra transmissions is offset by fewer CPU-intensive inference tasks. A node reporting a tight power budget gets fewer gossip assignments but also fewer heavy tasks; reporting a false low battery gains nothing because the coordinator sees through it and assigns proportionally. During the next connected window, these rate targets are distributed fleet-wide and hold through the following partition.

**Practical implication**: During connected intervals, compute {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate assignments centrally and distribute them as target rates. The VCG transfer - differential task assignment - incentivizes nodes to maintain their assigned rates during partition. Priority {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} multipliers should be set to cover the \\(1/n\\) free-rider discount, not arbitrary priority levels.

<span id="scenario-autodelivery"></span>

### Commercial Application: {% term(url="#scenario-autodelivery", def="Autonomous last-mile delivery fleet in an urban metro area; urban connectivity gaps and GPS spoofing risk require local fleet-health management") %}AUTODELIVERY{% end %} Fleet Health

{% term(url="#scenario-autodelivery", def="Autonomous last-mile delivery fleet in an urban metro area; urban connectivity gaps and GPS spoofing risk require local fleet-health management") %}AUTODELIVERY{% end %} operates autonomous delivery vehicles across a metropolitan area. Vehicles navigate urban canyons, parking structures, and dense commercial districts with intermittent cellular connectivity. Each vehicle must maintain fleet health awareness - vehicle availability, road conditions, charging status - without continuous cloud connectivity.

The {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} architecture implements hierarchical health propagation: local {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} between nearby vehicles, zone aggregation at hub gateways, and fleet-wide propagation when connected.

**Local {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}** (vehicle-to-vehicle): Vehicles within DSRC range (approximately 300 meters in urban environments) exchange health vectors at 0.5 Hz. Each vehicle maintains the fields below; the Staleness Threshold column gives the maximum age at which each field still supports useful decisions — longer-lived fields like charging station status remain valid for 10 minutes because infrastructure changes slowly.

| Health Field | Size | Update Frequency | Staleness Threshold |
| :--- | ---: | :--- | ---: |
| Vehicle ID + Position | 12 bytes | Every exchange | 30s |
| Battery SoC + Range | 4 bytes | Every exchange | 60s |
| Current Task Status | 8 bytes | On change | 120s |
| Road Hazard Reports | 16 bytes | On detection | 300s |
| Charging Station Status | 8 bytes | On visit | 600s |

**Zone-level aggregation**: Hub gateways (vehicles stationed at distribution centers) aggregate zone health and {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} between zones via longer-range V2X communication. Zone summaries include:
- Available vehicles by {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier from heartbeat-only survival at the base level to full fleet integration at the top; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %}
- Coverage gaps (areas with no vehicle within 10 minutes)
- Charging infrastructure status
- Road condition summaries

**Fleet-wide propagation**: From {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}, {% katex() %}T = 2\ln(n)/f_g{% end %}, so typical metropolitan fleets achieve full health convergence in under a minute, enabling real-time rebalancing of delivery assignments.

**Position validation in urban environments**: {% term(url="#scenario-autodelivery", def="Autonomous last-mile delivery fleet in an urban metro area; urban connectivity gaps and GPS spoofing risk require local fleet-health management") %}AUTODELIVERY{% end %} faces spoofing risks from GPS multipath in urban canyons and potential adversarial spoofing from competitors or theft attempts. The function below classifies each vehicle's claimed position \\(p_i\\) as true (corroborated by a nearby peer), suspect (no peer within validation range), or false (contradicted by a peer's observation beyond the kinematically possible travel distance).

{% katex(block=true) %}
\text{Valid}(p_i) = \begin{cases}
\text{true} & \text{if } \exists j \in \mathcal{N}_i: \|p_i - p_j^{\text{observed}}\| < \epsilon \\
\text{suspect} & \text{if no nearby peer can validate} \\
\text{false} & \text{if } \exists j: \|p_i^{\text{claimed}} - p_j^{\text{observed}}\| > d_{\text{impossible}}
\end{cases}
{% end %}

where \\(\epsilon = 50m\\) is the validation tolerance and {% katex() %}d_{\text{impossible}}{% end %} is the maximum distance a vehicle could have traveled since last validated position.

Vehicles with sustained position validation failures are flagged for operational review and excluded from sensitive tasks (high-value deliveries, access to secure facilities).

**Delivery coordination under partition**: When a vehicle enters an underground parking garage (complete cellular blackout), it continues operating with cached task assignments. Upon emergence:
1. {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} exchange with first encountered peer
2. Receive updates accumulated during blackout
3. Reconcile any conflicting task assignments (first-commit-wins semantics)
4. Resume normal {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} participation

Average underground dwell time: 4.2 minutes. With 60-second {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} threshold, vehicles emerge with stale but still-useful health data - well within the maximum useful {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} for task rebalancing decisions.

### Priority-Weighted Gossip Extension

Standard {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} treats all health updates equally. In tactical environments, critical health changes (node failure, resource exhaustion, adversarial detection) should propagate faster than routine updates.

**Priority classification**:
- {% katex() %}P_{CRITICAL}{% end %} (priority 3): Node failure, {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} detection, adversarial alert
- {% katex() %}P_{URGENT}{% end %} (priority 2): Resource exhaustion (<10%), capability downgrade
- {% katex() %}P_{NORMAL}{% end %} (priority 1): Routine health updates, minor degradation

**Accelerated propagation protocol**:

The {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate \\(\lambda_p\\) for priority-\\(p\\) messages scales the base rate by a factor proportional to priority level, where \\(\eta\\) is the acceleration coefficient and \\(p = 1, 2, 3\\) for normal, urgent, and critical messages respectively.

{% katex(block=true) %}
\lambda_p = \lambda_{\text{base}} \cdot (1 + \eta \cdot (p - 1))
{% end %}

where \\(\eta\\) is the acceleration factor (typically 2-3). Critical messages {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} at \\(3\times\\) normal rate.

**Message prioritization in constrained bandwidth**:

When bandwidth is limited, each {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} exchange prioritizes by urgency. The protocol proceeds as follows:

**Step 1**: Merge local and peer health vectors into a unified update set.

**Step 2**: Sort updates by priority (descending), then by {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} (ascending) within each priority class.

**Step 3**: Transmit updates in sorted order until the bandwidth budget is exhausted. The condition below permits update \\(u_i\\) only when all previously selected updates plus \\(u_i\\) itself still fit within {% katex() %}B_{\text{budget}}{% end %}.

{% katex(block=true) %}
\text{Transmit update } u_i \text{ iff } \sum_{j < i} \text{size}(u_j) + \text{size}(u_i) \leq B_{\text{budget}}
{% end %}

**Step 4**: Critical override — the implication below unconditionally forces transmission of any {% katex() %}P_{\text{CRITICAL}}{% end %} update regardless of whether the budget would be exceeded.

{% katex(block=true) %}
\text{priority}(u) = P_{\text{CRITICAL}} \implies \text{transmit}(u) = \text{true}
{% end %}

This ensures safety-critical information propagates regardless of bandwidth constraints, accepting temporary budget overrun. In each gossip round, at most {% katex() %}C_{\text{max}}{% end %} concurrent \\(P_\text{CRITICAL}\\) overrides are processed (default: {% katex() %}C_{\text{max}} = 5{% end %}); excess critical messages queue for the next round. This aggregate cap prevents a burst of simultaneous critical events from collapsing the bandwidth budget entirely while still guaranteeing timely propagation of every critical message within {% katex() %}\lceil N_\text{crit} / C_{\text{max}} \rceil{% end %} additional rounds, where \\(N_\text{crit}\\) is the number of queued critical messages.

**Convergence improvement**: For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with \\(\eta = 2\\), priority-weighted {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} triples the effective critical {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate, as the formula below shows by substituting {% katex() %}P_{\text{CRITICAL}} = 3{% end %} into the general rate equation.

{% katex(block=true) %}
\lambda_{\text{crit}} = \lambda_{\text{base}} \cdot (1 + \eta \cdot (P_{\text{CRITICAL}} - 1)) = \lambda_{\text{base}} \cdot 3
{% end %}

Since convergence time scales inversely with effective rate, the ratio of normal to critical convergence times equals the ratio of critical to normal {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rates, giving a theoretical 3x speedup for \\(n = 47\\) drones.

{% katex(block=true) %}
\frac{T_{\text{norm}}}{T_{\text{crit}}} = \frac{\lambda_{\text{crit}}}{\lambda_{\text{norm}}} = 3.0 \text{ (theoretical)}
{% end %}

Accounting for message overhead and collision backoff, the expected speedup is approximately \\(2.6\times\\). Under the assumptions {% katex() %}\mathcal{A}_{\text{gossip}}{% end %} (uniform message sizes, bounded collision probability), critical updates converge in {% katex() %}O(D \cdot \delta_{\text{crit}}){% end %} versus {% katex() %}O(D \cdot \delta_{\text{norm}}){% end %} for normal updates, where \\(D\\) is network diameter.

**Anti-flood protection**: To prevent priority abuse by a {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} that floods {% katex() %}P_{\text{CRITICAL}}{% end %} messages, the node's historical rate of critical messages must not exceed {% katex() %}\rho_{\text{max}}{% end %}; the condition below enforces this per-source rate limit.

{% katex(block=true) %}
\text{Allow } P_{\text{CRITICAL}} \text{ from node } i \text{ iff } \frac{N_{\text{crit}}^i(t)}{t - t_{\text{start}}} < \rho_{\text{max}}
{% end %}

where {% katex() %}\rho_{\text{max}} \approx 0.01{% end %} messages/second. Exceeding this rate triggers trust decay.

Combined fleet critical-message rate bound: with \\(n\\) nodes each at the per-source rate limit \\(\rho_\text{max}\\), the maximum combined critical-message rate is {% katex() %}n \cdot \rho_\text{max}{% end %}. For RAVEN (\\(n=47\\), {% katex() %}\rho_\text{max} = 0.01\,\text{msg/s}{% end %}), this yields at most 0.47 forced-critical messages per second across the fleet — approximately 15–20 bytes/s overhead assuming 40-byte messages, well within the minimum bandwidth floor \\(B_\text{min}\\). Deployments with {% katex() %}n > B_\text{min}/(40 \cdot \rho_\text{max}){% end %} must lower \\(\rho_\text{max}\\) proportionally.

### Bandwidth Asymmetry and Ingress Filtering

The {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} prioritization above assumes backhaul bandwidth is scarce but nonzero. At the extreme — when the radio link is a tiny fraction of the local sensor bus — prioritization alone is insufficient. The node must also decide which metrics are worth transmitting at all.

Define the **bandwidth asymmetry ratio**:

{% katex(block=true) %}
\beta = \frac{B_b}{B_l}
{% end %}

where \\(B_b\\) is backhaul bandwidth (radio uplink) and \\(B_l\\) is local bus bandwidth (intra-node sensor bus). Typical edge values: {% katex() %}B_b \approx 9.6\,\text{kbps}{% end %} (tactical HF radio), {% katex() %}B_l \approx 100\,\text{Mbps}{% end %} (sensor bus), giving {% katex() %}\beta \approx 10^{-4}{% end %}. At \\(\beta < 0.01\\), the backhaul is less than 1% of local capacity. Sending everything the node observes locally is physically impossible.

> **Physical translation**: The backhaul link carries only 1 Mbps when the local sensor bus runs 100 Mbps — a 10,000:1 gap. You must discard 99.99% of local observations before they can leave the device. This is not a cost optimisation; it is a physical constraint that makes centralised aggregation architecturally impossible at full sensor resolution.

<span id="def-25"></span>
**Definition 25** (Bandwidth-Asymmetry Ingress Filter). *The ingress filter {% katex() %}\Pi: \mathcal{T} \times \mathbb{R}_{\geq 0} \to \{0,1\}{% end %} determines whether metric {% katex() %}m \in \mathcal{T}{% end %} observed at time \\(t\\) is transmitted:*

{% katex(block=true) %}
\Pi(m,\,t) = \begin{cases}
1 & \text{if priority}(m) = P_{\text{CRITICAL}} \\
1 & \text{if } t - t_{\text{last}}(m) > \tau_{\max} \\
1 & \text{if } \dfrac{|m(t) - m(t_{\text{last}})|}{m_{\text{range}}} > \dfrac{\theta_\Pi}{\beta} \\
0 & \text{otherwise}
\end{cases}
{% end %}

- **Use**: Caps the ingress data rate at the maximum a node can process within one MAPE-K tick; apply before the Monitor phase on high-rate sensor nodes to prevent monitor-phase overload from sensor bursts that stale the entire MAPE-K cycle.
- **Parameters**: {% katex() %}C_{\text{proc}}{% end %} = local processing capacity (bytes/s); filter drops input beyond {% katex() %}C_{\text{proc}} \cdot T_{\text{tick}}{% end %} bytes per window.
- **Field note**: OUTPOST meshes produce 10–100x burst spikes over sustained rate — size the filter for peak burst, not average throughput.

> **Physical translation**: On a severely bandwidth-constrained uplink ({% katex() %}\beta = 10^{-4}{% end %}), only a metric that has changed by more than 10% of its full operating range is worth transmitting — anything smaller is noise relative to the channel's information capacity. The filter enforces this automatically: safety-critical events always get through ({% katex() %}P_{\text{CRITICAL}}{% end %} override), stale readings are forced through at {% katex() %}\tau_{\max}{% end %} to keep the MAPE-K loop alive, and everything else is silenced until the change is large enough to be actionable. The result is a 100,000-fold reduction in radio transmissions on a 72-hour mission with no loss of decision-relevant information.

*where {% katex() %}m(t_{\text{last}}){% end %} is the last transmitted value of \\(m\\), {% katex() %}m_{\text{range}}{% end %} is the metric's operational dynamic range, \\(\theta_\Pi\\) is a baseline sensitivity parameter, \\(\beta = B_b/B_l\\) is the bandwidth asymmetry ratio, and {% katex() %}\tau_{\max}{% end %} is the maximum useful staleness bound from {% term(url="#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %}.*

**Interpretation**: Three conditions trigger transmission (any one suffices):
1. **Critical override**: P_CRITICAL metrics bypass the filter entirely — safety-critical information always transmits.
2. **Staleness override**: Even if a metric is slowly changing, it transmits at least once per {% katex() %}\tau_{\max}{% end %} — the {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop never starves on stale P2/P3 inputs. This ties directly to {% term(url="#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %}: a metric silent beyond {% katex() %}\tau_{\max}{% end %} carries zero confidence, so it must refresh.
3. **Magnitude threshold**: As {% katex() %}\beta \to 0{% end %}, the normalized-change threshold {% katex() %}\theta_\Pi/\beta \to \infty{% end %}, so only extreme deviations transmit in normal operation.

**Calibration example for {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}** ({% katex() %}\beta = 10^{-4}{% end %}, \\(\theta_\Pi = 0.001\\)):

| Metric | Normal threshold | Filtered threshold ({% katex() %}\theta_\Pi/\beta{% end %}) | Interpretation |
| :--- | :--- | :--- | :--- |
| Temperature drift | \\(0.1\\,^\circ\text{C}\\) (0.1% of \\(100\\,^\circ\text{C}\\) range) | \\(10\\,^\circ\text{C}\\) (10% of range) | Only transmit on significant excursion |
| Battery state-of-charge | 1% change | 10% change | Coarse reporting only |
| Seismic amplitude | any spike | always (P_CRITICAL) | Bypasses filter |
| Mesh link quality | 5% drop | 50% drop | Catastrophic degradation only |

The filter preserves the P0–P2 observability hierarchy: availability (P0) and resource exhaustion (P1) metrics carry P_CRITICAL priority and are never dropped; performance (P2) and anomaly (P3) metrics are subject to the \\(\beta\\)-scaled threshold.

**Energy connection**: Each filtered-out metric saves \\(T_s\\) joules ({% term(url="@/blog/2026-01-15/index.md#def-2", def="Energy-per-Decision Metric: total energy cost combines compute and transmit costs; one radio packet costs roughly one thousand times a local compute operation") %}Definition 2{% end %}). Over a 72-hour partition with 1,000 sensor metrics updating at 1 Hz, filtering to {% katex() %}\beta = 10^{-4}{% end %} reduces transmissions from 259 million potential packets to fewer than 2,600 — a 100,000x reduction in radio energy expenditure, directly extending battery life.

### Gossip Under Partition

Fleet partition creates isolated {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} domains. Within each cluster, convergence continues at rate {% katex() %}O(\ln n_{\text{cluster}}){% end %}. Between clusters, state diverges until reconnection.

**Remark** (Partition Staleness). *For node \\(i\\) in cluster \\(C_1\\) observing node \\(j\\) in cluster \\(C_2\\), {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} - the elapsed time since observation - accumulates from partition time \\(t_p\\):*

{% katex(block=true) %}
\tau_{ij}(t) = t - t_p + \tau_{ij}(t_p)
{% end %}

*The {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} grows unboundedly during partition, eventually exceeding any useful threshold.*

The diagram below shows two {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} clusters separated by a hard partition: {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} continues normally within each cluster (solid edges), but the severed link (crossed dashed edge) blocks all cross-cluster exchanges.

{% mermaid() %}
graph LR
    subgraph Cluster_A["Cluster A (gossip active)"]
    A1[Node 1] --- A2[Node 2]
    A2 --- A3[Node 3]
    A1 --- A3
    end
    subgraph Cluster_B["Cluster B (gossip active)"]
    B1[Node 4] --- B2[Node 5]
    B2 --- B3[Node 6]
    B1 --- B3
    end
    A3 -.-x|"PARTITION<br/>No communication"| B1

    style Cluster_A fill:#e8f5e9
    style Cluster_B fill:#e3f2fd
{% end %}

> **Read the diagram**: Within each cluster (green and blue subgraphs), gossip continues normally — solid edges show active exchanges. The crossed dashed edge between Cluster A and Cluster B is severed; no health information crosses that boundary. Each cluster converges to a locally-consistent but globally-stale view. Cross-cluster staleness accumulates for as long as the partition persists.

**Cross-cluster state tracking**:

Each node maintains a **partition vector** \\(\rho_i\\) that records, for every other node \\(j\\), either zero (still reachable) or the timestamp of the last confirmed contact (if unreachable), enabling {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} calculations when connectivity is later restored.

{% katex(block=true) %}
\rho_i[j] = \begin{cases}
0 & \text{if } j \text{ reachable directly or via gossip} \\
\text{hlc}_{\text{last}} & \text{if } j \text{ unreachable}
\end{cases}
{% end %}

where {% katex() %}\text{hlc}_{\text{last}}{% end %} is the {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} timestamp ({% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock (HLC): clock combining physical and logical timestamps, advancing on message receipt to maintain causal ordering without NTP") %}Definition 61{% end %}) of the last confirmed contact, recorded as an {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} timestamp rather than wall-clock time, to preserve causal ordering across nodes with clock drift.

When \\(\rho_i[j] > 0\\) and {% katex() %}t - \rho_i[j] > \tau_{\text{max}}{% end %}, node \\(i\\) marks its knowledge of node \\(j\\) as **uncertain** rather than **stale**.

**Reconciliation priority**:

Upon reconnection, nodes exchange partition vectors. The formula below assigns reconciliation priority to each node \\(j\\) as the product of how long it has been partitioned ({% katex() %}t_{\text{reconnect}} - \rho[j]{% end %}) and its operational importance weight, so cluster leads and critical sensors are updated first.

{% katex(block=true) %}
\text{Priority}(j) = (t_{\text{reconnect}} - \rho[j]) \cdot \text{Importance}(j)
{% end %}

Nodes with longest partition duration and highest importance (cluster leads, critical sensors) reconcile first.

### Confidence Intervals on Stale Data

Health observations age. A drone last heard from 30 seconds ago may have changed state since then.

<span id="def-26"></span>
**Definition 26** (Staleness). *The {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} \\(\tau_\text{stale}\\) of an observation is the elapsed time since the observation was made. An observation with {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} \\(\tau_\text{stale}\\) has uncertainty that grows with \\(\tau_\text{stale}\\) according to the underlying state dynamics.*

In other words, the older a health reading is, the less reliable it becomes — not because the data was wrong when recorded, but because the underlying system may have changed in the intervening time.

Model health as a stochastic process. If health evolves with variance \\(\sigma^2\\) per unit time, the formula below gives the \\((1-\alpha)\\) confidence interval around the last known health value {% katex() %}h_{\text{last}}{% end %}: the half-width grows as {% katex() %}\sqrt{\tau_\text{stale}}{% end %}, so uncertainty widens slowly at first and then accelerates.

{% katex(block=true) %}
\text{CI} = h_{\text{last}} \pm z_{\alpha/2} \sigma \sqrt{\tau_{\text{stale}}}
{% end %}

> **Physical translation**: The confidence interval widens as the square root of elapsed time \\(\tau_\text{stale}\\). A node last seen 4 seconds ago has twice the uncertainty of a node last seen 1 second ago. At 100 seconds, the interval has grown 10x from its initial width. When the interval spans a capability-level boundary, you can no longer make reliable decisions about that node.

Where:
- {% katex() %}h_{\text{last}}{% end %} = last observed health value
- \\(\tau_\text{stale}\\) = time since observation
- \\(\sigma\\) = health volatility parameter
- {% katex() %}z_{\alpha/2}{% end %} = confidence multiplier (1.96 for 95%)

**Assumption:** Health evolves as a Brownian diffusion with variance \\(\sigma^2\\) per unit time, so the \\((1-\alpha)\\) confidence interval grows as {% katex() %}\sqrt{\tau_{\text{stale}}}{% end %}. This assumption breaks for strongly mean-reverting or bounded metrics (e.g., binary health indicators), where alternative staleness models should be used.

**Implications for decision-making**:

The CI width grows as {% katex() %}\sqrt{\tau_{\text{stale}}}{% end %} — a consequence of the Brownian motion model. This square-root scaling means confidence degrades slowly at first but accelerates with {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}.

When the CI spans a decision threshold (like the {% katex() %}\mathcal{L}_2{% end %} capability boundary), you can't reliably commit to that {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier from heartbeat-only survival at the base level to full fleet integration at the top; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %}. The {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} has exceeded the **decision horizon** for that threshold - the maximum time at which stale data can support the decision.

Different decisions have different horizons. Safety-critical decisions with narrow margins have short horizons. Advisory decisions with wide margins have longer horizons. The system tracks {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} against the relevant horizon for each decision type.

**Response strategies** when confidence is insufficient:
1. **Active probe**: Attempt direct communication to get fresh observation
2. **Conservative fallback**: Assume health at lower bound of CI
3. **Escalate observation priority**: Increase {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate for this node

<span id="prop-14"></span>
**Proposition 14** (Maximum Useful Staleness). *For a health process modeled as Brownian diffusion with volatility \\(\sigma\\) (as in {% term(url="#def-26", def="Staleness: elapsed time since a gossip record was last updated; records older than the maximum useful staleness bound are discarded") %}Definition 26{% end %}), and a decision requiring discrimination at precision \\(\Delta h\\) with confidence \\(1 - \alpha\\), the maximum useful {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} is:*

*Beyond this age, uncertainty has grown too wide to distinguish normal from anomalous — old data misleads rather than informs.*

{% katex(block=true) %}
\tau_{\text{max}} = \left( \frac{\Delta h}{z_{\alpha/2}\, \sigma} \right)^2
{% end %}

> **Physical translation**: Maximum sensor reading age before the confidence interval widens enough to straddle the decision threshold. After {% katex() %}\tau_{\text{max}}{% end %}, the reading contributes less certainty than not measuring at all — old data becomes an active liability, not just a passive gap.

*where {% katex() %}z_{\alpha/2}{% end %} is the standard normal quantile and \\(\Delta h\\) is the acceptable drift. Beyond {% katex() %}\tau_{\text{max}}{% end %}, the confidence interval spans the decision threshold and the observation cannot support the decision.*

*Proof*: Under the diffusion model ({% term(url="#def-26", def="Staleness: elapsed time since a gossip record was last updated; records older than the maximum useful staleness bound are discarded") %}Definition 26{% end %}), health evolves as a Brownian process with variance \\(\sigma^2\\) per unit time. Given the last observation at time \\(t_0\\), the current state at time \\(t_0 + \tau\\) lies within a \\((1-\alpha)\\) confidence interval of half-width {% katex() %}z_{\alpha/2} \sigma \sqrt{\tau}{% end %}. Setting this equal to the required decision precision \\(\Delta h\\) and solving for \\(\tau\\) gives the result. Under the diffusion model, the staleness bound is independent of observation rate \\(\lambda\\) — more frequent observations do not reduce uncertainty about the *current* state between observations, only about the state *at* each observation time.

**Corollary 4**. *The quadratic relationship {% katex() %}\tau_{\text{max}} \propto (\Delta h / \sigma)^2{% end %} implies that tightening decision margins dramatically reduces useful {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}. Systems with narrow operating envelopes must refresh observations more frequently — not because more observations narrow the diffusion uncertainty, but because each observation must occur before the health state drifts by \\(\Delta h\\).*

**Time-varying \\(\sigma\\) caveat**: Prop 5 assumes constant measurement volatility \\(\sigma\\). {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} thermistors exhibit {% katex() %}\sigma(T) \approx 0.05 + 0.003 \cdot |T - T_{\text{ref}}|\,{^\circ}\text{C}{% end %} — three times higher at {% katex() %}-30\,{^\circ}\text{C}{% end %} than at {% katex() %}20\,{^\circ}\text{C}{% end %}.

For sensors with temperature-correlated variance, substitute {% katex() %}\sigma_{\max} = \max_{T \in \text{operating range}} \sigma(T){% end %} as a conservative upper bound on {% katex() %}\tau_{\max}{% end %}. This produces a shorter, conservative staleness limit.

To run the bound dynamically: update \\(\sigma\\) using the Kalman steady-state innovation covariance {% katex() %}\sqrt{P_\infty + R}{% end %} and recompute {% katex() %}\tau_{\max}{% end %} at each measurement cycle. Decision systems with narrow operating envelopes ({% katex() %}\Delta h < 0.1\,{^\circ}\text{C}{% end %}) will find {% katex() %}\tau_{\max}{% end %} below 10 seconds in cold conditions — requiring far higher {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rates than lab calibration suggests.

> **What this means in practice**: After this time threshold, a gossip update is more likely to mislead the receiver than inform them. For fast-moving edge deployments (drone swarms, autonomous vehicles), this bound is surprisingly tight — often under 10 seconds for critical health signals. Design your gossip rate to ensure updates arrive before staleness renders them useless.

> **Empirical status**: The {% katex() %}\tau_{\text{max}}{% end %} formula is exact given the Brownian diffusion model and the parameters \\(\sigma\\), \\(\Delta h\\), \\(\alpha\\). The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} temperature-variance model {% katex() %}\sigma(T) \approx 0.05 + 0.003|T - T_{\text{ref}}|{% end %} is a representative sensor-datasheet curve; actual values vary by manufacturer and operating history. The "under 10 seconds" characterization for fast-moving deployments is an illustration, not a measured bound.

### Byzantine-Tolerant Health Aggregation

In contested environments, some nodes may be compromised. They may inject false health values to:
- Mask their own degradation (hide compromise)
- Cause healthy nodes to appear degraded (create confusion)
- Destabilize fleet-wide health estimates (denial of service)

<span id="def-27"></span>
**Definition 27** ({% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} Node). *A node is {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} if it may deviate arbitrarily from the protocol specification, including sending different values to different peers, reporting false observations, or selectively participating in {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rounds {{ cite(ref="7", title="Lamport, Shostak, Pease (1982) — The Byzantine Generals Problem") }}.*

In other words, a {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} is one that cannot be assumed to behave honestly in any predictable way — unlike a crashed node, it may actively lie, and it may lie differently to different neighbors simultaneously.

*Scope: this threat model applies within a single partition epoch — specifically to gossip health aggregation while nodes are co-partitioned and can observe each other's messages. Post-reconnection Byzantine treatment (reputation-weighted CRDT admission, quorum-gated state merge) builds on this foundation but introduces additional per-epoch mechanisms addressed in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md).*

The aggregation function uses a trust-weighted trimmed mean: the bottom and top \\(f/n\\) weight fractions are excluded before computing the weighted average. This makes the aggregate robust to up to \\(f\\) {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} contributors.

**Weighted voting** based on trust scores. The formula below computes a trust-weighted average of each node's reported health for member \\(k\\), where \\(T_i\\) is the accumulated trust score of reporting node \\(i\\); nodes with low or decayed trust contribute proportionally less to the aggregate.

{% katex(block=true) %}
h_k^{\text{aggregated}} = \frac{\sum_i T_i \cdot h_k^i}{\sum_i T_i}
{% end %}

> **Physical translation**: This is a weighted average where each reporter's vote is scaled by its accumulated trust. A node with trust 0.9 influences the aggregate nine times more than a node with trust 0.1. A node whose trust has decayed to 0.01 — due to repeated inconsistent reports — is almost completely silenced without being formally ejected.

Where \\(T_i\\) is the trust score of node \\(i\\). Trust is earned through consistent, verifiable behavior and decays when inconsistencies are detected.

**Outlier detection** on received health reports: A report from node \\(i\\) about node \\(k\\) is flagged suspicious when the absolute deviation from the current consensus value exceeds the outlier threshold {% katex() %}\theta_{\text{outlier}}{% end %}.

{% katex(block=true) %}
\text{suspicious} = |h_k^i - h_k^{\text{consensus}}| > \theta_{\text{outlier}}
{% end %}

Repeated suspicious reports decrease trust score for node \\(i\\).

**Isolation protocol** for nodes with inconsistent claims:

1. Track history of claims per node (sliding window of \\(W\\) rounds; memory: \\(O(n \cdot W)\\) bits)
2. Compute consistency score: fraction of claims matching consensus
3. If consistency below threshold, quarantine node from health aggregation
4. Quarantined nodes can still participate but their reports are not trusted

*Memory bound*: For \\(n = 50\\) nodes and \\(W = 100\\) rounds, history storage requires \\(50 \times 100 / 8 = 625\\) bytes using 1-bit flags per observation.

<span id="prop-15"></span>
**Proposition 15** ({% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} Tolerance Bound). *With trust-weighted aggregation, correct health estimation is maintained if the total {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} trust weight is bounded {{ cites(ref="7", refs="7, 8", title="Lamport, Shostak, Pease (1982) — The Byzantine Generals Problem; Castro & Liskov (1999) — Practical Byzantine Fault Tolerance") }}:*

*Correct consensus holds as long as compromised nodes collectively carry less than one-third of total trust weight.*

{% katex(block=true) %}
\sum_{\text{Byzantine}} T_i < \frac{1}{3} \sum_{\text{all}} T_i
{% end %}

*This generalizes the classical \\(f < n/3\\) bound: with uniform trust weights \\(T_i = 1\\), this reduces to \\(f < n/3\\) (fewer than one third of nodes are {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %}). With trust decay on suspicious nodes, {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} influence decreases over time, allowing tolerance of more compromised nodes provided their accumulated trust is low.*

*In practice, this means: design your trust-weight initialization so that a node enrolled at zero reputation cannot cast a meaningful vote — equal initial weights give an attacker a free \\(1/n\\) share of influence from the first gossip round, while a hardware-attested enrollment delays that influence until the device earns it through observed behavior.*

This is not foolproof - a sophisticated adversary who understands the aggregation mechanism can craft attacks that pass consistency checks. {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} tolerance provides defense in depth, not absolute security.

**Bootstrap dependency**: Trust weights \\(w_i\\) require an initialization source. Without a functional PKI at deployment time, the only option is uniform \\(w_i = 1\\), which reduces Prop 6 to the classical \\(f < n/3\\) bound. A {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} node that corrupts its weight record before the reputation system accumulates any observations inflates its influence above the \\(1/3\\) threshold from the first {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} round.

The operational implication: trust weight initialization requires a hardware root of trust — secure boot attestation or a pre-deployment enrollment step that cryptographically binds \\(w_i\\) to a device identity. Systems without enrollment have no {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} tolerance guarantee at startup. Prop 6 applies only after each node has accumulated sufficient legitimate observations to build a meaningful trust differential (in practice: \\(\geq 20\\) {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} exchanges with a given peer).

**Trust accumulation attack**: The \\(f < n/3\\) bound is *instantaneous*. An adversary can compromise nodes gradually, with each behaving honestly until sufficient trust accumulates. When {% katex() %}\sum_{\text{compromised}} T_i{% end %} approaches {% katex() %}\frac{1}{3} \sum_{\text{all}} T_i{% end %}, coordinated {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} behavior can dominate aggregation before detection triggers trust decay.

**Countermeasure**: Implement trust budget decay — total system trust {% katex() %}\sum_i T_i{% end %} should decrease over time unless re-earned through verified behavior:

{% katex(block=true) %}
T_{\text{budget}}(t+1) = T_{\text{budget}}(t) \cdot (1 - \epsilon) + T_{\text{earned}}(t), \quad \epsilon \ll \gamma_{\text{recover}}
{% end %}

This bounds the maximum trust any coalition can accumulate.

> **Aggregation strategy selection.** Start with weighted voting; upgrade to reputation filtering only when nodes accumulate inconsistent behavioral fingerprints ({% term(url="#def-28", def="Behavioral Fingerprint: compact hash of a node's recent sensor distribution used to detect Byzantine nodes whose readings are statistically inconsistent with neighbors") %}Definition 28{% end %}) over three or more gossip epochs.

| Condition | Strategy | Complexity | Byzantine tolerance |
|-----------|----------|------------|---------------------|
| < 10 nodes, all trusted | Weighted voting (uniform trust) | \\(O(n)\\) | \\(f < n/3\\) with equal weights |
| > 10 nodes, mixed trust history | Trust-weighted trimmed mean + reputation | \\(O(n \log n)\\) | \\(f < n/3\\), adaptive over ~20 rounds |
| Adversarial enrollment suspected | Reputation filter + behavioral fingerprint consistency check | \\(O(n) + O(w)\\) window | \\(f < n/3\\) guaranteed after consistency filter |

> **Empirical status**: The \\(f < n/3\\) bound is a proven impossibility result (Lamport-Shostak-Pease). The trust-weighted generalization is analytically derived. The parameters {% katex() %}\gamma_{\text{decay}} \approx 0.1{% end %}, {% katex() %}\gamma_{\text{recover}} \approx 0.01{% end %}, {% katex() %}\theta_{\text{recovery}} \approx 0.95{% end %}, and the 20-round warm-up figure are engineering design choices, not empirically validated values — treat as starting points requiring per-deployment calibration.

### Optional: Game-Theoretic Extension — Byzantine Reporting as a Signaling Game

{% term(url="#prop-15", def="Byzantine Tolerance Bound: gossip health protocol maintains correctness when fewer than n/3 nodes are Byzantine under majority-weight voting") %}Proposition 15{% end %}'s fraction bound {% katex() %}\sum_{\text{Byz}} T_i < \frac{1}{3}\sum_{\text{all}} T_i{% end %} assumes {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} behavior is a fixed fraction, not a strategic choice. A strategic {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} maximizes its trust weight to amplify its influence.

**Signaling game**: Each node \\(i\\) has true health {% katex() %}h_i^{\text{true}}{% end %}. A {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} selects reported health \\(\hat{h}_i\\) to maximize detection error. The trust weight {% katex() %}w = e^{-\gamma_s\tau}{% end %} rewards freshness - a {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} maintaining \\(\tau \approx 0\\) (frequent fresh reports) achieves maximum trust weight while reporting inverted health values {% katex() %}\hat{h}_i = 1 - h_i^{\text{true}}{% end %}.

**The {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}-decay flaw**: The current trust model rewards {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %}s who invest in frequent reporting. The corrected trust weight below multiplies the {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} factor by a hard consistency indicator — zero weight is assigned whenever the node's report contradicts neighbor-model predictions, regardless of how fresh the report is.

{% katex(block=true) %}
w_j^{\text{trust}} = e^{-\gamma_s\tau} \cdot \mathbb{1}\!\left[\hat{h}_j \text{ consistent with neighbor predictions}\right]
{% end %}

**Reputation update**: The EWMA-like update below maintains a reputation score \\(r_j(t) \in [0,1]\\) for each node, blending the previous score (weight \\(\alpha\\)) with a binary consistency indicator for the current round (weight \\(1-\alpha\\)), where {% katex() %}\hat{h}_j^{\text{pred}}(t){% end %} is the neighbor-model prediction and \\(\delta\\) is the consistency tolerance.

{% katex(block=true) %}
r_j(t+1) = \alpha \cdot r_j(t) + (1-\alpha) \cdot \mathbb{1}\!\left[|\hat{h}_j(t) - \hat{h}_j^{\text{pred}}(t)| < \delta\right]
{% end %}

where {% katex() %}\hat{h}_j^{\text{pred}}(t){% end %} is the prediction from neighbor models. Nodes with consistent reports (honest or genuinely healthy) maintain high \\(r_j\\); {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %}s whose inversions conflict with neighbor cross-validation see \\(r_j \to 0\\) over time.

**Practical implication**: Replace {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}-only trust weights with reputation-weighted trust. For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}'s 127-sensor mesh, this catches both adversarial {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} sensors and genuinely malfunctioning sensors without false {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} labels - failing sensors produce noisy (not inverted) reports, which are distinguishable from strategic inversion.

### Trust Recovery Mechanisms

Trust decay handles misbehaving nodes, but legitimate nodes may be temporarily compromised (e.g., sensor interference, transient fault) and later recover. A purely decaying trust model permanently punishes temporary failures.

**Trust recovery model**:

Trust evolves according to a mean-reverting process: each round it either decays multiplicatively toward zero on an inconsistent report or recovers toward {% katex() %}T_{\text{max}}{% end %} on a consistent one, with {% katex() %}\gamma_{\text{decay}}{% end %} and {% katex() %}\gamma_{\text{recover}}{% end %} controlling the respective speeds.

{% katex(block=true) %}
T_i(t+1) = \begin{cases}
T_i(t) \cdot (1 - \gamma_{\text{decay}}) & \text{if inconsistent} \\
T_i(t) + \gamma_{\text{recover}} \cdot (T_{\text{max}} - T_i(t)) & \text{if consistent}
\end{cases}
{% end %}

where {% katex() %}\gamma_{\text{decay}} \approx 0.1{% end %} (fast decay) and {% katex() %}\gamma_{\text{recover}} \approx 0.01{% end %} (slow recovery). The asymmetry ensures that building trust takes longer than losing it - appropriate for contested environments.

**Recovery conditions**:

Trust recovery does not begin immediately after one good report; a node becomes eligible only when its consistency fraction over the recent window \\(W\\) exceeds the threshold {% katex() %}\theta_{\text{recovery}}{% end %}.

{% katex(block=true) %}
\text{Recovery eligible iff } \frac{\text{consistent reports in window } W}{\text{total reports in } W} > \theta_{\text{recovery}}
{% end %}

where \\(W\\) is typically 50-100 {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rounds and {% katex() %}\theta_{\text{recovery}} \approx 0.95{% end %}. A node with even 5% inconsistent reports continues decaying.

**Sybil attack resistance**:

An adversary creating multiple fake identities (Sybil attack) can attempt to dominate the trust-weighted aggregation. Countermeasures:

1. **Identity binding**: Nodes must prove identity through cryptographic challenge-response or physical attestation (GPS position consistency over time)

2. **Trust inheritance limits**: New nodes start with {% katex() %}T_{\text{initial}} = T_{\text{sponsor}} \cdot \beta{% end %} where \\(\beta < 0.5\\). No node can spawn high-trust children.

   Minimum inheritance bound: {% katex() %}\beta \geq \beta_\text{min} = 0.05{% end %}, preventing a sponsoring node from setting \\(\beta \approx 0\\) to deny any new node from accumulating useful trust (a denial-of-service against fleet expansion). The usable range is \\(\beta \in [0.05, 0.5)\\).

3. **Global trust budget**: The sum of trust scores across all nodes must not exceed {% katex() %}T_{\text{max}} \cdot n_{\text{expected}}{% end %}, so a Sybil attacker cannot inject arbitrarily many high-trust identities without displacing trust from existing nodes.

{% katex(block=true) %}
\sum_i T_i \leq T_{\text{budget}} = T_{\text{max}} \cdot n_{\text{expected}}
{% end %}

New node admission requires either trust redistribution or explicit authorization.

4. **Behavioral clustering**: Nodes exhibiting suspiciously correlated behavior (same reports, same timing) are grouped and their combined trust is capped at the maximum of any single member, preventing a coalition of colluders from accumulating more influence than one honest node.

{% katex(block=true) %}
T_{\text{cluster}} = \max_{i \in \text{cluster}} T_i \quad \text{(not sum)}
{% end %}

**Trust recovery example**:

{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicle V3 experiences temporary GPS interference causing inconsistent position reports for 10 minutes. Trust drops from 1.0 to 0.35 during interference. After interference clears:
- Minutes 0-5: Consistent reports, trust rises to 0.42
- Minutes 5-15: Continued consistency, trust rises to 0.58
- Minutes 15-30: Trust rises to 0.78
- After 1 hour of consistency: Trust returns to 0.95

The slow recovery prevents adversaries from rapidly cycling between attack and "good behavior" phases.

### Behavioral Fingerprinting and Proof of Useful Work

Trust decay and cross-validation (above) detect nodes that report inconsistent health values. They do not detect a more sophisticated adversary: a node that reports *plausible* health values — passing every consistency check — while its anomaly detector has been disabled, replaced with a random-number generator, or is producing outputs uncalibrated to actual sensor data. A heartbeat proves the node is alive; cross-validation proves the node is reporting plausibly; neither proves the node is doing *useful work*.

<span id="def-28"></span>
**Definition 28** (Behavioral Fingerprint). *The behavioral fingerprint of node \\(i\\) over observation window \\([t - w, t]\\) is the tuple {% katex() %}\varphi_i(t) = (\mathcal{F}_i,\, \mathcal{K}_i,\, \mathcal{R}_i){% end %}:*

- *{% katex() %}\mathcal{F}_i{% end %}: the empirical CDF of Kalman anomaly scores {% katex() %}\{z_s^K\}_{s \in [t-w,t]}{% end %}. Under a calibrated detector running on real data, {% katex() %}\mathcal{F}_i \approx \Phi{% end %} (standard normal CDF).*
- *{% katex() %}\mathcal{K}_i{% end %}: the cross-correlation matrix {% katex() %}\rho_{ij} = \operatorname{Corr}(z_i^K(s), z_j^K(s)){% end %} for each neighbor \\(j \in N(i)\\) over \\([t-w,t]\\). Under genuine sensor readings, {% katex() %}\rho_{ij}{% end %} matches the known physical correlation from the deployment calibration.*
- *{% katex() %}\mathcal{R}_i{% end %}: the action rate vector — counts of healing decisions per severity level per hour, which must be consistent with the observed anomaly rate implied by {% katex() %}\mathcal{F}_i{% end %}.*

**Proof of Useful Work** (KS test on anomaly score distribution). *Node \\(i\\) passes the fingerprint test if the Kolmogorov-Smirnov statistic \\(D_w\\) is below the critical value:*

{% katex(block=true) %}
D_w = \sup_{x \in \mathbb{R}} \left|\hat{F}_i(x) - \Phi(x)\right| \leq c_{\alpha,w} = \sqrt{\frac{-\ln(\alpha/2)}{2w}}
{% end %}

*where {% katex() %}\hat{F}_i{% end %} is the empirical CDF of {% katex() %}\{z_s^K\}{% end %} and {% katex() %}c_{\alpha,w}{% end %} is the KS critical value at significance \\(\alpha\\) with window \\(w\\).*

**What each component catches**:

| Adversary behavior | \\(\mathcal{F}_i\\) signature | \\(\mathcal{K}_i\\) signature | Detected? |
| :--- | :--- | :--- | :--- |
| Dead detector (always \\(z=0\\)) | \\(D_w \approx 0.5\\) (point mass at 0) | {% katex() %}\rho_{ij} \approx 0{% end %} | Yes — \\(\mathcal{F}_i\\) fails KS |
| Frozen detector (constant \\(z\\)) | \\(D_w \approx 0.5\\) | {% katex() %}\rho_{ij} \to \infty{% end %} | Yes — \\(\mathcal{F}_i\\) fails KS |
| Spoofed: fake \\(\mathcal{N}(0,1)\\) draws | \\(D_w \approx 0\\) — passes \\(\mathcal{F}_i\\) | {% katex() %}\rho_{ij} \approx 0{% end %} — wrong | Yes — \\(\mathcal{K}_i\\) fails |
| Calibrated Byzantine (inverted) | \\(D_w \approx 0\\) | {% katex() %}\rho_{ij}{% end %} matches | No — actions \\(\mathcal{R}_i\\) inconsistent |
| Genuine useful work | {% katex() %}D_w \leq c_{\alpha,w}{% end %} | {% katex() %}\rho_{ij}{% end %} matches | Passes all three |

**Why spoofing the fingerprint requires doing the work**: To pass both {% katex() %}\mathcal{F}_i{% end %} (genuine normal distribution) and {% katex() %}\mathcal{K}_i{% end %} (correct spatial correlation with all neighbors), an adversary must either:
1. Run a genuinely calibrated detector on actual sensor data — which is the useful work we require, or
2. Learn the full spatial correlation structure {% katex() %}\{\rho_{ij}\}{% end %} for all neighbors and generate synthetic correlated noise — which requires communicating with all neighbors continuously, making the adversary detectable via traffic analysis and increasing their energy expenditure above {% term(url="@/blog/2026-01-15/index.md#def-2", def="Energy-per-Decision Metric: total energy cost combines compute and transmit costs; one radio packet costs roughly one thousand times a local compute operation") %}Definition 2{% end %}'s threshold.

> **Physical translation**: A node that is genuinely running an anomaly detector on real sensor data will produce anomaly scores that look like a standard normal distribution (by construction of the Z-score) and will be spatially correlated with neighbors measuring the same physical environment. A node that is dead, frozen, or generating synthetic scores will fail one of these three checks within 30 minutes of data collection. The key practical consequence: this fingerprint catches malfunctioning sensors that accidentally mimic Byzantine behavior — frozen sensors, dead sensors, calibration drift — without requiring any dedicated Byzantine detection protocol.

**Connection to {% term(url="#def-27", def="Byzantine Node: a node that sends arbitrarily incorrect or conflicting health messages; tolerated up to f < n/3 Byzantine nodes under Proposition 15") %}Definition 27{% end %}** ({% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} Node): Def 7 identifies {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} nodes as those that may deviate arbitrarily from the protocol. Prop 6's trust bound stops them from dominating aggregation. {% term(url="#def-28", def="Behavioral Fingerprint: compact hash of a node's recent sensor distribution used to detect Byzantine nodes whose readings are statistically inconsistent with neighbors") %}Definition 28{% end %} adds a third line of defense that complements both: it is triggered not by *what* a node reports but by *whether the reporting process itself is consistent with genuine sensor-coupled inference*. A {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} node that understands and avoids Prop 6's trust threshold can still be caught by the fingerprint's spatial correlation test, provided the physical environment is not under the adversary's full control.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration**: Window \\(w = 1800\\) samples (30 minutes at {% katex() %}\lambda = 1\,\text{Hz}{% end %}), \\(\alpha = 0.01\\) — giving {% katex() %}c_{0.01,\, 1800} \approx 0.038{% end %}. For a dead detector: \\(D_w = 0.5 \gg 0.038\\) — detected in 30 minutes. For a fake-{% katex() %}\mathcal{N}(0,1){% end %} generator: {% katex() %}\mathcal{F}_i{% end %} passes, but {% katex() %}\rho_{ij} = 0{% end %} vs. expected {% katex() %}\rho_{ij} \approx 0.3{% end %} (thermal correlation between adjacent sensors) — detected by Fisher z-test on the correlation difference within the same window.

**Fingerprint Warm-Up Quarantine**

Any node that re-enters the fleet after a partition of duration {% katex() %}T_\text{partition} > T_\text{fp,window}{% end %} is placed in Provisional Status for a minimum of \\(T_\text{fp,window}\\) before its gossip messages are admitted to fleet consensus. During Provisional Status: (1) the node's messages are forwarded as read-only advisory input — visible to peers but not updating the Welford estimator or gossip health vectors; (2) the rehabilitation gate ({% term(url="#def-35", def="Trust-Root Anchor: mechanism establishing fleet identity roots through Phase-0 commissioning attestation records") %}Trust-Root Anchor{% end %} protocol) applies concurrently, requiring \\(r\\) consecutive clean observations; (3) both conditions must be satisfied before full fleet membership is restored.

For OUTPOST, the combined entry barrier is {% katex() %}\max(T_\text{fp,window}, r \cdot T_\text{tick}) = \max(1800\,\text{s}, 5 \times 120\,\text{s}) = 1800\,\text{s}{% end %} — 30 minutes regardless of tick rate.

> **Physical translation:** A returning node earns read-only observer status immediately but cannot influence fleet decisions for 30 minutes. This is the same logic a hospital uses for a patient returning from isolation — they can speak and be heard, but cannot handle shared equipment until cleared.

### Federated Learning for Distributed Health Models

Individual nodes learn {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} models from local data. But local data is limited - each node sees only its own failures and operating conditions. **Federated learning** enables fleet-wide model improvement without centralizing sensitive telemetry data.

**The Federated Learning Problem for Edge Health**:

*(Notation: in this section and throughout federated learning, \\(\theta\\) and {% katex() %}\theta_{\text{ml}}^*{% end %} denote ML model parameter vectors — weights of the anomaly detection model. This is distinct from \\(\theta^\*\\) in {% term(url="#prop-9", def="Propositions establishing optimal thresholds, convergence rates, and bounds for local anomaly detection and health measurement") %}Propositions 9–19{% end %}, where it denotes the scalar anomaly detection threshold. Context distinguishes the two; the subscript \\(\theta_k\\) (node-local model) vs. \\(\theta^\*\\) (optimal threshold) disambiguates when both appear.)*

Traditional ML requires centralized data. The objective below finds model parameters {% katex() %}\theta_{\text{ml}}^*{% end %} that minimize total loss {% katex() %}\mathcal{L}{% end %} across all \\(n\\) labeled samples \\((x_i, y_i)\\) pooled in one place.

{% katex(block=true) %}
\theta_{\text{ml}}^* = \arg\min_\theta \sum_{i=1}^{n} \mathcal{L}(f_\theta(x_i), y_i) \quad \text{(centralized)}
{% end %}

Federated learning distributes the same optimization across \\(K\\) nodes so that only gradient updates — not raw telemetry — travel over the network. Each node \\(k\\) minimizes its own local loss {% katex() %}\mathcal{L}_k(\theta){% end %} over its private dataset \\(D_k\\) of size \\(n_k\\), and the contributions are weighted by data-set size to approximate the global optimum {% katex() %}\theta_{\text{ml}}^*{% end %}.

{% katex(block=true) %}
\theta_{\text{ml}}^* = \arg\min_\theta \sum_{k=1}^{K} \frac{n_k}{n} \mathcal{L}_k(\theta) \quad \text{where } \mathcal{L}_k(\theta) = \frac{1}{n_k} \sum_{i \in D_k} \mathcal{L}(f_\theta(x_i), y_i)
{% end %}

Each node \\(k\\) computes local gradients; only gradients (not data) are shared.

**Federated Averaging (FedAvg) for Edge Deployment**: The diagram shows one complete round — server broadcast, parallel local SGD on each node, then weighted aggregation back to the server; data never leaves each node, only gradient updates travel.

{% mermaid() %}
graph TD
    subgraph "Round t"
        S1["Server broadcasts<br/>global model theta_ml(t)"]
        C1["Node 1: Local SGD<br/>theta_ml1(t+1) = theta_ml(t) - eta*dL1"]
        C2["Node 2: Local SGD<br/>theta_ml2(t+1) = theta_ml(t) - eta*dL2"]
        C3["Node K: Local SGD<br/>theta_mlk(t+1) = theta_ml(t) - eta*dLk"]
        A1["Server aggregates<br/>theta_ml(t+1) = sum(nk/n)*theta_mlk(t+1)"]
    end

    S1 --> C1
    S1 --> C2
    S1 --> C3
    C1 --> A1
    C2 --> A1
    C3 --> A1
    A1 --> S2["Round t+1"]

    style S1 fill:#e3f2fd,stroke:#1976d2
    style A1 fill:#e3f2fd,stroke:#1976d2
    style C1 fill:#e8f5e9,stroke:#388e3c
    style C2 fill:#e8f5e9,stroke:#388e3c
    style C3 fill:#e8f5e9,stroke:#388e3c
{% end %}

> **Read the diagram**: The server broadcasts the current global model to all nodes (blue). Each node runs several steps of local gradient descent on its own private data (green) — raw telemetry never leaves the node. Nodes return only their updated weights. The server aggregates these weighted by dataset size and produces a better global model for the next round. Raw sensor data stays local; only model weights travel.

**Adaptation for contested connectivity**:

Standard FedAvg assumes synchronous communication — all nodes participate in each round. Edge systems require **asynchronous federated learning** with three key adaptations.

1. **Partial participation**: Each round includes only nodes with connectivity. The formula below aggregates the available subset \\(S_t\\) using data-size weights \\(n_k\\), so the update is still an unbiased estimator of the full-data gradient when participation is random.

{% katex(block=true) %}
\theta^{(t+1)} = \frac{\sum_{k \in S_t} n_k \theta_k^{(t+1)}}{\sum_{k \in S_t} n_k}
{% end %}

where {% katex() %}S_t \subseteq \{1, ..., K\}{% end %} is the set of participating nodes in round \\(t\\).

2. **Staleness tolerance**: Nodes may contribute gradients computed from stale global models. The {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}-discounted weight \\(w_k\\) below reduces a node's contribution exponentially with the number of rounds \\(\tau_k\\) elapsed since its last synchronization.

{% katex(block=true) %}
w_k = \frac{n_k}{n} \cdot \gamma^{\tau_k}
{% end %}

where \\(\tau_k\\) is the model {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} (rounds since last sync) and \\(\gamma \in (0.9, 0.99)\\) is the {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} discount.

3. **Hierarchical aggregation**: For large fleets, two-level aggregation reduces coordination. During partition, each connected cluster performs intra-cluster aggregation independently; cross-cluster aggregation resumes upon reconnection with {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} weighting. The diagram below shows the two-level structure: individual nodes feed cluster aggregators, which in turn feed a fleet-level aggregator that produces the global model \\(\theta^\*\\).

{% mermaid() %}
graph TD
    subgraph "Local Clusters"
        N1["Node 1"] --> L1["Cluster 1<br/>Aggregator"]
        N2["Node 2"] --> L1
        N3["Node 3"] --> L2["Cluster 2<br/>Aggregator"]
        N4["Node 4"] --> L2
    end

    subgraph "Fleet Level"
        L1 --> G["Fleet<br/>Aggregator"]
        L2 --> G
    end

    G --> M["Global Model<br/>theta*"]

    style L1 fill:#fff3e0,stroke:#f57c00
    style L2 fill:#fff3e0,stroke:#f57c00
    style G fill:#e3f2fd,stroke:#1976d2
{% end %}

> **Read the diagram**: During partition, each cluster runs its own local aggregation loop independently (orange nodes). When connectivity returns, cluster-level models flow up to the fleet aggregator (blue), which produces the global model \\(\theta^\*\\). Cluster-internal updates continue at full gossip rate even when the fleet-level link is severed.

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} Federated Anomaly Detection**:

12 vehicles, each with local autoencoder (280 bytes). Federated learning improves detection by pooling training data without centralization.

**Convergence analysis** under assumption set {% katex() %}\mathcal{A}_{FL}{% end %}:
- \\(A_1\\): Loss function {% katex() %}\mathcal{L}{% end %} is \\(L\\)-smooth and \\(\mu\\)-strongly convex
- \\(A_2\\): Partial participation \\(|S_t| \geq K/2\\) per round
- \\(A_3\\): Bounded gradient variance {% katex() %}\mathbb{E}[\|\nabla \mathcal{L}_k - \nabla \mathcal{L}\|^2] \leq \sigma^2{% end %}

The table below shows how the expected loss evolves with round count: it decreases at an \\(O(1/t)\\) rate toward the global optimum {% katex() %}\mathcal{L}^*{% end %}, with a residual term \\(O(\sigma^2/K)\\) that shrinks as more nodes participate.

| Round \\(t\\) | Expected Loss | Convergence Bound |
| ---: | :--- | :--- |
| 0 | \\(\mathcal{L}_0\\) | Baseline (local only) |
| \\(t\\) | \\(\mathcal{L}_t\\) | {% katex() %}\mathcal{L}^* + O(1/t) + O(\sigma^2/K){% end %} |
| {% katex() %}T \to \infty{% end %} | \\(\mathcal{L}^\*\\) | Optimal for aggregated data |

**Utility improvement derivation**: The formula decomposes the net gain from federated learning into two labeled terms — the recall improvement from pooling training data across all nodes, minus the gradient-communication cost over \\(T\\) rounds.

{% katex(block=true) %}
\Delta U_{\text{FL}} = U_{\text{federated}} - U_{\text{local}} = \underbrace{(R_{\text{fed}} - R_{\text{local}}) \cdot V_{\text{detect}}}_{\text{detection gain}} - \underbrace{C_{\text{comm}} \cdot T}_{\text{communication cost}}
{% end %}

{% katex() %}\text{sign}(\Delta U) > 0{% end %} because:
1. Effective training set size increases from \\(n_k\\) to {% katex() %}\sum_k n_k{% end %}, reducing generalization error by {% katex() %}O(1/\sqrt{K}){% end %}
2. Communication cost {% katex() %}C_{\text{comm}} = 560{% end %} bytes/round is negligible vs. detection value

**Communication efficiency**: Model updates require \\(280 \times 2 = 560\\) bytes per round. For connectivity probability \\(p_c = 0.1\\), expected rounds per vehicle-day: {% katex() %}p_c \cdot 24 \cdot 60 / T_{\text{round}}{% end %}.

**Differential Privacy for Sensitive Telemetry**:

Vehicle telemetry may reveal sensitive information (location patterns, operational tactics). Differential privacy adds Gaussian noise scaled by the gradient clipping bound \\(C\\) and privacy parameter \\(\sigma\\) to each gradient \\(g_k\\) before it is shared, producing noisy gradient \\(\tilde{g}_k\\) that prevents inference of individual data points.

{% katex(block=true) %}
\tilde{g}_k = g_k + \mathcal{N}(0, \sigma^2 \cdot C^2 \cdot I)
{% end %}

where \\(C\\) is the gradient clipping threshold and \\(\sigma\\) is calibrated for \\((\epsilon, \delta)\\)-differential privacy.

**Privacy-utility tradeoff derivation**: For \\((\epsilon, \delta)\\)-differential privacy with the Gaussian mechanism, the required noise multiplier \\(\sigma\\) is determined by the privacy budget \\(\epsilon\\) and the failure probability \\(\delta\\) as follows.

{% katex(block=true) %}
\sigma = \frac{C \cdot \sqrt{2 \ln(1.25/\delta)}}{\epsilon}
{% end %}

**Convergence-privacy relationship**: The ratio {% katex() %}T_{\text{private}} / T_{\text{baseline}}{% end %} below quantifies how many more training rounds the noisy private model needs compared to the baseline, as a function of the noise level \\(\sigma\\), the model dimension \\(d\\), and the gradient magnitude {% katex() %}\|\nabla \mathcal{L}\|{% end %}.

{% katex(block=true) %}
T_{\text{private}} / T_{\text{baseline}} = 1 + \frac{\sigma^2 \cdot d}{\|\nabla \mathcal{L}\|^2}
{% end %}

The table below evaluates the convergence-privacy trade-off at four privacy levels, from no noise ({% katex() %}\epsilon = \infty{% end %}) to strong privacy (\\(\epsilon = 0.1\\)); the Utility Bound column shows how detection accuracy degrades as noise \\(\sigma\\) increases relative to gradient magnitude.

| \\(\epsilon\\) | Noise \\(\sigma\\) | Slowdown Factor | Utility Bound |
| ---: | ---: | ---: | :--- |
| \\(\infty\\) | 0 | \\(1\times\\) | \\(U^\*\\) (optimal) |
| 10 | \\(O(0.1C)\\) | {% katex() %}\approx 1.3\times{% end %} | \\(U^\* - O(\sigma^2/n)\\) |
| 1 | \\(O(C)\\) | {% katex() %}\approx 3\times{% end %} | \\(U^\* - O(d\sigma^2/n)\\) |
| 0.1 | \\(O(10C)\\) | \\(>10\times\\) | Utility-dominated by noise |

For tactical systems, \\(\epsilon = 10\\) balances privacy (gradient direction obscured) against utility (convergence within \\(1.5\times\\) baseline).

**Personalization Layers**:

Fleet-wide models capture common failure patterns, but node-specific baselines and environmental offsets require local adaptation. The formula below decomposes node \\(k\\)'s prediction function into a federally trained shared component {% katex() %}f_{\text{shared}}{% end %} parameterized by {% katex() %}\theta_{\text{global}}{% end %} and a locally maintained residual {% katex() %}f_{\text{local}}{% end %} parameterized by \\(\theta_k\\).

{% katex(block=true) %}
f_k(x) = f_{\text{shared}}(x; \theta_{\text{global}}) + f_{\text{local}}(x; \theta_k)
{% end %}

- **Shared layers** (federated): Generic feature extraction, common failure patterns
- **Local layers** (not shared): Node-specific baselines, environmental adaptation

For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} autoencoders:
- Encoder ({% katex() %}8\to4\to3{% end %}): Federated - learns common compression
- Decoder ({% katex() %}3\to4\to8\to12{% end %}): Federated - learns common reconstruction
- Threshold: Local - adapts to vehicle-specific noise floor
- Bias terms: Local - adapts to vehicle-specific sensor offsets

**Handling Non-IID Data**:

Edge nodes experience different operating conditions (non-IID data). {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicles in mountain terrain see different failure modes than those in desert. Strategies:

1. **FedProx**: Augments the local loss with a proximal penalty that pulls node \\(k\\)'s parameters \\(\theta\\) toward the current global model {% katex() %}\theta^{(t)}{% end %}, with \\(\mu\\) controlling how tightly local updates are anchored.

{% katex(block=true) %}
\mathcal{L}_k^{\text{FedProx}}(\theta) = \mathcal{L}_k(\theta) + \frac{\mu}{2}\|\theta - \theta^{(t)}\|^2
{% end %}

2. **Clustered Federated Learning**: Identify node clusters with similar data distributions and federate only within each cluster. The diagram below shows three terrain-based clusters for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicles — mountain, desert, and urban — each maintaining its own shared model while nodes within a cluster exchange gradient updates with each other.

{% mermaid() %}
graph LR
    subgraph "Cluster A (Mountain)"
        V1["V1"]
        V3["V3"]
        V7["V7"]
    end

    subgraph "Cluster B (Desert)"
        V2["V2"]
        V5["V5"]
        V9["V9"]
    end

    subgraph "Cluster C (Urban)"
        V4["V4"]
        V6["V6"]
        V8["V8"]
    end

    V1 <--> V3 <--> V7
    V2 <--> V5 <--> V9
    V4 <--> V6 <--> V8

    CA["Model A"] --- V1
    CB["Model B"] --- V2
    CC["Model C"] --- V4

    style CA fill:#e3f2fd,stroke:#1976d2
    style CB fill:#fff3e0,stroke:#f57c00
    style CC fill:#e8f5e9,stroke:#388e3c
{% end %}

> **Read the diagram**: Vehicles operating in similar terrain — mountain, desert, urban — form separate federated clusters. Within each cluster, gradient updates flow between peers (double-headed arrows). Each cluster maintains a distinct shared model calibrated to its terrain's failure modes. This prevents a vehicle tuned for mountain pass conditions from contaminating the model for urban delivery routes.

3. **Multi-task learning**: Treat each node as a related task; share representations while allowing task-specific outputs.

**Convergence Guarantees Under Partition**:

The bound below gives the expected squared gradient norm after \\(T\\) rounds of asynchronous federated learning as a function of the participation rate \\(p\\) and maximum {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} {% katex() %}\tau_{\max}{% end %}; both terms decrease with \\(T\\), confirming that convergence is guaranteed whenever {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} is bounded.

{% katex(block=true) %}
\mathbb{E}[\|\nabla F(\theta^{(T)})\|^2] \leq O\left(\frac{1}{\sqrt{pT}} + \frac{\tau_{\max}^2}{T}\right)
{% end %}

Key insight: convergence slows but is still guaranteed if {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} is bounded. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} with {% katex() %}\tau_{\max} = 5{% end %} rounds and \\(p = 0.6\\), convergence to \\(\epsilon = 0.05\\) gradient norm requires \\(T \approx 30\\) rounds - achievable within one operational month.

*Under the Weibull connectivity model ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %}, [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-13)), the expected participation rate is {% katex() %}p \approx 1 - F_W(T_\text{tick}){% end %} where \\(F_W\\) is the Weibull CDF at the tick interval, and maximum staleness \\(\tau_\\text{max}\\) is bounded by the Weibull P95 partition duration. Denser connectivity (lower \\(T_\\text{acc}\\)) yields higher \\(p\\) and lower \\(\tau_\\text{max}\\), improving convergence.*

> **Cognitive Map**: Gossip is the protocol that turns per-node anomaly scores into fleet-wide health awareness — without any central server. The convergence guarantee degrades gracefully from {% katex() %}O(\ln n / f_g){% end %} in ideal meshes to {% katex() %}O(D \ln n / f_g(1-p_{\text{loss}})){% end %} in contested sparse ones. Staleness imposes a hard deadline {% katex() %}\tau_{\max}{% end %} on every health observation; Byzantine tolerance requires the compromised fraction of trust weight to stay below \\(1/3\\). Federated learning completes the picture: nodes improve their local detectors together without sharing raw telemetry. Next: what measurements matter most, and in what order, when resources are scarce.

---

## The Observability Constraint Sequence

### Hierarchy of Observability

**Problem**: Every measurement consumes power, compute, and bandwidth — the same resources needed for the primary mission. Trying to measure everything produces a system that measures everything badly. A system that has measured itself into a dead battery has solved the wrong problem.

**Solution**: The observability constraint sequence imposes a strict priority order. P0 (liveness) is always funded. P1 (resource exhaustion) is funded next. P2–P4 are funded only with what remains. This triage structure ensures that the most survival-critical knowledge is always available, regardless of how constrained resources become.

**Trade-off**: Higher priority levels are cheap but coarse; lower levels are expensive but diagnostic. P0 tells you the node is alive; P4 tells you why it failed. Budget determines how deep into the hierarchy you can reach.

With limited resources, what should be measured first?

The **observability constraint sequence** prioritizes metrics by importance, ensuring that the most survival-critical information is collected first whenever resources are scarce. The table below lists the five priority levels from P0 (fundamental liveness) to P4 (root-cause diagnosis), together with representative metrics and their resource cost tier.

<style>
#tbl_obs_priority + table th:first-of-type { width: 10%; }
#tbl_obs_priority + table th:nth-of-type(2) { width: 25%; }
#tbl_obs_priority + table th:nth-of-type(3) { width: 35%; }
#tbl_obs_priority + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_obs_priority"></div>

| Level | Category | Examples | Resource Cost |
| :--- | :--- | :--- | :--- |
| **P0** | Availability | Is it alive? Responding? | Minimal (heartbeat) |
| **P1** | Resource exhaustion | Power, memory, storage remaining | Low (counters) |
| **P2** | Performance degradation | Latency, throughput, error rates | Medium (aggregates) |
| **P3** | Anomaly patterns | Unusual behavior, drift | Medium-High (models) |
| **P4** | Root cause indicators | Why is it behaving this way? | High (correlation) |

A well-resourced system implements all levels. A constrained system implements as many as resources allow, starting from P0.

### Resource Budget for Observability

Observability competes with the primary mission for resources. The hard budget constraint below states that combined observability cost {% katex() %}R_{\text{observe}}{% end %} and mission cost {% katex() %}R_{\text{mission}}{% end %} must not exceed the device's total available resources {% katex() %}R_{\text{total}}{% end %}.

{% katex(block=true) %}
R_{\text{observe}} + R_{\text{mission}} \leq R_{\text{total}}
{% end %}

Where:
- {% katex() %}R_{\text{observe}}{% end %} = resources for self-measurement
- {% katex() %}R_{\text{mission}}{% end %} = resources for primary function
- {% katex() %}R_{\text{total}}{% end %} = total available resources

The objective below selects the allocation that maximizes the combined value of mission output {% katex() %}V_{\text{mission}}{% end %} and health-knowledge quality {% katex() %}V_{\text{health}}{% end %}, subject to that budget constraint.

{% katex(block=true) %}
\max \quad V_{\text{mission}}(R_{\text{mission}}) + V_{\text{health}}(R_{\text{observe}})
{% end %}

Subject to {% katex() %}R_{\text{observe}} + R_{\text{mission}} \leq R_{\text{total}}{% end %}

Typically:
- **Mission value** has diminishing returns: more resources yield proportionally less capability
- **Health value** has threshold effects: below minimum, health knowledge is useless; above minimum, marginal gains decrease

The optimal allocation gives sufficient resources to observability for reliable health knowledge, then allocates remainder to mission.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} allocation example**:
- Total compute: 1000 MIPS
- Total bandwidth to fusion: 100 Kbps

Allocation:
- P0-P1 monitoring: 50 MIPS (5%), 5 Kbps (5%) - heartbeats and resource counters
- P2-P3 monitoring: 100 MIPS (10%), 15 Kbps (15%) - performance aggregates, {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %}
- {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} overhead: 0 MIPS local, 20 Kbps (20%) - health propagation
- Mission (sensor processing): 850 MIPS (85%), 60 Kbps (60%) - primary function

This 15% observability overhead enables reliable self-measurement while preserving 85% of resources for mission function.

<span id="scenario-predictix"></span>

### Commercial Application: {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–36 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} Manufacturing Monitoring

{% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–36 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} monitors CNC machines in aerospace manufacturing. Each machine generates continuous telemetry: spindle vibration, coolant temperature, tool wear, power consumption. Challenge: detect failures before costly component defects, with unreliable plant floor connectivity. Machines must self-diagnose during disconnection.

The observability constraint sequence for {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–36 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} maps directly to manufacturing priorities:

<style>
#tbl_predictix_obs + table th:first-of-type { width: 10%; }
#tbl_predictix_obs + table th:nth-of-type(2) { width: 22%; }
#tbl_predictix_obs + table th:nth-of-type(3) { width: 40%; }
#tbl_predictix_obs + table th:nth-of-type(4) { width: 28%; }
</style>
<div id="tbl_predictix_obs"></div>

| Level | Category | PREDICTIX Implementation | Business Impact |
| :--- | :--- | :--- | :--- |
| **P0** | Machine alive | Heartbeat every 5s, cycle counter incrementing | Production stoppage detection |
| **P1** | Resource exhaustion | Coolant level, tool life remaining, chip bin capacity | Prevent mid-cycle failures |
| **P2** | Quality degradation | Surface finish variance, dimensional drift | Catch defects before scrap |
| **P3** | Anomaly patterns | Vibration signatures, power profile deviations | Predict failures 2-8 hours ahead |
| **P4** | Root cause | Cross-machine correlation, supply chain integration | Systemic issue identification |

**Local {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} architecture**: Each edge controller routes its four sensor streams through three parallel detection algorithms that feed a weighted-voting aggregator. The diagram below shows which sensors feed which detectors and how the outputs are fused into a single anomaly score.

{% mermaid() %}
graph LR
    subgraph "Sensor Inputs"
        VIB["Vibration<br/>10 kHz sampling"]
        TEMP["Temperature<br/>1 Hz sampling"]
        PWR["Power<br/>100 Hz sampling"]
        DIM["Dimensional<br/>Per-part"]
    end

    subgraph "Detection Algorithms"
        EWMA["EWMA<br/>Fast drift detection<br/>15 KB memory"]
        HW["Holt-Winters<br/>Shift pattern modeling<br/>48 KB memory"]
        IF["Isolation Forest<br/>Multivariate anomaly<br/>200 KB memory"]
    end

    subgraph "Fusion"
        AGG["Anomaly Aggregator<br/>Weighted voting"]
    end

    VIB --> EWMA
    TEMP --> EWMA
    PWR --> HW
    VIB --> IF
    TEMP --> IF
    PWR --> IF
    DIM --> IF
    EWMA --> AGG
    HW --> AGG
    IF --> AGG

    style EWMA fill:#e8f5e9,stroke:#388e3c
    style HW fill:#fff3e0,stroke:#f57c00
    style IF fill:#e3f2fd,stroke:#1976d2
    style AGG fill:#fce4ec,stroke:#c2185b
{% end %}

> **Read the diagram**: Four sensor streams enter from the left. Vibration and temperature feed EWMA (fast scalar spike detection). Power feeds Holt-Winters (shift pattern modeling with 8-hour and 24-hour seasonal components). All four streams feed the Isolation Forest for correlated multivariate anomalies. The three algorithm outputs feed the weighted-voting aggregator (pink) which produces a single anomaly score for the MAPE-K loop.

**Algorithm selection rationale**:
- **EWMA** for thermal and vibration baselines: Catches sudden shifts in spindle temperature or bearing vibration within 5-10 samples. Memory footprint: 15KB for 50 monitored parameters.
- **Holt-Winters** for power consumption: Captures 8-hour shift patterns (day shift runs harder than night shift), 24-hour maintenance cycles, and weekly production planning effects. Memory footprint: 48KB for 168-hour seasonality.
- **Isolation Forest** for multivariate anomalies: Detects unusual combinations - normal vibration plus normal temperature plus abnormal power consumption indicates bearing seizure imminent. Memory footprint: 200KB for 50-tree ensemble.

**Anomaly confidence fusion**: The combined score is a weighted sum of the three algorithm outputs, where each weight reflects that algorithm's relative detection power and score stability for {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–36 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %}'s failure modes.

{% katex(block=true) %}
\text{Anomaly Score} = w_E \cdot z_{\text{EWMA}} + w_H \cdot z_{\text{HW}} + w_I \cdot s_{\text{IF}}
{% end %}

**Weight derivation**: Weights are set proportional to each detector's AUC divided by its score variance ({% katex() %}w_i \propto \text{AUC}_i / \text{Var}(s_i){% end %}), rewarding detectors that are both accurate and consistent. Applying this to {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–36 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} gives the specific values below.

{% katex(block=true) %}
w_E = 0.3, \quad w_H = 0.25, \quad w_I = 0.45
{% end %}

Isolation Forest receives highest weight because multivariate detection (joint anomaly space) has higher AUC than marginal detectors for correlated failure modes.

**Staleness and decision authority**: As {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} increases and the cloud becomes unreachable, the edge controller assumes progressively more decision authority. The table below maps each {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} band to the corresponding cloud {% term(url="@/blog/2026-01-15/index.md#def-5", def="Continuous value between zero and one representing the current fraction of nominal bandwidth available; zero means fully denied, one means full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} and the scope of decisions the local controller takes autonomously.

| Staleness | Cloud Status | Local Authority |
| ---: | :--- | :--- |
| 0-30s | Connected | Advisory only; cloud makes decisions |
| 30s-5min | Degraded | Local P0-P2 decisions; P3+ queue for cloud |
| 5-30min | Intermittent | Local P0-P3 decisions; aggressive caching |
| >30min | Denied | Full local authority; conservative thresholds |

At 30+ minutes disconnection, the edge controller tightens anomaly thresholds by 20% (more false positives, fewer missed failures) because the cost of a missed failure without cloud backup is higher than during connected operation.

**Cross-machine {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}**: Machines on the same production line exchange health summaries via local Ethernet every 30 seconds. Each machine's summary is a three-field tuple capturing current anomaly level, estimated time to next maintenance, and parts produced since last inspection.

{% katex(block=true) %}
H_{\text{machine}} = (\text{anomaly\_score}, \text{time\_to\_maintenance}, \text{parts\_since\_inspection})
{% end %}

The line controller combines per-machine summaries into a single production-line health score {% katex() %}H_{\text{line}}{% end %} that is bottlenecked by the weakest machine's availability and averaged over all machines' quality scores.

{% katex(block=true) %}
H_{\text{line}} = \min_i H_i^{\text{availability}} \cdot \text{mean}_i(H_i^{\text{quality}})
{% end %}

Line health below threshold triggers automatic workload rebalancing - shifting high-precision parts away from degraded machines.

**Utility analysis**:

System utility \\(U\\) is production value minus the three cost categories that self-measurement can reduce: unplanned downtime {% katex() %}C_{\text{downtime}}{% end %}, scrapped parts {% katex() %}C_{\text{scrap}}{% end %}, and inspection overhead {% katex() %}C_{\text{inspection}}{% end %}.

{% katex(block=true) %}
U = V_{\text{production}} - C_{\text{downtime}} - C_{\text{scrap}} - C_{\text{inspection}}
{% end %}

**Utility improvement from self-measurement**: The formula decomposes the net economic gain into three labeled terms — downtime avoided, scrap avoided, and false-alarm inspection cost — so the break-even condition for each cost type can be evaluated separately.

{% katex(block=true) %}
\Delta U = \underbrace{R \cdot C_{\text{downtime}}}_{\text{avoided downtime}} + \underbrace{(R - \text{FNR}) \cdot C_{\text{scrap}}}_{\text{avoided scrap}} - \underbrace{\text{FPR} \cdot C_{\text{inspection}}}_{\text{false alarm cost}}
{% end %}

{% katex() %}\text{sign}(\Delta U) > 0{% end %} when:

{% katex(block=true) %}
R > \frac{\text{FPR} \cdot C_{\text{inspection}}}{C_{\text{downtime}} + C_{\text{scrap}}}
{% end %}

For manufacturing where {% katex() %}C_{\text{scrap}} \gg C_{\text{inspection}}{% end %} ({% katex() %}C_{\text{scrap}} / C_{\text{inspection}} \approx 500{% end %} for high-value components), even moderate recall (\\(R > 0.8\\)) with high FPR (\\(< 0.1\\)) yields \\(\Delta U > 0\\). The observability constraint sequence delivers economic value when detection value exceeds false alarm cost.

---

## RAVEN Self-Measurement Protocol

The {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} drone swarm requires self-measurement at two levels: individual drone health and swarm-wide coordination state.

### Per-Drone Local Measurement

Each drone continuously monitors:

**Power State**
- Battery voltage, current draw, temperature
- Estimated flight time remaining: {% katex() %}t_{\text{remain}} = E_{\text{remaining}} / P_{\text{avg}}{% end %}
- Anomaly detection: Sudden voltage drop, unusual current patterns

**Sensor Health**
- Camera: Image quality metrics, focus response, exposure accuracy
- Radar: Return signal strength, calibration consistency
- GPS: Satellite count, position dilution of precision (PDOP)
- IMU: Gyro drift rate, accelerometer noise floor

**Link Quality**
- RSSI to each mesh neighbor
- Packet delivery ratio per link
- Latency distribution per link

**Mission Progress**
- Coverage completion percentage
- Threat detection count
- Position relative to assigned sector

EWMA tracking on each metric with \\(\alpha = 0.1\\) (10-second effective memory). Anomaly threshold at \\(3\sigma\\) for critical metrics (power, flight controls), \\(2\sigma\\) for secondary metrics (sensors, links).

### Swarm-Wide Health Inference

{% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} protocol parameters:
- Exchange rate: 0.2 Hz (once per 5 seconds)
- Staleness threshold: 30 seconds (confidence drops below 90%)
- Trust decay: \\(\gamma_s = 0.05\\) per second
- Maximum useful {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}: 60 seconds (confidence drops below 50%)

*Relationship*: The {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} threshold (30s) marks where data begins degrading meaningfully - decisions based on 30s-old data have ~90% confidence. The maximum useful {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} (60s) marks where confidence falls below 50% - beyond this, the data provides little more than a guess. These are design parameters chosen for the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} mission envelope; from {% term(url="#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %}, {% katex() %}\tau_{\max}{% end %} scales as \\((\sigma/\Delta h)^2\\) so tightening decision margins reduces useful {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} rapidly.

Health vector per drone contains:
- Binary availability (alive/silent)
- Power state (percentage)
- Critical sensor status (functional/degraded/failed)
- Mission {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier from heartbeat-only survival at the base level to full fleet integration at the top; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %} ({% katex() %}\mathcal{L}_0{% end %}-{% katex() %}\mathcal{L}_4{% end %})

Merge function uses timestamp-weighted average for numeric values, latest-timestamp-wins for categorical values. In contested environments where clock drift is measurable, replace wall-clock LWW with {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %}-aware merge ({% term(url="@/blog/2026-02-05/index.md#def-62", def="HLC-Aware CRDT Merge Function: CRDT merge using HLC timestamps for causal ordering, resolving conflicts correctly even when physical clocks have drifted") %}Definition 62{% end %}, Fleet Coherence Under Partition) using the {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}Hybrid Logical Clock{% end %} ordering to determine recency; node-ID tiebreakers resolve simultaneous {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} values.

**Convergence guarantees**: With logarithmic propagation dynamics, fleet-wide health convergence occurs within 30-40 seconds - fast enough to track operational state changes while remaining robust to individual message losses.

### Anomaly Detection and Self-Diagnosis

Cross-sensor correlation matrix maintained locally. Example correlations:
- GPS PDOP vs. IMU drift: High PDOP should not correlate with low drift (if they do, likely spoofing)
- Battery voltage vs. current: Should follow known discharge curve (deviation indicates cell degradation)
- Camera image vs. radar return: Consistent threat detections (divergence suggests sensor failure)

Self-diagnosis follows a structured decision process, mapping each combination of anomaly type and cross-sensor correlation to the most likely failure cause and the recommended autonomous response.

<style>
#tbl_diagnosis + table th:first-of-type { width: 30%; }
#tbl_diagnosis + table th:nth-of-type(2) { width: 30%; }
#tbl_diagnosis + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_diagnosis"></div>

| Observation Pattern | Diagnosis | Action |
| :--- | :--- | :--- |
| Power anomaly with neighbors unaffected or recent maneuver | Local power issue | Reduce power consumption, report to swarm |
| Sensor anomaly with cross-sensor consistency | Environmental condition | Continue with degraded confidence |
| Sensor anomaly with cross-sensor inconsistency | Sensor failure | Disable sensor, rely on alternatives |
| Communication anomaly affecting multiple neighbors | Environmental interference or jamming | Increase transmit power, switch frequencies |
| Communication anomaly affecting only self | Local radio failure | Attempt radio restart, fall back to minimal beacon |

The diagnosis is probabilistic - the table represents the most likely paths, but confidence levels are maintained throughout.

---

## CONVOY Self-Measurement Protocol

The {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} ground vehicle network operates with different constraints: vehicles have more resources than drones but face different failure modes.

### Convoy-Level Health Inference

Hierarchical aggregation:
1. **Primary mode**: Lead vehicle collects health from all vehicles, computes aggregate, distributes summary
2. **Fallback mode**: If lead unreachable, peer-to-peer {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} among reachable vehicles

Lead vehicle aggregation:
- Computes minimum {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier from heartbeat-only survival at the base level to full fleet integration at the top; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %} across convoy: {% katex() %}L_{\text{convoy}} = \min_i L_i{% end %}
- Identifies vehicles with critical anomalies
- Determines convoy-wide constraints (e.g., maximum safe speed based on worst vehicle)

Fallback {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} parameters:
- Exchange rate: 0.1 Hz (once per 10 seconds) - lower than {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} due to vehicle stability
- Staleness threshold: 60 seconds
- Trust decay: \\(\gamma_s = 0.02\\) per second

### Anomaly Detection Focus

**Position spoofing detection**:

Each vehicle tracks its own position via GPS, INS, and dead reckoning, and also receives claimed positions from neighbors. The discrepancy {% katex() %}\Delta_{ij}{% end %} below measures how far vehicle \\(i\\)'s claimed position deviates from where neighbor \\(j\\) independently observed it; a large discrepancy across multiple neighbors indicates spoofing.

{% katex(block=true) %}
\Delta_{ij} = \|p_i^{\text{claimed}} - p_i^{\text{observed-by-}j}\|
{% end %}

If {% katex() %}\Delta_{ij}{% end %} exceeds threshold for vehicle \\(i\\) as observed by multiple neighbors \\(j\\), vehicle \\(i\\) is flagged for position anomaly.

Vehicle \\(i\\) is flagged as potentially spoofed if \\(\geq k\\) neighbors (\\(k = \lceil n/3 \rceil\\)) each independently report {% katex() %}\Delta_{ij} > \theta{% end %}. A suitable threshold is {% katex() %}\theta = d_{\max}/2{% end %} where {% katex() %}d_{\max}{% end %} is the maximum distance a vehicle can travel during one {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} period — any discrepancy larger than this cannot be explained by legitimate movement.

**Communication anomaly classification**:

Distinguish jamming from terrain effects:
- **Jamming**: Affects all frequencies, correlates with adversarial activity, affects multiple vehicles
- **Terrain**: Affects specific paths, correlates with geographic features, predictable from maps

Use convoy's position history to build terrain propagation model. Deviations from model suggest adversarial interference.

**Integration with Semi-Markov connectivity model**:

From the [Semi-Markov connectivity model](@/blog/2026-01-15/index.md#def-12), the expected sojourn time distributions and embedded transition probabilities are known. A transition is flagged as anomalous when its model-predicted probability falls below threshold {% katex() %}\theta_{\text{transition}}{% end %}, meaning the observed regime change is too abrupt or too frequent to be explained by natural causes.

{% katex(block=true) %}
\text{anomaly} = P(\text{observed transition} | \text{model}) < \theta_{\text{transition}}
{% end %}

Unexpectedly rapid transitions from connected to denied suggest adversarial action rather than natural degradation.

---

## OUTPOST Self-Measurement Protocol

The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensor mesh operates with the most extreme constraints: ultra-low power, extended deployment durations (30+ days), and fixed positions that make physical inspection impractical.

### Per-Sensor Local Measurement

Each sensor node continuously monitors with minimal power:

**Power State**
- Solar panel voltage and current
- Battery state of charge (SoC): {% katex() %}\text{SoC} = E_{\text{current}} / E_{\text{capacity}}{% end %}
- Power budget: {% katex() %}P_{\text{solar}} - P_{\text{load}} = P_{\text{net}}{% end %}
- Anomaly detection: Solar panel degradation, battery cell failure

**Environmental Monitoring**
- Temperature: Affects sensor calibration and battery performance
- Humidity: Risk of condensation and corrosion
- Vibration: Indicates physical disturbance or tampering
- Ambient light: Validates solar panel output

<span id="prop-16"></span>
**Proposition 16** (Power-Aware Measurement Scheduling). *For a sensor with solar charging profile {% katex() %}P_{\text{solar}}(t){% end %} and measurement cost \\(C_m\\) per measurement, the optimal measurement schedule maximizes information gain while maintaining positive energy margin:*

*Measure as often as information justifies, subject to never depleting the battery below a safety reserve.*

{% katex(block=true) %}
\max \sum_t I(m_t) \quad \text{s.t.} \quad \int_0^T (P_{\text{solar}}(t) - P_{\text{base}} - \sum_{t'} C_m \cdot \delta(t - t')) \, dt \geq E_{\text{reserve}}
{% end %}

*where \\(I(m_t)\\) is the information gain from measurement at time \\(t\\) and {% katex() %}E_{\text{reserve}}{% end %} is the required energy reserve.*

In practice, this means scheduling high-power measurements (radar, active sensors) during peak solar hours and relying on low-power passive measurements during night and low-light periods.

*Greedy heuristic*: Sort measurements by information-gain-per-watt ratio \\(I(m)/C_m\\). Schedule in order until power budget exhausted. For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}, this yields:
1. Passive seismic (0.1W, high info): Always on
2. Passive acoustic (0.2W, medium info): Always on
3. Active IR scan (2W, high info): Peak solar only (10am-2pm)
4. Radar ping (5W, very high info): Midday only (11am-1pm), battery > 80%

This heuristic achieves \\(O(n \log n)\\) computation complexity, suitable for embedded deployment. The gap to optimal depends on environmental correlation structure.

> **Physical translation**: Don't measure things you can't act on. A sensor reading is only worth taking if it can be transmitted, stored, or acted upon before the battery budget forces a downgrade. Prop 7 computes the exact measurement rate that maximizes information gain within the energy envelope — measuring faster when power is abundant and slowing to a trickle in survival mode rather than stopping completely (which would blind the healing loop entirely).

> **Empirical status**: The optimization formulation is exact given the solar profile {% katex() %}P_{\text{solar}}(t){% end %} and cost model \\(C_m\\). The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} scheduling heuristic (passive seismic always-on through radar at midday) is an illustrative prioritization, not derived from a measured information-gain-per-watt experiment. Solar profiles vary by geography, season, and panel orientation — calibrate {% katex() %}P_{\text{solar}}(t){% end %} from at least 48 hours of deployment-site data before first use.

### Observer Parsimony: The Overhead Budget Constraint

{% term(url="#prop-16", def="Power-Aware Measurement Scheduling: optimal sensor sampling interval maximizing anomaly detection recall per unit energy under battery constraint") %}Proposition 16{% end %} schedules measurements to preserve energy margin. A deeper constraint applies to the autonomic layer itself: the Observer Parsimony Condition. If the monitoring layer consumes more CPU and RAM than the margin separating the current capability level from the next downgrade, the observer becomes the cause of the level transition it exists to prevent. This is the **Heisenberg Observation Problem** for resource-constrained autonomic systems — the act of observing accelerates the failure being observed.

<span id="def-29"></span>

**Definition 29** (Autonomic Overhead Budget). For each capability level {% katex() %}\mathcal{L}_q,\ q \in \{0,1,2,3,4\}{% end %}, the *overhead budget* is a triple \\((\pi_q,\\, M_q,\\, T_q)\\) specifying the maximum CPU fraction, RAM reservation, and minimum MAPE-K tick interval permitted to the entire autonomic observation layer:

<style>
#tbl_overhead_budget + table th:first-of-type { width: 8%; }
#tbl_overhead_budget + table th:nth-of-type(2) { width: 20%; }
#tbl_overhead_budget + table th:nth-of-type(3) { width: 12%; }
#tbl_overhead_budget + table th:nth-of-type(4) { width: 12%; }
#tbl_overhead_budget + table th:nth-of-type(5) { width: 12%; }
#tbl_overhead_budget + table th:nth-of-type(6) { width: 36%; }
</style>
<div id="tbl_overhead_budget"></div>

| Level | Regime | CPU \\(\pi_q\\) | RAM \\(M_q\\) | Tick floor \\(T_q\\) | Permitted algorithm tier |
| :--- | :--- | ---: | ---: | ---: | :--- |
| \\(\mathcal{L}_0\\) | Survival — complete isolation | 0.1% | 4 KB | 60 s | Q15 fixed-point EWMA + CUSUM only; no FPU; no gossip |
| \\(\mathcal{L}_1\\) | Minimal mission | 0.5% | 64 KB | 10 s | Q15 fixed-point EWMA + CUSUM; no Kalman; no Isolation Forest |
| \\(\mathcal{L}_2\\) | Degraded operation | 1.0% | 256 KB | 5 s | Floating-point EWMA; Holt-Winters; no Isolation Forest |
| \\(\mathcal{L}_3\\) | Normal operation | 2.0% | 1 MB | 1 s | Full scalar Kalman; Isolation Forest sketch (\\(\leq 50\\) trees) |
| \\(\mathcal{L}_4\\) | Full connectivity | No local limit | No local limit | 0.1 s | Any algorithm; offload to cloud |

The budgets are monotone: {% katex() %}\pi_0 \leq \pi_1 \leq \ldots \leq \pi_4{% end %} and {% katex() %}M_0 \leq M_1 \leq \ldots \leq M_4{% end %}. The {% katex() %}\mathcal{L}_3{% end %} ceiling of 2% CPU and 1 MB RAM is the design constraint for the full Self-Measurement stack described in this article.

> **Physical translation**: At {% katex() %}\mathcal{L}_0{% end %} (battery critically low, all connectivity severed), a node running floating-point Kalman updates at 1 Hz would consume roughly 60 FP multiply-adds per second on ARM Cortex-M4 — not catastrophic in isolation, but the covariance update, gossip Welford estimators, and Isolation Forest inference stack together into a measurable fraction of a 64 MHz core. The Q15 fixed-point EWMA replaces all of this with 12 integer operations per tick — under \\(1\\,\mu\text{s}\\) at 64 MHz — leaving the CPU in WFI (Wait For Interrupt) sleep the remaining 59.999 seconds.

<span id="prop-17"></span>

**Proposition 17** (Observer Parsimony Condition). Let \\(u(t) \in [0,1]\\) be the node's current CPU utilization fraction, \\(u_q\\) the utilization fraction that triggers downgrade from {% katex() %}\mathcal{L}_q{% end %} to {% katex() %}\mathcal{L}_{q-1}{% end %}, and \\(\pi_q\\) the observation overhead fraction at level \\(q\\). The autonomic observation layer satisfies the *parsimony condition* iff:

*Observing must consume less CPU headroom than remains before the next forced downgrade — the watcher must not trigger what it watches for.*

{% katex(block=true) %}
\pi_q < u_q - u(t)
{% end %}

*That is, the overhead consumed by observing must be strictly less than the CPU margin remaining before the next forced downgrade. If the condition is violated, observing at level \\(q\\) guarantees a transition to {% katex() %}\mathcal{L}_{q-1}{% end %}.*

*Note*: \\(u(t)\\) denotes CPU utilization fraction here (distinct from the compute-to-transmit energy ratio \\(\rho = T_d/T_s\\) from {% term(url="@/blog/2026-01-15/index.md#prop-1", def="Compute-Transmit Dominance Threshold: local computation is energetically cheaper than radio offloading for decisions requiring fewer than roughly one thousand compute cycles") %}Proposition 1{% end %} in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#prop-1), which is a hardware constant, not a runtime measurement).

*Proof*: If \\(u(t) + \pi_q \geq u_q\\), then enabling level-\\(q\\) observation pushes utilization past the downgrade trigger \\(u_q\\), causing an immediate transition to {% katex() %}\mathcal{L}_{q-1}{% end %}. This transition is itself observed by the MAPE-K Monitor loop, potentially triggering further recursive observation overhead — a positive feedback path to {% katex() %}\mathcal{L}_0{% end %}. \\(\square\\)

> **Physical translation**: An autonomic manager that spends 3% of CPU on health monitoring when the CPU is already at 98% utilization will itself push the node over the edge into survival mode. The observation budget must be sized against the *current* CPU margin, not against the theoretical maximum. {% term(url="#prop-17", def="Power-Aware Gossip Rate Adaptation: reduces gossip fanout proportionally with battery level while preserving convergence above a minimum coverage threshold") %}Proposition 17{% end %} is the formal statement of "the doctor must not kill the patient with the examination."

> *(Scope note: The parsimony condition uses CPU utilization fraction \\(u(t)\\) — a single-resource signal intentionally scoped to CPU only. The capability-level downgrade trigger in {% term(url="@/blog/2026-01-15/index.md#prop-7", def="Architectural Regime Boundaries: formal conditions under which the connectivity regime determines whether cloud or partition-first architecture is optimal") %}Proposition 7{% end %} uses the composite resource state \\(R(t)\\) (battery SOC, free memory, CPU). These gates are complementary rather than redundant: the composite \\(R(t)\\) gate prevents downgrade under adequate-CPU-but-depleted-battery conditions; the parsimony condition prevents the observation layer itself from consuming the last CPU margin. A node can satisfy {% katex() %}R(t) \geq R_{\min}{% end %} yet violate parsimony if CPU is near \\(u_q\\) regardless of battery state. Both conditions must be evaluated at each MAPE-K tick.)*

**Assumption set {% katex() %}\mathcal{A}_{63}{% end %}**: CPU utilization \\(u(t)\\) is measured by a hardware cycle counter (DWT on ARM Cortex-M) with negligible overhead (\\(<0.001\\%\\)), not by the autonomic layer itself. The downgrade thresholds \\(u_q\\) are static design parameters, not runtime estimates.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} scenario**: At {% katex() %}\mathcal{L}_3{% end %}, the full Self-Measurement stack consumes approximately 2% of the 64 MHz Cortex-M4 core; violating parsimony near the 80% CPU threshold would trigger immediate cascade to survival mode.

> **Empirical status**: The parsimony condition is analytically exact. The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} figure of ~2% CPU for the Self-Measurement stack at {% katex() %}\mathcal{L}_3{% end %} and the 80% downgrade threshold are design parameters, not measured CPU profiles; actual overhead depends on MCU clock speed, compiler optimization, and workload mix. Validate \\(\pi_q\\) values with cycle-accurate profiling before deployment.

**Switched-Mode Stability Extension: Limit-Cycle Prevention**

{% term(url="#prop-17", def="Power-Aware Gossip Rate Adaptation: reduces gossip fanout proportionally with battery level while preserving convergence above a minimum coverage threshold") %}Proposition 17{% end %} identifies when a single downgrade transition occurs. It does not bound the *number* of transitions: if utilization oscillates near the downgrade threshold \\(u_q\\), the system can enter an infinite downgrade-upgrade cycle — revising to {% katex() %}\mathcal{L}_{q-1}{% end %}, recovering, promoting back to {% katex() %}\mathcal{L}_q{% end %}, then downgrading again — which permanently precludes a stable operating level without ever reaching {% katex() %}\mathcal{L}_0{% end %}. The extension below reframes the multi-level transition logic as a **discrete-time switched linear system**, constructs a Common Lyapunov Function, and derives the minimum dwell-time that eliminates limit cycles regardless of workload variability or changes in {% katex() %}T_{\text{tick}}{% end %}.

<span id="def-30"></span>
**Definition 30** (Discrete-Time Switched Utilization System). *Let {% katex() %}\sigma(t) = q \in \{0,1,2,3,4\}{% end %} be the active capability level. In mode \\(q\\) with tick interval \\(T_q\\) (Definition 29), CPU utilization evolves as:*

{% katex(block=true) %}
u(t + T_q) = \alpha \cdot u(t) + \pi_q + w(t), \qquad w(t) \in [-\delta_w,\, \delta_w]
{% end %}

*where {% katex() %}\alpha \in (0,1){% end %} is the per-tick utilization decay factor (workload dissipation), {% katex() %}\pi_q{% end %} is the observer overhead at level \\(q\\) ({% term(url="#def-29", def="Adaptive Gossip Rate Controller: feedback controller adjusting gossip fanout based on measured convergence lag, preventing under- and over-gossiping") %}Definition 29{% end %}), and \\(w(t)\\) is bounded external disturbance. The unique mode-\\(q\\) equilibrium is:*

{% katex(block=true) %}
u_q^* = \frac{\pi_q}{1 - \alpha}
{% end %}

*Switching rules: downgrade {% katex() %}q \to q-1{% end %} when {% katex() %}u(t) + \pi_q \geq u_q{% end %} ({% term(url="#prop-17", def="Power-Aware Gossip Rate Adaptation: reduces gossip fanout proportionally with battery level while preserving convergence above a minimum coverage threshold") %}Proposition 17{% end %} violated); upgrade {% katex() %}q \to q+1{% end %} eligible only when {% katex() %}u(t) + \pi_{q+1} < u_{q+1} - \delta_{\text{hyst}}{% end %} AND dwell-time {% katex() %}\Delta t_{\text{dwell}}(q){% end %} has elapsed since the last transition.*

- **Parameters**: {% katex() %}\alpha = 1 - T_q/\tau_u{% end %} where {% katex() %}\tau_u{% end %} is the CPU load decay time constant; for burst compute tasks on OUTPOST sensors, {% katex() %}\tau_u \approx 5\,T_q{% end %} at each level, giving {% katex() %}\alpha \approx 0.80{% end %} independent of \\(q\\).

<span id="prop-18"></span>
**Proposition 18** (Switched-Mode CLF Stability and Dwell-Time Bound). *Under {% term(url="#def-30", def="Discrete-Time Switched Utilization System: CPU utilization modeled as a switched linear system with per-mode observer overhead and bounded disturbance") %}Definition 30{% end %} with {% katex() %}\alpha \in (0,1){% end %} and disturbance bound {% katex() %}\delta_w \geq 0{% end %}:*

*Each observation mode is individually stable; switching between modes is safe provided the node waits a minimum dwell time before switching again.*

*(i) **Intra-mode contraction.** Let {% katex() %}e_q(t) = u(t) - u_q^*{% end %}. Then {% katex() %}V(e_q) = e_q^2{% end %} is a Lyapunov function for each mode in isolation:*

{% katex(block=true) %}
\Delta V \;=\; (\alpha^2 - 1)\,e_q^2(t) \;<\; 0 \quad \text{for all } e_q(t) \neq 0,\; \delta_w = 0
{% end %}

*The error decays geometrically at rate \\(\alpha\\) per tick:*

{% katex(block=true) %}
e_q(t + k\,T_q) = \alpha^k \cdot e_q(t_{\text{enter}})
{% end %}

*The number of ticks to reach {% katex() %}|e_q| < \varepsilon{% end %} is {% katex() %}\lceil \log_\alpha(\varepsilon/|e_q(t_{\text{enter}})|) \rceil{% end %}, independent of the value of \\(T_q\\). The wall-clock convergence time scales with \\(T_q\\), but the Lyapunov decrease per tick — and therefore the tick count — does not.*

*(ii) **Inter-mode boundedness.** At a downgrade {% katex() %}q \to q-1{% end %}, the state \\(u(t)\\) is continuous. The error in the new mode satisfies:*

{% katex(block=true) %}
e_{q-1}(t^+) = e_q(t^-) + \underbrace{(u_q^* - u_{q-1}^*)}_{\geq\, 0}
{% end %}

*Each downgrade injects at most {% katex() %}u_q^* - u_{q-1}^* = (\pi_q - \pi_{q-1})/(1-\alpha){% end %} of error. Since there are at most four downgrades, total error injection across the full sequence is bounded by {% katex() %}\pi_4/(1-\alpha) \leq 1{% end %}.*

*(iii) **Dwell-time lower bound.** Define the safe re-upgrade margin:*

{% katex(block=true) %}
u_{\text{safe}}(q) \;=\; u_q - \pi_q - \delta_{\text{hyst}}
{% end %}

*A limit cycle between levels \\(q\\) and \\(q-1\\) requires an upgrade attempt before \\(u(t)\\) has decayed below {% katex() %}u_{\text{safe}}(q){% end %} — which immediately triggers another downgrade. The minimum dwell-time at level \\(q-1\\) that eliminates this possibility is:*

{% katex(block=true) %}
\Delta t_{\text{dwell}}(q-1) \;=\; T_{q-1} \cdot \left\lceil \frac{\displaystyle\log\!\left(\frac{u_q - u_{q-1}^*}{u_{\text{safe}}(q) - u_{q-1}^*}\right)}{\log(1/\alpha)} \right\rceil
{% end %}

*Proof of (i)*: From {% term(url="#def-30", def="Reputation-Weighted Gossip: gossip variant weighting updates by sender reputation score, reducing Byzantine influence on health state propagation") %}Definition 30{% end %} with {% katex() %}\delta_w = 0{% end %}:

{% katex(block=true) %}
e_q(t+T_q) \;=\; u(t+T_q) - u_q^* \;=\; \alpha\,u(t) + \pi_q - \frac{\pi_q}{1-\alpha} \;=\; \alpha\!\left(u(t) - \frac{\pi_q}{1-\alpha}\right) \;=\; \alpha\,e_q(t)
{% end %}

*Therefore {% katex() %}V(e_q(t+T_q)) = \alpha^2\,V(e_q(t)){% end %} and {% katex() %}\Delta V = (\alpha^2-1)\,V < 0{% end %} for {% katex() %}\alpha < 1{% end %}. The convergence rate \\(\alpha\\) does not appear in the expression for \\(T_q\\), so changing \\(T_q\\) does not affect the tick-by-tick Lyapunov decrease. With bounded disturbance {% katex() %}\delta_w > 0{% end %}, the bounded real lemma gives ultimate boundedness: {% katex() %}V(e_q) \leq \delta_w^2/(1-\alpha^2){% end %} in steady state. \\(\square\\)*

*Proof of (iii)*: After a downgrade at \\(t_0\\) with {% katex() %}u(t_0^-) \approx u_q{% end %}, the trajectory at level \\(q-1\\) is:*

{% katex(block=true) %}
u(t_0 + k\,T_{q-1}) \;=\; u_{q-1}^* + \alpha^k\,(u_q - u_{q-1}^*)
{% end %}

*Setting this equal to {% katex() %}u_{\text{safe}}(q){% end %} and solving for \\(k\\) gives the stated expression. Any upgrade attempted before tick \\(k^\*\\) satisfies {% katex() %}u(t) > u_{\text{safe}}(q){% end %}, so {% katex() %}u(t) + \pi_q > u_q - \delta_{\text{hyst}}{% end %}, and the Schmitt-trigger upgrade gate ({% term(url="@/blog/2026-01-29/index.md#def-47", def="Schmitt Trigger Hysteresis: dual threshold with separate trigger and release levels preventing healing loop flapping near a boundary") %}Definition 47{% end %} in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-47)) with hysteresis {% katex() %}\delta_{\text{hyst}}{% end %} blocks the transition. \\(\square\\)*

**OUTPOST calibration** ({% katex() %}\alpha = 0.80{% end %}, {% katex() %}\delta_{\text{hyst}} = 0.02{% end %}):

| Transition | {% katex() %}u_q{% end %} | {% katex() %}u_{q-1}^*{% end %} | {% katex() %}u_{\text{safe}}{% end %} | {% katex() %}k^*{% end %} | {% katex() %}\Delta t_{\text{dwell}}{% end %} | Tick floor {% katex() %}T_{q-1}{% end %} | Auto-satisfied? |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| {% katex() %}\mathcal{L}_3 \to \mathcal{L}_2{% end %} | 0.80 | 0.05 | 0.76 | 1 | 5 s | 5 s | Yes — 1 tick |
| {% katex() %}\mathcal{L}_2 \to \mathcal{L}_1{% end %} | 0.60 | 0.025 | 0.56 | 1 | 10 s | 10 s | Yes — 1 tick |
| {% katex() %}\mathcal{L}_1 \to \mathcal{L}_0{% end %} | 0.50 | 0.005 | 0.46 | 1 | 60 s | 60 s | Yes — 1 tick |

The dwell-time requirement is always met by waiting **one tick** at the lower level. The tick floor of {% term(url="#def-29", def="Adaptive Gossip Rate Controller: feedback controller adjusting gossip fanout based on measured convergence lag, preventing under- and over-gossiping") %}Definition 29{% end %} is the natural dwell-time enforcer — no additional timer infrastructure is required. The existing MAPE-K tick clock implements the constraint by construction.

**Gain-bound invariance across {% katex() %}T_{\text{tick}}{% end %} changes.** The MAPE-K loop stability criterion ({% term(url="@/blog/2026-01-29/index.md#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#prop-22)) requires control gain {% katex() %}K < 1/(1 + \tau/T_{\text{tick}}){% end %}. As {% katex() %}T_{\text{tick}}{% end %} increases (capability downgrade), the bound relaxes monotonically: a gain \\(K\\) satisfying the tightest constraint at the highest level automatically satisfies the constraint at all lower levels. If \\(K\\) is calibrated at {% katex() %}\mathcal{L}_4{% end %} ({% katex() %}T_{\text{tick}} = 0.1\,\text{s}{% end %}), it remains stable at {% katex() %}\mathcal{L}_0{% end %} ({% katex() %}T_{\text{tick}} = 60\,\text{s}{% end %}) without recalibration.

**Corollary** (Error Convergence Under Changing {% katex() %}T_{\text{tick}}{% end %}). *Suppose the switching sequence undergoes \\(m \leq 4\\) downgrades before reaching stable level {% katex() %}q_\infty{% end %}. The error at time \\(t\\) after the last transition satisfies:*

{% katex(block=true) %}
|e_{q_\infty}(t)| \;\leq\; \alpha^{\lfloor t/T_{q_\infty} \rfloor} \cdot \left(|e_0| + \frac{\pi_4}{1-\alpha}\right) \;\to\; 0 \quad \text{as } t \to \infty
{% end %}

*The error converges to zero exponentially regardless of the path {% katex() %}q_0 \to \cdots \to q_\infty{% end %} and regardless of how many times {% katex() %}T_{\text{tick}}{% end %} changed along the way. The convergence exponent \\(\alpha\\) is a hardware characteristic of the MCU's workload dissipation, not a function of {% katex() %}T_{\text{tick}}{% end %}.*

> **Empirical status**: The Lyapunov stability result for individual modes is mathematically exact given the linear model. The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} dwell-time table (\\(\alpha = 0.80\\), {% katex() %}\delta_{\text{hyst}} = 0.02{% end %}) uses illustrative design parameters; actual convergence rate \\(\alpha\\) must be measured from the specific MCU workload profile, not assumed. The "one tick is sufficient" result holds only when the tick floor exactly equals the computed {% katex() %}\Delta t_{\text{dwell}}{% end %} — verify equality at each capability level before deployment.

#### Fixed-Point Algorithm Tier ({% katex() %}\mathcal{L}_0{% end %}–{% katex() %}\mathcal{L}_1{% end %})

<span id="def-31"></span>

**Definition 31** (Fixed-Point Sensor State). At {% katex() %}\mathcal{L}_0{% end %} and {% katex() %}\mathcal{L}_1{% end %}, the scalar Kalman filter (Definition 20) is replaced by a Q15 fixed-point EWMA. The *sensor observation record* for sensor \\(i\\) is a triple of 16-bit integers:

{% katex(block=true) %}
\mathbf{s}_i = \bigl(\hat{\mu}_i^{(15)},\; \hat{\sigma}_i^{2(15)},\; S_i^{(15)}\bigr)
{% end %}

where the superscript \\((15)\\) denotes Q15 fixed-point representation (1 sign bit, 15 fractional bits; range \\([-1, +1)\\), resolution {% katex() %}2^{-15} \approx 3 \times 10^{-5}{% end %}). The Q15 EWMA update for one observation {% katex() %}x_t^{(15)}{% end %} is:

{% katex(block=true) %}
\hat{\mu}^{(15)}_{\text{new}} = \Bigl(\alpha_{q}^{(15)} \cdot x_t^{(15)} + (32768 - \alpha_{q}^{(15)}) \cdot \hat{\mu}^{(15)}_{\text{old}}\Bigr) \mathbin{\gg} 15
{% end %}

where {% katex() %}\alpha_q^{(15)} = \lfloor \alpha_q \cdot 32768 \rfloor{% end %} is the pre-computed integer smoothing weight and \\(\gg 15\\) is a right-shift (equivalent to dividing by {% katex() %}2^{15}{% end %}). Variance update follows the same pattern with the squared deviation. The CUSUM accumulator {% katex() %}S_i^{(15)}{% end %} uses integer subtraction and a hardware-assisted compare-with-reset.

- **CPU cost**: 6 16-bit multiply-shifts + 2 comparisons = **12 ARM Cortex-M cycles** per sensor per tick; no FPU required.
- **Memory**: {% katex() %}6\,\text{bytes/sensor} \times 127{% end %} sensors (OUTPOST) = **762 bytes total** — fits in a single cache line with room to spare.
- **Precision loss vs. Kalman**: Q15 EWMA tracks the true Kalman steady-state mean to within {% katex() %}Q/R \cdot 32768^{-1} \approx 3 \times 10^{-9}{% end %} fractional error for OUTPOST thermal parameters. At {% katex() %}\mathcal{L}_0{% end %}, where the only question is "still alive?" rather than "how anomalous?", this precision is entirely sufficient.

> **Physical translation**: Replacing the Kalman filter with a Q15 EWMA at {% katex() %}\mathcal{L}_0{% end %} is not a degraded fallback — it is the correct algorithm for the task. The Kalman covariance update ({% katex() %}P_t = (1-K_t)\hat{P}_{t|t-1}{% end %}) adds precision in tracking the noise model, but at {% katex() %}\mathcal{L}_0{% end %} the noise model does not matter: the binary question is whether {% katex() %}z_t > \theta^*_{L0}{% end %}. Two multiply-shifts answer this question; six floating-point operations do not answer it better.

#### Variable-Fidelity Monitor Schedule

<span id="def-32"></span>

**Definition 32** (Variable-Fidelity Monitor Schedule). The MAPE-K Monitor phase at level \\(q\\) selects an algorithm tier {% katex() %}\tau \in \{0, 1, 2, 3\}{% end %} based on current CPU availability \\(1 - u(t)\\) (where \\(u(t)\\) is CPU utilization as in Proposition 17), independently of the capability level transition threshold:

{% katex(block=true) %}
\tau(t) = \begin{cases}
0 & 1 - u(t) < \varepsilon_0 \quad \text{(heartbeat only)} \\
1 & \varepsilon_0 \leq 1 - u(t) < \varepsilon_1 \quad \text{(Q15 EWMA + CUSUM)} \\
2 & \varepsilon_1 \leq 1 - u(t) < \varepsilon_2 \quad \text{(FP EWMA + Holt-Winters)} \\
3 & 1 - u(t) \geq \varepsilon_2 \quad \text{(Kalman + Isolation Forest)}
\end{cases}
{% end %}

Default thresholds: {% katex() %}\varepsilon_0 = 0.05,\ \varepsilon_1 = 0.30,\ \varepsilon_2 = 0.70{% end %}. Tier \\(\tau(t)\\) is re-evaluated at each MAPE-K tick before the Monitor phase executes — the manager is itself autonomic, scaling its own cost to the available margin. Tier selection takes 2 integer comparisons (\\(<10\\) cycles) and precedes all other Monitor work.

- **Field note**: The variable-fidelity schedule operates at finer granularity than capability level transitions. A node at {% katex() %}\mathcal{L}_3{% end %} running a temporary burst computation drops to tier 1 during the burst without triggering a level transition — preserving detection coverage at minimal cost rather than either suspending detection or forcing a premature downgrade.
- **Hysteresis**: Apply a dead-band of {% katex() %}\pm \varepsilon_{\text{hyst}} = 0.05{% end %} to tier transitions (Schmitt Trigger, {% term(url="@/blog/2026-01-29/index.md#def-47", def="Schmitt Trigger Hysteresis: dual threshold with separate trigger and release levels preventing healing loop flapping near a boundary") %}Definition 47{% end %} in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md#def-47)) to prevent oscillation between tiers during CPU load ramps.

> **Physical translation:** Variable fidelity means the monitoring system trades accuracy for energy: during degraded conditions, it samples less frequently and uses simpler detection algorithms. A RAVEN drone on 20% battery switches from the full anomaly detector to a lightweight threshold check — it may miss subtle anomalies, but it will still catch gross failures while preserving enough power to complete the mission.

#### Event-Driven vs. Polling

The MAPE-K Monitor tick fires at fixed interval {% katex() %}T_{\text{tick}}{% end %} (polling). At {% katex() %}\mathcal{L}_0{% end %} with {% katex() %}T_{\text{tick}} = 60\,\text{s}{% end %}, this already achieves near-optimal power on ARM Cortex-M by keeping the CPU in WFI between ticks. One further refinement eliminates the tick entirely for sensors whose readings remain in the normal band: **hardware ADC threshold interrupts**.

Configure the ADC comparator peripheral to fire an interrupt when the sampled voltage crosses {% katex() %}\theta^*_{L0}{% end %}. The CPU stays in WFI until the interrupt fires; the ISR updates the Q15 CUSUM accumulator and checks the alarm condition in 12 cycles, then returns to WFI. For sensors that are healthy (98% of observations at L0 fall in-band), the expected CPU activity is:

{% katex(block=true) %}
\bar{c}_{L0} = f_s \cdot \pi_1 \cdot C_{\text{ISR}} + \frac{C_{\text{tick}}}{T_{\text{tick}}}
{% end %}

where \\(f_s\\) is ADC sampling rate, \\(\pi_1 \approx 0.02\\) is the anomalous-sample fraction, {% katex() %}C_{\text{ISR}} = 12{% end %} cycles/event, and {% katex() %}C_{\text{tick}}{% end %} is the cost of the 60-second housekeeping tick.

> **Physical translation**: At 1 Hz ADC sampling with 2% anomalous fraction, the interrupt-driven ISR runs 1.2 times per minute — 12 cycles each — consuming {% katex() %}12 \times 1.2 / (64 \times 10^6 \times 60) \approx 3.8 \times 10^{-9}{% end %} CPU fraction, or roughly **0.000000038% CPU**. The 0.1% {% katex() %}\mathcal{L}_0{% end %} budget is larger by a factor of \\(2.6 \times 10^6\\). The autonomic layer at {% katex() %}\mathcal{L}_0{% end %} is, in every practical sense, invisible to the host application.

**DMA-assisted ADC ring buffer**: Configure the ADC DMA controller to fill a 64-sample ring buffer autonomously. The CPU-facing API is a single pointer read to the ring buffer tail — one load instruction. The DMA engine performs all ADC-to-memory transfers without CPU involvement. This separates sampling (hardware-driven, zero CPU) from analysis (software, triggered by timer or threshold interrupt).

#### Per-Algorithm Complexity Audit

The table below audits each algorithm in this article against the {% term(url="#def-29", def="Adaptive Gossip Rate Controller: feedback controller adjusting gossip fanout based on measured convergence lag, preventing under- and over-gossiping") %}Definition 29{% end %} overhead budgets, identifying the minimum capability level at which each algorithm is viable and the correct {% katex() %}\mathcal{L}_0{% end %}/{% katex() %}\mathcal{L}_1{% end %} replacement.

<style>
#tbl_complexity_audit + table th:first-of-type { width: 22%; }
#tbl_complexity_audit + table th:nth-of-type(2) { width: 14%; }
#tbl_complexity_audit + table th:nth-of-type(3) { width: 14%; }
#tbl_complexity_audit + table th:nth-of-type(4) { width: 10%; }
#tbl_complexity_audit + table th:nth-of-type(5) { width: 40%; }
</style>
<div id="tbl_complexity_audit"></div>

| Algorithm | CPU complexity | RAM | Min level | \\(\mathcal{L}_0\\)/\\(\mathcal{L}_1\\) replacement |
| :--- | :---: | :---: | :---: | :--- |
| Q15 EWMA + CUSUM (Def 84) | \\(O(1)\\), 12 cycles | 6 B/sensor | \\(\mathcal{L}_0\\) | — (this is the replacement) |
| FP EWMA (Def 23, simplified) | \\(O(1)\\), ~20 cycles | 8 B/sensor | \\(\mathcal{L}_2\\) | Q15 EWMA |
| Scalar Kalman (Def 23) | \\(O(1)\\), ~60 cycles FP | 32 B/sensor | \\(\mathcal{L}_3\\) | Q15 EWMA |
| CUSUM, static \\(\mu_0\\) | \\(O(1)\\), 10 cycles | 4 B/sensor | \\(\mathcal{L}_0\\) | — (already integer-safe) |
| Holt-Winters (period \\(p\\)) | \\(O(1)\\), ~80 cycles FP | \\(8p\\) B | \\(\mathcal{L}_2\\) | Skip (period data unavailable at \\(\mathcal{L}_0\\)–\\(\mathcal{L}_1\\)) |
| Isolation Forest (\\(t\\) trees, depth \\(d\\)) | \\(O(t)\\), ~200 cycles | \\(t \cdot d \cdot 4d\\) B | \\(\mathcal{L}_3\\) | Skip (19 KB at \\(t=50, d=8\\)) |
| Bayesian Surprise (Def 24) | \\(O(1)\\), ~40 cycles FP | 8 B/sensor | \\(\mathcal{L}_3\\) | CUSUM (\\(S_t^K \to S_t\\) at \\(\mathcal{L}_0\\)) |
| Gossip (Def 5, per round) | \\(O(1)\\) local, \\(O(\ln n)\\) fleet | 6 B/peer | Suspend at \\(\mathcal{L}_0\\) | Frozen weights from Def 60 |
| Welford estimator (Def 58) | \\(O(1)\\), ~30 cycles FP | 24 B/peer | Freeze at \\(\mathcal{L}_0\\) | Trust-root anchor (Def 60) |

**Notes on the audit**:
- "Skip" means the algorithm is neither run nor approximated at that level — its contribution to health assessment is omitted until the node recovers to a higher level.
- Gossip suspension at {% katex() %}\mathcal{L}_0{% end %} is consistent with the Denied connectivity regime ({% katex() %}\Xi = \mathcal{N}{% end %}, {% term(url="@/blog/2026-01-15/index.md#def-6", def="Connectivity Regime: cloud regime requires high average connectivity and near-zero disconnection probability; contested edge regime has low average connectivity and frequent disconnections") %}Definition 6{% end %}): gossip has no peers to reach and consumes power transmitting into silence. The trust-root anchor ({% term(url="#def-35", def="Trust-Root Anchor: cryptographically-signed capability certificate a node presents to re-enter the fleet after partition-induced ejection") %}Definition 35{% end %}) provides frozen peer weights that remain valid until reconnection.
- Welford estimator freeze at {% katex() %}\mathcal{L}_0{% end %} is already handled by {% term(url="#def-35", def="Trust-Root Anchor: cryptographically-signed capability certificate a node presents to re-enter the fleet after partition-induced ejection") %}Definition 35{% end %}'s Phase-0 seeding mechanism; no additional design change is required.
- The Isolation Forest sketch requires {% katex() %}t \cdot d_{\max} \cdot d \cdot 4{% end %} bytes (19.2 KB for CONVOY parameters). This exceeds the {% katex() %}\mathcal{L}_1{% end %} 64 KB budget only when combined with other algorithm state — verify total footprint against \\(M_q\\) at integration time.

**Fleet-level complexity**: Gossip convergence is \\(O(\ln n / \lambda)\\) ({% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}). Per-node gossip state is \\(O(n)\\) — the Welford estimator ({% term(url="#def-33", def="Divergence Sanity Bound: maximum acceptable state divergence before a node must enter quarantine mode, preventing reconciliation storms at reconnection") %}Definition 33{% end %}) requires \\(24\\,\text{bytes} \times n\\) peers. For OUTPOST (\\(n=127\\)): \\(127 \times 24 = 3{,}048\\) bytes at {% katex() %}\mathcal{L}_3{% end %}, frozen at 0 bytes at {% katex() %}\mathcal{L}_0{% end %}. The \\(O(n)\\) growth is bounded by fleet size, which is a fixed deployment parameter — not a runtime variable. Fleet size does not affect per-observation compute complexity (which remains \\(O(1)\\)) and only affects the static RAM allocation.

**OUTPOST {% katex() %}\mathcal{L}_0{% end %} calibration**: \\(127 \times 6\\,\text{bytes}\\) (Q15 state) = 762 bytes RAM. DMA ring buffer: \\(64 \times 2\\,\text{bytes}\\) = 128 bytes. Gossip state: frozen, 0 bytes active. Total autonomic observation footprint: **890 bytes** against the 4 KB \\(M_0\\) budget (22% utilization). CPU: {% katex() %}12\,\text{cycles/tick} \times 1{% end %} active tick/60 s = 200 cycles/hour at 64 MHz = {% katex() %}8.7 \times 10^{-8}{% end %} CPU fraction — **three orders of magnitude below** the 0.1% {% katex() %}\mathcal{L}_0{% end %} ceiling. The observer parsimony condition ({% term(url="#prop-17", def="Power-Aware Gossip Rate Adaptation: reduces gossip fanout proportionally with battery level while preserving convergence above a minimum coverage threshold") %}Proposition 17{% end %}) is satisfied with a margin of \\(> 99.99\\%\\).

### Mesh-Wide Health Inference

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} uses hierarchical aggregation with fusion nodes; the diagram shows a simplified three-layer structure where the backup link between fusion nodes (F1 to F2) allows intra-mesh health exchange to continue even when the satellite uplink is severed.

{% mermaid() %}
graph TD
    subgraph Sensors["Sensor Layer (distributed)"]
    S1[Sensor 1]
    S2[Sensor 2]
    S3[Sensor 3]
    S4[Sensor 4]
    S5[Sensor 5]
    S6[Sensor 6]
    end
    subgraph Fusion["Fusion Layer (aggregation)"]
    F1[Fusion A]
    F2[Fusion B]
    end
    subgraph Command["Command Layer (satellite)"]
    U[Uplink to HQ]
    end
    S1 --> F1
    S2 --> F1
    S3 --> F1
    S4 --> F2
    S5 --> F2
    S6 --> F2
    F1 --> U
    F2 --> U
    F1 -.->|"backup link"| F2

    style U fill:#c8e6c9
    style F1 fill:#fff9c4
    style F2 fill:#fff9c4
    style Sensors fill:#e3f2fd
    style Fusion fill:#fff3e0
    style Command fill:#e8f5e9
{% end %}

> **Read the diagram**: Sensors report to their local fusion node (Fusion A or B, yellow). Both fusion nodes forward to the satellite uplink (green). The dashed backup link between F1 and F2 enables intra-mesh health exchange to continue even when the uplink is severed — the mesh can still maintain local awareness and consensus even under complete satellite denial.

*(Simplified illustration; {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} operates 127 sensors in practice)*

{% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} parameters for {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} (power-optimized for extended deployment):
- Exchange rate: 0.017 Hz (once per minute) - optimized for power
- Staleness threshold: 300 seconds (5 minutes)
- Trust decay: \\(\gamma_s = 0.002\\) per second
- Maximum useful {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}: 600 seconds

### Tamper Detection

Fixed sensor positions make physical tampering a significant threat. Multi-layer detection:

**Physical indicators**:
- Accelerometer for movement detection (sensor should be stationary)
- Light sensor for enclosure opening
- Temperature anomaly from human proximity
- Magnetic field disturbance from tools

**Logical indicators**:
- Sudden calibration drift after stable period
- Communication pattern change (new signal characteristics)
- Behavior inconsistent with neighboring sensors

**Response protocol**:
1. Log tamper indicators with timestamp
2. Increase reporting frequency if power permits
3. Alert fusion node with tamper confidence level
4. Continue operation unless tamper confidence exceeds threshold
5. Switch to quarantine when accumulated tamper confidence {% katex() %}P(\text{tamper} \mid \text{evidence}) > 0.85{% end %}, computed as a Bayesian update over the listed physical and logical indicators
6. At high confidence: switch to quarantine mode (report but don't trust own data)

### Cross-Sensor Validation

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} leverages overlapping sensor coverage for cross-validation. The formula below computes a confidence score for sensor \\(s_i\\) as the trust-weighted fraction of agreement with its coverage-overlapping neighbors {% katex() %}\mathcal{N}_i{% end %}, where {% katex() %}w_{ij}{% end %} is the link trust weight and {% katex() %}\text{Agreement}(s_i, s_j){% end %} measures detection correlation between the two sensors.

{% katex(block=true) %}
\text{Confidence}(s_i) = \frac{\sum_{j \in \mathcal{N}_i} w_{ij} \cdot \text{Agreement}(s_i, s_j)}{\sum_{j \in \mathcal{N}_i} w_{ij}}
{% end %}

where {% katex() %}\mathcal{N}_i{% end %} is the set of sensors with overlapping coverage, and {% katex() %}\text{Agreement}(s_i, s_j){% end %} is the fraction of common time windows where both sensors agree on event presence/absence within a spatial-temporal tolerance window.

**Low confidence triggers**:
- Sensor \\(s_i\\) reports detection that no neighbors corroborate
- Sensor \\(s_i\\) fails to report detection that all neighbors report
- Sensor \\(s_i\\) timing systematically differs from neighbors

Cross-validation doesn't determine which sensor is correct - it identifies sensors requiring investigation.

---

## The Limits of Self-Measurement

Self-measurement has boundaries. Recognizing these limits is essential for correct system design.

### Novel Failure Modes

Anomaly detection learns from historical data. A failure mode never seen before - outside the training distribution - may not be detected as anomalous.

Example: {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensors are trained on hardware failures, communication failures, and known environmental conditions. A new adversarial technique - acoustic disruption of MEMS sensors - produces sensor behavior within "normal" ranges but with corrupted data. The anomaly detector sees normal statistics; the semantic content is compromised.

**Mitigation**: Defense in depth. Multiple detection mechanisms with different assumptions. Cross-validation between sensors. Periodic ground-truth verification when connectivity allows.

### Adversarial Understanding

An adversary who understands the detection algorithm can craft attacks that evade detection.

If the adversary knows we use EWMA with \\(\alpha = 0.1\\), they can introduce gradual drift that stays within \\(2\sigma\\) at each step but accumulates to significant deviation over time. The "boiling frog" attack.

**Mitigation**: Ensemble of detection algorithms with different sensitivities. Long-term drift detection (comparing current baseline to baseline from days ago). Randomized detection parameters.

### Cascading Failures

Self-measurement assumes the measurement infrastructure is functional. But the measurement infrastructure can fail too.

If the power management system fails, {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} may lose power before it can detect the power anomaly. If the communication subsystem fails, {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} cannot propagate health. The failure cascades faster than measurement can track.

**Mitigation**: P0/P1 monitoring on dedicated, ultra-low-power subsystem. Watchdog timers that trigger even if main processor fails. Hardware-level health indicators independent of software.

### The Judgment Horizon

When should the system distrust its own measurements?

- When confidence intervals are too wide to support decisions
- When multiple sensors give irreconcilable readings
- When the system is operating outside its training distribution
- When measurement infrastructure itself is compromised

At the {% term(url="@/blog/2026-02-12/index.md#def-91", def="Time window J over which the system evaluates stress outcomes before adapting; shorter J enables faster adaptation but higher variance in parameter estimates") %}judgment horizon{% end %}, self-measurement must acknowledge its limits. The system should:
1. Log that it has reached measurement uncertainty limits
2. Fall back to conservative assumptions
3. Request human input when connectivity allows
4. Avoid irreversible actions until confidence is restored

### Sensor 47 Resolution

Return to our opening scenario. Sensor 47 went silent. How did {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} diagnose the failure?

The fusion node applied the diagnostic framework from Section 2.3:

1. **Signature analysis**: Abrupt silence, no prior degradation - inconsistent with gradual sensor element failure; consistent with abrupt power regulation failure
2. **Correlation check**: Sensors 45, 46, 48, 49 all operational - not a regional communication failure
3. **Environmental context**: No known jamming indicators, weather nominal - lowers adversarial probability
4. **Staleness trajectory**: Sensor 47's last 10 readings showed normal variance, no drift - rules out slow degradation

Diagnosis: **Localized hardware failure** (most likely power regulation), with 78% confidence. The fusion node:
- Routed Sensor 47's coverage zone to neighbors (Sensors 45 and 48)
- Flagged for physical inspection on next patrol
- Updated its {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} baseline to reduce reliance on Sensor 47's historical patterns

Post-reconnection analysis (satellite uplink restored 6 hours later): Sensor 47's voltage regulator had failed suddenly - a known failure mode for this component batch. The diagnosis was correct. The system had self-measured, self-diagnosed, and self-healed without human intervention.

> **Cognitive Map**: Self-measurement has four hard limits — novel failures outside the training distribution, adversarial attacks calibrated to evade the detector, measurement infrastructure failures that cut the observation loop before an anomaly is logged, and the judgment horizon where confidence intervals are too wide to support any decision. Recognition of these limits is not a weakness of the design; it is the feature that prevents the system from taking irreversible actions on uninformative data.

### Learning from Measurement Failures

Measurement failures provide training data for improved detection. The four-step post-hoc process below turns each failure event into a concrete improvement to the detection catalog, threshold settings, or classifier model.

| Step | Action | Output |
| :--- | :--- | :--- |
| 1 | Document failure mode | Failure signature added to catalog |
| 2 | Extract detection features | New features for anomaly detector |
| 3 | Adjust thresholds | {% katex() %}\theta' = \theta - \Delta\theta{% end %} if false negative |
| 4 | Retrain models | Updated classifier with new case |

Measurable improvement: {% katex() %}P(\text{detect} \mid \text{failure type}){% end %} increases after each logged failure of that type.

---

## Model Scope and Failure Envelope

Each mechanism has bounded validity. When assumptions fail, so does the mechanism.

### Validity Domain: Summary

Each mechanism is valid only within a domain {% katex() %}\mathcal{D}{% end %} defined by its assumptions. Outside that domain the protocol continues to run, but its correctness and performance guarantees no longer hold. The table below shows, for each component, which assumptions must hold, what breaks when they fail, and what mitigations exist.

<style>
#tbl_validity + table th:first-of-type { width: 12%; }
#tbl_validity + table th:nth-of-type(2) { width: 28%; }
#tbl_validity + table th:nth-of-type(3) { width: 30%; }
#tbl_validity + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_validity"></div>

| Component | Assumptions | Breaks When | Mitigation |
| :--- | :--- | :--- | :--- |
| **Gossip** (Prop 4) | Connected network; delivery prob \\(> 0.5\\); uniform peer selection | Partition isolates clusters; high message loss; biased peer selection | Hierarchical gossip; bridge detection; priority messages; random peer forcing |
| **Detection** (Prop 3) | Abrupt step-like shift {% katex() %}\delta \in [0.5\sigma, 1.5\sigma]{% end %}; stable baseline; Gaussian noise | Gradual drift; unstable baseline; heavy-tailed noise | Dual-CUSUM for drift; adaptive windowing; robust statistics |
| **Byzantine** (Prop 6) | Byzantine minority (\\(f < n/3\\)); honest nodes truthful; attacker cannot predict trimming | \\(f \geq n/3\\); coordinated alignment past trimming; compromised honest node | Hierarchical trust; random trimming; continuous trust reassessment |
| **Staleness** (Prop 5) | Brownian diffusion model with accurate \\(\sigma\\); reliable timestamps | Volatility misestimate; clock spoofing; strongly mean-reverting metrics | Adaptive volatility estimation; authenticated time; relative ordering |

**Counter-scenarios**: Adversary who selectively jams inter-cluster {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} creates divergent health views undetectable within each cluster — detection requires cross-cluster comparison on reconnection. Adversary who compromises exactly \\(n/3\\) sensors gradually stays below instantaneous detection thresholds — detection requires trend analysis of trust scores, not just instantaneous counts.

### Summary: Claim-Assumption-Failure Table

The table below consolidates the key correctness claims from this article, the assumptions each relies on, and the specific conditions under which each breaks down.

| Claim | Key Assumptions | Valid When | Fails When |
| :--- | :--- | :--- | :--- |
| Gossip converges in \\(O(\ln n)\\) | Connected network, uniform peer selection | Network mostly connected | Partition isolates clusters |
| CUSUM detects faster than EWMA | Abrupt shift {% katex() %}\delta \in [0.5\sigma, 1.5\sigma]{% end %} | Step-like anomalies | Gradual drift; tiny shifts |
| Trimmed mean tolerates \\(f\\) Byzantine | \\(f < n/3\\) | Byzantine minority | \\(f \geq n/3\\); coordinated attack |
| Confidence degrades as {% katex() %}\sqrt{\tau}{% end %} | State evolution follows Brownian motion model | Stable volatility | Volatility spikes; regime change |
| Ensemble improves detection | Models capture different anomaly types | Anomaly diversity | All anomalies same type |

---

## Irreducible Trade-offs

No design eliminates these tensions. The architect selects a point on each Pareto front.

### Trade-off 1: Detection Sensitivity vs. False Positive Rate

**Multi-objective formulation**: Raising \\(\theta\\) decreases false positives but also decreases true positives — the formula captures both dimensions so the cost of each trade-off direction is explicit.

{% katex(block=true) %}
\max_{\theta} \left( U_{\text{TPR}}(\theta), -U_{\text{FPR}}(\theta) \right)
{% end %}

**ROC trade-off**: No threshold \\(\theta\\) achieves both TPR = 1 and FPR = 0 for overlapping distributions.

**Cost-weighted decision**: The formula selects the threshold that minimizes total expected error cost, explicitly weighting missed detections by {% katex() %}C_{\text{FN}}{% end %} and false alarms by {% katex() %}C_{\text{FP}}{% end %}.

{% katex(block=true) %}
\theta^* = \arg\min_\theta \left[ C_{\text{FN}} \cdot P(\text{FN}|\theta) + C_{\text{FP}} \cdot P(\text{FP}|\theta) \right]
{% end %}

**Pareto front derivation** (Gaussian anomaly model):

For normally distributed metrics with anomaly shift \\(\delta\\), the two closed-form expressions below give the TPR and FPR as a function of threshold \\(\theta\\) in units of \\(\sigma\\); the gap between the two curves widens as \\(\delta\\) increases relative to \\(\sigma\\).

{% katex(block=true) %}
\text{TPR}(\theta) = \Phi\left(\frac{\delta - \theta}{\sigma}\right), \quad \text{FPR}(\theta) = 1 - \Phi\left(\frac{\theta}{\sigma}\right)
{% end %}

The table below evaluates these expressions at four operating points and shows the cost-ratio condition under which each is optimal; the Use-when column is the key reference for practitioners choosing a threshold.

| Threshold | TPR = {% katex() %}\Phi((\delta-\theta)/\sigma){% end %} | FPR = {% katex() %}1-\Phi(\theta/\sigma){% end %} | Use when {% katex() %}C_{FN}/C_{FP}{% end %} is |
| :--- | :--- | :--- | :--- |
| {% katex() %}\theta = 1.5\sigma{% end %} | {% katex() %}\Phi(\delta/\sigma - 1.5){% end %} | \\(0.067\\) | High (FN aversion; tolerate FP) |
| {% katex() %}\theta = 2.0\sigma{% end %} | {% katex() %}\Phi(\delta/\sigma - 2.0){% end %} | \\(0.023\\) | Medium |
| {% katex() %}\theta = 2.5\sigma{% end %} | {% katex() %}\Phi(\delta/\sigma - 2.5){% end %} | \\(0.006\\) | Low |
| {% katex() %}\theta = 3.0\sigma{% end %} | {% katex() %}\Phi(\delta/\sigma - 3.0){% end %} | \\(0.001\\) | Very low (FP aversion) |

**Optimal threshold selection**: The closed-form below gives \\(\theta^\*\\) as the {% katex() %}\Phi^{-1}{% end %} quantile of the cost-normalized false-positive fraction, placing the decision boundary where the marginal cost of a false positive equals the marginal cost of a false negative.

{% katex(block=true) %}
\theta^* = \sigma \cdot \Phi^{-1}\left(\frac{C_{FP}}{C_{FP} + C_{FN}}\right)
{% end %}

For tactical edge where {% katex() %}C_{FN} \gg C_{FP}{% end %}: the cost-optimal threshold is the {% katex() %}\theta = 1.5\sigma{% end %} row of the table above (FPR = 0.067, high sensitivity), accepting false positives to minimize missed detections.

### Trade-off 2: Staleness vs. Bandwidth Cost

**Multi-objective formulation**: Increasing {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate \\(\lambda\\) improves data freshness but consumes proportionally more bandwidth — the formula sets up the optimization that finds the rate balancing both.

{% katex(block=true) %}
\max_{\lambda} \left( U_{\text{freshness}}(\lambda), -C_{\text{bandwidth}}(\lambda) \right)
{% end %}

where \\(f_g\\) is {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate.

**Confidence-bandwidth surface derivation**: The table below samples the Pareto front at four {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rates, showing bandwidth in units of \\(\lambda \cdot m\\) (message-rate times message-size) and confidence as {% katex() %}e^{-\gamma/\lambda}{% end %} where \\(\gamma\\) is the {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} decay rate.

With {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} contact rate \\(f_g\\), mean {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} is \\(\tau = 1/f_g\\) and confidence is {% katex() %}\kappa(\tau) = e^{-\gamma_s \tau}{% end %}; the two expressions below make the linear bandwidth cost and exponential confidence gain explicit as functions of the single design parameter \\(f_g\\).

{% katex(block=true) %}
\text{Bandwidth} = f_g \cdot m_{\text{msg}}, \quad \text{Confidence} = e^{-\gamma_s/f_g}
{% end %}

| Gossip Rate \\(\lambda\\) | Staleness \\(1/\lambda\\) | Bandwidth | Confidence {% katex() %}e^{-\gamma/\lambda}{% end %} |
| :--- | :--- | :--- | :--- |
| \\(0.1\\)/s | \\(10\\)s | \\(f_g \cdot m\\) | {% katex() %}e^{-10\gamma_s}{% end %} |
| \\(0.5\\)/s | \\(2\\)s | \\(5 f_g \cdot m\\) | {% katex() %}e^{-2\gamma_s}{% end %} |
| \\(1.0\\)/s | \\(1\\)s | \\(10 f_g \cdot m\\) | {% katex() %}e^{-\gamma_s}{% end %} |
| \\(2.0\\)/s | \\(0.5\\)s | \\(20 f_g \cdot m\\) | {% katex() %}e^{-0.5\gamma_s}{% end %} |

**Diminishing returns analysis**: {% katex() %}d\kappa/df_g = \gamma_s f_g^{-2} e^{-\gamma_s/f_g}{% end %} decreases as {% katex() %}f_g \to \infty{% end %}. Marginal confidence gain from doubling \\(f_g\\): {% katex() %}\Delta\kappa = e^{-\gamma_s/(2f_g)} - e^{-\gamma_s/f_g} \to 0{% end %} as \\(f_g\\) increases.

### Trade-off 3: Model Complexity vs. Adaptability

**Multi-objective formulation**: Choosing model \\(m\\) simultaneously determines accuracy on known patterns, adaptability to novel ones, and compute cost — the three-way trade-off that prevents any single model from dominating.

{% katex(block=true) %}
\max_{m \in \mathcal{M}} \left( U_{\text{accuracy}}(m), U_{\text{adaptability}}(m), -C_{\text{compute}}(m) \right)
{% end %}

**Pareto front derivation** (bias-variance tradeoff): The bound below shows that accuracy is limited by two terms moving in opposite directions as model complexity increases — bias decreases while variance increases.

{% katex(block=true) %}
\text{Accuracy}(m) \leq 1 - \underbrace{\text{Bias}^2(m)}_{\downarrow \text{ with complexity}} - \underbrace{\text{Var}(m)}_{\uparrow \text{ with complexity}}
{% end %}

The table below evaluates all three trade-off dimensions for the four models used in this article; no row dominates all others, confirming the Pareto structure.

| Model | Capacity \\(C_m\\) | Adaptability \\(\propto 1/C_m\\) | Compute \\(O(\cdot)\\) | Memory |
| :--- | :--- | :---: | :--- | ---: |
| EWMA | \\(O(1)\\) | High | \\(O(1)\\) | 96B |
| Isolation Forest | \\(O(t \log n)\\) | Medium | \\(O(\log n)\\) | 25KB |
| Autoencoder | \\(O(d^2)\\) | Low | \\(O(d^2)\\) | 280B |
| Ensemble | {% katex() %}\sum_i C_i{% end %} | Medium | {% katex() %}\sum_i O_i{% end %} | 25KB |

**No model dominates**: High-capacity models (autoencoder) achieve lower bias but higher variance on novel distributions. Low-capacity models (EWMA) adapt to drift but miss complex patterns. The Pareto frontier is convex - gains on one objective require losses on another.

### Trade-off 4: Byzantine Tolerance vs. Latency

**Multi-objective formulation**: Tolerating more {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %}s \\(f\\) requires more participating nodes and more message rounds, directly increasing aggregation latency — the formula makes this tension explicit.

{% katex(block=true) %}
\max_{f} \left( U_{\text{tolerance}}(f), -C_{\text{latency}}(f) \right)
{% end %}

where \\(f\\) is the number of {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %}s tolerated. The table below shows how tolerating each additional faulty node requires \\(3\\) more participating nodes and one additional message round, so the latency cost is linear in \\(f\\).

| Tolerance Level | Required Nodes | Message Rounds | Latency |
| :--- | ---: | ---: | ---: |
| \\(f = 0\\) | \\(n \geq 1\\) | 1 | Low |
| \\(f = 1\\) | \\(n \geq 4\\) | 2 | Medium |
| \\(f = 2\\) | \\(n \geq 7\\) | 3 | High |
| \\(f = k\\) | \\(n \geq 3k+1\\) | \\(k+1\\) | \\(O(k)\\) |

Higher {% term(url="#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} tolerance requires more nodes and more communication rounds, increasing latency. Cannot achieve high tolerance with low latency and few nodes.

> **Cognitive Map**: The four trade-offs — sensitivity vs. false positive rate, freshness vs. bandwidth, accuracy vs. adaptability, Byzantine tolerance vs. latency — are Pareto frontiers, not optimization problems with a single correct answer. Every deployment chooses a point on each frontier based on its mission cost ratios. The optimal threshold ({% term(url="#prop-9", def="Optimal Anomaly Threshold: minimizes total misclassification cost by balancing false-positive and false-negative penalties") %}Proposition 9{% end %}), gossip rate (Corollary 3), and ensemble composition (Section 2) are the three levers that move those operating points. Adjust them together, not independently.

### Cost Surface: Measurement Under Resource Constraints

The formula below gives the total cost of measurement as a function of sampling rate and fidelity: the first term is the resource cost of sampling (quadratic in fidelity), while the second term is the {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} cost that increases as rate drops.

{% katex(block=true) %}
C_{\text{measure}}(\text{rate}, \text{fidelity}) = \alpha \cdot \text{rate} \cdot \text{fidelity}^2 + \beta \cdot \frac{1}{\text{rate}}
{% end %}

The first term represents sampling cost (higher rate and fidelity cost more). The second term represents {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} cost (lower rate increases {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}). The optimal operating point balances these competing costs.

### Resource Shadow Prices

The shadow price {% katex() %}\zeta_i = \partial U / \partial g_i{% end %} quantifies how much additional utility one more unit of each resource delivers at the current operating point; a high shadow price identifies the binding constraint where investment yields the largest return.

| Resource | Shadow Price \\(\zeta_i\\) (c.u.) | Interpretation |
| :--- | ---: | :--- |
| Gossip bandwidth | 2.10/KB-hr | Value of an additional kilobyte per hour of health-synchronization capacity |
| Detection compute | 0.05/inference | Value of one additional detection inference pass at current anomaly rate |
| Sensor power | 0.80/mW-hr | Value of one additional milliwatt-hour sustaining continuous sensing |
| Memory | 0.01/KB | Value of one additional kilobyte enabling longer observation history |

*(Shadow prices in normalized cost units (c.u.) — illustrative relative values; ratios convey resource scarcity ordering. Detection compute (0.05 c.u./inference) is the reference unit. Calibrate to actual platform resource costs.)*

### Irreducible Trade-off Summary

The four trade-offs developed in this section are irreducible: no design choice eliminates the tension, only shifts the operating point along the Pareto frontier.

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Sensitivity-Precision | Catch all anomalies vs. no false alarms | Perfect TPR and zero FPR |
| Freshness-Bandwidth | Current information vs. low network cost | Both with limited bandwidth |
| Accuracy-Adaptability | High accuracy vs. novel anomaly detection | Both without ensemble overhead |
| Tolerance-Latency | Byzantine resilience vs. fast aggregation | Both with few nodes |

---

## Reputation-Based Consensus at the Measurement Layer

The {% term(url="#def-27", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine{% end %} framework established in Definitions 27 and 22 and {% term(url="#prop-15", def="Byzantine Tolerance Bound: gossip health protocol maintains correctness when fewer than n/3 nodes are Byzantine under majority-weight voting") %}Proposition 15{% end %} handles fault tolerance at the aggregation layer: trust-weighted trimmed means guard against nodes whose reports fall outside the statistical envelope. What it does not handle is a slower attack surface: a node whose divergence \\(D_j(t)\\) drifts systematically but stays within the trimming threshold, corrupting the {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} health vector ({% term(url="#def-24", def="Gossip Health Protocol: epidemic dissemination where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds") %}Definition 24{% end %}) and the adaptive baseline ({% term(url="#def-20", def="Adaptive Baseline Estimator: Kalman-filter EWMA that adjusts its noise model as capability level changes, preventing false alarms during mode transitions") %}Definition 20{% end %}) over many observation cycles before the damage becomes detectable.

Three mechanisms close this gap. A per-peer running estimator flags anomalous divergence history ({% term(url="#def-33", def="Divergence Sanity Bound: maximum acceptable state divergence before a node must enter quarantine mode, preventing reconciliation storms at reconnection") %}Definition 33{% end %}). A local ejection rule removes the offending node from trust-weighted merges without requiring a fleet-wide vote ({% term(url="#def-34", def="Soft-Quorum Ejection: protocol removing a node from the active fleet view when its divergence exceeds the bound, without requiring a hard quorum vote") %}Definition 34{% end %}). A Phase-0-anchored trust-root maintains calibrated weights during the Denied regime ({% term(url="#def-35", def="Trust-Root Anchor: cryptographically-signed capability certificate a node presents to re-enter the fleet after partition-induced ejection") %}Definition 35{% end %}) — the connectivity state where {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} cannot propagate reputation updates at all.

<span id="def-33"></span>
**Definition 33** (Divergence Sanity Bound). Node \\(i\\) maintains a *Welford running estimator* over divergence observations from peer \\(j\\): sample count \\(n_j\\), running mean \\(\mu_j\\), and second moment {% katex() %}M_{2,j}{% end %}. On each new divergence observation \\(d = D_j(t)\\) the estimator updates as:

{% katex(block=true) %}
\begin{aligned}
n_j &\leftarrow n_j + 1 \\
\delta_1 &= d - \mu_j \\
\mu_j &\leftarrow \mu_j + \delta_1 / n_j \\
\delta_2 &= d - \mu_j \\
M_{2,j} &\leftarrow M_{2,j} + \delta_1 \cdot \delta_2 \\
\sigma^2_j &\leftarrow M_{2,j} / (n_j - 1), \quad n_j \geq 2
\end{aligned}
{% end %}

*Cold-start handling: when \\(n_j < 2\\), the variance term is undefined. For the first observation, initialize {% katex() %}\hat{\sigma}_j^2 = \sigma_\text{prior}^2{% end %} where \\(\\sigma_\\text{prior}\\) is the deployment-configured prior standard deviation (default: the sensor's datasheet noise floor). The ejection gate is suppressed entirely for \\(n_j = 0\\); for \\(n_j = 1\\), the prior variance is used.*

Observation \\(d\\) is *flagged anomalous* if {% katex() %}d > \mu_j + k \cdot \sigma_j{% end %}, where \\(k\\) is a fleet-wide policy parameter (\\(k = 3\\) for standard operation; \\(k = 4\\) for high-safety contexts). The estimator is seeded from the Phase-0 attestation window ({% term(url="#def-35", def="Trust-Root Anchor: cryptographically-signed capability certificate a node presents to re-enter the fleet after partition-induced ejection") %}Definition 35{% end %}), not from cold-start zeros. \\(D_j(t)\\) is the per-node scalar approximation of {% term(url="@/blog/2026-02-05/index.md#def-57", def="State Divergence: how far a node's local state has drifted from fleet consensus during disconnection; grows during partition, resolved at reconnection") %}Definition 57{% end %}'s pairwise divergence metric, computed against the last-known fleet consensus snapshot received via {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} ({% term(url="#def-24", def="Gossip Health Protocol: epidemic dissemination where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds") %}Definition 24{% end %}).

> **Physical translation**: Each node silently tracks how far each peer's divergence deviates from that peer's own history. A peer whose divergence was normally around 0.04 and suddenly hits 0.31 is flagged — not because of any absolute threshold, but because it is behaving three standard deviations outside its own baseline. The Welford update requires no stored history, only three running scalars per peer, making it viable on constrained hardware. Cold-starting from zeros would produce false flags during warm-up; seeding from Phase-0 eliminates this entirely.

<span id="def-34"></span>
**Definition 34** (Soft-Quorum Ejection). Node \\(i\\) maintains a per-peer suspicion counter \\(v_j\\), a sliding-window flag count \\(F_j(w)\\) over the last \\(w\\) observations, and reputation weight \\(w_j \in [0, w_0]\\), where \\(w_0\\) is the Phase-0 calibrated baseline. The update rules are: a flagged observation sets \\(v_j \leftarrow v_j + 1\\); a clean observation reduces suspicion rather than resetting it: {% katex() %}v_j \leftarrow \max(0,\, v_j - 1){% end %}. When \\(v_j \geq m\\), node \\(i\\) sets \\(w_j \leftarrow 0\\) (*soft-eject*). Secondary rate-based trigger: if \\(F_j(w) / w > r_\text{eject}\\) over a sliding window of \\(w\\) observations, node \\(i\\) soft-ejects peer \\(j\\) regardless of consecutive-run length; default values \\(r_\text{eject} = 0.4\\) and \\(w = 10\\). The decaying counter prevents a Byzantine node that alternates flagged and clean observations from keeping \\(v_j\\) perpetually near zero; the rate-based trigger catches sustained low-grade misbehaviour that would evade an m-consecutive-flags gate alone. After \\(r\\) consecutive post-eject clean observations, \\(w_j \leftarrow w_0\\) (*reinstatement*). No broadcast is emitted; the decision is purely local. A soft-ejected peer \\(j\\) is excluded from Definition 58b's Reputation-Weighted Merge and from Definition 65's Reputation-Weighted Fleet Coherence Vote. Peer \\(j\\) remains in the *denominator* of Definition 66's Logical Quorum — a cascade of ejections cannot erode the quorum threshold.

> **Physical translation**: When a peer starts reporting values that are consistently far outside its own historical norm, the local node stops trusting it for aggregation decisions — silently, without coordinating with anyone else. The ejection is soft: the suspect peer's count still contributes to quorum thresholds (so the fleet cannot be reduced to a rump quorum by ejecting a majority), but its reports no longer influence health consensus. Ejection is not permanent; it is a probationary state.

**Rehabilitation**: An ejected node may re-enter the quorum after reconnecting to a trust-root anchor ({% term(url="#def-35", def="Trust-Root Anchor: cryptographically-signed capability certificate a node presents to re-enter the fleet after partition-induced ejection") %}Definition 35{% end %}) and passing \\(r\\) consecutive validation rounds without triggering the ejection predicate. Re-entry is additionally gated by the reconnecting node's Bayesian surprise score falling below \\(\kappa / 2\\) for a full gossip convergence period ({% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}), where \\(\kappa\\) is the fleet-wide anomaly threshold used in {% term(url="#def-33", def="Divergence Sanity Bound: maximum acceptable state divergence before a node must enter quarantine mode, preventing reconciliation storms at reconnection") %}Definition 33{% end %}. This prevents a briefly compliant Byzantine node from gaming the \\(r\\)-clean-observation window and re-entering at full weight \\(w_0\\).

<span id="prop-19"></span>
**Proposition 19** (False-Positive Ejection Bound). Under Gaussian divergence residuals and independent peers, the probability that an honest peer \\(j\\) is wrongly soft-ejected by node \\(i\\) within \\(T\\) observation steps satisfies:

*Requiring multiple consecutive flags before ejection makes accidental exclusion of honest peers astronomically unlikely.*

{% katex(block=true) %}
P(\text{false eject}) \leq \bigl(1 - \Phi(k)\bigr)^m \cdot T
{% end %}

where \\(\Phi\\) is the standard normal CDF. At \\(k = 3, m = 5\\): {% katex() %}P \approx 4.5 \times 10^{-15} \cdot T{% end %}, negligible for any realistic operating window.

> **Physical translation**: With a 3-sigma threshold and requiring 5 consecutive flags to eject, the probability that a normally-behaving peer gets wrongly kicked out is so small that it would not be expected to happen once in the lifetime of any conceivable fleet deployment. The requirement for five *consecutive* flags (not just five total) is the key: a single clean observation resets the counter to zero, so transient sensor noise cannot accumulate into a false ejection.

> **Scope — distributional assumption:** This bound holds under the assumption of Gaussian divergence residuals with approximately independent peers. In denied-regime deployments where \\(T_\\text{acc}\\) exceeds the Weibull P95 partition threshold, the independence and Gaussianity assumptions are violated by temporal autocorrelation. For such deployments, apply a conservative factor of \\(\\kappa \\geq 3\\) to the stated false-ejection probability, pending a tighter bound for correlated residuals.

*Proof sketch.* A false ejection requires \\(m\\) consecutive anomalous flags on an honest peer. Under Gaussian residuals, each flag occurs independently with probability \\(1 - \Phi(k)\\). The \\(m\\)-consecutive-flag probability is \\((1 - \Phi(k))^m\\); a union bound over \\(T\\) possible streak-ending positions gives the stated result. \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} scenario**: With \\(k = 3\\), \\(m = 5\\), and a 14-day operating window (\\(T \approx 1.2 \times 10^6\\) steps at 1 Hz), the fleet-wide expected false ejections remain below \\(10^{-8}\\) — effectively zero over any mission duration.

> **Empirical status**: The \\(P(\text{false eject})\\) formula is exact under the Gaussian independence assumption. Real divergence residuals are not perfectly Gaussian or fully independent — temporal autocorrelation in sensor streams can cause streak lengths longer than independence predicts. The \\(4.5 \times 10^{-15}\\) figure for \\(k=3,\\,m=5\\) is analytically correct under the model; empirical false-ejection rates in non-Gaussian environments have not been characterized.

<span id="def-35"></span>
**Definition 35** (Trust-Root Anchor). At Phase-0, each node \\(i\\) generates an attestation record signed by hardware TPM:

{% katex(block=true) %}
A_i = \bigl(id_i,\; H(\mathrm{config}_i),\; \mathrm{PKI\_root}\bigr)
{% end %}

The *fleet trust-root* for node \\(i\\) is {% katex() %}\mathcal{T}_{\text{root},i} = \{A_j : j \in \text{fleet, Phase-0 attested}\}{% end %}. During the Denied connectivity regime ({% term(url="@/blog/2026-01-15/index.md#def-6", def="Connectivity Regime: cloud regime requires high average connectivity and near-zero disconnection probability; contested edge regime has low average connectivity and frequent disconnections") %}Definition 6{% end %}, {% katex() %}\mathcal{N}{% end %}), {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} cannot propagate reputation updates. Node \\(i\\) applies the following defaults: peer {% katex() %}j \in \mathcal{T}_{\text{root},i}{% end %} receives weight \\(w_j = w_0\\); peer {% katex() %}j \notin \mathcal{T}_{\text{root},i}{% end %} (introduced post-Phase-0 without re-attestation) receives weight {% katex() %}w_j = w_{\text{low}} < w_0{% end %}.

> **Physical translation**: Before the mission begins, every node in the fleet exchanges hardware-attested identity records. During the mission, this pre-shared roster is the only trust reference available in the Denied regime — there is no way to verify a newcomer or revoke a known node without connectivity. Nodes added after Phase-0 (replacements, reinforcements) operate at reduced trust weight until they can be re-attested through a connected phase. The anchor does not prevent compromise; it bounds how much damage a compromised or new node can do without coordination.

**Anchor compromise**: If the trust-root anchor is itself Byzantine — for example, if Phase-0 attestation records were forged or the TPM was compromised before deployment — the fleet degrades to pairwise {% term(url="#prop-15", def="Byzantine Tolerance Bound: gossip health protocol maintains correctness when fewer than n/3 nodes are Byzantine under majority-weight voting") %}Proposition 15{% end %} (Byzantine Tolerance Bound): no quorum decisions are made until a new anchor is established through an out-of-band key ceremony. Individual nodes continue operating on local anomaly detection ({% term(url="#def-19", def="Local Anomaly Detection Problem: classifying sensor readings as normal or anomalous using only constant-time local compute and no central collector") %}Definition 19{% end %}) and can still form local soft-quorums among mutually trusting peers, but fleet-wide consensus requires re-establishing a verified trust root.

When hardware TPM attestation is unavailable (air-gapped deployments, legacy hardware, or emergency re-commissioning): the system falls back to a software-only attestation using a pre-shared symmetric key exchanged during physical installation. Software attestation provides weaker guarantees — it is vulnerable to a compromised node that knows the key — so deployments using software fallback must set \\(f_\text{max} < n/4\\) (one fewer faulty node tolerance) rather than the standard \\(n/3\\) Byzantine tolerance bound.

<span id="prop-20"></span>
**Proposition 20** (Isolated-Node Trust Guarantee). A node operating in the Denied regime for duration \\(\tau\\) maintains calibration error bounded by:

*Trust weights drift linearly during isolation; a longer Phase-0 calibration window limits how fast that drift can accumulate.*

{% katex(block=true) %}
\lvert \hat{w}_j(\tau) - w_j(0) \rvert \leq \varepsilon_{\text{drift}} \cdot \tau
{% end %}

where {% katex() %}\varepsilon_{\text{drift}} \leq w_0 / L_{\text{P0}}{% end %} for Phase-0 calibration window length {% katex() %}L_{\text{P0}}{% end %}, under the assumption that fleet divergence statistics are approximately stationary over the partition duration.

*Proof sketch*: In the Denied regime, the Welford estimators are frozen — no gossip updates arrive. Weight drift accumulates only from the last observation window before partition start. The maximum drift rate is bounded by the per-sample update magnitude {% katex() %}w_0 / L_{\text{P0}}{% end %} (the Phase-0 window normalizes the step size). Over duration \\(\tau\\) with stationary divergence, drift accumulates linearly: {% katex() %}|\hat{w}_j(\tau) - w_j(0)| \leq (w_0 / L_{\text{P0}}) \cdot \tau = \varepsilon_{\text{drift}} \cdot \tau{% end %}. Trust degrades gracefully rather than catastrophically; the Phase-0 anchor prevents unbounded weight drift regardless of partition duration. \\(\square\\)

> **Physical translation**: A node isolated for 18 hours in the Denied regime will have trust weights that have drifted by at most {% katex() %}\varepsilon_{\text{drift}} \cdot 18{% end %} from their calibrated values — a bounded, calculable degradation, not a free fall. The longer the Phase-0 calibration window {% katex() %}L_{\text{P0}}{% end %}, the smaller {% katex() %}\varepsilon_{\text{drift}}{% end %} is, so investing in a thorough pre-mission calibration directly reduces how much the trust model degrades during extended disconnection.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} illustration.** Day 44 of operation. Sensor 88 begins reporting threat coordinates 340 m east of the consensus estimate. Its {% katex() %}D_{88}(t){% end %} climbs from a historical \\(\mu \approx 0.04\\) to 0.31 over six reporting cycles, exceeding {% katex() %}\mu + 3\sigma \approx 0.09{% end %}. Node 12 flags Sensor 88 on the fifth observation (streak {% katex() %}v_{88} = 5 \geq m = 5{% end %}) and sets {% katex() %}w_{88} = 0{% end %}. Nodes 11, 13, and 14 reach the same conclusion independently over the next two {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} cycles. The 126 remaining sensors continue operating; no coordinator is contacted; no fleet-wide vote is called.

At hour 72, sustained jamming drives {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} into the Denied regime. {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} halts. Node 12's Welford estimators freeze at their current values. For the 126 Phase-0-attested peers, \\(w_j = w_0\\) is applied from {% katex() %}\mathcal{T}_{\text{root},12}{% end %}; for a sensor added at day 40 without re-attestation, {% katex() %}w_j = w_{\text{low}}{% end %}. {% term(url="#prop-20", def="Isolated-Node Trust Guarantee: a node ejected from the fleet by Soft-Quorum Ejection can re-enter after presenting a valid Trust-Root Anchor") %}Proposition 20{% end %} bounds the trust drift over the 18-hour partition at {% katex() %}\varepsilon_{\text{drift}} \cdot 18{% end %} — a calculable, bounded degradation.

| Parameter | Standard OUTPOST | High-Safety OUTPOST |
| :--- | :---: | :---: |
| \\(k\\) (sigma threshold) | 3 | 4 |
| \\(m\\) (violations to eject) | 5 | 5 |
| \\(r\\) (clean to reinstate) | 10 | 20 |
| {% katex() %}P(\text{false eject}){% end %} per \\(10^6\\) steps | {% katex() %}4.5 \times 10^{-9}{% end %} | {% katex() %}< 10^{-16}{% end %} |

> **Empirical status**: The drift bound {% katex() %}|\hat{w}_j(\tau) - w_j(0)| \leq (w_0/L_{\text{P0}})\cdot\tau{% end %} is analytically derived under the stationary-divergence assumption. The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} illustration values (\\(\mu \approx 0.04\\), {% katex() %}\mu + 3\sigma \approx 0.09{% end %}) are scenario parameters, not measured fleet divergence statistics. The assumption of stationary divergence during partition may not hold if the physical environment changes significantly during an 18-hour blackout.

---

## Closing: The Measurement-Action Loop

Measurement feeds action; without action, measurement is logging. {% term(url="#scenario-autodelivery", def="Autonomous last-mile delivery fleet in an urban metro area; urban connectivity gaps and GPS spoofing risk require local fleet-health management") %}AUTODELIVERY{% end %}'s {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} propagation feeds task assignment; {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–36 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %}'s {% term(url="#def-19", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} feeds workload rebalancing.

The diagram below shows the measurement-action loop (the {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} cycle); notice that Execute feeds back into Monitor, meaning the system continuously validates whether its own healing actions had the intended effect rather than assuming success.

{% mermaid() %}
graph LR
    M["Monitor<br/>(observe state)"] --> A["Analyze<br/>(detect anomaly)"]
    A --> P["Plan<br/>(select action)"]
    P --> E["Execute<br/>(apply healing)"]
    E -->|"feedback loop"| M

    style M fill:#c8e6c9
    style A fill:#fff9c4
    style P fill:#ffcc80
    style E fill:#ffab91
{% end %}

> **Read the diagram**: Monitor (green) observes the system state and feeds it to Analyze (yellow), which classifies anomalies. Plan (orange) selects a healing action; Execute (red-orange) applies it. The feedback arrow from Execute back to Monitor is the critical design requirement — every healing action becomes a new observation. Without this loop, the system cannot distinguish "healing worked" from "healing failed but we stopped looking."

This is the {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop (Monitor, Analyze, Plan, Execute, Knowledge) that IBM formalized for autonomic computing {{ cite(ref="9", title="Kephart & Chess (2003) — The Vision of Autonomic Computing") }}.

Return to {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} BRAVO.

Sensor 47 is silent. The fusion node has measured: abrupt silence, no prior degradation, neighbors fully operational, no correlated regional failure. The analysis suggests localized hardware failure with 78% confidence. The plan: reroute coverage to neighboring sensors, flag for inspection on the next patrol, log for human review when uplink restores.

But measurement alone doesn't execute this plan. Self-healing must decide: Is 78% confidence sufficient to reroute coverage and degrade mission posture for that sector? What is the cost of a false alarm versus a missed failure? How does the rerouting affect the rest of the mesh?

These are the questions that precise measurement makes it possible to ask. Without a calibrated anomaly score and a {% term(url="#def-26", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}-bounded observation, there is no meaningful basis for any healing decision at all.

---

## Related Work

**Gossip and epidemic dissemination.** The gossip health protocol in this article ({% term(url="#def-24", def="Gossip Health Protocol: epidemic dissemination where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds") %}Definition 24{% end %}) is grounded in the epidemic-algorithm literature. Demers et al. {{ cite(ref="1", title="Demers et al. (1987) — Epidemic Algorithms for Replicated Database Maintenance") }} introduced the epidemic model for replicated database reconciliation, demonstrating logarithmic propagation times in fully connected networks — the direct antecedent of the \\(O(\ln n / \lambda)\\) convergence bound in {% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}. Kermarrec et al. {{ cite(ref="6", title="Kermarrec et al. (2003) — Probabilistic Reliable Dissemination in Large-Scale Systems") }} tightened these results for probabilistic reliable dissemination in large-scale systems under message loss, providing the theoretical basis for the lossy sparse-mesh extension in {% term(url="#prop-13", def="Gossip Convergence on Lossy Sparse Mesh: convergence time bound for gossip when packet loss stays below fifty percent; degrades gracefully with increasing loss") %}Proposition 13{% end %}. Both papers treat the fully-connected and sparse cases separately; the synthesis into the edge mesh model — with explicit mesh diameter \\(D\\), per-edge loss probability \\(p_\text{loss}\\), and the conductance bound \\(\Phi \geq 1/D\\) — is specific to the contested-environment setting developed here.

**Anomaly detection and change-point methods.** The CUSUM statistic (Page {{ cite(ref="3", title="Page (1954) — Continuous Inspection Schemes") }}) remains the standard for optimal detection of step shifts in mean, and its optimality for that specific problem class (proven by Moustakides) motivates its placement alongside EWMA rather than as a replacement. The Kalman-based adaptive baseline ({% term(url="#def-20", def="Adaptive Baseline Estimator: Kalman-filter EWMA that adjusts its noise model as capability level changes, preventing false alarms during mode transitions") %}Definition 20{% end %}) follows the linear filtering framework introduced in Kalman {{ cite(ref="4", title="Kalman (1960) — A New Approach to Linear Filtering and Prediction Problems") }}; the scalar form used here for edge deployment is the degenerate one-dimensional case of the full matrix filter, with the key insight that EWMA with fixed \\(\alpha\\) is a special case where the Riccati equation is prevented from converging. The Bayesian interpretation of the Surprise metric ({% term(url="#def-21", def="Bayesian Surprise Metric: per-reading surprise score measuring deviation from the adaptive baseline in standard-deviation units") %}Definition 21{% end %}) connects to the Bayesian framework for inference under uncertainty in Gelman et al. {{ cite(ref="5", title="Gelman et al. (2003) — Bayesian Data Analysis") }}; the log Bayes factor formulation follows standard practice for sequential hypothesis testing in that tradition.

**Byzantine fault tolerance.** The classical impossibility result that correct consensus requires more than \\(2/3\\) of nodes to be honest was established by Lamport, Shostak, and Pease {{ cite(ref="7", title="Lamport, Shostak, Pease (1982) — The Byzantine Generals Problem") }}. The trust-weighted generalization in {% term(url="#prop-15", def="Byzantine Tolerance Bound: gossip health protocol maintains correctness when fewer than n/3 nodes are Byzantine under majority-weight voting") %}Proposition 15{% end %} — replacing the node-count fraction with a trust-weight fraction — is a natural extension; Byzantine trust weight below \\(1/3\\) is a necessary condition. Castro and Liskov {{ cite(ref="8", title="Castro & Liskov (1999) — Practical Byzantine Fault Tolerance") }} demonstrated practical BFT in asynchronous networks through PBFT, which operates under the same \\(f < n/3\\) bound but with full replication semantics inapplicable to the gossip-health problem. The trust-decay and behavioral-fingerprint mechanisms ({% term(url="#def-25", def="Behavioral Fingerprint: a per-node statistical signature of normal operating patterns used for anomaly detection and peer trust evaluation") %}Behavioral Fingerprint{% end %}, Soft-Quorum Ejection, and Trust-Root Anchor) address the gap between the instantaneous fraction bound and the slow-accumulation attack that falls below the threshold until a coordinated action.

**Autonomic computing and edge self-management.** The MAPE-K control loop (Monitor–Analyse–Plan–Execute with Knowledge Base) was formalized by Kephart and Chess {{ cite(ref="9", title="Kephart & Chess (2003) — The Vision of Autonomic Computing") }} as the organizing framework for self-managing systems; the four-phase structure pervades this article's local anomaly detection pipeline and the closing measurement-action loop. Huebscher and McCann {{ cite(ref="10", title="Huebscher & McCann (2008) — A Survey of Autonomic Computing") }} surveyed the degrees and models of autonomic behavior, noting the dependence on local state awareness as a prerequisite for any self-* capability — the precise motivation for treating self-measurement as the foundational problem in this series rather than a supporting component. The edge computing context — limited compute, constrained memory, contested connectivity — follows the landscape surveyed by Satyanarayanan {{ cite(ref="2", title="Satyanarayanan (2017) — The Emergence of Edge Computing") }}, which identifies local processing and graceful disconnection as the distinguishing design properties of edge deployments relative to cloud architectures.

---

Three results carry forward from this article. First, the cost-optimal detection threshold ({% term(url="#prop-9", def="Optimal Anomaly Threshold: minimizes total misclassification cost by balancing false-positive and false-negative penalties") %}Proposition 9{% end %}) places the decision boundary where the ratio of anomaly likelihoods equals the ratio of error costs — a concrete, tunable criterion that replaces the ad hoc \\(2\sigma\\) or \\(3\sigma\\) thresholds common in practice. Second, {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} convergence in \\(O(\ln n / f_g)\\) time ({% term(url="#prop-12", def="Gossip Convergence: all nodes reach consistent health state in logarithmically many rounds under the Gossip Health Protocol") %}Proposition 12{% end %}) means that fleet-wide health awareness scales gracefully: doubling a 47-drone swarm adds roughly 0.7 seconds to convergence at 1 Hz {% term(url="#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate, not a proportional delay. Third, the maximum useful staleness bound ({% term(url="#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %}) gives designers a principled way to size observation frequency: the tighter the decision margin \\(\Delta h\\), the higher the sampling rate must be, in a quadratic relationship that makes aggressive margin requirements expensive.

But measurement is only half the loop. A system that can diagnose a failure with 78% confidence still faces the question of what to do about it: which recovery actions are safe to attempt, in what order, under what resource constraints, and with what guarantees of stability. Those are the questions addressed in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md), which develops the formal autonomic control loop, defines healing action severity, and derives the stability conditions under which closed-loop recovery converges rather than oscillates.

---

## References

<span id="ref-1"></span>
[1] Demers, A., Greene, D., Hauser, C., Irish, W., Larson, J., Shenker, S., Sturgis, H., Swinehart, D., Terry, D. (1987). "Epidemic Algorithms for Replicated Database Maintenance." *Proc. PODC*, 1–58. ACM. [[doi]](https://doi.org/10.1145/41840.41841)

<span id="ref-2"></span>
[2] Satyanarayanan, M. (2017). "The Emergence of Edge Computing." *IEEE Computer*, 50(1), 30–39. [[doi]](https://doi.org/10.1109/MC.2017.9)

<span id="ref-3"></span>
[3] Page, E.S. (1954). "Continuous Inspection Schemes." *Biometrika*, 41(1/2), 100–44. [[doi]](https://doi.org/10.1093/biomet/41.1-2.100)

<span id="ref-4"></span>
[4] Kalman, R.E. (1960). "A New Approach to Linear Filtering and Prediction Problems." *Trans. ASME — Journal of Basic Engineering*, 82(1), 35–66. [[doi]](https://doi.org/10.1115/1.3662552)

<span id="ref-5"></span>
[5] Gelman, A., Carlin, J.B., Stern, H.S., Rubin, D.B. (2003). *Bayesian Data Analysis*, 2nd ed. Chapman & Hall/CRC. [[web]](https://www.stat.columbia.edu/~gelman/book/)

<span id="ref-6"></span>
[6] Kermarrec, A.-M., Massoulié, L., Ganesh, A.J. (2003). "Probabilistic Reliable Dissemination in Large-Scale Systems." *IEEE Transactions on Parallel and Distributed Systems*, 14(3), 248–258. [[doi]](https://doi.org/10.1109/TPDS.2003.1195163)

<span id="ref-7"></span>
[7] Lamport, L., Shostak, R., Pease, M. (1982). "The Byzantine Generals Problem." *ACM Trans. Programming Languages and Systems*, 4(3), 382–401. [[doi]](https://doi.org/10.1145/357172.357176)

<span id="ref-8"></span>
[8] Castro, M., Liskov, B. (1999). "Practical Byzantine Fault Tolerance." *Proc. OSDI*, 173–186. [[pdf]](https://pmg.csail.mit.edu/papers/osdi99.pdf)

<span id="ref-9"></span>
[9] Kephart, J.O., Chess, D.M. (2003). "The Vision of Autonomic Computing." *IEEE Computer*, 36(1), 41–50. [[doi]](https://doi.org/10.1109/MC.2003.1160055)

<span id="ref-10"></span>
[10] Huebscher, M.C., McCann, J.A. (2008). "A Survey of Autonomic Computing — Degrees, Models, and Applications." *ACM Computing Surveys*, 40(3), Article 7. [[doi]](https://doi.org/10.1145/1380584.1380585)
