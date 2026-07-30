+++
authors = ["Yuriy Polyulya"]
title = "The Iteration Trap"
description = "One more pass. That's the entire logic of a repair loop: whatever failed, better context and another attempt will eventually fix it. For most failures, that logic works — which is exactly what makes it a trap for the failures it doesn't. A recent complexity-theoretic result proves a specific class of task cannot be solved or verified within a bounded forward pass, no matter how many passes are chained together. A retry budget spent chasing that class buys nothing back — not a partial refund, nothing. Closing out Theorems Out of Warranty."
date = 2026-07-29
slug = "borrowed-guarantees-part4-ceiling-no-retry-clears"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "formal-methods", "complexity-theory"]
series = ["borrowed-guarantees"]

[extra]
toc = false
series_order = 4
series_title = "Theorems Out of Warranty"
series_description = "Every multi-agent verification design runs on a theorem borrowed from somewhere else — the Condorcet Jury Theorem, Byzantine fault tolerance, the Universal Scalability Law, computational complexity bounds. Each one shipped with a warranty: conditions the proof depends on, fine print nobody reads until something breaks. Stochastic LLM committees operate outside several of those conditions by default, and a guarantee doesn't fail loudly when it lapses — it just quietly stops covering what it was never proven to cover. This series finds exactly where coverage runs out, and builds what replaces it."
+++

Picture a distributed-systems liveness proof that exhausts a four-retry budget and returns nothing — zero usable characters on every attempt, not a near-miss, not a partially-correct draft slowly improving wave over wave.

*What if the fourth retry was never going to work — not because of a bad prompt, but because no number of retries could?*

That's the iteration trap: a strategy that works often enough to feel universal, right up until it meets the one failure it was never built to solve.

A repair loop built on the working assumption that every failure is a grounding problem — better context, a sharper rubric, one more pass — would treat this exactly like it would treat a task that was one clarifying fact away from passing. Those are not the same failure, and a retry budget spent diagnosing the wrong one, however carefully executed each individual retry is, is spent for nothing.

Three prior posts in this series each named a place where a borrowed guarantee stopped transferring cleanly to a stochastic committee: independence, unbiased judgment, complete verification coverage — each one a clause quietly assumed and then found, under specific, checkable conditions, not to hold. This one names a fourth, and it's the one most directly falsifiable of all four — not a matter of interpretation, calibration, or degree, but a specific, published proof that a specific class of task cannot be solved by a bounded number of forward passes, full stop, regardless of how many of those passes are orchestrated, in whatever topology, around each other.

## Framework Overview

Read the three rows below in the order they were understood historically, not the order a clean summary would present them in. The quality/grounding distinction was the first one a repair loop needed, because it's the most common case by volume — most failures genuinely are fixable with better context. The complexity ceiling was the second, harder-won distinction, because a repair loop treating every exhausted budget as a grounding problem has no way to notice it's wrong until someone specifically goes looking for the signature that says otherwise. The MUS oscillation case was the third and most subtle, because it produces symptoms — an exhausted budget, no clean convergence — that look, from a sufficient distance, like either of the first two, and only a targeted check for a specific pair of trading-off constraint violations reveals what's actually happening.

| Failure mode | What's actually wrong | Correct intervention |
| :--- | :--- | :--- |
| **Quality ceiling** | Solvable, but poorly grounded — missing context, ambiguous spec, weak repair signal | Better grounding, repair context, synthesis over partial passes |
| **Complexity ceiling** | Beyond what a bounded number of forward passes can solve or verify at all | Decomposition — break the task, don't retry it whole |
| **MUS oscillation ceiling** | The constraint set itself contains a minimal unsatisfiable subset; sequential repair cycles without ever converging | Parallel cluster-solve, then an integration pass — not more sequential repair, and not decomposition either, since the conflict is genuinely mutual rather than a matter of task size |

Three failure modes, observationally similar from the outside — all three exhaust a retry budget without producing a passing output, all three read identically on a dashboard that only logs a generic failed status once the budget runs out, with nothing distinguishing why — and only one of the three fixable by the intervention most repair loops default to when they see that outcome.

## The Theorem That Draws the Line

<span id="thm-1"></span>

<details>
<summary>Theorem 1 (Sikka & Sikka): a computational ceiling on what a bounded forward pass can solve or verify</summary>

**Theorem 1** (Sikka & Sikka, 2025). Given a prompt of length {% katex() %}N{% end %} containing a computational task of complexity {% katex() %}O(n^3){% end %} or higher, where {% katex() %}n < N{% end %}, a transformer-based language model will unavoidably hallucinate in its response — for both generating a solution and verifying one {{ cite(ref="1", title="Sikka, V. & Sikka, V. (2025) — Hallucination Stations: On Some Basic Limitations of Transformer-Based Language Models, arXiv:2507.07505") }}.

</details>

