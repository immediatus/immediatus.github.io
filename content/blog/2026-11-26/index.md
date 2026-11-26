+++
authors = ["Yuriy Polyulya"]
title = "The Machine Gets the First Word"
description = "Teams now bring AI into design reviews, and the reviewer's job is quietly changing from author to auditor of a machine that never tires of agreeing. This post gives AI a job, not a seat: the Residual Protocol. Machines carry everything that can be written down. People own what cannot, answering a few routed questions alone inside a fixed attention budget, because a machine's list of blind spots is always blind to its own."
date = 2026-11-26
slug = "adoption-mechanics-part3-the-machine-gets-the-first-word"
draft = false

[taxonomies]
tags = ["systems-thinking", "game-theory", "ai", "multi-agent"]
series = ["adoption-mechanics"]

[extra]
toc = false
series_order = 3
series_title = "Adoption Mechanics: Why Correct Designs Die, and Where Human Attention Belongs"
series_description = """<div class="series-lede">Agreement is the cheapest state any system can reach. Consensus is the most expensive way to get there.</div>A review has a human energy budget, and correct designs die where it goes. This series builds one model of a review: people with correlated signals and careers to protect, a vote taken in order, a chain of hand-offs, and veto gates guarding a status quo. People and AI agents differ in it only by a few parameters, several of them measured. The first part follows a design through a human review: first-writer-wins, trivia every pair must settle, and good designs aligned to death. The second gives the model agent values and finds machines that agree for free too, wrong on the same hard questions. The third gives AI a job, not a seat: the Residual Protocol spends machines on everything that can be written and a fixed budget of human attention on what cannot. Every number comes from executed code, and every part names the observation that would prove it wrong."""
+++

The two earlier posts reached an uncomfortable pair of results. The first, [Correct, and Rejected](@/blog/2026-11-14/index.md), found that a review can reject a correct design without anyone behaving badly, because the stages of the review do the rejecting. The second, [Smarter Agents, Fewer Opinions](@/blog/2026-11-21/index.md), found that replacing the reviewers with models keeps most of those stages. The career pressure goes. The shared blind spots, the trained pull toward agreement and the gates all stay.

Teams are not waiting for a theory. Three kinds of AI tool are already entering design reviews. Long-context models are handed the whole design and asked for a verdict. AI mediators summarize a discussion and draft the statement everyone can sign. And critic models, tuned to find faults, are set to argue with the author or with each other. Each tool is sold as a fix for a human failure: limited attention, slow reconciliation, too little dissent.

This post proposes a framework for using them, the Residual Protocol, for a review that spends two budgets, human energy and the machine's, and for reviewers whose job is already changing under them. It builds on the model of the first two posts, on published measurements of the tools, and on recent research on human and AI teams. The answers are not what the tools promise. The machine should read less at a time, not more, and say what it cannot settle. Its consensus should be a reference, never the first word. And people should answer only the questions they hold, each with evidence of their own.

The organizing claim is that an instrument should preserve the difference between independent judgments until the decision, and sharpen each judgment without making them alike. It should stand in for the vote only when it is measured as better than the panel it would replace. Each step of the framework below puts that claim into practice.

<div class="recap-box">
<span class="recap-label">In brief</span>
<ul>
<li><strong>The belief.</strong> AI fixes the meeting: a model can read the whole design, a mediator can find common ground, and a critic can supply the dissent people withhold.</li>
<li><strong>The mechanism.</strong> A review spends two budgets, human energy and the machine's. The machines are cheap, fast and correlated; people are scarce, slow and independent. With all of the first post's levers in place, the review stalls near seven in ten better designs against seven in a hundred worse, because combining adds no information.</li>
<li><strong>The law.</strong> A shared input heard before the vote captures every member it outweighs by more than the probing weight (Proposition 7). Roles of one model err together at their source's floor however many there are (Corollary 2). Settling against the machines' reference instead of between every pair turns the review's quadratic human energy into linear (Proposition 8). Past combining, only accuracy and independence move the review, and accuracy moves it more.</li>
<li><strong>The gap.</strong> A machine that shares a blind spot cannot list the question it is blind to, so the residual it hands to people misses the fact that matters unless people add it. Reading in parts lifts the use of a local fact from 6% to 44% of the time to 46% to 76%, and no arrangement connects two distant passages more than about a fifth of the time.</li>
<li><strong>The intervention.</strong> The Residual Protocol: budget, exhaust, route, probe, diff, carry, own. Machines settle what can be written and list what they cannot. Each listed or added question goes to the people who hold its fact, who answer alone with evidence of their own. Only departures that could change the decision are settled, against the running system, and each answer has a named owner.</li>
<li><strong>The bill.</strong> In four pieces the meeting needs 134 settlements and almost never decides. Routed to two holders of each fact, the protocol needs under one and adopts 93% of better designs against 10% of worse ones. Probes that lift each person's accuracy to 80%, with the verdict carried as recorded, reach 96% against 3% in the modeled review.</li>
<li><strong>Where you stand.</strong> Set an attention budget before the review, have the machines list what they cannot settle, route each question to the people who hold its fact, and let them add what the list missed. Then watch your departure rate: near zero means your people echo the machine.</li>
</ul>
</div>

<details>
<summary>Notation used in this part</summary>

**Reading**

- {% katex() %}x{% end %} and {% katex() %}f{% end %} - a fact's relative position in a document, from 0 at the start to 1 at the end, and the share of the model's effective context window the document fills
- {% katex() %}r(x, f){% end %} - the probability the model uses a fact at position {% katex() %}x{% end %}, Definition 7
- {% katex() %}\ell{% end %} - the number of overlapping parts a document is read in, each in its own call
- {% katex() %}k{% end %} - the number of instruments from one source, Corollary 2
- use of a document - the share of the gain over answering without it that a reading keeps: (accuracy minus the no-document accuracy) over (the accuracy with only the right document minus the no-document accuracy)

**Combining**

- {% katex() %}q{% end %} and {% katex() %}L = \ln(q/(1-q)){% end %} - a member's precision, the probability their signal is right, and the log-odds one signal carries
- {% katex() %}\pi{% end %} and {% katex() %}L_\pi = \ln(\pi/(1-\pi)){% end %} - the accuracy of a shared input such as a debate's verdict, and its log-odds
- {% katex() %}w{% end %} - the probing weight: the log-odds a member puts on acting on their own signal before following a lead
- {% katex() %}P_{\text{maj}}{% end %} - the probability that the panel's own majority errs
- {% katex() %}A_+{% end %} and {% katex() %}A_-{% end %} - the probability that a review adopts a better design, and a worse one
- verified share - the share of a critic's false flags that people check and remove before the review hears them
- residual - the questions the machines could not settle, routed to the people who hold their facts, Definition 5
- budget - the human attention a decision may spend, fixed before the review, counted in settlements or owner-hours
- departure rate - the share of routed answers that depart from the machines' reference, the health gauge of the Residual Protocol, Definition 5
- {% katex() %}\rho_s{% end %} and {% katex() %}\rho_x{% end %} - the latent correlation of the errors of two instruments from one source, and of two from different model sources, Definition 6

**Energy**

- {% katex() %}n{% end %}, {% katex() %}s{% end %} and {% katex() %}d{% end %} - the reviewers, the chance one of them holds an opinion on a piece, and the chance a holder departs from the machines' reference, Proposition 8; in the first post the same letters named the direction of a dissent and the hand-offs
- {% katex() %}P{% end %} and {% katex() %}\beta{% end %} - the number of pieces a design is reviewed in, and how fast the share of opinion holders grows with it
- {% katex() %}\mu{% end %}, {% katex() %}W{% end %} and {% katex() %}K{% end %} - the mean time one settlement takes, the decision window, and the number of settlements a review needs

**The tags**

- L1 · Bound, L2 · Fit and L3 · Estimate - the tag on each paragraph: a proof or a cited fact, a judgment or approximation the text argues for, and a worked example computed from the model or measured

</details>

<details>
<summary>Results from earlier posts this part uses</summary>

