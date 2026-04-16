+++
authors = [ "Yuriy Polyulya" ]
title = "Ideas about definition of mindset"
description = "Most engineers recognise the term. Few can define it with enough precision to act on it. This post builds the definition from first principles — five cognitive properties and the dependency system they form."
date = 2024-03-12

draft = false

[taxonomies]
tags = ["mindset"]

[extra]
toc = false
disclaimer = """
Building a definition of <mark>"Engineering Mindset"</mark> is my long-term project, and this is the first post intended to set the foundation for discussion.
"""
+++

The clearest signal of a gap in engineering mindset is not what an engineer does not know — it is what they do with what they know. An engineer with deep domain knowledge who cannot mentally run a failure cascade before touching a system, who picks the wrong level of abstraction for their problem, who ships a design that *feels* correct without verifying the assumption underneath: this engineer is consistently surprised by their own outcomes. Not from lack of expertise. From a different kind of deficit — one that technical training rarely names and almost never develops.

Engineering and science share nearly everything on the surface: mathematics, experiment, measurement, models. Yet anyone who has worked in both settings notices a difference that domain expertise alone does not explain. The word used for that difference is *mindset* — a term that appears constantly and is almost never defined precisely enough to be actionable.

This post builds that definition from the ground up. The starting point is not a list of traits but a single asymmetry: the goal.

## The Goal Defines the Cognitive Tools

A cartographer's job is finished when the map matches the territory. Precision, coverage, fidelity to what exists — these are the success conditions. The civil engineer's job begins where the map ends: the territory must change to match the design. Same surveying instruments, same mathematical foundations, opposite success condition.

That reversal runs through every dimension of how each type of work is done. The same inputs — data, tools, models — produce different outputs because the goal determines what each one is used for.

<style>
#tbl_1 + table th:first-of-type  { width: 20%; }
#tbl_1 + table th:nth-of-type(2) { width: 40%; }
#tbl_1 + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_1"></div>

| Property | Scientist | Engineer |
| --- | --- | --- |
| Goal | To describe reality | To change reality |
| Focus | **Generalization**<br>discovery, research, experimentation | **Specialization**<br>problem-solving, invention, optimization |
| Approach | **Inductive**<br>hypothesis testing, data collection, analysis | **Deductive**<br>design, build, test, iterate |
| Result | **Knowledge**<br>theory, model, simulation | **Product**<br>device, system, process |
| Purpose | **Understanding**<br>advancing human knowledge | **Application**<br>solving practical problems |
| Success Metric | **Explanatory power**<br>accuracy, peer validation | **Functionality**<br>efficiency, reliability, scalability |
| Time Orientation | **Future knowledge**<br>long-term insights | **Present solutions**<br>immediate implementation |

Neither pole exists in pure form. R&D engineers operate closer to the scientific end; applied scientists operate closer to the engineering end. Most working professionals move along this spectrum depending on the problem in front of them.

