+++
authors = ["Yuriy Polyulya"]
title = "Self-Measurement Without Central Observability"
description = "When your monitoring service is unreachable, who monitors the monitors? Edge systems must detect their own anomalies, assess their own health, and maintain fleet-wide awareness through gossip protocols—all without phoning home. This article develops lightweight statistical approaches for on-device anomaly detection, Bayesian methods for distributed health inference, and the observability constraint sequence that prioritizes what to measure when resources are scarce."
date = 2026-01-22
slug = "autonomic-edge-part2-self-measurement"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "observability", "anomaly-detection"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 2
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Traditional distributed systems assume connectivity as the norm and partition as the exception. Tactical edge systems invert this assumption: disconnection is the default operating state, and connectivity is the opportunity to synchronize. This series develops the engineering principles for autonomic architectures—systems that self-measure, self-heal, and self-optimize when human operators cannot intervene."""
+++

---

## Prerequisites

This article builds directly on the [contested connectivity framework](@/blog/2026-01-15/index.md):

- **Connectivity regimes**: The four states (Full, Degraded, Intermittent, Denied) and Markov transition model define when self-measurement matters most—during denied regime when central observability is unavailable
- **Capability hierarchy (L0-L4)**: Self-measurement is the foundation enabling capability assessment. Without accurate health knowledge, the system cannot determine its current capability level
- **The inversion thesis**: "Design for disconnected, enhance for connected" applies directly—self-measurement must function in complete isolation, with central reporting as enhancement when connectivity permits

Self-measurement is the sensory system of autonomic architecture. Just as organisms must sense their internal state before they can respond, edge systems must measure their own health before they can heal. This part develops the engineering principles for that measurement capability.

---

## Theoretical Contributions

This article develops the theoretical foundations for self-measurement in distributed systems under contested connectivity. We make the following contributions:

1. **Local Anomaly Detection Framework**: We formalize the anomaly detection problem as hypothesis testing under resource constraints, establishing optimal threshold selection as a function of asymmetric error costs.

2. **Gossip-Based Health Propagation**: We derive convergence bounds for epidemic protocols in partially-connected networks, proving \\(O(\ln n)\\) propagation time under standard assumptions.

3. **Staleness-Confidence Theory**: We model health state evolution as a stochastic process and derive the maximum useful staleness for decision-making, establishing the relationship between observation age and confidence degradation.

4. **Byzantine-Tolerant Aggregation**: We extend weighted voting mechanisms to handle adversarial nodes, providing trust-decay models that detect and isolate compromised participants.

5. **Observability Constraint Sequence**: We establish a priority ordering for measurement capabilities based on failure cost analysis, providing resource allocation guidelines for constrained systems.

These contributions connect to and extend prior work on fault detection in distributed systems (Cristian, 1991), epidemic algorithms (Demers et al., 1987), and autonomic computing (Kephart & Chess, 2003), adapting these frameworks for the specific challenges of contested edge environments.

---

## Opening Narrative: OUTPOST Under Observation

Early morning. OUTPOST BRAVO's 127-sensor perimeter mesh has been operating for 43 days. Without warning, the satellite uplink goes dark—no graceful degradation. Seconds later, Sensor 47 stops reporting. Last transmission: routine, battery at 73%, mesh connectivity strong. Then silence.

OUTPOST needs to answer: *how do you diagnose this failure without external systems?*

- **Hardware failure**: Route around the sensor
- **Communication failure**: Attempt alternative paths
- **Environmental occlusion**: Wait and retry
- **Adversarial action**: Alert defensive posture

Each diagnosis implies different response. Without central observability, OUTPOST must diagnose itself—analyze patterns, correlate with neighbors, assess probabilities, decide on response. All locally. All autonomously.

This is self-measurement: assessing health and diagnosing anomalies without external assistance. You can't heal what you haven't diagnosed, and you can't diagnose what you haven't measured.

---

## The Self-Measurement Challenge

Cloud-native observability assumes continuous connectivity:

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

Every arrow represents a network call. For edge systems, this architecture fails at the first arrow—when connectivity is denied, the entire observability pipeline is severed.

The edge alternative inverts the data flow:

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

**Analysis must happen locally, and alerting must be autonomous**. You can't wait for human operators or external analysis services. The system must detect, diagnose, and decide—all within the constraints of local compute and memory.

---

## Local Anomaly Detection

### The Detection Problem

At its core, anomaly detection is a signal detection problem. The sensor produces a stream of values:

{% katex(block=true) %}
x_1, x_2, \ldots, x_t
{% end %}

At each timestep, the local analyzer must decide: is this observation normal, or anomalous?

This is a binary classification under uncertainty:
- **\\(H_0\\) (null hypothesis)**: The observation is from the normal distribution
- **\\(H_1\\) (alternative)**: The observation is from an anomalous process

**Definition 4** (Local Anomaly Detection Problem). *Given a time series \\(\\{x_t\\}_{t \geq 0}\\) generated by process \\(P\\), the local anomaly detection problem is to determine, for each observation \\(x_t\\), whether \\(P\\) has transitioned from nominal behavior \\(P_0\\) to anomalous behavior \\(P_1\\), subject to:*
- *Computational budget \\(O(1)\\) per observation*
- *Memory budget \\(O(m)\\) for fixed \\(m\\)*
- *No access to ground truth labels*
- *Real-time decision requirement*

The challenge is performing this classification:
- In real-time, on-device
- With limited compute and memory
- Without access to comprehensive training data
- Without ground truth labels for recent observations

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

The asymmetry of costs is critical. A false positive triggers an unnecessary healing action—wasteful but recoverable. A false negative leaves a failure undetected—potentially catastrophic in contested environments where undetected failures cascade.

### Statistical Approaches

Edge anomaly detection requires algorithms that are:
- **Computationally lightweight**: O(1) per observation
- **Memory-efficient**: Constant or logarithmic memory
- **Adaptive**: Adjust to changing baselines without retraining
- **Interpretable**: Provide confidence, not just binary classification

Three approaches meet these requirements:

**Exponential Weighted Moving Average (EWMA)**

The simplest effective approach. Maintain running estimates of mean and variance:

{% katex(block=true) %}
\begin{aligned}
\mu_t &= \alpha x_t + (1 - \alpha) \mu_{t-1} \\
\sigma_t^2 &= \alpha (x_t - \mu_{t-1})^2 + (1 - \alpha) \sigma_{t-1}^2
\end{aligned}
{% end %}

Where \\(\alpha \in (0, 1)\\) controls the decay rate. Smaller \\(\alpha\\) means longer memory. Note: variance uses \\(\mu_{t-1}\\) to keep the estimate independent of \\(x_t\\), consistent with the anomaly score calculation.

The anomaly score normalizes deviation by variance:

{% katex(block=true) %}
z_t = \frac{|x_t - \mu_{t-1}|}{\sigma_{t-1}}
{% end %}

Flag as anomaly if \\(z_t > \theta\\), where \\(\theta\\) is typically 2-3 standard deviations.

**Proposition 3** (Optimal Anomaly Threshold). *Given asymmetric error costs \\(C_{\text{FP}}\\) for false positives and \\(C_{\text{FN}}\\) for false negatives, the optimal detection threshold \\(\theta^\*\\) satisfies the likelihood ratio condition:*

{% katex(block=true) %}
\frac{p(x | H_0)}{p(x | H_1)} = \frac{C_{\text{FP}}}{C_{\text{FN}}}
{% end %}

*For tactical edge systems where \\(C_{\text{FN}} \gg C_{\text{FP}}\\) (missed failures are catastrophic), the optimal threshold shifts toward more sensitive detection at the cost of increased false positives.*

*Proof sketch*: The expected cost is \\(C_{\text{FP}} \cdot P_{\text{FP}}(\theta) + C_{\text{FN}} \cdot P_{\text{FN}}(\theta)\\). Taking the derivative and setting to zero yields the Neyman-Pearson lemma condition.
- **Compute**: O(1) per observation (two multiply-adds)
- **Memory**: O(1) (store \\(\mu\\), \\(\sigma^2\\))
- **Adaptation**: Automatic through exponential decay

**Holt-Winters for Seasonal Patterns**

For signals with periodic structure (day/night cycles, shift patterns), Holt-Winters captures level, trend, and seasonality:

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
- **RAVEN**: p=1 (no meaningful seasonality in flight telemetry)—use EWMA instead
- **CONVOY**: p=24 hours for communication quality (terrain/atmospheric effects), p=8 hours for engine metrics (thermal cycles)
- **OUTPOST**: p=24 hours for solar/thermal cycles, p=7 days for activity patterns near defended perimeter

**Isolation Forest Sketch for Multivariate**

For multivariate anomaly detection with limited memory, streaming isolation forest maintains a sketch:

{% katex(block=true) %}
\text{Anomaly Score} = 2^{-E[h(x)] / c(n)}
{% end %}

Where \\(h(x)\\) is path length to isolate \\(x\\), and \\(c(n)\\) is average path length in a random tree.

- **Compute**: O(log n) per query, O(t) per tree
- **Memory**: O(t × d) for t trees with depth limit d
- **Adaptation**: Reservoir sampling for tree updates

*Concrete parameters for CONVOY*: t=50 trees, d=8 depth limit, sample_size=128, contamination=0.02 (expected 2% anomaly rate). This configuration uses ~25KB memory and achieves 85% detection rate with 3% false positive rate on multi-sensor telemetry (engine, transmission, suspension combined).

**CUSUM for Change-Point Detection**

When the goal is detecting *when* a change occurred (not just that it occurred), Cumulative Sum (CUSUM) provides optimal detection for shifts in mean:

{% katex(block=true) %}
S_t = \max(0, S_{t-1} + x_t - \mu_0 - k)
{% end %}

where \\(\mu_0\\) is the nominal mean and \\(k\\) is the allowable slack. Alarm when \\(S_t > h\\). CUSUM detects sustained shifts faster than EWMA but is more sensitive to the choice of \\(k\\). For RAVEN flight telemetry, CUSUM with \\(k = 0.5\sigma\\) detects motor degradation 15-20% faster than EWMA, at the cost of 10% higher false positive rate.

**Concrete Error Rates**

For RAVEN with anomaly threshold \\(\theta = 2.5\sigma\\) and base anomaly rate 2%:
- False Positive Rate: 1.2% (healthy flagged as anomaly)
- False Negative Rate: 8% (anomaly missed)
- Detection latency: 3-5 observations (15-25 seconds at 0.2 Hz sampling)

OUTPOST Sensor 47 uses EWMA for primary detection: temperature, motion intensity, battery voltage each tracked independently. Cross-sensor correlation uses a lightweight covariance estimate between Sensor 47 and its mesh neighbors.

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

The fusion node maintains **causal models** for each failure mode. Given observed evidence \\(E\\), Bayesian inference estimates posterior probability:

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

---

## Distributed Health Inference

### Gossip-Based Health Propagation

Individual nodes detect local anomalies. Fleet-wide health requires aggregation without a central coordinator.

**Definition 5** (Gossip Health Protocol). *A gossip health protocol is a tuple \\((H, \lambda, M, T)\\) where:*
- *\\(H = [h_1, \ldots, h_n]\\) is the health vector over \\(n\\) nodes*
- *\\(\lambda\\) is the gossip rate (exchanges per second per node)*
- *\\(M: H \times H \rightarrow H\\) is the merge function*
- *\\(T: \mathbb{R}^+ \rightarrow \mathbb{R}^+\\) is the staleness decay function*

**Gossip protocols** solve this problem. Each node maintains a health vector:

{% katex(block=true) %}
H = [h_1, h_2, \ldots, h_n]
{% end %}

Where \\(h_i\\) is node \\(i\\)'s estimated health state.

The protocol operates in rounds:
1. **Local update**: Node \\(i\\) updates \\(h_i\\) based on local anomaly detection
2. **Peer selection**: Node \\(i\\) selects random peer \\(j\\)
3. **Exchange**: Nodes \\(i\\) and \\(j\\) exchange health vectors
4. **Merge**: Each node merges received vector with local knowledge

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

A weighted merge using timestamp-based staleness:

{% katex(block=true) %}
h_k^{\text{merged}} = \frac{w_A \cdot h_k^A + w_B \cdot h_k^B}{w_A + w_B}
{% end %}

Where weights decay with staleness:

{% katex(block=true) %}
w = e^{-\gamma \tau}
{% end %}

With \\(\tau\\) as time since observation and \\(\gamma\\) as decay rate (distinct from the gossip rate \\(\lambda\\)).

**Proposition 4** (Gossip Convergence). *For a gossip protocol with rate \\(\lambda\\) and \\(n\\) nodes, the expected time for information originating at one node to reach all nodes is:*

{% katex(block=true) %}
T_{\text{convergence}} = O\left(\frac{\ln n}{\lambda}\right)
{% end %}

*Proof sketch*: The information spread follows logistic dynamics \\(dI/dt = \lambda I(1 - I)\\) where \\(I\\) is the fraction of informed nodes. Solving with initial condition \\(I(0) = 1/n\\) and computing time to reach \\(I = 1 - 1/n\\) yields \\(T = (2 \ln(n-1))/\lambda\\).
**Corollary 2**. *Doubling swarm size adds only \\(O(\ln 2 / \lambda) \approx 0.69/\lambda\\) seconds to convergence time, making gossip protocols inherently scalable for edge fleets.*

For tactical parameters (\\(n \sim 50\\), \\(\lambda \sim 0.2\\) Hz), the formula yields \\(T = 2\ln(49)/0.2 \approx 39\\) seconds—convergence within 30-40 seconds, fast enough to establish fleet-wide health awareness within a single mission phase. Broadcast approaches scale linearly with \\(n\\), which is why gossip wins at scale.

### Priority-Weighted Gossip Extension

Standard gossip treats all health updates equally. In tactical environments, critical health changes (node failure, resource exhaustion, adversarial detection) should propagate faster than routine updates.

**Priority classification**:
- \\(P_{CRITICAL}\\) (priority 3): Node failure, Byzantine detection, adversarial alert
- \\(P_{URGENT}\\) (priority 2): Resource exhaustion (<10%), capability downgrade
- \\(P_{NORMAL}\\) (priority 1): Routine health updates, minor degradation

**Accelerated propagation protocol**:

For priority \\(p\\) messages, modify the gossip rate:

{% katex(block=true) %}
\lambda_p = \lambda_{\text{base}} \cdot (1 + \eta \cdot (p - 1))
{% end %}

where \\(\eta\\) is the acceleration factor (typically 2-3). Critical messages gossip at \\(3\times\\) normal rate.

**Message prioritization in constrained bandwidth**:

When bandwidth is limited, each gossip exchange prioritizes by urgency. The protocol proceeds as follows:

**Step 1**: Merge local and peer health vectors into a unified update set.

**Step 2**: Sort updates by priority (descending), then by staleness (ascending) within each priority class.

**Step 3**: Transmit updates in sorted order until bandwidth budget exhausted:

{% katex(block=true) %}
\text{Transmit update } u_i \text{ iff } \sum_{j < i} \text{size}(u_j) + \text{size}(u_i) \leq B_{\text{budget}}
{% end %}

**Step 4**: Critical override—always include \\(P_{\text{CRITICAL}}\\) updates even if over budget:

{% katex(block=true) %}
\text{priority}(u) = P_{\text{CRITICAL}} \implies \text{transmit}(u) = \text{true}
{% end %}

This ensures safety-critical information propagates regardless of bandwidth constraints, accepting temporary budget overrun.

**Convergence improvement**: For RAVEN with \\(\eta = 2\\), critical updates converge in ~15 seconds (vs. 39 seconds for normal updates)—a 2.6× speedup for time-sensitive health information.

**Anti-flood protection**: To prevent priority abuse (Byzantine node flooding P_CRITICAL messages), rate-limit critical messages per source:

{% katex(block=true) %}
\text{Allow } P_{\text{CRITICAL}} \text{ from node } i \text{ iff } \frac{N_{\text{crit}}^i(t)}{t - t_{\text{start}}} < \rho_{\text{max}}
{% end %}

where \\(\rho_{\text{max}} \approx 0.01\\) messages/second. Exceeding this rate triggers trust decay.

### Gossip Under Partition

When the fleet partitions into disconnected clusters, gossip behavior changes fundamentally. Within each cluster, convergence continues normally. Between clusters, health state diverges.

**Remark** (Partition Staleness). *For node \\(i\\) in cluster \\(C_1\\) observing node \\(j\\) in cluster \\(C_2\\), staleness—the elapsed time since observation—accumulates from partition time \\(t_p\\):*

{% katex(block=true) %}
\tau_{ij}(t) = t - t_p + \tau_{ij}(t_p)
{% end %}

*The staleness grows unboundedly during partition, eventually exceeding any useful threshold.*

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

Each node maintains a **partition vector** \\(\rho_i\\) tracking the last known connectivity state to each other node:

{% katex(block=true) %}
\rho_i[j] = \begin{cases}
0 & \text{if } j \text{ reachable directly or via gossip} \\
t_{\text{last contact}} & \text{if } j \text{ unreachable}
\end{cases}
{% end %}

When \\(\rho_i[j] > 0\\) and \\(t - \rho_i[j] > \tau_{\text{max}}\\), node \\(i\\) marks its knowledge of node \\(j\\) as **uncertain** rather than **stale**.

**Reconciliation priority**:

Upon reconnection, nodes exchange partition vectors. The reconciliation priority for node \\(j\\)'s state is proportional to divergence duration:

{% katex(block=true) %}
\text{Priority}(j) = (t_{\text{reconnect}} - \rho[j]) \cdot \text{Importance}(j)
{% end %}

Nodes with longest partition duration and highest importance (cluster leads, critical sensors) reconcile first.

### Confidence Intervals on Stale Data

Health observations age. A drone last heard from 30 seconds ago may have changed state since then.

**Definition 6** (Staleness). *The staleness \\(\tau\\) of an observation is the elapsed time since the observation was made. An observation with staleness \\(\tau\\) has uncertainty that grows with \\(\tau\\) according to the underlying state dynamics.*

Model health as a stochastic process. If health evolves with variance \\(\sigma^2\\) per unit time, the confidence interval on stale data is:

{% katex(block=true) %}
\text{CI} = h_{\text{last}} \pm z_{\alpha/2} \sigma \sqrt{\tau}
{% end %}

Where:
- \\(h_{\text{last}}\\) = last observed health value
- \\(\tau\\) = time since observation
- \\(\sigma\\) = health volatility parameter
- \\(z_{\alpha/2}\\) = confidence multiplier (1.96 for 95%)

**Implications for decision-making**:

The CI width grows as \\(\sqrt{\tau}\\)—a consequence of the Brownian motion model. This square-root scaling means confidence degrades slowly at first but accelerates with staleness.

When the CI spans a decision threshold (like the L2 capability boundary), you can't reliably commit to that capability level. The staleness has exceeded the **decision horizon** for that threshold—the maximum time at which stale data can support the decision.

Different decisions have different horizons. Safety-critical decisions with narrow margins have short horizons. Advisory decisions with wide margins have longer horizons. The system tracks staleness against the relevant horizon for each decision type.

**Response strategies** when confidence is insufficient:
1. **Active probe**: Attempt direct communication to get fresh observation
2. **Conservative fallback**: Assume health at lower bound of CI
3. **Escalate observation priority**: Increase gossip rate for this node

**Proposition 5** (Maximum Useful Staleness). *For a health process with volatility \\(\sigma\\) and a decision requiring discrimination at precision \\(\Delta h\\) with confidence \\(1 - \alpha\\), the maximum useful staleness is:*

{% katex(block=true) %}
\tau_{\text{max}} = \left( \frac{\Delta h}{z_{\alpha/2} \sigma} \right)^2
{% end %}

*where \\(z_{\alpha/2}\\) is the standard normal quantile. Beyond \\(\tau_{\text{max}}\\), the confidence interval spans the decision threshold and the observation cannot support the decision.*

*Proof*: Follows directly from the Brownian motion model \\(dh = \sigma \, dW\\), which yields variance \\(\sigma^2 \tau\\) after elapsed time \\(\tau\\). Setting the CI half-width equal to \\(\Delta h\\) and solving for \\(\tau\\) gives the result.
**Corollary 3**. *The quadratic relationship \\(\tau_{\text{max}} \propto (\Delta h / \sigma)^2\\) implies that tightening decision margins dramatically reduces useful staleness. Systems with narrow operating envelopes require proportionally higher observation frequency.*

### Byzantine-Tolerant Health Aggregation

In contested environments, some nodes may be compromised. They may inject false health values to:
- Mask their own degradation (hide compromise)
- Cause healthy nodes to appear degraded (create confusion)
- Destabilize fleet-wide health estimates (denial of service)

**Definition 7** (Byzantine Node). *A node is Byzantine if it may deviate arbitrarily from the protocol specification, including sending different values to different peers, reporting false observations, or selectively participating in gossip rounds.*

**Weighted voting** based on trust scores:

{% katex(block=true) %}
h_k^{\text{aggregated}} = \frac{\sum_i T_i \cdot h_k^i}{\sum_i T_i}
{% end %}

Where \\(T_i\\) is the trust score of node \\(i\\). Trust is earned through consistent, verifiable behavior and decays when inconsistencies are detected.

**Outlier detection** on received health reports:

If node \\(i\\) reports health for node \\(k\\) that differs significantly from the consensus, flag the report as suspicious:

{% katex(block=true) %}
\text{suspicious} = |h_k^i - h_k^{\text{consensus}}| > \theta_{\text{outlier}}
{% end %}

Repeated suspicious reports decrease trust score for node \\(i\\).

**Isolation protocol** for nodes with inconsistent claims:

1. Track history of claims per node
2. Compute consistency score: fraction of claims matching consensus
3. If consistency below threshold, quarantine node from health aggregation
4. Quarantined nodes can still participate but their reports are not trusted

**Proposition 6** (Byzantine Tolerance Bound). *With trust-weighted aggregation, correct health estimation is maintained if the total Byzantine trust weight is bounded:*

{% katex(block=true) %}
\sum_{\text{Byzantine}} T_i < \frac{1}{3} \sum_{\text{all}} T_i
{% end %}

*This generalizes the classical \\(f < n/3\\) bound: with uniform trust, this reduces to \\(f < 1/3\\). With trust decay on suspicious nodes, Byzantine influence decreases over time, allowing tolerance of more compromised nodes provided their accumulated trust is low.*

This is not foolproof—a sophisticated adversary who understands the aggregation mechanism can craft attacks that pass consistency checks. Byzantine tolerance provides defense in depth, not absolute security.

### Trust Recovery Mechanisms

Trust decay handles misbehaving nodes, but legitimate nodes may be temporarily compromised (e.g., sensor interference, transient fault) and later recover. A purely decaying trust model permanently punishes temporary failures.

**Trust recovery model**:

Trust evolves according to a mean-reverting process with decay for misbehavior and recovery for consistent behavior:

{% katex(block=true) %}
T_i(t+1) = \begin{cases}
T_i(t) \cdot (1 - \gamma_{\text{decay}}) & \text{if inconsistent} \\
T_i(t) + \gamma_{\text{recover}} \cdot (T_{\text{max}} - T_i(t)) & \text{if consistent}
\end{cases}
{% end %}

where \\(\gamma_{\text{decay}} \approx 0.1\\) (fast decay) and \\(\gamma_{\text{recover}} \approx 0.01\\) (slow recovery). The asymmetry ensures that building trust takes longer than losing it—appropriate for contested environments.

**Recovery conditions**:

A node must demonstrate sustained consistent behavior before trust recovery activates:

{% katex(block=true) %}
\text{Recovery eligible iff } \frac{\text{consistent reports in window } W}{\text{total reports in } W} > \theta_{\text{recovery}}
{% end %}

where \\(W\\) is typically 50-100 gossip rounds and \\(\theta_{\text{recovery}} \approx 0.95\\). A node with even 5% inconsistent reports continues decaying.

**Sybil attack resistance**:

An adversary creating multiple fake identities (Sybil attack) can attempt to dominate the trust-weighted aggregation. Countermeasures:

1. **Identity binding**: Nodes must prove identity through cryptographic challenge-response or physical attestation (GPS position consistency over time)

2. **Trust inheritance limits**: New nodes start with \\(T_{\text{initial}} = T_{\text{sponsor}} \cdot \beta\\) where \\(\beta < 0.5\\). No node can spawn high-trust children.

3. **Global trust budget**: Total trust across all nodes is bounded:

{% katex(block=true) %}
\sum_i T_i \leq T_{\text{budget}} = T_{\text{max}} \cdot n_{\text{expected}}
{% end %}

New node admission requires either trust redistribution or explicit authorization.

4. **Behavioral clustering**: Nodes exhibiting suspiciously correlated behavior (same reports, same timing) are grouped and treated as a single trust entity:

{% katex(block=true) %}
T_{\text{cluster}} = \max_{i \in \text{cluster}} T_i \quad \text{(not sum)}
{% end %}

**Trust recovery example**:

CONVOY vehicle V3 experiences temporary GPS interference causing inconsistent position reports for 10 minutes. Trust drops from 1.0 to 0.35 during interference. After interference clears:
- Minutes 0-5: Consistent reports, trust rises to 0.42
- Minutes 5-15: Continued consistency, trust rises to 0.58
- Minutes 15-30: Trust rises to 0.78
- After 1 hour of consistency: Trust returns to 0.95

The slow recovery prevents adversaries from rapidly cycling between attack and "good behavior" phases.

---

## The Observability Constraint Sequence

### Hierarchy of Observability

With limited resources, what should be measured first?

The **observability constraint sequence** prioritizes metrics by importance:

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

**P0 is non-negotiable**. If a node doesn't know whether its peers are alive, it cannot make any meaningful decisions. Availability monitoring requires minimal resources—a periodic heartbeat suffices.

**P1 catches imminent failures**. Resource exhaustion is the most predictable failure mode. If power drops below 10%, failure is imminent regardless of other factors. P1 monitoring prevents surprise crashes.

**P2 detects gradual degradation**. A sensor that responds but with increasing latency is degrading. P2 catches problems before they become failures—enabling proactive healing.

**P3 catches the unexpected**. Anomaly detection (Section 2) falls here. It's more expensive than simple counters but catches failure modes that weren't explicitly modeled.

**P4 explains rather than just detects**. Root cause analysis requires correlating multiple signals across time—computationally expensive but essential for learning.

The sequence is **priority-ordered, not exclusive**. A well-resourced system implements all levels. A constrained system implements as many as resources allow, starting from P0.

### Resource Budget for Observability

Observability competes with the primary mission for resources:

{% katex(block=true) %}
R_{\text{observe}} + R_{\text{mission}} \leq R_{\text{total}}
{% end %}

Where:
- \\(R_{\text{observe}}\\) = resources for self-measurement
- \\(R_{\text{mission}}\\) = resources for primary function
- \\(R_{\text{total}}\\) = total available resources

The optimization problem:

{% katex(block=true) %}
\max \quad V_{\text{mission}}(R_{\text{mission}}) + V_{\text{health}}(R_{\text{observe}})
{% end %}

Subject to \\(R_{\text{observe}} + R_{\text{mission}} \leq R_{\text{total}}\\)

Typically:
- **Mission value** has diminishing returns: more resources yield proportionally less capability
- **Health value** has threshold effects: below minimum, health knowledge is useless; above minimum, marginal gains decrease

The optimal allocation gives sufficient resources to observability for reliable health knowledge, then allocates remainder to mission.

**OUTPOST allocation example**:
- Total compute: 1000 MIPS
- Total bandwidth to fusion: 100 Kbps

Allocation:
- P0-P1 monitoring: 50 MIPS (5%), 5 Kbps (5%)—heartbeats and resource counters
- P2-P3 monitoring: 100 MIPS (10%), 15 Kbps (15%)—performance aggregates, anomaly detection
- Gossip overhead: 0 MIPS local, 20 Kbps (20%)—health propagation
- Mission (sensor processing): 850 MIPS (85%), 60 Kbps (60%)—primary function

This 15% observability overhead enables reliable self-measurement while preserving the majority of resources for the mission.

---

## RAVEN Self-Measurement Protocol

The RAVEN drone swarm requires self-measurement at two levels: individual drone health and swarm-wide coordination state.

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

EWMA tracking on each metric with \\(\alpha = 0.1\\) (10-second effective memory). Anomaly threshold at 3σ for critical metrics (power, flight controls), 2σ for secondary metrics (sensors, links).

### Swarm-Wide Health Inference

Gossip protocol parameters:
- Exchange rate: 0.2 Hz (once per 5 seconds)
- Staleness threshold: 30 seconds (confidence drops below 90%)
- Trust decay: \\(\gamma = 0.05\\) per second
- Maximum useful staleness: 60 seconds (confidence drops below 50%, data essentially stale)

*Relationship*: The staleness threshold (30s) marks where data begins degrading meaningfully—decisions based on 30s-old data have ~90% confidence. The maximum useful staleness (60s) marks where confidence falls below 50%—beyond this, the data provides little more than a guess. The 2:1 ratio reflects the quadratic confidence decay from Proposition 5.

Health vector per drone contains:
- Binary availability (alive/silent)
- Power state (percentage)
- Critical sensor status (functional/degraded/failed)
- Mission capability level (L0-L4)

Merge function uses timestamp-weighted average for numeric values, latest-timestamp-wins for categorical values.

**Convergence guarantees**: With logarithmic propagation dynamics, fleet-wide health convergence occurs within 30-40 seconds—fast enough to track operational state changes while remaining robust to individual message losses.

### Anomaly Detection and Self-Diagnosis

Cross-sensor correlation matrix maintained locally. Example correlations:
- GPS PDOP vs. IMU drift: High PDOP should not correlate with low drift (if they do, likely spoofing)
- Battery voltage vs. current: Should follow known discharge curve (deviation indicates cell degradation)
- Camera image vs. radar return: Consistent threat detections (divergence suggests sensor failure)

Self-diagnosis follows a structured decision process:

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

The diagnosis is probabilistic—the table represents the most likely paths, but confidence levels are maintained throughout.

---

## CONVOY Self-Measurement Protocol

The CONVOY ground vehicle network operates with different constraints: vehicles have more resources than drones but face different failure modes.

### Per-Vehicle Local Measurement

Each vehicle monitors:

**Mechanical Systems**
- Engine: RPM, temperature, oil pressure, fuel consumption
- Transmission: Gear state, clutch wear indicators
- Suspension: Ride height, damper response
- Brakes: Pad wear, hydraulic pressure

**Navigation Systems**
- GPS: Position, velocity, satellite count, PDOP
- INS: Accelerometer and gyro readings, drift rate
- Dead reckoning: Wheel encoder counts, heading
- Map matching: Confidence in current road segment

**Communication Systems**
- Mesh connectivity to other vehicles
- Range to each neighbor
- Bandwidth utilization
- Latency to convoy lead

Anomaly detection uses Holt-Winters for metrics with diurnal patterns (communication quality varies with terrain) and EWMA for stationary metrics (mechanical systems).

### Convoy-Level Health Inference

Hierarchical aggregation:
1. **Primary mode**: Lead vehicle collects health from all vehicles, computes aggregate, distributes summary
2. **Fallback mode**: If lead unreachable, peer-to-peer gossip among reachable vehicles

Lead vehicle aggregation:
- Computes minimum capability level across convoy: \\(L_{\text{convoy}} = \min_i L_i\\)
- Identifies vehicles with critical anomalies
- Determines convoy-wide constraints (e.g., maximum safe speed based on worst vehicle)

Fallback gossip parameters:
- Exchange rate: 0.1 Hz (once per 10 seconds)—lower than RAVEN due to vehicle stability
- Staleness threshold: 60 seconds
- Trust decay: \\(\gamma = 0.02\\) per second

### Anomaly Detection Focus

**Position spoofing detection**:

Each vehicle tracks its own position via GPS, INS, and dead reckoning. It also receives claimed positions from neighbors. Cross-correlation identifies spoofing:

{% katex(block=true) %}
\Delta_{ij} = \|p_i^{\text{claimed}} - p_i^{\text{observed-by-}j}\|
{% end %}

If \\(\Delta_{ij}\\) exceeds threshold for vehicle \\(i\\) as observed by multiple neighbors \\(j\\), vehicle \\(i\\) is flagged for position anomaly.

**Communication anomaly classification**:

Distinguish jamming from terrain effects:
- **Jamming**: Affects all frequencies, correlates with adversarial activity, affects multiple vehicles
- **Terrain**: Affects specific paths, correlates with geographic features, predictable from maps

Use convoy's position history to build terrain propagation model. Deviations from model suggest adversarial interference.

**Integration with Markov connectivity model**:

From the [Markov connectivity model](@/blog/2026-01-15/index.md), the expected transition rates between regimes are known. Observed transitions that deviate from expectations are flagged:

{% katex(block=true) %}
\text{anomaly} = P(\text{observed transition} | \text{model}) < \theta_{\text{transition}}
{% end %}

Unexpectedly rapid transitions from connected to denied suggest adversarial action rather than natural degradation.

---

## OUTPOST Self-Measurement Protocol

The OUTPOST sensor mesh operates with the most extreme constraints: ultra-low power, extended deployment durations (30+ days), and fixed positions that make physical inspection impractical.

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

**Sensor Calibration State**
- Drift from initial calibration
- Cross-correlation with neighboring sensors
- Response time degradation
- False positive/negative rates for known test patterns

**Communication State**
- RSSI to fusion node and neighboring sensors
- Successful message delivery rate
- Round-trip latency
- Queue depth for outgoing messages

**Proposition 7** (Power-Aware Measurement Scheduling). *For a sensor with solar charging profile \\(P_{\text{solar}}(t)\\) and measurement cost \\(C_m\\) per measurement, the optimal measurement schedule maximizes information gain while maintaining positive energy margin:*

{% katex(block=true) %}
\max \sum_t I(m_t) \quad \text{s.t.} \quad \int_0^T (P_{\text{solar}}(t) - P_{\text{base}} - \sum_{t'} C_m \cdot \delta(t - t')) \, dt \geq E_{\text{reserve}}
{% end %}

*where \\(I(m_t)\\) is the information gain from measurement at time \\(t\\) and \\(E_{\text{reserve}}\\) is the required energy reserve.*

In practice, this means scheduling high-power measurements (radar, active sensors) during peak solar hours and relying on low-power passive measurements during night and low-light periods.

*Greedy heuristic*: Sort measurements by information-gain-per-watt ratio \\(I(m)/C_m\\). Schedule in order until power budget exhausted. For OUTPOST, this yields:
1. Passive seismic (0.1W, high info): Always on
2. Passive acoustic (0.2W, medium info): Always on
3. Active IR scan (2W, high info): Peak solar only (10am-2pm)
4. Radar ping (5W, very high info): Midday only (11am-1pm), battery > 80%

This heuristic achieves ~85% of optimal information gain with O(n log n) computation, suitable for embedded deployment.

### Mesh-Wide Health Inference

OUTPOST uses hierarchical aggregation with fusion nodes:

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

**Normal operation**: Sensors report to fusion nodes at low frequency (once per minute). Fusion nodes aggregate health and forward summaries via satellite uplink.

**Degraded operation**: If satellite uplink fails, fusion nodes exchange health via inter-fusion mesh links. Sensors continue local operation with extended buffer storage.

**Denied operation**: Each sensor operates independently with full local decision authority. Health state cached for post-reconnection reconciliation.

Gossip parameters for OUTPOST:
- Exchange rate: 0.017 Hz (once per minute)—optimized for power
- Staleness threshold: 300 seconds (5 minutes)
- Trust decay: \\(\gamma = 0.002\\) per second
- Maximum useful staleness: 600 seconds

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
5. At high confidence: switch to quarantine mode (report but don't trust own data)

### Cross-Sensor Validation

OUTPOST leverages overlapping sensor coverage for validation:

{% katex(block=true) %}
\text{Confidence}(s_i) = \frac{\sum_{j \in \mathcal{N}_i} w_{ij} \cdot \text{Agreement}(s_i, s_j)}{\sum_{j \in \mathcal{N}_i} w_{ij}}
{% end %}

Where \\(\mathcal{N}_i\\) is the set of sensors with overlapping coverage, and \\(\text{Agreement}(s_i, s_j)\\) measures correlation between sensor detections.

**Low confidence triggers**:
- Sensor \\(s_i\\) reports detection that no neighbors corroborate
- Sensor \\(s_i\\) fails to report detection that all neighbors report
- Sensor \\(s_i\\) timing systematically differs from neighbors

Cross-validation doesn't determine which sensor is correct—it identifies sensors requiring investigation.

---

## The Limits of Self-Measurement

Self-measurement has boundaries. Recognizing these limits is essential for correct system design.

### Novel Failure Modes

Anomaly detection learns from historical data. A failure mode never seen before—outside the training distribution—may not be detected as anomalous.

Example: OUTPOST sensors are trained on hardware failures, communication failures, and known environmental conditions. A new adversarial technique—acoustic disruption of MEMS sensors—produces sensor behavior within "normal" ranges but with corrupted data. The anomaly detector sees normal statistics; the semantic content is compromised.

**Mitigation**: Defense in depth. Multiple detection mechanisms with different assumptions. Cross-validation between sensors. Periodic ground-truth verification when connectivity allows.

### Adversarial Understanding

An adversary who understands the detection algorithm can craft attacks that evade detection.

If the adversary knows we use EWMA with \\(\alpha = 0.1\\), they can introduce gradual drift that stays within 2σ at each step but accumulates to significant deviation over time. The "boiling frog" attack.

**Mitigation**: Ensemble of detection algorithms with different sensitivities. Long-term drift detection (comparing current baseline to baseline from days ago). Randomized detection parameters.

### Cascading Failures

Self-measurement assumes the measurement infrastructure is functional. But the measurement infrastructure can fail too.

If the power management system fails, anomaly detection may lose power before it can detect the power anomaly. If the communication subsystem fails, gossip cannot propagate health. The failure cascades faster than measurement can track.

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

Return to our opening scenario. Sensor 47 went silent. How did OUTPOST diagnose the failure?

The fusion node applied the diagnostic framework from Section 2.3:

1. **Signature analysis**: Abrupt silence, no prior degradation—inconsistent with hardware failure
2. **Correlation check**: Sensors 45, 46, 48, 49 all operational—not a regional communication failure
3. **Environmental context**: No known jamming indicators, weather nominal
4. **Staleness trajectory**: Sensor 47's last 10 readings showed normal variance, no drift

Diagnosis: **Localized hardware failure** (most likely power regulation), with 78% confidence. The fusion node:
- Routed Sensor 47's coverage zone to neighbors (Sensors 45 and 48)
- Flagged for physical inspection on next patrol
- Updated its anomaly detection baseline to reduce reliance on Sensor 47's historical patterns

Post-reconnection analysis (satellite uplink restored 6 hours later): Sensor 47's voltage regulator had failed suddenly—a known failure mode for this component batch. The diagnosis was correct. The system had self-measured, self-diagnosed, and self-healed without human intervention.

### Learning from Measurement Failures

Anti-fragile self-measurement improves from its failures. When post-hoc analysis reveals a measurement failure:
1. Document the failure mode
2. Add detection signature if possible
3. Adjust thresholds or algorithms
4. Update training data to include this case

Each measurement failure is an opportunity to improve future measurement.

---

## Closing: The Measurement-Action Loop

Self-measurement without self-action is just logging.

You measure in order to act—to heal, adapt, improve. The measurement-action loop drives autonomic architecture:

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

This is the MAPE-K loop (Monitor, Analyze, Plan, Execute, Knowledge) that IBM formalized for autonomic computing. The [self-healing article](@/blog/2026-01-29/index.md) develops the healing phase in detail.

Return to OUTPOST BRAVO.

Sensor 47 is silent. The fusion node has measured: abrupt silence, neighbors functional, location on approach path. The analysis suggests adversarial action with 73% confidence. The plan: increase defensive posture, activate backup sensors in the region, log for human review when uplink restores.

But measurement alone doesn't execute this plan. Self-healing must decide: Is 73% confidence sufficient to escalate defensive posture? What is the cost of false alarm versus missed threat? How does the healing action affect the rest of the system?

The [next article on self-healing](@/blog/2026-01-29/index.md) develops the engineering principles for autonomous healing under uncertainty.
