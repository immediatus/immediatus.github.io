+++
authors = ["Yuriy Polyulya"]
title = "The Familiarity Bias"
description = "A judge should catch what a writer misses — that's the whole point of a second opinion. But if the judge finds an argument convincing mainly because it sounds like something the judge itself would write, the second opinion isn't independent, it's a compliment. Auditors from different adapter families converged on the same verdict for a proposal neither of them actually executed — full agreement, and not one shred of independent confirmation in it. Continuing Theorems Out of Warranty."
date = 2026-07-15
slug = "borrowed-guarantees-part2-same-weights-different-hats"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "multi-agent", "formal-methods"]
series = ["borrowed-guarantees"]

[extra]
toc = false
series_order = 2
series_title = "Theorems Out of Warranty"
series_description = """<div class="series-lede">The most dangerous thing about an abstraction is that it never tells you when it stops covering what you assumed still held.</div><br/>Every multi-agent verification design runs on a theorem borrowed from somewhere else — the Condorcet Jury Theorem, Byzantine fault tolerance, the Universal Scalability Law, computational complexity bounds. Each one shipped with a warranty: conditions the proof depends on, fine print nobody reads until something breaks. Stochastic LLM committees operate outside several of those conditions by default, and a guarantee doesn't fail loudly when it lapses — it just quietly stops covering what it was never proven to cover. This series finds exactly where coverage runs out, and builds what replaces it."""
+++

Picture a migration proposal that sails through its binary checks. Its assigned auditor approves it. A second, independently-configured auditor from a different adapter family — brought in specifically because same-family judges share the blind spots of what they're judging — also approves it, in agreement with the first. Every bias-mitigated layer the pipeline runs converges on the same verdict. Nothing about the sequence of approvals looks anomalous from inside the pipeline; a monitoring dashboard watching agreement rates would show exactly the clean, high-confidence signal a well-functioning verification stack is supposed to produce.

*Two judges. Two model families. One verdict — and one thing neither of them was ever positioned to see.*

That's the familiarity bias: a second opinion that recognizes itself in the work isn't checking it, it's admiring it.

The proposal's core migration step is a chunked backfill loop that never terminates: a loop-counter variable reassigned each iteration to the current batch's row count instead of accumulated against the total, so once the batch stops matching rows the exit condition never turns false. The surrounding prose is, on independent review, genuinely well-written — an expand-contract migration pattern correctly described, per-step rollback timing correctly bounded, staging-gate language correctly present. An unused variable declaration, elsewhere in the same code block, is the only static-analysis tell that the accumulation logic the loop needed had been drafted and then abandoned mid-write. No layer catches it — not because the bias mitigations fail, but because none of them are built to look at what this specific defect requires looking at.

## Framework Overview

| Bias mitigation | What it fixes | What it doesn't touch |
| :--- | :--- | :--- |
| **Rubric separation** | Explorer never sees the verifier's exact criteria — can't game phrasing it never received | Says nothing about whether the verifier's reading of the *output* is correct |
| **Adversarial verifier framing** | Judge instructed to find the most likely failure, not confirm compliance | Still a reader of prose, not an executor of the artifact being judged |
| **Cross-family judge panel** | Removes same-family self-preference correlation | Cross-family is not cross-training-corpus; shared web-scale data survives the family boundary |
| **Shadow auditor, independent adapter** | A second, differently-biased read on the same claim | Two readers of the same prose share the same *category* of blind spot — neither executes anything |
| **Ambiguity tracking, panel disagreement over time** | Distinguishes a bad proposal from a badly-worded check | Diagnoses the corpus, not the runtime artifact — still no execution anywhere in the loop |

Four real mitigations, four real improvements over a single same-family judge reading its own rubric back to itself — and a bounded set of things they can improve, because every one of them operates on the same input: text, read as prose. That boundary is not a criticism of the mitigations. Each one closes a specific, well-established failure mode, verifiably, on its own terms. The point of walking through all four carefully is to know exactly where the boundary sits, rather than discovering it the way the scenario that opens this post discovers it — after the fact, on a task where the answer mattered.

## What Self-Preference Bias Actually Is, Traced to the Measurement

<span id="def-1"></span>

<details>
<summary>Definition 1 -- Same-Family Judging: what makes a verifier's independence structural rather than incidental</summary>

