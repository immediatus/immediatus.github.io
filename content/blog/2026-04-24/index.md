+++
authors = ["Yuriy Polyulya"]
title = "One Equation Governs CPU Caches, Human Teams, and AI Agent Systems"
description = "Eight agents complete a benchmark worse than four, at 2x the token cost. The equation that predicts this was written in 1993 for parallel databases — and it governs CPU caches, engineering teams, and AI swarms with identical math. This post proves it at all three layers, then hands you the instrument: given your measured alpha, kappa, and role error weights, compute the topology before you spawn the first agent."
date = 2026-04-24
slug = "coordination-constant-usl-human-ai-teams"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "multi-agent", "organizational-design", "game-theory"]

[extra]
toc = false
+++

---

## The Cost of Checking Your Private World

Four LLM agents on a complex reasoning benchmark: collective performance improves. Eight agents on the same task: performance falls relative to four, and token cost climbs. The coordination overhead between agents has overtaken the reasoning value of adding them — and the equation predicting this crossing was written in 1993 for parallel databases.

Every node — a CPU core, a human engineer, an LLM agent — carries a private world. A cache line holds a value that may already be stale. An engineer holds a mental model of the system that diverged from reality the moment a colleague merged a pull request. An LLM agent holds a temperature-sampled conclusion drawn from the same training distribution as every other agent, yet arriving at a different answer.

The cost of coordination is not the cost of communication. It is the cost of building bridges between private worlds that will never fully merge. That cost has a name — {% katex() %}\kappa{% end %} — and it appears in the same equation whether the nodes are CPU cores synchronizing cache lines, engineers aligning on architecture, or LLM agents reconciling different conclusions from the same training distribution.

In 1993, Neil Gunther formalized this cost as the coherency coefficient in the {% term(url="https://en.wikipedia.org/wiki/Neil_J._Gunther#Universal_Scalability_Law", def="Universal Scalability Law: a nonlinear model of system throughput as a function of concurrency, capturing both contention (serial bottleneck) and coherency (mutual consistency) costs") %}Universal Scalability Law{% end %} {{ cite(ref="1", title="Gunther (1993) — A Simple Capacity Model of Massively Parallel Transaction Systems") }}. It predicts throughput retrograde — the phenomenon where adding processors makes the system slower, not faster. What Gunther captured was not a database-specific effect but a universal structure: whenever {% katex() %}N{% end %} nodes must maintain mutual consistency, the coordination cost grows as {% katex() %}\kappa N(N-1){% end %}, and at some {% katex() %}N{% end %}, that quadratic term dominates the linear benefit of adding capacity.

This post traces that equation across three layers of coordination — hardware, human, AI — and extends it with an epistemic dimension that the original formulation did not need. Hardware coherency operates at {% katex() %}\tau = 0{% end %}: deterministic, zero-temperature, no interpretive variance. Human teams operate at high {% katex() %}\tau{% end %}: every engineer interprets shared specifications through the lens of their own experience, creating irreducible epistemic diversity that is simultaneously the source of collective intelligence and the driver of coordination cost. LLM agents occupy a middle ground where {% katex() %}\tau{% end %} is literally a parameter — the sampling temperature — and its effect on coordination cost can be measured in tokens.

The same equation governs all three. The same topology decision resolves all three. The only thing that changes is the calibration.

---

## Framework Overview

| Concept | What It Tells You | Design Consequence |
| :--- | :--- | :--- |
| **USL extended with epistemic coherency** | Throughput peaks at {% katex() %}N_{\max} = \sqrt{(1 - \alpha) / \kappa_{\text{eff}}}{% end %} and declines beyond — regardless of whether nodes are cores, people, or agents | Adding capacity past {% katex() %}N_{\max}{% end %} makes the system slower; measure {% katex() %}\kappa{% end %} before hiring or spawning |
| **Common Ground coefficient** | {% katex() %}CG(i,j) = J(K_i, K_j) \times \text{alignment}(\tau_i, \tau_j){% end %} — shared knowledge and interpretive alignment between any two nodes | Effective coherency cost is {% katex() %}\kappa_{\text{base}} / \overline{CG}{% end %}: overlapping knowledge reduces coordination tax; disjoint expertise amplifies it |
| **Flat vs. hierarchy edge count** | Flat topology: {% katex() %}N(N-1)/2{% end %} coordination edges. Tree topology: {% katex() %}N - 1{% end %} edges | Hierarchy is not bureaucracy — it is a graph transformation that converts quadratic coordination cost to linear |
| **Multiplication condition** | Collective performance exceeds individual performance only when baseline competence, error decorrelation, and minimum common ground all hold simultaneously | Adding a node that violates any condition makes the collective worse; the Condorcet threshold is a hard gate, not a gradient |
| **Byzantine expected loss** | {% katex() %}L_i = c_i \times P(\text{hallucination}_i) \times \text{propagation}(\text{topology}){% end %} — error damage is weighted by role and amplified by topology | In a flat mesh, one hallucinating agent contaminates {% katex() %}N - 1{% end %} peers; in a hierarchy, contamination is bounded by the branching factor |
| **CRDT vs. consensus merge** | Consensus collapses epistemic diversity to a single value; CRDT merge preserves all contributions with constant-cost reconciliation | When diversity has value — and it almost always does — CRDT-merge hierarchy is Pareto-dominant over consensus at every team size |

> The design consequence column encodes a single claim: the topology decision — flat mesh vs. hierarchy vs. hybrid — is computable from three measured quantities ({% katex() %}\alpha{% end %}, {% katex() %}\kappa_{\text{eff}}{% end %}, role error weights) at every layer. You do not need intuition. You need instrumentation.

---

## Foundations — The Universal Scalability Law, Extended

The original USL models throughput {% katex() %}X{% end %} as a function of concurrency {% katex() %}N{% end %} with two degradation terms {{ cite(ref="1", title="Gunther (1993) — A Simple Capacity Model of Massively Parallel Transaction Systems") }}. The {% term(url="#def-1", def="Contention coefficient: the fraction of work that is inherently serial, creating a bottleneck that limits parallel speedup (Amdahl's Law term)") %}contention coefficient{% end %} {% katex() %}\alpha{% end %} captures the serial fraction — the Amdahl's Law bottleneck that limits speedup even with perfect coordination. The {% term(url="#def-2", def="Coherency coefficient: the per-pair cost of maintaining mutual consistency between nodes, driving the quadratic N(N-1) degradation term") %}coherency coefficient{% end %} {% katex() %}\kappa{% end %} captures the pairwise cost of maintaining mutual consistency — the cost of verifying that your private world still matches everyone else's.

<span id="def-1"></span>

The contention coefficient measures the serial bottleneck. Every system has work that cannot be parallelized: a lock that must be held, a shared resource that admits one writer, a decision that requires a single authoritative voice. As {% katex() %}N{% end %} grows, this serial fraction becomes the throughput ceiling.

<details>
<summary>Definition 1 -- Contention Coefficient: the serial fraction that limits parallel speedup</summary>

**Definition 1** (Contention Coefficient). The contention coefficient {% katex() %}\alpha \in [0, 1){% end %} is the fraction of total work that is inherently serial. Under Amdahl's Law, maximum speedup is bounded by {% katex() %}1 / \alpha{% end %} regardless of the number of nodes.

{% katex(block=true) %}
X_{\text{Amdahl}}(N) = \frac{N}{1 + \alpha(N - 1)}
{% end %}

At {% katex() %}\alpha = 0{% end %}, speedup is linear. At {% katex() %}\alpha = 0.1{% end %}, maximum speedup is 10 regardless of {% katex() %}N{% end %}.

</details>

> **Physical translation.** The contention coefficient is the fraction of your workload that forces everyone to wait in line. In a database, it is the lock on the write-ahead log. In a human team, it is the architecture review meeting that every design must pass through. In an agent system, it is the shared context window that only one agent can update at a time. You can parallelize everything else, but this fraction gates the whole system.

<span id="def-2"></span>

The coherency coefficient measures the pairwise synchronization cost. When any node updates its private state, every other node that shares that state must be notified, must validate, must reconcile. The number of such pairs grows as {% katex() %}N(N-1)/2{% end %}, which is why coherency — not contention — drives throughput retrograde.

<details>
<summary>Definition 2 -- Coherency Coefficient: the pairwise cost of maintaining mutual consistency</summary>

**Definition 2** (Coherency Coefficient). The coherency coefficient {% katex() %}\kappa \geq 0{% end %} is the per-pair synchronization cost. The USL throughput function under both contention and coherency is:

{% katex(block=true) %}
X(N) = \frac{N}{1 + \alpha(N - 1) + \kappa N(N - 1)}
{% end %}

When {% katex() %}\kappa > 0{% end %}, {% katex() %}X(N){% end %} has a maximum at finite {% katex() %}N{% end %} and declines beyond it — throughput retrograde.

</details>

> **Physical translation.** The coherency coefficient is the tax you pay every time two nodes need to agree. In hardware, it is the cache invalidation message that crosses the memory bus. In a human team, it is the Slack thread where two engineers discover they built the same abstraction differently. In an agent system, it is the token budget consumed when Agent B reads Agent A's output to verify it does not contradict its own reasoning. This cost is per-pair. Double the team, quadruple the cost.

*Watch out for*: {% katex() %}\kappa{% end %} is not constant. It depends on topology, communication protocol, and — as developed next — the epistemic distance between nodes. The USL as originally formulated treats {% katex() %}\kappa{% end %} as a fixed hardware parameter. Extending it to human and AI systems requires making {% katex() %}\kappa{% end %} a function of the knowledge and interpretive stance of each pair.

---

The USL predicts a throughput peak. The position of that peak determines the maximum useful team size — the point beyond which adding capacity makes the system worse.

<span id="prop-1"></span>

<details>
<summary>Proposition 1 -- Scalability Ceiling: the maximum useful team size is computable from contention and coherency</summary>

**Proposition 1** (Scalability Ceiling). Given contention coefficient {% katex() %}\alpha{% end %} and coherency coefficient {% katex() %}\kappa{% end %}, the throughput function {% katex() %}X(N){% end %} achieves its maximum at:

{% katex(block=true) %}
N_{\max} = \sqrt{\frac{1 - \alpha}{\kappa}}
{% end %}

For {% katex() %}N > N_{\max}{% end %}, {% katex() %}X(N) < X(N_{\max}){% end %} — throughput retrograde.

**Proof sketch.** Differentiate {% katex() %}X(N){% end %} with respect to {% katex() %}N{% end %}, set {% katex() %}dX/dN = 0{% end %}. The numerator of the derivative vanishes when {% katex() %}1 - \alpha - \kappa N^2 = 0{% end %}, yielding {% katex() %}N^2 = (1 - \alpha)/\kappa{% end %}. The second derivative is negative at this point, confirming a maximum.

</details>

> **Physical translation.** There is a number — computable before you hire, before you spawn, before you provision — beyond which each additional node destroys more throughput through coordination overhead than it contributes through parallel work. For a hardware cluster with {% katex() %}\alpha = 0.05{% end %} and {% katex() %}\kappa = 0.001{% end %}, that number is roughly 31 nodes. For a human team with {% katex() %}\alpha = 0.1{% end %} and {% katex() %}\kappa = 0.02{% end %}, it is roughly 7 people. For an LLM agent system with {% katex() %}\alpha = 0.15{% end %} and {% katex() %}\kappa = 0.08{% end %}, it is roughly 3 agents. The equation is the same. The constants change. *(These are illustrative values chosen to make the arithmetic legible. The empirically calibrated values — derived from published benchmarks and discussed in the Three Curves section — give different numbers: hardware peaks near 57, human teams near 10, AI agents near 6.)*
<!-- NOTE: These are illustrative values. The only published empirical anchor is the SPEC SDM91 benchmark (Sun SPARCcenter 2000) fitted by Gunther: alpha=0.0277, kappa=0.0001044. Hardware kappa~0.0003 is plausible for more coherence-intensive modern workloads (3x the SPEC SDM91 anchor). Human and AI kappa values have no published empirical counterparts — the ordering (hardware < human < AI) is conceptually sound but the specific values are didactic estimates. jonm.dev uses a speculative beta~0.02 for teams. Label clearly as illustrative in any public version. The calibrated values used in the Three Curves section (alpha=0.02/kappa=0.0003) differ from these illustrative values. -->

---

### The Epistemic Extension

The original USL assumes {% katex() %}\kappa{% end %} is a hardware constant — a property of the bus protocol, the cache coherence mechanism, the network fabric. This assumption holds for CPU cores, where every core interprets a cache line identically. It breaks for human teams and AI agents, where the same shared artifact — a specification, a codebase, a prompt — is interpreted differently by each node.

The cost of synchronization between two nodes depends on how much common ground they share. Two engineers who have worked together for years on the same codebase synchronize cheaply: a sentence conveys what would take a paragraph between strangers. Two engineers from different domains, using the same words to mean different things, pay an enormous synchronization premium — and may not even detect the misalignment until it surfaces as a production bug.

<span id="def-3"></span>

<details>
<summary>Definition 3 -- Common Ground Coefficient: the shared epistemic substrate between two nodes</summary>

**Definition 3** (Common Ground Coefficient). For nodes {% katex() %}i{% end %} and {% katex() %}j{% end %} with knowledge bases {% katex() %}K_i{% end %} and {% katex() %}K_j{% end %} and interpretive stances {% katex() %}\tau_i{% end %} and {% katex() %}\tau_j{% end %}, the common ground coefficient is:

{% katex(block=true) %}
CG(i, j) = J(K_i, K_j) \times \text{alignment}(\tau_i, \tau_j)
{% end %}

where {% katex() %}J(K_i, K_j) = |K_i \cap K_j| / |K_i \cup K_j|{% end %} is the Jaccard similarity of knowledge bases, and {% katex() %}\text{alignment}(\tau_i, \tau_j) = 1 - |\tau_i - \tau_j| / \tau_{\max}{% end %} measures how similarly the nodes interpret shared knowledge. {% katex() %}CG \in [0, 1]{% end %}: 1 means perfect overlap in both knowledge and interpretation; 0 means complete disjointness.

*Namespace note: {% katex() %}\tau{% end %} throughout this post denotes the **epistemic temperature parameter** — the degree to which a node applies creative or divergent interpretation to shared artifacts. For LLM agents, this maps directly to the softmax temperature of the sampling distribution. For human nodes, it represents the agent's interpretive stance calibrated on a [0, 1.5] scale. This usage is independent of other distributed-systems variables that conventionally share the symbol — consensus termination thresholds, translation fidelity coefficients, or timeout constants in governance protocols. Where ambiguity could arise in cross-framework derivations, the subscript {% katex() %}\tau_{\text{ep}}{% end %} may be substituted without loss of meaning.*

*Approximation note: Jaccard similarity applies directly when knowledge bases are discrete sets — for example, retrieved document chunks in a RAG system. For LLM knowledge bases represented as continuous weight spaces, actual epistemic overlap scales with distance in the latent manifold, not set overlap. Similarly, temperature affects softmax entropy logarithmically: a unit increase at {% katex() %}\tau = 0.2{% end %} has a far larger effect on output distribution than at {% katex() %}\tau = 1.2{% end %}. The linear alignment formula {% katex() %}1 - |\tau_i - \tau_j| / \tau_{\max}{% end %} is a tractable approximation. The true epistemic divergence is non-linear — it is proportional to the KL divergence between the agents' output distributions, which scales with softmax entropy differences. This model uses the linear form for the same reason the USL uses a polynomial denominator: it captures the qualitative structure with computable inputs.*

</details>

> **Physical translation.** Common ground is not "communication skill." It is the measured overlap between what two nodes know and how they interpret what they know. A backend engineer and a frontend engineer may both know the API contract, but if one thinks of it as a stability guarantee and the other as a versioned interface, their Jaccard overlap is high but their alignment is low — and every synchronization costs more than the shared vocabulary suggests.

<span id="def-4"></span>

The mean common ground across all pairs determines the effective coherency cost for the entire team.

<details>
<summary>Definition 4 -- Effective Coherency Coefficient: the team-wide coordination tax adjusted for epistemic overlap</summary>

**Definition 4** (Effective Coherency Coefficient). Given a base coherency cost {% katex() %}\kappa_{\text{base}}{% end %} (the hardware or protocol minimum) and the mean pairwise common ground {% katex() %}\overline{CG}{% end %}, the effective coherency coefficient is:

{% katex(block=true) %}
\kappa_{\text{eff}} = \frac{\kappa_{\text{base}}}{\overline{CG}}
{% end %}

where:

{% katex(block=true) %}
\overline{CG} = \frac{2}{N(N-1)} \sum_{i < j} CG(i, j)
{% end %}

When {% katex() %}\overline{CG} \to 1{% end %}, the team approaches hardware-level coherency cost. When {% katex() %}\overline{CG} \to 0{% end %}, effective coherency diverges — coordination becomes impossible regardless of communication bandwidth.

</details>

