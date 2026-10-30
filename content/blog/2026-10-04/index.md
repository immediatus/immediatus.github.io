+++
authors = ["Yuriy Polyulya"]
title = "One Bit per Dead Time"
description = "A CPU metric cannot report more load than the pods can carry, so a twofold overload and a thirtyfold one draw the same first request for capacity. This post reads the Kubernetes autoscaler's source to see what it computes, then derives what follows: it sizes an overload at most one multiplication per provisioning delay. At a 50% target that is one bit per dead time. At the API's default of 80%, a thirtyfold overload takes fifteen rounds."
date = 2026-10-04
slug = "capacity-in-arrears-part1-one-bit-per-dead-time"

[taxonomies]
tags = ["distributed-systems", "control-theory", "systems-thinking", "queueing-theory"]
series = ["capacity-in-arrears"]

[extra]
toc = false
series_order = 1
series_title = "Capacity in Arrears: Autoscaling Under Dead Time, Saturated Metrics, and Retry Debt"
series_description = """<div class="series-lede">An autoscaler adds capacity for the load it can measure, and an overload is the load it cannot.</div>A utilization metric is bounded by the capacity it reports on, so it reads the same at twice the load and at thirty times. This series follows one widely deployed autoscaler from its source code to its limits, and uses it to test four things engineers reasonably believe about a control loop: that its metric measures load, that a stabilization window makes it stable, that a cleaner signal is a safer one, and that a limit removes a risk. Each part prices what one belief leaves out. The results come from the controller's own arithmetic and from simulations whose assumptions each part states. Every part names the observation, on a real cluster, that would prove it wrong."""
+++

Every pod on the dashboard reads 100% CPU. The replica count says 20, then holds. Two minutes later it says 40 and holds again. Two minutes after that it says 80. Nobody has touched the autoscaler, and nothing is broken. It is doing what it was built to do, one step at a time. The engineer on call has one question the dashboard cannot answer: how much load is actually arriving?

The autoscaler cannot answer it either. That inability is the subject of this post.

The numbers above come from a model of an ordinary service, which this series calls the specimen and uses in all four parts. Ten pods sit behind the Kubernetes Horizontal Pod Autoscaler, scaling on CPU at a 50% target. Each pod may use one core and serves a hundred requests a second at full use. A new pod takes 90 seconds from the order to its first served request. That is the provisioning window [The Phase MAPE-K Usually Skips](@/blog/2026-08-05/index.md) used for the time from a scaling decision to a new instance being live, kept here so the two results can be compared. Then traffic jumps to ten times its usual rate.

In that model the replica count roughly doubles every two minutes, from 20 to more than 300. Capacity catches up with demand after 345 seconds, and the count keeps climbing anyway, because a backlog piled up while capacity was short. It peaks at 317 pods, where 100 would have done the job.

Now the part that matters. Had traffic jumped to three times its rate instead of ten, the first two requests for capacity would have been identical: 20 pods, then 40. Had it jumped thirty times, the first five would have matched the tenfold run exactly. For the first several minutes of an overload, the controller's behaviour carries no information about how large the overload is. It finds out only by adding capacity and watching what happens next.

The same pattern shows up in ordinary operations. A launch, a retry storm after a dependency recovers, or a batch job pointed at the wrong endpoint all produce it. The replica graph rises in stairs, each stair one provisioning delay wide. The usual reading is that the autoscaler is slow and needs tuning. This post argues for a narrower reading. The stairs are the controller measuring the overload, at a rate fixed by arithmetic that no setting in its policy changes.

<div class="recap-box">
<span class="recap-label">In brief</span>
<ul>
<li><strong>The belief.</strong> A utilization metric measures load, and its target is a cost setting.</li>
<li><strong>The mechanism.</strong> The Kubernetes autoscaler counts pods it has ordered at zero usage, so with a saturated metric one provisioning round can at most multiply its ready pods by {% katex() %}g = \ell/(r\,u^\ast){% end %}.</li>
<li><strong>The law.</strong> A k-fold overload needs at least {% katex() %}\lceil \log_g (k\,u^\ast r/\ell) \rceil{% end %} rounds: 4 for a thirtyfold overload at a 50% target, 15 at the API default of 80%. At 91% and above, with the limit equal to the request, the controller never scales at all.</li>
<li><strong>The bill.</strong> About two minutes per round in the specimen, an overshoot of 1.3 to 6.5 times the pods needed, and both worse when pods degrade under load.</li>
</ul>
</div>

<details>
<summary>Notation used across the series</summary>

where:

- {% katex() %}\tau{% end %} - the dead time, from ordering a pod to its first served request; 90 seconds in the specimen
- {% katex() %}k{% end %} - the size of an overload, as a multiple of the load before it; {% katex() %}K{% end %} when it is drawn at random
- {% katex() %}u^\ast{% end %} and {% katex() %}\rho{% end %} - the utilization target and the utilization a service actually runs at
- {% katex() %}\ell{% end %} and {% katex() %}r{% end %} - a pod's CPU limit and CPU request
- {% katex() %}g = \ell/(r\,u^\ast){% end %} - the growth factor: the most the controller can multiply its ready pods by in one round
- {% katex() %}W{% end %} and {% katex() %}w = W/\tau{% end %} - the downscale stabilization window, and the same window measured in dead times
- {% katex() %}T{% end %}, {% katex() %}c{% end %} and {% katex() %}D = T/c{% end %} - a backlog threshold in messages per pod, the rate of one pod, and the standing delay every message waits at rest
- {% katex() %}\Phi(w){% end %} - the standing delay, in dead times, a backlog loop with window {% katex() %}w{% end %} needs to rest
- {% katex() %}A{% end %} and {% katex() %}A_{\text{fail}}{% end %} - the retry amplification: units of work per first attempt once every attempt fails, and the same quantity whatever sets it, retry counts, budgets or limiters
- {% katex() %}\lambda{% end %}, {% katex() %}C{% end %}, {% katex() %}\tau_{\text{out}}{% end %} and {% katex() %}\Delta{% end %} - demand, capacity, the client timeout and the length of a spike
- {% katex() %}M{% end %} and {% katex() %}b{% end %} - a replica ceiling and an admission bound in seconds of capacity
- L1 · Bound, L2 · Fit and L3 · Estimate - the tag on each claim: a proof or a cited fact, a judgment or approximation the text argues for, and a worked example computed from the model; each part's ledger names the layer of every law it records

</details>

## What a Loop Cannot Know

This series takes one widely deployed autoscaler and asks four questions about it, one per part. Each question names something the loop cannot know from its own signal. Each part then prices the belief that lets engineers forget it.

1. **Size.** A utilization metric cannot report more load than the pods can carry. What does the loop do when the load it must size exceeds anything its metric can show? This post answers that.
2. **Time.** A loop driven by a backlog reacts to work that has already waited. What does a stabilization window, added to stop flapping, do to such a loop? Still open when this post ends.
3. **State.** A demand-rate signal sees what clients ask for now. It misses the work that earlier requests left behind. When does that gap hold a service in a failed state? Also open.
4. **Where the excess goes.** During the provisioning delay the replica count controls nothing. What bounds the damage then, and what does that bound cost? Also open.

{% mermaid() %}
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    classDef root fill:none,stroke:#333,stroke-width:3px;
    classDef branch fill:none,stroke:#ca8a04,stroke-width:2px;
    classDef leaf fill:none,stroke:#4a90d9,stroke-width:1.5px;
    D["Clients<br/>first attempts and retries"]:::leaf
    S["Service<br/>queue and ready pods"]:::root
    C["Controller<br/>ratio, tolerance, window"]:::branch
    P["Provisioning<br/>the dead time"]:::branch
    X["The excess<br/>held, retried, failed or refused"]:::leaf
    D -->|"requests"| S
    S -->|"Size: CPU utilization, capped at the limit"| C
    S -->|"Time: the backlog, work that already waited"| C
    D -->|"State: the first-attempt rate, blind to debt"| C
    C -->|"order pods"| P
    P -->|"pods ready after the dead time"| S
    S -->|"Where the excess goes"| X
    X -.->|"timeouts become retries"| D
{% end %}

<figcaption>Where each question reads the loop. Three questions read a different signal into the same controller: utilization from the pods, the backlog from the queue, and first attempts from the clients. The fourth follows the work the loop cannot serve while new pods are on order, and the dashed edge is the path by which that work returns as more demand.</figcaption>

Each part has four beats. It starts from a belief an engineer can reasonably hold, with evidence that the belief is held. It reads the mechanism as it actually runs, from source. It derives a law and states the range where the law holds. It closes with the bill: what the law costs, when the advice reverses, and which observation on a real cluster would prove it wrong.

The specimen is Kubernetes at tag v1.34.0. It is the evidence for the argument rather than its subject. Every result is stated for the class of controller it belongs to: a sampled, quantized ratio controller acting through a provisioning delay. Each result is then shown on the controller most engineers already run.

Every number in this post comes from executed code. A plain port of the controller's calculation, read from the v1.34.0 source and checked against eight test cases from the upstream Kubernetes test suite, drives a fluid model of the service. Each figure states the assumptions that produce it. The times, counts and ratios the model prints belong to this specimen and illustrate the laws; they are not measurements of any cluster. What carries over is the laws themselves, and the direction in which each assumption moves the numbers.

## The Belief: the Metric Measures Load

{{ layer(n=1, type="Bound", id="the-api-default-is-eighty") }}When a HorizontalPodAutoscaler is created without naming a metric, the API fills one in. It picks CPU utilization with a target of 80%. The constant is `DefaultCPUUtilization = 80`, in `pkg/apis/autoscaling/annotations.go`. The comment beside it says it applies "provided no other metrics are present"{{ cite(ref="1", title="The Kubernetes Authors (2025) -- kubernetes/kubernetes v1.34.0, pkg/apis/autoscaling and pkg/controller/podautoscaler") }}. A default records what the designers expect most users to want. This one says: watch how busy the pods are, and keep them about four-fifths busy.

That choice rests on a belief worth stating plainly, because it is reasonable. A busier pod means more work is arriving. If utilization doubles, roughly twice the work is arriving, so roughly twice the pods are needed. The metric is read as a measurement of load. The target is read as a cost setting: run hotter to pay for fewer pods, or run cooler to keep headroom.

The documentation states the rule in the same spirit. Its algorithm section opens: "From the most basic perspective, the HorizontalPodAutoscaler controller operates on the ratio between desired metric value and current metric value"{{ cite(ref="2", title="The Kubernetes Authors (2026) -- Horizontal Pod Autoscaling, Algorithm details, kubernetes.io documentation") }}. The formula that follows is the one most engineers can recite:

{% katex(block=true) %}
\text{desiredReplicas} = \left\lceil \text{currentReplicas} \times \frac{\text{currentMetricValue}}{\text{desiredMetricValue}} \right\rceil
{% end %}

{{ layer(n=1, type="Bound", id="rolik-volkov-read-it-as") }}Published work reads the controller the same way. Rolik and Volkov study the over-regulation seen in horizontal pod autoscaling. They model it as a proportional regulator in a feedback loop with delay, and test proportional-integral-derivative designs against it{{ cite(ref="3", title="Rolik, O. & Volkov, V. (2024) -- Method of horizontal pod scaling in Kubernetes to omit overregulation, Information, Computing and Intelligent Systems, No. 5, 55-67") }}. Their abstract names the problem as "the over-regulation effect that occurs under certain conditions by horizontal pod autoscaling".

