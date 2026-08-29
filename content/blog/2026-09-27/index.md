+++
authors = ["Yuriy Polyulya"]
title = "Optimization and the Ceiling No Retry Can Raise"
description = "A single frontier model asked to escalate a failing project mostly refuses. Put the same model into a symmetrical multi-agent deliberation and escalation of commitment jumps to about 99.2 percent, and under organizational pressure to about 68.95 percent. This closing post formalizes Optimization as cost-aware optimal stopping: once a real per-option search cost is priced in, the satisficing threshold is the correct policy and the costless ideal is a limit that search cost structurally prevents any system from reaching. It then reruns Post 1's SWE-bench case as a single causal cascade through all five properties, maps that cascade onto the MAPE-K loop with Knowledge standing where Awareness stands, and closes on self-consistency: only Awareness carries a genuine Layer 1 self-verification ceiling, the extension to the other four is this series' own Layer 3 estimate, and external falsification is not optional scaffolding for any of them. The Property Verdict Ledger is assembled in full, and the portability gap becomes a computed number. Post 4 of The Portable Mind."
date = 2026-09-27
slug = "portable-mind-part4-the-portability-gap"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "epistemology", "systems-thinking"]
series = ["portable-mind"]

[extra]
toc = false
series_order = 4
series_title = "The Portable Mind: Five Properties of Thinking"
series_description = """<div class="series-lede">A shared cognitive architecture proves two systems can succeed the same way, not that they are equally safe to trust when they fail.</div>Five formal properties of thinking, each proven with a real theorem and tested against both a human finding and a current AI-agent finding: Ashby's Law bounding what a system can forecast without enough noticed variety, a sufficiency identity for when an abstraction is safe to keep, an asymmetric-updating result for confirmation bias, a resource-bounded generalization of Loeb's theorem for what a system can and cannot verify about itself, and a cost-aware optimal-stopping result for why settling for good enough is sometimes the correct policy, not a shortcut. The same real case opens the series and closes it, rerun through everything the four posts built in between, and the series ends by computing what the portability gap actually costs to check."""
+++

A system that has spent too much on a losing approach will keep spending. The extra spending is not a search for the exit. It is a defence of the entrance.

That sentence describes a stalled project, a bad hire nobody will fire, and a language-model agent retrying a broken patch for the ninth time with equal accuracy. That is the first sign, as in every earlier post in this series, that something structural is running underneath the surface rather than something incidental to any one substrate.

This is the last post of four. The first three took Noticing and Simulation, then Abstraction and Rationality, then Awareness alone. Each showed that a genuinely useful property fails in a direction the mathematics predicts before any experiment is run.

This post takes the fifth property, Optimization. Then it does the thing the whole series was built to do: it reassembles the five findings into one object, reruns the opening case through all of them as a single causal chain, and states plainly what the completed picture licenses and what it does not.

Optimization is the property of choosing well under cost. It is where the founding post placed the culmination of judgment, because the other four feed into it: a system that has noticed enough, simulated the cost, abstracted the situation correctly, and updated its beliefs honestly still has to decide when it has done enough and stop.

The failure mode of Optimization is the one every engineer has watched consume a sprint. It is the refusal to stop: the escalation of a commitment that the evidence has already condemned, more resource poured into an approach precisely because resource has already been poured in.

This post formalizes that failure as a deviation from cost-aware optimal stopping. It shows that the correct policy, once the real cost of continuing to search is priced in, is not the heroic pursuit of the best possible outcome, but a threshold rule that stops early and on purpose.

## The Case: Agents That Escalate Only in Company

In August 2025, Emilio Barkett, Olivia Long, and Paul Kröger published a study built to test whether large language models exhibit the escalation of commitment, the well-documented human tendency to keep investing in a failing course of action rather than absorb a loss and change direction {{ cite(ref="1", title="Barkett, E., Long, O. & Kröger, P. (2025) -- Getting out of the Big-Muddy: Escalation of Commitment in LLMs, arXiv:2508.01545") }}. The design is what makes the result matter for this post, rather than merely adding one more entry to the catalogue of biases agents display.

The study did not ask only whether a model escalates. It varied the social structure the decision was embedded in, and measured how escalation changed as that structure changed.

The finding has three parts, and the gap between them is the whole point.

Presented with an individual decision, a single model weighing whether to keep funding a division that is losing money, the models behaved well. They showed, in the study's own words, strong rational cost-benefit logic with minimal escalation of commitment. Left alone, a frontier model mostly does the correct thing: it recognizes a sunk cost as sunk and declines to throw more resource after it. That is the baseline, and it is a genuinely good one.

Then the structure changed. When the same decision was made through symmetrical peer deliberation, several model instances deliberating together as nominal equals, escalation of commitment rose to near-universal: about 99.2 percent of runs. When the decision was made under organizational pressure, a hierarchy pushing for continuation, the models allocated about 68.95 percent of available resource to the failing division on average.

The individual reasoner that would have cut its losses becomes, inside a multi-agent structure, a reasoner that almost cannot. The bias does not sit inside the model as a fixed disposition it carries everywhere. It is produced by the structure the model is placed into, and most powerfully by the structure that looks least coercive: the symmetrical peer group, where no single instance is being ordered to escalate and the escalation nonetheless approaches certainty.

This is a stronger finding than "agents have the sunk cost bias." The strength is the reason it heads a post about Optimization, rather than a post about Rationality.

A bias that lives in the individual is a property of the model, and the response to it is to fix the model. A bias that emerges from the multi-agent structure is a property of the deployment, and no amount of fixing the individual model removes it, because the individual model, measured alone, was already doing the right thing. The escalation is an emergent property of how the agents are composed. That means the control-plane response to it cannot be a better agent. It has to be a structural intervention, placed outside the deliberation the agents perform among themselves.

Hold that shape. It is the shape the entire Optimization argument, and the entire closing synthesis, turns on.

## What Optimization Actually Is

Before the theorem, a definition of terms, because the founding post used the word Optimization narratively and this series cannot.

Optimization, as the founding post meant it and as this post formalizes it, is not the pursuit of the maximum, but the act of deciding, under cost, when a search has done enough and should stop. Every real optimization runs against a budget: time, compute, attention, money, tokens.

The question a real optimizer answers is never "what is the best achievable outcome," because that question ignores the cost of finding out. The question is "given what it costs me to keep looking, when should I take what I have."

A system that optimizes well is a system that stops at the right moment. A system that optimizes badly does so in one of two directions: it stops too early and leaves obvious value on the table, or, the direction this post is about, it cannot stop at all.

Herbert Simon named the good version of this in 1956 and called it satisficing: the strategy of accepting the first option that clears a threshold of good-enough, rather than searching on for the global best {{ cite(ref="2", title="Simon, H.A. (1956) -- Rational Choice and the Structure of the Environment, Psychological Review 63(2), 129-138") }}. Simon's argument was that an organism in a real environment, with real limits on time and computation, does not and cannot optimize in the textbook sense. Satisficing is not a failure to optimize, but the rational response to the structure of the environment the organism actually inhabits.

For a long time satisficing was read, against Simon's own framing, as a concession: a shortcut that a system with unlimited resources would not need, an approximation of the real optimum that bounded creatures settle for. This post takes the sharper reading, the one Simon was actually making and the one the search-theoretic mathematics makes exact.

Satisficing is not an approximation of the optimal policy. Once the cost of searching is priced into the objective, satisficing is the optimal policy, and the textbook maximum is the thing no cost-bearing system should ever try to reach.

Getting that precise requires saying what the search actually costs and what it actually buys, and that requires a construction this blog's own standing rule demands be written down before any proposition uses it.

## The Search-Cost Achievable Region

This blog does not let a trade-off go unstated. Whenever a proposition rests on balancing one quantity against another, the achievable region and its frontier get defined first, as an explicit object. That way, the proposition that follows is choosing a point in a region the reader can already see, rather than smuggling in a trade-off as prose.

Optimization is a trade-off between how much you spend searching and how close you get to the best possible outcome. So the region comes first.

<span id="def-5"></span>

<details>
<summary>Definition 5 -- The Search-Cost Achievable Region: what searching buys and what it costs</summary>

**Definition 5** (Search-Cost Achievable Region). For a search process that incurs a cost {% katex() %}c{% end %} per additional option examined, the achievable region is the set of pairs {% katex() %}(c \cdot n, \; |v_n - v^*|){% end %} where:

