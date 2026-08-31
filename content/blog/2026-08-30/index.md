+++
authors = ["Yuriy Polyulya"]
title = "Sufficient Abstraction and the Cost of Asking the Wrong Question Twice"
description = "A summary that was perfect yesterday can be perfectly wrong today, and nothing about the summary itself has to change for that to happen. The world moved. The old answer just kept insisting it was still the right one. This post is about that particular stubbornness, and its quieter cousin: believing the evidence that agrees with you a little more than the evidence that doesn't. Post 2 of The Portable Mind."
date = 2026-08-30
slug = "portable-mind-part2-sufficient-abstraction"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "epistemology", "systems-thinking"]
series = ["portable-mind"]

[extra]
toc = false
series_order = 2
series_title = "The Portable Mind: Five Properties of Thinking"
series_description = """<div class="series-lede">Thinking architecture is portable across a human brain and a transformer. Correctness is not.</div>Five formal properties of thinking, each pinned to a real theorem: Ashby's Law for Noticing and Simulation, a sufficiency identity for Abstraction, an asymmetric-updating result for Rationality, a resource-bounded Loeb's theorem for Awareness, and cost-aware optimal stopping for Optimization. Every theorem is tested against a matching human finding and a current AI-agent finding. One real case opens the series and closes it, rerun through everything the four posts build in between, and Post 4 prices the portability gap itself: a structural cost, computable in kind, never a number any single deployment can just adopt. A fifth post asks what the five external loops actually have in common, and derives the general criterion underneath all of them."""
+++

An abstraction that was exactly right yesterday can be exactly wrong today without changing at all. Nothing has to happen to the abstraction. The world moves. The question moves with it. A summary that lost nothing important about the old question quietly starts losing everything important about the new one.

The first post in this series took Noticing and Simulation together. It showed that a system which cannot say what a task will cost it is bounded, by arithmetic, to underestimate that cost whenever it has noticed less of the task than the task contains. This post takes the next two properties in the founding post's dependency order, Abstraction and Rationality. Each has the same structure: a property that is genuinely useful, genuinely load-bearing, and genuinely capable of failing in a direction the mathematics predicts before any experiment is run. Abstraction fails by holding a summary fixed after the thing it summarized has moved. Rationality fails by updating on evidence with a thumb on the scale.

Both failures were catalogued in humans decades before there were agents to fail the same way. Both were measured in agents in recent frontier studies. The discipline of this series is to say exactly how much that parallel licenses and no more.

Abstraction and Rationality belong in one post because they share a failure surface. An abstraction decides what a reasoner is allowed to see. Rationality decides what the reasoner does with what it sees. A reasoner that has abstracted away the evidence that would change its mind cannot update on that evidence, no matter how sound its updating rule is. A reasoner with a biased updating rule will corrupt even a perfect abstraction. The two properties fail into each other. That is the reason the founding post placed them adjacent in the dependency graph, and the reason this post treats them as one argument in two halves.

## The Case: Agents That Kept Using the Broken Tool

In June 2026, Dongsheng Zhu and colleagues published a benchmark built to test something specific {{ cite(ref="10", title="Zhu, D., Ma, X., Shen, Y., Li, X., Zhao, Y., Wang, S., Yan, L. & Yin, D. (2026) -- When Tools Fail: Benchmarking Dynamic Replanning and Anomaly Recovery in LLM Agents, arXiv:2606.05806") }}: does an LLM agent notice that its tools have stopped working and adapt, or does it keep executing a strategy the environment has already invalidated? Their benchmark, ToolMaze, subjects agents to two kinds of failure:

- explicit tool breakdowns, where a call visibly errors
- implicit semantic failures, where a tool returns output that is corrupted or stale but still well-formed enough to look usable

The question is whether the agent re-plans against the new reality or persists with the plan it formed before the reality changed.

Performance degraded broadly once tools began to fail. The sharpest damage came from the implicit failures, the ones that do not announce themselves.

The Perturbation Recovery Rate, the fraction of runs in which an agent recovers a correct outcome after a perturbation, dropped by roughly 37 percent under implicit semantic failures compared to explicit, announced ones. This was driven by the agents' tendency to over-trust corrupted output rather than re-examine it. Complex task structures made it worse, trapping agents in unproductive retry loops: the same strategy, reissued, against an environment for which it had stopped being appropriate.

| ToolMaze, key numbers | Value |
|---|---|
| Perturbation Recovery Rate drop, implicit failures | about 37% |
| Fault-tolerance scaling vs. task-execution scaling | about 3.66x slower |

Scale did not rescue this. Agentic fault tolerance improved with model size about 3.66 times more slowly than basic task execution improved with size. That says the deficit is not a capability gap the next larger model closes. It is something structural in how a held plan meets a changed world.

That shape is the subject of the Abstraction half of this post. The agent formed a working summary of its situation, a plan and a set of expectations about what its tools return. It kept acting through that summary after the situation moved out from under it. The retry loop is the operational signature: more computation spent on a strategy whose fit to the current target has already lapsed, with no mechanism to detect the lapse from inside the strategy itself.

The same failure was measured on the human side of the same interface. In April 2025, Jiqun Liu, Jamshed Karimnazarov, and Ryen W. White ran a crowdsourcing study of 450 people using LLM-enabled chat search across six exploratory decision tasks {{ cite(ref="1", title="Liu, J., Karimnazarov, J. & White, R.W. (2025) -- Trapped by Expectations: Functional Fixedness in LLM-Enabled Chat Search, arXiv:2504.02074") }}. They found that participants dragged the shape of their old tools along with them.

People with heavy virtual-assistant experience favored directive, command-shaped prompts, the interaction pattern those assistants had trained. That pattern reinforced a functional fixedness that kept them from using the new system's actual range. They had abstracted the tool as "a thing you issue commands to," an abstraction carried intact from a setting where it had been sufficient, reused where it discarded most of the available capability.

The telling detail is what broke the trap. Not the tool being good, but the tool visibly failing to match the summary the user carried. When a response did not fit the command-shaped abstraction, participants adapted, generating more detailed and more linguistically varied prompts. Met expectations left the fixedness in place. Unmet expectations broke it.

Hold that shape. The rest of the Abstraction half of this post is about it and nothing else. A summary that fit the old target is carried forward. It keeps being applied to a new target it no longer fits, on the agent side as a retried plan and on the human side as a command-shaped prompt.

The only thing that reliably dislodges it is direct evidence that it has stopped fitting, evidence strong enough to survive the very filtering the summary imposes. That is functional fixedness stated operationally. It has an exact form in the theory of sufficient statistics.

## What Abstraction Actually Is

Before the theorem, a definition, because the founding post used the word "abstraction" narratively and this series cannot.

Abstraction is the act of replacing raw data with a summary that is meant to preserve what matters and discard what does not. Three examples of the same move:

- A stack trace becomes "a null-pointer dereference in the caching layer."
- A repository becomes "a Django app with a custom ORM patch."
- A conversation becomes "the user wants a restaurant recommendation."

In every case a large object is compressed to a small one. The compression is useful exactly to the degree that the small object carries forward everything the reasoner will need, and drops only what it will not.

The word doing the hidden work in that sentence is "need." Need is always need relative to a target. An abstraction is not sufficient or insufficient in the abstract. It is sufficient or insufficient only for a particular thing the reasoner is trying to predict or decide.

The summary "the user wants a restaurant recommendation" is sufficient for the target "which cuisine to suggest." It is useless for the target "is the user actually asking about dietary restrictions they are embarrassed to name." Same raw conversation, same summary, two targets: one the summary serves, one it silently destroys.

This is the whole mechanism of functional fixedness in one observation. Fixedness is neither stubbornness nor stupidity. It is the reuse of an abstraction that was correctly sufficient for one target, on a second target for which its sufficiency was never established and generally does not hold. To make that precise, we need to say exactly what sufficiency means. Statistics has said it exactly since 1922.

## Sufficiency: When an Abstraction Loses Nothing That Matters

The idea of a sufficient statistic comes from classical statistics, formalized by Ronald Fisher in the 1920s. Fisher asked a narrower question than this post does: given a batch of data and a family of distributions, which summaries of the data lose no information relevant to estimating the distribution's parameters?

This post keeps Fisher's exact mathematical structure. It generalizes only the target, from "a parameter" to "anything a reasoner cares about predicting or deciding." That is the same generalization machine learning makes when it talks about a sufficient representation rather than a sufficient statistic.

<span id="def-2"></span>

<details>
<summary>Definition 2 -- Sufficiency: when an abstraction loses nothing that matters</summary>