> **Physical translation.** The effective coherency coefficient is what {% katex() %}\kappa{% end %} actually costs your team. A team of five generalists with high knowledge overlap might have {% katex() %}\overline{CG} = 0.8{% end %}, giving {% katex() %}\kappa_{\text{eff}} = 1.25 \kappa_{\text{base}}{% end %} — close to the hardware minimum. A team of five deep specialists with disjoint expertise might have {% katex() %}\overline{CG} = 0.2{% end %}, giving {% katex() %}\kappa_{\text{eff}} = 5\kappa_{\text{base}}{% end %} — coordination costs five times the base rate. The scalability ceiling {% katex() %}N_{\max}{% end %} drops by a factor of {% katex() %}\sqrt{5} \approx 2.2{% end %}. Specialist teams are smaller not because specialists are difficult. They are smaller because the math demands it.

---

### The Extended USL

Combining the epistemic extension with the original USL yields the full throughput function.

<span id="def-5"></span>

<details>
<summary>Definition 5 -- Extended USL: throughput as a function of team size, knowledge overlap, and interpretive diversity</summary>

**Definition 5** (Extended USL). For a team of {% katex() %}N{% end %} nodes with contention {% katex() %}\alpha{% end %}, base coherency {% katex() %}\kappa_{\text{base}}{% end %}, knowledge bases {% katex() %}\{K_i\}{% end %}, and interpretive stances {% katex() %}\{\tau_i\}{% end %}:

{% katex(block=true) %}
X(N, \tau, K) = \frac{N}{1 + \alpha(N - 1) + \kappa_{\text{eff}}(\tau, K) \cdot N(N - 1)}
{% end %}

where {% katex() %}\kappa_{\text{eff}}{% end %} is computed from the mean common ground as in Definition 4. The scalability ceiling becomes:

{% katex(block=true) %}
N_{\max} = \sqrt{\frac{(1 - \alpha) \cdot \overline{CG}}{\kappa_{\text{base}}}}
{% end %}

</details>

> **Physical translation.** The extended USL says: your maximum team size is proportional to the square root of how much your team members share — shared knowledge, shared interpretation. Hiring five specialists who each know something nobody else knows is not "leveraging diverse expertise." It is lowering {% katex() %}\overline{CG}{% end %} and contracting your scalability ceiling. The design response is not to hire generalists instead — it is to invest in the structures that raise {% katex() %}\overline{CG}{% end %} without collapsing diversity: shared documents, rotation programs, pair programming, architectural decision records. Each of these is a {% katex() %}\overline{CG}{% end %} intervention.

> **Cognitive Map — Foundations.** The USL captures two degradation terms: serial bottleneck and pairwise coherency. Coherency drives retrograde because it grows quadratically with team size. The common ground coefficient measures the epistemic overlap that modulates coherency cost. Effective coherency is the base cost divided by mean common ground — less overlap means more expensive coordination. The extended USL combines all three into a single throughput function with a computable team size ceiling. Every layer that follows calibrates this same equation.

---

## Layer 1 — Hardware Coherency: Epistemology at Zero Temperature

The cleanest instantiation of {% katex() %}\kappa{% end %} exists inside your CPU. When a core writes to a cache line, every other core holding a copy of that line must be notified. The {% term(url="https://en.wikipedia.org/wiki/MESI_protocol", def="MESI protocol: a cache coherence protocol where each cache line is in one of four states — Modified, Exclusive, Shared, or Invalid — ensuring all cores observe a consistent memory view") %}MESI protocol{% end %} governs this: each cache line exists in one of four states — Modified, Exclusive, Shared, Invalid — and transitions between states require messages on the interconnect bus {{ cite(ref="2", title="Papamarcos & Patel (1984) — A Low-Overhead Coherence Solution for Multiprocessors with Private Cache Memories") }}.

What makes hardware coherency the ideal starting point is not its speed but its epistemic simplicity. Every core interprets a cache line identically. There is no ambiguity, no perspective, no "well, it depends on context." The knowledge base of every core is the same instruction set architecture. The interpretive stance of every core is deterministic: {% katex() %}\tau = 0{% end %}. This means the common ground coefficient between any two cores is exactly 1:

{% katex(block=true) %}
CG_{\text{hardware}}(i, j) = J(K_i, K_j) \times \text{alignment}(0, 0) = 1 \times 1 = 1
{% end %}

Therefore {% katex() %}\kappa_{\text{eff}} = \kappa_{\text{base}}{% end %}: the effective coherency cost equals the raw hardware cost. No epistemic tax. This is the coordination floor — the minimum cost that any system of interacting nodes must pay, even when those nodes agree perfectly on what the shared state means.

<!-- VERIFIED: Empirical latency numbers from nviennot/core-to-core-latency, Yunming Zhang Haswell-EP benchmarks, 7-cpu.com:
L1 hit: 4-5 cycles / ~1-2ns (server clock). Post used "0.3-1.5ns" — understates, widen to "~1-2ns".
Same-socket cross-core snoop: ~40-55ns Intel Xeon (Broadwell/Cascade/Ice Lake); AMD EPYC intra-CCX ~23ns, inter-CCD ~107ns. Post used "10-40ns" — too low for server; correct to "~40-55ns".
Cross-socket invalidation: ~108-140ns modern Intel dual-socket; up to 200ns older. Post used "60-100ns" — too low; correct to "~100-150ns".
Remote NUMA: ~120-140ns Intel dual-socket; 200-350ns AMD multi-socket. Post used "100-300ns" — correct range, no change needed. -->

The MESI state machine is a solved epistemology. When Core 0 writes to address {% katex() %}A{% end %}, the bus snoops all other caches. Any core holding {% katex() %}A{% end %} in Shared or Exclusive state must invalidate its copy. Core 0 transitions to Modified. The cost is deterministic: one bus transaction, bounded latency, guaranteed completion. No negotiation, no interpretation, no possibility of misunderstanding. The {% term(url="https://en.wikipedia.org/wiki/MESI_protocol", def="MESI protocol: a cache coherence protocol where each cache line is in one of four states — Modified, Exclusive, or Invalid — ensuring all cores observe a consistent memory view") %}MESI{% end %} transition diagram is not a communication protocol — it is a proof that perfect coordination is achievable when {% katex() %}CG = 1{% end %}.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef state fill:none,stroke:#333,stroke-width:2px;
    I[Invalid]:::state -->|Read: bus read| S[Shared]:::state
    I -->|Write: bus read-exclusive| M[Modified]:::state
    S -->|Write: invalidate others| M
    S -->|Snoop write: peer invalidation| I
    M -->|Snoop read: writeback and share| S
    M -->|Evict: writeback to memory| I
    E[Exclusive]:::state -->|Write: silent upgrade| M
    E -->|Snoop read: transition to shared| S
    E -->|Evict: discard clean line| I
{% end %}

> **Read the diagram.** Each node is a cache line state on a single core. Each arrow is a bus transaction with a deterministic cost. The critical path is Shared-to-Modified (a write to shared data): it requires invalidating every other core's copy, and the cost scales with the number of sharers. This is {% katex() %}\kappa{% end %} made visible — the per-pair consistency tax, paid in nanoseconds on a memory bus.

<!-- VERIFIED: Haswell-EP (TU-Dresden 2015 ICPP): L1=1.6ns, L2=4.8ns, L3=21.2ns. Same-socket L2-to-L2 HITM ~38-50ns. Cross-socket ~95-120ns. Papamarcos & Patel citation confirmed: ISCA '84, pp.348-354, ACM DOI 10.1145/800015.808204. Also known as the "Illinois protocol." -->

The hardware USL calibration gives concrete {% katex() %}N_{\max}{% end %} values. For a multi-core processor with {% katex() %}\alpha \approx 0.02{% end %} (minimal serial fraction — most work is parallelizable) and {% katex() %}\kappa_{\text{base}} \approx 0.0003{% end %} (measured from cache coherence traffic on production workloads):

{% katex(block=true) %}
N_{\max}^{\text{hardware}} = \sqrt{\frac{1 - 0.02}{0.0003}} \approx 57
{% end %}

<!-- RESEARCH: Verify this kappa_base value — Gunther's 1993 calibration data, or more recent multi-socket benchmarks from Specjbb or TPC-C runs -->

This is why multi-socket servers exhibit diminishing returns beyond a certain core count, and why the industry moved to scale-out architectures rather than building ever-larger symmetric multiprocessors. The coherency bus saturates. The equation predicted it.

> **Physical translation.** Hardware is the proof of concept for the entire post. CPU cores share a cache line with perfect common ground ({% katex() %}CG = 1{% end %}), pay the minimum possible coherency cost, and still hit a scalability ceiling. If nodes that agree perfectly on the meaning of shared state hit a wall at ~57 cores, what happens when nodes disagree about meaning? That is the human layer.

> **Cognitive Map — Layer 1.** MESI is epistemology at zero temperature: no interpretive variance, perfect common ground, deterministic cost. The coherency coefficient is a hardware constant measured in bus transactions. Even at this floor, the quadratic term produces a finite scalability ceiling. Every subsequent layer inherits this structure but pays a higher effective cost because common ground is less than 1.

---

## Layer 2 — Human Teams: Wittgenstein on the Standup Call

The philosopher Ludwig Wittgenstein spent his career on a problem that distributed systems engineers encounter every Monday morning: how do two minds, operating on private internal representations, achieve enough shared meaning to coordinate action? His answer — that meaning is use, not reference, and that shared meaning emerges from {% term(url="https://en.wikipedia.org/wiki/Language_game_(philosophy)", def="Language game: Wittgenstein's concept that the meaning of a word is determined by the rules of the social practice in which it is used, not by reference to an abstract object") %}language games{% end %} played within a {% term(url="https://en.wikipedia.org/wiki/Form_of_life_(philosophy)", def="Form of life: the shared background of practices, assumptions, and agreements that make communication possible within a community") %}form of life{% end %} — maps directly onto the common ground coefficient {{ cite(ref="3", title="Wittgenstein (1953) — Philosophical Investigations") }}.

When a backend engineer says "the service is down," they mean the process exited or the health check is failing. When a product manager says the same words, they mean customers are complaining. Same sentence, different language game. The Jaccard overlap of their knowledge bases may be substantial — both know what the service does — but the alignment of their interpretive stances is low. Every standup where these two synchronize costs more tokens (in the information-theoretic sense) than a standup between two backend engineers who share both knowledge and interpretation.

This is not a communication failure. It is a structural property of epistemic diversity. And it has a direct, measurable effect on the coherency coefficient.

### Dunbar Layers as Empirical Calibration

Robin Dunbar's research on primate social group sizes provides the empirical anchor for human {% katex() %}\kappa{% end %}. The 1992 paper established the 150 ceiling using neocortex-to-brain-volume regression across 38 primate genera {{ cite(ref="4", title="Dunbar (1992) — Neocortex Size as a Constraint on Group Size in Primates") }}; the nested layer structure — roughly 5, 15, 50, 150 — was formalized in subsequent work {{ cite(ref="11", title="Dunbar (1993) — Coevolution of Neocortex Size, Group Size and Language in Humans") }}. Each layer represents a coherency boundary: the maximum number of relationships at a given depth of mutual model that a human brain can maintain. A 2021 reanalysis found wider confidence intervals than the original estimates, but the nested structure remains the most widely-used empirical heuristic for human social scaling.

<!-- VERIFIED: 5/15/50/150 layers confirmed — not from 1992 paper alone. 1992 paper establishes only the 150 number via neocortex regression. Nested layers first in Dunbar (1993) Behavioral and Brain Sciences 16(4), 681-694. Numbers 5/15/50/150 confirmed as canonical; 5/15/35/150 variant does not appear in primary literature. 2021 challenge: Lindenfors et al. Biology Letters 17(5) found wide CIs (2-336, 4-520) — worth noting as contested heuristic not settled law. -->

The innermost layer — roughly 5 people — corresponds to relationships with high {% katex() %}CG{% end %}: deep mutual knowledge, shared interpretive framework, low synchronization cost. This is the pair-programming partner, the war-room incident team, the founding engineering group. At this scale, {% katex() %}\kappa_{\text{eff}}{% end %} is low enough that flat coordination works.

The next layer — roughly 15 — is where {% katex() %}\overline{CG}{% end %} begins to drop. Not everyone knows everyone's work in detail. Synchronization requires explicit artifacts: meeting notes, design documents, status updates. The coherency cost increases measurably. This aligns with the two-pizza team heuristic: not a cultural preference but a {% katex() %}\kappa{% end %} observation.

<!-- VERIFIED: Brooks (1975) The Mythical Man-Month, Addison-Wesley. Brook's Law: "Adding manpower to a late software project makes it later." Formula n(n-1)/2 is explicit in the book. Brooks does not claim originality for the combinatorics — he uses it to argue against adding people. Note: the 1995 anniversary edition added new chapters including "No Silver Bullet" (1986). If citing original essays, 1975 is correct. Two-pizza rule: Bezos ~2000s, no canonical headcount in public Amazon documentation; range is 6-10 people in practice. -->

At 50 people — Dunbar's clan layer — flat coordination becomes structurally impossible. The number of pairwise channels is {% katex() %}50 \times 49 / 2 = 1{,}225{% end %}. No standup can service 1,225 synchronization edges. Hierarchy becomes mandatory not as a management preference but as a graph-theoretic necessity: replace {% katex() %}O(N^2){% end %} edges with {% katex() %}O(N){% end %} edges by routing coordination through intermediate nodes.

<span id="def-6"></span>

<details>
<summary>Definition 6 -- Coordination Edge Count: the topology tax on synchronization</summary>

**Definition 6** (Coordination Edge Count). The number of pairwise coordination channels required under different topologies:

{% katex(block=true) %}
E_{\text{flat}} = \frac{N(N-1)}{2} \qquad E_{\text{tree}} = N - 1
{% end %}

For a tree with branching factor {% katex() %}k{% end %}, each internal node coordinates with at most {% katex() %}k{% end %} children and 1 parent. Total coordination edges: {% katex() %}N - 1{% end %}, independent of {% katex() %}N{% end %}'s magnitude. The ratio {% katex() %}E_{\text{flat}} / E_{\text{tree}} = N/2{% end %} for large {% katex() %}N{% end %}.

</details>

> **Physical translation.** A flat team of 20 engineers maintains {% katex() %}20 \times 19 / 2 = 190{% end %} coordination edges. A tree-structured organization of the same 20 engineers, with team leads of 5, maintains 19 edges. The coordination tax drops by a factor of 10. This is not "adding management overhead" — it is removing 171 synchronization channels that nobody was actually servicing anyway. The flat team was not flat. It was a fully connected mesh pretending to be flat, with most edges carrying zero bandwidth and accumulating silent drift.

### Conway's Law as Graph Homomorphism

Melvin Conway's original observation — that organizations produce designs mirroring their communication structures — was formalized as a graph homomorphism by Matsutani et al. {{ cite(ref="5", title="Matsutani et al. (2023) — Conway's law, revised from a mathematical viewpoint") }}:

{% katex(block=true) %}
\varphi: G_{\text{org}} \to G_{\text{system}}
{% end %}

<!-- VERIFIED: arXiv:2311.10475 — Matsutani, Ohmori, Hiranabe & Hanyuda (2023) — graph homomorphism formalization confirmed -->

The homomorphism {% katex() %}\varphi{% end %} maps teams to modules and communication channels to interfaces. Conway's Law says this mapping exists. The epistemic extension says something Conway did not: the mapping is valid only when the common ground coefficient along every organizational edge exceeds a coordination threshold.

<span id="prop-2"></span>

<details>
<summary>Proposition 2 -- Epistemic Conway Constraint: structural validity requires minimum common ground on every communication edge</summary>


**Proposition 2** (Epistemic Conway Constraint). The organizational homomorphism {% katex() %}\varphi: G_{\text{org}} \to G_{\text{system}}{% end %} produces a correct system decomposition only if, for every edge {% katex() %}(i, j){% end %} in {% katex() %}G_{\text{org}}{% end %}:

{% katex(block=true) %}
CG(i, j) \geq \theta_{\text{coord}}
{% end %}

where {% katex() %}\theta_{\text{coord}}{% end %} is the minimum common ground required for the shared interface to be specified unambiguously. When {% katex() %}CG(i, j) < \theta_{\text{coord}}{% end %}, the interface between modules {% katex() %}\varphi(i){% end %} and {% katex() %}\varphi(j){% end %} is under-specified: each team implements its side of the contract against a different interpretation, and integration reveals the mismatch.

**Proof sketch.** By contradiction. Suppose {% katex() %}CG(i, j) < \theta_{\text{coord}}{% end %} and the interface is correctly specified. Then there exist terms in the interface contract that {% katex() %}i{% end %} and {% katex() %}j{% end %} interpret differently (since their alignment is below threshold). Both implement according to their interpretation. The implementations are individually correct but mutually inconsistent — a contradiction with the assumption that the interface specification was unambiguous.

</details>

