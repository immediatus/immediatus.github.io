+++
authors = ["Yuriy Polyulya"]
title = "The Independence Illusion"
description = "More voters should mean more truth — that's the promise behind the jury theorem, Byzantine fault tolerance, and the scalability law alike. All three need the voters to disagree, when they're wrong, for genuinely different reasons. Stochastic agents pulled from overlapping training data don't fail that way: they agree, confidently, for the same reason, and a headcount can't tell independent judgment from an echo. Opening Theorems Out of Warranty."
date = 2026-07-08
slug = "borrowed-guarantees-part1-independence"
draft = false

[taxonomies]
tags = ["distributed-systems", "ai", "multi-agent", "formal-methods"]
series = ["borrowed-guarantees"]

[extra]
toc = false
series_order = 1
series_title = "Theorems Out of Warranty"
series_description = "Every multi-agent verification design runs on a theorem borrowed from somewhere else — the Condorcet Jury Theorem, Byzantine fault tolerance, the Universal Scalability Law, computational complexity bounds. Each one shipped with a warranty: conditions the proof depends on, fine print nobody reads until something breaks. Stochastic LLM committees operate outside several of those conditions by default, and a guarantee doesn't fail loudly when it lapses — it just quietly stops covering what it was never proven to cover. This series finds exactly where coverage runs out, and builds what replaces it."
+++

Five proposals reached a merge step. Two had passed every binary check the constraint corpus specified. Three had failed at least one. The merge step could not tell them apart — the verification score had been stripped out three phases earlier, before any of the five ever reached synthesis. A failing proposal's language sat in the same context window as a passing one, carrying the same implicit authority, because nothing marked which was which.

*Five voices spoke. How many of them had actually earned a vote?*

The synthesis prompt never asked. It treated five outputs as five independent judgments, when only some of the five had passed anything at all. That's the independence illusion: five voices that sound like corroboration, and are actually one voice, played five times.

That is not a bug in the ordinary sense — no line of code disagreed with its own specification. It is what happens when a system inherits a theorem's conclusion without inheriting the assumption the conclusion depends on. Three theorems, in this case, borrowed from three different fields, each carrying one clause that a committee of LLM agents does not automatically satisfy.

## Framework Overview

| Borrowed result | What it assumes | What breaks for LLM committees |
| :--- | :--- | :--- |
| **Condorcet Jury Theorem** | Voters reason independently | Shared pretraining collapses independence between agents |
| **Byzantine fault tolerance (Krum)** | A corrupted minority chosen adversarially | LLMs converge honestly on the same wrong answer — no adversary required |
| **Universal Scalability Law** | One coherency cost means the same thing across the pool | A single scalar cannot distinguish a homogeneous pool from a genuinely diverse one |

Each row is a theorem doing real work elsewhere, transplanted into a domain that doesn't automatically satisfy the clause the proof depends on. None of the three theorems is wrong in its own domain — Condorcet's result holds for genuinely independent voters, Krum's proof holds against a genuinely adversarial minority, USL's model holds when one coherency number genuinely means one thing across a pool. The failure is entirely on the transplant side, in assuming the clause carried over along with the conclusion. The rest of this post follows each transplant to where it stops holding, then follows the consequence downstream to a traceable failure mode: a merge step that doesn't know which proposals to trust.

---

## Three Assumptions, Traced to Where They Stop Holding

<span id="def-1"></span>

<details>
<summary>Definition 1 -- Independent Testimony: what the Condorcet Jury Theorem requires of its voters</summary>

**Definition 1** (Independent Testimony). A set of {% katex() %}N{% end %} judgments is independent under the Condorcet Jury Theorem if each judgment's probability of being correct, {% katex() %}p{% end %}, is drawn without conditioning on any other judgment in the set, and each judgment exceeds chance: {% katex() %}p > 0.5{% end %}. Take {% katex() %}N{% end %} odd, the standard Condorcet setting, since an even-sized pool admits an exact tie that "strict majority" doesn't resolve. Under independence, the probability that a strict majority is correct,

{% katex(block=true) %}
Q_{\text{ind}}(N, p) = \sum_{k=(N+1)/2}^{N} \binom{N}{k} p^k (1-p)^{N-k}
{% end %}

increases toward 1 as {% katex() %}N{% end %} grows. Every pool this post measures against is five explorers — already odd — so the restriction costs nothing in practice.

</details>

> **Physical translation.** Condorcet's theorem is why a jury of twelve outperforms a jury of one, provided the twelve actually thought about the case separately. If eleven of them read the same headline before walking into the room, you don't have twelve votes — you have one vote and eleven echoes.

This isn't a failure mode invented for AI committees. The same collapse has been produced experimentally in human groups: let people estimate an unknown quantity, then show each person the running estimates of others in the group before they revise their own guess, and the group's estimates converge sharply — while each individual, having just incorporated what looks like independent confirmation, grows *more* confident in a number that is now less diverse, not more accurate {{ cite(ref="1", title="Lorenz, Rauhut, Schweitzer & Helbing (2011) — How Social Influence Can Undermine the Wisdom of Crowd Effect, PNAS 108(22), 9020–9025") }}. The mechanism this post spends the rest of its length on — correlated judgments mistaken for independent ones — has a name in the social-choice and collective-intelligence literature that predates large language models by decades. The pool doesn't need to be silicon for the illusion to hold.

