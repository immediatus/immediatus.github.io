+++
authors = ["Yuriy Polyulya"]
title = "The Delay a Window Demands"
description = "Scale a consumer on its backlog with the default five-minute stabilization window, and it can swing between a handful of pods and its ceiling while demand stays flat. This post follows a queue through KEDA into the Kubernetes autoscaler and finds the condition for rest: a standing delay of about one provisioning dead time. At the Kafka default of ten messages per pod, a consumer handling ten messages a second carries one second of it."
date = 2026-10-11
slug = "capacity-in-arrears-part2-the-delay-a-window-demands"

[taxonomies]
tags = ["distributed-systems", "control-theory", "systems-thinking", "queueing-theory"]
series = ["capacity-in-arrears"]

[extra]
toc = false
series_order = 2
series_title = "Capacity in Arrears: Autoscaling Under Dead Time, Saturated Metrics, and Retry Debt"
series_description = """<div class="series-lede">An autoscaler adds capacity for the load it can measure, and an overload is the load it cannot.</div>A utilization metric is bounded by the capacity it reports on, so it reads the same at twice the load and at thirty times. This series follows one widely deployed autoscaler from its source code to its limits, and uses it to test four things engineers reasonably believe about a control loop: that its metric measures load, that a stabilization window makes it stable, that a cleaner signal is a safer one, and that a limit removes a risk. Each part prices what one belief leaves out. The results come from the controller's own arithmetic and from simulations whose assumptions each part states. Every part names the observation, on a real cluster, that would prove it wrong."""
+++

<div class="recap-box">
<span class="recap-label">Argument so far</span>
<ul>
<li><strong><a href="/blog/capacity-in-arrears-part1-one-bit-per-dead-time/">One Bit per Dead Time</a>'s Proposition 2.</strong> A utilization metric saturates at the pods' allowance, so a controller scaling on it can at most multiply its ready pods by one growth factor per provisioning delay. It sizes an overload by probing, one round at a time.</li>
<li><strong>The way out it pointed to.</strong> A signal that counts waiting work cannot saturate, so it sees the size of an overload at once. It is also driven by a backlog, and a backlog is a quantity that integrates past shortfalls.</li>
<li><strong>What this post asks next.</strong> What does the provisioning delay do to a loop driven by a backlog, and what does a stabilization window, added to keep that loop calm, do to it?</li>
</ul>
</div>

A queue consumer is about the most natural thing to autoscale. Its work arrives as messages, its backlog is a number the broker already reports, and the obvious rule writes itself: one pod for every so many waiting messages. KEDA ships that rule for Kafka, for SQS, for RabbitMQ and for dozens of other sources. AWS documents the same idea for its own fleets as backlog per instance. It is one of the most common ways to scale asynchronous work.

Take such a consumer in a model. Each pod handles ten messages a second. Demand steps up to two thousand messages a second, which needs two hundred pods, and then stays there, perfectly flat, for twenty hours. The autoscaler aims for ten waiting messages per pod, the default threshold of KEDA's Kafka scaler. A new pod takes 90 seconds to start consuming, and the Kubernetes autoscaler applies its default five-minute window to every scale-down.

Over the last hour of the run, with demand that never moves, the pod count does not settle. It spends most of the hour pinned at the configured ceiling of two thousand, ten times what the work needs. Then it falls to a handful of pods, as low as one, and climbs back. The fifth percentile of the hour is 8 pods, the ninety-fifth is 2,000, and the mean is 1,551.

The obvious suspect is the five-minute window, so remove it. The loop still swings from one pod to two thousand, with a mean of 936. Remove nothing, and instead raise the threshold until each pod's share of the backlog is forty seconds of work. With the window, the loop still hunts, between 40 and 503 pods over the hour. Without it, the loop settles into a band from 186 to 234 pods.

So the window matters, but it is not the whole story, and removing it did not rescue the default. Something about a backlog-driven loop needs a standing quantity of waiting work to stay at rest, and the window raises how much. This post finds how much.

<div class="recap-box">
<span class="recap-label">In brief</span>
<ul>
<li><strong>The belief.</strong> A stabilization window makes an autoscaling loop stable.</li>
<li><strong>The mechanism.</strong> A backlog-scaled loop acts on the backlog of one dead time ago on the way up and, through the window, of one window ago on the way down.</li>
<li><strong>The law.</strong> It rests only if every message waits a standing delay {% katex() %}D = T/c{% end %} of at least {% katex() %}\tau\,\Phi(W/\tau){% end %}: about one dead time at the default window, rising with the window, and never more than e dead times after an upward step. A closed form derived by harmonic balance gives the curve within 3.3% for windows from one dead time up to the default.</li>
<li><strong>The bill.</strong> About ninety seconds of waiting on every message at a 90-second dead time, or a hunt that costs 17% to 99% more pods. The Kafka default supplies one second, and hunts with or without the window.</li>
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

## The Belief: the Window Makes the Loop Stable

{{ layer(n=1, type="Bound", id="docs-window-remedy") }}The Kubernetes documentation presents the stabilization window as the remedy for an unstable replica count. It names the problem first: "it is possible that the number of replicas keeps fluctuating frequently due to the dynamic nature of the metrics evaluated. This is sometimes referred to as thrashing, or flapping"{{ cite(ref="1", title="The Kubernetes Authors (2026) -- Horizontal Pod Autoscaling, kubernetes.io documentation") }}. It then gives the fix: "The stabilization window is used to restrict the flapping of replica count when the metrics used for scaling keep fluctuating." With a five-minute window, the page explains, the controller "avoids having the scaling algorithm frequently remove Pods only to trigger recreating an equivalent Pod just moments later."

{{ layer(n=1, type="Bound", id="defaults-are-300") }}The default applies the window to scale-downs only. The documentation states it directly: "For scaling down the stabilization window is 300 seconds", while "For scaling up there is no stabilization window." KEDA, which turns a queue into a metric the Kubernetes autoscaler can read, passes the setting through untouched. Its specification says "KEDA would feed values from this section directly to the HPA's behavior field," and the example it prints sets `stabilizationWindowSeconds: 300`{{ cite(ref="2", title="KEDA Authors (2026) -- KEDA documentation v2.19: ScaledObject specification, Apache Kafka scaler, AWS SQS Queue scaler") }}.

The belief is reasonable, and for the loop the documentation has in mind it is correct. A noisy metric makes a ratio controller add and remove pods in quick succession. Each removal throws away a warm pod that the next sync will ask for again. A window that holds the highest recent recommendation stops that. It costs a few minutes of extra pods after every peak and buys a calmer count.

The belief carries an assumption it never states. It treats the window as a filter on noise, something that removes fluctuation without changing the loop it sits in. In a loop driven by a backlog the window is part of the dynamics. It holds pods after the work that justified them is gone, and holding pods drains the backlog the next decision will read.

## How a Queue Reaches the Controller

{{ layer(n=1, type="Bound", id="keda-average-value") }}KEDA does not scale anything itself between one pod and many. It publishes each trigger as an external metric and creates a HorizontalPodAutoscaler that reads it. By default the metric has the type `AverageValue`, and KEDA's specification spells out what follows: "If our metric is the queue size, the threshold is 5 messages, and the current message count in the queue is 20, HPA will scale the deployment to 20 / 5 = 4 replicas, regardless of the current replica count."{{ cite(ref="2", title="KEDA Authors (2026) -- KEDA documentation v2.19: ScaledObject specification, Apache Kafka scaler, AWS SQS Queue scaler") }}

{{ layer(n=1, type="Bound", id="external-per-pod-source") }}The controller's source agrees. For an external metric with a per-pod target, `GetExternalPerPodMetricReplicas` computes `math.Ceil(float64(usage) / float64(targetUsagePerPod))`, after the same tolerance check as every other metric{{ cite(ref="3", title="The Kubernetes Authors (2025) -- kubernetes/kubernetes v1.34.0, pkg/controller/podautoscaler") }}. The recommendation is the backlog divided by the threshold, rounded up. The current count enters only through the tolerance: if the backlog per current pod is within 10% of the threshold, the controller holds.

{{ layer(n=1, type="Bound", id="no-anticipation") }}That rule differs from the CPU path of [One Bit per Dead Time](@/blog/2026-10-04/index.md) in one decisive way. The CPU path counted ordered pods at zero usage, so it could not order the same capacity twice within a round. The backlog path has no such accounting. A pod that has been ordered but is not yet consuming does nothing to the backlog. The backlog keeps growing during the dead time, and the recommendation grows with it. The controller keeps ordering for work that the pods already on their way will eventually take.

### One Sync, Walked Through

{{ layer(n=3, type="Estimate", id="walked-backlog-sync") }}The port runs the external per-pod calculation on concrete inputs, with a threshold of ten messages per pod. The replica count is every pod the deployment has, whether it is consuming yet or still on order. Sweep the backlog for three replica counts.

<div style="margin:1.5em 0;">
<canvas id="chart-backlog-rule" role="img" aria-label="Recommendation of the ported external per-pod calculation, threshold 10 messages per pod, against backlog from 0 to 5,000 messages, for 100, 200 and 300 current replicas. All three lines follow backlog divided by 10, from 0 to 500, except for a flat step where each holds its current count: 100 replicas between 900 and 1,100 messages, 200 between 1,800 and 2,200, and 300 between 2,700 and 3,300." style="width:100%;height:300px;display:block;"></canvas>
<figcaption>The ported external per-pod calculation swept over the backlog, for three current replica counts. The recommendation is the backlog divided by the threshold, whichever count is current, except inside each count's tolerance band. Pods on order do not change it: nothing in the signal says they exist.</figcaption>
<script>
(function(){var S={"id":"chart-backlog-rule","h":300,"ml":[34,42],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"line","pts":[[0,0],[100,10],[200,20],[300,30],[400,40],[500,50],[600,60],[700,70],[800,80],[900,90],[1000,100],[1100,110],[1200,120],[1300,130],[1400,140],[1500,150],[1600,160],[1700,170],[1800,180],[1900,190],[2000,200],[2100,210],[2200,220],[2300,230],[2400,240],[2500,250],[2600,260],[2700,300],[2800,300],[2900,300],[3000,300],[3100,300],[3200,300],[3300,300],[3400,340],[3500,350],[3600,360],[3700,370],[3800,380],[3900,390],[4000,400],[4100,410],[4200,420],[4300,430],[4400,440],[4500,450],[4600,460],[4700,470],[4800,480],[4900,490],[5000,500]],"c":"d","w":1.6},{"t":"txt","x":3300,"y":300,"s":"300 replicas: band holds 300","n":"300: holds","al":"left","bl":"top","dx":6,"dy":4,"c":"d"},{"t":"line","pts":[[0,0],[100,10],[200,20],[300,30],[400,40],[500,50],[600,60],[700,70],[800,80],[900,90],[1000,100],[1100,110],[1200,120],[1300,130],[1400,140],[1500,150],[1600,160],[1700,170],[1800,200],[1900,200],[2000,200],[2100,200],[2200,200],[2300,230],[2400,240],[2500,250],[2600,260],[2700,270],[2800,280],[2900,290],[3000,300],[3100,310],[3200,320],[3300,330],[3400,340],[3500,350],[3600,360],[3700,370],[3800,380],[3900,390],[4000,400],[4100,410],[4200,420],[4300,430],[4400,440],[4500,450],[4600,460],[4700,470],[4800,480],[4900,490],[5000,500]],"c":"b","w":2.6},{"t":"txt","x":2200,"y":200,"s":"200 replicas: band holds 200","n":"200: holds","al":"left","bl":"top","dx":6,"dy":4,"c":"b"},{"t":"line","pts":[[0,0],[100,10],[200,20],[300,30],[400,40],[500,50],[600,60],[700,70],[800,80],[900,100],[1000,100],[1100,100],[1200,120],[1300,130],[1400,140],[1500,150],[1600,160],[1700,170],[1800,180],[1900,190],[2000,200],[2100,210],[2200,220],[2300,230],[2400,240],[2500,250],[2600,260],[2700,270],[2800,280],[2900,290],[3000,300],[3100,310],[3200,320],[3300,330],[3400,340],[3500,350],[3600,360],[3700,370],[3800,380],[3900,390],[4000,400],[4100,410],[4200,420],[4300,430],[4400,440],[4500,450],[4600,460],[4700,470],[4800,480],[4900,490],[5000,500]],"c":"c","w":1.6},{"t":"txt","x":1100,"y":100,"s":"100 replicas: band holds 100","n":"100: holds","al":"left","bl":"top","dx":6,"dy":4,"c":"c"},{"t":"txt","x":100,"y":480,"s":"backlog / 10, whatever the replica count","n":"backlog / 10","al":"left","bl":"top","c":"ink"}],"X":{"lo":0,"hi":5000,"ticks":[[0,"0"],[1000,"1,000"],[2000,"2,000"],[3000,"3,000"],[4000,"4,000"],[5000,"5,000"]],"nticks":[[0,"0"],[2500,"2,500"],[5000,"5,000"]],"title":"backlog, messages","ntitle":"backlog"},"Y":{"lo":0,"hi":520,"ticks":[[0,"0"],[100,"100"],[200,"200"],[300,"300"],[400,"400"],[500,"500"]],"title":"recommendation, threshold 10 messages per pod","ntitle":"recommendation"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=1, type="Bound", id="walked-backlog-reading") }}The three lines lie on top of one another almost everywhere. Two thousand messages at ten per pod is two hundred pods, whatever the current count, which is the rule KEDA describes. Each line leaves the shared diagonal only inside its own tolerance band. With two hundred replicas, any backlog from 1,800 to 2,200 messages holds the count at two hundred, and 2,300 messages asks for 230. The flat steps are the only place the current count matters. That has a consequence for the dynamics. Suppose a hundred of three hundred replicas are still starting. They have not touched the backlog, which has kept growing to four thousand messages, and the controller asks for four hundred. It has ordered a hundred more pods for work that the hundred already on their way will absorb when they arrive. The same line read downward is the other branch. A backlog drained to a thousand messages asks for a hundred pods, and only the window stands between that request and the count.

