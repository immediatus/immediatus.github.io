+++
authors = ["Yuriy Polyulya"]
title = "The Boolean Fallacy"
description = "A single word — passed — sounds like a verdict. It's actually doing the work of several different claims at once: checked and confirmed true, checked and confirmed false, and never checked at all because no method existed to check it, quietly rounded up to a pass anyway. Treating that boolean as if it always means the same thing is the boolean fallacy, and Rice's theorem gives the honest reason no execution-based check can fully cure it. Still inside Theorems Out of Warranty."
date = 2026-07-22
slug = "borrowed-guarantees-part3-one-bit-of-trust"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "formal-methods", "verification"]
series = ["borrowed-guarantees"]

[extra]
toc = false
series_order = 3
series_title = "Theorems Out of Warranty"
series_description = """<div class="series-lede">The most dangerous thing about an abstraction is that it never tells you when it stops covering what you assumed still held.</div><br/>Every multi-agent verification design runs on a theorem borrowed from somewhere else — the Condorcet Jury Theorem, Byzantine fault tolerance, the Universal Scalability Law, computational complexity bounds. Each one shipped with a warranty: conditions the proof depends on, fine print nobody reads until something breaks. Stochastic LLM committees operate outside several of those conditions by default, and a guarantee doesn't fail loudly when it lapses — it just quietly stops covering what it was never proven to cover. This series finds exactly where coverage runs out, and builds what replaces it."""
+++

A verifier returns a single true-or-false flag. That one bit is doing the work of three distinct claims, collapsed into one: the proposal was checked and found true; the proposal was checked and found false; no method existed to check the claim at all, and the absence of an objection was silently counted as a pass.

*Which of those three did your last passing verdict actually mean?*

That's the boolean fallacy: treating three different claims as if a single bit could carry all of them equally.

The scenario the previous post in this series was built around — a proposal approved by every bias-mitigated layer, containing a defect none of those layers executed or statically analyzed at any stage of the review — is the concrete instance of the third case wearing the first case's clothing. The previous post's fixes — rubric withholding, adversarial framing, cross-family panels — all make the *reader* of a proposal more trustworthy. None of them touch what's being read, or make the boolean a passing reader eventually outputs carry any more information than it did before the reading got more careful.

Fixing that distinction sounds like it should be straightforward: classify what kind of claim a check is making, route it to a method that can actually verify that kind of claim, done. It took two rejected designs, three adversarial reviews, and a research pass through a body of literature spanning library science, software testing theory, and AI-and-law formalisms to find the version that doesn't quietly make things worse than the boolean it was meant to replace.

## Framework Overview

The three-row summary below compresses a real design iteration into a single table, which is convenient for a reader and slightly unfair to how the work actually happened — nobody arrived at row three by reasoning their way there in one sitting. Row two was believed workable when it was first proposed, and only failed once specifically adversarial review went looking for the counterexample that broke it. Keep that in mind while reading the table as a clean progression rather than the messier, iterative process it actually was.

| Design | Structure | Why it was rejected |
| :--- | :--- | :--- |
| **Operator-curated tool allowlist** | Pre-register a verification tool per domain | Domains are unbounded — collapses to "hire a domain expert for every task type" |
| **Four-facet model** | Locus, mechanism, confidence ceiling, temporal stability as four coequal axes | Ceiling and stability turned out to be near-bijective *outputs* of (locus, mechanism), not independent facets — and its missing-data default excluded checks instead of trusting them, inheriting the unsafe polarity |
| **Two-facet model, additive-only** | Locus and mechanism only; ceiling and stability computed, never independently estimated | Shipped — closes the fatal finding by construction: nothing is ever excluded for lack of a tag or a wired tool |

The middle row deserves the most attention, because a design that fails for a *specific, nameable* reason under adversarial review is more instructive than either the naively-simple version before it or the working version after it. Three independent specialists — one in faceted classification theory, one running deliberately adversarial domain tests against the design's stated claims, one focused purely on implementation feasibility — reviewed it separately, and their findings converged on the same underlying structural flaw from three different directions, which is itself a stronger signal than any one reviewer's objection alone would have been.

