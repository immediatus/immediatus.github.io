+++
authors = ["Yuriy Polyulya"]
title = "The Shared Ancestor Problem"
description = "Two series on this blog solved the same puzzle. Neither knew the other existed. Both landed on one quiet rule: a check is only as honest as the mistake it cannot inherit. This post finally says that rule out loud. It comes in two flavors, one that bends under pressure and one that never does, plus a third case nobody ordered: a process with nothing wrong with it that still needs a babysitter, because of where its inputs came from. Post 5 of The Portable Mind."
date = 2026-09-06
slug = "portable-mind-part5-the-shared-ancestor-problem"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "epistemology", "systems-thinking"]
series = ["portable-mind"]

[extra]
toc = false
series_order = 5
series_title = "The Portable Mind: Five Properties of Thinking"
series_description = """<div class="series-lede">Thinking architecture is portable across a human brain and a transformer. Correctness is not.</div>Five formal properties of thinking, each pinned to a real theorem: Ashby's Law for Noticing and Simulation, a sufficiency identity for Abstraction, an asymmetric-updating result for Rationality, a resource-bounded Loeb's theorem for Awareness, and cost-aware optimal stopping for Optimization. Every theorem is tested against a matching human finding and a current AI-agent finding. One real case opens the series and closes it, rerun through everything the four posts build in between, and Post 4 prices the portability gap itself: a structural cost, computable in kind, never a number any single deployment can just adopt. A fifth post asks what the five external loops actually have in common, and derives the general criterion underneath all of them."""
+++

Five agent instances score between 0.83 and 1.00 on a convergent proof task, averaging 0.967, a pool that looks, by simple headcount, like it is performing near its ceiling. Run it through outlier-resistant selection instead and the diversity-adjusted quality signal drops to 0.400, roughly forty cents on the dollar. Five high scores were not five independent confirmations. They were one answer, restated five times by instances drawn from the same training distribution. The algorithm built to reject a corrupted minority did exactly what it was built to do: it found the disagreement and discarded it, on a task where the disagreement was the only genuine signal left in the pool, first measured in [Independence Illusion](@/blog/2026-07-08/index.md).

That number is from a post on this blog published in July 2026. A different post on this blog, published in September 2026, proved something else {{ cite(ref="1", title="Loeb, M.H. (1955) -- Solution of a Problem of Leon Henkin, Journal of Symbolic Logic 20(2), 115-118") }} {{ cite(ref="2", title="Critch, A. (2019) -- A Parametric, Resource-Bounded Generalization of Loeb's Theorem, and a Robust Cooperation Criterion for Open-Source Game Theory, Journal of Symbolic Logic 84(4), 1368-1381") }}: a reasoner whose self-trust is modeled as provability cannot derive a general reflection schema about its own soundness without collapsing into unconditional assertion. That holds for any system satisfying three specific derivability conditions, regardless of how reliable that system actually is.

Neither post cites the other. Both were computing the same requirement, and neither one derived the requirement itself, only one instance of it.

## One Requirement, Computed Twice

Strip the vocabulary each series built for its own purpose and the underlying claim is identical: a verification signal only counts as a check if it draws on something the thing it checks could not also have corrupted. Independence Illusion proved this for committees: Condorcet's jury theorem, Byzantine fault tolerance, and the Universal Scalability Law all price redundancy the same way. A committee of language-model instances drawn from overlapping training data fails the independence assumption by default, agreeing confidently for the same reason rather than disagreeing for different ones. Loeb's theorem, applied to a single provability-based reasoner, proves the same requirement fails for a different reason entirely. The reasoner's only available derivation apparatus is the one thing that could be wrong, so there is no computation inside the same system that avoids depending on it.

Both are instances of one question: when a system checks itself, or is checked by something built alongside it, what has to be true of the checker for the check to mean anything? The first draft of this post answered that question with one unified criterion and got it wrong in a specific, instructive way: it treated Loeb's theorem as though it were a third instance of the committee mechanism, correlated failure at the limit where correlation reaches one. It is not. The two mechanisms are different in kind, not degree, and the difference is load-bearing enough that stating it precisely is most of this post's actual content.

<span id="def-7"></span>

<details>
<summary>Definition 7 -- Common-Cause Check Validity: what a verification signal actually needs</summary>

**Definition 7** (Common-Cause Check Validity). For a property {% katex() %}P{% end %}, let {% katex() %}\Phi{% end %} be the specific process whose malfunction constitutes {% katex() %}P{% end %}'s failure mode. Let {% katex() %}E_O{% end %} be the event that the object-level output is wrong, and {% katex() %}E_V{% end %} the event that a verification signal {% katex() %}V{% end %}'s verdict about that output is wrong. {% katex() %}V{% end %} is a valid check on {% katex() %}P{% end %} to the degree that two conditions hold:

- **Independence.** {% katex() %}E_V{% end %} and {% katex() %}E_O{% end %} are not both driven by {% katex() %}\Phi{% end %} as a common ancestor. This is stated over an explicit computation graph, inputs, {% katex() %}\Phi{% end %}, the object-level process, {% katex() %}V{% end %}, and any ground-truth channel {% katex() %}V{% end %} has access to, not over the raw outputs themselves. A verifier is allowed to read the same inputs the object-level process read; what breaks validity outright is sharing the specific mechanism that could produce the error. Avoiding that shared mechanism is necessary but not sufficient for zero correlation: the inputs themselves can carry a residual difficulty structure no mechanism can fully resolve. That residual is why C1's independence condition is graded rather than left binary, as the next section establishes.
- **Power.** Bounding a verifier's false-negative rate, {% katex() %}\beta = P(V \text{ says pass} \mid E_O \text{ true}){% end %}, below 1 is necessary but not sufficient: a verifier that always says fail achieves {% katex() %}\beta = 0{% end %} while carrying no information at all, since a constant output cannot correlate with anything. The correct condition also bounds the false-positive rate, {% katex() %}\alpha = P(V \text{ says fail} \mid E_O \text{ false}){% end %}, and requires {% katex() %}1 - \beta > \alpha{% end %}, the standard signal-detection condition that a check's true-positive rate must exceed its false-positive rate to carry any real discriminative power.

</details>

> **Physical translation.** Independence without power certifies a coin flip: unconditionally independent of everything, and unconditionally useless. Power without independence certifies an echo. A checksum computed from the same original data as the payload it verifies satisfies both: it shares an ancestor with the payload, the source data, but not with the specific failure mode being checked for, corruption introduced in a transmission channel the checksum's own computation never passes through. That is the whole distinction. Sharing an origin is not the same as sharing a failure mode, and only the second one breaks a check.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    classDef bad fill:none,stroke:#c0392b,stroke-width:2px;
    classDef good fill:none,stroke:#2980b9,stroke-width:2px;
    subgraph "Shares Φ"
        I1["Inputs"]:::term --> P1["Φ"]:::term
        P1 --> O1["Object-level output<br/>E_O"]:::term
        P1 --> V1["Verifier V<br/>E_V"]:::bad
    end
    subgraph "Avoids Φ"
        I2["Inputs"]:::term --> P2["Φ"]:::term
        P2 --> O2["Object-level output<br/>E_O"]:::term
        I2 --> G["Ground-truth channel G"]:::term
        G --> V2["Verifier V<br/>E_V"]:::good
    end
{% end %}

<figcaption>Figure 0: the same inputs feed both checkers in both graphs, so reading the same data is never what breaks a check. What differs is whether V's own path back to the inputs passes through Φ. On the left it does, failing Definition 7's independence condition, and E_V inherits whatever E_O inherits from Φ. On the right, V reaches the inputs through a separate channel G that never touches Φ, satisfying independence: E_V's dependence on Φ is severed even though V and O still share an ultimate origin.</figcaption>

This is a synthesis of two established tools, not a new theorem. The first is Pearl's causal graphs, specifically the question of whether a shared ancestor creates a dependency between two variables {{ cite(ref="3", title="Pearl, J. (1988) -- Probabilistic Reasoning in Intelligent Systems: Networks of Plausible Inference, Morgan Kaufmann") }}. The second is the standard signal-detection pairing of false-negative and false-positive rates from hypothesis testing. Definition 7 is this post's own construction, assembled from those two tools to state precisely what both series' own results were computing separately, not transcribed from a citation for either half.