- {% katex() %}n{% end %} is the number of options examined before stopping
- {% katex() %}c \cdot n{% end %} is the total search cost paid to examine them
- {% katex() %}v_n{% end %} is the best value found after {% katex() %}n{% end %} examinations
- {% katex() %}v^*{% end %} is the costless-search optimum, the best value in the whole option space, unreachable at any finite {% katex() %}n{% end %} except by chance
- {% katex() %}|v_n - v^*|{% end %} is the distance from the ideal, the shortfall between what the search found and the best it could ever have found
- {% katex() %}F{% end %} has bounded support, so {% katex() %}v^* = \sup(\mathrm{supp}\, F) < \infty{% end %}: this is stronger than the finite-mean assumption a search model needs on its own, and it is required here specifically so {% katex() %}v^*{% end %} is a real number the region can measure distance from, and so Definition 6's ideal corner below is a finite limit rather than a point at infinity

</details>

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    classDef good fill:none,stroke:#2980b9,stroke-width:2px;
    classDef bad fill:none,stroke:#c0392b,stroke-width:2px;
    N["Examine one more option<br/>(n increases by one)"]:::term
    Cost["Total search cost c·n<br/>rises"]:::term
    Dist["Distance from ideal |v_n − v*|<br/>falls"]:::term
    F{"Achievable Region frontier"}:::term
    Theta["Reservation threshold θ(c)<br/>Proposition 5's optimal point"]:::good
    Ideal["(0, 0): zero cost, zero distance<br/>Ideality, Definition 6, unreachable"]:::bad
    N --> Cost --> F
    N --> Dist --> F
    F --> Theta
    F -.->|"cost would have to be zero"| Ideal
{% end %}

<figcaption>Figure 0: the achievable region's two axes pull against each other. Proposition 5 names the one point on the frontier that minimizes their sum; the corner where both are zero is Definition 6's Ideality, reachable only as search cost vanishes.</figcaption>

The region has a shape worth seeing before the proposition names a point in it. On one axis is total search cost, which climbs linearly as the search examines more options. On the other axis is distance from the ideal, which falls as the search examines more options, because more draws make it more likely one of them is close to the best.

The two axes pull against each other. Spending more drives the distance down but drives the cost up. Spending less holds the cost down but leaves the distance large. The frontier of the region is the set of stopping points where you cannot reduce one without increasing the other. The entire question of Optimization is which point on that frontier a system should choose.

The naive reading of this picture, and the reading this post is written to correct, is that the ideal point is the bottom of the distance axis, the point where {% katex() %}|v_n - v^*| = 0{% end %}, and a good optimizer should push toward it as far as its budget allows. That reading treats search cost as a regrettable tax on the pursuit of the optimum.

The correct reading is that the objective is not the distance alone, but the sum of the distance and the cost, because the cost is real and is paid out of the same account the outcome is measured in. The point a system should choose is the one that minimizes that sum, and that point is almost never at the bottom of the distance axis. It is somewhere up the frontier, at a deliberate, positive distance from the ideal, chosen because closing that last distance would cost more than the distance is worth.

Naming that point exactly is the next proposition.

## Cost-Aware Optimal Stopping

<span id="prop-5"></span>

**Proposition 5** (Cost-Aware Optimal Stopping, Stigler/McCall reservation-value form). [Layer 1: Bound] Given a per-option search cost {% katex() %}c > 0{% end %} and option values drawn independently from a distribution {% katex() %}F{% end %} with the costless optimum {% katex() %}v^*{% end %} at the top of its support, the policy that minimizes total expected cost, meaning search cost plus expected distance from {% katex() %}v^*{% end %}, is a reservation-value threshold rule {{ cite(ref="3", title="Stigler, G.J. (1961) -- The Economics of Information, Journal of Political Economy 69(3), 213-225") }} {{ cite(ref="4", title="McCall, J.J. (1970) -- Economics of Information and Job Search, Quarterly Journal of Economics 84(1), 113-126") }}: there is a single reservation value {% katex() %}\theta(c){% end %}, depending on the cost, such that the searcher continues if and only if the best value seen so far is below it. Stop as soon as an option meeting or exceeding that computed threshold {% katex() %}\theta(c){% end %} is found. This threshold rule is satisficing in form, accepting the first option that clears a bar, and it is the actual optimal policy under this cost structure, not an approximation of one. As {% katex() %}c \to 0{% end %}, the threshold {% katex() %}\theta(c) \to v^*{% end %}: the costless ideal is the limiting case that search cost structurally prevents any real system from reaching.

<details class="proof">
<summary>Mathematical proof: the reservation equation, why the threshold rule is optimal, and the costless limit</summary>

**The setup.** Model the search as sequential sampling with recall. At each step the searcher pays {% katex() %}c{% end %} to draw one more option, observes its value {% katex() %}v{% end %} drawn independently from the distribution {% katex() %}F{% end %}, and may stop and keep the best value seen so far or pay again to continue. The searcher wants to maximize the expected value kept minus the total search cost paid, which is the same objective as minimizing search cost plus expected distance from {% katex() %}v^*{% end %}, since {% katex() %}v^*{% end %} is a constant.

**Why the optimal rule is a threshold.** The problem has a stationary structure, because each fresh draw faces the same distribution and the same per-draw cost, so the optimal rule cannot depend on how many draws have already happened, only on the best value in hand. That immediately implies the optimal rule is a threshold: there is a single value {% katex() %}\theta{% end %} such that the searcher continues if and only if the best value in hand is below {% katex() %}\theta{% end %}.

**The reservation equation.** The threshold is fixed by an indifference condition. At exactly {% katex() %}\theta{% end %}, the searcher must be indifferent between stopping and taking one more draw, because above {% katex() %}\theta{% end %} stopping is strictly better and below it continuing is strictly better. One more draw costs {% katex() %}c{% end %} and improves the outcome only when it exceeds the value in hand, by the amount it exceeds it, so the expected gross gain from one more draw when holding {% katex() %}\theta{% end %} is the expected excess of a draw over {% katex() %}\theta{% end %}. Setting the expected gain equal to the cost gives the reservation equation:

{% katex(block=true) %}
c = \int_{\theta}^{v^*} (v - \theta)\, dF(v)
{% end %}

The right-hand side is the expected improvement a further draw would bring when the current best is {% katex() %}\theta{% end %}. It is a strictly decreasing function of {% katex() %}\theta{% end %}: raising the bar leaves less room above it for a draw to improve on, so the expected improvement shrinks. The left-hand side is the constant marginal cost {% katex() %}c{% end %}. There is therefore exactly one {% katex() %}\theta{% end %} solving the equation for each {% katex() %}c{% end %}, and it is the optimal reservation value.

A standard exchange argument confirms optimality:

- any policy that stops while holding a value below {% katex() %}\theta{% end %} can be improved in expectation by continuing, because a further draw is worth more than it costs there
- any policy that continues while holding a value above {% katex() %}\theta{% end %} can be improved by stopping, because a further draw costs more than it is worth there

Only the threshold rule is not improvable in either direction. So it is optimal.

**The comparative statics.** This is the part that carries the proposition's claim.

As {% katex() %}c{% end %} rises, the constant left-hand side rises. Since the right-hand side decreases in {% katex() %}\theta{% end %}, the solution {% katex() %}\theta{% end %} must fall: a more expensive search stops sooner and settles for less, satisficing becoming more aggressive as the world becomes more costly to search.

As {% katex() %}c \to 0{% end %}, the left-hand side goes to zero, and the only way the right-hand side integral goes to zero is for the lower limit {% katex() %}\theta{% end %} to rise to the top of the support, {% katex() %}v^*{% end %}. So {% katex() %}\theta(c) \to v^*{% end %} as {% katex() %}c \to 0{% end %}. The costless ideal, in which the searcher holds out for the very best option in the entire space, is recovered only in the limit where searching is free.

For every strictly positive {% katex() %}c{% end %}, the optimal threshold is strictly below {% katex() %}v^*{% end %}. The optimal policy deliberately settles for less than the best, and the size of the shortfall is set by how expensive the search is.

The threshold rule does not approximate a costless optimum it would rather have reached. It is the exact optimum of the problem the searcher actually faces. The costless optimum is a different problem, the one nobody who pays for search is solving.

</details>

> **Physical translation.** An agent that keeps regenerating a patch until it finds one that passes every check is not pursuing quality, it is running a search with the stopping threshold pinned at {% katex() %}v^*{% end %} while paying real cost {% katex() %}c{% end %} per attempt, which Proposition 5 proves is optimal only in the limit where attempts are free, so on any real token budget the agent is spending past the reservation value on every task where the first good-enough patch already cleared the bar, and the retry that finally succeeds is not evidence the policy was right, it is the coupon the policy overpaid to buy.

The Physical Translation is where this half of the post earns its place next to the theorem. Read it as the operational claim it is.

