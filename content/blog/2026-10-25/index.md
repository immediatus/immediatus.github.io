+++
authors = ["Yuriy Polyulya"]
title = "The Barrier the Scaler Cannot Hold"
description = "During the provisioning delay an autoscaler has ordered capacity and controls nothing. This post prices the three ways to survive that interval: run colder, make clients retry less, or refuse work at the door. Under heavy-tailed demand the third bounds the backlog and moves its tail into rejected requests. Time can be bought, and buying it is what shrinks the excess. A limit can only move it."
date = 2026-10-25
slug = "capacity-in-arrears-part4-the-barrier-the-scaler-cannot-hold"

[taxonomies]
tags = ["distributed-systems", "control-theory", "systems-thinking", "queueing-theory"]
series = ["capacity-in-arrears"]

[extra]
toc = false
series_order = 4
series_title = "Capacity in Arrears: Autoscaling Under Dead Time, Saturated Metrics, and Retry Debt"
series_description = """<div class="series-lede">An autoscaler adds capacity for the load it can measure, and an overload is the load it cannot.</div>A utilization metric is bounded by the capacity it reports on, so it reads the same at twice the load and at thirty times. This series follows one widely deployed autoscaler from its source code to its limits, and uses it to test four things engineers reasonably believe about a control loop: that its metric measures load, that a stabilization window makes it stable, that a cleaner signal is a safer one, and that a limit removes a risk. Each part prices what one belief leaves out. The results come from the controller's own arithmetic and from simulations whose assumptions each part states. Every part names the observation, on a real cluster, that would prove it wrong."""
+++

<div class="recap-box">
<span class="recap-label">Argument so far</span>
<ul>
<li><strong><a href="/blog/capacity-in-arrears-part1-one-bit-per-dead-time/">One Bit per Dead Time</a>.</strong> A saturated utilization metric lets the controller multiply its ready pods by at most one growth factor per provisioning delay.</li>
<li><strong><a href="/blog/capacity-in-arrears-part2-the-delay-a-window-demands/">The Delay a Window Demands</a>.</strong> A backlog-driven loop with a stabilization window rests only if every message carries a standing delay of about one dead time.</li>
<li><strong><a href="/blog/capacity-in-arrears-part3-demand-is-not-debt/">Demand Is Not Debt</a>.</strong> Timeouts and retries leave work no client wants. Once triggered, a service stays failed if the amplification times the utilization reaches one, and a scaler blind to that debt can hold it there.</li>
<li><strong>What this post asks next.</strong> During the dead time the scaler can change nothing. What can, and what does it cost?</li>
</ul>
</div>

Watch the first ninety seconds of an overload from inside the service. Demand steps up tenfold. The autoscaler notices within a sync, and its recommendation climbs. Pods are ordered. For the next ninety seconds, while those pods are scheduled, pulled and started, the service runs on exactly the capacity it had before the step. In the specimen of the previous post, good work fell to zero within the first thirty seconds. By the time the first new pod served a request, the queue had already decided how the next hour would go.

Every result in this series has lived inside that interval. The saturated metric of the first post probed one round at a time because each round cost a dead time. The backlog loop of the second needed a standing delay of about one dead time to rest. The retry debt of the third was built during the dead time, when nothing the autoscaler ordered could reach the queue. Each post priced a different consequence of the same fact. During the provisioning delay, the scaler has authority over nothing.

The previous posts let the queue absorb whatever the dead time produced. The queue held all of it, and the controller's only job was to catch up. This post asks where the excess should go instead, who controls that choice, and what each choice costs. It ends where the series must: with what an engineer can compute before the next overload arrives.

<div class="recap-box">
<span class="recap-label">In brief</span>
<ul>
<li><strong>The belief.</strong> A limit removes a risk.</li>
<li><strong>The mechanism.</strong> During the dead time the autoscaler has no authority over the queue; whatever a limit holds back flows into the next quantity without one.</li>
<li><strong>The law.</strong> An admission bound shorter than the client timeout removes the retry debt. A replica ceiling at or below {% katex() %}A\lambda/c{% end %} traps a failing service. A backlog that grows like {% katex() %}K \log K{% end %} keeps the overload's tail index.</li>
<li><strong>The bill.</strong> Refused requests carrying the overload's own excess: on the CPU signal, 11,056 seconds of base load at the 99th percentile, against 11,170 that a queue without retries would hold. A signal that reaches capacity sooner shrinks it.</li>
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

## The Belief: a Limit Removes a Risk

{{ layer(n=1, type="Bound", id="keda-default-ceiling") }}Limits are how operations teams make systems safe, and the tools ship with them already set. KEDA's specification gives every scaled object a replica ceiling unless told otherwise: `maxReplicaCount: 100`, "Optional. Default: 100"{{ cite(ref="1", title="KEDA Authors (2026) -- KEDA documentation v2.19, ScaledObject specification") }}. The Kubernetes autoscaler holds every recommendation under the maximum its owner configures. Retry libraries cap attempts, and queues have sizes.

{{ layer(n=1, type="Bound", id="governance-tax-ceiling") }}This blog has recommended limits too, for good reasons. In [The Governance Tax](@/blog/2026-04-16/index.md) an autoscaler ran past the peak of a service's scalability curve, where each added pod lowers throughput. The fix that post gave was to set "the maximum pod count to 80% of the worst-case" scalability peak, "as a hard ceiling". The ceiling there removes a real risk, a controller that would otherwise climb into the retrograde region and stay.

{{ layer(n=1, type="Bound", id="yanacek-bounds") }}Load shedding is the limit applied at the door. Yanacek describes the practice at a large cloud provider. "In addition to bounding the size of queues, we've found it's extremely important to place an upper bound on the amount of time that an incoming request sits on a queue, and we throw it out if it's too old"{{ cite(ref="2", title="Yanacek, D. (2019) -- Using load shedding to avoid overload, Amazon Builders' Library") }}.

Each of these limits does remove a risk. What the belief leaves out is where the risk goes. A limit on one quantity holds that quantity in place and lets the excess flow into the next quantity that has no limit. Whether the limit made the system safer depends on what it pushed the excess into, and on whether anyone is watching that quantity. This post follows the excess through three limits, a replica ceiling, a retry policy and an admission bound, and prices where each one sends it.

## Where Each Limit Sends the Excess

Every limit in this series held one quantity in place, and every one of them pushed the excess somewhere else. Followed through the four parts, the destinations are specific.

- **The stabilization window** of [The Delay a Window Demands](@/blog/2026-10-11/index.md) limited how fast pods could leave. The excess went into held pods after each peak, and from there into a backlog drained below rest, which the window turned into a hunt.
- **The replica ceiling** limits how many pods the autoscaler may run. When it sits below the amplified need, the excess stays in the queue as retry debt, and the service waits there indefinitely.
- **The retry cap** limits how many times a client tries. The excess the cap stops is a request that fails for the user instead of costing the service another attempt.
- **The admission bound** limits how much work the queue holds. The excess becomes refusals at the door, visible as errors to the clients that receive them.

{{ layer(n=2, type="Fit", id="where-reading") }}Read as a list, the destinations differ in one property that matters more than the size of the excess: who can see it. Held pods appear on the cost report a month later. Retry debt appears as CPU at 100% on pods that are serving nobody, which most dashboards read as a busy service. User failures appear in the success rate and in support tickets. Refusals appear as an error rate the service itself reports at the moment it happens. The admission bound sends the excess to the most visible destination available, and that visibility is part of what makes it the right default.

## Authority and Time Scale

The first question is who can act during the dead time at all. The answer turns on a quantity this series has used without naming.

<span id="def-10"></span>
<details>
<summary>Definition 10 -- Authority: the change an actuator can make to the queue's rate of change within a given horizon</summary>

**Definition 10** (Authority). *An actuator's authority over a queue within a horizon h is the largest change it can make to the queue's rate of change, {% katex() %}dL/dt{% end %}, by actions that take effect within h. An actuator whose actions all take effect after h has zero authority within h.*

</details>

<span id="prop-9"></span>
<details>
<summary>Proposition 9 -- Zero Authority in the Dead Time: within one dead time the autoscaler cannot change the queue; only faster actuators can</summary>

**Proposition 9** (Zero Authority in the Dead Time). *Let a pod ordered at time t first serve at {% katex() %}t + \tau{% end %}. Within any horizon shorter than {% katex() %}\tau{% end %}, the autoscaler has zero authority over the queue. The queue then evolves as*

{% katex(block=true) %}
\frac{dL}{dt} = \lambda_{\text{adm}}(t) - C(t)
{% end %}

*where:*

- {% katex() %}L{% end %} - *all accepted work not yet served, including attempts whose clients have gone*
- {% katex() %}\lambda_{\text{adm}}(t){% end %} - *the work admitted per second, first attempts and retries alike*
- {% katex() %}C(t){% end %} - *the capacity serving at time t, which within the horizon is set entirely by orders placed before it began*

*and only actuators that change {% katex() %}\lambda_{\text{adm}}(t){% end %} within the horizon, or capacity committed before it began, can change the outcome.*

*Proof.* No pod ordered inside the horizon serves inside it, so within the horizon C(t) depends only on orders placed before it began. The queue's rate of change is admitted work minus served work, and only the first term remains open to control. {% katex() %}\square{% end %}

</details>

{{ layer(n=2, type="Fit", id="three-actuators") }}The proposition is almost a definition, and its consequence is not small. Three levers act faster than a pod can start. Clients can send less, by retrying less, and the service can admit less, by refusing work at the door. Both change {% katex() %}\lambda_{\text{adm}}(t){% end %}. Or the service can need less, by having held spare capacity before the overload began, which raises C(t) for the whole horizon and keeps {% katex() %}\lambda_{\text{adm}}(t) - C(t){% end %} small. Everything the autoscaler does arrives one dead time later, and by then the outcome may already be fixed. Proposition 8 of [Demand Is Not Debt](@/blog/2026-10-18/index.md) put a number on that. With a 90-second dead time and a ten-second timeout, any sustained overload above about 11% triggers the trap before the first new pod serves.

{{ layer(n=2, type="Fit", id="two-time-scales") }}The design question therefore has two time scales, and they belong to different mechanisms. On the scale of the dead time, minutes, only admission, retry policy and spare capacity act. On the scale of many dead times, the autoscaler acts, and it is the right tool for matching capacity to demand that has changed for good. A design that asks the autoscaler to handle the first time scale has asked it for authority it does not have.