> **Physical translation.** Self-attention inside a single forward pass costs {% katex() %}O(n^2){% end %}. A task genuinely requiring {% katex() %}O(n^3){% end %} or more to solve or check has a computation bill the pass structurally cannot pay, regardless of how the prompt is worded. This holds for the model producing an answer and for a second model checking that answer, because the checker pays the same bill — a fact that changes the calculus, because it means adding a second, independent verification layer, the fix this series' second and third posts spent considerable space on, does nothing at all against this specific ceiling. A second reader bound by the same computational budget as the first reader cannot verify what the first reader cannot solve, no matter how independently the two are configured.

The theorem's reach matters more than its statement: it makes multi-agent orchestration with external verification *structurally necessary*, not merely preferable, for a specific class of task — if one forward pass provably cannot solve or verify something above this bound, then {% katex() %}N{% end %} parallel attempts, each still bounded by the same per-pass budget, cannot get there either without decomposition. What the theorem does not guarantee is that iteration plus ensembling is *sufficient* once decomposition happens — it establishes the floor below which single-pass approaches always fail, not a ceiling on what a properly decomposed approach can reach.

The behavior a repair loop exhibits once it's past that floor without knowing it — one more wave, then another, past the point any of them could plausibly help — has a well-studied name in organizational psychology, for a different reason entirely. Human decision-makers facing a failing course of action tend to increase their commitment to it rather than abandon it, especially once they're personally invested in having chosen it, escalating resource commitment in a way that tracks sunk cost rather than the odds of success {{ cite(ref="2", title="Staw (1976) — Knee-Deep in the Big Muddy: A Study of Escalating Commitment to a Chosen Course of Action, Organizational Behavior and Human Performance 16, 27–44") }}. The mechanisms don't match — a repair loop has no ego and no sunk-cost bias, only a missing measurement — but the resulting shape is identical: continued investment in a strategy whose success probability, past a specific and identifiable point, is exactly zero rather than merely low.

Rational-choice theory gives the exact benchmark this bias departs from. A decision-maker who has already spent a sunk cost {% katex() %}S{% end %} should continue only if the expected marginal benefit of the next unit of effort exceeds its marginal cost — {% katex() %}E[\Delta V] > C_{\text{marginal}}{% end %} — with {% katex() %}S{% end %} appearing nowhere in that inequality, because no future decision can recover money or effort already spent. The sunk-cost bias this series just borrowed as an analogy is the empirical, well-documented case of a decision-maker weighting {% katex() %}S{% end %} as though it belonged on the benefit side of that ledger anyway {{ cite(ref="3", title="Arkes, H.R. & Blumer, C. (1985) — The Psychology of Sunk Cost, Organizational Behavior and Human Decision Processes 35, 124–140") }}. A repair loop doesn't make that specific error — it has no ledger at all, and no term for {% katex() %}E[\Delta V]{% end %} on any wave past the first. That's a different, and in a specific sense worse, failure: not miscounting the one number the rational rule depends on, but never computing it.

## Measuring the Ceiling Before Retrying Against It

Theorem 1 says a ceiling exists. It doesn't, by itself, tell a running system where that ceiling sits for the specific task in front of it — that requires a measured, structural estimate computed before the first retry wave, not inferred after several have already failed.

<span id="def-1"></span>

<details>
<summary>Definition 1 -- Structural Task Complexity: a pre-loop estimate combining constraint softness, predicate-type diversity, and their interaction</summary>

**Definition 1** (Structural Task Complexity). Given a constraint corpus with soft-constraint fraction {% katex() %}s{% end %} (the share of constraints that are advisory rather than hard-gated) and predicate-type diversity {% katex() %}d{% end %} (the count of distinct constraint-predicate kinds present, normalized against the total kinds the system recognizes):

{% katex(block=true) %}
TCC_{\text{structural}} = 1 + k_{\text{soft}} \cdot s + k_{\text{type}} \cdot d + k_{\text{cross}} \cdot (s \cdot d)
{% end %}

The cross term captures a specific compounding effect neither {% katex() %}s{% end %} nor {% katex() %}d{% end %} alone predicts: a corpus that is both heavily advisory *and* structurally diverse is harder to satisfy jointly than either property in isolation would suggest, because ambiguity in what's required (high {% katex() %}s{% end %}) compounds with variety in how it's checked (high {% katex() %}d{% end %}) rather than adding to it linearly.

</details>

> **Physical translation.** A task with ten hard, narrowly-typed constraints is more tractable than a task with ten mostly-advisory constraints spanning five different kinds of check, even holding the raw constraint count equal — the second task is genuinely more complex in a way a simple count would miss, and the cross term is what keeps the estimate from missing it.

This estimate isn't a single formula applied uniformly — the actual routing decision blends it with an empirical signal, gathered from a small probe of the pool's own early behavior, whichever of the two indicates higher difficulty, plus a penalty when the two disagree sharply enough to suggest the structural estimate itself is unreliable for this particular task. A pre-loop complexity signal this cheap to compute, run once before the first wave rather than inferred after four exhausted ones, is what turns "we noticed the ceiling after burning the budget" into "we routed around the ceiling before spending it" — the entire practical difference this post has been arguing for, stated as a design invariant rather than an aspiration.

## Where the Cubic Bound Actually Comes From

