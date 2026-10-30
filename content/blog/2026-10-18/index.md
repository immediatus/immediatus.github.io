+++
authors = ["Yuriy Polyulya"]
title = "Demand Is Not Debt"
description = "A service with capacity at twice its demand can still serve almost nothing. Timeouts and retries leave work that no client is waiting for, and that debt needs capacity the demand figure never mentions. This post states when the failed state, once entered, becomes permanent, and shows that an autoscaler fed a clean demand signal can hold a service exactly there. With two retries, any target of a third or more is enough."
date = 2026-10-18
slug = "capacity-in-arrears-part3-demand-is-not-debt"

[taxonomies]
tags = ["distributed-systems", "control-theory", "systems-thinking", "queueing-theory"]
series = ["capacity-in-arrears"]

[extra]
toc = false
series_order = 3
series_title = "Capacity in Arrears: Autoscaling Under Dead Time, Saturated Metrics, and Retry Debt"
series_description = """<div class="series-lede">An autoscaler adds capacity for the load it can measure, and an overload is the load it cannot.</div>A utilization metric is bounded by the capacity it reports on, so it reads the same at twice the load and at thirty times. This series follows one widely deployed autoscaler from its source code to its limits, and uses it to test four things engineers reasonably believe about a control loop: that its metric measures load, that a stabilization window makes it stable, that a cleaner signal is a safer one, and that a limit removes a risk. Each part prices what one belief leaves out. The results come from the controller's own arithmetic and from simulations whose assumptions each part states. Every part names the observation, on a real cluster, that would prove it wrong."""
+++

<div class="recap-box">
<span class="recap-label">Argument so far</span>
<ul>
<li><strong><a href="/blog/capacity-in-arrears-part1-one-bit-per-dead-time/">One Bit per Dead Time</a>.</strong> A utilization metric saturates at the pods' allowance, so the controller sizes an overload by probing, at most one growth factor per provisioning delay.</li>
<li><strong><a href="/blog/capacity-in-arrears-part2-the-delay-a-window-demands/">The Delay a Window Demands</a>.</strong> A backlog signal sees the size of an overload, but it integrates every shortfall, and a stabilization window makes the loop need a standing delay of about one dead time to rest.</li>
<li><strong>What this post asks next.</strong> Both posts closed on the same hope: a signal that counts only what clients ask for would see demand cleanly and carry no memory. What does such a signal miss?</li>
</ul>
</div>

Take the cleanest signal an autoscaler could have. It counts first attempts only: each request a client sends for the first time, measured where clients arrive, untouched by queues, by retries or by how busy the pods are. It cannot saturate, because it counts requests the pods have not yet seen. It has no backlog in it, so it carries none of the memory that troubled the loop of the previous post. It measures exactly what users want.

Now put it in a model. A service runs ten pods, each serving a hundred requests a second. Clients give up after ten seconds and retry, up to twice. Pods keep working on a request after its client has given up, because nothing tells them to stop. The autoscaler holds the first-attempt rate at half of capacity, a 50% target, and a new pod takes 90 seconds to start. Then demand steps up tenfold and stays there.

The autoscaler does its job quickly. It reaches the capacity it wants in 120 seconds, the same pod count the textbook would choose, with no overshoot at all. Capacity is now twice the demand.

The service never recovers. Over the run it loses 99.7% of everything users ask for. Its pods are fully busy the whole time, serving requests whose clients stopped waiting long ago. A CPU-scaled copy of the same service, the one the first post of this series found slow and wasteful, is healthy after 771 seconds.

The clean signal measured demand correctly. What the service owed was something else.

<div class="recap-box">
<span class="recap-label">In brief</span>
<ul>
<li><strong>The belief.</strong> A cleaner signal, closer to what users ask for, is a safer one to scale on.</li>
<li><strong>The mechanism.</strong> Timeouts and retries leave work no client is waiting for, and a first-attempt signal cannot see it.</li>
<li><strong>The law.</strong> After a trigger a service stays failed if and only if {% katex() %}A\rho \ge 1{% end %}, the threshold already present in Bronson and coauthors' example. Below it, recovery takes about {% katex() %}\Delta(Ak\rho - 1)/(1 - A\rho){% end %}. A scaler blind to the debt is trapped at any target of {% katex() %}1/A{% end %} or more: a third, with two retries.</li>
<li><strong>The bill.</strong> Capacity at twice the demand and 99.7% of requests lost. Scaling on ingress rate, or pairing the clean signal with it, escapes.</li>
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

## The Belief: a Cleaner Signal Is a Safer One

{{ layer(n=1, type="Bound", id="walkthrough-request-rate") }}Moving an autoscaler off CPU and onto a direct measure of demand is common advice, and the platforms support it. The Kubernetes walkthrough for the autoscaler shows a `requests-per-second` metric read from an Ingress. It then shows how to narrow a request metric with a label selector: "you can specify the following metric block to scale only on GET requests"{{ cite(ref="1", title="The Kubernetes Authors (2026) -- HorizontalPodAutoscaler Walkthrough, kubernetes.io documentation") }}. AWS lists the load balancer's request count per target among its predefined target-tracking metrics, which it describes as "the most commonly used metrics for scaling"{{ cite(ref="2", title="Amazon Web Services (2026) -- Target tracking scaling policies for Amazon EC2 Auto Scaling, Amazon EC2 Auto Scaling User Guide") }}.

The reasoning behind it is sound as far as it goes. CPU is a symptom: it mixes demand with inefficiency, garbage collection, noisy neighbours and work the service did not need to do. Request rate is the cause. A signal closer to the cause should make a better controller, and a signal filtered down to the demand that matters should make the best one.

{{ layer(n=2, type="Fit", id="how-clean-signals-are-built") }}A first-attempt count is what a team gets when it pushes that reasoning to its end. It can deduplicate attempts by request identifier, so that a retry of a request already counted adds nothing. It can measure demand upstream of every layer that retries, at the client or at the edge, where each user action appears once. Or it can count sessions or business events instead of requests. Each of these removes the retries from the signal on purpose, because retries look like noise. They rise and fall with the service's own health rather than with what users want. That intuition is correct about where retries come from. This post is about what removing them costs.

{{ layer(n=2, type="Fit", id="series-held-it") }}This series held the same belief, and its first two parts say so. [One Bit per Dead Time](@/blog/2026-10-04/index.md) closed by observing that a signal counting only what clients ask for "sees demand cleanly". [The Delay a Window Demands](@/blog/2026-10-11/index.md) closed by noting that such a signal "avoids the backlog's memory entirely". Both sentences are true. Both also left the question open, and the model this post builds answers it against the hope they expressed.

The belief leaves out one thing. Demand is what clients ask for now. The load a service carries is what it has accepted and not yet finished, including work that nobody is waiting for any more. In a healthy service the two are the same. In a failing one they part, and the gap between them is what keeps it failing.

## Work the Client No Longer Wants

When a client gives up on a request, the request does not vanish. Unless the service checks deadlines, the request stays in its queue and is eventually served. The answer goes nowhere. If the client retries, the service now holds two copies of the same intent and will do the work twice.

<span id="def-7"></span>
<details>
<summary>Definition 7 -- Retry Debt: work a service has accepted and will still perform for requests whose clients have stopped waiting</summary>

**Definition 7** (Retry Debt). *At any moment, a service's retry debt is the work in its queues that belongs to attempts whose clients have already timed out. The debt is served like any other work, consumes capacity like any other work, and produces no answer anyone receives.*

</details>

{{ layer(n=1, type="Bound", id="bronson-definition") }}The failure this creates has a name. Bronson and three coauthors describe metastable failures as those where "a trigger causes the system to enter a bad state that persists even when the trigger is removed", held there by a sustaining effect, "often involving work amplification or decreased overall efficiency"{{ cite(ref="3", title="Bronson, N., Aghayev, A., Charapko, A. & Zhu, T. (2021) -- Metastable Failures in Distributed Systems, HotOS 2021") }}. They also describe the condition that makes it possible: once the load rises above a threshold they call "implicit and invisible", "the system enters a vulnerable state". A vulnerable system is healthy, but it cannot survive the trigger.

{{ layer(n=1, type="Bound", id="huang-retries-most-common") }}Retries are the usual sustaining effect. Huang and seven coauthors studied 22 metastable failures across 11 organizations and report that "by far, the most common sustaining effect is due to the retry policy, affecting more than 50% of the studied incidents"{{ cite(ref="4", title="Huang, L., Magnusson, M., Bangalore Muralikrishna, A., Estyak, S., Isaacs, R., Aghayev, A., Zhu, T. & Charapko, A. (2022) -- Metastable Failures in the Wild, OSDI 22") }}. Load spikes are another prominent trigger, reported in around 35% of their incidents.

{{ layer(n=2, type="Fit", id="vocabulary") }}A note on words, for consistency with this blog. [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) used "metastable" in the dynamical-systems sense: a state with one true equilibrium and an anomalously long relaxation back to it. It reserved "bistable" for a second, permanent state. The systems literature's "metastable failure" is a state that persists after the trigger, which in that vocabulary is bistable. This post keeps the blog's meanings. It says "trapped" or "bistable" for the permanent state and "metastable" for the long way back, and it quotes the literature's phrase only inside quotation marks.

## Amplification

The debt grows with every attempt a failing request makes. One number captures how many.

<span id="def-8"></span>
<details>
<summary>Definition 8 -- Retry Amplification: the units of work a service performs per first attempt once every attempt is failing</summary>

**Definition 8** (Retry Amplification). *When every attempt times out and every abandoned attempt is still served, each first attempt produces A units of work:*

- *with up to R retries per request, {% katex() %}A = R + 1{% end %};*
- *with a retry budget that allows retries up to a fraction {% katex() %}\beta{% end %} of first-attempt traffic, {% katex() %}A = 1 + \beta{% end %};*
- *when several layers each retry independently, the factors multiply.*

</details>