{{ layer(n=2, type="Fit", id="buying-dead-time") }}The dead time itself can be shortened, and that is the one change that helps every result in this series at once. Its parts are well known: scheduling, pulling an image, starting a process, passing a readiness check. Pre-pulled images, smaller start-up paths and a pool of warm instances each remove part of it. None removes it entirely, and each has a price of its own, usually in idle capacity or operational complexity. Shortening the dead time narrows the interval in which only the fast actuators act. It does not close it, which is why the levers of this post remain necessary however fast the provisioning path becomes.

## Three Levers, Three Bills

Three levers act within the dead time. Each one can keep a service out of the trap of the previous post, and each sends its bill to a different place.

- **Run colder.** A lower utilization target keeps the amplified utilization below one and leaves spare capacity for the first minutes of an overload. The bill is steady-state pods, paid every hour of every day.
- **Retry less.** A retry budget, a lower cap or a client-side concurrency limiter reduces the amplification. A limiter counts only if no layer above it retries what it rejects, the condition [Demand Is Not Debt](@/blog/2026-10-18/index.md) gave. The bill is paid by the clients, who must honour the policy, and by users whose requests fail rather than being retried.
- **Refuse at the door.** An admission bound caps how much work the queue holds. The bill is rejected requests during the overload, and it is the only lever the service operator controls without trusting anyone else.

Under the same sustained tenfold step, with a ten-second timeout, two retries and an autoscaler on first attempts, the three levers compare like this:

| Lever | Steady pods per pod of demand | Who must cooperate | First-attempt work lost |
|---|---|---|---|
| Target lowered to 25% | 4 | nobody | 338 s |
| Retry budget of 20%, target 50% | 2 | every client | 249 s |
| Admission bound of 5 s, target 50% | 2 | nobody | 87 s |

*Model: 90-second dead time, fluid queue, abandoned work served; lost work in seconds of the stepped demand. Without any lever, the same configuration stays failed.*

<span id="def-11"></span>
<details>
<summary>Definition 11 -- Lever Achievable Region: steady pods held against work lost, one point per lever setting, with its frontier</summary>

**Definition 11** (Lever Achievable Region). *For a given overload, each setting of the three levers maps to the point*

{% katex(block=true) %}
\Big( 1/u^\ast,\; L_{\text{first}} \Big)
{% end %}

*whose first coordinate is the steady pods held per pod of demand and whose second is the first-attempt work lost. A setting is on the frontier if no other has both fewer steady pods and less loss.*

</details>

{{ layer(n=3, type="Estimate", id="levers-reading") }}In this region the admission bound dominates both alternatives for this overload. It holds the same two pods per pod of demand as the retry budget and loses about a third as much work. It loses about a quarter as much as the colder target while holding half the pods. The bound is also the only one of the three that the service team can deploy alone. A retry budget is a promise every client must keep, including clients the service team does not own. A colder target is paid for in every hour that is not an overload.

The table compares three levers on one signal. Put every signal of [Demand Is Not Debt](@/blog/2026-10-18/index.md) and every lever of this post on the same axes, and the comparison sharpens. Each run is the same sustained tenfold step with a ten-second timeout. The horizontal axis is the pods held over the hour after the step, per pod of stepped demand at full rate, so that a 50% target sits near two and a 25% target near four. The vertical axis is the first-attempt work lost.

<div style="margin:1.5em 0;">
<canvas id="chart-map" role="img" aria-label="Every signal and lever under the same sustained tenfold step, on common axes: pods held over the hour after the step per pod of stepped demand at full rate, against first-attempt work lost in seconds of the stepped demand. CPU 4.70 pods and 736 s lost; ingress 2.56 pods and 228 s lost; first attempts 1.98 pods and 3,566 s lost with the service still failing; first attempts, target 30% 3.30 pods and 878 s lost; first attempts, target 25% 3.96 pods and 338 s lost; first attempts, budget 20% 1.98 pods and 249 s lost; first attempts, budget 50% 1.98 pods and 390 s lost; first attempts, bound 5 s 1.98 pods and 87 s lost; CPU, bound 5 s 1.88 pods and 180 s lost. The pair signal coincides with ingress. The frontier runs through CPU, bound 5 s and first attempts, bound 5 s." style="width:100%;height:360px;display:block;"></canvas>
<figcaption>Parts 3 and 4 on one map, for a sustained tenfold step with a 10-second timeout: each signal and lever by the pods it holds per pod of demand and the work it loses. Only the two configurations behind an admission bound reach the frontier; every colder target, retry budget and unbounded signal holds more pods, loses more work, or both. Model: 90-second dead time, fluid queue, abandoned work served, first hour after the step.</figcaption>
<script>
(function(){var S={"id":"chart-map","h":360,"ml":[44,54],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[1.88,180.0],[1.98,87.0]],"c":"c","w":1.5,"dash":true},{"t":"pt","x":4.7,"y":736.0,"c":"b","r":5,"open":false},{"t":"txt","x":4.7,"y":736.0,"s":"CPU","n":"CPU","al":"right","dx":-9,"c":"b"},{"t":"pt","x":2.56,"y":228.0,"c":"b","r":5,"open":false},{"t":"txt","x":2.56,"y":228.0,"s":"ingress and pair","n":"ingress, pair","al":"left","dx":9,"c":"b"},{"t":"pt","x":1.98,"y":3566.0,"c":"a","r":5,"open":true},{"t":"txt","x":1.98,"y":3566.0,"s":"first attempts alone: still failing after an hour","n":"first attempts alone","al":"left","dx":9,"c":"a"},{"t":"pt","x":3.3,"y":878.0,"c":"d","r":5,"open":false},{"t":"txt","x":3.3,"y":878.0,"s":"target 30%","n":"target 30%","al":"right","dx":-9,"c":"d"},{"t":"pt","x":3.96,"y":338.0,"c":"d","r":5,"open":false},{"t":"txt","x":3.96,"y":338.0,"s":"target 25%","n":"target 25%","al":"right","dx":-9,"c":"d"},{"t":"pt","x":1.98,"y":249.0,"c":"e","r":5,"open":false},{"t":"txt","x":1.98,"y":249.0,"s":"budget 20%","n":"budget 20%","al":"right","dx":-9,"c":"e"},{"t":"pt","x":1.98,"y":390.0,"c":"e","r":5,"open":false},{"t":"txt","x":1.98,"y":390.0,"s":"budget 50%","n":"budget 50%","al":"right","dx":-9,"c":"e"},{"t":"pt","x":1.98,"y":87.0,"c":"c","r":5,"open":false},{"t":"txt","x":1.98,"y":87.0,"s":"bound 5 s","n":"bound 5 s","al":"left","dx":9,"c":"c"},{"t":"pt","x":1.88,"y":180.0,"c":"c","r":5,"open":false},{"t":"txt","x":1.88,"y":180.0,"s":"CPU, bound 5 s","n":"CPU, bound","al":"right","dx":-9,"c":"c"},{"t":"txt","x":1.88,"y":60,"s":"dashed: the frontier, no configuration has fewer pods and less loss","n":"dashed: frontier","al":"left","c":"c"},{"t":"txt","x":5.25,"y":4500,"s":"a scaler on first attempts unless marked CPU, ingress or pair","n":"first attempts unless marked","al":"right","c":"sub"}],"X":{"lo":1.0,"hi":5.3,"ticks":[[1,"1"],[2,"2"],[3,"3"],[4,"4"],[5,"5"]],"title":"pods held over the hour, per pod of stepped demand at full rate","ntitle":"pods held per pod of demand"},"Y":{"lo":50,"hi":6000,"log":true,"ticks":[[100,"100 s"],[1000,"1,000 s"]],"title":"first-attempt work lost, seconds of the stepped demand (log)","ntitle":"work lost (log)"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="map-reading") }}Only two points reach the frontier, and both sit behind an admission bound: the first-attempt scaler at 1.98 pods and 87 seconds lost, and the CPU scaler at 1.88 pods and 180 seconds. Every other configuration holds more pods, loses more work, or both. The colder targets buy their protection with capacity, 3.30 and 3.96 pods for 878 and 338 seconds lost. The retry budgets hold the same pods as the bound and lose about three and four and a half times as much. The CPU scaler without a bound holds 4.70 pods and still loses 736 seconds, paying the overshoot of [One Bit per Dead Time](@/blog/2026-10-04/index.md) and the debt of the previous post at once.

{{ layer(n=2, type="Fit", id="levers-not-exclusive") }}The levers are not exclusive, and the comparison above uses each one alone to show its bill. A service can run a moderate target, ask its clients for a retry budget, and still bound its queue. The point of the comparison is the dependency. The bound keeps working when a client ignores its budget or a new caller arrives with an aggressive retry library. That is the case the other two levers cannot cover.

{{ layer(n=3, type="Estimate", id="levers-detail") }}Each lever also has a range, and the ranges explain why the bound wins this comparison. A colder target protects in proportion to how cold it runs. At a 30% first-attempt target the same step recovers after 922 seconds, and at 25% after 384, because each step down moves the amplified utilization further from one. The cost is fixed and permanent: a 25% target holds twice the pods of a 50% target in every hour, overload or not. A retry budget protects in proportion to how small it is: at a 50% target, a 20% budget recovers after 274 seconds and a 50% budget after 422. Its cost falls on users whose failed requests are not retried, and its protection lasts only while every client honours it. The bound protects in proportion to how short it is relative to the timeout, and its cost appears only during an overload, as refusals.

{{ layer(n=2, type="Fit", id="spare-capacity-as-lever") }}The colder target deserves one more word, because it is the lever most teams already pull. Spare capacity is capacity held in advance, and it is the only one of the three that acts before the overload begins. The first post of this series, [One Bit per Dead Time](@/blog/2026-10-04/index.md), priced it as an information rate. The third, [Demand Is Not Debt](@/blog/2026-10-18/index.md), priced it as distance from the trap. Here it shows up a third time, as the lever that shrinks the excess the dead time produces. Gandhi and three coauthors made the same case for servers with long setup times. In their words, "to successfully meet response time SLAs, it suffices to simply manage existing capacity carefully and not give away spare capacity recklessly"{{ cite(ref="3", title="Gandhi, A., Harchol-Balter, M., Raghunathan, R. & Kozuch, M.A. (2012) -- AutoScale: Dynamic, Robust Capacity Management for Multi-Tier Data Centers, ACM Transactions on Computer Systems 30(4)") }}. It is a sound lever with a constant bill. The question this post raises is whether that bill is being paid for protection the admission bound would provide during the few minutes that need it.

## The Fast Actuator

An admission bound acts on the term Proposition 9 leaves open. It needs a precise definition, because one parameter of it decides whether it works.