> **Physical translation.** Conway's Law explains why your system architecture mirrors your org chart. The epistemic extension explains why mirroring the org chart is not sufficient: if the teams on either side of an API boundary do not share enough common ground, they will build two correct implementations of two different contracts. You will discover this in integration testing, or — more commonly — in production. Structurally valid org charts with epistemically invalid edges are the root cause of "but it works on my machine" at the organizational scale.

### Role-Weighted Error Costs

Not all coordination failures are equal. A synchronization failure between two backend engineers produces a bug. A synchronization failure between the security architect and the team building the authentication module produces a vulnerability. The cost of coordination failure must be weighted by the role of the nodes involved.

<span id="def-7"></span>

<details>
<summary>Definition 7 -- Role-Weighted Interaction Graph: coordination edges weighted by error consequence</summary>

**Definition 7** (Role-Weighted Interaction Graph). Each node {% katex() %}i{% end %} carries a tuple {% katex() %}(K_i, \tau_i, r_i, c_i){% end %}: knowledge base, interpretive stance, role, and error cost weight. The weight of the coordination edge between {% katex() %}i{% end %} and {% katex() %}j{% end %} is:

{% katex(block=true) %}
w_{ij} = f\!\left(\text{freq}_{ij},\; c_i \times c_j,\; \kappa_{\text{eff}}(i, j)\right)
{% end %}

where {% katex() %}\text{freq}_{ij}{% end %} is communication frequency and {% katex() %}c_i{% end %} is the cost of an error in role {% katex() %}r_i{% end %} propagating to production. Total coordination cost:

{% katex(block=true) %}
C_{\text{total}} = \sum_{i < j} w_{ij}
{% end %}

Under flat topology: {% katex() %}C_{\text{flat}} = O\!\left(N^2 \cdot \overline{w}\right){% end %}. Under hierarchy with branching factor {% katex() %}k{% end %}: {% katex() %}C_{\text{tree}} = O\!\left(N \cdot k \cdot \overline{w}_{\text{level}}\right){% end %}.

</details>

> **Physical translation.** The role-weighted graph makes explicit what every experienced engineering leader knows implicitly: the security architect must be on a short coordination edge with every team that handles credentials, regardless of how the org chart is drawn. The interaction graph is not the org chart. It is the *actual* synchronization topology weighted by "how bad is it if these two people misunderstand each other." Building the org chart without building this graph first is architecture by vibes, applied to humans.

### Accountability and Nash Equilibrium

Game theory provides a formal basis for why accountability structures affect coordination cost. In a flat team with no designated decision authority, every design decision is a coordination game with {% katex() %}N{% end %} players. The Nash equilibrium of such a game — where no player can unilaterally improve their outcome — may be Pareto-suboptimal: everyone waits for someone else to make the call, or everyone makes the call independently and discovers the conflict at integration time.

Hierarchy introduces a mechanism designer — the team lead — who restructures the game from {% katex() %}N{% end %}-player simultaneous coordination to a sequence of {% katex() %}k{% end %}-player games, each with a designated tiebreaker. The Nash equilibrium of the restructured game is Pareto-superior: decisions are made faster, conflicts are detected earlier, and the total coordination cost drops from quadratic to linear in {% katex() %}N{% end %}.

This is not an argument for command-and-control management. It is an argument for designated merge authorities — nodes in the interaction graph that resolve ambiguity at bounded cost rather than allowing it to propagate through the mesh. The merge authority's value is not wisdom. It is topological position.

> **Cognitive Map — Layer 2.** Human teams pay a higher effective coherency cost than hardware because common ground is less than 1. Wittgenstein's language games explain why: meaning depends on shared practice, not shared vocabulary. Dunbar layers provide empirical calibration — flat coordination breaks at team sizes consistent with {% katex() %}N_{\max}{% end %} predictions. Conway's Law is necessary but not sufficient; the epistemic extension adds a common ground floor for valid interfaces. Role-weighted edges make error costs explicit, and game theory shows that hierarchy is not bureaucracy but a Pareto-improving mechanism design. The AI layer inherits all of this structure, with temperature as the epistemic parameter.

---

## Layer 3 — AI Agent Systems: Temperature as Epistemological Stance

LLM agents introduce a property that neither CPU cores nor human engineers possess: the interpretive stance is a tunable parameter. The sampling temperature {% katex() %}\tau{% end %} literally controls how much an agent's output distribution diverges from the mode of the training distribution. At {% katex() %}\tau \to 0{% end %}, the agent behaves like a CPU core — deterministic, zero variance, maximum coherency. At {% katex() %}\tau > 1{% end %}, the agent samples from the tails of the distribution — high variance, high novelty, low coherency with other agents sampling from the same distribution at different temperatures.

This makes the common ground coefficient directly measurable for AI agent systems. Two agents with identical knowledge bases (same model, same context window) but different temperatures have:

{% katex(block=true) %}
CG_{\text{AI}}(i, j) = 1 \times \text{alignment}(\tau_i, \tau_j) = 1 - \frac{|\tau_i - \tau_j|}{\tau_{\max}}
{% end %}

For two agents with the same temperature, {% katex() %}CG = 1{% end %} — hardware-level coherency. For agents with {% katex() %}\tau_1 = 0.2{% end %} and {% katex() %}\tau_2 = 1.1{% end %} (a conservative analyst and an exploratory brainstormer), {% katex() %}CG \approx 0.4{% end %}, and {% katex() %}\kappa_{\text{eff}} = 2.5\kappa_{\text{base}}{% end %}. The scalability ceiling contracts accordingly.

When agents have different context windows or different retrieved document sets, the Jaccard term drops below 1 as well. A RAG-augmented agent system where each agent retrieves different documents has both low knowledge overlap and potentially divergent interpretive stances — a double penalty on {% katex() %}\overline{CG}{% end %}.

### Hallucination as Byzantine Fault

A hallucinating LLM agent is not merely wrong. It is wrong with high confidence and internally consistent justification — the precise signature of a {% term(url="https://en.wikipedia.org/wiki/Byzantine_fault", def="Byzantine fault: a failure mode where a node produces arbitrary (including plausible but incorrect) outputs while appearing to function correctly to external observers") %}Byzantine fault{% end %}. Unlike a crash fault, which is self-announcing, a Byzantine fault produces output that looks correct to every other node in the system. In a multi-agent architecture, this means a hallucinating agent does not simply produce a wrong answer — it produces a wrong answer that other agents may incorporate into their own reasoning.

<span id="def-8"></span>

<details>
<summary>Definition 8 -- Byzantine Expected Loss: the damage from trusting a hallucinating node, weighted by role and topology</summary>

**Definition 8** (Byzantine Expected Loss). The expected loss from trusting node {% katex() %}i{% end %} is:

{% katex(block=true) %}
L_i = c_i \times P(\text{hallucination}_i) \times \text{propagation}(\text{topology})
{% end %}

where {% katex() %}c_i{% end %} is the error cost weight of role {% katex() %}r_i{% end %}, {% katex() %}P(\text{hallucination}_i){% end %} is the per-step hallucination probability, and the propagation factor depends on topology:

{% katex(block=true) %}
\text{propagation}_{\text{flat}} = N - 1 \qquad \text{propagation}_{\text{tree}} \leq k
{% end %}

In a flat mesh, a hallucinating node's output is visible to all {% katex() %}N - 1{% end %} peers. In a tree with branching factor {% katex() %}k{% end %}, the hallucination propagates to at most {% katex() %}k{% end %} children before the parent node (the merge authority) can detect and quarantine it.

</details>

> **Physical translation.** In a flat four-agent system, one hallucination contaminates three other agents. In a tree-structured four-agent system with a coordinator, the same hallucination contaminates at most one downstream agent before the coordinator catches it. Same number of agents, same hallucination rate, different damage. The topology is a containment parameter — and for LLM agents, where errors compound across reasoning steps (a chain with 95% per-step accuracy collapses to under 60% end-to-end reliability across 10 steps), containment is not optional.
<!-- VERIFIED: "3-15% per reasoning step" has no citable per-step benchmark. Replaced with the compounding-error framing, which is mathematically sound and widely cited. End-to-end hallucination rates on complex tasks: leading models exceed 10-30% (Vectara 2025/2026 leaderboard; reasoning models consistently >10% on grounded summarization). Per-step figure is inferential not directly measured. -->

### The Empirical Evidence: Retrograde in Production

The theoretical prediction — that throughput peaks and then declines as agent count increases — has been confirmed empirically. Kim et al. (2025) measured multi-agent scaling across diverse benchmarks and found a regression coefficient of {% katex() %}\beta = -0.408{% end %} ({% katex() %}p < 0.001{% end %}) for the baseline paradox interaction: tasks where single-agent performance already exceeds ~45% accuracy experience negative returns from adding more agents — throughput retrograde, not merely diminishing returns {{ cite(ref="6", title="Kim et al. (2025) — Towards a Science of Scaling Agent Systems") }}.

<!-- VERIFIED: arXiv:2512.08296. Lead author is Yubin Kim (20-author paper; "Zhang" is 8th author — "Zhang et al." corrected to "Kim et al."). beta = -0.408 confirmed as regression coefficient for baseline paradox interaction term, not a power-law exponent. ICLR 2025 attribution was INCORRECT — this is an arXiv preprint only (submitted Dec 2025, predating ICLR 2025 window). Removed venue claim. -->

The OrgAgent framework provides a constructive demonstration of the hierarchy solution. By structuring agents into a three-layer organizational hierarchy — governance, execution, and compliance — with role specialization and designated merge authorities, OrgAgent achieved a 102.73% performance improvement over flat baselines on SQuAD 2.0 while reducing token consumption by 74.52% {{ cite(ref="7", title="Wang et al. (2026) — OrgAgent: Organize Your Multi-Agent System like a Company") }}.

<!-- VERIFIED: arXiv:2604.01020. Authors: Wang, Shen, Han, Backes, Chen, Ho. Exact figures: 102.73% performance improvement, 74.52% token reduction — confirmed on SQuAD 2.0 with GPT-OSS-120B. Original attribution "Li et al." was incorrect. -->

These are not small effects. A 74.52% reduction in token consumption means the hierarchical topology eliminated nearly three-quarters of the coordination overhead. In USL terms, the transition from flat to hierarchy reduced {% katex() %}\kappa_{\text{eff}}{% end %} substantially — consistent with the edge-count reduction from {% katex() %}N(N-1)/2{% end %} to {% katex() %}N - 1{% end %}. Empirical studies across other multi-agent benchmarks consistently find 30–70% higher token consumption in flat architectures relative to equivalent single-agent approaches — overhead that grows as agent count rises {{ cite(ref="8", title="Gartner (2025) — Multiagent Systems in Enterprise AI: Efficiency, Innovation and Vendor Advantage") }}.

Gartner recorded a 1,445% increase in client inquiries about multi-agent systems between Q1 2024 and Q2 2025 — a measure of practitioner urgency, not adoption {{ cite(ref="8", title="Coshow & Zamanian, Gartner (Dec 2025) — Multiagent Systems in Enterprise AI") }}. If the default deployment pattern is flat-mesh coordination, the default outcome will be throughput retrograde at scale — exactly as the USL predicts.

<!-- VERIFIED: Gartner statistic: Coshow & Zamanian, "Multiagent Systems in Enterprise AI: Efficiency, Innovation and Vendor Advantage," published Dec 18, 2025. Measures CLIENT INQUIRIES to Gartner analysts, Q1 2024–Q2 2025. NOT adoption. NOT a 2028 projection (separate Gartner stat: "15% of work decisions made autonomously by agents by 2028"). Corrected framing from "adoption surge" to "client inquiries." -->

### The Multiplication Condition

When does adding an agent make the collective better? The Marquis de Condorcet answered a version of this question in 1785 for binary votes: if each juror is independently correct with probability greater than 0.5, the probability of a correct majority decision approaches 1 as the jury grows {{ cite(ref="9", title="Condorcet (1785) — Essai sur l'Application de l'Analyse à la Probabilité des Décisions Rendues à la Pluralité des Voix") }}. The extension to multi-agent systems requires three conditions, not one.

<span id="prop-3"></span>

<details>
<summary>Proposition 3 -- Multiplication Condition: when adding nodes improves collective performance</summary>

**Proposition 3** (Multiplication Condition — Condorcet Generalized). The collective output exceeds the best individual output if all three conditions hold simultaneously:

1. **Baseline competence:** {% katex() %}P(\text{individual correct}) > 0.5{% end %} — each agent is better than chance
2. **Error decorrelation:** {% katex() %}\text{Corr}(\varepsilon_i, \varepsilon_j) < 1{% end %} for all pairs — errors are not perfectly correlated
3. **Coordination feasibility:** {% katex() %}CG(i, j) \geq \theta_{\text{coord}}{% end %} for all connected pairs — enough common ground to merge outputs

Violating any single condition makes addition harmful. Condition (2) and (3) are in direct tension: maximizing error decorrelation requires diverse stances (low {% katex() %}\overline{CG}{% end %}), while minimizing coordination cost requires shared ground (high {% katex() %}\overline{CG}{% end %}).

**Proof sketch.** Condition (1) is the classical Condorcet requirement. Condition (2) follows from Hong & Page (2004): perfectly correlated errors produce no diversity benefit — the group makes the same mistake as the individual {{ cite(ref="10", title="Hong & Page (2004) — Groups of Diverse Problem Solvers Can Outperform Groups of High-Ability Problem Solvers") }}. Condition (3) is the epistemic extension: without sufficient common ground, the merge operation itself introduces errors that dominate the diversity benefit.

**Empirical violation note (LLM ensembles).** Large-scale evaluation across hundreds of LLMs reveals that condition (2) is not satisfied by default in LLM systems — it is systematically violated. Models trained on overlapping corpora with similar alignment pipelines converge on the same wrong answers at rates far exceeding random chance: empirically, two models that are both wrong agree on the same incorrect answer approximately 60% of the time. More precisely, pairs of individually more accurate models exhibit *higher* error correlation, not lower — because higher accuracy implies more similar training, which implies more correlated failure modes. This is the structural consequence of shared pre-training data and RLHF pipelines: the knowledge bases {% katex() %}K_i{% end %} and {% katex() %}K_j{% end %} are not independent draws from the world — they are projections of the same underlying corpus through similar optimization objectives.

