+++
authors = ["Yuriy Polyulya"]
title = "Anti-Fragile Decision-Making at the Edge"
description = """Resilience returns you to baseline; anti-fragility means coming out better than you went in. This article formalizes that distinction, shows why anti-fragile policies win under fleet-wide policy competition, and builds the bandit and Bayesian update machinery that makes improvement possible — with a caveat: the math only works if you defined success before the failure happened."""
date = 2026-02-12
slug = "autonomic-edge-part5-antifragile-decisions"
draft = false

[taxonomies]
tags = ["distributed-systems", "edge-computing", "anti-fragile", "decision-making"]
series = ["autonomic-edge-architectures"]

[extra]
toc = false
series_order = 5
series_title = "Autonomic Edge Architectures: Self-Healing Systems in Contested Environments"
series_description = """Edge systems can't treat disconnection as an exceptional error — it's the default condition. This series builds the formal foundations for systems that self-measure, self-heal, and improve under stress without human intervention, grounded in control theory, Markov models, and CRDT state reconciliation. Every quantitative claim comes with an explicit assumption set."""
+++

---

## Prerequisites

Four autonomic capabilities have been established across the preceding articles.

[Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md) established the context: {% term(url="@/blog/2026-01-15/index.md#def-2", def="Classification of operating mode: Connected, Degraded, Intermittent, or Denied") %}connectivity regime{% end %}s where partition is the default state, the capability hierarchy (\\(\mathcal{L}_0\\)–\\(\mathcal{L}_4\\)) that defines what the system must achieve, and the inversion thesis that positions edge systems as partition-native. The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient \\(\mathbb{A}\\) was introduced informally there as a design goal; this article defines it formally.

[Self-Measurement Without Central Observability](@/blog/2026-01-22/index.md) established self-measurement: local anomaly detection with calibrated confidence estimates, {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %}-based health propagation with bounded staleness, and {% term(url="@/blog/2026-01-22/index.md#def-7", def="Node that deviates arbitrarily from the protocol — sends false data, drops messages, or colludes with other compromised nodes to corrupt shared state") %}Byzantine{% end %}-tolerant aggregation. These mechanisms give the system accurate knowledge of its own state without central infrastructure.

[Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) established self-healing: the {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} autonomic control loop, confidence-gated healing thresholds calibrated to action severity, recovery ordering by dependency, and cascade prevention. Given a detected anomaly, the system can repair itself.

[Fleet Coherence Under Partition](@/blog/2026-02-05/index.md) established fleet coherence: {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}-based conflict-free state merging, Merkle reconciliation for efficient sync, and hierarchical decision authority that determines who resolves conflicts when clusters disagree after partition.

Taken together, these four capabilities define *resilience*: the ability to return to baseline performance after stress. But resilience is not the ceiling.

A system that merely recovers from each failure is as fragile at reconnection as it was before the partition began. Every failure event, every period of degraded operation, every parameter that proved wrong under load - these carry information about the system and its environment. The question this article addresses is how to extract that information systematically and use it to improve future performance, not just restore past performance.

The distinction is not philosophical. In adversarial and non-stationary environments, a system that learns from stress becomes progressively harder to degrade. A system that only recovers remains permanently exploitable by any stressor it has seen before.

---

## Overview

{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} systems improve from stress rather than merely surviving it. Each concept integrates theory with design consequence:

| Concept | Formal Contribution | Design Consequence |
| :--- | :--- | :--- |
| **Anti-Fragility** | Convexity: \\(d^2P/d\sigma^2 > 0\\) | Design response functions that gain from variance |
| **Stress-Information** | {% katex() %}I = -\log_2 P(\text{failure}){% end %} | Prioritize learning from rare events |
| **Online Optimization** | UCB, EXP3, Thompson Sampling; EXP3 minimax regret {% katex() %}O(\sqrt{TK \ln K}){% end %} | Converge to optimal parameters; degrade gracefully under partition |
| **Judgment Horizon** | {% katex() %}d \in \mathcal{J} \Leftrightarrow I > \theta_I \lor P > \theta_P \lor \ldots{% end %} | Route high-stakes decisions to humans |
| **Model Failure** | Taxonomy: drift, adversarial, distributional | Defense-in-depth for each failure class |

This extends {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} theory (Taleb, 2012) and online learning (Auer et al., 2002) for contested edge environments.

---

## Opening Narrative: {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} After the Storm

{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm, time \\(t = T_0 + \Delta T\\). At \\(t = T_0\\), parameters were design-time estimates: formation spacing \\(d_f = 200\\)m fixed, {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} interval \\(\tau_g = 5\\)s fixed, \\(\mathcal{L}_2\\) (local coordination capability) threshold \\(\theta_C = 0.3\\).

At \\(t = T_0 + \Delta T\\), parameters are learned from operation: formation \\(d_f \in [150, 250]\\)m adaptive, {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} \\(\tau_g \in [2, 10]\\)s adaptive, threshold \\(\theta_C = 0.25\\).

Each stress event (partition, failure, adversarial action) provides information \\(I(\sigma)\\). The learning mechanism extracts this information to update parameters: the new parameter value {% katex() %}\theta_{t+1}{% end %} steps from the current value \\(\theta_t\\) in the direction that most improves utility \\(U\\), scaled by learning rate \\(\eta\\).

{% katex(block=true) %}
\theta_{t+1} = \theta_t + \eta \cdot \nabla_\theta U(\theta; \sigma_t)
{% end %}

where \\(\nabla_\theta U\\) is the gradient of utility with respect to parameters, computed from stress response.

{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} systems convert stress into improvement. Performance at \\(T_0 + \Delta T\\) exceeds \\(T_0\\) - not from external updates, but from architecture designed to learn from operational stress.

---

## Defining Anti-Fragility

> **Problem**: "Resilient" and "anti-fragile" are often used interchangeably, but they describe fundamentally different behaviors. A resilient system returns to baseline after stress. An anti-fragile system finishes in a better state than it started — the stress itself was the improvement mechanism.
> **Solution**: Formalize anti-fragility as convexity of the performance function in stress magnitude (\\(d^2P/d\sigma^2 > 0\\)). This is not a metaphor — it is a testable property. If performance after recovery exceeds pre-stress performance, the system is anti-fragile. The coefficient {% katex() %}\mathbb{A} = (P_1 - P_0)/\sigma{% end %} makes improvement per unit stress quantifiable.
> **Trade-off**: Anti-fragility requires deliberate feedback from stress events into policy updates. A system that passively absorbs stress and returns to baseline is resilient, not anti-fragile. The feedback loop adds latency and complexity. There is also a safe operating envelope — stress beyond {% katex() %}\sigma_{\text{max}}{% end %} exceeds the system's recovery capacity and produces catastrophic failure, not improvement.

### Beyond Resilience

<span id="def-15"></span>
**Definition 15** (Anti-Fragility). *A system is {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} if its performance function \\(P(\sigma)\\) is convex in stress magnitude \\(\sigma\\) within a useful operating range {% katex() %}[0, \sigma_{\text{max}}]{% end %}:*

*(Notation: here \\(P(\sigma)\\) denotes system performance as a function of stress \\(\sigma\\) — distinct from probability \\(P(\cdot)\\) used elsewhere in this series. Where ambiguity could arise, performance is written {% katex() %}P_{\text{perf}}(\sigma){% end %}.)*

{% katex(block=true) %}
\frac{d^2 P}{d\sigma^2} > 0 \quad \text{for } \sigma \in [0, \sigma_{\text{max}}]
{% end %}

- **Use**: Tests whether performance {% katex() %}P{% end %} is convex in stress {% katex() %}\sigma{% end %} ({% katex() %}d^2P/d\sigma^2 > 0{% end %}), meaning the system genuinely improves under repeated stress rather than just recovering; evaluate over at least 10 stress events to prevent resilience masquerade from being mislabeled as anti-fragility.
- **Parameters**: Measure {% katex() %}P{% end %} over a 30-day rolling window; stress events include partitions, fault injections, and anomaly triggers.
- **Field note**: Anti-fragility requires deliberate feedback from stress events into policy updates — passive resilience never produces {% katex() %}d^2P/d\sigma^2 > 0{% end %}. The stress events that drive improvement are precisely the connectivity-regime transitions (Denied, Intermittent, Degraded) formalized in [Why Edge Is Not Cloud Minus Bandwidth](@/blog/2026-01-15/index.md#def-2): each regime transition is a discrete stress event providing learning signal.

> **Physical translation**: \\(d^2P/d\sigma^2 > 0\\) means the performance curve bends *upward* as stress increases — each additional unit of stress produces more improvement than the last. This is the mathematical signature of a system that learns faster under more pressure. The anti-fragility coefficient {% katex() %}\mathbb{A} = (P_1 - P_0)/\sigma{% end %} gives the practical measure: how much did performance actually improve, per unit stress experienced? For RAVEN, if detection accuracy was 0.72 before a partition event (\\(P_0 = 0.72\\)) and reached 0.78 after parameter updates triggered by that event (\\(P_1 = 0.78\\)), and the partition severity was \\(\sigma = 0.4\\), then {% katex() %}\mathbb{A} = 0.06/0.4 = 0.15{% end %} — 15% improvement per unit stress.

*By Jensen's inequality, convexity implies {% katex() %}\mathbb{E}[P(\sigma)] > P(\mathbb{E}[\sigma]){% end %}: the system gains from stress variance itself. The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient {% katex() %}\mathbb{A} = (P_1 - P_0)/\sigma{% end %} measures observed improvement per unit stress, where \\(P_0\\) is pre-stress performance and \\(P_1\\) is post-recovery performance.*

**Operationalizing P**: System performance is multi-dimensional, so \\(P\\) must be defined before \\(\mathbb{A}\\) can be computed. The series uses the primary metric as the canonical scalar: {% katex() %}P = \bar{\mathcal{L}} = \mathbb{E}[\int_0^T \mathcal{L}(t)\,dt]/T{% end %}, the time-averaged {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier L0-L4 from heartbeat-only survival to full fleet integration; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %}. For specific sub-problems, substitute: {% katex() %}P = \text{MTTR}^{-1}{% end %} (inverse mean time to recovery) for healing-speed analysis; \\(P = \text{F}_1\\) (anomaly-detection F-score) for detection accuracy; {% katex() %}P = \bar{\theta}{% end %} (average operational threshold) for threshold-learning tasks. The denominator \\(\sigma \in [0,1]\\) is normalized stress severity (0 = no stress, 1 = worst-case partition or hardware failure). With these substitutions, \\(\mathbb{A} > 0\\) is falsifiable: it requires that the chosen \\(P\\) metric is measurably higher after stress recovery than before the stress event.

In other words, an {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} system does not just survive stress and return to baseline — it finishes in a better state than it started, and this improvement is proportional to how severe the stress was.

### Safe Operating Envelope

The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} learning loop is only safe if the parameter space has explicit bounds. Without them, a sufficiently stressed system can gradient-descend itself into an unstable regime — unconstrained parameter evolution is a genetic algorithm without fitness cliffs.

<span id="def-soe"></span>
**Safe Operating Envelope (SOE)**: The learned parameter vector {% katex() %}\theta \in \mathbb{R}^d{% end %} (\\(d\\) = number of independently tunable parameters) must remain within pre-specified bounds:

{% katex(block=true) %}
\theta \in [\theta_{\min}, \theta_{\max}]
{% end %}

Each individual update must also be bounded in magnitude to prevent a single high-variance stress event from causing a destabilizing step:

{% katex(block=true) %}
\|\Delta\theta_t\| < \delta_{\text{safe}}, \qquad \delta_{\text{safe}} = 0.1 \times (\theta_{\max} - \theta_{\min})
{% end %}

where {% katex() %}\delta_{\text{safe}}{% end %} limits per-step mutation to 10% of the feasible range. **Boundary enforcement**: a proposed update is accepted only when both conditions hold simultaneously:

{% katex(block=true) %}
\theta_t + \Delta\theta_t \in [\theta_{\min}, \theta_{\max}] \;\land\; \|\Delta\theta_t\| \leq \delta_{\text{safe}}
{% end %}

If the magnitude bound is violated, the update is scaled to {% katex() %}\delta_{\text{safe}} \cdot \Delta\theta_t / \|\Delta\theta_t\|{% end %}, preserving the gradient direction while enforcing the step-size limit.

**Lyapunov stability criterion**: SOE bounds are necessary but not sufficient — an update within {% katex() %}[\theta_{\min}, \theta_{\max}]{% end %} can still move the closed-loop system toward instability. The Lyapunov criterion enforces directional safety. A policy update is accepted only if the Lyapunov function \\(V(x)\\) (positive definite, radially unbounded) exhibits exponential decrease:

{% katex(block=true) %}
\dot{V}(x) = \nabla V \cdot f(x, \theta) \leq -\alpha V(x), \quad \alpha > 0
{% end %}

*(Notation: throughout this section \\(\\alpha > 0\\) denotes the exponential convergence rate with units {% katex() %}\text{s}^{-1}{% end %}. This is distinct from the false-alarm rates {% katex() %}\alpha_Q, \alpha_{\text{corr}}{% end %} used in the Q-change detector (Proposition 35), the Beta prior shape \\(\\alpha_k\\) used in {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %} (Proposition 34), and the significance level \\(\\alpha\\) used in hypothesis tests. Context and subscripts differentiate all four uses within this article. Across the series, additional subscripted \\(\\alpha\\) forms appear in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) ({% katex() %}\alpha_{\text{margin}}{% end %}, {% katex() %}\alpha_{\text{EMA}}{% end %} for gain scheduling; {% katex() %}\alpha_{\text{heal}}{% end %} for resource budgeting; {% katex() %}\alpha_{\text{age}}{% end %} for priority decay) — all distinct from the uses above.)*

**Data-driven verification**: When \\(f(x, \theta)\\) is unknown — the common case in adversarial or non-stationary environments — replace the analytic condition with a finite-difference estimate:

{% katex(block=true) %}
\dot{V}(x) \approx \frac{V(x_{t+1}) - V(x_t)}{\Delta t}
{% end %}

Reject the proposed update if this estimate exceeds the stability threshold:

{% katex(block=true) %}
\frac{V(x_{t+1}) - V(x_t)}{\Delta t} > -\alpha V(x_t) + \varepsilon
{% end %}

where \\(\varepsilon\\) absorbs measurement noise. On rejection, revert to {% katex() %}\theta_{\text{prev}}{% end %} and log the failure mode for offline analysis.

**Basin of attraction**: SOE-constrained learning is confined to the stability basin:

{% katex(block=true) %}
\mathcal{B} = \{x : \dot{V}(x) < 0\}
{% end %}

Policy updates are accepted only when the post-update trajectory remains in \\(\mathcal{B}\\).

**SOE-constrained {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient**: To prevent \\(\mathbb{A}\\) from inflating when a policy temporarily exits the safe region, cap measured improvement at the maximum performance achieved within confirmed SOE and Lyapunov constraints:

{% katex(block=true) %}
\mathbb{A}_{\text{constrained}} = \frac{\min(P_1, P_{\max}) - P_0}{\sigma}
{% end %}

where {% katex() %}P_{\max}{% end %} is the highest performance observed across trials with valid SOE and Lyapunov certificates.

**Practical implementation for edge deployment**:

1. **Define \\(V(x)\\)**: Use a domain-specific stability metric. For altitude control: {% katex() %}V(x) = \sum_i (h_i - h_{\text{target}})^2{% end %}. For inter-vehicle spacing: {% katex() %}V(x) = \sum_i (d_i - d_{\text{safe}})^2{% end %}.

2. **Estimate \\(\dot{V}\\)**: Sample-based finite-difference over \\(N\\) observations:

{% katex(block=true) %}
\dot{V}(x) \approx \frac{1}{N} \sum_{i=1}^{N} \frac{V(x_{t+i}) - V(x_t)}{i \cdot \Delta t}
{% end %}

3. **Set \\(\alpha\\)**: Choose based on required convergence rate. {% katex() %}\alpha \in [0.1,\, 1.0]\ \text{s}^{-1}{% end %} covers most edge deployments; faster dynamics require higher \\(\alpha\\).

4. **Monitor basin occupancy**: Track the fraction of time the system spends in \\(\mathcal{B}\\):

{% katex(block=true) %}
\text{basin\_occupancy} = \frac{\displaystyle\sum_{t} \mathbf{1}[x_t \in \mathcal{B}]}{T_{\text{total}}}
{% end %}

Alert if occupancy falls below 0.95 — the system is approaching the boundary of the stability region.

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} example**: Set {% katex() %}V(x) = \sum_i (h_i - h_{\text{target}})^2{% end %} (aggregate altitude error across the swarm). With {% katex() %}\alpha = 0.5\ \text{s}^{-1}{% end %} and \\(N = 10\\) {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} samples for the \\(\dot{V}\\) estimate, each learning cycle costs 10 scalar comparisons per drone. Basin occupancy below 0.95 triggers a learning-rate rollback.

### Game-Theoretic Extension: Anti-Fragility as an Evolutionarily Stable Strategy

Evolutionary game theory provides a stronger justification for building {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} in: in any fleet where nodes copy better-performing neighbors' policies, the {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} policy is an **Evolutionarily Stable Strategy (ESS)** — it cannot be invaded by fragile alternatives.

**ESS condition**: {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} policy \\(\theta^\*\\) satisfies {% katex() %}f(\theta^*, \theta^*) \geq f(\theta\', \theta^*){% end %} for all \\(\theta\' \neq \theta^\*\\), with strict inequality against any fragile mutant. Stress events always eventually occur; {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} policies convert them into gains while fragile ones do not.

**ESS holds when** {% katex() %}\mathbb{E}[\text{mission duration}] \cdot \mu_{\text{stress}} > 1{% end %} — i.e., the expected number of stress events per mission exceeds 1. For shorter deployments, a fragile policy maximizing immediate performance may dominate.

**Practical implication**: Weight {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %}-propagated policy updates by \\(\mathbb{A}\\): nodes with \\(\mathbb{A} > 1\\) propagate their parameters more aggressively. {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} policies spread faster through the fleet — exactly what ESS predicts under selection pressure.

The concept of {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}, formalized by Nassim Nicholas Taleb, distinguishes three responses to stress:

<style>
#tbl_fragility + table th:first-of-type { width: 20%; }
#tbl_fragility + table th:nth-of-type(2) { width: 25%; }
#tbl_fragility + table th:nth-of-type(3) { width: 25%; }
#tbl_fragility + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_fragility"></div>

| Category | Response to Stress | Example | Mathematical Signature |
| :--- | :--- | :--- | :--- |
| **Fragile** | Breaks, degrades | Porcelain cup | Concave: {% katex() %}\frac{d^2P}{d\sigma^2} < 0{% end %} |
| **Resilient** | Returns to baseline | Rubber ball | Linear: {% katex() %}\frac{d^2P}{d\sigma^2} = 0{% end %} |
| **Anti-fragile** | Improves beyond baseline | Muscle, immune system | Convex: {% katex() %}\frac{d^2P}{d\sigma^2} > 0{% end %} |

The three archetypes map to distinct curvatures of the performance function {% katex() %}P_{\text{perf}}(\sigma){% end %}, where \\(P_0\\) is baseline performance: fragile (concave, {% katex() %}d^2P_{\text{perf}}/d\sigma^2 < 0{% end %}), resilient (linear), and {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters") %}anti-fragile{% end %} (convex, {% katex() %}d^2P_{\text{perf}}/d\sigma^2 > 0{% end %} — as established in Definition 15).

**Visual Comparison of Response Types**:

The chart below plots performance against stress magnitude for each archetype; the key pattern is that the {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} curve rises above baseline at moderate stress before turning down at extreme stress, while the fragile curve falls off immediately.

<div style="margin:1.5em 0;">
<canvas id="chart-stress-response"
        aria-label="Animated chart: System Response to Stress comparing fragile, resilient, and anti-fragile curves"
        width="700" height="440"
        style="width:100%;height:auto;border:1px solid #e0e0e0;border-radius:4px;background:#fff;"></canvas>
<script>
(function(){
  var canvas = document.getElementById('chart-stress-response');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var M = {top:50, right:20, bottom:80, left:68};
  var pw = W - M.left - M.right, ph = H - M.top - M.bottom;
  var xMax = 10, yMin = 0, yMax = 160;
  var series = [
    { label:'Fragile (concave)',    color:'#e53935', vals:[100,98,92,82,68,50,28,2,0,0,0] },
    { label:'Resilient (flat)',     color:'#1976d2', vals:[100,100,100,100,100,100,100,100,100,100,100] },
    { label:'Anti-fragile (convex)',color:'#2e7d32', vals:[100,102,108,118,130,140,145,142,130,110,80] }
  ];
  function tx(s){ return M.left + (s/xMax)*pw; }
  function ty(p){ return M.top + ph - ((p-yMin)/(yMax-yMin))*ph; }
  function drawGrid(){
    ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.font='12px sans-serif'; ctx.fillStyle='#555';
    for(var p=0;p<=150;p+=25){
      var y=ty(p);
      ctx.strokeStyle=p===100?'#ccc':'#eee'; ctx.lineWidth=p===100?1.2:0.8;
      ctx.beginPath(); ctx.moveTo(M.left,y); ctx.lineTo(M.left+pw,y); ctx.stroke();
      ctx.fillText(p,M.left-8,y);
    }
    ctx.textAlign='center'; ctx.textBaseline='top';
    for(var s=0;s<=10;s+=2){
      var x=tx(s);
      ctx.strokeStyle='#eee'; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.moveTo(x,M.top); ctx.lineTo(x,M.top+ph); ctx.stroke();
      ctx.fillStyle='#555'; ctx.fillText(s,x,M.top+ph+8);
    }
    ctx.strokeStyle='#333'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(M.left,M.top); ctx.lineTo(M.left,M.top+ph); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M.left,M.top+ph); ctx.lineTo(M.left+pw,M.top+ph); ctx.stroke();
    ctx.fillStyle='#333'; ctx.font='bold 13px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText('Stress Magnitude \u03c3',M.left+pw/2,M.top+ph+44);
    ctx.save(); ctx.translate(16,M.top+ph/2); ctx.rotate(-Math.PI/2);
    ctx.textBaseline='middle'; ctx.fillText('Performance P(\u03c3)',0,0); ctx.restore();
    ctx.font='bold 14px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('System Response to Stress',M.left+pw/2,10);
  }
  function drawLegend(){
    ctx.font='12px sans-serif';
    var sw=24, sg=8, ig=28, totalW=0;
    for(var i=0;i<series.length;i++){
      totalW+=sw+sg+ctx.measureText(series[i].label).width;
      if(i<series.length-1) totalW+=ig;
    }
    var lx=M.left+(pw-totalW)/2, ly=M.top+ph+58;
    ctx.textBaseline='middle';
    for(var i=0;i<series.length;i++){
      ctx.strokeStyle=series[i].color; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx+sw,ly); ctx.stroke();
      lx+=sw+sg;
      ctx.fillStyle='#333'; ctx.textAlign='left';
      ctx.fillText(series[i].label,lx,ly);
      lx+=ctx.measureText(series[i].label).width+ig;
    }
  }
  function drawSeries(maxX){
    for(var si=0;si<series.length;si++){
      var vals=series[si].vals;
      ctx.strokeStyle=series[si].color; ctx.lineWidth=2.5;
      ctx.lineJoin='round'; ctx.lineCap='round';
      ctx.beginPath();
      var started=false;
      for(var i=0;i<vals.length;i++){
        if(i>maxX) break;
        var x=tx(i),y=ty(vals[i]);
        if(!started){ctx.moveTo(x,y);started=true;}else{ctx.lineTo(x,y);}
      }
      var fi=Math.floor(maxX);
      if(fi<vals.length-1&&maxX<xMax){
        var frac=maxX-fi;
        ctx.lineTo(tx(fi)+frac*(tx(fi+1)-tx(fi)), ty(vals[fi]+frac*(vals[fi+1]-vals[fi])));
      }
      ctx.stroke();
    }
  }
  var startTime=null, DURATION=2800;
  function frame(ts){
    if(!startTime) startTime=ts;
    var t=Math.min(1,(ts-startTime)/DURATION);
    var ease=t<0.5?2*t*t:-1+(4-2*t)*t;
    ctx.clearRect(0,0,W,H); drawGrid(); drawSeries(ease*xMax); drawLegend();
    if(t<1) requestAnimationFrame(frame);
  }
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(e,o){if(e[0].isIntersecting){o.disconnect();requestAnimationFrame(frame);}},{threshold:0.2}).observe(canvas);
  } else { requestAnimationFrame(frame); }
})();
</script>
</div>

**Key observations from the curves**:
- **Fragile systems** (red) degrade quadratically - small stresses cause small degradation, but stress compounds
- **Resilient systems** (blue) maintain baseline - stress is absorbed but provides no improvement
- **{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} systems** (green) improve with moderate stress, but exhibit bounded improvement - extreme stress (\\(\sigma > \sigma^\*\\)) eventually causes degradation

**Bounded Anti-Fragility Region**:

Real systems exhibit *bounded* {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}: convex response for moderate stress \\(\sigma < \sigma^\*\\), transitioning to concave for extreme stress. Exercise strengthens muscle up to a point; beyond that point, it causes injury. The design goal is to keep the system operating in the convex regime where stress improves performance.

**\\(\sigma_H\\) calibration procedure**: \\(\sigma_H\\) (destructive zone onset) is a measured physical property, not a design parameter. Measure it as follows: (1) run \\(N \geq 30\\) controlled stress trials at increasing \\(\sigma\\) values, recording \\(A = (P_1 - P_0)/\sigma\\) after each; (2) fit a quadratic to \\(A(\sigma)\\); the root where \\(A = 0\\) is the empirical \\(\sigma_H\\); (3) set operational {% katex() %}\sigma_{\max} = 0.7 \cdot \sigma_H{% end %} as a 30\% safety margin. **{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} measurement**: 30-day chaos runs (visible in the {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} chart) showed \\(A > 0\\) for all partition durations up to 47 minutes. \\(A\\) fell below zero at 52-minute partitions — the swarm loses spatial coherence beyond drone fuel margin at that point. Empirical \\(\sigma_H \approx 50\\) min; {% katex() %}\sigma_{\max} = 35{% end %} min. Any {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} scenario claiming {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} must verify that partition duration stays below 35 minutes. For systems without 30-day historical data: start with {% katex() %}\sigma_{\max} = 10{% end %} min and extend by 5 min per deployment cycle until {% katex() %}A(\sigma_{\max}) < 0{% end %} is observed.

**Statistical validity of \\(A > 0\\) claims**: Measuring \\(A = (P_1 - P_0)/\sigma > 0\\) in a single trial is a point estimate, not a hypothesis test. The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} claim \\(A > 0\\) is an assertion about the true mean performance response, not an observed sample — a single trial has variance. To claim statistically significant {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} at stress level \\(\sigma_k\\), apply a one-sample Welch t-test against the null hypothesis \\(H_0: A \leq 0\\): collect \\(N \geq 30\\) independent stress-recovery cycles at \\(\sigma_k\\), compute the sample mean \\(\bar{A}\\) and standard deviation \\(s_A\\), and reject \\(H_0\\) at 95% confidence when {% katex() %}\bar{A} / (s_A / \sqrt{N}) > t_{0.05, N-1}{% end %}. The 95% confidence lower bound on \\(A\\) is {% katex() %}\bar{A} - t_{0.05, N-1} \cdot s_A / \sqrt{N}{% end %}; report this lower bound, not \\(\bar{A}\\), as the certified {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient. For the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} 30-day dataset: \\(N = 30\\) partition events at 47-minute partitions, \\(\bar{A} = +0.18\\), \\(s_A = 0.09\\); lower bound {% katex() %}= 0.18 - 1.699 \times 0.09/\sqrt{30} \approx 0.18 - 0.028 = +0.152 > 0{% end %}, confirming statistically significant {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}. A system with \\(\bar{A} = +0.05\\) and \\(s_A = 0.12\\) at \\(N = 30\\) yields a negative lower bound and cannot claim certified {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} — more data or larger stress events are needed.

The diagram below partitions the stress axis into four operating zones, showing how performance trajectory and learning value shift as stress magnitude crosses each threshold.

{% mermaid() %}
flowchart LR
    subgraph "sigma < sigma_low"
        A["Insufficient Stress<br/>No learning signal<br/>Performance: Baseline"]
    end

    subgraph "sigma_low <= sigma < sigma*"
        B["Optimal Stress Zone<br/>Maximum learning<br/>Performance: Improving"]
    end

    subgraph "sigma* <= sigma < sigma_max"
        C["High Stress Zone<br/>Diminishing returns<br/>Performance: Plateau"]
    end

    subgraph "sigma >= sigma_max"
        D["Destructive Stress<br/>System damage<br/>Performance: Degrading"]
    end

    A -->|"Increase sigma"| B
    B -->|"Increase sigma"| C
    C -->|"Increase sigma"| D

    style A fill:#fff9c4,stroke:#f9a825
    style B fill:#c8e6c9,stroke:#388e3c
    style C fill:#fff3e0,stroke:#f57c00
    style D fill:#ffcdd2,stroke:#c62828
{% end %}

**Anti-Fragility Zones** (derived from convexity analysis):

The performance slope {% katex() %}dP_{\text{perf}}/d\sigma{% end %} is governed by information gain {% katex() %}I(\sigma) = -\log_2 P(\text{event}|\sigma){% end %} and learning rate \\(\eta(\sigma)\\), combined as {% katex() %}dP_{\text{perf}}/d\sigma = \eta(\sigma) \cdot I(\sigma) \cdot \text{sign}(\nabla_\theta U){% end %}. The Insufficient Stress zone (\\(\sigma < \sigma_L\\)) provides near-zero information gain from common events — the system stagnates without adaptive signal. The Anti-Fragile Zone ({% katex() %}\sigma_L \leq \sigma < \sigma^*{% end %}) is the operational sweet spot where rare events yield maximum information and the performance slope is strictly positive. The High Stress Zone ({% katex() %}\sigma^* \leq \sigma < \sigma_H{% end %}) shows diminishing returns as information saturates and the slope flattens. The Brittle Zone ({% katex() %}\sigma \geq \sigma_H{% end %}) exceeds recovery capacity: information is saturated but capacity-limited, the slope turns negative, and continued exposure causes irreversible degradation. Thresholds \\(\sigma_L, \sigma^\*, \sigma_H\\) depend on system capacity and learning mechanism.