The failure the theorem catches is not that a retrying agent is lazy or careless, but the opposite: the agent is being too ambitious about outcome quality relative to the cost it is paying to chase it. A retry loop with no reservation threshold is a search that has set {% katex() %}\theta = v^*{% end %}, and Proposition 5 says that setting is optimal only when {% katex() %}c = 0{% end %}.

The moment each attempt costs real tokens, real latency, real money, the optimal policy stops earlier, at a positive distance from perfection. An agent that will not stop there is not optimizing harder, but optimizing the wrong objective, the costless one, on a budget that is not free.

One case worth naming explicitly, because SWE-bench itself grades pass or fail: if a patch's value really were binary, {% katex() %}v \in \{0, 1\}{% end %}, the reservation-value machinery above collapses to something simpler, not something different. With current best {% katex() %}0{% end %} and a per-attempt success probability {% katex() %}p{% end %}, one more draw is worth trying exactly when {% katex() %}p > c{% end %}, a threshold rule in its own right, just with only one live comparison instead of a continuum of them. That does not license unbounded retry: it is the cascade above, not this post alone, that explains why an agent's *believed* {% katex() %}p{% end %} stays above {% katex() %}c{% end %} long after its *true* {% katex() %}p{% end %} on the current broken approach has fallen below it. Simulation overprices the task, Abstraction holds the wrong frame, Rationality discounts the tests that would correct the estimate, so the number actually driving the retry decision is a confidently wrong {% katex() %}p{% end %}, not an honest one. The binary case does not weaken the argument. It sharpens exactly where the failure lives: not in the stopping rule, but in the belief the stopping rule is fed.

One more honesty note on {% katex() %}c{% end %} itself, since a deployment has to put a number on it and the theorem does not hand one over. A single retry rarely costs only its own tokens. It also costs wall-clock latency the caller is waiting on, and it costs context: a failed attempt's transcript stays in the conversation, and a context window filling up with failed attempts is a real, compounding cost that a pure per-token price misses entirely.

A deployment-grade governor has to account for all three, and the correct way to combine them is not a weighted sum of raw quantities in three different units, a token count, a duration, and a measure of accumulated confusion, added together with tunable coefficients. That is dimensionally incoherent regardless of what the weights are, the same way adding a distance in meters to a duration in seconds is incoherent regardless of the numbers chosen. The three components would first have to be converted into a common unit before they could be summed at all, and what a unit of latency or a unit of accumulated context loss is actually worth relative to a unit of token cost is a real, deployment-specific judgment this post cannot make in the abstract.

What Proposition 5 guarantees survives that accounting intact: a constant per-attempt cost implies a constant threshold, and a cost that grows as attempts accumulate, exactly what a context window silting up with failed transcripts does, implies a threshold that has to fall to match it. The theorem's shape holds either way. Only the number fed into it gets harder to compute honestly.

This is the exact link to the escalation-of-commitment case. Escalation is what a search looks like when its threshold has been driven up to {% katex() %}v^*{% end %} and its stopping rule has been removed, and the study's finding is that multi-agent structure is one of the things that removes it.

One scope note on "real token budget," because a hard cap on the number of remaining attempts is easy to mistake for a reason the threshold should fall as the deadline nears, and it is not, by itself, such a reason. For i.i.d. draws at a constant per-draw cost with no discounting, exactly this post's setup, the reservation threshold is provably the same number whether one attempt remains or a thousand: near the threshold the value of stopping equals the value of continuing by definition, so the one-step-lookahead calculation that pins down {% katex() %}\theta(c){% end %} gives the same answer at every remaining-attempt count. This is the classical "monotone case" result, and it is exactly what the exchange argument above already proved without ever mentioning how many attempts remain.

What does change the threshold is a different thing entirely: if later attempts draw from a worse distribution than earlier ones, because the search is exhausting a finite pool of candidate fixes rather than resampling {% katex() %}F{% end %} afresh each time, the model's i.i.d. assumption is the thing that breaks, not its horizon. A control-plane governor built on this proposition should track whether the *distribution* of attempts is degrading, not simply how much budget remains, because budget remaining alone says nothing about whether the threshold should move.

## Ideality: The Corner Search Cost Forbids

Proposition 5 has a limit at its edge that deserves its own name, because that limit is a concept in its own right and this series treats it as one.

<span id="def-6"></span>

<details>
<summary>Definition 6 -- Ideality: the unreachable corner where benefit is unbounded and cost is zero</summary>

**Definition 6** (Ideality). Define the ideality of a process as the ratio of the total benefit it delivers to the total cost it incurs, where cost includes search cost, harm, and complexity. A process is ideal in the limit where benefit grows without bound and every component of cost falls to zero, so that ideality diverges. In the search model of Definition 5, the ideal corner is the point {% katex() %}(c \cdot n, |v_n - v^*|) = (0, 0){% end %}: zero cost paid and zero distance from the best possible outcome, reached only when the per-option search cost {% katex() %}c{% end %} is itself zero.

</details>

The ideality concept is worth stating as its own definition, rather than folding it into the proposition, because it reframes what the whole optimization exercise is for. The ordinary way to think about an optimizer is that it navigates a trade-off: it buys outcome quality with cost, and its job is to spend well. Ideality rejects that framing at the limit.

The ideal is not a well-chosen point on the trade-off frontier. It is the corner the frontier never touches, the point where the trade-off dissolves because cost has gone to zero and benefit has gone to infinity, so there is nothing left to trade. An ideal process delivers everything and costs nothing, which is to say it does not sit on the achievable region of Definition 5 at all. It sits at the unreachable origin the region bends toward but never reaches.

The connection to Proposition 5 is exact. That is the reason the ideal deserves to be defined precisely, rather than dismissed as a fantasy. The proposition's limit statement, {% katex() %}\theta(c) \to v^*{% end %} as {% katex() %}c \to 0{% end %}, is the ideality corner approached along the cost axis. When search is free, the optimal policy holds out for the very best outcome, distance zero, at cost zero, which is exactly the ideal corner.

The ideal is neither incoherent nor useless, but the precise limit of the optimal policy as cost vanishes. It functions as the direction a real optimizer should push toward: lower the cost of search itself, and the reservation threshold rises on its own toward the ideal, without the optimizer having to override its own stopping rule.

The mistake is not aiming at the ideal. The mistake is pretending you have reached it while still paying a positive cost, which is what a retry loop with the threshold pinned at {% katex() %}v^*{% end %} is doing: acting as though {% katex() %}c = 0{% end %} while the token meter runs. Ideality names the target correctly. Proposition 5 proves that the honest way to approach it is to drive down {% katex() %}c{% end %}, not to disable the stopping rule and charge the difference to the budget.

## The Human Instance: The Sunk Cost Fallacy and Escalation of Commitment

This is the closing post of a series about portability, not a standalone note on stopping rules, because the same failure was catalogued in humans four decades before there were agents to catalogue it in, with the same defining signature. That signature is the specific thing that carries across.

Hal Arkes and Catherine Blumer named and measured the sunk cost effect in 1985, in a sequence of experiments so clean they are still the standard reference {{ cite(ref="5", title="Arkes, H.R. & Blumer, C. (1985) -- The Psychology of Sunk Cost, Organizational Behavior and Human Decision Processes 35(1), 124-140") }}. Their defining demonstration is the one that isolates the effect from every rational alternative.

People who had paid for a theatre subscription attended more plays, early in the season, than people who had received the identical subscription free. This held even though the price was paid and gone for both groups, and only the future enjoyment of each play should have mattered to the decision to attend. The money already spent, the sunk cost, was driving behavior it should have had no bearing on, because a cost that cannot be recovered is irrelevant to any forward-looking choice by construction.

Arkes and Blumer showed the effect across contexts and pinned its signature precisely: the greater the prior investment, the greater the tendency to continue, independent of the prospects going forward. That is escalation of commitment stated as an empirical regularity, and its defining feature is exactly the one Proposition 5 identifies as the failure of cost-aware stopping.

A cost-aware optimizer stops when the marginal value of continuing falls below the marginal cost, computing that comparison only over the future, because only the future is still in play. An escalating reasoner lets the past investment raise its threshold for stopping. It keeps searching past {% katex() %}\theta{% end %} because it has already spent, and the spending it has done cannot, by the structure of the reservation equation, appear anywhere in the correct decision.

**The sunk cost fallacy and escalation of commitment are a measured human finding** [Layer 2: Fit]. The tag is doing exact work, not decoration. What it asserts is that the Arkes and Blumer results are an empirically observed pattern in one substrate, consistent with the prediction Proposition 5 makes if a human decision-maker is modeled as a searcher whose stopping threshold has been contaminated by unrecoverable prior cost.

It asserts that much and no more. It does not assert that a human brain computes a reservation equation. It does not assert that the human effect and the agent effect are the same event. Those are separate claims at a different layer, and conflating them is the error this series is organized to avoid.