Below saturation the belief holds well. If the metric can report the load, the ratio rule computes the right count in one step: a service at 100% of a 50% target on ten pods needs twenty, and the rule asks for twenty. The model confirms it. With the CPU limit set a hundred times above the request, so that the metric never saturates, a twofold, tenfold and thirtyfold step each peak at exactly the pods needed. The proportional reading of the controller is accurate in that regime.

Two things are left out. The one-line formula is not the calculation the controller runs, and the metric it divides by has a ceiling. The first matters for stability, and the second for everything else in this post.

## The Rule Everyone Quotes and the Rule That Runs

The documentation does not hide the difference. Below the formula, in prose, it describes how pods that are not yet ready are set aside before the ratio is computed, and how pods whose metrics are missing are handled. The one-line rule is a summary. What follows is the calculation itself, read from `replica_calculator.go` and `horizontal.go` at v1.34.0{{ cite(ref="1", title="The Kubernetes Authors (2025) -- kubernetes/kubernetes v1.34.0, pkg/apis/autoscaling and pkg/controller/podautoscaler") }}.

- {{ layer(n=1, type="Bound", id="pods-are-sorted-into-groups") }}**Grouping.** Every pod the autoscaler targets is sorted into a group before any arithmetic happens. Pods being deleted and failed pods are ignored. Pending pods count as unready. Pods with no metric count as missing. For CPU, a running pod also counts as unready while it is inside its initialization period and either reports not-ready or has not yet produced a full metric window since it became ready.
- {{ layer(n=1, type="Bound", id="the-ratio-uses-ready-pods") }}**The ratio.** The usage ratio comes from the ready pods only: their summed usage over their summed requests, truncated to a whole percentage, divided by the target. With no unready or missing pods, the answer is `ceil(usageRatio × readyPodCount)`. The `currentReplicas` of the documentation is, in this branch of the code, the number of ready pods.
- {{ layer(n=1, type="Bound", id="unready-pods-count-as-zero") }}**Unready pods on a scale-up.** If the ratio says scale up and some pods are not yet ready, those pods are added back with a usage of zero. The ratio is recomputed over all of them, and the new count is `ceil(newRatio × podsInTheCalculation)`. Missing metrics are treated the same way on a scale-up. On a scale-down they count as full use of their request.
- {{ layer(n=1, type="Bound", id="direction-reversal-holds") }}**The hold.** If the recomputed ratio falls inside the tolerance, or points the other way from the first ratio, the controller keeps the current count. The default tolerance is 10% either side of the target.
- {{ layer(n=1, type="Bound", id="limits-and-stabilization") }}**Limits.** Two limits apply afterwards on the default path. A scale-up in one sync may not exceed `max(2 × current, 4)` replicas. A scale-down is held to the highest recommendation of the last five minutes. The controller syncs every 15 seconds.

### One Sync, Walked Through

{{ layer(n=3, type="Estimate", id="walked-sync") }}The port runs the calculation on concrete inputs. Take pods requesting one core, a 50% target, and every ready pod at its limit, which is the saturated case. Hold the ready pods fixed and sweep the number already on order, from none to many.

<div style="margin:1.5em 0;">
<canvas id="chart-reach" role="img" aria-label="Pods ordered by one sync of the ported CPU calculation against the replicas already there, ready plus on order, with every ready pod at its limit and a 50% target. With 10 ready the sync orders 10 pods when nothing is on order and one fewer for each pod already ordered, reaching zero at 18 replicas, two short of twice the ready pods. With 20 ready it orders 20, falling to zero at 36 replicas." style="width:100%;height:290px;display:block;"></canvas>
<figcaption>One sync of the ported CPU calculation, swept over the pods already ordered. Every pod on order reduces what the sync orders by one, so the total never passes twice the ready pods (dashed). The tolerance band stops it a little short: at 18 replicas with 10 ready, and at 36 with 20.</figcaption>
<script>
(function(){var S={"id":"chart-reach","h":290,"ml":[34,42],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[10,10],[11,9],[12,8],[13,7],[14,6],[15,5],[16,4],[17,3],[18,0],[19,0],[20,0],[21,0],[22,0],[23,0],[24,0],[25,0],[26,0],[27,0],[28,0],[29,0],[30,0],[31,0],[32,0],[33,0],[34,0],[35,0],[36,0],[37,0],[38,0],[39,0],[40,0],[41,0],[42,0],[43,0],[44,0]],"c":"b","w":2.2,"mk":2.5},{"t":"vline","x":20,"c":"b","dash":true},{"t":"txt","x":10,"y":10,"s":"10 ready","al":"left","bl":"bottom","dx":4,"dy":-6,"c":"b","b":true},{"t":"txt","x":20,"y":13,"s":"2 x ready = 20","n":"20","al":"left","bl":"middle","dx":5,"c":"b"},{"t":"txt","x":18,"y":0,"s":"stops at 18","n":"","al":"left","bl":"bottom","dx":4,"dy":-6,"c":"b"},{"t":"line","pts":[[20,20],[21,19],[22,18],[23,17],[24,16],[25,15],[26,14],[27,13],[28,12],[29,11],[30,10],[31,9],[32,8],[33,7],[34,6],[35,5],[36,0],[37,0],[38,0],[39,0],[40,0],[41,0],[42,0],[43,0],[44,0]],"c":"d","w":2.2,"mk":2.5},{"t":"vline","x":40,"c":"d","dash":true},{"t":"txt","x":20,"y":20,"s":"20 ready","al":"left","bl":"bottom","dx":4,"dy":-6,"c":"d","b":true},{"t":"txt","x":40,"y":15,"s":"2 x ready = 40","n":"40","al":"left","bl":"middle","dx":5,"c":"d"},{"t":"txt","x":36,"y":0,"s":"stops at 36","n":"","al":"left","bl":"bottom","dx":4,"dy":-6,"c":"d"}],"X":{"lo":8,"hi":46,"ticks":[[10,"10"],[20,"20"],[30,"30"],[40,"40"]],"title":"replicas already there, ready plus on order","ntitle":"replicas, ready + on order"},"Y":{"lo":0,"hi":23,"ticks":[[0,"0"],[5,"5"],[10,"10"],[15,"15"],[20,"20"]],"title":"pods this sync orders","ntitle":"pods ordered"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=1, type="Bound", id="walked-sync-reading") }}The ratio over the ready pods is 2 at every point of the sweep, and what the sync orders changes only through the pods not yet ready. With ten pods ready and nothing on order, the sync orders ten more and the count doubles. With six already on order, sixteen replicas in all, the ordered pods dilute the utilization over all pods to 62%, the recomputed count is 20, and the sync orders four. At eighteen replicas the dilution brings the ratio inside the tolerance band and the controller holds, two short of twice the ready pods. Beyond that, the recomputed ratio points downward while the first one points upward, and the direction rule holds as well: at forty replicas with ten ready the utilization over all pods is 25%, and nothing is ordered. Every pod on order reduces what the sync orders by one, so no sync ever takes the total past twice the ready pods.

{{ layer(n=1, type="Bound", id="status-shows-the-original") }}One detail is worth keeping for later. The documentation states that "the original value for the average utilization is reported back via the HorizontalPodAutoscaler status, without factoring in the not-yet-ready pods or missing metrics, even when the new usage ratio is used"{{ cite(ref="2", title="The Kubernetes Authors (2026) -- Horizontal Pod Autoscaling, Algorithm details, kubernetes.io documentation") }}. The number on the status is not the number the decision used. During the first round of an overload the status reads 100% while the decision runs on 62%, then 50%. An engineer reading the status sees a controller that ignores a saturated metric. The controller is in fact acting on a diluted one.

{{ layer(n=1, type="Bound", id="same-at-v1-30") }}None of this is new in v1.34.0. Comparing the same files at v1.30.0, the only differences are in how the tolerance is expressed. That release has one symmetric value. The later one has separate values for scaling up and down, with an alpha feature gate, off by default, that lets a single autoscaler override them. The ready-only ratio, the zero for unready pods, the grouping, the initialization rule, the stabilization maximum and the scale-up limit are identical at both tags.

### What the Pull Requests Say It Was For

{{ layer(n=1, type="Bound", id="pr-33593-purpose") }}The rule that unready pods count as zero arrived in 2016, in a change titled "HPA: Consider unready pods separately"{{ cite(ref="4", title="kubernetes/kubernetes pull request #33593 (2016) -- HPA: Consider unready pods separately") }}. Its description gives two reasons in its own words. Pods "frequently use extra CPU during initialization, so we want to consider them separately." The effect is that "unready pods cause the autoscaler to be a bit more conservative" in "anticipation of the new pods later becoming ready and handling load." The same description states the hold: a recomputation "cannot change the direction of the scale."

{{ layer(n=1, type="Bound", id="prs-2018-window") }}The rule about a full metric window came two years later, in two changes merged a week apart{{ cite(ref="5", title="kubernetes/kubernetes pull request #67252 (2018) -- Fix HPA sample sanitization") }}{{ cite(ref="6", title="kubernetes/kubernetes pull request #68068 (2018) -- Change CPU sample sanitization in HPA") }}. The first describes the failure it fixed. Pods that burn CPU while starting trigger a scale-up. When they become ready, their start-up usage triggers another one, "even though existing pods can handle work, no problem."

{{ layer(n=2, type="Fit", id="anticipating-capacity-ordered") }}Read together, these describe a controller designed to account for capacity it has already ordered. A pod that has been requested but is not yet serving is counted at zero usage, so the controller does not order it twice. That is a deliberate departure from the one-line rule. Neither description claims the design was meant to prevent instability under delay, and this post does not claim it either. The descriptions do say enough to explain why the instability of the next section never appears in the deployed controller.

## What the Quoted Rule Does With Stale Data

Take the one-line rule at its word and feed it a replica count that is out of date. An engineer does exactly this when reasoning about the autoscaler from the formula. The thought runs: "utilization is at 100% on 10 pods, the target is 50%, so it will ask for 20." A hand-written scaler that multiplies the replica count it last read by the latest ratio does the same in code.

Suppose the load is steady and needs exactly 10 pods at the target. The metric the rule divides by reflects the pods that were serving when it was measured, d sync periods ago. The multiplier is the current count. Write {% katex() %}N_t{% end %} for the replicas after sync t and {% katex() %}u_t{% end %} for the measured utilization:

{% katex(block=true) %}
N_{t+1} = N_t \cdot \frac{u_t}{u^\ast}, \qquad u_t = \frac{\lambda}{c\, N_{t-d}}
{% end %}

where:

- {% katex() %}\lambda{% end %} - the arriving load, in requests per second
- {% katex() %}c{% end %} - the rate one pod serves at full use
- {% katex() %}u^\ast{% end %} - the target utilization
- {% katex() %}d{% end %} - how many sync periods old the serving count behind the metric is

Taking logarithms turns the product into a sum with no approximation. Let {% katex() %}x_t = \ln N_t - \ln N^\ast{% end %} be the deviation from the steady count {% katex() %}N^\ast = \lambda / (c\, u^\ast){% end %}. Then:

{% katex(block=true) %}
x_{t+1} = x_t - x_{t-d}
{% end %}

<span id="prop-1"></span>
<details>
<summary>Proposition 1 -- Stale Ratio Rule: the one-line rule settles in one step with fresh data, oscillates forever at one stale period, and diverges at two or more</summary>

**Proposition 1** (Stale Ratio Rule). *The one-line ratio rule, applied to a replica count d sync periods old under steady load, settles in one step when d = 0. It oscillates with period 6 and constant amplitude when d = 1. It diverges for every d of 2 or more.*

