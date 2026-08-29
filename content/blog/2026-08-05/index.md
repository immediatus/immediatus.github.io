+++
authors = ["Yuriy Polyulya"]
title = "The Phase MAPE-K Usually Skips"
description = "No algorithm can save a Blood Oath workload: Post 1 proved that formally. What's left is physical, not algorithmic: a redline that watches real headroom and its derivative instead of trusting a number, an honest accounting of when autoscaling actually helps, and a buffer sized by the same critical-fractile logic that opened the series. None of it adapts on its own; that only starts once MAPE-K's own most commonly skipped phase, Knowledge, actually closes the loop the other four were never built to close by themselves."
date = 2026-08-05
slug = "no-safe-number-part2-provisioning-window"
draft = false

[taxonomies]
tags = ["distributed-systems", "queueing-theory", "autonomic-computing", "control-theory"]
series = ["no-safe-number"]

[extra]
toc = false
series_order = 2
series_title = "Asymptotically Ruined: Capacity Planning Beyond the Light-Tailed Assumption"
series_description = """<div class="series-lede">The greatest paradox in distributed systems engineering is that our obsession with "simplicity" is the single most reliable generator of unmanageable complexity.</div>Capacity planning under heavy-tailed demand isn't harder than under light-tailed demand, it's structurally different, and this series proves exactly where that difference breaks a standard capacity number. It then builds what survives it: a physical-signal admission control loop, a multi-resource generalization checked against an independent Price-of-Anarchy result, an eviction rule derived as optimal stopping, and a fleet-pooling result sized by the same square-root staffing law used in queueing theory. Before recommending any of it, the series prices what the adaptive machinery itself costs to run, and closes with a decentralized-versus-centralized architecture comparison, translated into a concrete build order and on-call runbook."""
+++

## The Team on Call Doesn't Get to Wait for Proof

Somewhere past minute ten of the incident Post 1 described, an engineer is staring at the same 32-slot pool, and the theorem doesn't help them yet. They don't need to be told no algorithm can save this. [Proposition A](/blog/no-safe-number-part1-blood-oath/#prop-a) already settled that, and re-deriving it live in an incident channel wouldn't buy back a single slot. What they need is much smaller and much more urgent: *something* has to happen in the next few seconds, before the pool finishes filling. "No admission policy can promise safety in the worst case" is not an instruction anyone can act on at 2 a.m.

Three instincts show up in that channel, every time, in some order:

| Instinct | What it means | Verdict |
| :--- | :--- | :--- |
| Catch it before it happens | A smarter admission rule | Closed. Proposition A proved it, not suggested it. |
| Catch it while it's happening | A tripwire acting on the pool directly | This post's Physical Redline (Definition 2). |
| Ride it out, add capacity | Scale the pool, let new room absorb it | This post's Provisioning Window (Proposition 2): plus the cost nobody asks about: what the *gap* between "tripwire fires" and "new capacity live" costs, and who pays it. |

*The three instincts an on-call engineer reaches for during the incident, and which one, if any, this post actually validates.*

The pool is still Post 1's pool: thirty-two slots, a heavy-task rate of roughly one in two thousand, light calls done in about half a second, reasoning traces holding a slot for about five minutes, sedimenting to around 23% heavy occupancy at steady state as an ordinary consequence of Little's Law, not an incident, not yet. What turns "not yet" into the channel filling up is the question this post actually answers, option by option, not asserted, checked.

<span id="prop-1"></span>

<details>
<summary>Proposition 1 -- The Sedimentation Threshold: past a specific point, heavy tasks alone can fill the pool, and no admission policy changes that</summary>

**Proposition 1** (Sedimentation Threshold). Let {% katex() %}\lambda_h{% end %} be the arrival rate of heavy tasks and {% katex() %}E[S_h]{% end %} their mean holding time. By Little's Law {{ cite(ref="1", title="Little, J.D.C. (1961) — A Proof for the Queuing Formula: L = λW") }}, {% katex() %}\rho_h = \lambda_h \cdot E[S_h]{% end %} is the offered heavy-task load, in Erlangs: the expected number of heavy tasks occupying slots at steady state if the pool had unlimited room to admit them, precise below saturation and, per the caveat below, an increasingly loose upper bound as the pool actually fills. Once {% katex() %}\rho_h \geq C{% end %} (pool capacity) heavy tasks alone, in expectation, can fill the entire pool, independent of light-task volume entirely. This is not a threshold cut through a tradeoff space, the way [Proposition 0](/blog/no-safe-number-part1-blood-oath/#prop-0) draws one; there is no cost ratio to weigh against it, no point on a frontier that becomes preferable. It is a face removed from the achievable region, the same category of exclusion as Proposition A's impossibility result: past {% katex() %}\rho_h = C{% end %}, no admission policy (clever or otherwise) reaches a state where the pool reliably serves light traffic, because the pool's entire capacity is, in expectation, already spoken for by a class of task no admission rule can safely reject in advance ([Definition 1](/blog/no-safe-number-part1-blood-oath/#def-1), property 1) or evict once admitted (property 2).

</details>

*How close is Post 1's own pool to this line?* Plug in the case study's own numbers, in units anyone can watch on a dashboard: heavy-task arrivals per hour, not an abstract multiplier. Baseline heavy occupancy: about 23% of the pool, {% katex() %}\rho_h \approx 7.4{% end %} of {% katex() %}C=32{% end %} slots, corresponds to roughly **89 reasoning traces per hour**. The Sedimentation Threshold, {% katex() %}\rho_h = C{% end %}, corresponds to roughly **384 reasoning traces per hour**. Two numbers, and they're the ones that matter: an ordinary hour, and the hour where heavy tasks alone could fill the pool regardless of how well anything else is served. Post 1's own case study already named the realistic way traffic moves between them, not a fixed multiplier applied uniformly, but a specific kind of event, like a new agentic workflow rollout that chains what used to be one reasoning call into several. 384/hour is real, countable, alertable, not a hypothetical. A team instrumenting heavy-task arrival rate directly has a genuine early-warning line to watch, well before the pool itself shows any sign of trouble.

Worth being precise about the numbers above: both use {% katex() %}\lambda_h{% end %} as *offered* heavy-task rate, and {% katex() %}\rho_h = \lambda_h \cdot E[S_h]{% end %} is exact only when offered rate and *admitted* rate are the same thing. That's true well below saturation, where a heavy task essentially always finds a free slot, but decreasingly true as the pool fills, since a bounded pool with no queue is a loss system: once every slot is taken, the next arrival of either kind is rejected outright, not delayed. Near the threshold, light traffic's sheer numerical advantage (99.95% of arrivals) means it wins most of the races for newly-freed slots, which crowds out heavy admissions relative to what the offered-rate formula predicts. The real system saturates in a messier, more favorable way than the linear formula alone suggests. This doesn't weaken Proposition 1's claim; the threshold is a statement about *offered* load, exactly the quantity that determines whether a stable, non-blocking regime is possible at all, which is what actually matters for knowing whether you're heading toward trouble. It does mean the formula's precision degrades exactly where the stakes are highest. A real deployment should instrument admitted heavy rate directly, rather than trust the offered-rate approximation once utilization climbs.

> **Physical translation.** Proposition 0 asks "how much capacity." Proposition 1 asks a sharper question about the same pool: is the *heavy* traffic alone, by itself, enough to consume everything, regardless of how well the light traffic is served? Below the threshold, the pool's fate still depends on the full mix. At and past it, the fate is decided by the heavy sub-population in isolation, which is precisely why a fix aimed at optimizing the admission mix (Proposition 0's territory) cannot help once {% katex() %}\rho_h{% end %} crosses {% katex() %}C{% end %}. This is the {% term(url="@/blog/2025-12-27/index.md#the-constraint-sequence-framework", def="A candidate constraint cannot be resolved by re-optimizing at the level of abstraction that revealed it; the dependency graph determines which constraint must be secured before the next one becomes binding") %}Constraint Sequence Framework{% end %}'s second application in this series: Post 1 used it once, at the transition from capacity to scheduling; this is the same move again, at the transition from "which tasks to admit" to "what physical signal tells you it's already too late to matter."

## The Physical Redline

<span id="def-2a"></span>

<details>
<summary>Definition 2a -- The Physical Redline Achievable Region: safety margin traded against usable capacity, the same frontier shape as Post 1's Definition 0</summary>

