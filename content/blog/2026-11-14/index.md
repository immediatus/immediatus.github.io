+++
authors = ["Yuriy Polyulya"]
title = "Correct, and Rejected"
description = "Every engineer has watched a better design lose a review that nobody rigged. Asch showed how a room bends a judgment, cascade theory how the first voices settle a meeting, Parkinson how the bike shed gets the hour, and political science how veto holders guard the status quo. This post stacks those findings into one model of a review and finds where correct designs die: in trivia, or aligned to death before anyone says no. Better slides will not save them. Moving a gate might."
date = 2026-11-14
slug = "adoption-mechanics-part1-correct-and-rejected"
draft = false

[taxonomies]
tags = ["systems-thinking", "game-theory", "control-theory", "decision-making"]
series = ["adoption-mechanics"]

[extra]
toc = false
series_order = 1
series_title = "Adoption Mechanics: Why Correct Designs Die, and Where Human Attention Belongs"
series_repo = "https://github.com/immediatus/experiments/tree/main/adoption-mechanics"
repo = "https://github.com/immediatus/experiments/blob/main/adoption-mechanics/docs/part1-correct-and-rejected.md"
series_description = """<div class="series-lede">Agreement is the cheapest state any system can reach. Consensus is the most expensive way to get there.</div> A review has a human energy budget, and correct designs die where it goes. This series builds one model of a review: people with correlated signals and careers to protect, a vote taken in order, a chain of hand-offs, and veto gates guarding a status quo. People and AI agents differ in it only by a few parameters, several of them measured. The first part follows a design through a human review: first-writer-wins, trivia every pair must settle, and good designs aligned to death. The second gives the model agent values and finds machines that agree for free too, wrong on the same hard questions. The third gives AI a job, not a seat: the Residual Protocol spends machines on everything that can be written and a fixed budget of human attention on what cannot. Every number comes from executed code, and every part names the observation that would prove it wrong."""
+++

Picture a design review most engineers will recognize. It takes ninety minutes. The successor control design is better than the incumbent by every measurement the research group can make. It has been piloted on a shadow copy of production for a quarter. Its failure modes are written down, and they are smaller than the incumbent's. Fifteen reviewers read it in advance. None of them is hostile, and several say in private afterward that they think it is right.

The review does not adopt it. The minutes record no objection that the group could not answer, and no reviewer who voted against. They record a decision to revisit the design next quarter, after the platform migration. The migration takes three quarters, and by then the people who championed the design have moved to other work. The review is a composite, and this post builds a model of it from parts that can each be checked.

The usual explanation is character: politics, ego, inertia, someone protecting a fiefdom. The explanation is comfortable because it locates the failure in a person, and a person can be argued with, replaced or outlasted. It also predicts that the remedy is a better argument, delivered more forcefully, or a better set of reviewers.

This post asks what happens if the explanation is wrong. Suppose every reviewer is competent, honest and paid to get the answer right. Suppose each of them reads the design carefully and forms a private judgment of it that is more often right than wrong. Can such a group still reject a correct design, reliably and without anyone behaving badly? And if it can, which part of the process does the rejecting?

The answer is yes, and the rejecting is done in four places. The reviewers' judgments are correlated, because they learned their trade from the same incidents, so fifteen of them, averaged, carry the information of three to five. They speak in order, so early votes can settle the outcome before most private judgments are heard. Their verdict reaches the decision makers through layers of hand-off, each of which drops part of the signal. And the decision makers are veto gates, each defending a status quo that may already satisfy every one of them better than any single change could.

Each of these four stages is an established result in some field. Correlated sensors are signal processing and credit risk. Herding in sequential votes is the economics of information cascades. Veto players are comparative politics. The value of waiting before a costly switch is the theory of real options. What has been missing is their composition, in one model of one member, judged on what it adopts and what it refuses. That composition is what this post builds, and it changes the advice. Some stages can be repaired by better arguments. One cannot, and in the opening review it is the one that decided.

The same member model carries over to AI agents with different parameter values, several of which have been measured. This post stays with people. Every constant that sets a probability in the model is stated and swept, and every result names the observation that would refute it.

<div class="recap-box">
<span class="recap-label">In brief</span>
<ul>
<li><strong>The belief.</strong> A correct design argued well enough gets adopted; when it does not, someone behaved badly.</li>
<li><strong>The mechanism.</strong> Four stages: correlated sensing, often by groups that decide apart, aggregation in order, hand-off through layers, and veto gates whose spatial test multiplies everything else.</li>
<li><strong>The law.</strong> Correlation sets a floor no panel size removes; a status quo inside the hull of the gates' ideal points blocks every change, whatever its merit; and most designs die in the team review, many of them without anyone saying no.</li>
<li><strong>The gap.</strong> Reasons recorded after a decision are partly stories, and no test on the records alone can tell the story from the cause.</li>
<li><strong>The intervention.</strong> Read the gates first; then pick levers on both kinds of design, where the widest gap always needs a panel that errs in different places.</li>
<li><strong>The bill.</strong> In the running case, the best combination keeps a better design's chances near 71% and cuts a worse design's from 20% to 7%; inside the hull, every combination adopts nothing.</li>
<li><strong>Where you stand.</strong> Place your status quo among the gates' stated priorities; if it sits inside them, no argument will pass, so change a gate first.</li>
</ul>
</div>

<details>
<summary>Notation used in this part</summary>

**Members and their signals**

- {% katex() %}n{% end %} - the number of reviewers; the running case has 15
- {% katex() %}q{% end %} and {% katex() %}p = 1 - q{% end %} - the precision of one reviewer's private signal, and the probability that it is wrong
- {% katex() %}\rho{% end %} - the correlation of two reviewers' errors on a latent scale, through one shared factor
- {% katex() %}N_{\text{eff}}{% end %} - the number of independent opinions an equal-weight average of {% katex() %}n{% end %} reviewers carries
- {% katex() %}\Phi{% end %} and {% katex() %}\Phi^{-1}{% end %} - the standard normal distribution function and its inverse

**Payoffs and positions**

- {% katex() %}\gamma{% end %} - immediate conformity: the cost of disagreeing in the room, independent of any future
- {% katex() %}\delta{% end %} - the horizon: the weight a reviewer puts on reputation in later reviews
- {% katex() %}\kappa{% end %} - ability self-certainty: how sure a reviewer is that they are good at judging designs
- {% katex() %}e{% end %} - sunk endorsement: whether the reviewer once endorsed the incumbent
- {% katex() %}\lambda{% end %} - loss aversion: the weight on a loss against the status quo
- {% katex() %}\varphi{% end %} - faithfulness: the share of a recorded reason that tracks what actually drove the outcome

**The process**

- {% katex() %}a{% end %} and {% katex() %}d{% end %} - the share of a signal's amplitude one hand-off keeps, and the number of hand-offs
- {% katex() %}z_1, \dots, z_V{% end %} and {% katex() %}s{% end %} - the ideal points of {% katex() %}V{% end %} veto gates in a plane of concerns, and the status quo
- {% katex() %}c{% end %} - the sunk cost of switching designs, in either direction
- {% katex() %}A_+{% end %} and {% katex() %}A_-{% end %} - the probability that a review adopts a design that is better than the incumbent, and one that is worse

**The tags**

- L1 · Bound, L2 · Fit and L3 · Estimate - the tag on each paragraph: a proof or a cited fact, a judgment or approximation the text argues for, and a worked example computed from the model

</details>

<details>
<summary>Results from earlier series this part uses</summary>