<span id="def-12"></span>
<details>
<summary>Definition 12 -- Admission Bound: the queue holds at most b seconds of its current capacity; work beyond that is refused at the door and costs no service time</summary>

**Definition 12** (Admission Bound). *A service with an admission bound of b seconds admits a new attempt only if its queue, after admitting it, would hold at most {% katex() %}b \cdot C(t){% end %} work, where {% katex() %}C(t){% end %} is the capacity serving at that moment. Refused attempts consume no service time. Their clients may retry, under the same retry policy as for a timeout.*

</details>

<span id="prop-10"></span>
<details>
<summary>Proposition 10 -- Bounded Debt: an admission bound shorter than the client timeout leaves no retry debt, so the trap cannot hold</summary>

**Proposition 10** (Bounded Debt). *In the fluid model of first-in-first-out service, let the admission bound satisfy {% katex() %}b < \tau_{\text{out}}{% end %}. Then every admitted attempt is served before its client times out, the service performs no abandoned work, and the failed state of Proposition 6 of [Demand Is Not Debt](@/blog/2026-10-18/index.md) cannot be sustained. All excess becomes refused attempts.*

*Proof.* An admitted attempt finds at most {% katex() %}b\,C(t){% end %} work ahead of it. Capacity does not fall while it waits, so it waits at most b seconds, which is less than {% katex() %}\tau_{\text{out}}{% end %}. No admitted attempt is abandoned, so the retry debt of Definition 7 of [Demand Is Not Debt](@/blog/2026-10-18/index.md) is zero. The trap requires abandoned work to be served at rate {% katex() %}A\lambda{% end %}, which cannot happen. {% katex() %}\square{% end %}

</details>

{{ layer(n=2, type="Fit", id="bound-vs-timeout") }}The proposition puts the bound in the unit that matters. A queue limit set in requests, or in seconds unrelated to anything the clients do, protects the service only by accident. A limit set below the client timeout guarantees that every unit of work the service accepts is work someone is still waiting for. Yanacek's practice bounds the time a request may sit in a queue. The condition here says what that time must be compared against.

> **Physical translation.** A bank branch that lets everyone into the hall, however long the wait, ends the afternoon serving customers who gave up an hour ago and left their tickets on the floor. A branch that shuts the door once the hall holds more than the tellers can clear before anyone runs out of patience turns some people away at the entrance and serves everyone it lets in. The people turned away were going to be failed either way. The door decides only whether the tellers spend the afternoon on them.

{{ layer(n=1, type="Bound", id="lifo-codel-credit") }}Other mechanisms reach the same goal by different routes. CoDel, specified by Nichols and Jacobson for network queues, drops packets when the minimum queueing delay over an interval stays above a target{{ cite(ref="4", title="Nichols, K. & Jacobson, V. (2018) -- Controlled Delay Active Queue Management, RFC 8289, IETF") }}. Apache HBase applies the idea to remote calls in its `AdaptiveLifoCoDelCallQueue`, which credits Facebook's "Fail at Scale" paper in its source{{ cite(ref="5", title="Apache HBase Authors (2026) -- AdaptiveLifoCoDelCallQueue, hbase-server, Apache HBase source") }}. The queue switches to last-in-first-out order once it passes a fill threshold, serving the newest calls, whose clients are most likely still waiting. While the interval's minimum delay exceeds the target, it drops calls that have waited more than twice the target. Yanacek also describes moving to last-in-first-out service "if the protocol supports it". Each of these spends capacity on requests whose clients are still waiting, which is what Proposition 10 guarantees for first-in-first-out service with a short enough bound.

{{ layer(n=2, type="Fit", id="static-not-adaptive") }}The bound in this post is static: a fixed number of seconds of capacity, checked at the door, with no feedback loop of its own. That matters for a debt this blog has already named. The post [Multi-Resource Capacity and the Price of Anarchy](@/blog/2026-08-09/index.md) noted that an admission policy which refuses work under pressure and resumes it later "is still a control loop with delay in it". It left that loop's stability margin unproven. A static bound does not pay that debt, and it does not incur it either. An adaptive shedder, one that adjusts its threshold from measured load, is such a loop and owes that analysis.

## What the Bound Buys

{{ layer(n=3, type="Estimate", id="bound-runs") }}Put a five-second bound in front of the specimen of the previous post, below its ten-second timeout, and run the same sustained tenfold step with two retries. Without the bound, the CPU-driven autoscaler peaked at twelve and a half times the pods needed and lost 736 seconds of demand. With it, the same autoscaler reaches capacity in the same 345 seconds with no overshoot at all and loses 180 seconds. The first-attempt autoscaler, which without the bound never recovered, reaches capacity in 120 seconds, never overshoots, and loses 87 seconds, the least of any configuration in the series.

{{ layer(n=2, type="Fit", id="clean-signal-best") }}The bound reverses the previous post's ranking of signals. Without it, the first-attempt signal was the worst choice, because it could not see the debt. With it, there is no debt to see, and the signal's virtues return: it reacts at once, it does not saturate, and it provisions the need to the pod. The previous post, [Demand Is Not Debt](@/blog/2026-10-18/index.md), stated the reversal condition as a service that drops abandoned work. An admission bound below the timeout is a service that never accepts work it would later abandon.

{{ layer(n=1, type="Bound", id="shedding-blinds-cpu") }}The pairing has a known failure on the CPU side, and Yanacek names it. "Consider the following example: a service is configured for CPU-based reactive scaling and also has load shedding configured to reject requests at a similar CPU target. In this case, the load shedding system will reduce the number of requests to keep the CPU load low, and reactive scaling will never receive or get a delayed signal to launch new instances". A shedder that keeps the scaler's own metric in range hides the overload from the scaler.

{{ layer(n=2, type="Fit", id="why-first-attempts-see-through") }}The bound in this post sheds by time in queue, so CPU stays saturated behind it and the CPU scaler still scales, slowly. The first-attempt signal escapes Yanacek's failure by construction. It counts demand before the door, so whatever the door refuses still appears in the signal. The cleanest signal and the fastest actuator need each other: the actuator removes the debt the signal cannot see, and the signal sees the demand the actuator turns away.

{{ layer(n=2, type="Fit", id="why-no-overshoot") }}The bound also explains why the CPU scaler's twelvefold overshoot disappears. In the previous post that overshoot came from the debt. Abandoned attempts kept every pod busy long after first-attempt demand was covered, the metric stayed saturated, and the controller kept multiplying. Behind a bound shorter than the timeout there is no debt. The queue holds at most five seconds of work. Once capacity meets demand the queue empties within seconds, the metric falls below saturation, and the controller stops at the need. The staircase of the first post still sets the time to capacity, at 345 seconds. What the bound removes is everything the staircase did after capacity arrived.

## The Ceiling and the Amplified Need

The replica ceiling is the limit the belief trusts most, and the previous post's trap gives it a floor.

<span id="prop-11"></span>
<details>
<summary>Proposition 11 -- Ceiling Trap: a ceiling below the amplified load keeps a failing service failed; above it, recovery falls as one over the margin</summary>

**Proposition 11** (Ceiling Trap). *Let a service with retry amplification A, demand {% katex() %}\lambda{% end %} and per-pod rate c be limited to M replicas. After a trigger, it stays failed if*

{% katex(block=true) %}
M \le M^\ast = \frac{A\lambda}{c}
{% end %}

*whatever its scaling signal. Above that ceiling, the debt drains at {% katex() %}c\,(M - M^\ast){% end %}, so recovery time falls roughly as {% katex() %}1/(M - M^\ast){% end %}.*

*Proof.* At the ceiling, capacity is {% katex() %}cM{% end %} and utilization is {% katex() %}\lambda / (cM){% end %}. Proposition 6 of [Demand Is Not Debt](@/blog/2026-10-18/index.md) traps the service when {% katex() %}A\lambda/(cM) \ge 1{% end %}, which is the stated condition. Above it, the failed state's backlog falls at the capacity minus the amplified arrival rate, {% katex() %}cM - A\lambda = c(M - M^\ast){% end %}, and the time to clear a given debt is that debt divided by this rate. {% katex() %}\square{% end %}

</details>