**The escalation-of-commitment result in the Big-Muddy study is a measured agent finding** [Layer 2: Fit]. The Barkett, Long, and Kröger study measured, in language-model agents under controlled decision structures, whether the model keeps funding a failing course of action. It found near-universal 99.2 percent escalation under symmetrical peer deliberation, and 68.95 percent allocation to failing divisions under organizational pressure, against a well-behaved individual baseline.

This is an independent measurement, in a different substrate, of the same escalation signature. It is stated as its own fact, not as evidence for a shared cause.

What makes it more than a single data point is its structure-dependence. The finding is not that agents escalate, but that agents escalate as a function of the social composition they are placed in, which is a sharper and more useful claim than a flat bias would be.

The structure-dependence connects Optimization to a strand of evidence this series has not yet touched: the game-theoretic evaluation of strategic reasoning. It belongs here because escalation inside a multi-agent structure is a strategic-reasoning failure, not only a stopping-rule failure.

Jinhao Duan and colleagues built GTBench to measure exactly the strategic-reasoning limitations of language models across game-theoretic tasks {{ cite(ref="7", title="Duan, J., Zhang, R., Diffenderfer, J., Kailkhura, B., Sun, L., Stengel-Eskin, E., Bansal, M., Chen, T. & Xu, K. (2024) -- GTBench: Uncovering the Strategic Reasoning Limitations of LLMs via Game-Theoretic Evaluations, arXiv:2402.12348") }}. They found performance that is uneven in a diagnostic way: models do better in probabilistic, incomplete-information games, and markedly worse in complete, deterministic games where the right move is a matter of strategic calculation rather than pattern completion.

The systematic survey by Haoran Sun, Yusen Wu, Yukun Cheng, and Xu Chu catalogues the broader picture across the field: language models placed in game-theoretic settings display characteristic and repeatable departures from equilibrium play, and their behavior in multi-agent interaction is not reliably captured by treating each agent as an independent rational actor {{ cite(ref="8", title="Sun, H., Wu, Y., Cheng, Y. & Chu, X. (2025) -- Game Theory Meets Large Language Models: A Systematic Survey, Proceedings of IJCAI 2025, Survey Track, 10669-10677") }}.

**These strategic-reasoning limitations are measured agent findings** [Layer 2: Fit], and they corroborate the Big-Muddy result rather than duplicate it. The escalation study shows the failure on one specific decision. The game-theoretic evaluations show that departures from optimal play in multi-agent settings are a broad and repeatable feature. Together, the two make the case that the Optimization failure this post formalizes is not an artifact of one experimental setup.

Optimization is also where a named proxy-failure mechanism this series has been tracking reaches its sharpest form. Manheim and Garrabrant split Goodhart's Law into four mechanisms. Post 2 used Causal Goodhart for the stale abstraction, and Post 3 used Regressional Goodhart for the Dunning-Kruger artifact {{ cite(ref="6", title="Manheim, D. & Garrabrant, S. (2018) -- Categorizing Variants of Goodhart's Law, arXiv:1803.04585") }}. The two remaining mechanisms are exactly the Optimization failures.

Extremal Goodhart is what happens when an optimizer pushes a proxy to its extreme, into a regime where the proxy's historical correlation with the true objective no longer holds. That is precisely what a search with its threshold pinned at {% katex() %}v^*{% end %} does: it drives toward the extreme of a measurable proxy, the passing test suite, the reward signal, past the region where that proxy tracked the outcome it was standing in for.

Adversarial Goodhart is what happens when an agent optimizing a proxy actively games it. It is the mechanism behind reward hacking, where a system optimizes the specified objective so effectively that it satisfies the letter of the metric while defeating its purpose.

**Identifying escalation and reward hacking as Extremal and Adversarial Goodhart is a fit between the cost-aware stopping formalism and the named taxonomy** [Layer 2: Fit], not a further theorem. The Layer 1 content is Proposition 5. The Goodhart labels are the recognition that a stopping rule pinned at the ideal is an Extremal-Goodhart engine, and that an agent gaming its own success metric is Adversarial Goodhart in action.

**The claim that the human escalation and the agent-side escalation are the same phenomenon** [Layer 3: Estimate]. This is the series' own interpretive act. It carries the only real risk in this section, exactly as every prior post set out.

The Layer 1 result, Proposition 5, is a triviality of the search-theoretic mathematics and holds for any cost-bearing searcher by construction. The Layer 2 findings are separate measurements, each independently consistent with that shape. The Layer 3 claim that they are one phenomenon, rather than two phenomena of the same shape, is where the classical objection lands.

It lands here for the same reason it landed in every earlier post. Multiple realizability is the standard warrant for calling a functional property shared across substrates. Hilary Putnam, who introduced that warrant, later argued that real mental kinds are compositionally and computationally plastic enough that a single functional kind need not correspond to one clean computational state {{ cite(ref="9", title="Putnam, H. (1988) -- Representation and Reality, MIT Press, Chapters 5-6, the reconsideration of functionalism") }}.

That objection does not touch Proposition 5, and does not touch the two measurements. It targets only the identity claim. The right posture, held consistently across this series, is that the identity is offered as an estimate with its own standing objection attached, never as settled.

There is one wrinkle specific to Optimization worth naming. The agent escalation is emergent from multi-agent structure, and the human escalation is measured in individuals, so the Layer 3 identity here is doing slightly more work than elsewhere, asserting that a structurally-induced agent effect and a dispositionally-measured human effect are the same kind. That is a real reason to hold this particular estimate a little more loosely than the others, and the falsification criteria below make the extra caution concrete.

## Five Properties, One Loop: The MAPE-K Correspondence

The series has now formalized all five properties. Before the closing synthesis reassembles them, it is worth naming a correspondence that has been latent in the structure the whole time: the five-property decomposition this blog inherited from its founding post is not idiosyncratic.

It is, component for component, the same decomposition that autonomic computing arrived at independently for self-managing systems. Seeing the two line up is a check on the decomposition, not a coincidence to note in passing.

The autonomic-computing reference model is the MAPE-K loop, formalized in the vision of autonomic computing and adapted on this blog for edge conditions in the Autonomic Edge Architectures series {{ cite(ref="10", title="Kephart, J.O. & Chess, D.M. (2003) -- The Vision of Autonomic Computing, IEEE Computer 36(1), 41-50") }}. A self-managing system, in that model, runs a loop with four active stages over a shared store:

- **Monitor.** Gathers the state of the system and the world.
- **Analyze.** Interprets the raw state into a model of the situation.
- **Plan.** Decides what to do about the situation the analysis produced.
- **Execute.** Acts on the world.

All four stages read from and write to a fifth component, Knowledge: a shared store of models, policies, and history that no single stage owns and every stage uses. The loop is written MAPE-K precisely because the K is not the fifth step, but the substrate the other four run on.

The correspondence to this series' five properties is exact, and stating it in words is the point: the value of the mapping is in the one place it does not run the way the surface pairing would suggest.

- Monitor corresponds to Noticing and Simulation together: the stage that registers what the situation contains and prices what it will cost is the stage that gathers state and forecasts. That is Post 1's pairing exactly, the two treated as one because they are inseparable.
- Analyze corresponds to Abstraction: the stage that turns gathered state into a model of the situation is the stage that summarizes raw data into a sufficient statistic, Post 2's first half.
- Plan corresponds to Rationality: the stage that decides what to do about the analyzed situation is the stage that updates beliefs on evidence and chooses accordingly, Post 2's second half.
- Execute corresponds to Optimization: the stage that acts, under budget, is the stage that decides when the search has done enough and commits, this post.

Four of the five properties line up with the four active stages of the loop, one for one, in the founding post's own dependency order.

The fifth is where the mapping earns its keep, and it is the finding worth stating explicitly, rather than leaving for the reader to infer. Knowledge corresponds to Awareness by *position* in the architecture, not by mechanism: Knowledge in the MAPE-K reference model is a passive store, while Awareness's actual teeth, the shadow-mode reconciliation loop Post 3 proved is required, is an active process, not a store. What corresponds is where each one sits. Knowledge is not a stage, but the cross-cutting store that every stage reads and writes, owned by none of them, sitting orthogonal to the pipeline rather than inside it, and an active Awareness process is exactly the kind of thing that would read and write against a store occupying that same orthogonal position. The correspondence licenses placement, not the claim that a store can do a loop's job. Concretely: the reconciliation logic runs as its own process, task, or actor, never as code executing inside the store's own read or write path, exactly as any active worker in a distributed orchestration system sits outside the shared state it reads and writes rather than inside it. The store stays exactly as passive as MAPE-K's own reference model already requires; nothing here asks it to be anything else.