**Definition 2a** (Physical Redline Achievable Region). Given a headroom signal {% katex() %}H(t){% end %} (the pool's distance from a genuine physical failure boundary) every choice of a reserved margin {% katex() %}H_{\min}{% end %} (in slot-equivalents held back from ordinary admission) maps to a point {% katex() %}(R(H_{\min}),\ E[\text{failure} \mid H_{\min}, G]){% end %}: usable capacity retained, {% katex() %}R(H_{\min}) = C - H_{\min}{% end %}, against the expected cost of {% katex() %}H_{\min}{% end %} proving insufficient, where {% katex() %}G{% end %} is the distribution of additional slot-equivalents demanded by newly-arriving heavy tasks during a bridging window. Raising {% katex() %}H_{\min}{% end %} decreases failure cost and decreases usable capacity; lowering it does the reverse, and no choice improves one without worsening the other. This is the same two-cost frontier shape as Post 1's [Definition 0](/blog/no-safe-number-part1-blood-oath/#def-0).

where:

* {% katex() %}H(t){% end %} - the headroom signal, distance from physical failure
* {% katex() %}H_{\min}{% end %} - the reserved margin, in slot-equivalents
* {% katex() %}R(H_{\min}) = C - H_{\min}{% end %} - the usable capacity retained
* {% katex() %}G{% end %} - the distribution of additional demand during a bridging window

</details>

*Grounded in numbers, not left symbolic: including the cost ratio itself.* During a bridging window of length {% katex() %}T_{\text{scale}}{% end %}, additional heavy-task arrivals are a count process, a standard Poisson model, with mean {% katex() %}\lambda_h \cdot T_{\text{scale}}{% end %}. Plugging in this series' own {% katex() %}\lambda_h{% end %} (implied by Proposition 1's baseline {% katex() %}\rho_h \approx 7.4{% end %} at {% katex() %}E[S_h]=300{% end %}s) and Proposition 2's {% katex() %}T_{\text{scale}}=90{% end %}s gives a mean of **2.22** additional heavy arrivals per bridging window. {% katex() %}G{% end %} is {% katex() %}\text{Poisson}(2.22){% end %}. The cost ratio needs its own grounding, not a borrowed illustrative number: buffer exhaustion means the node dies with every immortal task still on it (Definition 1) (all 32 slots' worth of in-flight work) while overage costs exactly one idle slot. That's a **32:1** underage-to-overage ratio by the pool's own structure, not 4:1. {% katex() %}G(H_{\min}) \geq 32/33 = 0.970{% end %} first at {% katex() %}H_{\min}=5{% end %}: {% katex() %}G(4) = 0.926{% end %}, still short; {% katex() %}G(5) = 0.974{% end %}, past target. Reserving 5 of 32 slots (a little under 16% of the pool) as standing margin is where this achievable region's frontier actually sits once the ratio reflects what failure here actually costs.

> **Physical translation.** {% katex() %}H_{\min}{% end %} is not a tuning parameter chosen once and defended. It is a point on a frontier, the same way Post 1's {% katex() %}Q^*{% end %} was a point on a frontier. Exactly like {% katex() %}Q^*{% end %}, the correct point depends on a ratio nobody gets to skip stating: how much operating margin is worth sacrificing per unit of actual safety gained. Definition 2, next, is the mechanism that acts once {% katex() %}H(t){% end %} approaches this point. Proposition 3, later, shows this same {% katex() %}H_{\min}{% end %} is also the answer to a critical-fractile problem. One object, reached two ways, not two objects that happen to share a name.

<span id="def-2"></span>

<details>
<summary>Definition 2 -- The Physical Redline: gate demotion on a physical signal and its trajectory, not on the workload's own self-report</summary>

**Definition 2** (Physical Redline). Given the achievable region above, fix an operating point {% katex() %}H_{\min}{% end %} and monitor two quantities continuously: {% katex() %}H(t){% end %}, current headroom, and {% katex() %}\dot{H}(t){% end %}, its rate of change. Demote whenever {% katex() %}H(t) \leq H_{\min}{% end %}, or whenever the trajectory implied by {% katex() %}\dot{H}(t){% end %} would cross {% katex() %}H_{\min}{% end %} before the next observation. The derivative term exists because a headroom signal that's merely low but stable is a different situation from one falling fast, and waiting for the first to become the second wastes exactly the lead time a physical signal is supposed to buy. Demotion means what Post 1 already committed it to mean precisely: reclassify every task the elapsed-time posterior ([Definition 1b](/blog/no-safe-number-part1-blood-oath/#def-1b)) currently flags as heavy from ordinary resource-accounting class to a lower-priority one, adjusting the scheduler's own weighting of it accordingly. The task itself is untouched: still running, still holding its slot. What changes is how the system schedules around it.

</details>

One precision worth stating plainly: {% katex() %}H(t){% end %} is an EWMA-smoothed reading, not raw telemetry:

{% katex(block=true) %}
\hat{H}(t) = \eta \cdot H_{\text{raw}}(t) + (1-\eta) \cdot \hat{H}(t-1)
{% end %}

where:

* {% katex() %}H_{\text{raw}}(t){% end %} - the raw telemetry reading
* {% katex() %}\eta \in (0,1){% end %} - the smoothing constant: higher means faster reaction, less noise immunity

Updated once per observation. That's the same update-rule family as Knowledge's {% katex() %}\hat{\lambda}{% end %} later in this post, but running on a different clock: continuously, once per observation, rather than periodically, once per bridging window. It needs its own name and its own tuning treatment rather than being assumed identical to Knowledge's version. Without this smoothing, a single GC pause or a burst of short-lived allocations produces a spurious derivative on raw memory readings that has nothing to do with sedimentation. A redline that reacts to that noise demotes tasks for no reason. Smoothing trades reaction speed for noise immunity, the same lag-versus-noise tradeoff every derivative-gated controller faces: too little smoothing and the redline is trigger-happy on garbage collection; too much and {% katex() %}\dot{H}(t){% end %}'s whole purpose (buying lead time before {% katex() %}H(t){% end %} alone would have flagged the problem) is exactly what the added lag gives back. This is a real second parameter this design has to set, not a footnote, and it deserves the same explicit tradeoff treatment as {% katex() %}H_{\min}{% end %} itself rather than being assumed away. Worth flagging even this early: a parameter that needs tuning against a real deployment's own noise profile doesn't tune itself once and stay tuned, and what it costs to keep tuned is a question this series won't actually price until several posts from now.

> **Design Guardrail.** "Once per observation" means once per fresh telemetry sample, not once per control-loop tick. Conflating the two produces a failure {% katex() %}\eta{% end %} can't fix.

**Why the distinction matters.** The EWMA update rate is meaningful only if it's tied to how often {% katex() %}H_{\text{raw}}(t){% end %} genuinely changes (the underlying metrics pipeline's own export or scrape interval) not to however fast the control loop itself happens to tick. A control loop ticking faster than its telemetry source refreshes doesn't get more observations; it gets the same stale reading fed into the smoother repeatedly. {% katex() %}\dot{H}(t){% end %}, computed as a finite difference between consecutive ticks, reads exactly zero for every tick that sees no fresh sample and then jumps on the one tick that does: a sawtooth artifact of the sampling mismatch, not a signal about sedimentation. It can trip the same derivative-gated demotion this section built {% katex() %}\eta{% end %} to protect against noise from in the first place.

**Why tuning {% katex() %}\eta{% end %} doesn't fix it.** This is a different failure than the GC-pause glitch {% katex() %}\eta{% end %} was tuned to absorb: that one is real noise on a correctly-clocked signal; this one is an artifact of clocking the signal wrong. No choice of {% katex() %}\eta{% end %} fixes it, since smoothing a signal that's already gone stale-then-jump doesn't restore the information the mismatch destroyed.

**The actual fix is a build constraint, not a tuning one.** The control loop's own tick rate for {% katex() %}H(t){% end %} and {% katex() %}\dot{H}(t){% end %} has to be bound to the telemetry pipeline's own refresh rate: either by ticking no faster than the metrics source actually updates, or by having the control loop read the metrics source's own timestamp and skip the derivative update on ticks that see no new sample, not assumed to already match it. A team standing this up against an existing metrics exporter should check that exporter's own scrape interval before trusting any {% katex() %}\eta{% end %} this post's own simulation recommends. The simulation's own glitch model assumed a fresh sample every tick, which is a real assumption about the telemetry source, not a property this design gets for free.

*Computed, not left symbolic.* The same tradeoff, run for real instead of illustrated: 1,500 independent simulated realizations per {% katex() %}\eta{% end %} value, using the sedimentation-trend-plus-glitch model this section already describes, measuring the probability of a false trigger before the true crossing and the mean detection lag among realizations that do detect it.

| {% katex() %}\eta{% end %} | False-trigger probability | Mean detection lag |
| :--- | :--- | :--- |
| 0.05 – 0.25 | 0% throughout | 19.3s → 2.0s |
| 0.35 | 3% | falling |
| 0.45 | 26% | falling |
| 0.6 | 64% | falling toward zero |

*Simulated false-trigger rate and detection lag across a range of smoothing constants {% katex() %}\eta{% end %}: the whole {% katex() %}0.05\text{–}0.25{% end %} range is dominated by {% katex() %}\eta=0.25{% end %} alone.*

Every {% katex() %}\eta{% end %} in the {% katex() %}0.05{% end %}–{% katex() %}0.25{% end %} range is strictly dominated by {% katex() %}\eta=0.25{% end %}: identical risk, strictly worse lag, a free improvement with no offsetting cost. That is a different argument from the one Proposition 3, later in this post, makes for {% katex() %}H_{\min}{% end %} itself. Raising or lowering {% katex() %}H_{\min}{% end %} trades failure cost against usable capacity with no free lunch either way, so {% katex() %}H_{\min}=4{% end %} and {% katex() %}H_{\min}=6{% end %} aren't dominated; they're reachable points on the same frontier that cost more than {% katex() %}H_{\min}=5{% end %} at this pool's specific 32:1 ratio. {% katex() %}\eta\approx0.25{% end %} is the recommended operating point for this specimen: lag already at its floor, at zero measured risk.