The theorem's headline number deserves derivation, not just citation. Self-attention, the mechanism every transformer layer runs to let each token weigh every other token, computes a full pairwise attention matrix — for a sequence of length {% katex() %}n{% end %}, that's {% katex() %}O(n^2){% end %} pairwise comparisons, repeated across a fixed number of layers, giving a *single forward pass* an {% katex() %}O(n^2){% end %} computational budget per layer stack. A task genuinely requiring {% katex() %}O(n^3){% end %} or higher-order computation to solve — certain classes of combinatorial optimization, some multi-step constraint-satisfaction proofs, exhaustive case analysis over an unbounded branching factor — has a computation bill that a single bounded forward pass cannot pay, no matter how the input is structured.

Illustrative constants, not measured ones, make the shape of that gap concrete — a per-pass budget growing as {% katex() %}O(n^2){% end %} against a task requirement growing as {% katex() %}O(n^3){% end %} for the same {% katex() %}n{% end %}:

<div style="margin:1.5em 0;">
<canvas id="chart-complexity-ceiling" aria-label="Chart showing two growth curves against task size n. A blue curve, the per-pass compute budget, grows as n squared. A red curve, the computation a cubic-complexity task requires, grows as n cubed. The budget curve is higher for small n, but the two curves cross once, and past that crossing the requirement curve permanently and increasingly exceeds the budget curve, illustrating why a bounded forward pass cannot solve tasks whose complexity is cubic or higher once the task is large enough." style="width:100%; aspect-ratio:700/440; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<script>
(function () {
  const canvas = document.getElementById('chart-complexity-ceiling');
  const ctx = canvas.getContext('2d');
  let W, H, pw, ph, frame = 0;
  const L = 66, R = 40, T = 30, B = 50;
  const totalFrames = 180;
  const nMax = 70;
  const SIM = 200;
  const kBudget = 50;
  const nVals = [], budgetVals = [], reqVals = [];
  for (let i = 0; i <= SIM; i++) {
    const n = (i / SIM) * nMax;
    nVals.push(n);
    budgetVals.push(kBudget * n * n / 1000);
    reqVals.push(n * n * n / 1000);
  }
  const yMax = Math.max(budgetVals[SIM], reqVals[SIM]) * 1.05;
  const px = i => L + (nVals[i] / nMax) * pw;
  const py = v => T + (1 - v / yMax) * ph;
  function setupCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    W = rect.width; H = rect.height;
    pw = W - L - R; ph = H - T - B;
  }
  function drawAxes() {
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    ctx.fillStyle = '#444'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('task size n', L + pw / 2, H - 10);
    ctx.save(); ctx.translate(16, T + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('compute units (thousands)', 0, 0); ctx.restore();
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    for (let n = 0; n <= nMax; n += 10) {
      const x = L + (n / nMax) * pw;
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(x, T + ph); ctx.lineTo(x, T + ph + 5); ctx.stroke();
      ctx.fillText(n, x, T + ph + 18);
    }
    ctx.textAlign = 'right';
    for (let v = 0; v <= yMax; v += 50) {
      const y = py(v);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(L, y); ctx.lineTo(L - 5, y); ctx.stroke();
      ctx.fillText(Math.round(v), L - 8, y + 4);
    }
  }
  function seg(arr, ds, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
    ctx.moveTo(px(0), py(arr[0]));
    for (let i = 1; i <= ds; i++) ctx.lineTo(px(i), py(arr[i]));
    ctx.stroke();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawAxes();
    const progress = Math.min(frame / totalFrames, 1);
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    const ds = Math.max(1, Math.min(Math.floor(ease * SIM), SIM));
    seg(budgetVals, ds, '#2980b9', 2.5);
    seg(reqVals, ds, '#c0392b', 2.5);
    const crossIdx = Math.round((50 / nMax) * SIM);
    if (ds >= crossIdx) {
      ctx.beginPath(); ctx.arc(px(crossIdx), py(budgetVals[crossIdx]), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#444'; ctx.fill();
      ctx.fillStyle = '#444'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('n = 50: requirement overtakes budget, permanently', px(crossIdx), py(budgetVals[crossIdx]) - 12);
    }
    if (progress >= 1) {
      ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillStyle = '#2980b9'; ctx.fillText('budget ~ O(n^2)', px(Math.round(SIM * 0.15)), py(budgetVals[Math.round(SIM * 0.15)]) - 12);
      ctx.fillStyle = '#c0392b'; ctx.fillText('requirement ~ O(n^3)', px(Math.round(SIM * 0.78)), py(reqVals[Math.round(SIM * 0.78)]) - 12);
    }
    if (frame < totalFrames) { frame++; requestAnimationFrame(draw); }
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries, observer) => {
      if (entries[0].isIntersecting) { observer.disconnect(); setupCanvas(); requestAnimationFrame(draw); }
    }, { threshold: 0.2 }).observe(canvas);
  } else { setupCanvas(); requestAnimationFrame(draw); }
  window.addEventListener('resize', () => { if (frame >= totalFrames) { setupCanvas(); draw(); } });
})();
</script>
</div>