## The First Rejected Design, and Why Its Failure Shaped Everything After

The operator-curated allowlist — the design tried before the four-facet model, and rejected for a simpler, blunter reason — comes first, because its failure mode set the constraint every later design had to satisfy. The idea: an operator pre-registers, per deployment, which verification tool handles which domain — a PL/pgSQL linter for database checks, a Terraform validator for infrastructure checks, and so on. Reasonable on its face, and it fails on a counting argument rather than a subtle one: domains are unbounded. A general-purpose verification framework encountering a genuinely novel domain — the often-cited example is a tax-form compliance claim, arriving in a deployment nobody staffed a tax expert for — has no tool to route to, and the allowlist model's only answer is "someone should have registered one in advance." That's not a solvable operational problem; it's a structural mismatch between a framework meant to generalize across domains and a mechanism that requires per-domain advance investment proportional to the number of domains that will ever be encountered.

That single failure mode — unscalable, not incorrect — became the standing constraint every subsequent design had to satisfy, and it deserves naming as a constraint rather than a footnote: whatever ships has to work on a domain nobody anticipated, without requiring an operator to have registered anything for it in advance. The four-facet model satisfied that constraint and introduced a new failure mode of its own. The two-facet model that eventually shipped satisfies it differently — mechanism resolves for free from structural predicate types wherever a trace exists, and free-text claims fall back to the narrative default rather than requiring a pre-registered tool at all. An unregistered domain, under the shipped design, doesn't fail loudly or require advance planning — it simply gets the same narrative verdict it would have gotten before any of this classification machinery existed, which is the additive-only guarantee doing its job on the exact case the first rejected design couldn't handle.

## Why the Middle Design Failed, Precisely

<span id="def-1"></span>

<details>
<summary>Definition 1 -- Verdict Evidence: the three states a single boolean collapses</summary>

**Definition 1** (Verdict Evidence). A check's evidence is one of three states: verified true (a method exists and confirmed the claim), verified false (a method exists and refuted it), or unverified (no method exists to check this claim; a narrative reader's silence is not evidence). A pipeline reporting only a single true-or-false flag has already discarded the distinction between the second and third states before the result ever reaches a dashboard.

</details>

> **Physical translation.** "No objection" and "confirmed correct" read identically on a boolean. They are not the same claim, and treating them the same is how a verification layer ends up more confident than the evidence it actually has.

The four-facet model's intent was reasonable: classify each claim by where its ground truth lives (internal-formal, external-empirical, authoritative-institutional, distributed-social), by what mechanism could check it, by how high a confidence that mechanism can honestly support, and by how stable that confidence is over time — four coequal axes, matched against registered profiles. Adversarial review, run by independent specialists in faceted classification, domain testing, and implementation feasibility, found two structural problems and one that was fatal on its own.

The first: confidence ceiling and temporal stability are not independent of locus and mechanism — a counterexample showed them flipping in lockstep with mechanism, not varying freely, meaning they carry no information beyond what the other two facets already fix. That's a diagnosis faceted classification theory names directly: a hierarchy with refinement at the one facet that actually does the classifying work, not four coequal axes pretending to be orthogonal when two of them are downstream outputs of the other two {{ cite(ref="1", title="Ranganathan, S. R. — Colon Classification and the theory of faceted classification, foundational to library and information science taxonomy design") }}.

The second, and the one that killed the design outright: treating "no matching profile" as a reason to exclude the check inherits the *opposite* default polarity from the corpus's own existing safe convention, which treats missing data as a reason to trust, not exclude. As a corpus grows, "no profile yet" is the *normal* state for a newly-added check, not a rare edge case — and excluding it, combined with a hard-gate threshold that recomputes as checks are filtered, means routine corpus growth would silently collapse the compliance bar toward zero. A design meant to make verification stricter would have made it trivially satisfiable, and it would have done so quietly, which is worse than failing loudly.