One scoping note the first draft of this criterion got wrong and is worth stating explicitly, because the error is instructive. A verifier checking a single object-level output is not a special case of an {% katex() %}N{% end %}-voter committee at {% katex() %}N=2{% end %}. Independence Illusion's own committee theorem restricts explicitly to odd {% katex() %}N{% end %}, since an even pool admits an exact tie majority rule cannot resolve. The relational structure differs besides: symmetric peers estimating the same ground truth in parallel, versus an asymmetric pipeline where {% katex() %}V{% end %} is built specifically to inspect an artifact {% katex() %}O{% end %} already produced. The honest relationship is structural similarity, not formal reduction: both price a correlation {% katex() %}\rho{% end %} between error events, and neither theorem is a special case of the other.

Definition 7 states independence and power as two separate conditions. They are not two independently satisfiable requirements, and the exact relationship between them is provable rather than merely plausible.

<span id="prop-6"></span>

**Proposition 6** (Power Margin Equals Correlation at Matched Base Rates). [Layer 1: Bound] Let {% katex() %}p = P(E_O){% end %} be the object-level error rate and {% katex() %}q = P(\text{V says fail}){% end %} the checker's own flag rate, with {% katex() %}\rho{% end %} the correlation between {% katex() %}E_O{% end %} and {% katex() %}V{% end %}'s fail verdict, not between {% katex() %}E_O{% end %} and {% katex() %}E_V{% end %} itself: {% katex() %}E_V{% end %}, whether {% katex() %}V{% end %}'s verdict is wrong, is a false positive or a false negative depending on which side of {% katex() %}E_O{% end %} it lands, and is not the single Bernoulli variable this identity is stated over. The power margin is exactly {% katex(block=true) %}(1 - \beta) - \alpha = \rho \sqrt{\frac{q(1-q)}{p(1-p)}}{% end %} When the checker's flag rate matches the object-level error rate, {% katex() %}q = p{% end %}, this reduces to {% katex() %}(1 - \beta) - \alpha = \rho{% end %} exactly.

<details class="proof">
<summary>Mathematical proof: the identity, verified against two numeric cases</summary>

**The setup.** Let {% katex() %}X = \mathbb{1}[E_O]{% end %} and {% katex() %}Y = \mathbb{1}[V \text{ says fail}]{% end %}, Bernoulli variables with {% katex() %}E[X] = p{% end %}, {% katex() %}E[Y] = q{% end %}, matching Definition 7's own {% katex() %}\beta = P(V \text{ says pass} \mid E_O){% end %} and {% katex() %}\alpha = P(V \text{ says fail} \mid \lnot E_O){% end %} exactly, both stated over {% katex() %}V{% end %}'s verdict, not over {% katex() %}E_V{% end %}. Their correlation, by the standard definition for two binary variables, is {% katex() %}\rho = \frac{P(X{=}1,Y{=}1) - pq}{\sqrt{p(1-p)q(1-q)}}{% end %}, which pins down the joint probability: {% katex(block=true) %}P(X{=}1, Y{=}1) = pq + \rho\sqrt{p(1-p)q(1-q)}{% end %}

**The two rates.** {% katex() %}1 - \beta = P(Y{=}1 \mid X{=}1) = P(X{=}1,Y{=}1)/p = q + \rho\sqrt{(1-p)q(1-q)/p}{% end %}. Symmetrically, {% katex() %}\alpha = P(Y{=}1 \mid X{=}0) = \bigl(q - P(X{=}1,Y{=}1)\bigr)/(1-p) = q - \rho\sqrt{pq(1-q)/(1-p)}{% end %}.

**The identity.** Subtracting the two: {% katex(block=true) %}(1-\beta) - \alpha = \rho\sqrt{q(1-q)} \left[ \sqrt{\frac{1-p}{p}} + \sqrt{\frac{p}{1-p}} \right]{% end %} The bracketed term reduces algebraically to {% katex() %}1/\sqrt{p(1-p)}{% end %} exactly, giving the identity stated above. This holds with equality for any joint distribution of two Bernoulli variables, by construction of {% katex() %}\rho{% end %}, not as an approximation.

**Checked against two numeric cases.** At {% katex() %}p=q=0.3{% end %}, {% katex() %}\rho=0.5{% end %}: the joint probability works out to {% katex() %}0.195{% end %}, giving {% katex() %}\beta=0.35{% end %}, {% katex() %}\alpha=0.15{% end %}, and {% katex() %}(1-\beta)-\alpha = 0.5{% end %}, matching {% katex() %}\rho{% end %} exactly as the matched-rate case predicts. At {% katex() %}p=0.3{% end %}, {% katex() %}q=0.5{% end %}, {% katex() %}\rho=0.4{% end %}: the general formula gives {% katex() %}(1-\beta)-\alpha \approx 0.4364{% end %}, matching a direct computation from the joint probability to four decimal places.

</details>

> **Physical translation.** A checker whose own flag rate happens to match the base error rate it is checking, and whose correlation with the true error is exactly zero, has exactly zero power margin: it is the coin flip Definition 7's own Physical Translation already named, now derived rather than asserted. Zero correlation with {% katex() %}E_O{% end %} and positive discriminative power cannot coexist in that setting. The two trade off directly, at a rate this proposition makes exact rather than qualitative.

This sharpens what Definition 7's independence condition actually forbids, and what it does not. It does not forbid correlation with {% katex() %}E_O{% end %} itself, since Proposition 6 shows power requires exactly that. It forbids the specific correlation that runs through {% katex() %}\Phi{% end %}.

A checker built on the ground-truth channel {% katex() %}G{% end %} in Figure 0 earns its correlation with {% katex() %}E_O{% end %} honestly, by actually tracking the truth. A checker sharing {% katex() %}\Phi{% end %} earns the identical numerical correlation for free, by inheriting the same mistake. Proposition 6's identity cannot tell the two apart on its own: it prices how much correlation power needs, not where that correlation is allowed to come from. Supplying the second half is Definition 7's whole job. That is why "independent" in Definition 7 means independent of {% katex() %}\Phi{% end %} specifically, and was never a demand for independence from {% katex() %}E_O{% end %} outright.

## What Diversity Actually Buys, and What It Cannot

A checksum genuinely achieves independence, because the specific defect it screens for happens after the checksum was computed. Most real verification is not that clean, and the reason is not sloppy engineering, but a genuine trade-off, worth stating in the form this blog states every trade-off in: an achievable region, not a paragraph of hedging.

<span id="def-8"></span>

<details>
<summary>Definition 8 -- The Diversity-Correlation Achievable Region: what independence costs and what it cannot buy</summary>

**Definition 8** (Diversity-Correlation Achievable Region). Order the layers of substrate that can be diversified between an object-level process and a checker verifying it, from cheapest to most expensive to change: prompt, then model weights, then training corpus, then the ground-truth channel itself. Let {% katex() %}c(k){% end %} be the engineering cost of diversifying through the {% katex() %}k{% end %}-th layer in that order, and {% katex() %}\rho(k){% end %} the resulting correlation between {% katex() %}E_O{% end %} and {% katex() %}V{% end %}'s fail verdict, in Proposition 6's own sense of {% katex() %}\rho{% end %}, specifically its {% katex() %}\Phi{% end %}-mediated component. The achievable region is the set of pairs {% katex() %}(c(k), \rho(k)){% end %} reachable by diversifying through layer {% katex() %}k{% end %}. It has a floor rather than a zero: {% katex() %}\rho(k) \to \rho_{\min}(\text{task}){% end %} as diversification exhausts every available layer, where {% katex() %}\rho_{\min}(\text{task}) > 0{% end %} is set by the difficulty landscape of the task itself, a property of the input space no substrate diversification touches.

</details>

The qualifier "its {% katex() %}\Phi{% end %}-mediated component" in that definition is not a technicality, and skipping it would put Definition 8 at odds with Proposition 6 rather than beside it. Proposition 6 already showed that correlation between {% katex() %}E_O{% end %} and {% katex() %}V{% end %}'s fail verdict is not, on its own, something to drive to zero: it is what power is made of. Driving Definition 8's {% katex() %}\rho(k){% end %} toward its floor cannot mean driving *that* correlation down, on pain of driving power down with it, all the way to the coin flip at {% katex() %}\rho = 0{% end %}.

What diversification actually shrinks is narrower. Total correlation between {% katex() %}E_O{% end %} and {% katex() %}V{% end %}'s fail verdict splits into two sources, matching Figure 0's two paths. One is a {% katex() %}\Phi{% end %}-mediated part, earned for free by inheriting the same mistake {% katex() %}O{% end %} makes. The other is a {% katex() %}G{% end %}-mediated part, earned honestly by actually tracking the truth. Diversifying through a layer targets only the first. A well-built checker does not diversify its way toward zero total correlation; it diversifies the {% katex() %}\Phi{% end %}-component toward {% katex() %}\rho_{\min}(\text{task}){% end %} while holding, or growing, the {% katex() %}G{% end %}-component that Proposition 6 says its power margin actually depends on. The floor this section is about is a floor on the bad half of the correlation, not a ceiling smuggled in against the good half.