{{ layer(n=1, type="Bound", id="impossibility-tax-link") }}[The Impossibility Tax](@/blog/2026-03-14/index.md) gave the amplified offered load as {% katex() %}\lambda / (1 - r(1-y)){% end %}, for a retry probability r per failed request and a yield y. That post wrote the retry rate as ρ, a symbol this series uses for utilization, so it appears here as r. At zero yield, when every attempt fails, and with retries capped at R per request, the same geometric sum stops after R + 1 terms: {% katex() %}A = (1 - r^{R+1})/(1 - r){% end %}, which is R + 1 when every failure is retried. That gives the A of Definition 8. The budget form replaces the cap with a ceiling on retry traffic.

{{ layer(n=1, type="Bound", id="envoy-budget") }}Retry budgets are a real mechanism with a real default. Envoy's `RetryBudget` "specifies the limit on concurrent retries as a percentage of the sum of active requests and active pending requests", with a default of 20%{{ cite(ref="5", title="Envoy Project Authors (2026) -- RetryBudget, config.cluster.v3 CircuitBreakers, Envoy documentation") }}. The model in this post caps retries per second at a fraction of first-attempt traffic instead. The two rules are close, and they are not the same rule.

{{ layer(n=2, type="Fit", id="layers-multiply") }}The product across layers is where amplification becomes dangerous in practice, because each team chooses its own policy and sees only its own factor.

| Retry stack | Amplification A | Threshold 1/A |
|---|---|---|
| Client retries twice | 3.0 | 33.3% |
| Client retries twice, gateway retries twice | 9.0 | 11.1% |
| Client retries twice, gateway retry budget of 20% | 3.6 | 27.8% |

{{ layer(n=3, type="Estimate", id="stack-reading") }}A gateway that adds two retries of its own takes the threshold from a third to a ninth: a service behind it is vulnerable at any utilization above 11%. Replacing the gateway's retries with a 20% budget brings the threshold back to 28%. Neither team sees the product. The client team chose two retries, the gateway team chose two retries, and the service team inherits nine units of work per request on its worst day.

## The Trap Condition

Put a fixed number of pods behind the model. Their combined capacity is C requests a second, demand is {% katex() %}\lambda{% end %}, and utilization is {% katex() %}\rho = \lambda / C{% end %}. Requests are served first in, first out, clients time out after a fixed wait and retry at once, and abandoned work is served like any other.

<span id="prop-6"></span>
<details>
<summary>Proposition 6 -- Trap Condition: once a trigger has pushed waits past the timeout, the failed state is permanent if and only if A times rho is at least 1</summary>

**Proposition 6** (Trap Condition). *In the fluid model, suppose a trigger has pushed the queue's wait past the client timeout. Then the service stays failed forever if and only if*

{% katex(block=true) %}
A\,\rho \ge 1
{% end %}

*Without a trigger, the same service with {% katex() %}\rho < 1{% end %} is healthy. For {% katex() %}1/A \le \rho < 1{% end %} it therefore has two stable states.*

*Proof.* While the wait exceeds the timeout, every first attempt times out, so does every retry, and every abandoned attempt is still served. Work therefore arrives at {% katex() %}A\lambda{% end %} while capacity removes it at C. The backlog changes at {% katex() %}A\lambda - C = C(A\rho - 1){% end %}. If {% katex() %}A\rho \ge 1{% end %}, the backlog never shrinks, the wait stays above the timeout, and the assumption that every attempt fails remains true. If {% katex() %}A\rho < 1{% end %}, the backlog shrinks at a constant rate until the wait falls below the timeout and attempts start succeeding. Without a trigger the wait starts at zero, no attempt times out, work arrives at {% katex() %}\lambda < C{% end %}, and the wait stays at zero. {% katex() %}\square{% end %}

</details>

{{ layer(n=1, type="Bound", id="attribution-of-condition") }}The condition is old, and this post does not claim it: it is the elementary fluid-limit statement that amplified work must exceed capacity. Bronson and coauthors' own example already contains it. Their database serves 300 queries a second, each request makes one retry, and the system "stays in it as long as the load is below 150QPS", the stable state. That is capacity divided by an amplification of 2. Their "implicit and invisible" threshold is visible after all, for this mechanism. It is {% katex() %}\rho = 1/A{% end %}.

{{ layer(n=1, type="Bound", id="effective-amplification") }}The proof reads the amplification only while the service is failing, and it never uses the fact that A came from a retry count. Whatever sets the work per first attempt in the failed state, a cap, a budget or a client-side limiter, enters the condition the same way. Write {% katex() %}A_{\text{fail}}{% end %} for that work once the failed state has settled. The service then stays trapped after a trigger if and only if {% katex() %}A_{\text{fail}}\,\rho \ge 1{% end %}. Definition 8's budget form is one instance, in which a policy rather than a count fixes the value.

{{ layer(n=3, type="Estimate", id="no-trigger-runs") }}The second half of the proposition, that a trigger is required, holds in the request-level model too. With two retries, an amplification of 3, a service at 50%, 80%, 90% and 95% utilization ran for 20,000 seconds without a spike in three seeds each. That covers amplified utilizations from 1.5 to 2.85, deep inside the region where a trigger would trap it. Not one request timed out. These services are vulnerable, and nothing in their behaviour says so.

{{ layer(n=2, type="Fit", id="vulnerable-invisible") }}That is what makes the threshold dangerous. A service at 50% utilization with two retries looks the same on every dashboard as a service at 30%. Both have spare capacity, both answer quickly, and both pass every load test that does not include a trigger. One of them has a second state waiting behind its first, and the only way to find it from the outside is to push it in.

> **Physical translation.** Picture a kitchen that never cancels an order. When service slows past the point where diners give up, every diner who leaves is replaced by one who orders again, and the cooks keep plating the abandoned orders in the sequence they arrived. If the cooks can turn out more plates than the A orders each table generates while everything is late, the pile shrinks and the kitchen recovers. If they cannot, the kitchen stays busy forever, cooking for empty tables, at a level of demand it would have handled easily had it never fallen behind.

## The Size of a Trigger

The trap condition says nothing about the trigger except that one happened. The same fluid arithmetic gives it a size.

<span id="prop-8"></span>
<details>
<summary>Proposition 8 -- Trigger Size: a k-fold spike of length Delta pushes the wait past a timeout tau_out if and only if (k rho - 1) Delta exceeds tau_out</summary>

**Proposition 8** (Trigger Size). *In the fluid model, start from rest with {% katex() %}\rho < 1{% end %} and let demand rise to k times its level for a time {% katex() %}\Delta{% end %}. The wait first exceeds the client timeout {% katex() %}\tau_{\text{out}}{% end %}, and so starts the failure that Proposition 6 sustains, if and only if*

{% katex(block=true) %}
(k\rho - 1)\, \Delta > \tau_{\text{out}}
{% end %}

*Proof.* While the spike lasts and nothing has timed out, work arrives at {% katex() %}k\lambda{% end %} and leaves at C, so the backlog grows at {% katex() %}C(k\rho - 1){% end %} when {% katex() %}k\rho > 1{% end %}. A first-in-first-out queue served at C makes the newest arrival wait the backlog divided by C, which therefore grows at {% katex() %}k\rho - 1{% end %} seconds per second. It reaches {% katex() %}\tau_{\text{out}}{% end %} within the spike precisely when the stated inequality holds. If {% katex() %}k\rho \le 1{% end %} the backlog never grows and no spike of any length is a trigger. {% katex() %}\square{% end %}

</details>

{{ layer(n=3, type="Estimate", id="trigger-check") }}The runs at the cluster kit's size show both sides. With four pods at 20% utilization, a fivefold spike brings demand up to capacity and no further, {% katex() %}k\rho = 1{% end %}, and in 300 seconds not one attempt times out. At 25% the same spike is a 1.25-fold overload. The wait passes the ten-second timeout after forty seconds, the trap begins, and the service needs 2,867 seconds to recover after the spike ends.

{{ layer(n=1, type="Bound", id="dead-time-is-a-trigger") }}The proposition has a sharper consequence for an autoscaled service, and it ties this post to the two before it. When demand steps up and stays up, capacity stays where it was for a full dead time, because no new pod can serve before then. The dead time is a spike whose length the operator does not choose. With a 90-second dead time and a ten-second timeout, any sustained step with {% katex() %}k\rho - 1 > 10/90{% end %} triggers the trap before the first new pod arrives. That is an overload of more than about 11% over current capacity. In the specimen the tenfold step at a 50% target is a fivefold overload, and good work falls to zero within the first thirty seconds.

{{ layer(n=2, type="Fit", id="trigger-and-trap-separate") }}The trigger and the trap answer different questions. The trigger depends on the spike, the timeout and, for an autoscaled service, the dead time. The trap depends only on the amplification and the utilization the service settles at. A team can make triggers rarer by lengthening timeouts or shortening the dead time, and still have a service that stays down when one finally arrives. A team that moves its service below the threshold has a service that comes back from any trigger, slowly or quickly.

## Why Load Tests Miss It

{{ layer(n=2, type="Fit", id="load-tests-miss") }}A load test that ramps traffic smoothly to 90% utilization, holds it and reports clean latencies is evidence of the healthy state only. With two retries, that service sits at an amplified utilization of 2.7, and the request-level runs at that level held for 20,000 seconds without a single timeout. The test passes because nothing in it pushes the wait past the timeout, and the trap needs that push to exist. The more carefully a load test avoids overload, the less it can say about the second state.

{{ layer(n=2, type="Fit", id="trigger-test") }}Propositions 6 to 8 give a test that can. Choose a spike that satisfies Proposition 8, so that {% katex() %}(k\rho - 1)\Delta{% end %} exceeds the client timeout with room to spare. Run it against the service at its normal utilization and then return demand to normal. Below the threshold the timeouts stop, after roughly the time Proposition 7 gives. At or above it they do not stop at all. The test is destructive by design, because it puts a service into the state the test is looking for. It belongs in a staging copy with the same retry policies, the same timeouts and the same habit of finishing abandoned work.

{{ layer(n=2, type="Fit", id="what-the-test-measures") }}What the test measures is the amplification the service actually experiences, which is the number teams most often get wrong. Retry policies live in client libraries, gateways, service meshes and SDK defaults, and a single request can pass through several of them. The product of Definition 8 is easy to compute once every factor is known, and the trigger test is the way to find out whether every factor is known.

## How Long the Way Back Takes

Below the threshold the service recovers, and the same arithmetic says how long that takes.

