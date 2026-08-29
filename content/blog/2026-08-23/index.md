+++
authors = ["Yuriy Polyulya"]
title = "Building What Six Posts Only Proved"
description = "A proof tells you a mechanism is correct under stated conditions. It doesn't say what component owns the check, what it costs to run, or what order to build six of them in when a real system needs more than one at once. This post is that build: one engineering answer per problem this series proved, six runbook entries for what on-call actually does when each one fires, and the dependency order that keeps them from being built against each other. Then it turns to the choice every mechanism in this series made without ever arguing for it: decide locally, on a stale view. Checked against seven real points in the centralization design space, not two, from Google's Borg to a production LLM-serving system that arrived at this series' own routing algorithm independently, with a decision tree for finding the right one fast and honest pros and cons for reading past it: real vendor claims kept separate, throughout, from what's actually been verified."
date = 2026-08-23
slug = "asymptotically-ruined-part7-building-the-proof"
draft = false

[taxonomies]
tags = ["distributed-systems", "capacity-planning", "engineering-principles", "scheduling"]
series = ["no-safe-number"]

[extra]
toc = false
series_order = 7
series_title = "Asymptotically Ruined: Capacity Planning Beyond the Light-Tailed Assumption"
series_description = """<div class="series-lede">The greatest paradox in distributed systems engineering is that our obsession with "simplicity" is the single most reliable generator of unmanageable complexity.</div>Capacity planning under heavy-tailed demand isn't harder than under light-tailed demand, it's structurally different, and this series proves exactly where that difference breaks a standard capacity number. It then builds what survives it: a physical-signal admission control loop, a multi-resource generalization checked against an independent Price-of-Anarchy result, an eviction rule derived as optimal stopping, and a fleet-pooling result sized by the same square-root staffing law used in queueing theory. Before recommending any of it, the series prices what the adaptive machinery itself costs to run, and closes with a decentralized-versus-centralized architecture comparison, translated into a concrete build order and on-call runbook."""
+++

## Six Posts Aren't a Design

Every post so far proved something and then, correctly, stopped: a Definition, a Proposition, a Model Scope section naming exactly where the proof stops applying. That discipline is what makes the results trustworthy. It's also not, by itself, something a team can hand to an engineer and say "build this." A proof tells you a mechanism is correct under stated conditions. It doesn't tell you what component owns the check, what it reads, what it costs to run, or what order to build six of them in when a real system needs more than one at once.

This post is the other half. Six real problems, proved across six posts, each with a real engineering answer below it, not a menu of options with a checkbox next to the best one, because there isn't a single best one independent of what a specific team already has. What follows is what actually gets built, where it sits, what it costs, and what it costs to get wrong, so the choice is a real engineering tradeoff and not a guess dressed up as one.