<div style="margin:1.5em 0;">
<canvas id="chart-ceiling" role="img" aria-label="Recovery time after a tenfold 300-second spike against the replica ceiling, with two retries and a CPU signal; the amplified load needs 15 pods. Ceilings of 14 and 15 never recover. A ceiling of 16 recovers after 40,293 seconds, 20 after 7,921, 25 after 3,925 and 40 after 1,530, close to a constant divided by the margin above 15." style="width:100%;height:320px;display:block;"></canvas>
<figcaption>A replica ceiling against the amplified load. With two retries the failing service needs 15 pods to drain; at or below that ceiling it never recovers, drawn as open circles at the top edge, and above it recovery time falls roughly as one over the margin. Model: CPU signal, 10-second timeout, two retries, abandoned work served.</figcaption>
<script>
(function(){var S={"id":"chart-ceiling","h":320,"ml":[50,60],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"rect","x0":12,"x1":15,"y0":1000,"y1":200000,"c":"a","al":0.1},{"t":"vline","x":15,"c":"a","dash":true},{"t":"txt","x":15.6,"y":1350,"s":"at or below 15 = A \u00d7 need: trapped","n":"M \u2264 15: trapped","al":"left","c":"a","b":true},{"t":"txt","x":14.85,"y":180000,"s":"stuck: off scale","n":"off scale","al":"right","bl":"top","dy":9,"c":"a"},{"t":"line","pts":[[15.2,196747.5000000007],[15.299999999999999,131165.00000000047],[15.399999999999999,98373.75000000035],[15.5,78699.0],[15.6,65582.50000000004],[15.7,56213.571428571486],[15.799999999999999,49186.875000000065],[15.899999999999999,43721.66666666674],[16.0,39349.5],[16.099999999999998,35772.27272727279],[16.2,32791.25000000002],[16.3,30268.846153846138],[16.4,28106.785714285743],[16.5,26233.0],[16.599999999999998,24593.437500000033],[16.7,23146.764705882364],[16.8,21860.833333333325],[16.9,20710.26315789475],[17.0,19674.75],[17.099999999999998,18737.857142857163],[17.2,17886.136363636368],[17.3,17108.47826086956],[17.4,16395.62500000001],[17.5,15739.8],[17.6,15134.423076923069],[17.7,14573.888888888892],[17.8,14053.392857142853],[17.9,13568.793103448283],[18.0,13116.5],[18.1,12693.387096774188],[18.2,12296.718750000004],[18.3,11924.090909090906],[18.4,11573.382352941182],[18.5,11242.714285714286],[18.6,10930.416666666662],[18.7,10635.000000000002],[18.8,10355.131578947367],[18.9,10089.615384615388],[19.0,9837.375],[19.1,9597.43902439024],[19.2,9368.928571428572],[19.3,9151.046511627905],[19.4,8943.068181818184],[19.5,8744.333333333334],[19.6,8554.23913043478],[19.7,8372.234042553193],[19.8,8197.812499999998],[19.9,8030.510204081635],[20.0,7869.9],[20.1,7715.588235294115],[20.2,7567.21153846154],[20.3,7424.43396226415],[20.4,7286.944444444446],[20.5,7154.454545454545],[20.6,7026.696428571427],[20.7,6903.42105263158],[20.8,6784.396551724137],[20.9,6669.406779661019],[21.0,6558.25],[21.1,6450.737704918031],[21.2,6346.6935483870975],[21.3,6245.95238095238],[21.4,6148.359375000002],[21.5,6053.7692307692305],[21.6,5962.045454545453],[21.7,5873.059701492538],[21.8,5786.691176470587],[21.9,5702.826086956523],[22.0,5621.357142857143],[22.1,5542.1830985915485],[22.2,5465.208333333334],[22.3,5390.342465753424],[22.4,5317.500000000001],[22.5,5246.6],[22.6,5177.565789473683],[22.7,5110.324675324676],[22.8,5044.8076923076915],[22.9,4980.949367088609],[23.0,4918.6875],[23.1,4857.962962962962],[23.2,4798.719512195123],[23.299999999999997,4740.903614457833],[23.4,4684.464285714286],[23.5,4629.35294117647],[23.6,4575.523255813952],[23.7,4522.931034482759],[23.799999999999997,4471.534090909092],[23.9,4421.292134831461],[24.0,4372.166666666667],[24.1,4324.120879120878],[24.2,4277.119565217392],[24.299999999999997,4231.129032258066],[24.4,4186.1170212765965],[24.5,4142.0526315789475],[24.6,4098.906249999999],[24.7,4056.6494845360826],[24.8,4015.255102040816],[24.9,3974.6969696969704],[25.0,3934.95],[25.1,3895.9900990099004],[25.2,3857.794117647059],[25.3,3820.3398058252424],[25.4,3783.60576923077],[25.5,3747.5714285714284],[25.6,3712.216981132075],[25.7,3677.5233644859813],[25.8,3643.472222222222],[25.9,3610.0458715596337],[26.0,3577.2272727272725],[26.1,3544.9999999999995],[26.2,3513.3482142857147],[26.3,3482.2566371681414],[26.4,3451.71052631579],[26.5,3421.695652173913],[26.6,3392.1982758620684],[26.7,3363.2051282051284],[26.8,3334.703389830508],[26.9,3306.680672268908],[27.0,3279.125],[27.1,3252.0247933884293],[27.2,3225.3688524590166],[27.3,3199.1463414634145],[27.4,3173.3467741935488],[27.5,3147.96],[27.6,3122.97619047619],[27.7,3098.3858267716537],[27.8,3074.1796875],[27.9,3050.3488372093025],[28.0,3026.8846153846152],[28.1,3003.778625954198],[28.2,2981.0227272727275],[28.3,2958.6090225563908],[28.4,2936.529850746269],[28.5,2914.777777777778],[28.6,2893.3455882352937],[28.7,2872.2262773722628],[28.8,2851.4130434782605],[28.9,2830.8992805755397],[29.0,2810.6785714285716],[29.1,2790.7446808510635],[29.2,2771.0915492957747],[29.3,2751.7132867132864],[29.4,2732.604166666667],[29.5,2713.7586206896553],[29.6,2695.171232876712],[29.7,2676.8367346938776],[29.8,2658.75],[29.9,2640.9060402684568],[30.0,2623.3],[30.1,2605.9271523178804],[30.2,2588.782894736842],[30.3,2571.862745098039],[30.4,2555.162337662338],[30.5,2538.6774193548385],[30.6,2522.4038461538457],[30.7,2506.3375796178343],[30.8,2490.474683544304],[30.9,2474.811320754717],[31.0,2459.34375],[31.1,2444.0683229813662],[31.2,2428.9814814814818],[31.3,2414.079754601227],[31.4,2399.3597560975613],[31.5,2384.818181818182],[31.6,2370.4518072289156],[31.7,2356.25748502994],[31.8,2342.2321428571427],[31.9,2328.372781065089],[32.0,2314.676470588235],[32.1,2301.1403508771928],[32.2,2287.761627906976],[32.3,2274.537572254336],[32.4,2261.4655172413795],[32.5,2248.542857142857],[32.6,2235.7670454545455],[32.7,2223.1355932203387],[32.8,2210.6460674157306],[32.9,2198.296089385475],[33.0,2186.0833333333335],[33.1,2174.0055248618783],[33.2,2162.060439560439],[33.3,2150.2459016393445],[33.4,2138.559782608696],[33.5,2127.0],[33.6,2115.564516129032],[33.7,2104.2513368983955],[33.8,2093.0585106382982],[33.9,2081.984126984127],[34.0,2071.0263157894738],[34.1,2060.183246073298],[34.2,2049.4531249999995],[34.3,2038.834196891192],[34.400000000000006,2028.3247422680406],[34.5,2017.923076923077],[34.6,2007.627551020408],[34.7,1997.43654822335],[34.8,1987.3484848484852],[34.900000000000006,1977.3618090452255],[35.0,1967.475],[35.1,1957.686567164179],[35.2,1947.9950495049502],[35.3,1938.3990147783254],[35.400000000000006,1928.8970588235288],[35.5,1919.4878048780488],[35.6,1910.1699029126212],[35.7,1900.942028985507],[35.8,1891.802884615385],[35.900000000000006,1882.7511961722482],[36.0,1873.7857142857142],[36.1,1864.905213270142],[36.2,1856.1084905660375],[36.3,1847.3943661971834],[36.400000000000006,1838.7616822429902],[36.5,1830.2093023255813],[36.6,1821.736111111111],[36.7,1813.3410138248846],[36.8,1805.0229357798169],[36.900000000000006,1796.7808219178078],[37.0,1788.6136363636363],[37.1,1780.52036199095],[37.2,1772.4999999999998],[37.3,1764.5515695067268],[37.400000000000006,1756.6741071428567],[37.5,1748.8666666666666],[37.6,1741.1283185840707],[37.7,1733.4581497797355],[37.8,1725.855263157895],[37.900000000000006,1718.318777292576],[38.0,1710.8478260869565],[38.1,1703.4415584415583],[38.2,1696.0991379310342],[38.3,1688.8197424892705],[38.400000000000006,1681.6025641025637],[38.5,1674.4468085106382],[38.6,1667.351694915254],[38.7,1660.3164556962024],[38.8,1653.340336134454],[38.900000000000006,1646.422594142259],[39.0,1639.5625],[39.1,1632.759336099585],[39.2,1626.0123966942147],[39.3,1619.3209876543212],[39.400000000000006,1612.6844262295078],[39.5,1606.1020408163265],[39.6,1599.5731707317073],[39.7,1593.0971659919026],[39.8,1586.6733870967744],[39.900000000000006,1580.3012048192768],[40.0,1573.98],[40.1,1567.7091633466134],[40.2,1561.488095238095],[40.3,1555.316205533597],[40.400000000000006,1549.1929133858264],[40.5,1543.1176470588234],[40.6,1537.08984375],[40.7,1531.1089494163423],[40.8,1525.1744186046512],[40.900000000000006,1519.285714285714],[41.0,1513.4423076923076],[41.1,1507.6436781609195],[41.2,1501.889312977099],[41.3,1496.1787072243349],[41.400000000000006,1490.5113636363633],[41.5,1484.8867924528302],[41.6,1479.3045112781954],[41.7,1473.7640449438202],[41.8,1468.2649253731345],[41.900000000000006,1462.8066914498138],[42.0,1457.388888888889],[42.1,1452.011070110701]],"c":"g","w":1.2,"dash":true},{"t":"txt","x":33,"y":2186.0833333333335,"s":"about 39,300 / (M \u2212 15) seconds","n":"~1/(M \u2212 15)","al":"left","bl":"bottom","dy":-6,"c":"g"},{"t":"pt","x":14,"y":180000,"c":"a","r":5,"open":true},{"t":"pt","x":15,"y":180000,"c":"a","r":5,"open":true},{"t":"pt","x":16,"y":40293.0,"c":"b","r":5},{"t":"txt","x":16,"y":40293.0,"s":"40,293 s","al":"left","bl":"bottom","dx":6,"dy":-6,"c":"b"},{"t":"pt","x":20,"y":7921.0,"c":"b","r":5},{"t":"txt","x":20,"y":7921.0,"s":"7,921 s","al":"left","bl":"bottom","dx":6,"dy":-6,"c":"b"},{"t":"pt","x":25,"y":3925.0,"c":"b","r":5},{"t":"txt","x":25,"y":3925.0,"s":"3,925 s","al":"left","bl":"bottom","dx":6,"dy":-6,"c":"b"},{"t":"pt","x":40,"y":1530.0,"c":"b","r":5},{"t":"txt","x":40,"y":1530.0,"s":"1,530 s","al":"right","bl":"top","dx":-6,"dy":8,"c":"b"}],"X":{"lo":12,"hi":42,"ticks":[[15,"15"],[20,"20"],[25,"25"],[30,"30"],[35,"35"],[40,"40"]],"title":"replica ceiling M, pods","ntitle":"ceiling M"},"Y":{"lo":1000,"hi":200000,"log":true,"ticks":[[1000,"1,000"],[10000,"10,000"],[100000,"100,000"]],"title":"seconds to recover after the spike (log)","ntitle":"recovery, s (log)"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="ceiling-runs") }}The runs show both halves. With two retries after a tenfold spike, the amplified load needs fifteen pods. Ceilings of fourteen and fifteen never recover. A ceiling of sixteen recovers after 40,293 seconds, more than eleven hours. Twenty takes 7,921 seconds, twenty-five takes 3,925 and forty takes 1,530. Recovery time multiplied by the margin above fifteen stays between 38,250 and 40,293 across those four ceilings, as the proposition predicts. The same law appears at the size of the cluster kit, where the amplified need is six pods. Ceilings of five and six never recover, and seven, eight and twelve recover after 6,974, 3,401 and 1,085 seconds.