<span id="prop-7"></span>
<details>
<summary>Proposition 7 -- Recovery Time: after a k-fold spike of length Delta, a service with A times rho below 1 recovers in about Delta(A k rho - 1)/(1 - A rho) for a long spike, less the ramp before the first timeout</summary>

**Proposition 7** (Recovery Time). *Let demand rise to k times its level for a time {% katex() %}\Delta{% end %}, long enough to trigger the trap, and then return. If {% katex() %}A\rho < 1{% end %}, the fluid model recovers after the spike ends in approximately*

{% katex(block=true) %}
T_{\text{rec}} = \frac{(A k \rho - 1)(\Delta - t_0)}{1 - A\rho} + \frac{\tau_{\text{out}}}{1 - \rho}, \qquad t_0 = \frac{\tau_{\text{out}}}{k\rho - 1}
{% end %}

*where {% katex() %}t_0{% end %} is the time the spike takes to push the wait past the timeout. For a spike much longer than the timeout this is {% katex() %}\Delta(Ak\rho - 1)/(1 - A\rho){% end %}, and the time diverges as {% katex() %}A\rho{% end %} approaches 1.*

*Proof sketch.* Measure the backlog as the wait it imposes, backlog over C. For the first {% katex() %}t_0{% end %} seconds nothing has timed out, and by the argument of Proposition 8 the wait grows at {% katex() %}k\rho - 1{% end %} seconds per second until it reaches {% katex() %}\tau_{\text{out}}{% end %}. For the rest of the spike every attempt fails, work arrives at {% katex() %}Ak\lambda{% end %}, and the wait grows at {% katex() %}Ak\rho - 1{% end %}. After the spike, while attempts still fail, it falls at {% katex() %}1 - A\rho{% end %} until it is back at the timeout. From there attempts succeed, retries stop, and the last {% katex() %}\tau_{\text{out}}{% end %} seconds of wait drain at {% katex() %}1 - \rho{% end %}. The two phases after the spike sum to the stated time. {% katex() %}\square{% end %}

</details>