That mechanism also has an exact, decades-older mathematical form in ensemble learning, not just a qualitative description. For predictors {% katex() %}f_1, \ldots, f_N{% end %} averaged into an ensemble estimate {% katex() %}\bar f{% end %}, the ensemble's squared error decomposes exactly as the average member's own error minus a diversity term measuring how much the members actually disagree with each other,
{% katex(block=true) %}E_{\text{ensemble}} = \frac{1}{N}\sum_i E_i \;-\; \frac{1}{N}\sum_i (f_i - \bar f)^2{% end %}
an identity that holds regardless of what's causing the disagreement or its absence {{ cite(ref="2", title="Krogh & Vedelsby (1995) — Neural Network Ensembles, Cross Validation, and Active Learning, NeurIPS 7, 231–238") }}. It says precisely what a merge step blind to verification scores can't see: an ensemble's improvement over its average member is capped exactly by that diversity term, and as correlation between members climbs, the diversity term collapses toward zero — at which point the ensemble's error equals the average member's error, no better, however many members are pooled. Five agents converging on one answer aren't a five-times-checked answer. Mathematically, they're a one-times-checked answer with four free-riders attached.

Lin, Hilton and Evans' and others' work on LLM behavior converges on the same finding from a different angle Lefort et al. make directly: LLMs trained on overlapping corpora — Common Crawl, Wikipedia, the same handful of code repositories — inherit correlated failure modes, not independent ones {{ cite(ref="3", title="Lefort, Benhamou, Ohana, Guez, Saltiel & Jacquot (2024) — Examining Independence in Ensemble Sentiment Analysis: A Study on the Limits of Large Language Models Using the Condorcet Jury Theorem") }}. Five model calls on the same question are five draws from one shared prior, not five independent judgments — and the theorem's guarantee was never conditioned on the *number* of voters alone. It was conditioned on their independence, which is the clause that silently stops holding.

<span id="def-2"></span>

<details>
<summary>Definition 2 -- Correlation-corrected quality: this post's own interpolation for what the theorem's guarantee degrades to under shared priors</summary>

**Definition 2** (Correlation-Corrected Quality, an interpolation built for this post, not transcribed from a cited source). Given pairwise error correlation {% katex() %}\rho{% end %}, a quality function constructed to match the two limits the correlation literature does establish — full independence and total correlation — is

{% katex(block=true) %}
Q(N, p, \rho) = p + \bigl(Q_{\text{ind}}(N, p) - p\bigr)(1 - \rho)
{% end %}

At {% katex() %}\rho = 0{% end %}, {% katex() %}Q{% end %} recovers the independent-voter guarantee. At {% katex() %}\rho \to 1{% end %}, {% katex() %}Q \to p{% end %} — adding voters buys nothing, regardless of {% katex() %}N{% end %}.

</details>

> **Physical translation.** The correction doesn't say the theorem is wrong. It says the theorem's benefit is being *taxed* by however correlated the voters actually are, and the tax rate is not something you get to assume — it's something you have to measure, per pool, per task.

The second borrowed result carries a different clause. Krum's breakdown-point proof {{ cite(ref="4", title="Blanchard, El Mhamdi, Guerraoui & Stainer (2017) — Byzantine-Tolerant Machine Learning") }} guarantees that the algorithm selects an honest value provided the corrupted minority's divergence is *adversarially chosen* — a Byzantine actor picking the worst-case position to poison the aggregate. Nothing in that proof requires the corrupted values to be honest, correlated, and confident. When they are — five agents converging on the same wrong answer because it's the best-attested answer in a shared training distribution, not because anyone chose to attack — the corrupted set stops looking like an outlier and starts looking exactly like the cluster the algorithm was built to trust. That gap is a property of the proof's own stated scope, not a separate empirical claim needing its own citation: Krum's guarantee is proven against an *adversarial* minority, and a majority that is honestly, confidently wrong for shared structural reasons is a different failure entirely — one the theorem was never asked to cover. Separately, recent work building formal consensus protocols specifically for stochastic reasoning agents is its own acknowledgment of a related gap — that ad-hoc coordination heuristics designed for deterministic distributed systems don't transfer cleanly to agents whose outputs are draws from a shared model rather than independently executed code, and need new formal treatment rather than a relabeling of old guarantees {{ cite(ref="5", title="Ruan, Wang, Shi & Li (2025) — Reaching Agreement Among Reasoning LLM Agents, arXiv:2512.20184") }}.

The third assumption is the quietest of the three, and the easiest to miss. The Universal Scalability Law's coherency term, {% katex() %}\beta{% end %}, is a single scalar standing in for "how expensive it is for this pool to reconcile disagreement." A pool of five agents from five distinct architectures and a pool of five identical model calls at different temperatures can report the *same* {% katex() %}\beta{% end %}, measured the *same* way, while meaning completely different things — one pool's disagreement reflects genuine diversity of approach; the other's reflects nothing but sampling noise around a single underlying answer. A single coherency parameter cannot see that distinction; work on agent scaling in multi-agent LLM systems finds diversity, not raw agent count, is the variable that actually predicts scaling behavior — a single homogeneity-blind coefficient misses the variable that matters {{ cite(ref="6", title="Yang, Qu, Wen, Shi, Wen, Zhang, Wierman & Gu (2026) — Understanding Agent Scaling in LLM-Based Multi-Agent Systems via Diversity, arXiv:2602.03794") }}.

## The Worked Number, Not Just the Formula — Computed, Not Asserted

Definitions earn their keep when the two candidate formulas are actually traced through on realistic input, not just contrasted in principle. Take a pool with measured constraint agreement {% katex() %}CG_{\text{mean}} = 0.70{% end %}, giving accuracy proxy {% katex() %}p = 0.5 + CG/2 = 0.85{% end %}, and follow both readings of {% katex() %}\rho{% end %} through the same formula to two different destinations:

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart TD
    classDef gate fill:none,stroke:#333,stroke-width:2px;
    classDef ok fill:none,stroke:#22c55e,stroke-width:2px;
    classDef alt fill:none,stroke:#ca8a04,stroke-width:2px;
    A["Q_ind(N=5, p=0.85)<br/>binomial majority sum"] --> B["ρ = CG = 0.70"]:::gate
    A --> C["ρ = 1 − CG = 0.30"]:::gate
    B --> D["Q(5, 0.85, 0.70) = 0.887"]:::ok
    C --> E["Q(5, 0.85, 0.30) = 0.936"]:::alt
    D --> F["ratio = CG / (1 − CG)"]
    E --> F
{% end %}