<div style="margin:2rem 0 0.25rem;">
<canvas id="spectrum-canvas" aria-label="Interactive scientist to engineer spectrum" style="width:100%;aspect-ratio:700/270;display:block;cursor:ew-resize;border-radius:6px;"></canvas>
<script>
(function(){
  var canvas=document.getElementById('spectrum-canvas');
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  var W,H,PAD,trackL,trackR,trackW;
  var roles=[
    {t:0.00,label:'Pure Scientist',    approach:'Inductive',              output:'Knowledge', goal:'To describe reality',            process:'Observe \u00b7 Analyze \u00b7 Model \u00b7 Publish'},
    {t:0.33,label:'Applied Scientist', approach:'Mixed \u2014 theory-led', output:'Theory',    goal:'Description informs application', process:'Hypothesize \u00b7 Experiment \u00b7 Model \u00b7 Inform'},
    {t:0.67,label:'R&D Engineer',      approach:'Mixed \u2014 design-led', output:'Prototype', goal:'Application drives change',       process:'Prototype \u00b7 Iterate \u00b7 Integrate \u00b7 Transfer'},
    {t:1.00,label:'Pure Engineer',     approach:'Deductive',              output:'Product',   goal:'To change reality',              process:'Design \u00b7 Build \u00b7 Integrate \u00b7 Deploy'}
  ];
  var t=0.5,animT=0.5,dragging=false;
  function nearest(v){return roles.reduce(function(b,r){return Math.abs(r.t-v)<Math.abs(b.t-v)?r:b});}
  function setupCanvas(){
    var rect=canvas.getBoundingClientRect();
    var dpr=window.devicePixelRatio||1;
    canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;
    ctx.scale(dpr,dpr);
    W=rect.width;H=rect.height;
    PAD=W*0.077;trackL=PAD;trackR=W-PAD;trackW=trackR-trackL;
  }
  function draw(){
    var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
    var bg=dark?'#1e1e1e':'#fafafa',fg=dark?'#e0e0e0':'#1a1a1a',sub=dark?'#999':'#666',dim=dark?'#555':'#bbb';
    var TY=H*0.26,TH=Math.max(3,H*0.033),thumbR=Math.max(7,W*0.017);
    ctx.clearRect(0,0,W,H);ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    var g=ctx.createLinearGradient(trackL,0,trackR,0);
    g.addColorStop(0,'#4a90d9');g.addColorStop(1,'#e07b39');
    ctx.fillStyle=g;ctx.fillRect(trackL,TY-TH/2,trackW,TH);
    for(var i=0;i<roles.length;i++){
      var rx=trackL+roles[i].t*trackW;
      ctx.beginPath();ctx.moveTo(rx,TY-TH/2-3);ctx.lineTo(rx,TY+TH/2+3);
      ctx.strokeStyle=dark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)';ctx.lineWidth=1;ctx.stroke();
    }
    var tx2=trackL+animT*trackW;
    ctx.shadowColor='rgba(0,0,0,0.25)';ctx.shadowBlur=8;
    ctx.beginPath();ctx.arc(tx2,TY,thumbR,0,Math.PI*2);ctx.fillStyle=dark?'#ccc':'#fff';ctx.fill();
    ctx.shadowBlur=0;ctx.shadowColor='transparent';
    ctx.beginPath();ctx.arc(tx2,TY,thumbR,0,Math.PI*2);ctx.strokeStyle=dark?'#777':'#888';ctx.lineWidth=2;ctx.stroke();
    var axFs=Math.max(9,W*0.016);
    ctx.font=axFs+'px system-ui,sans-serif';ctx.fillStyle=dim;
    ctx.textAlign='left';ctx.fillText('Describe Reality',trackL,TY+TH/2+axFs*1.5);
    ctx.textAlign='right';ctx.fillText('Change Reality',trackR,TY+TH/2+axFs*1.5);
    var role=nearest(animT);
    ctx.textAlign='center';
    ctx.font='bold '+Math.max(11,W*0.024)+'px system-ui,sans-serif';ctx.fillStyle=fg;ctx.fillText(role.label,W/2,H*0.50);
    var fs2=Math.max(8,W*0.017);
    ctx.font=fs2+'px system-ui,sans-serif';ctx.fillStyle=sub;ctx.fillText(role.approach+' \u00b7 '+role.output,W/2,H*0.60);
    ctx.font='italic '+fs2+'px system-ui,sans-serif';ctx.fillStyle=dim;ctx.fillText('\u201c'+role.goal+'\u201d',W/2,H*0.70);
    ctx.font=Math.max(7,W*0.013)+'px system-ui,sans-serif';ctx.fillStyle=dark?'#555':'#ccc';
    ctx.fillText('process:',W/2,H*0.793);
    ctx.font=Math.max(8,W*0.016)+'px system-ui,sans-serif';ctx.fillStyle=sub;
    ctx.fillText(role.process,W/2,H*0.862);
    ctx.font=Math.max(7,W*0.013)+'px system-ui,sans-serif';ctx.fillStyle=dark?'#444':'#ddd';
    ctx.fillText('drag to explore',W/2,H*0.955);
  }
  function tFromX(clientX){
    var rect=canvas.getBoundingClientRect();
    return Math.max(0,Math.min(1,(clientX-rect.left-PAD)/trackW));
  }
  canvas.addEventListener('mousedown',function(e){dragging=true;t=tFromX(e.clientX);e.preventDefault();});
  window.addEventListener('mousemove',function(e){if(dragging)t=tFromX(e.clientX);});
  window.addEventListener('mouseup',function(){dragging=false;});
  canvas.addEventListener('touchstart',function(e){dragging=true;t=tFromX(e.touches[0].clientX);e.preventDefault();},{passive:false});
  window.addEventListener('touchmove',function(e){if(dragging){t=tFromX(e.touches[0].clientX);e.preventDefault();}},{passive:false});
  window.addEventListener('touchend',function(){dragging=false;});
  var running=false;
  function loop(){animT+=(t-animT)*0.12;draw();if(running)requestAnimationFrame(loop);}
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en,ob){if(en[0].isIntersecting){running=true;ob.disconnect();setupCanvas();loop();}},{threshold:0.2}).observe(canvas);
  }else{setupCanvas();running=true;loop();}
  window.addEventListener('resize',function(){setupCanvas();});
}());
</script>
</div>