{{ layer(n=1, type="Bound", id="defaults-keda") }}The defaults set the scale of everything that follows. KEDA's Kafka scaler takes `lagThreshold`, the "Target value for the total lag (sum of all partition lags)", with a default of 10. Its SQS scaler takes `queueLength`, default 5, and its documentation gives the intended reading: "if one pod can handle 10 messages, set the queue length target to 10." KEDA's `cooldownPeriod` of 300 seconds "only applies when scaling to 0". Between one replica and many, the Kubernetes autoscaler and its own window do the work.

{{ layer(n=1, type="Bound", id="kafka-partition-cap") }}One more default bounds the Kafka case. Unless `allowIdleConsumers` is set, the Kafka scaler will not ask for more replicas than there are partitions, because a consumer beyond the partition count would sit idle. A Kafka consumer group therefore hunts, when it hunts, between one pod and its partition count. The model in this post has no partitions. Its ceiling is a replica limit of 2,000, which stands for whichever cap binds first in a real deployment.

{{ layer(n=1, type="Bound", id="aws-sizing-rule") }}AWS documents a sizing rule for the same kind of loop. Its guide to scaling on an SQS queue defines backlog per instance and sets the target from the latency the application can accept: "take the acceptable latency value and divide it by the average time that an EC2 instance takes to process a message"{{ cite(ref="4", title="Amazon Web Services (2026) -- Scaling policy based on Amazon SQS, Amazon EC2 Auto Scaling User Guide") }}. With a ten-second acceptable latency and a tenth of a second per message, the target is a hundred messages per instance. This rule turns out to be the right one for choosing the threshold, for a reason the guide does not give. The next section shows why.

## A Backlog Is an Integrator

Before the equations, one step worked through with numbers. Take a consumer of the size a test cluster can hold. Each pod handles ten messages a second, and demand steps from 50 to 200 messages a second, so the need goes from five pods to twenty. The dead time is 90 seconds, the window is the default five minutes, the replica ceiling is 100, and the threshold is KEDA's default of ten messages per pod. At rest that threshold holds one second of work per pod.

{{ layer(n=3, type="Estimate", id="worked-step-up") }}In the first thirty seconds after the step the backlog reaches 4,700 messages, and the controller doubles its count at each of the two syncs, from five pods to twenty. By sixty seconds it has ordered 80 pods, and by ninety it sits at the ceiling of 100, five times the need, while only ten pods are consuming. The backlog keeps growing until the ordered pods start to consume, and at two minutes it still holds 14,850 messages. A hundred pods then clear it within a minute: 2,250 messages at 150 seconds and none at 180.

{{ layer(n=3, type="Estimate", id="worked-step-down") }}With the queue empty the recommendation falls to one pod, and the window holds the hundred pods for five more minutes anyway. When it lets go, the count drops at once to a single pod, and the backlog starts to build again from zero. The second climb begins from one pod instead of five, so it goes higher, past 24,000 messages, and from then on the loop repeats it exactly, every 510 seconds. Demand never moves after the step. The swing comes from three things the rest of this post takes apart: the backlog remembers every second of shortfall, the pods ordered against it arrive one dead time late, and the window keeps them one window too long on the way down.

The backlog changes at the rate work arrives minus the rate pods remove it. With demand {% katex() %}\lambda{% end %}, a per-pod rate c and N pods consuming:

{% katex(block=true) %}
\frac{dL}{dt} = \lambda - c\,N(t)
{% end %}

The autoscaler sets N from L. The threshold T, in messages per pod, says how much backlog one pod should carry. At rest, with N pods exactly matching demand, the backlog sits at T messages per pod.

<span id="def-4"></span>
<details>
<summary>Definition 4 -- Standing Delay: the seconds of waiting a backlog-scaled loop holds at rest, which is the threshold per pod over the rate of one pod</summary>

**Definition 4** (Standing Delay). *A loop that scales on backlog with a threshold of T messages per pod, served by pods of rate c, holds at rest a backlog of T messages per pod. Its standing delay is*

{% katex(block=true) %}
D = \frac{T}{c}
{% end %}

where:

- {% katex() %}T{% end %} - the threshold, in messages per pod
- {% katex() %}c{% end %} - the rate of one pod, in messages per second

*By Little's law, D is also the time every message waits in the queue at rest.*

</details>

{{ layer(n=1, type="Bound", id="littles-law-wait") }}At rest the backlog is {% katex() %}L^\ast = T \lambda / c{% end %}, and Little's law gives the wait as backlog over arrival rate{{ cite(ref="5", title="Little, J.D.C. (1961) -- A Proof for the Queuing Formula: L = lambda W, Operations Research, 9(3), 383-387") }}. That is {% katex() %}L^\ast / \lambda = T/c{% end %}, the standing delay. The threshold is a latency in disguise. The Kafka default of ten messages per pod, at ten messages a second per pod, is one second of waiting. The AWS rule, acceptable latency over time per message, sets the standing delay equal to the acceptable latency. The guide is choosing D directly.

{{ layer(n=1, type="Bound", id="pure-delay-model") }}Strip the controller to its simplest form first. Suppose the pods consuming now are the ones the backlog asked for one dead time ago, {% katex() %}N(t) = L(t-\tau)/T{% end %}. Write {% katex() %}x = (L - L^\ast)/L^\ast{% end %} for the relative deviation of the backlog from rest. The backlog equation becomes

{% katex(block=true) %}
\frac{dx}{dt} = -\frac{c}{T}\, x(t-\tau)
{% end %}

This is the linear delay equation with gain {% katex() %}a = c/T = 1/D{% end %}. The dimensionless product {% katex() %}a\tau = \tau / D{% end %} says how many standing delays fit in one dead time.

<span id="prop-3"></span>
<details>
<summary>Proposition 3 -- Delay Equation Thresholds: the pure-delay backlog loop is stable iff the standing delay exceeds 2/pi dead times, and its characteristic equation has a real root iff the delay is at least e dead times</summary>

**Proposition 3** (Delay Equation Thresholds). *For {% katex() %}x'(t) = -a\, x(t-\tau){% end %} with {% katex() %}a = 1/D > 0{% end %}:*

1. *The equilibrium is asymptotically stable if and only if {% katex() %}a\tau < \pi/2{% end %}, that is {% katex() %}D > (2/\pi)\,\tau{% end %}.*
2. *The characteristic equation has a real root if and only if {% katex() %}a\tau \le 1/e{% end %}, that is {% katex() %}D \ge e\,\tau{% end %}.*

*Proof sketch.* The characteristic equation is {% katex() %}s + a e^{-s\tau} = 0{% end %}. For part 1, roots move continuously with a. As a tends to zero, one root tends to zero from the left and the rest have real parts tending to minus infinity. A root reaches the imaginary axis at {% katex() %}s = i\omega{% end %} only if {% katex() %}|\omega| = a{% end %} and {% katex() %}e^{-i\omega\tau} = -i\,\omega/a{% end %}, which first happens at {% katex() %}\omega\tau = \pi/2{% end %}, so at {% katex() %}a\tau = \pi/2{% end %}. For part 2, a real root s satisfies {% katex() %}s\, e^{s\tau} = -a{% end %}, so s is negative. On the negative axis {% katex() %}s\,e^{s\tau}{% end %} has its minimum {% katex() %}-1/(e\tau){% end %} at {% katex() %}s = -1/\tau{% end %}, so a real root exists exactly when {% katex() %}a \le 1/(e\tau){% end %}. {% katex() %}\square{% end %}

</details>

{{ layer(n=1, type="Bound", id="anti-fragile-link") }}Part 1 of the proposition is the symmetric condition [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md) used as a filter on actions, gain times delay below {% katex() %}\pi/2{% end %}. That post applied it as a sufficient condition for a loop with one delay. For this equation it is also necessary. Part 2 is the stricter condition for a non-oscillating response, and it returns later in this post with a different job.

{{ layer(n=3, type="Estimate", id="pure-delay-numbers") }}In the specimen's terms, with a 90-second dead time, the pure-delay loop needs a standing delay above {% katex() %}(2/\pi) \times 90{% end %}, about 57 seconds, to be stable at all. The Kafka default supplies one second. The pure-delay loop at the default is unstable by a factor of nearly sixty. That alone explains why the default hunts. It does not explain why the window makes things worse, or by how much, because the pure-delay model has no window in it.

{{ layer(n=2, type="Fit", id="integrator-reading") }}The reason a backlog loop needs a standing delay at all is the integrator. A backlog remembers every second in which capacity fell short and every second in which it ran over. A controller that reads the backlog through a dead time acts on a memory that is already out of date. The integrator keeps adding to the error while the correction is on its way. A larger threshold makes each pod's share of the backlog larger, so the controller's response to a given deviation is gentler. The standing delay is the price of that gentleness, paid by every message, all the time.

{{ layer(n=2, type="Fit", id="contrast-with-cpu") }}The two loops in this series fail in opposite directions for one reason. The CPU loop of [One Bit per Dead Time](@/blog/2026-10-04/index.md) counted every pod on order at zero usage. It never ordered the same capacity twice, and it paid for that caution with a slow, fixed rate of learning when its metric saturated. The backlog loop learns the size of an overload at once, because its signal has no ceiling. It pays by ordering past the pods already on their way, since nothing in its signal says they exist. Both loops face the same dead time. One spends it waiting, and the other spends it accumulating a debt it will later overpay.

## Two Branches, Two Delays

The deployed loop is not the pure-delay loop. Its way up and its way down pass through different mechanisms, and the difference is what the window adds.

{{ layer(n=1, type="Bound", id="up-branch") }}On the way up, a recommendation becomes capacity only after the dead time. A pod ordered now starts consuming 90 seconds later. If the recommendation dips in between, pods still starting are the first to go. The ReplicaSet controller ranks pods for deletion with unscheduled before scheduled, pending before running and not ready before ready{{ cite(ref="3", title="The Kubernetes Authors (2025) -- kubernetes/kubernetes v1.34.0, pkg/controller/podautoscaler") }}. So a pod reaches service only if it was wanted for the whole dead time without a break. The consuming count is the minimum of the recommendation over the last dead time.

{{ layer(n=1, type="Bound", id="down-branch") }}On the way down, the window holds the highest recommendation of the last W seconds, five minutes by default, and only then lets the count fall. A pod that is no longer wanted keeps consuming until the window has passed. The consuming count is the maximum of the recommendation over the last window, before the dead time's minimum is applied to it.

Put together, and leaving aside the sync period, rounding and the tolerance, the loop is:

{% katex(block=true) %}
N(t) = \min_{u \in [t-\tau,\, t]} \; \max_{v \in [u-W,\, u]} \frac{L(v)}{T}, \qquad \frac{dL}{dt} = \lambda - c\,N(t)
{% end %}

{{ layer(n=2, type="Fit", id="branches-reading") }}While the backlog rises, the maximum does nothing, and the loop acts on the backlog of one dead time ago. While it falls, the window holds the old, larger value, and the loop acts on the backlog of one window ago. The way up has the dead time and the way down has the window. A window five minutes long on a loop whose dead time is ninety seconds makes the down branch more than three times slower than the up branch.

> **Physical translation.** Picture a thermostat that switches the heating on a few minutes late and refuses to switch it off until the room has been warm for half an hour. In a room that loses heat slowly, nobody notices. In a draughty room the heating overshoots every time, then finally switches off, the room cools past the setpoint, and the late start overshoots again. The cure lies in the room rather than the switch: a room that holds more heat, with a reserve large enough that the two delays stop mattering. In a backlog-driven loop that reserve is the standing delay, and the window decides how large it has to be.