**Critical warning**: In the destructive zone (\\(\sigma \geq \sigma_H\\)), the {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient {% katex() %}\mathbb{A} = (P_1 - P_0)/\sigma{% end %} becomes **negative**. The system is no longer {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} - it is fragile. Continued stress exposure causes permanent degradation, not learning. Systems must detect when \\(\sigma\\) approaches \\(\sigma_H\\) and either shed load or enter protective shutdown. The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} framework provides no benefit in the destructive zone; standard resilience (minimize damage) applies.

The architecture should be designed to (1) expose the system to the optimal stress zone regularly (through chaos engineering or operational deployment), (2) avoid the destructive zone through graceful degradation and \\(\sigma_H\\) detection, and (3) maximize information extraction when stress occurs.

**Anti-Fragility Coefficient Over Time**:

The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient \\(\mathbb{A}\\) evolves as the system accumulates stress exposure and learning:

The chart below tracks \\(\mathbb{A}\\) as a percentage of its theoretical maximum across 30 days of {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} operation, animating the learning curve from zero to 95% of the design ceiling.

<div style="margin:1.5em 0;">
<canvas id="chart-antifragility"
        aria-label="Animated chart: Anti-Fragility Coefficient Evolution over 30 days for RAVEN deployment"
        width="700" height="380"
        style="width:100%;height:auto;border:1px solid #e0e0e0;border-radius:4px;background:#fff;"></canvas>
<script>
(function(){
  var canvas = document.getElementById('chart-antifragility');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var M = {top:50, right:50, bottom:58, left:80};
  var pw = W-M.left-M.right, ph = H-M.top-M.bottom;
  var xMax = 30, yMin = 0, yMax = 105;
  var pts = [[0,0],[5,40],[10,65],[15,78],[20,88],[25,93],[30,95]];
  function tx(d){ return M.left+(d/xMax)*pw; }
  function ty(v){ return M.top+ph-((v-yMin)/(yMax-yMin))*ph; }
  function interp(d){
    for(var i=0;i<pts.length-1;i++){
      if(d>=pts[i][0]&&d<=pts[i+1][0]){
        var t=(d-pts[i][0])/(pts[i+1][0]-pts[i][0]);
        return pts[i][1]+t*(pts[i+1][1]-pts[i][1]);
      }
    }
    return pts[pts.length-1][1];
  }
  function drawGrid(){
    ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.font='12px sans-serif'; ctx.fillStyle='#555';
    for(var v=0;v<=100;v+=20){
      var y=ty(v);
      ctx.strokeStyle='#eee'; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.moveTo(M.left,y); ctx.lineTo(M.left+pw,y); ctx.stroke();
      ctx.fillText(v+'%',M.left-8,y);
    }
    ctx.textAlign='center'; ctx.textBaseline='top';
    for(var d=0;d<=30;d+=5){
      var x=tx(d);
      ctx.strokeStyle='#eee'; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.moveTo(x,M.top); ctx.lineTo(x,M.top+ph); ctx.stroke();
      ctx.fillStyle='#555'; ctx.fillText(d,x,M.top+ph+8);
    }
    ctx.strokeStyle='#333'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(M.left,M.top); ctx.lineTo(M.left,M.top+ph); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M.left,M.top+ph); ctx.lineTo(M.left+pw,M.top+ph); ctx.stroke();
    ctx.fillStyle='#333'; ctx.font='bold 13px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText('Days',M.left+pw/2,H-4);
    ctx.save(); ctx.translate(18,M.top+ph/2); ctx.rotate(-Math.PI/2);
    ctx.textBaseline='middle'; ctx.fillText('A as % of theoretical maximum',0,0); ctx.restore();
    ctx.font='bold 14px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('Anti-Fragility Coefficient Evolution \u2014 RAVEN 30-day deployment',M.left+pw/2,10);
  }
  function drawCurve(dayFrac){
    var STEPS=300;
    ctx.strokeStyle='#2e7d32'; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath();
    for(var s=0;s<=STEPS;s++){
      var d=(dayFrac/STEPS)*s; if(d>dayFrac) break;
      var x=tx(d),y=ty(interp(d));
      if(s===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    var cv=interp(dayFrac), cx=tx(dayFrac), cy=ty(cv);
    ctx.fillStyle='#2e7d32';
    ctx.beginPath(); ctx.arc(cx,cy,5,0,2*Math.PI); ctx.fill();
    var label='Day '+Math.round(dayFrac)+': '+Math.round(cv)+'%';
    ctx.fillStyle='#1a1a1a'; ctx.font='bold 12px sans-serif';
    ctx.textAlign=cx>M.left+pw*0.7?'right':'left';
    ctx.textBaseline='bottom';
    ctx.fillText(label,ctx.textAlign==='right'?cx-10:cx+10,cy-6);
    ctx.font='11px sans-serif'; ctx.fillStyle='#666'; ctx.textAlign='center'; ctx.textBaseline='top';
    if(dayFrac>=10) ctx.fillText('Rapid learning',tx(5),ty(18));
    if(dayFrac>=20) ctx.fillText('Diminishing returns',tx(15),ty(18));
    if(dayFrac>=28) ctx.fillText('Asymptotic',tx(27),ty(18));
  }
  var startTime=null, DURATION=3500;
  function frame(ts){
    if(!startTime) startTime=ts;
    var t=Math.min(1,(ts-startTime)/DURATION);
    var ease=1-Math.pow(1-t,2.5);
    ctx.clearRect(0,0,W,H); drawGrid(); drawCurve(ease*xMax);
    if(t<1) requestAnimationFrame(frame);
  }
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(e,o){if(e[0].isIntersecting){o.disconnect();requestAnimationFrame(frame);}},{threshold:0.2}).observe(canvas);
  } else { requestAnimationFrame(frame); }
})();
</script>
</div>

**Interpreting the coefficient evolution** ({% katex() %}\mathbb{A}_{\max} = 0.40{% end %} = 100%):
- **Day 0**: {% katex() %}\mathbb{A} = 0{% end %} — system has no operational learning
- **Days 1-10**: Rapid improvement to 65% of maximum as initial stress events (2 partitions, 1 drone loss) provide high-value information
- **Days 10-20**: Continued improvement with diminishing returns, reaching 88% of maximum as easy optimizations are captured
- **Days 20-30**: Asymptotic approach to maximum (93% to 95%) as remaining improvements require rarer events

For edge systems, stress includes:
- Partition events (connectivity disruption)
- Resource scarcity (power, bandwidth, compute)
- Adversarial interference (jamming, spoofing)
- Component failure (drone loss, sensor degradation)
- Environmental variation (terrain, weather)

A **resilient** edge system survives these stresses and returns to baseline. An **{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %}** edge system uses these stresses to improve its future performance. These require different architectural choices.

### Anti-Fragility in Technical Systems

How can engineered systems exhibit {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} when biological systems achieve it through millions of years of evolution?

The mechanism is **information extraction from stress events**. Every failure, partition, or degradation carries information about the system's true operating envelope. {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} architectures are designed to capture this information and incorporate it into future behavior.

Four mechanisms enable {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} in technical systems:

**1. Learning**: Update models from failure data
- Connectivity models become more accurate with each partition event
- Anomaly detectors calibrate with each detected and confirmed anomaly
- Healing policies refine success probability estimates with each action

**2. Adaptation**: Adjust parameters based on observed conditions
- Formation spacing adapts to terrain-specific radio propagation
- Timeout thresholds adapt to observed network latency distributions
- Resource budgets adapt to observed consumption patterns

**3. Evolution**: Replace components with better variants
- Alternative algorithms compete; stress reveals which performs better
- Redundant pathways prove their value during primary pathway failure
- Component designs improve based on failure mode analysis

**4. Pruning**: Remove unnecessary complexity revealed by stress
- Features unused during stress can be eliminated
- Fallback mechanisms that never activated can be simplified
- Coordination overhead that stress exposed as unnecessary can be removed

**Stress is information to extract, not just a threat to survive**. Every partition event teaches you about connectivity patterns. Every drone loss teaches you about failure modes. Every adversarial jamming episode teaches you about adversary tactics. An {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} system captures these lessons.

Consider the immune system analogy: exposure to pathogens creates antibodies that provide future protection. The edge equivalent: exposure to jamming creates detector signatures that provide future jamming detection. But unlike biological immunity, which evolved over millions of years, edge {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} must be *designed* - we must intentionally create the mechanisms for learning from stress.

**SOE-constrained learning loop**: The four mechanisms (Learning, Adaptation, Evolution, Pruning) all operate inside the same safety wrapper:

{% mermaid() %}
graph TD
    subgraph LP["Learning Phase"]
        A["Stress event σ"] --> B["Compute gradient ∇U"]
        B --> C{"SOE bounds check<br/>is ‖Δθ‖ within δ_safe?"}
        C -->|"Exceeds bound"| D["Scale Δθ to δ_safe"]
    end

    subgraph SC["Stability Check"]
        E["Apply update θ + Δθ"]
        E --> F{"Lyapunov check<br/>is dV/dt ≤ −αV?"}
        F -->|"Fails"| G["Revert to θ_prev"]
        F -->|"Passes"| H["Accept update"]
    end

    subgraph OUT["Outcome"]
        G --> I["Log failure mode"]
        H --> J["Update P₁ estimate"]
        I --> K["Continue operation"]
        J --> K
    end

    C -->|"Within bound"| E
    D --> E

    style C fill:#fff9c4,stroke:#f9a825
    style F fill:#ffcdd2,stroke:#c62828
    style H fill:#c8e6c9,stroke:#388e3c
{% end %}

SOE acts as the first guardrail — every update is magnitude-checked before being applied. The Lyapunov criterion is the second — stability is verified against observed trajectory data before the update is committed. Both checks add one \\(O(d)\\) inner product to the learning step, where \\(d\\) is parameter dimension.

> **Cognitive Map**: The anti-fragility definition section establishes the theoretical foundation and its safety constraints. The convexity condition (\\(d^2P/d\sigma^2 > 0\\)) defines what anti-fragility *is*. The parameter update gradient ({% katex() %}\theta_{t+1} = \theta_t + \eta \nabla_\theta U{% end %}) defines how the system *learns* from stress. The Safe Operating Envelope and Lyapunov criterion together define what *prevents* the learning from diverging. The game-theoretic extension proves why any fleet that copies successful policies will eventually converge to anti-fragile ones — it is an Evolutionarily Stable Strategy when stress events occur more than once per mission.

---

## Stress as Information

> **Problem**: Normal operation hides system structure. Dependencies between components are only visible when they fail — a backup radio that shares a power bus with the primary provides zero redundancy during the power transients it was supposed to guard against. You cannot discover this from logs of successful operations.
> **Solution**: Treat stress events as information sources. The Stress-Information Duality (Proposition 17) formalizes this: {% katex() %}I = -\log_2 P(\text{failure}){% end %} — rare failures carry the most learning signal. Design the system to log comprehensively on every stress event, weight parameter updates by information content, and inject deliberate failures (chaos engineering) to surface hidden dependencies before they cause production incidents.
> **Trade-off**: The duality applies to stationary environments. In adversarial settings, an opponent can manipulate {% katex() %}P(\text{failure}){% end %} — making previously rare failures common — which inflates apparent event frequency while reducing Shannon surprise. In contested environments, use the adversarial non-stationarity detector (Definition 34) rather than rarity alone to identify high-value learning events.

### Failures Reveal Hidden Dependencies

Normal operation is a poor teacher. When everything works, dependencies remain invisible. Components interact through well-defined interfaces, messages flow through established channels, and the system behaves as designed. This smooth operation provides no information about what would happen if components *failed* to interact correctly.

Stress exposes the truth.

{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} vehicle 4 experienced a power system transient during a partition event. The post-incident analysis revealed a hidden dependency: the backup radio shared a power bus with the primary radio. Both radios failed simultaneously because a transient on the shared bus affected both units. Under normal operation, this dependency was invisible - both radios drew power successfully. Under stress, the dependency became catastrophic - both radios failed together, eliminating redundancy precisely when it was needed.

The same pattern — a hidden shared resource that makes two ostensibly independent components fail together — appears across all system types, as the following examples illustrate.

<style>
#tbl_hidden_deps + table th:first-of-type { width: 25%; }
#tbl_hidden_deps + table th:nth-of-type(2) { width: 35%; }
#tbl_hidden_deps + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_hidden_deps"></div>

| Scenario | Hidden Dependency | Revealed By |
| :--- | :--- | :--- |
| CONVOY vehicle 4 | Primary/backup radio share power bus | Power transient |
| RAVEN cluster | All drones use same GPS constellation | GPS denial attack |
| {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} mesh | Two paths share single relay node | Relay failure |
| Cloud failover | Primary/secondary share DNS provider | DNS outage |

<span id="prop-17"></span>
**Proposition 17** (Stress-Information Duality). *The information content of a stress event is inversely related to its probability:*

{% katex(block=true) %}
I(\text{failure}) = -\log_2 P(\text{failure})
{% end %}

- **Use**: Computes information content (bits) of each stress event as {% katex() %}I = -\log_2 P(\text{event}){% end %}; weight parameter updates by {% katex() %}I(\text{event})/I_{\max}{% end %} after each stress event to prevent uniform learning that wastes adaptation budget on frequent low-information events.
- **Parameters**: {% katex() %}P(\text{event}){% end %} estimated from {% katex() %}\geq 30{% end %} historical events; {% katex() %}I_{\max} = \log_2(1/P_{\min}){% end %} for the rarest observed event type.
- **Field note**: A once-per-year partition carries \\(3{-}5\\times\\) more learning signal than a daily hiccup — weight it proportionally in your update rule.

> **Physical translation**: {% katex() %}I(\text{failure}) = -\log_2 P(\text{failure}){% end %} is Shannon self-information — the number of bits needed to encode the surprise of seeing this event. A failure that occurs 50% of the time (\\(P = 0.5\\)) carries 1 bit: you already expected it. A failure that occurs 1-in-1000 times (\\(P = 0.001\\)) carries about 10 bits: the system's model of the world was significantly wrong. The practical consequence: don't spend equal engineering effort analyzing every alarm. Allocate analysis time proportional to \\(I\\) — rare failures deserve \\(10\\times\\) more investigation than common ones.

*Rare failures carry maximum learning value. A failure with probability {% katex() %}10^{-3}{% end %} carries approximately 10 bits of information, while a failure with probability {% katex() %}10^{-1}{% end %} carries only 3.3 bits.*

**Adversarial non-stationarity caveat**: Prop 17 applies when {% katex() %}P(\text{failure}){% end %} is a property of the stationary environment. Under the adversarial Markov game (Def 32), the adversary controls the jamming schedule and can therefore set \\(P(\sigma)\\). An adversary who learns your anomaly detection threshold can make harmful stress *common* — driving {% katex() %}P(\text{failure}){% end %} from {% katex() %}10^{-3}{% end %} to {% katex() %}10^{-1}{% end %} reduces Shannon surprise from 10 bits to 3.3 bits while potentially increasing impact. In contested environments, use Prop 17 for offline post-hoc calibration only. For real-time learning prioritization, use the action-correlation CUSUM (Def 34): the adversarial signature is correlation between defender actions and \\(Q\\)-changes, not event rarity. An adversary deliberately making failures common cannot fake the absence of action-correlation without abandoning their adaptive strategy.

*Proof*: Direct application of Shannon information theory. Self-information is defined as \\(I(x) = -\log P(x)\\), which is the fundamental measure of surprise associated with observing event \\(x\\).
**Corollary 6**. *{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} systems should systematically capture and analyze rare events, as these provide the highest-value learning opportunities per occurrence.*

**Design principle**: Instrument stress events comprehensively. When things break, log everything:
- System state immediately before failure
- Sequence of events leading to failure
- Components involved in failure cascade
- Recovery actions attempted and their results
- Final state after recovery or degradation

This logging creates the dataset for post-hoc analysis and model improvement. The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} system treats every failure as a learning opportunity.

### Partition Behavior Exposes Assumptions

Every distributed system embodies implicit coordination assumptions. Developers make them unconsciously; partition events test them empirically.

{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s original design assumed: "At least one drone in the swarm has GPS lock at all times." This assumption was implicit - no document stated it, but the navigation algorithms depended on it. During a combined partition-and-GPS-denial event, the assumption was violated. No drone had GPS lock. The navigation algorithms failed to converge.

Post-incident analysis documented the assumption and its failure mode. The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} response:
1. **Track GPS availability explicitly**: Each drone reports GPS status; swarm maintains GPS availability estimate
2. **Implement fallback navigation**: Inertial navigation with terrain matching as backup
3. **Test assumption boundaries**: Chaos engineering exercises deliberately violate the assumption

<span id="scenario-failstream"></span>

### Commercial Application: {% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} Production Fault Injection

{% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} implements chaos engineering for a streaming service. Rather than waiting for production failures, {% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} deliberately injects failures - converting random stress into systematic learning.

**Chaos engineering**: Traditional reliability engineering minimizes failures. Chaos engineering induces failures in controlled conditions to discover failure modes before production incidents. The system learns from deliberate stress (\\(\mathbb{A} > 0\\) for induced failures) rather than only from accidental stress.

**{% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} failure injection categories**: The six rows below span process, availability zone, region, network, dependency, and state failure classes; the Learning Target column identifies the specific system behavior each injection is designed to exercise.

<style>
#tbl_chaos_categories + table th:first-of-type { width: 22%; }
#tbl_chaos_categories + table th:nth-of-type(2) { width: 30%; }
#tbl_chaos_categories + table th:nth-of-type(3) { width: 25%; }
#tbl_chaos_categories + table th:nth-of-type(4) { width: 23%; }
</style>
<div id="tbl_chaos_categories"></div>

| Category | Injection Method | Learning Target | Frequency |
| :--- | :--- | :--- | :--- |
| Instance failure | Terminate random compute instances | Auto-scaling, load balancing | Continuous (business hours) |
| Availability zone | Block traffic to entire AZ | Multi-AZ failover | Weekly |
| Region failure | Simulate region outage | Cross-region routing | Monthly |
| Network partition | Inject latency/packet loss | Timeout tuning, retry logic | Daily |
| Dependency failure | Block calls to downstream service | Circuit breakers, fallbacks | Continuous |
| State corruption | Inject invalid cache entries | Validation, recovery | Weekly |

**The improvement loop**: Each chaos experiment follows a structured protocol; note that both paths (hypothesis confirmed and hypothesis refuted) feed back into new hypotheses, so every experiment contributes to learning.

{% mermaid() %}
graph LR
    H["Form Hypothesis<br/>'System handles X'"] --> E["Execute Experiment<br/>Inject failure X"]
    E --> O["Observe Behavior<br/>Metrics, logs, user impact"]
    O --> A{"Hypothesis<br/>Validated?"}
    A -->|"Yes"| C["Confidence Increased<br/>Document resilience"]
    A -->|"No"| F["Fix Discovered<br/>Implement improvement"]
    F --> R["Re-run Experiment<br/>Verify fix"]
    R --> C
    C --> H

    style H fill:#e3f2fd,stroke:#1976d2
    style F fill:#ffcdd2,stroke:#c62828
    style C fill:#c8e6c9,stroke:#388e3c
{% end %}

**{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %} coefficient derivation**:

The chaos engineering {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient {% katex() %}\mathbb{A}_{\text{chaos}}{% end %} is the total reduction in mean time to recovery (MTTR) divided by the cumulative stress injected across all \\(N\\) experiments, where {% katex() %}\text{MTTR}_0{% end %} is the pre-program baseline and {% katex() %}\text{MTTR}_T{% end %} is the post-program measured value.

{% katex(block=true) %}
\mathbb{A}_{\text{chaos}} = \frac{\Delta \text{MTTR}}{N_{\text{exp}} \cdot \bar{\sigma}} = \frac{\text{MTTR}_0 - \text{MTTR}_T}{\sum_{i=1}^{N} \sigma_i}
{% end %}

where \\(\sigma_i\\) is the severity of experiment \\(i\\) (dimensionless, 0–1 scale), and {% katex() %}\mathbb{A}_{\text{chaos}}{% end %} has units of MTTR reduction per unit cumulative stress (minutes per stress-unit).

**Assumption Set** {% katex() %}\mathcal{A}_{CE}{% end %}:
- \\(A_1\\): Each experiment reveals at most one hidden dependency
- \\(A_2\\): Fixes are independent (no regression)
- \\(A_3\\): MTTR improvement is additive per fix

Under {% katex() %}\mathcal{A}_{CE}{% end %}, the expected MTTR reduction is the product of the number of experiments, the per-experiment probability of discovering a fixable issue, and the average MTTR improvement each fix delivers.

{% katex(block=true) %}
\mathbb{E}[\Delta \text{MTTR}] = N_{\text{exp}} \cdot P(\text{discover}) \cdot \bar{\Delta}_{\text{fix}}
{% end %}

where {% katex() %}P(\text{discover}){% end %} is the probability each experiment reveals a fixable issue and {% katex() %}\bar{\Delta}_{\text{fix}}{% end %} is the average MTTR improvement per fix.

**Utility improvement**:

This formula gives the net gain from running the chaos experiment program: expected MTTR reduction converted to an availability dollar value, minus the cost of running each experiment.

{% katex(block=true) %}
\Delta U = \mathbb{E}[\Delta \text{MTTR}] \cdot V_{\text{availability}} - N_{\text{exp}} \cdot C_{\text{experiment}}
{% end %}

{% katex() %}\text{sign}(\Delta U) > 0{% end %} when {% katex() %}P(\text{discover}) \cdot \bar{\Delta}_{\text{fix}} \cdot V > C_{\text{experiment}}{% end %} - i.e., the expected value of discovery exceeds the cost of experimentation.

**Stress-information capture architecture**: {% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} captures maximum information from each experiment. The table below lists the six data categories recorded per experiment, the analytical purpose each serves, and how long each category is retained.

| Data Captured | Purpose | Retention |
| :--- | :--- | :--- |
| Pre-experiment metrics baseline | Establish normal behavior | 90 days |
| Experiment parameters | Reproducibility | Indefinite |
| System behavior during failure | Failure mode analysis | 30 days |
| Recovery timeline and actions | MTTR analysis | Indefinite |
| User impact metrics | Severity assessment | Indefinite |
| Post-experiment metrics | Verify recovery | 90 days |

**Graduated chaos**: {% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} doesn't start with region-level failures. The chaos engineering maturity model progresses:

1. **Level 1**: Terminate individual instances (minimal blast radius)
2. **Level 2**: Inject network latency and packet loss
3. **Level 3**: Kill dependent services
4. **Level 4**: Availability zone failures
5. **Level 5**: Region-level exercises
6. **Level 6**: Multi-region, multi-failure compound scenarios

Each level must demonstrate resilience before progressing. This graduated approach ensures the system can handle basic failures before facing complex ones - a prerequisite structure that mirrors the autonomic capability hierarchy established in the contested-connectivity foundations.

**Edge parallel**: {% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} demonstrates that {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} principles apply beyond tactical edge systems. The same mathematical framework - convex response to stress, information extraction from failures, learning loops - applies to cloud infrastructure, with the chaos experiments serving as controlled stress events.

The pattern generalizes: each stress event converts one implicit assumption into an explicit one, paired with a fallback that handles future violations.

{% katex(block=true) %}
\text{Implicit Assumption} + \text{Stress Event} \rightarrow \text{Explicit Assumption} + \text{Fallback Mechanism}
{% end %}

Common implicit assumptions in edge systems:
- "At least 50% of nodes are reachable at any time"
- "Message delivery latency never exceeds 5 seconds"
- "Power levels provide at least 30 minutes warning before failure"
- "Adversaries cannot physically access hardware"
- "Clock drift between nodes stays below 100ms"

Each assumption represents a failure mode waiting to be exposed. {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} architectures:
1. **Document assumptions explicitly**: Write them down. Put them in the architecture documents.
2. **Instrument assumption violations**: Log when assumptions are violated.
3. **Test assumptions deliberately**: Chaos engineering to verify fallback behavior.
4. **Learn from violations**: Update models and mechanisms when assumptions fail.

### Recording Decisions for Post-Hoc Analysis

Autonomous systems make decisions. {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} autonomous systems *log* their decisions for later analysis. Every autonomous decision gets recorded with:

- **Context**: What did the system know when it decided?
- **Options**: What alternatives were considered?
- **Choice**: What was selected and why?
- **Outcome**: What actually happened?

This decision audit log enables supervised learning: we can train models to make better decisions based on the outcomes of past decisions.

{% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} faced a communication decision during a jamming event. SATCOM was showing degradation with 90% packet loss. HF radio was available but with lower bandwidth. The autonomous system chose HF for priority alerts based on expected delivery probability: SATCOM at 10%, HF at 85%. Alerts were delivered via HF in 12 seconds. SATCOM entered complete denial 60 seconds later, confirming jamming.

Post-incident analysis showed the HF choice was correct - SATCOM would have failed completely. This outcome reinforces the decision policy: "When SATCOM degradation exceeds 80% and HF is available, switch to HF for priority traffic."

The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} insight: **overrides are learning opportunities**. When human operators override autonomous decisions, that override carries information:
- Either the autonomous decision was suboptimal, and the model should be updated
- Or the autonomous decision was correct, and the operator needs better visibility into system reasoning

Both outcomes improve the system. Recording decisions and overrides enables this improvement loop.

> **Cognitive Map**: The stress-as-information section reframes failure events from costs to assets. Proposition 17 provides the weighting function — allocate learning budget proportional to {% katex() %}-\log_2 P{% end %}. The hidden-dependency discovery process (instrument comprehensively, document assumptions, inject deliberate chaos) is the operational implementation. FAILSTREAM demonstrates the commercial pattern: systematic fault injection produces a known dependency map and a measurable MTTR improvement. The Judgment horizon concept at the end establishes the boundary — some high-stakes decisions should route through human override, and those overrides themselves become learning data.

---

## Adaptive Behavior Under Pressure

> **Problem**: Under resource pressure, a system must decide what to drop. Design-time estimates of task importance are static — they cannot account for how actual mission context shifts which tasks matter most.
> **Solution**: Use a utility-per-cost priority function ({% katex() %}\text{Priority}(t) = U(t) \cdot P(t) / C(t){% end %}) to rank tasks for shedding. Let operational outcomes update the utility estimates over time — tasks that prove redundant in practice get lower utility scores; tasks that prove critical get higher ones. The degradation hierarchy itself becomes adaptive.
> **Trade-off**: Dynamic re-tiering and adaptive utility estimates require a feedback loop that must be correct before the next stress event. An incorrect utility estimate learned from one context may be wrong in a different context — anti-fragile load shedding is only as good as the outcome labels it learns from.

### Intelligent Load Shedding

Not all load is equal. Under resource pressure, systems must prioritize - dropping low-value work to preserve high-value work. The question is: what to drop?

Intelligent load shedding requires a utility function. For each task \\(t\\):
- \\(U(t)\\): Utility value if task completes successfully
- \\(C(t)\\): Resource cost to complete task
- \\(P(t)\\): Probability of successful completion

The shedding priority is the utility-per-cost ratio:

{% katex(block=true) %}
\text{Priority}(t) = \frac{U(t) \cdot P(t)}{C(t)}
{% end %}

Tasks with the lowest priority-to-cost ratio are shed first. Tasks are shed in ascending priority order until {% katex() %}R_{\text{available}} \geq R_{\text{required}}{% end %}. If even shedding all non-critical tasks yields {% katex() %}R_{\text{available}} < R_{\mathcal{L}_0}{% end %}, the system transitions to \\(\mathcal{L}_0\\) survival mode regardless of task priorities.

{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} under power stress: the table shows five active tasks ranked by {% katex() %}\text{Priority}(t) = U(t) \cdot P(t) / C(t){% end %}, with the two lowest-priority tasks shed first to preserve mission-critical functions.

<style>
#tbl_shedding + table th:first-of-type { width: 30%; }
#tbl_shedding + table th:nth-of-type(2) { width: 15%; }
#tbl_shedding + table th:nth-of-type(3) { width: 15%; }
#tbl_shedding + table th:nth-of-type(4) { width: 15%; }
#tbl_shedding + table th:nth-of-type(5) { width: 25%; }
</style>
<div id="tbl_shedding"></div>

| Task | Utility | Cost (mW) | Priority | Decision |
| :--- | :--- | :--- | :--- | :--- |
| Threat detection | 100 | 500 | 0.20 | **Keep** (mission-critical) |
| Position reporting | 80 | 200 | 0.40 | **Keep** (fleet coherence) |
| HD video recording | 40 | 800 | 0.05 | **Shed** (reconstructible) |
| Environmental logging | 20 | 100 | 0.20 | Keep until severe stress |
| Telemetry detail | 10 | 150 | 0.07 | **Shed** (summary sufficient) |

The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} insight: **stress reveals true priorities**. Design-time estimates of utility may be wrong. Operational stress shows which tasks *actually* matter. After several stress events, {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s utility estimates updated:
- HD video recording utility decreased (operators rarely used it)
- Environmental logging utility increased (proved valuable for post-analysis)

The load shedding mechanism itself becomes {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %}: stress improves the accuracy of the shedding decisions.

### Feature Degradation Hierarchies

Graceful degradation is well-established in reliable system design. The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} extension is to *learn* optimal degradation paths from operational experience.

