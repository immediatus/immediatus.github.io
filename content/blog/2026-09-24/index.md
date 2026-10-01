+++
authors = ["Yuriy Polyulya"]
title = "Safe in Probability, Not in Size"
description = "A permanent probe needs a boundary a reviewer can approve once. This post builds it as a discrete-time stochastic control barrier function, then names its gap: bounding how often a system leaves its safe region says nothing about how far it goes. Under a heavy tail, the worst case can run four orders of magnitude past what the reviewer signed."
date = 2026-09-24
slug = "cost-of-knowing-part3-safe-in-probability-not-in-size"
draft = false

[taxonomies]
tags = ["distributed-systems", "control-theory", "systems-thinking", "queueing-theory"]
series = ["cost-of-knowing"]

[extra]
toc = false
series_order = 3
series_title = "The Cost of Knowing: Dual Control, Bounded Probing, and the Limits of Forward Simulation"
series_description = """<div class="series-lede">Every simulation answers one question and raises three new ones.</div>A simulator validated against history has never once been wrong about the past, which is why its clean result is so easy to mistake for evidence. This series asks when to stop simulating and start learning from live operation. Each part prices one step: what refusing to explore really costs, how a controller can measure while it operates, what a safety boundary has to bound, and the point where one more simulation costs more than it can teach. Every part ends by naming the condition under which its own recommendation reverses. An architecture is only as honest as the failure condition it names."""
+++

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) ended with a design, not a resolution. The platform team's admission-control layer no longer sits still and trusts history, and it no longer burns a two-week canary window hoping to catch the one regime it already suspects. It runs Cyclic Adaptive Regulation: a control action that treats its ordinary operation as a continuous measurement. It cycles between regulating and probing the way TCP BBR has been doing at internet scale since 2016. Proposition 2 said this is mathematically necessary. It said nothing about who signs off on it.

That silence has a name and an owner, stated explicitly at the time. A policy with no scheduled end is a fundamentally different kind of thing to ask an organization to approve than a two-week experiment with a rollback trigger. A reviewer can read a bounded proposal in ten minutes. A standing, perpetual probe has no such shape, because it is never done being reviewed. Loss aversion sharpens the asymmetry further: the reviewer is not miscalculating the statistics. They are weighing an open-ended downside against a bounded one, and the open-ended one loses every time, regardless of which one the expected-value arithmetic actually favors.

This post is the answer to that specific, named gap. Not a bigger probe, and not a better argument for why the probe is safe. It is a boundary a reviewer approves once, the way you approve a building code rather than every renovation built to it. That boundary makes the probe's safety a property of its construction rather than a promise resting on trust. This series has not once let its apparatus pass a validation check for free, so this post asks the harder question of the boundary itself: bounded how, and bounded against what.

<div class="recap-box">
<span class="recap-label">Argument so far</span>
<ul>
<li><strong><a href="/blog/cost-of-knowing-part1-the-simulation-singularity/">The Simulation Singularity</a>'s Proposition 1.</strong> Refusing to explore an unknown environment does not eliminate the cost of not knowing it. It compounds silently until an incident collects the bill.</li>
<li><strong><a href="/blog/cost-of-knowing-part2-dual-control-and-the-weaponized-probe/">Dual Control and the Weaponized Probe</a>'s Proposition 2.</strong> A control action under uncertainty is mathematically forced to regulate and explore at once, the dual effect. Cyclic Adaptive Regulation makes that continuous instead of scheduled, borrowing the shape TCP BBR already runs at internet scale.</li>
<li><strong>The gap that post left open.</strong> A perpetual probe with no scheduled end is not a proposal a reviewer can bound and sign off on the way a two-week experiment is. This post builds the boundary that makes it one.</li>
</ul>
</div>

**Notation used in this post.** Where:

- {% katex() %}h{% end %} and {% katex() %}\mathcal{C}{% end %} are Definition 3's barrier function and the safe region its sign defines
- {% katex() %}\epsilon{% end %} is Definition 3's probability tolerance for ever leaving {% katex() %}\mathcal{C}{% end %}
- {% katex() %}T{% end %} is Definition 3's decision horizon
- Pareto {% katex() %}\alpha{% end %} is the tail-weight parameter in the severity table
- {% katex() %}\eta{% end %} is Corollary 2's CVaR tail fraction, and {% katex() %}\rho{% end %} is the maximum tolerable severity within that tail, chosen independently of {% katex() %}\epsilon{% end %}
- Gunther's USL {% katex() %}\sigma{% end %} and {% katex() %}\kappa{% end %} price ordinary contention and the coherency penalty; {% katex() %}\sigma{% end %} is near zero for this post's executors
- {% katex() %}s{% end %} is one executor's comfortable-load rate, {% katex() %}C{% end %} the comfortable concurrency, and {% katex() %}P{% end %} the executor pool size, 8
- {% katex() %}m_{\text{tot}}{% end %} is the fixed control-authority budget Corollary 3's frontier splits
- {% katex() %}M{% end %} is the fleet size in "From Two Controllers to a Fleet" and Proposition 4, the number of controllers simultaneously facing the coordination-signal outage

[The Trigger to Stop Simulating](@/blog/2026-09-27/index.md) later uses {% katex() %}\sigma{% end %} for a real-options value process's volatility, a different quantity from this post's USL contention parameter of the same name.

## Why a Rulebook Cannot Do This Job

Picture the obvious alternative first. It is the one most organizations reach for, and seeing why it fails is most of the work of seeing why a control barrier function is the right shape for the job.

A rulebook approach writes down conditions by hand. Do not let the queue exceed 80 percent. Do not probe if downstream health has dropped in the last minute. Roll back if the retry rate crosses a threshold. Each rule, read alone, sounds reasonable. Taken together, they share a defect this series keeps finding under different names. A rulebook is congruent with whatever the engineer who wrote it happened to imagine going wrong. It enumerates the failure modes someone already thought of. It has no structural reason to cover the ones nobody did. The platform team's postmortem, back in [The Simulation Singularity](@/blog/2026-09-13/index.md), was already proof of the pattern: the failure modes worth worrying about are disproportionately the ones nobody thought to write a rule for.

A control barrier function is a different kind of object. Instead of enumerating bad states, it defines a function of the system's state whose sign says whether the system is currently inside a declared safe region. It constrains the control action, at every single decision, to keep that function from crossing zero. The rule is to stay inside a declared region, however many ways there turn out to be of leaving it, not a fixed list of things to avoid. That shift, from listing failure modes to bounding a region, is the entire reason this approach can be reviewed once instead of forever. A reviewer does not have to imagine every way the system could misbehave. They only have to check that the region itself is the right one, and that the barrier genuinely keeps the system inside it.

Whether it actually does that is not a question to take on faith. The rest of this post spends its effort on how much that promise is worth, and where it runs out.

This system is 8 concurrent executors pulling from a shared backlog and calling a downstream dependency directly, with a comfortable concurrency of 4. Two separate rules govern how fast it clears work, and each sounds reasonable in isolation. Downstream health scales every executor's clearing rate directly: a degraded dependency slows every request in flight, not only the newest one. Past the comfortable concurrency, contention does the same thing for a different reason, the cost any shared, contended resource exacts once more than a few workers draw on it at once: lock contention, connection-pool pressure, memory pressure. {{ layer(n=3, type="Estimate", id="model-that-degradation-the-sam") }}Model that second effect the way this post's reference model does, a per-executor rate proportional to {% katex() %}(C/n)^2{% end %} once {% katex() %}n{% end %} concurrent requests exceed {% katex() %}C{% end %}. The joint, worst-case throughput at full saturation, all 8 executors busy, has an exact closed form:

{% katex(block=true) %}
\text{Rate}_{\max} = P \cdot s \cdot \left(\frac{C}{P}\right)^2 = \frac{s C^2}{P}
{% end %}

where:

- {% katex() %}s{% end %} is one executor's comfortable-load rate
- {% katex() %}C{% end %} is the comfortable concurrency
- {% katex() %}P{% end %} is the executor pool size

With this model's numbers, {% katex() %}s=37.5{% end %}, {% katex() %}C=4{% end %}, {% katex() %}P=8{% end %}, that ceiling is exactly 75 requests per second, verified directly against this post's reference model, not asserted. Nothing in the system is broken to produce it. Every rule fired as designed. Health-scaled clearing and contention-scaled clearing are each, on their own, an ordinary and defensible modeling choice. Composed, they produce a real threshold neither rule alone predicts, which is the entire reason a rulebook approach cannot be trusted to catch it in advance.

<details>
<summary>Deeper: the 1/N shape is not an arbitrary choice. Gunther's USL forces a 1/N tail for any coherency-dominated system.</summary>

{{ layer(n=1, type="Bound", id="the-1-n-tail-this-models-own") }}The 1/N tail this model's numbers show is not a power chosen to fit the data after the fact. Gunther's Universal Scalability Law prices exactly this class of system: throughput as a function of concurrency {% katex() %}n{% end %}, {% katex() %}X(n) = \gamma n / (1 + \sigma(n-1) + \kappa n(n-1)){% end %}. Here {% katex() %}\sigma{% end %} prices ordinary queueing contention and {% katex() %}\kappa{% end %} prices a coherency penalty, the cost of cross-talk between concurrently active workers that grows with every additional pair of them{{ cite(ref="1", title="Gunther, N.J. (2008) -- A General Theory of Computational Scalability Based on Rational Functions, arXiv:0808.1431") }}. A system where contention is negligible next to the coherency cost, {% katex() %}\sigma \approx 0{% end %}, the case this model's executors are in, degrades to {% katex() %}X(n) = \gamma n / (1 + \kappa n(n-1)){% end %}. For large {% katex() %}n{% end %} the {% katex() %}\kappa n^2{% end %} term dominates the denominator, forcing {% katex() %}X(n) \to \gamma / (\kappa n){% end %}. Throughput falling as 1/N is not this model's invention. It is the structural signature any bounded-capacity system with a genuine coherency penalty, and negligible contention, is required to show, regardless of its specific numbers.

{{ layer(n=3, type="Estimate", id="what-usl-does-not-do-is-repr") }}What USL does not do is reproduce this post's piecewise {% katex() %}(C/n)^2{% end %} formula at every {% katex() %}n{% end %}. The two curves share only the same asymptotic tail; they are not the same function. USL degrades smoothly starting at {% katex() %}n=1{% end %}, where this model holds a full, undegraded rate up to {% katex() %}C{% end %} and only bends past it, a modeling simplification of its own. A {% katex() %}\sigma \approx 0{% end %} USL curve can be fit two ways, both stated exactly rather than left as "a fit". First, {% katex() %}\gamma = 37.5{% end %}, matching this model's comfortable-load rate at {% katex() %}n=1{% end %}. Second, {% katex() %}\kappa = 1/C^2 = 0.0625{% end %}, chosen so USL's peak-throughput concurrency, {% katex() %}\sqrt{1/\kappa}{% end %} in the {% katex() %}\sigma=0{% end %} case, lands on this model's comfortable concurrency {% katex() %}C=4{% end %}. That is the concurrency past which this model's degradation starts. At {% katex() %}n=8{% end %}, the concurrency this post's reference model actually runs, that curve gives roughly 67 requests per second, not the 75 this post derives and verifies directly against its code. The 75 figure stays what it already was: this post's reference model's result, checked against its code, not re-derived from Gunther's formula. What the formula licenses is narrower and still real. The shape of the collapse, decay as 1/N rather than some other exponent, is required of any coherency-dominated system in general. It is not a curve chosen because it happened to fit this one running case.

</details>

### Naming the Shape: Metastability, Not an Invented Trap

{{ layer(n=2, type="Fit", id="metastable-fit") }}This section has called the queue's stuck state "METASTABLE" since its first draft, and the mechanism above earns that word rather than merely asserting it. A metastable state, in the dynamical-systems sense, is a state whose relaxation time back to the one true equilibrium is anomalously long, not a second, permanent trap sitting next to it. Below the derived ceiling, there is a single fixed point, approached ever more slowly as traffic nears it, the same qualitative signature physics calls critical slowing down near a bifurcation. At or above the ceiling, the system gains a second, permanent state, genuine bistability rather than metastability, because it is the joint throughput ceiling itself that traffic now exceeds.

### Why Rejecting Early Is Not Merely a Good Idea, It Is the Coordinated Equilibrium

{{ layer(n=1, type="Bound", id="name-the-shape-of-the") }}The no-rejection baseline already has a name in game theory. Eight executors independently pull from the same backlog, each accepting a job whenever one is available with no regard for how many others are already busy. That is a textbook congestion game: each player's payoff, an executor's completion rate, depends on how many others are simultaneously using the same shared, contended resource{{ cite(ref="2", title="Rosenthal, R.W. (1973) -- A class of games possessing pure-strategy Nash equilibria, International Journal of Game Theory, 2, 65-67") }}.

The uncoordinated equilibrium, every idle executor pulling the instant a job is available, is not the socially optimal outcome. An executor that pulls an eighth job while seven others already contend for downstream lowers everyone's completion rate, an externality its decision never has to price. The gap between that equilibrium and the coordinated optimum has a name and a literature: the price of anarchy{{ cite(ref="3", title="Roughgarden, T. & Tardos, E. (2002) -- How bad is selfish routing?, Journal of the ACM, 49(2), 236-259") }}. {{ layer(n=3, type="Estimate", id="measured-directly-against-this") }}In this post's reference model, just past the ceiling, the uncoordinated baseline carries about a quarter more backlog-time, 24.7 percent, than the same schedule run with proactive rejection engaged. Proactive rejection is the policy a congestion game's players would adopt if they could bind themselves to a joint strategy instead of each pulling independently.

Rejecting early helps here, rather than simply losing work, for a reason that separates this model from an ordinary buffer. Standard queueing theory says a bigger buffer only ever helps or is neutral to long-run throughput, an argument that assumes the server's rate is fixed, independent of how many requests are waiting on it. This model's clearing rate is instead coupled to the queue's own occupancy, a stand-in for a shared, contended resource: connection or thread-pool exhaustion, memory pressure, duplicate retries consuming downstream capacity while their originals also wait. A deeper queue makes the server itself slower for every request already in it, not only the newest arrival. Admitting one more request when the queue is already deep spends a little of everyone else's clearing capacity on a request with a materially worse chance of clearing anyway. Reject it early instead and every other request already waiting clears faster. Remove the coupling and the argument removes itself along with it: with a decoupled server, shedding that same request would have been pure loss. The Model Scope table below states this condition explicitly.

Six disciplines carry the argument from here:

- **Control theory** for the barrier itself, the formal object that turns a probability-of-exit guarantee into something a reviewer approves once
- **Risk and decision theory** for the separate gap between bounding how often the barrier is crossed and bounding how badly, and the worst-case CVaR construction that closes it
- **Distributed systems engineering** for the actuator-inversion failure mode, the organizational precedent for bounded experiments, and the two impossibility results that say why a lost coordination signal forces a genuine choice rather than a compromise
- **Game theory** for naming the uncoordinated baseline as a congestion game and pricing what coordination actually buys, down to a fleet's exact tipping point
- **Cybernetics and verification theory** for naming why a probability-only barrier is a real improvement on a rulebook and still a form of congruence in the one dimension it was never built to watch
- **Practitioner systems literature** for weighing this post's barrier honestly against real, deployed admission-control systems that already solve problems it does not

The Ledger near the end of this post names all six again, with the specific sections each one grounds.

## The Formal Apparatus

<span id="def-3"></span>

<details>
<summary>Definition 3 -- Discrete-Time Stochastic Control Barrier Function: a probability bound on ever leaving a declared safe region</summary>

**Definition 3** (Discrete-Time Stochastic Control Barrier Function). Let {% term(url="", def="h: a function of the system's state, chosen so its sign reads directly off a quantity an operator already tracks, in this series' running case, queue occupancy relative to a declared capacity.") %}{% katex() %}h : X \to \mathbb{R}{% end %}{% end %} be a function of the system's state whose zero-superlevel set {% term(url="", def="C (script C): the declared safe region itself, the set of states where h(x) has not yet gone negative.") %}{% katex() %}\mathcal{C} = \{x : h(x) \geq 0\}{% end %}{% end %} defines a declared safe region. A control policy is a valid discrete-time stochastic control barrier function if, for a stated {% term(url="", def="epsilon: the stated, reviewable tolerance for ever leaving the safe region within the horizon, the number a reviewer signs off on once.") %}{% katex() %}\epsilon \in (0,1){% end %}{% end %} and a finite horizon {% term(url="", def="T: the decision horizon the bound is stated over, not an asymptotic limit as T goes to infinity.") %}{% katex() %}T{% end %}{% end %}, the closed-loop trajectory {% katex() %}x(t){% end %} satisfies

{% katex(block=true) %}
\Pr\big[\exists\, t \leq T : x(t) \notin \mathcal{C} \;\big|\; x(0) \in \mathcal{C}\big] \leq \epsilon
{% end %}

where:

- {% katex() %}h(x){% end %} is chosen so its sign reads directly off a quantity an operator already tracks, queue occupancy relative to a declared capacity, in this series' running case, rather than an abstract quantity requiring its translation layer
- {% katex() %}\epsilon{% end %} is the stated, reviewable tolerance for ever leaving the safe region within the horizon, the number a reviewer actually signs off on, once, rather than trusting a probe's good behavior indefinitely
- the bound is on a decision horizon {% katex() %}T{% end %}, not asymptotically as {% katex() %}T \to \infty{% end %}; a longer horizon, all else equal, only ever loosens what a fixed per-step safety margin can guarantee over it, a point the Model Scope table below returns to directly

</details>

Cosner, Culbertson, and Ames give this bound its sharpest known form for discrete-time systems by way of Freedman's inequality rather than the cruder worst-case bounds the barrier-function literature had relied on before{{ cite(ref="4", title="Cosner, R.K., Culbertson, P. & Ames, A.D. (2024) -- Bounding Stochastic Safety: Leveraging Freedman's Inequality with Discrete-Time Control Barrier Functions, IEEE Control Systems Letters, 8, 1937-1942") }}.

{{ layer(n=1, type="Bound", id="their-result-does-not-require") }}Their result does not require {% katex() %}h{% end %} to be bounded above. That matters directly for the running case. Queue occupancy has a hard ceiling, but the *signed distance* a barrier function uses to express "how safe" a state currently is does not need one. Forcing an artificial upper bound onto it, just to satisfy an older proof technique, would have thrown away useful structure for no safety benefit. Freedman's inequality adapts the bound to the actual variance of the disturbance process the barrier is fighting. A distribution-agnostic bound like Ville's inequality has to assume the worst case instead. That difference is what makes the resulting probability bound genuinely tighter, beyond being differently derived.

The word "tighter" is doing real work in that sentence, and it deserves unpacking rather than standing in for a specific mathematical claim left unchecked. Freedman's inequality is a martingale-valued generalization of Bernstein's inequality. It is the same family of results [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) leaned on implicitly when it distinguished a naive sample mean from a robust estimator under heavy tails.

A Hoeffding-style bound treats every step of a martingale as though it could swing across its full possible range, worst case, on every step. It charges that penalty regardless of how calm the process has actually been so far. A Bernstein-style bound, and Freedman's inequality specifically, accumulates the *actual observed conditional variance* of the process step by step instead. It pays the worst-case-range penalty only for the *tail* of that accumulated variance, not for the whole horizon up front. A downstream dependency that has been quiet for the last several hundred decisions has already spent down most of what a Hoeffding-style bound would have charged it for merely existing. The barrier's admission decisions can be less conservative as a direct, earned consequence, not a hopeful one.

This is the same shape of gain [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) found in replacing a plain sample mean with a median-of-means estimator under heavy tails. The naive approach prices the worst thing that could happen at every step. The sharper approach prices what has actually been happening, and only falls back to the worst case once the accumulated evidence runs out.

<span id="prop-3"></span>

**Proposition 3** (High-Probability Safety Filtration). Given a nominal, unconstrained controller optimizing for whatever objective the admission-control layer already has, a valid discrete-time stochastic control barrier function filters its proposed actions at every decision, modifying them only enough to keep Definition 3's probability bound satisfied, and no more. Formally, the filter is a function {% term(url="", def="X: the state space, the set of every value the system's current state can take. A: the action space, the set of every action a controller can propose or a filter can output.") %}{% katex() %}F: X \times A \to A{% end %}{% end %}, mapping the system's current state and the nominal controller's proposed action to the action actually taken:

{% katex(block=true) %}
F(x, a_{\text{nom}}) = \arg\min_{a \in A} \; \lVert a - a_{\text{nom}} \rVert \quad \text{s.t.} \quad \Pr\big[h(x_{t+1}) \geq 0 \mid x, a\big] \geq 1 - \epsilon
{% end %}

The per-step QP that Definition 3 and this proposition describe in prose is nothing more than one way of computing this function; {% term(url="", def="the claim that F's signature is the entire boundary, independent of which algorithm computes it, is what makes it an interface rather than only an implementation.") %}the signature is the interface{% end %}, not the solver.

