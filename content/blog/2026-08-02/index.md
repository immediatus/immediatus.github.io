+++
authors = ["Yuriy Polyulya"]
title = "The Newsvendor Problem Under a Heavy Tail"
description = "The newsvendor problem is seventy years old, closed-form, and taught in the first weeks of any operations course: cheap to solve right up until the tail gets heavy. This post proves precisely where that seventy-year-old stability ends, then finds the one workload shape where even the correctly-computed answer isn't enough: cost unknowable until completion, no preemption, no horizontal escape. No scheduling algorithm can save it (not a cleverer one, not a centralized one with a perfect view of every node) and this post proves both formally."
date = 2026-08-02
slug = "no-safe-number-part1-blood-oath"
draft = false

[taxonomies]
tags = ["distributed-systems", "queueing-theory", "scheduling", "economics"]
series = ["no-safe-number"]

[extra]
toc = false
series_order = 1
series_title = "Asymptotically Ruined: Capacity Planning Beyond the Light-Tailed Assumption"
series_description = """A capacity number is a bet on which tail you're in, and most of them are placed without checking. This series proves exactly when that bet loses (formally, not anecdotally) then builds what survives the loss: physical-signal backpressure, autonomic control loops that improve from the stress they survive, a multi-resource generalization confirmed by an independent argument from game theory, and a real architectural comparison (decentralized against centralized, staleness traded for a single point of failure) across workloads from a single non-preemptible task to a production disaggregated-serving fleet."""
+++

## The Provisioning Problem

A number nobody has tested and a number that's actually safe look identical. Right up until the day they don't.

Every system that commits to a capacity figure before it knows real demand eventually meets the demand that tests it. That's not bad planning: it's what committing in advance means.

**Case Study: A Pool Sized by What Usually Happens.** Picture a model-serving node running thirty-two concurrent generation slots: fixed by GPU memory, not by choice, since every request in flight needs its own slice of VRAM for its KV cache, and the card only has so much of it. Most traffic is cheap: a classification, a short rewrite, a few hundred tokens, done in under a second. About one call in two thousand is different, an open-ended reasoning trace with no natural stopping point, indistinguishable from the cheap case until it either finishes fast or doesn't. Thirty-two slots handles the ordinary traffic with room to spare. It has for months. Every load test that mattered passed, because every load test ran the traffic that was easy to generate, the ordinary case, repeated.

That's the trap a long tail sets. The rare event's absence from the sample so far isn't evidence it won't happen: only that it hasn't happened *yet*. And when it lands, the gap isn't a modest overrun; it scales with whatever "ordinary" already was. A process whose typical call finishes in milliseconds can have a tail that runs minutes. A process whose typical job takes hours can have a tail that runs days. The units change. The shape (vastly rare, vastly long relative to its own median) doesn't.

On some unremarkable day, three or four reasoning traces land close together. Slots don't get preempted mid-generation: evicting one means discarding its KV cache, and resuming later costs exactly what starting over costs, so nothing pauses the long ones to let the short ones through. Occupancy drifts rather than jumps: a short completion cycles through its slot in under a second, a long reasoning trace holds its slot for minutes, and the pool skews further toward slow traffic than the arriving mix would suggest. Every other node is running the same traffic mix through its own full pool, so there's nowhere to send the overflow. The short, cheap, everyday calls (the actual bulk of the traffic) start queuing behind generations that are each, individually, doing exactly what they were asked to do.

No request was malformed. No bug shipped. The pool filled correctly, one legitimate admission at a time, until nothing else could get in. Call it **provisioning by precedent**: trusting a number because it has always worked, which is exactly the property that stops being informative the day the traffic finally tests the assumption underneath it.

Provisioning by precedent is what happens when nobody runs the actual computation. That computation has a name and a complete, textbook answer: the **newsvendor problem** {{ cite(ref="1", title="Arrow, K.J., Harris, T. & Marschak, J. (1951) — Optimal Inventory Policy") }}: seventy years old, closed-form, taught in the first weeks of any operations course. Given a demand distribution {% katex() %}F{% end %}, choose a capacity {% katex() %}Q{% end %} that balances two costs: underage {% katex() %}C_u{% end %} (provisioning too little) against overage {% katex() %}C_o{% end %} (provisioning too much). The optimal {% katex() %}Q^*{% end %} is a single closed-form quantile:

{% katex(block=true) %}
Q^* = F^{-1}\!\left(\frac{C_u}{C_u + C_o}\right)
{% end %}

where:

* {% katex() %}Q^*{% end %} - the optimal capacity to provision
* {% katex() %}F{% end %} - the true demand distribution, with inverse (quantile function) {% katex() %}F^{-1}{% end %}
* {% katex() %}C_u{% end %} - the underage cost of one unit of unmet demand
* {% katex() %}C_o{% end %} - the overage cost of one unit of unused capacity

The folklore version stops there: compute {% katex() %}Q^*{% end %}, deploy it, remeasure occasionally, done. That version is wrong, not everywhere, but for a specific, checkable, unremarkable-looking class of demand. The 32-slot pool above is exactly what the failure looks like when it arrives. Proposition 0, below, proves precisely where the stability the folklore version leans on stops holding.

<details class="proof">
<summary>Mathematical proof: how the fractile formula actually falls out</summary>

Arrow, Harris & Marschak's derivation is a single first-order condition, not a black box worth taking on faith. Expected total cost at capacity {% katex() %}Q{% end %} is {% katex() %}C_u \cdot E[(D-Q)^+] + C_o \cdot E[(Q-D)^+]{% end %}, where {% katex() %}D{% end %} is the random demand. Differentiate with respect to {% katex() %}Q{% end %} and set the result to zero:

{% katex(block=true) %}
-C_u \cdot (1 - F(Q)) + C_o \cdot F(Q) = 0 \;\Longrightarrow\; F(Q) \cdot (C_u + C_o) = C_u \;\Longrightarrow\; F(Q^*) = \frac{C_u}{C_u + C_o}
{% end %}

Inverting {% katex() %}F{% end %} gives the formula above. The whole result rests on one property of {% katex() %}F{% end %}: the second derivative of expected cost is {% katex() %}(C_u+C_o) \cdot f(Q) \geq 0{% end %} wherever a density {% katex() %}f{% end %} exists, so expected cost is convex and the first-order condition characterizes an actual minimum, not just a critical point. That's true for essentially any demand distribution encountered in practice, light- or heavy-tailed alike.

</details>

**The formula itself never assumed light tails.** What breaks under heavy tails, per Proposition 0, isn't this derivation. It's the habit of plugging in an {% katex() %}F{% end %} estimated from a finite sample as if it were the true one.

<span id="def-0"></span>

<details>
<summary>Definition 0 -- The Provisioning Achievable Region: every capacity choice is a point in a two-cost tradeoff space, and only one point is optimal for a given cost ratio</summary>

**Definition 0** (Provisioning Achievable Region). Given a true demand distribution {% katex() %}F{% end %}, every choice of capacity {% katex() %}Q{% end %} maps to a point {% katex() %}(E[\text{underage} \mid Q, F],\ E[\text{overage} \mid Q, F]){% end %}. The expected cost of provisioning too little, and the expected cost of provisioning too much, at that {% katex() %}Q{% end %}. Varying {% katex() %}Q{% end %} traces a Pareto frontier: lowering {% katex() %}Q{% end %} decreases expected overage cost and increases expected underage cost, and no choice of {% katex() %}Q{% end %} improves one without worsening the other. Given a fixed cost ratio {% katex() %}C_u/C_o{% end %}, exactly one point on that frontier minimizes the weighted objective {% katex() %}C_u \cdot E[\text{underage}] + C_o \cdot E[\text{overage}]{% end %}. That point is {% katex() %}Q^*{% end %}, the critical fractile.

</details>

> **Physical translation.** This is the actual object the newsvendor formula is computing a point on, not just a formula in isolation. There's a whole curve of feasible tradeoffs between under-provisioning and over-provisioning, and {% katex() %}Q^*{% end %} isn't "the answer" in the abstract: it's the specific point on that curve that matches how much you actually care about each kind of failure, expressed as a ratio.