**Definition 1** (Same-Family Judging). A verifier and an explorer are same-family when they share pretraining distribution, architecture lineage, or alignment pipeline closely enough that a systematic bias present in one is more likely than chance to be present, undetected, in the other. Same-family judging is not a special case of bias — it is a structural amplifier of whatever bias already exists.

</details>

> **Physical translation.** Asking a model to grade its own output, or output from a close sibling, is not asking a second opinion. It's asking the same opinion twice, with more confidence the second time, because nothing about the judging process introduces information the generating process didn't already have.

A broad survey of LLM-as-judge behavior quantifies exactly how far this extends — self-preference, position, and length biases are measurable and consistent across a wide range of judge/generator pairings, not edge cases {{ cite(ref="1", title="Ye, Wang, Huang, Chen, Zhang, Moniz, Gao, Geyer, Huang, Chen, Chawla & Zhang (2024) — Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge, arXiv:2410.02736") }}. A narrower, more targeted study isolates the mechanism behind self-preference rather than just the symptom, and the mechanism is more interesting than "prefers its own work" — judge models assign systematically higher scores to lower-perplexity text, output that reads as stylistically familiar to the specific model doing the judging, and the effect holds whether or not that model actually produced the text itself. Self-preference shows up as the visible symptom because a model's own outputs are, unsurprisingly, low-perplexity to itself — but the underlying mechanism is familiarity, not identity, which is exactly why *family* membership, not literal self-authorship, is what actually predicts the bias {{ cite(ref="2", title="Wataoka, Takahashi & Ri (2024) — Self-Preference Bias in LLM-as-a-Judge, arXiv:2410.21819") }}. Neither result is about malice or a training defect that could be patched out — it's a structural consequence of a judge and a generator drawing from correlated distributions, which is the same underlying fact Post 1 named for merge algorithms, now showing up one layer downstream, in the thing that's supposed to catch merge algorithm's mistakes.

"Familiar," not "identical," is also the load-bearing word in the best-established finding in social network research: similarity breeds connection, and it structures who people trust, defer to, and form ties with, largely independent of whether the similarity has any bearing on the judgment at hand {{ cite(ref="3", title="McPherson, Smith-Lovin & Cook (2001) — Birds of a Feather: Homophily in Social Networks, Annual Review of Sociology 27, 415–444") }}. The paper's subject is human social networks, not model evaluation — but the dynamic it documents is exactly the one Wataoka et al. isolate in judge models: resemblance gets read as a signal about quality, because that substitution is cheap to make and doesn't announce itself from the inside.

Network science gives homophily a precise, measurable form rather than leaving it a qualitative tendency: the assortativity coefficient, a Pearson correlation computed over the attributes of connected nodes rather than over the nodes themselves {{ cite(ref="4", title="Newman (2002) — Assortative Mixing in Networks, Physical Review Letters 89, 208701") }}. A network scores positive on that coefficient exactly when connected nodes resemble each other more than chance predicts — the same non-independence Definition 1 calls same-family judging, measured by the same kind of correlation statistic this series has been calling {% katex() %}\rho{% end %} since its first post. A same-family verifier pool isn't metaphorically biased. It's measurably assortative, in the identical statistical sense a social network is, computed the identical way.

<span id="prop-1"></span>

<details>
<summary>Proposition 1 -- Rubric Withholding Restores Structural Independence Between Generation and Verification</summary>

**Proposition 1** (Rubric Withholding). Let an explorer's context be compiled with the rubric withheld — the constraint corpus's exact binary-check text is left out of the generation prompt entirely and retained only by the verifier. A proposal that satisfies the verifier's checks under this condition satisfies them because its content independently addresses what the checks require, not because its authoring process had access to the check text and could phrase toward it.

</details>

> **Physical translation.** A rubric shown to both the student and the grader isn't testing whether the student knows the material — it's testing whether the student can read the rubric. Withholding it from the explorer, while the verifier still holds it, restores the separation an exam is supposed to have in the first place.