Eckhardt and Lee proved something stronger than an empirical observation about sloppy engineering. Even genuinely independently developed checkers generically produce correlated failures whenever task difficulty varies across the input space, because harder inputs make every checker more likely to fail together, regardless of how differently they were built {{ cite(ref="4", title="Eckhardt, D.E. & Lee, L.D. (1985) -- A Theoretical Basis for the Analysis of Multiversion Software Subject to Coincident Errors, IEEE Transactions on Software Engineering 11(12), 1511-1517") }}.

This is not a purely theoretical worry. Knight and Leveson ran the experiment directly: twenty-seven independently written, independently tested implementations of the same specification, built by different programming teams with no contact between them. They still failed on a shared subset of inputs far more often than an independence assumption predicts, the empirical floor beneath Eckhardt and Lee's theoretical one {{ cite(ref="5", title="Knight, J.C. & Leveson, N.G. (1986) -- An Experimental Evaluation of the Assumption of Independence in Multi-Version Programming, IEEE Transactions on Software Engineering SE-12(1), 96-109") }}. Littlewood and Miller later showed that deliberately forcing methodological diversity between checkers can push correlation below what independent development alone achieves, but never to zero {{ cite(ref="6", title="Littlewood, B. & Miller, D.R. (1989) -- Conceptual Modeling of Coincident Failures in Multiversion Software, IEEE Transactions on Software Engineering 15(12), 1596-1614") }}.

The floor drops. It does not disappear.

None of this is a hypothetical extrapolation to language models. Kim, Garg, Peng, and Garg measured the same failure directly {{ cite(ref="9", title="Kim, E., Garg, A., Peng, K. & Garg, N. (2025) -- Correlated Errors in Large Language Models, arXiv:2506.07962, accepted ICML 2025") }}: LLM errors correlate across models far more than an independence assumption predicts. That correlation is severe enough that the naive ensembling and majority-vote aggregation Independence Illusion's own committee math prices can fail outright, on exactly the pools that look healthiest by headcount.

Measuring that correlation is not the same as auditing it formally, and this post is not first to try the second thing either. A concurrent statistical framework audits behavioral entanglement among black-box LLM judges directly, introducing information-theoretic metrics that predict judge over-endorsement bias {{ cite(ref="10", title="Kuai, C., Jiang, J., Zhu, Z., Wang, H., Wu, K., Li, Z., Zhang, Y., Liu, C., Tu, Z., Fan, Z. & Zhou, Y. (2026) -- A Statistical Framework for Auditing Behavioral Dependence and Induced Bias in LLM Judges, arXiv:2604.07650") }}. It derives a de-entangled verifier-reweighting scheme along lines close to what Definition 7's own power condition demands. It stays entirely within the graded, empirical register {% term(url="@/blog/2026-09-06/index.md#prop-8", def="C1, the common-cause clause: a check fails when its own error correlates with the object-level error through a shared mechanism, graded by correlation and escapable at a cost through substrate diversification") %}C1{% end %} covers. It never crosses into the unconditional, self-reference register {% term(url="@/blog/2026-09-06/index.md#prop-8", def="C2, the self-reference clause: Loeb's theorem forbids a provability-based reasoner from certifying its own soundness from within, binary and unconditional, with no escape at any cost") %}C2{% end %} requires.

This post's own contribution is not the observation that verifiers correlate with what they check. Both works above already establish that. It is stating precisely when that correlation is C1's kind and when it is C2's, a distinction neither needed to draw, because neither one crosses into the Löbian half of the question at all.

Applied to a checker built from a language model, the hierarchy of shared, diversifiable ancestors runs in the fixed order Definition 8 already named:

- prompt
- model weights
- training corpus
- the ground-truth channel itself

Beyond even the last of these sits one ancestor no amount of substrate diversity touches: the difficulty landscape of the task itself. A checker built on a completely different model still shares that difficulty landscape with the thing it is checking.

That floor is why Definition 7's independence condition has to be graded, correlation {% katex() %}\rho{% end %} somewhere between 0 and 1, not a binary valid-or-invalid predicate. Independence Illusion's own correlation-quality function is the working estimator for {% katex() %}\rho{% end %} at the committee scale {{ cite(ref="7", title="Ladha, K. (1992) -- The Condorcet Jury Theorem, Free Speech, and Correlated Votes, American Journal of Political Science 36, 617-634, cited via this blog's Independence Illusion post, 2026-07-08") }}. It was built for this purpose, and explicitly flagged there as that post's own interpolation rather than a citation. The multi-agent series' committee math and the single-agent series' verifier math are pricing the same {% katex() %}\rho{% end %}, at two different scales. They are not two different quantities that happen to share a symbol.

### What This Buys: When to Stop Diversifying

Definition 8 names a floor. It does not say where a deployment should rationally stop short of it, and that question has an actual answer, provable by the same exchange argument Post 4 used for its own stopping rule, not by intuition about "enough diversity."

<span id="prop-7"></span>

**Proposition 7** (Diversification Stopping Rule). [Layer 1: Bound] Let {% katex() %}\Delta\rho(k) = \rho(k-1) - \rho(k){% end %} be the correlation reduction bought by diversifying through layer {% katex() %}k{% end %}, and let {% katex() %}\lambda{% end %} be the deployment's own exchange rate: how much engineering cost it is willing to pay per unit of correlation reduced. Assume returns are diminishing along Definition 8's own cheapest-to-most-expensive order, {% katex() %}c(k)/\Delta\rho(k){% end %} non-decreasing in {% katex() %}k{% end %}, which holds whenever cost rises at least as fast as marginal benefit falls. Under that assumption, the policy minimizing cost paid plus residual correlation is to diversify through layer {% katex() %}k{% end %} exactly when {% katex() %}c(k) < \lambda \cdot \Delta\rho(k){% end %}, and stop at the first layer where this fails.

<details class="proof">
<summary>Mathematical proof: the exchange argument, and why the floor is never actually reached</summary>

**The objective.** A deployment choosing how many layers to diversify through is minimizing {% katex() %}C_k + \lambda \cdot \rho(k){% end %}: total cost paid, plus the residual correlation left, weighted by what avoiding it is actually worth. {% katex() %}C_k = \sum_{i \le k} c(i){% end %} is cumulative cost through layer {% katex() %}k{% end %}.

**Why the marginal rule is optimal.** Taking layer {% katex() %}k{% end %} changes the objective by {% katex() %}c(k) - \lambda \cdot \Delta\rho(k){% end %}: it costs {% katex() %}c(k){% end %} and saves {% katex() %}\lambda \cdot \Delta\rho(k){% end %} in residual correlation. Take the step exactly when this is negative, {% katex() %}c(k) < \lambda \cdot \Delta\rho(k){% end %}, and stop otherwise. Any policy that stops before this holds can be improved by taking the next step; any policy that continues past it can be improved by stopping there. Only the threshold rule is not improvable in either direction.

The diminishing-returns assumption is what makes that local argument a global one. It guarantees that once a layer fails the test, every later layer fails it too, so checking layers in the fixed order and stopping at the first failure is the same policy as checking every possible subset and keeping the best. Without it, a bad layer sitting in front of a good one could make skipping ahead beat the threshold rule outright. A layer costing 100 for a return of 0.1 blocks a later layer costing 1 for a return of 2, and stopping at the first failure throws away the second layer's real value. Definition 8's own cheapest-to-most-expensive ordering is what the assumption asks the engineering reality to match, not a free simplification.

The exchange argument itself is borrowed from Post 4's Proposition 5, deliberately reused here, not the same theorem transplanted. Post 4's Proposition 5 solves a stochastic problem, a reservation value pinned by an integral over a continuous draw distribution. This is a deterministic problem over a small, fixed, ordered set of layers instead. Claiming the diversification rule is a special case of Post 4's Proposition 5 would repeat exactly the overclaim this post already rejected once for the N=2 committee case. What transfers is the proof *technique*, an exchange argument showing a threshold is non-improvable in either direction, not the probability model underneath it.

