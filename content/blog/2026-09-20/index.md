+++
authors = ["Yuriy Polyulya"]
title = "Dual Control and the Weaponized Probe"
description = "A scheduled canary test for the failure you already suspect is a second simulator built to agree with you. Feldbaum's 1960 dual control theory supplies the alternative: a control action that regulates the system and keeps testing its own estimates, with no scheduled point where it stops. TCP BBR has run one at internet scale since 2016."
date = 2026-09-20
slug = "cost-of-knowing-part2-dual-control-and-the-weaponized-probe"
draft = false

[taxonomies]
tags = ["distributed-systems", "control-theory", "systems-thinking", "queueing-theory"]
series = ["cost-of-knowing"]

[extra]
toc = false
series_order = 2
series_title = "The Cost of Knowing: Dual Control, Bounded Probing, and the Limits of Forward Simulation"
series_description = """<div class="series-lede">Every simulation answers one question and raises three new ones.</div>A simulator validated against history has never once been wrong about the past, which is why its clean result is so easy to mistake for evidence. This series asks when to stop simulating and start learning from live operation. Each part prices one step: what refusing to explore really costs, how a controller can measure while it operates, what a safety boundary has to bound, and the point where one more simulation costs more than it can teach. Every part ends by naming the condition under which its own recommendation reverses. An architecture is only as honest as the failure condition it names."""
+++

[The Simulation Singularity](@/blog/2026-09-13/index.md) ended with a number. A platform team's shadow-routing admission-control policy was validated against six months of history. It then met a correlated-retry regime that window had only a roughly one-in-six chance of ever producing. The regime broke the queue. The postmortem blamed a monitoring gap. Proposition 1 said the real cost was structural: refusing to explore an unknown environment does not eliminate the cost of not knowing it. It compounds the cost, silently, until an incident collects the bill.

<div class="recap-box">
<span class="recap-label">Argument so far</span>
<ul>
<li><strong>The incident.</strong> A shadow-routing policy validated against six months of history met a correlated-retry regime that window had almost no chance of producing, and the queue broke.</li>
<li><strong><a href="/blog/cost-of-knowing-part1-the-simulation-singularity/">The Simulation Singularity</a>'s Proposition 1.</strong> Refusing to explore an unknown environment does not eliminate the cost of not knowing it. It compounds the cost, silently, at a provable regret floor, until an incident collects the bill.</li>
<li><strong>What this post asks next.</strong> If exploring is required, what kind of exploring actually pays for the regret it is supposed to buy back, and what does the wrong kind cost instead?</li>
</ul>
</div>

The platform team reads that postmortem, or one shaped like it. They reach a conclusion that sounds like progress: they should explore. Somebody proposes the obvious next step. Route a burst of synthetic traffic through the shadow-routing layer in production, shaped like the traffic that broke it, and see what happens.

Make the proposal concrete, the way the incident that motivated it was concrete. The on-call lead drafts a two-week canary window: three times normal peak volume, with a synthetic correlated-retry component dialed to roughly fifteen percent of total traffic. It is the closest approximation the team can build to the regime that shattered the queue. The plan gets a named owner and a scheduled start on a low-traffic Tuesday. It gets a rollback trigger tied to error-rate thresholds, and a review meeting where two senior engineers sign off on the blast radius before it ships. Every part of that description is the sign of a well-run engineering organization. It is doing exactly what it should, given what it currently understands the problem to be. None of it is enough. The reason has nothing to do with how carefully the two weeks are planned.

This post is about why that instinct, doing something instead of nothing, is not yet the fix, and about the specific way it fails.

## The Second Mistake Looks Like the First One's Opposite

Call the proposed test what it actually is. A fixed, bounded injection: some volume of synthetic requests, some duration, run once, inspected, then torn down. The team schedules it, runs it, watches the dashboards, and files the results. It feels like the opposite of the failure diagnosed in [The Simulation Singularity](@/blog/2026-09-13/index.md). That post's simulator sat still and trusted history. This test moves, deliberately, into territory history never covered.

Sitting still and moving once share the same underlying mistake, run at two different sample sizes. Both are congruence. A simulator that only replays history agrees with history by construction. A canary shaped to match the one regime already suspected agrees with the team's own suspicion by construction. Neither one was built with a way to disagree with what it already believed going in.

A bounded, one-shot injection is a single draw from whatever distribution the test happens to hit. Say the regime that matters is a heavy-tailed, correlated-retry burst. A single scheduled test, run for a fixed window at a fixed intensity, samples the body of that distribution far more reliably than it samples the tail. [The Simulation Singularity](@/blog/2026-09-13/index.md) already established this same statistical fact for the original historical window, and it applies here regardless of anything specific to this team's own test: a bounded sample of a rare regime is, in expectation, a sample of zero occurrences of that regime, dressed up as due diligence.

The platform team, in other words, is at real risk of building a second simulator. This one runs live traffic instead of replayed history. Its owners will call it an experiment rather than a validation pass. But it still answers the question "does the system survive traffic that looks like history," not the question that actually matters: "does the system survive the traffic that does not look like history yet."

Five disciplines check that finding from here on, each for a different reason a bounded test could still be the right call despite the argument above:

- **Control theory** for the actual fix, a control action engineered never to fully agree with itself
- **Cybernetics** for why the same identifiability requirement holds independent of control theory entirely
- **Behavioral economics, cognitive psychology, and organizational sociology** together for why a team reaches for the weaker design anyway and reads a quiet track record as safety
- **Game theory** for why a fix that works for one controller does not automatically work for a fleet of them sharing a resource
- **Engineering economics** for whether the fix is worth building at all, independent of whether the statistics above are accepted

The Ledger near the end of this post names all five again, with the specific sections each one grounds.

## Why a Team Reaches for a One-Shot Test Anyway

It is worth pausing on why a competent team still reaches for a bounded, scheduled test rather than something that runs indefinitely, even having just read a postmortem that makes exactly this point. The statistics above are available to them. The obstacle is organizational, and it has nothing to do with this platform team specifically.

### The Approval Shape Problem

A bounded test has a shape that a change-management process already knows how to approve. It has a defined scope, a start time, an end time, a named owner. Its rollback plan is simple: let the test finish, or kill it early. A reviewer can read that proposal in ten minutes and sign off, because its blast radius is stated in advance and bounded in time.

A policy that probes its own production traffic forever has no such shape. It never finishes. There is no meeting at which it gets a final sign-off, because it is never done being reviewed. It is either running or it is not. Asking an organization to approve something with no natural endpoint is asking it to approve an open-ended, standing modification to how a production system behaves, a fundamentally different and less comfortable kind of request than approving a two-week experiment.

This is not a failure of judgment on the reviewer's part. [The Simulation Singularity](@/blog/2026-09-13/index.md) used Herbert Simon's account of bounded rationality to explain why a team stops validating at "checks against all available history." The same account applies here. A reviewer facing a request with an unbounded scope has no natural stopping point for how much scrutiny is enough. The organizationally rational response is to prefer requests that come with their own stopping point built in.

A one-shot test supplies that stopping point for free. Cyclic Adaptive Regulation, by its own Definition 2, cannot: a probe with a scheduled end is exactly the design this post has spent several sections arguing does not work.

### Loss Aversion Sharpens the Asymmetry

A second, independent behavioral account sharpens why the two proposals feel asymmetrically risky to approve, even when the expected-value arithmetic favors the standing change. Kahneman and Tversky's account of decision-making under risk found that people weigh a loss roughly twice as heavily as an equivalently sized gain, against whatever reference point they currently hold, not symmetrically as a rational expected-value calculation would{{ cite(ref="1", title="Kahneman, D. & Tversky, A. (1979) -- Prospect Theory: An Analysis of Decision under Risk, Econometrica, 47(2), 263-291") }}.

A reviewer's reference point for a one-shot test is the status quo before the test runs. If the test goes badly, the loss is bounded, attributable to a known, time-boxed event that ends on schedule regardless. A reviewer's reference point for a standing Cyclic Adaptive Regulation policy is a production system whose behavior has now permanently changed. If that goes badly, the loss is an open-ended departure from the reference point, with no scheduled return to it, not just a bad two weeks.

Loss aversion predicts exactly the asymmetry the change-management framing above describes from the outside. The reviewer has not miscalculated [The Simulation Singularity](@/blog/2026-09-13/index.md)'s crossover. The two proposals are simply not being weighed against the same reference point, and the standing policy's downside is weighted more heavily precisely because it has no built-in expiration.

### The Canary Test Was Chosen to Confirm, Not to Discriminate

There is a third reason, underneath the approval-shape argument and the loss-aversion account, and it does not depend on organizations at all. [The Simulation Singularity](@/blog/2026-09-13/index.md) names it directly: people default to testing a hypothesis in whatever way is most likely to confirm it, not in whatever way would best tell it apart from an alternative{{ cite(ref="2", title="Klayman, J. & Ha, Y. (1987) -- Confirmation, Disconfirmation, and Information in Hypothesis Testing, Psychological Review, 94(2), 211-228") }}{{ cite(ref="3", title="Baron, J., Beattie, J. & Hershey, J.C. (1988) -- Heuristics and Biases in Diagnostic Reasoning: II. Congruence, Information, and Certainty, Organizational Behavior and Human Decision Processes, 42(1), 88-110") }}.

The two-week canary window described at the start of this post is a clean instance. It is shaped like the traffic that broke the queue, deliberately, because that is the regime the team already suspects. A test built that way is likely to confirm the suspicion if the suspicion is right. It was never built to discriminate between "the suspected regime is the only problem" and "the suspected regime is one instance of a broader class the original simulator could never have covered."

{{ layer(n=2, type="Fit", id="part-s-own-illustration-of") }}[The Simulation Singularity](@/blog/2026-09-13/index.md)'s own illustration of this bias showed its cost concentrates in the genuinely uncertain middle, not at the extremes, and costs almost nothing when a team is already nearly certain either way. A team building a canary test right after an incident is rarely in that certain territory. They know the specific regime that broke things. They do not yet know whether it was the only one, which is exactly the uncertain condition under which a congruence-biased test costs the most.

This does not replace the under-sampling problem this section opened with. It adds a second, independent reason the same test was the wrong instrument: it was built to succeed if the team's current theory is right, not to find out whether a bigger theory is needed.

### The Approval Gap This Post Leaves Open

That gap, between what the mathematics recommends and what an ordinary approval process can readily approve, is left open here rather than solved. A safety mechanism could fix it, if it let a reviewer approve a boundary once rather than approving every experiment the boundary permits. That is what would turn Cyclic Adaptive Regulation from a design an individual engineer can justify on paper into a design an organization can actually run, and designing that mechanism is not attempted in this post.

Proposition 2 establishes that continuous probing is mathematically necessary. It says nothing about how continuous probing gets approved. That silence is a specific, named gap, left standing at the end of this post, not an oversight quietly filled in on the side.

## What Feldbaum Actually Proved

The fix is neither a bigger one-shot test nor a weekly instead of one-time schedule, though the second gets closer. Making the test bigger or more frequent re-optimizes at the same level of abstraction that produced the gap: test size and test schedule. The {% term(url="@/blog/2025-12-27/index.md#the-constraint-sequence-framework", def="A candidate constraint cannot be resolved by re-optimizing at the level of abstraction that revealed it; the dependency graph determines which constraint must be secured before the next one becomes binding") %}Constraint Sequence Framework{% end %} names why that cannot work: a constraint cannot be resolved at the level of abstraction that exposed it, and the binding one here sits one level down, in what the control action already does structurally. The fix requires naming, precisely, what the team's control action is actually supposed to be doing. The relevant theory here is older than either simulator: Alexander Feldbaum's dual control theory, from 1960{{ cite(ref="4", title="Feldbaum, A.A. (1960-61) -- Theory of Dual Control, I-IV, Avtomatika i Telemekhanika") }}.

### The Dual Effect, Precisely Stated

Feldbaum's claim is stated for a general class of control problems under parameter uncertainty. A control action taken inside an unknown environment is never purely regulatory. It has a dual effect: it steers the system toward whatever the control objective wants, and it also changes what the controller can learn about the system's true, unknown parameters, whether or not anyone intended it to. His own result: an optimal controller, one that actually accounts for this, allocates some of its behavior specifically to reducing uncertainty about the environment, not only to regulating it.

This is not the same claim as "you should test your system." It is a claim about what a single control action is already doing, structurally, whether the team notices or not. Every admission-control decision the shadow-routing layer makes is simultaneously an act of regulation and an act of measurement, whether it accepts, throttles, or rejects a given request. The measurement half is usually just thrown away, because nobody built a mechanism to keep it.

### Why the One-Shot Injection Is Not the Dual Effect

Go back to the one-shot injection with this in hand. What it actually is, in Feldbaum's terms, is a separate signal: deliberately constructed and deliberately injected, run alongside normal operation rather than through it. It is not the dual effect at all. That distinction has its own name and its own literature, older than dual control theory and developed for a different purpose. The field is optimal experiment design: the discipline of choosing an input signal specifically to make a system's unknown parameters identifiable from the response{{ cite(ref="5", title="Mehra, R.K. (1974) -- Optimal Input Signals for Parameter Estimation in Dynamic Systems--Survey and New Results, IEEE Transactions on Automatic Control, 19(6), 753-768") }}.

There is nothing wrong with optimal experiment design as a discipline. It is a real, rigorous field, and the platform team's instinct to inject a shaped test signal is not stupid. But it is not the dual effect, and confusing the two costs the team something specific. A designed test signal is, definitionally, separate from the system's own regulating behavior. It runs when someone schedules it. It stops when someone tears it down. Every hour it is not running, the system reverts to pure regulation with a passively decaying store of information, and [The Simulation Singularity](@/blog/2026-09-13/index.md) already showed that condition has an unavoidable, compounding cost.

### The Question This Leaves

The dual effect does not have this gap. It has no off switch separate from the system's own operation. As long as the system is regulating anything, under Feldbaum's framing, it is also measuring something.

The question worth asking is not "how do we design a good test." It is "how do we stop discarding the measurement our regulation is already generating for free, every time it runs." The next section states that question as a formal definition, precisely enough to build against.