**Definition 2** (Sufficient Abstraction). An abstraction {% katex() %}A{% end %} of raw data {% katex() %}D{% end %} is sufficient for a target {% katex() %}T{% end %} if

{% katex(block=true) %}
P(T \mid D, A) = P(T \mid A)
{% end %}

where:

- {% katex() %}D{% end %} is the full raw observation
- {% katex() %}A{% end %} is the retained abstraction, a function of {% katex() %}D{% end %}
- {% katex() %}T{% end %} is the target the abstraction is meant to predict or act on
- sufficiency is binary for a given target: an abstraction either loses nothing about {% katex() %}T{% end %} (sufficient) or loses something (insufficient); the definition has no notion of partial credit

</details>

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    D["Raw data D<br/>the full observation"]:::term
    A["Abstraction A = f(D)<br/>a function of D"]:::term
    T["Target T<br/>what the reasoner predicts or decides"]:::term
    D -->|"compresses to"| A
    A -->|"P(T | A)"| T
    D -.->|"P(T | D, A) equals P(T | A)<br/>when A is sufficient"| T
{% end %}

<figcaption>Figure 0: sufficiency means the solid path through A carries exactly as much information about T as the dotted path through the full raw data D. Nothing is lost by compressing, as long as the target stays fixed.</figcaption>

The definition says something sharp once it is unpacked. Because {% katex() %}A{% end %} is a function of {% katex() %}D{% end %}, knowing {% katex() %}D{% end %} always includes knowing {% katex() %}A{% end %}. So the conditional {% katex() %}P(T \mid D, A){% end %} is just {% katex() %}P(T \mid D){% end %}, the best a reasoner could possibly do about {% katex() %}T{% end %} with the entire raw observation in hand.

Sufficiency is the statement that the summary does exactly as well as the raw data. Once you hold {% katex() %}A{% end %}, the leftover detail in {% katex() %}D{% end %} tells you nothing further about {% katex() %}T{% end %}. That is what it means for a compression to be free: free precisely when, and only when, it is sufficient for the target you are compressing toward.

This is worth pausing on, because it dissolves a framing that would otherwise force a detour. One might expect Abstraction to be governed by a trade-off, compression on one axis and fidelity on the other, more of one bought with less of the other. Sufficiency says otherwise: for a fixed target, there is no trade-off at that point at all.

Below sufficiency, compression costs fidelity. At sufficiency, compression is free, and further compression starts costing fidelity again. Sufficiency is a threshold, not a trade-off frontier. The reasoner's job is to sit on the threshold: the smallest summary that is still sufficient for the current target.

This post therefore needs no achievable-region construction. The object in play is a threshold, not a frontier, and I flag that explicitly rather than let the compression-versus-fidelity language smuggle in a trade-off the definition has already dismissed.

<span id="prop-2"></span>

**Proposition 2** (Fisher Sufficiency and the Information-Loss of a Stale Abstraction). [Layer 1: Bound] If {% katex() %}A{% end %} is sufficient for {% katex() %}T{% end %}, discarding the rest of {% katex() %}D{% end %} costs no predictive power about {% katex() %}T{% end %} {{ cite(ref="4", title="Fisher, R.A. (1922) -- On the Mathematical Foundations of Theoretical Statistics, Philosophical Transactions of the Royal Society A 222, 309-368") }}. This is classical statistics, not an interpretive claim. The residual risk is entirely on the other side: an abstraction sufficient for yesterday's target {% katex() %}T_{\text{old}}{% end %} carries no guarantee of sufficiency for today's target {% katex() %}T_{\text{new}}{% end %}, and nothing about holding {% katex() %}A{% end %} fixed announces the moment {% katex() %}P(T_{\text{new}} \mid D, A) \neq P(T_{\text{new}} \mid A){% end %} starts holding. The information lost about the new target by continuing to reason through the old abstraction is exactly

{% katex(block=true) %}
I(D; T_{\text{new}}) - I(A; T_{\text{new}}) = I(D; T_{\text{new}} \mid A) \geq 0
{% end %}

and this quantity is zero if and only if {% katex() %}A{% end %} is still sufficient for {% katex() %}T_{\text{new}}{% end %}.

<details class="proof">
<summary>Mathematical proof: the factorization, the data-processing inequality, and the residual that fixedness discards</summary>

**The forward half: free compression.** This is Fisher's own result, stated in the modern conditional-independence form.

- Sufficiency, {% katex() %}P(T \mid D, A) = P(T \mid A){% end %}, says that {% katex() %}T{% end %} and {% katex() %}D{% end %} are conditionally independent given {% katex() %}A{% end %}.
- By the Fisher-Neyman factorization this is equivalent to the likelihood splitting into a part that touches the data only through {% katex() %}A{% end %} and a part that does not depend on the target at all: the precise sense in which {% katex() %}A{% end %} carries all the target-relevant content of {% katex() %}D{% end %}.
- In information terms, conditional independence gives {% katex() %}I(D; T \mid A) = 0{% end %}, so by the chain rule for mutual information {% katex() %}I(D; T) = I(A; T) + I(D; T \mid A) = I(A; T){% end %}.

The summary and the raw data carry identical information about the target. Discarding {% katex() %}D \setminus A{% end %} costs nothing about {% katex() %}T{% end %}. This is the free-compression statement, and it holds for any information-processing system by construction, with no assumption about what kind of reasoner holds the abstraction.

**The reverse half: where fixedness lives.** This is the data-processing inequality read against a target that has moved {{ cite(ref="5", title="Cover, T.M. & Thomas, J.A. (2006) -- Elements of Information Theory, 2nd ed., Wiley, data-processing inequality and mutual-information chain rule, Chapter 2") }}.

Because {% katex() %}A{% end %} is a deterministic function of {% katex() %}D{% end %}, the chain {% katex() %}T_{\text{new}} \to D \to A{% end %} is a Markov chain for any target whatsoever, and the data-processing inequality gives

{% katex(block=true) %}
I(A; T_{\text{new}}) \leq I(D; T_{\text{new}})
{% end %}

with equality if and only if {% katex() %}A{% end %} is sufficient for {% katex() %}T_{\text{new}}{% end %}. Subtracting and applying the chain rule again isolates the loss exactly:

{% katex(block=true) %}
I(D; T_{\text{new}}) - I(A; T_{\text{new}}) = I(D; T_{\text{new}} \mid A) \geq 0.
{% end %}

The quantity {% katex() %}I(D; T_{\text{new}} \mid A){% end %} is the mutual information between the raw data and the new target that survives after conditioning on the summary. It is the information about the new target that lives entirely in the residual {% katex() %}D \setminus A{% end %}, the part the abstraction already threw away.

When {% katex() %}A{% end %} was chosen to be sufficient for {% katex() %}T_{\text{old}}{% end %}, it was chosen to make {% katex() %}I(D; T_{\text{old}} \mid A) = 0{% end %}. Nothing about that choice constrains {% katex() %}I(D; T_{\text{new}} \mid A){% end %}. That quantity is generically strictly positive as soon as the new target depends on features of {% katex() %}D{% end %} that the old target did not.

A reasoner that keeps reasoning through {% katex() %}A{% end %} after the target has moved cannot recover that information by any amount of further processing of {% katex() %}A{% end %} alone. The data-processing inequality forbids any downstream function of {% katex() %}A{% end %} from carrying more about {% katex() %}T_{\text{new}}{% end %} than {% katex() %}A{% end %} itself does.

The lost information is not lost in the reasoning. It was lost at the moment of abstraction. It can only be regained by going back to {% katex() %}D{% end %} and re-deriving a statistic sufficient for the target that now applies. That return step is the entire remedy, and it is why unmet expectations, not further prompting inside the old frame, are what break the trap.

</details>

The reframing this proposition makes possible is the core of the Abstraction half of the post. It stands entirely on the information-loss argument just given.

Functional fixedness is not a mysterious cognitive rigidity, but the exact failure of re-deriving a sufficient abstraction once the target changes: the reuse of {% katex() %}A{% end %} past the point where {% katex() %}I(D; T_{\text{new}} \mid A){% end %} became positive.

The antidote is not "think harder," and it is not "be more creative." Both of those operate on {% katex() %}A{% end %}, and the data-processing inequality has already established that no operation on {% katex() %}A{% end %} can recover what {% katex() %}A{% end %} does not contain. The antidote is to find the abstraction that is actually sufficient for the current target, rather than the old one, which requires returning to the raw data the old abstraction discarded.