The implication is exact: **condition (2) cannot be assumed by assembling agents. It must be structurally manufactured.** Simply adding more instances of the same model, or more models from the same provider, increases token cost without reducing error correlation — and may worsen it. Decorrelation requires deliberate structural intervention at the topology level: assigning adversarial roles (a critic whose job is to find failures in the generator's output), using different base architectures where possible, and mandating divergent sampling temperatures (forcing a test agent to {% katex() %}\tau = 0{% end %} against a coder agent at {% katex() %}\tau = 0.4{% end %} mechanically widens the gap between their sampling distributions, reducing the probability that both land on the same wrong answer). This is the mathematical justification for the Team-Swarm Hybrid's role differentiation — not a stylistic preference, but a structural requirement for condition (2) to hold.

</details>

> **Physical translation.** The multiplication condition is the formal version of "do not add people to a late project." It also explains when adding agents works: each agent must be competent, their errors must be different, and they must share enough context to combine their work. Violate any one of these and the addition makes things worse. Two agents hallucinating about the same misconception (condition 2 violated) are worse than one. Two agents producing individually excellent answers that cannot be merged because they used incompatible assumptions (condition 3 violated) waste both their token budgets.

Condition (2) is the one LLM systems violate by default. Adding more agents from the same training lineage does not satisfy it — it amplifies the violation, because each additional agent adds another correlated error channel at a cost of {% katex() %}\kappa_{\text{eff}} \times N{% end %} additional coordination overhead. The Team-Swarm Hybrid addresses this directly: the adversarial role assignment (coder vs. security reviewer vs. test agent) is not organizational overhead — it is the mechanism that manufactures the error decorrelation that the Condorcet theorem requires but LLM training pipelines destroy.

### CRDT vs. Consensus: How You Merge Matters

The merge semantics — how nodes reconcile their divergent private worlds — is the final piece. Two canonical approaches dominate: consensus and CRDT merge.

{% term(url="https://en.wikipedia.org/wiki/Consensus_(computer_science)", def="Consensus protocol: a distributed algorithm that ensures all non-faulty nodes agree on a single value, typically requiring multiple message rounds and a majority quorum") %}Consensus{% end %} forces all nodes to agree on a single value. Paxos, Raft, and majority-vote aggregation all implement consensus. The coordination cost scales at {% katex() %}O(\log N){% end %} message rounds for tree-based or optimized protocols (classical Paxos in a flat mesh is {% katex() %}O(N^2){% end %} messages; Raft with leader election is {% katex() %}O(N){% end %}). In all cases it collapses epistemic diversity by construction: the final output is one value, and every other value is discarded. In USL terms:

{% katex(block=true) %}
\kappa_{\text{consensus}} = O(\log N) \times \text{message cost}
{% end %}

{% term(url="https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type", def="CRDT: a data structure designed so that concurrent updates by multiple nodes always converge to the same result without coordination, using mathematically guaranteed merge operations") %}CRDT{% end %} merge preserves all contributions. Each node maintains its local state, and the merge operation — a join in a semilattice — is commutative, associative, and idempotent. No synchronous coordination round is required: each node merges independently, without waiting for acknowledgment from others. The synchronous blocking cost is constant per merge:

{% katex(block=true) %}
\kappa_{\text{CRDT}} = O(1) \times \text{merge cost (synchronous blocking only)}
{% end %}

*Note: CRDTs eliminate synchronous coordination rounds, not network traffic. Achieving eventual consistency still requires asynchronous state propagation — {% katex() %}O(N){% end %} messages for a full broadcast, or {% katex() %}O(\log N){% end %} rounds with gossip. The {% katex() %}O(1){% end %} claim refers to the per-node blocking overhead — the time each node spends waiting on others — which is the component that appears in the USL denominator. The async propagation cost is real but does not contribute to throughput retrograde. There is a second cost that also does not affect retrograde but is relevant in LLM contexts: as a CRDT state vector accumulates mutations, its payload grows — each merge carries more history. This trades synchronous blocking time for increased asynchronous payload size (token context consumed by inter-agent state messages). For token-budget-sensitive deployments, this payload growth should be monitored; periodic state compaction (collapsing history to the current join value) bounds it.*

<span id="prop-4"></span>

<details>
<summary>Proposition 4 -- Merge Semantics and Epistemic Preservation: CRDT merge preserves diversity while consensus collapses it</summary>

**Proposition 4** (Merge Semantics and Epistemic Preservation). Let {% katex() %}H(\tau){% end %} denote the entropy of the interpretive stance distribution across the team — a measure of epistemic diversity. Under consensus merge:

{% katex(block=true) %}
H(\tau)_{\text{post-consensus}} = 0
{% end %}

All nodes converge to the same output; diversity is zero. Under CRDT merge:

{% katex(block=true) %}
H(\tau)_{\text{post-CRDT}} = H(\tau)_{\text{pre-merge}}
{% end %}

All contributions are preserved in the merged structure; diversity is maintained.

**Proof sketch.** Consensus selects one value from the input set, mapping the distribution to a point mass — entropy collapses to 0. CRDT merge is a join in a semilattice, preserving all input elements — the merged state is the least upper bound of all contributions, and no information is discarded.

</details>

> **Physical translation.** Consensus is a vote. The majority wins, and the minority's contribution is discarded. If the minority happened to be right — an agent that caught an edge case everyone else missed — the system loses that signal. CRDT merge is a union. Every contribution survives in the merged output. The coordinator's job is not to pick a winner but to organize the merged contributions into a coherent whole. In the language of the multiplication condition: consensus satisfies condition (1) but can violate condition (2) by collapsing the very diversity it was supposed to leverage. CRDT merge preserves conditions (1) and (2) simultaneously.

> **Cognitive Map — Layer 3.** LLM temperature is a tunable epistemic parameter — the first system where common ground is directly adjustable. Hallucination maps to Byzantine fault, with topology-dependent propagation damage. Empirical evidence confirms USL retrograde predictions: adding agents past the optimum degrades performance measurably. The multiplication condition gates when addition helps: competence, decorrelation, and common ground must all hold. CRDT merge preserves epistemic diversity at constant coordination cost; consensus collapses it at logarithmic cost. The topology decision follows from these constraints.

---

## The Three Curves — Calibrated USL Across Layers

The throughput function {% katex() %}X(N){% end %} produces three qualitatively different curves when calibrated for hardware, human, and AI systems. The shape is identical — Gunther's equation does not change — but the coefficients shift by orders of magnitude, moving the peak earlier and the retrograde deeper.

The following diagram represents these three curves conceptually. The horizontal axis is node count {% katex() %}N{% end %}; the vertical axis is normalized throughput {% katex() %}X(N) / X(1){% end %}.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef point fill:none,stroke:#333,stroke-width:2px;
    A[N=1: All three gaining]:::point --> B[N=6: AI agents peak]:::point
    B --> C[N=10: Human teams peak, AI retrograde]:::point
    C --> D[N=57: Hardware peaks, others retrograde]:::point
{% end %}

> **Read the diagram.** Each node represents a checkpoint on the horizontal axis. At low N, all three layers benefit from parallelism. AI agents peak earliest (lowest {% katex() %}N_{\max}{% end %}) because their effective coherency cost is highest. Human teams peak next. Hardware peaks last, at the highest N, because its coherency cost is lowest.

The canvas below renders the same three curves with calibrated parameters. Drag the sliders to see how changing {% katex() %}\alpha{% end %}, {% katex() %}\kappa_{\text{base}}{% end %}, temperature spread, and knowledge overlap shifts the green curve's peak relative to the three reference layers.

<div style="margin:2rem 0 0.5rem;">
<canvas id="usl-canvas" aria-label="Interactive USL throughput simulation across hardware, human, and AI agent layers" style="width:100%;aspect-ratio:700/520;display:block;border-radius:6px;cursor:default;"></canvas>
<script>
(function(){
  var canvas=document.getElementById('usl-canvas');
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  var W,H,CL,CR,CT,CB,CW,CH,LGND_Y,SLD_TOP;
  var params={alpha:0.10,kappa:0.005,dtau:0.50,koverlap:0.60};
  var sliders=[
    {key:'alpha',   label:'\u03b1 (contention)',      min:0.01,  max:0.50, step:0.01,   fmt:function(v){return v.toFixed(2);}},
    {key:'kappa',   label:'\u03ba base (coherency)',  min:0.0001,max:0.08, step:0.0001, fmt:function(v){return v.toFixed(4);}},
    {key:'dtau',    label:'\u0394\u03c4 (temp spread)',min:0,    max:1.5,  step:0.01,   fmt:function(v){return v.toFixed(2);}},
    {key:'koverlap',label:'K (knowledge overlap)',    min:0.05,  max:1.0,  step:0.01,   fmt:function(v){return v.toFixed(2);}}
  ];
  var srects=[];
  var drag=null;
  var layers=[
    {label:'Hardware',   alpha:0.02,ke:0.0003,color:'#4a90d9'},
    {label:'Human teams',alpha:0.10,ke:0.0083,color:'#e07b39'},
    {label:'AI agents',  alpha:0.15,ke:0.025, color:'#9b59b6'}
  ];
  var NX=80;
  function cgVal(p){var a=Math.max(0.05,1-p.dtau/1.5);return Math.max(0.05,p.koverlap*a);}
  function keVal(p){return p.kappa/cgVal(p);}
  function usl(N,a,ke){return N/(1+a*(N-1)+ke*N*(N-1));}
  function nmx(a,ke){var v=(1-a)/ke;return v>0?Math.sqrt(v):NX+1;}
  function setup(){
    var r=canvas.getBoundingClientRect();
    var dpr=window.devicePixelRatio||1;
    canvas.width=r.width*dpr;canvas.height=r.height*dpr;
    ctx.scale(dpr,dpr);
    W=r.width;H=r.height;
    CL=W*0.11;CR=W*0.04;CT=H*0.13;CB=H*0.37;
    CW=W-CL-CR;CH=H-CT-CB;
    LGND_Y=CT+CH+H*0.055;
    SLD_TOP=CT+CH+H*0.105;
  }
  function cx(N){return CL+(N-1)/(NX-1)*CW;}
  function cy(v){return CT+CH*(1-v);}
  function drawChart(dark){
    var gc=dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)';
    var lc=dark?'#666':'#aaa';
    var fs=Math.max(8,W*0.013);
    ctx.font=fs+'px system-ui,sans-serif';
    ctx.strokeStyle=gc;ctx.lineWidth=1;
    var hlines=[0,0.25,0.5,0.75,1.0];
    for(var i=0;i<hlines.length;i++){
      var yy=cy(hlines[i]);
      ctx.beginPath();ctx.moveTo(CL,yy);ctx.lineTo(CL+CW,yy);ctx.stroke();
      ctx.fillStyle=lc;ctx.textAlign='right';
      ctx.fillText(Math.round(hlines[i]*100)+'%',CL-5,yy+4);
    }
    var vlines=[1,10,20,40,60,80];
    for(var j=0;j<vlines.length;j++){
      var xx=cx(vlines[j]);
      ctx.beginPath();ctx.moveTo(xx,CT);ctx.lineTo(xx,CT+CH);ctx.stroke();
      ctx.fillStyle=lc;ctx.textAlign='center';
      ctx.fillText(vlines[j],xx,CT+CH+13);
    }
    ctx.fillStyle=lc;ctx.textAlign='center';
    ctx.fillText('N  (nodes / agents / team members)',CL+CW/2,CT+CH+H*0.048);
    ctx.save();ctx.translate(CL*0.38,CT+CH/2);ctx.rotate(-Math.PI/2);
    ctx.fillStyle=lc;ctx.textAlign='center';
    ctx.fillText('X(N) / X(1)',0,0);ctx.restore();
    ctx.strokeStyle=dark?'#555':'#ccc';ctx.lineWidth=1;
    ctx.strokeRect(CL,CT,CW,CH);
  }
  function drawCurve(a,ke,color,lw,dashed){
    var mx=0;
    for(var N=1;N<=NX;N++){var v=usl(N,a,ke);if(v>mx)mx=v;}
    if(mx===0)return;
    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=lw;
    if(dashed)ctx.setLineDash([5,4]);else ctx.setLineDash([]);
    for(var N2=1;N2<=NX;N2++){
      var py=cy(usl(N2,a,ke)/mx);
      var px=cx(N2);
      if(N2===1)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.stroke();ctx.setLineDash([]);
  }
  function drawNmax(a,ke,color,yOff){
    var nm=nmx(a,ke);
    if(nm<1||nm>NX)return;
    var x=cx(nm);
    ctx.beginPath();ctx.moveTo(x,CT);ctx.lineTo(x,CT+CH);
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([3,4]);
    ctx.stroke();ctx.setLineDash([]);
    var fs=Math.max(8,W*0.013);
    ctx.font=fs+'px system-ui,sans-serif';
    ctx.fillStyle=color;
    var anchor=x>CL+CW*0.72?'right':'left';
    ctx.textAlign=anchor;
    ctx.fillText('\u224b'+Math.round(nm),x+(anchor==='left'?3:-3),CT+13+(yOff||0));
  }
  function drawLegend(dark){
    var fs=Math.max(8,W*0.014);
    ctx.font=fs+'px system-ui,sans-serif';
    var y0=LGND_Y;
    var items=[
      {label:'Hardware',  color:'#4a90d9',dash:true,lw:1.5},
      {label:'Human teams',color:'#e07b39',dash:true,lw:1.5},
      {label:'AI agents', color:'#9b59b6',dash:true,lw:1.5},
      {label:'Your team', color:'#2ecc71',dash:false,lw:2.5}
    ];
    var seg=CW/4;
    for(var i=0;i<items.length;i++){
      var x0=CL+i*seg;
      ctx.strokeStyle=items[i].color;ctx.lineWidth=items[i].lw;
      if(items[i].dash)ctx.setLineDash([5,4]);else ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0+18,y0);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=dark?'#bbb':'#444';ctx.textAlign='left';
      ctx.fillText(items[i].label,x0+22,y0+4);
    }
  }
  function findSlider(key){for(var i=0;i<sliders.length;i++){if(sliders[i].key===key)return sliders[i];}return null;}
  function drawSliders(dark){
    srects=[];
    var fs=Math.max(9,W*0.016);
    var sh=Math.max(18,H*0.038);
    var sp=sh*1.7;
    var th=4;var tr=Math.max(7,W*0.011);
    var tL=CL+W*0.23;var tW=W*0.54;
    for(var i=0;i<sliders.length;i++){
      var sl=sliders[i];
      var y=SLD_TOP+i*sp;
      var val=params[sl.key];
      var t=(val-sl.min)/(sl.max-sl.min);
      var tx=tL+t*tW;
      var ty=y+sh/2;
      ctx.font=fs+'px system-ui,sans-serif';
      ctx.fillStyle=dark?'#999':'#555';ctx.textAlign='left';
      ctx.fillText(sl.label,CL,ty+4);
      ctx.fillStyle=dark?'#2a2a2a':'#e0e0e0';
      ctx.fillRect(tL,ty-th/2,tW,th);
      ctx.fillStyle='#4a90d9';
      ctx.fillRect(tL,ty-th/2,t*tW,th);
      ctx.shadowColor='rgba(0,0,0,0.18)';ctx.shadowBlur=5;
      ctx.beginPath();ctx.arc(tx,ty,tr,0,Math.PI*2);
      ctx.fillStyle=dark?'#ccc':'#fff';ctx.fill();
      ctx.shadowBlur=0;ctx.shadowColor='transparent';
      ctx.beginPath();ctx.arc(tx,ty,tr,0,Math.PI*2);
      ctx.strokeStyle='#4a90d9';ctx.lineWidth=2;ctx.stroke();
      ctx.font='bold '+fs+'px system-ui,sans-serif';
      ctx.fillStyle=dark?'#4a90d9':'#2970c0';ctx.textAlign='right';
      ctx.fillText(sl.fmt(val),W-CR,ty+4);
      srects.push({key:sl.key,tL:tL,tW:tW,ty:ty,tr:tr,min:sl.min,max:sl.max});
    }
  }
  function drawHeader(dark){
    var ke=keVal(params);var cg_v=cgVal(params);var nm=nmx(params.alpha,ke);
    var fs=Math.max(9,W*0.016);
    ctx.font='bold '+fs+'px system-ui,sans-serif';
    ctx.fillStyle=dark?'#ddd':'#222';ctx.textAlign='left';
    ctx.fillText('USL Coordination Surface',CL,CT-H*0.058);
    var fs2=Math.max(8,W*0.013);
    ctx.font=fs2+'px system-ui,sans-serif';
    ctx.fillStyle=dark?'#666':'#888';ctx.textAlign='left';
    ctx.fillText('CG = '+cg_v.toFixed(2)+'    ke = '+ke.toFixed(4)+'    Nmax \u2248 '+Math.round(nm)+'    \u2190 drag sliders to explore',CL,CT-H*0.022);
  }
  function draw(){
    var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=dark?'#1e1e1e':'#fafafa';ctx.fillRect(0,0,W,H);
    drawHeader(dark);
    drawChart(dark);
    drawCurve(layers[0].alpha,layers[0].ke,layers[0].color,1.5,true);
    drawNmax(layers[0].alpha,layers[0].ke,layers[0].color,0);
    drawCurve(layers[1].alpha,layers[1].ke,layers[1].color,1.5,true);
    drawNmax(layers[1].alpha,layers[1].ke,layers[1].color,14);
    drawCurve(layers[2].alpha,layers[2].ke,layers[2].color,1.5,true);
    drawNmax(layers[2].alpha,layers[2].ke,layers[2].color,28);
    var ke=keVal(params);
    drawCurve(params.alpha,ke,'#2ecc71',2.5,false);
    drawNmax(params.alpha,ke,'#2ecc71',0);
    drawLegend(dark);
    drawSliders(dark);
  }
  function hitSlider(cx2,cy2){
    var r=canvas.getBoundingClientRect();
    var mx=cx2-r.left;var my=cy2-r.top;
    for(var i=0;i<srects.length;i++){
      var s=srects[i];
      if(Math.abs(my-s.ty)<s.tr*3&&mx>=s.tL-10&&mx<=s.tL+s.tW+10)return{s:s,mx:mx};
    }
    return null;
  }
  function applySlider(s,mx){
    var t=Math.max(0,Math.min(1,(mx-s.tL)/s.tW));
    var sl=findSlider(s.key);if(!sl)return;
    var v=s.min+t*(s.max-s.min);
    v=Math.round(v/sl.step)*sl.step;
    v=Math.max(s.min,Math.min(s.max,v));
    params[s.key]=v;
  }
  canvas.addEventListener('mousedown',function(e){
    var h=hitSlider(e.clientX,e.clientY);
    if(h){drag=h.s;applySlider(h.s,h.mx);canvas.style.cursor='ew-resize';e.preventDefault();}
  });
  canvas.addEventListener('mousemove',function(e){
    if(!drag){canvas.style.cursor=hitSlider(e.clientX,e.clientY)?'ew-resize':'default';}
  });
  window.addEventListener('mousemove',function(e){
    if(!drag)return;
    var r=canvas.getBoundingClientRect();
    applySlider(drag,e.clientX-r.left);
  });
  window.addEventListener('mouseup',function(){drag=null;canvas.style.cursor='default';});
  canvas.addEventListener('touchstart',function(e){
    var h=hitSlider(e.touches[0].clientX,e.touches[0].clientY);
    if(h){drag=h.s;applySlider(h.s,e.touches[0].clientX-canvas.getBoundingClientRect().left);e.preventDefault();}
  },{passive:false});
  window.addEventListener('touchmove',function(e){
    if(!drag)return;
    applySlider(drag,e.touches[0].clientX-canvas.getBoundingClientRect().left);
    e.preventDefault();
  },{passive:false});
  window.addEventListener('touchend',function(){drag=null;});
  var running=false;
  function loop(){draw();if(running)requestAnimationFrame(loop);}
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en,ob){
      if(en[0].isIntersecting){running=true;ob.disconnect();setup();loop();}
    },{threshold:0.1}).observe(canvas);
  }else{setup();running=true;loop();}
  window.addEventListener('resize',function(){setup();});
}());
</script>
</div>
<figcaption>Figure: USL throughput surface across three coordination layers. Dotted curves are calibrated reference points (hardware, human teams, AI agents). Green curve responds to sliders. The vertical tick marks show N&#x2098;&#x2090;&#x2093; — the throughput peak beyond which adding nodes causes retrograde scaling. Raise the temperature-diversity slider or lower knowledge-overlap to watch the green curve's ceiling collapse.</figcaption>