<span id="def-5"></span>
<details>
<summary>Definition 5 -- Hunting: a backlog-scaled loop hunts if a step in demand leaves a pod count that keeps swinging instead of settling</summary>

**Definition 5** (Hunting). *In the idealized loop, a loop hunts if the deviation produced by an upward step in demand, starting from rest, does not decay. In the deployed loop, measured over the last hour of a twenty-hour run, a loop hunts if its pod count swings by more than 30% of the pods needed.*

*The 30% threshold sits well above the ripple the 10% tolerance leaves in a settled loop, so tolerance ripple is not counted as hunting.*

</details>

<span id="prop-4"></span>
<details>
<summary>Proposition 4 -- Window Scaling Law: whether the backlog loop hunts depends only on the standing delay and the window, each measured in dead times; it rests iff D is at least tau times Phi(W/tau), a curve computed numerically</summary>

**Proposition 4** (Window Scaling Law). *In the idealized min-max loop, whether a disturbance decays does not depend on its size. Measured in units of the dead time, the only parameters are {% katex() %}a\tau = \tau/D{% end %} and {% katex() %}w = W/\tau{% end %}. If, for each w, the gains at which the loop rests form an interval, as the integration finds for every w computed, there is a function {% katex() %}\Phi{% end %} of w alone such that the loop rests after an upward step if and only if*

{% katex(block=true) %}
D \ge \tau \cdot \Phi\!\left(\frac{W}{\tau}\right)
{% end %}

*Proof.* Around rest write {% katex() %}x = (L - L^\ast)/L^\ast{% end %}. Both the minimum and the maximum commute with adding a constant, so the constant {% katex() %}L^\ast/T{% end %} passes through them, and {% katex() %}x' = -a\, F[x]{% end %} with {% katex() %}F = \min_\tau \max_W{% end %}. Both also commute with multiplying by a positive number, so F is positively homogeneous: if x is a solution, so is {% katex() %}\alpha x{% end %} for every {% katex() %}\alpha > 0{% end %}. Decay or growth therefore does not depend on the size of the disturbance. Rescaling time by {% katex() %}\tau{% end %} leaves {% katex() %}a\tau{% end %} and {% katex() %}W/\tau{% end %} as the only parameters. For each w, the integration finds a single critical value {% katex() %}a^\ast(w){% end %} below which the loop rests and above which it hunts, and {% katex() %}\Phi(w) = 1/a^\ast(w){% end %}. The scaling is proven; the single crossing is observed numerically for every w computed, not proven. {% katex() %}\square{% end %}

</details>

{{ layer(n=1, type="Bound", id="what-is-exact") }}The scaling is exact for the idealized loop. It reduces a question with five parameters, demand, rate, threshold, dead time and window, to one curve of one variable. The curve itself has no exact closed form that this post could find. It is computed by integrating the idealized loop and bisecting on the gain, and two approximations derived below describe it to within a few percent.

The computed curve, with the two approximations derived later in this post and two reference lines:

<div style="margin:1.5em 0;">
<canvas id="chart-phi" role="img" aria-label="Standing delay needed, in dead times, against the window over the dead time on a log scale. The computed curve rises from 0.119 at w = 0.1 to 0.384 at 0.5, 0.573 at 1, 0.916 at 3.33, 1.213 at 10, 1.539 at 40, 1.719 at 100 and 1.938 at 400. The closed-form harmonic-balance approximation follows it closely from 1 to about 3 and then rises too fast; the asymptotic form e over one plus 30.6 over the squared log of w over 0.07 follows it from about 3 to 400. Dashed lines mark e, the ceiling of Proposition 5, and 2 over pi for the pure-delay loop." style="width:100%;height:340px;display:block;"></canvas>
<figcaption>Φ(w), the standing delay the idealized loop needs, against the window measured in dead times. Blue points: computed. Green dashed: the closed form of Proposition 5a, derived by harmonic balance and drawn for w from 1 to 6. Orange dashed: the asymptotic form e/(1 + c/ln²(w/w₀)), whose shape comes from the roots near e and whose two constants are fitted on w from 10 to 400. The two approximations bracket the default window from opposite sides. Model: the idealized min-max loop with no sampling, rounding, tolerance or ceilings.</figcaption>
<script>
(function(){var S={"id":"chart-phi","h":340,"ml":[34,42],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"hline","y":2.718281828459045,"c":"a","w":1.5,"dash":true},{"t":"txt","x":0.09,"y":2.718281828459045,"s":"e: no window can demand more (Proposition 5)","n":"ceiling e (Prop. 5)","bl":"bottom","dy":-3,"c":"a"},{"t":"hline","y":0.6366197723675814,"c":"g","w":1,"dash":true},{"t":"txt","x":650,"y":0.6366197723675814,"s":"pure delay, 2/\u03c0","n":"2/\u03c0","al":"right","bl":"top","dy":3,"c":"g"},{"t":"line","pts":[[1.0,0.5787860129180238],[1.045812386485474,0.5917431827091072],[1.0937235477264424,0.6046860861968038],[1.14382963360315,0.6176122334564923],[1.1962311988513155,0.6305208335577057],[1.2510334048590739,0.6434128746030066],[1.3083462307087161,0.6562911897111428],[1.368284693886757,0.6691605086556139],[1.4309690811052556,0.6820274951675118],[1.496525189697613,0.6949007702015189],[1.5650845800732873,0.7077909217382965],[1.6367848397380607,0.7207105019479899],[1.711769859409705,0.7336740127621726],[1.790190121783168,0.7466978810905285],[1.872203003524776,0.7598004250705669],[1.9579730911015183,0.773001812851821],[2.0476725110792193,0.7863240154898181],[2.1414812755524615,0.7997907555605464],[2.2395876433994766,0.8134274531051859],[2.342188498086985,0.8272611704806689],[2.449489742783178,0.8413205576279914],[2.5617067135717653,0.8556357991816064],[2.6790646115963486,0.8702385647344647],[2.801798955002356,0.8851619634492457],[2.930156051583521,0.9004405040719348],[3.064393493081416,0.916110061263758],[3.204780672130034,0.9322078490258918],[3.3515993228828322,0.9487724018520827],[3.5051440864071925,0.9658435641106522],[3.665723101980953,0.9834624880319864],[3.833658625477635,1.001671640562618],[4.009287676081387,1.0205148192439688],[4.192962712629476,1.0400371771836558],[4.385052340939638,1.0602852571105799],[4.585942053541797,1.0813070344417584],[4.796035003298642,1.1031519692388891],[5.015752812467621,1.125871066895231],[5.245536418827991,1.1495169473678382],[5.485846960570967,1.1741439227554609],[5.737166701728808,1.1998080830174813],[6.0,1.2265673896329077]],"c":"c","w":2,"dash":true},{"t":"line","pts":[[2.5,0.8010233009255613],[2.720666704246006,0.8276944067243697],[2.960810926237129,0.8542316008714138],[3.2221518818324535,0.8806152740526967],[3.5065605363700665,0.9068271861454524],[3.8160729990900215,0.9328504281004262],[4.152905099838568,0.9586693809143849],[4.51946825240969,0.9842696722279805],[4.9183867180911705,1.0096381310454072],[5.352516393006574,1.0347627410331564],[5.8249652537535646,1.0596325928161228],[6.339115607710884,1.084237835650883],[6.8986483073060745,1.1085696288184734],[7.507569101596281,1.1326200930428492],[8.17023731381564,1.1563822622066084],[8.891397050194614,1.1798500356027224],[9.676211163478253,1.2030181309300878],[10.530298214291516,1.225882038211782],[11.45977269496164,1.2484379747879855],[12.47128880376386,1.2706828415107374],[13.572088082974531,1.292614180244864],[14.770051261777121,1.314230132758656],[16.07375467516949,1.335529401069019],[17.492531662780884,1.3565112092888552],[19.036539387158786,1.3771752670092334],[20.716831549884226,1.3975217342353963],[22.545437526097277,1.4175511878837406],[24.535448483964522,1.4372645898364247],[26.70111110562616,1.456663256541211],[29.057929580580137,1.4757488301362949],[31.622776601683796,1.49452325107324],[34.414014158404306,1.5129887322055047],[37.45162499208848,1.53114773430542],[40.75735565435309,1.5490029429686716],[44.35487219276443,1.5665572468623525],[48.269929578376505,1.5838137172703208],[52.53055608807534,1.6007755888879043],[57.167253961741565,1.6174462418168407],[62.21321777075432,1.6338291847106616],[67.7045720611589,1.649928039020458],[73.68062997280772,1.6657465242910743],[80.18417468595531,1.6812884444581722],[87.26176571020959,1.6965576750972815],[94.96407220859324,1.7115581515768337],[103.3462357430132,1.7262938580682556],[112.46826503806983,1.7407688173674174],[122.3954655893567,1.7549870814830701],[133.19890719186014,1.7689527229493418],[144.95593273553914,1.7826698268208743],[157.75071191060195,1.796142483310728],[171.67484378651142,1.8093747810327796],[186.82801257863832,1.8223708008119344],[203.31870129726212,1.8351346100270904],[221.264968388,1.8476702574533852],[240.79529292371075,1.8599817685718472],[262.04949439868136,1.8720731413161222],[285.1797337099971,1.8839483422274834],[310.3516024922124,1.8956113029908084],[337.7453086039817,1.9070659173256657],[367.55696625365783,1.9183160382080446],[400.0,1.9293654753996223]],"c":"d","w":2,"dash":true},{"t":"txt","x":1.0,"y":0.78,"s":"closed form, Prop. 5a","n":"closed form","al":"right","dx":-4,"c":"c"},{"t":"txt","x":650,"y":2.05,"s":"asymptotic form","n":"asymptotic","al":"right","bl":"bottom","c":"d"},{"t":"line","pts":[[0.1,0.11900000000000001],[0.5,0.384],[1.0,0.573],[2.0,0.773],[3.0,0.887],[3.33,0.916],[5.0,1.029],[10.0,1.213],[20.0,1.384],[40.0,1.539],[100.0,1.719],[400.0,1.938]],"c":"b","mk":3.5,"w":1.2},{"t":"txt","x":0.1,"y":0.11900000000000001,"s":"0.119","al":"left","bl":"bottom","dx":4,"dy":-4,"c":"b"},{"t":"txt","x":100.0,"y":1.719,"s":"1.719","n":"1.72","al":"right","bl":"top","dx":-4,"dy":6,"c":"b"},{"t":"txt","x":400.0,"y":1.938,"s":"1.938","n":"1.94","al":"right","bl":"top","dx":-4,"dy":6,"c":"b"},{"t":"pt","x":3.33,"y":0.916,"c":"b","r":7,"open":true},{"t":"txt","x":3.33,"y":0.916,"s":"default window: 0.916","n":"default 0.92","al":"left","bl":"top","dx":8,"dy":6,"c":"b"}],"X":{"lo":0.08,"hi":700,"log":true,"ticks":[[0.1,"0.1"],[1,"1"],[3.33,"3.33"],[10,"10"],[100,"100"],[400,"400"]],"nticks":[[0.1,"0.1"],[1,"1"],[10,"10"],[100,"100"]],"title":"window over dead time, w = W/\u03c4 (log scale)","ntitle":"w = W/\u03c4 (log)"},"Y":{"lo":0,"hi":3,"ticks":[[0,"0"],[0.5,"0.5"],[1,"1.0"],[1.5,"1.5"],[2,"2.0"],[2.5,"2.5"],[3,"3.0"]],"title":"standing delay needed, in dead times, \u03a6(w)","ntitle":"\u03a6(w), dead times"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="phi-reading") }}The default case reads straight off the curve. A 300-second window over a 90-second dead time is w = 3.33, and {% katex() %}\Phi = 0.916{% end %}. The loop needs a standing delay of about 82 seconds, nearly one full dead time. At w = 1 it needs 0.57 dead times, which is looser than the {% katex() %}2/\pi = 0.64{% end %} of the pure-delay loop. In the idealized loop a window as long as the dead time costs less than a pure delay on both branches would. Longer windows cost more, and the cost grows roughly with the logarithm of the window.

{{ layer(n=3, type="Estimate", id="small-windows") }}Short windows need very little. At a tenth of a dead time the idealized loop needs only 0.119 dead times of standing delay. With no window at all, it still rested at a standing delay of an eighth of a dead time, the shortest tested. The standing delay a backlog loop needs is created by the window, and the larger the window, the larger the delay.

## What the Deployed Loop Does

The idealized loop has no sync period, no rounding, no tolerance, and no minimum or maximum. The deployed loop has all of them. The test is whether the curve still predicts where the deployed loop stops hunting.