Stated this way, the remedy is not a heuristic, but the only move the mathematics leaves available. The information the new target needs is provably not in the summary, and provably is in the residual, which is only reachable from {% katex() %}D{% end %}.

A stale abstraction is a specific, named pathology, worth placing against the standard taxonomy of proxy failure to see how it differs from it. Manheim and Garrabrant split Goodhart's Law into four distinct mechanisms, and none of the four is quite this one {{ cite(ref="11", title="Manheim, D. & Garrabrant, S. (2018) -- Categorizing Variants of Goodhart's Law, arXiv:1803.04585") }}. All four analyze what goes wrong when a proxy is optimized against a goal that stays put. The stale-abstraction failure has no goal that stays put, since the goal itself is what moved.

The nearest in spirit is Causal Goodhart, the mechanism where a proxy correlated with a goal through a confound, rather than through a real causal path to it, stops moving the goal once that confound is no longer active. The family resemblance is real: a correlation is only as durable as whatever was actually generating it, which is exactly Proposition 2's own point about {% katex() %}A{% end %}. But Causal Goodhart's proxy was never genuinely informative about a fixed goal to begin with. This abstraction's was, informative about {% katex() %}T_{\text{old}}{% end %} through a real, load-bearing correlation, not a confound. What failed is that the goal changed under it. That is not one of the four named mechanisms. It is the failure mode the taxonomy has no name for, because the taxonomy assumes the goal holds still.

An abstraction {% katex() %}A{% end %} that was sufficient for {% katex() %}T_{\text{old}}{% end %} carried a real and load-bearing correlation with the old target. Continuing to treat it as a stand-in for {% katex() %}T_{\text{new}}{% end %} is trusting that correlation past the point where the residual {% katex() %}I(D; T_{\text{new}} \mid A){% end %} went positive and severed it. **Naming the family resemblance to Causal Goodhart is this series' own interpretive act, not a claim of membership in it** [Layer 3: Estimate]. The Layer 1 content is the information-loss identity of Proposition 2. The resemblance is an identification between two formal vocabularies rather than an empirical measurement: the recognition that both failures share a lesson about correlations and the mechanisms that generate them, not a claim that stale abstraction is one of Goodhart's four cases.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef box fill:none,stroke:#333,stroke-width:2px;
    classDef lost fill:none,stroke:#c0392b,stroke-width:2px;
    classDef keep fill:none,stroke:#2980b9,stroke-width:2px;
    D["Raw data D<br/>full observation"]:::box
    A["Abstraction A = f(D)<br/>sufficient for T_old:<br/>I(D; T_old | A) = 0"]:::keep
    R["Residual D \\ A<br/>discarded at abstraction time"]:::lost
    Tn["New target T_new"]:::box
    D --> A
    D --> R
    A -->|"I(A; T_new)"| Tn
    R -->|"I(D; T_new | A) &gt; 0<br/>unreachable from A"| Tn
{% end %}

<figcaption>Figure 1: functional fixedness is the blue path taken alone. The information the new target needs, the red edge, was discarded when the abstraction was fitted to the old target, and the data-processing inequality proves no further work on A can recover it.</figcaption>

> **Physical translation.** A chat-search agent keeps recommending the same category of answer after the query's real target has shifted because it compressed the conversation into a statistic sufficient for the target it inferred on the first turn, and it keeps feeding that stale statistic forward while the residual it already discarded is exactly the part that carried the new target, so every additional turn spent reasoning inside the old abstraction is provably incapable of recovering the one thing the user now needs, no matter how fluent or elaborate that reasoning becomes.

The Physical Translation is the load-bearing sentence of this half. Read it as the operational claim it is.

The failure is not that the agent is not trying. The failure is that trying, in the sense of more computation applied to the existing summary, is mathematically the wrong operation. The correct operation is a return to the raw conversation and a re-derivation of what is now sufficient. An agent architecture that has already collapsed the conversation into a fixed intent representation has, by that collapse, made the correct operation unavailable to itself.

This is why the chat-search study found that only visible failure broke the fixedness. Visible failure is the signal that {% katex() %}I(D; T_{\text{new}} \mid A){% end %} has gone positive. It is the only signal that reliably sends the reasoner back to {% katex() %}D{% end %}.

"Visible failure" is already a practical detection threshold, not a claim that the control plane computes {% katex() %}I(D; T_{\text{new}} \mid A){% end %} exactly and re-derives on the first infinitesimal departure from zero. An abstraction sufficient for a target that has drifted by a hair costs almost nothing and should not trigger anything. The trigger this post recommends is keyed to the same observable failures that broke fixedness in the study, not to a real-time information-theoretic computation the control plane cannot run anyway.

## The Human Instance: Functional Fixedness and Einstellung

This belongs in a series about portability, not a note about one chat-search study. The same failure was measured in humans in the 1940s, with two experimental paradigms so clean they are still taught. The match is to the defining signature, not to a surface resemblance.

Karl Duncker's candle problem, published in 1945, is the canonical demonstration {{ cite(ref="2", title="Duncker, K. (1945) -- On Problem-Solving, Psychological Monographs 58(5), whole No. 270") }}. Participants are given a candle, a box of tacks, and a book of matches. They are asked to fix the candle to the wall so it burns without dripping wax on the floor.

The solution is to empty the tack box, tack the box to the wall, and stand the candle in the box, using the box as a shelf. Participants routinely fail to see it when the box arrives full of tacks. A box full of tacks has already been abstracted as a container, and a container is not a shelf. When the same box is presented empty, with the tacks loose beside it, solution rates rise sharply.

Nothing about the box changed. What changed is which abstraction the box arrived wearing. Full, it was summarized as "container," a statistic sufficient for the target "hold the tacks" and insufficient for the target "support the candle." Empty, the summary loosened enough to let the residual through.

Duncker's own term for the effect was functional fixedness. The mechanism he described is exactly the reuse of a target-specific abstraction against a target it does not serve.

Abraham Luchins pinned down the temporal version of the same effect three years earlier, in the water-jar experiments that gave the phenomenon its other name {{ cite(ref="3", title="Luchins, A.S. (1942) -- Mechanization in Problem Solving: The Effect of Einstellung, Psychological Monographs 54(6), i-95") }}. Participants learn to measure out a target quantity of water using three jars of fixed capacities. The first several problems all yield to the same three-step formula.

Then a later problem arrives that the old formula still solves, but that also admits a far simpler two-step solution. Most participants apply the old formula and never see the simpler path. Worse, a final problem arrives that the old formula does not solve at all. A substantial fraction of participants, having mechanized the old approach, fail it outright, while a control group that never learned the formula solves it easily.

Luchins called this Einstellung, the mechanization of a set. It is functional fixedness across time rather than across objects. The formula was a procedure sufficient for the early targets. It was carried forward, unexamined, into targets for which it was suboptimal and then insufficient, and its very success on the early problems is what made it sticky on the later ones.

**Functional fixedness and Einstellung are a measured human finding** [Layer 2: Fit]. The tag is doing exact work.

What it asserts is that the Duncker and Luchins results are empirically observed patterns in one substrate, consistent with the prediction Proposition 2 makes if a human problem-solver is modeled as a reasoner holding an abstraction fitted to an earlier target and applying it to a later one. It asserts that much and no more. It does not assert that a human brain computes the mutual-information chain rule. It does not assert that the human effect and the agent effect are the same event.

The Liu, Karimnazarov, and White chat-search study corroborates this same human-side finding in a modern tool-use setting. Its subjects were the 450 human participants, and its result, that their imported abstractions of prior tools constrained their use of a new one, is functional fixedness measured at the human-agent boundary rather than inside the agent. That is why it belongs here alongside Duncker and Luchins, not as the agent instance.

**The tool-failure recovery result is a measured agent finding** [Layer 2: Fit]. The Zhu and colleagues study measured, inside the agents themselves, whether an LLM agent re-plans when its tools break or persists with a strategy the environment has invalidated.

Its finding: a Perturbation Recovery Rate collapsing by roughly 37 percent under implicit semantic failures compared to explicit ones, agents over-trusting corrupted output, and retry loops whose fault-tolerance scaling closes 3.66 times more slowly than the basic task gap. This is an independent, agent-internal measurement of a held abstraction failing against a shifted target. It is stated as its own fact in its own substrate, consistent with the same Proposition 2 shape, not as evidence that the agent and the human are doing one thing.

**The claim that the human fixedness and the agent-side fixedness are the same phenomenon** [Layer 3: Estimate]. This is the series' own interpretive act. It carries the only real risk in this section, exactly as Post 1 set out when it introduced the three-layer discipline.