This isn't a coincidental shape. It has a name already inside the vocabulary this post uses. An EWMA's smoothing constant *is* a settling time, {% katex() %}\tau \approx -1/\ln(1-\eta){% end %}, not a borrowed approximation but what {% katex() %}\eta{% end %} actually measures. At {% katex() %}\eta=0.05{% end %}, {% katex() %}\tau\approx19.5{% end %}s against a measured lag of 19.3s; at {% katex() %}\eta=0.1{% end %}, {% katex() %}\tau\approx9.5{% end %}s against 8.0s measured; at {% katex() %}\eta=0.25{% end %}, {% katex() %}\tau\approx3.5{% end %}s against 2.0s measured. The theoretical time constant stays within a couple of seconds of the empirically measured lag across the whole range, closest at low {% katex() %}\eta{% end %} and loosest at high {% katex() %}\eta{% end %}, where detection lag under a trend-plus-glitch model and settling time under a clean step start to measure subtly different things. That the two track at all, let alone this closely in absolute terms, isn't a coincidence: lag *is* a settling time under a different name. The glitches in this specimen last exactly one timestep. As long as {% katex() %}\tau{% end %} stays meaningfully longer than that, a single glitch's contribution to the smoothed signal is diluted below anything that could cross {% katex() %}H_{\min}{% end %} on its own, which is the entire dominated region, named precisely rather than merely observed. Only once {% katex() %}\eta{% end %} pushes {% katex() %}\tau{% end %} down near the glitch's own one-step duration does a single glitch move the smoothed signal enough to matter by itself, which is the knee.


Separately: "reach past the application and demote it" has to mean demoting a task the control plane already owns, not reaching out to modify an arbitrary process it doesn't. The latter requires standing privilege broad enough to deprioritize anything on the machine: a bigger blast radius than the mechanism it's meant to contain. The former requires nothing beyond what admission already established: ownership scoped once, at the moment a task is admitted, not re-granted on every demotion decision. This is a design constraint, not an implementation footnote. Get it backwards, and the fix for one immortal task becomes a standing capability to touch every task on the node.

> **Physical translation.** This is the same philosophy CoDel {{ cite(ref="2", title="Nichols, K. & Jacobson, V. (2018) — Controlled Delay Active Queue Management, RFC 8289") }} applies to queueing: don't gate on a static threshold chosen once and defended forever, gate on a genuine physical measurement of the thing you're actually trying to protect, taken continuously. CoDel watches queue sojourn time instead of queue depth, because depth alone can't distinguish a queue that's draining from one that's about to overflow: the same reasoning that puts {% katex() %}\dot{H}(t){% end %}, not just {% katex() %}H(t){% end %}, into Definition 2. A redline that only checks the current value is one bad derivative away from being too late.

## The Provisioning Window

Everything so far treats the node as alone. A distributed system isn't: there's an autoscaler, and it can add capacity. Whether that capacity arrives in time to matter depends on a single number: {% katex() %}T_{\text{scale}}{% end %}, the time from scaling decision to a new instance being live. The provisioning window this section is named for, and the same interval this post calls a "bridging window" everywhere it names the gap a detected task has to survive before that capacity lands. That number is not small. Detection, cooldown, and provisioning together routinely put it at a minute or more for threshold-based autoscalers, which is the order of magnitude this post uses {% katex() %}T_{\text{scale}}=90{% end %}s to represent. A closely related problem, reconciling strict latency SLOs with cost under sub-second load fluctuations, takes this reaction delay as its starting premise and works around it entirely rather than trying to shrink it. Instead of waiting on VM-level autoscaling, it steers individual requests to a FaaS layer per-request, based on whether that specific request can still meet its SLO on the VM {{ cite(ref="3", title="Dehigama, D., Jesalpura, S., Xu, Z., Nemeth, M., Zhu, S., Kogias, M. & Grot, B. (2026) — Spandana: Reconciling Strict SLOs with Low Cost under Fine-Grained Load Fluctuations") }}. That's a different lever than this post reaches for. Blood Oath's locality lock rules out routing an individual reasoning trace anywhere else, so there's no FaaS layer to steer it to. But the underlying distinction is the same one that matters here: not every burst is worth scaling for, and knowing which one is requires a signal faster than aggregate load.

<span id="prop-2"></span>

<details>
<summary>Proposition 2 -- The Provisioning Window: autoscaling is useless against light-task bursts and viable against heavy tasks only if both triggered correctly and, per Proposition 2b, the tail is light enough relative to the scaling latency</summary>

**Proposition 2** (Provisioning Window). Given {% katex() %}E[S_l] \ll T_{\text{scale}} < E[S_h]{% end %}:

1. Autoscaling triggered by aggregate load cannot help against a burst of light tasks. By the time a new instance is live, the burst that triggered scaling has already resolved. This is the same reaction-lag problem documented across autoscaling literature, and Definition 1's ingress blindness makes it worse here, not better: nothing distinguishes a burst worth scaling for from ordinary noise until it's already over.
2. Autoscaling triggered by *heavy-task detection* (the same elapsed-time crossover from Definition 1b, not an aggregate metric) is viable, because {% katex() %}T_{\text{scale}} < E[S_h]{% end %} means a new instance can plausibly come online before the detected heavy task finishes.

</details>

*Watch out for*: the locality lock (Definition 1, property 3) means a new instance never rescues the task that triggered scaling: the data doesn't move, so the in-flight heavy task stays exactly where it is, still occupying its slot, still being handled by the Physical Redline and demotion described above. What the new instance actually does is absorb *subsequent* ingress arriving while the original node is under heavy-task pressure, a capacity release for the rest of the system, not a rescue for the one task that caused it. Confusing these two is the most likely way to over-promise what horizontal scaling buys here.