<figcaption>Figure 1: the same formula, evaluated at two defensible readings of the same measured quantity, landing on two different marginal-gain estimates.</figcaption>

Traced through rather than merely described, the two readings give {% katex() %}Q = 0.887{% end %} at {% katex() %}\rho = CG = 0.70{% end %} and {% katex() %}Q = 0.936{% end %} at {% katex() %}\rho = 1 - CG = 0.30{% end %}. Both sit above the baseline {% katex() %}p = 0.85{% end %} — at this specific input, neither formula flips a "trust the ensemble or don't" decision, which is a narrower and more honest claim than the divergence first appears to support. What the two numbers actually disagree on is *magnitude*: {% katex() %}Q - p{% end %} is {% katex() %}+0.037{% end %} under one reading and {% katex() %}+0.086{% end %} under the other — a factor of roughly 2.33 apart on the exact marginal-gain quantity {% katex() %}N_{\text{optimal}}{% end %} is computed from. That ratio isn't a coincidence of this particular input: because {% katex() %}Q_{\text{ind}}(N,p) - p{% end %} is a shared factor in both numerator and denominator, it cancels exactly, leaving {% katex() %}[Q(N,p,1-CG) - p] / [Q(N,p,CG) - p] = CG / (1 - CG){% end %} for any {% katex() %}N{% end %} and {% katex() %}p{% end %} — a closed form, not an empirical observation. Swept across {% katex() %}CG{% end %}, the two formulas coincide exactly at {% katex() %}CG = 0.5{% end %} (where that ratio is 1, and {% katex() %}CG = 1 - CG{% end %} is also an algebraic necessity there) and pull apart on either side; at {% katex() %}CG = 0.8{% end %} the ratio is {% katex() %}0.8 / 0.2 = 4{% end %} exactly, matching the marginal-gain estimates of {% katex() %}+0.018{% end %} versus {% katex() %}+0.073{% end %}. The consequence isn't binary — it's the input to a downstream optimization that assumes it has one clean number, when the framework itself carries two live candidates whose disagreement grows without bound as {% katex() %}CG{% end %} moves away from {% katex() %}0.5{% end %} in either direction.

<span id="def-3"></span>

<details>
<summary>Definition 3 -- The Correlation-Proxy Inversion Problem: two derivations, divergent marginal-gain predictions from the same measured quantity</summary>

**Definition 3** (Correlation-Proxy Inversion). Given mean constraint agreement {% katex() %}CG_{\text{mean}}{% end %} across a pool, two derivations of the correlation proxy {% katex() %}\rho{% end %} are each defensible without further assumptions:

{% katex(block=true) %}
\rho = 1 - CG_{\text{mean}} \qquad \text{or} \qquad \rho = CG_{\text{mean}}
{% end %}

The first reads low agreement as high correlation — a pool that disagrees on constraints is treated as more likely to share a correlated error. The second reads low agreement as low correlation, following directly from Hamming-distance geometry: two profiles far apart in Hamming space are, definitionally, less correlated. Neither is derivable from first principles without an additional, currently unstated assumption about whether error correlation tracks constraint-satisfaction specialization or constraint-satisfaction disagreement, and the two produce materially different {% katex() %}N_{\text{optimal}}{% end %} marginal-gain estimates rather than materially different pass/fail verdicts.

</details>

> **Physical translation.** This isn't a rounding disagreement over a decimal place in a formula everyone already agrees on. It's a disagreement about which *direction* the same measurement points, and it shows up specifically in how much a marginal agent is worth, not in whether the pool clears some baseline. A pool that scores {% katex() %}CG_{\text{mean}} = 0.70{% end %} is worth a fifth voter under either formula — the two formulas disagree by more than a factor of two on *how much* that fifth voter is worth, which is exactly the number an ensemble-sizing decision needs to be precise about and exactly the number this ambiguity corrupts.

Swept across the full range of {% katex() %}CG{% end %} rather than checked at one input, the shape of the disagreement shows up clearly:

<div style="margin:1.5em 0;">
<canvas id="chart-correlation-proxy" aria-label="Chart showing two candidate readings of Q as a function of measured constraint agreement CG. The rho equals CG curve and the rho equals one minus CG curve both start at Q equals 0.5 when CG is 0, bow apart with the rho equals CG curve higher until they cross exactly at CG equals 0.5, then swap dominance and bow apart the other way before converging again near CG equals 1. A dashed line shows the baseline accuracy p for reference." style="width:100%; aspect-ratio:700/440; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<script>
(function () {
  const canvas = document.getElementById('chart-correlation-proxy');
  const ctx = canvas.getContext('2d');
  let W, H, pw, ph, frame = 0;
  const L = 60, R = 40, T = 30, B = 50;
  const totalFrames = 180;
  const SIM = 200;
  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
  }
  function qInd(n, p) {
    let s = 0;
    for (let k = Math.floor(n / 2) + 1; k <= n; k++) s += comb(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
    return s;
  }
  function qCondorcet(n, p, rho) { return p + (qInd(n, p) - p) * (1 - rho); }
  const N = 5;
  const cgVals = [], pVals = [], qA = [], qB = [];
  for (let i = 0; i <= SIM; i++) {
    const cg = i / SIM;
    const p = 0.5 + cg / 2;
    cgVals.push(cg);
    pVals.push(p);
    qA.push(qCondorcet(N, p, cg));
    qB.push(qCondorcet(N, p, 1 - cg));
  }
  const yMin = 0.45, yMax = 1.0;
  const px = i => L + (cgVals[i]) * pw;
  const py = v => T + (1 - (v - yMin) / (yMax - yMin)) * ph;
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
    ctx.fillText('measured constraint agreement CG', L + pw / 2, H - 10);
    ctx.save(); ctx.translate(16, T + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Q(N, p, rho)', 0, 0); ctx.restore();
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    for (let t = 0; t <= 10; t += 2) {
      const cg = t / 10;
      const x = L + cg * pw;
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(x, T + ph); ctx.lineTo(x, T + ph + 5); ctx.stroke();
      ctx.fillText(cg.toFixed(1), x, T + ph + 18);
    }
    ctx.textAlign = 'right';
    for (let v = 0.5; v <= 1.0001; v += 0.1) {
      const y = py(v);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(L, y); ctx.lineTo(L - 5, y); ctx.stroke();
      ctx.fillText(v.toFixed(1), L - 8, y + 4);
    }
  }
  function seg(arr, ds, color, lw, dashed) {
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
    ctx.moveTo(px(0), py(arr[0]));
    for (let i = 1; i <= ds; i++) ctx.lineTo(px(i), py(arr[i]));
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawAxes();
    const progress = Math.min(frame / totalFrames, 1);
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    const ds = Math.max(1, Math.min(Math.floor(ease * SIM), SIM));
    seg(pVals, ds, '#999', 1.2, true);
    seg(qA, ds, '#2980b9', 2.5, false);
    seg(qB, ds, '#c0392b', 2.5, false);
    const midIdx = Math.round(SIM / 2);
    if (ds >= midIdx) {
      ctx.beginPath(); ctx.arc(px(midIdx), py(qA[midIdx]), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#444'; ctx.fill();
      ctx.fillStyle = '#444'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('CG = 0.5: both readings agree', px(midIdx), py(qA[midIdx]) - 12);
    }
    if (progress >= 1) {
      const leftBump = Math.round(SIM * 0.22), rightBump = Math.round(SIM * 0.78);
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#2980b9'; ctx.fillText('rho = CG', px(leftBump), py(qA[leftBump]) - 12);
      ctx.fillStyle = '#c0392b'; ctx.fillText('rho = 1 - CG', px(rightBump), py(qB[rightBump]) - 12);
      ctx.fillStyle = '#999'; ctx.fillText('baseline p', px(Math.round(SIM * 0.15)), py(pVals[Math.round(SIM * 0.15)]) + 16);
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

Both readings start at the same place — a fully uncorrelated pool at {% katex() %}CG = 0{% end %} carries no accuracy edge either way, so {% katex() %}Q = p = 0.5{% end %} regardless of which formula is used — and both converge again near {% katex() %}CG = 1{% end %}, where a pool this internally consistent leaves the reading almost moot. The two curves only pull apart in between, cross exactly once at {% katex() %}CG = 0.5{% end %}, and swap which one is optimistic depending on which side of {% katex() %}0.5{% end %} the measured pool sits on. That crossing is not a coincidence needing an explanation — it's forced by the algebra, since {% katex() %}CG = 1 - CG{% end %} only at {% katex() %}CG = 0.5{% end %}, the one point where both formulas are quietly computing the identical {% katex() %}\rho{% end %}. Everywhere else, they are computing two different numbers and calling them by the same name.

The honest resolution isn't picking a side. It's replacing the proxy with a measurement once enough direct observations exist — an online correlation estimate, seeded with a documented prior and updated from real pairwise outcomes rather than inferred once from a single Hamming-distance snapshot and left alone. Until that measurement accumulates, any marginal-gain calculation resting on the proxy is resting on a factor-of-two-to-four uncertainty band, dressed up as a single confident number.

Definition 2 already flags {% katex() %}Q(N,p,\rho){% end %} as this post's own construction rather than a citation. Here is specifically which paper it's *not* transcribed from, and why the distinction matters. Nitzan & Paroush (1982) — *International Economic Review* 23(2), 289–297, a real and verifiable citation — proves something adjacent but distinct: the optimal *weighted* majority rule for voters with known, heterogeneous, but still *independent* competence, with weights proportional to each voter's log-odds {% katex() %}\log(p_i/(1-p_i)){% end %}. Nothing in that result addresses correlated errors. The literature that does — Ladha (1992), *American Journal of Political Science* 36, 617–34, and the line of work following it — establishes the two boundary conditions Definition 2 was built to match: positive pairwise correlation degrades majority accuracy toward the individual voter's own accuracy {% katex() %}p{% end %} at the high end, and recovers the independent-voter result at the low end, with the Condorcet guarantee's asymptotic climb toward certainty eroding somewhere in between. What none of that literature supplies, as far as this post can verify, is the specific linear-interpolation functional form connecting those two points. {% katex() %}Q(N,p,\rho){% end %} fills that gap by construction, not by transcription. Blurring that line would let a real citation lend borrowed authority to a formula nobody actually published.

## What the Independence Failure Looks Like in a Concrete Case

The independence-assumption chain isn't only a theoretical concern waiting to bite a future deployment. Take a single-family, five-explorer ensemble, run against a convergent formal-proof task: every explorer scores between 0.83 and 1.00, averaging 0.967. By any naive reading, that's a healthy pool — high scores, tight agreement, nothing to flag.

Now apply outlier-resistant selection to that same pool. It discards four of the five proposals as geometric outliers and keeps one. The resulting diversity-adjusted quality signal, {% katex() %}j_{\text{eff}}{% end %} — the ratio of realized ensemble value to its theoretical ceiling under genuine independence — comes out at 0.400, roughly forty cents on the dollar for a pool that looked, on its face, like it was performing near its ceiling. The five high scores were not five independent confirmations of a good answer. They were one answer, confidently restated five times, and the algorithm built to protect against a corrupted minority does exactly what it was built to do: it finds the "outliers" and rejects them — except the outliers, on a convergent task like this one, are frequently where whatever genuine diversity the pool had left was actually hiding.

The finer-grained diagnosis matters more than the headline number: this failure pattern is specific to *convergent* task types, where the correct answer is well-attested enough in training data that independent sampling converges on it regardless of genuine reasoning diversity. On a *divergent*, constraint-heavy task — one where the correct approach genuinely isn't obvious from surface pattern-matching — the same single-family pool, measured the same way, would instead show genuine proposal differentiation, with a diversity-adjusted quality figure closer to two-thirds rather than four-tenths. Task convergence type, not model-family diversity alone, is the variable that determines whether outlier-resistant selection helps a pool or actively discards its remaining diversity. A fixed selection strategy applied without that distinction gets the convergent case backwards.

## What Shipped in Response

Measuring {% katex() %}\rho{% end %} from constraint-agreement alone conflates two different signals: two agents can share a constraint-satisfaction profile by coincidence while producing semantically distinct proposals, or diverge on constraints while producing near-identical text. A single correlation number, wherever it comes from, inherits the same blindness as USL's single {% katex() %}\beta{% end %}. The response is not a smarter formula — it's tracking two independent signals instead of collapsing them into one: a Hamming-distance measure of constraint agreement, and a cosine-similarity measure of semantic agreement on embeddings, checked against each other rather than blended.

<span id="prop-1"></span>

<details>
<summary>Proposition 1 -- Bivariate Coherence Gain: two independent signals catch what one scalar cannot</summary>

**Proposition 1** (Bivariate Coherence Gain). Let {% katex() %}CG_{\text{hamming}}{% end %} be the mean pairwise agreement on constraint-satisfaction fingerprints, and {% katex() %}N_{\text{eff}}{% end %} the participation-ratio-based effective count of semantically independent proposals from embedding similarity:

{% katex(block=true) %}
N_{\text{eff}} = \frac{\left(\sum_i \lambda_i\right)^2}{\sum_i \lambda_i^2}
{% end %}

over the eigenvalues {% katex() %}\lambda_i{% end %} of the trace-normalized cosine-similarity kernel. A pool with high {% katex() %}CG_{\text{hamming}}{% end %} and low {% katex() %}N_{\text{eff}}{% end %} has coincidental constraint agreement without genuine semantic diversity — a signature neither quantity alone can produce.

</details>

> **Physical translation.** {% katex() %}CG_{\text{hamming}}{% end %} alone asks "do these proposals pass the same checks." {% katex() %}N_{\text{eff}}{% end %} asks "do these proposals actually say different things." A pool can score high on the first and near-1.0 on the second — meaning five checkmarks in the same boxes, produced by what is effectively one voice.

{% katex() %}N_{\text{eff}}{% end %} has a clean derivation rather than a black-box definition. It's the participation ratio applied to the eigenvalues of the trace-normalized pairwise-similarity kernel — a quantity with a clean interpretation at both extremes: at full independence the similarity kernel is close to the identity matrix, every eigenvalue is roughly equal, and {% katex() %}N_{\text{eff}}{% end %} returns close to {% katex() %}N{% end %}. At full correlation — every proposal a near-identical restatement of one answer — the kernel collapses toward rank 1, one eigenvalue dominates, and {% katex() %}N_{\text{eff}}{% end %} returns close to 1, regardless of how many nominal proposals were pooled. There's no contested domain transfer here the way there is with {% katex() %}\rho{% end %} — the participation ratio is a direct, standard measurement of how many independent directions a set of vectors actually spans, and it answers exactly the question five agreeing proposals need answered: are these five directions, or one direction measured five times.

A third diagnostic, borrowed from ensemble weather forecasting, belongs here for a specific reason: checking its implementation against its namesake is itself an instance of this post's argument. Hamill and Talagrand's rank histogram, in its original form, accumulates a histogram of where *verified ground truth* falls, ranked among a set of ensemble forecast members, across many independent verification events — a flat histogram means the ensemble is well-calibrated, a U-shaped one (mass piling at the extreme ranks) means the ensemble is too narrow relative to the truth's actual variability, a dome-shaped one (mass piling in the middle ranks) means it's too wide. What's implemented under this name here does not rank ground truth among proposals at all — no external truth enters the computation. It ranks how many proposal scores in a run exceed the *second-highest* score in that same run, a purely self-referential measure of how tightly the top of the pool clusters, accumulated across many resolved tasks into a histogram the same shape-classification logic is then applied to.

That's a real methodological gap, not a naming quibble — the classical diagnostic's calibration claim depends on ranking an independent quantity against the ensemble; this version ranks the ensemble against itself. A related, narrower limit deserves the same directness: LLM-as-judge scores aren't exchangeable draws from one distribution the way the classical method requires, which makes this tool a weak signal for relative comparisons at best, not an absolute calibration measurement — it needs an independent oracle before any calibration claim built on it can be trusted. That caveat is necessary. It's not sufficient on its own to cover the deeper point: even with exchangeable, oracle-verified scores, a diagnostic that never touches ground truth isn't measuring calibration in the sense its borrowed name implies — it's measuring cluster tightness at the top of a pool, which is a real and useful signal, just a different one than "Talagrand rank histogram" would lead a reader familiar with the source field to expect.

That gives the pool three diversity signals, each catching something the other two are blind to — Hamming agreement, cosine-based semantic independence, and top-of-pool clustering — with the third weighted for what it actually is rather than what its name suggests. It says nothing yet about what the merge step does with a pool that fails any of them — which is the second half of this post, and the part that turns an assumption failure into a specific mechanism failure.

## What Breaks When the Merge Step Doesn't Know

Picture a pipeline stage that assembles the final synthesis prompt from every proposal that survives pruning, with the verification score stripped out before it arrives — proposal *text* forwarded to the merge step, never proposal *scores*. A proposal that had passed six of six binary checks and a proposal that had passed one of six would sit in the same context window with the same implicit authority, because nothing downstream could tell them apart.

The research the fix drew on forms a chain, not a single citation. Maryanskyy, Budnikov and Kaliyev name the selection bottleneck directly — Mixture-of-Agents quality depends on what reaches the aggregator, not on the aggregator's sophistication — the fix belongs *before* synthesis, not inside it {{ cite(ref="7", title="Maryanskyy, Budnikov & Kaliyev (2026) — When Agents Disagree: The Selection Bottleneck in Multi-Agent LLM Pipelines, arXiv:2603.20324") }}. Constitutional AI's critique-revision loop supplies the pattern for what to do with a rejected proposal instead of discarding it — treat the rejection as a structured negative target for the next attempt, not as silence {{ cite(ref="8", title="Bai et al. (2022) — Constitutional AI: Harmlessness from AI Feedback") }}. RouteMoA supplies the pattern for cutting cost before synthesis rather than inside it — a lightweight scorer screens the query itself, before every model in the pool has been called, narrowing the field to a high-potential subset; only that subset proceeds to inference and a lighter judge-based rescoring, rather than the full pool running before anything gets filtered {{ cite(ref="9", title="Wang, Wu, You, Song, Wang, Shan, Li, Zhang, Le, Chen, Guan & Tao (2026) — RouteMoA: Dynamic Routing without Pre-Inference Boosts Efficient Mixture-of-Agents, arXiv:2601.18130") }}. Denisov-Blanch et al.'s argument that crowd-wisdom strategies fail for LLM truthfulness is the case for keeping the score attached to the text all the way through, rather than treating verification as a gate that ends once a proposal is admitted {{ cite(ref="10", title="Denisov-Blanch, Kazdan, Chudnovsky, Schaeffer, Guan, Adeshina & Koyejo (2026) — Consensus is Not Verification: Why Crowd Wisdom Strategies Fail for LLM Truthfulness, arXiv:2603.06612") }}. SMoA is the justification for sparse rather than dense reconciliation — synthesizing only over proposals that passed, never the full pool including rejects {{ cite(ref="11", title="Li, Tan, Qian, Li, Chaudhary, Hu & Shen (2024) — SMoA: Improving Multi-agent Large Language Models with Sparse Mixture-of-Agents, arXiv:2411.03284") }}.

<span id="prop-2"></span>

<details>
<summary>Proposition 2 -- Regime-Gated Synthesis: route by score separation before spending a synthesis call</summary>

**Proposition 2** (Regime-Gated Synthesis). Given sorted verification scores {% katex() %}s_1 \geq s_2 \geq \dots \geq s_N{% end %} and a calibrated separation unit {% katex() %}t_v{% end %}:

{% katex(block=true) %}
\Delta = s_1 - s_2
{% end %}

A pool with zero survivors exits before any synthesis call is made at all. A pool with exactly one survivor — {% katex() %}N = 1{% end %} after pruning, no {% katex() %}s_2{% end %} to measure {% katex() %}\Delta{% end %} against — is handled as its own *single-survivor* case: select {% katex() %}s_1{% end %} directly. That's the degenerate version of the next case, stated separately because there is no second score for the separation condition to be computed from, not because the routing logic differs. Otherwise, with {% katex() %}N \geq 2{% end %} survivors, a *clear-leader* case selects {% katex() %}s_1{% end %} directly, no synthesis, when {% katex() %}\Delta \geq 2t_v{% end %}. That single condition is doing the whole job: {% katex() %}t_v{% end %} is calibrated so that crossing {% katex() %}2t_v{% end %} already implies a high estimated correctness for the leader — a property of what the threshold means, established once at calibration time, not a second quantity re-checked on every routing decision. Otherwise it falls to the *tight-cluster* case — reconcile only the passing subset.

</details>

> **Physical translation.** The old design ran a full synthesis pass on every task, on the theory that reconciling more input is always safer. The new design asks first whether there's anything to reconcile — a proposal with a decisive-enough lead doesn't need a committee to agree with it, because the lead itself, past a calibrated threshold, already stands in for high estimated correctness. Nothing else needs to be checked at that point; the threshold was built to carry that meaning.

The default separation unit, {% katex() %}t_v{% end %}, is itself a calibrated quantity rather than an arbitrary round number, and the calibration is exactly what makes the single {% katex() %}\Delta \geq 2t_v{% end %} check sufficient: {% katex() %}t_v{% end %} is set small enough that a genuinely decisive lead over the second-best proposal routes to the cheap path, large enough that two closely-scored proposals, plausibly reflecting real disagreement rather than measurement noise, still route through reconciliation instead of a coin-flip selection dressed up as confidence. Move the calibration and the correctness guarantee it implies moves with it — which is also the threshold's exposure: it's only as reliable as the calibration run that set it, not a property re-verified at decision time.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart TD
    classDef gate fill:none,stroke:#333,stroke-width:2px;
    classDef ok fill:none,stroke:#22c55e,stroke-width:2px;
    classDef alt fill:none,stroke:#ca8a04,stroke-width:2px;
    A[Verified proposals, scores attached] --> B{Zero survivors?}
    B -->|yes| C[Exit before any LLM call]:::ok
    B -->|no| S{Exactly one survivor?}
    S -->|yes| T[Single survivor: select it directly]:::ok
    S -->|no, two or more| D{"Clear lead in score,<br/>past the calibrated threshold?"}
    D -->|yes| E[Clear leader: select it directly]:::ok
    D -->|no| F[Tight cluster: reconcile the passing subset]:::alt
    F --> G[Structured violation feedback to next retry]:::alt
{% end %}

<figcaption>Figure 2: regime-gated synthesis. Score information, previously stripped out before the merge step, now determines the routing decision before any reconciliation call runs.</figcaption>

The structured feedback loop in the diagram's last box has its own worked-out decay behavior. "Remember what failed" and "remember it forever, undiluted" are different design choices with different failure modes, which is why the decay rate needs to be stated precisely rather than left implicit. A per-constraint violation counter carried across retries decays geometrically rather than resetting or persisting flat — each retry wave multiplies the prior wave's recorded violation weight by a fixed factor below one, giving the count an effective half-life of roughly two retries. A constraint that failed once, three waves ago, still counts against a proposal now, but at a fraction of its original weight — recent evidence dominates, old evidence fades rather than vanishing outright or accumulating without bound. That's a deliberate middle position between two failure modes on either side of it: a counter that resets every wave forgets a recurring problem the moment the wave that surfaced it ends, and a counter that never decays lets one early, possibly-stale violation keep penalizing a proposal line of reasoning long after later waves have moved past it.

## Framework in Practice — A Multi-Tenant Billing Task Walked Through

Abstract routing rules earn their keep against a concrete task. The walkthrough below is a constructed illustration, in the same register as the {% katex() %}j_{\text{eff}} = 0.400{% end %} example earlier in this post, built to make the mechanism legible rather than to report a specific run. A committee of five explorers, single model family, is asked to design a quota-change mechanism for a multi-tenant billing service, required to satisfy four simultaneous constraints: idempotency under retry, an immutable audit trail, no distributed locks on the hot path, and strict tenant isolation on shared infrastructure keys.

Phase one: calibration. The pool's measured {% katex() %}CG_{\text{hamming}}{% end %} comes back moderate — proposals agree on roughly six in ten constraint checks — and {% katex() %}N_{\text{eff}}{% end %}, measured independently from embeddings, comes back near two, not five. That gap is the bivariate signal doing its job: five nominal proposals, but genuinely only about two independent semantic approaches among them, likely a lock-based approach and a lock-free approach, each restated with minor variation by two or three explorers apiece.

Phase two: verification. Four of five proposals fail the no-distributed-locks constraint outright — a classic blocking-lock pattern, textbook-common and exactly what the corpus forbids for this hot path. One proposal, using a lock-free atomic update instead, survives with a real but thin margin — passing seven of ten total binary checks across the four constraints, not a comfortable margin above the pass threshold.

Phase three: the point this post is actually about. Before score-aware routing existed, all five proposals — four failing, one thin-margin survivor — would have reached the merge step with their scores stripped, reconciled as if all five carried equal authority. With scores attached, the regime classifier sees a single survivor and a wide margin below it: this is the single-survivor case, returned directly, no synthesis call spent reconciling four proposals that had already failed a hard constraint. The one proposal that matters reaches the operator without four rejected lock-based drafts diluting its presentation — and just as importantly, the four rejected proposals' specific violation — the no-distributed-locks constraint from the original four, the same one the blocking-lock pattern tripped in phase two — gets recorded as structured feedback for the next retry wave, in case the thin-margin survivor's approach needs reinforcement later, rather than discarded the moment the wave ends.

The independence failure and the routing fix are visible in the same run: an {% katex() %}N_{\text{eff}}{% end %} near 2 is the independence-assumption chain showing up as a measurement, not a theorem; routing the single survivor straight through, and attaching the structured feedback to the four rejects, is what the merge step does differently once it's told the truth about which of the five proposals actually deserved to be there.

## Where This Sits Among Everything Else Called "Multi-Agent Orchestration"

The term covers several genuinely different layers of a stack. Separating them matters before claiming credit for solving any one:

| Layer | What it does | Relationship to this post's mechanisms |
| :--- | :--- | :--- |
| **Inference** | Serves the model itself | Delegated to entirely — not this layer's concern |
| **Adapter-internal optimization** | Compiles prompts and few-shot weights inside one model call | Complementary — an internally-optimized adapter can sit inside any explorer slot |
| **Distributed compute fabric** | Maps agents to hardware, schedules, scales | Delegated to — decides *where* an agent runs, not *how many* or *which role* |
| **Topology and coordination** | Bounds N, calibrates correlation, routes by regime, attributes quality | Where everything in this post lives |
| **Agentic frameworks generally** | Compose tools, memory, control flow | Adjacent — most don't bound N from a measured coefficient or route by score regime |
| **Empirical aggregators (MoA family)** | The strongest published competitors on raw quality | Directly comparable, directly citable, not yet directly benchmarked here |

The honest claim for this post's mechanisms is narrow and specific: calibrated bounding *plus* score-aware regime routing is the wager, against unbounded aggregation generally. It is a defensible wager, grounded in five independently-converging papers rather than one — and it remains, as stated below, an unverified one on this system's own task domain until the comparison actually runs.

## Where This Is Still Honest About What It Hasn't Shown

The regime-gated design's predicted routing behavior holds on the walkthrough worked through above. What hasn't been shown yet is a head-to-head comparison against the strongest published alternatives on the same task domain. Mixture-of-Agents reports 65.1% on AlpacaEval 2.0 against GPT-4o's 57.5% {{ cite(ref="12", title="Wang, Wang, Athiwaratkun, Zhang & Zou (2024) — Mixture-of-Agents Enhances Large Language Model Capabilities, arXiv:2406.04692") }}; Self-MoA reports that aggregating repeated samples from a single top-performing model beats standard cross-model mixing in most scenarios it was tested against — a 6.6% improvement over MoA on AlpacaEval 2.0, and an average 3.8% gain across MMLU, CRUX, and MATH {{ cite(ref="13", title="Li, Lin, Xia & Jin (2025) — Rethinking Mixture-of-Agents: Is Mixing Different Large Language Models Beneficial?, arXiv:2502.00674") }}. Neither number has been reproduced or contested here. That comparison — not a new mechanism — is the actual next step, and saying so plainly is more useful than implying the fix closes a question the fix was never tested against.

> **Cognitive Map.** Three theorems, three borrowed clauses: independence (Condorcet), an adversarial-not-honest minority (Krum), one coherency scalar meaning one thing (USL). None survive contact with agents drawn from overlapping training data intact — and the failure isn't hypothetical, it's a measured {% katex() %}j_{\text{eff}} = 0.400{% end %} on a convergent-task pool, four valid proposals discarded by an algorithm doing exactly what it was built to do. Bivariate coherence — Hamming agreement checked against semantic independence, plus a third clustering diagnostic borrowed in name from ensemble weather forecasting but measuring something narrower than its namesake, a limit stated precisely here rather than inherited silently — is the response to the third theorem's blindness. Score-aware, regime-gated synthesis, with a decaying cross-retry memory of what specifically failed, is the response to what a merge step does once it knows the first two don't hold by default. Even the measurement meant to fix the first theorem carries its own unresolved question — which direction {% katex() %}CG_{\text{mean}}{% end %} should translate into correlation — stated here as an open formula ambiguity rather than smoothed over. The remaining open question is not whether any of this works on its own terms — each piece does, on the runs it was tested against — but whether the whole assembly wins against the strongest published alternative on this system's own task domain, a comparison that hasn't been run yet, and won't be resolved by another paragraph of confident prose.

**Compute it.** Before trusting an ensemble's disagreement rate as a signal of anything, check one thing directly: does the merge step that combines your agents' outputs ever see which ones passed verification, and by how much? If the score dies at the merge boundary, the aggregation is blind by construction — independent of how sophisticated the algorithm downstream claims to be. And before trusting the diversity number attached to that ensemble, check a second thing: is it one scalar, or two independent measurements checked against each other? A pool that agrees on which checks it passed while saying five genuinely different things needs to be told apart from a pool that agrees on both — and one number, however carefully computed, cannot make that distinction. Two can.

---
<sup>[1]</sup> Lorenz, J., Rauhut, H., Schweitzer, F. & Helbing, D. (2011). *How Social Influence Can Undermine the Wisdom of Crowd Effect.* Proceedings of the National Academy of Sciences, 108(22), 9020–9025.

<sup>[2]</sup> Krogh, A. & Vedelsby, J. (1995). *Neural Network Ensembles, Cross Validation, and Active Learning.* Advances in Neural Information Processing Systems, 7, 231–238.

<sup>[3]</sup> Lefort, B., Benhamou, E., Ohana, J.-J., Guez, B., Saltiel, D. & Jacquot, T. (2024). *Examining Independence in Ensemble Sentiment Analysis: A Study on the Limits of Large Language Models Using the Condorcet Jury Theorem.* arXiv:2409.00094.

<sup>[4]</sup> Blanchard, P., El Mhamdi, E. M., Guerraoui, R. & Stainer, J. (2017). *Byzantine-Tolerant Machine Learning.* NeurIPS / arXiv:1703.02757.

<sup>[5]</sup> Ruan, C., Wang, Y., Shi, Z. & Li, J. (2025). *Reaching Agreement Among Reasoning LLM Agents.* arXiv:2512.20184.

<sup>[6]</sup> Yang, Y., Qu, C., Wen, M., Shi, L., Wen, Y., Zhang, W., Wierman, A. & Gu, S. (2026). *Understanding Agent Scaling in LLM-Based Multi-Agent Systems via Diversity.* arXiv:2602.03794.

<sup>[7]</sup> Maryanskyy, A., Budnikov, D. & Kaliyev, A. T. (2026). *When Agents Disagree: The Selection Bottleneck in Multi-Agent LLM Pipelines.* arXiv:2603.20324.

<sup>[8]</sup> Bai, Y. et al. (2022). *Constitutional AI: Harmlessness from AI Feedback.* Anthropic / arXiv:2212.08073.

<sup>[9]</sup> Wang, J., Wu, H., You, Z., Song, Y., Wang, Y., Shan, Z., Li, Y., Zhang, S., Le, X., Chen, C., Guan, X. & Tao, D. (2026). *RouteMoA: Dynamic Routing without Pre-Inference Boosts Efficient Mixture-of-Agents.* arXiv:2601.18130.

<sup>[10]</sup> Denisov-Blanch, Y., Kazdan, J., Chudnovsky, J., Schaeffer, R., Guan, S., Adeshina, S. & Koyejo, S. (2026). *Consensus is Not Verification: Why Crowd Wisdom Strategies Fail for LLM Truthfulness.* arXiv:2603.06612.

<sup>[11]</sup> Li, D., Tan, Z., Qian, P., Li, Y., Chaudhary, K. S., Hu, L. & Shen, J. (2024). *SMoA: Improving Multi-agent Large Language Models with Sparse Mixture-of-Agents.* arXiv:2411.03284.

<sup>[12]</sup> Wang, J., Wang, J., Athiwaratkun, B., Zhang, C. & Zou, J. (2024). *Mixture-of-Agents Enhances Large Language Model Capabilities.* arXiv:2406.04692.

<sup>[13]</sup> Li, W., Lin, Y., Xia, M. & Jin, C. (2025). *Rethinking Mixture-of-Agents: Is Mixing Different Large Language Models Beneficial?* arXiv:2502.00674.