The Layer 1 result, Proposition 2, is a triviality of the mathematics and holds for any information-processing system by construction. The Layer 2 findings are separate measurements, each independently consistent with that shape. The Layer 3 claim that they are one phenomenon, rather than two phenomena of the same shape, is where the classical objection lands.

It lands here for the same reason it landed in Post 1. Multiple realizability is the standard warrant for calling a functional property shared across substrates. Hilary Putnam, who introduced that warrant, later argued that real mental kinds are compositionally and computationally plastic enough that a single functional kind need not correspond to one clean computational state {{ cite(ref="9", title="Putnam, H. (1988) -- Representation and Reality, MIT Press, Chapters 5-6, the reconsideration of functionalism") }}.

That objection does not touch Proposition 2, and does not touch the two measurements. It targets only the identity claim. The right posture, held consistently across this series, is that the identity is offered as an estimate with its own standing objection attached, never as settled.

| | Human (functional fixedness) | Agent (tool-failure recovery) |
|---|---|---|
| Measured by | Duncker 1945; Luchins 1942 | Zhu et al. 2026 |
| What was measured | Reuse of a container/procedure abstraction past its fit | Recovery rate after a tool's output silently degraded |
| Direction of error | Fails to see a shelf where the abstraction said "container" | Persists with a strategy the environment invalidated |
| What breaks the fixedness | Visible mismatch between the abstraction and the task | Not tested in this benchmark |
| Corroborating boundary case | Liu, Karimnazarov & White 2025: 450 humans carried old tool-abstractions into a new chat-search tool | (same study, human-agent boundary, not agent-internal) |
| Layer of this series' claim | Layer 2, Fit | Layer 2, Fit |

<figcaption>Table 1: functional fixedness and stale-tool persistence share a defining signature, a target-specific abstraction reused past the point where it stopped fitting, but remain two separate Layer 2 facts until Layer 3 claims otherwise.</figcaption>

## From Abstraction to Rationality

The two halves of this post join at a single seam. An abstraction decides what evidence a reasoner can see. Rationality decides what the reasoner does with the evidence it sees. The Abstraction failure just formalized removes evidence before the updating rule ever runs. No updating rule, however sound, can update on evidence it never received. The Rationality failure this second half formalizes is the mirror image: the evidence arrives intact, the reasoner sees it, and the updating rule corrupts it on the way in.

The two compound. A reasoner that has abstracted away the disconfirming evidence has nothing to update on. A reasoner that updates asymmetrically will discount the disconfirming evidence even when its abstraction faithfully delivers it.

The chat-search participants who kept issuing command-shaped prompts were failing at Abstraction. A reasoner who receives a failing test result, sees it clearly, and downweights it because it contradicts the approach already chosen is failing at Rationality.

The founding post placed these two properties adjacent for exactly this reason. The formal treatment makes the adjacency precise: Abstraction governs the sufficiency of the input, Rationality governs the fidelity of the update, and a portable mind needs both to be sound, because either one failing is enough to reach the wrong belief.

## The Case: Two Models That Believed the Frame They Were Handed

In 2025, Li Hao, Wang You, and Yang Xueling published a study in the Journal of Psychological Science {{ cite(ref="7", title="Li, H., Wang, Y. & Yang, X. (2025) -- Cognitive Biases in Artificial Intelligence: Susceptibility of a Large Language Model to Framing Effect and Confirmation Bias, Journal of Psychological Science 48(4), 892-906") }}. It tested whether two large language models, Gemini 1.5 Pro and DeepSeek, exhibit two of the best-documented human reasoning biases, the framing effect and confirmation bias, under controlled conditions adapted from the classic human protocols.

The framing manipulation is a risky-choice framing design in the Asian-disease lineage, instantiated as a genetic-testing decision. The same underlying probabilities are presented once in terms of the share of cases in which the test result is favorable, and once in terms of the share in which it is not, with the presentation order also varied. The question is whether the models' inclination to test shifts with the framing while the underlying facts hold constant. The confirmation manipulation presents a hypothesis and then evidence, some consistent with the hypothesis and some inconsistent. It measures whether the reasoner weights the consistent evidence more heavily than the inconsistent evidence, when it should weight them by their actual diagnostic value.

The finding is that both models showed the biases. Their conclusions varied with the positive or negative framing of otherwise identical inputs. They reinforced the premises embedded in the queries they were given, rather than weighting confirming and disconfirming evidence by their true likelihoods.

The confirmation pattern is the one that matters for this post. The model updated more on evidence that agreed with the hypothesis it had been handed than on evidence that disagreed. That is not a description of what the model believed, but a description of how it moved from prior to posterior. That how has an exact form, and the exact form is a specific, provable deviation from Bayes' rule.

## Rationality Under a Thumb: Asymmetric Belief Updating

<span id="def-3"></span>

<details>
<summary>Definition 3 -- Asymmetric Updating: confirmation bias as a precise deviation from Bayes' rule</summary>

**Definition 3** (Asymmetric Belief Updating). A reasoner updates asymmetrically if, given a prior {% katex() %}P(H){% end %} and evidence {% katex() %}E{% end %}, it applies likelihood weight {% katex() %}w_+ > 1{% end %} to evidence favoring {% katex() %}H{% end %} and {% katex() %}w_- < 1{% end %} to evidence disfavoring it, rather than the true likelihood ratio.

</details>

The definition is best read in log-odds, where Bayes' rule is at its simplest and the deviation is a single distortion applied to one term. Write the log-odds of the hypothesis as {% katex() %}L = \log \frac{P(H)}{P(\lnot H)}{% end %}. Bayes' rule says that on observing evidence {% katex() %}E{% end %}, the log-odds update additively by the log-likelihood ratio of that evidence:

{% katex(block=true) %}
L' = L + \ell, \qquad \ell = \log \frac{P(E \mid H)}{P(E \mid \lnot H)}
{% end %}

where:

- {% katex() %}L{% end %} is the prior log-odds of the hypothesis {% katex() %}H{% end %}
- {% katex() %}\ell{% end %} is the log-likelihood ratio carried by the evidence {% katex() %}E{% end %}
- {% katex() %}L'{% end %} is the posterior log-odds after the update

Confirming evidence is exactly evidence with {% katex() %}\ell > 0{% end %}, and disconfirming evidence is exactly evidence with {% katex() %}\ell < 0{% end %}. An asymmetric updater replaces the honest increment {% katex() %}\ell{% end %} with a distorted increment {% katex() %}g(\ell){% end %} that stretches the positive part and shrinks the negative part:

{% katex(block=true) %}
g(\ell) = \begin{cases} w_+ \, \ell & \ell > 0 \\ w_- \, \ell & \ell \leq 0 \end{cases} \qquad w_+ > 1, \; 0 < w_- < 1.
{% end %}

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    classDef up fill:none,stroke:#2980b9,stroke-width:2px;
    classDef down fill:none,stroke:#c0392b,stroke-width:2px;
    E["Evidence E<br/>log-likelihood ratio ℓ"]:::term
    Pos["ℓ > 0, confirming<br/>stretched by w+ > 1"]:::up
    Neg["ℓ ≤ 0, disconfirming<br/>shrunk by w- < 1"]:::down
    E --> Pos
    E --> Neg
    Pos --> G["Distorted increment g(ℓ)"]:::term
    Neg --> G
{% end %}

<figcaption>Figure 2: an asymmetric updater does not ignore disconfirming evidence, it discounts it, while inflating confirming evidence by the mismatched weight w+. Both branches feed into the same posterior update.</figcaption>

This is confirmation bias written as arithmetic, not a claim about motivation or ego. It is a specific, named distortion of a specific, named term in the one equation that governs rational belief change.

<span id="prop-3"></span>