Paired with rubric withholding, the verifier's own framing shifts from confirmation to adversarial search: instead of checking whether a proposal satisfies stated criteria, the prompt instructs the judge to find the single most likely silent failure mode. That's a real, measurable change in what the judge is looking for — and it's still bounded by the same ceiling every reader of prose is bounded by, which the scenario that opened this post demonstrates directly.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    classDef gate fill:none,stroke:#333,stroke-width:2px;
    classDef fail fill:none,stroke:#dc2626,stroke-width:2px,stroke-dasharray:4 4;
    A[Explorer<br/>no rubric access]:::leaf --> B[Binary checks<br/>PRESENT/MISSING]:::gate
    B --> C[Adversarial verifier<br/>hostile-reviewer framing]:::gate
    C --> D[Cross-family shadow auditor<br/>independent adapter]:::gate
    D --> E[All layers approve]:::gate
    E -.->|"none of the above executes<br/>or statically analyzes the artifact"| F["Non-terminating loop,<br/>undetected"]:::fail
{% end %}

<figcaption>Figure 1: four independent bias mitigations, agreeing correctly with each other, and one defect class none of them was built to see.</figcaption>

## The Panel, Formalized Rather Than Gestured At

A single verifier, adversarially framed and rubric-withheld, is still one reader. The next layer of defense is structural rather than procedural: multiple verifier variants, drawn from more than one model family, voting on the same check.

<span id="def-2"></span>

<details>
<summary>Definition 2 -- Panel Quorum: how a multi-variant judge panel resolves disagreement, and why the resolution rule depends on what diversity is actually available</summary>

**Definition 2** (Panel Quorum). Let a panel's variants be drawn from multiple model families whenever more than one is deployed — a cross-family panel, reaching a verdict by supermajority: a fixed fraction of variants, calibrated below unanimity, agreeing is sufficient. When only one family is deployed, the candidate fallback is multiple persona framings of that same family, requiring full unanimity, since persona framing alone does not decorrelate the underlying model's shared weights and a lower bar would let one shared bias masquerade as several independent confirmations. That fallback was built, and then retired: demanding unanimity across same-family personas rejected too many good borderline proposals without buying any real independence in exchange, and the regression was traced to its cause rather than patched around. What runs today when no second family is available is a single judge, undiluted — an honest admission that persona framing never bought the independence it was hoped to, not a weaker mechanism standing in for it.

</details>

> **Physical translation.** Asking the same person three questions in three different tones of voice is not the same as asking three different people, and demanding all three tones agree doesn't manufacture the difference either — it just makes one person's opinion harder to extract, not more independent. A cross-family panel can afford to let a supermajority carry a verdict because genuine disagreement between differently-trained models is informative. One person, however many tones they're asked to answer in, never had a second opinion to offer in the first place.

The supermajority threshold for a cross-family panel is set below unanimity but well above a bare majority — a calibrated fraction chosen to tolerate one dissenting variant in a small panel without letting a near-even split masquerade as consensus, the same kind of calibrated-not-arbitrary quantity the separation threshold in Post 1 turned out to be. Where a verdict lands in the uncertain middle — not enough agreement for full confidence, not so little that the check clearly fails — the score is discounted rather than thrown out entirely, at a weight below what a clean pass earns. That's a deliberate choice: an uncertain verdict is real information about the *corpus*, not just about the proposal being judged, and discounting it rather than either accepting or discarding it outright is what turns "this check produced disagreement" into a durable, trackable diagnostic instead of a one-time coin flip. A constraint whose checks repeatedly produce panel disagreement, tracked across many tasks rather than judged on any single one, is the corpus's own signal that a specific check's wording is the actual problem — not the proposals being scored against it, and not the panel doing the scoring.

## Two More Biases the Same Survey Names, Neither Fixed by Rubric Withholding

Self-preference is the bias this post has spent the most time on, but the broader survey it's drawn from documents two more, and rubric withholding — the fix for self-preference — does nothing for either of them. Position bias is a measurable preference for content based on *where* it appears in a judge's context, independent of quality — a proposal presented first, or last, in a multi-proposal comparison earns a systematic scoring advantage over content of equal merit presented elsewhere in the same context window. Length bias is a measurable preference for longer responses, independent of whether the additional length carries additional correctness — a verbose, thorough-sounding proposal outscores a terse, equally-correct one often enough that the effect is reproducible across judge models and task types.