<div style="margin:1.5em 0;">
<canvas id="graph-achievable-region" aria-label="A curve in a plane with expected cost of provisioning too little on the horizontal axis and expected cost of provisioning too much on the vertical axis. Every point on the curve is reachable by some choice of capacity. Q-star is marked where the curve's tradeoff rate matches a four-to-one cost ratio. A second point further down the same curve is marked to show it is equally reachable, on the same frontier, but costs more overall at that same ratio: the wrong point on the curve, not an unreachable one." style="width:100%; aspect-ratio:700/400; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<script>
(function(){
var cv=document.getElementById('graph-achievable-region');
if(!cv)return;
var ctx=cv.getContext('2d');
var W,H;
var SCALE=20;
var CU=4,CO=1;
function underage(Q){return SCALE*Math.exp(-Q/SCALE);}
function overage(Q){return Q-SCALE+SCALE*Math.exp(-Q/SCALE);}
function weighted(Q){return CU*underage(Q)+CO*overage(Q);}
function setup(){var r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;ctx.scale(d,d);W=r.width;H=r.height;}
function draw(){
ctx.clearRect(0,0,W,H);
var fg='#333',grid='#eee',sub='#777';
var PL=58,PR=24,PT=40,PB=48,AW=W-PL-PR,AH=H-PT-PB;
var XMAX=21,YMAX=35;
function SX(u){return PL+(u/XMAX)*AW;}
function SY(o){return PT+AH-(Math.min(o,YMAX)/YMAX)*AH;}
ctx.fillStyle=fg;ctx.font='bold 13px sans-serif';ctx.textAlign='center';
ctx.fillText('Every Point on This Curve Is Reachable. Only One Is Worth It.',W/2,18);
var i,x,y;
for(i=0;i<=XMAX;i+=5){x=SX(i);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,PT);ctx.lineTo(x,PT+AH);ctx.stroke();ctx.fillStyle=sub;ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(i,x,PT+AH+14);}
for(i=0;i<=YMAX;i+=5){y=SY(i);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PL,y);ctx.lineTo(PL+AW,y);ctx.stroke();ctx.fillStyle=sub;ctx.font='10px sans-serif';ctx.textAlign='right';ctx.fillText(i,PL-6,y+3);}
ctx.strokeStyle=sub;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PL,PT+AH);ctx.lineTo(PL+AW,PT+AH);ctx.moveTo(PL,PT);ctx.lineTo(PL,PT+AH);ctx.stroke();
ctx.fillStyle=sub;ctx.font='11px sans-serif';ctx.textAlign='center';
ctx.fillText('cost of provisioning too little (underage)',PL+AW/2,PT+AH+32);
ctx.save();ctx.translate(16,PT+AH/2);ctx.rotate(-Math.PI/2);ctx.fillText('cost of provisioning too much (overage)',0,0);ctx.restore();
ctx.strokeStyle='#2980b9';ctx.lineWidth=2;ctx.beginPath();
var Q,first=true;
for(Q=0;Q<=120;Q+=1){var u=underage(Q),o=overage(Q);if(o>YMAX)break;var px=SX(u),py=SY(o);if(first){ctx.moveTo(px,py);first=false;}else{ctx.lineTo(px,py);}}
ctx.stroke();
var ratio=CU/(CU+CO);
var Qstar=-SCALE*Math.log(1-ratio);
var uStar=underage(Qstar),oStar=overage(Qstar);
var Qdom=Qstar-20,uDom=underage(Qdom),oDom=overage(Qdom);
function point(u,o,color,r){var px=SX(u),py=SY(o);ctx.fillStyle=color;ctx.beginPath();ctx.arc(px,py,r,0,6.2832);ctx.fill();return [px,py];}
var pDom=point(uDom,oDom,'#c0392b',5);
ctx.fillStyle='#c0392b';ctx.font='bold 11px sans-serif';ctx.textAlign='left';
ctx.fillText('reachable, but worse here',pDom[0]+8,pDom[1]-6);
ctx.fillStyle='#c0392b';ctx.font='10px sans-serif';
ctx.fillText('total cost 46.5 at this ratio',pDom[0]+8,pDom[1]+10);
var pStar=point(uStar,oStar,'#27ae60',6);
ctx.fillStyle='#27ae60';ctx.font='bold 11px sans-serif';ctx.textAlign='left';
ctx.fillText('Q*: optimal for a 4:1 ratio',pStar[0]+8,pStar[1]-6);
ctx.fillStyle='#27ae60';ctx.font='10px sans-serif';
ctx.fillText('total cost 32.2 at this ratio',pStar[0]+8,pStar[1]+10);
}
if('IntersectionObserver' in window){
new IntersectionObserver(function(es,ob){if(es[0].isIntersecting){ob.disconnect();setup();draw();}},{threshold:0.2}).observe(cv);
}else{setup();draw();}
window.addEventListener('resize',function(){setup();draw();});
})();
</script>
<figcaption>The blue curve is every capacity choice's cost, traced as {% katex() %}Q{% end %} sweeps from 0 to large: each point is a reachable {% katex() %}(\text{underage cost}, \text{overage cost}){% end %} pair. For an underage-to-overage cost ratio of 4:1, {% katex() %}Q^*{% end %} (green) is the one point on the curve where its local tradeoff rate matches that ratio, giving the lowest weighted total cost: 32.2. A point further down the same curve (red) is equally reachable but costs 46.5 at this same ratio: not unreachable, just the wrong point on the curve for what you actually care about.</figcaption>
</div>

The chart above uses a single, simple exponential demand to show what an achievable region *is*, in general, and what it means to be at the wrong point on it. Definition 0 holds for any {% katex() %}F{% end %}, so a clean illustrative distribution is enough there. What follows is a different, sharper exercise: not one distribution's frontier, but a real comparison between two, built to make Proposition 0's dominance claim checkable rather than merely plausible.

> **Trace example A. The capacity number.** This example runs on illustrative units ({% katex() %}x_m=5{% end %}), deliberately not the case study's own seconds. It exists to make Proposition 0's dominance claim checkable in isolation, before Trace Example B (below) applies the same machinery to the case study's real numbers.

**Proposition 0's claim, made concrete rather than asserted.** Let the true demand be Pareto-distributed: {% katex() %}F(x) = 1-(x_m/x)^\alpha{% end %} for {% katex() %}x \geq x_m{% end %}, with {% katex() %}x_m=5{% end %}, {% katex() %}\alpha=2.2{% end %}, a real heavy tail, not an exotic one, with finite mean {% katex() %}E[D] = \alpha x_m/(\alpha-1) = 9.17{% end %}. An operator who has only ever seen the ordinary case fits a light-tailed exponential model instead, using the *correct* mean, the most generous version of the mistake possible, since even a perfectly-estimated mean doesn't save you if the shape is wrong. At a 999:1 underage-to-overage cost ratio {% katex() %}r = C_u/(C_u+C_o) = 0.999{% end %}, the same asymmetry that made the case study's outage expensive, where a sedimented pool refusing every admission cost far more than one idle slot ever would. The correctly-specified Pareto model gives {% katex() %}Q^*_{\text{true}} = x_m(1-r)^{-1/\alpha}{% end %} = **115.5**. The exponential model, same mean, same ratio, gives only {% katex() %}Q_{\text{wrong}} = -E[D]\ln(1-r){% end %} = **63.3**, a 45% capacity shortfall from the shape mistake alone. Evaluating {% katex() %}Q_{\text{wrong}}{% end %} against the *true* Pareto cost function, using the Pareto mean-residual-life identity {% katex() %}E[(D-Q)^+] = x_m^\alpha Q^{1-\alpha}/(\alpha-1){% end %} for the underage term, gives a weighted cost **24.5%** higher than {% katex() %}Q^*_{\text{true}}{% end %} achieves. {% katex() %}Q_{\text{wrong}}{% end %} sits exactly on the frontier for the exponential world it was computed against. On the frontier of the real one it's still a reachable point, just the wrong one for this ratio: the 24.5% figure above is exactly the price of sitting at that wrong point instead of {% katex() %}Q^*_{\text{true}}{% end %}. That is Proposition 0's dominance claim, verified with numbers, not asserted.

| Quantity | Value | What it means |
| :--- | :--- | :--- |
| {% katex() %}E[D]{% end %} | 9.17 | the true mean, used identically by both models |
| {% katex() %}Q^*_{\text{true}}{% end %} | 115.5 | optimal capacity under the correctly-specified Pareto |
| {% katex() %}Q_{\text{wrong}}{% end %} | 63.3 | optimal capacity under the misspecified exponential, same mean |
| Capacity shortfall | 45% | how much smaller the wrong answer is |
| Weighted-cost overpayment | 24.5% | the actual price of the shape mistake, evaluated against the true cost function |

*The measured cost of fitting an exponential to Pareto-distributed demand: a 45% capacity shortfall and a 24.5% weighted-cost overpayment against the true optimum.*

Exponential isn't the wrong model here because light-tailed workloads are always exponential: they aren't. It's chosen because it's the maximum-entropy distribution on {% katex() %}[0,\infty){% end %} given only a known mean: the least additional structure assumable beyond "I know the average." An operator who correctly measures the mean and adds no further assumption defaults, whether they realize it or not, to exactly this distribution. That's why using the *correct* mean above is the most generous version of the mistake, not a strawman. The failure isn't sloppy estimation. It's that the single most information-conservative distribution consistent with what was actually measured is still the wrong one, whenever what's measured is a mean and nothing about the shape.

Scheduling has its own version of the same problem, one layer down. Not how much capacity to provision, but which arriving *units of work* to admit into a shared, finite pool, when each unit's true cost (how long it will actually run) is unknown until it finishes or reveals itself in flight. Where the newsvendor problem asks "how much capacity," this version asks "admit or hold," repeatedly, under the same underage/overage cost structure. It inherits every fragility Proposition 0 proves for the parent problem, plus a second one: **a capacity number can be recomputed after a bad day. A concurrency pool cannot un-admit a task already running inside it.**

<span id="prop-0"></span>

<details>
<summary>Proposition 0 -- Fragility of Misspecified Capacity Targets: a correct answer exists under heavy tails, but not the one most operators compute</summary>

**Proposition 0** (Fragility of Misspecified Capacity Targets). Das, Dhara & Natarajan {{ cite(ref="2", title="Das, B., Dhara, A. & Natarajan, K. (2021) — On the Heavy-Tail Behavior of the Distributionally Robust Newsvendor") }} prove that a distributionally-robust order quantity (computed explicitly against a heavy-tailed ambiguity set rather than an assumed-light-tailed demand curve) is itself heavy-tail-optimal. A correct answer exists; the fractile concept is not broken. What their results show instead is where the fragility actually lives: an order quantity optimized under a *misspecified* light-tailed assumption degrades sharply once the true demand carries even a modest heavy-tailed contamination, and computing the correct robust alternative requires exactly the moment information (tail index, higher moments) that is hardest to estimate reliably from finite historical data.

</details>

> **Physical translation.** The fractile formula was never the problem. Given the *true* demand distribution, {% katex() %}Q^*{% end %}'s closed form is exactly correct, heavy tail or not: the formula doesn't care how demand is shaped. What breaks is a specific, ordinary, easy-to-miss habit: fitting a light-tailed family to historical data because it's the default, without checking whether the tail was estimated or merely assumed. That habit costs nothing when the assumption happens to be right. Proposition 0 makes precise how much it costs when it's wrong, not a vague "instability," a specific, checkable overpayment, computed below against this post's own numbers.

*How the robust order quantity is actually built.* Das, Dhara & Natarajan don't estimate a single demand distribution and hedge around it. They define an ambiguity set: every distribution consistent with a small amount of known information, the mean and one higher moment tied to tail weight, and solve for the order quantity that minimizes the *worst-case* expected cost over that entire set: a minimax problem, not a point estimate. Their result is what makes this post's claim precise: the distribution that actually realizes the worst case inside that ambiguity set is regularly varying, heavy-tailed, and the minimax-optimal quantity coincides exactly with the classical fractile computed *against that worst-case distribution*. The robust method isn't a hedge against heavy tails as one risk among many. It's provably defending against exactly the heavy-tailed case, which is why a quantity built to survive the worst case in the ambiguity set is automatically heavy-tail-optimal, not heavy-tail-robust as a separate property bolted on.

That's a narrower, more defensible claim than "fractiles are unstable under heavy tails," and Definition 0 makes it precise. A capacity computed under a misspecified light-tailed {% katex() %}F'{% end %} isn't merely unstable: it fails to minimize {% katex() %}C_u \cdot E[\text{underage} \mid F] + C_o \cdot E[\text{overage} \mid F]{% end %}, the operator's actual weighted objective evaluated against the true distribution {% katex() %}F{% end %}, even while sitting exactly on the frontier for the distribution it was mistakenly computed against. It's Pareto-efficient for a world that doesn't exist, and merely the wrong point on the frontier for the one that does: efficient for a preference weighting nobody actually holds. The classical solution most operators actually compute (a fractile fit to recent observed demand, under an implicit light-tailed assumption nobody examined) is a light-tailed guess wearing the robust answer's clothing. The two only look the same until the tail event the guess was never built for.