- Definition 2 of [The Independence Illusion](@/blog/2026-07-08/index.md#def-2): a correlation-corrected quality {% katex() %}Q(N, p, \rho) = p + (Q_{\text{ind}}(N, p) - p)(1 - \rho){% end %}, "an interpolation built for this post, not transcribed from a cited source", matching the two limits of full independence and total correlation.
- Proposition 5 of [The Trigger to Stop Simulating](@/blog/2026-09-27/index.md#prop-5): with the value of a one-time investment following geometric Brownian motion and its cost {% katex() %}I{% end %} fixed, the optimal exercise threshold is {% katex() %}V^\ast = \beta I/(\beta - 1){% end %} with {% katex() %}\beta > 1{% end %}, so the investment waits for a value well above its cost.
- The approval shape and loss aversion of [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md): a bounded test has "a shape that a change-management process already knows how to approve", a standing policy "never finishes", and a reviewer weighs the standing policy's downside against a reference point it never returns to.

</details>

## The Belief: Good Designs Win on Merit

{{ layer(n=2, type="Fit", id="the-belief-stated") }}The belief has a respectable form. A review is a measurement. Each reviewer reads the design and forms a judgment, the judgments are combined, and the combination is more reliable than any one of them. If the design is better, most reviewers will see that, and the combination will say so. When the combination says no, either the design was not better, or something outside the measurement interfered: a reviewer with an interest, a decision maker with a grudge.

{{ layer(n=2, type="Fit", id="what-the-belief-assumes") }}Written that way, the belief makes four assumptions, and each one is a stage of a pipeline. It assumes the reviewers' errors are independent, so combining them averages the errors away. It assumes the combination hears every private judgment. It assumes the combined verdict reaches the decision makers intact. And it assumes the decision makers adopt whatever the verdict favors. A failure at any one stage rejects the design, and none of the four failures requires a person to behave badly.

{{ layer(n=2, type="Fit", id="why-a-pipeline") }}The rest of this post takes the four assumptions in that order. The first three stages produce and relay evidence, and the fourth turns it into a decision. Part of the fourth is a gate in the strict sense: if the gates' priorities leave no change they all prefer, adoption is zero whatever the evidence says. That is the first thing the belief misses. The spatial test is a precondition, not a filter further down the line. The gates' hull is the region a band stretched around their ideal points would enclose. While the status quo sits inside the gates' hull, no change improves on it for every gate, so stronger evidence or a clearer argument cannot move the decision. Evidence levers gain leverage only once a win-set exists.

{{ layer(n=1, type="Bound", id="the-approval-gap") }}This series picks up a gap an earlier one left open on purpose. [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) found that a standing probing policy is harder to approve than a one-shot test. The reasons were approval shape and loss aversion, and the post named "the approval gap" between what the mathematics recommends and what an ordinary approval process can approve. That post explained why one kind of proposal is hard to approve. This one asks why any correct proposal can fail, and which stage fails it.

## One Model of a Member

{{ layer(n=2, type="Fit", id="one-member-model") }}The model has one kind of member, and its parameters do the work that personality does in the usual explanation. A member holds a private signal about the design, takes an action in order, and is paid for the result. The payoff has five parts. They are the value of a correct verdict, the discomfort of disagreeing, reputation in later reviews, a reference point at the status quo, and a career position that prices each disagreement.

<details>
<summary>Definition 1 -- Member: a bounded signal, an action in order, and a payoff over accuracy, conformity, reputation, loss and position</summary>

**Definition 1** (Member). *A member of a review holds a private binary signal about whether the design is better than the incumbent, right with probability {% katex() %}q > 1/2{% end %}. The signal's log-likelihood ratio is bounded by {% katex() %}\ln(q/(1-q)){% end %}. Two members' errors are correlated through one shared factor: member {% katex() %}i{% end %} errs when {% katex() %}\sqrt{\rho}\,Z + \sqrt{1-\rho}\,\varepsilon_i < \Phi^{-1}(p){% end %}, with {% katex() %}Z{% end %} and the {% katex() %}\varepsilon_i{% end %} independent standard normal. In turn, the member endorses, stays silent or rejects, and vetoes where it holds a veto. Its payoff weighs the accuracy of the verdict, an immediate conformity cost {% katex() %}\gamma{% end %}, reputation over the horizon {% katex() %}\delta{% end %}, losses against the status quo with weight {% katex() %}\lambda \ge 1{% end %}, and a career position given by ability self-certainty {% katex() %}\kappa \in [0, 1]{% end %} and sunk endorsement {% katex() %}e \in \{0, 1\}{% end %} of the incumbent. It may change its answer with no new input, with probability {% katex() %}\eta{% end %}, and its stated reasons track its actual drivers with faithfulness {% katex() %}\varphi \in (0, 1]{% end %}.*

</details>

{{ layer(n=2, type="Fit", id="why-bounded") }}The signal is binary and its strength is bounded, and that choice matters. Smith and Sørensen showed that herding can lock in a wrong outcome forever only when no single signal can be strong enough to overturn a long run of agreement{{ cite(ref="1", title="Smith, L. and Sørensen, P. (2000) -- Pathological Outcomes of Observational Learning, Econometrica 68(2)") }}. A design review fits that condition. Nobody in the room holds a proof that the design is better; each holds an impression formed from a document, a pilot and their own scars.

{{ layer(n=2, type="Fit", id="why-correlation-latent") }}Correlation is defined on a latent scale, not on how often two reviewers agree. Two reviewers who both judge well agree often for the boring reason that both are usually right. What matters for a panel is whether their mistakes come together. The one-factor model says each reviewer's judgment mixes a shared component with a private one, and the weight of the shared component is {% katex() %}\rho{% end %}. One decision cannot say what the shared component is made of: experience the whole team has in common, or a decision that is simply hard for everyone. The model treats both alike.

{{ layer(n=2, type="Fit", id="parameters-not-traits") }}Nothing in Definition 1 names a personality. A reviewer who stays silent is a reviewer whose payoff from silence is larger, and the definition says exactly which terms make it larger. That is what lets the same model describe an AI agent. An agent has a conformity term too, trained in rather than learned at meetings. It has no career, so some terms go to zero. The values change. The form does not.

<details>
<summary>The model and its sources: what every result of this post assumes, and where each assumption comes from</summary>

The running case is one review of a successor design: 15 reviewers, three layers of hand-off between them and the decision, and four approvers who can each veto it: the architecture board, the engineering manager who owns the roadmap, security and product. Site reliability checks release readiness after the decision, and the model does not test that check. Each reviewer's signal is right with probability 0.7, and errors correlate at 0.25. A champion of the design votes first, or stays silent; the others vote in order, each following the lead once it outweighs their own signal. Each hand-off keeps 0.85 of the verdict's amplitude. Each gate must prefer the design to the status quo in a plane of concerns. The relayed evidence, plus the gate's own noise, must then clear the adoption threshold of a band set by a switching cost of 0.2 and loss aversion of 2.25.

The precision and the correlation are calibrated against scientific peer review, in the section that checks the model against real panels. The other constants that set a probability are illustrative and swept one at a time: the hand-off share, the gate noise, the design's merit and the loss aversion. The gates' positions in the plane are illustrative too, and the cliff of Proposition 3 does not depend on them. Each adoption probability comes from 20,000 simulated reviews, so its standard error is at most 0.0035, and the comparisons the text draws are several standard errors wide. The bounded signal follows Smith and Sørensen. The order rule is the model of Bikhchandani, Hirshleifer and Welch. The gates follow Tsebelis. The switching band follows Dixit, solved numerically. The write-back loop follows Esponda and Pouzo.

</details>

## Two Ways a Review Can Be Wrong

{{ layer(n=2, type="Fit", id="two-ways-intro") }}Before the stages, the scorecard. A review can fail by rejecting a better design, and it can fail by adopting a worse one. A reform that improves only the first number is easy to find: pass everything. So every stage and every lever in this post is read on both numbers at once, and the evidence and the decision are kept apart.

<span id="def-2"></span>
<details>
<summary>Definition 2 -- Adoption Pipeline: adoption is a spatial test times the probability that the relayed evidence clears the threshold</summary>

**Definition 2** (Adoption Pipeline). *A review passes a design through sensors, aggregation, hand-off and the actuator. The actuator has two parts. Its spatial test {% katex() %}G \in \{0, 1\}{% end %} passes when some change is preferred to the status quo by every gate and the design is such a change. Its evidence test passes when the evidence relayed from the first three stages, plus each gate's own noise, clears that gate's adoption threshold. The probability of adoption is*

{% katex(block=true) %}
A = G \cdot E, \qquad E = P(\text{relayed evidence clears every threshold})
{% end %}

*where {% katex() %}E{% end %} depends jointly on the stages that produce and relay the evidence, and on the band that sets the thresholds.*

</details>

<span id="def-3"></span>
<details>
<summary>Definition 3 -- Operating Point: a review's probabilities of adopting a better design and a worse one, and the region they can reach</summary>

**Definition 3** (Operating Point). *A review's operating point is the pair {% katex() %}(A_+, A_-){% end %}: the probability that it adopts a design better than the incumbent, and the probability that it adopts one worse. The achievable region is the set of operating points a review can reach with the levers available to it, the designs under review held fixed. A point dominates another if it has at least the same {% katex() %}A_+{% end %} and at most the same {% katex() %}A_-{% end %}, one of them strictly; the undominated points form the frontier. A lever moves the operating point; the gap {% katex() %}A_+ - A_-{% end %} summarizes how well the review tells the two apart.*

</details>

{{ layer(n=2, type="Fit", id="roc-reading") }}Readers who have tuned a classifier will recognize the frame. {% katex() %}A_+{% end %} is a true-positive rate and {% katex() %}A_-{% end %} a false-positive rate, and the gap is the statistic known as Youden's index. A lever that raises both rates is moving along a curve rather than improving the review. Only the spatial test multiplies: while it fails, {% katex() %}G = 0{% end %} and the operating point sits at the origin whatever the other stages do.

{{ layer(n=3, type="Estimate", id="worse-design-model") }}The model runs a worse design through the same pipeline. Its champion still argues for it, believing it better, and the reviewers' signals now favor the incumbent with the same precision. With the champion silent, the running case adopts a better design in 72% of reviews and a worse one in 20%.

## Correlated Experience: Fifteen Reviewers, Three to Five Opinions

{{ layer(n=1, type="Bound", id="effective-n") }}Start with the first stage, the reviewers as sensors. Suppose each reviewer's judgment is a score, and the errors in those scores have equal variance and pairwise correlation {% katex() %}r{% end %}. An equal-weight average of {% katex() %}n{% end %} scores has the variance of {% katex() %}N_{\text{eff}}{% end %} independent ones:

{% katex(block=true) %}
N_{\text{eff}} = \frac{n}{1 + (n-1)r} \;<\; \frac{1}{r}
{% end %}

where:

- {% katex() %}n{% end %} - the number of reviewers
- {% katex() %}r{% end %} - the correlation of two reviewers' errors in whatever is averaged: the latent {% katex() %}\rho{% end %} for scores, a smaller one for votes

{{ layer(n=3, type="Estimate", id="fifteen-scores") }}The bound on the right is the part that surprises. At a correlation of 0.25, fifteen reviewers' scores carry 3.33 independent opinions, and no number of them carries more than 4. Adding the sixteenth reviewer adds almost nothing, and the variance of the panel's average never falls below a quarter of one reviewer's.

{{ layer(n=1, type="Bound", id="votes-correlate-less") }}A review usually counts votes, and votes correlate less than the scores behind them. Turning a score into a yes or a no adds rounding noise of its own to each vote, and that private noise is what lowers the correlation. In the model of Definition 1, scores correlated at 0.25 give votes correlated at 0.15 when each reviewer errs 30% of the time, so fifteen votes count as 4.84 independent units, at most 6.67. Each of those units carries less information than a score, though: rounding never adds information, so fifteen votes tell the review less than fifteen scores would. Neither count is the error of a majority vote, which is a threshold rather than an average. Proposition 1 gives that.

{{ layer(n=2, type="Fit", id="where-correlation-comes-from") }}Correlation of this size needs no conspiracy. A team that has been paged by the same incidents, trained on the same postmortems and promoted for the same instincts shares a component of judgment. That shared component is what makes the team good at its usual work. It also means that when the team's experience misleads it, it misleads most of them at once. A new design is, by construction, the case the team's experience does not cover.

{{ layer(n=1, type="Bound", id="signal-processing-reading") }}Signal processing has the same statement in its own words. Averaging {% katex() %}n{% end %} sensors raises the signal-to-noise ratio by a factor of {% katex() %}n{% end %} only when their noise is independent. Noise common to every sensor passes through the average untouched. Engineers who would never average fifteen thermometers taped to the same radiator and call the result fifteen measurements do exactly that with fifteen reviewers from the same team.

## The Floor a Majority Cannot Pass

{{ layer(n=2, type="Fit", id="from-average-to-vote") }}A review rarely averages; it votes. The question for a vote is how often the majority is wrong, and the answer has a floor too. It needs one more step than the average does, because a majority is a threshold on the members' errors rather than their sum.

<span id="prop-1"></span>
<details>
<summary>Proposition 1 -- The Majority Floor: a large panel with correlated errors is wrong with a probability that no panel size reduces</summary>

**Proposition 1** (The Majority Floor). *Let each of {% katex() %}n{% end %} members err with probability {% katex() %}p < 1/2{% end %}, with errors correlated through one shared factor of weight {% katex() %}\rho \in (0, 1){% end %} as in Definition 1. As {% katex() %}n \to \infty{% end %}, the probability that a majority of them errs tends to*

{% katex(block=true) %}
P_{\text{floor}}(p, \rho) = \Phi\!\left(\frac{\Phi^{-1}(p)}{\sqrt{\rho}}\right)
{% end %}

*Proof.* Given the shared factor {% katex() %}Z{% end %}, members err independently, each with probability {% katex() %}\pi(Z) = \Phi\big((\Phi^{-1}(p) - \sqrt{\rho}\,Z)/\sqrt{1-\rho}\big){% end %}. By the law of large numbers the share of members who err tends to {% katex() %}\pi(Z){% end %}, so the majority errs in the limit exactly when {% katex() %}\pi(Z) > 1/2{% end %}. That holds when {% katex() %}\Phi^{-1}(p) - \sqrt{\rho}\,Z > 0{% end %}, that is when {% katex() %}Z < \Phi^{-1}(p)/\sqrt{\rho}{% end %}, and {% katex() %}Z{% end %} is standard normal. ∎

</details>

{{ layer(n=1, type="Bound", id="floor-provenance") }}The limit is old. Vasicek derived the same expression for the share of a large loan portfolio that defaults when every loan depends on one economic factor{{ cite(ref="2", title="Vasicek, O. (2002) -- The Distribution of Loan Portfolio Value, Risk 15(12)") }}. Read for a review, the floor is the probability that the shared component points the wrong way strongly enough to carry the majority.

{{ layer(n=3, type="Estimate", id="floor-against-simulation") }}The limit arrives quickly. With reviewers wrong 30% of the time and correlated at 0.25, the floor is 14.7%. Computed exactly, a panel of 15 is wrong 17.9% of the time and one of 201 is wrong 15.0% of the time. A simulation of the same panels agrees within its sampling error. A fifteen-person review is already within about three points of the best any review drawn from that team could do.

{{ layer(n=2, type="Fit", id="sharper-than-interpolation") }}[The Independence Illusion](@/blog/2026-07-08/index.md) corrected Condorcet's jury theorem for correlation with an interpolation it built and labeled as its own: quality falls linearly from the independent value toward a single member's as correlation rises. Proposition 1 is the exact large-panel value under one stated model. The two use different correlations: the interpolation's is a correlation of errors as events, the floor's is on the latent scale. The interpolation covers panels of any size, and the floor says where large ones end.

> **Physical translation.** Fifteen weather stations in one valley all read a cold front late, because the hills block it from all of them in the same way. Adding a sixteenth station in the same valley does not help. What helps is a station on the other side of the hills, even a worse one.

{{ layer(n=2, type="Fit", id="what-the-floor-implies") }}The floor changes what a better review looks like. Hiring better reviewers from the same background lowers each one's error and leaves the shared component in place. Hiring a reviewer from a different background, who errs in different places, lowers the correlation. The floor responds to both, in proportions the formula states exactly. A panel of excellent reviewers who learned from one source can be worse than a panel of good ones who did not.

## Partitioned State: Two Groups, Two Verdicts

{{ layer(n=2, type="Fit", id="first-split-brain") }}Correlation is one way the sensors fail. The other is partition. A large organization rarely reviews in one room. Platform, product and operations groups each form a view in their own meetings, from their own slice of the evidence, and the groups exchange conclusions rather than evidence. Distributed systems engineers know the shape from network partitions, where parts of a cluster that cannot hear each other decide alone. In a cluster the worst outcome is a split brain, two sides acting on conflicting state. In a review the outcome is the other classic failure, a stall: nothing moves until every side agrees.

{{ layer(n=3, type="Estimate", id="partition-divergence") }}Split the fifteen reviewers into groups that decide by their own majority. Two groups reach different verdicts in 22% of reviews, and five groups in 57%. The correlation that sets the floor also holds the groups together somewhat. It cannot hold them together entirely, because each group's private noise is averaged over fewer people. Those numbers treat the whole 0.25 as shared across the organization, which is generous. Part of what makes reviewers err together is their own room: its discussion, its anchor, its frame. That part is drawn separately in each room and pulls rooms apart. With 0.12 of the 0.25 local to each group, two groups diverge in 30% of reviews and five in 66%.

{{ layer(n=2, type="Fit", id="what-divergence-does") }}A divergent verdict is a loss for a new design even when most groups favor it. The incumbent needs no verdict to keep running. A successor needs every group that owns part of its rollout to agree, so divergence acts as a veto held by whichever group happened to see the weaker evidence. That is a liveness failure, not a safety one: no group does anything wrong, and the review simply never reaches the state where the successor ships. The partition needs no hostile group, only groups that decide before they exchange what they saw.

{{ layer(n=3, type="Estimate", id="divergence-in-the-pipeline") }}Fed into the review, the partition decides it. Take three groups of five that decide apart: a pilot team holding the most evidence, its members right 80% of the time, and two groups holding less, right 65% of the time, with 0.12 of the correlation local to each room. A design that any group does not favor stops there, and 54% of reviews of a better design end in the team review, against 22% when the same reviewers meet in one room. The split is cautious rather than wise, since 98% of reviews of a worse design end there too. Concentrating the evidence further, 90% for the pilot team and 60% for the others, raises the better design's losses to 57%: the groups that know least hold the veto.

## Too Many Conversations: Death Without a No

{{ layer(n=2, type="Fit", id="death-without-a-no") }}A design can look good to every group and still die of the conversations around it. Nobody votes against it. Four mechanisms do the work, and each grows with the number of people or groups that must be consulted. Three of them only take: the decision window closes, vetoes multiply, and splitting a design into simple pieces invites everyone's opinion. The fourth, influence between groups, trades: it rescues stalled reviews and spends discrimination to do it.

{{ layer(n=3, type="Estimate", id="the-window-closes") }}The first is time. With {% katex() %}g{% end %} groups consulted there are {% katex() %}g(g-1)/2{% end %} pairs whose conclusions must be reconciled, the coordination term of [One Equation Governs CPU Caches, Human Teams, and AI Agent Systems](@/blog/2026-04-24/index.md). Suppose one decision owner settles them one at a time, each taking a week on average, with the time for each pair drawn independently from an exponential distribution, and the decision has a quarter to land. Four groups decide in time 99% of the time, five 83%, six 32% and seven under 3%. The design is never rejected. The review outlasts the quarter, and the next planning cycle starts from the status quo.

{{ layer(n=3, type="Estimate", id="consensus-cuts-both-ways") }}The second is influence, and in this model it cuts the other way. Let each of the three groups of the previous section vote after hearing the earlier groups' conclusions, carried as a lead of one signal per conclusion. Reviews of a better design that end in the team review fall from 54% to 32%, and to 18% at two signals per conclusion. Hearing each other cures the split brain. The price is discrimination: the worse design is adopted 5% and then 8% of the time, against 2%. A consensus formed early rescues a stalled review and, less often, carries a wrong one.

{{ layer(n=3, type="Estimate", id="vetoes-multiply") }}The third is the veto that comes with being consulted. Give each extra group a veto and priorities somewhere between the status quo and the approvers' centre, since a group pulled in late cares partly about keeping what it has. With one extra group the design passes every approver in 56% of draws, with two in 31%, with four in 10% and with six in 3%. The status quo is trapped among the priorities less often, 2% to 23% at the middle scatter. The design dies first, because each new veto is one more party it must beat.

{{ layer(n=3, type="Estimate", id="the-bikeshed") }}The fourth turns a known paradox into arithmetic. Parkinson noticed that a committee approves a reactor in minutes and argues over a bicycle shed for an hour, because everyone can hold an opinion about the shed{{ cite(ref="3", title="Parkinson, C.N. (1957) -- Parkinson's Law, and Other Studies in Administration, the law of triviality") }}. A complex design is reviewed by the few who understand it. To make it reviewable, teams split it into simple pieces, and each simple piece draws opinions from nearly everyone. Take the fifteen reviewers, a fifth of whom hold an opinion on the whole design, and let that share grow as the pieces shrink. Every pair of opinion holders on a piece must settle their disagreement, a quarter of a week each and one at a time, and each holder accepts a piece nine times in ten. Reviewed whole, the design passes 74% of the time; split in two it passes 35%, and in four almost never. Splitting alone costs far less: if simpler pieces drew no more opinions, four pieces would still pass 30% of the time. Across the growth rates swept, four pieces pass at most 4% of the time. The cliff comes from making the pieces simple enough for everyone to have a view.

{{ layer(n=2, type="Fit", id="count-the-conversations") }}All four deaths happen without a no, and all four grow with one count: the people and groups that hold a view or a veto and must be reconciled.

{{ layer(n=2, type="Fit", id="energy-budget") }}Count the conversations and they become a budget. Call one settlement, one owner reconciling one pair of views, a unit of human energy. A piece held by h people costs h(h-1)/2 of them, so the bill grows with the square of the opinion holders. Agreement is the cheapest state any system can reach, and every mechanism that produces it early ends the bill early. A cascade, a carried conclusion and a champion who speaks first all make the later voices agree for free. Each saves energy by spending discrimination.

{{ layer(n=3, type="Estimate", id="energy-bill") }}For the fifteen reviewers, the expected bill of the design reviewed whole is about 4 settlements. Split into two pieces it is 24, into four 134, into eight 758. At a quarter of a week each, the four-piece review needs 34 owner-weeks of settling for a 13-week window, which is why it almost never decides. The review that splits a design to make it reviewable has made it unaffordable.

## Aggregation in Order: When the Room Stops Listening

{{ layer(n=1, type="Bound", id="cascade-model") }}The second stage combines the signals, and a review combines them in order. Bikhchandani, Hirshleifer and Welch modeled a sequence of people who each see a private signal and the actions of everyone before them{{ cite(ref="4", title="Bikhchandani, S., Hirshleifer, D. and Welch, I. (1992) -- A Theory of Fads, Fashion, Custom, and Cultural Change as Informational Cascades, Journal of Political Economy 100(5)") }}. With binary signals of equal precision, a person whose predecessors' actions lead by two in one direction rationally follows the lead whatever their own signal says. From then on every action repeats the lead. The actions stop carrying private information, and the sequence is in a cascade.

<span id="prop-2"></span>
<details>
<summary>Proposition 2 -- The Wrong Cascade: with binary signals of precision q, a long sequence ends in a cascade on the wrong answer with a probability set by q alone</summary>

**Proposition 2** (The Wrong Cascade). *In the binary model of Bikhchandani, Hirshleifer and Welch, with independent signals of precision {% katex() %}q \in (1/2, 1){% end %} and a member who, when indifferent, follows their own signal (the original paper lets an indifferent member flip a coin, which changes the value slightly), the probability that a long sequence ends in a cascade on the wrong answer is*

{% katex(block=true) %}
P_{\text{wrong}}(q) = \frac{(1-q)^2}{1 - 2q(1-q)}
{% end %}

*Proof.* Actions reveal signals until the lead reaches two. Take the first two members to act from a lead of zero. Both signals are wrong with probability {% katex() %}(1-q)^2{% end %}, which starts a wrong cascade; both right with {% katex() %}q^2{% end %}, which starts a right one; and they differ with probability {% katex() %}2q(1-q){% end %}, which returns the lead to zero and starts the same game again. The wrong cascade's probability is the first outcome's share of the two that end the game: {% katex() %}(1-q)^2/((1-q)^2 + q^2){% end %}, and {% katex() %}(1-q)^2 + q^2 = 1 - 2q(1-q){% end %}. ∎

</details>

{{ layer(n=3, type="Estimate", id="cascade-numbers") }}With signals right 70% of the time, the closed form gives 15.5%, and a simulated run of thirty members ends in a wrong cascade 15.6% of the time. Thirty reviewers who are each right 70% of the time, voting in order, settle on the wrong answer in about one review in six. Most of their thirty judgments are never heard.

{{ layer(n=2, type="Fit", id="cascades-are-rational") }}Nobody in a cascade is behaving badly, but nobody is quite reasoning correctly either. The fifth reviewer who votes with four colleagues against their own reading would be doing what a careful Bayesian does if the colleagues' signals were independent. In the running case they are not: the colleagues share a component of judgment, so four agreeing votes are weaker evidence than four independent ones. The classic rule treats them as independent, and so does the model, which makes it a model of how reviewers usually reason rather than of how they should. A reviewer who allowed for the correlation would discount repeated agreement and need a longer lead before following it. In the model that reviewer is a member with a probing weight, and the next paragraph shows what a later lock-in buys. The failure is still collective. Each action is individually sensible by that reasoning and carries no new information, so the room learns nothing after the first few votes.

{{ layer(n=1, type="Bound", id="people-herd-less") }}People herd less than the model predicts, and the reason helps. Weizsäcker pooled data from many cascade experiments and found that people override their own signal much less often than they should: only when the evidence against it is roughly two to one or stronger{{ cite(ref="5", title="Laboratory tests of observational learning: Weizsäcker (2010), American Economic Review 100(5); March and Ziegelmeyer (2020), Journal of Economic Theory 190") }}. March and Ziegelmeyer ran two sequences side by side, one whose guesses later players could see and one they could not, and found the observed guesses more informative{{ cite(ref="5", title="Laboratory tests of observational learning: Weizsäcker (2010), American Economic Review 100(5); March and Ziegelmeyer (2020), Journal of Economic Theory 190") }}. People who know they are informing someone after them partly vote their own signal to inform them.

{{ layer(n=3, type="Estimate", id="probing-weight") }}The model carries that effect as a weight: a member adds a fixed amount of log-odds to the value of revealing their own signal. A lead of two outweighs a contrary signal by one signal's log-odds, about 0.85 at a precision of 0.7, so a weight of 0.5 changes nothing. A weight of 1.0 covers the gap, so lock-in waits for a lead of three, and wrong cascades fall from 15.6% to 7.0% in a run of thirty; the long-run value with that barrier is 7.3%. The weight is the same for every member, a simplification, since the last reviewer has nobody left to inform. The willingness to inform those after you is worth more than any single reviewer's accuracy.

## The Career Plane: Who Speaks Against the Room

{{ layer(n=2, type="Fit", id="voice-is-a-choice") }}A cascade assumes everyone votes. In a review many reviewers say nothing, and the choice to speak against the room is not random. It depends on what speaking costs the speaker, and that cost has a structure economists have mapped for three decades. Dissent buys some share of a correct verdict. It costs the immediate discomfort of disagreeing. And it moves the speaker's reputation, in a direction that depends on who they are.

{{ layer(n=1, type="Bound", id="conformity-measured") }}The immediate cost is measured. Franzen and Mader repeated Asch's line-length experiment with five confederates and found "an error rate of 33% for the standard length-of-line experiment"; with money paid for correct answers, "the error rate decreases to 25%"{{ cite(ref="6", title="Franzen, A. and Mader, S. (2023) -- The Power of Social Influence: A Replication and Extension of the Asch Experiment, PLOS ONE 18(11)") }}. Incentives to be right lowered the effect and did not remove it.

{{ layer(n=1, type="Bound", id="reputation-sign") }}The reputation term has a sign that depends on self-certainty. Avery and Chevalier showed that a forecaster unsure of their own ability herds, because deviating and being wrong marks them as poor{{ cite(ref="7", title="Avery, C.N. and Chevalier, J.A. (1999) -- Herding over the Career, Economics Letters 63(3)") }}. One who has learned they are able deviates to show it. A second effect works through the record. Prendergast and Stole showed that a manager who has committed to a course becomes reluctant to change it, because changing it admits that the first judgment was wrong{{ cite(ref="8", title="Prendergast, C. and Stole, L. (1996) -- Impetuous Youngsters and Jaded Old-Timers: Acquiring a Reputation for Learning, Journal of Political Economy 104(6)") }}.

{{ layer(n=1, type="Bound", id="escalation-measured") }}The endorsement effect is also measured. Sleesman and three coauthors pooled studies of escalation of commitment. Personal responsibility for the original decision raised escalation with a corrected correlation of 0.26, over 54 samples and 8,625 people{{ cite(ref="9", title="Sleesman, D.J. and three coauthors (2012) -- Cleaning Up the Big Muddy: A Meta-Analytic Review of the Determinants of Escalation of Commitment, Academy of Management Journal 55(3)") }}. The person who once approved the incumbent is the person for whom praising its successor costs most.

{{ layer(n=2, type="Fit", id="voice-margin") }}The model combines the three effects into a voice margin, the payoff of voicing a dissent minus the payoff of silence:

{% katex(block=true) %}
M = v - \gamma + \delta \big[(2\kappa - 1) - s\,w\,e\big]
{% end %}

where:

- {% katex() %}v{% end %} - the value of a correct verdict that one voice buys, 0.25 in the running case
- {% katex() %}\gamma{% end %} and {% katex() %}\delta{% end %} - immediate conformity and the horizon
- {% katex() %}\kappa{% end %} - ability self-certainty, so {% katex() %}2\kappa - 1{% end %} runs from -1 for a reviewer sure they judge poorly to +1 for one sure they judge well
- {% katex() %}w{% end %} and {% katex() %}e{% end %} - the weight of the endorsement, 1.5 in the running case, and whether the reviewer endorsed the incumbent
- {% katex() %}s{% end %} - the direction of the dissent: +1 when it favors the successor and admits an earlier error, -1 when it defends the incumbent and keeps the record consistent

{{ layer(n=2, type="Fit", id="voice-margin-is-fit") }}The form is a Fit, not a derivation. It encodes the signs the cited models fix and the order of the effects, and both constants are swept. A reviewer speaks against the room when {% katex() %}M > 0{% end %}. The conclusions below are the ones that keep their sign across the swept range.

{{ layer(n=3, type="Estimate", id="career-corners") }}Take a senior reviewer with a long horizon, 0.9, and little conformity cost, 0.15, and sure of their judgment, at a self-certainty of 0.9. They gain 0.82 by dissenting in the successor's favor. Having endorsed the incumbent, the same reviewer loses 0.53 by it, and at endorsement weights of 1.5 and above that loss holds at every swept value of a correct verdict. A junior reviewer with a shorter horizon, 0.7, and a larger conformity cost, 0.6, speaks only above a self-certainty of 0.75. Of the plane's four corners, only the reviewer sure of their judgment and free of the incumbent speaks for the successor.

{{ layer(n=3, type="Estimate", id="endorsement-direction") }}The endorsement term has a direction. Dissent in the incumbent's defence keeps the record consistent, so the endorsed senior who loses 0.53 by speaking up for the successor gains 2.17 by speaking up against it. Sunk endorsement is a bias toward the status quo in both directions. It silences support for a successor and amplifies defence of the incumbent, which helps when the successor is worse and hurts when it is better.

{{ layer(n=2, type="Fit", id="anonymity-targets") }}This is where anonymity earns its place. An anonymous channel removes the reputation term for everyone, and it removes most for the reviewers whose term is most negative. The prediction is specific: dissent in a successor's favor should rise most among senior reviewers who endorsed the incumbent, and least among those who never did.

## The Hand-off: Layers That Drop the Signal

{{ layer(n=2, type="Fit", id="handoff-model") }}The third stage carries the verdict to the people who decide. A review's conclusion rarely reaches the gates in the reviewers' words. It is summarized by a lead, summarized again by a manager and presented by a director, and each summary rounds off what its author was less sure of. The model gives each hand-off a candor {% katex() %}a{% end %}: the share of the signal's amplitude it keeps.

{{ layer(n=1, type="Bound", id="handoff-information") }}A hand-off that only scales the verdict loses nothing by itself: anyone who knew the scale could undo it. The loss appears where the scaled verdict meets the gates, whose own judgment adds noise of fixed size and whose threshold does not scale with the summary. Against that downstream noise, a signal of amplitude {% katex() %}A{% end %} has a signal-to-noise ratio, and a Fisher information, proportional to {% katex() %}A^2{% end %}, so {% katex() %}d{% end %} hand-offs that each keep {% katex() %}a{% end %} of the amplitude keep {% katex() %}a^{2d}{% end %} of it. Shannon information falls more slowly when the signal is strong, because it grows only with the logarithm of that ratio; {% katex() %}a^{2d}{% end %} is its weak-signal limit, which is where an ambiguous design sits. Three layers at a candor of 0.85 keep about 38% of the signal-to-noise ratio at the gates.

{{ layer(n=3, type="Estimate", id="candor-sweep") }}Candor acts on both kinds of design. Each hand-off shrinks the verdict while the gates' noise and threshold stay where they are, so lost candor lowers adoption of a better design and of a worse one alike. At a candor of 0.75 the running case adopts a better design in 54% of reviews and a worse one in 14%; at 0.95, in 76% and 21%. In this model a lossy chain makes the review more cautious rather than more confused. A chain whose summaries also added noise of their own would blur the two designs together, and the model does not include that.

## The Actuator: Veto Gates and the Status Quo

{{ layer(n=1, type="Bound", id="veto-players") }}The fourth stage acts. In most engineering organizations a design needs more than a favorable verdict: it needs every gate that can block it to let it through. The running case's four approvers are its gates. Tsebelis called the actors whose agreement a change requires veto players, and their set of acceptable changes the win-set of the status quo{{ cite(ref="10", title="Tsebelis, G. (2002) -- Veto Players: How Political Institutions Work, Princeton University Press") }}. With preferences that fall off with distance from an ideal point, the win-set has a simple geometry.

{{ layer(n=2, type="Fit", id="plane-of-concerns") }}For a design review the plane is a plane of concerns. One axis can be read as how much the design changes the system's behavior, the other as how much operational risk it moves. Each gate has an ideal point in that plane: the architecture board might want more change than security does, and the engineering manager less risk to the delivery plan than product. The status quo is a point too. A gate accepts a change only if it lands strictly closer to the gate's ideal point than the status quo does.

<span id="prop-3"></span>
<details>
<summary>Proposition 3 -- The Veto Cliff: if the status quo lies in the convex hull of the gates' ideal points, no change is preferred by every gate, and a new gate inside the hull changes nothing</summary>

**Proposition 3** (The Veto Cliff). *Let {% katex() %}V{% end %} gates have ideal points {% katex() %}z_1, \dots, z_V{% end %} in the plane, each preferring points strictly closer to its ideal in Euclidean distance. Some change {% katex() %}x \ne s{% end %} is strictly preferred to the status quo {% katex() %}s{% end %} by every gate if and only if {% katex() %}s{% end %} lies outside the convex hull of the ideal points. A gate added with its ideal point inside the hull leaves this unchanged.*

*Proof.* Suppose {% katex() %}s = \sum_i w_i z_i{% end %} with weights {% katex() %}w_i \ge 0{% end %} summing to one, and take any {% katex() %}x = s + u{% end %} with {% katex() %}u \ne 0{% end %}. Then {% katex() %}\sum_i w_i\, u \cdot (z_i - s) = u \cdot (s - s) = 0{% end %}, so some gate {% katex() %}i{% end %} with {% katex() %}w_i > 0{% end %} has {% katex() %}u \cdot (z_i - s) \le 0{% end %}. For that gate {% katex() %}|x - z_i|^2 = |s - z_i|^2 + |u|^2 - 2\,u \cdot (z_i - s) > |s - z_i|^2{% end %}, so it strictly prefers the status quo. If {% katex() %}s{% end %} lies outside the hull, a line separates it from every ideal point; a small step from {% katex() %}s{% end %} toward the hull, along that line's normal, brings every ideal point strictly closer. A gate whose ideal point lies in the hull does not change the hull. ∎

</details>

{{ layer(n=1, type="Bound", id="beyond-euclid") }}The proof uses circular indifference curves: a gate cares about distance from its ideal point equally in every direction. A gate that weighs its concerns unequally, caring more about risk than about change, has elliptical ones. For such gates the positions no change can improve for all of them form their Pareto set, a curved region that can differ from the hull of the ideal points. The cliff survives in that form: a status quo in the gates' Pareto set blocks every change. Nor does the proof need two dimensions. The weighted sum runs over vectors of any length, so the cliff holds with latency, cost or compliance as further axes. It does not cover a gate with a hard floor, such as a compliance rule that rejects anything past a line whatever else improves. Nor does it cover gates that trade across issues, conceding on one design to win on another, or a review that can escalate past a gate; both can open a win-set the geometry closes. Such a gate is a constraint on the plane rather than a point in it.

{{ layer(n=1, type="Bound", id="one-compromise") }}A single compromise can close the door behind it. A change that passes lies in the win-set: it is closer to every gate's ideal point than the status quo was. Once adopted it becomes the new status quo, and each gate's circle around it sits inside that gate's circle around the old one, so the next win-set is smaller. Tsebelis models who shapes the change as an agenda setter{{ cite(ref="10", title="Tsebelis, G. (2002) -- Veto Players: How Political Institutions Work, Princeton University Press") }}. One gate proposes the point of the win-set it likes best, and the others accept because it beats the status quo for each of them. No change can beat that proposal for every gate, because such a change would also have been in the win-set and closer to the setter. So the proposal lies in the hull, and from then on the win-set is empty: unanimous consent stalls until the priorities or the set of gates change. In the running case, from the status quo at (1.0, 0.0), each of the four gates would propose a point in the hull. The design was in the win-set the setter chose from, so the gate that proposed the compromise now vetoes the design.
{{ layer(n=3, type="Estimate", id="cliff-in-the-case") }}The running case's four gates have ideal points at (2.0, 0.5), (1.5, -0.5), (2.5, -0.2) and (2.2, 0.8), around the point (2.0, 0.2). With the status quo away from them, there are changes every gate would take, and the design is one of them. With the status quo at (2.0, 0.2), inside their hull, there are none, and a fifth gate placed inside the hull changes nothing. Removing a gate can open the cliff, but only the right one. Removing the engineering manager or security puts the status quo outside the remaining triangle and reopens a small win-set; removing the architecture board or product leaves it inside. Even a reopened win-set admits only designs that lie in it, which the original design does not.

{{ layer(n=3, type="Estimate", id="cliff-zero") }}This is the opening review. With the status quo inside the hull, the model adopts a better design in none of 20,000 reviews. It still adopts none under every combination of the six levers. Three of the four gates, the architecture board, security and product, are closer to the status quo than to the design, so removing any one gate still leaves two that veto it. Pilots, polls, champions, panels and flatter chains all act on the evidence, and the spatial test never reads it. The reviewers in the opening were right about the design, and the stage that decided never read what they said.

> **Physical translation.** Four people stand around a table and must agree to move it. Each wants it nearer to their own spot. If the table already sits in the middle of them, every direction moves it away from somebody, and that person says no. A better argument for any direction changes none of their positions.

{{ layer(n=2, type="Fit", id="when-the-status-quo-is-inside") }}A status quo inside the hull is what a mature system looks like. Every past change had to pass the same gates, and a single compromise among them is enough to land there. The better an organization has been at satisfying all its stakeholders, the more likely its current design sits where none of them can agree to move it.

## The Switching Band: Why a Small Advantage Waits

{{ layer(n=1, type="Bound", id="dixit-band") }}A gate that would accept a change still has to judge whether the advantage is worth the switch. Switching has a sunk cost in both directions: migrating to the new design and, if it disappoints, migrating back. Dixit studied a firm facing a sunk cost of entry and exit and a value that moves randomly{{ cite(ref="11", title="Dixit, A. (1989) -- Entry and Exit Decisions under Uncertainty, Journal of Political Economy 97(3)") }}. It enters only above one threshold, exits only below a lower one, and stays where it is between them. The gap between the thresholds is a band of inaction, and it is rational.

{{ layer(n=1, type="Bound", id="extends-the-trigger") }}This extends the trigger of [The Trigger to Stop Simulating](@/blog/2026-09-27/index.md#prop-5), whose Proposition 5 gave the threshold at which a one-time investment in continuous probing is worth making. That threshold had one side. A review deciding between two designs it can move between has two: one for adopting the successor and one for abandoning it. The distance between them is the band an argument has to cross.

{{ layer(n=3, type="Estimate", id="band-numbers") }}The model lets the successor's advantage take a random step of fixed spread each review period, discounts each later period by 0.95, and charges the sunk cost at every switch. It solves for both thresholds by value iteration: each is the advantage at which switching and staying have equal discounted value. Without loss aversion and at a switching cost of 0.2, a review adopts once the advantage passes 0.17 per period and abandons once it falls below -0.17. A flow of only 0.01 per period, counted from the period of the switch and discounted at 0.95, would repay the cost, so the threshold is about seventeen times that. The premium here is the price of reversal. The advantage moves by a full step of 1.0 each period, five times the cost. An organization that switches on a small lead expects the lead to swing back and the cost to come due again. The threshold is about 0.87 of the cost and barely depends on the step: a quarter more or less step moves it by about 3%. That is why the band's width grows almost in proportion to the cost, with a fitted exponent of 0.97 at this step and 0.94 when reviews come four times as often. A review that looks often, relative to how fast the advantage moves, sits in a different regime. At a step of 0.1 the threshold falls to nine times the flow that repays the cost, and at 0.03 to five times. The exponent falls with the step too. Fitted over costs from 0.1 to 0.4, it is 0.87 at a step of 1.0, 0.57 at 0.1 and 0.51 at 0.03. Waiting to see where the advantage goes takes over from the price of reversal. What holds at every cadence is that a larger sunk cost widens the band.

{{ layer(n=3, type="Estimate", id="loss-aversion-band") }}Loss aversion can enter the band in two places, and where it enters decides which edge moves. Tversky and Kahneman estimated that a loss weighs about 2.25 times as much as an equal gain{{ cite(ref="12", title="Tversky, A. and Kahneman, D. (1992) -- Advances in Prospect Theory: Cumulative Representation of Uncertainty, Journal of Risk and Uncertainty 5(4)") }}. In the first placement, a period in which the new design does worse than the old one counts 2.25 times. The adoption threshold barely moves, to 0.18, while the abandonment threshold moves from -0.17 to -0.08. An adopted design becomes fragile: the first stretch in which it trails the old one by a little is enough to reverse it.

{{ layer(n=1, type="Bound", id="status-quo-bias") }}The second placement is the one studies of status-quo bias describe. Samuelson and Zeckhauser found that people choose the option framed as the status quo far more often than its merits predict{{ cite(ref="13", title="Samuelson, W. and Zeckhauser, R. (1988) -- Status Quo Bias in Decision Making, Journal of Risk and Uncertainty 1(1)") }}.

{{ layer(n=3, type="Estimate", id="switch-placement") }}Weighting the cost of leaving the status quo by 2.25 moves the adoption threshold instead, from 0.17 to 0.27, and widens the band by half. Both placements are defensible. The first makes adopted designs fragile, the second makes them late, and a review that holds both is both. The running case uses the first, where loss aversion barely changes whether the review adopts and shows up afterward, in how fast the decision reverses.

{{ layer(n=2, type="Fit", id="pilot-first-bad-quarter") }}That is the approval shape of [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) seen from the other side. A standing change has no scheduled end, so every bad quarter is a loss against a reference point the organization never returns to. A design that survives its review can still be rolled back by its first bad quarter, at an advantage the same organization would not have adopted it at.

## Composition: One Early Silence

{{ layer(n=2, type="Fit", id="why-compose") }}Each stage above can be studied alone, and each has been. The claim of this post is that they compose, and composition is something a list of forces cannot show. The test is an interaction: whether the cost of one force depends on another being present. If the stages merely added, the cost of a silent champion would be the same with or without sequential voting.

{{ layer(n=3, type="Estimate", id="silence-and-cascade") }}It is not. In a blind simultaneous poll, the champion's silence costs about 3 points of adoption; with sequential voting, the same silence costs about 13. Across nine settings of precision and correlation the interaction is positive every time, from 3 to 15 points, and largest when the signals are weakest.

{{ layer(n=2, type="Fit", id="why-interaction") }}The mechanism is the order. In a blind poll, the champion is one vote of fifteen. In a sequence, the champion's vote is the first of the votes that decide whether a cascade starts, and a cascade, once started, silences everyone after it. One early silence becomes many later ones. The effect is largest when the evidence is ambiguous, which is exactly when a successor design is under review.

{{ layer(n=3, type="Estimate", id="poll-and-champion") }}The same interaction runs the other way, and it decides how the two aggregation levers should be used. Alone, a blind poll narrows the gap between adopting better and worse designs, from 0.52 to 0.40, by making the review cautious. The caution comes from what the gates read. They take the tally at face value, the net share of endorsements, and do not ask how it was produced. A sequence inflates the tally, because once a cascade starts every later member adds an endorsement that carries no new evidence: its average net share is 0.53 against the blind poll's 0.40. Against the same threshold, the honest tally clears less often, for a better design and a worse one alike. Alone, letting the champion speak first narrows it too, to 0.46, because a worse design's champion argues for it just as sincerely and now speaks first into a sequence. Together they narrow it 0.08 less than the two effects added would. With the poll in place, letting the champion speak first widens the gap by 0.02 instead of narrowing it by 0.06. The poll makes the champion's voice one vote among fifteen, and the champion restores some of what the poll's caution cost.

## Where Designs Die

{{ layer(n=3, type="Estimate", id="life-of-a-design") }}Composition also decides where a design dies. Each review of the design ends in one of four places. It dies in the team review when the verdict does not favor it, or when any group deciding apart does not. It dies in the hand-off when the unweakened verdict would have cleared every approver and the relayed one does not. It dies at the approvals when an approver vetoes it or the evidence falls short even unweakened, and otherwise it is adopted. In every setting of the figure below, members inside a room vote in order, as the running case does; the blind poll appears only among the levers of the region. Follow reviews of the running case's better design through the stages, and most deaths happen early: 22% end in the team review, 5% in the managers' hand-off and under 1% at the approvals. The approvers matter when the status quo sits among their priorities, and then they take everything the review lets through.

<div style="margin:1.5em 0;">
<canvas id="chart-lifecycle" role="img" aria-label="Where reviews of a better and a worse design end, in four settings. Groups decide apart, better design: stopped in the team review 54%, lost in the hand-off 5%, stopped at the approvals 1%, adopted 40%. Groups decide apart, worse design: stopped in the team review 98%, lost in the hand-off 0%, stopped at the approvals 0%, adopted 2%. One room, better design: stopped in the team review 22%, lost in the hand-off 5%, stopped at the approvals 1%, adopted 72%. One room, worse design: stopped in the team review 78%, lost in the hand-off 2%, stopped at the approvals 0%, adopted 19%. One room, champion first, better design: stopped in the team review 11%, lost in the hand-off 4%, stopped at the approvals 1%, adopted 84%. One room, champion first, worse design: stopped in the team review 59%, lost in the hand-off 3%, stopped at the approvals 0%, adopted 38%. Status quo among priorities, better design: stopped in the team review 11%, lost in the hand-off 0%, stopped at the approvals 89%, adopted 0%. Status quo among priorities, worse design: stopped in the team review 59%, lost in the hand-off 0%, stopped at the approvals 41%, adopted 0%." style="width:100%;height:334px;display:block;"></canvas>
<figcaption>Where designs die. Each bar is all the reviews of one design: grey is where the team review stopped it, orange the managers' hand-off, purple the approvals, and the end of the bar is adoption. Most failures end in the team review, not at the approvals: with groups deciding apart, 54% of reviews of a better design stop there. The approvals stop a design only when the status quo sits among their priorities, and then they stop every one, better or worse.</figcaption>
<script>
(function(){var S={"id":"chart-lifecycle","h":334,"ml":[84,96],"mr":[14,18],"mt":8,"mb":36,"els":[{"t":"txt","x":0.0,"y":11.55,"s":"Groups decide apart","al":"left","bl":"middle","c":"ink","b":true},{"t":"rect","x0":0.0,"x1":0.5378,"y0":10.14,"y1":10.86,"c":"g","al":0.55},{"t":"txt","x":0.2689,"y":10.5,"s":"54%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.5378,"x1":0.5913999999999999,"y0":10.14,"y1":10.86,"c":"d","al":0.55},{"t":"rect","x0":0.5913999999999999,"x1":0.5967999999999999,"y0":10.14,"y1":10.86,"c":"e","al":0.55},{"t":"rect","x0":0.5967999999999999,"x1":0.9999999999999999,"y0":10.14,"y1":10.86,"c":"b","al":0.85},{"t":"txt","x":0.7983999999999999,"y":10.5,"s":"40%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.0,"x1":0.9784,"y0":9.14,"y1":9.86,"c":"g","al":0.55},{"t":"txt","x":0.4892,"y":9.5,"s":"98%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.9784,"x1":0.9814,"y0":9.14,"y1":9.86,"c":"d","al":0.55},{"t":"rect","x0":0.9814,"x1":0.9820000000000001,"y0":9.14,"y1":9.86,"c":"e","al":0.55},{"t":"rect","x0":0.9820000000000001,"x1":1.0,"y0":9.14,"y1":9.86,"c":"a","al":0.85},{"t":"txt","x":0.0,"y":8.55,"s":"One room","al":"left","bl":"middle","c":"ink","b":true},{"t":"rect","x0":0.0,"x1":0.2217,"y0":7.14,"y1":7.86,"c":"g","al":0.55},{"t":"txt","x":0.11085,"y":7.5,"s":"22%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.2217,"x1":0.273,"y0":7.14,"y1":7.86,"c":"d","al":0.55},{"t":"rect","x0":0.273,"x1":0.2803,"y0":7.14,"y1":7.86,"c":"e","al":0.55},{"t":"rect","x0":0.2803,"x1":1.0001,"y0":7.14,"y1":7.86,"c":"b","al":0.85},{"t":"txt","x":0.6402,"y":7.5,"s":"72%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.0,"x1":0.7813,"y0":6.14,"y1":6.86,"c":"g","al":0.55},{"t":"txt","x":0.39065,"y":6.5,"s":"78%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.7813,"x1":0.8007,"y0":6.14,"y1":6.86,"c":"d","al":0.55},{"t":"rect","x0":0.8007,"x1":0.8054,"y0":6.14,"y1":6.86,"c":"e","al":0.55},{"t":"rect","x0":0.8054,"x1":1.0,"y0":6.14,"y1":6.86,"c":"a","al":0.85},{"t":"txt","x":0.9027000000000001,"y":6.5,"s":"19%","al":"center","bl":"middle","c":"ink"},{"t":"txt","x":0.0,"y":5.55,"s":"One room, champion first","al":"left","bl":"middle","c":"ink","b":true},{"t":"rect","x0":0.0,"x1":0.1061,"y0":4.14,"y1":4.86,"c":"g","al":0.55},{"t":"txt","x":0.05305,"y":4.5,"s":"11%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.1061,"x1":0.1508,"y0":4.14,"y1":4.86,"c":"d","al":0.55},{"t":"rect","x0":0.1508,"x1":0.158,"y0":4.14,"y1":4.86,"c":"e","al":0.55},{"t":"rect","x0":0.158,"x1":1.0,"y0":4.14,"y1":4.86,"c":"b","al":0.85},{"t":"txt","x":0.579,"y":4.5,"s":"84%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.0,"x1":0.5867,"y0":3.14,"y1":3.86,"c":"g","al":0.55},{"t":"txt","x":0.29335,"y":3.5,"s":"59%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.5867,"x1":0.6118,"y0":3.14,"y1":3.86,"c":"d","al":0.55},{"t":"rect","x0":0.6118,"x1":0.6167,"y0":3.14,"y1":3.86,"c":"e","al":0.55},{"t":"rect","x0":0.6167,"x1":1.0,"y0":3.14,"y1":3.86,"c":"a","al":0.85},{"t":"txt","x":0.80835,"y":3.5,"s":"38%","al":"center","bl":"middle","c":"ink"},{"t":"txt","x":0.0,"y":2.55,"s":"Status quo among priorities","al":"left","bl":"middle","c":"ink","b":true},{"t":"rect","x0":0.0,"x1":0.1061,"y0":1.1400000000000001,"y1":1.8599999999999999,"c":"g","al":0.55},{"t":"txt","x":0.05305,"y":1.5,"s":"11%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.1061,"x1":1.0,"y0":1.1400000000000001,"y1":1.8599999999999999,"c":"e","al":0.55},{"t":"txt","x":0.55305,"y":1.5,"s":"89%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.0,"x1":0.5867,"y0":0.14,"y1":0.86,"c":"g","al":0.55},{"t":"txt","x":0.29335,"y":0.5,"s":"59%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.5867,"x1":1.0,"y0":0.14,"y1":0.86,"c":"e","al":0.55},{"t":"txt","x":0.79335,"y":0.5,"s":"41%","al":"center","bl":"middle","c":"ink"},{"t":"rect","x0":0.0,"x1":0.025,"y0":12.55,"y1":12.95,"c":"g","al":0.55},{"t":"txt","x":0.03,"y":12.75,"s":"stopped in the team review","n":"review","al":"left","bl":"middle","c":"sub"},{"t":"rect","x0":0.25,"x1":0.275,"y0":12.55,"y1":12.95,"c":"d","al":0.55},{"t":"txt","x":0.28,"y":12.75,"s":"lost in the hand-off","n":"hand-off","al":"left","bl":"middle","c":"sub"},{"t":"rect","x0":0.49,"x1":0.515,"y0":12.55,"y1":12.95,"c":"e","al":0.55},{"t":"txt","x":0.52,"y":12.75,"s":"stopped at the approvals","n":"approvals","al":"left","bl":"middle","c":"sub"},{"t":"rect","x0":0.72,"x1":0.745,"y0":12.55,"y1":12.95,"c":"b","al":0.85},{"t":"txt","x":0.75,"y":12.75,"s":"adopted (red: worse)","n":"adopted","al":"left","bl":"middle","c":"sub"}],"X":{"lo":0.0,"hi":1.0,"ticks":[[0.0,"0%"],[0.25,"25%"],[0.5,"50%"],[0.75,"75%"],[1.0,"100%"]],"title":"share of reviews","ntitle":"share"},"Y":{"lo":0.0,"hi":13.2,"ticks":[[10.5,"better design"],[9.5,"worse design"],[7.5,"better design"],[6.5,"worse design"],[4.5,"better design"],[3.5,"worse design"],[1.5,"better design"],[0.5,"worse design"]],"title":""}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
function draw(){var W=cv.clientWidth,H=S.h;var dpr=window.devicePixelRatio||1;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);ctx.setTransform(cv.width/W,0,0,cv.height/H,0,0);ctx.clearRect(0,0,W,H);
var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
var P=dark?{ink:'#ddd',sub:'#aaa',grid:'#444',a:'#ef9a9a',b:'#8ab4f8',c:'#81c784',d:'#ffcc80',e:'#ce93d8',g:'#bbb'}:{ink:'#333',sub:'#555',grid:'#d6d6d6',a:'#b71c1c',b:'#1565c0',c:'#2e7d32',d:'#e65100',e:'#6a1b9a',g:'#777'};
if(dark){ctx.fillStyle='#1e1e1e';ctx.fillRect(0,0,W,H);}
var nar=W<560,fs=nar?9:11,L=nar?S.ml[0]:S.ml[1],R=nar?S.mr[0]:S.mr[1],T=S.mt,B=S.mb,pw=W-L-R,ph=H-T-B;
function sc(a,v){return a.log?(Math.log(v)-Math.log(a.lo))/(Math.log(a.hi)-Math.log(a.lo)):(v-a.lo)/(a.hi-a.lo);}
function X(v){return L+pw*sc(S.X,v);}function Y(v,k){return T+ph*(1-sc(k==='R'?S.R:S.Y,v));}
function tx(s,x,y,al,bl,col,bold){ctx.font=(bold?'bold ':'')+fs+'px sans-serif';ctx.textAlign=al||'left';ctx.textBaseline=bl||'middle';ctx.fillStyle=P[col]||P.ink;ctx.fillText(s,Math.round(x),Math.round(y));}
ctx.lineWidth=1;S.Y.ticks.forEach(function(t){var y=Math.round(Y(t[0],'L'))+0.5;ctx.strokeStyle=P.grid;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(L+pw,y);ctx.stroke();tx(t[1],L-5,y,'right','middle',S.Y.col||'sub');});
if(S.R){S.R.ticks.forEach(function(t){tx(t[1],L+pw+5,Y(t[0],'R'),'left','middle',S.R.col||'sub');});}
var xt=nar&&S.X.nticks?S.X.nticks:S.X.ticks;xt.forEach(function(t,i){var al=(sc(S.X,t[0])<0.01)?'left':(sc(S.X,t[0])>0.99?'right':'center');tx(t[1],X(t[0]),T+ph+6,al,'top','sub');});
ctx.strokeStyle=P.sub;ctx.beginPath();ctx.moveTo(L,T+ph+0.5);ctx.lineTo(L+pw,T+ph+0.5);ctx.stroke();
tx(nar&&S.Y.ntitle?S.Y.ntitle:S.Y.title,L,4,'left','top',S.Y.col||'ink');if(S.R){tx(nar&&S.R.ntitle?S.R.ntitle:S.R.title,L+pw,4,'right','top',S.R.col||'ink');}
tx(nar&&S.X.ntitle?S.X.ntitle:S.X.title,L+pw,H-2,'right','bottom','ink');
S.els.forEach(function(e){var k=e.ax||'L',c=P[e.c]||P.ink;ctx.setLineDash(e.dash?[5,4]:[]);ctx.globalAlpha=1;
if(e.t==='hband'){ctx.globalAlpha=('al' in e)?e.al:0.12;ctx.fillStyle=c;var y0=Y(e.y0,k),y1=Y(e.y1,k);ctx.fillRect(L,Math.min(y0,y1),pw,Math.abs(y1-y0));}
else if(e.t==='rect'){ctx.globalAlpha=('al' in e)?e.al:1;ctx.fillStyle=c;var rx0=X(e.x0),rx1=X(e.x1),ry0=Y(e.y0,k),ry1=Y(e.y1,k);ctx.fillRect(Math.min(rx0,rx1),Math.min(ry0,ry1),Math.abs(rx1-rx0),Math.abs(ry1-ry0));}
else if(e.t==='vline'){ctx.strokeStyle=c;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(Math.round(X(e.x))+0.5,T);ctx.lineTo(Math.round(X(e.x))+0.5,T+ph);ctx.stroke();}
else if(e.t==='hline'){ctx.strokeStyle=c;ctx.lineWidth=e.w||1;ctx.beginPath();ctx.moveTo(L,Math.round(Y(e.y,k))+0.5);ctx.lineTo(L+pw,Math.round(Y(e.y,k))+0.5);ctx.stroke();}
else if(e.t==='band'){ctx.globalAlpha=('al' in e)?e.al:0.18;ctx.fillStyle=c;ctx.beginPath();e.pts.forEach(function(p,i){i?ctx.lineTo(X(p[0]),Y(p[2],k)):ctx.moveTo(X(p[0]),Y(p[2],k));});for(var i=e.pts.length-1;i>=0;i--){ctx.lineTo(X(e.pts[i][0]),Y(e.pts[i][1],k));}ctx.closePath();ctx.fill();if(e.edge){ctx.globalAlpha=1;ctx.strokeStyle=c;ctx.lineWidth=1;[1,2].forEach(function(j){ctx.beginPath();e.pts.forEach(function(p,i){i?ctx.lineTo(X(p[0]),Y(p[j],k)):ctx.moveTo(X(p[0]),Y(p[j],k));});ctx.stroke();});}}
else if(e.t==='line'){ctx.strokeStyle=c;ctx.lineWidth=e.w||2;ctx.beginPath();e.pts.forEach(function(p,i){i?ctx.lineTo(X(p[0]),Y(p[1],k)):ctx.moveTo(X(p[0]),Y(p[1],k));});ctx.stroke();ctx.setLineDash([]);if(e.mk){e.pts.forEach(function(p){ctx.beginPath();ctx.arc(X(p[0]),Y(p[1],k),e.mk,0,6.2832);if(e.open){ctx.fillStyle=dark?'#1e1e1e':'#fff';ctx.fill();ctx.lineWidth=1.5;ctx.stroke();}else{ctx.fillStyle=c;ctx.fill();}});}}
else if(e.t==='pt'){ctx.setLineDash([]);ctx.beginPath();ctx.arc(X(e.x),Y(e.y,k),e.r||4,0,6.2832);if(e.open){ctx.strokeStyle=c;ctx.lineWidth=1.8;ctx.stroke();}else{ctx.fillStyle=c;ctx.fill();}}
else if(e.t==='txt'){var s=nar&&('n' in e)?e.n:e.s;if(s){tx(s,X(e.x)+(e.dx||0),Y(e.y,k)+(e.dy||0),e.al,e.bl,e.c,e.b);}}
ctx.setLineDash([]);ctx.globalAlpha=1;});}
draw();window.addEventListener('resize',draw);var mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');if(mq&&mq.addEventListener){mq.addEventListener('change',draw);}
})();
</script>
</div>

## Write-Back: What the Organization Learns from Its Reasons

{{ layer(n=2, type="Fit", id="write-back-loop") }}A review ends, and the organization records why. The record is the input to the next review: the next design is judged partly by what the organization believes made the last one fail or succeed. That loop closes the pipeline on itself, and it brings in a second split brain, this time in the neurological sense.

{{ layer(n=1, type="Bound", id="interpreter") }}Gazzaniga studied patients whose two hemispheres had been surgically separated. When the right hemisphere was shown an instruction, the patient acted on it. The left hemisphere had not seen the instruction, yet it readily supplied a reason for the action, and the reason was invented{{ cite(ref="14", title="Gazzaniga, M.S. (1998) -- The Split Brain Revisited, Scientific American 279(1)") }}. He called the part of the brain that does this the interpreter. It produces fluent explanations with no access to what caused the behavior.

{{ layer(n=1, type="Bound", id="choice-blindness") }}People without split brains do the same. Johansson and three coauthors asked people to choose the more attractive of two faces, then secretly handed them the other one and asked why they had chosen it. Most swaps went unnoticed, and people gave reasons for the choice they had not made{{ cite(ref="15", title="Johansson, P. and three coauthors (2005) -- Failure to Detect Mismatches Between Intention and Outcome in a Simple Decision Task, Science 310") }}. A postmortem is written by the same kind of mind, after the fact, about a decision whose causes it could not observe.

{{ layer(n=2, type="Fit", id="writeback-model") }}The model writes each recorded reason as a mixture. With weight {% katex() %}\varphi{% end %} it tracks the true driver of the outcome, and with weight {% katex() %}1 - \varphi{% end %} it is a story with a bias of its own. In a review culture that protects the incumbent, the story's bias points toward the incumbent: the successor failed because it was immature, or the incumbent held because it was proven. An organization that averages its recorded reasons as if they were causes is learning with a misspecified model.

<span id="prop-4"></span>
<details>
<summary>Proposition 4 -- Learning from Stories: an organization that treats recorded reasons as causes converges to a mixture of driver and story, and nothing in the records can reveal it</summary>

**Proposition 4** (Learning from Stories). *Let each recorded reason be {% katex() %}r_t = \varphi(\theta + \epsilon_t) + (1 - \varphi)(b + \epsilon'_t){% end %}, with true driver {% katex() %}\theta{% end %}, story bias {% katex() %}b{% end %}, faithfulness {% katex() %}\varphi \in (0, 1]{% end %} and independent normal noise of standard deviation {% katex() %}\sigma{% end %}.*

*(i) An organization that estimates the driver as the mean of its recorded reasons converges almost surely to*

{% katex(block=true) %}
\hat\theta_\infty = \varphi\,\theta + (1 - \varphi)\,b
{% end %}

*which has the wrong sign, when {% katex() %}b < 0 < \theta{% end %}, exactly when {% katex() %}\varphi < -b/(\theta - b){% end %}.*

*(ii) The records alone cannot reveal this. Every set of parameters with the same {% katex() %}\varphi\theta + (1-\varphi)b{% end %} and the same {% katex() %}\sigma^2(\varphi^2 + (1-\varphi)^2){% end %} produces the same distribution of records, including fully faithful reasons ({% katex() %}\varphi = 1{% end %}) about a driver equal to {% katex() %}\hat\theta_\infty{% end %}. No test that uses the records alone can tell the organization's belief from the truth; only evidence from outside the records, such as telemetry of what drove the outcome, can.*

*Proof.* (i) The records are independent with mean {% katex() %}\varphi\theta + (1 - \varphi)b{% end %}, so their running mean converges to it by the strong law of large numbers; the limit is negative when {% katex() %}\varphi(\theta - b) < -b{% end %}. (ii) Each record is a sum of independent normal terms, so it is normal with mean {% katex() %}\varphi\theta + (1-\varphi)b{% end %} and variance {% katex() %}\sigma^2(\varphi^2 + (1-\varphi)^2){% end %}, and independent normal records are determined in distribution by these two moments. Any parameters that match them give the same law for the whole record, so the likelihood of the records is the same under both, and every test based on them has power equal to its size. ∎

</details>

{{ layer(n=1, type="Bound", id="berk-nash") }}Part (i) is a fixed point of misspecified learning in the sense of Esponda and Pouzo. It is the belief an agent settles on when its model of the world cannot represent the truth, and it fits the agent's own observations as well as any belief the agent can hold{{ cite(ref="16", title="Esponda, I. and Pouzo, D. (2016) -- Berk-Nash Equilibrium: A Framework for Modeling Agents with Misspecified Models, Econometrica 84(3)") }}. Part (ii) says why the organization stays there. Its belief is consistent with its records, and the records are wrong in a direction no audit of the records can see. Proposition 4 treats the records as given. A real organization also chooses which records it gets: a rejected design never runs, so it never produces the telemetry that could correct the story. That selection, the organization's own decisions filtering its evidence, is the setting Esponda and Pouzo study in full, and it makes the fixed point harder to leave.

{{ layer(n=3, type="Estimate", id="writeback-numbers") }}Take a true driver of +1, a story biased toward the incumbent at -0.8, and 2,000 recorded reasons. With reasons faithful at 0.26, naive learning sits at -0.34 after 2,000 reasons, against a limit of -0.33: the organization believes the opposite of what is true. Calibrated learning, with the bias known and removed, reaches +0.97 from the same records. The sign flips where the faithful share of the true driver balances the biased share of the story. That happens at a faithfulness of the bias's size over the gap between driver and bias: 0.8 over 1.8, or four in nine.

{{ layer(n=2, type="Fit", id="writeback-closes-loop") }}This is how an organization comes to believe that successor designs fail for being immature. Each recorded reason is plausible, each is written in good faith, and the average of them points away from what drove the outcomes. The next review weighs the next successor against that belief. The pipeline's stages each cost the design something once. The write-back loop charges again at every review that follows, and part (ii) says the lever has to come from outside the records.

{{ layer(n=2, type="Fit", id="coupled-feedback") }}The loop reaches further than one estimate. A record that blames failed changes on immature designs, rather than on how they were reviewed, teaches the next panel the same heuristic and raises the correlation of its errors. It hardens the endorsement of whoever approved the incumbent. And it keeps the status quo where every past compromise put it, among the gates' priorities. Each review then starts from a weaker sensor, a louder defender and a smaller win-set. These links are a qualitative coupling, not calibrated parameters. The model computes each of them once and does not iterate them across reviews: the direction of each is clear, and its size is not measured.

## The Achievable Region

{{ layer(n=2, type="Fit", id="region-intro") }}Definition 3 promised a region. There are six levers, one per force: a reversible pilot, one exterior gate removed, a blind poll, an insured champion who speaks first, a decorrelated panel and a flatter chain. Each switches one force off, and together they make 64 combinations. Each also acts on one stage. The decorrelated panel works on the sensors, the blind poll and the insured champion on aggregation, and the flatter chain on the hand-off. The removed gate works on the actuator, and the reversible pilot on the switching band. Removing a gate matters even where the spatial test already passes, because the evidence must clear every gate's threshold through that gate's own noise, and three draws are easier to clear than four. The running case was run under every one of them, on a better design and on a worse one. The chart shows the choices a reviewer actually weighs as the two shares of Definition 3: today's review, each lever alone, all six together, and a status quo inside the hull.

<div style="margin:1.5em 0;">
<canvas id="chart-frontier" role="img" aria-label="How often a review adopts a better and a worse design: today, with each lever alone, with all six, and with the status quo inside the approvers' hull. Today: better 72%, worse 20%. Decorrelated panel: better 74%, worse 17%. Reversible pilot: better 76%, worse 21%. Fewer hand-offs: better 75%, worse 21%. One gate removed: better 73%, worse 20%. Champion speaks first: better 84%, worse 38%. Blind vote: better 43%, worse 4%. All six levers: better 71%, worse 7%. Status quo in the hull: better 0%, worse 0%." style="width:100%;height:330px;display:block;"></canvas>
<figcaption>What each choice buys. Blue is how often a review adopts a better design, red how often it adopts a worse one, and the dotted lines mark today's 72% and 20%. Five levers move both dots the same way; only the decorrelated panel moves them apart, which is why every widest gap includes it. All six together keep a better design near 71% and cut a worse one to 7%. With the status quo inside the approvers' hull, nothing passes.</figcaption>
<script>
(function(){var S={"id":"chart-frontier","h":330,"ml":[132,150],"mr":[14,18],"mt":8,"mb":36,"els":[{"t":"line","pts":[[0.7167,-0.5],[0.7167,8.5]],"c":"b","w":1,"dash":true},{"t":"line","pts":[[0.1956,-0.5],[0.1956,8.5]],"c":"a","w":1,"dash":true},{"t":"pt","x":0.02,"y":9.2,"r":4,"c":"b"},{"t":"txt","x":0.02,"y":9.2,"s":"a better design adopted","n":"better adopted","al":"left","bl":"middle","dx":8,"c":"b"},{"t":"pt","x":0.4,"y":9.2,"r":4,"c":"a"},{"t":"txt","x":0.4,"y":9.2,"s":"a worse design adopted","n":"worse adopted","al":"left","bl":"middle","dx":8,"c":"a"},{"t":"txt","x":0.98,"y":9.2,"s":"dotted: today","n":"dotted: today","al":"right","bl":"middle","c":"sub"},{"t":"line","pts":[[0.1956,8],[0.7167,8]],"c":"g","w":3},{"t":"pt","x":0.1956,"y":8,"r":5,"c":"a"},{"t":"pt","x":0.7167,"y":8,"r":5,"c":"b"},{"t":"txt","x":0.7167,"y":8,"s":"72%","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":0.1956,"y":8,"s":"20%","al":"right","bl":"middle","dx":-8,"c":"a"},{"t":"line","pts":[[0.169,7],[0.7445,7]],"c":"g","w":3},{"t":"pt","x":0.169,"y":7,"r":5,"c":"a"},{"t":"pt","x":0.7445,"y":7,"r":5,"c":"b"},{"t":"txt","x":0.7445,"y":7,"s":"74%","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":0.169,"y":7,"s":"17%","al":"right","bl":"middle","dx":-8,"c":"a"},{"t":"line","pts":[[0.2092,6],[0.757,6]],"c":"g","w":3},{"t":"pt","x":0.2092,"y":6,"r":5,"c":"a"},{"t":"pt","x":0.757,"y":6,"r":5,"c":"b"},{"t":"txt","x":0.757,"y":6,"s":"76%","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":0.2092,"y":6,"s":"21%","al":"right","bl":"middle","dx":-8,"c":"a"},{"t":"line","pts":[[0.2072,5],[0.7522,5]],"c":"g","w":3},{"t":"pt","x":0.2072,"y":5,"r":5,"c":"a"},{"t":"pt","x":0.7522,"y":5,"r":5,"c":"b"},{"t":"txt","x":0.7522,"y":5,"s":"75%","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":0.2072,"y":5,"s":"21%","al":"right","bl":"middle","dx":-8,"c":"a"},{"t":"line","pts":[[0.2028,4],[0.729,4]],"c":"g","w":3},{"t":"pt","x":0.2028,"y":4,"r":5,"c":"a"},{"t":"pt","x":0.729,"y":4,"r":5,"c":"b"},{"t":"txt","x":0.729,"y":4,"s":"73%","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":0.2028,"y":4,"s":"20%","al":"right","bl":"middle","dx":-8,"c":"a"},{"t":"line","pts":[[0.3806,3],[0.8425,3]],"c":"g","w":3},{"t":"pt","x":0.3806,"y":3,"r":5,"c":"a"},{"t":"pt","x":0.8425,"y":3,"r":5,"c":"b"},{"t":"txt","x":0.8425,"y":3,"s":"84%","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":0.3806,"y":3,"s":"38%","al":"right","bl":"middle","dx":-8,"c":"a"},{"t":"line","pts":[[0.0384,2],[0.4346,2]],"c":"g","w":3},{"t":"pt","x":0.0384,"y":2,"r":5,"c":"a"},{"t":"pt","x":0.4346,"y":2,"r":5,"c":"b"},{"t":"txt","x":0.4346,"y":2,"s":"43%","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":0.0384,"y":2,"s":"4%","al":"right","bl":"middle","dx":-8,"c":"a"},{"t":"line","pts":[[0.0698,1],[0.7085,1]],"c":"g","w":3},{"t":"pt","x":0.0698,"y":1,"r":5,"c":"a"},{"t":"pt","x":0.7085,"y":1,"r":5,"c":"b"},{"t":"txt","x":0.7085,"y":1,"s":"71%","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":0.0698,"y":1,"s":"7%","al":"right","bl":"middle","dx":-8,"c":"a"},{"t":"pt","x":0.0,"y":0,"r":5,"c":"g"},{"t":"txt","x":0.0,"y":0,"s":"nothing passes, better or worse","n":"nothing passes","al":"left","bl":"middle","dx":10,"c":"sub","b":true}],"X":{"lo":0.0,"hi":1.0,"ticks":[[0.0,"0%"],[0.25,"25%"],[0.5,"50%"],[0.75,"75%"],[1.0,"100%"]],"title":"share of reviews that adopt the design","ntitle":"share adopted"},"Y":{"lo":-0.6,"hi":9.6,"ticks":[[8,"Today"],[7,"Decorrelated panel"],[6,"Reversible pilot"],[5,"Fewer hand-offs"],[4,"One gate removed"],[3,"Champion speaks first"],[2,"Blind vote"],[1,"All six levers"],[0,"Status quo in the hull"]],"title":""}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
function draw(){var W=cv.clientWidth,H=S.h;var dpr=window.devicePixelRatio||1;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);ctx.setTransform(cv.width/W,0,0,cv.height/H,0,0);ctx.clearRect(0,0,W,H);
var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
var P=dark?{ink:'#ddd',sub:'#aaa',grid:'#444',a:'#ef9a9a',b:'#8ab4f8',c:'#81c784',d:'#ffcc80',e:'#ce93d8',g:'#bbb'}:{ink:'#333',sub:'#555',grid:'#d6d6d6',a:'#b71c1c',b:'#1565c0',c:'#2e7d32',d:'#e65100',e:'#6a1b9a',g:'#777'};
if(dark){ctx.fillStyle='#1e1e1e';ctx.fillRect(0,0,W,H);}
var nar=W<560,fs=nar?9:11,L=nar?S.ml[0]:S.ml[1],R=nar?S.mr[0]:S.mr[1],T=S.mt,B=S.mb,pw=W-L-R,ph=H-T-B;
function sc(a,v){return a.log?(Math.log(v)-Math.log(a.lo))/(Math.log(a.hi)-Math.log(a.lo)):(v-a.lo)/(a.hi-a.lo);}
function X(v){return L+pw*sc(S.X,v);}function Y(v,k){return T+ph*(1-sc(k==='R'?S.R:S.Y,v));}
function tx(s,x,y,al,bl,col,bold){ctx.font=(bold?'bold ':'')+fs+'px sans-serif';ctx.textAlign=al||'left';ctx.textBaseline=bl||'middle';ctx.fillStyle=P[col]||P.ink;ctx.fillText(s,Math.round(x),Math.round(y));}
ctx.lineWidth=1;S.Y.ticks.forEach(function(t){var y=Math.round(Y(t[0],'L'))+0.5;ctx.strokeStyle=P.grid;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(L+pw,y);ctx.stroke();tx(t[1],L-5,y,'right','middle',S.Y.col||'sub');});
if(S.R){S.R.ticks.forEach(function(t){tx(t[1],L+pw+5,Y(t[0],'R'),'left','middle',S.R.col||'sub');});}
var xt=nar&&S.X.nticks?S.X.nticks:S.X.ticks;xt.forEach(function(t,i){var al=(sc(S.X,t[0])<0.01)?'left':(sc(S.X,t[0])>0.99?'right':'center');tx(t[1],X(t[0]),T+ph+6,al,'top','sub');});
ctx.strokeStyle=P.sub;ctx.beginPath();ctx.moveTo(L,T+ph+0.5);ctx.lineTo(L+pw,T+ph+0.5);ctx.stroke();
tx(nar&&S.Y.ntitle?S.Y.ntitle:S.Y.title,L,4,'left','top',S.Y.col||'ink');if(S.R){tx(nar&&S.R.ntitle?S.R.ntitle:S.R.title,L+pw,4,'right','top',S.R.col||'ink');}
tx(nar&&S.X.ntitle?S.X.ntitle:S.X.title,L+pw,H-2,'right','bottom','ink');
S.els.forEach(function(e){var k=e.ax||'L',c=P[e.c]||P.ink;ctx.setLineDash(e.dash?[5,4]:[]);ctx.globalAlpha=1;
if(e.t==='hband'){ctx.globalAlpha=('al' in e)?e.al:0.12;ctx.fillStyle=c;var y0=Y(e.y0,k),y1=Y(e.y1,k);ctx.fillRect(L,Math.min(y0,y1),pw,Math.abs(y1-y0));}
else if(e.t==='rect'){ctx.globalAlpha=('al' in e)?e.al:1;ctx.fillStyle=c;var rx0=X(e.x0),rx1=X(e.x1),ry0=Y(e.y0,k),ry1=Y(e.y1,k);ctx.fillRect(Math.min(rx0,rx1),Math.min(ry0,ry1),Math.abs(rx1-rx0),Math.abs(ry1-ry0));}
else if(e.t==='vline'){ctx.strokeStyle=c;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(Math.round(X(e.x))+0.5,T);ctx.lineTo(Math.round(X(e.x))+0.5,T+ph);ctx.stroke();}
else if(e.t==='hline'){ctx.strokeStyle=c;ctx.lineWidth=e.w||1;ctx.beginPath();ctx.moveTo(L,Math.round(Y(e.y,k))+0.5);ctx.lineTo(L+pw,Math.round(Y(e.y,k))+0.5);ctx.stroke();}
else if(e.t==='band'){ctx.globalAlpha=('al' in e)?e.al:0.18;ctx.fillStyle=c;ctx.beginPath();e.pts.forEach(function(p,i){i?ctx.lineTo(X(p[0]),Y(p[2],k)):ctx.moveTo(X(p[0]),Y(p[2],k));});for(var i=e.pts.length-1;i>=0;i--){ctx.lineTo(X(e.pts[i][0]),Y(e.pts[i][1],k));}ctx.closePath();ctx.fill();if(e.edge){ctx.globalAlpha=1;ctx.strokeStyle=c;ctx.lineWidth=1;[1,2].forEach(function(j){ctx.beginPath();e.pts.forEach(function(p,i){i?ctx.lineTo(X(p[0]),Y(p[j],k)):ctx.moveTo(X(p[0]),Y(p[j],k));});ctx.stroke();});}}
else if(e.t==='line'){ctx.strokeStyle=c;ctx.lineWidth=e.w||2;ctx.beginPath();e.pts.forEach(function(p,i){i?ctx.lineTo(X(p[0]),Y(p[1],k)):ctx.moveTo(X(p[0]),Y(p[1],k));});ctx.stroke();ctx.setLineDash([]);if(e.mk){e.pts.forEach(function(p){ctx.beginPath();ctx.arc(X(p[0]),Y(p[1],k),e.mk,0,6.2832);if(e.open){ctx.fillStyle=dark?'#1e1e1e':'#fff';ctx.fill();ctx.lineWidth=1.5;ctx.stroke();}else{ctx.fillStyle=c;ctx.fill();}});}}
else if(e.t==='pt'){ctx.setLineDash([]);ctx.beginPath();ctx.arc(X(e.x),Y(e.y,k),e.r||4,0,6.2832);if(e.open){ctx.strokeStyle=c;ctx.lineWidth=1.8;ctx.stroke();}else{ctx.fillStyle=c;ctx.fill();}}
else if(e.t==='txt'){var s=nar&&('n' in e)?e.n:e.s;if(s){tx(s,X(e.x)+(e.dx||0),Y(e.y,k)+(e.dy||0),e.al,e.bl,e.c,e.b);}}
ctx.setLineDash([]);ctx.globalAlpha=1;});}
draw();window.addEventListener('resize',draw);var mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');if(mq&&mq.addEventListener){mq.addEventListener('change',draw);}
})();
</script>
</div>

{{ layer(n=3, type="Estimate", id="frontier-shape") }}Of the 64 combinations, 21 are on the frontier, and all but one include the decorrelated panel. The exception lets the champion speak first and adopts a worse design 38% of the time. Today's review sits inside the frontier: it could adopt better designs as often and worse ones less often, by changing its process alone. The combinations with the widest gaps are all frontier points.

{{ layer(n=3, type="Estimate", id="frontier-branches") }}The frontier falls into three clusters, and the aggregation levers decide which one a review is on. The cautious cluster, which adopts a worse design 7% of the time or less, all uses the blind poll. The middle one uses neither the poll nor the champion, and the eager one lets the champion speak first. The widest gap belongs to all six levers together: a better design's chances stay near 71%, and a worse design's fall from 20% to 7%.

{{ layer(n=3, type="Estimate", id="region-robust") }}The region moves with the constants, and its main feature survives. Recomputed with the precision, the correlation, the gates' noise, the design's merit or the candor changed one at a time, the widest-gap combination includes the decorrelated panel in every case. At least five in six frontier points include it too, and the exceptions are mostly eager combinations that let the champion speak first.

{{ layer(n=2, type="Fit", id="why-reviews-resist-levers") }}This explains why process reforms of this kind are hard to sell. Each is evaluated, in practice, by whether the next good design passes, because nobody counts the bad designs that did not. On that one number, the blind poll looks like a loss and the decorrelated panel buys about three points. Read on the region, the review can keep its good designs and refuse most of its bad ones, and the price is a change in who sits on the panel and how they vote.

## Checking the Model Against Real Panels

{{ layer(n=2, type="Fit", id="why-check") }}The running case is invented, and its constants are the obvious place to doubt it. Design reviews leave no public record of who judged what, in what order, or whether a rejected design would have been better. The closest public analogue is scientific peer review. Expert panels judge proposals, discuss them and vote, and several studies have measured the quantities the model needs.

{{ layer(n=1, type="Bound", id="reviewer-reliability") }}Bornmann, Mutz and Daniel pooled 48 studies of journal peer review and found a mean agreement between reviewers, measured as an intraclass correlation, of 0.34{{ cite(ref="17", title="Bornmann, L., Mutz, R. and Daniel, H.-D. (2010) -- A Reliability-Generalization Study of Journal Peer Reviews, PLoS ONE 5(12)") }}. For a yes-or-no judgment of a proposal whose quality sits on either side of the bar, that reliability implies a reviewer who is right 70% of the time. It is the precision the running case assumed.

{{ layer(n=1, type="Bound", id="two-committees") }}The correlation comes from a sharper experiment. NeurIPS sent a share of its submissions to two independent committees in 2014 and again in 2021. In 2021 the committees disagreed on 23% of those papers, at an acceptance rate near 23%{{ cite(ref="18", title="Cortes, C. and Lawrence, N.D. (2021); Beygelzimer, A. and three coauthors (2023) -- the NeurIPS consistency experiments, arXiv:2109.09774 and arXiv:2306.03262") }}. Reviewers with the reliability above, judging independently, would make committees of three or four disagree on 20% to 22% of papers.

{{ layer(n=3, type="Estimate", id="shared-error") }}The gap is the aggregation stage at work. Committees disagree more than independent reviewers would because reviewers inside one committee share part of their error, through discussion, anchoring or a common frame. Two shared components are in play, and both count. A proposal near the bar fools all its reviewers at once, so even independent reviewers' errors correlate at 0.13 in this model; the committee's shared part comes on top. Fitting it to the observed 23% gives a latent correlation of two reviewers' errors between 0.23 and 0.32. The running case's one shared factor stands for both components and assumed 0.25, and the 2014 experiment implies more.

{{ layer(n=1, type="Bound", id="pier-panels") }}Pier and coauthors watched the mechanism happen. In constructed NIH panels reviewing the same applications, discussion raised agreement within each panel and lowered agreement between panels{{ cite(ref="19", title="Pier, E.L. and coauthors (2017) -- Score calibration talk influences intra- and inter-panel variability during scientific grant peer review, Research Evaluation 26(1)") }}. Talking made each panel more sure of its verdict without making the verdicts more alike.

{{ layer(n=3, type="Estimate", id="pier-reproduced") }}The model reproduces that pattern without being fitted to it. Two simulated panels judging the same proposal agree internally 75% of the time when they vote blind and 96% when they vote in order. Their verdicts match 73% of the time blind and 69% in order. A sequence buys internal agreement and pays for it in accuracy.

{{ layer(n=1, type="Bound", id="field-herding") }}Field experiments also correct the model. Teplitskiy and five coauthors showed 277 medical faculty fabricated scores from other reviewers: 47% revised their own, almost always toward the others, and highly cited reviewers revised less, the sign the career plane gives self-certainty{{ cite(ref="20", title="Teplitskiy, M. and coauthors (2019); Lane, J.N. and coauthors (2022) -- field experiments on expert evaluation, Harvard Business School and Management Science 68(6)") }}. A companion experiment found evaluators moved further after critical scores than after favorable ones. And the follow-up to the 2014 NeurIPS experiment, cited above, found the process better at spotting weak papers than strong ones.

{{ layer(n=3, type="Estimate", id="calibrated-case") }}Those findings set the calibrated case: precision 0.67, correlation 0.28, sharper judgment of worse designs, and members who weigh their own signal before following a favorable lead but not a critical one. That review adopts a better design 61% of the time and a worse one 12%, more cautious than the running case. The conclusions hold in every calibrated setting: the widest gap needs the decorrelated panel, and a silent champion costs 8 to 11 points more under sequential voting than under a blind poll.

{{ layer(n=2, type="Fit", id="calibration-limits") }}The calibration reaches the sensors and the aggregation stage, and stops there. No public record measures how much of a verdict survives a chain of summaries, or where an organization's gates sit among their concerns. Those constants stay illustrative, and the evidence above is an analogy: proposals and papers stand in for designs, and that transfer is a Fit.

## The Binding Constraint, in Sequence

{{ layer(n=1, type="Bound", id="sequence-from-product") }}[The Constraint Sequence Framework](@/blog/2025-12-27/index.md) orders constraints by which one binds first. Definition 2 gives that ordering a reason in this setting. The spatial test multiplies everything else, so while it fails, every lever on sensing, aggregation or hand-off is worth nothing. The opening review showed it: zero adoptions under every combination.

{{ layer(n=2, type="Fit", id="actuator-binds-first") }}The actuator binds first because its spatial test is the only part of a review that can sit at exactly zero. Correlation lowers what the sensors deliver and never removes it; cascades and hand-offs lose information and never all of it. A status quo inside the gates' hull sets the spatial test to zero, and Proposition 3 says no evidence changes it. So the first question about any review is geometric: where the status quo sits among the gates' priorities.

{{ layer(n=2, type="Fit", id="conversations-bind-too") }}Two of the deaths without a no can also sit near zero. A review that must reconcile seven groups within a quarter, or that splits a design into simple pieces everyone has a view on, almost never decides. Like the spatial test, they bind before any lever on evidence, so the second question about a review is how many groups hold a view or a veto.

{{ layer(n=2, type="Fit", id="then-the-region") }}After the spatial test, no product rule orders the remaining levers, because they interact through the evidence they share; the region is how they are chosen. Decorrelation comes first among them, because the widest gap needs it in every setting tried and nearly every frontier point includes it. Then the vote: a blind poll for a review that cannot afford to adopt a bad design, a champion speaking first only once the poll is in place. The band comes in practice right after the gates, since a reversible pilot lowers the bar every later stage must clear.

## Reading Your Own Review

{{ layer(n=2, type="Fit", id="read-the-gates") }}The procedure starts at the actuator. List the gates that can block a design, and for each write down, in its own words, the two or three things it most wants from any change. Place the incumbent design among those wishes. Then ask, for each direction a successor could move the system, which gate would lose by it. If every direction costs some gate, the status quo is inside the hull, and the review will adopt nothing until a gate changes.

{{ layer(n=2, type="Fit", id="read-the-band") }}Next, price the switch. Ask what it would cost to move to the successor and what it would cost to move back. If moving back is expensive or has never been planned, the band is wide, and a design must look much better than the incumbent to pass. The cheapest lever on the band is to make the change reversible before it is reviewed.

{{ layer(n=2, type="Fit", id="read-the-room") }}Then read the room. Note the order in which reviewers speak and how often the first two voices decide the meeting. Note which senior reviewers approved the incumbent. Note how many reviewers came from the team that built it. Each is a reading of one term: the cascade's start, the endorsement penalty and the correlation.

{{ layer(n=2, type="Fit", id="read-the-record") }}Last, read the record against something outside it. Take the reasons recorded for the last few decisions and compare each with what telemetry or later events showed. A record that agrees with the evidence less than about half the time is teaching the next review the wrong lesson, and no rereading of the record will show it.

## Where This Sits Among Known Results

{{ layer(n=1, type="Bound", id="known-pieces") }}Every stage of this post rests on a known result. Correlated sensors and the large-panel floor come from credit risk and signal processing. Cascades come from the economics of information, the career plane from the economics of reputation, the cliff from comparative politics, the band from real options, and the write-back from misspecified learning. Products of stage survivals are a familiar accounting device for pipelines of checks; a review fits that form only where a stage is a true pass-or-fail filter, and here only the spatial test is.

{{ layer(n=2, type="Fit", id="what-is-added") }}What this post adds is the composition under one member model, read on two kinds of design at once. Three results come from that composition and from no single literature. The cost of an early silence depends on whether votes are taken in order. The blind poll narrows the gap alone and turns the insured champion from a lever that narrows it into one that widens it. And the widest gap in the region needs a decorrelated panel in every setting tried.

{{ layer(n=2, type="Fit", id="new-and-borrowed") }}Sorted by origin, the propositions fall into two groups. Propositions 1, 2 and 3 restate known results in this setting: Vasicek's limit as a review's floor, the wrong-cascade probability of Bikhchandani, Hirshleifer and Welch, and Tsebelis's win-set as a cliff for review gates. Proposition 4 applies Esponda and Pouzo's misspecified learning to recorded reasons and adds two things: the faithfulness at which the learned belief changes sign, and the non-identification that keeps any audit of the records from finding it. Definitions 2 and 3 are this post's own, and the composition results are estimates in its model.

## Falsification Criteria

Each criterion names an observation on real reviews that would refute this post, with the prediction the model makes for it.

**F1 (correlated experience sets a floor).**
- *Condition:* a body of past review decisions with known outcomes, each reviewer's error rate and the latent correlation of their errors estimated from it.
- *Prediction:* the majority error of panels of growing size levels off near Proposition 1's floor, 14.7% at an error of 30% and a correlation of 0.25, rather than falling toward zero.
- *Refuted if:* the majority error of large panels falls below the floor by more than its sampling error.
- *Ground truth and null:* outcomes observed after deployment, such as incident and rollback records or canary telemetry, or a pre-registered held-out set of decisions; the null is independent errors, under which a majority's error keeps falling as the panel grows.

**F2 (sequential votes lock in).**
- *Condition:* comparable proposals decided by a sequential open vote and by a blind simultaneous poll.
- *Prediction:* the sequential vote adopts proposals later judged worse more often, and the cost of a silent champion is larger under it.
- *Refuted if:* the sequential condition adopts worse proposals no more often than the blind one, or a silent champion costs the same under both.
- *Ground truth and null:* each proposal's quality judged afterwards from canary or deployment telemetry, or by blind re-rating; the null is no difference between the two conditions.

**F3 (the endorsed senior stays silent).**
- *Condition:* an anonymous channel for dissent offered to a review panel whose members' seniority and past endorsements are known.
- *Prediction:* dissent in a successor's favor rises most among senior reviewers who endorsed the incumbent.
- *Refuted if:* the endorsed group's dissent does not rise more under anonymity than the others'.
- *Ground truth and null:* dissent counted in the review record; the null is anonymity raising dissent equally across seniority and past endorsement.

**F4 (the veto cliff).**
- *Condition:* an organization whose current design sits inside the hull of its gates' stated priorities.
- *Prediction:* no proposal passes every gate, whatever its measured merit, until a gate's priorities change or a gate is removed.
- *Refuted if:* a proposal passes every gate while the status quo lies inside the hull of their stated priorities.
- *Ground truth and null:* the gates' priorities written down before the review; the null is a pass rate that does not depend on where the status quo sits among them.

**F5 (reversibility narrows the band).**
- *Condition:* the same kind of proposal offered as a permanent change and as a reversible pilot.
- *Prediction:* the pilot is adopted at a smaller measured advantage, and an adopted permanent change is reversed after a smaller shortfall than the advantage it was adopted at.
- *Refuted if:* lowering the switching cost does not lower the advantage needed to adopt.
- *Ground truth and null:* the advantage measured in pilot or canary telemetry; the null is the same adoption threshold for the pilot and the permanent change.

**F6 (stated reasons mislead the record).**
- *Condition:* the reasons recorded for past decisions compared with what telemetry later showed drove the outcomes.
- *Prediction:* below a critical faithfulness, the bias's size over the gap between driver and bias (four in nine in the running case), a model fitted to the reasons points the wrong way, and no statistic of the reasons alone flags it.
- *Refuted if:* a model fitted to such unfaithful reasons recovers the sign of the driver, or a test on the reasons alone detects the bias.
- *Ground truth and null:* the driver measured from telemetry that does not pass through the recorded reasons; the null is a reasons-based estimate that matches it.

**F7 (groups that decide apart stall the review).**
- *Condition:* comparable proposals reviewed by groups that meet apart and exchange their conclusions, and by the same people meeting together.
- *Prediction:* groups that meet apart stop more proposals in the review, those later judged better as well as those judged worse.
- *Refuted if:* groups meeting apart stop proposals later judged better no more often than the joint meeting does.
- *Ground truth and null:* the quality of stopped proposals judged from shadow pilots or later reimplementation; the null is the same stop rate under both arrangements.

**F8 (the window closes on conversations).**
- *Condition:* decisions that need sign-off from a varying number of groups before a fixed deadline.
- *Prediction:* the share decided in time falls slowly at first and then sharply as the groups grow, faster than in proportion to their number.
- *Refuted if:* the share decided in time falls no faster than in proportion to the number of groups, or does not fall at all.
- *Ground truth and null:* decision timestamps against the deadline; the null is a time to decide that does not depend on the number of groups.

**F9 (simple pieces stall the review).**
- *Condition:* comparable designs reviewed whole and reviewed as separate pieces.
- *Prediction:* each piece draws more participants with an opinion than the whole design did, and the split review concludes less often.
- *Refuted if:* splitting a design does not raise participation per piece, or the split review concludes as often as the whole one.
- *Ground truth and null:* review records of participants, comments and completion; the null is participation per piece equal to the whole design's.

## The Ledger of a Rejected Design

This series keeps one ledger across its parts. Each row names a stage, the belief that hides it, the law that governs it, the lever that switches it off, and the bill.

**Sensors**

*Belief:* more reviewers give a more reliable verdict.

*Law:* Proposition 1: a large majority errs at a floor set by the members' error and their latent correlation, 14.7% at 30% and 0.25. Fifteen correlated votes count as about five independent votes, each carrying less than a score would.

*Lever:* a decorrelated panel, a reviewer who errs in different places.

*Bill:* the widest gap needs the decorrelated panel in every setting tried, and all but one frontier point includes it.

**Aggregation**

*Belief:* a review hears every reviewer.

*Law:* Proposition 2: a sequence settles on the wrong answer in about one long run in six at a precision of 0.7. Sunk endorsement silences support for a successor and amplifies defence of the incumbent.

*Lever:* a blind poll first, then an insured champion; anonymity.

*Bill:* a champion speaking first into a sequence raises adoption of a worse design from 20% to 38%.

**Hand-off**

*Belief:* the verdict reaches the gates intact.

*Law:* against the gates' own noise, three layers at a candor of 0.85 keep about 38% of the signal-to-noise ratio, and lost candor lowers adoption of both designs.

*Lever:* a flatter chain.

*Bill:* from a candor of 0.95 to 0.75, adoption of a better design falls from 76% to 54%.

**Conversations**

*Belief:* consulting more people makes a decision safer.

*Law:* pairs to reconcile grow with the square of the groups consulted, each extra veto cuts a design's chance, and simple pieces draw opinions from everyone.

*Lever:* fewer groups holding a veto, and the design reviewed whole by those who can judge it.

*Bill:* seven groups decide within a quarter under 3% of the time, and a design split into four simple pieces almost never passes.

**Actuator**

*Belief:* gates adopt what the verdict favors.

*Law:* Proposition 3: with the status quo inside the hull of the gates' ideal points, no change passes. Loss aversion on trailing periods makes adopted designs fragile; on the cost of leaving, it makes them late.

*Lever:* a gate removed or its priorities changed; then a reversible pilot.

*Bill:* zero adoptions inside the hull, under every combination of the other levers.

**Write-back**

*Belief:* the organization learns from its record.

*Law:* Proposition 4: naive learning converges to the faithfulness-weighted mixture of driver and story, and no test on the records alone can detect it.

*Lever:* recorded reasons checked against telemetry, the story's bias estimated from outside the records and removed.

*Bill:* a belief of -0.34 about a driver of +1, at a faithfulness of 0.26.

## What This Post Did Not Claim

**Reversal condition.** The advice of this post is to read a review as a pipeline, check the gates first, and choose levers on both kinds of design. It reverses for a review with a single decider and no gates, where the actuator is the verdict itself and the stages that read evidence are all that remain.

### What Is Not Claimed

The running case's numbers come from a model of one review. Its precision and error correlation are calibrated against peer review, an analogue rather than design reviews themselves, and its other constants are illustrative. The floor, the cascade probability, the cliff and the write-back limit do not depend on those constants. The adoption probabilities and the region do; each constant was swept for the probabilities, and the region was recomputed under six alternative settings.

It is not claimed that politics and self-interest are absent from real reviews. The claim is narrower: they are not needed to explain rejection of a correct design, so removing them would not be enough to fix it. Nor is it claimed that the career plane's functional form is derived. It is a Fit, and only its conclusions that keep their sign across the swept constants are used.

Three open questions are named on purpose. The model's members do not learn across reviews, so a team whose correlation changes as it hires is not modeled. The hand-off keeps a fixed share of amplitude, while real summaries may drop the weakest evidence first, which could be worse. And the switching band's growth at frequent reviews is reported as a trend between two cadences, not derived.

Nor is the actuator's factoring claimed for every review. Definition 2 separates the spatial test from the evidence test. Real gates also demand changes, cut scope or ask for rollback guarantees, which alter the design and its evidence together; such a review is a co-design loop, outside the model. Gates may also price a switching cost or loss aversion into their own priorities, which couples the two tests. And once a compromise has put the status quo inside the hull, the band's edges stop mattering until a shock or a gate moves the status quo out. Two measurements are missing as well: the hand-off's candor and number of layers, and real gates' priorities and status quo before a review. Both are illustrative here.

### Where Each Claim Holds

The claims of this post leave their conditions in six recurring ways, and each is listed in full in the drawer below with its assumption and failure mode.

**Several shared backgrounds.** A team drawn from two sources has two shared factors, and the single-factor floor then describes the larger one only. A review panel built across two backgrounds can do better than the floor of either.

**Strong private evidence.** A reviewer who holds evidence strong enough to overturn any lead breaks a cascade. Shadow traffic, a production incident or a proof is that kind of evidence, and with it the sequence stops locking in.

**Gates that negotiate.** Gates that trade concessions across reviews, or that can be compensated, are no longer points with fixed preferences. The cliff then has a door, priced in what the gates are given.

**Reasons that are checked.** An organization that compares recorded reasons with outcomes, and corrects for the stories' bias, converges to the driver. The write-back result describes an organization that does not.

**Gates that rule by majority.** Proposition 3 needs every gate to hold a veto. Under majority rule or weighted authority a win-set can exist inside the hull, and the cliff becomes a slope.

**Hard floors.** A safety or compliance rule that rejects anything past a line is a constraint, not a point with a distance. It can block a design the geometry would pass, or pass one it would block.

<details>
<summary>Every claim, with its assumption and failure mode, in the order the post derives them</summary>

**Claim.** A review's operating point is its pair of adoption probabilities for better and worse designs, and only the spatial test multiplies the rest.
- *Assumption:* the pipeline of Definition 2, with evidence relayed to gates that apply a threshold.
- *Failure mode:* gates that read something other than the relayed evidence, such as a sponsor's name.

**Claim.** An average of fifteen reviewers' scores correlated at 0.25 carries 3.33 independent opinions, at most 4; an average of their votes counts as 4.84 independent units, each less informative than a score.
- *Assumption:* equal error variance and one pairwise correlation; an equal-weight average; the vote correlation from the one-factor model.
- *Failure mode:* reviewers with very different accuracies, or an average weighted toward the best of them.

**Claim.** A large majority errs at the floor of Proposition 1.
- *Assumption:* one shared factor and a common error rate below one half.
- *Failure mode:* several shared factors, or members whose errors depend on the state of the world.

**Claim.** Partitioned groups reach different verdicts in a share of reviews that rises with the number of groups.
- *Assumption:* each group decides by its own majority before exchanging evidence.
- *Failure mode:* groups that exchange evidence before deciding.

**Claim.** Groups that decide apart stop more reviews in the team review, of better and worse designs alike, and concentrating the evidence in one group stops more.
- *Assumption:* a design any group does not favor stops; illustrative group sizes and shares of evidence whose mean is the calibrated precision; part of the correlation local to each room.
- *Failure mode:* groups that exchange evidence rather than conclusions, or a decision owner who overrides a single dissenting group.

**Claim.** A design can die of its conversations without a no: the decision window closes as the pairs to reconcile grow, each extra veto cuts its chance, and a design split into simple pieces draws opinions from everyone; carried conclusions rescue the better design at the cost of discrimination.
- *Assumption:* pairs settled one at a time within a fixed window; extra groups whose priorities lie partly with the status quo; a share of opinion holders that grows as pieces get simpler, illustrative and swept.
- *Failure mode:* disagreements settled in parallel, consulted groups without a veto, or pieces reviewed only by those who own them.

**Claim.** A sequence ends in a wrong cascade with the probability of Proposition 2, and probing lowers it.
- *Assumption:* binary signals of equal precision, each member seeing every earlier action.
- *Failure mode:* strong private evidence, or members who see only a summary of earlier actions.

**Claim.** The endorsed senior stays silent for the successor and speaks for the incumbent.
- *Assumption:* the voice margin's form, a Fit encoding the signs of the cited models.
- *Failure mode:* a culture that rewards admitting error enough to reverse the endorsement term.

**Claim.** Measured against the gates' own noise, hand-offs keep a share of signal-to-noise ratio that falls as the square of the amplitude share, per layer, and lower adoption of both designs.
- *Assumption:* each layer keeps a fixed share of amplitude, adds no noise or bias, and the gates' threshold does not scale with it.
- *Failure mode:* summaries that drop the weakest evidence first, or that add a bias of their own.

**Claim.** No change passes when the status quo lies inside the hull of the gates' ideal points.
- *Assumption:* Euclidean preferences in a plane of concerns, each gate voting its own preference; with other strictly convex preferences the cliff is the gates' Pareto set.
- *Failure mode:* gates that negotiate, are compensated, or whose priorities change.

**Claim.** The change an agenda setter proposes lies in the hull, so one compromise ends change while the priorities stay fixed.
- *Assumption:* strict Euclidean preferences; the setter proposes the point of the closed win-set closest to its ideal.
- *Failure mode:* gates whose priorities move between reviews, or a setter who proposes less than it could get.

**Claim.** The switching band widens with the cost; loss aversion on trailing periods narrows its abandonment edge, and on the switch raises its adoption edge.
- *Assumption:* a random-walk advantage reviewed at fixed periods, a sunk cost in each direction.
- *Failure mode:* an advantage with a trend, or a switch whose reversal is free.

**Claim.** An early silence costs more with sequential voting, and with the blind poll in place the champion widens the gap instead of narrowing it.
- *Assumption:* the running case's composition of stages.
- *Failure mode:* a review that hears every member before anyone votes.

**Claim.** Most reviews that fail end in the team review; the approvals stop a design only when the status quo sits among their priorities, and then they stop every one.
- *Assumption:* a review dies in the hand-off when the unweakened verdict would have convinced every approver and the relayed one does not; the running case's constants.
- *Failure mode:* approvers who read the evidence directly rather than through the hand-off, or a status quo far from every approver's priorities.

**Claim.** Naive learning from recorded reasons converges to the limit of Proposition 4, and the records alone cannot reveal it.
- *Assumption:* reasons that mix the driver and a story with a fixed bias, with normal noise.
- *Failure mode:* a bias that varies from review to review, non-normal records whose higher moments carry information, or reasons checked against outcomes.

**Claim.** The calibrated precision and error correlation match the running case, and the conclusions hold at the calibrated constants.
- *Assumption:* peer review stands in for design review; reviewers' scores are a true quality plus a committee-shared error plus private noise.
- *Failure mode:* design reviews whose reviewers are far more or far less reliable than scientific referees.

**Claim.** Nearly every frontier point includes a decorrelated panel, and the widest-gap combination includes it in every setting tried.
- *Assumption:* the running case's constants and the six levers as modeled.
- *Failure mode:* a review with constants far from those swept, or a decorrelation lever that also lowers members' accuracy.

</details>

### What Is Left Open

This post's members are people, and its constants are set for people. Conformity is measured in rooms, careers run for decades, and reasons are written after the fact by minds that cannot see their own causes. A review whose members are models keeps the same pipeline and changes the constants. Some terms vanish, and others appear that people do not have. Which stages that leaves open is a question this post does not answer.

{% cognitive_map(root="Correct, and Rejected") %}
{
"intro": "A better design can be rejected by a competent review in which nobody behaves badly. This post builds one model of a reviewer, follows a design through four stages, reads every stage on better and worse designs at once, and finds the one stage no evidence can open.",
"groups": [
  {"theme": "Scorecard and Sensors", "c": "mint", "points": [
    [1, "One Model of a Member", "Definition 1: a member holds a bounded binary signal, acts in order, and is paid for accuracy, minus conformity, plus reputation over a horizon, with loss aversion and a career position. People and agents differ only in the values."],
    [2, "Two Ways to Be Wrong", "Definitions 2 and 3: adoption is a spatial test times the chance that relayed evidence clears the bar, and a review is an operating point of adoption of better and worse designs; the running case sits at 72% and 20%."],
    [3, "Three to Five Opinions", "An average of fifteen reviewers' scores correlated at 0.25 carries 3.33 independent opinions, never more than 4; an average of their votes, which correlate less but each carry less, counts as 4.84."],
    [4, "The Majority Floor", "Proposition 1: a large majority errs at Phi(Phi^-1(p)/sqrt(rho)), 14.7% at an error of 30% and a correlation of 0.25; a panel of fifteen is already within three points of it."],
    [5, "Two Groups, Two Verdicts", "Groups that decide apart, holding unequal shares of the evidence, stop 54% of reviews of a better design in the team review, against 22% in one room, and 98% of a worse one: the split is cautious rather than wise."],
    [6, "Death Without a No", "A design can die of its conversations: five groups decide within a quarter 83% of the time and seven under 3%, each extra veto cuts its chance, and a design split into simple pieces draws opinions from everyone and stalls."],
    [7, "The Energy Bill", "Count the conversations and they become a budget: one settlement reconciles one pair of views, so a piece held by h people costs h(h-1)/2, and a design split into four pieces needs 34 owner-weeks for a 13-week window."]
  ]},
  {"theme": "Aggregation and Hand-off", "c": "sky", "points": [
    [8, "The Wrong Cascade", "Proposition 2: voting in order settles on the wrong answer in (1-q)^2/(1-2q(1-q)) of long runs, about one in six at a precision of 0.7; a weight on informing later voters cuts it to 7%."],
    [9, "Who Speaks Against the Room", "Sunk endorsement silences a senior reviewer's support for a successor and amplifies their defence of the incumbent, at every swept value of a correct verdict."],
    [10, "Layers That Drop the Signal", "Each hand-off keeps a share of amplitude and, against the gates' own noise, the square of it in signal-to-noise ratio; three layers at 0.85 keep about 38%, and lost candor lowers adoption of better and worse designs alike."]
  ]},
  {"theme": "Actuator", "c": "peach", "points": [
    [11, "The Veto Cliff", "Proposition 3: with the status quo inside the convex hull of the gates' ideal points no change passes; the opening review is this case, with zero adoptions under every combination of the other levers."],
    [12, "One Compromise", "The gate that sets the agenda proposes the point of the win-set it likes best; it lies in the hull, so one compromise ends change while the priorities stay fixed."],
    [13, "The Switching Band", "A sunk cost in each direction opens a band of inaction that widens nearly in proportion to the cost; loss aversion on trailing periods makes adopted designs fragile, and on the cost of leaving makes them late."],
    [14, "One Early Silence", "A silent champion costs about 3 points of adoption in a blind poll and about 13 with sequential voting; alone, the poll narrows the gap; with it in place, letting the champion speak first widens the gap instead of narrowing it."],
    [15, "Where Designs Die", "Most reviews of a better design that fail end in the team review, 22%, with 5% lost in the hand-off and under 1% at the approvals, unless the status quo sits among the approvers' priorities, when the approvals take everything."]
  ]},
  {"theme": "Write-back and the Region", "c": "rose", "points": [
    [16, "Learning from Stories", "Proposition 4: an organization that treats recorded reasons as causes converges to phi times the driver plus (1-phi) times the story's bias, and no test on the records alone can detect it: -0.34 about a driver of +1 at a faithfulness of 0.26."],
    [17, "Feedback Across Reviews", "A biased record raises the next panel's correlation, hardens the incumbent's endorsement and keeps the status quo among the gates' priorities; the model computes each link once and does not iterate them."],
    [18, "The Achievable Region", "Of 64 combinations of six levers, 21 are on the frontier and all but one include a decorrelated panel, which the widest gap needs in every setting tried; all six together keep a better design near 71% and cut a worse one from 20% to 7%."],
    [19, "Gates First", "The spatial test multiplies everything else, so while it fails no lever is worth anything; after it, levers are chosen on the region, decorrelation first."],
    [20, "Checked Against Real Panels", "Peer review calibrates the sensors: a reliability of 0.34 implies a reviewer right 70% of the time, and the NeurIPS committees' disagreement implies an error correlation of 0.23 to 0.32; the model reproduces panels that agree more inside and less with each other, and its conclusions hold at the calibrated constants."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**Scorecard and Sensors**

1. Definition 1: a member holds a bounded binary signal, acts in order, and is paid for accuracy, minus conformity, plus reputation over a horizon, with loss aversion and a career position. People and agents differ only in the values.
2. Definitions 2 and 3: adoption is a spatial test times the chance that relayed evidence clears the bar, and a review is an operating point of adoption of better and worse designs; the running case sits at 72% and 20%.
3. An average of fifteen reviewers' scores correlated at 0.25 carries 3.33 independent opinions, never more than 4; an average of their votes, which correlate less but each carry less, counts as 4.84.
4. Proposition 1: a large majority errs at {% katex() %}\Phi(\Phi^{-1}(p)/\sqrt{\rho}){% end %}, 14.7% at an error of 30% and a correlation of 0.25; a panel of fifteen is already within three points of it.
5. Groups that decide apart, holding unequal shares of the evidence, stop 54% of reviews of a better design in the team review, against 22% in one room, and 98% of a worse one: the split is cautious rather than wise.
6. A design can die of its conversations: five groups decide within a quarter 83% of the time and seven under 3%, each extra veto cuts its chance, and a design split into simple pieces draws opinions from everyone and stalls.
7. Count the conversations and they become a budget: one settlement reconciles one pair of views, so a piece held by h people costs h(h-1)/2, and a design split into four pieces needs 34 owner-weeks for a 13-week window.

**Aggregation and Hand-off**

8. Proposition 2: voting in order settles on the wrong answer in {% katex() %}(1-q)^2/(1-2q(1-q)){% end %} of long runs, about one in six at a precision of 0.7; a weight on informing later voters cuts it to 7%.
9. Sunk endorsement silences a senior reviewer's support for a successor and amplifies their defence of the incumbent, at every swept value of a correct verdict.
10. Each hand-off keeps a share of amplitude and, against the gates' own noise, the square of it in signal-to-noise ratio; three layers at 0.85 keep about 38%, and lost candor lowers adoption of better and worse designs alike.

**Actuator**

11. Proposition 3: with the status quo inside the convex hull of the gates' ideal points no change passes; the opening review is this case, with zero adoptions under every combination of the other levers.
12. The gate that sets the agenda proposes the point of the win-set it likes best; it lies in the hull, so one compromise ends change while the priorities stay fixed.
13. A sunk cost in each direction opens a band of inaction that widens nearly in proportion to the cost; loss aversion on trailing periods makes adopted designs fragile, and on the cost of leaving makes them late.
14. A silent champion costs about 3 points of adoption in a blind poll and about 13 with sequential voting; alone, the poll narrows the gap; with it in place, letting the champion speak first widens the gap instead of narrowing it.
15. Most reviews of a better design that fail end in the team review, 22%, with 5% lost in the hand-off and under 1% at the approvals, unless the status quo sits among the approvers' priorities, when the approvals take everything.

**Write-back and the Region**

16. Proposition 4: an organization that treats recorded reasons as causes converges to {% katex() %}\varphi{% end %} times the driver plus {% katex() %}1-\varphi{% end %} times the story's bias, and no test on the records alone can detect it: -0.34 about a driver of +1 at a faithfulness of 0.26.
17. A biased record raises the next panel's correlation, hardens the incumbent's endorsement and keeps the status quo among the gates' priorities; the model computes each link once and does not iterate them.
18. Of 64 combinations of six levers, 21 are on the frontier and all but one include a decorrelated panel, which the widest gap needs in every setting tried; all six together keep a better design near 71% and cut a worse one from 20% to 7%.
19. The spatial test multiplies everything else, so while it fails no lever is worth anything; after it, levers are chosen on the region, decorrelation first.
20. Peer review calibrates the sensors: a reliability of 0.34 implies a reviewer right 70% of the time, and the NeurIPS committees' disagreement implies an error correlation of 0.23 to 0.32; the model reproduces panels that agree more inside and less with each other, and its conclusions hold at the calibrated constants.

</details>

**Compute it.** For your next review, list the gates that can block a design and place the incumbent among their stated priorities. If it sits inside them, stop arguing about the design and start talking about a gate.

The review that turned the design down was not wrong about anything it measured. It measured the evidence, and the evidence was never the stage that decided.

---

<sup>[1]</sup> Smith, L. and Sørensen, P. (2000). *Pathological Outcomes of Observational Learning.* Econometrica 68(2), 371-398.

<sup>[2]</sup> Vasicek, O. (2002). *The Distribution of Loan Portfolio Value.* Risk 15(12), 160-162.

<sup>[3]</sup> Parkinson, C.N. (1957). *Parkinson's Law, and Other Studies in Administration.* Houghton Mifflin, chapter "High Finance, or the Point of Vanishing Interest" (the law of triviality).

<sup>[4]</sup> Bikhchandani, S., Hirshleifer, D. and Welch, I. (1992). *A Theory of Fads, Fashion, Custom, and Cultural Change as Informational Cascades.* Journal of Political Economy 100(5), 992-1026.

<sup>[5]</sup> Laboratory tests of observational learning: Weizsäcker, G. (2010). *Do We Follow Others When We Should? A Simple Test of Rational Expectations.* American Economic Review 100(5), 2340-2360; and March, C. and Ziegelmeyer, A. (2020). *Altruistic Observational Learning.* Journal of Economic Theory 190, 105123.

<sup>[6]</sup> Franzen, A. and Mader, S. (2023). *The Power of Social Influence: A Replication and Extension of the Asch Experiment.* PLOS ONE 18(11), e0294325.

<sup>[7]</sup> Avery, C.N. and Chevalier, J.A. (1999). *Herding over the Career.* Economics Letters 63(3), 327-333.

<sup>[8]</sup> Prendergast, C. and Stole, L. (1996). *Impetuous Youngsters and Jaded Old-Timers: Acquiring a Reputation for Learning.* Journal of Political Economy 104(6), 1105-1134.

<sup>[9]</sup> Sleesman, D.J., Conlon, D.E., McNamara, G. and Miles, J.E. (2012). *Cleaning Up the Big Muddy: A Meta-Analytic Review of the Determinants of Escalation of Commitment.* Academy of Management Journal 55(3), 541-562.

<sup>[10]</sup> Tsebelis, G. (2002). *Veto Players: How Political Institutions Work.* Princeton University Press.

<sup>[11]</sup> Dixit, A. (1989). *Entry and Exit Decisions under Uncertainty.* Journal of Political Economy 97(3), 620-638.

<sup>[12]</sup> Tversky, A. and Kahneman, D. (1992). *Advances in Prospect Theory: Cumulative Representation of Uncertainty.* Journal of Risk and Uncertainty 5(4), 297-323.

<sup>[13]</sup> Samuelson, W. and Zeckhauser, R. (1988). *Status Quo Bias in Decision Making.* Journal of Risk and Uncertainty 1(1), 7-59.

<sup>[14]</sup> Gazzaniga, M.S. (1998). *The Split Brain Revisited.* Scientific American 279(1), 50-55.

<sup>[15]</sup> Johansson, P., Hall, L., Sikström, S. and Olsson, A. (2005). *Failure to Detect Mismatches Between Intention and Outcome in a Simple Decision Task.* Science 310(5745), 116-119.

<sup>[16]</sup> Esponda, I. and Pouzo, D. (2016). *Berk-Nash Equilibrium: A Framework for Modeling Agents with Misspecified Models.* Econometrica 84(3), 1093-1130.

<sup>[17]</sup> Bornmann, L., Mutz, R. and Daniel, H.-D. (2010). *A Reliability-Generalization Study of Journal Peer Reviews: A Multilevel Meta-Analysis of Inter-Rater Reliability and Its Determinants.* PLoS ONE 5(12), e14331.

<sup>[18]</sup> The NeurIPS consistency experiments: Cortes, C. and Lawrence, N.D. (2021). *Inconsistency in Conference Peer Review: Revisiting the 2014 NeurIPS Experiment.* arXiv:2109.09774; and Beygelzimer, A., Dauphin, Y.N., Liang, P. and Wortman Vaughan, J. (2023). *Has the Machine Learning Review Process Become More Arbitrary as the Field Has Grown? The NeurIPS 2021 Consistency Experiment.* arXiv:2306.03262.

<sup>[19]</sup> Pier, E.L. and coauthors (2017). *'Your comments are meaner than your score': score calibration talk influences intra- and inter-panel variability during scientific grant peer review.* Research Evaluation 26(1), 1-14.

<sup>[20]</sup> The Harvard field experiments on expert evaluation: Teplitskiy, M., Ranu, H., Gray, G., Menietti, M., Guinan, E. and Lakhani, K.R. (2019). *Do Experts Listen to Other Experts? Field Experimental Evidence from Scientific Peer Review.* Harvard Business School working paper; and Lane, J.N. and six coauthors (2022). *Conservatism Gets Funded? A Field Experiment on the Role of Negative Information in Novel Project Evaluation.* Management Science 68(6), 4478-4495.