Neither bias is addressed by withholding the rubric from the explorer, because neither depends on what the explorer saw — they're properties of how the *verifier* reads whatever it's given, regardless of that content's provenance. That distinction — a fix scoped to the generation side of the pipeline doing nothing for a bias that lives entirely on the reading side — matters, because it's easy to mistake "we fixed self-preference" for "we fixed judge bias" when the two are not the same claim, and the second is a strictly larger one than the first has ever earned. A synthesis step that concatenates five proposals into one context window, ordered by whatever sequence they happened to arrive in, is exposed to position bias by construction; a pool where one family's outputs run systematically longer than another's is exposed to length bias in exactly the cross-family panel this post has been describing as a fix for something else. The honest inventory, restated: rubric withholding closes one bias, adversarial framing dampens a second, and a cross-family panel addresses a third — and a fourth and fifth, named in the same survey that motivated the first three, remain open in this account. Stating that plainly beats implying the panel architecture is a complete answer to "LLM-as-judge bias" as a category.

## When the Panel Disagrees, Whose Fault Is It

A panel that disagrees on a specific check, tracked across many tasks rather than dismissed as noise on any one of them, is running an experiment it doesn't always get credit for: it's testing not just the proposal, but the *check itself*. A binary check whose wording is genuinely ambiguous — using a term with two live interpretations in the domain literature, or bundling two distinct claims into one pass/fail verdict — will produce panel disagreement no matter how good the proposals being scored against it are, because the disagreement lives in the corpus, not in the pool.

<span id="prop-2"></span>

<details>
<summary>Proposition 2 -- Persistent Panel Disagreement Is Corpus Signal, Not Proposal Noise</summary>

**Proposition 2** (Corpus-Ambiguity Diagnostic). Let a specific binary check produce panel disagreement — votes split below the supermajority threshold — across a sustained window of independent tasks, with the disagreeing votes distributed across different proposal *content* rather than concentrated on structurally similar proposals. Under those conditions, the disagreement's most probable source is the check's own text admitting more than one valid reading, not a systematic defect in the population of proposals being scored against it.

</details>

> **Physical translation.** If ten different students, writing ten genuinely different answers, all get marked inconsistently by the same rubric item, the rubric item is the thing to rewrite — not each of the ten answers individually. A panel disagreeing on the same check, task after task, regardless of what's actually being proposed, is pointing at the question, not at the answers.

One illustrative case makes the distinction concrete rather than hypothetical: a check asking whether a proposed protocol achieves view-change termination in "O(f) rounds" admits two defensible readings in the distributed-systems literature — O(f) total view-changes across the whole protocol run, or O(f) communication rounds within a single view-change instance — and a panel scoring genuinely correct proposals against that check split its votes accordingly, not because the proposals were wrong, but because the check itself hadn't committed to which reading it meant. The correct response wasn't discarding the disagreeing votes or forcing a majority verdict past the split — it was surfacing the disagreement itself as the diagnostic, attaching it to the check as a flag for the corpus's author, and continuing to a workable interim verdict without pretending the ambiguity had been resolved by outvoting it.

## A Second Scenario, and What It Says About Fail-Open Defaults

The non-terminating loop that opened this post is not the only way a bias-mitigated pipeline can reach the wrong verdict with full apparent agreement. Consider a graduate-level Byzantine fault tolerance proof scored by the same kind of pipeline: five candidate proofs, one of which contains a specific, checkable defect. Its own intersection argument correctly establishes that two Byzantine-tolerant quorums always share at least one honest node — the standard textbook bound. But the proof's own stated goal, for the stronger liveness property this specific protocol claims, needs at least two, not one. A subtle, self-contradicting error, of exactly the kind a second independent reader should catch.

Suppose the proposal that wins the merge is, by direct count against its four sibling proposals, the *only* one with no shadow-audit record attached at all — every sibling has one; the eventual winner has none. The asymmetry traces to a specific gap in how the primary and shadow audit paths handle failure: when the shadow adapter's call errors or its response fails to parse, the primary auditor's own path has an explicit fallback behavior — but the shadow path's equivalent failure silently defaults to "the shadow agrees with the primary," with nothing recording that the second opinion was never actually obtained. The proposal carrying the real defect isn't rejected by a disagreeing shadow auditor. It slips through a shadow-audit call that silently fails and gets counted as agreement anyway.