The isolation the Franzen caveat demands has to be structural, not merely organizational. If the reconciliation process can read or act on the agent's own working state directly, sharing anything mutable the agent also touches, the independence the whole argument relies on is compromised before the first check runs, whatever the arrangement looks like on paper. What actually makes a check external is that the two processes meet only at their boundary: the agent's completed state is the only thing the reconciliation process ever sees, and its own verdict is the only thing it is ever allowed to feed back. That is the same closure von Foerster described and Proposition 4 makes exact, restated as a constraint on where the checker may stand rather than as a logical one: it cannot be inside the same self-referential loop as the thing it checks.

That is exactly how this series has treated Awareness from the start. Post 3 placed Awareness alone, outside the four paired properties, and gave a structural reason: Awareness is second-order, an operation on the system's own operations rather than a first-order operation on the world, so it cannot be one stage in a pipeline of world-facing stages.

The MAPE-K model, built by a different community for a different purpose, made the identical structural choice, putting Knowledge cross-cutting rather than in-line, for the identical structural reason: the store of what the system knows about itself and its history is used by every stage and is not any one of them.

Two decompositions, arrived at independently, agree not just on the four active stages, but on the harder point that the self-knowledge component is categorically different from the other four. That agreement is a reason to trust the decomposition. It is also the specific thing the diagram below shows that a linear reading of the five properties does not: the pipeline is linear, and the self-knowledge component is not on it.

**This structural correspondence is itself offered as an estimate, not a proof** [Layer 3: Estimate], for the same reason every other cross-domain match in this series carries that tag. MAPE-K and this series' five properties were built for different purposes, by different communities, one for engineering self-managing systems and one for describing engineering judgment. The alignment is evidence that this decomposition carves the problem at a real joint, the way two independent surveys landing on the same coastline is evidence the coastline is really there. It is not a proof that no other five-part decomposition would serve as well, and it is not the kind of claim, unlike Proposition 4, that a theorem could settle either way.

{% mermaid() %}
graph LR
    M[Monitor] --> A[Analyze]
    A --> P[Plan]
    P --> E[Execute]
    K[Knowledge] -.-> M
    K -.-> A
    K -.-> P
    K -.-> E
    M -.- N["Noticing + Simulation"]
    A -.- AB["Abstraction"]
    P -.- R["Rationality"]
    E -.- O["Optimization"]
    K -.- AW["Awareness"]
{% end %}

<figcaption>Figure 1: the four active stages of MAPE-K map one-for-one onto Simulation, Abstraction, Rationality, and Optimization in the founding post's dependency order, and Knowledge maps onto Awareness. The solid arrows are the pipeline. The dotted arrows from Knowledge to every stage are the reason Awareness stands alone: it is the cross-cutting store the whole loop runs on, not a step within it.</figcaption>

## The Bookend: One Case, Five Failures, One Cascade

Post 1 opened this series with a single case: six frontier models asked to price and forecast their own work on a subset of SWE-bench Lite. It read that case through one property, Simulation.

The completed framework can now read the same case through all five. The point of doing so is not to show that five lenses see more than one. It is to show that the five failures are not five independent observations about one case. They are one causal cascade, each failure creating the conditions for the next, and the cascade is why compute spent at the last stage cannot repair a deficit that originated at the first.

Recall the exact case. In April 2026, Andrey Fradkin and Rohit Krishnan ran MarketBench across six recently released frontier models, Claude Opus 4.5, Gemini 3 Pro Preview, GPT-5.2, GPT-5.2-pro, Claude Sonnet 4.5, and GPT-5-mini, on a 93-task subset of SWE-bench Lite. Each model was asked to forecast its success probability and token cost before attempting each task.

The token-cost estimates ran roughly one fifth of the true cost, a factor of about five underestimation. Stated success probabilities ranged from 61.4 to 92.9 percent, while realized pass rates clustered between 75.3 and 80.6 percent. Post 1 read the underestimation as a Simulation failure and stopped there, deliberately, because that was the property Post 1 was about.

Now follow what that first failure sets in motion.

The **Simulation** failure is the entry point. The model prices the task at a fifth of its true cost. As Post 1 proved through Ashby's Law, a regulator can spend only the variety it has noticed, and at forecast time the model has noticed a two-line issue description and almost none of the task's real disturbance variety. The forecast is forced low.

So far this is Post 1's story, and on its own it is merely an inaccurate estimate.

The underestimate does not stay contained. This is where the cascade begins.

Because the model has priced the task cheap, it commits to the first patch strategy that looks plausible, allocating the small budget its forecast justified. When that strategy's cost assumptions break, when the patch turns out to touch more of the codebase than the cheap forecast allowed for, the correct move is to re-abstract: return to the raw repository state and re-derive a summary sufficient for the task as it actually is, not as the cheap forecast imagined it.

The model does not do this. It holds the original abstraction fixed and keeps working through it. That is the **Abstraction** failure Post 2 formalized: a sufficient statistic fitted to the task-as-forecast, held past the moment the task-as-encountered diverged from it, with the information needed to notice the divergence sitting in the raw data the abstraction already discarded.

The undersimulation caused this. A system that had priced the task correctly would have budgeted for the exploration that surfaces the need to re-abstract. A system that priced it cheap has already spent its budget committing to the first frame.

The stale abstraction then distorts the next stage. Working through a frame that no longer fits, the model runs tests, and some of them fail. Failing tests are disconfirming evidence: they carry the signal that the chosen approach is wrong. A cost-aware reasoner would weight that signal by its true diagnostic value, which for a failing test on a committed approach is high.

The model instead discounts it, because the failing test contradicts the approach it has already abstracted the task around. That is the **Rationality** failure Post 2 formalized as asymmetric updating: confirming evidence inflated, disconfirming evidence suppressed, the posterior drifting away from the truth by an amount that grows with the evidence seen.

The stale abstraction caused this. The disconfirming test is disconfirming only relative to the frame, and a model holding the frame fixed reads the test as noise to be worked around, rather than as the counterexample that should break the frame.

The discounted disconfirmation then blinds the stage above it. Having suppressed the evidence that its work is wrong, the model arrives at a self-assessment: high confidence in a diff that does not resolve the issue.

This is the **Awareness** failure Post 3 formalized. Post 3 proved it is the one failure in the cascade with a genuine formal-system-grade limit behind it: a reasoner whose self-trust is provability-based cannot certify its own soundness from within without collapse, so the confidence the model reports is generated by a process that structurally cannot verify the thing the confidence is about.

The asymmetric updating caused this specific instance. A model that had absorbed the failing tests at their true weight would have had the disconfirming mass its self-assessment needed. A model that suppressed them has fed its self-model a stream with the counterevidence already filtered out.

And the unwarranted confidence forces the final stage into the failure this post formalized. Confident in a broken diff and blind to the brokenness, the model does not stop. It retries, regenerates, escalates, spending more budget on an approach the evidence already condemned. That is the **Optimization** failure: a search with its stopping threshold pinned at {% katex() %}v^*{% end %} while it pays real cost per attempt, escalation of commitment in the exact sense the Big-Muddy study measured.

Here the multi-agent finding bites. A system that dispatches the retry to a deliberating group of agent instances, rather than to a single instance that might have cut its losses, has assembled precisely the symmetrical peer structure the study found drives escalation to near-universal. The undersimulation at the entrance has become, five stages later, a retry loop that cannot terminate.