This is the actual antidote to congruence, not a bigger dose of testing. A one-shot test, however large, is still a single decision about what to check, made once, from inside whatever the team already believes. The dual effect has no such decision point to get captured by belief in the first place. It is a property of a control law that never stops generating information as a byproduct of regulating, not a decision to test at all. It never has a moment at which it could quietly settle for confirming what it already thinks.

## The Formal Apparatus

<span id="def-2"></span>

<details>
<summary>Definition 2 -- Cyclic Adaptive Regulation: a control policy that never stops measuring what it regulates</summary>

**Definition 2** (Cyclic Adaptive Regulation). A continuous control policy in which the regulatory action itself serves as the epistemic sensor, eliminating the need for a separately injected diagnostic perturbation{{ cite(ref="6", title="Li, Z., Chen, W-H., Yang, J., Yan, Y. (2023) -- Dual Control of Exploration and Exploitation for Auto-Optimisation Control with Active Learning, arXiv:2301.11984") }}. An ensemble of parameter estimators tracks the uncertainty in the system's current model of its environment. The control action is chosen to jointly minimize tracking error and that estimated uncertainty, not to minimize tracking error alone while treating uncertainty reduction as a separate concern.

where:

- the "regulatory action" is whatever the admission-control layer already does on every request: accept, throttle, or reject, at whatever rate its current policy specifies
- "epistemic sensor" means that action's outcome, accepted and cleared versus throttled versus retried, is read back as a measurement of the environment's current state, not discarded once the immediate regulatory decision is made
- the ensemble of estimators tracks uncertainty, not just a point estimate, so the controller has a running answer to "how confident am I in what I think capacity currently is," updated on the same cadence as regulation itself

</details>

Definition 2 makes a claim about where the measurement comes from, not a claim that measurement is free. A separately injected perturbation, the one-shot burst test from the previous section, manufactures a signal for the sole purpose of measuring the system. It discards the apparatus once the measurement is taken. Cyclic Adaptive Regulation instead treats the signal the system is already producing, just by doing its ordinary job, as the measurement. It does this continuously, for as long as the system keeps operating.

<span id="prop-2"></span>

**Proposition 2** (Feldbaum Dual Effect and Suboptimal Approximation). In a partially observable environment, the control action inherently forces a trade-off between regulating the current physical state and exploring the boundaries of that state. The exact dynamic programming solution to optimize this joint objective remains computationally intractable for general non-linear distributed systems.

- {{ layer(n=1, type="Bound", id="feldbaum-established-the-mathe") }}Feldbaum established the mathematical necessity of the dual effect, formalized as a precise condition proving that control and estimation cannot be perfectly decoupled{{ cite(ref="7", title="Bar-Shalom, Y. & Tse, E. (1974) -- Dual effect, certainty equivalence, and separation in stochastic control, IEEE Transactions on Automatic Control, 19(5), 494-500") }}.
- {{ layer(n=1, type="Bound", id="the-exact-joint-optimum-is") }}The exact joint optimum is unsolvable in general, requiring actively adaptive suboptimal approximations for practical implementation{{ cite(ref="8", title="Tse, E. & Bar-Shalom, Y. (1973) -- An actively adaptive control for linear systems with random parameters via the dual control approach, IEEE Transactions on Automatic Control, 18(2), 109-117") }}. A shadow-routing admission-control layer, facing heavy-tailed, correlated-retry traffic, is not a simple linear-Gaussian system. Nobody is going to derive the exact optimal dual controller for it, and Part 2 does not pretend otherwise.
- {{ layer(n=2, type="Fit", id="heavy-tailed-microservice-envi") }}Heavy-tailed microservice environments require cyclic measurement regimes: single, isolated instances of bounded probing systematically under-sample the tail distribution{{ cite(ref="9", title="Resnick, S.I. (1997) -- Heavy tail modeling and teletraffic data, Annals of Statistics, 25(5), 1805-1869") }}{{ cite(ref="10", title="Foss, S., Korshunov, D., Zachary, S. (2013) -- An Introduction to Heavy-Tailed and Subexponential Distributions, 2nd ed., Springer") }} and incur infinite-variance regret floors{{ cite(ref="11", title="Bubeck, S., Cesa-Bianchi, N., Lugosi, G. (2013) -- Bandits with Heavy Tail, IEEE Transactions on Information Theory, 59(11), 7711-7717") }}.
- {{ layer(n=3, type="Estimate", id="the-estimation-algorithm-lever") }}The estimation algorithm leverages persistent excitation{{ cite(ref="12", title="Åström, K.J. & Wittenmark, B. (1995) -- Adaptive Control, 2nd ed.") }}, now applied to the richness of the steady-state regulating signal itself rather than a separate injected probe, to extract the transfer function from low-frequency traffic drift.

### What Proposition 2 Rules Out

What Proposition 2 rules out matters as much as what it establishes. It is not a claim that the platform team can compute an optimal dual controller for their admission-control layer. Layer 1 says the exact joint optimum is, in general, computationally out of reach. Layer 3 is where the actual engineering happens. It does not solve the intractable problem. It builds a suboptimal approximation that keeps the dual effect alive anyway, by reading regulation itself as measurement rather than adding a separate measurement step on top of it.

That is the actual subject of this post: not a smarter one-shot probe, but a regulator redesigned so that probing is not a separate mode it enters and exits. The next section grounds Definition 2 and Proposition 2 in a system already running at internet scale: the congestion-control algorithm carrying a meaningful fraction of the world's traffic today.

## What the Ensemble in Definition 2 Actually Buys

Definition 2 says an ensemble of parameter estimators tracks uncertainty, not a single point estimate. It is worth asking what that specific design choice earns over the obvious, simpler alternative: a single running average of recent observations, updated a little on every new measurement. The platform team's admission-control layer could track "current capacity" that way, cheaply, without building anything resembling an ensemble. Why is that not good enough?

### The Experiment

{{ layer(n=3, type="Estimate", id="to-answer-with-numbers-rather") }}To answer with numbers rather than intuition, this post built a small model. It reuses exactly the situation Corollary 1 already described: a capacity signal that runs steady at one level, then drops to a lower level at some point, unannounced. That is the same abrupt regime shift this series has used throughout. Two tracking designs watch the same noisy observation stream and try to notice the drop.

The first is an exponential moving average, the obvious simple design. It blends each new observation into a running estimate by a fixed weight. The second is a two-hypothesis ensemble, in the general shape Definition 2 describes. One hypothesis is pinned to the old, higher capacity level, the other to the new, lower level. Each hypothesis's credibility updates by how well it currently predicts incoming observations.

<div class="illustrative">

| Tracker | Mean absolute error, 20 rounds after the drop | Rounds until locked onto the new level |
|---|---|---|
| Exponential average, slow (weight 0.05) | 30.2 | 49 |
| Exponential average, medium (weight 0.1) | 19.8 | 20 |
| Exponential average, fast (weight 0.2) | 10.2 | 9 |
| Two-hypothesis ensemble, naive Bayesian updating only | 50.0 (never detects) | never |
| Two-hypothesis ensemble, with a small ongoing chance of switching built into the update | 0.0 | 0 |

</div>

### Why the Naive Ensemble Fails

**The problem.** The naive ensemble row is the one worth sitting with. It is not the result Definition 2's framing would predict. Simply maintaining two hypotheses, and updating their credibility by how well each currently fits the data, is not automatically better than a single moving average. Run that way, the naive ensemble in this experiment never detects the drop at all. Once its confidence concentrates heavily on the old, correct-at-the-time hypothesis, incoming evidence for the new hypothesis stays outweighed by the ensemble's own prior confidence, indefinitely. An ensemble with a strong enough memory of being right before can become more resistant to changing its mind than a plain average with no memory to be resistant with.

### What Rescues It

**The fix.** What actually rescues the ensemble is a specific technical device: build in a small, constant, ongoing probability that the true regime could have switched, and blend each hypothesis's credibility toward the other by that probability, every round, before looking at the newest evidence, regardless of how confident the ensemble currently is. This is the interacting multiple-model idea. Bar-Shalom formalized it with Blom, for systems whose true regime can change according to a Markov process, a decade after his and Tse's original dual-effect results{{ cite(ref="13", title="Blom, H.A.P. & Bar-Shalom, Y. (1988) -- The Interacting Multiple Model Algorithm for Systems with Markovian Switching Coefficients, IEEE Transactions on Automatic Control, 33(8), 780-783") }}.

With that single addition, an ongoing willingness to reconsider even a currently confident hypothesis, the same ensemble that failed completely a row above detects the drop essentially immediately. The moment a new observation looks wrong for the old hypothesis, some non-zero credibility is already sitting on the alternative. It absorbs the evidence rather than having to fight the old hypothesis's accumulated confidence from a standing start.

### What "Tracks Uncertainty" Actually Means

This is the actual content behind Definition 2's phrase "tracks uncertainty." It is a sharper, more specific claim than "consider more than one guess." An ensemble that never revisits its own confidence is not more robust than a point estimate. It can be considerably less robust, exactly as this section's naive row shows, because concentrated confidence in an ensemble is just as capable of becoming stale as a single number is.

What Cyclic Adaptive Regulation actually needs is uncertainty that stays alive on purpose. Li, Chen, Yang, and Yan's 2023 formalization and Blom and Bar-Shalom's older mechanism both build this in, each in its own way. Both pay a real ongoing cost for it: the system can no longer describe its own current estimate with full confidence. The trade is the ability to notice, quickly, when that estimate stops being true.

## A Regulator That Never Stops Probing

Skip the platform team's shadow-routing layer for a moment. Look instead at a system that solved this exact problem a decade before the team's postmortem, at a scale their layer will never approach. That system is TCP BBR, the congestion-control algorithm Google built to replace loss-based schemes on its own infrastructure{{ cite(ref="14", title="Cardwell, N., Cheng, Y., Gunn, C.S., Hassas Yeganeh, S. & Jacobson, V. (2016) -- BBR: Congestion-Based Congestion Control, ACM Queue, 14(5), 20-53") }}.

### How BBR Measures Without a Separate Test

Classical TCP congestion control learns the network's capacity from loss. It keeps sending faster until a packet is dropped, then backs off. That is a regulator that only measures by breaking something first. BBR's designers built a different one. Instead of waiting for loss, BBR maintains a running estimate of two path properties: the bottleneck bandwidth and the round-trip propagation time. It paces its sending rate against that estimate directly.

An estimate that is only ever cautious never finds out if the path can carry more. So BBR's steady-state behavior, the ProbeBW state, runs a fixed eight-round-trip cycle against its own pacing gain. For one round trip, it paces at 1.25 times its current bandwidth estimate, deliberately sending faster than what it believes the path can sustain. For one round trip afterward, it paces at 0.75 times that estimate, deliberately sending slower, to drain whatever queue the first phase built up. For the remaining six round trips, it paces at exactly 1.0, cruising at its current estimate. Then the cycle repeats, for as long as the connection stays open.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    A["Cruise, 6 round trips<br/>pacing_gain = 1.0<br/>regulate at current estimate"]:::term
    B["Probe up, 1 round trip<br/>pacing_gain = 1.25<br/>test for unused capacity"]:::term
    C["Drain, 1 round trip<br/>pacing_gain = 0.75<br/>pay down the queue the probe built"]:::term
    A --> B --> C --> A
{% end %}

<figcaption>Figure 1: the ProbeBW cycle has no exit state. Regulation and measurement are phases of one repeating loop, not a probe that runs once and hands control back to a separate steady-state mode.</figcaption>

Read that cycle against Definition 2. The 1.25 phase is the connection's own regulatory traffic, briefly reshaped to also answer the question "has more bandwidth become available since I last checked," rather than a separately scheduled test of the path's capacity. The 0.75 phase, in turn, is that same regulatory traffic paying down the cost the probe just incurred, not downtime between tests. Nothing about this cycle switches off between measurements, because there is no separate measurement to switch off. A long-lived BBR flow spends the overwhelming majority of its life in this state. That means it spends most of its life simultaneously regulating and measuring, exactly as Feldbaum's dual effect says a control action under uncertainty already is, whether or not anyone names it.

> **Physical translation.** A one-shot injected test asks "does the path have more capacity than I assumed" once, on a schedule someone chose. Then it stops asking until the next scheduled run. BBR's gain cycle asks the same question every eight round trips, forever, using traffic the connection was already going to send. The dual effect does not require inventing a new signal. It requires noticing that the signal already flowing through the regulator is informative, and refusing to throw that information away once the immediate regulatory decision is made.

### Two Traditions, One Design

BBR was built in 2016, seven years before Li, Chen, Yang, and Yan formalized the ensemble-estimator, joint-objective version of dual control this post's Definition 2 draws on. The engineers who designed BBR's gain cycle were solving a concrete engineering problem, sending as much data as possible without inducing bufferbloat, not implementing Feldbaum's 1960 papers. They arrived, independently, at a control structure that is a real, running, internet-scale instance of the same shape. That convergence is itself evidence worth taking seriously. Two traditions reached the same design under the same underlying constraint, decades apart, without either one starting from the other. One grew out of Soviet-era control theory. The other grew out of Google's production networking team.

### The Cycle Finds Drift, Not a Distant Cliff

State precisely what the 1.25/0.75 cycle actually identifies, because it is narrower than "the probe explores the state space." Both gain phases perturb around whatever operating point the connection is already sitting at right now. The question they answer is local: has slightly more bandwidth become available near the current rate, or does slightly less remain than assumed. Ashby's Black Box argument, two sections from here, is exactly why that local question needs asking on a cycle rather than once. It is not, by itself, a claim that the same cycle also answers a completely different question: does a correlated-retry cascade, a discontinuous, structurally distant failure mode, exist somewhere else in this system's state space.

A 25 percent traffic bump for one round trip will not manufacture that cascade, and will not reliably discover it either, unless the system already happens to be balanced at the edge of it. The gradient a local perturbation samples is the gradient immediately around the current point. A regime shift like the one [The Simulation Singularity](@/blog/2026-09-13/index.md) diagnosed is a different point entirely, not a steeper version of that same gradient, one the local neighborhood gives no view into. Mistaking a clean local reading for evidence that the distant regime is safe would be the exact congruence failure [The Simulation Singularity](@/blog/2026-09-13/index.md) diagnosed in the original simulator, recurring one level up: a mechanism that only ever tests the neighborhood it already trusts, reporting "locally safe," and having that report mistaken for global coverage.