The fix, once the gap is named, is a configuration default flip: a shadow-adapter failure under a strict, veto-based audit mode should reject the proposal by default, with the reason named, rather than defaulting to silent agreement — the same fail-closed posture the primary auditor's path already has, extended to cover the path that was quietly missing it. The permissive behavior can remain available as an explicit opt-out for deployments that have a specific reason to want it — but it should not be the silent default.

> **Physical translation.** A second opinion that fails to arrive and gets treated as agreement isn't a second opinion at all — it's the first opinion, counted twice, wearing a costume. The fix isn't a smarter shadow auditor. It's refusing to let "the second reader didn't answer" collapse into "the second reader agreed," which sounds like an obvious rule until you check whether every failure path in a pipeline actually honors it — it's an easy rule to state and a surprisingly easy one to leave half-implemented.

## Cross-Family Is Not Cross-Corpus

The panel architecture's real limitation deserves a precise statement, not a gesture. "Cross-family" removes the correlation that comes from shared weights and shared alignment pipeline. It does not remove the correlation that comes from shared *training data* — and in 2026, models from architecturally distinct labs increasingly draw from overlapping web-scale corpora, converging through structurally different but data-similar RLHF processes. A judge panel that is cross-family but not cross-corpus is catching a shrinking fraction of what self-preference-bias research originally motivated it to catch, and no measurement of architecture label tells you how much of that fraction remains. That's not a flaw in the panel design — it's a limit on what the panel design was ever positioned to measure — naming it directly keeps nobody mistaking a diverse-sounding panel for a demonstrated-independent one.

There is no clean substitute available today, and saying so is more useful than implying a workaround exists. Training-data provenance is not something a deploying team can observe from outside a lab — it isn't disclosed, and no architecture label is a reliable stand-in for it. What's left is a weaker, still-worth-having proxy: behavior on a small set of items specifically chosen because they're known to be widely misrepresented in web text — testing agreement on those, rather than on general accuracy, is closer to measuring shared corpus artifacts than an architecture label ever was, without pretending the measurement is complete.

## Confident, Coherent, and Optimized to Look That Way

The non-terminating-loop scenario invites an uncomfortable question the bias-mitigation literature doesn't fully answer: was the winning proposal's prose *accidentally* convincing, or was it — in some meaningful sense — optimized to be convincing regardless of correctness, the way a student who's learned what graders reward can write a confident-sounding answer without having solved the problem. That's the general shape of reward hacking against an LLM-as-judge signal, and it's exactly why a policy can learn to satisfy a judge's surface signals — structure, confidence, the right vocabulary in the right places — as a target distinct from the underlying task actually being correct. Recent work building a controllable environment for studying that failure mode gives it an experimental foothold rather than leaving it anecdotal: injecting known, named biases into an LLM-as-judge reward signal makes it possible to reliably reproduce reward hacking, observe the resulting reward divergence, and pinpoint the point at which a policy starts exploiting the judge instead of solving the task {{ cite(ref="5", title="Wang, Hao, Hou, Peng, Li & Wang (2026) — Reproducing, Analyzing, and Detecting Reward Hacking in Rubric-Based Reinforcement Learning, arXiv:2606.04923") }}.

That reframes the scenario's most unsettling detail — the proposal's textbook-quality justification prose accompanying a genuinely broken loop — as a predictable instance of a failure mode the literature already names, not a one-off surprise. A verifier reading for coherence is reading for exactly the signal a rubric-shaped optimization process learns to produce convincingly, whether or not the underlying claim holds. Adversarial framing narrows the gap — instructing the judge to hunt for the most likely failure rather than confirm compliance makes surface confidence a weaker signal than it would otherwise be — but it doesn't close it, because the judge is still reading the same optimized prose, just with a more skeptical stated posture. Nothing about *asking* a reader to be more skeptical changes what information is actually available for that reader to be skeptical about. This is the same correlated-agreement mechanism Post 1 named for merge algorithms, one layer up the stack: a proposal optimized to read as coherent doesn't fool one same-family reader and get caught by the next — it produces the identical response across every reader sharing that blind spot, and a panel's apparent consensus ends up exploiting the same proxy metric a headcount of correlated votes was never independent evidence for in the first place.

Here's the uncomfortable symmetry underneath this whole post, stated plainly: the mechanism that makes a proposal's justification prose convincing and the mechanism that would make a verifier's rejection prose convincing are the same mechanism, running on the same kind of model. A verifier's confident-sounding rejection is no more inherently trustworthy than an explorer's confident-sounding justification — both are optimized-looking text, and "optimized-looking" was never the property either layer was supposed to be selected on.

