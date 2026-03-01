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
series_description = """Traditional distributed systems assume connectivity as the norm and partition as the exception. Edge systems invert this assumption: disconnection is the default operating state, and connectivity is the opportunity to synchronize. This series develops the engineering principles for autonomic architectures—systems that self-measure, self-heal, and self-optimize when human operators cannot intervene. Through tactical scenarios (RAVEN drone swarm, CONVOY ground vehicles, OUTPOST forward base) and commercial deployments (AUTOHAULER mining fleet, GRIDEDGE power distribution, HYPERSCALE data centers, SMARTBLDG building automation), we derive the mathematical foundations and design patterns for systems that thrive under contested connectivity."""
+++

---

## Prerequisites

Two prior results converge here, each answering half of the question this article completes.

From [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md): the {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regimes{% end %} define *when* the system must heal without human oversight. During Intermittent and Denied regimes, there is no operator to call. The capability hierarchy (\\(\mathcal{L}_0\\)–\\(\mathcal{L}_4\\)) defines *what* healing must preserve — at minimum, the survival capability \\(\mathcal{L}_0\\) must be maintained through any failure sequence. An edge system that loses basic function during self-repair has failed at its primary design goal.

From [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md): anomaly detection produces a confidence estimate \\(c \in [0,1]\\) for every observed deviation from nominal behavior. The optimal detection threshold \\(\theta^*\\) calibrates the trade-off between false positives (acting on noise) and missed detections (ignoring real failures). The observability constraint sequence established which health signals remain available as resources shrink.

The logical connection is direct. The self-measurement article answered: *what is the system's current state, and how confident are we?* This article answers: *what should the system do about it?*

The confidence threshold that gates healing actions — act when \\(c > \theta^*(a)\\) — depends on the cost asymmetry between wrong action types. High-severity actions (restarting a fusion node, isolating a cluster) require high confidence before execution. Low-severity actions (increasing gossip rate, clearing a cache) can proceed at lower confidence because reverting them is cheap. This article derives those thresholds formally and establishes the stability conditions under which closed-loop healing converges rather than oscillates.

---

## Overview

Self-healing enables autonomous systems to recover from failures without human intervention. Each concept integrates theory with design consequence:

| Concept | Formal Contribution | Design Consequence |
| :--- | :--- | :--- |
| **MAPE-K Control** | Stability: \\(K \cdot \tau < \pi/2\\) | Reduce controller gain when feedback delayed |
| **Healing Triggers** | \\(\theta^*(a) = C_{FP}/(C_{FP} + C_{FN} + V_{\text{heal}})\\) | Match threshold to action severity |
| **Recovery Ordering** | Topological sort on dependency DAG | Heal foundations before dependents |
| **Cascade Prevention** | Resource quota \\(Q_{\text{heal}} < Q_{\text{total}} - Q_{\text{min}}\\) | Reserve capacity for mission function |
| **MVS** | Greedy \\(O(\ln n)\\)-approximation | Prioritize minimum viable components |

This extends autonomic computing (Kephart & Chess, 2003) and control theory (Astrom & Murray, 2008) for contested edge deployments.

---

## Opening Narrative: {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} Drone Down

The {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm of 47 drones is executing surveillance 15km from base, 40% coverage complete. Drone 23 broadcasts: battery critical (3.21V vs 3.40V threshold), 8 minutes flight time, confidence 0.94. The [self-measurement system](@/blog/2026-01-22/index.md) detected the anomaly correctly—lithium cell imbalance from high-current maneuvers.

Operations center unreachable. Connectivity \\(C(t) < 0.1\\) for 23 minutes. The swarm cannot request guidance and has 8 minutes to decide and execute. Options considered:

- **Continue mission**: Drone 23 flies until exhaustion; crash in contested terrain risks data compromise; 92% mission completion.
- **Return to base**: Drone 23 departs; neighbors expand sectors; reduced eastern coverage; 97% mission completion.
- **Compress formation**: All drones tighten inward; Drone 23 flies shorter path home; total coverage area reduced; 89% mission completion.

The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop must analyze these options, select a healing action, and coordinate execution—all without human intervention. Self-healing means repairing, reconfiguring, and adapting in response to failures without waiting for someone to tell you what to do.

---

## The Autonomic Control Loop

<span id="term-mape-k"></span>
### The MAPE-K Model

<span id="def-8"></span>
**Definition 8** (Autonomic Control Loop). *An {% term(url="#def-8", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}autonomic control loop{% end %} is a tuple \\((M, A, P, E, K)\\) where:*
- *\\(M: \mathcal{O} \rightarrow \mathcal{S}\\) is the monitor function mapping observations to state estimates*
- *\\(A: \mathcal{S} \rightarrow \mathcal{D}\\) is the analyzer mapping state estimates to diagnoses*
- *\\(P: \mathcal{D} \times K \rightarrow \mathcal{A}\\) is the planner selecting healing actions*
- *\\(E: \mathcal{A} \rightarrow \mathcal{O}\\) is the executor applying actions and returning observations*
- *\\(K\\) is the knowledge base encoding system model and healing policies*

In other words, each component of the loop has a defined input and output type: Monitor consumes raw sensor observations and produces state estimates; Analyzer consumes state estimates and produces diagnoses; Planner consumes diagnoses plus knowledge and produces healing actions; Executor consumes actions and produces new observations that feed back into Monitor.

IBM's autonomic computing initiative formalized the control loop for self-managing systems as {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %}: Monitor, Analyze, Plan, Execute, with shared Knowledge.

The diagram below shows how the four phases form a closed feedback cycle, with the Knowledge base feeding into every stage rather than sitting at a single point.

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

Two control approaches apply to healing:

**Proportional Feedback Law**: Observe outcome, compare to target, adjust. Corrects errors but requires feedback delay \\(\tau_{\text{feedback}}\\).

The closed-loop control action \\(U_t\\) is proportional to the error between the desired and observed state, scaled by gain \\(K\\):

{% katex(block=true) %}
U_t = K \cdot (X_{\text{desired}} - X_{\text{observed}})
{% end %}

Where \\(U_t\\) is control action, \\(K\\) is gain, and the difference is the error signal.

**Open-loop control**: Predetermined response without verification. Execute the action based on input, assume it works.

The open-loop action is a fixed function of the current observation only, with no error correction:

{% katex(block=true) %}
U_t = f(X_{\text{observed}})
{% end %}

The action depends only on observed state, not on the outcome of previous actions.

The following table compares the two approaches across four engineering properties that matter most for edge healing.

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

Just as the [contested connectivity framework](@/blog/2026-01-15/index.md) decomposes latency for mission operations, self-healing requires its own latency budget.

The total healing time \\(T_{\text{heal}}\\) is the sum of five sequential phase durations: detection, analysis, planning, coordination, and physical execution.

{% katex(block=true) %}
T_{\text{heal}} = T_{\text{detect}} + T_{\text{analyze}} + T_{\text{plan}} + T_{\text{coordinate}} + T_{\text{execute}}
{% end %}

The table below breaks down realistic time budgets for each phase across the two primary scenarios, and identifies the bottleneck that sets the floor for each value.

<style>
#tbl_latency + table th:first-of-type { width: 20%; }
#tbl_latency + table th:nth-of-type(2) { width: 25%; }
#tbl_latency + table th:nth-of-type(3) { width: 25%; }
#tbl_latency + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_latency"></div>

| Phase | RAVEN Budget | {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} Budget | Limiting Factor |
| :--- | :--- | :--- | :--- |
| Detection | 5-10s | 10-30s | Gossip convergence |
| Analysis | 1-2s | 2-5s | Diagnostic complexity |
| Planning | 2-5s | 5-15s | Option evaluation |
| Coordination | 5-15s | 15-60s | Fleet size, connectivity |
| Execution | 10-60s | 30-300s | Physical action time |
| **Total** | **23-92s** | **62-410s** | Mission tempo |

**Healing Sequence Timeline**:

Complete healing sequence for {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} Drone 23's battery failure—each {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} phase with timing, state transitions, and decision points:

{% mermaid() %}
sequenceDiagram
    autonumber
    participant D as Drone 23
    participant M as Monitor
    participant A as Analyzer
    participant P as Planner
    participant E as Executor
    participant F as Fleet

    Note over D,F: t=0: Anomaly Detected
    rect rgb(200, 230, 201)
        Note right of D: MONITOR PHASE (5-10s)
        D->>M: Battery: 3.21V, dropping 0.02V/min
        D->>M: Current draw: 12.3A (elevated)
        M->>M: Compare to baseline (3.7V nominal)
        M->>A: Anomaly score: 0.94
    end

    rect rgb(187, 222, 251)
        Note right of A: ANALYZE PHASE (1-2s)
        A->>A: Classify: power subsystem failure
        A->>A: Project: 8 minutes to critical (3.0V)
        A->>A: Impact: loss of drone, mission degradation
        A->>P: Diagnosis: battery_critical, TTL=480s
    end

    rect rgb(225, 190, 231)
        Note right of P: PLAN PHASE (2-5s)
        P->>P: Option 1: RTB (safest, 6 min)
        P->>P: Option 2: Nearest landing (3 min)
        P->>P: Option 3: Power reduction (extend 4 min)
        P->>P: Select: Option 3 -> Option 2
        P->>E: Plan: reduce_power, then land_nearest
    end

    Note over D,F: t=15s: Coordination
    rect rgb(255, 243, 224)
        Note right of E: EXECUTE PHASE (10-60s)
        E->>D: Disable: HD camera, ML inference
        D-->>E: Power reduced to 8.1A
        E->>F: Broadcast: Drone 23 emergency landing
        F-->>E: Ack: Coverage reassigned to Drones 21, 25
        E->>D: Navigate to landing zone Delta
        D-->>E: ETA: 2 min 40s
    end

    Note over D,F: t=45s: Healing Complete
    rect rgb(232, 245, 233)
        Note right of M: VERIFY PHASE
        M->>M: Battery stable at 3.18V
        M->>M: Landing confirmed at t=180s
        M->>A: Healing outcome: SUCCESS
    end
{% end %}

**State Transition During Healing**:

The diagram below traces Drone 23's operational state from mission start through healing to either a safe landing or asset loss; read it left-to-right, where each arrow is a triggering event and each note box gives the operational detail for that state.

{% mermaid() %}
stateDiagram-v2
    direction LR

    [*] --> Nominal: Mission Start

    Nominal --> Degraded: Anomaly Detected
    note right of Degraded
        Power subsystem failing
        8 min to critical
    end note

    Degraded --> Stabilizing: Healing Initiated
    note right of Stabilizing
        Non-essential load shed
        Planning emergency landing
    end note

    Stabilizing --> Recovering: Plan Executing
    note right of Recovering
        Navigating to landing zone
        Fleet coverage reassigned
    end note

    Recovering --> Safe: Landing Complete
    note right of Safe
        Drone preserved
        Awaiting retrieval
    end note

    Recovering --> Failed: Healing Failed
    note right of Failed
        Battery exhausted
        Uncontrolled descent
    end note

    Safe --> [*]: Mission Continue (without D23)
    Failed --> [*]: Asset Lost
{% end %}

**Healing Action Selection: Formal Optimization**

The planner selects the optimal action \\(a^*\\) from the action space \\(\mathcal{A}\\) by maximizing expected utility given current system state \\(\Sigma\\) and failure severity \\(\delta\\):

{% katex(block=true) %}
a^* = \arg\max_{a \in \mathcal{A}} \mathbb{E}[U(a \mid \Sigma, \delta)]
{% end %}

The utility \\(U\\) decomposes into three terms — the value of recovery weighted by confidence \\(c\\), the resource cost of the action, and the disruption cost weighted by the probability the diagnosis is wrong:

{% katex(block=true) %}
U(a \mid \Sigma, \delta) = c \cdot V_{\text{recovery}}(a, \delta) - C_{\text{resource}}(a) - (1-c) \cdot C_{\text{disruption}}(a)
{% end %}

with confidence \\(c\\) from the diagnosis. The action must also satisfy three hard constraints — healing must finish before the failure becomes critical (\\(g_1\\)), the action must fit within available resources (\\(g_2\\)), and the action's severity must not exceed the delegated authority of the local node (\\(g_3\\)):

{% katex(block=true) %}
\begin{aligned}
g_1: && T_{\text{heal}}(a) + T_{\text{margin}} &\leq T_{\text{crit}} && \text{(deadline)} \\
g_2: && R(a) &\leq R_{\text{available}}(t) && \text{(resources)} \\
g_3: && \varsigma(a) &\leq \varsigma_{\max}(\mathcal{Q}_{\text{delegated}}) && \text{(authority)}
\end{aligned}
{% end %}

The state transition model captures what happens after action \\(a\\) is executed: the system moves to healthy with probability proportional to both success rate and diagnosis confidence, remains degraded if the action fails, or stays unchanged if the diagnosis was wrong (probability \\(1-c\\)):

{% katex(block=true) %}
\Sigma_{t+1} = \begin{cases}
\Sigma_{\text{healthy}} & \text{prob } p_{\text{success}}(a, \delta) \cdot c \\
\Sigma_{\text{degraded}} & \text{prob } (1 - p_{\text{success}}(a, \delta)) \cdot c \\
\Sigma_t & \text{prob } 1 - c
\end{cases}
{% end %}

The decision tree below encodes the planner's logic for Drone 23: starting from the battery-critical anomaly, each diamond is a yes/no check that gates which action path is taken, and the green Monitor node at the bottom marks the verification step that closes the loop.

{% mermaid() %}
flowchart TD
    START["Anomaly: Battery Critical<br/>TTL = 8 minutes"]

    START --> Q1{"Time to safe<br/>landing < TTL?"}

    Q1 -->|"Yes (6 min < 8 min)"| Q2{"Mission impact<br/>of landing?"}
    Q1 -->|"No"| EMERGENCY["EMERGENCY<br/>Immediate autorotation"]

    Q2 -->|"Low"| LAND["Plan: Land at nearest<br/>safe zone"]
    Q2 -->|"High"| Q3{"Can extend TTL?"}

    Q3 -->|"Yes"| EXTEND["Plan: Reduce power<br/>+ delayed landing"]
    Q3 -->|"No"| LAND

    LAND --> EXEC1["Execute: Navigate<br/>+ Notify fleet"]
    EXTEND --> Q4{"Extended TTL<br/>sufficient?"}

    Q4 -->|"Yes"| EXEC2["Execute: Power reduction<br/>+ Navigate"]
    Q4 -->|"No"| LAND

    EXEC1 --> MONITOR["Monitor: Verify<br/>healing success"]
    EXEC2 --> MONITOR

    EMERGENCY --> MONITOR

    style START fill:#ffcdd2,stroke:#c62828
    style EMERGENCY fill:#ffcdd2,stroke:#c62828
    style MONITOR fill:#c8e6c9,stroke:#388e3c
    style LAND fill:#fff9c4,stroke:#f9a825
    style EXTEND fill:#e3f2fd,stroke:#1976d2
{% end %}

<span id="prop-8"></span>
**Proposition 8** (Healing Deadline). *For a failure with time-to-criticality \\(T_{\text{crit}}\\), healing must complete within margin:*

{% katex(block=true) %}
T_{\text{heal}} < T_{\text{crit}} - T_{\text{margin}}
{% end %}

*where \\(T_{\text{margin}}\\) accounts for execution variance and verification time. If this inequality cannot be satisfied, the healing action must be escalated to a faster (but possibly more costly) intervention.*

In other words, healing must finish early enough to leave a safety buffer before the failure becomes irreversible; if no action fits within that window, the system must escalate to a more disruptive but faster intervention.

For Drone 23, with 8 minutes to battery exhaustion and a 60-second landing margin, the healing window comfortably exceeds the ~45-second healing sequence.

When the healing deadline cannot be met, the system must either:
1. Execute partial healing (stabilize but not fully recover)
2. Skip to emergency protocols (bypass normal {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %})
3. Accept degraded state (capability reduction)

<span id="prop-9"></span>
**Proposition 9** (Closed-Loop Healing Stability). *For an {% term(url="#def-8", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}autonomic control loop{% end %} with feedback delay \\(\tau\\) and controller gain \\(K\\), stability requires the gain-delay product to satisfy:*

{% katex(block=true) %}
K \cdot \tau < \frac{\pi}{2}
{% end %}

*This bound follows from the Nyquist stability criterion: feedback delay \\(\tau\\) introduces phase lag \\(\omega\tau\\) at frequency \\(\omega\\). At the gain crossover frequency \\(\omega_c = K\\), the phase margin becomes \\(\pi/2 - K\tau\\), which must remain positive for stability.*

*Proof*: For a proportional controller with delay, the open-loop transfer function is \\(G(s) = K e^{-s\tau} / s\\). The phase at crossover is \\(-\pi/2 - \omega_c \tau\\). Phase margin \\(\phi_m = \pi - (\pi/2 + K\tau) > 0\\) requires \\(K\tau < \pi/2\\).

**Linear approximation warning**: This derivation applies the Nyquist criterion for a continuous-time, linear, time-invariant plant with pure delay \\(\tau\\). The actual MAPE-K loop is none of these: it executes on a discrete timer (period \\(T_{\text{tick}}\\)), its actions are step functions (restart a process, reroute traffic — not proportional corrections), and multiple healing loops may run concurrently on shared hardware. \\(K \cdot \tau < \pi/2\\) is a necessary heuristic for a single, isolated healing loop — not a sufficient stability condition for the full system. For \\(N_{\text{concurrent}}\\) simultaneous healing loops sharing one CPU at \\(u\\%\\) utilization, the effective feedback delay grows to \\(\tau_{\text{eff}} \approx \tau/(1-u)\\), and the effective aggregate gain \\(K_{\text{eff}} \approx K \cdot N_{\text{concurrent}}\\); the stability condition becomes \\(K_{\text{eff}} \cdot \tau_{\text{eff}} < \pi/2\\). Verify concurrent-failure stability through discrete-event simulation before deploying multi-target healing (e.g., simultaneous motor compensation + sensor fallback + communication rerouting on RAVEN Drone 23).

In other words, the slower the feedback (larger \\(\tau\\)), the more gently the controller must react (smaller \\(K\\)); aggressive corrections in a slow-feedback environment cause the system to oscillate rather than converge.

**Corollary 4**. *Increased feedback delay (larger \\(\tau\\)) requires more conservative controller gains, trading response speed for stability.*

**Stochastic extension: when \\(\tau\\) is not constant**

Prop 9 assumes a fixed delay \\(\tau\\). In tactical environments \\(\tau\\) is a stochastic process; its distribution governs whether any finite gain \\(K\\) can maintain stability.

<span id="def-38"></span>
**Definition 38** (Stochastic Transport Delay Model). *Let \\(\tau(t) \geq 0\\) denote the one-way transport delay at time \\(t\\), distributed conditionally on connectivity regime \\(C\\).*

**Connected (\\(C = 1.0\\))**: \\(\tau \sim \mathrm{LogNormal}(\mu_c, \sigma_c^2)\\) with \\(\sigma_c\\) much smaller than \\(\mu_c\\) (coefficient of variation approximately 10%). Additive propagation and queuing delays compose multiplicatively across many independent hops, producing a log-normal tail.

**Degraded (\\(C = 0.5\\))**: \\(\tau \sim \mathrm{LogNormal}(\mu_d, \sigma_d^2)\\) with \\(\sigma_d \approx \mu_d\\) (coefficient of variation approximately 100%). Retransmission bursts and partial-outage rerouting drive variance to the same order as the mean.

**Contested (\\(C = 0.0\\))**: \\(\tau \sim \mathrm{Pareto}(\tau_{\min}, \alpha)\\) with \\(\alpha \in (1, 2)\\):

{% katex(block=true) %}
f_\tau(t) = \frac{\alpha \, \tau_{\min}^\alpha}{t^{\alpha+1}}, \quad t \geq \tau_{\min}
{% end %}

p-th percentile: \\(\tau_p = \tau_{\min} \cdot (1-p)^{-1/\alpha}\\). Mean: \\(E[\tau] = \alpha \tau_{\min} / (\alpha - 1)\\) for \\(\alpha > 1\\). Variance: **undefined** (infinite) for \\(\alpha \leq 2\\).

The Pareto model is natural under adversarial conditions: an adversary who controls jamming duration selects from a strategic distribution, producing power-law delay tails. Shape parameter \\(\alpha\\) encodes adversarial capability — RAVEN contested-link measurements yield \\(\alpha \approx 1.6\\), giving \\(E[\tau] \approx 2.7\tau_{\min}\\) with unbounded variance.

**Critical consequence**: With \\(\mathrm{Var}[\tau] = \infty\\) in the Contested regime, the estimation error of any EWMA or Kalman filter tracking \\(\tau\\) also has infinite variance, regardless of filter design. Mean-plus-\\(k\\)-sigma stability margins are meaningless; all quantitative bounds must use percentiles.

<span id="prop-39"></span>
**Proposition 39** (Robust Gain Scheduling under Stochastic Delay). *Let \\(\delta \in (0,1)\\) be the acceptable per-cycle instability probability. The regime-dependent robust gain bound is:*

{% katex(block=true) %}
K_{\mathrm{robust}}(C, \delta) \leq \frac{\pi}{2 \cdot \tau_{1-\delta}(C)}
{% end %}

*where \\(\tau_{1-\delta}(C)\\) is the \\((1-\delta)\\)-th percentile of \\(F_\tau(\cdot \mid C)\\):*

| Regime | Distribution | \\(\tau_{1-\delta}\\) | Permissible actions |
| :--- | :--- | :--- | :--- |
| Connected (C=1.0) | LogNormal | \\(e^{\mu_c + z_{1-\delta} \sigma_c}\\) | All severities |
| Degraded (C=0.5) | LogNormal | \\(e^{\mu_d + z_{1-\delta} \sigma_d}\\) | Severity 1 and 2 only |
| Contested (C=0.0) | Pareto | \\(\tau_{\min} \cdot \delta^{-1/\alpha}\\) | Severity 1 local only |

For RAVEN (\\(\tau_{\min} = 0.2\\)s, \\(\alpha = 1.6\\), \\(\delta = 0.01\\)):

{% katex(block=true) %}
\tau_{0.99} = 0.2 \times (0.01)^{-1/1.6} = 0.2 \times 100^{0.625} \approx 3.16\text{ s}
{% end %}

This gives \\(K_{\mathrm{robust}} \leq \pi / (2 \times 3.16) \approx 0.497\\)/s. However, \\(\tau_{1-\delta}\\) scales as \\(\delta^{-0.625}\\): driving \\(\delta \to 0.001\\) pushes \\(\tau_{0.999} \approx 25.1\\)s and \\(K_{\mathrm{robust}} \leq 0.063\\)/s. For any operationally meaningful \\(\delta\\), no finite gain satisfies the stability condition for remote actions in Contested conditions — all Severity 2 and above actions must be suppressed.

*Proof*: From Prop 9, stability requires \\(K\tau < \pi/2\\). Under stochastic \\(\tau\\): \\(P(\text{stable}) = F_\tau(\pi/(2K) \mid C)\\). Setting this to \\(1-\delta\\) inverts to \\(K \leq \pi/(2\tau_{1-\delta})\\). For \\(\alpha \leq 2\\), \\(\tau_{1-\delta} = \tau_{\min}\delta^{-1/\alpha}\\) grows without bound as \\(\delta \to 0\\), so no bounded \\(K > 0\\) achieves arbitrary confidence in the Contested regime. \\(\square\\)

<span id="def-39"></span>
**Definition 39** (MAPE-K Predictive Dead-Band). *Let \\(A\\) be a healing action recommended at \\(t_{\mathrm{sense}}\\). The Execute phase suppresses \\(A\\) if any of the following hold at \\(t_{\mathrm{exec}}\\):*

**(a) Delay invalidity** — estimated transport delay exceeds the Stale Data Threshold (Prop 40):

{% katex(block=true) %}
\hat{\tau}(t_{\mathrm{exec}}) > T_{\mathrm{stale}}
{% end %}

**(b) Self-correction** — probability the target remains in failure state has fallen below \\(p_{\mathrm{suppress}}\\):

{% katex(block=true) %}
e^{-\mu_h \cdot (t_{\mathrm{exec}} - t_{\mathrm{sense}})} < p_{\mathrm{suppress}}
{% end %}

equivalently \\(t_{\mathrm{exec}} - t_{\mathrm{sense}} > -\ln(p_{\mathrm{suppress}}) / \mu_h\\), where \\(\mu_h\\) is the autonomous self-healing rate of the target component.

**(c) Gain violation** — current delay estimate violates the stability condition from Prop 39:

{% katex(block=true) %}
K_{\mathrm{current}} \cdot \hat{\tau}(t_{\mathrm{exec}}) > \pi/2
{% end %}

All three conditions suppress action independently. Condition (b) is the MAPE-K analog of the Smith Predictor's inner model path: it estimates whether the system will have self-corrected before \\(A\\) arrives, suppressing \\(A\\) if so. In the Contested regime, the prediction error \\(\varepsilon(t) = \tau(t) - \hat{\tau}(t)\\) carries the same Pareto tail as \\(\tau(t)\\) regardless of predictor design — the Smith Predictor reduces the effective delay in the characteristic equation from \\(\tau(t)\\) to \\(\varepsilon(t)\\), but both are unbounded in variance. Condition (a) remains the primary suppressor. Condition (b) also prevents the anti-windup oscillation that Prop 29 bounds: acting on a stale recommendation after the target has already self-healed is precisely the over-correction scenario Def 28 blocks.

<span id="prop-40"></span>
**Proposition 40** (Stale Data Threshold). *Let \\(\lambda_{\mathrm{total}} = \mu_h + \mu_f + \mu_c\\) be the total state-change rate (healing, failure, and coordination events); \\(p_{\mathrm{stale}} \in (0,1)\\) the maximum acceptable probability that state has changed since \\(t_{\mathrm{sense}}\\); \\(T_{\mathrm{heal}}\\) the healing deadline from Prop 8; and \\(k \geq 1\\) a deadline safety factor. The Stale Data Threshold is:*

{% katex(block=true) %}
T_{\mathrm{stale}} = \min\!\left(\frac{T_{\mathrm{heal}}}{k},\ \frac{-\ln(1 - p_{\mathrm{stale}})}{\lambda_{\mathrm{total}}}\right)
{% end %}

*A node must re-run Sense and Analyze before executing if \\(t_{\mathrm{exec}} - t_{\mathrm{sense}} > T_{\mathrm{stale}}\\).*

*Proof*: State transitions form a Poisson process at rate \\(\lambda_{\mathrm{total}}\\). The probability of at least one transition in \\([t_{\mathrm{sense}}, t_{\mathrm{exec}}]\\) is \\(1 - e^{-\lambda_{\mathrm{total}} \cdot \Delta t}\\). Setting this equal to \\(p_{\mathrm{stale}}\\) and solving for \\(\Delta t\\) gives the second term. The constraint \\(T_{\mathrm{heal}}/k\\) ensures timely execution within the healing deadline if re-sensing is infeasible. \\(\square\\)

**Contested regime — feasibility window**: In \\(C = 0\\), coordination is absent (\\(\mu_c \approx 0\\)), so \\(\lambda_{\mathrm{total}} \approx \mu_f\\). Simultaneously, Prop 39 requires \\(\tau < T_{\mathrm{stale}}\\) with probability \\(1 - \delta\\), imposing a lower bound from the Pareto quantile:

{% katex(block=true) %}
T_{\mathrm{stale}} \geq \tau_{\min} \cdot \delta^{-1/\alpha}
{% end %}

For RAVEN (\\(\tau_{\min} = 0.2\\)s, \\(\alpha = 1.6\\), \\(\delta = 0.01\\), \\(\mu_f = 0.02\\)/s, \\(p_{\mathrm{stale}} = 0.20\\)):

- **Upper bound** (state-change): \\(T_{\mathrm{stale}} \leq -\ln(0.80)/0.02 \approx 11.2\\) s
- **Lower bound** (transport): \\(T_{\mathrm{stale}} \geq 3.16\\) s

The feasibility window for remote healing actions in Contested RAVEN is \\([3.16, 11.2]\\) s. Below 3.16 s the action arrives too late with probability above 1%; after 11.2 s the system state has changed with probability above 20%. Outside this window all Severity 2 and above actions are suppressed; only Severity 1 local actions remain valid. In the Degraded regime (\\(\mu_d = 0.8\\)s, \\(\sigma_d = 0.8\\)s): \\(\tau_{0.99} = e^{0.8 + 2.33 \times 0.8} \approx 14.4\\)s, which already exceeds the upper bound — the feasibility window collapses, signaling that remote actions are inadvisable even at Degraded connectivity during high-failure-rate episodes.

### Adaptive Gain Scheduling

The stability condition \\(K \cdot \tau < \pi/2\\) suggests a key insight: as feedback delay \\(\tau\\) varies with {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}, the controller gain \\(K\\) should adapt accordingly.

**Gain scheduling by {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}**:

Define regime-specific gains that maintain stability margins across all operating conditions:

{% katex(block=true) %}
K_{\text{regime}} = \frac{\phi_{\text{target}}}{\tau_{\text{regime}}}
{% end %}

where \\(\phi_{\text{target}} \approx \pi/4\\) provides adequate stability margin (phase margin of \\(45^\circ\\)).

The table below translates this formula into concrete gain values for each {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}, with the Healing Response column describing the behavioral consequence of operating at that gain.

| Regime | Typical \\(\tau\\) | Controller Gain \\(K\\) | Healing Response |
|:-------|:-------------------|:------------------------|:-----------------|
| Full | 2-5s | 0.15-0.40 | Aggressive corrections; fast convergence to target state |
| Degraded | 10-30s | 0.025-0.08 | Moderate corrections; stable but slower to converge |
| Intermittent | 30-120s | 0.007-0.025 | Conservative corrections; accepts slow convergence to avoid oscillation |
| Denied | \\(\infty\\) (timeout) | 0.005 | Minimal corrections; reverts to open-loop predetermined responses |

**Smooth gain transitions**:

Abrupt gain changes can destabilize the control loop. The exponential smoothing formula below blends the new target gain with the previous gain using mixing coefficient \\(\alpha \approx 0.1\\), so that each timestep moves only a small fraction of the way toward the target.

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

Rather than waiting for a regime transition to trigger a gain change, the controller linearly extrapolates the current feedback delay trend to predict the delay \\(\hat{\tau}\\) at lookahead time \\(\Delta\\) and pre-adjusts the gain before the delay actually increases.

{% katex(block=true) %}
\hat{\tau}(t + \Delta) = \tau(t) + \frac{d\tau}{dt} \cdot \Delta
{% end %}

If predicted delay exceeds current regime threshold, preemptively reduce gain before connectivity degrades.

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} example**: During mountain transit, connectivity degradation is predictable from terrain maps. The healing controller reduces gain 30 seconds before entering known degraded zones, preventing oscillatory healing behavior when feedback delays suddenly increase.

### The Watchdog Protocol: Layer-0 Hardware Safety

Proposition 9 guarantees closed-loop stability *when the MAPE-K software loop executes correctly*. It provides no guarantee when the loop itself fails: the Monitor thread deadlocks waiting for a gossip response, the Planner enters an infinite loop over a cyclic dependency graph, or the Executor hangs mid-action after a kernel panic. In these cases, the autonomic software that is supposed to heal the system has itself become the patient — with no higher-level authority to call.

The engineering response is a **hardware watchdog timer (WDT)**: a hardware counter that fires a reset interrupt unless software resets it before expiry. The MAPE-K loop "pets" the watchdog at the end of each successful Execute phase. If the loop hangs, the counter expires, the interrupt fires, and control transfers to a pre-certified bypass program that operates entirely without MAPE-K software involvement.

<span id="def-26"></span>
**Definition 26** (Software Watchdog Timer). *A watchdog protocol is a tuple \\(W = (T_0, T_1, k, \mathbf{B}, \mathcal{R})\\) with three concentric monitoring layers:*

- *Layer 0 (hardware WDT): fires bypass action \\(B_0\\) if the MAPE-K thread does not write a heartbeat within \\(T_0\\) seconds. \\(T_0\\) must satisfy \\(T_0 \leq T_{\text{cycle}}\\) (minimum MAPE-K cycle time) to detect hangs within one loop iteration.*
- *Layer 1 (software watchdog): a dedicated watchdog thread checks MAPE-K liveness every \\(T_1\\) seconds and triggers restart \\(B_1\\) after \\(k\\) consecutive missed heartbeats.*
- *Layer 2 (meta-loop): a minimal monitoring process checks that Layer 1 itself is alive; escalates to \\(B_0\\) if Layer 1 fails.*

*\\(\mathbf{B} = (B_0, B_1)\\) is the ordered bypass action pair (\\(B_1\\) attempted first; \\(B_0\\) on escalation). \\(\mathcal{R}\\) is the restoration predicate — the conditions under which the MAPE-K loop may resume control after bypass activation.*

**Layer separation principle**: \\(B_0\\) must be implementable with no component at hardware-interrupt level or above — no OS calls, no shared memory locks, no MAPE-K module dependencies. Each layer must be strictly simpler than the one it monitors.

{% mermaid() %}
graph TD
    MAPEK["MAPE-K Software Loop<br/>(heartbeat each cycle)"]
    L1["Layer 1: Software Watchdog<br/>monitors MAPE-K liveness<br/>every T1 seconds"]
    L0["Layer 0: Hardware WDT<br/>fires if no heartbeat<br/>within T0 seconds"]
    B1["Bypass B1<br/>Restart MAPE-K thread<br/>preserve state snapshot"]
    B0["Bypass B0<br/>Execute safe-state action<br/>no OS involvement"]
    RESTORE["Restoration check R<br/>resume MAPE-K?"]

    MAPEK -->|"heartbeat"| L0
    MAPEK -->|"heartbeat"| L1
    L1 -->|"k misses"| B1
    L0 -->|"T0 expired"| B0
    B1 -->|"restart ok"| MAPEK
    B1 -->|"restart fails"| B0
    B0 --> RESTORE
    RESTORE -->|"R satisfied"| MAPEK
    RESTORE -->|"not satisfied"| B0

    style B0 fill:#ffcdd2,stroke:#c62828
    style B1 fill:#fff3e0,stroke:#f57c00
    style MAPEK fill:#c8e6c9,stroke:#388e3c
    style RESTORE fill:#e3f2fd,stroke:#1976d2
{% end %}

<span id="prop-27"></span>
**Proposition 27** (Watchdog Coverage Condition). *Let \\(\lambda_{\text{loop}}\\) be the MAPE-K loop failure rate (events per unit time). With Layer-0 hardware WDT period \\(T_0\\), the expected unprotected exposure time per failure event is bounded:*

{% katex(block=true) %}
\mathbb{E}[T_{\text{unprotected}}] \leq T_0
{% end %}

*Without a watchdog, expected unprotected time is \\(T_{\text{human detect}}\\). The watchdog improvement factor is:*

{% katex(block=true) %}
\text{MTTU gain} = \frac{T_{\text{human detect}}}{T_0}
{% end %}

*Proof*: A hang at time \\(t\\) is detected by the next WDT expiry at time \\(t + T_0\\) at the latest. The unprotected window \\([t,\, t + T_0]\\) is bounded by \\(T_0\\). \\(\square\\)

**Restoration condition \\(\mathcal{R}\\)**: The bypass state is not permanent. The MAPE-K loop may resume when: (1) all \\(\mathcal{L}_0\\) capabilities are independently verified stable, (2) the condition causing the hang is no longer present, and (3) a dry-run MAPE-K cycle completes successfully with no actions executed. The dry-run prevents re-entry into a loop that will immediately hang again.

**Critical design constraint**: All healing actions must be **idempotent and resumable**. If the WDT fires mid-action, re-executing the action from scratch must produce the same outcome as completing the interrupted execution. Non-idempotent actions (e.g., "append to counter") require transaction semantics before they can be managed by a watchdog-protected loop.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration**: \\(T_0 = 100\,\text{ms}\\) (maximum tolerable period before attitude control degrades), \\(T_1 = 1\,\text{s}\\), \\(k = 3\\). Bypass \\(B_0\\): maintain current heading, throttle, and altitude in attitude-hold mode. MTTU gain: \\(T_{\text{human detect}} \approx 300\,\text{s}\\) vs. \\(T_0 = 0.1\,\text{s}\\) yields \\(3000\times\\) improvement.

**{% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} calibration**: \\(T_0 = 30\,\text{s}\\) (Kubernetes liveness probe as Layer-0), \\(T_1 = 5\,\text{s}\\), \\(k = 2\\). Bypass \\(B_0\\): stop accepting new requests, drain in-flight transactions, hold persistence layer state steady. The bypass action must never forcibly terminate the database layer regardless of MAPE-K state — data integrity takes precedence over healing speed.

<span id="scenario-hyperscale"></span>
### Commercial Application: {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} Data Center Self-Healing

{% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} operates edge data centers serving low-latency requirements. When central orchestration becomes unreachable—partition, DDoS, or maintenance—each site must heal autonomously. Sites contain compute nodes, storage, network infrastructure, and microservices with complex dependency graphs.

**The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} implementation for {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} edge sites**:

The diagram expands the abstract {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop into concrete {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} components, showing three parallel monitor sources feeding a three-stage analysis pipeline before reaching execution — note how the Knowledge base feeds into Analyze and Plan but not Execute directly.

{% mermaid() %}
graph TD
    subgraph "Monitor Layer"
        M1["Metrics Collector<br/>Node health, latency<br/>Every 5s"]
        M2["Log Aggregator<br/>Error patterns<br/>Streaming"]
        M3["Synthetic Probes<br/>End-to-end health<br/>Every 15s"]
    end

    subgraph "Analyze Layer"
        A1["Anomaly Detector<br/>Statistical analysis"]
        A2["Dependency Mapper<br/>Runtime discovery"]
        A3["Impact Assessor<br/>Blast radius calc"]
    end

    subgraph "Plan Layer"
        P1["Action Generator<br/>Candidate healing ops"]
        P2["Risk Evaluator<br/>Side effect analysis"]
        P3["Coordinator<br/>Multi-action sequencing"]
    end

    subgraph "Execute Layer"
        E1["Orchestrator<br/>Container/VM control"]
        E2["Network Controller<br/>Route, firewall"]
        E3["Load Balancer<br/>Traffic steering"]
    end

    subgraph "Knowledge Base"
        K1["Service Catalog<br/>Dependencies, SLOs"]
        K2["Healing History<br/>What worked before"]
        K3["Current State<br/>Cluster snapshot"]
    end

    M1 --> A1
    M2 --> A1
    M3 --> A1
    A1 --> A2
    A2 --> A3
    A3 --> P1
    P1 --> P2
    P2 --> P3
    P3 --> E1
    P3 --> E2
    P3 --> E3
    E1 -->|"feedback"| M1
    K1 -.-> A2
    K2 -.-> P1
    K3 -.-> A1

    style K1 fill:#fff9c4,stroke:#f9a825
    style K2 fill:#fff9c4,stroke:#f9a825
    style K3 fill:#fff9c4,stroke:#f9a825
{% end %}

**Healing latency budget for {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %}**:

| Phase | Budget | Limiting Factor |
| :--- | ---: | :--- |
| Detection | 15-30s | Metrics collection interval + anomaly threshold |
| Analysis | 5-10s | Dependency graph traversal, impact calculation |
| Planning | 2-5s | Action enumeration, risk scoring |
| Coordination | 10-30s | Multi-service sequencing, pre-flight checks |
| Execution | 30-180s | Container restart, health check convergence |
| **Total** | **62-255s** | SLO: 95% of incidents resolved in <5 minutes |

**Dependency-aware restart sequence**: When the payment microservice fails, {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %}'s analyzer discovers the dependency chain. The diagram below shows the runtime dependencies read left-to-right: arrows point from caller to dependency, the red node is the failed service, and the orange nodes are downstream services affected by the failure.

{% mermaid() %}
graph LR
    LB["Load Balancer"] --> API["API Gateway"]
    API --> AUTH["Auth Service"]
    API --> PAY["Payment Service<br/>(FAILED)"]
    PAY --> DB["Payment DB"]
    PAY --> QUEUE["Message Queue"]
    PAY --> FRAUD["Fraud Check"]
    FRAUD --> ML["ML Scoring"]

    style PAY fill:#ffcdd2,stroke:#c62828
    style FRAUD fill:#fff3e0,stroke:#f57c00
    style ML fill:#fff3e0,stroke:#f57c00
{% end %}

The healing sequence respects dependencies:
1. Verify Payment DB is healthy (no restart needed if healthy)
2. Verify Message Queue is accepting connections
3. Restart Payment Service with fresh state
4. Wait for health check (HTTP 200 on /healthz)
5. Re-enable traffic via Load Balancer
6. Verify end-to-end transaction success via synthetic probe

**Cascade prevention in practice**: During a storage node failure, {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} caps the number of simultaneously restarting nodes to one-third of the currently healthy nodes, ensuring at least two-thirds of the cluster remains serving traffic at any moment while healing proceeds.

{% katex(block=true) %}
\text{Max concurrent restarts} = \max\left(1, \left\lfloor \frac{n_{\text{healthy}}}{3} \right\rfloor\right)
{% end %}

With 28 storage nodes and 1 failed, maximum concurrent restarts = 9. This ensures at least 18 nodes remain serving traffic during any healing operation.

### Game-Theoretic Extension: Healing Resource Congestion

When multiple {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loops coexist — one per monitored subsystem — each loop solves its healing action optimization independently. Their resource claims compete for shared capacity (CPU, bandwidth, power), forming a **congestion game**.

**Congestion game**: Each {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop \\(i\\) selects a healing action \\(a_i \in \mathcal{A}_i\\) requiring resource vector \\(\mathbf{r}(a_i)\\). The cost of action \\(a_i\\) increases with the number of loops simultaneously using the same resources (congestion level \\(n_r\\) on resource \\(r\\)).

By Rosenthal's theorem (1973), congestion games always admit a pure Nash equilibrium, which minimizes the potential function \\(\Phi(\mathbf{a})\\): the sum over all resources \\(r\\) of the cumulative marginal costs incurred as each successive loop claims that resource, where \\(n_r(\mathbf{a})\\) is the number of loops simultaneously using resource \\(r\\) under action profile \\(\mathbf{a}\\).

{% katex(block=true) %}
\Phi(\mathbf{a}) = \sum_{r \in R} \sum_{k=1}^{n_r(\mathbf{a})} c_r(k)
{% end %}
where \\(c_r(k)\\) is the marginal cost of resource \\(r\\) at congestion level \\(k\\).

**Coordination protocol**: Each {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop selects healing actions to minimize \\(\Phi\\) (best-response descent) respecting the aggregate resource constraint \\(Q_{\text{heal}} < Q_{\text{total}} - Q_{\text{min}}\\). The healing coordination game admits a pure Nash equilibrium (Rosenthal 1973). Best-response dynamics converge in potential games, but MAPE-K healing uses gradient-based updates rather than pure best-response; convergence to Nash should be verified empirically for each deployment. In practice, this means a shared resource declaration table: loops register resource requirements and receive grants only when the current allocation remains feasible.

**Practical implication**: Replace the heuristic "max concurrent restarts = \\(\lfloor n_{\text{healthy}}/3 \rfloor\\)" with a congestion game coordination layer. When multiple failures occur simultaneously ({% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} jamming causes multi-component failures), loops negotiate resource grants through potential-function minimization rather than competing independently. This generalizes to heterogeneous resource requirements without per-scenario tuning.

### Resource Priority Matrix: Deterministic Conflict Resolution

The congestion game converges to Nash equilibrium via iterative best-response dynamics — but convergence takes multiple coordination rounds. This is too slow when two actions claim the same CPU simultaneously and combined demand exceeds supply. A deterministic preemption layer sits *above* the congestion game: when resource claims conflict, the priority matrix resolves the contest in \\(O(1)\\) time without coordination overhead.

<span id="def-27"></span>
**Definition 27** (Resource Priority Matrix). *Given resource set \\(\mathcal{R} = \\{r_1, \ldots, r_m\\}\\) and healing action set \\(\mathcal{A} = \\{a_1, \ldots, a_n\\}\\), the Resource Priority Matrix \\(\mathbf{P} \in [0,1]^{n \times m}\\) assigns priority weight \\(P_{ij}\\) to action \\(a_i\\)'s claim on resource \\(r_j\\). When actions \\(a_i\\) and \\(a_k\\) both claim resource \\(r_j\\) with demands \\(d_i, d_k\\) such that \\(d_i + d_k > Q_j\\) (available capacity):*

{% katex(block=true) %}
\text{alloc}(a_i, r_j) = \begin{cases}
\min\!\left(d_i,\; Q_j - d_k\right) & P_{ij} > P_{kj} \quad \text{(preempt)} \\
d_i \cdot Q_j / (d_i + d_k) & P_{ij} = P_{kj} \quad \text{(share proportionally)} \\
\max\!\left(0,\; Q_j - d_k\right) & P_{ij} < P_{kj} \quad \text{(yield)}
\end{cases}
{% end %}

*Priority weights derive from the lexicographic objective hierarchy — Survival \\(\succ\\) Autonomy \\(\succ\\) Coherence \\(\succ\\) Anti-fragility — with the healing action's protected capability tier determining its row weight:*

{% katex(block=true) %}
P_{ij} = \begin{cases}
1.0 & a_i \text{ protects } \mathcal{L}_0 \text{ (survival: thermal, power, structural)} \\
0.8 & a_i \text{ protects } \mathcal{L}_1\text{--}\mathcal{L}_2 \text{ (autonomy)} \\
0.5 & a_i \text{ protects } \mathcal{L}_3 \text{ (coherence)} \\
0.3 & a_i \text{ protects } \mathcal{L}_4 \text{ (anti-fragility)}
\end{cases}
{% end %}

**Thermal vs. throughput conflict** (the motivating case): thermal emergency cooling protects hardware survival (\\(\mathcal{L}_0\\), \\(P = 1.0\\)); throughput optimization serves mission coherence (\\(\mathcal{L}_3\\), \\(P = 0.5\\)). When both demand the same CPU cores, cooling preempts throughput instantly and deterministically — no negotiation round required.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} CPU priority matrix** (representative subset):

| Healing action | Protected tier | CPU priority | Preempts |
| :--- | :--- | :--- | :--- |
| Battery emergency land | \\(\mathcal{L}_0\\) | 1.0 | All lower tiers |
| Thermal throttle | \\(\mathcal{L}_0\\) | 1.0 | All lower tiers |
| Formation rebalance | \\(\mathcal{L}_2\\) | 0.8 | Coherence, anti-fragility |
| Gossip rate increase | \\(\mathcal{L}_3\\) | 0.5 | Anti-fragility only |
| Model weight update | \\(\mathcal{L}_4\\) | 0.3 | None (yields to all) |

<span id="prop-28"></span>
**Proposition 28** (Priority Preemption Deadline Bound). *Under strict priority preemption with the Resource Priority Matrix, action \\(a_i\\) misses its healing deadline \\(T_{\text{dead}}(a_i)\\) only if the total CPU time consumed by strictly higher-priority actions during \\(a_i\\)'s execution window exceeds available slack \\(T_{\text{dead}}(a_i) - T_{\text{exec}}(a_i)\\):*

{% katex(block=true) %}
P(\text{miss deadline}_{a_i}) \leq P\!\left(\sum_{\substack{a_k:\, P_{kj} > P_{ij}}} T_{\text{exec}}(a_k) > T_{\text{dead}}(a_i) - T_{\text{exec}}(a_i)\right)
{% end %}

*For {% katex() %}\mathcal{L}_0{% end %} - tier actions (\\(P_{ij} = 1.0\\)): nothing preempts them, so \\(P(\text{miss deadline}) = 0\\) under any resource contention. For throughput optimization (\\(P_{ij} = 0.5\\)): miss probability is bounded by the probability that thermal events last longer than the throughput slack.*

*Proof*: Under strict preemption, a tier-\\(P_{ij}\\) action holds the resource continuously once granted and is interrupted only by a strictly higher-priority preemptor. Worst-case blocking equals the sum of all higher-priority execution times within the same window. Deadline miss requires this sum to exceed available slack. \\(\square\\)

**Anti-starvation aging**: Low-tier actions (\\(P_{ij} = 0.3\\)) could be indefinitely starved if higher-priority actions arrive continuously. Priority is elevated linearly with queue age to bound maximum wait time:

{% katex(block=true) %}
P_{ij}(t) = \min\!\left(1.0,\; P_{ij}^{\text{base}} + \alpha_{\text{age}} \cdot \frac{t - t_{\text{queued}}}{T_{\text{age}}}\right)
{% end %}

where \\(\alpha_{\text{age}} \leq 0.5\\) caps maximum elevation from aging, and \\(T_{\text{age}}\\) is the maximum acceptable wait time for any tier.

**Connection to congestion game**: The Resource Priority Matrix is the *initializer* for best-response dynamics. Rather than starting from equal resource weights and iterating toward Nash, the matrix provides an initial allocation already aligned with the lexicographic objective. The congestion game then fine-tunes within-tier resource sharing.

**{% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}-based healing action selection**: {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} tracks success rates for each healing action by failure category. The table below shows accumulated attempt and success counts alongside the {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} score that the exploration-exploitation formula assigns, which blends estimated success rate with an exploration bonus that grows when an action has been tried infrequently.

| Failure Type | Action | Attempts | Successes | UCB Score |
| :--- | :--- | ---: | ---: | ---: |
| Pod crash loop | Restart pod | 847 | 712 | 0.89 |
| Pod crash loop | Delete + recreate | 234 | 198 | 0.91 |
| Pod crash loop | Scale to 0, then up | 89 | 81 | 0.95 |
| Memory pressure | Evict low-priority | 412 | 389 | 0.96 |
| Memory pressure | Add node | 67 | 51 | 0.84 |

For crash loops, "scale to 0, then up" has highest {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} despite fewer attempts—the exploration bonus rewards trying this promising action more often.

**Control plane partition handling**: When an edge site loses connectivity to the central control plane:

1. **Detection** (T+0s): Central API unreachable for 3 consecutive health checks
2. **Mode transition** (T+15s): Site enters "autonomous mode" with elevated local authority
3. **State snapshot** (T+20s): Capture current configuration for later reconciliation
4. **Threshold adjustment** (T+25s): Tighten healing thresholds by 15% (more conservative without central backup)
5. **Operation logging** (T+continuous): All healing actions logged with causality metadata

Upon reconnection, the site uploads its healing log. Central platform reconciles any conflicts (e.g., site promoted a replica to primary that central also promoted elsewhere) using timestamp-based conflict resolution with site-local decisions having priority for their own resources.

**Utility analysis**:

The MTTR improvement \\(\Delta \text{MTTR}\\) equals the manual resolution time \\(T_{\text{human}}\\) minus the automated detection and healing time, where \\(T_{\text{human}}\\) includes paging delay, context acquisition, and decision time.

{% katex(block=true) %}
\Delta \text{MTTR} = \text{MTTR}_{\text{manual}} - \text{MTTR}_{\text{auto}} = T_{\text{human}} - (T_{\text{detect}} + T_{\text{heal}})
{% end %}

**Escalation rate bound**: For healing actions with success probability \\(p_s\\) and \\(k\\) retry attempts:

{% katex(block=true) %}
P(\text{escalate}) = (1 - p_s)^k
{% end %}

With \\(p_s \geq 0.9\\) and \\(k = 3\\): \\(P(\text{escalate}) \leq 0.001\\). Adding unknown failure modes (\\(\approx 5\\%\\) of incidents): \\(P(\text{escalate}) \approx 0.05\\).

**Utility improvement**: \\(\Delta U = \Delta \text{MTTR} \cdot V_{\text{availability}} - \text{FPR} \cdot C_{\text{unnecessary}}\\). Sign(\\(\Delta U\\)) > 0 when \\(\Delta \text{MTTR} \cdot V > \text{FPR} \cdot C\\).

---

## Healing Under Uncertainty

### Acting Without Root Cause

Root cause analysis is the gold standard for remediation: understand why the problem occurred, address the underlying cause, prevent recurrence. In well-instrumented cloud environments with centralized logging and expert operators, root cause analysis is achievable.

At the edge, the requirements for root cause analysis may not be met:
- **Data**: Limited logging capacity, no access to historical comparisons
- **Time**: Failure demands immediate response, analysis takes time
- **Expertise**: No human expert available during partition

**Symptom-based remediation** addresses this gap. Instead of "if we understand cause C, apply solution S," we use "if we observe symptoms Y, try treatment T."

The table below gives four representative symptom-treatment pairings together with the rationale explaining why the treatment addresses multiple possible root causes.

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

From [self-measurement](@/blog/2026-01-22/index.md), health estimates come with confidence intervals. The act/wait decision is formalized as a constrained optimization.

<span id="def-9"></span>
**Definition 9** (Healing Action Severity). *The severity \\(\varsigma(a) \in [0, 1]\\) of healing action \\(a\\) is determined by its reversibility \\(R(a) \in [0,1]\\) and impact scope \\(I(a) \in [0,1]\\): \\(\varsigma(a) = (1 - R(a)) \cdot I(a)\\). Actions with \\(\varsigma(a) > 0.8\\) are classified as high-severity.*

In other words, severity is high when an action is both hard to undo and affects many components simultaneously; a cache flush scores near zero (fully reversible, narrow scope) while isolating a node from the fleet scores near one (irreversible, wide impact).

**Act/Wait Decision Problem**:

Given a confidence estimate \\(c\\) from the anomaly detector and a candidate healing action \\(a\\), the system must decide whether to act now or wait for more evidence. The objective selects the binary decision \\(d^*\\) that maximizes expected utility, where acting incurs a false-positive cost when the diagnosis is wrong and waiting incurs a false-negative cost when the failure is real.

{% katex(block=true) %}
d^* = \arg\max_{d \in \{0, 1\}} \mathbb{E}[U(d \mid c, a)]
{% end %}

where \\(d = 1\\) indicates "act" and \\(d = 0\\) indicates "wait", with:

{% katex(block=true) %}
\mathbb{E}[U(d \mid c, a)] = \begin{cases}
c \cdot V_{\text{heal}}(a) - (1-c) \cdot C_{\text{FP}}(a) & \text{if } d = 1 \\
-c \cdot C_{\text{FN}}(a) & \text{if } d = 0
\end{cases}
{% end %}

**Optimal Decision Rule**:

Act when \\(\mathbb{E}[U(1)] > \mathbb{E}[U(0)]\\), which yields:

{% katex(block=true) %}
d^* = 1 \iff c > \theta^*(a) = \frac{C_{\text{FP}}(a)}{C_{\text{FP}}(a) + C_{\text{FN}}(a) + V_{\text{heal}}(a)}
{% end %}

This is the full form stated in Proposition 10. When \\(V_{\text{heal}}\\) is folded into the effective false-negative cost (i.e., \\(C_{\text{FN}}^{\text{eff}} = C_{\text{FN}} + V_{\text{heal}}\\)), this reduces to the simplified form of Corollary 10.1.

Three constraints bound the threshold regardless of what the cost-ratio formula produces: a minimum floor so the system is never trigger-happy at near-zero confidence, a maximum ceiling so critical failures are never silently ignored, and a hard floor specifically for high-severity actions.

{% katex(block=true) %}
\begin{aligned}
g_1: && \theta &\geq \theta_{\min} = 0.05 && \text{(minimum confidence)} \\
g_2: && \theta &\leq \theta_{\max} = 0.95 && \text{(never ignore critical)} \\
g_3: && \varsigma(a) > 0.8 &\Rightarrow \theta \geq 0.90 && \text{(high-severity floor)}
\end{aligned}
{% end %}

The table below applies Proposition 10's formula to six representative healing actions: as severity rises and reversibility falls, the Required Confidence column rises correspondingly, demanding stronger evidence before the system acts.

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

<span id="prop-10"></span>
**Proposition 10** (Optimal Confidence Threshold). *The optimal confidence threshold \\(\theta^\*(a)\\) for healing action \\(a\\) satisfies:*

{% katex(block=true) %}
\theta^*(a) = \frac{C_{\text{FP}}(a)}{C_{\text{FP}}(a) + C_{\text{FN}}(a) + V_{\text{heal}}(a)}
{% end %}

*where \\(C_{\text{FP}}(a)\\) is the cost of false positive (unnecessary healing), \\(C_{\text{FN}}(a)\\) is the cost of false negative (missed problem), and \\(V_{\text{heal}}(a)\\) is the value recovered by successful healing.*

In other words, set the confidence bar at the fraction of total expected cost attributable to false positives: if unnecessary healing is nine times cheaper than the combined cost of missing a real failure plus the value of recovery, act as soon as confidence exceeds 10%.

**Corollary 10.1.** *When \\(V_{\text{heal}}\\) is absorbed into effective false-negative cost \\(C_{\text{FN}}^{\text{eff}} = C_{\text{FN}} + V_{\text{heal}}\\), the threshold simplifies to:*

{% katex(block=true) %}
\theta^*(a) = \frac{C_{\text{FP}}(a)}{C_{\text{FP}}(a) + C_{\text{FN}}^{\text{eff}}(a)}
{% end %}

*Proof*: When \\(c \in [0,1]\\) is the posterior probability \\(P(\text{failure} \mid \text{observation})\\), the expected costs of acting and waiting are:

{% katex(block=true) %}
\mathbb{E}[\text{Cost}(\text{act})] = (1-c) \cdot C_{\text{FP}}, \quad \mathbb{E}[\text{Cost}(\text{wait})] = c \cdot C_{\text{FN}}^{\text{eff}}
{% end %}

Acting is preferred when \\(\mathbb{E}[\text{Cost}(\text{act})] < \mathbb{E}[\text{Cost}(\text{wait})]\\):

{% katex(block=true) %}
(1-c) \cdot C_{\text{FP}} < c \cdot C_{\text{FN}}^{\text{eff}} \implies c > \frac{C_{\text{FP}}}{C_{\text{FP}} + C_{\text{FN}}^{\text{eff}}} = \theta^*
{% end %}

The threshold structure implies: asymmetric costs (\\(C_{\text{FN}}^{\text{eff}} \gg C_{\text{FP}}\\)) yield lower thresholds, accepting more false positives to avoid missed failures.

### Game-Theoretic Extension: Adversarial Threshold Manipulation

Proposition 10's optimal threshold \\(\theta^\*(a)\\) is derived against a non-strategic failure process. The dynamic threshold adaptation mechanism — which modulates \\(\theta^\*\\) through \\(f_{\text{resource}}, f_{\text{cascade}}, f_{\text{mission}}, f_{\text{connectivity}}\\) — is itself manipulable if the adversary can influence the context variables.

**Attack pattern**: An adversary who can cause spurious cascade events inflates \\(f_{\text{cascade}}\\), which raises \\(\theta^*(t)\\), which then suppresses detection of the real attack. The threshold-raising event sequence is itself an anomaly signature.

**Maximin threshold**: The adversarially robust threshold \\(\theta^*_{\text{robust}}\\) chooses the threshold that keeps detection probability as high as possible even when the adversary selects the attack signal \\(a_A\\) from their action space \\(\mathcal{A}_A\\) that most suppresses detection.

{% katex(block=true) %}
\theta^*_{\text{robust}}(a) = \arg\max_{\theta} \min_{a_A \in \mathcal{A}_A} P(\text{detect} \mid \theta, a_A)
{% end %}

**Second-order defense**: Monitor the pattern of threshold-raising events. A cluster of false positives that raises \\(\theta^\*\\) immediately before a partition event is itself an anomaly warranting elevated alertness — the dynamic threshold adaptation should include an adversarial-signature monitor that temporarily freezes \\(\theta^\*\\) when manipulation signatures are detected.

**Practical implication**: For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} and {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} operating in adversarial environments, bound the maximum rate at which \\(\theta^*\\) can increase per unit time (a rate limiter on threshold escalation). Sudden large threshold increases — whether from genuine context changes or adversarial manipulation — should trigger a brief period of heightened sensitivity at the prior (lower) threshold before committing to the new one.

### Dynamic Threshold Adaptation

Static thresholds assume fixed cost ratios. In practice, the relative cost of acting versus waiting shifts with mission phase, resource availability, and connectivity — so the threshold must update continuously. The context-dependent optimization selects \\(\theta^*(t)\\) at each timestep by minimizing expected total cost under current system state \\(\Sigma_t\\), where the state captures resource level, mission phase, connectivity, and the number of healing actions already in progress.

{% katex(block=true) %}
\theta^*(t) = \arg\min_{\theta \in [\theta_{\min}, \theta_{\max}]} \mathbb{E}[\text{Cost}(\theta, \Sigma_t)]
{% end %}

The expected cost at threshold \\(\theta\\) given current system state \\(\Sigma_t\\) is the sum of two terms: the effective false-positive cost \\(C_{\text{FP}}^{\text{eff}}(t)\\) scaled by the false-positive rate \\(P_{\text{FP}}(\theta)\\), plus the effective false-negative cost \\(C_{\text{FN}}^{\text{eff}}(t)\\) scaled by the miss rate \\(P_{\text{FN}}(\theta)\\).

{% katex(block=true) %}
\mathbb{E}[\text{Cost}(\theta, \Sigma_t)] = C_{\text{FP}}^{\text{eff}}(t) \cdot P_{\text{FP}}(\theta) + C_{\text{FN}}^{\text{eff}}(t) \cdot P_{\text{FN}}(\theta)
{% end %}

The effective costs are functions of system state {% katex() %}\Sigma_t = (R_t, \text{phase}_t, C_t, n_{\text{healing}}(t)){% end %}:

The effective false-positive cost \\(C_{\text{FP}}^{\text{eff}}\\) grows when resources are scarce or many healings are already in progress, while the effective false-negative cost \\(C_{\text{FN}}^{\text{eff}}\\) grows during critical mission phases and when connectivity is denied (because no external help is available to handle a missed failure).

{% katex(block=true) %}
C_{\text{FP}}^{\text{eff}}(t) = C_{\text{FP}}^{\text{base}} \cdot f_{\text{resource}}(R(t)) \cdot f_{\text{cascade}}(n_{\text{healing}}(t))
{% end %}

{% katex(block=true) %}
C_{\text{FN}}^{\text{eff}}(t) = C_{\text{FN}}^{\text{base}} \cdot f_{\text{mission}}(\text{phase}(t)) \cdot f_{\text{connectivity}}(C(t))
{% end %}

**Modulation functions**:

- \\(f_{\text{resource}}(R) = 1 + 2 \cdot (1 - R/R_{\max})\\): FP cost triples when resources depleted
- \\(f_{\text{cascade}}(n) = 1 + 0.5n\\): Each concurrent healing increases FP cost by 50%
- \\(f_{\text{mission}}(\text{phase}) \in [1, 5]\\): Critical phases multiply FN cost up to \\(5\times\\)
- \\(f_{\text{connectivity}}(C) = 2 - C\\): Full connectivity halves FN cost; denied doubles it

Applying Proposition 10's ratio formula to the effective costs gives the time-varying threshold — at each timestep, \\(\theta^*(t)\\) is simply the fraction of total effective cost attributable to false positives.

{% katex(block=true) %}
\theta^*(t) = \frac{C_{\text{FP}}^{\text{eff}}(t)}{C_{\text{FP}}^{\text{eff}}(t) + C_{\text{FN}}^{\text{eff}}(t)}
{% end %}

During critical mission phases (\\(f_{\text{mission}} \to 5\\)) with good connectivity, the denominator grows large relative to the numerator, driving \\(\theta^*(t)\\) well below 0.1—the system heals at very low confidence, accepting many false positives to avoid any missed failures.

**Threshold bounds**:

Unconstrained adaptation can lead to pathological behavior. The hard bounds below enforce a safety interval for \\(\theta^*(t)\\): \\(\theta_{\min} = 0.05\\) ensures the system always requires at least some confidence, and \\(\theta_{\max} = 0.95\\) ensures it never completely ignores a detected problem.

{% katex(block=true) %}
\theta_{\min} \leq \theta^*(t) \leq \theta_{\max}
{% end %}

**Hysteresis for threshold changes**:

Rapidly fluctuating thresholds cause inconsistent behavior. The hysteresis rule below holds the current threshold fixed if the change demanded by \\(\theta^*(t)\\) is smaller than the dead-band \\(\delta_\theta \approx 0.1\\), preventing threshold jitter from triggering spurious mode changes.

{% katex(block=true) %}
\theta(t) = \begin{cases}
\theta^*(t) & \text{if } |\theta^*(t) - \theta(t-1)| > \delta_{\theta} \\
\theta(t-1) & \text{otherwise}
\end{cases}
{% end %}

where \\(\delta_{\theta} \approx 0.1\\) prevents threshold jitter.

**State Transition Model**: The complete threshold state at time \\(t+1\\) is the triple of the updated threshold value and the two effective costs that drive it at that timestep.

{% katex(block=true) %}
\Sigma_{t+1}^{\theta} = \left(\theta(t+1), C_{\text{FP}}^{\text{eff}}(t+1), C_{\text{FN}}^{\text{eff}}(t+1)\right)
{% end %}

The threshold itself steps toward the target \\(\theta^\*(t+1)\\) by increment \\(\gamma\\) only when the gap \\(\Delta\theta = \theta^\*(t+1) - \theta(t)\\) exceeds the hysteresis band \\(\delta_\theta\\), and is hard-clipped to the safety interval \\([\theta_{\min}, \theta_{\max}]\\).

{% katex(block=true) %}
\theta(t+1) = \text{clip}\left(\theta(t) + \gamma \cdot \mathbb{1}[|\Delta\theta| > \delta_\theta] \cdot \text{sign}(\Delta\theta), \theta_{\min}, \theta_{\max}\right)
{% end %}

where \\(\Delta\theta = \theta^*(t+1) - \theta(t)\\) and \\(\gamma \leq |\Delta\theta|\\) is the adaptation rate.

### The Harm of Wrong Healing

Healing actions can make things worse:

**False positive healing**: Restarting a healthy component because of anomaly detector error. The restart itself causes momentary unavailability. In {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}, restarting a drone's flight controller mid-maneuver could destabilize formation.

**Resource consumption**: {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} consumes CPU, memory, and bandwidth. If healing is triggered too frequently, the healing overhead starves the mission. The system spends its energy on healing rather than on its primary function.

**Cascading effects**: Healing component A affects component B. In {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, restarting vehicle 4's communication system breaks the mesh path to vehicles 5-8. The healing of one component triggers failures in others.

**Healing loops**: A heals B (restart), B heals A (because A restarted affected B), A heals B again, infinitely. The system oscillates between healing states, never stabilizing.

Detection and prevention mechanisms:

**Healing attempt tracking**: Log each healing action with timestamp and outcome. If the same action triggers repeatedly in short time, something is wrong with the healing strategy, not just the target. The healing rate metric below quantifies this: it counts attempts in a sliding window of length \\(T\\) and divides by \\(T\\) to yield an instantaneous rate.

{% katex(block=true) %}
\text{Healing rate} = \frac{\text{healing attempts in window } T}{T}
{% end %}

If healing rate exceeds threshold, reduce healing aggressiveness or pause healing entirely.

**Cooldown periods**: After healing action A, impose minimum time before A can trigger again. This prevents oscillation and allows time to observe outcomes. The cooldown constraint below ensures action \\(A\\) cannot fire again until at least \\(\tau_{\text{cooldown}}(A)\\) seconds have elapsed since its last execution.

{% katex(block=true) %}
t_{\text{next}(A)} \geq t_{\text{last}(A)} + \tau_{\text{cooldown}}(A)
{% end %}

**Dependency tracking**: Before healing A, check if healing A will affect critical components B. If so, either heal B first, or delay healing A until B is stable.

### Control-Theoretic Stability: Damping, Anti-Windup, and Refractory Periods

Proposition 9's stability condition \\(K \cdot \tau < \pi/2\\) governs the proportional behavior of the MAPE-K controller. But two failure modes remain outside its scope: **high-frequency chatter** (the loop triggers healing faster than the system can respond, oscillating between degraded and over-corrected states) and **integral windup** (healing demand accumulates while resources are blocked and discharges as a burst of simultaneous actions when resources free). In classical PID terms, the proportional term is bounded by Proposition 9, but the derivative and integral behaviors need their own treatment.

<span id="def-28"></span>
**Definition 28** (Healing Dead-Band and Refractory State). *The healing actuator for action \\(a\\) is governed by three parameters and occupies one of three states:*

- *\\(\varepsilon_{\text{db}}\\) (dead-band threshold): healing is suppressed unless the anomaly score \\(z_t^K\\) exceeds \\(\varepsilon_{\text{db}}\\) for \\(\tau_{\text{confirm}}\\) consecutive samples — the "Wait-and-See" confirmation window. Single-sample noise spikes are ignored.*
- *\\(\tau_{\text{ref}}(a)\\) (refractory period): after executing action \\(a\\), the healing gate for \\(a\\) closes for \\(\tau_{\text{ref}}\\) seconds. This is the mandatory observation window during which the system watches the action take effect before issuing another.*
- *\\(Q_{\text{aw}}\\) (anti-windup cap): accumulated healing demand \\(D(t)\\) is capped at \\(Q_{\text{aw}}\\). Demand arriving when \\(D(t) = Q_{\text{aw}}\\) is discarded, preventing burst discharge after a resource-blocked period.*

{% mermaid() %}
stateDiagram-v2
    direction LR
    [*] --> READY
    READY --> REFRACTORY: action executed
    REFRACTORY --> READY: tau_ref elapsed
    REFRACTORY --> ANTI_WINDUP: D(t) >= Q_aw
    ANTI_WINDUP --> REFRACTORY: D(t) < Q_aw / 2
    ANTI_WINDUP --> READY: tau_ref elapsed, D = 0
    note right of READY
        suppressed while z_t < epsilon_db
        for tau_confirm consecutive samples
    end note
{% end %}

**Design parameters by severity tier**:

| Severity tier | \\(\varepsilon_{\text{db}}\\) | \\(\tau_{\text{confirm}}\\) | \\(\tau_{\text{ref}}\\) | \\(Q_{\text{aw}}\\) |
| :--- | :--- | :--- | :--- | :--- |
| Low (\\(\varsigma \leq 0.3\\)) | \\(1\sigma\\) | 3 samples | \\(2\tau_{\text{fb}}\\) | 10 |
| Medium (\\(0.3 < \varsigma \leq 0.7\\)) | \\(2\sigma\\) | 5 samples | \\(4\tau_{\text{fb}}\\) | 5 |
| High (\\(\varsigma > 0.7\\)) | \\(3\sigma\\) | 10 samples | \\(8\tau_{\text{fb}}\\) | 2 |

where \\(\tau_{\text{fb}}\\) is the current feedback delay from Proposition 9.

<span id="prop-29"></span>
**Proposition 29** (Anti-Windup Oscillation Bound). *For the proportional healing controller with gain \\(K\\) and feedback delay \\(\tau_{\text{fb}}\\) satisfying \\(K \cdot \tau_{\text{fb}} < \pi/2\\) (Proposition 9), healing oscillation is suppressed if and only if the refractory period satisfies:*

{% katex(block=true) %}
\tau_{\text{ref}} \geq \frac{\pi}{K}
{% end %}

*Substituting the Proposition 9 stability bound \\(K < \pi/(2\tau_{\text{fb}})\\), the sufficient condition in terms of feedback delay alone is:*

{% katex(block=true) %}
\tau_{\text{ref}} \geq 2\,\tau_{\text{fb}}
{% end %}

*Proof*: The healing controller with refractory period \\(\tau_{\text{ref}}\\) cannot fire at frequency higher than \\(1/\tau_{\text{ref}}\\). Sustained oscillation requires at least one half-cycle of the control loop at gain crossover frequency \\(\omega_c = K\\), which takes \\(\pi/K\\) seconds. Setting \\(\tau_{\text{ref}} \geq \pi/K\\) prevents any half-cycle from completing. Substituting \\(K < \pi/(2\tau_{\text{fb}})\\) gives \\(\pi/K > 2\tau_{\text{fb}}\\). \\(\square\\)*

**Anti-windup accumulator update**:

{% katex(block=true) %}
D(t+1) = \min\!\left(D(t) + \mathbb{1}\!\left[z_t^K > \varepsilon_{\text{db}}\right],\; Q_{\text{aw}}\right)
{% end %}

When \\(D(t)\\) reaches \\(Q_{\text{aw}}\\), the system enters ANTI_WINDUP state and discards new demand until \\(D(t)\\) drains below \\(Q_{\text{aw}}/2\\). This prevents "burst discharge" — where minutes of suppressed healing demand fires simultaneously the moment connectivity or resources recover.

**Relationship to existing results**: The dead-band threshold \\(\varepsilon_{\text{db}}\\) formalizes the minimum-confidence floor \\(\theta_{\min} = 0.05\\) from Proposition 10 (constraint \\(g_1\\)): both prevent trigger-happy behavior at near-zero evidence. The refractory period \\(\tau_{\text{ref}}\\) formalizes the informal cooldown constraint \\(t_{\text{next}(A)} \geq t_{\text{last}(A)} + \tau_{\text{cooldown}}(A)\\) from the section above. Proposition 29 gives the first *derived* lower bound on that cooldown: rather than choosing \\(\tau_{\text{cooldown}}\\) heuristically, set \\(\tau_{\text{ref}} \geq 2\tau_{\text{fb}}\\) and oscillation-freedom follows from Proposition 9's stability condition.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration**: Feedback delay \\(\tau_{\text{fb}} \approx 5\,\text{s}\\) (gossip convergence, 47 nodes), regime gain \\(K = 0.3\\). Minimum refractory period: \\(\tau_{\text{ref}} \geq \pi/0.3 \approx 10\,\text{s}\\), consistent with \\(2 \times 5 = 10\,\text{s}\\). Dead-band \\(\varepsilon_{\text{db}} = 2\sigma\\) for medium-severity battery actions. Without this bound, a jamming event that degrades all 47 drones simultaneously triggers 47 concurrent healing cycles — each drone restarting its communication stack causes momentary radio silence, which registers as a new anomaly to neighbors, triggering another round. This is exactly the healing loop failure mode described above, now quantified.

**Required relationship — confirmation window vs. hardware response time**: The confirmation window \\(\tau_{\text{confirm}}\\) must satisfy {% katex() %}\tau_{\text{confirm}} \geq \tau_{\text{hw\_response}}{% end %}, where {% katex() %}\tau_{\text{hw\_response}}{% end %} is the mechanical or electrical settling time of the actuated component. If {% katex() %}\tau_{\text{confirm}} < \tau_{\text{hw\_response}}{% end %}, the MAPE-K loop can issue a second actuation command while the first is still in progress, resulting in compounded commands on an actuator in an undefined intermediate state. Concrete example: a {% term(url="@/blog/2026-01-15/index.md#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} protective relay has a mechanical response time of 500 ms. If \\(\tau_{\text{confirm}} = 300\,\text{ms}\\) (3 samples at 10 Hz), the MAPE-K loop confirms "action taken" before the relay has physically moved; a second fault event can send a second trip command to a relay mid-travel. Minimum safe value: {% katex() %}\tau_{\text{confirm}} \geq \max(\tau_{\text{hw\_response}}, \text{measurement period} \times n_{\text{confirm}}){% end %}. For RAVEN motor controllers (electrical settling time \\(\approx 50\,\text{ms}\\)), \\(\tau_{\text{confirm}} = 3\,\text{samples} \times 1\,\text{s/sample} = 3\,\text{s}\\) comfortably satisfies the constraint.

**{% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} anti-windup calibration**: During a 10-minute storage-layer hiccup, health checks degrade for dozens of pods simultaneously. Without the anti-windup cap, the demand accumulator fills to dozens of queued healing actions and discharges as simultaneous pod restarts the moment the health layer recovers — a self-inflicted availability incident. With \\(Q_{\text{aw}} = 5\\), the burst is bounded to 5 concurrent actions regardless of backlog depth.

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

The diagram below shows the mutual dependency as a cycle: each arrow indicates a startup requirement, and both nodes are red because neither can satisfy the other's precondition.

{% mermaid() %}
graph LR
    A["Auth Service"] -->|"needs users from"| D["Database"]
    D -->|"needs auth from"| A

    style A fill:#ffcdd2,stroke:#c62828
    style D fill:#ffcdd2,stroke:#c62828
{% end %}

Strategies for breaking cycles:

**Cold restart all simultaneously**: Start all components in the cycle at once. Race condition: hope they stabilize. Works for simple cases but unreliable for complex cycles.

**Stub mode**: Start A in degraded mode that doesn't require D (e.g., allow anonymous access temporarily). Start D using A's degraded mode. Once D is healthy, promote A to full mode requiring D. The three-step startup order is: A in stub mode first, then D, then A promoted to full mode.

{% katex(block=true) %}
\text{Sequence: } A_{\text{stub}} \rightarrow D \rightarrow A_{\text{full}}
{% end %}

**Quorum-based**: If multiple instances of A and D exist, restart subset while others continue serving. {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} example: restart half the drones while others maintain coverage, then swap.

**Cycle detection and minimum-cost break**: Use DFS to find cycles. For each cycle, identify the edge with lowest "break cost"—the dependency that is easiest to stub or bypass. Break that edge.

{% katex(block=true) %}
e^* = \arg\min_{e \in \text{cycle}} C_{\text{break}}(e)
{% end %}

### Minimum Viable System

Not all components are equally critical. When resources for healing are limited, prioritize the components that matter most.

<span id="def-10"></span>
**Definition 10** (Minimum Viable System). *The {% term(url="#def-10", def="Smallest set of components that must remain operational to sustain the mission-critical L1 survival capability; defines the healing algorithm's priority boundary — MVS components are repaired first") %}minimum viable system{% end %} \\(\text{MVS} \subseteq V\\) is the smallest subset of components such that \\(\text{capability}(\text{MVS}) \geq \mathcal{L}_1\\), where \\(\mathcal{L}_1\\) is the basic mission capability threshold. Formally:*

{% katex(block=true) %}
\text{MVS} = \arg\min_{S \subseteq V} |S| \quad \text{subject to} \quad \text{capability}(S) \geq \mathcal{L}_1
{% end %}

In other words, the {% term(url="#def-10", def="Smallest set of components that must remain operational to sustain the mission-critical L1 survival capability; defines the healing algorithm's priority boundary — MVS components are repaired first") %}MVS{% end %} is the leanest set of components that still keeps the system above the minimum acceptable capability level \\(\mathcal{L}_1\\); every component outside the MVS is a candidate to remain offline when healing resources are scarce.

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}:
- **MVS components**: Flight controller, collision avoidance, mesh radio, GPS
- **Non-MVS components**: High-resolution camera, target classification ML, telemetry detail

When healing resources are scarce, heal MVS components first. Non-MVS components can remain degraded.

<span id="prop-11"></span>
**Proposition 11** (MVS Approximation). *Finding the exact MVS is NP-hard (reduction from set cover). However, a greedy algorithm that iteratively adds the component maximizing capability gain achieves approximation ratio \\(O(\ln |V|)\\).*

**Precondition — submodularity**: The greedy \\(O(\ln |V|)\\) approximation guarantee requires the capability function to be submodular (diminishing marginal returns): for all \\(S \subseteq T \subseteq V\\) and component \\(i \notin T\\), \\(\text{capability}(S \cup \{i\}) - \text{capability}(S) \geq \text{capability}(T \cup \{i\}) - \text{capability}(T)\\). This holds when no two components are mutual prerequisites for a capability. It fails when two components are jointly required (e.g., a crypto module + networking stack jointly unlock secure gossip, but neither alone contributes). In that case: (1) treat the pair as a single compound component in the greedy algorithm; (2) verify submodularity by checking all component pairs before running greedy. Failure to verify submodularity may produce a greedy solution 2–3x larger than the true MVS.

*Proof sketch*: MVS is a covering problem: find the minimum set of components whose combined capability exceeds threshold \\(\mathcal{L}_1\\). When the capability function exhibits diminishing marginal returns (submodular), the greedy algorithm achieves \\(O(\ln |V|)\\) approximation, matching the bound for weighted set cover.
For small component sets, enumerate solutions. For larger sets, use the greedy approximation: iteratively add the component that contributes most to capability until \\(\mathcal{L}_1\\) is reached.

In other words, the exact {% term(url="#def-10", def="Smallest set of components that must remain operational to sustain the mission-critical L1 survival capability; defines the healing algorithm's priority boundary — MVS components are repaired first") %}MVS{% end %} is computationally intractable for large systems, but always-pick-the-most-useful-component-next finds a solution at most \\(O(\ln |V|)\\) times larger than the true minimum.

### Game-Theoretic Extension: Shapley Values for Critical Component Identification

Proposition 11's greedy set-cover approximation identifies a minimum feasible component set. It does not identify which components are most *critical* to MVS achievability — a question answered by the **Shapley value** of the cooperative game over component contributions.

**MVS cooperative game**: Players are the \\(n\\) nodes (or components). The characteristic function \\(v(S)\\) is the mission completion probability achievable with the components contributed by coalition \\(S\\).

The **Shapley value** of node \\(i\\) measures its average marginal contribution across all possible coalition orderings:
{% katex(block=true) %}
\phi_i(v) = \sum_{S \subseteq N \setminus \{i\}} \frac{|S|!\,(|N|-|S|-1)!}{|N|!} \bigl[v(S \cup \{i\}) - v(S)\bigr]
{% end %}

**Shapley vs. minimum set**: A node can be in many minimum MVS coalitions (high Shapley value) without itself being a minimum set. High-Shapley nodes are single points of failure for MVS achievability — they appear in most coalitions that cross the feasibility threshold.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} application**: When drone 23 fails and coverage must be redistributed, the drones needed to fill the gap have high Shapley values in the coverage MVS game. Allocating healing resources (battery reserve, repositioning priority) proportional to Shapley values is efficient (total mission value maximized) and satisfies the fairness axioms of efficiency, symmetry, and marginality.

**Practical implication**: Pre-compute Shapley values for the MVS game during mission planning. Nodes with Shapley values above a criticality threshold \\(\phi_i > \phi_{\text{crit}}\\) receive:
- Higher power reserves
- Priority positions in healing queues
- Stricter health monitoring thresholds (lower \\(\theta^*\\))

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s 47 drones, computing Shapley values over the relevant MVS coalitions (typically 5-10 drones) is tractable at \\(O(2^{|S_{\text{MVS}}|})\\) per mission phase.

---

## Dynamic Fidelity Scaling

Self-measurement is a parasitic load. Every gossip round, every Kalman update, every reputation EWMA consumed by the autonomic framework is energy subtracted from the mission. At full battery this overhead is negligible; near the survival threshold it competes directly with the functions it was designed to protect. Dynamic Fidelity Scaling (DFS) formalizes the feedback loop that throttles autonomic overhead as resources deplete — treating monitoring as a luxury that must be earned by having a surplus.

<span id="def-46"></span>
**Definition 46** (Autonomic Overhead Power Map). *Let \\(\mathcal{P}_k\\) denote the sustained power draw of level \\(L_k\\) autonomic tasks — monitoring, analysis, learning, and fleet coordination — excluding mission payload (propulsion, weapons sensors, payload compute). Decompose as:*

{% katex(block=true) %}
\mathcal{P}_k = P_{\mathrm{radio}}(k) + P_{\mathrm{compute}}(k) = \lambda_k \cdot T_s + f_{\mathrm{alg}}(k) \cdot T_d
{% end %}

*where \\(\lambda_k\\) is the gossip rate at level \\(k\\) (packets/second), \\(T_s\\) is the energy per radio packet, \\(f_{\mathrm{alg}}(k)\\) is the decision rate of level-\\(k\\) algorithms, and \\(T_d\\) is the energy per local compute decision (both from Def 21). Because \\(T_s / T_d \approx 10^2\text{–}10^3\\), radio cost dominates — gossip rate is the primary autonomic power lever.*

For RAVEN (\\(T_s = 5\\) mJ/packet, \\(T_d = 50\\,\mu\text{J}\\)/decision):

| Level | Primary autonomic tasks | Gossip \\(\lambda_k\\) | \\(P_{\mathrm{radio}}\\) | \\(P_{\mathrm{compute}}\\) | \\(\mathcal{P}_k\\) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| L0 | Heartbeat beacon | 1/60 Hz | ~0.08 mW | ~0 | ~0.1 mW |
| L1 | EWMA anomaly detection | 0.5 Hz | 2.5 mW | ~0.05 mW | ~3 mW |
| L2 | Kalman filter + state sync | 2 Hz | 10 mW | ~0.5 mW | ~11 mW |
| L3 | HLC + BFT peer validation | 4 Hz | 20 mW | ~1 mW | ~21 mW |
| L4 | Quorum + reputation learning | 8 Hz | 40 mW | ~2 mW | ~42 mW |

*The L0–L4 ratio \\(\mathcal{P}_4 / \mathcal{P}_0 \approx 420\\) means full-fidelity autonomic operation consumes 420 times the power of heartbeat-only mode — a factor that dominates survival time in power-limited emergency conditions.*

<span id="def-47"></span>
**Definition 47** (Observation Regime Schedule). *Let \\(R(t) \in [0,1]\\) be the normalized resource availability (battery SOC for power-constrained nodes). Define five observation regimes with hysteretic thresholds — downgrade threshold \\(\theta_k^{\mathrm{dn}}\\) and upgrade threshold \\(\theta_k^{\mathrm{up}} = \theta_k^{\mathrm{dn}} + \delta_{\mathrm{hyst}}\\) with hysteresis band \\(\delta_{\mathrm{hyst}} = 0.05\\):*

| Regime | \\(R(t)\\) range (downgrade) | Active level | Suspended tasks |
| :--- | :--- | :--- | :--- |
| \\(O_4\\) High Fidelity | \\(R \geq 0.90\\) | L0–L4 | None |
| \\(O_3\\) Reduced Learning | \\([0.50,\; 0.90)\\) | L0–L3 | Bandit/Q-learning updates (Def 33), reputation EWMA (Def 44) |
| \\(O_2\\) Conservation | \\([E_{\mathrm{PLM}},\; 0.50)\\) | L0–L1 | Kalman (Def 23), HLC tracking (Def 40), BFT validation (Def 43), gossip reduced to 0.5 Hz |
| \\(O_1\\) Survival | \\([E_{\mathrm{HSS}},\; E_{\mathrm{PLM}})\\) | L0 only | All radio transmissions, all analysis, all learning |
| \\(O_0\\) Terminal | \\(R < E_{\mathrm{HSS}}\\) | None | Trigger \\(\mathcal{S}_{\mathrm{term}}\\) (Def 36) |

*Downgrade is immediate on threshold crossing; upgrade requires \\(R(t) > \theta_k^{\mathrm{dn}} + \delta_{\mathrm{hyst}}\\) to prevent oscillation near the boundary.*

**Phase gate prerequisite for L3 tasks (CI-02)**: Regime \\(O_3\\) activates HLC tracking (Definition 40) and BFT peer validation (Definition 43) — capabilities that belong to the Phase 2 and Phase 3 certification tiers of the Field Autonomic Certification (Definition 37). A node that transitions to \\(O_3\\) based solely on \\(R(t) \geq 0.50\\) without having satisfied the corresponding phase gates is running L3-tier machinery (26 mW, 4 Hz gossip, CRDT causality validation) without verified correctness of the underlying coordination protocol. The correct precondition for activating L3 tasks is \\(R(t) \geq 0.50 \land G_2(S) = 1\\) — the Phase 2 gate must have been passed during commissioning. In systems where Phase 2/3 certification has not been completed (e.g., early deployment phases), cap the maximum active level at L1 regardless of battery level: run \\(O_2\\) thresholds with L0–L1 tasks only, deferring BFT and HLC to post-certification.

**Quorum availability gate for O_3 / O_4 (CI-03)**: L3 and L4 tasks include BFT validation (Def 43) and reputation quorum (Def 45), both of which require a local cluster quorum of \\(\lceil 2n/3 \rceil + 1\\) reachable peers. When a partition reduces the reachable cluster to \\(n\' < \lceil 2n/3 \rceil + 1\\) nodes, BFT is structurally unavailable regardless of battery level. Running L3/L4 tasks in this condition wastes energy (20–42 mW) without providing Byzantine guarantees — the plausibility predicate \\(\kappa(c,j) \geq k_{\text{accept}}\\) cannot be satisfied with fewer than \\(k_{\text{accept}}\\) reachable neighbors. Operational rule: before entering \\(O_3\\) or \\(O_4\\), verify \\(|\mathcal{N}_{\text{reachable}}(t)| \geq \lceil 2n/3 \rceil + 1\\); if the condition fails, enter \\(O_2\\) regardless of \\(R(t)\\). For a CONVOY partition where only 6 of 12 vehicles remain in the cluster (below \\(\lceil 8 \rceil + 1 = 9\\) required), the correct regime is \\(O_2\\) even at full battery.

<span id="prop-45"></span>
**Proposition 45** (Self-Throttling Survival Gain). *Let \\(Q\\) be the mission payload power (propulsion, payload compute; \\(Q = 0\\) in emergency ground mode). The survival time from current resource level \\(R(t)\\) to the next critical threshold \\(\theta_{k-1}\\) under regime \\(O_k\\) is:*

{% katex(block=true) %}
T_{\mathrm{survive}}^{(k)}(R) = \frac{\bigl(R(t) - \theta_{k-1}\bigr) \cdot E_{\max}}{Q + \mathcal{P}_k}
{% end %}

*The marginal survival gain from downgrading \\(O_{k+1} \to O_k\\) is:*

{% katex(block=true) %}
\Delta T^{(k)} = \bigl(R(t) - \theta_{k-1}\bigr) \cdot E_{\max} \cdot \left(\frac{1}{Q + \mathcal{P}_k} - \frac{1}{Q + \mathcal{P}_{k+1}}\right) > 0
{% end %}

*since {% katex() %}\mathcal{P}_k < \mathcal{P}_{k+1}{% end %} by construction. Throttling always extends survival time; the only cost is reduced observability fidelity.*

*Self-throttling trigger*: the node transitions \\(O_{k+1} \to O_k\\) the instant \\(R(t)\\) crosses \\(\theta_k^{\mathrm{dn}}\\) from above, and immediately suspends the tasks listed in Def 47. Regime state is stored in non-volatile memory so that a warm-reboot restores the correct throttle level without re-running \\(R(t)\\) estimation from scratch. \\(\square\\)

<span id="prop-46"></span>
**Proposition 46** (Autonomic Overhead Paradox). *In PLM mode (\\(Q = Q_{\mathrm{sensors}} \approx 5\\) mW for residual sensor power; propulsion off), the full-fidelity vs. survival-mode survival times to \\(E_{\mathrm{HSS}}\\) starting from \\(E_{\mathrm{PLM}} = 0.20\\) are:*

{% katex(block=true) %}
T_{\mathrm{survive}}^{(4)} = \frac{0.15 \times 1{,}110\;\mathrm{mWh}}{5 + 42\;\mathrm{mW}} \approx 3.5\;\mathrm{h}, \qquad
T_{\mathrm{survive}}^{(1)} = \frac{0.15 \times 1{,}110\;\mathrm{mWh}}{5 + 0.1\;\mathrm{mW}} \approx 32.7\;\mathrm{h}
{% end %}

*The L4-to-L0 throttle multiplier is \\(T_{\mathrm{survive}}^{(1)} / T_{\mathrm{survive}}^{(4)} \approx 9.3\\times\\) — the difference between a recovery team arriving before battery death and the drone expiring unrecovered.*

**The autonomic overhead paradox**: at \\(\theta_{\mathrm{survival}}\\), the monitoring infrastructure designed to keep the node alive must be the first thing suspended. A node that refuses to throttle its L4 autonomic tasks in a resource crisis consumes itself — the MAPE-K loop becomes the proximate cause of death rather than its cure. The correct model is lexicographic: survival first, then observability, then fidelity. When \\(R(t) \leq \theta_k^{\mathrm{dn}}\\), the node does not ask "will suspending this task hurt the mission?" — it asks "does this task cost more energy than it saves?"

**Interaction with Prop 40** (Stale Data Threshold): In \\(O_1\\) (Survival), gossip is suspended entirely — no new measurements arrive, so \\(T_{\mathrm{stale}}\\) expires for all remote state. The node operates on stale world-state for the duration of \\(O_1\\). This is acceptable: in survival mode the only decision is whether to remain in \\(O_1\\) or transition to \\(O_0\\) (terminal), both of which are local decisions requiring no remote data.

---

## Terminal Safety State

The {% term(url="#def-10", def="Smallest set of components that must remain operational to sustain the mission-critical L1 survival capability; defines the healing algorithm's priority boundary — MVS components are repaired first") %}MVS{% end %} is the floor the healing algorithm defends. But the healing algorithm can itself fail — the MAPE-K loop may crash, its knowledge base may become corrupted, or its resource quota (\\(R_{\text{heal}}\\)) may be exhausted. Below MVS lies the {% term(url="#def-36", def="Operating mode entered when the entire autonomic framework has failed; selected by L0 hardware alone based on remaining energy; no L1-L4 software involvement") %}terminal safety state{% end %}: what the node does when all autonomy has been lost.

<span id="def-36"></span>
**Definition 36** (Terminal Safety State). *The terminal safety state \\(\mathcal{S}_\mathrm{term}\\)
is the operating mode the node enters when the entire autonomic framework — including the
MAPE-K loop and all its L1+ dependencies — has failed and cannot self-repair. It is selected
by L0 firmware as a function of remaining energy \\(E\\) alone:*

{% katex(block=true) %}
\mathcal{S}_\mathrm{term}(E) = \begin{cases}
\mathrm{PLM} & E > E_{\mathrm{PLM}} \\
\mathrm{BOM} & E_{\mathrm{HSS}} < E \leq E_{\mathrm{PLM}} \\
\mathrm{HSS} & E \leq E_{\mathrm{HSS}}
\end{cases}
{% end %}

*Three concrete states, ordered by endurance:*

- **PLM (Passive Listening Mode)**: Radio in receive-only mode; no transmissions; computation
  limited to hardware watchdog and energy monitor. Endurance: weeks. The node can receive a
  recovery command and re-initialize L1+ if the command arrives and power recovers.

- **BOM (Beacon-Only Mode)**: Periodic low-power position and status beacon at fixed interval
  \\(T_{\mathrm{beacon}}\\); no processing beyond beacon scheduling. Endurance: days. Enables
  recovery teams to locate the node.

- **HSS (Hardware Safety Shutdown)**: All software subsystems powered off; only tamper-detection
  circuit and charge controller remain active. Endurance: battery lifetime. Appropriate when
  continued operation risks mission security (e.g., radio in a denied zone).

**Hardware prerequisite and applicability scope**: Definition 36 assumes the node has (1) a dedicated battery management IC (BMS IC) that exposes a real-time energy register readable by L0 firmware without L1+ involvement, (2) a hardware-controlled secure flash zeroization circuit triggered by a GPIO line from L0, and (3) a charge controller that can be commanded to cut load power while preserving BMS and tamper-circuit supply. These are standard on modern battery-powered edge nodes (DJI embedded controllers, Raspberry Pi CM4 with UPS HAT, custom tactical compute modules) but absent on most legacy industrial equipment (PLCs, RTUs, SCADA remotes). Applying Definition 36 to legacy hardware without these components results in a terminal state machine that cannot reliably reach HSS — the "energy register" does not exist, and "zeroization" requires L1+ firmware. For legacy brownfield systems, the terminal safety state reduces to a physical-layer action (pulling a relay that cuts main power), which is Tier 3 or Tier 4 of the Legacy Recovery Cascade (Definition 50) rather than an autonomic software action.

**Threshold calibration**: \\(E_{\mathrm{PLM}}\\) and \\(E_{\mathrm{HSS}}\\) are platform-specific measured quantities, not default parameters. The RAVEN scenario (\\(E_{\mathrm{HSS}} = 5\\%\\), \\(E_{\mathrm{PLM}} = 20\\%\\)) is derived as follows:

| Threshold | Requirement | Computation | RAVEN value |
| :--- | :--- | :--- | :--- |
| \\(E_{\mathrm{HSS}}\\) | Energy for one secure flash zeroization | 180 mJ measured at 3.7V; 5000 mAh battery: 5\% = 925 mJ; 5x margin | 5\% |
| \\(E_{\mathrm{PLM}}\\) | PLM endurance until recovery team (72h) at 2 mA draw | 72h x 2 mA = 144 mAh (~3\%) + \\(E_{\mathrm{HSS}}\\) + 2x cold-battery margin | 20\% |

Calibration procedure for any platform: (1) measure secure shutdown energy at minimum operating temperature (worst case); (2) compute minimum PLM endurance from recovery SLA at maximum PLM draw; (3) add 2x margin for battery capacity reduction at minimum operating temperature (Li-Ion loses 30–40\% at \\(-20^\circ\mathrm{C}\\)); (4) verify \\(E_{\mathrm{PLM}} > E_{\mathrm{HSS}}\\) by at least 10 percentage points to avoid threshold ambiguity near the boundary.

*Critically, \\(\mathcal{S}_\mathrm{term}\\) selection must be implemented entirely within
L0 firmware — the transition logic must satisfy the {% term(url="@/blog/2026-01-15/index.md#def-35",
def="Structural constraint requiring that each capability level's runtime dependencies are confined
to equal or lower levels; L0 has zero dependencies on any L1-L4 component") %}dependency isolation
requirement{% end %} (Definition 35): zero imports from L1+ code.*

<span id="prop-37"></span>
**Proposition 37** (Safety State Reachability). *For any system state \\(S\\) — including states
where all L1–L4 layers have crashed — \\(\mathcal{S}_\mathrm{term}\\) is reachable via L0
hardware operations alone:*

{% katex(block=true) %}
\forall\, S \in \mathcal{S}_\mathrm{system} :\; \exists\; \text{path from } S
\text{ to } \mathcal{S}_\mathrm{term}\text{ using only } L_0 \text{ operations}
{% end %}

*Proof*: By Definition 35, L0 has no dependencies on L1+; therefore L0 remains operational when
all L1+ layers have failed. The {% term(url="#def-26", def="Hardware circuit that resets the processor if the software watchdog heartbeat stops within a defined interval") %}software watchdog
timer{% end %} (Definition 26) is implemented in dedicated hardware: it fires when the L1+
software stack stops issuing heartbeats, without requiring any L1+ cooperation. Upon watchdog
fire, L0 reads the energy register \\(E\\) and enters \\(\mathcal{S}_\mathrm{term}(E)\\). The
entire path — watchdog trigger, energy read, state entry — uses only hardware registers and L0
firmware. \\(\square\\)

**RAVEN scenario**: Drone 23's MAPE-K process crashes mid-healing (heap exhausted by a runaway
recovery action). The L1+ watchdog daemon also fails (same heap). The hardware watchdog fires
after 500ms — the heartbeat window. L0 reads \\(E = 12\\%\\) (above \\(E_{\mathrm{HSS}} = 5\\%\\),
below \\(E_{\mathrm{PLM}} = 20\\%\\)) and enters BOM. The drone begins transmitting its position
beacon at 30-second intervals on the recovery frequency. The swarm's gossip health protocol
(Definition 5) marks Drone 23 as RECOVERY-BEACON and routes a cluster lead to attempt L1+
re-initialization via the BOM command channel. This is exactly the failure mode that Proposition
37 guarantees can be reached: from any state, regardless of which layers have failed.

---

## Autonomic Gateway

Most engineering analysis in this series assumes the managed hardware presents an observable health telemetry API — a process that responds to queries, emits structured health metrics, and accepts configuration commands. That assumption fails for legacy industrial equipment, embedded controllers, and tactical hardware designed before autonomic systems existed.

A 1990s diesel generator does not report its internal temperature. A legacy motor controller does not export a health vector. A cold-war-era radio does not accept remote restart commands. Yet these devices must participate in the MAPE-K healing loop — the system cannot simply exclude them because they lack a modern interface.

The **Autonomic Gateway** is a software adapter that presents legacy hardware to the MAPE-K loop as if it were a fully observable, API-driven system: it synthesizes health metrics from proxy signals, maps healing actions onto physical actuation primitives, and enforces cooldown and pre-condition constraints that the underlying hardware cannot enforce itself.

<span id="def-48"></span>
**Definition 48** (Autonomic Gateway). An *Autonomic Gateway* for a legacy hardware device \\(D\\) is a tuple \\(G = (H, O, \varphi, A, \Gamma)\\) where:

- \\(H = \\{h_1, \ldots, h_m\\}\\) is the set of *target health metrics* that the MAPE-K Monitor phase expects (e.g., temperature, fuel level, operational state)
- \\(O = \\{o_1, \ldots, o_k\\}\\) is the set of *observable proxy signals* physically accessible from the gateway controller (e.g., current draw, ambient temperature, vibration amplitude, exhaust flow)
- \\(\varphi : O \to H\\) is the *inference function* mapping observable proxies to health metric estimates; for each \\(h_i \in H\\), \\(\varphi_i(o)\\) yields a point estimate \\(\hat{h}_i\\) and uncertainty interval \\(\sigma_i\\)
- \\(A = \\{a_1, \ldots, a_p\\}\\) is the set of *physical actuation primitives* the gateway can execute on \\(D\\) (e.g., Modbus register write, GPIO signal, relay close, power cycle)
- \\(\Gamma : \text{HealingAction} \to 2^A\\) is the *actuation mapping* from MAPE-K healing commands to ordered sequences of physical primitives, including pre-conditions, post-conditions, and cooldown requirements

The gateway presents \\((H, \Gamma(\cdot))\\) to the MAPE-K loop and hides \\((O, \varphi, A)\\) as implementation details.

**OUTPOST generator example**: \\(H = \\{\text{coolant\\_temp}, \text{fuel\\_level}, \text{op\\_state}\\}\\). The generator has no telemetry port. The gateway observes current draw, ambient temperature, exhaust temperature, and vibration. The MAPE-K loop sees structured health reports and issues restart/shutdown commands; the gateway translates those commands into Modbus register writes and GPIO relay signals.

<span id="def-49"></span>
**Definition 49** (Synthetic Health Metric). A *synthetic health metric* \\(\hat{h} = \varphi_i(o_1, \ldots, o_k)\\) is an inferred measurement of a device-internal quantity that the hardware does not report directly, derived from a physical model relating observable proxy signals to the target quantity.

For the OUTPOST diesel generator, the gateway infers engine thermal state from an RC thermal circuit model. Let \\(P_\text{loss}(t) = V_\text{run} \cdot I(t) \cdot (1 - \eta)\\) be the waste-heat power at time \\(t\\), where \\(I(t)\\) is measured current draw, \\(V_\text{run}\\) is nominal supply voltage, and \\(\eta\\) is mechanical efficiency. Engine temperature evolves as:

{% katex(block=true) %}
\hat{T}_\text{engine}(t) = T_\text{amb}(t) + R_\text{th} \cdot P_\text{loss}(t) \cdot \left(1 - e^{-s(t)/\tau_\text{th}}\right)
{% end %}

where \\(R_\text{th}\\) is thermal resistance, \\(\tau_\text{th}\\) is the thermal time constant, and \\(s(t)\\) is elapsed run time since the last cold start. Both \\(R_\text{th}\\) and \\(\tau_\text{th}\\) are calibrated once at commissioning by running the generator to thermal steady state while logging current draw and exhaust temperature.

**Model uncertainty**: \\(\varphi_i\\) carries irreducible estimation error \\(\sigma_i^2 = \sigma_\text{model}^2 + \sigma_\text{sensor}^2\\), where \\(\sigma_\text{model}^2\\) is the model residual variance and \\(\sigma_\text{sensor}^2\\) is proxy sensor measurement noise. The MAPE-K Analyze phase must treat \\(\hat{h}_i \pm k\sigma_i\\) as the health estimate, not \\(\hat{h}_i\\) as a point truth.

<span id="prop-47"></span>
**Proposition 47** (Gateway Signal Coverage Condition). *A gateway \\(G = (H, O, \varphi, A, \Gamma)\\) provides valid synthetic observability to the MAPE-K loop if and only if the following three conditions hold for every health metric \\(h_i \in H\\):*

{% katex(block=true) %}
\begin{aligned}
(\text{Coverage})    &\quad \exists\;\varphi_i : O \to \hat{h}_i \;\text{ with }\; \mathbb{E}\!\left[|\hat{h}_i - h_i|\right] \leq \delta_i \\[4pt]
(\text{Timeliness})  &\quad T_\text{infer}(o \to \hat{h}_i) \leq T_\text{monitor} \\[4pt]
(\text{Uncertainty}) &\quad \sigma_i \leq \sigma_{\text{threshold},i}
\end{aligned}
{% end %}

*where \\(\delta_i\\) is the acceptable bias for metric \\(h_i\\), \\(T_\text{monitor}\\) is the MAPE-K monitor period, and \\(\sigma_{\text{threshold},i}\\) is the maximum uncertainty the anomaly detector can tolerate while maintaining its false-alarm guarantee (Prop 3).*

*Proof sketch*: If Coverage holds, the Analyze phase operates on a \\(\delta_i\\)-biased estimate, expanding the anomaly detection threshold by \\(k\delta_i\\). If Timeliness holds, the Monitor phase is not stale — inference completes within one monitoring window. If Uncertainty holds, the false-alarm rate of Prop 3 is preserved: substituting {% katex() %}\hat{h}_i \pm \sigma_i{% end %} into the threshold criterion expands the effective threshold by at most \\(k\sigma_i\\), which stays within the design margin when \\(\sigma_i \leq \sigma_{\text{threshold},i}\\). If any condition fails, monitoring quality for that metric degrades to at most Heartbeat-Only (L0) level. \\(\square\\)

**OUTPOST calibration**: At commissioning, the thermal model achieves mean absolute error \\(3.2^\circ\text{C}\\) — below \\(\delta_T = 5^\circ\text{C}\\). Inference runs in 2ms on the gateway ARM processor — below \\(T_\text{monitor} = 5\text{s}\\). Cold-start uncertainty (first 30 seconds before \\(\tau_\text{th}\\) stabilizes) produces \\(\sigma_T = 8^\circ\text{C}\\), exceeding \\(\sigma_\text{threshold} = 5^\circ\text{C}\\): the gateway signals "thermal state uncertain" and the MAPE-K loop withholds temperature-dependent healing decisions until \\(s(t) > 30\text{s}\\).

<span id="def-50"></span>
**Definition 50** (Legacy Recovery Cascade). A *Legacy Recovery Cascade* for hardware \\(D\\) is an ordered sequence of recovery tiers \\(\mathcal{T} = \langle T_1, T_2, T_3, T_4 \rangle\\), where each tier \\(T_k\\) is a tuple \\((\text{pre}_k, \text{act}_k, \text{post}_k, W_k, C_k)\\):

- \\(\text{pre}_k\\): pre-condition predicate that must hold before \\(T_k\\) may execute
- \\(\text{act}_k\\): the physical actuation sequence (ordered primitives from \\(A\\))
- \\(\text{post}_k\\): post-condition predicate verifying that the tier had effect
- \\(W_k\\): recovery observation window [s] — time to wait before evaluating \\(\text{post}_k\\)
- \\(C_k\\): cooldown period [s] — minimum time between successive invocations of tier \\(k\\)

The cascade executes tiers in order, advancing to \\(T_{k+1}\\) only if \\(\text{post}_k\\) evaluates false after \\(W_k\\) seconds.

**OUTPOST generator cascade**:

| Tier | Action | Pre-condition | Post-condition | Window | Cooldown |
| :--- | :--- | :--- | :--- | ---: | ---: |
| \\(T_1\\) | Modbus soft reset | Link up; engine below \\(90^\circ\text{C}\\) | Op state = RUNNING within 30s | 30s | 60s |
| \\(T_2\\) | Controlled stop then start (GPIO) | Engine below \\(70^\circ\text{C}\\); at least 60s since \\(T_1\\) | Current resumes baseline +/-10 A | 45s | 300s |
| \\(T_3\\) | Full power cycle via relay | At least 5 min since \\(T_2\\); fuel above 20% | Op state = RUNNING and current above 0 | 60s | 900s |
| \\(T_4\\) | Human escalation | All prior tiers failed; mission at or below BOM threshold | Operator acknowledged | — | — |

<span id="prop-48"></span>
**Proposition 48** (Recovery Cascade Correctness). *Let \\(D_\text{recovery}\\) be the deadline by which the MAPE-K healing loop must restore \\(D\\) to an operational state. The Legacy Recovery Cascade \\(\mathcal{T}\\) satisfies the healing deadline (Prop 8) if:*

{% katex(block=true) %}
\sum_{k=1}^{K^*} \left(W_k + C_k + t_{\text{act},k}\right) \leq D_\text{recovery}
{% end %}

*where \\(K^\*\\) is the highest tier that must be attempted before declaring the device failed, and \\(t_{\text{act},k}\\) is the actuation duration of tier \\(k\\). Additionally, the thermal pre-condition {% katex() %}\hat{T}_\text{engine} < T_{\max,k}{% end %} must hold at each tier boundary; if violated, the cascade suspends until the thermal model predicts cooling below the threshold.*

*Proof*: By induction on tier index. Base: \\(T_1\\) executes if {% katex() %}\text{pre}_1{% end %} holds and completes in \\(t_{\text{act},1} + W_1\\). Inductive step: if \\(T_k\\) fails ({% katex() %}\text{post}_k{% end %} is false), the cascade advances to {% katex() %}T_{k+1}{% end %} after cooldown \\(C_k\\). Total elapsed time at tier \\(K^\*\\) is \\(\sum_{k=1}^{K^\*}(t_{\text{act},k} + W_k + C_k)\\). Deadline satisfaction follows. The thermal suspension is correct: a hot restart at \\(\hat{T}_\text{engine} > 90^\circ\text{C}\\) risks mechanical seizure, converting a recoverable fault into permanent failure. \\(\square\\)

**OUTPOST worst case**: \\(D_\text{recovery} = 90\\) min (MVS requirement: backup power within 90 minutes of primary failure). Attempting \\(T_1 \to T_2 \to T_3\\) in sequence: \\((30+60) + (45+300) + (60+900) = 1395\\text{s} = 23.25\\) min — well within the deadline. If the generator is hot at failure (\\(\hat{T}_\text{engine} = 92^\circ\text{C}\\)), the cascade suspends \\(T_1\\) and \\(T_2\\) until cooling. Using the thermal model, cooldown from \\(92^\circ\text{C}\\) to \\(70^\circ\text{C}\\) at ambient \\(30^\circ\text{C}\\):

{% katex(block=true) %}
t_\text{cool} = \tau_\text{th} \cdot \ln\!\left(\frac{92 - 30}{70 - 30}\right) \approx 1800 \cdot \ln(1.55) \approx 756\;\text{s} \approx 12.6\;\text{min}
{% end %}

Total cascade time with thermal wait: \\(12.6 + 23.25 = 35.85\\) min — still within the 90-minute deadline, but consuming 40% of the available budget, leaving limited margin if \\(T_3\\) also fails.

---

## Cascade Prevention

### Resource Contention During Recovery

Healing consumes the resources needed for normal operation:
- **CPU**: {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} analysis, action planning, coordination
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

Formally, the goal is to minimize total weighted completion time across all pending healing actions, where each action \\(i\\) carries a priority weight \\(w_i\\) and a completion time \\(C_i\\).

{% katex(block=true) %}
\min \sum_i w_i \cdot C_i
{% end %}

Classic scheduling algorithms (shortest job first, weighted shortest job first) apply directly.

### Thundering Herd from Synchronized Restart

After a partition heals, multiple nodes may attempt simultaneous healing. This **thundering herd** can overwhelm shared resources.

Scenario: {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} of 12 vehicles experiences 30-minute partition. During partition, vehicles 3, 5, and 9 developed issues requiring healing but couldn't coordinate with convoy lead. When partition heals, all three simultaneously:
- Request lead approval for healing
- Download healing policies
- Execute restart sequences
- Upload health status

The convoy's limited bandwidth is overwhelmed. Healing takes longer than if coordinated sequentially.

**Jittered restarts**: Each node draws a random delay uniformly from \\([0, T_{\text{jitter}}]\\) and waits that long after the partition ends before initiating its healing sequence, spreading simultaneous arrivals across the jitter window.

{% katex(block=true) %}
t_{\text{heal}} = t_{\text{partition-end}} + \text{Uniform}(0, T_{\text{jitter}})
{% end %}

The effect on load is dramatic: without jitter all \\(n\\) nodes hit at once at rate \\(n \cdot \lambda\\); with jitter the average load is reduced by the window length \\(T\\).

{% katex(block=true) %}
\text{Peak load (no jitter)} = n \cdot \lambda
{% end %}

{% katex(block=true) %}
\text{Average load (with jitter)} = \frac{n \cdot \lambda}{T}
{% end %}

Jitter spreads load over time, preventing spike.

**Staged recovery**: Define recovery waves. Wave 1 heals highest-priority nodes. Wave 2 waits for Wave 1 to complete.

*Formal comparison*: With \\(k\\) waves of \\(n/k\\) nodes each, staged recovery achieves:

{% katex(block=true) %}
\text{Var}[T_{\text{recovery}}^{\text{staged}}] = \frac{1}{k} \cdot \text{Var}[T_{\text{recovery}}^{\text{jitter}}]
{% end %}

For \\(k = 3\\) waves, variance reduces by factor of 3, providing tighter bounds on total recovery time at the cost of \\(k-1\\) synchronization barriers.

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

Between each escalation level, the system waits an exponentially increasing observation window: at level \\(k\\) with base wait \\(t_0\\), the wait doubles with each level so that higher-severity interventions receive more time to demonstrate success before further escalation is triggered.

{% katex(block=true) %}
t_{\text{wait}}(k) = t_0 \cdot 2^k
{% end %}

Where \\(k\\) is the level and \\(t_0\\) is base wait time.

After action at level \\(k\\), wait \\(t_{\text{wait}}(k)\\) before concluding it failed and escalating to level \\(k+1\\).

**Multi-armed bandit formulation**: Each healing action is an "arm" with unknown success probability. The healing controller must explore (try different actions to learn effectiveness) and exploit (use actions known to work).

The Upper Confidence Bound ({% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}) algorithm provides optimal exploration-exploitation tradeoff:

{% katex(block=true) %}
\text{UCB}(a) = \hat{p}_a + c\sqrt{\frac{\ln t}{n_a}}
{% end %}

where \\(\hat{p}_a\\) is the estimated success probability for action \\(a\\), \\(n_a\\) is the attempt count for action \\(a\\), and \\(t\\) is total attempts across all actions. The exploration bonus \\(c\sqrt{\ln t / n_a}\\) grows for under-tried actions, ensuring eventual exploration.

*Derivation*: The exploration term follows from Hoeffding's inequality. For a random variable bounded in \\([0,1]\\), \\(P(|\hat{p} - p| > \epsilon) \leq 2e^{-2n\epsilon^2}\\). Setting \\(\epsilon = c\sqrt{\ln t / n}\\) yields confidence that scales appropriately with sample count.

Select the action with highest {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}. This naturally balances known-good actions with under-explored alternatives.

**Regret bound**: {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} achieves \\(R_T = O(\sqrt{KT \ln T})\\) where \\(K\\) is the number of actions and \\(T\\) is episodes. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with \\(K = 6\\) healing actions over \\(T = 100\\) episodes, expected regret is bounded by \\(\sim 53\\) suboptimal decisions—the system converges to near-optimal healing policy within the first deployment month.

---

## Model Scope and Failure Envelope

Before extending the framework with game-theoretic and RL methods, we bound its validity.

Each mechanism has bounded validity. When assumptions fail, so does the mechanism.

### MAPE-K Stability Analysis

**Validity Domain**:

The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} stability analysis holds only when the system state \\(S\\) satisfies all three assumptions simultaneously; violations narrow or eliminate the domain within which \\(K\tau < \pi/2\\) guarantees stability.

{% katex(block=true) %}
\mathcal{D}_{\text{MAPE-K}} = \{S \mid A_1 \land A_2 \land A_3\}
{% end %}

where:
- \\(A_1\\): System dynamics are approximately linear near operating point
- \\(A_2\\): Feedback delay \\(\tau\\) is approximately constant
- \\(A_3\\): No nested feedback loops (healing action does not affect its own sensing)

**Stability Criterion**: \\(K \cdot \tau < \pi/2\\) ensures stability under linear approximation.

The following table maps each assumption violation to its observable symptom, how to detect it, and a concrete engineering mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Nonlinear dynamics | Oscillation at large perturbations | Amplitude exceeds linear regime | Gain scheduling; saturation limits |
| Variable delay | Unpredictable oscillation | Delay variance high | Robust controller design |
| Nested feedback | Instability; runaway | Correlation between action and sensor | Decouple sensing from action |

**Counter-scenario**: A healing action that restores a sensor affects the very metric being monitored (e.g., restarting a process causes temporary CPU spike). The stability analysis assuming independent sensing does not apply. Detection: correlation coefficient between healing actions and subsequent sensor anomalies exceeds 0.5.

### UCB Action Selection

**Validity Domain**:

{% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}'s regret bound \\(O(\sqrt{TK \ln T})\\) holds only when the reward distribution is stable and actions can be safely retried; the validity domain captures these preconditions formally.

{% katex(block=true) %}
\mathcal{D}_{\text{UCB}} = \{S \mid B_1 \land B_2 \land B_3\}
{% end %}

where:
- \\(B_1\\): Reward distribution is stationary over learning horizon
- \\(B_2\\): Actions are repeatable (can try same action multiple times)
- \\(B_3\\): Rewards are bounded in \\([0, 1]\\)

**Regret Bound**: \\(O(\sqrt{TK \ln T})\\) holds under stated assumptions.

The table below describes what goes wrong when each {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} assumption is violated, the observable signal that reveals the violation, and the recommended corrective design.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Non-stationary environment | Converges to stale optimum | Performance decline over time | Sliding window; discounted UCB |
| Catastrophic actions | Cannot learn from irreversible failure | Action leads to system loss | Action cost constraints; simulation |
| Sparse rewards | Slow convergence | Samples per action < 10 | Prior from similar contexts |

**Uncertainty bound**: Practical convergence requires \\(T > 10K\\) where \\(K\\) is number of actions. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with 5 healing actions, meaningful learning requires 50+ samples. Novel failures with < 10 samples should use conservative defaults.

### Staged Recovery

**Validity Domain**:

Staged recovery reduces completion-time variance only when each stage can be verified independently and reversed if it fails; the domain excludes systems where those conditions do not hold.

{% katex(block=true) %}
\mathcal{D}_{\text{staged}} = \{S \mid C_1 \land C_2 \land C_3\}
{% end %}

where:
- \\(C_1\\): Recovery stages are independently verifiable
- \\(C_2\\): Partial success is detectable (intermediate states observable)
- \\(C_3\\): Rollback is possible at each stage

The table below shows what breaks when staged recovery's assumptions do not hold, and the corresponding engineering response.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Atomic failures | Cannot decompose; all-or-nothing | Recovery has no checkpoints | Accept atomic recovery |
| Unobservable intermediate | Cannot verify stage completion | Verification timeout | Probabilistic advancement |
| No rollback | Partial recovery may be worse | Rollback fails | Forward-only with safeguards |

**Counter-scenario**: Database corruption where partial recovery may leave inconsistent state. Staged recovery may be worse than atomic restore from backup. Detection: data integrity checks fail after partial recovery. Response: atomic restore is preferred for integrity-critical systems.

### Cascade Prevention

**Validity Domain**:

Resource quotas and dependency ordering prevent cascade only when the dependency graph is known, resource pools can be isolated, and each healing action consumes a bounded share of those pools.

{% katex(block=true) %}
\mathcal{D}_{\text{cascade}} = \{S \mid D_1 \land D_2 \land D_3\}
{% end %}

where:
- \\(D_1\\): Failure dependencies are known and acyclic
- \\(D_2\\): Resource pools are isolable
- \\(D_3\\): Healing actions have bounded resource cost

The table below identifies the three main ways cascade prevention breaks down, the observable signal in each case, and the mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Hidden dependencies | Cascade propagates unexpectedly | Correlated failures | Dependency discovery; testing |
| Shared resource pools | Healing exhausts shared resources | Resource contention | Resource isolation; budgets |
| Unbounded healing cost | Healing action triggers cascade | Healing resource > available | Cost limits; staged healing |

### Summary: Claim-Assumption-Failure Table

The summary table below consolidates all four mechanisms into a single reference, showing the essential claim, the assumptions that support it, and the conditions under which each claim breaks down.

| Claim | Key Assumptions | Valid When | Fails When |
| :--- | :--- | :--- | :--- |
| MAPE-K converges | Linear dynamics, constant delay | Small perturbations | Large failures; variable delay |
| UCB minimizes regret | Stationary environment, repeatable | Stable system | Non-stationary; catastrophic actions |
| Staged recovery reduces variance | Stages separable, observable | Modular recovery | Atomic failures; unobservable |
| Cascade prevention isolates failures | Dependencies known, resources isolable | Well-understood system | Hidden dependencies; shared resources |

---

### Reinforcement Learning for Adaptive Recovery

{% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} treats healing actions as independent arms. In practice, optimal healing depends on **context**: failure type, system state, resource availability, and environmental conditions. Reinforcement learning (RL) learns context-dependent healing policies.

**Contextual Bandits for State-Dependent Healing**

Contextual bandits extend {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} by selecting the action that maximizes a linear reward estimate \\(\theta_a^T x\\) for the current context vector \\(x\\), plus a confidence-weighted exploration bonus that is large when the covariance \\(A_a^{-1}\\) indicates the action is under-explored in this region of the context space.

{% katex(block=true) %}
a^* = \arg\max_a \left[ \theta_a^T x + \alpha \sqrt{x^T A_a^{-1} x} \right]
{% end %}

where \\(x\\) is the context vector (failure features), \\(\theta_a\\) is the learned parameter for action \\(a\\), and \\(A_a\\) is the covariance matrix tracking uncertainty.

**Context features for healing decisions**:

These six features form the context vector \\(x\\) that LinUCB conditions on; the Range column indicates what the endpoints represent for each feature.

| Feature | Description | Range |
| :--- | :--- | :--- |
| \\(x_1\\) | Failure severity (from anomaly score) | [0 = nominal, 1 = critical] |
| \\(x_2\\) | Time since last healing | \\([0, \infty)\\) normalized |
| \\(x_3\\) | Resource availability (power, CPU) | [0 = depleted, 1 = full capacity] |
| \\(x_4\\) | Connectivity state | {0, 0.33, 0.67, 1} |
| \\(x_5\\) | Cluster health (avg neighbor status) | [0 = all failed, 1 = all healthy] |
| \\(x_6\\) | Mission criticality | [0 = routine, 1 = mission-critical] |

**LinUCB for {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} healing**:

The diagram below traces a single decision cycle: context features are extracted, scored against each action's {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} value, and the highest-scoring action is selected and used to update the model.

{% mermaid() %}
graph TD
    subgraph "Context Extraction"
        F["Failure detected<br/>Anomaly score: 0.85"]
        S["State features<br/>x = [0.85, 0.2, 0.6, 0.67, 0.9, 0.7]"]
    end

    subgraph "LinUCB Policy"
        A1["Restart (a1)<br/>UCB: 0.72"]
        A2["Reconfigure (a2)<br/>UCB: 0.81"]
        A3["Reboot (a3)<br/>UCB: 0.65"]
        A4["Failover (a4)<br/>UCB: 0.78"]
    end

    subgraph "Execution"
        E["Execute a2<br/>Observe outcome"]
        U["Update theta2, A2"]
    end

    F --> S
    S --> A1
    S --> A2
    S --> A3
    S --> A4
    A2 -->|"max UCB"| E
    E --> U

    style A2 fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
{% end %}

**Sample efficiency**: LinUCB's regret bound \\(O(d\sqrt{T \ln T})\\) scales with feature dimension \\(d\\) rather than action count \\(K\\), providing better sample efficiency when \\(d < K\\). Context features enable generalization—a healing action effective for high-severity failures can be immediately applied to new high-severity failures without re-exploration.

**Deep Reinforcement Learning for Complex Healing**

When the healing problem involves sequential decisions and complex state spaces, deep RL provides more expressive policies.

**Policy Network Architecture for Healing**:

The diagram below shows how state history passes through an embedding and recurrent layer before splitting into a policy head (action probabilities) and a value head (expected return), the two outputs that drive actor-critic training.

{% mermaid() %}
graph LR
    subgraph "Input"
        S["State<br/>32 features"]
        H["History<br/>Last 5 states"]
    end

    subgraph "Network"
        E["Embedding<br/>32 to 16"]
        L["LSTM<br/>16 x 5 to 32"]
        P["Policy head<br/>32 to K actions"]
        V["Value head<br/>32 to 1"]
    end

    S --> E
    H --> E
    E --> L
    L --> P
    L --> V

    style P fill:#e3f2fd,stroke:#1976d2
    style V fill:#fff3e0,stroke:#f57c00
{% end %}

**Actor-Critic for edge deployment**:

The policy (actor) selects healing actions; the value function (critic) estimates expected future reward:

{% katex(block=true) %}
\begin{aligned}
\pi_\theta(a|s) &= \text{softmax}(f_\theta(s)) && \text{(policy)} \\
V_\phi(s) &= g_\phi(s) && \text{(value)}
\end{aligned}
{% end %}

PPO maximizes the policy objective \\(L(\theta)\\) by taking the minimum of the unclipped and clipped probability-ratio objective, preventing any single update from moving the policy too far from the previous version and thus avoiding destructive overshooting.

{% katex(block=true) %}
L(\theta) = \mathbb{E}\left[\min\left(r_t(\theta) A_t, \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon) A_t\right)\right]
{% end %}

where \\(r_t(\theta) = \pi_\theta(a_t|s_t) / \pi_{\theta_{\text{old}}}(a_t|s_t)\\) is the probability ratio and \\(A_t\\) is the advantage estimate.

**Model size for edge**:
- State embedding: \\(32\times16 = 512\\) parameters
- LSTM: \\(4\times(16+32)\times32 = 6{,}144\\) parameters
- Policy head: \\(32\times6 = 192\\) parameters
- Value head: \\(32\times1 = 32\\) parameters
- **Total: 6,880 parameters = ~27 KB** (float32)

**Training approach**:
1. **Simulation pretraining**: Train in simulated environment with synthetic failures
2. **Deployment fine-tuning**: Continue learning from real failures with reduced learning rate
3. **Policy distillation**: Compress large trained policy into edge-deployable network

**Healing Policy Comparison** (theoretical bounds):

Each row reports the asymptotic regret bound, sample complexity to reach \\(\epsilon\\)-optimality, and the limiting success rate, showing the progression from fixed rules through deep RL.

| Method | Regret Bound | Convergence | Success Rate Bound |
| :--- | :--- | :--- | :--- |
| Fixed rules | \\(\Omega(T)\\) (linear) | N/A | \\(p_{\text{best rule}}\\) |
| UCB bandit | \\(O(\sqrt{KT \ln T})\\) | \\(O(K^2/\epsilon^2)\\) | \\(1 - O(1/\sqrt{T})\\) |
| LinUCB | \\(O(d\sqrt{T \ln T})\\) | \\(O(d^2/\epsilon^2)\\) | \\(1 - O(d/\sqrt{T})\\) |
| PPO | \\(O(1/\sqrt{T})\\) | \\(O(1/\epsilon^2)\\) | \\(\to \pi^*\\) (optimal) |

**Utility ordering derivation**: Let \\(U_i = \sum_t r_t^{(i)}\\) be cumulative reward for method \\(i\\).

{% katex(block=true) %}
U_{\text{PPO}} > U_{\text{LinUCB}} > U_{\text{UCB}} > U_{\text{fixed}}
{% end %}

follows from tighter regret bounds and context-awareness. PPO's policy gradient exploits state structure; LinUCB exploits linear reward structure; {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} exploits only action averages; fixed rules have no adaptation.

**Model-Based RL for Sample Efficiency**

Edge systems have limited failure data. Model-based RL learns a dynamics model {% katex() %}\hat{s}_{t+1} = f_\psi(s_t, a_t){% end %} and plans using it, enabling policy improvement from synthetic rollouts without requiring many real failures. For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}, where sensor failures occur roughly once per 30 days, the model is initialized from similar deployments, updated after each real failure, and then used to generate 100+ synthetic rollouts for policy improvement—reducing real-world sample requirements substantially relative to model-free approaches.

**Safe Reinforcement Learning with Constraints**

Healing actions have constraints: power budget, time limits, safety requirements. Unlike unconstrained RL, Safe RL finds the policy \\(\pi\\) that maximizes discounted cumulative reward while simultaneously keeping the discounted cumulative cost of each constraint \\(i\\) below its threshold \\(d_i\\), so that power, cascade risk, and time violations are penalized structurally rather than through a hand-tuned reward term.

{% katex(block=true) %}
\max_\pi \mathbb{E}\left[\sum_t \gamma^t R(s_t, a_t)\right] \quad \text{subject to} \quad \mathbb{E}\left[\sum_t \gamma^t C_i(s_t, a_t)\right] \leq d_i \quad \forall i
{% end %}

where \\(C_i\\) are cost functions and \\(d_i\\) are constraint thresholds.

**Constraint types for edge healing**:

The table maps each operational constraint to its cost function \\(C_i\\) and the threshold \\(d_i\\) that CPO must not exceed.

| Constraint | Cost Function | Threshold |
| :--- | :--- | :--- |
| Power budget | Energy consumed by healing | 10% of battery |
| Cascade risk | P(healing causes secondary failure) | 5% |
| Time bound | Recovery duration | 5 minutes |
| Service level | Capability degradation during healing | \\(\mathcal{L}_1\\) minimum |

**Constrained Policy Optimization (CPO)**:

Each CPO policy update finds the parameter \\(\theta_{k+1}\\) that maximizes the objective \\(L(\theta)\\) subject to two constraints: the KL divergence from the old policy must not exceed \\(\delta\\) (keeping updates small), and the expected cumulative cost of every constraint \\(i\\) must remain at or below its threshold \\(d_i\\).

{% katex(block=true) %}
\theta_{k+1} = \arg\max_\theta L(\theta) \quad \text{s.t.} \quad D_{\text{KL}}(\pi_\theta || \pi_{\theta_k}) \leq \delta, \quad J_{C_i}(\pi_\theta) \leq d_i
{% end %}

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} safe healing example**:

Drone healing must not deplete battery below safe return threshold. CPO learns to:
- Prefer low-energy healing actions (reconfigure > reboot)
- Delay healing if battery is marginal
- Accept slightly lower success rate to preserve energy margin

The utility loss \\(\Delta U\\) of using CPO instead of the unconstrained policy equals the Lagrange multiplier \\(\lambda^*\\) multiplied by how much the unconstrained policy would have exceeded the constraint threshold \\(d\\), quantifying the cost of the safety guarantee.

{% katex(block=true) %}
\Delta U = U_{\text{CPO}} - U_{\text{unconstrained}} = -\lambda^* \cdot (d - J_C(\pi^*_{\text{unc}}))
{% end %}

where \\(\lambda^*\\) is the optimal Lagrange multiplier. CPO trades a lower success rate for a hard constraint-satisfaction guarantee: it never violates constraints by construction, while the unconstrained policy violates them with probability \\(\epsilon_C > 0\\).

{% katex(block=true) %}
P(\text{CPO violates}) = 0, \quad P(\text{unconstrained violates}) = \epsilon_C > 0
{% end %}

\\(\text{sign}(\Delta U) < 0\\) but bounded: the constraint guarantee has value \\(V_{\text{constraint}}\\) such that total utility \\(U_{\text{CPO}} + V_{\text{constraint}} > U_{\text{unconstrained}}\\) when constraint violation is catastrophic.

**Hierarchical RL for Multi-Level Healing**

Healing operates at multiple levels (component, node, cluster, fleet). Hierarchical RL decomposes the problem: each tier learns a simpler policy scoped to its level, enabling temporal abstraction (high-level decides "what," low-level decides "how") and modularity (low-level policies reusable across deployments).

{% mermaid() %}
graph TD
    subgraph "High-Level Policy (Fleet)"
        HLP["Fleet healer<br/>Decides: which cluster"]
    end

    subgraph "Mid-Level Policy (Cluster)"
        MLP1["Cluster healer 1<br/>Decides: which node"]
        MLP2["Cluster healer 2<br/>Decides: which node"]
    end

    subgraph "Low-Level Policy (Node)"
        LLP1["Node healer<br/>Decides: which action"]
        LLP2["Node healer<br/>Decides: which action"]
    end

    HLP -->|"heal cluster 1"| MLP1
    HLP -->|"monitor"| MLP2
    MLP1 -->|"heal node 3"| LLP1
    MLP1 -->|"monitor"| LLP2

    style HLP fill:#e3f2fd,stroke:#1976d2
    style MLP1 fill:#fff3e0,stroke:#f57c00
    style LLP1 fill:#e8f5e9,stroke:#388e3c
{% end %}

**Transfer Learning Across Scenarios**

{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}, {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}, and {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} share healing patterns. Transfer learning leverages this:

{% katex(block=true) %}
\theta_{\text{target}} = \theta_{\text{source}} + \Delta\theta_{\text{fine-tune}}
{% end %}

**Transfer from {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} to {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}**:

1. **Shared representation**: State embedding layer transfers (both have connectivity, power, health features)
2. **Policy adaptation**: Policy head retrained on {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}-specific actions
3. **Value fine-tuning**: Value function recalibrated for {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} reward scale

**Transfer efficiency bound**:

Learning from scratch to \\(\epsilon\\)-optimality requires \\(O(|S||A|/\epsilon^2)\\) samples — proportional to the full state-action space — while transfer learning from a related source policy reduces this to \\(O(d_{\text{diff}}/\epsilon^2)\\), where \\(d_{\text{diff}}\\) is the \\(L_1\\) distance between source and target transition dynamics.

{% katex(block=true) %}
N_{\text{scratch}} = O\left(\frac{|S||A|}{\epsilon^2}\right), \quad N_{\text{transfer}} = O\left(\frac{d_{\text{diff}}}{\epsilon^2}\right)
{% end %}

where \\(d_{\text{diff}} = \|P_{\text{target}} - P_{\text{source}}\|_1\\) is the domain difference.

The table below shows how domain similarity translates into concrete sample savings: the closer the source and target dynamics, the smaller \\(d_{\text{diff}}\\), and the larger the fraction of training samples that transfer replaces.

| Target | Domain Diff \\(d_{\text{diff}}\\) | Complexity Ratio | Sample Reduction |
| :--- | :--- | :--- | :--- |
| Similar (e.g., drone-to-drone) | \\(O(0.1)\\) | \\(O(0.1)\\) | \\(\approx 90\\%\\) |
| Related (e.g., drone-to-vehicle) | \\(O(0.3)\\) | \\(O(0.3)\\) | \\(\approx 70\\%\\) |
| Distant (e.g., drone-to-building) | \\(O(0.5)\\) | \\(O(0.5)\\) | \\(\approx 50\\%\\) |

\\(\text{sign}(\Delta N) < 0\\) (transfer reduces samples) when \\(d_{\text{diff}} < |S||A|\\)—i.e., when source and target share structure.

**Meta-Learning for Rapid Adaptation**: MAML trains an initialization \\(\theta^*\\) across diverse healing scenarios so that the policy can fine-tune to a new scenario in 5-10 episodes rather than 100+. This is essential for novel deployments where collecting large amounts of real healing experience is impractical before the system must operate.

**Online vs Offline RL Tradeoffs**

The three training regimes differ in where data comes from, whether unsafe exploration is possible during training, and how efficiently each uses the available healing experience.

| Approach | Data Source | Safety | Sample Efficiency |
| :--- | :--- | :--- | :--- |
| Online RL | Real-time interaction | Risk of bad actions | Lower |
| Offline RL | Historical logs | Safe (no exploration) | Higher |
| Hybrid | Offline pretrain + online fine-tune | Balanced | Best |

**Recommended approach for edge healing**:
1. **Offline phase**: Train on historical healing logs (no risk)
2. **Simulation phase**: Fine-tune in simulated environment (controlled risk)
3. **Deployment phase**: Conservative online updates with safety constraints (managed risk)

This progression minimizes risk while enabling continuous improvement from operational experience.

---

## RAVEN Self-Healing Protocol

Return to Drone 23's battery failure. How does the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm heal?

### Healing Decision Analysis

Drone 23's battery alert propagates via gossip. Within 15 seconds, all swarm members know Drone 23's status. Each drone's local analyzer assesses impact: Drone 23 will fail in 8 minutes; if it fails in place, a coverage gap opens on the eastern sector with potential crash in contested area; if it returns, neighbors must expand coverage.

Cluster lead (Drone 1) selects the optimal action by evaluating expected mission value for each alternative:

{% katex(block=true) %}
a^* = \arg\max_a E[V | a] \quad \text{subject to} \quad P(\text{catastrophic} | a) < \epsilon
{% end %}

The trade-off is **coverage preservation against asset recovery**. Compression maintains formation integrity but sacrifices coverage area. Return to base preserves the drone but requires neighbor expansion. **Proactive extraction dominates passive observation** when asset value exceeds the coverage loss—get the degraded asset out rather than watching it fail in place.

The cluster lead broadcasts the healing plan. Within one second, neighbors acknowledge sector expansion and Drone 23 acknowledges its return path. Formation adjustment completes in roughly 8 seconds. Drone 23 departs, neighbors restore coverage to \\(\mathcal{L}_2\\), and twelve minutes later Drone 23 reports safe landing at base.

### Healing Coordination Under Partition

What if the swarm is partitioned during healing?

Scenario: Seconds into coordination, jamming creates partition. Drones 30-47 (eastern cluster) cannot receive healing plan.

Fallback protocol:
1. Eastern cluster detects loss of contact with Drone 1 (cluster lead)
2. Drone 30 assumes local lead role for eastern cluster
3. Drone 30 independently detects Drone 23's status from cached gossip
4. Eastern cluster executes local healing plan (may differ from western cluster's plan)

Post-reconnection reconciliation compares healing logs from both clusters, verifies formation consistency, and merges any conflicting state using commutative, associative, idempotent merge operations—ensuring that applying updates in any order produces the same final state.

### Edge Cases

**What if neighbors also degraded?**

If Drones 21, 22, 24, 25 all have elevated failure risk, they cannot safely expand coverage. The healing plan must account for cascading risk.

Before accepting any healing plan, the system checks joint stability: all affected nodes must remain healthy throughout the healing window, so the probability of a stable outcome is the product of each individual node's health probability across the affected set \\(\text{affected}\\).

{% katex(block=true) %}
P(\text{healing stable}) = \prod_{i \in \text{affected}} P(\text{node } i \text{ healthy during healing})
{% end %}

If \\(P(\text{healing stable}) < 0.8\\), reject the healing plan and try alternative (perhaps Option C compression).

**What if path home is contested?**

Drone 23's return route passes through adversarial coverage. Risk of intercept during return.

Solution: Incorporate threat model into path planning. Choose return route that minimizes \\(P(\text{intercept}) \cdot C(\text{loss})\\). Accept longer route if safer.

---

## CONVOY Self-Healing Protocol

Vehicle 4 experiences engine failure during mountain transit. The {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} healing protocol differs from {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s due to ground vehicle constraints.

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

The reward function combines four weighted terms: mission completion value \\(V_{\text{mission}}\\) minus time cost, asset loss cost, and security risk cost, with weights \\(w_i\\) encoding the mission's priority ordering among these objectives.

{% katex(block=true) %}
R(s, a) = w_1 \cdot V_{\text{mission}}(s, a) - w_2 \cdot C_{\text{time}}(s, a) - w_3 \cdot C_{\text{asset}}(s, a) - w_4 \cdot C_{\text{risk}}(s, a)
{% end %}

The weights \\(w_i\\) encode mission priorities—time-critical missions weight \\(w_2\\) heavily; asset-preservation missions weight \\(w_3\\); etc.

The optimal value function \\(V^*(s)\\) satisfies the Bellman equation: the best achievable cumulative reward from state \\(s\\) equals the immediate reward plus the discounted value of the best reachable next state, where \\(\gamma \in [0,1)\\) is the discount factor weighting future versus immediate outcomes.

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

The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensor mesh faces unique healing challenges: remote locations preclude physical intervention, and ultra-low power budgets constrain healing actions.

### Failure Modes and Healing Actions

Each failure mode in the {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} mesh has a characteristic detection signal and a preferred low-energy healing action; the target success rate reflects design goals under nominal environmental conditions.

<style>
#tbl_outpost_healing + table th:first-of-type { width: 20%; }
#tbl_outpost_healing + table th:nth-of-type(2) { width: 25%; }
#tbl_outpost_healing + table th:nth-of-type(3) { width: 30%; }
#tbl_outpost_healing + table th:nth-of-type(4) { width: 25%; }
</style>
<div id="tbl_outpost_healing"></div>

| Failure Mode | Detection | Healing Action | Target Success Rate* |
| :--- | :--- | :--- | :--- |
| Sensor drift | Cross-correlation with neighbors | Recalibration routine | 85% |
| Communication loss | Missing heartbeats | Frequency hop, power increase | 70% |
| Power anomaly | Voltage/current deviation | Load shedding, sleep mode | 90% |
| Software hang | Watchdog timeout | Controller restart | 95% |
| Memory corruption | CRC check failure | Reload from backup | 80% |

*Target rates are design goals; actual rates depend on deployment conditions and calibration.

### Power-Constrained Healing

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} healing actions compete with the power budget. Each healing action consumes energy \\(E_{\text{heal}}\\) equal to the product of action power draw \\(P_{\text{action}}\\) and its duration \\(T_{\text{duration}}\\), plus the fixed communication overhead \\(E_{\text{communication}}\\) for coordinating the action.

{% katex(block=true) %}
E_{\text{heal}} = P_{\text{action}} \cdot T_{\text{duration}} + E_{\text{communication}}
{% end %}

The total energy spent on all healing actions \\(i\\) must not exceed the available reserve minus the minimum energy needed to keep the mission running.

{% katex(block=true) %}
\sum_i E_{\text{heal},i} \leq E_{\text{reserve}} - E_{\text{mission,min}}
{% end %}

Where \\(E_{\text{reserve}}\\) is current battery capacity and \\(E_{\text{mission,min}}\\) is minimum energy required to maintain mission capability.

**Healing action scheduling**: When multiple healing actions compete for the limited energy budget, the priority score below ranks them by expected capability restored per unit of energy spent, ensuring the most energy-efficient healings execute first.

{% katex(block=true) %}
\text{Priority}(a) = \frac{V_{\text{restored}}(a) \cdot P_{\text{success}}(a)}{E_{\text{heal}}(a)}
{% end %}

### Mesh Reconfiguration

When a sensor fails beyond repair, the mesh must reconfigure; the diagram shows how neighbors of the failed Sensor 3 extend their sensitivity to partially cover the gap while the dashed arrow marks the coverage zone that remains degraded.

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

The net extended coverage sums the original field of view, the marginal gains \\(\Delta\text{Coverage}_j\\) contributed by each neighbor \\(j \in \mathcal{N}\\) that extends its sensitivity, minus the Overlap between those extended zones to avoid double-counting.

{% katex(block=true) %}
\text{Coverage}_{\text{extended}} = \text{Coverage}_{\text{original}} + \sum_{j \in \mathcal{N}} \Delta\text{Coverage}_j - \text{Overlap}
{% end %}

Full coverage is rarely achievable—the goal is minimizing the detection gap.

### Fusion Node Failover

If a fusion node fails, its sensor cluster must find an alternative:

**Primary**: Route through alternate fusion node (if reachable)
**Secondary**: Peer-to-peer mesh among sensors, with one sensor acting as temporary aggregator
**Tertiary**: Each sensor operates independently with local decision authority

The fusion state at time \\(t\\) is determined by a priority cascade: use the primary fusion node while reachable, fall back to the alternate fusion node if primary is lost, and revert to fully autonomous per-sensor operation only when both are unreachable.

{% katex(block=true) %}
\text{FusionState}(t) = \begin{cases}
\text{Primary} & \text{if } \text{Reachable}(F_{\text{primary}}) \\
\text{Secondary} & \text{if } \neg\text{Reachable}(F_{\text{primary}}) \land \text{Reachable}(F_{\text{alt}}) \\
\text{Tertiary} & \text{otherwise}
\end{cases}
{% end %}

Each state has different capability levels and power costs. The system tracks time in each state for capacity planning.

---

<span id="scenario-smartbldg"></span>

## Commercial Application: {% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %} Building Automation

{% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %} manages building automation for commercial high-rise towers. Systems controlled: HVAC, lighting, access control, and fire safety. When the BMS server fails or loses connectivity, subsystems must heal autonomously while maintaining occupant safety and comfort.

**The healing challenge**: Building systems have extreme reliability requirements (fire safety must work always) but limited local compute (PLCs with kilobytes of memory). The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop must be distributed across multiple controllers with varying capabilities.

**Hierarchical {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} for {% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %}**:

The diagram shows four control levels from building-wide BMS down to individual devices, with the key pattern that each level runs its own local {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop so that zone controllers remain autonomous when higher tiers are unreachable.

{% mermaid() %}
graph TD
    subgraph "Building Level"
        BMS["BMS Server<br/>Global optimization<br/>Trend analysis"]
    end

    subgraph "Floor Level (52 floors)"
        FC1["Floor Controller 12<br/>Local MAPE-K<br/>Zone coordination"]
        FC2["Floor Controller 13<br/>Local MAPE-K<br/>Zone coordination"]
        FC3["..."]
    end

    subgraph "Zone Level (4-8 per floor)"
        ZC1["Zone Controller<br/>VAV, lighting<br/>Occupancy response"]
        ZC2["Zone Controller<br/>VAV, lighting<br/>Occupancy response"]
    end

    subgraph "Device Level"
        VAV["VAV Box<br/>Damper, reheat"]
        LIGHT["Lighting<br/>On/off, dim"]
        SENSOR["Sensors<br/>Temp, CO2, motion"]
    end

    BMS -.->|"Setpoints<br/>Schedules"| FC1
    BMS -.->|"Setpoints<br/>Schedules"| FC2
    FC1 --> ZC1
    FC1 --> ZC2
    ZC1 --> VAV
    ZC1 --> LIGHT
    SENSOR --> ZC1

    style BMS fill:#e3f2fd,stroke:#1976d2
    style FC1 fill:#fff3e0,stroke:#f57c00
    style FC2 fill:#fff3e0,stroke:#f57c00
    style ZC1 fill:#e8f5e9,stroke:#388e3c
    style ZC2 fill:#e8f5e9,stroke:#388e3c
{% end %}

**Failure modes and healing authority by tier**:

The table maps each building failure type to its normal and disconnected healing authority, with the Safety Override column showing the inviolable constraint that supersedes all comfort-oriented decisions.

<style>
#tbl_smartbldg_healing + table th:first-of-type { width: 18%; }
#tbl_smartbldg_healing + table th:nth-of-type(2) { width: 27%; }
#tbl_smartbldg_healing + table th:nth-of-type(3) { width: 27%; }
#tbl_smartbldg_healing + table th:nth-of-type(4) { width: 28%; }
</style>
<div id="tbl_smartbldg_healing"></div>

| Failure | Normal Authority | Disconnected Authority | Safety Override |
| :--- | :--- | :--- | :--- |
| VAV damper stuck | Zone Controller | Zone Controller | Full open if fire alarm |
| AHU fan failure | Floor Controller | Floor Controller | Smoke evacuation priority |
| Chiller fault | BMS | Floor Controllers coordinate | Maintain minimum cooling |
| BACnet network down | BMS diagnoses | Local fallback schedules | Fire systems on dedicated net |
| Floor controller crash | BMS restarts | Neighbor floor assists | Zone controllers autonomous |

**{% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} at the zone controller level** (8KB RAM, 16KB flash):

The zone controller implements a minimal {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop:

**Monitor** (every 30 seconds): Read temperature, CO2, occupancy sensors. Compute rolling average and deviation. Memory cost: 200 bytes for 5-minute history.

**Analyze** (event-triggered): Compare readings against setpoints and learned patterns. Flag anomalies:
- Temperature deviation > \\(2^\circ\\)F for > 5 minutes
- CO2 > 1000 ppm (indicates poor ventilation)
- Occupancy detected but HVAC in unoccupied mode

**Plan** (on anomaly): Select from predefined healing actions:
1. Adjust VAV damper position (primary response)
2. Request help from floor controller
3. Override to failsafe (full cooling)

**Execute** (immediate): Send BACnet commands to actuators. Log action for later upload.

**Knowledge** (static + learned): Factory setpoints + learned occupancy patterns + healing action success rates.

**Power-constrained healing parallels {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}**: Zone controllers operate on 24VAC power derived from HVAC transformers. When analyzing healing options, energy is not the binding constraint—actuator wear is, and the healing cost for action \\(a\\) is therefore the per-cycle wear cost \\(C_{\text{actuator cycles}}\\) multiplied by the number of actuator cycles the action requires.

{% katex(block=true) %}
\text{Healing cost} = C_{\text{actuator cycles}} \cdot \text{expected cycles}(a)
{% end %}

VAV dampers are rated for 100,000 cycles. Excessive hunting (oscillating between positions) accelerates wear. The healing policy limits damper adjustments to once per 5 minutes except for safety overrides.

**Cascade prevention during chiller failure**: When a chiller fails on a \\(95^\circ\\)F day, 52 floor controllers simultaneously demand maximum cooling from remaining chillers. Without coordination, this cascades to remaining chiller overload.

{% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %} prevents cascade by allocating the available cooling capacity \\(Q_{\text{available}}\\) proportionally: each floor receives a share weighted by its priority factor and current occupancy, normalized across all floors.

{% katex(block=true) %}
\text{Cooling allocation to floor } f = \frac{Q_{\text{available}} \cdot \text{Priority}_f \cdot \text{Occupancy}_f}{\sum_i \text{Priority}_i \cdot \text{Occupancy}_i}
{% end %}

Priority factors:
- Data center floors: 2.0 (equipment damage risk)
- Occupied offices: 1.0
- Unoccupied floors: 0.3
- Storage/mechanical: 0.1

This weighted allocation ensures critical spaces get cooling while preventing cascade. Floor controllers receive their allocation and independently manage distribution to zones.

**BMS server failure healing protocol**:

1. **Detection** (T+0s): Floor controllers detect BMS heartbeat timeout (30s threshold)
2. **Local mode activation** (T+30s): Each floor controller activates "standalone" mode
3. **Schedule fallback** (T+35s): Use cached weekly schedule (last sync from BMS)
4. **Peer discovery** (T+60s): Floor controllers discover neighbors via BACnet broadcast
5. **Distributed coordination** (T+90s): Elect temporary coordinator for inter-floor decisions
6. **Setpoint adjustment** (T+120s): Widen temperature deadbands by \\(2^\circ\\)F (reduce hunting without BMS optimization)

**Building remains comfortable for 8+ hours** in standalone mode. Occupants rarely notice BMS outages because floor controllers maintain local comfort.

**Fire safety independence**: Critical insight—fire and life safety systems operate on dedicated networks with independent controllers. {% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %}'s {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} for HVAC/lighting never interferes with fire safety. When a fire alarm is active, the HVAC mode switches according to fire condition, overriding any comfort-oriented healing decision in progress.

{% katex(block=true) %}
\text{HVAC mode} = \begin{cases}
\text{Smoke evacuation} & \text{if fire in building} \\
\text{100\% outside air} & \text{if smoke detected} \\
\text{Normal} & \text{otherwise}
\end{cases}
{% end %}

This safety override supersedes all comfort-oriented healing. The healing hierarchy respects life safety as an inviolable constraint.

**Economic benefit**: Self-healing reduces comfort complaints during BMS outages, eliminates unnecessary maintenance dispatches, limits energy waste from actuator oscillation, and dramatically reduces time to restoration versus manual intervention.

---

## The Limits of Self-Healing

### Damage Beyond Repair Capacity

Some failures cannot be healed autonomously:
- Physical destruction ({% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} drone collision)
- Critical component failure without redundancy
- Environmental damage (waterlogged {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensor)

Self-healing must recognize when to stop trying. The system should abandon autonomous repair and defer to graceful degradation once the expected value recovered by healing falls below the expected cost — resource drain, risk of worsening the failure, and opportunity cost — of attempting it.

{% katex(block=true) %}
E[\text{value of healing}] < E[\text{cost of healing}]
{% end %}

At this point, [graceful degradation](@/blog/2026-01-15/index.md) takes over. The component is abandoned, and the system adapts to operate without it.

### Failures That Corrupt Healing Logic

If the failure affects the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} components themselves, healing may not be possible:
- Monitor fails: Can't detect problems
- Analyze fails: Can't interpret observations
- Plan fails: Can't generate solutions
- Execute fails: Can't apply solutions
- Knowledge corrupted: Wrong information drives wrong actions

Defense: Redundant {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} instances. {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} maintains simplified healing logic in each drone's flight controller, independent of main processing unit. If main unit fails, flight controller can still execute basic healing (return to base, emergency land).

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

The context-conditional success probability \\(P_{\text{success}}(a \mid \text{context})\\) tracks how often action \\(a\\) has worked in this specific operational context, estimated as a simple empirical frequency.

{% katex(block=true) %}
P_{\text{success}}(a | \text{context}) = \frac{\text{successes of } a \text{ in context}}{\text{attempts of } a \text{ in context}}
{% end %}

*Formal improvement condition*: The system's healing effectiveness improves after each failure episode if the expected success probability at the next timestep exceeds the current baseline:

{% katex(block=true) %}
\mathbb{E}[P_{\text{success}}(t+1) \mid \text{failure}_t] > \mathbb{E}[P_{\text{success}}(t)]
{% end %}

This holds when:
1. Failure provides information gain: \\(I(\text{context} ; \text{outcome}) > 0\\)
2. Policy update incorporates observation: \\(\theta_{t+1} = \theta_t + \eta \nabla_\theta \log P(\text{outcome} \mid a, \theta)\\)
3. Failure mode is within learning distribution: \\(P(\text{failure type seen before}) > 0\\)

*Uncertainty bound*: \\(P(\text{improvement} \mid \text{failure}) \in [0.6, 0.9]\\) depending on novelty of failure mode. Novel failures outside training distribution may not yield improvement.

---

## Irreducible Trade-offs

No design eliminates these tensions. The architect selects a point on each Pareto front.

### Trade-off 1: Healing Aggressiveness vs. Stability

**Multi-objective formulation**:

The objective jointly maximizes recovery utility and stability utility while minimizing overshoot cost, with \\(K\\) as the single parameter that moves the operating point along the Pareto front.

{% katex(block=true) %}
\max_{K} \left( U_{\text{recovery}}(K), U_{\text{stability}}(K), -C_{\text{overshoot}}(K) \right)
{% end %}

where \\(K\\) is controller gain.

**Stability constraint**: \\(K \cdot \tau < \pi/2\\)

The table below traces the Pareto front for controller gain \\(K\\): moving down the rows buys faster recovery (lower recovery time) at the cost of a narrower stability margin and higher overshoot risk.

| Gain \\(K\\) | Recovery Time | Stability Margin | Overshoot Risk |
| :--- | ---: | ---: | ---: |
| 0.2 | 15s | 1.37 | 0.02 |
| 0.5 | 6s | 1.07 | 0.08 |
| 0.8 | 4s | 0.77 | 0.18 |
| 1.0 | 3s | 0.57 | 0.31 |

Higher gain achieves faster recovery but risks oscillation and overshoot. Cannot achieve instant recovery with zero overshoot risk.

### Trade-off 2: Local vs. Coordinated Healing

**Multi-objective formulation**:

The objective selects a healing mode \\(m\\) that simultaneously maximizes initiation speed, decision optimality, and fleet coordination quality — three objectives that cannot all be maximized under partition.

{% katex(block=true) %}
\max_{m \in \{\text{local}, \text{cluster}, \text{fleet}\}} \left( U_{\text{speed}}(m), U_{\text{optimality}}(m), U_{\text{coordination}}(m) \right)
{% end %}

The Pareto front shows that each step toward better decision quality requires waiting longer, moving the operating point from instantaneous-but-suboptimal local decisions to slow-but-optimal fleet coordination.

| Healing Mode | Initiation Time | Decision Quality | Coordination |
| :--- | ---: | :---: | :---: |
| Local-only | <1s | Suboptimal | None |
| Cluster consensus | 2-5s | Better | Local |
| Fleet coordination | 10-30s | Optimal | Full |

Cannot achieve fast initiation AND optimal decision AND full coordination. Partition forces choice between speed and optimality.

### Trade-off 3: Exploration vs. Exploitation (Action Selection)

**Multi-objective formulation**:

The exploration parameter \\(c\\) controls a direct trade-off: larger \\(c\\) improves long-term optimality by exploring more alternatives, but lowers short-term utility by deferring exploitation of the current best action.

{% katex(block=true) %}
\max_{c} \left( U_{\text{short-term}}(c), U_{\text{long-term}}(c) \right)
{% end %}

where \\(c\\) is {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} exploration parameter.

**{% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} formula**:

The exploration bonus \\(c\sqrt{\ln t / n_a}\\) grows as action \\(a\\) is under-tried (small \\(n_a\\)) and the parameter \\(c\\) scales how strongly that bonus drives selection toward unexplored actions.

{% katex(block=true) %}
\text{UCB}(a) = \hat{\mu}_a + c \sqrt{\frac{\ln t}{n_a}}
{% end %}

The table shows how three representative values of \\(c\\) move the operating point along the exploration-exploitation spectrum and the resulting regret profile.

| \\(c\\) Value | Exploration | Exploitation | Regret Profile |
| :--- | :---: | :---: | :--- |
| 0.5 | Low | High | Fast convergence, possible local optimum |
| 1.0 | Medium | Medium | Balanced |
| 2.0 | High | Low | Slow convergence, global exploration |

Low \\(c\\) minimizes short-term regret (exploit current best). High \\(c\\) minimizes long-term regret (explore alternatives). No single \\(c\\) optimizes both.

### Trade-off 4: Healing Depth vs. Cascade Risk

**Multi-objective formulation**:

Deeper healing actions are more thorough but touch more shared resources, so the objective balances thoroughness utility against the probability of triggering secondary failures, parameterized by healing depth \\(d\\).

{% katex(block=true) %}
\max_{d} \left( U_{\text{thoroughness}}(d), -P_{\text{cascade}}(d) \right)
{% end %}

where \\(d\\) is healing action depth.

The table below shows how the three canonical healing depths compare on thoroughness, cascade risk, and the expected fraction of root-cause failures resolved.

| Healing Depth | Thoroughness | Cascade Risk | Recovery Completeness |
| :--- | :---: | :---: | :---: |
| Shallow (restart) | Low | Low | 0.60 |
| Medium (reconfigure) | Medium | Medium | 0.80 |
| Deep (rebuild) | High | High | 0.95 |

Deeper healing is more thorough but risks triggering cascades. Shallow healing is safer but may not resolve root cause.

### Cost Surface: Healing Under Resource Constraints

The total cost of a healing action decomposes into three terms — the direct action cost, the connectivity-dependent coordination cost, and the opportunity cost of resources diverted from mission — each of which varies with the {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %} \\(\Xi\\).

{% katex(block=true) %}
C_{\text{heal}}(a, \Xi) = C_{\text{action}}(a) + C_{\text{coordination}}(a, \Xi) + C_{\text{opportunity}}(a)
{% end %}

where:
- \\(C_{\text{action}}(a)\\): Direct cost of healing action \\(a\\)
- \\(C_{\text{coordination}}(a, \Xi)\\): Coordination cost under connectivity \\(\Xi\\)
- \\(C_{\text{opportunity}}(a)\\): Cost of resources diverted from mission

The coordination cost \\(C_{\text{coordination}}\\) grows with both the scope of the healing action and the degradation of connectivity: local actions in full connectivity cost \\(O(1)\\), cluster-wide actions under degraded connectivity cost \\(O(\log n)\\), fleet-wide actions under intermittent connectivity cost \\(O(n)\\), and fleet-wide actions under denied connectivity are infeasible.

{% katex(block=true) %}
C_{\text{coordination}}(a, \Xi) = \begin{cases}
O(1) & \Xi = \mathcal{C}, a = \text{local} \\
O(\log n) & \Xi = \mathcal{D}, a = \text{cluster} \\
O(n) & \Xi = \mathcal{I}, a = \text{fleet} \\
\infty & \Xi = \mathcal{N}, a = \text{fleet}
\end{cases}
{% end %}

### Resource Shadow Prices

Shadow prices quantify the marginal value of each scarce resource to the healing system; a higher shadow price means that resource is the binding constraint on healing performance, so relaxing it yields the greatest improvement.

| Resource | Shadow Price \\(\lambda\\) | Interpretation |
| :--- | ---: | :--- |
| Healing compute | \$0.15/action | Value of faster recovery |
| Coordination bandwidth | \$1.80/sync | Value of coordinated healing |
| Mission capacity | \$2.50/%-hr | Cost of diverted resources |
| Redundancy margin | \$4.00/node | Value of spare capacity |

### Irreducible Trade-off Summary

Each row names a fundamental design tension, the two objectives that pull against each other, and the specific outcome that no implementation can achieve regardless of engineering effort.

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Speed-Stability | Fast recovery vs. no overshoot | Instant recovery with zero risk |
| Local-Coordinated | Fast initiation vs. optimal decision | Both under partition |
| Explore-Exploit | Short-term vs. long-term optimality | Both with finite samples |
| Depth-Cascade | Thorough healing vs. cascade safety | Deep healing with zero cascade risk |

---

## Closing

Drone 23 landed safely. {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicle 4 was towed to the objective. {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensors reconfigured around the failed node. {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} healed microservice failures autonomously. {% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %} maintained comfort through central server outages.

The common thread: each system detected its own faults, selected a remediation strategy, and executed recovery without waiting for human authorization. The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} control loop—operating continuously at the speed of local computation, not the speed of communication—enabled this autonomy.

Three conditions made autonomous healing tractable. First, anomaly detection (Self-Measurement Without Central Observability) provided calibrated confidence estimates rather than binary alerts, enabling the confidence-threshold framework of Prop 10. Second, the capability hierarchy from the contested-connectivity foundations gave healing a clear priority ordering: MVS components before non-MVS, survival capability before mission capability. Third, the stability condition of Prop 9 bound the controller gain to the feedback delay, preventing healing from oscillating.

What this framework does not address: healing succeeds locally, but independent local decisions can produce globally inconsistent state. When {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s eastern cluster lost contact during the Drone 23 healing sequence, both clusters made correct decisions given their information. Their records diverged. That divergence—and the problem of reconciling it—is a distinct challenge from healing itself, one that requires different mechanisms. [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md) addresses exactly that: CRDTs, causal ordering, and the authority tiers that determine who wins when clusters disagree.