## The Two-Facet Model, and What "Additive-Only" Actually Buys

<span id="prop-1"></span>

<details>
<summary>Proposition 1 -- Additive-Only Composition Closes the Fatal Finding by Construction</summary>

**Proposition 1** (Additive-Only Composition). Let a check's narrative verdict be the default. A resolved locus-and-mechanism pair with a wired verification method adds a second, independent verdict *alongside* the narrative one, overriding it only when the mechanized method actually produces a result. An untagged check, or a tagged locus with no wired method yet, is judged narratively — exactly as before the classification existed. No check is ever excluded from the hard gate for lack of a tag or a tool.

</details>

> **Physical translation.** The fatal flaw in the rejected design was a subtraction rule disguised as a refinement. The fix is a strict addition rule: classification can only make a verdict *more* informed than the narrative default, never less informed than it. If nothing is known about a check beyond its text, nothing changes — the corpus never gets easier to satisfy just by growing.

Stated as an invariant rather than a design intention: for any check {% katex() %}c{% end %} in the corpus, the mechanized-augmented verdict's confidence can only be greater than or equal to the narrative-only verdict's confidence, never less. That's a property that earned a regression test written directly against it, rather than trusted to hold because the design document says it should — and it did, in fact, get one: a dedicated test asserting that an untagged check's verdict is byte-for-byte unchanged by the presence of the classification machinery elsewhere in the corpus, which is the concrete, checkable form of "additive-only" rather than a description of intent left to good faith.

Mechanism itself resolves for free wherever a structural trace already exists — a check built from a typed predicate (an executable oracle, a regex match, a semantic presence gate) tells you its own mechanism without a classification call. Only free-text claims need a judgment call at all, and that call is made once, at corpus-load time, cached, never competing with a task's retry budget. Two recent, independent lines of work validate the shape rather than the specific implementation: a verification-tool-selection system that routes by the claim's *reasoning type* rather than its subject domain {{ cite(ref="2", title="Han, Buntine & Shareghi (2025) — VerifiAgent: a Unified Verification Agent in Language Model Reasoning, arXiv:2504.00406") }}, and a classification of agent claims by epistemic *source* — structural where the claim's production leaves a trace, model self-tagging with a conservative fallback where it doesn't {{ cite(ref="3", title="Basu, A. (2026) — Tool Receipts, Not Zero-Knowledge Proofs: Practical Hallucination Detection for AI Agents, arXiv:2603.10060") }}. Neither paper is the source of this design. Both independently converge on the same structural distinction — trace where a trace exists, judgment where it doesn't — which is a stronger signal that the shape is right than either paper alone would be.

## Composing Verdicts Is Its Own Problem, Even Once Each One Is Trustworthy

Getting a single check's evidence state right — verified-true, verified-false, or honestly unverified — solves only the atomic case. A real constraint corpus doesn't ask one question per check; it bundles several. A Terraform-safety constraint might combine an executable claim (does the plan apply cleanly), a policy-compliance claim (does it satisfy a named regulatory control), and a claim about the future (will this remain compliant after a scheduled policy change) — three different loci, three different mechanisms, one nominal "check." Classifying each atomic sub-claim correctly says nothing yet about how their three verdicts should combine into the one verdict the constraint as a whole reports.

<span id="def-2"></span>

<details>
<summary>Definition 2 -- The Discursive Dilemma: why locally correct sub-verdicts can compose into a conclusion no single evaluator would endorse</summary>

**Definition 2** (Discursive Dilemma). A group evaluating a compound claim through majority vote on each logically connected premise, then deriving the conclusion mechanically from the premise votes, can reach a majority-endorsed conclusion that no individual member, voting on the compound claim as a whole, would have endorsed — even when every premise vote was itself majority-correct and locally well-formed {{ cite(ref="4", title="List, C. & Pettit, P. (2002) — Aggregating Sets of Judgments: An Impossibility Result, Economics and Philosophy, 18(1)") }}.