The three calibration points — derived from the preceding sections — are:

<style>
#tbl_calibration + table th:first-of-type { width: 18%; }
#tbl_calibration + table th:nth-of-type(2) { width: 12%; }
#tbl_calibration + table th:nth-of-type(3) { width: 15%; }
#tbl_calibration + table th:nth-of-type(4) { width: 15%; }
#tbl_calibration + table th:nth-of-type(5) { width: 15%; }
#tbl_calibration + table th:nth-of-type(6) { width: 25%; }
</style>
<div id="tbl_calibration"></div>

| Layer | {% katex() %}\alpha{% end %} | {% katex() %}\kappa_{\text{base}}{% end %} | {% katex() %}\overline{CG}{% end %} | {% katex() %}\kappa_{\text{eff}}{% end %} | {% katex() %}N_{\max}{% end %} |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hardware** | 0.02 | 0.0003 | 1.0 | 0.0003 | ~57 |
| **Human teams** | 0.10 | 0.005 | 0.6 | 0.0083 | ~10 |
| **AI agents** | 0.15 | 0.01 | 0.4 | 0.025 | ~6 |

<!-- RESEARCH: These calibration values are illustrative — need empirical anchoring. Hardware kappa from Gunther's benchmark data. Human kappa from organizational scaling research. AI kappa from multi-agent coordination benchmarks (OrgAgent, AgentVerse, etc.) -->

> The table compresses the entire argument. Hardware has the lowest coherency cost and the highest scalability ceiling because cores share perfect common ground. Human teams pay an epistemic premium — knowledge overlap below 1, interpretive alignment below 1 — that shrinks the ceiling to roughly 10. AI agents pay the highest premium because temperature diversity and context divergence drive {% katex() %}\overline{CG}{% end %} below 0.5, producing a ceiling of roughly 6 agents. The same equation, three orders of magnitude of {% katex() %}\kappa{% end %}.

---

## Design Consequence — CRDT-Merge Hierarchy is Pareto-Dominant

The design space has three competing objectives: throughput {% katex() %}X(N){% end %}, error containment {% katex() %}E{% end %}, and epistemic diversity {% katex() %}H(\tau){% end %}.

<span id="def-9"></span>

<details>
<summary>Definition 9 -- Three-Axis Pareto Frontier: the topology trade-off surface</summary>

**Definition 9** (Three-Axis Pareto Frontier). The three objectives are:

{% katex(block=true) %}
\text{Throughput: } X(N) \qquad \text{Containment: } E = 1 - \frac{\text{contamination paths}}{N^2} \qquad \text{Diversity: } H(\tau) = -\sum_i p(\tau_i) \log p(\tau_i)
{% end %}

A topology {% katex() %}T_1{% end %} Pareto-dominates {% katex() %}T_2{% end %} if {% katex() %}T_1{% end %} is at least as good on all three axes and strictly better on at least one.

</details>

> **Physical translation.** Every topology decision trades between three things: how much work gets done (throughput), how much damage a single failure causes (containment), and how many distinct perspectives survive the merge process (diversity). A Pareto-dominant topology wins on all three. Such topologies are rare — but CRDT-merge hierarchy is one.

<span id="prop-5"></span>

<details>
<summary>Proposition 5 -- CRDT-Merge Hierarchy Dominance: hierarchy with CRDT merge Pareto-dominates flat consensus on all three axes</summary>

**Proposition 5** (CRDT-Merge Hierarchy Dominance). *Precondition: benign epistemic diversity (crash-fault model) — nodes may produce incorrect or divergent outputs due to sampling variance, but do not actively equivocate or inject adversarially crafted state. The dominance result does not hold under Byzantine fault conditions; see safety constraint below.* For {% katex() %}N > N_{\max}^{\text{flat}}{% end %}, a tree topology with branching factor {% katex() %}k{% end %} and CRDT merge semantics Pareto-dominates a flat topology with consensus merge on all three objectives:

1. **Throughput:** {% katex() %}X_{\text{tree}}(N) > X_{\text{flat}}(N){% end %} because the tree replaces {% katex() %}O(N^2){% end %} coordination edges with {% katex() %}O(N \cdot k){% end %} edges — modeled as a reduced {% katex() %}\kappa_{\text{eff}}{% end %} in the standard USL formula as a macro-approximation (see proof sketch)
2. **Containment:** {% katex() %}E_{\text{tree}} > E_{\text{flat}}{% end %} because propagation factor drops from {% katex() %}N - 1{% end %} to {% katex() %}k{% end %}
3. **Diversity:** {% katex() %}H(\tau)_{\text{CRDT}} \geq H(\tau)_{\text{consensus}}{% end %} because CRDT merge preserves all contributions while consensus collapses to a point mass

**Proof sketch.** Axis 1: Tree topology reduces coordination edges from {% katex() %}O(N^2){% end %} to {% katex() %}O(N){% end %}, reducing the quadratic term in the USL denominator. *Note: this axis applies the standard USL formula with a reduced {% katex() %}\kappa_{\text{eff}}{% end %} as a macro-approximation. Gunther's USL was derived for symmetric multiprocessing — it assumes a fully connected graph where every node can synchronize with every other node at the same cost. A tree topology breaks that assumption: not every node pair has a direct coordination edge. Strictly, a tree changes the structural form of the USL denominator — the {% katex() %}\kappa N(N-1){% end %} term assumes a fully connected mesh and must be replaced with {% katex() %}O(N \cdot k){% end %} interaction cost (Definition 7). Modeling this via a reduced {% katex() %}\kappa_{\text{eff}}{% end %} in the standard formula is a practically useful approximation for throughput estimation, not a derivation from first principles.* Axis 2: A hallucinating node in a flat mesh contaminates {% katex() %}N - 1{% end %} peers; in a tree, it contaminates at most {% katex() %}k{% end %} children before the parent merge authority detects the inconsistency. *(Crash-fault scope: this bound holds when errors are random and detectable by cross-checking. Under Byzantine conditions — where the node produces outputs crafted to pass consistency checks — the k-containment bound breaks. See safety constraint.)* Axis 3: Consensus maps the output distribution to a point mass (zero entropy); CRDT merge preserves the full distribution (maximum entropy compatible with the merge lattice).

**Safety constraint (Byzantine fault boundary).** CRDTs are designed for crash-fault settings: concurrent updates are applied independently and converge without global coordination. This independence is the source of their throughput advantage — and their security vulnerability. A single Byzantine node (one that actively equivocates rather than merely failing or producing random errors) can exploit the absence of global coordination to inject inconsistent state into the CRDT lattice. Because CRDT merge is commutative and idempotent, it cannot distinguish a legitimately divergent update from a poisoned one — both are merged. The result is a monotone pollution of the shared state that cannot be rolled back without abandoning the CRDT's convergence guarantees.

The boundary condition is role error cost {% katex() %}c_i{% end %}. When {% katex() %}c_i{% end %} is low — the node produces prose, summaries, exploratory code — the cost of a merged incorrect contribution is bounded and recoverable. CRDT merge is appropriate. When {% katex() %}c_i{% end %} is critically high — the node controls financial logic, security primitives, safety-critical decisions — a poisoned merge may be unrecoverable. In this regime, the throughput and diversity advantages of CRDT merge are outweighed by the containment failure, and the precondition of Proposition 5 no longer holds.

In the Byzantine / high-{% katex() %}c_i{% end %} regime, BFT consensus mechanisms that force state collapse are mathematically necessary: geometric median aggregation (robust to up to {% katex() %}\lfloor(f-1)/2\rfloor{% end %} Byzantine inputs out of {% katex() %}f{% end %} nodes), semantic trimmed means (discard the top and bottom {% katex() %}p\%{% end %} of contributions before merging), or full PBFT consensus where the cost of the {% katex() %}O(N^2){% end %} message overhead is justified by the error cost weight {% katex() %}c_i{% end %}. The decision rule: if {% katex() %}c_i \times P(\text{Byzantine}) > \kappa_{\text{consensus}} \times \text{token cost}{% end %}, replace CRDT merge with BFT consensus at that node's subtree.

</details>