This post has not yet claimed otherwise, but it is worth saying so before going further, rather than letting the BBR analogy imply more than Definition 2 actually delivers. What Cyclic Adaptive Regulation buys, established so far, is a regulator that stops going stale about its own current, continuously drifting operating parameters. It is not a mechanism for actively searching out a distant, discontinuous regime it has never been near.

"Two Ways a Bounded Probe Still Misses the Tail," later in this post, names what actually closes part of that different gap. The claim there is much more modest than local persistent excitation: not searching for the regime, but never scheduling a stop to watching for it. When the regime does occur on its own, driven by whatever real trigger caused it in [The Simulation Singularity](@/blog/2026-09-13/index.md)'s incident, the system is there already measuring, rather than only checking during a bounded test window that happened to close before the regime arrived.

## Why the Cycle Cannot Just Measure Once and Stop

**The objection.** A reasonable one, against the last section: if the point of the 1.25 phase is to find out whether more bandwidth exists, why does BBR keep asking, every eight round trips, for the life of the connection? Measure once, during the initial ramp-up. Get an answer, and cruise at gain 1.0 forever afterward. That would avoid repeating a maneuver that briefly risks a queue buildup. It would still count as "using the regulatory signal as a sensor" in Definition 2's sense, just once instead of continuously.

### Persistent Excitation, and a Worked Test

The answer is Åström and Wittenmark's persistent excitation condition{{ cite(ref="12", title="Åström, K.J. & Wittenmark, B. (1995) -- Adaptive Control, 2nd ed.") }}, and it is sharper than "more measurements are always better." What determines whether a control action can identify a system's parameters is whether the input signal keeps producing genuine variation in the system's response, throughout the window being used to estimate anything, not how many samples it collects. A system sitting at a fixed operating point stops producing that variation, however long it sits there. The information available to any estimator watching it goes to zero, regardless of how much time passes.

{{ layer(n=3, type="Estimate", id="to-make-that-concrete-this") }}To make that concrete, this post built a small worked model, not a restatement of Åström and Wittenmark's own derivation. The model has two parameters worth identifying: how much of its current state persists from one round to the next, and how strongly its regulatory input moves that state. Feed the model three different input histories, all averaging the same operating point. Try to recover both parameters from the resulting data by ordinary least squares:

<div class="illustrative">

| Regime | Samples used | Parameter estimate error (of 0.8) | Estimate variability across 50 independent noise draws |
|---|---|---|---|
| Fixed operating point, never varied | 400 | 0.0247 | std dev 0.0289 |
| One deliberate step, then discarded | 12 | 0.0018 | std dev 0.0022 |
| BBR-style cycle, 1.25/0.75/1x6, ongoing | 400 | 0.0006 | std dev 0.0007 |

</div>

### Three Things the Table Shows

Three things in that table are worth sitting with, because none of them is the naive story.

First, four hundred samples collected at a fixed operating point are worse than twelve samples collected during one deliberate step away from it. Sample count is not the resource that matters here. The regime that never varies has abundant data and almost nothing to learn from in it, because every sample looks like every other sample.

Second, a single, one-time transient is not worthless, the kind a one-shot injected test could in principle capture. It genuinely identifies both parameters well, because the system is visibly moving during that window. A controller that changes its operating point once has, for that brief interval, exactly the persistent excitation it needs. This is the honest half of the objection this section opened with: one measurement, taken at the right moment, is not nothing.

Third, and this is what a single transient cannot give you: an ongoing cyclic perturbation, with the same total sample budget as the fixed-point regime, beats even the good one-shot transient. The reduction in estimate variability is roughly threefold on top of that, and about fortyfold against the fixed-point regime. Repeating the excitation does not just add more of the same information a single transient already provided. It keeps refreshing information that a settled system stops producing on its own, at every point after the one transient the one-shot design happened to capture.

### Why "Measure Once" Fails

**The answer.** A one-time step is a fine idea with an expiration date. This post's own Definition 2 makes that explicit. The moment a regulator settles back into an unchanging operating point, the epistemic sensor built into ordinary regulation goes quiet. It does not matter whether conditions are genuinely stable or the regulator itself just stopped moving. Either way, it goes exactly as quiet as the fixed-point row of the table above.

BBR's designers did not build a cycle that never stops because they distrust their own measurements. They built it because Åström and Wittenmark's condition has no version that can be satisfied once and banked for later. Confidence gained during a transient decays back toward the fixed-point row's near-zero information rate the moment the system stops moving. The platform team's admission-control layer, once it settles into serving ordinary traffic at a steady rate, is exactly as exposed to that decay as any other regulator that stops varying.

## The Black Box Was Never Silent

This table has an older name than Åström and Wittenmark's, and naming it is worth the detour.

### Ashby's Black Box, 1956

In 1956, cybernetician W. Ross Ashby described a general problem he called the Black Box. A Black Box is a system whose internal wiring cannot be inspected directly, only inferred by manipulating what goes in and watching what comes out{{ cite(ref="15", title="Ashby, W.R. (1956) -- An Introduction to Cybernetics, Chapman and Hall, Chapter 6, The Black Box") }}. Ashby's point, decades before anyone applied it to a self-tuning controller: a Black Box tested at only one input value, or a narrow range of them, can leave its own internal structure permanently undetermined.

Two boxes wired completely differently inside can produce identical output at the one input value an experimenter happened to try. Nothing about that agreement tells the experimenter which wiring is actually inside either box. Distinguishing them requires trying inputs the two wirings would answer differently. That is exactly what a fixed operating point never does.

### Reading Regime 1 Through Ashby's Lens

Read Regime 1 from the table above again with this in mind. Four hundred samples at a single, unchanging input is Ashby's under-tested Black Box, run for a very long time without ever becoming better tested. The parameter pair this post's toy model failed to pin down, a=0.81 instead of 0.8, b=0.47 instead of 0.5, is a specific, nameable consequence, not an ordinary measurement error. It comes from asking a Black Box the same question four hundred times and treating four hundred identical answers as four hundred data points. A Black Box actually answers exactly one question, however many times it is asked, until the question changes.

### Two Bounds, Not One

In [The Simulation Singularity](@/blog/2026-09-13/index.md)'s cybernetic reading of the Lai-Robbins floor, Ashby's own framework showed something related but distinct. A regulator's capacity to hold an outcome steady is bounded by the variety it can absorb. That bound holds for any bounded-capacity regulator, disturbance-driven or not.

The Black Box result this section adds is a different, complementary bound: how much variety an *observer* needs to inject before a system's internal structure becomes distinguishable from every alternative consistent with what has been tried so far, not how much variety a regulator can absorb.

Persistent excitation, read this way, is Ashby's identifiability condition, restated seventy years later in the vocabulary of a discipline that needed it for a different purpose. It is not a requirement control theory invented from scratch for adaptive controllers. Both arrive at the same structural demand: vary the input, or accept that the internal structure stays whatever it was assumed to be at the start.

## The Probe Design Is Never Finished

Proposition 2's Layer 1 bullets are permanent. The dual effect is a mathematical necessity of control under uncertainty, and the exact joint optimum will remain intractable for general non-linear systems no matter how good the engineering gets. What is not permanent, and what BBR's own history makes concrete, is any specific suboptimal approximation of that optimum.

### From BBRv1 to BBRv3

The eight-round-trip cycle described above is BBRv1, the version described in the 2016 paper. It was not the last word. Later revisions restructured the ProbeBW state itself into four named phases: ProbeBW_DOWN, ProbeBW_CRUISE, ProbeBW_REFILL, and ProbeBW_UP. Each change altered exactly how the probe is timed and how aggressively it competes with other flows sharing the same link{{ cite(ref="16", title="Cardwell, N. et al. -- BBR Congestion Control, IETF Internet-Draft draft-ietf-ccwg-bbr (active working-group draft, not yet a published RFC)") }}.

Google reports that BBRv3, the revision deployed to google.com and YouTube traffic, reduced the packet retransmit rate by 12 percent against the earlier version, measured in production{{ cite(ref="17", title="Cardwell, N., Cheng, Y., Yang, C.S., Morley, D., Hassas Yeganeh, S., Jha, P., Seung, Y. & Jacobson, V. (2023) -- BBRv3: Algorithm Bug Fixes and Public Internet Deployment, IETF 117 working-group presentation, July 2023") }}. That figure comes from Google's own presentation of its production results, not from an independently peer-reviewed measurement. It is stated here as exactly that: a reported industry result, not a formally verified one.

The eight-round-trip split itself, six cruising, one probing up, one draining, was never presented as an arbitrary constant either. BBR's original description frames it as an amortization choice. Concentrate the overhead of probing into a small, bounded fraction of the cycle. Let the drain phase specifically counteract the probe phase's own effect on the queue. A flow currently sending more than its neighbors then gives up proportionally more of that excess during the drain than a flow already sending its fair share does. This built-in mechanism was meant to nudge competing flows toward convergence, not divergence. That intention is worth naming precisely because the next paragraph shows what actually happened to it under a specific real condition.

### The Fairness Cost Nobody Fully Anticipated

An independent peer-reviewed measurement exists alongside it, and it does not simply confirm the improvement story. Zeynali and four coauthors measured BBRv3's behavior on the public internet against competing loss-based Cubic flows{{ cite(ref="18", title="Zeynali, D., Weyulu, E.N., Fathalli, S., Chandrasekaran, B. & Feldmann, A. (2024) -- BBRv3 in the public Internet: a boon or a bane?, Proceedings of the 2024 Applied Networking Research Workshop (ANRW), ACM, DOI 10.1145/3673422.3674889") }}. When explicit congestion notification is enabled, a single BBRv3 flow can claim more than 99 percent of a bottleneck's bandwidth. That holds even against five competing Cubic flows. A probe cycle tuned aggressively enough to earn Google's 12 percent retransmit improvement is, under a specific real-world condition its designers did not fully anticipate, also aggressive enough to starve other traffic sharing its link.

This is neither a flaw unique to BBR nor evidence against Definition 2 or Proposition 2. It is Proposition 2's Layer 3 line, made concrete. The suboptimal approximation that keeps the dual effect alive has to be engineered, tuned, and re-tuned against a real, non-stationary, shared environment. Each revision can fix one failure mode while surfacing another. BBR did not go from v1 to v3 because v1's mathematics were wrong. It went from v1 to v3 because the gap between the intractable exact optimum and any deployable approximation of it is never closed once and left alone. It is managed continuously, the same way the dual effect itself is exercised continuously rather than invoked once.

### What This Means for the Platform Team

That has a direct consequence for what this post can and cannot claim about the platform team's own admission-control layer. Building a Cyclic Adaptive Regulation policy modeled on BBR's shape does not hand the team a fairness or safety guarantee for free. It hands them a probe that, like BBR's, will need an explicit boundary around what it is allowed to do while measuring. This post has not yet addressed that concern, and does not resolve it here; that boundary is left as an open problem. Before even reaching it, one more gap needs closing: even a probe that never stops can still misjudge exactly how bad the thing it is measuring can get.

## The Fairness Cost Is a Game, Not Just a Control Problem

There is a reason the BBRv3 fairness result does not fit cleanly inside Proposition 2's own apparatus. Naming that reason precisely matters more than the specific 99 percent figure does.

### Why This Is a Different Kind of Problem

**The problem.** Feldbaum's dual effect, and every citation this post has built on it, analyzes a single controller facing an environment whose statistics it does not know. That environment is passive. It does not notice the controller measuring it, and it does not adapt in response.

A shared network bottleneck is not that kind of environment. Neither is a fleet of admission-control layers all running Cyclic Adaptive Regulation against the same downstream dependency. Every flow sharing a link with a BBRv3 sender is itself a controller, running its own regulation-as-measurement loop. Each one's probing reshapes exactly the quantity every other one is trying to estimate: how much capacity is actually available right now.

Once more than one dual-effect controller shares an environment, "the environment" stops being a fixed unknown. It becomes the aggregate behavior of every other controller probing it at the same time. Single-agent dual control theory, Feldbaum's own framing included, was never built to answer what happens next. That question is older than dual control theory, and it belongs to game theory, not control theory.

### Two Formal Answers: Price of Anarchy and Proportional Fairness

The specific shape of that question is this: individually rational agents share a common resource, each optimizing its own outcome, with no central coordinator enforcing a jointly fair split.

That is exactly what Roughgarden and Tardos formalize for network routing. When every flow selfishly picks the path that minimizes its own latency, the resulting equilibrium can fall measurably short of what a coordinated assignment would achieve. They prove exact bounds on how much worse, for broad classes of latency functions, rather than leaving the gap as an intuition{{ cite(ref="19", title="Roughgarden, T. & Tardos, E. (2002) -- How Bad is Selfish Routing?, Journal of the ACM, 49(2), 236-259") }}.

**The fix.** Kelly's earlier framework for rate control took the opposite approach to the same underlying problem. It designs a specific congestion-pricing signal. Agents optimizing their own utility against that price provably converge to a named, well-behaved fairness criterion, proportional fairness, rather than an arbitrary outcome{{ cite(ref="20", title="Kelly, F.P. (1997) -- Charging and rate control for elastic traffic, European Transactions on Telecommunications, 8(1), 33-37") }}.

{{ layer(n=2, type="Fit", id="neither-result-was-proven-for") }}Neither result was proven for BBRv3 specifically. This post is not claiming the 4/3 price-of-anarchy bound Roughgarden and Tardos derive for linear-latency routing games applies numerically to a bottleneck link shared between BBRv3 and Cubic flows. That is a different mathematical setting with different dynamics.

What transfers is the general phenomenon both papers are formal instances of. A set of independently optimizing controllers sharing a resource does not automatically converge to a fair or efficient joint outcome just because each one is individually well designed. Whether it does depends on the specific incentive structure each controller faces, an engineerable, game-theoretic property, not a byproduct that falls out of good single-agent control design for free. BBRv3's aggressiveness under ECN is what an individually rational prober does in the absence of a Kelly-style pricing signal or a Roughgarden-Tardos-style coordination mechanism. It is not a bug specific to its dual-effect probing.