- {{ layer(n=1, type="Bound", id="clark-established-the-general") }}Clark established the general framework for constructing control barrier functions under stochastic (Gaussian process and measurement) noise, including a reciprocal-barrier-function construction proven safe with probability one under stated conditions{{ cite(ref="5", title="Clark, A. (2021) -- Control barrier functions for stochastic systems, Automatica, 130, 109688") }}. **A specific caveat belongs here, not in a footnote.** The same 2021 paper's separate zero-control-barrier-function (ZCBF) theorem, claiming almost-sure safety by a different proof technique, was later shown to be false. So, Clark, and Fan exhibit an explicit counterexample, an uncontrolled one-dimensional Brownian motion for which the ZCBF theorem's claim cannot hold{{ cite(ref="6", title="So, O., Clark, A. & Fan, C. (2023) -- Almost-Sure Safety Guarantees of Stochastic Zero-Control Barrier Functions Do Not Hold, arXiv:2312.02430") }}. The flaw sits in that proof technique specifically, not in the reciprocal-barrier-function result this post actually leans on. They also derive a corrected, modified ZCBF condition that does hold. Two things are worth separating here, because conflating them would be the kind of unverified paraphrase this series has already been burned by once this month: the flawed claim was for *almost-sure* safety, probability exactly one, {% katex() %}\epsilon = 0{% end %}. Definition 3's claim is for a *stated, generally nonzero* {% katex() %}\epsilon{% end %}, a strictly weaker and different guarantee that the 2023 correction does not touch one way or the other. This post uses Clark's reciprocal-barrier-function framework and the Freedman's-inequality result built on top of it, not the corrected paper's subject.
- {{ layer(n=1, type="Bound", id="modifying-them-only-enough-has") }}"Modifying them only enough" has an exact mathematical form, not a hand-wave. Ames, Xu, Grizzle, and Tabuada unified two things: a control barrier function's safety constraint, and a control Lyapunov function's performance objective{{ cite(ref="7", title="Ames, A.D., Xu, X., Grizzle, J.W. & Tabuada, P. (2016-17) -- Control Barrier Function Based Quadratic Programs for Safety Critical Systems, IEEE Transactions on Automatic Control, DOI 10.1109/TAC.2016.2638961, arXiv:1609.06408") }}. Both fit inside one per-step quadratic program. The program minimizes deviation from whatever action the nominal controller would have taken. The barrier constraint is the one requirement it must hold. Proposition 3's filter is this CBF-CLF-QP construction, applied to admission control. The nominal controller proposes an accept, throttle, or reject decision; that proposal plays the role of the unconstrained CLF-optimal action. The filter's entire job is to find the closest action, in whatever metric the QP uses, that keeps {% katex() %}h(x){% end %} from crossing zero. "Closest" is the literal objective the quadratic program minimizes, not a figure of speech here. That is what makes "modifying them only enough" a provable property of the filter's construction, not an intention behind it.
- {{ layer(n=2, type="Fit", id="a-safety-filter-of-this") }}A safety filter of this kind, applied specifically to an admission-control layer's accept/throttle/reject decision rather than to a robotic or vehicular actuator, the more common setting in this literature, is this post's synthesis, without a direct precedent to cite for that exact application. This should be said plainly, rather than let the citations above imply someone has already proven this for a shadow-routing queue. The architecture itself, a learned or otherwise unconstrained policy wrapped by a barrier-function safety filter, is not new; it is the standard shape of safe reinforcement learning, and "What This Buys Over Deployed Overload Control" below both credits that lineage and states what a production overload-control system already has that this post's barrier does not.
- {{ layer(n=3, type="Estimate", id="at-production-request-rates-so") }}At production request rates, solving a fresh quadratic program at every decision is not free. An admission-control layer making thousands of decisions per second cannot always afford one. Mestres and six coauthors solve this with a resource-aware implementation{{ cite(ref="8", title="Mestres, P., Mousavi, S.S., Ong, P., Yang, L., Das, E., Burdick, J.W. & Ames, A.D. (2025) -- Explicit Control Barrier Function-based Safety Filters and their Resource-Aware Computation, arXiv:2512.10118") }}. It partitions the state space in advance. Each region gets one closed-form solution, reused until the state crosses into a different region. The online solve only runs again at that boundary. Whether this platform's state space is simple enough for that closed-form approach, or complex enough to need the full online solve, is an engineering question this post flags rather than answers.
- {{ layer(n=1, type="Bound", id="state-what-this-buys-a") }}{% katex() %}F{% end %}'s signature buys a systems architect something too, not only a control theorist. {% katex() %}F: X \times A \to A{% end %} names a genuine interface boundary, not only a mathematical one: a regulator producing {% katex() %}a_{\text{nom}}{% end %} and a downstream admission mechanism consuming {% katex() %}F{% end %}'s output can be built, tested, and reasoned about entirely separately, as long as both agree on {% katex() %}F{% end %}'s domain and codomain, the same separation of concerns this series already argued for by subsystem rather than by time. What the signature does not specify, by design, is which runtime enforces it or how {% katex() %}X{% end %} and {% katex() %}A{% end %} are represented in a given language; a function signature is the kind of object that stays silent on those choices, not a gap in the definition.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    A["Nominal controller proposes an action<br/>whatever Cyclic Adaptive Regulation<br/>currently wants to do"]:::term
    B["QP checks: does this action<br/>keep h(x) >= 0?"]:::term
    C["Passes through unchanged<br/>no correction needed"]:::term
    D["QP finds the closest action<br/>that keeps h(x) >= 0"]:::term
    E["State updates<br/>one decision later"]:::term
    A --> B
    B -->|"yes"| C --> E
    B -->|"no"| D --> E
    E --> B
{% end %}

<figcaption>Figure 1: Proposition 3's filter has no exit state, the same shape the ProbeBW-cycle diagram in [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) already showed. It does not run once at deployment and then step aside. It checks the barrier condition every single decision, for as long as the controller runs. That is what lets a reviewer approve the loop itself once, instead of re-approving every individual action that passes through it.</figcaption>

### What Proposition 3 Rules Out

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) said plainly what Proposition 2's intractability result did not claim, and Proposition 3 deserves the same treatment. It is not a claim that this filter makes the admission-control layer's underlying decisions optimal. The nominal, unconstrained controller Proposition 2 already built, the one running Cyclic Adaptive Regulation, keeps making whatever decisions it was already making. The filter's entire job is narrower and more mechanical: modify those decisions only when they would push the system outside {% katex() %}\mathcal{C}{% end %}, and modify them as little as possible even then. A bad nominal policy filtered this way is still a bad policy, just a safely bad one. Proposition 3 buys safety. It does not buy competence, and this post makes no claim that it does. That distinction matters enough to keep separate.

It is also not a claim that this filter is the only safety mechanism a real deployment needs. Netflix's account of automating chaos experiments in production describes the complementary role. It is a controlled, bounded fault-injection platform that checks whether a system tolerates degradation it was designed to tolerate, run continuously rather than once, with a human-approved blast radius{{ cite(ref="9", title="Basiri, A., Hochstein, L., Jones, N. & Tucker, H. (2019) -- Automating Chaos Experiments in Production, ICSE-SEIP 2019, arXiv:1905.04648") }}. A discrete-time stochastic control barrier function is the innermost layer of a defense-in-depth architecture, the one that acts automatically, at every decision, with no human in the loop. A chaos-engineering platform is an outer layer, exercised deliberately and reviewed explicitly, that catches whatever the inner layer's disturbance model was never calibrated to expect. Neither replaces the other. This post is about the inner layer only.

## This Model's Own Barrier, Stated Explicitly

Leaving the mapping between this model and Definition 3 for the reader to infer would be the move this series keeps calling out in other people's work, so here it is stated as a direct correspondence instead.

| Definition 3's object | This model's version of it |
|---|---|
| State {% katex() %}x(t){% end %} | Queue depth (0 to 200) and downstream health (0 to 100 percent) |
| Barrier function {% katex() %}h(x){% end %} | A signed distance from a declared occupancy ceiling, zero exactly at that ceiling |
| Safe region {% katex() %}\mathcal{C} = \{h \geq 0\}{% end %} | Queue occupancy at or below the declared ceiling; crossing it bounds the *chance* the queue gets deep, which is a different fact from whether it then drains, the exact probability-versus-magnitude gap "The Boundary Only Watches Probability" states below |
| A filtered action | Rejecting a growing share of arrivals as occupancy nears the ceiling, exactly "modifying actions only enough to keep the probability bound satisfied" from Proposition 3, made literal and computable rather than asserted |
| What the filter does *not* do | Fix downstream health, coordinate with any other service, or manufacture capacity downstream does not have: above the executor pool's joint ceiling, verified directly against this post's reference model, the filter keeps the queue bounded without being able to drain it, because rejection can only shed admitted demand, and no admission policy can clear more than the pool's own joint rate |

Return to this model once more with this table in hand. Every rule it encodes, health-scaled clearing, congestion-compounded clearing, retries re-entering as arrivals, was already justified on its own terms back in [The Simulation Singularity](@/blog/2026-09-13/index.md) and [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md). That last rule is doing more formal work than "retries happen" suggests. External arrival traffic is not the only source of arrivals once the composed rules above are running: a request that fails downstream and retries re-enters the same backlog as a new arrival. That is the partly-open construction [The Simulation Singularity](@/blog/2026-09-13/index.md) cited to explain why a load test built on a closed or purely open generator cannot manufacture a correlated-retry regime{{ cite(ref="10", title="Schroeder, B., Wierman, A. & Harchol-Balter, M. (2006) -- Open Versus Closed: A Cautionary Tale, NSDI '06: 3rd USENIX Symposium on Networked Systems Design and Implementation, 239-251") }}.

This model is a genuine instance of that construction in shape, beyond an analogy to it. Arrivals are open at the top, external traffic, and a request that fails downstream can re-enter the same backlog as a retry rather than simply leaving. That is the follow-up-request mechanism the partly-open model formalizes. This model's retry probability could be constant, the way Schroeder's {% katex() %}p{% end %} is, or it could rise as downstream health falls, the way [The Simulation Singularity](@/blog/2026-09-13/index.md)'s opening incident describes. Either way, it is not a distinction this post's worked ceiling above turns on. Retries re-entering as arrivals is what turns an ordinary bounded-concurrency queue into one capable of the runaway feedback loop this post's worked ceiling describes.

What a discrete-time stochastic control barrier function adds is a standing constraint that watches all of them at once and intervenes before their composition crosses a declared line, instead of after: not a new rule among these. The admission filter is that constraint made computable. Absent it, the composed rules above run away unfiltered. Engaging it makes the same composed rules stop mattering, not because they changed, but because something now sits upstream of all of them, watching the same state, correcting the one thing they never priced.

## Separating the Two Demands by Subsystem, Not by Time

[The Simulation Singularity](@/blog/2026-09-13/index.md) named a discipline for resolving an engineering trade-off by separation rather than compromise, borrowed from Genrich Altshuller's study of tens of thousands of patent records{{ cite(ref="11", title="Altshuller, G.S. (1984) -- Creativity as an Exact Science: The Theory of the Solution of Inventive Problems, Gordon and Breach") }}. It named three separating moves that discipline permits, without stating which, if any, this series would actually take. Validation scope, [The Simulation Singularity](@/blog/2026-09-13/index.md) argued, is asked to be two incompatible things at once: narrow, cheap, and shippable, and wide enough to cover regimes that have not yet occurred.

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) separated those demands in time: a regulator for six round trips, an explorer for one, a debtor paying down the explorer's cost for one, never asked to be both at the same instant. Separation by subsystem was the second of the three moves [The Simulation Singularity](@/blog/2026-09-13/index.md) left open. This post takes it, by subsystem. A policy layer stays free to be narrow and wrong while it learns, decoupled from a safety layer that cannot be wrong regardless of what the policy layer tries.

That separation buys something specific, worth stating outright, because this series has flagged more than once how easy it is to force a superficial resemblance into a claim of genuine sameness. This is not the same mechanism as [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s: its separation in time works because the same controller occupies both roles, sequentially, never both at once. Part 3's separation by subsystem works because *two different mechanisms* occupy the two roles *simultaneously*, one unconstrained and free to be wrong, one constrained and unable to be. Cyclic Adaptive Regulation, the nominal policy Proposition 2 built, is still free to probe, still free to be occasionally miscalibrated, still free to be as exploratory as [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) argued it must be. Definition 3's filter sits underneath it, watching the same state, correcting only the actions that would leave {% katex() %}\mathcal{C}{% end %}. It is indifferent to whether the policy's reasoning for proposing that action was sound.

That indifference is the entire source of the review-friction payoff [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) closed by naming. A reviewer approving Cyclic Adaptive Regulation directly has to trust every future decision that policy will ever make, including decisions under conditions nobody has anticipated yet. That is the standing, perpetual-review problem [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) identified and could not solve on its own terms. A reviewer approving Definition 3's barrier instead has to trust one fixed, checkable object: the safe region {% katex() %}\mathcal{C}{% end %}, the stated {% katex() %}\epsilon{% end %}, and, once Corollary 2 below adds it, a magnitude bound {% katex() %}\rho{% end %}. Once that object is approved, the policy layer underneath it can be replaced, retrained, or left to misbehave in ways nobody predicted. The review does not need to happen again, because the safety property was never a claim about the policy. It was always a claim about the boundary.

{{ layer(n=3, type="Estimate", id="this-framing-like-part-s") }}This carries the same retrospective-lens qualification [The Simulation Singularity](@/blog/2026-09-13/index.md) already stated in full. Nobody consulted Altshuller's method to invent control barrier functions. Naming it here only explains why separation by subsystem was one of the moves this series' opening framework left open.

## The Cycle Finds Drift, the Barrier Has to Watch the Cliff

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) drew a sharp distinction between what BBR-style persistent excitation actually identifies and what it does not. It identifies drift in a continuously-varying local parameter, not the discovery of a distant, discontinuous regime shift like the correlated-retry cascade this series opened with. That distinction carries over here, in a form specific to what a barrier function can certify.

Definition 3's safe region {% katex() %}\mathcal{C}{% end %} is calibrated against something: a model of the disturbance the barrier is defending against. In this running case, that means a model of how fast and how far downstream health can move, and how strongly the queue's occupancy compounds that movement.

{{ layer(n=2, type="Fit", id="a-barrier-calibrated-correctly") }}A barrier calibrated correctly against every disturbance the historical record has produced is not automatically calibrated against a disturbance the record has never produced, [The Simulation Singularity](@/blog/2026-09-13/index.md)'s modeling tax, recurring here at the safety layer instead of the validation layer. A control barrier function certifies safety relative to the disturbance class it was built to defend against, not relative to every disturbance a system could in principle face. Nothing about Definition 3's probability bound distinguishes a well-calibrated barrier from a badly-calibrated one facing a regime its calibration never covered. Both report a clean {% katex() %}\epsilon{% end %}-bound right up until the moment the uncovered regime actually arrives.

Leaving this unstated would let a probability-of-exit guarantee read as "safe against anything," and that reading is wrong. The guarantee is safe against the disturbance class the barrier's construction assumed, and a barrier's {% katex() %}\epsilon{% end %} says nothing at all about how good that assumption was. Recalibrating the barrier as the system's understanding of its disturbance evolves is the kind of thing Cyclic Adaptive Regulation was built to keep doing, not a one-time setup step. The barrier and the regulator it filters are not, in the end, two unrelated pieces of machinery: one needs to keep learning what the other one is defending against.

Reading this against [The Simulation Singularity](@/blog/2026-09-13/index.md)'s cybernetic parallel sharpens the shape further. Ashby's Law of Requisite Variety says a regulator cannot drive outcome variety below the gap between disturbance variety and the regulator's own variety{{ cite(ref="12", title="Ashby, W.R. (1956) -- An Introduction to Cybernetics, Chapman and Hall, Chapter 11") }}. That earlier post used it to explain why the platform team's original simulator had a residual, unmodeled variety it could never have covered, the same [The Simulation Singularity](@/blog/2026-09-13/index.md) already linked above.

A barrier's disturbance model is this kind of variety budget, stated for the safety layer instead of the forecasting layer. {% katex() %}\mathcal{C}{% end %} is drawn wide enough to absorb every disturbance the model accounts for. Whatever disturbance variety the model does not account for does not vanish just because a barrier is now watching. It reappears, unabsorbed, as the same kind of residual [The Simulation Singularity](@/blog/2026-09-13/index.md) counted in bits. The consequence of that residual showing up now is an excursion the barrier had no way to see coming, not a wrong forecast. It is certified safe at {% katex() %}\epsilon{% end %} right up until the moment it was not.

Calibrating a wider {% katex() %}\mathcal{C}{% end %} is the direct analogue of increasing a regulator's variety in Ashby's original accounting, and it faces the identical limit. Variety bought by widening the safe region is variety the barrier can actually absorb; variety past that width is variety no barrier, however well constructed, was ever going to catch.

## The Boundary Only Watches Probability

<div class="pull-quote">Bounding the probability of an excursion says nothing about the blast radius.</div>

Everything so far has bounded the *chance* of the queue ever crossing 85 percent. Nothing so far has said anything about *how bad* it is if the barrier's {% katex() %}\epsilon{% end %}-tail event actually happens. Those are different guarantees, and [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) already proved, in a different part of this same series, that the difference is not academic.

### Stating the Gap Precisely

Definition 3's bound is this: {% katex() %}\Pr[\text{exit}] \leq \epsilon{% end %}. It says nothing about {% katex() %}E[\text{cost} \mid \text{exit}]{% end %}, the expected severity of an excursion given that one occurs. It also says nothing about the worst excursion a heavy tail can actually produce. Under a light-tailed disturbance, where no single excursion can be arbitrarily bad, this omission costs little: bounding the chance of a bounded-cost event is most of what a decision-maker needs. Not so here: [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s severity problem showed the correlated-retry regime's severity is heavy-tailed, not light-tailed. A bounded number of observed occurrences systematically underestimates the true worst case, worse as the tail gets heavier. A probability-of-exit bound, sitting on top of a heavy-tailed severity distribution, certifies the wrong thing: how rarely the cliff is approached, never how far the fall actually goes once it is.

{{ layer(n=3, type="Estimate", id="make-the-gap-concrete-with") }}Make the gap concrete with a small numerical illustration, not a restatement of any cited theorem. Three admission-control designs are each certified, by construction, to leave their declared safe region with the same probability, 5 percent, the {% katex() %}\epsilon{% end %} a reviewer might reasonably approve. They differ only in how heavy-tailed the *severity* of an excursion is, once one occurs, modeled as a Pareto distribution with a fixed median so that a "typical" excursion looks the same size in all three:

<div class="illustrative">

| Tail weight | Mean excursion severity, given an excursion (multiple of median) | Worst excursion observed in 2,000,000 trials (multiple of median) |
|---|---|---|
| Moderate ({% katex() %}\alpha=3.0{% end %}, finite variance) | 1.2x | 202x |
| Heavy ({% katex() %}\alpha=1.5{% end %}, infinite variance) | 1.9x | 40,750x |
| Very heavy ({% katex() %}\alpha=1.1{% end %}, infinite variance) | 5.9x | 1,934,372x |

</div>

All three pass Definition 3's test identically: exactly a 5 percent chance of leaving the safe region, over however many trials a reviewer chooses to check. A control barrier function that only certifies {% katex() %}\epsilon{% end %} would sign off on all three the same way, because {% katex() %}\epsilon{% end %} is the only thing it measures. The worst excursion actually produced, across the same number of trials, differs by more than four orders of magnitude between the first design and the third. Whatever a reviewer thinks they are approving when they sign off on "5 percent chance of an excursion," the number in front of them does not distinguish the two cases. It looks identical whether a system's worst day is 202 times worse than typical, or nearly two million times worse than typical.

The figure below walks through that comparison in four steps on one sample of four hundred trials. A sample that small lands near 5 percent, not exactly on it. Its largest excursion is also far smaller than the table's, which had two million trials to find one.