Read the wrong way, this post could look like a retreat from everything the first six proved: as if the earlier posts were the warm-up and the "real" content was always going to be a checklist. That's not the relationship. [Proposition A](/blog/no-safe-number-part1-blood-oath/#prop-a)'s impossibility result is exactly why the first entry below has only three real responses instead of an open-ended search for a cleverer one; [Proposition 6](/blog/asymptotically-ruined-part5-square-root-routing/#prop-6)'s own square-root-staffing derivation is exactly why the fleet-pooling entry can state a specific saving instead of a vague "pooling probably helps." Every engineering answer in this post is as narrow, and as trustworthy, as the proof underneath it. This post spends that trust. It doesn't replace it.

## Blood Oath's Impossibility

Proposition A proved no admission algorithm can save a workload with all three Blood Oath properties at once. That's not a gap waiting for a cleverer algorithm. It's a closed door, and there are exactly three ways to respond to a closed door: build around it, remove one of the properties that closed it, or accept it and pay for the accommodation.

**Accept it: provision the buffer.** The cheapest real answer, engineering-wise, is [Definition 2a](/blog/no-safe-number-part2-provisioning-window/#def-2a)'s own margin, enforced where admission actually happens: an atomic counter with a reserved floor, {% katex() %}H_{\min}{% end %} slots held back from ordinary admission, checked at intake before a task is accepted. This is genuinely small: one counter, one comparison, no new service, no new failure mode beyond the ones the admission path already has. What it costs is not engineering time. It's the margin itself, permanently. Post 3's own number for this series' specimen, {% katex() %}9.7\%{% end %} of decode memory, isn't a number that shrinks as the system matures. It's the price of the door staying closed, paid every hour the system runs.

**Remove the locality-lock property: add checkpointing.** Post 4's own population escapes Blood Oath by making state relocatable at a real, finite cost instead of an architecturally prohibitive one. Engineering this is a real build, not a config flag: a state-serialization path (vLLM's own PagedAttention swap-to-host mechanism is the reference implementation, already cited in Post 4), a relocation API between nodes that can move a task's accumulated KV cache and resume it correctly, and [Proposition 5](/blog/asymptotically-ruined-part4-eviction-crossover/#prop-5)'s own crossover check running as a periodic background scan comparing each running task's {% katex() %}m(t)\cdot c_{\text{opp}}{% end %} against {% katex() %}C_{\text{evict}}(S(t)){% end %}. None of that is exotic; serving engines already ship pieces of it. But "the infrastructure exists elsewhere" and "this specific system has tested a real eviction-and-resume cycle" are different claims, and Post 4's own closing checklist says exactly that: treat every number as conditional on infrastructure that's actually been tested, not merely available.

**Remove the immortality property: bare preemption, no state transfer.** The cheapest escape of the three, when it's available at all: a kill signal and a retry queue, no serialization, no relocation API, nothing to test beyond "does the retry actually produce the same result." This only works when the caller genuinely tolerates a full restart: a batch job, an idempotent request, something without a human waiting on the other end of a specific in-flight computation. Most of this series' own specimen (a reasoning trace a user is actively waiting on) fails that test by construction, which is exactly why Post 1 built Blood Oath around a workload where this option isn't available, not an accident of scoping.

**What each of the three actually looks like in a real admission path, concretely enough to estimate.** The buffer is a single guarded decrement on the same counter that already tracks occupancy: the kind of change a single engineer ships and reviews in an afternoon, with the only real risk being an off-by-one in the reserved-floor comparison. Checkpointing is a genuinely different scope of project: a serialization format for accumulated state, a transport for moving it between nodes fast enough that Proposition 5's own crossover math still holds, a resumption path that has to produce output indistinguishable from an uninterrupted run, and a test suite proving the resumption path actually works under real failure conditions, not just the happy path. Bare preemption sits between the two. A kill signal and a retry queue are each individually simple, but wiring them correctly into whatever upstream system is waiting on the result, so a killed task's caller gets a clean retry signal rather than a silent hang, is where the real engineering time actually goes.

**The actual decision, stated as an engineering one rather than a theoretical one:** if a caller can tolerate a restart, bare preemption is almost always the right first build: it's cheap, and everything else is strictly more expensive to build for a smaller marginal gain. If it can't, the choice is between paying the buffer's own permanent tax and paying checkpointing's own one-time (but real, and real to test) engineering cost. That choice should be made by comparing the buffer's own ongoing cost, computable today from Definition 2a's own numbers, against a real estimate of the checkpointing build's own engineering time, which this series has never had the inputs to supply and a real team does.

| Response | Engineering lift | Ongoing cost | Use when |
| :--- | :--- | :--- | :--- |
| Accept (provision the buffer) | One counter, one comparison; ships in an afternoon | Permanent: {% katex() %}9.7\%{% end %} of decode memory, every hour, forever | Caller can't tolerate a restart *and* checkpointing isn't worth building yet |
| Remove locality lock: checkpoint | Serialization format, relocation API, tested resume path; a real project | Per-relocation only, priced by Post 4's {% katex() %}C_{\text{evict}}(S){% end %}, not standing | State is genuinely relocatable and the buffer's own tax exceeds the build cost |
| Remove immortality: bare preemption | Kill signal + retry queue; simple pieces, real integration work | Near zero once wired correctly | Caller genuinely tolerates a full restart |

*Engineering lift, ongoing cost, and applicability of the three real responses to Blood Oath's closed door.*

{% mermaid() %}
graph TD
    A["Task admitted"] --> B{"Tolerates<br/>restart?"}
    B -->|"Yes"| C["Bare preemption<br/>(SIGTERM → SIGKILL)"]
    B -->|"No"| D{"State<br/>relocatable?"}
    D -->|"Yes"| E["Checkpoint<br/>and resume"]
    D -->|"No"| F["Accept buffer<br/>(permanent tax)"]

    style A fill:#e3f2fd
    style B fill:#fff3e0
    style C fill:#c8e6c9
    style D fill:#fff3e0
    style E fill:#ffe0b2
    style F fill:#ffcdd2
{% end %}
*Decision tree for which of the three responses applies to a given task, based on restart tolerance and state relocatability.*

**Real-world precedent for each of the three responses, so none of them is invented from scratch.** Bare preemption's kill-then-retry shape is exactly how Google's Borg cluster manager preempts lower-priority work today: a SIGTERM notice before the SIGKILL, giving the victim task a chance to exit cleanly rather than being cut off mid-instruction {{ cite(ref="1", title="Verma, A., Pedrosa, L., Korupolu, M., Oppenheimer, D., Tune, E. & Wilkes, J. (2015) — Large-Scale Cluster Management at Google with Borg") }}. Kubernetes' own eviction API follows the identical pattern: graceful termination within a configured grace period, then a forced kill once that period expires {{ cite(ref="2", title="The Kubernetes Authors — Disruptions, Kubernetes Documentation") }}. Checkpointing has a real, general-purpose foundation to build on rather than a from-scratch serialization format. CRIU (Checkpoint/Restore In Userspace) already does process-level freeze-to-disk-and-resume for Linux containers, capturing memory, open files, and process state as a portable image {{ cite(ref="3", title="CRIU Project — Checkpoint/Restore In Userspace") }}. But native, production-grade checkpoint/restore integration at the cluster-scheduling layer is still an emerging capability, not a mature, drop-in option as of this writing. That maturity gap is precisely why Post 4's own closing checklist treats every checkpointing number as conditional on infrastructure that's actually been tested, not merely available somewhere in the ecosystem.

## Sedimentation With No Physical Signal

[Definition 2](/blog/no-safe-number-part2-provisioning-window/#def-2)'s Physical Redline is the answer to a specific engineering failure Post 1 already demonstrated with real numbers: circuit breakers, rate limiters, and retry budgets each fail this workload for a structural reason, not a tuning one, and re-tuning any of them doesn't fix it. Circuit breakers detect degradation but can't free a slot. Rate limiters can't distinguish the rare expensive request from the common cheap one, so holding the line against a 10x heavy-task surge means rejecting 90% of all traffic, most of it harmless. Retry budgets watch for a failure event that structurally can't occur in a workload that never fails, only runs long. None of the three were badly configured. They were the wrong category of tool, and no amount of engineering effort spent tuning them closes that gap.

| Mechanism | What it watches | Can it free a slot? | Why it fails here |
| :--- | :--- | :--- | :--- |
| Circuit breaker | Error rate | No | Detects degradation, has no lever on a task that isn't failing, only running long |
| Rate limiter | Arrival volume | No | Can't tell the rare heavy request from the common cheap one: holds the line by rejecting mostly-harmless traffic |
| Retry budget | Failed attempts | No | Watches for a failure event a non-preemptible, never-erroring workload structurally can't produce |
| Client-side adaptive throttling | Local accept/reject ratio | No | Reacts to a backend's own rejection after the fact: closer than error rate, still a proxy one step removed from the requester's own remaining headroom |
| Physical Redline | Real headroom + its derivative | N/A: reprioritizes, doesn't evict | Watches the actual physical quantity at risk, not a proxy for it |

*Why circuit breakers, rate limiters, retry budgets, and client-side throttling all fail to free a slot, and what the Physical Redline watches instead.*

{% mermaid() %}
graph LR
    A["Raw headroom"] --> B["EWMA smooth:<br/>H-hat(t)"]
    B --> C{"Below H_min,<br/>or trending there?"}
    C -->|"No"| A
    C -->|"Yes"| D["Demote<br/>(reprioritize only)"]

    style A fill:#e3f2fd
    style B fill:#e3f2fd
    style C fill:#fff3e0
    style D fill:#c8e6c9
{% end %}
*The Physical Redline's control loop: smooth raw headroom, check it against the margin and its trend, demote on breach.*

**The actual build.** Three pieces, in order of how much they cost to get working: a telemetry read of real headroom (usually already exists, since something is already tracking free memory or slot count); an EWMA smoother: {% katex() %}\hat{H}(t) = \eta H_{\text{raw}}(t) + (1-\eta)\hat{H}(t-1){% end %}, one multiply and one add per observation, and Post 6 already established this arithmetic is negligible against any other cost this series has priced; and a demotion hook that writes into whatever priority or resource-accounting field the scheduler already reads. The hook is the part worth taking seriously as an integration cost, not the arithmetic. It has to reach into the scheduler's own admission and priority logic without also gaining standing privilege to touch tasks it doesn't own, exactly the scoping constraint Post 2 named as a design requirement, not a footnote. The telemetry read has its own build requirement Post 2 named and this runbook shouldn't drop: the control loop's own tick rate for {% katex() %}H(t){% end %} and {% katex() %}\dot{H}(t){% end %} has to be bound to the metrics exporter's own scrape interval, not left to whatever the loop's own clock happens to run at. A loop ticking faster than its telemetry source refreshes reproduces the exact GC-pause-style flapping {% katex() %}\eta{% end %} exists to prevent, from a different cause {% katex() %}\eta{% end %} can't fix. Check the real exporter's own scrape interval before deploying any {% katex() %}\eta{% end %} this series recommends, and either cap the loop's tick rate to match it or have the loop skip the derivative update on ticks that see no fresh sample.

That fix covers a stale or duplicate sample; it doesn't cover jitter in an otherwise-fresh one, and a real exporter has both. A scrape nominally every 15s that lands at 14.8s, then 15.2s, produces two genuinely new samples (the skip-on-no-fresh-sample rule never fires). But computing {% katex() %}\dot{H}(t){% end %} as {% katex() %}\Delta H{% end %} over an assumed nominal 15s, rather than the real interval each pair of samples actually spanned, reproduces the same sawtooth risk {% katex() %}\eta{% end %} was built to damp, from timing noise instead of a stale reading. The build has to compute the derivative from the telemetry payload's own timestamp delta, {% katex() %}\dot{H}(t) \approx \Delta H / \Delta t_{\text{real}}{% end %}, not a hardcoded or assumed scrape period: a small addition on top of the stale-sample check above, not a replacement for it, since the two failure modes are different and both are real on any exporter running outside a lab.

**What the demotion hook has to get right, beyond just existing.** The scoping constraint Post 2 named (ownership established once at admission, not re-granted on every demotion decision) is the difference between a small, auditable change to the scheduler's own priority logic and a standing capability broad enough to touch any task on the node. A real implementation should be checkable in one specific way before it ships: can the redline's own demotion path reach a task the admission path never granted it authority over? If the answer is yes, the mechanism has a larger blast radius than Definition 2 was ever designed to have, independent of whether {% katex() %}\eta{% end %} or the telemetry pipeline are correct.

**The one real tuning decision, and how to make it without guessing.** {% katex() %}\eta{% end %} trades false-trigger risk against detection lag. Post 2 already ran the actual simulation a team would otherwise have to run themselves: false-trigger probability stays at zero from {% katex() %}\eta=0.05{% end %} to {% katex() %}\eta\approx0.25{% end %}, with lag falling the whole way, then climbs sharply past that point while lag keeps falling more slowly. The engineering answer isn't "pick {% katex() %}\eta=0.25{% end %}": it's "run this same false-trigger-versus-lag simulation against your own system's actual glitch duration and noise profile before trusting any specific value," since {% katex() %}0.25{% end %}'s optimality is a property of this series' own specimen, not a universal constant.

**This isn't a novel category of mechanism. Production systems at scale already watch something structurally close, and it's worth being precise about how close.** Netflix's own concurrency-limits library and Uber's Cinnamon auto-tuner both replace a static concurrency cap with a live signal derived from TCP Vegas' congestion-control logic, inferring queue buildup from the gap between a request's observed and minimum latency, then raising or lowering the accepted concurrency continuously, in production, across a wide range of services {{ cite(ref="4", title="Netflix Technology Blog (2018) — Performance Under Load") }}{{ cite(ref="5", title="Uber Engineering (2023) — Cinnamon Auto-Tuner: Adaptive Concurrency in the Wild") }}. That's the same category move Definition 2 makes: trade a fixed threshold or an error-rate proxy for a live estimate of the resource actually under contention.

| Approach | How it reads headroom |
| :--- | :--- |
| Vegas-style (Netflix, Uber) | Indirectly, from latency: the underlying resource usually isn't observable to the caller |
| Definition 2 | Directly. This series' own specimen makes the measurement available server-side |
| Google SRE client-side throttling {{ cite(ref="6", title="Beyer, B., Jones, C., Petoff, J. & Murphy, N.R. (eds.) (2016) — Site Reliability Engineering: How Google Runs Production Systems") }} | Neither: rejects locally once a client's own rolling accept/reject ratio crosses a threshold |

*How three production concurrency-control approaches actually read headroom: directly, inferred from latency, or not at all.*

Where direct measurement isn't available, latency-gradient inference is the real, production-proven fallback, not a gap this mechanism leaves unaddressed. The SRE playbook's client-side throttling is closer to a rate limiter's arrival-side view than to either Vegas' congestion inference or Definition 2's direct headroom read: a useful reminder that "watch some signal" and "watch the right signal" aren't automatically the same fix.

## Single-Resource Blindness

[Definition 4](/blog/no-safe-number-part3-bottleneck-moves/#def-4) exists because Definition 2, watching one gauge, is structurally blind to pressure building on a resource that gauge was never wired to: Post 3's own finding that a real disaggregated fleet's real memory margin sits far closer to baseline, and far sooner lost to ordinary load growth, than a slot-based redline would ever show, is the concrete demonstration, not a hypothetical.

**Build it: a small control-plane sidecar, not a scheduler.** Per-resource telemetry (GPU utilization, memory bytes, network Mbps) normalized to a headroom fraction {% katex() %}h_r(t) = H_r(t)/C_r{% end %} per resource, compared continuously, with demotion triggered on {% katex() %}\arg\min_r h_r(t){% end %}. This is a genuinely small piece of infrastructure: it reads telemetry that mostly already exists, computes a handful of ratios, and writes one signal. The engineering discipline that matters here isn't the mechanism's own complexity. It's keeping the boundary Post 3 drew precisely: this borrows Dominant Resource Fairness's own dominant-share *normalization* {{ cite(ref="7", title="Ghodsi, A., Zaharia, M., Hindman, B., Konwinski, A., Shenker, S. & Stoica, I. (2011) — Dominant Resource Fairness: Fair Allocation of Multiple Resource Types") }}, not its strategy-proofness *proof*. Building it as though it were a fairness-guaranteeing allocator rather than a monitoring comparison is the single easiest way to overclaim what it actually does.

**One demand this sidecar has to see that the symbolic model never made it feed back into.** [Proposition 5c](/blog/asymptotically-ruined-part4-eviction-crossover/#prop-5c)'s own emergency-eviction transfers consume the identical network resource {% katex() %}h_{\text{I/O}}(t){% end %} is built to watch: Post 4's own {% katex() %}k{% end %} concurrent relocations sharing the relocation link are real Mbps demand on the same fabric a prefill handoff competes for. But Post 4's own contention analysis (the {% katex() %}B/k{% end %} fair-share model, the PFC-incast risk) was priced as a self-contained calculation, never wired into this sidecar's own continuous {% katex() %}h_{\text{I/O}}(t){% end %}. A production build shouldn't repeat that separation: eviction traffic needs to register against the same network headroom fraction every other admission decision reads, not live in a parallel accounting a real deployment has to remember to reconcile by hand. Skipping this is the easy failure mode: an eviction storm quietly starves prefill's own network headroom while {% katex() %}h_{\text{I/O}}(t){% end %} keeps reporting comfortable, because the sidecar was never told the eviction channel was spending from the same budget.

**Adopt instead of build: real systems already do a version of this.** NVIDIA Dynamo and the vLLM Router both exist, in production, solving a related but genuinely different problem: optimizing which worker serves a given request under a latency SLO, continuously. Post 3's own finding, worth restating as the actual engineering decision it implies: adopting Dynamo doesn't remove the need for Definition 4's mechanism, because Dynamo is a scheduler and Definition 4 is a safety backstop underneath one, the same relationship CoDel has to a full traffic-engineering stack. A team already running Dynamo still needs an answer to "what happens when Dynamo's own assumptions about available headroom break." That answer is Definition 4, built alongside the adopted scheduler, not instead of it.

**What the strategy-proofness boundary means for an actual deployment decision, not just a citation caveat.** Post 3's own scope note (this borrows DRF's normalization, not its strategy-proofness proof) has a concrete engineering consequence worth stating plainly: if the pool this mechanism protects serves multiple tenants with any incentive to avoid demotion, Definition 4 has no defense against a tenant that games the classifier by shaping requests to stay under whatever signature it keys on. That's not a reason to skip building it: it's a reason to check, before building it, whether the deployment is genuinely single-tenant or cooperative-multi-tenant (this mechanism's actual scope) or adversarial-multi-tenant (a different problem this series never solved). Building Definition 4 for the second case and trusting it as though it were built for the first is the exact kind of overclaim Post 3 spent its own Model Scope section warning against.

**Where this gets more expensive than the mechanism alone suggests.** Chunked-prefill interleaving and elastic role reassignment (Arrow, HeteroScale) are both real, deployed answers to a different problem (reclaiming idle compute, moving capacity to where load actually is) and both break [Definition 4a](/blog/no-safe-number-part3-bottleneck-moves/#def-4a)'s own separable-regions assumption on purpose, coupling resources a fixed-topology deployment wouldn't have coupled. A team adopting either of these needs Definition 4a's own frontier re-derived against a joint cost structure before trusting Definition 4's mechanism as stated: a real, second engineering task, not a footnote to the first.

| Option | Engineering lift | What it doesn't cover | Use when |
| :--- | :--- | :--- | :--- |
| Build the sidecar | Small: reads existing telemetry, computes ratios, writes one signal | Adversarial multi-tenant gaming of the classifier | Single-tenant or cooperative-multi-tenant pool |
| Adopt Dynamo / vLLM Router | None: already deployed for scheduling | Not a safety backstop; solves a different problem underneath which this gap still sits | Team already running one, still needs Definition 4 alongside it |
| Neither | None | Blind to whichever resource the redline wasn't wired to: Post 3's own margin-erosion finding | Not defensible once the gap is known |

*Build-versus-adopt-versus-skip tradeoff for closing single-resource blindness, and what each option still leaves uncovered.*

The sidecar runs the same loop diagrammed above for Definition 2, generalized in exactly one place: it normalizes each resource to {% katex() %}h_r(t) = H_r(t)/C_r{% end %}, checks {% katex() %}\arg\min_r h_r(t){% end %}, and demotes on whichever resource is closest to its own limit, not on a single raw headroom reading.

## Eviction and Its Own Limit-Cycle Risk

Proposition 5's crossover rule and Proposition 5c's emergency-priority ranking are the mechanism this series built for the population that can afford eviction. Building it is a real, moderate engineering lift, and it's worth being honest about the size of that lift before comparing it against the cheap alternative.

**Build it: two components, not one.** A background job, running per task, comparing {% katex() %}m(t)\cdot c_{\text{opp}}{% end %} against {% katex() %}C_{\text{evict}}(S(t)){% end %}: cheap to compute, the real cost is instrumenting {% katex() %}S(t){% end %} (accumulated state size) and {% katex() %}m(t){% end %} (mean residual life, itself needing a measured {% katex() %}\alpha{% end %} and {% katex() %}x_m{% end %}) accurately enough to trust. And a second, structurally different component for the emergency channel: a priority queue keyed on descending {% katex() %}S(t){% end %}, largest accumulated state first, since fixed per-eviction overhead means relief rate strictly increases with what's evicted. It's floored at [Definition 1b](/blog/no-safe-number-part1-blood-oath/#def-1b)'s own confidence crossover and capped by Post 4's own {% katex() %}T_{\text{OOM}}(t){% end %} deadline, so the queue never hands the control loop a candidate whose own transfer wouldn't land before the node fails outright, plus the credited-headroom projection {% katex() %}\hat{H}_{\text{mem}}(t){% end %} Post 4 built to stop the control loop from issuing redundant eviction commands before the first one's transfer completes. That projection term is the piece most likely to be skipped under time pressure and most load-bearing when it is. Post 4's own numbers show it accounting for real, multi-hundred-megabyte swings the naive version misses. A production implementation also needs the deadline check running against a real, measured {% katex() %}\delta_0{% end %}, not the illustrative figure Post 4 priced. The ceiling only protects the node if the number it's checked against is the control plane's own real per-eviction overhead.

**What "instrumenting {% katex() %}S(t){% end %} and {% katex() %}m(t){% end %} accurately enough to trust" actually requires.** {% katex() %}S(t){% end %} needs a real, per-task accounting of accumulated state size, updated as generation proceeds, not an estimate computed once at admission and left stale, since Proposition 5's whole crossover argument depends on {% katex() %}S(t){% end %} tracking actual elapsed accumulation, not a proxy for it. {% katex() %}m(t){% end %} needs a measured {% katex() %}\alpha{% end %} and {% katex() %}x_m{% end %}, which means the Hill-estimator groundwork Post 2 already priced (on the order of 25 of the most extreme observed durations, not 25 durations total) has to exist before Proposition 5's own crossover time means anything more precise than a guess borrowed from this series' own illustrative numbers.

**The cheap alternative, honestly priced.** LRU or size-based eviction is already built into most schedulers and caching layers: genuinely close to free to enable. What it doesn't have is any argument for why it's safe to run as a standing policy: Post 4's own [Proposition 5b](/blog/asymptotically-ruined-part4-eviction-crossover/#prop-5b) argument, that this series' heavy-tailed duration distribution structurally desynchronizes voluntary-channel completions and avoids the mass-simultaneous-eviction resonance a real cited paper proves possible, doesn't transfer to a rule that wasn't built around this series' own duration distribution in the first place. The honest tradeoff isn't "correct versus incorrect." It's real engineering lift with a structural (short-of-proof) safety argument, against near-zero lift with none.

**No eviction at all.** Still a legitimate engineering answer for a team that can't afford either build yet: accept Blood Oath's own cost structure for the population that would otherwise be evicted, provision Definition 2a's buffer against it, and revisit once the buffer's own ongoing cost is measured against what building eviction would actually take.

**The two-tier structure above (a voluntary crossover check plus a separate, structurally different emergency channel) isn't a design invented for this series. It's how production node-pressure eviction already works.** Kubernetes' own kubelet distinguishes exactly the same two regimes: soft eviction thresholds that trigger only after a configured grace period, giving a task room to finish or checkpoint voluntarily before it's touched, and hard thresholds that evict immediately, with no grace period, once a resource crosses a harder line {{ cite(ref="8", title="The Kubernetes Authors — Node-pressure Eviction, Kubernetes Documentation") }}. Proposition 5's crossover rule plays the soft-threshold role here; Proposition 5c's emergency channel plays the hard-threshold role, ranked by descending {% katex() %}S(t){% end %} rather than reclaimed in arrival order: the same priority-ordered reclaim Borg already uses when preempting lower-priority work under real contention, rather than an arbitrary or first-come ordering {{ cite(ref="1", title="Verma, A., Pedrosa, L., Korupolu, M., Oppenheimer, D., Tune, E. & Wilkes, J. (2015) — Large-Scale Cluster Management at Google with Borg") }}.

**The build spec above is incomplete without a third piece Post 4's own Model Scope names, one this section has, until now, left as a caveat rather than a requirement: something at the host has to bound how many relocations actually hit the fabric concurrently.** Post 4 already showed why a naive priority queue can't be trusted to do that on its own: issuing every ranked eviction command as soon as the redline fires reproduces exactly the {% katex() %}k=32{% end %} many-to-one pattern that a real RoCEv2 fabric's own Priority Flow Control can turn into a pause-frame storm rather than the graceful {% katex() %}B/k{% end %} slowdown this series' own arithmetic assumes.

| Mechanism | Cost | Effect |
| :--- | :--- | :--- |
| Egress traffic shaper: a token bucket capping outbound relocation bandwidth per host | more to build | bounds effective {% katex() %}k{% end %} without slowing individual waves |
| Strict sequential execution of the emergency queue | cheaper, the more conservative default | trades Post 4's own 5.5-second full-wave estimate for a slower but fabric-safe worst case |

*Two ways to bound concurrent relocations hitting the fabric, trading build cost against how conservative the resulting worst case is.*

Either one bounds the effective {% katex() %}k{% end %} the fabric actually sees at any instant to a number a real deployment has tested, rather than leaving it equal to however many candidates {% katex() %}T_{\text{OOM}}(t){% end %} allows the ranking to select at once. Skipping this piece doesn't fail closed the way a missing floor or ceiling on the ranking rule does. It fails by handing the fabric the exact traffic pattern Post 4 already named as dangerous, the first time a real breach needs more than a couple of concurrent relocations to clear.

**Strict sequential execution, presented above as the cheaper, more conservative default, is not automatically compatible with the {% katex() %}T_{\text{OOM}}(t){% end %} deadline Post 4 built. The build has to check both, not pick the fabric-safe option and assume the physical one comes free.** Serializing trades Post 4's own 5.5-second full-wave estimate for a slower worst case on purpose. But "slower" has a hard ceiling it can't be allowed to cross.

**The real deadline isn't per-candidate: it's cumulative.** If a breach needs {% katex() %}k{% end %} evictions off the top of the ranked list before projected headroom recovers, and each one runs to completion before the next starts, the real deadline is the *cumulative* serialized time, roughly {% katex() %}k \cdot \delta_0{% end %} since transfer time itself stays negligible at this specimen's own numbers, against {% katex() %}T_{\text{OOM}}(t) = H_{\text{mem}}(t)/(\sigma \cdot N_{\text{survivors}}(t)){% end %}, not the single-candidate check Post 4's own ranking rule already applies. A breach deep enough to need several evictions, on a control plane with a real, non-trivial {% katex() %}\delta_0{% end %}, can serialize its way past {% katex() %}T_{\text{OOM}}(t){% end %}, even when every individual candidate would have cleared its own per-candidate deadline in isolation. Full serialization is the conservative choice for the fabric and can be the fatal choice for the node, and nothing in "pick either mechanism" above says which risk a given deployment is actually accepting.

**The actual build requirement.** Compute {% katex() %}k \cdot \delta_0{% end %} against {% katex() %}T_{\text{OOM}}(t){% end %} for the worst breach depth the redline is sized to survive before defaulting to full serialization. If that check fails, the token-bucket shaper is not the more-expensive alternative. It's the only one that keeps both constraints: bound {% katex() %}k{% end %} below the fabric's own incast threshold, not down to one, wide enough that {% katex() %}k_{\text{parallel}} \cdot \delta_0{% end %} clears {% katex() %}T_{\text{OOM}}(t){% end %} while the fabric still sees fewer concurrent flows than the danger threshold Post 4's own incast citation names.

| Option | Engineering lift | Safety argument | Use when |
| :--- | :--- | :--- | :--- |
| Build crossover + emergency ranking | Real: two components, plus instrumenting {% katex() %}S(t){% end %} and {% katex() %}m(t){% end %} accurately | Structural: heavy-tailed durations desynchronize voluntary completions (Prop 5b); the emergency channel's descending-{% katex() %}S(t){% end %} ranking draws from close to the same population, by correlation rather than proof | Population is genuinely evictable and worth the instrumentation cost |
| LRU / size-based (cheap alternative) | Near zero (already built into most schedulers) | None: never derived against this series' own duration distribution | Buffer's ongoing cost hasn't yet justified the real build |
| No eviction | None | N/A: accepts Blood Oath's buffer cost instead | Neither build is affordable yet |

*Build-versus-cheap-alternative-versus-skip tradeoff for eviction, and what safety argument (if any) backs each option.*

{% mermaid() %}
graph TD
    subgraph "Voluntary"
        A["S(t) grows"] --> B{"Crossover?<br/>m·c_opp ≥ C_evict"}
        B -->|"No"| A
        B -->|"Yes"| C["Voluntary evict"]
    end

    subgraph "Emergency"
        D["H_mem below floor"] --> E{"Already<br/>credited?"}
        E -->|"No"| G["Evict largest<br/>S(t) first"]
        E -->|"Yes"| F["Skip:<br/>already in flight"]
    end

    C -.->|"credits headroom"| E
    G -.->|"credits headroom"| E

    style A fill:#e3f2fd
    style B fill:#fff3e0
    style C fill:#c8e6c9
    style D fill:#ffcdd2
    style E fill:#fff3e0
    style F fill:#fff9c4
    style G fill:#ffcdd2
{% end %}
*The two eviction channels running side by side: voluntary crossover checks feed the same credited-headroom state the emergency ranking reads before selecting its next candidate.*

## Fleet-Scale Margin

Proposition 6 proved pooling a fleet's own bridging-window reserve behind a shared routing layer needs a strictly smaller fraction of aggregate capacity than siloed per-node reserves. A real, computed saving. What the math doesn't price, because it wasn't the math's job to, is what the routing layer itself costs to build and keep available.

**Build it: a real, new piece of infrastructure, not a free consequence of the arithmetic: and specifically not the naive version.** A fleet-wide control-plane component needs cross-node headroom visibility (aggregating what Definition 4's own per-node sidecars already produce) and a routing rule for new admissions. The naive version of that rule (compute a single fleet-wide argmax and route every admission to whichever node currently looks best) has a real, checkable defect. Every admission decided against the same observation of fleet state computes the identical argmax and routes to the identical node. That's exactly correct for one admission at a time, and a herding failure the moment more than one is decided concurrently, the ordinary case for any real control plane. [Definition 6](/blog/asymptotically-ruined-part5-square-root-routing/#def-6)'s own fix is the actual build target: sample a small number of nodes per decision (two is enough to capture nearly all the benefit) and route to the better of the sample, not the best of the whole fleet. That's a small, well-understood piece of routing logic, not a heavier build than the naive version; the real engineering cost sits elsewhere. It's a coordination point, and coordination points need their own availability engineering: what happens when this component itself is slow, partitioned, or down. Proposition 6's own math treats routing decisions as instantaneous and free; a real implementation needs a real answer for what the fleet does when the router can't answer in time, and Post 5's own Model Scope names this gap without closing it. Building this component means building that fallback too, not just the happy path the math describes.

Two corrections Post 5 made to Definition 6 after its first pass have to land in this build, not just in that post's own text.

**Correction 1: which signal triggers the routing decision.** It has to be Definition 1b's own {% katex() %}\pi_0{% end %}, read at admission, not the elapsed-time posterior "newly-detected" suggests. A task confirmed heavy by the stronger, elapsed-time signal is already running somewhere, and routing it elsewhere at that point is Proposition 5's relocation machinery, not free pooling. Building the routing hook against a "heavy task detected" event sourced from the elapsed-time classifier, rather than from {% katex() %}\pi_0{% end %} at admission, silently converts every routing decision into a relocation and reintroduces {% katex() %}C_{\text{evict}}(S){% end %}'s fixed overhead on every single one. At this specimen's own roughly 2,800 fleet-wide detections an hour (Post 5's own figure) and Post 4's own {% katex() %}\approx\$0.50{% end %} fixed relocation cost, the fully-degenerate case where every single one becomes a relocation runs to roughly {% katex() %}\$12{% end %}M a year. That's this post's own worst-case sanity check, not a number Post 5 computed or a realistic estimate (the real exposure depends on the misroute fraction Post 5 explicitly says it has no data for), but large enough on its own to show the bug isn't a rounding error against the {% katex() %}49.7{% end %}GB the mechanism is supposed to save for free.

**Correction 2: the sampled comparison itself, for multi-model fleets.** It needs the multi-resource, projected form: {% katex() %}\arg\max_{i \in d}\left(\min_r\left(h_{r,i}(t) - m_{r,i}/C_{r,i}\right)\right){% end %}, not the single-resource {% katex() %}h_i(t){% end %} comparison this section describes for the single-model case, with {% katex() %}m_{r,i}{% end %} built from [Proposition 4](/blog/no-safe-number-part3-bottleneck-moves/#prop-4)'s own {% katex() %}E[M_r]{% end %}, not the peak per-task footprint this series otherwise reuses. A single-model fleet can build the simpler version stated above; a multi-model one that builds it anyway is shipping exactly the single-resource blindness Definition 4 already exists to close, one layer up.

**This isn't a novel routing rule invented for this series. It's the default load-balancing algorithm in a widely deployed production proxy.** Envoy's own least-request load balancer samples a small, configurable number of random healthy hosts per request (two by default) and routes to whichever of the sample has fewer active requests, the identical sample-then-compare shape Definition 6 uses, with the identical guarantee: a host currently carrying the most load can never receive a new request until it's drained relative to the rest of the fleet {{ cite(ref="9", title="Envoy Proxy Documentation — Supported Load Balancers: Least Request") }}. A team building Definition 6's routing layer from scratch is re-deriving a well-tested piece of production infrastructure, not inventing a new one. The actual engineering task is wiring the sampling logic to this series' own headroom signal and building the fallback path underneath it, not the sampling algorithm itself.

**What the coordination component actually needs to survive, concretely.** A router that's slow, partitioned, or simply restarting shouldn't silently degrade the fleet to an unsafe state. It should degrade to the *siloed* behavior every node already knows how to do on its own, Definition 4's own per-node redline still running underneath regardless of whether the fleet-level router is reachable. Worth stating plainly rather than leaving a reader to infer it: fleet pooling never touches that per-node redline's own {% katex() %}9.7\%{% end %} margin, and never did. Proposition 6's own saving comes entirely from routing new admissions around whichever node is closest to its own local floor, not from lowering that floor anywhere. A partitioned router degrading to local admission produces a spike in throughput-limiting refusals, Definition 4 firing more often without the routing layer's own intelligence to steer around it, not a memory incident, because the hard local floor underneath was never borrowed from in the first place. That's the actual engineering requirement Proposition 6's math never had to state, because the math assumed the router always answers. The fallback isn't a nice-to-have; it's what keeps a router outage from becoming a fleet-wide memory incident instead of a temporarily-more-expensive one. Stated in the terms Post 5's own Model Scope now names explicitly: this is a CAP choice, availability over consistency during a partition, and it's the only defensible one here: the alternative, blocking new admissions until the router recovers, turns a coordinator outage into a fleet-wide admission outage over what was, underneath it, still a memory-pressure problem with a working local answer on every node. Building Definition 6 without that fallback path is building a system whose safety net has a single point of failure sitting directly on top of it.

**Don't build it: siloed reserves.** No new infrastructure, no coordination risk, no single component whose own downtime becomes the fleet's problem. Costs the full {% katex() %}9.7\%{% end %} margin, permanently, the same tradeoff Blood Oath's own "accept it" option makes one level up. For a fleet small enough that the absolute savings don't justify a new coordination service: and Post 5's own {% katex() %}N=8{% end %} figure shows the *fractional* saving arrives fast, but the *absolute* saving is still modest at small {% katex() %}N{% end %}. This is often the right engineering answer, not a compromise.

**Adopt instead of build.** Chiron, QLM, and inference-fleet-sim each solve a piece of the fleet-scale problem already, in production or near-production form. None of them is Definition 6 exactly (Chiron scales instance count, QLM optimizes per-request SLO attainment, inference-fleet-sim plans capacity offline). But a team already running one of these should ask what Definition 6 actually adds on top before building it from scratch, the same question Post 3 asked about Dynamo. The honest answer, stated plainly rather than left for a reader to infer: none of the three is a safety backstop in Definition 6's own sense, the same gap Post 3 found between Dynamo's own scheduling and Definition 4's own monitoring. A team running any of them still needs Definition 6's own mechanism for the specific question none of the three are built to answer: is any single node's own headroom about to run out regardless of what the adopted scheduler's own objective function currently prefers.

| Option | Engineering lift | Failure mode it must handle | Use when |
| :--- | :--- | :--- | :--- |
| Build router + fallback | Real: sampling logic is small, the availability engineering around it is the real cost | Router itself slow/partitioned/down, must degrade to siloed, not block admissions | Fleet large enough that the absolute saving justifies a coordination service |
| Siloed reserves (don't build) | None | N/A: no coordination point to fail | Fleet small enough that absolute saving is still modest at that {% katex() %}N{% end %} |
| Adopt Chiron / QLM / inference-fleet-sim | None: already deployed for scheduling | Not a safety backstop; Definition 6 still needed underneath | Team already running one, still needs the redline question answered |

*Build-versus-skip-versus-adopt tradeoff for fleet-wide routing, and which failure mode each option still leaves the fleet exposed to.*

{% mermaid() %}
graph TD
    subgraph "Naive: fleet-wide argmax"
        N1["Concurrent<br/>admissions"] --> N2["Same argmax<br/>every time"]
        N2 --> N3["Herding:<br/>one node overloads"]
    end

    subgraph "Fix: sampled routing"
        A["New admission"] --> B{"Router up?"}
        B -->|"No"| C["Fallback:<br/>siloed, local redline"]
        B -->|"Yes"| D["Sample 2 nodes<br/>(P2C pattern)"]
        D --> E["Route to<br/>lesser-loaded"]
    end

    style N1 fill:#e3f2fd
    style N2 fill:#fff3e0
    style N3 fill:#ffcdd2
    style A fill:#e3f2fd
    style B fill:#fff3e0
    style C fill:#ffe0b2
    style D fill:#e3f2fd
    style E fill:#c8e6c9
{% end %}
*Why a naive fleet-wide argmax herds every concurrent admission onto the same node, and how sampled routing with a siloed fallback avoids it.*

## The Meta-Constraint Itself

[Proposition 7](/blog/asymptotically-ruined-part6-meta-constraint/#prop-7) proved this series has a real, computed numerator for the case that adaptive machinery pays for itself, and no denominator: {% katex() %}C_{\text{workflow}}{% end %} has never been measured, here or anywhere else in this series. That's not a reason to avoid building Knowledge's own machinery. It's a reason to build it in an order that produces the missing number before committing to the expensive version.

Proposition 7's own formula is short enough to keep on hand while making this decision: {% katex() %}\text{ROI}_{\text{workflow}} = (\sum_i \Delta O_i - C_{\text{workflow}})/C_{\text{workflow}}{% end %}. Nothing about the engineering answer below changes that formula's own terms. It changes how a real team gets real numbers into it instead of leaving it symbolic.

**The staged engineering answer.** Don't build full automation first. Start with the static or semi-manual version of whatever mechanism is in question: a fixed {% katex() %}H_{\min}{% end %}, a fixed {% katex() %}\alpha{% end %}, a manually-triggered recalibration, and instrument exactly what Post 6's own "Compute It" section asks for: how often does the fixed parameter actually turn out wrong, by how much, and what does that wrongness cost when it happens. That's the numerator side, and this series has shown four separate times that it's cheap to compute once the discipline exists to do it. Then track the second number this series has never tracked for itself: how much engineering time actually goes into building, debugging, and maintaining the adaptive version, once it exists. Only once both numbers are real does Proposition 7's own ROI test ({% katex() %}\text{ROI}_{\text{workflow}} = (\sum_i \Delta O_i - C_{\text{workflow}})/C_{\text{workflow}}{% end %}) mean anything for a specific deployment. Only then is committing to the full build a decision made on evidence rather than on the same untested assumption this whole series carried since Post 2.

**What the instrumentation phase actually requires, concretely, since "measure it first" is easy to say and easy to skip in practice.** Three specific logs, not a vague monitoring initiative: every time a fixed parameter: a static {% katex() %}H_{\min}{% end %}, an unmeasured {% katex() %}\alpha{% end %}, an assumed-independent arrival process, turns out wrong enough to matter, log what it cost, the same way Post 1 through Post 5 each computed their own drift-cost figure after the fact. Every hour of engineering time spent on Knowledge's own machinery (building it, debugging a convergence issue, chasing down why a routing decision was stale) logged against a real ticket or time-tracking system, not estimated after the fact from memory. And a fixed review date, calendared in advance, at which both logs get read together and Proposition 7's own ROI test gets run with real numbers instead of this post's own admittedly-unfilled ones. Skipping any of the three turns "measure it first" back into exactly the untested assumption this series spent Post 6 naming.

**Where this differs from "just try it and see."** A staged rollout with explicit instrumentation is a specific engineering commitment, not an excuse to defer the decision indefinitely. It needs its own stopping criterion, the same gap Post 6 named in this series' own Knowledge phase: a stated point at which the static-plus-measurement phase ends and either the full build proceeds or doesn't, not an open-ended pilot that never resolves.

**Staged, measurement-gated rollout isn't a novel discipline invented for this post. It's how canary analysis already works at companies running exactly this kind of adaptive-machinery risk at scale.** Google and Netflix jointly built Kayenta specifically to answer the same shape of question this section asks, one deployment at a time instead of one architectural decision at a time: automatically compare a canary's real metrics against a baseline and gate promotion on the result, rather than trusting a new mechanism's own author to judge whether it's safe {{ cite(ref="10", title="Google Cloud Blog & Netflix Technology Blog (2018) — Introducing Kayenta: An Open Automated Canary Analysis Tool from Google and Netflix") }}. The staged answer above applies the identical discipline one level up. It gates the decision to keep building Knowledge's own machinery on the same kind of measured evidence Kayenta already demands before shipping any single change to it, rather than on the untested assumption this series carried since Post 2.

| Option | Engineering lift | What it produces | Use when |
| :--- | :--- | :--- | :--- |
| Full automation first | Highest: the expensive version, built on an assumption | An adaptive system with an unmeasured ROI denominator | Never. This is the untested assumption Post 6 named |
| Staged: static, then measure, then decide | Real but bounded: a fixed parameter plus two logs and a calendared review date | Real numerator and denominator for Proposition 7's own ROI test | Default answer for any of the six mechanisms above |
| Never adapt | None beyond the static parameter itself | A parameter that's wrong by an unknown, unmeasured amount, indefinitely | Only defensible if the instrumentation cost itself is judged not worth paying |

*Three ways to approach adaptive machinery: build it on faith, stage it behind real measurement, or never adapt at all. Only the staged path produces both terms Proposition 7's ROI test needs.*

{% mermaid() %}
graph TD
    A["Fixed parameter<br/>(static H_min, alpha)"] --> B["Log: wrong how<br/>often, what it cost"]
    A --> C["Log: engineering<br/>hours if built"]
    B --> D["Review date"]
    C --> D
    D --> E{"ROI positive?"}
    E -->|"Yes"| F["Commit to<br/>full build"]
    E -->|"No"| G["Stay static,<br/>re-review"]

    style A fill:#e3f2fd
    style B fill:#e3f2fd
    style C fill:#e3f2fd
    style D fill:#fff3e0
    style E fill:#fff3e0
    style F fill:#c8e6c9
    style G fill:#ffe0b2
{% end %}
*The staged rollout: log both the cost of not adapting and the cost of building the adaptation, then let a calendared review decide, on real numbers, whether to commit.*

## Building More Than One At Once

Every mechanism above has been described in isolation, the way each post that proved it also treated it in isolation. A real system rarely needs exactly one of these. A production disaggregated fleet plausibly needs Definition 4's per-resource redline, Proposition 5's eviction machinery, and Definition 6's fleet-level pooling simultaneously, on top of whatever Blood Oath population it still carries. Post 6 named this composition question and didn't answer it: nothing in this series has verified that these mechanisms remain individually correct once they're all running against each other's own side effects at once. This section doesn't resolve that verification gap either; no post in this series has done the work to close it. But it can give the one thing a real build actually needs regardless: an order.

**Build in dependency order, the same way this series itself was proven in dependency order.** The Constraint Sequence Framework's own core move, cited and reused at every major transition since Post 1, applies directly to construction order, not just to proof order: a downstream mechanism can't be built correctly on top of an upstream one that isn't in place yet, because its own inputs depend on the upstream one's outputs. Concretely: Definition 2's single-resource redline before Definition 4's multi-resource generalization, since Definition 4 reuses Definition 2's own per-resource logic rather than replacing it. Definition 4 before Proposition 5's eviction machinery, since Proposition 5c's emergency channel fires *off* Definition 4's own redline signal: building eviction before the redline exists means building it against a trigger that doesn't yet fire correctly. Proposition 5 before Definition 6's fleet pooling, since [Proposition 6b](/blog/asymptotically-ruined-part5-square-root-routing/#prop-6b)'s own boundary (pooling covers admissions, relocation still needs Proposition 5) means a fleet built without eviction already working has no answer for an already-diverged node, exactly the gap Proposition 6b names. And Knowledge's own adaptive machinery last, not first, layered onto whichever of the above a team has actually built and measured, since Proposition 7's own ROI test needs real mechanisms already running to have real drift costs to measure against.

{% mermaid() %}
graph TD
    subgraph "Admission Layer"
        A["Definition 2a<br/>reserved buffer"]
    end

    subgraph "Signal Layer"
        B["Definition 2<br/>Physical Redline"]
    end

    subgraph "Resource Layer"
        C["Definition 4<br/>per-resource redline"]
    end

    subgraph "Reclaim Layer"
        D["Proposition 5 / 5c<br/>eviction + emergency channel"]
    end

    subgraph "Fleet Layer"
        E["Proposition 6 / Definition 6<br/>fleet pooling"]
    end

    subgraph "Meta Layer"
        F["Knowledge's own<br/>adaptive machinery"]
    end

    A -->|"margin logic"| B
    B -->|"telemetry pattern"| C
    C -->|"is eviction's trigger"| D
    D -->|"needs relocation"| E
    A -.->|"needs drift-cost data"| F
    B -.-> F
    C -.-> F
    D -.-> F
    E -.-> F

    style A fill:#ffcccc
    style B fill:#ffddaa
    style C fill:#ffffcc
    style D fill:#ddffdd
    style E fill:#ddddff
    style F fill:#ffddff
{% end %}

Solid arrows are hard dependencies: build the upstream one first, or the downstream one fires against a signal or mechanism that doesn't exist yet. The dashed arrows into Knowledge aren't a build dependency in the same sense; they're the actual reason it comes last regardless of team size or urgency. Proposition 7's own ROI test needs real, measured drift costs to compare against a real, measured {% katex() %}C_{\text{workflow}}{% end %}, and neither number exists until something is already running long enough to be measured.

**What that order looks like as an actual build sequence, not just a dependency graph.** A team starting from nothing, running this series' own specimen, has a concrete first several builds rather than an abstract ordering. First: the admission-time buffer, Definition 2a's own reserved margin: a config value and a counter, live in days, and it's the one piece every later mechanism assumes is already there, since [Proposition 3](/blog/no-safe-number-part2-provisioning-window/#prop-3)'s own critical fractile is what every downstream margin calculation reuses. Second: the Physical Redline itself, Definition 2, the EWMA sampler and demotion hook, real but bounded engineering, closed out once the {% katex() %}\eta{% end %} simulation has actually been run against real telemetry rather than assumed. Third, once the fleet's own topology is genuinely multi-resource: Definition 4's per-resource sidecar, reusing the redline's own telemetry pattern rather than inventing a new one. Only after that redline is live and trusted does eviction become buildable at all, since Proposition 5c's emergency channel needs a real trigger to fire off. Building it earlier means building it against a signal that doesn't exist yet. Fleet pooling comes after eviction is working, not before, for exactly Proposition 6b's own reason. Knowledge's own adaptive layer comes last on every one of these, not because it matters least, but because it has nothing real to adapt until the mechanisms underneath it have run long enough to produce the drift-cost numbers Proposition 7 needs to even ask whether adapting is worth it.

**What building in the wrong order actually costs, concretely.** A team that builds Definition 6's fleet pooling before Proposition 5's eviction machinery gets exactly Proposition 6b's own named failure mode in production: a redline breach on an already-diverged node with no relocation lever, reverting to whatever Definition 4's admission-refusal alone can do, which Post 3 already showed is not much once the pressure comes from work already in flight. That's not a hypothetical risk this section is inventing. It's the literal content of a gap two earlier posts already named, now stated as a build-order consequence rather than a theoretical one. The same logic runs backward too: a team that builds eviction before the redline exists has built a mechanism with nothing correct to trigger it, since Proposition 5c's own emergency channel is defined against a redline breach that, without Definition 4 already live, has no formal meaning to fire against.

## One Decision Function, Six Mechanisms

Every "build it / don't build it / adopt instead" table above answered its own question in isolation, the way each post that proved the underlying mechanism also worked in isolation. That's not the full apparatus this series has already cited at every major transition. The Constraint Sequence Framework {{ cite(ref="11", title="Polyulya, Y. (2025) — The Constraint Sequence Framework") }} doesn't provide six separate rules of thumb. It reduces to one decision function, applied uniformly to any candidate constraint, and the build-order dependency graph above is already one term of it, stated informally. Made formal:

{% katex(block=true) %}
D(c, \mathcal{S}) = \begin{cases}
\text{build} & \text{if } V(c) \land B(c) \land [R(c) \geq \theta \lor E(c)] \land P(c) = \emptyset \\
\text{defer} & \text{if } P(c) \neq \emptyset \\
\text{don't build} & \text{if } R(c) < \theta \land \neg E(c)
\end{cases}
{% end %}

The cases aren't mutually exclusive as written (a candidate can simultaneously have a binding predecessor *and* fail the ROI bar), so the evaluation order matters. The flowchart below states it precisely: {% katex() %}R(c){% end %} and its exceptions are checked first, the predecessor gate second. A mechanism that fails the ROI bar on its own terms is "don't build" regardless of whether its predecessor happens to be built yet: there's no reason to check dependency readiness for a mechanism that wouldn't be worth building even if the dependency were satisfied. The predecessor check only matters, and only fires, for a candidate that has already cleared {% katex() %}R(c) \geq \theta{% end %} or an exception.

where:

* {% katex() %}V(c){% end %} - causal validation: a Proposition and its proof, or explicitly marked as short of one
* {% katex() %}B(c){% end %} - binding status: does *this* deployment actually have the problem
* {% katex() %}R(c){% end %} - ROI against the framework's own reservation threshold {% katex() %}\theta = 3.0{% end %}
* {% katex() %}E(c){% end %} - exception status under the framework's three named categories
* {% katex() %}P(c){% end %} - set of binding predecessors: the dependency graph, as a formal gate

<style>
#tbl_decision_function + table th:first-of-type { width: 16%; }
#tbl_decision_function + table th:nth-of-type(2) { width: 20%; }
#tbl_decision_function + table th:nth-of-type(3) { width: 18%; }
#tbl_decision_function + table th:nth-of-type(4) { width: 26%; }
#tbl_decision_function + table th:nth-of-type(5) { width: 20%; }
</style>
<div id="tbl_decision_function"></div>

| Mechanism | V(c): validated by | B(c): binding when | R(c) or exception | D(c, S) |
| :--- | :--- | :--- | :--- | :--- |
| Definition 2a buffer | Proposition A's impossibility proof (not empirical, formal) | Any Blood Oath property is present | **Existence Constraint**: below {% katex() %}H_{\min}{% end %}, the system doesn't degrade, it fails outright on the next admission | build, unconditionally |
| Definition 2 redline | Proposition A + the circuit-breaker/rate-limiter/retry-budget failure demonstration | Workload has real bridging windows | Standard, {% katex() %}R \geq 3{% end %}x‡: cheap arithmetic against Post 1's own 24.5% overpayment avoided | build |
| Definition 4 per-resource redline | Post 3's margin-erosion finding | Deployment is genuinely multi-resource | Standard, {% katex() %}R \geq 3{% end %}x when binding | build if binding, else don't build |
| Proposition 5 / 5c eviction | Proposition 5b: explicitly structural, short of full proof | Population is genuinely checkpointable | Fragile-evidence pattern† raises the bar to {% katex() %}5{% end %}x, not the standard {% katex() %}3{% end %}x | build only above the raised bar |
| Proposition 6 / Definition 6 pooling | Proposition 6's own exact queueing derivation | Fleet has more than one node | Strategic-Headroom-*shaped*†: margin savings grow with {% katex() %}N{% end %}, cost side never priced | build once scale trajectory is clear, not before |
| Proposition 7 Knowledge layer | Proposition 7 itself: validates the gate, doesn't pass through it | Some parameter is always fixed somewhere | Genuinely undetermined, numerator priced four times, denominator never measured | defer until {% katex() %}C_{\text{workflow}}{% end %} is real |

† Neither exception's own numeric preconditions have actually been computed for these two rows: see below.

‡ The benefit side of this row's own {% katex() %}R \geq 3{% end %}x check borrows Proposition 0's 24.5% figure as an illustrative anchor, not a rigorously matched cost. That 24.5% prices a different mechanism entirely, misspecifying demand's distributional shape when computing {% katex() %}Q^*{% end %}, at Proposition 0's own 999:1 ratio, not what the redline itself avoids. What the redline actually prevents is the same existential failure the row above it names: a bridging window with no live signal to act on. Read strictly, this row's own benefit case belongs closer to Definition 2a's Existence Constraint than to a standard ROI ratio. The cost side, an EWMA update and a threshold check, is cheap enough that the distinction is unlikely to change the build decision. It would change it if someone tried to reuse this row's own citation as a template for a case where the answer isn't already this obvious.

*The Constraint Sequence Framework's formal decision function applied to all six mechanisms this post builds, plus the Knowledge layer that evaluates the others.*

Two entries are worth reading against each other, because they land on opposite sides of the same threshold for structurally different reasons. Both, on close inspection, are looser fits to their named category than the table alone suggests.

Fleet pooling's own Strategic Headroom label has the same gap as eviction's fragile-evidence label, for a different reason. The framework's own criteria are three specific numbers: current ROI between 1.0x and 3.0x, a scale multiplier past 2.5x, projected ROI past 5.0x. A ratio of *benefit to cost*, in both the current and future case. This series has only ever priced the benefit side: the margin-savings percentage falling from 9.7% toward a 3.89% floor as {% katex() %}N{% end %} grows. The cost side (what the routing layer and its own availability engineering actually costs to build and run) is explicitly unpriced, named as such earlier in this post. A shrinking required-margin percentage is not the same claim as a growing ROI ratio; the first is a real, computed trend, the second is what the Strategic Headroom label formally requires, and this post has priced the first while borrowing the label built for the second.

Collapsing either row into a flat "not yet" would still erase a real distinction the framework was built to preserve: eviction and fleet pooling fail the standard bar for genuinely different reasons, one evidentiary and one about scale timing. What neither row can honestly claim is that its named exception has been verified against the framework's own numeric preconditions, rather than invoked for its qualitative shape.

Eviction's own row is a looser fit, and worth being honest about exactly how loose. The framework's own fragile-evidence rule is a formal one. A Rosenbaum-bounds sensitivity value {% katex() %}\Gamma{% end %}, raising the bar to 5x specifically when {% katex() %}\Gamma < 1.5{% end %}, a computed number from a specific causal-inference technique. This post hasn't computed a {% katex() %}\Gamma{% end %} for Proposition 5b, and doing so would need exactly the kind of confounder-sensitivity data this series has never collected. What it has is a qualitative status this series has named consistently since Post 4: Proposition 5b's own desynchronization argument is structural, not proof-level: a real, if informal, proxy for "this evidence would not survive much scrutiny," in the same spirit the formal {% katex() %}\Gamma{% end %} threshold exists to catch. Using the raised 5x bar here is a reasonable application of the framework's own intent, not a rigorous instance of its own stated procedure. The same distinction this series has drawn everywhere else between a structural argument and a proof, applied here to the gate itself rather than to a mechanism the gate is evaluating.

The sixth row is the one this decision function can't fully close, and it's worth being honest about why. Proposition 7 is not a constraint being evaluated by the gate; it *is* the gate turned on this series' own machinery. Every other row above asks "does this mechanism clear {% katex() %}\theta{% end %}." Knowledge's own row asks whether the framework's own meta-constraint: the fact that running this analysis consumes the same engineering hours the analysis is trying to allocate, has been priced for this series' own Knowledge phase, and Post 6 already answered that it hasn't. {% katex() %}D(\text{Knowledge}, \mathcal{S}) = \text{defer}{% end %} isn't a weaker conclusion than the other five rows reach. It's the framework working correctly on a case where the honest answer is that the inputs don't exist yet.

{% mermaid() %}
graph TD
    C["Candidate c"] --> V{"Causal?"}
    V -->|"No"| INVESTIGATE["Strengthen<br/>proof first"]
    V -->|"Yes"| B{"Binding?"}
    B -->|"No"| SKIP["Not applicable<br/>here"]
    B -->|"Yes"| R{"R(c) ≥ θ?"}
    R -->|"No"| EXCEPT{"Exception<br/>applies?"}
    R -->|"Yes"| SEQ{"Predecessor<br/>binding?"}
    EXCEPT -->|"Yes"| SEQ
    EXCEPT -->|"No"| DEFER["Don't build yet"]
    SEQ -->|"Yes"| PRED["Defer"]
    SEQ -->|"No"| BUILD["Build →<br/>next mechanism in order"]

    style C fill:#e3f2fd
    style V fill:#fff3e0
    style B fill:#fff3e0
    style R fill:#fff3e0
    style EXCEPT fill:#fff3e0
    style SEQ fill:#fff3e0
    style BUILD fill:#c8e6c9
    style DEFER fill:#fff9c4
    style PRED fill:#fff9c4
    style SKIP fill:#ffe0b2
    style INVESTIGATE fill:#ffcdd2
{% end %}
*The decision function as an actual evaluation order: causal validation and binding status first, then the ROI bar and its exceptions, then the predecessor gate last.*

## Six Runbook Entries

A reader arriving at this section mid-incident, rather than mid-planning, wants the fastest path to the right entry, not the full argument above it. That path is short: identify which of the six mechanisms is actually firing (the alert names below are deliberately literal) read only that entry, and come back to the build-time sections once the incident is over. The entries assume the mechanism they describe is already built and running; they are not a substitute for building it in the first place.

Everything above is what gets built. A runbook, properly, is what a specific on-call engineer sees and does when one of these mechanisms actually fires: the part every earlier post in this series left implicit, having proven the mechanism correct rather than described operating it. Six entries, one per mechanism, in the same order as the sections above.

| Alert | First check | Action |
| :--- | :--- | :--- |
| Blood Oath's buffer occupied | Real load, or a {% katex() %}\pi_0{% end %} classifier bug? | Confirm scale-out is in flight: there is no other lever |
| Burst of demotion events | Does {% katex() %}H(t){% end %} itself fall too, or only {% katex() %}\dot{H}(t){% end %} spike? | Real surge: let it run. Noise: re-tune {% katex() %}\eta{% end %} |
| Multi-resource redline on GPU/I-O | First time this has fired on this resource? | Re-run the throughput-ceiling check against current traffic |
| Emergency eviction channel firing | One firing, or two-plus inside one {% katex() %}T_{\text{wait}}{% end %} window? | One: normal. Repeating: fall back to admission-refusal alone |
| Fleet pooling saving degraded | Is the router itself fresh and reachable? | Router health is the real alert here, not the arithmetic |

*Five alerts, one per mechanism that actually fires one: the sixth, the meta-constraint, has no alert by design, each with the single fastest diagnostic check to run before reacting.*

**Blood Oath's buffer.**

* **Alert:** reserved-margin slots ({% katex() %}H_{\min}{% end %}) are occupied.
* **Diagnostic:** there is nothing to free. Every task holding one of those slots is immortal by [Definition 1](/blog/no-safe-number-part1-blood-oath/#def-1)'s own property 2, so the action is diagnostic, not remedial. Check whether the heavy-task arrival rate has genuinely moved, or whether Definition 1b's own pre-classifier is misclassifying light tasks as heavy: check {% katex() %}\pi_0{% end %} against recent admissions the elapsed-time posterior later disagreed with.
* **Action:** classifier bug, fix {% katex() %}\pi_0{% end %}, not the margin. Real load: confirm [Proposition 2](/blog/no-safe-number-part2-provisioning-window/#prop-2)'s own scale-out trigger is actually in flight. It's already firing on the same signal, and there's no manual alternative to invent. Not in flight and still shrinking: escalate for capacity. Nothing in this series' own machinery has a lever here beyond "wait for scale-out" or "the buffer holds."

**The Physical Redline.**

* **Alert:** a burst of demotion events in a short window.
* **Diagnostic:** two structurally different causes produce the identical alert. Look at {% katex() %}H(t){% end %} itself over the same window, not just the derivative. A real surge shows both {% katex() %}H(t){% end %} and {% katex() %}\dot{H}(t){% end %} falling together. Noise-driven flapping (a single GC pause, an allocation burst) shows the derivative spiking while the raw level barely moves. A third, quieter pattern: demotions firing correctly, one at a time, but never resolving, headroom recovers, dips again, on a period shorter than {% katex() %}T_{\text{scale}}{% end %}.
* **Action:** real surge, let it run, it's the mechanism working. Noise, re-tune {% katex() %}\eta{% end %}, only after the {% katex() %}H(t){% end %} check confirms it, not before. The third pattern: check Proposition 2's own viability condition against the currently-measured {% katex() %}\alpha{% end %}. That's the scale-out trigger underperforming, not the redline needing retuning.

**Multi-resource redline.**

* **Alert:** Definition 4 firing on GPU or I/O pressure for the first time, not memory. Or: firing on memory while {% katex() %}\arg\min_r h_r(t){% end %} lands on memory every time, never GPU or I/O, across many separate incidents.
* **Diagnostic:** a first-time GPU/I-O trip is a leading indicator the traffic mix itself has shifted (longer contexts, a different prompt-to-output ratio), not an ordinary blip, since this specimen's own numbers keep those two resources comfortably clear at ordinary traffic. A persistent memory-only pattern is this specimen's own structural finding from Post 3 confirming itself in production.
* **Action:** do not restart the node. Re-run [Proposition 4b](/blog/no-safe-number-part3-bottleneck-moves/#prop-4b)'s own throughput-ceiling check against current traffic before assuming the old margins still hold. Post 3's own Model Scope already showed a longer-context mix can move the real exhaustion rate by tens of percentage points. For the persistent-memory case: trust Definition 4's own signal, don't search for a rotating cause that was never going to appear.

**Eviction and the emergency channel.**

* **Alert:** Proposition 5c's emergency channel firing.
* **Diagnostic:** one firing is unremarkable. It's what the mechanism is for. Page a human for two or more emergency waves inside one {% katex() %}T_{\text{wait}}{% end %} window, the concrete, checkable signature of the resonance risk Post 4's own Proposition 5b names as open and unproven.
* **Action:** single firing, resolves itself, no action needed. Repeating pattern, fall back, temporarily, to Definition 4's own admission-refusal alone, accepting reduced throughput, until someone checks whether the mixture-hazard risk Post 4's own Model Scope names as the series' single highest-priority gap is the actual cause. Don't tune the ranking rule live.

**Fleet pooling.**

* **Alert:** the pooling saving looks degraded, or {% katex() %}h_i(t){% end %} distribution looks off.
* **Diagnostic:** the real alert isn't in Proposition 6's own math. It's routing-layer health. A degraded or partitioned router doesn't fail loudly; it silently reverts the fleet toward siloed behavior. Three checkable signals: router freshness and availability directly; any single node whose own {% katex() %}h_i(t){% end %} stays low for an extended stretch while the fleet's own aggregate margin looks comfortable, Post 5's own cited fleet-planning research names this the "apparently idle fleet is actually broken" pattern; a disproportionate share of recent admissions landing on one or two nodes, Definition 6's sampled routing behaving like the naive argmax version it was built to avoid.
* **Action:** make router freshness and availability first-class alerts, not an assumption baked into Proposition 6's own arithmetic. For the low-{% katex() %}h_i(t){% end %} signal, check that node specifically, don't trust the aggregate to have already caught it. For the routing-skew signal, check whether the router's own sampling step is actually running, rather than assuming the imbalance reflects real per-node demand differences.

**A cross-cutting note before the sixth entry, since it doesn't fit any single mechanism.** More than one of the first five entries firing in the same incident window is itself a signal worth escalating past whatever the individual entries recommend, not because this series has proven the mechanisms interact badly, but because it has explicitly never proven they don't. "Building More Than One At Once," above, names this as open. An incident where the redline, the multi-resource check, and the eviction emergency channel are all active simultaneously is exactly the untested composition Post 6 flagged, live. The correct on-call posture is closer to careful manual observation than to trusting each mechanism's own individually-proven correctness to compose automatically.

**The meta-constraint.**

* **Alert:** none. This one doesn't fire, and that's the entry: there's no threshold-crossing event for "the adaptive machinery might not be worth its own cost," which is exactly why Post 6 found this gap survived five posts unnoticed.
* **Diagnostic:** not applicable. The absence of an alert is the finding.
* **Action:** a recurring review, not an alert, on a fixed cadence: how often has a live-adapted parameter actually been caught wrong, and what has the machinery actually cost to build and debug since the last review. Treat a review that never happens as the actual failure mode, not a false negative on a monitor that was never going to fire.

Six mechanisms, six engineering answers, and one honest closing note before the boundaries of this post's own advice: none of the above replaces the proofs it's built on. A team that builds Definition 2's redline without ever reading why Proposition A ruled out an algorithmic fix has built a mechanism it can't reason about when it eventually needs tuning past what this post's own numbers cover. The engineering answer is downstream of the proof, not a substitute for having understood it.

## The Question None of the Six Mechanisms Asked Out Loud

Every mechanism this post has walked through so far shares one architectural choice none of the six posts that built them ever argued for: decisions are made locally, by whichever node or dispatcher happens to be closest to the data, against whatever view of the world it currently has. Definition 4's redline reads its own node's telemetry. Definition 6 samples a handful of other nodes and pushes. Nowhere in this series does a single authority ever hold a complete, current picture of the whole fleet at once. That was never an oversight; Post 5's own Model Scope names the staleness this buys as a real, unresolved cost. But it was also never compared against the alternative on its own terms. This section does that comparison, the one Post 5 opened and deferred here.

### Finding the Right Row Before Reading All of Them

A team arriving here usually has a specific system in mind, not an abstract interest in scheduling theory: a duration budget, a placement-error cost, a control plane that either already exists or doesn't. The full comparison below answers "what does each point actually trade," in detail, for every entry. Before that, the faster path to the one or two entries that actually apply:

{% mermaid() %}
flowchart TD
    Q1{"Task duration sub-100ms,<br/>fixed overhead a real fraction of it?"}
    Q1 -->|"Yes"| Sparrow["Late Binding<br/>(Sparrow)"]
    Q1 -->|"No"| Q2{"Does a bad placement cost more<br/>than the delay needed to avoid one?"}
    Q2 -->|"Yes"| Q3{"Does more than raw headroom matter:<br/>cache locality, adapter affinity?"}
    Q3 -->|"Yes"| RichPush["Rich-Metric Push<br/>(Gateway API Inference Extension)"]
    Q3 -->|"No"| LazyPull["Lazy Pull<br/>(shared backlog)"]
    Q2 -->|"No"| Q4{"Is centralized control<br/>already justified for other reasons?"}
    Q4 -->|"No"| ThisSeries["Sampled Push<br/>(Definition 4 + 6 / Ray Serve)"]
    Q4 -->|"Yes"| Q5{"What does that centralization<br/>actually need to buy?"}
    Q5 -->|"Heterogeneous frameworks,<br/>one shared pool"| Mesos["Two-Level (Mesos)"]
    Q5 -->|"Tight bin-packing,<br/>strict priority preemption"| Borg["Monolithic (Borg)"]
    Q5 -->|"Many concurrent schedulers,<br/>extreme scale"| Omega["Shared State (Omega)"]
{% end %}
*A decision path through the same seven points the comparison below covers in full, built directly from each row's own "optimal regime" rather than a new criterion invented for this diagram. Every leaf is a starting row, not a final answer.*

**Reading the tree honestly, not as a verdict machine.** Real systems rarely land cleanly on one branch. A fleet with sub-100ms tasks and a bad-placement cost worth avoiding is a real, plausible combination. This tree resolves it in favor of whichever question comes first, not because the second stops mattering, but because this series has no data on how the two failure modes compound when both are true at once, the same category of unfinished-composition question Post 6 already named for its own machinery. Use the tree to find a starting row. Then read that row's own pros and cons below against every constraint your own system actually has, not only the one that got you there.

**Seven real points in the design space, not two.** "Centralized versus decentralized" understates how many genuinely different answers production systems give to the same problem. The axis that actually separates them isn't how centralized they are; it's what they trade for what.

A wide comparison table doesn't survive a narrow screen any better than a stale routing decision survives a correlated burst, so here it is as seven entries instead of seven table rows, each answering the same five questions in the same order.

**This series (Definition 4 + 6).** Same core algorithm real production LLM serving now runs by default: Ray Serve {{ cite(ref="12", title="Anyscale (2026) — Ray Serve: Advancing Flexibility with Async Inference, Custom Request Routing, and Custom Autoscaling") }}.

* **Information model:** sampled, deliberately stale.
* **Concurrency strategy:** decentralized, no coordination between decisions.
* **Placement latency:** not a latency cost at all. Admission is immediate; the risk is staleness, not delay.
* **Optimal regime:** heavy-tailed task durations, latency-sensitive admission, no existing central control plane.
* **Failure mode to protect against:** herding under a correlated burst arriving faster than telemetry refreshes.

**Late Binding.** Sparrow {{ cite(ref="13", title="Ousterhout, K., Wendell, P., Zaharia, M. & Stoica, I. (2013) — Sparrow: Distributed, Low Latency Scheduling") }}.

* **Information model:** sampled, resolved just-in-time at the worker.
* **Concurrency strategy:** decentralized, pull at claim time.
* **Placement latency:** measured, median under 9ms at 80% load, the paper's own reported figure.
* **Optimal regime:** very short tasks, where a centralized scheduler's own queueing delay would be a larger fraction of runtime than Sparrow's fixed probe/claim/cancel cost.
* **Failure mode to protect against:** reservation-queue buildup at a worker under sustained overload.

**Lazy Pull (shared backlog).** Real production instance: AWS ALB Target Optimizer {{ cite(ref="14", title="Amazon Web Services (2025) — Application Load Balancer Target Optimizer") }}.

* **Information model:** exact locally, lagging in aggregate. A node's own readiness is current the instant it checks; the backlog's own state is only as fresh as the last claim to clear it.
* **Concurrency strategy:** decentralized claim against a centralized backlog.
* **Placement latency:** not measured anywhere in this series, and not published by AWS either. Depends on backlog depth and index-lookup cost, neither priced.
* **Optimal regime:** multi-resource admission where a bad placement costs more than the queueing delay needed to avoid one. AWS's own launch names the identical regime: low-concurrency, compute-intensive targets, LLMs by name.
* **Failure mode to protect against:** lock contention on the shared index under a thundering herd of simultaneous claims; timeout burn while a task waits to be claimed.

**Rich-Metric Push.** Kubernetes Gateway API Inference Extension {{ cite(ref="15", title="Kubernetes (2025) — Introducing Gateway API Inference Extension") }}.

* **Information model:** not sampled, not stale by omission. Every backend reports KV-cache utilization, queue depth, and LoRA-adapter state via the ORCA standard, per-query or out-of-band.
* **Concurrency strategy:** decentralized backends, centralized cost-function evaluation at the gateway.
* **Placement latency:** not published as a single figure. The project's own regression-testing suite tracks it internally, not released as a headline number.
* **Optimal regime:** multi-signal admission where headroom alone (this series' own single fraction) isn't the only thing that matters. KV-cache reuse and adapter affinity change which node is actually cheapest to route to.
* **Failure mode to protect against:** cost-function staleness under the same telemetry lag this series already prices, now across three signals instead of one, an unpriced compounding this series has never checked.

**Monolithic.** Borg {{ cite(ref="1", title="Verma, A., Pedrosa, L., Korupolu, M., Oppenheimer, D., Tune, E. & Wilkes, J. (2015) — Large-Scale Cluster Management at Google with Borg") }}.

* **Information model:** fully centralized at the active primary.
* **Concurrency strategy:** pessimistic: one decider, full knowledge per decision.
* **Placement latency:** not reported as a single figure in the cited paper. The paper measures thread wait time under load, not per-decision placement latency.
* **Optimal regime:** tight bin-packing, strict priority preemption, placement errors that are expensive to reverse.
* **Failure mode to protect against:** USL's own β-coordination penalty at scale; a full decision outage during leader failover.

**Two-Level.** Mesos {{ cite(ref="16", title="Hindman, B., Konwinski, A., Zaharia, M., Ghodsi, A., Joseph, A.D., Katz, R., Shenker, S. & Stoica, I. (2011) — Mesos: A Platform for Fine-Grained Resource Sharing in the Data Center") }}.

* **Information model:** resource offers. The center deliberately knows less.
* **Concurrency strategy:** pessimistic, delegated to frameworks.
* **Placement latency:** not reported as a comparable figure in the cited paper.
* **Optimal regime:** heterogeneous frameworks sharing one physical pool.
* **Failure mode to protect against:** offer hoarding and framework starvation, both named in the paper's own evaluation.

**Shared State.** Omega {{ cite(ref="17", title="Schwarzkopf, M., Konwinski, A., Abd-El-Malek, M. & Wilkes, J. (2013) — Omega: Flexible, Scalable Schedulers for Large Compute Clusters") }}.

* **Information model:** centralized state, distributed decision logic.
* **Concurrency strategy:** optimistic: conflict detected, then retried, not avoided.
* **Placement latency:** relative, not absolute. The paper reports average job wait time comparable to an optimized monolithic scheduler; conflicts stay rare under real contention.
* **Optimal regime:** high-scale, many concurrent schedulers against one cell.
* **Failure mode to protect against:** transaction-conflict thrashing as contention rises, the paper's own named cost.

*Seven points in the centralization design space, including this series' own, each optimal for a different workload shape and each protecting against a different failure mode. Latency is real, verified, and comparable for exactly two entries; the rest either don't spend latency the same way or weren't measured in a comparable unit by their own source paper, stated as such rather than filled in with an invented number.*

None of the six real systems in that comparison made the same choice this series did, and none of them made the same choice as each other. That's worth sitting with before picking a favorite: there is no consensus answer in the literature this series is citing, which means the right answer is a function of the workload, not a fact about scheduling in general.

**This series' own row has a real production confirmation too, worth naming before the newer ones, and worth being precise about at exactly which layer.** Ray itself has a head node and a global control store, a real centralized component. Citing Ray Serve here without saying so would blur this comparison's own "no existing central control plane" claim. That centralized layer manages cluster membership and actor placement; it does not decide which replica serves a given incoming request. Ray Serve's own HTTP proxies make that decision locally, per request, and it's specifically that layer, not Ray's cluster manager, that uses power-of-two-choices as its default router: the identical algorithm Definition 6 builds on, chosen independently for the identical workload class, at the identical layer this comparison's own entry is actually about. That's the same kind of confirmation ALB Target Optimizer gives Lazy Pull below, applied to this series' own choice instead of the alternative: a real production LLM-serving system arrived at the same mechanism through its own engineering process, not by citing this series. Ray Serve doesn't stop there. It also supports custom routing that exploits vLLM's own prefix cache, sending a request to whichever replica already holds the matching prompt prefix when that's known: a refinement this series has never priced. Definition 6 samples on headroom alone, blind to whether a sampled node happens to already hold reusable KV-cache state for the specific request being routed. That's a real, unpriced gap this post is naming rather than closing, the same discipline applied to every other entry in this comparison.

**Sparrow's own paper already measured what a placement constraint like that one costs a sampling-based router, in a different domain, and the number is worth citing rather than left implicit.** Batch sampling's own advantage, pooling load information across every task in a job before placing any of them, depends on every sampled node being an equally valid candidate for every task. A per-task constraint (Sparrow's own example is a task that must run where its input data already lives) breaks that: each constrained task has its own, smaller candidate set, so Sparrow falls back to probing per task rather than as a batch, losing the pooling advantage for exactly the tasks that carry the constraint. Sparrow's own measurement of that fallback is a real, bounded cost, not a collapse: a median scheduling delay of 7ms for unconstrained stages against 14ms for constrained ones, in the same TPC-H workload the paper's own 9ms headline figure comes from {{ cite(ref="13", title="Ousterhout, K., Wendell, P., Zaharia, M. & Stoica, I. (2013) — Sparrow: Distributed, Low Latency Scheduling") }}. A KV-cache-aware version of Definition 6 would carry the same shape of cost: whatever pooling advantage {% katex() %}d=2{% end %} sampling gets from treating every sampled node as interchangeable narrows the moment cache locality makes some nodes better candidates than others for a specific request. Sparrow's own number says that cost is real but small in its domain, not that it transfers unchanged to this one; this series has never measured its own version of it.

**A real production system now confirms this post's own Lazy Pull row wasn't a hypothetical. It's worth being precise about exactly how much that confirms.** AWS launched ALB Target Optimizer in November 2025: an agent on each target, a control channel to the load balancer, and a pull-based claim model explicitly replacing push, for exactly the workload class this series has been building for. AWS's own description names compute-intensive, low-concurrency applications and large language models specifically. That's a genuine, independent validation of the architectural move this post's own Lazy Pull row makes: a target that only receives work once it has declared itself ready removes the retry-storm risk push-based sampling creates, by the same construction this post already argued for.

**What that validates, stated precisely.** The shape is confirmed: a pull-based claim, decentralized to the target, avoiding a router's own stale view. The workload match is confirmed: AWS's own launch materials target the identical regime this series prices, not a generic web-service load-balancing case. Both are real, and neither was obvious before a major cloud vendor shipped the same answer independently.

**What isn't confirmed, and shouldn't be assumed just because a real vendor shipped it.** Every other system above earned its place from a peer-reviewed paper with an independent evaluation, including its own honestly reported failure mode: Borg's own failover gap, Omega's own conflict-thrashing cost, Mesos's own offer hoarding, Sparrow's own measured 9ms and its own reservation-queue-buildup risk. ALB Target Optimizer has a launch announcement and a conference talk, both vendor-authored, neither structured as an independent evaluation. No published number characterizes how its own control-channel coordination cost scales with target-group size, whether it degrades under a correlated burst the way this post's own Model Scope already flags for Lazy Pull generally, or what its own analogue to Sparrow's reservation-queue-buildup failure mode actually is. "A major cloud vendor built and shipped this" is real evidence the architecture works well enough for production traffic at whatever scale AWS's own target groups typically run. It is not the same claim as "this architecture's own coordination cost is linear," and nothing published supports the stronger claim.

**Compared against the other six points, pros and cons rather than a verdict.**

* **Against this series' own push design (Definition 4 + 6):** trades staleness risk for a different cost. This series' own herding failure mode, routing to a node whose headroom looked comfortable a moment ago, can't happen under a pull model by construction, the same property this post's own Lazy Pull row already claims. What it costs instead: a per-target agent and a control channel neither this series' own push design nor AWS's own classic round-robin and least-outstanding-requests algorithms need.
* **Against Sparrow's own late binding:** both are pull-shaped, but Sparrow's own probe/claim/cancel cycle happens per admission, with a published, measured cost, under 9ms. ALB Target Optimizer's own claim signal is closer to a standing readiness declaration than a per-task probe, cheaper in principle, unmeasured in practice.
* **Against Borg's own monolithic decider:** avoids Borg's own single-decider bottleneck and its own failover gap entirely; there's no single primary whose crash creates a window where a retry can't be told apart from a fresh request. What it doesn't get: Borg's own decade-plus of published operational experience at extreme scale, including its own honestly-reported failure modes, which a feature under a year old at this writing hasn't had the same real-world adversarial testing to surface yet.
* **Against Omega's own optimistic concurrency:** avoids Omega's own conflict-thrashing cost, since a target claims once and there's no second claimant to conflict with by construction, not by retry. Omega's own published number, job wait time comparable to an optimized monolithic scheduler, has no published analogue here to compare against.
* **Against Mesos's own resource offers:** structurally similar in spirit, both invert control toward the resource holder rather than a central decider, but Mesos's own offers are resource slices a framework accepts or rejects; ALB Target Optimizer's own claims are binary readiness signals under a concurrency cap, a narrower vocabulary that doesn't need Mesos's own DRF-based offer allocation underneath it.
* **Against the Gateway API Inference Extension's own rich-metric push:** both are push, both decentralize the underlying state to the backend, but this series' own Definition 6 routes on one signal and the Kubernetes project routes on three, standardized over ORCA rather than this series' own ad hoc headroom fraction. What this series gets in exchange for the simpler signal: a smaller, easier-to-reason-about staleness surface, one number to go stale instead of three compounding.

> **Physical translation.** A real vendor shipping the same architecture this post already argued for is a meaningfully stronger signal than the post's own reasoning alone, worth taking seriously rather than treating as coincidental. It is not a substitute for the kind of independent, adversarial evaluation every academic system in this comparison already has behind it. Citing ALB Target Optimizer as confirmation that Lazy Pull is a real, viable design is honest. Citing it as proof the design scales for free would not be, and this post declines to make that claim on AWS's behalf.

**A third real system names a gap this post's own comparison hasn't priced anywhere else: what happens once a router has more than one signal to route on.** The Kubernetes Gateway API Inference Extension is an open-source, vendor-neutral project under kubernetes-sigs, backing Google's own GKE Inference Gateway. It extends push routing rather than replacing it: an "endpoint picker" evaluates a cost function over KV-cache utilization, queue depth, and active LoRA-adapter state, reported by each backend over the ORCA standard (Open Request Cost Aggregation, a real, adopted gRPC and Envoy specification, not a project-specific invention). It then routes to whichever backend that cost function favors. This is architecturally still push: the router decides, not the target. But it's a richer push than Definition 6's own single headroom fraction: three signals instead of one, standardized transport instead of an ad hoc one.

**What's confirmed.** The project is real, open source, and its own primary source, the official kubernetes.io announcement, reports a genuine benchmark: lower p90 latency at higher request rates (500+ QPS) and throughput roughly on par with a standard Kubernetes Service, its own words, not a third party's paraphrase. Worth flagging precisely because other sources repeating this result inflate it to "3x time-to-first-token, doubled throughput," a figure that doesn't trace cleanly back to the project's own primary announcement. This post cites the modest, precisely-stated primary claim, not the more dramatic secondary one, the same discipline applied to every other benchmark number in this series.

**What isn't confirmed.** Whether the endpoint picker evaluates every backend's own cost function exactly, or samples a subset the way Definition 6 does, isn't stated in the sources this post has checked. That's not a small gap: it's exactly the question this post's own {% katex() %}d{% end %}-sampling design turns on, and without an answer, this row's own coordination cost at large fleet sizes is as unverified as ALB Target Optimizer's.

**The gap it actually names, worth carrying back into this series' own machinery rather than treating as someone else's problem.** Definition 6 routes on one number, aggregate headroom. A real fleet serving disaggregated prefill/decode, the exact architecture Post 3 built this series around, has KV-cache locality as a second, independent signal: routing a request to a node that doesn't hold its prompt's own cached prefix costs a real, avoidable recompute, the same class of cost Ray Serve's own prefix-cache routing (named above) exists to avoid. This series has never priced that gap. A production system built for the identical architecture already has, and its own answer is to route on more than headroom.

**Two real dimensions this comparison doesn't cover, worth naming rather than silently omitting.** First, fairness and priority policy: this comparison is entirely about *where* a placement decision is made and *how stale* the information behind it is, not about *what order* competing tasks get served in once several are ready at once. A deadline-aware policy (earliest-due-time first, the way real batch schedulers often work) is orthogonal to every entry above: Borg's own priority-and-preemption tiers, or a proportional-share policy like DRF, could in principle sit on top of any of these six architectures, centralized or not. This series has never checked whether a due-time-based policy composes cleanly with a decentralized, sampled information model the way it does with Borg's own centralized queue. Second, transport: every entry's own latency, where a real number exists, already includes whatever RPC mechanism the source paper actually used, not a mechanism this series chose or optimized. Whether a faster transport (an async, zero-copy RPC path rather than a general-purpose framework) would move Sparrow's own 9ms meaningfully, or whether 9ms is dominated by scheduling logic rather than the wire, is a question about that implementation, not about the architecture this comparison covers. Both are real, open questions this comparison doesn't answer, not because they don't matter, but because answering them honestly needs inputs (a specific fairness policy, a specific transport stack) this post doesn't have.

### Single Point of Execution

A design with exactly one authority deciding (Borg's own active primary, or a hypothetical fully centralized version of Definition 6) buys something real and provable, and it's worth being precise about exactly what: zero *decision-staleness*, by construction, since there is no second, concurrently-computed decision for any one decision to have diverged from, the specific failure mode Definition 6's own sampled routing exists to bound rather than eliminate. It does not buy zero *state-staleness*. The primary's own knowledge of a given node's real headroom is still exactly as old as the propagation delay from that node to the primary, the same physical quantity this series has called {% katex() %}\Delta{% end %} everywhere else it appears. Centralizing removes the herding failure mode a stale *shared* snapshot creates when several decisions race off it concurrently; it does nothing to make the primary's own view of physical reality arrive any faster. It also buys a throughput ceiling this series has already derived once, for a much smaller claim. Post 5's own Universal Scalability Law critique of the *router*: coordination overhead growing quadratically in {% katex() %}N{% end %} where raw contention only grows linearly, applies with full force to a single decider handling *every* admission and every redline check fleet-wide, not just routing. A design that serializes every decision through one process doesn't merely have a bottleneck; the bottleneck's own cost grows faster than the fleet it's coordinating, exactly USL's own prediction. Past some fleet size the marginal node makes the system slower to decide, not faster to run.

### The Sharing Problem

A single authority is only as good as its view of the fleet. Getting that view costs something this series has already priced once and not paid yet, for a smaller version of the same question. Post 6's own telemetry-transport paragraph established that fine-grained per-task state ({% katex() %}m(t){% end %}, {% katex() %}S(t){% end %}) stays node-local by design in this series' current architecture, with only one aggregate number per node ever leaving it. A single central authority making placement decisions needs more than that aggregate: Borg's own primary needs enough detail to bin-pack correctly, which means the {% katex() %}O(N){% end %} channel this series already has isn't sufficient. It needs something closer to the {% katex() %}O(N \cdot M){% end %} channel Post 6 explicitly avoided, paid continuously, not as a one-time build cost. Omega's own answer (shared state, no single reader, optimistic retry instead of a serialized queue) sidesteps the single-decider bottleneck above but doesn't reduce this cost; it just removes the requirement that one process ingest it all sequentially. Mesos's answer is different in kind, not degree: the center deliberately never sees enough to need the full picture, offering coarse resource slices and letting frameworks decide with their own, better-informed view: trading placement optimality for a genuinely smaller sharing problem.

**Worth being precise about what Omega's optimism actually is, before naming an eighth point in this design space rather than folding it into one of the seven already named.** Omega's own concurrency strategy is optimistic *concurrency control*. A scheduler computes a placement against a snapshot of shared state, then attempts to commit; a conflicting concurrent commit is detected and the loser retries. That's conflict-then-retry, not conflict-avoidance. It's a genuinely different mechanism from a *conflict-free* replicated data type {{ cite(ref="18", title="Shapiro, M., Preguiça, N., Baquero, C. & Zawirski, M. (2011) — Conflict-Free Replicated Data Types") }}, where updates are constructed so that any two replicas' states merge to the same result regardless of order: no detection, no retry, because the underlying data structure's own operations commute by construction. For state that fits that shape (a monotonically-growing set of claimed slots, a grow-only counter of admitted tasks) a CRDT-backed shared state pays no conflict cost at all, at the cost of only supporting operations that actually do commute. A genuine "two schedulers both want this exact GPU" conflict doesn't commute, no matter which data type holds it. It still needs Omega's own retry or a real consensus round underneath. This isn't a description of how Omega works. It's an eighth, distinct point Omega's own architecture doesn't occupy: coordination-free for the fraction of scheduling state that's genuinely commutative, falling back to Omega-style optimistic retry or Borg-style consensus only for the fraction that isn't. Whether a real fleet's own scheduling state splits cleanly enough along that line to be worth building two coordination mechanisms instead of one is exactly the kind of question this post's own Meta-Constraint discipline says shouldn't be answered without a real deployment's own state-access pattern in hand.

### Primary-Secondary, for Scheduling and for Queuing Separately

These are two different problems this series has never had to distinguish, because it has neither today. **Scheduling** is the placement decision (which node runs this task) the thing Definition 6 already does, locally. **Queuing** is holding admitted-but-not-yet-placed work until a decision can be made. A backlog this series' architecture has never needed, because Definition 6 places every admission immediately, at arrival, against whichever {% katex() %}d{% end %} nodes it sampled. A centralized redesign reintroduces both, and each has its own primary-secondary failure shape.

For **scheduling**, a single active decider needs replicas for availability (Borg's own Paxos-replicated primary is the standard answer). That buys survivability at the cost of a real gap during failover: no scheduling decisions happen at all while a new leader is being elected. Post 5's own CAP-theorem paragraph already named this exact tradeoff for the *router* specifically (block admissions during a partition, or fall back to local, possibly-stale decisions) and a fully centralized scheduler inherits the same choice, now for every admission fleet-wide, not just the routing layer's own slice of it.

The failure that matters here isn't the crash itself. Quorum replication already handles a clean crash: whatever was durably committed survives, and a new leader can resume from it. The gap sits one step later, in the narrow window *after* replication reaches quorum but *before* the client receives the acknowledgment:

{% mermaid() %}
sequenceDiagram
    participant N as Node (client)
    participant L as Leader
    participant Q as Quorum
    N->>L: Admission request
    L->>Q: Replicate decision
    Q-->>L: Quorum ack: decision is durable
    Note over L: Leader crashes here,<br/>before the ack reaches N
    Note over N: Request times out.<br/>Decision is durable, but N has no way to know that.
    N->>L: Retry, against the new leader
    Note over N,L: New leader cannot tell a fresh<br/>request from a retry of one already committed
    alt Treated as new
        Note over N: Double-scheduled: same task placed on two nodes
    else Treated as a duplicate
        Note over N: Silently dropped: the committed decision is never delivered
    end
{% end %}
*The decision is durable before the client is told so. A retry across that gap cannot be told apart from a fresh request, so it resolves to one of two silent failures: the same task placed twice, or a completed decision never delivered.*

The decision is durable. The client doesn't know that: from its side, the request timed out, indistinguishable from never having landed at all. A reasonable retry against the new leader is what creates the risk, not a protocol bug: the new leader has no way to tell "this is a fresh request" from "this is a retry of something that already committed." Retry and the task may be double-scheduled, placed on two nodes, each unaware of the other, an at-least-once outcome this series has never needed because it has no single decider whose acknowledgment a client can miss. Don't retry, treating the timeout as a failure, and a request that actually succeeded gets abandoned, an at-most-once outcome with the same silent signature: a client that believes nothing started, and no entry anywhere saying otherwise. Every one of this series' own six mechanisms today avoids this problem by construction, the same way Definition 4 avoids the eviction instability Ao et al.'s own paper proves for a different mechanism entirely. There's no acknowledgment boundary to lose a client's certainty across, because there's no single decider issuing one.

For **queuing** specifically. A backlog of admitted work waiting for a placement decision, which a centralized redesign would need if the single decider can't keep up with arrival rate. The primary-secondary problem is different in shape: it's not "did the decision survive," it's "did the *queue itself* survive with its ordering and contents intact." A replicated queue's own standby has to agree with the leader on exactly what's queued and in what order, which is a harder consistency problem than replicating a stream of already-made decisions, because the queue's own state changes on every enqueue and dequeue, not just on committed outcomes. Kafka's own partition-leader model and Sidekiq-style broker replication both solve this in production, but neither is free: both pay a real write-latency cost for durability before acknowledging an enqueue, the queuing equivalent of Borg's own pre-commit replication cost for a scheduling decision.

> **Physical translation.** Every one of this series' own mechanisms today sidesteps both of these problems by never having a single log to lose in the first place: Definition 4's redline is per-node, stateless across nodes; Definition 6's routing decision, once made, is never revisited by a second authority. That's not an oversight this series is now correcting. It's the actual reason the decentralized design was defensible from Post 3 onward, stated precisely rather than assumed: centralizing buys staleness immunity for the price of a failure mode (the gap during failover, and the double-scheduling or silent-drop risk at the boundary of it) that a design with no single decider structurally cannot have, because there is nothing playing the single decider's role for a failure to catch mid-decision.

### Where This Actually Lands

Not neutral, and not a flat verdict either. The honest answer is conditional, and the condition is checkable against two axes, not one. The first axis is the comparison's own: how expensive is a suboptimal placement, and how much does the decision's own overhead matter relative to how often it's made. Architectures built for high-throughput, low-stakes-per-decision regimes (this series' own design, Sparrow) trade placement optimality for near-zero coordination cost; architectures built for expensive-to-reverse decisions (Borg, Omega) pay real coordination cost to avoid a bad placement in the first place. That's the generic version of the tradeoff, and it's real. But a generic axis alone would let this post land on "it depends" without ever committing to a checkable claim, exactly the kind of unfounded-precision-avoidance this series has repeatedly caught itself doing the *opposite* of elsewhere. The second axis is this series' own specimen, and it resolves the generic tradeoff to a specific answer rather than leaving it abstract.

For the specific workload this series defines: admission-time decisions on tasks that lock to a node once running, latency-sensitive at the moment of admission, with no existing centralized coordination infrastructure to amortize the cost against, the decentralized design this series built, or Sparrow's own late-binding refinement of it, dominates a fully centralized alternative. The staleness a centralized design would remove is bounded and partially mitigated already ({% katex() %}d=2{% end %} sampling, {% katex() %}\eta{% end %}-smoothed telemetry), while the failover gap and the sharing cost a centralized design would introduce are real, currently-nonzero costs this series has no machinery to absorb today. That verdict flips, and flips cleanly, under a condition worth stating rather than leaving implicit: a deployment where correlated, fast-arriving bursts are frequent enough that the staleness-driven herding Post 5's Model Scope names is a recurring, measured incident cost (not a theoretical one), and where centralized coordination infrastructure already exists for other reasons (a Borg-style or Kubernetes-style control plane already running the rest of the fleet). In that case the marginal cost of adding scheduling to it is close to zero, rather than the full cost of building it from nothing. That second condition is exactly what pulls this specimen toward the "expensive-to-reverse" regime named above, despite its own placement errors being individually cheap. It isn't the cost of one bad placement that flips the verdict; it's the *amortized* infrastructure cost dropping to near zero once a control plane already exists for other reasons.

Post 6's own Meta-Constraint ROI test names exactly the two numbers that condition turns on (incident frequency and marginal infrastructure cost) and this post cannot supply either one for a reader's own deployment, for the same reason it couldn't supply {% katex() %}C_{\text{workflow}}{% end %} for Knowledge. What it can supply is the condition itself, stated precisely enough to check.

## Model Scope and Failure Envelope

| Assumption | What it doesn't cover | What to check instead |
| :--- | :--- | :--- |
| A team is starting close to a clean slate | Migrating an existing system with ad hoc eviction already in place | Reconcile or replace what's already there before inserting Definition 4 underneath it |
| Every real system cited (Dynamo, Chiron, QLM, Arrow, HeteroScale...) works as described | None re-verified here, only inherited from the posts that first cited them | Check each project's current state directly before a build-vs-adopt decision |
| The build order avoids Post 6's own composition gap | Only the one concrete failure mode this post could name, not "compose safely in general" | Treat the composition question as open, not closed |
| The dependency order is also a pacing guide | How long each stage actually takes, or how much can parallelize | Sequence is a real constraint; timing is a team-specific unknown |
| This post's reused cost figures transfer | A different model, different hardware, a different traffic mix | Re-derive each number against real measurements before trusting the comparison |

*Five assumption boundaries this post's own engineering answers depend on, matching the five paragraphs below.*

**This post's own build order assumes a team starting close to a clean slate, and most real teams aren't.** A system that already has ad hoc eviction (LRU, size-based, something built years before this series existed) doesn't get to insert Definition 4's redline underneath it for free; the existing eviction logic needs to be reconciled with, or replaced by, Proposition 5's own trigger before Proposition 5c's emergency channel means what this post says it means. This post's own dependency graph describes what a new build needs, in what order. A migration of an existing system is a different, harder problem this post doesn't address. Treating the two as the same task is the most likely way this post's own guidance gets misapplied.

**This post's own engineering answers are as good as the citations and numbers behind them, and no better. It hasn't independently verified any of the real systems named above beyond what Posts 2 through 5 already checked.** Dynamo, the vLLM Router, Chiron, QLM, inference-fleet-sim, Arrow, HeteroScale: every claim about what these systems do or cost is inherited from the post that first cited them, not re-verified here. A team evaluating any of them as a build-vs-adopt decision should check the current state of each project directly, not treat this post's summary as a substitute for that check.

**The composition-safety gap Post 6 named is restated here as a build order, not closed as a verified result.** An order that avoids the one concrete failure mode this post could name (Proposition 6b's own already-diverged-node gap) is not the same claim as "these mechanisms compose safely in general." Whether Proposition 6's own pooling math, Proposition 5's own eviction crossover, and Definition 4's own per-resource redline remain individually correct once genuinely running together, under real production load, at the same time, is exactly as open after this post as it was after Post 6.

**The build order in "Building More Than One At Once" is a dependency ordering, not a timeline this post has validated against real engineering throughput.** It states correctly that eviction needs the redline live before it can fire against a real trigger, and that fleet pooling needs eviction live before Proposition 6b's own boundary is survivable. It says nothing about how long each stage actually takes for a specific team, how much can be parallelized once the dependency is satisfied rather than strictly sequenced, or whether a team with an existing system already has some of these stages half-built in an order this post's own clean sequence doesn't anticipate. The ordering is a real constraint; the pacing is not this post's to specify.

**Every cost figure reused in this post is inherited from its originating post's own specimen, and none of it has been re-priced against a different one.** A team with a different model, different hardware, a different traffic mix should re-derive the underlying numbers: Post 3's own {% katex() %}9.7\%{% end %}, Post 4's own {% katex() %}\$0.50{% end %} relocation cost, Post 5's own {% katex() %}\beta\approx1.9{% end %}, against their own measurements before trusting this post's own engineering-cost comparisons, the same instruction every earlier post in this series has given about its own numbers.

**Compute it, one more time, on the whole series rather than any single post.** Before building any of the six mechanisms above, check which failure this series actually proved your own system has. Not all six problems necessarily apply.

* **Does your workload actually have all three Blood Oath properties, or only some?** Post 1's own "Compute it" checklist already answers this.
* **Is a single resource actually the binding one, or does Post 3's own multi-resource check apply?**
* **Does your population include anything checkpointable, or is Post 4's eviction machinery solving a problem you don't have?**
* **Do you run more than one node, and if so, does a real routing layer already exist** to make Proposition 6's own pooling saving real rather than theoretical?
* **Before building any adaptive version of any of the above, has anyone actually measured what the static version gets wrong**, and what building and running the adaptive version would cost to find out? If the answer is no, that measurement (not the adaptive machinery itself) is the actual next engineering task.

None of these questions has a universal right answer, and that's the actual point of asking them as a checklist rather than answering them as a recommendation. A team running a single node with light traffic has no business building Definition 6's fleet-pooling coordination layer, whatever this post's own worked numbers say about its savings at scale: there's no fleet to pool. A team running Blood Oath's own exact workload, with no checkpointing infrastructure anywhere in reach, has no business skipping straight to Proposition 5's eviction machinery. There's no relocatable state to evict. The six mechanisms in this post are not a stack every deployment climbs in order. They're six independent answers to six independent questions, and the only mistake this post is actually warning against is building one of them without first checking that its own question is the one a given system actually has.

## Nomenclature, Assembled Across This Series

This series accumulated roughly thirty symbols across six prior posts, reused on different clocks, for different mechanisms. This table exists for the moment a symbol looks familiar from an earlier post but its exact scale doesn't: a reference to check against now that everything in it has actually been defined, not a preview of what's coming.

<details>
<summary>Full symbol reference, grouped by domain, with the post that defines each one</summary>

**Capacity and demand**

| Symbol | Meaning | Defined in |
| :--- | :--- | :--- |
| {% katex() %}Q{% end %} | a provisioned capacity number | Post 1 |
| {% katex() %}Q^*{% end %} | the true, correctly-specified optimal capacity | Post 1 |
| {% katex() %}C_u, C_o{% end %} | underage cost, overage cost | Post 1 |

**Workload shape**

| Symbol | Meaning | Defined in |
| :--- | :--- | :--- |
| {% katex() %}\alpha{% end %} | Pareto tail index (lower is heavier) | Post 1 |
| {% katex() %}x_m{% end %} | Pareto minimum (scale parameter) | Post 1 |
| {% katex() %}\lambda_h{% end %} | heavy-task arrival rate | Post 1 |
| {% katex() %}E[S_h]{% end %}, {% katex() %}S_h{% end %} | mean heavy-task holding time, and the duration random variable itself | Post 1 |
| {% katex() %}t^*{% end %} | crossover time: when the elapsed-time posterior overtakes a fixed classifier | Post 1, Definition 1b |
| {% katex() %}\sigma{% end %} | per-second growth rate of an accumulating resource (KV-cache, memory) | Post 3 |
| {% katex() %}L{% end %} (Proposition A's worked example) | the adversary's own inflated job length, made arbitrarily large to prove no competitive ratio exists | Post 1 |
| {% katex() %}L{% end %} (truncation ceiling) | a hard, enforced upper bound on task duration {% katex() %}S_r{% end %}, opposite role from Post 1's own {% katex() %}L{% end %}: a bound, not an unbounded construct | Post 3, Post 4 |
| {% katex() %}L{% end %} (attention-cost ratio) | transformer layer count (80, for this specimen's model): unrelated to either duration use above | Post 3, Model Scope |

*{% katex() %}L{% end %} carries three unrelated meanings across this series: an adversarial construct that grows without bound (Post 1), a real system's hard ceiling on how large a duration is allowed to get (Posts 3-4, nearly the opposite role), and a model-architecture layer count with no time dimension at all (Post 3's own attention formula). All three are real, correctly used within their own context; none of them transfer to another.*

**The physical control loop**

| Symbol | Meaning | Defined in |
| :--- | :--- | :--- |
| {% katex() %}H(t), \dot{H}(t){% end %} | physical headroom, and its derivative | Post 2, [Definition 2](/blog/no-safe-number-part2-provisioning-window/#def-2) |
| {% katex() %}\hat{H}(t){% end %} | EWMA-smoothed headroom | Post 2 |
| {% katex() %}\eta{% end %} | the redline's own EWMA smoothing constant | Post 2 |
| {% katex() %}H_{\min}{% end %} | reserved margin / redline threshold | Post 2 |
| {% katex() %}T_{\text{scale}}{% end %} | autoscaling bridging window (cold-boot latency) | Post 2 |
| {% katex() %}G{% end %} | bridging-window heavy-arrival count | Post 2, [Definition 2a](/blog/no-safe-number-part2-provisioning-window/#def-2a) |
| {% katex() %}\hat{\lambda}, \beta{% end %} | Knowledge phase's own EWMA estimate of arrival rate, and its learning rate: distinct clock from {% katex() %}\eta{% end %} | Post 2 |
| {% katex() %}\beta{% end %} (unrelated second use) | Post 5 reuses {% katex() %}\beta{% end %} for the square-root staffing law's own excess-reserve coefficient, see Fleet and routing below: not a learning rate, not this post's own {% katex() %}\beta{% end %} | Post 5 |
| {% katex() %}\tau(\eta){% end %} | the redline's own EWMA settling time, {% katex() %}\approx-1/\ln(1-\eta){% end %} | Post 2 |
| {% katex() %}\tau_\beta{% end %} | Knowledge phase's own settling time, same formula applied to {% katex() %}\beta{% end %}, measured in bridging windows rather than seconds | Post 2 |
| {% katex() %}k{% end %} (Hill estimator) | number of extreme order statistics the tail-index estimate is fit against, not a sample size | Post 2, Model Scope |

*Three different {% katex() %}\tau{% end %} symbols appear in this series, none of them the same quantity: {% katex() %}\tau(\eta){% end %} and {% katex() %}\tau_\beta{% end %} above are settling times, on two different clocks, for two different EWMAs. The unsubscripted {% katex() %}\tau{% end %} under Meta-constraint below is unrelated to either: a Return-on-Investment floor, not a time constant. Check which post a given {% katex() %}\tau{% end %} came from before assuming it's one of the other two. {% katex() %}k{% end %} has a second, unrelated meaning under Eviction below: a count of concurrent relocations, not a count of extreme observations.*

**Multi-resource**

| Symbol | Meaning | Defined in |
| :--- | :--- | :--- |
| {% katex() %}C_r{% end %} | capacity of resource {% katex() %}r{% end %} (GPU, memory, I/O) | Post 3, [Definition 4](/blog/no-safe-number-part3-bottleneck-moves/#def-4) |
| {% katex() %}h_r(t){% end %} | normalized headroom fraction for resource {% katex() %}r{% end %} | Post 3, Definition 4 |
| {% katex() %}P{% end %} (in {% katex() %}M(A) = P + \sigma A{% end %}) | the fixed prompt-cache memory component, in GB | Post 3, [Proposition 4](/blog/no-safe-number-part3-bottleneck-moves/#prop-4) |
| {% katex() %}P{% end %} (in the attention-cost ratio) | prompt length, in tokens: the same letter, a different quantity, used in a separate part of the same post | Post 3, Model Scope |
| {% katex() %}N{% end %} (in the attention-cost ratio) | parameter count, 70 billion for this specimen's model: unrelated to Post 5's own {% katex() %}N{% end %}, fleet size, a small integer | Post 3, Model Scope |

*Post 3 uses {% katex() %}P{% end %} for two different quantities in two separate sections: a memory size in one, a token count in the other. It also reuses {% katex() %}N{% end %}, already claimed below by Post 5 for fleet size, for a parameter count instead. Neither usage is wrong on its own; check which post and which formula a given {% katex() %}P{% end %} or {% katex() %}N{% end %} sits inside before assuming it carries meaning from elsewhere.*

**Eviction**

| Symbol | Meaning | Defined in |
| :--- | :--- | :--- |
| {% katex() %}S(t){% end %} | a task's own accumulated state (footprint) at elapsed time {% katex() %}t{% end %} | Post 4 |
| {% katex() %}V(t){% end %} | eviction value: opportunity cost saved minus eviction cost | Post 4, [Proposition 5](/blog/asymptotically-ruined-part4-eviction-crossover/#prop-5) |
| {% katex() %}c_{\text{opp}}, c_0{% end %} | opportunity-cost rate, fixed relocation overhead | Post 4 |
| {% katex() %}\delta_0, B{% end %} | control-plane overhead per eviction, transfer bandwidth | Post 4 |
| {% katex() %}T_{\text{OOM}}(t), T_{\text{wait}}(t){% end %} | time until out-of-memory, time until the slowest pending transfer completes | Post 4, [Proposition 5c](/blog/asymptotically-ruined-part4-eviction-crossover/#prop-5c) |
| {% katex() %}k{% end %} (concurrent evictions) | number of relocations sharing the link bandwidth at once, unrelated to Post 2's own {% katex() %}k{% end %}, a count of extreme observations | Post 4 |

**Fleet and routing**

| Symbol | Meaning | Defined in |
| :--- | :--- | :--- |
| {% katex() %}N{% end %} | fleet size (node count) | Post 5 |
| {% katex() %}\beta{% end %} (square-root staffing) | the excess-reserve coefficient in {% katex() %}\beta\sqrt{\text{offered load}}{% end %}, converging to {% katex() %}\approx1.9{% end %}: unrelated to Post 2's own {% katex() %}\beta{% end %}, Knowledge's own learning rate | Post 5 |
| {% katex() %}G_N{% end %} | fleet-wide bridging-window arrival count | Post 5, [Proposition 6](/blog/asymptotically-ruined-part5-square-root-routing/#prop-6) |
| {% katex() %}H_{\min}^{\text{fleet}}{% end %} | pooled fleet-wide reserve | Post 5, Proposition 6 |
| {% katex() %}d{% end %} | nodes sampled per routing decision | Post 5, [Definition 6](/blog/asymptotically-ruined-part5-square-root-routing/#def-6) |
| {% katex() %}\Delta{% end %} | router's own reaction latency / staleness interval | Post 5 |
| {% katex() %}\alpha{% end %} (Universal Scalability Law) | USL's own contention coefficient in {% katex() %}C(N) = N/(1+\alpha(N-1)+\beta N(N-1)){% end %}: unrelated to this series' own Pareto tail index, also {% katex() %}\alpha{% end %}, also used on the same page | Post 5 |
| {% katex() %}\beta{% end %} (Universal Scalability Law, third use) | USL's own coherency-cost coefficient in the same formula, growing quadratically in {% katex() %}N{% end %}: a third, distinct {% katex() %}\beta{% end %}, neither Post 2's learning rate nor Post 5's own square-root-staffing coefficient above | Post 5 |

*Post 5 is the one page in this series where {% katex() %}\alpha{% end %} carries two live meanings at once: this specimen's own Pareto tail index, {% katex() %}2.2{% end %} throughout, and USL's own contention coefficient, an unrelated quantity from an unrelated formula that happens to reuse the letter. {% katex() %}\beta{% end %} reaches a third meaning on the same page, on top of the two already disambiguated above: Post 2's Knowledge-phase learning rate, Post 5's own square-root-staffing coefficient, and now USL's own coherency-cost term. Check which formula a given {% katex() %}\alpha{% end %} or {% katex() %}\beta{% end %} sits inside before assuming it carries meaning from elsewhere on the same page, let alone a different post.*

**Meta-constraint**

| Symbol | Meaning | Defined in |
| :--- | :--- | :--- |
| {% katex() %}C_{\text{workflow}}{% end %} | cost of running the adaptation machinery itself | Post 6 |
| {% katex() %}\Delta O{% end %} | drift cost avoided by adapting | Post 6 |
| {% katex() %}\tau{% end %} | the ROI floor a mechanism has to clear to be worth its own cost | Post 6 |
| {% katex() %}\theta{% end %} | how much sophistication a team buys into Knowledge's own machinery, the free parameter Definition 7a's own frontier is traced against | Post 6, [Definition 7a](/blog/asymptotically-ruined-part6-meta-constraint/#def-7a) |

</details>

> **Cognitive Map**
>
> 1. Being proven correct doesn't specify what to build. Every mechanism this series proved needs a stated engineering answer (what gets built, where it sits, what it costs) before it's actionable.
> 2. Blood Oath's impossibility has three real responses: accept the permanent buffer cost, build checkpointing to escape the locality lock, or use bare preemption where a full restart is tolerable. The cheapest option is preemption where it's available; the real engineering tradeoff is buffer-cost-forever versus checkpointing's own one-time build.
> 3. The Physical Redline's own arithmetic is cheap; the real engineering cost is the telemetry pipeline and the demotion hook's own scoping. The one real tuning decision, {% katex() %}\eta{% end %}, should be set by re-running Post 2's own simulation against real data, not by reusing this series' own number.
> 4. Definition 4's per-resource mechanism is a small sidecar, not a scheduler: build it alongside an adopted system like Dynamo, not instead of one, and re-derive its separable-regions assumption before trusting it under chunked-prefill or elastic reassignment.
> 5. Eviction is a real, moderate build with a structural (not proof-level) safety argument behind it, against a near-free alternative with none. The credited-headroom projection term is the piece most often skipped and most load-bearing when it is.
> 6. Fleet pooling trades a real, computed capacity saving for a real, new coordination component with its own availability engineering. A cost the underlying math was never built to price.
> 7. The meta-constraint's own answer is a staged build: measure the static version's own drift cost and the adaptive version's own build cost before committing to full automation, so Proposition 7's own ROI test has real inputs instead of an assumed one.
> 8. Build in dependency order: redline before multi-resource, multi-resource before eviction, eviction before fleet pooling, adaptation last. Know that this order avoids one named failure mode, not that it proves the whole system composes safely, which remains as open after this post as it was after the one before it.
> 9. Every mechanism in this post decides locally, on a stale view, by construction: never argued for against the alternative until here. Checked against five other real points in the same design space (Sparrow's late binding, a lazy-pull shared backlog, Borg's monolithic scheduler, Mesos's two-level offer model, Omega's shared-state optimism), this series' own choice dominates for its own specific workload. The verdict flips cleanly under one stated, checkable condition: frequent correlated bursts as a measured incident cost, plus centralized infrastructure that already exists for other reasons, so the marginal cost of adding scheduling to it approaches zero rather than the full cost of building it from nothing.

---
<sup>[1]</sup> Verma, A., Pedrosa, L., Korupolu, M., Oppenheimer, D., Tune, E. & Wilkes, J. (2015). *Large-Scale Cluster Management at Google with Borg.* Proceedings of the Tenth European Conference on Computer Systems (EuroSys '15).

<sup>[2]</sup> The Kubernetes Authors. *Disruptions.* Kubernetes Documentation.

<sup>[3]</sup> CRIU Project. *Checkpoint/Restore In Userspace.*

<sup>[4]</sup> Netflix Technology Blog (2018). *Performance Under Load.*

<sup>[5]</sup> Uber Engineering (2023). *Cinnamon Auto-Tuner: Adaptive Concurrency in the Wild.* Uber Engineering Blog.

<sup>[6]</sup> Beyer, B., Jones, C., Petoff, J. & Murphy, N.R. (eds.) (2016). *Site Reliability Engineering: How Google Runs Production Systems*: "Handling Overload." O'Reilly Media.

<sup>[7]</sup> Ghodsi, A., Zaharia, M., Hindman, B., Konwinski, A., Shenker, S. & Stoica, I. (2011). *Dominant Resource Fairness: Fair Allocation of Multiple Resource Types.* Proceedings of the 8th USENIX Symposium on Networked Systems Design and Implementation (NSDI '11).

<sup>[8]</sup> The Kubernetes Authors. *Node-pressure Eviction.* Kubernetes Documentation.

<sup>[9]</sup> Envoy Proxy Documentation. *Supported Load Balancers: Least Request.*

<sup>[10]</sup> Google Cloud Blog & Netflix Technology Blog (2018). *Introducing Kayenta: An Open Automated Canary Analysis Tool from Google and Netflix.*

<sup>[11]</sup> Polyulya, Y. (2025). *The Constraint Sequence Framework.* e-mindset.space, 2025-12-27.

<sup>[12]</sup> Anyscale (2026). *Ray Serve: Advancing Flexibility with Async Inference, Custom Request Routing, and Custom Autoscaling.* Anyscale Blog.

<sup>[13]</sup> Ousterhout, K., Wendell, P., Zaharia, M. & Stoica, I. (2013). *Sparrow: Distributed, Low Latency Scheduling.* Proceedings of the 24th ACM Symposium on Operating Systems Principles (SOSP '13).

<sup>[14]</sup> Amazon Web Services (2025). *Application Load Balancer Target Optimizer.* AWS What's New, November 20, 2025; AWS re:Invent 2025 session NET336, "Load Balancing Evolved: ALB Target Optimizer."

<sup>[15]</sup> Kubernetes (2025). *Introducing Gateway API Inference Extension.* Kubernetes Blog, June 5, 2025.

<sup>[16]</sup> Hindman, B., Konwinski, A., Zaharia, M., Ghodsi, A., Joseph, A.D., Katz, R., Shenker, S. & Stoica, I. (2011). *Mesos: A Platform for Fine-Grained Resource Sharing in the Data Center.* Proceedings of the 8th USENIX Symposium on Networked Systems Design and Implementation (NSDI '11).

<sup>[17]</sup> Schwarzkopf, M., Konwinski, A., Abd-El-Malek, M. & Wilkes, J. (2013). *Omega: Flexible, Scalable Schedulers for Large Compute Clusters.* Proceedings of the 8th ACM European Conference on Computer Systems (EuroSys '13).

<sup>[18]</sup> Shapiro, M., Preguiça, N., Baquero, C. & Zawirski, M. (2011). *Conflict-Free Replicated Data Types.* Proceedings of the 13th International Symposium on Stabilization, Safety, and Security of Distributed Systems (SSS '11).