</details>

> **Physical translation.** Three referees each correctly determine one fact about a play in isolation — the ball was caught, the catch was in bounds, the receiver's control was continuous. Each individual call, reviewed on its own, holds up. Whether the *play* was a legal catch depends on how those three facts compose under the rule, and it's entirely possible for three individually-correct calls to compose, mechanically, into a ruling that contradicts what any single referee watching the whole play unfold would have called.

List and Pettit's formal result generalizes a real legal phenomenon identified more than a decade earlier: a multi-judge panel can rule one way when it votes issue-by-issue and applies the rule mechanically, and the opposite way when it votes on the case outcome directly — same judges, same case, two internally consistent procedures, two different rulings {{ cite(ref="5", title="Kornhauser, L.A. & Sager, L.G. (1986) — Unpacking the Court, Yale Law Journal 96(1), 82–117") }}. It isn't a thought experiment built to motivate a theorem afterward; it's an identified feature of how collegial courts can rule, which is why the discursive dilemma reads as a live risk for a verification pipeline rather than an imported academic curiosity.

List and Pettit's theorem is precise about why no cleverer voting rule closes this gap: they prove no judgment-aggregation procedure can simultaneously satisfy four conditions that each sound like the bare minimum for a rule worth using — accept any logically consistent input (universal domain), always output a logically consistent verdict (collective rationality), weight every voter equally (anonymity), and decide each proposition using only the votes cast on that same proposition (systematicity) {{ cite(ref="4", title="List, C. & Pettit, P. (2002) — Aggregating Sets of Judgments: An Impossibility Result, Economics and Philosophy 18(1), 89–110") }}. Drop any one of the four and the paradox goes away — which is exactly the shape of the fix this post ships: the two-facet design doesn't vote on sub-claims and mechanically combine the votes, it classifies each sub-claim by locus and mechanism directly, giving up systematicity on purpose rather than losing it by accident, because systematicity is precisely the condition an aggregation rule cannot keep while still guaranteeing a consistent verdict.

The same three referees' actual votes, laid out for direct comparison rather than narrated:

<div style="margin:1.5em 0; overflow-x:auto;">
<table style="width:100%; border-collapse:collapse; font-size:0.92rem;">
<thead>
<tr style="background:#f3f0ff;">
<th style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:left;">Referee</th>
<th style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0;">Caught</th>
<th style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0;">In bounds</th>
<th style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0;">Continuous control</th>
<th style="padding:0.55rem 0.7rem; border:2px solid #2980b9; background:#eaf2fb;">Whole-claim verdict</th>
</tr>
</thead>
<tbody>
<tr>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; font-weight:600;">Referee 1</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#eafaf1; color:#1e8449;">Yes</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#eafaf1; color:#1e8449;">Yes</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#fdedec; color:#a93226;">No</td>
<td style="padding:0.55rem 0.7rem; border:2px solid #2980b9; text-align:center; background:#fdedec; color:#a93226;">No</td>
</tr>
<tr>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; font-weight:600;">Referee 2</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#eafaf1; color:#1e8449;">Yes</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#fdedec; color:#a93226;">No</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#eafaf1; color:#1e8449;">Yes</td>
<td style="padding:0.55rem 0.7rem; border:2px solid #2980b9; text-align:center; background:#fdedec; color:#a93226;">No</td>
</tr>
<tr>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; font-weight:600;">Referee 3</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#fdedec; color:#a93226;">No</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#eafaf1; color:#1e8449;">Yes</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; background:#eafaf1; color:#1e8449;">Yes</td>
<td style="padding:0.55rem 0.7rem; border:2px solid #2980b9; text-align:center; background:#fdedec; color:#a93226;">No</td>
</tr>
<tr style="background:#f8f6f4;">
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; font-weight:700;">Majority</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; font-weight:700; color:#1e8449;">Yes (2/3)</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; font-weight:700; color:#1e8449;">Yes (2/3)</td>
<td style="padding:0.55rem 0.7rem; border:1px solid #e0e0e0; text-align:center; font-weight:700; color:#1e8449;">Yes (2/3)</td>
<td style="padding:0.55rem 0.7rem; border:2px solid #2980b9; text-align:center; font-weight:700; color:#a93226;">No (0/3)</td>
</tr>
</tbody>
</table>
<div style="margin-top:1rem; padding:0.8rem 1rem; border-left:3px solid #e0e0e0; font-size:0.92rem; line-height:1.6;">
<strong>Premise-based ruling</strong> — AND the three premise majorities: Yes &and; Yes &and; Yes &rarr; <strong style="color:#1e8449;">Legal catch</strong>.<br/>
<strong>Conclusion-based ruling</strong> — majority of the verdict column directly: No, No, No &rarr; <strong style="color:#a93226;">NOT a legal catch</strong>.
</div>
</div>

