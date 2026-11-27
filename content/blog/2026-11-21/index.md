+++
authors = ["Yuriy Polyulya"]
title = "Smarter Agents, Fewer Opinions"
description = "Swap the reviewers for AI agents and the office politics disappear, along with the excuses. The trouble stays: models trained on the same internet stumble on the same hard questions, and public benchmarks show the resemblance growing as the models get smarter. Credit analysts met this pattern in their best borrowers long ago. This post runs the same review with agents and finds more voices, not more opinions, and the one job people still do better: knowing what the internet never saw."
date = 2026-11-21
slug = "adoption-mechanics-part2-smarter-agents-fewer-opinions"
draft = false

[taxonomies]
tags = ["systems-thinking", "game-theory", "ai", "multi-agent"]
series = ["adoption-mechanics"]

[extra]
toc = false
series_order = 2
series_title = "Adoption Mechanics: Why Correct Designs Die, and Where Human Attention Belongs"
series_description = """<div class="series-lede">Agreement is the cheapest state any system can reach. Consensus is the most expensive way to get there.</div> A review has a human energy budget, and correct designs die where it goes. This series builds one model of a review: people with correlated signals and careers to protect, a vote taken in order, a chain of hand-offs, and veto gates guarding a status quo. People and AI agents differ in it only by a few parameters, several of them measured. The first part follows a design through a human review: first-writer-wins, trivia every pair must settle, and good designs aligned to death. The second gives the model agent values and finds machines that agree for free too, wrong on the same hard questions. The third gives AI a job, not a seat: the Residual Protocol spends machines on everything that can be written and a fixed budget of human attention on what cannot. Every number comes from executed code, and every part names the observation that would prove it wrong."""
+++

A team that has watched a good design die in review has an obvious next move. Take the people out. Ask a panel of AI agents to review the design instead: agents have no careers to protect, no incumbent they once endorsed, no meeting to survive. They are handed the whole document every time, and they do not get tired at the end of the afternoon.

The move removes some of what [Correct, and Rejected](@/blog/2026-11-14/index.md) found and leaves the rest. That post built one model of a reviewer and followed a design through four stages: correlated sensing, aggregation in order, hand-off through layers and veto gates. It found that each stage charges the design something, and that one of them, a status quo inside the gates' priorities, charges everything. None of the four stages needed a person to behave badly.

An agent panel changes the values in that model and keeps its form. The career terms go to zero. The conformity term stays, because models are trained toward agreement. The hand-off stays, because an orchestrator summarizes. The gates stay, because someone still approves the change. And the first stage, correlated sensing, does not go away at all. Of the four, it is also the stage whose agent values can be measured directly, question by question, and that measurement is the subject of this post.

Stanford's HELM project publishes how each of dozens of language models answered each question of three standard benchmarks. Across all three the same picture appears. The odds that two models make the same mistake rise steeply with their accuracy. Most of that rise is shared difficulty: hold the question's difficulty fixed and the odds fall back near even. The strongest models keep a residual, nearly double the odds of a shared mistake beyond what difficulty explains, and an average of their votes holds about two independent opinions.

The post asks four questions of that measurement. What does voting buy among strong models? Does the open question an earlier post left, whether agent crowds escalate through a cascade among correlated peers, have an answer in this model? When people and agents review together, when do the agents help? And can upgrading every member of a panel make the panel worse?

<div class="recap-box">
<span class="recap-label">In brief</span>
<ul>
<li><strong>The belief.</strong> A panel of AI agents is free of the politics that stalls people, and a panel of better models is a better panel.</li>
<li><strong>The mechanism.</strong> The same member model with agent values: no career terms, trained-in conformity, and mistakes that pile onto the same hard questions as models improve.</li>
<li><strong>The law.</strong> Shared difficulty explains most of the dependence between models' errors; the strongest fifth keep nearly double the odds of a shared mistake beyond it, on all three benchmarks. In a large unweighted panel, agents that share a blind spot set the chance of adopting a worse design whatever the people know (Proposition 6).</li>
<li><strong>The gap.</strong> An average of the strongest models' votes holds about two opinions, and a large majority of the strongest tier removes about a tenth of its members' error.</li>
<li><strong>The intervention.</strong> For a question that turns on a local fact, let the people who hold it decide; add agents only once their answers carry some of that fact.</li>
<li><strong>The bill.</strong> In the modeled panel, five partly informed people alone adopt a worse design 1% of the time; pooled without weights inside twenty blind-spotted agents, 41%.</li>
<li><strong>Where you stand.</strong> Log your panel's answers on questions of known difficulty; dependence that survives within difficulty is a shared blind spot.</li>
</ul>
</div>

<details>
<summary>Notation used in this part</summary>

**Members and panels**

- {% katex() %}p{% end %} and {% katex() %}\rho{% end %} - one member's probability of error, and the latent correlation of two members' errors through one shared factor
- {% katex() %}r_v{% end %} - the correlation of two members' right-or-wrong answers: the correlation that sets the variance of an average of votes
- {% katex() %}P_{\text{floor}}(p, \rho) = \Phi(\Phi^{-1}(p)/\sqrt{\rho}){% end %} - the error of a large majority, Proposition 1
- {% katex() %}1/r_v{% end %} - the most independent opinions an average of votes can carry, reached only as the panel grows without limit
- {% katex() %}m{% end %} and {% katex() %}\varepsilon^\ast(p){% end %} - the margin of an upgrade, positive when it improves a large panel, and the critical elasticity of correlation with respect to error
- {% katex() %}\Phi'{% end %} - the standard normal density, the derivative of {% katex() %}\Phi{% end %}

**Agents and people**

- {% katex() %}\gamma{% end %} and {% katex() %}\eta{% end %} - conformity, and instability: the probability of changing an answer with no new input
- {% katex() %}\varphi{% end %} - faithfulness of a stated reason to what drove the answer
- {% katex() %}y_0{% end %}, {% katex() %}\nu{% end %} and {% katex() %}\beta{% end %} - in Proposition 6, an agent's chance of answering for the successor whatever the truth, the number of people per agent, and the share of people who hold the local fact
- {% katex() %}w{% end %} - the probing weight: the log-odds a member puts on informing those who vote after them
- {% katex() %}A_+{% end %} and {% katex() %}A_-{% end %} - the probability of adopting the successor when the local fact favors it, and when it opposes it

**The tags**

- L1 · Bound, L2 · Fit and L3 · Estimate - the tag on each paragraph: a proof or a cited fact, a judgment or approximation the text argues for, and a worked example computed from the model or measured

</details>

<details>
<summary>Results from earlier posts this part uses</summary>