<div style="margin:1.5em 0;">
<canvas id="chart-trap" role="img" aria-label="Recovery time after a 300-second tenfold spike against amplified utilization A times rho, log scale. The derived curve rises from 2,400 s at 0.5 to 3,750 s at 0.6, 10,500 s at 0.8, 19,500 s at 0.88 and 64,500 s at 0.96, diverging at 1. Fluid-model points (open circles), request-level runs (small dots) and retry-budget runs (green) sit on it. At A times rho of 1.0, 1.2, 1.5 and 1.6 every run is stuck." style="width:100%;height:340px;display:block;"></canvas>
<figcaption>Recovery time of a fixed-capacity service after a 300-second tenfold spike, against A·ρ. Blue: the derived formula. Open circles: the fluid model. Small orange dots: request-level runs, three seeds each. Green: runs with a retry budget instead of capped retries. Right of the red line, every run stayed failed; those runs are drawn as open circles at the top edge because they have no recovery time to plot.</figcaption>
<script>
(function(){var S={"id":"chart-trap","h":340,"ml":[50,60],"mr":[14,16],"mt":24,"mb":42,"els":[{"t":"rect","x0":1.0,"x1":1.7,"y0":1000,"y1":300000,"c":"a","al":0.1},{"t":"vline","x":1.0,"c":"a","dash":true},{"t":"txt","x":1.03,"y":120000,"s":"A\u00b7\u03c1 \u2265 1: never recovers","n":"never recovers","al":"left","c":"a","b":true},{"t":"line","pts":[[0.5,2400.0],[0.505,2454.5454545454545],[0.51,2510.204081632653],[0.515,2567.0103092783506],[0.52,2625.0],[0.525,2684.2105263157896],[0.53,2744.6808510638302],[0.535,2806.4516129032263],[0.54,2869.5652173913045],[0.545,2934.0659340659345],[0.55,3000.0000000000005],[0.555,3067.4157303370794],[0.56,3136.3636363636374],[0.565,3206.896551724137],[0.5700000000000001,3279.0697674418616],[0.575,3352.941176470588],[0.58,3428.5714285714284],[0.585,3506.0240963855417],[0.59,3585.365853658536],[0.595,3666.666666666666],[0.6,3750.0],[0.605,3835.443037974683],[0.61,3923.076923076923],[0.615,4012.987012987013],[0.62,4105.263157894737],[0.625,4200.0],[0.63,4297.2972972972975],[0.635,4397.260273972603],[0.64,4500.0],[0.645,4605.633802816902],[0.65,4714.285714285715],[0.655,4826.08695652174],[0.66,4941.176470588236],[0.665,5059.701492537314],[0.67,5181.818181818183],[0.675,5307.6923076923085],[0.6799999999999999,5437.499999999998],[0.685,5571.428571428573],[0.69,5709.677419354837],[0.6950000000000001,5852.4590163934445],[0.7,5999.999999999999],[0.7050000000000001,6152.5423728813585],[0.71,6310.3448275862065],[0.715,6473.684210526314],[0.72,6642.857142857141],[0.725,6818.181818181818],[0.73,6999.999999999999],[0.735,7188.679245283019],[0.74,7384.615384615385],[0.745,7588.235294117647],[0.75,7800.0],[0.755,8020.408163265306],[0.76,8250.0],[0.765,8489.36170212766],[0.77,8739.13043478261],[0.775,9000.0],[0.78,9272.727272727276],[0.785,9558.139534883723],[0.79,9857.142857142859],[0.7949999999999999,10170.731707317069],[0.8,10500.000000000002],[0.8049999999999999,10846.15384615384],[0.81,11210.526315789479],[0.815,11594.59459459459],[0.8200000000000001,12000.000000000007],[0.825,12428.571428571426],[0.8300000000000001,12882.352941176476],[0.835,13363.63636363636],[0.8400000000000001,13875.000000000007],[0.845,14419.354838709674],[0.8500000000000001,15000.00000000001],[0.855,15620.689655172411],[0.86,16285.714285714284],[0.865,17000.0],[0.87,17769.23076923077],[0.875,18600.0],[0.88,19500.0],[0.885,20478.26086956522],[0.89,21545.454545454548],[0.895,22714.285714285717],[0.9,24000.000000000004],[0.905,25421.052631578954],[0.91,27000.00000000001],[0.915,28764.70588235295],[0.9199999999999999,30749.99999999997],[0.925,33000.00000000002],[0.9299999999999999,35571.428571428536],[0.935,38538.461538461575],[0.94,41999.999999999956],[0.9450000000000001,46090.909090909154],[0.95,50999.999999999956],[0.9550000000000001,57000.00000000009],[0.96,64499.99999999994],[0.9650000000000001,74142.8571428573],[0.97,86999.99999999993],[0.9750000000000001,105000.00000000038],[0.98,131999.99999999988]],"c":"b","w":2},{"t":"txt","x":0.6,"y":2300,"s":"derived curve, \u0394 = 300 s","n":"derived","al":"left","bl":"top","c":"b"},{"t":"pt","x":0.5,"y":2398.0,"c":"ink","r":6,"open":true},{"t":"pt","x":0.5,"y":2381.0,"c":"d","r":2.5},{"t":"pt","x":0.5,"y":2402.0,"c":"d","r":2.5},{"t":"pt","x":0.5,"y":2358.0,"c":"d","r":2.5},{"t":"txt","x":0.5,"y":2398.0,"s":"2,400 s","n":"","al":"right","bl":"middle","dx":-10,"c":"b"},{"t":"pt","x":0.5,"y":2358.0,"c":"ink","r":6,"open":true},{"t":"pt","x":0.5,"y":2336.0,"c":"d","r":2.5},{"t":"pt","x":0.5,"y":2332.0,"c":"d","r":2.5},{"t":"pt","x":0.5,"y":2368.0,"c":"d","r":2.5},{"t":"pt","x":0.6,"y":3700.0,"c":"ink","r":6,"open":true},{"t":"pt","x":0.6,"y":3686.0,"c":"d","r":2.5},{"t":"pt","x":0.6,"y":3666.0,"c":"d","r":2.5},{"t":"pt","x":0.6,"y":3669.0,"c":"d","r":2.5},{"t":"txt","x":0.6,"y":3700.0,"s":"3,750 s","n":"","al":"right","bl":"middle","dx":-10,"c":"b"},{"t":"pt","x":0.6,"y":3630.0,"c":"ink","r":6,"open":true},{"t":"pt","x":0.6,"y":3629.0,"c":"d","r":2.5},{"t":"pt","x":0.6,"y":3582.0,"c":"d","r":2.5},{"t":"pt","x":0.6,"y":3611.0,"c":"d","r":2.5},{"t":"pt","x":0.8,"y":10386.0,"c":"ink","r":6,"open":true},{"t":"pt","x":0.8,"y":10381.0,"c":"d","r":2.5},{"t":"pt","x":0.8,"y":10322.0,"c":"d","r":2.5},{"t":"pt","x":0.8,"y":10300.0,"c":"d","r":2.5},{"t":"txt","x":0.8,"y":10386.0,"s":"10,500 s","n":"","al":"right","bl":"middle","dx":-10,"c":"b"},{"t":"pt","x":1.0,"y":270000,"c":"a","r":5,"open":true},{"t":"pt","x":1.5,"y":270000,"c":"a","r":5,"open":true},{"t":"pt","x":1.2,"y":270000,"c":"a","r":5,"open":true},{"t":"pt","x":0.55,"y":2984.0,"c":"c","r":4.5},{"t":"pt","x":0.6,"y":3716.0,"c":"c","r":4.5},{"t":"pt","x":0.75,"y":7664.0,"c":"c","r":4.5},{"t":"pt","x":1.0,"y":270000,"c":"a","r":5,"open":true},{"t":"pt","x":0.88,"y":19398.0,"c":"c","r":4.5},{"t":"pt","x":0.96,"y":63881.0,"c":"c","r":4.5},{"t":"pt","x":1.2,"y":270000,"c":"a","r":5,"open":true},{"t":"pt","x":1.6,"y":270000,"c":"a","r":5,"open":true},{"t":"txt","x":1.2,"y":270000,"s":"stuck in every run: off the scale","n":"stuck: off scale","al":"center","bl":"top","dy":9,"c":"a"},{"t":"txt","x":0.88,"y":19398,"s":"retry-budget runs","n":"budget","al":"right","bl":"middle","dx":-10,"c":"c"}],"X":{"lo":0.45,"hi":1.7,"ticks":[[0.6,"0.6"],[0.8,"0.8"],[1.0,"1.0"],[1.2,"1.2"],[1.4,"1.4"],[1.6,"1.6"]],"title":"amplified utilization A\u00b7\u03c1","ntitle":"A\u00b7\u03c1"},"Y":{"lo":1000,"hi":300000,"log":true,"ticks":[[1000,"1,000"],[10000,"10,000"],[100000,"100,000"]],"title":"seconds to recover after a 300 s tenfold spike (log)","ntitle":"recovery, s (log)"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="recovery-reading") }}The formula and the two models agree. After a 300-second tenfold spike, a service at an amplified utilization of 0.5 recovers in about 2,400 seconds. The fluid model gives 2,398, against 2,358 to 2,402 across three request-level seeds. At 0.6 the long-spike form gives 3,750 seconds and the models give 3,582 to 3,700. At 0.8 it gives 10,500 and the models give 10,300 to 10,386. The full form of Proposition 7 brings each of these within a quarter of a percent of the fluid model. Two services with the same amplified utilization recover alike whatever split of retries and load produces it. No retries at 50% and one retry at 25% both take about 2,400 seconds.

{{ layer(n=3, type="Estimate", id="budget-runs") }}Retry budgets follow the same curve, and near an amplified utilization of one the curve is steep. At 80% utilization a 10% budget, an amplification of 1.1 and an amplified utilization of 0.88, recovers in 19,398 seconds against a predicted 19,457. Doubling the budget to 20%, an amplified utilization of 0.96, more than triples the time: 63,881 seconds against 64,243, nearly eighteen hours. A 50% budget at the same utilization never recovers, and neither does a budget of 100% at 50% utilization, where the amplified utilization reaches exactly 1.

{{ layer(n=2, type="Fit", id="critical-slowing") }}The divergence is the vocabulary of [Safe in Probability, Not in Size](@/blog/2026-09-24/index.md) made quantitative. That post described a single equilibrium "approached ever more slowly as traffic nears it, the same qualitative signature physics calls critical slowing down", and a second, permanent state past a ceiling. Proposition 7 gives the slowing a rate: the relaxation time grows as {% katex() %}1/(1 - A\rho){% end %}. Proposition 6 places the ceiling at {% katex() %}A\rho = 1{% end %}. Below it the service is metastable in that post's sense, with a recovery that can take most of a day. At and above it the service is bistable.

{{ layer(n=2, type="Fit", id="hours-operationally") }}A recovery measured in hours behaves, operationally, like no recovery at all. Nobody waits eighteen hours for a service to come back on its own. Long before the arithmetic finishes, someone restarts pods, sheds traffic or rolls back the last change, and the incident report records whatever they did as the fix. The metastable side of the threshold and the bistable side therefore look the same from inside an incident. They differ in what happens if nobody acts, and in what a postmortem should conclude. Below the threshold the intervention shortened a recovery that was going to happen. At or above it, the intervention was the recovery.

{{ layer(n=3, type="Estimate", id="marginal-trigger") }}The ramp before the first timeout matters at the edge of the trigger. A spike that only just overloads the service takes time to push the wait past the timeout, so it builds less debt. With four pods at 25% utilization and two retries, a fivefold spike for 300 seconds is a 1.25-fold overload that takes 40 seconds to reach the timeout. The long-spike form predicts 3,300 seconds, 15% above the fluid model's 2,867. The full form predicts 2,873. Across twelve spikes, from plain retries to retry budgets, it stays within 1.2% of the fluid model. At 20% utilization the same spike only brings demand up to capacity, no attempt times out, and there is no trigger at all.

## What Backoff Changes

{{ layer(n=3, type="Estimate", id="backoff-nothing") }}Exponential backoff is the standard advice for retries, and it helps with many problems. It does not help with this one. Backoff delays retries without removing any, so the amplification stays the same, and so does the condition. In the autoscaled model below, adding a five-second backoff to the trapped configuration leaves it trapped: 99.6% of demand lost against 99.7% without it.

{{ layer(n=2, type="Fit", id="what-changes-a") }}What does change the condition is anything that changes A or ρ. Fewer retries, a retry budget, deadline propagation so that servers drop work whose client has gone, or more capacity per unit of demand all move the service across the threshold. Backoff spreads the debt over time. It does not reduce it.

## Three Signals

The autoscaler is supposed to be the way out: when the service falls behind, add pods until it catches up. Whether it gets out depends on what it can see. Three signals see three different quantities.

- **CPU** sees every unit of work the pods perform, including the debt.
- **Ingress rate** sees every request that arrives, first attempts and retries alike. A load balancer's request count measures this.
- **First attempts** see demand alone: what clients want, with the retries filtered out.

<span id="def-9"></span>
<details>
<summary>Definition 9 -- Signal Achievable Region: each signal maps to peak over-provisioning against first-attempt work lost; the frontier is the set no other signal beats on both</summary>

**Definition 9** (Signal Achievable Region). *For a given overload, each scaling signal maps to the point*

{% katex(block=true) %}
\Big( \max N / N^\ast,\; L_{\text{first}} \Big)
{% end %}

*whose first coordinate is the peak pod count over the pods needed and whose second is the first-attempt work lost, measured in seconds of the stepped demand. A signal is on the frontier if no other signal has both less over-provisioning and less loss.*

</details>

At a 50% target, under a sustained tenfold step, with a ten-second timeout, two retries and wasted work:

| Signal | Time until capacity meets the load | Peak pods over pods needed | First-attempt work lost | State at the end |
|---|---|---|---|---|
| CPU | 345 s | 12.50 | 736 s | healthy after 771 s |
| Ingress rate | 120 s | 3.00 | 228 s | healthy after 266 s |
| First attempts | 120 s | 1.00 | 99.7% of all demand | failed |

*Model: 90-second dead time, fluid queue, abandoned attempts still served.*

{{ layer(n=3, type="Estimate", id="three-signals-reading") }}Each signal pays a different bill. CPU is slow, because it saturates, and wasteful, because the debt it sees keeps the metric pinned while the controller multiplies. It peaks at twelve and a half times the pods needed. It recovers anyway, because the debt it over-provisions for is real work that has to be done. Ingress rate reacts as fast as the clean signal and provisions for three times the need, which is the amplification. It sees the retries, so it buys enough capacity to clear the debt, and it is healthy after 266 seconds. The first-attempt signal provisions the need to the pod, never overshoots, and never recovers.

{{ layer(n=2, type="Fit", id="frontier-of-signals") }}On Definition 9's region, ingress rate dominates CPU on both coordinates. The first-attempt signal has the lowest over-provisioning of all, at an unbounded loss. The frontier therefore has a gap in it. The cheapest signal is the one that cannot see what the service owes, and the next point along peaks at three times the pods. No signal in the set buys recovery at the need, because recovering requires capacity for the debt, and the debt is invisible at the need.

{{ layer(n=3, type="Estimate", id="cpu-overshoot-debt") }}The CPU row also shows what the debt does to the first post's staircase. Without timeouts or retries, a tenfold step at a 50% target peaked at 3.17 times the pods needed. With a ten-second timeout and two retries, the same step peaks at 12.50 times. The time to capacity is the same 345 seconds, three rounds, because the saturated metric probes at the same rate whatever is behind it. What changes is how long the metric stays saturated. The debt keeps every pod busy long after first-attempt demand is covered, and the controller keeps multiplying until the debt is gone. The debt roughly quadruples the overshoot of the slowest signal and is the reason that signal recovers at all.

## Anatomy of the Trap

The table gives each signal's outcome. The two figures below show how the first-attempt and ingress scalers get there, second by second, on the same scales.

<div style="margin:1.5em 0;">
<canvas id="chart-anatomy-first" role="img" aria-label="First-attempt scaler after a tenfold step, over 1,200 seconds. Pods rise to 100 by 150 seconds and stay there. From then on, all of the 10,000 requests served each second are abandoned attempts; good work stays at zero." style="width:100%;height:270px;display:block;"></canvas>
<figcaption>The first-attempt scaler. Red: abandoned attempts served each second; green: good work; blue, right axis: pods. The right axis is scaled at 100 requests a second per pod, so the pod line also reads as capacity. It provisions exactly the need, and the need is spent entirely on debt. Model: 10-second timeout, two retries, abandoned work still served.</figcaption>
<script>
(function(){var S={"id":"chart-anatomy-first","h":270,"ml":[46,56],"mr":[40,48],"mt":24,"mb":42,"els":[{"t":"band","pts":[[0,0,1000],[30,0,0],[60,0,0],[90,0,0],[120,0,0],[150,0,0],[180,0,0],[210,0,0],[240,0,0],[270,0,0],[300,0,0],[330,0,0],[360,0,0],[390,0,0],[420,0,0],[450,0,0],[480,0,0],[510,0,0],[540,0,0],[570,0,0],[600,0,0],[630,0,0],[660,0,0],[690,0,0],[720,0,0],[750,0,0],[780,0,0],[810,0,0],[840,0,0],[870,0,0],[900,0,0],[930,0,0],[960,0,0],[990,0,0],[1020,0,0],[1050,0,0],[1080,0,0],[1110,0,0],[1140,0,0],[1170,0,0],[1200,0,0]],"c":"c","al":0.55},{"t":"band","pts":[[0,1000,1000],[30,0,1000],[60,0,1000],[90,0,1300],[120,0,5200],[150,0,10000],[180,0,10000],[210,0,10000],[240,0,10000],[270,0,10000],[300,0,10000],[330,0,10000],[360,0,10000],[390,0,10000],[420,0,10000],[450,0,10000],[480,0,10000],[510,0,10000],[540,0,10000],[570,0,10000],[600,0,10000],[630,0,10000],[660,0,10000],[690,0,10000],[720,0,10000],[750,0,10000],[780,0,10000],[810,0,10000],[840,0,10000],[870,0,10000],[900,0,10000],[930,0,10000],[960,0,10000],[990,0,10000],[1020,0,10000],[1050,0,10000],[1080,0,10000],[1110,0,10000],[1140,0,10000],[1170,0,10000],[1200,0,10000]],"c":"a","al":0.4},{"t":"line","ax":"R","pts":[[0,10],[30,10],[60,10],[90,13],[120,52],[150,100],[180,100],[210,100],[240,100],[270,100],[300,100],[330,100],[360,100],[390,100],[420,100],[450,100],[480,100],[510,100],[540,100],[570,100],[600,100],[630,100],[660,100],[690,100],[720,100],[750,100],[780,100],[810,100],[840,100],[870,100],[900,100],[930,100],[960,100],[990,100],[1020,100],[1050,100],[1080,100],[1110,100],[1140,100],[1170,100],[1200,100]],"c":"b","w":2.2},{"t":"txt","ax":"R","x":1200,"y":100,"s":"100 pods","al":"right","bl":"bottom","dy":-5,"c":"b","b":true},{"t":"txt","x":700,"y":5000.0,"s":"every pod busy with abandoned attempts: good work 0","n":"all wasted, good 0","al":"center","bl":"middle","c":"ink"}],"X":{"lo":0,"hi":1200,"ticks":[[0,"0 s"],[300,"300 s"],[600,"600 s"],[900,"900 s"],[1200,"1200 s"]],"title":"seconds after the tenfold step","ntitle":"s after step"},"Y":{"lo":0,"hi":32000,"ticks":[[0,"0"],[10000,"10,000"],[20000,"20,000"],[30000,"30,000"]],"title":"requests served per second","ntitle":"served / s"},"R":{"lo":0,"hi":320,"ticks":[[0,"0"],[100,"100"],[200,"200"],[300,"300"]],"title":"pods","ntitle":"pods","col":"b"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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
<canvas id="chart-anatomy-ingress" role="img" aria-label="Ingress-rate scaler after the same step. Pods rise to 300 by 180 seconds, the work served is all abandoned attempts until between 240 and 270 seconds, then good work returns to all 5,000 requests a second, wasted work falls to zero, and pods fall back to 100." style="width:100%;height:270px;display:block;"></canvas>
<figcaption>The ingress-rate scaler under the same step and on the same scales. It sees the retries, buys three times the need, clears the debt within about five minutes, and returns to the need once good work is flowing. The pod line again reads as capacity on the left axis.</figcaption>
<script>
(function(){var S={"id":"chart-anatomy-ingress","h":270,"ml":[46,56],"mr":[40,48],"mt":24,"mb":42,"els":[{"t":"band","pts":[[0,0,1000],[30,0,0],[60,0,0],[90,0,0],[120,0,0],[150,0,0],[180,0,0],[210,0,0],[240,0,0],[270,0,5000],[300,0,5000],[330,0,5000],[360,0,5000],[390,0,5000],[420,0,5000],[450,0,5000],[480,0,5000],[510,0,5000],[540,0,5000],[570,0,5000],[600,0,5000],[630,0,5000],[660,0,5000],[690,0,5000],[720,0,5000],[750,0,5000],[780,0,5000],[810,0,5000],[840,0,5000],[870,0,5000],[900,0,5000],[930,0,5000],[960,0,5000],[990,0,5000],[1020,0,5000],[1050,0,5000],[1080,0,5000],[1110,0,5000],[1140,0,5000],[1170,0,5000],[1200,0,5000]],"c":"c","al":0.55},{"t":"band","pts":[[0,1000,1000],[30,0,1000],[60,0,1000],[90,0,1300],[120,0,5200],[150,0,20800],[180,0,30000],[210,0,30000],[240,0,30000],[270,5000,5000],[300,5000,5000],[330,5000,5000],[360,5000,5000],[390,5000,5000],[420,5000,5000],[450,5000,5000],[480,5000,5000],[510,5000,5000],[540,5000,5000],[570,5000,5000],[600,5000,5000],[630,5000,5000],[660,5000,5000],[690,5000,5000],[720,5000,5000],[750,5000,5000],[780,5000,5000],[810,5000,5000],[840,5000,5000],[870,5000,5000],[900,5000,5000],[930,5000,5000],[960,5000,5000],[990,5000,5000],[1020,5000,5000],[1050,5000,5000],[1080,5000,5000],[1110,5000,5000],[1140,5000,5000],[1170,5000,5000],[1200,5000,5000]],"c":"a","al":0.4},{"t":"line","ax":"R","pts":[[0,10],[30,10],[60,10],[90,13],[120,52],[150,208],[180,300],[210,300],[240,300],[270,300],[300,300],[330,300],[360,300],[390,300],[420,300],[450,300],[480,300],[510,300],[540,300],[570,300],[600,147],[630,100],[660,100],[690,100],[720,100],[750,100],[780,100],[810,100],[840,100],[870,100],[900,100],[930,100],[960,100],[990,100],[1020,100],[1050,100],[1080,100],[1110,100],[1140,100],[1170,100],[1200,100]],"c":"b","w":2.2},{"t":"txt","ax":"R","x":1200,"y":100,"s":"100 pods","al":"right","bl":"bottom","dy":-5,"c":"b","b":true},{"t":"txt","ax":"R","x":180,"y":300,"s":"300 pods clear the debt","n":"300 pods","al":"left","bl":"bottom","dx":6,"dy":-4,"c":"b"},{"t":"txt","x":900,"y":2500.0,"s":"good work: all 5,000 requests a second","n":"good 5,000/s","al":"center","bl":"middle","c":"ink"}],"X":{"lo":0,"hi":1200,"ticks":[[0,"0 s"],[300,"300 s"],[600,"600 s"],[900,"900 s"],[1200,"1200 s"]],"title":"seconds after the tenfold step","ntitle":"s after step"},"Y":{"lo":0,"hi":32000,"ticks":[[0,"0"],[10000,"10,000"],[20000,"20,000"],[30000,"30,000"]],"title":"requests served per second","ntitle":"served / s"},"R":{"lo":0,"hi":320,"ticks":[[0,"0"],[100,"100"],[200,"200"],[300,"300"]],"title":"pods","ntitle":"pods","col":"b"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="anatomy-reading") }}Both scalers start the same way. Within thirty seconds of the step every attempt is timing out, the pods serve only abandoned work, and good work is zero. Both reach the end of their first round at the same moment, because both signals jump at once. They differ in what they order. The first-attempt scaler sees five thousand requests a second at a 50% target and orders a hundred pods. By 150 seconds it has them. From then until the end of the run all hundred serve ten thousand abandoned attempts a second, the full capacity, while fifteen thousand a second keep arriving. The ingress scaler sees three times as much traffic and orders three hundred pods. It has them by 180 seconds, clears the debt between 240 and 270 seconds, and serves all five thousand good requests a second after that. Its stabilization window holds the three hundred pods until about 600 seconds, and by 630 seconds it is back to the hundred the demand needs.

{{ layer(n=2, type="Fit", id="dashboard") }}Consider what each dashboard shows during the first-attempt run. The scaler's own metric sits on its 50% target. The autoscaler's status reports the desired and current replica counts equal at a hundred. The pod count matches the capacity plan for this demand. CPU is at 100%, but CPU is not what this autoscaler watches, and the team chose a demand signal precisely to stop reacting to CPU. The only number that says the service is down is the success rate, and the autoscaler is not looking at it. Every signal the control loop uses reports that the loop has done its job.

## The Corollary for Scalers

The three-signal result is one case of a general rule, and the rule follows from the trap condition directly.

<span id="cor-4"></span>
<details>
<summary>Corollary 4 -- Scaler Trap: an autoscaler driven by a signal that excludes the debt holds rho at its target, so after a trigger it is trapped whenever its target is at least 1/A</summary>

**Corollary 4** (Scaler Trap). *Let an autoscaler hold first-attempt utilization at a target {% katex() %}u^\ast{% end %}. Once it has reached capacity, {% katex() %}\rho = u^\ast{% end %}. After a trigger, the service is trapped if and only if*

{% katex(block=true) %}
u^\ast \ge \frac{1}{A}
{% end %}

*With two retries this is any target of a third or more. A retry budget of {% katex() %}\beta{% end %} raises the threshold to {% katex() %}1/(1+\beta){% end %}.*

*Proof.* The scaler's signal does not include the debt, so the debt never changes the capacity it chooses. At capacity the first-attempt utilization equals the target, and Proposition 6 applies with {% katex() %}\rho = u^\ast{% end %}. {% katex() %}\square{% end %}

</details>

<div style="margin:1.5em 0;">
<canvas id="chart-scaler" role="img" aria-label="Time until healthy after a sustained tenfold step, for an autoscaler driven by first attempts only. Sorted by amplified utilization: retry budget 20% at a 50% target, A times rho 0.60, 274 s; budget 50%, 0.75, 422 s; 2 retries at 25%, 0.75, 384 s; at 30%, 0.90, 922 s; at 33%, 0.99, 8,909 s. Trapped, never healthy: 2 retries at a 50% target, 1.50, with or without a 5-second backoff." style="width:100%;height:330px;display:block;"></canvas>
<figcaption>An autoscaler that counts first attempts only holds ρ at its target, so it lands at A·ρ = A × target. Every configuration below 1 recovers, more slowly the closer it gets; every configuration at or above 1 stays trapped, however fast it scaled. Backoff delays retries without removing any, and changes nothing. Model: sustained tenfold step, 10-second timeout, wasted work.</figcaption>
<script>
(function(){var S={"id":"chart-scaler","h":330,"ml":[10,10],"mr":[14,16],"mt":34,"mb":40,"els":[{"t":"pt","x":274,"y":6.6,"c":"b","r":6},{"t":"txt","x":274,"y":6.6,"s":"274 s","al":"left","dx":10,"c":"b","b":true},{"t":"txt","x":100,"y":6.82,"s":"50%, retry budget 20%   A\u00b7\u03c1 = 0.60","n":"50%, budget 20%  A\u00b7\u03c1 0.60","al":"left","bl":"bottom","dy":-2,"c":"ink"},{"t":"pt","x":384,"y":5.6,"c":"b","r":6},{"t":"txt","x":384,"y":5.6,"s":"384 s","al":"left","dx":10,"c":"b","b":true},{"t":"txt","x":100,"y":5.82,"s":"25%, 2 retries   A\u00b7\u03c1 = 0.75","n":"25%, 2 retries  A\u00b7\u03c1 0.75","al":"left","bl":"bottom","dy":-2,"c":"ink"},{"t":"pt","x":422,"y":4.6,"c":"b","r":6},{"t":"txt","x":422,"y":4.6,"s":"422 s","al":"left","dx":10,"c":"b","b":true},{"t":"txt","x":100,"y":4.82,"s":"50%, retry budget 50%   A\u00b7\u03c1 = 0.75","n":"50%, budget 50%  A\u00b7\u03c1 0.75","al":"left","bl":"bottom","dy":-2,"c":"ink"},{"t":"pt","x":922,"y":3.5999999999999996,"c":"b","r":6},{"t":"txt","x":922,"y":3.5999999999999996,"s":"922 s","al":"left","dx":10,"c":"b","b":true},{"t":"txt","x":100,"y":3.82,"s":"30%, 2 retries   A\u00b7\u03c1 = 0.90","n":"30%, 2 retries  A\u00b7\u03c1 0.90","al":"left","bl":"bottom","dy":-2,"c":"ink"},{"t":"pt","x":8909,"y":2.5999999999999996,"c":"b","r":6},{"t":"txt","x":8909,"y":2.5999999999999996,"s":"8,909 s","al":"left","dx":10,"c":"b","b":true},{"t":"txt","x":100,"y":2.82,"s":"33%, 2 retries   A\u00b7\u03c1 = 0.99","n":"33%, 2 retries  A\u00b7\u03c1 0.99","al":"left","bl":"bottom","dy":-2,"c":"ink"},{"t":"txt","x":30000,"y":1.6,"s":"never recovers: trapped","n":"never: trapped","al":"right","dx":-4,"c":"a","b":true},{"t":"txt","x":100,"y":1.82,"s":"50%, 2 retries   A\u00b7\u03c1 = 1.50","n":"50%, 2 retries  A\u00b7\u03c1 1.50","al":"left","bl":"bottom","dy":-2,"c":"ink"},{"t":"txt","x":30000,"y":0.6000000000000001,"s":"never recovers: trapped","n":"never: trapped","al":"right","dx":-4,"c":"a","b":true},{"t":"txt","x":100,"y":0.8200000000000001,"s":"50%, 2 retries, backoff 5 s   A\u00b7\u03c1 = 1.50","n":"50%, 2 retries, backoff 5 s  A\u00b7\u03c1 1.50","al":"left","bl":"bottom","dy":-2,"c":"ink"}],"X":{"lo":100,"hi":30000,"log":true,"ticks":[[100,"100 s"],[1000,"1,000 s"],[10000,"10,000 s"]],"title":"time until healthy after a sustained tenfold step (log)","ntitle":"time to healthy (log)"},"Y":{"lo":0,"hi":7,"ticks":[],"title":"first-attempt signal: target and retry policy","ntitle":"first-attempt signal"}};var cv=document.getElementById(S.id);if(!cv)return;var ctx=cv.getContext('2d');
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

{{ layer(n=3, type="Estimate", id="corollary-runs") }}The runs follow the corollary in every case. With two retries and a sustained tenfold step, a first-attempt scaler at a 50% target never recovers, an amplified utilization of 1.5. At 33%, just below a third, it recovers after 8,909 seconds, about two and a half hours. At 30% it takes 922 seconds and at 25% it takes 384. A retry budget at the same 50% target changes the amplification instead of the target: 274 seconds with a 20% budget and 422 seconds with a 50% budget. Backoff changes neither and leaves the service trapped.

{{ layer(n=3, type="Estimate", id="stack-threshold") }}The stack table gives the corollary a practical edge. Behind a gateway that retries twice, the amplification is nine and the threshold is 11%. A first-attempt scaler would have to run below 11% utilization to be safe, holding nine pods for every pod of demand, which no one would choose. In such a stack the clean signal cannot be made safe by tuning its target. It can be made safe by changing the amplification, or by pairing it with a signal that sees the retries.

<span id="cor-5"></span>
<details>
<summary>Corollary 5 -- Ingress Escape: a scaler that counts every attempt sizes capacity so that A times rho equals its target, so it escapes at any target below 100%</summary>

**Corollary 5** (Ingress Escape). *Let an autoscaler hold ingress utilization, every attempt counted, at a target {% katex() %}u^\ast < 1{% end %}, and let it keep the capacity it chooses until the debt has cleared. While the service is failing, ingress is {% katex() %}A\lambda{% end %}, so at the capacity the scaler chooses, {% katex() %}A\rho = u^\ast < 1{% end %}, and by Proposition 6 the service recovers. Once attempts succeed, ingress falls back to {% katex() %}\lambda{% end %} and the scaler releases the extra capacity.*

*Proof.* During the failure every first attempt makes A attempts, all of which arrive and are counted, so the signal reads {% katex() %}A\lambda{% end %}. The scaler sets {% katex() %}C = A\lambda / u^\ast{% end %}, which gives {% katex() %}A\rho = A\lambda / C = u^\ast{% end %}. The condition that it keeps this capacity matters: as soon as attempts start succeeding, ingress falls, and a scaler that released capacity at once could drop back below the threshold before the debt was gone. In the model the five-minute downscale window holds the capacity long enough. {% katex() %}\square{% end %}

</details>

{{ layer(n=3, type="Estimate", id="escape-evidence") }}The runs match it. The ingress scaler peaked at three times the pods needed, which is the amplification, and recovered in 266 seconds. Its signal measured the amplification directly: on the ingress signal the retries are the measurement. CPU escapes by a different route. Its metric saturates, so it climbs one growth factor per round, as [One Bit per Dead Time](@/blog/2026-10-04/index.md) showed, until capacity exceeds all the work arriving, debt included. It gets there in the end, at twelve and a half times the need. The corollary assumes the scaler is allowed to reach the capacity it computes, and a replica ceiling below {% katex() %}A\lambda/u^\ast{% end %} would take that away.

## Pairing Signals

{{ layer(n=1, type="Bound", id="max-over-metrics") }}The clean signal does not have to be abandoned. Both platforms already combine signals in a way that suits this problem. The Kubernetes autoscaler, given several metrics, "takes the maximum scale recommended for each metric and sets the workload to that size"{{ cite(ref="6", title="The Kubernetes Authors (2026) -- Horizontal Pod Autoscaling, Scaling on multiple metrics, kubernetes.io documentation") }}. AWS target tracking with several policies "will scale out the Auto Scaling group if any of the target tracking policies are ready to scale out", and scales in only when all of them agree{{ cite(ref="2", title="Amazon Web Services (2026) -- Target tracking scaling policies for Amazon EC2 Auto Scaling, Amazon EC2 Auto Scaling User Guide") }}.

{{ layer(n=1, type="Bound", id="pairing-argument") }}Pair the first-attempt signal with ingress rate, at the same target, and take the larger recommendation. In a healthy service there are no retries, the two signals read the same, and the pair behaves like the clean signal alone. In a failing one the ingress signal reads A times higher and wins, and Corollary 5 applies: capacity rises until {% katex() %}A\rho{% end %} equals the target, and the service recovers. Once attempts succeed, the retries stop, ingress falls back to demand, and the pair releases the extra pods. The clean signal keeps the precision it was chosen for, and the dirty one supplies the power it lacks.

{{ layer(n=2, type="Fit", id="pairing-costs") }}The pair has a price, and it is paid only on the worst day. During a failure it orders A times the needed capacity, which in a stack with an amplification of nine is nine times the need. A replica ceiling, or a cluster without room for that capacity, takes the escape away. Pairing with CPU instead also escapes, more slowly and with more overshoot, for the reasons the first post of this series gave. What pairing cannot do is repair a service whose amplification is so high that the capacity to clear its debt does not exist.

{{ layer(n=2, type="Fit", id="speed-is-not-the-issue") }}Huang and coauthors left a question open: "Whether the current autoscaling techniques can scale up fast enough to avert a metastable failure requires further research." They also noted that autoscaling "does not necessarily prevent metastable failures". The corollary answers part of the first question, and the answer is about the signal rather than the speed. The first-attempt scaler is the fastest of the three. It reached its capacity in 120 seconds, as fast as ingress and nearly three times faster than CPU, and it is the only one that stays trapped. A scaler can be fast enough and still never get out, because the capacity it is fast to reach is the wrong capacity.

{{ layer(n=2, type="Fit", id="price-of-target-again") }}[One Bit per Dead Time](@/blog/2026-10-04/index.md) priced the target as an information rate. Corollary 4 adds a second price. With retries in the system, the target also sets whether the service has a second, permanent state. A team that raises a first-attempt target from 30% to 50% to save pods has moved its service from a recovery of fifteen minutes to no recovery at all. Nothing in steady-state operation will tell it so.

## A Limit on the Self-Verification Rule

This blog has argued, more than once, that a system cannot grade its own homework. A check is honest only if it draws on something the thing it checks could not also have corrupted. The first-attempt signal looks like the perfect application of that rule. It is measured at the edge, by clients, independent of the service's own state. CPU is the opposite, a number the service produces about itself.

{{ layer(n=2, type="Fit", id="shared-ancestor") }}In this model, the self-produced metric recovered and the independent one did not. The rule survives this, and [The Shared Ancestor Problem](@/blog/2026-09-06/index.md) already said why. Its criterion for a check has two conditions, independence and power, and it warned that "independence without power certifies a coin flip". The first-attempt signal is independent of the service's state and has no power over the quantity that matters, because the debt is part of that state. CPU fails independence and has the power. Ingress rate has some of each: it is measured outside the pods, and it includes the retries that carry the debt into view.

{{ layer(n=2, type="Fit", id="three-blindnesses") }}Set beside the two posts before it, this result completes a pattern. The saturated CPU metric of [One Bit per Dead Time](@/blog/2026-10-04/index.md) could not see the size of an overload. The backlog of [The Delay a Window Demands](@/blog/2026-10-11/index.md) could see the size, and it carried the memory of every shortfall into the controller. The clean demand signal has neither problem, and it cannot see state at all. Each signal is blind to something, and each blindness is a property of what the signal is defined to count, not of how carefully it is measured. Ashby's requisite variety, which the first post used as an analogy, applies here as one too. A regulator cannot counter a disturbance its channel does not carry, and the debt is a disturbance the clean channel was built to exclude.

{{ layer(n=2, type="Fit", id="lesson") }}The lesson sharpens the rule rather than retiring it. A signal must be independent of the errors it is meant to catch, and it must see the quantity it governs. When a service's load includes its own history, a signal that is independent of that history is also blind to it. Cleaning a signal of everything the system did to itself can clean away the thing that decides whether it recovers.

## What Is Known and What Is Added

{{ layer(n=1, type="Bound", id="known") }}The pattern is established, and this post adds to it rather than discovering it. Bronson and coauthors named metastable failures, their trigger and their sustaining effect, and their retry example contains the threshold of Proposition 6. Huang and coauthors measured how often retries sustain them and discussed autoscaling as a partial mitigation. Alvaro and five coauthors model request-response servers as continuous-time Markov chains and compute recovery times "either exactly by solving a linear system or approximately through estimates of eigenvalues"{{ cite(ref="7", title="Alvaro, P., Isaacs, R., Majumdar, R., Muniswamy-Reddy, K.-K., Salamati, M. & Soudjani, S. (2025) -- Formal Analysis of Metastable Failures in Software Systems, arXiv:2510.03551") }}. Habibi and four coauthors built a queueing model, MSF-Model, to "characterize and predict metastable failures" in replicated storage{{ cite(ref="8", title="Habibi, F., Lorido-Botran, T., Showail, A., Sturman, D.C. & Nawab, F. (2023) -- MSF-Model: Queuing-Based Analysis and Prediction of Metastable Failures in Replicated Storage Systems, arXiv:2309.16181") }}.

{{ layer(n=2, type="Fit", id="added") }}Three things were not found in the sources read. The first is the closed-form recovery time of Proposition 7, with its divergence as {% katex() %}1/(1-A\rho){% end %} tied to this blog's definitions of metastable and bistable. The second is Corollary 4, the trap condition for an autoscaler whose signal excludes the debt, with its threshold of one over the amplification. The third is the three-signal comparison, which shows that the cleanest and fastest signal is the one that stays trapped. They are offered as this post's contribution, with the usual caution about absence from the sources read.

## What the Model Leaves Out

{{ layer(n=2, type="Fit", id="leaves-deadlines") }}The largest omission is the one the reversal condition names. A service that propagates deadlines, or that cancels work when its client disconnects, does not serve abandoned attempts. Its debt is close to zero, the amplification of Definition 8 no longer turns into work, and the trap condition does not apply in this form. Retries still add attempts, and a service that drops them late still pays for part of each one. The protection is partial in practice, and it depends on where in the stack the work is dropped.

{{ layer(n=2, type="Fit", id="leaves-breakers") }}Client-side circuit breakers act on the amplification directly. A breaker that opens when most calls fail stops retries and first attempts alike, which lowers A to below one while it is open. That can break the trap, at the price of failing every request fast instead of slowly. The model has no breakers.

{{ layer(n=1, type="Bound", id="leaves-limiters") }}Client-side limits are a gentler form of the same lever, and they are deployed. The AWS SDKs' standard retry mode keeps a retry quota, "a token bucket that deducts tokens for each retry and replenishes tokens when requests succeed". When the tokens run out, "the SDK returns the error without retrying"{{ cite(ref="9", title="Amazon Web Services (2026) -- Retry behavior, AWS SDKs and Tools Reference Guide") }}. Its default of three attempts is the two retries of this post's specimen. Envoy's adaptive concurrency filter "dynamically adjusts the allowed number of requests that can be outstanding" to a cluster from sampled latencies, updated every 100 milliseconds in its example configuration{{ cite(ref="10", title="Envoy Project Authors (2026) -- Adaptive Concurrency, HTTP filter reference, Envoy v1.40.0") }}. Netflix's concurrency-limits library borrows TCP congestion control for the same purpose and lists among its ground rules that "we can use timeouts and rejected requests to aggressively back off"{{ cite(ref="11", title="Netflix (2025) -- concurrency-limits README, release v0.5.4") }}.

{{ layer(n=2, type="Fit", id="terminal-rejection") }}Each of these lowers {% katex() %}A_{\text{fail}}{% end %} only if what it refuses stays refused. A limiter that rejects a request has removed one attempt. If a layer above it retries the rejection, whether an SDK wrapper, a gateway or a user pressing reload, the attempt comes back and the amplification is unchanged. The rejection has only moved where the debt waits. Envoy's documentation shows how easily this happens. It expects more 503 responses while the filter measures its baseline latency and states that "it is recommended to enable retries for resets/503s". That advice is aimed at the measurement window, when other hosts still have room, but the same retries fire during an overload, when none do. A limiter lowers the amplification the trap condition reads only when its rejections are terminal, or are charged against the same retry budget as timeouts.

{{ layer(n=2, type="Fit", id="leaves-distributions") }}The fluid model and the request-level model agree to within about 2% on recovery times, but neither has realistic service times. The fluid model has no distribution at all, and the request-level model uses exponential service. Heavy-tailed service times make waits more variable, so some requests time out even below the trigger of Proposition 8, and they could produce triggers of their own. None appeared in the request-level runs up to 95% utilization, and none could appear in a model whose service times have no tail.

{{ layer(n=2, type="Fit", id="leaves-users") }}Finally, the model's clients are perfectly persistent: every timeout produces a retry, up to the cap. Real users also give up and leave. A user who abandons for good lowers the amplification, which helps the service and hurts the business. The model's numbers are therefore the worst case for the service and say nothing about the demand that never comes back.

## The Binding Constraint, in Sequence

{{ layer(n=2, type="Fit", id="csf-part-3") }}[The Constraint Sequence Framework](@/blog/2025-12-27/index.md) asks which constraint binds first. For retry debt the amplification binds first, because it sets the threshold every other choice is measured against, and it is set by policies spread across every client and layer. The signal binds second, because it decides whether the autoscaler can see the debt at all. The target binds third: given a blind signal, it decides which side of the threshold the service lives on. Nobody sets the trigger; it is the event that eventually arrives.

{{ layer(n=2, type="Fit", id="csf-part-3-consequence") }}The sequence says where to look first. A team that finds its service trapped will be tempted to tune the autoscaler, which is the third constraint, or to add backoff, which changes none of them. The first constraint is the amplification, and it is usually set in client libraries the service team does not own.

## Falsification Criteria

The cluster kit for this series provides a service that keeps working on abandoned requests and a load generator with a ten-second timeout and two retries. A meter publishes the first-attempt and ingress rates for the autoscaler to read. The predictions come from the fluid model at the kit's size. F1 and F2 hold four pods fixed. F3 and F4 start from four pods at a 50% target under a ceiling of 50.

**F1 (a trigger is required).**
- *Condition:* utilization of 50%, an amplified utilization of 1.5, steady load for several hours, no spike.
- *Prediction:* no timeouts at all.
- *Refuted if:* the service falls into the failed state without a trigger.

**F2 (the threshold).**
- *Condition:* a fivefold spike for 300 seconds at 30% and at 40% utilization.
- *Prediction:* at 30%, an amplified utilization of 0.9, recovery after about 9,756 seconds; at 40%, an amplified utilization of 1.2, no recovery.
- *Refuted if:* the 40% run recovers on its own, or the 30% run does not recover.

**F3 (the signal decides).**
- *Condition:* the same service autoscaled on first attempts at a 50% target, and again on ingress rate at a 50% target, under a sustained fivefold step.
- *Prediction:* the first-attempt run stays failed at 20 pods and loses 99.3% of demand; the ingress run climbs to the ceiling of 50, recovers 270 seconds after the step and settles at 20.
- *Refuted if:* the first-attempt run recovers without a change in amplification, or the ingress run stays failed.

**F4 (pairing restores recovery).**
- *Condition:* the first-attempt and ingress signals of F3 configured on one autoscaler, at the same 50% target, so that the larger recommendation wins.
- *Prediction:* the paired run recovers after 270 seconds, as the ingress run does, and with no step it holds the same 4 pods as the first-attempt signal alone.
- *Refuted if:* the paired run stays failed, or holds more pods than the clean signal alone in steady state.

## The Ledger of What the Loop Cannot Know, Continued

**Size**

*Belief:* the metric measures load. *Law:* at most one factor of g per round. *Bill:* fifteen rounds for a thirtyfold overload at the default target.

**Time**

*Belief:* a stabilization window makes the loop stable. *Law:* rest only if the standing delay is at least {% katex() %}\tau\,\Phi(W/\tau){% end %}. *Bill:* about ninety seconds of waiting on every message at the default window.

**State**

*Belief:* a cleaner signal is a safer one.

*Mechanism:* timeouts and retries leave work no client is waiting for; served first in, first out, that debt consumes capacity the demand figure never shows.

*Law:* Proposition 6, trapped after a trigger if and only if {% katex() %}A\rho \ge 1{% end %}, attributed. Proposition 7, recovery in about {% katex() %}\Delta(Ak\rho-1)/(1-A\rho){% end %} for a long spike, less the ramp before the first timeout. Corollary 4, a scaler on a debt-excluding signal is trapped at any target of 1/A or more. Layer 1 for the conditions; Layer 3 for the recovery times and the three signals.

*Bill:* with two retries, a first-attempt target of a third or more turns a tenfold step into a permanent failure with capacity at twice the demand. Below that, recovery slows without bound as the target approaches a third.

## What This Post Did Not Claim

### Where Each Claim Holds

**Claim.** A failed service stays failed if and only if {% katex() %}A\rho \ge 1{% end %}.
- *Assumption:* first-in-first-out service, clients that retry at once on timeout, and servers that complete abandoned work.
- *Failure mode:* deadline propagation, request cancellation or last-in-first-out service drop abandoned work and remove the debt; the condition then does not apply.

**Claim.** Recovery takes about {% katex() %}\Delta(Ak\rho - 1)/(1 - A\rho){% end %} for a long spike, less the ramp before the first timeout.
- *Assumption:* a fluid queue in which retries stop the moment the wait falls below the timeout.
- *Failure mode:* retries already in flight at that moment, or bursty arrivals, blur the phase boundaries; in the runs the full form stays within 1.2% of the fluid model.

**Claim.** A scaler on a debt-excluding signal is trapped when its target is at least 1/A.
- *Assumption:* the scaler reaches its target capacity, and the trigger occurs before or while it does.
- *Failure mode:* a replica ceiling below the target capacity, or a signal that partly includes retries, changes the effective utilization.

**Claim.** A trigger is required.
- *Assumption:* the request-level model with Poisson arrivals and exponential service, run for 20,000 seconds.
- *Failure mode:* heavier-tailed service times or bursty arrivals could produce their own triggers; none appeared in these runs up to 95% utilization.

**Reversal condition.** The advice of this post is to scale on a signal that sees the debt, or to remove the debt. It reverses when the service drops abandoned work. With deadline propagation or cancellation, the debt does not exist, the first-attempt signal measures the whole load, and its cleanliness becomes the advantage it was supposed to be.

### What Is Not Claimed

The fluid model and the request-level model agree to within about 2% on recovery times, and both use simple service times and perfectly persistent clients. The thresholds of Propositions 6 to 8 and Corollaries 4 and 5 follow from the fluid arithmetic. The specific recovery times, the trace of the trap and the comparison of the three signals belong to the specimen. They move when its timeout, its retry counts or its dead time move.

It has not been claimed that clean signals are wrong. With deadline propagation or cancellation, the debt does not exist and the first-attempt signal becomes the best input available. Nor has the trap condition been claimed as new. Bronson and coauthors' own example already contains it. This post's additions are the closed-form recovery time, the size of a trigger, and the condition under which a scaler holds a service in the trap.

Two open questions are named on purpose. Heavy-tailed service times and bursty arrivals could produce triggers of their own, and none of the models here can show it. And the trigger test proposed in this post is destructive by design and has not been run on a real service.

Two corrections follow from it. The first two posts of this series closed on the hope that a signal counting only what clients ask for would be the clean way out. This post shows where that hope fails, in the open rather than by quietly dropping it. And the rule of [The Shared Ancestor Problem](@/blog/2026-09-06/index.md) is confirmed rather than overturned: the independent signal failed for lack of power, the second of the two conditions that post stated.

### What Is Left Open

The three signals differ in what they see, and they share what they do. Each one waits for the backlog to exist, then orders capacity for it, and the capacity arrives a dead time later. During that dead time nothing the autoscaler does reaches the service. The debt that decides the outcome is built in exactly that interval.

Every result in this series so far has treated the excess during the dead time as something the queue absorbs. The queue held all of it, and the controller's only job was to catch up. A service has another option during that interval, one that does not depend on what the autoscaler can see. This post does not examine it.

{% cognitive_map(root="Demand Is Not Debt") %}
{
  "intro": "An autoscaler fed only first attempts sees demand cleanly and provisions exactly the need. With timeouts, retries and servers that finish abandoned work, a trigger can leave that service failed forever with capacity at twice its demand. This post states when the failed state is permanent, how long the way back takes below that point, and why the cleanest signal is the one that stays trapped.",
  "groups": [
  {"theme": "The Debt", "c": "mint", "points": [
    [1, "Abandoned Work Is Still Served", "A request whose client timed out stays in the queue and is served for nobody. With R retries, every failing first attempt becomes A = R + 1 units of work; a budget gives 1 + beta, and layers multiply."],
    [2, "The Trap Condition, Attributed", "After a trigger pushes waits past the timeout, the failed state is permanent iff A x rho >= 1. Bronson and coauthors' own example, stable below 150 of 300 queries a second with one retry, contains it exactly."],
    [3, "Vulnerable and Invisible", "With no trigger, request-level runs at A x rho from 1.5 to 2.85 ran 20,000 s without a single timeout. The second state exists and nothing shows it."]
  ]},
  {"theme": "The Way Back", "c": "sky", "points": [
    [4, "Recovery Time in Closed Form", "Below the threshold, recovery after a k-fold spike of length Delta takes about Delta(A k rho - 1)/(1 - A rho) for a long spike: 2,400 s at 0.5, 3,750 s at 0.6, 10,500 s at 0.8, matched by fluid and request-level runs."],
    [5, "Metastable, Then Bistable", "The relaxation time grows as 1/(1 - A rho), the critical slowing that Safe in Probability, Not in Size described; at A rho = 1 the service gains a permanent second state."],
    [6, "Backoff Changes Nothing Here", "Backoff delays retries without removing any, so A and the condition are unchanged; a five-second backoff left the trapped run trapped."]
  ]},
  {"theme": "The Signal", "c": "peach", "points": [
    [7, "Three Signals, Three Bills", "CPU recovers after 771 s at 12.5 times the needed pods; ingress rate after 266 s at 3 times; first attempts provision exactly the need and lose 99.7% of demand."],
    [8, "The Scaler Trap", "A scaler on a debt-excluding signal holds rho at its target, so it is trapped whenever the target is at least 1/A: any target of a third or more with two retries. At 33% it recovers after 8,909 s; at 25% after 384 s."],
    [9, "Independence Without Power", "The independent first-attempt signal cannot see the debt, which is part of the service's state; the self-produced CPU signal can. A check needs both conditions The Shared Ancestor Problem named."]
  ]}
]
}
{% end %}

<details>
<summary>Read the Cognitive Map as plain text</summary>

**The Debt**

1. A request whose client timed out stays in the queue and is served for nobody. With R retries, every failing first attempt becomes {% katex() %}A = R + 1{% end %} units of work; a budget gives {% katex() %}1 + \beta{% end %}, and layers multiply.
2. After a trigger pushes waits past the timeout, the failed state is permanent iff {% katex() %}A\rho \ge 1{% end %}. Bronson and coauthors' own example, stable below 150 of 300 queries a second with one retry, contains it exactly.
3. With no trigger, request-level runs at {% katex() %}A\rho{% end %} from 1.5 to 2.85 ran 20,000 s without a single timeout. The second state exists and nothing shows it.

**The Way Back**

4. Below the threshold, recovery after a k-fold spike of length {% katex() %}\Delta{% end %} takes about {% katex() %}\Delta(Ak\rho - 1)/(1 - A\rho){% end %} for a long spike: 2,400 s at 0.5, 3,750 s at 0.6, 10,500 s at 0.8, matched by fluid and request-level runs.
5. The relaxation time grows as {% katex() %}1/(1 - A\rho){% end %}, the critical slowing that Safe in Probability, Not in Size described; at {% katex() %}A\rho = 1{% end %} the service gains a permanent second state.
6. Backoff delays retries without removing any, so A and the condition are unchanged; a five-second backoff left the trapped run trapped.

**The Signal**

7. CPU recovers after 771 s at 12.5 times the needed pods; ingress rate after 266 s at 3 times; first attempts provision exactly the need and lose 99.7% of demand.
8. A scaler on a debt-excluding signal holds ρ at its target, so it is trapped whenever the target is at least 1/A: any target of a third or more with two retries. At 33% it recovers after 8,909 s; at 25% after 384 s.
9. The independent first-attempt signal cannot see the debt, which is part of the service's state; the self-produced CPU signal can. A check needs both conditions The Shared Ancestor Problem named.

</details>

**Compute it.** Multiply your retry counts across every layer that retries to get A. If any layer uses a budget, use one plus the budget for that layer. Divide one by A. If your autoscaler scales on a signal that excludes retries, and its target is at or above that number, your service has a second state that a trigger can put it in. If your servers do not drop abandoned work, the same is true at fixed capacity whenever your utilization is above it.

Demand is what clients want now. Debt is what the service already agreed to do. An autoscaler that sees only the first will provision for a service that has paid its debts, and wait there, at exactly the right capacity, forever.

---
<sup>[1]</sup> The Kubernetes Authors (2026). *HorizontalPodAutoscaler Walkthrough*, section "Autoscaling on more specific metrics." kubernetes.io documentation (kubernetes/website, main branch).

<sup>[2]</sup> Amazon Web Services (2026). *Target tracking scaling policies for Amazon EC2 Auto Scaling.* Amazon EC2 Auto Scaling User Guide.

<sup>[3]</sup> Bronson, N., Aghayev, A., Charapko, A. & Zhu, T. (2021). *Metastable Failures in Distributed Systems.* HotOS 2021 (Workshop on Hot Topics in Operating Systems).

<sup>[4]</sup> Huang, L., Magnusson, M., Bangalore Muralikrishna, A., Estyak, S., Isaacs, R., Aghayev, A., Zhu, T. & Charapko, A. (2022). *Metastable Failures in the Wild.* 16th USENIX Symposium on Operating Systems Design and Implementation (OSDI 22).

<sup>[5]</sup> Envoy Project Authors (2026). *RetryBudget*, in config.cluster.v3 CircuitBreakers. Envoy documentation.

<sup>[6]</sup> The Kubernetes Authors (2026). *Horizontal Pod Autoscaling*, sections "Algorithm details" and "Scaling on multiple metrics." kubernetes.io documentation (kubernetes/website, main branch).

<sup>[7]</sup> Alvaro, P., Isaacs, R., Majumdar, R., Muniswamy-Reddy, K.-K., Salamati, M. & Soudjani, S. (2025). *Formal Analysis of Metastable Failures in Software Systems.* arXiv:2510.03551.

<sup>[8]</sup> Habibi, F., Lorido-Botran, T., Showail, A., Sturman, D.C. & Nawab, F. (2023). *MSF-Model: Queuing-Based Analysis and Prediction of Metastable Failures in Replicated Storage Systems.* arXiv:2309.16181.

<sup>[9]</sup> Amazon Web Services (2026). *Retry behavior*, sections "Standard mode" and "Retry settings." AWS SDKs and Tools Reference Guide (read 2026-10-22).

<sup>[10]</sup> Envoy Project Authors (2026). *Adaptive Concurrency*, HTTP filters configuration reference. Envoy documentation, v1.40.0.

<sup>[11]</sup> Netflix (2025). *concurrency-limits*, README. Netflix/concurrency-limits, release v0.5.4.