The two readings disagree because they take the majority at different points in the computation — once per premise, or once per referee — and there is no procedural reason to prefer one point over the other. Nothing about this table needs to be watched happening; every vote is honest, every majority is a genuine 2-of-3 or 3-of-3, and the contradiction is verifiable by eye in the time it takes to read the two rulings underneath it.

The corrected verification model's answer isn't a cleverer voting rule — it's decomposition applied recursively, the same pattern the corpus already uses one level up (a constraint decomposes into binary checks, composed via a hard-gate threshold), pushed one level deeper: a compound check decomposes into atomic sub-claims, each independently classified by locus and mechanism, composed conjunctively only where a locus genuinely gates the outcome, reported without forcing a verdict where a sub-claim isn't yet observable. That's a real, buildable answer to the *decomposition* problem — it is explicitly not a formal guarantee against the discursive dilemma itself, and the residual risk deserves naming directly: a verdict built by requiring every sub-claim to hold can still be one no single evaluator reasoning about the whole claim at once would have endorsed, because the sub-claims are logically connected in ways a per-sub-claim classifier does not see. Naming that risk plainly, rather than implying decomposition dissolves it, is the honest version of what shipped.

The mitigation that does exist is empirical rather than formal: a trust ramp tracking whether a given decomposition's composed verdict has, over repeated observations, tracked what a narrative judge reading the whole compound claim independently would have said. A decomposition starts in a provisional, unproven state, earns trusted status only once its track record supports it, and gets flagged for author attention on persistent disagreement — the same lifecycle the corpus already uses to calibrate repair quality, reused rather than reinvented, because the underlying question — has this mechanism's output tracked ground truth over enough observations to trust it — is the same question in both places.

## Where the Institutional Locus Needs a Different Kind of Solver Entirely

The authoritative-institutional locus — claims grounded in statute, regulation, or contract rather than executable fact — is the one place the two-facet model's "formalize-and-solve" mechanism cannot simply reuse an ordinary logic solver borrowed wholesale from formal software verification, and the reason is a property of legal rules that most software verification tooling was never built to represent: legal rules are *defeasible*. A rule holds unless a specific, nameable exception defeats it, and the exception itself can be defeated by a further exception, in a structure that classical monotonic logic — where adding more true premises can only add more true conclusions, never retract one — cannot express without distortion. Feeding a statute into a generic theorem prover and treating "no applicable exception found" as "the rule definitely applies" silently drops the defeasibility the rule actually has.