**Proposition 3** (Asymmetric Updating Diverges from Bayes). [Layer 1: Bound] Asymmetric updating with {% katex() %}w_+ \neq w_-{% end %} produces a posterior that provably diverges from the proper Bayesian posterior as evidence accumulates, by a gap that grows without bound in the amount of evidence, regardless of which hypothesis is actually true. When the favored hypothesis is false, that divergence is a lag behind the truth that, once the asymmetry passes a stated threshold, becomes a drift to confidence in the false hypothesis rather than the true one; proper Bayesian updating, and Popper's falsification strategy, which actively seeks disconfirming evidence, converge strictly faster to the truth in that case, under the stated regularity conditions {{ cite(ref="8", title="Popper, K. (2002 [1959]) -- The Logic of Scientific Discovery, Routledge Classics") }}. When the favored hypothesis happens to be true, the same distortion runs the other way: the biased reasoner reaches the correct conclusion no slower, and generally faster, than the honest one, but at every finite amount of evidence its reported confidence strictly exceeds what the identical evidence stream would license under proper updating, since {% katex() %}g(\ell) \geq \ell{% end %} in expectation whenever the favored hypothesis is the true one, making the log-odds gap {% katex() %}n\Delta{% end %} strictly positive and growing at every step, not only in some limit. That gap is exact and permanent in log-odds, the metric the proposition is stated in; read back in probability, where both posteriors are converging to certainty, the raw numerical distance between the two reported confidences shrinks toward zero as evidence accumulates without bound, and nothing here claims otherwise. What does not vanish is not that distance, but the overstatement itself: the biased reasoner is never once, at any finite step a real reasoner could actually stop and report from, licensed by its own evidence to report the confidence it does.

<details class="proof">
<summary>Mathematical proof: the accumulated gap, the sign flip, and why falsification converges faster</summary>

**The setup.** Assume the standard regularity conditions:

- evidence pieces {% katex() %}E_1, E_2, \ldots{% end %} are drawn independently and identically from the true distribution
- the per-piece log-likelihood ratio {% katex() %}\ell{% end %} has finite mean under both hypotheses
- the weights {% katex() %}w_+, w_-{% end %} are fixed

The finite-mean condition is doing more than technical housekeeping. It rules out literally deterministic evidence: a test that fails with probability exactly zero under "the fix is correct" would give {% katex() %}\ell=-\infty{% end %} on that outcome, and no finite {% katex() %}w_-{% end %} can discount an infinite quantity into something finite. Only {% katex() %}w_-=0{% end %} can, outright non-observation, Definition 3's own boundary. For "discounting a failing test" to describe what an asymmetric updater is doing, rather than "never running it," the test has to carry strong but finite evidential weight. That is also the realistic case: a real test suite is never a perfect oracle, since flaky tests, environment variance, and wrong assertions all keep the true failure probability under "correct" strictly positive, however small.

Write {% katex() %}\ell_+ = \max(\ell, 0){% end %} and {% katex() %}\ell_- = \min(\ell, 0){% end %}, so that {% katex() %}\ell = \ell_+ + \ell_-{% end %} and {% katex() %}g(\ell) = w_+ \ell_+ + w_- \ell_-{% end %}.

After {% katex() %}n{% end %} pieces of evidence the proper log-odds and the asymmetric log-odds are

{% katex(block=true) %}
L_n = L_0 + \sum_{i=1}^{n} \ell_i, \qquad L_n^{\text{bias}} = L_0 + \sum_{i=1}^{n} g(\ell_i).
{% end %}

The accumulated gap between them is {% katex() %}L_n^{\text{bias}} - L_n = \sum_{i=1}^{n} \left[ (w_+ - 1)\ell_{+,i} + (w_- - 1)\ell_{-,i} \right]{% end %}. By the law of large numbers this gap grows linearly in {% katex() %}n{% end %}, at rate

{% katex(block=true) %}
\Delta = (w_+ - 1)\,\mathbb{E}[\ell_+] + (w_- - 1)\,\mathbb{E}[\ell_-].
{% end %}

**The divergence.** Both terms are non-negative under the biasing regime, because {% katex() %}w_+ - 1 > 0{% end %} with {% katex() %}\mathbb{E}[\ell_+] \geq 0{% end %}, and {% katex() %}w_- - 1 < 0{% end %} with {% katex() %}\mathbb{E}[\ell_-] \leq 0{% end %}, so their product is non-negative. Hence {% katex() %}\Delta \geq 0{% end %}, and it is strictly positive whenever the evidence has any disconfirming mass at all. The two posteriors therefore diverge without bound: the gap {% katex() %}L_n^{\text{bias}} - L_n \approx n\Delta{% end %} grows linearly and never closes. This is the divergence claim, and it holds regardless of which hypothesis is true.

**The sign flip.** The sign of the destination is where the damage becomes concrete. Suppose {% katex() %}H{% end %} is in fact false, so the truth is {% katex() %}\lnot H{% end %}. Under the truth, the expected proper increment is {% katex() %}\mathbb{E}[\ell] = -D_{\mathrm{KL}}\!\left(P(\cdot \mid \lnot H) \,\|\, P(\cdot \mid H)\right) < 0{% end %}. The proper log-odds drift to {% katex() %}-\infty{% end %}, and the honest reasoner converges, correctly, to certainty in {% katex() %}\lnot H{% end %}.

The asymmetric reasoner's expected increment is instead {% katex() %}\mathbb{E}[g(\ell)] = w_+ \mathbb{E}[\ell_+] + w_- \mathbb{E}[\ell_-]{% end %}. Because {% katex() %}w_+{% end %} inflates the rare confirming evidence and {% katex() %}w_-{% end %} suppresses the frequent disconfirming evidence, there exist distributions and weight pairs for which {% katex() %}\mathbb{E}[g(\ell)] > 0{% end %} even though {% katex() %}\mathbb{E}[\ell] < 0{% end %}. In that regime the asymmetric log-odds drift to {% katex() %}+\infty{% end %}: the reasoner converges, with mounting confidence, to the false hypothesis, while the honest reasoner converges to the true one.

The underlying condition is {% katex() %}w_+ \mathbb{E}[\ell_+] > w_- \mathbb{E}[-\ell_-]{% end %}, which rearranges to the ratio form {% katex() %}w_+ / w_- > \mathbb{E}[-\ell_-] / \mathbb{E}[\ell_+]{% end %} whenever {% katex() %}\mathbb{E}[\ell_+] > 0{% end %}. State it in the unrearranged form and there is nothing to divide by zero. If the evidence stream perfectly separates the hypotheses, so that no evidence ever looks confirming under the true {% katex() %}\lnot H{% end %}, then {% katex() %}\mathbb{E}[\ell_+] = 0{% end %} and the left side of the unrearranged condition is zero regardless of {% katex() %}w_+{% end %}. No finite asymmetry can then produce a sign flip. The bias still slows convergence, but it can no longer manufacture confirming evidence that was never there to inflate. A large enough asymmetry guarantees the sign flip for any evidence source that carries both kinds of signal.

When the asymmetry is milder than this threshold, the sign is preserved but the convergence is retarded. The biased log-odds still drift toward the truth, yet they lag the honest reasoner's by the gap {% katex() %}n\Delta{% end %}, which itself grows linearly in {% katex() %}n{% end %}. At every finite amount of evidence, the biased reasoner is systematically less certain of the truth than the honest one, and the shortfall widens the more evidence it has seen.

**Why falsification converges faster.** The comparative claim about speed follows from the same accounting, and is where Popper enters as more than a slogan.

This is a sequential accumulation, not a fixed-sample test, so the right tool is Wald's theory of the sequential probability ratio test, and it is already in hand. By Wald's identity, the number of observations {% katex() %}L_n{% end %} needs to cross a decision boundary is inversely proportional to the drift rate {% katex() %}\mathbb{E}[\ell]{% end %} computed under whichever hypothesis is true, exactly the quantity already derived above as {% katex() %}\mathbb{E}[\ell] = -D_{\mathrm{KL}}\!\left(P(\cdot \mid \lnot H) \,\|\, P(\cdot \mid H)\right){% end %}. Faster convergence means larger {% katex() %}|\mathbb{E}[\ell]|{% end %} under the true hypothesis, nothing more exotic than that.

A falsification strategy actively seeks high-{% katex() %}\mathbb{E}[-\ell_-]{% end %} evidence, tests designed to break the hypothesis rather than to flatter it. That is a strategy for sampling evidence with large {% katex() %}|\ell|{% end %} under the true hypothesis, which by Wald's identity is exactly what shortens the expected time to a correct decision. A strategy that samples confirming evidence instead draws evidence whose {% katex() %}\ell{% end %} clusters near zero under a false hypothesis, carrying little diagnostic weight and lengthening, not shortening, the road to the correct conclusion. That clustering is a property of confirmatory tests as ordinarily constructed, not a logical necessity: a maximally severe test can carry large {% katex() %}|\ell|{% end %} under either hypothesis, and the argument here assumes the more common case of a test built to be passed rather than to discriminate.