**Back to the pool from the opening.** Its 32 generation slots are exactly {% katex() %}Q{% end %}: a capacity number, computed once, from a demand distribution nobody re-examined for tail weight. The generation-length cost that produced the pileup is heavy-tailed: dominated by rare, long reasoning traces, not the millisecond-short-completion case the pool was sized against. {% katex() %}Q{% end %} was computed correctly, against the distribution that existed the day it was set. The pool filling until nothing else could get in isn't a separate incident from Proposition 0. It's the theorem, watched happen: a capacity number, misspecified against a tail nobody measured, failing in exactly the expensive direction the theorem predicts.

## Where the Scheduling Version Gets Strictly Harder

The capacity version can always be fixed after the fact: remeasure {% katex() %}F{% end %}, recompute {% katex() %}Q^*{% end %}, redeploy. The scheduling version can't. Once a long generation is admitted into a slot, nothing in the story just told takes that slot back. Recomputing {% katex() %}Q{% end %} more carefully, or picking a better fractile, doesn't touch that: the binding constraint isn't the capacity number anymore, it's a structurally different one sitting downstream of it. This is the {% term(url="@/blog/2025-12-27/index.md#the-constraint-sequence-framework", def="A candidate constraint cannot be resolved by re-optimizing at the level of abstraction that revealed it; the dependency graph determines which constraint must be secured before the next one becomes binding") %}Constraint Sequence Framework{% end %}'s core invariant, not a narrative complication: you cannot solve a downstream constraint by working harder on the upstream one that exposed it. Whether that downstream constraint is fixable at all, and what secures it if a better {% katex() %}Q^*{% end %} can't, is the question the rest of this post answers formally.

> **Physical translation.** A capacity number lives at the level of "how many," and every failure at that level has the same fix: measure again, recompute, redeploy. A running task lives at a different level entirely ("which one, right now, holding what") and no amount of skill at the first level reaches the second. An operator who responds to a sedimented pool by tuning {% katex() %}Q^*{% end %} again, more carefully this time, isn't wrong about the math. They're solving the wrong layer's problem: the way re-tuning a thermostat does nothing for a stuck valve.

<span id="def-1"></span>

<details>
<summary>Definition 1 -- The Blood Oath Constraint: a workload that denies visibility, denies preemption, and denies horizontal escape simultaneously</summary>

**Definition 1** (Blood Oath Constraint). A workload exhibits the Blood Oath Constraint when three properties hold simultaneously:

1. **Ingress blindness.** Task cost (its true execution duration) is unknown at admission and remains formally unknown until the task completes. What is available in-flight is not a fact but a probabilistic signal. Because task duration is Pareto-shaped, a single, genuinely heavy-tailed population rather than a mixture (Model Scope, below, checks that assumption), a task's expected remaining duration grows, not shrinks, the longer it has already run: a decreasing-hazard-rate property real for this specific shape, not a property every heavy-tailed distribution shares automatically. This is established for exactly this kind of workload by Harchol-Balter & Downey {{ cite(ref="3", title="Harchol-Balter, M. & Downey, A. (1997) — Exploiting Process Lifetime Distributions for Dynamic Load Balancing") }}, who showed UNIX process lifetimes are Pareto-distributed and that elapsed runtime alone predicts remaining runtime well enough to schedule on, without ever needing a job's true size in advance. Elapsed time is therefore an increasingly reliable, never certain, heavy-task signal, a physical quantity a system can act on directly, unlike the true cost itself, which stays unknown until completion (acting on it means adjusting the task's resource-accounting class for the system's own capacity math, not touching the task itself, which Property 2 already rules out).
2. **Execution immortality.** Once admitted, a task cannot be preempted, yielded, or retried. It runs to completion or the node dies with it.
3. **Locality lock.** The workload requires shared-memory cache locality, which forecloses the standard escape hatch of horizontal sharding: you cannot route the problem away from a single node's boundary. In the case study's own terms: a generation's KV cache lives in the accelerator's own high-bandwidth memory, built incrementally, one token at a time, as the reasoning trace grows. Moving it means moving the entire accumulated cache across a network link that is, categorically, slower than the memory bus that built it. That's true for standard networking, and true in kind even as RDMA and CXL memory-pooling fabrics narrow the bandwidth gap for tightly-coupled intra-rack configurations, since moving accumulated state across any inter-device link costs strictly more than never having moved it at all. That relocation cost grows with the same elapsed time that made the task worth relocating in the first place. Horizontal sharding is the standard answer to "one node is out of room" precisely because most workloads carry no state worth the move: a stateless request retried against a different replica costs nothing beyond the retry itself. A Blood Oath task inverts that economics by construction. The longer it runs, the more expensive relocating it becomes, at exactly the moment its duration would make relocation most tempting. This describes a real, non-empty category of systems, genuinely locked to a single node's memory bus with no swap or checkpoint infrastructure behind it. It's the category this series is built around, not a claim that every LLM-serving deployment necessarily works this way. Real serving engines increasingly ship infrastructure specifically to make mid-generation relocation survivable rather than catastrophic, swapping paged KV-cache blocks to host memory or recomputing them on resumption {{ cite(ref="4", title="Kwon, W., Li, Z., Zhuang, S., Sheng, Y., Zheng, L., Yu, C.H., Gonzalez, J.E., Zhang, H. & Stoica, I. (2023) — Efficient Memory Management for Large Language Model Serving with PagedAttention") }}, at a real, non-trivial cost, but a finite one, not the effectively-infinite one property 3 describes. A workload running on that kind of infrastructure isn't Blood Oath, and the two shouldn't be priced with the same formula: relocation that costs real money is a fundamentally different economic object than relocation that's ruled out by construction.

Any one of these alone is a familiar, solvable scheduling problem. Together, they remove every lever a scheduler normally has. No admission control on cost: you don't know it, and won't until completion. No correcting a bad admission after the fact: nothing can be evicted. No spreading the risk across more machines: the data doesn't move. *"Immortal task" is this post's own term for property 2, it doesn't appear in the scheduling literature under that name; the formal name for the underlying model is non-clairvoyant, non-preemptive scheduling, addressed directly below.*

A natural follow-up: if locality lock somehow didn't hold (if the KV cache could move for free) would spreading the same traffic across more nodes fix the sedimentation problem? No, and it's worth showing why rather than asserting it. The heavy-occupancy fraction, {% katex() %}p/(1-p) \cdot (W_h/W_l){% end %} normalized to a share, where {% katex() %}p{% end %} is the fraction of arrivals that are heavy and {% katex() %}W_h, W_l{% end %} their respective mean holding times, the same Little's-Law occupancy ratio this post computes with real numbers later in this section, has no arrival-rate term in it at all. Double the number of nodes while splitting the identical traffic mix proportionally across them, and every node still faces the same {% katex() %}p{% end %}, the same {% katex() %}W_h{% end %}, the same {% katex() %}W_l{% end %}. That's the same expected occupancy fraction, independently, on every single node. Horizontal scaling multiplies the number of pools sedimenting to roughly 23% heavy occupancy. It doesn't reduce that 23% on any one of them. This is the quantitative version of what property 3 already rules out by fiat: even in a hypothetical world where locality lock didn't hold, adding capacity in the wrong shape (more nodes, same per-node traffic ratio) isn't the same lever as adding capacity in the right shape (more slots per node, fewer heavy tasks per node). Blood Oath's fragility lives specifically in the second shape, the one horizontal scaling never touches.

</details>

**What Harchol-Balter & Downey actually measured.** The decreasing-hazard-rate claim in property 1 isn't a theoretical convenience: it's an empirical finding about real systems. Their study analyzed UNIX process lifetime traces across multiple production and workstation environments and found the lifetime distribution consistently follows a Pareto shape, not the exponential shape classical M/M/1-style queueing models assume by default. The consequence is exactly the property Definition 1 leans on: because the distribution is heavy-tailed, a process's *expected remaining* lifetime, given it's survived this long, grows rather than shrinks with elapsed time, the opposite of the memoryless behavior an exponential assumption predicts. That's what makes scheduling policies favoring freshly-arrived work over long-running work provably better under real process-lifetime data than policies treating every running task as equally likely to finish soon, the same asymmetry Definition 1b's crossover time formalizes below. It's also why shortest-remaining-processing-time-style intuitions generalize so well from the classical, fully-clairvoyant literature to a world with no true job sizes at all. SRPT wants to run whatever finishes soonest, and under a decreasing-hazard-rate distribution, elapsed time alone already tells you which class a task is drawing from, even with the actual remaining time still unknown. The intuition survives losing clairvoyance because the *ranking* it needs (which task is more likely to finish first) doesn't require the exact number, only the direction the posterior is moving. Property 1 hands it that for free.

**Worth being precise about what a 1997 measurement can and can't carry into a 2026 claim.** Harchol-Balter & Downey measured UNIX process lifetimes: a different generative mechanism entirely from autoregressive token generation. The shape matching doesn't, by itself, mean the underlying cause matches. What the citation actually earns is the general scheduling argument: for *any* decreasing-hazard-rate distribution, however it arises, elapsed time predicts remaining time well enough to schedule on, and that argument doesn't depend on the domain the distribution came from. It doesn't, on its own, earn the empirical claim that LLM reasoning-trace duration specifically is heavy-tailed. That claim needs its own, more recent evidence, and it exists. A 2025 study fitting extreme value theory directly to LLM response lengths, across 14,301 real completions from GPT-4o and cross-validated against Qwen and DeepSeek, found response-length tails follow a Weibull-type generalized extreme value distribution, heavier under stochastic decoding {{ cite(ref="5", title="Jiao, L., Gao, C., Yang, Y., Zhou, C., Huang, Y., Chen, X. & Li, Y. (2025) — Analyzing and Modeling LLM Response Lengths with Extreme Value Theory: Anchoring Effects and Hybrid Distributions") }}. Worth being exact about what that does and doesn't confirm: Weibull-type is the *bounded* domain in extreme value theory, a finite upper endpoint, not the unbounded Fréchet-type domain an unbounded Pareto tail belongs to. It doesn't independently confirm this series' own untruncated Pareto{% katex() %}(x_m, \alpha){% end %} as the exactly-correct functional form. It does independently confirm, from real, model-diverse 2025 data rather than a 1997 analogy, that LLM response lengths are genuinely heavy-tailed and that a bounded ceiling is the empirically right way to model where that tail actually ends, not an untruncated one. The two findings, reached independently, point the same direction.