The correct tool for this locus is a defeasible argumentation framework — ASPIC+, ABA+, or DeLP are the three most developed instances in the AI-and-law literature — not because they're more powerful in a general sense, but because their semantics are built for exactly this shape of reasoning: arguments constructed from rules and exceptions, attacking and defeating each other according to a stated preference ordering, resolving to one of three outcomes — accepted, rejected, or undecided — rather than forcing a binary verdict where the honest answer is genuinely unsettled. That three-way output isn't a limitation bolted on afterward; it's the mechanism's own confidence ceiling, computed directly from the argumentation semantics rather than estimated separately. A claim resolving against clean, codified statutory text with no live exception in play earns the model's default ceiling. A claim running into an open-textured term — "reasonable," "good faith," an unsettled point of case law — resolves to a genuinely undecided verdict, correctly, because the unsettledness is a structural property of the text itself, not a solver-quality gap a better implementation would eventually close.

This mechanism is named in the design, not yet built — the honest inventory this post has kept throughout applies here too, and it applies without softening: nothing in this section describes shipped code. What's real is the ceiling table's entry for this locus, stating the bound before the tool exists to hit it, which is the right order to do the work in: know what the mechanism can honestly claim before writing the mechanism, not after — because a ceiling discovered after the fact is far more likely to get quietly ignored than one written down before a single line of the solver exists.

<span id="prop-2"></span>

<details>
<summary>Proposition 2 -- Execution Verdicts Are Bounded by Undecidability, Not by Implementation Quality</summary>

**Proposition 2** (Execution Ceiling). For a claim whose mechanism is execution — does this code terminate, does this migration hold its lock only as long as claimed — no sandboxed check can report a result stronger than "did not violate the property within observation bound {% katex() %}T{% end %}." Deciding the general property is equivalent to deciding a non-trivial semantic property of an arbitrary program, which Rice's theorem proves undecidable in general {{ cite(ref="6", title="Rice, H. G. (1953) — Classes of Recursively Enumerable Sets and Their Decision Problems, Transactions of the American Mathematical Society") }}.

</details>

> **Physical translation.** A sandbox that lets the migration-loop code run for ten minutes without triggering the runaway-lock alarm has verified "did not misbehave within ten minutes." It has not verified "cannot misbehave" — and a verification layer that reports the second claim when it only earned the first is more dangerous than one that reports no claim at all, because it invites exactly the trust the previous post's scenario showed was misplaced.

This isn't a gap the design failed to close — it's the honest boundary the design states about itself. The corrected model's ceiling table names this explicitly rather than implying a future version will remove it: execution is capped by Rice's theorem; a legal-formalization mechanism is capped by the plain limits of what codified statute can resolve versus what open-textured terms like "reasonable" leave genuinely unsettled; an aggregation-based mechanism is capped by Arrow's impossibility theorem and must name its specific aggregation rule rather than imply it recovered some single collective truth. None of these three ceilings is a statement about the current implementation's quality — a better engineer, given infinite time, does not raise any of them, because each is a property of the underlying mathematics, not of the code written against it. That distinction matters specifically because it's the one most often lost in translation between a research document and a product roadmap: "we haven't built this yet" and "this cannot be built past a certain point, ever" read identically in a backlog, and only one of them is a scheduling problem.

## The Honest Scope Claim, Stated Rather Than Implied

One more thing needs saying plainly before closing, because it's the kind of caveat that's easy to omit precisely where it matters most: no production verification system found anywhere in a survey of the field verifies across domains through one shared mechanism-classification layer. Every real, shipped verification tool — code-review linters, regulatory-compliance pilots, static analyzers — is scoped to a single locus, built by people who know that locus deeply, and doesn't attempt the general case this design attempts. That makes the two-facet model an extrapolation from single-domain production precedent plus an academic taxonomy, not an implementation of an established industry pattern with a track record behind it.

That's a materially different risk posture than "this is how the industry already does it, we just formalized it," and it's exactly why the additive-only, defaults-to-narrative-behavior composition rule carries as much weight as it does in this design. When a design is genuinely first-of-its-kind rather than a formalization of existing practice, the load-bearing safety property can't be "we're confident this generalizes correctly" — it has to be "if this doesn't generalize correctly for some domain nobody's tested yet, the failure mode is falling back to exactly what existed before, not something worse." Stating the extrapolation honestly, rather than dressing it as precedent, is what makes attempting it responsibly possible at all.