Unlike the correlation-proxy curves in the first post of this series, these two never cross back. Below the crossing point a generous quadratic budget comfortably covers the cubic requirement — small tasks are cheap relative to what a pass can pay. Past it, the gap doesn't narrow again; it compounds, because a cubic term asymptotically outruns a quadratic one by definition, not by the specific constants chosen here. Different constants move where the crossing happens, not whether one has to happen.

Chain-of-thought deserves more care here than a passing dismissal, because the easy version of this argument — that longer reasoning traces never change which complexity class is reachable — overstates what complexity theory has actually shown. It doesn't hold up: a transformer restricted to a single pass with no intermediate output is provably confined to a narrow circuit-complexity class, but given a *polynomial* number of chain-of-thought steps, the same architecture can recognize the full class of polynomial-time solvable problems — {% katex() %}O(n^3){% end %} and beyond included {{ cite(ref="4", title="Merrill & Sabharwal (2024) — The Expressive Power of Transformers with Chain of Thought, arXiv:2310.07923") }}. The ceiling this post is built around, stated precisely, isn't "transformers can never reach {% katex() %}O(n^3){% end %} by any means" — that claim would be false. It's a claim about *budget*: a retry loop spending a small, fixed number of waves, each capped at a practical context length, is nowhere near the chain-of-thought length the theory says would actually be required, and no deployed repair loop allocates reasoning length that scales polynomially with a task's own complexity, because nothing in the loop knows that complexity until the structural estimate from the previous section computes it. Decomposition, seen this way, is the practical version of what unbounded chain-of-thought does in principle — both convert one bounded pass into many smaller ones stitched together. The difference is that decomposition targets the added computation deliberately, at the structure the task actually has, instead of hoping an undifferentiated pile of extra tokens happens to land in the right place.

This is the load-bearing distinction between "the model didn't try hard enough" and "the model structurally cannot get there" — and it's exactly the distinction most retry loops, including otherwise well-designed ones with sound repair logic and genuine grounding improvements between waves, don't measure for by default.

## Why the Two Failures Look Identical From Outside

Before this distinction is drawn explicitly, a retry loop treats every exhausted budget the same way, because from the loop's own local vantage point at any single wave boundary, they genuinely are the same event: a wave ends with no passing proposal, the retry budget allotted for the task runs out, try again with better context. That's the right response exactly once — when the task is solvable and the previous attempts failed for lack of grounding. It's the wrong response, repeated at full cost, when the task is structurally beyond the current pass depth, because every retry under that condition produces the same class of failure, not a progressively closer approximation.

<span id="heuristic-1"></span>

<details>
<summary>Working Heuristic 1 -- Distinguishing a Complexity Ceiling From a Quality Ceiling, Mid-Loop</summary>

**Working Heuristic** (Ceiling Discrimination, not a derived or validated result). Three signals are real and independently motivated by the framework's own design: failure-signature entropy (do successive failures cluster around the *same* structural gap, or wander), retry slope (is the verification score trending upward across waves, or flat), and the product {% katex() %}N_{\text{eff}} \times CG_{\text{mean}}{% end %} (does the pool's effective diversity collapse as retries accumulate). The specific combination rule stated here — a calibrated minimum count of the three signals (flat slope, clustered signature, collapsing diversity) crossing their own individual thresholds, short of requiring every one of them at once; an improving slope with wandering signatures indicating a quality ceiling instead — is this post's own proposed reading of how those three signals compose, not a proven discrimination rule. The count itself is a tunable bar, the same kind of calibrated-not-arbitrary quantity the separation threshold earlier in this series turned out to be, not a threshold validated against labeled outcomes. It should carry the evidentiary weight of a reasonable, motivated heuristic, not the weight of Krum's breakdown-point proof or Rice's theorem elsewhere in this series.

</details>