The design-time degradation hierarchy for {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} maps each {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier L0-L4 from heartbeat-only survival to full fleet integration; each level requires minimum connectivity and consumes proportionally more energy") %}capability level{% end %} to the minimum connectivity threshold \\(C\\) that justifies it and the resource budget it consumes; operational learning subsequently revised several of these thresholds downward.

<style>
#tbl_degradation + table th:first-of-type { width: 15%; }
#tbl_degradation + table th:nth-of-type(2) { width: 40%; }
#tbl_degradation + table th:nth-of-type(3) { width: 20%; }
#tbl_degradation + table th:nth-of-type(4) { width: 25%; }
</style>
<div id="tbl_degradation"></div>

| Level | Capability | Connectivity | Resource Budget |
| :--- | :--- | :--- | :--- |
| L4 | Full capability: streaming video, ML analytics, prediction | \\(C \geq 0.8\\) | 100% |
| L3 | Summary reporting: compressed updates, basic analytics | \\(C \geq 0.5\\) | 60% |
| L2 | Threat alerts: detection only, minimal context | \\(C \geq 0.3\\) | 35% |
| \\(\mathcal{L}_1\\) | Position beacons: location and status only | \\(C \geq 0.1\\) | 15% |
| \\(\mathcal{L}_0\\) | Emergency distress: survival mode | Always | 5% |

Operational learning updates this hierarchy. After 30 days:
- \\(\mathcal{L}_2\\) threshold adjusted from 0.3 to 0.25 (swarm proved \\(\mathcal{L}_2\\)-capable at lower connectivity)
- \\(\mathcal{L}_3\\) resource budget reduced from 60% to 45% (optimization found more efficient algorithms)
- New intermediate level {% katex() %}\mathcal{L}_{2.5}{% end %} emerged (threat alerts with abbreviated context)

The degradation ladder itself adapts based on observed outcomes. If \\(\mathcal{L}_2\\) alerts prove as effective as \\(\mathcal{L}_3\\) summaries for operator decision-making, the system learns that \\(\mathcal{L}_3\\)'s additional cost provides insufficient marginal value. Future resource pressure will skip directly from \\(\mathcal{L}_4\\) to \\(\mathcal{L}_2\\).

### Quality-of-Service Tiers

Not all consumers of edge data are equal. QoS tiers allocate resources proportionally to consumer importance, forming a strict priority ordering from mission-critical traffic at the top to background logging at the bottom.

{% katex(block=true) %}
\text{Tier 0 (Mission-Critical)} > \text{Tier 1 (Operational)} > \text{Tier 2 (Informational)} > \text{Tier 3 (Logging)}
{% end %}

Resource allocation under pressure:
- **Tier 0**: Guaranteed minimum allocation (e.g., 40% of bandwidth)
- **Tier 1**: Best-effort with priority (e.g., 30% of bandwidth)
- **Tier 2**: Best-effort (e.g., 20% of bandwidth)
- **Tier 3**: Background, preemptible (e.g., 10% of bandwidth)

Under severe pressure, Tier 3 is shed first, then Tier 2, and so on.

The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} extension: **dynamic re-tiering** based on context. {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} normally classifies sensor data as Tier 2 (informational). During an engagement, sensor data elevates to Tier 0 (mission-critical). This re-tiering happens automatically based on threat detection.

Learned re-tiering rules from operations:
- "When threat confidence exceeds 0.7, elevate sensor data to Tier 0"
- "When partition duration exceeds 300s, elevate position data to Tier 0"
- "When reconciliation backlog exceeds 1000 events, demote logging to Tier 3"

These rules emerged from post-hoc analysis of outcomes. The system learned which data classifications led to better mission outcomes under stress.

> **Cognitive Map**: The adaptive behavior section shows anti-fragility applied to resource management. The load-shedding priority function turns task ranking into a single-objective decision. The degradation hierarchy maps connectivity thresholds to capability levels — stress events that force capability drops reveal which thresholds were set too conservatively. QoS tiers assign static priority but allow dynamic re-tiering when context changes. All three mechanisms share the same anti-fragile pattern: stress events update the parameters that govern future stress responses, making each successive resource-pressure event slightly better handled than the last.

---

## Learning from Disconnection

> **Problem**: Edge systems are deployed with design-time parameter estimates that may be wrong for actual operational conditions. A gossip interval tuned for normal traffic may be too slow under dense jamming and wasteful during clear conditions. Static parameters cannot adapt.
> **Solution**: Frame parameter selection as a multi-armed bandit problem. Each candidate parameter value is an "arm." The UCB algorithm balances exploitation (pick the arm with the best observed reward) against exploration (try less-tested arms to verify they aren't better). In adversarial environments, EXP3 maintains permanent randomization to prevent convergence to a predictable strategy.
> **Trade-off**: UCB converges to the optimal parameter in stationary environments — but convergence is exploitability in adversarial ones. EXP3's minimax regret bound holds against oblivious adversaries; against fully adaptive adversaries, even EXP3 offers no unconditional guarantee. Choose the algorithm based on whether the environment is stochastic, oblivious-adversarial, or fully adaptive.

### Online Parameter Tuning

Edge systems operate with parameters: formation spacing, {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} intervals, timeout thresholds, detection sensitivity. Design-time estimates set initial values based on analytical modeling and domain knowledge. Operational experience reveals conditions that differ from design-time assumptions.

Online parameter tuning adapts parameters based on observed performance. The mathematical framework is the *multi-armed bandit* problem.

**Parameter Tuning: Formal Decision Problem**

**Objective Function**:

This selects the parameter value \\(\theta^\*\\) that maximizes expected cumulative reward over \\(T\\) rounds, where each round's reward \\(r_t(\theta)\\) reflects system performance (e.g., packet delivery rate) under the chosen parameter.

{% katex(block=true) %}
\theta^* = \arg\max_{\theta \in \Theta} \mathbb{E}\left[\sum_{t=1}^T r_t(\theta)\right]
{% end %}

where \\(r_t(\theta)\\) is the reward from parameter value \\(\theta\\) at time \\(t\\).

**Constraint Set**: Three constraints bound the optimization: the parameter must remain within designed operating limits (\\(g_1\\)), it must not change faster than the system can safely adapt (\\(g_2\\)), and each value must be explored a minimum number of times before being exploited (\\(g_3\\)).

{% katex(block=true) %}
\begin{aligned}
g_1: && \theta &\in [\theta_{\min}, \theta_{\max}] && \text{(parameter bounds)} \\
g_2: && \frac{d\theta}{dt} &\leq \dot{\theta}_{\max} && \text{(adaptation rate limit)} \\
g_3: && n_{\theta} &\geq n_{\min} \text{ before exploitation} && \text{(exploration requirement)}
\end{aligned}
{% end %}

**State Transition Model**:

These two equations track, for each candidate parameter value \\(\theta\\), how many times it has been tried (\\(n_\theta\\)) and the running average reward ({% katex() %}\hat{\mu}_\theta{% end %}), updated incrementally each round.

{% katex(block=true) %}
\begin{aligned}
n_{\theta}(t+1) &= n_{\theta}(t) + \mathbb{1}[\theta_t = \theta] \\
\hat{\mu}_{\theta}(t+1) &= \frac{n_{\theta}(t) \cdot \hat{\mu}_{\theta}(t) + r_t \cdot \mathbb{1}[\theta_t = \theta]}{n_{\theta}(t+1)}
\end{aligned}
{% end %}

**Decision Rule ({% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %})**:

At each round, select the parameter \\(\theta\\) that maximizes the sum of its estimated mean reward and an exploration bonus that decays as the parameter is tried more often.

{% katex(block=true) %}
\theta_{t+1} = \arg\max_{\theta \in \Theta} \left[ \hat{\mu}_{\theta}(t) + c\sqrt{\frac{\ln t}{n_{\theta}(t)}} \right]
{% end %}

- **Use**: Selects the arm maximizing empirical mean plus an exploration bonus; use only in stationary, non-adversarial environments where it prevents greedy stagnation from permanently abandoning arms that had early bad luck.
- **Parameters**: {% katex() %}c{% end %} = exploration coefficient; use {% katex() %}c = 1.0{% end %} in production ({% katex() %}c = \sqrt{2} \approx 1.41{% end %} for the theoretical guarantee).
- **Field note**: Use {% katex() %}c = 1.0{% end %} not 1.41 in practice — the theoretical value assumes unlimited rounds; real missions need faster convergence.

Consider {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} interval selection. The design-time value is 5s. But the optimal value depends on current conditions:
- Dense jamming: 3s provides faster anomaly propagation
- Clear conditions: 8s conserves bandwidth without loss of awareness
- Marginal conditions: 5s balances trade-offs

<span id="prop-18"></span>
<span id="term-ucb"></span>
**Proposition 18** ({% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} Regret Bound). *The Upper Confidence Bound ({% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}) algorithm achieves sublinear regret:*

{% katex(block=true) %}
\text{UCB}(a) = \hat{\mu}_a + c\sqrt{\frac{\ln t}{n_a}}
{% end %}

*where {% katex() %}\hat{\mu}_a{% end %} is the estimated reward for arm \\(a\\), \\(t\\) is total trials, and \\(n_a\\) is trials for arm \\(a\\). The cumulative regret is bounded by:*

{% katex(block=true) %}
R_T = O\left(\sqrt{T \cdot K \cdot \ln T}\right)
{% end %}

- **Use**: Bounds UCB cumulative regret at {% katex() %}O(\sqrt{T \cdot K \cdot \ln T}){% end %} over {% katex() %}T{% end %} rounds with {% katex() %}K{% end %} arms; certify UCB suitability for your horizon {% katex() %}T{% end %} and arm count {% katex() %}K{% end %} before deployment, and switch to EXP3-IX in adversarial settings where this bound does not hold.
- **Parameters**: {% katex() %}K{% end %} = number of arms; {% katex() %}T{% end %} = total decision rounds; verify bound {% katex() %}<{% end %} mission's acceptable regret budget.
- **Field note**: Per-round regret decreases as {% katex() %}\sqrt{1/T}{% end %} — UCB keeps improving over the mission horizon, unlike static policies with constant regret rate.

> **Physical translation**: The UCB score {% katex() %}\hat{\mu}_a + c\sqrt{\ln t / n_a}{% end %} has two parts. {% katex() %}\hat{\mu}_a{% end %} is the arm's track record — average reward so far. The second term is the exploration bonus — large when \\(n_a\\) is small (under-tested arm, bonus is high) and shrinking as the arm accumulates trials. An arm with average reward 0.7 tried 5 times scores \\(0.7 + c \cdot 0.77\\) at round \\(t = 100\\). An arm with average reward 0.75 tried 50 times scores \\(0.75 + c \cdot 0.24\\). At \\(c = 1\\), the more-tested arm scores 0.99 vs. 1.47 — UCB selects the under-tested arm. Once both arms are similarly explored, the higher-mean arm wins permanently.

*where \\(K\\) is the number of arms. This guarantees convergence to the optimal arm as \\(T \rightarrow \infty\\).*

*Note*: The {% katex() %}O(\sqrt{TK\ln T}){% end %} form above is {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}'s **stochastic regret bound** in the worst case over arm gaps. UCB1's classical instance-dependent bound is {% katex() %}O\!\left(\sum_{k: \Delta_k > 0} \frac{\ln T}{\Delta_k}\right){% end %} where \\(\\Delta_k = \\mu^\* - \\mu_k\\) is the suboptimality gap — tighter when gaps are large, looser when arms are nearly equal. The adversarial **minimax regret bound** ({% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}) replaces \\(\\ln T\\) with \\(\\ln K\\), giving {% katex() %}O(\sqrt{TK\ln K}){% end %}; see the {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %} section below.

*Proof sketch*: The {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} term ensures each arm is tried \\(O(\ln T)\\) times. The regret from suboptimal arms scales as {% katex() %}\sqrt{T \ln T / K}{% end %} per arm, giving total regret {% katex() %}O(\sqrt{TK \ln T}){% end %}.
Select the arm with highest {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}. This naturally explores under-tried arms while exploiting high-performing arms.

<span id="term-exp3"></span>

### Game-Theoretic Extension: Adversarial Bandits and EXP3

Proposition 18 achieves {% katex() %}O(\sqrt{TK\ln T}){% end %} regret against an **oblivious** adversary whose reward distributions are fixed regardless of the system's strategy. Against an **adaptive** adversary who observes the system's parameter estimates and counter-adapts, {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} provides no regret guarantee.

**The convergence-vulnerability trade-off**: As {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} converges to the optimal {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} interval \\(\lambda^\* = 3\\)s, the adversary learns this and switches to a jamming pattern invisible at 3s but detectable at 5s intervals. {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} then converges to 5s - and the adversary switches again. Convergence is exploitability.

**{% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %} (Exponential Weights for Exploration and Exploitation)**: Against an oblivious adversary, {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %} achieves a minimax regret bound that depends on \\(\ln K\\) (the log of the number of arms) rather than \\(\ln T\\), making it tighter when many rounds are played.

{% katex(block=true) %}
R_T^{\text{EXP3}} \leq O\!\left(\sqrt{TK \ln K}\right)
{% end %}

- **Use**: Gives the minimax regret bound {% katex() %}O(\sqrt{T \cdot K \cdot \ln K}){% end %} against an adaptive adversary; verify this bound before deploying in contested environments to prevent false confidence from UCB's {% katex() %}O(\ln T){% end %} guarantee that is invalid when rewards are adversarially selected.
- **Parameters**: {% katex() %}K{% end %} = arm count; {% katex() %}T{% end %} = mission rounds; CONVOY example: {% katex() %}K=8,\, T=1000 \to \text{bound} \approx 188{% end %} regret units.
- **Field note**: The {% katex() %}\sqrt{K \ln K}{% end %} factor grows faster in {% katex() %}K{% end %} than UCB — keep arm count below 16 in short-horizon tactical missions.

{% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %} maintains permanent exploration by updating each arm's weight \\(w_i\\) multiplicatively: arms that received higher importance-weighted reward \\(\hat{r}_i / p_i\\) grow faster, but no arm's weight collapses to zero because the minimum selection probability \\(\gamma/K\\) is always maintained.

{% katex(block=true) %}
w_i(t+1) = w_i(t) \cdot \exp\!\left(\eta \cdot \frac{\hat{r}_i(t)}{p_i(t)}\right)
{% end %}

> **Physical translation**: The weight update {% katex() %}w_i \leftarrow w_i \cdot \exp(\eta \hat{r}_i / p_i){% end %} is multiplicative — arms with good recent rewards grow their weights exponentially while arms with poor rewards shrink proportionally. The importance-weighting \\(\hat{r}_i / p_i\\) corrects for the selection probability: if arm \\(i\\) was only chosen 5% of the time (\\(p_i = 0.05\\)), its observed reward is scaled up by \\(20\\times\\) to get an unbiased estimate of what it would have returned if chosen more often. The \\(\gamma/K\\) floor ensures that even the weakest arm retains a minimum probability — the adversary can never learn that the system has permanently abandoned any arm, preventing exploitation of any deterministic pattern.

where {% katex() %}\hat{r}_i(t) = r_i(t) \cdot \mathbb{1}[I_t = i] / p_i(t){% end %} is the importance-weighted reward and {% katex() %}p_i(t) = (1-\gamma) w_i(t)/\sum_j w_j(t) + \gamma/K{% end %} maintains minimum exploration probability \\(\gamma/K > 0\\) on all arms permanently.

**The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} connection**: {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}'s convergence to a single arm is fragile in adversarial settings - it creates a predictable target. {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}'s regret bound holds against an *oblivious adversary* — one who fixes their strategy before the game begins. Against a fully adaptive adversary who responds to algorithm outputs, {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}'s minimax bound still holds as a worst-case guarantee over all oblivious strategies, but cannot match an adversary who observes selections and responds in real time. {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}'s maintained randomization is genuinely {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %}: its performance improves relative to the adversary's best fixed strategy as \\(T \to \infty\\).

**Practical implication**: For all {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} applications in contested environments - {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} interval tuning (Self-Measurement Without Central Observability), healing action selection (Self-Healing Without Connectivity) - replace {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} with {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}. {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %} is a drop-in replacement with the same interface; only the weight update rule changes. Use {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} only for non-adversarial commercial applications ({% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %} discount optimization, {% term(url="@/blog/2026-01-22/index.md#scenario-predictix", def="Aerospace CNC machine monitoring platform; predicts spindle, thermal, and power failures 2–8 hours ahead using local edge algorithms — preventing costly component scrap during plant-floor network outages") %}PREDICTIX{% end %} threshold tuning) where the adversary assumption does not apply.

### From Stochastic to Adversarial: When the Environment Plays Back

The healing control loop in [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) assumes the environment is **stochastic**: connectivity fails at known statistical rates (Weibull model, Definition 66), sensor anomalies arrive at calibrated rates \\(\lambda_{\text{drift}}\\), and healing actions succeed or fail according to fixed probability distributions. Against this backdrop, Upper Confidence Bound (UCB) exploration is optimal — it balances exploitation of known-good actions with exploration of potentially better alternatives, achieving \\(O(\sqrt{T \ln T})\\) regret.

This assumption breaks when the environment **responds to your actions**. An adaptive jammer that intensifies RF interference exactly when a drone swarm selects its historically-reliable frequency band is not stochastic — it is adversarial. A spoofing attack that targets the swarm's predicted recovery path after observing prior recoveries is not a random process. In these cases, UCB fails: exploiting a known-good action signals to the adversary which action to block next.

**Deployment decision rule**:
- **Default**: assume stochastic; use the gossip-protocol healing loop from [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md). Lower overhead, near-optimal under i.i.d. failure.
- **Switch to adversarial** (EXP3-IX below): after the Adversarial Non-Stationarity Detector (Definition 34) fires for two consecutive detection windows, or during pre-mission threat assessment when adaptive interference is part of the operational environment — e.g., RAVEN operating in contested EW airspace, CONVOY in active jamming corridors.
- **Switch back**: when the non-stationarity detector clears for 30 continuous minutes, revert to the stochastic model to reduce overhead (Definition 83, Autonomic Overhead Budget).

The formal adversarial model follows.

---

### From Stochastic to Adversarial: The Markov Game