### A Worked Simulation: Two Flows, One Bottleneck

{{ layer(n=3, type="Estimate", id="a-small-worked-model-shows") }}A small worked model shows the direction of that difference, without claiming to reproduce either paper's own analysis. Two flows share one bottleneck of capacity 100 units.

The first version has no shared price. Each flow reacts only to its own locally observed congestion: one backs off gently, multiplying its rate by 0.98 when it detects congestion; the other backs off steeply, multiplying by 0.5. That is the same qualitative asymmetry as a model-based prober willing to keep pushing against a loss-reactive flow willing to give up ground fast.

The second version gives both flows a shared congestion price instead. Each adjusts its own rate to maximize a logarithmic utility of that rate minus the price, the Kelly mechanism's actual shape. The price itself rises whenever total demand exceeds capacity.

<div class="illustrative">

| Scenario | Mechanism | Result |
|---|---|---|
| Baseline asymmetry | No shared price; gentle (0.98) vs. steep (0.5) backoff | 97.1% vs. 2.9% split, self-reinforcing, nothing in the model to stop it |
| Equal weights, equal speed | Shared Kelly price | 50.0% vs. 50.0%, as it should |
| Equal weights, 10x speed asymmetry | Shared Kelly price | 74.3% vs. 25.7%: roughly 2.9-to-1, not the 33.6-to-1 split above |
| Declared 3-to-1 entitlement | Shared Kelly price | 63.4% vs. 36.6% at 20,000 rounds: drifting toward 75 vs. 25, slowly, not yet arrived |

</div>

where:
- row one is an extreme, self-reinforcing equilibrium; nothing inside that model corrects it
- row two is the sanity check: with no asymmetry at all, the shared-price mechanism reproduces the fair 50/50 split
- row three reintroduces the same kind of asymmetry as a 10x reaction-speed difference instead of a backoff-multiplier difference, read out at 80,000 rounds. Raw aggressiveness still buys something at that horizon, far less than it bought without the shared price, and the next section shows this split keeps closing rather than holding steady
- row four shows the mechanism converging on declared entitlement rather than on whichever flow reacts fastest or backs off least, though slowly, under this model's own deliberately unrefined update rule

Getting an implementation of that mechanism to converge cleanly and quickly is still its own genuine engineering problem. It does not fall out for free once someone decides fairness matters.

### The Leftover Advantage Is a Convergence Delay, Not a Tuning Artifact

That last point is worth taking seriously, because the mechanism behind the leftover 2.9-to-1 split is not what it first looks like. Kelly's fixed point, {% katex() %}r_i = w_i / \text{price}{% end %}, does not depend on either flow's reaction speed at all. Rerunning the 10x-speed case with the price loop's own step size at 0.0005, 0.005, and 0.05, a hundredfold range, gives the identical 74.3%/25.7% split every time. The residual is the slow flow still partway through its own approach to that speed-independent fixed point, not the price loop lagging behind the flows.

Extending the same run confirms it: the slow flow's share is 25.7% at 80,000 rounds, 28.3% at 400,000, and 43.3% at 2,000,000, still climbing toward 50% and showing no sign of settling short of it. Run to 10,000,000 rounds, it reaches 50.0%. Kelly's equilibrium is exact and symmetric in weight, not speed; what the earlier table reports is a snapshot of a transient at one arbitrarily chosen horizon, not a floor the mechanism converges to and stops at.

<div style="margin:1.5em 0;">
<canvas id="chart-kelly-convergence" aria-label="A line chart of the slow flow's share of capacity against the number of rounds run, on a logarithmic horizontal axis from twenty thousand to ten million rounds. The share sits near 25 percent until about one hundred thousand rounds, then climbs: 25.7 percent at 80,000 rounds, 28.3 percent at 400,000, 43.3 percent at 2,000,000, and 50.0 percent at 10,000,000, where it meets a horizontal line marking Kelly's fixed point at 50 percent." style="width:100%; height:320px; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<script>
(function(){
var cv=document.getElementById('chart-kelly-convergence');
if(!cv)return;
var ctx=cv.getContext('2d');
var DATA=[[20000,25.22],[23000,25.09],[27000,25.09],[31000,25.12],[35000,25.17],[41000,25.25],[47000,25.33],[54000,25.42],[62000,25.52],[71000,25.64],[80000,25.74],[82000,25.77],[95000,25.91],[109000,26.06],[125000,26.22],[144000,26.40],[166000,26.60],[192000,26.82],[221000,27.05],[254000,27.30],[293000,27.58],[337000,27.87],[388000,28.20],[400000,28.27],[447000,28.55],[515000,28.93],[593000,30.06],[683000,31.53],[787000,33.06],[906000,34.62],[1044000,36.22],[1202000,37.82],[1384000,39.40],[1594000,40.96],[1836000,42.46],[2000000,43.32],[2115000,43.87],[2436000,45.16],[2805000,46.30],[3231000,47.29],[3721000,48.11],[4285000,48.74],[4935000,49.22],[5684000,49.55],[6546000,49.76],[7539000,49.88],[8683000,49.95],[10000000,49.98]];
var MARK=[[80000,25.74,'25.7%',"at 80,000 rounds: the table's snapshot"],[400000,28.27,'28.3%','at 400,000'],[2000000,43.32,'43.3%','at 2,000,000'],[10000000,49.98,'50.0%','at 10,000,000']];
var W=0,H=0,narrow=false,L=46,R=18,T=30,B=46;
var X0=Math.log(20000),X1=Math.log(10000000),Y0=20,Y1=54;
function px(n){return L+(Math.log(n)-X0)/(X1-X0)*(W-L-R);}
function py(v){return T+(1-(v-Y0)/(Y1-Y0))*(H-T-B);}
function txt(t,x,y){ctx.fillText(t,Math.round(x),Math.round(y));}
function setup(){
W=cv.clientWidth;narrow=W<560;H=narrow?300:320;
cv.style.height=H+'px';
if(cv.clientHeight&&cv.clientHeight!==H){cv.style.height=(2*H-cv.clientHeight)+'px';}
var dpr=window.devicePixelRatio||1;
cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
ctx.setTransform(cv.width/W,0,0,cv.height/H,0,0);
}
function draw(){
ctx.clearRect(0,0,W,H);
var i,xt=[[100000,'100,000'],[1000000,'1,000,000'],[10000000,'10,000,000']],yt=[25,30,40,50];
ctx.font='11px sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';
for(i=0;i<yt.length;i++){
ctx.strokeStyle='#eceff1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,Math.round(py(yt[i]))+0.5);ctx.lineTo(W-R,Math.round(py(yt[i]))+0.5);ctx.stroke();
ctx.fillStyle='#607d8b';txt(yt[i]+'%',L-8,py(yt[i]));
}
ctx.textBaseline='top';
for(i=0;i<xt.length;i++){
ctx.strokeStyle='#eceff1';ctx.beginPath();ctx.moveTo(Math.round(px(xt[i][0]))+0.5,T);ctx.lineTo(Math.round(px(xt[i][0]))+0.5,H-B);ctx.stroke();
ctx.fillStyle='#607d8b';ctx.textAlign=i===2?'right':'center';txt(xt[i][1],px(xt[i][0]),H-B+7);
}
ctx.textAlign='center';ctx.fillStyle='#607d8b';
txt(narrow?'rounds (each step is 10× more)':'rounds run (logarithmic: each gridline is 10× more)',L+(W-L-R)/2,H-B+24);
ctx.strokeStyle='#2e7d32';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(L,py(50));ctx.lineTo(W-R,py(50));ctx.stroke();
ctx.fillStyle='#2e7d32';ctx.font='bold 12px sans-serif';ctx.textAlign='left';ctx.textBaseline='bottom';
txt(narrow?"Kelly's fixed point: 50%":"Kelly's fixed point: an equal 50% share",L+4,py(50)-5);
ctx.strokeStyle='#263238';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.beginPath();
for(i=0;i<DATA.length;i++){if(i===0)ctx.moveTo(px(DATA[i][0]),py(DATA[i][1]));else ctx.lineTo(px(DATA[i][0]),py(DATA[i][1]));}
ctx.stroke();
for(i=0;i<MARK.length;i++){
var m=MARK[i],x=px(m[0]),y=py(m[1]),last=i===3,left=i>=2;
ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,4.5,0,6.2832);ctx.fill();
ctx.strokeStyle='#263238';ctx.lineWidth=2;ctx.stroke();
ctx.textAlign=left?'right':'left';ctx.textBaseline='top';
var tx=left?x-9:x-4,ty=last?y+10:(left?y-8:y+10);
ctx.fillStyle='#263238';ctx.font='bold 14px sans-serif';txt(m[2],tx,ty);
if(!narrow||i===0){ctx.fillStyle='#607d8b';ctx.font='11px sans-serif';txt(narrow?'at 80,000 rounds':m[3],tx,ty+17);}
}
ctx.fillStyle='#263238';ctx.font='bold 11px sans-serif';ctx.textAlign='left';ctx.textBaseline='top';
txt("SLOW FLOW'S SHARE OF CAPACITY",L,9);
}
function start(){if(cv.clientWidth<10){requestAnimationFrame(start);return;}setup();draw();}
start();
window.addEventListener('resize',function(){setup();draw();});
})();
</script>
<figcaption>The 74.3%/25.7% split in the table is one point on this curve, read at 80,000 rounds. Left running, the slow flow's share keeps climbing and reaches Kelly's equal split after roughly ten million rounds. The mechanism's guarantee is the green line, and what a flow experiences is wherever on the curve the deployment happens to be.</figcaption>
</div>

The idealized row in the table is not "a faster price." It is the same fixed point substituted in directly, {% katex() %}\text{price} = (w_1+w_2)/\text{capacity}{% end %}, with no gradient approach to run at all. That is why it lands exactly on 50/50 and 75/25 regardless of which flow reacts faster: it is not approximating the equilibrium under favorable timing, it already is the equilibrium.

This does not make the earlier 2.9-to-1 reading useless, but it changes what it is evidence of. It shows that convergence time, not the asymptote alone, sets the fairness a system experiences short of the long run. A real fleet rarely reaches the long run: flows arrive, restart, and depart continuously. A real deployment can spend its whole operating life partway through a transient like the one measured here. It may never sit close enough to the fixed point for Kelly's guarantee to describe what a flow actually gets. Bounding that convergence time is a genuine, separate engineering problem Kelly's theorem does not solve for free.

A price implemented as plain integral control, moving in small fixed increments each round, does face a real, well-documented tuning tradeoff. Hollot, Misra, Towsley, and Gong show a controller of this kind either lags relative to the dynamics it regulates, or is pushed fast enough to oscillate instead of settling{{ cite(ref="21", title="Hollot, C.V., Misra, V., Towsley, D., Gong, W.-B. (2002) -- Analysis and Design of Controllers for AQM Routers Supporting TCP Flows, IEEE Transactions on Automatic Control, 47(6), 945-959") }}. That tradeoff is real and worth naming. It is a separate fact about implementing a price loop, not the explanation for the split above, which this section's own price_step sweep already rules out.

{{ layer(n=2, type="Fit", id="one-thing-this-idealized-re") }}An instantaneous shared price is a physical impossibility in a distributed admission-control fleet regardless of any of this. Propagating a price update, aggregating telemetry from every flow it depends on, and reaching whatever consensus the mechanism requires all take real network round trips. What a real design can still buy is separation of timescales, the same device this post has used everywhere else: making the price loop update much faster than the flows it prices. That is what makes Kelly's convergence guarantee apply, not a way to erase the convergence delay measured above. [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) prices the stability consequence of that same propagation delay directly.

### What This Section Leaves Open

This closes a gap this post's formal apparatus has left open since Proposition 2 was first stated. Definition 2 and Proposition 2 answer how one controller should treat its own regulatory action as a source of information. They do not answer what happens when the platform team's admission-control layer is one of many such controllers, possibly across many services in the same fleet, all probing the same shared downstream dependency at once, each one's exploration shaping the very capacity signal the others are trying to read.

A discrete-time stochastic control barrier function bounds one controller's own worst-case behavior. It does not, by itself, coordinate several. Whether such a safety boundary composes cleanly across multiple simultaneously probing services, or needs its own game-theoretic layer on top of it, is a question this series has not yet resolved. It is stated here rather than left implicit.

## The Contradiction This Post Resolves by Separation in Time

[The Simulation Singularity](@/blog/2026-09-13/index.md) named a discipline, without naming its own field, for what a physical contradiction is and how it gets resolved. A single parameter of a system is required to take two opposite values at once, because two different requirements land on it simultaneously. The resolution works by separating the two requirements rather than compromising between them: in time, in space, by scale, or onto a different subsystem entirely. [The Simulation Singularity](@/blog/2026-09-13/index.md) named three separating moves that would resolve this contradiction without stating which one, if any, this series would actually build. This post supplies one of them: separate the two requirements in time. Validate against history at launch, then keep validating against live signal afterward, as a continuous, cyclic policy rather than a single compromise check. Everything this post has built since is that one move, worked out in full.

### Stating the Contradiction

**The problem.** State the contradiction the way the discipline asks it to be stated. The platform team's admission-control action, at any single instant, is asked to be two things its own designers never separated. It must be a pure regulator, doing exactly what current evidence says is optimal. It must also be an explorer, deliberately doing something current evidence says is suboptimal, to find out whether current evidence is wrong. Both demands land on the same parameter: the control action taken right now.

Say a team tries to satisfy both with one compromise action, sending traffic at, say, 1.05 times the current bandwidth estimate as a permanent policy rather than 1.0. The result is a regulator that is neither reliably optimal nor genuinely exploratory. It is too aggressive to be trusted as pure regulation, and too timid and too constant to ever produce the kind of persistent excitation the last two sections showed is required. A compromise value is the specific failure mode this discipline exists to name, not a resolution of it.

<div class="pull-quote">A control action taken inside an unknown environment is never purely regulatory.</div>