<figcaption>Figure 1: Scientist to Engineer spectrum. Drag to explore how goal, approach, output, and process chain shift across roles.</figcaption>

Why does the goal difference produce a different cognitive architecture?

A scientist can refine a model indefinitely. An engineer ships. That asymmetry creates a specific cognitive pressure: you cannot wait until your model is complete, because it never will be. What you can do is know the shape of your ignorance precisely enough to act on it without being surprised by the parts you got wrong. Five properties make that possible.

## The Five Properties

The properties below are not a taxonomy assembled after the fact. They emerge from what the goal of changing reality, under real constraints, actually requires. Each one addresses a failure mode that appears when you try to act on an incomplete model of a complex system — and each one builds on those before it.

One distinction before the definitions: domain knowledge — thermodynamics, algorithms, materials science — is the raw material. These five properties are the cognitive operations performed *on* that material. You can have deep domain knowledge and lack these properties entirely. You can also develop these properties and apply them to any domain. In different disciplines the same property looks different at the surface: what is mental simulation in software engineering is finite-element analysis in structural engineering and diffusion equations in materials science. The cognitive intent — running a model forward before committing — is the same; the instrument is domain-specific.

One precondition sits outside all five: noticing. Before you can simulate a system, you must have already perceived which signals from the environment are load-bearing enough to model. Karl Weick calls this sensemaking — the interpretive step that precedes model-building. When engineers failed to flag O-ring temperature sensitivity before the Challenger launch, it was not a failure of simulation or rationality. The data existed; the tools existed. What failed was the perceptual step: the temperature-failure correlation was buried in a table where the pattern was invisible. A scatter plot with temperature on the x-axis would have surfaced it immediately. The five properties below assume sensemaking has already succeeded. They cannot compensate for starting with the wrong picture.

### Simulation — run the system before touching it

Simulation is the ability to build a mental model of a complex system and run it forward — tracing how a change propagates through cause and effect before committing to any action. The goal is not to predict the future precisely. It is to generate scenarios that can fail the design before the design is built.

The most revealing engineering instance is deploying a distributed consensus cluster. Before touching any configuration, run the partition scenarios mentally: leader isolated from a *minority* — the minority is cut off, leader and majority continue, system correct; leader isolated from a *majority* — majority elects a new leader, but the isolated original leader still believes it holds the write lease and continues accepting writes the cluster will never acknowledge; a follower rejoins after a long partition carrying a 50,000-entry log gap — the replication backfill saturates bandwidth, delays heartbeats cluster-wide, triggers false leader elections in healthy nodes, and partitions the cluster further before the gap closes. Each scenario is a forward run through cause and effect. Engineers who only simulate the first case ship consensus systems that handle graceful minority failures and are blind-sided by the second and third — the scenarios that actually occur in production.

The critical property of a good simulation is that it is held explicitly as a model, not confused with the system itself. Acknowledging that the model is an approximation is not a limitation. It is the property that makes the model correctable when reality diverges.