**Why the floor is never reached.** For any finite {% katex() %}\lambda{% end %}, the rule stops at the first layer whose marginal correlation reduction is no longer worth its cost, at some {% katex() %}\rho(k^*) > \rho_{\min}(\text{task}){% end %}, strictly above the floor. Only as {% katex() %}\lambda \to \infty{% end %}, a deployment willing to pay any cost for any reduction, does the stopping point push to the last available layer, and even there {% katex() %}\rho{% end %} only approaches {% katex() %}\rho_{\min}{% end %}, because no further layer exists to buy the rest.

</details>

> **Physical translation.** This is the same shape as Post 4's own reservation value, arrived at independently rather than borrowed by force: an ideal a system would reach if the relevant cost were zero, approached but never touched at any positive cost, with the actual stopping point set by what the next unit of improvement is worth to the deployment, not by how close to the ideal it would like to be. Post 4 priced how much search is worth. This prices how much independence is worth. In both cases the honest answer is less than a system would like, for a reason a formula makes precise rather than a shrug.

Proposition 7 is about four discrete layers, in the fixed cheapest-to-most-expensive order Definition 8 named: prompt, model weights, training corpus, the ground-truth channel. The chart below does not illustrate that rule with an invented curve. It runs it, on one fixed set of per-layer cost and correlation-reduction numbers. Drag the exchange rate {% katex() %}\lambda{% end %} and watch which layers the rule actually takes, marked directly against {% katex() %}c(k) < \lambda \cdot \Delta\rho(k){% end %}, the condition Proposition 7 proves is the whole policy.

<div style="margin:1.5em 0;">
<div style="display:flex; align-items:center; gap:0.75em; margin-bottom:0.5em; flex-wrap:wrap;">
<label for="lambda-slider2" style="font-size:0.9em; color:#444;">Exchange rate λ, cost per unit of ρ reduced:</label>
<input type="range" id="lambda-slider2" min="0" max="3.1703" value="2" step="0.001" style="flex:1; min-width:140px;">
<span id="lambda-value2" style="font-family:monospace; font-size:0.9em; min-width:4em; text-align:right;">100</span>
</div>
<canvas id="chart-diversify-bars" aria-label="Bar chart with one pair of bars per diversification layer: the layer's cumulative cost against that layer's marginal correlation reduction times the exchange rate lambda. The diversification stopping rule says to take a layer while its cost bar is shorter than its priced-benefit bar, and stop at the first layer where the cost bar is taller. The chart marks that first failing layer. Moving the exchange rate slider changes which layers are taken." style="width:100%; aspect-ratio:700/400; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<p id="diversify-readout" style="font-size:0.9em; color:#444; margin-top:0.5em;"></p>
</div>
<script>
(function () {
  const canvas = document.getElementById('chart-diversify-bars');
  const ctx = canvas.getContext('2d');
  const slider = document.getElementById('lambda-slider2');
  const lambdaLabel = document.getElementById('lambda-value2');
  const readout = document.getElementById('diversify-readout');
  const layerLabels = ['prompt', 'weights', 'corpus', 'ground truth'];
  const layers = [
    { c: 1, dRho: 0.30 },
    { c: 4, dRho: 0.20 },
    { c: 12, dRho: 0.15 },
    { c: 30, dRho: 0.05 },
  ];
  let W, H, pw, ph;
  const L = 55, R = 20, T = 20, B = 55;
  function stopIndex(layers, lambda) {
    for (let i = 0; i < layers.length; i++) {
      if (!(layers[i].c < lambda * layers[i].dRho)) return i;
    }
    return layers.length;
  }
  function setupCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width; H = rect.height;
    pw = W - L - R; ph = H - T - B;
  }
  function draw() {
    const lambda = Math.pow(10, parseFloat(slider.value));
    const benefits = layers.map(l => lambda * l.dRho);
    const yMax = Math.max(1, ...layers.map(l => l.c), ...benefits) * 1.15;
    function py(v) { return T + (1 - v / yMax) * ph; }
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#444'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      const y = py(v);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(L, y); ctx.lineTo(L - 5, y); ctx.stroke();
      ctx.fillText(v.toFixed(v < 1 ? 2 : 0), L - 8, y + 4);
    }
    ctx.save(); ctx.translate(15, T + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText('cost / priced benefit', 0, 0); ctx.restore();
    const k = stopIndex(layers, lambda);
    const groupW = pw / 4, barW = groupW * 0.32, gap = groupW * 0.06;
    layers.forEach((l, i) => {
      const gx = L + i * groupW;
      const takes = l.c < benefits[i];
      const cx = gx + groupW * 0.15;
      ctx.fillStyle = (i < k) ? '#2980b9' : '#93b8d1';
      ctx.fillRect(cx, py(l.c), barW, py(0) - py(l.c));
      const bx = cx + barW + gap;
      ctx.fillStyle = (i < k) ? '#27ae60' : '#a3d9b5';
      ctx.fillRect(bx, py(benefits[i]), barW, py(0) - py(benefits[i]));
      if (i === k) {
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
        ctx.strokeRect(gx + 2, T + 2, groupW - 4, ph - 4);
      }
      ctx.fillStyle = '#333'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1) + ': ' + layerLabels[i], gx + groupW / 2, T + ph + 16);
      ctx.fillText(takes ? 'take' : 'skip', gx + groupW / 2, T + ph + 30);
    });
    if (k < 4) {
      ctx.fillStyle = '#c0392b'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('stops here', L + k * groupW + groupW / 2, T + 14);
    }
    ctx.fillStyle = '#2980b9'; ctx.fillRect(L + pw - 90, T, 10, 10);
    ctx.fillStyle = '#444'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('c(k)', L + pw - 76, T + 9);
    ctx.fillStyle = '#27ae60'; ctx.fillRect(L + pw - 40, T, 10, 10);
    ctx.fillStyle = '#444'; ctx.fillText('λ·Δρ(k)', L + pw - 26, T + 9);
    lambdaLabel.textContent = lambda.toFixed(lambda < 10 ? 2 : 0);
    readout.textContent = k === 0
      ? ('At λ = ' + lambda.toFixed(2) + ', layer 1 already costs more than it is worth: the rule takes no layers.')
      : k === 4
      ? ('At λ = ' + lambda.toFixed(2) + ', every layer is worth its cost: the rule takes all four, still short of ρ_min(task).')
      : ('At λ = ' + lambda.toFixed(2) + ', the rule takes layers 1 through ' + k + ' and stops before layer ' + (k + 1) + ' (' + layerLabels[k] + '), where cost ' + layers[k].c.toFixed(2) + ' exceeds priced benefit ' + benefits[k].toFixed(2) + '.');
  }
  slider.addEventListener('input', draw);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries, observer) => {
      if (entries[0].isIntersecting) { observer.disconnect(); setupCanvas(); draw(); }
    }, { threshold: 0.2 }).observe(canvas);
  } else { setupCanvas(); draw(); }
  window.addEventListener('resize', () => { setupCanvas(); draw(); });
})();
</script>

<figcaption>Figure 1: one fixed cost and correlation-reduction number per layer, Proposition 7's own stopping condition run directly against them. Each bar pair compares that layer's cost to its benefit priced at λ; the rule takes a layer while the cost bar is shorter, and the chart marks the first layer where that stops holding. Drag the slider and watch the stopping point move.</figcaption>

One honesty note this shares with Post 4's own: {% katex() %}\lambda{% end %} is a real number a deployment has to supply, and this post does not derive one. What a unit of residual correlation actually costs, in downstream incidents, wasted retries, or a silently wrong deployment, is exactly the kind of deployment-specific judgment Post 4 already flagged when it declined to collapse token cost, latency, and context loss into one number. The theorem's shape holds regardless of the number chosen. Only the number itself resists derivation.

## Five Properties, Checked Against the Same Requirement

<span id="prop-8"></span>

**Proposition 8** (Two Structurally Different Reasons a Check Fails). [Layer 2: Fit] Definition 7's requirement resolves differently across the five properties this series proved, and the difference is not uniform. Four of the five admit an available, if costly, internal pathway around their own worst-case regime. One does not, for any regime.

<details class="proof">
<summary>Working the five cases against Definition 7</summary>

**Simulation.** {% katex() %}\Phi{% end %} is the noticing process. A verification signal computed purely from noticed variety, the same channel that produced the original forecast, shares {% katex() %}\Phi{% end %} with it: the question "have I noticed enough" is answered using the same resource the forecast itself was built from. An externally-anchored variety estimate, one that does not derive from the same noticed-variety channel, avoids {% katex() %}\Phi{% end %}. It still has to actually cover the task's disturbance variety to satisfy the power condition; independence relocates Ashby's Law's own requirement, it does not discharge it.