*Proof.* The characteristic equation of {% katex() %}x_{t+1} = x_t - x_{t-d}{% end %} is

{% katex(block=true) %}
z^{d+1} - z^{d} + 1 = 0
{% end %}

At d = 0 the equation is {% katex() %}z = 0{% end %}, so the deviation vanishes after one step. At d = 1 the roots are {% katex() %}e^{\pm i\pi/3}{% end %}. Both lie on the unit circle and are distinct, so the deviation rotates with period 6 and never decays.

For d of 2 or more, the polynomial is monic with constant term 1, so the product of the moduli of its d + 1 roots is 1. A root on the unit circle must satisfy {% katex() %}|z| = 1{% end %} and {% katex() %}|z - 1| = 1{% end %}, which leaves only {% katex() %}z = e^{\pm i\pi/3}{% end %}. The derivative {% katex() %}z^{d-1}\big((d+1)z - d\big){% end %} vanishes only at 0 and at {% katex() %}d/(d+1){% end %}, both inside the circle, so roots on the circle are simple. At most two of the roots lie on the circle. At least d - 1 of them are off it, and their moduli still multiply to 1. Since d - 1 is at least 1, at least one root lies strictly outside the unit circle, and the deviation grows geometrically. {% katex() %}\square{% end %}

</details>

{{ layer(n=1, type="Bound", id="levin-may-condition") }}The general form of this equation carries a gain, {% katex() %}x_{t+1} = x_t - a\, x_{t-d}{% end %}. Levin and May gave the condition for its equilibrium to be asymptotically stable{{ cite(ref="7", title="Levin, S.A. & May, R.M. (1976) -- A note on difference-delay equations, Theoretical Population Biology 9, 178-187") }}. Liz and two coauthors restate it as a bound on the gain that shrinks with the delay{{ cite(ref="8", title="Liz, E., Tkachenko, V. & Trofimchuk, S. (2006) -- Global stability in discrete population models with delayed-density dependence, Mathematical Biosciences 199, 26-37") }}:

{% katex(block=true) %}
a < 2\cos\!\left(\frac{d\,\pi}{2d+1}\right) = 2\sin\!\left(\frac{\pi}{2(2d+1)}\right)
{% end %}

The one-line rule has a gain of exactly 1. The bound is 2 at d = 0, 1 at d = 1, 0.618 at d = 2 and 0.445 at d = 3. The rule sits precisely on the edge at one stale period and beyond it at every longer delay, which is what the proof above shows directly.

{{ layer(n=3, type="Estimate", id="stale-rule-numbers") }}With a load that needs 10 pods and a start at 8, the rule fed fresh data goes to 10 and stays there. One period stale, it runs 10, 12.5, 12.5, 10, 8, 8 and repeats forever. Two periods stale, it swings wider each cycle. After forty syncs the count is off by more than thirty orders of magnitude, a number with no physical meaning except that the loop has lost control.

<div style="margin:1.5em 0;">
<canvas id="chart-stale" role="img" aria-label="Largest stable gain against staleness in sync periods. The exact bound falls from 2.000 at zero periods to 1.000 at one, 0.618 at two, 0.445 at three and 0.347 at four. The sufficient bound one over one plus d lies below it. The one-line rule has gain 1, which touches the exact bound at one period and lies above it from two periods on." style="width:100%;height:300px;display:block;"></canvas>
<figcaption>The largest gain at which the stale ratio rule still settles, against how many sync periods old its replica count is. The rule's gain of 1 meets the exact bound at one stale period, where it oscillates forever, and exceeds it from two periods on, where it diverges. The sufficient bound, Proposition 22 of Self-Healing Without Connectivity, sits well inside the exact one.</figcaption>
<script>
(function(){var S={"id":"chart-stale","h":300,"ml":[40,50],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"hline","y":1,"c":"a","w":2},{"t":"txt","x":4.3,"y":1,"s":"the one-line rule: gain 1","n":"rule: gain 1","al":"right","bl":"bottom","dy":-3,"c":"a","b":true},{"t":"line","pts":[[0,2.0],[1,1.0],[2,0.618],[3,0.445],[4,0.347]],"c":"b","mk":4},{"t":"line","pts":[[0,1.0],[1,0.5],[2,0.333],[3,0.25],[4,0.2]],"c":"g","dash":true,"mk":3,"open":true},{"t":"txt","x":0,"y":2.0,"s":"2.000","al":"left","bl":"bottom","dx":6,"dy":-2,"c":"b"},{"t":"txt","x":1,"y":1.0,"s":"1.000","al":"left","bl":"bottom","dx":6,"dy":-2,"c":"b"},{"t":"txt","x":2,"y":0.618,"s":"0.618","al":"left","bl":"bottom","dx":6,"dy":-2,"c":"b"},{"t":"txt","x":3,"y":0.445,"s":"0.445","al":"left","bl":"bottom","dx":6,"dy":-2,"c":"b"},{"t":"txt","x":4,"y":0.347,"s":"0.347","al":"left","bl":"bottom","dx":6,"dy":-2,"c":"b"},{"t":"txt","x":0.55,"y":1.62,"s":"exact bound, Levin and May","n":"exact bound","c":"b","bl":"bottom"},{"t":"txt","x":2.0,"y":0.05,"s":"sufficient bound 1/(1+d)","n":"sufficient 1/(1+d)","c":"g","bl":"bottom"},{"t":"txt","x":1.4,"y":1,"s":"on the edge: period 6","n":"","al":"left","bl":"bottom","dy":-5,"c":"ink"},{"t":"txt","x":3,"y":0.445,"s":"beyond it: diverges","n":"diverges","al":"center","bl":"bottom","dy":-26,"c":"ink"}],"X":{"lo":-0.2,"hi":4.3,"ticks":[[0,"0"],[1,"1"],[2,"2"],[3,"3"],[4,"4"]],"title":"sync periods of staleness, d","ntitle":"staleness d (syncs)"},"Y":{"lo":0,"hi":2.2,"ticks":[[0,"0"],[0.5,"0.5"],[1,"1.0"],[1.5,"1.5"],[2,"2.0"]],"title":"largest stable gain","ntitle":"stable gain"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=1, type="Bound", id="prop-22-sufficient") }}The same equation appeared in this blog before, as Proposition 22 of [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md). That proposition bounded the gain of a delayed healing loop by {% katex() %}K < 1/(1+d){% end %}. The bound is sufficient but not exact. At d = 1 it allows a gain of 0.5 where the exact bound allows 1. For the healing loop the conservative bound was the point, because a margin was wanted. Here the exact one matters, because the ratio rule sits on its edge. Delay in a feedback loop is a known source of oscillation in computing systems{{ cite(ref="9", title="Hellerstein, J.L., Diao, Y., Parekh, S. & Tilbury, D.M. (2004) -- Feedback Control of Computing Systems, Wiley-IEEE Press") }}. The one-line rule is a feedback loop with a gain of one, which leaves no room for any delay at all.

{{ layer(n=2, type="Fit", id="why-deployed-escapes") }}The deployed controller does not fall into this trap. It never multiplies by a stale count. Each sync it recomputes from the usage of the ready pods and counts ordered pods at zero. In effect it computes the total demand the ready pods report and divides by the target, and the walked-through sync shows the effect. An engineer who reasons from the one-line rule therefore predicts an oscillation the controller does not have, and misses the weakness it does have.

{{ layer(n=2, type="Fit", id="what-the-engineer-gets-wrong") }}That substitution is the first lesson about how the loop is understood. The quoted rule is a model of the controller, and engineers use the model to reason about stability, tuning and incidents. Its errors are systematic. It sees a danger that the code removed in 2016, and it gives no hint of the price the code pays for removing it.

{{ layer(n=2, type="Fit", id="stale-abstraction") }}[Sufficient Abstraction and the Cost of Asking the Wrong Question Twice](@/blog/2026-08-30/index.md) gave this kind of error its general form. An abstraction can be sufficient for one question and silent about another, and the information it discarded cannot be recovered by reasoning from the abstraction itself. The one-line rule is sufficient for "how many pods does this load need?" when the metric can see the load. It discarded the unready-pod rule, and with it every question about what the controller does while capacity is on its way. The only way back to that information is the raw source, which is why this post reads the code before it derives anything.

## A Metric With a Ceiling

The weakness sits in the numerator. CPU utilization is usage divided by request, and usage cannot exceed what the pod is allowed to use.

<span id="def-1"></span>
<details>
<summary>Definition 1 -- Saturated Metric: a utilization signal whose value per pod cannot exceed the pod's allowance, so above that point it stops carrying the size of the load</summary>

**Definition 1** (Saturated Metric). *A utilization metric is saturated when every ready pod is using its full allowance. Its value per pod is then at its bound:*

{% katex(block=true) %}
\frac{\text{usage}}{\text{request}} \le \frac{\ell}{r}
{% end %}

where:

- {% katex() %}\ell{% end %} - the CPU limit of a pod
- {% katex() %}r{% end %} - its CPU request, the denominator of utilization

*While the metric is saturated, every arriving load above the pods' combined capacity produces the same reading.*

</details>

{{ layer(n=1, type="Bound", id="limit-equals-request") }}With the limit equal to the request, a common setting for predictable scheduling, the ceiling is 100% utilization. A service carrying twice its capacity and a service carrying thirty times its capacity both read 100%. With the limit at twice the request, the ceiling is 200%, and the same collapse happens one level higher.

{{ layer(n=2, type="Fit", id="ceiling-is-general") }}CPU is the familiar case, but the ceiling belongs to the form of the metric. Any signal defined as a fraction of a pod's own capacity has one. Connections in use over the pool size behave the same way, and so do worker threads busy over threads available, or memory in use over a container limit. Each measures how full a pod is. None can say how much more is waiting to get in, because the excess never reaches the pod to be counted. Every signal of this form saturates at the point where the autoscaler is needed most.

{{ layer(n=2, type="Fit", id="ashby-variety") }}Ashby's law of requisite variety says a regulator can only counter as many distinct disturbances as its channel can distinguish{{ cite(ref="10", title="Ashby, W.R. (1956) -- An Introduction to Cybernetics, Chapman and Hall, Chapter 11, The Law of Requisite Variety") }}. A saturated utilization metric distinguishes every load below capacity and collapses every load above it into one value. The disturbances an autoscaler exists for are the ones larger than current capacity, and those are the ones its default channel cannot tell apart. This is an analogy, tagged as one, and the arithmetic below does not depend on it.

{{ layer(n=1, type="Bound", id="integer-channel") }}The channel is also coarse below the ceiling. The calculation truncates utilization to a whole percentage before dividing, so at a 50% target the controller distinguishes about a hundred levels of load per pod up to capacity. Above capacity it distinguishes one. The truncation returns later in this post as a source of lost rounds.

The belief that the metric measures load holds below saturation. Above it, the metric reports only that the load is too large. To size the load the loop needs something else, and the controller can do just one thing: add pods and see whether the reading falls.

## How Far One Recommendation Reaches

When the metric is saturated, the ratio the controller computes over its ready pods is fixed: the ceiling over the target. Call it the growth factor.

{% katex(block=true) %}
g = \frac{\ell}{r \cdot u^\ast}
{% end %}