The asymmetric updater does the opposite of falsification when the favored hypothesis is false. It downweights precisely the disconfirming evidence that carries the most information, so its effective convergence rate toward the truth is strictly below the proper reasoner's whenever {% katex() %}w_- < 1{% end %}, and can run backward. Seeking disconfirmation is not a moral posture, but the drift-optimal sampling policy for reaching the truth quickly: it maximizes {% katex() %}|\mathbb{E}[\ell]|{% end %} under whichever hypothesis is true, rather than any property of its variance. Confirmation bias is its inverse only in that failure mode. When the favored hypothesis happens to be true, confirmation bias does not slow the reasoner down; it inflates the confidence it reports on the way to the correct answer.

</details>

> **Physical translation.** A verification pipeline that only samples confirming test cases ships the wrong fix through a cousin of Definition 3's mechanism, not the mechanism itself: rather than discounting disconfirming evidence it observes, it never draws any, so every passing test inflates its posterior that the fix is correct while the failing tests that would carry the counterexample are never drawn, and the number it reports as certainty is a measurement of its own sampling policy rather than of the fix.

The Physical Translation is the load-bearing sentence of the Rationality half. Read the mechanism in it exactly. The pipeline is not lying, and it is not miscalibrated in some vague sense, but computing an honest posterior over a dishonest evidence stream. That distinction is worth being precise about. Definition 3 weighs evidence that is honestly sampled and dishonestly discounted, with {% katex() %}w_-{% end %} strictly between 0 and 1, and the proof above already excludes {% katex() %}w_- = 0{% end %} from that definition, as outright non-observation rather than discounting. A pipeline that never samples failing tests is doing the excluded thing instead: dishonest sampling of an honestly weighed stream, the mirror image of Definition 3's dishonest weighing of an honestly sampled one.

The two are cousins, not the same operation, and the difference has teeth. A reasoner that knows its own sampling policy can in principle correct for it, the way a survey corrects for who it failed to reach. It cannot correct, the same way, for a biased weighting rule baked into how it updates on whatever it does see.

The dishonesty is upstream, in the sampling. A test suite that draws only cases the fix was written to pass has an evidence distribution whose disconfirming mass is zero by construction. A Bayesian updater fed that distribution converges to certainty regardless of whether the fix is correct.

This is why "all tests pass" is a claim about the tests, not about the fix. It is why the remedy is not more tests of the same kind, but the deliberate construction of tests aimed at breaking the fix. Falsification is the sampling policy that puts disconfirming mass back into the stream. Proposition 3 is the proof that without it the posterior is uninformative, no matter how high it climbs.

## The Human Instance: Confirmation Bias

The human side of Rationality is the most thoroughly documented bias in the entire literature. Raymond Nickerson's 1998 review is its definitive synthesis {{ cite(ref="6", title="Nickerson, R.S. (1998) -- Confirmation Bias: A Ubiquitous Phenomenon in Many Guises, Review of General Psychology 2(2), 175-220") }}.

Nickerson's central move, and the reason his review is the right citation here rather than any single experiment, is that he catalogues confirmation bias as a family of distinct mechanisms that share one signature: the preferential treatment of evidence that supports a held hypothesis over evidence that opposes it. The family includes:

- the selective gathering of confirming evidence
- the selective interpretation of ambiguous evidence as confirming
- the failure to seek disconfirming tests
- differential scrutiny applied to welcome versus unwelcome findings, where confirming evidence is accepted at face value and disconfirming evidence is subjected to a search for flaws

Two of those mechanisms realize the {% katex() %}w_+ > 1, w_- < 1{% end %} distortion of Definition 3 directly, and two realize a related but formally distinct one, worth naming separately because the difference matters for what fixes each.

- Differential scrutiny applies a literal weight, accepting confirming evidence with {% katex() %}w_+{% end %} and discounting disconfirming evidence with {% katex() %}w_-{% end %}: an honestly sampled stream, dishonestly weighed. This is Definition 3's mechanism exactly.
- Selective interpretation reassigns the sign of {% katex() %}\ell{% end %} itself, recoding evidence that should have been disconfirming as confirming, also a weighing operation, just one that acts before the sign is fixed rather than after.
- Selective gathering sets the sampling distribution so that disconfirming evidence is rarely drawn in the first place, driving the effective {% katex() %}\mathbb{E}[\ell_-]{% end %} toward zero not by discounting it but by never observing it: an honestly weighed stream, dishonestly sampled.
- The failure to seek disconfirming tests is the same sampling failure in its passive form, not refusing disconfirming evidence, but never going looking for the kind of test that would produce it.

Nickerson's "many guises" split, on close inspection, into two formal families rather than one. The first is a weighing family, which Definition 3 covers exactly. The second is a sampling family, which produces the identical symptom, a posterior detached from the truth, through a distorted evidence measure rather than a distorted weight on an honest one. Both belong in the same catalogue because both suppress disconfirming evidence's effect on the posterior, but by different mechanisms. The weighing family distorts the likelihood applied to evidence already observed, {% katex() %}w_- < 1{% end %} in Definition 3's own terms. The sampling family instead prevents disconfirming evidence from being observed at all, {% katex() %}\mathbb{E}[\ell_-] \to 0{% end %} as the sampling policy excludes it. One corrupts the update on the way in; the other keeps the update from ever seeing the data.

That is exactly why the remedy this post recommends throughout, deliberately constructing tests aimed at breaking the fix, targets the sampling family directly, and only reaches the weighing family by making disconfirming evidence too well-supplied to discount away.

**Confirmation bias is a measured human finding** [Layer 2: Fit]. The tag asserts that the pattern Nickerson synthesizes is an empirically observed regularity in human reasoning, consistent with the prediction Proposition 3 makes if a human reasoner is modeled as applying asymmetric weights to confirming and disconfirming evidence. It does not assert that a human brain computes log-odds increments. It does not assert identity with the agent finding.

**The framing-and-confirmation result in the 2025 study is a measured agent finding** [Layer 2: Fit]. The Li, Wang, and Yang study measured, in two large language models under controlled conditions, both the framing effect and the confirmation pattern. It found both models reinforced the premises they were handed and let their conclusions vary with framing on otherwise identical inputs. This is an independent measurement, in a different substrate, of the same asymmetric-update signature. It is stated as its own fact, not as evidence for a shared cause.

**The claim that the human confirmation bias and the agent-side confirmation pattern are the same phenomenon** [Layer 3: Estimate]. This is again the series' own interpretive act, carrying the same risk and the same standing objection as the Abstraction identity above.

Proposition 3 is Layer 1 and substrate-free. The two measurements are Layer 2 and independent. The identity is Layer 3, offered as a working estimate with Putnam's reversal of multiple realizability attached, never asserted as settled.

The discipline is identical to Post 1's, applied to a second property. The repetition is the point: the layers are not decoration, but the only thing keeping a genuinely striking double parallel from hardening into an overclaim.

| | Human (confirmation bias) | Agent (framing and confirmation) |
|---|---|---|
| Measured by | Nickerson 1998 (review synthesis) | Li, Wang & Yang 2025 |
| What was measured | Preferential weighting of confirming over disconfirming evidence, in many guises | Reinforcement of handed premises, conclusions shifting with framing |
| Direction of error | {% katex() %}w_+ > 1{% end %} on confirming, {% katex() %}w_- < 1{% end %} on disconfirming | Same asymmetric-weighting signature, measured under controlled conditions |
| Mechanisms catalogued | Selective gathering, selective interpretation, differential scrutiny | Not decomposed into sub-mechanisms in this study |
| Corrective that works | Deliberate falsification, seeking disconfirming tests | Not tested in this study |
| Layer of this series' claim | Layer 2, Fit | Layer 2, Fit |

<figcaption>Table 2: Nickerson's catalogue and the Li, Wang and Yang measurement are two independent instances of the same {% katex() %}w_+ \neq w_-{% end %} distortion, in two substrates, thirty years apart.</figcaption>

| This post's layer discipline | Layer 1, Bound | Layer 2, Fit | Layer 3, Estimate |
|---|---|---|---|
| Abstraction | Proposition 2: sufficiency and the stale-abstraction information loss | Duncker 1945, Luchins 1942 (human); Zhu et al. 2026 (agent); Liu, Karimnazarov & White 2025 (human-agent boundary) | The human and agent fixedness are one phenomenon, not two of the same shape |
| Rationality | Proposition 3: asymmetric updating diverges from Bayes by {% katex() %}n\Delta{% end %} | Nickerson 1998 (human); Li, Wang & Yang 2025 (agent) | The human and agent confirmation bias are one phenomenon, not two of the same shape |

<figcaption>Table 3: both properties carry the same three-layer structure Post 1 established. Only the Layer 3 row carries real interpretive risk; Layer 1 is substrate-free arithmetic and Layer 2 is independent measurement.</figcaption>

## Falsification Criteria