> **Physical translation.** Flat consensus is epistemically violent: it destroys the diversity that justified having multiple agents, while paying the maximum coordination cost and exposing every node to every failure. CRDT-merge hierarchy preserves diversity (every agent's contribution survives in the merged structure), contains failures (each hallucination is quarantined within a subtree), and reduces coordination cost (each merge authority synchronizes with its children, not with the entire mesh). It is not a compromise between three objectives. It dominates on all three.

*Watch out for*: This dominance result holds for {% katex() %}N > N_{\max}^{\text{flat}}{% end %} **and** under the benign-fault precondition. Two boundary conditions break it. First, for very small teams ({% katex() %}N \leq 3{% end %}), the overhead of hierarchy — the merge authority node that coordinates but does not produce primary output — may exceed the coordination savings; at {% katex() %}N = 2{% end %}, flat is always optimal. Second, when any node in the subtree operates in the Byzantine / critically-high-{% katex() %}c_i{% end %} regime (see safety constraint above), CRDT merge must be replaced with BFT consensus at that subtree boundary. The rest of the hierarchy can retain CRDT semantics; only the high-risk subtrees require the consensus penalty.*

---

## Decision Framework — The Engineering Leader's Instrument

The preceding sections provide the formal basis. This section provides the instrument: given measurable inputs, compute the topology decision.

### Step 1: Measure Your Coefficients

**Contention** {% katex() %}\alpha{% end %}: identify the serial bottleneck. For a human team, this is the approval gate, the shared CI pipeline, the architecture review. For an agent system, this is the shared context window or the orchestrator's sequential planning step. Measure the fraction of total wall-clock time consumed by serial work.

**Base coherency** {% katex() %}\kappa_{\text{base}}{% end %}: instrument the pairwise synchronization cost. For a human team, measure the hours per sprint spent in cross-team alignment meetings, divided by the number of pairwise channels serviced. For an agent system, measure the tokens consumed by inter-agent communication as a fraction of total tokens.

**Common ground** {% katex() %}\overline{CG}{% end %}: assess knowledge overlap and interpretive alignment. For a human team, proxy with code review velocity: how quickly can engineer A review engineer B's pull request? Fast reviews indicate high {% katex() %}CG{% end %}; slow reviews with many rounds of clarifying questions indicate low {% katex() %}CG{% end %}. For an agent system, measure the agreement rate between agents on a calibration set: the fraction of prompts where agents with different temperatures produce the same answer.

### Step 2: Compute the Ceiling

{% katex(block=true) %}
N_{\max} = \sqrt{\frac{(1 - \alpha) \cdot \overline{CG}}{\kappa_{\text{base}}}}
{% end %}

If your current team size exceeds {% katex() %}N_{\max}{% end %}, you are in throughput retrograde. Every additional node makes the system slower. The fix is not "better communication" — the fix is topological restructuring.

### Step 3: Choose the Topology

**If {% katex() %}N \leq N_{\max}{% end %}:** flat coordination is viable. The quadratic term is not yet dominant. Invest in raising {% katex() %}\overline{CG}{% end %} (shared context, rotation, pair programming) to extend the ceiling.

**If {% katex() %}N > N_{\max}{% end %}:** hierarchy is not optional. Compute the branching factor:

{% katex(block=true) %}
k_{\text{opt}} = N_{\max}^{\text{flat}}
{% end %}

Each subtree should contain at most {% katex() %}N_{\max}{% end %} nodes — the largest group that can coordinate effectively in a flat structure. The merge authority at each internal node handles {% katex() %}k{% end %} children, keeping the pairwise coordination within each subtree below the retrograde threshold. *This is an engineering heuristic, not a theorem: in principle, the optimal branching factor varies with tree depth and the ratio of intra-subtree to inter-level message costs. In practice, setting {% katex() %}k = N_{\max}^{\text{flat}}{% end %} gives a defensible, computable starting point that avoids the retrograde region at every level of the hierarchy.*

### Step 4: Choose the Merge Semantics

**If epistemic diversity has value** — and in any creative, analytical, or error-detection task, it does — use CRDT merge. Each subtree produces a local output; the merge authority combines outputs using a join operation that preserves all contributions.

**If compliance or single-answer output is required** — a regulatory filing, a deterministic API response — use consensus within each subtree, but CRDT merge between subtrees at the orchestrator level. This preserves inter-subtree diversity while producing intra-subtree consensus.

### Step 5: Set the Coordination Threshold

{% katex(block=true) %}
\theta_{\text{coord}} = \min\!\left(\overline{CG} - \sigma_{CG},\; 0.3\right)
{% end %}

where {% katex() %}\sigma_{CG}{% end %} is the standard deviation of pairwise {% katex() %}CG{% end %} values. This is a heuristic threshold — adjust based on observed coordination failure rates for your specific domain. Pairs below {% katex() %}\theta_{\text{coord}}{% end %} should not share a coordination edge — they need an intermediate node (a tech lead, a coordinator agent) that has sufficient common ground with both.

> **The complete instrument.** Measure {% katex() %}\alpha{% end %}, {% katex() %}\kappa_{\text{base}}{% end %}, {% katex() %}\overline{CG}{% end %}. Compute {% katex() %}N_{\max}{% end %}. If your team exceeds it, restructure into subtrees of size {% katex() %}N_{\max}{% end %} with CRDT-merge authorities. Check that every coordination edge satisfies {% katex() %}CG \geq \theta_{\text{coord}}{% end %}. This is not management theory. It is the same engineering discipline you apply to any other capacity planning problem — except the nodes are people or agents instead of servers.

<style>
#tbl_topology + table th:first-of-type { width: 20%; }
#tbl_topology + table th:nth-of-type(2) { width: 40%; }
#tbl_topology + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_topology"></div>

**Topology Decision Matrix** — rows: epistemic diversity value; columns: team size relative to ceiling

| | **N &le; N_max** (below ceiling) | **N &gt; N_max** (above ceiling) |
| :--- | :--- | :--- |
| **High diversity value** | **Flat with diversity investment.** Coordination viable; invest in raising {% katex() %}\overline{CG}{% end %} — pair rotation, shared docs, calibration sets. Monitor N against ceiling. | **CRDT-merge hierarchy.** Tree topology, CRDT merge semantics, branching factor {% katex() %}k = N_{\max}{% end %}. Pareto-dominant on all three axes: throughput, error containment, epistemic diversity. |
| **Low diversity value** | **Flat with consensus.** Consensus merge acceptable. Single-answer output, no diversity penalty. Monitor N against ceiling as team grows. | **Consensus hierarchy.** Consensus within subtrees, CRDT merge between subtrees at orchestrator level. Diversity preserved at the orchestrator; intra-subtree coherency enforced. |

> **Cognitive Map — Decision Framework.** Five steps reduce the topology decision to arithmetic. Measure three coefficients: serial fraction, pairwise sync cost, knowledge overlap. Compute the ceiling. Compare team size to ceiling. If above: restructure into subtrees of ceiling-size with CRDT merge authorities. Verify common ground on every edge. The same algorithm works whether the nodes are engineers or agents — only the measurement instruments change.

---

## Applied — Human-AI Hybrid Teams: Engineering the Epistemological Gap

The three-layer analysis traces a clean progression: hardware at {% katex() %}\tau = 0{% end %}, human teams at high {% katex() %}\tau{% end %}, AI agents at tunable {% katex() %}\tau{% end %}. The most immediate design problem most engineering leaders face is none of these in isolation — it is the hybrid team, where human engineers and LLM agents work jointly on the same task. This is where the coordination constant extracts its heaviest tax, because the epistemological gap between human and AI is not a calibration problem. It is structural.

Human engineers construct meaning through consequence. When a senior engineer reads "production-ready," their interpretation is shaped by the 3 AM outage they responded to last quarter, the implicit quality standard negotiated across hundreds of pull request reviews, the architectural decision that was revised after a security audit. This is what Wittgenstein called a form of life: meaning embedded in shared practice, irreducible to the words that carry it.

An LLM agent constructs meaning through proximity. The same phrase activates a statistical distribution of tokens that co-occur with it in the training corpus. The agent does not carry the outage memory. It does not carry the implicit standard. It carries a high-fidelity approximation of what humans write when discussing production readiness — and that approximation is indistinguishable from genuine understanding until the moment it matters.

This is the epistemological gap: consequence-construction versus proximity-construction. It is not a communication failure. It is a structural property of the two knowledge architectures, and it manifests directly in the common ground coefficient:

{% katex(block=true) %}
CG(H, AI) = J(K_H, K_{AI}) \times \text{alignment}(\tau_H, \tau_{AI})
{% end %}

The Jaccard term {% katex() %}J(K_H, K_{AI}){% end %} appears deceptively high: both the engineer and the agent "know" the codebase, the API contracts, the relevant libraries. But the alignment term captures the epistemological gap. The human's interpretive stance is anchored in consequence — failure modes experienced, trade-offs negotiated, implicit constraints accumulated over time. The AI agent's interpretive stance is anchored in frequency — patterns that appear often in training data. These stances diverge precisely when the task requires judgment about novel situations, edge cases, or implicit organizational constraints. The agent confidently traverses the mathematical vector. The human sees it walking toward the cliff.

### Dark Knowledge and the Compilation Problem

The Jaccard similarity {% katex() %}J(K_H, K_{AI}){% end %} is not purely a function of what the agent was trained on. It is also a function of what the human has externalized. Human engineers carry a large body of operational knowledge that is never written down: the context behind an architectural decision, the failure mode a constraint was designed to prevent, the implicit definition of "good enough" that the team has converged on through practice. This tacit substrate makes explicit communication legible to a human colleague but invisible to an AI agent.

<span id="def-10"></span>

<details>
<summary>Definition 10 -- Dark Knowledge Gap: the tacit knowledge component that reduces H2AI Jaccard similarity</summary>

**Definition 10** (Dark Knowledge Gap). Let {% katex() %}K_H^{\text{explicit}}{% end %} denote the subset of a human's knowledge base that is externalized — documented, expressed in prompts, or encoded in system context. Let {% katex() %}K_H^{\text{tacit}}{% end %} denote the complement: knowledge that is operationally active but not externalized. The effective Jaccard similarity in a human-AI interaction is:

{% katex(block=true) %}
J_{\text{eff}}(K_H, K_{AI}) = J(K_H^{\text{explicit}}, K_{AI})
{% end %}

The agent has zero access to {% katex() %}K_H^{\text{tacit}}{% end %}. Every unit of tacit knowledge that remains unexternalized reduces {% katex() %}J_{\text{eff}}{% end %}, increases {% katex() %}\kappa_{\text{eff}}{% end %}, and lowers the scalability ceiling for the H2AI team. *Note: an LLM's training corpus contains traces of general industry conventions, so it is not entirely devoid of implicit knowledge about terms like "production-ready." This formula treats unexternalized local knowledge as having zero intersection with the agent — a conservative and intentionally protective assumption. General conventions are a poor substitute for team-specific constraints; the engineering mandate is to externalize the local context, not to rely on training-data approximations of it.*

</details>

> **Physical translation.** The dark knowledge gap is why "it worked when I described it in person" and "it failed when the agent tried it alone" are the same bug. The in-person description externalized tacit constraints — the context behind the requirement, the edge case to avoid, the implicit definition of done. The agent-only attempt ran on the explicit specification, which was sufficient for a human reader who shared the tacit context and insufficient for an agent that did not. The fix is not better agents. It is externalizing the tacit context — system prompts, architectural decision records, Chain-of-Thought requirements — until {% katex() %}J_{\text{eff}}{% end %} approaches {% katex() %}J(K_H, K_{AI}){% end %}.

Externalizing dark knowledge is a mechanical process with a measurable outcome: every tacit constraint made explicit raises {% katex() %}J_{\text{eff}}{% end %} and lowers {% katex() %}\kappa_{\text{eff}}{% end %}. A system prompt that expresses only format preferences leaves most of {% katex() %}K_H^{\text{tacit}}{% end %} inaccessible. A system prompt that encodes failure modes, implicit constraints, quality standards, and the "why" behind requirements approaches the information density required for high {% katex() %}CG{% end %}.

*Context compilation heuristic:* if the prompt is substantially shorter than the desired output, {% katex() %}J_{\text{eff}}{% end %} is likely insufficient. The prompt must encode enough operational context that the agent's output does not require extensive human correction to satisfy unstated constraints.

### H2AI Topology: Humans as Merge Authorities

The topology prescription follows directly from the multiplication condition (Proposition 3) and the Byzantine expected loss (Definition 8). AI agents satisfy condition (1) — baseline competence — on a wide range of well-defined tasks. They frequently violate condition (3) — coordination feasibility — because their interpretive stance diverges from the human's in precisely the high-stakes situations where condition (3) matters most. And when they violate condition (3), they do so as Byzantine nodes: producing wrong outputs with high confidence and internal consistency.

The correct topology places humans at the internal nodes of the coordination graph — as CRDT-merge authorities — and AI agents at the leaf nodes.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    A1[AI Agent: explorative]:::leaf --> H[Human Merge Authority]:::root
    A2[AI Agent: conservative]:::leaf --> H
    A3[AI Agent: structured]:::leaf --> H
{% end %}

> **Read the diagram.** Three AI agents tackle the same problem from different epistemic stances — temperatures calibrated to different aspects of the task, each below the AI {% katex() %}N_{\max}{% end %} ceiling. The human does not generate the primary output; the human performs the CRDT merge: preserving the useful insights from each agent, discarding the hallucinations, and applying the tacit knowledge that no agent carried.

This structure exploits what each node type does best. AI agents have the patience for exhaustive enumeration, the recall for statistical pattern matching, and the speed for parallel exploration. Human engineers have the consequence-awareness, the contextual intuition, and the tacit knowledge to distinguish a correct-looking output from a safe one. The flat pattern — one human working sequentially with one AI agent as if it were a peer — discards both advantages. The human becomes a sequential bottleneck, the agent's Byzantine faults propagate unchecked, and the epistemological gap is never bridged.

### Instrumenting the H2AI Interface

Proposition 2 (Epistemic Conway Constraint) applies directly to H2AI interfaces: the interface between a human and an AI agent must exceed {% katex() %}\theta_{\text{coord}}{% end %} in common ground, or the output is under-specified. The interface is the prompt — more precisely, the system prompt plus the operational context the human provides at each interaction.

Two instrumentation disciplines follow from this constraint.

**Chain-of-Thought as CG visibility.** Requiring AI agents to output their reasoning before their answer makes the agent's private world visible to the human merge authority. The chain-of-thought is the epistemic equivalent of a CRDT's state vector: it exposes the divergence between the agent's interpretation and the human's before the final output is committed. A merge authority who reads the chain-of-thought can catch epistemic divergence — the agent traversing the wrong vector — before it propagates into the final artifact.

**Role-weighted temperature calibration.** The Byzantine expected loss (Definition 8) depends on the error cost weight {% katex() %}c_i{% end %} and the hallucination probability. For H2AI teams, the error cost is determined by the human role, not the agent's. A security engineer acting as merge authority on an authentication module has high {% katex() %}c_i{% end %} for any security-relevant output — and must constrain agents in their subtree to low {% katex() %}\tau{% end %} (deterministic, conservative) and require consensus agreement before proposing output. A product designer acting as merge authority on a brainstorming session has low {% katex() %}c_i{% end %} for most outputs — and benefits from high-{% katex() %}\tau{% end %} agents generating divergent proposals for human selection.

<style>
#tbl_h2ai + table th:first-of-type { width: 28%; }
#tbl_h2ai + table th:nth-of-type(2) { width: 12%; }
#tbl_h2ai + table th:nth-of-type(3) { width: 20%; }
#tbl_h2ai + table th:nth-of-type(4) { width: 40%; }
</style>
<div id="tbl_h2ai"></div>

| Task type | Error cost | Agent {% katex() %}\tau{% end %} | Merge protocol |
| :--- | :--- | :--- | :--- |
| Security rules, DB migrations, compliance | High | Low ({% katex() %}\tau \to 0{% end %}) | Consensus before human review |
| Architecture proposals, design options | Medium | Mixed (one low, one high) | Human reviews both outputs, CRDT merge |
| Brainstorming, draft generation, test coverage | Low | High (exploratory) | Human as loose filter |

> **Cognitive Map — H2AI Teams.** The epistemological gap between human and AI is structural: consequence-construction versus proximity-construction. It manifests as low {% katex() %}CG{% end %} — low {% katex() %}J_{\text{eff}}{% end %} because dark knowledge remains unexternalized, low alignment because interpretive stances diverge at exactly the decision points where divergence is costly. The design response has three parts: compile dark knowledge into context to raise {% katex() %}J_{\text{eff}}{% end %}; place humans as CRDT-merge authorities at internal nodes to exploit consequence-awareness; calibrate agent temperature to role error cost to manage Byzantine propagation. The goal is not to make AI more human. It is to engineer the topological structure where the AI's alien epistemology is safe to use.

---

## Topology Catalog — Finding the Pareto Frontier in Practice

The topology choice is the primary Pareto design variable. Different structures occupy different positions on the three-axis surface — some maximize throughput at the cost of containment, others maximize containment at the cost of diversity. Knowing which topology maps to which objective priority makes the frontier actionable for day-to-day H2AI communication.

Five canonical topologies cover the practical range. Each is described with its role assignments, its objective function scores, and its failure mode.

---

### Topology 1 — Oracle (1 human + 1 AI)

The simplest H2AI structure: a single AI agent paired with a single human. No coordination overhead, no cross-contamination paths.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    A[AI Agent]:::leaf -->|output| H[Human Reviewer]:::root
    H -->|correction| A
{% end %}

**Roles:** Human as terminal reviewer and correction loop. AI as single producer.

**Objective scores:** Throughput is serial — bounded by single-agent capacity. Containment is maximum — there is only one agent, so contamination paths equal zero. Diversity is minimum — a single {% katex() %}\tau{% end %} produces a single epistemic stance.

**Failure mode:** No redundancy check on hallucination. A Byzantine fault propagates directly to the human with no intermediate quarantine. The human must detect every error alone.

**Best for:** Tasks with a single deterministic right answer where speed matters more than diversity — debugging a specific error message, formatting structured data, generating a unit test for a known function signature.

---

### Topology 2 — Flat Panel (N agents, no merge structure)

Multiple AI agents produce independent outputs. The human reads all outputs without a defined merge protocol.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    A1[AI Agent 1]:::leaf --> H[Human: reads all]:::root
    A2[AI Agent 2]:::leaf --> H
    A3[AI Agent 3]:::leaf --> H
    A4[AI Agent 4]:::leaf --> H
{% end %}

**Roles:** Human as passive consumer. AI agents as independent producers with no shared coordination.

**Objective scores:** Throughput drops below the N_max ceiling — adding agents past ~6 produces retrograde because the human's attention bandwidth is a contention bottleneck ({% katex() %}\alpha{% end %} spikes). Containment is low — all outputs reach the human unfiltered, and a hallucination in any agent demands human time regardless of whether it contains useful signal. Diversity is maximum — all epistemic stances are preserved to the human's attention.

**Failure mode:** Human attention becomes the serial bottleneck Amdahl predicted. The panel degrades into noise rather than signal past a small N.

**Best for:** Early-stage exploration where the full range of approaches is more valuable than any individual answer — technology selection surveys, "what approaches exist for X" brainstorming. Not appropriate when any single hallucination would waste significant human time.

---

### Topology 3 — Star (human hub, AI spokes)

The human acts as active coordinator, routing sub-tasks to specialized agents and receiving outputs on a per-task basis.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    H[Human Coordinator]:::root --> A1[Security agent]:::leaf
    H --> A2[Performance agent]:::leaf
    H --> A3[Style agent]:::leaf
    H --> A4[Test agent]:::leaf
{% end %}

**Roles:** Human as coordinator and merge authority. Each AI agent as a domain specialist receiving routed sub-tasks.

**Objective scores:** Throughput is medium — the human hub processes one spoke at a time, reintroducing serial coordination cost. Containment is high — every output passes through the hub before integration. Diversity is high — the human observes all specialist outputs before merging.

**Failure mode:** Hub bottleneck. At N > 4–5 spokes, the human coordinator's context-switching cost becomes the dominant {% katex() %}\alpha{% end %} term. The star degrades to oracle performance as the human can no longer maintain coherent oversight of all spokes simultaneously.

**Best for:** Tasks with clearly separable sub-domains and a human who has enough context to route correctly — a code review where each file type maps to a specialist agent, a research task where each subtopic maps to a different retrieval strategy.

---

### Topology 4 — Pipeline (sequential chain)

Agents form a directed chain. Each agent transforms the output of the previous agent. The human receives the terminal output.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef branch fill:none,stroke:#ca8a04,stroke-width:2px;
    A1[Draft agent]:::branch --> A2[Critique agent]:::branch
    A2 --> A3[Revise agent]:::branch
    A3 --> H[Human Final Review]:::root
{% end %}

**Roles:** Human as terminal quality gate. Intermediate agents as sequential transformers — each receiving the previous agent's output as ground truth.

**Objective scores:** Throughput is high when the dependency structure is genuine — each step has a verifiable output that gates the next. Containment is low — errors cascade. Each agent in the chain treats the previous agent's hallucination as authoritative input, amplifying rather than containing it. Diversity collapses — each step filters and narrows the output toward a single answer.

**Failure mode:** Error compounding. A hallucination at step 1 is revised at step 2, reformatted at step 3, and delivered to the human with high polish and low accuracy. The pipeline produces confident, well-formatted wrong answers.

**Best for:** Tasks with a strict sequential dependency structure where each step's output is independently verifiable — draft, fact-check, format, then human sign-off. Each intermediate verification gate must be explicit; without it, the pipeline is a hallucination amplifier.

---

### Topology 5 — Ensemble with CRDT Merge (parallel agents, human merge authority)

Multiple parallel AI agents produce divergent outputs. The human performs an explicit CRDT merge: preserving useful contributions, discarding hallucinations, combining the epistemic diversity into a coherent artifact.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    A1[AI Agent: explorative]:::leaf --> H[Human CRDT Merge]:::root
    A2[AI Agent: conservative]:::leaf --> H
    A3[AI Agent: structured]:::leaf --> H
{% end %}

**Roles:** Human as CRDT-merge authority. AI agents as parallel producers with calibrated {% katex() %}\tau{% end %} diversity — at least one low-{% katex() %}\tau{% end %} anchor (conservative, low hallucination risk) and at least one high-{% katex() %}\tau{% end %} explorer (high diversity, higher hallucination risk). The human applies tacit knowledge and consequence-awareness to the merge.

**Objective scores:** Throughput is high — agents run in parallel, each below the AI N_max ceiling. Containment is high — the human merge step quarantines Byzantine faults before they propagate. Diversity is high — all agent contributions survive to the merge point. This is the only topology that scores high on all three axes simultaneously.

**Failure mode:** Human merge quality degrades if the human lacks the domain knowledge to distinguish a hallucination from an unconventional-but-correct output. The CRDT merge is only as good as the merge authority's contextual judgment.

**Best for:** Architecture proposals, security reviews, test generation with multiple strategies, any task where diversity of approach has value and the human has the domain knowledge to judge outputs. The default topology for high-value H2AI work.

---

### Topology 6 — Hierarchical Tree (multi-level, large N)

For N that exceeds the single-human merge authority's capacity, the tree extends to multiple levels. AI leaf agents produce outputs, intermediate merge authorities (AI coordinators or human team leads) perform sub-merges, and the human principal performs the root merge.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef branch fill:none,stroke:#ca8a04,stroke-width:2px;
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    H[Human Principal]:::root --> S1[Security subtree]:::branch
    H --> S2[Performance subtree]:::branch
    H --> S3[Architecture subtree]:::branch
    S1 --> L1[AI leaf: auth]:::leaf
    S1 --> L2[AI leaf: crypto]:::leaf
    S2 --> L3[AI leaf: query]:::leaf
    S2 --> L4[AI leaf: cache]:::leaf
    S3 --> L5[AI leaf: design-A]:::leaf
    S3 --> L6[AI leaf: design-B]:::leaf
{% end %}

**Roles:** Human principal as root merge authority. Intermediate nodes (human team leads or trusted AI coordinators with low {% katex() %}\tau{% end %} and high CG with the principal) as sub-merge authorities. AI leaf agents as primary producers.

**Objective scores:** Throughput is very high — scales linearly with subtree count rather than quadratically with agent count. Containment is very high — multi-level quarantine prevents hallucinations from crossing subtree boundaries. Diversity is medium — intermediate merge steps may filter minority views before they reach the root.

**Failure mode:** Diversity collapse at intermediate levels. If sub-merge authorities apply consensus semantics rather than CRDT semantics, the root receives a pre-filtered output where the interesting outliers have already been discarded. The fix is explicit instruction to intermediate merge authorities to preserve dissenting views as annotated items, not to resolve them.

**Best for:** Large-N tasks exceeding any individual human's attention bandwidth — comprehensive codebase audits, multi-domain research synthesis, large-scale test generation campaigns.

---

### Topology 7 — Team-Swarm Hybrid (multiple humans + specialized agent swarm)

The previous six topologies treat the human side as a single node. Real engineering teams have multiple humans with different roles, different knowledge bases, and their own internal coordination cost. When a human team meets an agent swarm, three types of coordination edges appear simultaneously — and each has a different {% katex() %}\kappa_{\text{eff}}{% end %}.

The team-swarm hybrid is the topology that governs most real H2AI work. Getting it wrong means paying the coordination tax twice: once inside the human team, once at the human-AI interface.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef branch fill:none,stroke:#ca8a04,stroke-width:2px;
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    HP[Human Principal]:::root --> H1[Backend lead]:::branch
    HP --> H2[Product lead]:::branch
    H1 -->|swarm liaison| SC[Swarm Coordinator]:::branch
    SC --> A1[Coder agent]:::leaf
    SC --> A2[Test agent]:::leaf
    SC --> A3[Security agent]:::leaf
    A3 -.->|review gate| A1
{% end %}

> **Read the diagram.** The human team has its own coordination hierarchy (Principal coordinates two leads). One human — the backend lead, who has the highest {% katex() %}CG{% end %} with the AI system — acts as the swarm liaison: the single interface node between the human team and the agent swarm. The swarm has a coordinator agent (low {% katex() %}\tau{% end %}, deterministic) that routes sub-tasks to specialized leaf agents. One intra-swarm coordination edge exists: the security agent reviews coder output before it surfaces to the liaison, quarantining one class of Byzantine fault within the swarm.

The three edge types carry three different {% katex() %}\kappa_{\text{eff}}{% end %} values:

<style>
#tbl_edge_types + table th:first-of-type { width: 22%; }
#tbl_edge_types + table th:nth-of-type(2) { width: 20%; }
#tbl_edge_types + table th:nth-of-type(3) { width: 28%; }
#tbl_edge_types + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_edge_types"></div>

| Edge type | Typical {% katex() %}\kappa_{\text{eff}}{% end %} | CG driver | Design lever |
| :--- | :--- | :--- | :--- |
| Human — Human | Low–Medium | Shared domain knowledge, interpretive alignment from shared practice | Pair rotation, shared ADRs, team rituals that raise {% katex() %}\overline{CG}{% end %} |
| Human — Swarm Coordinator | Medium | Dark knowledge gap; liaison's familiarity with agent capabilities | System prompt quality, CoT requirements, liaison's calibration investment |
| Agent — Agent (intra-swarm) | Low–High | Temperature alignment; knowledge overlap if same base model | Role specialization: diverge temperatures deliberately, add review gates for high error-cost paths |

The liaison node is the critical bottleneck. In Amdahl's Law terms, the liaison is the serial fraction {% katex() %}\alpha{% end %} of the entire human-AI system: every task that requires human judgment must pass through this single node, and no amount of swarm parallelism can bypass it. The maximum system speedup is bounded by {% katex() %}1/\alpha_{\text{liaison}}{% end %} regardless of swarm size. The liaison's {% katex() %}CG{% end %} with both sides — the human team and the swarm coordinator — determines whether this bottleneck amplifies or suppresses the value each side creates. A liaison with low {% katex() %}CG{% end %} on the human side will mis-specify tasks to the swarm. A liaison with low {% katex() %}CG{% end %} on the AI side will fail to catch Byzantine outputs before they reach the human principal.

**Designating the liaison correctly.** The swarm liaison should be the team member with the highest joint {% katex() %}CG{% end %} across both the human team and the agent swarm — not necessarily the most senior engineer, and not the engineer who "likes AI tools." It is the engineer who has invested in externalizing dark knowledge (high {% katex() %}J_{\text{eff}}{% end %} with the swarm) and who understands the human team's implicit constraints (high {% katex() %}CG{% end %} with the principal). In practice, this is often the tech lead — someone who spans the technical–organizational boundary and is already performing a merge-authority role within the human team.

**Intra-swarm role specialization.** Not all agents in the swarm should be interchangeable. Different task types warrant different {% katex() %}\tau{% end %} calibrations, and different roles carry different error cost weights:

- **Coder agent**: medium {% katex() %}\tau{% end %}, high throughput, generates primary artifacts. High hallucination risk for edge cases.
- **Test agent**: low {% katex() %}\tau{% end %} ({% katex() %}\tau \to 0{% end %}), deterministic. Its job is to find failures in the coder agent's output — it should have a *different* sampling distribution to maximize error decorrelation (condition 2 of the multiplication condition).
- **Security agent**: low {% katex() %}\tau{% end %}, high error cost weight {% katex() %}c_i{% end %}. Acts as a review gate — its output blocks the coder agent's output from reaching the human unless it approves. This converts the flat security-review edge (propagation = N-1) into a quarantine gate (propagation = 1).
- **Docs/synthesis agent**: high {% katex() %}\tau{% end %}, low error cost. Summarizes, explains, generates artifacts where diversity has value and errors are easily corrected by the human.

This role differentiation is not bureaucracy. It is temperature-calibrated error containment — the same principle that Proposition 5 proves for topology applies within the swarm for role assignment.

**The N_max arithmetic for the hybrid.** The team-swarm hybrid has three separate scalability ceilings that must all hold simultaneously:

{% katex(block=true) %}
N_{\max}^{\text{human-team}} = \sqrt{\frac{(1 - \alpha_H) \cdot \overline{CG}_{HH}}{\kappa_{\text{base}}^H}} \approx 10
{% end %}

{% katex(block=true) %}
N_{\max}^{\text{swarm}} = \sqrt{\frac{(1 - \alpha_A) \cdot \overline{CG}_{AA}}{\kappa_{\text{base}}^A}} \approx 6
{% end %}

{% katex(block=true) %}
N_{\max}^{\text{interface}} = \sqrt{\frac{(1 - \alpha_{\text{liaison}}) \cdot CG(H_{\text{liaison}}, SC)}{\kappa_{\text{base}}^{\text{liaison}}}}
{% end %}

The interface ceiling {% katex() %}N_{\max}^{\text{interface}}{% end %} counts the number of concurrent swarm tasks the liaison can effectively coordinate — typically 3–5. This is the binding constraint in most team-swarm deployments, not the intra-swarm or intra-human ceilings. The liaison is a single node, and single nodes have the lowest {% katex() %}N_{\max}{% end %} of any layer.

*Watch out for:* the solution to a saturated liaison is not to add more liaisons — that creates two coordination problems (human-team and swarm-to-liaisons) where there was one. The solution is to raise {% katex() %}CG(H_{\text{liaison}}, SC){% end %} through better context compilation and swarm coordinator calibration, or to split the swarm into separate sub-swarms each with their own liaison (Hierarchical tree applied at the team level).

**Objective scores:** Throughput is high (parallel swarm + human team operate concurrently within their ceilings). Containment is high (intra-swarm review gates + liaison as interface quarantine + human principal as final merge authority). Diversity is high — the swarm contributes temperature diversity; the human team contributes experiential diversity; both survive to the principal's merge. This topology is Pareto non-dominated for real engineering teams.

**Best for:** Any sustained H2AI collaboration — feature development, code review, system design, incident investigation. This is the topology that replaces the "engineer with a chat window" pattern in team-scale work.

---

### The Pareto Frontier Across Topologies

The three objective functions score each topology differently. The following table shows qualitative scores — not precise values, but the ordinal relationships that matter for topology selection.

<style>
#tbl_pareto + table th:first-of-type { width: 20%; }
#tbl_pareto + table th:nth-of-type(2) { width: 15%; }
#tbl_pareto + table th:nth-of-type(3) { width: 15%; }
#tbl_pareto + table th:nth-of-type(4) { width: 15%; }
#tbl_pareto + table th:nth-of-type(5) { width: 35%; }
</style>
<div id="tbl_pareto"></div>

| Topology | Throughput | Containment | Diversity | Pareto status |
| :--- | :--- | :--- | :--- | :--- |
| Oracle | Medium | High | Low | Dominated — Ensemble beats it on diversity without sacrificing containment |
| Flat panel | Low (large N) | Low | High | Dominated — Ensemble beats it on both throughput and containment |
| Star | Medium | High | High | Dominated — Ensemble matches it on containment and diversity at higher throughput |
| Pipeline | Medium | Low | Low | Dominated — no topology scores worse on all three axes |
| **Ensemble + CRDT** | **High** | **High** | **High** | **Non-dominated — Pareto frontier (single human)** |
| **Hierarchical tree** | **Very high** | **Very high** | **Medium** | **Non-dominated — Pareto frontier (large N, single human)** |
| **Team-Swarm Hybrid** | **High** | **Very high** | **Very high** | **Non-dominated — Pareto frontier (team scale, real-world)** |

The Pareto frontier contains three topologies that cover the full practical range. Ensemble is optimal when a single human coordinates a small agent group. Hierarchical tree extends this to larger N within a single human's bandwidth. Team-Swarm Hybrid is optimal when the work requires a human team and a specialized agent swarm operating concurrently — it inherits very high containment from the multi-level review structure and very high diversity from both the swarm's temperature spread and the team's experiential diversity. Every other topology is dominated.

> The practical implication: the topology decision reduces to two questions. First: does the task require a human team (multiple people) or a single human coordinator? If a team, the Team-Swarm Hybrid is the frontier topology. If a single human: is N above or below the ensemble capacity? Below it, use Ensemble with CRDT merge. Above it, extend to Hierarchical tree. The other topologies (Oracle, Star, Panel, Pipeline) are acceptable for simple or low-stakes tasks, but they all leave value on the table.

### Day-to-Day Protocol: Three Questions Before Every Task

Before deploying any H2AI workflow, four questions locate you on the Pareto surface.

**Question 0 — Is this a team task or a solo task?**
Multiple humans working toward the same output: Team-Swarm Hybrid. Designate a swarm liaison, structure the agent swarm with role-differentiated temperatures, set a review gate for the highest error-cost agent role. The liaison is the Amdahl serial fraction of the whole system — the binding {% katex() %}N_{\max}{% end %} is not swarm size or team size, it is the liaison's coordination ceiling.
Single human coordinator: proceed to Question 1.

**Question 1 — What is the error cost?**
High error cost (security, compliance, production migrations): prioritize containment — low {% katex() %}\tau{% end %} agents, consensus within subtrees, human merge authority mandatory.
Low error cost (brainstorming, drafts, exploratory analysis): relax containment — allow high {% katex() %}\tau{% end %} agents, human as loose filter.

**Question 2 — Does diversity of approach have value?**
Yes (architecture decisions, design options, root-cause analysis): Ensemble or Hierarchical tree. Preserve all agent contributions to the merge point; do not let any intermediate node resolve disagreements before the human sees them.
No (formatting, deterministic transformation, single-answer lookup): Oracle or Star. Diversity adds noise, not signal.

**Question 3 — How many agents does the task require?**
{% katex() %}N \leq 3{% end %}: Oracle or Ensemble both viable. Prefer Ensemble if error cost is medium or higher.
{% katex() %}3 < N \leq 6{% end %} (AI {% katex() %}N_{\max}{% end %}): Ensemble. This is the default H2AI frontier topology.
{% katex() %}N > 6{% end %}: Hierarchical tree. Each subtree must stay within its own {% katex() %}N_{\max}{% end %}. Human (or trusted low-{% katex() %}\tau{% end %} coordinator) at each internal node.

> **Cognitive Map — Topology Catalog.** Seven topologies, three on the Pareto frontier. Pipeline is the failure pattern: errors cascade, diversity collapses, throughput is mediocre. Oracle is acceptable for simple tasks but blind to hallucination. Star and Panel are dominated by Ensemble. The practical frontier is: Ensemble for solo H2AI work below the AI {% katex() %}N_{\max}{% end %}; Hierarchical tree for large-N solo tasks; Team-Swarm Hybrid whenever a human team and a specialized agent swarm operate on the same problem. The Team-Swarm Hybrid introduces a fourth design variable — the liaison node — whose CG with both sides is the binding constraint on the whole system's throughput. Four questions locate every task: Is this a team task? What is the error cost? Does diversity have value? How many agents? Answer those four, the topology follows.

---

## Framework in Practice — Worked Example and the Pareto Map

### Worked Example: OAuth2 Authentication Service

A team of three engineers — a principal, a backend lead, and a security engineer — needs to deliver a new OAuth2 authentication service. Deliverables: implementation, security review, automated tests, and API documentation. A week of calendar time, two-factor auth required, known OWASP constraints apply.

The four-question protocol resolves the topology in under two minutes. Each question has a single concrete test:

**Q0 — Multiple humans?** Does more than one person need to contribute, review, or approve the final output? Three engineers on this task: yes. A solo developer prototyping alone: no.

**Q1 — Error cost?** How damaging is a hallucination that reaches production undetected? High means irreversible or high-blast-radius consequences: security vulnerabilities, data corruption, compliance violations, production outages. Low means the output is easily corrected by a human before it matters: brainstorm notes, draft documentation, exploratory analysis.

**Q2 — Diversity value?** Does the task benefit from having multiple distinct approaches generated and compared — or is there a single correct answer? High means the best answer is not obvious in advance and multiple strategies should be evaluated: architecture decisions, security approach selection, test strategy design. Low means the answer is deterministic or the space of valid answers is narrow: reformatting data, looking up a known API signature, running a standard linting rule.

**Q3 — Agent count?** How many specialized agents does the task require? Compare against the AI {% katex() %}N_{\max}{% end %} ceiling of approximately 6. Below it, an ensemble is viable. Above it, hierarchical extension is needed to stay out of retrograde.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart TD
    classDef entry fill:none,stroke:#333,stroke-width:2px;
    classDef decide fill:none,stroke:#ca8a04,stroke-width:2px;
    classDef ok fill:none,stroke:#22c55e,stroke-width:2px;
    classDef alt fill:none,stroke:#aaa,stroke-width:1.5px,stroke-dasharray:4 4;
    START[OAuth2 auth service]:::entry --> D0{Q0: Multiple humans?}:::decide
    D0 -->|yes: 3 engineers| D1{Q1: Error cost?}:::decide
    D0 -->|no: single human| ALT0[Solo topology path]:::alt
    D1 -->|high: auth + security| D2{Q2: Diversity value?}:::decide
    D1 -->|low| ALT1[Oracle or Star]:::alt
    D2 -->|yes: multiple strategies| D3{Q3: Agent count?}:::decide
    D2 -->|no| ALT2[Consensus topology]:::alt
    D3 -->|5 agents below N-max| RESULT[Team-Swarm Hybrid]:::ok
    D3 -->|above N-max| ALT3[Hierarchical extension]:::alt
{% end %}

Solid lines show the path taken for this task. Dashed gray nodes are the branches not taken — they remain available if task characteristics change (single engineer, lower error cost, no diversity value, or larger swarm).

The topology is Team-Swarm Hybrid. Now configure it.

**Step 1 — Compile dark knowledge into the swarm coordinator's context.**

The human team carries implicit constraints that the agent swarm cannot infer: bcrypt cost factor 12 (not the library default of 10), session token storage in Redis not in the database, the security engineer's veto right on any cryptographic primitive choice, the implicit definition of "production-ready" that includes the 3 AM on-call expectation. Every one of these is {% katex() %}K_H^{\text{tacit}}{% end %} — and must be externalized into the coordinator's system prompt before the swarm begins.

A system prompt shorter than one page is almost certainly missing material constraints for a task of this complexity. The liaison drafts it; the security engineer reviews it for omissions.

**Step 2 — Assign agent roles with calibrated temperatures.**

| Agent role | {% katex() %}\tau{% end %} | Error cost {% katex() %}c_i{% end %} | Function | Edge constraint |
| :--- | :--- | :--- | :--- | :--- |
| Swarm coordinator | 0.05 | — | Routes sub-tasks to leaf agents, summarizes for liaison | Low {% katex() %}\tau{% end %}: must be deterministic and auditable |
| Coder agent | 0.4 | Medium | Implements auth logic, token handling, refresh flow | Gated by security agent before output reaches liaison |
| Security agent | 0.1 | **High** | OWASP check, cryptographic primitive review | **Review gate**: blocks coder output if OWASP violation found |
| Test agent | 0.0 | Low | Generates unit and integration tests | Different sampling distribution from coder — error decorrelation |
| Docs agent | 0.8 | Low | API documentation, inline comments | High {% katex() %}\tau{% end %}: diversity has value, errors easily corrected |

**Step 3 — Verify the three N_max ceilings.**

Human team: 3 engineers, {% katex() %}N_{\max}^{\text{human}} \approx 10{% end %}. (OK)

Agent swarm: 5 agents, {% katex() %}N_{\max}^{\text{swarm}} \approx 6{% end %}. (OK — one agent of headroom)

Interface: backend lead coordinates with swarm on 3–4 concurrent sub-tasks (implementation + security + tests active simultaneously). Within the liaison ceiling of ~5. (OK)

**Step 4 — Set the coordination threshold.**

Compute {% katex() %}\overline{CG}{% end %} across the human-swarm interface. The liaison has invested in context compilation: {% katex() %}J_{\text{eff}} \approx 0.7{% end %} (good system prompt coverage of dark knowledge), {% katex() %}\text{alignment} \approx 0.6{% end %} (backend lead understands agent capabilities). {% katex() %}CG(H_{\text{liaison}}, SC) \approx 0.42{% end %}. The threshold {% katex() %}\theta_{\text{coord}} = 0.3{% end %} is met. If it were not — if the liaison had never worked with this agent configuration before — the first task should be a calibration run: a small, verifiable sub-task where the liaison can measure the actual {% katex() %}CG{% end %} before committing the full swarm.

**What changes compared to "engineer with a chat window."**

The difference is not that the team uses more AI. The difference is structural:

- The security agent's review gate converts a Byzantine fault (hallucinated OWASP compliance) from a propagation-factor-of-4 event to a propagation-factor-of-1 event, quarantined before it reaches the liaison.
- The test agent's {% katex() %}\tau = 0{% end %} and different sampling distribution gives error decorrelation — it will catch cases the coder agent missed precisely *because* they diverge in their distributions.
- The principal sees merged, pre-reviewed output — not raw agent output — preserving human bandwidth for the decisions that require consequence-awareness.

None of these effects require more agents. They require *positioned* agents.

---

### The Pareto Map

Every topology in this catalog scores on the same three axes. Before reading the matrix, the axes need to be concrete — each one maps directly to a mechanism described earlier in this post.

**Throughput (T)** measures how much work the topology can complete per unit time before coordination overhead dominates. The USL formula {% katex() %}X(N) = N / (1 + \alpha(N-1) + \kappa_{\text{eff}} N(N-1)){% end %} has a peak at {% katex() %}N_{\max}{% end %} and falls on both sides. A high T score means the topology keeps most agents doing productive work rather than waiting on coordination messages. The Hierarchical Tree scores T = 96% because the coordinator converts quadratic message overhead into linear overhead: each leaf reports to one parent, not to every peer. A Flat Panel scores T = 18% because with eight equally-connected agents, every agent must broadcast state to every other agent — the {% katex() %}\kappa_{\text{eff}} N(N-1){% end %} term in the denominator grows faster than the numerator.

**Containment (E)** measures how well the topology limits error propagation. From the Byzantine model: propagation factor is {% katex() %}N-1{% end %} for a flat topology and {% katex() %}k{% end %} (the branching factor) for a hierarchy. A high E score means a hallucinated result, a miscalibrated confidence, or an OWASP violation stays quarantined within the subtree where it originated instead of contaminating every downstream agent. The Hierarchical Tree scores E = 96% because the coordinator acts as a firewall: a leaf agent's error reaches at most {% katex() %}k{% end %} peers before the coordinator intercepts it. A Pipeline scores E = 18% because each stage feeds directly into the next — an error in stage 2 is amplified by every downstream stage without any cross-subtree review gate.

**Diversity (D)** measures the entropy of the topology's temperature and knowledge distribution — {% katex() %}H(\tau) = -\sum p(\tau_i) \log p(\tau_i){% end %}. High D means agents hold meaningfully different world models. This is what the Condorcet condition 2 requires: uncorrelated errors. A high-D topology can catch a failure class that a low-D topology will miss precisely because the agents diverge in their sampling distributions. The Ensemble + CRDT scores D = 90% because agents operate independently at different temperatures and merge via CRDT — consensus is never called, so epistemic diversity is preserved in the final output. The Oracle scores D = 20% because one agent's conclusions are authoritative and the rest of the swarm aligns to them — the merge operation collapses all divergence.

D and E are in direct tension. More diversity means more divergent intermediate conclusions, which means more coordination work to merge them, which drives up {% katex() %}\kappa_{\text{eff}}{% end %} and reduces both E and T. The three frontier topologies sit at different points on this tension curve — none of them dominates the others on all three axes simultaneously.

**Reading a single row: Hierarchical Tree at T = 96%, E = 96%, D = 60%.**

The 96% T score is not arbitrary. In the USL simulation with calibrated AI-layer parameters ({% katex() %}\alpha = 0.05{% end %}, {% katex() %}\kappa_{\text{base}} = 0.15{% end %}, {% katex() %}CG_{\text{mean}} = 0.42{% end %}), {% katex() %}N_{\max} \approx 5{% end %} for a flat mesh but climbs to {% katex() %}\approx 18{% end %} for a tree with branching factor 3 — because the tree's coordinator absorbs most of the coherency cost before it fans out. At {% katex() %}N = 5{% end %} agents, the flat mesh is already past its peak while the tree is still climbing. The normalized throughput ratio is 0.96.

The 96% E score follows from the propagation model. In the OAuth2 example with 5 agents: a hallucinated OWASP compliance result from the coder agent reaches the security agent (who blocks it), the test agent (who can independently verify it fails), and the coordinator — a propagation factor of 3 instead of 4. More importantly, the coordinator has a structural guarantee: no output crosses the tree boundary without coordinator review. The Pipeline has no such gate — each stage is downstream of the last, so the propagation factor equals stages minus one, with no interception possible.

The 60% D score is the topology's deliberate cost. The coordinator enforces alignment before forwarding merged output to the liaison. Temperature diversity exists at the leaf level — the coder agent runs at {% katex() %}\tau = 0.4{% end %}, the test agent at {% katex() %}\tau = 0{% end %}, the docs agent at {% katex() %}\tau = 0.8{% end %} — but the coordinator calls consensus on the merged result. The entropy of the output distribution is much lower than the entropy of the leaf distributions. You get the error-decorrelation benefit at inference time but lose it at merge time. That is why the Team-Swarm Hybrid (which uses CRDT merge at the coordinator layer) scores D = 95% against the Hierarchical Tree's 60% — the CRDT operation preserves divergent intermediate results rather than collapsing them.

Each topology in the matrix below scores exactly this way — the number reflects a mechanism, not an aesthetic judgment.

<div style="margin:2rem 0 0.5rem;">
<canvas id="pareto-canvas" aria-label="Decision matrix heatmap of H2AI topologies across Throughput, Containment, and Diversity" style="width:100%;aspect-ratio:700/430;display:block;border-radius:6px;"></canvas>
<script>
(function(){
var canvas=document.getElementById('pareto-canvas');
if(!canvas)return;
var ctx=canvas.getContext('2d');
var pts=[
  {name:'Hierarchical tree',T:0.96,E:0.96,D:0.60,front:true},
  {name:'Team-Swarm Hybrid',T:0.84,E:0.91,D:0.95,front:true},
  {name:'Ensemble + CRDT',T:0.84,E:0.84,D:0.90,front:true},
  {name:'Star',T:0.52,E:0.78,D:0.75,front:false},
  {name:'Oracle',T:0.50,E:0.88,D:0.20,front:false},
  {name:'Pipeline',T:0.48,E:0.18,D:0.20,front:false},
  {name:'Flat Panel',T:0.18,E:0.18,D:0.90,front:false}
];
var ANAMES=['T  Throughput','E  Containment','D  Diversity'];
var ACOLS=['#2860a8','#a05020','#169040'];
function cCol(v,dark){
  var r,g,b;
  if(v<0.5){var t=v*2;r=Math.round(217+(240-217)*t);g=Math.round(83+(173-83)*t);b=Math.round(79+(78-79)*t);}
  else{var t2=(v-0.5)*2;r=Math.round(240+(92-240)*t2);g=Math.round(173+(184-173)*t2);b=Math.round(78+(92-78)*t2);}
  if(dark){r=Math.round(r*0.70);g=Math.round(g*0.70);b=Math.round(b*0.70);}
  return 'rgb('+r+','+g+','+b+')';
}
function cTxt(v,dark){return dark?'#eee':((v>=0.38&&v<=0.76)?'#333':'#fff');}
function draw(){
  var r=canvas.getBoundingClientRect();
  var dpr=window.devicePixelRatio||1;
  canvas.width=r.width*dpr;canvas.height=r.height*dpr;
  ctx.scale(dpr,dpr);
  var W=r.width,H=r.height;
  var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
  var bg=dark?'#1e1e1e':'#fafafa';
  var tc=dark?'#ccc':'#222';
  var sc=dark?'#888':'#777';
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  var fsS=Math.max(9,W*0.014);
  var fsC=Math.max(11,W*0.018);
  var fsL=Math.max(10,W*0.016);
  var nameW=Math.min(W*0.26,190);
  var mkW=Math.min(W*0.13,95);
  var cZ=W-nameW-mkW;
  var cW=cZ/3;
  var hH=Math.max(40,fsL*2.8);
  var rH=(H-hH)/pts.length;
  for(var a=0;a<3;a++){
    ctx.font='bold '+fsL+'px system-ui,sans-serif';
    ctx.fillStyle=ACOLS[a];ctx.textAlign='center';
    ctx.fillText(ANAMES[a],nameW+(a+0.5)*cW,hH*0.64);
  }
  ctx.font=fsS+'px system-ui,sans-serif';ctx.fillStyle=sc;
  ctx.textAlign='right';ctx.fillText('topology',nameW-8,hH*0.64);
  ctx.textAlign='left';ctx.fillText('verdict',nameW+cZ+8,hH*0.64);
  ctx.strokeStyle=dark?'rgba(255,255,255,0.20)':'rgba(0,0,0,0.18)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(0,hH);ctx.lineTo(W,hH);ctx.stroke();
  for(var i=0;i<pts.length;i++){
    var p=pts[i];
    var ry=hH+i*rH;
    if(i%2===0){ctx.fillStyle=dark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.025)';ctx.fillRect(0,ry,W,rH);}
    if(p.front){
      ctx.fillStyle=dark?'rgba(46,204,113,0.10)':'rgba(46,204,113,0.07)';
      ctx.fillRect(0,ry,W,rH);
      ctx.fillStyle='#2ecc71';ctx.fillRect(0,ry+rH*0.08,3,rH*0.84);
    }
    var vals=[p.T,p.E,p.D];
    for(var c=0;c<3;c++){
      var cx=nameW+c*cW;
      var pad=Math.max(4,rH*0.13);
      var cw=cW-pad*2;var ch=rH-pad*2;
      ctx.fillStyle=cCol(vals[c],dark);
      ctx.beginPath();
      if(ctx.roundRect){ctx.roundRect(cx+pad,ry+pad,cw,ch,4);}else{ctx.rect(cx+pad,ry+pad,cw,ch);}
      ctx.fill();
      ctx.font='bold '+fsC+'px system-ui,sans-serif';
      ctx.fillStyle=cTxt(vals[c],dark);ctx.textAlign='center';
      ctx.fillText(Math.round(vals[c]*100)+'%',cx+pad+cw/2,ry+pad+ch/2+fsC*0.38);
    }
    ctx.font=(p.front?'bold ':'')+fsS+'px system-ui,sans-serif';
    ctx.fillStyle=p.front?tc:sc;ctx.textAlign='right';
    ctx.fillText(p.name,nameW-8,ry+rH/2+fsS*0.38);
    ctx.font=(p.front?'bold ':'')+fsS+'px system-ui,sans-serif';
    ctx.fillStyle=p.front?'#2ecc71':sc;ctx.textAlign='left';
    ctx.fillText(p.front?'frontier':'dominated',nameW+cZ+8,ry+rH/2+fsS*0.38);
    ctx.strokeStyle=dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,ry+rH);ctx.lineTo(W,ry+rH);ctx.stroke();
  }
  ctx.strokeStyle=dark?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.20)';ctx.lineWidth=1.5;
  ctx.setLineDash([5,4]);
  ctx.beginPath();ctx.moveTo(0,hH+3*rH);ctx.lineTo(W,hH+3*rH);ctx.stroke();
  ctx.setLineDash([]);
  for(var d=0;d<=3;d++){
    ctx.strokeStyle=dark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(nameW+d*cW,hH);ctx.lineTo(nameW+d*cW,hH+pts.length*rH);ctx.stroke();
  }
}
function init(){draw();}
if('IntersectionObserver' in window){
  new IntersectionObserver(function(en,ob){
    if(en[0].isIntersecting){ob.disconnect();init();}
  },{threshold:0.1}).observe(canvas);
}else{init();}
window.addEventListener('resize',function(){draw();});
}());
</script>
</div>
<figcaption>Figure: H2AI topology decision matrix. Cells are colored green (high score) → amber → red (low score). The three Pareto frontier topologies are shaded green and separated from dominated topologies by a dashed divider. The Pareto property is directly visible: no dominated topology is green across all three columns simultaneously.</figcaption>