{{ layer(n=3, type="Estimate", id="deployed-setup") }}The deployed model runs the ported external-metric calculation and the ported normalizer, with its stabilization window, every 15 seconds. The backlog is refreshed every 15 seconds. Demand steps from fifty pods' worth of work to two hundred pods' worth and stays there. The ceiling is 2,000 replicas and the floor is one, so a single pod is half a percent of the need and rounding does not pose as oscillation. For each pair of dead time and window, bisection finds the smallest standing delay at which the loop does not hunt.

{{ layer(n=2, type="Fit", id="sampling-delay") }}The deployed loop also samples. A change in the backlog reaches a decision up to one sync later, and a decision reaches the scale target at the next. The comparison adds a sampling delay of 10 seconds to both branches, so the effective dead time is {% katex() %}\tau + 10{% end %} and the effective window is {% katex() %}W + 10{% end %}. The 10 seconds is one value chosen for all sixteen pairs, not fitted pair by pair.

The observed boundaries, first against the window and then against the curve. Each comes from bisection over twenty-hour runs, with hunting as in Definition 5.

<div style="margin:1.5em 0;">
<canvas id="chart-boundary-window" role="img" aria-label="Standing delay the deployed loop needs against the downscale window on a log scale, one line per dead time. Dead time 30 s: 27.1, 31.8, 41.1, 51.6 s for windows of 60, 120, 300 and 600 s. 60 s: 41.1, 49.3, 62.2, 75.0. 90 s: 47.0, 63.3, 85.5, 98.4. 180 s: 57.5, 87.8, 132.2, 166.1. Every line rises with the window." style="width:100%;height:320px;display:block;"></canvas>
<figcaption>The smallest standing delay at which the deployed loop stops hunting, against the window, for four dead times. Every line rises: the window added to calm the loop raises the delay the loop needs to be calm. Model: ported controller, 15-second sync, demand stepping from 50 to 200 pods needed, last hour of a 20-hour run.</figcaption>
<script>
(function(){var S={"id":"chart-boundary-window","h":320,"ml":[40,50],"mr":[54,64],"mt":24,"mb":42,"els":[{"t":"line","pts":[[60.0,27.1],[120.0,31.8],[300.0,41.1],[600.0,51.6]],"c":"c","mk":4,"w":1.6},{"t":"txt","x":600.0,"y":51.6,"s":"\u03c4 = 30 s","al":"left","bl":"middle","dx":8,"c":"c","b":true},{"t":"line","pts":[[60.0,41.1],[120.0,49.3],[300.0,62.2],[600.0,75.0]],"c":"b","mk":4,"w":1.6},{"t":"txt","x":600.0,"y":75.0,"s":"\u03c4 = 60 s","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"txt","x":60.0,"y":41.1,"s":"41.1","n":"","al":"center","bl":"top","dy":7,"c":"b"},{"t":"txt","x":120.0,"y":49.3,"s":"49.3","n":"","al":"center","bl":"top","dy":7,"c":"b"},{"t":"line","pts":[[60.0,47.0],[120.0,63.3],[300.0,85.5],[600.0,98.4]],"c":"e","mk":4,"w":2.4},{"t":"txt","x":600.0,"y":98.4,"s":"\u03c4 = 90 s","al":"left","bl":"middle","dx":8,"c":"e","b":true},{"t":"txt","x":60.0,"y":47.0,"s":"47.0","n":"47","al":"right","bl":"middle","dx":-8,"c":"e"},{"t":"txt","x":120.0,"y":63.3,"s":"63.3","n":"63","al":"center","bl":"bottom","dy":-7,"c":"e"},{"t":"txt","x":300.0,"y":85.5,"s":"85.5","n":"86","al":"center","bl":"bottom","dy":-7,"c":"e"},{"t":"txt","x":600.0,"y":98.4,"s":"98.4","n":"98","al":"center","bl":"bottom","dy":-7,"c":"e"},{"t":"line","pts":[[60.0,57.5],[120.0,87.8],[300.0,132.2],[600.0,166.1]],"c":"d","mk":4,"w":1.6},{"t":"txt","x":600.0,"y":166.1,"s":"\u03c4 = 180 s","al":"left","bl":"middle","dx":8,"c":"d","b":true}],"X":{"lo":50,"hi":720,"log":true,"ticks":[[60,"60 s"],[120,"120 s"],[300,"300 s"],[600,"600 s"]],"title":"downscale stabilization window, log scale","ntitle":"window (log)"},"Y":{"lo":0,"hi":180,"ticks":[[0,"0 s"],[40,"40 s"],[80,"80 s"],[120,"120 s"],[160,"160 s"]],"title":"standing delay the deployed loop needs","ntitle":"delay needed"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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
<canvas id="chart-agreement" role="img" aria-label="Observed hunting boundary of the deployed loop against the prediction with ten seconds of sampling delay, for sixteen pairs of dead time and window. Points lie along the diagonal. Four fall outside the ten percent band, all with the prediction above the observation: dead time 30 s with windows of 120 and 300 s, 60 s with 300 s, and 90 s with 600 s, the last by a hair; the largest miss is 30 s and 120 s, predicted 36.4 s, observed 31.8 s. At a 90 s dead time the default 300 s window is predicted at 89.6 s and observed at 85.5 s." style="width:100%;height:360px;display:block;"></canvas>
<figcaption>Each point is one pair of dead time and window; for each dead time, the windows of 60, 120, 300 and 600 seconds give the four points from left to right. Points on the dashed diagonal would be perfect predictions; the shaded band is ±10%. The prediction lands within 6% on average and 14% at worst. Every miss larger than 10% is an overestimate, three of the four at the two shortest dead times. Model: ported controller, 15-second sync, demand stepping from 50 to 200 pods needed, last hour of a 20-hour run.</figcaption>
<script>
(function(){var S={"id":"chart-agreement","h":360,"ml":[40,50],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"band","pts":[[15,13.636363636363635,16.666666666666668],[185,168.18181818181816,205.55555555555554]],"c":"g","al":0.12},{"t":"line","pts":[[15,15],[185,185]],"c":"g","w":1,"dash":true},{"t":"txt","x":160,"y":177.77777777777777,"s":"\u00b110%","al":"right","bl":"middle","dx":-6,"c":"g"},{"t":"pt","x":29.4,"y":27.1,"c":"c","r":4.5},{"t":"pt","x":36.4,"y":31.8,"c":"c","r":4.5},{"t":"pt","x":45.9,"y":41.1,"c":"c","r":4.5},{"t":"pt","x":52.7,"y":51.6,"c":"c","r":4.5},{"t":"txt","x":52.7,"y":51.6,"s":"\u03c4 = 30 s","al":"left","bl":"top","dx":6,"dy":6,"c":"c","b":true},{"t":"pt","x":40.1,"y":41.1,"c":"b","r":4.5},{"t":"pt","x":52.6,"y":49.3,"c":"b","r":4.5},{"t":"pt","x":69.7,"y":62.2,"c":"b","r":4.5},{"t":"pt","x":82.4,"y":75.0,"c":"b","r":4.5},{"t":"txt","x":82.4,"y":75.0,"s":"\u03c4 = 60 s","al":"left","bl":"top","dx":6,"dy":6,"c":"b","b":true},{"t":"pt","x":47.2,"y":47.0,"c":"e","r":4.5},{"t":"pt","x":64.9,"y":63.3,"c":"e","r":4.5},{"t":"pt","x":89.6,"y":85.5,"c":"e","r":4.5},{"t":"pt","x":108.3,"y":98.4,"c":"e","r":4.5},{"t":"txt","x":108.3,"y":98.4,"s":"\u03c4 = 90 s","al":"left","bl":"top","dx":6,"dy":6,"c":"e","b":true},{"t":"pt","x":59.4,"y":57.5,"c":"d","r":4.5},{"t":"pt","x":88.6,"y":87.8,"c":"d","r":4.5},{"t":"pt","x":135.8,"y":132.2,"c":"d","r":4.5},{"t":"pt","x":172.2,"y":166.1,"c":"d","r":4.5},{"t":"txt","x":172.2,"y":166.1,"s":"\u03c4 = 180 s","al":"right","bl":"top","dx":-6,"dy":6,"c":"d","b":true},{"t":"pt","x":89.6,"y":85.5,"c":"e","r":8,"open":true},{"t":"txt","x":89.6,"y":85.5,"s":"default window: 89.6 predicted, 85.5 observed","n":"default","al":"right","bl":"bottom","dx":-8,"dy":-6,"c":"e"},{"t":"pt","x":36.4,"y":31.8,"c":"c","r":8,"open":true},{"t":"txt","x":36.4,"y":31.8,"s":"largest miss, 14%","n":"","al":"left","bl":"top","dx":8,"dy":8,"c":"ink"}],"X":{"lo":15,"hi":185,"ticks":[[20,"20 s"],[60,"60 s"],[100,"100 s"],[140,"140 s"],[180,"180 s"]],"title":"predicted boundary, \u03c4_eff \u03a6(W_eff/\u03c4_eff)","ntitle":"predicted boundary"},"Y":{"lo":15,"hi":185,"ticks":[[20,"20 s"],[60,"60 s"],[100,"100 s"],[140,"140 s"],[180,"180 s"]],"title":"observed boundary in the deployed loop","ntitle":"observed boundary"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="sixteen-reading") }}The curve carries over. Across dead times from 30 seconds to three minutes and windows from one minute to ten, the idealized law with one fixed sampling correction lands within 6% of the deployed boundary on average. The largest miss, 14%, is at the shortest dead time, where the 10-second correction is a third of the dead time itself and the sync period matters most. The misses are not random: all four larger than 10% overestimate the boundary, three of them at the two shortest dead times, so the correction is too large there. In every line of the first figure the boundary rises with the window. At a 90-second dead time, going from a one-minute window to a ten-minute one more than doubles the standing delay the loop needs, from 47 seconds to 98.

{{ layer(n=3, type="Estimate", id="no-window-deployed") }}The opening's puzzle now has its answer. With no window, the idealized loop rested at the smallest standing delay tested, but the deployed loop is never quite without a window. Its sampling adds about 10 seconds to the down branch, a window of a tenth of the effective dead time. The curve says that window needs a standing delay of 0.119 effective dead times, about 11.9 seconds. The deployed loop without a window hunts at a standing delay of 10 seconds and rests at 40, which is consistent with that prediction. Its band at 40 seconds, 186 to 234 pods, is a swing of 24% of the need. That is under Definition 5's 30% threshold, though wider than the ripple of a loop well above its boundary. The default of one second sits far below either line, which is why removing the window did not save it.

{{ layer(n=3, type="Estimate", id="default-window-prediction") }}With the default window the prediction is 89.6 seconds and the observed boundary is 85.5. A queue consumer at a 90-second dead time with the default window needs each pod to carry about ninety seconds of work before it will rest. Forty seconds, the opening's second attempt, is less than half of that.

The boundary figures show where the hunt starts. The next figure shows its shape.

<div style="margin:1.5em 0;">
<canvas id="chart-hunt" role="img" aria-label="Pods over the last hour of a twenty-hour run with flat demand needing 200 pods, sampled every minute. Standing delay 60 seconds, in red: the count sits at 350 pods for six to seven minutes, drops within two minutes to between 56 and 124 pods, climbs back over the next two to three minutes, and repeats about every ten minutes. Standing delay 150 seconds, in green: the count stays at exactly 200 for the whole hour." style="width:100%;height:340px;display:block;"></canvas>
<figcaption>Pods each minute over the last hour of a twenty-hour run, with demand flat at two hundred pods' worth, a 90-second dead time and the default 300-second window. Red, a standing delay of 60 seconds: the loop hunts in a regular cycle. The window holds each peak for six to seven minutes, the count collapses when it lets go, and the rebuild waits on the dead time. Green, 150 seconds: the count sits at the need all hour.</figcaption>
<script>
(function(){var S={"id":"chart-hunt","h":340,"ml":[34,44],"mr":[12,12],"mt":24,"mb":42,"els":[{"t":"line","pts":[[0,350],[1,350],[1,350],[2,350],[2,350],[3,350],[3,350],[4,350],[4,350],[5,350],[5,350],[6,350],[6,350],[7,350],[7,206],[8,206],[8,56],[9,56],[9,196],[10,196],[10,304],[11,304],[11,350],[12,350],[12,350],[13,350],[13,350],[14,350],[14,350],[15,350],[15,350],[16,350],[16,350],[17,350],[17,243],[18,243],[18,93],[19,93],[19,160],[20,160],[20,304],[21,304],[21,350],[22,350],[22,350],[23,350],[23,350],[24,350],[24,350],[25,350],[25,350],[26,350],[26,350],[27,350],[27,281],[28,281],[28,131],[29,131],[29,124],[30,124],[30,268],[31,268],[31,350],[32,350],[32,350],[33,350],[33,350],[34,350],[34,350],[35,350],[35,350],[36,350],[36,350],[37,350],[37,307],[38,307],[38,168],[39,168],[39,88],[40,88],[40,232],[41,232],[41,350],[42,350],[42,350],[43,350],[43,350],[44,350],[44,350],[45,350],[45,350],[46,350],[46,350],[47,350],[47,350],[48,350],[48,206],[49,206],[49,56],[50,56],[50,196],[51,196],[51,304],[52,304],[52,350],[53,350],[53,350],[54,350],[54,350],[55,350],[55,350],[56,350],[56,350],[57,350],[57,350],[58,350],[58,243],[59,243],[59,93],[60,93]],"c":"a","w":2},{"t":"line","pts":[[0,200],[1,200],[1,200],[2,200],[2,200],[3,200],[3,200],[4,200],[4,200],[5,200],[5,200],[6,200],[6,200],[7,200],[7,200],[8,200],[8,200],[9,200],[9,200],[10,200],[10,200],[11,200],[11,200],[12,200],[12,200],[13,200],[13,200],[14,200],[14,200],[15,200],[15,200],[16,200],[16,200],[17,200],[17,200],[18,200],[18,200],[19,200],[19,200],[20,200],[20,200],[21,200],[21,200],[22,200],[22,200],[23,200],[23,200],[24,200],[24,200],[25,200],[25,200],[26,200],[26,200],[27,200],[27,200],[28,200],[28,200],[29,200],[29,200],[30,200],[30,200],[31,200],[31,200],[32,200],[32,200],[33,200],[33,200],[34,200],[34,200],[35,200],[35,200],[36,200],[36,200],[37,200],[37,200],[38,200],[38,200],[39,200],[39,200],[40,200],[40,200],[41,200],[41,200],[42,200],[42,200],[43,200],[43,200],[44,200],[44,200],[45,200],[45,200],[46,200],[46,200],[47,200],[47,200],[48,200],[48,200],[49,200],[49,200],[50,200],[50,200],[51,200],[51,200],[52,200],[52,200],[53,200],[53,200],[54,200],[54,200],[55,200],[55,200],[56,200],[56,200],[57,200],[57,200],[58,200],[58,200],[59,200],[59,200],[60,200]],"c":"c","w":2.4},{"t":"txt","x":60,"y":350,"s":"standing delay 60 s: the loop hunts","n":"60 s: hunts","al":"right","bl":"bottom","dy":-6,"c":"a","b":true},{"t":"txt","x":60,"y":26,"s":"green, standing delay 150 s: rests at the need all hour","n":"green, 150 s: rests","al":"right","bl":"middle","c":"c","b":true},{"t":"txt","x":11.2,"y":350,"s":"window holds the peak, 6 to 7 min","n":"window holds the peak","al":"left","bl":"bottom","dy":-6,"c":"ink"},{"t":"txt","x":8.6,"y":56,"s":"released: collapse","n":"release","al":"left","bl":"top","dy":3,"c":"ink"}],"X":{"lo":0,"hi":60,"ticks":[[0,"0 min"],[10,"10 min"],[20,"20 min"],[30,"30 min"],[40,"40 min"],[50,"50 min"],[60,"60 min"]],"nticks":[[0,"0 min"],[20,"20 min"],[40,"40 min"],[60,"60 min"]],"title":"minutes into the last hour","ntitle":"minutes into the last hour"},"Y":{"lo":0,"hi":420,"ticks":[[0,"0"],[100,"100"],[200,"200"],[300,"300"],[400,"400"]],"title":"pods","ntitle":"pods"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="figure-reading") }}The hunting run is a regular cycle rather than noise, and each phase belongs to one branch. The plateau at 350 pods is the window holding a peak that the backlog no longer supports. During it, 350 pods drain a backlog that 200 could have held, so when the window lets go, the backlog is far below rest and the recommendation collapses. The rebuild then waits on the dead time, so the backlog overshoots again and the next peak is set. The cycle repeats every ten to eleven minutes for the whole hour, with demand perfectly flat.

{{ layer(n=3, type="Estimate", id="figure-repeats") }}The figure repeats the range of the hunt that the cost figure below gives as percentiles. What only the figure shows is that the hunt is a limit cycle with a fixed shape. Its longest phase is the window doing exactly what the documentation says it does.

## The Window That Cannot Matter

The scaling law says the needed delay grows with the window. It does not say whether it grows without limit. A window of an hour, or a day, would by that reading demand an ever larger standing delay. A second result caps it.

<span id="prop-5"></span>
<details>
<summary>Proposition 5 -- Window-Proof Delay: with a standing delay of at least e dead times, the loop recovers from an upward step without overshoot, so the window never acts, whatever its length</summary>

**Proposition 5** (Window-Proof Delay). *In the idealized min-max loop, let demand step upward from rest. If {% katex() %}D \ge e\,\tau{% end %}, the backlog rises monotonically to its new rest level without overshoot, the window never holds a recommendation above the current one, and the loop behaves exactly as the pure-delay loop does, for every window length. Consequently {% katex() %}\Phi(w) \le e{% end %} for every w.*

*Proof sketch.* The step moves the rest level, not the backlog: L is continuous and equal to its old rest value for every time before the step, so in the coordinates of the new rest level the whole history, over the window and the dead time, is a constant {% katex() %}x_0 < 0{% end %}, and the operator returns {% katex() %}x_0{% end %} throughout the first dead time. While x is nondecreasing, the maximum over any window of x is its latest value, and the minimum over the dead time of a nondecreasing function is its value one dead time ago. So as long as x keeps rising, the min-max loop is the pure-delay loop {% katex() %}x' = -a\,x(t-\tau){% end %}. It remains to show that the pure-delay solution from a constant negative history keeps rising and never crosses zero when {% katex() %}a\tau \le 1/e{% end %}.

Write {% katex() %}y = x/x_0{% end %}, so y starts at 1 and obeys the same equation. While y stays positive, let {% katex() %}\omega = -y'/y{% end %}. Then {% katex() %}\omega(t) = a\, y(t-\tau)/y(t) = a \exp\!\int_{t-\tau}^{t} \omega{% end %}. On the first dead time {% katex() %}y = 1 - a t{% end %}, so {% katex() %}\omega \le a/(1 - a\tau) \le 1/((e-1)\tau) < 1/\tau{% end %}. If {% katex() %}\omega \le 1/\tau{% end %} over the past dead time, then {% katex() %}\omega(t) \le a\,e \le 1/\tau{% end %}, and continuation carries the bound forward. A bounded {% katex() %}\omega{% end %} keeps y positive, and {% katex() %}y' = -a\,y(t-\tau) < 0{% end %} makes it decrease to zero. So x rises monotonically to zero, the window never acts, and the loop rests. Since the loop rests at every {% katex() %}D \ge e\,\tau{% end %}, the boundary of Proposition 4 can be no higher, and {% katex() %}\Phi(w) \le e{% end %}. {% katex() %}\square{% end %}

</details>

{{ layer(n=3, type="Estimate", id="edge-check") }}The integration agrees at the edge. At a standing delay of exactly e dead times, the idealized loop after an upward step never rises above rest, at windows of 1, 10 and 100 dead times. At a standing delay of 2.5 dead times, slightly below e, the backlog overshoots rest by 0.07% at every window. At 2 dead times it overshoots by 4.1%. The overshoot itself does not depend on the window, because the window has not yet acted when it happens. What the window does is hold that overshoot.

{{ layer(n=2, type="Fit", id="why-the-window-amplifies") }}This explains the shape of the curve. Below e dead times the pure-delay response overshoots a little. The window then holds the pods of that overshoot for its whole length, and the backlog drains below rest in proportion to the overshoot times the window. A longer window turns a smaller overshoot into the same undershoot, so the delay needed creeps upward with the window, roughly logarithmically, toward a ceiling. That ceiling is the delay at which the overshoot vanishes, and Proposition 5 says no window can push the boundary past it.

{{ layer(n=3, type="Estimate", id="long-window-runs") }}The long-window runs agree with that picture as far as they go. At standing delays of 2.8 and 2.2 dead times, a disturbance decayed at every window tested, up to a thousand dead times. At 1.7 dead times it grew from a window of a hundred dead times onward. The integration covers three thousand dead times, so at the longest windows it sees only three window lengths. The runs are consistent with a boundary that approaches e from below as the window grows. They cannot prove that limit on their own, and Proposition 5b below does; the next section gives the order of growth.

{{ layer(n=1, type="Bound", id="what-prop-5-is-not") }}Proposition 5 has a precise scope. It covers the idealized loop after an upward step from rest, which is the disturbance the boundary was defined on. A downward step engages the window by construction, because the backlog falls and the window holds the old pods. A loop that is already hunting starts from a history that is not constant. Neither case is covered.

The two ends of the curve can be settled exactly. Without a window the loop has nothing to hold, and with a long enough window any overshoot at all is held long enough to grow.

<span id="prop-5b"></span>
<details>
<summary>Proposition 5b -- The Ceiling Is Exact: with no window the loop rests at every standing delay, and below e dead times some window always makes it hunt, so e is the least upper bound of Phi</summary>

**Proposition 5b** (The Ceiling Is Exact). *In the idealized min-max loop, let demand step upward from rest. With no window, {% katex() %}w = 0{% end %}, the backlog settles at its new rest level at every standing delay, so {% katex() %}\Phi(0) = 0{% end %}. For every standing delay {% katex() %}D < e\,\tau{% end %} there is a finite window that makes the loop hunt. Together with Proposition 5,*

{% katex(block=true) %}
\sup_{w \ge 0} \Phi(w) = e
{% end %}

*Proof sketch.* Write x for the backlog relative to its new rest level and {% katex() %}a = c/T{% end %}, so that {% katex() %}x' = -a\,F[x]{% end %} as in Proposition 4, with x equal to {% katex() %}x_0 < 0{% end %} over the whole history.

Without a window, F is the minimum of x over the last dead time. While x is below rest, that minimum is negative and x rises. If x never crosses rest, it increases to a limit, and the limit must be rest, since any negative limit would keep it rising at a fixed rate. If it crosses at {% katex() %}t_1{% end %}, it keeps rising until {% katex() %}t_1 + \tau{% end %}, after which the last dead time holds only values above rest. From then on F is positive and at most x, so {% katex() %}-a\,x \le x' < 0{% end %}: x falls, never below {% katex() %}x(s)\,e^{-a(t-s)} > 0{% end %}, and by the same limit argument settles at rest. In neither case does it swing back below rest, whatever a is.

With a window W and {% katex() %}a\tau > 1/e{% end %}, the loop is the pure-delay loop {% katex() %}x' = -a\,x(t-\tau){% end %} for as long as x rises, as in the proof of Proposition 5. Every solution of that equation oscillates exactly when {% katex() %}a\tau > 1/e{% end %}{{ cite(ref="6", title="Gyori, I. & Ladas, G. (1991) -- Oscillation Theory of Delay Differential Equations: With Applications, Oxford University Press") }}, so x crosses rest and reaches a first maximum {% katex() %}\delta > 0{% end %} at some {% katex() %}t_2{% end %}. Neither {% katex() %}\delta{% end %} nor {% katex() %}t_2{% end %} depends on W, because the window does not act while x rises. For the next W seconds the window holds a recommendation of at least {% katex() %}\delta{% end %}, so once a dead time has passed, {% katex() %}x' \le -a\,\delta{% end %}. By {% katex() %}t_2 + W{% end %}, x has fallen to at most {% katex() %}\delta - a\,\delta\,(W - \tau){% end %}, which lies further below rest than the step that started it as soon as {% katex() %}W > \tau + (1+\delta)/(a\,\delta){% end %}. A disturbance that comes back larger than it started is not settling, and by the positive homogeneity of Proposition 4 the same holds at every scale. So for every {% katex() %}D < e\,\tau{% end %} some window makes the loop hunt, and {% katex() %}\sup \Phi \ge e{% end %}. Proposition 5 gives the reverse inequality. {% katex() %}\square{% end %}

</details>

{{ layer(n=1, type="Bound", id="what-prop-5b-settles") }}The proposition settles both ends of the curve and leaves its middle open. Without a window there is no delay on the way down, and the loop cannot hunt at any threshold, however small. Below e dead times every overshoot is positive, and a window that holds it for long enough always wins. What remains unproven is that the curve rises steadily in between, and that the stable gains form one interval for each window. Both are observed for every window computed and neither is claimed.

{{ layer(n=3, type="Estimate", id="sup-check") }}The computed curve behaves as the proposition requires at both ends. It falls to 0.119 dead times at a window of a tenth of a dead time, and with no window the idealized loop rests at a standing delay of an eighth of a dead time, the smallest tested. At windows of 100 and 400 dead times it reaches 1.719 and 1.938, still below e and still rising. The window that the proof needs grows as the overshoot shrinks, and near e dead times the overshoot is exponentially small, which is why the approach is so slow.

## Deriving the Curve

The computed curve can be approached from both ends. For moderate windows the hunt looks like a sine, and a classical method of nonlinear control, the describing function, turns that into a closed form. For long windows the hunt becomes a plateau, and the structure of the delay equation near e dead times gives the shape of the approach.

<span id="prop-5a"></span>
<details>
<summary>Proposition 5a -- Harmonic-Balance Approximation: if the hunt is close to a sine, the phase condition holds when its half-period equals the dead time plus the window, and Phi has a closed form for windows of at least one dead time</summary>

**Proposition 5a** (Harmonic-Balance Approximation). *Approximate the hunt of the idealized min-max loop by a single sinusoid, as the describing-function method does. Measure time in dead times. For {% katex() %}w \ge 1{% end %}, the phase condition for a self-sustained oscillation is met at angular frequency {% katex() %}\omega^\ast = \pi/(1+w){% end %}, a half-period of one dead time plus one window, and the approximation to the curve is*

{% katex(block=true) %}
\Phi_{\text{hb}}(w) = \frac{(1+\cos\alpha) + (\pi+\alpha)\sin\alpha}{2\pi\,\alpha}, \qquad \alpha = \frac{\pi}{1+w}
{% end %}

*Proof sketch.* Feed {% katex() %}x = \sin\theta{% end %}, {% katex() %}\theta = \omega t{% end %}, through {% katex() %}F = \min_\tau \max_W{% end %}. At {% katex() %}\omega = \pi/(1+w){% end %} the dead time spans an angle {% katex() %}\alpha{% end %} and the window an angle {% katex() %}\pi - \alpha{% end %}. The output is then flat at {% katex() %}-\sin(\alpha/2){% end %} for {% katex() %}|\theta| \le \alpha/2{% end %}, follows {% katex() %}\sin(\theta - \alpha){% end %} up to {% katex() %}\pi/2 + \alpha{% end %}, stays at 1 up to {% katex() %}3\pi/2 - \alpha{% end %}, and follows {% katex() %}-\sin(\theta+\alpha){% end %} back down. That function is even in {% katex() %}\theta{% end %}, so its fundamental is a pure {% katex() %}-|N|\cos\theta{% end %}: the operator lags the sine by exactly a quarter period, which the loop's integrator needs for a self-sustained oscillation. Integrating the four pieces against {% katex() %}\cos\theta{% end %} gives {% katex() %}|N| = [(1+\cos\alpha) + (\pi+\alpha)\sin\alpha]/(2\pi){% end %}. Keeping only the fundamental is fair because the loop's integrator divides the k-th harmonic of the operator's output by k relative to the fundamental, so the harmonics the balance ignores reach the backlog attenuated. Balancing {% katex() %}x' = \omega\cos\theta{% end %} against {% katex() %}-aF{% end %} requires {% katex() %}a = \omega/|N|{% end %}, and {% katex() %}\Phi = 1/a = |N|/\alpha{% end %}. {% katex() %}\square{% end %}

</details>

{{ layer(n=3, type="Estimate", id="hb-accuracy") }}The closed form is accurate where its assumption holds. It gives 0.579 at one dead time against a computed 0.573, 0.779 at two against 0.773, and 0.946 at the default window of 3.33 against 0.916. The errors are 1.0%, 0.8% and 3.3%, always on the high side. It then degrades quickly: 9.3% high at five dead times and 34% at ten. The reason is visible in the figure of the hunt above. A long window turns the cycle into a plateau with short transitions, which is nothing like a sine. The closed form then grows without bound, while Proposition 5 caps the true curve at e.

{{ layer(n=1, type="Bound", id="near-e-roots") }}Long windows are governed by what happens just above a standing delay of e dead times. Write the gain as {% katex() %}a = (1+\delta)/(e\tau){% end %}. At {% katex() %}\delta = 0{% end %} the characteristic equation of Proposition 3 has a double real root at {% katex() %}s = -1/\tau{% end %}. For small {% katex() %}\delta{% end %}, expanding {% katex() %}e^{-s\tau}{% end %} to second order around it splits the double root into {% katex() %}s \approx (-1 \pm i\sqrt{2\delta})/\tau{% end %}. At {% katex() %}\delta = 0.02{% end %} the exact root is {% katex() %}-0.987 \pm 0.199i{% end %} against the approximation {% katex() %}-1 \pm 0.200i{% end %}.

{{ layer(n=2, type="Fit", id="near-e-reading") }}That root explains the shape of the curve at long windows. A response with decay rate one and frequency {% katex() %}\sqrt{2\delta}{% end %} first overshoots after about half a period, so its overshoot is of order {% katex() %}e^{-\pi/\sqrt{2\delta}}{% end %}: exponentially small near e dead times. The window holds that overshoot and multiplies it into an undershoot by a factor that grows only polynomially with the window. Instability therefore needs {% katex() %}\delta{% end %} to shrink only like {% katex() %}1/\ln^2 w{% end %}, which gives {% katex() %}\Phi(w) = e\,(1 - O(1/\ln^2 w)){% end %}. That is a creep toward e so slow that it looks logarithmic over any range anyone will configure. This step is an argument about orders of growth, not a proof.

{{ layer(n=3, type="Estimate", id="asymptotic-fit") }}The argument fixes the form, and two constants fitted to the computed curve fix the rest. The expression {% katex() %}e/(1 + c/\ln^2(w/w_0)){% end %}, with {% katex() %}c = 30.6{% end %} and {% katex() %}w_0 = 0.07{% end %}, matches the computed curve within 0.46% for every window from 10 to 400 dead times. The computed values there include 1.719 at 100 and 1.938 at 400. Toward shorter windows it errs low, by 1.4% at five dead times and 2.7% at the default 3.33. At the default the two approximations bracket the truth from opposite sides: 0.891 from the asymptotic form and 0.946 from the closed form, against a computed 0.916.

## The Price of Stability

The law turns the window into a cost. A loop that must rest has to carry a standing delay of {% katex() %}\tau\,\Phi(W/\tau){% end %}, paid by every message as waiting time. A loop that carries less hunts, and hunting has a price of its own.

At a 90-second dead time and the default window, with two hundred pods needed, three quantities change together as the standing delay crosses the boundary:

<div style="margin:1.5em 0;">
<canvas id="chart-cost" role="img" aria-label="Pods against standing delay at a 90 s dead time and the default window, 200 pods needed. Noise-free, the 5th to 95th percentile band is 80 to 503 pods at 40 s, 93 to 350 at 60 s, 104 to 283 at 80 s, and from 100 s on between 184 and 206, exactly 200 at 100, 150 and 200 s. With 30% demand noise the band is wider at every delay but narrows sharply across the same boundary, observed at 85.5 s. Mean pods, red line: 397 at 40 s, 290 at 60 s, 234 at 80 s and 199 to 201 from 100 s on, that is 99%, 45% and 17% above the need, and then within 1% of it." style="width:100%;height:350px;display:block;"></canvas>
<figcaption>The price of stability at a 90-second dead time and the default window. Blue band: pods from the 5th to the 95th percentile over the last hour, noise-free. Orange outline: the same band with 30% demand noise. Red: mean pods, noise-free, labelled with its excess over the need. Every quantity changes regime at the same standing delay, and noise widens the band without moving the boundary.</figcaption>
<script>
(function(){var S={"id":"chart-cost","h":350,"ml":[40,50],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"band","pts":[[40,110,666],[60,114,450],[80,120,412],[100,158,284],[120,148,275],[150,165,270],[200,172,283],[300,175,262]],"c":"d","al":0.0,"edge":true},{"t":"band","pts":[[40,80,503],[60,93,350],[80,104,283],[100,200,200],[120,184,204],[150,200,200],[200,200,200],[300,186,206]],"c":"b","al":0.25},{"t":"hline","y":200,"c":"g","w":1,"dash":true},{"t":"vline","x":85.5,"c":"ink","dash":true},{"t":"txt","x":85.5,"y":650,"s":"observed boundary 85.5 s","n":"boundary","al":"left","dx":5,"c":"ink"},{"t":"line","pts":[[40,397],[60,290],[80,234],[100,200],[120,201],[150,200],[200,200],[300,199]],"c":"a","w":2,"mk":3.5},{"t":"txt","x":40,"y":397,"s":"+99%","n":"+99%","al":"left","bl":"bottom","dx":8,"dy":-4,"c":"a"},{"t":"txt","x":60,"y":290,"s":"+45%","n":"+45%","al":"left","bl":"bottom","dx":8,"dy":-4,"c":"a"},{"t":"txt","x":80,"y":234,"s":"+17%","n":"+17%","al":"right","bl":"top","dx":-8,"dy":4,"c":"a"},{"t":"txt","x":150,"y":200,"s":"flat at 200","n":"200","al":"center","bl":"bottom","dy":-5,"c":"b"},{"t":"txt","x":300,"y":262,"s":"30% noise","n":"30% noise","al":"right","bl":"bottom","dy":-4,"c":"d"},{"t":"txt","x":150,"y":270,"s":"165 to 270","n":"","al":"center","bl":"bottom","dy":-4,"c":"d"}],"X":{"lo":30,"hi":310,"ticks":[[40,"40 s"],[80,"80 s"],[120,"120 s"],[160,"160 s"],[200,"200 s"],[240,"240 s"],[280,"280 s"]],"nticks":[[40,"40"],[120,"120"],[200,"200"],[280,"280"]],"title":"standing delay D = T/c","ntitle":"standing delay (s)"},"Y":{"lo":0,"hi":700,"ticks":[[0,"0"],[100,"100"],[200,"200"],[300,"300"],[400,"400"],[500,"500"],[600,"600"],[700,"700"]],"title":"pods, 5th to 95th percentile","ntitle":"pods"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="hunting-is-expensive") }}Hunting is expensive as well as noisy. The window holds every peak, so the hunting loop pays for its highest pod count for minutes at a time and its lowest only briefly. Its mean pod count runs 17% to 99% above the need. A team that cut the threshold to lower latency, and watched the loop hunt, pays for the hunt in pods. It does not get the latency either, because a hunting loop's backlog swings with its pods.

<span id="def-6"></span>
<details>
<summary>Definition 6 -- Stability Achievable Region: each choice of threshold and window maps to a standing delay and a mean pod count; the frontier is the set no other choice beats on both</summary>

**Definition 6** (Stability Achievable Region). *For a queue consumer with dead time {% katex() %}\tau{% end %}, each choice of threshold T and window W maps to the point*

{% katex(block=true) %}
\Big( D,\; \bar{N}/N^\ast \Big)
{% end %}

*whose first coordinate is the standing delay and whose second is the mean pod count over the pods needed. A point is on the frontier if no other choice has both a smaller standing delay and fewer mean pods.*

</details>

{{ layer(n=2, type="Fit", id="frontier-reading") }}The frontier is short and sharp. Below the boundary every point is dominated: it has a smaller nominal delay, but its pods cost more and its waiting time swings. At the boundary the mean pod count falls to the need and stays there. Above it, more standing delay buys nothing. For a fixed window, the boundary is the one point a design should aim at, plus a margin for the error of the law.

{{ layer(n=3, type="Estimate", id="window-moves-frontier") }}The window moves that point. At a 90-second dead time the deployed boundary is 47 seconds with a one-minute window, 63 seconds with two minutes, 86 seconds with five and 98 seconds with ten. The window chosen to suppress flapping sets the latency floor of the loop. A one-minute window roughly halves the waiting time the default demands.

<span id="cor-3"></span>
<details>
<summary>Corollary 3 -- Latency Floor: a backlog-scaled consumer sized by acceptable latency rests only if that latency is at least tau times Phi(W/tau); any latency of e dead times or more is safe against upward steps whatever the window</summary>

**Corollary 3** (Latency Floor). *Size the threshold by the rule of acceptable latency over time per message. Then the standing delay equals the acceptable latency {% katex() %}\ell_{\text{acc}}{% end %}, and by Proposition 4 the idealized loop rests after an upward step only if*

{% katex(block=true) %}
\ell_{\text{acc}} \ge \tau\, \Phi\!\left(\frac{W}{\tau}\right)
{% end %}

*By Proposition 5, every {% katex() %}\ell_{\text{acc}} \ge e\,\tau{% end %} satisfies it for every window. In the deployed loop the dead time and window are replaced by their effective values with the sampling delay added.*

*Proof.* Definition 4 and the sizing rule give {% katex() %}D = \ell_{\text{acc}}{% end %}. Substitute into Proposition 4 and Proposition 5. {% katex() %}\square{% end %}

</details>

{{ layer(n=2, type="Fit", id="latency-floor-reading") }}The corollary turns a stability question into a promise a team can check. Take a service level that promises messages processed within ten seconds, on a consumer whose pods take ninety seconds to start, under the default window. The autoscaler cannot keep that promise at rest. The hunt has one cause: ten seconds is less than the dead time times the curve. Either the latency target grows, the window shrinks, or the dead time falls. The threshold is just where the choice shows up.

{{ layer(n=3, type="Estimate", id="worked-sizing") }}Take one point of the boundary figure as a worked design. A consumer whose pods take a minute to start, under a two-minute window, needs a standing delay of about fifty seconds. The deployed boundary is 49.3 seconds and the corrected curve predicts 52.6. A team that promises messages within a minute can meet that, with a margin of 14% over the corrected prediction. A team that promises thirty seconds cannot, at that window. Shortening the window to one minute brings the deployed boundary down to 41.1 seconds, still above thirty. To promise thirty seconds, this consumer needs a shorter dead time, and no setting of the autoscaler can supply one.

{{ layer(n=2, type="Fit", id="standing-delay-buffer") }}The standing delay is not only a cost. A backlog of two and a half minutes of work per pod is also a buffer, and the noise runs below show it doing that job. At a standing delay of 150 seconds and demand noise of 30%, the pods of the loop above its boundary ranged from 165 to 270. Below the boundary, the same noise produced swings roughly three to five times as wide. The delay a window demands buys calm twice over, once by removing the hunt and once by absorbing the noise. It is still paid in waiting time on every message, and whether that price is acceptable is a question about the service, not about the controller.

{{ layer(n=2, type="Fit", id="the-belief-priced") }}This prices the belief. The window was added to make the loop stable. In a loop driven by a backlog, it is the reason the loop needs a standing delay to be stable at all. Without it, the idealized loop rested at the smallest standing delay tested, an eighth of a dead time. With the default five minutes, it needs nearly a dead time of waiting on every message. The window does suppress flapping. It does so by moving the instability somewhere the documentation does not look: into the threshold.

## What Is Already Known

{{ layer(n=1, type="Bound", id="aws-known") }}Backlog per instance is documented practice, and so is the latency rule for choosing its target{{ cite(ref="4", title="Amazon Web Services (2026) -- Scaling policy based on Amazon SQS, Amazon EC2 Auto Scaling User Guide") }}. The guide also notes why a raw queue length is the wrong metric: "A policy that targets only the number of messages in the queue does not account for the number of instances available. As a result, it can add more instances than needed while the queue drains."

{{ layer(n=1, type="Bound", id="rabbit-modes") }}The distinction between a backlog signal and a rate signal is also known. KEDA's RabbitMQ scaler offers both, a queue-length mode "to keep number of messages in the queue at selected, nominal level" and a message-rate mode "to keep the consumption rate up to messages publication rate"{{ cite(ref="2", title="KEDA Authors (2026) -- KEDA documentation v2.19: ScaledObject specification, Apache Kafka scaler, AWS SQS Queue scaler") }}.

{{ layer(n=1, type="Bound", id="queue-feedback-known") }}Instability from delayed queue feedback is long established in networking. Hollot and three coauthors analysed active queue management for TCP flows as a feedback loop with delay and designed controllers for its stability{{ cite(ref="7", title="Hollot, C.V., Misra, V., Towsley, D. & Gong, W.-B. (2002) -- Analysis and Design of Controllers for AQM Routers Supporting TCP Flows, IEEE Transactions on Automatic Control, 47(6), 945-959") }}. Johari and Tan studied end-to-end congestion control{{ cite(ref="8", title="Johari, R. & Tan, D.K.H. (2001) -- End-to-end congestion control for the internet: delays and stability, IEEE/ACM Transactions on Networking, 9(6), 818-832") }}. Delay limits its stability there too. Stabilization windows against flapping are documented by the controller's own maintainers.

{{ layer(n=1, type="Bound", id="autoscale-known") }}Both effects of this post were met before, with physical servers and a 260-second setup time. Gandhi and three coauthors scaled up on the number of requests in the system, a backlog-type signal. They report that their policy "overshoots while scaling up capacity", and that "a doubling of request rate can lead to a tripling of number of requests at a single server"{{ cite(ref="9", title="Gandhi, A., Harchol-Balter, M., Raghunathan, R. & Kozuch, M.A. (2012) -- AutoScale: Dynamic, Robust Capacity Management for Multi-Tier Data Centers, ACM Transactions on Computer Systems 30(4)") }}. That is the ordering past pods already on their way that the walked-through sync shows. For scaling down they made the servers "very conservative in turning servers off", a delayed turn-off that is the stabilization window's ancestor, and it helped a controller driven by request rate. The law of this post concerns the combination they did not study: the window in front of a loop driven by the backlog itself.

### Exact Results for Setup Times

{{ layer(n=1, type="Bound", id="setup-exact") }}Queueing theory has exact results for a close relative of this loop. Gandhi, Harchol-Balter and Adan derived them for server farms{{ cite(ref="10", title="Gandhi, A., Harchol-Balter, M. & Adan, I. (2010) -- Server farms with setup costs, Performance Evaluation 67(11), 1123-1138") }}. Their model is a farm of k servers with Poisson arrivals, exponential job sizes and an exponential setup time. Idle servers turn off at once, and every job not being served puts one server into setup. Their on-demand policy is therefore a backlog-scaled loop with a threshold of one job per server and no window. Their first theorem covers staggered boot, with at most one server in setup at a time. Response time is then exactly the response time of the same farm without setup plus one setup time, a decomposition they call "counter-intuitive since not all jobs will experience the setup time". Their second gives the exact state distribution when the number of servers is unlimited.

{{ layer(n=3, type="Estimate", id="setup-check") }}Those results give the simulation machinery of this series an exact test. The check is a request-level simulation, with three seeds of 300,000 jobs each and time measured in mean job sizes. Across six configurations, three of each model, five of the six exact values lie inside the range of the seeds: at a mean setup of 1 in the staggered model, for example, the exact 2.205 sits between 2.195 and 2.221. The sixth, at a mean setup of 5, lies 1.7% above the seeds' mean. Long setups make each busy period long, so a run of fixed length holds fewer of them. The seeds spread by 3% and 5% at setups of 5 and 10, against about 1% at a setup of 1. Where exact theory exists, the simulator agrees with it to within that noise.

{{ layer(n=2, type="Fit", id="setup-meaning") }}The exact theory and this post agree where they overlap, and they measure different things. Their models are stationary Markov chains. With no window, the on-demand policy settles at every load below capacity, as the idealized loop of this post rests without a window. In the staggered model the setup time costs every job one mean setup on average, an exact and modest price, and it never makes the system hunt. Hunting needs what those models leave out: a window that holds capacity after the need has passed, in front of a threshold that reacts through a fixed dead time. Their conclusion for the expensive corner is one this series shares: when both the load and the setup time are high, "it pays to leave servers on".

{{ layer(n=1, type="Bound", id="maxima-known") }}The idealized loop also belongs to a known class of equations. A differential equation whose right-hand side depends on the maximum of the unknown function over a past interval is called a differential equation with maxima. Bainov and Hristova collect the theory of that class{{ cite(ref="11", title="Bainov, D.D. & Hristova, S.G. (2011) -- Differential Equations with Maxima, Chapman and Hall/CRC Pure and Applied Mathematics") }}. The book gives existence results, integral inequalities and stability conditions of the Lyapunov and Razumikhin kind. The loop of this post nests a minimum over the dead time around a maximum over the window, and the scaling law, the ceiling of e and its exactness were derived here for that nested form directly. Whether the general theory already contains them, or yields a proof of the parts left open, was not settled for this post.

{{ layer(n=2, type="Fit", id="not-found-part-2") }}Four results were not found in the sources read for this post. The first is the min-max form of the deployed loop, with its different delays on the two branches. The second is the scaling law that reduces its stability to one curve in the window over the dead time, checked against the deployed controller. The third is the window-proof delay of e dead times, its exactness as the least upper bound of the curve, and the latency floor that follows. The fourth is the closed-form harmonic-balance approximation to the curve and the logarithmic approach to e. They are offered as this post's contribution, with the same caution as before: absence from the sources read does not prove nobody has written them down.

## What the Model Leaves Out

{{ layer(n=3, type="Estimate", id="noise") }}Noise widens the band without moving the boundary. Demand in the boundary runs is flat, so they were repeated with 10% demand noise, a multiplier redrawn every minute. At a standing delay of 40 seconds the band widens to 92 to 581 pods, and at 100 seconds it stays narrow, 183 to 229, so Definition 5 still separates the two sides. Polling the queue every 30 seconds instead of 15 changes little: 60 to 479 pods at 40 seconds and 184 to 207 at 100. At 30% noise, the band the cost figure draws, the noise alone swings a loop above its boundary by more than Definition 5's threshold: 158 to 284 pods at 100 seconds. The definition cannot place a boundary there. The band still narrows sharply between 80 and 100 seconds, where the noise-free boundary lies.

{{ layer(n=3, type="Estimate", id="noise-reading") }}Above the boundary the pods follow the noise, and the band widens with it. Below the boundary the swing is several times larger than the noise alone would cause. Polling the queue every 30 seconds instead of every 15 leaves the boundary in place. Noise neither creates the hunt nor removes it, and only decorates whichever regime the standing delay has chosen.

{{ layer(n=3, type="Estimate", id="rebalance") }}A consumer-group rebalance is different. When the number of consumers changes, a Kafka group pauses consumption while partitions are reassigned. With a 10-second pause after every change, the loop still swung between 158 and 299 pods at a standing delay of 100 seconds, and rested between 186 and 206 at 150. With a 30-second pause it was irregular at 120 and 150 seconds, and rested at 200. A plausible reading is that the pause must fit inside what the tolerance band can absorb, roughly a standing delay above the pause divided by the tolerance. That reading is untested beyond these runs and is not part of the law.

{{ layer(n=2, type="Fit", id="not-modelled") }}Several things are not in the model at all. The partition cap clips a Kafka hunt at the partition count. Activation from zero, which KEDA handles with its own cooldown, is not modelled. Neither are metric caching between the broker and the controller, visibility timeouts on SQS, or messages that fail and return to the queue. Each could shift the boundary. None is likely to remove it, because the integrator and the two delays are still there.

## The Binding Constraint, in Sequence

{{ layer(n=2, type="Fit", id="csf-part-2") }}[The Constraint Sequence Framework](@/blog/2025-12-27/index.md) orders the constraints by which binds first. For a backlog-scaled consumer the dead time binds first, because it sets the unit in which every other delay is measured. The window binds second, because it sets how many dead times of standing delay the loop needs. The threshold binds third: it is where the needed delay is paid, and its value follows from the first two. The latency a team promises is the outside constraint the other three must fit under.

{{ layer(n=2, type="Fit", id="csf-part-2-consequence") }}The common response to a hunting consumer runs the sequence backwards. It lengthens the window to stop the flapping, which raises the delay needed, which makes the hunt worse at the same threshold. The sequence says to start from the dead time and then shorten the window to the shortest one that still serves its purpose. Only then does the threshold get set, from the curve, with a margin.

## Falsification Criteria

Each criterion names an observation on a real cluster that would refute this post. All need a queue consumer scaled through KEDA on its backlog, with a measured dead time {% katex() %}\tau{% end %} and a known per-pod rate c, so that the standing delay T/c can be set directly. The cluster kit for this series provides one. Its broker generates demand that steps from 50 to 200 messages a second, and each consumer takes ten messages a second after a 90-second start delay, so 20 pods are needed under a ceiling of 100. The predictions are the deployed model's at that size, over the last hour of a twenty-hour run.

**F1 (the boundary exists).**
- *Condition:* the default 300-second window, demand stepped up and then held flat, standing delays of 60 and 150 seconds, below and above the predicted boundary {% katex() %}\tau_{\text{eff}}\,\Phi(W_{\text{eff}}/\tau_{\text{eff}}){% end %} of about 90 seconds for a 90-second dead time.
- *Prediction:* the first run hunts in a regular cycle; the second settles within the tolerance band. At the kit's size the model gives 6 to 35 pods at 60 seconds and 19 to 21 at 150 seconds.
- *Refuted if:* the loop settles well below the predicted boundary, or hunts well above it.

**F2 (the window raises the boundary).**
- *Condition:* the same consumer at a fixed standing delay between the one-minute and five-minute boundaries, for example 60 seconds at a 90-second dead time.
- *Prediction:* it rests with a 60-second window, between 19 and 22 pods, and hunts with a 300-second window, between 6 and 35.
- *Refuted if:* the longer window settles the loop that the shorter one could not.

**F3 (removing the window does not rescue the default).**
- *Condition:* the Kafka default threshold of ten messages per pod, one second of standing delay for these consumers, with and without the window.
- *Prediction:* both runs hunt across the full range, from one pod to the ceiling of 100.
- *Refuted if:* removing the window alone brings the loop to rest.

## The Ledger of What the Loop Cannot Know, Continued

**Size**

*Belief:* the metric measures load. *Law:* at most one factor of g per round, from [One Bit per Dead Time](@/blog/2026-10-04/index.md). *Bill:* fifteen rounds for a thirtyfold overload at the default target.

**Time**

*Belief:* a stabilization window makes the loop stable.

*Mechanism:* a backlog integrates every shortfall; the controller reads it through the dead time on the way up and through the window on the way down, and orders for work that pods already on their way will take.

*Law:* Proposition 4, rest if and only if {% katex() %}D \ge \tau\,\Phi(W/\tau){% end %}, with {% katex() %}\Phi(3.33) = 0.92{% end %} for the default window over a 90-second dead time. Proposition 5, {% katex() %}\Phi \le e{% end %} for every window, and Proposition 5b, e is the least upper bound and no window means no hunt. Corollary 3, the same bound on any acceptable latency the threshold is sized from. Layer 1 for the scaling and the bounds; Layer 3 for the curve and the deployed boundaries.

*Bill:* about ninety seconds of waiting on every message at a 90-second dead time with the default window, or a hunt that costs 17% to 99% more pods. The default threshold of ten messages per pod carries about one second.

## What This Post Did Not Claim

### Where Each Claim Holds

**Claim.** The deployed backlog loop rests if and only if its standing delay is at least about {% katex() %}\tau_{\text{eff}}\,\Phi(W_{\text{eff}}/\tau_{\text{eff}}){% end %}.
- *Assumption:* KEDA's default `AverageValue` metric through the v1.34.0 controller on the default path, a fluid backlog, constant per-pod rate, and an upward step in demand.
- *Failure mode:* a per-pod rate that falls with load, retries that return to the queue, or a partition cap below the need. Each changes the integrator or clips the swing.

**Claim.** The scaling law and the window-proof delay of e dead times are exact for the idealized loop.
- *Assumption:* no sampling, rounding, tolerance, floor or ceiling, and an upward step from rest.
- *Failure mode:* the deployed loop adds a sampling delay of about 10 seconds to each branch; the agreement in the boundary figures is evidence for the correction, not a proof of it.

**Claim.** Removing the window does not rescue a threshold far below the dead time.
- *Assumption:* the controller's sync and the metric refresh add a delay to the down branch.
- *Failure mode:* none found in the runs; with no window the deployed boundary sat between 10 and 40 seconds of standing delay.

**Reversal condition.** The advice of this post is to treat the window as a cost and to size the threshold from the curve. It reverses when the backlog is not what the controller reads. A rate signal has no integrator in it, and a loop scaled on rate does not need a standing delay. That loop has a blindness of its own, which this post does not examine.

### What Is Not Claimed

The laws in this post are exact for the idealized loop and checked, not proven, for the deployed one. The scaling of Proposition 4, the ceiling of Proposition 5 and its exactness in Proposition 5b are proofs. That the curve rises steadily between its two ends is observed, not proven. The curve itself is computed, its closed form is an approximation by harmonic balance, and its long-window form is fitted to a shape the argument only motivates. The sixteen deployed boundaries agree with the curve to 6% on average, and the four that miss by more than 10% all miss in the same direction.

It has not been claimed that stabilization windows are harmful. In front of a controller driven by a noisy rate, a window does what the documentation says, and Gandhi and coauthors found a delayed turn-off helpful for exactly that kind of controller. The claim is narrower: in front of a loop driven by a backlog, the window sets a price in waiting time that the documentation does not mention. Nor has it been claimed that KEDA's defaults are wrong. Ten messages per pod is one second of waiting only for a consumer that handles ten messages a second. A consumer that spends ten seconds on each message carries a hundred seconds at the same threshold, and at a 90-second dead time it rests.

Three open questions are named on purpose. The limit of the curve at very long windows is argued, not proven. The second condition that consumer-group rebalances add is preliminary. And partition caps, metric caching and visibility timeouts are outside the model entirely.

Two credits belong here as well. The symmetric bound that [Anti-Fragile Decision-Making at the Edge](@/blog/2026-02-12/index.md) applied as a sufficient filter is also necessary for the pure-delay equation, which this post uses as its baseline. And the overshoot of a backlog-type signal during setup was observed with physical servers more than a decade before this series; this post adds its boundary, not its discovery.

### What Is Left Open

A backlog sees the size of an overload, which the saturated metric of the first part could not. The price is that it remembers. Every second of shortfall stays in it until capacity removes it. A controller that reads it through two different delays needs a standing quantity of that memory just to rest.

Sizing the threshold correctly leaves one assumption standing. Every message in the backlog was waiting for a client who still wanted it. In the model, messages wait patiently for as long as it takes. Real requests time out, and real clients retry. A signal that counts only fresh demand avoids the backlog's memory entirely. Whether it also avoids what the backlog was remembering is a question this post does not answer.

{% cognitive_map(root="The Delay a Window Demands") %}
{
  "intro": "A queue consumer scaled on its backlog, with the default five-minute stabilization window, can swing between a handful of pods and its ceiling under flat demand. This post follows the queue through KEDA into the Kubernetes autoscaler, reduces the loop to a min-max form with different delays on its two branches, and finds the standing delay it needs to rest.",
  "groups": [
  {"theme": "The Loop as It Runs", "c": "mint", "points": [
    [1, "The Window Is the Documented Remedy", "The Kubernetes documentation presents the 300-second downscale window as the fix for flapping, and KEDA passes it straight through to the autoscaler."],
    [2, "A Backlog Recommendation Ignores Ordered Pods", "KEDA's AverageValue metric makes the controller compute ceil(backlog / threshold) whatever the current count. Pods on their way do not shrink the backlog, so the controller keeps ordering through the dead time."],
    [3, "The Threshold Is a Latency", "At rest every pod carries T messages, so every message waits D = T/c seconds by Little's law. The Kafka default of 10 messages per pod at 10 messages a second is one second. The AWS rule of acceptable latency over time per message sets D equal to the acceptable latency."]
  ]},
  {"theme": "The Law", "c": "sky", "points": [
    [4, "Two Branches, Two Delays", "Rising, the loop acts on the backlog one dead time ago; falling, the window makes it act on the backlog one window ago. The loop is N = min over tau of max over W of L/T."],
    [5, "One Curve Decides", "Both filters commute with shifts and positive scaling, so stability depends only on D and W in dead times: the loop rests iff D >= tau x Phi(W/tau). Phi(3.33) = 0.92; a closed form derived by harmonic balance is within 3.3% from one dead time up to the default window, and the deployed controller matches within 6% on average across sixteen dead time and window pairs."],
    [6, "No Window Can Demand More Than e Dead Times", "With D >= e tau the loop recovers from an upward step without overshoot, the window never acts, and so Phi(w) <= e for every window. The ceiling is exact: below e some long enough window always makes the loop hunt, and with no window it rests at any delay."]
  ]},
  {"theme": "The Bill", "c": "peach", "points": [
    [7, "Hunting Costs Pods", "Below the boundary the window holds every peak: at a 90-second dead time and the default window, mean pods run 17% to 99% above need, in a limit cycle about ten minutes long."],
    [8, "The Window Sets the Latency Floor", "At a 90-second dead time the boundary is 47 seconds with a one-minute window and 86 seconds with the default five. A latency target sized below tau x Phi cannot be held at rest."],
    [9, "Removing the Window Is Not Enough", "Sampling still delays the down branch by about 10 seconds, which needs about 11.9 seconds of standing delay; the one-second default hunts with or without the window."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**The Loop as It Runs**

1. The Kubernetes documentation presents the 300-second downscale window as the fix for flapping, and KEDA passes it straight through to the autoscaler.
2. KEDA's AverageValue metric makes the controller compute {% katex() %}\lceil L / T \rceil{% end %} whatever the current count. Pods on their way do not shrink the backlog, so the controller keeps ordering through the dead time.
3. At rest every pod carries T messages, so every message waits {% katex() %}D = T/c{% end %} seconds by Little's law. The Kafka default of 10 messages per pod at 10 messages a second is one second. The AWS rule of acceptable latency over time per message sets D equal to the acceptable latency.

**The Law**

4. Rising, the loop acts on the backlog one dead time ago; falling, the window makes it act on the backlog one window ago. The loop is {% katex() %}N = \min_\tau \max_W L/T{% end %}.
5. Both filters commute with shifts and positive scaling, so stability depends only on D and W in dead times: the loop rests iff {% katex() %}D \ge \tau\,\Phi(W/\tau){% end %}. {% katex() %}\Phi(3.33) = 0.92{% end %}; a closed form derived by harmonic balance is within 3.3% from one dead time up to the default window, and the deployed controller matches within 6% on average across sixteen dead time and window pairs.
6. With {% katex() %}D \ge e\,\tau{% end %} the loop recovers from an upward step without overshoot, the window never acts, and so {% katex() %}\Phi(w) \le e{% end %} for every window. The ceiling is exact: below e some long enough window always makes the loop hunt, and with no window it rests at any delay.

**The Bill**

7. Below the boundary the window holds every peak: at a 90-second dead time and the default window, mean pods run 17% to 99% above need, in a limit cycle about ten minutes long.
8. At a 90-second dead time the boundary is 47 seconds with a one-minute window and 86 seconds with the default five. A latency target sized below {% katex() %}\tau\,\Phi{% end %} cannot be held at rest.
9. Sampling still delays the down branch by about 10 seconds, which needs about 11.9 seconds of standing delay; the one-second default hunts with or without the window.

</details>

**Compute it.** Measure your consumer's dead time, from the scaling decision to the first message a new pod consumes. Add about ten seconds for sampling, and divide your downscale window, plus the same ten seconds, by that effective dead time. Read {% katex() %}\Phi{% end %} from the curve, or compute it: up to about three dead times use the closed form of Proposition 5a, which errs high by at most 3.3%, and beyond that use {% katex() %}e/(1 + 30.6/\ln^2(w/0.07)){% end %}, which errs low by at most 2.7%. The product is the standing delay your loop needs. Divide your threshold by your per-pod rate. If the result is smaller, the loop will hunt, and the cheapest fix is usually a shorter window.

A stabilization window holds pods after the work that justified them is gone. In a loop driven by a backlog, that is the instability, and the threshold is where it gets paid.

---
<sup>[1]</sup> The Kubernetes Authors (2026). *Horizontal Pod Autoscaling*, sections "Stability of workload scale," "Stabilization window" and "Default behavior." kubernetes.io documentation (kubernetes/website, main branch).

<sup>[2]</sup> KEDA Authors (2026). *KEDA documentation v2.19*: ScaledObject specification; Apache Kafka scaler; AWS SQS Queue scaler; RabbitMQ Queue scaler. keda.sh (kedacore/keda-docs).

<sup>[3]</sup> The Kubernetes Authors (2025). *kubernetes/kubernetes v1.34.0.* `pkg/controller/podautoscaler/replica_calculator.go` and `horizontal.go`; `pkg/controller/controller_utils.go` (`ActivePodsWithRanks`). Released 27 August 2025.

<sup>[4]</sup> Amazon Web Services (2026). *Scaling policy based on Amazon SQS.* Amazon EC2 Auto Scaling User Guide.

<sup>[5]</sup> Little, J.D.C. (1961). *A Proof for the Queuing Formula: L = λW.* Operations Research, 9(3), 383–387.

<sup>[6]</sup> Győri, I. & Ladas, G. (1991). *Oscillation Theory of Delay Differential Equations: With Applications.* Oxford Mathematical Monographs, Oxford University Press.

<sup>[7]</sup> Hollot, C.V., Misra, V., Towsley, D., Gong, W.-B. (2002). *Analysis and Design of Controllers for AQM Routers Supporting TCP Flows.* IEEE Transactions on Automatic Control, 47(6), 945-959.

<sup>[8]</sup> Johari, R. & Tan, D.K.H. (2001). *End-to-end congestion control for the internet: delays and stability.* IEEE/ACM Transactions on Networking, 9(6), 818-832.

<sup>[9]</sup> Gandhi, A., Harchol-Balter, M., Raghunathan, R. & Kozuch, M.A. (2012). *AutoScale: Dynamic, Robust Capacity Management for Multi-Tier Data Centers.* ACM Transactions on Computer Systems 30(4), Article 14.

<sup>[10]</sup> Gandhi, A., Harchol-Balter, M. & Adan, I. (2010). *Server farms with setup costs.* Performance Evaluation 67(11), 1123-1138. doi:10.1016/j.peva.2010.07.004.

<sup>[11]</sup> Bainov, D.D. & Hristova, S.G. (2011). *Differential Equations with Maxima.* Chapman and Hall/CRC Pure and Applied Mathematics, CRC Press.