{{ layer(n=1, type="Bound", id="reach-per-sync") }}While pods are being added the new count is `ceil(newRatio × podsInTheCalculation)`, with ordered pods at zero usage. That product equals the summed usage of the ready pods over the request and the target. It can never exceed g times the ready pods, rounded up to a whole pod, and the whole-percent truncation only lowers it. A hold can leave the count above that product, as the sweep in the walked-through sync shows, but a hold orders nothing. Ordering more pods does not raise it, because ordered pods contribute zero. The count rises again only when new pods become ready and start reporting usage of their own.

<span id="def-2"></span>
<details>
<summary>Definition 2 -- Round: the time from ordering a pod to the controller counting its usage, which is the provisioning delay plus one metric window</summary>

**Definition 2** (Round). *A round is the time from the sync at which a pod is ordered to the first sync at which the controller counts the pod as ready and uses its usage:*

{% katex(block=true) %}
T_{\text{round}} \approx \tau + w_{\text{metric}}
{% end %}

where:

- {% katex() %}\tau{% end %} - the dead time: from the order until the pod serves traffic, including scheduling, image pull and start-up
- {% katex() %}w_{\text{metric}}{% end %} - the metric window reported with each CPU sample, because during the initialization period a pod's sample is ignored until a full window has been collected since it became ready; the model uses 30 seconds

*Alignment with the 15-second sync adds up to one sync to each round.*

</details>

<span id="prop-2"></span>
<details>
<summary>Proposition 2 -- At Most One Factor per Round: with a saturated metric, ready pods grow by at most g per round, so a k-fold overload needs at least ceil(log_g(k u* r / l)) rounds before capacity meets it</summary>

**Proposition 2** (At Most One Factor per Round). *Let a service run {% katex() %}N_0{% end %} pods at target {% katex() %}u^\ast{% end %}, and let the load step to k times its previous rate, with k large enough to saturate the metric. While the metric stays saturated, the controller multiplies its ready pods by at most g per round, up to rounding to a whole pod. Serving capacity therefore cannot meet the load in fewer than*

{% katex(block=true) %}
R(k) = \left\lceil \log_g \frac{k\, u^\ast}{\ell / r} \right\rceil \quad \text{rounds}
{% end %}

*Up to that rounding: whole pods replace {% katex() %}N_0{% end %} and the needed count {% katex() %}N^\ast{% end %} by {% katex() %}N_0 + \delta{% end %} and {% katex() %}N^\ast + \delta{% end %}, with {% katex() %}\delta = 1/(g-1){% end %}, inside the logarithm. Reaching capacity is not recovery. The backlog built during those rounds still has to drain, and the target utilization returns only at k times the original pods.*

*Proof.* Before the step the pods carry {% katex() %}N_0 u^\ast{% end %} pods' worth of work at full use. After it they must carry {% katex() %}k N_0 u^\ast{% end %}. Capacity at full use is {% katex() %}N \ell / r{% end %} in the same units, so capacity meets the load only when {% katex() %}N \ge k N_0 u^\ast r/\ell{% end %}. By the reach argument, no recommendation exceeds {% katex() %}\lceil gN \rceil < gN + 1{% end %} for N ready pods, and the ready count changes only when ordered pods complete a round. Without rounding, after R rounds the ready count is at most {% katex() %}N_0 g^R{% end %}, which reaches {% katex() %}N^\ast = k N_0 u^\ast r/\ell{% end %} only for R at least the stated value. With rounding, {% katex() %}N + \delta{% end %} grows by at most g per round, so {% katex() %}N_0 + \delta{% end %} and {% katex() %}N^\ast + \delta{% end %} take the place of {% katex() %}N_0{% end %} and {% katex() %}N^\ast{% end %}. In the specimen, with {% katex() %}N_0 = 10{% end %} and g = 2, both forms give the same round count for every overload tested. {% katex() %}\square{% end %}

</details>

{{ layer(n=2, type="Fit", id="lower-growth-band") }}The proposition is a bound, and the next question is how close the controller comes to it. The tolerance band sets the floor. The controller stops ordering only when the recomputed ratio over all pods falls to 1 + tolerance or below. So within a round, once the ready count settles, the ordered count reaches at least about {% katex() %}g/(1+\text{tol}){% end %} times the ready pods. The truncation to a whole percent lowers that by up to one percentage point of utilization. Growth per round therefore lies between roughly g / 1.1 and g at the default tolerance.

{{ layer(n=3, type="Estimate", id="band-ends-a-round") }}The band does cost rounds in practice when the ready count rises in two steps within one round. Take a tenfold step at a 63% target. In the second round the controller sees 14 pods ready and orders 23, which is g times 14 rounded up. One sync later 16 pods are ready. The recomputed utilization over 23 pods is 69%, a ratio of 1.095 against the target, and that is inside the band. The controller holds at 23 where g times 16 would have been 26. The run needs five rounds and 585 seconds where Proposition 2 allows four.

{{ layer(n=1, type="Bound", id="not-the-scale-up-limit") }}The scale-up limit of `max(2 × current, 4)` per sync is not what binds at moderate g. A round spans several syncs and the limit caps each one. What binds is that ordered pods count as zero, which caps the whole round at g. The controller's design for anticipating capacity, the same feature that removed the instability of Proposition 1, is what sets the pace.

At a 50% target with the limit equal to the request, g is 2. Each round can at most double the ready pods, and a k-fold overload takes at least {% katex() %}\lceil \log_2 (k/2) \rceil{% end %} rounds. Each round reveals at most one binary digit of the overload's size.

> **Physical translation.** A thermometer that stops at 100 degrees cannot tell a warm oven from a burning kitchen. A cook who needs to know which one it is has the controller's options and no others: open the door a little, wait, and see whether the reading drops. Each wait costs a dead time, and each glance can at most double what the cook knows about the heat. The slowness belongs to the instrument, which tops out exactly where the measurement starts to matter.

### Two Consequences of the Bound

<span id="cor-1"></span>
<details>
<summary>Corollary 1 -- Dead Band: if the growth factor is inside the tolerance band, a saturated metric never triggers a scale-up at all</summary>

**Corollary 1** (Dead Band). *If the saturated reading divided by the target lies inside the tolerance band, so that*

{% katex(block=true) %}
\frac{\lfloor 100\, \ell / r \rfloor}{100\, u^\ast} \le 1 + \text{tol}
{% end %}

*then the controller holds its count however large the overload. With the limit equal to the request and the default tolerance, this happens at every target of 91% or above.*

*Proof.* With every ready pod saturated and no pods on order, the first ratio is the left-hand side. When it lies inside the band, the calculation returns the current count. No pod is ordered, so the next sync sees the same inputs. {% katex() %}\square{% end %}

</details>

{{ layer(n=3, type="Estimate", id="dead-band-edge") }}The port puts the edge between a 90% and a 91% target. Ten saturated pods draw a recommendation of 13 at an 80% target and 12 at every tested target from 85% to 90%. From 91% on they draw 10, the count they already have, and the controller stops. A 3x overload run at a 93% target never gets capacity at all, as the figure below shows.

{{ layer(n=2, type="Fit", id="dead-band-reading") }}This is the extreme case of the same mechanism, and it is a configuration someone could choose for good reasons. A team that pays for every idle core might push the target toward 95% to cut cost. The cost setting works as intended while load stays below capacity. Above capacity the loop goes silent, and the status reports 100% utilization against a 95% target, close enough to look like a controller near its goal.

<span id="cor-2"></span>
<details>
<summary>Corollary 2 -- Hottest Target: sizing a k-fold overload within R rounds requires a target no hotter than (l/r) k^(-1/(R+1))</summary>

**Corollary 2** (Hottest Target). *For a service to reach capacity under a k-fold overload within R rounds, its target must satisfy*

{% katex(block=true) %}
u^\ast \le \frac{\ell}{r}\, k^{-1/(R+1)}
{% end %}

*The condition is necessary, up to the rounding of Proposition 2, and not sufficient: at or below this target, the tolerance band or the whole-percent truncation can still cost a round.*

*Proof.* Write a for {% katex() %}\ell / r{% end %}. Proposition 2 requires {% katex() %}g^R \ge k u^\ast / a{% end %}, with {% katex() %}g = a / u^\ast{% end %}. Substituting gives {% katex() %}a^{R+1} \ge k\, (u^\ast)^{R+1}{% end %}, which rearranges to the stated bound. {% katex() %}\square{% end %}

</details>

The model computes the hottest whole-percent target for each case and then runs the simulation at that target, with the limit equal to the request.