A claim that cannot be wrong is not a claim, so this post states the conditions under which each of its two central assertions would fail. Each condition is concrete and checkable, and each is aimed at a specific layer of a specific property's claim.

**F1 (Abstraction).** A reasoner is shown to escape functional fixedness by operations applied only to its held abstraction, without returning to the raw data the abstraction discarded.

Concretely: take an agent whose intent representation has been collapsed to a fixed summary sufficient for an initial target. On a held-out set of tasks where the target shifts mid-conversation, it recovers the new target's answer at a rate indistinguishable from an agent that re-reads the full conversation, while provably never re-accessing the discarded residual.

If this happens, Proposition 2's information-loss argument is wrong as applied. The data-processing inequality forbids exactly this recovery, so the Layer 1 explanation of the fixedness finding would be mis-stated, not merely mis-mapped.

**F2 (Rationality).** An asymmetric updater with {% katex() %}w_+ \neq w_-{% end %} is exhibited whose posterior converges to the truth as fast as, or faster than, the proper Bayesian posterior, on an evidence stream with non-zero disconfirming mass and well-defined finite likelihood ratios, with the favored hypothesis {% katex() %}H{% end %} false. The favored-hypothesis-true case is not a candidate counterexample: the proposition itself states that the biased reasoner converges no slower there, so a demonstration on that side would confirm it, not falsify it.

This would falsify Proposition 3 directly. The linear-in-{% katex() %}n{% end %} divergence gap {% katex() %}n\Delta{% end %} is derived, for the {% katex() %}\lnot H{% end %}-true case, under exactly those conditions, so a counterexample would mean the gap is mis-derived.

Separately, and attacking the Layer 3 identity rather than the Layer 1 bound: the human confirmation bias could be shown to arise from a mechanism with no analogue in the agent case. For instance, a purely motivational or self-image-protective cause that vanishes when the reasoner has no stake in the hypothesis, while the agent effect persists in the stakeless condition.

Either result severs the two findings: the first by breaking the bound, the second by showing the two effects share a shape but not a cause.

## The Portability Gap for Abstraction and Rationality

The portability gap, defined and quantified in Post 1, is the latency and compute cost of the external verification loop a property needs because it cannot certify itself from within. It takes a concrete form for each of the two properties in this post. I do not redefine it here. I state what it costs for these two.

For Abstraction, the gap is the cost of the loop that detects when a held abstraction has stopped being sufficient for the current target, and forces a return to the raw data.

An agent cannot reliably detect its own stale abstraction from inside. The detection requires the residual {% katex() %}I(D; T_{\text{new}} \mid A){% end %} that the abstraction has, by definition, discarded, and the data-processing inequality proves that quantity is unreachable from the abstraction alone.

The external loop is one that retains access to {% katex() %}D{% end %} and periodically re-derives sufficiency against the current target. Its latency and compute are the portability gap for Abstraction. The chat-search study's finding that only visible failure broke the fixedness is the human-substrate version of the same loop running by accident rather than by design.

For Rationality, the gap is the cost of the loop that supplies disconfirming evidence the reasoner will not sample for itself.

An asymmetric updater's posterior is uninformative not because the updater is broken, but because its evidence stream lacks disconfirming mass. It cannot fix this from inside, because the very asymmetry that needs fixing governs what it draws.

The external loop is a falsification loop: an independent process that constructs tests aimed at breaking the current hypothesis and injects them into the evidence stream, restoring the {% katex() %}\mathbb{E}[\ell_-]{% end %} that confirmation bias drives to zero. Its latency and compute are the portability gap for Rationality.

One requirement on that loop is worth stating precisely, because it rules out the easiest wrong implementation. Running the agent's own existing test suite again is not a falsification loop, no matter how many more times it is run, because a suite the agent was already passing has, by construction, no disconfirming mass left in it for the current hypothesis. The loop has to generate tests aimed at the specific abstraction the agent is currently holding, probing exactly the assumptions that abstraction is not currently being checked against, not at the abstraction in general.

That generation problem is not a new one, and a control plane does not have to solve it from nothing. Three existing infrastructure patterns already generate inputs aimed at breaking a specific claim, rather than confirming it. Property-based testing generates cases from a stated specification of what should hold, not from a fixed list of examples someone already believed would pass, and reports the smallest input it finds that breaks the property {{ cite(ref="12", title="Claessen, K. & Hughes, J. (2000) -- QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs, Proceedings of the Fifth ACM SIGPLAN International Conference on Functional Programming (ICFP), 268-279") }}. Fuzzing generates malformed or unexpected input specifically to surface the cases a hand-written suite never thought to check {{ cite(ref="13", title="Miller, B.P., Fredriksen, L. & So, B. (1990) -- An Empirical Study of the Reliability of UNIX Utilities, Communications of the ACM 33(12), 32-44") }}. Chaos engineering runs the same logic against a live system, injecting real failures to find the assumptions an architecture is quietly resting on before an uncontrolled failure finds them instead {{ cite(ref="14", title="Basiri, A., Behnam, N., de Rooij, R., Hochstein, L., Kosewski, L., Reynolds, J. & Rosenthal, C. (2016) -- Chaos Engineering, IEEE Software 33(3), 35-41") }}.

None of the three was built for Rationality's asymmetric-updating case specifically, and none is cited here as evidence for anything beyond its own domain. What they share with the falsification loop this post specifies is the one property that actually matters: generation aimed at a claim's own weak points, not sampling from what the claim-holder already expects to see. Wiring a falsification loop for an LLM reasoner does not require inventing that generation mechanism. It requires pointing an existing one, property-based generation against the abstraction's stated invariants, or fuzzing against its input contract, at the specific hypothesis the agent is currently holding, rather than at the agent's code in general.

What makes this hard, and worth naming rather than glossing over, is that it cannot be done by consulting the abstraction itself. The very thing that needs probing is the boundary of what the abstraction was never built to represent, and an abstraction, by definition, carries no description of what it left out. Constructing genuine disconfirming evidence therefore requires the same operation Proposition 2 already named as the only remedy for a stale abstraction: returning to the raw data the abstraction discarded and asking what could be true there that the current frame would not detect. Rationality's falsification loop and Abstraction's re-derivation loop are, in this sense, one operation aimed at two different symptoms of the same failure to keep a summary honest.

As in Post 1, the full warrant for why these loops are not optional scaffolding is not established here. Proving a self-certification limit for even one property, and generalizing it further, is a separate undertaking this post does not attempt.

## The Property Verdict Ledger

The series accumulates one artifact across its four posts, a ledger with one entry added per post and assembled in full at the close. Post 1 entered Noticing and Simulation. This post enters Abstraction and Rationality, keeping the same six fields for each.

**Abstraction**

*Formal Proposition:* Proposition 2: sufficiency, {% katex() %}P(T \mid D, A) = P(T \mid A){% end %}; stale-abstraction loss {% katex() %}I(D; T_{\text{new}} \mid A) \geq 0{% end %}

*Human Instance:* Functional fixedness and Einstellung: a target-specific abstraction reused past its sufficiency (Duncker 1945; Luchins 1942)

*Agent Instance:* Tool-failure recovery: LLM agents persisted with invalidated strategies, PRR down roughly 37 percent under implicit failures versus explicit ones, fault tolerance scaling 3.66x slower than task execution (Zhu et al. 2026); human-side corroboration in chat-search fixedness (Liu, Karimnazarov and White 2025)

*Exact vs. Approximate:* Layer 1 exact for the sufficiency identity and the information-loss quantity; Layer 3 approximate for the cross-substrate identity of the two fixedness effects

*Verdict:* Agent does not reliably demonstrate Abstraction: it cannot detect a stale abstraction from within, because the detecting information was discarded at abstraction time

*Control-Plane Consequence:* A re-abstraction loop that retains the raw data and re-derives sufficiency against the current target, triggered on divergence signals rather than trusted to self-detect

**Rationality**

*Formal Proposition:* Proposition 3: asymmetric updating, {% katex() %}g(\ell) = w_+ \ell_+ + w_- \ell_-{% end %}, diverges from Bayes by {% katex() %}n\Delta{% end %}

*Human Instance:* Confirmation bias: preferential weighting of confirming over disconfirming evidence, in many guises (Nickerson 1998)

*Agent Instance:* Framing-and-confirmation study: two LLMs reinforced handed premises and flipped conclusions with framing on identical inputs (Li, Wang and Yang 2025)

*Exact vs. Approximate:* Layer 1 exact for the divergence and sign-flip results; Layer 3 approximate for the cross-substrate identity of the two confirmation effects