## The Fourth Locus, Deferred on Purpose

One locus in the taxonomy — the distributed-social locus, claims whose ground truth is a matter of aggregated collective judgment rather than fact, statute, or execution — has no mechanism assigned to it at all, and the omission is deliberate rather than an oversight waiting to be filled in next quarter. Its natural approach, aggregating individual judgments and measuring how well they converge, runs into the same impossibility result Post 1 named for merge algorithms in a different guise: Arrow's theorem proves no aggregation rule can simultaneously satisfy a small set of independently reasonable fairness criteria over three or more options. A mechanism built for this locus cannot honestly claim to have recovered "the group's true collective view" — the ceiling it would have to report is narrower and more specific: which named aggregation rule was used, and what that rule's own known failure modes are, never a claim of having found some rule-independent ground truth underneath the aggregation.

That's a harder ceiling to state honestly than any of the other three loci carry, which is precisely why this one is still unbuilt rather than shipped with an inflated confidence claim attached to cover the gap. A mechanism that can't state its own ceiling correctly is worse than no mechanism at all, for the same reason the rejected four-facet design was worse than the two-facet replacement — an unearned confidence number is actively misleading in a way a stated "not yet implemented" is not.

## How the Mechanized-Override Dispatch Is Meant to Work

Whether the mechanized-override machinery actually fires as designed, as opposed to existing correctly only on paper, is a fair question to ask of any design this layered, and the dispatch path deserves a concrete answer rather than an abstraction. A constraint check tagged with a named external tool routes to a subprocess speaking JSON-RPC over stdio, not to a mocked interface standing in for one. The resulting verdict carries a mechanized result with an explicit confidence-ceiling field attached — a field that no narrative verdict, produced by the ordinary prose-reading path, ever carries, which makes its presence a direct, unambiguous signal that the mechanized dispatch path fired rather than the narrative fallback. The same subprocess tool, invoked directly, has to confirm both verdict directions — present and missing — and confirm that parameters written in the corpus's own configuration actually reach the subprocess call rather than being silently accepted and discarded, a failure mode structured configuration plumbing is specifically prone to.

What a dispatch path like this does and doesn't establish deserves the same precision as everything else in this design: wiring a mechanism through to a genuine subprocess call proves the mechanism is real, working code, not a shipped-but-inert code path masquerading as a feature. It does not by itself prove the mechanism has closed the original motivating defect — a deliberately simple, throwaway validation tool is not a production-grade static analyzer for the language a real defect would be written in, and a shipped constraint corpus doesn't have to tag a check with this mechanism the moment it exists. Proving the wiring works and proving the wiring has been used to close a real gap are different claims, and only the first is cheap to earn.

## Framework in Practice — A Compliance Corpus, Locus by Locus

A single constraint corpus, reviewed through this lens, makes the taxonomy concrete rather than leaving it as an abstract four-row table nobody actually applies to a real check — the corpus below is constructed for that purpose. A financial-services compliance check bundles three claims in one nominal item: the system enforces a maximum transaction value (an executable claim — internal-formal locus, execution mechanism, bounded by Rice's theorem to "did not violate the bound within the observed window"), the enforcement satisfies a named regulatory ceiling (an authoritative-institutional claim, formalize-and-solve mechanism, bounded by whatever the regulation's own text leaves genuinely open to interpretation), and the mechanism will remain compliant after a scheduled rule change eighteen months out (a claim about the future that no mechanism available today can verify at all, and which the corrected model reports honestly as open, contributing to the gap count rather than being forced into a premature true-or-false).