<div style="margin:1.5em 0;">
<canvas id="chart-hottest" role="img" aria-label="Hottest target allowed by Corollary 2 against the round budget, one curve per overload. 3x: 57, 69, 80, 85 and 93% for budgets of 1, 2, 4, 6 and 15 rounds. 10x: 31, 46, 63, 71, 86%. 30x: 18, 32, 50, 61, 80%. 100x: 10, 21, 39, 51, 74%. Targets of 91% and above fall in a shaded dead band. Three simulated cells miss their budget and are circled: 3x at 93% never scales, 10x at 63% takes 585 s, 100x at 10% takes 210 s." style="width:100%;height:340px;display:block;"></canvas>
<figcaption>The hottest whole-percent target Corollary 2 allows for each overload and round budget, with the limit equal to the request. Each point was then simulated at that target. Circled points missed their budget: the 93% target sits in the dead band of Corollary 1, the tolerance band ends a round early at 63%, and truncation leaves the 10% order one pod short. A round costs about 120 s in the specimen; a point counts as late only beyond R rounds plus one 15-second sync of alignment.</figcaption>
<script>
(function(){var S={"id":"chart-hottest","h":340,"ml":[36,44],"mr":[34,40],"mt":24,"mb":42,"els":[{"t":"hband","y0":91,"y1":100,"c":"a","al":0.14},{"t":"txt","x":0.9,"y":95.5,"s":"dead band: a saturated metric never scales","n":"dead band","al":"left","c":"a","dx":4},{"t":"line","pts":[[1,57],[2,69],[4,80],[6,85],[15,93]],"c":"c","mk":3.5},{"t":"txt","x":15,"y":93,"s":"3x","al":"left","dx":9,"c":"c","b":true},{"t":"pt","x":15,"y":93,"c":"a","r":8,"open":true},{"t":"txt","x":15,"y":93,"s":"93%: never scales","n":"93%","al":"right","bl":"bottom","dx":-10,"dy":-4,"c":"a"},{"t":"line","pts":[[1,31],[2,46],[4,63],[6,71],[15,86]],"c":"b","mk":3.5},{"t":"txt","x":15,"y":86,"s":"10x","al":"left","dx":9,"c":"b","b":true},{"t":"pt","x":4,"y":63,"c":"a","r":8,"open":true},{"t":"txt","x":0.95,"y":84,"s":"circled: 10x at 63%, 585 s, a round late","n":"","al":"left","bl":"middle","c":"a"},{"t":"txt","x":4,"y":63,"s":"","n":"63%","al":"right","bl":"bottom","dx":-10,"dy":-6,"c":"a"},{"t":"line","pts":[[1,18],[2,32],[4,50],[6,61],[15,80]],"c":"e","mk":3.5},{"t":"txt","x":15,"y":80,"s":"30x","al":"left","dx":9,"c":"e","b":true},{"t":"line","pts":[[1,10],[2,21],[4,39],[6,51],[15,74]],"c":"d","mk":3.5},{"t":"txt","x":15,"y":74,"s":"100x","al":"left","dx":9,"c":"d","b":true},{"t":"pt","x":1,"y":10,"c":"a","r":8,"open":true},{"t":"txt","x":1,"y":10,"s":"10%: 210 s, a round late","n":"10%","al":"left","bl":"top","dx":8,"dy":6,"c":"a"}],"X":{"lo":0.85,"hi":18,"log":true,"ticks":[[1,"1"],[2,"2"],[4,"4"],[6,"6"],[15,"15"]],"title":"round budget R, log scale","ntitle":"round budget R (log)"},"Y":{"lo":0,"hi":100,"ticks":[[0,"0%"],[20,"20%"],[40,"40%"],[60,"60%"],[80,"80%"],[100,"100%"]],"title":"hottest target allowed","ntitle":"hottest target"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="hottest-target-reading") }}Most points land within their round budget. Three do not, and each one is instructive. At 3x and 93% the target falls in the dead band of Corollary 1, so the controller never scales. At 10x and 63% the tolerance band ends a round early, the case traced above. At 100x and 10% the controller's order lands one pod short after truncation, and it needs a second round to make up for it. A target set at the edge of the bound is a target with no margin. The corollary tells an engineer where the edge is.

{{ layer(n=2, type="Fit", id="hottest-target-use") }}The corollary turns the target into a design calculation. Start from the largest overload the service must survive and the time it may take, and divide that time by the round to get R. The hottest target that can meet the overload follows, with no simulation and no tuning. A target chosen as a cost setting, without that calculation, has fixed the recovery time as a side effect.

## The Staircase

{{ layer(n=3, type="Estimate", id="staircase-specimen") }}The running specimen makes the bound concrete. It has ten pods at a 50% target, a limit equal to the request, a 90-second dead time and a 30-second metric window, so a round costs about two minutes. The model runs the ported calculation every 15 seconds against a fluid queue.

<div style="margin:1.5em 0;">
<canvas id="chart-staircase-time" role="img" aria-label="Time until capacity meets the load against overload on a log scale: 105 s at 3x (1 round), 225 s at 5x (2), 345 s at 10x (3), 480 s at 30x (4), 705 s at 100x (6) and 945 s at 300x (8). On the log scale the points lie close to a straight line." style="width:100%;height:280px;display:block;"></canvas>
<figcaption>Time until capacity meets the load against the size of the overload, on a log scale. A straight line here means time grows with the logarithm of the overload: one round of about two minutes per doubling. Model: fluid queue, no timeouts or retries, every pod serves its full rate when saturated.</figcaption>
<script>
(function(){var S={"id":"chart-staircase-time","h":280,"ml":[38,48],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[3.0,105.0],[5.0,225.0],[10.0,345.0],[30.0,480.0],[100.0,705.0],[300.0,945.0]],"c":"b","mk":4},{"t":"txt","x":3.0,"y":105.0,"s":"105 s, 1 round","n":"105 s","al":"left","bl":"top","dx":6,"dy":6,"c":"b"},{"t":"txt","x":5.0,"y":225.0,"s":"225 s, 2 rounds","n":"225 s","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"b"},{"t":"txt","x":10.0,"y":345.0,"s":"345 s, 3 rounds","n":"345 s","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"b"},{"t":"txt","x":30.0,"y":480.0,"s":"480 s, 4 rounds","n":"480 s","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"b"},{"t":"txt","x":100.0,"y":705.0,"s":"705 s, 6 rounds","n":"705 s","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"b"},{"t":"txt","x":300.0,"y":945.0,"s":"945 s, 8 rounds","n":"945 s","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"b"}],"X":{"lo":2.5,"hi":380,"log":true,"ticks":[[3,"3x"],[5,"5x"],[10,"10x"],[30,"30x"],[100,"100x"],[300,"300x"]],"title":"overload, log scale","ntitle":"overload (log)"},"Y":{"lo":0,"hi":1100,"ticks":[[0,"0 s"],[250,"250 s"],[500,"500 s"],[750,"750 s"],[1000,"1000 s"]],"title":"time until capacity meets the load","ntitle":"time to capacity"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="staircase-reading") }}Time to capacity grows with the logarithm of the overload. A hundredfold overload takes about twice as long to meet as a tenfold one, rather than ten times as long. At g = 2 the controller attains the bound at every overload in the figure, from one round at 3x to eight at 300x, and each time is the round count times two minutes, less up to one sync of alignment. That is the good news in the figure, and it is real: the time to meet an overload is gentle in the size of the shock.

<div style="margin:1.5em 0;">
<canvas id="chart-staircase-backlog" role="img" aria-label="Peak backlog in seconds of the original load against overload, both on log scales: 105 at 3x, 447 at 5x, 1,836 at 10x, 10,530 at 30x, 55,869 at 100x and 224,841 at 300x. A dashed line shows growth in proportion to the overload from the 3x point, reaching 10,500 at 300x; the measured backlog rises above it more steeply." style="width:100%;height:280px;display:block;"></canvas>
<figcaption>Peak backlog against the size of the overload, both on log scales. The dashed line is what growth in proportion to the overload would look like. The backlog climbs more steeply than that, because every round is paid in full at the new rate. Model: as in the figure above.</figcaption>
<script>
(function(){var S={"id":"chart-staircase-backlog","h":280,"ml":[44,54],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[3,105.0],[300,10500.0]],"c":"g","w":1.2,"dash":true},{"t":"txt","x":30,"y":1050.0,"s":"growth in proportion to the overload","n":"proportional","al":"left","bl":"top","dx":4,"dy":8,"c":"g"},{"t":"line","pts":[[3.0,105.0],[5.0,447.0],[10.0,1836.0],[30.0,10530.0],[100.0,55869.0],[300.0,224841.0]],"c":"a","mk":4},{"t":"txt","x":3.0,"y":105.0,"s":"105","n":"105","al":"left","bl":"top","dx":6,"dy":8,"c":"a"},{"t":"txt","x":5.0,"y":447.0,"s":"447","n":"","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"a"},{"t":"txt","x":10.0,"y":1836.0,"s":"1,836","n":"","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"a"},{"t":"txt","x":30.0,"y":10530.0,"s":"10,530","n":"10,530","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"a"},{"t":"txt","x":100.0,"y":55869.0,"s":"55,869","n":"","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"a"},{"t":"txt","x":300.0,"y":224841.0,"s":"224,841","n":"224,841","al":"right","bl":"bottom","dx":-6,"dy":-6,"c":"a"}],"X":{"lo":2.5,"hi":380,"log":true,"ticks":[[3,"3x"],[5,"5x"],[10,"10x"],[30,"30x"],[100,"100x"],[300,"300x"]],"title":"overload, log scale","ntitle":"overload (log)"},"Y":{"lo":50,"hi":500000,"log":true,"ticks":[[100,"100"],[1000,"1k"],[10000,"10k"],[100000,"100k"]],"title":"peak backlog, seconds of the original load (log)","ntitle":"peak backlog (log)"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="staircase-backlog") }}The backlog is the bad news. The backlog is the work that arrived while capacity was short. It grows much faster than the time does, because each round lasts the same two minutes while the shortfall in each round grows with the overload. From 10x to 100x the time to capacity roughly doubles and the peak backlog grows about thirtyfold. A logarithmic number of rounds, each paid in full at the new rate, produces a backlog that grows faster than the overload itself.

The next figure shows what neither of these can: the three runs are indistinguishable until the smaller overload stops.

<div style="margin:1.5em 0;">
<canvas id="chart-staircase" role="img" aria-label="Pods ordered against time for overloads of three, ten and thirty times, on a doubling scale. All three lines are identical for the first 150 seconds: 10 pods, then 20 ordered, then 40 ordered. The three-times line stops at 40 and later falls to 30. The ten-times line continues to 80, 159 and 317. The thirty-times line continues to 630 and then past 1,000. Dashed lines mark the pods at which capacity first meets each load: 15, 50 and 150." style="width:100%;height:340px;display:block;"></canvas>
<figcaption>Pods ordered after a load step of 3x, 10x and 30x in the running specimen, on a doubling scale. The first two orders are identical in all three runs: the saturated metric reads the same, so the controller asks for the same. A run separates from the others only after its capacity has met its load, and each keeps climbing past its dashed line while the backlog drains.</figcaption>
<script>
(function(){var S={"id":"chart-staircase","h":340,"ml":[36,48],"mr":[34,44],"mt":24,"mb":42,"els":[{"t":"hline","y":15,"c":"c","w":1,"dash":true},{"t":"hline","y":50,"c":"b","w":1,"dash":true},{"t":"hline","y":150,"c":"a","w":1,"dash":true},{"t":"line","pts":[[0,10],[15,10],[15,16],[30,16],[30,20],[135,20],[135,32],[150,32],[150,40],[255,40],[255,64],[270,64],[270,80],[375,80],[375,128],[390,128],[390,159],[495,159],[495,255],[510,255],[510,317],[615,317],[615,508],[630,508],[630,630],[735,630],[735,1008],[750,1008],[750,1250],[780,1250]],"c":"a","w":2},{"t":"txt","x":780,"y":1250,"s":"30x","al":"left","dx":5,"c":"a","b":true},{"t":"line","pts":[[0,10],[15,10],[15,16],[30,16],[30,20],[135,20],[135,32],[150,32],[150,40],[255,40],[255,64],[270,64],[270,80],[375,80],[375,128],[390,128],[390,159],[495,159],[495,255],[510,255],[510,317],[780,317]],"c":"b","w":2},{"t":"txt","x":780,"y":317,"s":"10x","al":"left","dx":5,"c":"b","b":true},{"t":"line","pts":[[0,10],[15,10],[15,16],[30,16],[30,20],[135,20],[135,32],[150,32],[150,40],[555,40],[555,30],[780,30]],"c":"c","w":2},{"t":"txt","x":780,"y":30,"s":"3x","al":"left","dx":5,"c":"c","b":true},{"t":"txt","x":8,"y":120,"s":"all three runs share one line until 150 s","n":"one line until 150 s","al":"left","c":"ink"},{"t":"txt","x":34,"y":12.3,"s":"16 first: the 30 s window is half full at the first sync","n":"","al":"left","c":"sub"},{"t":"txt","x":8,"y":1000,"s":"dashed: pods at which capacity first meets each load","n":"dashed: capacity meets load","al":"left","c":"sub"}],"X":{"lo":0,"hi":780,"ticks":[[0,"0 s"],[120,"120 s"],[240,"240 s"],[360,"360 s"],[480,"480 s"],[600,"600 s"],[720,"720 s"]],"nticks":[[0,"0 s"],[240,"240 s"],[480,"480 s"],[720,"720 s"]],"title":"seconds after the step","ntitle":"seconds after the step"},"Y":{"lo":8,"hi":1600,"log":true,"ticks":[[10,"10"],[20,"20"],[40,"40"],[80,"80"],[160,"160"],[320,"320"],[640,"640"],[1280,"1280"]],"title":"pods ordered, doubling scale","ntitle":"pods ordered, doubling scale"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="sub-steps") }}Each round shows two sub-steps, 16 then 20, and 32 then 40. They come from the 30-second averaging window. At the first sync after the step, part of the window still holds the old reading, so the first order is smaller. At the next sync the window is full and the walked-through calculation gives 20. Rounding, the averaging window and the sync alignment together account for every difference between the measured times and two minutes per round.

{{ layer(n=3, type="Estimate", id="figure-repeats") }}The figure repeats the times above and adds two things they cannot show. The first is the shared trunk: for 150 seconds the three runs are one line. The second is how far each run climbs past its dashed line. The 30x run meets its load once 159 pods are serving, above its need of 150, and has ordered 1,250 by 750 seconds, because pods ordered during the backlog keep arriving after the need has passed.

## The Price of a Target

The target is usually chosen as a cost setting. Proposition 2 says it is also an information rate. The growth factor is the limit over the request over the target, so a hotter target means a smaller g and more rounds to size the same overload. A trade-off of that kind needs its achievable region stated before anything is chosen from it.

<span id="def-3"></span>
<details>
<summary>Definition 3 -- Target Achievable Region: each choice of target and limit is a point in steady-state pods against rounds to size an overload; the frontier is the set no other choice beats on both</summary>

**Definition 3** (Target Achievable Region). *For a design overload k, each choice of target {% katex() %}u^\ast{% end %} and allowance {% katex() %}\ell / r{% end %} maps to the point*

{% katex(block=true) %}
\Big( \tfrac{1}{u^\ast},\; R(k) \Big)
{% end %}

*Its first coordinate is the pods held per pod of steady demand. Its second is the rounds from Proposition 2. The achievable region is the set of all such points. A point is on the frontier if no other choice has both fewer pods and no more rounds.*

</details>

For a thirtyfold overload in the running specimen, each choice of target and limit lands at one point of the region.

<div style="margin:1.5em 0;">
<canvas id="chart-frontier" role="img" aria-label="Rounds to meet a thirtyfold overload against pods held per pod of steady demand. With the limit equal to the request: 25% target holds 4.00 and takes 2 rounds, 50% holds 2.00 and takes 4, 60% holds 1.67 and takes 6, 70% holds 1.43 and takes 9, 80% holds 1.25 and takes 15. At a 50% target, a limit twice the request takes 2 rounds and four times takes 1, both holding 2.00, which dominates the 25% point." style="width:100%;height:330px;display:block;"></canvas>
<figcaption>The achievable region of Definition 3 for a thirtyfold overload. Blue: targets with the limit equal to the request, every one on the frontier. Green: a 50% target with the limit raised to twice and four times the request. The 25% point needs twice the steady pods of the green point at the same two rounds, so it is dominated once the limit can vary. Model: as in the staircase figure.</figcaption>
<script>
(function(){var S={"id":"chart-frontier","h":330,"ml":[32,40],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[1.25,15],[1.4285714285714286,9],[1.6666666666666667,6],[2.0,4],[4.0,2]],"c":"b","mk":4},{"t":"txt","x":1.25,"y":15,"s":"80%, 1,785 s","n":"80%","al":"left","bl":"middle","dx":7,"dy":0,"c":"b"},{"t":"txt","x":1.4285714285714286,"y":9,"s":"70%, 1,065 s","n":"70%","al":"left","bl":"middle","dx":7,"dy":0,"c":"b"},{"t":"txt","x":1.6666666666666667,"y":6,"s":"60%, 705 s","n":"60%","al":"left","bl":"middle","dx":7,"dy":0,"c":"b"},{"t":"txt","x":2.0,"y":4,"s":"50%, 480 s","n":"50%","al":"left","bl":"bottom","dx":6,"dy":-8,"c":"b"},{"t":"txt","x":4.0,"y":2,"s":"25%, 225 s","n":"25%","al":"right","bl":"bottom","dx":-4,"dy":-8,"c":"b"},{"t":"pt","x":2.0,"y":2,"c":"c","r":5},{"t":"txt","x":2.0,"y":2,"s":"50%, limit 2x request, 225 s","n":"limit 2x","al":"left","bl":"middle","dx":8,"c":"c"},{"t":"pt","x":2.0,"y":1,"c":"c","r":5},{"t":"txt","x":2.0,"y":1,"s":"50%, limit 4x request, 120 s","n":"limit 4x","al":"left","bl":"middle","dx":8,"c":"c"},{"t":"txt","x":4.0,"y":2,"s":"dominated","al":"center","bl":"top","dy":8,"c":"a","b":true},{"t":"txt","x":1.25,"y":15,"s":"API default","n":"default","al":"left","bl":"bottom","dx":-4,"dy":-8,"c":"ink"}],"X":{"lo":1.0,"hi":4.3,"ticks":[[1,"1"],[1.5,"1.5"],[2,"2"],[2.5,"2.5"],[3,"3"],[3.5,"3.5"],[4,"4"]],"title":"pods held per pod of steady demand","ntitle":"pods per pod of demand"},"Y":{"lo":0,"hi":16.5,"ticks":[[0,"0"],[4,"4"],[8,"8"],[12,"12"],[16,"16"]],"title":"rounds to meet a 30x overload","ntitle":"rounds, 30x overload"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="reading-target-region") }}With the limit fixed at the request, every target is on the frontier, and the blue curve is steep at the cheap end. Moving from 50% to 80% saves three-eighths of the steady pods and costs eleven more rounds. At the default, a thirtyfold overload takes nearly half an hour to meet. That is the bill for reading the target only as a cost setting.