Simulation's reliability scales with the quality of your feedback loop. In domains where failures surface quickly — load tests, latency spikes, queue depths — the model calibrates fast. In domains where failures take months to surface — architectural decisions, capacity models, organisational dependencies — even careful simulation accumulates systematic bias. Gary Klein, who spent thirty years studying expert decision-makers, found mental simulation highly accurate in fast-feedback domains like firefighting and chess. Daniel Kahneman, studying cognitive bias across decades, found expert intuition systematically miscalibrated in noisy, slow-feedback domains. Both are right. The appropriate response to slow feedback is not to simulate less — it is to hold the simulation more lightly in proportion to how long reality takes to correct it.

**Without it — postmortem-only learning.** Decisions become purely reactive. The engineer encounters failure modes only after they occur in production, because no mechanism exists to meet them beforehand.

### Abstraction — identify what can be safely discarded

A topographic map is wrong about almost everything: color, vegetation, buildings, road surfaces. It is precisely right about elevation. That selective wrongness is not a limitation — it is the design. The map discards every detail that does not affect the outcome it was built to support, and becomes useful specifically because it is incomplete.

A payment service that retries failed charge requests is built on an abstraction: *failure means the request did not arrive*. This holds most of the time, but the failure mode splits into two cases the abstraction treats as identical — *did not receive* (the request never reached the processor; retry is safe) and *received but response lost* (the processor charged the card but the confirmation was dropped in transit; retry charges twice). Both look like a timeout from the caller's side. The right abstraction — an idempotency key that the processor deduplicates — punches precisely through the distinction the retry logic discarded. The wrong abstraction was not wrong in general; it was wrong because it discarded the failure mode that governs the outcome the system is required to guarantee. Simulation is what reveals which failure mode governs: run the scenarios forward, and the idempotency requirement surfaces before a double-charge reaches a customer.

Abstraction depends on simulation: you need a running model of the system to test which parameters are critical under which conditions and which can safely be dropped.

**Without it — detail paralysis.** Every problem appears unique at the surface. Solutions cannot be transferred across domains because the engineer sees no structure beneath the specifics — only an accumulation of cases that never generalise.

### Rationality — verify without mercy

A compiler does not care how elegant the algorithm feels to its author. It checks whether the code violates the rules of the system. If it does, it fails — regardless of intent, experience, or confidence. The compiler is not the creative faculty. It is the verification mechanism that prevents creativity from drifting into wishful thinking.

The word *rationality* here does not mean optimal decision-making in the economist's sense. It means something closer to what Karl Popper called falsificationism: the discipline of actively trying to prove your model wrong rather than passively collecting evidence that it is right. You cannot confirm a model is correct — you can only fail to disprove it under increasingly adversarial tests. The stronger the adversarial test you construct and survive, the more confidence you have earned. The engineer's version of this discipline is not a philosophical posture — it is the habit of asking, before every claim: what is the test that would break this, and have I run it?

Rationality plays the same role in engineering cognition. A distributed system publishes a 99.999% availability SLO. Rationality asks: how is availability measured? If it is measured by synthetic health-check pings to the service endpoint, the measurement cannot detect the scenario where the service responds to pings but a circuit breaker has opened on a downstream dependency — causing 30% of actual user flows to fail silently. The ping is green; the metric is green; the SLO reports as met, while the system is delivering successful outcomes to 70% of users. The design feels verified because the numbers look good. Rationality is the discipline of asking "what does this measurement *not* cover?" before numbers become a substitute for a check. Most availability postmortems share the same structure: the monitoring that reported everything was fine was measuring a proxy that no longer tracked what actually failed.

The procedural form of this discipline is the pre-mortem. Before shipping, imagine the system has already failed — not generically, but specifically. Work backward: what in *this* design's monitoring would be invisible to the failure mode you are most worried about? A pre-mortem runs the failure scenario through the measurement layer to locate its blind spots before production does. It is adversarial verification made routine.

**Without it — faith-based shipping.** Designs that feel correct get deployed. The gap between model and reality is discovered in production rather than in analysis, because the question that would have found it was never asked.

### Awareness — know the boundaries of your own models

A well-calibrated instrument is not one that is always accurate — it is one whose systematic errors are known. A thermometer that reads two degrees high is perfectly usable as long as you know it reads two degrees high. An uncalibrated instrument is dangerous precisely because you cannot tell when to trust it.