- Definition 1 of [Correct, and Rejected](@/blog/2026-11-14/index.md): a member holds a bounded binary signal, acts in order, and is paid for accuracy, minus conformity, plus reputation over a horizon, with loss aversion and a career position; people and agents differ only in the values.
- Definitions 2 and 3 of [Correct, and Rejected](@/blog/2026-11-14/index.md#def-2): adoption is a spatial test times the probability that the relayed evidence clears the gates' thresholds, and a review's operating point is its pair of adoption probabilities for a better and a worse design.
- Proposition 1 of [Correct, and Rejected](@/blog/2026-11-14/index.md#prop-1): as the panel grows, the probability that a majority errs tends to {% katex() %}\Phi(\Phi^{-1}(p)/\sqrt{\rho}){% end %}.
- Proposition 2 of [Correct, and Rejected](@/blog/2026-11-14/index.md#prop-2): with independent binary signals of precision {% katex() %}q{% end %}, a long sequence ends in a wrong cascade with probability {% katex() %}(1-q)^2/(1 - 2q(1-q)){% end %}.
- Proposition 3 of [Correct, and Rejected](@/blog/2026-11-14/index.md#prop-3): with Euclidean preferences, some change is preferred by every gate if and only if the status quo lies outside the convex hull of their ideal points.
- Proposition 4 of [Correct, and Rejected](@/blog/2026-11-14/index.md#prop-4): learning from recorded reasons as causes converges to {% katex() %}\varphi\theta + (1-\varphi)b{% end %}, and no test on the records alone can tell that belief from the truth.
- Proposition 1 of [One Equation Governs CPU Caches, Human Teams, and AI Agent Systems](@/blog/2026-04-24/index.md#prop-1): with contention {% katex() %}\alpha{% end %} and coherency {% katex() %}\kappa_{\text{coh}}{% end %}, throughput peaks at {% katex() %}N_{\max} = \sqrt{(1-\alpha)/\kappa_{\text{coh}}}{% end %}.
- Definition 2 of [The Familiarity Bias](@/blog/2026-07-15/index.md#def-2): a panel draws its variants "from multiple model families whenever more than one is deployed", because persona framing alone "does not decorrelate the underlying model's shared weights".

</details>

## The Belief: Agents Are Free of Politics

{{ layer(n=2, type="Fit", id="belief-stated") }}The belief has two halves. The first is that an agent review avoids the human failures. Agents do not fear for their careers or defend designs they once approved, and they do not stay silent to keep the peace. The second is that better models make better panels. If one model is right 75% of the time and a stronger one 80%, a panel of the stronger models should beat a panel of the weaker ones. Both should beat any single member.

{{ layer(n=2, type="Fit", id="belief-half-right") }}The first half is partly right, and the model says which part. The second half is the subject of a measurement and a theorem. The measurement says how much voting buys among today's strong models, and the answer is little. The theorem says what would turn an upgrade of every member into a worse panel, and how close today's models are to it.

## The Same Member, Agent Values

{{ layer(n=2, type="Fit", id="same-model") }}Definition 1 of [Correct, and Rejected](@/blog/2026-11-14/index.md) wrote one member with a payoff of accuracy, conformity, reputation, loss aversion and a career position. An agent fits the same definition. What changes is which terms carry weight, and for several of them the weight has been measured.

{{ layer(n=2, type="Fit", id="career-terms-vanish") }}The career terms vanish in their human form. An agent has no horizon over which a reputation accumulates, so the reputation term {% katex() %}\delta{% end %} is zero. The endorsement term has an agent form, though. A system instruction that favors the current design acts like a sunk endorsement without a career behind it. So does a fine-tuned preference for familiar patterns, or a shared memory that records the incumbent's approval. Where an agent carries none of these, the career plane that silenced the senior reviewer, and made the same reviewer the incumbent's loudest defender, has nothing to act on.

{{ layer(n=1, type="Bound", id="sycophancy") }}Conformity does not vanish. Sharma and coauthors showed that assistants trained on human preference judgments learn to agree with the user, and traced the tendency to preference data that rewards agreement{{ cite(ref="1", title="Sharma, M. and coauthors (2024) -- Towards Understanding Sycophancy in Language Models, ICLR 2024") }}. The conformity term {% katex() %}\gamma{% end %} that a human reviewer pays in social discomfort, a model pays through its training.

{{ layer(n=1, type="Bound", id="instability-measured") }}Its size in a panel has been measured. Hao and six coauthors ran multi-agent debates on a hard benchmark and separated two causes of an agent changing its answer{{ cite(ref="2", title="Hao, X. and six coauthors (2026) -- Not All Flips Are Conformity: Decomposing Stance Convergence in Multi-Agent LLM Debate, arXiv:2606.00820") }}. In their primary setting, 37% of agent-question observations changed under self-reflection alone, with no peers present: that is instability, the term {% katex() %}\eta{% end %}. Strict conformity to peers came to about 29%, and it was mostly harmful, turning correct answers into wrong ones.

{{ layer(n=2, type="Fit", id="human-comparison") }}The human comparison is close. Franzen and Mader's replication of Asch, cited in the earlier post, found 33% errors under group pressure. An agent's change of answer is not a person's strategic choice. Part of it is sampling instability, which Hao and coauthors separate out, and the rest is a learned pull toward agreement. The model needs the size of each, not its motive, and the sizes are similar.

{{ layer(n=1, type="Bound", id="faithfulness") }}The write-back term changes form and keeps its size. Turpin and coauthors showed that a model's chain of thought can omit the feature that actually drove its answer, giving a plausible reason that the bias never appears in{{ cite(ref="3", title="Turpin, M. and coauthors (2023) -- Language Models Don't Always Say What They Think: Unfaithful Explanations in Chain-of-Thought Prompting, NeurIPS 2023") }}. Chen and coauthors gave reasoning models hints and checked whether the models mentioned the hints they used: they mostly did not{{ cite(ref="4", title="Chen, Y. and coauthors (2025) -- Reasoning Models Don't Always Say What They Think, arXiv:2505.05410") }}. Proposition 4 of the earlier post then applies to any pipeline that learns from its agents' logged rationales. Its second part applies too: no audit of the rationales alone can find the bias. The check has to come from telemetry of what the agents actually did.

{{ layer(n=2, type="Fit", id="what-stays") }}The hand-off and the gates stay as they were. An orchestrator that summarizes three agents' findings for a fourth is a hand-off with a candor of its own. A change that an agent panel recommends still passes through human approvers, or through automated guardrails whose rules play the role of ideal points. Proposition 3 of the earlier post does not care what the gates are made of. The write-back loop stays too, in the same coupled form. Rationales logged after a decision shape the next prompts, the agents' shared memory and the guardrails' rules. A biased record then raises the next panel's correlation and keeps the status quo among the gates' priorities. These links are a qualitative coupling: their direction is clear, and none of their sizes is calibrated.

## Correlation Measured

{{ layer(n=2, type="Fit", id="why-measure") }}The sensors are where agents differ most, and where the difference can be measured directly. A human reviewer's errors cannot be logged question by question across thousands of decisions. A model's can. The question is how the dependence between two models' errors changes with how good the models are, and what it is made of. Multiple-choice benchmarks measure knowledge and bounded reasoning on closed questions, while a design review weighs trade-offs whose answers are often conditional. Treating a model's benchmark accuracy as its precision in a review is an analogy, and the post marks the transfer as a Fit.

{{ layer(n=1, type="Bound", id="helm-data") }}Stanford's HELM project evaluates models on fixed benchmarks and publishes each model's answer to each question{{ cite(ref="5", title="Liang, P. and coauthors (2023) -- Holistic Evaluation of Language Models, Transactions on Machine Learning Research") }}. Three of its benchmarks are used here. MMLU, a multiple-choice test of academic knowledge, appears in HELM Lite: five subjects, 567 questions, 95 models from 20 providers{{ cite(ref="6", title="Hendrycks, D. and coauthors (2021) -- Measuring Massive Multitask Language Understanding, ICLR 2021") }}. GPQA, graduate-level science questions written to resist search, and MMLU-Pro, a harder ten-choice version of MMLU, appear in HELM Capabilities with 65 and 64 current models{{ cite(ref="7", title="Rein, D. and coauthors (2024) -- GPQA: A Graduate-Level Google-Proof Q&A Benchmark, COLM 2024") }}{{ cite(ref="8", title="Wang, Y. and coauthors (2024) -- MMLU-Pro: A More Robust and Challenging Multi-Task Language Understanding Benchmark, NeurIPS 2024") }}. For every pair of models the analysis keeps four counts per group of questions: both right, each right alone, both wrong.

{{ layer(n=2, type="Fit", id="two-correlations") }}Two correlations come out of the counts, and they govern different things. The latent correlation {% katex() %}\rho{% end %} treats each model's correctness as a threshold on a normal score. It is the quantity in Proposition 1, so it sets the error floor of a majority vote. The correlation of the right-or-wrong answers themselves, {% katex() %}r_v{% end %}, is smaller. It sets the variance of an average of votes, and {% katex() %}1/r_v{% end %} is the most independent opinions such an average can carry as the panel grows. That count describes the variance of a linear average of votes, not the information the votes hold, and the floor of a majority comes from the latent model instead. It is also bounded by the two models' accuracies. Two models with very different error rates cannot have an {% katex() %}r_v{% end %} near one, even if every error of the better one is also an error of the worse.

{{ layer(n=1, type="Bound", id="difficulty-confound") }}A pooled correlation mixes two things. Two models that fail independently on any single question will still look dependent across a set of questions, if both pass the easy ones and both miss the hard ones. Psychometrics separates the two by conditioning on item difficulty. Here each pair's questions are split into ten groups of equal size by how many of the other models answered them correctly. The pair's own answers therefore do not define its groups. Within each group the dependence is measured as an odds ratio of a shared mistake. That is one model's odds of a mistake when the other errs, divided by its odds when the other is right; 1 means no dependence. The groups are combined with the estimator of Mantel and Haenszel, which stays finite in the small groups where a correlation per group would not{{ cite(ref="9", title="Mantel, N. and Haenszel, W. (1959) -- Statistical Aspects of the Analysis of Data from Retrospective Studies of Disease, Journal of the National Cancer Institute 22(4)") }}.

{{ layer(n=3, type="Estimate", id="pooled-rises") }}Pooled over all questions, dependence rises with capability on every benchmark. On MMLU, the odds ratio of a shared mistake is 1.8 for the weakest fifth of pairs and 13 for the strongest; on GPQA and MMLU-Pro the strongest fifth reach 9 and 19. However large the panel, an average of the strongest fifth's votes can hold at most 1.96 independent opinions on MMLU, 2.23 on GPQA and 1.93 on MMLU-Pro.

{{ layer(n=3, type="Estimate", id="within-difficulty") }}Within groups of similar difficulty, most of that disappears. For the middle three fifths of pairs, the within-difficulty odds ratio sits between 0.82 and 1.09 on all three benchmarks. The strongest fifth keep more: 1.25 on MMLU, 1.81 on GPQA and 1.84 on MMLU-Pro.

{{ layer(n=3, type="Estimate", id="irt-null") }}An odds ratio near 1 is not automatically the absence of dependence, because the estimator has artifacts of its own. Ten groups of equal size leave some difficulty inside each, and most in the hardest group. That is where the strongest models make most of their errors, and where the estimator puts most of their weight. Comparing the observed shared errors with a null separates real excess from those artifacts. The same data were simulated from an item-response model in which a model's chance of a right answer depends only on its ability and the question's difficulty. In it, models share nothing but difficulty. On those data the same estimator reports about 1.15 for every fifth of pairs. On MMLU-Pro it reports about 1.2 to 1.4, because there the strongest pairs' weight sits most heavily in the hardest group.

{{ layer(n=3, type="Estimate", id="against-null") }}Against that null the results sharpen. The strongest fifth sit above it on all three benchmarks, clearly on GPQA (1.81 against a null of 1.10 to 1.21) and MMLU-Pro (1.84 against 1.26 to 1.49), and only just on MMLU. The middle fifths sit at or below it: mid-range models share less than a difficulty-only model predicts.

{{ layer(n=3, type="Estimate", id="label-noise") }}A residual among the strongest could also be label noise. A question whose official answer is wrong makes every strong model fail together, and such questions sit among the hardest. Dropping the hardest fifth of questions leaves the strongest fifth's ratio at 1.30, 1.86 and 2.43, while the null falls to about 1.12 to 1.21. The artifact would shrink as hard questions go, and the observed residual grows. The shared mistakes that survive fall on questions most other models answer correctly, which is what a shared blind spot looks like and what a mislabeled hard question does not.

{{ layer(n=2, type="Fit", id="weakest-residual") }}The weakest fifth show a smaller residual of their own on GPQA and MMLU-Pro, 1.36 and 1.16. Shared answering habits, such as a preferred option letter, could produce it, and the counts cannot say which.

<div style="margin:1.5em 0;">
<canvas id="chart-correlation" role="img" aria-label="Odds that two language models make the same mistake, against independent errors, by fifth of model pairs ordered by accuracy, on three benchmarks from Stanford HELM. MMLU, all questions: 1.84, 7.65, 9.22, 10.77, 13.38; questions of similar difficulty: 1.08, 1.09, 1.04, 1.00, 1.25. GPQA, all questions: 2.65, 2.96, 3.08, 4.62, 9.11; questions of similar difficulty: 1.36, 1.01, 0.82, 0.90, 1.81. MMLU-Pro, all questions: 3.88, 5.98, 7.87, 10.67, 18.73; questions of similar difficulty: 1.16, 1.05, 0.91, 1.04, 1.84." style="width:100%;height:340px;display:block;"></canvas>
<figcaption>What stronger models share. The better two models are, the likelier they make the same mistake: for the strongest fifth of pairs the odds are 13, 9 and 19 times those of independent errors on three benchmarks. Compared on questions of similar difficulty, the grey lines, most of that disappears: hard questions are hard for every model. What remains for the strongest pairs, 1.2 to 1.8 times, is blind spots of their own.</figcaption>
<script>
(function(){var S={"id":"chart-correlation","h":340,"ml":[36,44],"mr":[62,74],"mt":24,"mb":42,"els":[{"t":"hline","y":1.0,"c":"g","w":1,"dash":true},{"t":"line","pts":[[1,1.08],[2,1.09],[3,1.04],[4,1.0],[5,1.25]],"c":"g","w":1.5,"dash":true,"mk":2.5},{"t":"line","pts":[[1,1.84],[2,7.65],[3,9.22],[4,10.77],[5,13.38]],"c":"b","w":2.5,"mk":3.5},{"t":"txt","x":5,"y":13.38,"s":"MMLU","n":"MMLU","al":"left","bl":"middle","dx":8,"c":"b","b":true},{"t":"line","pts":[[1,1.36],[2,1.01],[3,0.82],[4,0.9],[5,1.81]],"c":"g","w":1.5,"dash":true,"mk":2.5},{"t":"line","pts":[[1,2.65],[2,2.96],[3,3.08],[4,4.62],[5,9.11]],"c":"a","w":2.5,"mk":3.5},{"t":"txt","x":5,"y":9.11,"s":"GPQA","n":"GPQA","al":"left","bl":"middle","dx":8,"c":"a","b":true},{"t":"line","pts":[[1,1.16],[2,1.05],[3,0.91],[4,1.04],[5,1.84]],"c":"g","w":1.5,"dash":true,"mk":2.5},{"t":"line","pts":[[1,3.88],[2,5.98],[3,7.87],[4,10.67],[5,18.73]],"c":"c","w":2.5,"mk":3.5},{"t":"txt","x":5,"y":18.73,"s":"MMLU-Pro","n":"MMLU-Pro","al":"left","bl":"middle","dx":8,"c":"c","b":true},{"t":"txt","x":0.8,"y":2.2,"s":"grey: compared on questions of similar difficulty","n":"grey: same difficulty","al":"left","bl":"bottom","c":"g"}],"X":{"lo":0.7,"hi":5.3,"ticks":[[1,"weakest"],[2,"2nd"],[3,"3rd"],[4,"4th"],[5,"strongest"]],"title":"fifth of model pairs, by accuracy","ntitle":"fifth of pairs"},"Y":{"lo":0.0,"hi":20,"ticks":[[0,"0"],[5,"5"],[10,"10"],[15,"15"],[20,"20"]],"title":"odds the two models share a mistake, against independent errors","ntitle":"odds of a shared mistake"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=2, type="Fit", id="which-correlation-matters") }}Both results matter, for different questions. For a panel that faces a stream of questions, some easy and some hard, the pooled dependence sets its floor. In the model, the floor is the share of questions on which a typical member's chance of error exceeds one half. On those a large majority locks onto a wrong answer, and no vote rescues them. For the question of whether models share blind spots beyond difficulty, the within-difficulty ratio, read against its null, answers. For most pairs they do not. For the strongest they do.

{{ layer(n=2, type="Fit", id="one-factor-check") }}The same measurement tests an assumption of the earlier post. Definition 1 gave reviewers' errors one shared factor and nothing else; in that model, how often the other models fail a question estimates the factor, and errors are independent once it is fixed. For the middle of the range the data are consistent with that, even below the null. For the strongest pairs they are not: those pairs share a second factor, a common blind spot that difficulty does not capture. An item-response model with a discrimination per question would refine the null, and a residual that survives this one on three benchmarks is unlikely to vanish.

{{ layer(n=1, type="Bound", id="prior-measurements") }}The direction was reported before, in other measures. Kim and coauthors studied errors across many models and providers and found that models agree on about 60% of the questions where both are wrong, with more accurate models more correlated even across architectures and providers{{ cite(ref="10", title="Kim, E. and coauthors (2025) -- Correlated Errors in Large Language Models, ICML 2025") }}. Goel and coauthors built a similarity measure that adjusts for accuracy and found that model mistakes grow more similar as capability rises{{ cite(ref="11", title="Goel, S. and coauthors (2025) -- Great Models Think Alike and this Undermines AI Oversight, ICML 2025") }}. Neither separates difficulty question by question. Hossain, Yousefi and Lim measured the same pattern among judges of preference tasks: ten open models carried the information of about 3.5 independent judges, two runs of one model with different seeds correlated at 0.36 to 0.39, and frontier judges from different providers correlated at 0.42, the most of any pairs{{ cite(ref="12", title="Hossain, E., Yousefi, N. and Lim, S.-N. (2026) -- Agreement Overstates Evidence: Error Dependence in LLM Judge Consensus, arXiv:2609.22512") }}. They also conditioned on item difficulty, measured from the judges' own votes, and found that shared difficulty explains part, but not all, of the dependence.

{{ layer(n=2, type="Fit", id="what-this-measurement-adds") }}The measurement here reaches the same partial answer by a stricter route. Each pair's difficulty groups are set by the other models, so the pair's own answers do not define them. The result is read against an item-response null in which models share nothing but difficulty. And the residual is tested by removing the hardest questions, where mislabeled answers would sit. It locates the similarity: mostly in which questions are hard, and among the strongest models, partly in shared blind spots that grow when the hardest questions go.

{{ layer(n=1, type="Bound", id="two-votes") }}Panels of frontier judges show the consequence. Kohli tested nine frontier models from seven families as judges on three inference datasets. The nine provided "only about 2 independent votes' worth of information", and the best single judge matched or beat the full panel{{ cite(ref="13", title="Kohli, G. (2026) -- Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels, arXiv:2605.29800") }}. That is a different panel, task and estimator, and it lands where the vote correlation here lands on all three benchmarks: about two opinions.

## What Voting Buys Among Strong Models

{{ layer(n=2, type="Fit", id="tiers-defined") }}The measured models can be arranged as panels. The floor needs members wrong less than half the time. The analysis therefore keeps the 84 MMLU models above 50% accuracy and splits them by accuracy into four tiers of 21. Keeping only those models truncates the joint spread of capability and agreement. Each model is also scored from a single run, which cannot separate a model's fixed blind spots from the variation between runs. Each tier is a panel: its members' mean error, and the mean latent correlation over the pairs inside it.

{{ layer(n=3, type="Estimate", id="what-voting-buys") }}A large majority of the strongest tier errs at 22%, against its members' 25%: voting removes about a tenth of the error. An average of that tier's votes can hold at most 1.83 independent opinions, the limit as the panel grows. That count describes how soon averaging the tier's votes stops reducing their spread, and it leaves the error of the tier's majority to the floor, 22%.

{{ layer(n=1, type="Bound", id="plurality-caveat") }}One caution applies to the questions themselves. MMLU offers four choices, and the floor counts a panel wrong whenever most members are wrong, in any way. A plurality vote can still pick the right answer when the wrong answers split, so for multiple-choice questions the floor is an upper bound on a plurality vote's error. The bound is exact when the errors pile onto one tempting wrong answer, and when the decision has only two options. A design review's adopt-or-reject is the second case, so there the floor is the floor.

{{ layer(n=1, type="Bound", id="voting-rarely-beats-best") }}Other measurements agree on the scale. Kim audited majority voting over 30 models on MMLU-Pro and found that simple voting beat the strongest member in only 9.98% of panels of three{{ cite(ref="14", title="Kim, D. (2026) -- Are Diversity Metrics Measuring Diversity? A Capability-Controlled Audit of Majority-Vote Gain in LLM Ensembles, arXiv:2607.20768") }}. The floor of Proposition 1 says why: no number of correlated members passes it.

{{ layer(n=1, type="Bound", id="credit-risk-parallel") }}Credit risk met the same pattern twenty years earlier. Lopez estimated asset correlations across firms and found them higher for firms with lower default probabilities: the better the borrower, the more its fate moves with the economy{{ cite(ref="15", title="Lopez, J.A. (2004) -- The Empirical Relationship between Average Asset Correlation, Firm Probability of Default, and Asset Size, Journal of Financial Intermediation 13(2)") }}. The finding went into how bank capital rules set correlation. A good borrower defaults mainly in a recession, and a strong model errs mainly on a hard question. In both, quality concentrates what is left of the risk on the common factor.

{{ layer(n=2, type="Fit", id="cross-family-not-enough") }}This bears on the remedy [The Familiarity Bias](@/blog/2026-07-15/index.md) chose. Its Definition 2 draws a panel's variants "from multiple model families whenever more than one is deployed", because personas of one model share its weights. The tiers here mix providers, and their dependence is still high. Crossing families removes dependence that comes from shared weights. It does not change which questions are hard, and among the strongest models it does not remove the blind spots they share.

## The Open Question: Cascades Among Correlated Peers

{{ layer(n=1, type="Bound", id="open-question") }}[Optimization and the Ceiling No Retry Can Raise](@/blog/2026-09-05/index.md) left a question open. It described networks of agents converging together on escalation. Each was "reading confidence off the others rather than off its own independent signal, plausibly an information cascade or Bayesian herding effect", and the series "has no formal result pinning down which mechanism is doing the work there". The model of this series can say what a cascade among correlated peers does, and how it compares with no cascade at all. Whether that is what drove the escalation it described is a separate question, which this post leaves open.

{{ layer(n=2, type="Fit", id="correlated-cascade-model") }}Proposition 2 of the earlier post assumed independent signals. With correlated signals, each member still treats the others' signals as independent, as the classic rule does, while the signals actually share a factor. The fair comparison is a panel of the same members voting at once, blind, so that nobody sees anyone else's answer.

{{ layer(n=3, type="Estimate", id="correlated-cascade-numbers") }}With signals right 70% of the time and independent, a sequence of thirty ends in a wrong cascade 16% of the time. A blind majority of the same thirty is wrong 2% of the time. Herding costs a great deal. At a latent correlation of 0.75, the pooled level measured among the strongest models (their right-or-wrong correlation is about 0.5), the sequence and the blind majority are both wrong 28% of the time. The large-panel floor is 27%.

{{ layer(n=3, type="Estimate", id="probing-at-correlation") }}The tie does not depend on the classic rule, which real agents need not follow. Members who put a weight on informing those after them herd less, and among independent signals a strong weight cuts wrong cascades from 16% to 3%. At that latent correlation every rule from myopic to strongly probing lands within two points of the blind vote.

{{ layer(n=3, type="Estimate", id="tie-is-a-cancellation") }}The tie is a cancellation, not an absence of effect. Sort the trials by how far the shared factor misleads. On questions that are hard but not misleading, where most members are still right, the sequence errs 26% of the time and the blind vote 15%: herding still costs accuracy there. On misleading questions, where most members are wrong, the blind vote errs 88% of the time and the sequence 72%, because an early run of right signals sometimes locks the sequence onto the truth. Those two slices hold about a quarter of the questions between them. On the deeply misleading sixth both are almost always wrong, and on the easy majority the blind vote almost never errs while the sequence errs 1% of the time, from early wrong runs. Weighted by how often each slice occurs, the costs and the luck offset to within a fraction of a point. Herding at high correlation trades accuracy on hard and easy questions for luck on misleading ones.

{{ layer(n=1, type="Bound", id="wikipedia-cascades") }}Field data from people point the same way. Chen, Zheng and Zhu read 198,275 voting rationales from Wikipedia's administrator elections. Later voters gave thinner, more deferential reasons, and the evidence already posted explained it better than arrival order did; yet the elections those votes shaped did not pick worse administrators{{ cite(ref="16", title="Chen, Z., Zheng, L.N. and Zhu, D. (2026) -- Endorsement Without New Evidence: How Sequential Voting Inflates Mandates in Online Community Governance, arXiv:2609.09321") }}. A sequence can drain a vote of independent information without changing the verdict, which is what the model predicts when the voters already agree for shared reasons.

{{ layer(n=2, type="Fit", id="answer-to-open-question") }}So the model gives a sharper answer to the open question than the question asked for. When agents' signals are nearly independent, herding is what makes a crowd wrong, and an independent first round is the remedy. When their signals are as dependent as strong models' errors are across a mix of questions, the crowd is wrong together whether or not it herds. No change to how it votes helps much then. Which mechanism drove a particular escalation then matters less than it seemed. A shared hard case produces the same outcome either way, and only a member who finds that case easy changes it.

## Mixed Panels: The Informed Minority, Diluted

{{ layer(n=2, type="Fit", id="mixed-question") }}A mixed panel of people and agents is the configuration most organizations are moving to. Agents bring breadth and cheap opinions that share blind spots. People bring local knowledge, the facts about this system, this team and this incident that no training corpus held. A local fact is something like a storage tier that loses acknowledged writes when one region fails over before another, recorded in one postmortem and nowhere else. A general trade-off is whether a cache should write through or write back for a given mix of reads and writes, which the agents' training covers well. The question is how to combine them, and when the agents help.

{{ layer(n=1, type="Bound", id="surprisingly-popular") }}Prelec, Seung and McCoy proposed a rule for crowds with an informed minority{{ cite(ref="17", title="Prelec, D., Seung, H.S. and McCoy, J. (2017) -- A Solution to the Single-Question Crowd Wisdom Problem, Nature 541") }}. Each member gives an answer and predicts how the others will answer, and the rule picks the answer that is more popular than predicted. When most members share a misconception, they also predict that most will share it. The minority who know better answer against it, and their answer turns out more common than the crowd expected.

{{ layer(n=1, type="Bound", id="sp-fails-for-models") }}The rule fails in crowds made only of models. Denisov-Blanch and six coauthors tested crowd-wisdom strategies on language models and found that consensus, including surprisingly-popular aggregation, does not verify truthfulness when the models share their errors{{ cite(ref="18", title="Denisov-Blanch, Y. and coauthors (2026) -- Consensus is Not Verification: Why Crowd Wisdom Strategies Fail for LLM Truthfulness, arXiv:2603.06612") }}. The rule needs a minority that holds private knowledge the majority lacks. A crowd of models trained on overlapping data has no such minority.

{{ layer(n=2, type="Fit", id="mixed-model") }}A mixed panel can supply the minority, and the test runs on both states of the world, as Definition 3 of the earlier post requires. The model takes twenty agents and five people. Two in five of the people hold the local fact and answer it; the rest favor the successor one time in five. The agents favor the successor 30% of the time when they cannot see the fact, correlated at 0.3 or 0.6, and a knob gives them some of it. At the knob's zero the agents answer the same way in both worlds; above zero, their chance of favoring the successor differs between the worlds by the knob's value.

{{ layer(n=3, type="Estimate", id="dilution") }}With blind-spotted agents correlated at 0.6, the surprisingly-popular rule, each member predicting the crowd from their own answer as the rule specifies, adopts the successor 55% of the time when the local fact favors it and 41% when the fact opposes it. A plain threshold at the share an uninformed crowd would give does about the same, 50% and 40%. The five people deciding alone adopt 53% of the time when the fact favors the successor and 1% when it opposes it. The people carry all the information about the local fact, and the panel dilutes it.

{{ layer(n=2, type="Fit", id="common-mode") }}The structural reason is unweighted pooling under correlated errors. The twenty agents carry no information about the local fact, yet their answers swing together with their shared factor, and those swings fill most of the panel. Even when a minority of people holds the local fact, an unweighted rule dilutes it whenever the agents' common swing is large enough to move the tally or the prediction. Each agent's own answer moves its prediction of the others, but less than the panel's share actually moves, so the surprisingly-popular rule still fires on a favorable swing. Weighting fixes this by construction. A rule that discounts members by their measured reliability returns the people's discrimination, and so does one that conditions on where a claim comes from or routes the local question to the people who hold the fact. The result is about unweighted pooling, not about dividing work between them, and for a large panel it can be stated exactly.

{{ layer(n=2, type="Fit", id="dilution-exact") }}The swing can be made exact. Let the panel grow while keeping its proportions, so that the agents' share of answers settles on what their shared factor dictates and the people's share settles on its average. What is left to chance is the shared factor alone.

<span id="prop-6"></span>
<details>
<summary>Proposition 6 -- Common-Mode Dilution: in a large unweighted panel, agents that share a blind spot set the chance of adopting a worse design, whatever the people know</summary>

**Proposition 6** (Common-Mode Dilution). *Let a panel hold {% katex() %}n{% end %} agents and {% katex() %}\nu n{% end %} people, {% katex() %}\nu \ge 0{% end %}. Each agent answers for the successor with probability {% katex() %}y_0 \in (0, 1){% end %} whatever the truth, and the agents' answers share one latent factor at correlation {% katex() %}\rho \in (0, 1){% end %}, as in Proposition 1. Each person independently holds the local fact with probability {% katex() %}\beta{% end %} and then answers the truth, and otherwise answers independently of it. The panel adopts the successor when the share answering for it exceeds the share expected when the successor is worse. As {% katex() %}n{% end %} grows:*

*(i) the probability of adopting a worse design tends to*

{% katex(block=true) %}
A_- \to \Phi\!\left(\Phi^{-1}(y_0)\,\frac{1 - \sqrt{1-\rho}}{\sqrt{\rho}}\right),
{% end %}

*which, for {% katex() %}y_0 \ne 1/2{% end %}, lies strictly between {% katex() %}y_0{% end %} and {% katex() %}1/2{% end %}, moves from {% katex() %}1/2{% end %} toward {% katex() %}y_0{% end %} as {% katex() %}\rho{% end %} rises, and depends on neither {% katex() %}\nu{% end %} nor {% katex() %}\beta{% end %};*

*(ii) the probability of adopting a better design tends to {% katex() %}\Phi\big((\Phi^{-1}(y_0) - \sqrt{1-\rho}\,\Phi^{-1}(y_0 - \nu\beta))/\sqrt{\rho}\big){% end %} when {% katex() %}\nu\beta < y_0{% end %}, and to 1 otherwise;*

*(iii) the gap between them satisfies*

{% katex(block=true) %}
A_+ - A_- \le \sqrt{\frac{1-\rho}{2\pi\rho}}\,\Big(\Phi^{-1}(y_0) - \Phi^{-1}(y_0 - \nu\beta)\Big).
{% end %}

*Proof.* Condition on the agents' shared factor {% katex() %}g{% end %}. Given {% katex() %}g{% end %}, the agents answer independently, each for the successor with probability {% katex() %}a(g) = \Phi\big((\sqrt{\rho}\,g + \Phi^{-1}(y_0))/\sqrt{1-\rho}\big){% end %}, so by the strong law their share tends to {% katex() %}a(g){% end %}. The people's answers are independent of {% katex() %}g{% end %} and of each other, so their share tends to its mean, {% katex() %}\mu_w = \beta w + (1-\beta)u{% end %} in world {% katex() %}w \in \{0, 1\}{% end %}, with {% katex() %}u{% end %} an uninformed person's rate. The panel's share therefore tends to {% katex() %}(a(g) + \nu\mu_w)/(1+\nu){% end %} and the threshold is {% katex() %}(y_0 + \nu\mu_0)/(1+\nu){% end %}, so in the limit the panel adopts exactly when {% katex() %}a(g) > c_w = y_0 - \nu\beta w{% end %}. The event {% katex() %}a(g) = c_w{% end %} has probability zero, because {% katex() %}a{% end %} is strictly increasing in {% katex() %}g{% end %}, so by dominated convergence the adoption probability tends to {% katex() %}\Pr(a(g) > c_w) = \Phi\big((\Phi^{-1}(y_0) - \sqrt{1-\rho}\,\Phi^{-1}(c_w))/\sqrt{\rho}\big){% end %} for {% katex() %}c_w \in (0, 1){% end %}, and to 1 for {% katex() %}c_w \le 0{% end %}. A worse design is world 0, where {% katex() %}c_0 = y_0{% end %}, which gives (i). Its factor equals {% katex() %}\sqrt{\rho}/(1 + \sqrt{1-\rho}){% end %}, which lies in {% katex() %}(0, 1){% end %} and rises with {% katex() %}\rho{% end %}, and neither {% katex() %}\nu{% end %} nor {% katex() %}\beta{% end %} appears in it. A better design is world 1, where {% katex() %}c_1 = y_0 - \nu\beta{% end %}, which gives (ii). For (iii), the two arguments of {% katex() %}\Phi{% end %} differ by {% katex() %}\sqrt{1-\rho}\,(\Phi^{-1}(y_0) - \Phi^{-1}(c_1))/\sqrt{\rho}{% end %}, and the standard normal density never exceeds {% katex() %}1/\sqrt{2\pi}{% end %}. ∎

</details>

{{ layer(n=3, type="Estimate", id="dilution-exact-numbers") }}Take the case's proportions: a quarter of a person per agent, with two in five of the people informed. At a correlation of 0.6 the limit gives 50% and 40%, the same as the simulated panel of twenty agents and five people. The gap is 10 points, and the bound allows at most 10. At a correlation of 0.3 the limit gives 63% and 44%. Doubling the people, to half a person per agent, raises adoption of a better design to 64% at 0.6. Adoption of a worse one stays at 40%, exactly as part (i) says.

{{ layer(n=2, type="Fit", id="dilution-meaning") }}The proposition locates the failure precisely. The rule is set where nothing is happening: it adopts when the panel looks more favorable than it would if the successor were worse. When the successor is worse, the people answer exactly as that expectation assumed, and the panel sits on the threshold's edge. What decides is the agents' shared mood on the day, a coin tilted only slightly toward the status quo. No number of informed people tilts it further, because informed people change their answers only when the successor is better. Knowledge can lift a better design; only independence protects against a worse one. The gap the people can open shrinks as the agents' correlation grows, which is why the remedy is weighting by measured reliability and not more people.

> **Physical translation.** Set an alarm to sound when a room is louder than a quiet room usually is, then put twenty radios in it tuned to one station. The alarm now sounds whenever the station plays something loud. The five people who saw the fire can make it sound a little more often when there is one, but nothing they know stops the radios from setting it off when there is none.

{{ layer(n=3, type="Estimate", id="dilution-energy") }}The machines also spend energy differently. An agent's opinion costs the agent nothing, and the people pay for it. Put twenty agents into the first post's meeting as voters, holding opinions only as often as the people do, and every pair of holders still has to be reconciled. The expected settlements for a design reviewed whole rise from about 4 to about 24, and for each piece of a design in four pieces from 34 to 190. Proposition 6 says what those settlements buy against a worse design: nothing. Machine opinions are free to produce and expensive to read.

{{ layer(n=3, type="Estimate", id="agents-help") }}Agents start to help once their answers carry some of the fact. Pool the whole panel at the midpoint between the two worlds' expected shares, and compare its gap with the people's own, 0.52. The panel overtakes the people once the agents' answers differ between the worlds by 20 to 30 points, at a correlation of 0.3. At a correlation of 0.6 they must differ by 30 to 40 points. More dependent agents need more information before they add anything.

{{ layer(n=2, type="Fit", id="division-of-labor") }}The division of labor this suggests is less flattering to aggregation than the rule's promise, and more useful. For a question that turns on a local fact, the people who hold it are the panel until the agents can be shown to carry part of it. That can be measured: run the agents on past local questions whose answers are known, and compare their answers across the two kinds. Agents whose answers do not move with the fact are a blind spot, however many there are.

## When an Upgrade Makes the Panel Worse

{{ layer(n=2, type="Fit", id="upgrade-question") }}The measured dependence rises with capability, so an upgrade does two things to a panel at once. Each member errs less, which lowers the floor. The members' remaining errors crowd onto the same questions, which raises it. Which effect wins is a question Proposition 1 answers exactly.

<span id="def-4"></span>
<details>
<summary>Definition 4 -- Upgrade Path: a sequence of panels whose members' error and correlation change together</summary>

**Definition 4** (Upgrade Path). *An upgrade path is a sequence of panel compositions {% katex() %}(p_0, \rho_0), (p_1, \rho_1), \dots{% end %}, each the common error probability {% katex() %}p_t < 1/2{% end %} and latent error correlation {% katex() %}\rho_t \in (0, 1]{% end %} of a large panel whose members are all replaced at step {% katex() %}t{% end %}. The margin of the step from {% katex() %}t{% end %} to {% katex() %}t+1{% end %} is*

{% katex(block=true) %}
m_t = \Big(\ln\big|\Phi^{-1}(p_{t+1})\big| - \tfrac{1}{2}\ln \rho_{t+1}\Big) - \Big(\ln\big|\Phi^{-1}(p_t)\big| - \tfrac{1}{2}\ln \rho_t\Big)
{% end %}

</details>

<span id="prop-5"></span>
<details>
<summary>Proposition 5 -- The Upgrade Condition: replacing every member improves a large panel if and only if the margin is positive</summary>

**Proposition 5** (The Upgrade Condition). *Along an upgrade path, the step from {% katex() %}t{% end %} to {% katex() %}t+1{% end %} lowers the large-panel error {% katex() %}P_{\text{floor}}{% end %} of Proposition 1 if and only if {% katex() %}m_t > 0{% end %}. In particular, an upgrade that lowers every member's error raises the panel's error whenever the correlation rises by more than the factor {% katex() %}\big(\Phi^{-1}(p_{t+1})/\Phi^{-1}(p_t)\big)^2{% end %}.*

*Proof.* Since {% katex() %}p < 1/2{% end %}, {% katex() %}P_{\text{floor}} = \Phi\big(-|\Phi^{-1}(p)|/\sqrt{\rho}\big){% end %}, and {% katex() %}\Phi{% end %} is strictly increasing, so the floor falls exactly when {% katex() %}\ln|\Phi^{-1}(p)| - \tfrac{1}{2}\ln\rho{% end %} rises, that is when {% katex() %}m_t > 0{% end %}. Setting {% katex() %}m_t < 0{% end %} and exponentiating gives the factor. ∎

</details>

<span id="cor-1"></span>
<details>
<summary>Corollary 1 -- The Critical Elasticity: how fast correlation may rise as error falls, and why the room shrinks as members improve</summary>

**Corollary 1** (The Critical Elasticity). *Let error and correlation move together smoothly along a path, with {% katex() %}\varepsilon = -\,d\ln\rho/d\ln p{% end %} the elasticity of correlation with respect to error. A small upgrade from error {% katex() %}p{% end %} improves a large panel if and only if {% katex() %}\varepsilon < \varepsilon^\ast(p){% end %}, where*

{% katex(block=true) %}
\varepsilon^\ast(p) = \frac{2p}{|z|\,\Phi'(z)}, \qquad z = \Phi^{-1}(p)
{% end %}

*and {% katex() %}\Phi'{% end %} is the standard normal density, the derivative of {% katex() %}\Phi{% end %}. The critical elasticity rises with {% katex() %}p{% end %} on {% katex() %}(0, 1/2){% end %}, and {% katex() %}\varepsilon^\ast(p) \sim 2/z^2 \to 0{% end %} as {% katex() %}p \to 0{% end %}: the better the members, the less correlation growth an upgrade can absorb.*

*Proof.* Write {% katex() %}u = |z|{% end %}, so {% katex() %}p = \Phi(-u){% end %} and {% katex() %}dp = -\Phi'(u)\,du{% end %}. Then {% katex() %}d\ln u / d\ln p = -p/(u\,\Phi'(u)){% end %}. By Proposition 5 the floor falls when {% katex() %}d\ln u > \tfrac{1}{2} d\ln\rho = -\tfrac{1}{2}\varepsilon\, d\ln p{% end %}. For an upgrade {% katex() %}d\ln p = -|d\ln p|{% end %}, so the left side is {% katex() %}\big(p/(u\,\Phi'(u))\big)|d\ln p|{% end %} and the right side is {% katex() %}\tfrac{1}{2}\varepsilon\,|d\ln p|{% end %}; cancelling {% katex() %}|d\ln p|{% end %} gives {% katex() %}p/(u\,\Phi'(u)) > \varepsilon/2{% end %}. For the shape, {% katex() %}\varepsilon^\ast = 2R(u)/u{% end %} with {% katex() %}R(u) = \Phi(-u)/\Phi'(u){% end %} the Mills ratio, which decreases in {% katex() %}u{% end %}; so {% katex() %}\varepsilon^\ast{% end %} decreases in {% katex() %}u{% end %} and increases in {% katex() %}p{% end %}. As {% katex() %}u \to \infty{% end %}, {% katex() %}R(u) \sim 1/u{% end %}, so {% katex() %}\varepsilon^\ast \sim 2/u^2{% end %}. ∎

</details>

{{ layer(n=3, type="Estimate", id="synthetic-path") }}A path chosen to show the effect makes it concrete. Start with members wrong 30% of the time and correlated at 0.10, and upgrade twice, to 20% error at a correlation of 0.35. Each member now errs a third less often, and the panel's floor rises from 4.9% to 7.7%. On each step of the path, the panel worsens exactly where the elasticity exceeds the critical one, and improves where it falls below.

> **Physical translation.** A crew of lookouts who each miss one ship in three, posted on different headlands, almost never all miss the same ship. Replace them with sharper-eyed lookouts who miss one in five, all posted on one tower behind the same fog bank. Each sees better, and the crew now misses together whenever the fog is thick.

{{ layer(n=3, type="Estimate", id="measured-elasticity") }}The measured MMLU tiers sit far from the boundary. Between the two strongest tiers, error falls by 22% while the pooled correlation barely moves: the elasticity is 0.02 against a critical value of 2.81. Every measured upgrade improves the panel. The corollary says the room shrinks as members improve, and one bound qualifies the warning. Correlation cannot exceed 1, so along any path where error falls toward zero the realized elasticity must fall toward zero too, and the floor can never exceed a member's own error. The danger is a path on which correlation keeps climbing while it still has room, faster than the shrinking critical value allows. The corollary also assumes one shared factor. Among the strongest pairs, which share a second one, it is an idealized reading rather than an exact law.

{{ layer(n=1, type="Bound", id="curves-of-equal-floor") }}The corollary has a geometric reading. Along a curve of equal floor, {% katex() %}\Phi^{-1}(p)/\sqrt{\rho}{% end %} stays constant, so {% katex() %}\ln\rho = 2\ln|z| + \text{const}{% end %} with {% katex() %}z = \Phi^{-1}(p){% end %}. Differentiating, {% katex() %}-\,d\ln\rho/d\ln p = 2p/(|z|\,\Phi'(z)){% end %}, which is {% katex() %}\varepsilon^\ast(p){% end %}. Drawn on log scales, a curve of equal floor is exactly as steep as the critical elasticity, and an upgrade helps a large panel when it ends on a lower curve.

<div style="margin:1.5em 0;">
<canvas id="chart-upgrade" role="img" aria-label="For four tiers of measured models, weakest to strongest: how often one model is wrong, 44%, 37%, 31%, 25%; how often a large panel of them is wrong, 43%, 35%, 29%, 22%; and how alike their mistakes are, a latent correlation of 0.68, 0.75, 0.78, 0.78." style="width:100%;height:320px;display:block;"></canvas>
<figcaption>Where an upgrade takes a panel. Stronger models are wrong less often, and so is a large panel of them: every measured upgrade lowered both. The shaded gap is all that voting buys, and it stays thin, because the models' mistakes grow more alike as they improve, from 0.68 to 0.78. A large panel of the strongest tier is wrong on 22% of questions, one of its models on 25%.</figcaption>
<script>
(function(){var S={"id":"chart-upgrade","h":320,"ml":[40,48],"mr":[120,170],"mt":24,"mb":42,"els":[{"t":"band","pts":[[1,0.432,0.444],[2,0.3486,0.3678],[3,0.2921,0.3149],[4,0.2172,0.2451]],"c":"b","al":0.12},{"t":"line","pts":[[1,0.444],[2,0.3678],[3,0.3149],[4,0.2451]],"c":"g","w":2.5,"mk":3.5},{"t":"line","pts":[[1,0.432],[2,0.3486],[3,0.2921],[4,0.2172]],"c":"b","w":2.5,"mk":3.5},{"t":"txt","x":4,"y":0.2451,"s":"one model","al":"left","bl":"bottom","dx":8,"dy":-2,"c":"g","b":true},{"t":"txt","x":4,"y":0.2172,"s":"a large panel of them","n":"large panel","al":"left","bl":"top","dx":8,"dy":2,"c":"b","b":true},{"t":"txt","x":1,"y":0.444,"s":"mistakes alike: 0.68","n":"0.68","al":"center","bl":"bottom","dy":-10,"c":"sub"},{"t":"txt","x":2,"y":0.3678,"s":"mistakes alike: 0.75","n":"0.75","al":"center","bl":"bottom","dy":-10,"c":"sub"},{"t":"txt","x":3,"y":0.3149,"s":"mistakes alike: 0.78","n":"0.78","al":"center","bl":"bottom","dy":-10,"c":"sub"},{"t":"txt","x":4,"y":0.2451,"s":"mistakes alike: 0.78","n":"0.78","al":"center","bl":"bottom","dy":-10,"c":"sub"}],"X":{"lo":0.7,"hi":4.3,"ticks":[[1,"weakest"],[2,"2nd"],[3,"3rd"],[4,"strongest"]],"title":"tier of measured models, by accuracy","ntitle":"tier"},"Y":{"lo":0.0,"hi":0.5,"ticks":[[0.0,"0%"],[0.1,"10%"],[0.2,"20%"],[0.3,"30%"],[0.4,"40%"],[0.5,"50%"]],"title":"questions answered wrong","ntitle":"wrong"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=2, type="Fit", id="human-teams-too") }}The condition is not about models. It applies to any team whose members improve together. A company that raises its hiring bar by recruiting from the same three programs is moving along an upgrade path. Each hire is stronger, and the team's hard cases become the same hard cases. Hong and Page showed in a model of problem solvers that a group of diverse, less able agents can outperform a group of the most able ones, because the most able tend to be alike{{ cite(ref="19", title="Hong, L. and Page, S.E. (2004) -- Groups of Diverse Problem Solvers Can Outperform Groups of High-Ability Problem Solvers, PNAS 101(46)") }}. Proposition 5 and its corollary state the trade in the unit a voting panel uses, with an exact boundary that tightens as the members get better.

## Scaling the Panel, the Chain and the Gates

{{ layer(n=1, type="Bound", id="scaling-n") }}Each stage of the pipeline scales differently as an agent system grows. Panel size is the simplest. Adding agents is cheap, and the earlier post's bound says why it rarely helps. No equal-weight average of votes carries more than {% katex() %}1/r_v{% end %} independent opinions, about two for strong models, and no majority errs less than the floor. [One Equation Governs CPU Caches, Human Teams, and AI Agent Systems](@/blog/2026-04-24/index.md#prop-1) found a ceiling on team size from coordination cost, {% katex() %}N_{\max} = \sqrt{(1-\alpha)/\kappa_{\text{coh}}}{% end %}, past which throughput falls. The correlation ceiling is a second ceiling, on information rather than throughput, and a panel of strong models gets most of it from its first few members.

{{ layer(n=1, type="Bound", id="scaling-d") }}Chain depth scales worst. Each hand-off keeps a share {% katex() %}a{% end %} of the signal's amplitude and {% katex() %}a^2{% end %} of its signal-to-noise ratio, so a chain of {% katex() %}d{% end %} agents that each summarize for the next keeps {% katex() %}a^{2d}{% end %}. Agent pipelines are often deeper than human reporting chains, because adding a summarizing step costs one call. Six summarizers at a candor of 0.85 keep about a seventh of the signal-to-noise ratio the first stage had.

{{ layer(n=1, type="Bound", id="scaling-v") }}Gates scale toward the cliff. The convex hull of a set of ideal points contains the hull of every subset, so adding a gate can only enlarge it. By Proposition 3 of the earlier post, an added gate can close an open win-set and never opens a closed one. Automated guardrails are cheap to add, and each one is a gate with an ideal point. A system that adds a guardrail after every incident is moving its status quo toward the inside of the hull, one rule at a time.

## Levers, for Agents

{{ layer(n=2, type="Fit", id="levers-for-agents") }}Each lever of the earlier post switches off one force, and each has an agent form. A blind poll for agents is an independent first round: every agent answers before seeing any other's output. The champion lever changes its mechanism in translation. The earlier post insured a person whose career would otherwise keep them silent, so insurance changed whether a well-founded view was heard. An agent has no career to insure. Its nearest form is a designated agent instructed to argue the minority case, with that role fixed in advance, and that injects an argument whether or not the evidence behind it is sound. It still carries the champion's cost. In the earlier post a champion speaking first raised adoption of a worse design from 20% to 38%, so an advocate agent needs a verification step that can reject what it argues. A decorrelated panel is a panel whose members fail on different questions, which for strong models usually means people with local knowledge. A reversible pilot is the same for any reviewer. Stated reasons checked against telemetry are the agent form of checking a postmortem, and Proposition 4 says nothing less will do.

{{ layer(n=1, type="Bound", id="spatial-gate-first") }}Definition 2 of [Correct, and Rejected](@/blog/2026-11-14/index.md#def-2) gives one sequencing rule exactly. While the status quo sits inside the gates' hull, the spatial test is zero, and every lever on sensing, aggregation or hand-off is worth nothing. That holds for an agent pipeline whose gates are guardrails as much as for a committee. Read the gates first.

{{ layer(n=3, type="Estimate", id="single-levers") }}Past the gates, the earlier post's region decides, and it transfers to agents directly. The widest gap there needs a decorrelated panel in every setting tried, and alone it is the lever that widens the gap between adopting better and worse designs most, from 0.52 to 0.58. A blind first round alone makes a review cautious and narrows the gap. A designated advocate alone narrows it too, because an advocate for a worse design argues just as well. Together the two narrow it 0.08 less than their separate effects would.

{{ layer(n=2, type="Fit", id="lever-reading") }}The reading for an agent pipeline follows. Check the gates first, because nothing else matters while they are closed. Then change who is on the panel, because the widest gap never forms without members who fail on different questions. Make the first round blind before appointing any designated advocate, so that the advocate's voice is one input rather than the start of a cascade.

## Reading Your Own Panel

{{ layer(n=2, type="Fit", id="read-correlation") }}For an agent panel, the first reading is the one the agents make easy. Take a set of questions whose answers are known, ideally from the panel's own domain, and log each agent's right or wrong answer. For each pair of agents, count the four outcomes. The reciprocal of the mean vote correlation is the most independent opinions an average of their votes can hold.

{{ layer(n=2, type="Fit", id="read-difficulty") }}Then split the questions into groups by how hard they were for the other agents, and measure the dependence again within each group, pooled with the Mantel-Haenszel estimator. Dependence that survives inside the groups is a shared blind spot, and adding a model from different data may help with it. Dependence that vanishes inside the groups is shared difficulty, and only a member who finds those questions easy will help, which for local questions usually means a person.

{{ layer(n=2, type="Fit", id="read-upgrade") }}Before an upgrade, compute the margin. Measure the current members' error and correlation, and the candidates'. A positive margin means the upgraded panel will do better on the panel's own questions. A negative one means the upgrade is buying member accuracy with panel accuracy, and the panel would be better served by keeping a weaker but different member. Near the top of the accuracy range, check the elasticity against the corollary: the room shrinks there.

{{ layer(n=2, type="Fit", id="read-sequence") }}For a sequential agent pipeline, check whether later agents see earlier agents' outputs before they answer. If the agents' signals are nearly independent, that sequence costs accuracy and a blind first round recovers it. If they are strongly dependent, the sequence costs little and the blind round recovers little. For a mixed panel, find who holds the local fact, let them decide on it, and measure whether the agents' answers move with the fact before adding them.

## Where This Sits Among Known Results

{{ layer(n=1, type="Bound", id="ensemble-diversity") }}Ensemble learning has studied diversity for decades. Kuncheva and Whitaker compared ten measures of diversity among classifiers and found that their relationship to ensemble accuracy is weak and depends on the members' accuracy{{ cite(ref="20", title="Kuncheva, L.I. and Whitaker, C.J. (2003) -- Measures of Diversity in Classifier Ensembles and Their Relationship with the Ensemble Accuracy, Machine Learning 51(2)") }}. That literature knows that accuracy and diversity trade against each other, and recent work on model panels has measured the trade among language models.

{{ layer(n=2, type="Fit", id="what-is-new") }}This post adds four things. The measurement separates question difficulty from shared blind spots, pair by pair, on three benchmarks, against an item-response null, and finds a residual blind spot at the top of the capability range that survives removing the hardest questions. Hossain and coauthors found that difficulty explains only part of judges' dependence; the null and the survival test are what this measurement adds. Proposition 5 and its corollary give an exact boundary for the large-panel case, and show that it tightens as members improve. Proposition 6 makes the dilution of an informed minority exact for a large panel. Adoption of a worse design is set by the agents' shared factor alone, and the gap the people can open shrinks as that factor's correlation grows. And the mixed-panel analysis turns the informed-minority idea into a measurable condition: how much of the local fact the agents must carry before they help. The search for prior statements of the boundary covered ensemble learning, forecast aggregation, credit risk and recent work on model panels. It found the trade-off described in each, and not the condition along an upgrade path.

{{ layer(n=2, type="Fit", id="new-and-borrowed") }}Sorted by origin, the results of this post fall into three groups. Proposition 5, Corollary 1, Proposition 6 and Definition 4 are new as stated, and rest on Proposition 1 of the earlier post, itself Vasicek's limit. Proposition 6 applies that limit's conditioning argument to a panel of agents and people under a threshold rule. The rise of pooled dependence with capability agrees with the measurements of Kim, Goel, Kohli and Hossain and their coauthors. Its decomposition against an item-response null, with the residual's survival test, is this post's measurement; Hossain and coauthors reached the same partial answer with a different measure of difficulty. The cascades among correlated peers, the scaling of each stage and the mixed panels are estimates in this series' model. They are built on the rules of Bikhchandani, Hirshleifer and Welch, of Tsebelis, and of Prelec, Seung and McCoy.

## Falsification Criteria

Each criterion names an observation that would refute this post, with the prediction the model makes for it.

**F10 (stronger models, fewer opinions).**
- *Condition:* per-question results of many models on a new benchmark with known answers.
- *Prediction:* pooled over questions, the odds of a shared mistake rise with the pair's accuracy, an average of the strongest models' votes can hold fewer than 2.5 independent opinions, and within groups of similar difficulty the odds ratio sits at an item-response null except among the strongest pairs, where it stays above it.
- *Refuted if:* the pooled dependence falls with capability on new data, or the within-difficulty residual among the strongest pairs vanishes on a benchmark where the middle of the range shows none.
- *Ground truth and null:* the answer keys of a held-out benchmark, or the verified outcomes of real decisions; the null is the item-response model with one difficulty per question, under which models share nothing but difficulty.

**F11 (the upgrade condition).**
- *Condition:* any upgrade of every member of a panel, with members' error and latent correlation measured before and after.
- *Prediction:* a large panel's error falls if and only if the margin of Proposition 5 is positive, and near the top of the accuracy range smaller rises in correlation suffice to make it negative.
- *Refuted if:* the panel improves on a path with a negative margin, or worsens on one with a positive margin, beyond sampling error.
- *Ground truth and null:* a held-out evaluation set scored before and after the upgrade; the null is the floor computed as if the members' errors were independent.

**F12 (correlation erases the cost of herding).**
- *Condition:* the same members deciding in sequence and in a blind vote, with independent and with correlated signals.
- *Prediction:* the sequence's excess error over the blind vote shrinks as signals correlate; in the model it falls from 14 points with independent signals to nothing at a latent correlation of 0.75.
- *Refuted if:* the sequence's excess error is as large under correlated signals as under independent ones.
- *Ground truth and null:* the answer keys of the questions; the null is the same agents answering blind.

**F13 (the informed minority, diluted).**
- *Condition:* mixed panels of agents and people of whom some hold a local fact, run on questions where the fact favors the successor and where it opposes it, with the agents' sensitivity to the fact measured on past questions.
- *Prediction:* agents whose answers do not move with the fact dilute the people's information under any rule tried; agents whose answers move with it by enough improve on the people alone, and more dependent agents need to move more. In large panels pooled without weights, adoption of a worse design does not fall as more of the people hold the fact.
- *Refuted if:* blind-spotted agents improve on the people alone, informative agents fail to once they move with the fact by more than the predicted amount, or adoption of a worse design in a large unweighted panel falls as more of the people hold the fact.
- *Ground truth and null:* the local fact verified after the decision; the null is the people's own majority.

## The Ledger of a Rejected Design

The series' ledger gains its agent rows. Each names a stage, how its terms change for agents, the law, the lever and the bill.

**Sensors, for agents**

*Belief:* a panel of better models is a better panel.

*Law:* pooled dependence between models' errors rises with capability on three benchmarks; within difficulty it is small except among the strongest, who keep nearly double the odds of a shared mistake. Proposition 5 and Corollary 1: an upgrade helps only while correlation rises slower than a critical elasticity that shrinks as members improve.

*Lever:* members who fail on different questions, which for local questions means people.

*Bill:* an average of the strongest models' votes holds about two independent opinions, and voting removes about a tenth of their error.

**Aggregation, for agents**

*Belief:* agents have no careers, so they speak their minds.

*Law:* conformity measured at about 29% in agent debate, instability at 37%, in one study's setting. At the measured dependence a sequence and a blind vote are wrong almost equally. Proposition 6: in a large unweighted panel, agents that share a blind spot set the chance of adopting a worse design whatever the people know.

*Lever:* an independent first round where signals are independent; for local facts, the informed people deciding until the agents are shown to carry part of the fact.

*Bill:* five partly informed people inside a panel of twenty blind-spotted agents adopt a worse design 41% of the time under the surprisingly-popular rule, and 1% deciding alone.

**Hand-off and actuator, for agents**

*Belief:* automation removes the layers and the gates.

*Law:* a chain of summarizers keeps a share of signal-to-noise ratio that falls as the square of its candor per step; an added gate can close the win-set and never opens it.

*Lever:* fewer summarizing steps; guardrails reviewed for whether they move the status quo inside the hull.

*Bill:* zero adoptions under every lever on sensing, aggregation or hand-off while the status quo sits inside the hull.

## The Review, Replayed

The design review of [Correct, and Rejected](@/blog/2026-11-14/index.md) took ninety minutes and ended with a decision to revisit next quarter. Run it again with everything the series has found attached to it.

The fifteen reviewers came from teams paged by the same incidents, so their errors correlated, and an average of their votes counted as about five independent votes, each carrying less than a score. The first two to speak were not the champion, and the vote went in order, so the meeting settled on its answer after a few voices. The senior architect who had approved the incumbent five years earlier said nothing in the successor's favor. The same architect spoke warmly of the incumbent's record, because the same endorsement that made the first costly made the second cheap. The verdict went to the gates through three summaries and arrived with about 38% of its signal-to-noise ratio.

None of that decided the outcome. The incumbent had been negotiated for years among the architecture board, the engineering manager, security and product, until it sat inside their priorities. Every direction the successor moved cost one of them something. The adoption probability was zero before the meeting began, and the meeting could only choose the words of its decision.

Replace the fifteen reviewers with fifteen strong agents and the architect's silence goes away, along with the defence. The agents miss the same hard questions, and the strongest of them share blind spots besides; an average of their votes carries about two opinions. Whether they vote in order or blind barely matters, because on the hard question they are wrong together either way. The summaries are cheaper, so there are more of them. The gates are unchanged, and the adoption probability is still zero.

What would have changed the outcome is the same for both panels. Someone had to look at the gates first, see that the status quo sat inside them, and change a gate. The switch could be made reversible, one exterior veto removed, or one gate's priorities rewritten so the hull no longer contained the incumbent. After that, a panel whose members fail on different questions and a blind first round would have done their work. The two engineers who knew the local failure modes would have decided the question only they could answer.

## What This Post Did Not Claim

**Reversal condition.** The advice of this post is to measure a panel's dependence, pooled and within difficulty, before trusting its votes, and to let the people who hold local facts decide on them. It reverses for questions whose answers are well covered by shared training data, where the strongest single model is already the best panel and people add only noise.

### What Is Not Claimed

The measurements come from three benchmarks and one run per model. A benchmark question is not a design review, and the transfer of the measured dependence to review decisions is a Fit. The paradox of Proposition 5 is proven as a condition and shown on a synthetic path. The measured models do not show it, and the post does not claim they do.

The shared factor is normal, and a normal factor has no tail dependence: it lets errors coincide on hard questions only as often as their overall correlation implies. If models fail together on the hardest questions more often than that, the true floor is higher than the one computed here, and the residual dependence the strongest pairs keep within difficulty points in that direction.

The floor scores answers as right or wrong, so on multiple-choice questions it bounds a plurality vote's error from above rather than predicting it. For a two-option decision such as adopting a design, it is exact. Nor is it claimed that the cascade model explains any measured escalation among agents. It shows what correlated peers in sequence do, under rules from myopic to strongly probing, and that at high dependence the sequence barely matters.

Three open questions are named on purpose. The null used here gives each question one difficulty. Questions also differ in how sharply they separate strong models from weak ones, and a null with a discrimination per question could absorb part of the strongest pairs' residual. Fitting it needs per-question records, which this analysis does not store. The mixed-panel results use illustrative constants, and no measured panel of people and agents has been run. And the instability of agents, 37% in the cited study, enters the model only as a parameter; how it interacts with cascades is not derived. Three further gaps are named as well. Proposition 5 and Corollary 1 assume one shared factor, while the measurement found a second among the strongest models. An upgrade that lowers average error while raising correlation on unusual cases is outside them. The null has no guessing floor for multiple-choice questions. And no controlled study of mixed panels of people and agents on engineering decisions, with outcomes observed after deployment, has been run.

### Where Each Claim Holds

The claims of this post leave their conditions in six recurring ways, and each is listed in full in the drawer below with its assumption and failure mode.

**Tasks unlike the benchmarks.** Questions with local, unpublished answers may show models sharing more than difficulty, because no model's training covered them. Open-ended judgments may show more or less dependence than multiple-choice ones.

**Small panels.** Proposition 5 is about the large-panel floor. A panel of three or five can behave differently, and the measured gain from voting at those sizes is smaller still.

**Agents with independent signals.** The finding that herding barely matters needs strongly dependent signals. Agents that fail on different questions herd in the classic way, and for them a blind first round recovers most of the loss.

**Agents that gather evidence.** Agents that run tests, read logs or exchange checkable proofs change their own precision and independence as they work. The measured dependence describes agents that answer from what they already know.

**Weighted or gated panels.** A panel can weigh members by measured reliability, or route a local question to those who hold the fact. Either avoids the dilution of the mixed-panel result by design.

**People who are not informed.** The mixed-panel results come from people who hold the local fact. People who share the agents' training, or who defer to the agents' answers, hold nothing for the panel to dilute.

<details>
<summary>Every claim, with its assumption and failure mode, in the order the post derives them</summary>

**Claim.** Agents have no career terms, and conformity and unfaithful reasons remain at measured sizes.
- *Assumption:* the cited measurements transfer to agents reviewing designs.
- *Failure mode:* agents given persistent identities and records, which restore a reputation term.

**Claim.** Pooled dependence rises with capability on three benchmarks, and within difficulty it sits at an item-response null except among the strongest pairs, where it exceeds the null and survives removing the hardest questions.
- *Assumption:* one run per model; ten difficulty groups set by the other models; the Mantel-Haenszel odds ratio within groups, read against a one-difficulty item-response null.
- *Failure mode:* other benchmarks, open-ended tasks, sampling at other temperatures, or difficulty left inside the groups.

**Claim.** An average of the strongest models' votes carries about two independent opinions.
- *Assumption:* the reciprocal of the mean vote correlation, an equal-weight average.
- *Failure mode:* weighted averages, or panels whose members differ widely in accuracy.

**Claim.** Voting removes about a tenth of the strongest tier's error.
- *Assumption:* the tier treated as a large panel under Proposition 1; right-or-wrong scoring.
- *Failure mode:* plurality votes over split wrong answers, which can do better; small panels.

**Claim.** At high dependence a sequence and a blind vote are wrong almost equally, under rules from myopic to strongly probing.
- *Assumption:* members who treat signals as independent; thirty members.
- *Failure mode:* members who know the signals are correlated, or signals that are nearly independent.

**Claim.** Blind-spotted agents dilute an informed minority under every rule tried, and agents help once their answers move with the fact by enough. In the large-panel limit of the threshold rule, adoption of a worse design depends on the agents alone (Proposition 6).
- *Assumption:* the illustrative constants, and agents whose sensitivity to the fact is the same in both worlds.
- *Failure mode:* agents whose sensitivity differs by state, or people who are not informed.

**Claim.** An upgrade improves a large panel exactly when its margin is positive, and the critical elasticity falls toward zero as members improve.
- *Assumption:* one shared factor and a common error below one half, as in Proposition 1.
- *Failure mode:* members with very different errors, or several shared factors, as the strongest models' residual suggests.

**Claim.** Adding gates can close the win-set and never opens it.
- *Assumption:* Proposition 3's Euclidean geometry.
- *Failure mode:* gates that negotiate or are compensated.

</details>

### Results This Series Exports

Later series can import these results by number.

- Proposition 1: the large-panel floor of a correlated majority, {% katex() %}\Phi(\Phi^{-1}(p)/\sqrt{\rho}){% end %}.
- Proposition 3: the veto cliff, no change preferred by every gate when the status quo lies in the hull of their ideal points, with Euclidean preferences.
- Proposition 4: learning from recorded reasons as causes converges to {% katex() %}\varphi\theta + (1-\varphi)b{% end %}, and the records alone cannot reveal it.
- Proposition 5 and Corollary 1: the upgrade condition, its margin, and the critical elasticity {% katex() %}\varepsilon^\ast(p){% end %} that shrinks as members improve.
- Definitions 2 and 3: adoption as a spatial test times the chance that relayed evidence clears the bar, and a review's operating point.

{% cognitive_map(root="Smarter Agents, Fewer Opinions") %}
{
  "intro": "An agent review drops the career terms that silence human reviewers and keeps the rest of the pipeline. Measured on three benchmarks, strong models miss the same hard questions and the strongest share blind spots besides, which caps what a panel of them can know; the stage that blocked a human review blocks an agent review the same way.",
  "groups": [
  {"theme": "Agent Values", "c": "mint", "points": [
    [1, "The Career Terms Vanish", "An agent has no horizon of reputation and no sunk endorsement, so the career plane has nothing to act on; conformity stays, measured at about 29% in one study of agent debate, with instability of 37% under self-reflection alone."],
    [2, "Reasons Remain Stories", "A model's stated rationale can omit what drove its answer, so a pipeline that learns from logged rationales inherits Proposition 4, including that no audit of the rationales alone can find the bias."]
  ]},
  {"theme": "Dependence Measured", "c": "sky", "points": [
    [3, "Difficulty, Then a Blind Spot", "On MMLU, GPQA and MMLU-Pro, the odds of a shared mistake rise with capability to 13, 9 and 19 times independence; within groups of similar difficulty they sit near 1 for most pairs, and against a null with no blind spots the strongest fifth keep a residual, clearly on GPQA and MMLU-Pro."],
    [4, "About Two Opinions", "An average of the strongest fifth's votes can hold at most about two independent opinions on all three benchmarks, matching panels of frontier judges; a large majority of the strongest tier removes about a tenth of its members' error."],
    [5, "Herding Stops Mattering", "With independent signals a sequence is wrong 16% of the time and a blind vote 2%; at the measured dependence both are wrong about 28% of the time, a tie made of herding's cost on hard questions and its luck on misleading ones."]
  ]},
  {"theme": "Mixed Panels and Upgrades", "c": "peach", "points": [
    [6, "The Informed Minority, Diluted", "Five partly informed people alone adopt a worse design 1% of the time; inside twenty blind-spotted agents the surprisingly-popular rule adopts it 41% of the time, because the agents' common swings fill most of the panel. Proposition 6 makes it exact for a large panel: the agents' shared factor alone sets the chance of adopting a worse design. Every agent voting in the meeting also costs the people settlements, so the dilution is paid for in human energy."],
    [7, "When Agents Help", "Agents improve on the people alone once their answers move with the local fact by 20 to 30 points at a correlation of 0.3, and by 30 to 40 at 0.6: more dependent agents need more information."],
    [8, "The Upgrade Condition", "Proposition 5: replacing every member improves a large panel if and only if the margin is positive; Corollary 1: correlation may rise only slower than a critical elasticity that falls toward zero as members improve. The measured tiers sit far inside it."]
  ]},
  {"theme": "Levers and Bookend", "c": "rose", "points": [
    [9, "Gates First, Then the Panel", "While the status quo is inside the hull no lever on sensing, aggregation or hand-off is worth anything; past it, the widest gap needs members who fail on different questions, and a blind first round must come before a designated advocate."],
    [10, "The Same Review, Replayed", "Replacing human reviewers with agents removes the senior's silence and defence, keeps the shared hard questions and adds shared blind spots, and leaves the gates unchanged; the adoption probability stays zero until a gate changes."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**Agent Values**

1. An agent has no horizon of reputation and no sunk endorsement, so the career plane has nothing to act on; conformity stays, measured at about 29% in one study of agent debate, with instability of 37% under self-reflection alone.
2. A model's stated rationale can omit what drove its answer, so a pipeline that learns from logged rationales inherits Proposition 4, including that no audit of the rationales alone can find the bias.

**Dependence Measured**

3. On MMLU, GPQA and MMLU-Pro, the odds of a shared mistake rise with capability to 13, 9 and 19 times independence; within groups of similar difficulty they sit near 1 for most pairs, and against a null with no blind spots the strongest fifth keep a residual, clearly on GPQA and MMLU-Pro.
4. An average of the strongest fifth's votes can hold at most about two independent opinions on all three benchmarks, matching panels of frontier judges; a large majority of the strongest tier removes about a tenth of its members' error.
5. With independent signals a sequence is wrong 16% of the time and a blind vote 2%; at the measured dependence both are wrong about 28% of the time, a tie made of herding's cost on hard questions and its luck on misleading ones.

**Mixed Panels and Upgrades**

6. Five partly informed people alone adopt a worse design 1% of the time; inside twenty blind-spotted agents the surprisingly-popular rule adopts it 41% of the time, because the agents' common swings fill most of the panel. Proposition 6 makes it exact for a large panel: the agents' shared factor alone sets the chance of adopting a worse design. Every agent voting in the meeting also costs the people settlements, so the dilution is paid for in human energy.
7. Agents improve on the people alone once their answers move with the local fact by 20 to 30 points at a correlation of 0.3, and by 30 to 40 at 0.6: more dependent agents need more information.
8. Proposition 5: replacing every member improves a large panel if and only if the margin is positive; Corollary 1: correlation may rise only slower than a critical elasticity that falls toward zero as members improve. The measured tiers sit far inside it.

**Levers and Bookend**

9. While the status quo is inside the hull no lever on sensing, aggregation or hand-off is worth anything; past it, the widest gap needs members who fail on different questions, and a blind first round must come before a designated advocate.
10. Replacing human reviewers with agents removes the senior's silence and defence, keeps the shared hard questions and adds shared blind spots, and leaves the gates unchanged; the adoption probability stays zero until a gate changes.

</details>

**Compute it.** For your agent panel, log right and wrong answers on fifty questions with known answers, compute each pair's vote correlation, and take the reciprocal of the mean. That is how many opinions the panel holds. Then do it again within groups of similar difficulty, to see how many of them are blind spots and how many are just hard questions.

A panel of better models is a better panel of models. It is still one panel, it still finds the same questions hard, and it still answers to the same gates.

---

<sup>[1]</sup> Sharma, M. and coauthors (2024). *Towards Understanding Sycophancy in Language Models.* International Conference on Learning Representations (ICLR 2024).

<sup>[2]</sup> Hao, X. and six coauthors (2026). *Not All Flips Are Conformity: Decomposing Stance Convergence in Multi-Agent LLM Debate.* arXiv:2606.00820.

<sup>[3]</sup> Turpin, M., Michael, J., Perez, E. and Bowman, S.R. (2023). *Language Models Don't Always Say What They Think: Unfaithful Explanations in Chain-of-Thought Prompting.* Advances in Neural Information Processing Systems 36 (NeurIPS 2023).

<sup>[4]</sup> Chen, Y. and coauthors (2025). *Reasoning Models Don't Always Say What They Think.* arXiv:2505.05410.

<sup>[5]</sup> Liang, P. and coauthors (2023). *Holistic Evaluation of Language Models.* Transactions on Machine Learning Research. Per-question results of HELM Lite and HELM Capabilities, public bucket of the Stanford Center for Research on Foundation Models.

<sup>[6]</sup> Hendrycks, D. and coauthors (2021). *Measuring Massive Multitask Language Understanding.* International Conference on Learning Representations (ICLR 2021).

<sup>[7]</sup> Rein, D. and coauthors (2024). *GPQA: A Graduate-Level Google-Proof Q&A Benchmark.* Conference on Language Modeling (COLM 2024).

<sup>[8]</sup> Wang, Y. and coauthors (2024). *MMLU-Pro: A More Robust and Challenging Multi-Task Language Understanding Benchmark.* Advances in Neural Information Processing Systems 37 (NeurIPS 2024), Datasets and Benchmarks Track.

<sup>[9]</sup> Mantel, N. and Haenszel, W. (1959). *Statistical Aspects of the Analysis of Data from Retrospective Studies of Disease.* Journal of the National Cancer Institute 22(4), 719-748.

<sup>[10]</sup> Kim, E., Garg, A., Peng, K. and Garg, N. (2025). *Correlated Errors in Large Language Models.* Proceedings of the 42nd International Conference on Machine Learning (ICML 2025).

<sup>[11]</sup> Goel, S. and coauthors (2025). *Great Models Think Alike and this Undermines AI Oversight.* Proceedings of the 42nd International Conference on Machine Learning (ICML 2025).

<sup>[12]</sup> Hossain, E., Yousefi, N. and Lim, S.-N. (2026). *Agreement Overstates Evidence: Error Dependence in LLM Judge Consensus.* arXiv:2609.22512.

<sup>[13]</sup> Kohli, G. (2026). *Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels.* arXiv:2605.29800.

<sup>[14]</sup> Kim, D. (2026). *Are Diversity Metrics Measuring Diversity? A Capability-Controlled Audit of Majority-Vote Gain in LLM Ensembles.* arXiv:2607.20768.

<sup>[15]</sup> Lopez, J.A. (2004). *The Empirical Relationship between Average Asset Correlation, Firm Probability of Default, and Asset Size.* Journal of Financial Intermediation 13(2), 265-283.

<sup>[16]</sup> Chen, Z., Zheng, L.N. and Zhu, D. (2026). *Endorsement Without New Evidence: How Sequential Voting Inflates Mandates in Online Community Governance.* arXiv:2609.09321.

<sup>[17]</sup> Prelec, D., Seung, H.S. and McCoy, J. (2017). *A Solution to the Single-Question Crowd Wisdom Problem.* Nature 541, 532-535.

<sup>[18]</sup> Denisov-Blanch, Y. and six coauthors (2026). *Consensus is Not Verification: Why Crowd Wisdom Strategies Fail for LLM Truthfulness.* arXiv:2603.06612.

<sup>[19]</sup> Hong, L. and Page, S.E. (2004). *Groups of Diverse Problem Solvers Can Outperform Groups of High-Ability Problem Solvers.* Proceedings of the National Academy of Sciences 101(46), 16385-16389.

<sup>[20]</sup> Kuncheva, L.I. and Whitaker, C.J. (2003). *Measures of Diversity in Classifier Ensembles and Their Relationship with the Ensemble Accuracy.* Machine Learning 51(2), 181-207.