> **Physical translation.** This is why the trigger matters as much as the mechanism. An autoscaler watching aggregate load is solving the wrong problem twice over: it reacts too slowly for the 99.95% (Definition 1b's small-{% katex() %}t{% end %} regime, where nothing distinguishing yet exists) and it has no signal at all for the rest until the damage (sedimentation) is already underway. Wiring the scale-out trigger directly to the same elapsed-time posterior that drives local demotion means the system starts provisioning the moment it has genuine evidence, not the moment aggregate load makes the emergency undeniable. This is exactly where Definition 1b's pre-classification confidence earns its keep even below the crossover time: {% katex() %}\pi_0{% end %}, however weak, can fire the scaling decision earlier than waiting for elapsed time alone would. That's worth the false-positive provisioning cost precisely because {% katex() %}T_{\text{scale}}{% end %} is not free, and every second of lead time it buys is a second less of the window in which "new capacity won't arrive in time" is still true.

*Correction to Proposition 2, claim 2*: comparing {% katex() %}T_{\text{scale}}{% end %} against {% katex() %}E[S_h]{% end %} (the unconditional mean of the whole heavy class) overstates how often scaling actually helps. What matters is the expected *remaining* duration at the moment of detection, {% katex() %}t^*{% end %}, not the average total duration across the entire heavy population. For a heavy-tailed distribution, those are very different numbers.

<span id="prop-2b"></span>

<details>
<summary>Proposition 2b -- The Scaling Bar Depends on Tail Weight, Not Just Tail Existence</summary>

**Proposition 2b** (Tail-Index-Dependent Scaling Viability). For a Pareto-tailed duration distribution with shape parameter {% katex() %}\alpha{% end %} and scale parameter {% katex() %}x_m = E[S_h]\cdot(\alpha-1)/\alpha{% end %} (the distribution's own minimum), mean residual life at elapsed time {% katex() %}t{% end %} is piecewise, not a single formula applied everywhere. The standard result {% katex() %}m(t) = t/(\alpha-1){% end %} holds only for {% katex() %}t \geq x_m{% end %}, where survival past {% katex() %}t{% end %} is genuinely uncertain. Below {% katex() %}x_m{% end %}, survival is certain by construction (every draw is at least {% katex() %}x_m{% end %}) and the correct residual life there is {% katex() %}m(t) = E[S_h] - t{% end %} instead. The function decreases on {% katex() %}[0, x_m){% end %} and increases on {% katex() %}[x_m, \infty){% end %}, with a single global minimum exactly at {% katex() %}t=x_m{% end %}, where {% katex() %}m(x_m) = E[S_h]/\alpha{% end %}. Scaling arrives before the detected task finishes, in expectation, at *every* elapsed detection time (unconditionally, not past some threshold) exactly when that global minimum clears the scaling latency:

{% katex(block=true) %}
E[S_h]/\alpha > T_{\text{scale}} \quad\Longleftrightarrow\quad \alpha < E[S_h]/T_{\text{scale}}
{% end %}

where:

* {% katex() %}m(t){% end %} - the mean residual life at elapsed time {% katex() %}t{% end %}
* {% katex() %}\alpha{% end %} - the Pareto tail index: lighter tail as {% katex() %}\alpha{% end %} grows
* {% katex() %}x_m = E[S_h](\alpha-1)/\alpha{% end %} - the distribution's own minimum
* {% katex() %}T_{\text{scale}}{% end %} - the time from scaling decision to new capacity live

When this fails ({% katex() %}\alpha \geq E[S_h]/T_{\text{scale}}{% end %}), a genuine window of detection times opens, spanning {% katex() %}x_m{% end %} without being centered on it, where {% katex() %}m(t) < T_{\text{scale}}{% end %} and autoscaling doesn't help (bounded by {% katex() %}t \in \left(E[S_h]-T_{\text{scale}},\ T_{\text{scale}}\cdot(\alpha-1)\right){% end %}) even though the workload is unambiguously heavy-tailed.

</details>

*Instantiated against this series' own specimen*: {% katex() %}\alpha = 2.2{% end %} and {% katex() %}T_{\text{scale}}=90{% end %}s throughout this series, so the viability condition is {% katex() %}2.2 < 300/90 \approx 3.33{% end %}: comfortably satisfied.

> **Finding.** For this specimen, autoscaling helps regardless of when detection fires.

The global minimum of expected remaining life, {% katex() %}E[S_h]/\alpha \approx 136.4{% end %}s, sits well above the 90-second scaling latency: early detection, right at {% katex() %}x_m \approx 163.6{% end %}s, or late, there is no detection-time bar to clear here. That's a genuinely different conclusion from what the {% katex() %}t/(\alpha-1){% end %} formula alone would suggest if plugged in below {% katex() %}x_m{% end %} without checking the domain first. It would predict expected remaining life *rising from zero* at small {% katex() %}t{% end %}, an artifact of using the formula outside where it's valid, not a property of this specimen.

**This comfort doesn't generalize.** It's a property of this series' own {% katex() %}\alpha=2.2{% end %} sitting well below the {% katex() %}E[S_h]/T_{\text{scale}} \approx 3.33{% end %} boundary, not a property of heavy tails in general. A lighter tail can fail this bar entirely. At {% katex() %}\alpha=4{% end %}, still within the 2-to-4 range typical of measured production workloads, the condition flips ({% katex() %}4 > 3.33{% end %}): a genuine 60-second-wide trap window opens between 210s and 270s of elapsed time, where a task confidently detected as heavy would still, in expectation, finish before new capacity could land. Which side of that boundary a real system sits on is a property of its own measured {% katex() %}\alpha{% end %}, not something to assume from this series' own comfortable numbers.

> **Finding.** The piecewise formula isn't a convenience. It's checkable directly, and it checks out.

No residual-life theory assumed anywhere in the check: simulating 3,000,000 draws from a Pareto{% katex() %}(x_m \approx 163.6, \alpha=2.2){% end %} distribution and directly measuring the empirical mean of {% katex() %}(X-t){% end %} among survivors {% katex() %}X>t{% end %}, across a range spanning both branches:

| {% katex() %}t{% end %} | Empirical | Predicted | Branch |
| :--- | :--- | :--- | :--- |
| 20 | 280.1 | 280.0 | {% katex() %}E[S_h]-t{% end %} |
| 108 | 192.1 | 192.0 | {% katex() %}E[S_h]-t{% end %} |
| {% katex() %}x_m{% end %} | 136.5 | 136.4 (the minimum) | boundary |
| 200 | 166.9 | 166.7 | {% katex() %}t/(\alpha-1){% end %} |

Matching within ordinary Monte Carlo sampling noise at every point checked, on both sides of {% katex() %}x_m{% end %}.

**What happens if you skip the domain check.** Plugging {% katex() %}t=108{% end %}s into the {% katex() %}t/(\alpha-1){% end %} formula alone, without checking {% katex() %}t{% end %} against {% katex() %}x_m{% end %} first, gives 90s: a real, checkable, roughly 2.1x understatement of the true 192s, and exactly the kind of error simulating the actual distribution catches immediately. If duration were memoryless (exponential) instead, the default intuition for "expected time remaining," expected remaining time would sit flat at {% katex() %}E[S_h]=300{% end %}s no matter how long the task had already run. This specimen's actual heavy tail does something neither flat nor monotonic: it *falls* while a task is behaving like an ordinary member of the heavy class, bottoms out at {% katex() %}x_m{% end %}, then *rises without bound* once elapsed time itself becomes evidence of genuine tail behavior. This is the same {% katex() %}\alpha=2.2{% end %} tail Post 1's Proposition 0 used for its own demand distribution ({% katex() %}Q^*_{\text{true}}=115.5{% end %} vs. {% katex() %}Q_{\text{wrong}}=63.3{% end %} under a mistaken exponential fit, a 45% shortfall). Different variable, different question, same shape mismatch between what memoryless intuition expects and what a real heavy tail actually does.

This is exactly the "majority of tasks are short" objection, and it cuts the *other* way here than a first pass through the naive formula suggests. Most probability mass in a heavy-tailed distribution really does sit close to the lower boundary {% katex() %}x_m{% end %}: Pareto's own density is highest right at its minimum and falls off from there, so a "typical" heavy task looks a lot more like {% katex() %}x_m \approx 163.6{% end %}s than the tail-inflated {% katex() %}E[S_h]=300{% end %}s mean. That's exactly why {% katex() %}x_m{% end %} is also where {% katex() %}m(t){% end %} bottoms out: the point where the bulk of the population sits is the same point where "how much longer will this run" is least reassuring. And for this series' own numbers, even *that* least-reassuring point ({% katex() %}\approx136.4{% end %}s) still clears {% katex() %}T_{\text{scale}}=90{% end %}s comfortably. Proposition 2's second claim should still be read conditionally, just not in the direction the naive formula implied. Whether detection-triggered autoscaling helps at all is a property of your system's *measured* {% katex() %}\alpha{% end %} relative to its own {% katex() %}E[S_h]/T_{\text{scale}}{% end %} ratio, not a consequence of a heavy tail existing in the abstract, and not something this series' own comfortable {% katex() %}\alpha=2.2{% end %} guarantees for a different system. Measure it before trusting this lever.

> **Physical translation.** This doesn't undermine the rest of the argument. It sharpens what each lever is actually for, and it's less pessimistic than a naive read of the formula first suggests. The Physical Redline and demotion (Definition 2) don't care about {% katex() %}\alpha{% end %} at all; they act immediately and locally, regardless of how heavy "heavy" turns out to be. Autoscaling is a second lever, conditional on the same tail weight that made the workload dangerous enough to need Definition 2 in the first place. For this series' own {% katex() %}\alpha=2.2{% end %}, that condition is comfortably met at every detection time, not just for the most extreme outliers. That comfort doesn't generalize for free: a system with a lighter measured tail can land inside the trap window derived above, where autoscaling looks like it should help (the workload is genuinely heavy-tailed) but doesn't, because detection happens to fire close to the distribution's own {% katex() %}x_m{% end %}. The honest claim is narrower than either "autoscaling helps against heavy tasks, always" or "autoscaling helps against heavy tasks, only past some detection bar": it's "whether autoscaling helps depends on where your own {% katex() %}\alpha{% end %} sits relative to {% katex() %}E[S_h]/T_{\text{scale}}{% end %}, checkable in advance, not assumed from another system's numbers."


## The Buffer Is a Newsvendor Problem, Not a Heuristic

Proposition 2b's bridging window: {% katex() %}[t^*, t^* + T_{\text{scale}}]{% end %}, the interval after detection but before new capacity lands, is not survived for free. Definition 2's demotion deprioritizes a detected-heavy task's scheduling weight; it does not evict it. The task keeps its memory. So memory pressure keeps building during exactly the window in which autoscaling cannot yet relieve it, and {% katex() %}H_{\min}{% end %} (Definition 2a's reserved margin, the same variable, not a new one) has to be large enough to absorb that accumulation.

This is not a new problem. It is Proposition 0, again, with a different random variable.

<span id="prop-3"></span>

<details>
<summary>Proposition 3 -- Buffer Sizing Is the Critical Fractile, Applied to Bridging-Window Memory Consumption</summary>

**Proposition 3** (Buffer as Critical Fractile). Given Definition 2a's achievable region, {% katex() %}H_{\min}{% end %} carries exactly Proposition 0's cost structure: an underage cost {% katex() %}C_u{% end %} if it's exhausted before {% katex() %}T_{\text{scale}}{% end %} elapses (the terminal failure Definition 1 already names, the node dying with its immortal tasks) and an overage cost {% katex() %}C_o{% end %} for slots reserved and unusable for productive admission. The optimal margin is the same formula that opened this series, applied to a different variable:

{% katex(block=true) %}
H_{\min}^* = G^{-1}\!\left(\frac{C_u}{C_u + C_o}\right)
{% end %}

where:

* {% katex() %}H_{\min}^*{% end %} - the optimal reserved margin
* {% katex() %}G = \text{Poisson}(2.22){% end %} - the additional heavy arrivals per bridging window
* {% katex() %}C_u{% end %}, {% katex() %}C_o{% end %} - the pool's own 32:1 underage-to-overage cost ratio

</details>

*Computed, not left symbolic.* Definition 2a already built {% katex() %}G = \text{Poisson}(2.22){% end %} for this specimen and found {% katex() %}H_{\min}^* = 5{% end %} at the pool's own 32:1 cost ratio: node failure against one idle slot, not a borrowed number. Verifying it's actually optimal, not merely plausible: the weighted cost {% katex() %}C_u \cdot E[(M-H_{\min})^+] + C_o \cdot E[(H_{\min}-M)^+]{% end %} comes out to **3.98** at {% katex() %}H_{\min}=5{% end %}, against **5.45** at {% katex() %}H_{\min}=4{% end %} and **4.13** at {% katex() %}H_{\min}=6{% end %}, both neighbors on the same frontier, both strictly worse at this ratio. Five slots out of thirty-two isn't a round number chosen for narrative convenience. It's where this specimen's own arithmetic puts the minimum, which is the actual answer to the question the engineer from the opening didn't have time to ask at minute ten: not "how much margin feels safe," but a number, checkable, that says exactly how much margin this specimen's own numbers require.

**The 32:1 ratio's own derivation and this formula's own cost structure describe two different shapes of loss, worth naming rather than blurring together.** Definition 2a justified 32:1 from an all-or-nothing event: buffer exhaustion means the node dies with every one of its 32 slots' worth of work, a fixed, catastrophic cost that doesn't scale with *how far* {% katex() %}M{% end %} overshoots {% katex() %}H_{\min}{% end %} by. The critical-fractile formula above prices underage differently: {% katex() %}C_u \cdot E[(M-H_{\min})^+]{% end %} is linear in the shortfall's own size, the standard newsvendor shape, where twice the overshoot costs twice as much. A model matching the verbal justification exactly would price underage as a threshold cost, {% katex() %}K \cdot P(M>H_{\min}) + C_o \cdot H_{\min}{% end %} for some fixed catastrophic figure {% katex() %}K{% end %}, not a fractile problem with the same closed form at all. Its optimum is a different computation, set where the marginal cost of one more reserved slot equals {% katex() %}K{% end %}'s own density-weighted tail contribution, not where a CDF crosses a fixed ratio. The linear model used here is a defensible standard simplification, not an arbitrary error, treating the *rate* of underage events as a proxy for their fixed cost when a real deployment can't easily separate "how often does the buffer run out" from "how much does running out cost" without also pricing what a threshold model needs. But it is a simplification, and {% katex() %}H_{\min}=5{% end %} is this simplification's own optimum, not independently verified against the threshold-cost version the underage story actually describes. Posts 3 and 5 carry 32:1 forward unchanged into their own fleet- and resource-scale versions of this formula; neither re-derives it against the threshold-cost alternative either.

{% katex() %}\text{Poisson}(2.22){% end %} is the standard baseline for a count of arrivals over a fixed window, and it's a defensible starting model here. But it assumes those arrivals are memoryless and mutually independent. Post 1's Model Scope section already flagged the case where that fails: the same upstream trigger driving many correlated reasoning traces at once, rather than independent arrivals at an elevated rate. Correlated arrivals make {% katex() %}G{% end %} over-dispersed relative to Poisson, and the effect on {% katex() %}H_{\min}^*{% end %} is computable, not just qualitative. Holding the mean fixed at 2.22 and doubling the variance (a Negative Binomial with the same mean, twice the spread) moves the cost-minimizing margin from **{% katex() %}H_{\min}=5{% end %}** (cost 3.98 under Poisson) to **{% katex() %}H_{\min}=7{% end %}** (cost 6.66 under the over-dispersed model, verified against its neighbors: 7.14 at {% katex() %}H_{\min}=6{% end %}, 6.82 at {% katex() %}H_{\min}=8{% end %}). A 2x variance increase costs two extra reserved slots at this ratio. A real, bounded, computable sensitivity, not an open-ended warning.

> **Physical translation.** Whether {% katex() %}H_{\min}^*{% end %} is a number worth computing once, or a moving target, depends on whether real bridging-window arrivals actually look independent. If they do, size the margin once and move on. This is the one place in the whole design where the classical, cheap-to-operate answer is the right one, and there's no shame in taking it where it actually holds. If they don't, the answer is the same one this entire series has been building toward: don't compute {% katex() %}H_{\min}^*{% end %} once and defend it: let the Knowledge phase, next, log every bridging window's actual arrival count and adapt the estimate of {% katex() %}G{% end %} from observed outcomes, the same closed loop already gating admission and driving demotion. The buffer-sizing problem doesn't escape this series' central argument by being smaller in scope. It's the same argument, recursively, one level down.

## The Same Team, Six Months Later

Every mechanism in this post has been reaching for MAPE-K's five phases {{ cite(ref="4", title="Kephart, J.O. & Chess, D.M. (2003) — The Vision of Autonomic Computing") }} (Monitor, Analyze, Plan, Execute, Knowledge) without stopping to check that each one is doing real work. Monitor watches elapsed time and heap headroom. Analyze evaluates them against {% katex() %}t^*{% end %}, {% katex() %}\rho_h \geq C{% end %}, {% katex() %}H_{\min}^*{% end %}. Plan picks demote, scale, or adjust-buffer. Execute reaches into the scheduler and the autoscaler, never the application. Four phases, closed into a loop: the on-call engineer from the opening now has a system that reacts to the pool's own physical state instead of a human noticing it's slow. That's a real improvement. It's also not the thing this post has been building toward.

Picture that same team, six months later, watching a second surge that looks just like the first one on every dashboard. Does the redline fire at the same headroom it fired at last time, or earlier, because the last incident's actual arrival count fed back into the estimate of {% katex() %}\hat{\lambda}{% end %}? Does the buffer hold at 5 slots because that number was carved in at design time, or because it's been recalculated against everything the system has actually seen since? The four phases above (Monitor, Analyze, Plan, Execute) answer that question the same way regardless: they don't touch it. Only a fifth phase does.

<span id="def-3"></span>

<details>
<summary>Definition 3 -- Autonomic Self-Awareness: what each MAPE-K phase has to actually do, mapped onto what this post has built</summary>

**Definition 3** (Autonomic Self-Awareness). A control loop is genuinely autonomic, not merely reactive, only if every phase does load-bearing work:

- **Monitor** observes ground-truth physical or statistical signals (elapsed time (Definition 1b), heap headroom and its derivative (Definition 2)) never a synthetic proxy that can be wrong about what it's protecting against.
- **Analyze** evaluates those signals against a genuine self-model {{ cite(ref="5", title="Hellerstein, J.L., Diao, Y., Parekh, S. & Tilbury, D.M. (2004) — Feedback Control of Computing Systems") }}, not a raw threshold: the crossover {% katex() %}t^*{% end %}, the Sedimentation Threshold {% katex() %}\rho_h \geq C{% end %}, the buffer critical fractile {% katex() %}H_{\min}^*{% end %}. The system carries a formal model of its own danger conditions, not an alarm bell.
- **Plan** selects among structural interventions (demotion, scale-out, buffer adjustment) using that model's output.
- **Execute** acts outside the layer Proposition A already proved has no solution: reaching to the scheduler or the autoscaler, never attempting the application-level fix Definition 1 ruled out from the start.
- **Knowledge** persists and updates the parameters every other phase depends on: {% katex() %}t^*{% end %}, {% katex() %}H_{\min}{% end %}, {% katex() %}T_{\text{scale}}{% end %}, the measured {% katex() %}\alpha{% end %}, the measured {% katex() %}G{% end %}, rather than treating them as constants fixed once at design time.

</details>

A loop that faithfully implements all five phases but never lets Knowledge feed back into Analyze's own thresholds is still just an elaborate reactive system, not an autonomic one. The broader version of this critique is a live argument in the self-adaptive-systems literature, not something this post is alone in raising: recent work argues MAPE-K's centralized, sequential structure itself struggles with continuous learning and proposes replacing it outright with a distributed, multi-agent alternative rather than patching the closure back in {{ cite(ref="6", title="Sanwouo, B., Quinton, C. & Temple, P. (2025) — Breaking the Loop: AWARE is the New MAPE-K") }}. This post takes the narrower position: MAPE-K's structure is fine, provided Knowledge actually closes the loop, which is exactly the failure mode Definition 3's five bullet points are a checklist for, not a restatement of the standard diagram.

*What kind of controller this actually is.* Definition 2's {% katex() %}H(t){% end %} and {% katex() %}\dot{H}(t){% end %} is proportional-derivative structure, in the vocabulary the control-theory literature already cited here uses directly {{ cite(ref="5", title="Hellerstein, J.L., Diao, Y., Parekh, S. & Tilbury, D.M. (2004) — Feedback Control of Computing Systems") }}. Worth naming rather than leaving implicit, and worth being precise about what it isn't: a full PID controller adds an integral term specifically to eliminate steady-state error, the chronic small offset a P or PD controller can carry forever without ever crossing its own threshold. Demotion doesn't get that term, and not by oversight. It's a discrete decision (demote or don't), not a continuously-adjusted output a valve position or a queue weight would need integral correction for. The risk the integral term would normally catch (slow, silent drift in what "normal" headroom looks like) doesn't go uncaught here; it's exactly what Knowledge exists to catch instead, on a slower timescale than {% katex() %}\dot{H}(t){% end %}'s. Concretely: Knowledge maintains an exponentially-weighted moving average of the *observed arrival count* per bridging window, not a peak, a count, because a peak isn't a parameter of anything. {% katex(block=true) %}
\hat{\lambda}_{n+1} = (1-\beta)\hat{\lambda}_n + \beta \cdot c_n
{% end %}

where:

* {% katex() %}c_n{% end %} - the {% katex() %}n{% end %}-th observed heavy-arrival count, one per bridging window
* {% katex() %}\beta{% end %} - Knowledge's own learning rate: distinct from Definition 2's {% katex() %}\eta{% end %}, same mechanism, different signal, different clock

Applied to a different signal on a different timescale. Knowledge then re-derives {% katex() %}G = \text{Poisson}(\hat{\lambda}){% end %} and {% katex() %}H_{\min}^*{% end %} against it periodically rather than continuously. A maximum observed value has no principled relationship to a Poisson distribution's shape; an EWMA of observed counts does, because it's tracking the actual quantity {% katex() %}G{% end %}'s mean is defined by.

> **Design Guardrail.** This update rule has two distinct failure modes, and both bias the estimate the same direction: downward, right when the buffer needs to be largest.

**Failure mode 1: no defense against a non-representative quiet period.** A network partition that isolates the node doesn't reduce true heavy-task demand. It hides it from the meter, and a count-based EWMA can't distinguish "demand actually dropped" from "the sensor stopped seeing it." Feeding partition-suppressed counts into {% katex() %}\hat{\lambda}{% end %} biases it downward at exactly the worst moment: right before the partition heals and the backlog behind it arrives as a flood, precisely when {% katex() %}H_{\min}{% end %} needs to be largest and the estimate has just been pushed smallest. The minimal defense is gating, not better statistics: Knowledge should not update {% katex() %}\hat{\lambda}{% end %} from any window where the node's own liveness signal was degraded, since a node that can't confirm it was reachable can't trust what it measured during that window either.

**Failure mode 2: {% katex() %}\beta{% end %}'s own settling time.** {% katex() %}\beta{% end %}, like {% katex() %}\eta{% end %}, has its own settling time, {% katex() %}\tau_\beta \approx -1/\ln(1-\beta){% end %}, measured in bridging windows rather than seconds, since Knowledge updates once per window, not continuously. A genuinely correlated surge: many reasoning traces triggered by the same upstream event, closer to a step change in the true arrival rate than a gradual drift, outpaces a low-{% katex() %}\beta{% end %} estimate for roughly {% katex() %}\tau_\beta{% end %} windows. That systematically under-sizes {% katex() %}H_{\min}^*{% end %} on the rising edge of exactly the event the buffer exists to absorb. The 2x-variance sensitivity computed earlier assumes {% katex() %}\hat{\lambda}{% end %} has already converged to the new regime; it says nothing about the windows spent catching up to get there.

Whether this specific update rule *converges* more broadly: settles toward the true {% katex() %}G{% end %} rather than drifting or oscillating under a non-stationary arrival process, is a genuine open question this post doesn't answer. Naming it as open, including both failure modes above, is the honest version of the claim; asserting "the system learns" without an update rule to interrogate would not have been.

Worth being precise about which of Knowledge's two jobs this failure mode actually threatens, since conflating them overstates the damage. Knowledge doesn't provide real-time backpressure during an active surge: Definition 2's {% katex() %}H(t){% end %} and {% katex() %}\dot{H}(t){% end %} already do that, continuously, on every observation, independent of anything Knowledge is doing on its own slower clock. What Knowledge governs is a different, narrower question: how large a standing buffer should be, sized against a statistical estimate of *future* bridging windows, not a live read of the one happening right now. That distinction doesn't dissolve the failure mode above, though. It sharpens exactly where it bites. A correlated surge capable of breaching {% katex() %}H_{\min}{% end %} can do so within single-digit seconds of its own onset, the same order of magnitude as Definition 1b's own crossover times computed earlier in this series, while {% katex() %}\hat{\lambda}{% end %} only updates once every {% katex() %}T_{\text{scale}}=90{% end %}s. A buffer sized against an estimate that hasn't yet incorporated the surge it's supposed to absorb is exactly as under-sized as if Knowledge hadn't updated at all for the incident's entire duration. That's a real, load-bearing gap in what "the system learns" can mean here, distinct from Definition 2's own fast-acting redline, which was never in question.

{% mermaid() %}
sequenceDiagram
    participant Surge as Correlated surge (real demand)
    participant Redline as Definition 2 (H(t), fast clock)
    participant Knowledge as Knowledge phase (lambda-hat, T_scale clock)
    Note over Surge: onset: many heavy tasks,<br/>same upstream trigger
    Surge->>Redline: headroom starts falling
    Surge->>Knowledge: same surge, same instant
    par Fast clock: reacts within the surge
        Redline-->>Redline: demotes within single-digit seconds<br/>(same order as Definition 1b's t*)
    and Slow clock: stays blind for the whole surge
        Knowledge-->>Knowledge: still running on last window's<br/>lambda-hat: unaware anything changed
    end
    Note over Knowledge: H_min still sized against the *old* estimate<br/>until the T_scale mark, after the surge is over
{% end %}

**What this means for the buffer:** Definition 2's redline reacts in time. The *buffer size itself* ({% katex() %}H_{\min}{% end %}, Knowledge's own responsibility) does not update until the surge is already over, because its clock is bridging windows, not seconds.

The gap isn't the MAPE-K structure, though. It's worth naming what actually is broken, rather than treating the mismatch as a fixed cost of the architecture. {% katex() %}\beta{% end %}'s own sampling clock was tied to {% katex() %}T_{\text{scale}}{% end %}, once per bridging window, because that's the natural unit for counting how many heavy arrivals a single buffer-sizing cycle saw. But nothing about the estimator itself requires that grain, and coupling it to {% katex() %}T_{\text{scale}}{% end %} specifically was the actual error, not an inherent limit. {% katex() %}T_{\text{scale}}{% end %} is a hardware constraint (cold-boot latency for new infrastructure) and no change to Knowledge's own sampling rate makes a VM boot faster. But {% katex() %}\hat{\lambda}{% end %} doesn't need to wait on hardware to update: sampling {% katex() %}c_n{% end %} on a sliding sub-window, every few seconds rather than every {% katex() %}T_{\text{scale}}{% end %}, lets Knowledge notice a correlated surge forming on roughly the timescale Definition 1b's own crossover already operates on, and tighten {% katex() %}H_{\min}{% end %} or admission behavior well before the standing buffer's own recalculation would otherwise have caught up. That's a real fix, and a cheap one. Decoupling the observation clock from the actuator clock costs nothing structurally, since Knowledge was always a software estimate, not a physical process with its own inherent cadence. What it doesn't buy is a faster {% katex() %}T_{\text{scale}}{% end %} itself: new capacity still takes as long as it takes to boot, and a team expecting faster sampling to shrink the physical provisioning window, not just the time to notice it's needed, is asking the fix to solve a different problem than the one it actually solves.

> **Physical translation.** The first four phases make a system *autonomic*: self-regulating, reacting to real conditions instead of a schedule or a guess. They do not, by themselves, make it *antifragile*. That distinction lives entirely in what Knowledge does with a stress event after it's over.

**Fragile**: parameters fixed at design time, silently drift from the reality they were computed against, and a near-miss carries no information: the same failure mode recurs, at degrading margin, exactly as Proposition 0 warned for a naively-computed {% katex() %}Q{% end %}.

**Robust, not yet antifragile**: parameters correctly sized once, the system survives as designed: but a comfortable margin and a near-catastrophic close call look identical to the system afterward. It comes through the stress unchanged, which is not the same as coming through it improved.

**Antifragile**: every bridging window the system experiences (survived comfortably or barely) becomes a Knowledge-phase update to the system's own estimate of its own parameters. The next similar event is handled with a sharper {% katex() %}t^*{% end %}, a better-calibrated {% katex() %}H_{\min}{% end %}, a more accurate {% katex() %}T_{\text{scale}}{% end %}, *because* the system was stressed, not despite it. This is the narrow, specific sense in which this post uses the word, scoped deliberately: closer to a measurable engineering property {{ cite(ref="7", title="Botros, J.S., Al-Qora'n, L.F. & Al-Said Ahmad, A. (2024) — Towards antifragility of cloud systems: An adaptive chaos driven framework") }} than to Taleb's broader thesis {{ cite(ref="8", title="Taleb, N.N. (2012) — Antifragile: Things That Gain from Disorder") }}: the metaphor's origin, not a peer-reviewed result, and not leaned on for anything this post needs to be formally true.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef center fill:none,stroke:#333,stroke-width:2px;
    classDef fragile fill:none,stroke:#dc2626,stroke-width:2px,stroke-dasharray:4 4;
    classDef robust fill:none,stroke:#ca8a04,stroke-width:2px;
    classDef antifragile fill:none,stroke:#22c55e,stroke-width:2px;

    CENTER["A bridging window happens<br/>survived comfortably, or barely"]:::center

    CENTER --> F["Fragile"]:::fragile
    F --> F1["Parameters fixed at design time,<br/>drift from the reality<br/>they were computed against"]:::fragile
    F1 --> F2["Same failure mode recurs, at degrading margin:<br/>the fragility Post 1's Proposition 0 already priced:<br/>Q_wrong = 63.3 vs Q*_true = 115.5, a 45% shortfall"]:::fragile

    CENTER --> R["Robust,<br/>not yet antifragile"]:::robust
    R --> R1["Sized once, correctly,<br/>against the true model,<br/>then left alone"]:::robust
    R1 --> R2["Survives as designed: but a comfortable margin<br/>and a near-catastrophic close call<br/>look identical to the system afterward"]:::robust

    CENTER --> A["Antifragile"]:::antifragile
    A --> A1["Sized correctly, then<br/>re-derived after every event"]:::antifragile
    A1 --> A2["t*, H_min, T_scale re-derived from<br/>what the system just lived through"]:::antifragile
    A2 --> A3["Fixes the gap Post 1's Model Scope named:<br/>a stationarity assumption with<br/>nothing to keep re-checking it"]:::antifragile
{% end %}
*Three responses to the same bridging window, distinguished by whether the event changes what the system believes about its own parameters afterward.*

The dividing line isn't survival versus failure. It's whether the event changes what the system believes about itself afterward. Every proposition in this post that ends with "measure it, don't assume it" (Proposition 2b's {% katex() %}\alpha{% end %}, Proposition 3's {% katex() %}G{% end %}) is naming exactly the thing Knowledge exists to keep measuring. This is also precisely what Post 1's Model Scope section left open, stated there as an unresolved assumption rather than a solved one: that Proposition 0 assumes a stationary true distribution and has no machinery to notice if the world stops holding still. Post 1 couldn't name the fix, Knowledge didn't exist yet. Definition 3 is that fix, made formal: the assumption Post 1 admitted it couldn't check is exactly the thing Knowledge exists to keep re-checking.

## Model Scope and Failure Envelope

Post 1 named its own assumptions rather than leaving them implicit. This post owes the same accounting, not a shorter version of it. Eight boundaries, in the order the mechanisms above introduce them.

| Assumption | What could break it | How exposed |
| :--- | :--- | :--- |
| Arrivals are non-adversarial | A tenant with incentive to evade demotion | Structural: no defense exists |
| Arrivals are independent (Poisson) | A correlated upstream trigger | Priced: 2x variance moves {% katex() %}H_{\min}^*{% end %} from 5 to 7 |
| Measured {% katex() %}\alpha{% end %} is trustworthy | Too little heavy-task history | Priced: roughly 25 extreme observations, not 25 tasks |
| The heavy class is one Pareto population | A mixture of distinct workload types | Silent: a Hill estimator won't warn you |
| {% katex() %}\dot{H}(t){% end %} has no phase lag of its own | Differentiating an already-smoothed signal | Unpriced: a standard route to oscillation |
| Telemetry refreshes fast enough to matter | A standard 10-15s scrape interval | Unchecked: an order of magnitude too slow |
| Glitches last one simulated timestep | A real GC pause or GIL stall lasting several seconds | Unstated in real units: unverifiable as written |
| Knowledge's EWMA converges | A genuinely non-stationary arrival process | Unproven, not just unmeasured |

*Eight assumption boundaries this post depends on: what's priced with a real number, what's structural and admits no fix, and what stays silent until a real deployment finds it.*

**Every mechanism in this post assumes non-adversarial arrivals.** Definition 1b's elapsed-time posterior and Definition 2a's Poisson arrival model both reason statistically, about a population that isn't trying to evade them. Proposition A's adversary (the only adversarial reasoning this series has done) was scoped to the non-preemptive scheduling result specifically, not carried forward into this post's detection mechanisms. If the pool serves multiple tenants and any of them has an incentive to avoid demotion (shaping requests to stay under whatever signature the classifier keys on) Definition 2 has no defense, because it was never asked to have one. This is a real gap by the standard multi-tenant resource-allocation mechanisms are actually held to: Dominant Resource Fairness {{ cite(ref="9", title="Ghodsi, A., Zaharia, M., Hindman, B., Konwinski, A., Shenker, S. & Stoica, I. (2011) — Dominant Resource Fairness: Fair Allocation of Multiple Resource Types") }} is proven strategy-proof (no tenant can gain by misreporting its demand) precisely because it has to be, in an environment where tenants act on incentives. This post's mechanisms make no such proof and were never asked to. A real assumption boundary, not a hypothetical: built for Post 1's "statistically ordinary" regime, explicitly not a strategic one, and a system exposed to the latter needs a different treatment this series hasn't built yet.

**The Poisson arrival model assumes independence, and the cost of that assumption failing is now computed, not just named.** A 2x variance increase (the kind correlated arrivals would plausibly produce) moves {% katex() %}H_{\min}^*{% end %} from 5 to 7. A system that has reason to expect more severe correlation than that should re-run the same computation against its own measured dispersion, not reuse this post's number.

**"Measure your {% katex() %}\alpha{% end %}" is real advice with a real cost, not a one-line footnote.** The Hill estimator's own standard error:

{% katex(block=true) %}
\text{SE}(\hat\alpha) \approx \frac{\alpha}{\sqrt{k}}
{% end %}

where:

* {% katex() %}\hat\alpha{% end %} - the estimated tail index
* {% katex() %}k{% end %} - the number of *extreme* order statistics the estimator is fit against, not the sample size

Getting within roughly 20% of the true value needs {% katex() %}k{% end %} on the order of 25, the *most extreme* heavy-task durations observed, not 25 heavy tasks total. At this pool's baseline heavy-task rate, that floor is under half an hour of raw volume in principle. But the Hill estimator needs the upper tail specifically, so the real elapsed time is longer, and longer still if the tail itself isn't stationary over that window, the same non-stationarity Post 1 already flagged as a distinct, unresolved failure mode. A team that hasn't accumulated real heavy-task history yet should not trust a fresh {% katex() %}\alpha{% end %} estimate the same way it trusts one built from weeks of data.

**What that standard error actually costs this series, checked against its own measured number rather than left as an abstract caveat.** At {% katex() %}k=25{% end %}, {% katex() %}\text{SE}(\hat\alpha) \approx 2.2/\sqrt{25} = 0.44{% end %}. This series' own measured {% katex() %}\hat\alpha=2.2{% end %} sits only {% katex() %}0.2{% end %} away from {% katex() %}\alpha=2{% end %}. That boundary isn't arbitrary: for any Pareto-distributed quantity, the distribution's own second moment diverges at exactly {% katex() %}\alpha=2{% end %}, a standard mathematical fact about the Pareto family itself, independent of anything this series derives on its own. A distance of {% katex() %}0.2{% end %} against a standard error of {% katex() %}0.44{% end %} is under half a standard error: a conventional one-SE interval around this series' own point estimate, roughly {% katex() %}[1.76, 2.64]{% end %}, comfortably contains {% katex() %}\alpha=2{% end %} and values below it. At {% katex() %}k=25{% end %}, this series cannot actually rule out a true {% katex() %}\alpha{% end %} at or under a boundary where a moment this series may come to depend on stops existing at all: not a smooth transition, a qualitative break. That's not a reason to distrust {% katex() %}\hat\alpha=2.2{% end %} as a point estimate; it's a reason to distrust treating it as safely clear of a boundary the estimate's own precision doesn't actually resolve. A team running this series' own machinery close to {% katex() %}\alpha=2{% end %} should either measure with a larger {% katex() %}k{% end %} before trusting which side of the boundary it's actually on, or treat any measurement this close to {% katex() %}\alpha=2{% end %} as effectively unresolved rather than trust the point estimate's own face value.

**The instinct to fix this by re-evaluating more often doesn't work, and it's worth being precise about why not before anyone reaches for it.** {% katex() %}\text{SE}(\hat\alpha){% end %} depends on {% katex() %}k{% end %}, the count of extreme observations in a single fit, not on how many times that fit gets re-run. Refitting hourly instead of weekly at the same {% katex() %}k=25{% end %} produces a new estimate with the identical {% katex() %}0.44{% end %} standard error every time, not a tighter one. It also introduces a real cost of its own: an estimator this imprecise, refit often, will wander back and forth across the {% katex() %}\alpha=2{% end %} boundary from one fit to the next on nothing but sampling noise, flipping whatever downstream response depends on which side of that boundary {% katex() %}\alpha{% end %} sits on, on and off, in step with an estimate that never actually changed which side of the boundary the true {% katex() %}\alpha{% end %} sits on. That's the same shape of failure as this post's own {% katex() %}\eta{% end %}-tuned redline flapping on garbage-collection noise: a control input refit or resampled faster than its own real precision justifies doesn't get more accurate, it gets more volatile. The only lever that actually narrows the interval is a larger {% katex() %}k{% end %}, which costs real wall-clock time to accumulate, not a shorter refit cycle.

**Is this the same shape of staleness risk {% katex() %}\dot{H}(t){% end %} exists to catch, just for a different quantity? No, and treating it as the same failure wearing a different name would blur a distinction worth keeping sharp.** {% katex() %}\alpha{% end %}'s own staleness and physical headroom's own staleness operate on genuinely different clocks, not just different mechanisms. {% katex() %}H(t){% end %} is a fast-moving physical quantity, which is exactly why Definition 2 reads it continuously and smooths it on a sub-second timescale rather than trusting a snapshot. {% katex() %}\alpha{% end %} is a shape parameter of the duration distribution itself, and nothing in this series' own specimen moves that on {% katex() %}H(t){% end %}'s own clock: a workload mix drifts over days or weeks, not within a single bridging window. A stale {% katex() %}\alpha{% end %} degrades whatever's built on top of it (Proposition 2b's own viability condition, {% katex() %}H_{\min}^*{% end %}'s own sizing) continuously and slowly as the true distribution moves, not as a sudden failure the way an unsmoothed, fast-moving physical signal can produce under a real spike. Conflating the two would overclaim an equivalence neither actually earns: two things that are staleness in the same abstract sense, sharing nothing about the timescale that determines how dangerous the staleness actually is. There is one honest exception this post hasn't checked: whether the same kind of correlated upstream trigger that can shift arrival *rate* suddenly (a new agentic workflow rollout, already named as a risk to {% katex() %}\hat\lambda{% end %} elsewhere in this post) could also shift the duration distribution's own *shape* just as suddenly, rather than gradually, collapsing the timescale gap the disanalogy above depends on. Whether that's a real risk in practice or a hypothetical this series has no data to weigh is left open here, not resolved.

**Measuring {% katex() %}\alpha{% end %} isn't the same check as measuring whether the heavy class is a single population at all. Proposition 2b needs the second check too.** The piecewise mean-residual-life formula, and the clean global-minimum-at-{% katex() %}x_m{% end %} story built on it, both assume the heavy class is well-described by one Pareto shape. Post 1's own Model Scope names the real risk this assumes away: a fleet's "heavy" traffic is often a mixture of genuinely distinct workload types (different tenants, batch jobs, agentic loops), each with its own comparatively narrow characteristic duration, not a single smooth tail. Post 1 works a concrete three-component mixture where mean residual life reverses direction four times rather than settling into the clean fall-then-rise this post's own formula assumes. A Hill estimator fit to that kind of population would return *some* {% katex() %}\alpha{% end %}, since the fitting procedure doesn't know to reject a bad model. It would just be fitting a single-tail shape to data that isn't shaped that way, silently. The cheaper check to run first: a multimodal test against the empirical duration distribution (a kernel density estimate with more than one clear mode, or a formal dip test) before trusting either {% katex() %}\alpha{% end %} or the viability condition built on it. If the check fails, the honest fallback isn't to keep using this post's formula with a re-measured {% katex() %}\alpha{% end %}; it's to segment the heavy class by workload type first, the same way Definition 1b already splits heavy from light, and apply this post's own machinery per segment rather than to an unexamined aggregate.

**The derivative gate's own construction introduces phase lag this post never separately prices, distinct from the noise-versus-lag tradeoff {% katex() %}\eta{% end %} already covers.** {% katex() %}\dot{H}(t){% end %} is computed as a finite difference of the EWMA-smoothed {% katex() %}\hat{H}(t){% end %}, not of raw telemetry, so it inherits the smoother's own phase response: accurate for the slow sedimentation trend the redline exists to catch, distorted near the glitch frequency {% katex() %}\eta{% end %} is tuned to reject. That's a different effect than the false-trigger risk already priced above. A closed loop combining this phase-shifted derivative with whatever delay the demotion actuator carries, the scheduler itself acting on the signal, can lose phase margin. Margin loss of that kind is a standard route to the exact sustained oscillation this design exists to avoid: no Nyquist-style stability margin is computed for that delay anywhere in this post. Differentiating a low-pass-filtered signal inside a closed loop makes this a sharp, specific instance of a missing class of analysis, control-loop stability margins in general, that this series never runs anywhere it applies. A deployment running Definition 2 close to its own actuator's real delay budget should check the loop's own phase margin directly, a frequency-domain bound, or a Kalman-style trend estimator built to extract a derivative without the same phase cost, rather than trust that a low false-trigger rate in this post's own step-plus-glitch simulation already covers it. That simulation never modeled actuator delay at all.

The lag this smoother introduces isn't a new quantity: it's the same settling time this post already derived and verified earlier against real simulated data, restated here as what it actually costs a deployment tuning {% katex() %}\eta{% end %} for noise immunity.

{% katex(block=true) %}
\tau(\eta) \approx -\frac{1}{\ln(1-\eta)}
{% end %}

where:

* {% katex() %}\tau(\eta){% end %} - the smoother's own settling time in seconds, verified earlier in this post against measured lag at three separate {% katex() %}\eta{% end %} values
* {% katex() %}\eta{% end %} - the EWMA smoothing constant, higher means less lag and less noise immunity

At the recommended {% katex() %}\eta=0.25{% end %}, {% katex() %}\tau\approx3.5{% end %}s sits inside, not above, a real stop-the-world GC pause or GIL stall's own 1-to-10-second range: the smoother's own settling time isn't reliably longer than the glitch it exists to dilute.

**Two more claims about reaction speed, and both are timed against a real-world clock this post never actually measured.**

| Claim | Depends on | What real infrastructure could do instead |
| :--- | :--- | :--- |
| Demotion fires within single-digit seconds, the same order as Definition 1b's {% katex() %}t^*{% end %} | {% katex() %}\hat{H}(t){% end %}'s own telemetry refreshing fast enough to see the change | A standard Prometheus scrape interval, 10-15s, an order of magnitude too slow |
| {% katex() %}\eta\approx0.25{% end %}'s safety margin ({% katex() %}\tau\approx3.5{% end %}s) dilutes any single glitch | Glitches lasting one simulated timestep, sub-second in practice | A real JVM stop-the-world pause or Python GIL stall, routinely several seconds under memory pressure |

*Two claims, both timed against an assumption about a real-world clock this post never checked against real infrastructure.*

Definition 1b's own {% katex() %}t^*\approx3.4{% end %}s needs no such check: it's read from a task's own elapsed wall-clock time since admission, an in-process clock every serving engine already tracks, no exporter, no scrape interval, no aliasing possible. {% katex() %}\hat{H}(t){% end %} is a different kind of signal entirely, sourced from whatever metrics pipeline exports node-level headroom. The chart above already shows why the second row is the sharper risk: at the recommended {% katex() %}\eta=0.25{% end %}, {% katex() %}\tau{% end %}'s own 3.5 seconds sits inside, not above, the range real garbage-collection pauses and scheduler stalls actually occupy. A deployment running Definition 2 against off-the-shelf telemetry needs either a genuinely faster-scraping pipeline for the first row, or an honest downward revision of what "single-digit seconds" means on its own infrastructure, and needs its own measured GC-pause or scheduler-stall distribution checked against {% katex() %}\tau{% end %} for the second, not this post's one-timestep glitch model trusted as already conservative.

**Knowledge's update rule has no convergence guarantee.** The EWMA recalibration above is a reasonable, standard choice, not a proven one: whether it settles toward the true {% katex() %}G{% end %} under a genuinely non-stationary arrival process, or lags, oscillates, or drifts, is a control-theoretic question this post raises and does not close. A deployment that leans heavily on Knowledge's adaptation should validate this empirically, not assume the loop's existence is itself the guarantee.

**Compute it.** Three instincts opened this post: catch it before it happens, catch it while it's happening, ride it out and add capacity. Before trusting any of them on a real system, check which ones your own pool actually supports.

* **Do you have a physical headroom signal, and is it smoothed before you differentiate it?** Definition 2's redline needs both {% katex() %}H(t){% end %} and {% katex() %}\dot{H}(t){% end %}, and an unsmoothed derivative on raw telemetry will demote tasks on garbage-collection noise, not on real sedimentation.
* **Have you checked the loop's own phase margin against your actual actuator delay, or only its false-trigger rate against a simulation that never modeled that delay?** The two aren't the same check, and only the first one rules out oscillation as a consequence of the derivative gate's own construction.
* **Does your own telemetry pipeline actually refresh fast enough to deliver the single-digit-second reaction this post claims, or does it run on a standard 10-to-15-second scrape interval that structurally cannot?** Check the exporter, not just the loop's own tick rate.
* **Does your runtime's real GC-pause or scheduler-stall distribution actually stay shorter than {% katex() %}\tau{% end %} at whatever {% katex() %}\eta{% end %} you're running?** Or was that checked only against this post's own one-timestep glitch model rather than a real managed runtime under memory pressure?
* **Do you know your own {% katex() %}\alpha{% end %}, and does it clear {% katex() %}E[S_h]/T_{\text{scale}}{% end %}?** If it doesn't, there's a real window of detection times spanning your own {% katex() %}x_m{% end %}, where autoscaling won't help even though the workload is genuinely heavy-tailed: check whether your system's typical detection time actually falls inside that window before trusting this lever.
* **Before trusting that {% katex() %}\alpha{% end %} at all: does your own heavy class actually look like one population?** Does a density plot of its measured durations show more than one mode? A Hill estimator won't warn you either way, it fits a single tail shape regardless of whether one is the right model.
* **Is your bridging-window arrival process actually close to independent, or does the same upstream trigger drive correlated bursts?** If the latter, size the buffer against your own measured dispersion, not the independence-assuming default.
* **Does your Knowledge phase have an actual update rule?** Or does "the system learns" mean nobody re-derives the thresholds after an incident: a control loop that never closes back into Analyze is a reactive system wearing an autonomic name.
* **Do any of your tenants have an incentive to evade detection?** If so, stop here: this post's mechanisms were not built for that regime, and pretending otherwise is worse than admitting the gap.

> **Cognitive Map**
>
> 1. Proposition A proved no algorithm can save a Blood Oath workload. The fix has to be structural, priced, not assumed free.
> 2. The Sedimentation Threshold (Proposition 1) shows heavy tasks alone can fill the pool past {% katex() %}\rho_h = C{% end %}, a removed face, not a tradeoff.
> 3. The Physical Redline (Definition 2a, Definition 2) gates demotion on headroom and its derivative. Reserved margin {% katex() %}H_{\min}{% end %} is sized against a real Poisson arrival model and the pool's own 32:1 failure-versus-idle cost ratio: {% katex() %}H_{\min}^*=5{% end %}, verified as cost-minimizing, not merely formula-shaped.
> 4. The Provisioning Window (Proposition 2, 2b) shows autoscaling's viability is a property of {% katex() %}\alpha{% end %} relative to {% katex() %}E[S_h]/T_{\text{scale}}{% end %}, not of detection timing: comfortably satisfied at every detection time for this series' own {% katex() %}\alpha=2.2{% end %}, but not guaranteed for a lighter-tailed system.
> 5. The buffer (Proposition 3) is the same {% katex() %}H_{\min}{% end %} priced as a critical fractile. One object reached two ways, not two objects that share a name.
> 6. Definition 3 closes the loop from Knowledge back into Analyze, the one edge most MAPE-K implementations skip. It names the exact dividing line between fragile, robust, and antifragile: whether a stress event changes what the system believes about its own parameters afterward.

---
<sup>[1]</sup> Little, J.D.C. (1961). *A Proof for the Queuing Formula: L = λW.* Operations Research, 9(3), 383–387.

<sup>[2]</sup> Nichols, K. & Jacobson, V. (2018). *Controlled Delay Active Queue Management.* RFC 8289, IETF.

<sup>[3]</sup> Dehigama, D., Jesalpura, S., Xu, Z., Nemeth, M., Zhu, S., Kogias, M. & Grot, B. (2026). *Spandana: Reconciling Strict SLOs with Low Cost under Fine-Grained Load Fluctuations.* arXiv:2606.30533.

<sup>[4]</sup> Kephart, J.O. & Chess, D.M. (2003). *The Vision of Autonomic Computing.* IEEE Computer, 36(1), 41–50.

<sup>[5]</sup> Hellerstein, J.L., Diao, Y., Parekh, S. & Tilbury, D.M. (2004). *Feedback Control of Computing Systems.* Wiley-IEEE Press.

<sup>[6]</sup> Sanwouo, B., Quinton, C. & Temple, P. (2025). *Breaking the Loop: AWARE is the New MAPE-K.* Companion Proceedings of the 33rd ACM International Conference on the Foundations of Software Engineering (FSE Companion 2025), 626–630.

<sup>[7]</sup> Botros, J.S., Al-Qora'n, L.F. & Al-Said Ahmad, A. (2024). *Towards antifragility of cloud systems: An adaptive chaos driven framework.* Information and Software Technology, 174.

<sup>[8]</sup> Taleb, N.N. (2012). *Antifragile: Things That Gain from Disorder.* Random House.

<sup>[9]</sup> Ghodsi, A., Zaharia, M., Hindman, B., Konwinski, A., Shenker, S. & Stoica, I. (2011). *Dominant Resource Fairness: Fair Allocation of Multiple Resource Types.* 8th USENIX Symposium on Networked Systems Design and Implementation (NSDI 11).