A Kafka consumer was capacity-planned for a steady 800 messages per second: eight partitions, four consumer instances, 30% headroom in the model. Eight months later an upstream service ships that produces 40-second burst windows at 60,000 messages per second during peak pricing events. Nobody updated the consumer's capacity model; the headroom figure in the runbook still reads "30%." When the first pricing event fires, the consumer falls behind by 800,000 messages in under two minutes. Queue depth triggers producer backpressure, which propagates upstream through three services, and what began as a consumer lag event becomes a cross-system cascade. Each individual component's model was internally coherent — the consumer's design was correct for its original input envelope. What was missing was the link between component model and system context: awareness that the input distribution the model was calibrated against is no longer the distribution the system receives.

Awareness does not mean paralysis from uncertainty. It means operating with calibrated confidence — holding the distinction between "my model is correct" and "my model is all I currently have."

**Without it — decisions on expired models.** The engineer cannot distinguish a well-tested conclusion from a well-rehearsed assumption. Both feel equally certain from the inside — until production proves one wrong.

### Optimization — pursue better, not just good enough

Humans are natural satisficers<sup>[1]</sup>: we accept solutions that cross the threshold of "good enough" and stop searching. Herbert Simon, who coined the term and won the Nobel for the theory behind it, showed that satisficing is not a cognitive failure — it is the rational strategy under limited time and information. The discipline of optimization is not rejecting that insight. It is applying it correctly: satisfice freely on the ninety percent of decisions that are not binding constraints, and refuse to satisfice on the one that is. The hard part is knowing which constraint is actually governing the outcome.

A microservices team observes high CPU on their order-processing service and adds four more instances. CPU drops; response time barely moves. They add four more; response time improves 14ms — they ship. Two months later response time has regressed to baseline. The scaling moved the bottleneck without exposing it: the real constraint was the message broker's single-partition throughput. Adding consumer instances spread the fan-out across more workers without increasing broker throughput; the improvement came from a brief queue-draining effect, not from resolving the actual limit. The bottleneck resurfaced under the next load increase wearing a different face, now harder to diagnose because its symptoms were distributed across twice as many instances. True optimization would have asked: what is the binding constraint of this system, and does adding instances address it or merely redistribute the symptom? These are the questions satisficing skips — because once a fix produces a green graph, shipping feels rational.

Optimization without the other four properties is a progressive trap: optimizing in the wrong direction (poor simulation), optimizing the wrong variable (poor abstraction), optimizing based on false evidence (poor rationality), or optimizing past the boundary of your model's validity (poor awareness).

**Without it — first-solution fixation.** The first working implementation becomes the permanent one. The space of structurally different approaches is never explored because stopping felt rational.

These five properties form a system, not a list. The diagram proposes one model of how they depend on each other — not a derived result, but an inference from what each property requires in order to operate reliably. An arrow from A to B means B cannot function well without A having run first. Simulation must run before Rationality can check it: you cannot rigorously verify a claim you have not yet modeled. Rationality must clear the current model before Optimization can push against it: pursuing *better* on an unverified model compounds errors, it does not reduce them. Awareness feeds back into Simulation and Abstraction because knowing where your model breaks is the only information that tells you how to recalibrate it. Whether the same dependency order holds in mechanical or chemical engineering, I do not know — the model is calibrated against software.