{{ layer(n=3, type="Estimate", id="dominated-point") }}Once the limit can vary, the frontier changes shape. A 25% target with the limit at the request and a 50% target with the limit at twice the request have the same growth factor of 4. They take the same two rounds and the same 225 seconds. The first holds four pods per pod of demand and the second holds two. The 25% point is dominated. Headroom bought by lowering the target costs twice what the same information rate costs when bought through the limit.

{{ layer(n=2, type="Fit", id="limit-moves-frontier") }}The limit does not come free. CPU above the request is borrowed from the node, which has it only if the scheduler left it free. The lever trades this loop's information rate for headroom on the node. That trade belongs in the node's capacity plan, where the risk of several services borrowing at once can be priced. A limit raised in one service's configuration, with no such plan, moves the risk to whichever service is scheduled next to it.

{{ layer(n=2, type="Fit", id="what-the-default-says") }}Read through Definition 3, the API default makes a choice on the user's behalf. Eighty percent sits at the cheap end of the frontier: few idle pods, slow sizing. That suits a service whose load changes gradually, where the metric rarely saturates. It suits badly a service whose worst day is a step. Nothing in the default is wrong. It answers a question about cost, and the question about recovery time was never asked.

## Scaling as Probing

{{ layer(n=2, type="Fit", id="dual-control-reading") }}[Dual Control and the Weaponized Probe](@/blog/2026-09-20/index.md) took from Feldbaum the idea of an action that both regulates a system and tests the controller's estimate of it{{ cite(ref="11", title="Feldbaum, A.A. (1960-61) -- Theory of Dual Control, I-IV, Avtomatika i Telemekhanika") }}. A saturated autoscaler is such a controller without having been designed as one. Every scale-up regulates, by adding capacity. It also probes, by revealing whether capacity is now enough. The probe has a fixed resolution of one factor of g and a fixed price of one round of provisioning delay.

{{ layer(n=2, type="Fit", id="probe-cannot-be-skipped") }}This reading explains why the probe cannot be skipped. The controller has no other way to learn the size of an overload its metric cannot show. It also explains why a faster provisioning path helps more than any tuning of the controller's policy. A shorter dead time leaves the amount learned per round unchanged and lowers what each round costs.

{{ layer(n=3, type="Estimate", id="bits-per-round") }}At g = 2, sizing a thirtyfold overload means learning that the load exceeds 2, 4, 8 and 16 times the starting capacity, in that order. That takes four rounds, four bits and about eight minutes in the specimen. At g = 1.25 each round learns about a third of a bit, since the base-2 logarithm of 1.25 is 0.32. That is why the default target needs fifteen rounds.

{{ layer(n=2, type="Fit", id="probe-overshoots") }}A probe that multiplies also overshoots, by construction. The last round that crosses the need can land anywhere up to g times past it, because the controller cannot stop between factors. At g = 2 the round that crosses the need can order up to twice the capacity required. At g = 1.25 the overshoot from the probe itself is small, and the price is paid in rounds instead. The target sets an exchange rate between two errors: time spent short and capacity bought in excess.

{{ layer(n=2, type="Fit", id="information-reading-limits") }}The information reading has a limit, and it should be stated. It describes what the controller can learn from its own signal. It says nothing about information the controller is never given. An operator who knows a launch is coming knows the overload's size before the first round, and can set the replica count directly. The bound in this post applies to a loop left alone with a saturated metric, which is the loop on duty at three in the morning.

## Overshoot, and Why the Bound Is Optimistic

{{ layer(n=3, type="Estimate", id="overshoot") }}Capacity meeting the load does not end the run. The backlog built during the rounds keeps every pod busy after capacity is sufficient, the metric stays saturated, and the controller keeps multiplying. In the tenfold run, capacity meets the load at 345 seconds, when the 64 pods ordered at 255 seconds begin serving. The count keeps climbing to 317 before the backlog drains. The overshoot ratio grows with the overload, from 1.33 at 3x to 6.46 at 300x.

{{ layer(n=3, type="Estimate", id="non-saturating-control") }}The overshoot comes from the ceiling rather than from the controller's arithmetic. Run the same steps with a limit a hundred times the request, so that the metric never saturates. The peak then equals the pods needed at every overload tested: 2x, 10x and 30x. The controller sees the load, computes the right count and stops there.

{{ layer(n=2, type="Fit", id="overshoot-rounds") }}Round arithmetic accounts for the size of the overshoot. While ready capacity is below demand or a backlog remains, the metric reads full and each round doubles the pods. Count the rounds until the backlog is gone and double that many times. The count gives 40 pods at 3x, exactly the simulated peak. At 10x it gives 320 against 317 simulated, at 30x 1,280 against 1,250, and at 300x 20,480 against 19,373. It never comes out below the simulated peak. It misses once, at 5x, where it predicts 160 and the run peaks at 80. The backlog left after the third round is small enough to clear before the next order, so the coarse count takes a doubling the run never does. The peak follows how long the backlog lasts, so anything that slows the drain raises it.

{{ layer(n=3, type="Estimate", id="efficiency-degraded") }}The figures so far assume a saturated pod still serves its full rate. Real pods under full load lose some of it to contention, memory pressure and context switching. The model can lower the efficiency of a saturated pod while its CPU still reads full:

<div style="margin:1.5em 0;">
<canvas id="chart-efficiency-time" role="img" aria-label="Time until capacity meets the load against the rate a saturated pod still serves. Tenfold overload: 345 s at 100% and 80%, 465 s at 60% and 40%. Thirtyfold: 480 s at 100%, 585 s at 80% and 60%, 705 s at 40%." style="width:100%;height:260px;display:block;"></canvas>
<figcaption>What degradation under load does to the time until capacity meets the load, for a tenfold and a thirtyfold overload. As saturated pods serve less of their nominal rate, capacity arrives a round or two later. Model: as in the staircase figures.</figcaption>
<script>
(function(){var S={"id":"chart-efficiency-time","h":260,"ml":[40,50],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[1.0,345.0],[0.8,345.0],[0.6,465.0],[0.4,465.0]],"c":"b","mk":4},{"t":"txt","x":0.4,"y":465.0,"s":"10x","al":"right","bl":"middle","dx":-10,"c":"b","b":true},{"t":"txt","x":1.0,"y":345.0,"s":"345 s","n":"345 s","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":0.8,"y":345.0,"s":"345 s","n":"","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":0.6,"y":465.0,"s":"465 s","n":"","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":0.4,"y":465.0,"s":"465 s","n":"465 s","al":"center","bl":"top","dy":8,"c":"b"},{"t":"line","pts":[[1.0,480.0],[0.8,585.0],[0.6,585.0],[0.4,705.0]],"c":"d","mk":4},{"t":"txt","x":0.4,"y":705.0,"s":"30x","al":"right","bl":"middle","dx":-10,"c":"d","b":true},{"t":"txt","x":1.0,"y":480.0,"s":"480 s","n":"480 s","al":"center","bl":"bottom","dy":-8,"c":"d"},{"t":"txt","x":0.8,"y":585.0,"s":"585 s","n":"","al":"center","bl":"bottom","dy":-8,"c":"d"},{"t":"txt","x":0.6,"y":585.0,"s":"585 s","n":"","al":"center","bl":"bottom","dy":-8,"c":"d"},{"t":"txt","x":0.4,"y":705.0,"s":"705 s","n":"705 s","al":"center","bl":"bottom","dy":-8,"c":"d"}],"X":{"lo":0.33,"hi":1.07,"ticks":[[0.4,"40%"],[0.6,"60%"],[0.8,"80%"],[1.0,"100%"]],"title":"rate a saturated pod still serves","ntitle":"saturated pod rate"},"Y":{"lo":0,"hi":820,"ticks":[[0,"0 s"],[200,"200 s"],[400,"400 s"],[600,"600 s"],[800,"800 s"]],"title":"time until capacity meets the load","ntitle":"time to capacity"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

<div style="margin:1.5em 0;">
<canvas id="chart-efficiency-peak" role="img" aria-label="Peak pods over pods needed against the rate a saturated pod still serves. Tenfold: 3.17 at 100% and 80%, 6.30 at 60%, 10.08 at 40%. Thirtyfold: 4.17 at 100% and 80%, 8.27 at 60%, 13.23 at 40%." style="width:100%;height:260px;display:block;"></canvas>
<figcaption>The same runs, peak pods over pods needed. The overshoot roughly doubles at 60% and triples at 40%, because a slower drain keeps the metric saturated and the controller multiplying for longer.</figcaption>
<script>
(function(){var S={"id":"chart-efficiency-peak","h":260,"ml":[40,50],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[1.0,3.17],[0.8,3.17],[0.6,6.3],[0.4,10.08]],"c":"b","mk":4},{"t":"txt","x":0.4,"y":10.08,"s":"10x","al":"right","bl":"middle","dx":-10,"c":"b","b":true},{"t":"txt","x":1.0,"y":3.17,"s":"3.17x","n":"3.17x","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":0.8,"y":3.17,"s":"3.17x","n":"","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":0.6,"y":6.3,"s":"6.30x","n":"","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":0.4,"y":10.08,"s":"10.08x","n":"10.08x","al":"center","bl":"top","dy":8,"c":"b"},{"t":"line","pts":[[1.0,4.17],[0.8,4.17],[0.6,8.27],[0.4,13.23]],"c":"d","mk":4},{"t":"txt","x":0.4,"y":13.23,"s":"30x","al":"right","bl":"middle","dx":-10,"c":"d","b":true},{"t":"txt","x":1.0,"y":4.17,"s":"4.17x","n":"4.17x","al":"center","bl":"bottom","dy":-8,"c":"d"},{"t":"txt","x":0.8,"y":4.17,"s":"4.17x","n":"","al":"center","bl":"bottom","dy":-8,"c":"d"},{"t":"txt","x":0.6,"y":8.27,"s":"8.27x","n":"","al":"center","bl":"bottom","dy":-8,"c":"d"},{"t":"txt","x":0.4,"y":13.23,"s":"13.23x","n":"13.23x","al":"center","bl":"bottom","dy":-8,"c":"d"}],"X":{"lo":0.33,"hi":1.07,"ticks":[[0.4,"40%"],[0.6,"60%"],[0.8,"80%"],[1.0,"100%"]],"title":"rate a saturated pod still serves","ntitle":"saturated pod rate"},"Y":{"lo":0,"hi":14.5,"ticks":[[0,"0x"],[4,"4x"],[8,"8x"],[12,"12x"]],"title":"peak pods over pods needed","ntitle":"peak pods over pods needed"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="efficiency-reading") }}Lower efficiency costs in two places. Capacity takes a round longer to meet the load, sometimes two, because each pod carries less. The backlog drains more slowly, so the metric stays saturated longer and the controller keeps ordering. At 40% efficiency a tenfold overload peaks at ten times the pods it needs. The CPU reading cannot tell a pod working at full efficiency from a pod thrashing, so the controller multiplies on both alike.

{{ layer(n=3, type="Estimate", id="lower-bound-reading") }}Proposition 2's round count is therefore a lower bound on recovery, and the staircase's overshoot is a lower bound on over-provisioning. A cluster whose pods degrade under load will fare worse on both counts than the staircase figures show. The fluid model also leaves out timeouts and retries, which add work during exactly the rounds when capacity is short. Every assumption the model makes points the same way: toward a faster, cleaner recovery than a real service gets.

{{ layer(n=2, type="Fit", id="governance-limiting-case") }}The limiting case is a service whose throughput per pod falls as pods are added. [The Governance Tax](@/blog/2026-04-16/index.md) described it past the peak of the scalability curve. Each added pod raises the CPU per pod, the controller reads that as under-capacity, and the cluster climbs to its configured maximum and stays there. The mechanism is the one in this section, with efficiency falling to the point where added capacity subtracts throughput. A ratio controller that cannot see efficiency has no way to tell that case apart from an ordinary overload.

## Where This Sits Among Known Results

{{ layer(n=1, type="Bound", id="knative-unbounded") }}None of the mechanism here is hidden. The handling of unready pods is documented. A common alternative is to scale on request rate, concurrency or queue depth instead of CPU. Knative's autoscaler takes that route. Its default metric is concurrency, which counts requests in flight and waiting, so it does not saturate the way utilization does. It also enters a panic mode with a window one-tenth of its 60-second stable window. The documentation explains the default threshold: "panic mode will be started if traffic is twice as high as the current replica population can handle"{{ cite(ref="12", title="Knative Authors (2026) -- Configuring the Knative Pod Autoscaler and Autoscaling metrics, knative.dev documentation") }}.

{{ layer(n=1, type="Bound", id="setup-time-known") }}The dead time itself is well documented outside Kubernetes. Gandhi and three coauthors measured a setup time of 260 seconds for an application server. They reported 30 seconds to a minute for a locally created virtual machine and 10 to 15 minutes for one obtained from a cloud provider, and observed that a reactive policy "lags in turning servers on" because of it{{ cite(ref="13", title="Gandhi, A., Harchol-Balter, M., Raghunathan, R. & Kozuch, M.A. (2012) -- AutoScale: Dynamic, Robust Capacity Management for Multi-Tier Data Centers, ACM Transactions on Computer Systems 30(4)") }}. The specimen's 90 seconds sits at the short end of that range, so every time in this post is, if anything, optimistic.

{{ layer(n=2, type="Fit", id="rolik-comparison") }}The proportional-regulator reading of Rolik and Volkov attributes over-regulation to the feedback loop, and their remedy changes the control law. This post locates the over-provisioning elsewhere: in a saturated signal, combined with a controller that anticipates ordered capacity and so cannot over-order within a round. The two readings are compatible. They point at different levers, and the levers have different costs.

{{ layer(n=2, type="Fit", id="not-found-claim") }}Three results were not found in the sources read for this post. The first is the round bound of Proposition 2 with its reading as an information rate. The second is the observation that the controller's anticipation of ordered capacity is what caps each round. The third is the dead band and the hottest-target condition. They are offered as this post's contribution, with a caution: absence from the sources read does not prove that nobody has written them down.

{{ layer(n=2, type="Fit", id="unbounded-is-not-free") }}An unbounded signal removes this post's problem and introduces another. A signal that counts waiting work counts the backlog. The backlog is a quantity that integrates past shortfalls. How a loop driven by it behaves under the same provisioning delay is a different question, and this post does not answer it.

## The Binding Constraint, in Sequence

{{ layer(n=2, type="Fit", id="csf-sequence") }}[The Constraint Sequence Framework](@/blog/2025-12-27/index.md) asks which constraint binds first and insists the rest wait their turn. For a saturated autoscaler the arithmetic fixes the order. The dead time binds first, because it sets the price of every round. The metric ceiling binds second, because it sets how much each round can learn. The tolerance band and truncation bind third, and only at the edge of a round budget. The scale-up limit per sync binds last, if at all, because a round spans several syncs.

{{ layer(n=2, type="Fit", id="csf-sequence-consequence") }}Tuning in the reverse order is common, and the sequence says why it disappoints. A scaling policy that allows more pods per sync changes the constraint that binds least. A lower target changes the second constraint at a steep price in idle pods. A faster image pull, a smaller start-up path or a warm pool changes the first one. It is also the only change that makes every round cheaper without making the steady state more expensive.

## Falsification Criteria

A claim that cannot be wrong is not a claim. Each criterion below names the observation on a real cluster that would refute this post, with the prediction the model makes for it. The runs use a 16-core node, pods requesting and limited to 250 millicores, four pods at a 50% target before the step and a replica ceiling of 50. The predictions come from the same model, sized to that cluster.

**F1 (the same first request).**
- *Condition:* two load steps of different size, both large enough to saturate the metric: 3x and 5x.
- *Prediction:* both runs order 7 pods, then 8 within one sync, then 14 and 16 one round later.
- *Refuted if:* the orders differ between the two runs before the 3x run's capacity meets its load.

**F2 (at most one factor per round).**
- *Condition:* the same two steps, timed from the step to the moment serving capacity meets the load.
- *Prediction:* 105 s for 3x and 225 s for 5x, one round apart, with peaks of 16 and 32 pods against 12 and 20 needed at the target.
- *Refuted if:* the ready count rises faster than twice per round, or the 5x run meets its load in the same round as the 3x run.

**F3 (the ceiling causes the overshoot).**
- *Condition:* the 5x step repeated with the CPU limit at 1,000 millicores, four times the request, so that the metric does not saturate.
- *Prediction:* the count rises to the 20 pods needed at the target and no further, and capacity meets the load at the step, because each pod can use four times its request.
- *Refuted if:* the overshoot persists with a metric that does not saturate.

**F4 (the dead band).**
- *Condition:* a 3x step with the target set to 93% and the limit at the request.
- *Prediction:* no scale-up for as long as the step lasts, with the status reporting 100% against 93%.
- *Refuted if:* the controller adds pods.

## The Ledger of What the Loop Cannot Know

This series keeps one artifact across its four parts: a row per part, naming what the loop cannot know, the belief that hides it, the mechanism, the law and the bill.

**Size**

*Belief:* the metric measures load.

*Mechanism:* the controller computes from ready pods and counts ordered pods at zero, so a saturated reading caps each round at g times the ready pods.

*Law:* Proposition 2, at least {% katex() %}\lceil \log_g (k u^\ast r / \ell) \rceil{% end %} rounds until capacity meets a k-fold load. Corollary 1, no scale-up at all when g lies inside the tolerance band. Corollary 2, the hottest target that can meet a k-fold load within R rounds. Layer 1 for the mechanism and the bounds; Layer 3 for the specimen's times.

*Bill:* about two minutes per round in the specimen. Fifteen rounds for a thirtyfold overload at the API's default target. Overshoot of 1.3 to 6.5 times the needed pods. All of it worse when saturated pods degrade.

## What This Post Did Not Claim

### Where Each Claim Holds

**Claim.** A saturated utilization metric lets the controller multiply ready pods by at most g per round.
- *Assumption:* the controller runs the v1.34.0 calculation on the default path, with no `behavior` block, and pods have equal requests.
- *Failure mode:* custom scale-up policies can cap a round below g, which makes the round count larger, never smaller.

