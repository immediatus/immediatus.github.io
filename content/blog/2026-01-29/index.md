+++
authors = ["Yuriy Polyulya"]
title = "Self-Healing Without Connectivity"
description = "What happens when a component fails and there's no one to call? Edge systems must repair themselves—detecting failures, selecting remediation strategies, and executing recovery without human intervention. This article adapts IBM's MAPE-K autonomic control loop for contested environments, develops confidence-based healing triggers that balance false positives against missed failures, and establishes recovery ordering principles that prevent cascading failures when multiple components need healing simultaneously."
date = 2026-01-29
slug = "autonomic-edge-part3-self-healing"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "self-healing", "control-theory"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 3
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Traditional distributed systems assume connectivity as the norm and partition as the exception. Tactical edge systems invert this assumption: disconnection is the default operating state, and connectivity is the opportunity to synchronize. This series develops the engineering principles for autonomic architectures—systems that self-measure, self-heal, and self-optimize when human operators cannot intervene."""
+++

---

## Prerequisites

This article builds on the self-measurement foundation:

- **[Contested Connectivity](@/blog/2026-01-15/index.md)**: The connectivity regimes (connected, degraded, denied, adversarial) define when self-healing must operate autonomously. The capability hierarchy (L0-L4) defines what healing must preserve.
- **[Self-Measurement](@/blog/2026-01-22/index.md)**: Anomaly detection and distributed health inference provide the inputs to healing decisions. The observability constraint sequence (P0-P4) defines what we know about system state.

The measurement-action loop closes here: we measure system health in order to act on it. Self-measurement without self-action is mere logging. Self-action without self-measurement is blind intervention. The autonomic system requires both.

This part develops the engineering principles for the action side: how systems repair themselves when they cannot escalate to human operators, when the network is partitioned, when there is no time to wait for instructions.

---

## Theoretical Contributions

This article develops the theoretical foundations for autonomous self-healing in distributed systems under connectivity constraints. We make the following contributions:

1. **Edge-Adapted MAPE-K Framework**: We extend the autonomic computing control loop for edge environments, deriving stability conditions for closed-loop healing with delayed feedback and incomplete observation.

2. **Confidence-Based Healing Triggers**: We formalize the decision-theoretic framework for healing under uncertainty, deriving optimal confidence thresholds as a function of asymmetric error costs and action reversibility.

3. **Dependency-Aware Recovery Ordering**: We model recovery sequencing as constrained optimization over dependency graphs, providing polynomial-time algorithms for DAG structures and approximations for cyclic dependencies.

4. **Cascade Prevention Theory**: We analyze resource contention during healing and derive bounds on healing resource quotas that prevent cascade failures while maximizing recovery throughput.

5. **Minimum Viable System Characterization**: We formalize MVS as a set cover optimization problem and derive greedy approximation algorithms for identifying critical component subsets.

These contributions connect to and extend prior work on autonomic computing (Kephart & Chess, 2003), control-theoretic stability (Astrom & Murray, 2008), and Markov decision processes (Puterman, 1994), adapting these frameworks for contested edge deployments where human oversight is unavailable.

---

## Opening Narrative: RAVEN Drone Down

The RAVEN swarm of 47 drones is executing surveillance 15km from base, 40% coverage complete.

Drone 23 broadcasts: battery critical (3.21V vs 3.40V threshold), 8 minutes flight time, confidence 0.94. The [self-measurement system](@/blog/2026-01-22/index.md) detected the anomaly correctly—lithium cell imbalance from high-current maneuvers.

Operations center unreachable. Connectivity at \\(C(t) < 0.1\\) for 23 minutes. The swarm cannot request guidance.

The decision space:

**Option A: Continue mission, lose drone 23**
- Drone 23 continues until battery exhausted
- Crash in contested terrain (potential data/asset compromise)
- Swarm loses 1/47 of coverage capacity
- Expected mission completion: 92%

**Option B: Drone 23 returns to base**
- Drone 23 departs immediately
- Neighbors expand sectors to cover gap
- Reduced sensor density on eastern edge
- Expected mission completion: 97%

**Option C: Compress entire formation**
- All drones move inward to maintain mesh density
- Reduced total coverage area
- Drone 23 can fly shorter distance home
- Expected mission completion: 89%

The swarm has 8 minutes to decide and execute. The MAPE-K loop must analyze options, select a healing action, and coordinate execution—all without human intervention.

Self-healing means repairing, reconfiguring, and adapting in response to failures—without waiting for someone to tell you what to do.

---

## The Autonomic Control Loop

### The MAPE-K Model

**Definition 8** (Autonomic Control Loop). *An autonomic control loop is a tuple \\((M, A, P, E, K)\\) where:*
- *\\(M: \mathcal{O} \rightarrow \mathcal{S}\\) is the monitor function mapping observations to state estimates*
- *\\(A: \mathcal{S} \rightarrow \mathcal{D}\\) is the analyzer mapping state estimates to diagnoses*
- *\\(P: \mathcal{D} \times K \rightarrow \mathcal{A}\\) is the planner selecting healing actions*
- *\\(E: \mathcal{A} \rightarrow \mathcal{O}\\) is the executor applying actions and returning observations*
- *\\(K\\) is the knowledge base encoding system model and healing policies*

IBM's autonomic computing initiative formalized the control loop for self-managing systems as MAPE-K: Monitor, Analyze, Plan, Execute, with shared Knowledge.

{% mermaid() %}
graph TD
    subgraph Control_Loop["MAPE-K Control Loop"]
    M["Monitor<br/>(sensors, metrics)"] --> A["Analyze<br/>(diagnose state)"]
    A --> P["Plan<br/>(select healing)"]
    P --> E["Execute<br/>(apply action)"]
    E -->|"Feedback"| M
    end
    K["Knowledge Base<br/>(policies, models, history)"]
    K -.-> M
    K -.-> A
    K -.-> P
    K -.-> E

    style K fill:#fff9c4,stroke:#f9a825
    style M fill:#c8e6c9
    style A fill:#bbdefb
    style P fill:#e1bee7
    style E fill:#ffab91
{% end %}

**Monitor**: Observe via sensors and health metrics ([self-measurement infrastructure](@/blog/2026-01-22/index.md)).

**Analyze**: Transform raw metrics into diagnoses. "Battery 3.21V" becomes "Drone 23 fails in 8 min, probability 0.94."

**Plan**: Generate options, select best expected outcome.

**Execute**: Apply remediation, coordinate with affected components, verify success.

**Knowledge**: Distributed state—topology, policies, historical effectiveness, health estimates. Must be eventually consistent and partition-tolerant.

The control loop executes continuously:

{% katex(block=true) %}
\text{Loop: } \quad M \rightarrow A \rightarrow P \rightarrow E \rightarrow M \rightarrow \cdots
{% end %}

The cycle time—how fast the loop iterates—determines system responsiveness. A 10-second cycle means problems are detected and addressed within 10-30 seconds. A 1-second cycle enables faster response but consumes more resources.

### Closed-Loop vs Open-Loop Healing

Control theory distinguishes two fundamental approaches:

**Closed-loop control**: Observe outcome, compare to desired state, adjust, repeat. The feedback loop enables correction of errors and adaptation to disturbances.

{% katex(block=true) %}
U_t = K \cdot (X_{\text{desired}} - X_{\text{observed}})
{% end %}

Where \\(U_t\\) is control action, \\(K\\) is gain, and the difference is the error signal.

**Open-loop control**: Predetermined response without verification. Execute the action based on input, assume it works.

{% katex(block=true) %}
U_t = f(X_{\text{observed}})
{% end %}

The action depends only on observed state, not on the outcome of previous actions.

<style>
#tbl_control + table th:first-of-type { width: 25%; }
#tbl_control + table th:nth-of-type(2) { width: 35%; }
#tbl_control + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_control"></div>

| Property | Closed-Loop | Open-Loop |
| :--- | :--- | :--- |
| Robustness | High (adapts to errors) | Low (no correction) |
| Speed | Slow (wait for feedback) | Fast (act immediately) |
| Stability | Can oscillate if poorly tuned | Stable but may miss target |
| Information need | Requires outcome observation | Only requires input |

Edge healing uses a **hybrid approach**:

1. **Open-loop for immediate stabilization**: When a critical failure is detected, apply predetermined emergency response immediately. Don't wait for feedback.

2. **Closed-loop for optimization**: After stabilization, observe outcomes and adjust. If the initial response was insufficient, escalate. If it was excessive, scale back.

Drone 23's battery failure illustrates this hybrid:
- **Open-loop**: Immediately reduce power consumption (stop non-essential sensors)
- **Closed-loop**: Monitor voltage response, adjust flight profile, decide on return trajectory based on observed endurance

### Healing Latency Budget

Just as the [contested connectivity framework](@/blog/2026-01-15/index.md) decomposes latency for mission operations, self-healing requires its own latency budget:

{% katex(block=true) %}
T_{\text{heal}} = T_{\text{detect}} + T_{\text{analyze}} + T_{\text{plan}} + T_{\text{coordinate}} + T_{\text{execute}}
{% end %}

<style>
#tbl_latency + table th:first-of-type { width: 20%; }
#tbl_latency + table th:nth-of-type(2) { width: 25%; }
#tbl_latency + table th:nth-of-type(3) { width: 25%; }
#tbl_latency + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_latency"></div>

| Phase | RAVEN Budget | CONVOY Budget | Limiting Factor |
| :--- | :--- | :--- | :--- |
| Detection | 5-10s | 10-30s | Gossip convergence |
| Analysis | 1-2s | 2-5s | Diagnostic complexity |
| Planning | 2-5s | 5-15s | Option evaluation |
| Coordination | 5-15s | 15-60s | Fleet size, connectivity |
| Execution | 10-60s | 30-300s | Physical action time |
| **Total** | **23-92s** | **62-410s** | Mission tempo |

**Proposition 8** (Healing Deadline). *For a failure with time-to-criticality \\(T_{\text{crit}}\\), healing must complete within margin:*

{% katex(block=true) %}
T_{\text{heal}} < T_{\text{crit}} - T_{\text{margin}}
{% end %}

*where \\(T_{\text{margin}}\\) accounts for execution variance and verification time. If this inequality cannot be satisfied, the healing action must be escalated to a faster (but possibly more costly) intervention.*

For Drone 23 with 8 minutes to battery exhaustion:
- \\(T_{\text{crit}} = 480\\)s
- Required \\(T_{\text{margin}} = 60\\)s (landing time)
- Available healing window: 420s
- Actual healing time: ~45s (well within budget)

When the healing deadline cannot be met, the system must either:
1. Execute partial healing (stabilize but not fully recover)
2. Skip to emergency protocols (bypass normal MAPE-K)
3. Accept degraded state (capability reduction)

**Proposition 9** (Closed-Loop Healing Stability). *For an autonomic control loop with feedback delay \\(\tau\\) and controller gain \\(K\\), stability requires the gain-delay product to satisfy:*

{% katex(block=true) %}
K \cdot \tau < \frac{\pi}{2}
{% end %}

*This bound follows from the Nyquist stability criterion: feedback delay \\(\tau\\) introduces phase lag \\(\omega\tau\\) at frequency \\(\omega\\). At the gain crossover frequency \\(\omega_c = K\\), the phase margin becomes \\(\pi/2 - K\tau\\), which must remain positive for stability.*

*Proof*: For a proportional controller with delay, the open-loop transfer function is \\(G(s) = K e^{-s\tau} / s\\). The phase at crossover is \\(-\pi/2 - \omega_c \tau\\). Phase margin \\(\phi_m = \pi - (\pi/2 + K\tau) > 0\\) requires \\(K\tau < \pi/2\\).
**Corollary 4**. *Increased feedback delay (larger \\(\tau\\)) requires more conservative controller gains, trading response speed for stability.*

### Adaptive Gain Scheduling

The stability condition \\(K \cdot \tau < \pi/2\\) suggests a key insight: as feedback delay \\(\tau\\) varies with connectivity regime, the controller gain \\(K\\) should adapt accordingly.

**Gain scheduling by connectivity regime**:

Define regime-specific gains that maintain stability margins across all operating conditions:

{% katex(block=true) %}
K_{\text{regime}} = \frac{\phi_{\text{target}}}{\tau_{\text{regime}}}
{% end %}

where \\(\phi_{\text{target}} \approx \pi/4\\) provides adequate stability margin (phase margin of 45°).

| Regime | Typical \\(\tau\\) | Controller Gain \\(K\\) | Healing Response |
|:-------|:-------------------|:------------------------|:-----------------|
| Full | 2-5s | 0.15-0.40 | Aggressive, fast convergence |
| Degraded | 10-30s | 0.025-0.08 | Moderate, stable |
| Intermittent | 30-120s | 0.007-0.025 | Conservative, slow |
| Denied | ∞ (timeout) | 0.005 | Minimal, open-loop fallback |

**Smooth gain transitions**:

Abrupt gain changes can destabilize the control loop. Use exponential smoothing:

{% katex(block=true) %}
K(t) = \alpha \cdot K_{\text{target}}(\text{regime}(t)) + (1 - \alpha) \cdot K(t-1)
{% end %}

where \\(\alpha \approx 0.1\\) prevents oscillation during regime transitions.

**Bumpless transfer protocol**:

When switching between regime-specific gains, maintain controller output continuity:

1. Compute new gain \\(K_{\text{new}}\\) for target regime
2. Calculate output difference: \\(\Delta U = (K_{\text{new}} - K_{\text{old}}) \cdot e(t)\\)
3. Spread \\(\Delta U\\) over transition window \\(T_{\text{transfer}} \approx 3\tau_{\text{old}}\\)
4. Apply gradual change to avoid step discontinuities

**Proactive gain adjustment**:

Rather than waiting for regime transitions, predict upcoming delays from connectivity trends:

{% katex(block=true) %}
\hat{\tau}(t + \Delta) = \tau(t) + \frac{d\tau}{dt} \cdot \Delta
{% end %}

If predicted delay exceeds current regime threshold, preemptively reduce gain before connectivity degrades.

**CONVOY example**: During mountain transit, connectivity degradation is predictable from terrain maps. The healing controller reduces gain 30 seconds before entering known degraded zones, preventing oscillatory healing behavior when feedback delays suddenly increase.

---

## Healing Under Uncertainty

### Acting Without Root Cause

Root cause analysis is the gold standard for remediation: understand why the problem occurred, address the underlying cause, prevent recurrence. In well-instrumented cloud environments with centralized logging and expert operators, root cause analysis is achievable.

At the edge, the requirements for root cause analysis may not be met:
- **Data**: Limited logging capacity, no access to historical comparisons
- **Time**: Failure demands immediate response, analysis takes time
- **Expertise**: No human expert available during partition

**Symptom-based remediation** addresses this gap. Instead of "if we understand cause C, apply solution S," we use "if we observe symptoms Y, try treatment T."

Examples of symptom-based rules:

| Symptom | Treatment | Rationale |
| :--- | :--- | :--- |
| High latency | Restart service | Many causes manifest as latency; restart clears transient state |
| Memory growing | Trigger garbage collection | Memory leaks and bloat both respond to GC |
| Packet loss | Switch frequency | Interference or jamming both improved by frequency change |
| Sensor drift | Recalibrate | Hardware aging and environmental factors both helped by recal |

The risk of symptom-based remediation: **treating symptoms while cause worsens**. If the root cause is hardware failure, restarting the service provides temporary relief but doesn't prevent eventual complete failure.

Mitigations:
- **Healing attempt limits**: If treatment T fails after N attempts, escalate to more aggressive treatment
- **Escalation triggers**: If symptoms return within time window, assume treatment was insufficient
- **Treatment cooldown**: Don't re-apply same treatment too quickly; allow observation time

### Confidence Thresholds for Healing Actions

From [self-measurement](@/blog/2026-01-22/index.md), health estimates come with confidence intervals. When is confidence "enough" to justify a healing action?

**Definition 9** (Healing Action Severity). *The severity \\(S(a) \in [0, 1]\\) of healing action \\(a\\) is determined by its reversibility \\(R(a)\\) and impact scope \\(I(a)\\): \\(S(a) = (1 - R(a)) \cdot I(a)\\). Actions with \\(S(a) > 0.8\\) are classified as high-severity.*

The decision depends on the cost model:

{% katex(block=true) %}
\text{Expected cost of action} = C_{\text{act}} \cdot P(\text{wrong}) + C_{\text{benefit}} \cdot P(\text{right})
{% end %}

{% katex(block=true) %}
\text{Expected cost of inaction} = C_{\text{inaction}} \cdot P(\text{problem real})
{% end %}

Act when expected cost of action is less than expected cost of inaction.

Different actions have different severities and thus different confidence thresholds:

<style>
#tbl_thresholds + table th:first-of-type { width: 25%; }
#tbl_thresholds + table th:nth-of-type(2) { width: 25%; }
#tbl_thresholds + table th:nth-of-type(3) { width: 25%; }
#tbl_thresholds + table th:nth-of-type(4) { width: 25%; }
</style>
<div id="tbl_thresholds"></div>

| Action | Severity | Reversibility | Required Confidence |
| :--- | :--- | :--- | :--- |
| Restart service | Low | Full | 0.60 |
| Reduce workload | Low | Full | 0.55 |
| Isolate component | Medium | Partial | 0.75 |
| Restart node | Medium | Delayed | 0.80 |
| Isolate node from fleet | High | Complex | 0.90 |
| Destroy/abandon | Extreme | None | 0.99 |

For Drone 23:
- Detection confidence: 0.94
- Action: Return to base (medium severity, reversible if wrong)
- Required confidence: 0.80
- Decision: 0.94 > 0.80, proceed with return

**Proposition 10** (Optimal Confidence Threshold). *The optimal confidence threshold \\(\theta^\*(a)\\) for healing action \\(a\\) is:*

{% katex(block=true) %}
\theta^*(a) = \frac{C_{\text{FP}}(a)}{C_{\text{FP}}(a) + C_{\text{FN}}(a)}
{% end %}

*where \\(C_{\text{FP}}(a)\\) is the cost of false positive (unnecessary healing) and \\(C_{\text{FN}}(a)\\) is the cost of false negative (missed problem).*

*Proof*: At confidence \\(c\\), acting costs \\(C_{\text{FP}} \cdot (1-c)\\) in expectation (wrong with probability \\(1-c\\)), while not acting costs \\(C_{\text{FN}} \cdot c\\) (needed with probability \\(c\\)). Act when \\(C_{\text{FP}}(1-c) < C_{\text{FN}} \cdot c\\), which simplifies to \\(c > C_{\text{FP}}/(C_{\text{FP}} + C_{\text{FN}})\\).
The threshold must account for asymmetric costs. If false positive (treating healthy as sick) has low cost but false negative (missing real problem) has catastrophic cost, lower the threshold—accept more false positives to avoid false negatives.

### Dynamic Threshold Adaptation

Static thresholds assume fixed cost ratios. In contested environments, costs vary with context:

- **Resource scarcity**: When power is low, false positive healing actions become more costly (wasted resources)
- **Mission criticality**: During high-stakes phases, false negatives become catastrophic
- **Connectivity**: In denied regime, healing must be more decisive (can't wait for confirmation)
- **Fleet state**: If many nodes are degraded, aggressive healing risks cascade

**Context-dependent cost modulation**:

{% katex(block=true) %}
C_{\text{FP}}^{\text{eff}}(t) = C_{\text{FP}}^{\text{base}} \cdot f_{\text{resource}}(R(t)) \cdot f_{\text{cascade}}(n_{\text{healing}}(t))
{% end %}

{% katex(block=true) %}
C_{\text{FN}}^{\text{eff}}(t) = C_{\text{FN}}^{\text{base}} \cdot f_{\text{mission}}(\text{phase}(t)) \cdot f_{\text{connectivity}}(C(t))
{% end %}

**Modulation functions**:

- \\(f_{\text{resource}}(R) = 1 + 2 \cdot (1 - R/R_{\max})\\): FP cost triples when resources depleted
- \\(f_{\text{cascade}}(n) = 1 + 0.5n\\): Each concurrent healing increases FP cost by 50%
- \\(f_{\text{mission}}(\text{phase}) \in [1, 5]\\): Critical phases multiply FN cost up to 5×
- \\(f_{\text{connectivity}}(C) = 2 - C\\): Full connectivity halves FN cost; denied doubles it

**Dynamic threshold update**:

{% katex(block=true) %}
\theta^*(t) = \frac{C_{\text{FP}}^{\text{eff}}(t)}{C_{\text{FP}}^{\text{eff}}(t) + C_{\text{FN}}^{\text{eff}}(t)}
{% end %}

**RAVEN example**: During extraction phase (mission-critical), \\(f_{\text{mission}} = 4\\). With 60% resource remaining and good connectivity:

{% katex(block=true) %}
\begin{aligned}
C_{\text{FP}}^{\text{eff}} &= 1.0 \cdot 1.8 \cdot 1.0 = 1.8 \\
C_{\text{FN}}^{\text{eff}} &= 5.0 \cdot 4.0 \cdot 1.1 = 22.0 \\
\theta^* &= \frac{1.8}{1.8 + 22.0} = 0.076
\end{aligned}
{% end %}

The threshold drops to 7.6%—the system heals at very low confidence during critical phases, accepting many false positives to avoid any missed failures.

**Threshold bounds**:

Unconstrained adaptation can lead to pathological behavior. Impose bounds:

{% katex(block=true) %}
\theta_{\min} \leq \theta^*(t) \leq \theta_{\max}
{% end %}

where \\(\theta_{\min} = 0.05\\) (always require some confidence) and \\(\theta_{\max} = 0.95\\) (never completely ignore problems).

**Hysteresis for threshold changes**:

Rapidly fluctuating thresholds cause inconsistent behavior. Apply hysteresis:

{% katex(block=true) %}
\theta(t) = \begin{cases}
\theta^*(t) & \text{if } |\theta^*(t) - \theta(t-1)| > \delta_{\theta} \\
\theta(t-1) & \text{otherwise}
\end{cases}
{% end %}

where \\(\delta_{\theta} \approx 0.1\\) prevents threshold jitter.

### The Harm of Wrong Healing

Healing actions can make things worse:

**False positive healing**: Restarting a healthy component because of anomaly detector error. The restart itself causes momentary unavailability. In RAVEN, restarting a drone's flight controller mid-maneuver could destabilize formation.

**Resource consumption**: MAPE-K consumes CPU, memory, and bandwidth. If healing is triggered too frequently, the healing overhead starves the mission. The system spends its energy on healing rather than on its primary function.

**Cascading effects**: Healing component A affects component B. In CONVOY, restarting vehicle 4's communication system breaks the mesh path to vehicles 5-8. The healing of one component triggers failures in others.

**Healing loops**: A heals B (restart), B heals A (because A restarted affected B), A heals B again, infinitely. The system oscillates between healing states, never stabilizing.

Detection and prevention mechanisms:

**Healing attempt tracking**: Log each healing action with timestamp and outcome. If the same action triggers repeatedly in short time, something is wrong with the healing strategy, not just the target.

{% katex(block=true) %}
\text{Healing rate} = \frac{\text{healing attempts in window } T}{T}
{% end %}

If healing rate exceeds threshold, reduce healing aggressiveness or pause healing entirely.

**Cooldown periods**: After healing action A, impose minimum time before A can trigger again. This prevents oscillation and allows time to observe outcomes.

{% katex(block=true) %}
t_{\text{next}(A)} \geq t_{\text{last}(A)} + \tau_{\text{cooldown}}(A)
{% end %}

**Dependency tracking**: Before healing A, check if healing A will affect critical components B. If so, either heal B first, or delay healing A until B is stable.

---

## Recovery Ordering

### Dependency-Aware Restart Sequences

When multiple components need healing, order matters.

Consider a system with database D, application server A, and load balancer L. The dependencies:
- A depends on D (needs database connection)
- L depends on A (needs application endpoint)

If all three need restart, the correct sequence is: D, then A, then L. Restarting in wrong order (L, then A, then D) means L and A start before their dependencies are available, causing boot failures.

Formally, define dependency graph \\(G = (V, E)\\) where:
- \\(V\\) = set of components
- \\(E\\) = set of dependency edges; \\((A, B) \in E\\) means A depends on B

The correct restart sequence is a **topological sort** of \\(G\\): an ordering where every component appears after all its dependencies.

{% katex(block=true) %}
\text{Valid sequence } \sigma: \quad (A, B) \in E \Rightarrow \sigma(B) < \sigma(A)
{% end %}

**Edge challenge**: The dependency graph may not be fully known locally. In cloud environments, a centralized registry tracks dependencies. At the edge, each node may have partial knowledge.

Strategies for incomplete dependency knowledge:

**Static configuration**: Define dependencies at design time, distribute to all nodes. Works for stable systems but doesn't adapt to runtime changes.

**Runtime discovery**: Observe which components communicate with which others during normal operation. Infer dependencies from communication patterns. Risky if observations are incomplete.

**Conservative assumptions**: If dependency unknown, assume it exists. This may result in unnecessary delays but avoids incorrect ordering.

### Circular Dependency Breaking

Some systems have circular dependencies that prevent topological sorting.

Example: Authentication service A depends on database D for user storage. Database D depends on authentication service A for access control. Neither can start without the other.

{% mermaid() %}
graph LR
    A["Auth Service"] -->|"needs users from"| D["Database"]
    D -->|"needs auth from"| A

    style A fill:#ffcdd2,stroke:#c62828
    style D fill:#ffcdd2,stroke:#c62828
{% end %}

Strategies for breaking cycles:

**Cold restart all simultaneously**: Start all components in the cycle at once. Race condition: hope they stabilize. Works for simple cases but unreliable for complex cycles.

**Stub mode**: Start A in degraded mode that doesn't require D (e.g., allow anonymous access temporarily). Start D using A's degraded mode. Once D is healthy, promote A to full mode requiring D.

{% katex(block=true) %}
\text{Sequence: } A_{\text{stub}} \rightarrow D \rightarrow A_{\text{full}}
{% end %}

**Quorum-based**: If multiple instances of A and D exist, restart subset while others continue serving. RAVEN example: restart half the drones while others maintain coverage, then swap.

**Cycle detection and minimum-cost break**: Use DFS to find cycles. For each cycle, identify the edge with lowest "break cost"—the dependency that is easiest to stub or bypass. Break that edge.

{% katex(block=true) %}
e^* = \arg\min_{e \in \text{cycle}} C_{\text{break}}(e)
{% end %}

### Minimum Viable System

Not all components are equally critical. When resources for healing are limited, prioritize the components that matter most.

**Definition 10** (Minimum Viable System). *The minimum viable system MVS \\(\subseteq V\\) is the smallest subset of components such that \\(\text{capability}(\text{MVS}) \geq L_1\\), where \\(L_1\\) is the basic mission capability threshold. Formally:*

{% katex(block=true) %}
\text{MVS} = \arg\min_{S \subseteq V} |S| \quad \text{subject to} \quad \text{capability}(S) \geq L_1
{% end %}

For RAVEN:
- **MVS components**: Flight controller, collision avoidance, mesh radio, GPS
- **Non-MVS components**: High-resolution camera, target classification ML, telemetry detail

When healing resources are scarce, heal MVS components first. Non-MVS components can remain degraded.

**Proposition 11** (MVS Approximation). *Finding the exact MVS is NP-hard (reduction from set cover). However, a greedy algorithm that iteratively adds the component maximizing capability gain achieves approximation ratio \\(O(\ln |V|)\\).*

*Proof sketch*: MVS is a covering problem: find the minimum set of components whose combined capability exceeds threshold \\(L_1\\). When the capability function exhibits diminishing marginal returns (submodular), the greedy algorithm achieves \\(O(\ln |V|)\\) approximation, matching the bound for weighted set cover.
For small component sets, enumerate solutions. For larger sets, use the greedy approximation: iteratively add the component that contributes most to capability until L1 is reached.

---

## Cascade Prevention

### Resource Contention During Recovery

Healing consumes the resources needed for normal operation:
- **CPU**: MAPE-K analysis, action planning, coordination
- **Memory**: Healing state, candidate solutions, rollback buffers
- **Bandwidth**: Gossip for healing coordination, status updates
- **Power**: Additional computation and communication

When multiple healing actions execute simultaneously, resource contention can prevent any from completing. The system becomes worse during healing than before.

**Healing resource quotas**: Reserve a fixed fraction of resources for healing. Healing cannot exceed this quota even if more problems are detected.

{% katex(block=true) %}
R_{\text{heal}} \leq \alpha \cdot R_{\text{total}}, \quad \alpha \approx 0.2
{% end %}

If healing demands exceed quota, prioritize by severity and queue the remainder.

**Prioritized healing queue**: When multiple healing actions are needed, order by:
1. Impact on MVS (critical components first)
2. Expected time to complete
3. Resource requirements (prefer low-resource actions)

Formally, this is a scheduling problem:

{% katex(block=true) %}
\min \sum_i w_i \cdot C_i
{% end %}

Where \\(w_i\\) is priority weight and \\(C_i\\) is completion time for action \\(i\\). Classic scheduling algorithms (shortest job first, weighted shortest job first) apply.

### Thundering Herd from Synchronized Restart

After a partition heals, multiple nodes may attempt simultaneous healing. This **thundering herd** can overwhelm shared resources.

Scenario: CONVOY of 12 vehicles experiences 30-minute partition. During partition, vehicles 3, 5, and 9 developed issues requiring healing but couldn't coordinate with convoy lead. When partition heals, all three simultaneously:
- Request lead approval for healing
- Download healing policies
- Execute restart sequences
- Upload health status

The convoy's limited bandwidth is overwhelmed. Healing takes longer than if coordinated sequentially.

**Jittered restarts**: Each node waits random delay before initiating healing:

{% katex(block=true) %}
t_{\text{heal}} = t_{\text{partition-end}} + \text{Uniform}(0, T_{\text{jitter}})
{% end %}

Expected load with \\(n\\) nodes, healing rate \\(\lambda\\), jitter window \\(T\\):

{% katex(block=true) %}
\text{Peak load (no jitter)} = n \cdot \lambda
{% end %}

{% katex(block=true) %}
\text{Average load (with jitter)} = \frac{n \cdot \lambda}{T}
{% end %}

Jitter spreads load over time, preventing spike.

**Staged recovery**: Define recovery waves. Wave 1 heals highest-priority nodes. Wave 2 waits for Wave 1 to complete. This requires coordination but provides better control than random jitter.

### Progressive Healing with Backoff

Start with minimal intervention. Escalate only if insufficient.

The **healing escalation ladder**:

1. **Retry**: Wait and retry operation (transient failures)
2. **Restart**: Restart the specific component
3. **Reconfigure**: Adjust configuration parameters
4. **Isolate**: Remove component from active duty
5. **Replace**: Substitute with backup component
6. **Abandon**: Remove from fleet entirely

Progress up the ladder only when lower levels fail.

**Exponential backoff** between levels:

{% katex(block=true) %}
t_{\text{wait}}(k) = t_0 \cdot 2^k
{% end %}

Where \\(k\\) is the level and \\(t_0\\) is base wait time.

After action at level \\(k\\), wait \\(t_{\text{wait}}(k)\\) before concluding it failed and escalating to level \\(k+1\\).

**Multi-armed bandit formulation**: Each healing action is an "arm" with unknown success probability. The healing controller must explore (try different actions to learn effectiveness) and exploit (use actions known to work).

The UCB algorithm from [anti-fragile learning](@/blog/2026-02-12/index.md) applies:

{% katex(block=true) %}
\text{UCB}(a) = \hat{p}_a + c\sqrt{\frac{\ln t}{n_a}}
{% end %}

Where \\(\hat{p}_a\\) is estimated success probability for action \\(a\\), \\(t\\) is total attempts, \\(n_a\\) is attempts for action \\(a\\).

Select the action with highest UCB. This naturally balances trying known-good actions with exploring potentially better alternatives.

The UCB algorithm achieves regret bound \\(O(\sqrt{K \cdot T \cdot \ln T})\\) where \\(K\\) is the number of healing actions and \\(T\\) is the number of healing episodes. For RAVEN with \\(K = 6\\) healing actions over \\(T = 100\\) episodes, expected regret is bounded by \\(\sim 40\\) suboptimal decisions—the system converges to near-optimal healing policy within the first deployment month.

---

## RAVEN Self-Healing Protocol

Return to Drone 23's battery failure. How does the RAVEN swarm heal?

### Healing Decision Analysis

The MAPE-K loop executes:

**Monitor**: Drone 23's battery alert propagates via gossip. Within 15 seconds, all swarm members know Drone 23's status.

**Analyze**: Each drone's local analyzer assesses impact:
- Drone 23 will fail in 8 minutes
- If 23 fails in place: coverage gap on eastern sector, potential crash in contested area
- If 23 returns: neighbors must expand coverage

**Plan**: Cluster lead (Drone 1) computes options by evaluating expected mission value for each healing alternative:

{% katex(block=true) %}
E[\text{mission} | a] = \sum_{o \in \text{outcomes}} P(o | a) \cdot V(o)
{% end %}

**Decision-theoretic framework**: Each healing option \\(a\\) induces a probability distribution over outcomes. The optimal action maximizes expected value subject to risk constraints:

{% katex(block=true) %}
a^* = \arg\max_a E[V | a] \quad \text{subject to} \quad P(\text{catastrophic} | a) < \epsilon
{% end %}

For the drone return scenario, you're trading **coverage preservation against asset recovery**. Compression maintains formation integrity but sacrifices coverage area. Return to base maintains coverage but accepts execution risk.

**Proactive extraction dominates passive observation** when asset value exceeds the coverage loss. When in doubt, get the degraded asset out rather than watching it fail in place.

**Execute**: Coordinated healing sequence. The cluster lead broadcasts the healing plan. Within one second, neighbors acknowledge sector expansion and Drone 23 acknowledges its return path. Formation adjustment begins and completes in roughly 8 seconds. Drone 23 departs, neighbors restore coverage to L2, and twelve minutes later Drone 23 reports safe landing at base.

### Healing Coordination Under Partition

What if the swarm is partitioned during healing?

Scenario: Seconds into coordination, jamming creates partition. Drones 30-47 (eastern cluster) cannot receive healing plan.

Fallback protocol:
1. Eastern cluster detects loss of contact with Drone 1 (cluster lead)
2. Drone 30 assumes local lead role for eastern cluster
3. Drone 30 independently detects Drone 23's status from cached gossip
4. Eastern cluster executes local healing plan (may differ from western cluster's plan)

Post-reconnection [reconciliation](@/blog/2026-02-05/index.md) compares healing logs from both clusters, verifies formation consistency, and merges any conflicting state.

### Edge Cases

**What if neighbors also degraded?**

If Drones 21, 22, 24, 25 all have elevated failure risk, they cannot safely expand coverage. The healing plan must account for cascading risk.

Solution: Healing confidence check before acceptance:

{% katex(block=true) %}
P(\text{healing stable}) = \prod_{i \in \text{affected}} P(\text{node } i \text{ healthy during healing})
{% end %}

If \\(P(\text{healing stable}) < 0.8\\), reject the healing plan and try alternative (perhaps Option C compression).

**What if path home is contested?**

Drone 23's return route passes through adversarial coverage. Risk of intercept during return.

Solution: Incorporate threat model into path planning. Choose return route that minimizes \\(P(\text{intercept}) \cdot C(\text{loss})\\). Accept longer route if safer.

---

## CONVOY Self-Healing Protocol

Vehicle 4 experiences engine failure during mountain transit. The CONVOY healing protocol differs from RAVEN's due to ground vehicle constraints.

### Failure Assessment

Vehicle 4 broadcasts a health alert: engine failure in limp mode with reduced power, maximum speed limited to 15 km/h against the convoy's 45 km/h target, detection confidence 0.91.

The failure is partial—vehicle can move but cannot maintain convoy speed.

### Option Analysis

**Option 1: Stop convoy, repair in field**
- Estimated repair time: 2-4 hours
- Risk: Stationary convoy vulnerable
- Mission delay: Significant
- Resource cost: Mechanic time, parts

**Option 2: Bypass (leave vehicle 4)**
- Continue with 11 vehicles
- Vehicle 4 waits for recovery team
- Security risk: Isolated vehicle in contested area
- Mission impact: Minor (cargo distributed among remaining)

**Option 3: Tow vehicle 4**
- Vehicle 3 tows vehicle 4
- Convoy speed reduced to 20 km/h
- Mission delay: Moderate
- Risk: Increased mechanical stress on vehicle 3

**Option 4: Redistribute and abandon**
- Transfer critical cargo from vehicle 4 to others
- Secure/destroy vehicle 4
- Continue at full speed
- Loss: One vehicle (significant cost)

### Decision Framework

Model as Markov Decision Process with state-dependent optimal policy:

**State space structure**: \\(S = \mathcal{C} \times \mathcal{D} \times \mathcal{T}\\) where:
- \\(\mathcal{C}\\) = convoy configuration (intact, degraded, towing, stopped)
- \\(\mathcal{D}\\) = distance remaining to objective
- \\(\mathcal{T}\\) = threat environment (permissive, contested, denied)

**Action space**: \\(A = \\{\text{repair, bypass, tow, abandon}\\}\\)

The transition dynamics \\(P(s\' | s, a)\\) encode operational realities: field repair success rates, secondary failure probabilities from towing stress, and recovery likelihood for bypassed assets.

*Example transition matrix* for action "tow" from state "degraded":

| Next State | Probability | Operational Meaning |
|:-----------|:------------|:--------------------|
| towing | 0.75 | Tow successful, convoy proceeds |
| stopped | 0.15 | Tow hookup fails, convoy halts |
| degraded | 0.08 | Vehicle refuses tow, status quo |
| intact | 0.02 | Spontaneous recovery (rare) |

These probabilities are estimated from operational logs and updated via Bayesian learning as the convoy gains experience.

**Reward structure** captures the multi-objective nature:

{% katex(block=true) %}
R(s, a) = w_1 \cdot V_{\text{mission}}(s, a) - w_2 \cdot C_{\text{time}}(s, a) - w_3 \cdot C_{\text{asset}}(s, a) - w_4 \cdot C_{\text{risk}}(s, a)
{% end %}

The weights \\(w_i\\) encode mission priorities—time-critical missions weight \\(w_2\\) heavily; asset-preservation missions weight \\(w_3\\); etc.

**Optimal policy via Bellman recursion**:

{% katex(block=true) %}
V^*(s) = \max_a \left[ R(s, a) + \gamma \sum_{s'} P(s' | s, a) V^*(s') \right]
{% end %}

The optimal policy shows **phase transitions** based on state variables:
- **Distance-dominated regime** (far from objective): Minimize exposure time, therefore prefer towing
- **Time-dominated regime** (tight deadline): Prioritize progress, therefore accept asset loss
- **Asset-dominated regime** (high-value cargo): Preserve assets, therefore accept delays

These phase transitions emerge from the MDP structure, not from hand-coded rules. The optimization framework discovers them automatically.

### Coordination Challenge

Vehicles 1-3 see the situation one way (closer to vehicle 4). Vehicles 5-12 may have different information (further away, may not have received all updates).

Healing protocol ensures consistency:

1. **Broadcast**: Vehicle 4 broadcasts failure to all reachable vehicles
2. **Lead decision**: Convoy lead (vehicle 1) makes healing decision
3. **Propagation**: Decision propagates to all vehicles via gossip
4. **Confirmation**: Each vehicle confirms receipt and readiness
5. **Execution**: Coordinated maneuver on lead's signal

If lead is unreachable:
- Fallback: Nearest cluster lead makes local decision
- Reachable vehicles execute local plan
- Unreachable vehicles hold position until contact restored

---

## OUTPOST Self-Healing

The OUTPOST sensor mesh faces unique healing challenges: remote locations preclude physical intervention, and ultra-low power budgets constrain healing actions.

### Failure Modes and Healing Actions

<style>
#tbl_outpost_healing + table th:first-of-type { width: 20%; }
#tbl_outpost_healing + table th:nth-of-type(2) { width: 25%; }
#tbl_outpost_healing + table th:nth-of-type(3) { width: 30%; }
#tbl_outpost_healing + table th:nth-of-type(4) { width: 25%; }
</style>
<div id="tbl_outpost_healing"></div>

| Failure Mode | Detection | Healing Action | Success Rate |
| :--- | :--- | :--- | :--- |
| Sensor drift | Cross-correlation with neighbors | Recalibration routine | 85% |
| Communication loss | Missing heartbeats | Frequency hop, power increase | 70% |
| Power anomaly | Voltage/current deviation | Load shedding, sleep mode | 90% |
| Software hang | Watchdog timeout | Controller restart | 95% |
| Memory corruption | CRC check failure | Reload from backup | 80% |

### Power-Constrained Healing

OUTPOST healing actions compete with the power budget. Each healing action has an energy cost:

{% katex(block=true) %}
E_{\text{heal}} = P_{\text{action}} \cdot T_{\text{duration}} + E_{\text{communication}}
{% end %}

The healing budget is constrained:

{% katex(block=true) %}
\sum_i E_{\text{heal},i} \leq E_{\text{reserve}} - E_{\text{mission,min}}
{% end %}

Where \\(E_{\text{reserve}}\\) is current battery capacity and \\(E_{\text{mission,min}}\\) is minimum energy required to maintain mission capability.

**Healing action scheduling**: When multiple healing actions are needed, prioritize by utility-per-energy:

{% katex(block=true) %}
\text{Priority}(a) = \frac{V_{\text{restored}}(a) \cdot P_{\text{success}}(a)}{E_{\text{heal}}(a)}
{% end %}

### Mesh Reconfiguration

When a sensor fails beyond repair, the mesh must reconfigure:

{% mermaid() %}
graph TD
    subgraph Active_Sensors["Active Sensors"]
    S1["Sensor 1<br/>(extending coverage)"]
    S2["Sensor 2<br/>(extending coverage)"]
    S4[Sensor 4]
    S5[Sensor 5]
    end
    subgraph Failed["Failed Sensor"]
    S3["Sensor 3<br/>FAILED"]
    end
    subgraph Fusion_Nodes["Fusion Layer"]
    F1[Fusion A]
    F2[Fusion B]
    end

    S1 --> F1
    S2 --> F1
    S3 -.->|"no signal"| F1
    S4 --> F2
    S5 --> F2
    F1 <-->|"coordination"| F2

    S1 -.->|"increased sensitivity"| Gap["Coverage Gap<br/>(S3 zone)"]
    S2 -.->|"increased sensitivity"| Gap

    style S3 fill:#ffcdd2,stroke:#c62828
    style Gap fill:#fff9c4,stroke:#f9a825
    style S1 fill:#c8e6c9
    style S2 fill:#c8e6c9
{% end %}

**Healing protocol for permanent sensor loss**:

1. **Detection**: Neighbor sensors detect missing heartbeats
2. **Confirmation**: Multiple neighbors confirm (avoid false positive)
3. **Reporting**: Fusion node logs loss, estimates coverage gap
4. **Adaptation**: Neighbors adjust sensitivity to partially cover gap
5. **Alerting**: Flag for physical replacement when connectivity allows

**Neighbor coverage extension**:

Sensors adjacent to the failed sensor can increase their effective range through:
- Sensitivity increase (higher gain, more false positives)
- Duty cycle increase (more power consumption)
- Orientation adjustment (if mechanically possible)

The trade-off is quantified:

{% katex(block=true) %}
\text{Coverage}_{\text{extended}} = \text{Coverage}_{\text{original}} + \sum_{j \in \mathcal{N}} \Delta\text{Coverage}_j - \text{Overlap}
{% end %}

Full coverage is rarely achievable—the goal is minimizing the detection gap.

### Fusion Node Failover

If a fusion node fails, its sensor cluster must find an alternative:

**Primary**: Route through alternate fusion node (if reachable)
**Secondary**: Peer-to-peer mesh among sensors, with one sensor acting as temporary aggregator
**Tertiary**: Each sensor operates independently with local decision authority

The failover sequence executes automatically:

{% katex(block=true) %}
\text{FusionState}(t) = \begin{cases}
\text{Primary} & \text{if } \text{Reachable}(F_{\text{primary}}) \\
\text{Secondary} & \text{if } \neg\text{Reachable}(F_{\text{primary}}) \land \text{Reachable}(F_{\text{alt}}) \\
\text{Tertiary} & \text{otherwise}
\end{cases}
{% end %}

Each state has different capability levels and power costs. The system tracks time in each state for capacity planning.

---

## The Limits of Self-Healing

### Damage Beyond Repair Capacity

Some failures cannot be healed autonomously:
- Physical destruction (RAVEN drone collision)
- Critical component failure without redundancy
- Environmental damage (waterlogged OUTPOST sensor)

Self-healing must recognize when to stop trying. The **healing utility function** becomes negative when:

{% katex(block=true) %}
E[\text{value of healing}] < E[\text{cost of healing}]
{% end %}

At this point, [graceful degradation](@/blog/2026-01-15/index.md) takes over. The component is abandoned, and the system adapts to operate without it.

### Failures That Corrupt Healing Logic

If the failure affects the MAPE-K components themselves, healing may not be possible:
- Monitor fails: Can't detect problems
- Analyze fails: Can't interpret observations
- Plan fails: Can't generate solutions
- Execute fails: Can't apply solutions
- Knowledge corrupted: Wrong information drives wrong actions

Defense: Redundant MAPE-K instances. RAVEN maintains simplified healing logic in each drone's flight controller, independent of main processing unit. If main unit fails, flight controller can still execute basic healing (return to base, emergency land).

### Adversary Exploiting Healing Predictability

If healing behavior is predictable, adversary can exploit it:
- Trigger healing to consume resources (denial of service)
- Time attacks for when healing is in progress (vulnerability window)
- Craft failures that healing makes worse (adversarial input)

Mitigations:
- Randomize healing parameters (backoff times, thresholds)
- Rate-limit healing actions
- Detect unusual healing patterns as potential attack

### The Judgment Horizon

When should the system stop attempting autonomous healing and wait for human intervention?

Indicators that human judgment is needed:
- Healing attempts exhausted without resolution
- Multiple conflicting diagnoses with similar confidence
- Potential healing actions cross ethical or mission boundaries
- Situation matches no known healing pattern

At the judgment horizon, the system should:
1. Stabilize in safest configuration
2. Log complete state for later analysis
3. Await human input when connectivity allows
4. Avoid irreversible actions

### Anti-Fragile Learning

Each healing episode generates data:
- What failure was detected?
- What healing action was attempted?
- Did it succeed?
- How long did it take?
- What were the side effects?

This data improves future healing. Healing policies adapt based on observed effectiveness. Actions that consistently fail are deprioritized. Actions that work in specific contexts are preferentially selected.

{% katex(block=true) %}
P_{\text{success}}(a | \text{context}) = \frac{\text{successes of } a \text{ in context}}{\text{attempts of } a \text{ in context}}
{% end %}

Over time, the system's healing effectiveness improves through operational experience—the [anti-fragile property](@/blog/2026-02-12/index.md) that emerges from systematic learning under stress.

---

## Closing: From Healing to Coherence

Self-healing addresses individual component and cluster failures. But what about fleet-wide state when partitioned?

RAVEN healed Drone 23's failure successfully. But consider: during the healing coordination, a partition occurred. The eastern cluster executed healing independently. Now the swarm has two different records of what happened:
- Western cluster: "Drone 23 returned via northern route"
- Eastern cluster: "Drone 23 status unknown, assumed failed"

Both clusters operated correctly given their information. But their states have diverged. When the partition heals, the swarm has inconsistent knowledge about its own history.

This is the **coherence problem**: maintaining consistent fleet-wide state when partition prevents coordination. Self-healing assumes local decisions can be made. Coherence asks: what happens when local decisions conflict?

The [next article on fleet coherence](@/blog/2026-02-05/index.md) develops the engineering principles for maintaining coordinated behavior under partition:
- State divergence detection
- Reconciliation protocols
- Hierarchical decision authority
- Conflict resolution when local decisions are irreconcilable

Drone 23 landed safely at base. The swarm maintained coverage. Self-healing succeeded. But the fleet's shared understanding of that success—the knowledge that enables future decisions—requires coherence mechanisms beyond individual healing.
