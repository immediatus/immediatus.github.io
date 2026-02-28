+++
authors = ["Yuriy Polyulya"]
title = "Self-Measurement Without Central Observability"
description = "When your monitoring service is unreachable, who monitors the monitors? Edge systems must detect their own anomalies, assess their own health, and maintain fleet-wide awareness through gossip protocols - all without phoning home. This article develops lightweight statistical approaches for on-device anomaly detection, Bayesian methods for distributed health inference, and the observability constraint sequence that prioritizes what to measure when resources are scarce."
date = 2026-01-22
slug = "autonomic-edge-part2-self-measurement"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "observability", "anomaly-detection"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 2
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Traditional distributed systems assume connectivity as the norm and partition as the exception. Edge systems invert this assumption: disconnection is the default operating state, and connectivity is the opportunity to synchronize. This series develops the engineering principles for autonomic architectures - systems that self-measure, self-heal, and self-optimize when human operators cannot intervene. Through tactical scenarios (RAVEN drone swarm, CONVOY ground vehicles, OUTPOST forward base) and commercial deployments (AUTOHAULER mining fleet, GRIDEDGE power distribution, AUTODELIVERY logistics, PREDICTIX manufacturing), we derive the mathematical foundations and design patterns for systems that thrive under contested connectivity."""
+++

---

## Prerequisites

The measurement problem addressed here doesn't exist in a vacuum - it emerges directly from the framework developed in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md).

Three results from that foundation shape everything in this article. First, the Markov connectivity model (Definition 3) establishes *when* measurement becomes the system's only source of truth. During the Denied regime (\\(\mathcal{N}\\)), there is no external observability infrastructure - no central monitoring, no cloud metrics, no human operator in the loop. Every judgment the system makes about its own health must be drawn from local evidence alone. Self-measurement is not about building better dashboards; it is about survival during partition.

Second, the capability hierarchy (\\(\mathcal{L}_0\\)–\\(\mathcal{L}_4\\)) establishes *what* measurement must protect. A system that cannot assess its own capability level cannot make sound decisions about which recovery actions to attempt, how aggressively to heal, or when to shed load. Accurate health knowledge is the prerequisite for any subsequent autonomous action.

Third, the inversion thesis - "design for disconnected, enhance for connected" - establishes the design constraint. The observation mechanisms developed here must function in complete isolation from day one. Reporting to a central collector, when connectivity permits, is an enhancement. It is never a dependency.

The state variables \\(\Sigma(t)\\) and \\(\mathbf{H}(t)\\) defined in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) exist formally in the model. This article addresses how they are actually estimated: from local sensor readings, from inter-node {% term(url="#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} when the mesh is intact, and from statistical inference when observations age and certainty decays.

---

## Overview

Self-measurement enables autonomous systems to know their own state without external infrastructure. Each concept integrates theory with design consequence:

| Concept | Formal Contribution | Design Consequence |
| :--- | :--- | :--- |
| **Anomaly Detection** | Flag anomaly when \\(P(H_1 \mid z_t) > C_{\text{FP}}/(C_{\text{FP}} + C_{\text{FN}})\\) | Set detection sensitivity from error costs |
| **Gossip Propagation** | Convergence \\(O(\ln n / \lambda)\\) | Size fleet from acceptable propagation delay |
| **Staleness Theory** | \\(\tau_{\max} = \frac{1}{\lambda}(z_{\alpha/2}\sigma / \Delta h)^2\\) | Bound observation age from event rate and precision |
| **Byzantine Tolerance** | \\(\sum_{\text{Byz}} T_i < \frac{1}{3}\sum_{\text{all}} T_i\\) | Trust-weight nodes to bound adversarial influence |

This extends fault detection (Cristian, 1991) and epidemic algorithms (Demers et al., 1987) for contested edge environments.

---

## Opening Narrative: {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} Under Observation

Early morning. {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} BRAVO's 127-sensor perimeter mesh has been operating for 43 days. Without warning, the satellite uplink goes dark - no graceful degradation. Seconds later, Sensor 47 stops reporting. Last transmission: routine, battery at 73%, mesh connectivity strong. Then silence.

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} needs to answer: *how do you diagnose this failure without external systems?*

- **Hardware failure**: Route around the sensor
- **Communication failure**: Attempt alternative paths
- **Environmental occlusion**: Wait and retry
- **Adversarial action**: Alert defensive posture

Each diagnosis implies different response. Without central observability, {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} must diagnose itself - analyze patterns, correlate with neighbors, assess probabilities, decide on response. All locally. All autonomously.

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

The edge alternative inverts the data flow: sensors, analysis, and actuation all reside on the device, and the feedback loop closes locally without any external network call.

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

**Analysis must happen locally, and alerting must be autonomous**. You can't wait for human operators or external analysis services. The system must detect, diagnose, and decide - all within the constraints of local compute and memory.

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

<span id="def-4"></span>
**Definition 4** (Local Anomaly Detection Problem). *Given a time series \\(\\{x_t\\}_{t \geq 0}\\) generated by process \\(P\\), the local {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} problem is to determine, for each observation \\(x_t\\), whether \\(P\\) has transitioned from nominal behavior \\(P_0\\) to anomalous behavior \\(P_1\\), subject to:*
- *Computational budget \\(O(1)\\) per observation*
- *Memory budget \\(O(m)\\) for fixed \\(m\\)*
- *No access to ground truth labels*
- *Real-time decision requirement*

In other words, the detector must classify each incoming reading as normal or anomalous using only a fixed-size memory footprint and constant work per sample — ruling out batch methods or model retraining on the fly.

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

Edge {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} requires algorithms that are:
- **Computationally lightweight**: O(1) per observation
- **Memory-efficient**: Constant or logarithmic memory
- **Adaptive**: Adjust to changing baselines without retraining
- **Interpretable**: Provide confidence, not just binary classification

Three approaches meet these requirements:

**Exponential Weighted Moving Average (EWMA)**

The simplest effective approach. The two equations below update the running mean \\(\mu_t\\) and running variance \\(\sigma_t^2\\) after each new observation \\(x_t\\), where \\(\alpha \in (0,1)\\) is the smoothing weight that trades recency for stability.

{% katex(block=true) %}
\begin{aligned}
\mu_t &= \alpha x_t + (1 - \alpha) \mu_{t-1} \\
\sigma_t^2 &= \alpha (x_t - \mu_{t-1})^2 + (1 - \alpha) \sigma_{t-1}^2
\end{aligned}
{% end %}

Where \\(\alpha \in (0, 1)\\) controls the decay rate. Smaller \\(\alpha\\) means longer memory. Note: variance uses \\(\mu_{t-1}\\) to keep the estimate independent of \\(x_t\\), consistent with the anomaly score calculation.

The anomaly score \\(z_t\\) normalizes the current observation's deviation from the running mean by the running standard deviation, yielding a dimensionless measure of surprise that can be compared against a fixed threshold regardless of the signal's units or scale.

{% katex(block=true) %}
z_t = \frac{|x_t - \mu_{t-1}|}{\sigma_{t-1}}
{% end %}

**Anomaly Classification Decision Problem**:

**Objective Function**: The formula selects the binary decision \\(d\\) (flag or not flag) that maximizes expected utility given the current observation \\(x_t\\), where false positive cost \\(C_{\text{FP}}\\) and false negative cost \\(C_{\text{FN}}\\) are the key parameters.

{% katex(block=true) %}
d^* = \arg\max_{d \in \{0, 1\}} \mathbb{E}[U(d \mid x_t)] = \arg\max_{d \in \{0, 1\}} \left[ -C_{\text{FP}} \cdot P(H_0 \mid x_t) \cdot d - C_{\text{FN}} \cdot P(H_1 \mid x_t) \cdot (1-d) \right]
{% end %}

where \\(d = 1\\) indicates "anomaly detected".

**Optimal Decision Rule**:

The system flags an observation as anomalous when \\(z_t > \theta^\*\\). The optimal threshold \\(\theta^*\\) is the inverse-normal quantile that balances the prior probabilities of the two hypotheses against their respective error costs, shifting the decision boundary toward sensitivity when missed detections are more costly than false alarms.

{% katex(block=true) %}
\theta^* = \Phi^{-1}\left(1 - \frac{C_{\text{FN}} \cdot P(H_1)}{C_{\text{FP}} \cdot P(H_0) + C_{\text{FN}} \cdot P(H_1)}\right)
{% end %}

<span id="prop-3"></span>
**Proposition 3** (Optimal Anomaly Threshold). *Given asymmetric error costs \\(C_{\text{FP}}\\) for false positives and \\(C_{\text{FN}}\\) for false negatives, the optimal detection threshold \\(\theta^\*\\) satisfies the likelihood ratio condition:*

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

This yields the Neyman-Pearson condition. Equivalently, flagging when \\(z_t > \theta^\*\\) is identical to the posterior-probability rule below: declare anomaly when the probability of \\(H_1\\) given the current score exceeds the ratio of false-positive cost to total error cost.

{% katex(block=true) %}
P(H_1 \mid z_t) > \frac{C_{\text{FP}}}{C_{\text{FP}} + C_{\text{FN}}}
{% end %}

Both formulations select the same decision boundary; the z-score form is computationally convenient while the posterior form makes the cost trade-off explicit. For tactical edge systems where \\(C_{\text{FN}} \gg C_{\text{FP}}\\), both shift toward sensitive detection.

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

For signals with periodic structure (day/night cycles, shift patterns), Holt-Winters captures level, trend, and seasonality. The three equations below update, respectively, the deseasonalized level \\(L_t\\), the local trend \\(T_t\\), and the seasonal correction \\(S_t\\), each controlled by its own smoothing coefficient (\\(\alpha\\), \\(\beta\\), \\(\gamma\\)) and a period length \\(p\\).

{% katex(block=true) %}
\begin{aligned}
L_t &= \alpha (x_t - S_{t-p}) + (1 - \alpha)(L_{t-1} + T_{t-1}) \\
T_t &= \beta (L_t - L_{t-1}) + (1 - \beta) T_{t-1} \\
S_t &= \gamma (x_t - L_t) + (1 - \gamma) S_{t-p}
\end{aligned}
{% end %}

Where \\(L_t\\) is level, \\(T_t\\) is trend, \\(S_t\\) is seasonal component, and \\(p\\) is period length.

- **Compute**: O(1) per observation
- **Memory**: O(p) to store one period of seasonal factors
- **Adaptation**: Continuous updates to all components

*Period examples by scenario*:
- **{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}**: p=1 (no meaningful seasonality in flight telemetry) - use EWMA instead
- **{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}**: p=24 hours for communication quality (terrain/atmospheric effects), p=8 hours for engine metrics (thermal cycles)
- **{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}**: p=24 hours for solar/thermal cycles, p=7 days for activity patterns near defended perimeter

**Isolation Forest Sketch for Multivariate**

For multivariate {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} with limited memory, streaming isolation forest assigns each point an anomaly score based on how quickly it can be isolated in a random tree ensemble. The formula below maps expected isolation path length \\(E[h(x)]\\) — normalized by the average path length \\(c(n)\\) in a random tree of \\(n\\) points — to a score between 0 and 1, where scores near 1 indicate anomalies that isolate unusually quickly.

{% katex(block=true) %}
\text{Anomaly Score} = 2^{-E[h(x)] / c(n)}
{% end %}

Where \\(h(x)\\) is path length to isolate \\(x\\), and \\(c(n)\\) is average path length in a random tree.

- **Compute**: O(log n) per query, O(t) per tree
- **Memory**: \\(O(t \times d)\\) for t trees with depth limit d
- **Adaptation**: Reservoir sampling for tree updates

**Parameter derivation for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}**:

Under assumption set {% katex() %}\mathcal{A}_{IF}{% end %} (memory budget \\(M \leq 32\\)KB, anomaly rate \\(\pi_1 \approx 0.02\\), feature dimension \\(d = 12\\)), the three equations below derive the number of trees \\(t\\), maximum tree depth \\(d_{\max}\\), and resulting memory footprint \\(M\\) from the stated constraints.

{% katex(block=true) %}
\begin{aligned}
t &= \lceil \ln(1/\delta) / \ln(2) \rceil = 50 \text{ trees for } \delta = 10^{-15} \text{ failure probability} \\
d_{\max} &= \lceil \log_2(n_{\text{sample}}) \rceil = 8 \text{ for } n = 128 \\
M &= t \times d_{\max} \times d \times 4 \text{ bytes} \approx 25\text{KB}
\end{aligned}
{% end %}

**Detection rate derivation**: Under {% katex() %}\mathcal{A}_{IF}{% end %}, the formula below lower-bounds the true positive rate as a function of \\(t\\) and \\(d_{\max}\\); the approximation uses \\(1-(1-p)^t \geq 1-e^{-pt}\\) and evaluates to roughly 0.85 for these parameters.

{% katex(block=true) %}
\text{TPR} = 1 - \left(1 - \frac{1}{2^{d_{\max}}}\right)^t \geq 1 - e^{-t/2^{d_{\max}}} \approx 0.85
{% end %}

False positive rate \\(\text{FPR} = \pi_0 \cdot P(\text{anomaly score} > \theta) \approx 0.03\\) for threshold at 95th percentile.

**CUSUM for Change-Point Detection**

When the goal is detecting *when* a change occurred (not just that it occurred), CUSUM provides optimal detection for shifts in mean. The statistic \\(S_t\\) accumulates evidence of a positive shift above the slack \\(k\\) relative to nominal mean \\(\mu_0\\), resetting to zero whenever evidence goes negative, and triggers an alarm when it exceeds threshold \\(h\\).

{% katex(block=true) %}
S_t = \max(0, S_{t-1} + x_t - \mu_0 - k)
{% end %}

where \\(\mu_0\\) is the nominal mean and \\(k\\) is the allowable slack. Alarm when \\(S_t > h\\).

*Detection speed comparison*: For a shift of magnitude \\(\delta\\), the formula below gives the expected number of samples CUSUM needs before triggering, as a function of alarm threshold \\(h\\), slack \\(k\\), and shift \\(\delta\\).

{% katex(block=true) %}
N_{\text{CUSUM}} = \frac{h}{\delta - k} \quad \text{for } \delta > k
{% end %}

EWMA with smoothing \\(\alpha\\) detects when {% katex() %}\bar{x}_t{% end %} crosses the control limit \\(h_{\text{EWMA}} = L \cdot \sigma\sqrt{\alpha/(2-\alpha)}\\). The average run length under \\(H_1\\) (ARL\\(_1\\)) depends on both \\(\delta\\) and \\(\alpha\\) and has no simple closed form — it is computed from Markov chain approximations or simulation. For standard operating parameters (\\(\delta = \sigma\\), \\(\alpha = 0.3\\), control limit \\(L = 2.5\\)), the standard ARL table entry is shown below.

{% katex(block=true) %}
\text{ARL}_1(\text{EWMA}) \approx 12.9 \text{ samples (from standard ARL tables)}
{% end %}

**Detection speedup analysis**:

Under assumption \\(\delta \in [0.5\sigma, 1.5\sigma]\\), \\(\Delta U_{\text{speed}} \in [1.15, 1.29]\\). The speedup increases with shift magnitude because CUSUM is parameterized for a known step change (\\(k = \delta/2\\) is optimal for shift \\(\delta\\)) while EWMA is a general-purpose smoother not tuned to any specific shift. CUSUM's optimality for step changes (proven by Moustakides, 1986) means it dominates EWMA for the abrupt sensor failure scenario.

**Error rate derivation**:

With threshold \\(\theta = z_\alpha \sigma\\) where \\(z_\alpha = 2.5\\) and anomaly score \\(z_t = |x_t - \mu|/\sigma\\), the two-sided normal distribution gives the following false positive and false negative rates; the FNR assumes a shift of \\(\delta = 4\sigma\\) from the anomalous distribution.

{% katex(block=true) %}
\begin{aligned}
\text{FPR} &= P(|Z| > z_\alpha \mid H_0) = 2\Phi(-z_\alpha) \approx 0.012 \\
\text{FNR} &= P(|Z| \leq z_\alpha \mid H_1) = \Phi(z_\alpha - \delta/\sigma) \approx 0.07 \text{ for } \delta = 4\sigma
\end{aligned}
{% end %}

**Detection latency**: EWMA effective memory spans \\(1/\alpha\\) to \\((2-\alpha)/\alpha\\) observations. For \\(\alpha = 0.3\\): \\(N \in [3, 5]\\) observations contribute meaningfully to the statistic.

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} Sensor 47 uses EWMA for primary detection: temperature, motion intensity, battery voltage each tracked independently. Cross-sensor correlation uses a lightweight covariance estimate between Sensor 47 and its mesh neighbors.

### Adaptive Change-Point Detection: From Static to Kalman-Optimal Baseline

The CUSUM statistic above uses a fixed nominal mean \\(\mu_0\\). In practice, sensor baselines drift: OUTPOST thermal sensors track diurnal temperature cycles, CONVOY engine metrics shift with load and altitude, RAVEN RF interference patterns change with formation geometry. When \\(\mu_0\\) is stale, every observation accumulates evidence of a "change" that is simply baseline drift — generating false alarms continuously. The fix is to replace the static \\(\mu_0\\) with a Kalman-optimal adaptive estimator that tracks "normal" as it evolves.

<span id="def-23"></span>
**Definition 23** (Adaptive Baseline Estimator). *Given a sensor time series \\(\\{x_t\\}\\), the adaptive baseline is the Kalman-optimal estimate of the true instantaneous mean \\(\mu_t\\) under the first-order drift model:*

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

*Under \\(H_0\\) (no anomaly) at steady state: \\(z_t^K \sim \mathcal{N}(0,1)\\).*

**Design parameter** \\(\rho = Q/R\\) (drift-to-noise ratio) controls the adaptation rate:
- \\(\rho \to 0\\): baseline nearly frozen — correct for very slow drift, wrong for fast environmental shifts
- \\(\rho \to 1\\): aggressive tracking — follows rapid changes, more false alarms during genuine transients

**Connection to EWMA**: The update {% katex() %}\hat{\mu}_t = \hat{\mu}_{t-1} + K_t(x_t - \hat{\mu}_{t-1}){% end %} is structurally identical to the EWMA update \\(\mu_t = \alpha x_t + (1-\alpha)\mu_{t-1}\\), with \\(K_t\\) in place of \\(\alpha\\). The critical difference: EWMA uses a fixed \\(\alpha\\); the Kalman gain \\(K_t\\) starts large (high initial uncertainty, learns fast) and converges to a smaller steady-state value \\(K_\infty\\) (tracks at the optimal rate for the observed noise level). Fixed-\\(\alpha\\) EWMA is a degenerate Kalman filter with \\(P_{t-1}\\) forced constant at \\(\alpha R/(1-\alpha)\\) every step.

<span id="prop-24"></span>
**Proposition 24** (Kalman Baseline Convergence Rate). *The Kalman gain sequence \\(\\{K_t\\}\\) converges geometrically to the steady-state value \\(K_\infty\\), where:*

{% katex(block=true) %}
P_\infty = \frac{-Q + \sqrt{Q^2 + 4QR}}{2}, \qquad K_\infty = \frac{P_\infty + Q}{P_\infty + Q + R}
{% end %}

*For small drift \\(\rho = Q/R \ll 1\\): \\(K_\infty \approx \sqrt{\rho}\\) — the steady-state gain scales as the square root of the process-to-noise ratio. Convergence to \\(K_\infty\\) is geometric with rate \\((1 - K_\infty)^t\\) from any initial \\(P_0\\), reaching steady state in approximately \\(1/K_\infty\\) samples.*

*Proof*: Substitute \\(P_t = P_{t-1}\\) into the Riccati recursion \\(P_t = R(P_{t-1}+Q)/(P_{t-1}+Q+R)\\) and solve the resulting quadratic \\(P_\infty^2 + QP_\infty - QR = 0\\). Convergence rate follows from linearization of the recursion near \\(P_\infty\\). \\(\square\\)

**Design consequence**: After a transient of approximately \\(1/K_\infty\\) samples, the false positive rate for the Kalman anomaly score is *exactly* \\(2\Phi(-\theta^*)\\) — not an approximation. The EWMA-based score with fixed \\(\alpha\\) is only asymptotically calibrated and may carry excess false-alarm rate during the warm-up period.

**Validity condition — white noise assumption**: The Kalman gain convergence (Prop 24) and the \\(H_0\\) distribution \\(z_t^K \sim N(0,1)\\) both require measurement noise \\(v_t\\) to be approximately i.i.d. Gaussian with stationary variance \\(R\\). Real MEMS sensors violate this: \\(1/f\\) noise dominates below ~1 Hz; variance is temperature-correlated (\\(R(T) \approx R_0(1 + \beta \cdot \Delta T)\\) for thermistors); aging causes slow \\(R\\) drift. Practical remediation: (1) estimate \\(R\\) from a stationary calibration sequence at deployment temperature before each mission; (2) run a chi-squared test on the rolling innovation variance — if the ratio \\(\mathrm{Var}[z_t^K]/1.0\\) exceeds 1.5 over a 5-minute window, \\(R\\) is miscalibrated and must be re-estimated; (3) if temperature correlation is strong (\\(\beta \cdot \Delta T_{\max} > 0.3\\)), use an adaptive-\\(R\\) Kalman (Sage-Husa estimator). The false-alarm guarantee is void if \\(R\\) is off by more than 50\% — the actual false-alarm rate scales as \\(P(|N(0,1)| > \theta \cdot \sqrt{R_{\text{assumed}}/R_{\text{actual}}})\\).

**OUTPOST calibration**: Temperature sensors drift at \\(\approx 1\,^\circ\text{C}\,\text{day}^{-1}\\) with sensor noise \\(\sigma_{\text{sens}} = 0.1\,^\circ\text{C}\\). At \\(\lambda = 1\,\text{Hz}\\): \\(Q = (1/86400)^2 \approx 1.3 \times 10^{-10}\,\text{K}^2/\text{sample}\\), \\(R = 0.01\,\text{K}^2\\), giving \\(\rho \approx 1.3 \times 10^{-8}\\) and \\(K_\infty \approx 1.1 \times 10^{-4}\\). Baseline adapts on a timescale of \\(1/K_\infty \approx 9000\,\text{s} \approx 2.5\,\text{h}\\) — slow enough to track seasonal drift without following measurement noise.

<span id="def-24"></span>
**Definition 24** (Bayesian Surprise Metric). *The Bayesian Surprise statistic \\(S_t^K\\) is the adaptive-baseline generalization of CUSUM, accumulating Kalman log-likelihood ratios:*

{% katex(block=true) %}
S_t^K = \max\!\left(0,\; S_{t-1}^K + \Lambda_t^K - \kappa\right)
{% end %}

*where the log-likelihood ratio under a \\(\delta\\)-standard-deviation shift is:*

{% katex(block=true) %}
\Lambda_t^K = \delta \cdot z_t^K - \frac{\delta^2}{2}
{% end %}

*and \\(\kappa > 0\\) is the allowance that prevents indefinite accumulation. Alert condition: \\(S_t^K > h\\) for threshold \\(h\\).*

**Difference from static CUSUM**: The static form \\(S_t = \max(0, S_{t-1} + x_t - \mu_0 - k)\\) uses a fixed \\(\mu_0\\). Definition 24 replaces \\(x_t - \mu_0\\) with \\(\Lambda_t^K\\), computed from the Kalman innovation \\(z_t^K\\) normalized by the current innovation variance \\(\hat{P}_{t|t-1} + R\\). When the baseline drifts by \\(5\,^\circ\text{C}\\) over a season, \\(\Lambda_t^K \approx 0\\) throughout (the Kalman filter tracks the drift), while the static form accumulates \\(S_t \propto 5/\sigma\\) — triggering continuous false alarms.

**Bayesian interpretation**: \\(S_t^K\\) is a discounted accumulation of log Bayes factors. An alarm at \\(S_t^K > h\\) corresponds to posterior odds \\(P(\text{change} \mid x_{1:t})/P(\text{no change}) > e^h\\) — the detector declares a change when the Bayesian evidence ratio exceeds \\(e^h\\).

<span id="prop-25"></span>
**Proposition 25** (Sensor Death Override Condition). *The Brownian diffusion confidence interval (Proposition 5) is derived under the assumption that the sensor innovation \\(z_t^K\\) is \\(\mathcal{N}(0,1)\\). Two sensor death modes violate this assumption in opposite directions; both are detected by the sample chi-squared statistic over window \\(w\\):*

{% katex(block=true) %}
\chi^2_w(t) = \frac{1}{w} \sum_{s=t-w+1}^{t} \left(z_s^K\right)^2
{% end %}

*Under \\(H_0\\) (alive sensor): \\(\mathbb{E}[\chi^2_w] = 1\\). The diffusion model is overridden — and the node is flagged P_CRITICAL regardless of staleness — whenever:*

{% katex(block=true) %}
\chi^2_w(t) \notin [\delta_{\text{flat}},\; \delta_{\text{noise}}]
{% end %}

*Failure modes detected:*
- *\\(\chi^2_w < \delta_{\text{flat}}\\)*: **Flatline death** — sensor stuck at constant value, innovations collapse to zero. The diffusion model produces an artificially narrow CI suggesting high confidence, but the reading is uninformative.
- *\\(\chi^2_w > \delta_{\text{noise}}\\)*: **Noise death** — sensor producing random garbage, innovations explode. The diffusion model produces a wide CI suggesting uncertainty, but the reading is adversarially misleading.

*Proof*: Under \\(H_0\\), \\(z_s^K \overset{\text{i.i.d.}}{\sim} \mathcal{N}(0,1)\\) asymptotically (Proposition 24), so \\(w \cdot \chi^2_w \sim \chi^2_w\\) (chi-squared with \\(w\\) degrees of freedom). For window \\(w = 30\\): \\(P(\chi^2_{30}/30 < 0.1) = P(\chi^2_{30} < 3) \approx 2 \times 10^{-10}\\) and \\(P(\chi^2_{30}/30 > 10) = P(\chi^2_{30} > 300) < 10^{-50}\\) — false override rates are negligible. \\(\square\\)

**Calibration**: Set \\(\delta_{\text{flat}} = 0.1\\), \\(\delta_{\text{noise}} = 10\\), \\(w = \max(30, \tau_{\max} \cdot \lambda)\\). The window must span at least \\(\tau_{\max}\\) seconds (Prop 5) to ensure the chi-squared test has power against slow-onset flatline failures.

| Failure mode | \\(\chi^2_w(t)\\) signature | CI behavior | Override effect |
| :--- | :--- | :--- | :--- |
| Alive sensor | \\(\approx 1.0\\) | Correct width | No override |
| Flatline death | \\(\to 0\\) | Falsely narrow (high false confidence) | Flags P_CRITICAL |
| Noise death | \\(\gg 1\\) | Wide but misleading | Flags P_CRITICAL |

### Optional: Game-Theoretic Extension — Adversarial Threshold Selection

Proposition 3 derives \\(\theta^\*\\) against a non-strategic anomaly distribution. An adversary who controls a compromised sensor (as in the {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} scenario) can output \\(z_t = \theta^\* - \varepsilon\\) continuously, evading detection with zero effort. The correct defense is a **randomized threshold** - the Nash equilibrium of the inspection game.

**Inspection game**: Inspector selects threshold \\(\theta\\) (possibly mixed strategy \\(\pi(\theta)\\)); evader selects signal pattern \\(a \in \mathcal{U}\\) to minimize detection probability.

At the Nash equilibrium \\((\pi^\*, a^\*)\\), the inspector is indifferent over all thresholds in the support of \\(\pi^\*\\), and the evader is indifferent over all evasion strategies. The equation below states the equilibrium condition: the mixed threshold strategy \\(\pi^*(\theta)\\) must produce the same expected detection probability against every evasion action \\(a\\) the adversary might choose, so the adversary gains nothing by switching strategies.

{% katex(block=true) %}
\int_{\theta} P(\text{detect} \mid \theta, a) \, \pi^*(\theta) \, d\theta = \text{const} \quad \forall a \in \mathcal{U}
{% end %}

**Cross-sensor defense**: For the {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} mesh, cross-sensor consistency - checking whether sensor \\(i\\)'s report is consistent with what \\(i\\)'s neighbors' models predict - defeats the threshold-calibration attack, since exploiting it requires simultaneous compromise of multiple sensors.

**Practical implication**: In adversarial settings, draw \\(\theta_t \sim \pi^\*\\) fresh each detection round rather than using a fixed \\(\theta^\*\\). For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}'s 127-sensor mesh, cross-sensor consistency checks are the primary Byzantine detection layer; randomized thresholds are a secondary defense for individual sensor evaluation.

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

Priors \\(P(\text{cause})\\) come from historical failure rates. Likelihoods \\(P(E | \text{cause})\\) come from the signature patterns.

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

**Model specification for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}** (12-sensor vehicle telemetry):
- Input: 12 dimensions (engine temp, oil pressure, RPM, coolant, transmission temp, brake pressure, fuel flow, battery voltage, alternator output, exhaust temp, vibration, GPS quality)
- Architecture: \\(12 \to 8 \to 4 \to 3 \to 4 \to 8 \to 12\\)
- Parameters: \\(12\times8 + 8\times4 + 4\times3 + 3\times4 + 4\times8 + 8\times12 = 280\\) weights
- Quantized to INT8: **280 bytes** model size
- Inference: 280 multiply-adds = **<0.1ms** on ARM Cortex-M4

The anomaly score for input \\(x\\) is the squared reconstruction error \\(\|x - \hat{x}\|^2\\) normalized by the baseline variance \\(\sigma^2_{\text{baseline}}\\) estimated from validation data, so that a score near 1 indicates normal behavior and scores well above 1 indicate anomaly.

{% katex(block=true) %}
\text{AnomalyScore}(x) = \frac{\|x - \hat{x}\|^2}{\sigma^2_{\text{baseline}}}
{% end %}

where \\(\hat{x} = \text{Decoder}(\text{Encoder}(x))\\) and \\(\sigma^2_{\text{baseline}}\\) is computed from validation data.

**Training methodology for edge autoencoders**:

1. **Offline training**: Train on cloud with historical normal data (exclude known anomalies)
2. **Quantization-aware training**: Use INT8 quantization during training to avoid accuracy loss at deployment
3. **Validation**: Test on held-out anomalies to verify detection capability
4. **Deployment**: Export quantized weights to edge device
5. **Threshold calibration**: Compute threshold on-device from first 1000 observations

**Performance bounds** (derived from model capacity analysis): Under assumption set \\(\mathcal{A}_{perf}\\) — anomaly distribution \\(P_1\\) separable from normal \\(P_0\\) with overlap \\(\epsilon\\), model capacity \\(C_m\\), sample complexity \\(n\\) — the table below gives worst-case precision and recall bounds, per-inference computational complexity, and memory footprint for each of the four edge-viable detector families.

| Method | Precision Bound | Recall Bound | Complexity | Memory |
| :--- | :--- | :--- | :--- | ---: |
| EWMA (per-sensor) | \\(1 - \epsilon_{\text{marginal}}\\) | \\(1 - \text{FNR}(z_\alpha)\\) | \\(O(1)\\) | 96 bytes |
| Isolation Forest | \\(1 - \epsilon \cdot 2^{-d}\\) | \\(1 - (1-1/2^d)^t\\) | \\(O(\log n)\\) | 25 KB |
| Autoencoder (INT8) | \\(1 - \epsilon_{\text{joint}}\\) | \\(1 - e^{-C_m/d}\\) | \\(O(d^2)\\) | 280 bytes |
| Ensemble | \\(\max(P_i) + \delta_{\text{ensemble}}\\) | \\(1 - \prod(1-R_i)\\) | \\(O(\sum C_i)\\) | 376 bytes |

**Utility improvement of autoencoder over EWMA**: The net utility gain \\(\Delta U\\) decomposes into a precision improvement term (joint detection catches more true positives per alarm) minus a recall-reciprocal term penalizing the relative miss rate of each detector weighted by the false-negative cost \\(C_{\text{FN}}\\).

{% katex(block=true) %}
\Delta U = U_{\text{AE}} - U_{\text{EWMA}} = (P_{\text{AE}} - P_{\text{EWMA}}) \cdot V_{\text{TP}} - (R_{\text{AE}}^{-1} - R_{\text{EWMA}}^{-1}) \cdot C_{\text{FN}}
{% end %}

\\(\text{sign}(\Delta U) > 0\\) when \\(\epsilon_{\text{joint}} < \epsilon_{\text{marginal}}\\): autoencoder captures correlated deviations (e.g., simultaneous small shifts in engine temp, oil pressure, RPM) that per-sensor EWMA misses because joint anomaly probability exceeds the product of marginal probabilities.

**Tiny Neural Network for Failure Classification**

Beyond detection, classification identifies *which* failure mode is occurring. The formula below gives the probability distribution over failure classes produced by a two-layer network: weights \\(W_1, b_1\\) map the anomaly feature vector \\(x\\) to a hidden layer, \\(W_2, b_2\\) map to class logits, and softmax normalizes these into a probability vector summing to 1.

{% katex(block=true) %}
P(\text{failure\_type} | \text{anomaly\_vector}) = \text{softmax}(W_2 \cdot \text{ReLU}(W_1 \cdot x + b_1) + b_2)
{% end %}

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} failure classifier**:
- Input: 8-dimensional anomaly feature vector (motor currents, IMU residuals, GPS error, battery voltage deviation)
- Architecture: \\(8 \to 6 \to 5\\) classes (motor degradation, sensor drift, communication fault, power issue, unknown)
- Parameters: \\(8\times6 + 6\times5 = 78\\) weights = **78 bytes** INT8

**Classification accuracy bound**: The bound below gives the minimum guaranteed classification accuracy as a function of the number of classes \\(K\\), the VC dimension of the hidden layer \\(\text{VC}(h)\\), the training sample count \\(n\\), and the confidence parameter \\(\delta\\).

{% katex(block=true) %}
\text{Accuracy} \geq 1 - \frac{K \cdot \text{VC}(h)}{n} - \sqrt{\frac{\ln(1/\delta)}{2n}}
{% end %}

For sufficient training samples (\\(n > 100 \cdot K\\)) and well-separated failure modes, the lower bound exceeds \\(0.9\\).

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

**Detection rate derivation for {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}**:

For one-class SVM with \\(\nu\\)-parameterization, the fraction of training points outside the boundary is at most \\(\nu\\). Setting \\(\nu = 0.02\\) (the expected anomaly rate), the bounds below give the worst-case false positive rate and the minimum true positive rate as a function of VC dimension \\(\text{VC}(d)\\) and training size \\(n\\).

{% katex(block=true) %}
\text{FPR} \leq \nu = 0.02, \quad \text{TPR} \geq 1 - \frac{\text{VC}(d)}{n} \cdot \nu^{-1}
{% end %}

For \\(d=5\\) features and \\(n > 500\\) training samples: \\(\text{TPR} \geq 0.80\\). The low FPR is critical for battery-constrained sensors where false positives waste power \\(P_{\text{alert}}\\) on unnecessary transmissions.

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

**Specification**:
- Input: \\(32\\) timesteps \\(\times 4\\) channels (160 samples at 5Hz)
- Receptive field: \\(1 + 2\times(1+2+4) = 15\\) timesteps (3 seconds)
- Parameters: **388 bytes**
- Input buffer: **128 bytes** (ring buffer, reused)
- Total footprint: **~520 bytes** (parameters + buffer)
- Inference: **<1ms** on Cortex-M4

**Application**: {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} motor {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %}. Individual current readings appear normal, but the temporal signature of a failing bearing shows characteristic oscillation.

**Utility improvement of TCN over EWMA**: The formula expresses the gain entirely as a recall improvement — since both models produce the same value per true positive, the difference is how many additional anomalies the TCN catches by exploiting temporal context that the per-sample EWMA cannot see.

{% katex(block=true) %}
\Delta U_{\text{TCN}} = U_{\text{TCN}} - U_{\text{EWMA}} = (R_{\text{TCN}} - R_{\text{EWMA}}) \cdot V_{\text{detect}}
{% end %}

TCN's receptive field (15 timesteps) captures oscillation patterns with period \\(T \leq 15/f_s\\). EWMA operates per-sample without temporal context. For anomalies where \\(P(\text{anomaly} | x_{t-k:t}) > P(\text{anomaly} | x_t)\\), TCN achieves higher recall by design: \\(R_{\text{TCN}} / R_{\text{EWMA}} \approx T_{\text{pattern}} / T_{\text{sample}}\\).

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

\\(\text{sign}(\Delta U) > 0\\) when models detect different anomaly subsets (low \\(\rho_{ij}\\) correlation). For \\(K=4\\) models with \\(R_i \approx 0.8\\) and \\(\rho_{ij} < 0.5\\): \\(R_{\text{ensemble}} \geq 0.92\\).

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

When covariate shift occurs (\\(P_{\text{deploy}}(X) \neq P_{\text{train}}(X)\\)), detection accuracy degrades exponentially with the KL-divergence between deployment and training distributions, as shown below; \\(\lambda_{\text{drift}}\\) is the sensitivity of the particular model to distributional shift.

{% katex(block=true) %}
\text{Accuracy}(t) = \text{Accuracy}_0 \cdot e^{-\lambda_{\text{drift}} \cdot D_{KL}(P_{\text{deploy}} \| P_{\text{train}})}
{% end %}

Local threshold adjustment (recomputing \\(\theta\\) from recent \\(X\\)) restores accuracy when \\(P(Y|X)\\) is unchanged. Full retraining required when \\(P(Y|X)\\) shifts.

---

## Distributed Health Inference

### Gossip-Based Health Propagation

Individual nodes detect local anomalies. Fleet-wide health requires aggregation without a central coordinator.

<span id="def-5"></span>
**Definition 5** (Gossip Health Protocol). *A gossip health protocol is a tuple \\((\mathbf{H}, \lambda, M, T)\\) where:*
- *\\(\mathbf{H} = [h_1, \ldots, h_n] \in [0,1]^n\\) is the health vector over \\(n\\) nodes*
- *\\(\lambda > 0\\) is the gossip rate (exchanges per second per node)*
- *\\(M: [0,1]^n \times [0,1]^n \rightarrow [0,1]^n\\) is the merge function*
- *\\(T: \mathbb{R}^+ \rightarrow \mathbb{R}^+\\) is the {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} decay function*

In other words, every node keeps a score between 0 and 1 for each fleet member, periodically swaps that list with a random neighbor, and combines the two copies using a merge rule that discounts older entries via the {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} function \\(T\\).

The protocol operates in rounds:
1. **Local update**: Node \\(i\\) updates \\(h_i\\) based on local {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %}
2. **Peer selection**: Node \\(i\\) selects random peer \\(j\\)
3. **Exchange**: Nodes \\(i\\) and \\(j\\) exchange health vectors
4. **Merge**: Each node merges received vector with local knowledge

The diagram below illustrates a single {% term(url="#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} exchange: before the exchange each node holds only its own health vector, and after the merge both nodes hold the combined view of the pair.

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

The merge function must handle:
- **Staleness**: Older observations are less reliable
- **Conflicts**: Different nodes may observe different values
- **Adversarial injection**: Compromised nodes may inject false health values

The merge function combines two health estimates for node \\(k\\) into a single value by taking a trust-weighted average, where each source's weight \\(w\\) reflects how recently its observation was made.

{% katex(block=true) %}
h_k^{\text{merged}} = \frac{w_A \cdot h_k^A + w_B \cdot h_k^B}{w_A + w_B}
{% end %}

The weight assigned to each observation decays exponentially with its age \\(\tau\\) at rate \\(\gamma\\), so a 10-second-old reading contributes far less than a fresh one.

{% katex(block=true) %}
w = e^{-\gamma \tau}
{% end %}

With \\(\tau\\) as time since observation and \\(\gamma\\) as decay rate (distinct from the gossip rate \\(\lambda\\)).

<span id="prop-4"></span>
**Proposition 4** (Gossip Convergence). *For a {% term(url="#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip protocol{% end %} with rate \\(\lambda\\) and \\(n\\) nodes in a fully-connected network (any node can reach any other), the expected time for information originating at one node to reach all nodes is:*

{% katex(block=true) %}
T_{\text{convergence}} = O\left(\frac{\ln n}{\lambda}\right)
{% end %}

In other words, fleet-wide awareness scales only logarithmically with fleet size: doubling the number of nodes adds a fixed \\(O(\ln 2 / \lambda)\\) seconds to convergence, not a proportional delay.

*For sparse topologies with network diameter \\(D\\), convergence scales as \\(O(D \cdot \ln n / \lambda)\\) since information must traverse \\(D\\) hops.*

*Proof sketch*: The information spread follows logistic dynamics \\(dI/dt = \lambda I(1 - I)\\) where \\(I\\) is the fraction of informed nodes. Solving with initial condition \\(I(0) = 1/n\\) and computing time to reach \\(I = 1 - 1/n\\) yields \\(T = (2 \ln(n-1))/\lambda\\).
**Corollary 2**. *Doubling swarm size adds only \\(O(\ln 2 / \lambda) \approx 0.69/\lambda\\) seconds to convergence time, making {% term(url="#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip protocol{% end %}s inherently scalable for edge fleets.*

The lossless fully-connected model of Proposition 4 is a lower bound. Real edge meshes are sparse and contested: OUTPOST operates on a 127-sensor mesh with diameter \\(D \approx 8\\) hops under sustained jamming at \\(p_{\text{loss}} = 0.35\\). The actual convergence time is not \\(O(\ln n / \lambda)\\) but a function of both topology and loss rate.

<span id="prop-26"></span>
**Proposition 26** (Gossip Convergence on Lossy Sparse Mesh). *Let \\(G = (V, E)\\) be a connected graph with \\(n\\) nodes and edge conductance:*

{% katex(block=true) %}
\Phi = \min_{\substack{S \subseteq V \\ 0 < |S| \leq n/2}} \frac{|E(S,\, V \setminus S)|}{|S| \cdot (n - |S|)/n}
{% end %}

*Under push-pull gossip with rate \\(\lambda\\) and independent per-message loss probability \\(p_{\text{loss}} \in [0, 1)\\), the expected convergence time satisfies:*

{% katex(block=true) %}
\mathbb{E}[T_{\text{convergence}}] \leq \frac{2\ln n}{\lambda \cdot (1 - p_{\text{loss}}) \cdot \Phi}
{% end %}

*with probability at least \\(1 - 1/n\\). For any connected graph with diameter \\(D\\), the operational bound \\(\Phi \geq 1/D\\) gives:*

{% katex(block=true) %}
\mathbb{E}[T_{\text{convergence}}] \leq \frac{2 D \ln n}{\lambda \cdot (1 - p_{\text{loss}})}
{% end %}

*Proof sketch*: Let \\(S_t\\) denote the informed set at gossip round \\(t\\), with \\(|S_t| = k\\). By definition of \\(\Phi\\), the number of boundary edges is at least \\(\Phi \cdot k(n-k)/n\\). Each boundary edge activates — an informed node contacts an uninformed neighbor and the message arrives — with probability \\((1-p_{\text{loss}})/\bar{d}\\) per round (\\(\bar{d}\\) = average degree). The expected growth satisfies \\(\mathbb{E}[|S_{t+1}| - |S_t|] \geq (1-p_{\text{loss}}) \cdot \Phi \cdot k(n-k)/n\\). This is the discrete logistic equation with rate \\(r = (1-p_{\text{loss}})\Phi\\). The logistic ODE solution \\(dI/dt = r \cdot I(1-I)\\) reaches \\(I = 1 - 1/n\\) from \\(I = 1/n\\) in \\(T = (2\ln(n-1))/r\\). Applying \\(\Phi \geq 1/D\\) gives the diameter bound. Probability bound follows from Markov's inequality on the stopping time. \\(\square\\)

**Specializations**:

| Graph topology | \\(\Phi\\) | Expected convergence |
| :--- | :--- | :--- |
| Fully connected, lossless | \\(1\\) | \\(O(\ln n / \lambda)\\) — recovers Prop 4 |
| \\(k\\)-regular expander, lossless | \\(\Omega(1)\\) | \\(O(\ln n / \lambda)\\) |
| Grid (\\(\sqrt{n} \times \sqrt{n}\\)), lossless | \\(\Omega(1/\sqrt{n})\\) | \\(O(\sqrt{n}\ln n / \lambda)\\) |
| OUTPOST mesh (\\(D=8\\), \\(p_{\text{loss}}=0.35\\)) | \\(\geq 1/8\\) | \\(\leq 2 \cdot 8 \cdot \ln(127)/(\lambda \cdot 0.65) \approx 119/\lambda\,\text{s}\\) |

**OUTPOST calibration gap**: At \\(\lambda = 0.5\,\text{Hz}\\), Proposition 4 predicts \\(T \approx 9.7\,\text{s}\\); Proposition 26 predicts \\(T \leq 238\,\text{s} \approx 4\,\text{min}\\) under jamming. Designing for 10-second health awareness and receiving 4-minute convergence is a mission-critical gap. The correct design response is to either increase \\(\lambda\\) (higher energy cost from Definition 21), decrease \\(D\\) by adding mesh relay nodes, or build decision logic that tolerates 4-minute-stale health data (increasing \\(\tau_{\max}\\) from Proposition 5 accordingly).

**Corollary 3** (Loss-Rate Gossip Budget). *To maintain convergence within target time \\(T^\*\\) under loss probability \\(p_{\text{loss}}\\) on a diameter-\\(D\\) mesh, the minimum gossip rate is:*

{% katex(block=true) %}
\lambda^* \geq \frac{2 D \ln n}{T^* \cdot (1 - p_{\text{loss}})}
{% end %}

**Gossip Rate Selection: Formal Optimization**

**Objective Function**: The formula finds the gossip rate \\(\lambda^*\\) that best balances convergence speed (which benefits from higher \\(\lambda\\)) against communication power cost (which scales linearly with \\(\lambda\\)).

{% katex(block=true) %}
\lambda^* = \arg\max_{\lambda \in [\lambda_{\min}, \lambda_{\max}]} \left[ -w_1 \cdot T_{\text{converge}}(\lambda) - w_2 \cdot P_{\text{comm}}(\lambda) \right]
{% end %}

where \\(T_{\text{converge}}(\lambda) = \frac{2 \ln n}{\lambda}\\) is convergence time and \\(P_{\text{comm}}(\lambda) = \lambda \cdot E_{\text{msg}}\\) is power consumption.

**Constraint Set**: Three hard limits bound the feasible rate range — the binding constraint (whichever is most restrictive) determines \\(\lambda^*\\).

{% katex(block=true) %}
\begin{aligned}
g_1: && \lambda \cdot E_{\text{msg}} &\leq P_{\text{budget}} && \text{(power constraint)} \\
g_2: && \lambda \cdot B_{\text{msg}} &\leq B_{\text{available}}(C(t)) && \text{(bandwidth)} \\
g_3: && \frac{2\ln n}{\lambda} &\leq \tau_{\text{staleness}}^{\max} && \text{(freshness requirement)}
\end{aligned}
{% end %}

**Optimal Solution**: The formula below takes the minimum of the three per-constraint maximum rates; whichever constraint is most restrictive determines \\(\lambda^*\\), and the other two are automatically satisfied.

{% katex(block=true) %}
\lambda^* = \min\left(\frac{P_{\text{budget}}}{E_{\text{msg}}}, \frac{B_{\text{available}}}{B_{\text{msg}}}, \frac{2\ln n}{\tau_{\text{staleness}}^{\max}}\right)
{% end %}

**State Transition Model**: The rule below describes how a node's {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} either resets to zero (when a fresh gossip exchange occurs, with probability proportional to rate \\(\lambda\\)) or grows by \\(\Delta t\\) when no exchange happens in the current interval.

{% katex(block=true) %}
\tau_{\text{staleness}}(t+1) = \begin{cases}
0 & \text{with probability } 1 - e^{-\lambda \cdot \Delta t} \\
\tau_{\text{staleness}}(t) + \Delta t & \text{otherwise}
\end{cases}
{% end %}

For tactical parameters (\\(n \sim 50\\), \\(\lambda \sim 0.2\\) Hz), Proposition 4 gives \\(T = 2\ln(49)/0.2 \approx 39\\) seconds - convergence within 30-40 seconds, fast enough to establish fleet-wide health awareness within a single mission phase. Broadcast approaches scale linearly with \\(n\\), which is why gossip wins at scale.

For strategic health reporting scenarios where nodes have incentives to misreport, see below.

### Optional: Game-Theoretic Extensions

#### Strategic Health Reporting

The {% term(url="#def-5", def="Peer-to-peer protocol where each node periodically exchanges state with random neighbors; health information spreads fleet-wide with mathematically bounded delay and no central coordinator") %}gossip{% end %} merge assumes truthful health reporting. Nodes competing for limited healing resources have incentives to under-report health (appear more sick) to attract healing attention.

**Cheap-talk game** (Crawford-Sobel): Node \\(i\\) with true health \\(h_i\\) sends report \\(\hat{h}_i\\). Healing resources are allocated proportional to reported sickness \\(1 - \hat{h}_i\\). If node \\(i\\) values healing resources, the equilibrium report satisfies \\(\hat{h}_i < h_i\\) - systematic under-reporting.

**Crawford-Sobel equilibrium**: With \\(k\\) nodes, reports are only coarsely informative - the equilibrium partitions the health space into \\(k\\) intervals, revealing only which interval each node's health falls in, not the exact value.

**Incentive-compatible allocation**: Replace proportional allocation with a **Groves mechanism** for healing priority: each node reports health and the mechanism allocates healing proportional to the *marginal value of healing* (not reported sickness). Truthful reporting becomes a dominant strategy when the node's healing benefit is fully internalized.

**Practical implication**: Implement comparative health reporting - nodes rank their own health relative to neighbors rather than reporting absolute values. Rank-based reports are harder to manipulate strategically and preserve the ordering needed for healing priority assignment while reducing the incentive for absolute-value inflation.

#### Gossip as a Public Goods Game

The gossip rate optimization assumes a central planner selects \\(\lambda\\). In an autonomous fleet, each node independently selects its gossip rate - and gossip is a **public good**: each message costs the sender (power, bandwidth) but benefits all nodes' health awareness.

**Public goods game**: Node \\(i\\) selects rate \\(\lambda_i \geq 0\\). The formula below expresses aggregate health quality \\(Q\\) as a function of the mean gossip rate \\(\bar{\lambda}\\) across all \\(n\\) nodes, where \\(t\\) is elapsed time; quality rises toward 1 as \\(\bar{\lambda}\\) increases but each individual node bears the full cost of its own transmissions while sharing the benefit equally with all peers.

{% katex(block=true) %}
Q(\boldsymbol{\lambda}) = 1 - e^{-\bar{\lambda} t}, \quad \bar{\lambda} = \frac{1}{n}\sum_i \lambda_i
{% end %}
Node \\(i\\) captures only \\(1/n\\) of the benefit of its own gossip. The Nash equilibrium satisfies \\(\frac{\partial Q}{\partial \lambda_i}\big|_{\text{NE}} = \frac{t}{n} e^{-\bar{\lambda}^{\text{NE}} t} = c_i\'(\lambda_i)\\), while the social optimum satisfies \\(t \cdot e^{-\bar{\lambda}^{\text{OPT}} t} = c_i\'(\lambda_i)\\). Since \\(1/n < 1\\), the comparison below holds and the equilibrium rate falls short of the social optimum.

{% katex(block=true) %}
\bar{\lambda}^{\text{NE}} < \bar{\lambda}^{\text{OPT}}
{% end %}
For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (\\(n = 47\\)), autonomous gossip equilibrium provides approximately \\(1/47\\) of the socially optimal convergence rate.

**VCG mechanism**: A Groves mechanism assigns task-allocation transfers to nodes proportional to their gossip contribution: nodes that gossip more receive fewer computational tasks (reducing effective cost). Under this mechanism, truthful power-budget reporting is a dominant strategy and the social optimum is achieved.

**Practical implication**: During connected intervals, compute gossip rate assignments centrally and distribute them as target rates. The VCG transfer - differential task assignment - incentivizes nodes to maintain their assigned rates during partition. Priority gossip multipliers should be set to cover the \\(1/n\\) free-rider discount, not arbitrary priority levels.

<span id="scenario-autodelivery"></span>

### Commercial Application: {% term(url="#scenario-autodelivery", def="Autonomous last-mile delivery fleet in an urban metro area; urban connectivity gaps and GPS spoofing risk require local fleet-health management") %}AUTODELIVERY{% end %} Fleet Health

{% term(url="#scenario-autodelivery", def="Autonomous last-mile delivery fleet in an urban metro area; urban connectivity gaps and GPS spoofing risk require local fleet-health management") %}AUTODELIVERY{% end %} operates autonomous delivery vehicles across a metropolitan area. Vehicles navigate urban canyons, parking structures, and dense commercial districts with intermittent cellular connectivity. Each vehicle must maintain fleet health awareness - vehicle availability, road conditions, charging status - without continuous cloud connectivity.

The gossip architecture implements hierarchical health propagation: local gossip between nearby vehicles, zone aggregation at hub gateways, and fleet-wide propagation when connected.

**Local gossip** (vehicle-to-vehicle): Vehicles within DSRC range (approximately 300 meters in urban environments) exchange health vectors at 0.5 Hz. Each vehicle maintains the fields below; the Staleness Threshold column gives the maximum age at which each field still supports useful decisions — longer-lived fields like charging station status remain valid for 10 minutes because infrastructure changes slowly.

| Health Field | Size | Update Frequency | Staleness Threshold |
| :--- | ---: | :--- | ---: |
| Vehicle ID + Position | 12 bytes | Every exchange | 30s |
| Battery SoC + Range | 4 bytes | Every exchange | 60s |
| Current Task Status | 8 bytes | On change | 120s |
| Road Hazard Reports | 16 bytes | On detection | 300s |
| Charging Station Status | 8 bytes | On visit | 600s |

**Zone-level aggregation**: Hub gateways (vehicles stationed at distribution centers) aggregate zone health and gossip between zones via longer-range V2X communication. Zone summaries include:
- Available vehicles by capability level
- Coverage gaps (areas with no vehicle within 10 minutes)
- Charging infrastructure status
- Road condition summaries

**Fleet-wide propagation**: From Proposition 4, \\(T = 2\ln(n)/\lambda\\), so typical metropolitan fleets achieve full health convergence in under a minute, enabling real-time rebalancing of delivery assignments.

**Position validation in urban environments**: {% term(url="#scenario-autodelivery", def="Autonomous last-mile delivery fleet in an urban metro area; urban connectivity gaps and GPS spoofing risk require local fleet-health management") %}AUTODELIVERY{% end %} faces spoofing risks from GPS multipath in urban canyons and potential adversarial spoofing from competitors or theft attempts. The function below classifies each vehicle's claimed position \\(p_i\\) as true (corroborated by a nearby peer), suspect (no peer within validation range), or false (contradicted by a peer's observation beyond the kinematically possible travel distance).

{% katex(block=true) %}
\text{Valid}(p_i) = \begin{cases}
\text{true} & \text{if } \exists j \in \mathcal{N}_i: \|p_i - p_j^{\text{observed}}\| < \epsilon \\
\text{suspect} & \text{if no nearby peer can validate} \\
\text{false} & \text{if } \exists j: \|p_i^{\text{claimed}} - p_j^{\text{observed}}\| > d_{\text{impossible}}
\end{cases}
{% end %}

where \\(\epsilon = 50m\\) is the validation tolerance and \\(d_{\text{impossible}}\\) is the maximum distance a vehicle could have traveled since last validated position.

Vehicles with sustained position validation failures are flagged for operational review and excluded from sensitive tasks (high-value deliveries, access to secure facilities).

**Delivery coordination under partition**: When a vehicle enters an underground parking garage (complete cellular blackout), it continues operating with cached task assignments. Upon emergence:
1. Gossip exchange with first encountered peer
2. Receive updates accumulated during blackout
3. Reconcile any conflicting task assignments (first-commit-wins semantics)
4. Resume normal gossip participation

Average underground dwell time: 4.2 minutes. With 60-second {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} threshold, vehicles emerge with stale but still-useful health data - well within the maximum useful {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} for task rebalancing decisions.

### Priority-Weighted Gossip Extension

Standard gossip treats all health updates equally. In tactical environments, critical health changes (node failure, resource exhaustion, adversarial detection) should propagate faster than routine updates.

**Priority classification**:
- \\(P_{CRITICAL}\\) (priority 3): Node failure, Byzantine detection, adversarial alert
- \\(P_{URGENT}\\) (priority 2): Resource exhaustion (<10%), capability downgrade
- \\(P_{NORMAL}\\) (priority 1): Routine health updates, minor degradation

**Accelerated propagation protocol**:

The gossip rate \\(\lambda_p\\) for priority-\\(p\\) messages scales the base rate by a factor proportional to priority level, where \\(\eta\\) is the acceleration coefficient and \\(p = 1, 2, 3\\) for normal, urgent, and critical messages respectively.

{% katex(block=true) %}
\lambda_p = \lambda_{\text{base}} \cdot (1 + \eta \cdot (p - 1))
{% end %}

where \\(\eta\\) is the acceleration factor (typically 2-3). Critical messages gossip at \\(3\times\\) normal rate.

**Message prioritization in constrained bandwidth**:

When bandwidth is limited, each gossip exchange prioritizes by urgency. The protocol proceeds as follows:

**Step 1**: Merge local and peer health vectors into a unified update set.

**Step 2**: Sort updates by priority (descending), then by {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} (ascending) within each priority class.

**Step 3**: Transmit updates in sorted order until the bandwidth budget is exhausted. The condition below permits update \\(u_i\\) only when all previously selected updates plus \\(u_i\\) itself still fit within \\(B_{\text{budget}}\\).

{% katex(block=true) %}
\text{Transmit update } u_i \text{ iff } \sum_{j < i} \text{size}(u_j) + \text{size}(u_i) \leq B_{\text{budget}}
{% end %}

**Step 4**: Critical override — the implication below unconditionally forces transmission of any \\(P_{\text{CRITICAL}}\\) update regardless of whether the budget would be exceeded.

{% katex(block=true) %}
\text{priority}(u) = P_{\text{CRITICAL}} \implies \text{transmit}(u) = \text{true}
{% end %}

This ensures safety-critical information propagates regardless of bandwidth constraints, accepting temporary budget overrun.

**Convergence improvement**: For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with \\(\eta = 2\\), priority-weighted gossip triples the effective critical gossip rate, as the formula below shows by substituting \\(P_{\text{CRITICAL}} = 3\\) into the general rate equation.

{% katex(block=true) %}
\lambda_{\text{crit}} = \lambda_{\text{base}} \cdot (1 + \eta \cdot (P_{\text{CRITICAL}} - 1)) = \lambda_{\text{base}} \cdot 3
{% end %}

Since convergence time scales inversely with effective rate, the ratio of normal to critical convergence times equals the ratio of critical to normal gossip rates, giving a theoretical 3x speedup for \\(n = 47\\) drones.

{% katex(block=true) %}
\frac{T_{\text{norm}}}{T_{\text{crit}}} = \frac{\lambda_{\text{crit}}}{\lambda_{\text{norm}}} = 3.0 \text{ (theoretical)}
{% end %}

Accounting for message overhead and collision backoff, the expected speedup is approximately \\(2.6\times\\). Under the assumptions {% katex() %}\mathcal{A}_{\text{gossip}}{% end %} (uniform message sizes, bounded collision probability), critical updates converge in {% katex() %}O(D \cdot \delta_{\text{crit}}){% end %} versus {% katex() %}O(D \cdot \delta_{\text{norm}}){% end %} for normal updates, where \\(D\\) is network diameter.

**Anti-flood protection**: To prevent priority abuse by a {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} that floods \\(P_{\text{CRITICAL}}\\) messages, the node's historical rate of critical messages must not exceed \\(\rho_{\text{max}}\\); the condition below enforces this per-source rate limit.

{% katex(block=true) %}
\text{Allow } P_{\text{CRITICAL}} \text{ from node } i \text{ iff } \frac{N_{\text{crit}}^i(t)}{t - t_{\text{start}}} < \rho_{\text{max}}
{% end %}

where \\(\rho_{\text{max}} \approx 0.01\\) messages/second. Exceeding this rate triggers trust decay.

### Bandwidth Asymmetry and Ingress Filtering

The gossip prioritization above assumes backhaul bandwidth is scarce but nonzero. At the extreme — when the radio link is a tiny fraction of the local sensor bus — prioritization alone is insufficient. The node must also decide which metrics are worth transmitting at all.

Define the **bandwidth asymmetry ratio**:

{% katex(block=true) %}
\beta = \frac{B_b}{B_l}
{% end %}

where \\(B_b\\) is backhaul bandwidth (radio uplink) and \\(B_l\\) is local bus bandwidth (intra-node sensor bus). Typical edge values: \\(B_b \approx 9.6\,\text{kbps}\\) (tactical HF radio), \\(B_l \approx 100\,\text{Mbps}\\) (sensor bus), giving \\(\beta \approx 10^{-4}\\). At \\(\beta < 0.01\\), the backhaul is less than 1% of local capacity. Sending everything the node observes locally is physically impossible.

<span id="def-22"></span>
**Definition 22** (Bandwidth-Asymmetry Ingress Filter). *The ingress filter \\(\Pi: \mathcal{T} \times \mathbb{R}_{\geq 0} \to \{0,1\}\\) determines whether metric \\(m \in \mathcal{T}\\) observed at time \\(t\\) is transmitted:*

{% katex(block=true) %}
\Pi(m,\,t) = \begin{cases}
1 & \text{if priority}(m) = P_{\text{CRITICAL}} \\
1 & \text{if } t - t_{\text{last}}(m) > \tau_{\max} \\
1 & \text{if } \dfrac{|m(t) - m(t_{\text{last}})|}{m_{\text{range}}} > \dfrac{\theta_\Pi}{\beta} \\
0 & \text{otherwise}
\end{cases}
{% end %}

*where \\(m(t_{\text{last}})\\) is the last transmitted value of \\(m\\), \\(m_{\text{range}}\\) is the metric's operational dynamic range, \\(\theta_\Pi\\) is a baseline sensitivity parameter, \\(\beta = B_b/B_l\\) is the bandwidth asymmetry ratio, and \\(\tau_{\max}\\) is the maximum useful staleness bound from Proposition 5.*

**Interpretation**: Three conditions trigger transmission (any one suffices):
1. **Critical override**: P_CRITICAL metrics bypass the filter entirely — safety-critical information always transmits.
2. **Staleness override**: Even if a metric is slowly changing, it transmits at least once per \\(\tau_{\max}\\) — the MAPE-K loop never starves on stale P2/P3 inputs. This ties directly to Proposition 5: a metric silent beyond \\(\tau_{\max}\\) carries zero confidence, so it must refresh.
3. **Magnitude threshold**: As \\(\beta \to 0\\), the normalized-change threshold \\(\theta_\Pi/\beta \to \infty\\), so only extreme deviations transmit in normal operation.

**Calibration example for OUTPOST** (\\(\beta = 10^{-4}\\), \\(\theta_\Pi = 0.001\\)):

| Metric | Normal threshold | Filtered threshold (\\(\theta_\Pi/\beta\\)) | Interpretation |
| :--- | :--- | :--- | :--- |
| Temperature drift | \\(0.1\,^\circ\text{C}\\) (0.1% of \\(100\,^\circ\text{C}\\) range) | \\(10\,^\circ\text{C}\\) (10% of range) | Only transmit on significant excursion |
| Battery state-of-charge | 1% change | 10% change | Coarse reporting only |
| Seismic amplitude | any spike | always (P_CRITICAL) | Bypasses filter |
| Mesh link quality | 5% drop | 50% drop | Catastrophic degradation only |

The filter preserves the P0–P2 observability hierarchy: availability (P0) and resource exhaustion (P1) metrics carry P_CRITICAL priority and are never dropped; performance (P2) and anomaly (P3) metrics are subject to the \\(\beta\\)-scaled threshold.

**Energy connection**: Each filtered-out metric saves \\(T_s\\) joules (Definition 21). Over a 72-hour partition with 1,000 sensor metrics updating at 1 Hz, filtering to \\(\beta = 10^{-4}\\) reduces transmissions from 259 million potential packets to fewer than 2,600 — a 100,000x reduction in radio energy expenditure, directly extending battery life.

### Gossip Under Partition

Fleet partition creates isolated gossip domains. Within each cluster, convergence continues at rate \\(O(\ln n_{\text{cluster}})\\). Between clusters, state diverges until reconnection.

**Remark** (Partition Staleness). *For node \\(i\\) in cluster \\(C_1\\) observing node \\(j\\) in cluster \\(C_2\\), {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} - the elapsed time since observation - accumulates from partition time \\(t_p\\):*

{% katex(block=true) %}
\tau_{ij}(t) = t - t_p + \tau_{ij}(t_p)
{% end %}

*The {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} grows unboundedly during partition, eventually exceeding any useful threshold.*

The diagram below shows two gossip clusters separated by a hard partition: gossip continues normally within each cluster (solid edges), but the severed link (crossed dashed edge) blocks all cross-cluster exchanges.

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

**Cross-cluster state tracking**:

Each node maintains a **partition vector** \\(\rho_i\\) that records, for every other node \\(j\\), either zero (still reachable) or the timestamp of the last confirmed contact (if unreachable), enabling {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} calculations when connectivity is later restored.

{% katex(block=true) %}
\rho_i[j] = \begin{cases}
0 & \text{if } j \text{ reachable directly or via gossip} \\
t_{\text{last contact}} & \text{if } j \text{ unreachable}
\end{cases}
{% end %}

When \\(\rho_i[j] > 0\\) and \\(t - \rho_i[j] > \tau_{\text{max}}\\), node \\(i\\) marks its knowledge of node \\(j\\) as **uncertain** rather than **stale**.

**Reconciliation priority**:

Upon reconnection, nodes exchange partition vectors. The formula below assigns reconciliation priority to each node \\(j\\) as the product of how long it has been partitioned (\\(t_{\text{reconnect}} - \rho[j]\\)) and its operational importance weight, so cluster leads and critical sensors are updated first.

{% katex(block=true) %}
\text{Priority}(j) = (t_{\text{reconnect}} - \rho[j]) \cdot \text{Importance}(j)
{% end %}

Nodes with longest partition duration and highest importance (cluster leads, critical sensors) reconcile first.

### Confidence Intervals on Stale Data

Health observations age. A drone last heard from 30 seconds ago may have changed state since then.

<span id="def-6"></span>
**Definition 6** (Staleness). *The {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} \\(\tau\\) of an observation is the elapsed time since the observation was made. An observation with {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} \\(\tau\\) has uncertainty that grows with \\(\tau\\) according to the underlying state dynamics.*

In other words, the older a health reading is, the less reliable it becomes — not because the data was wrong when recorded, but because the underlying system may have changed in the intervening time.

Model health as a stochastic process. If health evolves with variance \\(\sigma^2\\) per unit time, the formula below gives the \\((1-\alpha)\\) confidence interval around the last known health value \\(h_{\text{last}}\\): the half-width grows as \\(\sqrt{\tau}\\), so uncertainty widens slowly at first and then accelerates.

{% katex(block=true) %}
\text{CI} = h_{\text{last}} \pm z_{\alpha/2} \sigma \sqrt{\tau}
{% end %}

Where:
- \\(h_{\text{last}}\\) = last observed health value
- \\(\tau\\) = time since observation
- \\(\sigma\\) = health volatility parameter
- \\(z_{\alpha/2}\\) = confidence multiplier (1.96 for 95%)

**Assumption:** Health evolves as a Brownian diffusion with variance \\(\sigma^2\\) per unit time, so the \\((1-\alpha)\\) confidence interval grows as \\(\sqrt{\tau}\\). This assumption breaks for strongly mean-reverting or bounded metrics (e.g., binary health indicators), where alternative staleness models should be used.

**Implications for decision-making**:

The CI width grows as \\(\sqrt{\tau}\\) - a consequence of the Brownian motion model. This square-root scaling means confidence degrades slowly at first but accelerates with {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}.

When the CI spans a decision threshold (like the \\(\mathcal{L}_2\\) capability boundary), you can't reliably commit to that capability level. The {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} has exceeded the **decision horizon** for that threshold - the maximum time at which stale data can support the decision.

Different decisions have different horizons. Safety-critical decisions with narrow margins have short horizons. Advisory decisions with wide margins have longer horizons. The system tracks {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} against the relevant horizon for each decision type.

**Response strategies** when confidence is insufficient:
1. **Active probe**: Attempt direct communication to get fresh observation
2. **Conservative fallback**: Assume health at lower bound of CI
3. **Escalate observation priority**: Increase gossip rate for this node

<span id="prop-5"></span>
**Proposition 5** (Maximum Useful Staleness). *For a health process with volatility \\(\sigma\\), observation rate \\(\lambda\\) (samples per second), and a decision requiring discrimination at precision \\(\Delta h\\) with confidence \\(1 - \alpha\\), the maximum useful {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} is:*

{% katex(block=true) %}
\tau_{\text{max}} = \frac{1}{\lambda} \left( \frac{z_{\alpha/2}\, \sigma}{\Delta h} \right)^2
{% end %}

Here \\(\lambda\\) is the observation rate (samples per second); \\(\tau_{\text{max}}\\) has units of seconds. If \\(\lambda = 1\\), the formula reduces to a sample count.

*where \\(z_{\alpha/2}\\) is the standard normal quantile. Beyond \\(\tau_{\text{max}}\\), the confidence interval spans the decision threshold and the observation cannot support the decision.*

*Proof*: With \\(n = \lambda \tau\\) observations over elapsed time \\(\tau\\), the sample mean of the health process has standard error \\(\sigma / \sqrt{n} = \sigma / \sqrt{\lambda \tau}\\). The \\((1-\alpha)\\) confidence interval half-width is \\(z_{\alpha/2} \sigma / \sqrt{\lambda \tau}\\). Setting this equal to the required decision precision \\(\Delta h\\) and solving for \\(\tau\\) gives the result.

**Corollary 3**. *The quadratic relationship \\(\tau_{\text{max}} \propto (\sigma / \Delta h)^2\\) implies that tightening decision margins dramatically reduces useful {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}. Systems with narrow operating envelopes require proportionally higher observation frequency.*

**Time-varying \\(\sigma\\) caveat**: Prop 5 assumes constant measurement volatility \\(\sigma\\). OUTPOST thermistors exhibit \\(\sigma(T) \approx 0.05 + 0.003 \cdot |T - T_{\text{ref}}|\\) °C — three times higher at \\(-30\\)°C than at 20°C. For sensors with temperature-correlated variance: substitute \\(\sigma_{\max} = \max_{T \in \text{operating range}} \sigma(T)\\) as a conservative upper bound on \\(\tau_{\max}\\). This produces a shorter, conservative staleness limit. To run the bound dynamically: update \\(\sigma\\) using the Kalman steady-state innovation covariance \\(\sqrt{P_\infty + R}\\) and recompute \\(\tau_{\max}\\) at each measurement cycle. Decision systems with narrow operating envelopes (\\(\Delta h < 0.1\\)°C) will find \\(\tau_{\max}\\) below 10 seconds in cold conditions — requiring far higher gossip rates than lab calibration suggests.

### Byzantine-Tolerant Health Aggregation

In contested environments, some nodes may be compromised. They may inject false health values to:
- Mask their own degradation (hide compromise)
- Cause healthy nodes to appear degraded (create confusion)
- Destabilize fleet-wide health estimates (denial of service)

<span id="def-7"></span>
**Definition 7** (Byzantine Node). *A node is Byzantine if it may deviate arbitrarily from the protocol specification, including sending different values to different peers, reporting false observations, or selectively participating in gossip rounds.*

In other words, a {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} is one that cannot be assumed to behave honestly in any predictable way — unlike a crashed node, it may actively lie, and it may lie differently to different neighbors simultaneously.

The aggregation function uses a trust-weighted trimmed mean: the bottom and top \\(f/n\\) weight fractions are excluded before computing the weighted average. This makes the aggregate robust to up to \\(f\\) Byzantine contributors.

**Weighted voting** based on trust scores. The formula below computes a trust-weighted average of each node's reported health for member \\(k\\), where \\(T_i\\) is the accumulated trust score of reporting node \\(i\\); nodes with low or decayed trust contribute proportionally less to the aggregate.

{% katex(block=true) %}
h_k^{\text{aggregated}} = \frac{\sum_i T_i \cdot h_k^i}{\sum_i T_i}
{% end %}

Where \\(T_i\\) is the trust score of node \\(i\\). Trust is earned through consistent, verifiable behavior and decays when inconsistencies are detected.

**Outlier detection** on received health reports: A report from node \\(i\\) about node \\(k\\) is flagged suspicious when the absolute deviation from the current consensus value exceeds the outlier threshold \\(\theta_{\text{outlier}}\\).

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

<span id="prop-6"></span>
**Proposition 6** (Byzantine Tolerance Bound). *With trust-weighted aggregation, correct health estimation is maintained if the total Byzantine trust weight is bounded:*

{% katex(block=true) %}
\sum_{\text{Byzantine}} T_i < \frac{1}{3} \sum_{\text{all}} T_i
{% end %}

*This generalizes the classical \\(f < n/3\\) bound: with uniform trust weights \\(T_i = 1\\), this reduces to \\(f < n/3\\) (fewer than one third of nodes are Byzantine). With trust decay on suspicious nodes, Byzantine influence decreases over time, allowing tolerance of more compromised nodes provided their accumulated trust is low.*

This is not foolproof - a sophisticated adversary who understands the aggregation mechanism can craft attacks that pass consistency checks. Byzantine tolerance provides defense in depth, not absolute security.

**Bootstrap dependency**: Trust weights \\(w_i\\) require an initialization source. Without a functional PKI at deployment time, the only option is uniform \\(w_i = 1\\), which reduces Prop 6 to the classical \\(f < n/3\\) bound. A Byzantine node that corrupts its weight record before the reputation system accumulates any observations inflates its influence above the \\(1/3\\) threshold from the first gossip round. The operational implication: trust weight initialization requires a hardware root of trust — secure boot attestation or a pre-deployment enrollment step that cryptographically binds \\(w_i\\) to a device identity. Systems without enrollment have no Byzantine tolerance guarantee at startup; Prop 6 applies only after each node has accumulated sufficient legitimate observations to build a meaningful trust differential (in practice: \\(\geq 20\\) gossip exchanges with a given peer).

**Trust accumulation attack**: The f<n/3 bound is *instantaneous*. An adversary can compromise nodes gradually, with each behaving honestly until sufficient trust accumulates. When \\(\sum_{\text{compromised}} T_i\\) approaches \\(\frac{1}{3} \sum_{\text{all}} T_i\\), coordinated Byzantine behavior can dominate aggregation before detection triggers trust decay. **Countermeasure**: Implement trust budget decay - total system trust \\(\sum_i T_i\\) should decrease over time unless re-earned through verified behavior: \\(T_{\text{budget}}(t+1) = T_{\text{budget}}(t) \cdot (1 - \epsilon) + T_{\text{earned}}(t)\\) where \\(\epsilon \ll \gamma_{\text{recover}}\\). This bounds the maximum trust any coalition can accumulate.

### Optional: Game-Theoretic Extension — Byzantine Reporting as a Signaling Game

Proposition 6's fraction bound \\(\sum_{\text{Byz}} T_i < \frac{1}{3}\sum_{\text{all}} T_i\\) assumes Byzantine behavior is a fixed fraction, not a strategic choice. A strategic {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} maximizes its trust weight to amplify its influence.

**Signaling game**: Each node \\(i\\) has true health \\(h_i^{\text{true}}\\). A {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} selects reported health \\(\hat{h}_i\\) to maximize detection error. The trust weight \\(w = e^{-\gamma\tau}\\) rewards freshness - a {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %} maintaining \\(\tau \approx 0\\) (frequent fresh reports) achieves maximum trust weight while reporting inverted health values \\(\hat{h}_i = 1 - h_i^{\text{true}}\\).

**The {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}-decay flaw**: The current trust model rewards {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %}s who invest in frequent reporting. The corrected trust weight below multiplies the {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} factor by a hard consistency indicator — zero weight is assigned whenever the node's report contradicts neighbor-model predictions, regardless of how fresh the report is.

{% katex(block=true) %}
w_j^{\text{trust}} = e^{-\gamma\tau} \cdot \mathbb{1}\!\left[\hat{h}_j \text{ consistent with neighbor predictions}\right]
{% end %}

**Reputation update**: The EWMA-like update below maintains a reputation score \\(r_j(t) \in [0,1]\\) for each node, blending the previous score (weight \\(\alpha\\)) with a binary consistency indicator for the current round (weight \\(1-\alpha\\)), where \\(\hat{h}_j^{\text{pred}}(t)\\) is the neighbor-model prediction and \\(\delta\\) is the consistency tolerance.

{% katex(block=true) %}
r_j(t+1) = \alpha \cdot r_j(t) + (1-\alpha) \cdot \mathbb{1}\!\left[|\hat{h}_j(t) - \hat{h}_j^{\text{pred}}(t)| < \delta\right]
{% end %}
where \\(\hat{h}_j^{\text{pred}}(t)\\) is the prediction from neighbor models. Nodes with consistent reports (honest or genuinely healthy) maintain high \\(r_j\\); {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %}s whose inversions conflict with neighbor cross-validation see \\(r_j \to 0\\) over time.

**Practical implication**: Replace {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}-only trust weights with reputation-weighted trust. For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}'s 127-sensor mesh, this catches both adversarial Byzantine sensors and genuinely malfunctioning sensors without false Byzantine labels - failing sensors produce noisy (not inverted) reports, which are distinguishable from strategic inversion.

### Trust Recovery Mechanisms

Trust decay handles misbehaving nodes, but legitimate nodes may be temporarily compromised (e.g., sensor interference, transient fault) and later recover. A purely decaying trust model permanently punishes temporary failures.

**Trust recovery model**:

Trust evolves according to a mean-reverting process: each round it either decays multiplicatively toward zero on an inconsistent report or recovers toward \\(T_{\text{max}}\\) on a consistent one, with \\(\gamma_{\text{decay}}\\) and \\(\gamma_{\text{recover}}\\) controlling the respective speeds.

{% katex(block=true) %}
T_i(t+1) = \begin{cases}
T_i(t) \cdot (1 - \gamma_{\text{decay}}) & \text{if inconsistent} \\
T_i(t) + \gamma_{\text{recover}} \cdot (T_{\text{max}} - T_i(t)) & \text{if consistent}
\end{cases}
{% end %}

where \\(\gamma_{\text{decay}} \approx 0.1\\) (fast decay) and \\(\gamma_{\text{recover}} \approx 0.01\\) (slow recovery). The asymmetry ensures that building trust takes longer than losing it - appropriate for contested environments.

**Recovery conditions**:

Trust recovery does not begin immediately after one good report; a node becomes eligible only when its consistency fraction over the recent window \\(W\\) exceeds the threshold \\(\theta_{\text{recovery}}\\).

{% katex(block=true) %}
\text{Recovery eligible iff } \frac{\text{consistent reports in window } W}{\text{total reports in } W} > \theta_{\text{recovery}}
{% end %}

where \\(W\\) is typically 50-100 gossip rounds and \\(\theta_{\text{recovery}} \approx 0.95\\). A node with even 5% inconsistent reports continues decaying.

**Sybil attack resistance**:

An adversary creating multiple fake identities (Sybil attack) can attempt to dominate the trust-weighted aggregation. Countermeasures:

1. **Identity binding**: Nodes must prove identity through cryptographic challenge-response or physical attestation (GPS position consistency over time)

2. **Trust inheritance limits**: New nodes start with \\(T_{\text{initial}} = T_{\text{sponsor}} \cdot \beta\\) where \\(\beta < 0.5\\). No node can spawn high-trust children.

3. **Global trust budget**: The sum of trust scores across all nodes must not exceed \\(T_{\text{max}} \cdot n_{\text{expected}}\\), so a Sybil attacker cannot inject arbitrarily many high-trust identities without displacing trust from existing nodes.

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

<span id="def-25"></span>
**Definition 25** (Behavioral Fingerprint). *The behavioral fingerprint of node \\(i\\) over observation window \\([t - w, t]\\) is the tuple \\(\varphi_i(t) = (\mathcal{F}_i,\, \mathcal{K}_i,\, \mathcal{R}_i)\\):*

- *{% katex() %}\mathcal{F}_i{% end %}: the empirical CDF of Kalman anomaly scores \\(\\{z_s^K\\}_{s \in [t-w,t]}\\). Under a calibrated detector running on real data, \\(\mathcal{F}_i \approx \Phi\\) (standard normal CDF).*
- *{% katex() %}\mathcal{K}_i{% end %}: the cross-correlation matrix \\(\rho_{ij} = \operatorname{Corr}(z_i^K(s), z_j^K(s))\\) for each neighbor \\(j \in N(i)\\) over \\([t-w,t]\\). Under genuine sensor readings, \\(\rho_{ij}\\) matches the known physical correlation from the deployment calibration.*
- *\\(\mathcal{R}_i\\): the action rate vector — counts of healing decisions per severity level per hour, which must be consistent with the observed anomaly rate implied by \\(\mathcal{F}_i\\).*

**Proof of Useful Work** (KS test on anomaly score distribution). *Node \\(i\\) passes the fingerprint test if the Kolmogorov-Smirnov statistic \\(D_w\\) is below the critical value:*

{% katex(block=true) %}
D_w = \sup_{x \in \mathbb{R}} \left|\hat{F}_i(x) - \Phi(x)\right| \leq c_{\alpha,w} = \sqrt{\frac{-\ln(\alpha/2)}{2w}}
{% end %}

*where {% katex() %}\hat{F}_i{% end %} is the empirical CDF of \\(\\{z_s^K\\}\\) and \\(c_{\alpha,w}\\) is the KS critical value at significance \\(\alpha\\) with window \\(w\\).*

**What each component catches**:

| Adversary behavior | \\(\mathcal{F}_i\\) signature | \\(\mathcal{K}_i\\) signature | Detected? |
| :--- | :--- | :--- | :--- |
| Dead detector (always \\(z=0\\)) | \\(D_w \approx 0.5\\) (point mass at 0) | \\(\rho_{ij} \approx 0\\) | Yes — \\(\mathcal{F}_i\\) fails KS |
| Frozen detector (constant \\(z\\)) | \\(D_w \approx 0.5\\) | \\(\rho_{ij} \to \infty\\) | Yes — \\(\mathcal{F}_i\\) fails KS |
| Spoofed: fake \\(\mathcal{N}(0,1)\\) draws | \\(D_w \approx 0\\) — passes \\(\mathcal{F}_i\\) | \\(\rho_{ij} \approx 0\\) — wrong | Yes — \\(\mathcal{K}_i\\) fails |
| Calibrated Byzantine (inverted) | \\(D_w \approx 0\\) | \\(\rho_{ij}\\) matches | No — actions \\(\mathcal{R}_i\\) inconsistent |
| Genuine useful work | \\(D_w \leq c_{\alpha,w}\\) | \\(\rho_{ij}\\) matches | Passes all three |

**Why spoofing the fingerprint requires doing the work**: To pass both \\(\mathcal{F}_i\\) (genuine normal distribution) and \\(\mathcal{K}_i\\) (correct spatial correlation with all neighbors), an adversary must either:
1. Run a genuinely calibrated detector on actual sensor data — which is the useful work we require, or
2. Learn the full spatial correlation structure \\(\\{\\rho_{ij}\\}\\) for all neighbors and generate synthetic correlated noise — which requires communicating with all neighbors continuously, making the adversary detectable via traffic analysis and increasing their energy expenditure above Definition 21's threshold.

**Connection to Definition 7** (Byzantine Node): Def 7 identifies Byzantine nodes as those that may deviate arbitrarily from the protocol. Prop 6's trust bound stops them from dominating aggregation. Definition 25 adds a third line of defense that complements both: it is triggered not by *what* a node reports but by *whether the reporting process itself is consistent with genuine sensor-coupled inference*. A Byzantine node that understands and avoids Prop 6's trust threshold can still be caught by the fingerprint's spatial correlation test, provided the physical environment is not under the adversary's full control.

**OUTPOST calibration**: Window \\(w = 1800\\) samples (30 minutes at \\(\lambda = 1\,\text{Hz}\\)), \\(\alpha = 0.01\\) — giving \\(c_{0.01,\, 1800} \approx 0.038\\). For a dead detector: \\(D_w = 0.5 \gg 0.038\\) — detected in 30 minutes. For a fake-\\(\mathcal{N}(0,1)\\) generator: {% katex() %}\mathcal{F}_i{% end %} passes, but \\(\rho_{ij} = 0\\) vs. expected \\(\rho_{ij} \approx 0.3\\) (thermal correlation between adjacent sensors) — detected by Fisher z-test on the correlation difference within the same window.

### Federated Learning for Distributed Health Models

Individual nodes learn {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} models from local data. But local data is limited - each node sees only its own failures and operating conditions. **Federated learning** enables fleet-wide model improvement without centralizing sensitive telemetry data.

**The Federated Learning Problem for Edge Health**:

Traditional ML requires centralized data. The objective below finds model parameters \\(\theta^*\\) that minimize total loss \\(\mathcal{L}\\) across all \\(n\\) labeled samples \\((x_i, y_i)\\) pooled in one place.

{% katex(block=true) %}
\theta^* = \arg\min_\theta \sum_{i=1}^{n} \mathcal{L}(f_\theta(x_i), y_i) \quad \text{(centralized)}
{% end %}

Federated learning distributes the same optimization across \\(K\\) nodes so that only gradient updates — not raw telemetry — travel over the network. Each node \\(k\\) minimizes its own local loss \\(\mathcal{L}_k(\theta)\\) over its private dataset \\(D_k\\) of size \\(n_k\\), and the contributions are weighted by data-set size to approximate the global optimum.

{% katex(block=true) %}
\theta^* = \arg\min_\theta \sum_{k=1}^{K} \frac{n_k}{n} \mathcal{L}_k(\theta) \quad \text{where } \mathcal{L}_k(\theta) = \frac{1}{n_k} \sum_{i \in D_k} \mathcal{L}(f_\theta(x_i), y_i)
{% end %}

Each node \\(k\\) computes local gradients; only gradients (not data) are shared.

**Federated Averaging (FedAvg) for Edge Deployment**: The diagram shows one complete round — server broadcast, parallel local SGD on each node, then weighted aggregation back to the server; data never leaves each node, only gradient updates travel.

{% mermaid() %}
graph TD
    subgraph "Round t"
        S1["Server broadcasts<br/>global model theta(t)"]
        C1["Node 1: Local SGD<br/>theta1(t+1) = theta(t) - eta*dL1"]
        C2["Node 2: Local SGD<br/>theta2(t+1) = theta(t) - eta*dL2"]
        C3["Node K: Local SGD<br/>thetak(t+1) = theta(t) - eta*dLk"]
        A1["Server aggregates<br/>theta(t+1) = sum(nk/n)*thetak(t+1)"]
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

**Adaptation for contested connectivity**:

Standard FedAvg assumes synchronous communication — all nodes participate in each round. Edge systems require **asynchronous federated learning** with three key adaptations.

1. **Partial participation**: Each round includes only nodes with connectivity. The formula below aggregates the available subset \\(S_t\\) using data-size weights \\(n_k\\), so the update is still an unbiased estimator of the full-data gradient when participation is random.

{% katex(block=true) %}
\theta^{(t+1)} = \frac{\sum_{k \in S_t} n_k \theta_k^{(t+1)}}{\sum_{k \in S_t} n_k}
{% end %}

where \\(S_t \subseteq \\{1, ..., K\\}\\) is the set of participating nodes in round \\(t\\).

2. **Staleness tolerance**: Nodes may contribute gradients computed from stale global models. The {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}-discounted weight \\(w_k\\) below reduces a node's contribution exponentially with the number of rounds \\(\tau_k\\) elapsed since its last synchronization.

{% katex(block=true) %}
w_k = \frac{n_k}{n} \cdot \gamma^{\tau_k}
{% end %}

where \\(\tau_k\\) is the model {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} (rounds since last sync) and \\(\gamma \in (0.9, 0.99)\\) is the {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} discount.

3. **Hierarchical aggregation**: For large fleets, two-level aggregation reduces coordination. During partition, each connected cluster performs intra-cluster aggregation independently; cross-cluster aggregation resumes upon reconnection with {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} weighting. The diagram below shows the two-level structure: individual nodes feed cluster aggregators, which in turn feed a fleet-level aggregator that produces the global model \\(\theta^*\\).

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

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} Federated Anomaly Detection**:

12 vehicles, each with local autoencoder (280 bytes). Federated learning improves detection by pooling training data without centralization.

**Convergence analysis** under assumption set \\(\mathcal{A}_{FL}\\):
- \\(A_1\\): Loss function \\(\mathcal{L}\\) is \\(L\\)-smooth and \\(\mu\\)-strongly convex
- \\(A_2\\): Partial participation \\(|S_t| \geq K/2\\) per round
- \\(A_3\\): Bounded gradient variance \\(\mathbb{E}[\|\nabla \mathcal{L}_k - \nabla \mathcal{L}\|^2] \leq \sigma^2\\)

The table below shows how the expected loss evolves with round count: it decreases at an \\(O(1/t)\\) rate toward the global optimum \\(\mathcal{L}^*\\), with a residual term \\(O(\sigma^2/K)\\) that shrinks as more nodes participate.

| Round \\(t\\) | Expected Loss | Convergence Bound |
| ---: | :--- | :--- |
| 0 | \\(\mathcal{L}_0\\) | Baseline (local only) |
| \\(t\\) | \\(\mathcal{L}_t\\) | \\(\mathcal{L}^\* + O(1/t) + O(\sigma^2/K)\\) |
| \\(T \to \infty\\) | \\(\mathcal{L}^\*\\) | Optimal for aggregated data |

**Utility improvement derivation**: The formula decomposes the net gain from federated learning into two labeled terms — the recall improvement from pooling training data across all nodes, minus the gradient-communication cost over \\(T\\) rounds.

{% katex(block=true) %}
\Delta U_{\text{FL}} = U_{\text{federated}} - U_{\text{local}} = \underbrace{(R_{\text{fed}} - R_{\text{local}}) \cdot V_{\text{detect}}}_{\text{detection gain}} - \underbrace{C_{\text{comm}} \cdot T}_{\text{communication cost}}
{% end %}

\\(\text{sign}(\Delta U) > 0\\) because:
1. Effective training set size increases from \\(n_k\\) to \\(\sum_k n_k\\), reducing generalization error by \\(O(1/\sqrt{K})\\)
2. Communication cost \\(C_{\text{comm}} = 560\\) bytes/round is negligible vs. detection value

**Communication efficiency**: Model updates require \\(280 \times 2 = 560\\) bytes per round. For connectivity probability \\(p_c = 0.1\\), expected rounds per vehicle-day: \\(p_c \cdot 24 \cdot 60 / T_{\text{round}}\\).

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

**Convergence-privacy relationship**: The ratio \\(T_{\text{private}} / T_{\text{baseline}}\\) below quantifies how many more training rounds the noisy private model needs compared to the baseline, as a function of the noise level \\(\sigma\\), the model dimension \\(d\\), and the gradient magnitude \\(\|\nabla \mathcal{L}\|\\).

{% katex(block=true) %}
T_{\text{private}} / T_{\text{baseline}} = 1 + \frac{\sigma^2 \cdot d}{\|\nabla \mathcal{L}\|^2}
{% end %}

The table below evaluates the convergence-privacy trade-off at four privacy levels, from no noise (\\(\epsilon = \infty\\)) to strong privacy (\\(\epsilon = 0.1\\)); the Utility Bound column shows how detection accuracy degrades as noise \\(\sigma\\) increases relative to gradient magnitude.

| \\(\epsilon\\) | Noise \\(\sigma\\) | Slowdown Factor | Utility Bound |
| ---: | ---: | ---: | :--- |
| \\(\infty\\) | 0 | \\(1\times\\) | \\(U^\*\\) (optimal) |
| 10 | \\(O(0.1C)\\) | \\(\approx 1.3\times\\) | \\(U^\* - O(\sigma^2/n)\\) |
| 1 | \\(O(C)\\) | \\(\approx 3\times\\) | \\(U^\* - O(d\sigma^2/n)\\) |
| 0.1 | \\(O(10C)\\) | \\(>10\times\\) | Utility-dominated by noise |

For tactical systems, \\(\epsilon = 10\\) balances privacy (gradient direction obscured) against utility (convergence within \\(1.5\times\\) baseline).

**Personalization Layers**:

Fleet-wide models capture common failure patterns, but node-specific baselines and environmental offsets require local adaptation. The formula below decomposes node \\(k\\)'s prediction function into a federally trained shared component \\(f_{\text{shared}}\\) parameterized by \\(\theta_{\text{global}}\\) and a locally maintained residual \\(f_{\text{local}}\\) parameterized by \\(\theta_k\\).

{% katex(block=true) %}
f_k(x) = f_{\text{shared}}(x; \theta_{\text{global}}) + f_{\text{local}}(x; \theta_k)
{% end %}

- **Shared layers** (federated): Generic feature extraction, common failure patterns
- **Local layers** (not shared): Node-specific baselines, environmental adaptation

For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} autoencoders:
- Encoder (\\(8\to4\to3\\)): Federated - learns common compression
- Decoder (\\(3\to4\to8\to12\\)): Federated - learns common reconstruction
- Threshold: Local - adapts to vehicle-specific noise floor
- Bias terms: Local - adapts to vehicle-specific sensor offsets

**Handling Non-IID Data**:

Edge nodes experience different operating conditions (non-IID data). {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicles in mountain terrain see different failure modes than those in desert. Strategies:

1. **FedProx**: Augments the local loss with a proximal penalty that pulls node \\(k\\)'s parameters \\(\theta\\) toward the current global model \\(\theta^{(t)}\\), with \\(\mu\\) controlling how tightly local updates are anchored.

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

3. **Multi-task learning**: Treat each node as a related task; share representations while allowing task-specific outputs.

**Convergence Guarantees Under Partition**:

The bound below gives the expected squared gradient norm after \\(T\\) rounds of asynchronous federated learning as a function of the participation rate \\(p\\) and maximum {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} \\(\tau_{\max}\\); both terms decrease with \\(T\\), confirming that convergence is guaranteed whenever {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} is bounded.

{% katex(block=true) %}
\mathbb{E}[\|\nabla F(\theta^{(T)})\|^2] \leq O\left(\frac{1}{\sqrt{pT}} + \frac{\tau_{\max}^2}{T}\right)
{% end %}

Key insight: convergence slows but is still guaranteed if {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} is bounded. For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} with \\(\tau_{\max} = 5\\) rounds and \\(p = 0.6\\), convergence to \\(\epsilon = 0.05\\) gradient norm requires \\(T \approx 30\\) rounds - achievable within one operational month.

---

## The Observability Constraint Sequence

### Hierarchy of Observability

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

Observability competes with the primary mission for resources. The hard budget constraint below states that combined observability cost \\(R_{\text{observe}}\\) and mission cost \\(R_{\text{mission}}\\) must not exceed the device's total available resources \\(R_{\text{total}}\\).

{% katex(block=true) %}
R_{\text{observe}} + R_{\text{mission}} \leq R_{\text{total}}
{% end %}

Where:
- \\(R_{\text{observe}}\\) = resources for self-measurement
- \\(R_{\text{mission}}\\) = resources for primary function
- \\(R_{\text{total}}\\) = total available resources

The objective below selects the allocation that maximizes the combined value of mission output \\(V_{\text{mission}}\\) and health-knowledge quality \\(V_{\text{health}}\\), subject to that budget constraint.

{% katex(block=true) %}
\max \quad V_{\text{mission}}(R_{\text{mission}}) + V_{\text{health}}(R_{\text{observe}})
{% end %}

Subject to \\(R_{\text{observe}} + R_{\text{mission}} \leq R_{\text{total}}\\)

Typically:
- **Mission value** has diminishing returns: more resources yield proportionally less capability
- **Health value** has threshold effects: below minimum, health knowledge is useless; above minimum, marginal gains decrease

The optimal allocation gives sufficient resources to observability for reliable health knowledge, then allocates remainder to mission.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} allocation example**:
- Total compute: 1000 MIPS
- Total bandwidth to fusion: 100 Kbps

Allocation:
- P0-P1 monitoring: 50 MIPS (5%), 5 Kbps (5%) - heartbeats and resource counters
- P2-P3 monitoring: 100 MIPS (10%), 15 Kbps (15%) - performance aggregates, {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %}
- Gossip overhead: 0 MIPS local, 20 Kbps (20%) - health propagation
- Mission (sensor processing): 850 MIPS (85%), 60 Kbps (60%) - primary function

This 15% observability overhead enables reliable self-measurement while preserving 85% of resources for mission function.

<span id="scenario-predictix"></span>

### Commercial Application: {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–8 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} Manufacturing Monitoring

{% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–8 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} monitors CNC machines in aerospace manufacturing. Each machine generates continuous telemetry: spindle vibration, coolant temperature, tool wear, power consumption. Challenge: detect failures before costly component defects, with unreliable plant floor connectivity. Machines must self-diagnose during disconnection.

The observability constraint sequence for {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–8 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} maps directly to manufacturing priorities:

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

**Local {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} architecture**: Each edge controller routes its four sensor streams through three parallel detection algorithms that feed a weighted-voting aggregator. The diagram below shows which sensors feed which detectors and how the outputs are fused into a single anomaly score.

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

**Algorithm selection rationale**:
- **EWMA** for thermal and vibration baselines: Catches sudden shifts in spindle temperature or bearing vibration within 5-10 samples. Memory footprint: 15KB for 50 monitored parameters.
- **Holt-Winters** for power consumption: Captures 8-hour shift patterns (day shift runs harder than night shift), 24-hour maintenance cycles, and weekly production planning effects. Memory footprint: 48KB for 168-hour seasonality.
- **Isolation Forest** for multivariate anomalies: Detects unusual combinations - normal vibration plus normal temperature plus abnormal power consumption indicates bearing seizure imminent. Memory footprint: 200KB for 50-tree ensemble.

**Anomaly confidence fusion**: The combined score is a weighted sum of the three algorithm outputs, where each weight reflects that algorithm's relative detection power and score stability for {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–8 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %}'s failure modes.

{% katex(block=true) %}
\text{Anomaly Score} = w_E \cdot z_{\text{EWMA}} + w_H \cdot z_{\text{HW}} + w_I \cdot s_{\text{IF}}
{% end %}

**Weight derivation**: Weights are set proportional to each detector's AUC divided by its score variance (\\(w_i \propto \text{AUC}_i / \text{Var}(s_i)\\)), rewarding detectors that are both accurate and consistent. Applying this to {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–8 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} gives the specific values below.

{% katex(block=true) %}
w_E = 0.3, \quad w_H = 0.25, \quad w_I = 0.45
{% end %}

Isolation Forest receives highest weight because multivariate detection (joint anomaly space) has higher AUC than marginal detectors for correlated failure modes.

**Staleness and decision authority**: As {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} increases and the cloud becomes unreachable, the edge controller assumes progressively more decision authority. The table below maps each {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} band to the corresponding cloud {% term(url="@/blog/2026-01-15/index.md#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} and the scope of decisions the local controller takes autonomously.

| Staleness | Cloud Status | Local Authority |
| ---: | :--- | :--- |
| 0-30s | Connected | Advisory only; cloud makes decisions |
| 30s-5min | Degraded | Local P0-P2 decisions; P3+ queue for cloud |
| 5-30min | Intermittent | Local P0-P3 decisions; aggressive caching |
| >30min | Denied | Full local authority; conservative thresholds |

At 30+ minutes disconnection, the edge controller tightens anomaly thresholds by 20% (more false positives, fewer missed failures) because the cost of a missed failure without cloud backup is higher than during connected operation.

**Cross-machine gossip**: Machines on the same production line exchange health summaries via local Ethernet every 30 seconds. Each machine's summary is a three-field tuple capturing current anomaly level, estimated time to next maintenance, and parts produced since last inspection.

{% katex(block=true) %}
H_{\text{machine}} = (\text{anomaly\_score}, \text{time\_to\_maintenance}, \text{parts\_since\_inspection})
{% end %}

The line controller combines per-machine summaries into a single production-line health score \\(H_{\text{line}}\\) that is bottlenecked by the weakest machine's availability and averaged over all machines' quality scores.

{% katex(block=true) %}
H_{\text{line}} = \min_i H_i^{\text{availability}} \cdot \text{mean}_i(H_i^{\text{quality}})
{% end %}

Line health below threshold triggers automatic workload rebalancing - shifting high-precision parts away from degraded machines.

**Utility analysis**:

System utility \\(U\\) is production value minus the three cost categories that self-measurement can reduce: unplanned downtime \\(C_{\text{downtime}}\\), scrapped parts \\(C_{\text{scrap}}\\), and inspection overhead \\(C_{\text{inspection}}\\).

{% katex(block=true) %}
U = V_{\text{production}} - C_{\text{downtime}} - C_{\text{scrap}} - C_{\text{inspection}}
{% end %}

**Utility improvement from self-measurement**: The formula decomposes the net economic gain into three labeled terms — downtime avoided, scrap avoided, and false-alarm inspection cost — so the break-even condition for each cost type can be evaluated separately.

{% katex(block=true) %}
\Delta U = \underbrace{R \cdot C_{\text{downtime}}}_{\text{avoided downtime}} + \underbrace{(R - \text{FNR}) \cdot C_{\text{scrap}}}_{\text{avoided scrap}} - \underbrace{\text{FPR} \cdot C_{\text{inspection}}}_{\text{false alarm cost}}
{% end %}

\\(\text{sign}(\Delta U) > 0\\) when:

{% katex(block=true) %}
R > \frac{\text{FPR} \cdot C_{\text{inspection}}}{C_{\text{downtime}} + C_{\text{scrap}}}
{% end %}

For manufacturing where \\(C_{\text{scrap}} \gg C_{\text{inspection}}\\) (\$50K component vs. \$100 inspection), even moderate recall (\\(R > 0.8\\)) with high FPR (\\(< 0.1\\)) yields \\(\Delta U > 0\\). The observability constraint sequence delivers economic value when detection value exceeds false alarm cost.

---

## RAVEN Self-Measurement Protocol

The {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} drone swarm requires self-measurement at two levels: individual drone health and swarm-wide coordination state.

### Per-Drone Local Measurement

Each drone continuously monitors:

**Power State**
- Battery voltage, current draw, temperature
- Estimated flight time remaining: \\(t_{\text{remain}} = E_{\text{remaining}} / P_{\text{avg}}\\)
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

Gossip protocol parameters:
- Exchange rate: 0.2 Hz (once per 5 seconds)
- Staleness threshold: 30 seconds (confidence drops below 90%)
- Trust decay: \\(\gamma = 0.05\\) per second
- Maximum useful {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}: 60 seconds (confidence drops below 50%)

*Relationship*: The {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} threshold (30s) marks where data begins degrading meaningfully - decisions based on 30s-old data have ~90% confidence. The maximum useful {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} (60s) marks where confidence falls below 50% - beyond this, the data provides little more than a guess. These are design parameters chosen for the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} mission envelope; from Proposition 5, \\(\tau_{\max}\\) scales as \\((\sigma/\Delta h)^2\\) so tightening decision margins reduces useful {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} rapidly.

Health vector per drone contains:
- Binary availability (alive/silent)
- Power state (percentage)
- Critical sensor status (functional/degraded/failed)
- Mission capability level (\\(\mathcal{L}_0\\)-\\(\mathcal{L}_4\\))

Merge function uses timestamp-weighted average for numeric values, latest-timestamp-wins for categorical values.

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
2. **Fallback mode**: If lead unreachable, peer-to-peer gossip among reachable vehicles

Lead vehicle aggregation:
- Computes minimum capability level across convoy: \\(L_{\text{convoy}} = \min_i L_i\\)
- Identifies vehicles with critical anomalies
- Determines convoy-wide constraints (e.g., maximum safe speed based on worst vehicle)

Fallback gossip parameters:
- Exchange rate: 0.1 Hz (once per 10 seconds) - lower than {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} due to vehicle stability
- Staleness threshold: 60 seconds
- Trust decay: \\(\gamma = 0.02\\) per second

### Anomaly Detection Focus

**Position spoofing detection**:

Each vehicle tracks its own position via GPS, INS, and dead reckoning, and also receives claimed positions from neighbors. The discrepancy \\(\Delta_{ij}\\) below measures how far vehicle \\(i\\)'s claimed position deviates from where neighbor \\(j\\) independently observed it; a large discrepancy across multiple neighbors indicates spoofing.

{% katex(block=true) %}
\Delta_{ij} = \|p_i^{\text{claimed}} - p_i^{\text{observed-by-}j}\|
{% end %}

If \\(\Delta_{ij}\\) exceeds threshold for vehicle \\(i\\) as observed by multiple neighbors \\(j\\), vehicle \\(i\\) is flagged for position anomaly.

Vehicle \\(i\\) is flagged as potentially spoofed if \\(\geq k\\) neighbors (\\(k = \lceil n/3 \rceil\\)) each independently report \\(\Delta_{ij} > \theta\\). A suitable threshold is \\(\theta = d_{\max}/2\\) where \\(d_{\max}\\) is the maximum distance a vehicle can travel during one gossip period — any discrepancy larger than this cannot be explained by legitimate movement.

**Communication anomaly classification**:

Distinguish jamming from terrain effects:
- **Jamming**: Affects all frequencies, correlates with adversarial activity, affects multiple vehicles
- **Terrain**: Affects specific paths, correlates with geographic features, predictable from maps

Use convoy's position history to build terrain propagation model. Deviations from model suggest adversarial interference.

**Integration with Markov connectivity model**:

From the [Markov connectivity model](@/blog/2026-01-15/index.md), the expected transition rates between regimes are known. A transition is flagged as anomalous when its model-predicted probability falls below threshold \\(\theta_{\text{transition}}\\), meaning the observed regime change is too abrupt or too frequent to be explained by natural causes.

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
- Battery state of charge (SoC): \\(\text{SoC} = E_{\text{current}} / E_{\text{capacity}}\\)
- Power budget: \\(P_{\text{solar}} - P_{\text{load}} = P_{\text{net}}\\)
- Anomaly detection: Solar panel degradation, battery cell failure

**Environmental Monitoring**
- Temperature: Affects sensor calibration and battery performance
- Humidity: Risk of condensation and corrosion
- Vibration: Indicates physical disturbance or tampering
- Ambient light: Validates solar panel output

<span id="prop-7"></span>
**Proposition 7** (Power-Aware Measurement Scheduling). *For a sensor with solar charging profile \\(P_{\text{solar}}(t)\\) and measurement cost \\(C_m\\) per measurement, the optimal measurement schedule maximizes information gain while maintaining positive energy margin:*

{% katex(block=true) %}
\max \sum_t I(m_t) \quad \text{s.t.} \quad \int_0^T (P_{\text{solar}}(t) - P_{\text{base}} - \sum_{t'} C_m \cdot \delta(t - t')) \, dt \geq E_{\text{reserve}}
{% end %}

*where \\(I(m_t)\\) is the information gain from measurement at time \\(t\\) and \\(E_{\text{reserve}}\\) is the required energy reserve.*

In practice, this means scheduling high-power measurements (radar, active sensors) during peak solar hours and relying on low-power passive measurements during night and low-light periods.

*Greedy heuristic*: Sort measurements by information-gain-per-watt ratio \\(I(m)/C_m\\). Schedule in order until power budget exhausted. For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}, this yields:
1. Passive seismic (0.1W, high info): Always on
2. Passive acoustic (0.2W, medium info): Always on
3. Active IR scan (2W, high info): Peak solar only (10am-2pm)
4. Radar ping (5W, very high info): Midday only (11am-1pm), battery > 80%

This heuristic achieves \\(O(n \log n)\\) computation complexity, suitable for embedded deployment. The gap to optimal depends on environmental correlation structure.

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

*(Simplified illustration; {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} operates 127 sensors in practice)*

Gossip parameters for {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} (power-optimized for extended deployment):
- Exchange rate: 0.017 Hz (once per minute) - optimized for power
- Staleness threshold: 300 seconds (5 minutes)
- Trust decay: \\(\gamma = 0.002\\) per second
- Maximum useful {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}: 600 seconds

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
5. Switch to quarantine when accumulated tamper confidence \\(P(\text{tamper} \mid \text{evidence}) > 0.85\\), computed as a Bayesian update over the listed physical and logical indicators
6. At high confidence: switch to quarantine mode (report but don't trust own data)

### Cross-Sensor Validation

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} leverages overlapping sensor coverage for cross-validation. The formula below computes a confidence score for sensor \\(s_i\\) as the trust-weighted fraction of agreement with its coverage-overlapping neighbors {% katex() %}\mathcal{N}_i{% end %}, where \\(w_{ij}\\) is the link trust weight and \\(\text{Agreement}(s_i, s_j)\\) measures detection correlation between the two sensors.

{% katex(block=true) %}
\text{Confidence}(s_i) = \frac{\sum_{j \in \mathcal{N}_i} w_{ij} \cdot \text{Agreement}(s_i, s_j)}{\sum_{j \in \mathcal{N}_i} w_{ij}}
{% end %}

where \\(\mathcal{N}_i\\) is the set of sensors with overlapping coverage, and \\(\text{Agreement}(s_i, s_j)\\) is the fraction of common time windows where both sensors agree on event presence/absence within a spatial-temporal tolerance window.

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

If the power management system fails, {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} may lose power before it can detect the power anomaly. If the communication subsystem fails, gossip cannot propagate health. The failure cascades faster than measurement can track.

**Mitigation**: P0/P1 monitoring on dedicated, ultra-low-power subsystem. Watchdog timers that trigger even if main processor fails. Hardware-level health indicators independent of software.

### The Judgment Horizon

When should the system distrust its own measurements?

- When confidence intervals are too wide to support decisions
- When multiple sensors give irreconcilable readings
- When the system is operating outside its training distribution
- When measurement infrastructure itself is compromised

At the judgment horizon, self-measurement must acknowledge its limits. The system should:
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
- Updated its {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} baseline to reduce reliance on Sensor 47's historical patterns

Post-reconnection analysis (satellite uplink restored 6 hours later): Sensor 47's voltage regulator had failed suddenly - a known failure mode for this component batch. The diagnosis was correct. The system had self-measured, self-diagnosed, and self-healed without human intervention.

### Learning from Measurement Failures

Measurement failures provide training data for improved detection. The four-step post-hoc process below turns each failure event into a concrete improvement to the detection catalog, threshold settings, or classifier model.

| Step | Action | Output |
| :--- | :--- | :--- |
| 1 | Document failure mode | Failure signature added to catalog |
| 2 | Extract detection features | New features for anomaly detector |
| 3 | Adjust thresholds | \\(\theta\' = \theta - \Delta\theta\\) if false negative |
| 4 | Retrain models | Updated classifier with new case |

Measurable improvement: \\(P(\text{detect} \mid \text{failure type})\\) increases after each logged failure of that type.

---

## Model Scope and Failure Envelope

Each mechanism has bounded validity. When assumptions fail, so does the mechanism.

### Validity Domain: Summary

Each mechanism is valid only within a domain \\(\mathcal{D}\\) defined by its assumptions. Outside that domain the protocol continues to run, but its correctness and performance guarantees no longer hold. The table below shows, for each component, which assumptions must hold, what breaks when they fail, and what mitigations exist.

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
| **Detection** (Prop 3) | Abrupt step-like shift \\(\delta \in [0.5\sigma, 1.5\sigma]\\); stable baseline; Gaussian noise | Gradual drift; unstable baseline; heavy-tailed noise | Dual-CUSUM for drift; adaptive windowing; robust statistics |
| **Byzantine** (Prop 6) | Byzantine minority (\\(f < n/3\\)); honest nodes truthful; attacker cannot predict trimming | \\(f \geq n/3\\); coordinated alignment past trimming; compromised honest node | Hierarchical trust; random trimming; continuous trust reassessment |
| **Staleness** (Prop 5) | Brownian diffusion model with accurate \\(\sigma\\); reliable timestamps | Volatility misestimate; clock spoofing; strongly mean-reverting metrics | Adaptive volatility estimation; authenticated time; relative ordering |

**Counter-scenarios**: Adversary who selectively jams inter-cluster gossip creates divergent health views undetectable within each cluster — detection requires cross-cluster comparison on reconnection. Adversary who compromises exactly \\(n/3\\) sensors gradually stays below instantaneous detection thresholds — detection requires trend analysis of trust scores, not just instantaneous counts.

### Summary: Claim-Assumption-Failure Table

The table below consolidates the key correctness claims from this article, the assumptions each relies on, and the specific conditions under which each breaks down.

| Claim | Key Assumptions | Valid When | Fails When |
| :--- | :--- | :--- | :--- |
| Gossip converges in \\(O(\ln n)\\) | Connected network, uniform peer selection | Network mostly connected | Partition isolates clusters |
| CUSUM detects faster than EWMA | Abrupt shift \\(\delta \in [0.5\sigma, 1.5\sigma]\\) | Step-like anomalies | Gradual drift; tiny shifts |
| Trimmed mean tolerates \\(f\\) Byzantine | \\(f < n/3\\) | Byzantine minority | \\(f \geq n/3\\); coordinated attack |
| Confidence degrades as \\(\sqrt{\tau}\\) | State evolution follows Brownian motion model | Stable volatility | Volatility spikes; regime change |
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

**Cost-weighted decision**: The formula selects the threshold that minimizes total expected error cost, explicitly weighting missed detections by \\(C_{\text{FN}}\\) and false alarms by \\(C_{\text{FP}}\\).

{% katex(block=true) %}
\theta^* = \arg\min_\theta \left[ C_{\text{FN}} \cdot P(\text{FN}|\theta) + C_{\text{FP}} \cdot P(\text{FP}|\theta) \right]
{% end %}

**Pareto front derivation** (Gaussian anomaly model):

For normally distributed metrics with anomaly shift \\(\delta\\), the two closed-form expressions below give the TPR and FPR as a function of threshold \\(\theta\\) in units of \\(\sigma\\); the gap between the two curves widens as \\(\delta\\) increases relative to \\(\sigma\\).

{% katex(block=true) %}
\text{TPR}(\theta) = \Phi\left(\frac{\delta - \theta}{\sigma}\right), \quad \text{FPR}(\theta) = 1 - \Phi\left(\frac{\theta}{\sigma}\right)
{% end %}

The table below evaluates these expressions at four operating points and shows the cost-ratio condition under which each is optimal; the Use-when column is the key reference for practitioners choosing a threshold.

| Threshold | TPR = \\(\Phi((\delta-\theta)/\sigma)\\) | FPR = \\(1-\Phi(\theta/\sigma)\\) | Use when \\(C_{FN}/C_{FP}\\) is |
| :--- | :--- | :--- | :--- |
| \\(\theta = 1.5\sigma\\) | \\(\Phi(\delta/\sigma - 1.5)\\) | \\(0.067\\) | High (FN aversion; tolerate FP) |
| \\(\theta = 2.0\sigma\\) | \\(\Phi(\delta/\sigma - 2.0)\\) | \\(0.023\\) | Medium |
| \\(\theta = 2.5\sigma\\) | \\(\Phi(\delta/\sigma - 2.5)\\) | \\(0.006\\) | Low |
| \\(\theta = 3.0\sigma\\) | \\(\Phi(\delta/\sigma - 3.0)\\) | \\(0.001\\) | Very low (FP aversion) |

**Optimal threshold selection**: The closed-form below gives \\(\theta^*\\) as the \\(\Phi^{-1}\\) quantile of the cost-normalized false-positive fraction, placing the decision boundary where the marginal cost of a false positive equals the marginal cost of a false negative.

{% katex(block=true) %}
\theta^* = \sigma \cdot \Phi^{-1}\left(\frac{C_{FP}}{C_{FP} + C_{FN}}\right)
{% end %}

For tactical edge where \\(C_{FN} \gg C_{FP}\\): the cost-optimal threshold is the \\(\theta = 1.5\sigma\\) row of the table above (FPR = 0.067, high sensitivity), accepting false positives to minimize missed detections.

### Trade-off 2: Staleness vs. Bandwidth Cost

**Multi-objective formulation**: Increasing gossip rate \\(\lambda\\) improves data freshness but consumes proportionally more bandwidth — the formula sets up the optimization that finds the rate balancing both.

{% katex(block=true) %}
\max_{\lambda} \left( U_{\text{freshness}}(\lambda), -C_{\text{bandwidth}}(\lambda) \right)
{% end %}

where \\(\lambda\\) is gossip rate.

**Confidence-bandwidth surface derivation**: The table below samples the Pareto front at four gossip rates, showing bandwidth in units of \\(\lambda \cdot m\\) (message-rate times message-size) and confidence as \\(e^{-\gamma/\lambda}\\) where \\(\gamma\\) is the {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} decay rate.

With gossip rate \\(\lambda\\), mean {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} is \\(\tau = 1/\lambda\\) and confidence is \\(\kappa(\tau) = e^{-\gamma \tau}\\); the two expressions below make the linear bandwidth cost and exponential confidence gain explicit as functions of the single design parameter \\(\lambda\\).

{% katex(block=true) %}
\text{Bandwidth} = \lambda \cdot m_{\text{msg}}, \quad \text{Confidence} = e^{-\gamma/\lambda}
{% end %}

| Gossip Rate \\(\lambda\\) | Staleness \\(1/\lambda\\) | Bandwidth | Confidence \\(e^{-\gamma/\lambda}\\) |
| :--- | :--- | :--- | :--- |
| \\(0.1\\)/s | \\(10\\)s | \\(\lambda \cdot m\\) | \\(e^{-10\gamma}\\) |
| \\(0.5\\)/s | \\(2\\)s | \\(5\lambda \cdot m\\) | \\(e^{-2\gamma}\\) |
| \\(1.0\\)/s | \\(1\\)s | \\(10\lambda \cdot m\\) | \\(e^{-\gamma}\\) |
| \\(2.0\\)/s | \\(0.5\\)s | \\(20\lambda \cdot m\\) | \\(e^{-0.5\gamma}\\) |

**Diminishing returns analysis**: \\(d\kappa/d\lambda = \gamma \lambda^{-2} e^{-\gamma/\lambda}\\) decreases as \\(\lambda \to \infty\\). Marginal confidence gain from doubling \\(\lambda\\): \\(\Delta\kappa = e^{-\gamma/(2\lambda)} - e^{-\gamma/\lambda} \to 0\\) as \\(\lambda\\) increases.

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
| Ensemble | \\(\sum_i C_i\\) | Medium | \\(\sum_i O_i\\) | 25KB |

**No model dominates**: High-capacity models (autoencoder) achieve lower bias but higher variance on novel distributions. Low-capacity models (EWMA) adapt to drift but miss complex patterns. The Pareto frontier is convex - gains on one objective require losses on another.

### Trade-off 4: Byzantine Tolerance vs. Latency

**Multi-objective formulation**: Tolerating more {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %}s \\(f\\) requires more participating nodes and more message rounds, directly increasing aggregation latency — the formula makes this tension explicit.

{% katex(block=true) %}
\max_{f} \left( U_{\text{tolerance}}(f), -C_{\text{latency}}(f) \right)
{% end %}

where \\(f\\) is the number of {% term(url="#def-7", def="Node that may deviate arbitrarily from protocol, including sending conflicting values") %}Byzantine node{% end %}s tolerated. The table below shows how tolerating each additional faulty node requires \\(3\\) more participating nodes and one additional message round, so the latency cost is linear in \\(f\\).

| Tolerance Level | Required Nodes | Message Rounds | Latency |
| :--- | ---: | ---: | ---: |
| \\(f = 0\\) | \\(n \geq 1\\) | 1 | Low |
| \\(f = 1\\) | \\(n \geq 4\\) | 2 | Medium |
| \\(f = 2\\) | \\(n \geq 7\\) | 3 | High |
| \\(f = k\\) | \\(n \geq 3k+1\\) | \\(k+1\\) | \\(O(k)\\) |

Higher Byzantine tolerance requires more nodes and more communication rounds, increasing latency. Cannot achieve high tolerance with low latency and few nodes.

### Cost Surface: Measurement Under Resource Constraints

The formula below gives the total cost of measurement as a function of sampling rate and fidelity: the first term is the resource cost of sampling (quadratic in fidelity), while the second term is the {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} cost that increases as rate drops.

{% katex(block=true) %}
C_{\text{measure}}(\text{rate}, \text{fidelity}) = \alpha \cdot \text{rate} \cdot \text{fidelity}^2 + \beta \cdot \frac{1}{\text{rate}}
{% end %}

The first term represents sampling cost (higher rate and fidelity cost more). The second term represents {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %} cost (lower rate increases {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}). The optimal operating point balances these competing costs.

### Resource Shadow Prices

The shadow price \\(\lambda_i = \partial U / \partial g_i\\) quantifies how much additional utility one more unit of each resource delivers at the current operating point; a high shadow price identifies the binding constraint where investment yields the largest return.

| Resource | Shadow Price \\(\lambda\\) | Interpretation |
| :--- | ---: | :--- |
| Gossip bandwidth | \$2.10/KB-hr | Value of an additional kilobyte per hour of health-synchronization capacity |
| Detection compute | \$0.05/inference | Value of one additional detection inference pass at current anomaly rate |
| Sensor power | \$0.80/mW-hr | Value of one additional milliwatt-hour sustaining continuous sensing |
| Memory | \$0.01/KB | Value of one additional kilobyte enabling longer observation history |

### Irreducible Trade-off Summary

The four trade-offs developed in this section are irreducible: no design choice eliminates the tension, only shifts the operating point along the Pareto frontier.

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Sensitivity-Precision | Catch all anomalies vs. no false alarms | Perfect TPR and zero FPR |
| Freshness-Bandwidth | Current information vs. low network cost | Both with limited bandwidth |
| Accuracy-Adaptability | High accuracy vs. novel anomaly detection | Both without ensemble overhead |
| Tolerance-Latency | Byzantine resilience vs. fast aggregation | Both with few nodes |

---

## Closing: The Measurement-Action Loop

Measurement feeds action; without action, measurement is logging. {% term(url="#scenario-autodelivery", def="Autonomous last-mile delivery fleet in an urban metro area; urban connectivity gaps and GPS spoofing risk require local fleet-health management") %}AUTODELIVERY{% end %}'s gossip propagation feeds task assignment; {% term(url="#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–8 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %}'s {% term(url="#def-4", def="Per-observation test that classifies sensor readings as normal or anomalous in constant time, running locally on the edge controller without requiring cloud connectivity") %}anomaly detection{% end %} feeds workload rebalancing.

The diagram below shows the measurement-action loop (the MAPE-K cycle); notice that Execute feeds back into Monitor, meaning the system continuously validates whether its own healing actions had the intended effect rather than assuming success.

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

This is the MAPE-K loop (Monitor, Analyze, Plan, Execute, Knowledge) that IBM formalized for autonomic computing.

Return to {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} BRAVO.

Sensor 47 is silent. The fusion node has measured: abrupt silence, no prior degradation, neighbors fully operational, no correlated regional failure. The analysis suggests localized hardware failure with 78% confidence. The plan: reroute coverage to neighboring sensors, flag for inspection on the next patrol, log for human review when uplink restores.

But measurement alone doesn't execute this plan. Self-healing must decide: Is 78% confidence sufficient to reroute coverage and degrade mission posture for that sector? What is the cost of a false alarm versus a missed failure? How does the rerouting affect the rest of the mesh?

These are the questions that precise measurement makes it possible to ask. Without a calibrated anomaly score and a {% term(url="#def-6", def="Age of the most recent observation from a remote node; anomaly confidence is discounted proportionally as staleness grows, preventing stale data from triggering healing decisions") %}staleness{% end %}-bounded observation, there is no meaningful basis for any healing decision at all.

Three results carry forward from this article. First, the cost-optimal detection threshold (Proposition 3) places the decision boundary where the ratio of anomaly likelihoods equals the ratio of error costs — a concrete, tunable criterion that replaces the ad hoc \\(2\sigma\\) or \\(3\sigma\\) thresholds common in practice. Second, gossip convergence in \\(O(\ln n / \lambda)\\) time (Proposition 4) means that fleet-wide health awareness scales gracefully: doubling a 47-drone swarm adds roughly 0.7 seconds to convergence at 1 Hz gossip rate, not a proportional delay. Third, the maximum useful staleness bound (Proposition 5) gives designers a principled way to size observation frequency: the tighter the decision margin \\(\Delta h\\), the higher the sampling rate must be, in a quadratic relationship that makes aggressive margin requirements expensive.

But measurement is only half the loop. A system that can diagnose a failure with 78% confidence still faces the question of what to do about it: which recovery actions are safe to attempt, in what order, under what resource constraints, and with what guarantees of stability. Those are the questions addressed in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md), which develops the formal autonomic control loop, defines healing action severity, and derives the stability conditions under which closed-loop recovery converges rather than oscillates.
