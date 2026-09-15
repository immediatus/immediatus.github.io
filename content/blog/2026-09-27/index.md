+++
authors = ["Yuriy Polyulya"]
title = "The Trigger to Stop Simulating"
description = "Three parts in, this series finally answers the question it opened with: not whether to explore, not how safely, but exactly when the case for building the fix stops being patience and starts being negligence. Reframe that decision as what it actually is, a bounded premium paid once for the right to survive an open-ended, heavy-tailed cost, and this series' already-locked numbers say something sharper than \"eventually\": at this series' base discount rate, every tail weight this series has priced already clears that threshold, though the lightest tail's margin turns out to depend on the discount rate in a way the heavier tails' margins do not."
date = 2026-09-27
slug = "cost-of-knowing-part4-the-trigger-to-stop-simulating"
draft = false

[taxonomies]
tags = ["distributed-systems", "control-theory", "systems-thinking", "queueing-theory"]
series = ["cost-of-knowing"]

[extra]
toc = false
series_order = 4
series_title = "The Cost of Knowing: Dual Control, Bounded Probing, and the Limits of Forward Simulation"
series_description = """<div class="series-lede">Your simulator has never once been wrong about the past.</div>Every engineer trusts a simulation right up until it is wrong in a way the simulation itself was built never to notice. This series is an audit of that trust, run against congruence bias, the specific paradox of building a check that can only ever agree with you, and against a real production incident, until the audit produces its math. Each part stands on a formal result from its discipline and prices one piece of the same underlying question, without assuming in advance which part, if any, closes it. Every post ends the same way, by naming the exact number at which its recommendation reverses, because an architecture is only as honest as the failure condition it names, and one that names none was never engineered, only decorated."""
+++

[Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) closed by naming the exact question this series has owed since its first page. Exploring costs less than not exploring. A probe engineered correctly costs less than one built to repeat the original mistake. A boundary drawn once costs less than review paid forever. Given all three, exactly when does the model stop being the cheaper choice and the probe become the required one? This post answers that question directly, by name. It is worth being precise about what kind of question it actually is before touching the mathematics that answers it.

<div class="recap-box">
<span class="recap-label">Argument so far</span>
<ul>
<li><strong><a href="/blog/cost-of-knowing-part1-the-simulation-singularity/">The Simulation Singularity</a>'s Proposition 1.</strong> Refusing to explore an unknown environment does not eliminate the cost of not knowing it; it compounds silently until an incident collects the bill. This priced the cost of never exploring, measured as a probability of eventually being wrong.</li>
<li><strong><a href="/blog/cost-of-knowing-part2-dual-control-and-the-weaponized-probe/">Dual Control and the Weaponized Probe</a>'s Proposition 2.</strong> A control action under uncertainty is mathematically forced to regulate and explore at once. Cyclic Adaptive Regulation makes that continuous, the shape TCP BBR already runs at internet scale, and buys the right to build a safe, perpetual probe.</li>
<li><strong><a href="/blog/cost-of-knowing-part3-safe-in-probability-not-in-size/">Safe in Probability, Not in Size</a>'s Definition 3 and Corollary 2.</strong> Once the probe exists, a discrete-time stochastic control barrier function bounds how often it can leave a declared safe region. A CVaR extension bounds how bad it can get when it does. That priced existence and severity.</li>
<li><strong>What this post asks next.</strong> Given that the mechanism exists and is priced safe, exactly when does the case for building it flip from prudent patience into active negligence? This post prices timing, the one question the first three left open.</li>
</ul>
</div>

**Notation used in this post.** where:

- {% katex() %}I{% end %} is the exercise cost, bound to [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own {% katex() %}B{% end %}
- {% katex() %}V{% end %} is the present value of the avoided-cost flow, modeled as geometric Brownian motion; {% katex() %}V^\ast{% end %} is the threshold this post derives
- {% katex() %}\mu{% end %} is {% katex() %}V{% end %}'s own drift, renamed from the primary source's own {% katex() %}\alpha{% end %} to avoid colliding with [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own two uses of that letter
- {% katex() %}\sigma{% end %} is {% katex() %}V{% end %}'s own volatility, derived from {% katex() %}\lambda{% end %} below. Not the same quantity as [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own {% katex() %}\sigma{% end %}, that post's Universal Scalability Law contention parameter
- {% katex() %}r{% end %} is the discount rate
- {% katex() %}\beta{% end %} is the characteristic equation's positive root, the elasticity parameter setting how far {% katex() %}V^\ast{% end %} sits above {% katex() %}I{% end %}
- {% katex() %}W(V){% end %} is the option-value function, deliberately not {% katex() %}F{% end %}, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own safety-filter signature
- {% katex() %}\lambda{% end %} is this series' locked annual regime-shift arrival rate; {% katex() %}p{% end %} is [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own daily probability that {% katex() %}\lambda{% end %} converts from
- {% katex() %}c_{\text{maint}}{% end %} and {% katex() %}c_{\text{test}}{% end %} are [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own maintenance and one-shot-test costs, unchanged quantities carried under their series-wide names

## Not a Third Pass at an Argument Already Made Twice

Three parts in, it would be easy to mistake this post for a fourth attempt at a case this series already made. State the progression once, plainly, so no reader has to reconstruct it from memory of two earlier posts.

[The Simulation Singularity](@/blog/2026-09-13/index.md) priced the penalty of never exploring at all. A frozen policy, validated only against its history, pays an unbounded, compounding cost the moment the true environment departs from what was simulated. That cost is measured in the probability of eventually being wrong, not in how fast the wrongness arrives. By contrast, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) priced the blast radius of a probe that is already running. Given that the mechanism exists and is safe by Definition 3's probability bound, the question became how bad one excursion can get. That is a magnitude bound layered on top of a probability bound that was never built to see it.

Neither of those is this post's question. This post prices timing, not existence and not severity. That is the exact threshold at which the case for building Cyclic Adaptive Regulation in the first place flips from prudent patience into active negligence. Of the two prior parts, [The Simulation Singularity](@/blog/2026-09-13/index.md) already answered whether, and [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) already answered how safely. What is left is a when question, and it is an optimal-stopping problem, though not shaped the way a reader who has seen optimal-stopping problems before might expect. Here the acting is the investment itself, building the mechanism, and stopping is exactly what a rational team keeps doing, correctly, right up until the threshold arrives.

The direction matters enough to state twice: this is the decision to build a safeguard that does not exist yet, not the decision to retire one that already does. A team deciding when it becomes safe to switch off an already-running, already-safe probe is answering a real but different question, an abandonment option rather than an investment option. This post does not answer it. Both questions are worth asking. Only one of them is this post's subject, and confusing the two would mean spending the rest of this post's machinery answering a question no reader actually came here with.

## The Team That Read This Series and Did Nothing Yet

Meet a version of the platform team that has read this series' advice and has not acted on it. That is a more common outcome than either extreme this series has compared so far. It has not shipped [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s Cyclic Adaptive Regulation. It has also not suffered a second correlated-retry incident since the one [The Simulation Singularity](@/blog/2026-09-13/index.md) opened with. Six months have passed since that postmortem. The dashboard is green. The historical window, now half a year longer than the one that missed the regime the first time, still shows nothing resembling the burst that started this series.

A reasonable engineering leader looks at that record and asks the question every quiet system eventually earns. Why spend [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own locked estimate, 480 engineer-hours, three engineer-months, building a safeguard against a regime that does not appear to actually occur? This team's recent sample says exactly that.

What that question actually is deserves naming before it gets answered, because this series derived it once already, under a different subject. It is [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own diagnosis, recurring one level up. A quiet historical window was never evidence the regime could not occur. It was only evidence that a window too narrow to contain it had not yet ended, Definition 1's Modeling Tax, paid again. This time the payer is not a simulator trusting its history, but a team trusting its six months of not having built the fix yet. Reading an absence of incidents as safety is congruence again: agreeing with a track record precisely because nothing has ever forced that track record to disagree.

The conversation this question actually produces, in a real quarterly planning cycle, rarely sounds like a statistics debate. Naming that is worth doing before the formalism arrives to make it sound like one. It sounds like a roadmap review where three engineer-months against an admission-control layer that has not caused a visible problem in six months loses, politely, to two features. Those two features already have a customer's name attached to them. Nobody in that room is wrong about anything they can see. The customer's name is real. The three engineer-months are real.

What is missing from the room is the one thing a quiet dashboard cannot supply on its own: a number for what the team is holding. That number needs pricing the same way the two competing features were priced, in the same currency, against the same planning horizon. That is the actual gap this post closes: not a moral argument that safety matters more than features, but a missing line item. That line item sits inside a comparison that already happens every quarter, whether or not anyone writes the missing number down.

## The Right, Not the Obligation

Pricing this decision means stating it precisely enough, rather than arguing it by analogy.

Building Cyclic Adaptive Regulation costs a known, bounded amount up front, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s {% katex() %}B{% end %}. In exchange, it buys the right, not the obligation, to detect and survive whatever the next correlated-retry regime turns out to cost. On that cost, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s Node-verified severity table already showed it is heavy-tailed. At the worst-observed tail, it can run to hundreds of thousands of times a typical occurrence, not a fixed, bounded number at all. A known, bounded premium, paid once, in exchange for an open-ended, asymmetric payoff realized only if a specific, uncertain event occurs. That is the same structural object as a financial call option, and not an analogy to one. The machinery built to price exactly that object, real options theory, applies here directly rather than by metaphor.

<div class="pull-quote">This is a call option, not an analogy to one.</div>

What would make that claim false is worth saying plainly, the same discipline this series has applied to every formal object so far. The option framing would not apply in either of two cases. It would not apply if the payoff from having built the mechanism were bounded and certain rather than open-ended and heavy-tailed. Nor would it apply if the cost of building it varied with when the team chose to act, rather than staying fixed. That fixed cost is [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own {% katex() %}B{% end %}. Either way, this post's machinery would then have nothing to price. Neither condition holds in this series' running case, which is what makes the mapping exact rather than decorative.

Distinguish this from the two nearby framings a reader might reach for instead, because each one would quietly change the answer. Insurance pricing, the framing the physical translation below leans on for intuition, prices a *pooled* risk across many independent policyholders. There, the insurer's payout scales with how many claims arrive, not with a single team's binary build-or-wait choice. It is a useful analogy for intuition and the wrong formal object for this post's single-team decision.

A simple decision tree, expected cost of building against expected cost of not building, computed once and compared, is naive net-present-value reasoning again. It is exactly the comparison "Why the Bar Is Higher Than 'Does It Pay for Itself'" below shows is missing the option value of waiting entirely. Real options theory is the correct tool here specifically because the decision is a genuine either-or, exercised at a time of the holder's choosing. The payoff itself keeps moving while the choice is deferred. Those are exactly the three properties a decision tree assumes away, and an insurance pool was never built to price for one policyholder alone.

What remains is to state that object formally enough for a reviewer to check whether the team above is actually holding an option worth exercising now. Or, the team may be holding only an excuse to keep waiting dressed up as one. Then compute, using only numbers this series has locked and verified already, exactly where that team stands.

## The Object, Stated Formally

<span id="def-5"></span>

**Definition 5** (Real Option to Commit to Continuous Probing). The architectural value of holding the right, but not the obligation, to make the one-time engineering investment {% term(url="", def="I: the exercise cost of the option, the one-time investment that converts a passive, historically-validated policy into Cyclic Adaptive Regulation. Bound to Part 2's B in this series' running case.") %}{% katex() %}I{% end %}{% end %} that converts a passive, historically-validated policy into Cyclic Adaptive Regulation, given a known, bounded exercise cost and an open-ended, heavy-tailed payoff from the regime shift that investment lets the system detect and survive.

<span id="prop-5"></span>

**Proposition 5** (Investment-Timing Trigger). Let the underlying value {% term(url="", def="V: the present value of the safety benefit from having Cyclic Adaptive Regulation already built, evaluated as a perpetuity on the net avoided-cost flow rate this series has already locked.") %}{% katex() %}V{% end %}{% end %} follow geometric Brownian motion, {% katex() %}dV = {% end %}{% term(url="", def="mu: the drift rate of V, this series' net avoided-cost flow trend. Collapses to zero under the stationarity assumption Section 4 below states explicitly.") %}{% katex() %}\mu{% end %}{% end %}{% katex() %} V\,dt + {% end %}{% term(url="", def="sigma: the volatility of V, priced in this post from the diffusion approximation to the regime-shift arrival process, deliberately kept separate from Corollary 2's severity uncertainty.") %}{% katex() %}\sigma{% end %}{% end %}{% katex() %} V\,dz{% end %}, and let {% katex() %}I{% end %}, Definition 5's exercise cost, be fixed. The optimal exercise threshold is

{% katex(block=true) %}
V^\ast = \frac{\beta}{\beta - 1}\,I, \qquad \tfrac{1}{2}\sigma^2\beta(\beta-1) + \mu\beta - r = 0, \quad \beta > 1
{% end %}

where:

- {% term(url="", def="r: the discount rate applied to future cash flows, an ordinary finance input, not a quantity this series derives from its anchors.") %}{% katex() %}r{% end %}{% end %} is the discount rate
- {% term(url="", def="beta: the characteristic equation's positive root, the elasticity parameter that sets how far above the exercise cost the threshold V* sits.") %}{% katex() %}\beta{% end %}{% end %} is the equation's positive root

Waiting is individually rational below {% katex() %}V^\ast{% end %}; investing is individually rational at or above it{{ cite(ref="1", title="McDonald, R. & Siegel, D. (1986) -- The Value of Waiting to Invest, Quarterly Journal of Economics, 101(4), 707-727") }}.

- {{ layer(n=1, type="Bound", id="the-characteristic-equation-a") }}The characteristic equation and the threshold's functional form are McDonald and Siegel's exact result, confirmed against the primary source directly, not from a remembered paraphrase. The NBER working-paper text states the identical setup, using the primary source's symbol {% katex() %}\alpha{% end %} for the drift: {% katex() %}dV = \alpha V\,dt + \sigma V\,dz{% end %}, {% katex() %}\tfrac{1}{2}\sigma^2\beta(\beta-1)+\alpha\beta-r=0{% end %}, {% katex() %}V^\ast=[\beta/(\beta-1)]I{% end %}. An independent survey (Arkin and Slastnikov) reproduces the same characteristic equation under different variable names, converging on the same object from two directions.
  This post renames that drift term {% katex() %}\mu{% end %}, not {% katex() %}\alpha{% end %}, because {% katex() %}\alpha{% end %} already names two different quantities in [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md), the Pareto tail-weight and the CVaR tail-fraction. A third meaning for the same symbol is exactly the kind of collision this series has caught and fixed before, not a cosmetic preference. Here that collision sits inside a formula that reuses [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own tail-weight rows directly.
  What is not independently confirmed at the exact-digit level is the original paper's stated illustrative multiple. Reproducing its stated parameters, {% katex() %}r=0.10{% end %}, {% katex() %}\sigma=0.20{% end %}, {% katex() %}\mu=0.05{% end %}, gives {% katex() %}\beta\approx1.61{% end %} and a trigger multiple of {% katex() %}2.64{% end %}, not the roughly 1.5-to-2 range the secondary summary reported. That is close enough to confirm the equation is right and not close enough to state that specific figure as a verified quote. Every number this post reports below is this post's computation from this series' locked anchors, not a restatement of McDonald and Siegel's illustrative case.
- {{ layer(n=2, type="Fit", id="the-drift-term-alpha-plays") }}The drift term {% katex() %}\mu{% end %} plays the role of {% katex() %}r - \delta{% end %} in the more familiar dividend-yield presentation of the same model; this post derives {% katex() %}\mu{% end %} for this series' running case explicitly below, rather than asserting a dividend yield by analogy.
- {{ layer(n=3, type="Estimate", id="mapping-a-rare-discrete-reg") }}Mapping a rare, discrete regime-shift arrival onto a continuously diffusing {% katex() %}V{% end %} is a judgment call, not a proof of equivalence, made explicit rather than smuggled into the notation: "Binding the Variables to This Series' Own Locked Numbers" below states exactly which property of the real arrival process this mapping preserves and which it idealizes away.

> **Physical translation.** A homeowner deciding when to buy flood insurance does not buy the instant the insurer's payout would exceed this year's premium; a rational homeowner waits for the flood risk to look bad enough that paying the premium every year from now on, forgoing whatever the premium money could otherwise earn, is worth less than the protection. {% katex() %}V^\ast{% end %} is that same waiting bar, stated for engineering hours instead of premiums: not "does the safeguard pay for itself on average," but "does it pay for itself by enough margin to also cover the value of the flexibility being given up by committing now instead of staying free to wait for better information."

## Where the Characteristic Equation Actually Comes From

Citing McDonald and Siegel's formula is not the same as showing why it has the shape it has. A reader entitled to check this post's math is entitled to that derivation's intuition, not only its citation.

{{ layer(n=2, type="Fit", id="the-option-to-invest-has-a") }}The option to invest has a value, call it {% term(url="", def="W(V): this post's option-value function, deliberately not F, since Part 3 already gives F a specific, different meaning (the safety filter's signature, F: X times A to A). A different letter for a different object.") %}{% katex() %}W(V){% end %}{% end %}, that itself depends on the current value {% katex() %}V{% end %}. Standard optimal-stopping theory pins that function down with two boundary conditions at the threshold {% katex() %}V^\ast{% end %}, not one:

- **Value-matching.** The option is worth exactly its exercise payoff at the moment of exercise, {% katex() %}W(V^\ast) = V^\ast - I{% end %}, an accounting identity: the option stops being an option and becomes the asset minus its cost the instant it is exercised.
- **Smooth-pasting.** The option's value function meets that payoff *tangentially*, {% katex() %}W'(V^\ast) = 1{% end %}, not at an angle. If the two curves crossed at an angle instead, a corner, the threshold could not be optimal: standing just on either side of a kinked crossing, a rational holder could do strictly better by exercising a moment earlier or waiting a moment longer, so an optimal boundary can never leave that corner behind.

**The governing equation.** Between the two conditions sits one differential equation for {% katex() %}W{% end %}, {% katex() %}\tfrac{1}{2}\sigma^2 V^2 W''(V) + \mu V W'(V) - rW(V) = 0{% end %}, itself a direct consequence of no-arbitrage pricing applied to a claim on a geometric-Brownian-motion asset. The pair of boundary conditions is exactly enough to solve for both {% katex() %}W{% end %} and {% katex() %}V^\ast{% end %} together.

{{ layer(n=1, type="Bound", id="name-what-the-smooth-pasting") }}**A hidden assumption.** Name what the smooth-pasting argument above actually assumes, because it is not free of assumptions of its own. "A rational holder could do strictly better by exercising a moment earlier or waiting a moment longer" works because a diffusion approaches its boundary continuously: standing right at {% katex() %}V^\ast{% end %}, waiting one more instant moves {% katex() %}V{% end %} by an infinitesimal amount, never past the boundary in one step. A genuinely jump-driven process does not have that property, and this series' regime shifts, discrete arrivals with a heavy-tailed severity, are exactly that: jumps, not creep.

**Where diffusion breaks down.** Mordecki solved optimal stopping in closed form for a diffusion with jumps{{ cite(ref="2", title="Mordecki, E. (1999) -- Optimal Stopping for a Diffusion with Jumps, Finance and Stochastics, 3(2), 227-236") }}. The standard smooth-pasting principle needs a real modification to survive contact with jumps, a different requirement than a harder proof of the same result. The option's value function need not be twice differentiable at the threshold, the way a pure-diffusion solution's is. The ordinary verification argument has to be replaced by a generalized one, built for exactly that failure.

This is the mechanism, not only the label, behind Falsification Criterion F20 below. This post's diffusion approximation to a genuinely discrete regime-shift arrival does more than make computing {% katex() %}\sigma{% end %} convenient: it specifically lets this section use the ordinary smooth-pasting argument at all. A true jump-process version of this problem would need a threshold derived Mordecki's way, not McDonald and Siegel's. This post has not checked how far the two would diverge for this series' locked severity distribution.

Falsification Criterion F28 below states this as its testable claim, distinct from F20. Even a perfectly memoryless, well-behaved arrival process, the condition F20 tests, does not by itself rescue smooth-pasting from the jump-versus-creep distinction named here.

**Solving the pair.** The differential equation's solutions have the form {% katex() %}KV^\beta{% end %}. Substituting that form back in is what turns a differential equation into the characteristic equation Proposition 5 states, {% katex() %}\tfrac{1}{2}\sigma^2\beta(\beta-1)+\mu\beta-r=0{% end %}. That is an algebraic equation standing in for a differential one, because the specific functional form of {% katex() %}W{% end %} was already known before the boundary conditions were applied. Read the two remaining unknowns, {% katex() %}K{% end %} and {% katex() %}V^\ast{% end %}, against the two boundary conditions directly. Value-matching and smooth-pasting are two equations in exactly two unknowns, no more free parameters left over and none missing. That is the specific sense in which this threshold is derived rather than fitted to a number chosen in advance.

{{ layer(n=3, type="Estimate", id="verify-the-tangency-conditi") }}**Checking the tangency, not assuming it.** Verify the tangency condition's consequence directly, rather than take the smooth-pasting story on faith. Because {% katex() %}W{% end %} meets its payoff tangentially at {% katex() %}V^\ast{% end %}, not at a corner, the expected payoff from exercising near the true optimum should be nearly flat. That flatness holds in a small neighborhood around it, a first-order condition's signature. Near a maximum, small deviations cost second-order amounts, not first-order ones.

<div style="margin:1.5em 0;">
<canvas id="chart-tangency" aria-label="Chart showing the option value function W(V) meeting the exercise payoff V minus I tangentially at the threshold V star. For V below V star, the curved W(V) line sits above the straight payoff line. At V star, approximately 2625 engineer-hours, the two lines touch without crossing, matching slope, and for V at or above V star they coincide exactly." style="width:100%; aspect-ratio:700/440; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<script>
(function () {
  var canvas = document.getElementById('chart-tangency');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W, H, pw, ph;
  var L = 66, R = 24, T = 24, B = 46;
  var I = 480, beta = 1.2237299763815301, Vstar = 2625.4433945920987, K = 0.14039003141168974;
  var Vmax = 3800, Ymax = 3200;
  var N = 300;
  var Vvals = [], Wvals = [], Pvals = [];
  for (var i = 0; i <= N; i++) {
    var v = (i / N) * Vmax;
    Vvals.push(v);
    Wvals.push(v < Vstar ? K * Math.pow(v, beta) : (v - I));
    Pvals.push(v - I);
  }
  function px(v) { return L + (v / Vmax) * pw; }
  function py(y) { return T + (1 - Math.max(0, y) / Ymax) * ph; }
  function setup() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width; H = rect.height;
    pw = W - L - R; ph = H - T - B;
  }
  function drawAxes() {
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    ctx.fillStyle = '#444'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('V (engineer-hours)', L + pw / 2, H - 8);
    ctx.save(); ctx.translate(16, T + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('value (engineer-hours)', 0, 0); ctx.restore();
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    [0, 500, 1000, 1500, 2000, 2500, 3000, 3500].forEach(function (v) {
      var x = px(v);
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.strokeStyle = '#555'; ctx.beginPath();
      ctx.moveTo(x, T + ph); ctx.lineTo(x, T + ph + 5); ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.fillText(String(v), x, T + ph + 18);
    });
    ctx.textAlign = 'right';
    [0, 500, 1000, 1500, 2000, 2500, 3000].forEach(function (y) {
      var yy = py(y);
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke();
      ctx.strokeStyle = '#555'; ctx.beginPath();
      ctx.moveTo(L, yy); ctx.lineTo(L - 5, yy); ctx.stroke();
      ctx.fillStyle = '#444';
      ctx.fillText(String(y), L - 8, yy + 4);
    });
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawAxes();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (var i = 0; i <= N; i++) {
      var x = px(Vvals[i]), y = py(Pvals[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#2980b9'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (var i = 0; i <= N; i++) {
      var x = px(Vvals[i]), y = py(Wvals[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    var xStar = px(Vstar), yStar = py(K * Math.pow(Vstar, beta));
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(xStar, T); ctx.lineTo(xStar, T + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(xStar, yStar, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#c0392b'; ctx.fill();
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#c0392b';
    ctx.fillText('tangent at V∗ ≈ 2,625h', xStar + 8, yStar - 10);
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#2980b9';
    ctx.fillText('W(V)', px(600), py(K * Math.pow(600, beta)) - 10);
    ctx.fillStyle = '#888';
    ctx.fillText('payoff V − I', px(2900), py(2900 - I) + 16);
  }
  function trySetupAndDraw() {
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) { requestAnimationFrame(trySetupAndDraw); return; }
    setup(); draw();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es, ob) { if (es[0].isIntersecting) { ob.disconnect(); trySetupAndDraw(); } }, { threshold: 0.2 }).observe(canvas);
  } else { trySetupAndDraw(); }
  window.addEventListener('resize', function () { setup(); draw(); });
})();
</script>
<figcaption>W(V) meets its payoff tangentially at V*, the boundary condition Proposition 5's derivation depends on.</figcaption>
</div>

A Monte Carlo simulation of the actual stopping problem, not the closed-form solution, checks this directly. Simulate {% katex() %}V(t){% end %} as the geometric Brownian motion Proposition 5 assumes, using this series' locked {% katex() %}\sigma{% end %} and the zero-drift case. Compare the expected discounted payoff from exercising at several candidate thresholds bracketing the closed-form {% katex() %}V^\ast{% end %}, using the same simulated paths for every candidate to keep the comparison itself low-noise.

<div class="illustrative">

| Candidate threshold ({% katex() %}\times V^\ast{% end %}) | Mean discounted payoff (1,000,000 paths, common random numbers) |
|---|---|
| 0.70x | 39.00 |
| 0.85x | 39.43 |
| 0.95x | 39.47 |
| **1.00x (closed-form {% katex() %}V^\ast{% end %})** | **39.42** |
| 1.05x | 39.41 |
| 1.15x | 39.44 |
| 1.30x | 39.08 |

</div>

The simulated maximum lands at 0.95x, about 0.15 percent above the closed-form value at 1.00x. The paired difference between those two candidates is 0.06 in mean discounted payoff, computed per path under common random numbers, against a standard error of 0.05. That is about 1.1 standard errors, at most a tiny edge. Monthly discrete monitoring is a plausible source of even that much. A path can cross a threshold mid-month and only get scored at the next check. That lets a slightly lower threshold catch a few extra paths a continuously-monitored barrier would have caught anyway. At 1.1 standard errors this is not a real departure from the closed form. Every candidate within 5 percent of {% katex() %}V^\ast{% end %} still scores within about two-tenths of one percent of the simulated best. None of 0.85x, 0.95x, or 1.05x differs from the closed-form row by more than about 1.1 paired standard errors, at 0.12, 1.09, and 0.13 standard errors respectively. The region is broad and gently sloped, close to flat across that whole band. Only the two extremes tested, 0.70x and 1.30x, fall significantly below the best, at 3.19 and 2.57 standard errors. The closed-form threshold sits well inside the flat band rather than measurably below the single measured peak, the tangency condition's own signature. This conclusion was checked for stability across several independently seeded runs; only differences that held up across every seed are reported here.

The closed-form threshold sits inside the shallow, near-optimal region a real optimal-stopping problem should produce. That is the strongest confirmation this kind of simulation can actually give a formula whose own optimum is, by construction, a first-order-flat one.

{{ layer(n=3, type="Estimate", id="name-this-simulation-s-own") }}This simulation's limits are worth naming directly, the same discipline every worked table in this series has been held to. The starting value, {% katex() %}V_0=100{% end %}, sits well below every candidate threshold on purpose, to force genuine waiting behavior rather than near-instant exercise. A simulation started closer to {% katex() %}V^\ast{% end %} would need a shorter horizon and would say less about the shape of the value function far from the boundary.

The hit rate at the closed-form threshold, roughly 3.4 percent of paths crossing within the 60-year simulated horizon, is a direct consequence of {% katex() %}\mu=0{% end %}. A driftless process wanders rather than climbs, so most simulated paths never reach a high threshold at all within any finite horizon. Those paths are correctly scored as zero rather than dropped from the comparison. This is a property of the zero-drift simplification being tested, not a flaw in the test. A positive-drift run would show a higher hit rate and the same qualitative peak. This post has not run that version, since the zero-drift case is the one this post's locked anchors actually specify.

<details>
<summary>Appendix: how far does the threshold move when the process jumps?</summary>

**A jump-process appendix: how far does the threshold actually move?**

F20 and F28 name a gap, not a fix. Closing it fully would mean reproducing Mordecki's generalized verification argument for this series' locked severity distribution, work this post has not done and did not attempt here. What follows is smaller, and honest about being smaller: a direct numerical comparison, built the same way the flatness check above was built. It extends that check to a process that actually jumps instead of creeping toward its boundary.

Take the diffusion identification from "Binding the Variables to This Series' Own Locked Numbers" below literally instead of loosely. That section states that {% katex() %}\sigma^2=\lambda{% end %} treats each arrival as a jump of unit relative size. Taken literally, that describes one specific process. {% katex() %}\log V{% end %} jumps by exactly {% katex() %}\pm 1{% end %} at each Poisson arrival, rate {% katex() %}\lambda{% end %}. Every jump has equal probability either direction, and nothing continuous happens between arrivals at all. Rare and large replaces frequent and small. A jump lands on average every {% katex() %}1/\lambda \approx 2.7{% end %} years, and each one roughly triples {% katex() %}V{% end %} or cuts it to a third.

That asymmetry needs one correction before the comparison is fair. Equal-probability jumps push {% katex() %}V{% end %} upward on average, because {% katex() %}e^{+1}{% end %} gains more than {% katex() %}e^{-1}{% end %} loses, a pure convexity effect with nothing to do with real drift. A small constant markdown to {% katex() %}\log V{% end %} between jumps, {% katex() %}\lambda(E[e^{\pm1}]-1) \approx 0.198{% end %} per year, cancels exactly that effect. It restores the same driftless assumption Proposition 5 makes for {% katex() %}\mu{% end %}. Nothing else about the process is fitted. The arrival rate, the jump size, and now the drift correction all come from quantities this post already locked.

Five million shared paths start from {% katex() %}V_0 = I = 480{% end %}, the same low starting point and common-random-numbers discipline the flatness check above used. They produce the discounted payoff at each candidate threshold below.

<div class="illustrative">

| Candidate threshold | vs. closed-form {% katex() %}V^\ast{% end %} | Mean discounted payoff (5,000,000 paths, common random numbers) |
|---|---|---|
| 1,500h | 57% | 285.95 ± 0.27 |
| 2,100h | 80% | 290.19 ± 0.32 |
| 2,300h | 88% | 290.29 ± 0.34 |
| 2,450h | 93% | 290.01 ± 0.35 |
| **2,625h (closed-form {% katex() %}V^\ast{% end %})** | **100%** | **289.23 ± 0.37** |
| 2,800h | 107% | 288.47 ± 0.39 |
| 3,300h | 126% | 285.21 ± 0.43 |
| 4,200h | 160% | 280.79 ± 0.47 |
| 5,000h | 190% | 276.26 ± 0.50 |
| 6,000h | 229% | 270.56 ± 0.55 |

</div>

The per-threshold standard errors printed with the table are not the right tool to answer whether any candidate actually beats the closed-form row. Every path shares the same jump sequence across thresholds, so the honest comparison is the paired difference against the 2,625h row, path by path. That paired check gives a sharper picture than the table alone. The best candidate, 2,300h, sits significantly above the closed-form row. Its mean payoff is 1.06 higher, at a paired standard error of 0.15, about 7.0 paired standard errors. That is large enough at five million paths to call a real effect rather than noise. Its upper neighbor, 2,450h, clears the same bar at 6.9 paired standard errors, and both hold above the closed form across independent seeds. The lower neighbor, 2,100h, sits above it too, at 5.1 here, but by as little as 1.8 on other seeds, so only its direction is stable. The significant region is a band around the peak, not one isolated candidate. Below that band, 1,500h sits 13.2 paired standard errors below the closed-form row, already a clear effect in the other direction. Just past the closed-form row, 2,800h is also significantly below it, at 6.6 paired standard errors, clearing the conventional two-standard-error line by a wide margin. From 3,300h onward the decline keeps growing, reaching about 43.7 paired standard errors below at 6,000h. The table's maximum lands at 2,300h, about 12 percent below the closed-form 2,625h. That candidate and its two immediate neighbors sit measurably above the closed-form row, and 2,800h sits measurably below it, none of it a coincidence of one set of simulated paths. These differences were checked for stability across several independently seeded runs; only the ones that held up across every seed are reported here.

Read the threshold shift first. A diffusion approaches its boundary continuously. Waiting one more instant past the optimal point costs almost nothing as a result, the exact mechanism the tangency condition on "the Governing Equation" above depends on. A jump process has no such cushion. Overshoot a boundary by jumping straight past it, and the payoff collected is whatever value the jump landed on, not the threshold itself. A lower threshold gives up less to that overshoot risk than a diffusion-tuned threshold would. That is the direction this table's peak actually sits relative to the closed-form value.

This run does not reproduce a second hump. Past 2,800h the mean payoff falls monotonically all the way to 6,000h, with no local maximum reappearing near 4,200h or 5,000h. A single lucky up-jump early in a path can, in principle, still clear a high threshold before discounting erodes its value, a mechanism a diffusion has no analogue for. At one million paths and a fixed seed, though, that effect does not surface as a distinct second peak in this particular run. A different seed, or a longer horizon, might still find one; this appendix reports what this run actually shows, not what the mechanism makes merely plausible.

Neither finding proves what Mordecki's generalized verification argument would prove analytically. What this appendix shows, honestly and directly rather than by citation, is specific. The jump process this post's own {% katex() %}\sigma^2=\lambda{% end %} convention implies produces a payoff curve whose best candidate, 2,300h, sits significantly above the closed-form row, by about 7.0 paired standard errors, joined by 2,450h at 6.9, with 2,100h pointing the same way by a seed-dependent margin. That is a significant band around the peak, not one isolated candidate. Immediately past the closed-form row, 2,800h is also significantly below it, at 6.6 paired standard errors, and the decline keeps growing monotonically out to 6,000h. In this run the value function is single-peaked, not multi-modal; that specific disconfirming signal toward F28 does not reproduce here. The threshold shift itself does reproduce at five million paths, and across a band of candidates rather than a single point. This literal jump translation's optimum sits measurably, and here detectably, below the diffusion-derived {% katex() %}V^\ast{% end %}. That is partial evidence toward F28's disconfirming side on the threshold-location question, though not on the shape-of-the-value-function question this same run also tests. This post has shown one specific, literal jump translation of its stated convention behaving differently from the diffusion it approximates. That difference is measurable, not only suggestive, at this sample size. It has not shown that every jump process consistent with {% katex() %}\lambda{% end %} would behave the same way. Nor has it shown that Mordecki's closed-form threshold lands at 2,300h rather than somewhere else within this run's uncertainty.

</details>

## Binding the Variables to This Series' Own Locked Numbers

Two variables in Proposition 5, {% katex() %}\sigma{% end %} and {% katex() %}\mu{% end %}, cannot be read off a balance sheet the way {% katex() %}I{% end %} can. Both get their exact meaning stated here, once, rather than left as free parameters a reader has to guess at.

**Volatility, {% katex() %}\sigma{% end %}, prices timing uncertainty, not severity.** Definition 3 and Corollary 2 already bound the probability and the magnitude of a safe-region excursion. Routing that same heavy-tailed severity into {% katex() %}\sigma{% end %} here would double-count a risk this series priced elsewhere already, and would fail outright under this post's running case, since [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own severity table's heavier rows have infinite variance.

Instead, {% katex() %}\sigma{% end %} is derived from the diffusion approximation to the regime-shift arrival process itself, a standard technique for approximating a compensated Poisson process by Brownian motion at small arrival rates. That gives {% katex() %}\sigma^2 = \lambda{% end %}, where {% term(url="", def="lambda: this series' locked annual regime-shift arrival rate, converted from Part 1's p approx 1/1000 per production-day anchor. Not a fresh estimate.") %}{% katex() %}\lambda{% end %}{% end %} is this series' locked annual arrival rate. That rate is not a fresh estimate; it falls out of the same {% katex() %}p \approx 1/1000{% end %} per production-day anchor [The Simulation Singularity](@/blog/2026-09-13/index.md) already locked.

State the identification's fine print, because it is a convention with a stated justification, not a derivation. A compensated Poisson process's variance per unit time is {% katex() %}\lambda{% end %} times the mean squared jump size. Equating {% katex() %}\sigma^2{% end %} to {% katex() %}\lambda{% end %} alone, therefore, treats each arrival as a jump of unit relative size. That treatment is forced here rather than freely chosen. Routing the real, heavy-tailed jump sizes into {% katex() %}\sigma{% end %} would mean {% katex() %}\lambda \cdot E[\text{jump}^2]{% end %}, a quantity the heavier severity rows make infinite. Doing so would also double-count a risk Corollary 2 already prices. What remains is a {% katex() %}\sigma{% end %} whose order of magnitude comes from the arrival rate, and whose jump-size factor is normalized away by construction. That is a stated convention Falsification Criterion F20 exists to test, not a measured volatility.

One check the resulting {% katex() %}\sigma \approx 60{% end %} percent might seem to invite is worth refusing out loud rather than quietly performing. Converting {% katex() %}\lambda{% end %} back into "years of passive waiting needed for 95 percent confidence of having seen the regime" reproduces [The Simulation Singularity](@/blog/2026-09-13/index.md)'s locked 8.2-year figure exactly. That reproduction, though, validates nothing about the diffusion mapping. The 8.2-year figure is a deterministic function of {% katex() %}\lambda{% end %} alone, so any {% katex() %}\sigma{% end %} derived from {% katex() %}\lambda{% end %} by any rule whatsoever would pass it. It confirms only that {% katex() %}\lambda{% end %} crossed between posts intact, a transcription check rather than a modeling check. This series has a name for mistaking the first kind for the second: a check sharing an ancestor with the thing it checks. The mapping itself stands or falls on F20, not on any reproduction this post could run against its inputs.

**Drift, {% katex() %}\mu{% end %}, is this series' net avoided-cost flow, not an invented growth rate.** Building Cyclic Adaptive Regulation avoids an expected cost flow of {% katex() %}\lambda \cdot E[L]{% end %} per year, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own mean-severity multiplier applied to [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own {% katex() %}L{% end %} anchor, net of [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own ongoing maintenance cost {% katex() %}c_{\text{maint}}{% end %}. Under the explicitly stated simplifying assumption that this net flow has no systematic trend of its own, the standard perpetuity relation collapses {% katex() %}\mu{% end %} to {% katex() %}0{% end %} and prices {% katex() %}V{% end %} directly off the flow at rate {% katex() %}r{% end %}, {% katex() %}V = (\lambda E[L] - c_{\text{maint}})/r{% end %}, rather than smuggling a second free parameter into a model that already has enough of them.

What netting {% katex() %}c_{\text{maint}}{% end %} out of the flow quietly assumes is worth naming, because [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own history says the assumption is not free. Treating {% katex() %}c_{\text{maint}}{% end %} as a smooth, constant deduction models maintenance as a fungible payment that preserves the assumed benefit level however it is spent: pay the 2 engineer-hours, keep the flow.

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own account of BBR's tuning history is not that shape. Each of its three major revisions fixed one failure mode while surfacing another, a fairness pathology traded for a different one across versions. That is not a steady payment smoothly maintaining a fixed level of protection. Skipped or imperfect tuning, on this series' evidence, does not simply shrink the avoided-cost flow by {% katex() %}c_{\text{maint}}{% end %}'s own worth. It can leave a specific, active failure mode running in a system a team believes is protecting it, exactly the "stale hazard" this post's perpetuity treatment has no term for.

This does not change {% katex() %}V{% end %}'s own formula, and this post is not proposing one. Still, {% katex() %}c_{\text{maint}}{% end %} nets out of the flow the same way regardless of whether real maintenance is smooth or lumpy. That is because the formula only needs the expectation, not the path.

What the formula cannot see is the asymmetry. An under-maintained Cyclic Adaptive Regulation policy is a different, specifically-broken one, on [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own account, not a cheaper, slightly-worse version of the fully-maintained one this post prices. This post's own {% katex() %}V{% end %} implicitly assumes maintenance discipline it has not separately verified anyone will actually sustain. Falsification Criterion F29 below states this as its testable claim.

<div class="illustrative">

| [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s tail weight ({% katex() %}\alpha{% end %}) | {% katex() %}E[L]{% end %} | Net flow / year | {% katex() %}V{% end %} ({% katex() %}r=5\%{% end %}) | {% katex() %}V^\ast{% end %} | Verdict |
|---|---|---|---|---|---|
| 3.0 (moderate) | 480h | 151h | 3,026h | 2,625h | Invest now, 1.15x |
| 1.5 (heavy) | 760h | 254h | 5,072h | 2,625h | Invest now, 1.93x |
| 1.1 (very heavy) | 2,360h | 838h | 16,760h | 2,625h | Invest now, 6.38x |

</div>

At this series' base rate, {% katex() %}r=5\%{% end %}, every tail weight clears its threshold, invest now across the board. Whether that verdict holds at a higher discount rate depends on which tail weight is actually in force, the next section's question, checked directly rather than assumed. For comparison, [The Simulation Singularity](@/blog/2026-09-13/index.md) and [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) each computed a crossover, a future date past which building the fix becomes worthwhile. Under this series' already-locked numbers, at the base rate, that date has already passed, and the heavier the tail, the further past it the team already is.

## How Much of This Survives Being Wrong About the Inputs

A verdict this clean earns a stress test before it earns trust. Three questions, checked directly rather than asserted. Does "invest now" survive a higher discount rate than this series' base case of 5 percent? Does it survive relaxing the zero-drift assumption? And does it survive an actual error in the volatility estimate?

**The discount rate first, since a reviewer will press on it hardest.** Every number in this post's main verdict table above uses this series' base rate, {% katex() %}r=5\%{% end %}. Recomputing {% katex() %}V^\ast{% end %} and every tail's margin at each whole point from 5 to 10 percent gives:

<div class="illustrative">

| {% katex() %}r{% end %} | {% katex() %}V^\ast{% end %} | Moderate | Heavy | Very heavy |
|---|---|---|---|---|
| 5% | 2,625h | 1.15x | 1.93x | 6.38x |
| 6% | 2,322h | 1.09x | 1.82x | 6.02x |
| 7% | 2,103h | 1.03x | 1.72x | 5.69x |
| 8% | 1,937h | 0.98x | 1.64x | 5.41x |
| 9% | 1,807h | 0.93x | 1.56x | 5.15x |
| 10% | 1,701h | 0.89x | 1.49x | 4.93x |

</div>

The heavy and very heavy rows stay above 1.0x across the whole range this post checked. A reviewer working either one does not need to litigate the discount rate at all. The moderate row does not share that comfort. Its margin crosses below 1.0x between 7 and 8 percent, and solving the crossing directly rather than reading it off the table puts it at {% katex() %}r \approx 7.5\%{% end %}. Above that rate, on this series' locked anchors, the moderate tail's recommendation flips from invest now to wait. That is a genuine reversal driven by the discount rate alone, holding drift and volatility at their base-case values.

{{ layer(n=3, type="Estimate", id="relaxing-the-zero-drift-assu") }}**Drift next, evaluated at {% katex() %}r=8\%{% end %}**, the rate the table above already put the moderate tail on the losing side of, since that is the more informative point to stress-test rather than the comfortable {% katex() %}r=5\%{% end %} base case. Let the net avoided-cost flow grow or shrink at a rate {% katex() %}m{% end %} between negative 5 and positive 5 percent a year, a wide range against a flow this series has no evidence trends at all:

<div class="illustrative">

| {% katex() %}m{% end %} | {% katex() %}V^\ast{% end %} | Moderate | Heavy | Very heavy |
|---|---|---|---|---|
| -5% | 1,344h | 0.87x | 1.45x | 4.80x |
| -2.5% | 1,569h | 0.92x | 1.54x | 5.09x |
| 0% | 1,937h | 0.98x | 1.64x | 5.41x |
| +2.5% | 2,645h | 1.04x | 1.74x | 5.76x |
| +5% | 4,547h | 1.11x | 1.86x | 6.14x |

</div>

At {% katex() %}r=8\%{% end %}, the heavy and very heavy tails clear their threshold at every drift rate checked here. That range runs from a 5 percent annual shrinkage to a 5 percent annual expansion of the underlying flow. The moderate tail clears it only with genuine growth. It needs upward drift somewhere between 0 and 2.5 percent a year to reach 1.0x at this discount rate. A flat or shrinking flow leaves it on the wait side of its threshold. Fifteen combinations sit in these two tables: three tail weights against five discount rates, and three tail weights against five drift rates. Every heavy or very heavy combination says invest now. The moderate tail alone flips, at {% katex() %}r \geq 7.5\%{% end %} regardless of drift, or at {% katex() %}r=8\%{% end %} with drift at or below zero.

The zero-drift assumption is a real simplification, stated as one rather than hidden. At this series' base rate, {% katex() %}r=5\%{% end %}, it is not load-bearing for the direction of any row's answer, only for the exact margin. Even the moderate tail's 1.15x margin at {% katex() %}m=0{% end %} needs a decline well outside the range checked here to flip at that rate. At {% katex() %}r=8\%{% end %}, drift is load-bearing for the moderate tail specifically, in exactly the direction the discount-rate table above already predicted.

{{ layer(n=3, type="Estimate", id="the-volatility-estimate-is-a") }}The volatility estimate is a different story, and this post says so rather than papering over it. This series derived {% katex() %}\sigma{% end %} from its locked arrival rate, not measured directly, so ask what happens if that derivation is wrong by a real margin, not a token one.

Doubling {% katex() %}\sigma^2{% end %} at {% katex() %}r=5\%{% end %}, equivalent to the true arrival rate running twice as hot as [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own anchor implies, raises {% katex() %}V^\ast{% end %} to 4,414 hours. That exceeds the moderate tail's own {% katex() %}V{% end %} of 3,026 hours and flips that one row, and only that one row, from invest now to wait. The heavy row does not flip at 2x, but does at 4x, where {% katex() %}V^\ast{% end %} reaches 7,944 hours against the heavy row's 5,072; the very heavy row's 16,760 hours survives both.

This is stated as a breakeven rather than a scenario. At this series' base rate {% katex() %}r=5\%{% end %}, each tail weight's net flow would have to be overestimated by this much to flip its verdict:

<div class="illustrative">

| Tail weight | Overestimate needed to flip |
|---|---|
| Moderate | 15 percent |
| Heavy | 93 percent |
| Very heavy | 538 percent |

</div>

The pattern is not an accident, and it is a different mechanism than Corollary 2's tail-weight finding, worth keeping separate rather than folding together. Corollary 2 found that a heavier tail makes a probability bound alone a worse proxy for actual severity, demanding more protection, not less.

This post's finding runs the other way for a different reason. {% katex() %}E[L]{% end %} itself grows with the tail weight, per [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own mean-severity multipliers. That is why a heavier tail raises {% katex() %}V{% end %} directly. A larger {% katex() %}V{% end %} sitting further above a {% katex() %}V^\ast{% end %} that does not itself depend on severity leaves more room for {% katex() %}V{% end %}'s own inputs to be wrong before the comparison flips. The two findings point in the same direction: more caution warranted as the tail gets heavier, and more margin available in this post's specific verdict. They are not the same mechanism, though, and this post does not claim they are.

What this buys, and what it does not, is worth stating plainly. It does not make the moderate-tail verdict as trustworthy as the very-heavy-tail one. The moderate tail's fragility is now three separate findings pointing the same direction, not one. A 15 percent overestimate of the flow flips it at the base rate. It is the only row that crosses into wait territory within the 5-to-10-percent discount-rate range this post checked, at {% katex() %}r \geq 7.5\%{% end %}. And at the higher end of that range, it needs genuine positive drift, more than a non-negative one, to hold. A reviewer working the moderate-tail case should treat this post's recommendation as sensitive to the discount rate and the arrival-rate estimate together. Such a reviewer should demand both a tighter estimate of {% katex() %}\lambda{% end %} and an explicit, defended discount rate before leaning on it. That is exactly the honest caveat a Model Scope table exists to state, rather than bury.

It does mean the heavier the running case's tail turns out to be, the less this recommendation depends on getting {% katex() %}\sigma{% end %} exactly right. That is a genuinely different and stronger claim than "the model is robust," stated at the precision the claim can actually support.

## Why the Bar Is Higher Than "Does It Pay for Itself"

A reader entitled to ask a sharper question than any answered so far: why does {% katex() %}V^\ast{% end %} sit so far above {% katex() %}I{% end %} in the first place. Naive net-present-value reasoning says build the mechanism the moment its expected benefit clears its cost, {% katex() %}V \geq I{% end %}, full stop. Proposition 5 instead demands {% katex() %}V \geq [\beta/(\beta-1)] I{% end %}, a strictly higher bar, and the gap between the two is not an arbitrary safety margin this post added by hand.

{{ layer(n=1, type="Bound", id="the-gap-exists-because-the") }}The gap exists because the choice to invest is a convex payoff, not a linear one. Jensen's inequality, {% katex() %}E[f(x)] \geq f(E[x]){% end %} for any convex {% katex() %}f{% end %}, prices exactly what that convexity is worth. A team holding the *option* to invest captures the upside if {% katex() %}V{% end %} keeps rising, and simply does not exercise if it falls. That payoff is convex in {% katex() %}V{% end %} by construction, one-sided in a way a linear NPV comparison never is.

Uncertainty in {% katex() %}V{% end %}, the same {% katex() %}\sigma{% end %} this post derived from the regime-shift arrival process, is therefore not a pure cost to a team holding this option. It would be a pure cost only to a team already committed. It is an asset, because more spread in future outcomes raises the expected value of a payoff that only keeps the good half of that spread. Naive NPV reasoning throws that asset away for free, comparing expected value against cost as though the decision, once made, could be unmade if new information arrived. Proposition 5's threshold is the exact price of preserving that flexibility, not an add-on.

{{ layer(n=3, type="Estimate", id="the-size-of-that-premium-in") }}The size of that premium, in this post's running case, is itself worth stating plainly. At {% katex() %}r=5\%{% end %}, {% katex() %}V^\ast/I \approx 5.47{% end %}; at {% katex() %}r=10\%{% end %}, {% katex() %}V^\ast/I \approx 3.54{% end %}.

A naive analyst comparing {% katex() %}V{% end %} only against {% katex() %}I=480{% end %} engineer-hours would have called every row in this post's worked table an easy yes long before the option-corrected threshold did. That analyst would have been right about the direction for the wrong reason. It is the same shape of accidental correctness [The Simulation Singularity](@/blog/2026-09-13/index.md) warned against, in its account of a clean validation pass that never actually discriminated between hypotheses.

What Proposition 5 adds is not a different verdict here; every row already clears the higher, option-aware bar too, some by an order of magnitude. What it adds is the guarantee that the verdict would still hold even for a case naive NPV alone could not distinguish from noise. The option-aware threshold is the one built to survive exactly the volatility a naive comparison ignores.

What this means for the sensitivity finding in "How Much of This Survives Being Wrong About the Inputs" above is worth naming. The two results compound, rather than sitting side by side. A heavier tail raises {% katex() %}V{% end %} directly, through {% katex() %}E[L]{% end %}. Jensen's inequality is the reason the bar {% katex() %}V{% end %} has to clear does not fall by the same proportion. Here, {% katex() %}\beta{% end %} depends on {% katex() %}\sigma{% end %}, not on the severity distribution, so a heavier tail widens the gap between {% katex() %}V{% end %} and {% katex() %}I{% end %} without correspondingly widening {% katex() %}V^\ast{% end %}. That is the arithmetic reason the very heavy tail clears its threshold by 6.38x while the moderate tail clears it by only 1.15x. It is not a coincidence of the specific numbers this post chose to lock.

## Three Crossovers, Not One Restated Three Times

This series has now computed a crossover three times, in three posts. A reader who has followed all three deserves to be told directly why they are three different objects, rather than one number arrived at three different ways.

[The Simulation Singularity](@/blog/2026-09-13/index.md)'s crossover, {% katex() %}c \log N = N \cdot p \cdot L{% end %}, solved at {% katex() %}N^\ast \approx 36{% end %} production-days. It compares a logarithmically growing statistical exploration cost against a linearly growing cost of staying ignorant. It answers whether probing is worth it at all, holding the mechanism's engineering cost at a small, per-round marginal price, {% katex() %}c{% end %}, not a one-time capital cost.

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s crossover uses its one-shot-test cost, {% katex() %}c_{\text{test}}{% end %} there and here alike, a name chosen specifically to avoid colliding with this post's discount rate {% katex() %}r{% end %}. It is solved at {% katex() %}N^\ast \approx 26.7{% end %} months: {% katex() %}c_{\text{test}} \cdot N{% end %} against {% katex() %}B + c_{\text{maint}} \cdot N{% end %}. It compares two affine engineering-labor cost curves, a recurring one-shot-testing cost against a one-time build plus a smaller recurring maintenance cost. It answers whether building the infrastructure is cheaper than repeatedly testing without it, treating the regime-shift risk itself as a backdrop, not the variable being priced.

Neither crossover has a volatility term, because neither is pricing the value of *waiting under uncertainty*. Both are comparing two deterministic cost curves and finding where one dips below the other, an ordinary breakeven, not an option.

{{ layer(n=2, type="Fit", id="this-post-s-own-crossover-i") }}This post's crossover is a different kind of object precisely because it has a {% katex() %}\sigma{% end %}. Proposition 5 does not compare two cost curves and find where they cross. It prices the value of *retaining the choice* to invest later, against committing now, under genuine uncertainty about when the payoff arrives. It also finds the threshold past which that retained choice is worth less than exercising it.

[The Simulation Singularity](@/blog/2026-09-13/index.md) and [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) each effectively ask which deterministic path costs less over a horizon. Part 4 instead asks how much flexibility itself is worth, given that the future is not deterministic, and whether that value has already been exceeded. The three crossovers do not compete for the same answer, because they are not competing for the same question. This post being the only one of the three with a volatility term is the entire reason a real-options treatment was the correct tool for this specific question. That is not a stylistic difference. It would have been the wrong tool for [The Simulation Singularity](@/blog/2026-09-13/index.md)'s or [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s.

One place all three do agree is worth confirming rather than assuming. All three crossovers, run on this series' locked anchors, say the same qualitative thing from three independent directions: continuing to do nothing is the expensive choice, not the safe one. Concretely, [The Simulation Singularity](@/blog/2026-09-13/index.md) says so in expected statistical regret. [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) says so in engineering-labor cost. Part 4 says so in option-adjusted present value.

Three different formalisms, three different disciplines, one converging verdict. That is a stronger form of confirmation than any one of the three could produce alone. It is the same standard this series has held every one of its convergent findings to, since [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own six-discipline synthesis.

## What Changes When More Than One Team Holds This Option

Everything above prices one team's decision, in isolation, the same scope Definition 5 and Proposition 5 were stated for. Recall that [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) already established that this series' running case is not really one controller, but a fleet of them sharing a downstream dependency. The fleet's incentives do not automatically match the single-agent ones, the entire subject of Proposition 4's Stag Hunt.

The same question belongs here. If several teams each hold their version of Definition 5's option, does Proposition 5's threshold still describe what any one of them should rationally do? Or does the presence of the others change the answer?

Real options theory has its literature for exactly this question: competitive option-exercise games. The headline result there points in a specific, checkable direction. When firms hold options over the same scarce opportunity, fear of a competitor exercising first erodes the value of waiting, sometimes down to zero{{ cite(ref="3", title="Grenadier, S.R. (2002) -- Option Exercise Games: An Application to the Equilibrium Investment Strategies of Firms, Review of Financial Studies, 15(3), 691-721") }}. That preemption dynamic pushes exercise earlier than any single firm would choose alone.

{{ layer(n=2, type="Fit", id="name-precisely-why-that-resu") }}Why that result does not transfer here by assumption deserves a precise answer. This series applied the same discipline in [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md), when it found the published multi-agent control-barrier-function literature did not cleanly fit its running case either. Grenadier's preemption games model firms competing for one scarce, exclusive prize, a single plot of land, a single market window. There, the second mover gets a strictly worse outcome than the first. Nothing about this series' running case has that shape.

One team building Cyclic Adaptive Regulation does not consume a scarce opportunity another team also wants. Each team's regime-shift risk, {% katex() %}B{% end %}, and payoff are independent line items, not competing claims on one asset. Applying Grenadier's preemption result here anyway would be citing a real theorem for a question it was never built to answer. That is the exact mistake this series' citation-verification discipline exists to catch.

The structurally correct question runs the other direction, and this post names it without answering it. If peer teams within one organization share incident postmortems, the ordinary case inside a single company, then something follows. One team's decision to build the mechanism and observe what it detects produces information the other teams can act on without paying {% katex() %}B{% end %} first. That is a free-rider incentive that would raise, not lower, the value of waiting relative to the single-agent case Proposition 5 prices.

That is the opposite direction from Grenadier's preemption result, because it is a genuinely different kind of game, an information-spillover game rather than a scarce-resource contest. This series does not have a verified citation mapping this specific shape onto an exact threshold correction the way Proposition 5 has one for the single-agent case. Falsification Criterion F22 below states this as a testable claim rather than leaving it asserted.

What survives regardless of which direction the multi-team correction eventually points is Proposition 5's threshold. It is the correct answer to the question it was actually posed for: one team acting alone, unable to observe or free-ride on any peer's decision. A team operating inside an organization where postmortems genuinely are shared across teams should treat this post's {% katex() %}V^\ast{% end %} as an upper bound on how long waiting could be justified. It is not a precise number. A real information spillover, if it exists, can only extend the rational wait; it can never shorten it below what one team acting in total isolation would already choose.

## A Fleet Version of This Decision Is a Different Formal Object, Not a Bigger One

[The Simulation Singularity](@/blog/2026-09-13/index.md) already generalized its crossover to a fleet. It noted that ignorance cost scales linearly in the number of services, while a shared probing capability's cost is a large fixed cost amortized across however many services use it. A fleet-wide crossover therefore arrives sooner than any single service's number implies. What the equivalent move looks like here is worth naming precisely, rather than assuming the same arithmetic carries over unchanged.

{{ layer(n=2, type="Fit", id="if-cyclic-adaptive-regulati") }}Suppose Cyclic Adaptive Regulation's own {% katex() %}B{% end %} decomposes into a shared component, common tooling and ensemble machinery reusable across services, and a smaller, service-specific integration cost. Then a fleet's decision is a single option to build the shared platform. That single option then unlocks {% katex() %}M{% end %} cheaper, dependent options, one per service, that could not exist before the first was exercised. It is not {% katex() %}M{% end %} independent copies of Definition 5's option priced {% katex() %}M{% end %} separate times.

That is a compound option, an option whose own payoff is itself the right to exercise further options. It is a different formal object than Definition 5's simple option, with its established pricing literature{{ cite(ref="4", title="Geske, R. (1979) -- The Valuation of Compound Options, Journal of Financial Economics, 7(1), 63-81") }}.

{{ layer(n=3, type="Estimate", id="this-post-does-not-derive") }}This post does not derive a fleet-wide threshold from Geske's compound-option formula, and says so rather than reaching for a citation to do work it has not actually checked. What can be stated without that derivation is the qualitative direction, and it points one way. A team evaluating only its own {% katex() %}B{% end %}, {% katex() %}V{% end %}, and {% katex() %}V^\ast{% end %} in isolation prices the smaller, simple option correctly. But it has no way to see the larger, compound option sitting underneath it, the option on the shared platform that every other service's future decision quietly depends on.

Compound options are, generically, worth more than the sum of the simple options they unlock, because exercising the first buys the right to exercise the rest more cheaply. A fleet that lets each service run Proposition 5's single-agent calculation independently is pricing the compound option at the value of its cheapest single branch. That systematically undervalues the shared platform investment relative to what the fleet as a whole is actually holding.

The mistake has a precise shape, because this series found it once already, under a different name. Here, [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own fleet-scale point, that a shared capability's cost gets amortized across every service that uses it, restates one formal layer up. Not just the exercise cost {% katex() %}I{% end %} is shared, but the entire option structure is compound rather than simple. That is a distinction a per-service NPV comparison cannot see, because it was never built to look for it.

Connect this back to "What Changes When More Than One Team Holds This Option" above, because the two findings are related without being the same claim twice. That section named an information-spillover incentive, one team's decision revealing evidence the others can act on for free. This section names a cost-structure incentive, one team's decision building shared infrastructure the others can then exercise more cheaply.

Both point the same direction, toward under-investment when each service prices only its simple option. Both are also structurally distinct enough that neither citation, Grenadier's nor Geske's, stands in for the other. A fleet holding this decision is exposed to two separate reasons a per-service calculation understates what the fleet as a whole should be willing to pay. That is not one reason counted twice under different names.

## The Decision Is a Loop, Not a Calculation

Draw the decision this post actually recommends as a loop, not a one-time calculation. The two sections right after this one both live on this loop's right edge. They cover the number nobody actually has in real time, and trusting the signal that would trigger a different answer, not the comparison itself.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef term fill:none,stroke:#333,stroke-width:2px;
    A["Observe telemetry:<br/>current arrival-rate and<br/>severity estimates"]:::term
    B["Compute V from this<br/>series' locked flow,<br/>net of maintenance cost"]:::term
    C["Compare V against<br/>Proposition 5's V*"]:::term
    D["Exercise: build Cyclic<br/>Adaptive Regulation now"]:::term
    E["Wait: re-observe next<br/>period, no action taken"]:::term
    A --> B --> C
    C -->|"V >= V*"| D
    C -->|"V < V*"| E
    E --> A
{% end %}

<figcaption>Figure 1: the decision this post recommends, drawn as a loop rather than a one-time calculation. Box C is what this post's worked table answers today; the right edge, re-observing before acting again, is where the POMDP and ensemble-trust caveats named below actually live.</figcaption>

Read the loop's honesty into it rather than around it. The right edge, re-observing before acting again, is where two caveats live. One is "The Threshold Assumes a Number Nobody Actually Has in Real Time"'s own POMDP caveat. The other is "Trusting the Signal That Would Trigger a Different Answer"'s own ensemble-trust caveat. Both are named in full in the two sections immediately following this one. What enters box A is telemetry with a real latency floor, filtered through the same regime-detection ensemble whose false-alarm rate this post quantifies as heavy-tail-dependent there. It is not a clean, instantaneous reading of the true state. This post's worked table answers what box C returns today, under this series' locked numbers. It does not certify that every future pass through the loop will return the same answer as cheaply. It only certifies that this pass does, by a wide enough margin to survive the errors the next two sections name.

## The Threshold Assumes a Number Nobody Actually Has in Real Time

Proposition 5 compares {% katex() %}V{% end %} against {% katex() %}V^\ast{% end %} as though {% katex() %}V{% end %} were a number sitting on a dashboard, known exactly and instantly. That assumption is worth naming before leaning on it further, because this series priced the cost of this kind of idealization twice already, under two different vocabularies.

{{ layer(n=1, type="Bound", id="a-decision-rule-comparing-a") }}A decision rule comparing a state variable against a threshold, computed from a fully and instantly observable state, is a Markov decision process. The moment that state variable is instead inferred from delayed, noisy, or incomplete signals, the correct formulation is a partially observable Markov decision process, a POMDP. The two are not interchangeable notational choices. A POMDP's optimal policy is a function of a belief distribution over the true state, not the state itself{{ cite(ref="5", title="Kaelbling, L.P., Littman, M.L. & Cassandra, A.R. (1998) -- Planning and Acting in Partially Observable Stochastic Domains, Artificial Intelligence, 101(1-2), 99-134") }}. That policy can differ substantially from the fully-observed policy evaluated at the belief's mean.

{{ layer(n=2, type="Fit", id="this-series-has-already-loc") }}This series located the mechanism that would corrupt {% katex() %}V{% end %}'s own observability twice already, under two names. First, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) established that a shared coordination signal carries a real, physical latency floor, bounded below by network, consensus, and telemetry aggregation time. That is not a tuning defect a faster implementation erases to zero. Second, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) named the identical floor again, independently, as PACELC's own "else" branch. Even absent a partition, a distributed system trades consistency against latency continuously. A controller acting on a shared signal is always acting on a view that is at best as fresh as that floor allows.

{% katex() %}V{% end %}, as this post has defined it, is computed from {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %}, both themselves estimated from telemetry. That telemetry is aggregated across exactly the kind of distributed measurement pipeline [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) and [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) already proved cannot be instantaneous. A team acting on this post's threshold is, in the fully honest accounting, acting on a stale estimate of {% katex() %}V{% end %}, not {% katex() %}V{% end %} itself.

{{ layer(n=3, type="Estimate", id="state-what-this-costs-with") }}What this costs is worth stating, with the same discipline [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) applied to its actuator-inversion gap. A probability-theoretic threshold should not read as though it already accounts for a distributed-systems constraint it was never built to see. A POMDP reformulation of Proposition 5 would replace the point comparison {% katex() %}V \geq V^\ast{% end %} with a comparison against the current belief's expectation, {% katex() %}E[V \mid \text{observations so far}] \geq V^\ast{% end %}. That belief lags the true {% katex() %}V{% end %} by however stale the underlying telemetry is.

Every row in this post's worked table clears {% katex() %}V^\ast{% end %} by a margin, 1.15x at the tightest. A staleness-induced belief lag would have to be large enough to pull the moderate tail's belief below {% katex() %}V^\ast{% end %}, to change that row's verdict. This post has not measured how large a real telemetry lag would need to be to do that. This is this post's version of the same idealization the Model Scope table below states explicitly. A fully-observed model is used because it is what this post's locked anchors can currently support, not because the observability gap has been shown not to matter.

The asymmetry has a precise shape, the same one Corollary 2 found for probability against magnitude. Getting {% katex() %}V{% end %} slightly stale narrows the margin between {% katex() %}V{% end %} and {% katex() %}V^\ast{% end %}, a quantitative cost. Getting the underlying arrival process itself qualitatively wrong is a different, sharper kind of error this post addresses directly next. That is the same failure mode [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s F12 names for Definition 2's ensemble.

## Trusting the Signal That Would Trigger a Different Answer

Everything above treats {% katex() %}\lambda{% end %}, this series' locked regime-shift arrival rate, as a static, ex-ante base rate, and that is a real and stated scope limit, not an oversight. Proposition 5 as this post has used it is a one-time calculation, not a continuously-updating trigger.

A team that actually operated this way in production would not compute {% katex() %}V^\ast{% end %} once and stop watching. It would keep refining {% katex() %}\lambda{% end %} as new signal arrives. Refining {% katex() %}\lambda{% end %} in real time means running exactly the regime-detection machinery [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) built and [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) stress-tested, Definition 2's interacting-multiple-model ensemble.

{{ layer(n=1, type="Bound", id="part-3-s-own-f12-quantified") }}[Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own F12 quantified this directly, not as a hypothetical. The same ensemble, at the same mixing probability, verified once against light-tailed noise, produces a sustained false-alarm rate of 0.03 percent under Gaussian background noise. That rate rises to 3.08 percent under a moderately heavy tail, and 12.44 percent under a very heavy one, two to three orders of magnitude worse. That worsening comes purely from the background noise getting heavier, with no genuine regime shift ever occurring. This post's running case lives in the heavier end of that range, the same tail weights Proposition 5's worked table already uses.

{{ layer(n=2, type="Fit", id="translate-what-an-elevated") }}Translate what an elevated false-alarm rate does to a team trying to keep {% katex() %}\lambda{% end %} current, rather than leave the dependency named but unexamined. A false alarm reads as a regime shift that never happened. That would push a live re-estimate of {% katex() %}\lambda{% end %} upward on evidence that was actually noise, not signal, an error that pushes toward investing sooner, not later.

Combined with this post's sensitivity finding above, that the moderate tail's verdict flips only if {% katex() %}\lambda E[L]{% end %} is overestimated, this is the one failure mode worth naming precisely. It could genuinely produce a false invest-now signal for the tail weight already closest to its breakeven. That is a different and sharper failure than a false wait signal on a case with room to spare. A missed detection, the ensemble's other error type, understates {% katex() %}\lambda{% end %} instead, biasing every row toward wait. In this case, though, every row this post has actually computed already says invest regardless.

{{ layer(n=3, type="Estimate", id="this-post-does-not-resolve") }}This post does not resolve the tension [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own F12 named, and does not claim to. Whether a live implementation should trust a rising {% katex() %}\lambda{% end %}-estimate enough to accelerate an already-favorable investment decision is a real question. The same signal, after all, is measurably less reliable exactly where this series' severity model says the stakes are highest. This post leaves that question explicitly open, continuing F12 rather than closing it. Falsification Criterion F23 below states the testable form.

Notice what this dependency does and does not put at risk before moving on, because the two are easy to conflate. This post's worked verdict, invest now across every tail weight checked, does not depend on trusting a live, continuously-updated {% katex() %}\lambda{% end %}. It is computed from this series' already-locked, static anchor, immune to F12's tension by construction. What the tension threatens is only the loop diagrammed above. That loop is the mechanism by which a real team would keep that verdict current, after this post's worked table stops being the freshest available estimate. A reader trusting today's answer needs none of F12's resolution. A reader planning to trust next year's answer, produced by the loop rather than read off this page, does.

## The Loop Has to Notice a Regime the Model Itself Has Never Seen

Name the loop diagrammed above for what it structurally is, because the naming carries real content, not decoration. It is a regulator, observing a disturbance, Box A, and adjusting a decision, Box C to Box D or E. This series built the formal machinery for that shape once already, in a different subsystem, three parts ago.

{{ layer(n=1, type="Bound", id="ashby-s-law-of-requisite-va") }}Ashby's Law of Requisite Variety, already load-bearing in [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own cybernetic parallel, states a bound{{ cite(ref="7", title="Ashby, W.R. (1956) -- An Introduction to Cybernetics, Chapman and Hall, Chapter 11") }}. A regulator cannot drive outcome variety below the gap between the disturbance variety it faces and the variety the regulator itself commands. Applied to this post's loop, rather than restated abstractly, this matters directly. The loop's capacity to notice a change in {% katex() %}\lambda{% end %} large enough to matter is bounded by the variety Definition 2's ensemble can actually resolve. On that front, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own F12 already measured exactly where that resolving power runs out. A heavy tail inflates the ensemble's false-alarm rate by two to three orders of magnitude.

Requisite Variety is the same law, watched from a different vantage point, not a new constraint this post is inventing. That law already explained, in [The Simulation Singularity](@/blog/2026-09-13/index.md), why a validated simulator cannot certify a regime it was never shown.

{{ layer(n=2, type="Fit", id="the-loop-s-own-blind-spot-i") }}The loop's blind spot is therefore not a bug in this post's construction. It is the same structural limit every regulator this series has built carries, restated once more at the layer where a fleet's investment timing gets decided. A regime shift severe enough, or novel enough in shape, to exceed what the ensemble was tuned to resolve would not register as a change in the loop's {% katex() %}\lambda{% end %}-estimate. It would look, from inside the loop, exactly like the quiet track record the team at this post's opening already mistook for safety once.

The loop this post recommends is a genuine improvement over no monitoring at all. It is not a claim that the monitoring itself has unlimited variety. This series has insisted on that distinction since its first page. It is not prepared to quietly drop it now that the object being regulated is an investment decision rather than an admission-control queue.

A second, independent limit is worth naming while the loop is already open for inspection. It belongs to a different discipline, and would be missed if this post stopped at cybernetics alone. Who computes {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %} for Box B matters as much as how accurately the ensemble resolves them.

{{ layer(n=1, type="Bound", id="a-check-s-error-and-the-thi") }}A check's error and the thing it checks must not share the same underlying mechanism, for the check to count as independent evidence. This series already applied that Independence condition, under the name the Shared Ancestor Problem. It used that condition to explain a specific failure. A simulator built from the same historical corpus as the policy it validated was never in a position to catch what that policy's training data was already missing.

The same condition applies here without modification. A team that both estimates its own {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %}, and bears the immediate cost {% katex() %}I{% end %} of acting on a high estimate, has a live incentive. That incentive is to lean on the low end of any honest uncertainty in those inputs. That incentive is independent of "Three Converging Verdicts Are Not the Same as Three Teams That Act"'s own present-bias account, named below. That is not because the team is acting in bad faith. It is because the estimator and the party who pays for the estimate's conclusion are the same party, exactly the shared-ancestor structure Independence was named to catch.

{{ layer(n=3, type="Estimate", id="the-honest-fix-mirrors-part") }}The honest fix mirrors [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own: an estimate of {% katex() %}\lambda{% end %} or {% katex() %}E[L]{% end %} produced by the same team deciding whether to spend {% katex() %}I{% end %}. That estimate is not disqualified, but it is not independent evidence either. A reviewer signing off on this post's threshold comparison should ask who produced the inputs before trusting the comparison's output. That is the same discipline [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own reviewer-approval framing already demanded of a safety boundary.

This post's worked numbers are drawn from this series' locked, publicly stated anchors, not a specific team's self-reported estimate, so they do not suffer from this problem. The claim is narrower: what changes the moment a real team runs this post's comparison using its numbers instead.

## The Threshold Is Congruence-Proof Only Where Its Inputs Are

This post's instance of the series' master word is worth naming directly, rather than letting the Independence discussion above stand in for it by implication. Every part in this series has had to find its version of congruence, a system agreeing with itself because nothing in its construction forces it to disagree. This post is not exempt from needing to answer where its version lives.

{{ layer(n=2, type="Fit", id="proposition-5-itself-is-not") }}Proposition 5 itself is a fixed comparison, {% katex() %}V{% end %} against {% katex() %}V^\ast{% end %}, returning whatever answer the inputs actually produce, with nothing in the characteristic equation bending toward the answer a reader wants. It is not congruent on its own. Congruence, if it exists in this post's machinery, lives exactly where the paragraph above already located it. It lives in who produces the {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %} the formula is fed, not in the formula itself.

A team estimating its inputs, aware in advance that a high estimate obligates it to spend {% katex() %}I{% end %}, is being asked to grade its own homework. That homework is on a test whose outcome it has a stake in, not a neutral measurement. That is the identical shape [The Simulation Singularity](@/blog/2026-09-13/index.md) diagnosed in a simulator validated against the very history its policy was trained on. It is recurring now, one layer further from the original incident.

{{ layer(n=3, type="Estimate", id="state-precisely-why-this-po") }}Why this post's worked table, 1.15x to 6.38x margins, does not carry this risk while a real team's application of the checklist below might, deserves a precise answer. This post's inputs are this series' locked, published anchors, fixed before this post's conclusion was known and unavailable for a reader to quietly nudge toward a preferred answer. A real team running the checklist is, by construction, both the estimator and the party whose budget the estimate spends, the exact configuration Independence rules out as evidence-worthy.

The formula does not become congruent when a real team uses it. The team's relationship to its inputs does. The formula has no way to see that difference from the outside. It is the same blind spot [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own simulator had toward the historical corpus it was built from.

What actually breaks this is worth naming, because a threshold this series calls congruence-proof needs a real answer, not a hope. The Independence discussion above already showed the formula was never the problem. The fix has to be the same one [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) reached for at its boundary. That fix is an estimate produced, or at minimum reviewed, by a party without a stake in which way the comparison comes out. That is the structural role an independent reviewer already plays for [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own safety boundary. Here, that role extends to a boundary drawn in dollars and engineer-hours instead of probability.

A team is free to run its numbers through this post's checklist. Whether the resulting {% katex() %}V{% end %} is evidence or self-agreement depends entirely on who was in the room when the estimate was made. That is a question this post can name, but cannot, from the page, verify on any specific reader's behalf.

## Three Converging Verdicts Are Not the Same as Three Teams That Act

A result this well-triangulated invites an uncomfortable question this series has not asked directly yet. If the math has agreed with itself three separate times, why does the team introduced at this post's opening still need to be told any of this? Naming the answer belongs here, not skipped past, because it is not a math question at all.

{{ layer(n=1, type="Bound", id="present-biased-discounting-a") }}Present-biased discounting is a real, formally characterized departure from the exponential discounting Proposition 5 assumes throughout, not a loose way of saying people are impatient. A quasi-hyperbolic discounter applies an ordinary rate to costs and benefits once they are already in the future. It applies an extra, steep penalty specifically to anything that has to happen now{{ cite(ref="6", title="Laibson, D. (1997) -- Golden Eggs and Hyperbolic Discounting, Quarterly Journal of Economics, 112(2), 443-478") }}. A certain, immediate cost gets valued far more heavily than a rational exponential discounter would value it, relative to a benefit stream arriving later.

[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) already found this series' instance of a closely related bias, Kahneman and Tversky's loss aversion. That bias drives resistance to abandoning a familiar one-shot testing process for a better cyclic one. This is not a restatement of that finding, but a different, independently documented bias, with its separate literature, that happens to bite exactly this post's decision shape.

{{ layer(n=2, type="Fit", id="translate-what-that-bias-do") }}Translate what that bias does to the team from this post's opening, rather than leave it as an abstract citation. Building Cyclic Adaptive Regulation costs {% katex() %}B{% end %} now, a certain, immediate, visible line item an engineering leader has to justify in the current planning cycle. The benefit, avoiding whatever the next correlated-retry regime costs, arrives later, uncertainly. It would show up as an absence, an incident that never happened. That is exactly the kind of outcome this series' opening pages already named as invisible to a team's retrospective accounting.

A present-biased decision-maker does not need to doubt this post's arithmetic to still delay. The arithmetic can be fully accepted and the decision can still tip toward waiting. That is because the bias operates on how heavily the immediate cost is weighted, not on whether the expected-value comparison was done correctly.

{{ layer(n=3, type="Estimate", id="state-what-this-post-s-own") }}What this post's machinery does, and does not do, about that is worth stating directly. Proposition 5 already prices the *rational* value of waiting, the option value genuine uncertainty creates. Present bias is a further, separate discount on top of that, applied by the decision-maker rather than by the underlying economics. Nothing in Definition 5 or Proposition 5 corrects for it, because both assume the standard exponential discounting real options theory is built on.

This post's sensitivity analysis already showed the invest-now verdict survives the entire 5-to-10-percent discount-rate range checked for the heavy and very heavy tails. For the moderate tail, it survives up to roughly 7.5 percent. That is a wide band for a genuine market discount rate in every case. A present-biased team holding a heavy or very heavy tail would need to be applying a *behavioral* discount rate far outside what any rational cost of capital could justify. Only past that point could this post's honest math be blamed for the delay. A team holding the moderate tail, by contrast, has a narrower, still-real gap between a defensible market rate and the point this post's math flips.

A team that has read this section, accepted Proposition 5's arithmetic, and still not acted is demonstrating the bias this post just named, in real time, not disagreeing with anything this post claims. That is either the most convincing possible illustration of Laibson's finding or the least convincing possible excuse for inaction, depending only on which side of the decision the reader is standing on.

## What Would Actually Have to Be True for Waiting to Be Correct

This post has run seven independent checks: sensitivity, game theory, distributed systems, behavioral economics, cybernetics, verification theory, and a Monte Carlo simulation of the stopping problem itself. Every one has landed on the same verdict. Stack the fragility findings from each of those checks together rather than leaving them scattered. The combined picture is more informative than any one of them alone, and a reader is owed the honest worst case, not just the honest best one.

{{ layer(n=3, type="Estimate", id="the-single-most-exposed-com") }}The single most exposed combination this post has actually identified, not a hypothetical one, is the moderate tail specifically: a 15 percent overestimate of the underlying flow flips its verdict, the smallest margin of any row in this post's worked table, per "How Much of This Survives Being Wrong About the Inputs."

Layer a second, independent source of downward bias onto that same row, the Independence-violation risk "The Threshold Is Congruence-Proof Only Where Its Inputs Are" names: a team estimating its own {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %} while also bearing {% katex() %}I{% end %}'s own cost. A 15 percent gap is not a large one to close through nothing more exotic than ordinary motivated optimism. Layer present-biased discounting on top of that, and a team could clear this post's threshold on paper and still not act, for reasons "Three Converging Verdicts Are Not the Same as Three Teams That Act" already named.

None of these three findings individually reverses this post's recommendation. Compounded, in the specific case of a moderate tail estimated by an interested party under ordinary organizational time pressure, they describe exactly the conditions under which a team could be technically correct that Proposition 5's math says invest, and still never act on it. That is the gap this post has been naming since its opening scene, now given a precise, three-part anatomy instead of a single, gestured-at cause.

What does not change, even in that worst case, is worth stating plainly. The heavy and very heavy tail rows do not share the moderate tail's fragility, clearing their thresholds by margins wide enough to absorb all three compounding effects at once and still say invest. A reader whose own running case sits anywhere near this series' heavier tail weights is not the reader this section's warning is really for. The warning is narrower and sharper than "this post's math might be wrong somewhere." It is that the one case where the arithmetic alone is not enough to guarantee action is also, not by coincidence, the case where the underlying risk looked smallest to begin with, exactly the shape congruence takes when it finds a genuine foothold instead of a manufactured one.

## Compute Your Own V*, a Checklist

Every finding above prices this series' running case, using anchors this series already locked. What follows is how a reader prices their own, arrived at three parts and one series' worth of locked anchors later. [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own checklist, "Compute Your Own N*," named a specific exit condition without saying what would replace it: if no reference class exists for {% katex() %}p{% end %}, point-probability reasoning has hit its floor, and that checklist does not apply past that point. This is what replaces it, stripped to the same five-step shape for a reader running it against a real system rather than this post's illustrative numbers.

1. **Confirm the option framing actually applies**, per "The Right, Not the Obligation"'s own falseness condition. If the payoff from building the mechanism is bounded and certain, or if the cost of building it changes depending on when the team acts, stop here; Proposition 5 has nothing to price.
2. **Price {% katex() %}I{% end %}**, the one-time exercise cost, in engineer-hours or an equivalent unit, the same way [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) priced {% katex() %}B{% end %}.
3. **Estimate {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %}** for the specific regime this decision is about, and name, out loud, whether the same team producing these estimates also bears {% katex() %}I{% end %}'s own cost, per the Independence concern this post has already named, before trusting the comparison that follows.
4. **Compute {% katex() %}V = (\lambda E[L] - c_{\text{maint}})/r{% end %}** under the zero-drift simplification, or the full perpetuity-with-growth form if F21's condition applies to your flow.
5. **Solve the characteristic equation for {% katex() %}\beta{% end %}** at your own {% katex() %}\sigma{% end %}, {% katex() %}\mu{% end %}, and {% katex() %}r{% end %}, compute {% katex() %}V^\ast = [\beta/(\beta-1)]I{% end %}, and compare. If {% katex() %}V \geq V^\ast{% end %}, waiting is no longer the cheaper choice, whatever the dashboard has been reading.

This checklist does not remove the judgment calls in steps 2 and 3, the same honesty [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own checklist offered about its steps 2 through 4. It fixes their shape, so what remains is a specific number to defend, not a feeling about whether the question is worth asking.

## Model Scope and Failure Envelope

**Claim.** Proposition 5's threshold correctly times the investment decision.
- *Assumption:* {% katex() %}V{% end %} is read as a clean, instantaneous value, not a belief inferred from delayed telemetry.
- *Failure Mode:* Real telemetry carries the same physical latency floor [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) and [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) already proved, meaning a live implementation compares a stale belief against {% katex() %}V^\ast{% end %}, not {% katex() %}V{% end %} itself, per this post's POMDP treatment above.

**Claim.** {% katex() %}\sigma{% end %}, derived from the regime-shift arrival rate, correctly prices timing uncertainty.
- *Assumption:* A compensated Poisson process at this series' locked arrival rate is well-approximated by Brownian motion.
- *Failure Mode:* At a much higher true arrival rate than this series has locked, the diffusion approximation itself would need re-examining against a jump-diffusion alternative; this post has not run that comparison and does not claim the approximation holds at arbitrary rates.

**Claim.** Modeling {% katex() %}V{% end %} as geometric Brownian motion, with McDonald and Siegel's machinery built on top of it, correctly prices the option to invest.
- *Assumption:* The avoided-cost flow {% katex() %}V{% end %} can grow without an upper limit, the same assumption that lets an ordinary GBM-priced call option's payoff be unbounded.
- *Failure Mode:* A real distributed system's avoided-cost flow cannot exceed what its hardware and network can physically clear, the same capacity asymptote the Universal Scalability Law derives for throughput{{ cite(ref="8", title="Gunther, N.J. (2008) -- A General Theory of Computational Scalability Based on Rational Functions, arXiv:0808.1431") }}; {% katex() %}V{% end %} is therefore a capped, not an uncapped, call option in the strict sense, though this post's {% katex() %}V{% end %} and {% katex() %}V^\ast{% end %} values, in the thousands of engineer-hours, sit far enough below any real fleet's physical ceiling that the cap does not bind anywhere this post actually prices. A team operating close enough to that ceiling for the cap to matter would need a bounded-diffusion or reflected-process variant of Proposition 5, not the unbounded GBM form used here.

**Claim.** The smooth-pasting condition, {% katex() %}W'(V^\ast)=1{% end %}, correctly characterizes the optimal threshold.
- *Assumption:* The process can be treated as approaching {% katex() %}V^\ast{% end %} continuously, the diffusion's property, not as a genuinely discrete arrival that can jump past it.
- *Failure Mode:* Mordecki's results show this assumption is not automatic under jumps; the standard smooth-pasting argument needs real modification to survive contact with a jump process, and this post has not derived what this series' locked severity distribution implies for a jump-process-aware threshold, per Falsification Criterion F28.

**Claim.** {% katex() %}V=(\lambda E[L]-c_{\text{maint}})/r{% end %} correctly prices the benefit of having built Cyclic Adaptive Regulation.
- *Assumption:* Maintenance below or irregular against {% katex() %}c_{\text{maint}}{% end %} degrades the flow smoothly, the same way underpaying any ordinary recurring cost would.
- *Failure Mode:* [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own BBR-tuning history shows real maintenance trades one failure mode for another across revisions, not a smooth degradation; an under-maintained policy can be actively, specifically broken rather than merely cheaper, a risk {% katex() %}V{% end %}'s own linear netting has no term for, per Falsification Criterion F29.

**Claim.** The zero-drift simplification, {% katex() %}\mu = 0{% end %}, does not change the verdict at this series' base rate.
- *Assumption:* The net avoided-cost flow has no strong systematic trend of its own.
- *Failure Mode:* Verified directly, not assumed, and the verdict is not uniformly immune: this post's sensitivity sweep shows the verdict holds for {% katex() %}\mu{% end %} between negative and positive 5 percent a year across all three tail weights at {% katex() %}r=5\%{% end %}, but at {% katex() %}r=8\%{% end %} the moderate tail already needs positive drift to clear its threshold, so this row's failure mode is real for the moderate tail specifically once the discount rate rises, not only for a trend outside the checked range.

**Claim.** The single-agent threshold applies to the team in this post's running case.
- *Assumption:* No peer team's investment decision is observable, and no information spillover exists between teams sharing the same organization.
- *Failure Mode:* Per the multi-team discussion above, a real information spillover between teams would raise, not lower, the rational wait time, meaning this post's {% katex() %}V^\ast{% end %} would then be a lower bound on the true multi-team threshold, not an exact one.

**Claim.** This post's recommendation is robust to reasonable input error and to the discount rate.
- *Assumption:* The moderate tail's margin, 1.15x at {% katex() %}r=5\%{% end %}, is treated the same as the very heavy tail's, 6.38x.
- *Failure Mode:* It is not the same, and this post says so directly above: the moderate-tail verdict flips under a 15 percent overestimate of the underlying flow at the base rate, or under a discount rate at or above roughly 7.5 percent regardless of any input error, while the very-heavy-tail verdict survives a 538 percent overestimate and the entire 5-to-10-percent discount-rate range at once. Applying this post's confidence uniformly across tail weights would misstate exactly the asymmetry Corollary 2 already established.

**Claim.** A real team's own {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %} estimates carry the same evidentiary weight as this post's locked anchors.
- *Assumption:* The party estimating these inputs has no stake in which way the resulting comparison comes out.
- *Failure Mode:* Per the Independence and congruence discussions above, a team that both estimates its inputs and bears {% katex() %}I{% end %}'s own cost violates Independence by construction; this post's worked table is exempt only because its inputs are this series' locked, published anchors, fixed before this post's conclusion was known.

**Reversal Condition.** This post's central recommendation, that this series' running case has already crossed its investment-timing threshold at the series' base rate, reverses in three independent ways. It reverses if the net avoided-cost flow this series has locked, {% katex() %}\lambda \cdot E[L] - c_{\text{maint}}{% end %}, is shown to be overestimated by the margin the row above states for the tail weight actually in force, moderate tails being far more exposed to this reversal than heavy or very heavy ones. It reverses for the moderate tail alone, with no input error required, if the discount rate actually in force is {% katex() %}r \geq 7.5\%{% end %} or the net flow's drift is at or below zero at {% katex() %}r=8\%{% end %}. And it reverses, independent of both the flow estimate and the discount rate, if the option framing itself fails, per "The Right, Not the Obligation"'s own falseness condition: a bounded, certain payoff, or an exercise cost that varies with timing, would mean Definition 5 does not describe this decision at all, and Proposition 5 would have nothing to price.

## Falsification Criteria, Continued

This post continues the series' numbering rather than restarting it, adding ten criteria to the nineteen Parts 1 through 3 already stated: one for each independently-researched extension this post adds on top of Proposition 5's core result. F28 and F29 were added last, after this post's derivation was checked against the jump-diffusion optimal-stopping literature and against [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own maintenance-history evidence respectively.

The ten assertions these criteria test, one line each:

- **F20**, The diffusion approximation is not a reasonable proxy for timing uncertainty
- **F21**, The zero-drift assumption is not innocent
- **F22**, Information spillover does not raise the rational wait time
- **F23**, The ensemble's false-alarm rate does not corrupt a live re-estimate
- **F24**, A fleet-wide version is adequately priced service by service
- **F25**, Present-biased discounting does not explain observed delay
- **F26**, The loop's Requisite-Variety limit does not track Part 3's F12 boundary
- **F27**, A team estimating its inputs does not systematically underweight them
- **F28**, Smooth-pasting survives the jump-versus-creep distinction
- **F29**, Netting {% katex() %}c_{\text{maint}}{% end %} out of the flow adequately prices maintenance risk

<details>
<summary>The ten criteria in full</summary>

**F20 (the diffusion approximation to the arrival process is not a reasonable proxy for timing uncertainty).**
- *Condition:* the regime-shift arrival process is shown to behave in a way a compensated-Poisson-to-Brownian-motion approximation systematically mischaracterizes at this series' locked arrival rate, for instance by exhibiting clustering or serial correlation the memoryless Poisson assumption rules out by construction.
- *If confirmed:* {% katex() %}\sigma{% end %} as this post derives it is the wrong proxy for timing uncertainty, and Proposition 5 would need a jump-diffusion or other point-process-aware real-options formulation instead of the geometric-Brownian-motion form this post uses.

**F21 (the zero-drift assumption is not innocent).**
- *Condition:* the net avoided-cost flow this series has locked is shown to carry a genuine, non-negligible trend outside the negative-5-to-positive-5-percent range this post's sensitivity check already covers, for the heavy or very heavy tail specifically; the moderate tail's sensitivity to drift and to the discount rate is already confirmed above and does not depend on this criterion.
- *If confirmed:* {% katex() %}\mu{% end %} cannot be collapsed to zero, {% katex() %}V{% end %} must be computed from the full perpetuity-with-growth formula, {% katex() %}V=(\lambda E[L]-c_{\text{maint}})/(r-\mu){% end %}, and the invest-now verdict for the heavy and very heavy tails would need rechecking rather than assumed to hold.

**F22 (information spillover between teams does not raise the rational wait time).**
- *Condition:* a fleet of teams, each holding an independent version of Definition 5's option and sharing incident postmortems the way a single organization typically does, is shown not to exhibit a free-rider incentive, or is shown to exhibit Grenadier's preemption dynamic instead despite the absence of a scarce, exclusive resource.
- *If confirmed:* the direction this post names in "What Changes When More Than One Team Holds This Option," that a real spillover effect would only extend the single-agent wait time, not shorten it, would need to be reversed or withdrawn, and Proposition 5's threshold could no longer be treated as a safe lower bound on individual action inside a shared-postmortem organization.

**F23 (the regime-detection ensemble's heavy-tail-dependent false-alarm rate does not corrupt a live re-estimate of the arrival rate).**
- *Condition:* Definition 2's ensemble, at the false-alarm rates [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own F12 already measured, three to twelve percent under a heavy to very heavy tail against a locked light-tailed baseline near zero, is shown not to bias a continuously-updated estimate of {% katex() %}\lambda{% end %} in a live implementation of the loop diagrammed above.
- *If confirmed:* the tension this post names in "Trusting the Signal That Would Trigger a Different Answer," between an already-favorable investment decision and a measurably unreliable trigger signal at exactly the tail weights this series treats as realistic, does not exist in practice, and a live implementation can trust a rising {% katex() %}\lambda{% end %}-estimate without a separate heavy-tail-robustness argument, the same resolution F12 itself was left open to receive.

**F24 (a fleet-wide version of this decision is adequately priced service by service).**
- *Condition:* {% katex() %}B{% end %} is shown not to decompose into a shared, reusable component and a smaller service-specific one, or the compound-option structure named in "A Fleet Version of This Decision Is a Different Formal Object, Not a Bigger One" is shown to add no material value over pricing each service's option independently.
- *If confirmed:* the fleet-scale correction this post names is unnecessary, [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own fleet-amortization point does not extend to this post's object, and a per-service application of Proposition 5 is already the correct fleet-wide answer, and not only a convenient approximation to it.

**F25 (present-biased discounting does not explain observed delay in a decision of this shape).**
- *Condition:* engineering teams facing a decision with this post's structure, a certain, immediate cost against an uncertain, later benefit, are shown not to exhibit present-biased delay beyond what standard exponential discounting at a defensible market rate would already predict.
- *If confirmed:* the behavioral account this post gives for why a team might accept Proposition 5's arithmetic and still not act does not hold, and an observed delay would need a different explanation, organizational friction or genuine disagreement with this post's locked anchors being the two this series has already priced elsewhere.

**F26 (the decision loop's Requisite-Variety limit does not track [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own F12 boundary).**
- *Condition:* a regime shift is shown to register correctly in the loop's own {% katex() %}\lambda{% end %}-estimate at a tail weight, or noise level, where [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own F12 measurement predicts the ensemble should already be struggling, or conversely, the ensemble is shown to fail well inside the range F12 already certified as reliable.
- *If confirmed:* this post's claim that the loop's blind spot is inherited directly from [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own measured limit, not a fresh, separately-estimated one, would need correcting, and the two findings would need to be re-derived as independent rather than the same limit viewed twice.

**F27 (a team estimating its inputs does not systematically underweight them).**
- *Condition:* teams responsible for both producing an estimate of expected regime-shift cost and bearing the immediate cost of acting on that estimate are shown not to exhibit the direction of bias the Independence condition predicts, or are shown to correct for it reliably through existing review processes.
- *If confirmed:* the verification-theory concern this post raises about self-estimated inputs is unfounded in practice, and a reviewer would not need to weight the source of {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %} estimates any differently than any other input to this post's comparison.

**F28 (smooth-pasting survives the jump-versus-creep distinction for this series' severity distribution).**
- *Condition:* the true, discrete-arrival regime-shift process, not its diffusion approximation, is shown to admit an optimal threshold satisfying the ordinary first-order smooth-pasting condition, {% katex() %}W'(V^\ast)=1{% end %}, rather than requiring Mordecki's generalized verification argument or producing a materially different threshold under it, for this series' locked, heavy-tailed severity distribution specifically.
- *If confirmed:* the diffusion approximation this post uses is a convenient proxy for timing uncertainty, the condition F20 already tests, and also a safe stand-in for the boundary condition the entire derivation in "Where the Characteristic Equation Actually Comes From" depends on, closing the gap this post names and does not resolve. If disconfirmed, {% katex() %}V^\ast{% end %} as this post derives it is the wrong threshold, a different failure than being merely an approximate one, and a jump-process-aware re-derivation, following Mordecki's construction rather than McDonald and Siegel's, would be needed before this post's verdict could be trusted at the precision it claims.
- *Partial evidence:* The "Appendix: how far does the threshold move when the process jumps?" inside "Where the Characteristic Equation Actually Comes From" above runs one literal, honestly-labeled jump translation of this post's own {% katex() %}\sigma^2=\lambda{% end %} convention and finds a best candidate, roughly 12 percent below 2,625h, that sits significantly above the closed-form row by about 7.0 paired standard errors, joined by its upper neighbor at 6.9 paired standard errors and, by a seed-dependent margin, its lower neighbor, on a value function that is single-peaked in this specific run. That is evidence toward disconfirmation on the threshold-location question, statistically real at this sample size, without constituting Mordecki's generalized verification argument, and no evidence at all toward the value function's shape, which this run finds ordinary rather than multi-modal.

**F29 (netting {% katex() %}c_{\text{maint}}{% end %} out of the flow adequately prices maintenance risk).**
- *Condition:* a Cyclic Adaptive Regulation policy maintained below its assumed {% katex() %}c_{\text{maint}}{% end %}, or maintained irregularly rather than continuously, is shown to degrade smoothly toward the unmaintained frozen-policy case rather than exhibiting a specific, actively worse failure mode of the kind [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own BBR-tuning history documents across its three major revisions.
- *If confirmed:* the flow-netting treatment {% katex() %}V=(\lambda E[L]-c_{\text{maint}})/r{% end %} adequately prices maintenance risk after all, and the asymmetry this post names between an under-maintained policy and a merely cheaper one does not hold for this series' running case. If disconfirmed, {% katex() %}V{% end %} as this post computes it prices a maintenance-discipline assumption this post has not separately verified, and a team's real, sustained tuning capacity, not only its own {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %} estimates, belongs in the Independence discussion "The Threshold Is Congruence-Proof Only Where Its Inputs Are" already opened.

</details>

<details>
<summary>All twenty-nine falsification criteria in the series</summary>

- **F1**, The regret floor itself, [The Simulation Singularity](@/blog/2026-09-13/index.md)
- **F2**, The regime was actually observable, [The Simulation Singularity](@/blog/2026-09-13/index.md)
- **F3**, Refusing to explore does not compound, [The Simulation Singularity](@/blog/2026-09-13/index.md)
- **F4**, The validation choice was congruence-biased, and it mattered, [The Simulation Singularity](@/blog/2026-09-13/index.md)
- **F5**, Intractability of the dual optimum, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)
- **F6**, Local excitation covers global regime discovery, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)
- **F7**, Heavy-tail sampling limits, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)
- **F8**, Multi-agent coordination necessity, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)
- **F9**, A probability-of-excursion bound also bounds excursion magnitude, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)
- **F10**, The magnitude bound is unnecessary, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F11**, The drain phase never actually fails in practice, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F12**, The ensemble is trustworthy under heavy tails without modification, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F13**, Falling back, not freezing, is the safer single-agent default, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F14**, Mutual freezing is the unique, self-enforcing equilibrium, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F15**, The fleet's tipping point sits somewhere other than a one-in-eight defection fraction, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F16**, Jointly enforcing both bounds costs nothing in practice, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F17**, The joint safety filter never actually loses feasibility in practice, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F18**, The bootstrap window is short enough not to matter, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F19**, The 1/N tail shape is not structurally required, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)
- **F20**, The diffusion approximation is not a reasonable proxy for timing uncertainty, this post
- **F21**, The zero-drift assumption is not innocent, this post
- **F22**, Information spillover does not raise the rational wait time, this post
- **F23**, The ensemble's false-alarm rate does not corrupt a live re-estimate, this post
- **F24**, A fleet-wide version is adequately priced service by service, this post
- **F25**, Present-biased discounting does not explain observed delay, this post
- **F26**, The loop's Requisite-Variety limit does not track Part 3's F12 boundary, this post
- **F27**, A team estimating its inputs does not systematically underweight them, this post
- **F28**, Smooth-pasting survives the jump-versus-creep distinction, this post
- **F29**, Netting {% katex() %}c_{\text{maint}}{% end %} out of the flow adequately prices maintenance risk, this post

</details>

## The Property Verdict Ledger, Continued

**Real Option to Commit to Continuous Probing**

*Formal Proposition:* Definition 5, Real Option to Commit to Continuous Probing, priced by Proposition 5, Investment-Timing Trigger.

*Production Instance:* the platform team introduced at this post's opening, six months past the incident that started this series, having built neither Cyclic Adaptive Regulation nor suffered a second correlated-retry incident, reading its quiet track record as evidence the investment is not yet justified, losing the argument politely to two features with a customer's name already attached rather than to any specific technical objection.

*Exact vs. Approximate:* Layer 1 exact for the characteristic equation and threshold formula, confirmed against McDonald and Siegel's primary source directly rather than a remembered paraphrase, and for the Jensen's-inequality explanation of why that threshold exceeds naive net-present-value reasoning; Layer 2 approximate for renaming the primary source's drift symbol to avoid a three-way collision with [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own {% katex() %}\alpha{% end %}, for treating the regime-shift arrival process as well-approximated by a diffusion, and for the fully-observed idealization named in "The Threshold Assumes a Number Nobody Actually Has in Real Time"; Layer 3 approximate for every specific number in this post's worked table, computed from this series' locked anchors, and for the sensitivity, game-theoretic, and ensemble-trust extensions this post adds on top, this post's constructions layered on top of a cited formal result, not restatements of it.

*Verdict:* the case for building Cyclic Adaptive Regulation is not merely favorable, it has already cleared a threshold stricter than naive breakeven, by a margin this post has now shown grows, not shrinks, as the underlying tail gets heavier. What real options theory adds beyond [The Simulation Singularity](@/blog/2026-09-13/index.md)'s and [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own crossovers is not a different answer, but the answer stated at the precision an uncertain, irreversible investment decision actually requires, and a stated account of exactly which of this post's assumptions that precision still depends on.

That account has a sharp edge, not a blurred one. The single combination this post can name as genuinely fragile is a moderate tail estimated by an interested party under ordinary organizational time pressure, with a defensible discount rate pushed toward the higher end of this post's checked range. That is also the one case where the underlying risk already looked smallest: the same congruence this whole series opened by diagnosing, found here at the layer of the decision to build the fix rather than the layer of trusting the fix once built.

| Discipline | What it contributes | Where it appears above |
|---|---|---|
| Probability and decision theory | Supplies the geometric-Brownian-motion investment-timing model and its characteristic equation, the Jensen's-inequality explanation for why the resulting threshold exceeds naive net-present-value reasoning, and the sensitivity analysis distinguishing which of this post's simplifications are load-bearing for the verdict's direction and which are not | McDonald & Siegel; Definition 5, Proposition 5; "How Much of This Survives Being Wrong About the Inputs"; "Why the Bar Is Higher Than 'Does It Pay for Itself'" |
| Game theory and decision theory | Names the correct category for a multi-team version of this decision, an information-spillover game rather than a scarce-resource preemption contest, states precisely why the published preemption-game literature does not transfer here despite superficially resembling this post's running case, and names the compound-option structure a fleet-wide version of this decision actually has, extending [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own fleet-amortization point one formal layer up | Grenadier; Geske; "What Changes When More Than One Team Holds This Option"; "A Fleet Version of This Decision Is a Different Formal Object, Not a Bigger One" |
| Distributed systems engineering | Names the partially-observable formulation this post's fully-observed model idealizes away, ties the resulting staleness directly to the same physical latency floor [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) and [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) already proved rather than treating it as a fresh concern, and states the margin by which this post's worked table already absorbs that idealization | Kaelbling, Littman & Cassandra; "The Threshold Assumes a Number Nobody Actually Has in Real Time" |
| Control theory and cybernetics | Supplies the regime-detection ensemble whose heavy-tail-dependent false-alarm rate, already measured in [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md), is shown here to bear directly on whether a live, continuously re-estimated version of this post's threshold can trust its input signal | Definition 2, reused from [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md); Falsification Criterion F12, reused from [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md); "Trusting the Signal That Would Trigger a Different Answer" |
| Behavioral economics | Names present-biased discounting as a formally distinct bias from [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own loss-aversion finding, explains why a team can accept this post's arithmetic in full and still delay, and states precisely what this post's machinery does and does not correct for | Laibson; "Three Converging Verdicts Are Not the Same as Three Teams That Act" |
| Cybernetics and verification theory | Names the decision loop's Requisite-Variety limit, tying its blind spot directly to [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own F12 measurement rather than asserting a fresh one, and applies [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own Independence condition to the team producing the loop's inputs, naming a live incentive to underestimate them that has nothing to do with present bias | Ashby, reused from [The Simulation Singularity](@/blog/2026-09-13/index.md); the Shared Ancestor Problem's Independence condition, reused from [The Simulation Singularity](@/blog/2026-09-13/index.md); "The Loop Has to Notice a Regime the Model Itself Has Never Seen" |

Every prior part's ledger row noted that none of its disciplines needed the others to reach its conclusion. This row breaks that pattern in a way worth naming rather than smoothing over. Five of the six disciplines above exist specifically to state a limit on the first's headline result: a mathematical limit on when Proposition 5 applies, a behavioral limit on whether its conclusion gets acted on, or a structural limit on how far the loop enforcing it can actually see. None of the five is there to independently confirm it the way Parts 1 through 3's disciplines mostly did. That is not a weaker form of rigor. A result whose own supporting disciplines spend most of their effort finding its edges, rather than its confirmations, is the more falsifiable of the two shapes. Falsifiability has been this series' standard since [The Simulation Singularity](@/blog/2026-09-13/index.md).

## The Ledger, Assembled

[The Simulation Singularity](@/blog/2026-09-13/index.md) promised this ledger would be assembled in full at the close of the fourth part. Here it is, one row per post, read side by side rather than one part at a time.

| Part | Formal Proposition | Production Instance | Exact vs. Approximate | Verdict |
|---|---|---|---|---|
| Forward Simulation | Proposition 1, the Lai-Robbins regret floor: no uniformly good policy beats logarithmic regret against an unknown, stationary environment, extended to a linear-regret consequence under a regime shift. | A shadow-routing admission-control policy validated cleanly against roughly 180 production-days of history, then met a correlated-retry regime that window had under a one-in-five chance of ever producing, and its queue collapsed on first contact. | Exact for the regret floor over a stationary unknown environment; approximate for extending it to a non-stationary regime shift, this post's reading rather than Lai and Robbins' stated result. | Forward simulation alone carries unbounded exposure the moment the true environment can depart from validated history; it does not price its ignorance, only assumes the ignorance away. |
| Cyclic Adaptive Regulation | Proposition 2, the Feldbaum dual effect: an optimal control action under uncertainty is mathematically forced to regulate and explore at once, an exact result made suboptimal-but-tractable by cyclic probing. | Google's continuous revision of BBR congestion control, from the frozen 2016 model to BBRv3's 2024 deployment, showing a cyclic probing policy needs ongoing tuning against real, non-stationary traffic, not a one-time proof. | Exact for the existence and intractability of the dual effect; approximate for applying persistent-excitation reasoning to isolate heavy-tailed microservice traffic drift. | A cyclic adaptive policy pays the Lai-Robbins exploration cost continuously rather than never, forcing the system to measure its capacity as an ordinary part of operating. |
| Discrete-Time Stochastic CBF with Worst-Case CVaR Extension | Proposition 3, High-Probability Safety Filtration, extended by Corollary 2's Worst-Case CVaR Extension: a probability bound on leaving a declared safe region, plus a magnitude bound on how bad an excursion can get. | The reference admission queue enters a genuinely non-recovering state once traffic exceeds the executor pool's joint ceiling while downstream health is degraded, exactly the excursion whose severity a probability bound alone cannot price. | Exact for the discrete-time probability bound and the worst-case CVaR bound, each as proven in its cited setting; approximate for applying either to an admission-control queue specifically. | A probability-only filter gives a reviewer a boundary to approve once, but under a heavy tail, bounding how often the boundary is crossed is a different, weaker guarantee than bounding how bad a crossing can be, a gap this post's worked comparison shows can span four orders of magnitude. |
| Real Option to Commit to Continuous Probing | Definition 5 and Proposition 5, the Investment-Timing Trigger: the right, not the obligation, to make a one-time investment, priced as a real option on an open-ended, heavy-tailed avoided-cost flow. | The platform team introduced at this post's opening, six months past the incident that started this series, reading a quiet track record as evidence the investment is not yet justified, losing the argument politely to two features with a customer's name attached. | Exact for the characteristic equation and threshold formula, confirmed against McDonald and Siegel's primary source; approximate for every specific number in this post's worked table, computed from this series' locked anchors. | At this series' base discount rate, the case for building Cyclic Adaptive Regulation has already cleared a threshold stricter than naive breakeven for every tail weight checked, though the moderate tail's margin is genuinely fragile to the discount rate in a way the heavier tails are not. |

## The Four Questions This Series Opened With

[The Simulation Singularity](@/blog/2026-09-13/index.md) posed four questions in order and left three of them deliberately open, naming none of the parts that would eventually answer them. They are stated again here, in that same order, and answered each directly, rather than left implicit across four separate posts.

**When does refusing to explore cost more than exploring?** Proposition 1's regret floor answered this first, in expected statistical cost: refusing to explore an unknown, non-stationary environment trades a bounded, logarithmically growing exploration cost for an unbounded, linearly growing one the moment the true environment departs from what was simulated. This post's three-crossover reconciliation, in "Three Crossovers, Not One Restated Three Times" above, confirms the same answer survives translation into engineering-labor cost and option-adjusted present value, three independent formalisms converging on one verdict rather than one number restated three times.

**How do you explore without repeating the exact mistake you are trying to fix?** Proposition 2's dual control answered this: a control action that reads its ordinary operation as a continuous measurement, engineered to never fully agree with its current estimate, rather than a scheduled test shaped to confirm the one regime already suspected. "The Threshold Is Congruence-Proof Only Where Its Inputs Are" above found a residual version of that same mistake in a different place: not in the mechanism [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) already fixed, but in who estimates the inputs a decision like this one runs on.

**How do you let that exploration run without a human reviewing every experiment before it ships?** Proposition 3's discrete-time stochastic control barrier function, extended by Corollary 2's magnitude bound, answered this: a boundary a reviewer approves once, precisely enough to state what it does and does not certify, rather than a policy trusted forever on the strength of a single sign-off. This post's own "Compute Your Own V*" checklist above extends that same reviewer role to a different kind of boundary, drawn in engineer-hours rather than probability, and names exactly the same independence requirement [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) already demanded of a safety boundary.

**Once exploration is safe, exactly when should you stop simulating and start probing?** This post answers that question directly, by name, the one this series has owed since its first page. Proposition 5's threshold, computed from numbers this series had already locked before this post began, gives an answer sharper than a future date: at this series' base discount rate, the threshold has already been crossed under every tail weight this post checked, and has been for a while, a verdict this post has now checked against a Monte Carlo simulation of the actual stopping problem, a game-theoretic multi-team correction, a distributed-systems observability gap, and a documented behavioral bias against acting on it, and found still standing for the heavy and very heavy tails at every discount rate checked. The moderate tail's margin is thinner, and this post says exactly how thin: it flips to wait past roughly 7.5 percent, the one place in this post's whole worked table where the discount rate itself, not merely an input error, is enough to change the answer.

This closes the spine [The Simulation Singularity](@/blog/2026-09-13/index.md) opened when it named three separating moves and left the third one unattempted: separating the two demands in time, [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own answer; separating them by subsystem, [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own answer; and pricing exactly when a separated exploration subsystem is worth invoking at all, the question this post has just answered.

<div class="pull-quote">At this series' base rate, the investment was already overdue before the question was asked, under every tail weight this series has priced.</div>

## How the Pieces Actually Wire Together

Four posts have now handed the platform team a formal object apiece: an ensemble that doubles as a probe, a filter that bounds two different kinds of harm, and a threshold that says when to build the first two at all. Naming each one separately does not show a reviewer where each one actually sits in a running system, which is what the diagram below is for.

Read it as two loops running at two different speeds, not one. The Runtime Loop is [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s and [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own admission-control sidecar, once built, running on every request, in milliseconds. The Planning Loop is this post's Definition 5 and Proposition 5, running on a planning cadence, in quarters. Its only job is to decide whether the Runtime Loop gets built and kept funded at all. The diagram keeps to eight boxes on purpose. Every formal object each one stands for is named in the paragraph underneath it, not crammed into the box itself.

{% mermaid() %}
%%{init: {'theme': 'neutral', 'themeVariables': {'fontSize': '20px'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 70}}}%%
graph LR
  subgraph PLAN["Planning Loop"]
    direction TB
    TELE["Telemetry"]:::leaf
    PROP5{"V vs V*"}:::branch
    GATE{"Build or wait?"}:::branch
    TELE --> PROP5
    PROP5 --> GATE
  end

  subgraph RUNTIME["Runtime Loop"]
    direction TB
    CTRL["Controller"]:::leaf
    QP{"Safety filter"}:::branch
    ADMIT{"Admit?"}:::branch
    DOWN[("Downstream")]:::leaf
    REG["Probe + ensemble"]:::leaf
    CTRL --> QP
    QP --> ADMIT
    ADMIT --> DOWN
    ADMIT == probe ==> REG
    DOWN --> REG
    REG -. belief .-> QP
  end

  GATE -- build --> CTRL
  REG -. lambda-hat .-> TELE

  classDef root fill:none,stroke:#333,stroke-width:3px
  classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px
  classDef branch fill:none,stroke:#ca8a04,stroke-width:2px
  classDef alt fill:none,stroke:#aaa,stroke-width:1.5px,stroke-dasharray:4 4
{% end %}

<figcaption>The complete admission-control sidecar this series built, across all four posts, shown as two loops running at different speeds.</figcaption>

**Read the diagram.** Eight boxes, three of them the amber decision points everything else feeds. Follow the solid edges left to right within each loop, the two dashed edges back across loops, and the one thick edge, the diagram's single genuinely surprising line, where:

- **Telemetry** is the arrival-rate and severity estimate, {% katex() %}\hat\lambda{% end %} and {% katex() %}\hat{E[L]}{% end %}, the Planning Loop's input
- **V vs V*** is Proposition 5, this post's comparison, run once a planning cycle
- **Build or wait?** is the gate that comparison feeds; crossing it is what starts the Runtime Loop
- **Controller** is the nominal policy, proposing accept, throttle, or reject before any safety check runs
- **Safety filter** is Definition 3's probability bound, Definition 4's rate constraint, and Corollary 2's CVaR constraint, jointly enforced in one per-step program, per Proposition 3
- **Admit?** is what that filter's output actually decides, on every single request
- **Downstream** is the dependency the whole loop exists to protect
- **Probe + ensemble** is Definition 2, Cyclic Adaptive Regulation, in both of its stated roles at once: the BBR-style cycle that regulates, and the IMM-style ensemble that turns what it observes into a regime belief

The thick edge is the surprising one: the admission decision itself, not a separate signal, is what feeds `Probe + ensemble`, because [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s whole argument was that a probe built from ordinary regulatory traffic needs no separate channel. The regime belief that edge produces feeds forward twice after that, dashed both times because neither is a hard sequential dependency. One feed goes into `Safety filter` immediately, tuning it at request speed. The other goes into `Telemetry` on a delay, re-estimating the next planning cycle's own {% katex() %}\lambda{% end %}. That second feed is why "Trusting the Signal That Would Trigger a Different Answer" above matters to a decision that otherwise looks purely financial. Independent review, at both loops, does not get its box. It is a property of who is allowed to feed `V vs V*` and approve `Safety filter`'s own boundary, named in "The Threshold Is Congruence-Proof Only Where Its Inputs Are" above rather than drawn as a node here.

Two things this diagram does not show are worth naming rather than leaving for a reader to assume are resolved. It does not show a fleet of these sidecars coordinating with each other, the open question "A Fleet Version of This Decision Is a Different Formal Object, Not a Bigger One" names and declines to answer. And it does not show `Safety filter` failing to find a feasible action at all, the backup-policy gap Chen, Jankovic, Santillo, and Ames's construction addresses and this series has cited but not implemented. A single-sidecar, single-request diagram is the object this series actually built and verified; both extensions stay named as open rather than drawn as solved.

## What This Post Did Not Claim

Every specific number in this post, {% katex() %}\sigma \approx 60{% end %} percent, {% katex() %}V^\ast \approx 2{,}625{% end %} engineer-hours at {% katex() %}r=5\%{% end %}, the 1.15x-to-6.38x margins, is this post's computation from this series' locked anchors, not an independently measured property of any real system. Change the anchors, {% katex() %}p{% end %}, {% katex() %}L{% end %}, {% katex() %}B{% end %}, or {% katex() %}c_{\text{maint}}{% end %}, and every number changes with them. What does not change, and is the actual claim this post stands behind, is the shape: an investment-timing threshold exists, is computable from numbers this series had already locked before this post began, and at this series' base discount rate, that threshold has already been crossed under every tail weight this post checked, with the moderate tail's crossing narrow enough to depend on the discount rate actually in force.

McDonald and Siegel's primary source is not claimed to have been reproduced exactly. This post's reproduction of their stated illustrative parameters gives a trigger multiple of 2.64x against a summarized report of roughly 1.5-to-2x. That is close enough to confirm the characteristic equation and threshold formula are stated correctly. It is not close enough to claim their specific illustrative case has been verified digit for digit. A reader checking this post's derivation against a fuller systematic treatment than one journal article, the capped-option caveat in this post's Model Scope table above included, should reach for Dixit and Pindyck's textbook-length treatment of the same machinery, not merely McDonald and Siegel's paper{{ cite(ref="9", title="Dixit, A.K. & Pindyck, R.S. (1994) -- Investment under Uncertainty, Princeton University Press") }}. This post draws only the single threshold result it needs from a body of work the primary source itself is one early paper within.

The mapping from a rare, discrete regime-shift arrival to a continuously diffusing {% katex() %}V{% end %} is not claimed to be a proof of equivalence. It is a stated modeling choice, checked against one real consistency requirement, that the implied years-to-95-percent-confidence figure reproduces [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own locked 8.2 years, and Falsification Criterion F20 states the condition under which that choice would need replacing.

Nor is the smooth-pasting condition itself claimed to survive that choice automatically. Mordecki's results on optimal stopping for jump processes show the ordinary first-order condition this post's derivation leans on needs real modification once a process can jump past its boundary. This post has not derived what a jump-process-aware version of {% katex() %}V^\ast{% end %} would be for this series' locked severity distribution, the open question Falsification Criterion F28 states.

This post does not answer the question a reader who has seen the phrase "real option" used elsewhere might expect it to answer: when it becomes safe to stop an already-running, already-safe probe and reclaim its overhead. That is a real question, an abandonment or disinvestment option rather than the investment option Definition 5 defines, structurally closer to the literature on when to abandon a producing asset than to McDonald and Siegel's value-of-waiting-to-invest framework this post actually uses.

Nothing in this post's machinery answers it, because Proposition 5's threshold is a trigger for committing an investment not yet made, not a trigger for retiring one already in service, and the two are not the same object priced twice. Naming this distinction once, precisely, at the start of this post was what kept the rest of it from silently answering a different question than the one this series had actually promised.

Nor does this post claim to have resolved the multi-team question it names in "What Changes When More Than One Team Holds This Option," or the ensemble-trust tension it names in "Trusting the Signal That Would Trigger a Different Answer." Both are stated as open, with Falsification Criteria F22 and F23 giving each a testable form, the same discipline this series applied to the multi-agent composition question [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) named and declined rather than forced an answer to.

The Monte Carlo simulation verifying Proposition 5's threshold is not claimed to prove the closed-form solution correct in any formal sense. It is a numerical check, using this post's locked parameters at one starting value of {% katex() %}V{% end %}, that the simulated optimum lands inside the flat region the smooth-pasting condition predicts around the closed-form answer, not a substitute for McDonald and Siegel's analytical proof.

The present-bias account in "Three Converging Verdicts Are Not the Same as Three Teams That Act" is not claimed to be the only reason a team might delay, or even the most common one in practice. It is one specific, formally documented bias this post's machinery does not correct for, offered because Proposition 5 assumes rational exponential discounting throughout and a reader deserves to know exactly where that assumption could fail. Organizational friction, genuine skepticism of this post's anchors, and ordinary competing priorities have not been ruled out as explanations; naming one bias precisely is not a claim that it is the only one at work.

Nor is the Independence concern in "The Loop Has to Notice a Regime the Model Itself Has Never Seen" a claim that any specific team's estimate is biased. It names a structural incentive that exists whenever the estimator and the payer are the same party, independent of whether any particular estimate happens to be accurate, the same distinction [The Simulation Singularity](@/blog/2026-09-13/index.md) drew between a check's construction and any single instance of that check being run honestly.

This post's machinery is the same kind of object every part in this series has been: applied synthesis, not new theorem, the genre [The Simulation Singularity](@/blog/2026-09-13/index.md) names for the whole series, every formal result cited, the composition and the worked checks this post's contribution.

{% cognitive_map(root="The Trigger to Stop Simulating") %}
{
  "intro": "Exploring costs less than not exploring, and a boundary drawn once costs less than review paid forever. What follows prices the one question still open at that point: exactly when the case for building the fix stops being patience and starts being negligence. It also names what survives once three separate ways of checking that answer are run against it.",
  "groups": [
  {"theme": "Framing the Question", "c": "mint", "points": [
    [1, "Pricing When, Not Whether", "This post prices a different question than Parts 1 and 3 each already answered: not whether to explore, and not how safely, but exactly when the case for building the fix flips from patience to negligence, an optimal-stopping problem where the acting is the investment itself."],
    [2, "Investment, Not Disinvestment", "The direction is locked and stated twice on purpose: this is the decision to build a safeguard that does not yet exist, not the decision to retire one that already does; the two are structurally different real-options objects, and this post answers only the first."],
    [3, "A Call Option, Not an Analogy", "A bounded, known premium paid once for an open-ended, heavy-tailed payoff realized only on an uncertain event is the same structural object as a financial call option, not an analogy to one, which is what lets real options theory apply directly rather than decoratively."]
  ]},
  {"theme": "The Formal Machinery and What It Says", "c": "sky", "points": [
    [4, "McDonald-Siegel's Equation, Confirmed", "Proposition 5's characteristic equation and threshold formula are McDonald and Siegel's confirmed result, verified against the primary source text directly and cross-checked against an independent survey, though their specific illustrative multiple was not reproduced closely enough to quote as verified."],
    [5, "Volatility Prices Timing, Not Severity", "Volatility in this post's model prices timing uncertainty about when a regime shift arrives, deliberately kept separate from the severity uncertainty Corollary 2 already prices, derived instead from a diffusion approximation to this series' locked arrival rate. The identification normalizes jump sizes away by construction, a stated convention F20 exists to test, and this post refuses the internal cross-check that would seem to validate it, since reproducing <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a>'s 8.2-year figure verifies only that the arrival rate crossed between posts intact, not that the mapping is right."],
    [6, "Jumps Break Smooth-Pasting", "The smooth-pasting condition the whole threshold rests on assumes the process approaches its boundary continuously, a diffusion's property; Mordecki's results show this needs real modification once the process can jump past the boundary instead, and this post has not derived what its locked severity distribution implies for a jump-process-aware threshold."],
    [7, "Drift Is the Avoided-Cost Flow", "Drift is this series' net avoided-cost flow, not an invented growth rate, and collapses to zero under an explicitly stated, and separately verified, stationarity assumption rather than smuggling a second free parameter into the model."],
    [8, "Every Tail Weight Clears the Bar at the Base Rate", "At this series' base discount rate, 5 percent, every one of <a href=\"/blog/cost-of-knowing-part3-safe-in-probability-not-in-size/\">Safe in Probability, Not in Size</a>'s three tail weights already clears its investment-timing threshold, by margins of 1.15x, 1.93x, and 6.38x, and the heavy and very heavy margins stay above 1.0x across the entire 5-to-10-percent range this post checked."],
    [9, "The Moderate Tail's Fragile Margin", "The moderate tail's margin is the one exception: it is genuinely fragile to an error in the volatility estimate, to relaxing the zero-drift assumption at a higher discount rate, and to the discount rate itself, crossing below 1.0x past roughly 7.5 percent on this series' locked anchors, three separate fragilities the heavier tails do not share."],
    [10, "Jensen's Inequality Raises the Bar", "Jensen's inequality is the direct reason a naive net-present-value breakeven understates this post's option-adjusted threshold, by a factor of roughly 3.5 to 5.5 depending on the discount rate, a direct consequence of the option's convex payoff, not an arbitrary safety margin."]
  ]},
  {"theme": "Testing and Extending the Result", "c": "peach", "points": [
    [11, "Multi-Team: A Spillover Game", "A multi-team version of this decision is not automatically Grenadier's competitive preemption game; this series' running case looks structurally closer to an information-spillover game, which would raise rather than lower the rational wait time, a real but unresolved distinction this post states rather than forces."],
    [12, "V Arrives Through Delayed Telemetry", "This post's threshold assumes V is instantly and fully observable; a live implementation instead observes it through telemetry carrying the same physical latency floor <a href=\"/blog/cost-of-knowing-part2-dual-control-and-the-weaponized-probe/\">Dual Control and the Weaponized Probe</a> and <a href=\"/blog/cost-of-knowing-part3-safe-in-probability-not-in-size/\">Safe in Probability, Not in Size</a> already proved, making the correct formulation a partially observable one this post approximates rather than solves."],
    [13, "The Ensemble's Trigger Isn't Trustworthy Yet", "A live, continuously re-estimated version of this post's trigger would depend on Definition 2's ensemble, whose false-alarm rate <a href=\"/blog/cost-of-knowing-part3-safe-in-probability-not-in-size/\">Safe in Probability, Not in Size</a>'s F12 already showed rises two to three orders of magnitude under a heavy tail, a dependency this post names and leaves open rather than resolves."],
    [14, "Three Crossovers Agree", "This series has now computed three crossovers in three different formalisms, statistical regret, engineering-labor cost, and option-adjusted present value, and all three agree that continuing to do nothing is the expensive choice, a convergence stronger than any one of the three could produce alone."],
    [15, "Fleet-Wide Is a Compound Option", "A fleet-wide version of this decision is a compound option, not M copies of Definition 5's simple option, extending <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a>'s own fleet-amortization point one formal layer up; this post names the correct category and its citation without deriving the fleet-wide threshold itself."],
    [16, "Present Bias Blocks Acting on It", "Accepting this post's arithmetic in full does not predict a team will act on it; present-biased discounting, a formally distinct bias from <a href=\"/blog/cost-of-knowing-part2-dual-control-and-the-weaponized-probe/\">Dual Control and the Weaponized Probe</a>'s own loss-aversion finding, weights the certain, immediate cost of building the mechanism far more heavily than the uncertain, later benefit of having built it, and nothing in Proposition 5 corrects for a bias operating on the decision-maker rather than on the underlying economics."],
    [17, "Monte Carlo Confirms the Threshold, Not the Exact Point", "A Monte Carlo simulation of the actual stopping problem, run independently of the closed-form solution, confirms this post's threshold in the way a shallow, near-flat optimum can be confirmed: the simulated best candidate sits 5 percent below the closed-form V*, with a payoff about 0.15 percent higher, a paired difference of about 1.1 standard errors, at most a tiny edge rather than a real departure from the closed form, still the shallow-plateau signature smooth-pasting predicts rather than a sharp, narrow peak at one exact point."]
  ]},
  {"theme": "Where the Risk Actually Lives", "c": "rose", "points": [
    [18, "Requisite Variety Bounds the Loop", "The decision loop's capacity to notice a regime shift is bounded by Requisite Variety, the same cybernetic law <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a> already used, and its blind spot is not a fresh limitation, it is <a href=\"/blog/cost-of-knowing-part3-safe-in-probability-not-in-size/\">Safe in Probability, Not in Size</a>'s own F12 measurement viewed from a different vantage point."],
    [19, "Self-Estimation Breaks Independence", "A team that both estimates its λ and E[L] and bears the cost of acting on that estimate violates the Independence condition <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a> already named, giving that team a live incentive to underestimate its inputs distinct from present bias."],
    [20, "Congruence Risk Lives in the Inputs", "Proposition 5's formula is not congruent, it returns whatever its inputs produce; this post's congruence risk lives entirely in who supplies those inputs, the same simulator-validated-against-its-own-history shape <a href=\"/blog/cost-of-knowing-part1-the-simulation-singularity/\">The Simulation Singularity</a> diagnosed, recurring one layer further from the original incident."],
    [21, "One Genuinely Fragile Combination", "The one combination this post can actually identify as genuinely fragile, not merely theoretically possible, is a moderate tail, estimated by an interested party, under ordinary organizational time pressure; every heavier tail weight this post checked clears its threshold by a margin wide enough to absorb all three effects compounded and still say invest."],
    [22, "Maintenance Is Lumpy, Not Smooth", "Netting c_maint out of the avoided-cost flow prices maintenance as a smooth, fungible cost; <a href=\"/blog/cost-of-knowing-part2-dual-control-and-the-weaponized-probe/\">Dual Control and the Weaponized Probe</a>'s own BBR-tuning history says real maintenance trades one failure mode for another instead, so an under-maintained policy risks being specifically broken, a different problem than being cheaper, an asymmetry this post's linear formula has no term for."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**Framing the Question**

1. This post prices a different question than Parts 1 and 3 each already answered: not whether to explore, and not how safely, but exactly when the case for building the fix flips from patience to negligence, an optimal-stopping problem where the acting is the investment itself.
2. The direction is locked and stated twice on purpose: this is the decision to build a safeguard that does not yet exist, not the decision to retire one that already does; the two are structurally different real-options objects, and this post answers only the first.
3. A bounded, known premium paid once for an open-ended, heavy-tailed payoff realized only on an uncertain event is the same structural object as a financial call option, not an analogy to one, which is what lets real options theory apply directly rather than decoratively.

**The Formal Machinery and What It Says**

4. Proposition 5's characteristic equation and threshold formula are McDonald and Siegel's confirmed result, verified against the primary source text directly and cross-checked against an independent survey, though their specific illustrative multiple was not reproduced closely enough to quote as verified.
5. Volatility in this post's model prices timing uncertainty about when a regime shift arrives, deliberately kept separate from the severity uncertainty Corollary 2 already prices, derived instead from a diffusion approximation to this series' locked arrival rate. The identification normalizes jump sizes away by construction, a stated convention F20 exists to test, and this post refuses the internal cross-check that would seem to validate it, since reproducing [The Simulation Singularity](@/blog/2026-09-13/index.md)'s 8.2-year figure verifies only that the arrival rate crossed between posts intact, not that the mapping is right.
6. The smooth-pasting condition the whole threshold rests on assumes the process approaches its boundary continuously, a diffusion's property; Mordecki's results show this needs real modification once the process can jump past the boundary instead, and this post has not derived what its locked severity distribution implies for a jump-process-aware threshold.
7. Drift is this series' net avoided-cost flow, not an invented growth rate, and collapses to zero under an explicitly stated, and separately verified, stationarity assumption rather than smuggling a second free parameter into the model.
8. At this series' base discount rate, 5 percent, every one of [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s three tail weights already clears its investment-timing threshold, by margins of 1.15x, 1.93x, and 6.38x, and the heavy and very heavy margins stay above 1.0x across the entire 5-to-10-percent range this post checked.
9. The moderate tail's margin is the one exception: it is genuinely fragile to an error in the volatility estimate, to relaxing the zero-drift assumption at a higher discount rate, and to the discount rate itself, crossing below 1.0x past roughly 7.5 percent on this series' locked anchors, three separate fragilities the heavier tails do not share.
10. Jensen's inequality is the direct reason a naive net-present-value breakeven understates this post's option-adjusted threshold, by a factor of roughly 3.5 to 5.5 depending on the discount rate, a direct consequence of the option's convex payoff, not an arbitrary safety margin.

**Testing and Extending the Result**

11. A multi-team version of this decision is not automatically Grenadier's competitive preemption game; this series' running case looks structurally closer to an information-spillover game, which would raise rather than lower the rational wait time, a real but unresolved distinction this post states rather than forces.
12. This post's threshold assumes {% katex() %}V{% end %} is instantly and fully observable; a live implementation instead observes it through telemetry carrying the same physical latency floor [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) and [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) already proved, making the correct formulation a partially observable one this post approximates rather than solves.
13. A live, continuously re-estimated version of this post's trigger would depend on Definition 2's ensemble, whose false-alarm rate [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s F12 already showed rises two to three orders of magnitude under a heavy tail, a dependency this post names and leaves open rather than resolves.
14. This series has now computed three crossovers in three different formalisms, statistical regret, engineering-labor cost, and option-adjusted present value, and all three agree that continuing to do nothing is the expensive choice, a convergence stronger than any one of the three could produce alone.
15. A fleet-wide version of this decision is a compound option, not {% katex() %}M{% end %} copies of Definition 5's simple option, extending [The Simulation Singularity](@/blog/2026-09-13/index.md)'s own fleet-amortization point one formal layer up; this post names the correct category and its citation without deriving the fleet-wide threshold itself.
16. Accepting this post's arithmetic in full does not predict a team will act on it; present-biased discounting, a formally distinct bias from [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own loss-aversion finding, weights the certain, immediate cost of building the mechanism far more heavily than the uncertain, later benefit of having built it, and nothing in Proposition 5 corrects for a bias operating on the decision-maker rather than on the underlying economics.
17. A Monte Carlo simulation of the actual stopping problem, run independently of the closed-form solution, confirms this post's threshold in the way a shallow, near-flat optimum can be confirmed: the simulated best candidate sits 5 percent below the closed-form {% katex() %}V^\ast{% end %}, with a payoff about 0.15 percent higher, a paired difference of about 1.1 standard errors, at most a tiny edge rather than a real departure from the closed form, still the shallow-plateau signature smooth-pasting predicts rather than a sharp, narrow peak at one exact point.

**Where the Risk Actually Lives**

18. The decision loop's capacity to notice a regime shift is bounded by Requisite Variety, the same cybernetic law [The Simulation Singularity](@/blog/2026-09-13/index.md) already used, and its blind spot is not a fresh limitation, it is [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md)'s own F12 measurement viewed from a different vantage point.
19. A team that both estimates its {% katex() %}\lambda{% end %} and {% katex() %}E[L]{% end %} and bears the cost of acting on that estimate violates the Independence condition [The Simulation Singularity](@/blog/2026-09-13/index.md) already named, giving that team a live incentive to underestimate its inputs distinct from present bias.
20. Proposition 5's formula is not congruent, it returns whatever its inputs produce; this post's congruence risk lives entirely in who supplies those inputs, the same simulator-validated-against-its-own-history shape [The Simulation Singularity](@/blog/2026-09-13/index.md) diagnosed, recurring one layer further from the original incident.
21. The one combination this post can actually identify as genuinely fragile, not merely theoretically possible, is a moderate tail, estimated by an interested party, under ordinary organizational time pressure; every heavier tail weight this post checked clears its threshold by a margin wide enough to absorb all three effects compounded and still say invest.
22. Netting {% katex() %}c_{\text{maint}}{% end %} out of the avoided-cost flow prices maintenance as a smooth, fungible cost; [Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md)'s own BBR-tuning history says real maintenance trades one failure mode for another instead, so an under-maintained policy risks being specifically broken, a different problem than being cheaper, an asymmetry this post's linear formula has no term for.

</details>

**Compute it.** Before treating "we have not built the fix yet" as a neutral, low-cost default, price the alternative the way this post has: take this series' already-locked {% katex() %}p{% end %}, {% katex() %}L{% end %}, {% katex() %}B{% end %}, and {% katex() %}c_{\text{maint}}{% end %}, compute {% katex() %}V{% end %} and {% katex() %}V^\ast{% end %} the way Proposition 5 states, and compare them directly rather than trusting a quiet dashboard to have already answered the question. A team that has never run that comparison is running the identical congruence this series opened with, a track record mistaken for evidence, one level further from the simulator where this series first found it, not exercising caution. A system that has never disagreed with itself started this series looking safe for exactly the same reason a quiet six months looks safe here. Nothing in either one was ever built to notice the difference between agreement and proof, until the arithmetic in this post, or the incident in the first, forced the two apart.

<sup>[1]</sup> McDonald, R. & Siegel, D. (1986). *The Value of Waiting to Invest.* Quarterly Journal of Economics, 101(4), 707-727.

<sup>[2]</sup> Mordecki, E. (1999). *Optimal Stopping for a Diffusion with Jumps.* Finance and Stochastics, 3(2), 227-236.

<sup>[3]</sup> Grenadier, S.R. (2002). *Option Exercise Games: An Application to the Equilibrium Investment Strategies of Firms.* Review of Financial Studies, 15(3), 691-721.

<sup>[4]</sup> Geske, R. (1979). *The Valuation of Compound Options.* Journal of Financial Economics, 7(1), 63-81.

<sup>[5]</sup> Kaelbling, L.P., Littman, M.L. & Cassandra, A.R. (1998). *Planning and Acting in Partially Observable Stochastic Domains.* Artificial Intelligence, 101(1-2), 99-134.

<sup>[6]</sup> Laibson, D. (1997). *Golden Eggs and Hyperbolic Discounting.* Quarterly Journal of Economics, 112(2), 443-478.

<sup>[7]</sup> Ashby, W.R. (1956). *An Introduction to Cybernetics.* Chapman and Hall (Chapter 11, The Law of Requisite Variety).

<sup>[8]</sup> Gunther, N.J. (2008). *A General Theory of Computational Scalability Based on Rational Functions.* arXiv:0808.1431.

<sup>[9]</sup> Dixit, A.K. & Pindyck, R.S. (1994). *Investment under Uncertainty.* Princeton University Press.