| Property removed | What it normally lets a scheduler do | Why Blood Oath removes it |
| :--- | :--- | :--- |
| Admission control on cost | Reject expensive work before it starts | Cost is unknown until completion (property 1) |
| Mid-flight correction | Kill or reschedule a bad admission | Nothing can be preempted or evicted (property 2) |
| Horizontal escape | Shard risk across more machines | Shared-memory locality forecloses sharding (property 3) |

*The three scheduling levers Blood Oath removes simultaneously, and which of Definition 1's three properties removes each one.*

> **Physical translation.** Most scheduling problems give you one axis to pull: reject expensive work at the door, kill it mid-flight if it turns out expensive, or shard it away from anything else that matters. The Blood Oath Constraint is what's left when a workload takes all three axes off the table at once, not a harder version of a normal scheduling problem, but a different problem that looks identical from the outside.

*Watch out for*: treating two-out-of-three as most of the way there. It isn't: the three properties don't degrade the achievable region additively, they intersect it. A workload with ingress blindness and locality lock, but where preemption *is* available, still has an escape hatch: evict the task that turns out heavy, eat the sunk cost, let something else through. A workload with ingress blindness and non-preemption, but where sharding *is* available, still has an escape hatch: spread the risk thin enough that no single node's pool sediments even if some of them do. Removing any two of the three still leaves a lever. Proposition A, below, is a claim about all three at once. It says nothing about workloads that only satisfy two, which is exactly why "Compute it," at the end of this post, asks which of the three actually hold for your system, not whether any do.

<span id="def-1b"></span>

<details>
<summary>Definition 1b -- Prior Confidence and the Crossover Time: pre-classification is a fixed signal, elapsed time is not</summary>

**Definition 1b** (Prior Confidence and the Crossover Time). Suppose ingress is not entirely blind after all. A pre-admission classifier exists, using whatever features are available before execution starts (endpoint, payload shape, caller identity), producing a fixed confidence {% katex() %}\pi_0{% end %} that a given task is heavy. This does not contradict Definition 1's blindness property; it refines it. Two signals are now available, and they behave differently over time:

- {% katex() %}\pi_0{% end %} is **fixed at admission.** It cannot improve by waiting. It is whatever it is the instant the task is accepted, and no amount of elapsed execution time makes it a better classifier than it already was.
- The elapsed-time posterior {% katex() %}P(\text{heavy} \mid \text{still running at } t){% end %} is **monotonically increasing in {% katex() %}t{% end %}**, a direct consequence of Definition 1's decreasing-hazard-rate property, and approaches certainty as {% katex() %}t{% end %} grows relative to the light-task timescale.

Because one signal is fixed and the other is unbounded and monotonic, there exists a crossover time {% katex() %}t^*{% end %} such that for all {% katex() %}t > t^*{% end %}, the elapsed-time-only posterior exceeds {% katex() %}\pi_0{% end %}: regardless of how good the pre-classifier is. This holds for any fixed {% katex() %}\pi_0 < 1{% end %}.

</details>

This is a claim about what happens eventually, not always. Near {% katex() %}t = 0{% end %}, right after admission, the elapsed-time signal carries almost no information, and a well-built pre-classifier with strong admission-time features (a reliable payload-size header, a caller known to only submit heavy jobs) can and should beat it outright. The correct reading isn't "elapsed time is always the better signal." It's "elapsed time is the *only* signal that keeps improving without bound, so no fixed pre-classifier (however good) stays the better one forever."

> **Trace example B. The reasoning trace.** This is the case study's own workload, followed through the rest of this post in real seconds: a heavy task drawn from Pareto{% katex() %}(x_m\approx164, \alpha=2.2){% end %}, competing against light calls that finish in about half a second. Proposition A's own worked example, further below, resumes exactly this trace.

**Worked example.** The elapsed-time posterior isn't an arbitrary curve: it falls out of Bayes' rule applied to the two task classes already in use throughout this post. Let heavy tasks be the same Pareto{% katex() %}(x_m=5, \alpha=2.2){% end %} used in Proposition 0, and let light tasks be exponential with mean {% katex() %}\mu_L=1{% end %}, fast, and memoryless, the *wrong* model for heavy tasks but the right one for light ones. Let {% katex() %}p{% end %} be the population base rate of heavy tasks among all arrivals: a deliberately less extreme {% katex() %}p=0.02{% end %} here, not the case study's actual one-in-two-thousand. It's chosen so the crossover shows up on a readable timescale, rather than requiring the reader to squint at values close to zero. {% katex() %}x_m=5{% end %} is the same kind of convenience: reused directly from Proposition 0's demand-quantity example for continuity, not calibrated against the case study's own heavy-task duration. The case study's real numbers are worked separately below, not read off this graph's axis. The mechanism is identical either way; only the numbers on the axis change. Then:

{% katex(block=true) %}
P(\text{heavy} \mid T>t) = \frac{p \cdot S_h(t)}{p \cdot S_h(t) + (1-p) \cdot S_l(t)}
{% end %}

where {% katex() %}S_l(t) = e^{-t/\mu_L}{% end %}, and {% katex() %}S_h(t){% end %} is piecewise to respect the Pareto minimum: a survival probability can't exceed 1, so it can't be {% katex() %}(x_m/t)^\alpha{% end %} for {% katex() %}t{% end %} below {% katex() %}x_m{% end %}:

{% katex(block=true) %}
S_h(t) = \begin{cases} 1 & t < x_m \\ (x_m/t)^\alpha & t \geq x_m \end{cases}
{% end %}

where:

* {% katex() %}P(\text{heavy}\mid T>t){% end %} - the probability a task is heavy given it's still running at {% katex() %}t{% end %}
* {% katex() %}p{% end %} - the population base rate of heavy tasks among all arrivals
* {% katex() %}\mu_L{% end %} - the mean duration of a light task
* {% katex() %}x_m{% end %}, {% katex() %}\alpha{% end %} - the Pareto minimum and tail index of the heavy class

This is genuinely not exponential-shaped, and it shouldn't be. That would smuggle a light-tailed assumption into the one signal this post is building specifically to survive heavy tails. Because {% katex() %}S_l{% end %} decays exponentially and {% katex() %}S_h{% end %} decays only polynomially, the ratio inverts sharply, not smoothly: near-zero while both classes look equally likely to still be running, then a fast swing to near-certainty once the light-task timescale is behind it. Solving {% katex() %}P(\text{heavy}\mid T>t^*) = \pi_0{% end %} numerically for {% katex() %}\pi_0=0.3{% end %} gives {% katex() %}t^* \approx 3.05{% end %}. A few points along the way:

| Elapsed time {% katex() %}t{% end %} | Elapsed-time posterior | Fixed {% katex() %}\pi_0{% end %} | Which one's ahead |
| :--- | :--- | :--- | :--- |
| 0 | 0.020 | 0.30 | {% katex() %}\pi_0{% end %}: no elapsed-time signal yet |
| 1 | 0.053 | 0.30 | {% katex() %}\pi_0{% end %}: still well ahead |
| 2 | 0.131 | 0.30 | {% katex() %}\pi_0{% end %}: closing fast |
| 3 | 0.291 | 0.30 | {% katex() %}\pi_0{% end %}: barely ahead, crossover imminent |
| 4 | 0.527 | 0.30 | elapsed time, decisively (crossover was at {% katex() %}t^* \approx 3.05{% end %}) |
| 8 | 0.956 | 0.30 | elapsed time, nearly certain |

*The elapsed-time posterior overtaking a fixed {% katex() %}\pi_0=0.3{% end %} pre-classifier at {% katex() %}t^*\approx3.05{% end %}: the worked numbers behind the crossover graph above.*

A moderate {% katex() %}\pi_0{% end %} buys three time units of lead before the clock alone would have flagged anything: real value, earned faster than a smooth exponential curve would suggest, because the true transition is a sharp one. Push {% katex() %}\pi_0{% end %} to 0.6 and {% katex() %}t^*{% end %} moves out to about 4.3; push it to 0.9 and it moves to about 6.75. Lead time scales with classifier quality. It never becomes infinite.

> **Physical translation.** A pre-classifier's real value isn't that it out-predicts watching the clock: past the crossover point, it can't. Its value is *lead time*: it lets the system act before {% katex() %}t^*{% end %}, during exactly the window where elapsed time hasn't said anything useful yet. The right design isn't "pick one signal." It's Bayesian combination: start from {% katex() %}\pi_0{% end %} at admission, update continuously as elapsed time accrues, let the elapsed-time term take over the posterior on its own schedule as it strengthens. A system that trusts only {% katex() %}\pi_0{% end %} forever throws away the one signal in this problem guaranteed to become arbitrarily reliable. A system that ignores {% katex() %}\pi_0{% end %} entirely gives up free, immediate signal for no reason, during the exact window it would have mattered most.