<span id="cor-6"></span>
<details>
<summary>Corollary 6 -- Feasible Ceiling Band: a ceiling must exceed the amplified need and stay below the scalability limit; when the amplified need exceeds the limit, no ceiling is safe</summary>

**Corollary 6** (Feasible Ceiling Band). *Combine Proposition 11 with the ceiling rule of [The Governance Tax](@/blog/2026-04-16/index.md), which places the ceiling at 80% of the worst-case scalability peak {% katex() %}N_{\max}{% end %}. A safe ceiling then satisfies*

{% katex(block=true) %}
\frac{A\lambda}{c} < M \le 0.8\, N_{\max}
{% end %}

*If {% katex() %}A\lambda/c \ge 0.8\,N_{\max}{% end %}, the band is empty: every ceiling either traps the service after a trigger or lets the autoscaler climb past the scalability peak.*

*Proof.* The lower bound is Proposition 11. The upper bound is the earlier post's rule. {% katex() %}\square{% end %}

</details>

{{ layer(n=2, type="Fit", id="band-reading") }}The corollary reconciles two pieces of advice that look opposed. The Governance Tax was right that a ceiling protects against the retrograde region. Proposition 11 is right that a ceiling below the amplified need creates a second trap. Both hold, and together they say a ceiling is safe only inside a band whose width is set by the amplification. When retries across a stack multiply A until the band closes, no ceiling setting rescues the service. The levers that remain are the ones that lower A or bound the debt, and the admission bound is the one the operator controls.

{{ layer(n=3, type="Estimate", id="band-example") }}The earlier post's own example makes the band concrete. Its service had a scalability peak of about 18 pods, so its ceiling sat near 14. With two retries the amplified need is three times the pods that demand alone requires. A service in that example that needs five pods of capacity at full use has an amplified need of fifteen. That is above its ceiling of fourteen, so the band is empty before any setting is chosen. Retries behind a gateway that retries again, an amplification of nine, would close the band for a service needing just two pods. The ceiling rule was correct for the risk it addressed. It was written without the amplification in view, and the amplification decides whether any ceiling can satisfy both risks.

## Heavy-Tailed Demand

Overloads in practice are not tenfold or thirtyfold by design. Their sizes vary, and the large ones are rarer than they are large. [The Newsvendor Problem Under a Heavy Tail](@/blog/2026-08-02/index.md) showed what a heavy tail does to a capacity target. The question here is what it does to the four results of this series.

<div style="margin:1.5em 0;">
<canvas id="chart-time-size" role="img" aria-label="Time until capacity meets the load against the overload, at the median, 90th and 99th percentile of 3,000 Pareto overloads with tail index 1.5, overload on a log scale. CPU signal: 105 s at 2.3x, 240 s at 6.9x, 480 s at 31.3x. First-attempt signal behind a 5-second admission bound: 105, 120 and 135 s at the same overloads." style="width:100%;height:300px;display:block;"></canvas>
<figcaption>Size against time under heavy-tailed overloads, at matching percentiles. On a log scale for the overload, the CPU signal's points lie close to a straight line: time grows with the logarithm of size, about fourteenfold more overload for less than five times the time. Behind an admission bound the first-attempt signal barely moves. Model: CPU run without timeouts or retries; bounded run with a 10-second timeout and two retries.</figcaption>
<script>
(function(){var S={"id":"chart-time-size","h":300,"ml":[44,54],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[2.3,105.0],[6.9,240.0],[31.3,480.0]],"c":"b","mk":5},{"t":"line","pts":[[2.3,105.0],[6.9,120.0],[31.3,135.0]],"c":"c","mk":5},{"t":"txt","x":6.9,"y":240.0,"s":"90th: 6.9x, 240 s","n":"240 s","al":"right","bl":"bottom","dx":-8,"dy":-4,"c":"b"},{"t":"txt","x":31.3,"y":480.0,"s":"99th: 31.3x, 480 s","n":"480 s","al":"right","bl":"bottom","dx":-8,"dy":-4,"c":"b"},{"t":"txt","x":2.3,"y":105.0,"s":"median: 2.3x, 105 s, both","n":"105 s","al":"left","bl":"top","dy":8,"c":"c"},{"t":"txt","x":6.9,"y":120.0,"s":"120 s","n":"120 s","al":"center","bl":"top","dy":8,"c":"c"},{"t":"txt","x":31.3,"y":135.0,"s":"135 s","n":"135 s","al":"center","bl":"top","dy":8,"c":"c"},{"t":"txt","x":6.9,"y":240.0,"s":"CPU signal","al":"left","bl":"top","dx":10,"dy":8,"c":"b","b":true},{"t":"txt","x":31.3,"y":135.0,"s":"first attempts, 5 s bound","n":"bounded","al":"right","bl":"bottom","dx":-8,"dy":-6,"c":"c","b":true}],"X":{"lo":1.5,"hi":60,"log":true,"ticks":[[2,"2x"],[5,"5x"],[10,"10x"],[20,"20x"],[50,"50x"]],"title":"overload K at the median, 90th and 99th percentile (log scale)","ntitle":"overload K (log)"},"Y":{"lo":0,"hi":560,"ticks":[[0,"0 s"],[100,"100 s"],[200,"200 s"],[300,"300 s"],[400,"400 s"],[500,"500 s"]],"title":"time until capacity meets the load, same percentile","ntitle":"time to capacity"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="time-is-light") }}Time to capacity stays light-tailed when demand is heavy-tailed. Draw 3,000 overloads from a Pareto distribution with tail index 1.5 and a smallest overload of 1.5 times the base load, capped at 2,000 times, so that one overload in a hundred exceeds thirty times the base load. From the median to the 99th percentile the overload grows about fourteenfold, from 2.3 to 31.3 times the base load. The time until capacity meets it grows less than fivefold, from 105 seconds to 480, because the rounds of [One Bit per Dead Time](@/blog/2026-10-04/index.md) grow with the logarithm of the overload. Behind an admission bound, on the first-attempt signal, the 99th percentile is 135 seconds.

{{ layer(n=3, type="Estimate", id="lighter-tail") }}A lighter tail changes the numbers and not the pattern. With a tail index of 3, the 99th-percentile overload is 6.9 times the base load. The time until capacity meets it is 240 seconds on CPU and 120 on the first-attempt signal behind a bound. Half of these overloads stay below twice the base load, which a service at a 50% target meets with the capacity it already has. The tail of demand sets the size of what arrives. Because the rounds grow only with the logarithm, the time to meet it stays short under either tail.

{{ layer(n=3, type="Estimate", id="backlog-grows") }}Size behaves differently: the peak backlog grows in proportion to the overload times its round count. Its local growth exponent falls from 2.84 between 3x and 5x to 1.27 between 100x and 300x. Divided by the overload times the rounds, the backlog settles near 94 seconds of base load, from 35 at 3x through 61 at 10x and 88 at 30x. Since the round count grows like the logarithm of the overload, the backlog grows like the overload times its logarithm.

<span id="prop-12"></span>
<details>
<summary>Proposition 12 -- Tail Index Preserved: a backlog that grows like K log K has the same tail index as the overload K</summary>

**Proposition 12** (Tail Index Preserved). *Let the overload K have a regularly varying tail, {% katex() %}\Pr[K > x] = x^{-\alpha}s(x){% end %} with s slowly varying, and let the peak backlog satisfy {% katex() %}B \sim \gamma\,K\log K{% end %} for a constant {% katex() %}\gamma > 0{% end %} for large K. Then B has a regularly varying tail with the same index {% katex() %}\alpha{% end %}.*

*Proof sketch.* The function {% katex() %}f(x) = x \log x{% end %} is increasing for large x with inverse {% katex() %}f^{-1}(y) \sim y/\log y{% end %}. So {% katex() %}\Pr[B > y] \sim \Pr[K > y/(\gamma\log y)] = (y/\log y)^{-\alpha}\,s_1(y){% end %}, where {% katex() %}s_1{% end %} absorbs the constant and is slowly varying, and the factor {% katex() %}(\log y)^{\alpha}s_1(y){% end %} is slowly varying too. The index of regular variation is {% katex() %}\alpha{% end %}. {% katex() %}\square{% end %}

</details>

{{ layer(n=3, type="Estimate", id="apparent-index") }}The logarithm still matters in practice. A tail-index estimate computed over the overloads that actually occur sees the local growth exponent, not the asymptotic one. Over the practical range that exponent is between about 1.3 and 2.8, so the backlog's apparent index comes out near the overload's index divided by it. The Hill estimate on the backlog of the 3,000 overloads is 0.89 against 1.57 for the overloads themselves, roughly 1.5 divided by an exponent of 1.7. The backlog looks heavier-tailed than demand over every range anyone will observe, and it is not heavier in the limit. Both statements are true, and the first is the one an operator lives with.

{{ layer(n=3, type="Estimate", id="index-uncertainty") }}Those two estimates carry uncertainty of their own, and it is worth seeing. Resampled 400 times, with the top tenth of the sample treated as the tail, the overload's estimate has a 90% interval of 1.46 to 1.72 and the backlog's an interval of 0.83 to 0.97. The intervals do not overlap, so the gap is not sampling noise. The choice of tail moves both estimates more than resampling does. Treating only the top 2% as the tail raises the backlog's estimate to 1.23 and the overload's to 1.79, and treating the top 30% lowers them to 0.65 and 1.51. The backlog's estimate climbs toward the overload's as the tail considered gets deeper, which is the logarithm of Proposition 12 fading as the overloads grow.