<div style="margin:2rem 0 0.25rem;">
<canvas id="constellation-canvas" aria-label="Animated diagram of the five cognitive properties as a connected system" style="width:100%;aspect-ratio:580/370;display:block;border-radius:6px;"></canvas>
<script>
(function(){
  var canvas=document.getElementById('constellation-canvas');
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  var W,H;
  var removed={};
  var nodes=[
    {label:'Simulation',  sub:'Run the model first'},
    {label:'Abstraction', sub:'Filter what matters'},
    {label:'Rationality', sub:'Verify without mercy'},
    {label:'Optimization',sub:'Pursue better'},
    {label:'Awareness',   sub:'Know your limits'}
  ];
  var edges=[
    {from:0,to:1,color:'#4a90d9',label:'seeds'},
    {from:0,to:2,color:'#4a90d9',label:'proposes'},
    {from:1,to:2,color:'#7b5ea7',label:'frames'},
    {from:2,to:4,color:'#7b5ea7',label:'exposes'},
    {from:4,to:0,color:'#5ba85a',label:'tunes'},
    {from:4,to:1,color:'#5ba85a',label:'redraws'},
    {from:4,to:3,color:'#e07b39',label:'anchors'},
    {from:2,to:3,color:'#e07b39',label:'clears'}
  ];
  var pulses=edges.map(function(){return{t:Math.random(),speed:0.0035+Math.random()*0.003};});
  function setupCanvas(){
    var rect=canvas.getBoundingClientRect();
    var dpr=window.devicePixelRatio||1;
    canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;
    ctx.scale(dpr,dpr);
    W=rect.width;H=rect.height;
  }
  function getPos(){
    var cx=W/2,cy=H/2-5,r=Math.min(W,H)*0.33;
    return nodes.map(function(_,i){
      var a=-Math.PI/2+(i*2*Math.PI)/nodes.length;
      return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};
    });
  }
  function hitTest(x,y,pos,NR){
    for(var i=0;i<pos.length;i++){var dx=pos[i].x-x,dy=pos[i].y-y;if(dx*dx+dy*dy<=NR*NR)return i;}
    return -1;
  }
  function draw(){
    var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
    var bg=dark?'#1e1e1e':'#fafafa';
    var nf=dark?'#252525':'#f0f0f0',ns=dark?'#3d3d3d':'#d0d0d0';
    var el=dark?'rgba(100,100,100,0.28)':'rgba(180,180,180,0.45)';
    var af=dark?'rgba(100,100,100,0.35)':'rgba(160,160,160,0.5)';
    var lf=dark?'#e0e0e0':'#1a1a1a',ls=dark?'#606060':'#aaa';
    ctx.clearRect(0,0,W,H);ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    var pos=getPos(),NR=Math.min(50,Math.min(W,H)*0.135);
    var degraded={};
    for(var i=0;i<edges.length;i++){if(removed[edges[i].from])degraded[edges[i].to]=true;}
    for(var i=0;i<edges.length;i++){
      var e=edges[i],a=pos[e.from],b=pos[e.to];
      var broken=removed[e.from]||removed[e.to];
      var dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy);
      var ux=dx/len,uy=dy/len,ang=Math.atan2(dy,dx);
      var sx=a.x+ux*NR,sy=a.y+uy*NR,ex=b.x-ux*(NR+9),ey=b.y-uy*(NR+9);
      if(broken){
        ctx.globalAlpha=0.12;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);
        ctx.strokeStyle=dark?'#888':'#aaa';ctx.lineWidth=1.5;
        ctx.setLineDash([4,4]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      }else{
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);
        ctx.strokeStyle=el;ctx.lineWidth=1.5;ctx.stroke();
        ctx.beginPath();ctx.moveTo(ex,ey);
        ctx.lineTo(ex-7*Math.cos(ang-0.42),ey-7*Math.sin(ang-0.42));
        ctx.lineTo(ex-7*Math.cos(ang+0.42),ey-7*Math.sin(ang+0.42));
        ctx.closePath();ctx.fillStyle=af;ctx.fill();
        var mx=(sx+ex)/2,my=(sy+ey)/2;
        var px1=-uy,py1=ux,px2=uy,py2=-ux;
        var cx0=W/2,cy0=H/2-5;
        var d1=(mx+px1*14-cx0)*(mx-cx0)+(my+py1*14-cy0)*(my-cy0);
        var ox=d1>0?px1*14:px2*14,oy=d1>0?py1*14:py2*14;
        var lx=mx+ox,ly=my+oy;
        var lfs=Math.max(7,NR*0.22);
        ctx.font='italic '+lfs+'px system-ui,sans-serif';
        ctx.textAlign='center';ctx.textBaseline='middle';
        var tw=ctx.measureText(e.label).width;
        ctx.fillStyle=dark?'rgba(28,28,28,0.82)':'rgba(248,248,248,0.88)';
        ctx.fillRect(lx-tw/2-3,ly-lfs/2-2,tw+6,lfs+4);
        ctx.fillStyle=e.color;ctx.fillText(e.label,lx,ly);
        var p=pulses[i],ppx=sx+(ex-sx)*p.t,ppy=sy+(ey-sy)*p.t;
        var glow=ctx.createRadialGradient(ppx,ppy,0,ppx,ppy,11);
        glow.addColorStop(0,e.color+'66');glow.addColorStop(1,e.color+'00');
        ctx.beginPath();ctx.arc(ppx,ppy,11,0,Math.PI*2);ctx.fillStyle=glow;ctx.fill();
        ctx.beginPath();ctx.arc(ppx,ppy,3.5,0,Math.PI*2);ctx.fillStyle=e.color;ctx.fill();
      }
    }
    for(var j=0;j<nodes.length;j++){
      var nd=nodes[j],pt=pos[j];
      var isRem=!!removed[j],isDeg=!!(degraded[j]&&!isRem);
      ctx.globalAlpha=isRem?0.28:1;
      ctx.beginPath();ctx.arc(pt.x,pt.y,NR,0,Math.PI*2);
      ctx.fillStyle=isRem?(dark?'#282828':'#ebebeb'):nf;ctx.fill();
      ctx.lineWidth=isRem?1.5:(isDeg?2.5:1.5);
      if(isRem){ctx.setLineDash([5,4]);ctx.strokeStyle=dark?'#555':'#aaa';}
      else if(isDeg){ctx.strokeStyle='#e07b39';}
      else{ctx.strokeStyle=ns;}
      ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=1.5;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle=isRem?(dark?'#555':'#999'):lf;
      ctx.font='bold '+Math.max(9,NR*0.275)+'px system-ui,sans-serif';
      ctx.fillText(nd.label,pt.x,pt.y-NR*0.18);
      if(isRem){
        var tw2=ctx.measureText(nd.label).width;
        ctx.beginPath();ctx.moveTo(pt.x-tw2/2,pt.y-NR*0.18);ctx.lineTo(pt.x+tw2/2,pt.y-NR*0.18);
        ctx.strokeStyle=dark?'#666':'#999';ctx.lineWidth=1.2;ctx.stroke();ctx.lineWidth=1.5;
      }
      ctx.fillStyle=isDeg?'#e07b39':(isRem?(dark?'#444':'#bbb'):ls);
      ctx.font=Math.max(7,NR*0.225)+'px system-ui,sans-serif';
      ctx.fillText(isDeg?'missing input':nd.sub,pt.x,pt.y+NR*0.2);
      ctx.globalAlpha=1;
    }
    var anyRem=Object.keys(removed).filter(function(k){return removed[k];}).length>0;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=Math.max(7,W*0.013)+'px system-ui,sans-serif';
    ctx.fillStyle=dark?'#444':'#ccc';
    ctx.fillText(anyRem?'click to restore':'click a node to remove it',W/2,H-12);
  }
  function loop(){
    for(var i=0;i<pulses.length;i++){
      if(!removed[edges[i].from]&&!removed[edges[i].to]){pulses[i].t+=pulses[i].speed;if(pulses[i].t>1)pulses[i].t=0;}
    }
    draw();requestAnimationFrame(loop);
  }
  function onClick(e){
    var rect=canvas.getBoundingClientRect();
    var pos=getPos(),NR=Math.min(50,Math.min(W,H)*0.135);
    var hit=hitTest(e.clientX-rect.left,e.clientY-rect.top,pos,NR);
    if(hit>=0)removed[hit]=!removed[hit];
    e.preventDefault();
  }
  function onTouch(e){
    if(e.changedTouches.length>0){
      var rect=canvas.getBoundingClientRect();
      var pos=getPos(),NR=Math.min(50,Math.min(W,H)*0.135);
      var hit=hitTest(e.changedTouches[0].clientX-rect.left,e.changedTouches[0].clientY-rect.top,pos,NR);
      if(hit>=0)removed[hit]=!removed[hit];
    }
    e.preventDefault();
  }
  canvas.style.cursor='pointer';
  canvas.addEventListener('click',onClick);
  canvas.addEventListener('touchend',onTouch,{passive:false});
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en,ob){if(en[0].isIntersecting){ob.disconnect();setupCanvas();loop();}},{threshold:0.2}).observe(canvas);
  }else{setupCanvas();loop();}
  window.addEventListener('resize',function(){setupCanvas();});
}());
</script>
</div>