**Abstraction.** {% katex() %}\Phi{% end %} is the compression step that produced the working summary {% katex() %}A{% end %} from the raw data {% katex() %}D{% end %}. This is the cleanest case, because the theorem and the graph coincide exactly. By the chain rule, {% katex() %}I(D;T) = I(A;T) + I(D;T \mid A){% end %}, and because {% katex() %}A{% end %} is a deterministic function of {% katex() %}D{% end %}, the sequence {% katex() %}T \to D \to A{% end %} is a Markov chain for any target whatsoever, so the data processing inequality guarantees no computation on {% katex() %}A{% end %} alone can recover the residual {% katex() %}I(D;T \mid A){% end %}. A verifier confined to {% katex() %}A{% end %} shares exactly that residual's absence with the object-level process; one that returns to {% katex() %}D{% end %} does not.

This is a hard zero within the {% katex() %}A{% end %}-only regime, not a graded correlation the way the other cases are. But the regime itself is a choice: nothing prevents a system from retaining and returning to {% katex() %}D{% end %}, at a cost. That escapability is what keeps this case distinct from Awareness, the one case below with no escape at any cost.

**Rationality.** {% katex() %}\Phi{% end %} is not the weighting function alone. A verifier applying an honestly different weight to the same censored evidence stream still shares the actual failure, because the censorship happened in how evidence was sampled, not only in how it was weighed. {% katex() %}\Phi_{\text{Rationality}} = (g, \pi){% end %}, the weighting function and the sampling policy together. A valid check needs independence in both: an honest weight applied to dishonestly sampled evidence is still corrupted, and an honest sample dishonestly weighed is too.

**Awareness.** {% katex() %}\Phi{% end %} is the entire derivation apparatus of a provability-based reasoner. This is the case that does not admit an internal escape at any cost, and the reason is worth stating precisely rather than by analogy. Loeb's theorem, applied to resource-bounded reasoners, proves that no internal derivation, however structured, avoids answering to the same provability predicate the object-level claim itself was derived through. There is no "return to {% katex() %}D{% end %}" move available here the way there is for Abstraction, because there is no analogue of raw data sitting outside the derivation system that a check could return to while remaining an internal derivation.

The obstruction binds regardless of the system's actual reliability. A hypothetically perfectly sound reasoner, one whose every proof happens to be true, still cannot derive the general reflection schema, because deriving it for every statement would force the reasoner to derive every statement outright, true or false, which is the collapse into unconditional assertion. This is a fact about what is derivable, not about what fails together. There is no error to correlate, because the obstruction does not depend on there being one.

**Optimization.** Post 4's Proposition 5 proves the reservation-value threshold rule is exactly optimal given honest inputs. There is no {% katex() %}\Phi{% end %}-level failure to check for in Optimization's own mechanism at all. What still requires external governance is addressed separately below, because it is not an instance of either pattern above.

</details>

The pattern that emerges is not "one criterion, five uniform instances." It is two structurally different reasons a check can fail, and knowing which one applies changes what the fix actually has to be.

**C1, the common-cause clause**, covers Simulation, Abstraction, and Rationality, plus the multi-agent committee results Independence Illusion already proved. A check fails when its error correlates with the object-level error through a shared {% katex() %}\Phi{% end %}. This is graded, escapable at a cost per Definition 8's achievable region, and it is the reliability-engineering and social-choice mechanism this whole first half of the post has been building: Condorcet, Krum, and the Universal Scalability Law on one side, Ashby's Law, the data-processing inequality, and the asymmetric-updating divergence result on the other.

**C2, the self-reference clause**, covers Awareness alone. Loeb's theorem binds even at zero error rate. There is no failure to correlate, because there is no failure, only a structural fact about what a system can derive about itself. This is binary and unconditional, not graded, and it is the one place either series has a proof rather than a measured or argued-for correlation.

Both clauses cash out as "the check has to live outside the closure of the thing it checks." They are not the same reason for it, and collapsing them into one mechanism, the way the first draft of this criterion did, would misstate what Loeb's theorem actually proves.

| | C1, common-cause | C2, self-reference |
|---|---|---|
| Nature | Graded, correlation {% katex() %}\rho \in [0,1]{% end %} | Binary, unconditional |
| Escapable? | Yes, at a cost (Definition 8) | No, for any regime |
| Governs | Simulation, Abstraction, Rationality, the multi-agent committee case | Awareness alone |
| Warrant | Measured or argued-for correlation | Proof, Loeb's theorem |
| Binds at zero error rate? | No, independence can reach it | Yes, unconditionally |

<figcaption>Table 1: the two clauses side by side. They share a conclusion, external verification is required, but nothing else on this row, which is the reason collapsing them into one mechanism was the first draft's central defect.</figcaption>

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
graph LR
    classDef c1graded fill:none,stroke:#2980b9,stroke-width:2px;
    classDef c1hard fill:none,stroke:#2980b9,stroke-width:2px,stroke-dasharray: 4 4;
    classDef c2 fill:none,stroke:#c0392b,stroke-width:2px;
    classDef ic fill:none,stroke:#333,stroke-width:2px;
    C1["C1: common-cause<br/>graded, escapable at a cost"]:::c1graded
    C2["C2: self-reference<br/>binary, no escape, any regime"]:::c2
    IC["Inherited Consequence<br/>corollary of C1/C2, not a clause"]:::ic
    C1 --- Sim["Simulation"]:::c1graded
    C1 --- Rat["Rationality"]:::c1graded
    C1 --- MA["Multi-agent committee<br/>Independence Illusion"]:::c1graded
    C1 -.-> Abs["Abstraction<br/>hard-zero sub-case, still escapable"]:::c1hard
    C2 --- Awa["Awareness"]:::c2
    IC --- Opt["Optimization"]:::ic
{% end %}

<figcaption>Figure 2: five properties plus the multi-agent case, sorted by which structural pattern actually governs their failure. Solid blue is graded C1. Dashed blue marks Abstraction's hard-zero sub-case, which looks C2-shaped locally but stays escapable, the distinction the next section proves rather than asserts. Red is C2's unconditional bind. Optimization sits outside both, governed by composition rather than a failure of its own.</figcaption>

This lines up with Post 4's own {% term(url="@/blog/2026-09-05/index.md", def="Monitor-Analyze-Plan-Execute-Knowledge: the autonomic-computing reference loop Kephart and Chess formalized in 2003, mapped in Post 4 onto this series' five properties, with Knowledge sitting cross-cutting rather than as a pipeline stage") %}MAPE-K{% end %} correspondence at exactly one seam and diverges at another, and both are worth stating rather than left for a reader to notice unprompted. Knowledge's cross-cutting position there, standing outside the four active stages rather than inside them, is why Awareness stands alone here too: C2 governs a property that answers for the whole loop, not one stage of it, the same structural reason in both posts.

Where the two correspondences part ways is Optimization. Execute sits inside the active pipeline in Post 4's mapping, on the same footing as Monitor, Analyze, and Plan, which correspond respectively to the three properties C1 does govern here, Simulation, Abstraction, and Rationality. Optimization does not follow its own pipeline neighbors into C1, for the composition reason argued below. Two independently built structural pictures agree exactly on where Awareness sits and disagree on whether Optimization is ordinary, and the disagreement is not a loose end between the posts, it is this section's own finding, arrived at from a different direction.

One dashed line in that figure is doing more work than it looks like it's doing.

### Is the split actually exhaustive

Checked directly rather than left as an open item, because Abstraction's own hard zero is a plausible place for a third category to be hiding, the way Awareness turned out to hide C2 in the first place. Confined to computing from {% katex() %}A{% end %} alone, the data processing inequality gives exactly zero recoverable information about the discarded residual, a hard fact, not a correlation that interpolates between 0 and 1 the way Simulation's variety bound and Rationality's divergence bound do. Within the {% katex() %}A{% end %}-only regime, Abstraction looks momentarily Loeb-shaped: absolute, not graded.

It is not a third category, and the reason is the same reason C2 does not reduce to C1 in the other direction. Whether the {% term(url="@/blog/2026-08-30/index.md", def="Data-Processing Inequality: no downstream computation can increase the information a signal carries about a target beyond what its input already carried, proven in Post 2 via Cover and Thomas (2006)") %}DPI{% end %}'s hard zero applies at all is a choice, not a fact about the system: nothing stops a verifier from retaining and returning to {% katex() %}D{% end %}, the re-abstraction remedy this series already prescribes elsewhere, always architecturally available, just costly. Loeb's theorem has no analogous escape. There is no "just don't restrict yourself" move available inside the same formal system, because every internal derivation, however structured, answers to the same provability predicate, regardless of how the system is built or reconfigured. The DPI's absoluteness is conditional on an architectural choice a system could make differently. Loeb's is not conditional on anything a system could choose.