Read in this series' own vocabulary, this is also congruence again, but neither of the two mechanisms [The Simulation Singularity](@/blog/2026-09-13/index.md) named for it: not a coverage gap, capacity congruence, and not a mis-chosen question, selection congruence. Call it a third way of never fully disagreeing with yourself. A policy that never fully commits to exploring is still agreeing with its own current estimate at every instant, just by a smaller margin than [The Simulation Singularity](@/blog/2026-09-13/index.md)'s frozen simulator did.

### BBR as the Resolution

**The fix.** BBR's gain cycle is what the resolution actually looks like once separation in time is applied rather than gestured at. The system is never asked to be a regulator and an explorer at the same moment. It is asked to be a regulator for six round trips, then an explorer for one, then a debtor paying down the explorer's cost for one, then a regulator again. Definition 2's claim, that the regulatory action itself serves as the epistemic sensor, means the two roles are folded into one continuous cycle, at different phases of it, rather than fused into a single compromised action repeated forever. It is not a claim that every instant of regulation is simultaneously exploratory.

Proposition 2's Layer 1 line, that the exact joint optimum is intractable, is what makes this separation necessary rather than optional. An exact solution would tell the controller precisely how much of each instant to spend on each demand, continuously blended. Lacking that solution, BBR's designers separated the demands in time instead, cleanly, rather than blending them approximately at every instant. They did this seven years before anyone connected it to Feldbaum's name for the underlying problem.

{{ layer(n=3, type="Estimate", id="this-framing-is-as-part") }}[The Simulation Singularity](@/blog/2026-09-13/index.md) already flagged the physical-contradiction framing as a retrospective lens rather than a design claim, and that qualification covers its use here too.

### A Fourth Instance: The Price Signal

The multi-agent fairness result from the previous section turns out to be a fourth instance, in a different variable. There, the conflicting demands were accuracy-versus-stability on the shared price signal, not regulation-versus-exploration on one flow's own rate. A price that reacts fully to every instantaneous fluctuation in demand is accurate but jittery. A price that moves slowly enough to stay stable is calm but stale. That is the same physical-contradiction shape as before: one signal asked to be two things at once.

The idealized version of the Kelly mechanism resolves it the identical way BBR resolves the regulation-versus-exploration conflict. It does not find a compromise reaction speed for the price. It separates the two demands onto different timescales entirely: a price allowed to move fast, because the flows themselves are made to move slow relative to it. Four supposedly different engineering problems, a control policy's action, a system-identification signal, a bandwidth probe, and a congestion price, turn out to share one resolution strategy. That is not independent evidence the strategy generalizes. Separating a loop's timescales is standard control-design practice, not a discovery specific to this series. What the price signal adds is a fourth, weaker instance of the identical, well-known move already used above, not a fourth independent proof of it.

## Two Ways a Bounded Probe Still Misses the Tail

Return to the one-shot injected test from the opening section, now armed with Definition 2 and the BBR comparison. Suppose the platform team improves on it: instead of one scheduled burst, they commit to something closer to Cyclic Adaptive Regulation, a probe that runs continuously rather than once. Does that fully close the gap [The Simulation Singularity](@/blog/2026-09-13/index.md) opened? Not by itself. It fails to close it in two distinct ways worth separating, because they call for different fixes.

### The Calendar Problem

[The Simulation Singularity](@/blog/2026-09-13/index.md) already worked this out in full for the underlying regime itself, and Part 2 reuses that arithmetic rather than re-deriving it. Under this series' running anchor of roughly a one-in-a-thousand daily chance of the correlated-retry regime occurring, a team needs on the order of eight years of continuous exposure before "we have not seen it yet" carries even 95 percent confidence that the regime is genuinely rare, rather than simply unobserved so far. A validation window of six months, run once and stopped, sits at roughly a 16.5 percent chance of having seen it at all.

Nothing about switching from a one-shot test to a cyclic probe changes that arithmetic if the cyclic probe is still scheduled to run for a fixed, bounded duration and then stop. A three-month cyclic probe and a three-month one-shot test accumulate exactly the same calendar exposure to a rare regime. Cycling faster within that window does not manufacture additional calendar time.

**The fix.** What actually closes this gap is Definition 2's own defining property: no scheduled end. A probe with no off switch keeps accumulating exposure for as long as the system operates. That is the only way to make the eight-year waiting time in [The Simulation Singularity](@/blog/2026-09-13/index.md)'s table something the system is actually paying down, rather than something a bounded experiment window can never reach. Notice what kind of fix this is. It is not the 1.25-gain local perturbation named earlier in this post reaching further than it actually can. It is a much plainer claim: a system that never stops watching is present for a rare event whenever that event happens to occur on its own, where a system that stops watching after a fixed window sometimes is not.

### The Severity Problem

Suppose the probe does run long enough, cyclically, to observe several real instances of the regime, not zero. A second, independent gap remains: how badly can it get, on the worst observed occasion, compared to how badly it can actually get. This is where heavy tails bite a second time, in a way duration alone does not fix.

To see how much it bites, model burst severity itself, not just its occurrence, as heavy-tailed. The correlated-retry regime does not always hit the same way. Most occurrences are mild, a few are severe, and a small number are the kind that shatter a queue outright. A team estimating "how bad can this get" from a bounded number of observed occurrences is estimating a high percentile of a heavy-tailed distribution from a small sample. That estimation problem has a known, sharp failure mode.

{{ layer(n=3, type="Estimate", id="the-following-is-this-post") }}The following is this post's own worked illustration, not a restatement of Bubeck, Cesa-Bianchi, and Lugosi's theorem. It models burst severity as a Pareto distribution with a fixed median, so a "typical" incident looks the same size across all three regimes below. It asks how well the 99th-percentile severity is estimated from a bounded sample of {% katex() %}N{% end %} observed occurrences, across three tail weights:

<div class="illustrative">

| Regime | True P99 severity (multiple of median) | N=50: typical estimate | N=50: chance of missing true tail by 2x or more |
|---|---|---|---|
| Moderate tail ({% katex() %}\alpha=3.0{% end %}, finite variance) | 3.7x | 90% of true value | 1.5% |
| Heavy tail ({% katex() %}\alpha=1.5{% end %}, infinite variance) | 13.6x | 80% of true value | 24.6% |
| Very heavy tail ({% katex() %}\alpha=1.1{% end %}, infinite variance) | 35.0x | 77% of true value | 33.9% |

</div>

At {% katex() %}N=50{% end %} observed occurrences, roughly a month of daily attempts at this series' own anchor rate, a moderate tail gives a usable estimate. A genuinely heavy tail is worse. Resnick's teletraffic work and Foss, Korshunov, and Zachary's subexponential framework both describe this as typical of real network and service-time distributions. From the same 50 observations, it gives a one-in-three to one-in-four chance of underestimating the true worst case by more than half.

The same simulation shows this gap closing only slowly. Matching the moderate-tailed regime's reliability at 50 occurrences, a roughly one-in-a-hundred chance of missing the true tail by half or more, took the heavy-tailed regime about three times as many occurrences, 145 rather than 50. The very-heavy-tailed regime needed close to four times as many, 195 rather than 50, not a further order of magnitude on top of the heavy tail's own requirement.

That difference in required sample size, not merely in observed values, is the concrete, illustrative shape of what Bubeck, Cesa-Bianchi, and Lugosi actually prove, and their result deserves stating precisely rather than loosely, because the precise version is more interesting than "heavy tails make regret worse." Using the plain sample mean to track an arm's reward, a heavy tail genuinely does push regret from logarithmic to polynomial in the horizon{{ cite(ref="11", title="Bubeck, S., Cesa-Bianchi, N. & Lugosi, G. (2013) -- Bandits with Heavy Tail, IEEE Transactions on Information Theory, 59(11), 7711-7717") }}.

But their paper's actual headline result is more specific than that, and more useful here. Replace the plain sample mean with a robust estimator built for exactly this problem: a truncated mean, a median-of-means, or Catoni's estimator. The regret returns to logarithmic in the horizon, even without a finite second moment. Finite variance alone is enough to fully match the ordinary, sub-Gaussian floor. What degrades, as the tail gets heavier still, is not the horizon-dependence but the constant multiplying it: the bound's sensitivity to a small gap between options worsens, while staying logarithmic in how many rounds have elapsed.

Getting this precise matters, because it is the same fix in spirit that "What the Ensemble in Definition 2 Actually Buys" already demonstrated for tracking a drifting capacity estimate: a naive averaging estimator can fail outright where a more sophisticated one, built to expect exactly the failure mode a naive one is blind to, does not.

That fix, though, answers a different question than the one this section actually asked. A robust mean estimator makes a bandit's regret well-behaved again. It says nothing about how reliably a bounded sample reveals a distribution's *own* 99th percentile, the question this section's own Pareto table poses. Estimating a high quantile of a heavy-tailed distribution is not the same problem as estimating its mean robustly, and no choice of estimator changes what the table above already shows: recovering the true tail to a given confidence requires more actual occurrences as the tail gets heavier, full stop.

That is a statement about what the system lives through while an estimate converges, not merely about how long the convergence takes on a spreadsheet. Getting fifty more occurrences of a heavy-tailed severity distribution, so its own tail can be estimated with confidence, means fifty more times the correlated-retry regime actually happened to this system. Each one hits at whatever severity it happens to hit, including the rare, catastrophic draws the tail exists to warn about. These are not fifty free data points sitting in a log file.

**The partial fix, and what it actually costs.** A probe that runs forever eventually accumulates enough occurrences to close the severity-estimation gap too, since the sample size keeps growing for as long as the probe runs. But "eventually" is doing real work in that sentence, in two separate ways. It is a different, larger "eventually" than the one the calendar problem already required, as before. It is also, now stated plainly, an "eventually" purchased by actually living through more occurrences of the tail, not by a free statistical formality.

A team that built a perpetual probe believing it had solved the tail-severity problem simply by never stopping has correctly solved the calendar problem. It has only partially solved the severity-estimation problem, at a rate this post's numbers show degrading sharply as the tail gets heavier. It has done so by accepting a cost structure this series has not, until this paragraph, priced honestly.

Every crossover computed so far in this series, [The Simulation Singularity](@/blog/2026-09-13/index.md)'s {% katex() %}N\cdot p\cdot L{% end %} and this post's own infrastructure-economics model alike, treated {% katex() %}L{% end %}, the cost of one occurrence, as a fixed constant. This section's own table says {% katex() %}L{% end %} is itself a heavy-tailed random variable under a genuinely heavy tail, not a constant, and a system still mid-convergence on its own severity estimate does not yet know that variable's worst case with any confidence, in exactly the window where a real decision-maker would most want to know it.

This leaves a specific, named gap, sharper than "a safety question, not a measurement question" alone conveys. A discrete-time stochastic control barrier function, as this series has scoped it so far, bounds the probability that a controlled system exits its declared safe region within a given horizon. It does not, by that construction alone, bound how much damage a single excursion can do once it happens.

Under a light-tailed disturbance those two guarantees are close cousins, because no single excursion can be arbitrarily bad. Under a genuinely heavy-tailed severity distribution, the kind this section just modeled, they are not the same guarantee at all. Only the second one, a bound on magnitude, prices the specific risk this section has just shown: a risk that can grow large precisely while the system is still learning how large.

Whether a safety boundary of this kind can be extended to supply that second bound is not yet shown here. Until it is, "a probability-of-excursion guarantee handles safety" is a promise with a real gap still standing inside it, not a claim this post has earned the right to make in passing.

### Why Both Gaps Matter Together

Put the two gaps together and Proposition 2's Layer 2 line reads as a single, unified requirement, not two separate footnotes. A cyclic measurement regime is structurally necessary, not merely convenient. A bounded probe fails on the calendar axis regardless of tail weight. A heavy tail additionally fails on the severity axis at any fixed sample size, however large, only converging in the limit.

Building a probe that never stops answers the first failure by construction. It does not, by itself, answer the second. A team that stops checking the severity estimate's own confidence once the probe is running risks exactly the false comfort [The Simulation Singularity](@/blog/2026-09-13/index.md) diagnosed in the platform team's original simulator: mistaking "the mechanism looks correct" for "the mechanism has converged."

## The Severity Gap Has an Organizational Half-Life

The severity problem does not stay a purely statistical curiosity once a real team lives with it for a while. The direction it drifts in is worth naming, because it is not neutral.

### How a Quiet Probe Gets Misread

A team running a cyclic probe for months watches it repeatedly report a moderate worst case, simply because the true tail has not come up yet. They do not experience that as "the sample is still too small." They experience it as evidence: the probe has run, it has been diligent, and the worst it has ever reported is moderate. Every additional cycle that fails to surface the true severity looks, from inside the organization, like confirmation that the true severity is roughly what has been observed so far.

Bubeck, Cesa-Bianchi, and Lugosi's result says the opposite is happening. Under a genuinely heavy tail, a long run of moderate observations is exactly what the distribution produces most of the time, precisely because the severe tail is rare, not because it is absent.

### Vaughan's Normalization of Deviance

Sociologist Diane Vaughan documented the organizational version of this drift in her study of the decisions preceding the *Challenger* disaster. She coined the term normalization of deviance for it. A system runs with a known anomaly that never quite produces the catastrophic outcome it could. Each successful flight without disaster is treated, gradually and often reasonably at each individual step, as evidence that the anomaly's true risk is lower than originally assumed. The classification of "acceptable risk" drifts, until it sits far from where it would if the rare, undemonstrated failure mode were priced honestly{{ cite(ref="22", title="Vaughan, D. (1996) -- The Challenger Launch Decision: Risky Technology, Culture, and Deviance at NASA, University of Chicago Press") }}.

### What Transfers, and What Does Not

{{ layer(n=2, type="Fit", id="this-post-is-not-claiming") }}This post is not claiming the platform team's admission-control layer is a Space Shuttle O-ring, and the mechanisms are not identical. Vaughan's account is about a known, named anomaly whose risk classification drifted over repeated successful launches. This post's severity problem is about an anomaly's true magnitude being systematically underestimated by a probe that has not yet sampled it at all.