<div style="margin:1.5em 0;">
<canvas id="chart-probability-not-size" aria-label="Three rows, one each for a design with a moderate tail, a heavy tail, and a very heavy tail. On the left of every row, a grid of four hundred sampled trials marks the ones that left the safe region; the marked trials are the same in all three rows, so the count is identical. On the right of every row, a horizontal bar on one shared linear scale shows how big the largest of those excursions was. Four steps change the view. Step one shows, in place of the size bar, an identical frequency bar in every row against the five percent bound, because a probability bound only counts how often. Step two reveals the sizes, which differ widely between the three systems. Step three tightens the probability bound from five percent to one percent, which removes excursions without regard to their size. Step four adds a magnitude bound that cuts every excursion off at ten times a typical one." style="width:100%; height:330px; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<div id="chart-probability-not-size-steps" style="display:flex; flex-wrap:wrap; gap:0.5em; align-items:center; justify-content:center; margin-top:0.75em; font-size:0.85em;">
<button type="button" data-step="1">1. How often</button>
<button type="button" data-step="2">2. How big</button>
<button type="button" data-step="3">3. Allow 1% instead of 5%</button>
<button type="button" data-step="4">4. Cap the size at 10×</button>
<span aria-hidden="true" style="width:1px; height:1.8em; background:#b0bec5; margin:0 0.5em;"></span>
<button type="button" id="chart-probability-not-size-new" title="Draw another 400 trials">&#8635; New sample</button>
</div>
<p id="chart-probability-not-size-say" aria-live="polite" style="min-height:4.8em; margin:0.75em auto 0; max-width:42em; font-size:0.92em; text-align:center;"></p>
<script>
(function(){
var cv=document.getElementById('chart-probability-not-size');
if(!cv)return;
var ctx=cv.getContext('2d');
var say=document.getElementById('chart-probability-not-size-say');
var stepBox=document.getElementById('chart-probability-not-size-steps');
var stepBtns=stepBox.querySelectorAll('button[data-step]');
var btnNew=document.getElementById('chart-probability-not-size-new');
var N=400,GC=40,GR=10,BOUND=10,EPS_BASE=0.05,EPS_TIGHT=0.01;
var KEYS=['A','B','C'];
var ALPHA={A:3.0,B:1.5,C:1.1};
var NAME={A:'Moderate tail',B:'Heavy tail',C:'Very heavy tail'};
var W=0,H=0,narrow=false,labW0=130;
var seed=38,step=1,pairs=[],started=false,animating=false;
var cur={A:0,B:0,C:0,reveal:0};
var reduceMotion=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)').matches:false;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function sev(k,u){return Math.pow(2*u,-1/ALPHA[k]);}
function sample(){var r=mulberry32(seed);pairs=[];for(var i=0;i<N;i++){pairs.push([r(),r()]);}}
function eps(){return step===3?EPS_TIGHT:EPS_BASE;}
function worst(k,e){var m=0;for(var i=0;i<N;i++){if(pairs[i][0]<e){m=Math.max(m,sev(k,pairs[i][1]));}}return m;}
function count(e){var n=0;for(var i=0;i<N;i++){if(pairs[i][0]<e)n++;}return n;}
function scaleMax(){return Math.max(12,worst('A',EPS_BASE),worst('B',EPS_BASE),worst('C',EPS_BASE));}
function target(k){if(step===1)return 0;var w=worst(k,eps());return step===4?Math.min(w,BOUND):w;}
function fmt(v){return Math.round(v).toLocaleString('en-US')+'×';}
function fit(text,maxW,size,style){var s=size;ctx.font=style.replace('%',s);while(s>7&&ctx.measureText(text).width>maxW){s--;ctx.font=style.replace('%',s);}return s;}
function txt(t,x,y){ctx.fillText(t,Math.round(x),Math.round(y));}
function layout(){
var g={rows:[]};
if(narrow){
var gw=W-24,cell=gw/GC,gh=cell*GR,rowH=22+gh+8+54+14;
for(var i=0;i<3;i++){var y=Math.round(8+i*rowH);g.rows.push({lx:12,ly:y,gx:12,gy:y+22,sx:12,sy:y+22+gh+8,sw:W-24});}
g.cell=cell;g.head=0;g.h=8+3*rowH;
}else{
var labW=labW0,gw2=Math.min(W*0.38,300),cell2=gw2/GC,gh2=cell2*GR,rowH2=Math.max(92,gh2+30),head=30;
for(var j=0;j<3;j++){var y2=head+j*rowH2;g.rows.push({lx:14,ly:Math.round(y2+rowH2/2-16),gx:labW,gy:Math.round(y2+(rowH2-gh2)/2),sx:Math.round(labW+gw2+30),sy:Math.round(y2+(rowH2-54)/2),sw:Math.round(W-(labW+gw2+30)-18)});}
g.cell=cell2;g.head=head;g.h=head+3*rowH2+6;g.gx=labW;g.sx=Math.round(labW+gw2+30);
}
return g;
}
function setup(){
W=cv.clientWidth;
narrow=W<560;
H=Math.ceil(layout().h);
cv.style.height=H+'px';
if(cv.clientHeight&&cv.clientHeight!==H){cv.style.height=(2*H-cv.clientHeight)+'px';}
var dpr=window.devicePixelRatio||1;
cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
ctx.setTransform(cv.width/W,0,0,cv.height/H,0,0);
}
function drawGrid(r,cell){
var e=eps();
for(var i=0;i<N;i++){
var x=r.gx+(i%GC)*cell,y=r.gy+Math.floor(i/GC)*cell,u=pairs[i][0];
if(u<e){ctx.fillStyle='#263238';ctx.fillRect(x+0.8,y+0.8,cell-1.6,cell-1.6);}
else if(u<EPS_BASE){ctx.strokeStyle='#90a4ae';ctx.lineWidth=1;ctx.strokeRect(x+1.3,y+1.3,cell-2.6,cell-2.6);}
else{ctx.fillStyle='#d9dee1';ctx.beginPath();ctx.arc(x+cell/2,y+cell/2,Math.max(0.9,cell*0.17),0,6.2832);ctx.fill();}
}
}
function headline(big,rest,x,y,w){
ctx.textAlign='left';ctx.textBaseline='alphabetic';
ctx.fillStyle='#263238';ctx.font='bold 16px sans-serif';
txt(big,x,y+15);
var bw=ctx.measureText(big).width+7;
ctx.fillStyle='#607d8b';
fit(rest,w-bw,12,'%px sans-serif');
txt(rest,x+bw,y+15);
}
function drawSize(k,r,xmax){
var x0=r.sx,w=r.sw,ty=r.sy+24,th=16;
function X(v){return x0+Math.min(v/xmax,1)*w;}
if(cur.reveal<0.999){
ctx.save();ctx.globalAlpha=1-cur.reveal;
var n0=count(EPS_BASE),pct=n0/N*100;
function P(v){return x0+Math.min(v/10,1)*w;}
headline(pct.toFixed(1)+'%','of trials had an excursion',x0,r.sy,w);
ctx.fillStyle='#eceff1';ctx.fillRect(x0,ty,w,th);
ctx.fillStyle='#263238';ctx.fillRect(x0,ty,P(pct)-x0,th);
ctx.strokeStyle='#2e7d32';ctx.lineWidth=2;
ctx.beginPath();ctx.moveTo(P(5),ty-3);ctx.lineTo(P(5),ty+th+3);ctx.stroke();
ctx.fillStyle='#2e7d32';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
txt('allowed: 5%',P(5),ty+th+5);
ctx.restore();
}
if(cur.reveal<=0.001)return;
ctx.save();ctx.globalAlpha=cur.reveal;
var wBase=worst(k,EPS_BASE),len=cur[k],wNow=target(k),rest='the size of a typical excursion';
if(step===3)rest='largest remaining (was '+fmt(wBase)+')';
if(step===4)rest=wBase>BOUND?'capped (was '+fmt(wBase)+')':'already under the cap';
headline(fmt(wNow),rest,x0,r.sy,w);
if(step>=3&&wBase>len+0.05){ctx.fillStyle='#e3e8eb';ctx.fillRect(x0,ty,X(wBase)-x0,th);}
ctx.fillStyle='#263238';
ctx.fillRect(x0,ty,Math.max(2,X(len)-x0),th);
if(step===4){
ctx.strokeStyle='#c62828';ctx.lineWidth=2;
ctx.beginPath();ctx.moveTo(X(BOUND),ty-3);ctx.lineTo(X(BOUND),ty+th+3);ctx.stroke();
ctx.fillStyle='#c62828';ctx.font='11px sans-serif';ctx.textAlign='left';ctx.textBaseline='top';
txt('cap: 10×',X(BOUND)-2,ty+th+5);
}
ctx.restore();
}
function draw(){
if(!started)return;
ctx.clearRect(0,0,W,H);
var g=layout(),xmax=scaleMax(),n=count(eps());
if(!narrow){
ctx.fillStyle='#546e7a';ctx.textBaseline='top';ctx.textAlign='left';
fit('400 TRIALS  (dark square = excursion)',g.sx-g.gx-20,11,'bold %px sans-serif');
txt('400 TRIALS  (dark square = excursion)',g.gx,10);
var hr=step===1?'HOW OFTEN  (all the bound checks)':'HOW BIG  (never checked by the bound)';
fit(hr,W-g.sx-18,11,'bold %px sans-serif');
txt(hr,g.sx,10);
}
for(var i=0;i<3;i++){
var k=KEYS[i],r=g.rows[i];
ctx.textAlign='left';ctx.textBaseline='top';
ctx.fillStyle='#263238';
fit(NAME.C,narrow?W*0.5:labW0-18,14,'bold %px sans-serif');
txt(NAME[k],r.lx,r.ly);
ctx.fillStyle='#546e7a';ctx.font='11px sans-serif';
if(narrow){ctx.textAlign='right';txt(n+' excursions in 400 trials',W-12,r.ly+2);}
else{txt(n+' excursions',r.lx,r.ly+19);txt('in 400 trials',r.lx,r.ly+33);}
drawGrid(r,g.cell);
drawSize(k,r,xmax);
}
}
function settle(){
var done=true,goal={A:target('A'),B:target('B'),C:target('C'),reveal:step===1?0:1};
for(var k in goal){
var d=goal[k]-cur[k];
if(reduceMotion||Math.abs(d)<Math.max(0.004,Math.abs(goal[k])*0.004)){cur[k]=goal[k];}
else{cur[k]+=d*0.16;done=false;}
}
draw();
if(done){animating=false;}else{requestAnimationFrame(settle);}
}
function narrate(){
var n=count(EPS_BASE),n1=count(EPS_TIGHT),t;
var a=fmt(worst('A',eps())),b=fmt(worst('B',eps())),c=fmt(worst('C',eps()));
if(step===1){t='Step 1. Each mark is one trial, and a dark square is an excursion: a trial that left the safe region. A probability bound only counts them. Here that is '+n+' of 400, the same trials in all three designs, so by this measure the three are identical.';}
else if(step===2){t='Step 2. Now the size of the largest excursion in each design, on one shared scale: '+a+' a typical excursion with a moderate tail, '+b+' with a heavy tail, '+c+' with a very heavy tail. Size is the only thing that differs, and step 1 never measured it.';
if(worst('C',EPS_BASE)<=BOUND){t+=' This sample makes the very heavy tail look harmless, which happens in about 44% of samples. Draw a new one.';}}
else if(step===3){t='Step 3. Allowing 1% instead of 5% keeps '+n1+' of the '+n+' excursions; the hollow squares no longer count. Which ones remain has nothing to do with their size, and the largest are still '+a+', '+b+' and '+c+'.';}
else{t='Step 4. A magnitude bound limits size directly: no excursion may exceed 10× a typical one, in any design. The pale part of each bar is what the cap removed.';}
say.textContent=t;
for(var i=0;i<stepBtns.length;i++){
var on=parseInt(stepBtns[i].getAttribute('data-step'),10)===step;
stepBtns[i].style.background=on?'#263238':'transparent';
stepBtns[i].style.color=on?'#fff':'inherit';
stepBtns[i].setAttribute('aria-pressed',on?'true':'false');
}
}
function refresh(){
narrate();
if(!started)return;
if(!animating){animating=true;requestAnimationFrame(settle);}
}
var all=stepBox.querySelectorAll('button');
for(var q=0;q<all.length;q++){
all[q].style.border='1px solid #90a4ae';all[q].style.borderRadius='4px';all[q].style.padding='0.35em 0.8em';
all[q].style.cursor='pointer';all[q].style.font='inherit';all[q].style.background='transparent';all[q].style.color='inherit';
}
btnNew.style.border='1px dashed #1e88e5';btnNew.style.color='#1e88e5';btnNew.style.borderRadius='999px';
for(var b=0;b<stepBtns.length;b++){
stepBtns[b].addEventListener('click',function(ev){step=parseInt(ev.currentTarget.getAttribute('data-step'),10);refresh();});
}
btnNew.addEventListener('click',function(){seed+=1;sample();if(step>1){cur.A=0;cur.B=0;cur.C=0;}refresh();});
sample();
narrate();
function start(){
if(cv.clientWidth<10){requestAnimationFrame(start);return;}
started=true;setup();refresh();
}
if('IntersectionObserver' in window){
new IntersectionObserver(function(es,ob){if(es[0].isIntersecting){ob.disconnect();start();}},{threshold:0.1}).observe(cv);
}else{start();}
window.addEventListener('resize',function(){if(started){setup();draw();}});
})();
</script>
<figcaption>Three systems pass the same probability review because they lose the same trials. Step through the four views: the review counts how often, the sizes it never measured differ by orders of magnitude, a tighter probability bound thins the excursions without shortening them, and only a magnitude bound limits how far one goes. Each sample is four hundred trials, so the heaviest tail often hides in a single draw.</figcaption>
</div>

### Shrinking {% katex() %}\epsilon{% end %} Does Not Rescue This

The obvious objection is that a small enough {% katex() %}\epsilon{% end %} should still make the *expected* cost of relying on probability alone acceptable. That is the same way this series has priced expected cost everywhere else. {% katex() %}\epsilon \cdot L{% end %}, an approval probability times a severity, echoes [The Simulation Singularity](@/blog/2026-09-13/index.md)'s {% katex() %}N \cdot p \cdot L{% end %} crossover exactly. Whether that objection holds depends entirely on whether {% katex() %}L{% end %}, the expected severity given an excursion, is itself a finite number. A Pareto severity distribution's mean is not always finite.

For a Pareto distribution with tail-weight parameter {% term(url="", def="alpha: the Pareto tail-weight parameter, how heavy the severity distribution's tail is.") %}{% katex() %}\alpha{% end %}{% end %} and scale {% katex() %}x_m{% end %}, the mean is {% katex() %}\frac{\alpha}{\alpha - 1}x_m{% end %} for {% katex() %}\alpha > 1{% end %}. It diverges entirely, verified directly rather than asserted, for {% katex() %}\alpha \leq 1{% end %}. All three tail weights in the table above, 3.0, 1.5, and even 1.1, have {% katex() %}\alpha > 1{% end %}, so their means stay finite. {% katex() %}\frac{\alpha}{\alpha-1}{% end %} gives 1.5, 3.0, and 11 times the scale {% katex() %}x_m{% end %}. Against the fixed median {% katex() %}x_m 2^{1/\alpha}{% end %} the table is built on, that works out to the 1.2x, 1.9x, and 5.9x mean severities the table already reports. A genuinely heavier tail than any modeled above, {% katex() %}\alpha \leq 1{% end %}, is not a hypothetical edge case this series needs to reach for. Real network and service-time distributions can sit in or near this regime, and [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) already cited the literature describing why{{ cite(ref="13", title="Resnick, S.I. (1997) -- Heavy tail modeling and teletraffic data, Annals of Statistics, 25(5), 1805-1869") }}.

At that point, {% katex() %}\epsilon \cdot L{% end %} is {% katex() %}\epsilon{% end %} times infinity, for every {% katex() %}\epsilon > 0{% end %} a reviewer could possibly approve. No probability bound, however small, rescues an expected-cost argument once the tail is heavy enough that the cost itself has no finite expectation. This is the sharpest form of the gap this section opened with: {% katex() %}\epsilon{% end %} alone is answering a question that, past a certain tail weight, has no finite answer to give, not that {% katex() %}\epsilon{% end %} is currently too loose.

No re-optimizing of {% katex() %}\epsilon{% end %} reaches the magnitude constraint this gap just exposed. That is the sequencing move the {% term(url="@/blog/2025-12-27/index.md#the-constraint-sequence-framework", def="A candidate constraint cannot be resolved by re-optimizing at the level of abstraction that revealed it; the dependency graph determines which constraint must be secured before the next one becomes binding") %}Constraint Sequence Framework{% end %} names: a constraint exposed at one level of abstraction cannot be resolved by re-optimizing at that level, so the next binding constraint, magnitude, needs a mechanism of its own.

### A Second Bound, Not a Replacement for the First

{{ layer(n=1, type="Bound", id="this-is-exactly-the-gap") }}This is the gap Kishida's worst-case Conditional Value-at-Risk control barrier function is built to close{{ cite(ref="14", title="Kishida, M. (2023-25) -- A Risk-Aware Control: Integrating Worst-Case CVaR with Control Barrier Function, arXiv:2308.14265; published as Risk-Aware Control: Integrating Worst-Case Conditional Value-At-Risk With Control Barrier Function, IET Control Theory & Applications, 19, e70024") }}. Rather than constraining only the probability of leaving a safe set, a worst-case-CVaR barrier additionally constrains the *conditional expectation of severity in the worst tail fraction*, for a stated risk level, the exact quantity Definition 3 is silent on. Computing it reduces to a quadratic program for half-space and polytopic safe sets, and a semidefinite program for ellipsoidal ones, at a cost of the same computational family Proposition 3 already leans on.

<span id="cor-2"></span>

**Corollary 2** (Worst-Case CVaR Extension: Bounding Excursion Magnitude). A control policy that is a valid discrete-time stochastic control barrier function under Definition 3, and additionally constrains the worst-case Conditional Value-at-Risk of {% katex() %}-h(x(t)){% end %} at level {% term(url="", def="eta: the CVaR tail fraction, chosen independently of epsilon; the two numbers answer different questions and do not have to agree.") %}{% katex() %}\eta{% end %}{% end %} to remain below a stated bound {% term(url="", def="rho: the maximum tolerable expected severity within the worst tail fraction, the number that prices what a plain epsilon-bound alone cannot see.") %}{% katex() %}\rho{% end %}{% end %}, bounds both the probability of an excursion, per Definition 3, and the expected severity of an excursion conditional on being among the worst {% katex() %}\eta{% end %}-fraction of outcomes, per the added CVaR constraint, using a single, jointly-optimized filter rather than two independently reasoned-about mechanisms.

where:

- {% katex() %}\eta{% end %} is the tail fraction the CVaR constraint prices, chosen independently of {% katex() %}\epsilon{% end %}; the two numbers answer different questions and do not have to agree
- {% katex() %}\rho{% end %} is the maximum tolerable expected severity within that worst tail fraction, the number that actually prices what the table above shows a plain {% katex() %}\epsilon{% end %}-bound cannot see
- the two bounds are not redundant with each other: a system can satisfy Definition 3 with a very small {% katex() %}\epsilon{% end %} while still failing Corollary 2 badly, the moderate-versus-very-heavy-tail comparison above with {% katex() %}\epsilon{% end %} held fixed at 5 percent throughout

{{ layer(n=3, type="Estimate", id="applied-to-the-running-case") }}Applied to the running case, {% katex() %}h(x){% end %} stays the queue's signed distance from the declared occupancy ceiling. {% katex() %}-h(x){% end %} in the worst tail is, concretely, how far past that line the queue is driven and for how long, before whatever downstream recovery eventually arrives. This post's reference model now shows that duration can be seconds, hundreds of seconds, or never, depending on traffic relative to the executor pool's joint ceiling, not a single fixed severity Definition 3 alone would ever imply. Corollary 2 does not change what Definition 3 already certifies. It adds a second, independent number a reviewer can also demand, and Falsification Criterion F10 below states what would show this addition is unnecessary.

### The Two Bounds Trade Against Each Other, Not for Free

<span id="def-3a"></span>

<details>
<summary>Definition 3a -- Safety Achievable Region: every split of a fixed control-authority budget between a probability margin and a magnitude margin maps to a point, and only the frontier of that set is worth choosing</summary>