That is the actual line between C1 and C2: C1 cases have an available, if costly, internal escape route from their own worst-case regime; C2 does not, for any regime. C1 is not internally uniform. It splits further into a hard-zero sub-case escapable by regime change, Abstraction, and continuously-graded sub-cases, Simulation, Rationality, and the multi-agent committee result. Both sub-cases remain on the escapable side of the line that actually separates C1 from C2. The split is exhaustive, not merely unrefuted.

## The Case a Verification Criterion Cannot Just File Away

Optimization does not fit either clause, and the honest move is not to file it outside the framework and move on. Individual decisions in a controlled multi-agent study showed strong rational cost-benefit logic with minimal escalation of commitment. The same decision, made through symmetrical peer deliberation among several model instances, escalated to near-universal, about 99.2 percent of runs {{ cite(ref="8", title="Barkett, E., Long, O. & Kröger, P. (2025) -- Getting out of the Big-Muddy: Escalation of Commitment in LLMs, arXiv:2508.01545") }}. Post 4's own threshold rule did not become unsound between the individual case and the group case. Nothing in the object-level mechanism changed.

<span id="def-9"></span>

<details>
<summary>Definition 9 -- Inherited Consequence: why a sound mechanism can still need a governor</summary>

**Definition 9** (Inherited Consequence). [Layer 2: Fit] If a property's own verification is sound, neither C1 nor C2 applies to its own {% katex() %}\Phi{% end %}, but its inputs are drawn from a property where C1 or C2 does apply, the composed system still needs external verification. Not because the downstream property has a hidden failure of its own, but because C1 and C2 failures propagate through data dependencies regardless of how sound each individual computation is.

</details>

> **Physical translation.** A stopping rule fed a corrupted probability estimate will stop at the wrong place with perfect internal consistency, because internal consistency was never what was in question. The rule is not the thing that failed. The rule is the thing that faithfully executed on state it had no way to audit, because auditing its own inputs is not an operation its own theorem covers, and was never claimed to be.

Optimization is not a third instance of {% term(url="@/blog/2026-09-06/index.md#prop-8", def="C1, the common-cause clause: a check fails when its own error correlates with the object-level error through a shared mechanism, graded by correlation and escapable at a cost through substrate diversification") %}C1{% end %}: forcing it into that clause would misstate what Post 4's Proposition 5 actually proves, that the rule itself has no shared ancestor with any error, because it has no error of its own to correlate. Nor is it {% term(url="@/blog/2026-09-06/index.md#prop-8", def="C2, the self-reference clause: Loeb's theorem forbids a provability-based reasoner from certifying its own soundness from within, binary and unconditional, with no escape at any cost") %}C2{% end %}, since nothing about the threshold computation is a self-reference obstruction. And Inherited Consequence is not a peer to C1 and C2 either. Giving it a letter of its own would imply a third *reason a property's own check can fail*, when this is precisely the case where it does not: it is a corollary of the two clauses under composition, not a third clause beside them.

That word, corollary, is doing real work and is worth making precise rather than left as a figure of speech. A sound downstream mechanism sounds like it should offer some protection, the way redundancy ordinarily does. It offers no guaranteed protection, and the reason is provable.

<span id="prop-9"></span>

**Proposition 9** (No Structural Guarantee of Dilution). [Layer 1: Bound] If a downstream mechanism is a deterministic function of its input with no branch, cross-check, or aggregation step that compares that input against anything else, composing through it carries no structural guarantee that an upstream C1 or C2 failure is diluted. Whatever the propagated error rate turns out to be is set by the geometry of the corruption relative to that mechanism's own mapping, a fact about that specific mapping and that specific corruption, not a property soundness confers. A downstream mechanism cannot be trusted, on soundness alone, to have reduced the error rate an upstream failure introduced, and cannot be assumed to have left that rate exactly as it was either.

<details class="proof">
<summary>Mathematical proof: why soundness downstream neither corrects nor is bound to preserve what it cannot see</summary>

**The mechanism.** Let {% katex() %}f{% end %} be the downstream computation, sound in the sense Post 4's Proposition 5 is sound: it correctly implements its own specification given whatever input it receives. Soundness is a claim about {% katex() %}f{% end %}'s relationship to its own input, not about the input's relationship to the truth.

**Why composition carries no guarantee either way.** Suppose the upstream signal is wrong with probability {% katex() %}\varepsilon{% end %}, and {% katex() %}f{% end %} has no second input, cross-check, or aggregation over multiple estimates that could reveal this. Then {% katex() %}f{% end %} cannot condition its behavior on whether the input is wrong, because a wrong input and a right one differ only in value, not in any signal {% katex() %}f{% end %} can observe.

Whether the propagated error rate ends up above, at, or below {% katex() %}\varepsilon{% end %} is therefore not something soundness decides. It turns on whether {% katex() %}f{% end %} happens to map the specific wrong values the corruption produces to the same output the true values would have produced, a question about the geometry of {% katex() %}f{% end %}'s own level sets against the corruption's own distribution, not about {% katex() %}f{% end %}'s soundness. A many-to-one {% katex() %}f{% end %}, a threshold comparison among the plainest examples, can absorb corruption that stays on the same side of its boundary the truth was already on. What soundness forecloses is narrower than any claim about the resulting rate: only that {% katex() %}f{% end %} detects the corruption and corrects for it, since detection requires exactly the second signal, cross-check, or aggregation step the premise excludes.

What this leaves open for any particular downstream mechanism, Optimization's own threshold rule included, is a case-specific question, not a Layer 1 fact: not whether {% katex() %}f{% end %} is trustworthy, but whether the corruption it actually receives has a geometry {% katex() %}f{% end %}'s mapping happens to absorb. Proposition 9 answers "no guarantee either way" in general. Whether a given stage dilutes, preserves, or worsens a given upstream failure has to be checked against that failure's own shape, taken up below for Optimization specifically.

</details>

> **Physical translation.** A vote-counting machine that counts every ballot correctly does not care whether the ballots were stuffed. Perfect correctness at the counting stage is not evidence about the count's relationship to who actually voted, because the counting stage was never built to check that relationship at all. Composition can move where an error becomes visible, and can happen to blunt it or sharpen it depending on how the stage's own arithmetic lands relative to the stuffing. It earns no credit either way, because nothing in soundness was ever aimed at getting that relationship right in the first place.

The tempting reading runs the other way, and it is worth saying plainly why it fails here. A system with several sound stages generally feels more reliable than any one stage alone, and for genuinely independent errors that intuition is correct: redundancy really does average out uncorrelated mistakes.

A pipeline is not a committee. Its stages are not redundant estimates of the same fact being combined. Each stage consumes only what the one before it produced, and a pipeline, unlike a committee, has no redundancy to average. Proposition 9 is the reason the usual intuition does not apply here.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    classDef bad fill:none,stroke:#c0392b,stroke-width:2px;
    classDef good fill:none,stroke:#2980b9,stroke-width:2px;
    subgraph "Committee: has redundancy to average"
        A1["Estimate 1"]:::term --> Agg["Aggregator<br/>e.g. majority vote"]:::good
        A2["Estimate 2"]:::term --> Agg
        A3["Estimate 3"]:::term --> Agg
        Agg --> Out1["Output<br/>wrong only if most inputs agree wrongly"]:::good
    end
    subgraph "Pipeline: no redundancy to average"
        X["Upstream signal<br/>wrong with probability ε"]:::bad --> F["f: sound, single input,<br/>no cross-check"]:::term
        F --> Out2["Output<br/>error rate not guaranteed<br/>lower than ε either way"]:::bad
    end
{% end %}

<figcaption>Figure 3: an aggregator has several independent-ish estimates to check against each other, so a minority error can be outvoted, the case Independence Illusion already covers. A single-input pipeline stage has nothing to check its one input against, so nothing in its own soundness promises the output is any less wrong than the input was. Whether it happens to be turns on how the stage's mapping lands relative to the specific corruption, not on anything soundness confers.</figcaption>