*Verdict:* Agent does not reliably demonstrate Rationality: it updates asymmetrically and cannot restore its own disconfirming mass from within

*Control-Plane Consequence:* A falsification loop that constructs and injects hypothesis-breaking tests, restoring the disconfirming evidence the reasoner will not sample for itself

The Exact-versus-Approximate field carries the three-layer discipline into the ledger exactly as it did in Post 1. The theorems are exact and substrate-free. The mapping of each theorem onto its two measured failures is a fit. The claim that each pair of failures is one phenomenon is an approximation, offered as an estimate.

Both verdicts are negative, and neither is an insult to systems that do real work. They are precise statements that two specific properties, keeping a summary honest as the target moves and updating on evidence without a thumb on the scale, are absent in the direction the theorems predict and the studies measure.

The Control-Plane Consequence field is what makes the ledger a gate rather than a diagnosis, and both consequences entered here are buildable.

The Abstraction consequence is a re-abstraction loop that keeps the raw data and re-derives sufficiency on divergence, because the agent provably cannot detect its own stale summary. The Rationality consequence is a falsification loop that manufactures the disconfirming evidence the agent will not draw, because the agent's asymmetry governs its own sampling. Both loops have a cost, and those costs are the portability gaps named above.

The philosophy in this post exists to justify where the two gates are drawn. It does not replace them.

## What This Post Did Not Claim

Because both parallels are seductive, it is worth closing the argument by listing what has deliberately not been asserted, since the omissions are as load-bearing as the claims.

- It has not been claimed that the agents are "as rigid as people" or "as biased as people." The human and agent effects were measured on different apparatuses, and their magnitudes are not commensurable across the substrate boundary in any way this post can defend. It has been claimed only that each pair of effects shares a defining signature, a reused abstraction on one hand and an asymmetric update on the other, and that each is consistent with the same Layer 1 bound.

- It has not been claimed that the chat-search study measured an agent's internal fixedness. That study measured human participants using an LLM system. It is cited as a rigorous measurement of the fixedness mechanism at the human-agent boundary, consistent with Proposition 2, not as proof that the agent itself is functionally fixed in isolation. The distinction is kept deliberately, because collapsing it would be exactly the kind of overclaim the layer discipline exists to prevent.

- It has not been claimed that Abstraction and Rationality are the same property because they fail into each other. They are distinct properties with distinct theorems, and their compounding is a structural observation about the dependency order, not an identity. Abstraction governs what evidence reaches the reasoner. Rationality governs what the reasoner does with it. A system can fail either alone, and the ledger records them as two separate entries for that reason.

- It has not been claimed that the biased and honest reported confidences stay numerically far apart forever when the favored hypothesis is true. In probability they converge together, both toward certainty; the permanent, never-vanishing gap Proposition 3 proves is stated in log-odds, the metric the theorem is actually about, and what survives the translation to probability is the directional fact, strict overstatement at every finite step, not the raw size of the gap.

- It has not been claimed that the two external loops named here are fully justified by this post. Their costs are stated. Their unavoidability is not established here, and a reader who wants the full warrant for why the loops are not optional should not read the consequences given here as complete.

- It has not been claimed that property-based testing, fuzzing, or chaos engineering were built to solve Rationality's asymmetric-updating case, or that any of the three has been shown to satisfy Definition 3's requirements formally. They are cited for a narrower reason: each already generates inputs aimed at a claim's own weak points rather than at confirming it, the one property the falsification loop needs, and a control plane wiring that loop can reuse an existing mechanism instead of inventing one.

> **Cognitive Map**
>
> 1. An abstraction is a summary fitted to a target, free of cost only when it is sufficient, meaning it loses nothing about that target. Functional fixedness is holding the summary fixed after the target has moved: the information the new target needs is provably in the discarded raw data and provably unreachable from the summary itself, so no amount of further thinking inside the old frame recovers it.
> 2. Duncker's candle and Luchins' water jars measured this in humans in the 1940s. A 2026 tool-failure benchmark measured it inside agents that kept running invalidated plans, a roughly 37 percent recovery-rate drop under failures that did not announce themselves compared to failures that did. A 2025 chat-search study measured the same signature at the human-agent boundary.
> 3. Rationality's failure is the mirror image: an asymmetric updater stretches confirming evidence and shrinks disconfirming evidence, producing a posterior that diverges from Bayes by an amount growing linearly with the evidence and, past a stated threshold, converging with confidence to the false hypothesis.
> 4. Nickerson catalogued the human version's many guises in 1998. A 2025 study measured the agent version directly, an LLM reinforcing handed premises and flipping conclusions with framing on identical inputs.
> 5. Both theorems are exact and substrate-free (Layer 1). Each pair of measurements fits its theorem (Layer 2). That each pair is one phenomenon rather than two of the same shape is this series' own estimate (Layer 3), cited with Putnam's own reversal attached, never asserted as settled.
> 6. Architecture is portable. Correctness is not, and the portability gaps here are a re-abstraction loop that keeps the raw data and a falsification loop that supplies the disconfirming evidence, because a property cannot certify from within what it has structurally thrown away.

**Compute it.** Before trusting any agent's answer, check two things directly. First, has the target moved since the agent formed its working summary, and if it has, was the summary re-derived against the new target or carried forward from the old one? A summary carried forward has already discarded the residual the new target needs, and the data-processing inequality guarantees the agent cannot recover it by thinking harder. Second, what is the disconfirming mass in the evidence the agent actually saw? If every test it ran was a test it was built to pass, its confidence is a measurement of its sampling, not of its fix, and it will climb to certainty on a false answer exactly as readily as on a true one. A belief that has never met evidence able to lower it, and a belief that has survived such evidence, look identical on the page. They stop looking identical the moment the target you actually have, and the counterexample you never sampled, arrive together.

---
<sup>[1]</sup> Liu, J., Karimnazarov, J. & White, R. W. (2025). *Trapped by Expectations: Functional Fixedness in LLM-Enabled Chat Search.* arXiv:2504.02074.

<sup>[2]</sup> Duncker, K. (1945). *On Problem-Solving.* Psychological Monographs, 58(5), whole No. 270.

<sup>[3]</sup> Luchins, A. S. (1942). *Mechanization in Problem Solving: The Effect of Einstellung.* Psychological Monographs, 54(6), i-95.

<sup>[4]</sup> Fisher, R. A. (1922). *On the Mathematical Foundations of Theoretical Statistics.* Philosophical Transactions of the Royal Society A, 222, 309-368.

<sup>[5]</sup> Cover, T. M. & Thomas, J. A. (2006). *Elements of Information Theory,* 2nd edition. Wiley (data-processing inequality and mutual-information chain rule, Chapter 2).

<sup>[6]</sup> Nickerson, R. S. (1998). *Confirmation Bias: A Ubiquitous Phenomenon in Many Guises.* Review of General Psychology, 2(2), 175-220.

<sup>[7]</sup> Li, H., Wang, Y. & Yang, X. (2025). *Cognitive Biases in Artificial Intelligence: Susceptibility of a Large Language Model to Framing Effect and Confirmation Bias.* Journal of Psychological Science, 48(4), 892-906.

<sup>[8]</sup> Popper, K. (2002 [1959]). *The Logic of Scientific Discovery.* Routledge Classics.

<sup>[9]</sup> Putnam, H. (1988). *Representation and Reality.* MIT Press (Chapters 5-6, the reconsideration of functionalism).

<sup>[10]</sup> Zhu, D., Ma, X., Shen, Y., Li, X., Zhao, Y., Wang, S., Yan, L. & Yin, D. (2026). *When Tools Fail: Benchmarking Dynamic Replanning and Anomaly Recovery in LLM Agents.* arXiv:2606.05806.

<sup>[11]</sup> Manheim, D. & Garrabrant, S. (2018). *Categorizing Variants of Goodhart's Law.* arXiv:1803.04585.

<sup>[12]</sup> Claessen, K. & Hughes, J. (2000). *QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs.* Proceedings of the Fifth ACM SIGPLAN International Conference on Functional Programming (ICFP), 268-279.

<sup>[13]</sup> Miller, B. P., Fredriksen, L. & So, B. (1990). *An Empirical Study of the Reliability of UNIX Utilities.* Communications of the ACM, 33(12), 32-44.

<sup>[14]</sup> Basiri, A., Behnam, N., de Rooij, R., Hochstein, L., Kosewski, L., Reynolds, J. & Rosenthal, C. (2016). *Chaos Engineering.* IEEE Software, 33(3), 35-41.
