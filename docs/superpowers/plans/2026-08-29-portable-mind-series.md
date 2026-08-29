# The Portable Mind Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write and publish the four-post series "The Portable Mind: Five Properties of Thinking" on e-mindset.space, per the finalized design at `docs/superpowers/specs/2026-08-29-portable-mind-design.md`.

**Architecture:** Four Zola markdown posts under `content/blog/<date>/index.md`, sharing one `series = ["portable-mind"]` taxonomy, continuous Definition/Proposition numbering across all four files, and one accumulating Property Verdict Ledger table that grows by one row per post and is assembled in full in Post 4.

**Tech Stack:** Zola static site generator, KaTeX shortcodes for math, Mermaid for the one diagram that earns its place (the MAPE-K/property mapping in Post 4), the site's existing `cite()` and `term()` shortcodes, `<details class="proof">` blocks for formal apparatus.

## Global Constraints

Copied verbatim from the design spec — every task below inherits all of these:

- No em-dashes (`—`) anywhere in prose. Zero tolerance, verified by grep after every post.
- No comma-stacked subsentences.
- Variable definitions use `where:` bullet lists, never `Term | Meaning` tables.
- Terminology: primary/secondary, never master/slave.
- Every post: minimum 7,500 words, target toward ~20,000 (this is a floor, not a padding target).
- Definition/Proposition numbering is continuous across all four posts (Post 2 continues from wherever Post 1 left off, and so on through Post 4).
- Every formal claim is tagged inline with its epistemic layer: `[Layer 1: Bound]`, `[Layer 2: Fit]`, or `[Layer 3: Estimate]` — this is non-negotiable per Brainstorm Round 1 and Round 3's corrections.
- Every citation must resolve to a real, verifiable source (all citations in this plan were already verified against primary sources during the design's brainstorm rounds — do not invent or loosely paraphrase new ones without the same verification standard).
- The methodology behind the two rederived formalizations (Post 2's Abstraction, Post 4's Optimization) is never named, in any post, under any circumstance.
- `{{ cite(ref="N", title="...") }}` ref set must exactly equal the `<sup>[N]</sup>` footnote set in that post's References section.
- Every opened shortcode (`{% katex() %}`, `{% mermaid() %}`, `{% term() %}`, `{% cite() %}`, `<details>`) must have a matching close, verified by count.
- `zola build` must succeed with the expected page count and 0 orphans after every post is added.

---

## Task 1: Post 1 — "Noticing and the Cost of Not Knowing Enough" (Simulation)

**Files:**
- Create: `content/blog/2026-09-06/index.md`

**Interfaces:**
- Produces: Definition 1 (Requisite Variety), Proposition 1 (Ashby's Law bound), the opening SWE-bench case (reused verbatim as the Post 4 bookend — the exact numbers here must match Task 4 exactly: six frontier LLMs, ~5x token-cost underestimation, confidence 61-93% vs. actual pass rate 75-81%), Row 1 of the Property Verdict Ledger.
- Consumes: nothing (opening post).

- [ ] **Step 1: Draft frontmatter**

```toml
+++
authors = ["Yuriy Polyulya"]
title = "Noticing and the Cost of Not Knowing Enough"
description = "[Write after drafting the post body, per this blog's convention: 2-4 sentences summarizing the core claim, matching the density of the Asymptotically Ruined and Theorems Out of Warranty post descriptions already in this repo.]"
date = 2026-09-06
slug = "portable-mind-part1-requisite-variety"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "epistemology", "systems-thinking"]
series = ["portable-mind"]

[extra]
toc = true
series_order = 1
series_title = "The Portable Mind: Five Properties of Thinking"
series_description = """[Write per Task 5 — this must be identical across all four files, same convention as every prior series in this repo (see content/blog/2026-08-02/index.md for the pattern).]"""
+++
```

Use only tags already in the site's 31-tag common vocabulary (checked in the earlier tag-cleanup pass this session) unless a genuinely new concept requires one — if so, it must appear in at least one other post in this series to avoid recreating a singleton-tag problem.

- [ ] **Step 2: Write the opening scenario**

Open with the SWE-bench self-assessment case, stated as fact with the real citation, not fictionalized: six frontier LLMs asked to forecast their own success probability and token cost on SWE-bench tasks before attempting them. Every model was miscalibrated. Token-cost estimates ran roughly 5x too low. Stated confidence spread 61-93% while actual pass rates clustered 75-81%. Cite the source paper found during Brainstorm Round 2 research.

- [ ] **Step 3: State Definition 1 and Proposition 1 with proof**

```markdown
<details>
<summary>Definition 1 -- Requisite Variety: what a regulator needs to know before it can act correctly</summary>

**Definition 1** (Requisite Variety). For a regulator attempting to hold a system's outcome within a target set despite disturbances, let {% katex() %}V(\cdot){% end %} denote variety (the log of the number of distinguishable states). The regulator can reduce outcome variety only to the extent permitted by

{% katex(block=true) %}
V(\text{outcome}) \geq V(\text{disturbance}) - V(\text{regulator})
{% end %}

where:
- {% katex() %}V(\text{disturbance}){% end %} is the variety of states the environment can force
- {% katex() %}V(\text{regulator}){% end %} is the variety of distinct responses the regulator can produce
- {% katex() %}V(\text{outcome}){% end %} is the residual variety in what actually happens

</details>

**Proposition 1** [Layer 1: Bound] (Ashby's Law of Requisite Variety, 1956). No regulator can achieve outcome variety lower than {% katex() %}V(\text{disturbance}) - V(\text{regulator}){% end %}. Proof sketch: this follows directly from Shannon's data-processing inequality applied to the regulator as a channel between disturbance and outcome; a regulator cannot distinguish more disturbance states than it has internal states to represent, so any disturbance variety exceeding the regulator's own variety necessarily passes through into outcome variety unreduced. This holds for any regulator, biological or computational, by construction of the inequality, not as an empirical claim about either.
```

- [ ] **Step 4: Write the Physical Translation blockquote**

This is the sentence that must do the real work, per the drafting priority the spec names explicitly. It must convert Proposition 1 into the exact reason the SWE-bench agents underestimated their own cost: they held less internal variety about the actual state space of a repo's defects and edge cases than that state space actually contains, so their token-cost forecast collapsed onto a narrower range than the task's real disturbance variety required. State this in one dense paragraph, no em-dash, no comma-chains.

- [ ] **Step 5: Connect to the human paradox, explicitly layer-tagged**

State the planning fallacy (Kahneman & Tversky, 1979) as [Layer 2: Fit] — an independently measured human finding. State the claim that the SWE-bench result and the planning fallacy are the same underlying phenomenon as [Layer 3: Estimate], citing the three-layer discipline from the design spec directly, including the Putnam multiple-realizability caveat from Brainstorm Round 1 in this post's own words (do not skip this — it is the post's actual epistemic-honesty payload, not boilerplate).

- [ ] **Step 6: Write the Falsification Criteria section**

State at least two explicit conditions (F1, F2) that would invalidate this post's own claim — for example, F1: a frontier agent shown to forecast its own resource requirements within a stated calibration bound on a held-out task distribution it wasn't tuned against. Do not write vague criteria; each must name a concrete, checkable condition.

- [ ] **Step 7: Write Row 1 of the Property Verdict Ledger**

Columns: Property (Noticing + Simulation) | Formal Proposition (Proposition 1) | Human Instance (planning fallacy) | Agent Instance (SWE-bench study) | Exact vs. Approximate (Layer 1 exact for the theorem itself, Layer 3 approximate for the cross-substrate claim) | Verdict | Control-Plane Consequence (name the specific architectural response: a resource-estimation floor gating admission, calibrated against measured variety, not self-reported confidence).

- [ ] **Step 7a: Introduce and quantify "the portability gap"**

This is the series' flagship coined term and it must appear in Post 1, not be introduced later. State it directly: the portability gap is the space between what a shared cognitive architecture guarantees (the same structure, per the Han/Andreas/Fedorenko/de Varda paper) and what it does not (the same reliability). Quantify it immediately, not as metaphor: for a given property, the portability gap is the latency and compute cost of the secondary, external verification loop required to audit that property, because Proposition 4 (Post 3) proves the property cannot certify itself from within. State plainly that Post 1 names the concept and Post 3 is where it gets its formal justification, so the reader knows to expect the payoff rather than assuming the definition given here is complete.

- [ ] **Step 7b: Write the frontmatter `description` field**

Now that the body is drafted, write the 2-4 sentence SEO description summarizing the post's core claim, matching the density of existing post descriptions in this repo (see `content/blog/2026-08-02/index.md` or `content/blog/2026-07-08/index.md` for the calibration target). Replace the bracketed placeholder from Step 1 with this text.

- [ ] **Step 8: Verify shortcode balance**

Run: `grep -o '{% [a-z]*(' content/blog/2026-09-06/index.md | sort | uniq -c` and confirm every opener has a matching `{% end %}` count; run `grep -c '<details' content/blog/2026-09-06/index.md` against `grep -c '</details>' content/blog/2026-09-06/index.md` and confirm they match.
Expected: all counts balance.

- [ ] **Step 9: Verify citation consistency**

Run: `grep -oP 'cite\(ref="\K[0-9]+' content/blog/2026-09-06/index.md | sort -u` and `grep -oP '<sup>\[\K[0-9]+(?=\])' content/blog/2026-09-06/index.md | sort -u` and confirm the two sets are identical.
Expected: identical sets, no orphaned citation numbers.

- [ ] **Step 10: Verify prose constraints**

Run: `grep -c '—' content/blog/2026-09-06/index.md`
Expected: 0. If nonzero, find and rewrite every instance before proceeding.

- [ ] **Step 11: Verify word count floor**

Run: `wc -w content/blog/2026-09-06/index.md`
Expected: at least 7,500 words in the body (frontmatter excluded from the count by eye).

- [ ] **Step 12: Build and verify**

Run: `zola build`
Expected: build succeeds, page count increases by 1 over the prior baseline, 0 orphans.

- [ ] **Step 13: Commit**

```bash
git add content/blog/2026-09-06/index.md
git commit -m "Add Portable Mind Post 1: Noticing and the Cost of Not Knowing Enough"
```

---

## Task 2: Post 2 — Abstraction and Rationality

**Files:**
- Create: `content/blog/2026-09-13/index.md`

**Interfaces:**
- Consumes: continues numbering from Task 1 (Definition 2 onward, Proposition 2 onward).
- Produces: Definition 2 (Sufficiency), Proposition 2 (sufficient-statistic reframing, unnamed methodology), Definition 3 (Asymmetric Updating), Proposition 3 (confirmation bias as biased Bayesian update, divergence result), Row 2 of the ledger.

- [ ] **Step 1: Draft frontmatter** (same structure as Task 1 Step 1, `series_order = 2`, slug `portable-mind-part2-sufficient-abstraction`)

- [ ] **Step 2: Open with the functional-fixedness case**

State the August 2025 "Trapped by Expectations: Functional Fixedness in LLM-Enabled Chat Search" finding as the opening scenario, with the real citation.

- [ ] **Step 3: State Definition 2 and Proposition 2 (Abstraction), unnamed methodology**

```markdown
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

</details>

**Proposition 2** [Layer 1: Bound] (Fisher Sufficiency). If {% katex() %}A{% end %} is sufficient for {% katex() %}T{% end %}, discarding the rest of {% katex() %}D{% end %} costs no predictive power about {% katex() %}T{% end %}. This is classical statistics, not an interpretive claim. The residual risk is entirely on the other side: an abstraction sufficient for yesterday's target {% katex() %}T_{\text{old}}{% end %} carries no guarantee of sufficiency for today's target {% katex() %}T_{\text{new}}{% end %}, and nothing about holding {% katex() %}A{% end %} fixed announces the moment {% katex() %}P(T_{\text{new}} \mid D, A) \neq P(T_{\text{new}} \mid A){% end %} starts holding.
```

Then write the paragraph deriving the unnamed reframing: functional fixedness is exactly the failure of re-deriving a sufficient abstraction once the target changes, holding onto {% katex() %}A{% end %} past the point it stopped being sufficient. Do this derivation on its own mathematical merits per the spec's explicit requirement — show the information-loss argument directly, do not gesture at an external methodology to justify it.

- [ ] **Step 4: State Definition 3 and Proposition 3 (Rationality)**

```markdown
<details>
<summary>Definition 3 -- Asymmetric Updating: confirmation bias as a precise deviation from Bayes' rule</summary>

**Definition 3** (Asymmetric Belief Updating). A reasoner updates asymmetrically if, given a prior {% katex() %}P(H){% end %} and evidence {% katex() %}E{% end %}, it applies likelihood weight {% katex() %}w_+ > 1{% end %} to evidence favoring {% katex() %}H{% end %} and {% katex() %}w_- < 1{% end %} to evidence disfavoring it, rather than the true likelihood ratio.

</details>

**Proposition 3** [Layer 1: Bound]. Asymmetric updating with {% katex() %}w_+ \neq w_-{% end %} produces a posterior that provably diverges from the proper Bayesian posterior as evidence accumulates, converging (if at all) to a belief systematically shifted toward the reasoner's prior rather than the truth. Proper Bayesian updating (or Popper's falsification strategy, which actively seeks {% katex() %}w_-{% end %}-type evidence) converges strictly faster under stated regularity conditions.
```

- [ ] **Step 5: Write both Physical Translation blockquotes**

One for Abstraction (the exact reason a chat-search agent keeps recommending the same category of answer after the query's real target has shifted), one for Rationality (the exact reason a verification pipeline that only samples confirming test cases ships the wrong fix). Both dense, adversarial, no em-dashes.

- [ ] **Step 6: Layer-tag both human/agent pairings**

Functional fixedness (Duncker, Luchins) as [Layer 2: Fit] on the human side, the August 2025 paper as [Layer 2: Fit] on the agent side, the claim they are the same phenomenon as [Layer 3: Estimate]. Repeat the same three-way tagging for confirmation bias (Nickerson, 1998) and the 2025 LLM framing/confirmation-bias study.

- [ ] **Step 7: Apply the mandatory achievable-region Definition before any trade-off is used**

This post does not yet need the full Pareto Definition (that is Task 4's job for the optimal-stopping trade-off), but if any trade-off language is used in passing here (e.g., abstraction compression vs. fidelity), it must get its own explicit Definition first per the blog's standing rule, not be used implicitly.

- [ ] **Step 8: Write the Falsification Criteria section** (same pattern as Task 1 Step 6, at least F1 and F2, concrete and checkable, one per property in this post)

- [ ] **Step 9: Write Row 2 of the ledger** (Abstraction and Rationality as two sub-rows or one combined row, matching whatever format Task 1 established — keep the ledger's column structure identical across posts)

- [ ] **Step 9a: Write the frontmatter `description` field** (same instruction as Task 1 Step 7b, applied to this post's own body)

- [ ] **Step 10-14: Repeat the verification steps from Task 1 (Steps 8-12) against `content/blog/2026-09-13/index.md`**

- [ ] **Step 15: Commit**

```bash
git add content/blog/2026-09-13/index.md
git commit -m "Add Portable Mind Post 2: Abstraction and Rationality"
```

---

## Task 3: Post 3 — Awareness (standalone)

**Files:**
- Create: `content/blog/2026-09-20/index.md`

**Interfaces:**
- Consumes: continues numbering from Task 2.
- Produces: Definition 4 (Provability-Based Self-Trust), Proposition 4 (Critch's generalized Löb result, Layer 1, agent-scoped only), the explicit Franzén caveat paragraph, Row 3 of the ledger, the H2AI shadow-mode case.

- [ ] **Step 1: Draft frontmatter** (`series_order = 3`, slug `portable-mind-part3-the-unverifiable-self`)

- [ ] **Step 2: Open with the H2AI Control Plane shadow-mode case**

State the concrete shadow-mode calibration scenario as the opening. This is the one place in the series a real, current internal data point is used; do not overstate results beyond what the actual shadow-mode data supports.

- [ ] **Step 3: State Definition 4 and Proposition 4, scoped correctly**

```markdown
<details>
<summary>Definition 4 -- Provability-Based Self-Trust: what it means for a reasoner to trust its own proofs</summary>

**Definition 4** (Provability-Based Self-Trust). A reasoning agent has provability-based self-trust if it accepts a proposition {% katex() %}\phi{% end %} whenever it can derive {% katex() %}\Box \phi{% end %} (a proof of {% katex() %}\phi{% end %} exists within its own formal system), including propositions about its own future behavior.

</details>

**Proposition 4** [Layer 1: Bound] (Critch's generalized Löb's theorem, applied to a provability-based reasoner). No consistent, sufficiently powerful provability-based reasoner can derive {% katex() %}\Box(\Box\phi \rightarrow \phi){% end %} for all {% katex() %}\phi{% end %} without thereby deriving {% katex() %}\Box\phi{% end %} regardless of whether {% katex() %}\phi{% end %} is true. This is the Löbian obstacle: such a reasoner cannot coherently trust "if I can prove it, it's true" as a general principle about itself. This result is scoped explicitly to agents whose self-trust mechanism is actually modeled as a provability-based reasoner. It is not a claim about consciousness, minds in general, or any system that isn't literally reasoning this way.
```

- [ ] **Step 4: Write the Franzén caveat paragraph explicitly**

State, in the post's own words, that applying Gödel's or Löb's theorem to a system that is not literally a formal axiomatic system (a human brain, an LLM not operating via explicit provability-based self-verification) is a documented category of misuse, citing Torkel Franzén's own critique naming AI as a specific recurring site of it. This paragraph is not optional connective tissue, it is the post's central epistemic-honesty move and must be as carefully written as the proof itself.

- [ ] **Step 5: State the Dunning-Kruger connection at Layer 3 only**

Cite Kruger & Dunning (1999) and the real 2020s statistical-artifact reanalyses (typed as Regressional Goodhart, per the design spec) as [Layer 2: Fit] on the human side. Explicitly label the connection to Proposition 4 as [Layer 3: Estimate] — an illustrative analogue to a formal limit, never asserted as the same theorem applying to a human brain.

- [ ] **Step 6: Add Bandura's Social Cognitive Theory as the second Awareness anchor**

State self-efficacy (belief about capability causally shaping subsequent behavior and performance, reciprocal determinism between behavior, environment, and cognition) as a distinct [Layer 2: Fit] finding, complementary to Dunning-Kruger, not a restatement of it. This is the behavioral-consequence side of miscalibration; Dunning-Kruger is the measurement side.

- [ ] **Step 7: Write the Physical Translation blockquote**

Convert Proposition 4 into the exact reason an agent's own self-reported confidence cannot be trusted as a substitute for external verification, tying directly to why H2AI's shadow-mode reconciliation exists as a separate control-plane mechanism rather than relying on the orchestrated agents' own self-assessment.

- [ ] **Step 8: Write the Falsification Criteria section**

At minimum, state the condition from the design spec directly: this post's formalization would be falsified if a provability-based reasoner were shown to verify its own consistency using only internal resources in a case Proposition 4 forbids, which would mean the formalization itself is wrong, not just the agent.

- [ ] **Step 9: Write Row 3 of the ledger, including the Control-Plane Consequence column**

Name the specific external audit loop this property's failure requires (the shadow-mode reconciliation mechanism), per the deployment-gate requirement added to the design spec.

- [ ] **Step 9a: Tie Proposition 4 back to the portability gap introduced in Post 1**

This post is where the portability gap's definition from Post 1 Step 7a gets its actual formal justification: Proposition 4 is the reason no property can certify itself, which is why the external verification loop's cost is a structural necessity rather than a design preference. State this connection explicitly rather than leaving Post 1's introduction and Post 3's proof feeling like two separate posts.

- [ ] **Step 9b: Write the frontmatter `description` field** (same instruction as Task 1 Step 7b)

- [ ] **Step 10-14: Repeat the verification steps from Task 1 (Steps 8-12) against `content/blog/2026-09-20/index.md`**

- [ ] **Step 15: Commit**

```bash
git add content/blog/2026-09-20/index.md
git commit -m "Add Portable Mind Post 3: Awareness"
```

---

## Task 4: Post 4 — Optimization and the Closing Synthesis

**Files:**
- Create: `content/blog/2026-09-27/index.md`

**Interfaces:**
- Consumes: continues numbering from Task 3; reuses the exact SWE-bench numbers from Task 1 Step 2 verbatim for the bookend; reuses the complete Property Verdict Ledger (Rows 1-3 from Tasks 1-3) and adds Row 4.
- Produces: Definition 5 (the achievable-region Pareto Definition for search cost vs. distance from the ideal), Proposition 5 (cost-aware optimal stopping, satisficing as the correct policy), Definition 6 (Ideality, the unnamed methodology's concept, rederived independently), the MAPE-K Mermaid diagram, the causal-cascade bookend section, the closing self-consistency argument, the complete assembled ledger.

- [ ] **Step 1: Draft frontmatter** (`series_order = 4`, slug `portable-mind-part4-the-portability-gap`)

- [ ] **Step 2: State Definition 5 (the mandatory Pareto Definition) before Proposition 5 uses it**

```markdown
<details>
<summary>Definition 5 -- The Search-Cost Achievable Region</summary>

**Definition 5** (Search-Cost Achievable Region). For a search process incurring cost {% katex() %}c{% end %} per additional option examined, the achievable region is the set of pairs {% katex() %}(c \cdot n, |v_n - v^*|){% end %} where:
- {% katex() %}n{% end %} is the number of options examined before stopping
- {% katex() %}v_n{% end %} is the best value found after {% katex() %}n{% end %} examinations
- {% katex() %}v^*{% end %} is the costless-search optimum, unreachable at finite {% katex() %}n{% end %} except by chance

</details>
```

- [ ] **Step 3: State Proposition 5, cost-aware, per the resolved design decision**

```markdown
**Proposition 5** [Layer 1: Bound] (Cost-Aware Optimal Stopping, Stigler/McCall reservation-value form). Given a per-option search cost {% katex() %}c > 0{% end %}, the policy that minimizes total expected cost (search cost plus distance from {% katex() %}v^*{% end %}) is a reservation-value threshold rule: stop as soon as an option meeting or exceeding a computed threshold {% katex() %}\theta(c){% end %} is found. This threshold rule is satisficing in form, and it is the actual optimal policy under this cost structure, not an approximation of one. As {% katex() %}c \to 0{% end %}, {% katex() %}\theta(c) \to v^*{% end %}: the costless ideal is the limiting case search cost structurally prevents any real system from reaching.
```

- [ ] **Step 4: Derive the unnamed ideality concept independently, on its own merits**

Write the paragraph connecting Definition 6 (state it as its own definition: an ideal system is one where {% katex() %}c \to 0{% end %} and benefit is unbounded) to Proposition 5's limiting case, without naming the external methodology this is derived from anywhere in the text.

- [ ] **Step 5: State sunk cost fallacy and the escalation-of-commitment finding, three-layer tagged**

Arkes & Blumer (1985) as [Layer 2: Fit] on the human side. The "Getting out of the Big-Muddy" 2025 paper as [Layer 2: Fit] on the agent side, stating the precise numbers: individual LLM decisions show low escalation, symmetrical multi-agent peer deliberation produces 99.2% escalation, organizational pressure produces 68.95%. State explicitly that this is a stronger finding than "agents have this bias": it is evidence the bias is an emergent property of multi-agent structure specifically, tie this to the game-theory citations (GTBench, the 2025 IJCAI survey) as [Layer 2: Fit] evidence of related strategic-reasoning limitations.

- [ ] **Step 6: Build the MAPE-K Mermaid diagram**

```markdown
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
```

Only include this diagram if the surrounding prose has already made the five-way correspondence explicit in words first; the diagram must show the cross-cutting structure of Knowledge/Awareness at a glance, which is harder to see in a linear paragraph, and that is the specific justification for using a diagram here at all.

- [ ] **Step 7: Write the bookend causal cascade**

Rerun the exact SWE-bench case from Post 1 through all five properties in causal sequence, per the design spec: the Simulation failure (underestimating required resources) cascades into an Abstraction failure (fixating on a single patch strategy), which distorts Rationality (discounting disconfirming test output), which blinds Awareness (unwarranted confidence in a broken diff), which forces Optimization into the escalation-of-commitment pattern (retrying instead of recognizing a structural ceiling). Cite the Constraint Sequence Framework directly using the same shortcode pattern already used in three 2026-08 posts:

```markdown
{% term(url="@/blog/2025-12-27/index.md#the-constraint-sequence-framework", def="A candidate constraint cannot be resolved by re-optimizing at the level of abstraction that revealed it; the dependency graph determines which constraint must be secured before the next one becomes binding") %}Constraint Sequence Framework{% end %}
```

- [ ] **Step 8: Write the closing self-consistency synthesis**

State the self-consistency definition (a property is self-consistent for a system if the system's belief that it possesses that property can be verified using only its own internal resources), Proposition 4's result as the one genuine Layer 1 instance of a self-consistency ceiling, and the extension to the other four properties explicitly as [Layer 3: Estimate] — this series' own structural generalization, stated in those exact terms, not implied as four more hidden proofs. Close by naming the actual argument this produces: external falsification is not optional scaffolding for any of the five properties, and connect this to Theorems Out of Warranty's thesis without restating it verbatim.

- [ ] **Step 9: Assemble and present the complete Property Verdict Ledger**

All four rows, all columns including Control-Plane Consequence, as one table, being the payoff object the whole series has been accumulating toward.

- [ ] **Step 9a: Close the portability gap arc**

State the total portability gap across all five properties as the sum of each row's Control-Plane Consequence cost, making the series' flagship coinage a computed number by the end, not just a phrase repeated three times. This is the final payoff of Post 1's introduction and Post 3's proof.

- [ ] **Step 9b: Write the frontmatter `description` field** (same instruction as Task 1 Step 7b)

- [ ] **Step 10: Write the Falsification Criteria section for Post 4's own claims** (the cost-aware optimal-stopping proposition and the Layer 3 generalization both need their own stated falsification conditions)

- [ ] **Step 11-15: Repeat the verification steps from Task 1 (Steps 8-12) against `content/blog/2026-09-27/index.md`**, plus one additional check:

- [ ] **Step 16: Verify the SWE-bench numbers match Post 1 exactly**

Run: `grep -o '5×\|5x\|61-93\|75-81' content/blog/2026-09-06/index.md content/blog/2026-09-27/index.md`
Expected: the same figures appear in both files with no drift between the opening statement and the bookend rerun.

- [ ] **Step 17: Commit**

```bash
git add content/blog/2026-09-27/index.md
git commit -m "Add Portable Mind Post 4: Optimization and the Closing Synthesis"
```

---

## Task 5: Cross-Post Consistency Pass

**Files:**
- Modify: all four files created in Tasks 1-4

**Interfaces:**
- Consumes: all four completed posts.
- Produces: a verified-consistent four-post series matching the pattern already established by every prior series in this repo (per the tag-cleanup and lede-highlight work already done this session).

- [ ] **Step 1: Write the shared `series_description` and apply it identically to all four files**

Follow the exact pattern already used for the three other multi-part series in this repo this session: a `<div class="series-lede">` opening sentence, single, no em-dash-collision with the "greatest paradox" or "common illusion" ledes already used by other series, matching the aphoristic-but-simple register established after the earlier back-and-forth in this session (one flowing sentence, no jargon stacking). Apply the identical string to `series_description` in all four files' frontmatter.

- [ ] **Step 2: Verify Definition/Proposition numbering is continuous**

Run: `grep -oP '\*\*Definition \K[0-9]+' content/blog/2026-09-*/index.md` and `grep -oP '\*\*Proposition \K[0-9]+' content/blog/2026-09-*/index.md` across all four files in date order.
Expected: Definitions run 1-6 with no gaps or repeats across the series; Propositions run 1-5 with no gaps or repeats.

- [ ] **Step 3: Verify every tag used already exists in the site's common-tag vocabulary or appears at least twice**

Run the same tag-histogram script used in the earlier tag-cleanup pass this session (`content/blog/*/index.md` tag extraction and counting) and confirm no new singleton tags were introduced.
Expected: zero singleton tags site-wide, same invariant established earlier this session.

- [ ] **Step 4: Verify no cross-post link is broken**

Run the same link-validation script used earlier this session (extract all `href` targets from the built HTML, resolve relative paths, check against actual output directories and heading IDs) against the four new posts specifically, plus the full site.
Expected: zero broken links, matching the standard already established for the rest of the site this session.

- [ ] **Step 5: Full site build**

Run: `zola build`
Expected: page count increases by 4 over the pre-series baseline, 0 orphans.

- [ ] **Step 6: Commit**

```bash
git add content/blog/2026-09-*/index.md
git commit -m "Apply consistent series_description and verify cross-post consistency for Portable Mind series"
```