Calling this a corollary rather than a third clause is a claim about its structure, not about its stakes. C1 and C2 answer why a property's own check can fail. Proposition 9 answers a different question: what happens when a sound mechanism sits downstream of one that already failed. For anyone assembling a multi-stage or multi-agent pipeline out of individually-verified pieces, that second question is the one actually load-bearing in production. Soundness at every stage, checked independently, is not evidence the pipeline as a whole is safe to run. This is worth flagging as its own practical warning before the next section narrows to Optimization's specific case, because the general point survives even where that specific case does not.

**Optimization's own threshold is a case of Proposition 9, not a corollary of it** [Layer 2: Fit]. Whether composition through Post 4's threshold rule dilutes, preserves, or worsens what feeds it depends on the geometry Proposition 9 leaves open, and that geometry is not generic here. The signal reaching the threshold is not corrupted by noise scattered symmetrically around the true value. It inherits Simulation's own systematic direction, Proposition 1's token-cost forecast biased low by a factor of roughly five, and Rationality's own systematic direction, Proposition 3's asymmetric updating inflating confidence in whatever hypothesis was already favored. Both push the same way: believed cost down, believed odds of success up, toward the side of the threshold that says keep going.

A threshold does not attenuate a bias aimed at the specific side of {% katex() %}\theta{% end %} it is least equipped to catch. A corrupted value that lands on the wrong side of {% katex() %}\theta{% end %} produces the wrong decision with the same certainty a true value on the right side would have produced the right one. A bias large and consistently signed relative to the margin between the true value and {% katex() %}\theta{% end %} lands on the wrong side far more often than a bias with no preferred direction would. This is not the general result. It is what the general result's open question answers to, once the specific shape of the corruption feeding this specific stage is put in.

**Applying Inherited Consequence to the multi-agent escalation result is a hypothesis, not a measured fact** [Layer 3: Estimate]. Each agent instance's verdict is read by the others in a symmetrical peer structure. That deliberative coupling would be a shared ancestor of every member's vote, if the coupling is in fact what drives the escalation, and it would explain the group's effective independent count collapsing toward one, the same pattern Independence Illusion formalizes for committees generally.

That qualifier is load-bearing, not throat-clearing. Post 4's own account of this same study states outright that no formal result pins down which mechanism actually drives the escalation, an information cascade among correlated peers being one candidate among others. This post does not have stronger grounds than that post did. What is solid is narrower than "a live C1 instance": the multi-agent finding is consistent with C1, and would be explained by it if the mechanism turns out to be correlated voting, a real, checkable hypothesis about the same data, not yet a measured mechanism.

The [Constraint Sequence Framework](@/blog/2025-12-27/index.md), this blog's own general systems-engineering maxim, said as much already: a constraint that surfaces at one level cannot be resolved by re-optimizing at that level, because the dependency graph puts the binding constraint upstream of where it became visible. What changes here is the grounding, not the claim, precise verification theory in place of a general maxim. Optimization's portability gap is that constraint. The local mechanism is operating on borrowed guarantees from a property that was never secured, not a broken mechanism in its own right.

## Falsification Criteria

**F1 (the common-cause criterion).** A verification signal is exhibited that shares its computation graph's {% katex() %}\Phi{% end %} with the object-level process it checks, thereby failing Definition 7's independence condition, yet still satisfies the power condition as stated in Definition 7 and reliably detects errors at a rate the correlation floor established above says it should not be able to reach.

This would falsify Definition 7 directly, not just weaken it. If a checker sharing a common cause with the thing it checks can still reliably discriminate errors above what the correlation floor predicts, the independence condition is not doing the work claimed for it.

**F2 (the self-reference criterion).** A consistent, sufficiently powerful provability-based reasoner is exhibited that derives the general reflection schema for arbitrary statements without thereby becoming able to derive arbitrary falsehoods, while remaining consistent.

Post 3, this series' own Awareness post, already states this exact criterion for Proposition 4 as its own F1. It appears here as F2 only because this post's numbering runs C1 first: the two labels name one criterion, not two. A counterexample here breaks C2, not C1, and it would not touch the graded cases at all.

**F3 (the directional non-dilution claim).** A single-input, non-aggregating, cross-check-free downstream mechanism is exhibited, fed a systematic, directional corruption engineered to land on the side of its decision boundary the mechanism is least equipped to catch, exactly the shape Simulation's and Rationality's own biases give Optimization's threshold, whose output error rate is nonetheless measurably lower than the rate at which the corruption itself crosses that boundary.

This would falsify the Layer 2 claim about Optimization specifically, not Proposition 9 itself. Proposition 9 claims only that composition carries no guaranteed dilution, which a mechanism that happens to dilute a directional bias would not contradict, since no guarantee was made either way. What F3 tests is narrower and is the claim the Optimization case actually needs: whether a bare threshold, with nothing to compare its input against, can be relied on to attenuate a bias aimed at the specific side of its own boundary. A counterexample built from symmetric noise would not touch this, since any threshold dilutes symmetric noise that rarely reaches the boundary at all. That is not the case in question, and is not what F3 asks for.

This is the newest and least-tested claim in this post. Unlike F1 and F2, it has not been checked against an independent case beyond the one it was built from. Note the scope Proposition 9 itself states: a downstream mechanism that does aggregate multiple estimates, a committee vote, a median filter, is outside what F3 tests at all, and is exactly Independence Illusion's own subject instead.

**F4 (the diversification stopping rule).** A cost-correlation profile satisfying Definition 8 is exhibited, and a fixed exchange rate {% katex() %}\lambda{% end %}, under which some policy other than Proposition 7's marginal rule achieves a strictly lower value of {% katex() %}C_k + \lambda \cdot \rho(k){% end %} at every {% katex() %}k{% end %}.

This is the least likely of the four to fail, since the exchange argument behind it is a standard optimality proof for monotone marginal problems, the same style Post 4's Proposition 5 already uses. The more realistic failure mode is not that the rule is wrong but that {% katex() %}\lambda{% end %} is not actually a single stable number. If what a unit of residual correlation costs itself changes with how much correlation remains, the single-exchange-rate premise the proof depends on breaks before the rule does.

## What This Post Did Not Claim

- It has not been claimed that {% term(url="@/blog/2026-09-06/index.md#prop-8", def="C1, the common-cause clause: a check fails when its own error correlates with the object-level error through a shared mechanism, graded by correlation and escapable at a cost through substrate diversification") %}C1{% end %} and {% term(url="@/blog/2026-09-06/index.md#prop-8", def="C2, the self-reference clause: Loeb's theorem forbids a provability-based reasoner from certifying its own soundness from within, binary and unconditional, with no escape at any cost") %}C2{% end %} are two instances of one mechanism. They are not. Awareness's obstruction holds at zero error rate; the other four properties' obstructions are statements about correlated error and vanish, in principle, if a genuinely independent channel is built. Conflating them would be the same category-crossing this series' own Franzen caveat was built to refuse, committed here in the opposite direction: a reliability-engineering criterion annexing a provability theorem instead of a provability theorem annexing an empirical claim.
- It has not been claimed that a single verifier checking one output is a special case of the committee math at {% katex() %}N=2{% end %}. That claim was made in an earlier draft of this criterion, failed independent review on the grounds stated above, and has been dropped rather than softened. The honest relationship is structural similarity, not formal reduction.
- It has not been claimed that Definition 7 is a new theorem, only a synthesis of Pearl's causal graphs and standard signal-detection theory, assembled to state precisely what two already-published series were computing separately. The synthesis is this post's own construction; the tools it is built from are not.
- It has not been claimed that this criterion has passed independent review in the strong sense that phrase usually carries. A protocol-driven check of nine specific, individually-scored claims corrected two real errors that neither round of this post's own self-review had caught. The first was the discarded N=2 overclaim above. The second was an earlier power condition that bounded only the false-negative rate, which the always-fail verifier in Definition 7 satisfies while carrying zero information. A third finding was more interesting than either: the review process's own attempt to correct a citation detail was itself checked further and found wrong, so the original text, already correctly hedged, was left unchanged. That is a live instance of the exact problem this post is about, a checker's own verdict needing a check in turn, caught only because the checking did not stop at one pass, not a third error to add to the tally. None of this is evidence that correlation between drafting and checking reached zero. By this post's own Eckhardt and Lee citation, a checking process sharing a training corpus and a task-difficulty landscape with the drafting process carries a common ancestor regardless of how independently it was prompted, and whether this particular round of checking cleared that bar was never itself tested. Every claim above should be read as surviving one round of unknown independence, not as independently confirmed in the strong sense the phrase carries elsewhere in this post.
- It has not been claimed that every single-input downstream mechanism propagates an upstream failure at the same rate it received it. Proposition 9 claims only that composition without a cross-check offers no structural guarantee of dilution either way; a mechanism whose mapping happens to absorb the specific corruption it receives can and sometimes will dilute it. What is claimed for Optimization specifically, that its threshold does not dilute the bias reaching it, is argued at Layer 2 from the directional shape Propositions 1 and 3 already gave that bias, not derived from Proposition 9 alone, and it carries the same single-case, no-independent-counterexample status the rest of Inherited Consequence does.
- It has not been claimed that Proposition 7 tells a deployment what {% katex() %}\lambda{% end %} actually is. It tells a deployment what to do once {% katex() %}\lambda{% end %} is known, the same division of labor Post 4 drew between its own stopping theorem and the token-cost number that theorem needs fed into it.
- It has not been claimed that the diversification stopping rule is optimal for an arbitrary cost-and-benefit profile across the four layers. It requires diminishing returns along Definition 8's own ordering, {% katex() %}c(k)/\Delta\rho(k){% end %} non-decreasing in {% katex() %}k{% end %}, stated explicitly in the proof for exactly this reason: a layer that costs little for a large reduction sitting behind one that costs much for a small reduction would make skipping ahead beat the threshold rule, and the exchange argument only proves the rule cannot be improved along the fixed order, not against every possible subset of layers.
- It has not been claimed that a constant {% katex() %}\lambda{% end %} prices what residual correlation costs under every consensus mechanism. The exchange argument needs one number, the marginal cost of a unit of {% katex() %}\rho{% end %} at the point a deployment is choosing between, which is exactly what Independence Illusion's {% katex() %}Q(N,p,\rho){% end %} supplies: a graded, linear-in-{% katex() %}\rho{% end %} interpolation, this series' own construction rather than a citation, as Definition 2 there already flagged. A deployment running strict Byzantine quorum consensus instead, where correlated faults crossing a fixed fraction collapse safety as a step rather than a slope, is outside the case {% katex() %}Q{% end %} was built for, and Proposition 7 inherits that scope from it rather than widening it.
- It has not been claimed that Proposition 6 is a substantive result the way the others are. It is an algebraic identity, following directly from the definition of correlation for two Bernoulli variables, true for any joint distribution by construction rather than by a claim about any particular system. Its content is not in the fact that it holds, but in what it forces once Definition 7's two conditions are read together, and no falsification criterion is stated for it below for that reason: there is no experiment that could find it false, only a check of the algebra, which the two numeric cases above already are.