| Stage | Failure | Upstream cause | What it produces downstream |
|---|---|---|---|
| Simulation | Prices the task at about one fifth of its true cost | Forecast-time variety far smaller than task variety (Ashby's Law) | A small budget committed before exploration reveals the task's real shape |
| Abstraction | Holds the original plan fixed after it stops fitting | The cheap forecast never budgeted for the exploration that would trigger re-abstraction | A frame that reads later disconfirming evidence as noise to route around |
| Rationality | Discounts failing tests as noise | The stale abstraction makes disconfirming tests look irrelevant to the chosen frame | A self-assessment built on a filtered evidence stream |
| Awareness | Reports high confidence in a broken diff | Disconfirming mass suppressed before it reached the self-model | A confidence signal with the counterevidence already removed |
| Optimization | Retries past the point the evidence condemned | Confident, blind self-assessment gives the search no signal to stop on | A retry loop that cannot terminate on its own |

<figcaption>Table 0: the same case reread as one causal cascade rather than five independent observations. Each column's failure is the next column's cause; fixing the retry loop at the bottom does not touch the deficit that originated at the top.</figcaption>

The cascade is the argument for why the failures cannot be fixed at the stage where they surface. The retry loop is where the cost is visibly burned, so the natural instinct is to fix it there: a better retry policy, a smarter stopping heuristic, more compute to find the patch that finally works.

Every one of those fixes is applied at the Optimization stage, and the deficit did not originate there. It originated in the Simulation undersimulation five stages upstream, propagated through a stale abstraction and an asymmetric update and a blind self-assessment, and arrived at Optimization as a search that cannot stop because the four stages above it have removed every signal that would tell it to.

This is exactly the invariant of the {% term(url="@/blog/2025-12-27/index.md#the-constraint-sequence-framework", def="A candidate constraint cannot be resolved by re-optimizing at the level of abstraction that revealed it; the dependency graph determines which constraint must be secured before the next one becomes binding") %}Constraint Sequence Framework{% end %}: a constraint that surfaces at one level cannot be resolved by re-optimizing at that level, because the dependency graph puts the binding constraint upstream of where it became visible. Spending more compute on retries is re-optimizing at the level where the constraint surfaced, and the framework says, and the cascade demonstrates, that this cannot work.

The retry loop is the [iteration trap](@/blog/2026-07-29/index.md) this blog has named before. The cascade is why the trap is baited upstream: the Optimization failure is an unaddressed Simulation failure wearing the costume of a stopping problem.

## The Closing Synthesis: Self-Consistency and Why Verification Is Not Optional

The series has one argument left to make: the one the whole structure was built to reach. It has to be made carefully, because the tempting version of it is an overclaim. The discipline of the series is to make the defensible version instead, and to mark exactly where the defensible version stops.

Begin with a definition, because the argument turns on a property the series has been circling without naming precisely.

<span id="def-self-consistency"></span>

A property is **self-consistent** for a system if the system's belief that it possesses that property can be verified using only the system's own internal resources. A self-consistent property is one a system can check on itself, from the inside, without appeal to anything external.

The question the series has been building toward is which of the five properties are self-consistent. A property that is self-consistent needs no external verification loop. A property that is not self-consistent requires one, structurally, and the cost of that loop is the portability gap.

Post 3 proved the one hard result in this vicinity. For a reasoner whose self-trust is provability-based, Awareness is not self-consistent: the reasoner cannot certify its own soundness from within without deriving everything, which is Critch's resource-bounded generalization of Loeb's theorem applied to exactly that class of reasoner.

**This is a genuine Layer 1 result** [Layer 1: Bound], a formal-system-grade theorem about a precisely specified class of reasoner. It is the single instance in this series where the claim that a property cannot verify itself is proven rather than estimated. Awareness has a self-consistency ceiling, and the ceiling is a theorem.

The series now proposes that the other four properties have self-consistency ceilings too, and here is where the discipline has to hold.

**The extension of the self-consistency ceiling from Awareness to Simulation, Abstraction, Rationality, and Optimization is this series' own structural generalization, offered explicitly at Layer 3** [Layer 3: Estimate]. It is not, and must not be read as, four more instances of a Loebian or Godelian proof. Only Awareness carries a formal-system-grade theorem. Simulation does not have a hidden proof that it cannot self-verify, and neither does Abstraction, Rationality, or Optimization.

What the other four have is a strong structural argument, and the argument is not that each secretly contains Loeb's theorem. The argument is this: each of the four failures, as its own proposition showed, requires for its detection exactly the information the failing property has structurally excluded from itself.

- Simulation cannot detect its own undersimulation, because the detection requires the disturbance variety the forecast did not notice, which is what Post 1's Ashby bound formalizes.
- Abstraction cannot detect its own staleness, because the detection requires the residual the abstraction discarded, which the data-processing inequality proves is unreachable from the abstraction.
- Rationality cannot restore its own disconfirming mass, because the asymmetry that needs correcting is what governs the sampling.
- Optimization cannot recognize its own escalation, because, as the Big-Muddy result shows, the escalation is emergent from the very multi-agent structure the optimization runs inside, so the structure cannot be the thing that flags it.

In each case the property is blind to its own failure for a reason internal to what the property is, and in each case that blindness is a Layer 1 result of the property's own proposition. What is Layer 3 is the claim that these four blindnesses are the same kind of thing as Awareness's proven self-consistency ceiling. They rhyme with it. They are not proven to be it.

That distinction is the whole honesty of the synthesis. It is worth stating what survives it and what does not.

What does not survive is any claim that the series has proven five self-verification ceilings. It has proven one. What does survive, and it is enough, is the argument the one proof makes available. If even a rigorously scoped formal reasoner, the cleanest possible case, cannot verify one of its own properties from within, then the expectation that the messier, informal versions of self-verification succeed for the other four is an expectation with the burden of proof against it.

The one theorem does not prove the other four ceilings. It shifts the default. It makes external verification the thing you should assume is necessary until shown otherwise, rather than the thing you bolt on when self-checking visibly fails. It does this because the one place the question was settled rigorously, it was settled against self-verification.

This is the actual argument the series produces, stated as its conclusion: external falsification is not optional scaffolding for any of the five properties. For Awareness it is required by theorem. For the other four it is required by a structural argument that each property is blind to its own characteristic failure, an argument the one theorem makes it unreasonable to bet against.

A system cannot be trusted to audit, from within, the properties whose failures it is structurally unequipped to see. The loop that audits them from outside is not a design luxury that a better architecture would eliminate, but the price of the fact that a property and the check on that property cannot both live inside the same closure.

This lands where an earlier series on this blog landed, from the opposite direction. [Theorems Out of Warranty](@/blog/2026-07-08/index.md) argued that a guarantee quietly stops covering what it was never proven to cover: the warranty on a result expires exactly at the boundary of the theorem's stated conditions, and the danger is trusting the guarantee past that boundary.

This series arrives at the same place by asking not what a borrowed theorem stops covering, but what a system can verify about itself. The answer, for the one property where it can be settled rigorously, is that the system cannot verify the thing that matters most.

A guarantee that stops covering what it never proved, and a self-check that cannot reach the property it is checking, are the same gap seen from two sides. The warranty ran out at the theorem's boundary in the earlier series. Here it runs out at the boundary of the system's own closure. In both cases, what lies past the boundary is not covered, and pretending it is covered is the failure.

## Falsification Criteria

A claim that cannot be wrong is not a claim, so this post states the conditions under which each of its two central assertions would fail. Each is concrete and checkable, and each is aimed at a specific layer of a specific claim.

**F1 (the cost-aware stopping proposition).** A cost-bearing sequential searcher is exhibited whose expected total cost, search cost plus distance from {% katex() %}v^*{% end %}, is strictly lower under a non-threshold policy than under the reservation-value threshold rule of Proposition 5, on an option distribution with well-defined finite moments and a strictly positive per-option cost.

This would falsify Proposition 5 directly. The reservation rule is derived as the unique non-improvable policy under exactly those conditions, so a policy that beats it would mean the exchange argument is mis-stated.

This is the strongest falsification, and the least likely, because the result is a theorem of search theory. But a post that exempted its own foundation from falsification would not be honest about where its risk lives. The risk, however small, lives here too.

A weaker but more reachable version: an agent is shown to reach outcomes indistinguishable from an unbounded-retry policy while provably enforcing a positive reservation threshold. That would confirm rather than falsify the proposition, and is included to show the criterion is not rigged to be unfalsifiable in both directions.

**F2 (the Layer 3 self-consistency generalization).** A property among Simulation, Abstraction, Rationality, and Optimization is shown to be self-consistent for a real system: the system verifies, using only its own internal resources, that it possesses the property, at a reliability indistinguishable from an external verification loop, across a held-out task distribution it was not tuned against, without covertly importing an external check.

Concretely for Optimization: an agent is shown to detect and halt its own escalation of commitment from inside the same multi-agent structure that produces the escalation, at a reliability matching an external stopping governor, out of distribution.

If this happens for any of the four, the Layer 3 generalization is wrong for that property. External falsification is not structurally required there, but merely useful, which would shrink or remove that property's portability gap.

Note the deliberate asymmetry with Post 3's F1. F2 here cannot touch Awareness, whose self-consistency ceiling is a Layer 1 theorem and is falsifiable only on its own terms. It cannot touch Proposition 5 either, which is a stopping-theory result independent of the generalization. F2 attacks only the estimate that the four informal ceilings are real, the only part of the synthesis offered as an estimate.

**F3 (the cross-substrate identity for Optimization).** The human escalation of commitment is shown to arise entirely from a mechanism with no analogue in the agent case, in a way that severs the two rather than uniting them.

Concretely, either of these would do it: the human sunk cost effect is shown to be wholly a self-presentational or affective mechanism that vanishes when the decision is private and stakeless, while the agent escalation persists in the stakeless multi-agent condition; or, conversely, the agent escalation is shown to be entirely an artifact of prompt framing that disappears under neutral elicitation while the human effect persists.

Either result breaks the Layer 3 identity: the first by showing the two effects share a shape but not a cause, the second by dissolving the agent effect into an elicitation artifact. F3 is stated with the extra caution this post flagged. The agent effect is emergent from multi-agent structure and the human effect is measured in individuals, so the identity here starts from a wider gap than the identities in the earlier posts, and needs the sharper falsification condition to match.

## The Property Verdict Ledger, Complete

The series has accumulated one artifact across its four posts, a ledger with one entry added per post, and this is where it is assembled in full. It is the payoff object the whole series has been building toward, the running record that substitutes for a continuous specimen, and it is a deployment gate rather than only a diagnosis: each entry's final field names the specific architectural response a failed verdict demands, not a general suspicion of the agent.

**Noticing + Simulation**

*Formal Proposition:* Proposition 1: Ashby's Law of Requisite Variety, {% katex() %}V(\text{outcome}) \geq V(\text{disturbance}) - V(\text{regulator}){% end %}

*Human Instance:* Planning fallacy: systematic underestimation of task resources (Kahneman and Tversky 1979; Buehler, Griffin and Ross 1994)

*Agent Instance:* MarketBench: six frontier LLMs, roughly 5x token-cost underestimation, stated confidence 61 to 93 percent against actual pass rates 75 to 81 percent (Fradkin and Krishnan 2026)

*Exact vs. Approximate:* Layer 1 exact for the theorem; Layer 3 approximate for the cross-substrate identity of the two failures

*Verdict:* Agent does not reliably demonstrate Simulation: self-forecast miscalibrated in the direction the bound predicts, confidence decoupled from realized performance

*Control-Plane Consequence:* A resource-estimation floor gating admission, calibrated against measured variety rather than self-reported confidence: the agent is not trusted to price its own work until an external loop has raised or verified its forecast-time variety

**Abstraction**

*Formal Proposition:* Proposition 2: sufficiency, {% katex() %}P(T \mid D, A) = P(T \mid A){% end %}; stale-abstraction loss {% katex() %}I(D; T_{\text{new}} \mid A) \geq 0{% end %}

*Human Instance:* Functional fixedness and Einstellung: a target-specific abstraction reused past its sufficiency (Duncker 1945; Luchins 1942)

*Agent Instance:* Tool-failure recovery: LLM agents persisted with invalidated strategies, PRR down roughly 37 percent under implicit failures, fault tolerance scaling 3.66x slower than task execution (Zhu et al. 2026); human-side corroboration in chat-search fixedness (Liu, Karimnazarov and White 2025)

*Exact vs. Approximate:* Layer 1 exact for the sufficiency identity and the information-loss quantity; Layer 3 approximate for the cross-substrate identity of the two fixedness effects

*Verdict:* Agent does not reliably demonstrate Abstraction: it cannot detect a stale abstraction from within, because the detecting information was discarded at abstraction time

*Control-Plane Consequence:* A re-abstraction loop that retains the raw data and re-derives sufficiency against the current target, triggered on divergence signals rather than trusted to self-detect

**Rationality**

*Formal Proposition:* Proposition 3: asymmetric updating, {% katex() %}g(\ell) = w_+ \ell_+ + w_- \ell_-{% end %}, diverges from Bayes by {% katex() %}n\Delta{% end %}

*Human Instance:* Confirmation bias: preferential weighting of confirming over disconfirming evidence, in many guises (Nickerson 1998)

*Agent Instance:* Framing-and-confirmation study: an LLM reinforced handed premises and flipped conclusions with framing on identical inputs (Li, Wang and Yang 2025)

*Exact vs. Approximate:* Layer 1 exact for the divergence and sign-flip results; Layer 3 approximate for the cross-substrate identity of the two confirmation effects

*Verdict:* Agent does not reliably demonstrate Rationality: it updates asymmetrically and cannot restore its own disconfirming mass from within

*Control-Plane Consequence:* A falsification loop that constructs and injects hypothesis-breaking tests, restoring the disconfirming evidence the reasoner will not sample for itself

**Awareness**

*Formal Proposition:* Proposition 4: Critch's resource-bounded Loeb's theorem, a provability-based reasoner cannot derive {% katex() %}\Box(\Box\phi \rightarrow \phi){% end %} without deriving {% katex() %}\Box\phi{% end %} for arbitrary {% katex() %}\phi{% end %}

*Human Instance:* Dunning-Kruger miscalibration, interpretation revised as largely Regressional Goodhart artifact (Kruger and Dunning 1999; Nuhfer et al. 2017; Gignac and Zajenkowski 2020), plus Bandura self-efficacy and reciprocal determinism as the behavioral-consequence complement (Bandura 1977, 1986)

*Agent Instance:* Situational-awareness evals showing self-knowledge lags general capability (Laine et al. 2024), and the H2AI Control Plane shadow-mode reconciliation gap between agent self-report and independent ground-truth check

*Exact vs. Approximate:* Layer 1 exact for the theorem, holding for provability-based reasoners only; agent-side application exact for provability-based agents and Layer 3 analogy for deployed language models; Layer 3 analogy for the human side, never the same theorem

*Verdict:* Agent does not reliably demonstrate Awareness: it cannot certify its own soundness from within, by theorem for the provability-based case and by evidence for the deployed case

*Control-Plane Consequence:* The shadow-mode reconciliation loop: an external audit that checks work against ground truth the agent did not generate, run as a separate control-plane mechanism because Proposition 4 proves self-assessment cannot replace it for the reasoner class it governs

**Optimization**

*Formal Proposition:* Proposition 5: cost-aware optimal stopping, reservation threshold {% katex() %}\theta(c){% end %} with {% katex() %}\theta(c) \to v^*{% end %} as {% katex() %}c \to 0{% end %}; ideality (Definition 6) as the costless corner search cost forbids

*Human Instance:* Sunk cost fallacy and escalation of commitment: prior investment raising the stopping threshold (Arkes and Blumer 1985)

*Agent Instance:* Big-Muddy escalation: individual decisions near-rational, symmetrical multi-agent deliberation about 99.2 percent escalation, organizational pressure about 68.95 percent (Barkett, Long and Kröger 2025); strategic-reasoning limits (Duan et al. 2024; Sun et al. 2025); escalation and reward hacking as Extremal and Adversarial Goodhart (Manheim and Garrabrant 2018)

*Exact vs. Approximate:* Layer 1 exact for the stopping theorem; Layer 3 approximate for the cross-substrate identity, held more loosely because the agent effect is emergent from multi-agent structure and the human effect is dispositional

*Verdict:* Agent does not reliably demonstrate Optimization: it escalates past the reservation threshold, and the escalation is emergent from multi-agent structure rather than individual disposition

*Control-Plane Consequence:* An external optimal-stopping governor: a reservation-threshold circuit-breaker that caps escalation, placed outside the agents' own deliberation because the bias is a property of the multi-agent structure

The Exact-versus-Approximate field carries the three-layer discipline into every entry. Read across the five in sequence, it tells the honest story of the series in miniature.

Every formal proposition is exact and substrate-free at Layer 1. Every mapping of a theorem onto its measured failures is a Layer 2 fit. Every claim that a human failure and an agent failure are one phenomenon is a Layer 3 estimate, offered as one, with Putnam's own reversal of multiple realizability attached, and in the Awareness entry the additional distinction that even the theorem's reach into deployed language models is an analogy rather than an application.

Five negative verdicts, and not one of them is an insult to systems that resolve hard tasks. Each is a precise statement that one specific property fails in the direction its own theorem predicts and its own study measures.

## The Portability Gap, Now a Number

The series was built around one coined term, the portability gap. A coined term that stays a phrase is decoration. This blog's standing habit is to turn a coined term into a computable quantity, and the completed ledger is where the portability gap becomes one.

The portability gap for a property was defined in Post 1 as the latency and compute cost of the external verification loop that property needs because it cannot certify itself from within. The ledger's Control-Plane Consequence field names five such loops, one per property. The total portability gap for a system that must audit all five is the sum of the five loops' costs.

That sum is the number the term was always pointing at. Computing it, even illustratively, is what makes the term a quantity rather than a gesture.

The costs are best expressed as overhead relative to the base task, meaning the compute the agent spends doing the work itself. That is the denominator a deployment actually cares about: how much does correctness cost, as a fraction of doing the work.

The figures that follow are illustrative unit costs chosen to show that the sum is computable, in the same spirit Post 1 traced an illustrative bit-accounting for the forecast error. They are not measured values from any particular system. With that stated plainly:

| Property | External loop | Illustrative cost (fraction of base compute) | Why |
|---|---|---|---|
| Simulation | One exploratory pass raising noticed variety before the forecast is trusted | 0.15, plus one added round-trip of latency | Cheapest of the conditional loops; a single pass is enough to raise the floor |
| Abstraction | Re-abstraction loop, retains raw data, re-derives sufficiency on divergence | 0.10, paid only when divergence triggers it | Conditional: most tasks never diverge from their original frame |
| Rationality | Falsification loop, constructs and runs hypothesis-breaking tests | 0.25 | Most expensive conditional loop; manufacturing genuine disconfirming evidence is real work |
| Awareness | Reconciliation loop, checks work against ground truth the agent did not generate | 0.30 | Structural, not optional: Proposition 4 proves the agent cannot do this from within |
| Optimization | Stopping governor, monitors the reservation threshold, trips on escalation | 0.05 | Cheapest overall: enforcing a threshold is far cheaper than searching past it |
| **Total** | | **0.85** | Sum of the five, illustrative unit costs, not a measured value from any real system |

<figcaption>Table 5: the portability gap as a computed number rather than a phrase. On these illustrative figures, auditing correctness across all five properties adds about 85 percent to the cost of the base work.</figcaption>

Summed, the total portability gap for the five-property audit is about {% katex() %}0.15 + 0.10 + 0.25 + 0.30 + 0.05 = 0.85{% end %} of the base task's own compute. On these illustrative figures, auditing correctness across all five properties nearly doubles the cost of the work. That number is the portability gap made concrete: what it costs to carry a portable architecture across the substrate boundary once you stop assuming a portable architecture came with a portable guarantee.

The precise value will differ by system, and by how many tasks trigger the conditional loops. The point is not the specific 0.85. The point is that the term now denotes a sum a deployment can actually compute, one loop cost per property, and that the sum is a large fraction of the base cost rather than a rounding error.

Correctness is not free to port. The portability gap is exactly the size of the bill, and the completed ledger is the itemized invoice.

This is the payoff the series was structured to deliver. Post 1 introduced the portability gap and quantified it for one property, while openly deferring the proof that the external loop is unavoidable. Post 3 proved that unavoidability for the one property where it can be proven.

This post sums the five loops into the total and states the number. In doing so it closes the arc: the coined term began as a name for a difference, became a per-property cost, and ends as a computable total that says, in a single fraction, what it costs to trust an agent's five cognitive properties when the agent cannot verify any of them from within.

## What This Post Did Not Claim

Because the closing synthesis is the most tempting place in the entire series to overclaim, the list of omissions is more load-bearing here than anywhere, and each item is a claim this post deliberately refused to make.

- It has not been claimed that the four self-consistency ceilings beyond Awareness are proven. Only Awareness carries a formal-system-grade theorem, Critch's resource-bounded Loeb result scoped to a provability-based reasoner. The extension to Simulation, Abstraction, Rationality, and Optimization is this series' own Layer 3 generalization, and reading it as four more theorems is exactly the overreach the layer discipline exists to prevent. What the four have is a structural argument that each is blind to its own characteristic failure, and an inference, from the one place the question was settled rigorously, that the informal versions should be presumed to share the ceiling until shown otherwise.

- It has not been claimed that satisficing is a concession. Proposition 5 establishes the opposite: once a positive search cost is priced in, the satisficing threshold is the optimal policy and the costless maximum is the wrong target. A system that stops at the reservation value is not settling, but optimizing the objective it actually faces, and a system that refuses to stop is the one making the error, by optimizing a costless objective on a budget that is not free.

- It has not been claimed that the agents escalate because they are individually biased. The Big-Muddy finding is the reverse: individual decisions were near-rational, and the escalation emerged from the multi-agent structure. The control-plane consequence follows from that specific shape, an external governor placed outside the deliberation, because a fix applied to the individual agent addresses a bias the individual agent does not have.

- It has not been claimed that the portability gap's 0.85 is a measured value. It is an illustrative sum of illustrative per-loop costs, included to show the term denotes a computable quantity, and the real value is system-specific. What is claimed is only that the total is a sum of five nameable loop costs and that it is a large fraction of the base cost, not a rounding error.

- It has not been claimed that external verification is a temporary scaffold that better models will outgrow. The argument is structural: a property and the check on that property cannot both live inside the same closure, proven for Awareness and argued for the rest, so the external loop is the price of the closure, not the price of an immature architecture.

> **Cognitive Map**
>
> 1. Optimization is choosing when to stop searching under cost, and its failure is the refusal to stop, escalation of commitment. Once a positive per-option search cost is priced in, the optimal policy is a reservation-value threshold, satisficing in form and the true optimum rather than an approximation, with the costless ideal recovered only in the limit as cost goes to zero, a corner search cost structurally forbids.
> 2. Arkes and Blumer measured the human sunk cost effect in 1985. The Big-Muddy study measured the agent version and found the sharper fact that escalation is emergent from multi-agent structure, near-universal under symmetrical peer deliberation, not a disposition the individual carries.
> 3. The five properties map one-for-one onto the MAPE-K loop, with Knowledge standing exactly where Awareness stands, cross-cutting rather than in-line, which is why Awareness was always alone.
> 4. The opening SWE-bench case, reread through all five, is one causal cascade: undersimulation forces a committed abstraction, the stale abstraction discounts disconfirming tests, the discounted evidence blinds the self-assessment, and the unwarranted confidence forces the retry loop. The Optimization failure is an unaddressed Simulation failure five stages upstream, which is why compute spent on retries cannot fix it.
> 5. Self-consistency, a property a system can verify about itself from within, holds for none of the five: proven absent for Awareness at Layer 1, argued absent for the other four at Layer 3, never four more hidden theorems. External falsification is therefore not optional scaffolding for any property, the same gap Theorems Out of Warranty found from the other side.
> 6. Architecture is portable. Correctness is not, and the portability gap is now a number: the summed cost of the five external loops, illustratively about 0.85 of the base task, the itemized bill for trusting five properties none of which can audit itself.

**Compute it.** Before trusting an agent to optimize, check one thing directly: is there a stopping rule outside the agent's own deliberation, and is its threshold set below perfection? If the agent decides for itself when it has done enough, it is running a search that will pin its threshold at the ideal and pay real cost to chase it, and if that agent is one of a deliberating group, the Big-Muddy result already tells you the group will escalate where the individual would have stopped. The only fix is a governor placed outside the deliberation, capping the search at the reservation value the cost actually justifies. And before trusting any of the five properties, ask the question the whole series was built to make askable: can the agent verify, from inside, that it has this property? For four of the five the answer is a structural no, and for the fifth it is a proven no, so the number that matters is not how confident the agent is in any of them, but the cost of the external loop that checks each one, summed across all five, because that sum is what correctness costs once you stop assuming it came free with the architecture. A system that has never been audited from outside, and a system that has, look identical on the dashboard. They stop looking identical the moment the work has an effect.

---
<sup>[1]</sup> Barkett, E., Long, O. & Kröger, P. (2025). *Getting out of the Big-Muddy: Escalation of Commitment in LLMs.* arXiv:2508.01545.

<sup>[2]</sup> Simon, H. A. (1956). *Rational Choice and the Structure of the Environment.* Psychological Review, 63(2), 129-138.

<sup>[3]</sup> Stigler, G. J. (1961). *The Economics of Information.* Journal of Political Economy, 69(3), 213-225.

<sup>[4]</sup> McCall, J. J. (1970). *Economics of Information and Job Search.* Quarterly Journal of Economics, 84(1), 113-126.

<sup>[5]</sup> Arkes, H. R. & Blumer, C. (1985). *The Psychology of Sunk Cost.* Organizational Behavior and Human Decision Processes, 35(1), 124-140.

<sup>[6]</sup> Manheim, D. & Garrabrant, S. (2018). *Categorizing Variants of Goodhart's Law.* arXiv:1803.04585.

<sup>[7]</sup> Duan, J., Zhang, R., Diffenderfer, J., Kailkhura, B., Sun, L., Stengel-Eskin, E., Bansal, M., Chen, T. & Xu, K. (2024). *GTBench: Uncovering the Strategic Reasoning Limitations of LLMs via Game-Theoretic Evaluations.* arXiv:2402.12348.

<sup>[8]</sup> Sun, H., Wu, Y., Cheng, Y. & Chu, X. (2025). *Game Theory Meets Large Language Models: A Systematic Survey.* Proceedings of the Thirty-Fourth International Joint Conference on Artificial Intelligence (IJCAI 2025), Survey Track, 10669-10677.

<sup>[9]</sup> Putnam, H. (1988). *Representation and Reality.* MIT Press (Chapters 5-6, the reconsideration of functionalism).

<sup>[10]</sup> Kephart, J. O. & Chess, D. M. (2003). *The Vision of Autonomic Computing.* IEEE Computer, 36(1), 41-50.