- Definition 1 of [Correct, and Rejected](@/blog/2026-11-14/index.md): a member holds a bounded binary signal, acts in order, and is paid for accuracy, minus conformity, plus reputation over a horizon, with loss aversion and a career position; people and agents differ only in the values.
- Definitions 2 and 3 of [Correct, and Rejected](@/blog/2026-11-14/index.md#def-2): adoption is a spatial test times the probability that the relayed evidence clears the gates' thresholds, and a review's operating point is its pair {% katex() %}(A_+, A_-){% end %}.
- Proposition 1 of [Correct, and Rejected](@/blog/2026-11-14/index.md#prop-1): as the panel grows, the probability that a majority errs tends to {% katex() %}\Phi(\Phi^{-1}(p)/\sqrt{\rho}){% end %}.
- Proposition 2 of [Correct, and Rejected](@/blog/2026-11-14/index.md#prop-2): a member follows a public lead against their own signal once the evidence against that signal exceeds their probing weight; with independent signals of precision {% katex() %}q{% end %}, a long sequence ends in a wrong cascade with probability {% katex() %}(1-q)^2/(1 - 2q(1-q)){% end %}.
- Proposition 3 of [Correct, and Rejected](@/blog/2026-11-14/index.md#prop-3): with Euclidean preferences, some change is preferred by every gate if and only if the status quo lies outside the convex hull of their ideal points.
- Proposition 5 of [Smarter Agents, Fewer Opinions](@/blog/2026-11-21/index.md#prop-5): upgrading every member from error {% katex() %}p_0{% end %} and correlation {% katex() %}\rho_0{% end %} to {% katex() %}p_1{% end %} and {% katex() %}\rho_1{% end %} lowers the large-panel floor exactly when the relative rise in {% katex() %}|\Phi^{-1}(p)|{% end %} exceeds half the relative rise in {% katex() %}\rho{% end %}.
- The hand-off of [Correct, and Rejected](@/blog/2026-11-14/index.md): a relay that keeps a share {% katex() %}a{% end %} of a signal's amplitude keeps {% katex() %}a^2{% end %} of its signal-to-noise ratio.
- The law of triviality of [Correct, and Rejected](@/blog/2026-11-14/index.md): a design reviewed whole passes about three times in four, and split into four simple pieces almost never, because each simple piece draws an opinion from nearly everyone.
- Definitions 1 and 2 of [The Familiarity Bias](@/blog/2026-07-15/index.md): a verifier and the work it checks are same-family when they share pretraining, architecture lineage or alignment closely enough that a bias in one is likely in the other, and a panel draws its variants from several families because "persona framing alone does not decorrelate the underlying model's shared weights".
- Definitions 7 and 8 of [The Shared Ancestor Problem](@/blog/2026-09-06/index.md): a check is valid only to the degree its errors do not share the mechanism that produces the error it checks for, and only if its true-positive rate exceeds its false-positive rate; the layers that can be diversified between a check and its object run from prompt to model weights to training corpus to the ground-truth channel, cheapest first.
- [Smarter Agents, Fewer Opinions](@/blog/2026-11-21/index.md): strong models miss the same hard questions and the strongest share blind spots beyond difficulty, so an average of their votes holds about two independent opinions; blind-spotted agents in an unweighted vote dilute the people who hold a local fact, and by its Proposition 6, in a large panel the agents' shared factor alone sets the chance of adopting a worse design.

</details>

## The Belief: AI Fixes the Meeting

{{ layer(n=2, type="Fit", id="belief-stated") }}The belief has three parts, one per tool. A model with a long context window can hold the whole design at once, so nothing gets lost the way it does when people skim. A mediator can find the statement every group accepts, so the review stops stalling on reconciliation. And a critic tuned to disagree can supply the dissent people withhold for their careers.

{{ layer(n=2, type="Fit", id="belief-what-it-misses") }}In practice the three tools are often one model given three sets of instructions. Each part names a real human failure from the earlier posts. Each also assumes the tool is free of a failure the earlier posts did not test. Reading is assumed to be even across the document. Agreement is assumed to be the goal. And dissent is assumed to add information wherever it comes from. The sections below check each assumption against measurements of the tools and against the review model.

{{ layer(n=2, type="Fit", id="what-an-instrument-must-do") }}The earlier posts already say what a good instrument has to do. It must not add correlated voices, because a panel of strong models holds about two opinions however many vote, the scale Kohli measured for nine frontier judges{{ cite(ref="1", title="Kohli, G. (2026) -- Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels, arXiv:2605.29800") }}. It must not start a cascade, because the first voices in a sequence decide what the rest will say. It must not dilute the people who hold a local fact, because they carry the only information the models lack. And it cannot open a closed gate, because no evidence moves a status quo that already suits every approver. A tool that passes all four tests is an instrument. A tool that fails one is another voter.

## What the First Two Posts Leave

{{ layer(n=2, type="Fit", id="foundation-people") }}The first post followed a design through a review of people and found where its energy went. Fifteen reviewers who learned from the same incidents carry the information of three to five. Two confident voices start a cascade, and everyone after them agrees for free. Splitting a design to make it reviewable invites an opinion from nearly everyone, and every pair of opinions must be reconciled, so the bill grows with the square of the holders. And when the status quo sits inside the gates' priorities, the gates block every change whatever the evidence.

{{ layer(n=2, type="Fit", id="foundation-machines") }}The second post replaced the reviewers with models and kept most of that. The careers went, and with them the reason to stay quiet. The shared blind spots stayed. Strong models miss the same hard questions, an average of their votes holds about two opinions, and twenty agents that share a blind spot set the chance of adopting a worse design whatever the people know. A machine's opinion costs the machine nothing and costs the people who must reconcile it.

{{ layer(n=2, type="Fit", id="foundation-question") }}Together the two posts describe one problem with two budgets. Human energy is scarce, slow and independent. The machine's budget is cheap, fast and correlated. A review spends both, mostly in the wrong places: people reconcile trivia and echoes, and machines are asked for more opinions. This post proposes where to spend each, as a framework a team can run, and computes which part of it to improve first.

{{ layer(n=3, type="Estimate", id="aggregation-spent") }}The first post's levers also have a ceiling, and the model locates it. With all six in place, a better design is adopted 71% of the time and a worse one 7%. Making every reviewer's errors fully independent moves that only to 73% and 4%. Making each reviewer's own judgment right 80% of the time instead of 70%, at the same correlation, moves it to 86% and 2%. Every lever of the first post changes how judgments are combined, carried or gated. None of them adds information, and the ceiling is where combining runs out of it.

{{ layer(n=1, type="Bound", id="complementarity-sources") }}The gains that remain must come from sharper judgments, and research on human and AI teams says where those can come from. Hemmer and four coauthors traced the cases where a team beats both of its members to two sources: information one side holds and the other lacks, and capabilities one side has and the other lacks{{ cite(ref="2", title="Hemmer, P. and four coauthors (2024) -- Complementarity in Human-AI Collaboration: Concept, Sources, and Evidence, arXiv:2404.00029") }}.

{{ layer(n=2, type="Fit", id="residual-named") }}The second post found the first kind in the review. A machine that shares a blind spot adds nothing on the fact it cannot see, and the people who hold that fact are the only source of it. This post calls the facts nobody wrote down the residual, and builds the review around spending people on it.

## From Author to Residual Owner

{{ layer(n=1, type="Bound", id="ironies-measured") }}The reviewer's job is already changing. Simkute and five coauthors traced the productivity losses of generative AI to four causes{{ cite(ref="3", title="Simkute, A., Tankelevitch, L., Kewenig, V., Scott, A.E., Sellen, A. and Rintel, S. (2024) -- Ironies of Generative AI: Understanding and Mitigating Productivity Loss in Human-AI Interaction, International Journal of Human-Computer Interaction") }}. The first is a shift in the user's role from producing work to evaluating it. The others are workflows restructured badly, interruptions, and automation that makes easy tasks easier and hard ones harder. They read these as the ironies of automation that aviation met decades earlier: the more the machine does, the more depends on the person left to check it.

{{ layer(n=1, type="Bound", id="crumple-zone") }}Elish named what happens to responsibility in that role. Studying accidents in automated systems, she found the blame landing on the nearest human operator, who had little real control over the outcome{{ cite(ref="4", title="Elish, M.C. (2019) -- Moral Crumple Zones: Cautionary Tales in Human-Robot Interaction, Engaging Science, Technology, and Society 5") }}. She called that person a moral crumple zone, the part that absorbs the impact so that the system's integrity is protected. A review that adds a human sign-off to a machine's verdict builds one.

{{ layer(n=2, type="Fit", id="rungs") }}Put together, the evidence describes three rungs of responsibility, and the series' results say which one a review should stand on.

| Rung | The person | The machine | How it fails |
| :--- | :--- | :--- | :--- |
| Author | Does the work and reviews it with peers | Assists | The meeting of the first post: echoes, trivia and closed gates |
| Reviewer | Checks the machine's work | Does the work | Capture by whatever is heard first, and blame without control |
| Residual owner | Holds what no text holds, and answers for exactly that | Does what can be written down, and says what it cannot settle | The subject of this post |

{{ layer(n=2, type="Fit", id="rungs-direction") }}Most teams are moving from the first rung to the second, and the second is the trap the ironies describe. The meta-analysis of Vaccaro, Almaatouq and Malone, discussed under Step 5, finds that on decision tasks the average human and AI combination does worse than the better of the two alone. The third rung is where the series points. Responsibility moves to what only a person can supply, and each person answers for what they actually decided. The framework below is the protocol for that rung.

## The Residual Protocol: Machines Carry What Can Be Written

{{ layer(n=2, type="Fit", id="rp-thesis") }}The framework this post proposes is called the Residual Protocol, and its idea fits in one line: machines carry what can be written, and people own what cannot. The machines are cheap, fast and correlated, so they take everything a document, a test or the running system can settle. What they cannot settle is the residual. People are scarce, slow and independent. Each of them answers only the part of the residual they hold, alone and with evidence of their own, and answers for it. Human attention is a budget, set before the review starts and spent only where people can see what the machines cannot.

<span id="def-5"></span>
<details>
<summary>Definition 5 -- Residual Protocol: machines settle what can be written, and a fixed human budget goes to the questions they cannot settle, routed to the people who hold them</summary>

**Definition 5** (Residual Protocol). *A review is run under the Residual Protocol when it takes seven steps in order.*

- *(1) Budget: it fixes the human attention the decision may spend before the review starts.*
- *(2) Exhaust: the machines read the design in parts and check what they can against the running system. They find the nearest version every approver prefers to the status quo, and list the questions they cannot settle, counted by source.*
- *(3) Route: each listed question, and any question a person adds, goes only to the people who hold its fact, within the budget.*
- *(4) Probe: each holder gets grounded evidence of their own and records an answer before hearing the machines or anyone else.*
- *(5) Diff: answers that agree with the machines' reference close without discussion. Each departure that could change the decision is settled against the design or the running system.*
- *(6) Carry: the decision reaches the approvers with its margin and its dissent as recorded.*
- *(7) Own: every answer has a named owner, and the record keeps each departure and the outcome observed afterward.*

*Its* residual *is the set of questions routed to people, and its* departure rate *is the share of their answers that depart from the reference.*

</details>

{{ layer(n=2, type="Fit", id="rp-estimator") }}The design follows from the series' results, and it has a precise shape in estimation theory. The machines' reference is a prediction, and people's answers are measurements. The departures are what a filter calls the innovation, the only part of a measurement that carries information the prediction lacked. A filter keeps its measurements independent of its prediction, or it learns from its own echo, which is why answers are recorded before the reference is heard. It spends its measurements where the prediction is uncertain, which is why questions are routed. It updates only on the innovation, which is why only departures are settled. And it stays observable, which is why every departure and its outcome are recorded.

| Step | What happens | Budget | Failure signal | Series basis |
| :--- | :--- | :--- | :--- | :--- |
| 1. Budget | Fix the human attention before the review starts | Human, fixed | Review time set by whoever attends | The energy result of Step 5 |
| 2. Exhaust | Read in parts, check against the system, find the version every approver accepts, list what cannot be settled | Machine | Ten prompts counted as ten opinions; a design no change can pass | Proposition 3; Definitions 6 and 7, Corollary 2 |
| 3. Route | Each question goes only to the holders of its fact, and holders may add questions | Human, linear | Everyone reviews everything | The second post's informed minority |
| 4. Probe | Each holder answers alone, with evidence of their own | Human, fixed per question | Answers cluster on whatever was heard first | Proposition 7, Definition 8, Corollary 3 |
| 5. Diff | Agreement closes; departures that could change the decision are settled against reality | Human, linear | Every pair reconciled; flags nobody checked | Proposition 8 |
| 6. Carry | The decision reaches the approvers as recorded | None | A verdict weakened in relay | The first post's hand-off |
| 7. Own | Named owners; every departure and its outcome recorded | Human, small | Blame without control; an organization that learns its own stories | Proposition 4 |

{{ layer(n=2, type="Fit", id="rp-prior-art") }}Each step has neighbours, and the combination does not. Recording answers before anyone is heard is the silent writing of the nominal group technique and the simultaneous reveal of planning poker. Settling only the departures that could change the decision is the value of information applied to a meeting. Routing questions to the people who can answer them, within a fixed capacity, is what learning-to-defer research does for a classifier and a pool of experts. Spending people where they depart from the machines inverts query by committee, which spends them where models disagree with each other. The second post showed that trigger fails exactly where models share a blind spot. A fixed attention budget borrows the error budget of reliability engineering, where an overrun changes what gets built rather than how hard people work. None of them has the accounting this post supplies. Step 5 proves that a diff costs a review linearly where a meeting costs it quadratically. Step 4 maps where accuracy and correlation move a review once combining has run out. And the departure rate tells a team when its people have started to echo the machine.

## Step 1: Budget

{{ layer(n=2, type="Fit", id="budget-why") }}The first step sets the scarce budget before anything spends it. A review with no budget spends whatever its attendees bring, and the first post found where that goes: into trivia every pair must reconcile, and into echoes that cost nothing to repeat. The Residual Protocol fixes the human attention a decision may use, in owner-hours. An overrun is read as a fault in the machines' exhaust step, never as a reason for another meeting.

{{ layer(n=2, type="Fit", id="budget-unit") }}The unit is the one the first post used, a settlement: one owner reconciling one disagreement inside the decision window. Step 5 proves the shape that makes a budget possible. A meeting's settlements grow with the square of its opinion holders, so no fixed budget survives a design split into pieces. The protocol's settlements grow with the number of routed answers that depart. Its budget can be set from the number of questions and the holders each one needs.

{{ layer(n=3, type="Estimate", id="budget-numbers") }}The model puts sizes on it. Reviewed in four pieces, the meeting needs 134 settlements in expectation, 34 owner-weeks against a 13-week window, and almost never decides. The protocol with two holders of the fact on each piece needs 0.8 settlements, a fifth of an owner-week, and adopts a better design 93% of the time.

## Step 2: Exhaust

{{ layer(n=2, type="Fit", id="exhaust-why") }}The machines' budget is cheap, so the second step spends it first and spends it fully. It has three jobs. It checks whether any version of the design can pass every approver, because nothing else matters while none can. It reads the design and checks it against the running system, so that whatever can be settled without people is settled. And it lists what it could not settle, which is the work it hands to people.

{{ layer(n=1, type="Bound", id="gates-first-still") }}None of the instruments touches the gates. Proposition 3 of the first post says that while the status quo sits inside the gates' hull, no change improves on it for every gate, and no evidence changes that. A better reading, a better mediator and a better debate all improve the evidence. They are worth nothing while the spatial test is at zero. [The Constraint Sequence Framework](@/blog/2025-12-27/index.md) orders constraints by which binds first, and the gates still bind first.

{{ layer(n=2, type="Fit", id="amend-why") }}Where some change can pass, the machines can find the nearest one. The approvers' stated priorities place their ideal points. The changes every approver prefers to the status quo form a region, and the version of a design nearest to it inside that region is a projection a solver computes quickly. That turns a stalled negotiation into a stated trade: here is what the design must give up to pass.

{{ layer(n=3, type="Estimate", id="amend-numbers") }}The first post's late-arriving approvers give the sizes. With one approver added late, the running design passes as it stands 57% of the time, and an amended version exists 98% of the time. The amendment keeps a median 57% of the design's advance over the status quo. With four approvers added late, the design passes as it stands 10% of the time and an amendment exists 86% of the time, keeping a median 39% of the advance.

{{ layer(n=2, type="Fit", id="amend-meaning") }}An amendment is a price list. It shows how much of a design the gates will let through, and that number is often the most useful thing a stalled review can learn. Whether to pay it is the owners' decision, and the protocol carries the price to them with the rest of the record.

{{ layer(n=2, type="Fit", id="exhaust-reading") }}Two results set how to spend the machines' reading. Instruments from one source are one instrument, however many roles they play. And a model reads a long design unevenly.

{{ layer(n=1, type="Bound", id="roles-in-practice") }}The instruments of this post are usually built the cheap way. One model is given a system prompt that makes it a skeptical reviewer, another that makes it an advocate, a third that makes it a critic. Their outputs are then treated as several opinions. The blog has met this before. [The Familiarity Bias](@/blog/2026-07-15/index.md) defined same-family judging as a structural amplifier of whatever bias already exists. Its panels drew their variants from several model families, because "persona framing alone does not decorrelate the underlying model's shared weights". [The Shared Ancestor Problem](@/blog/2026-09-06/index.md) turned that into a rule: a check is only as honest as the mistake it cannot inherit. Its Definition 8 ordered the layers that can be diversified, from prompt to weights to training corpus to the ground-truth channel, the cheapest first and the weakest first.

{{ layer(n=1, type="Bound", id="personas-measured") }}Outside measurements agree. Panickssery, Bowman and Feng found that a model judging text prefers its own, in proportion to how well it recognizes its own writing{{ cite(ref="5", title="Panickssery, A., Bowman, S.R. and Feng, S. (2024) -- LLM Evaluators Recognize and Favor Their Own Generations, NeurIPS 2024") }}. A critic from the family that wrote a design is the weakest check on it.

{{ layer(n=1, type="Bound", id="sources-measured") }}The size of the shared error has been measured too. The second post reported judges whose errors correlated at 0.36 to 0.39 between two runs of one model, and at 0.42 between frontier judges of different providers. Changing the provider did not decorrelate them. [The Familiarity Bias](@/blog/2026-07-15/index.md) said why: cross-family is not cross-corpus, and models trained on overlapping text share blind spots whoever built them.
<span id="def-6"></span>
<details>
<summary>Definition 6 -- Instrument Source: instruments built from one model err together, however they are prompted</summary>

**Definition 6** (Instrument Source). *Every instrument has a source: a model family, however it is prompted, or a check against a ground-truth channel such as tests, telemetry, static analysis or the running system, whether a person or an agent runs it. The errors of two instruments from one source share a latent factor with correlation {% katex() %}\rho_s{% end %}; two instruments from different model sources share one with correlation {% katex() %}\rho_x \le \rho_s{% end %}; an instrument grounded in such a check errs through the check's coverage, independently of the models' shared factor. Each instrument keeps its own accuracy. Members weigh every instrument by that accuracy, as if the instruments were independent.*

where:

- {% katex() %}\rho_s{% end %} - within one source; a prompt changes the role and leaves the weights, so roles of one model share it
- {% katex() %}\rho_x{% end %} - across model sources, which share training text even when their weights differ

</details>

<span id="cor-2"></span>
<details>
<summary>Corollary 2 -- The Floor of One Source: roles of one model, heard first, err at Proposition 1's floor however many there are</summary>

**Corollary 2** (The Floor of One Source). *Let {% katex() %}k{% end %} instruments from one source, each right with probability {% katex() %}\pi > 1/2{% end %} and correlated at {% katex() %}\rho_s \in (0, 1){% end %}, be heard first and weighed equally. As {% katex() %}k{% end %} grows, the probability that their combined verdict is wrong tends to*

{% katex(block=true) %}
\Phi\big(\Phi^{-1}(1 - \pi)/\sqrt{\rho_s}\big),
{% end %}

*the floor of Proposition 1 at an error of {% katex() %}1 - \pi{% end %}. When their combined log-odds exceed one member's by more than the probing weight, the review's verdict is their verdict. No number of roles moves the limit; only a lower {% katex() %}\rho_s{% end %}, which needs a deeper layer than the prompt, or an instrument from another source does.*

*Proof.* Weighed equally, the members' summed log-odds has the sign of the majority of the {% katex() %}k{% end %} verdicts. The verdicts are {% katex() %}k{% end %} binary signals with common error {% katex() %}1 - \pi{% end %} sharing one latent factor at {% katex() %}\rho_s{% end %}, which is the setting of Proposition 1, so the probability that their majority errs tends to its floor. Under the stated condition the combined lead outweighs every member's own signal by more than the probing weight, so every member follows it, by the rule of Proposition 2 of the first post, and the review's verdict is the instruments'. The floor depends on {% katex() %}\pi{% end %} and {% katex() %}\rho_s{% end %} alone, not on {% katex() %}k{% end %}. ∎

</details>

{{ layer(n=3, type="Estimate", id="roles-numbers") }}The limit arrives quickly. Take roles of one model, each right 75% of the time. If their errors were independent, nine roles together would be wrong 5% of the time and forty-one almost never. A latent correlation of 0.6 matches the measured judge correlations. At that level nine roles are wrong 20% of the time and forty-one also 20%, against a floor of 19% and a single role's 25%. At 0.9, forty-one roles are wrong 24% of the time: the forty extra prompts bought one point.

{{ layer(n=3, type="Estimate", id="roles-in-the-review") }}In the review, a stack of shared instruments mostly lets worse designs through. The leading combination of the region, the reader in parts, the debate first and the verified critic, adopts a worse design 2% of the time when its instruments are independent. With all three from one model at a latent correlation of 0.6, it adopts one 4.5% of the time, and at 0.9, 6.4%. Instruments from separate providers whose errors correlate at 0.6, about the level measured between frontier judges of different providers, also adopt one 4.5% of the time. They do no better than one model at 0.6. Adoption of better designs barely moves, between 92% and 94% throughout. The stack is overconfident exactly when its shared blind spot points the wrong way.

{{ layer(n=3, type="Estimate", id="verified-critic-survives") }}One instrument keeps its full value whatever its source: the verified critic. Heard alone, it lifts adoption of a better design to 94% while a worse one stays near 14% to 15%, in every condition tried. Its value comes from the people who check its flags against the design, the ground-truth layer of the Shared Ancestor ordering. Nothing about the critic's source reaches that layer. The stack's rise in worse designs therefore comes from the instruments the review hears unverified. The reader and the debate still carry the shared source to the vote.
{{ layer(n=2, type="Fit", id="roles-rule") }}The rule that follows is about sources, not prompts. Count instruments by source, never by role. A second role of the same model adds a voice and almost no evidence. A second provider adds less than its name suggests, because models trained on overlapping text err together. What adds evidence is a channel the model does not have. People check flags against the design, debaters run the code, and someone verifies the reader's report against the system. That is the Shared Ancestor ordering applied to a review: diversify the deepest layer the budget allows, and treat everything above it as one instrument.

{{ layer(n=2, type="Fit", id="agent-review-instruments") }}The second post ended with a review held entirely by agents: no career pressure, the same hard questions missed together, the strongest sharing blind spots, and about two independent opinions however many voted. The instruments change that review less than they change a human one. A reader, a mediator and a debate built from the same models share the panel's blind spots, so a debate between two of them is one more correlated voice, not an outside one. Proposition 7 still applies, and an agent debate captures an agent panel as readily as a human one. But the debate's accuracy and the panel's majority now fail on the same questions, so the capture rarely moves the verdict where it matters.

{{ layer(n=2, type="Fit", id="agent-review-what-helps") }}Two instruments keep their value in an agent review. The verified critic keeps it because its verification is done by people, who fail on different questions than the models. And pooling by record keeps it because a record measured question by question tells the review which members fail where, which is exactly the second post's within-difficulty test turned into a weight. Everything else in the region rests on an independence the agent review does not have. An organization that runs reviews held by agents should spend its people on the two places where people's errors differ from the models': checking the flags, and holding the facts no model was trained on.

{{ layer(n=1, type="Bound", id="lost-in-the-middle") }}Coverage rests on a measurable claim: that a model uses everything in its context. Liu and six coauthors tested it by placing the answer to a question at different positions in a long input{{ cite(ref="6", title="Liu, N.F. and coauthors (2024) -- Lost in the Middle: How Language Models Use Long Contexts, Transactions of the ACL 12") }}. Accuracy was highest when the relevant passage sat at the beginning or the end of the input. It fell when the passage sat in the middle. The curve was U-shaped, and it held for models built for long contexts.

{{ layer(n=1, type="Bound", id="bias-near-the-window") }}The shape changes as the input grows. Veseli and three coauthors measured how the position effect moves as inputs approach the limit of the context window{{ cite(ref="7", title="Veseli, B., Chibane, J., Toneva, M. and Koller, A. (2025) -- Positional Biases Shift as Inputs Approach Context Window Limits, COLM 2025") }}. The middle dip is strongest while the input fills up to about half the window. Past that, the advantage of the beginning weakens, while the advantage of the end stays. A long design document read near the edge of the window is read mostly from its end.

{{ layer(n=1, type="Bound", id="effective-window") }}The window itself is smaller than advertised, and smaller still when the fact does not repeat the question's words. Modarressi and six coauthors tested thirteen models that claim at least 128,000 tokens, on questions whose answer shares almost no wording with them, so the model has to make the link itself{{ cite(ref="8", title="Modarressi, A. and six coauthors (2025) -- NoLiMa: Long-Context Evaluation Beyond Literal Matching, ICML 2025") }}. At 32,000 tokens, eleven of the thirteen fell below half of their short-input score, and even GPT-4o dropped from 99.3% to 69.7%. A design that fits inside a model's advertised window can still fill most of its effective one, and the fact that decides a design rarely uses the words of the question that needs it.

<span id="def-7"></span>
<details>
<summary>Definition 7 -- Positional Recall: the probability a model uses a fact, by the fact's position and how much of the effective window the document fills</summary>

**Definition 7** (Positional Recall). *A model reading a document that fills a share {% katex() %}f{% end %} of its effective context window uses a fact at relative position {% katex() %}x \in [0, 1]{% end %} with probability*

{% katex(block=true) %}
r(x, f) = r_0 - D f \,\Big(1 - h(f)\, e^{-x/\omega} - e^{-(1-x)/\omega}\Big)
{% end %}

*clipped to {% katex() %}[0, 1]{% end %}, where {% katex() %}h(f) = 1{% end %} for {% katex() %}f \le 1/2{% end %} and falls linearly to 0 at {% katex() %}f = 1{% end %}. A document read in {% katex() %}\ell{% end %} overlapping parts is read in {% katex() %}\ell{% end %} separate calls, each covering {% katex() %}1.25/\ell{% end %} of it at fill {% katex() %}1.25 f/\ell{% end %}. The parts are evenly spaced from the start of the document to its end, and each call is independent, so a fact covered by several parts is used unless every part that holds it misses it. A local fact sits at one position. A relational fact sits at two, and a part uses it only if it holds both, with the product of their recalls.*

where:

- {% katex() %}r_0{% end %} - the recall of a fact in a short document, 0.9
- {% katex() %}D{% end %} - the depth of the dip at a full window, swept from 0.2 to 0.4
- {% katex() %}\omega{% end %} - how far the advantage of each end reaches into the document, 0.1
- {% katex() %}h(f){% end %} - the weight of the beginning, which fades as the document approaches the window

</details>

{{ layer(n=2, type="Fit", id="reading-is-a-handoff") }}The definition reads a model as one more hand-off in the pipeline. The earlier post gave each layer of summaries a candor, the share of the signal it keeps. A model reading a long document is a relay whose candor depends on where the signal sits. Facts near the ends keep most of their strength. Facts in the middle keep less, and near the edge of the window the beginning fades too. The shape follows the published measurements. Its constants are a stated choice, swept rather than fitted.

{{ layer(n=3, type="Estimate", id="local-facts") }}Take a design whose decisive fact sits in one place, such as a failover rule that only holds for one region. Under the stated shape of Definition 7, not a measurement, read whole when the document fills a quarter of the window, the model uses that fact 84% of the time. At half the window it uses it 78% of the time, and at a full window 63%. Read in four overlapping parts, each in its own call, the same document gives 91%, 89% and 85%. The parts keep each fact near an end of some call and far from the window's limit.

{{ layer(n=3, type="Estimate", id="relational-facts") }}A fact that needs two passages read together behaves the other way. Suppose the failover rule matters only because of a retry limit stated forty pages later. Read whole at a quarter of the window, the model connects the two 71% of the time. In four parts it does so 29% of the time, and in eight parts 15%, because the two passages rarely land in the same call. Near a full window the whole document manages only 40%, and no number of parts does much better.

{{ layer(n=2, type="Fit", id="robust-reading") }}Both directions survive the sweep of the stated shape. With the middle dip at depths from 0.2 to 0.4, parts raise the use of a local fact at every fill tried. Eight parts cut the use of a relational fact to between 14% and 15% at every fill. The size of the gain from parts depends on the depth of the dip. Its sign does not. The calibration below replaces the stated shape with curves fitted to measured models, and one of the two directions survives in a weaker form.

<div style="margin:1.5em 0;">
<canvas id="chart-reading" role="img" aria-label="The chance a model uses the decisive fact of a design document that fills its context window, read whole or in 2, 4 or 8 overlapping parts. A fact in one place: 63%, 79%, 85%, 89%. A fact that needs two distant passages: 40%, 42%, 25%, 14%." style="width:100%;height:320px;display:block;"></canvas>
<figcaption>Split the reading, not the design. Read in more parts, a model uses a fact in one place more often, 63% whole and 89% in eight parts, and a fact that spans two distant passages less often, 40% and 14%, because the two passages rarely land in the same part. The same holds at every document length and recall curve tried.</figcaption>
<script>
(function(){var S={"id":"chart-reading","h":320,"ml":[40,48],"mr":[110,170],"mt":24,"mb":42,"els":[{"t":"line","pts":[[1,0.6302],[2,0.7915],[3,0.8544],[4,0.8885]],"c":"b","w":2.5,"mk":3.5},{"t":"line","pts":[[1,0.3974],[2,0.4158],[3,0.253],[4,0.1415]],"c":"a","w":2.5,"mk":3.5},{"t":"txt","x":4,"y":0.8885,"s":"a fact in one place","n":"one place","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":4,"y":0.1415,"s":"a fact across two passages","n":"two passages","al":"left","bl":"middle","dx":8,"c":"a","b":true}],"X":{"lo":0.7,"hi":4.3,"ticks":[[1,"whole"],[2,"2 parts"],[3,"4 parts"],[4,"8 parts"]],"title":"how the document is read, each part in its own call","ntitle":"read in"},"Y":{"lo":0.0,"hi":1.0,"ticks":[[0.0,"0%"],[0.25,"25%"],[0.5,"50%"],[0.75,"75%"],[1.0,"100%"]],"title":"chance the model uses the decisive fact","ntitle":"fact used"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=2, type="Fit", id="opposite-partitions") }}This result meets the law of triviality from the other side. People review a design best whole: split into simple pieces, it draws an opinion from everyone on every piece and almost never passes. A model reviews local facts best in parts, and loses relational facts in parts. So people and models need opposite partitions of the same design. The review should split the reading, not the design. The model reads in parts and reports where each local fact sits. People hold the whole, and spend their attention on the relational core, which no reading recovers well.

{{ layer(n=2, type="Fit", id="cost-of-whole") }}The cost argument points the same way. Reading the whole design in one call is the expensive option per call, and it is the option that uses the middle least. Reading in parts costs a quarter more tokens at the stated overlap, and buys the local facts back. The relational questions are where the cost of a person's attention is best spent, because no arrangement of calls answers them reliably.

{{ layer(n=2, type="Fit", id="why-calibrate") }}Definition 7 so far carries constants chosen to follow the shape of the published curves. The first post checked its reviewers against peer-review experiments, and the second measured its agents on public benchmark data. The reader deserves the same treatment. Liu and coauthors printed, for six models, the accuracy of answers when the document holding the answer sat at each of several positions among 10, 20 or 30 documents{{ cite(ref="6", title="Liu, N.F. and coauthors (2024) -- Lost in the Middle: How Language Models Use Long Contexts, Transactions of the ACL 12") }}. They also printed two baselines for each model: its accuracy with no documents at all, and its accuracy when handed only the right one.

{{ layer(n=2, type="Fit", id="use-of-a-document") }}Those baselines turn an accuracy into a use. A model answering without documents already gets some questions right from what it learned in training. A model handed only the right document shows the most the document can add. The use of a document at a given position is the share of that gain the reading keeps: the accuracy above the no-document baseline, divided by the gain the right document alone gives. A reading that keeps the whole gain uses the document fully. A reading that falls below the no-document baseline uses nothing, and is counted as zero.

{{ layer(n=3, type="Estimate", id="measured-use") }}The measured curves are less forgiving than the stated shape. With 20 documents, GPT-3.5-Turbo keeps 61% of the gain when the answer sits first, 22% when it sits last, and nothing in the middle. There its accuracy falls below answering with no documents at all. Claude-1.3 keeps 42% at either end and 27% in the middle. MPT-30B-Instruct keeps between 40% and 49% everywhere, with almost no dip, at a lower level. The six models span every shape from a deep, lopsided trough to a nearly flat line.

{{ layer(n=3, type="Estimate", id="fitted-curves") }}Definition 7 fits all of them once the beginning and the end each get a free weight. The root-mean-square error of the fit stays below 0.04 for every model at 20 and 30 documents. The fitted parameters are not separately identified: a higher base with a deeper dip fits about as well as a lower base with a shallower one. The fitted curve is identified, and it is what the reading results use.

{{ layer(n=3, type="Estimate", id="calibrated-local") }}Under the fitted curves, reading in parts still helps a local fact, and by more than the stated shape suggested. Read whole, the six models use a local fact between 6% and 44% of the time. Read in four overlapping parts, between 46% and 76% of the time. GPT-3.5-Turbo with 30 documents goes from 6% to 74%, because its middle is close to empty and the parts move every fact near the end of some call.

{{ layer(n=3, type="Estimate", id="calibrated-relational") }}A relational fact fares badly in every arrangement. Whole, the fitted models use one between 0.4% and 19% of the time. For some models parts raise it a little: GPT-3.5-Turbo from near zero to 18% in four parts, LongChat-13B from 15% to 19%. For others parts lower it: MPT-30B-Instruct falls from 15% whole to 4% in eight parts. No arrangement of calls makes any measured model reliable on a fact that needs two distant passages read together.

{{ layer(n=2, type="Fit", id="calibration-revises") }}The calibration therefore revises one claim and strengthens the other. Parts help local facts for every measured model, and the stated shape understated the gain. The claim that parts lose relational facts holds only for some models; the stronger claim is that relational facts are lost either way. The prediction for parts also extrapolates each fitted curve to shorter inputs, by Definition 7's rule that the dip shrinks with the fill. The data support that rule for GPT-3.5-Turbo, whose dip deepens from 10 to 30 documents, and barely constrain it for the others. Two nearly identical measured curves for Claude-1.3 extrapolate to 46% and 66% for four parts. The size of the gain from parts is loosely pinned. Its direction holds for every model.

{{ layer(n=2, type="Fit", id="calibration-limits") }}Two limits stay in view. The measured models are from 2023, and newer models are better at long inputs, so the levels here are not a forecast for any current model. The position effect itself has persisted in every later study cited above, which is why the shape, not the level, carries the argument. And multi-document question answering is an analogue of reading a design, as peer review was an analogue of design review in the first post; that transfer is a Fit.

{{ layer(n=2, type="Fit", id="grounded-instruments") }}The distinction that matters is between two kinds of instrument. An opinion instrument answers from what its weights remember: a reviewer persona, an advocate, a critic reading the design as text. It inherits the model's blind spots, and Corollary 2 counts it with every other role of that model. A grounded instrument answers from a check it runs: a test suite, a telemetry query, a static analyzer, a formal model of the protocol. An agent may run it, and the model may read the result, but what the instrument reports comes from the system rather than from the weights. That changes both numbers at once. It can be more accurate than any opinion about the same question, and its errors follow the check's coverage instead of the model's shared factor. A new prompt changes neither.

{{ layer(n=3, type="Estimate", id="debate-with-evidence") }}A debate is worth more when its debaters can reach evidence the room cannot, which is what Khan and coauthors' debaters had. Take the review with a reader and an unverified critic from one model. A debate that is a fourth role of the same model leaves a gap between better and worse designs of 0.82 to 0.85, falling as the correlation rises. Suppose instead the debaters can run the tests or read the telemetry, so the debate is right 90% of the time and independent of the model's blind spots. Then the gap is 0.85 to 0.89, three to four points wider at every correlation.

{{ layer(n=2, type="Fit", id="exhaust-list") }}The last job is the list. For each question the machines could not settle, it names why, who is likely to know, what evidence would settle it, and whether the answer could change the decision. The list is the machines' view of the residual, and Step 3 decides who answers it. For the integrator it adds a map the parts cannot give: which interfaces, shared state and invariants tie distant parts together, so the relational questions arrive named rather than hoped for.

## Step 3: Route

{{ layer(n=2, type="Fit", id="route-why") }}Routing spends human attention where the residual needs it, and only there. The second post's intervention said it for one question: when a decision turns on a local fact, let the people who hold the fact decide. The protocol applies that to every listed question. Each goes to the few people who hold its fact, such as the engineer who handled the outage or the team that owns the caller, and to nobody else.

{{ layer(n=3, type="Estimate", id="route-numbers") }}Routing is only as good as the choice of holders. In four pieces, two routed holders of each piece's fact adopt a better design 93% of the time and a worse one 10%, for 0.8 settlements. The unrouted protocol, with everyone who holds an opinion answering, adopts 79% and 9% for 3.4 settlements. Two holders chosen at random adopt a worse design 34% of the time, because they rarely know the fact. Routing to the wrong people saves energy by spending the decision.

{{ layer(n=3, type="Estimate", id="route-eyes") }}Fewer eyes also cost something at the far end. Split into eight pieces, the routed review still adopts better designs 86% of the time for 1.6 settlements, where the unrouted protocol adopts 52% for 11.4. It adopts a worse design 9% of the time against 6%, because more people looking at each piece catch a little more. The budget buys that difference or declines it, and the protocol makes the choice explicit.

{{ layer(n=2, type="Fit", id="blind-list") }}The list has a weakness the second post predicts. A machine that shares a blind spot does not know it has one. Its doubt about a piece is no evidence that the piece hides the fact it cannot see, so the flawed piece is no more likely to be listed than a sound one. A protocol that routes only what the machines list routes the residual they can imagine. The facts nobody wrote down are exactly the ones they cannot.

{{ layer(n=3, type="Estimate", id="blind-numbers") }}The model separates the two sources of questions. With the flaw a local fact the machines cannot see, machines that list half the pieces at random leave a worse design adopted 54% of the time. People who hold the fact and add it when the list missed it, three times in four, bring that to 33% with no machine list at all. Only listing every piece reaches 10%, at twice the settlements of listing half. The machines' list decides how much the review spends. People adding what the list missed is what keeps a blind spot from deciding the review.

{{ layer(n=2, type="Fit", id="route-rule") }}So routing has two inputs and one rule. The machines' list goes to the holders it names. Every holder may add a question the list missed, and an added question is routed like any other. A protocol that forbids additions inherits the machines' blind spots in full.

{{ layer(n=2, type="Fit", id="route-who") }}Someone has to name the holders, and the protocol names them from the record rather than from the room. The record says who owns the code a question touches, who was on call for the incidents it resembles, and who answered the last question like it. A fact nobody knows they hold is the hardest case. The open list catches some of it, because a person reading a question may recognize a fact they never thought mattered, and the integrator catches some more. Neither catches the question nobody asks. That is why prediction F23 judges the protocol by the facts that decided outcomes, not by the questions it chose to ask. Two holders help only when their mistakes differ. The first post's correlation applies to people too, and two engineers who lived through the same outage share its lessons and its blind spots. The protocol prefers holders who saw the system from different places: the team that owns the caller and the team that owns the callee, the on-call engineer and the author.

## Step 4: Probe

{{ layer(n=2, type="Fit", id="probe-why") }}Probing protects the one thing people bring, and then tries to sharpen it. Whatever is heard first, a confident colleague, a debate or a summary, takes the decision for every person it outweighs. The review then loses the independent answers it routed questions to collect. The results below say when that capture happens and what it costs. They also say why a mediator that pools answers recorded alone keeps them independent, while one that carries conclusions does not. The section ends with the lever left once combining runs out: making each answer more accurate without making the answers alike.

{{ layer(n=1, type="Bound", id="debate-measured") }}Independence is lost to whatever speaks first, and the tools built to speak first supply dissent, as a two-sided debate, a single advocate or a critic. The cleanest measurement of them comes from debate. Khan and coauthors had two models argue opposite answers to a reading question, while a judge without access to the text decided{{ cite(ref="9", title="Khan, A. and coauthors (2024) -- Debating with More Persuasive LLMs Leads to More Truthful Answers, ICML 2024") }}. Human judges reached 88% accuracy with debate, against 60% with no help. With a single model arguing one side, called consultancy, they reached 78%. And as the consultant became more persuasive, the judges became less accurate, while more persuasive debaters made them more accurate. The debaters could read the passage and the judges could not. What the debate gave the judges was access to evidence they lacked, which is a different thing from two independent minds.

{{ layer(n=2, type="Fit", id="debate-in-the-model") }}The review model holds both settings. A single advocate is the first post's champion, an argument for the design heard first whatever its merit, made more or less persuasive by the lead it gives. A two-sided debate is a shared input every member hears before voting: a verdict for one side that is right with some accuracy. Each member treats the verdict as one more piece of evidence, weighted by its log-odds, and decides by the rule of the first post.

<span id="prop-7"></span>
<details>
<summary>Proposition 7 -- The Captured Panel: a shared input more accurate than one member's judgment, heard first, becomes the panel's only opinion</summary>

**Proposition 7** (The Captured Panel). *Let each member hold a binary signal of precision {% katex() %}q > 1/2{% end %}, carrying log-odds {% katex() %}L = \ln(q/(1-q)){% end %}, and act by the rule of Proposition 2 with probing weight {% katex() %}w \ge 0{% end %}, treating every input as independent evidence. Let every member hear, before acting, a shared verdict of accuracy {% katex() %}\pi > 1/2{% end %}, carrying {% katex() %}L_\pi = \ln(\pi/(1-\pi)){% end %}.*

*(i) If {% katex() %}L_\pi - L > w{% end %}, every member acts on the verdict whatever their own signal, in any order and in a blind vote alike. The panel's verdict is the shared verdict, and its accuracy is {% katex() %}\pi{% end %} however many members it has.*

*(ii) Under (i), hearing the verdict first lowers the accuracy of a panel whose own majority errs with probability {% katex() %}P_{\text{maj}}{% end %} if and only if {% katex() %}\pi < 1 - P_{\text{maj}}{% end %}.*

*Proof.* (i) By the rule of Proposition 2, a member facing public evidence of {% katex() %}\Lambda{% end %} log-odds for one side acts against a contrary signal when {% katex() %}\Lambda - L > w{% end %}, and acts with an agreeing signal in any case. Before anyone acts, the public evidence is the verdict's, {% katex() %}\Lambda = L_\pi{% end %}, so under {% katex() %}L_\pi - L > w{% end %} every member acts with the verdict. In a sequence, an action taken under that condition reveals nothing about the member's signal, so the public evidence stays {% katex() %}L_\pi{% end %} for every later member, and the same holds for each of them. In a blind vote each member faces only the verdict. Either way every action agrees with the verdict, so the panel's verdict is the shared verdict, right with probability {% katex() %}\pi{% end %}. (ii) Without the verdict the panel's majority is right with probability {% katex() %}1 - P_{\text{maj}}{% end %}; with it, by (i), with probability {% katex() %}\pi{% end %}. ∎

</details>

{{ layer(n=2, type="Fit", id="capture-band") }}The proposition draws a band. A shared input captures the panel once it is more accurate than one member, and it helps only if it is also more accurate than the panel's majority. Between those two accuracies, hearing it first makes the panel worse. In the running case members are right 70% of the time, and fifteen of them, correlated at 0.25, err as a majority 17.9% of the time. Any debate whose accuracy lies between 70% and about 82% captures that panel and lowers its accuracy. Fifteen opinions become one, and the one is worse than the fifteen were. The comparison holds whatever the dependence between the input's errors and the panel's, because a captured panel's verdict is the input's verdict, and its accuracy is the input's own.

{{ layer(n=3, type="Estimate", id="band-worked") }}The band is easy to compute for any panel. A member right 70% of the time carries log-odds of {% katex() %}\ln(0.7/0.3) \approx 0.85{% end %}. A debate right 75% of the time carries {% katex() %}\ln(0.75/0.25) \approx 1.10{% end %}, more than one member, so with no probing weight it captures the panel. The panel's own majority, fifteen members correlated at 0.25, is right 82.1% of the time, so the captured panel loses about seven points of accuracy. A debate right 90% of the time carries 2.20 and also captures, and the panel gains about eight points. The same proposition, the same capture, opposite verdicts, decided entirely by where the debate's accuracy falls against the majority's.

{{ layer(n=2, type="Fit", id="band-and-probing") }}The probing weight moves the lower edge of the band. Members who put weight on informing those after them, the effect the first post measured in people, need a stronger input before they follow it. With a probing weight of one signal, a debate must carry more than two signals of log-odds, an accuracy above about 84% at this precision, before it captures anyone. Tuning a model to stop agreeing raises the same weight in an agent panel. A panel that resists capture loses less to a mediocre debate and gains less from an excellent one.

<div style="margin:1.5em 0;">
<canvas id="chart-capture" role="img" aria-label="How often a review of 15 members, each right 70% of the time with errors correlated at 0.25, is right, against how often an AI verdict is right. Heard first, the verdict is ignored up to 70%, where the review is right 82.1% of the time; above it every member follows the verdict and the review is right exactly as often as the verdict, which is worse than the room between 70% and 82.1%. With answers recorded first the review stays at 82.1% whatever the verdict." style="width:100%;height:230px;display:block;"></canvas>
<figcaption>Who speaks first (Proposition 7). Heard first, an AI verdict is ignored until it is surer than one reviewer, then everyone copies it, and the review becomes exactly as good as the AI: worse than the room between 70% and 82.1%, better above. With answers recorded first, the room keeps its 82.1% whatever the AI.</figcaption>
<script>
(function(){var S={"id":"chart-capture","h":230,"ml":[10,14],"mr":[10,14],"mt":10,"mb":42,"els":[{"t":"rect","x0":0.5,"x1":0.7,"y0":1.1,"y1":1.7,"c":"g","al":0.15},{"t":"rect","x0":0.7,"x1":0.8207,"y0":1.1,"y1":1.7,"c":"a","al":0.25},{"t":"rect","x0":0.8207,"x1":1.0,"y0":1.1,"y1":1.7,"c":"b","al":0.18},{"t":"rect","x0":0.5,"x1":1.0,"y0":0.1,"y1":0.7,"c":"g","al":0.15},{"t":"line","pts":[[0.7,1.1],[0.7,2.4]],"c":"sub","w":1,"dash":true},{"t":"line","pts":[[0.8207,1.1],[0.8207,2.4]],"c":"sub","w":1,"dash":true},{"t":"txt","x":0.7,"y":2.25,"s":"one reviewer: 70%","n":"70%","al":"right","bl":"middle","dx":-5,"c":"sub"},{"t":"txt","x":0.8207,"y":2.25,"s":"the room alone: 82.1%","n":"82.1%","al":"left","bl":"middle","dx":5,"c":"sub"},{"t":"txt","x":0.5,"y":1.9,"s":"AI heard first","al":"left","bl":"middle","dx":2,"b":true},{"t":"txt","x":0.5,"y":0.9,"s":"Answers recorded first","al":"left","bl":"middle","dx":2,"b":true},{"t":"txt","x":0.6,"y":1.4,"s":"ignored: right 82.1%","n":"ignored","al":"center","bl":"middle","c":"ink"},{"t":"txt","x":0.76035,"y":1.4,"s":"copied: worse","n":"worse","al":"center","bl":"middle","c":"a","b":true},{"t":"txt","x":0.91035,"y":1.4,"s":"copied: as good as the AI","n":"= AI","al":"center","bl":"middle","c":"b","b":true},{"t":"txt","x":0.75,"y":0.4,"s":"nothing to copy: the room decides, right 82.1%","n":"right 82.1%","al":"center","bl":"middle","c":"ink"}],"X":{"lo":0.5,"hi":1.0,"ticks":[[0.5,"50%"],[0.6,"60%"],[0.7,"70%"],[0.8,"80%"],[0.9,"90%"],[1.0,"100%"]],"title":"how often the AI verdict is right","ntitle":"AI right"},"Y":{"lo":0.0,"hi":2.4,"ticks":[],"title":"","ntitle":""}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

> **Physical translation.** A debate everyone hears before voting replaces the room's judgment with the debate's whenever it sounds more convincing than any one reviewer. That is a good trade only when the debate is better than the room as a whole, a higher bar than being better than any one person in it.

{{ layer(n=3, type="Estimate", id="debate-numbers") }}The simulation of the running case shows the band. Voting blind with no debate, the review adopts a better design 43% of the time and a worse one 4%. A debate right 75% of the time, heard first, captures the panel: every member votes with it, and the review adopts the better design 73% of the time and the worse one 24%. A debate right 90% of the time, heard first, adopts the better design 88% of the time and the worse one 10%, the widest gap of any setting tried.

{{ layer(n=3, type="Estimate", id="advocate-numbers") }}A single advocate gives the opposite picture, and it matches the consultancy result. An advocate with a lead of one signal behaves like the first post's champion, raising adoption of a worse design from 20% to 38% in a sequence. An advocate persuasive enough to give a lead of two signals captures the whole review. Every member follows it, and the review adopts a better and a worse design alike, 97% of the time. A persuasive single advocate is a shared input that gives a fixed lead whatever the design's merit, so it is right only when the design happens to be better, half the time when better and worse designs come equally often. Proposition 7's proof of capture uses only the lead a member hears, so it applies once that lead exceeds one signal by more than the probing weight.

{{ layer(n=3, type="Estimate", id="debate-after") }}Hearing the debate after the vote avoids capture, at a price. Added to the tally with the weight of its log-odds, a debate right 90% of the time moves the blind review's gap between better and worse designs from 0.40 to 0.46. Heard first, it buys a gap of 0.79. The weighting treats the fifteen correlated votes as fifteen independent signals and gives the debate a small share against them. It is the same over-counting that made fifteen reviewers worth three to five opinions in the first post.

{{ layer(n=2, type="Fit", id="debate-rule") }}The rule that follows is a measurement, not a habit. Before letting a debate speak first, measure its accuracy on past questions with known answers, and measure the panel's own majority on the same questions. If the debate beats the majority, hear it first and let it decide. If it beats one member but not the majority, hear it after, as one weighted input, or not at all. A debate that cannot be measured should not speak first. A debate between roles of the model that wrote the design shares the blind spots of every other instrument from that model, so measure it as one of them.

{{ layer(n=1, type="Bound", id="habermas-machine") }}The mediator is the other tool that decides who hears what first. The strongest published example is the AI mediator of Tessler and coauthors, trained to draft group statements on divisive political questions{{ cite(ref="10", title="Tessler, M.H. and coauthors (2024) -- AI Can Help Humans Find Common Ground in Democratic Deliberation, Science 386") }}. It took each participant's opinion and critique and iterated toward a statement the group would endorse. Across several thousand participants, its statements were preferred to those of human mediators 56% of the time. Groups ended less divided than they began.

{{ layer(n=1, type="Bound", id="multiagent-agreement") }}Models are built to agree with each other as well. In multi-agent debate, several instances of a model read each other's answers and revise until they converge on a shared one. Choi, Zhu and Li tested the procedure on seven benchmarks and found that a plain majority vote of the same instances accounts for most of the gain usually credited to the debate{{ cite(ref="11", title="Choi, H.K., Zhu, X. and Li, S. (2025) -- Debate or Vote: Which Yields Better Decisions in Multi-Agent Large Language Models?, NeurIPS 2025") }}. Modeled as a process, the debate left each agent's expected correctness where it started. Wynn, Satija and Hadfield found that debate can leave a group worse than one agent, as models switch from right answers to wrong ones to agree with their peers{{ cite(ref="12", title="Wynn, A., Satija, H. and Hadfield, G. (2025) -- Talk Isn't Always Cheap: Understanding Failure Modes in Multi-Agent Debate, ICML 2025") }}. An agreement mediator built from models inherits both results.

{{ layer(n=1, type="Bound", id="order-measured") }}With an AI in the loop, the order has been measured directly. Fogliato and coauthors had radiologists read cases with an AI's findings shown either at the start or only after they had recorded their own{{ cite(ref="13", title="Fogliato, R. and coauthors (2022) -- Who Goes First? Influences of Human-AI Workflow on Decision Making in Clinical Imaging, FAccT 2022") }}. Those who recorded first agreed with the AI less often, whether or not it was right, and the anchoring was strongest when the AI's findings came first. The study was small and its accuracy gains were marginal, but the direction is the one the model predicts. A judgment recorded before the machine is heard stays the reviewer's own.

{{ layer(n=1, type="Bound", id="facilitation-measured") }}An AI facilitator has now been measured in a live group decision. Parisi and four coauthors had 879 people in groups of three divide a real donation among charities, some with a language model facilitating their discussion{{ cite(ref="14", title="Parisi, A., Thain, N., Hallak, A., Tsai, V. and Qian, C. (2026) -- Real-Time Group Dynamics with LLM Facilitation: Evidence from a Charity Allocation Task, FAccT 2026") }}. Facilitation did not improve consensus, yet participants preferred it. The facilitators shifted some allocations by up to 5.5 points, and trust in the process was highest where they steered. The task had no correct answer, so accuracy was not measured. What was measured is that a mediator can move a group's decision while the group feels better about the process.

{{ layer(n=2, type="Fit", id="agreement-is-the-failure") }}For political deliberation, a statement more people can endorse is the goal. A design review has a different goal: to adopt the better design and refuse the worse one. The first post found that agreement is how reviews fail. A sequence reaches agreement after its first few voices and then stops carrying information. Discussion made real review panels more certain of their verdicts without making the verdicts more alike between panels. A tool that produces agreement faster speeds up the failure the series diagnosed.

<span id="def-8"></span>
<details>
<summary>Definition 8 -- Mediator: a rule that turns the judgments of groups deciding apart into the review's verdict</summary>

**Definition 8** (Mediator). *A review is held by groups that hold unequal shares of the evidence. A mediator is a rule that turns their members' judgments into the review's verdict. An* agreement mediator *passes each group's conclusion to the next group before it votes, as a public lead of {% katex() %}\chi{% end %} signals toward that conclusion. A* difference mediator *has every member judge blind, then pools all the judgments into one tally, counting each member once or by the log-odds {% katex() %}\ln(q_g/(1-q_g)){% end %} of their group's precision {% katex() %}q_g{% end %}.*

where:

- {% katex() %}\chi{% end %} - the weight of a carried conclusion, 1 or 2 signals
- {% katex() %}q_g{% end %} - the precision of group {% katex() %}g{% end %}: the chance its members' signals are right, its share of the evidence

</details>

{{ layer(n=3, type="Estimate", id="agreement-rescues") }}The first post's review is held by three groups of five that decide apart: a pilot team whose members are right 80% of the time and two groups right 65% of the time. Deciding apart, the review adopts a better design 40% of the time and a worse one 2%, and more than half its reviews of a better design end in the team review. An agreement mediator that carries each conclusion as two signals rescues them. The review adopts a better design 79% of the time. It also adopts a worse one 8% of the time, more than four times as often.

{{ layer(n=3, type="Estimate", id="order-decides") }}That result depends on who speaks first. In it, the pilot team happened to vote first, so its conclusion was the one carried forward. Move the pilot team to the last position and the same mediator carries the two weaker groups' conclusions instead. With the evidence concentrated further, a team right 90% of the time and two groups right 60%, the effect is stark. With the informed team first, carried conclusions adopt a better design 90% of the time and a worse one 3%. With the informed team last, they adopt the better design 52% of the time and the worse one 27%.

{{ layer(n=2, type="Fit", id="cascade-between-groups") }}This is the cascade of the first post, one level up. Inside a group, the first voices set the direction and the rest follow. Between groups, the first conclusions set the direction and the later groups follow. A mediator that builds agreement group by group inherits the order of the agenda, and the agenda rarely knows which group holds the evidence. The quality of the review then depends on an accident of scheduling.

{{ layer(n=1, type="Bound", id="hidden-profiles") }}Group psychology has measured the opposite problem. Lu, Yuan and McLeod pooled 65 studies in which the facts favoring the best option were spread across members, each holding a few that nobody else had{{ cite(ref="15", title="Lu, L., Yuan, Y.C. and McLeod, P.L. (2012) -- Twenty-Five Years of Hidden Profiles in Group Decision Making: A Meta-Analysis, Personality and Social Psychology Review 16(1)") }}. Discussion dwelt on the facts everyone already shared, far more than on the unshared ones. Groups whose decisive facts were spread this way were about eight times less likely to find the best option than groups given every fact. A fact only one member holds can be raised only by that member, and confirmed by nobody.

{{ layer(n=2, type="Fit", id="difference-mediator") }}A difference mediator is built against both failures. It collects every member's judgment before anyone hears anyone else, so no early voice sets the direction. And it pools the judgments with weights that reflect each group's evidence, so a small group holding the decisive facts is not outvoted by larger groups holding less. Pooling with those weights is what an informed decision maker would do: each group counts for the evidence it holds. And pooling does not depend on the order of the agenda, because a sum does not.

{{ layer(n=3, type="Estimate", id="difference-numbers") }}The difference mediator changes where reviews die. Under the pilot-team review, the share of reviews of a better design that end in the team review falls from 54% to 13% with reliability weights. With the evidence concentrated in a team right 90% of the time, weighted pooling adopts a better design 63% to 67% of the time, and a worse one under 1%, in every speaking order. Deciding apart, the same review adopts the better design 34% to 37% of the time.

{{ layer(n=3, type="Estimate", id="equal-weights-are-not-enough") }}The weights do the work. Pooling every member's blind judgment with equal weight ends fewer reviews in the team review, but adopts a better design about as often as deciding apart, 37% to 41%. An equal count lets the two weaker groups outnumber the team that holds the evidence. The weights restore the team's share of the decision.

{{ layer(n=2, type="Fit", id="why-agreement-looks-better") }}Under the pilot-team review the agreement mediator still adopts more better designs than weighted pooling, 79% against 45%. The reason is the gates, and the first post already found it. The gates read the tally at face value. Carried conclusions inflate the tally, because a group that follows the carried lead adds endorsements that carry no new evidence. The pooled blind tally is honest and smaller, so it clears the gates' threshold less often, for better and worse designs alike. The fair comparison is the pair: agreement buys better designs at a fourfold rise in worse ones that depends on the agenda, and weighted pooling keeps worse designs near 2% in every order.

{{ layer(n=3, type="Estimate", id="faster-settling") }}A mediator can also help with time. The first post's decision window assumed one owner settling every pair of groups' disagreements one at a time, each taking a week on average and drawn independently from an exponential distribution, within a quarter. Six groups then decide in time 32% of the time. A mediator that sharpens each disagreement into the one question that would settle it, halving the time per pair, lifts that to 99%. At a quarter of the time, eight groups fit.

{{ layer(n=3, type="Estimate", id="faster-settling-cannot-fix-triviality") }}Faster settling does not rescue a design split into simple pieces. In the first post's model of the law of triviality, four pieces passed almost never, at 0.03%. Quartering the settling time raises that only to 3%. The pieces still draw an opinion from nearly everyone, and every opinion holder still has to accept their piece. The window was not the binding constraint. The number of opinion holders was, and only keeping the design whole for people changes it.

<span id="cor-3"></span>
<details>
<summary>Corollary 3 -- Capture Removes the Agenda: capture of every member makes the combining rule and the order irrelevant, and below capture they decide again</summary>

**Corollary 3** (Capture Removes the Agenda). *Let a review be held by groups that decide apart, carry conclusions from group to group, or pool blind judgments, in any speaking order, and let every member hear the same shared inputs, of combined log-odds {% katex() %}\Lambda{% end %}, before acting.*

*(i) If {% katex() %}\Lambda{% end %} exceeds the log-odds of every member's own signal by more than the probing weight, every member of every group acts on the inputs' combined verdict, and the review's verdict is that verdict under every combining rule and every order.*

*(ii) A member whose own signal carries log-odds {% katex() %}L{% end %} with {% katex() %}\Lambda - L \le w{% end %} is not captured. Judging blind, that member acts on their own signal, so the inputs leave a blind vote or a blind pool as it would be without them. Acting in order, the member faces the inputs as a head start of {% katex() %}\Lambda/L{% end %} signals: a cascade toward the inputs' verdict begins once revealed signals on its side outnumber the others by more than {% katex() %}1 + (w - \Lambda)/L{% end %}, and a cascade against it once the others lead by more than {% katex() %}1 + (w + \Lambda)/L{% end %}.*

*Proof.* (i) By Proposition 7 (i), a member facing public evidence for one side of more than {% katex() %}L + w{% end %} log-odds acts on that side whatever their own signal. Every member hears the shared inputs first, so every member of the first group faces at least that evidence, and acts on the inputs' verdict. A carried conclusion is a lead toward the conclusion of an earlier group, which is that same verdict, so it adds to the evidence each later group faces and never subtracts from it. Every member of every group therefore acts on the verdict, in any order. Pooled blind judgments are each made facing the shared inputs alone, so each is the verdict too. Every tally then has the verdict's sign, under every rule. (ii) By the rule of Proposition 2, a member acts against their own signal only when the public evidence against it exceeds {% katex() %}L + w{% end %}. Judging blind, the only public evidence is {% katex() %}\Lambda \le L + w{% end %}, so no member is moved. Acting in order, every action outside a cascade reveals a signal, so after a net {% katex() %}m{% end %} revealed signals toward the verdict the public evidence is {% katex() %}\Lambda + mL{% end %}. A cascade toward the verdict starts when {% katex() %}\Lambda + mL - L > w{% end %}, that is when {% katex() %}m > 1 + (w - \Lambda)/L{% end %}, and against it when {% katex() %}-(\Lambda + mL) - L > w{% end %}, that is when {% katex() %}-m > 1 + (w + \Lambda)/L{% end %}. ∎

</details>

{{ layer(n=3, type="Estimate", id="head-start") }}Part (ii) has a practical edge. With no probing weight, a debate right 65% of the time carries 0.62 log-odds against a member's 0.85. That is too little to capture anyone, so a blind vote is untouched by it. In a meeting that speaks in order, the first member who agrees with it starts a cascade, where two agreeing voices are needed without it. An instrument too weak to sway a blind vote can still decide an ordered meeting, one more reason to record judgments before anyone hears it.

{{ layer(n=2, type="Fit", id="corollary-reading") }}The corollary turns the region's main feature into a statement. The meeting's procedure matters while the instruments are weak or absent. Once accurate instruments are heard first, they take the decision, and the procedure that combines the members' views stops mattering. Corollary 3 also says what that costs. An instrument heard first is a voter with every vote. Proposition 7 says it helps only if it is more accurate than the panel it replaces, so the instruments have to earn that place by measurement.

{{ layer(n=3, type="Estimate", id="probe-plane") }}Once combining has run out, the gains that remain lie on two axes: how often each person's own answer is right, and how alike their errors are. The two axes are not equal. At an accuracy of 70%, even errors with no correlation at all leave a worse design adopted almost 4% of the time. At a correlation of 0.1, raising accuracy to 90% adopts 97% of better designs and 0.2% of worse ones. The first section's ceiling lies across the correlation axis, and the way past it lies along the accuracy axis.

{{ layer(n=3, type="Estimate", id="probe-briefing") }}The obvious way to raise accuracy is to give everyone the same briefing, one model's summary of the design. That raises correlation too, because every answer now leans on one source. Lifting accuracy to 80% with no rise in correlation widens the gap between better and worse designs by 0.21. If correlation rises from 0.1 to 0.3 on the way, the gap widens by 0.13, and at 0.5 by 0.07. A briefing that lifts accuracy only to 75% while correlation reaches 0.5 narrows the gap. Shared evidence keeps about two thirds of its value at a correlation of 0.3 and about a third at 0.5.

{{ layer(n=2, type="Fit", id="probe-upgrade") }}This is the second post's upgrade condition applied to people. Its large-panel test is stricter than a fifteen-member review needs. It calls each of these briefings a loss, while the review still gains from most of them. The direction is the same in both: evidence that makes people alike returns less than the same accuracy earned independently.

{{ layer(n=2, type="Fit", id="probe-design") }}That makes the probe the design choice of this step. Each holder gets evidence of their own: a query to run against the logs, a test that exercises the path they know, a trace of the incident they remember, or a counterexample the machines generated for their part. Evidence of that kind can raise each person's accuracy while their errors stay their own, because each answer leans on a different check. The model cannot settle whether real probes do both. It treats accuracy and correlation as separate settings, and prediction F22 states the measurement that would show whether probes move one without the other. Evidence counts as grounded only when its output comes from the system itself, pinned to a commit and a configuration, and not from a model's reading of it.

## Step 5: Diff

{{ layer(n=2, type="Fit", id="diff-why") }}A diff is only as useful as its reference, and only as cheap as the agreement it lets the review skip. It needs a reference worth diffing against, and people whose errors differ from it. Two findings on combining people with machines say when both hold, and the energy budget below says what the diff saves.

{{ layer(n=1, type="Bound", id="complementarity") }}Whether people and models do better together depends on how their errors relate. The two sources of complementarity that Hemmer and coauthors identified say when a team can win at all{{ cite(ref="2", title="Hemmer, P. and four coauthors (2024) -- Complementarity in Human-AI Collaboration: Concept, Sources, and Evidence, arXiv:2404.00029") }}. Vaccaro, Almaatouq and Malone pooled 106 experiments and found that on average the team does not win: combinations did worse than the better of the two alone, most clearly on decision tasks{{ cite(ref="16", title="Vaccaro, M., Almaatouq, A. and Malone, T. (2024) -- When Combinations of Humans and AI Are Useful, Nature Human Behaviour 8") }}.

{{ layer(n=2, type="Fit", id="complementarity-reconciled") }}The two findings agree once the combining rule is named. A combination helps when it weighs each source by what it knows and the sources err in different places. It hurts when it gives a confident source more say than its record earns, or counts correlated sources as independent. The second post found models erring together, and this post found three tools that either add correlated voices or let one input silence the rest. The combining rule decides which of the two published results a team gets.

{{ layer(n=1, type="Bound", id="vaccaro-moderators") }}The meta-analysis also found which way the losses run. When people alone outperformed the AI alone, combining them gained. When the AI alone outperformed people, combining them lost, because people overrode an AI that was right more often than they were.

{{ layer(n=2, type="Fit", id="moderators-in-the-model") }}The review model reproduces that asymmetry, and says where it comes from. A debate right 90% of the time is more accurate than the panel. Heard first, it captures the panel and the review gains. Heard after the vote, it is weighed against fifteen votes counted as independent, and the panel overrides it: the gap moves from 0.40 to only 0.46, against 0.79 when the debate decides. People who override a better instrument are counting their own correlated judgments as more evidence than they are. The fix is the one Proposition 7 gives: measure the instrument against the panel's majority, and let whichever is more accurate decide.

{{ layer(n=2, type="Fit", id="division-of-labor") }}Put together, the instruments leave people a clear place, and the region says where. Models read the design in parts and report the local facts with their locations. A difference mediator collects every judgment blind and pools it by each group's record, and it sharpens each disagreement into the question that would settle it. A critic flags what it finds, and people check every flag before the review hears it. A debate speaks first only when it has been measured against the panel and beats it. People hold the whole design, the relational questions, the facts that were never written down, the checking of flags, the measuring of instruments, and the decision. An instrument may take the first word only after people have measured it.

{{ layer(n=2, type="Fit", id="residual-idea") }}The steps so far say what models are worth in a review, and they point to one use not yet named. Models trained on overlapping text agree with each other for shared reasons, and roles of one model agree even more (Corollary 2). As a voter, that shared answer counts once however many voices repeat it. As a reference, it is useful precisely because it is stable: it is the written world's view of the design, measured very precisely.

{{ layer(n=2, type="Fit", id="residual-protocol") }}That is why the protocol keeps the consensus as a reference and never as the first word. Each routed holder answers alone, the models' consensus is computed separately, and nothing reaches the room before the answers are recorded, so the consensus cannot capture anyone (Proposition 7). The diff then closes every answer that agrees with the reference, because agreement with the written world carries nothing the room cannot already get, and leaves the departures open.

{{ layer(n=2, type="Fit", id="residual-meaning") }}Each departure is one of two things. Either the person is wrong, or the person holds something that was never written down: the outage last spring, the quirk of this system, the reason the team stopped doing that. Telling the two apart is the review's job. This is where the second post's informed minority lives, and where hidden-profile research says groups fail. The fact one member holds surfaces as a residual instead of drowning in shared facts.

{{ layer(n=2, type="Fit", id="residual-boundary") }}The protocol narrows what people discuss, not what they read. Someone still holds the whole design, because the law of triviality stalls a design split into pieces, and because relational facts need two distant passages read together. That person is the integrator of the Monday-morning roles, and the relational questions are routed to them. A protocol read as "review only the flagged lines" would lose exactly those facts, which is why holders may add questions. It also inherits the gate: while the status quo sits inside the approvers' hull, no residual moves the decision.

{{ layer(n=2, type="Fit", id="residual-status") }}Its parts are tested: answers recorded alone against capture, sources against roles, verified flags against unverified ones, routed holders against random ones. What the diff costs in human energy, and what it buys, is computed below. What no computation reaches is whether the departures it discusses surface facts nobody wrote down, and that is the prediction F20 states.

{{ layer(n=2, type="Fit", id="energy-question") }}A protocol that asks people to do more has to say what it costs them. The first post counted the cost of a review in settlements: one owner reconciling one pair of views, one at a time, inside a window. In the meeting, every pair of opinion holders on a piece must be reconciled, so the bill grows with the square of the holders. The protocol reconciles something else. Each person's judgment is compared with one reference, the machines' consensus, and only a departure from it needs settling, once. The computation below runs the protocol unrouted, with every opinion holder answering, so that it meets the meeting on the meeting's own terms.

{{ layer(n=1, type="Bound", id="mesh-and-star") }}Distributed systems know the two shapes. Reconciling every node with every other is a mesh, and its messages grow with the square of the nodes. Reconciling each node with one leader is a star, one exchange per node, and the leader becomes the node everyone must trust.

<span id="prop-8"></span>
<details>
<summary>Proposition 8 -- Mesh and Star: settling disagreements against a reference turns the review's quadratic human energy into linear</summary>

**Proposition 8** (Mesh and Star). *Let each of {% katex() %}n{% end %} members hold an opinion on a piece of a design independently with probability {% katex() %}s{% end %}, and let each holder depart from a reference independently with probability {% katex() %}d{% end %}.*

*(i) If every pair of holders settles its disagreement once, the expected number of settlements is {% katex() %}\binom{n}{2}s^2{% end %}. If each holder who departs from the reference settles once against it, the expected number is {% katex() %}nsd{% end %}. The second is smaller exactly when {% katex() %}d < (n-1)s/2{% end %}.*

*(ii) If a design reviewed in {% katex() %}P{% end %} pieces gives each member an opinion on each piece with probability {% katex() %}s = cP^{\beta} < 1{% end %}, the expected total settlements grow as {% katex() %}P^{1+2\beta}{% end %} in the mesh and as {% katex() %}P^{1+\beta}{% end %} in the star.*

*(iii) If one owner settles the disagreements one at a time, each taking an exponential time of mean {% katex() %}\mu{% end %}, a review with an expected {% katex() %}\mathbb{E}[K]{% end %} settlements decides within a window {% katex() %}W{% end %} with probability at least {% katex() %}1 - \mu\,\mathbb{E}[K]/W{% end %} The bound says something only while {% katex() %}\mu\,\mathbb{E}[K] < W{% end %}.*

*Proof.* (i) The number of holders {% katex() %}h{% end %} is binomial with parameters {% katex() %}n{% end %} and {% katex() %}s{% end %}, so {% katex() %}\mathbb{E}[h(h-1)] = n(n-1)s^2{% end %} and the mesh expects {% katex() %}\binom{n}{2}s^2{% end %} settlements. Each member is a departing holder with probability {% katex() %}sd{% end %}, independently, so the star expects {% katex() %}nsd{% end %}. Then {% katex() %}nsd < n(n-1)s^2/2{% end %} exactly when {% katex() %}d < (n-1)s/2{% end %}. (ii) Multiply each by {% katex() %}P{% end %} pieces and substitute {% katex() %}s = cP^{\beta}{% end %}: the mesh expects {% katex() %}P\binom{n}{2}c^2P^{2\beta}{% end %} and the star {% katex() %}Pncd\,P^{\beta}{% end %}. (iii) The total settling time {% katex() %}T{% end %} is a sum of {% katex() %}K{% end %} exponential times, so {% katex() %}\mathbb{E}[T] = \mu\,\mathbb{E}[K]{% end %}, and by Markov's inequality {% katex() %}\Pr(T > W) \le \mu\,\mathbb{E}[K]/W{% end %}. ∎

</details>

{{ layer(n=3, type="Estimate", id="energy-numbers") }}In the first post's review, with every constant from the first three posts, the difference is not subtle. Reviewed whole, the meeting adopts a better design 74% of the time and a worse one 24%, for about 4 settlements. The unrouted protocol adopts 97% and 31%, for 0.3. Split the design and the two part ways. In two pieces the unrouted protocol adopts 92% and 17% for 1 settlement, against the meeting's 35% and 5% for 24. In four pieces the meeting almost never decides, with 134 settlements for a 13-week window. The unrouted protocol adopts 79% and 9% for 3.4. The machine heard first spends nothing and adopts every design, because the flaw is a local fact no training text holds.

<div id="anim-energy-fig" style="margin:1.75em auto;max-width:720px;">
<style>
#anim-energy-fig{--en-acc:#1565c0;--en-sub:#5b6270;--en-track:#e8ebef;--en-bad:#c62828;--en-mute:#8a919c;--en-line:#e3e6eb}
#anim-energy-fig .en-grid{display:grid;grid-template-columns:auto 1fr 1fr;border-top:1px solid var(--en-line)}
#anim-energy-fig .en-grid>div{padding:9px 10px;border-bottom:1px solid var(--en-line)}
#anim-energy-fig .en-h{font-weight:600;font-size:0.9em}
#anim-energy-fig .en-h small{display:block;font-weight:400;font-size:0.82em;color:var(--en-sub)}
#anim-energy-fig .en-row{font-size:0.85em;color:var(--en-sub);white-space:nowrap}
#anim-energy-fig .en-right{font-size:1.15em;font-weight:700;font-variant-numeric:tabular-nums}
#anim-energy-fig .en-right span{font-size:0.7em;font-weight:400;color:var(--en-sub);margin-left:6px}
#anim-energy-fig .en-dots{display:grid;grid-template-columns:repeat(13,7px);gap:2px;margin:6px 0 4px 0}
#anim-energy-fig .en-dots i{display:block;width:7px;height:7px;border-radius:50%;background:var(--en-track)}
#anim-energy-fig .en-time{font-size:0.78em;color:var(--en-sub);font-variant-numeric:tabular-nums}
#anim-energy-fig .en-key{font-size:0.78em;color:var(--en-sub);margin:8px 0 0 0}
</style>
<div class="en-grid" id="anim-energy-grid" role="img" aria-label="How often a review decides right, with half the designs better, and how many disagreements people must settle, as the design is split into 1, 2, 4 or 8 pieces; a 13-week quarter fits 52. The meeting: 75%, 65%, 50% and 50% right, with 4, 24, 134 and 758 disagreements. The Residual Protocol: 94%, 93%, 91% and 88% right, with at most 1.6."></div>
<p class="en-key" id="anim-energy-key"></p>
<figcaption style="font-size:0.85em;margin:10px auto 0 auto;max-width:70ch;">What the review costs (Proposition 8). Each dot is a disagreement someone must settle, and each box holds one quarter. Split a design, and the meeting must settle every pair of opinions until it overflows the quarter and stalls at a coin flip. The Residual Protocol asks only the people who hold the facts: a dot or two, and it stays right.</figcaption>
<script>
(function(){
var S={"id":"chart-energy","h":400,"ml":[8,8],"mr":[8,8],"mt":8,"mb":8,"els":[{"t":"txt","x":18,"y":5.15,"s":"The meeting","b":true,"bl":"middle"},{"t":"txt","x":18,"y":4.8,"s":"everyone settles with everyone","c":"sub","bl":"middle"},{"t":"txt","x":59,"y":5.15,"s":"The Residual Protocol","b":true,"bl":"middle"},{"t":"txt","x":59,"y":4.8,"s":"two people who hold the fact","c":"sub","bl":"middle"},{"t":"hline","y":4.5,"c":"grid"},{"t":"txt","x":1,"y":4.05,"s":"Whole design","c":"sub","bl":"middle"},{"t":"txt","x":18,"y":4.3,"s":"75% right","c":"b","b":true,"bl":"middle"},{"t":"rect","x0":18.0,"x1":18.72,"y0":4.12,"y1":4.04,"c":"b"},{"t":"rect","x0":19.0,"x1":19.72,"y0":4.12,"y1":4.04,"c":"b"},{"t":"rect","x0":20.0,"x1":20.72,"y0":4.12,"y1":4.04,"c":"b"},{"t":"rect","x0":21.0,"x1":21.72,"y0":4.12,"y1":4.04,"c":"b"},{"t":"rect","x0":22.0,"x1":22.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":23.0,"x1":23.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":24.0,"x1":24.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":25.0,"x1":25.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":26.0,"x1":26.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":27.0,"x1":27.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":28.0,"x1":28.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":29.0,"x1":29.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":30.0,"x1":30.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":31.0,"x1":31.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":32.0,"x1":32.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":33.0,"x1":33.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":34.0,"x1":34.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":35.0,"x1":35.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":36.0,"x1":36.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":37.0,"x1":37.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":38.0,"x1":38.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":39.0,"x1":39.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":40.0,"x1":40.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":41.0,"x1":41.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":42.0,"x1":42.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":43.0,"x1":43.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":18.0,"x1":18.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":19.0,"x1":19.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":20.0,"x1":20.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":21.0,"x1":21.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":22.0,"x1":22.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":23.0,"x1":23.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":24.0,"x1":24.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":25.0,"x1":25.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":26.0,"x1":26.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":27.0,"x1":27.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":28.0,"x1":28.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":29.0,"x1":29.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":30.0,"x1":30.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":31.0,"x1":31.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":32.0,"x1":32.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":33.0,"x1":33.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":34.0,"x1":34.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":35.0,"x1":35.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":36.0,"x1":36.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":37.0,"x1":37.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":38.0,"x1":38.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":39.0,"x1":39.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":40.0,"x1":40.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":41.0,"x1":41.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":42.0,"x1":42.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":43.0,"x1":43.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"txt","x":18,"y":3.7199999999999998,"s":"4 disagreements","c":"sub","b":false,"bl":"middle"},{"t":"txt","x":59,"y":4.3,"s":"94% right","c":"b","b":true,"bl":"middle"},{"t":"rect","x0":59.0,"x1":59.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":60.0,"x1":60.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":61.0,"x1":61.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":62.0,"x1":62.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":63.0,"x1":63.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":64.0,"x1":64.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":65.0,"x1":65.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":66.0,"x1":66.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":67.0,"x1":67.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":68.0,"x1":68.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":69.0,"x1":69.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":70.0,"x1":70.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":71.0,"x1":71.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":72.0,"x1":72.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":73.0,"x1":73.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":74.0,"x1":74.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":75.0,"x1":75.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":76.0,"x1":76.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":77.0,"x1":77.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":78.0,"x1":78.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":79.0,"x1":79.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":80.0,"x1":80.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":81.0,"x1":81.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":82.0,"x1":82.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":83.0,"x1":83.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":84.0,"x1":84.72,"y0":4.12,"y1":4.04,"c":"grid"},{"t":"rect","x0":59.0,"x1":59.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":60.0,"x1":60.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":61.0,"x1":61.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":62.0,"x1":62.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":63.0,"x1":63.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":64.0,"x1":64.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":65.0,"x1":65.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":66.0,"x1":66.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":67.0,"x1":67.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":68.0,"x1":68.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":69.0,"x1":69.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":70.0,"x1":70.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":71.0,"x1":71.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":72.0,"x1":72.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":73.0,"x1":73.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":74.0,"x1":74.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":75.0,"x1":75.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":76.0,"x1":76.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":77.0,"x1":77.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":78.0,"x1":78.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":79.0,"x1":79.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":80.0,"x1":80.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":81.0,"x1":81.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":82.0,"x1":82.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":83.0,"x1":83.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"rect","x0":84.0,"x1":84.72,"y0":4.0,"y1":3.92,"c":"grid"},{"t":"txt","x":59,"y":3.7199999999999998,"s":"under 1 disagreement","c":"sub","b":false,"bl":"middle"},{"t":"hline","y":3.5,"c":"grid"},{"t":"txt","x":1,"y":3.05,"s":"2 pieces","c":"sub","bl":"middle"},{"t":"txt","x":18,"y":3.3,"s":"65% right","c":"b","b":true,"bl":"middle"},{"t":"rect","x0":18.0,"x1":18.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":19.0,"x1":19.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":20.0,"x1":20.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":21.0,"x1":21.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":22.0,"x1":22.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":23.0,"x1":23.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":24.0,"x1":24.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":25.0,"x1":25.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":26.0,"x1":26.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":27.0,"x1":27.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":28.0,"x1":28.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":29.0,"x1":29.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":30.0,"x1":30.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":31.0,"x1":31.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":32.0,"x1":32.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":33.0,"x1":33.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":34.0,"x1":34.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":35.0,"x1":35.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":36.0,"x1":36.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":37.0,"x1":37.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":38.0,"x1":38.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":39.0,"x1":39.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":40.0,"x1":40.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":41.0,"x1":41.72,"y0":3.12,"y1":3.04,"c":"b"},{"t":"rect","x0":42.0,"x1":42.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":43.0,"x1":43.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":18.0,"x1":18.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":19.0,"x1":19.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":20.0,"x1":20.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":21.0,"x1":21.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":22.0,"x1":22.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":23.0,"x1":23.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":24.0,"x1":24.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":25.0,"x1":25.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":26.0,"x1":26.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":27.0,"x1":27.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":28.0,"x1":28.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":29.0,"x1":29.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":30.0,"x1":30.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":31.0,"x1":31.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":32.0,"x1":32.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":33.0,"x1":33.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":34.0,"x1":34.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":35.0,"x1":35.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":36.0,"x1":36.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":37.0,"x1":37.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":38.0,"x1":38.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":39.0,"x1":39.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":40.0,"x1":40.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":41.0,"x1":41.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":42.0,"x1":42.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":43.0,"x1":43.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"txt","x":18,"y":2.7199999999999998,"s":"24 disagreements","c":"sub","b":false,"bl":"middle"},{"t":"txt","x":59,"y":3.3,"s":"93% right","c":"b","b":true,"bl":"middle"},{"t":"rect","x0":59.0,"x1":59.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":60.0,"x1":60.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":61.0,"x1":61.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":62.0,"x1":62.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":63.0,"x1":63.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":64.0,"x1":64.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":65.0,"x1":65.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":66.0,"x1":66.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":67.0,"x1":67.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":68.0,"x1":68.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":69.0,"x1":69.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":70.0,"x1":70.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":71.0,"x1":71.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":72.0,"x1":72.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":73.0,"x1":73.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":74.0,"x1":74.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":75.0,"x1":75.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":76.0,"x1":76.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":77.0,"x1":77.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":78.0,"x1":78.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":79.0,"x1":79.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":80.0,"x1":80.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":81.0,"x1":81.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":82.0,"x1":82.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":83.0,"x1":83.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":84.0,"x1":84.72,"y0":3.12,"y1":3.04,"c":"grid"},{"t":"rect","x0":59.0,"x1":59.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":60.0,"x1":60.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":61.0,"x1":61.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":62.0,"x1":62.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":63.0,"x1":63.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":64.0,"x1":64.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":65.0,"x1":65.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":66.0,"x1":66.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":67.0,"x1":67.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":68.0,"x1":68.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":69.0,"x1":69.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":70.0,"x1":70.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":71.0,"x1":71.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":72.0,"x1":72.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":73.0,"x1":73.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":74.0,"x1":74.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":75.0,"x1":75.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":76.0,"x1":76.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":77.0,"x1":77.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":78.0,"x1":78.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":79.0,"x1":79.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":80.0,"x1":80.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":81.0,"x1":81.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":82.0,"x1":82.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":83.0,"x1":83.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"rect","x0":84.0,"x1":84.72,"y0":3.0,"y1":2.92,"c":"grid"},{"t":"txt","x":59,"y":2.7199999999999998,"s":"under 1 disagreement","c":"sub","b":false,"bl":"middle"},{"t":"hline","y":2.5,"c":"grid"},{"t":"txt","x":1,"y":2.05,"s":"4 pieces","c":"sub","bl":"middle"},{"t":"txt","x":18,"y":2.3,"s":"50% right, a coin flip","c":"g","b":true,"bl":"middle"},{"t":"rect","x0":18.0,"x1":18.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":19.0,"x1":19.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":20.0,"x1":20.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":21.0,"x1":21.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":22.0,"x1":22.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":23.0,"x1":23.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":24.0,"x1":24.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":25.0,"x1":25.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":26.0,"x1":26.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":27.0,"x1":27.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":28.0,"x1":28.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":29.0,"x1":29.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":30.0,"x1":30.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":31.0,"x1":31.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":32.0,"x1":32.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":33.0,"x1":33.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":34.0,"x1":34.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":35.0,"x1":35.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":36.0,"x1":36.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":37.0,"x1":37.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":38.0,"x1":38.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":39.0,"x1":39.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":40.0,"x1":40.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":41.0,"x1":41.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":42.0,"x1":42.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":43.0,"x1":43.72,"y0":2.12,"y1":2.04,"c":"a"},{"t":"rect","x0":18.0,"x1":18.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":19.0,"x1":19.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":20.0,"x1":20.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":21.0,"x1":21.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":22.0,"x1":22.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":23.0,"x1":23.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":24.0,"x1":24.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":25.0,"x1":25.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":26.0,"x1":26.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":27.0,"x1":27.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":28.0,"x1":28.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":29.0,"x1":29.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":30.0,"x1":30.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":31.0,"x1":31.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":32.0,"x1":32.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":33.0,"x1":33.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":34.0,"x1":34.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":35.0,"x1":35.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":36.0,"x1":36.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":37.0,"x1":37.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":38.0,"x1":38.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":39.0,"x1":39.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":40.0,"x1":40.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":41.0,"x1":41.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":42.0,"x1":42.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"rect","x0":43.0,"x1":43.72,"y0":2.0,"y1":1.92,"c":"a"},{"t":"txt","x":18,"y":1.72,"s":"134 disagreements, 82 more than a quarter holds","c":"a","b":true,"bl":"middle"},{"t":"txt","x":59,"y":2.3,"s":"91% right","c":"b","b":true,"bl":"middle"},{"t":"rect","x0":59.0,"x1":59.72,"y0":2.12,"y1":2.04,"c":"b"},{"t":"rect","x0":60.0,"x1":60.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":61.0,"x1":61.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":62.0,"x1":62.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":63.0,"x1":63.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":64.0,"x1":64.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":65.0,"x1":65.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":66.0,"x1":66.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":67.0,"x1":67.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":68.0,"x1":68.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":69.0,"x1":69.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":70.0,"x1":70.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":71.0,"x1":71.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":72.0,"x1":72.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":73.0,"x1":73.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":74.0,"x1":74.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":75.0,"x1":75.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":76.0,"x1":76.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":77.0,"x1":77.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":78.0,"x1":78.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":79.0,"x1":79.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":80.0,"x1":80.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":81.0,"x1":81.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":82.0,"x1":82.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":83.0,"x1":83.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":84.0,"x1":84.72,"y0":2.12,"y1":2.04,"c":"grid"},{"t":"rect","x0":59.0,"x1":59.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":60.0,"x1":60.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":61.0,"x1":61.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":62.0,"x1":62.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":63.0,"x1":63.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":64.0,"x1":64.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":65.0,"x1":65.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":66.0,"x1":66.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":67.0,"x1":67.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":68.0,"x1":68.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":69.0,"x1":69.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":70.0,"x1":70.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":71.0,"x1":71.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":72.0,"x1":72.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":73.0,"x1":73.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":74.0,"x1":74.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":75.0,"x1":75.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":76.0,"x1":76.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":77.0,"x1":77.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":78.0,"x1":78.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":79.0,"x1":79.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":80.0,"x1":80.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":81.0,"x1":81.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":82.0,"x1":82.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":83.0,"x1":83.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"rect","x0":84.0,"x1":84.72,"y0":2.0,"y1":1.92,"c":"grid"},{"t":"txt","x":59,"y":1.72,"s":"under 1 disagreement","c":"sub","b":false,"bl":"middle"},{"t":"hline","y":1.5,"c":"grid"},{"t":"txt","x":1,"y":1.05,"s":"8 pieces","c":"sub","bl":"middle"},{"t":"txt","x":18,"y":1.3,"s":"50% right, a coin flip","c":"g","b":true,"bl":"middle"},{"t":"rect","x0":18.0,"x1":18.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":19.0,"x1":19.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":20.0,"x1":20.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":21.0,"x1":21.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":22.0,"x1":22.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":23.0,"x1":23.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":24.0,"x1":24.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":25.0,"x1":25.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":26.0,"x1":26.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":27.0,"x1":27.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":28.0,"x1":28.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":29.0,"x1":29.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":30.0,"x1":30.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":31.0,"x1":31.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":32.0,"x1":32.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":33.0,"x1":33.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":34.0,"x1":34.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":35.0,"x1":35.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":36.0,"x1":36.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":37.0,"x1":37.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":38.0,"x1":38.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":39.0,"x1":39.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":40.0,"x1":40.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":41.0,"x1":41.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":42.0,"x1":42.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":43.0,"x1":43.72,"y0":1.12,"y1":1.04,"c":"a"},{"t":"rect","x0":18.0,"x1":18.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":19.0,"x1":19.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":20.0,"x1":20.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":21.0,"x1":21.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":22.0,"x1":22.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":23.0,"x1":23.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":24.0,"x1":24.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":25.0,"x1":25.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":26.0,"x1":26.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":27.0,"x1":27.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":28.0,"x1":28.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":29.0,"x1":29.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":30.0,"x1":30.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":31.0,"x1":31.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":32.0,"x1":32.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":33.0,"x1":33.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":34.0,"x1":34.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":35.0,"x1":35.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":36.0,"x1":36.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":37.0,"x1":37.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":38.0,"x1":38.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":39.0,"x1":39.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":40.0,"x1":40.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":41.0,"x1":41.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":42.0,"x1":42.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"rect","x0":43.0,"x1":43.72,"y0":1.0,"y1":0.92,"c":"a"},{"t":"txt","x":18,"y":0.72,"s":"758 disagreements, 706 more than a quarter holds","c":"a","b":true,"bl":"middle"},{"t":"txt","x":59,"y":1.3,"s":"88% right","c":"b","b":true,"bl":"middle"},{"t":"rect","x0":59.0,"x1":59.72,"y0":1.12,"y1":1.04,"c":"b"},{"t":"rect","x0":60.0,"x1":60.72,"y0":1.12,"y1":1.04,"c":"b"},{"t":"rect","x0":61.0,"x1":61.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":62.0,"x1":62.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":63.0,"x1":63.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":64.0,"x1":64.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":65.0,"x1":65.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":66.0,"x1":66.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":67.0,"x1":67.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":68.0,"x1":68.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":69.0,"x1":69.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":70.0,"x1":70.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":71.0,"x1":71.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":72.0,"x1":72.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":73.0,"x1":73.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":74.0,"x1":74.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":75.0,"x1":75.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":76.0,"x1":76.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":77.0,"x1":77.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":78.0,"x1":78.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":79.0,"x1":79.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":80.0,"x1":80.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":81.0,"x1":81.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":82.0,"x1":82.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":83.0,"x1":83.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":84.0,"x1":84.72,"y0":1.12,"y1":1.04,"c":"grid"},{"t":"rect","x0":59.0,"x1":59.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":60.0,"x1":60.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":61.0,"x1":61.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":62.0,"x1":62.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":63.0,"x1":63.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":64.0,"x1":64.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":65.0,"x1":65.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":66.0,"x1":66.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":67.0,"x1":67.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":68.0,"x1":68.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":69.0,"x1":69.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":70.0,"x1":70.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":71.0,"x1":71.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":72.0,"x1":72.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":73.0,"x1":73.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":74.0,"x1":74.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":75.0,"x1":75.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":76.0,"x1":76.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":77.0,"x1":77.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":78.0,"x1":78.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":79.0,"x1":79.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":80.0,"x1":80.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":81.0,"x1":81.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":82.0,"x1":82.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":83.0,"x1":83.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"rect","x0":84.0,"x1":84.72,"y0":1.0,"y1":0.92,"c":"grid"},{"t":"txt","x":59,"y":0.72,"s":"2 disagreements","c":"sub","b":false,"bl":"middle"},{"t":"hline","y":0.5,"c":"grid"},{"t":"txt","x":1,"y":0.25,"s":"Right: correct decisions, half the designs better. Box: one quarter, 52 disagreements.","c":"sub","bl":"middle"}],"X":{"lo":0.0,"hi":100.0,"ticks":[],"title":"","ntitle":""},"Y":{"lo":0.0,"hi":5.5,"ticks":[],"title":"","ntitle":""},"grid":{"window":13.0,"fits":52,"rows":[{"label":"Whole design","meeting":{"right":0.7517,"settle":4.2},"protocol":{"right":0.9368,"settle":0.2}},{"label":"2 pieces","meeting":{"right":0.6515,"settle":23.76},"protocol":{"right":0.9286,"settle":0.4}},{"label":"4 pieces","meeting":{"right":0.5,"settle":134.4},"protocol":{"right":0.9124,"settle":0.8}},{"label":"8 pieces","meeting":{"right":0.5,"settle":758.1},"protocol":{"right":0.882,"settle":1.6}}]}};var G=S.grid;
var root=document.getElementById('anim-energy-fig');if(!root)return;
function $(id){return document.getElementById('anim-energy-'+id);}
var Pal;function pal(){var e=root,dark=false;while(e&&e.nodeType===1){var c=getComputedStyle(e).backgroundColor,m=c.match(/[0-9.]+/g);if(m&&m.length>=3&&(m.length<4||+m[3]>0.5)){dark=(0.299*m[0]+0.587*m[1]+0.114*m[2])<110;break;}e=e.parentElement;}
Pal=dark?{acc:'#8ab4f8',sub:'#a4abb6',track:'#353a42',bad:'#ef9a9a',mute:'#8a919c',line:'#353a42'}:{acc:'#1565c0',sub:'#5b6270',track:'#e8ebef',bad:'#c62828',mute:'#8a919c',line:'#e3e6eb'};
['acc','sub','track','bad','mute','line'].forEach(function(k){root.style.setProperty('--en-'+k,Pal[k]);});}
function el(tag,cls,txt){var d=document.createElement(tag);if(cls)d.className=cls;if(txt!==undefined)d.textContent=txt;return d;}
function cell(v){var d=el('div'),coin=v.right<0.55,over=v.settle>G.fits;
var r=el('div','en-right',Math.round(100*v.right)+'% right');r.style.color=coin?Pal.mute:Pal.acc;if(coin)r.appendChild(el('span','','a coin flip'));d.appendChild(r);
var n=v.settle,shown=Math.min(G.fits,Math.round(n)),dots=el('div','en-dots');for(var i=0;i<G.fits;i++){var x=el('i');if(i<shown)x.style.background=over?Pal.bad:Pal.acc;dots.appendChild(x);}d.appendChild(dots);
var txt=n<1?'under 1 disagreement':Math.round(n)+(Math.round(n)===1?' disagreement':' disagreements');if(over)txt+=', '+Math.round(n-G.fits)+' more than a quarter holds';
var tm=el('div','en-time',txt);if(over){tm.style.color=Pal.bad;tm.style.fontWeight='600';}d.appendChild(tm);return d;}
function draw(){pal();var g=$('grid');g.textContent='';g.appendChild(el('div'));
var h1=el('div','en-h','The meeting');h1.appendChild(el('small','','everyone settles with everyone'));g.appendChild(h1);
var h2=el('div','en-h','The Residual Protocol');h2.appendChild(el('small','','two people who hold the fact'));g.appendChild(h2);
G.rows.forEach(function(r){g.appendChild(el('div','en-row',r.label));g.appendChild(cell(r.meeting));g.appendChild(cell(r.protocol));});
$('key').textContent='Right: decisions correct when half the designs are better. Each box is one quarter: '+G.fits+' disagreements settled at about a day and a quarter each.';}
if(window.MutationObserver){new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme']});}
draw();})();
</script>
</div>

{{ layer(n=2, type="Fit", id="energy-reverses-triviality") }}The protocol reverses the first post's law of triviality. In the meeting, splitting a design is fatal, because every new opinion holder must be reconciled with every other. Against a reference, a holder who agrees costs nothing, so splitting costs only the departures. More eyes on each piece then catch the flawed one more often: adoption of the worse design falls from 31% reviewed whole to 6% in eight pieces. The cost is verification. Every disputed piece is a chance to resolve the dispute wrongly, so adoption of the better design falls as the pieces multiply, and the widest gap is at two pieces. Reviewed whole, the protocol even adopts the worse design a little more often than the meeting, whose every objection is a veto.

{{ layer(n=3, type="Estimate", id="energy-verification") }}Verification is the lever. With every dispute resolved correctly, the four-piece review adopts every better design and 1% of worse ones. With four disputes in five resolved correctly, it adopts 61% and 14%. The machines' share of the work costs no human energy at all: twenty agents held in the reference add nothing to the bill, where the same twenty voting in the meeting would multiply its settlements more than fivefold.

{{ layer(n=2, type="Fit", id="energy-leader") }}The star has the leader's weakness, and Proposition 7 names it. A reference heard first captures every member it outweighs, and then the review spends no energy because it has stopped judging. So the protocol records the people's judgments before the reference is read. It takes the star's economy without its leader.

> **Physical translation.** A room where everyone must agree with everyone pays for every handshake. A room that checks each answer against one shared answer key pays only for the answers that differ, as long as nobody reads the key before writing their own.

### Settling a Departure

{{ layer(n=2, type="Fit", id="settle-why") }}Settling spends the human budget, so it spends it only where the outcome can move. A departure on a piece that cannot change the decision, a naming quarrel on a design everyone accepts, is recorded and left. A departure that could change it is resolved against the design or the running system, not argued to a vote. The critic results below show why verification, not argument, decides what a disputed flag is worth.

{{ layer(n=1, type="Bound", id="critic-measured") }}A model can also be tuned to criticize. McAleese and coauthors trained critic models to point out bugs in code{{ cite(ref="17", title="McAleese, N. and coauthors (2024) -- LLM Critics Help Catch LLM Bugs, arXiv:2407.00215") }}. The critics caught more bugs than paid human reviewers. They also produced more false complaints, both trivial nitpicks and bugs that were not there. People working with a critic caught about as many bugs as the critic alone and invented fewer.

{{ layer(n=2, type="Fit", id="critic-two-numbers") }}That is the series' scorecard in a new place. A critic raises both numbers at once: more true objections and more false ones. A lever that raises both {% katex() %}A_+{% end %} and {% katex() %}A_-{% end %} moves along a curve rather than improving the review, and a critic that rejects more of everything moves the other way along the same curve. Whether a critic improves the review depends on what happens to its false flags.

{{ layer(n=2, type="Fit", id="critic-in-the-model") }}The model holds three critics, each a shared input every member hears. A contrarian critic argues against every design whatever its merit, with a fixed persuasive weight: a single advocate for rejection. A working critic flags the flaw of a worse design 85% of the time and raises a false flag on a better design 30% of the time, in the direction McAleese and coauthors measured. And a verified critic is the working critic whose flags people check, so that a share of its false flags is removed before the review hears them. Members weigh each critic's flag by what its flags have been worth.

{{ layer(n=3, type="Estimate", id="critic-numbers") }}Heard before an ordered vote, the unverified critic barely changes the review: a better design is adopted 68% of the time and a worse one 14%, against 72% and 20% without it. With half its false flags verified away, the better design rises to 83%. With nine in ten verified away, it rises to 94%, while the worse design stays at 14% throughout, because verification touches only the false flags. The gap between better and worse designs grows from 0.52 to 0.80, wider than any single instrument in the post.

{{ layer(n=3, type="Estimate", id="contrarian-numbers") }}The contrarian critic mirrors the persuasive advocate. With a weight of one signal it lowers adoption of both designs, the better to 54% and the worse to 10%, which narrows the gap. With a weight of two it captures the review in the other direction: nothing is adopted, better or worse. A critic tuned to disagree more is the same kind of input pointed at rejection: a fixed lead against the design, right only when the design is worse.

{{ layer(n=2, type="Fit", id="verification-is-the-value") }}The result locates the critic's value. It is not in the criticism. An unverified critic adds false flags as fast as true ones, and the review reads both as evidence. It is in the people who check the flags. A flag that survives checking carries information about the design, and the absence of a flag after a thorough critic carries information too. That is the human-plus-critic result of McAleese and coauthors, read through the review: the team beat the critic alone because the people removed what the critic invented.

{{ layer(n=1, type="Bound", id="sycophancy-tuned") }}The opposite tuning has evidence of its own. Wei and coauthors found that models agree with a user's stated opinion more as they grow larger, and that a light fine-tuning step on synthetic data reduces the tendency{{ cite(ref="18", title="Wei, J., Huang, D., Lu, Y., Zhou, D. and Le, Q.V. (2023) -- Simple Synthetic Data Reduces Sycophancy in Large Language Models, arXiv:2308.03958") }}. The second post found the agreement measured in agent debate, where peers changed each other's answers on their own{{ cite(ref="19", title="Hao, X. and six coauthors (2026) -- Not All Flips Are Conformity: Decomposing Stance Convergence in Multi-Agent LLM Debate, arXiv:2606.00820") }}, and traced it to preference training that rewards agreement.

{{ layer(n=3, type="Estimate", id="tuning-numbers") }}In the review model, tuning away agreement raises the probing weight of the first post: the log-odds a member puts on acting on their own signal before following a lead. At a weight of half a signal nothing changes, because a lead of two already outweighs it. At a weight of one, the worse design falls from 20% to 13% and the better from 72% to 67%, and the gap widens slightly, from 0.52 to 0.54. At a weight of two, the review grows cautious and the gap returns to 0.52. Tuning away agreement helps a little, and only in a band.

{{ layer(n=2, type="Fit", id="tuning-on-records") }}One tuning is a trap the first post predicts. A team can tune a model on its own postmortems and design history, so the model knows the local facts. Proposition 4 of the first post says recorded reasons are partly stories, and that no audit of the records alone can tell the story from the cause. A model tuned on them learns the stories and repeats them fluently. Tuning on telemetry and outcomes avoids that. Tuning on recorded reasons imports the organization's own write-back loop.

## Step 6: Carry

{{ layer(n=2, type="Fit", id="carry-why") }}A decision that survives the review can still die on its way to the approvers. The first post's hand-off result says a relay that keeps a share of a signal's amplitude keeps the square of that share of its signal-to-noise ratio. Each layer of managers is such a relay. The protocol carries the decision as recorded: the margin, the departures and how each was settled, and the dissent in its owner's words. Approvers read the record, not a manager's retelling of it.

{{ layer(n=3, type="Estimate", id="carry-numbers") }}At the corner of all six levers, carrying the verdict unweakened raises adoption of a better design from 71% to 78%. Approvers who read a record instead of an impression, modeled as half the noise in their judgment, raise it to 83%. Both also let slightly more of a worse design through, 8% and 9% against 7%, because a clearer signal reaches the gates in both directions. Together with probes that lift each person's accuracy to 80%, the review adopts a better design 96% of the time and a worse one 3%.

## Step 7: Own

{{ layer(n=2, type="Fit", id="own-why") }}The last step ties responsibility to control. Every routed answer has a named owner, who answers for that answer and nothing else. That is the reverse of the moral crumple zone: the person who signs is the person who decided, about the part they could see. Owning an answer is not owning the decision. The holder answers for what they knew, the decision owner for the decision, and the approvers for their vetoes. The record keeps the three apart, so an incident that spans them does not blur back into one name.

{{ layer(n=2, type="Fit", id="record-why") }}The record keeps the loop observable. The first post's write-back result says that reasons recorded after a decision converge to a mixture of driver and story, and that nothing in the records can reveal it (Proposition 4). A review that records only its conclusion teaches the next review its stories. The protocol records the departures instead: each answer that differed from the reference, whether or not it was discussed, and what happened afterward.

{{ layer(n=2, type="Fit", id="record-gating") }}Recording the undiscussed departures matters for a reason estimation theory knows well. A filter that gates its measurements and judges itself only on the ones it accepted looks better calibrated than it is. The gate removed the evidence of its mistakes. A review that judges itself only on the departures it discussed flatters itself the same way. The outcome a quarter later, for every departure, is the outside sensor the first post said the records cannot supply.

{{ layer(n=2, type="Fit", id="own-calibration") }}Over time the record does a second job. Outcomes show whose departures turn out right on which questions, and that calibration feeds the next routing. Questions whose departures stop being right move to the machines, and questions the machines keep missing stay with people. The residual migrates as the machines learn what people taught them. Human responsibility moves with it, to the new local facts, the consequences and the values no text yet holds. The protocol is built around budgets, the order of hearing, ground truth and ownership, not around any model's quirks. Models will be replaced many times. The residual will narrow toward novelty, values and accountability, and the same steps will still decide where people look.

{{ layer(n=2, type="Fit", id="own-manual") }}One more practice keeps the skill alive. Pilots fly some legs by hand so that the skill is there when the automation fails. A team can run some reviews with the machines off, to keep the habit of reading whole designs and to measure how often its people depart when nothing has been heard first. That rate is the baseline the health gauge is read against.

## Health: The Departure Rate

{{ layer(n=2, type="Fit", id="health-why") }}A protocol that depends on independent people needs a gauge that shows when they stop being independent. The departure rate is that gauge. If holders read the machine before answering, or copy its summary into their answers, they stop departing from it. The rate falls toward zero, the capture of Proposition 7 made visible. If the rate stays high and the departures keep resolving in the machine's favour, the reference is sound and the reviewers are noisy. If they keep resolving against it, the machines are reading the design badly.

{{ layer(n=3, type="Estimate", id="health-numbers") }}The model gives the scale. A holder who answers alone departs from an accurate reference on a sound piece about one time in ten. That is the rate at which the first post's reviewers object to a piece with nothing wrong in it. On the piece that hides a local flaw, 46% of the opinion holders depart: the four in ten who know the fact, plus the stray objections of the rest. A room that reads the machine first departs on neither, because it has nothing left to diff. A departure rate near zero is not the sign of an excellent reference. It is the sign of a review that has stopped measuring.

{{ layer(n=2, type="Fit", id="health-control") }}Tracked across reviews, the rate behaves like a control chart. Its usual level is common-cause noise and needs no action. A sustained drop is a special cause, usually a change in the workflow that lets people see the machine first. It calls for restoring the order, answers before the reference, before anything else is tuned.

{{ layer(n=2, type="Fit", id="health-more") }}Two more gauges complete the panel. The share of departures that outcomes prove right says whether routing reaches the people who know, and a falling share calls for re-routing, not for more reviewers. The size of the residual says whether the machines are learning. It should shrink slowly and never reach zero, because a residual of zero means nobody is looking. No gauge here is a target. A team rewarded for a high departure rate will manufacture departures, and one rewarded for a low residual will stop listing. Each gauge is read against outcomes: the departure rate beside the share of departures that proved right and how much each could have changed.

## Improve: The Binding Constraint

{{ layer(n=2, type="Fit", id="instrument-sequence") }}When the protocol underperforms, its repairs follow the steps. The gates come first, because nothing moves while they are closed. Then the machines' exhaust, because a residual the machines could have settled wastes the scarcest budget. Then the routing, because answers from people who do not hold the fact add settlements and no evidence, and Corollary 2 and Proposition 6 say the same of voices from one source. Then the order, because Corollary 3 says an input heard first takes the decision, and nothing downstream recovers an answer that was never recorded alone. Then the diff, because Proposition 8 says a mesh of settlements stalls a split design and a star does not. Then the verification of disputes, then the accuracy each probe buys, and last the hand-off. The model computes which of them binds.

{{ layer(n=2, type="Fit", id="why-a-region") }}Each instrument so far was tested alone. The first post showed why that is not enough: the stages of a review compose, and the cost of one force can depend on another being present. Its answer was the achievable region, every combination of six levers run on better and worse designs. The instruments get the same treatment. A review can read the design with a model or not, whole or in parts. It can combine its groups apart, through an agreement mediator, or by pooling blind judgments by reliability. It can hear a debate before the vote, after it or not at all. And it can hear no critic, a contrarian one or a verified one.

{{ layer(n=3, type="Estimate", id="region-numbers") }}All 81 combinations were run on the pilot-team review of the first post. Without instruments, groups deciding apart adopt a better design 40% of the time and a worse one 2%. The widest gaps all combine a verified critic with a debate heard first, and mostly with the design read in parts. Read in parts, with the critic and the debate, the review adopts a better design 93% to 94% of the time and a worse one about 2%. That holds whichever of the three combining rules it uses.
{{ layer(n=3, type="Estimate", id="partial-capture") }}The region shows part (ii) as well. The groups hold unequal evidence, so one instrument can capture some of them and not others. A debate right 75% of the time carries 1.10 log-odds. That outweighs a member of the groups right 65% of the time, who carries 0.62. It does not outweigh a member of the pilot team, right 80% of the time, who carries 1.39. Heard first and alone, the debate captures the two weaker groups and leaves the pilot team to its own judgment, and the combining rule still decides. Groups deciding apart adopt a better design 65% of the time and a worse one 6%, the agreement mediator 80% and 9%, and pooling by reliability 61% and 5%. Add the reader in parts and the three come within three points of each other, 88% to 91% against 5% to 6%. Add the verified critic and the combined evidence outweighs every member in most reviews, so the three rules land within two points of each other.

{{ layer(n=2, type="Fit", id="region-assumes-independence") }}The region treats every instrument as an independent source, the way the members weigh them. That is the best case. The exhaust step measured what happens when the reader, the debaters and the critic are one model given different instructions.
{{ layer(n=3, type="Estimate", id="region-order") }}The speaking order shows the corollary at work. The agreement mediator alone lost badly when the pilot team spoke last, adopting a worse design 27% of the time under the concentrated split. With the verified critic, the debate and the reading heard first, the pilot team's place on the agenda matters little. Speaking last, the three combining rules adopt a better design 93% to 95% of the time and a worse one 2% to 5%.

<div style="margin:1.5em 0;">
<canvas id="chart-instruments" role="img" aria-label="How often a better and a worse design are adopted as instruments heard before the vote are added one at a time, for each of three ways the groups combine their views. Meeting alone: better designs 40%, 79% and 45%; worse 2%, 8% and 2%. With a debate heard first, better 61% to 80% and worse 5% to 9%; with a reader added, better 88% to 91% and worse 5% to 6%; with a verified critic, better 93% to 94% and worse 2%." style="width:100%;height:320px;display:block;"></canvas>
<figcaption>Instruments take over the meeting, one group at a time. Without instruments, how the groups combine their views moves adoption of a better design from 40% to 79%. A debate heard first outweighs the two weaker groups but not the pilot team, so the rules still differ, 61% to 80%. The reader and the verified critic add evidence until it outweighs every member, and the three rules converge on 93% to 94% better against 2% worse.</figcaption>
<script>
(function(){var S={"id":"chart-instruments","h":320,"ml":[40,46],"mr":[16,24],"mt":24,"mb":42,"els":[{"t":"line","pts":[[0,0.018],[1,0.0559],[2,0.0513],[3,0.0199]],"c":"a","w":1,"mk":2,"dash":true},{"t":"line","pts":[[0,0.4032],[1,0.6548],[2,0.8875],[3,0.9354]],"c":"g","w":2.5,"mk":3.5},{"t":"line","pts":[[0,0.0838],[1,0.0872],[2,0.0561],[3,0.0249]],"c":"a","w":1,"mk":2,"dash":true},{"t":"line","pts":[[0,0.7866],[1,0.7994],[2,0.9073],[3,0.9449]],"c":"d","w":2.5,"mk":3.5},{"t":"line","pts":[[0,0.0208],[1,0.0457],[2,0.0503],[3,0.0169]],"c":"a","w":1,"mk":2,"dash":true},{"t":"line","pts":[[0,0.4492],[1,0.6112],[2,0.8813],[3,0.9297]],"c":"b","w":2.5,"mk":3.5},{"t":"txt","x":0,"y":0.4032,"s":"apart","al":"left","bl":"middle","dx":8,"dy":12,"c":"g","b":true},{"t":"txt","x":0,"y":0.7866,"s":"agreement","al":"left","bl":"middle","dx":8,"dy":-12,"c":"d","b":true},{"t":"txt","x":0,"y":0.4492,"s":"reliability","al":"left","bl":"middle","dx":8,"dy":-12,"c":"b","b":true},{"t":"txt","x":3,"y":0.9449,"s":"better designs: the three rules meet","n":"better: rules meet","al":"right","bl":"bottom","dy":-8,"c":"ink"},{"t":"txt","x":0,"y":0.0838,"s":"worse designs, all three rules (red, dashed)","n":"worse, dashed","al":"left","bl":"bottom","dx":8,"dy":-10,"c":"a"}],"X":{"lo":0.0,"hi":3.0,"ticks":[[0,"meeting alone"],[1,"+ debate"],[2,"+ reader"],[3,"+ verified critic"]],"title":"instruments heard before the vote, added one at a time","ntitle":"instruments added"},"Y":{"lo":0.0,"hi":1.0,"ticks":[[0.0,"0%"],[0.25,"25%"],[0.5,"50%"],[0.75,"75%"],[1.0,"100%"]],"title":"designs adopted","ntitle":"adopted"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=2, type="Fit", id="instruments-stack") }}One feature of the region looks at first like a contradiction. A debate right 75% of the time, heard first, lowered the running review's accuracy when it was alone, because it fell inside the capture band. Yet every widest gap in the region includes that same debate heard first. The reason is that the members weigh independent inputs by adding their log-odds. The debate's 1.10, the verified critic's flag or its silence, and the reader's report together carry far more than any one of them. Their combined verdict is more accurate than the panel's majority even where the debate alone is not. Proposition 7 applies to the combined input, and the band is a property of the whole set of instruments heard first, not of any one of them.

{{ layer(n=2, type="Fit", id="stacking-has-a-price") }}Stacking has a price the region does not show. The inputs add only if they err independently. A debate between two copies of the model that also wrote the critic's flags and the reader's report is one source counted three times. Members who add its log-odds three times are more certain than its record earns. The exhaust step measured that price.

{{ layer(n=3, type="Estimate", id="region-robust") }}The region's main feature survives each constant changed alone. With the model's report of the decisive fact right 75% of the time instead of 95%, the widest gap still combines the verified critic and the debate heard first, at 94% against 7%. With a debate right 90% of the time, the widest gap reaches 96% against 2%. With only half the critic's false flags verified away, it is 94% against 3%. A verified critic heard first is in the widest gap in every case tried.

{{ layer(n=2, type="Fit", id="region-not-a-license") }}The region is not a license to hand the review to machines. Each instrument in the widest gap has a person in it. The critic's flags are verified by people. The debate is heard first only after it has been measured against the panel. The reading's report is checked against a design the people still hold whole. Without those people, the same instruments are a contrarian critic, an unmeasured debate and a model reading from the end of its context, and the region shows what each of those does.

{{ layer(n=3, type="Estimate", id="binding-computed") }}The model can compute what the framework estimates by hand. In two pieces, under the unrouted protocol, one step of better verification adds 16 points of gap, a quarter more grounded checks by the machine add 2, settling twice as fast adds nothing, and one more piece costs a point. In four pieces the verification step is worth 29 points. Verification binds. Once every dispute is resolved correctly, the binding constraint moves: one more piece now adds 5 points, because more eyes catch the flawed piece at linear cost. The meeting gives a different answer. Verification and grounded checks add nothing to it, settling twice as fast adds under a point, and one more piece costs 26. Its constraint is the mesh itself, and only the change of protocol relaxes it.

{{ layer(n=2, type="Fit", id="framework-stop") }}The framework also says when to stop: when no relaxation clears the threshold that would justify its cost. Here that is when no single step adds a point of gap, or when what remains is the gates. The attention figure above shows, for each split of the design, what each kind of review spends and what it buys, so a team can see its own bill before it spends anything.

{{ layer(n=2, type="Fit", id="instrument-check-why") }}The reader was calibrated against measured curves. The debate, the advocate and the critic can be checked the same way, on the direction of their effects if not on their sizes. The published studies measured exactly the comparisons the model makes.

{{ layer(n=3, type="Estimate", id="check-debate") }}Khan and coauthors found judges more accurate with debate than with no help, and more accurate as the debaters grew more persuasive. In the model, a debate heard first raises adoption of the better design and lowers it for the worse one once its accuracy clears the panel's majority. A more accurate debate widens the gap: from 0.49 at 75% accuracy to 0.79 at 90%. Persuasive debaters who argue both sides are, in the model, a more accurate shared input, and the direction matches.

{{ layer(n=3, type="Estimate", id="check-consultancy") }}The same study found a single consultant less useful than a debate, and less useful still as the consultant grew more persuasive. In the model, a single advocate with a lead of one signal raises adoption of the worse design from 20% to 38%, and with a lead of two captures the review entirely. The direction matches again: persuasion without an opponent moves the review away from the truth, and more persuasion moves it further.

{{ layer(n=3, type="Estimate", id="check-critic") }}McAleese and coauthors found critics catching more bugs and inventing more, and people with a critic inventing fewer while catching about as many. In the model, the unverified critic raises rejections of both designs. Verification removes the false rejections while keeping the true ones: the better design rises from 68% to 94% as the verified share grows from none to nine in ten, and the worse design stays at 14%. The human-plus-critic team of the study is the verified critic of the model.

{{ layer(n=2, type="Fit", id="check-limits") }}The checks are of direction, not size. None of the studies ran a design review, and none reported the adoption of better and worse designs. The debate study used reading-comprehension questions with hidden passages; the critic study used code. What the checks establish is that the model's instruments move the review the way the measured instruments moved their judges, which is the transfer the first post called a Fit.

## Monday Morning: Running the Protocol

{{ layer(n=2, type="Fit", id="mm-intro") }}The protocol needs five roles, five artifacts and one schedule. Everything in this section is a starting point to tune on a team's own records, not a result of the model. The thresholds especially are first guesses.

| Role | Who | Owns |
| :--- | :--- | :--- |
| Decision owner | The design's author or technical lead | The attention budget and the decision record |
| Machine bench | Agents with access to the design, the code and the running system | Everything that can be settled from text and checks, and the list of what cannot |
| Integrator | One engineer who reads the whole design, often the decision owner | The relational questions: facts that span distant parts, which no part and no reading in parts holds |
| Residual owners | The one to three people who hold each unwritten fact | Their answers, and nothing else |
| Approvers | The existing gates | Reading the decision as carried, margin and dissent included |

{{ layer(n=2, type="Fit", id="mm-no-reviewers") }}Nobody holds the general role of reviewer. That role is the one that turns people into monitors of the machine. One person holds the whole design for the questions that span its parts, and everyone else answers only what they hold.

| Artifact | Written by | Holds |
| :--- | :--- | :--- |
| Decision brief | Decision owner | The question, the options, the attention budget and the deadline, on one page |
| Residual sheet | Machine bench, extended by residual owners | One row per unsettled question: why it is unsettled, who likely knows, what evidence would settle it, whether it could change the decision |
| Probe card | Machine bench | One per holder and question: a query, test or trace of its own, with no machine answer attached |
| Departure log | Decision owner | Every answer that differed from the reference, how it was settled and by what evidence |
| Decision record | Decision owner | The decision, its margin, dissent in its owners' words, the owner of each answer, and a date to check the outcome |

{{ layer(n=2, type="Fit", id="mm-schedule") }}A single decision runs in about a week. On the first day the owner writes the brief and sets the budget, and the machine bench reads, checks, amends and lists. The owner then cuts the list to the questions that could change the decision and fit the budget. Over the next two days each residual owner answers their probe cards alone, and adds any question the list missed. The diff closes matching answers on its own. On the fourth day one short meeting takes only the departures and their holders, each settled by running the evidence rather than by debate. An empty agenda means no meeting. The record goes to the approvers as written, and the outcome is checked a quarter later.

{{ layer(n=2, type="Fit", id="mm-prompts") }}Three prompts carry the machine bench. The exhaust prompt asks it to read the design in overlapping parts and say, for each claim, whether a document or a check settles it. For each one it cannot settle, it says why, who would likely know, what evidence would settle it, and whether the answer could reverse the decision. The approver prompt gives it each approver's stated priorities and asks for the smallest change every approver prefers to the current system, with its cost to the design. The probe prompt asks, for each question and each named holder, for a different, independently checkable probe that contains none of the bench's own answers.

| Gauge | Starting healthy range | Alarm | Action |
| :--- | :--- | :--- | :--- |
| Attention spent against budget | At or under budget | Well over budget, repeatedly | Improve the exhaust step, not the meeting |
| Departure rate | Steady, well above zero | Near zero across several decisions | Check that answers are recorded before the reference is read |
| Departures proven right | About half or more | A falling share | Re-route the questions |
| Residual size | Slowly shrinking | Zero, or growing | Zero means nobody looks; growth means the machines are not learning |
| Outcome surprises | Rare, and traced to a question | Traced to no question | Add the missing question to the exhaust prompt |

{{ layer(n=2, type="Fit", id="mm-rollout") }}Roll it out in shadow first. Run the protocol beside the existing review on a handful of decisions and compare what each found and what each cost. Switch one kind of decision, such as migrations, once the residual sheets and probes find what the meetings found in less owner-time. Keep some reviews with the machines off, as the manual practice of Step 7.

{{ layer(n=2, type="Fit", id="mm-anti-patterns") }}Four habits undo the protocol, and each maps to a result above. A shared summary read before answering is the captured panel. Asking everyone to review everything is the mesh. Settling a departure by vote throws away the verification that binds. And naming an owner for an answer they never gave builds the crumple zone.

## Scaling the Instruments

{{ layer(n=2, type="Fit", id="scaling-reading") }}Each instrument scales differently as a review grows. Reading scales by parts. A design twice as long, read whole, fills twice the share of the window and sinks deeper into the middle dip. Read in parts, it keeps each part's fill fixed and costs only the overlap, a quarter more reading at the overlap modeled here. The cost that does not scale is the relational question, which no arrangement of calls answers well and which grows with the number of interacting parts of the design.

{{ layer(n=2, type="Fit", id="scaling-critics") }}Critics scale against the people who verify them. A critic's false flags grow with the size of the design, and each flag costs a person time to check. A review that adds critics without adding checking time drifts toward the unverified critic of the model, whose flags the review reads as evidence whether or not they are true. The verified share is the quantity to protect, not the number of critics.

{{ layer(n=1, type="Bound", id="monoculture") }}Instruments also scale across reviews, and there they correlate. Kleinberg and Raghavan showed that when many decision makers adopt the same algorithm, collective decisions can get worse. That holds even when the algorithm is more accurate for each decision maker alone, because their errors now coincide{{ cite(ref="20", title="Kleinberg, J. and Raghavan, M. (2021) -- Algorithmic Monoculture and Social Welfare, PNAS 118(22)") }}.

{{ layer(n=2, type="Fit", id="monoculture-in-reviews") }}For reviews this is the first stage of the series at the scale of an organization. A single critic or debate deployed across every team's reviews is a shared component of judgment, like the shared incidents behind the first post's correlation. Heard first everywhere, it captures every panel the same way, and the organization's decisions err together where it errs. Corollary 3 makes that concrete: the reviews' own procedures no longer differ in outcome, so their errors are the instrument's errors. Keeping instruments measured per domain, and keeping the people who verify them independent, is how an organization keeps its reviews from becoming one review.

## Reading Your Own Instruments

{{ layer(n=2, type="Fit", id="read-the-gates") }}The checks follow the steps of the Residual Protocol. Before any of them, ask whether any change could pass every approver. If none could, stop here and work on the gates.

{{ layer(n=2, type="Fit", id="read-the-debate") }}First, measure whatever will be heard first: the debate. Run it on past questions whose answers are known, and run your panel's blind majority on the same questions. Compare the two. Only a debate that beats the majority earns the first word.

{{ layer(n=2, type="Fit", id="read-the-mediator") }}Then check the mediator, the other tool that decides who hears what first. Ask whether it carries conclusions from one group to the next, or collects every judgment before anyone hears another. If it carries conclusions, look at who speaks first and whether that group holds the most evidence. If it pools, ask how it weighs each group, and whether the weights come from a record of being right.

{{ layer(n=2, type="Fit", id="read-the-sources") }}Then list the instruments' sources before counting them. Run each on the same past questions with known answers and measure how often they are wrong together, as the second post measured panels. Instruments whose errors move together are one instrument with several voices, whatever their prompts say.

{{ layer(n=2, type="Fit", id="read-the-budget") }}Then count your own energy. For one past review, list each piece and the people who held an opinion on it, and count the pairs that had to be reconciled. That is the meeting's bill. Then count only the opinions that departed from the machines' consensus on the same pieces. That is the protocol's bill. If the first is many times the second and your reviews keep moving to next quarter, the review is running out of energy, not out of evidence. Spend the difference on verifying disputes, the lever that decides what the protocol buys.

{{ layer(n=2, type="Fit", id="read-the-routing") }}Then check the routing. For a past decision whose outcome is known, list the facts that turned out to matter and who held each one. Ask whether those people were asked, and whether anyone was asked who held none of them. Then ask your machines for their list of unsettled questions on that design, and see whether the facts that mattered were on it.

{{ layer(n=2, type="Fit", id="read-the-critic") }}Then measure the critic on both numbers: how many real problems it raised, and how many it invented. Then measure what share of its inventions your people catch before the review hears them. That share, not the critic's catch rate, decides whether the critic widens the review's gap or only moves it along its curve.

{{ layer(n=2, type="Fit", id="read-the-reader") }}Last, test the reader. Take a few of your own design documents, plant one checkable fact at the start, the middle and the end, and ask the model about each, whole and in parts. Do the same with a pair of facts that only matter together. If the middle fact goes missing in whole readings, read in parts. If the paired facts go missing in parts, keep those questions for the people who hold the whole design.

## Where This Sits Among Known Results

{{ layer(n=1, type="Bound", id="known-pieces") }}Each input is known. Position effects in long contexts and the shrinking effective window come from long-context evaluation. AI mediation and multiagent debate come from work that optimizes for agreement among people or models. Debate as oversight, and its measurement against consultancy, come from AI safety research. Critic models and sycophancy tuning come from alignment work, hidden profiles and social influence from group psychology, weighting by record from forecasting, and monoculture from economics. The cascade rule, the hand-off, the gates and the law of triviality come from the earlier posts. Complementarity between people and machines, the ironies of automation and the moral crumple zone come from human-factors research and the study of automated systems.

{{ layer(n=2, type="Fit", id="what-the-literatures-miss") }}Each literature studies one instrument against one baseline. The long-context work measures recall, not what a review does with it. The mediation and debate work measures agreement or a judge's accuracy, not the adoption of better and worse designs. The critic work counts bugs caught and invented, not what a review decides once it hears the flags. None of them puts its instrument into a review with correlated members, ordered votes, hand-offs and gates, and none of them compares the instruments with each other.

{{ layer(n=2, type="Fit", id="what-is-new") }}This post adds seven things. It reads each tool as an input to one review model, so the tools can be compared on the same two numbers, and calibrates the reader against measured curves. It finds that people and models need opposite partitions of one design, which reverses the instruction to hand the model everything. Proposition 7 states when a shared input captures a panel and when that capture costs accuracy, which turns the debate and consultancy measurements into a rule a review can apply. Corollary 3, with the region behind it, says that once accurate instruments are heard first the meeting's procedure stops deciding. Proposition 8 counts the human energy of a review, which turns a fixed attention budget from advice into arithmetic. The plane of accuracy and correlation shows that once combining runs out, accuracy moves a review more than independence does, and that shared evidence buys less of it than evidence of one's own. And the post assembles the results into the Residual Protocol, a framework a team can run inside the review it already holds. Its routing, its open list and its named owners keep it honest about the machines' blind spots and about responsibility. Most work on human oversight of AI treats attention as a capacity to schedule case by case. The protocol decides what a group spends it on, and in what order relative to the machine. The order dependence of agreement mediation, the value of verifying a critic, routing and probing are estimates in this series' model.

## Falsification Criteria

Each criterion names an observation that would refute this post, with the prediction the model makes for it.

**F14 (a debate heard first captures the panel).**
- *Condition:* panels that hear a two-sided debate between models before voting, and panels that hear it after, on questions with known answers, with the debate's own accuracy measured.
- *Prediction:* when the debate is more accurate than one member, members who hear it first vote with its verdict and the panel's accuracy moves to the debate's; hearing it first lowers accuracy whenever the debate is less accurate than the panel's own majority.
- *Refuted if:* members who heard a more accurate debate first keep voting independently of its verdict, or hearing first a debate less accurate than the panel's majority leaves the panel's accuracy unchanged.
- *Ground truth and null:* the known answers; the null is member votes uncorrelated with the debate's verdict.

**F15 (a persuasive single advocate captures the review).**
- *Condition:* reviews in which one model argues for the design whatever its merit, at controlled persuasiveness, against reviews that hear a two-sided debate.
- *Prediction:* the adoption of worse designs rises with the single advocate's persuasiveness until the review adopts both kinds of design alike, and does not rise under a two-sided debate.
- *Refuted if:* worse designs are adopted no more often as the single advocate grows more persuasive.
- *Ground truth and null:* merit judged after the decision; the null is adoption that does not depend on the advocate.

**F16 (agreement mediation depends on who speaks first).**
- *Condition:* reviews of designs whose merit is later known, held by groups with unequal evidence, mediated by carrying conclusions from group to group, or by pooling blind judgments weighted by each group's record.
- *Prediction:* under carried conclusions the adoption of worse designs rises when the best-informed group speaks last; under weighted pooling it does not depend on the order.
- *Refuted if:* the order makes no difference to carried conclusions, or weighted pooling adopts worse designs more often than carried conclusions in every order.
- *Ground truth and null:* merit judged after the decision from outcomes; the null is outcomes that do not depend on the order of speaking.

**F17 (roles of one model are one instrument).**
- *Condition:* instruments built from one model with different system prompts (reviewer, advocate, critic), and instruments from different providers, run on questions or past decisions with known answers.
- *Prediction:* roles of one model err together far more than chance, adding roles lowers the combined verdict's error toward a floor well above zero rather than toward zero, and instruments from different providers decorrelate less than their separate origins suggest; heard first, such a stack raises adoption of worse designs above what independent instruments give.
- *Refuted if:* the combined error of a growing number of roles of one model keeps falling toward zero, or roles of one model err no more together than instruments checked against a ground-truth channel.
- *Ground truth and null:* the known answers; the null is independent errors across roles.

**F18 (a critic helps only through its verification).**
- *Condition:* reviews that hear a critic model's flags before voting, with a measured share of its false flags checked and removed by people, on designs whose merit is later known.
- *Prediction:* an unverified critic barely changes the gap between adopting better and worse designs; as the verified share grows, adoption of better designs rises while adoption of worse designs stays put; the widest gaps among combinations of instruments include a verified critic heard first.
- *Refuted if:* verifying the critic's flags leaves the gap unchanged, or combinations without a verified critic match the widest gaps.
- *Ground truth and null:* merit judged after the decision; the null is a gap that does not depend on verification.

**F19 (a long document loses its middle).**
- *Condition:* a model reviewing design documents into which one decisive fact is planted at controlled positions, either at one place or split between two places that must be read together, at several fills of its effective window, read whole and in parts.
- *Prediction:* read whole, the model uses a local fact least often in the middle and less often the fuller the window; reading in parts raises its use of local facts and lowers its use of the paired ones.
- *Refuted if:* reading in parts fails to raise the use of local facts near a full window, or fails to lower the use of paired facts at eight parts.
- *Ground truth and null:* the planted facts and their positions; the null is use that does not depend on position or on parts.

**F20 (the residual surfaces unwritten facts).**
- *Condition:* comparable designs reviewed two ways: people reading the whole design after hearing model summaries and critics first, against the Residual Protocol, with the machines' list extended by holders, each question answered alone by its routed holders, and the meeting confined to departures.
- *Prediction:* the protocol surfaces more facts that only one reviewer held, adopts worse designs less often, detects no fewer defects that span distant parts of the design, and spends less owner-time, the more so the more pieces the design is reviewed in.
- *Refuted if:* the protocol adopts worse designs as often or more, surfaces no more single-holder facts, misses more defects that span distant parts of the design, or spends as much owner-time as the review it replaces.
- *Ground truth and null:* incidents, rollbacks and defects traced to the reviewed designs over the following quarters; the null is no difference between the two ways.

**F21 (the departure rate shows capture).**
- *Condition:* comparable design reviews run two ways: holders recording their answers before any AI summary, and holders recording answers after seeing one.
- *Prediction:* holders who answer first depart from the AI's answer at a steady rate well above zero, more often on pieces that later turn out to hide a local flaw; holders who saw the AI first depart much less often, whether or not it was right.
- *Refuted if:* the departure rate does not differ between the two orders, or departures recorded first are no more frequent on flawed pieces than on sound ones.
- *Ground truth and null:* defects and incidents traced to the reviewed pieces; the null is the same departure rate under both orders.

**F22 (probes sharpen without aligning).**
- *Condition:* holders answering the same residual questions three ways: alone with no machine evidence, with one shared machine summary, and with probes of their own (a query, test or trace different for each holder), on questions whose answers are later known.
- *Prediction:* both the summary and the probes raise each holder's accuracy; the summary raises the correlation of holders' errors and the probes do not, so at equal accuracy the probes widen the gap between adopting better and worse designs more than the summary.
- *Refuted if:* the probes raise the correlation of errors as much as the shared summary, or raise accuracy no more than answering alone.
- *Ground truth and null:* the known answers; the null is equal accuracy and equal error correlation under all three conditions.

**F23 (holders find what the list misses).**
- *Condition:* decisions run under the Residual Protocol with holders allowed to add questions, each question's origin recorded, and outcomes traced to the questions that decided them.
- *Prediction:* when the deciding question turned on a local fact, the machines' list contains it no more often than a question picked at random from the design, and questions holders added decide outcomes more often than their share of all questions.
- *Refuted if:* the machines' list contains the deciding local-fact question far more often than chance, or added questions decide outcomes no more often than listed ones.
- *Ground truth and null:* outcomes traced to the questions that decided them; the null is listing and adding equally likely to hold the deciding question.

## The Ledger of a Rejected Design

The series' ledger gains its instrument rows. Each names a tool, the law it meets, the lever and the bill.

**Combining, with a mediator**

*Belief:* a mediator that finds common ground ends the stall.

*Law:* carried conclusions are a cascade between groups, and the review inherits the order of the agenda; blind judgments pooled by reliability do not depend on it.

*Lever:* collect judgments blind, pool them by each group's record, and spend the mediator's effort on sharpening disagreements.

*Bill:* with the best-informed group speaking last, carried conclusions adopt a worse design 27% of the time, against under 1% for weighted pooling.

**Dissent, with a debate or a critic**

*Belief:* a machine can supply the dissent people withhold.

*Law:* Proposition 7, a shared input that outweighs a member's own judgment by more than the probing weight captures that member, and a captured panel gains only when the input is more accurate than the panel's majority.

*Lever:* measure the debate against the panel before it speaks first; tune critics to stop agreeing and to point at evidence.

*Bill:* a persuasive single advocate captures the review, which then adopts better and worse designs alike, 97% of the time; an unverified critic moves the review along its curve, and a verified one widens the gap from 0.52 to 0.80.

**Human energy**

*Belief:* more review is more safety, and the machines make review free.

*Law:* Proposition 8, settling every pair of opinion holders costs a review the square of its holders, and settling only departures from a reference costs it their number.

*Lever:* the Residual Protocol, with answers recorded before the reference is read, each question routed to the holders of its fact, and every dispute verified.

*Bill:* in four pieces, 134 settlements and almost no decision for the meeting, against 3.4 settlements, 79% of better designs and 9% of worse ones unrouted, and 0.8 settlements, 93% and 10% routed to two holders of each fact; the machine heard first spends nothing and adopts every design.

**Reading, with a model**

*Belief:* a model with a long window reads the whole design.

*Law:* use of a fact falls in the middle of a long input, and near the window the beginning fades too; reading in parts recovers local facts and loses facts that need two distant passages.

*Lever:* split the reading, not the design: the model reads overlapping parts, people hold the whole.

*Bill:* near a full window a whole reading uses a local fact 63% of the time and a pair of distant facts 40% of the time.

**The instruments together**

*Belief:* better meeting procedure is the lever.

*Law:* Corollary 3, once shared inputs heard first capture every member, neither the combining rule nor the order of speaking changes the verdict; below capture, a blind vote ignores them and a sequence takes them as a head start.

*Lever:* measure every instrument that will be heard first, count instruments by source rather than by role, and verify the critic's flags.

*Bill:* without instruments the pilot-team review adopts a better design 40% of the time; with the critic verified, the debate first and the reading in parts, 93% to 94%, against about 2% for a worse one when the instruments are independent, and about 4.5% when they are roles of one model at the measured correlation.

**Accuracy, once combining runs out**

*Belief:* better meeting procedure is the lever.

*Law:* past the first post's levers, only each person's accuracy and the independence of their errors move the review, and accuracy moves it more; evidence that makes people alike returns less than the same accuracy earned independently.

*Lever:* route each question to the holders of its fact, give each holder evidence of their own, and carry the decision as recorded.

*Bill:* with all six levers, 71% of better designs adopted against 7% of worse; with accuracy at 80%, 86% against 2%; with the verdict carried unweakened and approvers reading the record as well, 96% against 3%.

**Blind spots, with a machine's list**

*Belief:* the machines can tell people what to look at.

*Law:* a machine's doubt is blind to its own blind spot, so the flawed piece is listed no more often than a sound one.

*Lever:* let every holder add a question the list missed, and route it like any other.

*Bill:* listing half the pieces at random leaves a worse design adopted 54% of the time; with holders adding three in four missed flaws and no list, 33%; listing everything, 10% at twice the settlements.

## The Review, Run With Instruments

The design review of [Correct, and Rejected](@/blog/2026-11-14/index.md) took ninety minutes and ended with a decision to revisit next quarter. The second post replaced its reviewers with agents and got the same result for different reasons. Run it a third time, under the Residual Protocol.

The owner set the budget first: about a day of owner-time across the whole decision, and one meeting only if the departures needed it. The machines then checked the gates. The incumbent still sat inside the priorities of the architecture board, the engineering manager, security and product, so no evidence would have moved it. One gate's priorities were rewritten after the outage, and only then did an amended version exist that every approver preferred, at a stated price to the design.

The machines read the design in overlapping parts and checked what they could against the running system. They listed five questions they could not settle. The failover rule buried on page thirty was among them; a whole reading near the edge of the window would have missed it one time in three under the stated shape. The list did not include how that rule meets the retry limit forty pages later. The two engineers who remember the outage added that question themselves.

Each question went to the two or three people who held its fact. Each of them answered alone, with a probe of their own: a log query for the on-call engineer, a failover test for the platform team, the incident trace for the engineers who added the retry question. Nobody saw the machines' answers first.

The diff closed most answers without a word. Three departed. Two were settled that week by running the probes again against the running system, and neither changed the decision. The third, the retry question, changed the design. The meeting took twenty minutes, with only the holders of those three answers in the room.

The decision went to the approvers as recorded: its margin, the three departures and how each was settled, and the remaining dissent in its owner's words. Every answer carried a name, and the record held a date a quarter out to check what happened. Across the year's reviews the departure rate stayed steadily above zero, and the residual shrank a little each quarter without reaching zero.

## What This Post Did Not Claim

**Reversal condition.** The advice of this post is to read designs in parts with models, pool blind judgments by reliability, and hear a debate first only when it beats the panel's majority. It reverses for a model whose recall does not depend on position, for groups whose evidence is equal, where weighting changes nothing, and for a debate measured as more accurate than the panel, which should speak first.

### What Is Not Claimed

The positional recall of Definition 7 is a shape chosen to follow published measurements, with its constants swept rather than fitted to any model. The direction of the reading results holds across the sweep. Their sizes describe the stated shape, not a measured model. No model was run on design documents for this post.

The calibration fits Definition 7 to six models from 2023 on multi-document question answering. The fitted curves are identified and the parameters are not. The reading results for parts extrapolate each curve to shorter inputs by a rule the data support for one model and barely constrain for the others. Newer models are better at long inputs; the shape, not the level, carries the argument. The critic's catch and false-flag rates are illustrative, in the direction of the cited measurement, and the region's report and debate accuracies are illustrative and changed one at a time. The region treats instruments as independent; the shared-source results replace that with latent correlations chosen to match the measured right-or-wrong correlations of judges, not measured on reviews.

The mediation and debate results are estimates in the series' review model. The agreement mediator is read as carried conclusions, which is how such a tool combines groups when it builds a statement group by group. A real mediator may weigh groups in other ways, and then it sits between the two rules modeled here. Proposition 7 assumes members who treat every input as independent evidence. Members who discount a shared input are captured only by a more accurate one; the form of the band stays and its edges move.

The Residual Protocol is a framework assembled from these results, not a protocol tested whole. Its human energy and its adoption of better and worse designs are computed in the model, and its parts carry their own assumptions. Routing assumes the holders of each fact are known; holders chosen at random fare far worse, as Step 3 shows. The integrator who answers the relational questions is not modeled. The model shows only that readings in parts rarely connect distant passages, so those questions need a person who holds the whole design. F20 tests whether the protocol misses no more of them. The machines' list is modeled as blind to the flaw, which is the second post's case and the hardest one. The probe step assumes evidence of one's own can raise accuracy without raising correlation, which the model sets rather than derives. The amendment assumes approvers with stated priorities and distances measured in a plane. The roles, artifacts and thresholds of the Monday-morning section are starting points, not results. Whether the departures surface facts nobody wrote down is the prediction F20, whether the departure rate works as its gauge is F21, whether probes sharpen without aligning is F22, and whether holders find what the list misses is F23. The rate's healthy level depends on how often a team's reviewers object to sound work, which the model takes from the first post's calibration and a real team would measure for itself. The settlement count assumes one owner reconciling disputes one at a time. A team that settles in parallel spends the same settlements in less time.

Three open questions are named on purpose. How a mediator would learn each group's precision without a record of outcomes is not modeled. How much an AI mediator actually shortens the time to settle a disagreement has not been measured, so the window results show what a given speed-up would buy rather than what a tool delivers. And whether models reading in parts with a shared index recover relational facts is not modeled; the post treats each part as read alone.

### Where Each Claim Holds

The claims of this post leave their conditions in eight recurring ways, and each is listed in full in the drawer below with its assumption and failure mode.

**Models without a position effect.** A model whose recall is flat across its context gains nothing from reading in parts, and still loses relational facts to them.

**Groups with equal evidence.** When every group holds the same share of the evidence, weighted and equal pooling agree, and the order of the agenda matters less to carried conclusions.

**Members who discount shared inputs.** Reviewers who know a debate is one source among many need a more accurate debate before they follow it, which moves the edges of the capture band.

**Critics nobody checks.** A critic whose flags reach the review unverified moves it along its curve, raising rejections of better designs as fast as of worse ones; the critic's value in this post assumes people verify its flags.

**Critics that cite evidence.** A critic whose objections each point at a checkable fact is scored objection by objection, and does not act as a single advocate for rejection.

**Holders nobody can name.** Routing assumes the holders of each fact can be named; where they cannot, the protocol routes at random and adopts worse designs far more often.

**Shared evidence.** Probes that all lean on one source raise correlation along with accuracy, and return less than the same accuracy earned independently.

**Closed gates.** While the status quo sits inside the gates' hull, every instrument in this post is worth nothing, as Proposition 3 says.

<details>
<summary>Every claim, with its assumption and failure mode, in the order the post derives them</summary>

**Claim.** Read whole near a full window, a model uses a local fact far less often than in parts, and in parts it loses facts that need two distant passages.
- *Assumption:* Definition 7's shape, with each part read in its own call.
- *Failure mode:* models with flat recall, or parts read with a shared index of the whole.

**Claim.** People and models need opposite partitions of one design.
- *Assumption:* the law of triviality of the first post and the reading results here.
- *Failure mode:* reviewers who keep their opinions on simple pieces to themselves, or models with flat recall.

**Claim.** An agreement mediator rescues stalled reviews and adopts worse designs more often, by an amount that depends on which group speaks first.
- *Assumption:* the mediator modeled as carried conclusions of one or two signals.
- *Failure mode:* mediators that weigh groups by their evidence.

**Claim.** Blind judgments pooled by reliability keep worse designs rare in every order, and with concentrated evidence adopt better designs more often than deciding apart.
- *Assumption:* weights equal to the log-odds of each group's precision.
- *Failure mode:* weights learned with error, or evidence spread evenly.

**Claim.** Faster settling keeps more groups inside the decision window, and does not rescue a design split into simple pieces.
- *Assumption:* the window and triviality models of the first post, with the settling time halved or quartered.
- *Failure mode:* mediation that also reduces the number of opinion holders.

**Claim.** A shared input that outweighs a member's own judgment by more than the probing weight captures that member, and a captured panel loses accuracy when the input is less accurate than the panel's majority (Proposition 7).
- *Assumption:* members who treat inputs as independent evidence, by the rule of Proposition 2.
- *Failure mode:* members who discount shared inputs.

**Claim.** Fitted to six measured models, reading in parts raises the use of a local fact for every model, and no arrangement uses a relational fact reliably.
- *Assumption:* use as the share of the oracle's gain over the no-document baseline; Definition 7 with free end weights, extrapolated to shorter inputs.
- *Failure mode:* models whose dip does not shrink with shorter inputs, or newer models whose curve is flat.

**Claim.** A critic widens the gap only through the share of its false flags people verify away; a contrarian critic captures the review toward rejection.
- *Assumption:* the critic's illustrative catch and false-flag rates; members who weigh flags by their record.
- *Failure mode:* reviewers who discount flags they have not checked, or critics whose false flags are rare to begin with.

**Claim.** Once shared inputs heard first capture every member, neither the combining rule nor the order of speaking changes the verdict, and below capture both decide how much the inputs weigh (Corollary 3); the widest gaps in the region combine a verified critic and a debate heard first.
- *Assumption:* Proposition 7's members, and the region's illustrative instrument accuracies.
- *Failure mode:* members who discount shared inputs, or instruments less accurate than the panel's majority.

**Claim.** Roles of one model err together, so a stack of them heard first errs at the floor of their shared source however many there are (Corollary 2), and raises adoption of worse designs.
- *Assumption:* Definition 6's latent correlations, set to match measured judge correlations; instruments weighed as if independent.
- *Failure mode:* roles that reach different evidence, such as debaters who run tests, which makes them separate sources.

**Claim.** A persuasive single advocate captures the review, and a debate heard after the vote moves it little.
- *Assumption:* the advocate as a public lead toward the design; the debate after the vote weighted by its log-odds against votes counted as independent.
- *Failure mode:* panels that weigh their own votes for correlation.

**Claim.** Settling disagreements against the machines' reference makes a review's human energy linear in its opinion holders, where the meeting's is quadratic, and the protocol decides in time where the meeting stalls (Proposition 8).
- *Assumption:* one owner settling disputes one at a time, the constants of the first three posts, and judgments recorded before the reference is read.
- *Failure mode:* disputes resolved unreliably, which cost better designs, or a reference read first, which captures the room and stops the judging the protocol depends on.

**Claim.** Under the Residual Protocol a holder who answers alone departs from a sound reference at the rate of stray objections, and more often on a piece that hides a local flaw, while a room that reads the machine first departs on nothing (Definition 5).
- *Assumption:* holders who answer before reading the machine, and the objection and catch rates of the first two posts.
- *Failure mode:* holders who copy the machine into their answers, which drives the rate toward zero without anyone seeing the machine first.

**Claim.** Past the first post's six levers, only each person's accuracy and the independence of their errors move the review, and accuracy moves it more; a shared briefing that raises correlation returns less than the same accuracy earned independently.
- *Assumption:* accuracy and correlation as separate settings of the one-factor model, at the corner of the first post's levers.
- *Failure mode:* evidence that raises accuracy only by aligning people, which the model would count as independent.

**Claim.** Routed to the holders of each fact, the protocol adopts worse designs about as rarely as the unrouted protocol at a fraction of its settlements; routed at random, it adopts worse designs far more often.
- *Assumption:* holders of the fact catch the flaw 0.9 of the time, others at the second post's informed share; the constants of the first three posts.
- *Failure mode:* holders who cannot be named, or a fact held by nobody asked.

**Claim.** A machine blind to a fact lists the piece that hides it no more often than a sound one, so the questions holders add decide how often a blind spot reaches the decision.
- *Assumption:* listing independent of the flaw, and questions added only by holders of the fact.
- *Failure mode:* machines whose doubt does track their blind spots, or holders who add questions at random.

**Claim.** When no design passes every approver as it stands, the nearest version that does usually exists and keeps part of the design's advance, less as approvers are added.
- *Assumption:* stated priorities as ideal points in a plane, with Euclidean preferences, and late approvers placed as in the first post.
- *Failure mode:* approvers whose priorities are unstated, or not expressible as distances.

**Claim.** Carrying the verdict as recorded, and approvers reading the record, both raise the adoption of a better design and let slightly more of a worse one through.
- *Assumption:* the first post's hand-off and gate noise, with nothing lost in relay and the noise halved.
- *Failure mode:* records the approvers do not read.

</details>

### Results This Series Exports

Later series can import these results by number.

- Proposition 1: the large-panel floor of a correlated majority, {% katex() %}\Phi(\Phi^{-1}(p)/\sqrt{\rho}){% end %}.
- Proposition 3: the veto cliff, no change preferred by every gate when the status quo lies in the hull of their ideal points, with Euclidean preferences.
- Proposition 4: learning from recorded reasons as causes converges to {% katex() %}\varphi\theta + (1-\varphi)b{% end %}, and the records alone cannot reveal it.
- Proposition 5 and Corollary 1: the upgrade condition and the critical elasticity that shrinks as members improve.
- Proposition 6: in a large unweighted panel, agents that share a blind spot set the chance of adopting a worse design, whatever the people know.
- Definition 5: the Residual Protocol, budget, exhaust, route, probe, diff, carry and own: machines settle what can be written, and a fixed human budget goes to the questions they cannot settle, routed to the people who hold them; its departure rate is the share of routed answers that depart from the machines' reference.
- Proposition 7: a shared input heard first captures a panel once its log-odds exceed one member's by more than the probing weight, and costs accuracy when it is less accurate than the panel's majority.
- Corollary 3: once shared inputs heard first capture every member, neither the combining rule nor the order of speaking changes the verdict; below capture, a blind vote ignores them and a sequence takes them as a head start.
- Proposition 8: settling disagreements against a reference costs the review n s d settlements per piece instead of the mesh's C(n,2) s^2, so its human energy grows linearly in the opinion holders instead of quadratically.
- Corollary 2: roles of one source, heard first, err at Proposition 1's floor for that source however many there are.
- A proposal, untested as a whole: the Residual Protocol's routing, open list and probes, stated as predictions F20 to F23.
- Definitions 6, 7 and 8: the instrument's source, positional recall, and the agreement and difference mediators.

{% cognitive_map(root="The Machine Gets the First Word") %}
{
  "intro": "A review spends two budgets, human energy and the machine's, and past the first post's levers only sharper, independent judgments move it. The Residual Protocol spends the machines on everything that can be written and a fixed human budget on the residual, routed to the people who hold it, each answering alone with evidence of their own.",
  "groups": [
  {"theme": "Budget and Exhaust", "c": "mint", "points": [
    [1, "Combining Runs Out", "With all six of the first post's levers a better design is adopted 71% of the time and a worse one 7%; fully independent errors move that only to 73% and 4%, so the gains left must come from sharper judgments."],
    [2, "From Author to Residual Owner", "Reviewers are moving from producing work to checking a machine's, the role the ironies of automation warn about; the third rung holds what no text holds and answers for exactly that."],
    [3, "The Residual Protocol", "Definition 5: budget, exhaust, route, probe, diff, carry, own. Machines carry what can be written, and a fixed human budget goes to the questions they cannot settle, routed to the people who hold them."],
    [4, "A Price List for the Gates", "With four approvers added late a design passes as it stands 10% of the time; the nearest version every approver prefers exists 86% of the time and keeps a median 39% of the design's advance."],
    [5, "One Model Is One Voice", "Roles of one model err together: at the measured correlation nine prompts are wrong 20% of the time and forty-one also 20%, against a floor of 19% (Corollary 2); count instruments by source, and add evidence only through a channel the model lacks."],
    [6, "Split the Reading, Not the Design", "Fitted to six measured models, a whole reading uses a local fact 6% to 44% of the time and four parts 46% to 76%; no arrangement uses a fact that needs two distant passages more than about a fifth of the time."]
  ]},
  {"theme": "Route and Probe", "c": "sky", "points": [
    [7, "Route to the Holders", "In four pieces, two holders of each piece's fact adopt a better design 93% of the time and a worse one 10% for 0.8 settlements; two holders chosen at random let a worse design through 34% of the time."],
    [8, "Blind Spots Do Not List Themselves", "A machine blind to the flaw lists its piece no more often than a sound one: listing half the pieces leaves a worse design adopted 54% of the time, and holders adding what the list missed carry the review."],
    [9, "The Captured Panel", "Proposition 7: a shared input heard first captures every member whose judgment it outweighs by more than the probing weight, and a captured panel loses accuracy when the input falls short of the panel's majority; in the running case any debate between 70% and about 82% accurate does both."],
    [10, "Agreement Inherits the Agenda", "A mediator that carries each group's conclusion to the next rescues stalled reviews, and with the best-informed group speaking last adopts a worse design 27% of the time, against 1% for groups deciding apart."],
    [11, "Pool Blind, Weigh by Record", "Blind judgments pooled by each group's precision keep worse designs near 1% to 2% in every order, and with concentrated evidence adopt better designs 63% to 67% of the time against 34% to 37% for groups deciding apart."],
    [12, "Capture Removes the Agenda", "Corollary 3: once shared inputs heard first capture every member, neither the combining rule nor the order of speaking changes the verdict, so the instruments' accuracy becomes the review's; below capture, the rule and the order decide again."],
    [13, "Sharper, Not More Alike", "Raising each person's accuracy from 70% to 80% moves adoption to 86% and 2%; a shared briefing that also raises correlation to 0.5 keeps about a third of that gain, so each holder gets evidence of their own."]
  ]},
  {"theme": "Diff and Carry", "c": "peach", "points": [
    [14, "The Energy Budget", "Proposition 8: settling against the machines' reference instead of every pair makes the review's human energy linear in its opinion holders; in four pieces the meeting needs forty times the settlements and almost never decides."],
    [15, "Verification Is the Value", "An unverified critic barely moves the review; with nine in ten of its false flags checked away, adoption of a better design rises from 72% to 94% while a worse one stays at 14%."],
    [16, "Carry the Record", "A verdict carried unweakened lifts adoption of a better design from 71% to 78%, and approvers reading the record to 83%; with probes that lift accuracy to 80%, the review reaches 96% against 3%."]
  ]},
  {"theme": "Own and Improve", "c": "rose", "points": [
    [17, "Owners, Not Crumple Zones", "Each answer has a named owner who answers for it alone; outcomes recorded for every departure feed the next routing, and the residual migrates as the machines learn."],
    [18, "The Departure Rate", "A holder who answers alone departs from a sound reference about one time in ten, and on a piece that hides a local flaw nearly half do; a room that reads the machine first departs on nothing, so a rate near zero means the review has stopped measuring."],
    [19, "Gates, Then the Steps", "Repairs follow the steps: the gates, the exhaust, the routing, the order of hearing, the diff, then verification, which binds at the series' operating point, then the accuracy each probe buys and the hand-off."],
    [20, "One Instrument, Every Review", "The same critic or debate deployed across every review becomes a shared component of judgment, so the organization's decisions err together where it errs."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**Budget and Exhaust**

1. With all six of the first post's levers a better design is adopted 71% of the time and a worse one 7%; fully independent errors move that only to 73% and 4%, so the gains left must come from sharper judgments.
2. Reviewers are moving from producing work to checking a machine's, the role the ironies of automation warn about; the third rung holds what no text holds and answers for exactly that.
3. Definition 5: budget, exhaust, route, probe, diff, carry, own. Machines carry what can be written, and a fixed human budget goes to the questions they cannot settle, routed to the people who hold them.
4. With four approvers added late a design passes as it stands 10% of the time; the nearest version every approver prefers exists 86% of the time and keeps a median 39% of the design's advance.
5. Roles of one model err together: at the measured correlation nine prompts are wrong 20% of the time and forty-one also 20%, against a floor of 19% (Corollary 2); count instruments by source, and add evidence only through a channel the model lacks.
6. Fitted to six measured models, a whole reading uses a local fact 6% to 44% of the time and four parts 46% to 76%; no arrangement uses a fact that needs two distant passages more than about a fifth of the time.

**Route and Probe**

7. In four pieces, two holders of each piece's fact adopt a better design 93% of the time and a worse one 10% for 0.8 settlements; two holders chosen at random let a worse design through 34% of the time.
8. A machine blind to the flaw lists its piece no more often than a sound one: listing half the pieces leaves a worse design adopted 54% of the time, and holders adding what the list missed carry the review.
9. Proposition 7: a shared input heard first captures every member whose judgment it outweighs by more than the probing weight, and a captured panel loses accuracy when the input falls short of the panel's majority; in the running case any debate between 70% and about 82% accurate does both.
10. A mediator that carries each group's conclusion to the next rescues stalled reviews, and with the best-informed group speaking last adopts a worse design 27% of the time, against 1% for groups deciding apart.
11. Blind judgments pooled by each group's precision keep worse designs near 1% to 2% in every order, and with concentrated evidence adopt better designs 63% to 67% of the time against 34% to 37% for groups deciding apart.
12. Corollary 3: once shared inputs heard first capture every member, neither the combining rule nor the order of speaking changes the verdict, so the instruments' accuracy becomes the review's; below capture, the rule and the order decide again.
13. Raising each person's accuracy from 70% to 80% moves adoption to 86% and 2%; a shared briefing that also raises correlation to 0.5 keeps about a third of that gain, so each holder gets evidence of their own.

**Diff and Carry**

14. Proposition 8: settling against the machines' reference instead of every pair makes the review's human energy linear in its opinion holders; in four pieces the meeting needs forty times the settlements and almost never decides.
15. An unverified critic barely moves the review; with nine in ten of its false flags checked away, adoption of a better design rises from 72% to 94% while a worse one stays at 14%.
16. A verdict carried unweakened lifts adoption of a better design from 71% to 78%, and approvers reading the record to 83%; with probes that lift accuracy to 80%, the review reaches 96% against 3%.

**Own and Improve**

17. Each answer has a named owner who answers for it alone; outcomes recorded for every departure feed the next routing, and the residual migrates as the machines learn.
18. A holder who answers alone departs from a sound reference about one time in ten, and on a piece that hides a local flaw nearly half do; a room that reads the machine first departs on nothing, so a rate near zero means the review has stopped measuring.
19. Repairs follow the steps: the gates, the exhaust, the routing, the order of hearing, the diff, then verification, which binds at the series' operating point, then the accuracy each probe buys and the hand-off.
20. The same critic or debate deployed across every review becomes a shared component of judgment, so the organization's decisions err together where it errs.

</details>

**Compute it.** Take one past decision whose outcome you know. Ask your machines for the questions they could not settle on it, and check whether the fact that decided the outcome was on the list. Then list who held that fact and whether they were asked. Plant one checkable fact at the start, the middle and the end of three of your own design documents, and ask your model about each, whole and in four parts. Run your reviewer, critic and debater prompts on twenty past decisions and see how often they are wrong together. The first check tells you whether your machines can find your residual, the second whether you route it to the right people, the third how to feed the model, and the fourth how many instruments you actually have.

The machine gets the first word whenever it is heard first. Measure it before it speaks, and keep the last word for the people who hold the whole design.

---

<sup>[1]</sup> Kohli, G. (2026). *Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels.* arXiv:2605.29800.

<sup>[2]</sup> Hemmer, P., Schemmer, M., Kühl, N., Vössing, M. and Satzger, G. (2024). *Complementarity in Human-AI Collaboration: Concept, Sources, and Evidence.* arXiv:2404.00029.

<sup>[3]</sup> Simkute, A., Tankelevitch, L., Kewenig, V., Scott, A.E., Sellen, A. and Rintel, S. (2024). *Ironies of Generative AI: Understanding and Mitigating Productivity Loss in Human-AI Interaction.* International Journal of Human-Computer Interaction. arXiv:2402.11364.

<sup>[4]</sup> Elish, M.C. (2019). *Moral Crumple Zones: Cautionary Tales in Human-Robot Interaction.* Engaging Science, Technology, and Society 5, 40-60.

<sup>[5]</sup> Panickssery, A., Bowman, S.R. and Feng, S. (2024). *LLM Evaluators Recognize and Favor Their Own Generations.* Advances in Neural Information Processing Systems 37 (NeurIPS 2024).

<sup>[6]</sup> Liu, N.F., Lin, K., Hewitt, J., Paranjape, A., Bevilacqua, M., Petroni, F. and Liang, P. (2024). *Lost in the Middle: How Language Models Use Long Contexts.* Transactions of the Association for Computational Linguistics 12, 157-173.

<sup>[7]</sup> Veseli, B., Chibane, J., Toneva, M. and Koller, A. (2025). *Positional Biases Shift as Inputs Approach Context Window Limits.* Conference on Language Modeling (COLM 2025). arXiv:2508.07479.

<sup>[8]</sup> Modarressi, A., Deilamsalehy, H., Dernoncourt, F., Bui, T., Rossi, R.A., Yoon, S. and Schütze, H. (2025). *NoLiMa: Long-Context Evaluation Beyond Literal Matching.* Proceedings of the 42nd International Conference on Machine Learning (ICML 2025), PMLR 267. arXiv:2502.05167.

<sup>[9]</sup> Khan, A. and coauthors (2024). *Debating with More Persuasive LLMs Leads to More Truthful Answers.* Proceedings of the 41st International Conference on Machine Learning, PMLR 235, 23662-23733.

<sup>[10]</sup> Tessler, M.H. and coauthors (2024). *AI Can Help Humans Find Common Ground in Democratic Deliberation.* Science 386(6719), eadq2852.

<sup>[11]</sup> Choi, H.K., Zhu, X. and Li, S. (2025). *Debate or Vote: Which Yields Better Decisions in Multi-Agent Large Language Models?* Advances in Neural Information Processing Systems (NeurIPS 2025). arXiv:2508.17536.

<sup>[12]</sup> Wynn, A., Satija, H. and Hadfield, G. (2025). *Talk Isn't Always Cheap: Understanding Failure Modes in Multi-Agent Debate.* International Conference on Machine Learning (ICML 2025). arXiv:2509.05396.

<sup>[13]</sup> Fogliato, R. and coauthors (2022). *Who Goes First? Influences of Human-AI Workflow on Decision Making in Clinical Imaging.* Proceedings of the 2022 ACM Conference on Fairness, Accountability, and Transparency (FAccT 2022). arXiv:2205.09696.

<sup>[14]</sup> Parisi, A., Thain, N., Hallak, A., Tsai, V. and Qian, C. (2026). *Real-Time Group Dynamics with LLM Facilitation: Evidence from a Charity Allocation Task.* ACM Conference on Fairness, Accountability, and Transparency (FAccT 2026). doi:10.1145/3805689.3812253.

<sup>[15]</sup> Lu, L., Yuan, Y.C. and McLeod, P.L. (2012). *Twenty-Five Years of Hidden Profiles in Group Decision Making: A Meta-Analysis.* Personality and Social Psychology Review 16(1), 54-75.

<sup>[16]</sup> Vaccaro, M., Almaatouq, A. and Malone, T. (2024). *When Combinations of Humans and AI Are Useful: A Systematic Review and Meta-Analysis.* Nature Human Behaviour 8, 2293-2303.

<sup>[17]</sup> McAleese, N. and coauthors (2024). *LLM Critics Help Catch LLM Bugs.* arXiv:2407.00215.

<sup>[18]</sup> Wei, J., Huang, D., Lu, Y., Zhou, D. and Le, Q.V. (2023). *Simple Synthetic Data Reduces Sycophancy in Large Language Models.* arXiv:2308.03958.

<sup>[19]</sup> Hao, X. and six coauthors (2026). *Not All Flips Are Conformity: Decomposing Stance Convergence in Multi-Agent LLM Debate.* arXiv:2606.00820.

<sup>[20]</sup> Kleinberg, J. and Raghavan, M. (2021). *Algorithmic Monoculture and Social Welfare.* Proceedings of the National Academy of Sciences 118(22), e2018340118.