<figcaption>Figure 2: The five cognitive properties as a connected system. Arrow direction is dependency direction: B depends on A. Edge labels name the specific transfer at each step. Click any node to remove it — its outgoing edges break and dependent nodes show the effect.</figcaption>

The sequence matters: simulation generates the model; abstraction focuses it on what is load-bearing for the problem at hand; rationality checks it for violations; awareness monitors where the model's boundary lies; optimization drives toward better configurations within those limits.

## The Properties in Practice

A design session for a real-time fraud detection layer — every transaction evaluated in under 50ms — shows what the five properties look like running together.

Simulation runs first. Before writing any code, the team maps four traffic scenarios: steady 5,000 TPS, a flash-sale burst at 80,000 TPS, a coordinated account-takeover wave where 20% of sessions are simultaneously fraudulent, and a cold restart with an empty local feature cache. The simulation surfaces that the bottleneck under burst is feature store read latency, not the inference model. It also seeds the core abstraction question: which features can tolerate staleness?

Abstraction divides reads into two tiers — a local cache for features stable over 30 seconds (account age, long-run transaction patterns) and a synchronous remote call for velocity features (transaction counts in the last 60 seconds). Node-level network details are discarded entirely. The claim Abstraction frames for Rationality: fraud decisions are accurate given local cache staleness under 30 seconds.