> **Physical translation.** A quality-ceiling task's failures look different from each other, wave to wave, because each retry is genuinely exploring a different part of the problem. A complexity-ceiling task's failures start looking like each other almost immediately, because there's only one place to fail once the task is beyond the pass depth — the same wall, approached from slightly different angles, every time, no matter how much the repair context is varied between attempts.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart TD
    classDef gate fill:none,stroke:#333,stroke-width:2px;
    classDef ok fill:none,stroke:#22c55e,stroke-width:2px;
    classDef alt fill:none,stroke:#ca8a04,stroke-width:2px;
    A[Retry exhausted:<br/>no passing proposal] --> B{Failure signature<br/>clustered + flat slope?}
    B -->|no — wandering, improving| C[Quality ceiling:<br/>better grounding, repair context]:::ok
    B -->|yes — same wall, repeated| D{MUS structure:<br/>isolable unsat subset?}
    D -->|yes| E[MUS oscillation:<br/>parallel cluster-solve + integration]:::alt
    D -->|no| F[Complexity ceiling:<br/>decompose, don't retry whole]:::alt
{% end %}

<figcaption>Figure 1: the routing decision a repair loop needs before spending the rest of its budget — three failure modes, three different corrective actions, one shared surface symptom.</figcaption>

## The Third Ceiling: When the Constraints Themselves Can't All Be Satisfied At Once

Neither the quality ceiling nor the complexity ceiling, on its own, accounts for a distinct third failure shape, the one this post's framework table calls MUS oscillation — named for a concept borrowed from constraint-satisfaction and SAT-solving theory: a minimal unsatisfiable subset, the smallest set of constraints within a larger corpus that cannot all be satisfied simultaneously, regardless of how the rest of the corpus is handled. A repair loop chasing this failure sequentially — fix the constraint currently failing, re-verify, discover a *different* constraint now fails as a side effect of the fix, fix that one, watch the first one break again — oscillates indefinitely, because it's solving a two-constraint conflict one constraint at a time, and every sequential fix to one side of a genuine mutual incompatibility necessarily reopens the other side. A retry budget spent this way looks, from the outside, exactly like slow progress — scores fluctuate, different constraints pass and fail across waves — right up until someone plots the specific pair of violations against each other and notices they've been trading places the entire time.

<span id="def-2"></span>

<details>
<summary>Definition 2 -- MUS Oscillation: sequential repair against a genuinely conflicting constraint pair cannot converge</summary>

**Definition 2** (MUS Oscillation). Let constraints {% katex() %}A{% end %} and {% katex() %}B{% end %} form a minimal unsatisfiable subset — no assignment satisfies both simultaneously, and neither constraint alone is unsatisfiable. A sequential repair process that revises a proposal to satisfy whichever constraint most recently failed, without considering the pair jointly, produces an infinite oscillation: satisfying {% katex() %}A{% end %} at wave {% katex() %}k{% end %} necessarily leaves {% katex() %}B{% end %} unsatisfied, satisfying {% katex() %}B{% end %} at wave {% katex() %}k+1{% end %} necessarily reopens {% katex() %}A{% end %}, with no fixed point reachable through this update rule regardless of how many waves the retry budget allows.

</details>

> **Physical translation.** Two doors, on opposite ends of a room, each needs to be closed for the room to be considered secure — but closing one always requires walking through the other, which reopens it. A repair process that closes whichever door was open last, one at a time, will pace back and forth between them forever, and adding more time to pace does not change the outcome. The fix isn't more pacing. It's noticing the two doors are connected and solving for both positions jointly, in a single pass across both.

The corrective mechanism this failure shape needs is structurally different from the other two: not more grounding (the quality-ceiling fix), not decomposition into smaller independent subtasks (the complexity-ceiling fix), but a parallel cluster-solve — identify which constraints form the mutually conflicting cluster, solve for a joint assignment across the whole cluster at once rather than one constraint at a time, then run an integration pass reconciling that joint solution with the rest of the corpus. Sequential repair, however many waves it's given and however sophisticated the repair context supplied on each one, is structurally the wrong shape of algorithm for this failure — it's applying a technique built for independent, one-at-a-time constraint violations to a pair of constraints whose violations aren't independent at all.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart TD
    classDef gate fill:none,stroke:#333,stroke-width:2px;
    classDef bad fill:none,stroke:#dc2626,stroke-width:2px,stroke-dasharray:4 4;
    classDef ok fill:none,stroke:#22c55e,stroke-width:2px;
    A["Wave k: fix A, B breaks"] --> B["Wave k+1: fix B, A breaks"]
    B -.->|sequential repair, no fixed point| A
    A -.-> C{"Detected: MUS<br/>isolation evidence?"}:::gate
    C -->|yes| D["Cluster A,B jointly<br/>solve as one problem"]:::ok
    D --> E["Integration pass:<br/>reconcile with rest of corpus"]:::ok
{% end %}

<figcaption>Figure 2: MUS oscillation, and the exit from it. Sequential repair (top loop, dashed) never converges by construction — the fix is recognizing the loop and solving jointly, not adding more waves to the same sequential pattern.</figcaption>

## What the Verifier Owes This Same Bound

The theorem's second half is easy to under-weight: a verifier checking a solution pays the same computational bill as a model producing one. For a task where *verifying* correctness requires reasoning of comparable depth to generating it — checking a distributed-systems liveness proof under partial synchrony is the canonical case — the verifier's own scores become unreliable in exactly the way the theorem predicts, and that unreliability is structurally indistinguishable from ordinary verifier noise unless it's specifically named. A verifier returning a confident 0.0 with a sophisticated, multi-paragraph explanation on a task's hardest instances is consistent with a verifier that understands the domain and still cannot produce a reliable verdict on the specific claim — not with a verifier that's simply miscalibrated in the ordinary sense. The distinction matters operationally, not just semantically: ordinary miscalibration is fixable by recalibrating against more observations of the same task class. A structural verification ceiling is not fixable that way at all — collecting more observations of tasks the verifier cannot reliably check just produces a larger, equally unreliable sample, and no amount of recalibration against unreliable ground truth recovers a signal that was never there to calibrate against in the first place. This is the same shape of failure Post 1 opened the series with, one signal over: a vote count was supposed to mean more independent confirmation, until correlation broke that link invisibly; a confidence score is supposed to mean calibrated accuracy, until a complexity ceiling breaks that link the same way — and neither breakdown announces itself in the number a dashboard actually shows.

## When the Verifier Itself Needs to Decompose the Question

The consequence of the verifier sharing the generator's computational ceiling isn't only "the verifier's scores become unreliable" — it also implies a specific, testable fix: if a single verification call can't reliably check a claim requiring {% katex() %}O(n^3){% end %}-class reasoning, decompose the *verification* the same way a well-designed generation pipeline decomposes the *generation*. A claim rated at or above a measured complexity threshold gets an explicit instruction appended to the verifier's own prompt before the first wave runs — decompose the claim into sub-claims, verify each sub-claim's reasoning depth independently, and surface any sub-claim whose required reasoning exceeds what a single verification pass can reliably check as its own distinct signal, rather than folding an unreliable partial verdict into one aggregate score that looks as confident as every other check on the page.

That signal — a sub-claim explicitly marked as exceeding the verifier's own reliable reasoning budget — is different in kind from an ordinary failed check. An ordinary failed check says "this claim is false." A budget-exceeded sub-claim says "no verdict here can be trusted regardless of which way it leans," and treating the two as interchangeable is precisely the error this whole post's failure taxonomy exists to prevent one layer up, applied recursively to the layer that's supposed to be catching the original error.

This is the same discipline the previous post in this series argued for at the level of a single check's evidence — collapsing "verified false" and "no reliable method exists to verify this" into one signal destroys exactly the information a repair loop needs to route correctly. Here it recurs one level up the stack: a verifier's own aggregate score, produced without this decomposition, is silently mixing "this sub-claim is genuinely wrong" with "this sub-claim exceeds what I can reliably check" into a single number that looks the same regardless of which is actually true underneath it.

## Calibration Drift as a Symptom, Not Just a Cause

A separate diagnostic, unrelated on its face to task complexity, turns out to be entangled with it in a way that needs naming explicitly. A calibration-drift detector watches whether a system's stated confidence continues to track its actual accuracy over time, flagging a changepoint when the two diverge. The standard interpretation of a fired drift alert is distributional shift — the input population has changed, and the model's calibration, tuned against an earlier distribution, no longer applies.

There's a second, harder-to-distinguish explanation the standard interpretation misses, and the reason the two are so easily confused deserves stating rather than just asserted: both a genuine distributional shift and a population of tasks pressing against a computational ceiling manifest as the same underlying symptom — stated confidence decoupling from actual accuracy over a tracked window of observations. A drift detector is, by design, agnostic to *why* the decoupling happened; it only measures that it did. That agnosticism is a reasonable design choice for a general-purpose detector, and it means the detector alone cannot carry the full diagnostic weight this failure mode needs — a population of tasks pressed against the complexity ceiling from Theorem 1 produces exactly the same statistical signature as genuine distributional shift. A model reasoning about a task beyond its computational budget doesn't necessarily produce confidence scores that track its (poor) actual accuracy on that task — its confidence tokens can be statistically decoupled from correctness precisely because the failure is structural, not a matter of the model being uncertain in the ordinary, well-calibrated sense. Observed jointly — a suspiciously low pass rate on a task class *and* a fired calibration-drift changepoint on the same class, at the same time — is consistent with either genuine distributional shift or a population of tasks that have quietly crossed the complexity ceiling, and a drift detector built to answer "has the input distribution changed" cannot, on its own, distinguish the two causes. A complexity-estimated task-difficulty score, computed independently and cross-referenced against the drift signal, is what would disambiguate them — high estimated complexity on the same tasks driving the drift alert points at the ceiling explanation; low estimated complexity pointing at genuine distributional shift instead.

## Framework in Practice — A Liveness Proof That Should Have Been Decomposed

The scenario below is a worked illustration, built to make the discrimination test legible against a concrete case rather than left as pure abstraction. A liveness-proof task, of this general shape, exhausts its full retry budget and produces effectively zero usable proof content on every attempt — not a partial derivation slowly improving wave over wave, but a near-total absence of progress repeated across the whole budget. The specific diagnostic readings walked through below — signature clustering, retry slope, diversity collapse, measured precisely against this post's discrimination test — show how that outcome would read under the framework just derived.

A committee is asked to design a Byzantine fault-tolerant consensus protocol and prove three properties jointly: safety under equivocation, a liveness bound under partial synchrony, and a leader-replacement mechanism terminating in a specific bounded number of rounds — a compound proof obligation, not a single derivation. The run exhausts its full retry budget, each attempt starting fresh from a slightly different angle and arriving at the same wall regardless. Read through this post's discrimination signals as a worked illustration: a failure signature tightly clustered across all four attempts, each stalling at approximately the same point in the liveness argument; a verification score showing no meaningful upward trend across waves; the pool's effective diversity, measured independently of the score, collapsing as retries accumulate — different explorers, different temperatures, converging on the same incomplete shape of failure. That's the complexity-ceiling signature, not the quality-ceiling one, and it illustrates what it would mean for every one of the four retry waves to have been spent re-attempting a derivation whose required reasoning depth exceeded what a single pass, however well-grounded, could supply.

The honest diagnosis, absent a ground-truth oracle for a task this hard, is genuinely underdetermined between two explanations — a complexity-ceiling failure, or a severe grounding failure that happens to produce an identical signature — and the task's correct terminal state reflects that uncertainty rather than resolving it artificially: escalation to a human reviewer, with the accumulated failure signature attached as diagnostic context, rather than a fifth automated retry burning budget against a wall the first four attempts already mapped the shape of. That escalation decision is itself a measured one, not a shrug — the same failure-signature clustering, retry-slope, and diversity-collapse signals that identified the ceiling in the first place are exactly the artifact a human reviewer needs to pick up the diagnosis where the automated loop correctly stopped, rather than starting the investigation from nothing. With complexity routing wired in ahead of time, rather than diagnosed only after the fact, the same task profile — a compound proof obligation, high estimated structural complexity — would have triggered decomposition or the same human-escalation path before the retry budget was spent at all, which is the entire practical argument this post has been building toward: the diagnosis is cheap and fast once you know what to measure; the retry budget spent without it is not, and the four exhausted waves in this scenario are the concrete price of not measuring it first.

## Where This Sits Against "More Test-Time Compute Always Helps"

A broader industry narrative treats additional inference-time computation — longer chains of thought, more retries, larger committees — as a roughly monotonic lever: more compute spent at inference time reliably buys more capability, the same way more pretraining compute reliably bought more capability across the previous scaling era. This post's argument is a specific, bounded qualification of that narrative rather than a rejection of it, and the qualification is about *how* the compute is added, not a claim that no amount of it could ever help — the complexity-theory result cited earlier says the opposite is possible in principle, given chain-of-thought that scales with the problem's own size. The gap is that "more test-time compute" in ordinary practice means a roughly fixed increment — a longer trace, one more retry wave, a bigger committee — not reasoning length deliberately scaled to a measured task complexity the loop doesn't otherwise know. Additional undifferentiated compute helps precisely up to the point where the task's required computation crosses what the available architecture, at whatever per-pass budget it operates under, can pay — and past that point, the relationship between more compute and more capability doesn't degrade gracefully, it flattens into genuine zero marginal return, indistinguishable from the outside from a task that's merely difficult rather than genuinely, structurally unreachable at the undifferentiated compute on offer.

That distinction matters for exactly the reason this whole series has returned to repeatedly: a monotonic-return assumption and a bounded-return-then-flat assumption produce identical advice for the easy majority of tasks — add more compute, it helps — and opposite advice for the specific minority of tasks sitting past the ceiling, where the monotonic assumption says "add more" and the bounded assumption says "stop, decompose." Getting that minority wrong at scale, across a fleet of tasks rather than one, is where an undiagnosed ceiling turns from an individual task's wasted retry budget into a systematic, compounding cost that nobody notices until someone actually measures the failure-signature clustering this post has described directly, task class by task class.

## The Retry Budget as an Economic Decision, Not Just an Engineering One

Every failure mode this post has named shares a common consequence, stated in the vocabulary the whole series opened with: an undiagnosed ceiling is not a quality problem, it's a cost problem wearing a quality problem's clothing. A four-wave retry budget spent entirely against a complexity ceiling is four waves of full generation, full verification, and full synthesis cost, purchasing zero marginal progress toward a passing output — the exact opposite of the balance this series has argued for throughout, where every additional unit of computation is supposed to be justified by a measured gain, not spent on faith that more of the same will eventually get there.

The correct operational posture, stated plainly rather than left implicit: a repair loop's retry budget is not a single resource to be spent uniformly across every failure. It's three different resources, spent on three different corrective actions, and misallocating budget meant for decomposition into more grounding attempts — or budget meant for a parallel cluster-solve into more sequential single-constraint patches — is a waste with a specific, computable cost attached, not a vague inefficiency. A team that measures failure-signature entropy and retry slope before committing the remaining budget is making an economic decision with the same rigor this series applied to ensemble sizing in its opening post — how many more units of computation does the next retry actually buy, given what's already been observed, rather than an article of faith that persistence alone eventually pays off.

## What This Series Has Not Shown: Four Guarantees Failing At Once

Each post in this series held three of the four borrowed guarantees fixed while examining the one it failed to transfer — Post 1's worked example used a correlated pool but didn't ask whether its verifier was also same-family-biased; Post 2's worked examples held the constraint corpus's coverage as given while examining judge bias; Post 3 held aggregation and complexity constant while examining verification epistemics; this post held the other three constant while examining the complexity ceiling in isolation. That's a defensible way to make each mechanism legible on its own terms, and it leaves a real question unanswered: a pool that is simultaneously correlated, judged by a same-family verifier, evaluated against a compound claim, and pressed near its complexity ceiling is not obviously the sum of four independent, additive risks. It's plausibly a worse, and possibly nonlinearly worse, failure mode than any single post's treatment predicts — correlated agents pressed against a ceiling may fail in a *more* clustered way than either factor alone, and a same-family verifier checking a compound claim near that same ceiling has less independent signal to catch it with than this series' separate treatments of bias and coverage each assumed. Nothing in these four posts measures that interaction, and saying so plainly is more useful than letting four separate, individually-honest treatments imply a completeness they don't have.

> **Cognitive Map.** A single forward pass has a computational ceiling, proved rather than assumed (Sikka & Sikka), derived from the {% katex() %}O(n^2){% end %} cost of self-attention meeting an {% katex() %}O(n^3){% end %}-or-higher task requirement, and the ceiling applies equally to the model generating a claim and the model verifying it — a verifier facing the identical budget can produce confident, unreliable verdicts on exactly the hardest instances of a task class, indistinguishable from ordinary miscalibration unless specifically checked for. Three failure modes, not two, exhaust a retry budget from the outside identically: solvable-but-ungrounded, beyond-this-pass-depth, and a genuine minimal unsatisfiable subset that sequential single-constraint repair cannot converge against no matter how many waves it's given, because it's the wrong shape of algorithm for a jointly-conflicting pair. Only measuring across waves, not within one, separates the three: signature clustering, retry slope, effective-diversity collapse for the second — a working heuristic proposed here, not a validated rule — and a specific, isolable pair of oscillating constraint violations for the third. A calibration-drift alert and a complexity ceiling can produce the identical statistical signature, and a drift detector alone cannot tell them apart — a complexity estimate, cross-referenced against the same alert, is what disambiguates. Getting any of these three diagnoses wrong doesn't just waste the retry budget — it burns exactly the resource that should have gone to decomposition, cluster-solving, or escalation instead, at a real, computable cost. This closes the series' fourth borrowed guarantee: that enough iteration eventually solves a task. It doesn't, once the task's required computation exceeds what any single pass in the loop can pay, and the honest response is recognizing the wall, not retrying against it — and the four walls this series found are not yet known to compose safely when a real system hits more than one at the same time.

**Compute it.** Pull the failure signatures from your own exhausted retry loops, wave by wave, before writing off the run as a simple failure to converge. If the same structural gap reappears wave after wave with a flat or declining score trend, that's a complexity-ceiling signature — the fix is decomposing the task into smaller, independently-solvable pieces, not authoring yet another better-worded prompt for the next identical, doomed attempt. If instead two specific constraints keep trading places — satisfying one visibly and reliably reopens the other, wave after wave, in a pattern that's easy to spot once you're actually looking for it — that's a MUS oscillation, and no amount of additional single-constraint patching will ever converge; the fix is solving both jointly, in the same pass, not sequentially, one at a time, forever. Neither diagnosis takes longer to compute than a single wasted retry costs — which is the whole argument for measuring before spending the next one.

## Epilogue: The Cost of the Hot Path

The four posts in this series treat multi-agent orchestration purely as a theoretical problem. The bounds described here — the independence illusion, the familiarity bias, the discursive dilemma, the {% katex() %}O(n^3){% end %} complexity ceiling — apply equally to any pipeline, regardless of the language it is written in or how it is deployed. The math does not care about your tech stack.

But applying the fixes introduces a brutal operational reality — for some of them, not all of them equally.

Rubric withholding and locus-and-mechanism classification are architecture and prompting discipline: what goes in which context, how a claim gets tagged before it's checked. Any pipeline can adopt both without touching its execution model. Computing eigenvalue participation ratios across cosine kernels, maintaining geometrically decaying violation feedback across waves, and evaluating structural task complexity before every routing decision are a different category entirely — those computations must sit on the hot path, on every wave, for every task. If a control plane has to measure before it commits compute, that measurement only works if it is nearly free. Otherwise, you have simply moved the latency from retrying blindly to calibrating slowly.

This is where portable theory gives way to systems engineering. An architecture requiring this level of continuous, per-wave observability stops being viable as a lightweight scripting layer once the measurement itself has to happen on every check. It demands an execution environment where the overhead of maintaining these abstractions is genuinely negligible relative to the network cost of the model call itself. It requires infrastructure built to carry that load reliably, without the framework's own footprint drowning out the efficiency gains of the routing logic it provides.

That's also the argument for measuring before gating. Every calibrated quantity this series has named — a separation threshold, a complexity coefficient, a supermajority fraction — is held to the same standard: it only earns the authority to route on its own once it's been checked against real outcomes, not asserted because it looked reasonable at design time. This post's own ceiling-discrimination heuristic hasn't cleared that bar yet, and says so directly rather than borrowing a confidence it hasn't earned — which is exactly the discipline shadow mode applies one level up, to the routing logic as a whole: run it in parallel before letting it decide anything, and only let it gate behavior once it's been validated against outcomes it didn't have a hand in producing.

The theory is universal. The implementation required to actually survive running it at scale is not.

---
<sup>[1]</sup> Sikka, V. & Sikka, V. (2025). *Hallucination Stations: On Some Basic Limitations of Transformer-Based Language Models.* arXiv:2507.07505.

<sup>[2]</sup> Staw, B. M. (1976). *Knee-Deep in the Big Muddy: A Study of Escalating Commitment to a Chosen Course of Action.* Organizational Behavior and Human Performance, 16(1), 27–44.

<sup>[3]</sup> Arkes, H. R. & Blumer, C. (1985). *The Psychology of Sunk Cost.* Organizational Behavior and Human Decision Processes, 35(1), 124–140.

<sup>[4]</sup> Merrill, W. & Sabharwal, A. (2024). *The Expressive Power of Transformers with Chain of Thought.* ICLR 2024 / arXiv:2310.07923.