> **Cognitive Map**
>
> 1. Two series on this blog, built independently, proved the same requirement from opposite directions: a check only counts if it draws on something the thing it checks could not also have corrupted, tested at the multi-agent committee scale in one series and the single-reasoner scale in the other.
> 2. Independence and power are not two independent knobs. At matched base rates, the power margin equals the correlation between checker and object-level error exactly, {% katex() %}(1-\beta)-\alpha = \rho{% end %}, which proves rather than merely asserts why a perfectly independent checker is a coin flip, and clarifies what Definition 7 actually forbids: not correlation with the truth, which power requires, but the specific correlation that runs through {% katex() %}\Phi{% end %}.
> 3. That requirement splits into two structurally different clauses, not one. C1, common-cause failure, is graded, escapable at a cost, and governs four of the five properties Portable Mind proved plus the committee case Independence Illusion proved. C2, self-reference, is binary and unconditional, and governs Awareness alone, because Loeb's theorem binds even at zero error rate. The split was checked directly for a hidden third case and confirmed exhaustive: C1 itself has a hard-zero sub-case (Abstraction) and graded sub-cases, but both remain escapable in a way C2 never is.
> 4. Diversifying a checker's substrate away from the thing it checks is not free and does not reach zero correlation: Eckhardt and Lee proved even independently built checkers correlate whenever task difficulty varies, Knight and Leveson measured that same failure in twenty-seven independently written program versions, and forced diversity lowers the floor without erasing it. Two 2025-2026 papers confirm this is not a historical curiosity: LLM errors measurably correlate across models, and a concurrent statistical framework audits that correlation for LLM judges directly, both staying inside C1's graded register and neither crossing into C2's. How far to push diversification has an actual answer, not a rule of thumb: diversify through a layer precisely while its cost is below what the correlation it removes is worth, an exchange argument in the same style Post 4 used for its own stopping rule, arrived at independently because the underlying problem is deterministic where Post 4's was stochastic, not because one theorem was stretched to cover both.
> 5. A third pattern, Inherited Consequence, is not a third clause but a corollary of the first two under composition: a property with a provably sound mechanism of its own can still need a governor, because its inputs were corrupted by a different property's own C1 or C2 failure. This is not merely definitional: a downstream mechanism with no cross-check on its input carries no structural guarantee of diluting an upstream error rate, the reason redundancy's usual protection does not apply to a pipeline the way it applies to a committee, and Optimization's own threshold fails to dilute for a further, case-specific reason: the bias reaching it is directional, not the symmetric noise a bare threshold would happen to absorb. Optimization's multi-agent escalation is this pattern's best candidate case, offered as a hypothesis consistent with the data, not a settled mechanism.
> 6. None of this has passed review independent of the process that built it in the strong sense the term usually carries, and that is stated here as an open fact about this post's own epistemic status, not a caveat to be read past.

**Compute it.** Before trusting any check, whether it is a second model instance voting alongside the first or a verification loop auditing a single agent's own output, ask what {% katex() %}\Phi{% end %} is for the specific failure being checked for, and whether the check's own computation passes through it. If it does, no amount of additional checking helps, only a genuinely different pathway does. How different is measured in prompt, weights, training corpus, and the ground-truth channel, each one a harder floor to clear than the last, and none of them free, with the task's own difficulty landscape waiting past all four, uncrossable at any price. Before deciding how far down that list to go, put a number on what a unit of residual correlation actually costs, and stop at the first layer that costs more than it saves. Going further than that number justifies is not extra caution, it is spending past the point the spending was worth. And before trusting a property that seems to need no check at all, ask whether its inputs came from somewhere that did, and whether the mechanism in between has anything that could have caught the difference. A sound mechanism fed corrupted state and a sound mechanism fed honest state produce outputs that look identical until the state they were built on turns out to have been wrong, and by then the mechanism that failed is not the one anyone was watching.

---

<sup>[1]</sup> Loeb, M. H. (1955). *Solution of a Problem of Leon Henkin.* Journal of Symbolic Logic, 20(2), 115-118.

<sup>[2]</sup> Critch, A. (2019). *A Parametric, Resource-Bounded Generalization of Loeb's Theorem, and a Robust Cooperation Criterion for Open-Source Game Theory.* Journal of Symbolic Logic, 84(4), 1368-1381.

<sup>[3]</sup> Pearl, J. (1988). *Probabilistic Reasoning in Intelligent Systems: Networks of Plausible Inference.* Morgan Kaufmann.

<sup>[4]</sup> Eckhardt, D. E. & Lee, L. D. (1985). *A Theoretical Basis for the Analysis of Multiversion Software Subject to Coincident Errors.* IEEE Transactions on Software Engineering, 11(12), 1511-1517.

<sup>[5]</sup> Knight, J. C. & Leveson, N. G. (1986). *An Experimental Evaluation of the Assumption of Independence in Multi-Version Programming.* IEEE Transactions on Software Engineering, SE-12(1), 96-109.

<sup>[6]</sup> Littlewood, B. & Miller, D. R. (1989). *Conceptual Modeling of Coincident Failures in Multiversion Software.* IEEE Transactions on Software Engineering, 15(12), 1596-1614.

<sup>[7]</sup> Ladha, K. (1992). *The Condorcet Jury Theorem, Free Speech, and Correlated Votes.* American Journal of Political Science, 36, 617-634.

<sup>[8]</sup> Barkett, E., Long, O. & Kröger, P. (2025). *Getting out of the Big-Muddy: Escalation of Commitment in LLMs.* arXiv:2508.01545.

<sup>[9]</sup> Kim, E., Garg, A., Peng, K. & Garg, N. (2025). *Correlated Errors in Large Language Models.* arXiv:2506.07962. Accepted to ICML 2025.

<sup>[10]</sup> Kuai, C., Jiang, J., Zhu, Z., Wang, H., Wu, K., Li, Z., Zhang, Y., Liu, C., Tu, Z., Fan, Z. & Zhou, Y. (2026). *A Statistical Framework for Auditing Behavioral Dependence and Induced Bias in LLM Judges.* arXiv:2604.07650.
