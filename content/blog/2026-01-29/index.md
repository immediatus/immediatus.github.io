+++
authors = ["Yuriy Polyulya"]
title = "Self-Healing Without Connectivity"
description = "Detection is the easy part — acting without making things worse is harder. This article works through the MAPE-K autonomic loop adapted for edge conditions: stability conditions, confidence-gated action thresholds, dependency-ordered recovery to prevent cascades, and a self-throttling law that keeps the loop from consuming the very resources it's trying to protect."
date = 2026-01-29
slug = "autonomic-edge-part3-self-healing"

[taxonomies]
tags = ["distributed-systems", "edge-computing", "self-healing", "control-theory"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 3
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Edge systems can't treat disconnection as an exceptional error — it's the default condition. This series builds the formal foundations for systems that self-measure, self-heal, and improve under stress without human intervention, grounded in control theory, Markov models, and CRDT state reconciliation. Every quantitative claim comes with an explicit assumption set."""
+++

---

## Prerequisites

Two prior results converge here, each answering half of the question this article completes.

From [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md): the {% term(url="@/blog/2026-01-15/index.md#def-6", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regimes{% end %} define *when* the system must heal without human oversight. During Intermittent and Denied regimes, there is no operator to call. The capability hierarchy ({% katex() %}\mathcal{L}_0{% end %}–{% katex() %}\mathcal{L}_4{% end %}) defines *what* healing must preserve — at minimum, the survival capability {% katex() %}\mathcal{L}_0{% end %} must be maintained through any failure sequence. An edge system that loses basic function during self-repair has failed at its primary design goal.

From [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md): anomaly detection produces a confidence estimate \\(c \in [0,1]\\) for every observed deviation from nominal behavior. The optimal detection threshold \\(\theta^\*\\) calibrates the trade-off between false positives (acting on noise) and missed detections (ignoring real failures). The observability constraint sequence established which health signals remain available as resources shrink.

The logical connection is direct. The self-measurement article answered: *what is the system's current state, and how confident are we?* This article answers: *what should the system do about it?*

The confidence threshold that gates healing actions — act when \\(c > \theta^\*(a)\\) — depends on the cost asymmetry between wrong action types. High-severity actions (restarting a fusion node, isolating a cluster) require high confidence before execution. Low-severity actions (increasing {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate, clearing a cache) can proceed at lower confidence because reverting them is cheap. This article derives those thresholds formally. It also establishes the stability conditions under which closed-loop healing converges rather than oscillates.

---

## Overview

Self-healing enables autonomous systems to recover from failures without human intervention. Each concept integrates theory with design consequence:

| Concept | Formal Contribution | Design Consequence |
| :--- | :--- | :--- |
| **MAPE-K Control** | Stability: {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %} | Reduce controller gain when feedback delayed; LTI approximation — valid for the linear control path only. The SMJLS tightening factor of 0.82 (empirically calibrated; formal LMI verification of the switched-stability conditions pending; see Stability Under Mode Transitions) applies to switched-mode and nonlinear-CBF operation. |
| **Healing Triggers** | {% katex() %}\theta^*(a) = C_{FP}/(C_{FP} + C_{FN} + V_{\text{heal}}){% end %} | Match threshold to action severity |
| **Recovery Ordering** | Topological sort on dependency DAG | Heal foundations before dependents |
| **Cascade Prevention** | Resource quota {% katex() %}Q_{\text{heal}} < Q_{\text{total}} - Q_{\text{min}}{% end %} | Reserve capacity for mission function |
| **MVS** | Greedy \\(O(\ln n)\\)-approximation | Prioritize minimum viable components |

This extends autonomic computing {{ cite(ref="1", title="Kephart & Chess (2003) — The Vision of Autonomic Computing") }}and control theory (Astrom & Murray, 2008) for contested edge deployments {{ cite(ref="4", title="Satyanarayanan (2017) — The Emergence of Edge Computing") }}.

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

**Problem**: Detecting a failure with 94% confidence does not tell you what to do about it. In a connected system you call an operator. In a denied environment with 8 minutes until battery exhaustion, the system must select, plan, and execute a recovery action autonomously — without causing new failures in the process. That gap between sensing and centralized decision authority is edge computing's defining constraint {{ cite(ref="4", title="Satyanarayanan (2017) — The Emergence of Edge Computing") }}.

**Solution**: The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop — Monitor, Analyze, Plan, Execute — provides the closed-loop structure. Each phase has a defined output type that feeds the next. The Knowledge Base gives every phase access to current system model, historical effectiveness, and policy constraints.

**Trade-off**: Closed-loop control corrects errors but requires feedback latency \\(\tau\\). As feedback slows (connectivity degrades), the stable gain ceiling {% katex() %}K_{\text{ctrl}} < 1/(1+\tau/T_{\text{tick}}){% end %} falls. An aggressive healer in a slow-feedback environment oscillates between over-correction and under-correction. The entire design challenge is matching healing aggressiveness to feedback speed.

<span id="term-mape-k"></span>
### The MAPE-K Model

<span id="def-36"></span>
**Definition 36** (Autonomic Control Loop). The concept of a closed-loop self-managing system was introduced by Kephart and Chess {{ cite(ref="1", title="Kephart & Chess (2003) — The Vision of Autonomic Computing") }} and given architectural form in the IBM blueprint {{ cite(ref="2", title="IBM Research (2006) — Architectural Blueprint for Autonomic Computing") }}. *An {% term(url="#def-36", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}autonomic control loop{% end %} is a tuple \\((M, A, P, E, K)\\) where:*
- *{% katex() %}M: \mathcal{O} \rightarrow \mathcal{S}{% end %} is the monitor function mapping observations to state estimates*
- *{% katex() %}A: \mathcal{S} \rightarrow \mathcal{D}{% end %} is the analyzer mapping state estimates to diagnoses*
- *{% katex() %}P: \mathcal{D} \times K \rightarrow \mathcal{A}{% end %} is the planner selecting healing actions*
- *{% katex() %}E: \mathcal{A} \rightarrow \mathcal{O}{% end %} is the executor applying actions and returning observations*
- *\\(K\\) is the knowledge base encoding system model and healing policies*

> **Analogy:** A thermostat with memory — it monitors temperature, analyzes the trend (not just the current reading), plans a schedule, executes it, and remembers what worked last time. The Knowledge Base is the memory that makes each next cycle smarter than the one before.

**Logic:** Each phase maps to a typed function: \\(M \to A \to P \to E\\) forms a closed feedback cycle where \\(K\\) provides shared context. Stability requires \\(K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}})\\) — a bound that tightens as feedback slows.

{% mermaid() %}
flowchart TD
    M[Monitor<br/>Collect sensor readings] --> A[Analyze<br/>Compare to baseline and patterns]
    A --> P[Plan<br/>Policy table lookup]
    P --> E[Execute<br/>Apply action to actuators]
    E --> M
    A -->|no anomaly| M
    P -->|no action needed| M
    E --> K[(Knowledge Base<br/>Update patterns and outcomes)]
    K --> A
{% end %}

In other words, MAPE-K is a four-phase closed loop (Monitor, Analyze, Plan, Execute) drawing from and updating a central Knowledge base \\(K\\). Each phase has a defined input and output type: Monitor consumes raw sensor observations and produces state estimates; Analyzer consumes state estimates and produces diagnoses; Planner consumes diagnoses plus knowledge and produces healing actions; Executor consumes actions and produces new observations that feed back into Monitor. The Knowledge base \\(K\\) is not a sequential fifth phase — it is a shared store that feeds into all four phases simultaneously via dashed connections, as shown in the diagram below.

IBM's autonomic computing initiative formalized this structure as {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %}: four phases (Monitor, Analyze, Plan, Execute) with shared Knowledge {{ cite(ref="2", title="IBM Research (2006) — Architectural Blueprint for Autonomic Computing") }}. The broader research context for self-adaptive software — which MAPE-K instantiates — is surveyed in {{ cite(ref="3", title="Huebscher & McCann (2008) — Survey of Autonomic Computing") }}.

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

> **Read the diagram**: The four phases (green Monitor \\(\to\\) blue Analyze \\(\to\\) purple Plan \\(\to\\) orange Execute) form a clockwise feedback loop. The yellow Knowledge Base feeds into all four phases via dashed lines — it provides the policies, historical models, and current state that each phase consults. The Execute\\(\to\\)Monitor feedback arrow is the critical path: without it, the loop cannot know whether its own healing actions worked.

**Monitor**: Observe via sensors and health metrics ([self-measurement infrastructure](@/blog/2026-01-22/index.md)).

**Analyze**: Transform raw metrics into diagnoses. "Battery 3.21V" becomes "Drone 23 fails in 8 min, probability 0.94."

**Plan**: Generate options, select best expected outcome.

**Execute**: Apply remediation, coordinate with affected components, verify success.

> **Healing action durability contract**: Execute-phase actions that modify shared replicated state are tagged with a causal identifier (HLC timestamp + vector clock epoch; see [*Fleet Coherence Under Partition*](@/blog/2026-02-05/index.md#def-71)). A healing action is **provisional** until confirmed by the next successful delta-sync or quorum check. Conflicting provisional actions from partitioned clusters are resolved by Semantic Commit Order ([*Fleet Coherence Under Partition*](@/blog/2026-02-05/index.md#def-67)); the physical execution of a losing action constitutes an anomaly event that triggers a fresh MAPE-K observation cycle.

**Knowledge**: Distributed state—topology, policies, historical effectiveness, health estimates. Must be eventually consistent and partition-tolerant.

*Implementation note: the Knowledge Base {% katex() %}\mathcal{K}{% end %} is a replicated state store supporting concurrent writes; its merge semantics are established in [*Fleet Coherence Under Partition*](@/blog/2026-02-05/index.md) — each monitored variable is a {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} register. "Successful Knowledge Base synchronization" means all registers have received at least one {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} update from a quorum of reachable nodes within {% katex() %}\tau_\text{stale}^\text{max}{% end %} ({% term(url="@/blog/2026-01-22/index.md#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %}, [Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md)).*

The control loop executes continuously:

{% katex(block=true) %}
\text{Loop: } \quad M \rightarrow A \rightarrow P \rightarrow E \rightarrow M \rightarrow \cdots
{% end %}

The cycle time—how fast the loop iterates—determines system responsiveness. A 10-second cycle means problems are detected and addressed within 10-30 seconds. A 1-second cycle enables faster response but consumes more resources.

**Compute Profile:** CPU: {% katex() %}O(|\mathcal{A}| + |\mathcal{D}|){% end %} per tick — Monitor reads {% katex() %}|\mathcal{A}|{% end %} sensor channels, Analyze compares state against {% katex() %}|\mathcal{D}|{% end %} diagnostic patterns, Plan performs a policy table lookup, Execute applies one action. Memory: {% katex() %}O(|\mathcal{A}| \cdot W + |\mathcal{D}|){% end %} — sliding observation window of depth {% katex() %}W{% end %} plus the diagnostic pattern table. The critical path is Analyze-phase anomaly scoring, which scales with the number of concurrent sensor streams.

### Closed-Loop vs Open-Loop Healing

Two control approaches apply to healing:

**Proportional Feedback Law**: Observe outcome, compare to target, adjust. Corrects errors but requires feedback delay {% katex() %}\tau_{\text{feedback}}{% end %}.

The closed-loop control action \\(U_t\\) is proportional to the error between the desired and observed state, scaled by controller gain \\(K_{\text{ctrl}}\\):

{% katex(block=true) %}
U_t = K_{\text{ctrl}} \cdot (X_{\text{desired}} - X_{\text{observed}})
{% end %}

> **Physical translation**: The healing action is proportional to the gap between where the system should be and where it currently is. A small gap produces a gentle nudge; a large gap produces a stronger intervention. The controller gain \\(K_{\text{ctrl}}\\) sets how aggressively the controller chases the target — too high and it overshoots, too low and it never arrives.

Where \\(U_t\\) is control action, \\(K_{\text{ctrl}}\\) is the controller gain, and the difference is the error signal.

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

The total healing time {% katex() %}T_{\text{heal}}{% end %} is the sum of five sequential phase durations: detection, analysis, planning, coordination, and physical execution.

{% katex(block=true) %}
T_{\text{heal}} = T_{\text{detect}} + T_{\text{analyze}} + T_{\text{plan}} + T_{\text{coordinate}} + T_{\text{execute}}
{% end %}

> **Physical translation**: Every minute between failure onset and completed healing is a minute the system operates in a degraded or dangerous state. This formula forces you to account for every phase — detection is often the surprise: gossip convergence alone takes 10–69 seconds, and most systems budget 5 seconds for it in their SLA calculations.

- **Use**: Decomposes total healing latency into explicit sub-budgets for detection, analysis, planning, and execution; assign these at design time to prevent SLA overrun when execution absorbs all slack and detection silently runs over budget.
- **Parameters**: RAVEN: {% katex() %}T_{\text{detect}} \leq 10\text{ s}{% end %}, {% katex() %}T_{\text{analyze}} \leq 5\text{ s}{% end %}, {% katex() %}T_{\text{plan}} \leq 5\text{ s}{% end %}, {% katex() %}T_{\text{execute}} \leq 10\text{ s}{% end %}; total {% katex() %}\leq T_{\text{crit}}{% end %}.
- **Field note**: Detection is the surprise budget-breaker — measure it independently in isolation before committing to any {% katex() %}T_{\text{crit}}{% end %} value.

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

> **Read the diagram**: Time flows top to bottom. Each colored box is a MAPE-K phase with its real-world timing. The Monitor phase (green, 5–10 s) ingests battery voltage and current anomaly score. Analyze (blue, 1–6 s) classifies and projects time-to-failure. Plan (purple, 2–24 s) evaluates three options and selects staged response. Execute (orange, 10–35 s) sheds load, notifies the fleet, and navigates to a landing zone. Verify (light green) confirms the outcome and closes the loop. Total elapsed: 45 seconds of autonomous decision-making with no operator.

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

> **Read the diagram**: States flow left to right. Nominal \\(\to\\) Degraded on anomaly detection. The Stabilizing state represents the critical window where load-shedding has begun but landing is not yet committed. Recovering is the active landing approach — fleet coverage has already been reassigned. Safe and Failed are the two terminal outcomes. This state machine runs inside each drone; the edges are triggered by sensor thresholds, not operator commands.

**Healing Action Selection: Formal Optimization**

The planner selects the optimal action \\(a^\*\\) from the action space {% katex() %}\mathcal{A}{% end %} by maximizing expected utility given current system state \\(\Sigma\\) and failure severity \\(\delta_\text{sev}\\):

{% katex(block=true) %}
a^* = \arg\max_{a \in \mathcal{A}} \mathbb{E}[U(a \mid \Sigma, \delta_\text{sev})]
{% end %}

*(disambiguation: \\(\delta_\text{sev}\\) = healing action severity scalar; \\(\delta_\text{stale}\\) = staleness decay exponent (constant); {% katex() %}\phi_\text{stale}(t_\text{stale}){% end %} = staleness decay function derived from \\(\delta_\text{stale}\\) — the time-varying form used in the gain formula; \\(\delta_\text{inst}\\) = per-cycle instability probability ({% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %}); \\(\delta_\theta\\) = threshold hysteresis band. Bare \\(\delta\\) is not used in this article to avoid ambiguity.)*

The utility \\(U\\) decomposes into three terms — the value of recovery weighted by confidence \\(c\\), the resource cost of the action, and the disruption cost weighted by the probability the diagnosis is wrong:

{% katex(block=true) %}
U(a \mid \Sigma, \delta_\text{sev}) = c \cdot V_{\text{recovery}}(a, \delta_\text{sev}) - C_{\text{resource}}(a) - (1-c) \cdot C_{\text{disruption}}(a)
{% end %}

> **Physical translation**: The utility of a healing action has three parts. The first term is the expected benefit — recovery value scaled by how confident you are the diagnosis is right. The second term is the resource cost of executing the action regardless of outcome. The third is the disruption cost if the diagnosis was wrong (probability \\(1-c\\)) — you spent resources and caused disruption for nothing. High-confidence diagnoses make the disruption term small; low confidence makes it dominate.

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
\Sigma_{\text{healthy}} & \text{prob } p_{\text{success}}(a, \delta_\text{sev}) \cdot c \\
\Sigma_{\text{degraded}} & \text{prob } (1 - p_{\text{success}}(a, \delta_\text{sev})) \cdot c \\
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

> **Read the diagram**: The decision tree starts at the critical battery anomaly (red). Each diamond is a yes/no gate. The leftmost path — "time to landing < TTL?" \\(\to\\) "Yes" \\(\to\\) "mission impact low?" \\(\to\\) "Land" — is the safest, fastest resolution. The rightmost path tries to extend flight time with power reduction before falling back to landing. The EMERGENCY node (red) fires when even the fastest landing cannot beat battery exhaustion. Every path ends at Monitor (green) — the loop always verifies outcome.

<span id="prop-21"></span>
**Proposition 21** (Healing Deadline). *For a failure with time-to-criticality {% katex() %}T_{\text{crit}}{% end %}, healing must complete within margin:*

*If healing takes longer than the failure window minus a safety buffer, the system cannot recover in time.*

{% katex(block=true) %}
T_{\text{heal}} < T_{\text{crit}} - T_{\text{margin}}
{% end %}

> **Physical translation**: You must complete healing before the failure becomes irreversible, with a safety buffer remaining. If Drone 23 has 8 minutes ({% katex() %}T_{\text{crit}}{% end %}) and landing requires 2 minutes ({% katex() %}T_{\text{margin}}{% end %}), the healing sequence must finish within 6 minutes. If no available action fits in that window, escalate to a faster but more disruptive response.

*where {% katex() %}T_{\text{margin}}{% end %} accounts for execution variance and verification time. If this inequality cannot be satisfied, the healing action must be escalated to a faster (but possibly more costly) intervention.*

In other words, healing must finish early enough to leave a safety buffer before the failure becomes irreversible; if no action fits within that window, the system must escalate to a more disruptive but faster intervention.

For Drone 23, with 8 minutes to battery exhaustion and a 60-second landing margin, the healing window comfortably exceeds the ~45-second healing sequence.

> **Empirical status**: The 8-minute time-to-criticality and 60-second margin are {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}-specific values derived from Li-Ion discharge curves and landing kinematics; actual margins depend on battery chemistry, payload, and terrain, and should be measured per platform.

When the healing deadline cannot be met, the system must either:
1. Execute partial healing (stabilize but not fully recover)
2. Skip to emergency protocols (bypass normal {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %})
3. Accept degraded state (capability reduction)

<span id="prop-22"></span>
**Proposition 22** (Closed-Loop Healing Stability). *The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop is a discrete-time system executing on a fixed timer with period {% katex() %}T_{\text{tick}}{% end %}. Modeling the proportional controller with controller gain \\(K_{\text{ctrl}}\\) acting on a {% katex() %}d = \lceil\tau/T_{\text{tick}}\rceil{% end %}-sample-delayed error state:*

*A {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} healing loop that reacts too aggressively under radio delay will oscillate, triggering actions that undo each other rather than converging to a stable state.*

{% katex(block=true) %}
x[t+1] = x[t] - K_{\text{ctrl}} \cdot x[t - d]
{% end %}

*The closed-loop system is stable if the controller gain satisfies:*

> **Scope — LTI control path only:** The gain bound below is formally valid for the Linear-Time-Invariant control path. The nonlinear dCBF controller path uses an empirically calibrated gain of \\(0.82 \times K_\text{LTI}\\) pending formal LMI verification of the switched-stability conditions *(a formal piecewise-linear LMI analysis (pending); see Stability Under Mode Transitions, below)*. Do not treat the nonlinear path as certified for autonomous deployment without that offline verification step.

{% katex(block=true) %}
K_{\text{ctrl}} < \frac{1}{1 + \tau/T_{\text{tick}}}
{% end %}

> **Physical translation**: The safe gain ceiling shrinks as feedback slows. At zero delay, controller gain can approach 1 (full-authority correction). At a 10-second feedback delay with a 5-second tick, the gain ceiling falls to \\(1/(1+2) = 0.33\\). At a 100-second delay the ceiling is 0.048 — the controller must be extremely gentle, accepting slow convergence to avoid oscillation.

*For {% katex() %}\tau \ll T_{\text{tick}}{% end %} this reduces to \\(K_{\text{ctrl}} < 1\\). For {% katex() %}\tau \gg T_{\text{tick}}{% end %} the stable gain decreases proportionally with the delay-to-sample ratio.*

*Proof sketch (discrete-time Lyapunov):* Let \\(V(x) = x^2\\). The one-step difference under \\(d\\)-step delay is:

{% katex(block=true) %}
\Delta V = x[t+1]^2 - x[t]^2 = K_{\text{ctrl}}^2 x[t-d]^2 - 2K_{\text{ctrl}}\, x[t]\, x[t-d]
{% end %}

For the worst-case alignment \\(x[t] = x[t-d]\\) (current and delayed states coincide, representing maximum regenerative feedback):

{% katex(block=true) %}
\Delta V\big|_{\text{worst}} = x[t]^2 K_{\text{ctrl}}(K_{\text{ctrl}} - 2)
{% end %}

Requiring \\(\Delta V < 0\\) at worst case yields the *necessary* condition \\(0 < K_{\text{ctrl}} < 2\\).

For the **sufficient** condition \\(K_{\text{ctrl}} < 1/(1+d)\\), the closed-loop characteristic polynomial is {% katex() %}z^{d+1} - z^d + K_{\text{ctrl}} = 0{% end %}. For \\(d=1\\), Jury's criterion applied directly yields the necessary and sufficient condition \\(K_{\text{ctrl}} < 1 = 1/(1+1)\\).

For \\(d \geq 2\\), the sufficient condition is derived by bounding the cumulative influence of the \\(d\\)-step delay chain. Each additional delay sample tightens the stable-gain envelope by one additive \\(K_{\text{ctrl}}\\) term, so the \\((d+1)\\)-term influence sum {% katex() %}K_{\text{ctrl}} \cdot (d+1) < 1{% end %} gives the sufficient bound \\(K_{\text{ctrl}} < 1/(1+d)\\).

This bound is conservative relative to the exact Schur–Cohn stability boundary — for \\(d=2\\) the exact boundary is {% katex() %}K_{\text{ctrl}} < (\sqrt{5}-1)/2 \approx 0.618{% end %} vs. the sufficient bound \\(K_{\text{ctrl}} < 1/3\\). The conservative margin is appropriate for a gain scheduler operating under stochastic delay: using the exact boundary would risk instability on delay-distribution tails. Expressed in continuous time via {% katex() %}d = \tau/T_{\text{tick}}{% end %}:

{% katex(block=true) %}
K_{\text{ctrl}} < \frac{1}{1 + \tau/T_{\text{tick}}}
{% end %}
\\(\square\\)

**Scope**: This result holds under linear time-invariant (LTI) loop dynamics. For time-varying gain schedules (as in {% term(url="#def-40", def="CBF Gain Scheduler: mode-and-state-indexed safe gain derived from the discrete Control Barrier Function stability margin") %}Definition 40{% end %}, CBF Gain Scheduler), the switched-Markov jump linear systems (SMJLS) analysis in the proof tightens the bound to account for regime transitions.

> **What this means in practice**: Keep your controller gain \\(K_{\text{ctrl}}\\) below this bound, or the healing loop will oscillate — triggering recovery actions that then need their own recovery. For most edge hardware with 100ms feedback latency and 1s tick rate, this means \\(K_{\text{ctrl}} < 0.91\\). For a time-varying scheduler that increases gain during Connected regimes, add a 15% safety margin.
>
> **P99 design rule**: Size for P99 feedback delay, not mean delay. At P99 latency (typically \\(3\text{--}5\\times\\) the mean for wireless links), the stability bound tightens significantly. A gain that's stable at mean latency may oscillate at P99.

**Quantile-aware tightening (tail-instability correction).** The bound above uses a fixed delay \\(\tau\\) — typically the mean or a measured round-trip time. For Weibull-distributed partition durations ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %}), the mean underestimates the tail: when \\(k_N < 1\\) (the common case for denied-connectivity episodes), the P99 duration is roughly {% katex() %}3.5 \times \mathrm{E}[\tau]{% end %}. Calibrating the gain formula against \\(\mathrm{E}[\tau]\\) produces a loop that is stable for typical partitions but permits oscillation in the worst 1% of events — precisely when healing matters most.

The quantile-aware bound substitutes the \\(\alpha\\)-quantile of the Weibull partition duration for \\(\tau\\):

{% katex(block=true) %}
\tau_{P\alpha} = \lambda_i \cdot (-\ln(1-\alpha))^{1/k_N}
{% end %}

where \\(\lambda_i\\) is the Weibull scale parameter for node \\(i\\), \\(k_N\\) is the adaptive shape parameter ({% term(url="@/blog/2026-01-15/index.md#def-14", def="Adaptive Weibull Shape Parameter: bandit algorithm that tunes the Weibull shape parameter online from observed partition durations") %}Definition 14{% end %}), and \\(\alpha = 0.99\\) is the recommended operating point. The stability condition becomes:

{% katex(block=true) %}
K_{\text{ctrl}} < \frac{1}{1 + \tau_{P\alpha}/T_{\text{tick}}}
{% end %}

**RAVEN calibration**: {% katex() %}\lambda_i \approx 180\,\mathrm{s}{% end %}, \\(k_N \approx 0.6\\), {% katex() %}T_{\text{tick}} = 5\,\mathrm{s}{% end %}. The P99 quantile is {% katex() %}\tau_{P99} = 180 \cdot (-\ln 0.01)^{1/0.6} \approx 630\,\mathrm{s}{% end %}.

This gives a quantile-aware ceiling of {% katex() %}K_{\text{ctrl}} < 1/(1 + 630/5) = 0.0078{% end %} — versus \\(K_{\text{ctrl}} < 0.028\\) from the \\(\mathrm{E}[\tau]\\)-based bound. For Intermittent and Denied regimes, always use \\(\tau_{P99}\\) from {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} rather than the mean delay. (See {% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull partition duration model and adaptive shape parameter: calibrate scale and shape from partition logs to characterize node-specific disconnection statistics") %}Definitions 13–14{% end %} in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) for calibration from partition logs.)

> **Warning**: Using mean feedback delay instead of the P99 quantile produces a gain that is stable for typical partitions but oscillates in the worst 1% of events — precisely when the healing loop is needed most.

- **Use**: Computes the maximum safe controller gain {% katex() %}K_{\text{ctrl}}{% end %} given feedback delay {% katex() %}\tau{% end %}; tune the healing actuator below this ceiling to prevent fault/heal flapping from overcorrection at the actual observed round-trip delay.
- **Parameters**: {% katex() %}\tau = T_{\text{tick}} \to K_{\text{ctrl,max}} = 0.5{% end %}; {% katex() %}\tau = 2T_{\text{tick}} \to K_{\text{ctrl,max}} = 0.33{% end %}.
- **Field note**: Set {% katex() %}K_{\text{ctrl}} = 0.7 K_{\text{ctrl,max}}{% end %} in production — the formula gives the stability ceiling, not a recommended operating point.

> **Empirical status**: The sufficient stability bound \\(K_{\text{ctrl}} < 1/(1+d)\\) is analytically derived for a linear time-invariant model; real MAPE-K loops exhibit nonlinear actuator saturation and time-varying delays, so the actual stability boundary may differ and should be validated by discrete-event simulation at the deployment's P99 feedback delay.

**Concurrent loops**: For {% katex() %}N_{\text{concurrent}}{% end %} simultaneous healing loops sharing one CPU at \\(u\\%\\) utilization, two quantities grow: the effective feedback delay to {% katex() %}\tau_{\text{eff}} \approx \tau/(1-u){% end %}, and the effective aggregate gain to {% katex() %}K_{\text{eff}} \approx K_{\text{ctrl}} \cdot N_{\text{concurrent}}{% end %}. The stability condition on the aggregate is:

{% katex(block=true) %}
K_{\text{eff}} < \frac{1}{1 + \tau_{\text{eff}}/T_{\text{tick}}}
{% end %}

Verify concurrent-failure stability through discrete-event simulation before deploying multi-target healing (e.g., simultaneous motor compensation + sensor fallback + communication rerouting on {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} Drone 23).

In other words, the slower the feedback (larger \\(\tau\\)), the more gently the controller must react (smaller \\(K_{\text{ctrl}}\\)); aggressive corrections in a slow-feedback environment cause the system to oscillate rather than converge.

**Corollary 9.1**. *Increased feedback delay (larger \\(\tau\\)) requires more conservative controller gains, trading response speed for stability.*

**Staleness correction**: When the Knowledge Base has not been synchronized for elapsed time {% katex() %}t_{\text{stale}}{% end %}, the error signal \\(x[t-d]\\) may reflect state that has since evolved. The staleness-adjusted gain

{% katex(block=true) %}
K_{\text{stale}}(t_{\text{stale}}) = K_{\text{ctrl}} \cdot \bigl(1 - \phi_\text{stale}(t_{\text{stale}})\bigr)
{% end %}

where {% katex() %}\phi_{\text{stale}}(t_{\text{stale}}) = e^{-\delta_{\text{stale}} \cdot t_{\text{stale}} / \tau_{\text{stale}}^{\max}}{% end %} is the staleness decay function. Here \\(\delta_{\text{stale}}\\) is the decay exponent from the disambiguation table in the Notation section, and {% katex() %}\tau_{\text{stale}}^{\max}{% end %} is the maximum elapsed time since last Knowledge Base sync (formally defined in {% term(url="#def-45", def="Staleness Decay Time Constant: maximum elapsed time since last Knowledge Base sync before confidence in local observations falls to near zero") %}Definition 45{% end %} below).

*Staleness Decay Function (formally defined later in this article): maps partition duration \\(T_\text{acc}\\) to a scalar \\(\in [0,1]\\) representing the remaining confidence in local observations. A value of 1.0 means fully fresh; 0.0 means the observation is too stale to trust for autonomous decision-making.*

reduces effective gain in proportion to the staleness decay function \\(\phi_{\text{stale}}\\) ({% term(url="#def-45", def="Staleness Decay Function: time-decaying weight applied to gossip health updates, making older observations contribute less to anomaly threshold estimation") %}Definition 45{% end %}). Since {% katex() %}K_{\text{stale}} \leq K_{\text{ctrl}}{% end %}, any \\(K_{\text{ctrl}}\\) satisfying {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}'s stability condition (LTI bound; SMJLS analysis tightens this under time-varying gain — see proof) continues to satisfy it with {% katex() %}K_{\text{stale}}{% end %} substituted — staleness correction provides additional stability margin when acting on uncertain state, at the cost of reduced healing responsiveness.

**Stochastic extension: when \\(\tau\\) is not constant**

{% term(url="#prop-22", def="Closed-Loop Healing Stability: gain K below the stability bound keeps the autonomic loop from oscillating during delayed feedback") %}Proposition 22{% end %} assumes a fixed delay \\(\tau\\). In tactical environments \\(\tau\\) is a stochastic process; its distribution governs whether any finite controller gain \\(K_{\text{ctrl}}\\) can maintain stability.

<span id="def-37"></span>
**Definition 37** (Stochastic Transport Delay Model). *Let {% katex() %}\tau(t) \geq 0{% end %} denote the one-way transport delay at time \\(t\\), distributed conditionally on connectivity regime \\(C\\).*

**Connected (\\(C = 1.0\\))**: {% katex() %}\tau \sim \mathrm{LogNormal}(\mu_c, \sigma_c^2){% end %} with \\(\sigma_c\\) much smaller than \\(\mu_c\\) (coefficient of variation approximately 10%). Additive propagation and queuing delays compose multiplicatively across many independent hops, producing a log-normal tail.

**Degraded (\\(C = 0.5\\))**: {% katex() %}\tau \sim \mathrm{LogNormal}(\mu_d, \sigma_d^2){% end %} with {% katex() %}\sigma_d \approx \mu_d{% end %} (coefficient of variation approximately 100%). Retransmission bursts and partial-outage rerouting drive variance to the same order as the mean.

**Contested (\\(C = 0.0\\))**: {% katex() %}\tau \sim \mathrm{Pareto}(\tau_{\min}, \alpha){% end %} with \\(\alpha \in (1, 2)\\):

{% katex(block=true) %}
f_\tau(t) = \frac{\alpha \, \tau_{\min}^\alpha}{t^{\alpha+1}}, \quad t \geq \tau_{\min}
{% end %}

- **Use**: Models round-trip delay as a heavy-tail Pareto distribution fitted to MAPE-K logs; use to select robust gain via {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} and prevent gain under-design from mean-delay assumptions that underestimate P99 delay by \\(3{-}10\\times\\) when tail index {% katex() %}\alpha < 1.5{% end %}.
- **Parameters**: {% katex() %}\alpha{% end %} = tail index ({% katex() %}\alpha < 2{% end %} means infinite variance); {% katex() %}\tau_{\min}{% end %} = hardware-limited delay floor; both fitted from log data.
- **Field note**: Plot delay data log-log — a straight line confirms Pareto; curvature signals Weibull; each distribution requires a different gain formula.

p-th percentile: {% katex() %}\tau_p = \tau_{\min} \cdot (1-p)^{-1/\alpha}{% end %}. Mean: {% katex() %}E[\tau] = \alpha \tau_{\min} / (\alpha - 1){% end %} for \\(\alpha > 1\\). Variance: **undefined** (infinite) for \\(\alpha \leq 2\\).

The Pareto model is natural under adversarial conditions: an adversary who controls jamming duration selects from a strategic distribution, producing power-law delay tails. Shape parameter \\(\alpha\\) encodes adversarial capability — {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} contested-link measurements yield \\(\alpha \approx 1.6\\), giving {% katex() %}E[\tau] \approx 2.7\tau_{\min}{% end %} with unbounded variance.

**Critical consequence**: With {% katex() %}\mathrm{Var}[\tau] = \infty{% end %} in the Contested regime, the estimation error of any EWMA or Kalman filter tracking \\(\tau\\) also has infinite variance, regardless of filter design. Mean-plus-\\(k\\)-sigma stability margins are meaningless; all quantitative bounds must use percentiles.

<span id="prop-23"></span>
**Proposition 23** (Robust Gain Scheduling under Stochastic Delay). *Let {% katex() %}\delta_\text{inst} \in (0,1){% end %} be the acceptable per-cycle instability probability *(\\(\delta_\text{inst}\\) = per-cycle instability probability; distinct from the staleness decay \\(\delta_\text{stale}\\) and the hysteresis band \\(\delta_\theta\\))*. The regime-dependent robust gain bound is:*

*Using mean delay to set gain is unsafe in contested regimes — {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s P99 delay can be \\(13\\times\\) the mean, collapsing the safe gain ceiling to near zero.*

{% katex(block=true) %}
K_{\mathrm{robust}}(C, \delta_\text{inst}) \leq \frac{1}{1 + \tau_{1-\delta_\text{inst}}(C)/T_{\text{tick}}}
{% end %}

- **Use**: Derives a conservative loop gain using the {% katex() %}P(1-\delta_\text{inst}){% end %} delay quantile instead of the mean, guaranteeing stability for {% katex() %}(1-\delta_\text{inst}){% end %} of all delay realizations and preventing intermittent instability from rare long-tail events that a mean-based gain cannot handle.
- **Parameters**: {% katex() %}\delta_\text{inst}{% end %} = instability tolerance (0.01 for 99% stability); {% katex() %}\tau_{1-\delta_\text{inst}}{% end %} from the Pareto or Weibull quantile formula.
- **Field note**: 99% stability in a 5-second MAPE-K loop still allows ~3.6 instability events per day — critical systems need {% katex() %}\delta_\text{inst} = 0.001{% end %}.

> **Empirical status**: The Pareto tail parameters \\(\alpha = 1.6\\) and \\(\tau_{\min} = 0.2\\) s are calibrated from {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} contested-link measurements; different RF environments, jamming profiles, and terrain will yield different tail indices, requiring per-deployment calibration from delay logs.

> **Physical translation:** In denied regime, the healing loop must run at 82% of the gain it would use with a reliable connection — clock uncertainty forces conservative control. Degraded regime permits 90%, and connected permits the full design gain. The table directly tells a field operator how aggressively the RAVEN healing loop may respond under each radio condition, without needing to understand the underlying Lyapunov mathematics.

*where {% katex() %}\tau_{1-\delta_\text{inst}}(C){% end %} is the \\((1-\delta_\text{inst})\\)-th percentile of {% katex() %}F_\tau(\cdot \mid C){% end %}:*

| Regime | Distribution | {% katex() %}\tau_{1-\delta_\text{inst}}{% end %} | Permissible actions |
| :--- | :--- | :--- | :--- |
| Connected (C=1.0) | LogNormal | {% katex() %}e^{\mu_c + z_{1-\delta_\text{inst}} \sigma_c}{% end %} | All severities |
| Degraded (C=0.5) | LogNormal | {% katex() %}e^{\mu_d + z_{1-\delta_\text{inst}} \sigma_d}{% end %} | Severity 1 and 2 only |
| Contested (C=0.0) | Pareto | {% katex() %}\tau_{\min} \cdot \delta_\text{inst}^{-1/\alpha}{% end %} | Severity 1 local only |

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} ({% katex() %}\tau_{\min} = 0.2{% end %}s, \\(\alpha = 1.6\\), \\(\delta_\text{inst} = 0.01\\)):

{% katex(block=true) %}
\tau_{0.99} = 0.2 \times (0.01)^{-1/1.6} = 0.2 \times 100^{0.625} \approx 3.16\text{ s}
{% end %}

This gives {% katex() %}K_{\mathrm{robust}} \leq 1/(1 + 3.16/T_{\text{tick}}){% end %}. For a reference tick period of {% katex() %}T_{\text{tick}} = 1{% end %}s: {% katex() %}K_{\mathrm{robust}} \leq 0.240{% end %}.

The bound tightens sharply as the instability tolerance is reduced. Since {% katex() %}\tau_{1-\delta_\text{inst}}{% end %} scales as {% katex() %}\delta_\text{inst}^{-0.625}{% end %}, driving {% katex() %}\delta_\text{inst} \to 0.001{% end %} pushes {% katex() %}\tau_{0.999} \approx 25.1{% end %}s and {% katex() %}K_{\mathrm{robust}} \leq 1/(1 + 25.1) \approx 0.038{% end %}.

As {% katex() %}\delta_\text{inst} \to 0{% end %}, {% katex() %}\tau_{1-\delta_\text{inst}} \to \infty{% end %} and {% katex() %}K_{\mathrm{robust}} \to 0{% end %}: for any operationally meaningful \\(\delta_\text{inst}\\), no positive gain satisfies the stability condition for remote actions in Contested conditions — all Severity 2 and above actions must be suppressed.

*Proof*: From {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain K below the stability bound keeps the autonomic loop from oscillating during delayed feedback") %}Proposition 22{% end %}, stability requires {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %}, equivalently {% katex() %}\tau < T_{\text{tick}}(K_{\text{ctrl}}^{-1} - 1){% end %}. Under stochastic \\(\tau\\), the probability of stability is {% katex() %}P(\text{stable}) = F_\tau(T_{\text{tick}}(K_{\text{ctrl}}^{-1} - 1) \mid C){% end %}. Setting this equal to \\(1-\delta_\text{inst}\\) and inverting gives {% katex() %}K_{\text{ctrl}} \leq 1/(1 + \tau_{1-\delta_\text{inst}}/T_{\text{tick}}){% end %}. For {% katex() %}\alpha \leq 2{% end %}, the Pareto quantile {% katex() %}\tau_{1-\delta_\text{inst}} = \tau_{\min}\delta_\text{inst}^{-1/\alpha}{% end %} grows without bound as {% katex() %}\delta_\text{inst} \to 0{% end %}, so {% katex() %}1/(1 + \tau_{1-\delta_\text{inst}}/T_{\text{tick}}) \to 0{% end %} and no positive controller gain achieves arbitrary confidence in the Contested regime. \\(\square\\)

<span id="cor-78-2"></span>
**Corollary 78.2** (Fleet Stability Bound). *{% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} bounds instability probability for a **single** node. For a fleet of \\(N\\) nodes operating under the same connectivity regime \\(C\\), with target fleet-wide instability probability {% katex() %}\delta_{\text{fleet}} \in (0,1){% end %}, set the per-node instability tolerance to:*

{% katex(block=true) %}
\delta_{\text{node}} = \frac{\delta_{\text{fleet}}}{N}
{% end %}

*and derive \\(K_{\text{robust}}\\) from {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} using \\(\delta_{\text{node}}\\). By the Bonferroni union bound, this guarantees {% katex() %}P(\text{any node unstable}) \leq \delta_{\text{fleet}}{% end %}.*

*Under positive inter-node delay correlation \\(\rho_C > 0\\) — nodes share a connectivity regime and experience correlated jamming events — the Bonferroni bound remains valid but is conservative: correlated failure reduces effective diversity, so {% katex() %}\delta_{\text{node}} = \delta_{\text{fleet}}/N{% end %} is the correct per-node target at all correlation levels. In the limit \\(\rho_C \to 1\\) (a single shared partition event drops the whole fleet simultaneously), treating the fleet as one entity and setting {% katex() %}\delta_{\text{node}} = \delta_{\text{fleet}}{% end %} is appropriate — the fleet either fails together or not at all.*

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (\\(N = 47\\), \\(\delta_{\text{fleet}} = 0.01\\), \\(\alpha = 1.6\\), \\(\tau_{\min} = 0.2\\) s): {% katex() %}\delta_{\text{node}} \approx 2.13 \times 10^{-4}{% end %}, giving:

{% katex(block=true) %}
\tau_{1-\delta_{\text{node}}} = 0.2 \times (2.13 \times 10^{-4})^{-1/1.6} \approx 0.2 \times 197 \approx 39.4\;\text{s}
{% end %}

{% katex(block=true) %}
K_{\mathrm{robust,fleet}} \leq \frac{1}{1 + 39.4/T_{\text{tick}}} \approx 0.025 \quad (T_{\text{tick}} = 1\;\text{s})
{% end %}

This is a \\(10\times\\) tighter gain ceiling than the single-node bound of 0.240, reflecting the actual safety requirement for a 47-node mission.

*Gossip coupling amplifier*: A drone that hits the \\(\delta_{\text{node}}\\) tail and begins oscillating injects jitter into its neighbors' gossip-based state estimates ({% term(url="@/blog/2026-01-22/index.md#def-24", def="Gossip Health Protocol: epidemic dissemination where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds") %}Definition 24{% end %}), raising their effective \\(\hat{\tau}\\) and pulling their gain schedulers toward instability. This positive feedback between per-node oscillation and fleet-wide estimation noise means fleet stability is not a consequence of per-node stability alone. The fleet-level \\(\delta_{\text{node}}\\) bound provides the correct single-node target for independent failures; correlated cascade failures — requiring inter-node action coordination — are blocked by the Severity 2 suppression rule in {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %}.

<span id="cor-78-3"></span>
**Corollary 78.3** (Confidence-Interval Adjusted Stability Bound). *{% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} requires estimating {% katex() %}\tau_{1-\delta_\text{inst}}{% end %} from observations. In Contested regime, observations are sparse by definition: a Pareto tail with \\(\tau_{0.99} \approx 3.16\\) s yields at most \\(n_{\text{obs}} \approx 19\\) samples in a 60-second estimation window — well below the \\(n \geq 30\\) minimum for reliable Hill estimation.*

*The Hill estimator for Pareto shape \\(\alpha\\) from \\(k\\) tail-exceedance observations has standard error:*

{% katex(block=true) %}
\mathrm{SE}(\hat{\alpha}) \approx \frac{\hat{\alpha}}{\sqrt{k}}
{% end %}

*where {% katex() %}k \approx \sqrt{n_{\text{obs}}}{% end %} is the number of observations used in the tail fit. A lighter estimated tail (\\(\hat{\alpha}\\) overestimated) causes {% katex() %}\tau_{1-\delta_\text{inst}}{% end %} to be underestimated, producing a gain that appears safe but is not. The confidence-adjusted quantile substitutes the lower \\(\beta\\)-confidence bound on \\(\hat{\alpha}\\) into the Pareto quantile formula:*

{% katex(block=true) %}
\tau^+_{1-\delta_\text{inst}} = \tau_{\min} \cdot \delta_\text{inst}^{-1/\bigl(\hat{\alpha} - z_{\beta/2}\,\hat{\alpha}/\sqrt{k}\bigr)}
{% end %}

*The confidence-adjusted robust gain is then:*

{% katex(block=true) %}
K_{\mathrm{robust,CI}} \leq \frac{1}{1 + \tau^+_{1-\delta_\text{inst}}/T_{\text{tick}}}
{% end %}

*When \\(k < k_{\min}\\) (the tail fit is unreliable), {% katex() %}\hat{\alpha} - z_{\beta/2}\,\hat{\alpha}/\sqrt{k}{% end %} may fall below 1, at which point {% katex() %}\tau^+_{1-\delta_\text{inst}} \to \infty{% end %} and \\(K_{\mathrm{robust,CI}} \to 0\\): the gain degrades gracefully to zero, reverting to the Severity suppression floor that {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} already requires as {% katex() %}\delta_\text{inst} \to 0{% end %}. This is the correct behavior under estimation collapse.*

- **Use**: Replace {% katex() %}\tau_{1-\delta_\text{inst}}{% end %} with {% katex() %}\tau^+_{1-\delta_\text{inst}}{% end %} in all Contested-regime gain computations; revert to {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %}'s point estimate when \\(k \geq k_{\min}\\).
- **Parameters**: \\(k_{\min} = 15\\) tail observations (Hill SE < 26%); \\(\beta = 0.10\\) (90% CI); RAVEN Contested window: \\(n_{\text{obs}} \approx 19\\), \\(k \approx 4\\) — below \\(k_{\min}\\), so Severity suppression is the operationally correct mode, not a conservative simplification.
- **Field note**: The Execute dead-band width in {% term(url="#def-38", def="MAPE-K Predictive Dead-Band: region around setpoint where the MAPE-K controller takes no action to prevent chattering under stochastic delay") %}Definition 38{% end %} should widen as {% katex() %}\mathrm{SE}(\hat{\alpha}){% end %} grows — sparse contested observations signal high estimation uncertainty, and the Execute phase should become more conservative, not less. Log \\(k\\) and \\(\hat{\alpha}\\) with every gain computation so post-mission analysis can verify the estimator was in its reliable regime.

<span id="def-38"></span>
**Definition 38** ({% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} Predictive Dead-Band). *Let \\(A\\) be a healing action recommended at {% katex() %}t_{\mathrm{sense}}{% end %}. The Execute phase suppresses \\(A\\) if any of the following hold at {% katex() %}t_{\mathrm{exec}}{% end %}:*

**(a) Delay invalidity** — estimated transport delay exceeds the Stale Data Threshold (Prop 79):

{% katex(block=true) %}
\hat{\tau}(t_{\mathrm{exec}}) > T_{\mathrm{stale}}
{% end %}

**(b) Self-correction** — probability the target remains in failure state has fallen below {% katex() %}p_{\mathrm{suppress}}{% end %}:

{% katex(block=true) %}
e^{-\mu_h \cdot (t_{\mathrm{exec}} - t_{\mathrm{sense}})} < p_{\mathrm{suppress}}
{% end %}

equivalently {% katex() %}t_{\mathrm{exec}} - t_{\mathrm{sense}} > -\ln(p_{\mathrm{suppress}}) / \mu_h{% end %}, where \\(\mu_h\\) is the autonomous self-healing rate of the target component.

**(c) Gain violation** — current delay estimate violates the stability condition from Prop 78:

{% katex(block=true) %}
K_{\mathrm{current}} \geq \frac{1}{1 + \hat{\tau}(t_{\mathrm{exec}})/T_{\text{tick}}}
{% end %}

All three conditions suppress action independently. Condition (b) is the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} analog of the Smith Predictor's inner model path: it estimates whether the system will have self-corrected before \\(A\\) arrives, suppressing \\(A\\) if so.

In the Contested regime, the prediction error {% katex() %}\varepsilon(t) = \tau(t) - \hat{\tau}(t){% end %} carries the same Pareto tail as \\(\tau(t)\\) regardless of predictor design. The Smith Predictor reduces the effective delay in the characteristic equation from \\(\tau(t)\\) to \\(\varepsilon(t)\\), but both are unbounded in variance. Condition (a) therefore remains the primary suppressor.

Condition (b) also prevents the anti-windup oscillation that {% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing dead-band with adaptive refractory backoff prevents integrator windup; refractory floor is 2τ_fb") %}Proposition 30{% end %} bounds: acting on a stale recommendation after the target has already self-healed is precisely the over-correction scenario {% term(url="#def-46", def="Healing Dead-Band and Refractory State: dead-band threshold and mandatory post-action wait that prevent high-frequency chatter and integrator windup in the MAPE-K loop") %}Definition 46{% end %} (Healing Dead-Band and Refractory State) blocks.

<span id="prop-24"></span>
**Proposition 24** (Stale Data Threshold). *Let {% katex() %}\lambda_{\mathrm{total}} = \mu_h + \mu_f + \mu_c{% end %} be the total state-change rate (healing, failure, and coordination events); {% katex() %}p_{\mathrm{stale}} \in (0,1){% end %} the maximum acceptable probability that state has changed since {% katex() %}t_{\mathrm{sense}}{% end %}; {% katex() %}T_{\mathrm{heal}}{% end %} the healing deadline from {% term(url="#prop-21", def="Healing Deadline: healing must complete within the failure window minus a safety buffer; if no action fits the window, escalate to a faster intervention") %}Proposition 21{% end %}; and \\(k \geq 1\\) a deadline safety factor. The Stale Data Threshold is:*

*A {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} health report older than 10 seconds is more likely to mislead the Analyzer than inform it — acting on it is worse than waiting for a fresh reading.*

{% katex(block=true) %}
T_{\mathrm{stale}} = \min\!\left(\frac{T_{\mathrm{heal}}}{k},\ \frac{-\ln(1 - p_{\mathrm{stale}})}{\lambda_{\mathrm{total}}}\right)
{% end %}

- **Use**: Sets the maximum safe age for any health report before it risks triggering a wrong healing decision; reject reports older than {% katex() %}T_{\text{stale}}{% end %} in the Analyze phase to prevent acting on ghost state from a fault that already self-resolved.
- **Parameters**: {% katex() %}T_{\text{stale}} = T_{\text{heal}} / k{% end %}; {% katex() %}k = 2\text{--}5{% end %}; RAVEN: 30 s / 3 = 10 s maximum safe data age.
- **Field note**: Every health message must carry a monotonic timestamp — without it, stale detection is impossible regardless of what the formula computes.

> **Empirical status**: The {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} values \\(\mu_f = 0.02\\)/s and \\(p_{\text{stale}} = 0.20\\) are calibrated from flight-test fault logs; failure rates vary by component type, environmental stress, and battery level, and should be measured per platform class.

> **Physical translation**: Beyond {% katex() %}T_{\mathrm{stale}}{% end %}, acting on the reading is worse than ignoring it — the fault may have already self-resolved, or escalated to a different state. The two-term minimum takes the tighter of two independent constraints: the healing deadline divided by a safety factor (time-to-act), and the Poisson-derived staleness bound (probability the state has changed). Whichever limit is tighter governs. For RAVEN's 30-second healing window with \\(k = 3\\), the staleness budget is 10 seconds — if data is older than that, re-sense before acting.

*A node must re-run Sense and Analyze before executing if {% katex() %}t_{\mathrm{exec}} - t_{\mathrm{sense}} > T_{\mathrm{stale}}{% end %}.*

*Proof*: State transitions form a Poisson process at rate {% katex() %}\lambda_{\mathrm{total}}{% end %}. The probability of at least one transition in {% katex() %}[t_{\mathrm{sense}}, t_{\mathrm{exec}}]{% end %} is {% katex() %}1 - e^{-\lambda_{\mathrm{total}} \cdot \Delta t}{% end %}. Setting this equal to {% katex() %}p_{\mathrm{stale}}{% end %} and solving for \\(\Delta t\\) gives the second term. The constraint {% katex() %}T_{\mathrm{heal}}/k{% end %} ensures timely execution within the healing deadline if re-sensing is infeasible. \\(\square\\)

**Contested regime — feasibility window**: In \\(C = 0\\), coordination is absent (\\(\mu_c \approx 0\\)), so {% katex() %}\lambda_{\mathrm{total}} \approx \mu_f{% end %}. Simultaneously, Prop 78 requires {% katex() %}\tau < T_{\mathrm{stale}}{% end %} with probability \\(1 - \delta_\text{inst}\\), imposing a lower bound from the Pareto quantile:

{% katex(block=true) %}
T_{\mathrm{stale}} \geq \tau_{\min} \cdot \delta_\text{inst}^{-1/\alpha}
{% end %}

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} ({% katex() %}\tau_{\min} = 0.2{% end %}s, \\(\alpha = 1.6\\), \\(\delta_\text{inst} = 0.01\\), \\(\mu_f = 0.02\\)/s, {% katex() %}p_{\mathrm{stale}} = 0.20{% end %}):

- **Upper bound** (state-change): {% katex() %}T_{\mathrm{stale}} \leq -\ln(0.80)/0.02 \approx 11.2{% end %} s
- **Lower bound** (transport): {% katex() %}T_{\mathrm{stale}} \geq 3.16{% end %} s

The feasibility window for remote healing actions in Contested {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} is \\([3.16, 11.2]\\) s. Below 3.16 s the action arrives too late with probability above 1%; after 11.2 s the system state has changed with probability above 20%. Outside this window all Severity 2 and above actions are suppressed; only Severity 1 local actions remain valid. In the Degraded regime (\\(\mu_d = 0.8\\)s, \\(\sigma_d = 0.8\\)s): {% katex() %}\tau_{0.99} = e^{0.8 + 2.33 \times 0.8} \approx 14.4{% end %}s, which already exceeds the upper bound — the feasibility window collapses, signaling that remote actions are inadvisable even at Degraded connectivity during high-failure-rate episodes.

### Stability Under Mode Transitions: Piecewise Lyapunov Analysis

The gain conditions in {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} and {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} guarantee stability *within a single capability mode*. They make no claim about stability across capability-level transitions. The error state \\(x(t)\\) at the moment a mode switch fires may lie outside the new mode's Stability Region ({% term(url="@/blog/2026-01-15/index.md#def-4", def="Stability Region: maximal forward-invariant region under the current mode dynamics; error states outside this region cause the healing loop to diverge") %}Definition 4{% end %}, defined in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-4)), causing divergence even when both the pre- and post-transition gains individually satisfy their per-mode LTI conditions.

<span id="theorem-pwl"></span>

> **Design-time prerequisites:** Theorem PWL presents three LMI conditions. **C1** (per-mode Lyapunov decay) is runtime-verifiable from the system's current gain and delay measurements. **C2** (jump bound at mode transitions) and **C3** (minimum dwell-time lower bound) are design-time requirements that must be verified offline using an LMI solver before any deployment. The theorem's stability conclusion holds **only if** C2 and C3 were satisfied during system design. Treat the C2/C3 conditions as a certification prerequisite, not an operational check.

**Theorem PWL** (Piecewise Lyapunov Stability). *For the Hybrid Capability Automaton {% katex() %}\mathcal{H}{% end %} ({% term(url="@/blog/2026-01-15/index.md#def-3", def="Hybrid Capability Automaton: models the edge node as a hybrid automaton with discrete capability modes and continuous error-state dynamics") %}Definition 3{% end %}, defined in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-3)), let \\(V_q(x) = x^\top P_q x\\) with \\(P_q \succ 0\\) for each \\(q \in Q\\). The system is uniformly exponentially stable at the origin if there exist scalars \\(\lambda_q > 0\\) and {% katex() %}\mu_{q,q'} \geq 1{% end %} satisfying three LMI conditions:*

{% katex(block=true) %}
\textbf{(C1)}\quad A_q^\top P_q A_q \;-\; (1 - \lambda_q)\,P_q \;\prec\; 0 \qquad \forall\, q \in Q
{% end %}

{% katex(block=true) %}
\textbf{(C2)}\quad P_{q'} \;\preceq\; \mu_{q,q'}\,P_q \qquad \forall\,(q,q') :\; \mathrm{Guard}_{q\to q'} \neq \emptyset
{% end %}

{% katex(block=true) %}
\textbf{(C3)}\quad \tau_{\mathrm{dwell}} \;>\; \tau_d^* = \frac{\ln \mu^*}{\lambda^*}, \qquad \mu^* = \max_{q,q'} \mu_{q,q'},\quad \lambda^* = \min_q \lambda_q
{% end %}

*Condition (C1) is the within-mode decay LMI — one per capability level, solvable via MATLAB* `dlyap` *or Python* `cvxpy`*.*

*Condition (C2) bounds the Lyapunov value jump at each mode transition.*

*Condition (C3) sets the minimum dwell time: the system must remain in each mode long enough for (C1)'s geometric decay to overcome (C2)'s jump multiplier before the next transition.*

*Proof sketch*: Between transitions, {% katex() %}V_q(x(t+T_{\text{tick}})) \leq (1-\lambda_q)\,V_q(x(t)){% end %} by (C1). At each transition \\(q \to q\'\\), {% katex() %}V_{q'}(x) \leq \mu^* V_q(x){% end %} by (C2). After \\(N\\) transitions over horizon \\(T\\): {% katex() %}V(x(T)) \leq (\mu^*)^N (1-\lambda^*)^{T/T_{\text{tick}}^{\max}} V(x(0)) \to 0{% end %} as {% katex() %}T \to \infty{% end %} when (C3) holds. \\(\square\\)

> **Physical translation:** The piecewise Lyapunov certificate is an engineering contract: before deploying each capability mode, an offline solver must verify three conditions. If all three pass, you have a mathematical guarantee that healing actions in that mode will converge rather than oscillate. If C2 or C3 were skipped during design, you have an optimistic assumption, not a guarantee — and a healing loop that passes C1 alone can still oscillate at mode transitions.

*Implementation note: the \\(P_q\\) matrices are computed **offline** — once per firmware build using MATLAB* `dlyap` *or Python* `cvxpy` *— and stored as read-only constants in MCU flash. No LMI is solved at runtime. At each MAPE-K tick the only computation is one quadratic form {% katex() %}\rho_q(t) = 1 - x^\top P_q x / c_q{% end %} for state dimension {% katex() %}n \leq d_{\max} + 1 \leq 6{% end %}, costing at most 36 multiply-accumulate instructions on a Cortex-M4. The SMJLS contraction factor below is likewise precomputed from calibrated Weibull shape parameters and stored as a scalar constant; it is updated between missions on recalibration, not per tick. The \\(50\\,\mu\text{s}\\) runtime budget cited in the NSG diagram below refers entirely to these quadratic-form evaluations — no online eigenvalue computation or LMI solve occurs.*

{% term(url="#theorem-pwl", def="Semi-Markov Jump Linear System: switched linear system whose mode-dwell times follow a heavy-tail Weibull distribution; mean-square stable gain ceiling is tighter than per-mode linear bounds") %}**SMJLS tightening.**{% end %} Under the Weibull partition model ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %}), mode durations are heavy-tailed and switching is semi-Markovian. The mean-square stable gain {% katex() %}K_{\text{SMJLS}}^*(q){% end %} is strictly tighter than the per-mode LTI bound. For RAVEN ({% katex() %}k_N = 0.62{% end %}): {% katex() %}K_{\text{SMJLS}}^*(q) \approx 0.82 \cdot K_{\max}^{\text{LTI}}(q){% end %} — an empirically calibrated 18% reduction that propagates directly into the gain scheduler below; formal LMI verification of the switched-stability conditions is pending.

> **Field note — conservative bound for CBF-constrained controllers**: The 0.82 tightening factor is established for linear LTI systems. Its applicability to CBF-constrained nonlinear controllers ({% term(url="#def-39", def="Discrete Control Barrier Function: safety function enforcing mode-invariant stability across capability level transitions in the switched system") %}Definition 39{% end %}) has not been analytically verified. Use the conservative bound {% katex() %}K_{\text{SMJLS}} \leq K_{\max}^{\text{LTI}}{% end %} for safety-critical deployments; treat the 0.82 factor as an empirical target to validate during field certification ({% term(url="@/blog/2026-02-19/index.md#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %}).

**Derivation of the 0.82 factor.** The factor is not empirical — it is the analytic solution of Condition (C3) for the RAVEN parameter set. Solving the LMI system (C1)–(C3) for RAVEN ({% katex() %}T_{\text{tick}} = 5\,\text{s}{% end %}, {% katex() %}d_{\max} = 5{% end %}) yields: mode-decay rate \\(\lambda^* \approx 0.048\\) (from the L3 delay-chain companion LMI) and Lyapunov jump multiplier \\(\mu^* \approx 1.22\\) (from the L2\\(\\to\\)L3 transition, the tightest adjacent-mode pair). The SMJLS mean-square stability condition then requires the gain-scaled LMI to remain feasible under the Weibull-distributed dwell-time distribution — specifically, the expected Lyapunov growth per mode-switch must stay bounded. Numerically, this contracts the feasible \\(K_{\text{ctrl}}\\) set from the LTI interval {% katex() %}(0,\,K_{\max}^{\text{LTI}}){% end %} to {% katex() %}(0,\,0.82\,K_{\max}^{\text{LTI}}){% end %}. The 0.82 scaling is parameter-specific: for exponential dwell times (\\(k=1\\), classical MJLS), the contraction is \\(\approx 5\\%\\); for RAVEN's heavy tail (\\(k_N = 0.62\\)), it reaches 18% because heavy tails produce short-dwell excursions that increase the effective transition frequency and compound the Lyapunov jump accumulation.



<span id="def-39"></span>

**Definition 39** (Discrete Control Barrier Function). Control Barrier Functions provide formal safety guarantees for continuous-time systems {{ cite(ref="7", title="Ames et al. (2017) — Control Barrier Functions for Safety Critical Systems") }}; the discrete-time formulation used here adapts those guarantees to the MAPE-K tick structure {{ cite(ref="8", title="Ames et al. (2019) — Control Barrier Functions: Theory and Applications") }}. *A function {% katex() %}h_q : X \to \mathbb{R}{% end %} is a Discrete Control Barrier Function (dCBF) for mode \\(q\\) if the safe set {% katex() %}\mathcal{C}_q = \{x : h_q(x) \geq 0\}{% end %} is nonempty, compact, contains \\(x^\* = 0\\) in its interior, and there exists {% katex() %}\gamma_{\text{cbf}} \in (0,1){% end %} such that for all {% katex() %}x \in \mathcal{C}_q{% end %}:*

{% katex(block=true) %}
h_q\!\bigl(A_q x + B_q u\bigr) \;\geq\; (1 - \gamma_{\text{cbf}})\,h_q(x)
{% end %}

*The canonical choice for the MAPE-K healing loop is {% katex() %}h_q(x) = c_q - x^\top P_q x = c_q \cdot \rho_q{% end %}, so that {% katex() %}\mathcal{C}_q = \mathcal{R}_q{% end %} (the Stability Region). The dCBF condition then becomes: the one-tick-ahead Lyapunov value under the proposed control input must not grow faster than the \\((1-\gamma_{\text{cbf}})\\) contraction rate.*

*Here \\(\rho_q\\) is the CBF stability margin — the normalized distance from the current state to the mode-\\(q\\) stability region boundary. This is distinct from the energy ratio used in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) and from the retry multiplier in the refractory backoff formula.*

- **Use**: Check {% katex() %}h_q(A_q x + B_q u) \geq (1-\gamma_{\text{cbf}})h_q(x){% end %} before every Execute phase; if violated, reduce \\(K_{\text{ctrl}}\\) via the CBF-QP closed form until the condition holds.
- **Parameters**: {% katex() %}\gamma_{\text{cbf}} \in (0,1){% end %} — smaller \\(\gamma_{\text{cbf}}\\) means tighter contraction and tighter constraint on admissible \\(K_{\text{ctrl}}\\); \\(\gamma_{\text{cbf}} = 0.05\\) is a safe default for 5 s MAPE-K ticks; runtime cost is one \\(6\times6\\) quadratic form (36 multiplications, \\(<20\\,\mu\\)s on Cortex-M4 at L1 throttle).
- **Field note**: The dCBF check costs the same as evaluating \\(\rho_q(t)\\) — if you are already logging the stability margin, the safety filter is essentially free.

**The Sampling Frequency Trap.** The \\(20\\,\mu\text{s}\\) dCBF evaluation is only the *logic cost* — the cost of checking {% katex() %}h_q(A_q x + B_q u) \geq (1-\gamma_{\text{cbf}}) h_q(x){% end %} once \\(x\\) is known. The hidden cost is *state estimation*: obtaining a fresh \\(x(t)\\) requires an IMU sample, sensor fusion, and state prediction.

Under fault conditions — rotor asymmetry, rapid attitude change, impending crash — the safety guarantee requires \\(x(t)\\) to be fresher than the failure propagation time (~100–300 ms for RAVEN; see {% term(url="#prop-25", def="Nonlinear Safety Invariant: safety invariant is preserved across mode transitions if the gain scheduler satisfies the barrier condition at each boundary") %}Proposition 25{% end %}). This creates a regime-dependent sensing cost that must be pre-budgeted separately from the logic cost:

| Regime | Required sample rate | IMU power (RAVEN) | State estimation cost |
|--------|---------------------|-------------------|-----------------------|
| Nominal (MAPE-K cycle) | 0.2 Hz | ~0.05 mW | Included in Zero-Tax baseline |
| Degraded (fault detected) | 10–50 Hz | ~2–36 mW | **NOT** in Zero-Tax baseline |
| Emergency (CBF active) | 100+ Hz | ~15–28 mW | Requires dedicated power reservation |

The Zero-Tax autonomic tier budgets for logic computation at baseline sensing rates. When the CBF safety filter activates (fault detected), the system must *automatically escalate* its sensing rate — and the power budget for that escalation must be pre-reserved. For RAVEN, this means reserving ~20 mW of the "emergency power margin" exclusively for high-rate IMU sampling during CBF-active intervals. Failure to reserve this margin causes the CBF to operate on stale \\(x(t)\\), rendering the safety certificate void.

*(Notation: {% katex() %}\gamma_{\text{cbf}} \in (0,1){% end %} is the CBF contraction rate used throughout this section, governing how quickly the safety margin \\(h_q\\) is permitted to contract per tick.)*

Budget at least 20 mW emergency margin in the RAVEN power profile (~11–60% of the 150–180 mW nominal platform budget, achievable by throttling background processing). Require fault-confidence > 0.9 (two consecutive MAPE-K ticks with \\(\varepsilon_\text{model}\\) exceeded) before escalating to high-rate IMU sampling. Treating every anomaly as a potential crash will drain the emergency power margin in under 30 seconds at 100 Hz.

> **Warning**: The dCBF logic cost (\\(<20\\,\mu\text{s}\\)) does not include state estimation. Pre-reserve power for high-rate IMU sampling or the safety certificate becomes void when it is needed most.

- **Model-validity condition**: The condition {% katex() %}h_q(A_q x + B_q u) \geq (1-\gamma_{\text{cbf}})h_q(x){% end %} is conditional on \\(A_q\\) accurately representing the *current* plant dynamics. Under physical damage (motor degradation shifts poles) or sustained RF interference (actuator desaturation changes \\(B_q\\)), the true one-step map {% katex() %}f_{\text{true}}(x,u) \neq A_q x + B_q u{% end %}. A dCBF check that passes against the nominal model may fail against the true model. The guarantee of {% term(url="#prop-25", def="Nonlinear Safety Invariant: safety invariant is preserved across mode transitions if the gain scheduler satisfies the barrier condition at each boundary") %}Proposition 25{% end %} is valid only within the accuracy envelope of \\(A_q\\); see {% term(url="#prop-31", def="CBF-derived refractory bound: minimum refractory period ensuring the safety condition is maintained between consecutive healing actions") %}Proposition 31{% end %} for the recovery-time implication.
- **Staleness correction under partition**: When state estimate \\(x(t)\\) is stale (partition age {% katex() %}T_{\text{acc}} > \tau_\text{stale}^\text{max}{% end %} from {% term(url="@/blog/2026-01-22/index.md#def-26", def="Staleness: elapsed time since a gossip record was last updated; records older than the maximum useful staleness bound are discarded") %}Definition 26{% end %}), substitute {% katex() %}h_q(x(t)) - \lambda_{\text{decay}} \cdot \Delta t_{\text{stale}}{% end %} in place of \\(h_q(x(t))\\) in the safety check, where \\(\lambda_{\text{decay}}\\) is the staleness decay coefficient from {% term(url="#def-45", def="Staleness Decay Function: time-decaying weight applied to gossip health updates, making older observations contribute less to anomaly threshold estimation") %}Definition 45{% end %}. This makes the check **conservative**: a stale state estimate shows a smaller safety margin, deferring actions rather than falsely approving them.

> **Notation.** The staleness decay coefficient \\(\lambda_\text{decay}\\) is the initial slope of the exponential decay curve from {% term(url="#def-45", def="Staleness Decay Function: time-decaying weight applied to gossip health updates, making older observations contribute less to anomaly threshold estimation") %}Definition 45{% end %}: {% katex() %}\lambda_\text{decay} = 1/\tau_\text{stale}^\text{max}{% end %}. Geometrically, it is the rate at which the safety margin shrinks per second of stale data. For the OUTPOST temperature sensor example ({% katex() %}\tau_\text{stale}^\text{max} = 96\,\text{s}{% end %}), {% katex() %}\lambda_\text{decay} = 0.0104\,\text{s}^{-1}{% end %}.

**Sensitivity analysis: \\(\varepsilon_\text{model}\\) calibration and false-lockout risk.** The model-error tolerance \\(\varepsilon_\text{model}\\) is a tunable threshold with a direct false-lockout/false-clearance trade-off:

| \\(\varepsilon_\text{model}\\) | False-lockout risk | False-clearance risk | Recommended use case |
|----|----|----|-----|
| 0.01 | High — benign IMU noise triggers lockout | Very low | Safety-critical systems with high-quality sensors and well-identified plant models |
| 0.05 | Moderate — calibrated for RAVEN with \\(\pm 2\\%\\) gyro noise | Low | General-purpose; well-calibrated edge nodes |
| 0.10 | Low | Moderate — mild model drift passes undetected | Harsh environments; accept higher model uncertainty |
| 0.20 | Very low | High — significant model errors pass | Only if model accuracy is structurally unachievable; pair with frequent re-identification |

**Calibration procedure.** Derive \\(\varepsilon_\text{model}\\) from field data in three steps: (1) Run the identified model \\((A_q, B_q)\\) against recorded nominal trajectories; measure the 95th-percentile prediction residual \\(e_{\text{P95}}\\). (2) Set {% katex() %}\varepsilon_\text{model} = 1.5 \times e_{\text{P95}}{% end %} — a 50% safety margin above typical prediction error. For RAVEN: \\(e_{\text{P95}} \approx 0.033\\), giving {% katex() %}\varepsilon_\text{model} = 0.05{% end %}. (3) Validate with fault-injection: inject known model-invalidating faults (locked rotor, 20% calibration drift) and verify detection within \\(n_\text{detect} \leq 3\\) MAPE-K ticks.

**False-lockout scenario.** A rapid altitude drop or downdraft shifts aerodynamic coefficients by 8–58% for a RAVEN drone — temporarily exceeding {% katex() %}\varepsilon_\text{model} = 0.05{% end %} for a non-critical environmental transient. Require the model error to *persist* above \\(\varepsilon_\text{model}\\) for \\(n_\text{persist} \geq 3\\) consecutive MAPE-K ticks before triggering lockout. This filters single-sample glitches while preserving detection of sustained model failures.

The persistence filter \\(n_\text{persist} \geq 3\\) ticks (15 s at \\(T_\text{tick} = 5\\,\text{s}\\)) is a mandatory implementation parameter — not an optional optimization. Without it, a single out-of-bounds sensor reading during a downdraft or vibration event triggers a healing lockout. This matches the Schmitt-trigger hysteresis window in {% term(url="#def-47", def="Schmitt Trigger Hysteresis: dual threshold with separate trigger and release levels preventing healing loop flapping near a boundary") %}Definition 47{% end %} and the Adaptive Refractory Backoff minimum period in {% term(url="#def-48", def="Adaptive Refractory Backoff: refractory period doubles after each consecutive healing action to prevent runaway remediation") %}Definition 48{% end %}.

> **Warning**: A too-tight \\(\varepsilon_\text{model}\\) causes false lockouts on vibration; a too-loose one lets real model drift pass undetected. Calibrate from field P95 residuals and always require \\(n_\text{persist} \geq 3\\) ticks of sustained exceedance before acting.

<span id="def-40"></span>

**Definition 40** (CBF Gain Scheduler). *Given current state \\(x\\), mode \\(q\\), and stability margin \\(\rho_q(t)\\), the mode-and-state-indexed safe gain is:*

{% katex(block=true) %}
K_{\mathrm{gs}}(x,\, q) \;=\; \eta \cdot K_{\max}^{\mathrm{LTI}}(q) \cdot \Phi\!\bigl(\rho_q(t)\bigr), \qquad \eta = 0.85
{% end %}

*where \\(\eta = 0.85\\) provides a 15% model-error margin and {% katex() %}\Phi : (-\infty, 1] \to [0,1]{% end %} is the piecewise scheduling function:*

{% katex(block=true) %}
\Phi(\rho) = \begin{cases} 1 & \rho > 0.5 \\ 2\rho & 0 \leq \rho \leq 0.5 \\ 0 & \rho < 0 \end{cases}
{% end %}

- **Use**: Look up {% katex() %}K_{\mathrm{gs}}{% end %} from a precomputed 100-entry \\(\rho_q\\)-indexed table at each MAPE-K tick and replace the static \\(K_{\text{ctrl}}\\) in the healing actuator; the table fits in 400 bytes of MCU flash with no runtime LMI needed.
- **Parameters**: Full gain (\\(\Phi = 1\\)) when \\(\rho > 0.5\\) — no derate in the safe interior; linear derate as \\(\rho\\) falls below 0.5; zero gain (healing suspended) when \\(\rho < 0\\).
- **Field note**: A DEFER rate above 5% per hour (\\(\rho_q < 0\\) triggering suspension) means either {% katex() %}K_{\text{nominal}}{% end %} is too aggressive for the current mode or the \\(P_q\\) matrices are miscalibrated from stale field data.

| \\(\rho_q(t)\\) | \\(\Phi(\rho)\\) | {% katex() %}K_{\mathrm{gs}}/K_{\max}^{\mathrm{LTI}}{% end %} | Operational meaning |
| :--- | :--- | :--- | :--- |
| \\(> 0.8\\) | 1.0 | 0.85 | Safe interior — full corrective authority |
| \\([0.5,\\, 0.8]\\) | 1.0 | 0.85 | Approaching boundary — no derate yet |
| \\([0.2,\\, 0.5)\\) | \\(2\rho\\) | 0.17–0.85 | Near boundary — proportional derate active |
| \\([0,\\, 0.2)\\) | \\(2\rho\\) | \\(<0.17\\) | Safety-critical margin — minimal gain; extend refractory |
| \\(< 0\\) | 0 | 0 | Outside \\(\mathcal{R}_q\\) — healing suspended |

> **Physical translation:** The CBF gain scheduler is the lookup table the healing loop uses to decide how aggressively to respond, based on two inputs: how bad the current health score is, and which operating mode the system is in. A high health score in normal mode gets a fast response; a critically low battery in survival mode gets a slow, conservative response to preserve the last of the power budget.

> **Analogy:** Cruise control with a collision-avoidance override — the CBF is the hard "don't get closer than X meters" rule that overrides the speed controller regardless of driver input. No matter how urgently the driver wants to accelerate, the safety envelope takes precedence.

**Logic:** The dCBF condition \\(h_q(A_q x + B_q u) \geq (1 - \gamma_{\text{cbf}}) h_q(x)\\) enforces a per-tick safety margin. The gain scheduler \\(K_{\mathrm{gs}} = \eta \cdot K_{\max}^{\mathrm{LTI}} \cdot \Phi(\rho_q)\\) then linearly scales healing authority down as \\(\rho_q\\) approaches zero.

**Compute Profile:** CPU: {% katex() %}O(d_{\max}^2){% end %} per tick — one quadratic form {% katex() %}x^\top P_q x{% end %} of size {% katex() %}d_{\max} \times d_{\max}{% end %}, one table lookup, one scalar multiply. Memory: {% katex() %}O(Q \cdot d_{\max}^2){% end %} — one precomputed {% katex() %}P_q{% end %} matrix per regime {% katex() %}q{% end %}; no runtime LMI solve required.

**Nonlinear Safety Guardrail (NSG).** The dCBF and gain scheduler combine into a unified per-tick safety filter that wraps the standard MAPE-K Execute phase. The four phases execute in order each tick:

{% mermaid() %}
flowchart TD
    M["[M] MONITOR<br/>Compute stability margin ρ_q in mode q"]
    M --> Mcheck{"ρ_q < 0?"}
    Mcheck -->|"Yes — outside safe set"| Mdefer["Set K_gs = 0<br/>Log OUTSIDE_SAFE_SET"]
    Mdefer --> Mend(["Skip to next MAPE-K tick"])
    Mcheck -->|"No"| A{"[A] ANALYZE<br/>Mode transition proposed?"}
    A -->|"No — same mode q"| P
    A -->|"Yes — q to q_new"| Acomp["Compute ρ_q_new<br/>for target mode q_new"]
    Acomp --> Acheck{"ρ_q_new < 0?"}
    Acheck -->|"Yes — target unsafe"| Atdefer["Defer transition<br/>Hold mode q<br/>Log TRANSITION_UNSAFE"]
    Atdefer --> P
    Acheck -->|"No"| Adwell{"Dwell time satisfied?<br/>t_since_switch ≥ τ_dwell_min?"}
    Adwell -->|"No"| Await["Hold mode q<br/>Wait for dwell_min"]
    Await --> P
    Adwell -->|"Yes"| P["[P] PLAN<br/>Compute K_gs from stability table<br/>Ramp gain if K_nominal > K_gs"]
    P --> E["[E] EXECUTE<br/>Apply K_gs<br/>Commit q = q_new<br/>Log ρ_q to telemetry"]
{% end %}

> **Read the diagram**: This flowchart is the safety filter that wraps every MAPE-K tick. Monitor computes the stability margin \\(\rho_q\\); if negative (outside the safe set) the tick is skipped entirely. Analyze checks whether a mode transition is safe and whether the dwell time in the current mode has been satisfied. Plan looks up the derated gain from the stability table. Execute applies the gain, commits the mode transition if approved, and logs stability margin to telemetry. All checks are O(1) arithmetic — under \\(50\\,\mu\text{s}\\) on a Cortex-M4.

Runtime: two {% katex() %}(d_{\max}+1) \times (d_{\max}+1){% end %} quadratic forms plus one table lookup — under {% katex() %}50\,\mu\text{s}{% end %} at L1 throttle on a Cortex-M4 for {% katex() %}d_{\max} = 5{% end %}.

<span id="prop-25"></span>

**Proposition 25** (Nonlinear Safety Invariant). *If {% katex() %}x(0) \in \mathcal{R}_{q(0)}{% end %} and the Nonlinear Safety Guardrail is active at every MAPE-K tick, then {% katex() %}x(t) \in \mathcal{R}_{q(t)}{% end %} for all {% katex() %}t \geq 0{% end %}.*

*If the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} loop starts in a safe state and the guardrail checks run every tick, the system provably never leaves its stability region across all mode transitions.*

- **Use**: Formally certifies that no healing action fires while the system is outside its Stability Region in any capability mode; this invariant is required evidence for Level 3+ Field Autonomic Certification ({% term(url="@/blog/2026-02-19/index.md#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %}, defined in [The Constraint Sequence and the Handover Boundary](@/blog/2026-02-19/index.md#def-104)).
- **Parameters**: Precondition {% katex() %}x(0) \in \mathcal{R}_{q(0)}{% end %} is verified at boot (Phase 0 of FAC, {% term(url="@/blog/2026-02-19/index.md#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %}); {% katex() %}d_{\max} \leq 5{% end %} ticks of DEFER guarantees re-entry for all RAVEN/CONVOY/OUTPOST configurations.
- **Field note**: A {% katex() %}\rho_q(t){% end %} trending from 0.85 to 0.40 over 90 minutes under sustained L1 throttle is actionable intelligence — under pure LTI analysis, {% katex() %}K = 0.30 < K_{\max} = 0.33{% end %} appears healthy at every tick until the loop suddenly destabilizes.

**Inter-tick safety margin (physical validity condition).** The discrete-time safety certificate \\(h_q(x(t_k)) \geq 0\\) is only physically meaningful if failure modes propagate slower than the sampling period \\(T_{\text{tick}}\\). Formally:

{% katex(block=true) %}
h_q(x(t_k)) \geq L_h \cdot \|f_q\|_{\max} \cdot T_{\text{tick}}
{% end %}

must hold at every tick, where \\(L_h\\) is the Lipschitz constant of \\(h_q\\) and \\(\|f_q\|_{\max}\\) is the maximum rate of change of the system state.

For RAVEN, rotor-failure propagation takes approximately 200 ms while {% katex() %}T_{\text{tick}} = 5\,\mathrm{s}{% end %}, so this condition is violated by \\(25\\times\\). The certificate guarantees the swarm was safe at the last check interval, not that it remains safe until the next.

Systems with failure propagation times shorter than \\(T_{\text{tick}}\\) require either interrupt-driven sensing or a physical L0 interlock ({% term(url="@/blog/2026-02-19/index.md#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}) as the true safety backstop.

**L0 Physical Safety Interlock ({% term(url="@/blog/2026-02-19/index.md#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}, preview).** {% term(url="@/blog/2026-02-19/index.md#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %} is formally introduced in [The Constraint Sequence and the Handover Boundary](@/blog/2026-02-19/index.md#def-108). In brief: a hardware-wired circuit that arrests all actuators regardless of software state; non-resettable without physical human action. It is the true safety backstop for failure modes that propagate faster than the MAPE-K sampling interval \\(T_\text{tick}\\) — precisely the inter-tick gap identified above.

**Calibrating \\(L_h\\).** The Lipschitz constant \\(L_h\\) bounds how fast the safety function \\(h_q(x)\\) can change as the system state evolves. Empirical estimate: linearize \\(h_q\\) around the equilibrium and compute \\(L_h = \max_x \|\nabla h_q(x)\|\\) over a representative state trajectory from field data. For RAVEN's rotor-health barrier function ({% katex() %}h_q = \text{min rotor speed} - \text{threshold}{% end %}), \\(L_h \approx 1\\). For nonlinear barriers (e.g., CBF based on kinetic energy), \\(L_h\\) must be estimated numerically. A conservative upper bound is sufficient for the safety certificate; a tight \\(L_h\\) improves the frequency at which the certificate is non-vacuous.

> **Warning**: The discrete-time safety certificate is only valid when failure propagation is slower than \\(T_{\text{tick}}\\). For RAVEN, rotor failures propagate in ~200 ms — 25× faster than the 5 s tick. Hardware interlocks, not software certificates, are the safety backstop for fast-propagating faults.

*Proof*: By strong induction on tick \\(t\\). **Base**: {% katex() %}x(0) \in \mathcal{R}_{q(0)}{% end %} by precondition. **Inductive step**: assume {% katex() %}x(t) \in \mathcal{R}_{q(t)}{% end %}. *(i) Within-mode tick*: {% katex() %}K_{\mathrm{gs}}{% end %} is selected to satisfy the dCBF decrease condition ({% term(url="#def-39", def="Discrete Control Barrier Function: safety function enforcing mode-invariant stability across capability level transitions in the switched system") %}Definition 39{% end %}), giving {% katex() %}h_{q(t)}(x(t+1)) \geq (1-\gamma_{\text{cbf}})h_{q(t)}(x(t)) \geq 0{% end %}, so {% katex() %}x(t+1) \in \mathcal{R}_{q(t)}{% end %}. *(ii) Mode transition \\(q \to q\'\\)*: the ANALYZE phase checks {% katex() %}\rho_{q'} > 0{% end %} — equivalently {% katex() %}x(t)^\top P_{q'} x(t) < c_{q'}{% end %} — before allowing transition. If the check passes, {% katex() %}x(t) \in \mathcal{R}_{q'}{% end %} and within-mode stability applies for \\(q\'\\). If it fails, the transition is deferred and the within-mode argument applies to \\(q(t)\\). *(iii) DEFER with \\(\rho_q < 0\\)*: {% katex() %}K_{\mathrm{gs}} = 0{% end %}; the open-loop delay chain \\(A_q^0\\) (gain removed) has all eigenvalues at zero (nilpotent shift) for the class of plants where \\(A_q\\) is nilpotent, so \\(V_q(x)\\) decreases monotonically — {% katex() %}x(t+N) \in \mathcal{R}_q{% end %} for finite {% katex() %}N \leq d_{\max}{% end %} ticks. For general Schur-stable plants with spectral radius {% katex() %}\rho(A_q) \leq 1-\gamma_{\text{cbf}}{% end %}, the dCBF contraction condition guarantees \\(V_q(x)\\) decreases monotonically at rate \\((1-\gamma_{\text{cbf}})\\) per tick, achieving {% katex() %}x(t+N) \in \mathcal{R}_q{% end %} within \\(N \leq d_{\max}\\) ticks. \\(\square\\)

### Adaptive Gain Scheduling

The stability condition {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %} suggests a key insight: as feedback delay \\(\tau\\) varies with {% term(url="@/blog/2026-01-15/index.md#def-6", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}, the controller gain \\(K_{\text{ctrl}}\\) should adapt accordingly. Gain scheduling as a technique for handling operating-point variation is surveyed in {{ cite(ref="9", title="Rugh & Shamma (2000) — Research on Gain Scheduling") }}.

**Gain scheduling by {% term(url="@/blog/2026-01-15/index.md#def-6", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}**:

Define regime-specific gains that maintain stability margins across all operating conditions:

**Notation — \\(\alpha\\) symbols in this article**: Multiple scalars named \\(\alpha\\) appear with distinct roles; subscripts are the only disambiguator:

- {% katex() %}\alpha_{\text{EMA}} \approx 0.1{% end %} — EMA smoothing coefficient (Adaptive Gain Scheduling section): each tick moves 10% toward the target gain, completing transitions in ~10 ticks.
- {% katex() %}\alpha_{\text{margin}} = 0.75{% end %} — gain stability margin (Adaptive Gain Scheduling section): the gain is set to 75% of the theoretical ceiling to maintain robustness against delay estimation errors.
- {% katex() %}\alpha_{\text{heal}} \approx 0.2{% end %} — resource allocation fraction for healing (Cascade Prevention section): caps total healing resource draw at 20% of available budget.
- \\(\alpha(R) \in (0,1]\\) / {% katex() %}\alpha_{\text{floor}}{% end %} — MAPE-K throttle coefficient ({% term(url="#prop-36", def="Self-Throttling Law: the node must enter OBSERVE mode when the resource state drops below a threshold that ensures survival to the next gossip round") %}Proposition 36{% end %}): scales MAPE-K frequency by available resource margin.
- {% katex() %}\alpha_{\text{age}} \leq 0.5{% end %} — priority aging cap (Resource Priority Matrix section): limits how much a waiting action's priority can drift upward.
- {% katex() %}\alpha_{\text{CBF}}{% end %} — class-K function parameter in the discrete Control Barrier Function ({% term(url="#def-39", def="Discrete Control Barrier Function: function ensuring the system stays within the safe set on every MAPE-K tick via a per-tick contraction condition") %}Definition 39{% end %}): governs how tightly the CBF contraction bound is enforced; {% katex() %}\alpha_\text{CBF} = \gamma_{\text{cbf}} \in (0,1){% end %} in this article's notation.
- {% katex() %}\alpha_{\text{Lyap}}{% end %} — Lyapunov decay rate per mode \\(q\\) (Theorem PWL, C1 condition): appears as \\(\lambda_q\\) in the LMI; listed here because some references write the per-mode decay as \\(\alpha_q\\).
- {% katex() %}\alpha_{\text{conf}}{% end %} — confidence threshold scaling factor in the staleness-aware threshold adjustment ({% term(url="#def-45", def="Staleness Decay Time Constant: maximum elapsed time since last Knowledge Base sync before confidence in local observations falls to near zero") %}Definition 45{% end %} section): multiplies the confidence floor when the Knowledge Base is partially stale.
- {% katex() %}\alpha_{\text{W}}{% end %} — Weibull shape constant role: in Definitions 13–14 the Weibull shape parameter is \\(k_N\\); some literature writes this as \\(\alpha\\). In this article it is always \\(k_N\\).
- \\(\alpha\\) (bare, {% term(url="#def-37", def="Stochastic Transport Delay Model: models MAPE-K feedback delay as a Weibull random variable, enabling robust gain scheduling under variable latency") %}Definition 37{% end %}) — Pareto tail index for contested-regime delay distribution: a statistical fitting parameter, not a design knob.
- \\(\alpha\\) (bare, LinUCB) — exploration bonus scale in the contextual bandit gain-selection formula (Cascade Prevention section).

*Bare \\(\alpha\\) without subscript always refers to the EMA smoothing coefficient in this article. Full series notation registry: [Notation Registry](/notation-registry/).*

**Notation — \\(K\\) symbols in this article**: Two distinct quantities use the letter \\(K\\) and must not be confused:

- \\(K_{\text{ctrl}}\\) — **controller gain** (stability bound): the scalar parameter in the proportional healing actuator; the stability condition {% katex() %}K_{\text{ctrl}} < 1/(1+\tau/T_{\text{tick}}){% end %} bounds how aggressively the healer may respond to avoid oscillation.
- \\(K\\) in MAPE-**K** — **knowledge base**: the fifth element of the tuple \\((M, A, P, E, K)\\) in {% term(url="#def-36", def="Autonomic Control Loop: closed-loop tuple (M,A,P,E,K) where each phase has a defined input and output type for self-managing systems") %}Definition 36{% end %}; a replicated state store that feeds all four phases. \\(K\\) in this role is never a scalar and is never constrained by a stability inequality.

**Notation — \\(\gamma\\) symbols in this article**: Four distinct quantities use \\(\gamma\\) and are disambiguated by subscript:

- {% katex() %}\gamma_{\text{cbf}} \in (0,1){% end %} — **CBF contraction rate**: the class-K function parameter in {% term(url="#def-39", def="Discrete Control Barrier Function: function ensuring the system stays within the safe set on every MAPE-K tick via a per-tick contraction condition") %}Definition 39{% end %} (Discrete Control Barrier Function); governs the per-tick contraction of the safety margin \\(h_q\\). Default \\(\gamma_{\text{cbf}} = 0.05\\) for 5 s MAPE-K ticks.
- \\(\gamma_{\text{step}}\\) — **threshold step-size**: the increment by which the anomaly detection threshold \\(\theta(t)\\) steps toward the optimal target per adaptation cycle; bounded by \\(|\Delta\theta|\\).
- \\(\gamma_{\text{damp}}\\) — **derivative dampener rate**: the confidence-derivative threshold in the actuation hold condition; defined as {% katex() %}(\theta_H - \theta_L)/(2w \cdot T_{\text{tick}}){% end %}.
- {% katex() %}\gamma_{\text{rl}} \in [0,1){% end %} — **RL discount factor**: the temporal discount applied to future rewards in reinforcement-learning and MDP formulations in the action-selection sections.

{% katex(block=true) %}
K_{\text{regime}} = \frac{\alpha_{\text{margin}}}{1 + \tau_{\text{regime}}/T_{\text{tick}}}
{% end %}

where {% katex() %}\alpha_{\text{margin}} < 1{% end %} is the stability margin factor ({% katex() %}\alpha_{\text{margin}} = 0.75{% end %} retains 75% of the theoretical gain limit, providing a robust safety margin against delay estimation error).

The table below translates this formula into concrete gain values for each {% term(url="@/blog/2026-01-15/index.md#def-6", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}, with the Healing Response column describing the behavioral consequence of operating at that gain.

| Regime | Typical \\(\tau\\) | Controller Gain \\(K_{\text{ctrl}}\\) | Healing Response |
|:-------|:-------------------|:------------------------|:-----------------|
| \\(Full\\) | 2-5s | 0.15-0.40 | Aggressive corrections; fast convergence to target state |
| \\(Degraded\\) | 10-30s | 0.025-0.08 | Moderate corrections; stable but slower to converge |
| \\(Intermittent^+\\) | 30-120s | 0.007-0.025 | Conservative corrections; accepts slow convergence to avoid oscillation |
| \\(Denied^+\\) | \\(\infty\\) (timeout) | 0.005 | Minimal corrections; reverts to open-loop predetermined responses |

*\\(^+\\) For Intermittent and Denied regimes where transport delay follows a heavy-tailed (Pareto) distribution ({% term(url="#def-37", def="Stochastic Transport Delay Model: models MAPE-K feedback delay as a Weibull random variable, enabling robust gain scheduling under variable latency") %}Definition 37{% end %}), the "typical \\(\tau\\)" used in the gain formula is the **P95 percentile** from {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %}'s stochastic model — the mean delay is either very large or undefined under these distributions. Use {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %} directly for these regimes; {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}'s deterministic formula with mean \\(\tau\\) is valid only for Connected and Degraded regimes.*

**Smooth gain transitions**:

Abrupt gain changes can destabilize the control loop. The exponential smoothing formula below blends the new target gain with the previous gain using mixing coefficient {% katex() %}\alpha_{\text{EMA}} \approx 0.1{% end %}, so that each timestep moves only a small fraction of the way toward the target.

{% katex(block=true) %}
K_{\text{ctrl}}(t) = \alpha_{\text{EMA}} \cdot K_{\text{ctrl,target}}(\text{regime}(t)) + (1 - \alpha_{\text{EMA}}) \cdot K_{\text{ctrl}}(t-1)
{% end %}

where {% katex() %}\alpha_{\text{EMA}} \approx 0.1{% end %} prevents oscillation during regime transitions.

**Bumpless transfer protocol**:

When switching between regime-specific gains, maintain controller output continuity:

1. Compute new gain {% katex() %}K_{\text{ctrl,new}}{% end %} for target regime
2. Calculate output difference: {% katex() %}\Delta U = (K_{\text{ctrl,new}} - K_{\text{ctrl,old}}) \cdot e(t){% end %}
3. Spread \\(\Delta U\\) over transition window {% katex() %}T_{\text{transfer}} \approx 3\tau_{\text{old}}{% end %}
4. Apply gradual change to avoid step discontinuities

**Proactive gain adjustment**:

Rather than waiting for a regime transition to trigger a gain change, the controller linearly extrapolates the current feedback delay trend to predict the delay {% katex() %}\hat{\tau}{% end %} at lookahead time \\(\Delta\\) and pre-adjusts the gain before the delay actually increases.

{% katex(block=true) %}
\hat{\tau}(t + \Delta) = \tau(t) + \frac{d\tau}{dt} \cdot \Delta
{% end %}

If predicted delay exceeds current regime threshold, preemptively reduce gain before connectivity degrades.

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} example**: During mountain transit, connectivity degradation is predictable from terrain maps. The healing controller reduces gain 30 seconds before entering known degraded zones, preventing oscillatory healing behavior when feedback delays suddenly increase.

> **Cognitive Map**: The MAPE-K loop is a proportional feedback controller whose stable controller-gain ceiling falls as feedback delay grows — {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %}. Three levels of protection enforce this: the per-mode LTI gain bound ({% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}; LTI bound — SMJLS analysis tightens this under time-varying gain, see proof), the robust percentile-based gain for heavy-tailed contested delays ({% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %}), and the runtime Nonlinear Safety Guardrail that checks the stability margin before every Execute phase. Healing actions must also finish before the failure becomes irreversible ({% term(url="#prop-21", def="Healing Deadline: upper bound on time-to-resolution for healing actions of given severity, derived from MAPE-K tick rate and action queue depth") %}Proposition 21{% end %}) and use data fresh enough that state has not changed since sensing ({% term(url="#prop-24", def="Stale Data Threshold: maximum gossip staleness above which stale data increases the false-positive rate; equals the Maximum Useful Staleness bound") %}Proposition 24{% end %}). The result: a healing loop that is provably stable, provably timely, and provably operating on current information.

### The Watchdog Protocol: Layer-0 Hardware Safety

**Problem**: Self-healing software that crashes has no way to heal itself. A {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop that deadlocks during the Analyze phase cannot Monitor its own deadlock or Plan a recovery — the healer has become the patient. Watchdog timers are a foundational technique in the fault taxonomy of dependable systems {{ cite(ref="10", title="Avizienis et al. (2004) — Basic Concepts and Taxonomy of Dependable Computing") }}.

**Solution**: Wrap every autonomic loop in a three-layer hardware watchdog. The innermost layer is a hardware timer that fires a reset interrupt if the software loop misses its heartbeat, bypassing the OS entirely. Each outer layer monitors the layer inside it and is strictly simpler than what it monitors.

**Trade-off**: The watchdog adds a mandatory bypass period of up to \\(T_0\\) seconds after any {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} hang. Tighter watchdog periods (smaller \\(T_0\\)) reduce unprotected exposure but require the loop to complete its heartbeat more reliably — making the bypass window less tolerant of occasional slow cycles under load.

{% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} (LTI bound; SMJLS analysis tightens this under time-varying gain — see proof) guarantees closed-loop stability *when the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} software loop executes correctly*. It provides no guarantee when the loop itself fails: the Monitor thread deadlocks waiting for a {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} response, the Planner enters an infinite loop over a cyclic dependency graph, or the Executor hangs mid-action after a kernel panic. In these cases, the autonomic software that is supposed to heal the system has itself become the patient — with no higher-level authority to call.

The engineering response is a **hardware watchdog timer (WDT)**: a hardware counter that fires a reset interrupt unless software resets it before expiry. The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop "pets" the watchdog at the end of each successful Execute phase. If the loop hangs, the counter expires, the interrupt fires, and control transfers to a pre-certified bypass program that operates entirely without {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} software involvement.

<span id="def-41"></span>
**Definition 41** (Software Watchdog Timer). *A watchdog protocol is a tuple {% katex() %}W = (T_0, T_1, k, \mathbf{B}, \mathcal{R}){% end %} with three concentric monitoring layers:*

- *Layer 0 (hardware WDT): fires bypass action \\(B_0\\) if the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} thread does not write a heartbeat within \\(T_0\\) seconds. \\(T_0\\) must satisfy {% katex() %}T_0 \leq T_{\text{cycle}}{% end %} (minimum {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} cycle time) to detect hangs within one loop iteration.*
- *Layer 1 (software watchdog): a dedicated watchdog thread checks {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} liveness every \\(T_1\\) seconds and triggers restart \\(B_1\\) after \\(k\\) consecutive missed heartbeats.*
- *Layer 2 (meta-loop): a minimal monitoring process checks that Layer 1 itself is alive; escalates to \\(B_0\\) if Layer 1 fails.*

*\\(\mathbf{B} = (B_0, B_1)\\) is the ordered bypass action pair (\\(B_1\\) attempted first; \\(B_0\\) on escalation). {% katex() %}\mathcal{R}{% end %} is the restoration predicate — the conditions under which the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop may resume control after bypass activation.*

*Heartbeat priority guarantee: the watchdog pet operation must be assigned the highest execution priority in the MAPE-K scheduler — above all healing action execution. Under concurrent healing load (\\(N_\text{concurrent}\\) simultaneous loops), the execution queue delay \\(\tau/(1-u)\\) applies to all other operations but not to the watchdog heartbeat. If the implementation cannot guarantee watchdog priority, the watchdog timeout must be set to {% katex() %}T_0 = T_\text{tick} / (1 - u_\text{max}){% end %} where \\(u_\text{max}\\) is the maximum expected queue utilization.*

**Layer separation principle**: \\(B_0\\) must be implementable with no component at hardware-interrupt level or above — no OS calls, no shared memory locks, no {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} module dependencies. Each layer must be strictly simpler than the one it monitors.

> **Physical translation**: Three concentric alarms. The innermost watches MAPE-K every \\(T_1\\) seconds — if MAPE-K stops heartbeating, the software watchdog restarts it. If the software watchdog itself stops, the hardware watchdog fires after \\(T_0\\) seconds and resets the processor. The hardware layer has zero dependencies on the software it is watching: it monitors an electrical signal, not a function call. A processor frozen in a bad memory state will still trigger the hardware watchdog.

{% mermaid() %}
graph TD
    MAPEK["MAPE-K Software Loop<br/>(heartbeat each cycle)"]
    L1["Layer 1: Software Watchdog<br/>monitors MAPE-K liveness<br/>every T1 seconds"]
    L0["Layer 0: Hardware WDT<br/>fires if no heartbeat<br/>within T0 seconds"]
    B1["Bypass B1<br/>Restart MAPE-K thread<br/>preserve state snapshot"]
    B0["Bypass B0<br/>Execute safe-state action<br/>no OS involvement"]
    RESTORE{"Restoration check R<br/>resume MAPE-K?"}

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

> **Read the diagram**: The green MAPE-K box sends heartbeats to both Layer 1 (software watchdog thread, orange) and Layer 0 (hardware WDT, red). Layer 1 acts first — after \\(k\\) consecutive missed heartbeats it triggers Bypass B1 (restart the MAPE-K thread). If B1 fails, or if Layer 1 itself stops, Layer 0 fires Bypass B0: a certified safe-state program that runs with no OS calls, no shared memory, no MAPE-K module involvement. The blue Restoration diamond checks three conditions before allowing MAPE-K back in control; if any condition fails, the system stays in B0.

<span id="prop-26"></span>
**Proposition 26** (Watchdog Coverage Condition). *Let {% katex() %}\lambda_{\text{loop}}{% end %} be the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop failure rate (events per unit time). With Layer-0 hardware WDT period \\(T_0\\), the expected unprotected exposure time per failure event is bounded:*

*A 100 ms {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} hardware watchdog catches MAPE-K hangs \\(3000\\times\\) faster than waiting for a human operator to notice.*

{% katex(block=true) %}
\mathbb{E}[T_{\text{unprotected}}] \leq T_0
{% end %}

*Without a watchdog, expected unprotected time is {% katex() %}T_{\text{human detect}}{% end %}. The watchdog improvement factor is:*

{% katex(block=true) %}
\text{MTTU gain} = \frac{T_{\text{human detect}}}{T_0}
{% end %}

*Proof*: A hang at time \\(t\\) is detected by the next WDT expiry at time \\(t + T_0\\) at the latest. The unprotected window \\([t,\\, t + T_0]\\) is bounded by \\(T_0\\). \\(\square\\)

> **Physical translation**: {% katex() %}\text{MTTU gain} = T_{\text{human detect}} / T_0{% end %} — the watchdog replaces human detection time with a hardware timer period. For RAVEN, a human operator might take 5 minutes to notice a hung loop; the hardware WDT fires in 100 ms. The gain is {% katex() %}300\,\text{s} / 0.1\,\text{s} = 3000\times{% end %}. Smaller \\(T_0\\) means faster detection but tighter timing requirements on the MAPE-K loop's heartbeat — the loop must reliably complete and write its heartbeat within every \\(T_0\\) window even under peak load.

> **Empirical status**: The 5-minute human detection time is a planning assumption for unattended {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} operations; attended deployments with active monitoring will have shorter human detection times, reducing the MTTU gain but not changing the architectural argument for hardware watchdog protection.

**Restoration condition {% katex() %}\mathcal{R}{% end %}**: The bypass state is not permanent. The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop may resume when: (1) all {% katex() %}\mathcal{L}_0{% end %} capabilities are independently verified stable, (2) the condition causing the hang is no longer present, and (3) a dry-run {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} cycle completes successfully with no actions executed. The dry-run prevents re-entry into a loop that will immediately hang again.

**Critical design constraint**: All healing actions must be **idempotent and resumable**. If the WDT fires mid-action, re-executing the action from scratch must produce the same outcome as completing the interrupted execution. Non-idempotent actions (e.g., "append to counter") require transaction semantics before they can be managed by a watchdog-protected loop.

*Watchdog-refractory interaction: if the Software Watchdog fires while the Healing Dead-Band is in a refractory state, the process restart triggered by the watchdog resets the refractory counter to zero. To prevent the resulting loss of backoff context from causing oscillatory restarts, the node must persist its current refractory cycle count \\(n\\) to non-volatile storage on every refractory increment. After a watchdog-triggered restart, the persisted \\(n\\) is restored and backoff resumes from \\(\tau_\text{ref}(n)\\) rather than \\(\tau_\text{ref}(0)\\).*

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration**: {% katex() %}T_0 = 100\,\text{ms}{% end %} (maximum tolerable period before attitude control degrades), \\(T_1 = 1\\,\text{s}\\), \\(k = 3\\). Bypass \\(B_0\\): maintain current heading, throttle, and altitude in attitude-hold mode. MTTU gain: {% katex() %}T_{\text{human detect}} \approx 300\,\text{s}{% end %} vs. \\(T_0 = 0.1\\,\text{s}\\) yields \\(3000\times\\) improvement.

**{% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} calibration**: \\(T_0 = 30\\,\text{s}\\) (Kubernetes liveness probe as Layer-0), \\(T_1 = 5\\,\text{s}\\), \\(k = 2\\). Bypass \\(B_0\\): stop accepting new requests, drain in-flight transactions, hold persistence layer state steady. The bypass action must never forcibly terminate the database layer regardless of {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} state — data integrity takes precedence over healing speed.

**Compute Profile:** CPU: {% katex() %}O(1){% end %} per tick — one counter decrement and one threshold comparison (software layer); hardware WDT register write carries no CPU overhead. Memory: {% katex() %}O(1){% end %} — single heartbeat counter and timeout threshold. The binding scheduling constraint is priority assignment: the heartbeat write must run at highest scheduler priority to prevent priority inversion.

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

> **Read the diagram**: Three parallel monitor sources (metrics every 5s, streaming logs, synthetic probes every 15s) all feed the Anomaly Detector. Analysis flows sequentially left-to-right: anomaly detection \\(\to\\) dependency mapping \\(\to\\) impact assessment. Planning is likewise sequential: generate candidates \\(\to\\) evaluate risk \\(\to\\) sequence multi-action plans. The three Execute controllers (container, network, load balancer) each receive their actions from the Coordinator. The Knowledge Base (yellow) feeds Analyze and Plan with dotted arrows but does not feed Execute directly — keeping the execution path simple, policy-driven, and auditable.

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

> **Read the diagram**: Arrows point from caller to dependency (left to right). The red Payment Service is the failed node; orange nodes (Fraud Check, ML Scoring) are downstream services whose behavior degrades with the failure. The Load Balancer and API Gateway (upstream) are unaffected. The healing sequence must verify all dependencies of the failed service — Payment DB, Message Queue — before restarting the service itself. A restart that fails immediately due to an unhealthy dependency wastes the healing budget and risks cascading restarts.

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

> **Physical translation**: At most one-third of currently healthy nodes restart simultaneously, guaranteeing at least two-thirds always serve traffic. The \\(\max(1, \cdot)\\) floor ensures at least one node can always restart even in a tiny cluster. This is a capacity reservation: the cluster reserves two-thirds of its healthy nodes as a service buffer while the remaining third cycles through healing.

With 28 storage nodes and 1 failed, maximum concurrent restarts = 9. This ensures at least 18 nodes remain serving traffic during any healing operation.

### Game-Theoretic Extension: Healing Resource Congestion

When multiple {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loops coexist — one per monitored subsystem — each loop solves its healing action optimization independently. Their resource claims compete for shared capacity (CPU, bandwidth, power), forming a **congestion game**.

**Congestion game**: Each {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop \\(i\\) selects a healing action {% katex() %}a_i \in \mathcal{A}_i{% end %} requiring resource vector \\(\mathbf{r}(a_i)\\). The cost of action \\(a_i\\) increases with the number of loops simultaneously using the same resources (congestion level \\(n_r\\) on resource \\(r\\)).

By Rosenthal's theorem (1973), congestion games always admit a pure Nash equilibrium, which minimizes the potential function \\(\Phi(\mathbf{a})\\): the sum over all resources \\(r\\) of the cumulative marginal costs incurred as each successive loop claims that resource, where \\(n_r(\mathbf{a})\\) is the number of loops simultaneously using resource \\(r\\) under action profile \\(\mathbf{a}\\).

{% katex(block=true) %}
\Phi(\mathbf{a}) = \sum_{r \in R} \sum_{k=1}^{n_r(\mathbf{a})} c_r(k)
{% end %}

where \\(c_r(k)\\) is the marginal cost of resource \\(r\\) at congestion level \\(k\\).

**Coordination protocol**: Each {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop selects healing actions to minimize \\(\Phi\\) (best-response descent) respecting the aggregate resource constraint {% katex() %}Q_{\text{heal}} < Q_{\text{total}} - Q_{\text{min}}{% end %}. The healing coordination game admits a pure Nash equilibrium (Rosenthal 1973). Best-response dynamics converge in potential games, but {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} healing uses gradient-based updates rather than pure best-response; convergence to Nash should be verified empirically for each deployment. In practice, this means a shared resource declaration table: loops register resource requirements and receive grants only when the current allocation remains feasible.

**Practical implication**: Replace the heuristic "max concurrent restarts = {% katex() %}\lfloor n_{\text{healthy}}/3 \rfloor{% end %}" with a congestion game coordination layer. When multiple failures occur simultaneously ({% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} jamming causes multi-component failures), loops negotiate resource grants through potential-function minimization rather than competing independently. This generalizes to heterogeneous resource requirements without per-scenario tuning.

**Stability boundary.** The single-loop stability proof ({% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}, Theorem PWL) does not extend directly to the multi-loop case. The congestion game establishes Nash equilibrium *existence* under Rosenthal's theorem, but it does not bound the number of coordination rounds or prevent inter-loop oscillation: loop A fixes subsystem X, loop B's action incidentally reverts X, loop A fires again. Two conditions are sufficient to prevent infinite livelock: (1) every healing action consumes a positive, non-recoverable amount of a finite resource (time, refractory credits, or energy budget) so no loop can fire indefinitely without exhausting its allocation; and (2) all loops share the same priority matrix (monotone descent on the common potential function \\(\Phi\\)). Under these conditions, the multi-loop system inherits finite convergence from the potential-game structure. Condition (1) is enforced by the refractory period ({% term(url="#def-46", def="Healing Dead-Band and Refractory State: dual-threshold mechanism preventing the healing loop from issuing back-to-back actions faster than the refractory period") %}Definition 46{% end %} and {% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing dead-band with adaptive refractory backoff prevents integrator windup; oscillation amplitude decays with each refractory cycle") %}Proposition 30{% end %}); condition (2) is enforced by requiring all loops to reference the same priority matrix instance ({% term(url="#def-43", def="Resource Priority Matrix: table defining which resource classes preempt others during survival-mode shedding, preventing priority inversion under scarcity") %}Definition 43{% end %}) — a single shared table, not per-loop copies.

The qualitative conditions above are necessary but not sufficient against the **inter-node oscillation** failure mode specific to fleet healing: Node A sheds load to Node B; Node B independently detects an anomaly and sheds it back; the fleet enters a chaotic exchange rather than a steady state. This differs from the single-node chatter addressed by Definitions 46–49 — it involves no single loop firing twice, so the refractory period cannot prevent it. Three mechanisms can enforce convergence at the fleet level:

| Mechanism | Guarantee | Failure mode |
| :--- | :--- | :--- |
| **Probabilistic Backoff** — jitter delay before Execute (CSMA/CD analog) | Breaks synchrony; at most one node fires per gossip period | Does not prevent oscillation — nodes may defer forever or fire in rotation |
| **Resource Tokens** — virtual token budget (\\(T_i\\) transfers/gossip period) | Bounds max oscillation frequency | Token exhaustion blocks healing even when critical; deadlock possible |
| **Global Energy Function** — HAC gate: action admitted iff \\(V\\) strictly decreases | Formal Lyapunov certificate; no oscillation by construction | None — the only approach with a convergence proof |

**Recommended approach**: Global Energy Function ({% term(url="#def-42", def="Fleet Stress Function and Healing Admission Condition: Lyapunov-based gate admitting only healing actions that reduce aggregate fleet stress") %}Definition 42{% end %}) as the primary gate, with Probabilistic Backoff as a synchrony-breaking supplement. The following definition and proposition make this precise.

<span id="def-42"></span>
**Definition 42** (Fleet Stress Function and Healing Admission Condition). *Let the fleet be {% katex() %}\mathcal{F} = \{1, \ldots, N\}{% end %}. Each node \\(i\\) maintains resource state {% katex() %}s_i(t) = (\ell_i(t),\; d_i(t),\; q_i(t)) \in [0,1]^3{% end %}, where \\(\ell_i\\) is normalized load, \\(d_i = 1 - b_i\\) is battery deficit (\\(b_i\\) = state of charge), and \\(q_i\\) is queue depth fraction. The* **Fleet Stress Function** *{% katex() %}V : [0,1]^{3N} \to \mathbb{R}_{\geq 0}{% end %} is:*

{% katex(block=true) %}
V(S) = \sum_{i=1}^{N} \bigl[\varphi(\ell_i) + \varphi(d_i) + \varphi(q_i)\bigr],
\qquad \varphi(x) = \frac{x^2}{1 - x + \varepsilon}
{% end %}

*where \\(\varepsilon > 0\\) softens the barrier near \\(x = 1\\). \\(\varphi\\) is strictly convex, \\(\varphi(0) = 0\\), {% katex() %}\varphi'(x) \to \infty{% end %} as \\(x \to 1\\).*

**Authority gate (prerequisite)**: Before evaluating HAC, verify {% katex() %}Q_{\text{effective}}(t) \geq Q_{\text{required}}(a){% end %}, where authority tier \\(Q_{\text{effective}}\\) reflects the node's current escalation level in the four-tier hierarchy (Tier 0 = heartbeat-only, Tier 1 = degraded-local, Tier 2 = full-autonomic, Tier 3 = cloud-delegated); \\(Q_{\text{required}}(a)\\) is the minimum tier needed to authorize healing action \\(a\\). (Formally defined as {% term(url="@/blog/2026-02-05/index.md#def-68", def="Authority Tier: decision-scope hierarchy from node to cluster to fleet to command; higher tiers require higher connectivity, and partitions trigger delegation to lower tiers") %}Definition 68{% end %} in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md#def-68).) If the executing node lacks the required authority tier, reject action *a* immediately — HAC is not evaluated. This gate fires first in the execution pipeline: Authority, then Hardware Veto ({% term(url="#prop-32", def="Mode-Transition Safety: a mode transition is safe only when the system state lies in the safe region of both the departing and arriving mode at transition time; Definition 39 enforces this pre-transition check") %}Proposition 32{% end %}), then HAC, then Actuate.

*A healing action {% katex() %}A_{i \to j}{% end %} (transferring resource \\(r\\) from node \\(i\\) to node \\(j\\) by amount \\(\Delta r\\)) satisfies the* **Healing Admission Condition (HAC)** *if and only if:*

{% katex(block=true) %}
V(S') \;\leq\; V(S) - \eta_{\min}
{% end %}

*where \\(S\'\\) is the post-transfer state and {% katex() %}\eta_{\min} > 0{% end %} is the minimum required improvement. An action failing HAC is rejected by the Execute phase before any command is transmitted. Each node additionally adds jitter {% katex() %}\delta_i \sim \mathrm{Uniform}[0,\, T_{\mathrm{gossip}}]{% end %} before evaluating HAC (Probabilistic Backoff):*

{% katex(block=true) %}
t_{\mathrm{fire},i} = t_{\mathrm{eligible},i} + \delta_i, \qquad \delta_i \sim \mathrm{Uniform}[0,\; T_{\mathrm{gossip}}]
{% end %}

- **Parameters**: \\(\varepsilon = 0.01\\); {% katex() %}\eta_{\min} = 0.001 \cdot V(S){% end %} (require 0.1% fleet stress reduction per action); {% katex() %}\Delta r_{\max} = 0.2{% end %} (max single-transfer fraction).
- **Implementation**: \\(V(S)\\) is computed from the gossip health vector ({% term(url="@/blog/2026-01-22/index.md#def-24", def="Gossip Health Protocol: epidemic dissemination where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds") %}Definition 24{% end %}). Peer data is bounded-stale by {% katex() %}\tau_\text{stale}^\text{max}{% end %} ({% term(url="@/blog/2026-01-22/index.md#prop-14", def="Maximum useful staleness bound: gossip data older than the staleness threshold degrades anomaly detection below acceptable sensitivity") %}Proposition 14{% end %}). HAC check is \\(O(N)\\) in gossip vector size — constant time for a fixed fleet.
- **Field note**: Log \\(V(S)\\) at every Execute phase. Monotone decrease is the primary diagnostic: a non-decreasing \\(V\\) trace indicates either a HAC implementation bug or a fault not addressable by load redistribution (escalate to severity S3, {% term(url="#def-44", def="Healing Action Severity: ordinal scale classifying healing actions by resource cost and mission disruption, used to select minimum-impact interventions first") %}Definition 44{% end %}).

> **Physical translation**: \\(V(S)\\) is the mathematical analog of a stress elevation above sea level. Every healing action is a downhill step — the HAC check confirms the step goes down before it is taken. Node A shedding to Node B lowers the hill; shedding back would go uphill. HAC rejects it. The fleet can only descend.

<span id="prop-27"></span>
**Proposition 27** (Fleet Healing Convergence — Lyapunov Certificate). *Let the fleet execute HAC-gated healing under Definition 42. Let \\(S^\*\\) be any state satisfying {% katex() %}\ell_i \leq \ell_{\mathrm{warn}}{% end %}, {% katex() %}d_i \leq d_{\mathrm{warn}}{% end %}, {% katex() %}q_i \leq q_{\mathrm{warn}}{% end %} for all \\(i\\). Then:*

*When every {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} healing action must reduce fleet stress, the swarm cannot enter the oscillation cycles that required manual intervention in uncontrolled simulations.*

*(i)* **Positive definiteness**: *\\(V(S) \geq 0\\) for all \\(S\\); \\(V(S) = 0\\) iff \\(\ell_i = d_i = q_i = 0\\) for all \\(i\\).*

*(ii)* **Monotone decrease**: *Every admitted healing action satisfies {% katex() %}V(S(t+1)) \leq V(S(t)) - \eta_{\min}{% end %}.*

*(iii)* **No inter-node oscillation**: *If {% katex() %}A_{i \to j}{% end %} is admitted at step \\(t\\), then {% katex() %}A_{j \to i}{% end %} is rejected at step \\(t+1\\). More generally, no healing action admitted at step \\(t+1\\) can return \\(V\\) to \\(V(S(t))\\).*

*(iv)* **Finite convergence**: *Starting from \\(V(S(0)) < \infty\\), the fleet reaches \\(S^\*\\) in at most {% katex() %}\lceil V(S(0)) / \eta_{\min} \rceil{% end %} healing steps.*

*Proof sketch*: (i) follows from \\(\varphi(x) \geq 0\\) and \\(\varphi(0) = 0\\). (ii) is immediate from the HAC gate definition.

*(iii)*: Suppose {% katex() %}A_{i \to j}{% end %} was admitted at step \\(t\\), so {% katex() %}V(S(t+1)) \leq V(S(t)) - \eta_{ij}{% end %} for {% katex() %}\eta_{ij} \geq \eta_{\min}{% end %}. The return action {% katex() %}A_{j \to i}{% end %} at step \\(t+1\\) restores \\(\ell_i, \ell_j\\) to their step-\\(t\\) values, so {% katex() %}V(S(t+2)) = V(S(t)) > V(S(t+1)){% end %}, violating HAC — {% katex() %}A_{j \to i}{% end %} is rejected. The argument extends inductively to any cycle {% katex() %}A_{i \to j}, A_{j \to k}, \ldots, A_{k \to i}{% end %}: each hop decreases \\(V\\) by at least {% katex() %}\eta_{\min}{% end %}, so the final return hop would need to increase \\(V\\) by the accumulated decrease — HAC rejects it.

*(iv)*: \\(V \geq 0\\) and decreases by at least {% katex() %}\eta_{\min}{% end %} per step, so at most {% katex() %}V(S(0))/\eta_{\min}{% end %} steps can occur. \\(\square\\)

*Assumption: load vector \\(d_i, d_j\\) and queue depth \\(q_i, q_j\\) remain constant during the healing step interval \\([t, t+1]\\). Under time-varying traffic, the monotone-decrease property holds up to load-induced perturbations — the Lyapunov certificate bounds finite convergence to within one traffic-fluctuation window, not to exact \\(V = 0\\).*

> **Physical translation**: The convergence bound is concrete. For RAVEN (\\(N = 47\\), typical \\(V(S(0)) \approx 5.0\\) under 12-drone battery anomaly, {% katex() %}\eta_{\min} = 0.005{% end %}): at most 1000 healing steps. At one step per gossip period (5 s), full fleet recovery is guaranteed within 83 minutes from any initial fault state — or immediately if faults are addressable in fewer steps. Without HAC, the same scenario produced a 6-node oscillation cycle lasting 22 minutes before manual intervention (100-run simulation).
>
> *Note: the convergence bound assumes stable load during each healing step. Systems with bursty traffic converge within one load-fluctuation window rather than to exact zero stress — the certificate guarantees forward progress, not instantaneous optimality.*

> **Empirical status**: The convergence bound of 1000 steps (83 minutes) and the 43-step average from 100 simulation runs are specific to the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} parameter set (\\(N=47\\), \\(\eta_{\min}=0.005\\), \\(V(S(0)) \approx 5.0\\)); different fleet sizes, failure rates, or resource distributions will produce different convergence times.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration**: During simulated 12-drone simultaneous battery anomaly (\\(N = 47\\)):
- **Without HAC**: healing entered a 6-node A-B-C exchange pattern lasting 22 minutes before manual intervention.
- **With HAC + probabilistic backoff** ({% katex() %}T_{\mathrm{gossip}} = 5\,\mathrm{s}{% end %} jitter window): oscillation eliminated in all 100 simulation runs. Fleet stress \\(V(S)\\) decreased monotonically to \\(< 0.01 \cdot V(S(0))\\) within 43 steps (3.6 minutes average).

**Relationship to existing results**: The HAC gate addresses a failure mode orthogonal to those in Definitions 46–49. The refractory period ({% term(url="#def-46", def="Healing Dead-Band and Refractory State: dual-threshold mechanism preventing the healing loop from issuing back-to-back actions faster than the refractory period") %}Definition 46{% end %}, {% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing dead-band with adaptive refractory backoff prevents integrator windup; oscillation amplitude decays with each refractory cycle") %}Proposition 30{% end %}) prevents a *single node's* loop from firing too frequently; the Schmitt trigger ({% term(url="#def-47", def="Schmitt Trigger Hysteresis: dual threshold with separate trigger and release levels preventing healing loop flapping near a boundary") %}Definition 47{% end %}) prevents threshold chatter on a *single sensor*; the derivative dampener ({% term(url="#def-49", def="Healing Budget Envelope: per-interval cap on total healing action energy expenditure, preventing the healing loop from depleting the survival power reserve") %}Definition 49{% end %}) suppresses transient spikes on a *single signal*. HAC is the first mechanism that constrains *inter-node* healing transfers at the fleet level. The conditions are complementary: a system should enforce all of them in the Execute phase.

**Authority prerequisite**: HAC applies only to actions for which the executing node holds the required authority tier ({% term(url="@/blog/2026-02-05/index.md#def-68", def="Authority Tier: decision-scope hierarchy from node to cluster to fleet to command; higher tiers require higher connectivity, and partitions trigger delegation to lower tiers") %}Definition 68{% end %}). *(Authority tiers: L0 = node-scope actions only; L1 = cluster-scope; L2 = fleet-scope; L3 = command-scope. Formally defined in [{% term(url="@/blog/2026-02-05/index.md#def-68", def="Authority Tier: decision-scope hierarchy from node to cluster to fleet to command; higher tiers require higher connectivity, and partitions trigger delegation to lower tiers") %}Definition 68{% end %}, Fleet Coherence Under Partition](@/blog/2026-02-05/index.md#def-68).)* A node operating at {% katex() %}Q_{\text{effective}}(t) < Q_{\text{required}}(\text{action}){% end %} rejects the action at the authority gate before reaching HAC — HAC is not evaluated. This ordering ensures that a partitioned node with temporarily elevated effective tier cannot bypass the Lyapunov energy gate.

### Resource Priority Matrix: Deterministic Conflict Resolution

The congestion game converges to Nash equilibrium via iterative best-response dynamics — but convergence takes multiple coordination rounds. This is too slow when two actions claim the same CPU simultaneously and combined demand exceeds supply. A deterministic preemption layer sits *above* the congestion game: when resource claims conflict, the priority matrix resolves the contest in \\(O(1)\\) time without coordination overhead.

<span id="def-43"></span>
**Definition 43** (Resource Priority Matrix). *Given resource set {% katex() %}\mathcal{R} = \{r_1, \ldots, r_m\}{% end %} and healing action set {% katex() %}\mathcal{A} = \{a_1, \ldots, a_n\}{% end %}, the Resource Priority Matrix {% katex() %}\mathbf{P} \in [0,1]^{n \times m}{% end %} assigns priority weight {% katex() %}P_{ij}{% end %} to action \\(a_i\\)'s claim on resource \\(r_j\\). When actions \\(a_i\\) and \\(a_k\\) both claim resource \\(r_j\\) with demands \\(d_i, d_k\\) such that \\(d_i + d_k > Q_j\\) (available capacity):*

{% katex(block=true) %}
\text{alloc}(a_i, r_j) = \begin{cases}
\min\!\left(d_i,\; Q_j - d_k\right) & P_{ij} > P_{kj} \quad \text{(preempt)} \\
d_i \cdot Q_j / (d_i + d_k) & P_{ij} = P_{kj} \quad \text{(share proportionally)} \\
\max\!\left(0,\; Q_j - d_k\right) & P_{ij} < P_{kj} \quad \text{(yield)}
\end{cases}
{% end %}

*Priority weights derive from the lexicographic objective hierarchy — Survival \\(\succ\\) Autonomy \\(\succ\\) Coherence \\(\succ\\) {% term(url="@/blog/2026-02-12/index.md#def-79", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %} {{ cite(ref="11", title="Taleb (2012) — Antifragile: Things That Gain From Disorder") }} — with the healing action's protected capability tier determining its row weight:*

{% katex(block=true) %}
P_{ij} = \begin{cases}
1.0 & a_i \text{ protects } \mathcal{L}_0 \text{ (survival: thermal, power, structural)} \\
0.8 & a_i \text{ protects } \mathcal{L}_1\text{--}\mathcal{L}_2 \text{ (autonomy)} \\
0.5 & a_i \text{ protects } \mathcal{L}_3 \text{ (coherence)} \\
0.3 & a_i \text{ protects } \mathcal{L}_4 \text{ (anti-fragility)}
\end{cases}
{% end %}

**Thermal vs. throughput conflict** (the motivating case): thermal emergency cooling protects hardware survival ({% katex() %}\mathcal{L}_0{% end %}, \\(P = 1.0\\)); throughput optimization serves mission coherence ({% katex() %}\mathcal{L}_3{% end %}, \\(P = 0.5\\)). When both demand the same CPU cores, cooling preempts throughput instantly and deterministically — no negotiation round required.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} CPU priority matrix** (representative subset):

| Healing action | Protected tier | CPU priority | Preempts |
| :--- | :--- | :--- | :--- |
| Battery emergency land | \\(\mathcal{L}_0\\) | 1.0 | All lower tiers |
| Thermal throttle | \\(\mathcal{L}_0\\) | 1.0 | All lower tiers |
| Formation rebalance | \\(\mathcal{L}_2\\) | 0.8 | Coherence, anti-fragility |
| Gossip rate increase | \\(\mathcal{L}_3\\) | 0.5 | Anti-fragility only |
| Model weight update | \\(\mathcal{L}_4\\) | 0.3 | None (yields to all) |

<span id="prop-28"></span>
**Proposition 28** (Priority Preemption Deadline Bound). *Under strict priority preemption with the Resource Priority Matrix, action \\(a_i\\) misses its healing deadline {% katex() %}T_{\text{dead}}(a_i){% end %} only if the total CPU time consumed by strictly higher-priority actions during \\(a_i\\)'s execution window exceeds available slack {% katex() %}T_{\text{dead}}(a_i) - T_{\text{exec}}(a_i){% end %}:*

*An L0-tier thermal emergency always meets its deadline because nothing can preempt it; a throughput optimization may be starved if thermal events last longer than its slack.*

{% katex(block=true) %}
P(\text{miss deadline}_{a_i}) \leq P\!\left(\sum_{\substack{a_k:\, P_{kj} > P_{ij}}} T_{\text{exec}}(a_k) > T_{\text{dead}}(a_i) - T_{\text{exec}}(a_i)\right)
{% end %}

*For {% katex() %}\mathcal{L}_0{% end %} - tier actions ({% katex() %}P_{ij} = 1.0{% end %}): nothing preempts them, so {% katex() %}P(\text{miss deadline}) = 0{% end %} under any resource contention. For throughput optimization ({% katex() %}P_{ij} = 0.5{% end %}): miss probability is bounded by the probability that thermal events last longer than the throughput slack.*

*Proof*: Under strict preemption, a tier-{% katex() %}P_{ij}{% end %} action holds the resource continuously once granted and is interrupted only by a strictly higher-priority preemptor. Worst-case blocking equals the sum of all higher-priority execution times within the same window. Deadline miss requires this sum to exceed available slack. \\(\square\\)

**Anti-starvation aging**: Low-tier actions ({% katex() %}P_{ij} = 0.3{% end %}) could be indefinitely starved if higher-priority actions arrive continuously. Priority is elevated linearly with queue age to bound maximum wait time:

{% katex(block=true) %}
P_{ij}(t) = \min\!\left(1.0,\; P_{ij}^{\text{base}} + \alpha_{\text{age}} \cdot \frac{t - t_{\text{queued}}}{T_{\text{age}}}\right)
{% end %}

where {% katex() %}\alpha_{\text{age}} \leq 0.5{% end %} caps maximum elevation from aging, and {% katex() %}T_{\text{age}}{% end %} is the maximum acceptable wait time for any tier.

**Connection to congestion game**: The Resource Priority Matrix is the *initializer* for best-response dynamics. Rather than starting from equal resource weights and iterating toward Nash, the matrix provides an initial allocation already aligned with the lexicographic objective. The congestion game then fine-tunes within-tier resource sharing.

**{% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}-based healing action selection** *(formally developed in [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md#term-ucb); used here as a preview)*: {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} tracks success rates for each healing action by failure category. The table below shows accumulated attempt and success counts alongside the {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} score that the exploration-exploitation formula assigns, which blends estimated success rate with an exploration bonus that grows when an action has been tried infrequently.

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

Upon reconnection, the site uploads its healing log. Central platform reconciles any conflicts (e.g., site promoted a replica to primary that central also promoted elsewhere) using causal ordering with {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} timestamps ({% term(url="#prop-24", def="Stale Data Threshold: maximum gossip staleness above which stale data increases the false-positive rate; equals the Maximum Useful Staleness bound") %}Proposition 24{% end %}) with site-local decisions taking semantic priority ({% term(url="@/blog/2026-02-05/index.md#prop-49", def="NTP-Free Split-Brain Resolution: HLC-based merge correctly resolves split-brain scenarios without physical clock synchronization") %}Proposition 49{% end %}). Wall-clock LWW is unreliable during partition due to clock drift; the NTP-Free Semantic Commit Order of {% term(url="@/blog/2026-02-05/index.md#prop-49", def="NTP-Free Split-Brain Resolution: HLC-based merge correctly resolves split-brain scenarios without physical clock synchronization") %}Proposition 49{% end %} provides the correct causal resolution.

**Utility analysis**:

The MTTR improvement {% katex() %}\Delta \text{MTTR}{% end %} equals the manual resolution time {% katex() %}T_{\text{human}}{% end %} minus the automated detection and healing time, where {% katex() %}T_{\text{human}}{% end %} includes paging delay, context acquisition, and decision time.

{% katex(block=true) %}
\Delta \text{MTTR} = \text{MTTR}_{\text{manual}} - \text{MTTR}_{\text{auto}} = T_{\text{human}} - (T_{\text{detect}} + T_{\text{heal}})
{% end %}

**Escalation rate bound**: For healing actions with success probability \\(p_s\\) and \\(k\\) retry attempts:

{% katex(block=true) %}
P(\text{escalate}) = (1 - p_s)^k
{% end %}

With \\(p_s \geq 0.9\\) and \\(k = 3\\): {% katex() %}P(\text{escalate}) \leq 0.001{% end %}. Adding unknown failure modes (\\(\approx 5\\%\\) of incidents): {% katex() %}P(\text{escalate}) \approx 0.05{% end %}.

**Utility improvement**: {% katex() %}\Delta U = \Delta \text{MTTR} \cdot V_{\text{availability}} - \text{FPR} \cdot C_{\text{unnecessary}}{% end %}. Sign(\\(\Delta U\\)) > 0 when {% katex() %}\Delta \text{MTTR} \cdot V > \text{FPR} \cdot C{% end %}.

> **Cognitive Map**: The watchdog protocol enforces strict layer separation: MAPE-K software is monitored by a software watchdog thread, which is monitored by a hardware WDT — each layer strictly simpler than the one it monitors. The MTTU gain formula {% katex() %}T_{\text{human detect}} / T_0{% end %} quantifies what is bought: replacing multi-minute human detection with a sub-second hardware interrupt. HYPERSCALE instantiates these principles at data center scale: three parallel monitor sources, dependency-aware restart sequencing, and a Resource Priority Matrix that resolves resource conflicts in \\(O(1)\\) without coordination rounds. The lexicographic hierarchy (Survival \\(\succ\\) Autonomy \\(\succ\\) Coherence \\(\succ\\) Anti-fragility) determines priority weights deterministically — thermal emergencies always preempt throughput optimizations regardless of which loop happens to act first. Next: healing actions must also contend with genuine uncertainty about root cause — the following section addresses acting effectively on symptoms alone.

---

## Healing Under Uncertainty

**Problem**: A connected system with expert operators can diagnose failures systematically — gather logs, trace root cause, apply targeted fix. A disconnected edge system during partition has none of that: no historical context, no external expertise, and no time to wait for analysis before the failure worsens.

**Solution**: Act on observable symptoms using a cost-calibrated confidence threshold. You don't need to know *why* a service is failing to restart it productively. You need to know whether acting's expected value exceeds waiting's expected value. That judgment requires only the confidence level and the relative costs of false positives versus false negatives.

**Trade-off**: Symptom-based healing can temporarily suppress a worsening root cause. Escalation controls — attempt limits, re-trigger windows, treatment cooldowns — bound this risk without requiring root cause knowledge.

### Acting Without Root Cause

Root cause analysis is the gold standard for remediation: understand why the problem occurred, address the underlying cause, prevent recurrence. In well-instrumented cloud environments with centralized logging and expert operators, it is achievable.

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

<span id="def-44"></span>
**Definition 44** (Healing Action Severity). *The severity \\(\varsigma(a) \in [0, 1]\\) of healing action \\(a\\) is determined by its reversibility \\(R(a) \in [0,1]\\) and impact scope \\(I(a) \in [0,1]\\): {% katex() %}\varsigma(a) = (1 - R(a)) \cdot I(a){% end %}. Actions with \\(\varsigma(a) > 0.8\\) are classified as high-severity.*

In other words, severity is high when an action is both hard to undo and affects many components simultaneously; a cache flush scores near zero (fully reversible, narrow scope) while isolating a node from the fleet scores near one (irreversible, wide impact).

**Act/Wait Decision Problem**:

Given a confidence estimate \\(c\\) from the anomaly detector and a candidate healing action \\(a\\), the system must decide whether to act now or wait for more evidence. The objective selects the binary decision \\(d^\*\\) that maximizes expected utility, where acting incurs a false-positive cost when the diagnosis is wrong and waiting incurs a false-negative cost when the failure is real.

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

Act when {% katex() %}\mathbb{E}[U(1)] > \mathbb{E}[U(0)]{% end %}, which yields:

{% katex(block=true) %}
d^* = 1 \iff c > \theta^*(a) = \frac{C_{\text{FP}}(a)}{C_{\text{FP}}(a) + C_{\text{FN}}(a) + V_{\text{heal}}(a)}
{% end %}

> **Physical translation**: \\(\theta^\*(a)\\) is the break-even confidence — the point where acting and waiting have equal expected cost. If false-positive cost is 10% of the total, act at 10% confidence. When the failure costs \\(100\\times\\) more than the unnecessary restart ({% katex() %}C_{\text{FN}} \gg C_{\text{FP}}{% end %}), the break-even drops near zero: act on almost any signal. For a drone reboot (high disruption if wrong, catastrophic if missed), the denominator is large and \\(\theta^\*\\) is high — confirmation required. For a gossip-rate increase (trivial if wrong, valuable if right), \\(\theta^\*\\) is low — act freely.

- **Use**: Computes the minimum confidence at which triggering a healing action has positive expected utility given its FP/FN cost ratio; set per action type during integration testing to prevent intuition-based thresholds that ignore relative costs of false alarms vs. missed faults.
- **Parameters**: {% katex() %}C_{\text{FP}}{% end %} = disruption cost of unnecessary healing; {% katex() %}C_{\text{FN}}{% end %} = operational damage while the fault persists (mission degradation, reduced capacity — *not* asset loss); {% katex() %}V_{\text{heal}}{% end %} = incremental operational gain from successful recovery *above* fault avoidance (mission re-enabled, capability restored beyond minimum viable — *not* the same asset value already counted in {% katex() %}C_{\text{FN}}{% end %}). These three terms must be economically disjoint.
- **Field note**: Thresholds should differ by action type — a drone reboot needs {% katex() %}> 0.9{% end %} confidence; a gossip-rate change needs only {% katex() %}> 0.6{% end %}.

This is the full form stated in {% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %}. When {% katex() %}V_{\text{heal}}{% end %} is folded into the effective false-negative cost (i.e., {% katex() %}C_{\text{FN}}^{\text{eff}} = C_{\text{FN}} + V_{\text{heal}}{% end %}), this reduces to the simplified form of Corollary 84.1.

Three constraints bound the threshold regardless of what the cost-ratio formula produces: a minimum floor so the system is never trigger-happy at near-zero confidence, a maximum ceiling so critical failures are never silently ignored, and a hard floor specifically for high-severity actions.

{% katex(block=true) %}
\begin{aligned}
g_1: && \theta &\geq \theta_{\min} = 0.05 && \text{(minimum confidence)} \\
g_2: && \theta &\leq \theta_{\max} = 0.95 && \text{(never ignore critical)} \\
g_3: && \varsigma(a) > 0.8 &\Rightarrow \theta \geq 0.90 && \text{(high-severity floor)}
\end{aligned}
{% end %}

The table below applies {% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %}'s formula to six representative healing actions: as severity rises and reversibility falls, the Required Confidence column rises correspondingly, demanding stronger evidence before the system acts.

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

<span id="prop-29"></span>
**Proposition 29** (Optimal Confidence Threshold). *The optimal confidence threshold \\(\theta^\*(a)\\) for healing action \\(a\\) satisfies:*

*When a drone reboot costs ten times less than a missed failure, the system should act at 9% confidence — not the intuitive 90%.*

{% katex(block=true) %}
\theta^*(a) = \frac{C_{\text{FP}}(a)}{C_{\text{FP}}(a) + C_{\text{FN}}(a) + V_{\text{heal}}(a)}
{% end %}

*where {% katex() %}C_{\text{FP}}(a){% end %} is the cost of unnecessary healing, {% katex() %}C_{\text{FN}}(a){% end %} is the operational damage from the fault continuing (mission degradation, reduced capacity), and {% katex() %}V_{\text{heal}}(a){% end %} is the incremental operational value of successful recovery above the avoided fault loss — mission objective re-enabled, full capability restored beyond minimum viable system. These three components must be economically disjoint.*

In other words, set the confidence bar at the fraction of total expected cost attributable to false positives: if unnecessary healing is nine times cheaper than the combined cost of missing a real failure plus the value of recovery, act as soon as confidence exceeds 10%.

> **Non-overlap requirement**: \\(C_{\text{FN}}\\) and \\(V_{\text{heal}}\\) must measure *distinct* economic events. \\(C_{\text{FN}}\\) captures operational damage while the fault persists — sensor degraded, route suboptimal, mission efficiency reduced. \\(V_{\text{heal}}\\) captures the incremental gain from recovery that exceeds mere fault avoidance — mission objective re-enabled, full fleet capacity restored. **Double-counting trap**: if both are set to the same asset value (e.g., {% katex() %}C_{\text{FN}} = V_{\text{heal}} = L_{\text{asset}}{% end %}, "drone worth \$50K"), the denominator inflates to {% katex() %}C_{\text{FP}} + 2L_{\text{asset}}{% end %} and \\(\theta^\*\\) is spuriously halved — the system becomes trigger-happy, executing hard reboots on low-confidence noise because the math says "nothing to lose." When asset preservation is the only concern, set \\(V_{\text{heal}} = 0\\); the formula then collapses to the standard Bayesian threshold {% katex() %}\theta^* = C_{\text{FP}} / (C_{\text{FP}} + C_{\text{FN}}){% end %}. *RAVEN Drone 23*: \\(C_{\text{FN}}\\) = 15 % mission efficiency loss from degraded navigation (operational degradation while fault persists); \\(V_{\text{heal}}\\) = restored to full efficiency *and* able to cover the relay sector lost during the fault (incremental mission value, distinct from mere efficiency recovery). These are separate economic events — their sum correctly reflects the full incentive to act promptly.

> **Empirical status**: The cost values \\(C_{\text{FP}}\\), \\(C_{\text{FN}}\\), and \\(V_{\text{heal}}\\) must be measured or estimated per action type and deployment context; thresholds derived from incorrectly specified costs will be miscalibrated, and the threshold table (restart: 0.60, isolate node: 0.90) reflects {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}-specific cost assumptions that may not transfer to other scenarios.

**Corollary 84.1.** *When {% katex() %}V_{\text{heal}}{% end %} is absorbed into effective false-negative cost {% katex() %}C_{\text{FN}}^{\text{eff}} = C_{\text{FN}} + V_{\text{heal}}{% end %}, the threshold simplifies to:*

{% katex(block=true) %}
\theta^*(a) = \frac{C_{\text{FP}}(a)}{C_{\text{FP}}(a) + C_{\text{FN}}^{\text{eff}}(a)}
{% end %}

*Proof*: When \\(c \in [0,1]\\) is the posterior probability {% katex() %}P(\text{failure} \mid \text{observation}){% end %}, the expected costs of acting and waiting are:

{% katex(block=true) %}
\mathbb{E}[\text{Cost}(\text{act})] = (1-c) \cdot C_{\text{FP}}, \quad \mathbb{E}[\text{Cost}(\text{wait})] = c \cdot C_{\text{FN}}^{\text{eff}}
{% end %}

Acting is preferred when {% katex() %}\mathbb{E}[\text{Cost}(\text{act})] < \mathbb{E}[\text{Cost}(\text{wait})]{% end %}:

{% katex(block=true) %}
(1-c) \cdot C_{\text{FP}} < c \cdot C_{\text{FN}}^{\text{eff}} \implies c > \frac{C_{\text{FP}}}{C_{\text{FP}} + C_{\text{FN}}^{\text{eff}}} = \theta^*
{% end %}

The threshold structure implies: asymmetric costs ({% katex() %}C_{\text{FN}}^{\text{eff}} \gg C_{\text{FP}}{% end %}) yield lower thresholds, accepting more false positives to avoid missed failures.

### Game-Theoretic Extension: Adversarial Threshold Manipulation

{% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %}'s optimal threshold \\(\theta^\*(a)\\) is derived against a non-strategic failure process. The dynamic threshold adaptation mechanism — which modulates \\(\theta^\*\\) through {% katex() %}f_{\text{resource}}, f_{\text{cascade}}, f_{\text{mission}}, f_{\text{connectivity}}{% end %} — is itself manipulable if the adversary can influence the context variables.

**Attack pattern**: An adversary who can cause spurious cascade events inflates {% katex() %}f_{\text{cascade}}{% end %}, which raises \\(\theta^\*(t)\\), which then suppresses detection of the real attack. The threshold-raising event sequence is itself an anomaly signature.

**Maximin threshold**: The adversarially robust threshold {% katex() %}\theta^*_{\text{robust}}{% end %} chooses the threshold that keeps detection probability as high as possible even when the adversary selects the attack signal \\(a_A\\) from their action space {% katex() %}\mathcal{A}_A{% end %} that most suppresses detection.

{% katex(block=true) %}
\theta^*_{\text{robust}}(a) = \arg\max_{\theta} \min_{a_A \in \mathcal{A}_A} P(\text{detect} \mid \theta, a_A)
{% end %}

**Second-order defense**: Monitor the pattern of threshold-raising events. A cluster of false positives that raises \\(\theta^\*\\) immediately before a partition event is itself an anomaly warranting elevated alertness — the dynamic threshold adaptation should include an adversarial-signature monitor that temporarily freezes \\(\theta^\*\\) when manipulation signatures are detected.

**Practical implication**: For {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} and {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} operating in adversarial environments, bound the maximum rate at which \\(\theta^\*\\) can increase per unit time (a rate limiter on threshold escalation). Sudden large threshold increases — whether from genuine context changes or adversarial manipulation — should trigger a brief period of heightened sensitivity at the prior (lower) threshold before committing to the new one.

### Dynamic Threshold Adaptation

Static thresholds assume fixed cost ratios. In practice, the relative cost of acting versus waiting shifts with mission phase, resource availability, and connectivity — so the threshold must update continuously. The context-dependent optimization selects \\(\theta^\*(t)\\) at each timestep by minimizing expected total cost under current system state \\(\Sigma_t\\), where the state captures resource level, mission phase, connectivity, and the number of healing actions already in progress.

{% katex(block=true) %}
\theta^*(t) = \arg\min_{\theta \in [\theta_{\min}, \theta_{\max}]} \mathbb{E}[\text{Cost}(\theta, \Sigma_t)]
{% end %}

The expected cost at threshold \\(\theta\\) given current system state \\(\Sigma_t\\) is the sum of two terms: the effective false-positive cost {% katex() %}C_{\text{FP}}^{\text{eff}}(t){% end %} scaled by the false-positive rate {% katex() %}P_{\text{FP}}(\theta){% end %}, plus the effective false-negative cost {% katex() %}C_{\text{FN}}^{\text{eff}}(t){% end %} scaled by the miss rate {% katex() %}P_{\text{FN}}(\theta){% end %}.

{% katex(block=true) %}
\mathbb{E}[\text{Cost}(\theta, \Sigma_t)] = C_{\text{FP}}^{\text{eff}}(t) \cdot P_{\text{FP}}(\theta) + C_{\text{FN}}^{\text{eff}}(t) \cdot P_{\text{FN}}(\theta)
{% end %}

The effective costs are functions of system state {% katex() %}\Sigma_t = (R_t, \text{phase}_t, C_t, n_{\text{healing}}(t)){% end %}:

The effective false-positive cost {% katex() %}C_{\text{FP}}^{\text{eff}}{% end %} grows when resources are scarce or many healings are already in progress, while the effective false-negative cost {% katex() %}C_{\text{FN}}^{\text{eff}}{% end %} grows during critical mission phases and when connectivity is denied (because no external help is available to handle a missed failure).

{% katex(block=true) %}
C_{\text{FP}}^{\text{eff}}(t) = C_{\text{FP}}^{\text{base}} \cdot f_{\text{resource}}(R(t)) \cdot f_{\text{cascade}}(n_{\text{healing}}(t))
{% end %}

{% katex(block=true) %}
C_{\text{FN}}^{\text{eff}}(t) = C_{\text{FN}}^{\text{base}} \cdot f_{\text{mission}}(\text{phase}(t)) \cdot f_{\text{connectivity}}(C(t))
{% end %}

**Modulation functions**:

- {% katex() %}f_{\text{resource}}(R) = 1 + 2 \cdot (1 - R/R_{\max}){% end %}: FP cost triples when resources depleted
- {% katex() %}f_{\text{cascade}}(n) = 1 + 0.5n{% end %}: Each concurrent healing increases FP cost by 50%
- {% katex() %}f_{\text{mission}}(\text{phase}) \in [1, 5]{% end %}: Critical phases multiply FN cost up to \\(5\times\\)
- {% katex() %}f_{\text{connectivity}}(C) = 2 - C{% end %}: Full connectivity halves FN cost; denied doubles it

Applying {% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %}'s ratio formula to the effective costs gives the time-varying threshold — at each timestep, \\(\theta^\*(t)\\) is simply the fraction of total effective cost attributable to false positives.

{% katex(block=true) %}
\theta^*(t) = \frac{C_{\text{FP}}^{\text{eff}}(t)}{C_{\text{FP}}^{\text{eff}}(t) + C_{\text{FN}}^{\text{eff}}(t)}
{% end %}

During critical mission phases ({% katex() %}f_{\text{mission}} \to 5{% end %}) with good connectivity, the denominator grows large relative to the numerator, driving \\(\theta^\*(t)\\) well below 0.1—the system heals at very low confidence, accepting many false positives to avoid any missed failures.

**Threshold bounds**:

Unconstrained adaptation can lead to pathological behavior. The hard bounds below enforce a safety interval for \\(\theta^\*(t)\\): {% katex() %}\theta_{\min} = 0.05{% end %} ensures the system always requires at least some confidence, and {% katex() %}\theta_{\max} = 0.95{% end %} ensures it never completely ignores a detected problem.

{% katex(block=true) %}
\theta_{\min} \leq \theta^*(t) \leq \theta_{\max}
{% end %}

**Hysteresis for threshold changes**:

Rapidly fluctuating thresholds cause inconsistent behavior. The hysteresis rule below holds the current threshold fixed if the change demanded by \\(\theta^\*(t)\\) is smaller than the dead-band {% katex() %}\delta_\theta \approx 0.1{% end %}, preventing threshold jitter from triggering spurious mode changes.

{% katex(block=true) %}
\theta(t) = \begin{cases}
\theta^*(t) & \text{if } |\theta^*(t) - \theta(t-1)| > \delta_{\theta} \\
\theta(t-1) & \text{otherwise}
\end{cases}
{% end %}

where {% katex() %}\delta_{\theta} \approx 0.1{% end %} prevents threshold jitter.

**State Transition Model**: The complete threshold state at time \\(t+1\\) is the triple of the updated threshold value and the two effective costs that drive it at that timestep.

{% katex(block=true) %}
\Sigma_{t+1}^{\theta} = \left(\theta(t+1), C_{\text{FP}}^{\text{eff}}(t+1), C_{\text{FN}}^{\text{eff}}(t+1)\right)
{% end %}

The threshold itself steps toward the target \\(\theta^\*(t+1)\\) by step-size \\(\gamma_{\text{step}}\\) only when the gap {% katex() %}\Delta\theta = \theta^*(t+1) - \theta(t){% end %} exceeds the hysteresis band \\(\delta_\\theta\\), and is hard-clipped to the safety interval {% katex() %}[\theta_{\min}, \theta_{\max}]{% end %}.

{% katex(block=true) %}
\theta(t+1) = \text{clip}\left(\theta(t) + \gamma_{\text{step}} \cdot \mathbb{1}[|\Delta\theta| > \delta_\theta] \cdot \text{sign}(\Delta\theta), \theta_{\min}, \theta_{\max}\right)
{% end %}

where {% katex() %}\Delta\theta = \theta^*(t+1) - \theta(t){% end %} and {% katex() %}\gamma_{\text{step}} \leq |\Delta\theta|{% end %} is the threshold adaptation step-size.

<span id="def-45"></span>
### Staleness-Aware Healing Threshold

**Definition 45** (Staleness Decay Time Constant ({% katex() %}\tau_\text{stale}^\text{max}{% end %})). *Let {% katex() %}t_{\text{stale}} \geq 0{% end %} denote elapsed time since the last successful Knowledge Base synchronization. The staleness decay function is:*

> **Notation.** This constant is written {% katex() %}\tau_\text{stale}^\text{max}{% end %} throughout this article to distinguish it from the HLC trust-window latency bound \\(\tau_\text{max}\\) in [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md), which is an entirely different quantity (one-way message delivery time, measured in milliseconds, not hours).

{% katex(block=true) %}
\delta_\text{stale}(t_{\text{stale}}) = 1 - e^{-t_{\text{stale}}/\tau_\text{stale}^\text{max}}
{% end %}

*({% katex() %}\delta_\text{stale}(t_{\text{stale}}){% end %} = staleness decay function; \\(\delta_\text{sev}\\) = failure severity scalar in the utility function; \\(\delta_\text{inst}\\) = per-cycle instability probability in {% term(url="#prop-23", def="Robust Gain Scheduling under Stochastic Delay: the scheduled gain derived from the stability margin maintains stability with high probability under Weibull-distributed delays") %}Proposition 23{% end %}. Bare \\(\delta\\) is not used in this article to avoid ambiguity.)*

*where {% katex() %}\tau_\text{stale}^\text{max}{% end %} is the staleness threshold from {% term(url="@/blog/2026-01-22/index.md#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %}: {% katex() %}\tau_\text{stale}^\text{max} = (\Delta h / (z_{\alpha/2} \cdot \sigma))^2{% end %}, with \\(\Delta h\\) the acceptable health drift and \\(\sigma\\) measurement noise. At {% katex() %}t_{\text{stale}} = 0{% end %}: \\(\delta_\text{stale} = 0\\) (fully current). At {% katex() %}t_{\text{stale}} = \tau_\text{stale}^\text{max}{% end %}: {% katex() %}\delta_\text{stale} \approx 0.63{% end %}. As {% katex() %}t_{\text{stale}} \to \infty{% end %}: {% katex() %}\delta_\text{stale} \to 1{% end %} (fully stale).*

**Staleness-aware threshold**: Let {% katex() %}s(a) = 1 - \theta^*(a) \in [0,1]{% end %} be the severity of action \\(a\\), derived from {% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %}'s optimal threshold. High \\(s(a)\\) means missing the failure is expensive (low \\(\theta^\*\\), large {% katex() %}C_{\text{FN}}{% end %}). The staleness-augmented threshold floor raises as the Knowledge Base ages:

{% katex(block=true) %}
\theta_{\text{stale}}(a, t_{\text{stale}}) = \theta^*(a) + \delta_\text{stale}(t_{\text{stale}}) \cdot (1 - s(a))
{% end %}

*Critical failures (\\(s(a) \to 1\\)) are immune: {% katex() %}\theta_{\text{stale}} \approx \theta^*(a){% end %} regardless of {% katex() %}t_{\text{stale}}{% end %}. Low-severity actions (\\(s(a) \to 0\\)) are suppressed as \\(\delta_\text{stale}\\) grows; when {% katex() %}\theta_{\text{stale}} > 1{% end %} the threshold is above any achievable confidence score, effectively disabling that action class until re-sync.*

**Confidence horizon**: The time at which non-critical healing (\\(s(a) = 0\\)) is suppressed to the maximum threshold {% katex() %}\theta_{\max}{% end %}:

{% katex(block=true) %}
T_{\text{conf}} = \tau_\text{stale}^\text{max} \cdot \ln\!\left(\frac{1}{1 - (\theta_{\max} - \theta^*(a))}\right)
{% end %}

*Valid when {% katex() %}\theta^*(a) < \theta_{\max}{% end %}. Beyond {% katex() %}T_{\text{conf}}{% end %}, the system enters minimal-healing mode: only actions with {% katex() %}s(a) > 1 - (\theta_{\max} - \theta^*(a))/\delta_\text{stale}(t_{\text{stale}}){% end %} remain actionable.*

{% mermaid() %}
graph LR
    subgraph S0["t = 0"]
        A["Fresh KB, delta = 0"] --> B["theta_stale = theta_opt<br/>Full healing active"]
    end

    subgraph S1["t = tau_stale_max"]
        C["Stale KB, delta = 0.63"] --> D["theta_stale rises<br/>Low-severity suppressed"]
    end

    subgraph S2["t > T_conf"]
        E["Very stale, delta → 1"] --> F["theta_stale > theta_max<br/>Only critical failures"]
    end

    A -.->|time| C -.->|time| E

    style B fill:#c8e6c9,stroke:#388e3c
    style D fill:#fff9c4,stroke:#f9a825
    style F fill:#ffcdd2,stroke:#c62828
{% end %}

> **Read the diagram**: Three time-snapshots shown left to right. At \\(t = 0\\) (green): Knowledge Base is fresh, \\(\delta_\text{stale} = 0\\), staleness-adjusted threshold equals the optimal threshold — full healing active. At {% katex() %}t = \tau_\text{stale}^\text{max}{% end %} (yellow): Knowledge Base has aged to its calibrated limit; \\(\delta_\text{stale} = 0.63\\) and the threshold rises above \\(\theta^\*\\) for low-severity actions, progressively suppressing them. At {% katex() %}t > T_{\text{conf}}{% end %} (red): the threshold exceeds 1.0 for non-critical actions — they are effectively disabled. Critical failures (\\(s(a) \to 1\\)) remain actionable throughout all three states regardless of staleness.

*{% katex() %}\tau_\text{stale}^\text{max}{% end %} from {% term(url="@/blog/2026-01-22/index.md#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %} simultaneously calibrates the Brownian staleness model (maximum observation age before health estimates are unreliable) and the exponential time constant of healing suppression. A tightly-calibrated deployment with small \\(\Delta h\\) has a short {% katex() %}\tau_\text{stale}^\text{max}{% end %} and fast-acting suppression; a loosely-calibrated one tolerates longer Knowledge Base age before healing hesitance sets in.*

The staleness threshold is calibrated from the Brownian diffusion model ({% term(url="@/blog/2026-01-22/index.md#prop-14", def="Maximum Useful Staleness: bound on gossip record age beyond which stale data increases the false-positive rate faster than fresh gossip would decrease it") %}Proposition 14{% end %}):

{% katex(block=true) %}
\tau_\text{stale}^\text{max} = \left(\frac{\Delta h}{z_{\alpha/2} \cdot \sigma}\right)^2
{% end %}

where \\(\\Delta h\\) is the decision-relevant drift threshold, {% katex() %}z_{\alpha/2}{% end %} is the normal quantile at confidence \\(1-\\alpha\\), and \\(\\sigma\\) is the observation noise standard deviation. Both {% katex() %}\tau_\text{stale}^\text{max}{% end %} here and the staleness-aware healing threshold {% katex() %}\theta_{\text{stale}}{% end %} are governed by this calibrated constant.

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

**Cooldown periods**: After healing action A, impose minimum time before A can trigger again. This prevents oscillation and allows time to observe outcomes. The cooldown constraint below ensures action \\(A\\) cannot fire again until at least {% katex() %}\tau_{\text{cooldown}}(A){% end %} seconds have elapsed since its last execution.

{% katex(block=true) %}
t_{\text{next}(A)} \geq t_{\text{last}(A)} + \tau_{\text{cooldown}}(A)
{% end %}

**Dependency tracking**: Before healing A, check if healing A will affect critical components B. If so, either heal B first, or delay healing A until B is stable.

### Control-Theoretic Stability: Damping, Anti-Windup, and Refractory Periods

{% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}'s stability condition {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %} governs the proportional behavior of the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} controller. But two failure modes remain outside its scope: **high-frequency chatter** (the loop triggers healing faster than the system can respond, oscillating between degraded and over-corrected states) and **integral windup** (healing demand accumulates while resources are blocked and discharges as a burst of simultaneous actions when resources free). In classical PID terms, the proportional term is bounded by {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}, but the derivative and integral behaviors need their own treatment.

<span id="def-46"></span>
**Definition 46** (Healing Dead-Band and Refractory State). *The healing actuator for action \\(a\\) is governed by three parameters and occupies one of three states:*

- *{% katex() %}\varepsilon_{\text{db}}{% end %} (dead-band threshold): healing is suppressed unless the anomaly score \\(z_t^K\\) exceeds {% katex() %}\varepsilon_{\text{db}}{% end %} for {% katex() %}\tau_{\text{confirm}}{% end %} consecutive samples — the "Wait-and-See" confirmation window. Single-sample noise spikes are ignored.*
- *{% katex() %}\tau_{\text{ref}}(a){% end %} (refractory period): after executing action \\(a\\), the healing gate for \\(a\\) closes for {% katex() %}\tau_{\text{ref}}{% end %} seconds. This is the mandatory observation window during which the system watches the action take effect before issuing another.*
- *{% katex() %}Q_{\text{aw}}{% end %} (anti-windup cap): accumulated healing demand \\(Q_d(t)\\) is capped at {% katex() %}Q_{\text{aw}}{% end %}. Demand arriving when {% katex() %}Q_d(t) = Q_{\text{aw}}{% end %} is discarded, preventing burst discharge after a resource-blocked period.*
- *CBF suspension re-entry: when the CBF gain scheduler ({% term(url="#def-40", def="CBF Gain Scheduler: mode-and-state-indexed safe gain derived from the discrete Control Barrier Function stability margin") %}Definition 40{% end %}) sets \\(K_{\mathrm{gs}} = 0\\) because \\(\rho_q < 0\\), the healing gate enters a hard-suspended state. The gate reopens when {% katex() %}\rho_q \geq \rho_{\min} = 0.2{% end %} is observed for at least one full refractory period \\(\tau_{\mathrm{ref}}\\), or unconditionally after \\(d_{\max} \leq 5\\) ticks of zero-gain operation, provided the CUSUM sentinel confirms nominal plant dynamics (\\(g^+(t) < h^+\\)) — when CUSUM is indeterminate or unavailable, the {% katex() %}\rho_q \geq \rho_{\min}{% end %} criterion from {% term(url="#prop-31", def="CBF-Derived Refractory Bound: the refractory period must allow the stability margin to recover above the minimum threshold before the next healing action") %}Proposition 31{% end %} takes precedence. The \\(d_{\max}\\) bound follows from the {% term(url="#prop-25", def="Nonlinear Safety Invariant: if the system starts in a safe state and the guardrail runs every tick, it remains in the stability region for all time") %}Proposition 25{% end %} proof: with \\(K_{\mathrm{gs}} = 0\\) the open-loop system is guaranteed to return to {% katex() %}\mathcal{R}_q{% end %} within \\(d_{\max}\\) ticks under nominal dynamics for the class of plants where \\(A_q\\) is nilpotent; for general Schur-stable plants the dCBF contraction condition governs re-entry instead.*

> **Analogy:** A doctor's dosing schedule — you wait the full interval between doses even if the fever returns, because acting again too soon makes things worse, not better. The dead-band is the minimum symptom level that justifies a dose; the refractory period is the mandatory wait before another dose is allowed.

**Logic:** The dead-band threshold \\(\varepsilon_{\text{db}}\\) blocks action on noise; the refractory period \\(\tau_{\text{ref}} \geq 2\tau_{\text{fb}}\\) (from {% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing oscillation is suppressed when the refractory period is at least twice the feedback delay, preventing burst re-fire before the previous action's effect is observed") %}Proposition 30{% end %}) prevents oscillation by ensuring the system observes the effect of one action before issuing another.

{% mermaid() %}
stateDiagram-v2
    direction LR
    [*] --> READY
    READY --> REFRACTORY: action executed
    REFRACTORY --> READY: tau_ref elapsed
    REFRACTORY --> ANTI_WINDUP: Q_d(t) >= Q_aw
    ANTI_WINDUP --> REFRACTORY: Q_d(t) < Q_aw / 2
    ANTI_WINDUP --> READY: tau_ref elapsed, D = 0
    note right of READY
        suppressed while z_t < epsilon_db
        for tau_confirm consecutive samples
    end note
{% end %}

> **Read the diagram**: Three states. READY: healing gate is open — but actuation is still suppressed while {% katex() %}z_t^K < \varepsilon_{\text{db}}{% end %} for fewer than {% katex() %}\tau_{\text{confirm}}{% end %} consecutive samples (the confirmation window). REFRACTORY: gate closes after execution; reopens after {% katex() %}\tau_{\text{ref}}{% end %} elapses. ANTI-WINDUP: entered when accumulated demand \\(Q_d(t)\\) saturates the cap {% katex() %}Q_{\text{aw}}{% end %}; drains back to REFRACTORY only when \\(Q_d\\) falls below {% katex() %}Q_{\text{aw}}/2{% end %} — a hysteresis that prevents burst discharge from the accumulated queue.

**Design parameters by severity tier**:

| Severity tier | {% katex() %}\varepsilon_{\text{db}}{% end %} | {% katex() %}\tau_{\text{confirm}}{% end %} | {% katex() %}\tau_{\text{ref}}{% end %} | {% katex() %}Q_{\text{aw}}{% end %} |
| :--- | :--- | :--- | :--- | :--- |
| Low ({% katex() %}\varsigma \leq 0.3{% end %}) | \\(1\sigma\\) | 3 samples | {% katex() %}2\tau_{\text{fb}}{% end %} | 10 |
| Medium ({% katex() %}0.3 < \varsigma \leq 0.7{% end %}) | \\(2\sigma\\) | 5 samples | {% katex() %}4\tau_{\text{fb}}{% end %} | 5 |
| High (\\(\varsigma > 0.7\\)) | \\(3\sigma\\) | 10 samples | {% katex() %}8\tau_{\text{fb}}{% end %} | 2 |

where {% katex() %}\tau_{\text{fb}}{% end %} is the current feedback delay from {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}.

<span id="prop-30"></span>
**Proposition 30** (Anti-Windup Oscillation Bound). *For the proportional healing controller with gain \\(K_{\text{ctrl}}\\) and feedback delay {% katex() %}\tau_{\text{fb}}{% end %} satisfying {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau_{\text{fb}}/T_{\text{tick}}){% end %} (Proposition 22), healing oscillation is suppressed if the refractory period satisfies:*

*A {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} jamming event triggering 47 concurrent healing cycles will only chatter if each drone re-fires before observing its neighbors' outcomes — the refractory floor prevents exactly this.*

{% katex(block=true) %}
\tau_{\text{ref}} \geq 2\,\tau_{\text{fb}}
{% end %}

- **Use**: Sets the minimum dead-band window after each healing action from the round-trip feedback delay {% katex() %}\tau_{\text{fb}}{% end %}; configure this timer immediately after every Execute phase to prevent healing oscillation from a second action firing before the first effect is observed.
- **Parameters**: {% katex() %}\tau_{\text{fb}}{% end %} = gossip or actuator feedback delay; RAVEN {% katex() %}\tau_{\text{fb}} = 5\text{ s} \to \tau_{\text{ref,min}} = 10\text{ s}{% end %}.
- **Field note**: Use {% katex() %}3\tau_{\text{fb}}{% end %} if the healing action has side effects like triggering a gossip storm — the \\(2\\times\\) is the absolute minimum, not a safe operating value.

> **Empirical status**: The \\(2\tau_{\text{fb}}\\) floor is derived for a first-order linear delay chain; healing actions with nonlinear side effects (gossip storms, cascaded restarts) may require {% katex() %}3\text{–}4 \times \tau_{\text{fb}}{% end %} in practice, and the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} value of {% katex() %}\tau_{\text{ref,min}} = 10\,\text{s}{% end %} should be validated by fault-injection testing at maximum concurrent failures.

*Proof*: In the discrete-time system with delay {% katex() %}d = \lceil\tau_{\text{fb}}/T_{\text{tick}}\rceil{% end %} samples, the minimum period of any sustained oscillation is {% katex() %}2(d+1) \cdot T_{\text{tick}} \geq 2\tau_{\text{fb}}{% end %}: two full delay-lengths are required for one complete feedback cycle (action propagates forward through \\(d\\) steps, effect propagates back through \\(d\\) steps). The healing controller with refractory period {% katex() %}\tau_{\text{ref}}{% end %} cannot fire at intervals shorter than {% katex() %}\tau_{\text{ref}}{% end %}. Setting {% katex() %}\tau_{\text{ref}} \geq 2\tau_{\text{fb}}{% end %} prevents the controller from completing more than one correction per minimum oscillation period, suppressing sustained oscillation. \\(\square\\)*

**Anti-windup accumulator update**:

{% katex(block=true) %}
Q_d(t+1) = \min\!\left(Q_d(t) + \mathbb{1}\!\left[z_t^K > \varepsilon_{\text{db}}\right],\; Q_{\text{aw}}\right)
{% end %}

> **Physical translation**: A leaky bucket counting how many "act now" signals have arrived above the dead-band threshold. The {% katex() %}\min(\cdot, Q_{\text{aw}}){% end %} cap means demand arriving when the queue is full is silently discarded. When the refractory timer finally opens, at most {% katex() %}Q_{\text{aw}}{% end %} actions discharge — not the unbounded backlog that would otherwise accumulate during a long-duration fault or resource-blocked period.

- **Use**: Counts pending healing requests above the dead-band threshold, capped at {% katex() %}Q_{\text{aw}}{% end %}; dispatch only when {% katex() %}Q_d > 0{% end %} and the refractory timer has expired to prevent burst discharge from releasing a suppressed queue of actions all at once.
- **Parameters**: {% katex() %}Q_{\text{aw}}{% end %} = anti-windup cap (5–102 actions); keep {% katex() %}Q_{\text{aw}} \cdot T_{\text{exec}} < T_{\text{heal}}{% end %} budget.
- **Field note**: {% katex() %}Q_d > Q_{\text{aw}}/2{% end %} sustained for 3+ ticks is a reliable persistent-fault signal — escalate to a higher severity level at that point.

When \\(Q_d(t)\\) reaches {% katex() %}Q_{\text{aw}}{% end %}, the system enters ANTI_WINDUP state and discards new demand until \\(Q_d(t)\\) drains below {% katex() %}Q_{\text{aw}}/2{% end %}. This prevents "burst discharge" — where minutes of suppressed healing demand fires simultaneously the moment connectivity or resources recover.

**Relationship to existing results**: The dead-band threshold {% katex() %}\varepsilon_{\text{db}}{% end %} formalizes the minimum-confidence floor {% katex() %}\theta_{\min} = 0.05{% end %} from {% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %} (constraint \\(g_1\\)): both prevent trigger-happy behavior at near-zero evidence.

The refractory period {% katex() %}\tau_{\text{ref}}{% end %} formalizes the informal cooldown constraint {% katex() %}t_{\text{next}(A)} \geq t_{\text{last}(A)} + \tau_{\text{cooldown}}(A){% end %} from the section above. {% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing dead-band with adaptive refractory backoff prevents integrator windup; oscillation amplitude decays with each refractory cycle") %}Proposition 30{% end %} gives the first *derived* lower bound on that cooldown: rather than choosing {% katex() %}\tau_{\text{cooldown}}{% end %} heuristically, set {% katex() %}\tau_{\text{ref}} \geq 2\tau_{\text{fb}}{% end %} and oscillation-freedom follows from {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}'s stability condition.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration**: Feedback delay {% katex() %}\tau_{\text{fb}} \approx 5\,\text{s}{% end %} ({% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} convergence, 47 nodes), regime controller gain \\(K_{\text{ctrl}} = 0.3\\). Minimum refractory period: {% katex() %}\tau_{\text{ref}} \geq 2\tau_{\text{fb}} = 10\,\text{s}{% end %}. Dead-band {% katex() %}\varepsilon_{\text{db}} = 2\sigma{% end %} for medium-severity battery actions. Without this bound, a jamming event that degrades all 47 drones simultaneously triggers 47 concurrent healing cycles — each drone restarting its communication stack causes momentary radio silence, which registers as a new anomaly to neighbors, triggering another round. This is exactly the healing loop failure mode described above, now quantified.

<span id="prop-31"></span>

**Proposition 31** (CBF-Derived Refractory Bound). *The Proposition 30 floor {% katex() %}\tau_{\mathrm{ref}} \geq 2\tau_{\mathrm{fb}}{% end %} is necessary but not sufficient under mode-switching dynamics. Under the Stability Region framework ({% term(url="@/blog/2026-01-15/index.md#def-4", def="Stability Region: the set of system states from which the autonomic control loop is guaranteed to converge to safe operation, bounded by a Lyapunov level set") %}Definition 4{% end %}), the refractory period must also allow {% katex() %}\rho_q{% end %} to recover above {% katex() %}\rho_{\min} = 0.2{% end %} before the next action. The CBF-derived refractory bound for mode \\(q\\) is:*

*In mode-switching systems, the simple feedback-delay floor is not enough — the stability margin must also recover before a second action is allowed.*

{% katex(block=true) %}
\tau_{\mathrm{ref}}^{\mathrm{CBF}}(q) = \left\lceil \frac{\ln\!\bigl(\rho_{\min} / \max(\rho_q(t_{\mathrm{action}}),\, \rho_\varepsilon)\bigr)}{-\ln(1 - \gamma_{\text{cbf}})} \right\rceil \cdot T_{\mathrm{tick}}(q)
{% end %}

*where {% katex() %}\rho_{\min} = 0.2{% end %}, {% katex() %}\rho_\varepsilon = 10^{-3}{% end %} is a regularization floor, and {% katex() %}\rho_q(t_{\mathrm{action}}){% end %} is the stability margin immediately after the first healing action fires. The effective refractory period is:*

{% katex(block=true) %}
\tau_{\mathrm{ref}}(q) = \min\!\bigl(\tau_{\mathrm{ref}}^{\max},\; \max\!\bigl(\tau_{\mathrm{ref}}^{\mathrm{CBF}}(q),\; 2\,\tau_{\mathrm{fb}}\bigr)\bigr)
{% end %}

> **Singularity prevention (\\(\rho_\varepsilon\\) floor).** Without the floor, if {% katex() %}\rho_q(t_{\mathrm{action}}) \to 0{% end %} (node approaching complete unreliability), the argument of \\(\ln\\) diverges and {% katex() %}\tau_{\mathrm{ref}}^{\mathrm{CBF}} \to \infty{% end %}. The \\(\rho_\varepsilon = 10^{-3}\\) floor prevents this: it caps the computed refractory period at {% katex() %}\lceil\ln(\rho_{\min}/\rho_\varepsilon)/(-\ln(1-\gamma_{\text{cbf}}))\rceil \cdot T_{\text{tick}}{% end %}, which for RAVEN (\\(\gamma_{\text{cbf}} = 0.05\\), {% katex() %}T_{\text{tick}} = 5\,\mathrm{s}{% end %}) evaluates to {% katex() %}\lceil\ln(200)/0.051\rceil \cdot 5 \approx 515\,\mathrm{s}{% end %}. The companion {% katex() %}\tau_{\mathrm{ref}}^{\max}{% end %} upper clamp (set operationally, e.g., 600 s for RAVEN) provides a hard ceiling so that a single catastrophically degraded node does not permanently block healing attempts on a system that is in fact recoverable. A node clamped at {% katex() %}\tau_{\mathrm{ref}}^{\max}{% end %} is flagged for manual review after one full cycle.

- **Use**: Replaces the fixed {% katex() %}2\tau_{\mathrm{fb}}{% end %} floor with a state-dependent lower bound that ensures the stability margin recovers above {% katex() %}\rho_{\min}{% end %} before the next healing action; larger healing actions that consume more stability margin automatically produce longer refractory periods.
- **Parameters**: {% katex() %}\rho_{\min} = 0.2{% end %} (minimum safe margin before re-action); {% katex() %}\rho_\varepsilon = 10^{-3}{% end %} (singularity floor); \\(\gamma_{\text{cbf}}\\) from {% term(url="#def-39", def="Discrete Control Barrier Function: safety function enforcing mode-invariant stability across capability level transitions in the switched system") %}Definition 39{% end %} (dCBF); for RAVEN L3 with \\(\gamma_{\text{cbf}} = 0.05\\) and a large action dropping \\(\rho\\) to 0.1: {% katex() %}\tau_{\mathrm{ref}}^{\mathrm{CBF}} = \lceil\ln(0.2/0.1)/(-\ln(0.95))\rceil \cdot 5 \approx 70\,\text{s}{% end %} vs. the {% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing dead-band with adaptive refractory backoff prevents integrator windup; refractory floor is 2τ_fb") %}Proposition 30{% end %} floor of 10 s.
- **Field note**: Log {% katex() %}\rho_q(t_{\mathrm{action}}){% end %} alongside every healing event — the gap between {% katex() %}\tau_{\mathrm{ref}}^{\mathrm{CBF}}{% end %} and {% katex() %}2\tau_{\mathrm{fb}}{% end %} quantifies how much stability margin the action consumed and is the primary diagnostic for oversized healing gains.

**Model-validity scope of {% katex() %}\tau_{\mathrm{ref}}^{\mathrm{CBF}}{% end %}**: The formula derives from the nominal contraction rate \\((1-\gamma_{\text{cbf}})\\) per tick — the rate at which \\(\rho_q\\) recovers under the pre-flight \\(A_q\\) model. If the true plant dynamics have drifted from \\(A_q\\), this rate is wrong and the formula produces either a dangerously short or a uselessly long refractory period.

**Hyper-aggressive failure** (under-refractory): physical damage slows \\(\rho_q\\) recovery below the nominal rate. Example — RAVEN drone motor at 60% thrust efficiency shifts the dominant eigenvalue from \\(|\lambda| = 0.95\\) to \\(|\lambda| = 0.98\\); the ticks required for \\(\rho: 0.10 \to 0.20\\) extend from {% katex() %}\lceil \ln 2 / (-\ln(1-\gamma_{\text{cbf}})) \rceil = \lceil \ln 2 / 0.051 \rceil = 14{% end %} ticks (70 s) to {% katex() %}\lceil \ln 2 / 0.020 \rceil = 35{% end %} ticks (175 s). The formula fires the next healing action at tick 14 when true \\(\rho \approx 0.15\\) — still below \\(\rho_{\min} = 0.20\\). A second actuation on an under-margined plant can collapse the voltage rail.

**Hyper-conservative failure** (over-refractory): RF jamming injects noise into the state estimate \\(x\\), depressing the measured {% katex() %}\rho_q(t_{\mathrm{action}}){% end %} below its true value. The formula computes {% katex() %}\tau_{\mathrm{ref}}^{\mathrm{CBF}}{% end %} from an artificially low starting point, producing a refractory period far longer than the true dynamics require. The system remains locked in L0 long after recovery is physically complete.

> **Warning**: Model drift invalidates the refractory formula in opposite ways — physical damage makes it fire too early, sensor noise makes it wait too long. The CUSUM sentinel below detects both failure modes before they accumulate.

### CUSUM Model-Drift Sentinel

Vibration noise is zero-mean and short-lived — random errors cancel over a few ticks. Genuine actuator degradation is persistent: the nominal model A_q consistently over-predicts performance. The sentinel accumulates prediction errors over time; noise cancels itself, drift does not.

The one-step prediction error is {% katex() %}\Delta\rho_{\text{pred}}(t) = \rho_q^{\text{nom}}(t{+}1) - \rho_q^{\text{meas}}(t{+}1){% end %}. Under a healthy plant this is zero-mean Gaussian with rolling standard deviation {% katex() %}\hat{\sigma}_{\text{noise}}{% end %}; under motor degradation it becomes persistently positive. \\(g^+\\) counts evidence the model is too optimistic; \\(g^-\\) counts evidence it is too pessimistic. The slack {% katex() %}k = 1.5\hat{\sigma}_{\text{noise}}{% end %} drains either accumulator after clean ticks, so a single noise spike never triggers an alarm.

**Why {% katex() %}k = 1.5\hat{\sigma}_{\text{noise}}{% end %}?** Standard CUSUM reference-value formula \\(k = \delta_\text{shift}/2\\) for detecting a 3\\(\sigma\\) sustained shift (\\(\delta_\text{shift}\\) = expected shift magnitude in standard CUSUM notation). Random noise alone never pushes \\(g^+\\) above \\(h\\) before draining; a 3\\(\sigma\\) sustained drift accumulates to \\(h\\) in five ticks. **Why a 20-tick rolling window?** Drone blade-pass vibration produces correlated noise bursts at the MAPE-K tick rate; 20 ticks (100 s at 5 s/tick) spans roughly five vibration cycles, ensuring {% katex() %}\hat{\sigma}_{\text{noise}}{% end %} reflects the true noise envelope.

| Scenario | \\(\Delta\rho_{\text{pred}}\\)/tick | \\(g^+\\) outcome | Verdict |
|----------|--------------------------------------|-------------------|---------|
| Single vibration spike (1 tick, 0.08) | 0.06 above slack | Peaks at 0.06; drains in 3 ticks | No alarm |
| Correlated burst (3 ticks, 0.06 each) | \\(\hat{\sigma}\\) rises, \\(k\\) and \\(h\\) auto-adjust | Threshold rises faster than accumulation | Suppressed |
| Sustained motor degradation (0.05/tick) | Grows 0.03/tick | Alarm at tick 4 (20 s) | Correct detection |
| Sub-threshold creep (0.03/tick) | Grows 0.01/tick | Alarm at tick 10 (50 s) | Caught — 3-tick test would never fire |

A fixed 3-consecutive-tick threshold is fragile under correlated noise: in high-vibration environments (RAVEN drones), state estimate errors are correlated at the vibration resonance frequency, making three consecutive exceedances far more likely than \\(p^3\\) implies. The replacement is a Page-CUSUM statistic {{ cite(ref="12", title="Page (1954) — Continuous Inspection Schemes (CUSUM)") }}— the same structure as the Adversarial Non-Stationarity Detector ({% term(url="@/blog/2026-02-12/index.md#def-84", def="Adversarial Non-Stationarity Detector: change detector triggering a bandit weight reset when an environment distribution shift is detected") %}Definition 84{% end %}):

{% katex(block=true) %}
g^+(t) = \max\!\bigl(0,\; g^+(t-1) + \Delta\rho_{\mathrm{pred}}(t) - k\bigr), \qquad g^-(t) = \max\!\bigl(0,\; g^-(t-1) - \Delta\rho_{\mathrm{pred}}(t) - k\bigr)
{% end %}

where {% katex() %}\Delta\rho_{\mathrm{pred}}(t) = \rho_q^{\mathrm{nom}}(t+1) - \rho_q^{\mathrm{meas}}(t+1){% end %} is the one-step prediction error. The slack parameter {% katex() %}k = 1.5\hat{\sigma}_{\mathrm{noise}}{% end %} is the rolling 20-tick standard deviation of {% katex() %}\Delta\rho_{\mathrm{pred}}{% end %} under nominal conditions. Alarm thresholds \\(h^+ = h^- = 5k\\) give \\(\mathrm{ARL}_0 \approx 500\\) ticks (~one false alarm per 42 minutes at 5 s/tick). The four scenario outcomes are summarised in the table above.

**RAVEN calibration**: {% katex() %}\hat{\sigma}_{\mathrm{noise}} \approx 0.013{% end %}, so \\(k \approx 0.020\\) and \\(h^+ = h^- \approx 0.10\\). The relative form \\(h = 5k\\) generalises to any platform; 0.10 is its RAVEN instantiation. Sensitivity: \\(h = 7k\\) raises \\(\mathrm{ARL}_0\\) to ~1200 (<1.2 false alarms per 2-hour mission) if false-alarm cost dominates; \\(h = 3k\\) lowers it to \~150 (\~9.6 false alarms) if detection speed is the priority. Calibrate from the {% katex() %}C_{\mathrm{FN}}/C_{\mathrm{FP}}{% end %} ratio (see {% term(url="@/blog/2026-01-22/index.md#prop-9", def="Optimal Anomaly Threshold: minimizes total misclassification cost by balancing false-positive and false-negative penalties") %}Proposition 9{% end %}).

**Gossip suspension and frozen baseline**: When gossip is suspended (Observation Regime O4/O5), the {% katex() %}\hat{\sigma}_{\text{noise}}{% end %} rolling window freezes at its last valid value. The CUSUM thresholds {% katex() %}k = 1.5\hat{\sigma}_{\text{noise}}{% end %} and \\(h = 5k\\) are held constant during gossip suspension. If gossip remains suspended for more than {% katex() %}T_{\text{freeze}} = 5 \times T_{\text{window}}{% end %} (five rolling-window lengths), the CUSUM sentinel reverts to a fixed conservative baseline {% katex() %}\hat{\sigma}_{\text{noise}} = \hat{\sigma}_{\text{nominal}}{% end %} until gossip resumes.

**Response**: When \\(g^+(t) > h^+\\) (hyper-aggressive), extend the refractory budget by one additional {% katex() %}\tau_{\mathrm{ref}}^{\mathrm{CBF}}{% end %} period, reset \\(g^+\\), and re-evaluate; if \\(g^+\\) exceeds \\(h^+\\) again before the extension expires, hold L0 and flag for human review.

When \\(g^-(t) > h^-\\) (hyper-conservative), release the refractory window early once {% katex() %}\rho_q^{\mathrm{meas}}(t) \geq \rho_{\min}{% end %}; reset \\(g^-\\) on release. Note: the \\(\eta = 0.85\\) gain margin in {% term(url="#def-40", def="CBF Gain Scheduler: maps the stability margin to a derated gain value at or below the maximum, maintaining the safety condition at each mode boundary") %}Definition 40{% end %} guards against \\(K\\) mismatch, not \\(A_q\\) pole migration — the two corrections are orthogonal.

**Required relationship — confirmation window vs. hardware response time**: The confirmation window {% katex() %}\tau_{\text{confirm}}{% end %} must satisfy {% katex() %}\tau_{\text{confirm}} \geq \tau_{\text{hw\_response}}{% end %}, where {% katex() %}\tau_{\text{hw\_response}}{% end %} is the mechanical or electrical settling time of the actuated component. If {% katex() %}\tau_{\text{confirm}} < \tau_{\text{hw\_response}}{% end %}, the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop can issue a second actuation command while the first is still in progress, resulting in compounded commands on an actuator in an undefined intermediate state. Concrete example: a {% term(url="@/blog/2026-01-15/index.md#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %} protective relay has a mechanical response time of 500 ms. If {% katex() %}\tau_{\text{confirm}} = 300\,\text{ms}{% end %} (3 samples at 10 Hz), the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop confirms "action taken" before the relay has physically moved; a second fault event can send a second trip command to a relay mid-travel. Minimum safe value: {% katex() %}\tau_{\text{confirm}} \geq \max(\tau_{\text{hw\_response}}, \text{measurement period} \times n_{\text{confirm}}){% end %}. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} motor controllers (electrical settling time {% katex() %}\approx 50\,\text{ms}{% end %}), {% katex() %}\tau_{\text{confirm}} = 3\,\text{samples} \times 1\,\text{s/sample} = 3\,\text{s}{% end %} comfortably satisfies the constraint.

**{% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} anti-windup calibration**: During a 10-minute storage-layer hiccup, health checks degrade for dozens of pods simultaneously. Without the anti-windup cap, the demand accumulator fills to dozens of queued healing actions and discharges as simultaneous pod restarts the moment the health layer recovers — a self-inflicted availability incident. With {% katex() %}Q_{\text{aw}} = 5{% end %}, the burst is bounded to 5 concurrent actions regardless of backlog depth.

Three further mechanisms harden the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop against flapping failure modes that the dead-band and anti-windup alone cannot suppress: threshold chattering at a single trip-point, progressive failure escalation under repeated ineffective actions, false actuation on self-resolving transient peaks, and unbounded hardware retry cycles.

<span id="def-47"></span>

**Definition 47** (Schmitt Trigger Hysteresis). The dead-band threshold {% katex() %}\varepsilon_{\text{db}}{% end %} of Definition 46 is a single trip-point: the anomaly score \\(z_t^K\\) can cross it in either direction within the same measurement tick. The **Schmitt trigger** replaces this with two thresholds \\(\theta_H > \theta_L\\), where {% katex() %}\varepsilon_{\text{db}} \equiv \theta_H{% end %} (trigger) and \\(\theta_L\\) (release) is new:

- **NOMINAL \\(\to\\) TRIGGERED**: {% katex() %}z_t^K \geq \theta_H{% end %} for {% katex() %}\tau_{\text{confirm}}{% end %} consecutive samples.
- **TRIGGERED \\(\to\\) NOMINAL**: {% katex() %}z_t^K \leq \theta_L{% end %}.
- **Interior band** \\(\theta_L < z_t^K < \theta_H\\): current state is held — no transition in either direction.

The **flapping-free condition** guarantees that no spurious oscillation can traverse the full band in one confirmation window:

{% katex(block=true) %}
\Delta\theta = \theta_H - \theta_L \;\geq\; \left|\frac{dz}{dt}\right|_{\!\max} \cdot \tau_{\text{confirm}} \cdot T_{\text{tick}}
{% end %}

- **Use**: Computes the minimum hysteresis band guaranteeing no spurious state transition within one confirmation window; apply when setting any threshold-crossing alarm where signal noise amplitude approaches half the band width to prevent alert chatter.
- **Parameters**: {% katex() %}\Delta\theta = \theta_H - \theta_L{% end %}; set {% katex() %}\geq |\dot{z}|_{\max} \cdot \tau_{\text{confirm}} \cdot T_{\text{tick}}{% end %}.
- **Field note**: More than 5 alarm/clear cycles per hour in testing means the band is too narrow — double it and re-measure before deployment.

A signal too rapid to traverse \\(\Delta\theta\\) within {% katex() %}\tau_{\text{confirm}} \cdot T_{\text{tick}}{% end %} seconds is sensor noise — not a genuine anomaly. Relationship to {% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %}: {% katex() %}\theta_L < \theta^*(a) \leq \theta_H{% end %}; the optimal decision threshold sits inside the hysteresis band, so the actuator triggers only when confidence significantly exceeds \\(\theta^\*(a)\\) and releases only when confidence genuinely recovers below it. \\(\square\\)

> **Physical translation**: The Schmitt trigger prevents oscillation-prevention by making state transitions asymmetric. Triggering requires the signal to exceed the high threshold \\(\theta_H\\); releasing requires it to fall below the lower threshold \\(\theta_L\\). A signal bouncing in the band \\((\theta_L, \theta_H)\\) — sensor noise riding the edge of an anomaly threshold — produces zero state transitions. The band width {% katex() %}\Delta\theta \geq |\dot{z}|_{\max} \cdot \tau_{\text{confirm}} \cdot T_{\text{tick}}{% end %} is sized so that only signals evolving faster than noise can traverse it within the confirmation window.

| Severity tier | \\(\theta_H\\) (trigger) | \\(\theta_L\\) (release) | \\(\Delta\theta\\) |
| :--- | :--- | :--- | :--- |
| Low (\\(\varsigma \leq 0.3\\)) | \\(1\sigma\\) | \\(0.3\sigma\\) | \\(0.7\sigma\\) |
| Medium (\\(0.3 < \varsigma \leq 0.7\\)) | \\(2\sigma\\) | \\(0.7\sigma\\) | \\(1.3\sigma\\) |
| High (\\(\varsigma > 0.7\\)) | \\(3\sigma\\) | \\(1.0\sigma\\) | \\(2.0\sigma\\) |

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration**: Battery-voltage anomaly score oscillates between \\(1.6\sigma\\) and \\(2.4\sigma\\) under GNSS multipath jitter ({% katex() %}T_{\text{tick}} = 1{% end %} s, {% katex() %}\tau_{\text{confirm}} = 5{% end %} s). Single-threshold {% katex() %}\varepsilon_{\text{db}} = 2\sigma{% end %} produces 4 trips per minute as the score crosses the threshold on every oscillation cycle. Schmitt trigger with \\(\theta_H = 2\sigma\\), \\(\theta_L = 0.7\sigma\\) produces zero trips: the score never drops below \\(0.7\sigma\\) during the jitter episode, so TRIGGERED state holds correctly until the jitter subsides and voltage genuinely recovers.

<span id="def-48"></span>

**Definition 48** (Adaptive Refractory Backoff). The fixed refractory period {% katex() %}\tau_{\text{ref}}{% end %} of Definition 46 cannot distinguish an action that is succeeding (condition clears after refractory) from one that is failing (condition persists at every check). Under repeated failure, the same fixed window re-exposes the system to an unresolved fault at a constant rate. Adaptive backoff doubles the refractory window after each consecutive recovery failure:

{% katex(block=true) %}
\tau_{\text{ref}}(n) = \min\!\bigl(\tau_{\text{ref}}(0) \cdot \beta^{\,n},\; \tau_{\text{ref}}^{\max}\bigr), \quad \beta = 2
{% end %}

- **Use**: Doubles the refractory window after each consecutive recovery failure up to a ceiling; apply after any healing action that re-triggers within its own window to prevent rapid healing storms that exhaust the action budget within minutes on a persistent fault.
- **Parameters**: {% katex() %}\tau_{\text{ref}}(0) = 2\tau_{\text{fb}}{% end %} ({% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing dead-band with adaptive refractory backoff prevents integrator windup; oscillation amplitude decays with each refractory cycle") %}Proposition 30{% end %} floor); doubling factor {% katex() %}\beta = 2{% end %}; {% katex() %}\tau_{\text{ref}}^{\max} = 10\tau_{\text{ref}}(0){% end %}; reset counter on genuine recovery.
- **Field note**: Log the backoff counter in telemetry — counter {% katex() %}> 3{% end %} is a reliable human-escalation trigger that most teams never instrument.

where \\(n\\) is the consecutive failure count (refractory expired; condition still present: \\(z_t^K > \theta_L\\)), {% katex() %}\tau_{\text{ref}}(0) = 2\tau_{\text{fb}}{% end %} ({% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing dead-band with adaptive refractory backoff prevents integrator windup; oscillation amplitude decays with each refractory cycle") %}Proposition 30{% end %} floor), and {% katex() %}\tau_{\text{ref}}^{\max}{% end %} caps indefinite lockout (default: {% katex() %}10 \cdot \tau_{\text{ref}}(0){% end %}). **Reset**: \\(n \to 0\\) when \\(z_t^K \leq \theta_L\\) ({% term(url="#def-47", def="Schmitt Trigger Hysteresis: dual threshold with separate trigger and release levels preventing healing loop flapping near a boundary") %}Definition 47{% end %} Schmitt release — genuine recovery confirmed). Failure count \\(n\\) is maintained per-action per-component and is not shared between actions.

> **Physical translation**: Each consecutive recovery failure is evidence that the fault is structural, not transient — doubling the refractory window gives the system exponentially more observation time before the next attempt. This prevents healing storms: under a persistent fault, fixed-window refractory fires at constant rate {% katex() %}1/\tau_{\text{ref}}(0){% end %} indefinitely; adaptive backoff reaches the ceiling {% katex() %}\tau_{\text{ref}}^{\max}{% end %} after \\(\log_2(10) \approx 3.3\\) failures and stays there, reducing retry rate by \\(10\times\\) and protecting thermal budget and actuator wear.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration**: Sensor firmware crash loop; {% katex() %}\tau_{\text{fb}} = 5{% end %} s, {% katex() %}\tau_{\text{ref}}(0) = 10{% end %} s, {% katex() %}\tau_{\text{ref}}^{\max} = 100{% end %} s. Consecutive restart failures (\\(n = 0, 1, 2, 3\\)) produce refractory windows of 10 s, 20 s, 40 s, 80 s — the attempt rate halves after each failure, giving the node exponentially more observation time. Settled at {% katex() %}\tau_{\text{ref}}^{\max} = 100{% end %} s: no more than 5 attempts per hour versus 36 per hour under fixed {% katex() %}\tau_{\text{ref}} = 10{% end %} s. At 5 attempts per hour, accumulated heating from firmware crash-cycles remains below the thermal throttle threshold — the backoff curve is the thermal safety curve.

<span id="def-49"></span>

**Definition 49** (Derivative Confidence Dampener). The Analysis phase computes a confidence score \\(\theta(t) \in [0,1]\\) (Proposition 29). High confidence at a single sample does not distinguish a stable genuine fault from a transient spike peaking above \\(\theta_H\\) and falling naturally. The **derivative dampener** adds a trend check in the Analysis phase before escalating to Execute. The sliding-window first-order estimate is:

{% katex(block=true) %}
\dot{\theta}(t) \approx \frac{\theta(t) - \theta(t - w \cdot T_{\text{tick}})}{w \cdot T_{\text{tick}}}
{% end %}

- **Use**: Estimates whether the confidence score is rising or falling using a sliding-window derivative; compute in the Analyze phase before checking the actuation hold condition to distinguish worsening faults ({% katex() %}\dot{\theta} > 0{% end %}) from self-recovering transients ({% katex() %}\dot{\theta} < 0{% end %}).
- **Parameters**: Window {% katex() %}w = 5{% end %} samples (empirical optimum); larger {% katex() %}w{% end %} reduces noise but increases response lag.
- **Field note**: {% katex() %}w = 3{% end %} is too noisy; {% katex() %}w = 10{% end %} is too slow for fast-moving faults — 5 samples is the empirically validated sweet spot.

**Actuation hold condition**: suppress Execute even when {% katex() %}\theta(t) \geq \theta_H{% end %} if:

{% katex(block=true) %}
\dot{\theta}(t) < -\gamma_{\text{damp}}, \qquad \gamma_{\text{damp}} = \frac{\theta_H - \theta_L}{2\,w \cdot T_{\text{tick}}}
{% end %}

- **Use**: Suppresses the Execute phase when {% katex() %}\dot{\theta}{% end %} falls faster than rate {% katex() %}\gamma_{\text{damp}}{% end %}, meaning confidence is recovering fast enough to self-resolve before {% katex() %}\tau_{\text{confirm}}{% end %} elapses; prevents false actuation on transient spikes that briefly cross {% katex() %}\theta_H{% end %} but are already recovering.
- **Parameters**: {% katex() %}\gamma_{\text{damp}} = \Delta\theta / (2w \cdot T_{\text{tick}}){% end %}; CONVOY example: {% katex() %}\Delta\theta=0.20,\, w=5,\, T_{\text{tick}}=1\text{ s} \to \gamma_{\text{damp}}=0.02\text{ s}^{-1}{% end %}.
- **Field note**: In CONVOY testing this hold suppressed 67% of reroute commands that would have been false positives under pure threshold triggering.

The dampener threshold \\(\gamma_{\text{damp}}\\) is the rate at which confidence would traverse half the hysteresis band in one derivative window — fast enough to cross from \\(\theta_H\\) to \\(\theta_L\\) within \\(2w\\) samples, implying the anomaly will self-resolve before {% katex() %}\tau_{\text{confirm}}{% end %} elapses.

**Resume actuation** when {% katex() %}\dot{\theta}(t) \geq -\gamma_{\text{damp}}{% end %} and {% katex() %}\theta(t) \geq \theta_H{% end %} (stabilized genuine fault). Bypass Execute entirely if {% katex() %}\theta(t) \leq \theta_L{% end %} — natural recovery is confirmed and the Schmitt trigger returns to NOMINAL without any actuation. Default: \\(w = 5\\) samples.

> **Physical translation**: A spike in confidence that is already falling when Execute checks it is likely transient noise, not a stable fault. The derivative dampener adds a trend check: if {% katex() %}\dot{\theta} < -\gamma_{\text{damp}}{% end %}, the anomaly is recovering faster than the confirmation window — hold execution. The oscillation-prevention benefit is that a transient spike above \\(\theta_H\\) that would trigger an immediate healing action is instead suppressed until the trend stabilizes, eliminating the class of false-positive healing on self-recovering conditions that account for the majority of unnecessary interventions in practice.

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calibration**: Link-quality confidence reaches {% katex() %}\theta = 0.82 \geq \theta_H = 0.80{% end %} at \\(t = 0\\) s, but {% katex() %}\dot{\theta} = -0.04{% end %} s{% katex() %}{}^{-1} < -\gamma_{\text{damp}} = -0.02{% end %} s{% katex() %}{}^{-1}{% end %} (\\(w = 5\\), {% katex() %}T_{\text{tick}} = 1{% end %} s, \\(\Delta\theta = 0.20\\)). Derivative dampener holds. At \\(t = 10\\) s: {% katex() %}\theta \approx 0.42 < \theta_L = 0.60{% end %} — natural recovery, Schmitt trigger releases to NOMINAL with no action taken. Without dampening: a reroute command fires at \\(t = 0\\) on a self-recovering link, triggering a full-convoy reroute maneuver that costs 8 minutes of mission time.

**Combined Activation Example**

*When all three mechanisms are simultaneously active — as occurs during a high-severity RAVEN heating event — their interaction proceeds as follows: (1) The Schmitt Trigger fires when the health score crosses \\(\theta_H\\), initiating a healing action. (2) The Adaptive Refractory Backoff begins: the system will not fire another healing action for \\(\tau_\text{ref}(0)\\) seconds. (3) The Derivative Confidence Dampener simultaneously suppresses the derivative signal. If the dampener weight is below 0.5 when the refractory window expires, the release condition is not met even if the health score has nominally recovered below \\(\theta_L\\) — the system remains in refractory until the dampener clears. Schmitt trigger release takes priority: once the health score is sustainably below \\(\theta_L\\) AND the dampener weight exceeds its clearance threshold, refractory ends.*

<span id="prop-95"></span>

**Proposition 95 (Healing Algorithm Liveness).** [BOUND] *The composite flapping-prevention mechanism ({% term(url="#def-47", def="Flapping-prevention constructs: Schmitt trigger hysteresis, adaptive refractory backoff, and derivative confidence dampening") %}Definitions 47–49{% end %}) terminates within* {% katex() %}n_{\max} = \lceil \log_2(T_{\text{mission}} / \tau_{\text{ref}}(0)) \rceil{% end %} *retry cycles. After* \\(n_{\max}\\) *failed retries, adaptive refractory backoff ({% term(url="#def-48", def="Adaptive Refractory Backoff: refractory period doubles after each consecutive healing action to prevent runaway remediation") %}Definition 48{% end %}) has extended* \\(\tau_{\text{ref}}(n)\\) *beyond the remaining mission duration; the system transitions unconditionally to Terminal Safety State ({% term(url="#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}) and the hardware veto interlock ({% term(url="#prop-32", def="Mode-Transition Safety: a mode transition is safe only when the system state lies in the safe region of both the departing and arriving mode at transition time; Definition 39 enforces this pre-transition check") %}Proposition 32{% end %}) takes effect. This is the global failure-safe exit. This guarantee holds when {% katex() %}\tau_{\text{ref}}^{\max} \geq T_{\text{mission}} / 2{% end %}. When the ceiling cap {% katex() %}\tau_{\text{ref}}^{\max} = 10 \times \tau_{\text{ref}}(0){% end %} is reached before the backoff window exceeds the remaining mission time, the system may exhaust \\(n_{\max}\\) retries without the refractory period bounding the mission — in this case, the {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}Minimum Viable System{% end %} floor ({% term(url="#def-50", def="Minimum Viable System: smallest component subset whose combined capability meets the survival threshold, defining the healing algorithm's priority boundary") %}Definition 50{% end %}) is activated after \\(n_{\max}\\) failures regardless.*

*No matter how many times {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s healing loop fails and backs off, it will reach the terminal safety state in at most 5 retries rather than retrying indefinitely.*

**RAVEN calibration**: \\(\tau_{\text{ref}}(0) = 240\\) s, \\(T_{\text{mission}} = 7200\\) s, giving \\(n_{\max} = 5\\) retries. For OUTPOST with 72-hour missions, set {% katex() %}\tau_{\text{ref}}(0) \leq 300{% end %} s to keep \\(n_{\max} \leq 10\\).

> **Empirical status**: The \\(n_{\max} = 5\\) value is specific to the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} initial refractory period of 240 s and 2-hour mission duration; different initial refractory periods or mission durations produce different retry budgets, and the terminal-safety fallback guarantee depends on the initial refractory being large enough relative to the expected healing action duration.

<span id="prop-32"></span>

**Proposition 32** (Hardware Veto Invariant). The {% term(url="@/blog/2026-02-19/index.md#def-108", def="Hardware-level circuit enforcing safe-state transition independent of software; non-programmable, non-resettable from software, fires on wired physical conditions regardless of MAPE-K state") %}L0 Physical Safety Interlock{% end %} (Definition 108) exposes a boolean signal {% katex() %}v(t) \in \{0, 1\}{% end %} to the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} Execute phase. When \\(v(t) = 1\\):

*When the hardware thermal fuse trips on an {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensor node, no software path — however urgent — can issue another restart command that would worsen the damage.*

1. **Skip Execute** — the Execute phase is bypassed for this tick; no healing action is issued to component \\(c\\).
2. **Freeze \\(Q_d\\)** — the demand accumulator ({% term(url="#def-46", def="Healing Dead-Band and Refractory State: dual-threshold mechanism preventing the healing loop from issuing back-to-back actions faster than the refractory period") %}Definition 46{% end %}) is not incremented; no silent backlog builds during the veto period.
3. **Log** `VETO_ACTIVE` — the Knowledge base \\(K\\) records the veto event, component identifier, and tick timestamp.

No retry, no timeout override, no software path to resume execution while \\(v(t) = 1\\). **Veto termination**: \\(v(t) = 0\\) requires physical human action ({% term(url="@/blog/2026-02-19/index.md#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %}: non-resettability from software). *Claim*: for any component \\(c\\) and any interval \\([t_1, t_2]\\) with \\(v(t) = 1\\) for all \\(t \in [t_1, t_2]\\):

{% katex(block=true) %}
N_{\text{exec}}\!\left(c,\, [t_1, t_2]\right) = 0
{% end %}

- **Use**: Formally states that no healing action fires on component {% katex() %}c{% end %} while the L0 hardware veto {% katex() %}v(t) = 1{% end %}; software reads {% katex() %}v(t){% end %} at each Execute tick and skips if set, preventing thermal runaway from software endlessly retrying commands to a fused actuator.
- **Parameters**: {% katex() %}v(t) \in \{0,1\}{% end %} from a physical latch circuit; non-bypassable from any software path by construction.
- **Field note**: A software-only veto is insufficient — firmware bugs or stack corruption can bypass it; the latch must be a dedicated physical circuit.

*Proof*. \\(v(t) = 1\\) causes Execute to be skipped at every tick. By {% term(url="@/blog/2026-02-19/index.md#def-108", def="L0 Physical Safety Interlock: hardware-enforced safety constraint that cannot be overridden by software; last line of defense when all autonomic layers fail") %}Definition 108{% end %} (non-resettability from software), \\(v\\) remains \\(1\\) until physical intervention — no autonomous path exists to set \\(v(t) = 0\\). Therefore no action executes in \\([t_1, t_2]\\). \\(\square\\)

**Reset path**: The hardware veto can only be cleared by a physical operator action (power cycle or manual interlock reset). Software cannot clear or suppress it — any attempt to write to the veto register while \\(v(t) = 1\\) is a no-op by hardware design.

*Infinite retry impossibility*: total executions on \\(c\\) satisfy {% katex() %}N_{\text{exec}}(c) \leq N_{\text{pre}} + N_{\text{resets}} \cdot N_{\text{per\_window}}{% end %}, where {% katex() %}N_{\text{resets}}{% end %} is the number of physical human resets (finite by construction) and {% katex() %}N_{\text{per\_window}}{% end %} is bounded by {% katex() %}\tau_{\text{ref}}^{\max}{% end %} ({% term(url="#def-48", def="Adaptive Refractory Backoff: refractory period doubles after each consecutive healing action to prevent runaway remediation") %}Definition 48{% end %}). \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration**: Thermal-fuse trip on sensor node after 3 restart attempts (\\(n = 0, 1, 2\\) per {% term(url="#def-48", def="Adaptive Refractory Backoff: refractory period doubles after each consecutive healing action to prevent runaway remediation") %}Definition 48{% end %}, refractory windows 10 s, 20 s, 40 s). At attempt 4, hardware temperature exceeds fuse threshold: \\(v(t) \to 1\\). Execute is skipped; \\(Q_d\\) is frozen at 3; `VETO_ACTIVE` is logged. Without the veto invariant: attempts 4, 5, 6... each adding thermal load at 80 s intervals, leading to thermal runaway within 20 minutes. With the veto invariant: the node enters Terminal Safety State ({% term(url="#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %}) and awaits physical inspection. \\(Q_d\\) remains at 3 — no burst discharge on veto release.

*({% term(url="#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %} is introduced below in the Terminal Safety State section.)*

> **Cognitive Map**: Healing under uncertainty layers three defenses against wrong action. First, cost-calibrated confidence thresholds ({% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %}) set the act/wait boundary from measured FP/FN cost ratios rather than intuition — the threshold adapts continuously with mission phase, resource level, and connectivity. Second, staleness-aware suppression ({% term(url="#def-45", def="Staleness Decay Function: time-decaying weight applied to gossip health updates, making older observations contribute less to anomaly threshold estimation") %}Definition 45{% end %}) progressively disables low-severity healing actions as the Knowledge Base ages, ensuring that stale data drives fewer autonomous decisions. Third, control-theoretic oscillation prevention (Definitions 28, 75–71 and {% term(url="#prop-30", def="Anti-Windup Oscillation Bound: healing dead-band with adaptive refractory backoff prevents integrator windup; oscillation amplitude decays with each refractory cycle") %}Proposition 30{% end %}) eliminates the six known classes of healing oscillation: dead-band confirmation, Schmitt trigger hysteresis, anti-windup accumulator, adaptive refractory backoff, and derivative confidence dampening. The hardware veto invariant ({% term(url="#prop-32", def="Mode-Transition Safety: a mode transition is safe only when the system state lies in the safe region of both the departing and arriving mode at transition time; Definition 39 enforces this pre-transition check") %}Proposition 32{% end %}) is the hard floor — when the L0 physical interlock fires, no software path can override it. Next: when multiple components need healing simultaneously, restart order matters — the following section addresses dependency-aware sequence planning.

---

## Recovery Ordering

**Problem**: When multiple components fail simultaneously, healing them in the wrong order causes immediate re-failure. An application server restarted before its database reconnects fails to initialize. The healing action completes technically but the component stays broken.

**Solution**: Model dependencies as a directed graph and restart in topological order — each component starts only after all its dependencies are healthy. For circular dependencies and resource-constrained scenarios, stub mode and the Minimum Viable System identify the minimal safe starting set without resolving the cycle.

**Trade-off**: Topological ordering requires knowing the dependency graph. At the edge, this graph is often partially known. Conservative assumptions — assume a dependency exists when unknown — produce correct but potentially slower restart sequences.

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

> **Physical translation**: \\(\sigma(B) < \sigma(A)\\) means B appears earlier in the restart sequence than A — restart B before A. The constraint states that for every dependency edge \\((A, B)\\), B must restart first. A topological sort is any ordering that satisfies this constraint for every edge simultaneously. When the graph has no cycles, such an ordering always exists and can be computed in \\(O(|V| + |E|)\\) time.

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

> **Read the diagram**: Both nodes are red — neither can satisfy the other's startup precondition. Auth Service needs users from the Database; Database needs auth from the Auth Service. The cycle means topological sort is undefined: no valid ordering exists. Both components require the other to already be running, creating a deadlock at startup.

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

<span id="def-50"></span>
**Definition 50** ({% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}Minimum Viable System{% end %}). *The {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm's priority boundary — these components are repaired first") %}minimum viable system{% end %} {% katex() %}\text{MVS} \subseteq V{% end %} is the smallest subset of components such that {% katex() %}\text{capability}(\text{MVS}) \geq \mathcal{L}_1{% end %}, where {% katex() %}\mathcal{L}_1{% end %} is the basic mission capability threshold. Formally:*

{% katex(block=true) %}
\text{MVS} = \arg\min_{S \subseteq V} |S| \quad \text{subject to} \quad \text{capability}(S) \geq \mathcal{L}_1
{% end %}

> **Physical translation**: Minimize the number of components (smallest \\(|S|\\)) while keeping combined capability at or above the mission-critical threshold {% katex() %}\mathcal{L}_1{% end %}. The MVS answers: "if I can only heal \\(N\\) components and want to maximize operational capability, which \\(N\\) should I prioritize?" — not \\(N\\), but the smallest \\(N\\) that clears the {% katex() %}\mathcal{L}_1{% end %} floor. Every component outside the MVS is a candidate to remain offline when healing resources are scarce.

- **Use**: Identifies the smallest component subset that preserves all critical functions at capability level L1 or above; shed non-MVS subsystems when entering deep partition with falling resources to prevent resource suicide from attempting full functionality under severe stress.
- **Parameters**: Solved greedily ({% katex() %}1 - 1/e{% end %} approximation); re-run at each 10% resource drop boundary.
- **Field note**: Define the MVS list at design time — computing it greedily under resource stress can itself consume the remaining budget.

In other words, the {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm's priority boundary — these components are repaired first") %}MVS{% end %} is the leanest set of components that still keeps the system above the minimum acceptable {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier from heartbeat-only survival at the base level to full fleet integration at the top; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %} {% katex() %}\mathcal{L}_1{% end %}; every component outside the {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} is a candidate to remain offline when healing resources are scarce.

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}:
- **{% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} components**: Flight controller, collision avoidance, mesh radio, GPS
- **Non-{% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} components**: High-resolution camera, target classification ML, telemetry detail

When healing resources are scarce, heal {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} components first. Non-{% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} components can remain degraded.

<span id="prop-33"></span>
**Proposition 33** ({% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} Approximation). *Finding the exact {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} is NP-hard (reduction from set cover). However, a greedy algorithm that iteratively adds the component maximizing capability gain achieves approximation ratio \\(O(\ln |V|)\\).*

*Under resource scarcity, always heal the component that contributes the most new capability — the greedy choice is guaranteed to find a near-optimal minimum viable set.*

**Precondition — submodularity**: The greedy \\(O(\ln |V|)\\) approximation guarantee requires the capability function to be submodular (diminishing marginal returns): for all \\(S \subseteq T \subseteq V\\) and component \\(i \notin T\\), {% katex() %}\text{capability}(S \cup \{i\}) - \text{capability}(S) \geq \text{capability}(T \cup \{i\}) - \text{capability}(T){% end %}. This holds when no two components are mutual prerequisites for a capability. It fails when two components are jointly required (e.g., a crypto module + networking stack jointly unlock secure {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}, but neither alone contributes). In that case: (1) treat the pair as a single compound component in the greedy algorithm; (2) verify submodularity by checking all component pairs before running greedy. Failure to verify submodularity may produce a greedy solution 2–3x larger than the true {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %}.

*Proof sketch*: {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} is a covering problem: find the minimum set of components whose combined capability exceeds threshold {% katex() %}\mathcal{L}_1{% end %}. When the capability function exhibits diminishing marginal returns (submodular), the greedy algorithm achieves \\(O(\ln |V|)\\) approximation, matching the bound for weighted set cover.
For small component sets, enumerate solutions. For larger sets, use the greedy approximation: iteratively add the component that contributes most to capability until {% katex() %}\mathcal{L}_1{% end %} is reached.

In other words, the exact {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm's priority boundary — these components are repaired first") %}MVS{% end %} is computationally intractable for large systems, but always-pick-the-most-useful-component-next finds a solution at most \\(O(\ln |V|)\\) times larger than the true minimum.

> **Physical translation:** The greedy sensor selection algorithm always achieves at least 63% of the coverage the theoretically optimal set would provide. For OUTPOST with 127 sensors, this means the greedy minimum-viable set may miss observability of up to 37% of the threat surface — acceptable for survival mode operation, not for full-capability operation. In practice, the greedy algorithm typically achieves 85–90% of optimal coverage, with the 63% bound being the worst-case guarantee.

### Game-Theoretic Extension: Shapley Values for Critical Component Identification

{% term(url="#prop-33", def="MVS Approximation: Minimum Viable System can be identified by greedy resource-priority ordering with approximation ratio at most 2 of the optimal") %}Proposition 33{% end %}'s greedy set-cover approximation identifies a minimum feasible component set. It does not identify which components are most *critical* to {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} achievability — a question answered by the **Shapley value** of the cooperative game over component contributions.

**{% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} cooperative game**: Players are the \\(n\\) nodes (or components). The characteristic function \\(v(S)\\) is the mission completion probability achievable with the components contributed by coalition \\(S\\).

The **Shapley value** of node \\(i\\) measures its average marginal contribution across all possible coalition orderings:

{% katex(block=true) %}
\phi_i(v) = \sum_{S \subseteq N \setminus \{i\}} \frac{|S|!\,(|N|-|S|-1)!}{|N|!} \bigl[v(S \cup \{i\}) - v(S)\bigr]
{% end %}

**Shapley vs. minimum set**: A node can be in many minimum {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} coalitions (high Shapley value) without itself being a minimum set. High-Shapley nodes are single points of failure for {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} achievability — they appear in most coalitions that cross the feasibility threshold.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} application**: When drone 23 fails and coverage must be redistributed, the drones needed to fill the gap have high Shapley values in the coverage {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} game. Allocating healing resources (battery reserve, repositioning priority) proportional to Shapley values is efficient (total mission value maximized) and satisfies the fairness axioms of efficiency, symmetry, and marginality.

**Practical implication**: Pre-compute Shapley values for the {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} game during mission planning. Nodes with Shapley values above a criticality threshold {% katex() %}\phi_i > \phi_{\text{crit}}{% end %} receive:
- Higher power reserves
- Priority positions in healing queues
- Stricter health monitoring thresholds (lower \\(\theta^\*\\))

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s 47 drones, computing Shapley values over the relevant {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} coalitions (typically 5-10 drones) is tractable at {% katex() %}O(2^{|S_{\text{MVS}}|}){% end %} per mission phase.

> **Cognitive Map**: Recovery ordering converts the "what to heal" decision (confidence threshold) into the "in what order" decision. Topological sort handles the common case; stub mode breaks circular dependencies; the MVS identifies the minimum healing target when resources are exhausted. Shapley values extend the MVS from a feasibility question (which components must run?) to a criticality question (which components are hardest to replace?) — enabling resource allocation proportional to irreplaceability. Together these form a layered priority structure: heal MVS components first, in topological order, starting from the highest-Shapley node. Next: the healing loop itself is a power consumer — as resources deplete, even the autonomic monitoring must throttle to preserve survival time.

---

## Dynamic Fidelity Scaling

**Problem**: Every gossip round, every Kalman update, every reputation EWMA is energy subtracted from the mission. At full battery this overhead is negligible; near the survival threshold it competes directly with the functions it was designed to protect.

**Solution**: Define five observation regimes keyed to battery level. Each regime suspends a specific set of autonomic tasks, with downgrade boundaries set by measured power draws. The monitoring infrastructure throttles itself before the mission payload does.

**Trade-off**: Lower autonomic fidelity means slower anomaly detection and coarser health estimates. The system accepts higher false-negative rates to avoid dying from self-monitoring overhead. This is a deliberate exchange of detection capability for survival time.

Self-measurement is a parasitic load. Every {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} round, every Kalman update, every reputation EWMA is energy subtracted from the mission. At full battery this overhead is negligible. Near the survival threshold it competes directly with the functions it was designed to protect. Dynamic Fidelity Scaling (DFS) formalizes the feedback loop that throttles autonomic overhead as resources deplete — treating monitoring as a luxury earned only by surplus.

<span id="def-51"></span>
**Definition 51** (Autonomic Overhead Power Map). *Let {% katex() %}\mathcal{P}_k{% end %} denote the sustained power draw of level \\(L_k\\) autonomic tasks — monitoring, analysis, learning, and fleet coordination — excluding mission payload (propulsion, weapons sensors, payload compute). Decompose as:*

{% katex(block=true) %}
\mathcal{P}_k = P_{\mathrm{radio}}(k) + P_{\mathrm{compute}}(k) = \lambda_k \cdot T_s + f_{\mathrm{alg}}(k) \cdot T_d
{% end %}

> **Physical translation**: Total autonomic overhead {% katex() %}\mathcal{P}_k{% end %} splits into radio cost (gossip rate \\(\lambda_k\\) times energy per packet \\(T_s\\)) and compute cost (algorithm decision rate {% katex() %}f_{\text{alg}}(k){% end %} times energy per decision \\(T_d\\)). Because {% katex() %}T_s / T_d \approx 10^2\text{–}10^3{% end %}, radio cost dominates overwhelmingly. Reducing gossip rate from 8 Hz (L4) to 1/60 Hz (L0) cuts autonomic radio overhead by \\(480\\times\\) — this single lever accounts for nearly the entire L0–L4 power ratio of \\(420\\times\\).

- **Use**: Gives total autonomic overhead in milliwatts at each capability level {% katex() %}k{% end %} from L0 to L4; confirm {% katex() %}P_k \leq R_{\text{total}} - R_{\text{mission}}{% end %} before enabling any tier to prevent unsustainable autonomy that drains battery within hours when running at L3+.
- **Parameters**: L0 {% katex() %}\approx 0.1{% end %} mW; L1 {% katex() %}\approx 2{% end %} mW; L2 {% katex() %}\approx 8{% end %} mW; L3 {% katex() %}\approx 20{% end %} mW; L4 {% katex() %}\approx 42{% end %} mW.
- **Field note**: Measure {% katex() %}P_k{% end %} empirically on real hardware — simulation underestimates radio idle drain by \\(2{-}3\\times\\).

*where \\(\lambda_k\\) is the {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate at level \\(k\\) (packets/second), \\(T_s\\) is the energy per radio packet, {% katex() %}f_{\mathrm{alg}}(k){% end %} is the decision rate of level-\\(k\\) algorithms, and \\(T_d\\) is the energy per local compute decision (both from Def 21). Because {% katex() %}T_s / T_d \approx 10^2\text{–}10^3{% end %}, radio cost dominates — {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} rate is the primary autonomic power lever.*

For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} (\\(T_s = 5\\) mJ/packet, \\(T_d = 50\\,\mu\text{J}\\)/decision):

| Level | Primary autonomic tasks | Gossip \\(\lambda_k\\) | {% katex() %}P_{\mathrm{radio}}{% end %} | {% katex() %}P_{\mathrm{compute}}{% end %} | \\(\mathcal{P}_k\\) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| L0 | Heartbeat beacon | 1/60 Hz | ~0.08 mW | ~0 | ~0.1 mW |
| L1 | EWMA anomaly detection | 0.5 Hz | 2.5 mW | ~0.05 mW | ~3 mW |
| L2 | Kalman filter + state sync | 2 Hz | 10 mW | ~0.5 mW | ~11 mW |
| L3 | HLC + BFT peer validation | 4 Hz | 20 mW | ~1 mW | ~21 mW |
| L4 | Quorum + reputation learning | 8 Hz | 40 mW | ~2 mW | ~42 mW |

*The L0–L4 ratio {% katex() %}\mathcal{P}_4 / \mathcal{P}_0 \approx 420{% end %} means full-fidelity autonomic operation consumes 420 times the power of heartbeat-only mode — a factor that dominates survival time in power-limited emergency conditions.*

<span id="def-52"></span>
**Definition 52** (Observation Regime Schedule). *Let \\(R(t) \in [0,1]\\) be the normalized resource availability (battery SOC for power-constrained nodes). Define five observation regimes with hysteretic thresholds — downgrade threshold {% katex() %}\theta_k^{\mathrm{dn}}{% end %} and upgrade threshold {% katex() %}\theta_k^{\mathrm{up}} = \theta_k^{\mathrm{dn}} + \delta_{\mathrm{hyst}}{% end %} with hysteresis band {% katex() %}\delta_{\mathrm{hyst}} = 0.05{% end %}:*

| Regime | \\(R(t)\\) range (downgrade) | Active level | Suspended tasks |
| :--- | :--- | :--- | :--- |
| \\(O_4\\) High Fidelity | \\(R \geq 0.90\\) | L0–L4 | None |
| \\(O_3\\) Reduced Learning | \\([0.50,\\; 0.90)\\) | L0–L3 | Bandit/Q-learning updates (Def 33), reputation EWMA (Def 44) |
| \\(O_2\\) Conservation | {% katex() %}[E_{\mathrm{PLM}},\; 0.50){% end %} | L0–L1 | Kalman (Def 23), HLC tracking (Def 40), BFT validation (Def 43), gossip reduced to 0.5 Hz |
| \\(O_1\\) Survival | {% katex() %}[E_{\mathrm{HSS}},\; E_{\mathrm{PLM}}){% end %} | L0 only | All radio transmissions, all analysis, all learning |
| \\(O_0\\) Terminal | {% katex() %}R < E_{\mathrm{HSS}}{% end %} | None | Trigger {% katex() %}\mathcal{S}_{\mathrm{term}}{% end %} (Def 124) |

*({% term(url="#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %} is introduced below in the Terminal Safety State section.)*

*Downgrade is immediate on threshold crossing; upgrade requires {% katex() %}R(t) > \theta_k^{\mathrm{dn}} + \delta_{\mathrm{hyst}}{% end %} to prevent oscillation near the boundary.*

> **Physical translation**: Five operating modes ordered from richest to most frugal. The hysteresis band ({% katex() %}\delta_{\text{hyst}} = 0.05{% end %}) prevents the system from bouncing back to a higher regime until the battery has recovered by a full 5% above the downgrade threshold — preventing rapid oscillation near regime boundaries, which would itself consume the power the downgrade was meant to save.

**Phase gate prerequisite for L3 tasks (CI-02)**: Regime \\(O_3\\) activates {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} tracking ({% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock (HLC): clock combining physical and logical timestamps, advancing on message receipt to maintain causal ordering without NTP") %}Definition 61{% end %}) and BFT peer validation ({% term(url="@/blog/2026-02-05/index.md#def-64", def="Peer-Validation Layer: gossip mechanism where nodes cross-check state updates to detect and reject Byzantine insertions without central authority") %}Definition 64{% end %}) — capabilities belonging to the Phase 2 and Phase 3 certification tiers of the Field Autonomic Certification ({% term(url="@/blog/2026-02-19/index.md#def-104", def="Field Autonomic Certification: process verifying an edge node's autonomic stack meets minimum capability requirements before granting operational authority") %}Definition 104{% end %}).

A node that transitions to \\(O_3\\) based solely on \\(R(t) \geq 0.50\\) without satisfying the corresponding phase gates runs L3-tier machinery (26 mW, 4 Hz {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}, {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} causality validation) without verified correctness of the underlying coordination protocol. The correct precondition is {% katex() %}R(t) \geq 0.50 \land G_2(S) = 1{% end %} — the Phase 2 gate must have been passed during commissioning.

In systems where Phase 2/3 certification has not been completed (e.g., early deployment phases), cap the maximum active level at L1 regardless of battery level: run \\(O_2\\) thresholds with L0–L1 tasks only, deferring BFT and {% term(url="@/blog/2026-02-05/index.md#def-61", def="Hybrid Logical Clock combining physical and logical timestamps; provides causal ordering that survives partition and re-sync without NTP synchronization") %}HLC{% end %} to post-certification.

**Quorum availability gate for O_3 / O_4 (CI-03)**: L3 and L4 tasks include BFT validation (Def 43) and reputation quorum (Def 45), both requiring a local cluster quorum of \\(\lceil 2n/3 \rceil + 1\\) reachable peers. When a partition reduces the reachable cluster to \\(n\' < \lceil 2n/3 \rceil + 1\\) nodes, BFT is structurally unavailable regardless of battery level.

Running L3/L4 tasks in this condition wastes energy (20–63 mW) without providing {% term(url="@/blog/2026-01-22/index.md#def-27", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %} guarantees: the plausibility predicate {% katex() %}\kappa(c,j) \geq k_{\text{accept}}{% end %} cannot be satisfied with fewer than {% katex() %}k_{\text{accept}}{% end %} reachable neighbors.

Operational rule: before entering \\(O_3\\) or \\(O_4\\), verify {% katex() %}|\mathcal{N}_{\text{reachable}}(t)| \geq \lceil 2n/3 \rceil + 1{% end %}; if the condition fails, enter \\(O_2\\) regardless of \\(R(t)\\). For a {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} partition where only 6 of 12 vehicles remain in the cluster (below \\(\lceil 8 \rceil + 1 = 9\\) required), the correct regime is \\(O_2\\) even at full battery.

<span id="prop-34"></span>
**Proposition 34** (Self-Throttling Survival Gain). *Let \\(Q\\) be the mission payload power (propulsion, payload compute; \\(Q = 0\\) in emergency ground mode). The survival time from current resource level \\(R(t)\\) to the next critical threshold {% katex() %}\theta_{k-1}{% end %} under regime \\(O_k\\) is:*

*Switching a grounded {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} drone from full-fidelity to heartbeat-only autonomics extends its survival window from 3.5 hours to 32 hours on the same battery.*

{% katex(block=true) %}
T_{\mathrm{survive}}^{(k)}(R) = \frac{\bigl(R(t) - \theta_{k-1}\bigr) \cdot E_{\max}}{Q + \mathcal{P}_k}
{% end %}

> **Physical translation**: Remaining energy {% katex() %}(R(t) - \theta_{k-1}) \cdot E_{\max}{% end %} divided by total power draw {% katex() %}Q + \mathcal{P}_k{% end %}. Throttling reduces {% katex() %}\mathcal{P}_k{% end %} without affecting \\(Q\\) (mission payload); the survival time extends proportionally. For RAVEN near the survival threshold with propulsion off (\\(Q = 5\\) mW): full-fidelity ({% katex() %}\mathcal{P}_4 = 42{% end %} mW) gives 3.5 hours; survival-mode ({% katex() %}\mathcal{P}_0 \approx 0.1{% end %} mW) gives 32.7 hours — a \\(9.3\\times\\) extension from a single configuration change.

*The marginal survival gain from downgrading {% katex() %}O_{k+1} \to O_k{% end %} is:*

{% katex(block=true) %}
\Delta T^{(k)} = \bigl(R(t) - \theta_{k-1}\bigr) \cdot E_{\max} \cdot \left(\frac{1}{Q + \mathcal{P}_k} - \frac{1}{Q + \mathcal{P}_{k+1}}\right) > 0
{% end %}

*since {% katex() %}\mathcal{P}_k < \mathcal{P}_{k+1}{% end %} by construction. Throttling always extends survival time; the only cost is reduced observability fidelity.* \\(\square\\)

> **Empirical status**: The \\(9.3\times\\) survival multiplier uses {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}-specific power values ({% katex() %}\mathcal{P}_4 = 42{% end %} mW, {% katex() %}\mathcal{P}_0 = 0.1{% end %} mW, \\(E_{\max} = 1110\\) mWh); the multiplier is sensitive to radio idle drain, which simulations underestimate by \\(2\text{–}3\times\\) — measure {% katex() %}\mathcal{P}_k{% end %} empirically on the target hardware before relying on this ratio.

*Self-throttling trigger*: the node transitions {% katex() %}O_{k+1} \to O_k{% end %} the instant \\(R(t)\\) crosses {% katex() %}\theta_k^{\mathrm{dn}}{% end %} from above, and immediately suspends the tasks listed in Def 123. Regime state is stored in non-volatile memory so that a warm-reboot restores the correct throttle level without re-running \\(R(t)\\) estimation from scratch.

<span id="prop-35"></span>
**Proposition 35** (Autonomic Overhead Paradox). *In PLM mode ({% katex() %}Q = Q_{\mathrm{sensors}} \approx 5{% end %} mW for residual sensor power; propulsion off), the full-fidelity vs. survival-mode survival times to {% katex() %}E_{\mathrm{HSS}}{% end %} starting from {% katex() %}E_{\mathrm{PLM}} = 0.20{% end %} are:*

*Near the survival threshold the monitoring stack itself is the largest power consumer — disabling it is worth more than any single healing action.*

{% katex(block=true) %}
T_{\mathrm{survive}}^{(4)} = \frac{0.15 \times 1{,}110\;\mathrm{mWh}}{5 + 42\;\mathrm{mW}} \approx 3.5\;\mathrm{h}, \qquad
T_{\mathrm{survive}}^{(1)} = \frac{0.15 \times 1{,}110\;\mathrm{mWh}}{5 + 0.1\;\mathrm{mW}} \approx 32.7\;\mathrm{h}
{% end %}

*The L4-to-L0 throttle multiplier is {% katex() %}T_{\mathrm{survive}}^{(1)} / T_{\mathrm{survive}}^{(4)} \approx 9.3\times{% end %} — the difference between a recovery team arriving before battery death and the drone expiring unrecovered.*

> **Empirical status**: The \\(9.3\times\\) multiplier is specific to the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} power budget; the qualitative paradox (monitoring overhead competing with survival at low battery) is general, but the exact crossover threshold depends on platform-specific {% katex() %}\mathcal{P}_k{% end %} and \\(E_{\max}\\) values that must be measured per hardware variant.

> **Physical translation**: The overhead of self-monitoring can exceed the savings it enables — here is when. Near the survival threshold, the \\(42\\) mW consumed by full-fidelity autonomic overhead dwarfs the \\(5\\) mW sensor load. The \\(9.3\\times\\) survival multiplier means the decision to throttle autonomic tasks at {% katex() %}E_{\text{PLM}}{% end %} is worth more than any single healing action. The paradox: the system must disable its healing infrastructure to survive long enough for healing to matter. The correct trigger is the energy threshold, not a fault detection event.

**The autonomic overhead paradox**: at {% katex() %}\theta_{\mathrm{survival}}{% end %}, the monitoring infrastructure designed to keep the node alive must be the first thing suspended. A node that refuses to throttle its L4 autonomic tasks in a resource crisis consumes itself — the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop becomes the proximate cause of death rather than its cure. The correct model is lexicographic: survival first, then observability, then fidelity. When {% katex() %}R(t) \leq \theta_k^{\mathrm{dn}}{% end %}, the node does not ask "will suspending this task hurt the mission?" — it asks "does this task cost more energy than it saves?"

**Interaction with Prop 79** (Stale Data Threshold): In \\(O_1\\) (Survival), {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} is suspended entirely — no new measurements arrive, so {% katex() %}T_{\mathrm{stale}}{% end %} expires for all remote state. The node operates on stale world-state for the duration of \\(O_1\\). This is acceptable: in survival mode the only decision is whether to remain in \\(O_1\\) or transition to \\(O_0\\) (terminal), both of which are local decisions requiring no remote data.

<span id="prop-36"></span>

**Proposition 36** (Self-Throttling Law). *The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} execution frequency is a resource-adaptive function of \\(R(t)\\):*

*As {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} battery falls toward the floor, the healing loop runs less frequently to survive — but never stops completely while an active failure is present.*

{% katex(block=true) %}
f_{\text{MAPE-K}}(t) = \max\!\Bigl(f_{\min} \cdot \mathbb{1}[I_{\text{crit}}(t)],\; \tfrac{1}{T_{\text{tick}}} \cdot \alpha(R(t))\Bigr)
{% end %}

- **Use**: Reduces MAPE-K monitoring frequency proportionally to remaining resource fraction {% katex() %}R(t){% end %}; applied automatically at each tick once configured to prevent the autonomic loop from consuming more power than the primary mission at low battery levels.
- **Parameters**: {% katex() %}f_{\min}{% end %} = minimum frequency during active critical failure; scaling function {% katex() %}\alpha(R){% end %} is piecewise linear between {% katex() %}R_{\text{floor}}{% end %} and {% katex() %}R_{\text{crit}}{% end %}.
- **Field note**: An unexpected frequency drop to {% katex() %}f_{\min}{% end %} visible in telemetry is the earliest warning of an energy-budget crisis — instrument it.

*where the throttle coefficient \\(\alpha : [0,1] \to (0,1]\\) is:*

{% katex(block=true) %}
\alpha(R) = \begin{cases}
1 & R > R_{\text{crit}} \\
\dfrac{R - R_{\text{floor}}}{R_{\text{crit}} - R_{\text{floor}}} & R_{\text{floor}} \leq R \leq R_{\text{crit}} \\
\alpha_{\text{floor}} > 0 & R < R_{\text{floor}}
\end{cases}
{% end %}

*and the critical-failure indicator is {% katex() %}I_{\text{crit}}(t) = \mathbb{1}[\exists\, j : H_j(t) < \eta_{\text{crit}}]{% end %} — active whenever any health component falls below the emergency threshold {% katex() %}\eta_{\text{crit}}{% end %}.*

*Parameters: {% katex() %}R_{\text{crit}} \approx 0.2{% end %} ({% term(url="@/blog/2026-01-15/index.md#def-1", def="Resource State: normalized composite of battery charge, free memory, and idle CPU between zero and one; falling below 0.2 triggers survival mode regardless of connectivity state") %}Definition 1{% end %}), {% katex() %}R_{\text{floor}} \approx 0.05{% end %} (Point of No Return), {% katex() %}\alpha_{\text{floor}} = f_{\min} \cdot T_{\text{tick}} > 0{% end %}, {% katex() %}f_{\min} = 0.5\,\text{Hz}{% end %} for {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}.*

*Proof sketch*: When {% katex() %}R > R_{\text{crit}}{% end %}, the system operates at full autonomic frequency {% katex() %}1/T_{\text{tick}}{% end %}. Between {% katex() %}R_{\text{floor}}{% end %} and {% katex() %}R_{\text{crit}}{% end %}, execution frequency scales linearly, preserving CPU and power budget for {% katex() %}\mathcal{L}_0{% end %} survival tasks. Below {% katex() %}R_{\text{floor}}{% end %} ("Point of No Return"), autonomic actions above {% katex() %}\mathcal{L}_0{% end %} are suspended; the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop drops to {% katex() %}\alpha_{\text{floor}}/T_{\text{tick}}{% end %} to maintain minimal liveness. The \\(\max\\) term guarantees that {% katex() %}f_{\text{MAPE-K}} \geq f_{\min} > 0{% end %} whenever {% katex() %}I_{\text{crit}} = 1{% end %} — even at \\(R \to 0\\) — preventing the healing loop from halting during an active emergency.

**Liveness Guarantee**: {% katex() %}\alpha_{\text{floor}} > 0{% end %} and {% katex() %}f_{\min} > 0{% end %} by construction, so {% katex() %}f_{\text{MAPE-K}}(t) \geq f_{\min} \cdot \mathbb{1}[I_{\text{crit}}(t)] > 0{% end %} whenever a critical failure is active. The Self-Throttling Law cannot silence the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop while a failure requiring response is present.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration**: {% katex() %}T_{\text{tick}} = 1\,\text{s}{% end %}, {% katex() %}f_{\min} = 0.5\,\text{Hz}{% end %}, {% katex() %}\alpha_{\text{floor}} = 0.5{% end %}, {% katex() %}R_{\text{floor}} = 0.05{% end %}. At \\(R = 0.10\\) (halfway between floor and {% katex() %}R_{\text{crit}} = 0.20{% end %}): \\(\alpha = 0.5\\), so {% katex() %}f_{\text{MAPE-K}} = 0.5\,\text{Hz}{% end %}. One avoided healing action at this resource level recovers \\(\approx 4\\,\text{s}\\) of {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} execution budget.

*Floor constraint: the self-throttling formula must not reduce MAPE-K execution frequency below {% katex() %}f_\text{min} = 1/T_\text{tick,max}{% end %} where \\(T_\text{tick,max}\\) is the maximum tolerable gap between autonomic observations for the current capability level. At the minimum viable monitoring frequency, the node can no longer adapt its behavior but retains the ability to detect entry into the Terminal Safety State. A node whose throttling formula would reduce frequency below \\(f_\text{min}\\) must instead enter the Observation Regime O\\(_4\\) sleep schedule rather than continuing sub-threshold MAPE-K execution.*

<span id="prop-37"></span>
**Proposition 37** (Weibull Circuit Breaker). *Under the Weibull partition duration model ({% term(url="@/blog/2026-01-15/index.md#def-13", def="Weibull Partition Duration Model: replaces the memoryless Markov model with Weibull-distributed sojourn times to capture the heavy tail of long blackouts") %}Definition 13{% end %}) and partition accumulator ({% term(url="@/blog/2026-01-15/index.md#def-15", def="Partition Duration Accumulator: contiguous time spent in the disconnected regime; resets on partition end; input to threshold adaptation and the Weibull Circuit Breaker") %}Definition 15{% end %}), when the partition duration accumulator {% katex() %}T_{\mathrm{acc}}{% end %} ({% term(url="@/blog/2026-01-15/index.md#def-15", def="Partition Duration Accumulator: contiguous time spent in the disconnected regime; resets on partition end; input to threshold adaptation and the Weibull Circuit Breaker") %}Definition 15{% end %} in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-15)) satisfies {% katex() %}T_{\mathrm{acc}}(t) \geq Q_{0.95}(k_\mathcal{N}, \lambda_\mathcal{N}){% end %}, the node immediately executes the following state transitions:*

*When a {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} partition hits the 95th-percentile duration, the system drops to survival mode and expects 17 more hours of denial — so it stops wasting battery on full-fidelity autonomics.*

{% katex(block=true) %}
\begin{aligned}
&(1)\; \mathcal{L}(t) \;\leftarrow\; \mathcal{L}_0 && \text{(capability floor: survival-only)} \\
&(2)\; f_{\text{MAPE-K}} \;\leftarrow\; f_{\min} && \text{(loop frequency floor, Proposition 36)} \\
&(3)\; k_\mathcal{N} \;\leftarrow\; \max(0.30,\; k_\mathcal{N} - \Delta k) && \text{(bandit arm shift: heavier-tail prior)} \\
&(4)\; T_{\mathrm{acc}} \;\leftarrow\; 0 \text{ on partition end} && \text{(recovery via standard capability ladder)} \\
&(5)\; K(t) \;\leftarrow\; \dfrac{\alpha_{\text{margin}}}{1 + \tau_{\text{circuit}} / T_{\text{tick}}} && \text{(gain reduction for Prop.\,9 stability;}\; \tau_{\text{circuit}} = 1/f_{\min})
\end{aligned}
{% end %}

> *Transitions (1)–(3) and (5) fire immediately when {% katex() %}T_{\mathrm{acc}} \geq Q_{0.95}{% end %}. Transition (4) fires on the subsequent partition-end event, at which point the node re-enters the standard capability ladder from {% katex() %}\mathcal{L}_0{% end %}.*

*Proof*: By the Weibull CDF, {% katex() %}P(T_\mathcal{N} > Q_{0.95}) = 1 - F(Q_{0.95}) = \exp(-(Q_{0.95}/\lambda_\mathcal{N})^{k_\mathcal{N}}) = \exp(-\ln 20) = 0.05{% end %}. A circuit breaker at {% katex() %}Q_{0.95}{% end %} therefore fires on at most 5% of partitions by construction — it is a rare, high-severity gate, not a routine transition.*

*Transition (1) is energetically justified by {% term(url="@/blog/2026-01-15/index.md#prop-1", def="Compute-Transmit Dominance Threshold: local computation is energetically cheaper than radio offloading for decisions requiring fewer than roughly one thousand compute cycles") %}Proposition 1{% end %}: suspending {% katex() %}\mathcal{L}_1{% end %}–{% katex() %}\mathcal{L}_4{% end %} autonomic overhead frees {% katex() %}\Delta R \geq 40{% end %} mW ({% term(url="#def-51", def="Autonomic Overhead Power Map: mapping from capability level to autonomic stack power consumption, showing where monitoring overhead exceeds healing benefit") %}Definition 51{% end %}), extending the survival window. The expected remaining partition duration at the circuit-breaker threshold — the **mean excess life** — is:*

{% katex(block=true) %}
\mathbb{E}[T_\mathcal{N} - Q_{0.95} \mid T_\mathcal{N} > Q_{0.95}] = \frac{1}{0.05} \int_{Q_{0.95}}^{\infty} S(t)\,dt, \qquad S(t) = \exp\!\left(-\!\left(\tfrac{t}{\lambda_\mathcal{N}}\right)^{\!k_\mathcal{N}}\right)
{% end %}

*For {% katex() %}k_\mathcal{N} = 0.62{% end %}: the mean excess life at {% katex() %}Q_{0.95} = 27.1{% end %} hr is approximately 17.4 hr — the system expects to remain denied for another 17 hours after the circuit breaker fires. Preserving {% katex() %}\mathcal{L}_0{% end %} resources for that duration is the correct response. \\(\square\\)*

> **Physical translation:** The circuit breaker fires when the partition has lasted longer than 95% of historically observed partitions for this environment. At that point, waiting for reconnection is statistically unlikely to succeed soon, and the system shifts to a lower-capability posture to conserve resources rather than continuing to hold state for a recovery that statistics say is not imminent.

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} application**: At mission hour 28 (27.1 hr into a sustained denied period), the circuit breaker fires on all 12 vehicles simultaneously. Formation maintains {% katex() %}\mathcal{L}_0{% end %} — heartbeat exchange, local threat detection, basic obstacle avoidance — while suspending collaborative route planning and distributed sensor fusion. When connectivity resumes, {% katex() %}T_{\mathrm{acc}}{% end %} resets and the capability ladder begins recovery from {% katex() %}\mathcal{L}_0{% end %} with standard gating.

> **Empirical status**: The \\(Q_{0.95} = 27.1\\) hr threshold and mean excess life of 17.4 hr are derived from Weibull parameters \\(k_N = 0.62\\), \\(\lambda_N = 10\\) hr calibrated to {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} mountain terrain; different terrain profiles, jamming intensities, or atmospheric conditions will shift these values and require per-deployment Weibull fitting from partition logs.

**State coordination at reconnection**: At reconnection, transition (4) resets \\(T_{\mathrm{acc}}\\) to zero, marking the start of a fresh partition-duration measurement window. The corresponding trust-window state in the fleet coherence layer (see [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md#def-61)) resumes from its current Hybrid Logical Clock value without reset — the HLC accumulates causal history monotonically and is not cleared by partition boundaries. These two state variables therefore evolve on independent clocks: \\(T_{\mathrm{acc}}\\) is a per-partition odometer that resets, while the HLC trust window is a global causal counter that does not.

**Interaction with {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} (Closed-Loop Stability)**: Transition (2) reduces {% katex() %}f_{\text{MAPE-K}}{% end %}, which increases the effective loop delay \\(\tau\\). By {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %}'s stability condition {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %}, the controller gain \\(K_{\text{ctrl}}\\) must be reduced in tandem with {% katex() %}f_{\text{MAPE-K}}{% end %}. The controller parameters stored in {% term(url="@/blog/2026-01-15/index.md#def-14", def="Adaptive Weibull Shape Parameter: bandit algorithm that tunes the Weibull shape parameter online from observed partition durations") %}Definition 14{% end %}'s bandit update (which also adjusts {% katex() %}k_\mathcal{N}{% end %}) jointly account for both the partition model and the control loop — the system self-calibrates under deep-survival conditions.

> **Physical translation**: Four simultaneous state transitions fire when the Weibull circuit breaker trips: capability drops to L0 (survival-only), MAPE-K frequency drops to {% katex() %}f_{\min}{% end %}, the bandit model shifts to a heavier-tailed prior (expecting longer partition durations), and the accumulator resets on recovery. The {% katex() %}k_\mathcal{N}{% end %} floor at 0.30 prevents the model from overcorrecting to an infinitely heavy tail — even after a very long partition, the system retains some expectation of eventual recovery.

**Chaos Validation**: {% term(url="#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %} defines a testable predicate; fault injection as a validation methodology is the basis of chaos engineering {{ cite(ref="14", title="Basiri et al. (2016) — Chaos Engineering") }}. Three injection scenarios exercise it across the Weibull parameter space:

*Micro-Burst* ({% katex() %}\text{Weibull}(k=1.2,\,\lambda=2\,\text{s}){% end %}): Rapid connectivity flapping with light-tailed, sub-minute bursts — simulating terrain edges and brief EW interference. Each partition ends before {% katex() %}T_{\mathrm{acc}}{% end %} can accumulate toward {% katex() %}Q_{0.95} \approx 5\,\text{s}{% end %}. *Pass criterion*: circuit breaker never fires; {% katex() %}T_{\mathrm{acc}}{% end %} resets cleanly after every recovery; the {% term(url="@/blog/2026-01-15/index.md#def-14", def="Adaptive Weibull Shape Parameter: bandit algorithm that tunes the Weibull shape parameter online from observed partition durations") %}Definition 14{% end %} bandit arm does not shift (zero normalized excess observed per partition).

*The Long Dark* ({% katex() %}\text{Weibull}(k=0.62,\,\lambda=10\,\text{hr}){% end %}): 72-hour sustained partition simulating complete satellite and mesh loss — terrain masking compounded by active EW. {% katex() %}Q_{0.95} \approx 59\,\text{hr}{% end %}; the circuit breaker fires at approximately hour 59. *Pass criteria*: (1) circuit breaker fires when {% katex() %}T_{\mathrm{acc}} \geq Q_{0.95}{% end %}; (2) {% katex() %}\mathcal{L}_0{% end %} capability maintained continuously through hour 72; (3) outbound queue depth bounded; (4) on reconnection, {% katex() %}T_{\mathrm{acc}}{% end %} resets and the capability ladder re-engages from {% katex() %}\mathcal{L}_0{% end %}.

*Asymmetric Link* (uplink loss \\(\geq 95\\%\\), downlink intact): Simulates one-way EW jamming — the node receives incoming traffic but cannot transmit telemetry or acknowledgements. No sojourn model applies; this tests regime classification accuracy and queue discipline under directional asymmetry. *Pass criterion*: regime classified as {% katex() %}\mathcal{I}{% end %} (Intermittent, not {% katex() %}\mathcal{C}{% end %}) within two gossip periods; \\(\theta^\*(t)\\) begins the partition-aware drift; the unacknowledged outbound queue remains memory-bounded.

> **Cognitive Map**: Dynamic Fidelity Scaling inverts the usual autonomy priority: the monitoring infrastructure throttles itself first, before the mission payload does. The five observation regimes (O4–O0) are defined by measured power draws from {% term(url="#def-51", def="Autonomic Overhead Power Map: mapping from capability level to autonomic stack power consumption, showing where monitoring overhead exceeds healing benefit") %}Definition 51{% end %}; the Self-Throttling Survival Gain ({% term(url="#prop-34", def="Self-Throttling Survival Gain: entering OBSERVE state extends survivable operating time proportional to the power differential between active and observe modes") %}Proposition 34{% end %}) shows that the L4-to-L0 throttle multiplier is \\(9.3\\times\\) — a \\(9\\times\\) difference in survival time from a single configuration decision. The Autonomic Overhead Paradox ({% term(url="#prop-35", def="Autonomic Overhead Paradox: at sufficiently low battery levels the monitoring stack costs more energy than the faults it prevents; OBSERVE mode resolves this") %}Proposition 35{% end %}) captures the essential tension: near the survival threshold, the MAPE-K loop is the proximate threat to survival, not the failure it was designed to catch. The Weibull Circuit Breaker ({% term(url="#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %}) automates this recognition — at the 95th-percentile partition duration, the system drops to L0 and expects another 17 hours of denied connectivity. Next: when the entire autonomic framework fails, a fixed terminal safety state handles the final fallback.

---

## Terminal Safety State

**Problem**: When the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop itself fails — heap exhausted, kernel panic, watchdog chain failure — the autonomic software cannot heal itself. Some response must exist that operates entirely without L1+ software involvement.

**Solution**: Define a fixed terminal safety state selected by L0 firmware as a function of remaining energy alone — no Analysis, no Planning, no Knowledge Base required. Three states (PLM, BOM, HSS) cover the range from weeks of passive listening to immediate hardware shutdown.

**Trade-off**: The terminal state is static and cannot adapt. A drone in BOM can transmit its position but cannot reason about whether that transmission is tactically safe. The price of zero software dependency is zero software intelligence.

The {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm's priority boundary — these components are repaired first") %}MVS{% end %} is the floor the healing algorithm defends. But the healing algorithm can itself fail — the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop may crash, its knowledge base may become corrupted, or its resource quota ({% katex() %}R_{\text{heal}}{% end %}) may be exhausted. Below {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} lies the {% term(url="#def-53", def="Operating mode entered when the entire autonomic framework has failed; selected by the base-tier hardware alone based on remaining energy; no higher-level software involvement") %}terminal safety state{% end %}: what the node does when all autonomy has been lost.

<span id="def-53"></span>
**Definition 53** (Terminal Safety State). *The {% term(url="#def-53", def="Operating mode entered when the entire autonomic framework has failed; selected by the base-tier hardware alone based on remaining energy; no higher-level software involvement") %}terminal safety state{% end %} {% katex() %}\mathcal{S}_\mathrm{term}{% end %}
is the operating mode the node enters when the entire autonomic framework — including the
{% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop and all its L1+ dependencies — has failed and cannot self-repair. It is selected
by L0 firmware as a function of remaining energy \\(E\\) alone:*

{% katex(block=true) %}
\mathcal{S}_\mathrm{term}(E) = \begin{cases}
\mathrm{PLM} & E > E_{\mathrm{PLM}} \\
\mathrm{BOM} & E_{\mathrm{HSS}} < E \leq E_{\mathrm{PLM}} \\
\mathrm{HSS} & E \leq E_{\mathrm{HSS}}
\end{cases}
{% end %}

> **Physical translation**: A three-row lookup table on a single measured value — remaining battery fraction \\(E\\). Above {% katex() %}E_{\text{PLM}}{% end %} (20%): passive listening, recoverable. Between thresholds: beacon-only, locatable. Below {% katex() %}E_{\text{HSS}}{% end %} (5%): full hardware shutdown, tamper-secure. The entire decision logic fits in five lines of C with no function calls and no external dependencies — this is the design constraint that makes it L0-implementable.

- **Use**: Maps remaining energy to a deterministic safety state (PLM, BOM, or HSS) at every Execute tick; fires immediately on threshold crossing and pre-empts all other actions to prevent uncontrolled shutdown with no state preservation or actuator parking.
- **Parameters**: PLM {% katex() %}\approx 20\%{% end %} battery; BOM {% katex() %}\approx 10\%{% end %}; HSS {% katex() %}< 5\%{% end %}; add {% katex() %}5\%{% end %} hysteresis band to each threshold.
- **Field note**: Hysteresis prevents dangerous thrashing — a drone oscillating in and out of HSS is more hazardous than one that stays in HSS.

*Three concrete states, ordered by endurance:*

- **PLM (Passive Listening Mode)**: Radio in receive-only mode; no transmissions; computation
  limited to hardware watchdog and energy monitor. Endurance: weeks. The node can receive a
  recovery command and re-initialize L1+ if the command arrives and power recovers.

- **BOM (Beacon-Only Mode)**: Periodic low-power position and status beacon at fixed interval
  {% katex() %}T_{\mathrm{beacon}}{% end %}; no processing beyond beacon scheduling. Endurance: days. Enables
  recovery teams to locate the node.

- **HSS (Hardware Safety Shutdown)**: All software subsystems powered off; only tamper-detection
  circuit and charge controller remain active. Endurance: battery lifetime. Appropriate when
  continued operation risks mission security (e.g., radio in a denied zone).

**Hardware prerequisite and applicability scope**: {% term(url="#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %} assumes the node has (1) a dedicated battery management IC (BMS IC) that exposes a real-time energy register readable by L0 firmware without L1+ involvement, (2) a hardware-controlled secure flash zeroization circuit triggered by a GPIO line from L0, and (3) a charge controller that can be commanded to cut load power while preserving BMS and tamper-circuit supply. These are standard on modern battery-powered edge nodes (DJI embedded controllers, Raspberry Pi CM4 with UPS HAT, custom tactical compute modules) but absent on most legacy industrial equipment (PLCs, RTUs, SCADA remotes). Applying {% term(url="#def-53", def="Terminal Safety State: stable configuration the system retreats to when all healing actions are exhausted, preserving core hardware from damage") %}Definition 53{% end %} to legacy hardware without these components results in a terminal state machine that cannot reliably reach HSS — the "energy register" does not exist, and "zeroization" requires L1+ firmware. For legacy brownfield systems, the {% term(url="#def-53", def="Operating mode entered when the entire autonomic framework has failed; selected by the base-tier hardware alone based on remaining energy; no higher-level software involvement") %}terminal safety state{% end %} reduces to a physical-layer action (pulling a relay that cuts main power), which is Tier 3 or Tier 4 of the Legacy Recovery Cascade ({% term(url="#def-56", def="Legacy Recovery Cascade: ordered recovery actions applied to a legacy node lacking native MAPE-K capability, executed by its cluster gateway") %}Definition 56{% end %}) rather than an autonomic software action.

**Threshold calibration**: {% katex() %}E_{\mathrm{PLM}}{% end %} and {% katex() %}E_{\mathrm{HSS}}{% end %} are platform-specific measured quantities, not default parameters. The {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} scenario ({% katex() %}E_{\mathrm{HSS}} = 5\%{% end %}, {% katex() %}E_{\mathrm{PLM}} = 20\%{% end %}) is derived as follows:

| Threshold | Requirement | Computation | RAVEN value |
| :--- | :--- | :--- | :--- |
| {% katex() %}E_{\mathrm{HSS}}{% end %} | Energy for one secure flash zeroization | 180 mJ measured at 3.7V; 5000 mAh battery: 5\% = 925 mJ; \\(5\times\\) margin | 5\% |
| {% katex() %}E_{\mathrm{PLM}}{% end %} | PLM endurance until recovery team (72h) at 2 mA draw | 72h \\(\times\\) 2 mA = 144 mAh (~3\%) + {% katex() %}E_{\mathrm{HSS}}{% end %} + \\(2\times\\) cold-battery margin | 20\% |

Calibration procedure for any platform: (1) measure secure shutdown energy at minimum operating temperature (worst case); (2) compute minimum PLM endurance from recovery SLA at maximum PLM draw; (3) add \\(2\times\\) margin for battery capacity reduction at minimum operating temperature (Li-Ion loses 30–61\% at {% katex() %}-20^\circ\mathrm{C}{% end %}); (4) verify {% katex() %}E_{\mathrm{PLM}} > E_{\mathrm{HSS}}{% end %} by at least 10 percentage points to avoid threshold ambiguity near the boundary.

*Critically, {% katex() %}\mathcal{S}_\mathrm{term}{% end %} selection must be implemented entirely within
L0 firmware — the transition logic must satisfy the {% term(url="@/blog/2026-01-15/index.md#def-18",
def="Structural constraint requiring that each capability level's runtime dependencies are confined to equal or lower levels; the base level has zero dependencies on any higher level") %}dependency isolation
requirement{% end %} ({% term(url="@/blog/2026-01-15/index.md#def-18", def="Dependency Isolation Requirement: each autonomic capability layer must fail independently without propagating failures to lower capability layers") %}Definition 18{% end %}): zero imports from L1+ code.*

<span id="prop-38"></span>
**Proposition 38** (Safety State Reachability). *For any system state \\(S\\) — including states
where all L1–L4 layers have crashed — {% katex() %}\mathcal{S}_\mathrm{term}{% end %} is reachable via L0
hardware operations alone:*

*Even when the entire MAPE-K stack has crashed, the hardware watchdog and L0 firmware can still select and enter the terminal safety state using only a battery level reading.*

{% katex(block=true) %}
\forall\, S \in \mathcal{S}_\mathrm{system} :\; \exists\; \text{path from } S
\text{ to } \mathcal{S}_\mathrm{term}\text{ using only } L_0 \text{ operations}
{% end %}

*Proof*: By {% term(url="@/blog/2026-01-15/index.md#def-18", def="Dependency Isolation Requirement: each autonomic capability layer must fail independently without propagating failures to lower capability layers") %}Definition 18{% end %}, L0 has no dependencies on L1+; therefore L0 remains operational when
all L1+ layers have failed. The {% term(url="#def-41", def="Hardware circuit that resets the processor if the software watchdog heartbeat stops within a defined interval") %}software watchdog
timer{% end %} ({% term(url="#def-41", def="Software Watchdog Timer: hardware-backed countdown triggering a safe-state transition if the autonomic control loop fails to check in within its configured timeout") %}Definition 41{% end %}) is implemented in dedicated hardware: it fires when the L1+
software stack stops issuing heartbeats, without requiring any L1+ cooperation. Upon watchdog
fire, L0 reads the energy register \\(E\\) and enters {% katex() %}\mathcal{S}_\mathrm{term}(E){% end %}. The
entire path — watchdog trigger, energy read, state entry — uses only hardware registers and L0
firmware. \\(\square\\)

**Multi-failure convergence**: When power degradation, connectivity partition, and sensor drift coincide simultaneously, the healing loop does not attempt to resolve all three in parallel. The priority ordering from {% term(url="#def-43", def="Resource Priority Matrix: table defining which resource classes preempt others during survival-mode shedding, preventing priority inversion under scarcity") %}Definition 43{% end %} (Resource Priority Matrix) applies: L0 hardware veto fires first (freezing actuators), MAPE-K shifts to diagnostic-only mode, and drift-compensation is suspended until power recovers above the L1 threshold ({% term(url="#prop-28", def="Priority Preemption Deadline Bound: under the Resource Priority Matrix, a tier-1 task preempts all lower tiers within at most one scheduling quantum") %}Proposition 28{% end %}, Priority Preemption Deadline Bound). The terminal safety state is reached within {% katex() %}t_{\text{reach}}{% end %} regardless of the failure combination order.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} scenario**: Drone 23's {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} process crashes mid-healing (heap exhausted by a runaway
recovery action). The L1+ watchdog daemon also fails (same heap). The hardware watchdog fires
after 500ms — the heartbeat window. L0 reads \\(E = 12\\%\\) (above {% katex() %}E_{\mathrm{HSS}} = 5\%{% end %},
below {% katex() %}E_{\mathrm{PLM}} = 20\%{% end %}) and enters BOM. The drone begins transmitting its position
beacon at 30-second intervals on the recovery frequency. The swarm's {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %} health protocol
({% term(url="@/blog/2026-01-22/index.md#def-24", def="Gossip Health Protocol: epidemic dissemination where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds") %}Definition 24{% end %}) marks Drone 23 as RECOVERY-BEACON and routes a cluster lead to attempt L1+
re-initialization via the BOM command channel. This is exactly the failure mode that Proposition
37 guarantees can be reached: from any state, regardless of which layers have failed.

> **Cognitive Map**: The terminal safety state is the non-negotiable floor below the MVS. Selected entirely by L0 firmware from battery level alone — no L1+ code path exists — it satisfies the Dependency Isolation Requirement ({% term(url="@/blog/2026-01-15/index.md#def-18", def="Dependency Isolation Requirement: each autonomic capability layer must fail independently without propagating failures to lower capability layers") %}Definition 18{% end %}) by construction. {% term(url="#prop-38", def="Safety State Reachability: Terminal Safety State is reachable from any system state in at most K healing steps where K is the healing severity scale depth") %}Proposition 38{% end %} guarantees reachability: from any system state, including one where every higher layer has crashed, L0 hardware operations can reach {% katex() %}\mathcal{S}_\text{term}{% end %}. The three-level structure (PLM \\(\to\\) BOM \\(\to\\) HSS) grades the response to remaining energy, preserving recovery potential as long as battery allows. Next: legacy hardware that predates autonomic APIs requires an Autonomic Gateway to participate in the MAPE-K loop at all.

---

## Autonomic Gateway

**Problem**: Legacy industrial equipment — 1990s generators, PLCs, motor controllers — predates autonomic APIs. These devices cannot report structured health metrics or accept remote restart commands, yet they must participate in {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} healing.

**Solution**: A software adapter (Autonomic Gateway) presents legacy hardware to the MAPE-K loop as if it were fully observable. It synthesizes health metrics from proxy signals (current draw, temperature, vibration) and maps healing commands onto physical actuation primitives (Modbus register writes, GPIO signals, relay closures).

**Trade-off**: Synthetic health metrics carry irreducible inference error. The MAPE-K Analyze phase must treat {% katex() %}\hat{h}_i \pm k\sigma_i{% end %} as the health estimate, not \\(\hat{h}_i\\) as ground truth — the gateway's uncertainty widens the effective anomaly detection threshold accordingly.

Most engineering analysis in this series assumes the managed hardware presents an observable health telemetry API — a process that responds to queries, emits structured health metrics, and accepts configuration commands. That assumption fails for legacy industrial equipment, embedded controllers, and tactical hardware designed before autonomic systems existed.

A 1990s diesel generator does not report its internal temperature. A legacy motor controller does not export a health vector. A cold-war-era radio does not accept remote restart commands. Yet these devices must participate in the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} healing loop — the system cannot simply exclude them because they lack a modern interface.

The **Autonomic Gateway** is a software adapter that presents legacy hardware to the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop as if it were a fully observable, API-driven system: it synthesizes health metrics from proxy signals, maps healing actions onto physical actuation primitives, and enforces cooldown and pre-condition constraints that the underlying hardware cannot enforce itself.

<span id="def-54"></span>
**Definition 54** (Autonomic Gateway). An *Autonomic Gateway* for a legacy hardware device \\(D\\) is a tuple {% katex() %}G = (H, O, \varphi, \mathcal{A}, \Gamma){% end %} where:

- {% katex() %}H = \{h_1, \ldots, h_m\}{% end %} is the set of *target health metrics* that the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} Monitor phase expects (e.g., temperature, fuel level, operational state)
- {% katex() %}O = \{o_1, \ldots, o_k\}{% end %} is the set of *observable proxy signals* physically accessible from the gateway controller (e.g., current draw, ambient temperature, vibration amplitude, exhaust flow)
- {% katex() %}\varphi : O \to H{% end %} is the *inference function* mapping observable proxies to health metric estimates; for each \\(h_i \in H\\), \\(\varphi_i(o)\\) yields a point estimate \\(\hat{h}_i\\) and uncertainty interval \\(\sigma_i\\)
- {% katex() %}\mathcal{A} = \{a_1, \ldots, a_p\}{% end %} is the set of *physical actuation primitives* the gateway can execute on \\(D\\) (e.g., Modbus register write, GPIO signal, relay close, power cycle) (calligraphic {% katex() %}\mathcal{A}{% end %} distinguishes the actuation set from scalar state variables)
- {% katex() %}\Gamma : \text{HealingAction} \to 2^{\mathcal{A}}{% end %} is the *actuation mapping* from {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} healing commands to ordered sequences of physical primitives, including pre-conditions, post-conditions, and cooldown requirements

The gateway presents \\((H, \Gamma(\cdot))\\) to the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop and hides {% katex() %}(O, \varphi, \mathcal{A}){% end %} as implementation details.

*Authority tier assignment: an Autonomic Gateway node holds authority tier {% katex() %}\mathcal{Q}_1{% end %} (cluster-scope) by default, unless explicitly provisioned to {% katex() %}\mathcal{Q}_2{% end %} (fleet-scope) during Phase-0 commissioning. Healing actions issued through a gateway carry the gateway's tier ceiling — a {% katex() %}\mathcal{Q}_1{% end %} gateway cannot authorize actions that would require {% katex() %}\mathcal{Q}_2{% end %} authority, even if the underlying legacy hardware is capable of executing them.*

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} generator example**: {% katex() %}H = \{\text{coolant\_temp}, \text{fuel\_level}, \text{op\_state}\}{% end %}. The generator has no telemetry port. The gateway observes current draw, ambient temperature, exhaust temperature, and vibration. The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop sees structured health reports and issues restart/shutdown commands; the gateway translates those commands into Modbus register writes and GPIO relay signals.

> **Physical translation**: The gateway is a translator: legacy hardware speaks voltages and Modbus registers; the MAPE-K loop speaks health vectors and healing commands. The gateway converts in both directions. Its inferred health metrics ({% term(url="#def-55", def="Synthetic Health Metric: fleet-level health score aggregated from individual node health vectors, used as the primary Autonomic Gateway interface signal") %}Definition 55{% end %}) are estimates with uncertainty bounds — the MAPE-K Analyze phase must treat them as {% katex() %}\hat{h} \pm k\sigma{% end %}, not as ground truth, or it will over-diagnose faults in legacy equipment that has no native health telemetry.

<span id="def-55"></span>
**Definition 55** (Synthetic Health Metric). A *synthetic health metric* {% katex() %}\hat{h} = \varphi_i(o_1, \ldots, o_k){% end %} is an inferred measurement of a device-internal quantity that the hardware does not report directly, derived from a physical model relating observable proxy signals to the target quantity.

For the {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} diesel generator, the gateway infers engine thermal state from an RC thermal circuit model. Let {% katex() %}P_\text{loss}(t) = V_\text{run} \cdot I(t) \cdot (1 - \eta){% end %} be the waste-heat power at time \\(t\\), where \\(I(t)\\) is measured current draw, {% katex() %}V_\text{run}{% end %} is nominal supply voltage, and \\(\eta\\) is mechanical efficiency. Engine temperature evolves as:

{% katex(block=true) %}
\hat{T}_\text{engine}(t) = T_\text{amb}(t) + R_\text{th} \cdot P_\text{loss}(t) \cdot \left(1 - e^{-s(t)/\tau_\text{th}}\right)
{% end %}

where {% katex() %}R_\text{th}{% end %} is thermal resistance, {% katex() %}\tau_\text{th}{% end %} is the thermal time constant, and \\(s(t)\\) is elapsed run time since the last cold start. Both {% katex() %}R_\text{th}{% end %} and {% katex() %}\tau_\text{th}{% end %} are calibrated once at commissioning by running the generator to thermal steady state while logging current draw and exhaust temperature.

**Model uncertainty**: \\(\varphi_i\\) carries irreducible estimation error {% katex() %}\sigma_i^2 = \sigma_\text{model}^2 + \sigma_\text{sensor}^2{% end %}, where {% katex() %}\sigma_\text{model}^2{% end %} is the model residual variance and {% katex() %}\sigma_\text{sensor}^2{% end %} is proxy sensor measurement noise. The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} Analyze phase must treat {% katex() %}\hat{h}_i \pm k\sigma_i{% end %} as the health estimate, not \\(\hat{h}_i\\) as a point truth.

> **Physical translation**: The diesel generator's internal temperature is not wired to any sensor the MAPE-K loop can read. This formula estimates it from current draw and run time. The estimate is unreliable during the first 30 seconds after cold start ({% katex() %}\sigma_T \approx 8^\circ\text{C}{% end %} versus a \\(5^\circ\text{C}\\) decision threshold) — the gateway signals "thermal state uncertain" and the MAPE-K loop withholds temperature-dependent decisions until the model warm-up period completes.

<span id="prop-39"></span>
**Proposition 39** (Gateway Signal Coverage Condition). *A gateway {% katex() %}G = (H, O, \varphi, \mathcal{A}, \Gamma){% end %} provides valid synthetic observability to the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop if and only if the following three conditions hold for every health metric \\(h_i \in H\\):*

*The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} diesel gateway cannot claim valid temperature observability unless its model bias is below the decision threshold, its inference completes within one monitoring window, and its uncertainty is within the anomaly detector's false-alarm budget.*

{% katex(block=true) %}
\begin{aligned}
(\text{Coverage})    &\quad \exists\;\varphi_i : O \to \hat{h}_i \;\text{ with }\; \mathbb{E}\!\left[|\hat{h}_i - h_i|\right] \leq \delta_i \\[4pt]
(\text{Timeliness})  &\quad T_\text{infer}(o \to \hat{h}_i) \leq T_\text{monitor} \\[4pt]
(\text{Uncertainty}) &\quad \sigma_i \leq \sigma_{\text{threshold},i}
\end{aligned}
{% end %}

*where \\(\delta_i\\) is the acceptable bias for metric \\(h_i\\), {% katex() %}T_\text{monitor}{% end %} is the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} monitor period, and {% katex() %}\sigma_{\text{threshold},i}{% end %} is the maximum uncertainty the anomaly detector can tolerate while maintaining its false-alarm guarantee (Prop 3).*

*Proof sketch*: If Coverage holds, the Analyze phase operates on a \\(\delta_i\\)-biased estimate, expanding the anomaly detection threshold by \\(k\delta_i\\). If Timeliness holds, the Monitor phase is not stale — inference completes within one monitoring window. If Uncertainty holds, the false-alarm rate of Prop 3 is preserved: substituting {% katex() %}\hat{h}_i \pm \sigma_i{% end %} into the threshold criterion expands the effective threshold by at most \\(k\sigma_i\\), which stays within the design margin when {% katex() %}\sigma_i \leq \sigma_{\text{threshold},i}{% end %}. If any condition fails, monitoring quality for that metric degrades to at most Heartbeat-Only (L0) level. \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration**: At commissioning, the thermal model achieves mean absolute error \\(3.2^\circ\text{C}\\) — below {% katex() %}\delta_T = 5^\circ\text{C}{% end %}. Inference runs in 2ms on the gateway ARM processor — below {% katex() %}T_\text{monitor} = 5\text{s}{% end %}. Cold-start uncertainty (first 30 seconds before {% katex() %}\tau_\text{th}{% end %} stabilizes) produces {% katex() %}\sigma_T = 8^\circ\text{C}{% end %}, exceeding {% katex() %}\sigma_\text{threshold} = 5^\circ\text{C}{% end %}: the gateway signals "thermal state uncertain" and the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} loop withholds temperature-dependent healing decisions until \\(s(t) > 30\text{s}\\).

> **Empirical status**: The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} calibration values ({% katex() %}\delta_T = 5^\circ\text{C}{% end %}, {% katex() %}\sigma_\text{threshold} = 5^\circ\text{C}{% end %}, 30 s cold-start window) are specific to this generator model and commissioning environment; different hardware, fuel composition, or ambient temperature range will produce different thermal time constants and uncertainty profiles requiring re-calibration.

*The autonomic loop invokes the recovery cascade under these ordered conditions: (1) MAPE-K attempt count for the current fault is below \\(N_\text{retry}\\) — retry at the next severity tier; (2) MAPE-K attempt count has reached \\(N_\text{retry}\\) and the action severity is \\(\leq\\) SEV\_3 — invoke the cascade; (3) action severity is SEV\_4 and {% katex() %}T_\text{acc} > T_\text{cascade}{% end %} — invoke the cascade with the override flag set, bypassing the attempt-count requirement.*

<span id="def-56"></span>
**Definition 56** (Legacy Recovery Cascade). A *Legacy Recovery Cascade* for hardware \\(D\\) is an ordered sequence of recovery tiers {% katex() %}\mathcal{T} = \langle T_1, T_2, T_3, T_4 \rangle{% end %}, where each tier \\(T_k\\) is a tuple {% katex() %}(\text{pre}_k, \text{act}_k, \text{post}_k, W_k, C_k){% end %}:

- {% katex() %}\text{pre}_k{% end %}: pre-condition predicate that must hold before \\(T_k\\) may execute
- {% katex() %}\text{act}_k{% end %}: the physical actuation sequence (ordered primitives from {% katex() %}\mathcal{A}{% end %})
- {% katex() %}\text{post}_k{% end %}: post-condition predicate verifying that the tier had effect
- \\(W_k\\): recovery observation window [s] — time to wait before evaluating {% katex() %}\text{post}_k{% end %}
- \\(C_k\\): cooldown period [s] — minimum time between successive invocations of tier \\(k\\)

The cascade executes tiers in order, advancing to {% katex() %}T_{k+1}{% end %} only if {% katex() %}\text{post}_k{% end %} evaluates false after \\(W_k\\) seconds.

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} generator cascade**:

| Tier | Action | Pre-condition | Post-condition | Window | Cooldown |
| :--- | :--- | :--- | :--- | ---: | ---: |
| \\(T_1\\) | Modbus soft reset | Link up; engine below \\(90^\circ\text{C}\\) | Op state = RUNNING within 30s | 30s | 60s |
| \\(T_2\\) | Controlled stop then start (GPIO) | Engine below \\(70^\circ\text{C}\\); at least 60s since \\(T_1\\) | Current resumes baseline \\(\pm 10\\) A | 45s | 300s |
| \\(T_3\\) | Full power cycle via relay | At least 5 min since \\(T_2\\); fuel above 20% | Op state = RUNNING and current above 0 | 60s | 900s |
| \\(T_4\\) | Human escalation | All prior tiers failed; mission at or below BOM threshold | Operator acknowledged | — | — |

> **Physical translation**: Try the softest fix first. If it fails after \\(W_1\\) seconds, wait out cooldown \\(C_1\\) and escalate. The cascade halts when something works or when it reaches the human-in-the-loop step. Pre-conditions exist because a hot restart can permanently damage certain hardware — the cascade respects the generator's physics, not the MAPE-K loop's impatience. Skipping straight to the aggressive fix is not faster; it risks making the hardware unrecoverable.

<span id="prop-40"></span>
**Proposition 40** (Recovery Cascade Correctness). *Let {% katex() %}D_\text{recovery}{% end %} be the deadline by which the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute with Knowledge Base; the four-phase autonomic control loop enabling self-healing without central coordination") %}MAPE-K{% end %} healing loop must restore \\(D\\) to an operational state. The Legacy Recovery Cascade {% katex() %}\mathcal{T}{% end %} satisfies the healing deadline ({% term(url="#prop-21", def="Healing Deadline: healing must complete within the failure window minus a safety buffer; if no action fits the window, escalate to a faster intervention") %}Proposition 21{% end %}) if:*

*An {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} generator cascade through all three tiers takes at most 23 minutes — well within the 90-minute MVS backup-power requirement — even if the generator is hot at failure.*

{% katex(block=true) %}
\sum_{k=1}^{K^*} \left(W_k + C_k + t_{\text{act},k}\right) \leq D_\text{recovery}
{% end %}

- **Use**: Bounds total cascade duration as the sum of wait, convergence, and actuation times across {% katex() %}K^*{% end %} stages; validate each stage against this bound via fault injection to prevent cascade hang when any stage blocks indefinitely on a failed subsystem.
- **Parameters**: {% katex() %}D_{\text{recovery}} = T_{\text{heal}} - T_{\text{margin}}{% end %} ({% term(url="#prop-21", def="Healing Deadline: upper bound on time-to-resolution for healing actions of given severity, derived from MAPE-K tick rate and action queue depth") %}Proposition 21{% end %}); {% katex() %}K^*{% end %} = number of cascaded recovery stages in the dependency graph.
- **Field note**: Each stage needs a hard timeout — an unhardened stage waiting on a failed dependency is the single most common cascade failure mode.

*where \\(K^\*\\) is the highest tier that must be attempted before declaring the device failed, and {% katex() %}t_{\text{act},k}{% end %} is the actuation duration of tier \\(k\\). Additionally, the thermal pre-condition {% katex() %}\hat{T}_\text{engine} < T_{\max,k}{% end %} must hold at each tier boundary; if violated, the cascade suspends until the thermal model predicts cooling below the threshold. Thermal suspension has a maximum duration of {% katex() %}T_{\text{thermal,max}} = 2 \times T_{\text{cooldown,nominal}}{% end %}. If the thermal pre-condition {% katex() %}\hat{T}_{\text{engine}} < T_{\max,k}{% end %} is not satisfied within \\(T_{\text{thermal,max}}\\), the cascade advances to the next lower tier regardless — bypassing the pre-condition check and logging a thermal-override event. This prevents indefinite suspension at ambient temperatures above the asymptotic cooling limit.*

*Proof*: By induction on tier index. Base: \\(T_1\\) executes if {% katex() %}\text{pre}_1{% end %} holds and completes in {% katex() %}t_{\text{act},1} + W_1{% end %}. Inductive step: if \\(T_k\\) fails ({% katex() %}\text{post}_k{% end %} is false), the cascade advances to {% katex() %}T_{k+1}{% end %} after cooldown \\(C_k\\). Total elapsed time at tier \\(K^\*\\) is {% katex() %}\sum_{k=1}^{K^*}(t_{\text{act},k} + W_k + C_k){% end %}. Deadline satisfaction follows. The thermal suspension is correct: a hot restart at {% katex() %}\hat{T}_\text{engine} > 90^\circ\text{C}{% end %} risks mechanical seizure, converting a recoverable fault into permanent failure. \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} worst case**: {% katex() %}D_\text{recovery} = 90{% end %} min ({% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} requirement: backup power within 90 minutes of primary failure). Attempting \\(T_1 \to T_2 \to T_3\\) in sequence: {% katex() %}(30+60) + (45+300) + (60+900) = 1395\text{s} = 23.25{% end %} min — well within the deadline. If the generator is hot at failure ({% katex() %}\hat{T}_\text{engine} = 92^\circ\text{C}{% end %}), the cascade suspends \\(T_1\\) and \\(T_2\\) until cooling. Using the thermal model, cooldown from \\(92^\circ\text{C}\\) to \\(70^\circ\text{C}\\) at ambient \\(30^\circ\text{C}\\):

{% katex(block=true) %}
t_\text{cool} = \tau_\text{th} \cdot \ln\!\left(\frac{92 - 30}{70 - 30}\right) \approx 1800 \cdot \ln(1.55) \approx 756\;\text{s} \approx 12.6\;\text{min}
{% end %}

Total cascade time with thermal wait: \\(12.6 + 23.25 = 35.85\\) min — still within the 90-minute deadline, but consuming 40% of the available budget, leaving limited margin if \\(T_3\\) also fails.

> **Empirical status**: The {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} cascade timing values (\\(W_k\\), \\(C_k\\), thermal cooldown constant {% katex() %}\tau_{\text{th}} = 1800\,\text{s}{% end %}) are specific to this generator hardware and commissioning measurements; each tier's window and cooldown must be validated by fault injection on the actual hardware at operating temperature extremes.

*(Adaptive gain scheduling under GPS-denied navigation and cascade thermodynamics under sustained high-temperature jamming remain open problems outside the scope of this article.)*

> **Cognitive Map**: The Autonomic Gateway makes legacy hardware MAPE-K-compatible without modifying the hardware. The three-condition Signal Coverage Proposition (47) bounds when synthetic observability is valid: bias within \\(\delta_i\\), inference within one monitoring window, uncertainty within the false-alarm budget. When any condition fails, that metric degrades to L0 observability only. The Legacy Recovery Cascade ({% term(url="#def-56", def="Legacy Recovery Cascade: ordered recovery actions applied to a legacy node lacking native MAPE-K capability, executed by its cluster gateway") %}Definition 56{% end %}) provides the action side: an ordered tier sequence with pre-conditions, post-conditions, cooldowns, and thermal suspension guards — ensuring the cascade respects the generator's operating constraints rather than the MAPE-K loop's impatience. Next: even without legacy hardware, simultaneous healing actions can overwhelm shared resources — cascade prevention addresses this.

---

## Cascade Prevention

**Problem**: Healing consumes the same resources — CPU, bandwidth, power — needed for normal operation. When multiple healing actions trigger simultaneously, resource contention prevents any from completing. The system degrades further during healing than before.

**Solution**: Reserve a fixed fraction of resources for healing (quota {% katex() %}\alpha_{\text{heal}} \approx 0.2{% end %}), prioritize by MVS tier and resource efficiency, and spread simultaneous post-partition restarts using random jitter and staged waves.

**Trade-off**: A healing resource quota means some healing actions are queued even when the failure is serious. Queueing bounds the resource spike but adds latency before the queued healing fires — a deliberate exchange of healing speed for system stability.

### Resource Contention During Recovery

Healing consumes the resources needed for normal operation:
- **CPU**: {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} analysis, action planning, coordination
- **Memory**: Healing state, candidate solutions, rollback buffers
- **Bandwidth**: {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}Gossip{% end %} for healing coordination, status updates
- **Power**: Additional computation and communication

When multiple healing actions execute simultaneously, resource contention can prevent any from completing. The system becomes worse during healing than before.

**Healing resource quotas**: Reserve a fixed fraction of resources for healing. Healing cannot exceed this quota even if more problems are detected.

{% katex(block=true) %}
R_{\text{heal}} \leq \alpha_{\text{heal}} \cdot R_{\text{total}}, \quad \alpha_{\text{heal}} \approx 0.2
{% end %}

*({% katex() %}\alpha_{\text{heal}} \approx 0.2{% end %}: healing budget fraction, distinct from {% katex() %}\alpha_{\text{margin}}{% end %} and {% katex() %}\alpha_{\text{EMA}}{% end %} above.)*

If healing demands exceed quota, prioritize by severity and queue the remainder.

**Prioritized healing queue**: When multiple healing actions are needed, order by:
1. Impact on {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} (critical components first)
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

**Jittered restarts**: Each node draws a random delay uniformly from {% katex() %}[0, T_{\text{jitter}}]{% end %} and waits that long after the partition ends before initiating its healing sequence, spreading simultaneous arrivals across the jitter window.

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

After action at level \\(k\\), wait {% katex() %}t_{\text{wait}}(k){% end %} before concluding it failed and escalating to level \\(k+1\\).

**Multi-armed bandit formulation**: Each healing action is an "arm" with unknown success probability. The healing controller must explore (try different actions to learn effectiveness) and exploit (use actions known to work).

The Upper Confidence Bound ({% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}) [Auer et al., 2002b] algorithm provides optimal exploration-exploitation tradeoff:

{% katex(block=true) %}
\text{UCB}(a) = \hat{p}_a + c\sqrt{\frac{\ln t}{n_a}}
{% end %}

where \\(\hat{p}_a\\) is the estimated success probability for action \\(a\\), \\(n_a\\) is the attempt count for action \\(a\\), and \\(t\\) is total attempts across all actions. The exploration bonus {% katex() %}c\sqrt{\ln t / n_a}{% end %} grows for under-tried actions, ensuring eventual exploration.

*Derivation*: The exploration term follows from Hoeffding's inequality. For a random variable bounded in \\([0,1]\\), {% katex() %}P(|\hat{p} - p| > \epsilon) \leq 2e^{-2n\epsilon^2}{% end %}. Setting {% katex() %}\epsilon = c\sqrt{\ln t / n}{% end %} yields confidence that scales appropriately with sample count.

Select the action with highest {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}. This naturally balances known-good actions with under-explored alternatives.

**Regret bound**: {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} achieves {% katex() %}R_T = O(\sqrt{KT \ln T}){% end %} where \\(K\\) is the number of actions and \\(T\\) is episodes. For {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} with \\(K = 6\\) healing actions over \\(T = 100\\) episodes, expected regret is bounded by \\(\sim 53\\) suboptimal decisions—the system converges to near-optimal healing policy within the first deployment month.

---

## Model Scope and Failure Envelope

**Problem**: Every analytical guarantee in this post rests on assumptions — linear dynamics, constant delay, stationary reward distributions. Real systems violate these. Deploying these mechanisms without understanding their validity domain produces unexpected failures.

**Solution**: For each mechanism, enumerate its assumptions, the failure mode when each assumption is violated, the observable detection signal, and a concrete mitigation. The validity domain is not a footnote — it is the primary engineering decision.

**Trade-off**: Assumption validation requires measurement infrastructure. The cost of knowing when you are outside the validity domain is instrumentation that itself consumes resources and adds complexity.

Each mechanism has bounded validity. When assumptions fail, so does the mechanism.

### MAPE-K Stability Analysis

**Validity Domain**:

The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} stability analysis holds only when the system state \\(S\\) satisfies all three assumptions simultaneously; violations narrow or eliminate the domain within which {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %} guarantees stability.

{% katex(block=true) %}
\mathcal{D}_{\text{MAPE-K}} = \{S \mid A_1 \land A_2 \land A_3\}
{% end %}

where:
- \\(A_1\\): System dynamics are approximately linear near operating point
- \\(A_2\\): Feedback delay \\(\tau\\) is approximately constant
- \\(A_3\\): No nested feedback loops (healing action does not affect its own sensing)

**Stability Criterion**: {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %} ensures stability under discrete-time proportional control.

The following table maps each assumption violation to its observable symptom, how to detect it, and a concrete engineering mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Nonlinear dynamics | Oscillation at large perturbations | Amplitude exceeds linear regime | Gain scheduling; saturation limits |
| Variable delay | Unpredictable oscillation | Delay variance high | Robust controller design |
| Nested feedback | Instability; runaway | Correlation between action and sensor | Decouple sensing from action |

**Counter-scenario**: A healing action that restores a sensor affects the very metric being monitored (e.g., restarting a process causes temporary CPU spike). The stability analysis assuming independent sensing does not apply. Detection: correlation coefficient between healing actions and subsequent sensor anomalies exceeds 0.5.

### UCB Action Selection

**Validity Domain**:

{% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}'s regret bound {% katex() %}O(\sqrt{TK \ln T}){% end %} holds only when the reward distribution is stable and actions can be safely retried; the validity domain captures these preconditions formally.

{% katex(block=true) %}
\mathcal{D}_{\text{UCB}} = \{S \mid B_1 \land B_2 \land B_3\}
{% end %}

where:
- \\(B_1\\): Reward distribution is stationary over learning horizon
- \\(B_2\\): Actions are repeatable (can try same action multiple times)
- \\(B_3\\): Rewards are bounded in \\([0, 1]\\)

**Regret Bound**: {% katex() %}O(\sqrt{TK \ln T}){% end %} holds under stated assumptions.

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

Contextual bandits extend {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} by selecting the action that maximizes a linear reward estimate \\(\theta_a^T x\\) for the current context vector \\(x\\), plus a confidence-weighted exploration bonus that is large when the covariance {% katex() %}A_a^{-1}{% end %} indicates the action is under-explored in this region of the context space.

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

> **Read the diagram**: The context vector (6 features including anomaly score 0.85, connectivity 0.67, cluster health 0.9) flows into the LinUCB policy, which scores each action with its UCB value. Reconfigure (a2) wins with 0.81 — higher than Restart (0.72) because prior successes in this context shifted its \\(\theta\\) estimate upward. The selected action is executed, and only that action's \\(\theta\\) and A matrices update — all other arms are unchanged. This per-arm update is why LinUCB requires only \\(O(d^2)\\) storage per arm regardless of episode count.

**Sample efficiency**: LinUCB's regret bound {% katex() %}O(d\sqrt{T \ln T}){% end %} scales with feature dimension \\(d\\) rather than action count \\(K\\), providing better sample efficiency when \\(d < K\\). Context features enable generalization—a healing action effective for high-severity failures can be immediately applied to new high-severity failures without re-exploration.

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

> **Read the diagram**: State (32 features) and history (last 5 states) both enter the same embedding layer (compresses to 16), which feeds the LSTM (processes the temporal sequence, outputs 32). The LSTM output then branches: the blue policy head produces action probabilities (K outputs — the actor); the orange value head produces a single scalar estimate of expected future reward (the critic). The LSTM is why this architecture can recognize patterns like "this same service has crashed three times in the last 5 minutes" — temporal structure the policy head then exploits.

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

where {% katex() %}r_t(\theta) = \pi_\theta(a_t|s_t) / \pi_{\theta_{\text{old}}}(a_t|s_t){% end %} is the probability ratio and \\(A_t\\) is the advantage estimate.

**Model size for edge**:
- State embedding: \\(32\times16 = 512\\) parameters
- LSTM: {% katex() %}4\times(16+32)\times32 = 6{,}144{% end %} parameters
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
| Fixed rules | \\(\Omega(T)\\) (linear) | N/A | {% katex() %}p_{\text{best rule}}{% end %} |
| UCB bandit | {% katex() %}O(\sqrt{KT \ln T}){% end %} | \\(O(K^2/\epsilon^2)\\) | {% katex() %}1 - O(1/\sqrt{T}){% end %} |
| LinUCB | {% katex() %}O(d\sqrt{T \ln T}){% end %} | \\(O(d^2/\epsilon^2)\\) | {% katex() %}1 - O(d/\sqrt{T}){% end %} |
| PPO | {% katex() %}O(1/\sqrt{T}){% end %} | \\(O(1/\epsilon^2)\\) | {% katex() %}\to \pi^*{% end %} (optimal) |

**Utility ordering derivation**: Let {% katex() %}U_i = \sum_t r_t^{(i)}{% end %} be cumulative reward for method \\(i\\).

{% katex(block=true) %}
U_{\text{PPO}} > U_{\text{LinUCB}} > U_{\text{UCB}} > U_{\text{fixed}}
{% end %}

follows from tighter regret bounds and context-awareness. PPO's policy gradient exploits state structure; LinUCB exploits linear reward structure; {% term(url="@/blog/2026-02-12/index.md#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} exploits only action averages; fixed rules have no adaptation.

**Model-Based RL for Sample Efficiency**

Edge systems have limited failure data. Model-based RL learns a dynamics model {% katex() %}\hat{s}_{t+1} = f_\psi(s_t, a_t){% end %} and plans using it, enabling policy improvement from synthetic rollouts without requiring many real failures. For {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}, where sensor failures occur roughly once per 30 days, the model is initialized from similar deployments, updated after each real failure, and then used to generate 100+ synthetic rollouts for policy improvement—reducing real-world sample requirements substantially relative to model-free approaches.

**Safe Reinforcement Learning with Constraints**

Healing actions have constraints: power budget, time limits, safety requirements. Unlike unconstrained RL, Safe RL finds the policy \\(\pi\\) that maximizes discounted cumulative reward while simultaneously keeping the discounted cumulative cost of each constraint \\(i\\) below its threshold \\(d_i\\), so that power, cascade risk, and time violations are penalized structurally rather than through a hand-tuned reward term.

{% katex(block=true) %}
\max_\pi \mathbb{E}\left[\sum_t \gamma_{\text{rl}}^t R(s_t, a_t)\right] \quad \text{subject to} \quad \mathbb{E}\left[\sum_t \gamma_{\text{rl}}^t C_i(s_t, a_t)\right] \leq d_i \quad \forall i
{% end %}

where \\(C_i\\) are cost functions, \\(d_i\\) are constraint thresholds, and {% katex() %}\gamma_{\text{rl}} \in [0,1){% end %} is the RL discount factor.

**Constraint types for edge healing**:

The table maps each operational constraint to its cost function \\(C_i\\) and the threshold \\(d_i\\) that CPO must not exceed.

| Constraint | Cost Function | Threshold |
| :--- | :--- | :--- |
| Power budget | Energy consumed by healing | 10% of battery |
| Cascade risk | P(healing causes secondary failure) | 5% |
| Time bound | Recovery duration | 5 minutes |
| Service level | Capability degradation during healing | \\(\mathcal{L}_1\\) minimum |

**Constrained Policy Optimization (CPO)**:

Each CPO policy update finds the parameter {% katex() %}\theta_{k+1}{% end %} that maximizes the objective \\(L(\theta)\\) subject to two constraints: the KL divergence from the old policy must not exceed \\(\delta_\text{KL}\\) (keeping updates small), and the expected cumulative cost of every constraint \\(i\\) must remain at or below its threshold \\(d_i\\).

{% katex(block=true) %}
\theta_{k+1} = \arg\max_\theta L(\theta) \quad \text{s.t.} \quad D_{\text{KL}}(\pi_\theta || \pi_{\theta_k}) \leq \delta_\text{KL}, \quad J_{C_i}(\pi_\theta) \leq d_i
{% end %}

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} safe healing example**:

Drone healing must not deplete battery below safe return threshold. CPO learns to:
- Prefer low-energy healing actions (reconfigure > reboot)
- Delay healing if battery is marginal
- Accept slightly lower success rate to preserve energy margin

The utility loss \\(\Delta U\\) of using CPO instead of the unconstrained policy equals the Lagrange multiplier \\(\lambda^\*\\) multiplied by how much the unconstrained policy would have exceeded the constraint threshold \\(d\\), quantifying the cost of the safety guarantee.

{% katex(block=true) %}
\Delta U = U_{\text{CPO}} - U_{\text{unconstrained}} = -\lambda^* \cdot (d - J_C(\pi^*_{\text{unc}}))
{% end %}

where \\(\lambda^\*\\) is the optimal Lagrange multiplier. CPO trades a lower success rate for a hard constraint-satisfaction guarantee: it never violates constraints by construction, while the unconstrained policy violates them with probability \\(\epsilon_C > 0\\).

{% katex(block=true) %}
P(\text{CPO violates}) = 0, \quad P(\text{unconstrained violates}) = \epsilon_C > 0
{% end %}

{% katex() %}\text{sign}(\Delta U) < 0{% end %} but bounded: the constraint guarantee has value {% katex() %}V_{\text{constraint}}{% end %} such that total utility {% katex() %}U_{\text{CPO}} + V_{\text{constraint}} > U_{\text{unconstrained}}{% end %} when constraint violation is catastrophic.

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

> **Read the diagram**: Three tiers shown top-to-bottom. The blue Fleet Healer makes coarse decisions ("heal cluster 1, monitor cluster 2"). The orange Cluster Healer receives that directive and makes mid-level decisions ("heal node 3"). The green Node Healer receives the node-level assignment and picks the specific healing action. Each tier solves a simpler problem than the full joint optimization would require, and low-level policies can be reused across deployments with the same node-level healing action set.

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

Learning from scratch to \\(\epsilon\\)-optimality requires \\(O(|S||A|/\epsilon^2)\\) samples — proportional to the full state-action space — while transfer learning from a related source policy reduces this to {% katex() %}O(d_{\text{diff}}/\epsilon^2){% end %}, where {% katex() %}d_{\text{diff}}{% end %} is the \\(L_1\\) distance between source and target transition dynamics.

{% katex(block=true) %}
N_{\text{scratch}} = O\left(\frac{|S||A|}{\epsilon^2}\right), \quad N_{\text{transfer}} = O\left(\frac{d_{\text{diff}}}{\epsilon^2}\right)
{% end %}

where {% katex() %}d_{\text{diff}} = \|P_{\text{target}} - P_{\text{source}}\|_1{% end %} is the domain difference.

The table below shows how domain similarity translates into concrete sample savings: the closer the source and target dynamics, the smaller {% katex() %}d_{\text{diff}}{% end %}, and the larger the fraction of training samples that transfer replaces.

| Target | Domain Diff {% katex() %}d_{\text{diff}}{% end %} | Complexity Ratio | Sample Reduction |
| :--- | :--- | :--- | :--- |
| Similar (e.g., drone-to-drone) | \\(O(0.1)\\) | \\(O(0.1)\\) | \\(\approx 90\\%\\) |
| Related (e.g., drone-to-vehicle) | \\(O(0.3)\\) | \\(O(0.3)\\) | \\(\approx 70\\%\\) |
| Distant (e.g., drone-to-building) | \\(O(0.5)\\) | \\(O(0.5)\\) | \\(\approx 50\\%\\) |

{% katex() %}\text{sign}(\Delta N) < 0{% end %} (transfer reduces samples) when {% katex() %}d_{\text{diff}} < |S||A|{% end %}—i.e., when source and target share structure.

**Meta-Learning for Rapid Adaptation**: MAML trains an initialization \\(\theta^\*\\) across diverse healing scenarios so that the policy can fine-tune to a new scenario in 5-10 episodes rather than 100+. This is essential for novel deployments where collecting large amounts of real healing experience is impractical before the system must operate.

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

> **Cognitive Map**: Cascade prevention is the meta-discipline of the healing system: ensuring that the act of healing does not produce new failures. Three mechanisms work in concert — resource quotas cap total healing load at {% katex() %}\alpha \leq 0.2{% end %} of capacity; jittered restarts spread the thundering herd across {% katex() %}T_{\text{jitter}}{% end %}; staged recovery reduces completion-time variance by \\(1/k\\). UCB and contextual bandits then take over from the deterministic policies: as healing episode counts grow, the system learns which action works in which context, progressively refining the probability estimates that underlie {% term(url="#prop-29", def="Optimal Confidence Threshold: anomaly classification threshold minimizing expected misclassification cost under time-varying false-negative cost escalation") %}Proposition 29{% end %}'s confidence threshold. Offline pretraining, simulation fine-tuning, and conservative online updates compose the lowest-risk RL deployment path for edge systems with sparse real failure data.

---

## RAVEN Self-Healing Protocol

**Problem**: Drone 23 has 8 minutes of battery remaining mid-mission in contested airspace. No human operator is available. The 47-drone swarm must decide: compress formation, extract the drone, or continue with reduced coverage — all without central coordination.

**Solution**: The cluster lead evaluates expected mission value for each option subject to a catastrophic-probability constraint, broadcasts the plan within one gossip convergence window, and executes the coordinated maneuver within 8 seconds of acknowledgement.

**Trade-off**: Coverage preservation and asset recovery conflict directly. The framework selects the option that maximizes expected mission value. But that selection depends on the value assigned to the drone relative to the mission — a parameter pre-set by mission planners, not computed at the moment of crisis.

Return to Drone 23's battery failure. How does the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm heal?

### Healing Decision Analysis

Drone 23's battery alert propagates via {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}. Within 15 seconds, all swarm members know Drone 23's status. Each drone's local analyzer assesses impact: Drone 23 will fail in 8 minutes; if it fails in place, a coverage gap opens on the eastern sector with potential crash in contested area; if it returns, neighbors must expand coverage.

Cluster lead (Drone 1) selects the optimal action by evaluating expected mission value for each alternative:

{% katex(block=true) %}
a^* = \arg\max_a E[V | a] \quad \text{subject to} \quad P(\text{catastrophic} | a) < \epsilon
{% end %}

The trade-off is **coverage preservation against asset recovery**. Compression maintains formation integrity but sacrifices coverage area. Return to base preserves the drone but requires neighbor expansion. **Proactive extraction dominates passive observation** when asset value exceeds the coverage loss—get the degraded asset out rather than watching it fail in place.

The cluster lead broadcasts the healing plan. Within one second, neighbors acknowledge sector expansion and Drone 23 acknowledges its return path. Formation adjustment completes in roughly 8 seconds. Drone 23 departs, neighbors restore coverage to {% katex() %}\mathcal{L}_2{% end %}, and twelve minutes later Drone 23 reports safe landing at base.

### Healing Coordination Under Partition

What if the swarm is partitioned during healing?

Scenario: Seconds into coordination, jamming creates partition. Drones 30-47 (eastern cluster) cannot receive healing plan.

Fallback protocol:
1. Eastern cluster detects loss of contact with Drone 1 (cluster lead)
2. Drone 30 assumes local lead role for eastern cluster
3. Drone 30 independently detects Drone 23's status from cached {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}
4. Eastern cluster executes local healing plan (may differ from western cluster's plan)

Post-reconnection reconciliation compares healing logs from both clusters, verifies formation consistency, and merges any conflicting state using commutative, associative, idempotent merge operations—ensuring that applying updates in any order produces the same final state.

### Edge Cases

**What if neighbors also degraded?**

If Drones 21, 22, 24, 25 all have elevated failure risk, they cannot safely expand coverage. The healing plan must account for cascading risk.

Before accepting any healing plan, the system checks joint stability: all affected nodes must remain healthy throughout the healing window, so the probability of a stable outcome is the product of each individual node's health probability across the affected set {% katex() %}\text{affected}{% end %}.

{% katex(block=true) %}
P(\text{healing stable}) = \prod_{i \in \text{affected}} P(\text{node } i \text{ healthy during healing})
{% end %}

If {% katex() %}P(\text{healing stable}) < 0.8{% end %}, reject the healing plan and try alternative (perhaps Option C compression).

**What if path home is contested?**

Drone 23's return route passes through adversarial coverage. Risk of intercept during return.

Solution: Incorporate threat model into path planning. Choose return route that minimizes {% katex() %}P(\text{intercept}) \cdot C(\text{loss}){% end %}. Accept longer route if safer.

> **Cognitive Map**: RAVEN healing is a live demonstration of every mechanism in this post: gossip propagation delivers Drone 23's status to all 47 nodes within 15 seconds; the cluster lead applies the expected-utility formula subject to catastrophic-probability constraint; confidence thresholds determine whether to act or wait; the joint stability check filters healing plans that would create secondary failures. Partition during healing is handled gracefully — each cluster acts on its local information, logs causally-ordered actions, and reconciles divergences on reconnection. The eastern cluster's independent decision is not a failure of the protocol; it is the protocol working as designed.

---

## CONVOY Self-Healing Protocol

**Problem**: Vehicle 4 has engine failure in a mountainous contested zone. Four options are available (repair, bypass, tow, redistribute+abandon) each with different mission, safety, and resource implications. The optimal choice is state-dependent and changes as terrain, threat, and cargo priority evolve.

**Solution**: Model the problem as an MDP with a multi-objective reward function. The optimal policy is computed offline for each combination of convoy state, distance, and threat environment — producing a lookup table of state-dependent decisions rather than requiring online optimization during crisis.

**Trade-off**: The MDP transition probabilities come from operational logs. A novel failure mode with no historical analogues produces unreliable estimates. Conservative defaults should be pre-configured for failure types with fewer than 10 prior observations.

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

**State space structure**: {% katex() %}S = \mathcal{C} \times \mathcal{D} \times \mathcal{T}{% end %} where:
- {% katex() %}\mathcal{C}{% end %} = convoy configuration (intact, degraded, towing, stopped)
- {% katex() %}\mathcal{D}{% end %} = distance remaining to objective
- {% katex() %}\mathcal{T}{% end %} = threat environment (permissive, contested, denied)

**Action space**: {% katex() %}A = \{\text{repair, bypass, tow, abandon}\}{% end %}

The transition dynamics \\(P(s\' | s, a)\\) encode operational realities: field repair success rates, secondary failure probabilities from towing stress, and recovery likelihood for bypassed assets.

*Example transition matrix* for action "tow" from state "degraded":

| Next State | Probability | Operational Meaning |
|:-----------|:------------|:--------------------|
| towing | 0.75 | Tow successful, convoy proceeds |
| stopped | 0.15 | Tow hookup fails, convoy halts |
| degraded | 0.08 | Vehicle refuses tow, status quo |
| intact | 0.02 | Spontaneous recovery (rare) |

These probabilities are estimated from operational logs and updated via Bayesian learning as the convoy gains experience.

The reward function combines four weighted terms: mission completion value {% katex() %}V_{\text{mission}}{% end %} minus time cost, asset loss cost, and security risk cost, with weights \\(w_i\\) encoding the mission's priority ordering among these objectives.

{% katex(block=true) %}
R(s, a) = w_1 \cdot V_{\text{mission}}(s, a) - w_2 \cdot C_{\text{time}}(s, a) - w_3 \cdot C_{\text{asset}}(s, a) - w_4 \cdot C_{\text{risk}}(s, a)
{% end %}

The weights \\(w_i\\) encode mission priorities—time-critical missions weight \\(w_2\\) heavily; asset-preservation missions weight \\(w_3\\); etc.

The optimal value function \\(V^\*(s)\\) satisfies the Bellman equation: the best achievable cumulative reward from state \\(s\\) equals the immediate reward plus the discounted value of the best reachable next state, where {% katex() %}\gamma_{\text{rl}} \in [0,1){% end %} is the RL discount factor weighting future versus immediate outcomes.

{% katex(block=true) %}
V^*(s) = \max_a \left[ R(s, a) + \gamma_{\text{rl}} \sum_{s'} P(s' | s, a) V^*(s') \right]
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
3. **Propagation**: Decision propagates to all vehicles via {% term(url="@/blog/2026-01-22/index.md#def-24", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in logarithmic rounds by Proposition 12") %}gossip{% end %}
4. **Confirmation**: Each vehicle confirms receipt and readiness
5. **Execution**: Coordinated maneuver on lead's signal

If lead is unreachable:
- Fallback: Nearest cluster lead makes local decision
- Reachable vehicles execute local plan
- Unreachable vehicles hold position until contact restored

> **Cognitive Map**: CONVOY healing illustrates how MDP structure discovers the non-obvious optimal policy. The three phase-transition regimes (distance-dominated \\(\to\\) tow, time-dominated \\(\to\\) abandon, asset-dominated \\(\to\\) delay) emerge from the Bellman equation without being hand-coded — they are consequences of the multi-objective reward weights and transition probabilities. The coordination protocol (broadcast \\(\to\\) lead decision \\(\to\\) gossip propagation \\(\to\\) confirmation \\(\to\\) execution) is the MAPE-K sequence instantiated for ground convoy constraints. When the convoy lead is unreachable, the fallback to nearest cluster lead is the same authority-tier degradation structure seen throughout the series.

**Composed failure scenario: simultaneous Power + Partition + Drift**

{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicle ECU-4 experiences all three failure modes concurrently: battery drops below {% katex() %}R_{\text{crit}}{% end %} (power failure), backhaul link is jammed (partition), and sensor calibration drifts 15% beyond threshold (drift).

The resolution sequence is fully determined by the framework:

1. **Drift detected first** (fastest feedback loop): The Schmitt trigger hysteresis ({% term(url="#def-47", def="Schmitt Trigger Hysteresis: dual threshold with separate trigger and release levels preventing healing loop flapping near a boundary") %}Definition 47{% end %}) fires when drift exceeds \\(\theta_H\\), but the derivative confidence dampener ({% term(url="#def-49", def="Healing Budget Envelope: per-interval cap on total healing action energy expenditure, preventing the healing loop from depleting the survival power reserve") %}Definition 49{% end %}) holds the decision while the slope is still falling — preventing a false healing action on a still-worsening signal. {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} enters read-only mode for the affected sensor.

2. **Power failure triggers regime downgrade** ({% term(url="#def-52", def="Observation Regime Schedule: adaptive polling schedule reducing sensor sampling rate as battery drops, extending the survivable observation window") %}Definition 52{% end %}, Observation Regime Schedule): Battery drop to \\(O_1\\) (alert) halves measurement frequency. The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} self-throttling law ({% term(url="#prop-36", def="Self-Throttling Law: the node must enter OBSERVE mode when the resource state drops below a threshold that ensures survival to the next gossip round") %}Proposition 36{% end %}) reduces {% katex() %}f_{\text{MAPE-K}}{% end %} to conserve CPU margin. The \\(\alpha(R)\\) throttle coefficient begins reducing loop aggressiveness.

3. **Partition triggers circuit breaker** ({% term(url="#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %}): When {% katex() %}T_{\text{acc}} \geq Q_{0.95}{% end %}, all five transitions fire: (1) capability drops to {% katex() %}\mathcal{L}_0{% end %}, (2) {% katex() %}f_{\text{MAPE-K}}{% end %} floors at {% katex() %}f_{\min}{% end %}, (3) {% katex() %}k_\mathcal{N}{% end %} shifts heavier-tail, (4) {% katex() %}T_{\text{acc}}{% end %} resets on partition end, (5) \\(K\\) drops to {% katex() %}\alpha_{\text{margin}}/(1 + \tau_{\text{circuit}}/T_{\text{tick}}){% end %}. The HAC authority check ensures ECU-4 does not issue healing actions it lacks {% katex() %}Q_{\text{effective}}{% end %} authority for.

4. **Combined state at stabilization**: ECU-4 operates at {% katex() %}\mathcal{L}_0{% end %} (survival only), \\(O_2\\) (conservative monitoring), with sensor reads via dead-band only ({% term(url="#def-38", def="MAPE-K Predictive Dead-Band: region around setpoint where the MAPE-K controller takes no action to prevent chattering under stochastic delay") %}Definition 38{% end %}). The hardware watchdog ({% term(url="#def-41", def="Software Watchdog Timer: hardware-backed countdown triggering a safe-state transition if the autonomic control loop fails to check in within its configured timeout") %}Definition 41{% end %}) independently monitors the {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} heartbeat — if the throttled loop stops responding, the hardware resets it without software cooperation.

5. **Recovery order**: Partition ends first ({% katex() %}T_{\text{acc}}{% end %} resets, capability ladder re-entry via {% katex() %}\mathcal{L}_0 \to \mathcal{L}_1{% end %}). Power recovers second (regime upgrades via {% term(url="#def-52", def="Observation Regime Schedule: adaptive polling schedule reducing sensor sampling rate as battery drops, extending the survivable observation window") %}Definition 52{% end %} hysteresis band — requires 5% battery margin above threshold before upgrade). Drift corrects last (requires calibration convergence confirmed by three consecutive readings within \\(\theta_L\\)). Each recovery is independent; the system does not require simultaneous recovery of all three to restore normal operation.

> **Key insight**: The three failure modes have different recovery timescales (seconds for partition, minutes for battery, hours for calibration drift) and different recovery mechanisms (protocol, hardware, physical). Designing for independence — not simultaneity — is the architectural property that makes autonomous recovery tractable.

---

## OUTPOST Self-Healing

**Problem**: 127 sensor nodes in a remote perimeter mesh — no physical access, ultra-low power budgets, and sustained jamming. Physical intervention is infeasible; healing actions must not consume more energy than they restore capability.

**Solution**: Each failure mode has a matched low-energy healing action (frequency hop, recalibration, firmware restart). Energy-efficient scheduling prioritizes by value-restored per joule spent. Mesh reconfiguration extends neighbor sensitivity to partially cover gaps from permanent sensor loss.

**Trade-off**: Coverage extension from neighbor sensitivity increase raises false positive rates (more sensitivity means more noise detections). The OUTPOST mesh accepts a higher false-alarm rate in the coverage-gap zone as the cost of maintaining any detection at all.

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

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} healing actions compete with the power budget. Each healing action consumes energy {% katex() %}E_{\text{heal}}{% end %} equal to the product of action power draw {% katex() %}P_{\text{action}}{% end %} and its duration {% katex() %}T_{\text{duration}}{% end %}, plus the fixed communication overhead {% katex() %}E_{\text{communication}}{% end %} for coordinating the action.

{% katex(block=true) %}
E_{\text{heal}} = P_{\text{action}} \cdot T_{\text{duration}} + E_{\text{communication}}
{% end %}

The total energy spent on all healing actions \\(i\\) must not exceed the available reserve minus the minimum energy needed to keep the mission running.

{% katex(block=true) %}
\sum_i E_{\text{heal},i} \leq E_{\text{reserve}} - E_{\text{mission,min}}
{% end %}

Where {% katex() %}E_{\text{reserve}}{% end %} is current battery capacity and {% katex() %}E_{\text{mission,min}}{% end %} is minimum energy required to maintain mission capability.

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

> **Read the diagram**: The red Sensor 3 sends no signal — its F1 input arrow is dashed. Sensors 1 and 2 (green) compensate: dashed arrows point toward the yellow Coverage Gap zone showing their increased sensitivity. Fusion nodes A and B coordinate via the bidirectional coordination edge; B's cluster is unaffected and continues normally. The yellow gap zone persists — it is smaller than if no extension occurred, but it cannot be eliminated without physically deploying a replacement sensor.

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

The net extended coverage sums the original field of view, the marginal gains {% katex() %}\Delta\text{Coverage}_j{% end %} contributed by each neighbor {% katex() %}j \in \mathcal{N}{% end %} that extends its sensitivity, minus the Overlap between those extended zones to avoid double-counting.

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

Each state has different {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier from heartbeat-only survival at the base level to full fleet integration at the top; each level requires minimum connectivity and consumes proportionally more energy") %}capability levels{% end %} and power costs. The system tracks time in each state for capacity planning.

> **Cognitive Map**: OUTPOST healing is constrained by energy first and bandwidth second — the ordering that inverts the usual cloud priority. Every healing action is priced in joules and scheduled by {% katex() %}V_{\text{restored}} \cdot P_{\text{success}} / E_{\text{heal}}{% end %}. The five-tier healing table (sensor drift \\(\to\\) recalibration at 85%, communication loss \\(\to\\) frequency hop at 70%, through hardware hang \\(\to\\) watchdog restart at 95%) gives the MAPE-K loop a prioritized action set that stays within the power envelope. Mesh reconfiguration after permanent sensor loss trades false-positive rate for coverage continuity — a trade the design accepts explicitly rather than hiding it behind a confidence threshold.

---

<span id="scenario-smartbldg"></span>

## Commercial Application: {% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %} Building Automation

**Problem**: A 52-floor commercial tower with thousands of HVAC, lighting, and access control actuators — all coordinated by a central BMS server. When that server fails, occupants must stay comfortable and fire safety must remain inviolable, with no manual intervention possible for the first several hours.

**Solution**: Distribute MAPE-K loops across four tiers (building \\(\to\\) floor \\(\to\\) zone \\(\to\\) device). Each tier runs its own local loop so that zone controllers remain fully autonomous when higher tiers are unreachable. Fire and life safety systems operate on a separate dedicated network that the HVAC healing loop never touches.

**Trade-off**: Distributed autonomy requires consistent setpoints without central coordination. The solution — cached weekly schedules plus {% katex() %}2^\circ\text{F}{% end %} deadband widening — accepts suboptimal energy efficiency for up to 8 hours in exchange for full comfort maintenance without BMS access.

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

> **Read the diagram**: Four tiers shown top-to-bottom. The blue BMS sends setpoints and schedules via dotted arrows (guidance, not commands) to floor controllers. Floor controllers issue solid commands to zone controllers; zone controllers command individual VAV boxes, lighting, and sensors. Critically, each orange floor controller box labels itself "Local MAPE-K" — when the BMS dotted-arrow path fails, each floor continues running its own loop independently. Device-level sensors feed only the zone controller directly above them; no sensor data crosses tier boundaries without aggregation.

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

**Power-constrained healing parallels {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %}**: Zone controllers operate on 24VAC power derived from HVAC transformers. When analyzing healing options, energy is not the binding constraint—actuator wear is, and the healing cost for action \\(a\\) is therefore the per-cycle wear cost {% katex() %}C_{\text{actuator cycles}}{% end %} multiplied by the number of actuator cycles the action requires.

{% katex(block=true) %}
\text{Healing cost} = C_{\text{actuator cycles}} \cdot \text{expected cycles}(a)
{% end %}

VAV dampers are rated for 100,000 cycles. Excessive hunting (oscillating between positions) accelerates wear. The healing policy limits damper adjustments to once per 5 minutes except for safety overrides.

**Cascade prevention during chiller failure**: When a chiller fails on a \\(95^\circ\\)F day, 52 floor controllers simultaneously demand maximum cooling from remaining chillers. Without coordination, this cascades to remaining chiller overload.

{% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %} prevents cascade by allocating the available cooling capacity {% katex() %}Q_{\text{available}}{% end %} proportionally: each floor receives a share weighted by its priority factor and current occupancy, normalized across all floors.

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

> **Cognitive Map**: SMARTBLDG demonstrates the hierarchical MAPE-K pattern at commercial scale: each tier runs its own loop, with dotted guidance from above and solid commands below. The key design insight is the safety layer separation — fire and life safety systems live on a dedicated network that the comfort HVAC loop never touches. This is the physical implementation of the capability hierarchy: L0 (life safety) is structurally isolated from L1–L4 (comfort, efficiency, learning). Zone controllers with 8 KB RAM run a complete MAPE-K loop — the same four-phase structure as the 47-drone swarm, just with 200-byte state windows and BACnet commands instead of gossip packets.

---

## The Limits of Self-Healing

**Problem**: Every mechanism in this post has a boundary condition. Physical destruction, healing-loop corruption, adversarial exploitation, and irresolvably ambiguous diagnoses all define situations where autonomous healing must stop and either degrade gracefully or await human judgment.

**Solution**: Recognize the limit explicitly — formalize when to stop trying, how to log state for later analysis, and how to stabilize in the least-risky configuration while waiting for human input.

**Trade-off**: Stopping autonomous healing prematurely wastes the system's capacity to self-recover. Stopping too late allows a failing healer to worsen the damage. The judgment horizon (when to hand off) is mission-specific and cannot be derived analytically — it requires explicit design-time specification from mission planners.

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

At the {% term(url="@/blog/2026-02-12/index.md#def-91", def="Time window J over which the system evaluates stress outcomes before adapting; shorter J enables faster adaptation but higher variance in parameter estimates") %}judgment horizon{% end %}, the system should:
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

The context-conditional success probability {% katex() %}P_{\text{success}}(a \mid \text{context}){% end %} tracks how often action \\(a\\) has worked in this specific operational context, estimated as a simple empirical frequency.

{% katex(block=true) %}
P_{\text{success}}(a | \text{context}) = \frac{\text{successes of } a \text{ in context}}{\text{attempts of } a \text{ in context}}
{% end %}

*Formal improvement condition*: The system's healing effectiveness improves after each failure episode if the expected success probability at the next timestep exceeds the current baseline:

{% katex(block=true) %}
\mathbb{E}[P_{\text{success}}(t+1) \mid \text{failure}_t] > \mathbb{E}[P_{\text{success}}(t)]
{% end %}

This holds when:
1. Failure provides information gain: {% katex() %}I(\text{context} ; \text{outcome}) > 0{% end %}
2. Policy update incorporates observation: {% katex() %}\theta_{t+1} = \theta_t + \eta \nabla_\theta \log P(\text{outcome} \mid a, \theta){% end %}
3. Failure mode is within learning distribution: {% katex() %}P(\text{failure type seen before}) > 0{% end %}

*Uncertainty bound*: {% katex() %}P(\text{improvement} \mid \text{failure}) \in [0.6, 0.9]{% end %} depending on novelty of failure mode. Novel failures outside training distribution may not yield improvement.

> **Cognitive Map**: Self-healing has four hard boundaries. Physical destruction is beyond any software response — the terminal safety state handles it by acknowledging the loss and stabilizing. Healing-loop corruption requires the watchdog hierarchy (Section 2) to detect and bypass. Adversarial exploitation requires second-order defenses: rate-limiting, randomized parameters, and pattern detection on the healing pattern itself. The judgment horizon — when to stop trying — is the only limit that cannot be computed from first principles; it is a mission design input. Anti-fragile learning is the positive counterpart: every failure episode inside the learning distribution improves the next response, provided the failure mode is one the policy has seen before.

---

## Irreducible Trade-offs

No design eliminates these tensions. The architect selects a point on each Pareto front.

### Trade-off 1: Healing Aggressiveness vs. Stability

**Multi-objective formulation**:

The objective jointly maximizes recovery utility and stability utility while minimizing overshoot cost, with \\(K_{\text{ctrl}}\\) as the single parameter that moves the operating point along the Pareto front.

{% katex(block=true) %}
\max_{K_{\text{ctrl}}} \left( U_{\text{recovery}}(K_{\text{ctrl}}), U_{\text{stability}}(K_{\text{ctrl}}), -C_{\text{overshoot}}(K_{\text{ctrl}}) \right)
{% end %}

where \\(K_{\text{ctrl}}\\) is the controller gain.

**Stability constraint**: {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %}

The table below traces the Pareto front for controller gain \\(K_{\text{ctrl}}\\): moving down the rows buys faster recovery (lower recovery time) at the cost of a narrower stability margin and higher overshoot risk.

| Gain \\(K_{\text{ctrl}}\\) | Recovery Time | Stability Margin | Overshoot Risk |
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

The exploration bonus {% katex() %}c\sqrt{\ln t / n_a}{% end %} grows as action \\(a\\) is under-tried (small \\(n_a\\)) and the parameter \\(c\\) scales how strongly that bonus drives selection toward unexplored actions.

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

The total cost of a healing action decomposes into three terms — the direct action cost, the connectivity-dependent coordination cost, and the opportunity cost of resources diverted from mission — each of which varies with the {% term(url="@/blog/2026-01-15/index.md#def-6", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %} \\(\Xi\\).

{% katex(block=true) %}
C_{\text{heal}}(a, \Xi) = C_{\text{action}}(a) + C_{\text{coordination}}(a, \Xi) + C_{\text{opportunity}}(a)
{% end %}

where:
- {% katex() %}C_{\text{action}}(a){% end %}: Direct cost of healing action \\(a\\)
- {% katex() %}C_{\text{coordination}}(a, \Xi){% end %}: Coordination cost under connectivity \\(\Xi\\)
- {% katex() %}C_{\text{opportunity}}(a){% end %}: Cost of resources diverted from mission

The coordination cost {% katex() %}C_{\text{coordination}}{% end %} grows with both the scope of the healing action and the degradation of connectivity: local actions in full connectivity cost \\(O(1)\\), cluster-wide actions under degraded connectivity cost \\(O(\log n)\\), fleet-wide actions under intermittent connectivity cost \\(O(n)\\), and fleet-wide actions under denied connectivity are infeasible.

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

| Resource | Shadow Price \\(\lambda\\) (c.u.) | Interpretation |
| :--- | ---: | :--- |
| Healing compute | 0.15/action | Value of faster recovery |
| Coordination bandwidth | 1.80/sync | Value of coordinated healing |
| Mission capacity | 2.50/%-hr | Cost of diverted resources |
| Redundancy margin | 4.00/node | Value of spare capacity |

*(Shadow prices in normalized cost units (c.u.) — illustrative relative values; ratios convey healing resource scarcity ordering. Healing compute (0.15 c.u./action) is the reference unit. Calibrate to platform-specific operational costs.)*

### Irreducible Trade-off Summary

Each row names a fundamental design tension, the two objectives that pull against each other, and the specific outcome that no implementation can achieve regardless of engineering effort.

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Speed-Stability | Fast recovery vs. no overshoot | Instant recovery with zero risk |
| Local-Coordinated | Fast initiation vs. optimal decision | Both under partition |
| Explore-Exploit | Short-term vs. long-term optimality | Both with finite samples |
| Depth-Cascade | Thorough healing vs. cascade safety | Deep healing with zero cascade risk |

> **Cognitive Map**: These four trade-offs are structural — no implementation eliminates them. The stability gain condition {% katex() %}K_{\text{ctrl}} < 1/(1 + \tau/T_{\text{tick}}){% end %} quantifies the speed-stability boundary: faster feedback reduces \\(\tau\\), allowing higher \\(K_{\text{ctrl}}\\). The local-coordinated trade-off collapses under partition to a binary choice: act now with local information or wait for consensus that may never arrive. The explore-exploit trade-off requires knowing the time horizon: UCB with \\(c = 1\\) is Bayes-optimal for the {% katex() %}\sqrt{}{% end %}KT regret bound; contextual bandits and deep RL shift the efficient frontier by exploiting state structure. The depth-cascade trade-off is managed by the Resource Priority Matrix ({% term(url="#def-43", def="Resource Priority Matrix: table defining which resource classes preempt others during survival-mode shedding, preventing priority inversion under scarcity") %}Definition 43{% end %}) and cascade prevention quota — these bound the cascading risk of deep healing without eliminating it. Every design choice in the framework above is a position on one or more of these Pareto fronts.

---

## Related Work

**Autonomic computing and self-adaptive systems.** The vision of computing systems that manage themselves without human intervention was articulated by Kephart and Chess {{ cite(ref="1", title="Kephart & Chess (2003) — The Vision of Autonomic Computing") }}, who identified the Monitor-Analyze-Plan-Execute loop as the canonical closed-loop structure. IBM's architectural blueprint {{ cite(ref="2", title="IBM Research (2006) — Architectural Blueprint for Autonomic Computing") }} gave that vision engineering form, specifying the MAPE-K reference model that {% term(url="#def-36", def="Autonomic Control Loop (MAPE-K): Monitor-Analyze-Plan-Execute loop with Knowledge base that closes the self-healing feedback loop locally without external coordination") %}Definition 36{% end %} directly instantiates. Huebscher and McCann {{ cite(ref="3", title="Huebscher & McCann (2008) — Survey of Autonomic Computing") }} survey the subsequent decade of autonomic computing research, cataloguing degrees of autonomy and the modelling approaches that followed. The narrower but complementary literature on self-adaptive software — systems that modify their own behaviour at runtime in response to observed context — is surveyed by Salehie and Tahvildari {{ cite(ref="6", title="Salehie & Tahvildari (2009) — Self-Adaptive Software: Landscape and Challenges") }}, who identify feedback-loop architectures as the dominant design pattern and establish the connection to classical control theory that {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain must stay below a delay-dependent ceiling; exceeding it causes oscillation rather than convergence") %}Proposition 22{% end %} exploits. This article's edge-specific contributions — gain scheduling by connectivity regime, staleness-aware threshold suppression, and the self-throttling survival law — address failure modes that arise in contested, disconnected environments outside the scope of those foundational works.

**Control Barrier Functions and safety-critical control.** Control Barrier Functions as a unified framework for enforcing safety constraints on continuous-time systems were introduced by Ames et al. {{ cite(ref="7", title="Ames et al. (2017) — Control Barrier Functions for Safety Critical Systems") }}. The same group extended the theory to application-focused settings and provided the convergence and composition results that motivate the discrete-time adaptation in {% term(url="#def-39", def="Discrete Control Barrier Function: safety function enforcing mode-invariant stability across capability level transitions in the switched system") %}Definition 39{% end %} {{ cite(ref="8", title="Ames et al. (2019) — Control Barrier Functions: Theory and Applications") }}. The connection to gain scheduling — selecting controller parameters as a function of operating regime — is classical; Rugh and Shamma {{ cite(ref="9", title="Rugh & Shamma (2000) — Research on Gain Scheduling") }} survey the theoretical foundations and engineering practice. The discrete Control Barrier Function formulation in {% term(url="#def-39", def="Discrete Control Barrier Function: safety function enforcing mode-invariant stability across capability level transitions in the switched system") %}Definition 39{% end %}, the CBF-derived refractory bound of {% term(url="#prop-31", def="CBF-derived refractory bound: minimum refractory period ensuring the safety condition is maintained between consecutive healing actions") %}Proposition 31{% end %}, and the Nonlinear Safety Guardrail of {% term(url="#prop-25", def="Nonlinear Safety Invariant: safety invariant is preserved across mode transitions if the gain scheduler satisfies the barrier condition at each boundary") %}Proposition 25{% end %} adapt these continuous-time results to the tick-driven MAPE-K execution model, where safety can only be checked at discrete sample instants rather than continuously.

**Sequential change detection and CUSUM.** The problem of detecting an abrupt change in a sequentially observed process was formally posed by Page {{ cite(ref="12", title="Page (1954) — Continuous Inspection Schemes (CUSUM)") }}, whose cumulative sum (CUSUM) statistic remains the canonical solution. Basseville and Nikiforov {{ cite(ref="13", title="Basseville & Nikiforov (1993) — Detection of Abrupt Changes") }} provide the comprehensive treatment of change-point detection theory that underlies the sentinel formulation in the {% term(url="#prop-31", def="CBF-derived refractory bound: minimum refractory period ensuring the safety condition is maintained between consecutive healing actions") %}Proposition 31{% end %} discussion, including the ARL (average run length) analysis used to calibrate alarm thresholds \\(h = 5k\\) for the RAVEN platform. The application here — detecting persistent drift in the \\(\rho_q\\) stability margin rather than a jump in a scalar observation — is a direct instantiation of the two-sided CUSUM structure, with the slack parameter \\(k\\) derived from the \\(3\sigma\\) detection criterion and the rolling noise estimate serving as the reference value.

**Edge computing and self-healing in contested environments.** Satyanarayanan {{ cite(ref="4", title="Satyanarayanan (2017) — The Emergence of Edge Computing") }} and Shi et al. {{ cite(ref="5", title="Shi et al. (2016) — Edge Computing: Vision and Challenges") }} establish the architectural argument for edge computing: latency constraints and bandwidth asymmetry make cloud offload structurally unviable for a significant class of real-time applications, requiring autonomous decision-making at the network edge. The self-healing framework in this article is a concrete response to that requirement — providing the stability guarantees and resource-management discipline that make autonomy safe rather than merely possible. The chaos engineering methodology used to validate {% term(url="#prop-37", def="Weibull Circuit Breaker: base-tier gate fires when the partition accumulator exceeds the 95th-percentile partition duration, triggering controlled shutdown before resources are exhausted") %}Proposition 37{% end %} (the Weibull circuit breaker) follows Basiri et al. {{ cite(ref="14", title="Basiri et al. (2016) — Chaos Engineering") }}, who established fault injection against production systems as the standard practice for validating resilience claims. Anti-fragility — the property that systems improve under stress rather than merely recovering — is the organizing concept drawn from Taleb {{ cite(ref="11", title="Taleb (2012) — Antifragile: Things That Gain From Disorder") }}; the lexicographic priority hierarchy (Survival \\(\succ\\) Autonomy \\(\succ\\) Coherence \\(\succ\\) Anti-fragility) embeds this concept as the highest tier of the capability stack.

---

## Closing

Drone 23 landed safely. {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicle 4 was towed to the objective. {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensors reconfigured around the failed node. {% term(url="#scenario-hyperscale", def="Edge data center sites running autonomous MAPE-K healing loops; maintains microservice availability when central orchestration is unreachable") %}HYPERSCALE{% end %} healed microservice failures autonomously. {% term(url="#scenario-smartbldg", def="Commercial high-rise building automation (HVAC, lighting, access control, fire safety); zone controllers maintain occupant safety autonomously when the BMS server fails") %}SMARTBLDG{% end %} maintained comfort through central server outages.

The common thread: each system detected its own faults, selected a remediation strategy, and executed recovery without waiting for human authorization. The {% term(url="#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} control loop—operating continuously at the speed of local computation, not the speed of communication—enabled this autonomy.

Three conditions made autonomous healing tractable. First, anomaly detection provided calibrated confidence estimates rather than binary alerts, enabling the confidence-threshold framework of Prop 84. Second, the capability hierarchy gave healing a clear priority ordering: {% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %} components before non-{% term(url="#def-50", def="Smallest set of components that must remain operational to sustain the mission-critical survival capability; defines the healing algorithm priority boundary") %}MVS{% end %}, survival capability before mission capability. Third, the stability condition of {% term(url="#prop-22", def="Closed-Loop Healing Stability: gain K below the stability bound keeps the autonomic loop from oscillating during delayed feedback") %}Proposition 22{% end %} tied controller gain to feedback delay, preventing healing from oscillating.

What this framework does not address: healing succeeds locally, but independent local decisions can produce globally inconsistent state. When {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s eastern cluster lost contact during the Drone 23 healing sequence, both clusters made correct decisions given their information. Their records diverged. That divergence—and the problem of reconciling it—is a distinct challenge from healing itself, one that requires different mechanisms. [Fleet Coherence Under Partition](@/blog/2026-02-05/index.md) addresses exactly that: {% term(url="@/blog/2026-02-05/index.md#def-58", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDTs{% end %}, causal ordering, and the authority tiers that determine who wins when clusters disagree.

---

## References

<span id="ref-1"></span>
[1] Kephart, J.O., Chess, D.M. (2003). "The Vision of Autonomic Computing." *IEEE Computer*, 36(1), 41–50. [[doi]](https://doi.org/10.1109/MC.2003.1160055)

<span id="ref-2"></span>
[2] IBM Research (2006). "An Architectural Blueprint for Autonomic Computing." IBM White Paper, 4th Ed.

<span id="ref-3"></span>
[3] Huebscher, M.C., McCann, J.A. (2008). "A Survey of Autonomic Computing — Degrees, Models, and Applications." *ACM Computing Surveys*, 40(3), Article 7. [[doi]](https://doi.org/10.1145/1380584.1380585)

<span id="ref-4"></span>
[4] Satyanarayanan, M. (2017). "The Emergence of Edge Computing." *IEEE Computer*, 50(1), 30–39. [[doi]](https://doi.org/10.1109/MC.2017.9)

<span id="ref-5"></span>
[5] Shi, W., Cao, J., Zhang, Q., Li, Y., Xu, L. (2016). "Edge Computing: Vision and Challenges." *IEEE Internet of Things Journal*, 3(5), 637–646. [[doi]](https://doi.org/10.1109/JIOT.2016.2579198)

<span id="ref-6"></span>
[6] Salehie, M., Tahvildari, L. (2009). "Self-Adaptive Software: Landscape and Research Challenges." *ACM Trans. Autonomous and Adaptive Systems*, 4(2), Article 14. [[doi]](https://doi.org/10.1145/1516533.1516538)

<span id="ref-7"></span>
[7] Ames, A.D., Xu, X., Grizzle, J.W., Tabuada, P. (2017). "Control Barrier Function Based Quadratic Programs for Safety Critical Systems." *IEEE Transactions on Automatic Control*, 62(8), 3861–3876. [[doi]](https://doi.org/10.1109/TAC.2016.2638961)

<span id="ref-8"></span>
[8] Ames, A.D., Coogan, S., Egerstedt, M., Notomista, G., Sreenath, K., Tabuada, P. (2019). "Control Barrier Functions: Theory and Applications." *Proc. European Control Conference (ECC)*, 3420–3431. [[doi]](https://doi.org/10.23919/ECC.2019.8796107)

<span id="ref-9"></span>
[9] Rugh, W.J., Shamma, J.S. (2000). "Research on Gain Scheduling." *Automatica*, 36(10), 1401–1425. [[doi]](https://doi.org/10.1016/S0005-1098(00)00058-3)

<span id="ref-10"></span>
[10] Avizienis, A., Laprie, J.-C., Randell, B., Landwehr, C. (2004). "Basic Concepts and Taxonomy of Dependable and Secure Computing." *IEEE Transactions on Dependable and Secure Computing*, 1(1), 11–81. [[doi]](https://doi.org/10.1109/TDSC.2004.2)

<span id="ref-11"></span>
[11] Taleb, N.N. (2012). *Antifragile: Things That Gain From Disorder*. Random House.

<span id="ref-12"></span>
[12] Page, E.S. (1954). "Continuous Inspection Schemes." *Biometrika*, 41(1/2), 100–44. [[doi]](https://doi.org/10.1093/biomet/41.1-2.100)

<span id="ref-13"></span>
[13] Basseville, M., Nikiforov, I.V. (1993). *Detection of Abrupt Changes: Theory and Application*. Prentice Hall. [[pdf]](https://www.irisa.fr/sisthem/kniga/)

<span id="ref-14"></span>
[14] Basiri, A., Behnam, N., de Rooij, R., Hochstein, L., Kosewski, L., Reynolds, J., Rosenthal, C. (2016). "Chaos Engineering." *IEEE Software*, 33(3), 35–62. [[doi]](https://doi.org/10.1109/MS.2016.60)
