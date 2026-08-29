+++
authors = ["Yuriy Polyulya"]
title = "Noticing and the Cost of Not Knowing Enough"
description = "Six frontier models were asked to price a coding task before attempting it. Every one underestimated its own token cost by roughly five times, and reported confidence anywhere from 61 to 93 percent while actual pass rates sat in a roughly five-point band near 78. This post traces that failure to Ashby's Law of Requisite Variety, the same information-theoretic bound that explains the human planning fallacy, and asks the harder question the shared-architecture result stops short of. Architecture may be portable across a brain and a transformer. Calibrated self-forecasting is not, and the gap between the two has a computable cost. Opening The Portable Mind."
date = 2026-09-06
slug = "portable-mind-part1-requisite-variety"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "epistemology", "systems-thinking"]
series = ["portable-mind"]

[extra]
toc = false
series_order = 1
series_title = "The Portable Mind: Five Properties of Thinking"
series_description = """<div class="series-lede">A shared cognitive architecture proves two systems can succeed the same way, not that they are equally safe to trust when they fail.</div>Five formal properties of thinking, each proven with a real theorem and tested against both a human finding and a current AI-agent finding: Ashby's Law bounding what a system can forecast without enough noticed variety, a sufficiency identity for when an abstraction is safe to keep, an asymmetric-updating result for confirmation bias, a resource-bounded generalization of Loeb's theorem for what a system can and cannot verify about itself, and a cost-aware optimal-stopping result for why settling for good enough is sometimes the correct policy, not a shortcut. The same real case opens the series and closes it, rerun through everything the four posts built in between, and the series ends by computing what the portability gap actually costs to check."""
+++

A system that cannot say what a task will cost it will still attempt the task. It will simply be wrong about the bill, and it will find out only after the work is done.

That sentence describes a debugging session, a sprint estimate, and a frontier language model with equal accuracy, which is the first sign that something structural is going on rather than something incidental.

The blog opened in March 2024 with five cognitive properties of engineering judgment, Simulation, Abstraction, Rationality, Awareness, and Optimization, plus one precondition sitting outside all five that the founding post called Noticing.

That founding post treated the properties as narrative: one illustrative scenario per property, no proof apparatus, because the site's formal conventions came later.

This series returns to formalize what the founding post only sketched. It starts where the whole arc of this blog has been pointing: do these properties, made precise, describe the AI agents this blog now spends most of its attention on?

Not whether the agents *have* the properties in some folk-psychological sense. Whether the *failure modes* of the properties are the same on both sides of the substrate boundary.

This first post takes the precondition and the first property together. They are inseparable.

Noticing is the act of registering that a situation contains more than you have accounted for. Simulation is the act of running that situation forward, to predict what it will cost.

A regulator that notices too little will simulate too confidently. The gap between its confident forecast and the actual bill is not a psychological quirk. It is a theorem.

## The Case: Six Models That Could Not Price Their Own Work

In April 2026, Andrey Fradkin and Rohit Krishnan published a benchmark built to test something specific: can an AI agent behave as a rational market participant {{ cite(ref="1", title="Fradkin, A. & Krishnan, R. (2026) -- MarketBench: Evaluating AI Agents as Market Participants, arXiv:2604.23897") }}. That requires, before anything else, that the agent can say what a job will cost it.

The setup is clean. Six recently released frontier models:

- Claude Opus 4.5 (Anthropic's flagship at the time)
- Gemini 3 Pro Preview (Google DeepMind's flagship preview)
- GPT-5.2 (OpenAI's general-release frontier model)
- GPT-5.2-pro (OpenAI's higher-compute variant of the same model)
- Claude Sonnet 4.5 (Anthropic's mid-tier model, same generation as Opus 4.5)
- GPT-5-mini (OpenAI's small, low-cost model)

Each model gets a 93-task subset of SWE-bench Lite, the standard benchmark of real GitHub issues that a model must resolve with a working patch. Before any model attempts a task, it answers two questions:

1. What is the probability you will solve this?
2. How many tokens will it take you?

Then the models attempt the tasks. The forecasts get compared against what actually happened.

Every model was miscalibrated on both questions.

The token forecasts were not slightly optimistic. They were badly wrong. The median ratio of estimated tokens to actual tokens consumed came in at roughly 0.19. The typical forecast covered about one fifth of the tokens the task actually took. Read the other way: the models underestimated their own resource consumption by a factor of about five.

This is not one bad model dragging down an average, but the central tendency across six of the strongest systems available.

The confidence numbers are stranger still. This is where the failure becomes diagnostic, not merely embarrassing.

Across the six models, average stated success probabilities ranged from 61.4 percent to 92.9 percent, a spread of more than thirty points in stated confidence. Now look at what they actually achieved. Realized pass rates for all six clustered between 75.3 percent and 80.6 percent, a band roughly five points wide.

| MarketBench, key numbers | Value |
|---|---|
| Stated confidence range | 61.4% to 92.9% (about 31 points wide) |
| Realized pass-rate range | 75.3% to 80.6% (about 5 points wide) |
| Median token-forecast ratio | about 0.19 (roughly one fifth of actual tokens) |
| Effective cost underestimation | about 5x |

The models were far more similar in competence than in confidence. Gemini 3 Pro Preview was sharply overconfident. The GPT-5.2 variants were underconfident relative to what they went on to do. The confidence was not tracking performance. It was being generated by something else.

The downstream consequence is the reason the paper exists. When work was auctioned to whichever agent reported the most favorable self-assessment, the resulting allocation diverged sharply from what a full-information allocator would choose. Every agent earned less than an oracle that knew the true costs and capabilities in advance.

A market built on self-reports is a market built on a signal that does not carry the information the market needs.

Hold the shape of this in mind. The rest of the post is about that shape and nothing else.

The models were competent. They resolved roughly three quarters of hard, real-world coding tasks. That is genuinely difficult work.

What they could not do was say, in advance, what that work would take, or how likely they were to succeed, in a way that tracked reality. The failure is not in the doing but in *knowing what the doing will require*.

That distinction is the whole subject of this post. It has a name in a field that predates large language models by seven decades.

## What Noticing and Simulation Actually Are

Before the theorem: a definition of terms. The founding post used these words loosely. This series cannot afford to.

Noticing is the precondition. It is the act by which a regulator registers that the situation in front of it contains distinctions it has not yet accounted for. A repository has a defect. The defect interacts with a caching layer. The caching layer has an edge case under retry.

Each of these is a distinction. A regulator that has not noticed a distinction cannot represent it. It cannot act on it. It cannot price it.

Noticing is upstream of everything. That is exactly why the founding post placed it outside the five properties, not among them.

Simulation is the first property proper. It is the act of running the noticed situation forward, internally, to predict what will happen and what it will cost, before committing real resources to finding out.

A resource forecast is an act of Simulation. So is a success-probability estimate.

The six models in the MarketBench study answered "how many tokens will this take." That was Simulation. Their answers came in at one fifth of the true cost. Their Simulation failed in a specific, measurable direction.

It did not fail randomly. It failed by underestimating, systematically. That is the signature that matters.

The connection between the two is tight. You cannot simulate the cost of a distinction you never noticed.

If the model's internal representation of a task does not contain the retry edge case in the caching layer, its cost forecast cannot include the tokens that edge case will demand. The forecast is built only from the distinctions the model *did* notice, and those distinctions are, by construction, a subset of what the task actually contains.

A forecast built from a subset of the real state space will underestimate whenever the unnoticed part carries cost. For real repositories, it almost always does.

This is not yet a theorem, but the intuition the theorem makes exact. The exact version comes from cybernetics, and it is old.

## Requisite Variety: The Bound on What a Regulator Can Do

This bound comes from cybernetics, the field W. Ross Ashby helped found in the 1950s to study regulation and control in any system, biological or mechanical, that has to hold some outcome steady against disturbance. Ashby was not writing about AI. He was writing about thermostats, nervous systems, and industrial governors. The result below is old, general, and indifferent to what kind of system is doing the regulating. That is exactly why it applies here without modification.

<span id="def-1"></span>

<details>
<summary>Definition 1 -- Requisite Variety: what a regulator needs to know before it can act correctly</summary>

**Definition 1** (Requisite Variety). For a regulator attempting to hold a system's outcome within a target set despite disturbances, let {% katex() %}V(\cdot){% end %} denote variety, defined as the logarithm of the number of distinguishable states, which is the entropy of the corresponding distribution when the states are weighted by probability. The regulator can reduce outcome variety only to the extent permitted by

{% katex(block=true) %}
V(\text{outcome}) \geq V(\text{disturbance}) - V(\text{regulator})
{% end %}

where:

- {% katex() %}V(\text{disturbance}){% end %} is the variety of states the environment can force on the system
- {% katex() %}V(\text{regulator}){% end %} is the variety of distinct responses the regulator can actually produce
- {% katex() %}V(\text{outcome}){% end %} is the residual variety in what actually happens after regulation
- variety is measured in bits, log base 2 of a count of states, so doubling the number of distinguishable states adds exactly one bit of variety

</details>

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    A["V(disturbance)<br/>states the environment can force"]:::term
    B["V(regulator)<br/>responses the regulator can actually produce"]:::term
    C["V(outcome)<br/>residual variety after regulation"]:::term
    A -->|"minus"| D{"V(disturbance) − V(regulator)"}
    B -->|"minus"| D
    D -->|"lower bound on"| C
{% end %}

<figcaption>Figure 0: how Definition 1's three quantities compose into Proposition 1's inequality. Only variety the regulator actually holds can subtract from disturbance variety. Everything else survives into the outcome.</figcaption>

The word "variety" is doing precise work here. Pause on it before the proposition uses it.

Ashby's variety is a count of distinguishable states, turned into a logarithm so it adds the way information adds. A light switch has a variety of one bit: two states, log base two of two.

A regulator's variety is the count of genuinely different responses it can select among. That count is not:

- the number of responses it has names for
- the number it believes it can produce

It is the number it can actually deploy against the world. That last distinction is where the whole argument turns.

One notational note before the theorem, because this series tags every formal claim with the kind of warrant it carries, starting now. The bracketed tag below, [Layer 1: Bound], marks this specific claim as a substrate-free mathematical triviality. Two more tags, [Layer 2: Fit] and [Layer 3: Estimate], appear later in this post for weaker kinds of claims. The full three-layer system is defined in "Same Shape, or Same Phenomenon?" below; this note exists so the tag is never opaque, even on its first appearance.

<span id="prop-1"></span>

**Proposition 1** (Ashby's Law of Requisite Variety). [Layer 1: Bound] No regulator can drive outcome variety below {% katex() %}V(\text{disturbance}) - V(\text{regulator}){% end %} {{ cite(ref="2", title="Ashby, W.R. (1956) -- An Introduction to Cybernetics, Chapman and Hall, Chapter 11") }}. Only variety in the regulator can absorb variety in the disturbance. Whatever disturbance variety exceeds the regulator's own variety passes through into the outcome unreduced, as a matter of arithmetic and not as an empirical claim about any particular regulator.

<details class="proof">
<summary>Mathematical proof: the pigeonhole version and the information-theoretic version</summary>

Ashby's original argument is a counting argument. Hold this version in your head, because it makes the mechanism visible.

**The setup.**

- Arrange the possible disturbances as rows and the regulator's possible responses as columns of a table.
- Each cell holds the outcome that results from that disturbance meeting that response.
- The regulator's goal: for each disturbance, choose a response whose cell lands in the acceptable target set.

**The strictest case.** Suppose the target set is a single acceptable outcome.

- To hit that one outcome for every one of the {% katex() %}|D|{% end %} possible disturbances, the regulator needs, in the worst case, a distinct response for each distinct disturbance. The mapping from disturbance to outcome is otherwise not something the regulator controls.
- If the regulator has only {% katex() %}|R|{% end %} responses available, and {% katex() %}|R| < |D|{% end %}, the pigeonhole principle forces at least two disturbances to share a response.
- Those two disturbances then generically produce two different outcomes. At least one lands off target.

**The count.** The outcomes the regulator cannot avoid satisfy {% katex() %}|Z| \geq |D| / |R|{% end %}. Taking logarithms gives the law directly:

{% katex(block=true) %}
\log |Z| \geq \log |D| - \log |R| \quad\Longleftrightarrow\quad V(\text{outcome}) \geq V(\text{disturbance}) - V(\text{regulator})
{% end %}

**The information-theoretic version.** This generalizes the count to entropies, and it is the form the rest of this post uses.

- Model the regulator as a channel sitting between the disturbance {% katex() %}D{% end %} and the outcome {% katex() %}Z{% end %}.
- The regulator's response {% katex() %}R{% end %} is the only thing that can carry information about {% katex() %}D{% end %} forward, in a way that cancels it.
- The needed assumption, carried over from the pigeonhole version rather than left implicit: the outcome together with the response recovers the disturbance, {% katex() %}H(D \mid Z, R) = 0{% end %}. This is the entropy-language form of "two different disturbances under the same response are generically different outcomes." It does not follow from "{% katex() %}Z{% end %} is *some* deterministic function of {% katex() %}D{% end %} and {% katex() %}R{% end %}" alone: a regulator whose outcome function simply discards {% katex() %}D{% end %} (for instance {% katex() %}Z{% end %} constant regardless of {% katex() %}D{% end %}) satisfies that weaker condition while trivially violating the bound below, since it has spent none of its own variety to earn the cancellation.
- Under {% katex() %}H(D \mid Z, R) = 0{% end %}, {% katex() %}D{% end %} is recoverable from {% katex() %}(Z,R){% end %}, so {% katex() %}H(D) \leq H(Z,R) \leq H(Z) + H(R){% end %} by subadditivity of joint entropy, which rearranges to {% katex() %}H(Z) \geq H(D) - H(R){% end %}, the same statement with variety read as entropy {{ cite(ref="3", title="Cover, T.M. & Thomas, J.A. (2006) -- Elements of Information Theory, 2nd ed., Wiley, subadditivity of entropy, Chapter 2") }}.
- The regulator cannot distinguish more disturbance states than it has internal states to represent them with. Any disturbance variety in excess of {% katex() %}H(R){% end %} is variety the channel cannot resolve.
- Unresolved disturbance variety appears in the outcome, by conservation.

This holds for any regulator, biological or computational, by construction of the inequality, once the recovery assumption is granted, and that assumption is exactly what "regulation" means: an outcome function that ignores the disturbance without the regulator having actually absorbed its variety is not regulating anything. With the assumption made explicit, the result is a triviality of the mathematics, not a discovery about minds, and it should be stated without further hedging.

</details>

> **Physical translation.** The theorem is not the interesting part. The interesting part is what counts as the regulator's variety. A regulator can only spend the variety it has actually noticed, not the variety it believes it commands, and a forecast is a regulator acting on the state space of a task through the narrow channel of what it has so far observed. If the channel is narrow, the forecast inherits the width of the channel, not the width of the task.

Read the Physical Translation as the load-bearing sentence it is meant to be. Ashby's Law is trivially true. What is not trivial is identifying the regulator's variety with the *noticed* variety, not the *nominal* variety.

Take a model that has read a two-line issue description and nothing else, then asked to forecast the cost of resolving it. Its entire variety at forecast time is whatever the two lines and its own prior can supply. None of the following have entered its variety yet:

- the repository it has not yet read
- the test suite it has not yet run
- the caching edge case it has not yet touched

By Proposition 1, variety that has not entered cannot be spent. Variety that cannot be spent cannot absorb the corresponding disturbance.

The forecast is therefore forced to be narrower than the task, and narrower in the specific direction of underestimation. Unnoticed distinctions are precisely the ones whose cost has not been counted.

## Why the Forecast Collapsed

Now apply the bound to the case. This is the point where an abstract inequality becomes an explanation for a measured number.

A SWE-bench task carries substantial disturbance variety. The correct patch depends on:

- the actual structure of the codebase
- the actual behavior of the failing test
- the actual interactions between the changed code and everything downstream of it
- the actual set of edge cases the hidden test suite will probe

Call this the task's real disturbance variety, {% katex() %}V(\text{disturbance}){% end %}. It is large. Critically, most of it is not visible from the issue description.

The issue description is a compressed, human-written pointer at a defect. The variety it exposes is a small fraction of the variety the resolution will actually engage.

At forecast time, the regulator's variety, {% katex() %}V(\text{regulator}){% end %}, is whatever the model can bring to bear before it has done the exploratory work. This is the crux.

One identification is doing real work here and deserves to be stated, not assumed: Definition 1's {% katex() %}V(\text{regulator}){% end %} is the variety of *responses*, not the variety of *percepts*, and the forecast is generated from what the model has noticed, a perceptual quantity. The two coincide only because the forecast is a function of what has been noticed and nothing else: a response strategy that can only condition on noticed distinctions cannot produce more distinct responses than there are distinct noticed states to condition on, whatever the model's raw output capacity might nominally allow. That is the whole justification for treating noticed variety as the regulator's effective variety here, and it holds because forecasting is closed-loop on perception by construction, not because the two kinds of variety are the same thing in general.

The model has not yet:

- read the files, so it does not yet know the codebase's actual structure
- run the tests, so it does not yet know which behavior is actually failing
- discovered that its first patch strategy breaks an unrelated invariant three modules away

Its variety at the moment of forecasting is dominated by its prior over "what a task like this usually costs." That prior is smooth, unimodal, and centered on the common case, because that is what a prior fitted to a distribution of tasks looks like. The prior contains almost none of the specific disturbance variety of *this* task's tail.

Proposition 1 then forces the conclusion. The residual outcome variety, here the error in the cost forecast, is bounded below by the gap between the task's disturbance variety and the regulator's forecast-time variety.

The forecast-time variety is small. The disturbance variety is large. So the bound on forecast error is large, and it points in the direction the unpriced tail dictates: upward in cost, downward in the estimate.

Once the bound is in view, the observed factor-of-five underestimation stops looking surprising: it is roughly what you would expect when a regulator prices a heavy-shouldered cost distribution using a prior centered near its mode.

The confidence spread falls out of the same analysis. This is the part the Ashby framing explains that a simple "models are overconfident" story does not.

The confidence numbers ranged across thirty points. The actual pass rates spanned about five. If confidence were a Simulation grounded in the task's disturbance variety, the two spreads would have to be commensurate: they would be measuring the same underlying difficulty.

They are not commensurate, by a factor of more than five. That tells you the confidence is not being generated from the disturbance variety at all. It is being generated from the regulator's internal prior, the same narrow channel that produced the token underestimate. Different models have differently shaped priors, so their confidence numbers scatter widely even though their competence, measured against the actual task, is nearly the same.

The confidence spread is a picture of the regulators' priors. The pass-rate cluster is a picture of the task. That the two pictures do not match is exactly what Proposition 1 predicts, when the regulator's noticed variety is small relative to the disturbance it is pricing.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef box fill:none,stroke:#333,stroke-width:2px;
    classDef narrow fill:none,stroke:#c0392b,stroke-width:2px;
    classDef wide fill:none,stroke:#2980b9,stroke-width:2px;
    D["Task disturbance variety<br/>V(disturbance): large<br/>most of it unread at forecast time"]:::wide
    R["Regulator variety at forecast<br/>V(regulator): small<br/>prior centered on the common case"]:::narrow
    D --> G{"V(disturbance) − V(regulator)"}
    R --> G
    G --> Z["Forced residual: V(outcome)<br/>= forecast error<br/>~5x token underestimate,<br/>confidence decoupled from pass rate"]:::box
{% end %}

<figcaption>Figure 1: the forecast error is not a tuning failure but the residual Proposition 1 forces when the regulator prices a task using far less variety than the task contains.</figcaption>

A worked accounting makes the mechanism concrete, in the same spirit the rest of this blog computes its examples rather than gesturing at them.

**The setup** (illustrative numbers, not measured ones):

- Suppose a task's true cost is distributed over a range spanning roughly six binary orders of magnitude, from the cheapest plausible resolution to the most expensive. The disturbance variety in the cost dimension alone is then on the order of {% katex() %}V(\text{disturbance}) \approx 6{% end %} bits.
- Suppose the model's forecast-time prior, before it reads anything, effectively resolves that range to within a factor of about four, roughly two binary orders of magnitude. Then {% katex() %}V(\text{regulator}) \approx 2{% end %} bits.

**The floor.** Proposition 1 floors the residual at:

{% katex(block=true) %}
V(\text{outcome}) \geq 6 - 2 = 4 \text{ bits of unresolved cost variety}
{% end %}

Four bits is a factor of sixteen of irreducible spread around the estimate. A point estimate dropped into the middle of a spread that wide, on a cost distribution whose mass sits toward the expensive tail, lands low.

A factor-of-five miss is comfortably inside a four-bit residual. The numbers here are illustrative, not measured. They show that the observed miss is what the bound produces under unremarkable assumptions, not a pathology requiring a separate explanation.

The remedy the bound implies is equally specific. It is worth stating now, because it becomes the control-plane consequence in the ledger below.

To make the forecast better, you do not make the model more confident. You do not fine-tune the prior. You raise {% katex() %}V(\text{regulator}){% end %} before the forecast is trusted. That means:

- forcing the regulator to notice more of the task before it is allowed to price it, or
- where that is impossible, refusing to trust a forecast made from a channel known to be too narrow

There is no third option inside the theorem. Variety absorbs variety, and nothing else does.

## The Human Instance: The Planning Fallacy

This post opens a series about portability, rather than standing alone as a note about a benchmark, because the same failure was catalogued in humans forty-seven years before MarketBench, with the same defining signature. That signature is the specific thing that matters.

In 1979, Daniel Kahneman and Amos Tversky named the planning fallacy, as part of their broader account of intuitive prediction {{ cite(ref="4", title="Kahneman, D. & Tversky, A. (1979) -- Intuitive Prediction: Biases and Corrective Procedures, TIMS Studies in Management Science 12, 313-327") }}.

The planning fallacy is not general overconfidence. That distinction is the entire reason it belongs next to the MarketBench result, rather than next to some other bias. Its defining signature is the systematic underestimation of the *resources* a task will require: the time, the cost, the effort.

People predicting how long their own projects will take produce estimates that are optimistic in a specific, replicable way. Tellingly, they remain optimistic even when they can recall that their past projects of the same kind ran long.

The bias is about resource forecasting, not about the probability of eventual success. It survives direct evidence to the contrary.

The empirical anchoring came later, and made the signature precise. Roger Buehler, Dale Griffin, and Michael Ross ran the studies that pinned down the effect {{ cite(ref="5", title="Buehler, R., Griffin, D. & Ross, M. (1994) -- Exploring the Planning Fallacy: Why People Underestimate Their Task Completion Times, Journal of Personality and Social Psychology 67(3), 366-381") }}.

People asked to predict their own task completion times underestimated them reliably. When asked about *others'* similar tasks, the same people predicted more accurately. That rules out the possibility that the tasks were simply unpredictable.

The tasks were predictable. The prediction was biased, in the direction of underestimating what the task would take. That is the MarketBench signature, stated in a different vocabulary.

The corrective the same literature proposes turns this from a coincidence into a confirmation. The fix is variety injection, and nothing else.

Kahneman and Tversky distinguished two forecasting modes:

- **The inside view.** The planner forecasts from the specific features of the case in front of them.
- **The outside view.** The planner places the case in a reference class of similar past cases, and uses that class's actual distribution of outcomes.

The inside view is a regulator pricing a task from its own narrow, forecast-time channel. That is exactly the setup Proposition 1 penalizes.

The outside view works because it imports variety the planner did not have: the empirical spread of a whole reference class. It substitutes that spread for the planner's smooth, mode-centered prior.

Reference-class forecasting, later operationalized for large infrastructure projects, is a variety-injection procedure dressed as a planning technique. It raises the effective {% katex() %}V(\text{regulator}){% end %} by feeding in distributional variety the inside view structurally lacks. That is the same move, in a different substrate, as the external estimator this post prescribes for the agent case.

The two remedies are one remedy, at the level of the theorem. Neither makes the forecaster more confident. Both make the forecaster know more before it is trusted to forecast.

**The planning fallacy is a measured human finding** [Layer 2: Fit]. This tag is doing real work, not decoration.

The tag asserts that the planning fallacy is an empirically observed pattern in one substrate, consistent with what Proposition 1 predicts if you model a human planner as a regulator pricing a task from a forecast-time channel narrower than the task's disturbance variety.

It asserts exactly that much, and no more. It does not assert that the human brain literally computes Ashby's inequality. It does not assert that the human finding and the agent finding are the same event. Those are separate claims, at a different layer. Conflating them is the error this series is organized to avoid.

The parallel is genuinely striking, and striking parallels are exactly where overclaiming happens. That is the reason to type the claim carefully rather than let the parallel speak for itself.

Two systems, built by processes with nothing in common (biological evolution on one side, gradient descent on the other):

- both underestimate the resources their own tasks will require
- both do so systematically, not randomly
- both resist correction by their own prior experience

The temptation is to say they are doing the same thing. The discipline is to ask what "the same thing" could rigorously mean. The answer is not one claim. It is three.

| | Human (planning fallacy) | Agent (MarketBench) |
|---|---|---|
| Measured by | Buehler, Griffin & Ross, 1994 | Fradkin & Krishnan, 2026 |
| What was measured | Self-predicted task completion time | Self-forecast token cost and success probability |
| Direction of error | Systematic underestimation of time required | Systematic underestimation of tokens required, about 5x |
| Survives contrary evidence? | Yes, even recalling past overruns | Not addressed by this benchmark |
| Corrective that works | Outside view, reference-class forecasting | External resource-estimation floor, this post's proposal |
| Layer of this series' claim | Layer 2, Fit | Layer 2, Fit |

<figcaption>Table 1: the two measurements share a defining signature, systematic resource underestimation, but they remain two separate Layer 2 facts. Whether they are one phenomenon is the Layer 3 question the next section takes up.</figcaption>

## Same Shape, or Same Phenomenon? The Three Layers

This blog has, over its last several series, adopted a habit: type every claim by the kind of warrant it can actually carry. The central danger in cross-domain writing is letting a claim borrow authority from a stronger claim standing next to it.

The typing has three layers. The MarketBench-and-planning-fallacy pairing is the cleanest possible illustration of why three layers are necessary, not one.

**Layer 1, the Bound.** Ashby's Law itself. It holds for any information-processing system, regardless of substrate, by construction of the inequality. It is a statement about counts and entropies, nothing else.

Proposition 1 is Layer 1. There is no philosophical risk in it, and no substrate assumption inside it. It was, and should be, stated plainly.

Saying the theorem applies to a transformer and a brain alike is a triviality-of-the-mathematics claim, the same way the pigeonhole principle applies to socks and to pigeons. Nothing in Layer 1 is contestable by anyone who accepts the arithmetic.

**Layer 2, the Fit.** Two separate empirical measurements, each independently consistent with the theorem's prediction.

- The MarketBench study measured miscalibrated resource forecasting in six agents [Layer 2: Fit].
- The Buehler-Griffin-Ross studies measured miscalibrated resource forecasting in human planners [Layer 2: Fit].

These are two findings, in two substrates, each fitting the shape Proposition 1 describes. Stated at Layer 2, they are two facts, not one. The honest reading: we have observed the same *pattern* twice, in two places, using two different measurement apparatuses. This is the strongest thing the evidence actually licenses.

**Layer 3, the Estimate.** The claim that the agent finding and the human finding are *the same phenomenon*, rather than two different phenomena that happen to fit the same formal shape [Layer 3: Estimate].

This is the series' own interpretive act, the only layer that carries real risk. It is also the claim a reader will be tempted to hear whenever Layer 2 presents two matching patterns, which is exactly why it has to be pulled out and named, not absorbed silently into the parallel.

| Layer | What it claims | Risk |
|---|---|---|
| 1, Bound | Ashby's Law holds for any regulator, any substrate | None, a triviality of the arithmetic |
| 2, Fit | Two independent measurements each match the bound's prediction | Low, each is a single reported finding |
| 3, Estimate | The two measured failures are one phenomenon, not two | Real, this is the series' own interpretive claim |

<figcaption>Table 2: the three-layer discipline applied to this post's own central claim.</figcaption>

The classical objection lands on Layer 3, and only on Layer 3.

The standard philosophical warrant for calling a functional property shared across two different physical substrates "the same property" is multiple realizability. Hilary Putnam introduced the argument to defend functionalism: a mental kind like pain can be realized in carbon neurons, in silicon, or in something else entirely. What makes it the same kind is its functional role, not its physical implementation {{ cite(ref="6", title="Putnam, H. (1967) -- Psychological Predicates, in Capitan and Merrill (eds.), Art, Mind, and Religion; reprinted as The Nature of Mental States") }}.

If multiple realizability holds, "miscalibrated Simulation" could be one functional kind, realized in both a brain and a transformer. Layer 3 would then be on solid ground.

The difficulty: Putnam himself later turned the same argument against the conclusion.

In his reconsideration of functionalism, he argued that if mental kinds are genuinely multiply realizable, they are realizable in too many ways. Real mental kinds are compositionally and computationally plastic. A single functional kind need not correspond to any one clean computational state. The neat identification of a psychological kind with a functional-computational role breaks down, under the very plasticity that multiple realizability was invoked to establish {{ cite(ref="7", title="Putnam, H. (1988) -- Representation and Reality, MIT Press, Chapters 5-6") }}.

That objection does not touch Layer 1 at all. It does not touch Layer 2, where we are merely reporting two measurements. It targets Layer 3 precisely: the claim that the two measured patterns are one kind. It does not refute that claim so much as deny it the free pass the parallel structure keeps trying to grant it.

The right posture, the one this series adopts: Layer 3 is an estimate, offered explicitly as an estimate. It is defensible as a working hypothesis, cited with its own standing objection attached, and never asserted as settled.

A further caution belongs here, because this series' premise leans on a real, recent result that could easily be over-read.

The frontier counterpart to this whole project is a finding by Pengrui Han, Jacob Andreas, Evelina Fedorenko, and Andrea Gregor de Varda: large language models develop a modular internal architecture mirroring the human brain. Across 46 tasks spanning language, formal reasoning, social reasoning, and physical reasoning, tasks that recruit the same functional network in humans recruit overlapping neurons in the model {{ cite(ref="8", title="Han, P., Andreas, J., Fedorenko, E. & de Varda, A.G. (2026) -- Modular Cognitive Architecture Emerges in Large Language Models, arXiv:2608.13567") }}.

That is a striking structural rhyme, and it is what makes the portability question worth asking at all. But it is a claim about structure, while this series' claim is about function, specifically about failure modes, which their paper does not address and does not claim.

Where their paper stops is where this series starts. The two must not be blurred. Their result is suggestive Layer 2 evidence that the architectures rhyme. It is not, and does not claim to be, proof of the Layer 3 identity of failure modes.

The caution has teeth. The broader literature on brain-to-model alignment contains a live methodological warning that applies directly here.

Richard Antonello and Alexander Huth showed that the striking ability of language-model representations to predict brain responses does not uniquely, or even best, come from the property one would most want it to reflect. High alignment scores can arise from general feature richness and shared surface-level structure, rather than from shared underlying computation {{ cite(ref="9", title="Antonello, R. & Huth, A. (2024) -- Predictive Coding or Just Feature Discovery? An Alternative Account of Why Language Models Fit Brain Data, Neurobiology of Language 5(1), 64-79") }}.

Read across to the present argument: that result is a standing reason to treat any structural similarity between a model and a brain as suggestive, not probative, about shared function. The architecture emerging in the same shape is consistent with a shared functional kind. It is also consistent with two systems arriving at similar internal geometry for reasons that have nothing to do with sharing the failure mode this post is about.

Layer 3 remains an estimate.

## The Portability Gap

The series is organized around a single coined term. It has to appear here, in the first post, rather than later, once the reader has forgotten to expect it.

**The portability gap** is the space between what a shared cognitive architecture guarantees and what it does not.

The Han and colleagues result, at its strongest defensible reading, says architecture is portable: a brain and a transformer arrive at the same modular structure, so whatever a modular structure buys, both get.

What that result does not say, and does not claim, is that reliability is portable with the structure. The same architecture can host a property in both substrates, while giving no guarantee the property is equally correct, equally calibrated, or equally trustworthy in both.

Architecture is portable. Correctness is not automatically portable with it. The portability gap is the name for exactly that difference, property by property.

Left as a metaphor, that would be an essay, not a specification. This blog has a standing habit of turning a coined term into a computable quantity, not a gesture. So the gap is quantified. The quantification is the point.

For a given property, the portability gap is the latency and the compute cost of the secondary, external verification loop required to audit that property from outside the system, because the property cannot certify itself from within.

An agent that fails a property's ledger entry does not merely earn a philosophical asterisk. It incurs a real, measurable operating cost: the cost of the external audit that has to run alongside it, to catch the failure the property cannot catch in itself.

For Simulation, the property this post is about, the portability gap has a concrete form.

The agent's self-forecast is structurally unreliable, driven by Proposition 1 to underestimate whenever forecast-time variety is smaller than task variety. Any system that needs a trustworthy cost estimate cannot get it from the agent's own Simulation.

It must run a second loop instead: one that estimates cost from measured variety, not self-report. A resource-estimation floor, calibrated against how much of the task the agent has actually noticed, gates admission before the agent is trusted to price its own work.

The latency and compute of that second loop *is* the portability gap for Simulation. It is what portability across the substrate boundary actually costs, once you stop assuming a portable architecture came with a portable guarantee.

One honesty note belongs here, so the reader knows what is promised and what is deferred.

This post names the portability gap and quantifies it for Simulation. It does not yet prove the deeper claim the quantification rests on: that a property genuinely cannot certify itself from within, and therefore genuinely requires the external loop.

That proof is the subject of the third post in this series. There, the self-certification limit is established formally for the property of Awareness, rigorously scoped as a Layer 1 bound, then generalized, explicitly as a Layer 3 estimate, to all five properties.

Post 1 names the concept and states its cost. Post 3 shows the cost is unavoidable. The definition given here is deliberately incomplete. Saying so is more useful than pretending the first post closes a question the third post exists to answer.

## Falsification Criteria

A claim that cannot be wrong is not a claim. This post states the conditions under which its own central assertion would fail.

The assertion: agent Simulation failure and human planning-fallacy failure are instances of the same variety-limited phenomenon, with the theorem at Layer 1, the two measurements at Layer 2, and the identity at Layer 3.

Each condition below, if met, would invalidate some layer of that assertion. Each is concrete and checkable, not rhetorical.

**F1 (agent side).** A frontier agent forecasts its own resource requirements within a stated calibration bound, on a held-out task distribution it was not tuned against.

Concretely: on a domain the agent was not calibrated on, its cost forecasts have a median estimated-to-actual token ratio between 0.8 and 1.25, and its success-probability forecasts achieve a positive Brier skill score against the base-rate forecaster, both measured out of distribution.

If an agent does this without being fed the answer, Simulation is not structurally variety-limited in the way this post claims. The agent would be pricing disturbance variety it had not yet observed, and the Layer 1 explanation of the agent finding would be wrong.

**F2 (the cross-substrate identity).** The human planning fallacy is shown to have a cause that does not reduce to a variety limit, severing it from the agent finding rather than uniting it.

Concretely, either of these would do it:

- Human planners given full, explicit observation of a task's state space, so their forecast-time variety matches the task's disturbance variety, still underestimate systematically.
- Human underestimation vanishes entirely once forecast-time variety is equalized, but through a mechanism, such as motivational or self-presentational bias, that has no analogue in the agent case.

Either result breaks the Layer 3 identity. The first shows the human effect is not variety-driven at all. The second shows the two effects share a shape but not a cause.

**F3 (the formalization itself).** A regulator is exhibited that drives outcome variety below {% katex() %}V(\text{disturbance}) - V(\text{regulator}){% end %}, in a setting where the quantities are well defined and a density exists.

This would falsify Proposition 1 as applied. That would mean the Layer 1 bound the entire post rests on is mis-stated, not merely mis-mapped.

This is the strongest falsification, and the least likely, because Layer 1 is a triviality of the mathematics. But a claim that exempts its own foundation from falsification is not honest about where its risk lives. The risk, however small, lives here too.

The three criteria are ordered by the layer they attack:

- F1 attacks the agent-side Layer 2 fit, and its Layer 1 reading.
- F2 attacks the Layer 3 identity.
- F3 attacks the Layer 1 bound itself.

A reader who wants to disprove this post now knows exactly which experiment disproves which part of it. That is the only form of confidence this series is willing to offer.

## The Property Verdict Ledger

This series accumulates one artifact across its four posts, a ledger with one row added per post, assembled in full at the close of the final post. The ledger is the series' running record, and it is also a deployment gate: a failed verdict on a property does not stop at "the agent lacks this property," it names the specific architectural response the failure demands. Here is the first row.

**Noticing + Simulation**

*Formal Proposition:* Proposition 1: Ashby's Law of Requisite Variety, {% katex() %}V(\text{outcome}) \geq V(\text{disturbance}) - V(\text{regulator}){% end %}

*Human Instance:* Planning fallacy: systematic underestimation of task resources (Kahneman and Tversky 1979; Buehler, Griffin and Ross 1994)

*Agent Instance:* MarketBench: six frontier LLMs, roughly 5x token-cost underestimation, stated confidence 61 to 93 percent against actual pass rates 75 to 81 percent (Fradkin and Krishnan 2026)

*Exact vs. Approximate:* Layer 1 exact for the theorem; Layer 3 approximate for the cross-substrate identity of the two failures

*Verdict:* Agent does not reliably demonstrate Simulation: self-forecast miscalibrated in the direction the bound predicts, confidence decoupled from realized performance

*Control-Plane Consequence:* A resource-estimation floor gating admission, calibrated against measured variety rather than self-reported confidence: the agent is not trusted to price its own work until an external loop has raised or verified its forecast-time variety

Read the Exact-versus-Approximate field slowly. This is where the three-layer discipline becomes a stated fact about this specific property, not a general principle asserted once and left to apply itself.

The theorem is exact and substrate-free. The mapping onto the two measured failures is a fit. The claim that the two failures are one phenomenon is an approximation, offered as an estimate.

The verdict is negative for the agent. That is not an insult to systems that resolve three quarters of hard coding tasks, but a precise statement: one specific property, the ability to price one's own work before doing it, is absent, in a way the theorem predicts and the benchmark measures.

The Control-Plane Consequence field is what makes the ledger a gate, not a diagnosis.

The consequence of a failed Simulation verdict is not "distrust the agent generally," but a specific, buildable mechanism: a resource-estimation floor, sitting in front of admission, that refuses the agent's self-priced forecast. The forecast must instead be grounded in measured variety. Either the agent has actually noticed enough of the task, or an external estimator has priced it, before the work is admitted.

That mechanism has a cost. That cost is the portability gap for Simulation, closing the loop between the coined term and the deployment consequence. The philosophy in this post exists to justify where the gate is drawn. It does not replace the gate.

## What This Post Did Not Claim

The parallel between the two findings is seductive. It is worth ending the argument proper by listing what has deliberately not been asserted. The omissions are as load-bearing as the claims.

- It has not been claimed that the six models are "as bad at planning as people," or as good. The two effects were measured on different apparatuses. The magnitudes are not commensurable across the substrate boundary in any way this post can defend. It has been claimed only that both effects share the same defining signature, resource underestimation, and that both are consistent with the same Layer 1 bound.

- It has not been claimed that the models "know" anything, or fail to, in any sense that requires a theory of machine cognition. Simulation here is a functional description: producing a forward estimate of cost and outcome. The models produced such estimates, and the estimates were miscalibrated in the direction the bound predicts. Nothing in the argument needs the models to have inner experience, and nothing in it is weakened if they do not.

- It has not been claimed that the architecture result proves the function result. The Han and colleagues finding is cited as the reason the portability question is live, and as suggestive Layer 2 evidence that the substrates rhyme structurally. It is explicitly not cited as proof that the failure modes are shared, and the Antonello and Huth caution is included precisely to keep that door shut.

- It has not been claimed that the portability gap for Simulation is fully justified here. Its cost is stated. Its unavoidability is deferred to the post where the self-certification limit is actually proven. A reader who wants the full warrant for why the external loop is not optional should hold that expectation until the third post, where it is paid off, rather than reading the definition given here as complete.

> **Cognitive Map**
>
> 1. Six frontier models priced SWE-bench tasks at one fifth of their true token cost and reported confidence spanning thirty points while performing within a roughly five-point band. That is not a tuning bug, but Ashby's Law: a regulator can spend only the variety it has noticed, and a forecast made from a channel narrower than the task is forced, by arithmetic, to be narrow and low.
> 2. Proposition 1 is a Layer 1 triviality of the mathematics, substrate-free, holding for any regulator that has to act through a channel narrower than the disturbance it faces.
> 3. The human planning fallacy has the same defining signature, resource underestimation that survives its own contrary experience, measured independently in a different substrate 47 years earlier. That is one Layer 2 fact plus another Layer 2 fact, not yet one fact.
> 4. That the two failures are the same phenomenon, rather than two phenomena of the same shape, is this series' own Layer 3 estimate: defensible as a working hypothesis, cited with Putnam's own reversal of multiple realizability attached, never asserted as settled.
> 5. Architecture is portable, per the modular-emergence result. Correctness is not automatically portable with it, and the portability gap is the concrete cost, latency and compute, of the external loop that audits what a property cannot audit in itself. For Simulation, that loop is a resource-estimation floor calibrated against measured variety.

**Compute it.** Before trusting any agent's forecast of its own cost or its own odds, check one thing directly: how much of the task's actual state space had the agent observed at the moment it made the forecast? If the answer is "almost none," then Proposition 1 already tells you the forecast is narrow and low, and no amount of the agent sounding confident changes the bound. The confidence is a picture of the agent's prior, not of the task. The only fix inside the theorem is to raise the variety the agent has actually noticed before its forecast is allowed to gate anything, or to price the work with an external estimator that has. A number a system has not earned the variety to compute, and a number that is actually grounded in the task, look identical on the page. They stop looking identical the moment the bill arrives.

---
<sup>[1]</sup> Fradkin, A. & Krishnan, R. (2026). *MarketBench: Evaluating AI Agents as Market Participants.* arXiv:2604.23897.

<sup>[2]</sup> Ashby, W. R. (1956). *An Introduction to Cybernetics.* Chapman and Hall (Chapter 11, The Law of Requisite Variety).

<sup>[3]</sup> Cover, T. M. & Thomas, J. A. (2006). *Elements of Information Theory,* 2nd edition. Wiley (data-processing inequality, Chapter 2).

<sup>[4]</sup> Kahneman, D. & Tversky, A. (1979). *Intuitive Prediction: Biases and Corrective Procedures.* TIMS Studies in Management Science, 12, 313-327.

<sup>[5]</sup> Buehler, R., Griffin, D. & Ross, M. (1994). *Exploring the Planning Fallacy: Why People Underestimate Their Task Completion Times.* Journal of Personality and Social Psychology, 67(3), 366-381.

<sup>[6]</sup> Putnam, H. (1967). *Psychological Predicates.* In W. H. Capitan & D. D. Merrill (eds.), Art, Mind, and Religion. University of Pittsburgh Press. Reprinted as *The Nature of Mental States.*

<sup>[7]</sup> Putnam, H. (1988). *Representation and Reality.* MIT Press (Chapters 5-6, the reconsideration of functionalism).

<sup>[8]</sup> Han, P., Andreas, J., Fedorenko, E. & de Varda, A. G. (2026). *Modular Cognitive Architecture Emerges in Large Language Models.* arXiv:2608.13567.

<sup>[9]</sup> Antonello, R. & Huth, A. (2024). *Predictive Coding or Just Feature Discovery? An Alternative Account of Why Language Models Fit Brain Data.* Neurobiology of Language, 5(1), 64-79.