**Definition 3a** (Safety Achievable Region). For a fixed control-authority budget {% katex() %}m_p + m_c = m_{\text{tot}}{% end %}, every split between a probability margin {% katex() %}m_p{% end %} and a magnitude margin {% katex() %}m_c{% end %} maps to a point: an achievable {% katex() %}\epsilon{% end %} and an achievable severity bound {% katex() %}\rho{% end %}. The achievable region is the set of such points; its frontier is the non-dominated set, [The Impossibility Tax](@/blog/2026-03-14/index.md#def-1)'s achievable region and [Pareto frontier](@/blog/2026-03-14/index.md#def-2) applied to a safety budget rather than a validation budget.

</details>

Corollary 2 states that both bounds can be jointly enforced. It does not, by itself, say enforcing both is free. Definition 3a states what that enforcement is bought against: a fixed budget. Corollary 3 below is a statement about a point on that region. This question needs the same tool [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) reached for the one other time this series priced two ways of spending a fixed budget against each other.

<span id="cor-3"></span>

**Corollary 3** (Joint Enforcement Cost Floor). Let a per-step quadratic program select the action closest to a nominal, highest-utility choice, subject to whichever barrier constraints are active. Enforcing Corollary 2's CVaR constraint jointly with Definition 3's probability constraint can only shrink the feasible set that program searches, never enlarge it, and shrinking the feasible region of a convex program can only raise, or leave unchanged, its optimal objective value, never lower it. So the cost of jointly enforcing both bounds, measured in forgone throughput relative to the nominal action, is never smaller than the cost of enforcing Definition 3's probability bound alone, and is generically larger.

where:

- this is a property of adding any constraint to any convex program, not of Cosner, Culbertson, and Ames's bound or Kishida's CVaR construction specifically; it applies here because both cited mechanisms are stated as that kind of program
- Corollary 3 states only that a cost floor exists, not its exact shape or size: the achievable-region table below illustrates the shape with an explicitly stated, illustrative closed form, not a claim about either cited bound's literal functional form

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart TD
    NOM["Nominal action u-nominal<br/>Cyclic Adaptive Regulation<br/>Proposition 2"]:::leaf
    DEF3["Definition 3<br/>Probability constraint<br/>P(exit safe region) less than or equal to epsilon"]:::leaf
    COR2["Corollary 2<br/>CVaR constraint<br/>bounds excursion magnitude by rho"]:::leaf
    QP["Per-step QP, Corollary 3<br/>minimize distance to u-nominal<br/>subject to both constraints"]:::branch
    FEAS{"Feasible set<br/>non-empty?"}:::branch
    SAFE["Safe action u-star<br/>both bounds honored"]:::ok
    EMPTY["No action satisfies both bounds<br/>Corollary 3 prices this as costly,<br/>not as impossible"]:::alt

    NOM --> QP
    DEF3 --> QP
    COR2 --> QP
    QP --> FEAS
    FEAS -->|yes| SAFE
    FEAS -->|no, F17| EMPTY

    classDef root fill:none,stroke:#333,stroke-width:3px
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px
    classDef branch fill:none,stroke:#ca8a04,stroke-width:2px
    classDef ok fill:none,stroke:#22c55e,stroke-width:2px
    classDef alt fill:none,stroke:#aaa,stroke-width:1.5px,stroke-dasharray:4 4
{% end %}

<figcaption>Figure 2: the per-step safety filter as a single optimization, not two separate checks. The nominal action from Cyclic Adaptive Regulation is the QP's starting point, not a proposal it can veto wholesale. The filter finds the closest action that still satisfies both Definition 3's probability bound and Corollary 2's magnitude bound at once.</figcaption>

> **Read the diagram.** Figure 1 showed Proposition 3's filter alone, a single barrier constraint, looping forever with no exit state. This figure is not that loop redrawn; it is what changes inside the QP box once Corollary 2 adds a second, independent constraint. Two constraints, one from Definition 3 and one from Corollary 2, feed into a single per-step optimization rather than two sequential checks, which is what "jointly enforced, not one substituting for the other" means as a computation, not only as a sentence. The dashed branch is the one Corollary 3 prices but does not resolve: a highly constrained state can leave no action satisfying both bounds at once, the exact gap "A Cost Floor Assumes a Solution Exists at All," directly below, and Falsification Criterion F17 names. This post has not built the explicit backup policy that would close it.

{{ layer(n=3, type="Estimate", id="state-the-shape-of-the") }}The shape of the tradeoff is worth showing with a small, explicitly illustrative model: one instance of Definition 3a's achievable region, not a claim about either cited bound's literal functional form. Let a fixed total control-authority budget {% katex() %}m_{\text{tot}}{% end %} split between a probability-margin {% katex() %}m_p{% end %} and a CVaR-margin {% katex() %}m_c{% end %}, {% katex() %}m_p + m_c = m_{\text{tot}}{% end %}. Model the achievable {% katex() %}\epsilon{% end %} using the generic Bennett/Freedman-type tail form this whole family of concentration inequalities produces, {% katex() %}\epsilon(m_p) = e^{-m_p^2/2v}{% end %} for a disturbance-variance proxy {% katex() %}v{% end %}. Model the achievable severity bound using a generic diminishing-returns form, {% katex() %}S(m_c) = S_0 / (1 + m_c/k){% end %}. Sweep the split at a fixed {% katex() %}m_{\text{tot}}=4{% end %}, verified directly rather than asserted:

<div class="illustrative">

| {% katex() %}m_p{% end %} (probability margin) | {% katex() %}m_c{% end %} (CVaR margin) | Achievable {% katex() %}\epsilon{% end %} | Achievable severity bound |
|---|---|---|---|
| 0.0 | 4.0 | 1.000 | 20.0 |
| 1.0 | 3.0 | 0.607 | 25.0 |
| 2.0 | 2.0 | 0.135 | 33.3 |
| 3.0 | 1.0 | 0.011 | 50.0 |
| 4.0 | 0.0 | 0.0003 | 100.0 |

</div>

<div style="margin:1.5em 0;">
<canvas id="chart-frontier" aria-label="A chart of what one fixed budget of four units of control authority can buy. A curve plots the allowed chance of an excursion, epsilon, on a horizontal logarithmic axis against the severity bound on the vertical axis; smaller is better on both. The curve runs from epsilon 0.0003 with severity bound 100, where the whole budget sits on the probability bound, down to epsilon 1 with severity bound 20, where the whole budget sits on the magnitude bound. The corner below and to the left of the curve, where both numbers are small, is shaded as unreachable with this budget. Five points mark the table's five splits." style="width:100%; height:360px; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<script>
(function(){
var cv=document.getElementById('chart-frontier');
if(!cv)return;
var ctx=cv.getContext('2d');
var M=4,N=200,BLUE='#1e6fb8',ORANGE='#e07b39',INK='#263238',GREY='#607d8b';
var W=0,H=0,narrow=false,L=46,R=18,T=44,B=50,started=false;
var E0=Math.log(0.0002),E1=Math.log(1.6),S0=10,S1=108;
function epsOf(mp){return Math.exp(-(mp*mp)/2);}
function sevOf(mp){return 100/(1+(M-mp));}
function px(e){return L+(Math.log(e)-E0)/(E1-E0)*(W-L-R);}
function py(s){return T+(1-(s-S0)/(S1-S0))*(H-T-B);}
function txt(t,x,y){ctx.fillText(t,Math.round(x),Math.round(y));}
function fit(t,maxW,size,style){var s=size;ctx.font=style.replace('%',s);while(s>8&&ctx.measureText(t).width>maxW){s--;ctx.font=style.replace('%',s);}return s;}
function fe(e){return e>=0.1?e.toFixed(3):e>=0.001?e.toFixed(3):e.toFixed(4);}
function setup(){
W=cv.clientWidth;narrow=W<560;H=narrow?330:360;
cv.style.height=H+'px';
if(cv.clientHeight&&cv.clientHeight!==H){cv.style.height=(2*H-cv.clientHeight)+'px';}
var dpr=window.devicePixelRatio||1;
cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
ctx.setTransform(cv.width/W,0,0,cv.height/H,0,0);
}
function draw(){
if(!started)return;
var i;
ctx.clearRect(0,0,W,H);
ctx.fillStyle=INK;ctx.textAlign='left';ctx.textBaseline='alphabetic';
fit('SEVERITY BOUND  (smaller is better)',W-L-R,11,'bold %px sans-serif');
txt('SEVERITY BOUND  (smaller is better)',L,T-10);
var x0=L,x1=W-R,y0=T,y1=H-B;
ctx.save();ctx.beginPath();ctx.rect(x0,y0,x1-x0,y1-y0);ctx.clip();
ctx.beginPath();ctx.moveTo(x0,y1);ctx.lineTo(x0,y0);ctx.lineTo(px(epsOf(M)),y0);
for(i=N;i>=0;i--){var m=i/N*M;ctx.lineTo(px(epsOf(m)),py(sevOf(m)));}
ctx.lineTo(x1,py(sevOf(0)));ctx.lineTo(x1,y1);ctx.closePath();
ctx.fillStyle='rgba(198,40,40,0.09)';ctx.fill();
ctx.restore();
var xt=[0.001,0.01,0.1,1],yt=[20,40,60,80,100];
ctx.font='11px sans-serif';ctx.lineWidth=1;
for(i=0;i<yt.length;i++){
ctx.strokeStyle='#eceff1';ctx.beginPath();ctx.moveTo(x0,Math.round(py(yt[i]))+0.5);ctx.lineTo(x1,Math.round(py(yt[i]))+0.5);ctx.stroke();
ctx.fillStyle=GREY;ctx.textAlign='right';ctx.textBaseline='middle';txt(String(yt[i]),x0-8,py(yt[i]));
}
for(i=0;i<xt.length;i++){
ctx.strokeStyle='#eceff1';ctx.beginPath();ctx.moveTo(Math.round(px(xt[i]))+0.5,y0);ctx.lineTo(Math.round(px(xt[i]))+0.5,y1);ctx.stroke();
ctx.fillStyle=GREY;ctx.textAlign='center';ctx.textBaseline='top';txt(xt[i]===1?'1.0':String(xt[i]),px(xt[i]),y1+7);
}
ctx.fillStyle=INK;ctx.textAlign='center';ctx.textBaseline='top';
var xl=narrow?'CHANCE OF AN EXCURSION, ε  (smaller is better)':'ALLOWED CHANCE OF AN EXCURSION, ε  (smaller is better, log scale)';
fit(xl,W-L-R,11,'bold %px sans-serif');txt(xl,(x0+x1)/2,y1+25);
ctx.strokeStyle=INK;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.beginPath();
for(i=0;i<=N;i++){var m2=i/N*M;if(i===0)ctx.moveTo(px(epsOf(m2)),py(sevOf(m2)));else ctx.lineTo(px(epsOf(m2)),py(sevOf(m2)));}
ctx.stroke();
ctx.fillStyle='#b23b3b';ctx.textAlign='left';ctx.textBaseline='alphabetic';
fit('UNREACHABLE WITH THIS BUDGET',(x1-x0)*0.5,12,'bold %px sans-serif');
txt('UNREACHABLE WITH THIS BUDGET',x0+12,y1-26);
ctx.font='11px sans-serif';txt('both numbers small at once',x0+12,y1-11);
ctx.fillStyle=GREY;ctx.textAlign='right';ctx.font='11px sans-serif';
txt('reachable, but worse on both',x1-10,(y0+y1)/2-30);
var MARK=[[0,'whole budget on the magnitude bound',1],[1,'',0],[2,'even split',1],[3,'',0],[4,'whole budget on the probability bound',1]];
for(i=0;i<5;i++){
var mp=MARK[i][0],X=px(epsOf(mp)),Y=py(sevOf(mp));
ctx.fillStyle='#fff';ctx.strokeStyle=INK;ctx.lineWidth=MARK[i][2]?3:2;ctx.beginPath();ctx.arc(X,Y,MARK[i][2]?6:4,0,6.2832);ctx.fill();ctx.stroke();
if(!MARK[i][2]||(narrow&&i===2))continue;
var l1='ε = '+fe(epsOf(mp))+',  bound = '+sevOf(mp).toFixed(1),l2=MARK[i][1],left=i===0;
ctx.textBaseline='alphabetic';ctx.textAlign=left?'right':'left';
var tx=left?(narrow?x1-4:X-12):X+12,ty=i===4?Y+22:(narrow?Y-34:Y-22);
ctx.fillStyle=INK;fit(l1,left?X-x0-18:x1-X-18,13,'bold %px sans-serif');txt(l1,tx,ty);
ctx.fillStyle=GREY;fit(l2,left?X-x0-18:x1-X-18,11,'%px sans-serif');txt(l2,tx,ty+15);
}
}
function start(){if(cv.clientWidth<10){requestAnimationFrame(start);return;}started=true;setup();draw();}
if('IntersectionObserver' in window){
new IntersectionObserver(function(es,ob){if(es[0].isIntersecting){ob.disconnect();start();}},{threshold:0.1}).observe(cv);
}else{start();}
window.addEventListener('resize',function(){if(started){setup();draw();}});
})();
</script>
<figcaption>One instance of Definition 3a's achievable region, for a fixed budget of four units. The five marked points are the table's five splits, and the curve is every split in between: each position trades a smaller chance of an excursion for a larger severity bound. The shaded corner, where both are small at once, costs more control authority than this budget has.</figcaption>
</div>

Read the table's shape, not its specific numbers, which are illustrative only. Moving margin toward tightening {% katex() %}\epsilon{% end %} strictly worsens the achievable severity bound, and moving margin the other way strictly worsens {% katex() %}\epsilon{% end %}, confirmed across the full sweep, not merely at the two ends. There is no split of a fixed budget that improves both numbers at once. This is the same achievable-region logic [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) used for a cost-over-time tradeoff, applied here to a cost-over-safety-dimensions tradeoff. The frontier this table traces is the lower envelope of what one fixed budget can jointly buy, not a claim that either bound alone was ever the full price.

The Reversal Condition already stated below is this frontier's degenerate case, not a separate finding. Under a genuinely light-tailed disturbance, Definition 3's probability bound and Corollary 2's magnitude bound converge to saying nearly the same thing. That is the condition under which {% katex() %}\epsilon{% end %} and the severity bound stop trading against each other, because tightening one no longer costs the other anything worth pricing. The achievable region collapses toward a single point rather than a genuine frontier. Falsification Criterion F16 states the testable form of whether this frontier has real bite in the running case, as opposed to being a theoretical possibility a heavy-tailed system never actually operates close enough to its constraints to feel.

### A Cost Floor Assumes a Solution Exists at All

A sharper failure than "expensive" is worth naming, because Corollary 3 only priced the milder one. Everything above, the cost floor, the achievable-region table, treats the per-step QP as though it always has *some* feasible action to return, and asks only how costly that action gets as the feasible set shrinks. Shrinking a feasible set raises the optimum's cost because the set is assumed to stay non-empty. Push two constraints hard enough at once, at a state where the disturbance is already severe, and the feasible set can do worse than shrink toward an expensive corner. It can vanish outright, and a quadratic program with an empty feasible set does not return a costly action. It returns no action at all.

{{ layer(n=1, type="Bound", id="this-is-not-a-hypothetical") }}This is not a hypothetical defect specific to Corollary 2's construction. It is a known, general property of stacking barrier constraints on a per-step QP without a separate feasibility guarantee. The control-barrier-function literature has its name and fix for it. Chen, Jankovic, Santillo, and Ames showed that an ordinary CBF-QP safety filter can lose feasibility as the state evolves{{ cite(ref="15", title="Chen, Y., Jankovic, M., Santillo, M. & Ames, A.D. (2021) -- Backup Control Barrier Functions: Formulation and Comparative Study, arXiv:2104.11332") }}. Nothing in the filter's per-step construction certifies in advance that a next feasible action will still exist. Their fix anchors the filter to an explicit backup policy, a known, pre-verified fallback trajectory. That anchor guarantees the QP's feasible set stays non-empty by construction, not by assumption.

Proposition 3 and Corollary 2, as this post states them, have no such backup set. The QP they describe assumes, without proving, that a nearby feasible action exists at every state the barrier is asked to filter. In a highly constrained region, both constraints pulled tight by a disturbance already running hot, that assumption is the one this post's achievable-region table shows getting more expensive to satisfy. The same table gives no reason to believe the feasible set stays non-empty rather than merely small right up until it empties out.

This post has not built the backup-policy machinery that would close this gap, and does not claim Corollary 3's cost-floor argument does the job of a feasibility guarantee, because it was never built to. Falsification Criterion F17 below states the open, testable form of the claim.

### Compute Your Own Boundary, a Checklist

Everything above is one worked instance, using this post's executor pool. Here is the same procedure, stripped to five steps, for a reader building a barrier against their system rather than this post's.

1. **Name {% katex() %}h(x){% end %} and {% katex() %}\mathcal{C}{% end %}.** The signed-distance function should read directly off a quantity you already track: queue occupancy, error rate, whatever margin your system is actually trying not to run out of. Name the safe region it defines. If you cannot state {% katex() %}h(x){% end %} concretely, Definition 3 has nothing to filter yet.
2. **Price {% katex() %}\epsilon{% end %}, the probability tolerance a reviewer would actually sign off on.** Not the smallest number you can compute. It is the number a reviewer would read once and trust, the way "Why a Rulebook Cannot Do This Job" describes a boundary being approved once rather than every action being re-approved forever.
3. **Check whether excursion severity, conditional on leaving {% katex() %}\mathcal{C}{% end %}, is heavy-tailed.** If it is provably light-tailed, with a genuinely bounded worst case, stop here. The Reversal Condition above applies, and {% katex() %}\epsilon{% end %} alone is close to the full guarantee. Most correlated-retry regimes are not this case.
4. **If it is heavy-tailed, price {% katex() %}\eta{% end %} and {% katex() %}\rho{% end %}**, Corollary 2's CVaR tail fraction and its maximum tolerable severity within that fraction. The two numbers are chosen independently of {% katex() %}\epsilon{% end %}, answering different questions on purpose.
5. **Check the joint QP's feasible set, not only its cost.** Verify, empirically against your own reference model or by construction, that enforcing {% katex() %}\epsilon{% end %} and {% katex() %}\rho{% end %} together never empties the feasible set across your own operating envelope. This is per "A Cost Floor Assumes a Solution Exists at All" above. If you cannot verify this, build the backup-policy machinery this post has not. Otherwise, treat the resulting filter as unverified at your own system's worst-case states, not just expensive there.

This checklist does not remove the judgment call in step 2, what a reviewer will actually accept, or the engineering work in step 5, an actual backup policy. It fixes their shape, so what remains is a specific boundary to defend, not a feeling that the system is probably safe enough.

## When the Probe Causes the Cliff It Is Measuring For

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s ProbeBW cycle is the concrete mechanism Cyclic Adaptive Regulation borrows to keep reading its regulation as measurement. It has eight round trips: six cruising at its current bandwidth estimate, one probing 25 percent above it, one draining 25 percent below it. That cycle's drain phase carries an assumption worth stating outright, because this post's reference model already shows the dynamic that can break it.

### The Assumption the Drain Phase Actually Makes

The drain phase's entire job is to pay down whatever queue the probe phase's 1.25x pacing just built up, by pacing at 0.75x for one round trip afterward. That works, cleanly, if downstream capacity stays roughly where the current bandwidth estimate assumes it is across both phases. It is a *stationarity* assumption, made silently, about one full cycle's worth of time, and [The Simulation Singularity](@/blog/2026-09-13/index.md)'s whole opening argument is that stationarity is the assumption a correlated-retry regime breaks.

{{ layer(n=3, type="Estimate", id="make-this-precise-with-a") }}A small worked model makes this precise, reusing the ProbeBW gains as [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) stated them, and this post's health-scaled clearing-capacity mechanism from [The Simulation Singularity](@/blog/2026-09-13/index.md). Suppose downstream capacity, normally matching the current bandwidth estimate exactly, collapses to some fraction of nominal as the probe phase begins. The bandwidth estimate itself, matching BBR's deliberately slow, windowed-maximum filter on delivered rate, does not revise downward until the next cycle starts:

<div class="illustrative">

| Downstream capacity during the collapse (fraction of nominal) | Queue built during the probe round trip | Queue built (or drained) during the drain round trip | Net queue built over the probe and drain rounds |
|---|---|---|---|
| 1.00 (no collapse) | +0.25 | -0.25 | 0.00 |
| 0.90 | +0.35 | -0.15 | 0.20 |
| 0.80 | +0.45 | -0.05 | 0.40 |
| **0.75** | +0.50 | **0.00** | 0.50 |
| 0.70 | +0.55 | +0.05 | 0.60 |
| 0.50 | +0.75 | +0.25 | 1.00 |
| 0.30 | +0.95 | +0.45 | 1.40 |

</div>

Read the middle row first. The drain phase stops draining, exactly, the moment downstream capacity falls to 75 percent of the nominal estimate the probe and drain gains are both computed against, because 0.75 times the estimate is no longer less than the collapsed capacity itself. Below that line, the drain phase does not merely fail to help. It actively adds to the queue, on top of what the probe phase already added, right when the system can least afford it.

One scoping note on the last column, so its numbers read as what they are. It sums the probe and drain rounds alone, because those two are the rounds whose cancellation the cycle's design explicitly promises. The inversion of that promise is what this section is naming. A collapse that persists through the cycle's remaining six cruise round trips builds more queue on top. Cruising at gain 1.0 against capacity {% katex() %}c{% end %} adds {% katex() %}(1.0 - c){% end %} per round trip: another 1.5 queue-units at the 0.75 line and another 3.0 at 0.50. The cruise rounds fail for the ordinary reason, a stale estimate. The table isolates the two rounds that fail for the inverted one instead, and its totals are a floor on the full cycle's damage, not the whole of it.

### The Backlog Does Not Drain Itself Afterward

The one bad cycle is the smaller problem. What happens after it is the larger one. Model a second cycle, one full ProbeBW cycle later, in which downstream capacity has stabilized at its new, lower level and the bandwidth estimate has, in the best case for the system, fully caught up to it by then:

<div class="illustrative">

| | Probe send (gain x estimate) | Drain send (gain x estimate) | Net this cycle | Running backlog |
|---|---|---|---|---|
| Cycle 1, healthy, estimate = 1.0 | 1.25 | 0.75 | 0.00 | 0.00 |
| Cycle 2, capacity collapses to 0.5 mid-cycle, estimate still 1.0 | 1.25 | 0.75 | **+1.00** | 1.00 |
| Cycle 3, capacity stays 0.5, estimate has now adapted to 0.5 | 0.625 | 0.375 | 0.00 | **1.00** |

</div>

The same probe-and-drain scoping applies to this table's "net" column as to the last one's. A collapse persisting through cycle 2's cruise rounds adds {% katex() %}0.5 \times 6 = 3.0{% end %} more, leaving a scar of 4.0 rather than 1.0 before cycle 3 takes over. The direction of the argument only strengthens under the fuller accounting.

Cycle 3 is, on its own terms, correct: once the estimate has adapted, cruising and cycling at the new, lower capacity is stable and self-consistent. It is also, notice, net zero over the cycle, not net negative. Ordinary operation at a correctly adapted estimate holds a queue steady. It does not proactively pay down a backlog that arrived before the estimate adapted. The one bad cycle's overshoot becomes a permanent scar, sitting in the queue indefinitely, not because anything afterward is misconfigured. It is because nothing in the ordinary cycle's design is built to notice and repay a debt incurred before it started paying attention.

### What This Means for the Barrier

{{ layer(n=2, type="Fit", id="this-is-part-s-own") }}This is [The Simulation Singularity](@/blog/2026-09-13/index.md)'s metastable-collapse signature, reappearing inside the very mechanism [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) built to avoid repeating [The Simulation Singularity](@/blog/2026-09-13/index.md)'s mistake. A probe's up-phase, landing on a downstream collapse already underway, can be the specific push that tips a system already near its edge into the regime this series opened by diagnosing. BBR's real, documented windowed-maximum bandwidth filter makes this worse, not better: it is deliberately slow to revise downward, so a transient dip does not cause needless underestimation. That makes the mismatch window this section models longer in practice, not shorter.

A discrete-time stochastic control barrier function, as Definition 3 states it, bounds the probability of the *queue itself* leaving its declared safe region. It does not, by that statement alone, watch whether the probe *currently in flight* is the thing pushing it there. Closing this gap needs two things from the barrier. It has to observe a real-time rate-of-change signal, not only current occupancy. It also has to be willing to abort a probe phase mid-cycle, the moment downstream clearing capacity visibly decouples from the estimate the current cycle's gains were computed against.

**This post has not built that mechanism**, though the next section sketches its formal shape rather than leaving the gap entirely unnamed. Falsification Criterion F11 states the testable form of the claim that it is needed; until it is built, or until F11 is shown false, treat the ProbeBW-style cycle as carrying a residual risk this post names rather than resolves: the probe that measures the cliff can, in the specific and now-quantified circumstance above, be the thing that causes it.

### A Formal Sketch of the Missing Mechanism

{{ layer(n=3, type="Estimate", id="the-tool-this-gap-actually") }}The tool this gap actually needs already sits inside this post's apparatus, cited above for a different purpose than the one it serves here. Proposition 3's Layer 1 already reaches for the CBF-CLF-QP framework to unify a safety constraint and a performance objective in one per-step program. The same authors' High-Order Control Barrier Function construction, cited again below in the Model Scope table for a different reason entirely, relative degree rather than rate-of-change, supplies the missing signal named above{{ cite(ref="16", title="Xiao, W. & Belta, C. (2022) -- High-Order Control Barrier Functions, IEEE Transactions on Automatic Control, 67(7), 3655-3662") }}.

The construction below is stated in enough detail to check, as a formal object in its own right rather than prose describing one.

<span id="def-4"></span>

**Definition 4** (First-Order Rate-of-Closure Barrier Extension). Let {% katex() %}\varphi_0(x){% end %} be Definition 3's barrier, the signed margin between current queue occupancy and the declared safe boundary. A first-order High-Order Control Barrier Function extension adds a second constraint on top of it,

{% katex(block=true) %}
\varphi_1(x) = \dot\varphi_0(x) + \alpha_0(\varphi_0(x)) \geq 0
{% end %}

for a class-{% katex() %}\mathcal{K}{% end %} function {% katex() %}\alpha_0{% end %}, enforced jointly with {% katex() %}\varphi_0(x) \geq 0{% end %} in the same per-step quadratic program Proposition 3's filter already runs.

where:

- {% katex() %}\dot\varphi_0(x){% end %} inherits Xiao and Belta's continuous-time notation{{ cite(ref="16", title="Xiao, W. & Belta, C. (2022) -- High-Order Control Barrier Functions, IEEE Transactions on Automatic Control, 67(7), 3655-3662") }}, written for a system evolving as a differential equation; this post's runtime is discrete and event-driven, so every occurrence of {% katex() %}\dot\varphi_0(x){% end %} below is read as the one-step drift the per-step QP can actually observe, {% katex() %}\dot\varphi_0(x) \approx \Delta\varphi_0(x_t) = \varphi_0(x_{t+1}) - \varphi_0(x_t){% end %}, not a literal time derivative no discrete controller could compute
- {% katex() %}\varphi_1{% end %} is not a restatement of {% katex() %}\varphi_0{% end %}: it bounds how fast the margin is closing, and not only whether it has closed yet, computed from the same bandwidth estimate the probe phase's gain is already using, requiring no new instrumentation this post has not already assumed
- {% katex() %}\alpha_0{% end %} is chosen to penalize fast closure more than slow closure, so the added constraint can bind, forcing the pacing gain down or aborting the probe outright, before {% katex() %}\varphi_0{% end %} itself would cross zero, not after
- this is a candidate mechanism, not a proof that it closes the gap "What This Means for the Barrier" names: {% katex() %}\dot\varphi_0{% end %} is computed from the same bandwidth estimate the actuator-inversion failure mode can itself corrupt, so the construction moves the blind spot one derivative rather than removing it, as stated below

Map Definition 4 onto the ProbeBW cycle directly. Read {% katex() %}\varphi_0{% end %} as the queue's margin below its declared safe threshold, and {% katex() %}\dot\varphi_0{% end %} as that margin's rate of consumption during the probe round trip specifically. The worked table above shows why {% katex() %}\varphi_1{% end %} catches what {% katex() %}\varphi_0{% end %} alone misses. At 0.75 nominal capacity, the queue-fraction {% katex() %}\varphi_0{% end %} may still show comfortable margin one round trip into the probe, while its rate of consumption is already well past whatever a stationary, non-collapsing cycle would produce.

What Definition 4 genuinely buys is narrower than a full proof, and still real. It converts an unbuilt, unspecified mechanism into a specific, named formal object, with a specific, nameable residual gap. That is a real advance over leaving the whole problem as an open question with no candidate shape. Falsification Criterion F11 below tests a prior, narrower question: whether the underlying failure regime this construction targets occurs in production traffic at all. Whether Definition 4 itself, once built, actually closes the gap given that the failure regime is real, is a further question this post does not reduce to a single falsifiable criterion. The reason is specific. The construction's stated residual gap, a stale bandwidth estimate corrupting {% katex() %}\dot\varphi_0{% end %} the same way it corrupts {% katex() %}\varphi_0{% end %}, is not itself something a falsification test against production traffic alone could cleanly isolate.

One more cost this construction carries is worth naming, because aborting is not a free action either. {{ layer(n=1, type="Bound", id="a-probebw-style-up-phase") }}A ProbeBW-style up-phase exists to generate one thing, and only that phase can generate it: a delivery-rate sample taken while sending at the elevated 1.25x gain. That sample is what tells the estimator whether more capacity than currently assumed is actually available. [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s account of the cycle is explicit that this is what the up-phase is for, not an incidental side effect of it.

{{ layer(n=2, type="Fit", id="aborting-mid-cycle-the-way") }}Aborting mid-cycle, the way {% katex() %}\alpha_0{% end %} above is built to force, preserves {% katex() %}\varphi_0{% end %}, the queue margin Definition 3 actually bounds, at the direct cost of that sample. An up-phase cut short before completing its round trip at the elevated gain never learns whether the collapse it reacted to has eased, only that it was underway at the moment of abort. The estimate {% katex() %}\dot\varphi_0{% end %} itself depends on, already named above as this construction's residual gap, is not just stale entering the next cycle. It is *guaranteed* to stay that stale, because the same action that protects the queue this cycle is the action that withholds the one measurement able to correct it.

The next cycle's probe starts from the identical unrevised estimate, facing the identical choice, until some cycle is eventually allowed to run long enough to refresh it, or until the estimate is corrected by a channel this post has not specified. This is the same price BBR's probe-drain-cruise design pays by construction, not a flaw specific to Definition 4. Any mechanism that protects a queue by declining to sustain the elevated rate a capacity sample requires is, by that same action, declining to learn whether the thing it is protecting against has actually ended.

## Trusting the Estimate That Triggers the Boundary

One more piece of [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s apparatus needs re-examining before this post's safety claims can stand on their own. It was verified once, under conditions this post's subject matter makes newly relevant.

Definition 2's ensemble is the interacting-multiple-model mechanism that lets Cyclic Adaptive Regulation notice a regime shift quickly instead of slowly. It needs a small, constant, ongoing mixing probability to stay willing to reconsider a confident hypothesis. That much [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) verified: it fixes a real failure mode, a naive ensemble that never revisits its confidence can fail completely, worse than a plain moving average. What [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s worked demonstration did not do is test that mixing probability against heavy-tailed background noise. That is the same kind of noise this post's severity table takes as given.

{{ layer(n=2, type="Fit", id="state-the-tension-directly-a") }}The tension is real. A mixing probability tuned high enough to unlock quickly from a stale hypothesis is also a mixing probability that treats an ordinary, if unusually large, heavy-tailed noise draw as evidence of a genuine regime shift. It does this more often than a light-tailed noise model would predict. Tuned low enough to avoid that false alarm, it reintroduces Corollary 1's detection lag, the linear-regret cost [The Simulation Singularity](@/blog/2026-09-13/index.md) already priced. This is an untested interaction between two apparatuses this series built separately and verified separately: the ensemble against simple noise, the severity table against a heavy tail, without ever running the two together. It is not a flaw in [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s ensemble mechanism.

{{ layer(n=3, type="Estimate", id="test-the-interaction-directly") }}The interaction is worth testing directly rather than leaving it asserted. Reuse [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s two-hypothesis IMM construction: one hypothesis pinned to the true, unchanging regime, the other to a fixed alternate 3 standard deviations away. Mix them each step by a small, constant probability, in the same spirit as [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s mechanism. That earlier post states that probability must be small and constant, but never pins down a specific value. This table states its own value explicitly rather than implying an exact match to an unstated number: 0.02 per step.

Hold the true regime fixed for the entire run. Then any sustained shift in belief toward the alternate hypothesis is, by construction, a false alarm, not a genuine detection. "Sustained" means the alternate hypothesis's posterior stays above 0.5 for at least 5 consecutive steps, over a 200-step run. Feed the identical ensemble Gaussian noise, then Student-t noise at two tail weights, all at the same scale parameter:

<div class="illustrative">

| Background noise | Sustained false-alarm rate over 30,000 trials |
|---|---|
| Gaussian (light-tailed) | 0.03% |
| Student-t, {% katex() %}\nu=3{% end %} (heavy-tailed) | 3.08% |
| Student-t, {% katex() %}\nu=1.5{% end %} (very heavy-tailed) | 12.44% |

</div>

The same ensemble, the same mixing probability, the same absence of any real regime shift: a heavy tail alone raises the false-alarm rate by two to three orders of magnitude over the light-tailed baseline. The increase continues as the tail gets heavier still. Recall that [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s verification of this mechanism used noise closer to the first row. This series' running case, a correlated-retry regime whose severity this post has already modeled as heavy-tailed, lives closer to the second and third.

Two different failure modes follow directly, for two different audiences. For this post's safety filter, a false regime-shift signal can trigger an unnecessary, and therefore costly, intervention, tightening the barrier's filtering action against a threat that was never real. For any future stopping rule built on the right to probe rather than the obligation to, a question this post flags rather than answers, such a rule's value depends on trusting the signal that would trigger exercising it. If that signal is itself prone to mistaking noise for drift under the heavy-tailed conditions this series' running case describes, the rule would be deciding when to act on a trigger this post cannot yet certify as trustworthy. Falsification Criterion F12 states this as a testable claim, rather than leaving it as an unquantified worry.

## Bootstrapping the Boundary Before Any Telemetry Exists

Every piece of trust priced above assumes the mechanism doing the pricing is already running: Definition 3's {% katex() %}\epsilon{% end %} calibrated against a disturbance model, Definition 2's mixing probability tuned against a noise process. Neither was ever going to be true on day zero, and the series has not yet said what happens before it is.

The problem sits underneath everything built so far rather than beside it. Cyclic Adaptive Regulation's ensemble needs a running estimate of the environment's noise characteristics before its mixing probability can be sanity-checked against anything real. Definition 3's safe region {% katex() %}\mathcal{C}{% end %} and disturbance bound need a calibration source before {% katex() %}\epsilon{% end %} means anything at all. Recall that [The Simulation Singularity](@/blog/2026-09-13/index.md) spent an entire post arguing that historical validation is structurally blind to the regime that matters. A team deploying this apparatus for the first time has, by construction, nothing else to calibrate against.

{{ layer(n=2, type="Fit", id="the-honest-answer-does-not-e") }}The honest answer does not escape this. The initial barrier and the initial ensemble prior are bootstrapped from history, or from a conservative engineering heuristic standing in for history, the kind of source this series has spent three posts distrusting for a different purpose. What changes is not the starting point; it is what happens after it. A system frozen at its historical validation, [The Simulation Singularity](@/blog/2026-09-13/index.md)'s subject, never gets a second, better estimate, because nothing about running it generates new information about a regime it never saw. Cyclic Adaptive Regulation's cycle, once running, does that. Every round trip through Definition 2's persistent excitation is a chance to notice the initial calibration was wrong and correct it, the property [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) built the mechanism to have.

That correction is not instantaneous, and pretending otherwise would be its own kind of congruence: a post that has spent this many pages naming other systems' false confidence, quietly assuming its own mechanism starts out already calibrated. Between deployment and however many cycles it takes the ensemble to accumulate enough persistent excitation to trust its mixing probability against real, not assumed, noise, the barrier is running on the same kind of untested historical guess this series opened by diagnosing. Falsification Criterion F18 below states the condition under which that warm-up window is short enough not to matter, and the condition under which it is not.

## What One Controller Does When the Coordinator Goes Quiet

The next several sections belong in a post about probability and magnitude, rather than reading as a detour into distributed-systems theory for its own sake, because the connection is load-bearing, not decorative. Several sections ahead, "The Fleet Question This Post Does Not Answer" considers extending Corollary 2's magnitude bound to a fleet by feeding each node's barrier a dynamic penalty weight built from the shared Kelly price, the same coordination signal named below. That candidate fix depends on the signal actually being there. Before asking whether it stabilizes a fleet's joint safety, the narrower question has to be answered first. What does a single node's magnitude bound do the moment that signal is stale or unreachable, not just imperfect? A CVaR constraint calibrated against a coordination signal that can silently disappear is exposed to the kind of gap this post has been naming under other names throughout. This section, and the two that follow it, answer that narrower question before the fleet-wide one gets asked at all.

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) closed its game-theory section by naming what a shared Kelly-style pricing signal buys a fleet of simultaneously probing controllers. It buys convergence toward a declared-fair split, rather than the roughly 33.6-to-1 starvation split, 97.1 percent versus 2.9 percent, an uncoordinated fleet reaches on its own. That pricing signal needs its own control plane, its own telemetry aggregation, and its own consensus. This series has already established, twice over, that all three carry real, physical, nonzero latency.

The question that leaves open has an answer this post can actually give, at the single-agent level, without needing to resolve anything about the fleet as a whole. What does *this* controller do, on its own, the moment its input, the shared price, goes stale or becomes unreachable?

### The Choice Is Consistency or Availability, Not Safety or Danger

That question already has a name, proven in a completely different corner of distributed systems engineering. A shared price signal is a consistency mechanism: it exists so every controller acts on the same, agreed view of how much capacity is actually available. Losing access to it, whether the control plane is down, the telemetry aggregation is stale, or consensus cannot currently be reached, is a network partition. Gilbert and Lynch formalized what that means when they proved Brewer's conjecture. In an asynchronous network, a system cannot guarantee both strong consistency and full availability once a partition genuinely separates it from the source of truth it depends on{{ cite(ref="17", title="Gilbert, S. & Lynch, N. (2002) -- Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services, ACM SIGACT News, 33(2), 51-59") }}.

Read the two options this section already named against that theorem directly. They are the two sides of Gilbert and Lynch's impossibility result, instantiated for this one controller, not two arbitrary engineering choices. Freezing chooses consistency: refuse to act on a price that might be stale, and accept the unavailability of continuing to adapt as the cost. Falling back chooses availability: keep adapting, keep serving the control objective, and accept that the view being acted on is no longer guaranteed consistent with what every other controller believes. There is no third option that keeps both. That is not because this platform's engineers failed to design one, but because Gilbert and Lynch proved, for the general case, that none exists once the partition is real.

Naming the choice this way does not change which option this post recommends. It changes the status of the recommendation, from an engineering judgment call specific to this running case, to an instance of a proven theorem this series did not need to re-derive.

<details>
<summary>Deeper: knowing which branch you are in is its own unsolved problem. FLP's impossibility result means no failure detector can perfectly tell a slow coordinator from a dead one, so the freeze/fallback choice trades one error rate against the other rather than removing the error.</summary>

{{ layer(n=1, type="Bound", id="the-paragraph-above-already-co") }}The paragraph above already conflates three distinct causes into one: "the control plane is down, the telemetry aggregation is stale, or consensus cannot currently be reached," treated as equivalent to a partition. That conflation is forced, not careless. It has a name older and more fundamental than Gilbert and Lynch's theorem. Fischer, Lynch, and Paterson proved it{{ cite(ref="18", title="Fischer, M.J., Lynch, N.A. & Paterson, M.S. (1985) -- Impossibility of Distributed Consensus with One Faulty Process, Journal of the ACM, 32(2), 374-382") }}. In an asynchronous system, no deterministic protocol can guarantee consensus in bounded time, even against a single process that might simply be slow. The reason is silence. A slow, live process and a genuinely crashed one look identical from every other process's local point of view, for as long as that other process is willing to wait.

The controller in this running case sits in that position with respect to the shared price signal. It cannot, from local observation alone, tell "the coordinator is dead" from "the coordinator, or the network between us, is merely slower right now than I expected." No amount of additional waiting converts that uncertainty into certainty. It only converts it into a longer wait.

{{ layer(n=1, type="Bound", id="what-a-real-system-does") }}FLP rules out doing this perfectly. What a real system does instead is implement an unreliable failure detector, Chandra and Toueg's term for it{{ cite(ref="19", title="Chandra, T.D. & Toueg, S. (1996) -- Unreliable Failure Detectors for Reliable Distributed Systems, Journal of the ACM, 43(2), 225-267") }}. It is a local oracle, typically a timeout, that outputs one suspicion: "I believe the coordinator has failed." That suspicion can be wrong in either direction. It can falsely suspect a coordinator that is merely slow, or it can miss the detection and keep trusting a coordinator that is actually gone. Read "freeze" and "fall back" this way and the choice named above sharpens further. It is a decision about which class of failure detector to build, not a decision made once a partition is somehow confirmed.

Every real timeout-based implementation of one sits on the same shape of tradeoff this post has already met once, in a completely different subsystem. Definition 2's ensemble, tuned to notice a regime shift quickly, pays for that speed with a higher false-alarm rate under heavy-tailed noise, verified in this post's IMM table at 3.08 percent and 12.44 percent against a light-tailed baseline of 0.03 percent. A failure detector tuned to suspect quickly pays for that speed the same way. Tuning it to catch a genuinely dead coordinator fast, so a controller does not keep trusting it too long, buys a higher rate of freezing against a coordinator that was only ever slow. These are two independent instances, in two subsystems this post built separately, of one abstract shape, not the same mechanism. A local test, forced to decide under time pressure from incomplete information, cannot minimize both kinds of error at once. It can only trade one against the other.

This sharpens what it means for the recommendation above. Freezing is still the safer default this post recommends, conditional on a trust or monitoring mechanism, per Falsification Criterion F13 and the Stag Hunt's trust condition. What FLP and Chandra-Toueg add is the reason no such mechanism, however carefully engineered, can be made perfectly accurate. The controller is choosing, permanently, which of two error rates to prefer, not choosing between a correct and an incorrect belief about the coordinator's state. This is a family of tradeoff this series already named once, under a different discipline entirely, in [The Simulation Singularity](@/blog/2026-09-13/index.md)'s account of a positive test bought cheap at the price of telling two hypotheses apart.

</details>

<details>
<summary>Deeper: the same impossibility prices latency too, even without a partition. PACELC extends Gilbert-Lynch to the ordinary case, and a delayed Kelly price can lose stability outright rather than just arrive late.</summary>

Gilbert and Lynch's theorem is a statement about what happens during a genuine partition. It has a natural extension to the ordinary, no-partition case this series has been pricing since [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md), where the price signal is merely slow rather than absent. Abadi names that extension directly: even when the network is not partitioned, a distributed system still trades consistency against latency, because waiting for a fully consistent view costs real, physical time{{ cite(ref="20", title="Abadi, D.J. (2012) -- Consistency Tradeoffs in Modern Distributed Database System Design: CAP is Only Part of the Story, IEEE Computer, 45(2), 37-42") }}. Abadi's compact form for it is: if there is a Partition, choose Availability or Consistency; Else, choose Latency or Consistency. That is PACELC, one acronym naming both tradeoffs instead of treating the ordinary case as a footnote to the partition case.

This is a name for a fact this series priced twice already, under two different vocabularies, not a new fact about this series' running case. This post's opening section already restated what [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) found: a shared Kelly-pricing coordination signal carries a physical latency floor. That floor is real, nonzero time consensus and telemetry aggregation cost even when nothing has failed. PACELC's "else, latency or consistency" branch is that floor, formalized. A controller can wait for the fully consistent price, paying that floor's latency, or it can act on a possibly-stale local view sooner, paying a consistency cost instead. This trade exists continuously, not only during the partition Gilbert and Lynch's theorem addresses.

The freeze-versus-fallback choice named above is this series' instance of PACELC's *partition* branch. Likewise, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s physical latency floor is this series' instance of its *else* branch, arrived at independently, under different vocabulary, before this post named the theorem that unifies them. Naming both under one acronym does not change either finding. It shows they were never two separate observations, one about outages and one about ordinary latency, but the same underlying tradeoff. They are sampled at two different points on one axis: how stale is the view being acted on, and who pays for making it fresher.

This deepens the distributed-systems row of the Ledger below without needing a Falsification Criterion of its own. PACELC names a second instance of a tradeoff this series had already priced under a different vocabulary, in [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s latency-floor finding. It does not add a new claim this post did not already make under Gilbert and Lynch's theorem alone.

Tighten this a step further. Latency so far has been priced only as a cost, how long a controller waits or how stale its view becomes, not as a threat to whether the shared price converges to a fair split at all. {{ layer(n=1, type="Bound", id="a-shared-price-fed-back") }}A shared price fed back to every controller with a real, physical, round-trip delay turns Kelly's proportional-fairness recursion into a delayed difference equation, not a slow one alone. Johari and Tan proved that distinction is not cosmetic. Past a delay-dependent threshold, and more sharply once round-trip delays across the fleet are heterogeneous rather than uniform, the equilibrium a synchronous analysis guarantees, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s idealized limit above, loses local stability outright. The price settles into a sustained oscillation around the fair split rather than converging to it{{ cite(ref="21", title="Johari, R. & Tan, D.K.H. (2001) -- End-to-end congestion control for the internet: delays and stability, IEEE/ACM Transactions on Networking, 9(6), 818-832") }}.

That is a materially different failure than the convergence transient [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s slow-tracking simulation found. That transient is the roughly 2.9-to-1 residual split at 80,000 rounds, closing toward Kelly's speed-independent equilibrium as the slow flow converges, independent of price-loop speed itself. A convergence transient is an efficiency cost: fairness reached late. A lost stability margin is worse: fairness never reached at all, replaced by a limit cycle a naive per-controller view cannot distinguish from ordinary price noise. This post has not measured whether this running case's control-plane latency, or its heterogeneity across the fleet, sits above or below that threshold, and does not claim it does. What PACELC's "else" branch prices above purely as a latency cost is doing double duty. The same physical delay this series already priced as a cost to efficiency is also, past an unmeasured threshold, a bound on whether the coordination mechanism is stable at all.

</details>

### Is Freezing Even a Stable Choice?

Everything said so far treats "freeze" as though it were simply the cheaper of two private costs, decided once, by one controller, in isolation. That framing quietly assumes something worth checking rather than assuming: that freezing is a decision this controller can make without needing to guess what every *other* controller, facing the identical outage at the identical moment, is about to do. It cannot. This is the two-player game it actually is, illustrative and symmetric rather than a claim about the full fleet. It is worth checking whether "freeze" survives contact with a second rational agent making the same calculation.

{{ layer(n=3, type="Estimate", id="assign-illustrative-costs-to-t") }}Illustrative costs go on the four outcomes, using this series' established facts wherever one is available rather than inventing a number where a citation already supplies it. Both freeze: each pays Corollary 1's frozen-policy cost, normalized to 1. Both fall back: each competes uncoordinated against the other, and even a fair, symmetric split does not erase the risk this series opened with. Simultaneous uncoordinated adaptation against a downstream dependency already stressed by an outage can tip it into the metastable regime [The Simulation Singularity](@/blog/2026-09-13/index.md) diagnosed, so that shared risk is priced at 1.3 each, worse than mutual freezing.

One freezes while the other falls back: the lone defector, facing no competition for whatever headroom exists, does only slightly better than baseline, priced at 1.1. A lone uncoordinated probe against a recovering dependency still carries real risk the missing price signal would otherwise have priced. The lone freezer, its fixed rate now crowded out by a counterpart that is actively adapting and it is not, pays the worst cost in the table, priced at 2.0. Corollary 1 bounds what a frozen policy costs *on its own terms*, holding its share of traffic fixed. It was never a claim that a frozen share stays the same size while an uncoordinated neighbor is actively expanding into it.

<div class="illustrative">

| | Other freezes | Other falls back |
|---|---|---|
| **I freeze** | 1, 1 | 2.0, 1.1 |
| **I fall back** | 1.1, 2.0 | 1.3, 1.3 |

</div>

What "crowded out" concretely means for the lone freezer is worth naming, rather than leave 2.0 justified only by an unweighted ratio lost to a bigger neighbor. {{ layer(n=2, type="Fit", id="this-post-s-own-joint-clearing") }}This post's joint-clearing-rate model, named above for this shape of shared, contended resource, gives the mechanism a precise form. Throughput past a comfortable concurrency threshold {% katex() %}C{% end %} falls as {% katex() %}sC^2/n{% end %}, a *decreasing* function of concurrent load {% katex() %}n{% end %}. It is not a fixed total two controllers are merely splitting unevenly.

An uncoordinated counterpart does not only claim a larger share of that total. Its own additional concurrent probing is the kind of load that pushes {% katex() %}n{% end %} further past {% katex() %}C{% end %}, so the total the two controllers are dividing is itself shrinking as the defector pushes into it. The lone freezer's cost of 2.0 prices a collapsing denominator in the shared dependency's throughput, not only a shrinking numerator, its share that a fixed neighbor happens to be claiming more of.

This is the same mechanism named at the top of this post, not a new one invented for the game. The specific {% katex() %}s{% end %}, {% katex() %}C{% end %}, and {% katex() %}n{% end %} this Stag Hunt's illustrative payoffs would need to reproduce 2.0 exactly are not claimed to match the executor pool's worked values above. This table was built illustratively rather than derived from them. Only the shape of the collapse is claimed to match, not a different, unrelated cost the game invents on its own.

Two claims in this table are worth verifying directly, rather than taking on faith. Is mutual freezing a Nash equilibrium: facing a freezing opponent, is freezing my best response? Compare my cost if I freeze, 1, against my cost if I defect instead, 1.1. One is smaller, so freezing is a best response to freezing. Is mutual fallback also a Nash equilibrium: facing a defecting opponent, is defecting my best response? Compare my cost if I fall back, 1.3, against my cost if I freeze alone against them instead, 2.0. Fallback is cheaper, so fallback is also a best response to fallback.

Both {% katex() %}(\text{Freeze},\text{Freeze}){% end %} and {% katex() %}(\text{Fallback},\text{Fallback}){% end %} are Nash equilibria, verified directly from the table, not asserted. This is the textbook structure of a Stag Hunt: two self-reinforcing equilibria, one Pareto-dominant, {% katex() %}(1,1){% end %} beating {% katex() %}(1.3,1.3){% end %}. Both players would prefer that outcome if they could coordinate on it, but the coordination mechanism that would normally let them do so is the shared price signal this whole scenario assumes is unavailable.

Whether a rational controller actually lands on the good equilibrium depends on what it believes the other will do, and this is where the asymmetry bites. Savage's minimax-regret criterion from [The Simulation Singularity](@/blog/2026-09-13/index.md) applies directly, rather than a new decision rule invented for this section. Regret compares my two choices against each other under one fixed state of the world, not one choice against itself across two different states.

If the other player freezes, my choices cost 1 (freeze) or 1.1 (fall back). Freezing is the best response to that state, so guessing fall back and being wrong there costs {% katex() %}1.1 - 1 = 0.1{% end %} more than guessing right would have. If the other player falls back, my choices cost 2.0 (freeze) or 1.3 (fall back). Falling back is the best response to that state, so guessing freeze and being wrong there costs {% katex() %}2.0 - 1.3 = 0.7{% end %} more than guessing right would have.

Freeze's worst-case regret, 0.7, is seven times larger than fallback's, 0.1. Fallback is the risk-dominant strategy, in the technical sense [The Simulation Singularity](@/blog/2026-09-13/index.md)'s minimax framework already established. It is the safer bet under genuine uncertainty about what a rational counterpart will do, even though it is not the jointly best outcome if trust could be established.

### From Two Controllers to a Fleet: Where the Tipping Point Sits

The two-player illustration above is deliberately the simplest case that still makes the mechanism checkable. It generalizes one step further, because the generalization has an exact answer, not just a qualitative one, and it sharpens the trust condition the two-player case already named rather than replacing it. What this generalization is not matters, before stating it. It is narrower: an incentive question about which of the two Nash equilibria a fleet of individually-safe controllers actually lands in, holding each controller's barrier as already valid. It is not a claim that a single controller's safety boundary composes across a fleet, the control-theoretic question "The Fleet Question This Post Does Not Answer" below leaves open on purpose.

{{ layer(n=3, type="Estimate", id="consider-katex-n-end-controlle") }}Consider {% katex() %}M{% end %} controllers, each facing the identical outage, each choosing freeze or fall back. Let {% katex() %}f{% end %} be the fraction of the other {% katex() %}M-1{% end %} controllers a given controller expects to fall back. The illustrative payoffs above extend by linear interpolation on {% katex() %}f{% end %}, the standard construction behind a threshold or tipping-point model of collective behavior{{ cite(ref="22", title="Schelling, T.C. (1978) -- Micromotives and Macrobehavior, W.W. Norton & Company") }}, pinned at the two-player corner cases already established rather than fit independently.

<span id="prop-4"></span>

**Proposition 4** (Fleet Defection Threshold). A controller's cost from freezing rises linearly from 1, at {% katex() %}f=0{% end %}, to exactly 2.0, at {% katex() %}f=1{% end %}, as more of its counterparts fall back and crowd out its fixed rate as the lone-freezer cell in the two-player table already prices: {% katex() %}C_{\text{freeze}}(f) = 1 + f{% end %}. Its cost from falling back rises linearly from 1.1 toward 1.3 over the same range, moving in the same direction rather than the opposite one, because more simultaneous fallback means more uncoordinated competition, not less: {% katex() %}C_{\text{fallback}}(f) = 1.1 + 0.2f{% end %}. These cross at exactly one point,

{% katex(block=true) %}
C_{\text{freeze}}(f^\ast) = C_{\text{fallback}}(f^\ast) \implies f^\ast = \frac{1.1-1}{1-0.2} = \frac{1}{8} = 0.125
{% end %}

below which freezing is every controller's individually rational best response, and above which falling back is.

where:

- {% katex() %}f^\ast{% end %} depends only on the four illustrative payoff values already justified above (1, 1.1, 1.3, 2.0), not on {% katex() %}M{% end %} itself: the threshold is a *fraction* of counterparts, so the same {% katex() %}f^\ast{% end %} applies regardless of fleet size
- this is a claim about which of two Nash equilibria a fleet of already-safe controllers lands in, not a claim that a single controller's safety boundary composes across a fleet, which "The Fleet Question This Post Does Not Answer" below leaves open on purpose

Sweep {% katex() %}f{% end %} across the full range to see the crossing directly, not only at its single solved point:

<div class="illustrative">

| Fraction of others expected to fall back ({% katex() %}f{% end %}) | Cost of freezing | Cost of falling back | Individually rational choice |
|---|---|---|---|
| 0.00 | 1.000 | 1.100 | Freeze |
| 0.10 | 1.100 | 1.120 | Freeze |
| **1/8 (= 0.125)** | **1.125** | **1.125** | **indifferent** |
| 0.20 | 1.200 | 1.140 | Fall back |
| 0.50 | 1.500 | 1.200 | Fall back |
| 1.00 | 2.000 | 1.300 | Fall back |

</div>

A defection rate of exactly one in eight, under this post's illustrative payoffs, is already enough to flip every remaining controller's best response from freeze to fallback. That is the sharper, quantitative form of the same trust condition the two-player case already named. Freezing is not merely fragile in the abstract. It has a specific, computable breaking point, and a fleet does not need anywhere close to a majority of its members to defect before the mutual-freeze equilibrium stops being anyone's best response. Falsification Criterion F15 states this threshold's testable form.

Here is what this means, stated plainly, for the single-agent recommendation this section opened with. Freezing is still this post's recommendation. It remains the Pareto-optimal choice if a controller has independent reason to trust that its counterparts will also freeze, a reasonable assumption for a small, known set of services operated by one team under one incident-response process. It is not a recommendation that survives being generalized to an arbitrary, uncoordinated fleet without that trust. The same minimax logic [The Simulation Singularity](@/blog/2026-09-13/index.md) used to price the cost of an unhedged bet says a controller genuinely uncertain about its peers' behavior has a real, quantified reason to defect toward fallback instead. That is the risk that makes "all freeze" a fragile equilibrium rather than a foregone conclusion. Falsification Criterion F13 already stated the condition under which fallback should be preferred outright; F14 below states the sharper, game-theoretic version this section actually establishes.

## The Fleet Question This Post Does Not Answer

This needs to be said plainly, rather than let the sections above imply more coverage than they actually have. Does a single controller's discrete-time stochastic control barrier function compose safely when several such controllers, across a fleet, probe the same shared downstream dependency at once? That is a real, open question. This series has named it on purpose since [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md), and this post does not resolve it.

Resolving it would need a genuinely different formal object: not a bound on one controller's worst-case behavior, but a result about the *joint* behavior of several barrier-filtered controllers sharing one dependency. That object plausibly needs its own game-theoretic layer on top of Corollary 2's magnitude bound, applied per-agent and extended to a multi-agent safe set. The control-theory literature already has a name for that shape: a decentralized or distributed multi-agent control barrier function.

Naming the category is not the same as having a citation that closes this gap. The published work under that name is built for agents that endanger each other directly, spatial collision avoidance among multiple robots sharing physical space. This post's agents endanger each other only indirectly, by jointly loading one contended resource none of them occupies physically. Reusing that machinery here would need the underlying safe-set coupling re-derived for a shared-capacity constraint, not a shared-space one, before any specific citation could honestly stand in this sentence.

That is a different, harder problem than the one this post was scoped to solve. Solving it here, on top of the magnitude bound, the actuator-inversion risk, and the heavy-tailed-noise tension already addressed above, would be the kind of conceptual overload this series has spent its review process learning to avoid. Falsification Criterion F8, stated back in [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md), remains the testable form of the claim that a fleet needs this coordination layer at all. This post neither answers it nor needs to, for everything above it to still stand.

State, briefly, why this is genuinely a different problem rather than a bigger version of the same one, since the difference is easy to elide. Definition 3's probability bound is proven against a *fixed* disturbance process, one whose statistics do not change in response to the barrier's filtering. That assumption holds for a single controller watching a downstream dependency it does not itself destabilize by watching. It stops holding the moment a second, third, and tenth controller are all filtering their actions against the *same* downstream dependency.

Each one's filtered behavior changes the load that dependency experiences. That, in turn, changes the disturbance every other controller's barrier is trying to bound. The disturbance stops being a fixed external process, becoming instead, in part, the aggregate output of the very mechanisms trying to bound it. That is the shift [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) named when it moved from a single dual-effect controller to a fleet of them sharing one bottleneck.

A single-agent probability bound is proven against a disturbance that does not react to the prover. A multi-agent bound is proven against one that does. These are different theorems about different kinds of object, not a smaller case and a larger case of the same one. This post has neither built that object nor claims to need it. Definition 3 and Corollary 2 hold at the scale they were actually proven for: one controller, one dependency, watched by a barrier that does not have to account for anyone else watching the same thing.

One direction is worth naming even though this post does not build it out. Recall that [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s Kelly-style pricing signal already fixes the *fairness* problem for a fleet of simultaneously probing controllers. Nothing about that signal is specific to the regulator it was built for. It is a plausible input to each node's QP, not only to its regulator. It could enter as a dynamic penalty weight inside Corollary 2's per-step objective. A node's filter would then grow more conservative, tightening its admission margin, as aggregate fleet-wide contention for the shared dependency rises, not only as its local queue does. That would give each node a reason to throttle back before the disturbance it is jointly creating with its neighbors gets bad enough to test any one node's barrier. It is the same coordination effect the price signal already buys for fairness, aimed at safety instead.

That is a plausible mitigation, not a proof, and the distinction matters here specifically. A dynamic penalty weight changes what each node's QP optimizes. It does not, by itself, establish that the resulting fleet-wide system satisfies any stated probability bound analogous to Definition 3's. The disturbance each node's barrier faces is still the aggregate behavior of every other node's filtered decision, now itself a function of the same shared price all of them are reading. Whether that closed loop is even stable, let alone provably safe at a stated {% katex() %}\epsilon{% end %}, is the genuinely different formal object named above, not a question a penalty term answers by existing.

There is a specific reason "whether that closed loop is even stable" is not a rhetorical hedge: this post has already priced the failure mode that makes it a real one. The deep dive on "the same impossibility prices latency too, even without a partition" showed, via Johari and Tan, that the same shared price this mitigation proposes feeding into each node's barrier can itself lose local stability under realistic, heterogeneous round-trip delay. It settles into a sustained oscillation around the fair split rather than converging to it.

A penalty weight built from a price that is oscillating is a periodic forcing term the barrier's disturbance model was never calibrated to expect. It is layered on top of the disturbance the barrier already watches, not a stable, slowly-varying input tightening each node's margin in step with genuine contention. Definition 3's probability bound assumes a fixed disturbance process. Feeding it an oscillating coordination signal as a correction does not fix that assumption; it adds a second, self-inflicted way to violate it.

Falsification Criterion F8 still states the open, testable form of the claim. This paragraph narrows what a candidate fix would specifically have to survive, beyond simply staying stable in the absence of it, before it could close the gap it names.

## The Boundary Is Congruence-Proof for a Reason Worth Naming

One more connection is worth making explicit before the closing apparatus, because leaving it implicit would waste the one piece of vocabulary this whole series has been building toward.

A rulebook, the alternative this post opened by rejecting, is congruent by construction. It only ever checks for the failure modes its author already imagined. It reports "no rule violated" with the same confidence whether that silence means genuine safety or an unimagined blind spot. A discrete-time stochastic control barrier function is a different kind of object specifically because it does not check a list. It checks a region, continuously, against the system's actual current state. Its own {% katex() %}\epsilon{% end %} is falsifiable in a way a rulebook's silence never is: run the system long enough, and either it leaves {% katex() %}\mathcal{C}{% end %} more often than {% katex() %}\epsilon{% end %} allows, or it does not.

That is real, load-bearing progress, and it would be dishonest to bury it under the caveats this post has spent its length adding. It is also not a full escape from congruence, and this post's argument is the reason why. A barrier certified only against Definition 3's probability bound is never checked against Corollary 2's magnitude bound. It agrees with its calibration in the same way [The Simulation Singularity](@/blog/2026-09-13/index.md)'s simulator agreed with its historical corpus: correct as far as it goes, and silently blind to the one dimension, severity, it was never built to watch. The fix is the same one this series keeps reaching for, not a different philosophy. Price the dimension the current check cannot see, explicitly, rather than let a passing grade on one axis stand in for safety on every axis nobody thought to check.

## Model Scope and Failure Envelope

**Claim.** The discrete-time stochastic CBF bounds the probability of an excursion.
- *Assumption:* The disturbance model the barrier was calibrated against still describes the system's actual current disturbance.
- *Failure Mode:* A regime shift outside the calibrated disturbance class, per "The Cycle Finds Drift, the Barrier Has to Watch the Cliff," is invisible to {% katex() %}\epsilon{% end %} until it has already happened.

**Claim.** Bounding {% katex() %}\epsilon{% end %} is sufficient for operational safety.
- *Assumption:* Excursion severity, conditional on occurring, is not heavy-tailed.
- *Failure Mode:* Under a heavy tail, the worked table above shows the same {% katex() %}\epsilon{% end %} certifying worst-case excursions differing by four orders of magnitude; Corollary 2's CVaR extension is required, not optional, once severity is heavy-tailed.

**Claim.** A BBR-style probe cycle's drain phase pays down what its probe phase built.
- *Assumption:* Downstream capacity is roughly stationary across one full cycle.
- *Failure Mode:* If capacity collapses below 75 percent of the estimate the cycle's gains are computed against, the drain phase adds to the queue instead of draining it, and the resulting backlog does not clear itself once the estimate re-adapts.

**Claim.** Definition 3's barrier construction applies directly to the admission-control layer's dynamics.
- *Assumption:* The system has relative degree exactly one: the control input affects the barrier function's rate of change directly, not only its higher derivatives.
- *Failure Mode:* A system where admission decisions only affect queue occupancy indirectly, through an intermediate state the controller cannot set directly, has higher relative degree. It needs High-Order CBFs instead{{ cite(ref="16", title="Xiao, W. & Belta, C. (2022) -- High-Order Control Barrier Functions, IEEE Transactions on Automatic Control, 67(7), 3655-3662") }}. Naively applying Definition 3 as stated would understate the control authority actually required to stay safe. A concurrent runtime's connection pooling or lock contention is a concrete instance of this failure mode. The admission decision sets how many requests are let in, but that decision only reaches queue occupancy after passing through a pooled-connection state the controller does not set directly. This is the same relative-degree-two structure Definition 4 was built to handle, elsewhere in this post, for a different intermediate state entirely. Definition 4 as stated derives {% katex() %}\varphi_1{% end %} from a bandwidth estimate's rate of change. A connection-pool-mediated system would need {% katex() %}\varphi_1{% end %} re-derived from the pool's occupancy dynamics instead, not reused unchanged. The construction generalizes, even though the specific instance does not. A different failure mode is easy to conflate with this one, and it needs its name. Pure transit delay, network round trips, executor spooling, a downstream dependency's response time, is neither a chain-of-integrator structure the control input passes through nor higher relative degree in Xiao and Belta's sense. High-Order CBFs answer the first failure mode. They do not, by themselves, answer the second. Predictor-feedback control barrier functions are the correct tool for that second case{{ cite(ref="23", title="Molnar, T.G., Kiss, A.K., Ames, A.D. & Orosz, G. (2023) -- Safety-Critical Control with Input Delay in Dynamic Environment, IEEE Transactions on Control Systems Technology, 31(4), 1507-1520") }}. They reconstruct the delayed state from the input history, rather than restructuring the barrier's derivative chain. That is the right tool once delay itself, not intermediate structure, separates an admission decision from its effect on queue occupancy. This post's admission-control layer sits close enough to its queue to treat network transit as negligible relative to the control loop's cycle time. A control plane spanning a slower network path would not get to make that assumption for free.

**Claim.** Rejecting proactively reduces total backlog-time under sustained overload, as this post's reference model shows.
- *Assumption:* The executor pool's joint clearing rate is *coupled* to how many of its own members are simultaneously busy, not fixed independently of it: past a comfortable concurrency, real contention, connection or thread-pool exhaustion, lock contention, memory pressure, degrades every busy executor's rate, not only the newest arrival's, the specific relationship this post's reference model's per-executor rate function encodes.
- *Failure Mode:* In a classical decoupled buffer, where each server's service rate is fixed and does not depend on how many peers are simultaneously busy, ordinary queueing theory holds instead: a larger buffer only ever helps or is neutral to long-run throughput, converting a burst into delay rather than loss, and proactive rejection would be pure throughput loss with no offsetting gain. This model's result is conditional on the coupling above; it is not a general argument against buffering, and a system where servers genuinely do not contend with each other should size its buffer for its expected burst, not shed load early on this post's authority.

**Claim.** The per-step QP jointly enforcing Definition 3 and Corollary 2 always returns some action, possibly an expensive one.
- *Assumption:* The joint feasible set stays non-empty across the running case's operating envelope, the assumption Corollary 3's cost-floor argument leaves unexamined.
- *Failure Mode:* Per "A Cost Floor Assumes a Solution Exists at All," a highly constrained state can empty the feasible set entirely rather than merely shrink it; the QP then returns no action at all, a harder failure than the cost floor prices, and the fix, an explicit backup policy per Chen, Jankovic, Santillo, and Ames, is not something this post has built.

**Claim.** This model's {% katex() %}(C/n)^2{% end %} throughput collapse follows the correct asymptotic shape for a coherency-dominated system.
- *Assumption:* Queueing contention is negligible next to the coherency penalty, {% katex() %}\sigma \approx 0{% end %} in USL terms, the condition under which USL's asymptotic tail matches this model's {% katex() %}1/N{% end %} decay.
- *Failure Mode:* Gunther's formula confirms only the tail exponent, not this post's specific ceiling number: a {% katex() %}\sigma \approx 0{% end %} USL curve fit to this model's comfortable-load rate gives roughly 67 requests per second at {% katex() %}n=8{% end %}, not the 75 this post derives and verifies directly against its reference model. The two curves are not the same function, only the same tail; the 75 figure was never re-derived from USL and does not depend on it.

**Reversal Condition.** This post's central recommendation, that a discrete-time stochastic control barrier function with an explicit magnitude bound is required rather than a probability bound alone, reverses when the disturbance the barrier defends against is genuinely light-tailed, with a provably bounded worst case. Under that condition, Definition 3's probability bound and Corollary 2's magnitude bound converge to saying nearly the same thing, since no single excursion can be arbitrarily costly regardless of how the tail is modeled, and building the CVaR extension buys little beyond what {% katex() %}\epsilon{% end %} alone already prices. Distributed admission-control systems facing correlated-retry regimes, the running case this entire series has priced, essentially never meet this condition, which is why the reversal is stated but not expected to apply here.

## Falsification Criteria

A claim that cannot be wrong is not a claim. Parts 1 and 2 stated the conditions under which their central assertions would fail. This post continues that numbering rather than restarting it, and states the conditions under which its ten central assertions would fail:

- a probability bound requires an independent magnitude bound under heavy tails
- a probe cycle's drain phase can fail to drain
- the ensemble's regime-detection is untrustworthy under heavy-tailed noise until shown otherwise
- freezing is the safer single-agent default when the coordination signal is lost
- freezing is not a self-enforcing choice without a trust or monitoring mechanism
- a fleet's tipping point away from mutual freezing sits at a specific, computable defection fraction rather than somewhere unknowable
- jointly enforcing a probability bound and a magnitude bound trades real control authority rather than costing nothing
- the per-step QP jointly enforcing both bounds can lose feasibility entirely, not just grow more expensive, without an explicit backup guarantee
- the barrier and ensemble both start from a historical prior and stay vulnerable until enough persistent excitation accumulates to correct it
- the 1/N throughput-collapse shape is structurally required for a coherency-dominated system, not an arbitrary curve fit to this one running case

<details>
<summary>The ten criteria in full</summary>

**F10 (the magnitude bound is unnecessary), refining [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s F9 now that the mechanism it asked about actually exists.**
- *Condition:* a discrete-time stochastic control barrier function satisfying only Definition 3's probability bound, with no CVaR or other magnitude-aware extension, is shown to also bound expected excursion severity under a genuinely heavy-tailed disturbance, without Corollary 2's added constraint.
- *If confirmed:* Corollary 2 is redundant, and this post's central addition to Part 3's original formal apparatus collapses to a restatement of Definition 3. [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s F9 asked this exact question prospectively, before Definition 3 was built; "The Boundary Only Watches Probability" above already tested it directly, with the severity table showing a probability bound alone does not bound magnitude, so F9's condition is not confirmed as this post stands. F10 restates F9 against the actual, now-built mechanism, and remains open to the same reversal.

**F11 (the drain phase never actually fails in practice).**
- *Condition:* it is shown, empirically or by a tighter model than this post's worked table, that BBR's actual windowed-maximum bandwidth estimator adapts fast enough, or that real downstream capacity collapses are shallow enough, that the drain phase's net-positive-queue regime identified above (capacity below 75 percent of the pre-collapse estimate) essentially never occurs in production traffic.
- *If confirmed:* the actuator-inversion risk this post names is a modeling artifact, not a real operational concern, and Part 3's safety mechanism does not need the sub-cycle abort capability this section calls for.

**F12 (the ensemble is trustworthy under heavy tails without modification).**
- *Condition:* Definition 2's interacting-multiple-model ensemble, tuned with a small, constant mixing probability in the same spirit as [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s mechanism, is shown not to increase its false regime-shift rate when tested against a genuinely heavy-tailed noise process matching this post's severity model.
- *If confirmed:* the tension this post names between fast regime-detection and heavy-tailed false alarms does not exist in practice, and any future stopping rule built on this ensemble could trust its trigger signal without a separate heavy-tail-robustness argument.

**F13 (falling back, not freezing, is the safer single-agent default).**
- *Condition:* it is shown that a controller falling back to uncoordinated local dual control when the shared price signal is unreachable incurs a bounded cost, comparable to or better than Corollary 1's frozen-policy cost, rather than the unbounded starvation dynamic [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s simulation demonstrates for the uncoordinated multi-agent case.
- *If confirmed:* this post's recommendation to freeze rather than fall back should be reversed, or at minimum qualified to the specific conditions under which fallback's cost stays bounded.

**F14 (mutual freezing is the unique, self-enforcing equilibrium).**
- *Condition:* the freeze-versus-fallback game named above is shown, under a realistic payoff structure rather than this post's illustrative one, to have mutual freezing as its only Nash equilibrium, or to have fallback's worst-case regret exceed freeze's, contrary to the risk-dominance finding above.
- *If confirmed:* the single-agent recommendation to freeze needs no trust or monitoring qualification, and the Stag Hunt framing this section builds collapses to a restatement of Falsification Criterion F13.

**F15 (the fleet's tipping point sits somewhere other than a one-in-eight defection fraction).**
- *Condition:* under a realistic payoff structure rather than this post's illustrative linear interpolation, the fraction of other controllers a given controller must expect to fall back before fallback becomes its individually rational best response is shown to differ substantially from the {% katex() %}f^\ast = 0.125{% end %} this post's worked model finds, or the relationship is shown not to be well-approximated by linear interpolation between the two-player corner cases at all.
- *If confirmed:* the specific tipping-point number this post reports is an artifact of its own illustrative payoff choice, not a property of the underlying mechanism, though the qualitative finding, that some fleet-wide tipping point exists and is well short of a majority, would still need to be independently re-examined rather than assumed false.

**F16 (jointly enforcing both bounds costs nothing in practice).**
- *Condition:* in the running case's actual operating envelope, Corollary 2's CVaR constraint is shown to rarely or never bind against Definition 3's probability constraint, so that tightening one bound's margin does not measurably worsen the other, contrary to Corollary 3's achievable-region illustration above.
- *If confirmed:* the Pareto-frontier framing in "The Two Bounds Trade Against Each Other, Not for Free" is a theoretical possibility without practical bite in this specific running case, and an operator can treat both bounds as effectively free to tighten simultaneously here, though the underlying constrained-optimization argument, that shrinking a feasible set cannot lower an optimum, remains true regardless.

**F17 (the joint safety filter never actually loses feasibility in practice).**
- *Condition:* it is shown, empirically against this post's reference model or by a tighter argument than Corollary 3's cost-floor one, that the per-step QP jointly enforcing Definition 3's probability constraint and Corollary 2's CVaR constraint always has a nonempty feasible set across the running case's actual operating envelope, without requiring an explicit backup policy of the kind Chen, Jankovic, Santillo, and Ames construct.
- *If confirmed:* "A Cost Floor Assumes a Solution Exists at All" names a theoretical risk without practical bite in this specific running case, the same shape of resolution F16 states for the achievable-region frontier, and this post's two-constraint filter can be trusted as stated without a backup-set extension. If disconfirmed, Proposition 3 and Corollary 2 as this post states them are incomplete as a safety filter, not just costly, at states where the joint feasible set empties out, and would need the backup-policy construction this post has not built.

**F18 (the bootstrap window is short enough not to matter).**
- *Condition:* it is shown, empirically or by a tighter argument than the qualitative one in "Bootstrapping the Boundary Before Any Telemetry Exists," that Cyclic Adaptive Regulation's ensemble and Definition 3's barrier converge from a conservative historical prior to their stated guarantees, a trustworthy false-alarm rate and a calibrated {% katex() %}\epsilon{% end %} respectively, within a number of cycles short enough that the system is not meaningfully exposed to the exact regime the initial, historically-calibrated prior was blind to.
- *If confirmed:* the bootstrapping vulnerability named above is a transient, boundable cost rather than an open-ended one, and a team can treat the warm-up period as a known, priced risk rather than an unquantified one. If disconfirmed, a genuinely novel regime arriving during the warm-up window is defended by the same historical prior [The Simulation Singularity](@/blog/2026-09-13/index.md) already showed fails, and this post's safety claims hold only after that window closes, not from time zero.

**F19 (the 1/N tail shape is not structurally required, and other exponents are equally plausible for a coherency-dominated system).**
- *Condition:* a system with negligible queueing contention ({% katex() %}\sigma \approx 0{% end %} in USL terms) and a genuine per-pair coherency penalty ({% katex() %}\kappa > 0{% end %}) is shown, empirically or by a tighter argument than Gunther's rational-function derivation, to exhibit throughput decay asymptotically different from 1/N at large concurrency.
- *If confirmed:* this post's reference model's choice of {% katex() %}(C/n)^2{% end %} decay would need to be re-examined as an unexplained empirical fit rather than a structurally required shape. The specific 75 requests-per-second ceiling this post verifies directly against its code would be unaffected either way, since that number was never derived from USL in the first place.

</details>

## The Property Verdict Ledger, Continued

**Discrete-Time Stochastic Control Barrier Function, with Worst-Case CVaR Extension**

*Formal Proposition:* Proposition 3, High-Probability Safety Filtration, extended by Corollary 2, Worst-Case CVaR Extension.

*Production Instance:* this post's reference model, the same contention-compounded, health-scaled admission queue this post opened with. It enters a genuinely non-recovering state, not a slow one, once traffic exceeds the executor pool's derived joint ceiling while downstream health is degraded, the excursion a barrier calibrated to the queue's threshold is built to prevent, and the excursion whose *severity*, once it happens, Definition 3 alone cannot price.

*Exact vs. Approximate:* Layer 1 exact for the discrete-time probability bound (Cosner, Culbertson & Ames) and for the worst-case CVaR magnitude bound (Kishida), each as proven in its cited setting; Layer 2 approximate for applying either bound to an admission-control queue specifically, a setting neither citation was proven for; Layer 3 approximate for the actuator-inversion and heavy-tailed-ensemble sections, this post's worked constructions, not restatements of any cited theorem.

*Verdict:* a probability-only safety filter resolves the organizational half of [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s closing gap, giving a reviewer a boundary to approve once. It does not, by itself, resolve the statistical half. Under a heavy tail, bounding how often the boundary is crossed is a different, weaker guarantee than bounding how bad a crossing can be. This post's worked comparison shows the gap between those two guarantees can span four orders of magnitude, at an identical, reviewer-approved {% katex() %}\epsilon{% end %}.

Read this post's sections as more than one discipline converging on the same requirement, the way Parts 1 and 2 read their ledger rows.

| Discipline | What it contributes | Where it appears above |
|---|---|---|
| Control theory | Establishes the probability-of-exit bound, the CBF-CLF-QP mechanism that filters actions to it, a High-Order CBF sketch of the rate-of-change constraint the actuator-inversion gap needs, and the constrained-optimization fact that jointly enforcing a probability bound and a magnitude bound trades real control authority, not a free second guarantee | Cosner, Culbertson & Ames; Clark; Ames, Xu, Grizzle & Tabuada; Xiao & Belta; Mestres et al.; Definition 3, Proposition 3, Definition 4, Corollary 3 |
| Risk and decision theory | Names the specific, formal gap between a probability bound and a magnitude bound, supplies the worst-case CVaR construction that closes it, and reuses [The Simulation Singularity](@/blog/2026-09-13/index.md)'s minimax-regret criterion to select between two self-enforcing equilibria | Kishida; Corollary 2; Wald and Savage, reused from [The Simulation Singularity](@/blog/2026-09-13/index.md), in "Is Freezing Even a Stable Choice?" |
| Distributed systems engineering | Supplies the concrete actuator-inversion failure mode, the organizational precedent for bounded safety experiments, the formal impossibility result naming why a lost coordination signal forces a choice rather than a compromise, that same result's extension to the ordinary, no-partition latency cost this series had already priced under a different name, the proven threshold past which that same latency stops being only a cost and starts eroding the shared price's stability, and the deeper impossibility result explaining why a controller cannot even locally confirm which side of that choice it is on | Basiri, Hochstein, Jones & Tucker; Gilbert & Lynch; Fischer, Lynch & Paterson; Chandra & Toueg; Abadi; Johari & Tan; "When the Probe Causes the Cliff It Is Measuring For"; "The Choice Is Consistency or Availability, Not Safety or Danger"; "the same impossibility prices latency too, even without a partition" (deep dive); "knowing which branch you are in is its own unsolved problem" (deep dive) |
| Game theory | Names this model's no-rejection baseline as a congestion game's uncoordinated equilibrium, prices the resulting inefficiency directly as a price-of-anarchy gap, shows the single-agent freeze recommendation is Pareto-optimal but not uniquely stable, a Stag Hunt with two Nash equilibria rather than one dominant strategy, and generalizes the two-player case to an exact, computable fleet-wide tipping point | Rosenthal; Roughgarden & Tardos; Schelling; "Why Rejecting Early Is Not Merely a Good Idea, It Is the Coordinated Equilibrium"; "Is Freezing Even a Stable Choice?"; Proposition 4 |
| Cybernetics and verification theory | Explains, in this series' vocabulary, why a probability-only barrier remains a form of congruence even though it is a genuine improvement on a rulebook, and names this model's recovery-time behavior directly, metastability and critical slowing down below a derived threshold, genuine bistability above it, not an invented trap | "The Boundary Is Congruence-Proof for a Reason Worth Naming"; "Naming the Shape: Metastability, Not an Invented Trap" |
| Practitioner systems literature | Credits the safe-reinforcement-learning lineage this post's barrier-filtered-controller architecture belongs to, and weighs this post's reviewable probability and magnitude bounds directly against three real, deployed admission-control systems that already solve problems this post's barrier does not | Cheng, Orosz, Murray & Burdick; Zhou et al. (DAGOR); Cho et al. (Breakwater); Landau, Thurston & Bozarth; "What This Buys Over Deployed Overload Control" |

This post's six disciplines share the same standing property Parts 1 and 2 established for their six and five. None of these six needed the others to reach its conclusion. Five of them, borrowed from fields with nothing to do with software, converge on the same diagnosis independently. That convergence is closer to a property of what a boundary drawn once is actually for than an artifact of whichever field happened to describe it first. The sixth is not quite like the other five, and the difference is worth naming rather than smoothing over. It does not converge on the same diagnosis from an independent angle, the way the first five do. Instead it weighs this post's diagnosis against a body of work that solved adjacent problems first, honestly stating where this post's contribution stands relative to it rather than adding a sixth confirmation.

## What This Buys Over Deployed Overload Control

Everything above has been argued against a hand-built rulebook, the strawman "Why a Rulebook Cannot Do This Job" opened with. That comparison is honest as far as it goes and incomplete in a way worth naming directly: production admission control did not stop at rulebooks. Real, published, deployed systems already run more sophisticated mechanisms than a rulebook. A reviewer who has actually operated one of them is entitled to ask what this post's barrier adds over what they already have, not over a strawman built to lose.

**DAGOR**, WeChat's overload-control system, is the sharpest comparison available. It targets this post's layer: per-request admission decisions across a fleet of interdependent microservices, not a single-node control loop. Each service monitors its load in real time. Once overload is detected, services shed requests collaboratively with whatever they depend on, prioritizing by a business-assigned importance level rather than treating every request identically{{ cite(ref="24", title="Zhou, H., Chen, M., Lin, Q., Wang, Y., She, X., Liu, S., Gu, R., Ooi, B.C. & Yang, J. (2018) -- Overload Control for Scaling WeChat Microservices, Proceedings of the ACM Symposium on Cloud Computing (SoCC 2018), 149-161") }}. It has run in WeChat's production backend since before its publication. That is the kind of battle-tested, priority-aware admission logic this post's model does not have. Definition 3's barrier treats every request identically once it decides whether to admit or reject, and says nothing about which request to shed first when shedding is required. A reviewer choosing between the two is not choosing between a real system and a toy. DAGOR already solves the priority-differentiation problem this post's barrier is silent on.

**Breakwater**, built for microsecond-scale RPCs, solves a different piece of the same problem. It is a server-driven, credit-based admission scheme. Credits are sized to the server's observed queueing delay, and the scheme converges to a stable operating point within milliseconds of a load surge, without a human choosing a fixed latency threshold in advance{{ cite(ref="25", title="Cho, I., Saeed, A., Fried, J., Park, S.J., Alizadeh, M. & Belay, A. (2020) -- Overload Control for microsecond-scale RPCs with Breakwater, 14th USENIX Symposium on Operating Systems Design and Implementation (OSDI 20)") }}. Read against Definition 3, Breakwater's credits are themselves an admission filter, and its self-derived delay target is a self-calibrating disturbance model, the kind "The Cycle Finds Drift, the Barrier Has to Watch the Cliff" named this post's barrier as lacking. {% katex() %}\epsilon{% end %} here is fixed once, at review time. Breakwater's credit target keeps re-deriving itself from the server's observed queueing behavior instead.

**Netflix's adaptive concurrency limits** are the production successor to the fixed limiter this post's opening paragraph named as current practice. They derive their ceiling the same self-calibrating way. A gradient algorithm tracks divergence between a long-window and a short-window average of observed request latency, using the minimum observed round-trip time as a moving baseline, not a number an operator configures once and never revisits{{ cite(ref="26", title="Landau, E., Thurston, W. & Bozarth, T. (2018) -- Performance Under Load, Netflix Technology Blog, March 23") }}. No {% katex() %}\epsilon{% end %}, no reviewer sign-off, no probability bound. The limit adjusts continuously, and the guarantee it offers is empirical rather than stated in advance.

The comparison deserves to be plain, rather than let three citations imply more humility than the argument actually needs. What this post's barrier adds, that none of the three above states as a first-class guarantee, is Definition 3's {% katex() %}\epsilon{% end %}. It is a number a reviewer can read once, before deployment, and hold the system to afterward, plus Corollary 2's magnitude bound on top of it. DAGOR, Breakwater, and Netflix's limiter all report how they behave. None of the three publishes a reviewable probability that a declared safe region will hold, or a bound on how bad an excursion can get conditional on leaving it. That is a real, specific gap between what this literature already deploys and what this post's formalism offers, not a difference in maturity.

What the comparison does not buy this post is exemption from what those three systems already solved and this post has not: DAGOR's priority-aware shedding, and Breakwater's and Netflix's self-calibrating disturbance models that need no separately maintained {% katex() %}\epsilon{% end %}. In DAGOR's case specifically, that also includes coordination across a fleet of interdependent services, the fleet-composition question "The Fleet Question This Post Does Not Answer" names as open here. A reviewer weighing this post's barrier against an existing DAGOR-style deployment is weighing a reviewable, falsifiable safety number against a self-tuning, priority-aware, already-running system with none of that number. Neither dominates the other outright, and this post is not the one to adjudicate the trade for a specific fleet. Naming both sides of it honestly is what this section adds that the earlier rulebook comparison alone did not.

Credit the architecture's lineage here, since Proposition 3's scope-of-novelty bullet above deferred it to this section. Wrapping an otherwise-unconstrained learned or heuristic policy with a barrier-function safety filter is this post's Cyclic-Adaptive-Regulation-plus-Definition-3 structure. It is the standard shape of safe reinforcement learning, established for continuous robotic control several years before this post's running case{{ cite(ref="27", title="Cheng, R., Orosz, G., Murray, R.M. & Burdick, J.W. (2019) -- End-to-End Safe Reinforcement Learning through Barrier Functions for Safety-Critical Continuous Control Tasks, AAAI 2019, arXiv:1903.08792") }}. This post's contribution is not the wrapping pattern itself, which that literature already owns. It is the pattern's transposition onto an admission-control decision, a discrete accept-throttle-reject choice rather than a continuous actuator command, and the specific composition with Corollary 2's magnitude bound on top of it. A reader who already knows the safe-RL literature should read this post's Definition 3 and Proposition 3 as an instance of a known pattern in a new setting, not as a new pattern.

## What This Post Did Not Claim

Every worked model in this post is an illustration of a cited result, not a restatement of it, and none of its specific numbers generalize. The 5-percent-versus-four-orders-of-magnitude severity comparison, the 75-percent drain-failure threshold, the exact backlog left by one bad cycle: change the anchors, change the barrier function, change the disturbance model, and the numbers change with them. What survives a change of anchors is the shape each illustration makes concrete, the same standard this series has held itself to since [The Simulation Singularity](@/blog/2026-09-13/index.md).

This post's application of Definition 3 and Proposition 3 to an admission-control queue has not been claimed to have any precedent in the cited control-barrier-function literature. That literature is built almost entirely around robotic and vehicular actuation, and applying it here is this post's synthesis, stated as such. Corollary 2, likewise, is not claimed to be anything more than this post's combination of an existing probability bound and an existing magnitude bound. That combination is jointly stated for the first time in this series' running case, not a result independently proven in the cited papers for this specific setting.

The actuator-inversion risk in "When the Probe Causes the Cliff It Is Measuring For" is not claimed to have ever been observed in a real BBR deployment. It is a worked consequence of BBR's published gain structure and this series' health-scaled clearing model, offered as a named, quantified risk, not a documented incident. Nor does the High-Order CBF construction in "A Formal Sketch of the Missing Mechanism" claim to resolve that risk. It names a specific formal object with a specific, stated residual gap: a sharper open question rather than a closed one.

The achievable-region table in "The Two Bounds Trade Against Each Other, Not for Free" does not claim to reflect the literal functional form of either Cosner, Culbertson & Ames's or Kishida's actual bound. Only the underlying constrained-optimization fact is a general claim: adding a constraint to a convex program cannot lower its optimum. Falsification Criterion F16 states the condition under which the tradeoff would have no practical bite in this specific running case regardless.

Fischer, Lynch & Paterson's impossibility result and Chandra and Toueg's failure-detector taxonomy are not claimed to have been applied here in the fully formal sense either paper proves results in. The deep dive on "knowing which branch you are in is its own unsolved problem" uses both to explain why the freeze/fallback choice cannot rest on a perfectly accurate local test. That is a structural point the cited theorems support directly, not a claim that this running case's timeout logic has been formally verified against either paper's model.

Freezing is not claimed to be the universally correct response to a lost coordination signal, or a strategy immune to unilateral defection. Instead, "What One Controller Does When the Coordinator Goes Quiet" states a specific, single-agent recommendation under this series' priced alternatives, reversible under Falsification Criterion F13. Its own game-theoretic analysis names the exact condition, verified trust between controllers, under which that recommendation is stable rather than merely cheaper in isolation.

The {% katex() %}f^\ast = 0.125{% end %} tipping point in "From Two Controllers to a Fleet" is not claimed to be a property of real fleets, rather than of this post's illustrative, linearly-interpolated payoff structure. Falsification Criterion F15 states the condition under which the number itself would need revision, though not necessarily the qualitative existence of some tipping point well short of a majority. Nowhere in this post is it claimed that a single controller's safety boundary composes across a fleet of simultaneously probing services. That question is named, on purpose, as unresolved, in "The Fleet Question This Post Does Not Answer," not answered by implication anywhere else in this post.

{% cognitive_map(root="Safe in Probability, Not in Size") %}
{
  "intro": "A perpetual probe is mathematically necessary and organizationally hard to approve. What follows traces the boundary built to make it approvable once rather than trusted forever. Then it asks the harder question of that boundary itself: what it actually bounds, where its machinery can still break, and what a fleet of them sharing one dependency still leaves unverified.",
  "groups": [
  {"theme": "A Boundary Instead of a Rulebook", "c": "mint", "points": [
    [1, "A Region, Not a Rulebook", "A rulebook enumerates failure modes someone already imagined. A discrete-time stochastic control barrier function bounds a region instead, which is what lets a reviewer approve it once rather than trusting every experiment it permits."],
    [2, "Freedman Sharpens the Bound", "Definition 3's probability bound, sharpened by Freedman's inequality, is a genuine improvement over older, worst-case barrier constructions, and does not require the barrier function itself to be bounded above."],
    [3, "Clark's Correction, Precisely Scoped", "A real correction exists in this literature, and it is precisely scoped. Clark's 2021 zero-CBF almost-sure-safety theorem was shown false in 2023, but the flaw is specific to that theorem. It does not touch the reciprocal-CBF construction, or the weaker, ε > 0 probability bound, this post actually relies on."],
    [4, "Two Rules Compose Into Lock-In", "This model's congestion-compounded clearing rate shows a rulebook's blind spot directly: two individually reasonable degradation rules, health-scaled and occupancy-scaled, compose into a self-sustaining lock-in neither rule alone predicts."],
    [5, "Modeling Tax Recurs at the Safety Layer", "A barrier calibrated against a historical disturbance model is not automatically calibrated against a disturbance the historical record never produced, the same modeling tax <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a> priced, recurring at the safety layer."],
    [6, "The 1/N Tail Is Structurally Required", "This model's (C/n)^2 throughput collapse is not a curve chosen to fit the data. Gunther's Universal Scalability Law, reduced to the case where contention is negligible next to the coherency penalty, forces throughput to fall as 1/N for any such system. It confirms only the tail exponent, not this post's specific ceiling number. A sigma approx 0 USL curve fit to this model's comfortable-load rate gives roughly 67 requests per second at n=8, not the 75 this post derives and verifies directly against its code."]
  ]},
  {"theme": "Probability Is Not Magnitude", "c": "sky", "points": [
    [7, "Probability and Magnitude Differ", "Probability and magnitude are different guarantees. This post's numerical comparison shows three designs, identically certified at a 5 percent chance of an excursion, whose worst observed excursion differs by more than four orders of magnitude once severity is heavy-tailed."],
    [8, "Kishida's CVaR Bridges the Gap", "Kishida's worst-case CVaR control barrier function is the existing, verified literature bridge from a probability bound to a magnitude bound. Corollary 2 states the combined guarantee precisely: both bounds, jointly enforced, not one substituting for the other."],
    [9, "Both Bounds Cost Real Authority", "Jointly enforcing both bounds is not free. Shrinking a convex program's feasible set can only raise its optimal cost, never lower it, so a fixed control-authority budget traces a genuine achievable-region frontier between how tight ε can go and how tight the severity bound can go. That is the same lower-envelope logic <a href=\"/blog/cost-of-knowing-part2-dual-control-and-the-weaponized-probe/\">Dual Control and the Weaponized Probe</a> used for its cost-over-time tradeoff, applied here to a tradeoff over safety dimensions instead."],
    [10, "A Cost Floor Isn't a Feasibility Guarantee", "A cost floor is not a feasibility guarantee. The per-step QP enforcing both bounds can lose its feasible set entirely at a highly constrained state, not just grow more expensive. This post has not built the explicit backup policy the control-barrier-function literature uses to rule that out."],
    [11, "The Drain Phase's Own Failure Threshold", "BBR's drain phase assumes downstream capacity is stationary across one cycle. This post's worked table finds the exact threshold at which that assumption fails. Capacity at or below 75 percent of the estimate the cycle's gains were computed against is the point where the drain phase adds to the queue instead of paying it down."]
  ]},
  {"theme": "Where the Boundary's Own Machinery Breaks", "c": "peach", "points": [
    [12, "The Backlog Doesn't Clear Itself", "The backlog from one such cycle does not clear itself afterward, even once the bandwidth estimate correctly adapts to the new, lower capacity. Ordinary operation at a correctly adapted estimate holds a queue steady; it does not repay a debt incurred before the estimate adapted."],
    [13, "A Candidate Fix, Not Yet a Proof", "The actuator-inversion gap has a candidate formal fix, not yet a proof. A High-Order CBF constraint on the margin's rate of consumption, not only its current value, would catch a probe phase collapsing capacity before the margin itself hits zero. The fix inherits the same stale-estimate blind spot one derivative removed rather than resolved."],
    [14, "Fast Detection Trades Against False Alarms", "Definition 2's ensemble, verified once against simple noise, has a genuine tension under heavy-tailed noise between fast regime-detection and false alarms. This post's IMM table quantifies it directly: a false-alarm rate near zero under light-tailed noise rises to single digits under a heavy tail and higher still under a very heavy one. That has consequences for this post's safety filter and for any future rule that would trigger on the same signal."],
    [15, "Freeze or Fallback Can't Be Confirmed Locally", "A controller cannot even locally confirm which side of the freeze/fallback choice it is on. Fischer, Lynch, and Paterson proved a slow, live coordinator and a genuinely dead one are indistinguishable from local observation alone. Any real implementation is necessarily an unreliable failure detector in Chandra and Toueg's sense, trading false suspicions against missed detections in the same shape this post's ensemble already traded fast detection against false alarms."],
    [16, "Consistency or Availability, Never Both", "When a shared coordination signal is lost, a single controller faces the choice Gilbert and Lynch proved is unavoidable under a genuine partition: consistency (freeze) or availability (fall back), never both. PACELC extends the same impossibility to the ordinary, no-partition case, naming the physical latency floor <a href=\"/blog/cost-of-knowing-part2-dual-control-and-the-weaponized-probe/\">Dual Control and the Weaponized Probe</a> had already priced under different vocabulary. Modeled as a two-player game against another controller facing the same outage, both mutual freezing and mutual fallback are Nash equilibria, a Stag Hunt. Freezing is Pareto-better if trust holds, but fallback carries seven times less worst-case regret under <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a>'s minimax criterion. That makes fallback the risk-dominant, not the recommended, choice once that trust cannot be verified."]
  ]},
  {"theme": "The Fleet, and What's Still Unverified", "c": "rose", "points": [
    [17, "The Fleet's Exact Tipping Point", "Generalized to a fleet, the same game has an exact tipping point. Under this post's illustrative payoffs, once more than exactly one in eight of a controller's counterparts is expected to fall back, falling back becomes every remaining controller's individually rational best response. That is a small threshold, not a majority-defection one."],
    [18, "Fleet Composition Stays an Open Question", "Whether one controller's safety boundary composes across a fleet of many, sharing one downstream dependency, remains the open question <a href=\"/blog/cost-of-knowing-part2-dual-control-and-the-weaponized-probe/\">Dual Control and the Weaponized Probe</a> named it as. This post does not answer it, on purpose, to avoid collapsing under a payload no single post should carry."],
    [19, "The Fix That Oscillates Instead", "A candidate fix feeds the shared Kelly price into each node's barrier as a dynamic penalty weight. It has a specific failure mode this post has already priced under a different name: Johari and Tan's delay-induced instability means that price can itself oscillate rather than converge. That turns the proposed fix into a periodic disturbance the barrier's calibration never accounted for."],
    [20, "Still Congruent, Just on One Axis", "A probability-only barrier is real progress over a rulebook, and it is still a form of congruence: it agrees with its calibration, correctly, right up until the one dimension, severity, it was never built to check."],
    [21, "Both Start From a Historical Prior", "Both the ensemble and the barrier must start from a historical prior on day zero, the same kind of source this series has spent three posts distrusting. What makes this different from the failure diagnosed in <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a> is that Cyclic Adaptive Regulation's cycle keeps generating new information to correct that prior, where a frozen simulator never did. The correction takes real cycles to arrive, though, not zero."],
    [22, "Deployed Systems Already Solve Half of This", "DAGOR, Breakwater, and Netflix's adaptive concurrency limits are real, running admission-control systems, not strawmen. Each already solves something this post's barrier does not: priority-aware shedding, a self-calibrating disturbance model, or both. What this post's barrier adds over all three is a reviewable epsilon and a magnitude bound stated in advance. What it does not have is any of their own already-solved machinery, and a reviewer weighing the two is weighing a falsifiable number against an already-running system, not choosing a strictly better option."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**A Boundary Instead of a Rulebook**

1. A rulebook enumerates failure modes someone already imagined. A discrete-time stochastic control barrier function bounds a region instead, which is what lets a reviewer approve it once rather than trusting every experiment it permits.
2. Definition 3's probability bound, sharpened by Freedman's inequality, is a genuine improvement over older, worst-case barrier constructions, and does not require the barrier function itself to be bounded above.
3. A real correction exists in this literature, and it is precisely scoped. Clark's 2021 zero-CBF almost-sure-safety theorem was shown false in 2023, but the flaw is specific to that theorem. It does not touch the reciprocal-CBF construction, or the weaker, {% katex() %}\epsilon > 0{% end %} probability bound, this post actually relies on.
4. This model's congestion-compounded clearing rate shows a rulebook's blind spot directly: two individually reasonable degradation rules, health-scaled and occupancy-scaled, compose into a self-sustaining lock-in neither rule alone predicts.
5. A barrier calibrated against a historical disturbance model is not automatically calibrated against a disturbance the historical record never produced, the same modeling tax [The Simulation Singularity](@/blog/2026-09-13/index.md) priced, recurring at the safety layer.
6. This model's {% katex() %}(C/n)^2{% end %} throughput collapse is not a curve chosen to fit the data. Gunther's Universal Scalability Law, reduced to the case where contention is negligible next to the coherency penalty, forces throughput to fall as 1/N for any such system. It confirms only the tail exponent, not this post's specific ceiling number. A {% katex() %}\sigma \approx 0{% end %} USL curve fit to this model's comfortable-load rate gives roughly 67 requests per second at {% katex() %}n=8{% end %}, not the 75 this post derives and verifies directly against its code.

**Probability Is Not Magnitude**

7. Probability and magnitude are different guarantees. This post's numerical comparison shows three designs, identically certified at a 5 percent chance of an excursion, whose worst observed excursion differs by more than four orders of magnitude once severity is heavy-tailed.
8. Kishida's worst-case CVaR control barrier function is the existing, verified literature bridge from a probability bound to a magnitude bound. Corollary 2 states the combined guarantee precisely: both bounds, jointly enforced, not one substituting for the other.
9. Jointly enforcing both bounds is not free. Shrinking a convex program's feasible set can only raise its optimal cost, never lower it, so a fixed control-authority budget traces a genuine achievable-region frontier between how tight {% katex() %}\epsilon{% end %} can go and how tight the severity bound can go. That is the same lower-envelope logic [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) used for its cost-over-time tradeoff, applied here to a tradeoff over safety dimensions instead.
10. A cost floor is not a feasibility guarantee. The per-step QP enforcing both bounds can lose its feasible set entirely at a highly constrained state, not just grow more expensive. This post has not built the explicit backup policy the control-barrier-function literature uses to rule that out.
11. BBR's drain phase assumes downstream capacity is stationary across one cycle. This post's worked table finds the exact threshold at which that assumption fails. Capacity at or below 75 percent of the estimate the cycle's gains were computed against is the point where the drain phase adds to the queue instead of paying it down.

**Where the Boundary's Own Machinery Breaks**

12. The backlog from one such cycle does not clear itself afterward, even once the bandwidth estimate correctly adapts to the new, lower capacity. Ordinary operation at a correctly adapted estimate holds a queue steady; it does not repay a debt incurred before the estimate adapted.
13. The actuator-inversion gap has a candidate formal fix, not yet a proof. A High-Order CBF constraint on the margin's rate of consumption, not only its current value, would catch a probe phase collapsing capacity before the margin itself hits zero. The fix inherits the same stale-estimate blind spot one derivative removed rather than resolved.
14. Definition 2's ensemble, verified once against simple noise, has a genuine tension under heavy-tailed noise between fast regime-detection and false alarms. This post's IMM table quantifies it directly: a false-alarm rate near zero under light-tailed noise rises to single digits under a heavy tail and higher still under a very heavy one. That has consequences for this post's safety filter and for any future rule that would trigger on the same signal.
15. A controller cannot even locally confirm which side of the freeze/fallback choice it is on. Fischer, Lynch, and Paterson proved a slow, live coordinator and a genuinely dead one are indistinguishable from local observation alone. Any real implementation is necessarily an unreliable failure detector in Chandra and Toueg's sense, trading false suspicions against missed detections in the same shape this post's ensemble already traded fast detection against false alarms.
16. When a shared coordination signal is lost, a single controller faces the choice Gilbert and Lynch proved is unavoidable under a genuine partition: consistency (freeze) or availability (fall back), never both. PACELC extends the same impossibility to the ordinary, no-partition case, naming the physical latency floor [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) had already priced under different vocabulary. Modeled as a two-player game against another controller facing the same outage, both mutual freezing and mutual fallback are Nash equilibria, a Stag Hunt. Freezing is Pareto-better if trust holds, but fallback carries seven times less worst-case regret under [The Simulation Singularity](@/blog/2026-09-13/index.md)'s minimax criterion. That makes fallback the risk-dominant, not the recommended, choice once that trust cannot be verified.

**The Fleet, and What's Still Unverified**

17. Generalized to a fleet, the same game has an exact tipping point. Under this post's illustrative payoffs, once more than exactly one in eight of a controller's counterparts is expected to fall back, falling back becomes every remaining controller's individually rational best response. That is a small threshold, not a majority-defection one.
18. Whether one controller's safety boundary composes across a fleet of many, sharing one downstream dependency, remains the open question [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) named it as. This post does not answer it, on purpose, to avoid collapsing under a payload no single post should carry.
19. A candidate fix feeds the shared Kelly price into each node's barrier as a dynamic penalty weight. It has a specific failure mode this post has already priced under a different name: Johari and Tan's delay-induced instability means that price can itself oscillate rather than converge. That turns the proposed fix into a periodic disturbance the barrier's calibration never accounted for.
20. A probability-only barrier is real progress over a rulebook, and it is still a form of congruence: it agrees with its calibration, correctly, right up until the one dimension, severity, it was never built to check.
21. Both the ensemble and the barrier must start from a historical prior on day zero, the same kind of source this series has spent three posts distrusting. What makes this different from the failure diagnosed in [The Simulation Singularity](@/blog/2026-09-13/index.md) is that Cyclic Adaptive Regulation's cycle keeps generating new information to correct that prior, where a frozen simulator never did. The correction takes real cycles to arrive, though, not zero.
22. DAGOR, Breakwater, and Netflix's adaptive concurrency limits are real, running admission-control systems, not strawmen. Each already solves something this post's barrier does not: priority-aware shedding, a self-calibrating disturbance model, or both. What this post's barrier adds over all three is a reviewable epsilon and a magnitude bound stated in advance. What it does not have is any of their own already-solved machinery, and a reviewer weighing the two is weighing a falsifiable number against an already-running system, not choosing a strictly better option.

</details>

**Compute it.** Before approving a control barrier function as the safety layer for a probe that never stops, ask two separate questions, not one: what is the stated {% katex() %}\epsilon{% end %}, the probability of ever leaving the safe region, and separately, what is the worst excursion the barrier's disturbance model allows for, conditional on that {% katex() %}\epsilon{% end %}-event actually happening. A barrier can report an excellent answer to the first question and an unbounded answer to the second, and under a genuinely heavy-tailed disturbance, both of those things are true at once far more often than a single clean {% katex() %}\epsilon{% end %} would suggest.

This post replaced a rulebook, congruent with whatever its author happened to imagine, with a boundary that is falsifiable against the system's actual behavior. That boundary is still congruent with one thing: the disturbance model it was calibrated against, and the one dimension, magnitude, its probability bound alone was never built to see. Corollary 2 prices that second dimension explicitly, rather than letting a passing {% katex() %}\epsilon{% end %} stand in for a safety claim it was never measuring.

What remains, once probability and magnitude are both priced and the boundary itself is drawn, is the question this series has been building toward from its first page.

<div class="pull-quote">Exploring costs less than not exploring. A probe engineered correctly costs less than one built to repeat the original mistake. A boundary drawn once costs less than review paid forever.</div>

Given all three, exactly when does the model stop being the cheaper choice and the probe become the required one. That question is still open when this post ends.

---
<sup>[1]</sup> Gunther, N.J. (2008). *A General Theory of Computational Scalability Based on Rational Functions.* arXiv:0808.1431.

<sup>[2]</sup> Rosenthal, R.W. (1973). *A class of games possessing pure-strategy Nash equilibria.* International Journal of Game Theory, 2, 65-67.

<sup>[3]</sup> Roughgarden, T. & Tardos, E. (2002). *How bad is selfish routing?* Journal of the ACM, 49(2), 236-259.

<sup>[4]</sup> Cosner, R.K., Culbertson, P. & Ames, A.D. (2024). *Bounding Stochastic Safety: Leveraging Freedman's Inequality with Discrete-Time Control Barrier Functions.* IEEE Control Systems Letters, 8, 1937-1942.

<sup>[5]</sup> Clark, A. (2021). *Control barrier functions for stochastic systems.* Automatica, 130, 109688.

<sup>[6]</sup> So, O., Clark, A. & Fan, C. (2023). *Almost-Sure Safety Guarantees of Stochastic Zero-Control Barrier Functions Do Not Hold.* arXiv:2312.02430.

<sup>[7]</sup> Ames, A.D., Xu, X., Grizzle, J.W. & Tabuada, P. (2016-17). *Control Barrier Function Based Quadratic Programs for Safety Critical Systems.* IEEE Transactions on Automatic Control, DOI 10.1109/TAC.2016.2638961, arXiv:1609.06408.

<sup>[8]</sup> Mestres, P., Mousavi, S.S., Ong, P., Yang, L., Das, E., Burdick, J.W. & Ames, A.D. (2025). *Explicit Control Barrier Function-based Safety Filters and their Resource-Aware Computation.* arXiv:2512.10118.

<sup>[9]</sup> Basiri, A., Hochstein, L., Jones, N. & Tucker, H. (2019). *Automating Chaos Experiments in Production.* Proceedings of the 41st International Conference on Software Engineering: Software Engineering in Practice (ICSE-SEIP), arXiv:1905.04648.

<sup>[10]</sup> Schroeder, B., Wierman, A. & Harchol-Balter, M. (2006). *Open Versus Closed: A Cautionary Tale.* NSDI '06: 3rd USENIX Symposium on Networked Systems Design and Implementation, 239-251.

<sup>[11]</sup> Altshuller, G.S. (1984). *Creativity as an Exact Science: The Theory of the Solution of Inventive Problems.* Gordon and Breach.

<sup>[12]</sup> Ashby, W.R. (1956). *An Introduction to Cybernetics.* Chapman and Hall (Chapter 11, The Law of Requisite Variety).

<sup>[13]</sup> Resnick, S.I. (1997). *Heavy tail modeling and teletraffic data.* Annals of Statistics, 25(5), 1805-1869.

<sup>[14]</sup> Kishida, M. (2023-25). *A Risk-Aware Control: Integrating Worst-Case CVaR with Control Barrier Function.* arXiv:2308.14265; published as *Risk-Aware Control: Integrating Worst-Case Conditional Value-At-Risk With Control Barrier Function*, IET Control Theory & Applications, 19, e70024.

<sup>[15]</sup> Chen, Y., Jankovic, M., Santillo, M. & Ames, A.D. (2021). *Backup Control Barrier Functions: Formulation and Comparative Study.* arXiv:2104.11332.

<sup>[16]</sup> Xiao, W. & Belta, C. (2022). *High-Order Control Barrier Functions.* IEEE Transactions on Automatic Control, 67(7), 3655-3662.

<sup>[17]</sup> Gilbert, S. & Lynch, N. (2002). *Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services.* ACM SIGACT News, 33(2), 51-59.

<sup>[18]</sup> Fischer, M.J., Lynch, N.A. & Paterson, M.S. (1985). *Impossibility of Distributed Consensus with One Faulty Process.* Journal of the ACM, 32(2), 374-382.

<sup>[19]</sup> Chandra, T.D. & Toueg, S. (1996). *Unreliable Failure Detectors for Reliable Distributed Systems.* Journal of the ACM, 43(2), 225-267.

<sup>[20]</sup> Abadi, D.J. (2012). *Consistency Tradeoffs in Modern Distributed Database System Design: CAP is Only Part of the Story.* IEEE Computer, 45(2), 37-42.

<sup>[21]</sup> Johari, R. & Tan, D.K.H. (2001). *End-to-end congestion control for the internet: delays and stability.* IEEE/ACM Transactions on Networking, 9(6), 818-832.

<sup>[22]</sup> Schelling, T.C. (1978). *Micromotives and Macrobehavior.* W.W. Norton & Company.

<sup>[23]</sup> Molnar, T.G., Kiss, A.K., Ames, A.D. & Orosz, G. (2023). *Safety-Critical Control with Input Delay in Dynamic Environment.* IEEE Transactions on Control Systems Technology, 31(4), 1507-1520.

<sup>[24]</sup> Zhou, H., Chen, M., Lin, Q., Wang, Y., She, X., Liu, S., Gu, R., Ooi, B.C. & Yang, J. (2018). *Overload Control for Scaling WeChat Microservices.* Proceedings of the ACM Symposium on Cloud Computing (SoCC 2018), 149-161.

<sup>[25]</sup> Cho, I., Saeed, A., Fried, J., Park, S.J., Alizadeh, M. & Belay, A. (2020). *Overload Control for microsecond-scale RPCs with Breakwater.* 14th USENIX Symposium on Operating Systems Design and Implementation (OSDI 20).

<sup>[26]</sup> Landau, E., Thurston, W. & Bozarth, T. (2018). *Performance Under Load.* Netflix Technology Blog, March 23.

<sup>[27]</sup> Cheng, R., Orosz, G., Murray, R.M. & Burdick, J.W. (2019). *End-to-End Safe Reinforcement Learning through Barrier Functions for Safety-Critical Continuous Control Tasks.* AAAI 2019, arXiv:1903.08792.