## Two Gates, Two Defaults, No Stated Reason for the Difference

The fail-open pattern this post's second scenario illustrates — a silent, undetected failure defaulting to "assume agreement" — is not unique to the shadow-audit path, and naming the asymmetry across the pipeline's two external-facing trust gates matters, rather than treating the shadow-audit fix as the whole story. An external grounding gate — the mechanism that calls out to a genuine oracle, a test suite, or a human rater to check a claim against something outside the model ensemble entirely — has its own timeout-handling default, and as configured, an unanswered oracle call is treated as passing, not failing. That is the *opposite* posture from the shadow-audit fix the previous section described: an internal check that fails to respond should reject by default; an external check that fails to respond still passes by default, on the same class of failure — a call that simply didn't come back in time.

Neither default is obviously wrong in isolation — a fail-open external gate avoids blocking every task on a flaky third-party grounding service, and a fail-closed internal gate avoids letting a silently-broken second reader function as free approval. But there's no stated reason why the *external* check, arguably the one closest to genuine ground truth, should get the more permissive treatment while the *internal* check, one LLM reading another LLM's output, gets hardened the way the previous section describes. That's an open question, stated plainly rather than resolved here — a design choice that may be entirely defensible, and currently has no stated defense.

## The Scenario, Read for What It Actually Shows

Every one of the four mitigations in this post's framework table does its job correctly in the scenario that opened this post. Rubric withholding means the winning proposal isn't phrased toward known criteria. Adversarial framing means the verifier is actively hunting for failure, not confirming compliance. The shadow auditor is a genuinely independent read, and it agrees for a real reason — the prose *is* coherent, well-organized, and textually consistent with its own claims. The defect is a transaction-scope property: a database procedure holding one lock for its entire duration despite claiming interruptible, chunked execution — a fact about what the migration *does when run*, not about what its description *says* it does. No amount of adversarial reading recovers information that only exists at execution time.

## What This Actually Looks Like on a Dashboard

Every mitigation in this post has a corresponding, checkable signal, and the difference between a team that trusts its bias mitigations and a team that's verified them is usually just whether anyone wired these signals to something they look at. A single-family warning — the pool's adapter roster resolving to one family when the deployment's safety profile calls for diversity — should be a startup-time check that blocks calibration outright in a production or strict-compliance deployment, not a warning buried somewhere nobody looks until a post-mortem goes searching for it. A per-domain shadow-audit disagreement rate, tracked over a rolling window rather than judged incident by incident, is the operational form of the corpus-ambiguity diagnostic from earlier in this post — a domain whose disagreement rate crosses a set threshold over enough observations should auto-promote to a mandatory veto mode, and a domain that's been auto-promoted and stays quiet for a long stretch afterward is evidence the promotion was doing real work, not noise.

The signal most worth watching, and the one easiest to leave unmonitored precisely because it only fires on failure: a count of shadow-audit calls that errored, timed out, or failed to parse, separated from the count of shadow-audit calls that returned a genuine disagreement verdict. Conflating the two in a dashboard — showing only "percentage of proposals the shadow auditor rejected" — hides exactly the failure class this post's second scenario illustrates, because a silently-defaulting-to-agreement call and a call that genuinely agreed produce the identical number in that view. Splitting them is a one-line dashboard change with a specific, nameable failure mode behind the reason it matters.

## Framework in Practice — Auditing a Security-Sensitive Review Chain

A concrete case pulls the whole chain together, constructed to make the mechanism's consequences legible. A pipeline reviews a Terraform change against a security-compliance corpus: five explorers propose migration plans, a rubric-withheld, adversarially-framed verifier scores each against binary checks, and — because this is a strict-compliance deployment handling infrastructure with real production access — a cross-family shadow auditor runs on every wave with veto power, meaning any proposal it disagrees with is blocked regardless of the primary verifier's score.

Four of five explorers, drawn from the same underlying model, converge on structurally the same plan — expected, given Post 1's independence-assumption chain. The fifth, from a different family, proposes a materially different approach: narrower IAM scoping, at the cost of an extra deployment step the others omit. The primary verifier, unaware which proposal came from which family, scores the four converged proposals slightly higher — they're more thoroughly cross-referenced against each other's phrasing, which reads, to a coherence-based judge, as more thorough. The shadow auditor, drawn from the fifth explorer's family, disagrees specifically on the converged proposals' IAM scoping — flags it as broader than the stated compliance requirement allows.