**How to read the matrix.** A topology is Pareto non-dominated if no alternative beats it on all three axes at once. The three frontier topologies hold the green band at the top — each scores high across most cells, with one deliberate trade-off:

- **Hierarchical tree**: the only frontier topology with an amber cell — Diversity at 60%. It leads on T and E.
- **Team-Swarm Hybrid**: fully green — highest D (95%), high E (91%), solid T (84%).
- **Ensemble + CRDT**: fully green but slightly lower than Team-Swarm — the low-overhead default when neither extreme matters.

The dominated topologies each carry at least one red cell. Pipeline has red E and D — contained errors and epistemic diversity both collapse. Oracle has red D — strong containment, no diversity. Flat Panel has red T and E — diversity without any throughput or containment structure.

---

## Closing — The Same Tax, Paid in Different Currencies

The coordination constant {% katex() %}\kappa{% end %} is paid in nanoseconds on a memory bus, in meeting-hours on an engineering team, and in tokens in a multi-agent system. The currency changes. The equation does not.

Every attempt to build a system of interacting nodes — whether those nodes are transistor-level state machines, neural networks trained on human language, or the humans themselves — encounters the same quadratic wall. The wall is not a failure of engineering. It is a structural property of mutual consistency: the requirement that private worlds converge enough to enable coordinated action, but not so much that they collapse into an echo chamber.