<div style="margin:1.5em 0;">
<canvas id="graph-crossover" aria-label="Three flat lines at pi-zero equals 0.3, 0.6, and 0.9, the fixed pre-classification confidence at three levels, against a single monotonically increasing curve, the elapsed-time posterior derived from a genuine Bayesian mixture of a Pareto heavy-task class and an exponential light-task class. The curve is a sharp sigmoid, not a smooth exponential approach. Each line crosses the curve exactly once, at t-star values 3.05, 4.30, and 6.75 respectively -- higher confidence buys a longer lead time, but every line eventually crosses." style="width:100%; aspect-ratio:700/340; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<script>
(function(){
var cv=document.getElementById('graph-crossover');
if(!cv)return;
var ctx=cv.getContext('2d');
var W,H;
var XM=5,ALPHA=2.2,MU_L=1,P_POP=0.02;
var PRIORS=[0.3,0.6,0.9];
function Sheavy(t){if(t<XM)return 1;return Math.pow(XM/t,ALPHA);}
function Slight(t){return Math.exp(-t/MU_L);}
function posterior(t){var h=P_POP*Sheavy(t),l=(1-P_POP)*Slight(t);return h/(h+l);}
function crossoverT(p0){var lo=0,hi=200;for(var i=0;i<100;i++){var mid=(lo+hi)/2;if(posterior(mid)<p0){lo=mid;}else{hi=mid;}}return (lo+hi)/2;}
function setup(){var r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;ctx.scale(d,d);W=r.width;H=r.height;}
function draw(){
ctx.clearRect(0,0,W,H);
var fg='#333',grid='#eee',sub='#777';
var PL=48,PR=20,PT=36,PB=36,AW=W-PL-PR,AH=H-PT-PB;
var TMAX=8;
function SX(t){return PL+(Math.min(t,TMAX)/TMAX)*AW;}
function SY(p){return PT+AH-(p*AH);}
ctx.fillStyle=fg;ctx.font='bold 13px sans-serif';ctx.textAlign='center';
ctx.fillText('However Confident the Guess, Waiting Eventually Beats It',W/2,17);
var yt,y;
for(yt=0;yt<=1.0001;yt+=0.25){
y=SY(yt);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PL,y);ctx.lineTo(PL+AW,y);ctx.stroke();
ctx.fillStyle=sub;ctx.font='10px sans-serif';ctx.textAlign='right';ctx.fillText(yt.toFixed(2),PL-6,y+3);
}
ctx.strokeStyle=sub;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PL,PT+AH);ctx.lineTo(PL+AW,PT+AH);ctx.stroke();
ctx.fillStyle=sub;ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('elapsed time t',PL+AW/2,PT+AH+16);
ctx.strokeStyle='#27ae60';ctx.lineWidth=2;ctx.beginPath();
var t,first=true;
for(t=0;t<=TMAX;t+=1){var px=SX(t),py=SY(posterior(t));if(first){ctx.moveTo(px,py);first=false;}else{ctx.lineTo(px,py);}}
ctx.stroke();
ctx.fillStyle='#27ae60';ctx.font='11px sans-serif';ctx.textAlign='left';
ctx.fillText('elapsed-time posterior',PL+8,PT+14);
var shades=['#e67e22','#c0530f','#8a3a0a'];
for(var i=0;i<PRIORS.length;i++){
var p0=PRIORS[i],col=shades[i];
ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.setLineDash([5,3]);
ctx.beginPath();ctx.moveTo(PL,SY(p0));ctx.lineTo(PL+AW,SY(p0));ctx.stroke();ctx.setLineDash([]);
var tStar=crossoverT(p0);
var cx=SX(tStar),cy=SY(p0);
ctx.fillStyle=fg;ctx.beginPath();ctx.arc(cx,cy,3.5,0,6.2832);ctx.fill();
ctx.fillStyle=col;ctx.font='bold 10px sans-serif';ctx.textAlign='left';
ctx.fillText('π₀='+p0.toFixed(1)+', t*='+tStar.toFixed(1),Math.min(cx+6,PL+AW-110),cy-6);
}
}
if('IntersectionObserver' in window){
new IntersectionObserver(function(es,ob){if(es[0].isIntersecting){ob.disconnect();setup();draw();}},{threshold:0.2}).observe(cv);
}else{setup();draw();}
window.addEventListener('resize',function(){setup();draw();});
})();
</script>
<figcaption>Three fixed values of {% katex() %}\pi_0{% end %} against the same rising elapsed-time posterior: derived from a genuine Bayes mixture of a Pareto heavy class and an exponential light class, not an illustrative exponential curve. Every line crosses exactly once. A higher prior confidence buys more lead time before elapsed time takes over ({% katex() %}t^* \approx{% end %} 3.05, 4.30, 6.75 for {% katex() %}\pi_0{% end %} = 0.3, 0.6, 0.9), but none of them avoid the crossing. Notice the curve's own shape: near-flat while both classes still look equally likely to be running, then a fast swing past {% katex() %}t\approx4{% end %} to near-certainty, the sharp, non-exponential transition the text describes, not a smooth approach.</figcaption>
</div>

**In real terms.** The graph above uses illustrative parameters chosen for readability, not the case study's own scale: its {% katex() %}t^*{% end %} values shouldn't be read as real seconds. Recompute against the case study's actual numbers: heavy tasks arriving at one in two thousand, light calls averaging {% katex() %}\mu_L\approx0.5{% end %}s, the same {% katex() %}\alpha=2.2{% end %} applied to a heavy-task duration with mean {% katex() %}E[S_h]=300{% end %}s (implying {% katex() %}x_m = E[S_h](\alpha-1)/\alpha \approx 164{% end %}s, this series' real scale, not the {% katex() %}x_m=5{% end %} borrowed above for the graph). The crossover lands at {% katex() %}t^*\approx3.4{% end %}s for {% katex() %}\pi_0=0.3{% end %}, {% katex() %}4.0{% end %}s for {% katex() %}\pi_0=0.6{% end %}, {% katex() %}4.9{% end %}s for {% katex() %}\pi_0=0.9{% end %}. All three land well below {% katex() %}x_m\approx164{% end %}s. The heavy-task Pareto's own tail shape isn't even doing the work yet, since {% katex() %}S_h(t)=1{% end %} identically for {% katex() %}t<x_m{% end %}. The crossover here is driven entirely by how fast the light-task exponential decays away, not by anything heavy-tailed. It's still a fast trigger relative to a five-minute heavy task and any conventional dashboard latency alert: the bare fact that a call hasn't finished yet becomes a more reliable heavy-task signal than a decent pre-admission classifier within single-digit seconds of execution, for a request whose eventual heavy-classified duration will be measured in minutes.

This crossover argument sits inside a broader, active research area, not a first foray into the question. *Learning-augmented non-clairvoyant scheduling* studies exactly this shape of problem formally: a fixed or partial prediction combined with an online algorithm that falls back on classical worst-case guarantees when the prediction turns out wrong {{ cite(ref="6", title="Lindermayr, A. & Megow, N. (2022) — Permutation Predictions for Non-Clairvoyant Scheduling") }}. That line of work develops the consistency-robustness tradeoff (how much a good prediction helps, how little a bad one costs) with more formal machinery than the worked Bayesian crossover above. Worth being precise about what does and doesn't survive that context: the argument above is a correctly-derived, concretely-numbered instance of a known pattern, useful for grounding this series' own specimen, not a claim to be charting new territory in the scheduling-theory literature. It doesn't change Proposition A below, which targets the strictly *non-preemptive* case this predictions literature, as far as this post is aware, doesn't claim to rescue.

<span id="prop-a"></span>

<details>
<summary>Proposition A -- No Competitive Algorithm Exists Without Preemption: this is not a hard instance, it's a formally impossible one</summary>

**Proposition A** (Non-Clairvoyant Impossibility). This is not rhetorical framing. Motwani, Phillips & Torng {{ cite(ref="7", title="Motwani, R., Phillips, S. & Torng, E. (1994) — Nonclairvoyant scheduling") }} formalize exactly Definition 1's first two properties. An algorithm that "only becomes aware of the processing time of a job when the job completes," under a no-preemption constraint: and prove that **no algorithm can achieve any non-trivial competitive-ratio guarantee** under these conditions. Allow preemption and the picture changes completely: round-robin recovers a 2-competitive deterministic bound (a result this same paper establishes) and the broader line of work it opened adds a further result on top, preemptive scheduling with randomization reaching {% katex() %}\Theta(\log n){% end %}-competitiveness. Preemption is not an optimization here. It is the one assumption every worst-case guarantee in this literature depends on, and Definition 1 explicitly removes it.

**Proof sketch (adversary argument).** The impossibility isn't shown by exhaustively checking every algorithm: it's shown by constructing a single adaptive adversary that defeats *any* deterministic non-preemptive algorithm, whatever it does. The adversary doesn't fix a job sequence in advance. It watches which job the algorithm is currently running and continuously extends *that* job's true length, withholding the information that it's still growing, for as long as the algorithm keeps running it. Because the algorithm can't preempt, it has no way to abandon a job that turns out to be a bad bet, every job the adversary chooses to extend is a commitment the algorithm made and cannot revoke. The optimal clairvoyant schedule, by contrast, would have run the genuinely short jobs first and deferred the one the adversary is inflating. The gap between the two grows without bound as the adversary keeps extending, which is exactly what "no non-trivial competitive ratio" means: not merely worse, but arbitrarily worse, for any fixed algorithm the adversary is built to target.

</details>

This is the reasoning trace from the case study, run to its logical extreme. The adversary isn't a hypothetical attacker: it's what "no natural stopping point" means when nothing bounds how much longer a running task can decide to keep going, and nothing exists to cut it off. The slot the algorithm committed to is exactly the slot in the opening's pool that filled and stayed filled.

**Why one contested slot is enough to condemn a 32-slot pool.** The theorem is proven against a single point of contention. One job the algorithm is currently, irrevocably running. A 32-slot pool doesn't dilute that; it hands the adversary 32 independent targets instead of one, and the adversary only needs to win against a single one to make the algorithm's worst-case guarantee unbounded. Confine the construction to slot {% katex() %}k{% end %}: feed it the ten-short-jobs-behind-one-extending-job pattern above, and feed every other slot only arrivals so trivial they resolve immediately, however the algorithm handles them. The algorithm's performance restricted to slot {% katex() %}k{% end %}'s own sub-stream is exactly the single-resource instance the cited theorem already rules out. Competitive ratio is a worst-case guarantee over the *whole* algorithm: the other 31 slots running perfectly doesn't rescue a guarantee that one arbitrarily bad slot has already broken. This is a standard move in competitive analysis: embed a hard instance of a smaller problem inside a larger one to inherit its lower bound. It's the actual reason the pool's own concurrency doesn't buy safety in numbers.

> **Trace example B, continued.** The reasoning trace from Definition 1b is what the adversary is inflating below: the "job the algorithm has already committed to running" is exactly a heavy task the pool can't preempt, and the ten short jobs behind it are the ordinary, sub-second calls from the same case study.

<details class="proof">
<summary>Mathematical proof: the adversary's construction, in numbers</summary>

Put numbers on the adversary's construction rather than leaving "grows without bound" as a phrase to trust. Ten short jobs, true length 1 each, sit queued behind a job the algorithm has already committed to running: non-preemptively, because Definition 1 rules out anything else. The adversary, instead of letting that job finish, extends its true length to {% katex() %}L{% end %}. Unable to abandon it, the algorithm finishes it at time {% katex() %}L{% end %}, then runs the ten short jobs in sequence, completing at {% katex() %}L+1, L+2, \ldots, L+10{% end %}:

{% katex(block=true) %}
\text{Algorithm's total completion time} = L + \sum_{i=1}^{10}(L+i) = 11L + 55
{% end %}

The clairvoyant optimum, seeing the true length in advance, runs the short jobs first (provably the total-completion-time-minimizing order on a single server, by a standard exchange argument) then the long one last:

{% katex(block=true) %}
\text{Optimal's total completion time} = \sum_{i=1}^{10} i + (10+L) = L + 65
{% end %}

| {% katex() %}L{% end %} | Algorithm | Optimal | Ratio |
| :--- | :--- | :--- | :--- |
| 1,000 | 11,055 | 1,065 | 10.4 |
| 10,000 | 110,055 | 10,065 | 10.9 |
| {% katex() %}\to\infty{% end %} | n/a | n/a | 11 (exactly {% katex() %}N{+}1{% end %} for {% katex() %}N=10{% end %} waiting jobs) |

*The adversary's competitive-ratio gap against ten waiting jobs, growing without bound as the inflated job length {% katex() %}L{% end %} increases, converging to exactly 11.*

</details>

**Ten isn't special.** Queue twenty short jobs behind the same trick and the ceiling moves to 21. Fifty, and it moves to 51. Whatever competitive ratio {% katex() %}c{% end %} an algorithm claims to guarantee, the adversary picks a number of waiting jobs greater than {% katex() %}c-1{% end %} and an extension {% katex() %}L{% end %} large enough to realize it. That's what "no non-trivial competitive ratio" cashes out to in numbers: not a bad ratio, a ratio with no ceiling, because the adversary picks the ceiling after seeing what the algorithm is trying to promise.

**Why preemption changes the bound, not just the difficulty.** The worked example's trick has one specific mechanical requirement: the algorithm must be unable to interrupt whatever job it's currently running. Round-robin defeats that requirement directly. Give every active job a small time slice and cycle through all of them, and no single job (however long the adversary tries to make it) can hold the server for more than its fair share of any window. The ten short jobs above never wait behind the *full* length of the extended one; they wait behind, at most, a bounded number of round-robin slices: exactly the mechanism that caps round-robin's competitive ratio at 2 for total completion time, no matter how large {% katex() %}L{% end %} gets. Randomization does better still. Algorithms in this space reach {% katex() %}\Theta(\log n){% end %}-competitiveness by spreading their choices across possible job orderings instead of committing to one fixed rotation, which makes it structurally harder for even an adaptive adversary to reliably target whatever the algorithm is about to do next. Both results depend on the one ingredient Definition 1 rules out: neither bound exists without the ability to stop running a job before it finishes.

> **Physical translation.** There is no clever admission policy waiting to be discovered here, because the theory that would house it proves none exists. Preemption doesn't just make the impossibility more expensive to overcome. It removes an entire face from the achievable region, the same way CAP and FLP remove faces rather than draw threshold cuts. Every point corresponding to a non-trivial competitive-ratio guarantee isn't merely hard to reach without preemption: it's not in the achievable region at all. The impossibility isn't a rhetorical flourish. It's the actual reason the fix has to be structural (change what you're allowed to do to a running task, change what backpressure is allowed to look at) rather than algorithmic (find a smarter rule for which tasks to admit).

## Where This Sits Against Familiar Mitigations

Three tools get reached for before anyone accepts that Proposition 0 and Proposition A actually apply. Worth naming precisely why each one misses.

> **Finding.** All three assume a failure can be caught before it's expensive, or undone after. Blood Oath removes both assumptions by construction, so none of the three ever had traction here.

| Mitigation | What it actually does | Why it misses |
| :--- | :--- | :--- |
| Circuit breaker | Rejects *new* admissions once tripped | Detects the pool filling; can't evict what's already running |
| Rate limiter | Throttles *all* traffic by a fraction {% katex() %}r{% end %} | Can't selectively throttle heavy traffic: cost is unknown at ingress |
| Retry budget | Counts *failed* attempts | Blood Oath tasks never fail and retry: the counter never moves |

*Why the three most-reached-for mitigations each fail against a Blood Oath workload, despite working correctly on their own terms.*

**Circuit breakers** classically trip on an *error* signal: a rising failure rate past a threshold. Production systems worth trusting also trip on latency degradation and queue dwell time: CoDel-style active queue management, p99-based load shedding. That distinction matters here, and it would be wrong to pretend otherwise. A 32-slot pool pinned by reasoning traces absolutely degrades admission latency, and a well-instrumented latency-based breaker would trip on it sooner than an error-based one ever could. Even at the case study's own ordinary baseline (the roughly 23% heavy occupancy this post derives from Little's Law {{ cite(ref="8", title="Little, J.D.C. (1961) — A Proof for the Queuing Formula: L = λW") }} later in this post, not the surge that turned it into an incident), a latency-based breaker watching admission wait times has a real, standing signal to calibrate against, where an error-based one has nothing to see until the pool is already saturated. But what tripping buys is narrower than it sounds. Tripping means rejecting *new* admissions, failing fast instead of queueing silently. It doesn't free a slot. Nothing in Definition 1 gives a breaker, however well-instrumented, a way to evict a reasoning trace already running. The pool stays pinned until those traces finish on their own, breaker tripped or not. And "the queue just absorbs the load" was never really an escape either: queue depth is bounded by physical resources whether anyone declares a limit or not, so the failure a breaker exists to catch happens somewhere regardless, cleanly, at the breaker, or one layer down, once the queue exhausts file descriptors, ephemeral ports, or physical memory. The honest version of this claim isn't "no failure is ever observable." It's that detecting the problem, however early, doesn't undo the admission that caused it. Thirty-two successful, entirely healthy admissions are still holding a resource nothing can take back.

**Rate limiters** cap arrival rate, on the theory that slowing admission protects whatever's downstream. But the case study's problem was never arrival volume: 99.95% of what arrived was cheap and harmless. A rate limiter admits at ingress, before cost is known (Definition 1, property 1), so it can't selectively throttle heavy traffic, only *all* traffic, uniformly, by some admitted fraction {% katex() %}r{% end %}. Suppose heavy-task arrivals surge by a factor {% katex() %}S{% end %} (the case study's own "three or four reasoning traces landing close together," generalized) while light-task arrivals hold steady. To keep heavy occupancy at its pre-surge baseline, the limiter needs {% katex() %}r \cdot S \leq 1{% end %}, i.e. {% katex() %}r \leq 1/S{% end %}. At a 10x heavy surge, that means admitting only 10% of *all* offered traffic, rejecting 90%, the overwhelming majority of it harmless load the pool was never in danger from. At a 20x surge: admit 5%, reject 95%. The limiter can hold the line, but only by treating nearly everything as guilty to catch the rare guilty party it can't actually identify. Loosened enough to let the healthy majority through, it no longer holds the line at all. It only delays the moment the pool sediments, since the underlying dynamic doesn't care about absolute arrival rate, only the ratio of offered heavy load to capacity. And a rate limit is, structurally, just another {% katex() %}Q{% end %}. It inherits Proposition 0's exact fragility, computed against a distribution nobody re-examined for tail weight.

**Retry budgets** cap how many times a *failed* request gets retried, to stop retry storms from amplifying an outage: reject the 11th retry in a rolling window, say, rather than let every client keep hammering a struggling downstream. Blood Oath's tasks don't fail and get retried. Property 2 rules retry out entirely. A task runs once, to completion, or the node goes down with it, and there's no failed attempt for a budget to count against. Point a retry budget at the case study's incident and watch what it does. The thirty-two reasoning traces holding their slots never fail, so the counter never increments, so the budget never trips, so nothing happens, not because the mitigation was configured wrong, but because the event it watches for structurally cannot occur here. A retry budget is solving a real problem that simply isn't this one. Applying it here doesn't fail loudly. It just does nothing: a worse failure mode than an error, because nothing signals the tool never had traction to begin with. An on-call engineer checking dashboards mid-incident sees a healthy, zero-triggered retry budget and reasonably concludes that layer is fine. Exactly backwards: a layer that structurally cannot see the problem is not the same thing as a layer confirming there isn't one.

All three assume either that failure is observable before it's expensive, or that a bad admission can be undone. Definition 1 rules out both assumptions by construction. This isn't a case for better tuning any of the three. None of them were ever the right category of tool.

## Would a Centralized Scheduler Change Any of This?

Worth answering before this series builds a single mechanism, because the answer draws a line the rest of the series has to respect. Give the admission decision to one logically-central authority, with a perfect, real-time, zero-staleness view of every task and every node: does Proposition A's impossibility bound move?

It doesn't, and the reason matters. Proposition A's adversary exploits a specific fact: a task's true execution duration is unknown at admission and stays unknown until completion: Definition 1's own first property, ingress blindness. That's an information problem about the *future*. A centralized scheduler, however perfectly it knows *current* state (every queue depth, every slot, every headroom fraction, zero lag) still doesn't know how long a task about to be admitted will actually run. The adversary's construction (extend whichever job the algorithm is currently running, since the algorithm can't abandon it) works identically whether the algorithm computing "which job is currently running" lives on one central machine with a global view or is smeared across a fleet with stale local views. Centralizing the *observation* of present state does nothing to the *prediction* of future state. Proposition A's bound is a statement about prediction, not observation.

Centralized-versus-decentralized architecture is worth comparing for exactly the class of problem where the distinction matters, because most of what this series builds *is* an observation problem, not a prediction one: how much headroom does a node have right now, which of N nodes is closest to its own limit right now, has a redline been crossed right now. Those are staleness problems, and architecture genuinely changes the answer to them. Proposition A is not one of those, and no such comparison should be read as bearing on it. The two failure modes this series calls "imperfect information" aren't the same failure mode. Conflating them is the single easiest way to overclaim what any architectural fix (centralized, decentralized, or hybrid) actually buys.

## Model Scope and Failure Envelope

Five assumptions are doing work in this post that deserve to be named rather than left implicit.

| Assumption | What could break it | Status |
| :--- | :--- | :--- |
| Cost is a single scalar (duration) | A task cheap in duration but expensive on a different, uninstrumented resource | Named gap: the vector-valued generalization this would need isn't built here |
| The true demand distribution {% katex() %}F{% end %} is stationary | A regime change, a seasonal shift, a genuine drift in the workload | A different failure mode than the one this post proves, left open |
| Proposition A rules out the worst case | The statistically ordinary case that reaches saturation without any adversary | Real: 23% baseline occupancy, formalizing exactly where it tips into an incident is a distinct, unresolved question |
| Arrivals are independent enough for rate-and-duration quantities to be well-defined | A correlated upstream trigger driving many arrivals at once | Named gap, not resolved |
| The heavy class is one clean Pareto population | A real mixture of distinct workload types, each with its own characteristic duration | Checked directly: the crossover claim survives, the finer-grained machinery downstream of it does not |