Decomposed this way, rather than judged as one bundled item the way it would have been under the original boolean model, the compound check's overall verdict is neither a single narrative "looks compliant" nor a false claim of certainty across all three sub-claims. It's three separately-tracked verdicts, of three different qualities, composed by the additive rule this post has described throughout: the execution sub-claim can be mechanically overridden once a real tool is wired in; the institutional sub-claim gets a defeasible-argumentation ceiling once that mechanism exists; the future-facing sub-claim stays honestly open, forever, because nothing about better tooling changes the fact that it's a claim about events that haven't happened yet. A team reading this corpus's output today knows exactly which of the three sub-claims they're trusting, on what basis, and which one remains genuinely open regardless of how much engineering effort gets thrown at it — which is the entire post's argument, applied to one concrete row in one real table.

> **Cognitive Map.** A boolean verdict conflates three states that matter differently: confirmed true, confirmed false, and never actually checked. Two designs were tried and rejected before the one that shipped, and each rejection taught a specific, transferable lesson: the operator-curated allowlist failed on a counting argument — domains are unbounded, and any design requiring advance per-domain investment fails on the domain nobody staffed for. The four-facet model failed on a polarity argument — treating missing classification data as a reason to exclude a check inherited the wrong default from the corpus's own existing safe convention, and would have let ordinary corpus growth erode the compliance bar it existed to raise. The fix that shipped isn't a smarter classifier — it's an addition-only rule that can only make a verdict more informed than the narrative default, never less, immune to both failure modes by construction: an unregistered domain gets the narrative fallback, not an error, and missing data changes nothing rather than excluding anything. What it buys is real and bounded: mechanized verdicts where a trace exists or a tool is genuinely wired in, dispatched through a genuine subprocess call rather than assumed correct from unit tests alone, and an honest ceiling stated for every locus — Rice's theorem for execution, Arrow's theorem for the one locus deliberately left unbuilt, the plain limits of legal formalization for institutional claims, an explicit compound-claim decomposition for the discursive dilemma's residual risk — everywhere a general solution genuinely cannot exist, rather than a confident number standing in for one. The previous post showed bias-free judgment isn't the same as complete coverage. This one shows that even a coverage-aware design has to say, in writing, exactly how far its coverage goes, and exactly which parts of the field it's extrapolating into rather than following established precedent.

**Compute it.** Find one check in your own corpus tagged, implicitly or explicitly, as verifying an execution property. Ask what your pipeline's strongest honest claim about it actually is — "ran for {% katex() %}T{% end %} without violating the property," or something stronger. If it's reporting something stronger than that, the report is overclaiming relative to what was actually tested, regardless of how confident the number looks. Then find one *compound* check — one nominal item bundling more than one kind of claim — and ask whether your pipeline reports one verdict for the bundle or tracks each sub-claim separately. If it's one verdict, the discursive dilemma is a live risk in your corpus today, not a theoretical one, and decomposing that single check into its actual sub-claims is the cheapest fix available before the next design in this space gets built from scratch instead of learning from the two that already failed here.

---
<sup>[1]</sup> Ranganathan, S. R. *Colon Classification* (1933, revised editions through the 1960s) and *Prolegomena to Library Classification* (1937) — foundational works establishing faceted classification theory in library and information science.

<sup>[2]</sup> Han, J., Buntine, W. & Shareghi, E. (2025). *VerifiAgent: a Unified Verification Agent in Language Model Reasoning.* arXiv:2504.00406.

<sup>[3]</sup> Basu, A. (2026). *Tool Receipts, Not Zero-Knowledge Proofs: Practical Hallucination Detection for AI Agents.* arXiv:2603.10060.

<sup>[4]</sup> List, C. & Pettit, P. (2002). *Aggregating Sets of Judgments: An Impossibility Result.* Economics and Philosophy, 18(1), 89–110.

<sup>[5]</sup> Kornhauser, L. A. & Sager, L. G. (1986). *Unpacking the Court.* Yale Law Journal, 96(1), 82–117.

<sup>[6]</sup> Rice, H. G. (1953). *Classes of Recursively Enumerable Sets and Their Decision Problems.* Transactions of the American Mathematical Society, 74(2), 358–366.