What transfers is the direction of the drift, not the specific mechanism producing it. In both cases, a track record of "it has not been that bad yet" is read by the humans watching it as evidence bounding how bad it can get. Under a heavy tail, the actual data bounds no such thing, and the gap between those two readings widens, not narrows, the longer the track record runs without incident.

### Two Faces of the Same Problem

This gives the severity problem a second face beyond the purely statistical one Bubeck, Cesa-Bianchi, and Lugosi's theorem describes. The statistical face says a bounded number of observations under-samples a heavy tail's true worst case. The organizational face says the humans reading those observations are, independently, primed by every additional quiet cycle to trust the moderate worst case more, not less. That is exactly opposite to what the statistics actually justify.

A cyclic probe that never stops running is necessary to eventually close the statistical gap. Nothing about it automatically closes the organizational one. A team that treats a long, uneventful run of its own cyclic probe as growing confidence is making a mistake. That quiet run is an unremarkable, expected feature of sampling a heavy tail, not evidence of safety. Reading it as safety is the exact drift Vaughan documented, in miniature.

## When Building the Infrastructure Pays for Itself

Everything above argues that Cyclic Adaptive Regulation is statistically required and organizationally harder to approve. Set both of those arguments aside for one section. Ask a narrower, more mundane question instead: even ignoring the statistics, is it cheaper in ordinary engineering labor to keep running one-shot tests indefinitely, or to build the cyclic infrastructure once?

### The Model

This is a different question from [The Simulation Singularity](@/blog/2026-09-13/index.md)'s crossover, and it needs its own achievable-region model before any number gets solved. [The Simulation Singularity](@/blog/2026-09-13/index.md) compared the cost of exploring against the cost of an unpriced incident: a one-time engineering choice against an open-ended risk. This section compares two ways of paying for the same activity, ongoing validation, over an operating horizon of {% katex() %}N{% end %} months. A team can keep paying a recurring cost every cycle, forever, or pay a larger cost once and a smaller recurring cost afterward. At any given {% katex() %}N{% end %}, a rational team pays whichever of the two is smaller. Definition 2a below states that choice as the lower envelope of the achievable region's frontier.

<span id="def-2a"></span>

<details>
<summary>Definition 2a -- Validation-Cost Achievable Region: every validation path over a horizon of N months is a point in one-time cost and cumulative recurring cost</summary>

**Definition 2a** (Validation-Cost Achievable Region). Over an operating horizon of {% katex() %}N{% end %} months, each available validation path maps to a point {% katex() %}(\text{one-time cost},\ \text{cumulative recurring cost}){% end %}: the one-shot path sits at {% katex() %}(0,\ c_{\text{test}} \cdot N){% end %}, the cyclic-infrastructure path at {% katex() %}(B,\ c_{\text{maint}} \cdot N){% end %}. The achievable region is the set of such points across the paths available at that {% katex() %}N{% end %}; its frontier is the non-dominated set. Both coordinates are priced in the same unit, so total cost at a point is their sum, and the lower envelope of the two paths' total-cost lines, not either line alone, is what a rational team pays.

where:

- "one-time cost" is the up-front spend a path requires before it starts paying for itself: zero for the one-shot path, {% katex() %}B{% end %} for the cyclic path
- "cumulative recurring cost" is the ongoing spend accrued over the full {% katex() %}N{% end %} months: {% katex() %}c_{\text{test}} \cdot N{% end %} for repeated one-shot testing, {% katex() %}c_{\text{maint}} \cdot N{% end %} for the maintained cyclic policy
- this is the same achievable-region and frontier structure as [The Impossibility Tax](@/blog/2026-03-14/index.md#def-1)'s Definition 1, applied to two cost paths rather than to a system's operating points

</details>

| Symbol | Meaning | Value | Status | Derived from |
|---|---|---|---|---|
| {% term(url="", def="c_test: cost of one designed, run, and reviewed one-shot test cycle, the recurring price paid every cycle under the one-shot path, not the cyclic path.") %}{% katex() %}c_{\text{test}}{% end %}{% end %} | Cost of one designed, run, and reviewed one-shot test cycle | 20 engineer-hours | *illustrative* | design + coordinate + run + review + write-up, the full cycle the organizational section above described, not [The Simulation Singularity](@/blog/2026-09-13/index.md)'s cheaper 4-hour automated probing round |
| {% term(url="", def="B: one-time cost to design, implement, and validate a Cyclic Adaptive Regulation policy, the up-front price paid once under the cyclic path.") %}{% katex() %}B{% end %}{% end %} | One-time cost to design, implement, and validate a Cyclic Adaptive Regulation policy | 480 engineer-hours (three engineer-months) | *illustrative* | a nontrivial engineering project: ensemble estimator, integration with existing admission control, safety review |
| {% term(url="", def="c_maint: ongoing marginal cost of the cyclic policy per month, once built.") %}{% katex() %}c_{\text{maint}}{% end %}{% end %} | Ongoing marginal cost of the cyclic policy per month, once built | 2 engineer-hours | *illustrative* | monitoring and occasional re-tuning, not zero, since Proposition 2's Layer 3 line says the suboptimal approximation is never fully finished |

{% katex(block=true) %}
C_{\text{one-shot}}(N) = c_{\text{test}} \cdot N \qquad C_{\text{cyclic infra}}(N) = B + c_{\text{maint}} \cdot N
{% end %}

### Where the Two Lines Cross

Both curves are affine in {% katex() %}N{% end %}, not logarithmic and linear the way [The Simulation Singularity](@/blog/2026-09-13/index.md)'s comparison was, because both options here involve ongoing engineering effort rather than one option being a bet against silence. Set them equal and solve for the month past which the infrastructure has already paid for itself:

{% katex(block=true) %}
c_{\text{test}} \cdot N^* = B + c_{\text{maint}} \cdot N^* \quad\Longrightarrow\quad N^* = \frac{B}{c_{\text{test}} - c_{\text{maint}}} = \frac{480}{20 - 2} \approx 26.7 \text{ months}
{% end %}

Call it roughly two and a quarter years, computed from the three illustrative anchors above, not a general constant. Past that point, every additional month of one-shot testing costs more, in ordinary engineering labor, than the infrastructure would have cost to build and maintain. Most production admission-control layers have an expected operating life longer than two or three years. That puts them on the side of this crossover where building Cyclic Adaptive Regulation is the cheaper choice, even before Propositions 1 and 2's statistical arguments are invoked at all.

### How Sensitive Is the Crossover?

Move the anchors and the crossover moves with them, but not wildly. This is the same stability [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own crossover showed under its anchors:

<div class="illustrative">

| Change from the base case | {% katex() %}N^*{% end %} |
|---|---|
| Base case ({% katex() %}B{% end %}=480, {% katex() %}c_{\text{test}}{% end %}=20, {% katex() %}c_{\text{maint}}{% end %}=2) | 26.7 months |
| Half the build cost ({% katex() %}B{% end %}=240) | 13.3 months |
| Double the build cost ({% katex() %}B{% end %}=960) | 53.3 months |
| Cheaper one-shot tests ({% katex() %}c_{\text{test}}{% end %}=10) | 60.0 months |
| More expensive one-shot tests ({% katex() %}c_{\text{test}}{% end %}=40) | 12.6 months |

</div>

Every scenario in that table lands somewhere between roughly one and five years, not between one month and one century. That is the same property [The Simulation Singularity](@/blog/2026-09-13/index.md) relied on when comparing a logarithm against a line. Both curves here are affine rather than one being logarithmic, so the crossover is more sensitive to the specific anchors than [The Simulation Singularity](@/blog/2026-09-13/index.md)'s was. But it does not blow up or collapse to zero under any single anchor moving by a realistic factor of two. A team with genuinely unusual numbers, an extremely cheap review process or an extremely expensive first build, can move outside this range. Most will not.

### Two Honest Limits

Two honest limits on this number, stated the way [The Simulation Singularity](@/blog/2026-09-13/index.md) stated the limits on its own crossover.

First, {% katex() %}c_{\text{test}}{% end %} is modeled as constant, but the organizational-friction argument earlier in this post suggests it is not. An approval process that has already reviewed the same kind of one-shot test a dozen times may streamline it, lowering {% katex() %}c_{\text{test}}{% end %} over time. Or it may accumulate stricter scrutiny as reviewers notice the test keeps recurring without a permanent resolution, raising it. Either drift changes {% katex() %}N^*{% end %} in a direction this simple model does not predict.

Second, and more important, this section's entire comparison treats the one-shot path and the cyclic path as equally effective at the job, differing only in cost. Two Ways a Bounded Probe Still Misses the Tail already showed they are not equally effective at any {% katex() %}N{% end %}: calendar and severity gaps persist regardless of how many one-shot tests a team is willing to pay for. This section's crossover is a lower bound on the case for building the infrastructure. It is an economic argument that holds even if a reader rejects every statistical one above it, not a replacement for those arguments.

### What This Number Is Actually For

This crossover is the answer to the organizational argument earlier in this post, not a side calculation sitting apart from it. "Why a Team Reaches for a One-Shot Test Anyway" showed the reviewer's resistance is not a math error: loss aversion weighs the standing policy's open-ended downside more heavily than the one-shot test's bounded one, precisely because the standing policy has no scheduled expiration to bound it by. Arguing back with Proposition 1 and Proposition 2 alone does not fix that asymmetry, because the reviewer was never disputing the statistics.

What changes the reviewer's own reference point is a number stated in the same currency loss aversion already reasons in: money and engineer-hours, not regret bounds. Telling a reviewer "the exploration is mathematically necessary" asks them to trust an argument outside their own frame. Telling them "every month past roughly two and a quarter years of one-shot testing is a month of avoidable spend, on top of statistics that already say the one-shot tests are the weaker design" gives them a bounded, checkable object inside their own frame: a specific crossover date, past which the standing policy is the cheaper choice by the reviewer's own accounting, not just the safer one by this post's.

That does not erase the asymmetry loss aversion creates. It gives the engineer arguing for Cyclic Adaptive Regulation a number to put next to the reviewer's own intuition, rather than asking the reviewer to simply discount an intuition Kahneman and Tversky already showed is not a mistake to be argued out of.

### Compute Your Own Crossover, a Checklist

Everything above is one worked instance, using this post's own illustrative anchors. Here is the same procedure, stripped to four steps, for a reader pricing the same choice against their own numbers rather than this post's.

1. **Price {% katex() %}c_{\text{test}}{% end %}, the cost of one one-shot test cycle**, in engineer-hours or an equivalent unit: design, coordinate, run, review, write up. Use your organization's actual approval overhead, not an idealized one.
2. **Price {% katex() %}B{% end %}, the one-time cost to design, implement, and validate Cyclic Adaptive Regulation**, the same unit as {% katex() %}c_{\text{test}}{% end %}: the ensemble estimator, integration with existing admission control, safety review.
3. **Price {% katex() %}c_{\text{maint}}{% end %}, the ongoing marginal cost of the cyclic policy once built**, per period, not zero: monitoring and re-tuning, the cost "Two Honest Limits" above says never fully disappears.
4. **Solve {% katex() %}N^\ast = B/(c_{\text{test}}-c_{\text{maint}}){% end %} for {% katex() %}N^\ast{% end %}**, in whatever period {% katex() %}c_{\text{test}}{% end %} and {% katex() %}c_{\text{maint}}{% end %} were priced in. If your planning horizon already exceeds {% katex() %}N^\ast{% end %}, the standing policy is already the cheaper choice by your accounting, independent of Proposition 1 or Proposition 2's statistical argument.

This number is a lower bound on the case for building the infrastructure, not the whole case, exactly as "Two Honest Limits" states: it says nothing about the calendar and severity gaps a one-shot test carries at any {% katex() %}N{% end %}, which is Definition 2's own separate argument. A reviewer who accepts this checklist's own number and still prefers one-shot testing is choosing the statistically weaker design for a reason this checklist cannot see. A reviewer who has never run this checklist has not yet priced the choice they are actually making.

## Model Scope and Failure Envelope

**Claim.** Cyclic probing maps the transfer function securely.
- *Assumption:* The probing frequency is adequately separated from the system's natural dynamics.
- *Failure Mode:* Improper frequency separation induces closed-loop limit-cycle instability{{ cite(ref="21", title="Hollot, C.V., Misra, V., Towsley, D., Gong, W.-B. (2002) -- Analysis and Design of Controllers for AQM Routers Supporting TCP Flows, IEEE Transactions on Automatic Control, 47(6), 945-959") }}{{ cite(ref="23", title="Floyd, S. and Jacobson, V. (1993) -- Random Early Detection Gateways for Congestion Avoidance, IEEE/ACM Transactions on Networking, 1(4), 397-413") }}.

**Claim.** Suboptimal dual control balances the exploration tradeoff.
- *Assumption:* The underlying physical parameters shift slower than the probing cycle.
- *Failure Mode:* High-frequency parameter shifts alias the measurement.

**Claim.** The cycle's own deterministic period is informative rather than confounding.
- *Assumption:* No independent traffic source, a cron job, a retry backoff schedule, a batch pipeline, shares a period commensurate with the cycle's own eight round trips.
- *Failure Mode:* A deterministic probe repeating at a fixed period can lock into phase with an independently periodic traffic source, so that the same phase of the cycle always coincides with the same phase of that source's own load; every probe round trip then samples a biased slice of the traffic mix rather than a representative one, and the cycle cannot distinguish a real capacity signal from this self-inflicted correlation, because nothing about a purely deterministic schedule forces the two periods to drift apart. This post has not built the fix, a randomized or dithered cycle length that breaks exact phase-locking with an unknown external period, and flags it as a named risk rather than resolving it here.

**Claim.** Multiple independently probing controllers reach a workable equilibrium.
- *Assumption:* A shared pricing signal or equivalent coordination mechanism constrains how aggressively any one controller can claim the shared resource.
- *Failure Mode:* Absent that mechanism, the most aggressive prober claims a disproportionate share, as this post's own simulation and the real BBRv3-versus-Cubic finding both show.

**Reversal Condition.** This recommendation, that cyclic adaptive regulation is required rather than a one-shot probe, reverses when the system actuator lacks the physical bandwidth to inject a persistent cyclic perturbation without instantaneously violating hardware limits. BBR's gain cycle can afford to send briefly at 1.25 times its bandwidth estimate, because a modest, temporary queue is a cost measured in milliseconds of added latency. Some control actions cannot make that trade: a hardware rate limit, a safety-critical actuator bound, a fixed-capacity dependency with no slack to absorb a probe's excess.

For those, a brief overshoot means physically exceeding a hard resource ceiling. They cannot pay for a persistent cyclic perturbation the way a packet-paced network flow can, and need a different mechanism entirely for closing the calendar and severity gaps described above. Whatever safety boundary eventually closes that reversal would also need to answer the approval problem this post opened with, not treat it as a separate concern. A boundary a reviewer can check once, rather than a promise a reviewer has to trust indefinitely, is exactly the kind of bounded object the loss-aversion account above says gets approved, but designing one is not attempted here.

## Falsification Criteria

A claim that cannot be wrong is not a claim. [The Simulation Singularity](@/blog/2026-09-13/index.md) stated the conditions under which its own central assertion would fail. This post states the conditions under which its own five central assertions would fail: that the dual optimum is genuinely intractable, that local persistent excitation does not by itself cover global regime discovery, that heavy-tailed severity genuinely requires cyclic sampling, that multi-agent probing genuinely requires its own coordination mechanism, and that bounding excursion probability is not the same as bounding excursion magnitude.

**F5 (Intractability of the dual optimum).**
- *Condition:* an exact, closed-form dynamic programming solution for the dual control problem is demonstrated for a general, non-linear, heavy-tailed queueing system, without requiring suboptimal approximations.
- *If confirmed:* Proposition 2's intractability claim fails. Adaptive, suboptimal heuristics such as cyclic probing become an engineering choice, not a mathematical necessity.

**F6 (Local excitation covers global regime discovery).**
- *Condition:* a BBR-style local persistent-excitation cycle, run indefinitely at a realistic amplitude near the current operating point, is shown to reliably surface a discontinuous, structurally distant regime shift, such as a correlated-retry cascade, that does not already border the neighborhood the cycle actually perturbs.
- *If confirmed:* the local/global distinction this post draws collapses. Cyclic Adaptive Regulation's own persistent-excitation mechanism would be sufficient for global regime discovery on its own, and the calendar-problem argument for passive, unscheduled exposure becomes redundant rather than necessary.

**F7 (Heavy-tail sampling limits).**
- *Condition:* a bounded, single-shot probing methodology is mathematically proven to reliably recover a heavy-tailed severity distribution's own high percentiles, to a stated confidence, from a sample size that does not grow as the tail gets heavier, contrary to what this post's own worked table shows.
- *If confirmed:* the Layer 2 Fit claim collapses. Continuous cyclic probing is no longer structurally required to map tail risk, and isolated chaos experiments would suffice.

**F8 (Multi-agent coordination necessity).**
- *Condition:* a fleet of independently designed Cyclic Adaptive Regulation controllers, sharing a downstream dependency with no shared pricing signal or explicit coordination mechanism, is shown, theoretically or empirically, to converge reliably to a stable, equitable allocation of the shared resource across a realistic range of aggressiveness differences between controllers.
- *If confirmed:* the game-theoretic gap this post names in "The Fairness Cost Is a Game, Not Just a Control Problem" collapses. Single-agent dual control design, Proposition 2 alone, would be sufficient even at fleet scale, and any safety boundary built on top of it would not need a coordination layer to prevent one service's probing from starving another's.

**F9 (A probability-of-excursion bound also bounds excursion magnitude).**
- *Condition:* a discrete-time stochastic control barrier function, or an equivalent safety mechanism, is shown to bound the magnitude of harm a single safe-region excursion can cause, under a genuinely heavy-tailed severity distribution, using only its existing guarantee on the probability of excursion, with no additional mechanism.
- *If confirmed:* the gap this post names between bounding excursion probability and bounding excursion magnitude collapses on its own, and no separate severity-capping mechanism would be needed beyond a safety boundary of that kind.

## The Property Verdict Ledger, Continued

**Cyclic Adaptive Regulation**

*Formal Proposition:* Proposition 2, Feldbaum Dual Effect and Suboptimal Approximation.

*Production Instance:* Google's continuous revision of BBR congestion control, from the frozen 2016 model to BBRv3's 2024 public-internet deployment, showing that a cyclic probing policy needs ongoing design tuning against real, non-stationary traffic, not a one-time mathematical proof.

*Exact vs. Approximate:* Layer 1 exact for the existence and general intractability of the dual effect; Layer 3 approximate for applying persistent-excitation-style reasoning to isolate heavy-tailed microservice traffic drift from a steady-state signal.

*Verdict:* a cyclic adaptive policy resolves the modeling tax by paying the Lai-Robbins exploration cost continuously rather than never. It forces the system to measure its own capacity as an ordinary part of operating, rather than needing a separate, riskier act of deliberate probing to do it.

Read this post's own sections as more than one discipline answering the same question, the way [The Simulation Singularity](@/blog/2026-09-13/index.md)'s ledger row did for its own argument.

| Discipline | What it contributes | Where it appears above |
|---|---|---|
| Control theory | Names the dual effect and the specific way an exact solution becomes intractable, forcing a suboptimal approximation | Feldbaum, Bar-Shalom, Tse; Definition 2 and Proposition 2 |
| Cybernetics | Shows the same identifiability requirement exists independently of control theory, for any system tested from the outside | The Black Box Was Never Silent (Ashby) |
| Behavioral economics, cognitive psychology, and organizational sociology | Explains why teams reach for the statistically weaker design anyway, why that choice feels less risky to approve even when it costs more in expectation, why the specific test chosen was built to confirm a suspicion rather than discriminate it from a broader class, and why a quiet track record is read as safety rather than as an unremarkable feature of sampling a heavy tail | Why a Team Reaches for a One-Shot Test Anyway (Simon, Kahneman and Tversky, Klayman and Ha, Baron, Beattie and Hershey); The Severity Gap Has an Organizational Half-Life (Vaughan) |
| Game theory | Explains why a solution to the single-agent version of this problem does not automatically solve the multi-agent version, and names the specific mechanism, a shared price, that changes the equilibrium | The Fairness Cost Is a Game, Not Just a Control Problem (Roughgarden, Tardos, Kelly) |
| Engineering economics | Prices the build-once-versus-pay-repeatedly choice directly, independently of whether the statistical arguments above are accepted | When Building the Infrastructure Pays for Itself |

[The Simulation Singularity](@/blog/2026-09-13/index.md) already established why that convergence matters: none of its own six disciplines needed the others to reach its conclusion, and a finding that survives the trip across several independent ones is closer to a property of the underlying situation than an artifact of whichever field happened to describe it first. The same holds here for control theory, cybernetics, organizational sociology, game theory, and economics. Behavioral economics deserves particular note among the five. It is the only one that predicts the platform team's actual behavior rather than the mathematics of the problem. Kahneman and Tversky's asymmetry, and Vaughan's account of what a quiet track record does to risk perception, both describe the humans in the loop, not the traffic.

## What This Post Did Not Claim

Every worked model in this post is an illustration, not a proof. The persistent-excitation experiment, the heavy-tail severity table, the ensemble-versus-point-estimate comparison, the two-flow fairness simulation: each makes a cited theorem's phenomenon checkable in a small case. None of them restates the theorem itself, and none of their specific numbers generalize. The fortyfold variance reduction, the 2.9-to-1 fairness ratio, the two-and-a-quarter-year infrastructure crossover: change the anchors and the numbers change with them. The Ashby, Kahneman-Tversky, and Klayman-Ha/Baron-Beattie-Hershey comparisons all work the same way. Each is this post's own application of an existing result to a new scenario, not something any of those authors tested here.

It has not been claimed that BBR's own gain cycle, or Cyclic Adaptive Regulation modeled on it, discovers a distant, unmapped regime the way an active search would. The cycle's persistent excitation is local, aimed at whatever operating point the system is already near. "The Cycle Finds Drift, Not a Distant Cliff" names this limit on purpose rather than letting the BBR analogy imply more reach than Definition 2 actually has. What closes part of the gap to a distant regime is the calendar-problem fix, and it is a claim about staying exposed long enough for a rare event to occur on its own, not a claim about locally perturbing a system into revealing one.

Three open questions are named on purpose, not answered. BBRv3's 12 percent retransmit gain and its fairness cost against Cubic flows are both real, and this post does not decide which should win a deployment call. Solving the calendar and severity-estimation gaps only proves a probe eventually learns its environment's own worst case. It does not bound how bad any single excursion is allowed to be while that learning is still underway, and this post has been explicit that a probability-of-excursion guarantee is not the same guarantee as a magnitude-of-excursion guarantee. And how one controller's safety boundary composes across a fleet of simultaneously probing services is asked, not resolved. All three are left standing as open questions at the end of this post.

Two findings get corrected on purpose, not softened. BBR's original design meant for aggressive flows to yield bandwidth to gentler ones. Zeynali et al. show that intent failing under one specific real condition, not disproven wholesale. And the idealized row, the market-clearing price substituted in directly, is Kelly's fixed point itself, not a claim that any real price loop reaches it instantly. A real system's distance from that fixed point is set by how long its flows have had to converge, not by how well the price loop is tuned.

Last, the physical-contradiction framing here is the same retrospective lens [The Simulation Singularity](@/blog/2026-09-13/index.md) already disclaimed, read backward onto engineering work done for other reasons.

{% cognitive_map(root="Dual Control and the Weaponized Probe") %}
{
  "intro": "A one-shot injected test looks like the opposite of the frozen simulator that failed in <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a>. It is the same under-sampling mistake, run once instead of never. What follows traces why that instinct fails, the continuous alternative Feldbaum's dual control theory demands instead, and the two gaps a continuous probe still leaves standing.",
  "groups": [
  {"theme": "Why the One-Shot Test Fails", "c": "mint", "points": [
    [1, "The Same Mistake, Run Once", "A one-shot injected test, the platform team's first instinct after <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a>'s postmortem, only looks like the opposite of refusing to explore. Underneath, it is the same under-sampling mistake, run once instead of never, because a bounded sample of a rare regime is still, in expectation, a sample of zero occurrences of it."],
    [2, "Why Teams Reach for It Anyway", "Teams reach for that one-shot test anyway for a reason that has nothing to do with the mathematics: a bounded experiment has a shape an approval process already knows how to sign off on, and a perpetual probe does not. That organizational gap, not a failure to understand Proposition 1, is left standing at the end of this post, unsolved. Loss aversion sharpens why: a reviewer weighs the open-ended downside of a standing change more heavily than an equivalent, bounded downside with a scheduled expiration, the same asymmetry Kahneman and Tversky found in individual risk decisions, applied here to two proposals compared against different reference points. The specific test shape has its own, separate explanation: it was built to confirm the one regime already suspected, not to discriminate that regime from a broader class, the same congruence bias <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a> measured costing the most exactly under genuine uncertainty."],
    [3, "Feldbaum's Dual Effect", "Feldbaum's dual control theory names what the team was actually missing: a control action under uncertainty already has a dual effect, regulating and informing at once, whether or not anyone builds a mechanism to keep the informing half."],
    [4, "Willingness to Reconsider, Built In", "An ensemble of estimators is not automatically better than a single running average. This post's own worked example shows a naive ensemble that never revisits a confident hypothesis can fail completely, worse than a plain average. What actually earns Definition 2's \"tracks uncertainty\" is a small, constant willingness to reconsider, built in on purpose."]
  ]},
  {"theme": "Building the Continuous Alternative", "c": "sky", "points": [
    [5, "Cyclic Adaptive Regulation, the Approximation", "The exact optimal dual controller is computationally intractable in general. What is achievable is a suboptimal approximation, Cyclic Adaptive Regulation, that keeps the dual effect alive by treating ordinary regulation as an ongoing measurement, never a separately scheduled one."],
    [6, "BBR Already Runs This Shape", "TCP BBR has been running exactly this shape at internet scale since 2016, seven years before the academic formalization this post cites, discovered independently by engineers solving a concrete networking problem."],
    [7, "A Transient Can't Keep Identifying", "A single transient can identify a system about as well as a perpetual cycle can, briefly. What a transient cannot do is keep identifying it: this post's own worked example shows a settled, unchanging operating point produces almost no new identifying information no matter how long it is observed, which is why BBR's cycle has no \"stop once confident\" condition."],
    [8, "Ashby's Black Box, Restated", "This is not a control-theory-specific fact. Ashby named the same problem in 1956 for any Black Box tested at only one input: a system probed one way, however many times, cannot have its internal structure distinguished from every other structure consistent with that one answer."]
  ]},
  {"theme": "What Continuous Still Doesn't Solve Alone", "c": "peach", "points": [
    [9, "BBR's Re-Tuning Never Finishes", "BBR's own history across three major revisions shows Proposition 2's Layer 3 line is never finished: the suboptimal approximation gets re-tuned against real, non-stationary, shared conditions indefinitely, trading one failure mode for another rather than converging on a final design. The original 2016 design even built in an intended fairness-convergence mechanism, larger flows yielding more during the drain phase. A later revision, under one specific real condition, was independently measured claiming over 99 percent of a shared bottleneck anyway."],
    [10, "Probing Becomes a Game", "Once more than one controller probes the same shared resource, the problem stops being single-agent dual control and becomes a game: BBRv3's capacity to claim over 99 percent of a bottleneck's bandwidth from competing flows is what an individually rational prober does absent a coordinating mechanism, the same phenomenon Roughgarden, Tardos, and Kelly formalize for other resource-sharing settings. A shared pricing mechanism sharply narrows, but does not automatically erase, the advantage raw aggressiveness buys, this post's simulation shows a roughly 33.6-to-1 split collapsing to about 2.9-to-1 under one, drifting the rest of the way toward whatever split is actually declared fair."],
    [11, "A Convergence Delay, Not a Tuning Artifact", "That leftover 2.9-to-1 advantage does not depend on how fast the shared price adapts, a hundredfold range of price-loop step sizes gives the identical split, because Kelly's fixed point is set by declared weight alone, independent of either flow's reaction speed. It is the slow flow still mid-transient toward that fixed point: the same split narrows to 28.3 percent at 400,000 rounds and 43.3 percent at 2,000,000, still closing. The idealized row is not a faster price; it is that fixed point substituted in directly. A real fleet, where flows arrive, restart, and depart continuously, may never sit near enough to it for Kelly's guarantee to describe what a flow actually gets, which is a genuine, separate engineering problem, distinct from the real physical floor a distributed price's propagation delay sets, and distinct from either one being a defect in Kelly's result."],
    [12, "Resolved by Separation in Time", "The contradiction underneath all of this is one parameter, the control action taken right now, asked to be both a pure regulator and an explorer at once. This post resolves it with one of the three separating moves <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a> left open without choosing among them: separation in time, not compromise. BBR's cycle, and this post's own Definition 2, are what that resolution looks like built, not merely described."]
  ]},
  {"theme": "The Gaps That Remain", "c": "rose", "points": [
    [13, "Calendar Solved, Severity Not", "A cyclic probe that never stops solves the calendar problem <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a> already quantified, roughly eight years of exposure needed for 95 percent confidence under this series' own anchor rate, by staying exposed rather than by actively searching: BBR's own local persistent excitation targets drift near the current operating point, not a distant regime, and the calendar fix works regardless, because it never depended on that local mechanism reaching that far. Solving the calendar problem does not, by itself, solve the severity problem: how badly the tail can get, estimated from a bounded number of observed occurrences, degrades sharply as the tail gets heavier, a distinct failure this post's own simulation makes concrete."],
    [14, "Severity's Organizational Half-Life", "The severity gap has an organizational half-life, not just a statistical one: a long run without a severe incident reads to the humans watching it as evidence the worst case is mild, exactly the drift Vaughan documented at NASA, even though a heavy tail makes that reading unjustified regardless of how long the quiet run continues."],
    [15, "Cheaper to Build Once", "Even setting the statistics aside, building Cyclic Adaptive Regulation once is cheaper in ordinary engineering labor than paying for one-shot tests indefinitely, past roughly two and a quarter years of expected operating life under this post's own illustrative anchors, an economic argument that holds independently of every statistical one above it. That crossover date is also the practical answer to point 2's loss-aversion problem: a number in the reviewer's own currency, not just a regret bound in the engineer's."],
    [16, "The Safety Question Stays Open", "None of these gaps, organizational, game-theoretic, economic, or severity-related, tells the system what it is allowed to do while measuring. That is a safety question, not a measurement question, and this post leaves it open."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**Why the One-Shot Test Fails**

1. A one-shot injected test, the platform team's first instinct after [The Simulation Singularity](@/blog/2026-09-13/index.md)'s postmortem, only looks like the opposite of refusing to explore. Underneath, it is the same under-sampling mistake, run once instead of never, because a bounded sample of a rare regime is still, in expectation, a sample of zero occurrences of it.
2. Teams reach for that one-shot test anyway for a reason that has nothing to do with the mathematics: a bounded experiment has a shape an approval process already knows how to sign off on, and a perpetual probe does not. That organizational gap, not a failure to understand Proposition 1, is left standing at the end of this post, unsolved. Loss aversion sharpens why: a reviewer weighs the open-ended downside of a standing change more heavily than an equivalent, bounded downside with a scheduled expiration, the same asymmetry Kahneman and Tversky found in individual risk decisions, applied here to two proposals compared against different reference points. The specific test shape has its own, separate explanation: it was built to confirm the one regime already suspected, not to discriminate that regime from a broader class, the same congruence bias [The Simulation Singularity](@/blog/2026-09-13/index.md) measured costing the most exactly under genuine uncertainty.
3. Feldbaum's dual control theory names what the team was actually missing: a control action under uncertainty already has a dual effect, regulating and informing at once, whether or not anyone builds a mechanism to keep the informing half.
4. An ensemble of estimators is not automatically better than a single running average. This post's own worked example shows a naive ensemble that never revisits a confident hypothesis can fail completely, worse than a plain average. What actually earns Definition 2's "tracks uncertainty" is a small, constant willingness to reconsider, built in on purpose.

**Building the Continuous Alternative**

5. The exact optimal dual controller is computationally intractable in general. What is achievable is a suboptimal approximation, Cyclic Adaptive Regulation, that keeps the dual effect alive by treating ordinary regulation as an ongoing measurement, never a separately scheduled one.
6. TCP BBR has been running exactly this shape at internet scale since 2016, seven years before the academic formalization this post cites, discovered independently by engineers solving a concrete networking problem.
7. A single transient can identify a system about as well as a perpetual cycle can, briefly. What a transient cannot do is keep identifying it: this post's own worked example shows a settled, unchanging operating point produces almost no new identifying information no matter how long it is observed, which is why BBR's cycle has no "stop once confident" condition.
8. This is not a control-theory-specific fact. Ashby named the same problem in 1956 for any Black Box tested at only one input: a system probed one way, however many times, cannot have its internal structure distinguished from every other structure consistent with that one answer.

**What Continuous Still Doesn't Solve Alone**

9. BBR's own history across three major revisions shows Proposition 2's Layer 3 line is never finished: the suboptimal approximation gets re-tuned against real, non-stationary, shared conditions indefinitely, trading one failure mode for another rather than converging on a final design. The original 2016 design even built in an intended fairness-convergence mechanism, larger flows yielding more during the drain phase. A later revision, under one specific real condition, was independently measured claiming over 99 percent of a shared bottleneck anyway.
10. Once more than one controller probes the same shared resource, the problem stops being single-agent dual control and becomes a game: BBRv3's capacity to claim over 99 percent of a bottleneck's bandwidth from competing flows is what an individually rational prober does absent a coordinating mechanism, the same phenomenon Roughgarden, Tardos, and Kelly formalize for other resource-sharing settings. A shared pricing mechanism sharply narrows, but does not automatically erase, the advantage raw aggressiveness buys, this post's simulation shows a roughly 33.6-to-1 split collapsing to about 2.9-to-1 under one, drifting the rest of the way toward whatever split is actually declared fair.
11. That leftover 2.9-to-1 advantage does not depend on how fast the shared price adapts, a hundredfold range of price-loop step sizes gives the identical split, because Kelly's fixed point is set by declared weight alone, independent of either flow's reaction speed. It is the slow flow still mid-transient toward that fixed point: the same split narrows to 28.3 percent at 400,000 rounds and 43.3 percent at 2,000,000, still closing. The idealized row is not a faster price; it is that fixed point substituted in directly. A real fleet, where flows arrive, restart, and depart continuously, may never sit near enough to it for Kelly's guarantee to describe what a flow actually gets, which is a genuine, separate engineering problem, distinct from the real physical floor a distributed price's propagation delay sets, and distinct from either one being a defect in Kelly's result.
12. The contradiction underneath all of this is one parameter, the control action taken right now, asked to be both a pure regulator and an explorer at once. This post resolves it with one of the three separating moves [The Simulation Singularity](@/blog/2026-09-13/index.md) left open without choosing among them: separation in time, not compromise. BBR's cycle, and this post's own Definition 2, are what that resolution looks like built, not merely described.

**The Gaps That Remain**

13. A cyclic probe that never stops solves the calendar problem [The Simulation Singularity](@/blog/2026-09-13/index.md) already quantified, roughly eight years of exposure needed for 95 percent confidence under this series' own anchor rate, by staying exposed rather than by actively searching: BBR's own local persistent excitation targets drift near the current operating point, not a distant regime, and the calendar fix works regardless, because it never depended on that local mechanism reaching that far. Solving the calendar problem does not, by itself, solve the severity problem: how badly the tail can get, estimated from a bounded number of observed occurrences, degrades sharply as the tail gets heavier, a distinct failure this post's own simulation makes concrete.
14. The severity gap has an organizational half-life, not just a statistical one: a long run without a severe incident reads to the humans watching it as evidence the worst case is mild, exactly the drift Vaughan documented at NASA, even though a heavy tail makes that reading unjustified regardless of how long the quiet run continues.
15. Even setting the statistics aside, building Cyclic Adaptive Regulation once is cheaper in ordinary engineering labor than paying for one-shot tests indefinitely, past roughly two and a quarter years of expected operating life under this post's own illustrative anchors, an economic argument that holds independently of every statistical one above it. That crossover date is also the practical answer to point 2's loss-aversion problem: a number in the reviewer's own currency, not just a regret bound in the engineer's.
16. None of these gaps, organizational, game-theoretic, economic, or severity-related, tells the system what it is allowed to do while measuring. That is a safety question, not a measurement question, and this post leaves it open.

</details>


**Compute it.** Before trusting a probe design because it runs continuously instead of once, ask two separate questions, not one: has it run long enough, in calendar time, to have had a real chance at observing the regime it is built to find, and separately, has it observed that regime enough times to estimate its worst case rather than its typical case. A probe can pass the first question and fail the second silently, producing a confident, continuously updating severity estimate that is confidently wrong, for exactly as long as the tail stays light enough not to correct it.

This post replaced one congruent system with a design that cannot settle into congruence by construction. It is a control action that keeps generating disagreement with its own current estimate as an ordinary side effect of operating, not as a separately scheduled event a team can quietly stop scheduling. What it has not yet done is say what that control action is allowed to do while it disagrees with itself. Where that boundary gets drawn is left as this post's own open question.

---
<sup>[1]</sup> Kahneman, D. & Tversky, A. (1979). *Prospect Theory: An Analysis of Decision under Risk.* Econometrica, 47(2), 263-291.

<sup>[2]</sup> Klayman, J. & Ha, Y. (1987). *Confirmation, Disconfirmation, and Information in Hypothesis Testing.* Psychological Review, 94(2), 211-228.

<sup>[3]</sup> Baron, J., Beattie, J. & Hershey, J.C. (1988). *Heuristics and Biases in Diagnostic Reasoning: II. Congruence, Information, and Certainty.* Organizational Behavior and Human Decision Processes, 42(1), 88-110.

<sup>[4]</sup> Feldbaum, A.A. (1960-61). *Theory of Dual Control, I-IV.* Avtomatika i Telemekhanika.

<sup>[5]</sup> Mehra, R.K. (1974). *Optimal Input Signals for Parameter Estimation in Dynamic Systems--Survey and New Results.* IEEE Transactions on Automatic Control, 19(6), 753-768.

<sup>[6]</sup> Li, Z., Chen, W-H., Yang, J., Yan, Y. (2023). *Dual Control of Exploration and Exploitation for Auto-Optimisation Control with Active Learning.* arXiv:2301.11984.

<sup>[7]</sup> Bar-Shalom, Y. & Tse, E. (1974). *Dual effect, certainty equivalence, and separation in stochastic control.* IEEE Transactions on Automatic Control, 19(5), 494-500.

<sup>[8]</sup> Tse, E. & Bar-Shalom, Y. (1973). *An actively adaptive control for linear systems with random parameters via the dual control approach.* IEEE Transactions on Automatic Control, 18(2), 109-117.

<sup>[9]</sup> Resnick, S.I. (1997). *Heavy tail modeling and teletraffic data.* Annals of Statistics, 25(5), 1805-1869.

<sup>[10]</sup> Foss, S., Korshunov, D., Zachary, S. (2013). *An Introduction to Heavy-Tailed and Subexponential Distributions*, 2nd ed. Springer.

<sup>[11]</sup> Bubeck, S., Cesa-Bianchi, N. & Lugosi, G. (2013). *Bandits with Heavy Tail.* IEEE Transactions on Information Theory, 59(11), 7711-7717.

<sup>[12]</sup> Åström, K.J. & Wittenmark, B. (1995). *Adaptive Control*, 2nd ed. Addison-Wesley.

<sup>[13]</sup> Blom, H.A.P. & Bar-Shalom, Y. (1988). *The Interacting Multiple Model Algorithm for Systems with Markovian Switching Coefficients.* IEEE Transactions on Automatic Control, 33(8), 780-783.

<sup>[14]</sup> Cardwell, N., Cheng, Y., Gunn, C.S., Hassas Yeganeh, S. & Jacobson, V. (2016). *BBR: Congestion-Based Congestion Control.* ACM Queue, 14(5), 20-53.

<sup>[15]</sup> Ashby, W.R. (1956). *An Introduction to Cybernetics.* Chapman and Hall (Chapter 6, The Black Box).

<sup>[16]</sup> Cardwell, N. et al. *BBR Congestion Control.* IETF Internet-Draft draft-ietf-ccwg-bbr (active working-group draft, not yet a published RFC).

<sup>[17]</sup> Cardwell, N., Cheng, Y., Yang, C.S., Morley, D., Hassas Yeganeh, S., Jha, P., Seung, Y. & Jacobson, V. (2023). *BBRv3: Algorithm Bug Fixes and Public Internet Deployment.* IETF 117 working-group presentation, July 2023.

<sup>[18]</sup> Zeynali, D., Weyulu, E.N., Fathalli, S., Chandrasekaran, B. & Feldmann, A. (2024). *BBRv3 in the public Internet: a boon or a bane?* Proceedings of the 2024 Applied Networking Research Workshop (ANRW), ACM. DOI 10.1145/3673422.3674889.

<sup>[19]</sup> Roughgarden, T. & Tardos, E. (2002). *How Bad is Selfish Routing?* Journal of the ACM, 49(2), 236-259.

<sup>[20]</sup> Kelly, F.P. (1997). *Charging and rate control for elastic traffic.* European Transactions on Telecommunications, 8(1), 33-37.

<sup>[21]</sup> Hollot, C.V., Misra, V., Towsley, D., Gong, W.-B. (2002). *Analysis and Design of Controllers for AQM Routers Supporting TCP Flows.* IEEE Transactions on Automatic Control, 47(6), 945-959.

<sup>[22]</sup> Vaughan, D. (1996). *The Challenger Launch Decision: Risky Technology, Culture, and Deviance at NASA.* University of Chicago Press.

<sup>[23]</sup> Floyd, S. and Jacobson, V. (1993). *Random Early Detection Gateways for Congestion Avoidance.* IEEE/ACM Transactions on Networking, 1(4), 397-413.