Rationality checks whether the claim holds under the burst scenario. It does not: replication lag to the local cache spikes past four minutes during the coordinated-takeover wave — precisely the moment freshness matters most. The design felt elegant; the verification fails. Rationality exposes this to Awareness as a hidden precondition: the accuracy guarantee assumes low replication lag, which collapses under the adversarial condition the system was built to handle. It also clears the optimization target: the bottleneck is replication lag, not inference latency.

Awareness responds on two fronts. It tunes the next simulation run to use realistic replication lag curves rather than the single-value idealization. And it redraws the abstraction: stale vs fresh is not binary — a third state exists, stale beyond the guarantee threshold, and transactions in that state must route to a fallback model. The original two-tier design discarded this state because it was invisible under normal traffic.

Optimization now has solid ground. Awareness anchors the target at the binding constraint: optimizing inference below 15ms yields no fraud-quality improvement while replication lag can exceed 30 seconds — staleness dominates. The team optimizes the replication path — compressed snapshot diffs, higher consumer parallelism on the cache-update topic — rather than the inference path. No cycles spent on the wrong bottleneck.

> **[Mindset](/tags/mindset/)** is the set of cognitive operations that enables acting effectively on incomplete models of reality. It is what separates having domain knowledge from knowing what to do with it.

Domain knowledge is the raw material. These five properties are the cognitive machinery that operates on that material. The most capable engineers are not necessarily those with the deepest knowledge of any particular domain — they are those who can take whatever domain knowledge they have and operate on it with precision: run clean simulations, cut to the right abstraction, verify without mercy, stay honest about where the model ends, and not stop at the first answer that works.

That definition is precise enough to act on — and precise enough to argue with.

One honest boundary remains. All five properties operate on failure modes you have already conceptualized. They cannot generate failure mode categories that do not yet exist in your vocabulary. Before viral content existed as a traffic pattern, no amount of simulation, abstraction, rationality, or awareness would have produced the scenario of a single post driving a thousandfold load spike in minutes — because no one had the concept to simulate. The hardest engineering failures are often not harder instances of known problems. They are the first instance of a problem class that did not exist last year. Against that kind of failure, the five properties are necessary but not sufficient. What compensates is organizational: diverse teams, diverse users, and feedback loops short enough to surface novelty before it becomes a crisis.

---
<sup>[1]</sup> [Satisficing](https://en.wikipedia.org/wiki/Satisficing) is a decision-making strategy that aims for a satisfactory or adequate result rather than the optimal solution. Term introduced by Herbert Simon in the 1950s as an alternative to classical maximization models of decision-making.