*Five assumption boundaries this post depends on, in the order the paragraphs below name them.*

**Cost is treated as a single scalar.** Definition 1's "true cost" is duration, and Proposition 0's newsvendor framing collapses underage/overage into two dollar figures. Real workloads often spend multiple resources at once (CPU time, memory, network) and a task cheap on one axis can be expensive on another. The case study's own 32-slot pool is already a mild simplification here: what actually binds is VRAM, and duration is a *proxy* for VRAM occupancy: accurate in this case because a generation never releases any of its KV cache early, so time-in-slot and time-holding-memory are the same clock. That proxy relationship isn't guaranteed for every workload. A task could be short in duration but memory-hungry throughout, or long-running but nearly idle on the resource that's actually scarce, and Definition 1's single scalar has no vocabulary for that mismatch. This post's model is the single-resource simplification on purpose, named here as exactly that: a task cheap in duration but expensive on a different, uninstrumented resource is invisible to everything this post builds. The vector-valued generalization that vocabulary would need ("heavy" as more than a scalar, the binding resource shifting depending on what else runs concurrently) is a real gap, not a hedge.

**Proposition 0 assumes a stationary true distribution, misspecified or not.** It says nothing about {% katex() %}F{% end %} itself drifting over time: a regime change, a seasonal shift, a genuine change in the underlying workload. A capacity number can be exactly right for a stationary {% katex() %}F{% end %} and still go stale the moment the world it was fit to stops holding still. That's a different failure mode from the one this post proves, not a smaller version of it. Proposition 0 and Proposition A both reason about a fixed {% katex() %}F{% end %}; neither re-checks whether {% katex() %}F{% end %} is still the distribution actually in effect. A capacity number computed once and defended forever inherits that blind spot by construction.

**Proposition A rules out worst-case guarantees, not average-case ones.** Easy to blur, and it matters. No non-preemptive algorithm can guarantee good performance against an adversary free to construct the worst possible input: a contrived, per-task adaptive construction, more extreme than anything the case study needed. That's not the same claim as "every non-preemptive system fails on every real workload." But the case study's failure isn't luck either: once offered load from heavy tasks alone (arrival rate times mean holding time) approaches the pool's capacity, sedimentation is the expected steady-state outcome of Little's Law, not a rare coincidence of timing. Put numbers to the case study's own description, heavy tasks arriving at roughly one in two thousand, light tasks finishing in about half a second, heavy ones holding a slot for about five minutes, and Little's Law gives an expected steady-state heavy occupancy of about 23%: real, persistent sedimentation, but not yet an incident on its own. What turns an ordinary day into an incident is a rate increase pushing that occupancy toward saturation, not an adversary and not bad luck. Proposition A explains why no algorithm can promise safety in the worst case. Formalizing exactly where that threshold sits (not the adversarial case, the statistically ordinary one that gets there anyway) is a distinct, narrower question this post leaves open.

**Task arrivals are treated as regular enough for the underlying rate-and-duration quantities to be well-defined.** Nothing here examines whether a surge like the case study's is itself correlated with something upstream. The same upstream trigger (a new agentic workflow rollout, a batch of related requests) driving many correlated reasoning traces at once isn't obviously the same statistical object as independent arrivals at an elevated rate, and this post doesn't distinguish between them. A real, named gap, not resolved by assuming it away.

**The heavy class is treated as a single Pareto population, and a real fleet's own "heavy" traffic is rarely that clean.** Harchol-Balter & Downey's finding, grounding property 1, is real and specific to what they measured: UNIX process lifetimes, one population, genuinely Pareto-shaped. A production fleet's heavy traffic is more often a mixture of distinct workload types stacked together (a different tenant's batch job, an automated report generator, a multi-step agentic loop) each with its own comparatively narrow characteristic duration, not a single smooth tail. That matters because a mixture of well-separated, low-variance sub-populations doesn't, in general, inherit a single population's clean decreasing-hazard shape. Worked concretely: mixing three quasi-deterministic sub-populations at characteristic lifetimes of 200s, 800s, and 2000s (weights 0.5/0.3/0.2, each with a modest 15% coefficient of variation around its own mean) produces a population hazard rate that rises, falls, rises again, and falls again before finally settling: four genuine reversals, not the single smooth decline a pure Pareto gives.

> **Finding.** Definition 1b's own crossover claim survives this intact. The finer-grained machinery built downstream of it does not.

**Why the crossover claim survives.** {% katex() %}P(\text{heavy}\mid\text{survived to }t){% end %} only has to resolve a coarse, two-class distinction (heavy versus light) and light decays on a sub-second timescale here, so the posterior saturates toward certainty well before any internal structure in the heavy class's own hazard has a chance to matter. Checked directly against the three-component mixture above, at this post's own {% katex() %}p=0.02{% end %}, {% katex() %}\mu_L=1{% end %} worked-example parameters: the posterior crosses {% katex() %}\pi_0=0.3{% end %} exactly once, at {% katex() %}t\approx6{% end %}, and never dips back below it: regardless of the heavy class's own internal wiggling three hundred seconds later.

**What does *not* survive.** Computing how much longer a task already known to be heavy is expected to run operates *inside* the heavy class, and that quantity is exactly what a mixture's internal structure can make genuinely non-monotonic:

| Elapsed time {% katex() %}t{% end %} | Mean residual life |
| :--- | :--- |
| 50s | ≈690s |
| 150s | ≈602s |
| 300s | ≈978s |
| 700s | ≈671s |
| 1,000s | ≈928s |

*Mean residual life under the three-component mixture model: four non-monotonic reversals a single, pure Pareto tail wouldn't produce.*

<div style="margin:1.5em 0;">
<canvas id="graph-mixture-reversals" aria-label="A chart plotting mean residual life against elapsed time from 0 to 2,200 seconds. A dashed line shows what a single, clean Pareto population produces: a simple V shape, falling in a straight line from 300 seconds at zero elapsed time down to a minimum around 136 seconds at the Pareto minimum near 164 seconds, then rising in a straight line forever after. A solid line shows the three-component mixture instead: it falls to a local minimum near 605 seconds at 150 seconds elapsed, rises to a local maximum near 1000 seconds at 268 seconds elapsed, falls again to a local minimum near 669 seconds at 692 seconds elapsed, rises again to a local maximum near 937 seconds at 1006 seconds elapsed, then finally settles into a decline. Four reversals, clearly visible as a genuinely wiggling curve, next to the clean single population's own simple, boring V." style="width:100%; aspect-ratio:760/420; border:1px solid #e0e0e0; border-radius:4px; background:#fff; display:block;"></canvas>
<script>
(function(){
var cv=document.getElementById('graph-mixture-reversals');
if(!cv)return;
var ctx=cv.getContext('2d');
var W,H;
function setup(){var r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;ctx.scale(d,d);W=r.width;H=r.height;}
function erf(x){var s=x<0?-1:1;x=Math.abs(x);var a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;var t=1/(1+p*x);var y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);return s*y;}
function Phi(x){return 0.5*(1+erf(x/Math.SQRT2));}
function phiD(x){return Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);}
var POPS=[[200,0.5],[800,0.3],[2000,0.2]];
function mMix(t){var S=0,num=0,i,mu,w,sig,z;for(i=0;i<POPS.length;i++){mu=POPS[i][0];w=POPS[i][1];sig=0.15*mu;z=(t-mu)/sig;S+=w*(1-Phi(z));num+=w*(sig*phiD(z)-(t-mu)*(1-Phi(z)));}if(S<1e-9)return null;return num/S;}
var ALPHA=2.2,XM=163.6,ESH=300;
function mClean(t){if(t<XM)return ESH-t;return t/(ALPHA-1);}
var XMAX=2200,YMAX=1050;
function draw(){
ctx.clearRect(0,0,W,H);
var fg='#333',grid='#eee',sub='#777';
var mixColor='#b45309',cleanColor='#1d4ed8';
var PL=56,PR=20,PT=36,PB=44,AW=W-PL-PR,AH=H-PT-PB;
function SX(t){return PL+(t/XMAX)*AW;}
function SY(v){return PT+AH-(Math.max(0,Math.min(v,YMAX))/YMAX)*AH;}
var i;
for(i=0;i<=8;i++){var gx=PL+i*AW/8;ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(gx,PT);ctx.lineTo(gx,PT+AH);ctx.stroke();}
for(i=0;i<=6;i++){var gy=PT+i*AH/6;ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PL,gy);ctx.lineTo(PL+AW,gy);ctx.stroke();ctx.fillStyle=sub;ctx.font='9px sans-serif';ctx.textAlign='right';ctx.fillText(Math.round(YMAX-i*YMAX/6),PL-6,gy+3);}
ctx.strokeStyle=sub;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PL,PT+AH);ctx.lineTo(PL+AW,PT+AH);ctx.moveTo(PL,PT);ctx.lineTo(PL,PT+AH);ctx.stroke();
ctx.fillStyle=sub;ctx.font='9px sans-serif';ctx.textAlign='center';
for(i=0;i<=8;i++){var xv=Math.round(i*XMAX/8);ctx.fillText(xv,SX(xv),PT+AH+14);}
ctx.fillText('elapsed time t (seconds)',PL+AW/2,PT+AH+30);
ctx.save();ctx.translate(16,PT+AH/2);ctx.rotate(-Math.PI/2);ctx.fillText('mean residual life (seconds)',0,0);ctx.restore();
ctx.fillStyle=fg;ctx.font='bold 12px sans-serif';ctx.textAlign='center';
ctx.fillText('A Clean Pareto V, Next to a Mixture That Wiggles Four Times',PL+AW/2,16);
ctx.save();ctx.beginPath();ctx.rect(PL,PT,AW,AH);ctx.clip();
ctx.strokeStyle=cleanColor;ctx.setLineDash([5,3]);ctx.lineWidth=2;ctx.beginPath();
var t,first=true,px,py;
for(t=0;t<=XMAX;t+=10){px=SX(t);py=SY(mClean(t));if(first){ctx.moveTo(px,py);first=false;}else{ctx.lineTo(px,py);}}
ctx.stroke();ctx.setLineDash([]);
ctx.strokeStyle=mixColor;ctx.lineWidth=2.4;ctx.beginPath();
first=true;
for(t=0;t<=XMAX;t+=4){var v=mMix(t);if(v===null)continue;px=SX(t);py=SY(v);if(first){ctx.moveTo(px,py);first=false;}else{ctx.lineTo(px,py);}}
ctx.stroke();
ctx.restore();
var revs=[[150,604.7],[268,1000.4],[692,669.1],[1006,937.2]];
for(i=0;i<revs.length;i++){var rx=SX(revs[i][0]),ry=SY(revs[i][1]);ctx.fillStyle=mixColor;ctx.beginPath();ctx.arc(rx,ry,3.5,0,6.2832);ctx.fill();}
ctx.fillStyle=cleanColor;ctx.font='10px sans-serif';ctx.textAlign='left';
ctx.fillText('single clean Pareto: simple V',SX(1250),SY(mClean(1250))-8);
ctx.fillStyle=mixColor;ctx.font='bold 10px sans-serif';ctx.textAlign='left';
ctx.fillText('three-component mixture: four reversals',SX(80),SY(mMix(80))+16);
}
if('IntersectionObserver' in window){
new IntersectionObserver(function(es,ob){if(es[0].isIntersecting){ob.disconnect();setup();draw();}},{threshold:0.2}).observe(cv);
}else{setup();draw();}
window.addEventListener('resize',function(){setup();draw();});
})();
</script>
<figcaption>Dashed: a single, clean Pareto population's own mean residual life, the simple V-shape a naive model assumes, falling to a minimum at the Pareto minimum and rising forever after. Solid: the same quantity under the three-component mixture worked above, computed densely rather than sampled at five scattered points, revealing the actual shape the sparse table only hints at: four genuine reversals, marked, before the curve finally settles into decline. The two curves share the same axes and the same units; only the population underneath differs.</figcaption>
</div>