**Claim.** A round costs the dead time plus one metric window.
- *Assumption:* pods report ready when they start serving, the metric window is 30 seconds, and the cluster has free node capacity for every pod ordered.
- *Failure mode:* a readiness probe that passes before a pod can serve shortens the counted round and lets the controller count capacity that does not yet exist.
- *Failure mode:* when the nodes are full, new pods wait for new nodes. The dead time then grows with the size of the order, in steps of one node's worth of pods, and every round is longer than the specimen's.

**Claim.** At targets of 91% and above, with the limit at the request, a saturated metric never triggers a scale-up.
- *Assumption:* the default tolerance of 10%, symmetric.
- *Failure mode:* a per-autoscaler tolerance, behind the `HPAConfigurableTolerance` feature gate (alpha and off by default at v1.34.0), moves the edge of the dead band to {% katex() %}1/(1+\text{tol}){% end %}.

**Claim.** The staircase and overshoot numbers describe the specimen.
- *Assumption:* a fluid queue, a 90-second dead time, no timeouts or retries, and pods serving their full rate when saturated.
- *Failure mode:* every one of these is optimistic. Timeouts, retries and degradation make recovery slower and overshoot larger.

**Reversal condition.** The advice of this post is to read the target as an information rate and to spend effort on the dead time first. It reverses when the metric cannot saturate in the overloads that matter. That happens with a limit far above the request and node headroom to match, or with a signal that counts waiting work. The controller then sizes an overload in one step, and the costs that matter come from somewhere else.

### What Is Not Claimed

Every number in this post comes from a model of one specimen, run against a port of the controller's arithmetic. The staircase, the overshoot ratios, the hottest-target sweep and the dead band's edge make the bounds checkable in one concrete case. Change the dead time, the metric window or the efficiency of a saturated pod and the numbers move. The bound of Proposition 2 and the conditions of its two corollaries do not.

It has not been claimed that the Kubernetes autoscaler is badly designed. Counting ordered pods at zero removes a real instability, although the pull requests that introduced it gave other reasons, and the slow learning this post prices is the cost of that choice rather than a defect in it. Nor has it been claimed that CPU is the wrong metric for every service. Below saturation it measures load well, and a service whose worst day arrives gradually may never meet the bound at all.

Two open questions are named on purpose. The reading of scaling as probing, one bit per round at a growth factor of two, is an interpretation and is tagged as one. And how close the controller comes to the bound when the growth factor sits near the tolerance band is shown here only in simulation; the band can cost a round, and this post has not derived how often it does.

One correction is made on purpose. Proposition 22 of [Self-Healing Without Connectivity](@/blog/2026-01-29/index.md) bounded the gain of a delayed loop by a condition that is sufficient but not exact. That was the right choice for a healing loop that wanted a margin, and the exact bound is used here only because the one-line rule sits precisely on its edge.

### What Is Left Open

The deployed controller avoids the instability that the one-line rule predicts. It pays for that with a slow, fixed rate of learning when its metric saturates. Two ways out suggest themselves, and both lead to new questions.

A signal that does not saturate sees the size of an overload. A signal that counts waiting work, though, is driven by a backlog, and a backlog responds to delay in its own way. A signal that counts only what clients ask for sees demand cleanly. Demand, however, is not all the work a struggling service has to do. Neither question is answered here.

A third question sits underneath both. The bound of this post assumes the controller is the only thing deciding how much work the service accepts. During every round the service is short of capacity, and the excess goes somewhere: into a queue, into timeouts, into retries. This post priced the rounds and left the excess to the fluid queue, which holds everything and loses nothing. Real services lose things.

{% cognitive_map(root="One Bit per Dead Time") %}
{
  "intro": "An autoscaler on CPU utilization asks for the same capacity whether the load doubled or rose thirtyfold. This post reads the Kubernetes controller's source, shows why the textbook rule would oscillate and the deployed one does not, and derives the price the deployed one pays instead: at most one factor of growth per provisioning delay.",
  "groups": [
  {"theme": "The Rule as It Runs", "c": "mint", "points": [
    [1, "The Quoted Rule Is a Summary", "The documentation opens with ceil(currentReplicas x current / desired) and then describes, in prose, how unready pods and missing metrics are set aside. The calculation as run divides the usage of ready pods by the target and counts ordered pods at zero."],
    [2, "Stale Data Breaks the Quoted Rule", "Fed a replica count one sync period old, the one-line rule oscillates forever with period 6; two or more periods old, it diverges. In logarithms it is x[t+1] = x[t] - x[t-d], and its gain of 1 sits on the Levin-May stability bound at one period and beyond it at two."],
    [3, "The Deployed Rule Anticipates Ordered Capacity", "The 2016 change that counts unready pods at zero gives its purpose as start-up CPU noise and anticipation of new pods becoming ready. That design removes the instability of the quoted rule."]
  ]},
  {"theme": "A Metric With a Ceiling", "c": "sky", "points": [
    [4, "Saturation Erases the Size of the Load", "Utilization is usage over request, and usage cannot exceed the limit. With the limit equal to the request, every load above capacity reads 100%."],
    [5, "At Most One Factor per Round", "While saturated, the controller can ask for at most g = limit / (request x target) times the ready pods, because ordered pods count as zero. A k-fold overload therefore needs at least ceil(log_g(k x target x request / limit)) rounds, a round being the dead time plus one metric window."],
    [6, "The Band Can Cost Rounds or Stop the Loop", "The tolerance band ends some rounds early, so growth per round lies between about g / 1.1 and g. If g itself is inside the band, at targets of 91% and above with the limit at the request, the controller never scales."]
  ]},
  {"theme": "The Bill", "c": "peach", "points": [
    [7, "The Target Is an Information Rate", "A hotter target saves pods and costs rounds: for a thirtyfold overload, 4 rounds at 50% and 15 at the API default of 80%. Meeting a k-fold load within R rounds requires a target no hotter than (limit / request) x k^(-1/(R+1))."],
    [8, "Scaling Is Probing", "Each scale-up both adds capacity and reveals whether it is enough. At g = 2 each round learns at most one binary digit of the overload's size; a shorter dead time makes every round cheaper."],
    [9, "Overshoot and an Optimistic Bound", "The backlog keeps pods saturated after capacity suffices, so the loop overshoots: 3.17 times the needed pods at 10x. With pods that degrade under load, recovery is slower and overshoot larger, so the round count is a lower bound."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**The Rule as It Runs**

1. The documentation opens with {% katex() %}\lceil \text{currentReplicas} \times \text{current} / \text{desired} \rceil{% end %} and then describes, in prose, how unready pods and missing metrics are set aside. The calculation as run divides the usage of ready pods by the target and counts ordered pods at zero.
2. Fed a replica count one sync period old, the one-line rule oscillates forever with period 6; two or more periods old, it diverges. In logarithms it is {% katex() %}x_{t+1} = x_t - x_{t-d}{% end %}, and its gain of 1 sits on the Levin-May stability bound at one period and beyond it at two.
3. The 2016 change that counts unready pods at zero gives its purpose as start-up CPU noise and anticipation of new pods becoming ready. That design removes the instability of the quoted rule.

**A Metric With a Ceiling**

4. Utilization is usage over request, and usage cannot exceed the limit. With the limit equal to the request, every load above capacity reads 100%.
5. While saturated, the controller can ask for at most {% katex() %}g = \ell / (r\, u^\ast){% end %} times the ready pods, because ordered pods count as zero. A k-fold overload therefore needs at least {% katex() %}\lceil \log_g (k\, u^\ast r / \ell) \rceil{% end %} rounds, a round being the dead time plus one metric window.
6. The tolerance band ends some rounds early, so growth per round lies between about {% katex() %}g / 1.1{% end %} and g. If g itself is inside the band, at targets of 91% and above with the limit at the request, the controller never scales.

**The Bill**

7. A hotter target saves pods and costs rounds: for a thirtyfold overload, 4 rounds at 50% and 15 at the API default of 80%. Meeting a k-fold load within R rounds requires a target no hotter than {% katex() %}(\ell / r)\, k^{-1/(R+1)}{% end %}.
8. Each scale-up both adds capacity and reveals whether it is enough. At g = 2 each round learns at most one binary digit of the overload's size; a shorter dead time makes every round cheaper.
9. The backlog keeps pods saturated after capacity suffices, so the loop overshoots: 3.17 times the needed pods at 10x. With pods that degrade under load, recovery is slower and overshoot larger, so the round count is a lower bound.

</details>

**Compute it.** Take your autoscaler's target and your pods' limit over request, and compute g. If g is 1.1 or less, the loop cannot scale on a saturated metric at all. Otherwise take the largest overload you plan for and compute the rounds, then multiply by your dead time plus your metric window. If the answer is longer than your users will wait, the fix lies in the dead time or the signal. The controller's settings cannot supply it.

The controller learns the size of an overload the only way its metric allows: by paying for capacity and reading what comes back. At a 50% target it learns at most one bit per dead time. At the default, about a third of one.

---
<sup>[1]</sup> The Kubernetes Authors (2025). *kubernetes/kubernetes v1.34.0.* `pkg/apis/autoscaling/annotations.go`; `pkg/controller/podautoscaler/replica_calculator.go`, `horizontal.go` and `metrics/utilization.go`. Released 27 August 2025.

<sup>[2]</sup> The Kubernetes Authors (2026). *Horizontal Pod Autoscaling*, section "Algorithm details." kubernetes.io documentation (kubernetes/website, main branch).

<sup>[3]</sup> Rolik, O. & Volkov, V. (2024). *Method of horizontal pod scaling in Kubernetes to omit overregulation.* Information, Computing and Intelligent Systems, No. 5, 55-67. doi:10.20535/2786-8729.5.2024.315877.

<sup>[4]</sup> kubernetes/kubernetes pull request #33593 (2016). *HPA: Consider unready pods separately.*

<sup>[5]</sup> kubernetes/kubernetes pull request #67252 (2018). *Fix HPA sample sanitization.*

<sup>[6]</sup> kubernetes/kubernetes pull request #68068 (2018). *Change CPU sample sanitization in HPA.*

<sup>[7]</sup> Levin, S.A. & May, R.M. (1976). *A note on difference-delay equations.* Theoretical Population Biology 9, 178-187.

<sup>[8]</sup> Liz, E., Tkachenko, V. & Trofimchuk, S. (2006). *Global stability in discrete population models with delayed-density dependence.* Mathematical Biosciences 199, 26-37.

<sup>[9]</sup> Hellerstein, J.L., Diao, Y., Parekh, S. & Tilbury, D.M. (2004). *Feedback Control of Computing Systems.* Wiley-IEEE Press.

<sup>[10]</sup> Ashby, W.R. (1956). *An Introduction to Cybernetics.* Chapman and Hall (Chapter 11, The Law of Requisite Variety).

<sup>[11]</sup> Feldbaum, A.A. (1960-61). *Theory of Dual Control, I-IV.* Avtomatika i Telemekhanika.

<sup>[12]</sup> Knative Authors (2026). *Configuring the Knative Pod Autoscaler* and *Autoscaling metrics.* knative.dev documentation (knative/docs, main branch).

<sup>[13]</sup> Gandhi, A., Harchol-Balter, M., Raghunathan, R. & Kozuch, M.A. (2012). *AutoScale: Dynamic, Robust Capacity Management for Multi-Tier Data Centers.* ACM Transactions on Computer Systems 30(4), Article 14.