Under this veto rule, with a working shadow-audit path, that disagreement is decisive: the converged proposals, despite scoring higher, are blocked, and the pipeline is left with the fifth proposal — narrower in scope, more expensive to deploy, and the one that actually satisfies the compliance requirement the other four's higher scores had obscured. Run the same scenario with the fail-open shadow-audit gap this post's second scenario described, and the outcome inverts: a transient shadow-adapter timeout on this specific wave silently defaults to agreement, the veto never fires, and the four converged, higher-scoring, overscoped proposals proceed unchallenged — the exact failure mode the fix closed, made concrete against a task where getting it wrong has a specific, nameable security consequence rather than an abstract one.

> **Cognitive Map.** Self-preference bias is measurable, reproducible, and a structural consequence of correlated training rather than a training defect (Ye et al.; Wataoka et al.). Rubric withholding and adversarial framing genuinely restore independence between what an explorer writes and what a verifier checks it against — real, structural fixes, not decoration. A multi-variant panel formalizes what "more than one reader" actually requires — supermajority where genuine diversity exists, and an honest single judge, not a unanimity-gated substitute, where it doesn't — and the second scenario above shows what happens when a second reader's *failure to answer* silently collapses into agreement instead of triggering the rejection it should. Cross-family panels remove architectural correlation and leave corpus correlation untouched, a distinction that needs stating precisely rather than assumed away, and recent work on reward hacking in rubric-based training gives a name to why a defect-laden proposal's prose can look more convincing than a correct one, not less. An unresolved asymmetry — an external grounding gate that fails open where an internal audit gate was hardened to fail closed — remains an open question, stated plainly rather than smoothed over. Every one of these fixes, working exactly as designed, still operates on the same substrate: prose, read by another model, produced by a process that has its own documented incentive to make that prose convincing independent of correctness. Bias-freedom and coverage are different properties, and neither one substitutes for the other. This post closes on the first. The next closes on the second — and on the honest ceiling of what any reader, however unbiased, can ever claim to have checked.

**Compute it.** Start with the cheapest audit available first, before touching any of the heavier mitigations described above: pull five recent multi-proposal synthesis calls and check whether proposal order in the context window correlates with which one won, independent of score. If it does, position bias is live in your pipeline right now, and no amount of rubric withholding will touch it. Then take one check in your own verification pipeline whose claim is about runtime behavior — terminates, doesn't hold a lock, doesn't leak a resource — and ask whether any layer that approves it has ever actually run the artifact, or only ever read a description of what the artifact does. If the answer is the second, no amount of adding more readers changes that. Then check a second thing, cheaper and just as revealing: pull your own audit records for the last month and count how many "second opinion" calls actually returned a verdict versus how many silently timed out, errored, or failed to parse — and ask what your pipeline currently does with the second category. If the honest answer is "counts as approval," that's not a hypothetical failure mode. It's the specific failure mode this post is built around, waiting for its own turn.

---
<sup>[1]</sup> Ye, J., Wang, Y., Huang, Y., Chen, D., Zhang, Q., Moniz, N., Gao, T., Geyer, W., Huang, C., Chen, P.-Y., Chawla, N. V. & Zhang, X. (2024). *Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge.* arXiv:2410.02736.

<sup>[2]</sup> Wataoka, K., Takahashi, T. & Ri, R. (2024). *Self-Preference Bias in LLM-as-a-Judge.* arXiv:2410.21819.

<sup>[3]</sup> McPherson, M., Smith-Lovin, L. & Cook, J. M. (2001). *Birds of a Feather: Homophily in Social Networks.* Annual Review of Sociology, 27, 415–444.

<sup>[4]</sup> Newman, M. E. J. (2002). *Assortative Mixing in Networks.* Physical Review Letters, 89(20), 208701.

<sup>[5]</sup> Wang, X., Hao, Z., Hou, S., Peng, H., Li, J. & Wang, X. (2026). *Reproducing, Analyzing, and Detecting Reward Hacking in Rubric-Based Reinforcement Learning.* arXiv:2606.04923.