Four reversals in a quantity a real system would use to decide whether a task is still worth waiting on. Whether a real fleet's own heavy traffic is close enough to unimodal for that kind of machinery to apply as stated, or genuinely splintered enough that it needs measuring (a multimodal check on the empirical duration distribution, not just a tail-index estimate), is named here as the assumption this post's own property 1 rests on. It is not resolved here.

{% mermaid() %}
flowchart TD
    A["Does the workload have<br/>ingress blindness?<br/>(cost unknown until completion)"] -->|No| Z1["Ordinary scheduling problem:<br/>admission control on cost works"]
    A -->|Yes| B["Can a running task<br/>be preempted or evicted?"]
    B -->|Yes| Z2["Ingress blindness alone:<br/>known mitigations apply, no need<br/>for this series' own machinery"]
    B -->|No| C["Does the workload need<br/>shared-memory locality?<br/>(no horizontal escape)"]
    C -->|No| Z3["Ingress blindness + non-preemption:<br/>Proposition A's territory,<br/>but sharding can spread the risk"]
    C -->|Yes| D["All three Blood Oath properties hold."]
    D --> E["Proposition A applies: no admission<br/>algorithm can bound the loss.<br/>Stop looking for a smarter rule.<br/>The fix has to be structural."]
{% end %}
*Four questions to check against a real workload: whether it hits all three Blood Oath properties at once, or drops out early into a cheaper, conventional fix.*

**Compute it.** Nothing here is a scheduling tip. Proposition 0 is a theorem about capacity, Proposition A is a theorem about algorithms, and together they rule out both answers an experienced engineer reaches for first: a better-tuned number, and a cleverer rule. Before trusting either on a real system, run the actual checks this post derived, not the intuitions that usually stand in for them.

* **Was {% katex() %}Q{% end %} fit against the real tail?** Pull the distribution your current {% katex() %}Q{% end %} was fit against. Was tail weight, not just mean and variance, ever estimated, or was {% katex() %}Q{% end %} implicitly fit under a light-tailed assumption nobody stated out loud? If nobody can answer that, assume the light-tailed case and treat the current {% katex() %}Q{% end %} as a guess wearing the robust answer's clothing.
* **Does the workload actually have all three Blood Oath properties, or only some?** Ingress blindness alone is an ordinary scheduling problem with known mitigations. Ingress blindness plus non-preemption is Proposition A's territory. All three together, including the locality lock ruling out horizontal escape, is the specific combination this post's entire argument turns on.
* **If all three hold:** stop looking for a smarter admission rule. Proposition A already proved none exists; a structural fix (changing what's allowed to happen to a running task, not computing a better threshold) is the only category left.
* **If only one or two hold:** the fix may be cheaper than this series' full machinery. A workload with ingress blindness, but where preemption is available *and* the task's own accumulated state can genuinely be relocated rather than only discarded, doesn't need Proposition A's response at all. Pricing that cheaper fix properly is a different, strictly easier problem than the one this post's own non-preemptive machinery solves.

Exactly where this post's case study crossed from ordinary sedimentation into an incident, and what a structural response actually costs to run, are questions this post leaves open. Knowing which of these four checks your own system fails is something to establish before those questions matter, not after.

## What This Post Actually Proved

Two theorems, not one, and it matters that they're separate. Proposition 0 is about a number: given a demand distribution, however it behaves, there is a single correct capacity, and the classical machinery for finding it has never been broken. What breaks is the finite-sample habit of fitting the wrong family to it. A mistake ordinary sampling noise makes for free and heavy tails punish specifically. Nothing about that theorem is new; Arrow, Harris & Marschak closed it in 1951. What's new here is showing exactly how much a light-tailed guess costs when the world underneath it is heavier than assumed, not "unstable," a number: checkable at 24.5% over the true optimum, on a structural shape error rather than a magnitude one. Even a perfectly-estimated mean cannot save you from it.

Proposition A is about something the first theorem cannot see. Once "how much capacity" becomes "which arriving task gets the capacity," a workload can acquire three properties (ingress blindness, execution immortality, locality lock) that together aren't a harder instance of the same problem. They're a different problem, one where no admission algorithm, however clever, can promise a bounded loss against the worst case. Not a weak guarantee. No guarantee: the gap unbounded, verified above with an adversary that needs nothing but the freedom to keep extending whichever job is currently running.

The Constraint Sequence Framework is why both theorems had to be proven, not just one. A team that only knew Proposition 0 would respond to the case study's incident by re-fitting {% katex() %}Q{% end %}, watch the pool sediment again on the next reasoning-trace surge, and conclude the fractile needs even more margin: chasing a capacity number that was never the binding constraint once a task got admitted. A team that only knew Proposition A would conclude no algorithm can help and stop looking for structural responses too, missing that Definition 1b's crossover time is itself a real, physical signal a non-algorithmic response could act on, not just a proof of impossibility. Both theorems are required before "add backpressure, not a smarter admission rule" is a conclusion rather than an assertion. That's the Constraint Sequence Framework's own point, applied to itself: neither result, alone, would have sequenced correctly to the fix.

What this post proves is where the number stops being enough, and where no algorithm can rescue what's left. No safe number exists for a workload with all three Blood Oath properties. That claim is proven, not asserted: an adversary construction and a closed-form fractile, both checked against real numbers rather than left symbolic.

> **Cognitive Map**
>
> 1. Provisioning by precedent (trusting a number because it has always worked) is exactly the property that stops being informative the day a heavy tail finally tests it. Proposition 0 proves precisely where the stability ends: a light-tailed {% katex() %}Q^*{% end %} can run 24.5% over the true robust optimum, not from bad luck but from fitting the wrong distributional family to begin with.
> 2. Definition 1 names three properties (ingress blindness, execution immortality, locality lock) that, together, remove every lever a scheduler normally has: no admission control on unknown cost, no correcting a bad admission after the fact, no spreading the risk across more machines.
> 3. Definition 1b shows a fixed pre-admission classifier is real, useful lead time, not a permanent edge: an elapsed-time posterior overtakes any fixed confidence eventually, because one signal keeps improving without bound and the other doesn't.
> 4. Proposition A proves the three Blood Oath properties together aren't a harder version of ordinary scheduling. They're a different problem: no admission algorithm, however clever, can promise a bounded loss against the worst case: verified with an adversary that needs nothing but the freedom to keep extending whichever job is currently running.
> 5. The Constraint Sequence Framework is why both theorems had to be proven, not just one: a team that only knew Proposition 0 keeps re-fitting a number that was never the binding constraint; a team that only knew Proposition A stops looking for the structural response that's actually available.
> 6. No safe number exists for a workload with all three properties. What replaces the number is a structural response, not a smarter admission rule: a category of fix, not a specific mechanism this post itself derives.
> 7. Property 1's decreasing-hazard-rate claim leans on two separate pieces of evidence for two separate jobs. A 1997 UNIX process-lifetime study earns the general scheduling argument: elapsed time predicts remaining time, for any decreasing-hazard-rate distribution. A 2025 extreme-value-theory study fitting real LLM response lengths earns the domain-specific one: this workload's own duration is genuinely heavy-tailed, not by analogy to a different generative process.

---
<sup>[1]</sup> Arrow, K.J., Harris, T. & Marschak, J. (1951). *Optimal Inventory Policy.* Econometrica, 19(3), 250–272.

<sup>[2]</sup> Das, B., Dhara, A. & Natarajan, K. (2021). *On the Heavy-Tail Behavior of the Distributionally Robust Newsvendor.* Operations Research, 69(4), 1077–1099.

<sup>[3]</sup> Harchol-Balter, M. & Downey, A. (1997). *Exploiting Process Lifetime Distributions for Dynamic Load Balancing.* ACM Transactions on Computer Systems, 15(3), 253–285.

<sup>[4]</sup> Kwon, W., Li, Z., Zhuang, S., Sheng, Y., Zheng, L., Yu, C.H., Gonzalez, J.E., Zhang, H. & Stoica, I. (2023). *Efficient Memory Management for Large Language Model Serving with PagedAttention.* Proceedings of the 29th Symposium on Operating Systems Principles (SOSP 2023).

<sup>[5]</sup> Jiao, L., Gao, C., Yang, Y., Zhou, C., Huang, Y., Chen, X. & Li, Y. (2025). *Analyzing and Modeling LLM Response Lengths with Extreme Value Theory: Anchoring Effects and Hybrid Distributions.* Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing (EMNLP), 32992–33002.

<sup>[6]</sup> Lindermayr, A. & Megow, N. (2022). *Permutation Predictions for Non-Clairvoyant Scheduling.* arXiv preprint.

<sup>[7]</sup> Motwani, R., Phillips, S. & Torng, E. (1994). *Nonclairvoyant scheduling.* Theoretical Computer Science, 130(1), 17–47.

<sup>[8]</sup> Little, J.D.C. (1961). *A Proof for the Queuing Formula: L = λW.* Operations Research, 9(3), 383–387.