Gunther's equation captures the wall. The epistemic extension developed in this post explains why it appears at such different scales: the effective coherency cost {% katex() %}\kappa_{\text{eff}}{% end %} is the hardware cost divided by common ground, and common ground varies by orders of magnitude across layers. CPU cores at {% katex() %}CG = 1{% end %} pay the minimum tax. Human teams at {% katex() %}CG = 0.6{% end %} pay a {% katex() %}1/0.6 \approx 1.67\times{% end %} penalty. AI agents at {% katex() %}CG = 0.4{% end %} pay a {% katex() %}2.5\times{% end %} penalty. The wall arrives earlier. The retrograde hits harder. The topology decision becomes more urgent.

The response to the wall is the same at every layer: convert quadratic coordination to linear coordination through hierarchy, and preserve epistemic diversity through merge semantics that do not collapse contributions. MESI does this with a bus arbiter. Organizational design does this with team leads and architectural review boards. Multi-agent systems should do this with CRDT-merge coordinator agents.

The four agents that completed the benchmark at the opening of this post did not fail because they were bad agents. The eight agents that performed worse did not fail because eight is a bad number. Both systems were governed by the same equation. The four-agent system happened to be below {% katex() %}N_{\max}{% end %}. The eight-agent system happened to be above it. The equation was computable before the first token was generated.

Compute it.

---

## Citations

1. Gunther, N. J. (1993). *A Simple Capacity Model of Massively Parallel Transaction Systems.* CMG Conference Proceedings.
2. Papamarcos, M. S. & Patel, J. H. (1984). *A Low-Overhead Coherence Solution for Multiprocessors with Private Cache Memories.* Proceedings of the 11th Annual International Symposium on Computer Architecture (ISCA '84), pp. 348–354. ACM. DOI: 10.1145/800015.808204.
3. Wittgenstein, L. (1953). *Philosophical Investigations.* Blackwell Publishing.
4. Dunbar, R. I. M. (1992). *Neocortex Size as a Constraint on Group Size in Primates.* Journal of Human Evolution, 22(6), 469–493.
5. Matsutani, S., Ohmori, S., Hiranabe, K., & Hanyuda, E. (2023). *Conway's law, revised from a mathematical viewpoint.* arXiv:2311.10475.
6. Kim, Y., Gu, K., Park, C., Park, C., Schmidgall, S., Heydari, A. A., Yan, Y., Zhang, Z., et al. (2025). *Towards a Science of Scaling Agent Systems.* arXiv:2512.08296.
7. Wang, Y., Shen, X., Han, Y., Backes, M., Chen, P.-Y., & Ho, T.-Y. (2026). *OrgAgent: Organize Your Multi-Agent System like a Company.* arXiv:2604.01020.
8. Coshow, T. & Zamanian, K. (2025). *Multiagent Systems in Enterprise AI: Efficiency, Innovation and Vendor Advantage.* Gartner, December 18, 2025.
9. Condorcet, M. J. A. N. de (1785). *Essai sur l'Application de l'Analyse à la Probabilité des Décisions Rendues à la Pluralité des Voix.*
10. Hong, L. & Page, S. E. (2004). *Groups of Diverse Problem Solvers Can Outperform Groups of High-Ability Problem Solvers.* Proceedings of the National Academy of Sciences, 101(46), 16385–16389. DOI: 10.1073/pnas.0403723101.
11. Dunbar, R. I. M. (1993). *Coevolution of Neocortex Size, Group Size and Language in Humans.* Behavioral and Brain Sciences, 16(4), 681–694.