The gap identified above — {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3{% end %}'s bound holds against oblivious adversaries but not adaptive ones — motivates formalizing what "adaptive adversary" means in the connectivity regime model. The CTMC (Def 3) represents the environment as a fixed generator matrix \\(Q\\). When the adversary is adaptive, \\(Q\\) is not fixed: the adversary *sets* it depending on what the defender does.

During {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s reconciliation phase (3–8 s after a partition heals), {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %}-interval selections are observable to an adversary monitoring RF patterns. Self-measurement confidence is lowest in this window — an adaptive adversary times the next jamming strike for this exact moment. The CTMC cannot model this because \\(Q\\) is not a property of the environment alone; it is a function of both defender and adversary choices.

> **Variable disambiguation — \\(\gamma\\) in this section.** Four mechanisms in this article share the symbol \\(\gamma\\) with incompatible ranges:
>
> | Symbol | Role | Constraint | Definition |
> |--------|------|-----------|------------|
> | \\(\\gamma\\) (Def 32) | Discount factor in infinite-horizon value function | \\(\\gamma \\in (0,1)\\) | Definition 32 |
> | \\(\\gamma\\) (EXP3 standard) | Additive mixture with uniform distribution: probability floor = \\(\gamma/K\\) per arm (distinct from EXP3-IX's denominator-floor mechanism) | \\(\\gamma/K\\) = minimum arm probability | From Stochastic to Adversarial: The Markov Game |
> | \\(\\gamma\\) (Def 33, EXP3-IX) | Implicit exploration floor in IX estimator | {% katex() %}\gamma = \eta\sqrt{K/2}{% end %} | Definition 33 |
> | {% katex() %}\gamma_{\text{infl}}{% end %} (Def 63) | CUSUM exploration-rate inflation factor | {% katex() %}\gamma_{\text{infl}} > 1{% end %} | Definition 63 |
>
> The Def 63 inflation factor is renamed {% katex() %}\gamma_{\text{infl}}{% end %} to prevent collision with Def 32's discount factor (\\(\\gamma \\in (0,1)\\) is incompatible with \\(\\gamma > 1\\)).

<span id="def-32"></span>

**Definition 32** (Adversarial Markov Game). An adversarial connectivity game is a 6-tuple {% katex() %}\mathcal{G} = (S, A, B, Q, R, \gamma){% end %} where:

- {% katex() %}S = \{C, D, I, N\}{% end %} — connectivity regimes (Definition 2)
- \\(A\\) — \\(K\\) defender actions (healing responses, bandit arms)
- \\(B\\) — adversary action set (jamming intensities, timing windows)
- {% katex() %}Q: A \times B \to{% end %} generator matrices — the CTMC generator when defender plays \\(a \in A\\) and adversary plays \\(b \in B\\)
- {% katex() %}R: S \times A \times B \to \mathbb{R}{% end %} — per-step mission throughput reward
- \\(\gamma \in (0,1)\\) — discount factor; adversary plays **adaptive** policy {% katex() %}\tau_t = \tau(h_t){% end %} where \\(h_t\\) is the full defender action history

The *security value* is:

{% katex(block=true) %}
V^* = \max_{\sigma:\, S \to \Delta(A)}\; \min_{\tau}\; \mathbb{E}\!\left[\sum_{t=0}^{\infty} \gamma^t R(s_t, a_t, b_t) \,\Big|\, s_0\right]
{% end %}

where \\(\sigma\\) is the defender's mixed (randomized) policy and \\(\tau\\) ranges over all adaptive adversary strategies. *(Disambiguation: \\(\tau\\) here denotes an adversary strategy mapping; it is distinct from {% katex() %}\tau_{\text{ref}}{% end %} (the adaptive refractory backoff period in [Definition 76](@/blog/2026-01-29/index.md#def-76)) and from \\(\tau(a)\\) (the stochastic transport delay in Definition 62 of this article). Where needed, adversary strategies are written {% katex() %}\tau_{\text{adv}}{% end %}.)*

*(Scope: The adversarial Markov Game model applies during active jamming or sensor-spoofing scenarios where failure is intentional and correlated with defender actions. During normal partition — where failure is environmental rather than intentional — the [cooperative gossip model](@/blog/2026-01-22/index.md) applies and achieves higher utility because nodes benefit from sharing state. The two models are not in conflict: use the adversarial MAB during contested operations, cooperative gossip during uncontested isolation.)*

> **Physical translation**: The security value \\(V^\*\\) is the mission throughput the swarm guarantees regardless of adversary tactics. The max-min structure: the swarm first commits to a randomized policy \\(\sigma\\); the adversary — knowing \\(\sigma\\) — chooses the worst-case response \\(\tau\\). \\(V^\*\\) is what the swarm can deliver *given that the adversary plays optimally against it*. The discount factor \\(\gamma \in (0,1)\\) ensures a swarm that survives 30 days at moderate performance is valued over one that performs perfectly for 3 days and then collapses. For RAVEN, \\(V^\*\\) provides the formal lower bound on mission throughput that EXP3-IX approaches as rounds increase.

<span id="prop-33"></span>

**Proposition 33** (Deterministic Policies Are Dominated). For any pure (deterministic) policy {% katex() %}\pi_D: S \to A{% end %}, there exists an adversary strategy \\(\tau^\*\\) such that \\(V(\pi_D, \tau^\*) < V^\*\\). The minimax mixed policy \\(\sigma^\*\\) achieves \\(V^\*\\) under all adversary strategies. *(\\(\sigma^\*\\) here is the minimax mixed strategy; unsubscripted \\(\\sigma\\) throughout this article is stress magnitude in {% katex() %}[0, \sigma_{\max}]{% end %}.)*

*Proof.* By the minimax theorem (von Neumann, 1928) for finite \\(S, A, B\\):

{% katex(block=true) %}
\max_{\sigma}\, \min_{\tau}\, V(\sigma, \tau) = \min_{\tau}\, \max_{\sigma}\, V(\sigma, \tau) = V^*
{% end %}

Any pure \\(\pi_D\\) is a degenerate mixed policy, so \\(V(\pi_D, \tau) \leq V^\*\\) for all \\(\tau\\). Strict inequality holds when the adversary observes the deterministic recovery action and can exploit the predictable response window — e.g., scheduling the next jamming burst during the fixed interval {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} uses to re-establish mesh topology. \\(\square\\)

*Note: Although Definition 32's adversary plays an adaptive (history-dependent) strategy, the minimax theorem applies via reduction to the normal-form game: for two-player zero-sum games, the normal-form minimax value equals the extensive-form value (Osborne & Rubinstein, 1994). The reduction is standard; the sequential game's value equals that of the simultaneous-move matrix game formed by treating all strategies as behavioral strategy profiles.*

**Operational consequence**: \\(\sigma^\*\\) assigns positive probability to all \\(K\\) healing actions. The adversary cannot predict the exact response action and cannot exploit any specific recovery window. This is the formal justification for {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}'s permanent randomization in contested environments.

---

### EXP3-IX: Optimal Response Under Adaptive Adversaries

Standard {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %} uses importance-weighted estimator {% katex() %}\hat{r}_i(t) = r_i(t) \cdot \mathbf{1}[I_t = i] / p_i(t){% end %} with variance {% katex() %}\mathrm{Var}[\hat{r}_i] \leq 1/p_i^2{% end %}. An adaptive adversary who observes action probabilities can manipulate \\(p_i\\) to be small — driving variance to explode and breaking {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}'s martingale analysis. The Implicit eXploration (IX) estimator bounds this by adding \\(\gamma\\) to the denominator.

<span id="def-33"></span>

**Definition 33** ({% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3-IX{% end %} Algorithm). {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3{% end %} with Implicit eXploration uses parameters {% katex() %}\eta = \sqrt{2 \ln K / (TK)}{% end %} and {% katex() %}\gamma = \eta\sqrt{K/2}{% end %}. The IX estimator replaces the standard importance-weighted estimate:

{% katex(block=true) %}
\hat{r}_i^{\mathrm{IX}}(t) = \frac{r_i(t) \cdot \mathbf{1}[I_t = i]}{p_i(t) + \gamma}
{% end %}

Weights and selection probabilities update as:

{% katex(block=true) %}
w_i(t+1) = w_i(t) \cdot \exp\!\left(\eta \cdot \hat{r}_i^{\mathrm{IX}}(t)\right), \qquad
p_i(t) = \frac{w_i(t)}{\sum_{j=1}^K w_j(t)}
{% end %}

- **Use**: Updates each arm's weight after observing reward, correcting for selection-probability bias via importance weighting; apply after every MAPE-K tick outcome to prevent importance-weight explosion for rarely-selected arms when the denominator floor {% katex() %}\gamma{% end %} is missing.
- **Parameters**: {% katex() %}\eta = \sqrt{\ln K / (K \cdot T)}{% end %}; {% katex() %}\gamma{% end %} = implicit exploration floor (same order as {% katex() %}\eta{% end %}); {% katex() %}K{% end %} = arm count.
- **Field note**: Clip importance weights at {% katex() %}1/\gamma{% end %} in implementation — float32 overflow is common on embedded hardware without this explicit clip.

> **Physical translation**: The weight update {% katex() %}w_i \leftarrow w_i \cdot \exp(\eta \cdot \hat{r}_i^{\mathrm{IX}}){% end %} is a multiplicative reputation system: arms that produce high reward get heavier weights and are selected more often; arms that fail get lighter weights and are selected less. The \\(\gamma\\) floor in the denominator prevents any arm's selection probability from collapsing to zero — no arm is ever permanently abandoned, which prevents a determined adversary from "freezing out" an arm and then springing it as a trap when the swarm's weights have converged elsewhere.

No forced exploration floor is required — the implicit \\(\gamma\\) bias in the estimator alone bounds regret. {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3-IX{% end %} is a drop-in replacement for {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}: same weight structure, same selection rule; only the estimator changes.

<span id="prop-34"></span>

**Proposition 34** ({% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3-IX{% end %} Regret Bound). With optimal \\(\eta\\) and \\(\gamma\\) as in Definition 33:

{% katex(block=true) %}
R_T^{\mathrm{IX}} \leq 2\sqrt{T K \ln K} = O\!\left(\sqrt{T \ln T}\right)
{% end %}

since {% katex() %}K \leq T \Rightarrow \ln K \leq \ln T{% end %}. This bound holds against **fully adaptive** adversaries where \\(r_i(t)\\) may depend on past action probabilities {% katex() %}\{p_j(s)\}_{s < t}{% end %}.

*Proof sketch.* The second moment of the IX estimator satisfies {% katex() %}\mathbb{E}[(\hat{r}_i^{\mathrm{IX}})^2] \leq 1/\gamma{% end %} (bounded because {% katex() %}p_i(t) + \gamma \geq \gamma{% end %} always). A potential function {% katex() %}\Phi_t = \sum_i w_i(t){% end %} satisfies a standard recursion; summing over \\(t\\) and optimizing \\(\eta, \gamma\\) jointly yields {% katex() %}R_T^{\mathrm{IX}} \leq (\ln K)/\eta + \eta TK/(2\gamma) = 2\sqrt{TK \ln K}{% end %}. \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration** (\\(K = 5\\) healing actions, \\(T = 1000\\) decision rounds): \\(\eta \approx 0.018\\), \\(\gamma \approx 0.028\\); minimum arm probability \\(p_i \geq 0.12\\) (no arm collapses to zero). Regret {% katex() %}R_T^{\mathrm{IX}} \leq 180{% end %} rounds — an 18% "cost of unpredictability" — meaning the adversary cannot exploit any recovery window regardless of their observation capability.

> **Physical translation**: {% katex() %}O(\sqrt{TK \ln K}){% end %} regret means: over a 4-hour RAVEN mission with \\(T = 1000\\) decision rounds and \\(K = 5\\) healing actions, the worst-case cumulative regret is bounded at 180 rounds — 18% of decisions are sub-optimal compared to the best fixed action in hindsight. Crucially, this holds even against an adversary who can observe every arm selection and adapt their jamming in response. The \\(\sqrt{T}\\) growth means per-round regret shrinks as \\(1/\sqrt{T}\\) — the swarm keeps improving over the mission, and the adversary's exploitation window closes with every decision round.

---

### Warm-Start and Contextual Extensions

The Proposition 34 bound scales as {% katex() %}2\sqrt{TK \ln K}{% end %} from a cold-start with uniform weights {% katex() %}w_i(0) = 1/K{% end %}. In the first \\(O(K)\\) rounds the algorithm is effectively blind — it explores each arm roughly uniformly before weights diverge. For a fast tactical shift (jamming onset, terrain blackout), these early sub-optimal rounds are the most dangerous: the healing action chosen during the learning phase must be safe even when the policy has not yet converged. Two structural improvements address this without weakening Proposition 34's adversarial guarantee:

1. **Warm-Start Prior** — initialize weights from the current capability level \\(q\\) to concentrate exploration on actions known feasible and effective at the current resource state.
2. **Connectivity-Pruned Arm Set** — use \\(C(t)\\) as side information to eliminate arms that are physically infeasible given current connectivity, reducing the active arm count {% katex() %}K_{\text{eff}}(t) \leq K{% end %} and shrinking the regret constant accordingly.

<span id="def-96"></span>
**Definition 96** (Capability-Hierarchy Warm-Start Prior). *For each capability level {% katex() %}q \in \{0,1,2,3,4\}{% end %}, define a prior weight vector {% katex() %}\mu^{(q)} \in \Delta^{K-1}{% end %} encoding the expected relative utility of each arm given the system's current resource state. The warm-start initialization replaces the cold-start {% katex() %}w_i(0) = 1{% end %} with:*

{% katex(block=true) %}
w_i(0;\, q) = \exp\!\bigl(\eta_0 \cdot N_q \cdot \mu_i^{(q)}\bigr)
{% end %}

*where {% katex() %}\eta_0{% end %} is the operational learning rate (Definition 33) and {% katex() %}N_q{% end %} is the number of virtual observations the prior is worth — calibrated offline. This is equivalent to having pre-observed \\(N_q\\) rounds in which arm \\(i\\) produced reward {% katex() %}\mu_i^{(q)}{% end %} per round.*

**RAVEN prior table** (\\(K = 5\\) arms: {% katex() %}k_N{% end %} shape, gossip fanout, MAPE-K tick, anomaly threshold, cross-cluster priority):

| Level | {% katex() %}\mu_1^{(q)}{% end %} | {% katex() %}\mu_2^{(q)}{% end %} | {% katex() %}\mu_3^{(q)}{% end %} | {% katex() %}\mu_4^{(q)}{% end %} | {% katex() %}\mu_5^{(q)}{% end %} | {% katex() %}N_q{% end %} |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| {% katex() %}\mathcal{L}_0{% end %} (survival) | 0.10 | 0.05 | 0.60 | 0.20 | 0.05 | 30 |
| {% katex() %}\mathcal{L}_1{% end %} (minimal) | 0.20 | 0.10 | 0.45 | 0.20 | 0.05 | 40 |
| {% katex() %}\mathcal{L}_2{% end %} (degraded) | 0.30 | 0.20 | 0.30 | 0.15 | 0.05 | 50 |
| {% katex() %}\mathcal{L}_3{% end %} (normal) | 0.25 | 0.25 | 0.20 | 0.20 | 0.10 | 60 |
| {% katex() %}\mathcal{L}_4{% end %} (full) | 0.20 | 0.25 | 0.15 | 0.20 | 0.20 | 60 |

Row sums to 1.0; \\(N_q\\) values calibrated from 200 offline RAVEN partition simulations per level.

- **Update rule**: After round 1, the EXP3-IX update proceeds identically to Definition 33. The warm-start only shifts the starting point; Proposition 34's adversarial guarantee holds from round 1 onward because the regret analysis is over the sequence \\(t \geq 1\\), not \\(t \geq 0\\).
- **Level change mid-partition**: If capability level transitions (e.g., battery triggers {% katex() %}\mathcal{L}_3 \to \mathcal{L}_2{% end %}), re-weight via {% katex() %}w_i \leftarrow w_i \cdot \mu_i^{(q_{\text{new}})} / \mu_i^{(q_{\text{old}})}{% end %} and renormalize — a single multiply-and-normalize pass over \\(K\\) entries.

<span id="def-97"></span>
**Definition 97** (Connectivity-Pruned Contextual Arm Set). *Let {% katex() %}b_C(t) = \min(3,\; \lfloor 4 C(t) \rfloor) \in \{0,1,2,3\}{% end %} be the 2-bit connectivity bucket (same quantization scheme as Definition 71). Define the minimum connectivity requirement for arm \\(i\\) as the bucket threshold {% katex() %}\bar{b}_i{% end %} below which arm \\(i\\) is physically infeasible. The active arm set is:*

{% katex(block=true) %}
\mathcal{A}(t) = \bigl\{\,i \in \{1,\ldots,K\} : b_C(t) \geq \bar{b}_i\,\bigr\}
{% end %}

*The EXP3-IX selection and weight-update rules of Definition 33 are restricted to \\(\mathcal{A}(t)\\): inactive arms are neither pulled nor updated; their weights freeze at the last active value and resume when \\(C(t)\\) recovers.*

**RAVEN arm connectivity thresholds** (arm description and the connectivity bucket at which each arm becomes feasible):

| Arm | Action | {% katex() %}\bar{b}_i{% end %} | Min \\(C(t)\\) | Infeasible when |
| :--- | :--- | :---: | :---: | :--- |
| 1 | {% katex() %}k_N{% end %} shape tuning | 0 | any | Never — local compute only |
| 2 | Gossip fanout rate | 1 | {% katex() %}C > 0.25{% end %} | Denied regime (no peers reachable) |
| 3 | MAPE-K tick interval | 0 | any | Never — local compute only |
| 4 | Anomaly threshold | 0 | any | Never — local compute only |
| 5 | Cross-cluster priority | 2 | {% katex() %}C > 0.50{% end %} | Denied or Degraded |

Active arm count {% katex() %}K_{\text{eff}}(t) = |\mathcal{A}(t)|{% end %}: **3 arms** when \\(C(t) \leq 0.25\\) (Denied); **4 arms** when {% katex() %}0.25 < C(t) \leq 0.50{% end %} (Degraded); **5 arms** when {% katex() %}C(t) > 0.50{% end %} (Connected or Intermittent).

- **Context integration**: Combine with Definition 71 by appending the 2-bit \\(b_C(t)\\) field into the context index: the enhanced index is 8 bits (\\(2\\,\text{bits} \times 4\\) variables), giving \\(256\\) contexts \\(\times K\\) arms \\(\times 4\\) bytes = 5 KB for \\(K=8\\) — still MCU-feasible.
- **Adversarial note**: An adversary who drives \\(C(t)\\) below {% katex() %}0.25{% end %} to freeze arms 2 and 5 cannot improve their regret against the remaining arms \\(\{1,3,4\}\\), since those arms remain active and the adversarial guarantee (Proposition 34) applies within \\(\mathcal{A}(t)\\).

<span id="prop-70"></span>
**Proposition 70** (Warm-Start + Contextual Regret Bound). *Let {% katex() %}\bar{K} = (1/T)\sum_{t=1}^T |\mathcal{A}(t)|{% end %} be the time-averaged active arm count, and let {% katex() %}N_q{% end %} be the warm-start virtual observation count at capability level \\(q\\). The combined regret satisfies:*

{% katex(block=true) %}
R_T^{\mathrm{warm+ctx}} \;\leq\; 2\sqrt{(T - N_q)\;\bar{K}\;\ln \bar{K}}
{% end %}

*(valid for {% katex() %}T > N_q{% end %}; for {% katex() %}T \leq N_q{% end %} the warm-start alone suffices and the regret is bounded by the initial weight divergence from the optimal arm.)*

*Proof sketch.* Within each round, the EXP3-IX analysis of Proposition 34 applies over the active set \\(\mathcal{A}(t)\\) with {% katex() %}K_{\text{eff}}(t){% end %} arms. Summing over rounds and applying Jensen's inequality (concavity of \\(\sqrt{\cdot}\\)) to replace per-round {% katex() %}K_{\text{eff}}(t){% end %} with its mean {% katex() %}\bar{K}{% end %} gives {% katex() %}R_T^{\text{ctx}} \leq 2\sqrt{T\,\bar{K}\,\ln \bar{K}}{% end %}. The warm-start reduces the effective horizon: the prior correctly concentrates weight on the optimal arm with initial advantage {% katex() %}\ln(\mu_{i^*}^{(q)} \cdot K) / \eta_0 \approx N_q{% end %} rounds of pre-credited exploration; replacing \\(T\\) with \\(T - N_q\\) captures this saving. \\(\square\\)*

**Regret convergence comparison** (RAVEN {% katex() %}\mathcal{L}_3{% end %}, CONVOY-level denial: {% katex() %}\bar{K} = 3.5{% end %}, {% katex() %}N_3 = 60{% end %}):

{% katex(block=true) %}
R_T^{\mathrm{base}} = 2\sqrt{T \cdot 5 \cdot \ln 5} \approx 5.67\sqrt{T}, \qquad
R_T^{\mathrm{warm+ctx}} \approx 2\sqrt{(T - 60) \cdot 3.5 \cdot \ln 3.5} \approx 4.24\sqrt{T - 60}
{% end %}

| Rounds \\(T\\) | Baseline {% katex() %}R^{\mathrm{base}}{% end %} | Warm-start {% katex() %}R^{\mathrm{warm}}{% end %} | Contextual {% katex() %}R^{\mathrm{ctx}}{% end %} | Combined {% katex() %}R^{\mathrm{w+c}}{% end %} | % reduction |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 57 | 47 | 42 | 21 | 63% |
| 250 | 90 | 76 | 67 | 49 | 46% |
| 500 | 127 | 107 | 95 | 75 | 41% |
| 750 | 155 | 131 | 116 | 93 | 40% |
| 1000 | 179 | 154 | 134 | 108 | 40% |
| 2000 | 253 | 222 | 190 | 158 | 38% |

*Column formulas*: {% katex() %}R^{\mathrm{base}} = 5.67\sqrt{T}{% end %}; {% katex() %}R^{\mathrm{warm}} = 5.67\sqrt{T-60}{% end %}; {% katex() %}R^{\mathrm{ctx}} = 4.73\sqrt{T}{% end %} ({% katex() %}\bar{K}=3.5{% end %}, same \\(T\\)); {% katex() %}R^{\mathrm{w+c}} = 4.24\sqrt{T-60}{% end %}.

**Per-round regret flattening** — the per-round regret {% katex() %}R_T/T{% end %} falls below 0.12 (approximately 1 sub-optimal decision per 8 rounds) at:

{% katex(block=true) %}
T_{\mathrm{base}} \approx \left(\frac{5.67}{0.12}\right)^2 = 2233 \text{ rounds}, \qquad
T_{\mathrm{w+c}} \approx \left(\frac{4.24}{0.12}\right)^2 + 60 \approx 1312 \text{ rounds}
{% end %}

The combined method reaches the convergence threshold at round 1312 versus the baseline's round 2233 — **41% fewer rounds**, confirming the "at least 40% faster flattening" target. In denial-heavy deployments ({% katex() %}\bar{K} = 3.0{% end %}): {% katex() %}T_{\mathrm{w+c}} \approx 760{% end %} rounds versus 2233 — **66% fewer rounds**.

> **Physical translation**: The cold-start learning penalty means RAVEN's bandit selects sub-optimal healing actions for roughly the first 2200 decision rounds (~37 minutes at one tick per second) before its policy is reliably near-optimal. With the capability-level warm-start and C(t) pruning, this shrinks to ~1300 rounds (~22 minutes) under moderate denial — a 15-minute reduction in the "unprotected window" during which the system is learning rather than acting on learned knowledge. In active jamming scenarios where threats escalate within minutes, this matters.

---

### Adversarial Non-Stationarity Detection

{% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3-IX{% end %} randomizes responses optimally but does not detect *when* the adversary changes strategy. Natural \\(Q\\)-changes (weather, battery depletion) and adversarial \\(Q\\)-changes (coordinated jamming) produce similar rate-shift signatures on the transition dimension alone. The discriminating signal is that adversarial changes are **correlated with defender actions**: the adversary observes selections and responds. Natural environmental drift is uncorrelated with what the defender just chose.

<span id="def-34"></span>

**Definition 34** (Adversarial Non-Stationarity Detector). Two parallel CUSUM statistics track transition rate {% katex() %}q_{ij}{% end %} for a monitored regime pair \\((i, j)\\):

*Rate-shift CUSUM*:

{% katex(block=true) %}
S_t^Q = \max\!\left(0,\; S_{t-1}^Q + \hat{q}_{ij}(t) - q_{ij}^{\mathrm{base}} - \delta_Q\right)
{% end %}

*Action-correlation CUSUM*:

{% katex(block=true) %}
S_t^{\mathrm{corr}} = \max\!\left(0,\; S_{t-1}^{\mathrm{corr}} + \hat{\rho}(a_t,\, \Delta q_t) - \delta_{\mathrm{corr}}\right)
{% end %}

where {% katex() %}\hat{\rho}(a_t, \Delta q_t){% end %} is the sliding-window sample correlation between the defender's most recent action \\(a_t\\) and the concurrent \\(Q\\)-change magnitude \\(\Delta q_t\\). Alarms fire when \\(S_t^Q > h_Q\\) and/or {% katex() %}S_t^{\mathrm{corr}} > h_{\mathrm{corr}}{% end %}.

| \\(S_t^Q\\) | {% katex() %}S_t^{\mathrm{corr}}{% end %} | Diagnosis | Response |
| :--- | :--- | :--- | :--- |
| Below \\(h_Q\\) | Below {% katex() %}h_{\mathrm{corr}}{% end %} | No change | Continue current policy |
| Above \\(h_Q\\) | Below {% katex() %}h_{\mathrm{corr}}{% end %} | Natural drift | Update \\(Q\\) baseline |
| Above \\(h_Q\\) | Above {% katex() %}h_{\mathrm{corr}}{% end %} | Adversarial | Switch to EXP3-IX \\(\sigma^\*\\); alert operators |
| Below \\(h_Q\\) | Above {% katex() %}h_{\mathrm{corr}}{% end %} | Spurious | Log; no action |

**Example**: In {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}, a jammer monitoring mesh-re-establishment traffic consistently increases {% katex() %}q_{\text{Contested}\to\text{Denied}}{% end %} within 3–5 transitions of the swarm selecting its standard re-route action. The action-correlation CUSUM {% katex() %}S_t^{\mathrm{corr}}{% end %} crosses {% katex() %}h_{\mathrm{corr}}{% end %} before \\(S_t^Q\\) does, exposing the adversarial pattern (rate shift correlated with defender selection) rather than treating it as weather-driven natural drift. On dual alarm, the swarm switches to \\(\sigma^\*\\) randomization and alerts the operator — the jammer can no longer time bursts to exploit a predictable recovery window.

<span id="prop-35"></span>

**Proposition 35** (Q-Change Detection Delay Bound). For an adversarial rate shift of size \\(\delta > \delta_Q\\), the expected detection delay from onset \\(\tau\\) satisfies:

{% katex(block=true) %}
\mathbb{E}[T_{\mathrm{detect}} - \tau] \leq \frac{h_Q + O(1)}{\delta - \delta_Q}
{% end %}

- **Use**: Gives the maximum rounds to detect a {% katex() %}\Delta q{% end %} shift in reward distribution at false-alarm rate {% katex() %}\delta{% end %}; calibrate detector sensitivity so {% katex() %}T_{\text{detect}}{% end %} is less than environment dwell time in any new regime to prevent stale-model persistence when the bandit cannot adapt.
- **Parameters**: {% katex() %}\Delta q{% end %} = expected regime shift magnitude (0.1–0.5 reward units); {% katex() %}\delta = 0.05{% end %} typical false-alarm rate.
- **Field note**: CONVOY regime shifts last 30–120 s — calibrate {% katex() %}T_{\text{detect}}{% end %} to at most 15 s or adaptation is permanently lagged behind real conditions.

The dual false alarm rate satisfies:

{% katex(block=true) %}
P\!\left(S_t^Q > h_Q \wedge S_t^{\mathrm{corr}} > h_{\mathrm{corr}} \;\Big|\; H_0\right) \leq \alpha_Q \cdot \alpha_{\mathrm{corr}}
{% end %}

where {% katex() %}\alpha_Q, \alpha_{\mathrm{corr}}{% end %} are the individual CUSUM false-alarm rates under null hypothesis \\(H_0\\) (no adversarial change).

*Proof.* The rate-CUSUM delay bound follows from Wald's identity applied to the CUSUM random walk with drift {% katex() %}\delta - \delta_Q > 0{% end %}. The product bound follows from the independence of \\(S_t^Q\\) and {% katex() %}S_t^{\mathrm{corr}}{% end %} under \\(H_0\\): when no adversarial change is present, defender actions and natural \\(Q\\)-changes are uncorrelated by design (the defender's randomized policy is independent of environmental noise). \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration** (\\(h_Q = 5\\), {% katex() %}\delta_Q = 0.2 \cdot q_{\mathrm{base}}{% end %}, {% katex() %}h_{\mathrm{corr}} = 3{% end %}, \\(\alpha_Q = 0.01\\), {% katex() %}\alpha_{\mathrm{corr}} = 0.05{% end %}): dual false alarm rate \\(\leq 0.0005\\) (approximately one false alarm per 33 h of operation); detection delay \\(\leq 13\\) transitions from jamming onset (approximately 2 min at {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s observed transition rates).

<span id="term-thompson"></span>

### Probabilistic Extension: Thompson Sampling

{% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %} is the Bayesian dual of {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} and {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}. Where {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} uses optimistic confidence bounds and {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %} uses adversarial weight updates, {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %} maintains a **posterior distribution** over each arm's reward probability and samples from it.

**Mechanism**: Model each parameter arm \\(k\\) with a Beta prior {% katex() %}\text{Beta}(\alpha_k, \beta_k){% end %}. At each round, one sample \\(\theta_k(t)\\) is drawn from each arm's current posterior and the arm with the highest sampled value is selected — arms with more uncertainty have wider posteriors and are therefore more likely to win the sample competition.

{% katex(block=true) %}
\theta_k(t) \sim \text{Beta}(\alpha_k(t),\, \beta_k(t)), \quad a^*(t) = \arg\max_k \theta_k(t)
{% end %}

After observing binary reward {% katex() %}r \in \{0,1\}{% end %}, the selected arm's Beta parameters are updated by incrementing {% katex() %}\alpha_{a^*}{% end %} on success and {% katex() %}\beta_{a^*}{% end %} on failure, tightening the posterior around the arm's true success rate.

{% katex(block=true) %}
\alpha_{a^*}(t+1) = \alpha_{a^*}(t) + r, \quad \beta_{a^*}(t+1) = \beta_{a^*}(t) + (1 - r)
{% end %}

**Why this matters for edge systems**: {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %} achieves {% katex() %}O(\sqrt{TK \ln T}){% end %} Bayesian regret in stochastic environments — comparable to {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} but empirically faster to converge. More importantly, the Beta posterior **naturally encodes uncertainty** - a parameter with few observations has a flat, wide posterior; one with many observations concentrates. In contested environments where some {% term(url="@/blog/2026-01-15/index.md#scenario-outpost", def="127-sensor perimeter mesh at a forward base; sustains autonomous threat detection under sustained jamming and denied external communications") %}OUTPOST{% end %} sensors are intermittently partitioned, {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %} degrades gracefully: arms without recent data retain high uncertainty (wide Beta) and are explored proportionally, rather than being over-confidently exploited ({% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}) or uniformly penalized ({% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %}).

**Reconnection handling**: When a partitioned node reconnects, its prior \\((\alpha_k, \beta_k)\\) is exactly the right representation of pre-partition knowledge. Stale {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} confidence bounds are harder to interpret after a partition; Beta posteriors compose naturally with {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %}-propagated priors from peer nodes. Each peer initializes from the shared prior \\((\alpha_0 = 1, \beta_0 = 1)\\) and tracks only observed successes \\(s_i\\) and failures \\(f_i\\) (excluding the prior). The merged posterior is: {% katex() %}\alpha^{\text{merged}} = \alpha_0 + \sum_i s_i{% end %}, {% katex() %}\beta^{\text{merged}} = \beta_0 + \sum_i f_i{% end %}. This avoids prior double-counting by tracking raw outcomes rather than full posterior parameters.

**Fleet-level parameter reconciliation — scalar parameters (R-12)**: The Beta posterior merge above handles bandit arm parameters. {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %} operates at fleet level (Definition 15: \\(A\\) is measured across the fleet's aggregate performance), but learning happens cluster-scoped during partition (each cluster independently updates its local \\(A\\) estimate based on local stress-response observations). When two clusters reconnect, they may have diverged on scalar {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} parameters: cluster 1 observed {% katex() %}\hat{A}_1{% end %} over \\(N_1\\) trials; cluster 2 observed {% katex() %}\hat{A}_2{% end %} over \\(N_2\\) trials. The reconciliation rule is a precision-weighted average (inverse-variance weighting under Gaussian approximation): {% katex() %}\hat{A}_{\text{merged}} = (N_1 \hat{A}_1 + N_2 \hat{A}_2) / (N_1 + N_2){% end %}. This is equivalent to pooling all observations and recomputing the sample mean. **Precondition**: this merge is valid only if the two clusters experienced the same stress regime — if cluster 1 experienced 20-minute partitions and cluster 2 experienced 5-minute partitions, their \\(\hat{A}\\) estimates are at different points on the \\(A(\sigma)\\) curve and should not be averaged; instead, maintain separate \\(\hat{A}(\sigma_k)\\) estimates per stress level. For the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} scenario with a uniform partition-duration distribution (mission-assigned blackout schedule), the reconciliation reduces to the simple weighted average; for opportunistic partitions (terrain-driven, duration-variable), track \\(\hat{A}\\) per duration bucket. The {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; data structure where all concurrent updates merge deterministically without coordination, enabling convergent consistency under partition") %}CRDT{% end %} mechanism for this merge is a per-bucket \\((N_k, \hat{A}_k \cdot N_k)\\) counter pair stored as OR-Set entries, with merge defined as coordinate-wise addition followed by recomputing {% katex() %}\hat{A}_k = \text{sum}_k / N_k{% end %}.

{% katex(block=true) %}
\alpha_k^{\text{merged}} = \alpha_0 + \sum_{i \in \text{peers}} s_k^{(i)}, \quad \beta_k^{\text{merged}} = \beta_0 + \sum_{i \in \text{peers}} f_k^{(i)}
{% end %}

**Recommendation**: Use {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %} as the default for commercial edge deployments ({% term(url="@/blog/2026-01-15/index.md#scenario-autohauler", def="34 autonomous haul trucks in an open-pit copper mine; RF shadows and tunnel blackouts of 2–15 min require edge-local collision avoidance") %}AUTOHAULER{% end %}, {% term(url="@/blog/2026-01-15/index.md#scenario-gridedge", def="Power distribution grid with protective relays; 500 ms fault-isolation mandate (60x faster than SCADA polling) requires full local decision authority") %}GRIDEDGE{% end %}) where rewards are stochastic but not adversarially structured. Use {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits; maintains permanent randomized exploration with minimax regret O(sqrt(TK ln K)) even against an adversary who adapts to past selections") %}EXP3{% end %} for contested tactical environments ({% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}, {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}) where adversarial parameter manipulation is a threat model.

Table: Decision algorithm selection guide.

| Algorithm | Regret Bound | Non-stationarity | Adversarial Robustness | Complexity | Best For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| UCB | {% katex() %}O(\sqrt{KT\ln T}){% end %} | Poor (assumes stationary) | Low | Low | Stationary environments |
| EXP3 | {% katex() %}O(\sqrt{KT\ln K}){% end %} | Moderate (sliding window) | High (minimax optimal vs. oblivious adversary) | Low | Adversarial/non-stationary |
| Thompson Sampling | {% katex() %}O(\sqrt{KT\ln T}){% end %} | Good (prior updating) | Moderate | Medium | Bayesian, posterior updates |

After 1000 {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} cycles, {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s learned policy:
- If packet loss rate > 30%: {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} interval = 3s
- If packet loss rate < 5%: {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} interval = 8s
- Otherwise: {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} interval = 5s

This policy illustrates how bandit algorithms can discover relationships between environmental conditions and optimal parameters - relationships that may not be apparent from design-time analysis alone.

---

### Delayed-Feedback Extension: Weibull-Aware Tuning Loop

The three algorithms above assume reward is observed before the next arm pull. Under Weibull partitions (Definition 66) with \\(k_N < 1\\), the reward signal for the shape-parameter bandit (Definition 67) — measured as realized partition cost relative to prediction — arrives only at partition end, potentially hours later. Definition 69 adapts {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3-IX{% end %} for this regime; Proposition 60 bounds regret degradation; Definition 70 provides an immediate surrogate reward *(the local surrogate reward function is defined formally in Definition 70 below)*; Definition 71 discretizes partition context into O(1) memory.

<span id="def-69"></span>

**Definition 69** (Delayed-Feedback EXP3-IX). Let the feedback delay for pull at partition onset \\(s\\) be {% katex() %}d_s = T_N^{(s)}{% end %} — the actual partition duration, observed only at partition end. Define batch window {% katex() %}B = \lceil E[T_N] \rceil{% end %} (one expected partition, LUT-approximated per Definition 66). The **pending buffer** \\(\mathcal{P}\\) holds \\((k_s,\\; s)\\) pairs for pulls awaiting reward; capacity is bounded by {% katex() %}|\mathcal{P}| \leq \lfloor Q_{0.95} / T_{\min} \rfloor{% end %} entries (static upper bound; MCU-allocatable). At each partition event \\(s\\):

1. **Pull**: select arm {% katex() %}k_s \in \{0.3, 0.4, \ldots, 1.0\}{% end %} per {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3-IX{% end %} weights; append \\((k_s,\\; s)\\) to \\(\mathcal{P}\\).
2. **Receive** (at partition end, time \\(s + d_s\\)): compute true reward {% katex() %}r_s = -\max(0,\; T_{\text{acc}}^{(s)} - E[T_N \mid k_s]) / Q_{0.95}(k_s){% end %} (Definition 67 reward signal); remove \\((k_s,\\; s)\\) from \\(\mathcal{P}\\).
3. **Update**: {% katex() %}\hat{r}_{k_s}^{\text{IX}} = r_s / (p_{k_s}(s) + \gamma){}{% end %}; update {% katex() %}w_{k_s}{% end %} per Definition 33.

<span id="prop-60"></span>

**Proposition 60** (Regret Under Heavy-Tailed Delay). Under Definition 69 with \\(T\\) partition events and batch window \\(B = \lceil E[T_N] \rceil\\):

{% katex(block=true) %}
R_T^{\text{delay}} \leq 2\sqrt{T K \ln K} \cdot \sqrt{1 + E[T_N]/B} \leq 2\sqrt{2} \cdot \sqrt{T K \ln K}
{% end %}

- **Use**: Bounds delayed-feedback EXP3-IX regret; heavy-tailed Weibull partition durations add a {% katex() %}\sqrt{1 + E[T_N]/B}{% end %} overhead factor over the instantaneous bound; verify before deployment to avoid applying instantaneous guarantees in delayed-feedback settings where they are too optimistic.
- **Parameters**: {% katex() %}B = \lceil E[T_N] \rceil{% end %} batch window; CONVOY {% katex() %}k_N=0.62 \to{% end %} overhead factor {% katex() %}\approx 1.41\times{% end %} over the instantaneous bound.
- **Field note**: The Weibull assumption keeps the bound finite — verify {% katex() %}k_N > 0{% end %} from real partition data before claiming bounded regret.

The factor \\(\sqrt{2}\\) is a constant independent of \\(k_N\\) or \\(\lambda_N\\) — setting \\(B\\) to the expected partition duration absorbs the delay into a single overhead term. The bound holds for all \\(k_N > 0\\): {% katex() %}E[T_N] = \lambda_N \cdot \Gamma(1 + 1/k_N){% end %} is finite for every Weibull parameter. Contrast Pareto-distributed delays (\\(\alpha \leq 2\\)): \\(E[d] = \infty\\), breaking all standard regret bounds — the selection criterion from Section 2 of the design.

*Proof sketch.* Index time by partition events. Rounds where true reward has not yet arrived contribute phantom zero-reward updates. By the delayed-feedback EXP3 analysis (Joulani et al., 2013), inserting {% katex() %}\sum_s d_s \approx T \cdot E[T_N] / B{% end %} phantom rounds inflates regret by {% katex() %}\sqrt{1 + E[T_N]/B}{% end %}; with \\(B = \lceil E[T_N] \rceil\\), this factor is \\(\leq \sqrt{2}\\). \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} calibration** (\\(k_N = 0.62\\), \\(\lambda_N = 4.62\\) hr, \\(K = 8\\), \\(T = 100\\) partition events): instantaneous bound {% katex() %}R_T \leq 2\sqrt{TK\ln K} \approx 115{% end %}; delayed bound {% katex() %}R_T^{\text{delay}} \leq 2\sqrt{2} \cdot \sqrt{TK\ln K} \approx 163{% end %} — roughly \\(\sqrt{2} \approx 1.41\times\\) overhead. For \\(k_N = 0.3\\) (very heavy tail, \\(E[T_N]/B \approx 3\\)): regret inflates to \\(2\times\\) instantaneous — the bounded planning cost of catastrophic partitions before the bandit has seen enough events to calibrate.

> **Physical translation**: The \\(\sqrt{2}\\) factor means delayed feedback — where reward arrives only at partition end, potentially hours after the decision — costs at most 41% more regret than if reward were instantaneous. This is a concrete budget: for CONVOY with \\(k_N = 0.62\\), accepting delayed feedback (the only realistic option during multi-hour mountain partitions) inflates the regret bound from 115 to 163 sub-optimal decisions. The \\(\sqrt{2}\\) bound is independent of how long the partition lasts, as long as the batch window \\(B\\) equals the expected partition duration — a single design choice that absorbs the delay cost entirely.

<span id="def-70"></span>

**Definition 70** (Local Surrogate Reward). During active partition (\\(\Xi = N\\)), before the true end-of-partition reward (Definition 69, Step 2) arrives, the **surrogate reward** aggregates four MCU-local observables available on every MAPE-K tick:

| Signal | Symbol | Scale |
| :--- | :--- | :--- |
| CPU temperature deviation | {% katex() %}\Delta T_{\text{cpu}}(t){% end %} | {% katex() %}\Delta T_{\text{max}}{% end %} (throttle onset) |
| Battery drain excess | {% katex() %}\dot{E}_{\text{bat}}(t) - \dot{E}_0{% end %} | \\(\dot{E}_0\\) (idle drain) |
| MAPE-K loops per tick | {% katex() %}N_{\text{mape}}(t){% end %} | {% katex() %}N_{\text{mape}}^{\text{max}}{% end %} (stable rate) |
| Partition accumulator ratio | {% katex() %}T_{\text{acc}}(t){% end %} | {% katex() %}Q_{0.95}{% end %} (Proposition 59 threshold) |

{% katex(block=true) %}
r_{\text{surr}}(t) = -\left[w_1 \frac{\Delta T_{\text{cpu}}}{\Delta T_{\text{max}}} + w_2 \frac{\dot{E}_{\text{bat}} - \dot{E}_0}{\dot{E}_0} + w_3 \frac{N_{\text{mape}}}{N_{\text{mape}}^{\text{max}}} + w_4 \frac{T_{\text{acc}}}{Q_{0.95}} \right], \quad \sum_i w_i = 1
{% end %}

- **Use**: Computes a scalar surrogate reward in {% katex() %}[-1, 0]{% end %} from CPU temp, battery drain, MAPE-K cycle count, and {% katex() %}T_{\text{acc}}{% end %} during partition; use as interim reward when the true partition-end reward is unavailable to prevent reward starvation during multi-hour partitions that causes severe EXP3-IX weight drift.
- **Parameters**: {% katex() %}w_1+w_2+w_3+w_4 = 1{% end %}; CONVOY: {% katex() %}w_2=0.35{% end %} (battery-sensitive); bias-correct surrogates against realized reward at each partition end.
- **Field note**: Without bias correction at partition end, surrogates systematically over-penalize compute-heavy but effective arms.

so {% katex() %}r_{\text{surr}}(t) \in [-1, 0]{% end %}. The surrogate is applied as a fractional Q-update (weight {% katex() %}\beta_{\text{surr}} \in (0,1){% end %}) at each tick. When true reward \\(r_s\\) arrives at partition end, a **bias correction** {% katex() %}\Delta r = r_s - \beta_{\text{surr}} \cdot \bar{r}_{\text{surr}}{% end %} — where {% katex() %}\bar{r}_{\text{surr}}{% end %} is the partition-averaged surrogate — is applied as a one-shot Q-update, preventing surrogate-induced drift from compounding across partitions.

<span id="def-71"></span>

**Definition 71** (Partition Context Discretization). Arm selection is conditioned on three continuous partition-state variables, each quantized to 2 bits for O(1) lookup. Each variable \\(x\\) maps to bucket {% katex() %}b_x = \min(3,\; \lfloor 4x / x_{\max} \rfloor){% end %} via a single integer right-shift:

| Variable | {% katex() %}x_{\max}{% end %} | Bucket semantics |
| :--- | :--- | :--- |
| {% katex() %}T_{\text{acc}} / Q_{0.95}{% end %} | 1.0 | \\(b=0\\): early; \\(b=1\\): mid; \\(b=2\\): late; \\(b=3\\): past Proposition 59 gate |
| {% katex() %}\hat{\pi}_N{% end %} (regime occupancy) | 1.0 | Quartiles of partition fraction |
| {% katex() %}Q_{\text{link}} \in [0,1]{% end %} | 1.0 | Link-quality quartiles |

The **context index** packs three 2-bit fields into one byte:

{% katex(block=true) %}
c(t) = b_{T}(t) \;\Big|\; \bigl(b_{\pi}(t) \ll 2\bigr) \;\Big|\; \bigl(b_{Q}(t) \ll 4\bigr) \;\in\; \{0,\ldots,63\}
{% end %}

- **Use**: Encodes partition state into a 6-bit context index at each MAPE-K tick, selecting the correct context-specific EXP3-IX weight vector; prevents uniform weight updates from conflating short and long partitions that require fundamentally different autonomic strategies.
- **Parameters**: \\(64\\) contexts \\(\\times\\) {% katex() %}K{% end %} arms \\(\\times\\) \\(4\\) bytes = 2 KB total for {% katex() %}K=8{% end %}; fits in MCU SRAM without dynamic allocation.
- **Field note**: Pre-populate weight vectors from simulation before deployment — cold-starting in the field wastes the first 50 real partitions on pure exploration.

Each context maintains its own {% term(url="#term-exp3", def="Exponential Weights algorithm for adversarial bandits with implicit exploration; achieves minimax regret O(sqrt(TK ln K)) against adaptive adversaries") %}EXP3-IX{% end %} weight vector {% katex() %}\mathbf{w}^{(c)} \in \mathbb{R}^K{% end %}; total memory: \\(64 \times K \times 4\\) bytes (for \\(K = 8\\): 2 KB — MCU-feasible). **{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} outcome** (100 partition events): contexts \\(b_T \geq 2\\) (long partitions) converge to lower-\\(k\\) arms (\\(k \approx 0.4\\)–\\(0.5\\)); contexts \\(b_T = 0\\) (short partitions) retain higher-\\(k\\) arms (\\(k \approx 0.7\\)–\\(0.8\\)) — the bandit naturally separates near-exponential short partitions from heavy-tailed long ones.

> **Physical translation**: The 64-context table is \\(4 \times 4 \times 4\\) (connectivity states, resource states, time-in-partition states) = 64 distinct situations the bandit tracks separately, each with its own weight vector. Without context: one policy for all partitions, missing that a 10-minute mountain blackout requires different action weights than a 6-hour communications-denied operation. With context: the bandit has separate learned intuitions for "early in a short partition" versus "deep in a catastrophic partition" — encoded in 2 KB total, fitting in MCU SRAM with no dynamic allocation. The 2-bit quantization per dimension is the minimum resolution that separates qualitatively different situations without over-fitting on sparse partition data.

---

<span id="scenario-adaptshop"></span>

### Commercial Application: ADAPTSHOP Dynamic Optimization

{% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %} operates recommendation and pricing for an e-commerce platform. Every recommendation, ranking, and offer involves decisions under uncertainty; each provides learning feedback. Multi-armed bandits continuously optimize these decisions.

**The exploration-exploitation challenge**: A traditional A/B test allocates traffic 50/50 between variants for weeks, then picks a winner. This wastes traffic on inferior variants. Bandit algorithms dynamically shift traffic toward better-performing variants while maintaining exploration - the same exploration-exploitation tradeoff faced by edge systems selecting healing actions or {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} intervals.

**Bandit applications in {% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %}**: Five distinct decision types are optimized concurrently, each with a different action space (Arms), a different observable reward signal, and a different algorithm chosen to match the statistical structure of that decision.

<style>
#tbl_adaptshop_bandits + table th:first-of-type { width: 25%; }
#tbl_adaptshop_bandits + table th:nth-of-type(2) { width: 20%; }
#tbl_adaptshop_bandits + table th:nth-of-type(3) { width: 25%; }
#tbl_adaptshop_bandits + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_adaptshop_bandits"></div>

| Decision | Arms | Reward Signal | Algorithm |
| :--- | :--- | :--- | :--- |
| Homepage layout | 5 layout variants | Click-through rate | Thompson Sampling |
| Search ranking | 8 ranking models | Purchase within session | UCB |
| Email subject line | 4-12 variants | Open rate | Thompson Sampling |
| Discount level | 0%, 5%, 10%, 15%, 20% | Revenue - discount cost | Contextual bandit |
| Recommendation slot | 20+ candidate products | Click + purchase | LinUCB |

**{% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} in practice for search ranking**:

{% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %}'s search ranking uses {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} to balance showing proven-effective rankings versus testing new ranking models; {% katex() %}\hat{\mu}_i{% end %} is the observed conversion rate for model \\(i\\), \\(N\\) is total queries served, and \\(n_i\\) is queries served by model \\(i\\).

{% katex(block=true) %}
\text{UCB}(\text{model}_i) = \hat{\mu}_i + c\sqrt{\frac{\ln N}{n_i}}
{% end %}

Parameters follow the standard {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} formulation (see Proposition 18); \\(c = 1.5\\) is set for {% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %}'s exploration-exploitation balance, tuned empirically against revenue outcomes.

After 10 million search queries, the bandit has distributed traffic according to {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} scores; the table shows how Model B has earned the largest share while Models C and D continue receiving exploration traffic.

| Ranking Model | Queries Served | Conversion Rate | UCB Score |
| :--- | ---: | :--- | :--- |
| Model A (baseline) | 3.2M | 4.2% | 0.0421 |
| Model B (new ML) | 4.1M | 4.7% | 0.0471 |
| Model C (hybrid) | 2.4M | 4.5% | 0.0453 |
| Model D (experimental) | 0.3M | 3.9% | 0.0428 |

Model B receives the most traffic (highest {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}), but Models C and D continue receiving exploration traffic. If conditions change (new product categories, seasonal shifts), the exploration ensures the system can detect when a previously inferior model becomes superior.

**Contextual bandits for dynamic pricing**:

Discount decisions depend on context: user history, product category, inventory level, time of day. {% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %} uses contextual bandits that incorporate these features:

{% katex(block=true) %}
\text{Expected Revenue}(d, x) = \mathbb{E}[\text{Price} \cdot P(\text{purchase} | d, x)] - \text{Discount}(d)
{% end %}

where \\(d\\) is discount level and \\(x\\) is context vector.

The contextual bandit learns:
- First-time visitors respond strongly to 10% discount (high conversion lift)
- Repeat customers convert without discount (discount is pure margin loss)
- High-inventory items benefit from aggressive discounting
- Low-inventory items should not discount (will sell anyway)

These patterns emerged from operational learning - not from a priori assumptions.

**Regret analysis for {% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %}**:

Over 30 days with 360 million recommendation decisions, cumulative regret sums the per-round reward gap between the optimal action \\(\mu^\*\\) and the action \\(a_t\\) actually chosen, bounded by the {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} guarantee.

{% katex(block=true) %}
\text{Cumulative Regret} = \sum_{t=1}^{T} (\mu^* - \mu_{a_t}) \approx O(\sqrt{T \cdot K \cdot \ln T})
{% end %}

Observed regret: 2.3% of optimal (estimated), meaning near-optimal revenue was achieved without foreknowledge of which actions were best.

**{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %} through continuous learning**:

{% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %}'s {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} manifests in adaptation to changing conditions; the diagram below shows how each environmental shift triggers detection, policy update, and convergence to a new optimum — the same learning cycle as {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s parameter tuning, applied to e-commerce.

{% mermaid() %}
graph TD
    subgraph "Week 1: Holiday Season Begins"
        W1["Traffic 3x normal<br/>User behavior shifts"]
        W1B["Bandits detect shift<br/>Exploration increases"]
        W1C["New optimal discovered<br/>Aggressive discounts win"]
    end

    subgraph "Week 2: Inventory Depletes"
        W2["Popular items OOS<br/>Recommendations stale"]
        W2B["Bandits detect low CTR<br/>Shift to alternatives"]
        W2C["Substitute products<br/>promoted automatically"]
    end

    subgraph "Week 3: Post-Holiday"
        W3["Traffic normalizes<br/>Discount sensitivity returns"]
        W3B["Bandits detect shift<br/>Reduce discount levels"]
        W3C["Margins recover<br/>while maintaining conversion"]
    end

    W1 --> W1B --> W1C
    W1C --> W2
    W2 --> W2B --> W2C
    W2C --> W3
    W3 --> W3B --> W3C

    style W1 fill:#ffcdd2,stroke:#c62828
    style W2 fill:#fff3e0,stroke:#f57c00
    style W3 fill:#c8e6c9,stroke:#388e3c
{% end %}

Each environmental shift (holiday traffic, inventory changes, post-holiday normalization) is a stress event. The bandit algorithms detect the shift through degraded reward signals, increase exploration to find new optima, and converge on better policies. The system emerges from each stress period with updated models - {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} behavior.

**Edge system parallel**: {% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %}'s bandit algorithms face the same fundamental challenge as {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} interval tuning:
- Unknown optimal parameters
- Noisy reward signals
- Non-stationary environments
- Limited exploration budget

The mathematical framework ({% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}, {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %}, regret bounds) transfers directly. {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} learns optimal {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} intervals from packet delivery feedback; {% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %} learns optimal discount levels from purchase feedback. Both convert operational experience into improved policies.

**Quantified improvement** (with uncertainty bounds):
- Revenue lift vs. static policies: \\(+8.3\\% \pm 1.2\\%\\) (illustrative; 95% CI, measured over 12 weeks in simulation)
- Adaptation time to major shifts: \\(4.8 \pm 1.4\\) hours (vs. \\(14 \pm 5\\) days for traditional A/B tests)
- Regret reduction vs. epsilon-greedy: \\(34\\% \pm 6\\%\\) (theoretical bound: {% katex() %}O(\sqrt{T \ln K}){% end %} vs. \\(O(\epsilon T)\\))

### Updating Local Models

Every edge system maintains internal models:
- **[Connectivity model](@/blog/2026-01-15/index.md)**: Markov chain for {% term(url="@/blog/2026-01-15/index.md#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %} transitions
- **[Anomaly detection](@/blog/2026-01-22/index.md)**: Baseline distributions for normal behavior
- **[Healing effectiveness](@/blog/2026-01-29/index.md)**: Success probabilities for healing actions
- **[Coherence timing](@/blog/2026-02-05/index.md)**: Expected reconciliation costs

Each partition episode provides new data for all models; Bayesian updating multiplies the prior belief \\(P(\theta)\\) by the likelihood of the observed data under each parameter value, then normalizes to give the posterior \\(P(\theta | D)\\).

{% katex(block=true) %}
P(\theta | D) = \frac{P(D | \theta) \cdot P(\theta)}{P(D)}
{% end %}

Where \\(\theta\\) are model parameters, \\(D\\) is observed data, \\(P(\theta)\\) is prior belief, and \\(P(\theta|D)\\) is posterior belief.

**Connectivity model update**: After 7 partition events, {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s Markov transition estimates improved:
- Transition rate {% katex() %}\lambda_{connected \rightarrow degraded}{% end %}: Prior 0.02/hour, Posterior 0.035/hour
- Transition rate {% katex() %}\lambda_{degraded \rightarrow denied}{% end %}: Prior 0.1/hour, Posterior 0.08/hour

The updated model more accurately predicts partition probability, enabling better preemptive preparation.

**Anomaly detection update**: After 2 jamming episodes, {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %}'s anomaly detector incorporated new signatures:
- Prior: No jamming-specific features
- Posterior: Added features for signal-to-noise ratio drop, packet loss spike, multi-drone correlation

The detector's precision improved from 0.72 to 0.89 (in simulation) after incorporating jamming-specific patterns learned from stress events.

{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} insight: **models get more accurate with more stress**. Each stress event provides samples from the tail of the distribution - the rare events that design-time analysis cannot anticipate. A system that has experienced 12 partitions has a more accurate partition model than a system that has experienced none.

The diagram below shows how each stress event feeds a five-step cycle where observation drives model updates, improved policies produce better responses, and each response reduces regret on the next encounter.

{% mermaid() %}
graph TD
    A["Stress Event<br/>(partition, failure, attack)"] --> B["Observe Outcome<br/>(what actually happened)"]
    B --> C["Update Model<br/>(Bayesian posterior update)"]
    C --> D["Improve Policy<br/>(better parameters)"]
    D --> E["Better Response<br/>(reduced regret)"]
    E -->|"next stress"| A

    style A fill:#ffcdd2,stroke:#c62828
    style B fill:#fff9c4,stroke:#f9a825
    style C fill:#bbdefb,stroke:#1976d2
    style D fill:#e1bee7,stroke:#7b1fa2
    style E fill:#c8e6c9,stroke:#388e3c
{% end %}

This learning loop is the core mechanism of {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}. Each cycle through the loop makes the system more capable of handling the next stress event.

**Model convergence rate**: The posterior concentration tightens with more observations, expressed here as the posterior variance of parameter \\(\theta\\) given \\(n\\) data points with per-observation variance \\(\sigma^2\\):

{% katex(block=true) %}
\text{Var}(\theta | D_n) \approx \frac{\sigma^2}{n}
{% end %}

After \\(n\\) stress events, parameter uncertainty decreases by a factor of {% katex() %}\sqrt{n}{% end %}. The system's confidence in its models grows with operational experience.

### Identifying Patterns That Predict Partition

Partition events don't emerge from nothing. Precursors exist: signal degradation, geographic patterns, adversary behavior signatures. Machine learning can identify these precursors and enable **preemptive action**.

Feature set for partition prediction:
- Signal strength trend (5-minute slope)
- Packet loss rate (current and derivative)
- Geographic position (known radio shadows)
- Time-of-day (adversary activity patterns)
- Multi-node correlation (fleet-wide degradation vs. local)

Binary classification: Will partition occur within \\(\tau\\) time horizon?

{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} learned partition prediction after 8 events:
- **Pattern**: Packet loss exceeds 20% AND geographic position within 2km of ridge line yields 78% probability of partition within 10 minutes
- **Preemptive action**: Synchronize state, delegate authority, agree on fallback route
- **Outcome**: Preparation reduced partition recovery time from 340s to 45s

Each prediction (correct or incorrect) improves the predictor:
- **True positive**: Pattern correctly identified, preemptive action value confirmed
- **False positive**: Pattern incorrectly flagged, adjust threshold
- **True negative**: Normal conditions correctly identified
- **False negative**: Missed partition, add features that would have detected it

The system becomes {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} to partition: each partition event improves partition prediction, reducing the cost of future partitions.

> **Cognitive Map**: The learning-from-disconnection section builds the three-algorithm toolkit for anti-fragile parameter management. UCB handles stochastic environments: exploration bonus decays as arms are tried, converging to the best arm. EXP3 handles adversarial environments: permanent randomization via importance-weighted multiplicative updates prevents convergence to any exploitable pattern. Thompson Sampling handles the Bayesian case: posterior uncertainty drives exploration naturally and composes with gossip-shared priors after reconnection. The partition prediction subsection closes the loop — partition events themselves become training data that improve the next partition's preparation.

---

## Defensive Learning Under Adversarial Rewards

> **Problem**: An adaptive adversary can weaponize the learning process itself. If RAVEN's online learner converges to corridor C-7 because three consecutive low-jamming windows made it appear optimal, the adversary has successfully planted a predictable pattern that can be sprung as a trap.
> **Solution**: Three-layer defensive learning: (1) clip rewards to {% katex() %}\pm k_{\text{clip}} \sigma_r{% end %} around the \\(L_0\\) baseline to reject adversarially large signals; (2) filter actions through the safe feasibility set {% katex() %}\mathcal{U}_{\text{safe}}{% end %} to enforce gain-delay stability before any arm is selected; (3) CUSUM-detect favorable reward trends and respond with *increased exploration* rather than increased exploitation — treat apparent opportunities as threat hypotheses.
> **Trade-off**: Reward clipping that is too aggressive prevents the system from learning genuine improvements. Clipping set at {% katex() %}k_{\text{clip}} = 3\sigma{% end %} accepts most legitimate reward variation while rejecting adversarial spikes; {% katex() %}k_{\text{clip}} = 1\sigma{% end %} is very conservative and may suppress real signal. The \\(L_0\\) baseline anchor must be established during a clean Phase-0 attestation window — if that window was contaminated, all downstream clipping is miscalibrated.

At day 11 of the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} deployment, signals intelligence identifies a pattern: EW intensity on corridor C-7 drops for 10–14 minutes every six hours, consistent with adversary equipment rotation. RAVEN's online learner accumulates positive reward for C-7 during three consecutive low-intensity windows and shifts its exploitation preference toward that corridor. Day 14, hour 06:00: the EW rotation does not happen. Maximum jamming activates on C-7 as RAVEN commits 31 of 47 drones to the corridor.

This is not a failure of the bandit algorithm. {% term(url="#def-33", def="Exponential-weight algorithm for exploration with implicit exploration; maintains a mixed policy over K arms with minimum arm probability guaranteeing sublinear regret against adaptive adversaries") %}EXP3-IX{% end %} (Definition 33) defends against adversaries who control which arm is best *in hindsight* — it cannot defend against an adversary who has learned that the system uses online learning and exploits the *exploration phase itself*. The threat is adversarial manipulation of the reward signal during exploration: a honeypot that looks like a learning opportunity.

Three mechanisms close this gap. A reward clipping function (Definition 61) removes adversarial reward spikes before they bias Q-value estimates. A safe action filter (Definition 62) enforces the Nyquist stability condition on the feasible set regardless of what Q-values say. A CUSUM trap detector (Definition 63, Step 7) treats suspiciously favorable reward trends as a threat signal rather than an exploitation opportunity.

<span id="def-61"></span>

**Definition 61** (Clipped Reward Function). Let {% katex() %}r_{\text{raw}}(t){% end %} be the observed reward at time \\(t\\), and let {% katex() %}r_{L_0}{% end %} be the expected reward under the deterministic \\(L_0\\) policy — the survival baseline measured during the Phase-0 attestation window (Definition 60) before any learning begins. Let \\(\sigma_r(t)\\) be the running standard deviation of observed rewards maintained via Welford update (Definition 23). The **clipped reward** is:

{% katex(block=true) %}
r_{\text{clip}}(t) = \mathrm{clip}\!\left(r_{\text{raw}}(t),\; r_{L_0} - k_{\text{clip}}\,\sigma_r(t),\; r_{L_0} + k_{\text{clip}}\,\sigma_r(t)\right)
{% end %}

where {% katex() %}k_{\text{clip}}{% end %} is a fleet-wide policy parameter. The Welford estimator \\(\sigma_r\\) is updated from {% katex() %}r_{\text{clip}}(t){% end %}, not {% katex() %}r_{\text{raw}}(t){% end %}, to prevent adversarial perturbations from inflating the clip window and defeating their own filtering. The anchor {% katex() %}r_{L_0}{% end %} is frozen at Phase-0 — it cannot be poisoned by adversarial rewards during operation.

<span id="def-62"></span>

**Definition 62** (Safe Action Filter). Let \\(K(a)\\) be the gain associated with action \\(a\\) and \\(\tau(a)\\) be the corresponding stochastic transport delay (Definition 38). The **safe feasible set** at time \\(t\\) is:

{% katex(block=true) %}
\mathcal{U}_{\text{safe}}(t) = \bigl\{a \in \mathcal{A} : K(a)\cdot\tau(a) < \pi/2\bigr\}
{% end %}

- **Use**: Computes the safe arm set by excluding actions where gain-times-delay product {% katex() %}K(a) \cdot \tau(a){% end %} exceeds the {% katex() %}\pi/2{% end %} phase margin; apply before each arm selection to prevent destabilizing high-gain, high-latency actions even when they appear rewarding in the short term.
- **Parameters**: {% katex() %}K(a){% end %} = action state-change magnitude; {% katex() %}\tau(a){% end %} = expected execution delay; {% katex() %}\pi/2 \approx 1.57{% end %} rad phase margin threshold.
- **Field note**: The safe set shrinks as link latency grows — re-compute it with real-time delay measurements, not the design-time value.

> **Physical translation**: \\(K(a) \cdot \tau(a) < \pi/2\\) is a phase-margin condition from control theory. \\(K(a)\\) is how aggressively the action changes the system state; \\(\tau(a)\\) is how long before that change takes effect. Their product is the total phase shift introduced into the control loop. When this product reaches \\(\pi/2\\) (\\(\approx 1.57\\) radians), the loop is at the stability boundary — any further increase causes oscillation. The condition says: never take an action that is simultaneously too aggressive *and* too slow. A gentle action (small \\(K\\)) can tolerate high delay; a fast-responding action (small \\(\tau\\)) can tolerate higher gain.

This is a sufficient gain-delay stability condition — bounding the product \\(K(a)\cdot\tau(a)\\) prevents phase crossover in the autonomic control loop — applied as a hard pre-filter on the action space before any Q-value comparison is made. Proposition 9 establishes the discrete-time analogue; the condition \\(K(a)\cdot\tau(a) < \pi/2\\) is the continuous-time sufficient criterion for phase margin. Any action that would push the autonomic control loop past the stability boundary is inadmissible regardless of its estimated reward. When {% katex() %}\mathcal{U}_{\text{safe}}(t) = \emptyset{% end %} — all actions currently violate the stability condition — the agent executes the deterministic \\(L_0\\) policy {% katex() %}\pi_{L_0}{% end %}, covered by [Proposition 36 (Hardened Hierarchy Fail-Down)](@/blog/2026-01-15/index.md#prop-36).

<span id="def-63"></span>

**Definition 63** (Safe-\\(\varepsilon\\)-Greedy Algorithm). The agent maintains per-action Q-value estimates \\(Q[a]\\) and visit counts \\(N[a]\\), Welford reward statistics \\((\mu_r, \sigma_r)\\), exploration rate \\(\varepsilon\\), and a CUSUM positive accumulator \\(S_+\\) (Definition 34). Parameters are: exploration floor \\(\varepsilon_0\\), entropy ceiling {% katex() %}\varepsilon_{\max}{% end %}, inflation factor {% katex() %}\gamma_{\text{infl}} > 1{% end %}, clipping threshold {% katex() %}k_{\text{clip}}{% end %}, CUSUM sensitivity {% katex() %}\delta_{\text{cusum}}{% end %}, trap trigger \\(\vartheta\\), exponential decay rate {% katex() %}\alpha_{\text{dec}} \in (0, 1){% end %}, and Phase-0 baseline {% katex() %}r_{L_0}{% end %}. At each time step \\(t\\):

{% katex(block=true) %}
\begin{aligned}
&\textbf{Step 0}\;(\text{hardware veto check}):\quad \text{read}\;v(t);\;\text{if}\;v(t)=1:\;\text{halt — no action issued, }Q_d\text{ frozen, no retry} \\[2pt]
&\textbf{Step 1}\;(\text{safe filter}):\quad \mathcal{U}_{\text{safe}} \leftarrow \{a \in \mathcal{A} : K(a)\cdot\tau(a) < \pi/2\} \\[2pt]
&\textbf{Step 2}\;(L_0\;\text{check}):\quad \text{if}\;\mathcal{U}_{\text{safe}} = \emptyset:\;\text{execute}\;\pi_{L_0};\;\text{goto Step}\;10 \\[2pt]
&\textbf{Step 3}\;(\text{action}):\quad a_t \leftarrow \begin{cases} \mathrm{Uniform}(\mathcal{U}_{\text{safe}}) & u \sim \mathrm{Unif}(0,1) < \varepsilon \\ \arg\max_{a \in \mathcal{U}_{\text{safe}}} Q[a] & \text{otherwise} \end{cases} \\[2pt]
&\textbf{Step 4}\;(\text{clip}):\quad r_t \leftarrow \mathrm{clip}\!\left(r_{\mathrm{raw}},\;r_{L_0} - k_{\text{clip}}\sigma_r,\;r_{L_0} + k_{\text{clip}}\sigma_r\right) \\[2pt]
&\textbf{Step 5}\;(\text{Welford}):\quad (\mu_r,\;\sigma_r) \leftarrow \mathrm{WelfordUpdate}(\mu_r,\;\sigma_r,\;r_t) \\[2pt]
&\textbf{Step 6}\;(Q\text{-update}):\quad N[a_t] \mathrel{+}= 1;\quad Q[a_t] \leftarrow Q[a_t] + \tfrac{r_t - Q[a_t]}{N[a_t]} \\[2pt]
&\textbf{Step 7}\;(\text{CUSUM}):\quad \xi \leftarrow r_t - \mu_r;\quad S_+ \leftarrow \max\!\left(0,\; S_+ + \xi - \delta_{\text{cusum}}\right) \\[2pt]
&\textbf{Step 8}\;(\text{trap check}):\quad \text{if}\;S_+ > \vartheta:\;\varepsilon \leftarrow \min(\varepsilon_{\max},\;\gamma_{\text{infl}}\cdot\varepsilon);\;S_+ \leftarrow 0 \\[2pt]
&\textbf{Step 9}\;(\text{decay}):\quad \text{else:}\;\varepsilon \leftarrow \max(\varepsilon_0,\;\alpha_{\text{dec}}\cdot\varepsilon) \\[2pt]
&\textbf{Step 10}\;(\text{output}):\quad \text{return}\;a_t
\end{aligned}
{% end %}

**(Step 0 — Hardware veto check)**: Read hardware veto signal \\(v(t)\\). If \\(v(t) = 1\\) ([Proposition 62](@/blog/2026-01-29/index.md#prop-62)), halt immediately — no action is issued, \\(Q_d\\) remains frozen, no retry is scheduled. Hardware is in control; the software algorithm does not proceed. This check has absolute priority over all subsequent steps.

> **Field note — veto signal integrity**: (1) Signal loss: if the hardware veto GPIO signal is disconnected or floating, treat it as v(t) = 1 (conservative — assume veto active). Never assume an absent signal means "no veto." (2) Race condition: v(t) must be re-sampled immediately before action issuance (Step 3 or Step 10) as well as at Step 0. On embedded systems without atomic read-execute, latch v(t) at Step 0 and hold the latch until the action completes — a 0-to-1 transition between Step 0 and Step 10 must abort the action. (3) Multiple veto signals: if the system has more than one physical interlock, any asserted veto overrides all others.

- **Use**: Guarantees per-tick survival probability above {% katex() %}(1 - \varepsilon_{\text{surv}}){% end %} for any arm within the safe set; enforced as the hard gate in Safe-{% katex() %}\varepsilon{% end %}-Greedy at every MAPE-K tick to prevent reward-chasing from selecting arms that appear optimal but breach the survival floor.
- **Parameters**: {% katex() %}\varepsilon_{\text{surv}} = 10^{-4}{% end %} for safety-critical deployments; {% katex() %}10^{-3}{% end %} for operational; never relax in field conditions.
- **Field note**: {% katex() %}\varepsilon_{\text{surv}} = 10^{-4}{% end %} at a 5-second MAPE-K cycle means one allowed violation per ~14 hours — validate this against your mission SLA.

**Calibration**: Set \\(\varepsilon = 0.05\\) as a starting point (5% random exploration). Increase to \\(\varepsilon = 0.15\\) in novel environments or after a regime change detected by Definition 34. Decrease toward \\(\varepsilon = 0.01\\) after 500+ successful episodes in a stable regime. Note that \\(\varepsilon\\) here is the *exploration rate* — the probability of choosing a random safe action rather than the Q-value maximizer — distinct from {% katex() %}\varepsilon_{\text{surv}}{% end %} (the per-tick survival violation tolerance) and from \\(\varepsilon_0\\) / {% katex() %}\varepsilon_{\max}{% end %} (the algorithmic floor and ceiling that the CUSUM trap detector adjusts \\(\varepsilon\\) between).

The CUSUM accumulator \\(S_+\\) adopts the same one-sided Page-CUSUM structure as the Adversarial Non-Stationarity Detector (Definition 34), applied to the reward innovation {% katex() %}\xi(t) = r_t - \mu_r{% end %}. The response pivots: where Definition 34 flags a regime change and triggers a policy switch, Step 8 responds to a *favorable* shift by increasing exploration — the inverse of the normal exploitation instinct. A reward trend that looks like an opportunity is treated as a threat hypothesis until diverse exploration cycles distinguish genuine improvement from adversarial bait. \\(\square\\)

<span id="prop-56"></span>

**Proposition 56** (Survival Invariant). Under Safe-\\(\varepsilon\\)-Greedy (Definition 63), the selected action satisfies {% katex() %}K(a_t)\cdot\tau(a_t) < \pi/2{% end %} whenever {% katex() %}\mathcal{U}_{\text{safe}}(t) \neq \emptyset{% end %}. When {% katex() %}\mathcal{U}_{\text{safe}}(t) = \emptyset{% end %}, the deterministic \\(L_0\\) policy is executed, which satisfies the survival constraint by [Proposition 36 (Hardened Hierarchy Fail-Down)](@/blog/2026-01-15/index.md#prop-36).

*Proof.* Step 1 constructs {% katex() %}\mathcal{U}_{\text{safe}}{% end %} by excluding all actions with {% katex() %}K(a)\cdot\tau(a) \geq \pi/2{% end %}. Both branches of Step 3 — exploration (uniform over {% katex() %}\mathcal{U}_{\text{safe}}{% end %}) and exploitation ({% katex() %}\arg\max{% end %} over {% katex() %}\mathcal{U}_{\text{safe}}{% end %}) — select exclusively from this set. The goto-Step-10 branch in Step 2 executes {% katex() %}\pi_{L_0}{% end %}, whose gains are pre-validated during Phase-0 attestation to satisfy \\(K\cdot\tau(a) < \pi/2\\); [Proposition 36 (Hardened Hierarchy Fail-Down)](@/blog/2026-01-15/index.md#prop-36) ensures the \\(L_0\\) tier remains reachable when all autonomic actions are infeasible. \\(\square\\)

**L0 policy failure**: If {% katex() %}\pi_{L_0}{% end %} is itself unavailable (firmware corruption, hardware fault), the physical safety interlock ([Definition 54](@/blog/2026-02-19/index.md#def-54)) activates independently — it does not rely on software execution and cannot be bypassed by MAB weight updates.

<span id="prop-57"></span>

**Proposition 57** (Adversarial Rejection Bound). Decompose the observed reward as {% katex() %}r_{\text{raw}}(t) = r_{\text{true}}(t) + \eta_{\text{adv}}(t){% end %}, where {% katex() %}r_{\text{true}}(t) \in [r_{L_0} - \delta_{\text{leg}}, r_{L_0} + \delta_{\text{leg}}]{% end %} is the legitimate reward deviation and {% katex() %}\eta_{\text{adv}}(t){% end %} is adversarial perturbation. If {% katex() %}k_{\text{clip}}\,\sigma_r > \delta_{\text{leg}}{% end %}, then no legitimate reward is clipped. The Q-value estimation bias satisfies:

{% katex(block=true) %}
\bigl|\mathbb{E}[Q_{\text{clip}}[a]] - Q_{\text{true}}[a]\bigr| \leq \bigl(k_{\text{clip}}\,\sigma_r + \delta_{\text{leg}}\bigr)\cdot P\!\left(|\eta_{\text{adv}}| > k_{\text{clip}}\,\sigma_r - \delta_{\text{leg}}\right)
{% end %}

Under Gaussian adversarial perturbations {% katex() %}\eta_{\text{adv}} \sim \mathcal{N}(0, \sigma_{\text{adv}}^2){% end %}, the right-hand side decays as {% katex() %}1 - \Phi\!\left(\tfrac{k_{\text{clip}}\,\sigma_r - \delta_{\text{leg}}}{\sigma_{\text{adv}}}\right){% end %} — the same Gaussian tail form as Proposition 54 (False-Positive Ejection Bound). \\(\square\\)

*Proof sketch.* Q-values are incremental averages of clipped rewards. Clipping truncates observations outside {% katex() %}[r_{L_0} - k_{\text{clip}}\sigma_r,\; r_{L_0} + k_{\text{clip}}\sigma_r]{% end %}; when {% katex() %}k_{\text{clip}}\sigma_r > \delta_{\text{leg}}{% end %}, legitimate rewards lie within this interval and are never truncated. The bias from clipping a single adversarial observation is bounded by the clip radius; the expected bias over \\(N[a]\\) visits is {% katex() %}\text{clip\_radius} \cdot P(\text{adversarial}){% end %}, giving the stated bound. \\(\square\\)

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} calibration.** With {% katex() %}r_{L_0}{% end %} measured over 48 hours of pre-deployment operation, \\(\sigma_r\\) converges within the first 200 observations by Proposition 24 (Kalman Baseline Convergence Rate). Setting {% katex() %}k_{\text{clip}} = 3{% end %}: the adversary's 10-minute EW reduction — yielding reward spike {% katex() %}|\eta_{\text{adv}}| \approx 2.8\,\sigma_r{% end %} — is admitted; a coordinated attack delivering {% katex() %}|\eta_{\text{adv}}| > 3\sigma_r{% end %} is clipped before reaching the Q-update. The CUSUM trap detector fires after approximately {% katex() %}\vartheta / \delta_{\text{cusum}}{% end %} steps of sustained positive innovation, tripling \\(\varepsilon\\) ({% katex() %}\gamma_{\text{infl}} = 3{% end %}) — forcing {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} to re-explore rather than commit to the apparently optimal corridor. At day 15, the adversary's trap sequence fails: the swarm is too uncertain about C-7 to exploit it.

> **Cognitive Map**: The defensive learning section inverts the anti-fragile intuition: an adversary can weaponize a system's learning against it. The three-layer defense — reward clipping (Definition 61), safe action filter (Definition 62), and Safe-\\(\varepsilon\\)-Greedy with CUSUM trap detection (Definition 63) — each address a different attack vector. Reward clipping rejects large-magnitude adversarial signals. The safe filter prevents the learner from ever selecting a physically destabilizing action. The CUSUM trap detector responds to *favorable* trends with exploration rather than exploitation, denying the adversary the ability to funnel the system toward a predictable pattern. The survival invariant (Proposition 56) and adversarial rejection bound (Proposition 57) give the formal guarantees.

---

## Anti-Fragile Design Patterns Catalog

> **Problem**: The mechanisms developed so far — bandit algorithms, safe action filters, reward clipping, defensive learning — are individually powerful but form a bewildering toolkit without a unifying structure for knowing when to use which.
> **Solution**: Organize anti-fragile mechanisms into a pattern catalog by scenario class: redundancy under stress, learning from stress, partitioned operation, parameter adaptation, and information capture. Each pattern has applicability conditions, expected costs, and implementation guidance.
> **Trade-off**: Patterns are templates, not implementations. The failure modes listed in each pattern reflect the known edge cases — but novel environments may surface new failure modes not in the catalog. The catalog's value is reducing time-to-correct-selection; it does not eliminate the need for environment-specific validation.

Reusable patterns with applicability conditions, trade-offs, and implementation guidance.

### Pattern Classification Framework

{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} patterns address three concerns:
1. **Learning patterns**: Extract information from stress events
2. **Adaptation patterns**: Modify behavior based on learned information
3. **Validation patterns**: Verify that adaptations improve system behavior

The diagram below maps each pattern to its category and shows which learning patterns feed which adaptation patterns and their corresponding validation counterparts.

{% mermaid() %}
graph LR
    subgraph "Learning Patterns"
        L1["Multi-Armed Bandit<br/>Stress Learning"]
        L2["Bayesian Parameter<br/>Update"]
        L3["Partition Prediction<br/>Learning"]
    end

    subgraph "Adaptation Patterns"
        A1["Dynamic Resource<br/>Weighting"]
        A2["Graceful Degradation<br/>Ladder"]
        A3["Adaptive Threshold<br/>Tuning"]
    end

    subgraph "Validation Patterns"
        V1["Phase-Gate<br/>Validation"]
        V2["Chaos Engineering<br/>Verification"]
        V3["Regression<br/>Invariants"]
    end

    L1 --> A1
    L2 --> A3
    L3 --> A2
    A1 --> V1
    A2 --> V2
    A3 --> V3

    style L1 fill:#e3f2fd,stroke:#1976d2
    style L2 fill:#e3f2fd,stroke:#1976d2
    style L3 fill:#e3f2fd,stroke:#1976d2
    style A1 fill:#fff3e0,stroke:#f57c00
    style A2 fill:#fff3e0,stroke:#f57c00
    style A3 fill:#fff3e0,stroke:#f57c00
    style V1 fill:#e8f5e9,stroke:#388e3c
    style V2 fill:#e8f5e9,stroke:#388e3c
    style V3 fill:#e8f5e9,stroke:#388e3c
{% end %}

---

### Learning Patterns

#### Pattern L1: Multi-Armed Bandit Stress Learning

**Intent**: Learn optimal action selection from stress events without requiring labeled training data.

**Problem**: The system must choose among multiple responses to stress (healing actions, configuration parameters, routing strategies). Optimal choice is unknown and varies by context. Random exploration is costly; pure exploitation misses better alternatives.

**Solution**: Model each action as a bandit arm with unknown reward distribution. Use exploration-exploitation algorithm ({% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}, {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %}) to balance trying new actions against exploiting known-good actions.

**Structure**:

The {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} score for each action \\(a\\) combines the estimated mean reward {% katex() %}\hat{\mu}_a{% end %} (exploitation term) with a confidence-bound bonus that grows when the action has been tried few times (exploration term), so under-tried actions are automatically re-explored.

{% katex(block=true) %}
\text{UCB}(a) = \underbrace{\hat{\mu}_a}_{\text{exploitation}} + \underbrace{c\sqrt{\frac{\ln t}{n_a}}}_{\text{exploration}}
{% end %}

The four state variables that the algorithm tracks per arm are described below, together with their incremental update rules applied each time an arm is selected.

| Component | Description | Update Rule |
| :--- | :--- | :--- |
| {% katex() %}\hat{\mu}_a{% end %} | Estimated reward for action \\(a\\) | {% katex() %}\hat{\mu}_a \leftarrow \hat{\mu}_a + \frac{1}{n_a}(r - \hat{\mu}_a){% end %} |
| \\(n_a\\) | Times action \\(a\\) selected | \\(n_a \leftarrow n_a + 1\\) |
| \\(t\\) | Total selections | \\(t \leftarrow t + 1\\) |
| \\(c\\) | Exploration coefficient | Typically {% katex() %}\sqrt{2}{% end %}, tune empirically |

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| Discrete action space | Yes | Actions must be enumerable |
| Observable reward signal | Yes | Must know if action succeeded |
| Actions are repeatable | Yes | Same action can be tried again |
| Stationary reward distribution | ~ | Non-stationarity requires windowed estimates |
| Low action cost | ~ | High-cost actions need conservative \\(c\\) |

**Performance Trade-offs**: The table compares {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}, {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %}, and \\(\varepsilon\\)-Greedy across five dimensions; {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} and {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %} share the same asymptotic regret bound but differ on computational cost, non-stationarity handling, and sample efficiency.

<style>
#tbl_mab_tradeoffs + table th:first-of-type { width: 25%; }
#tbl_mab_tradeoffs + table th:nth-of-type(2) { width: 25%; }
#tbl_mab_tradeoffs + table th:nth-of-type(3) { width: 25%; }
#tbl_mab_tradeoffs + table th:nth-of-type(4) { width: 25%; }
</style>
<div id="tbl_mab_tradeoffs"></div>

| Metric | UCB | Thompson Sampling | \\(\varepsilon\\)-Greedy |
| :--- | :--- | :--- | :--- |
| Regret bound | {% katex() %}O(\sqrt{KT \ln T}){% end %} | {% katex() %}O(\sqrt{KT \ln T}){% end %} | {% katex() %}O(\epsilon T + K/\epsilon){% end %} |
| Computational cost | Low | Medium (sampling) | Lowest |
| Handles non-stationarity | Poor | Moderate | Good (with decay) |
| Implementation complexity | Simple | Moderate | Simplest |
| Sample efficiency | High | Highest | Low |

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} Implementation**: 6 healing actions, {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} with \\(c = 1.5\\). After 100 episodes, regret bounded by ~53 suboptimal decisions. Convergence to 95% of optimal policy within 3 weeks of operation.

**Anti-pattern**: Using \\(\varepsilon\\)-greedy with fixed \\(\varepsilon\\) in low-sample environments - wastes exploration on already-known-bad actions.

---

#### Pattern L2: Bayesian Parameter Update

**Intent**: Maintain probabilistic beliefs about system parameters, updating beliefs as evidence accumulates from stress events.

**Problem**: System parameters (transition rates, failure probabilities, timing constants) are uncertain at deployment. Point estimates lack confidence information needed for safe decision-making.

**Solution**: Model parameters as probability distributions. Use Bayesian inference to update distributions as observations arrive. Decision-making incorporates uncertainty through credible intervals or posterior sampling.

**Structure**:

The posterior over parameter \\(\theta\\) given observations \\(D\\) is proportional to the product of the likelihood (how probable the data is under \\(\theta\\)) and the prior (initial belief about \\(\theta\\)).

{% katex(block=true) %}
p(\theta | D) = \frac{p(D | \theta) \cdot p(\theta)}{p(D)} \propto \text{likelihood} \times \text{prior}
{% end %}

**Conjugate prior families for common parameters**: Choosing a prior from the conjugate family for a given likelihood makes the posterior analytically tractable and reduces each update to incrementing a small set of sufficient statistics.

| Parameter Type | Likelihood | Prior | Posterior |
| :--- | :--- | :--- | :--- |
| Probability | Binomial | Beta(\\(\alpha\\), \\(\beta\\)) | Beta(\\(\alpha + k\\), \\(\beta + n - k\\)) |
| Rate | Poisson | Gamma(\\(k\\), \\(\theta\\)) | Gamma({% katex() %}k + \sum x_i{% end %}, \\(\theta + n\\)) |
| Mean (known var) | Normal | Normal(\\(\mu_0\\), \\(\sigma_0^2\\)) | Normal(\\(\mu_n\\), \\(\sigma_n^2\\)) |
| Transition rates | Exponential | Gamma | Gamma (with sufficient statistics) |

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| Parameter is scalar or low-dim | Yes | High-dim requires approximations |
| Conjugate prior exists | ~ | Non-conjugate needs MCMC/VI |
| Observations are exchangeable | ~ | Time-varying needs sequential updates |
| Prior knowledge available | ~ | Uninformative priors if not |

**Performance Trade-offs**:

| Approach | Uncertainty Quantification | Computational Cost | Prior Sensitivity |
| :--- | :--- | :--- | :--- |
| Conjugate Bayesian | Full posterior | O(1) update | Moderate |
| Variational inference | Approximate | O(n) per iteration | Low |
| MCMC | Exact (asymptotic) | {% katex() %}O(n \times \text{samples}){% end %} | Low |
| Point estimate (MLE) | None | O(1) | N/A |

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} Implementation**: Transition rates for connectivity Markov chain. Gamma(2, 0.5) prior encodes "expect transitions every few hours." After 50 observed transitions, posterior concentrates around MLE with 90% credible interval width < 0.03.

**Anti-pattern**: Using point estimates without uncertainty in safety-critical decisions - overconfident actions based on limited data.

---

#### Pattern L3: Partition Prediction Learning

**Intent**: Learn precursor patterns that predict imminent partition, enabling preemptive preparation.

**Problem**: Partition events cause disruption. If partitions could be predicted, the system could prepare (sync state, delegate authority, cache resources), reducing partition impact.

**Solution**: Treat partition prediction as supervised learning. Features are observable signals (signal strength, packet loss, position). Label is partition occurrence within time horizon. Train classifier online as partition events occur.

**Structure**:

This logistic classifier outputs the probability that a partition will occur within horizon \\(\tau\\), given the current feature vector \\(x\\) (which encodes signal quality, position, and fleet state); weights \\(w\\) and bias \\(b\\) are learned from past partition events.

{% katex(block=true) %}
P(\text{partition in } \tau | x) = \sigma(w^T x + b)
{% end %}

**Feature engineering for partition prediction**: The classifier input vector \\(x\\) is assembled from six observable categories spanning current conditions, trends, spatial context, and fleet state; the temporal scope column indicates how far back each feature window reaches.

| Feature Category | Examples | Temporal Scope |
| :--- | :--- | :--- |
| Signal quality | RSSI, SNR, packet loss rate | 1-5 minute window |
| Signal dynamics | RSSI slope, loss rate derivative | Trend over 2-10 minutes |
| Spatial | GPS position, distance to known shadows | Current |
| Temporal | Time of day, day of week | Current |
| Fleet correlation | % of fleet degraded, cluster connectivity | Current |
| Historical | Same location partition history | Long-term |

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| Partition has precursors | Yes | Random partitions unpredictable |
| Precursors are observable | Yes | Need measurable signals |
| Sufficient partition events for training | ~ | 10+ events for basic model |
| Prediction horizon is actionable | Yes | Enough time to prepare |

**Performance Trade-offs**:

| Prediction Horizon | Accuracy (typical) | Actionable Time | False Positive Cost |
| :--- | :--- | :--- | :--- |
| 1 minute | 85-95% | Minimal | Low (brief prep) |
| 5 minutes | 70-85% | Moderate | Medium |
| 15 minutes | 55-70% | Substantial | High (extended prep mode) |
| 30 minutes | 45-60% | Maximum | Very high |

**Precision-Recall Trade-off**:

| Threshold Setting | Precision | Recall | Use Case |
| :--- | :--- | :--- | :--- |
| Conservative (high) | 90%+ | 50-60% | Low FP cost, high FN cost |
| Balanced | 75-85% | 75-85% | Moderate costs both ways |
| Aggressive (low) | 60-70% | 90%+ | High FP cost, low FN cost |

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} Implementation**: Logistic regression with 8 features. After 8 partition events, achieved 78% accuracy at 10-minute horizon. Preemptive preparation reduced recovery time from 340s to 45s.

**Anti-pattern**: Training on insufficient data (< 5 events) - model overfits to specific partition causes, fails to generalize.

---

### Adaptation Patterns

#### Pattern A1: Dynamic Resource Weighting

**Intent**: Automatically reallocate resources across competing functions based on system state and learned priorities.

**Problem**: Fixed resource allocation is suboptimal - mission needs vary with state, connectivity, and stress level. Manual reallocation is too slow for edge environments.

**Solution**: Define utility functions for each resource consumer. Dynamically solve allocation optimization as state changes. Learn utility function parameters from operational outcomes.

**Structure**:

This objective allocates resource amounts \\(r_i\\) to each of \\(n\\) competing functions so that the weighted sum of their utilities is maximized, with weights \\(w_i(s)\\) shifting based on current system state \\(s\\) to reflect which functions matter most right now.

{% katex(block=true) %}
\max_{r_1, ..., r_n} \sum_i w_i(s) \cdot U_i(r_i) \quad \text{s.t.} \quad \sum_i r_i \leq R_{\text{total}}
{% end %}

where \\(w_i(s)\\) are state-dependent weights and \\(U_i(r_i)\\) are utility functions.

**Weight adaptation based on state**:

The table below shows how the four resource weights shift across system states; each row sums to 1.0, and the pattern shows mission weight decreasing under stress while healing and coherence weights increase.

| System State | Mission Weight | Healing Weight | Learning Weight | Coherence Weight |
| :--- | :--- | :--- | :--- | :--- |
| Normal | 0.70 | 0.10 | 0.10 | 0.10 |
| Degraded | 0.60 | 0.20 | 0.05 | 0.15 |
| Partition | 0.50 | 0.25 | 0.00 | 0.25 |
| Recovery | 0.40 | 0.15 | 0.05 | 0.40 |
| Critical | 0.80 | 0.15 | 0.00 | 0.05 |

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| Resources are fungible | ~ | Non-fungible needs constraint handling |
| Utility functions are known | ~ | Unknown requires learning |
| State is observable | Yes | Weight selection needs state |
| Reallocation is fast | Yes | Slow reallocation misses state changes |

**Performance Trade-offs**: More frequent reallocation improves optimality but increases overhead and reduces stability; state-triggered reallocation achieves the best stability and lowest overhead by acting only when the system state actually changes.

| Reallocation Frequency | Optimality | Overhead | Stability |
| :--- | :--- | :--- | :--- |
| Per-event | Highest | Highest | Lowest (oscillation risk) |
| Periodic (1s) | High | Medium | Medium |
| Periodic (10s) | Medium | Low | High |
| State-triggered only | Medium-High | Lowest | Highest |

**Learning the weights**: Weights can be learned via policy gradient, where each weight \\(w_i(s)\\) is nudged in the direction that increases expected total system reward \\(R\\).

{% katex(block=true) %}
w_i(s) \leftarrow w_i(s) + \alpha \nabla_{w_i} \mathbb{E}[R | w]
{% end %}

where \\(R\\) is overall system reward (mission success, recovery time, etc.).

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} Implementation**: 4 resource pools (compute, bandwidth, power, storage). Weights updated every 5 seconds based on {% term(url="@/blog/2026-01-15/index.md#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %}. Learning via contextual bandit improved allocation efficiency by 18% over fixed weights.

**Anti-pattern**: Reacting to transient state changes - add hysteresis to prevent oscillation.

---

#### Pattern A2: Graceful Degradation Ladder

**Intent**: Define explicit {% term(url="@/blog/2026-01-15/index.md#term-capability-level", def="Operational capability tier L0-L4 from heartbeat-only survival to full fleet integration; each level requires minimum connectivity and consumes proportionally more energy") %}capability levels{% end %} that the system traverses as resources or connectivity degrade, ensuring predictable behavior under stress.

**Problem**: Ad-hoc degradation leads to unpredictable behavior. Operators cannot reason about system capabilities during stress. Recovery is complicated by unknown degraded state.

**Solution**: Define discrete degradation levels (ladder rungs). Each level specifies which capabilities are available and which are disabled. Transitions between levels are triggered by explicit conditions. Recovery reverses the degradation path.

**Structure**:

The diagram shows the five ladder levels and the resource-threshold conditions that trigger downward transitions (left arrows) and the stability requirements that allow upward recovery (right arrows).

{% mermaid() %}
graph TD
    L4["L4: Full Capability<br/>All features enabled"]
    L3["L3: Reduced Features<br/>Non-critical disabled"]
    L2["L2: Core Function<br/>Mission-essential only"]
    L1["L1: Survival Mode<br/>Safety + logging"]
    L0["L0: Safe State<br/>Minimal operation"]

    L4 -->|"Resource < 70%"| L3
    L3 -->|"Resource < 50%"| L2
    L2 -->|"Resource < 30%"| L1
    L1 -->|"Resource < 10%"| L0

    L0 -->|"Resource > 20%<br/>+ stable 60s"| L1
    L1 -->|"Resource > 40%<br/>+ stable 60s"| L2
    L2 -->|"Resource > 60%<br/>+ stable 60s"| L3
    L3 -->|"Resource > 80%<br/>+ stable 60s"| L4

    style L4 fill:#c8e6c9,stroke:#388e3c
    style L3 fill:#fff9c4,stroke:#f9a825
    style L2 fill:#ffe0b2,stroke:#f57c00
    style L1 fill:#ffcdd2,stroke:#e57373
    style L0 fill:#e0e0e0,stroke:#757575
{% end %}

**Degradation level specification**:

<style>
#tbl_degradation_levels + table th:first-of-type { width: 12%; }
#tbl_degradation_levels + table th:nth-of-type(2) { width: 22%; }
#tbl_degradation_levels + table th:nth-of-type(3) { width: 22%; }
#tbl_degradation_levels + table th:nth-of-type(4) { width: 22%; }
#tbl_degradation_levels + table th:nth-of-type(5) { width: 22%; }
</style>
<div id="tbl_degradation_levels"></div>

| Level | Trigger | Enabled | Disabled | Recovery Condition |
| :--- | :--- | :--- | :--- | :--- |
| L4 | Default | All | None | - |
| L3 | CPU > 80% OR Memory > 85% | Core + analytics | ML inference, logging verbosity | Below threshold + 60s stable |
| L2 | CPU > 90% OR Connectivity < 30% | Core mission | Analytics, non-critical sync | Below threshold + 60s stable |
| L1 | Power < 20% OR Critical failure | Safety, minimal logging | All non-safety | Power > 30% + 120s stable |
| L0 | Power < 5% OR Unrecoverable | Safe shutdown prep | All | Manual intervention |

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| Capabilities are separable | Yes | Can disable features independently |
| Clear priority ordering exists | Yes | Know what to shed first |
| Triggers are measurable | Yes | Need observable thresholds |
| Recovery is possible | ~ | Some degradations are permanent |

**Performance Trade-offs**:

More degradation levels give finer-grained resource control but make the ladder harder for operators to reason about and test; the table shows how granularity, complexity, and operator comprehension shift together.

| Number of Levels | Granularity | Complexity | Operator Comprehension |
| :--- | :--- | :--- | :--- |
| 2 (on/degraded) | Low | Low | High |
| 3-5 | Medium | Medium | Medium |
| 6-10 | High | High | Low |
| Continuous | Highest | Highest | Very Low |

**Hysteresis requirement**: Upgrade thresholds must be set higher than downgrade thresholds so the system cannot immediately re-downgrade after recovering, with the gap {% katex() %}\Delta_{\text{hysteresis}}{% end %} sized to absorb normal measurement noise without triggering oscillation.

{% katex(block=true) %}
\theta_{\text{upgrade}} = \theta_{\text{downgrade}} + \Delta_{\text{hysteresis}}
{% end %}

Typical {% katex() %}\Delta_{\text{hysteresis}}{% end %} = 10-20% of threshold value.

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} Implementation**: 5-level ladder. Transition logged with timestamp and trigger. Recovery requires threshold + 60s stability. Oscillation rate < 0.1 transitions/minute during stress testing.

**Anti-pattern**: Continuous degradation without discrete levels - impossible to reason about, test, or document.

---

#### Pattern A3: Adaptive Threshold Tuning

**Intent**: Automatically adjust detection and decision thresholds based on observed false positive/negative rates.

**Problem**: Static thresholds are suboptimal as operating conditions change. Manual tuning requires expertise and ongoing attention. Thresholds that work in testing may fail in production.

**Solution**: Track classification outcomes (TP, FP, TN, FN). Adjust thresholds to maintain target precision/recall balance. Use control-theoretic approach to ensure stability.

**Structure**:

The threshold is updated each cycle by a step proportional to the error between the target metric rate {% katex() %}r_{\text{target}}{% end %} (e.g., desired false positive rate) and the currently observed rate {% katex() %}r_{\text{observed}}{% end %}.

{% katex(block=true) %}
\theta_{t+1} = \theta_t + \eta \cdot (r_{\text{target}} - r_{\text{observed}})
{% end %}

where \\(r\\) is the metric being controlled (e.g., false positive rate).

**Threshold adaptation control loop**:

The loop below shows the four-step cycle: measurement feeds a comparison against targets, the error drives a threshold adjustment, and the updated threshold governs the next detection round.

{% mermaid() %}
graph LR
    M["Measure<br/>FP rate, FN rate"]
    C["Compare<br/>vs. targets"]
    A["Adjust<br/>theta +/- delta"]
    S["System<br/>Detection/Decision"]

    M --> C --> A --> S --> M

    style C fill:#fff3e0,stroke:#f57c00
{% end %}

**Target setting by use case**: The appropriate false positive (FP) and false negative (FN) rate targets depend on the relative cost of each error type; safety-critical and security use cases set near-zero FN targets even at the cost of higher FP rates.

| Use Case | FP Rate Target | FN Rate Target | Rationale |
| :--- | :--- | :--- | :--- |
| Safety-critical detection | 10% | 1% | Miss is catastrophic |
| Anomaly alerting | 5% | 10% | Alert fatigue vs. missed anomaly |
| Resource allocation | 15% | 15% | Balanced cost |
| Security detection | 20% | 0.1% | Miss is unacceptable |

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| Outcomes are observable | Yes | Know if decision was correct |
| Ground truth eventually available | Yes | Even if delayed |
| Threshold affects rate monotonically | Yes | Higher \\(\theta\\): lower FP, higher FN |
| Sufficient samples for estimation | ~ | 50+ outcomes for stable estimates |

**Performance Trade-offs**: Responsiveness, stability, and noise sensitivity all move together as \\(\eta\\) changes — faster adaptation is more responsive but less stable and more susceptible to noisy outcome estimates.

| Adaptation Speed (\\(\eta\\)) | Responsiveness | Stability | Noise Sensitivity |
| :--- | :--- | :--- | :--- |
| Fast (\\(\eta > 0.1\\)) | High | Low | High |
| Medium (\\(0.01 < \eta < 0.1\\)) | Medium | Medium | Medium |
| Slow (\\(\eta < 0.01\\)) | Low | High | Low |

**Stability constraint**: The learning rate \\(\eta\\) must be small enough that one correction step cannot overshoot the target and reverse the sign of the error; the upper bound is inversely proportional to the maximum slope of the false positive rate with respect to the threshold.

{% katex(block=true) %}
\eta < \frac{2}{\max_\theta |d\text{FPR}/d\theta|}
{% end %}

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} Implementation**: Anomaly detection threshold. Initial \\(\theta = 2.5\sigma\\). Target FP rate 2%. After 500 observations, threshold stabilized at \\(\theta = 2.7\sigma\\) with actual FP rate 1.8%.

**Anti-pattern**: Adapting too quickly based on small samples - threshold oscillates wildly.

---

### Validation Patterns

#### Pattern V1: Phase-Gate Validation Functions

**Intent**: Ensure system capabilities are validated in correct sequence, preventing deployment of sophisticated features on unstable foundations.

**Problem**: Complex systems have dependencies between capabilities. Building capability B before validating capability A wastes effort when A fails. Edge systems have high cost of late-stage failure discovery.

**Solution**: Define validation predicates for each capability phase. System cannot advance to phase N+1 until phase N predicates pass. Regression testing ensures earlier phases remain valid.

**Structure**:

Gate \\(G_i\\) is the conjunction of all per-predicate indicator functions: it evaluates to 1 (pass) only when every validation function \\(V_p\\) in phase \\(i\\) meets its required threshold \\(\theta_p\\).

{% katex(block=true) %}
G_i(S) = \bigwedge_{p \in P_i} \mathbb{1}[V_p(S) \geq \theta_p]
{% end %}

Gate \\(G_i\\) passes iff all predicates \\(p\\) in phase \\(i\\) meet their thresholds.

**Phase gate specification template**: Each row is one predicate that must pass before the system may advance from that phase; the Threshold column gives the minimum acceptable value and Regression Frequency indicates how often previously-passed predicates are re-verified.

| Phase | Predicates | Threshold | Validation Method | Regression Frequency |
| :--- | :--- | :--- | :--- | :--- |
| P0: Foundation | Hardware attestation | Pass/Fail | Cryptographic | Every boot |
| P0: Foundation | Survival duration | 24 hours | Isolation test | Monthly |
| P1: Local Autonomy | Detection accuracy | 80% | Labeled test set | Weekly |
| P1: Local Autonomy | Healing success rate | 70% | Fault injection | Weekly |
| P2: Coordination | Gossip convergence | 30 seconds | Partition test | Weekly |
| P3: Fleet Coherence | State reconciliation | 95% consistency | Multi-partition test | Bi-weekly |
| P4: Optimization | Learning improvement | Positive \\(\Delta\\) | A/B test | Monthly |

*Threshold note*: The 70% healing success rate represents the empirically observed lower bound for acceptable healing reliability. Adjust this threshold based on your system's mission-criticality requirements - safety-critical systems should target 90%+, while lower-stakes systems may accept 60-70%.

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| Capabilities have dependencies | Yes | DAG structure exists |
| Predicates are testable | Yes | Automated verification possible |
| Thresholds are meaningful | Yes | Derived from requirements |
| Regression is feasible | ~ | Some tests are expensive |

**Performance Trade-offs**: Stricter thresholds reduce escaped defects at the cost of higher false rejection rates and slower development; lenient thresholds ship faster but allow more defects through.

| Gate Strictness | False Rejection Rate | Escaped Defects | Development Speed |
| :--- | :--- | :--- | :--- |
| Strict (\\(\theta\\) high) | High | Very Low | Slow |
| Moderate | Medium | Low | Medium |
| Lenient (\\(\theta\\) low) | Low | Medium | Fast |

**Regression invariant**: Advancing to phase \\(i+1\\) requires that every gate from phase 0 through phase \\(i\\) continues to pass, ensuring a new capability cannot be built on a foundation that has silently regressed.

{% katex(block=true) %}
\text{enter}(i+1) \Rightarrow \bigwedge_{j=0}^{i} G_j(S) = 1
{% end %}

**{% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %} Implementation**: 5 phases, 18 total predicates. Regression suite runs in 4 hours. Gate failures in first 3 months: 7 (all caught before deployment). Post-deployment gate failures: 0.

**Anti-pattern**: Skipping gates under schedule pressure - technical debt compounds, failures occur in production.

---

#### Pattern V2: Chaos Engineering Verification

**Intent**: Proactively discover weaknesses by injecting failures in controlled conditions, converting potential surprises into planned learning.

**Problem**: Testing only happy paths leaves failure modes undiscovered. Production failures are costly and uncontrolled. Edge environments have limited visibility into failures.

**Solution**: Systematically inject failures (process crashes, network partitions, resource exhaustion) during normal operation. Verify system responds correctly. Document and fix discovered weaknesses.

**Structure**:

The feedback loop below shows the experiment protocol: hypothesize, inject, observe, and either document resilience (when confirmed) or fix and retest (when the hypothesis fails), cycling continuously.

{% mermaid() %}
graph TD
    H["Hypothesis<br/>'System survives X'"]
    I["Inject Failure X"]
    O["Observe Behavior"]
    V{"Hypothesis<br/>Confirmed?"}
    D["Document<br/>Resilience"]
    F["Fix Weakness"]
    R["Retest"]

    H --> I --> O --> V
    V -->|"Yes"| D
    V -->|"No"| F --> R --> V

    style H fill:#e3f2fd,stroke:#1976d2
    style F fill:#ffcdd2,stroke:#c62828
    style D fill:#c8e6c9,stroke:#388e3c
{% end %}

**Failure injection catalog**: The table below enumerates nine standard injection types organized by failure category, with Blast Radius indicating the maximum scope of disruption that each injection can cause.

| Category | Injection | Severity | Frequency | Blast Radius |
| :--- | :--- | :--- | :--- | :--- |
| Process | Kill random process | Low | Daily | Single node |
| Process | Memory exhaustion | Medium | Weekly | Single node |
| Network | Latency injection (100ms) | Low | Daily | Link |
| Network | Partition (30s) | Medium | Weekly | Cluster |
| Network | Partition (5min) | High | Monthly | Fleet |
| Resource | CPU saturation | Medium | Weekly | Single node |
| Resource | Disk full | Medium | Weekly | Single node |
| Clock | Time skew (\\(\pm 30\\)s) | Medium | Weekly | Single node |
| Dependency | Downstream timeout | Medium | Daily | Service |

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| System can tolerate some failures | Yes | Don't chaos-test fragile systems |
| Failure injection is controllable | Yes | Must be able to stop injection |
| Monitoring captures behavior | Yes | Need visibility into response |
| Rollback is possible | Yes | Escape hatch for bad outcomes |

**Performance Trade-offs**: More frequent injection achieves higher coverage but increases operational overhead; daily injection provides high coverage at manageable risk and is the typical production baseline.

| Injection Frequency | Coverage | Risk | Operational Overhead |
| :--- | :--- | :--- | :--- |
| Continuous | Highest | Medium | High |
| Daily | High | Low | Medium |
| Weekly | Medium | Very Low | Low |
| Monthly | Low | Minimal | Minimal |

**Graduated chaos levels**: Each level must demonstrate resilience before unlocking the next, ensuring the system can handle simpler failures before being subjected to compound scenarios.

| Level | Target | Prerequisites | Example |
| :--- | :--- | :--- | :--- |
| 1 | Single process | Basic monitoring | Kill one pod |
| 2 | Single node | Level 1 stable | Node failure |
| 3 | Network link | Level 2 stable | Partition two nodes |
| 4 | Cluster | Level 3 stable | Availability zone failure |
| 5 | Fleet | Level 4 stable | Multi-region chaos |

**{% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} Implementation**: 500+ experiments over 24 months. 147 hidden dependencies discovered. MTTR reduced from 47 to 8 minutes. Each discovered weakness becomes a regression test.

**Anti-pattern**: Chaos without monitoring - failures occur but go undetected, learning is lost.

---

#### Pattern V3: Regression Invariants

**Intent**: Ensure that changes (code updates, configuration changes, learned adaptations) do not violate previously validated properties.

**Problem**: System evolution can introduce regressions. {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} adaptations may inadvertently break existing functionality. Manual regression testing is incomplete and slow.

**Solution**: Define invariants that must hold across all system states. Automatically verify invariants after any change. Block changes that violate invariants until explicitly approved.

**Structure**:

A change is valid only if every invariant \\(I\\) in the invariant set \\(\mathcal{I}\\) evaluates to true in the post-change state {% katex() %}S_{\text{after}}{% end %}; any invariant failure blocks the change.

{% katex(block=true) %}
\text{Change}(c) \text{ valid} \Leftrightarrow \forall I \in \mathcal{I}: I(S_{\text{after}}) = \text{true}
{% end %}

**Invariant categories**: Invariants fall into five classes based on the property they protect; each class requires a different verification method because the property is either checkable statically, requires runtime monitoring, or can only be confirmed under controlled fault injection.

| Category | Example Invariants | Verification Method |
| :--- | :--- | :--- |
| Safety | "No action exceeds power budget" | Static analysis + runtime check |
| Liveness | "Heartbeat within 30s" | Continuous monitoring |
| Consistency | "Replicas converge within 60s" | Partition-heal test |
| Performance | "P99 latency < 500ms" | Load test |
| Security | "All messages authenticated" | Audit log analysis |

**Invariant specification template**:

An invariant is expressed as a universal implication over all system states: whenever precondition \\(P\\) holds, postcondition \\(Q\\) must also hold.

{% katex(block=true) %}
I_{\text{name}}: \forall s \in S: P(s) \Rightarrow Q(s)
{% end %}

"For all states \\(s\\) where precondition \\(P\\) holds, postcondition \\(Q\\) must hold."

**Applicability Conditions**: The Required column uses "Yes" for hard prerequisites and "~" for conditions that improve performance but are not strictly necessary.

| Condition | Required | Notes |
| :--- | :---: | :--- |
| Invariants are expressible | Yes | Can formalize requirements |
| Verification is automatable | Yes | Manual verification doesn't scale |
| False positives are rare | ~ | Too many FPs cause alert fatigue |
| Coverage is sufficient | ~ | Untested invariants may regress |

**Performance Trade-offs**: Earlier verification catches more violations but blocks the development pipeline; continuous post-deploy verification never blocks but accepts that regressions may briefly reach production.

| Verification Timing | Latency | Coverage | Cost |
| :--- | :--- | :--- | :--- |
| Pre-commit | Lowest | Highest | Blocks development |
| Pre-deploy | Low | High | Blocks deployment |
| Post-deploy | Medium | Medium | May ship regressions |
| Continuous | Highest | Continuous | Ongoing compute cost |

**Invariant violation response**: When a violation is detected, the response — blocking, warning, or logging — scales with the severity of the invariant class; critical safety violations are always blocking and require no human approval to act.

| Severity | Response | Automation |
| :--- | :--- | :--- |
| Critical (safety) | Block change, alert immediately | Fully automated |
| High (functionality) | Block change, notify developer | Fully automated |
| Medium (performance) | Warn, allow with approval | Semi-automated |
| Low (style) | Log for review | Fully automated |

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} Implementation**: 34 invariants across safety (8), liveness (6), consistency (12), performance (5), security (3). CI/CD pipeline verifies all invariants. 12 regressions caught in 6 months, 0 shipped to production.

**Anti-pattern**: Invariants without teeth - violations logged but not enforced, regressions accumulate.

---

### Pattern Selection Guide

**Decision tree for pattern selection**:

Start at the root and follow the branch that matches your requirement; the terminal leaf identifies the recommended pattern.

{% mermaid() %}
graph TD
    Q1{"Learning from<br/>stress events?"}
    Q2{"Discrete or<br/>continuous<br/>actions?"}
    Q3{"Parameters or<br/>predictions?"}
    Q4{"Adapting<br/>behavior?"}
    Q5{"Resources or<br/>capabilities?"}
    Q6{"Thresholds?"}
    Q7{"Validating<br/>changes?"}
    Q8{"Sequence<br/>dependencies?"}
    Q9{"Proactive or<br/>reactive?"}

    L1["L1: Multi-Armed<br/>Bandit"]
    L2["L2: Bayesian<br/>Update"]
    L3["L3: Partition<br/>Prediction"]
    A1["A1: Dynamic<br/>Resource Weighting"]
    A2["A2: Graceful<br/>Degradation Ladder"]
    A3["A3: Adaptive<br/>Threshold"]
    V1["V1: Phase-Gate<br/>Validation"]
    V2["V2: Chaos<br/>Engineering"]
    V3["V3: Regression<br/>Invariants"]

    Q1 -->|"Yes"| Q2
    Q1 -->|"No"| Q4
    Q2 -->|"Discrete"| L1
    Q2 -->|"Continuous"| Q3
    Q3 -->|"Parameters"| L2
    Q3 -->|"Predictions"| L3
    Q4 -->|"Yes"| Q5
    Q4 -->|"No"| Q7
    Q5 -->|"Resources"| A1
    Q5 -->|"Capabilities"| A2
    Q5 -->|"Neither"| Q6
    Q6 -->|"Yes"| A3
    Q7 -->|"Yes"| Q8
    Q8 -->|"Yes"| V1
    Q8 -->|"No"| Q9
    Q9 -->|"Proactive"| V2
    Q9 -->|"Reactive"| V3

    style L1 fill:#e3f2fd,stroke:#1976d2
    style L2 fill:#e3f2fd,stroke:#1976d2
    style L3 fill:#e3f2fd,stroke:#1976d2
    style A1 fill:#fff3e0,stroke:#f57c00
    style A2 fill:#fff3e0,stroke:#f57c00
    style A3 fill:#fff3e0,stroke:#f57c00
    style V1 fill:#e8f5e9,stroke:#388e3c
    style V2 fill:#e8f5e9,stroke:#388e3c
    style V3 fill:#e8f5e9,stroke:#388e3c
{% end %}

### Pattern Combination Matrix

Most systems use multiple patterns together. Common combinations:

<style>
#tbl_pattern_combos + table th:first-of-type { width: 30%; }
#tbl_pattern_combos + table th:nth-of-type(2) { width: 35%; }
#tbl_pattern_combos + table th:nth-of-type(3) { width: 35%; }
</style>
<div id="tbl_pattern_combos"></div>

| Combination | Synergy | Example |
| :--- | :--- | :--- |
| L1 + A3 | Bandit learns threshold adjustment policy | Healing action selection with adaptive confidence |
| L2 + L3 | Bayesian updates improve prediction | Connectivity model informs partition prediction |
| A1 + A2 | Resources shift as degradation level changes | Budget reallocation at each ladder rung |
| V1 + V3 | Phase gates become regression invariants | Gate predicates verified continuously |
| V2 + L1 | Chaos discovers actions, bandit learns | Failure injection feeds learning loop |
| All Learning + V2 | Chaos accelerates learning | Induced stress provides training data |

**{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} pattern stack**: L1 (healing selection) + L2 (connectivity model) + L3 (partition prediction) + A2 (5-level degradation) + A3 (anomaly thresholds) + V1 (5-phase gates) + V3 (34 invariants).

**Minimum viable pattern set** for {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} edge system:
1. **L1 or L2**: At least one learning mechanism
2. **A2**: Graceful degradation is essential
3. **V3**: Regression invariants prevent backsliding

Without these three, the system may survive stress but will not improve from it.

> **Cognitive Map**: The design pattern catalog translates theory into selection criteria. Patterns are organized by mechanism class — learning (L), adaptive (A), and verification (V) — with explicit applicability conditions and failure modes for each. Pattern composition tables show which combinations synergize (L1 + A1 = healing action selection improves under stress) and which are prerequisites (V3 is the minimum viable verification pattern for any learning system). The RAVEN stack (L1, L2, L3, A2, A3, V1, V3) is the reference multi-pattern implementation for contested autonomic systems.

---

## The Limits of Automation

> **Problem**: Anti-fragile learning depends on autonomous feedback loops. But autonomous healing can amplify problems rather than solving them — restarting a service during a deliberate stress test, locking an executive's account during a crisis, exhausting healing budget on adversarially-induced false alarms. The learning machinery itself can become a failure mode.
> **Solution**: Monitor automation quality with circuit breakers and override tracking. The Judgment Horizon (Definition 16) provides a formal rule for when human authority is required — any decision crossing thresholds on irreversibility, precedent impact, uncertainty, or ethical weight gets escalated regardless of automation capability. The adaptive threshold ({% katex() %}\tau_{\text{override}}{% end %}) self-calibrates from override history.
> **Trade-off**: Lowering the escalation threshold reduces autonomous action risk but increases human burden. The Brier-score proper scoring rule makes honest confidence reporting the dominant strategy, preventing strategic under-escalation near the boundary. The SPRT gives the statistically optimal stopping rule for when enough evidence has accumulated to act versus wait.

### When Autonomous Healing Makes Things Worse

Automation is not unconditionally beneficial. Autonomous healing can fail in ways that amplify problems rather than solving them.

**Failure Mode 1: Correct action, wrong context**
A healing mechanism detects anomaly and restarts a service. But the "anomaly" was a deliberate stress test by operators. The restart interrupts the test, requiring it to be rerun. The automation was correct according to its model - but the model didn't account for deliberate testing.

**Failure Mode 2: Correct detection, wrong response**
An intrusion detection system identifies unusual access patterns. The autonomous response is to lock the account. But the unusual pattern was an executive accessing systems during a crisis. The lockout escalated the crisis. The detection was correct - the response was wrong for the context.

**Failure Mode 3: Feedback loops**
A healing action triggers monitoring alerts. The alerts trigger additional healing actions. Those actions trigger more alerts. The system oscillates, consuming resources in an infinite healing loop. The automation's response to symptoms created more symptoms.

**Failure Mode 4: Adversarial gaming**
An adversary learns the automation's response patterns. They trigger false alarms to exhaust the healing budget. When the real attack comes, the system's healing capacity is depleted. The automation's predictability became a vulnerability.

Detection mechanisms:
- Monitor for "things getting worse despite healing"
- Track healing action frequency and intervene if abnormally high
- Implement healing circuit breakers (stop healing if repeated actions fail)
- Alert operators when automation confidence drops below threshold

Response to detected automation failure:
1. Reduce automation level (require higher confidence for autonomous action)
2. Increase human visibility (surface more decisions for review)
3. Log failure mode for post-hoc analysis
4. Update automation policy to prevent recurrence

The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} principle: **automation failures improve automation**. Each failure mode discovered becomes a guard against that failure mode. The system learns what it cannot automate safely.

### The Judgment Horizon

Some decisions should never be automated, regardless of {% term(url="@/blog/2026-01-15/index.md#def-1", def="Continuous value in [0,1] representing the current fraction of nominal bandwidth available; 0 = fully denied, 1 = full connectivity; regime classification discretizes this into four operating modes") %}connectivity state{% end %}.

<span id="def-16"></span>
**Definition 16** (Judgment Horizon). *The {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} \\(\mathcal{J}\\) is the decision boundary defined by threshold conditions on irreversibility \\(I\\), precedent impact \\(P\\), model uncertainty \\(U\\), and ethical weight \\(E\\):*

{% katex(block=true) %}
d \in \mathcal{J} \Leftrightarrow I(d) > \theta_I \lor P(d) > \theta_P \lor U(d) > \theta_U \lor E(d) > \theta_E
{% end %}

*Decisions crossing any threshold require human authority, regardless of automation capability.*

### Game-Theoretic Extension: Incentive-Compatible Escalation

Definition 16's {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} \\(\mathcal{J}\\) uses fixed threshold conditions. If the autonomous system's utility places any weight on mission completion over human oversight, it will strategically under-escalate for borderline decisions.

**Cheap-talk model** (Crawford-Sobel): The system (sender) has private information \\(t\\) (true decision severity) and sends escalation signal {% katex() %}m \in \{\text{escalate}, \text{auto}\}{% end %} to the human operator (receiver). When system utility from autonomous action exceeds utility from human review for borderline decisions, the equilibrium has the system choosing {% katex() %}m = \text{auto}{% end %} near the \\(\mathcal{J}\\) boundary - strategic under-escalation.

**Preference-revealing mechanism**: A decision \\(d\\) is routed to the adaptive {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} {% katex() %}\mathcal{J}_{\text{adaptive}}{% end %} when the product of its uncertainty score and consequence magnitude exceeds a threshold {% katex() %}\tau_{\text{override}}{% end %} that is continuously recalibrated from the historical rate at which autonomous decisions are subsequently overridden.

{% katex(block=true) %}
d \in \mathcal{J}_{\text{adaptive}} \iff \text{Uncertainty}(d) \cdot \text{Magnitude}(d) > \tau_{\text{override}}
{% end %}

where {% katex() %}\tau_{\text{override}}{% end %} is continuously updated to match the empirical rate at which autonomous decisions are subsequently overridden. Systems that are overridden frequently have {% katex() %}\tau_{\text{override}}{% end %} lowered - they escalate more decisions until divergence drops.

**Proper scoring rule**: The Brier score measures how close the system's stated confidence {% katex() %}p_{\text{auto}}{% end %} is to the ground-truth indicator of whether a human operator would have agreed, penalising overconfident autonomous decisions quadratically.

{% katex(block=true) %}
\text{BS} = \bigl(p_{\text{auto}} - \mathbb{1}[\text{human would agree}]\bigr)^2
{% end %}

Decisions not escalated that the human would have changed differently incur high Brier cost; correct autonomous decisions incur low cost. Under the Brier score, honest uncertainty reporting is a dominant strategy - the system cannot benefit from misrepresenting its confidence.

**Practical implication**: Implement a running divergence metric between autonomous decisions and estimated human preferences. When divergence exceeds a threshold, automatically lower {% katex() %}\tau_{\text{override}}{% end %} for that decision class. This is a self-calibrating escalation mechanism requiring no manual threshold tuning.

### Statistical Extension: Sequential Probability Ratio Test

The Crawford-Sobel escalation mechanism (above) addresses *who* should decide. The Sequential Probability Ratio Test (SPRT) addresses *when* enough evidence has accumulated to decide - the optimal stopping problem dual to the {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %}.

**Wald's SPRT**: Given observations \\(x_1, x_2, \ldots\\) drawn from either \\(H_0\\) (normal operation) or \\(H_1\\) (escalation warranted), maintain the cumulative log-likelihood ratio:

{% katex(block=true) %}
\Lambda_t = \sum_{i=1}^{t} \ln \frac{p(x_i \mid H_1)}{p(x_i \mid H_0)}
{% end %}

Stop and escalate when {% katex() %}\Lambda_t \geq B = \ln\frac{1-\beta}{\alpha}{% end %}; stop and continue autonomous operation when {% katex() %}\Lambda_t \leq A = \ln\frac{\beta}{1-\alpha}{% end %}; otherwise collect another observation. Here \\(\alpha\\) is the false-escalation rate and \\(\beta\\) is the missed-escalation rate.

**Optimality**: Wald and Wolfowitz (1948) proved SPRT minimizes expected sample size among all sequential tests with the same error rates \\((\alpha, \beta)\\). For the {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %}, this means SPRT reaches an escalation decision with the fewest possible observations - critical under the connectivity and power constraints of {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} and {% term(url="@/blog/2026-01-15/index.md#scenario-convoy", def="12-vehicle autonomous ground convoy in contested mountainous terrain; active electronic warfare requires autonomous operation at every command level") %}CONVOY{% end %}.

**Connection to Definition 16**: The four {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} thresholds {% katex() %}\theta_I, \theta_P, \theta_U, \theta_E{% end %} (irreversibility, precedent, uncertainty, ethical weight) each define a separate SPRT boundary. The composite {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} is reached when any single ratio crosses its threshold - an OR-combination of four parallel SPRT tests, each specialized to a decision dimension. This is more principled than fixed thresholds: the boundaries \\(A\\) and \\(B\\) are derived directly from the acceptable false-escalation and missed-escalation rates, rather than being hand-tuned.

**Practical implication**: Calibrate \\(\alpha\\) (false escalation rate) and \\(\beta\\) (missed escalation rate) from operational cost data. SPRT then automatically determines how many observations are needed before crossing the threshold - eliminating the arbitrary "wait N seconds" heuristics common in current autonomic systems.

**Judgment Horizon: Formal Decision Problem**

The {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} defines a classification decision: for each decision \\(d\\), determine whether it requires human authority (\\(h = 1\\)) or can be automated (\\(h = 0\\)).

**Objective Function**:

The optimal escalation policy \\(h^\*(d)\\) minimizes expected cost, trading off {% katex() %}C_{\text{FN}}{% end %} (cost of wrongly automating a judgment-requiring decision) against {% katex() %}C_{\text{FP}}{% end %} (delay cost of wrongly escalating an automatable decision).

{% katex(block=true) %}
h^*(d) = \arg\min_{h \in \{0,1\}} \mathbb{E}\left[ C_{\text{FN}} \cdot \mathbf{1}_{h=0, d \in \mathcal{J}} + C_{\text{FP}} \cdot \mathbf{1}_{h=1, d \notin \mathcal{J}} \right]
{% end %}

where {% katex() %}C_{\text{FN}}{% end %} is the cost of automating a judgment-requiring decision (false negative), and {% katex() %}C_{\text{FP}}{% end %} is the delay cost of requiring human approval for an automatable decision (false positive).

**Constraint Set**: Three hard constraints govern the {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} classifier — it must never automate a decision that belongs in \\(\mathcal{J}\\) (zero false negative rate), it must classify each decision in constant time to support real-time operation, and it must assign the same decision to the same class on every evaluation.

{% katex(block=true) %}
\begin{aligned}
&g_1: P(\text{automate} | d \in \mathcal{J}) = 0 && \text{(zero false negative rate)} \\
&g_2: I(d), P(d), U(d), E(d) \text{ computable in } O(1) && \text{(real-time classification)} \\
&g_3: h(d) \text{ deterministic for fixed } d && \text{(consistency requirement)}
\end{aligned}
{% end %}

**State Transition Model**:

Each threshold \\(\theta_i\\) is updated by taking a gradient step that reduces the loss \\(\mathcal{L}\\), which penalizes false negatives infinitely (per constraint \\(g_1\\)) and false positives in proportion to {% katex() %}C_{\text{FP}}{% end %}, so the boundary moves conservatively toward fewer missed escalations.

{% katex(block=true) %}
\theta_{i,t+1} = \theta_{i,t} - \eta \cdot \nabla_{\theta_i} \mathcal{L}(h, d, \text{outcome})
{% end %}

where \\(\mathcal{L}\\) penalizes false negatives infinitely (constraint \\(g_1\\)) and false positives according to {% katex() %}C_{\text{FP}}{% end %}.

**Decision Rule**:

Because {% katex() %}C_{\text{FN}} \gg C_{\text{FP}}{% end %}, the optimal policy \\(h^\*(d)\\) escalates any decision that crosses even one threshold — the disjunction over the four scores ensures that a single high-irreversibility or high-uncertainty signal is sufficient to require human authority.

{% katex(block=true) %}
h^*(d) = \mathbf{1}\left[ I(d) > \theta_I \lor P(d) > \theta_P \lor U(d) > \theta_U \lor E(d) > \theta_E \right]
{% end %}

The disjunction ensures that exceeding *any* threshold triggers human authority, enforcing the zero false negative constraint.

The **Judgment Horizon** is the boundary separating automatable decisions from human-reserved decisions. This boundary is not arbitrary - it reflects fundamental properties of decision consequences.

Decisions beyond the {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %}:
- **First activation of irreversible systems in new context**: Novel situations require human judgment on operational boundaries
- **Mission abort that leaves partner systems stranded**: Strategic and ethical implications require human authority
- **Actions with irreversible strategic consequences**: Crossing red lines, creating international incidents
- **Decisions under unprecedented uncertainty**: When models have no applicable data
- **Equity and justice determinations**: Decisions affecting human rights or resource allocation

These decisions share common characteristics: each triggers the "human required" condition when at least one of four scored properties — irreversibility, precedent impact, model uncertainty, or ethical weight — exceeds its respective threshold \\(\theta\\).

{% katex(block=true) %}
\text{Human Required} \Leftarrow \begin{cases}
\text{Irreversibility} > \theta_{\text{irrev}} & \text{cannot undo} \\
\text{Precedent impact} > \theta_{\text{prec}} & \text{sets future policy} \\
\text{Model uncertainty} > \theta_{\text{unc}} & \text{outside training distribution} \\
\text{Ethical weight} > \theta_{\text{eth}} & \text{affects human welfare}
\end{cases}
{% end %}

The {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} is **not a failure of automation** - it is a design choice recognizing that some decisions require human accountability. Automating these decisions does not make them faster; it makes them wrong in ways that matter.

**Hard-coded constraints**: Some rules cannot be learned or adjusted:
- "Never execute irreversible actions without explicit authorization"
- "Never abandon stranded assets or operators without command approval"
- "Never proceed when self-test indicates critical malfunction"

These rules are coded as invariants, not learned parameters. No amount of operational experience should modify them.

**Designing the boundary**: The {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} should be explicit in system architecture:
1. Classify each decision type: automatable vs. human-required
2. For human-required decisions during partition: cache the decision need, request approval when connectivity restores
3. For truly time-critical human decisions: pre-authorize ranges of action, delegate within bounds
4. Document the boundary and rationale in architecture specification

The {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} separates what automation *can* do from what automation *should* do.

### Override Mechanisms and Human-in-the-Loop

Even below the {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %}, human operators should be able to override autonomous decisions. Override mechanisms create a feedback loop that improves automation.

**Override workflow**:
1. System makes autonomous decision
2. System surfaces decision to operator (if connectivity allows)
3. Operator reviews decision with system-provided context
4. Operator accepts or overrides
5. Override (or acceptance) is logged for learning

**Priority ordering for operator attention**: Operators cannot review all decisions. Surface the most consequential decisions first:
- Decisions closest to {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %}
- Decisions with lowest automation confidence
- Decisions with highest consequence magnitude
- Decisions in novel contexts

**Context provision**: Show operators what the system knows:
- Relevant sensor data and confidence levels
- Options considered and rationale for selection
- Similar past decisions and outcomes
- Model uncertainty estimate

**Learning from overrides**: Each override {% katex() %}\text{Override}_i{% end %} is classified into one of four root causes, and each root cause routes to a distinct corrective action — so every override improves the system whether the original decision was right or wrong.

{% katex(block=true) %}
\text{Override}_i = \begin{cases}
\text{System error} & \rightarrow \text{update decision model} \\
\text{Context system missed} & \rightarrow \text{add context features} \\
\text{Operator error} & \rightarrow \text{improve context display} \\
\text{Policy change} & \rightarrow \text{update policy parameters}
\end{cases}
{% end %}

Post-hoc analysis classifies overrides and routes them to appropriate improvement mechanisms.

**Delayed override**: During partition, operators cannot override in real-time. The system:
1. Makes autonomous decision
2. Logs decision with full context
3. Executes decision
4. Upon reconnection, surfaces decision for retrospective review
5. Operator reviews and marks: "would have approved" or "would have overridden"
6. "Would have overridden" cases update the decision model

{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragile{% end %} insight: **overrides improve automation calibration**. A system with 1000 logged overrides has a more accurate decision model than a system with none. The human-in-the-loop is not a bottleneck - it is a teacher.

> **Cognitive Map**: The limits-of-automation section grounds the anti-fragile framework in the four failure modes where autonomous healing makes things worse. The Judgment Horizon formalizes the non-automatable decision class using four threshold conditions. The incentive-compatible escalation mechanism (adaptive {% katex() %}\tau_{\text{override}}{% end %} + Brier scoring) closes the feedback loop: every override is training data that recalibrates the escalation threshold. The SPRT provides the statistically optimal stopping rule within the judgment horizon framework — wait for evidence, then escalate decisively.

---

## The Anti-Fragile RAVEN

> **Problem**: The anti-fragile framework is abstract until applied to a concrete system through a full improvement cycle. What does day-by-day parameter evolution actually look like, and how do the mechanisms interact over time?
> **Solution**: Trace RAVEN from deployment through four weeks of operations: design-time parameters at Day 1, operational learning after stress events, measurable improvement in formation efficiency, detection accuracy, and connectivity threshold calibration by Day 30.
> **Trade-off**: The improvement cycle requires a sufficient number of stress events to produce meaningful parameter updates — a system that sees no stress events produces no improvement. Anti-fragility is only observable over a horizon that includes multiple stress events. Short-duration missions may not have enough events for the UCB/EXP3 learners to converge.

Let us trace the complete {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} improvement cycle for {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} over four weeks of operations.

**Day 1: Deployment**
{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} deploys with design-time parameters:
- Formation spacing: 200m
- {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}Gossip{% end %} interval: 5s
- Connectivity model: Simulation-based Markov estimates
- Anomaly detection: Lab-calibrated baselines
- Capability thresholds: Conservative L2 at \\(C \geq 0.3\\)

**Week 1: First Partition Events**
Two partition events occur (47min and 23min duration). Lessons learned:
- Formation spacing too loose for terrain: Mesh reliability dropped below threshold at 200m
- {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}Gossip{% end %} interval inefficient: 5s was too slow under jamming, too fast in clear

Parameter adjustments:
- Formation spacing: changed from fixed 200m to adaptive 180-220m based on signal quality
- {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}Gossip{% end %} interval: changed from fixed 5s to adaptive 3-8s based on packet loss rate

Connectivity model update:
- Transition {% katex() %}\lambda_{C \rightarrow D}{% end %}: updated from 0.02 to 0.035 (more frequent degradation than expected)

**Week 2: Adversarial Jamming**
Two coordinated jamming episodes. Lessons learned:
- Anomaly detection missed jamming signatures (only trained on natural failures)
- Connectivity model had no "jamming" state distinct from natural degradation

Model updates:
- Anomaly detection: Added jamming-specific features (SNR drop pattern, multi-drone correlation, frequency sweep signature)
- Connectivity model: Added explicit "jamming" state with distinct transition rates

New detection capability:
- Jamming vs. natural degradation classification: 89% accuracy after training on 2 episodes

**Week 3: Drone Loss**
Three drones lost (2 mechanical failure, 1 adversarial action). Lessons learned:
- Healing priority was wrong: Prioritized surveillance restoration over mesh connectivity
- Mesh connectivity should restore first - surveillance depends on mesh

Healing policy update:
- Recovery ordering: Mesh connectivity > surveillance > other functions
- Minimum viable formation: 12 drones sufficient for L1 capability (discovered through stress)

Capability update:
- L1 threshold: Now achievable with 12-drone formation (previously assumed 18)

**Week 4: Complex Partition**
Multi-cluster partition with asymmetric information. Lessons learned:
- State reconciliation priority unclear: Threat data vs. survey data conflict
- Decision authority ambiguous: Multiple nodes claimed cluster-lead authority

Coherence updates:
- Reconciliation priority: Threat data > position data > survey data > metadata
- Authority protocol: Explicit cluster-lead designation using GPS-denied-safe tie-breaker

Decision model update:
- Authority delegation rules refined based on reconciliation conflicts

**Day 30: Assessment**
The table below compares five key metrics between the deployment-day baseline and the 30-day mark, with every metric improving solely through operational learning — no external software updates were pushed.

<style>
#tbl_evolution + table th:first-of-type { width: 30%; }
#tbl_evolution + table th:nth-of-type(2) { width: 25%; }
#tbl_evolution + table th:nth-of-type(3) { width: 25%; }
#tbl_evolution + table th:nth-of-type(4) { width: 20%; }
</style>
<div id="tbl_evolution"></div>

| Metric | Day 1 | Day 30 | Improvement |
| :--- | :--- | :--- | :--- |
| Threat detection latency | 800ms | 340ms | 57% faster |
| Partition recovery time | 340s | 67s | 80% faster |
| Jamming detection accuracy | 0% | 89% | New capability |
| L2 connectivity threshold | 0.30 | 0.25 | 17% more capable |
| False positive rate | 12% | 3% | 75% reduction |

{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} at day 30 outperforms {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} at day 1 on every metric - not because of software updates pushed from command, but because the architecture extracted learning from operational stress.

This is {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} in practice.

> **Cognitive Map**: The anti-fragile RAVEN case trace shows anti-fragility as a quantified time series: formation efficiency improves from 67% to 89%, anomaly false-positive rate drops from 18% to 6%, connectivity threshold recalibrates from 0.3 to 0.25. Each improvement follows a stress event that provided learning signal. The four-week arc demonstrates the ESS argument: a fleet that copies successful policies will converge to anti-fragile parameter sets, because anti-fragile nodes accumulate operational improvements while fragile nodes repeatedly start from design-time estimates.

---

## Engineering Judgment: Where Models End

> **Problem**: Every model has a validity envelope. UCB assumes stochastic rewards; EXP3 assumes oblivious adversaries; Lyapunov stability assumes the dynamics model is correct. When these assumptions fail, the formal guarantees evaporate — but the system keeps running, producing outputs that appear correct until they are not.
> **Solution**: Enumerate the model boundaries explicitly as a catalog. For each abstraction, identify: the assumption that must hold, the observable signal when it fails, and the mitigation. Engineering judgment is not a fallback when models fail — it is the recognition that model boundaries are design artifacts requiring the same rigor as the models themselves.
> **Trade-off**: Cataloging boundaries does not eliminate them. Some failure modes have no algorithmic mitigation — they require human judgment (see Judgment Horizon, Definition 16). The catalog's value is not solving the problem but making the problem visible before it becomes an incident.

Every model has boundaries. Every abstraction leaks. Every automation encounters situations it was not designed to handle. The recurring theme throughout this series is the **limit of technical abstractions**.

### The Model Boundary Catalog

**Connectivity Markov models fail under adversarial adaptation.**
The connectivity Markov model assumes transition probabilities are stationary. An adversary who observes the system's behavior can change their tactics to invalidate the model. Yesterday's transition rates don't predict tomorrow's adversary.

**Anomaly detection fails with novel failure modes.** Anomaly detectors learn the distribution of normal behavior. A failure mode never seen before - outside the training distribution - may not be detected as anomalous. The detector knows what it has seen, not what is possible.

**Healing models fail when healing logic is corrupted.** Self-healing assumes the healing mechanisms themselves are correct. A bug in the healing logic, or corruption of the healing policy, creates a failure mode the healing cannot address - it is the failure.

**Coherence models fail with irreconcilable conflicts.** {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %}s and reconciliation protocols assume eventual consistency is achievable. Some conflicts - contradictory physical actions, mutually exclusive resource claims - cannot be merged. The model assumes a solution exists when it may not.

**Learning models fail with insufficient data.** Bandit algorithms and Bayesian updates assume enough samples to converge. In edge environments with rare events and short deployments, convergence may not occur before the mission ends.

### The Engineer's Role

Given that all models fail, what is the engineer's responsibility?

**1. Know the model's assumptions**
Document explicitly: What must be true for this model to work? What inputs are in-distribution? What adversary behaviors are anticipated?

**2. Monitor for assumption violations**
Instrument the system to detect when assumptions fail. When GPS availability drops to zero, the navigation model's assumption is violated - detect this and respond.

**3. Design fallback when models fail**
No model should be single point of failure. When the connectivity model predicts wrong, what happens? When the anomaly detector misses, what catches the failure? Defense in depth for model failures.

**4. Learn from failures to improve models**
Every model failure is evidence. Capture it. Analyze it. Update the model or the model's scope. The model that failed under adversarial jamming now includes jamming as a scenario.

### Anti-Fragility Requires Both Automation AND Judgment

The relationship between automation and engineering judgment is not adversarial - it is symbiotic.

**Automation handles routine at scale**: Processing thousands of sensor readings, making millions of micro-decisions, maintaining continuous vigilance. No human can match this capacity for routine work.

**Judgment handles novel situations**: Recognizing when the model doesn't apply, when the context is unprecedented, when the stakes exceed the automation's authority. No automation can match human judgment for genuinely novel situations.

**The system improves when judgment informs automation**: Every case where human judgment corrected automation becomes training data for better automation. Every novel situation handled by judgment becomes a new scenario for automation to learn.

The diagram below illustrates this symbiosis: automation handles routine decisions in a tight loop, novel situations break out to human judgment, and the logged decision re-enters the system as training data that progressively expands automation's scope.

{% mermaid() %}
graph LR
    A["Automation<br/>(handles routine)"] --> B{"Novel<br/>Situation?"}
    B -->|"No"| A
    B -->|"Yes"| C["Human Judgment<br/>(applies expertise)"]
    C --> D["Decision Logged<br/>(with context)"]
    D --> E["System Learns<br/>(expands automation)"]
    E --> A

    style A fill:#bbdefb,stroke:#1976d2
    style B fill:#fff9c4,stroke:#f9a825
    style C fill:#c8e6c9,stroke:#388e3c
    style D fill:#e1bee7,stroke:#7b1fa2
    style E fill:#ffcc80,stroke:#ef6c00
{% end %}

This cycle is the mechanism of {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}. The system encounters stress. Automation handles what it can. Judgment handles what it cannot. The system learns from both. The next stress event is handled better.

### The Best Edge Architects

The best edge architects understand what their models cannot do.

They do not pretend their connectivity model captures adversarial adaptation. They instrument for model failure.

They do not assume their anomaly detector will catch every failure. They design defense in depth.

They do not believe their automation will never make mistakes. They build override mechanisms and learn from corrections.

They do not treat the {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} as a limitation. They recognize it as appropriate design for consequential decisions.

The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} edge system is not one that never fails. It is one designed to **learn from observable failures**, to **extract improvement from survivable stress**, and to **recognize the boundaries of its models**. Whether it achieves this depends on the validity conditions outlined in this article.

Automation extends our reach. Judgment ensures we don't extend past what we can responsibly control. The integration of both - with explicit boundaries, override mechanisms, and learning loops - is the architecture of {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}.

> "The best edge systems are designed not for the world as we wish it were, but for the world as it is: contested, uncertain, and unforgiving of hubris about what our models can do."

> **Cognitive Map**: The engineering judgment section is a meta-pattern for the entire series: enumerate assumptions, identify observable failure signals, specify mitigations, and accept that some boundaries require human judgment rather than algorithmic response. The model boundary catalog is not a list of known bugs — it is the explicit acknowledgment that every formal guarantee in this series has an assumption set, and those assumptions can be violated. An engineer who can recite the boundary catalog for their deployment is more operationally prepared than one who can recite the theorems.

---

## Model Scope and Failure Envelope

> **Problem**: Every mechanism in this post carries implicit assumptions. Anti-fragility requires that stress events improve calibration — but this only holds if the feedback loop is correctly wired. UCB regret bounds assume stochastic rewards. The SOE bounds assume the dynamics model is approximately correct. In adversarial or distributional-shift scenarios, these assumptions can fail silently.
> **Solution**: For each mechanism, enumerate the validity domain as a set of assumptions, specify the failure envelope, and identify observable detection signals and mitigations. The summary claim-assumption-failure table at the end of each subsection functions as a deployment checklist.
> **Trade-off**: Validity envelopes define when to trust the formal guarantees — but they do not define when to trust the overall system. A system operating outside one mechanism's validity envelope may still function correctly if other mechanisms compensate. Defense-in-depth applies to validity constraints as well as to failure modes.

Each mechanism has bounded validity. When assumptions fail, so does the mechanism.

### Anti-Fragility Coefficient Measurement

**Validity Domain**:

The {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} coefficient \\(\mathbb{A}\\) is valid only within the set of system states \\(S\\) where all three measurement assumptions hold simultaneously.

{% katex(block=true) %}
\mathcal{D}_{\text{anti-fragile}} = \{S \mid A_1 \land A_2 \land A_3\}
{% end %}

where:
- \\(A_1\\): Performance \\(P\\) is measurable with bounded error
- \\(A_2\\): Stress magnitude \\(\sigma\\) is quantifiable
- \\(A_3\\): Post-stress measurement is independent of stress event (no survivorship bias)

**Failure Envelope**: The three rows below each name an assumption violation, the failure mode it produces, how the failure can be detected, and the recommended mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Performance not measurable | Cannot compute \\(\mathbb{A}\\) | Metrics undefined or noisy | Define measurable proxies |
| Stress magnitude ambiguous | Normalization fails | \\(\sigma\\) varies across measurements | Standardized stress taxonomy |
| Survivorship bias | \\(\mathbb{A}\\) inflated | Only successful recoveries measured | Include failure cases in denominator |

**Counter-scenario**: Systems that fail catastrophically under stress are not measured post-stress. Only survivors contribute to \\(\mathbb{A}\\) estimate, inflating apparent {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}. Detection: compare {% katex() %}n_{\text{stressed}}{% end %} to {% katex() %}n_{\text{measured}}{% end %}. Mitigation: account for failure cases as \\(\mathbb{A} = -\infty\\) or excluded with explicit note.

### Stress-Information Duality

**Validity Domain**:

Proposition 17's information-from-stress formula applies only when the system can actually observe, attribute, and extract information from failure events — the three conditions below.

{% katex(block=true) %}
\mathcal{D}_{\text{information}} = \{S \mid B_1 \land B_2 \land B_3\}
{% end %}

where:
- \\(B_1\\): Failure is observable (not silent)
- \\(B_2\\): Root cause is identifiable
- \\(B_3\\): Information extraction mechanism exists

**Information Bound**: {% katex() %}I = -\log_2 P(\text{failure}){% end %} is theoretical maximum. Practical extraction depends on logging fidelity.

**Failure Envelope**: Each row identifies a condition under which the information-from-stress mechanism fails silently — the most dangerous case because the system believes it is learning when it is not.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Silent failure | Information not captured | Expected failures not logged | Heartbeat; watchdog |
| Ambiguous causation | Wrong lesson learned | Multiple root causes plausible | Structured diagnosis |
| No extraction mechanism | Information lost | Failure logged but not analyzed | Post-mortem process |

**Counter-scenario**: Catastrophic failure destroys logging infrastructure. The highest-information failures (rarest, most severe) are exactly those least likely to be captured. Detection: expected failure rate vs logged failure rate. Mitigation: redundant logging; off-device telemetry when connected.

### Bandit-Based Parameter Optimization

**Validity Domain**:

The {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} and {% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %} regret bounds from Proposition 18 hold only in environments that satisfy the following discreteness, observability, and stationarity conditions.

{% katex(block=true) %}
\mathcal{D}_{\text{bandit}} = \{S \mid C_1 \land C_2 \land C_3\}
{% end %}

where:
- \\(C_1\\): Parameter space is discrete or discretizable
- \\(C_2\\): Reward signal is informative and observable
- \\(C_3\\): Environment is approximately stationary over learning horizon

**Regret Bound**: {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} achieves {% katex() %}O(\sqrt{TK \ln T}){% end %} regret under assumptions.

**Failure Envelope**: The three violation modes below cause the regret bound to break down in qualitatively different ways — discretization error, sampling insufficiency, and stationarity violation each require a distinct mitigation.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Continuous parameters | Discretization loses optima | Grid search suboptimal | Bayesian optimization |
| Sparse/delayed reward | Slow convergence | Samples per arm < 10 | Shaped rewards; priors |
| Non-stationary | Converges to stale optimum | Performance decline over time | Sliding window; restarts |

**Counter-scenario**: Adversarial environment that adapts to learned parameters. Optimal parameters become suboptimal as adversary counters. The bandit converges, then the target moves. Detection: sudden performance drop after stable period. Mitigation: periodic exploration; randomization.

### Judgment Horizon Classification

**Validity Domain**:

Definition 16's boundary between automatable and human-reserved decisions is reliable only when irreversibility is assessable, relevant precedent exists, and human operators can actually be reached when required.

{% katex(block=true) %}
\mathcal{D}_{\text{judgment}} = \{S \mid D_1 \land D_2 \land D_3\}
{% end %}

where:
- \\(D_1\\): Decision irreversibility is assessable
- \\(D_2\\): Decision precedent exists in training data
- \\(D_3\\): Human operators are reachable when required

**Failure Envelope**: Each row corresponds to one of the three domain conditions \\(D_1\\)–\\(D_3\\) failing; notably, operator unreachability (\\(D_3\\)) is the failure mode most likely to arise in exactly the contested partition scenarios this framework targets.

| Assumption Violation | Failure Mode | Detection | Mitigation |
| :--- | :--- | :--- | :--- |
| Irreversibility unknown | Decision classified incorrectly | Post-hoc discovery of consequences | Conservative default |
| No precedent | Classifier extrapolates poorly | Decision outside training distribution | Defer novel decisions |
| Operators unreachable | Deferred decision cannot execute | Queue depth increases | Escalation timeout; emergency authority |

**Uncertainty bound**: Classification accuracy depends on decision similarity to training data. For novel decisions, expect accuracy degradation. Calibrate thresholds conservatively for high-stakes decisions.

### Summary: Claim-Assumption-Failure Table

The table below consolidates the validity boundaries of the four core mechanisms in this article, mapping each claim to the assumptions it depends on, the conditions under which it holds, and the conditions under which it breaks.

| Claim | Key Assumptions | Valid When | Fails When |
| :--- | :--- | :--- | :--- |
| \\(\mathbb{A} > 0\\) indicates improvement | Measurable \\(P\\), quantifiable \\(\sigma\\), unbiased sampling | Controlled measurement | Survivorship bias; unmeasurable |
| Rare failures carry information | Observable, diagnosable, extractable | Good logging infrastructure | Silent/catastrophic failures |
| Bandits converge to optimal | Stationary, discrete, observable rewards | Stable environment | Adversarial adaptation |
| Judgment horizon protects high-stakes | Irreversibility known, precedent exists | Well-characterized decisions | Novel scenarios |

> **Cognitive Map**: The model scope section is a deployment-readiness checklist for this post. Anti-fragility measurement requires that stress events are correctly detected and attributed. UCB is valid only in stationary, non-adversarial environments. SOE bounds require a correct dynamics model. EXP3 provides minimax guarantees only against oblivious adversaries. The summary table maps each claim to its validity condition, observable failure signal, and mitigation — consult it before deploying any mechanism outside its design environment.

---

## Irreducible Trade-offs

> **Problem**: Anti-fragile systems must simultaneously learn fast, remain stable, explore broadly, and defend against adversarial rewards. These objectives are mutually constraining — progress on any one comes at the cost of another.
> **Solution**: Name the four fundamental trade-offs: learning rate vs. stability, exploration vs. exploitation, adaptability vs. predictability, and automation scope vs. oversight burden. Provide multi-objective formulations and Pareto characterizations for each. The architect's role is selecting a defensible point on each front, not eliminating the tension.
> **Trade-off**: These are irreducible — not just difficult engineering problems, but fundamental conflicts where full optimization of one objective provably degrades another. The cost surface decomposition shows the total anti-fragility cost as a function of partition duration, learning rate, and adversarial intensity.

No design eliminates these tensions. The architect selects a point on each Pareto front.

### Trade-off 1: Learning Rate vs. Stability

**Multi-objective formulation**:

The three objectives below — adaptation speed, noise immunity, and non-stationarity tracking — are jointly maximized over learning rate \\(\eta\\), but no single \\(\eta\\) achieves all three simultaneously.

{% katex(block=true) %}
\max_{\eta} \left( U_{\text{learning}}(\eta), U_{\text{stability}}(\eta), U_{\text{tracking}}(\eta) \right)
{% end %}

where \\(\eta\\) is learning rate.

**Pareto front**: The three rows sample the trade-off space; each row shows how the three performance dimensions move together as \\(\eta\\) increases, confirming that no single value simultaneously achieves fast learning, low noise sensitivity, and strong tracking.

| Learning Rate \\(\eta\\) | Learning Speed | Noise Sensitivity | Tracking Ability |
| :--- | :---: | :---: | :---: |
| 0.01 | Slow | Low | Poor |
| 0.1 | Medium | Medium | Medium |
| 0.5 | Fast | High | Good |

High \\(\eta\\) tracks changes quickly but amplifies noise. Low \\(\eta\\) is stable but fails to track non-stationarity. No single \\(\eta\\) optimizes all dimensions.

### Trade-off 2: Stress Exposure vs. System Safety

**Multi-objective formulation**:

Increasing induced stress \\(\sigma\\) raises information gain {% katex() %}I(\text{failure}; \sigma){% end %} but also raises catastrophe probability; the two objectives conflict and no single \\(\sigma\\) maximizes both.

{% katex(block=true) %}
\max_{\sigma} \left( I(\text{failure}; \sigma), -P(\text{catastrophe} | \sigma) \right)
{% end %}

where \\(\sigma\\) is induced stress level.

**Pareto front** (chaos engineering): The four rows show how information gain and catastrophe risk both increase with \\(\sigma\\), with net value peaking around \\(\sigma = 0.3\\)–\\(0.5\\) before catastrophe risk erodes the gain.

| Stress Level \\(\sigma\\) | Information Gain | Catastrophe Risk | Net Value |
| :--- | ---: | ---: | ---: |
| 0.1 | 0.3 bits | 0.001 | +0.29 |
| 0.3 | 0.8 bits | 0.01 | +0.70 |
| 0.5 | 1.2 bits | 0.05 | +0.70 |
| 0.8 | 1.8 bits | 0.15 | +0.30 |

Higher stress yields more information but risks catastrophic failure. Optimal stress balances information gain against system risk. Diminishing returns beyond {% katex() %}\sigma \approx 0.5{% end %}.

### Trade-off 3: Automation Speed vs. Decision Quality

**Multi-objective formulation**:

The binary choice \\(d\\) (automate or defer to human) drives three objectives that cannot all be maximized: speed favors automation, quality and accountability favor human judgment for consequential decisions.

{% katex(block=true) %}
\max_{d \in \{0,1\}} \left( U_{\text{speed}}(d), U_{\text{quality}}(d), U_{\text{accountability}}(d) \right)
{% end %}

where \\(d=1\\) is automated, \\(d=0\\) is human-deferred.

**Pareto front**: The four decision types span the reversibility-novelty space; as irreversibility and novelty increase together, the human benefit grows and the optimal choice shifts from automation to human authority.

| Decision Type | Automation Benefit | Human Benefit | Optimal Choice |
| :--- | :--- | :--- | :--- |
| Reversible, precedented | Speed | None | Automate |
| Reversible, novel | Speed | Quality | Context-dependent |
| Irreversible, precedented | Speed | Accountability | Human |
| Irreversible, novel | Speed | Quality + Accountability | Human |

Cannot achieve speed AND quality AND accountability for irreversible novel decisions. The {% term(url="#def-16", def="Boundary above which irreversibility, information content, or catastrophe probability exceeds the system's autonomy limit; the system halts and waits for human authorization rather than acting") %}judgment horizon{% end %} formalizes this boundary.

### Trade-off 4: Exploration Breadth vs. Exploitation Depth

**Multi-objective formulation**:

The {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %} exploration coefficient \\(c\\) controls the balance: larger \\(c\\) increases breadth (more exploration of uncertain arms) at the cost of depth (less exploitation of the known-best arm).

{% katex(block=true) %}
\max_{c} \left( U_{\text{breadth}}(c), U_{\text{depth}}(c) \right)
{% end %}

where \\(c\\) is exploration parameter in {% term(url="#term-ucb", def="Upper Confidence Bound algorithm; selects the arm with highest estimated reward plus exploration bonus; achieves sublinear regret in stochastic environments but is exploitable by an adaptive adversary") %}UCB{% end %}/{% term(url="#term-thompson", def="Bayesian bandit algorithm maintaining Beta posteriors over arm reward probabilities; samples to select arms, encoding uncertainty naturally and composing with gossip-shared priors after reconnection") %}Thompson Sampling{% end %}.

**Regret decomposition**:

Total regret decomposes into two additive components: the cost incurred by trying suboptimal arms during exploration, and the cost incurred by not identifying the true optimum fast enough during exploitation.

{% katex(block=true) %}
\text{Regret}(T) = \underbrace{R_{\text{exploration}}(c)}_{\text{cost of trying suboptimal}} + \underbrace{R_{\text{exploitation}}(c)}_{\text{cost of missing optimal}}
{% end %}

The three rows below sample {% katex() %}c \in \{0.5, 1.0, 2.0\}{% end %} and show how the two regret components trade off, with \\(c = 1.0\\) achieving the minimum total at 8.7.

| \\(c\\) | Exploration Regret | Exploitation Regret | Total Regret |
| :--- | ---: | ---: | ---: |
| 0.5 | Low | High | 12.4 |
| 1.0 | Medium | Medium | 8.7 |
| 2.0 | High | Low | 11.2 |

Optimal \\(c \approx 1.0\\) minimizes total regret, but cannot eliminate both components.

### Cost Surface: Anti-Fragility Investment

The net cost of an {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} investment level \\(I\\) is the sum of three cost components (infrastructure, stress testing, and learning overhead) minus the value of the performance improvement the investment produces.

{% katex(block=true) %}
C_{\text{anti-fragile}}(I) = C_{\text{infrastructure}}(I) + C_{\text{stress}}(I) + C_{\text{learning}}(I) - V_{\text{improvement}}(I)
{% end %}

where \\(I\\) is investment level.

**Investment returns**: The table shows the three cost components and the improvement value for each investment tier as a percentage of total system budget; Net is improvement value minus total costs.

| Investment Level | Infrastructure | Stress Testing | Learning | Improvement Value | Net |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Minimal | 2% | 1% | 1% | 5% | +1% |
| Moderate | 5% | 3% | 3% | 15% | +4% |
| Comprehensive | 10% | 5% | 5% | 22% | +2% |

Diminishing returns: comprehensive investment yields only 2% net improvement vs. 4% for moderate.

### Resource Shadow Prices

The shadow price \\(\lambda\\) for each resource is the marginal value of one additional unit — it indicates where additional investment would deliver the highest return in system {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %}.

| Resource | Shadow Price \\(\lambda\\) (c.u.) | Interpretation |
| :--- | ---: | :--- |
| Learning compute | 0.12/update | Value of faster adaptation |
| Stress budget | 3.00/experiment | Value of failure information |
| Human attention | 50.00/decision | Cost of deferred automation |
| Recovery margin | 2.00/%-capacity | Value of stress buffer |

*(Shadow prices in normalized cost units (c.u.) — illustrative relative values; ratios convey anti-fragility resource scarcity ordering. Learning compute (0.12 c.u./update) is the reference unit. Calibrate to platform-specific costs.)*

### Irreducible Trade-off Summary

Each trade-off identified in this section represents a Pareto front that no design can eliminate; the table below names the conflicting objectives and the situation in which no single design point achieves both.

| Trade-off | Objectives in Tension | Cannot Simultaneously Achieve |
| :--- | :--- | :--- |
| Learning-Stability | Fast adaptation vs. noise immunity | Both in noisy environments |
| Stress-Safety | Maximum information vs. zero catastrophe risk | Both with induced stress |
| Speed-Quality | Fast decisions vs. optimal decisions | Both for novel irreversible |
| Explore-Exploit | Breadth vs. depth | Zero regret on both |

> **Cognitive Map**: The irreducible trade-offs section identifies the four Pareto fronts that bound anti-fragile system design. Learning rate vs. stability is resolved by the SOE and Lyapunov constraints — they bound the learning rate to what the dynamics can absorb. Exploration vs. exploitation is resolved algorithmically (UCB, EXP3, Thompson Sampling) — the algorithm choice determines the Pareto point. Adaptability vs. predictability is resolved by the defensive learning layer — randomization provides adaptability while surviving the adversarial exploitation that pure adaptability enables. Automation vs. oversight is resolved by the Judgment Horizon — formal threshold conditions determine which decisions require human authority.

---

## Closing: What Anti-Fragile Decision-Making Establishes

> **Problem**: Five separate articles have developed five separate capability layers. The question is what they establish *together* — and what the aggregate coefficient {% katex() %}\bar{\mathbb{A}}{% end %} proves about cumulative improvement over a deployment.
> **Solution**: The deployment-wide coefficient {% katex() %}\bar{\mathbb{A}} = \sum_i \Delta P_i / \sum_i \sigma_i{% end %} measures average improvement per unit stress across all events. A positive {% katex() %}\bar{\mathbb{A}}{% end %} after 30 days confirms that the system as a whole learned from adversity rather than merely recovering from it.
> **Trade-off**: The five capabilities (connectivity regime modeling, self-measurement, self-healing, fleet coherence, anti-fragile improvement) were developed against the constraints they individually resolve. Deploying all five raises a meta-question: in what sequence should they be built, and how do you know when each is sufficiently solved to advance? That question — the constraint sequence — is addressed in the next post.

Five articles developed the complete autonomic architecture: self-measurement, self-healing, self-coherence, and self-improvement. {% term(url="#scenario-failstream", def="Chaos engineering platform for a streaming service; controlled fault injection discovered 147 hidden dependencies and reduced MTTR from 47 to 8 minutes") %}FAILSTREAM{% end %} converts deliberate stress to MTTR reduction; {% term(url="#scenario-adaptshop", def="E-commerce platform with bandit-optimized recommendations, rankings, and discounts; converts every user interaction into a parameter learning signal") %}ADAPTSHOP{% end %}'s bandits achieve near-optimal performance.

Return to our opening: the {% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} swarm is now {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %}. Not because we made it perfect - perfection is unachievable. But because we made it capable of improving itself. The swarm at day 30 is better than the swarm at day 1, and the swarm at day 60 will be better still.

{% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}Anti-fragility{% end %} is not a property to be added at the end - it is the result of every architectural decision across all five articles compounding. The {% term(url="@/blog/2026-01-22/index.md#def-5", def="Epidemic dissemination protocol where each node contacts random neighbors to propagate state; convergence guaranteed in O(D ln n/lambda) rounds by Proposition 4") %}gossip{% end %} protocol that produces calibrated anomaly scores (Self-Measurement Without Central Observability), the {% term(url="@/blog/2026-01-29/index.md#term-mape-k", def="Monitor-Analyze-Plan-Execute loop sharing a Knowledge base for autonomous control") %}MAPE-K{% end %} loop that executes healing under uncertainty (Self-Healing Without Connectivity), the {% term(url="@/blog/2026-02-05/index.md#def-12", def="Conflict-free Replicated Data Type; merge is commutative, associative, and idempotent — guaranteeing eventual consistency without coordination regardless of update order or network delay") %}CRDT{% end %} reconciliation that turns partition into information gain (Fleet Coherence Under Partition), and the bandit algorithms that convert stress exposure into parameter improvement: each layer makes the next layer possible, and together they produce a system that learns from adversity rather than merely surviving it.

### Deployment-Wide Anti-Fragility

The aggregate coefficient across multiple stress events provides a deployment-wide measure of cumulative improvement:

{% katex(block=true) %}
\bar{\mathbb{A}} = \frac{\sum_i \Delta P_i}{\sum_i \sigma_i}
{% end %}

> **Physical translation**: {% katex() %}\bar{\mathbb{A}}{% end %} is the slope of the performance-vs-cumulative-stress line. Each stress event \\(i\\) contributes {% katex() %}\Delta P_i / \sigma_i{% end %} — the improvement it produced per unit of stress it imposed. Summing across events gives the average. A positive {% katex() %}\bar{\mathbb{A}}{% end %} means the line slopes upward: more total stress produced more total improvement. For RAVEN, {% katex() %}\bar{\mathbb{A}} > 0{% end %} after 30 days means the stress of partitions, jamming events, and hardware failures left the swarm *permanently better calibrated* than it was before any of them occurred.

{% term(url="@/blog/2026-01-15/index.md#scenario-raven", def="47-drone surveillance swarm; loses backhaul mid-mission and must maintain coordinated operations without command authority") %}RAVEN{% end %} after 30 days of operation: detection rate improved from 0.72 to 0.89 (in simulation) after the jamming episode (Week 2), partition recovery dropped from 340s to 67s, and false positive rate fell from 12% to 3%. Each stress event contributed positively to {% katex() %}\bar{\mathbb{A}}{% end %}. The deployment-wide coefficient was positive, confirming cumulative {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragility{% end %} rather than isolated recovery.

Five capabilities now exist: contested-connectivity regime modeling, self-measurement, self-healing, fleet coherence, and {% term(url="#def-15", def="System property where performance improves after stress exposure rather than merely recovering; each failure event yields better-calibrated parameters — the system at day 30 outperforms the system at day 1") %}anti-fragile{% end %} self-improvement. Each was developed against the immediate constraint it resolves. But a fleet deploying all five faces a different question: in what sequence should these capabilities be built, and how do you know when each is sufficiently solved to advance? That meta-question — the constraint sequence itself — is the subject of [The Edge Constraint Sequence](@/blog/2026-02-19/index.md).