<div style="margin:1.5em 0;">
<canvas id="chart-hill" role="img" aria-label="Hill estimates of the tail index over 3,000 Pareto overloads with true index 1.5, with 90% bootstrap bands, as the share of the sample treated as the tail runs from 2% to 30%. Overload K: 1.79 at 2%, 1.63 at 5%, 1.57 at 10%, 1.56 at 20%, 1.51 at 30%. Peak backlog with no bound: 1.23 at 2%, 1.04 at 5%, 0.89 at 10%, 0.75 at 20%, 0.65 at 30%. At the 10% share the bands are 1.46 to 1.72 and 0.83 to 0.97 and do not overlap. Refused or lost work behind a 5-second bound follows the backlog at every share, 0.88 at 10%." style="width:100%;height:320px;display:block;"></canvas>
<figcaption>How sure the tail indices are. Bands are 90% bootstrap intervals; the dotted line marks the 10% share the text quotes. The backlog's estimate stays below the overload's at every share, and the gap is not sampling noise; it narrows as the tail considered gets deeper, as the logarithm in the backlog's growth predicts. Model: CPU signal, sustained Pareto steps, one hour each.</figcaption>
<script>
(function(){var S={"id":"chart-hill","h":320,"ml":[36,44],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"hline","y":1.5,"c":"g","w":1,"dash":true},{"t":"txt","x":0.35,"y":1.5,"s":"true index of the overload, 1.5","n":"true 1.5","al":"right","bl":"top","dy":4,"c":"g"},{"t":"vline","x":0.1,"c":"sub","dash":true},{"t":"band","pts":[[0.02,1.5,2.14],[0.05,1.48,1.87],[0.1,1.46,1.72],[0.2,1.47,1.65],[0.3,1.43,1.58]],"c":"b","al":0.18},{"t":"line","pts":[[0.02,1.79],[0.05,1.63],[0.1,1.57],[0.2,1.56],[0.3,1.51]],"c":"b","w":2,"mk":3.5},{"t":"band","pts":[[0.02,1.02,1.45],[0.05,0.94,1.18],[0.1,0.83,0.97],[0.2,0.69,0.8],[0.3,0.62,0.67]],"c":"a","al":0.18},{"t":"line","pts":[[0.02,1.23],[0.05,1.04],[0.1,0.89],[0.2,0.75],[0.3,0.65]],"c":"a","w":2,"mk":3.5},{"t":"line","pts":[[0.02,1.22],[0.05,1.03],[0.1,0.88],[0.2,0.73],[0.3,0.63]],"c":"d","w":1.5,"dash":true},{"t":"txt","x":0.019,"y":2.22,"s":"overload K","al":"left","c":"b","b":true},{"t":"txt","x":0.019,"y":0.74,"s":"peak backlog, no bound","n":"backlog","al":"left","c":"a","b":true},{"t":"txt","x":0.019,"y":0.6,"s":"dashed: refused or lost behind a 5 s bound","n":"dashed: refused, 5 s bound","al":"left","c":"d"}],"X":{"lo":0.017,"hi":0.36,"log":true,"ticks":[[0.02,"2%"],[0.05,"5%"],[0.1,"10%"],[0.2,"20%"],[0.3,"30%"]],"title":"share of the 3,000 overloads treated as the tail (log)","ntitle":"tail share (log)"},"Y":{"lo":0.5,"hi":2.3,"ticks":[[0.5,"0.5"],[1.0,"1.0"],[1.5,"1.5"],[2.0,"2.0"]],"title":"Hill estimate of the tail index","ntitle":"Hill estimate"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

## The Tail Does Not Leave

An admission bound caps the backlog by construction. The question under heavy-tailed demand is what happens to the part of the tail the backlog used to hold.

<span id="def-13"></span>
<details>
<summary>Definition 13 -- Tail Achievable Region: backlog against refused work in the tail, one point per admission bound, with its frontier</summary>

**Definition 13** (Tail Achievable Region). *For a distribution of overloads, each admission bound b maps to the point*

{% katex(block=true) %}
\Big( B_{99}(b),\; L_{99}(b) \Big)
{% end %}

*whose coordinates are the 99th percentiles of peak backlog and of refused or lost work. A bound is on the frontier if no other bound has both a smaller backlog quantile and a smaller loss quantile.*

</details>

<div style="margin:1.5em 0;">
<canvas id="chart-tail" role="img" aria-label="99th percentiles over 3,000 Pareto overloads with tail index 1.5, CPU signal, 10-second timeout, two retries, by admission bound. Peak backlog: 50,563 with no bound, 27,181 at 60 s, 9,810 at 20 s, 1,633 at 12 s, 190 at 8 s, 113 at 5 s and 32 at 2 s. Rejected or lost: 30,905, 29,088, 26,080, 22,064, 10,979, 11,056 and 11,137. Between 12 s and 8 s, either side of the timeout, the loss halves. A dashed line at 11,170 marks the peak backlog of the same overloads with no timeouts or retries at all. Filled points are peak backlog, open points rejected or lost; the bounds are categories, so the points are not joined." style="width:100%;height:330px;display:block;"></canvas>
<figcaption>What an admission bound does to the tail, in 99th percentiles over 3,000 heavy-tailed overloads. Bounds longer than the client timeout leave the debt in place and barely change what is lost, even at 12 seconds, just above the timeout. Bounds shorter than the timeout remove the debt: the backlog collapses, and what is rejected falls to almost exactly what a queue with no retries would have held, the size of the overload itself. Model: CPU signal, 10-second timeout, two retries.</figcaption>
<script>
(function(){var S={"id":"chart-tail","h":330,"ml":[54,64],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"rect","x0":4.5,"x1":7.4,"y0":10,"y1":200000,"c":"c","al":0.08},{"t":"vline","x":4.5,"c":"c","dash":true},{"t":"txt","x":4.55,"y":130000,"s":"bound below the 10 s timeout","n":"below timeout","al":"left","c":"c","b":true},{"t":"hline","y":11169.5,"c":"g","w":1,"dash":true},{"t":"txt","x":0.65,"y":11169.5,"s":"queue without retries: 11,170","n":"no retries: 11,170","al":"left","bl":"top","dy":4,"c":"g"},{"t":"pt","x":1,"y":50563.0,"c":"b","r":5},{"t":"pt","x":2,"y":27180.9,"c":"b","r":5},{"t":"pt","x":3,"y":9810.0,"c":"b","r":5},{"t":"pt","x":4,"y":1633.4,"c":"b","r":5},{"t":"pt","x":5,"y":190.2,"c":"b","r":5},{"t":"pt","x":6,"y":113.4,"c":"b","r":5},{"t":"pt","x":7,"y":31.8,"c":"b","r":5},{"t":"pt","x":1,"y":30905.0,"c":"a","r":5,"open":true},{"t":"pt","x":2,"y":29087.8,"c":"a","r":5,"open":true},{"t":"pt","x":3,"y":26079.8,"c":"a","r":5,"open":true},{"t":"pt","x":4,"y":22064.1,"c":"a","r":5,"open":true},{"t":"pt","x":5,"y":10978.9,"c":"a","r":5,"open":true},{"t":"pt","x":6,"y":11055.7,"c":"a","r":5,"open":true},{"t":"pt","x":7,"y":11137.3,"c":"a","r":5,"open":true},{"t":"txt","x":1,"y":50563.0,"s":"50,563","al":"center","bl":"bottom","dy":-8,"c":"b"},{"t":"txt","x":2,"y":27180.9,"s":"27,181","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":3,"y":9810.0,"s":"9,810","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":4,"y":1633.4,"s":"1,633","al":"right","bl":"middle","dx":-10,"c":"b"},{"t":"txt","x":5,"y":190.2,"s":"190","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":6,"y":113.4,"s":"113","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":7,"y":31.8,"s":"32","al":"center","bl":"top","dy":8,"c":"b"},{"t":"txt","x":1,"y":30905.0,"s":"30,905","n":"30,905","al":"center","bl":"top","dy":8,"c":"a"},{"t":"txt","x":2,"y":29087.8,"s":"29,088","n":"","al":"center","bl":"bottom","dy":-8,"c":"a"},{"t":"txt","x":3,"y":26079.8,"s":"26,080","n":"","al":"center","bl":"bottom","dy":-8,"c":"a"},{"t":"txt","x":4,"y":22064.1,"s":"22,064","n":"22,064","al":"center","bl":"bottom","dy":-8,"c":"a"},{"t":"txt","x":5,"y":10978.9,"s":"10,979","n":"10,979","al":"center","bl":"bottom","dy":-8,"c":"a"},{"t":"txt","x":6,"y":11055.7,"s":"11,056","n":"","al":"center","bl":"bottom","dy":-8,"c":"a"},{"t":"txt","x":7,"y":11137.3,"s":"11,137","n":"","al":"center","bl":"bottom","dy":-8,"c":"a"},{"t":"txt","x":2.5,"y":75000,"s":"rejected or lost","al":"center","c":"a","b":true},{"t":"txt","x":0.9,"y":300,"s":"peak backlog","al":"left","c":"b","b":true}],"X":{"lo":0.6,"hi":7.4,"ticks":[[1,"no bound"],[2,"60 s"],[3,"20 s"],[4,"12 s"],[5,"8 s"],[6,"5 s"],[7,"2 s"]],"nticks":[[1,"none"],[2,"60"],[3,"20"],[4,"12"],[5,"8"],[6,"5"],[7,"2"]],"title":"admission bound, seconds of capacity the queue may hold (not to scale)","ntitle":"bound, s"},"Y":{"lo":10,"hi":200000,"log":true,"ticks":[[10,"10"],[100,"100"],[1000,"1,000"],[10000,"10,000"],[100000,"100,000"]],"title":"99th percentile, seconds of the original load (log)","ntitle":"p99, s of load (log)"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="tail-runs") }}The sweep over bound sizes, with the CPU signal, a ten-second timeout and two retries, divides cleanly at the timeout. With no bound, the 99th percentile of peak backlog is 50,563 seconds of base load and the 99th percentile of lost work is 30,905. Most of that backlog is debt: work the service performs for nobody. Bounds longer than the timeout shrink the backlog but leave most of the loss in place, because work still waits past the timeout and the debt still forms: at 12 seconds the loss is still 22,064. Bounds shorter than the timeout collapse the backlog to a few hundred seconds of base load or less and halve the loss: 10,979 at 8 seconds. The change happens between the two bounds that straddle the timeout, not gradually across the sweep. The figure labels every bound.

{{ layer(n=3, type="Estimate", id="moved-not-removed") }}The last number is the one to keep. The same 3,000 overloads, run with no timeouts and no retries at all, leave a 99th-percentile backlog of 11,170 seconds of base load. That is the excess the overload itself brings, with nothing added and nothing refused. A bound below the timeout refuses 11,056 at the same percentile. Its tail index is 0.88, against 0.89 for that unretried backlog, and their bootstrap intervals, 0.82 to 0.96 and 0.83 to 0.97, nearly coincide. The bound removed the debt, which at the 99th percentile accounted for nearly two-thirds of the loss. What remained it moved, almost unit for unit and with the same tail, from the queue to the door.

{{ layer(n=3, type="Estimate", id="moved-lighter") }}The lighter tail shows the same exchange. With a tail index of 3, the queue without timeouts or retries holds 871 seconds of base load at the 99th percentile. A five-second bound with two retries refuses 845 at the same percentile. The refused volume tracks the unretried backlog in both distributions. The bound changes where the excess sits, and the distribution of demand decides how much of it there is.

{{ layer(n=3, type="Estimate", id="tail-frontier") }}On Definition 13's region the sweep has a cliff. The five-second bound has a smaller backlog quantile and a smaller loss quantile than no bound or a bound of sixty, twenty or twelve seconds. Every bound longer than the timeout is therefore dominated by one shorter than it. The frontier lies entirely below the timeout. Among the bounds below it the trade is small and real: two seconds holds about a sixth of the backlog that eight seconds holds and refuses 1.4% more. The choice that matters is which side of the timeout the bound sits on, and that choice is not a matter of degree.

{{ layer(n=2, type="Fit", id="safe-in-size") }}This is [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) measured in a different system. That post's Definition 3 bounded the probability of leaving a safe region of queue occupancy. Its Definition 3a priced a fixed budget split between a probability margin and a magnitude margin. An admission bound is a hard magnitude barrier on the same quantity: the queue can never hold more than b seconds of capacity. It achieves that bound exactly, and the magnitude it refuses to hold reappears outside the region, in refused requests, with the tail it had inside. The barrier makes the queue safe in size. It makes the users safe in neither.

{{ layer(n=2, type="Fit", id="time-bought-size-moved") }}Time and size answer to different levers, and they are linked. Time can be bought. A shorter dead time makes every round cheaper, a larger growth factor makes rounds fewer, a signal that does not saturate cuts them to one, and the time until capacity meets an overload stays light-tailed under any demand. Size cannot be limited away. The excess an overload brings before capacity arrives exists whatever the door does, and a limit chooses only where it lands: in the queue as latency, at the door as refusals, or in idle pods held for the day it comes. What shrinks the excess is time. Behind the same five-second bound, the first-attempt signal reaches capacity at the 99th percentile in 135 seconds instead of 480, and it refuses 3,535 seconds of base load at that percentile instead of 11,056. Removing the debt and buying time are the two reductions on offer. The first requires a bound shorter than the patience of the clients. The second stops at one dead time, which no signal removes.

## What the Bound Does Not Fix

{{ layer(n=3, type="Estimate", id="bound-not-time") }}The bound does not buy time. Across every bound size in the heavy-tailed sweep, from none to two seconds, the 99th percentile of time to capacity stays at 480 seconds on the CPU signal. That time is set by the rounds of the first post, by the dead time and the growth factor, and the door has no authority over either. What the bound changes is what happens to the work that arrives while those rounds run.

{{ layer(n=2, type="Fit", id="bound-needs-timeout") }}The bound also depends on knowing the timeout it must stay under. In a chain of services, each caller has its own timeout, and the one that matters is the shortest among the clients whose abandoned work the service would otherwise perform. A bound chosen against a generous outer timeout can still exceed a tight inner one, and then the debt forms from the inner caller's retries. The bound is a promise about the patience of the clients, and it is only as good as the team's knowledge of that patience.

{{ layer(n=2, type="Fit", id="bound-refusals-real") }}Finally, refusals are real failures. In the heavy-tailed runs, a five-second bound refused 11,056 seconds of base load at the 99th percentile. That is as many requests as the service normally receives in about three hours, turned away during a single overload. The comparison that makes this acceptable is with the alternative: without the bound, the same percentile lost 30,905 seconds of base load to timeouts while serving work nobody wanted. The bound does not create the loss. It removes the part of the loss the service caused itself, and makes the rest visible and immediate.

## What to Compute

The four posts of this series reduce to five numbers an engineer can compute before an overload, each from quantities a service already knows.

- **The growth factor and its rounds.** Take the limit over the request over the target to get g. If g is at most 1 plus the tolerance, the controller will not scale on a saturated metric at all. Otherwise a k-fold overload needs at least {% katex() %}\lceil \log_g (k u^\ast r/\ell) \rceil{% end %} rounds of one dead time plus one metric window each.
- **The standing delay.** For a backlog-scaled consumer, divide the threshold by the per-pod rate. It must be at least the effective dead time times {% katex() %}\Phi{% end %} of the window over the dead time, and in the idealized loop a standing delay of e dead times is enough after an upward step, whatever the window.
- **The threshold of the trap.** Multiply retry factors across every layer to get A. A service that completes abandoned work is vulnerable whenever its utilization is at least 1/A, and a scaler on a debt-excluding signal must keep its target below that.
- **The ceiling band.** A replica ceiling must exceed A times the demand divided by the per-pod rate, and stay below the scalability limit. If it cannot do both, the ceiling is not the lever.
- **The bound.** An admission bound protects against debt only if it is shorter than the client timeout. Set in seconds of capacity, below the timeout, it turns the trap into refusals and leaves the excess the overload brings.

{{ layer(n=2, type="Fit", id="compute-reading") }}None of these numbers requires a simulation, a load test or a tuning session. Each needs a value the team already has: a target, a limit, a dead time, a window, a retry count, a timeout. What they require is the habit of computing them before choosing the settings, rather than after the incident that the settings permitted.

## The Binding Constraint, in Sequence

{{ layer(n=2, type="Fit", id="csf-part-4") }}[The Constraint Sequence Framework](@/blog/2025-12-27/index.md) orders constraints by which binds first, and for the whole series the order is now visible. The dead time binds first, because it sets the interval in which only fast actuators can act and the price of every round after it. The amplification binds second, because it sets the threshold every other setting is measured against and the floor under every ceiling. The admission bound binds third, because it is the only fast actuator the operator owns, and it works only when it is shorter than the timeout. The signal binds fourth. It decides whether the metric ceiling of [One Bit per Dead Time](@/blog/2026-10-04/index.md) binds at all, and with the debt removed the cleanest signal is the best one. The target and the window bind last, because once the signal is chosen they only tune what it does, and they are where most tuning effort goes. This order merges the sequences of the earlier parts without reversing any of them. The dead time led the first two, and it stands ahead of the amplification that led the third because, by Proposition 8 of [Demand Is Not Debt](@/blog/2026-10-18/index.md), the dead time is what turns a sustained step into a trigger.

{{ layer(n=2, type="Fit", id="csf-part-4-consequence") }}Tuning the autoscaler first is natural, because its settings are the ones in front of the operator. The sequence says it is the last place to look. Consider a team that shortens its dead time, knows its amplification, bounds its queue below its clients' patience and only then chooses a signal. It has done the work that settings cannot do for it.

## Falsification Criteria

The cluster kit for this series supports an admission bound, timeouts and retries. The predictions below come from the fluid model at its size: four pods at a 50% target, a ten-second timeout and two retries.

**F1 (the bound removes the overshoot and the loss).**
- *Condition:* a sustained fivefold step on the CPU signal with a replica ceiling of 50, with and without a five-second admission bound.
- *Prediction:* without the bound, pods climb to the ceiling of 50 and 10.3% of demand is lost; with it, pods peak at 21 and 1.2% is lost.
- *Refuted if:* the bounded run still overshoots to the ceiling, or loses as much as the unbounded one.

**F2 (the ceiling floor).**
- *Condition:* a fivefold spike for 300 seconds, then back, on the CPU signal, with replica ceilings of 6, 7 and 12; the amplified load after the spike needs six pods.
- *Prediction:* a ceiling of 6 never recovers; 7 recovers after about 6,974 seconds and 12 after about 1,085.
- *Refuted if:* the ceiling of 6 recovers on its own, or recovery time does not fall roughly as one over the margin above six.

**F3 (the bound must be shorter than the timeout).**
- *Condition:* the F1 step with an admission bound of 20 seconds, twice the client timeout, and again with 5 seconds.
- *Prediction:* the 20-second run still serves abandoned attempts, about 6,262 seconds of base load, climbs to the ceiling of 50 and loses 7.5% of demand; the 5-second run serves none, peaks at 21 pods and loses 1.2%.
- *Refuted if:* the 20-second bound removes the abandoned work as completely as the 5-second one.

## The Ledger of What the Loop Cannot Know

The series kept one artifact across its four parts. Here it is complete.

**Size.** *Belief:* the metric measures load. *Law:* at most one factor of g per round; no scale-up at all inside the tolerance band. *Bill:* fifteen rounds for a thirtyfold overload at the API's default target.

**Time.** *Belief:* a stabilization window makes the loop stable. *Law:* rest only if the standing delay is at least {% katex() %}\tau\,\Phi(W/\tau){% end %}, never more than e dead times, and e is exact. *Bill:* about ninety seconds of waiting on every message at the default window.

**State.** *Belief:* a cleaner signal is a safer one. *Law:* trapped after a trigger if and only if {% katex() %}A\rho \ge 1{% end %}; a scaler blind to the debt is trapped at any target of 1/A or more. *Bill:* with two retries, a target of a third or more turns a tenfold step into a permanent failure at twice the capacity demand needs.

**Where the excess goes.**

*Belief:* a limit removes a risk.

*Mechanism:* during the dead time the autoscaler has no authority; whatever a limit holds back flows into the next quantity without one.

*Law:* Proposition 10, an admission bound shorter than the client timeout removes the debt. Proposition 11, a replica ceiling at or below {% katex() %}A\lambda/c{% end %} traps the service. Proposition 12, the backlog keeps the overload's tail index. Layer 1 for the propositions; Layer 3 for the sweeps.

*Bill:* refused requests carrying the full tail of the overload's excess, about 11,000 seconds of base load at the 99th percentile on the CPU signal in the heavy-tailed runs and about a third of that on the first-attempt signal, in exchange for a queue that never holds more than five seconds of work.

## The Dashboard, Read Again

[One Bit per Dead Time](@/blog/2026-10-04/index.md) opened on a dashboard. Every pod read 100% CPU, the replica count said 20, then 40, then 80, two minutes apart, and the engineer on call could not tell how much load was arriving. The four parts give that screen a reading.

{{ layer(n=3, type="Estimate", id="dashboard-reread") }}The stairs are rounds. Each costs one dead time plus one metric window, and at a 50% target each can at most double the ready pods. A tenfold step needs three of them and meets its load at 345 seconds. The count that kept climbing to 317 pods was the backlog holding the metric at its ceiling after the need had passed. Give the clients behind that service a ten-second timeout and two retries, and the same step leaves debt behind. The count climbs to twelve and a half times the need, and the service is healthy only after 771 seconds. Put a five-second admission bound at the door and the stairs do not change, because the door has no authority over the dead time. The count stops at the need, and the service loses 180 seconds of demand instead of 736.

None of this needed a new controller. It needed knowing which quantity each number on the screen measures, and which quantity it cannot.

## What the Four Beliefs Share

{{ layer(n=2, type="Fit", id="beliefs-share") }}Each belief this series examined is a sound piece of local reasoning. A busier pod does mean more work. A window does stop a noisy metric from discarding warm pods. A demand signal is closer to the cause than CPU. A limit does hold the quantity it limits. In each case the engineer reasoned correctly about the mechanism in front of them. The loop it sat in then moved the problem somewhere the reasoning did not reach.

{{ layer(n=2, type="Fit", id="relocation") }}What the four have in common is relocation. The saturated metric moved the size of the overload out of the signal and into the number of rounds. The window moved the instability out of the replica count and into the threshold. The clean signal moved the debt out of view without moving it out of the queue. The limit moved the excess from the quantity it held to the next one without a limit. None of these mechanisms removed what it appeared to remove. Each changed where it lived, and in a loop with a dead time in it, where it lives decides who sees it and when.

{{ layer(n=2, type="Fit", id="method") }}The method that found each relocation was the same. Read what the mechanism actually computes, from its source rather than its summary. Write down the quantity it holds fixed. Then follow the excess to the first quantity nobody holds, and price it there. That is slower than tuning a setting, and it gives answers a setting cannot: a number of rounds, a standing delay, a threshold, a band, a bound. The settings follow from those numbers. They do not replace them.

## What This Post Did Not Claim

### Where Each Claim Holds

**Claim.** During the dead time the autoscaler has zero authority over the queue.
- *Assumption:* new pods serve only after the provisioning delay, and no capacity is held warm in advance.
- *Failure mode:* a warm pool or pre-started pods shorten the effective dead time, which narrows the interval without removing it.

**Claim.** An admission bound shorter than the client timeout removes the retry debt.
- *Assumption:* first-in-first-out service at a capacity that does not fall while a request waits, and a bound measured against current capacity.
- *Failure mode:* capacity that drops suddenly, for example when pods crash under load, can make an admitted request wait longer than the bound.

**Claim.** A replica ceiling at or below {% katex() %}A\lambda/c{% end %} traps a failing service.
- *Assumption:* retries and abandoned work as in the previous post.
- *Failure mode:* client-side circuit breakers or deadline propagation lower the effective amplification and move the floor down.

**Claim.** The refused volume under a bound below the timeout carries the tail the backlog had.
- *Assumption:* Pareto overloads with index 1.5, from 1.5 times the base load and capped at 2,000 times, applied as sustained steps, 3,000 trials, with a tail-index estimate on the top tenth.
- *Failure mode:* overloads that are short spikes rather than sustained steps produce less excess per event, and correlated overloads would change the sample entirely.

**Reversal condition.** The advice of this post is to bound the queue below the client timeout and to treat ceilings as a band rather than a safety margin. It reverses when refusing work is more expensive than delaying it, for example for writes that cannot be retried or work that must not be lost. There the queue is the right place for the excess, the debt has to be removed by other means, and the only remaining lever is capacity held in advance.

### What Is Not Claimed

The propositions of this post are fluid-model statements, and the sweeps that illustrate them use one specimen, sustained steps and Pareto draws. The cliff at the timeout, the ceiling floor and the tail exchange are shown at the sizes tested. Correlated overloads, short spikes and service times with heavy tails could move the numbers, and none of them is in the model.

It has not been claimed that admission control is new. Yanacek, CoDel and the HBase call queue all pursue the same goal. This post adds the condition that the bound must be shorter than the client timeout, and the measurement of what such a bound does to the tail. Nor has it been claimed that a static bound is the best one. An adaptive shedder can do better, and it owes the delay-margin analysis this post does not supply.

The series has also left open which point on a frontier a service should choose. Each achievable region in it sets pods held against what users lose, whether rounds spent short, delay or work refused, and each is drawn without a price for a miss. Choosing a point takes that price, and only the service can set it. The regions also count the users' side as volume: seconds of demand lost or seconds of delay. A service that manages against the share of requests inside a latency target, or against an error budget, would read the same runs through its own target.

Two open questions are named on purpose. A bound measured against current capacity assumes that capacity does not fall while a request waits, and pods that crash under load break that assumption. And the tail exchange is shown for overloads that arrive as steps; how it behaves for overloads that arrive as bursts is not shown.

One correction belongs here as well. The ceiling rule of [The Governance Tax](@/blog/2026-04-16/index.md) is extended rather than overturned. Its upper bound remains right for the risk it addressed, and this post adds the lower bound that retries impose, which can leave no room between the two.

### What the Series Leaves Open

The series has not proved that any loop in it is stable in the sense a control theorist would accept. The laws are derived in fluid models and checked against simulations of the deployed controller, and each part says which steps are proofs and which are numerical. No stochastic barrier theorem with delay compensation is claimed. The delay-margin analysis that an adaptive admission loop would need, named in an earlier series, is still unpaid. Last-in-first-out service, deadline propagation, heavy-tailed service times and several services in a chain are all outside the models. And no claim here has yet met a real cluster. The falsification criteria in each part are written so that it can, and so that a refutation would show.

An autoscaler adds capacity for the load it can measure, and an overload is the load it cannot. The four parts of this series measured what that sentence costs. The price is a probe of one bit per dead time and a standing delay of one dead time per message. It also includes a debt that a clean signal cannot see, and an excess that a limit can only relocate. The capacity always arrives in arrears. What a design chooses is where the arrears are held while it does.

{% cognitive_map(root="The Barrier the Scaler Cannot Hold") %}
{
  "intro": "During the provisioning delay the autoscaler has ordered capacity and controls nothing. This post asks which actuators can act in that interval, what each costs, how a replica ceiling interacts with retry debt, and what happens to the tail of heavy-tailed overloads when the queue is bounded. It closes the series with the numbers to compute before the next overload.",
  "groups": [
  {"theme": "Authority", "c": "mint", "points": [
    [1, "Zero Authority in the Dead Time", "No pod ordered within a dead time serves within it, so the queue follows admitted work minus the capacity already serving. Only clients, admission and capacity held in advance can act."],
    [2, "Three Levers, Three Bills", "A 25% target holds 4 pods per pod of demand and loses 338 s; a 20% retry budget needs every client and loses 249 s; a 5 s admission bound holds 2 pods and loses 87 s."],
    [3, "The Bound Below the Timeout", "An admission bound shorter than the client timeout means every admitted attempt is served in time, so no debt forms and the trap cannot hold; CoDel and adaptive LIFO pursue the same goal."]
  ]},
  {"theme": "Limits", "c": "sky", "points": [
    [4, "The Bound Reverses the Ranking", "Behind a 5 s bound the CPU scaler loses its twelvefold overshoot and the first-attempt scaler, trapped without it, loses only 87 s: with no debt, the clean signal is best."],
    [5, "The Ceiling Has a Floor", "A replica ceiling at or below A x demand / per-pod rate traps a failing service; above it recovery falls as one over the margin, 40,293 s at a margin of one pod and 1,530 s at twenty-five."],
    [6, "The Feasible Ceiling Band", "A ceiling must exceed the amplified need and stay below 80% of the scalability peak; when amplification closes that band, no ceiling is safe."]
  ]},
  {"theme": "The Tail", "c": "peach", "points": [
    [7, "Time Is Light-Tailed", "Across Pareto overloads with index 1.5, the 99th-percentile overload is 31.3 times base, yet time to capacity is 480 s on CPU and 135 s on the first-attempt signal behind a bound: time grows with the logarithm of size."],
    [8, "Backlog Keeps the Tail Index", "Peak backlog grows like K log K, so its tail index equals the overload's, while looking heavier over any observed range: an estimate of 0.89 against 1.57."],
    [9, "A Limit Can Only Move Size", "On the CPU signal, a bound below the timeout removes the debt and then refuses 11,056 s of base load at the 99th percentile, almost exactly the 11,170 a queue without retries would hold, with the same tail."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**Authority**

1. No pod ordered within a dead time serves within it, so the queue follows admitted work minus the capacity already serving. Only clients, admission and capacity held in advance can act.
2. A 25% target holds 4 pods per pod of demand and loses 338 s; a 20% retry budget needs every client and loses 249 s; a 5 s admission bound holds 2 pods and loses 87 s.
3. An admission bound shorter than the client timeout means every admitted attempt is served in time, so no debt forms and the trap cannot hold; CoDel and adaptive LIFO pursue the same goal.

**Limits**

4. Behind a 5 s bound the CPU scaler loses its twelvefold overshoot and the first-attempt scaler, trapped without it, loses only 87 s: with no debt, the clean signal is best.
5. A replica ceiling at or below {% katex() %}A\lambda/c{% end %} traps a failing service; above it recovery falls as one over the margin, 40,293 s at a margin of one pod and 1,530 s at twenty-five.
6. A ceiling must exceed the amplified need and stay below 80% of the scalability peak; when amplification closes that band, no ceiling is safe.

**The Tail**

7. Across Pareto overloads with index 1.5, the 99th-percentile overload is 31.3 times base, yet time to capacity is 480 s on CPU and 135 s on the first-attempt signal behind a bound: time grows with the logarithm of size.
8. Peak backlog grows like {% katex() %}K \log K{% end %}, so its tail index equals the overload's, while looking heavier over any observed range: an estimate of 0.89 against 1.57.
9. On the CPU signal, a bound below the timeout removes the debt and then refuses 11,056 s of base load at the 99th percentile, almost exactly the 11,170 a queue without retries would hold, with the same tail.

</details>

**Compute it.** Write down your dead time, your target and limit, your downscale window, your retry counts across every layer, your client timeout and your replica ceiling. From them compute g and the rounds for your largest overload, the standing delay your queue consumers need, 1/A, the ceiling band, and whether your admission bound is shorter than your timeout. If any of the five fails, the next overload has already been decided.

---
<sup>[1]</sup> KEDA Authors (2026). *KEDA documentation v2.19*: ScaledObject specification. keda.sh (kedacore/keda-docs).

<sup>[2]</sup> Yanacek, D. (2019). *Using load shedding to avoid overload.* Amazon Builders' Library.

<sup>[3]</sup> Gandhi, A., Harchol-Balter, M., Raghunathan, R. & Kozuch, M.A. (2012). *AutoScale: Dynamic, Robust Capacity Management for Multi-Tier Data Centers.* ACM Transactions on Computer Systems 30(4), Article 14.

<sup>[4]</sup> Nichols, K. & Jacobson, V. (2018). *Controlled Delay Active Queue Management.* RFC 8289, IETF.

<sup>[5]</sup> Apache HBase Authors (2026). *AdaptiveLifoCoDelCallQueue.* hbase-server, Apache HBase source (apache/hbase, master branch).
