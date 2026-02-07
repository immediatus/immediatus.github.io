+++
authors = ["Yuriy Polyulya"]
title = "Why GPU Quotas Kill Creators Before Content Flows"
description = "While demand-side latency is being solved, supply infrastructure must be prepared. Fast delivery of nothing is still nothing. GPU quotas - not GPU speed - determine whether creators wait 30 seconds or 3 hours. This is the third constraint in the sequence - invest in it now so it doesn't become a bottleneck when protocol migration completes."
date = 2025-12-06
slug = "microlearning-platform-part3-creator-pipeline"

[taxonomies]
tags = ["video-encoding", "gpu-acceleration", "creator-economy"]
series = ["engineering-platforms-at-scale"]

[extra]
toc = false
series_order = 3
series_title = "Engineering Platforms at Scale: The Constraint Sequence"
series_description = "In distributed systems, solving the right problem at the wrong time is just an expensive way to die. We've all been to the optimization buffet - tuning whatever looks tasty until things feel 'good enough.' But here's the trap: systems fail in a specific order, and each constraint gives platforms a limited window to act. The ideal system reveals its own bottleneck; if it doesn't, that's the first constraint to solve. The optimization workflow itself is part of the system under optimization."

+++

You've fixed the demand side. Videos load in under 300ms. Users swipe without waiting. But creators are still leaving.

Fast delivery of nothing is still nothing. The platform streams content instantly - content that doesn't exist yet because the upload pipeline drives creators away.

Marcus uploads his tutorial and... waits. Two minutes. Five minutes. He opens YouTube in another tab. Without creators, there's no content. Without content, latency optimization is irrelevant. [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/) and [Protocol Choice Locks Physics](/blog/microlearning-platform-part2-video-delivery/) solved how fast Kira gets her video. This post solves whether Marcus sticks around to make it.

"But wait," says the careful engineer, "Theory of Constraints says focus on the active bottleneck. Demand is still active - why discuss supply now?" Because GPU quota provisioning takes weeks. If you wait until demand is solved to start supply-side infrastructure, creators experience delays during the transition. This investment is strategic preparation, not premature optimization.

---

## Prerequisites: When This Analysis Applies

This creator pipeline analysis matters in two scenarios:

**Scenario A: Preparing the next constraint** (recommended at 3M DAU)
- **Demand-side actively being solved** - Protocol migration underway, p95 <300ms achievable after migration completes
- **Supply will become the constraint** - When demand improves, creator churn becomes the limiting factor
- **Lead time required** - GPU quota provisioning takes 4-8 weeks; start now so infrastructure is ready
- **Capital available** - Can invest $38K/month without slowing protocol migration

**Scenario B: Supply is already the active constraint** (applies at higher scale)
- **Demand-side latency solved** - Protocol choice made, p95 <300ms achieved
- **Supply is the active constraint** - Creator churn >5%/year from upload experience, encoding queue >30s p95
- **Volume justifies complexity** - >10M DAU where supply-side ROI approaches 3× threshold

Common requirements for both scenarios:
- **Creator ratio meaningful** - >0.5% of users create content (>5,000 active creators at 1M DAU)
- **Budget exists** - Infrastructure budget can absorb $38K/month creator pipeline costs

If ANY of these are false, skip this analysis:

- **Demand-side unsolved AND not in progress**: If p95 latency >300ms and no migration planned, users abandon before seeing creator content. Fix protocol first.
- **Supply not constrained AND won't be soon**: If creator churn <3%/year and encoding queue <15s, and you're not scaling rapidly, defer this investment.
- **Early-stage (<500K DAU)**: Simple encoding (CPU-based, 2-minute queue) is sufficient for PMF validation
- **Low creator ratio (<0.3%)**: Platform is consumption-focused, not creator-focused. Different economics apply.
- **Limited budget (<$20K/month)**: Accept slower encoding, defer real-time analytics

### Pre-Flight Diagnostic

**The Diagnostic Question:** "If encoding completed in <30 seconds tomorrow (magic wand), would creator churn drop below 3%?"

If you can't confidently answer YES, encoding latency is NOT your constraint. Three scenarios where creator pipeline optimization wastes capital:

**1. Monetization drives churn, not encoding**
- Signal: Creators leave for platforms with better revenue share, not faster encoding
- Reality check: YouTube pays $3-5 CPM, your platform pays $0.75/1K views. Speed won't fix economics.
- Example: Vine had instant publishing but died because creators couldn't monetize. TikTok learned this - their Creator Fund launched within 2 years of US expansion.

**2. Content quality is the constraint**
- Signal: Top 10% of creators have <2% churn; bottom 50% have >15% churn
- Reality check: Fast encoding of bad content is still bad content. The algorithm surfaces quality, not recency.
- Action: Invest in creator education and content tools before encoding infrastructure.

**3. Audience discovery is broken**
- Signal: New creator videos get <100 views in first week regardless of encoding speed
- Reality check: If the recommendation system doesn't surface new creators, they leave. Twitch streamers don't quit because of encoding - they quit because nobody watches.
- Action: Fix cold-start recommendation before optimizing upload pipeline.

### Applying the Four Laws Framework

<style>
#tbl_four_laws_creator + table th:first-of-type { width: 15%; }
#tbl_four_laws_creator + table th:nth-of-type(2) { width: 50%; }
#tbl_four_laws_creator + table th:nth-of-type(3) { width: 35%; }
</style>
<div id="tbl_four_laws_creator"></div>

| Law | Application to Creator Pipeline | Result |
| :--- | :--- | :--- |
| **1. Universal Revenue** | \\(\Delta R = \text{Creators Lost} \times \text{Content Multiplier} \times \text{ARPU}\\). At 3M DAU: 1,500 creators × 10K views × $0.0573 = $859K/year | $859K/year protected @3M DAU (scales to $14.3M @50M DAU) |
| **2. Weibull Model** | Creator patience follows different curve than viewer patience. Encoding >30s triggers "broken" perception; >2min triggers platform abandonment. | 5% annual creator churn from poor upload experience |
| **3. Theory of Constraints** | Supply becomes binding AFTER demand-side latency solved. At 3M DAU, latency (Mode 1) is still the active constraint per [Protocol Choice Locks Physics](/blog/microlearning-platform-part2-video-delivery/). GPU quotas (Mode 3) investment is **preparing the next constraint**, not solving the current one. | Sequence: Latency → Protocol → **GPU Quotas** → Cold Start. Invest in Mode 3 infrastructure while Mode 1/2 migration is underway. |
| **4. ROI Threshold** | Pipeline cost $38.6K/month vs $859K/year protected = 1.9× ROI @3M DAU. Becomes 2.3× @10M DAU, 2.8× @50M DAU. | Below 3× threshold at all scales - this is a strategic investment, not an ROI-justified operational expense. |

**Scale-dependent insight:** At 3M DAU, creator pipeline ROI is 1.9× (below 3× threshold). Why invest when latency is still the active constraint?

Theory of Constraints allows **preparing** the next constraint while solving the current one when:
1. **Current constraint is being addressed** - Protocol migration (Mode 2) is underway; demand-side will be solved
2. **Lead time exists** - GPU quota provisioning takes 4-8 weeks; supply-side infrastructure must be ready BEFORE demand-side completes or creators experience delays the moment demand improves
3. **Capital is not diverted** - $38K/month pipeline cost ($0.46M/year) is 19% of the $2.90M protocol investment, a manageable parallel spend that doesn't slow protocol migration

The distinction: **Solving** a non-binding constraint destroys capital. **Preparing** the next constraint prevents it from becoming a bottleneck when the current constraint clears.

- If capital-constrained: Defer - focus 100% on protocol migration. Accept that creators will experience delays when demand-side clears until supply-side catches up.
- If capital-available: Proceed - creator infrastructure ready when protocol migration completes. No gap between demand improvement and supply capability.

---

**Scale context from latency analysis:**
- 3M DAU baseline, scaling to 50M DAU target
- $0.0573/day ARPU (blended freemium)
- Creator ratio: 1.0% at 3M DAU = 30,000 creators
- Creator ratio: 1.0% at 50M DAU = 500,000 creators
- 5% annual creator churn from poor upload experience (hypothesized - no platform publicly reports encoding-attributed churn; actual rate requires instrumentation)
- 1 creator = 10,000 views of content consumption per year (derivation: average creator produces 50 videos/year × 200 views/video = 10,000 views; note: 200 views/video reflects a microlearning niche platform, not YouTube scale where mid-tier creators average 5K-20K views per video)

**The creator experience problem:**

Marcus finishes recording a tutorial. He hits upload. How long until his video is live and discoverable? On YouTube, the answer is "minutes to hours." For a platform competing for creator attention, every second matters. If Marcus waits 10 minutes for encoding while his competitor's video goes live in 30 seconds, he learns where to upload next.

**The goal:** Sub-30-second Upload-to-Live Latency (supply-side). This is distinct from the 300ms Video Start Latency (demand-side) analyzed in [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/) and [Protocol Choice Locks Physics](/blog/microlearning-platform-part2-video-delivery/). The terminology distinction matters:

| Metric | Target | Perspective | Measured From | Measured To |
| :--- | :--- | :--- | :--- | :--- |
| Video Start Latency | <300ms p95 | Viewer (demand) | User taps play | First frame rendered |
| Upload-to-Live Latency | <30s p95 | Creator (supply) | Upload completes | Video discoverable |

The rest of this post derives what sub-30-second Upload-to-Live Latency requires:

1. **Direct-to-S3 uploads** - Bypass app servers with presigned URLs
2. **GPU transcoding** - Hardware-accelerated encoding for ABR (Adaptive Bitrate) quality variants
3. **Cache warming** - Pre-position content at edge locations before first view
4. **ASR captions** - Automatic Speech Recognition for accessibility and SEO
5. **Real-time analytics** - Creator feedback loop under 30 seconds

### Creator Patience Model (Adapted Weibull)

The viewer Weibull model from Part 1 doesn't apply to creators - they operate on different timescales with different tolerance thresholds. This section derives a creator-specific patience model.

Creator patience differs fundamentally from viewer patience. Viewers abandon in milliseconds (Weibull \\(\lambda=3.39\\)s, \\(k=2.28\\) from [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/#weibull-survival-analysis)). Creators tolerate longer delays but have hard thresholds:

{% katex(block=true) %}
\begin{aligned}
F_{\text{creator}}(t) &= \begin{cases}
0 & t < 30\text{s (acceptable)} \\
0.05 & 30\text{s} \leq t < 60\text{s (minor frustration)} \\
0.15 & 60\text{s} \leq t < 120\text{s (frustrated)} \\
0.65 & 120\text{s} \leq t < 300\text{s (likely to abandon)} \\
0.95 & t \geq 300\text{s (platform comparison triggered)}
\end{cases}
\end{aligned}
{% end %}

**Threshold derivation:**
- **<30s**: YouTube makes SD-quality available in 1-3 minutes; full HD processing takes 5-15 minutes. A sub-30s target for a 60s microlearning video at initial quality is ambitious but achievable because our videos are short-form.
- **30-60s**: Creator notices delay but continues. 5% open competitor tab.
- **60-120s**: "This is slow" perception. 15% actively comparing alternatives.
- **120-300s**: "Something is wrong" perception. 65% search alternatives.
- **>300s**: Platform comparison triggered. 95% will try competitor for next upload.

**Mathematical connection to viewer Weibull:**

The step function above is a simplification. We hypothesize creators exhibit modified Weibull behavior with much higher \\(\lambda\\) (tolerance) but sharper \\(k\\) (threshold effect):

{% katex(block=true) %}
F_{\text{creator}}(t; \lambda_c, k_c) = 1 - \exp\left[-\left(\frac{t}{\lambda_c}\right)^{k_c}\right], \quad \lambda_c = 90\text{s}, \; k_c = 4.5
{% end %}

**These parameters are hypothesized, not fitted to data.** The high \\(k_c = 4.5\\) (vs viewer \\(k_v = 2.28\\)) models the "cliff" behavior where creators tolerate delays up to a threshold then abandon rapidly - qualitatively different from viewers' gradual decay. The actual values require instrumentation of creator upload flows. The step function thresholds (0%/5%/15%/65%/95%) are UX heuristics, not empirical measurements.

### Technical Bridge: Viewer vs Creator Patience Distributions

The series uses two Weibull models: the viewer model (\\(\lambda_v = 3.39\\)s, \\(k_v = 2.28\\)) derived in [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/#the-math-framework), and the creator model introduced above. This section clarifies why the parameters differ.

**Notation (subscripts distinguish cohorts):**

| Symbol | Viewer (Demand-Side) | Creator (Supply-Side) |
| :--- | :--- | :--- |
| \\(\lambda\\) (scale) | \\(\lambda_v = 3.39\\)s | \\(\lambda_c = 90\\)s |
| \\(k\\) (shape) | \\(k_v = 2.28\\) | \\(k_c = 4.5\\) |
| Latency type | Video Start (100ms–1s) | Upload-to-Live (30s–300s) |
| Behavior | Gradual decay | Cliff at threshold |

**Why Different Shape Parameters (\\(k_v\\) vs \\(k_c\\))?**

The shape parameter \\(k\\) in the Weibull distribution controls how the hazard rate evolves over time:

{% katex(block=true) %}
h(t; \lambda, k) = \frac{k}{\lambda}\left(\frac{t}{\lambda}\right)^{k-1}
{% end %}

- \\(k = 1\\): Constant hazard (exponential distribution - memoryless)
- \\(1 < k < 3\\): **Gradual acceleration** (viewers: \\(k_v = 2.28\\))
- \\(k > 3\\): **Cliff behavior** (creators: \\(k_c = 4.5\\))

The behavioral mechanism behind the divergence: viewers make *repeated, low-stakes* decisions - each video start is one of ~20 daily sessions, and a slow load costs seconds, not minutes. Impatience accumulates gradually because the cost of waiting scales linearly with time. Creators face the opposite structure. Uploading is *infrequent and high-investment* - encoding a 60-second video involves recording, editing, and uploading, so the sunk cost is already significant before the wait begins. Creators tolerate substantial delay because they've committed effort, but they maintain a mental reference point (typically set by competing platforms) beyond which the delay signals infrastructure inadequacy. Once that reference point is crossed, the decision flips from "wait" to "evaluate alternatives" - producing the sharp hazard acceleration that \\(k_c = 4.5\\) captures. In survival analysis terms, the viewer process has moderate positive duration dependence (hazard rises as \\(t^{1.28}\\)), while the creator process has strong positive duration dependence (hazard rises as \\(t^{3.5}\\)) because the underlying decision mechanism is threshold-triggered rather than continuously evaluated.

**Hazard Rate Comparison:**

{% katex(block=true) %}
\begin{aligned}
h_v(t) &= \frac{2.28}{3.39}\left(\frac{t}{3.39}\right)^{1.28} \quad \text{(viewers: gradual acceleration)} \\[8pt]
h_c(t) &= \frac{4.5}{90}\left(\frac{t}{90}\right)^{3.5} \quad \text{(creators: cliff at threshold)}
\end{aligned}
{% end %}

| Time Point | Viewer \\(h_v(t)\\) | Creator \\(h_c(t)\\) | Interpretation |
| :--- | :--- | :--- | :--- |
| \\(t = 0.3\lambda\\) | 0.15/s | 0.0004/s | Viewers already at risk; creators safe |
| \\(t = 0.7\lambda\\) | 0.46/s | 0.012/s | Viewers accelerating; creators still safe |
| \\(t = 1.0\lambda\\) | 0.67/s | 0.05/s | Viewers in danger zone; creators notice |
| \\(t = 1.3\lambda\\) | 0.93/s | 0.14/s | Viewers abandoning; creators frustrated |
| \\(t = 1.5\lambda\\) | 1.12/s | 0.28/s | **Cliff**: Creator hazard now rising rapidly |

At \\(t = \lambda\\) (characteristic tolerance), viewers have already accumulated significant risk (\\(F_v(\lambda_v) = 63.2\\%\\)), while creator hazard is still low in absolute terms because their tolerance threshold is 90s, not 3.4s. Both CDFs equal 63.2% at their respective \\(\lambda\\) by definition, but the high \\(k_c = 4.5\\) shape means creator hazard stays near zero until approaching 90s, then spikes rapidly.

**Connecting Logistic Regression (\\(\hat{\beta}\\)) to Weibull (\\(k\\))**

Part 1 establishes causality via within-user fixed-effects logistic regression (\\(\hat{\beta} = 0.73\\)). How does this relate to the Weibull shape parameter?

The logistic coefficient \\(\hat{\beta}\\) measures the log-odds increase in abandonment when latency exceeds a threshold (300ms). The Weibull \\(k\\) parameter measures how rapidly hazard accelerates with time. They capture related but distinct phenomena:

{% katex(block=true) %}
\begin{aligned}
\text{Logistic (threshold effect):} \quad & \log\left(\frac{P(\text{abandon}|t > 300\text{ms})}{P(\text{abandon}|t < 300\text{ms})}\right) = \hat{\beta} = 0.73 \\[8pt]
\text{Weibull (continuous hazard):} \quad & \frac{h(t_2)}{h(t_1)} = \left(\frac{t_2}{t_1}\right)^{k-1}
\end{aligned}
{% end %}

**Approximate relationship:** For viewers at the 300ms threshold:

{% katex(block=true) %}
\exp(\hat{\beta}) = 2.1 \approx \left(\frac{F_v(0.35\text{s})}{F_v(0.25\text{s})}\right) = \frac{0.00563}{0.00262} = 2.15 \quad \checkmark
{% end %}

The logistic \\(\hat{\beta}\\) is consistent with Weibull \\(k_v = 2.28\\) at the 300ms decision boundary. Both models agree: viewers are ~2× more likely to abandon above threshold.

**Revenue at Risk Profiles: Viewer vs Creator**

The different patience distributions create fundamentally different revenue risk profiles:

| Dimension | Viewer (Demand-Side) | Creator (Supply-Side) |
| :--- | :--- | :--- |
| **Frequency** | High (every session, ~20/day) | Low (per upload, ~1.5/week for active creators) |
| **Threshold** | Low (300ms feels slow) | High (30s is acceptable, 120s triggers comparison) |
| **Hazard profile** | Gradual acceleration (\\(k_v = 2.28\\)) | Cliff behavior (\\(k_c = 4.5\\)) |
| **Time scale** | Milliseconds (100ms–1,000ms) | Minutes (30s–300s) |
| **Revenue mechanism** | Direct: \\(\Delta R_v = N \cdot \Delta F_v \cdot r \cdot T\\) | Indirect: \\(\Delta R_c = C_{\text{lost}} \cdot M \cdot r \cdot T\\) |
| **Multiplier** | 1× (one user = one user) | 10,000× (one creator = 10K views/year) |
| **Sensitivity** | Every 100ms compounds | Binary: <30s OK, >120s triggers churn |
| **Recovery** | Next session (high frequency) | Platform switch (low frequency, high switching cost) |

**Revenue at Risk Formula Comparison:**

{% katex(block=true) %}
\begin{aligned}
R_{\text{at-risk}}^{\text{viewer}} &= \underbrace{N}_{\text{DAU}} \cdot \underbrace{T}_{\text{365 days}} \cdot \underbrace{\int_{t_1}^{t_2} f_v(t) \, dt}_{\text{abandonment mass}} \cdot \underbrace{r}_{\text{ARPU/day}} \\[12pt]
R_{\text{at-risk}}^{\text{creator}} &= \underbrace{N \cdot \rho}_{\text{creators}} \cdot \underbrace{T}_{\text{365 days}} \cdot \underbrace{\int_{t_1}^{t_2} f_c(t) \, dt}_{\text{churn mass}} \cdot \underbrace{M \cdot r}_{\text{content multiplier × ARPU}}
\end{aligned}
{% end %}

where \\(\rho = 0.01\\) (1% creator ratio) and \\(M = 10{,}000\\) views/creator/year.

**Worked Example: 100ms Viewer Improvement vs 30s Creator Improvement**

*Viewer optimization (370ms → 270ms):*
{% katex(block=true) %}
\Delta R_v = 3\text{M} \times 365 \times [F_v(0.37) - F_v(0.27)] \times \$0.0573 = 3\text{M} \times 365 \times 0.00327 \times 0.0573 = \$205\text{K/year}
{% end %}

*Creator optimization (90s → 60s):*

Moving from 90s encoding (Tier 3: 60-120s) to 60s encoding (Tier 2: 30-60s) reduces incremental creator loss from 225 to 75 creators per year, saving 150 creators × 10K views × $0.0573 = **$86K/year** (see tier table below).

**Interpretation:** A 100ms viewer improvement ($205K/year) has ~2.4× the revenue impact of a 30s creator improvement ($86K/year), but creator improvements have asymmetric upside: crossing the 120s cliff (Tier 4) saves $559K/year - more than doubling the viewer optimization value. Viewer optimization is about compounding small gains across billions of sessions. Creator optimization is about preventing cliff-edge churn events that cascade through the content multiplier.

Viewer patience (\\(k_v = 2.28\\)) and creator patience (\\(k_c = 4.5\\)) require different optimization strategies:

**Viewers:** Optimize continuously. Every 100ms matters because hazard accelerates gradually. Invest in protocol optimization, edge caching, and prefetching - gains compound across high-frequency sessions.

**Creators:** Optimize to threshold. Sub-30s encoding is parity; >120s is catastrophic. Binary investment decision: either meet the 30s bar or accept 5%+ annual churn. Intermediate improvements (90s → 60s) have limited value because \\(k_c = 4.5\\) keeps hazard low until the cliff.

Part 1's within-user \\(\hat{\beta} = 0.73\\) validates viewer latency as causal. Part 3's creator model requires separate causality validation (within-creator odds ratio). Don't assume viewer causality transfers to creators - different populations, different mechanisms, different confounders.

**Revenue impact per encoding delay tier:**

| Encoding Time | \\(F_{\text{creator}}\\) | Creators Lost @3M DAU | Content Lost | Annual Revenue Impact |
| :--- | :--- | :--- | :--- | :--- |
| <30s (target) | 0% (baseline) | 0 | 0 views | Baseline - no incremental churn at target encoding speed |
| 30-60s | 5% | 75 | 750K views | $43K/year |
| 60-120s | 15% | 225 | 2.25M views | $129K/year |
| >120s | 65% | 975 | 9.75M views | $559K/year |

### The Double-Weibull Trap: When Supply Cliff Triggers Demand Decay

The table above quantifies **direct** creator loss. But creator loss has a second-order effect: reduced content catalog degrades viewer experience, triggering the *viewer* Weibull curve. This compounding failure mode - where the output of one Weibull becomes the input to another - is the "Double-Weibull Trap."

**Stage 1: Creator Cliff (\\(k_c = 4.5\\))**

At 120s encoding delay, the creator cliff activates:

{% katex(block=true) %}
F_c(120\text{s}) = 1 - \exp\left[-\left(\frac{120}{90}\right)^{4.5}\right] = 1 - \exp(-3.65) = 0.974 \quad (97.4\% \text{ abandon})
{% end %}

This is not a gradual bleed - it's a phase transition. At 60s encoding: \\(F_c = 14.9\\%\\). At 90s: \\(F_c = 63.2\\%\\). At 120s: \\(F_c = 97.4\\%\\). A 33% increase in encoding time from \\(\lambda_c\\) to 120s causes abandonment to jump from 63% to 97%. The \\(k_c = 4.5\\) shape produces this binary behavior: safe or catastrophic, with a narrow transition band around \\(\lambda_c = 90\\)s.

**Stage 2: Content Gap**

Each lost creator eliminates 10,000 views/year of content. At 3M DAU with 1,500 active creators experiencing a queue spike to 120s:

{% katex(block=true) %}
\begin{aligned}
\text{Creators lost (annual churn)} &= 1{,}500 \times 0.05 = 75 \text{ creators} \\
\text{Content gap} &= 75 \times 10{,}000 = 750{,}000 \text{ views/year removed}
\end{aligned}
{% end %}

The Content Gap doesn't appear instantly - it manifests over weeks as lost creators stop uploading. But because GPU quota provisioning takes 4-8 weeks (see "Upload Architecture" below), the gap persists for at least one provisioning cycle.

**Stage 3: Viewer Cold Start Cascade (\\(k_v = 2.28\\))**

Reduced content catalog pushes more viewers into [cold start territory - Check #4 Product-Market Fit](/blog/microlearning-platform-part1-foundation/#platform-death-decision-logic). New users in content-depleted categories encounter generic recommendations instead of personalized paths:

{% katex(block=true) %}
\begin{aligned}
\text{Affected sessions} &= 750{,}000 \text{ views} \times 0.40 \text{ (cold start churn rate)} \\
&= 300{,}000 \text{ sessions with degraded experience} \\[8pt]
\text{Revenue lost (indirect)} &= 300{,}000 \times \$0.0573 = \$17{,}190\text{/year (per churn cycle)}
\end{aligned}
{% end %}

At 3M DAU, the indirect effect is modest. But the compound term scales with viewer population while the trigger (creator loss) stays constant:

| Scale | Direct Creator Loss | Indirect Viewer Loss | Compound Total | Amplification |
| :--- | ---: | ---: | ---: | ---: |
| 3M DAU | $559K | $17K | $576K | 1.03× |
| 10M DAU | $1.86M | $57K | $1.92M | 1.03× |
| 50M DAU | $9.32M | $287K | $9.61M | 1.03× |

**Why the amplification appears small - and why it matters anyway:**

The 3% amplification understates the real risk for two reasons:

1. **The cliff makes it correlated.** Independent failures average out. But a GPU quota exhaustion event hits *all* creators simultaneously, converting 5% annual churn into a burst event. If 75 creators churn in one week (not spread across a year), the Content Gap concentrates into a 4-week hole, and the cold start penalty hits new users during a period with no fresh content in affected categories.

2. **The provisioning lag creates hysteresis.** GPU provisioning takes 4-8 weeks. Creator churn triggers in days. The gap between "creator leaves" and "capacity restored" means the Content Gap persists even after encoding times recover, because the *creators* don't come back - they've switched platforms (high switching cost, low return probability).

**Risk Heat Map: Joint Failure Surface**

{{ risk_matrix(
    title="Double-Weibull Risk Surface",
    x_axis="Encoding Latency: Safe (30s) <──────> Cliff (120s+)",
    y_axis="Video Start Latency: Safe (100ms) <──────> Degraded (400ms+)",
    q1_title="COMPOUND FAILURE",
    q1_body="Both curves active.<br>Creator cliff + viewer degradation.<br>Non-linear loss.",
    q2_title="SUPPLY CLIFF",
    q2_body="Creator k=4.5 dominates.<br>Binary risk, no graceful degradation.",
    q3_title="OPERATING TARGET",
    q3_body="Both below threshold.<br>Under 0.5M/year at risk.",
    q4_title="DEMAND GRADIENT",
    q4_body="Viewer k=2.28 active.<br>Gradual, optimizable, predictable ROI."
) }}

| Zone | Encoding | Video Start | Revenue at Risk @3M | Dominant Curve | Optimization Strategy |
| :--- | :--- | :--- | ---: | :--- | :--- |
| **Operating Target** | <60s | <200ms | <$0.5M | Neither | Maintain; monitor |
| **Demand Gradient** | <60s | 200-400ms | $0.5M-$2M | Viewer \\(k_v=2.28\\) | Protocol optimization (Part 2); smooth ROI curve |
| **Supply Cliff** | 60-120s | <200ms | $0.9M-$5M | Creator \\(k_c=4.5\\) | GPU provisioning (binary: meet 30s or lose creators) |
| **Compound Failure** | >120s | >200ms | >$5M | Both (correlated) | Emergency: fix supply first (cliff > gradient) |

**The Volatility Asymmetry**

Once the 300ms viewer floor is achieved (Modes 1-2 from [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/) complete), the **remaining risk surface is dominated by the creator cliff**:

{% katex(block=true) %}
\begin{aligned}
\text{Viewer: } 30\% \text{ latency increase (100ms} \to \text{130ms):} \quad & \frac{F_v(0.13)}{F_v(0.10)} = \frac{0.00059}{0.00032} = 1.8\times \\[8pt]
\text{Creator: } 30\% \text{ encoding increase (90s} \to \text{117s):} \quad & \frac{F_c(117)}{F_c(90)} = \frac{0.961}{0.632} = 1.5\times
\end{aligned}
{% end %}

The ratios look similar, but the **absolute levels** are radically different. Viewer abandonment goes from 0.032% to 0.059% - negligible in both cases. Creator abandonment goes from 63.2% to 96.1% - from "characteristic tolerance" to "near-total loss." The \\(k_c = 4.5\\) shape means the operating point at \\(t = \lambda_c\\) is already on the cliff face.

**Architectural implication:** Teams that successfully solve demand-side latency often deprioritize supply infrastructure, not realizing the risk surface has rotated 90°. The volatile axis is now vertical (encoding latency), not horizontal (video start latency). Monitor encoding p95 with the same urgency as video start p95 - but with tighter alerting thresholds, because the creator cliff gives no warning.

### Self-Diagnosis: Is Encoding Latency Causal in YOUR Platform?

The [Causality Test](/blog/microlearning-platform-part1-foundation/#self-diagnosis-is-latency-causal-in-your-platform) pattern applies here with encoding-specific tests. Each test evaluates a distinct dimension: attribution (stated reason), survival (retention curve), behavior (observed actions), and dose-response (gradient effect).

<style>
#tbl_self_diagnosis_encoding + table th:first-of-type { width: 18%; }
#tbl_self_diagnosis_encoding + table th:nth-of-type(2) { width: 41%; }
#tbl_self_diagnosis_encoding + table th:nth-of-type(3) { width: 41%; }
</style>
<div id="tbl_self_diagnosis_encoding"></div>

| Test | PASS (Encoding is Constraint) | FAIL (Encoding is Proxy) |
| :--- | :--- | :--- |
| **1. Stated attribution** | Exit surveys: "slow upload" ranks in top 3 churn reasons with >15% mention rate | "Slow upload" mention rate <5% OR ranks below monetization, audience, tools |
| **2. Survival analysis (encoding stratification)** | Cox proportional hazards model: fast-encoding cohort (p50 <30s) shows HR < 0.80 vs slow cohort (p50 >120s) for 90-day churn, with 95% CI excluding 1.0 and log-rank test p<0.05 | HR confidence interval includes 1.0 (no significant survival difference) OR log-rank p>0.10 |
| **3. Behavioral signal** | >5% of uploads abandoned mid-process (before completion) AND abandoners have >3× churn rate vs completers | <2% mid-process abandonment OR abandonment rate uncorrelated with subsequent churn |
| **4. Dose-response gradient** | Monotonic relationship: 90-day retention decreases with each encoding tier (<30s > 30-60s > 60-120s > >120s), Spearman rho < -0.7, p<0.05 | Non-monotonic pattern (middle tier has lowest retention) OR rho > -0.5 |
| **5. Within-creator analysis** | Same creator's return probability after slow upload (<50%) vs fast upload (>80%): odds ratio >2.0, McNemar test p<0.05 | Within-creator odds ratio <1.5 OR McNemar p>0.10 (return rate independent of encoding speed) |

**Statistical methodology notes:**

- **Test 2 (Survival analysis)**: Use Cox proportional hazards regression with encoding speed as the exposure variable. The hazard ratio (HR) represents the relative risk of churn for slow-encoding creators vs fast-encoding creators. HR < 0.80 means fast-encoding creators have at least 20% lower churn hazard. Verify proportional hazards assumption with Schoenfeld residuals.

- **Test 4 (Dose-response)**: Spearman rank correlation tests monotonicity without assuming linearity. A strong negative correlation (rho < -0.7) indicates that worse encoding consistently predicts worse retention across all tiers.

- **Test 5 (Within-creator)**: Paired analysis controls for creator quality (same creator, different experiences). McNemar's test is appropriate for paired binary outcomes (returned/did not return).

**Decision Rule:**
- **4-5 PASS:** Strong causal evidence. Encoding latency directly drives creator churn. Proceed with GPU pipeline optimization.
- **3 PASS:** Moderate evidence. Encoding is likely causal but consider confounders. Validate with natural experiment (e.g., GPU outage) before major investment.
- **≤2 PASS:** Weak or no evidence. Encoding is proxy for other issues (monetization, discovery, content quality). Fix root causes BEFORE investing $38K/month in encoding infrastructure.

**The constraint:** AWS defaults to 8 GPU instances per region. How many do we actually need? That depends on upload volume, encoding speed, and peak patterns - all derived in the sections that follow.

---

## Upload Architecture

Marcus records a 60-second tutorial on his phone. The file is 87MB - 1080p at 30fps, H.264 encoded by the device (typical bitrate: ~11 Mbps). Between hitting "upload" and seeing "processing complete," every second of delay erodes his confidence in the platform.

**The goal:** Direct-to-S3 upload bypassing app servers, with chunked resumability for unreliable mobile networks.

### Presigned URL Flow

Traditional upload flow routes bytes through the application server - consuming bandwidth, blocking connections, and adding latency. Presigned URLs eliminate this entirely:

{% mermaid() %}
sequenceDiagram
    participant Client
    participant API
    participant S3
    participant Lambda

    Client->>API: POST /uploads/initiate { filename, size, contentType }
    API->>API: Validate (size <500MB, format MP4/MOV)
    API->>S3: CreateMultipartUpload
    S3-->>API: { UploadId: "abc123" }
    API->>API: Generate presigned URLs for parts (15-min expiry each)
    API-->>Client: { uploadId: "abc123", partUrls: [...], partSize: 5MB }

    loop For each 5MB chunk
        Client->>S3: PUT presigned partUrl[i]
        S3-->>Client: { ETag: "etag-i" }
    end
    Note over Client,S3: Direct upload - no app server

    Client->>API: POST /uploads/complete { uploadId, parts: [{partNum, ETag}...] }
    API->>S3: CompleteMultipartUpload
    S3->>Lambda: S3 Event Notification (ObjectCreated)
    Lambda->>Lambda: Validate, create encoding job
    Lambda-->>Client: WebSocket: "Processing started"
{% end %}

**Presigned URL mechanics:**

{% katex(block=true) %}
\begin{aligned}
\text{URL} &= \text{S3\_endpoint} + \text{object\_key} + \text{signature} \\
\text{signature} &= \text{HMAC-SHA256}(\text{secret\_key}, \text{string\_to\_sign}) \\
\text{expiry} &= 15\,\text{minutes (security vs UX balance)}
\end{aligned}
{% end %}

**Benefits:**
- **No app server bandwidth** - 87MB goes directly to S3, not through your $0.50/hour instances
- **Client-side progress** - Native upload progress tracking (23% to 45% to 78% to 100%)
- **Horizontal scaling** - S3 handles unlimited concurrent uploads without load balancer changes

### Chunked Upload with Resumability

Mobile networks fail. Marcus is uploading from a coffee shop with spotty WiFi. At 60% complete (52MB transferred), the connection drops.

**The problem:** Without resumability, Marcus restarts from 0%. Three failed attempts, and he tries YouTube instead.

**The solution:** S3 Multipart Upload breaks the 87MB file into 5MB chunks (17 full chunks + 1 partial = 18 total):

| Chunks | Count | Size Each | Cumulative | Status | Retry Count |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1-10 | 10 | 5MB | 50MB | Completed | 0 |
| 11 | 1 | 5MB | 55MB | Completed | 2 (network retry) |
| 12-17 | 6 | 5MB | 85MB | Completed | 0 |
| 18 | 1 | 2MB | 87MB | Completed | 0 |

**Implementation:**

| Parameter | Value | Rationale |
| :--- | :--- | :--- |
| Chunk size | 5MB | S3 minimum, balances retry cost vs overhead |
| Max retries per chunk | 3 | Limits total retry time |
| Retry backoff | Exponential (1s, 2s, 4s) | Prevents thundering herd |
| Resume window | 24 hours | Multipart upload ID validity period |

**State tracking (client-side):**

{% katex(block=true) %}
\begin{aligned}
\text{progress} &= \frac{\sum_{i=1}^{n} \text{completed}_i}{\text{total\_chunks}} \\
\text{ETA} &= \frac{\text{remaining\_bytes}}{\text{avg\_throughput}_{30s}}
\end{aligned}
{% end %}

Marcus sees: "Uploading... 67% (58MB of 87MB) - 12 seconds remaining"

**Alternative: TUS Protocol**

For teams wanting a standard resumable upload protocol, [TUS](https://tus.io/) provides:
- Protocol-level resumability (not S3-specific)
- Cross-platform client libraries
- Server implementation flexibility

Trade-off: TUS requires server-side storage before S3 transfer, adding one hop. For direct-to-cloud, S3 multipart is more efficient.

### Content Deduplication

Marcus accidentally uploads the same video twice. Without deduplication, the platform:
- Wastes upload bandwidth (87MB × 2)
- Pays for encoding twice (GPU cost per video derived in next section)
- Stores duplicate files (S3 Standard: $0.023/GB/month × 2)

**Solution:** Content-addressable storage using SHA-256 hash:

{% mermaid() %}
sequenceDiagram
    participant Client
    participant API
    participant S3

    Client->>Client: Calculate SHA-256(file) [client-side]
    Client->>API: POST /uploads/check { hash: "a1b2c3d4e5f6..." }

    alt Hash exists in content-addressable store
        API-->>Client: { exists: true, videoId: "v_abc123" }
        Note over Client: Skip upload, link to existing video
    else Hash not found
        API-->>Client: { exists: false }
        Note over Client: Proceed with /uploads/initiate flow
    end
{% end %}

**Hash calculation cost:**

{% katex(block=true) %}
\begin{aligned}
\text{SHA-256 throughput} &\approx 500\,\text{MB/s (modern mobile CPU)} \\
\text{87MB hash time} &= \frac{87}{500} = 0.17\,\text{seconds}
\end{aligned}
{% end %}

Negligible client-side cost, saves bandwidth and encoding for an estimated 3-5% of uploads (based on industry benchmarks for user-generated content platforms: accidental duplicates, re-uploads after perceived failures, cross-device re-uploads).

### File Validation

Before spending GPU cycles on encoding, validate the upload:

| Check | Threshold | Failure Action |
| :--- | :--- | :--- |
| **File size** | <500MB | Reject with "File too large" |
| **Duration** | <5 minutes | Reject with "Video exceeds 5-minute limit" |
| **Format** | MP4, MOV, WebM | Reject with "Unsupported format" |
| **Codec** | H.264, H.265, VP9 | Transcode if needed (adds latency) |
| **Resolution** | ≥720p | Warn "Low quality - consider re-recording" |

**Validation timing:**
- Client-side: Format, size (instant feedback)
- Server-side: Duration, codec (after upload, before encoding)

Rejecting a 600MB file after upload wastes bandwidth. Rejecting it client-side saves everyone time.

Upload infrastructure has hidden complexity that breaks at scale:

**Presigned URL expiration:** 15-minute validity per part URL balances security vs UX. Slow connections need URL refresh mid-upload - client calls `/uploads/initiate` again if part URLs expire.

**Chunked upload complexity:** Client must track chunk state (localStorage or IndexedDB) including `uploadId`, `partNum`, and `ETag` per completed part. Server must handle out-of-order arrival, and `CompleteMultipartUpload` requires all `{partNum, ETag}` pairs.

**Deduplication hash collision:** SHA-256 collision probability is {% katex() %}2^{-128}{% end %} (negligible). False positive risk is zero in practice.

---

## Parallel Encoding Pipeline

Marcus's 60-second 1080p video needs to play smoothly on Kira's iPhone over 5G, Sarah's Android on hospital WiFi, and a viewer in rural India on 3G. This requires Adaptive Bitrate (ABR) streaming - multiple quality variants that the player switches between based on network conditions.

**The performance target:** Encode 60s 1080p video to 4-quality ABR ladder in <20 seconds (P50) / <30 seconds (P95). With NVENC time-slicing 4 concurrent ABR sessions on a single T4 (the driver allows unlimited sessions, but 4 matches our ABR ladder), expect 18-25 seconds typical.

### CPU vs GPU Encoding

The economics are counterintuitive. GPU instances cost less AND encode faster:

| Instance | Type | Hourly Cost | Encoding Speed | 60s Video Time | Cost per Video |
| :--- | :--- | :--- | :--- | :--- | :--- |
| c5.4xlarge | CPU (16 vCPU) | $0.68 | 0.5× realtime | 120 seconds | $0.023 |
| g4dn.xlarge | GPU (T4) | $0.526 | 3-4× realtime | 15-20 seconds | $0.003 |

**Why GPUs win:**

{% katex(block=true) %}
\begin{aligned}
\text{CPU cost per video} &= \frac{\$0.68/\text{hr}}{3600\,\text{s}} \times 120\,\text{s} = \$0.023 \\
\text{GPU cost per video} &= \frac{\$0.526/\text{hr}}{3600\,\text{s}} \times 18\,\text{s} = \$0.003 \\
\text{GPU savings} &= 87\% \text{ cost reduction, } 6.7\times \text{ faster}
\end{aligned}
{% end %}

NVIDIA's NVENC hardware encoder on the T4 GPU handles video encoding in dedicated silicon, leaving CUDA cores free for other work. The T4 has one physical NVENC chip, but NVIDIA's datacenter drivers allow unlimited concurrent sessions via time-slicing. Four ABR quality variants encode concurrently - not in true parallel but with efficient hardware scheduling, achieving near-linear throughput for this workload.

### ABR Ladder Configuration

Four quality variants cover the network spectrum:

| Quality | Resolution | Bitrate | Target Network | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **1080p** | 1920×1080 | 5 Mbps | WiFi, 5G | Kira at home, full quality |
| **720p** | 1280×720 | 2.5 Mbps | 4G LTE | Marcus on commute |
| **480p** | 854×480 | 1 Mbps | 3G, congested 4G | Sarah in hospital basement |
| **360p** | 640×360 | 500 Kbps | 2G, satellite | Rural India fallback |

**Encoding parameters (H.264 for compatibility):**

| Parameter | Value | Rationale |
| :--- | :--- | :--- |
| Codec | H.264 (libx264 / NVENC) | Universal playback support |
| Profile | High | Better compression efficiency |
| Preset | Medium | Quality/speed balance |
| Keyframe interval | 2 seconds | Enables fast seeking |
| B-frames | 2 | Compression efficiency |

**Why H.264 over H.265:**
- H.265 offers 30-40% better compression
- But: 50-100% longer encoding time with hardware NVENC, 2-3× with software, and limited older device support
- Decision: H.264 for uploads (broad compatibility), consider H.265 for high-traffic videos where bandwidth savings justify re-encoding

### Parallel Encoding Architecture

A single GPU instance encodes all 4 qualities concurrently via NVENC time-slicing (T4: 1 NVENC chip handles up to 24 simultaneous 1080p30 sessions):

{% mermaid() %}
graph TD
    subgraph "GPU Encoder Instance"
        Source[Source: 1080p 60s] --> Split[FFmpeg Demux + Scale]
        Split --> E1[NVENC Session 1<br/>1080p @ 5Mbps]
        Split --> E2[NVENC Session 2<br/>720p @ 2.5Mbps]
        Split --> E3[NVENC Session 3<br/>480p @ 1Mbps]
        Split --> E4[NVENC Session 4<br/>360p @ 500Kbps]

        E1 --> Mux[HLS Muxer]
        E2 --> Mux
        E3 --> Mux
        E4 --> Mux

        Mux --> Output[ABR Ladder<br/>master.m3u8]
    end

    Output --> S3[Object Storage Upload]
    S3 --> CDN[CDN Distribution]
{% end %}

**Timeline breakdown:**

| Phase | Duration | Cumulative |
| :--- | :--- | :--- |
| Source download from S3 | 2s | 2s |
| Parallel 4-quality encode | 15s | 17s |
| HLS segment packaging | 1s | 18s |
| S3 upload (all variants) | 2s | 20s |

**Total: 20 seconds** (within <30s budget, leaving 10s margin for queue wait)

### Throughput Calculation

**Per-instance capacity:**

{% katex(block=true) %}
\begin{aligned}
\text{Videos per hour} &= \frac{3600\,\text{s}}{18\,\text{s/video}} = 200\,\text{videos/instance/hour} \\
\text{Daily capacity (1 instance)} &= 200 \times 24 = 4{,}800\,\text{videos/day}
\end{aligned}
{% end %}

**Fleet sizing for 50K uploads/day** (target scale at ~20M DAU; at 3M DAU baseline expect ~7K uploads/day requiring only 2-3 instances):

{% katex(block=true) %}
\begin{aligned}
\text{Baseline instances} &= \frac{50{,}000}{4{,}800} = 10.4 \approx 11\,\text{instances} \\
\text{Saturday peak rate} &= \frac{15{,}000\,\text{videos}}{4\,\text{hours}} = 3{,}750/\text{hr} \\
\text{Peak instances needed} &= \frac{3{,}750}{200} = 19\,\text{instances}
\end{aligned}
{% end %}

With 2.5× buffer for queue management, quota requests, and operational margin: **50 g4dn.xlarge instances** at peak capacity. Buffer derivation: 19 peak instances × 2.5 = 47.5 ≈ 50, where 2.5× accounts for queue smoothing (1.3×), AWS quota headroom (1.2×), and instance failure tolerance (1.6×) - multiplicative: 1.3 × 1.2 × 1.6 ≈ 2.5.

### GPU Instance Comparison

| GPU | Instance | Hourly Cost | NVENC Sessions | Encoding Speed | Best For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **NVIDIA T4** | g4dn.xlarge | $0.526 | Unlimited (1 NVENC chip, time-sliced) | 3-4× realtime | Cost-optimized batch |
| **NVIDIA L4** | g6.xlarge | $0.80 | 3 (hardware) + unlimited (driver) | 4-5× realtime | Next-gen cost-optimized |
| **NVIDIA A10G** | g5.xlarge | $1.006 | 7 | 4-5× realtime | High-throughput |

**Decision: T4 (g4dn.xlarge)** - Best cost/performance ratio for encoding-only workloads. A10G justified only if combining with ML inference. Note: V100 (p3.2xlarge) is not suitable - it lacks an NVENC hardware video encoder and is designed for ML training/HPC, not video encoding.

### Cloud Provider Comparison

| Provider | Instance | GPU | Hourly Cost | Availability |
| :--- | :--- | :--- | :--- | :--- |
| **AWS** | g4dn.xlarge | T4 | $0.526 | High (most regions) |
| **GCP** | n1-standard-4 + T4 | T4 | $0.55 | Medium |
| **Azure** | NC4as_T4_v3 | T4 | $0.526 | Medium |

**Decision: AWS** - Ecosystem integration (S3, ECS, CloudFront), consistent pricing, best availability. Multi-cloud adds complexity without proportional benefit at this scale.

GPU quotas - not encoding speed - kill creator experience.

**Default quotas are 6-25× under-provisioned:** AWS gives 8 vCPUs/region by default, but you need 200 (50 instances) for Saturday peak. Request quota 2 weeks before launch, in multiple regions, with a fallback plan if denied.

**Saturday peak math:** 30% of daily uploads (15K) arrive in 4 hours. Baseline capacity handles 2,200/hour. Queue grows at 1,550/hour, creating 6,200 video backlog and 2.8-hour wait times. Marcus uploads at 5:30 PM, sees "Processing in ~2 hours," and opens YouTube.

**Quota request timeline:** 3-5 business days if straightforward, 5-10 days if justification required.

---

## Cache Warming for New Uploads

Marcus uploads his video at 2:10 PM. Within 5 minutes, 50 followers start watching. The video exists only at the origin (us-west-2). The first viewer in Tokyo triggers a cold cache miss.

**What is a CDN shield?** A shield is a regional caching layer between edge PoPs (Points of Presence - the 200+ locations closest to end users) and the origin. Instead of 200 edges all requesting from origin, 4-6 shields aggregate requests. The request path flows from Edge to Shield to Origin. This reduces origin load and improves cache efficiency.

First-viewer latency breakdown:

{% katex(block=true) %}
\begin{aligned}
\text{Latency}_{\text{cold}} &= \text{Tokyo edge (miss)} + \text{ap-northeast-1 shield (miss)} + \text{us-west-2 origin} \\
&= 10\,\text{ms} + 80\,\text{ms} + 150\,\text{ms} \\
&= 240\,\text{ms} \text{ (cross-Pacific RTT)}
\end{aligned}
{% end %}

By viewer 50, the video is cached at Tokyo edge. But viewers 1-10 paid the cold-start penalty. For a creator with global followers, this first-viewer experience matters.

### Three Cache Warming Strategies

**Option A: Global Push-Based Warming**

Push new video to all 200+ edge PoPs immediately upon encoding completion.

{% katex(block=true) %}
\begin{aligned}
\text{Egress per upload} &= 200\,\text{PoPs} \times 2\,\text{MB (avg video)} = 400\,\text{MB} \\
\text{Daily egress} &= 50\text{K uploads} \times 400\,\text{MB} = 20\,\text{TB/day} \\
\text{Monthly cost} &= 20\,\text{TB} \times 30\,\text{days} \times \$0.08/\text{GB} = \$48\text{K/month} = \$576\text{K/year}
\end{aligned}
{% end %}

**Benefit:** Zero cold-start penalty. All viewers get <50ms edge latency.

**Problem:** 90% of bandwidth is wasted. Average video is watched in 10-20 PoPs, not 200.

---

**Option B: Lazy Pull-Based Caching**

Do nothing. First viewer in each region triggers cache-miss-and-fill.

{% katex(block=true) %}
\begin{aligned}
\text{CDN cache hit rate} &\approx 90\text{-}98\% \text{ (varies with catalog size and popularity distribution)} \\
\text{Origin hit rate} &= 1.7\% \\
\text{Daily origin fetches} &= 60\text{M views} \times 1.7\% = 1.02\text{M fetches} \\
\text{Monthly egress} &= 1.02\text{M} \times 2\,\text{MB} \times 30 = 61.2\,\text{TB} \\
\text{Monthly cost} &= 61.2\,\text{TB} \times \$0.08/\text{GB} = \$4.9\text{K/month} = \$59\text{K/year}
\end{aligned}
{% end %}

**Benefit:** Minimal egress cost. Only actual views trigger caching.

**Problem:** First 10 viewers per region pay 200-280ms cold-start latency. For creators with engaged audiences, this violates the <300ms SLO.

---

**Option C: Geo-Aware Selective Warming (DECISION)**

Predict where Marcus's followers concentrate based on historical view data. Pre-warm only the regional shields serving those followers.

{% mermaid() %}
graph LR
    subgraph "Encoding Complete"
        Video[New Video] --> Analyze[Analyze Creator's<br/>Follower Geography]
    end

    subgraph "Historical Data"
        Analyze --> Data[Marcus: 80% US<br/>15% EU, 5% APAC]
    end

    subgraph "Selective Warming"
        Data --> Shield1[us-east-1 shield<br/>Pre-warm]
        Data --> Shield2[us-west-2 shield<br/>Pre-warm]
        Data --> Shield3[eu-west-1 shield<br/>Pre-warm]
        Data -.-> Shield4[ap-northeast-1<br/>Lazy fill]
    end

    style Shield1 fill:#90EE90
    style Shield2 fill:#90EE90
    style Shield3 fill:#90EE90
    style Shield4 fill:#FFE4B5
{% end %}

**Cost calculation:**

{% katex(block=true) %}
\begin{aligned}
\text{Shields warmed} &= 3 \text{ (top regions by follower \%)} \\
\text{Egress per upload} &= 3 \times 2\,\text{MB} = 6\,\text{MB} \\
\text{Daily egress} &= 50\text{K} \times 6\,\text{MB} = 300\,\text{GB/day} \\
\text{Monthly cost} &= 300\,\text{GB} \times 30 \times \$0.08 = \$720/\text{month} = \$8.6\text{K/year}
\end{aligned}
{% end %}

**Coverage:** 80-90% of viewers get instant edge cache hit (via warmed shields). 10-20% trigger lazy fill from shields to local edge.

### ROI Analysis

| Strategy | Annual Cost | Cold-Start Penalty | Revenue Impact |
| :--- | :--- | :--- | :--- |
| **A: Global Push** | $576K | None (all edges warm) | No revenue loss |
| **B: Lazy Pull** | $59K | 1.7% of views (origin fetches) | ~$51K loss* |
| **C: Geo-Aware** | $8.6K | 0.3% of views (non-warmed regions) | ~$9K loss* |

*Revenue loss derivation: Cold-start views × F(240ms) abandonment (0.24%) × $0.0573 ARPU × 365 days. Example for Option B: 60M × 1.7% × 0.24% × $0.0573 × 365 = $51K/year.*

**Net benefit calculation (C vs A):**

{% katex(block=true) %}
\begin{aligned}
\text{Cost savings} &= \$576\text{K} - \$8.6\text{K} = \$567\text{K/year} \\
\text{Additional revenue loss (C vs A)} &= \$9\text{K/year} \\
\text{Net benefit} &= \$567\text{K} - \$9\text{K} = \$558\text{K/year}
\end{aligned}
{% end %}

**Decision:** Option C (Geo-Aware Selective Warming) - Pareto optimal at 98% of benefit for 1.5% of cost. Two-way door (reversible in 1 week). ROI: $558K net benefit ÷ $8.6K cost = **65× return**.

### Implementation

**Follower geography analysis:**

The system queries the last 30 days of view data for each creator, grouping by region to calculate percentage distribution. For each creator, it returns the top 3 regions by view count. Marcus's query might return: US-East (45%), EU-West (30%), APAC-Southeast (15%). These percentages drive the shield warming priority order.

**Warm-on-encode Lambda trigger:**

{% mermaid() %}
sequenceDiagram
    participant S3
    participant Lambda
    participant Analytics
    participant CDN

    S3->>Lambda: Encoding complete event
    Lambda->>Analytics: Get creator follower regions
    Analytics-->>Lambda: [us-east-1: 45%, us-west-2: 35%, eu-west-1: 15%]

    par Parallel shield warming
        Lambda->>CDN: Warm us-east-1 shield
        Lambda->>CDN: Warm us-west-2 shield
        Lambda->>CDN: Warm eu-west-1 shield
    end

    CDN-->>Lambda: Warming complete (3 shields)
{% end %}

Both extremes of cache warming fail at scale:

**Global push fails:** 90% of bandwidth wasted on PoPs that never serve the video. New creators with 10 followers don't need 200-PoP distribution. Cost scales with uploads, not views (wrong unit economics).

**Lazy pull fails:** First-viewer latency penalty violates <300ms SLO. High-profile creators trigger simultaneous cache misses across 50+ PoPs, causing origin thundering herd.

**Geo-aware wins:** New creators get origin + 2 nearest shields. Viral detection (10× views in 5 minutes) triggers global push. Time-zone awareness weights recent views higher.

---

## Caption Generation (ASR Integration)

Marcus's VLOOKUP tutorial includes spoken explanation: "Select the cell where you want the result, then type equals VLOOKUP, open parenthesis..."

Captions serve three purposes:
1. **Accessibility:** Required for deaf/hard-of-hearing users (WCAG 2.1 AA compliance)
2. **Comprehension:** Studies show 12-40% improvement in comprehension when captions are available (effect varies by audience - strongest for non-native speakers and noisy environments)
3. **SEO:** Google indexes caption text, improving video discoverability

**Requirements:**
- 95%+ accuracy (specialized terminology: "VLOOKUP", "pivot table", "CONCATENATE")
- <30s generation time (parallel with encoding, not sequential)
- Creator review workflow for flagged low-confidence terms

### ASR Provider Comparison

| Provider | Cost/Minute | Accuracy | Custom Vocabulary | Latency |
| :--- | :--- | :--- | :--- | :--- |
| **AWS Transcribe** | $0.024 | 95-97% | Yes | 10-20s for 60s |
| **Google Speech-to-Text** | $0.024 | 95-97% | Yes | 10-20s for 60s |
| **Deepgram** | $0.0043-$0.0125 | 93-95% | Yes | 5-10s for 60s |
| **Whisper (self-hosted)** | GPU cost | 95-98% | Fine-tuning required | 30-60s for 60s |

### Cost Optimization Analysis

**Target:** <$0.005/video (at 50K uploads/day = $250/day budget)

**Current reality:**

{% katex(block=true) %}
\begin{aligned}
\text{AWS Transcribe} &= \$0.024/\text{min} \times 1\,\text{min avg} = \$0.024/\text{video} \\
\text{Daily cost} &= 50\text{K} \times \$0.024 = \$1{,}200/\text{day} \\
\text{Budget gap} &= \$1{,}200 - \$250 = \$950/\text{day over budget}
\end{aligned}
{% end %}

**Options:**

| Option | Cost/Video | Daily Cost | vs Budget | Trade-off |
| :--- | :--- | :--- | :--- | :--- |
| **AWS Transcribe** | $0.024 | $1,200 | 4.8× over | Highest accuracy |
| **Deepgram (Nova-2)** | $0.0043-$0.0125 | $215-$625 | 0.9-2.5× over | 2-3% lower accuracy; price varies by plan (pay-as-you-go vs growth tier) |
| **Self-hosted Whisper** | $0.009 | $442 | 1.8× over | GPU fleet management |
| **Deepgram + Sampling** | $0.006 | $300 | 1.2× over | Only transcribe 50% |

**Decision:** Deepgram for all videos. At growth-tier pricing ($0.0043/min), cost is $215/day - within budget. At pay-as-you-go pricing ($0.0125/min), cost is $625/day - negotiate volume pricing before launching at scale. The alternative (reducing caption coverage) violates accessibility requirements.

**Self-hosted Whisper economics:**

{% katex(block=true) %}
\begin{aligned}
\text{Whisper processing} &= 1\times \text{ realtime on g4dn.xlarge} \\
\text{Videos/hour/instance} &= 60 \\
\text{Instances for 50K/day} &= \frac{50{,}000}{60 \times 24} = 35\,\text{instances} \\
\text{Daily GPU cost} &= 35 \times 24 \times \$0.526 = \$442/\text{day}
\end{aligned}
{% end %}

Self-hosted Whisper costs $442/day vs Deepgram's $625/day - a 29% savings. But:
- Requires dedicated GPU fleet management
- Competes with encoding workload for GPU quota
- Custom vocabulary requires fine-tuning infrastructure

**Conclusion:** Self-hosted becomes cost-effective at >100K uploads/day. At 50K, operational complexity outweighs 29% savings.

**Scale-dependent decision:**

| Scale | Deepgram | Whisper | Whisper Savings | Decision |
| :--- | :--- | :--- | :--- | :--- |
| 50K/day | $625/day | $442/day | $67K/year | **Deepgram** (ops complexity > savings) |
| 100K/day | $1,250/day | $884/day | $133K/year | Break-even (evaluate ops capacity) |
| 200K/day | $2,500/day | $1,768/day | $267K/year | **Whisper** (savings justify complexity) |

**Decision:** Deepgram at 50K/day. Two-way door (switch providers in 2 weeks). Revisit Whisper at 100K+ when ROI exceeds 3× threshold.

### Custom Vocabulary

ASR models struggle with domain-specific terminology:

| Spoken | Default Transcription | With Custom Vocabulary |
| :--- | :--- | :--- |
| "VLOOKUP" | "V lookup" or "V look up" | "VLOOKUP" |
| "eggbeater kick" | "egg beater kick" | "eggbeater kick" |
| "sepsis protocol" | "sepsis protocol" | "sepsis protocol" (correct) |
| "CONCATENATE" | "concatenate" | "CONCATENATE" |

**Vocabulary management:**
- Platform-level: Excel functions, common athletic terms, medical terminology
- Creator-level: Creator uploads custom terms for their domain
- Accuracy improvement: 95% to 97% for specialized content

### Creator Review Workflow

Even with 95% accuracy, 5% of terms are wrong. For a 60-second video with 150 words, that's 7-8 errors.

**Confidence-based flagging:**

{% mermaid() %}
graph TD
    ASR[ASR Processing] --> Confidence{Word Confidence?}

    Confidence -->|≥80%| Accept[Auto-accept]
    Confidence -->|<80%| Flag[Flag for Review]

    Accept --> VTT[Generate VTT]
    Flag --> Review[Creator Review UI]

    Review --> Edit[Creator edits 2-3 terms]
    Edit --> VTT

    VTT --> Publish[Publish with captions]
{% end %}

**Review UI design:**
- Show video with auto-generated captions
- Highlight low-confidence words in yellow
- Inline editing (click word to type correction)
- Marcus reviews 2-3 flagged terms in 15 seconds

**Target:** <30 seconds creator time for caption review (most videos need 0-3 corrections)

### WebVTT Output Format

The ASR output is formatted as WebVTT (Web Video Text Tracks), the standard caption format for web video. Each caption segment includes a timestamp range and the corresponding text. For Marcus's VLOOKUP tutorial, the first three segments might span 0:00-0:03 ("Select the cell where you want the result"), 0:03-0:07 ("then type equals VLOOKUP, open parenthesis"), and 0:07-0:11 ("The first argument is the lookup value").

**Storage and delivery:**
- VTT file stored in S3 alongside video segments
- CDN-cached (small file, high cache hit rate)
- Fetched in parallel with first video segment
- Player renders captions synchronized with playback

### Transcript Generation for SEO

Beyond time-coded captions, the system generates a plain text transcript by concatenating all caption segments without timestamps. This creates a searchable document: "Select the cell where you want the result, then type equals VLOOKUP, open parenthesis. The first argument is the lookup value..." and so on for the entire video.

**SEO benefits:**
- Google indexes transcript text
- Improves search ranking for "VLOOKUP tutorial"
- Screen reader accessibility (full text available)

### Caption Pipeline Timing

{% katex(block=true) %}
\begin{aligned}
\text{Audio extraction} &= 2\,\text{s} \\
\text{ASR processing} &= 10\,\text{s (Deepgram, parallel with encoding)} \\
\text{VTT generation} &= 1\,\text{s} \\
\text{S3 upload} &= 1\,\text{s} \\
\text{Total} &= 14\,\text{s (overlapped with 18s encoding)}
\end{aligned}
{% end %}

Captions complete 4 seconds before encoding. Zero added latency to publish pipeline.

ASR accuracy is not a fixed number - it varies by audio quality. Clear audio achieves 97%+, while background noise or multiple speakers drops to 80-90%. The creator review workflow (confidence-based flagging) is the accuracy backstop - 10-15% of videos need correction.

---

## Real-Time Analytics Pipeline

Marcus uploads at 2:10 PM. Within hours, real-time analytics drive content decisions: the retention curve reveals where viewers drop off (he spots a steep decline during his pivot table walkthrough and plans to restructure that segment), an A/B thumbnail test begins accumulating impressions toward the ~14,000 needed for statistical significance, and the engagement heatmap highlights which segments viewers replay most - signaling where the core teaching value lives.

**Requirement:** <30s latency from view event to dashboard update.

### Event Streaming Architecture

{% mermaid() %}
graph LR
    subgraph "Client"
        Player[Video Player] --> Event[View Event]
    end

    subgraph "Ingestion"
        Event --> Kafka[Kafka<br/>60M events/day]
    end

    subgraph "Processing"
        Kafka --> Flink[Apache Flink<br/>Stream Processing]
        Flink --> Agg[Real-time<br/>Aggregation]
    end

    subgraph "Storage"
        Agg --> Redis[Redis<br/>Hot metrics]
        Agg --> ClickHouse[ClickHouse<br/>Analytics DB]
    end

    subgraph "Serving"
        Redis --> Dashboard[Creator Dashboard]
        ClickHouse --> Dashboard
    end
{% end %}

Each view emits events (`start`, `progress` × 8, `complete`) carrying standard fields (`video_id`, `user_id`, `session_id`, `playback_position_ms`, device/network context). The architecturally significant field is `event_id` - a deterministic SHA-256 hash (not a random UUID) that ensures replayed QUIC 0-RTT packets ([Protocol Choice](/blog/microlearning-platform-part2-video-delivery/#0-rtt-security-trade-offs-performance-vs-safety)) produce identical keys, which are deduplicated server-side. Without this, the analytics pipeline would corrupt retention curves by double-counting replayed views. Full derivation in "Event Deduplication" below.

**Event volume:**

{% katex(block=true) %}
\begin{aligned}
\text{Daily views} &= 60\text{M} \\
\text{Events per view} &= 10 \text{ (start, progress×8, complete)} \\
\text{Daily events} &= 600\text{M} \\
\text{Events/second (avg)} &= \frac{600\text{M}}{86{,}400} = 6{,}944/\text{s} \\
\text{Events/second (peak)} &= 20{,}000/\text{s} \text{ (3× avg)}
\end{aligned}
{% end %}

### Retention Curve Calculation

Flink groups progress events into 5-second buckets, counts distinct viewers per bucket, and writes retention percentages to ClickHouse. The creator dashboard queries the last hour of data, so Marcus sees his retention curve update within 30 seconds of a viewer watching.

The curve tells Marcus where viewers lose interest. If his 60-second accounting tutorial shows 71% retention at 0:30 but drops to 48% by 0:45, Marcus knows the pivot table walkthrough at the 30-second mark is losing viewers. He can re-record that segment or restructure the explanation - the kind of actionable feedback that keeps creators iterating on content quality rather than guessing.

### Event Deduplication and 0-RTT Replay Protection

**The Problem:** QUIC 0-RTT resumption ([Protocol Choice Locks Physics](/blog/microlearning-platform-part2-video-delivery/#0-rtt-security-trade-offs-performance-vs-safety)) sends encrypted application data in the first packet, saving 50ms. However, attackers can replay intercepted packets, potentially causing the same "view" event to be counted multiple times - corrupting retention curves and inflating view counts.

**Why This Matters for Retention Curves:**

A replayed 0-RTT packet generates a duplicate `progress` event, inflating viewer counts for specific retention buckets. One duplicate is invisible. But at scale (600M events/day), even a 0.1% replay rate injects 600K false events daily - enough to shift retention percentages by several points and make A/B test results statistically meaningless.

**The Solution: Deterministic Event IDs**

The `event_id` in the Event Schema is NOT a random UUID - it's a deterministic hash derived from immutable event properties:

{% katex(block=true) %}
\text{event\_id} = \text{SHA-256}(\text{session\_id} \| \text{video\_id} \| \text{event\_type} \| \text{playback\_position\_ms})
{% end %}

**Why this works:**
1. **Deterministic**: Same event always produces the same `event_id`
2. **Collision-resistant**: SHA-256 collision probability is \\(2^{-128}\\) (negligible)
3. **Replay-proof**: Replayed 0-RTT packets regenerate identical `event_id`, which deduplicates

**Deduplication Flow:**

{% mermaid() %}
sequenceDiagram
    participant C as Client (0-RTT)
    participant G as API Gateway
    participant R as Redis (Dedup)
    participant K as Kafka
    participant F as Flink

    Note over C,F: Normal Event Flow
    C->>G: POST /events { event_id: "a1b2c3...", ... }
    G->>R: SETNX event_id TTL=600s
    R-->>G: OK (new key)
    G->>K: Publish event
    K->>F: Process event
    F->>F: Update retention curve

    Note over C,F: Replayed 0-RTT Packet (Attack or Retransmit)
    C->>G: POST /events { event_id: "a1b2c3...", ... }
    G->>R: SETNX event_id TTL=600s
    R-->>G: EXISTS (duplicate)
    G-->>C: 200 OK (idempotent response)
    Note over G,F: Event NOT forwarded to Kafka
{% end %}

**Implementation Details:**

| Component | Mechanism | TTL | Cost |
| :--- | :--- | :--- | :--- |
| Redis dedup layer | `SETNX event_id` (atomic) | 600 seconds | 5ms latency, $50/month |
| Kafka exactly-once | Idempotent producer + transactional consumer | N/A | Built-in |
| Flink watermarks | Late events beyond 10-minute window are dropped | 600 seconds | Built-in |

**Why 600-second TTL:**
- 0-RTT replay attacks must occur within the PSK (Pre-Shared Key) validity window
- QUIC PSK typically valid for 7 days, but practical replay window is <10 minutes (network caching)
- 600s provides 10× safety margin over realistic attack window

**Linking to Protocol Layer:**

The [0-RTT Security Trade-offs](/blog/microlearning-platform-part2-video-delivery/#0-rtt-security-trade-offs-performance-vs-safety) analysis in Part 2 classifies analytics events as "idempotent, replay-safe." This classification depends on the deduplication mechanism described here. Without deterministic `event_id` generation, analytics events would be non-idempotent, and 0-RTT would need to be disabled for the entire analytics path - adding 50ms to every event submission.

**Validation:**

{% katex(block=true) %}
\begin{aligned}
\text{Dedup rate (observed)} &= \frac{\text{SETNX failures}}{\text{Total events}} = 0.02\% \\
\text{Expected (network retransmits)} &\approx 0.01\text{-}0.05\% \\
\text{Anomaly threshold} &> 0.1\% \text{ (triggers security alert)}
\end{aligned}
{% end %}

If dedup rate exceeds 0.1%, it indicates either a replay attack or a client bug generating non-deterministic event_ids - both require investigation.

### Batch vs Stream Processing

| Approach | Latency | Cost | Complexity |
| :--- | :--- | :--- | :--- |
| **Batch (hourly)** | 30-60 minutes | $5K/month | Low |
| **Batch (15-min)** | 15-30 minutes | $8K/month | Low |
| **Stream (Flink)** | 10-30 seconds | $15K/month | High |

**Why stream processing despite 3× cost:**

The <30s latency requirement is non-negotiable for creator retention. Marcus iterates on content in a 4-hour Saturday window. Hourly batch means he sees analytics for Video 1 only after uploading Video 4.

**Cost justification:**

{% katex(block=true) %}
\begin{aligned}
\text{Stream processing cost} &= \$15\text{K/month} = \$180\text{K/year} \\
\text{Creator LTV} &= 10\text{K views/year} \times \$0.0573 \times 2\,\text{year avg tenure} = \$1{,}146 \\
\text{Creator value} &= 30\text{K creators} \times \$1{,}146 = \$34.4\text{M} \\
\text{Churn prevented by real-time analytics} &= 2\% \text{ (creators who iterate faster retain longer)} \\
\text{Revenue protected} &= \$34.4\text{M} \times 2\% = \$688\text{K/year} \\
\text{ROI} &= \frac{\$688\text{K}}{\$180\text{K}} = 3.8\times
\end{aligned}
{% end %}

*Note: Real-time analytics ROI is harder to quantify than encoding latency. The primary justification is creator experience parity with YouTube Studio, not isolated ROI.*

### A/B Testing Framework

Marcus uploads two versions of his thumbnail. Platform splits traffic:

{% mermaid() %}
graph TD
    Upload[Marcus uploads<br/>2 thumbnails] --> Split[Traffic Split<br/>50/50]

    Split --> A[Thumbnail A<br/>Formula result]
    Split --> B[Thumbnail B<br/>Formula bar]

    A --> MetricsA[CTR: 4.2%<br/>1,500 impressions]
    B --> MetricsB[CTR: 5.2%<br/>1,500 impressions]

    MetricsA --> Stats[Statistical Test]
    MetricsB --> Stats

    Stats --> Result[Trending: B +23%<br/>p = 0.19<br/>Need more data]
{% end %}

**Statistical significance calculation:**

{% katex(block=true) %}
\begin{aligned}
\text{CTR}_A &= 4.2\% \text{ (n=1,500)} \\
\text{CTR}_B &= 5.2\% \text{ (n=1,500)} \\
\Delta &= 1.0\% \text{ absolute} = 23.8\% \text{ relative} \\
\chi^2 &= 1.67,\; p = 0.19 \text{ (not significant with n=1,500)}
\end{aligned}
{% end %}

*With only 1,500 impressions per variant, a 1% absolute CTR difference isn't statistically significant. Marcus needs more traffic or a larger effect.*

**Minimum sample size for detecting 1% absolute CTR difference (80% power, 95% confidence):**

{% katex(block=true) %}
n \approx \frac{16 \times p(1-p)}{(\text{MDE})^2} = \frac{16 \times 0.045 \times 0.955}{0.01^2} \approx 6{,}900\text{ per variant}
{% end %}

**Practical implication:** Marcus's video needs ~14,000 total impressions before A/B test results become reliable. For smaller creators, thumbnail optimization requires either larger effect sizes (>30% relative difference) or longer test durations.

### Engagement Heatmap

Beyond retention curves, the pipeline tracks which segments get replayed. When a 5-second bucket shows replay rate >2× the video's baseline (typically 3-7% for educational content, so >6-14% triggers), it signals a segment where viewers are re-watching to follow along - usually a hands-on demonstration or formula entry.

Marcus can act on this: if a specific segment draws heavy replays, he can extract it as a standalone "Quick Tip" video, add a visual callout at that moment, or slow down the pacing in future tutorials covering similar material.

### Dashboard Metrics Summary

| Metric | Definition | Update Latency |
| :--- | :--- | :--- |
| **Views** | Unique video starts | <30s |
| **Retention curve** | % viewers at each timestamp | <30s |
| **Completion rate** | % viewers reaching 95% | <30s |
| **Replay segments** | Timestamps with >2× avg replays | <30s |
| **A/B test results** | CTR/completion by variant | <30s |
| **Estimated earnings** | Views × $0.75/1K | <30s |

Stream processing costs $15K/month (Kafka $3K + Flink $8K + ClickHouse $4K), but delivers 6-second latency - well under the 30s requirement. The 30s budget provides margin for processing spikes. Batch processing would save $10K/month but deliver 15-minute latency, breaking Marcus's iteration workflow.

---

## Encoding Orchestration and Capacity Planning

When Marcus hits upload, a chain of events fires:

{% mermaid() %}
sequenceDiagram
    participant S3
    participant Lambda
    participant SQS
    participant ECS
    participant CDN

    S3->>Lambda: ObjectCreated event
    Lambda->>Lambda: Validate file, extract metadata
    Lambda->>SQS: Create encoding job message

    SQS->>ECS: ECS task pulls job
    ECS->>ECS: GPU encoding (18s)
    ECS->>S3: Upload encoded segments
    ECS->>SQS: Completion message

    SQS->>Lambda: Trigger post-processing
    Lambda->>CDN: Invalidate cache, trigger warming
    Lambda-->>Client: WebSocket: "Video live!"
{% end %}

### Event-Driven Architecture Benefits

**Why event-driven (not API polling):**

| Approach | Coupling | Scalability | Resilience |
| :--- | :--- | :--- | :--- |
| **API polling** | Tight (upload waits for encoding) | Limited (connection held) | Poor (timeout = failure) |
| **Event-driven** | Loose (fire and forget) | Unlimited (queue buffers) | High (retry built-in) |

**Decoupling:** Upload service completes immediately. Marcus sees "Processing..." and can start recording his next video.

**Buffering:** Saturday 2 PM spike of 1,000 uploads in 10 minutes? SQS absorbs the burst. ECS tasks drain the queue at their pace.

**Resilience:** GPU task crashes mid-encode? Message returns to queue, another task retries. Idempotency key prevents duplicate processing.

### ECS Auto-Scaling Configuration

**Scaling metric:** SQS `ApproximateNumberOfMessages`

| Queue Depth | Action | Target State |
| :--- | :--- | :--- |
| <50 | Scale in (if >10 tasks) | Baseline |
| 50-100 | Maintain | Normal |
| >100 | Scale out (+10 tasks) | Burst |
| >500 | Scale out (+20 tasks) | Emergency |

**Scaling math:** Using the 200 videos/task/hour throughput from the capacity calculation:

{% katex(block=true) %}
\begin{aligned}
\text{Queue depth target} &= 100 \text{ (ensures <5 min wait)} \\
\text{Tasks needed} &= \frac{\text{queue depth} \times 18\,\text{s}}{300\,\text{s target}} = \frac{100 \times 18}{300} = 6\,\text{tasks minimum}
\end{aligned}
{% end %}

**Scale-out trigger:**

{% katex(block=true) %}
\text{If } \frac{\text{queue\_depth}}{\text{current\_tasks}} > 15 \text{ videos/task} \Rightarrow \text{add 10 tasks}
{% end %}

### Reserved vs On-Demand Capacity

| Capacity Type | Instances | Utilization | Monthly Cost | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Reserved** | 10 | 60% avg | $2,304 (40% discount) | Baseline weekday traffic |
| **On-Demand** | 0-40 | Burst only | $400-1,600/peak day | Saturday/Sunday peaks |

**Reserved instance calculation:**

{% katex(block=true) %}
\begin{aligned}
\text{Reserved hourly} &= \$0.526 \times 0.6 = \$0.316/\text{hr} \\
\text{Monthly (10 instances)} &= 10 \times \$0.316 \times 730 = \$2{,}307/\text{month}
\end{aligned}
{% end %}

**On-demand burst calculation:**

{% katex(block=true) %}
\begin{aligned}
\text{Saturday peak} &= 15\text{K videos in 4 hours} \\
\text{Total tasks needed} &= \frac{15{,}000}{200 \times 4} = 19\,\text{tasks} \\
\text{On-demand tasks} &= 19 - 10\,\text{reserved} = 9\,\text{tasks} \\
\text{Cost per Saturday} &= 9 \times 4 \times \$0.526 = \$19/\text{Saturday}
\end{aligned}
{% end %}

### GPU Quota Management

Building on the quota bottleneck discussed above, here are AWS-specific quotas by region:

| Region | Default Quota | Required | Request Lead Time |
| :--- | :--- | :--- | :--- |
| us-east-1 | 8 vCPUs (2 g4dn.xlarge) | 200 vCPUs (50 instances) | 3-5 business days |
| us-west-2 | 8 vCPUs | 100 vCPUs (backup region) | 3-5 business days |
| eu-west-1 | 8 vCPUs | 50 vCPUs (EU creators) | 5-7 business days |

Apply the mitigation strategy from the architectural section: request 2 weeks before launch, request 2× expected need, and have fallback regions approved.

### Graceful Degradation

When GPU quota is exhausted (queue depth >1,000):

**Option A: CPU Fallback (GDPR-safe)**

| Mode | Encoding Time | User Message |
| :--- | :--- | :--- |
| GPU (normal) | 18s | "Processing..." |
| CPU (fallback) | 120s | "High demand - ready in ~10 minutes" |

**Implementation:** Route jobs to c5.4xlarge fleet *in the same region* when queue exceeds threshold. CPU fallback is always same-region, making it GDPR-compliant by default - no cross-border data transfer occurs. This matters: when GPU quota is exhausted, the fallback order should be CPU (same-region, GDPR-safe, 120s) before same-jurisdiction overflow (e.g., eu-west-1 → eu-central-1, GDPR-safe, ~20s).

**Option B: Rate Limiting**

Prioritize by creator tier:
1. Premium creators (paid subscription): GPU queue
2. Top creators (>10K followers): GPU queue
3. New creators: CPU queue during peak
4. Notification: "Video processing may take longer due to high demand"

**Option C: Multi-Region Encoding**

If us-east-1 queue >500, route overflow to us-west-2:

{% mermaid() %}
graph TD
    Job[Encoding Job] --> Router{Queue Depth?}

    Router -->|<500| East[us-east-1<br/>Primary]
    Router -->|≥500| West[us-west-2<br/>Overflow]

    East --> S3East[S3 us-east-1]
    West --> S3West[S3 us-west-2]

    S3East --> Replicate[Cross-region<br/>replication]
    S3West --> Replicate

    Replicate --> CDN[CloudFront<br/>Origin failover]
{% end %}

**This diagram is incomplete.** It omits the critical constraint: GDPR data residency. Routing an EU creator's upload to a US GPU instance constitutes cross-border data transfer under GDPR Article 44. The following analysis quantifies the latency penalty and reclassifies multi-region encoding from a two-way door to a one-way door.

#### Ingress Latency Penalty: EU Creator → US GPU

When eu-west-1 quota is exhausted and Marcus (Frankfurt) is routed to us-east-1:

{% katex(block=true) %}
\begin{aligned}
\text{Cross-region upload:} \quad & \frac{87\text{MB} \times 8}{50\,\text{Mbps (cross-Atlantic)}} = 13.9\text{s} \\[4pt]
\text{Same-region upload:} \quad & \frac{87\text{MB} \times 8}{500\,\text{Mbps (intra-region)}} = 1.4\text{s} \\[4pt]
\text{Upload penalty:} \quad & +12.5\text{s}
\end{aligned}
{% end %}

The 50 Mbps cross-Atlantic estimate is conservative - it reflects S3 Transfer Acceleration with CloudFront edge routing (without acceleration, raw cross-Atlantic throughput for large uploads is 30-80 Mbps depending on TCP window scaling and path congestion). Intra-region S3 throughput reaches 500+ Mbps due to co-located availability zones.

**Full pipeline comparison:**

| Stage | Same-Region | Cross-Region (EU→US) | Delta |
| :--- | ---: | ---: | ---: |
| S3 upload | 1.4s | 13.9s | +12.5s |
| GPU encoding | 18.0s | 18.0s | 0s |
| S3 replication back to EU | 0s | 8.0s | +8.0s |
| **Total pipeline** | **19.4s** | **39.9s** | **+20.5s** |

Cross-region encoding is **2.1× slower** - the GPU doesn't care where the bits came from, but network physics adds 20.5 seconds of overhead.

#### Creator Patience Threshold Violation

Applying the creator Weibull model (\\(\lambda_c = 90\\)s, \\(k_c = 4.5\\)) to both pipeline times:

{% katex(block=true) %}
\begin{aligned}
F_c(19.4\text{s}) &= 1 - \exp\left[-\left(\frac{19.4}{90}\right)^{4.5}\right] = 0.001 \quad (0.1\% \text{ - deep in safe zone}) \\[6pt]
F_c(39.9\text{s}) &= 1 - \exp\left[-\left(\frac{39.9}{90}\right)^{4.5}\right] = 0.025 \quad (2.5\% \text{ - entering ramp}) \\[6pt]
F_c(60\text{s}) &= 1 - \exp\left[-\left(\frac{60}{90}\right)^{4.5}\right] = 0.149 \quad (14.9\% \text{ - danger zone})
\end{aligned}
{% end %}

Cross-region routing doesn't hit the \\(k_c = 4.5\\) cliff (that's at ~90-120s), but it exits the safe zone. At 39.9s, creator abandonment is **25× higher** than same-region (2.5% vs 0.1%). And this is the *best case* - any additional delay from network congestion, S3 throttling, or replication backlog pushes toward 60s where \\(F_c = 14.9\\%\\).

The 30s creator patience threshold from the Upload Architecture section maps directly:

| Pipeline Time | Perception | \\(F_c\\) | Cross-Region Risk |
| :--- | :--- | ---: | :--- |
| **<30s** | Acceptable (YouTube parity) | <0.7% | Same-region achieves this |
| **30-60s** | "This is slow" - 5% open competitor tab | 0.7%-14.9% | Cross-region lands here |
| **60-120s** | "Something is wrong" - 15% comparing | 14.9%-97.4% | Cross-region + any delay |
| **>120s** | Platform abandonment | >97.4% | CPU fallback (Option A) |

**Verdict:** Cross-region encoding violates the <30s SLO. Same-region encoding (19.4s) is safely under threshold. The 20.5s penalty is not catastrophic, but it moves the operating point from "safe" to "degraded" - and for a supply-side constraint with \\(k_c = 4.5\\) cliff behavior, operating in the degraded zone leaves no margin for variance.

#### GDPR: Physics Meets Regulation

[Latency Kills Demand](/blog/microlearning-platform-part1-foundation/) establishes region-pinned storage for GDPR compliance (EU data stored in EU infrastructure). [Protocol Choice Locks Physics](/blog/microlearning-platform-part2-video-delivery/) establishes that GDPR fine exposure ($13M) exceeds QUIC protocol benefit ($0.38M @3M DAU) - compliance always takes precedence.

Cross-region GPU routing for EU creators creates a direct conflict with both principles:

**Legal exposure:** Creator video content contains personal data - faces, voices, location metadata, device identifiers. Processing in us-east-1 constitutes cross-border data transfer under GDPR Article 44. AWS provides Standard Contractual Clauses (SCCs) for US processing, but post-Schrems II (CJEU C-311/18, 2020), these require:
- Transfer impact assessments per destination country
- Supplementary technical measures (encryption in transit is necessary but may not be sufficient)
- Documentation that US surveillance laws don't undermine protections

**The regulatory asymmetry:**

{% katex(block=true) %}
\begin{aligned}
\text{Cross-region benefit:} \quad & \text{Avoid 120s CPU fallback during peak} \\
&\approx 975 \text{ videos/Saturday × \$0.15 GPU savings} = \$146\text{/week} \\[6pt]
\text{GDPR fine exposure:} \quad & \text{Up to } 4\% \text{ of annual turnover or €20M} \\
&\text{At 3M DAU: } \$13\text{M (from Part 2 analysis)} \\[6pt]
\text{Risk ratio:} \quad & \frac{\$13\text{M fine}}{\$7.6\text{K/year savings}} = 1{,}710\times
\end{aligned}
{% end %}

No engineering optimization justifies 1,710× regulatory risk. The cross-region overflow path is a regulatory one-way door disguised as an operational two-way door.

#### Reclassification: Two-Way Door → One-Way Door

The blast radius comparison table below currently classifies multi-region encoding as:

| Decision | Blast Radius | T_recovery | Review Scope |
| :--- | ---: | :--- | :--- |
| Multi-region Encoding (current) | $0.43M | 3 months | Senior Engineer + Tech Lead |

This assumes operational blast radius only. With GDPR constraint:

| Decision | Blast Radius | T_recovery | Review Scope |
| :--- | ---: | :--- | :--- |
| Multi-region Encoding **(GDPR-constrained)** | **$13.4M** | **12-18 months** | **Cross-functional / ARB + Legal** |

The reclassification is driven by three irreversibility factors:

1. **Legal irreversibility.** Once personal data has been processed in a non-EU jurisdiction, the GDPR violation has occurred. You cannot "un-process" the data. Even if you immediately revert routing, the transfer is on record.

2. **Contractual lock-in.** DPA (Data Processing Agreement) amendments, transfer impact assessments, and SCC supplements create 6-12 month legal procurement cycles. These are not engineering decisions - they require Legal, Privacy, and Compliance review.

3. **Architecture lock-in.** Per-region GPU quota management, per-region S3 buckets, and region-aware routing logic create infrastructure that is 6+ months to restructure. The "3-month recovery" estimate assumed changing a routing rule; the actual recovery requires unwinding legal agreements and infrastructure simultaneously.

#### The Correct Architecture: Region-Pinned GPU Pools

Instead of cross-jurisdiction overflow, deploy dedicated GPU capacity per data residency zone:

{% mermaid() %}
graph TD
    Job[Encoding Job] --> GeoRouter{Creator<br/>Region?}

    GeoRouter -->|EU creator| EURouter{eu-west-1<br/>Queue?}
    GeoRouter -->|US creator| USRouter{us-east-1<br/>Queue?}
    GeoRouter -->|APAC creator| APACRouter{ap-southeast-1<br/>Queue?}

    EURouter -->|<500| EU1[eu-west-1<br/>GPU Pool]
    EURouter -->|≥500| EU2[eu-central-1<br/>EU Overflow]

    USRouter -->|<500| US1[us-east-1<br/>GPU Pool]
    USRouter -->|≥500| US2[us-west-2<br/>US Overflow]

    APACRouter -->|<500| AP1[ap-southeast-1<br/>GPU Pool]
    APACRouter -->|≥500| AP2[ap-northeast-1<br/>APAC Overflow]

    EU1 --> S3EU[S3 eu-west-1]
    EU2 --> S3EU
    US1 --> S3US[S3 us-east-1]
    US2 --> S3US
    AP1 --> S3AP[S3 ap-southeast-1]
    AP2 --> S3AP

    S3EU --> CDN[CloudFront<br/>Multi-origin]
    S3US --> CDN
    S3AP --> CDN
{% end %}

**Overflow rules:**
- **US overflow:** us-east-1 → us-west-2 (same jurisdiction - no GDPR issue)
- **EU overflow:** eu-west-1 → eu-central-1 (same jurisdiction - Frankfurt stays in EU)
- **APAC overflow:** ap-southeast-1 → ap-northeast-1 (subject to local data protection laws)
- **NEVER:** eu-west-1 → us-east-1 (GDPR Article 44 violation)

**Cost impact:**

| Architecture | GPU Capacity | Monthly Cost | Pipeline % |
| :--- | :--- | ---: | ---: |
| Single-region + overflow | 200 vCPUs (1 region) | $4,380 | 11% |
| Region-pinned pools | 375 vCPUs (3 regions) | $8,210 | 21% |
| **Delta** | +175 vCPUs | **+$3,830/mo** | +10pp |

The +$3,830/month ($46K/year) cost is 0.35% of the GDPR fine exposure ($13M). This is the definition of asymmetric risk: spend $46K to avoid $13M exposure.

**Decision:** Region-pinned GPU pools as primary strategy. Same-jurisdiction overflow (eu-west-1 → eu-central-1) maintains <30s SLO without GDPR exposure. CPU fallback (Option A) remains the last-resort degradation - and is always same-region, making it GDPR-safe by default.

### Peak Traffic Patterns

| Time Window | % Daily Uploads | Strategy |
| :--- | :--- | :--- |
| **Saturday 2-6 PM** | 30% | Full burst capacity, same-jurisdiction overflow |
| **Sunday 10 AM-2 PM** | 15% | 50% burst capacity |
| **Weekday 6-9 PM** | 10% | Baseline + 20% buffer |
| **Weekday 2-6 AM** | 2% | Minimum (scale-in) |

**Predictive scaling:** Schedule scale-out 30 minutes before expected peaks. Don't wait for queue to grow.

GPU quotas are the real bottleneck - not encoding speed. Default quota (8 vCPUs = 2 instances = 400 videos/hour) cannot handle Saturday peak (3,750/hour). For extreme spikes (viral creator uploads 100 videos): queue fairly, show accurate ETA, don't promise what you can't deliver.

---

## Cost Analysis: Creator Pipeline Infrastructure

The previous sections detailed what to build. This section answers whether you can afford it - and whether the investment pays back.

**Target:** Creator pipeline (encoding + captions + analytics) within infrastructure budget.

### Cost Components at 50K Uploads/Day

| Component | Daily Cost | Monthly Cost | % of Pipeline |
| :--- | :--- | :--- | :--- |
| **GPU encoding** | $146 | $4,380 | 11% |
| **ASR captions** | $625 | $18,750 | 48% |
| **Analytics (Kafka+Flink+CH)** | $500 | $15,000 | 38% |
| **S3 storage** | $2.30 | $69 | <1% |
| **Lambda/orchestration** | $15 | $450 | 1% |
| **TOTAL** | **$1,288** | **$38,649** | 100% |

### Cost Per DAU

{% katex(block=true) %}
\begin{aligned}
\text{Monthly pipeline cost} &= \$38{,}649 \\
\text{DAU} &= 3\text{M} \\
\text{Cost per DAU} &= \frac{\$38{,}649}{3{,}000{,}000} = \$0.0129/\text{DAU}
\end{aligned}
{% end %}

**Budget check:**
- Total infrastructure target: <$0.20/DAU (from latency analysis cost optimization driver)
- Creator pipeline: $0.0129/DAU (6.5% of total budget)
- Remaining for CDN, compute, ML, etc.: $0.187/DAU

**Constraint Tax Check (Check #1 Economics):** This \\(\\$0.46\\)M/year pipeline cost is the second component of the series' cumulative Constraint Tax (\\(\\$2.90\\)M dual-stack from [Protocol Choice](/blog/microlearning-platform-part2-video-delivery/) + \\(\\$0.46\\)M pipeline = \\(\\$3.36\\)M/year). At 10% operating margin, the Constraint Tax requires **1.61M DAU to break even** and **4.82M DAU to clear the 3× threshold** - validating the series' 3M DAU baseline as approaching the minimum scale for these recommendations. See [Latency Kills Demand: Constraint Tax Breakeven](/blog/microlearning-platform-part1-foundation/) for the full derivation and sensitivity analysis. Platforms below 1.6M DAU cannot afford this pipeline - use CPU encoding and batch analytics instead.

### ROI Threshold Validation (Law 4)

Using the Universal Revenue Formula (Law 1) and 3× ROI threshold (Law 4):

{% katex(block=true) %}
\text{ROI} = \frac{\Delta R_{\text{annual}}}{C_{\text{annual}}} = \frac{\text{Creator Churn Prevented} \times \text{Content Multiplier} \times \text{ARPU}}{\text{Pipeline Cost}} \geq 3.0
{% end %}

| Scale | Creators | 5% Churn Loss | Revenue Protected | Pipeline Cost | ROI | Threshold |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| **3M DAU** | 30,000 | 1,500 | $859K/year | $464K/year | **1.9×** | Below 3× |
| **10M DAU** | 100,000 | 5,000 | $2.87M/year | $1.26M/year | **2.3×** | Below 3× |
| **50M DAU** | 500,000 | 25,000 | $14.3M/year | $5.04M/year | **2.8×** | Below 3× |

Creator pipeline ROI never exceeds 3× threshold at any scale analyzed.

**Why This Differs from Strategic Headroom:**

The [Strategic Headroom framework](/blog/microlearning-platform-part1-foundation/#strategic-headroom-investments) justifies sub-threshold investments when ROI scales super-linearly (fixed costs, linear revenue). Creator Pipeline does NOT qualify:

| Criterion | Protocol Migration | Creator Pipeline | Assessment |
| :--- | :--- | :--- | :--- |
| ROI @3M DAU | 0.60× | 1.9× | Both below threshold |
| ROI @10M DAU | 2.0× | 2.3× | Protocol scales; Pipeline doesn't |
| Scale factor | 3.3× | 1.2× | **Pipeline costs scale with creators** |
| Cost structure | Fixed ($2.90M) | Variable ($0.0129/DAU) | Near-linear scaling (fixed analytics amortize slightly) |

Creator Pipeline ROI scales only 1.2× (1.9× → 2.3×) because **both revenue and costs scale linearly with creator count**. More creators = more encoding = more costs. The fixed-cost leverage that enables Strategic Headroom doesn't apply.

**Existence Constraint Classification:**

Creator Pipeline requires a different justification: **Existence Constraints**. The 3× ROI threshold (Law 4) assumes the platform continues to exist whether or not the optimization is made. For creator infrastructure, that assumption fails.

**System-Dependency Graph:**

The platform's value chain has a strict dependency ordering. If any node's output goes to zero, every downstream node also goes to zero - regardless of how well-optimized it is.

{% mermaid() %}
graph LR
    A["Creators<br/>(supply)"] --> B["Content Catalog<br/>(50K videos)"]
    B --> C["Recommendation Engine<br/>(ML personalization)"]
    C --> D["Viewer Engagement<br/>(session depth)"]
    D --> E["Revenue<br/>($62.7M/year @3M DAU)"]

    B --> F["Prefetch Model<br/>(cache hit rate)"]
    F --> D

    style A fill:#FF6B6B,stroke:#333
    style E fill:#90EE90,stroke:#333
{% end %}

Every revenue dollar flows through the Creator node. The partial derivative formalizes this:

{% katex(block=true) %}
\frac{\partial \text{Revenue}}{\partial \text{Creators}} \neq 0 \quad \text{(creators contribute to revenue)}
{% end %}

But the existence constraint is stronger than "creators contribute." It's that creator count has a **minimum viable threshold** below which the platform cannot sustain viewer engagement:

{% katex(block=true) %}
\exists \; C_{\min} \text{ such that } C < C_{\min} \implies \frac{\partial \text{Platform}}{\partial \text{Optimization}_i} = 0 \quad \forall \; i
{% end %}

Below \\(C_{\min}\\), no optimization matters. Latency improvements, protocol migration, ML personalization - all produce zero marginal revenue because the content catalog is too thin to retain viewers. The ROI formula divides revenue-protected by cost, but if revenue-protected is zero (because the platform doesn't exist), ROI is undefined, not merely sub-threshold.

**Why this renders Law 4 secondary:**

Law 4 asks: "Does this investment return 3× its cost?" That question presupposes the platform survives either way. For creator infrastructure, the counterfactual isn't "platform with slower encoding" - it's "platform with insufficient content → viewer churn → revenue collapse → platform death." The ROI framework compares two operating states. An existence constraint compares an operating state to a non-operating state.

| Framework | Assumes | Applies When | Creator Pipeline |
| :--- | :--- | :--- | :--- |
| **Law 4 (3× ROI)** | Platform survives either way | Optimizations within a viable system | ❌ Fails: 1.9× at 3M DAU |
| **Strategic Headroom** | ROI scales super-linearly | Fixed costs, scaling revenue | ❌ Fails: costs scale linearly with creators |
| **Existence Constraint** | Platform dies without investment | Supply-side minimum viable threshold | ✅ Applies: no creators = no platform |

**The distinction matters:**
- **Strategic Headroom** (Protocol): Sub-threshold ROI justified by super-linear scaling at achievable scale
- **Existence Constraint** (Creator Pipeline): Sub-threshold ROI justified because the counterfactual is platform non-existence

**Decision:** Proceed with creator pipeline despite sub-3× ROI. Existence constraints supersede optimization thresholds. This is NOT Strategic Headroom - it's a stricter exception where the ROI denominator (cost) is finite but the penalty for not investing is unbounded.

**But existence constraints are dangerous.** Any team can claim their project is "existential." Without falsification criteria, the existence constraint becomes a blank check for inefficient engineering spend. The next section defines what evidence would disprove the claim.

### Falsification Criteria: When Encoding Speed Is NOT an Existence Constraint

The existence constraint argument for creator pipeline rests on a causal chain: encoding speed → creator retention → content supply → platform viability. Each link in the chain is an empirical claim that can be tested and falsified.

**The causal chain:**

{% mermaid() %}
graph LR
    A["Encoding Speed<br/>(<30s target)"] -->|"Claim: causes"| B["Creator Retention<br/>(5% annual churn)"]
    B -->|"Claim: causes"| C["Content Supply<br/>(50K videos)"]
    C -->|"Claim: causes"| D["Platform Viability<br/>(revenue > costs)"]

    E["Monetization<br/>($/1K views)"] -->|"Alternative cause"| B
    F["Audience Size<br/>(views/video)"] -->|"Alternative cause"| B
    G["Competing Platforms<br/>(TikTok, YouTube)"] -->|"Alternative cause"| B
{% end %}

**Falsification tests - any ONE of these disproves the existence constraint for encoding speed:**

| # | Test | Falsification Threshold | Data Required | Interpretation if Falsified |
| :--- | :--- | :--- | :--- | :--- |
| F1 | Correlation between encoding speed and creator 90-day retention | \\(r < 0.10\\) (encoding) while \\(r > 0.50\\) (monetization) | Creator cohort analysis: retention ~ encoding_p95 + revenue_per_1K + audience_size | Encoding is hygiene, not driver. Invest in creator monetization instead. |
| F2 | Within-creator encoding speed variation vs churn | \\(\hat{\beta}_{\text{encoding}} < 0.05\\) in fixed-effects logistic regression | Panel data: same creator experiences different encoding times across uploads | No causal effect. Encoding correlation is confounded by platform quality perception. |
| F3 | Natural experiment: encoding queue spike (>120s) with no creator churn increase | Churn rate during spike ≤ 1.1× baseline | Queue spike incident data (planned maintenance, GPU quota exhaustion) | Creators tolerate encoding delays. The \\(k_c = 4.5\\) cliff model is wrong. |
| F4 | Creator exit survey: encoding speed ranked below top-3 churn reasons | <10% cite encoding speed | Structured exit surveys (n>200, forced-rank of 8+ factors) | Other factors dominate. Encoding investment has lower priority. |
| F5 | Platform comparison: competitors with slower encoding retain creators equally | No significant retention difference (p>0.05) | Cross-platform creator cohort (creators active on multiple platforms) | Encoding speed is not a competitive differentiator at current quality levels. |
| F6 | Content catalog below \\(C_{\min}\\) but platform survives via licensed/curated content | Platform retains >50% of DAU with <1,000 active creators | Historical data or A/B test with content substitution | Creator supply is substitutable. Existence constraint doesn't apply. |

**What "falsified" means operationally:**

If F1 and F2 both hold (encoding speed has negligible correlation AND no causal effect on retention), then encoding speed is a **hygiene factor** - it needs to be "good enough" (say, <120s) but doesn't justify the $464K/year pipeline investment to achieve <30s. The rational response:

1. Use CPU encoding (~120s, $50K/year) instead of GPU pipeline ($464K/year)
2. Redirect $414K/year savings to the actual retention driver (likely monetization: higher revenue share, creator fund, or audience growth tools)
3. Reclassify creator pipeline from "existence constraint" to "hygiene factor" in the constraint sequence

**What "not falsified" means operationally:**

If F1 shows \\(r > 0.30\\) for encoding speed AND F2 shows \\(\hat{\beta}_{\text{encoding}} > 0.20\\) AND F3 shows churn spikes during encoding delays, the existence constraint is validated. Proceed with the GPU pipeline investment, but instrument the causal chain continuously - existence constraints can become hygiene factors as the platform matures and creators build switching costs (audience, revenue, community).

**Current status:** The existence constraint is **hypothesized, not validated.** The UX threshold tiers (0%/5%/15%/65%/95% churn at encoding delays) are heuristics from the [creator patience analysis](#creator-patience-model-adapted-weibull) above, not measured data. The \\(k_c = 4.5\\) Weibull shape parameter is hypothesized. Proceeding with the $464K/year investment is a bet on the causal chain being correct - a defensible bet given the asymmetric risk (platform death if wrong about encoding not mattering vs $414K/year overspend if wrong about encoding mattering), but a bet nonetheless.

**Required instrumentation (before first renewal of GPU commitments):**

1. Add `encoding_complete_timestamp` to creator upload events
2. Run F2 (within-creator fixed-effects regression) on first 6 months of data
3. Deploy exit survey (F4) for all creators who go inactive >30 days
4. If F1+F2 falsify the encoding→retention link, downgrade to CPU encoding at next GPU commitment renewal

### Cost Derivations

**GPU encoding:** 50K videos × 18s = 250 GPU-hours/day × $0.526/hr + 10% overhead = **$146/day** (11% of pipeline)

**ASR captions:** 50K videos × 1 min × $0.0125/min = **$625/day** (48% of pipeline - the dominant cost)

### Sensitivity Analysis

| Scenario | Variable | Pipeline Cost | Impact |
| :--- | :--- | :--- | :--- |
| **Baseline** | 50K uploads, Deepgram | $38.6K/month | - |
| **Upload 2×** | 100K uploads | $67.4K/month | +75% |
| **ASR +20%** | Deepgram price increase | $42.4K/month | +10% |
| **GPU +50%** | Instance price increase | $40.8K/month | +6% |
| **Self-hosted Whisper** | At 100K uploads | $52.1K/month | +35% (but scales better) |

Caption cost dominates. A 20% Deepgram price increase has more impact than a 50% GPU price increase.

### Cost Optimization Opportunities

| Optimization | Savings | Trade-off |
| :--- | :--- | :--- |
| **Batch caption API calls** | 10-15% | Adds 5-10s latency |
| **Off-peak GPU scheduling** | 20% (spot instances) | Risk of interruption |
| **Caption only >30s videos** | 40% | Short videos lose accessibility |
| **Self-hosted Whisper at scale** | 29% at 100K+/day | Operational complexity (see ASR Provider Comparison) |

Two costs are non-negotiable:

**Captions ($228K/year floor):** WCAG compliance requires captions. Cannot reduce coverage without legal/accessibility risk.

**Analytics ($180K/year):** <30s latency requires stream processing. Batch would save $10K/month but break creator iteration workflow. Creator retention ($859K/year conservative) justifies the spend.

Pipeline cost per DAU decreases with scale ($0.0129 at 3M → $0.0084 at 50M) as fixed analytics costs amortize.

---

### Anti-Pattern: GPU Infrastructure Before Creator Economics

Consider this scenario: A 200K DAU platform invests $38K/month in GPU encoding infrastructure before validating that encoding speed drives creator retention.

| Decision Stage | Local Optimum (Engineering) | Global Impact (Platform) | Constraint Analysis |
| :--- | :--- | :--- | :--- |
| Initial state | 2-minute encoding queue, 8% creator churn | 2,000 creators, $0.75/1K view payout | Unknown root cause |
| Infrastructure investment | Encoding → 30s (93% improvement) | Creator churn unchanged at 8% | Metric: Encoding optimized |
| Cost increases | Pipeline added: $38.6K/month (+$464K/year) | Burn rate increases, runway shrinks | Wrong constraint optimized |
| Reality check | Creators leave for TikTok's $0.02-0.04 CPM | Should have improved revenue share | Encoding wasn't the constraint |
| Terminal state | Fast encoding, no creators left | Platform dies with excellent infrastructure | Local optimum, wrong problem |

**The Vine lesson:** Vine achieved instant video publishing in 2013 - technically superior to competitors. Creators still left because they couldn't monetize 6-second videos. When TikTok launched, they prioritized Creator Fund ($200M in 2020) within 2 years. Infrastructure follows economics, not the reverse.

**The Twitch contrast:** Twitch encoding is notoriously slow (re-encoding can take hours for VODs). Creators stay because of subscriber revenue, bits, and established audiences. Encoding speed is a hygiene factor, not a differentiator.

**Correct sequence:** Validate encoding causes churn (instrumented funnel, exit surveys, cohort analysis), THEN invest in GPU infrastructure. Skipping validation gambles $456K/year on an unverified assumption.

---

## When NOT to Optimize Creator Pipeline

Six scenarios where the math says "optimize" but reality says "wait":

| Scenario | Signal | Why Defer | Action |
| :--- | :--- | :--- | :--- |
| **Demand unsolved** | p95 >400ms, no protocol migration | Users abandon before seeing content | Fix latency first |
| **Churn not measured** | No upload→retention attribution | May churn for other reasons | Instrument funnel, prove causality |
| **Volume <500K DAU** | <5K creators, <10K uploads/day | ROI = 0.4× (fails threshold) | Use CPU encoding for PMF |
| **GPU quota not secured** | Launch <2 weeks, no request | Default 8 instances = 2.8hr queue | Submit immediately, have CPU fallback |
| **Caption budget rejected** | Finance denies $625/day | WCAG non-negotiable (>$100K lawsuits) | Escalate as compliance |
| **Analytics team unavailable** | No Kafka/Flink expertise | Real-time requires specialists | Use batch ($5K/mo, 30-60min latency) |

Creator pipeline is the THIRD constraint. Solving supply before demand is capital destruction. The sequence matters.

---

### One-Way Door Analysis: Pipeline Infrastructure Decisions

| Decision | Reversibility | Blast Radius (\\(R_{\text{blast}}\\)) | Recovery Time | Analysis Depth |
| :--- | :--- | ---: | :--- | :--- |
| **GPU instance type (T4 vs A10G)** | Two-way | $50K | 1 week | Ship & iterate |
| **ASR provider (Deepgram vs Whisper)** | Two-way | $180K | 2 weeks | A/B test first |
| **Analytics architecture (Batch vs Stream)** | One-way | **$859K** | 6 months | 100× rigor |
| **Multi-region encoding** (same-jurisdiction) | Two-way | $429K | 3 months | Ship & iterate |
| **Multi-region encoding** (cross-jurisdiction/GDPR) | **One-way** | **$13.4M** | 12-18 months | **Cross-functional / ARB + Legal** |

**Blast radius derivations** (using the formula from [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/#one-way-doors-when-you-cant-turn-back)):

| Decision | Calculation | Result |
| :--- | :--- | ---: |
| GPU instance type | $50K/year delta × 1 week recovery ≈ $1K actual, rounded to annual delta | $50K |
| ASR provider | $180K/year delta × 2 weeks recovery ≈ $7K actual, rounded to annual delta | $180K |
| Analytics architecture | 30K creators × $573 LTV × 0.10 P(wrong) × 0.5 years | **$859K** |
| Multi-region encoding (operational only) | 30K creators × $573 LTV × 0.10 P(wrong) × 0.25 years | **$429K** |
| Multi-region encoding (GDPR-constrained) | $429K operational + $13M GDPR fine exposure | **$13.4M** |

**Architecture Decision Priority (blast radius comparison across series):**

| Decision | Blast Radius | T_recovery | Series Reference | Review Scope |
| :--- | ---: | :--- | :--- | :--- |
| **Protocol Migration** (QUIC+MoQ) | $18.82M | 3 years | [Protocol Choice](/blog/microlearning-platform-part2-video-delivery/) | **Cross-functional / ARB** |
| **Multi-region Encoding** (GDPR) | **$13.4M** | 12-18 months | This document | **Cross-functional / ARB + Legal** |
| **Database Sharding** | $9.41M | 18 months | [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/) | **Cross-functional / ARB** |
| Analytics Architecture | $0.86M | 6 months | This document | Staff Engineer + Team Lead |
| Multi-region Encoding (same-jurisdiction) | $0.43M | 3 months | This document | Senior Engineer + Tech Lead |
| ASR Provider | $0.18M | 2 weeks | This document | Tech Lead |
| GPU Instance Type | $0.05M | 1 week | This document | Engineer |

Protocol Migration blast radius ($18.82M) exceeds Analytics Architecture ($0.86M) by **21.9×**. But Multi-region Encoding *with GDPR exposure* ($13.4M) is now the second-highest blast radius in the series - elevated from the second-lowest. This reclassification is why the "Ingress Latency Penalty" analysis in the Graceful Degradation section above replaces naive cross-region overflow with region-pinned GPU pools. The operational blast radius ($0.43M for same-jurisdiction overflow) remains a two-way door; only cross-jurisdiction routing triggers the one-way door classification.

**Blast Radius Formula:**

The supply-side blast radius derives from [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/#converting-milliseconds-to-dollars)'s universal formula, adapted for creator economics:

{% katex(block=true) %}
R_{\text{blast}} = \text{DAU}_{\text{affected}} \times \text{LTV} \times P(\text{failure}) \times T_{\text{recovery}}
{% end %}

For creator pipeline decisions, we substitute the creator-specific LTV derived from the content multiplier and daily ARPU established in the foundation analysis:

{% katex(block=true) %}
\begin{aligned}
\text{Creator LTV}_{\text{annual}} &= \text{Content Multiplier} \times \text{Daily ARPU} \\
&= 10{,}000\,\text{views/year} \times \$0.0573/\text{view} \\
&= \$573/\text{creator/year} \quad \text{(upper bound)}
\end{aligned}
{% end %}

> **Assumption note:** This uses daily ARPU ($0.0573) per view, which implicitly assumes each view represents a unique daily engagement that wouldn't have occurred without this creator's content. This is an upper bound - if users would have watched other content instead, the per-view impact is lower ($0.0573/20 ≈ $0.003 per view, since each DAU watches ~20 videos). The true value depends on content substitutability. For niche educational content with few alternatives, the upper bound is more appropriate; for commoditized topics, divide by 5-10×.

**Example: Analytics Architecture Decision at 3M DAU**

Decision: Choose batch processing (saves $120K/year) vs stream processing ($180K/year).

If batch is wrong (creators need real-time feedback for iteration workflow), the recovery requires 6-month migration back to stream processing. During recovery, creator churn accelerates due to broken feedback loop.

{% katex(block=true) %}
\begin{aligned}
\text{Batch savings during recovery} &= \$120\text{K/year} \times 0.5\,\text{years} = \$60\text{K} \\[0.5em]
\text{Blast radius calculation:} \\
R_{\text{blast}} &= \text{Creators} \times \text{Creator LTV} \times P(\text{batch wrong}) \times T_{\text{recovery}} \\
&= 30{,}000 \times \$573/\text{year} \times 0.10 \times 0.5\,\text{years} \\
&= \$859\text{K}
\end{aligned}
{% end %}

**Decision analysis:**

| Component | Value | Derivation |
| :--- | :--- | :--- |
| Batch annual savings | $120K/year | $10K/month (stream $15K - batch $5K) |
| Savings during T_recovery | $60K | $120K × 0.5 years |
| Creator LTV (annual) | $573/creator | 10K views × $0.0573 ARPU |
| P(batch wrong) | 10% | Estimated: creator workflow dependency on real-time feedback |
| T_recovery | 6 months | Migration from batch to stream architecture |
| Total creators at risk | 30,000 | 1% of 3M DAU |
| **Blast radius** | **$859K** | 30K × $573 × 0.10 × 0.5 |
| **Downside leverage** | **14.3×** | $859K blast / $60K saved during recovery |

The 14.3× downside leverage means: for every $1 saved by choosing batch, you risk $14.30 if batch turns out to be wrong. This asymmetry demands the 100× analysis rigor applied to one-way doors. The $120K/year savings only justifies batch if P(batch wrong) < 7% ($60K ÷ $859K), which requires high confidence that creators do not need real-time feedback.

**Check Impact Matrix (from [Latency Kills Demand](/blog/microlearning-platform-part1-foundation/#one-way-doors-platform-death-checks-the-systems-interaction)):**

The analytics architecture decision illustrates the **Check 2 (Supply) ↔ Check 1 (Economics)** tension:

| Choice | Satisfies | Stresses | Net Economic Impact |
| :--- | :--- | :--- | :--- |
| **Stream** | Check 2 (Supply: real-time feedback) | Check 1 (Economics: +$120K/year) | Prevents $859K blast radius |
| **Batch** | Check 1 (Economics: saves $120K/year) | Check 2 (Supply: delayed feedback) | Risks $859K if creators need real-time |

The "cheaper" batch option can make Check 1 fail worse than stream if creator churn materializes. One-way doors require multi-check analysis - optimizing one check while ignoring second-order effects on other checks is how platforms die while hitting local KPIs.

---

## Summary: Achieving Sub-30s Creator Experience

Marcus uploads at 2:10:00 PM. At 2:10:28 PM, his video is live with captions, cached at regional shields, and visible in his analytics dashboard. Twenty-eight seconds, end to end.

### The Five Technical Pillars

| Pillar | Implementation | Latency Contribution |
| :--- | :--- | :--- |
| **1. Presigned S3 uploads** | Direct-to-cloud, chunked resumability | 8s (87MB transfer) |
| **2. GPU transcoding** | NVIDIA T4, 4-quality parallel ABR | 18s (encoding) |
| **3. Geo-aware cache warming** | 3-shield selective pre-warming | 2s (parallel with encode) |
| **4. ASR captions** | Deepgram parallel processing | 14s (parallel with encode) |
| **5. Real-time analytics** | Kafka to Flink to ClickHouse | 6s (after publish) |

**Total critical path:** 8s upload + 18s encode + 2s publish = **28 seconds**

### Quantified Impact

| Metric | Value | Derivation |
| :--- | :--- | :--- |
| **Median encoding time** | 20s | 18s encode + 2s overhead |
| **P95 encoding time** | 28s | Queue wait during normal load |
| **P99 encoding time** | 45s | Saturday peak queue backlog |
| **Creator retention protected** | $859K/year @3M DAU | 1,500 creators × 10K views × $0.0573 |
| **Pipeline cost** | $0.0129/DAU | $38.6K/month ÷ 3M DAU |

### Uncertainty Quantification

**Point estimate:** $859K/year @3M DAU (conservative, using 1% active uploaders)

**Uncertainty bounds (95% confidence):** Using variance decomposition:
- Creator churn rate: 5% ± 2% (measurement uncertainty)
- Content multiplier: 10K ± 3K views (engagement variance)
- ARPU: $0.0573 ± $0.005 (Duolingo actual, market variance)

{% katex(block=true) %}
\begin{aligned}
\sigma_R^2 &= R^2 \left[ \left(\frac{\sigma_{\text{churn}}}{\text{churn}}\right)^2 + \left(\frac{\sigma_{\text{mult}}}{\text{mult}}\right)^2 + \left(\frac{\sigma_{\text{ARPU}}}{\text{ARPU}}\right)^2 \right] \\
&= (\$859\text{K})^2 \times \left[ (0.4)^2 + (0.3)^2 + (0.087)^2 \right] \\
&= (\$859\text{K})^2 \times 0.258 \\
\sigma_R &= \$436\text{K}
\end{aligned}
{% end %}

**95% Confidence Interval:** $859K ± 1.96 × $436K = **[$0K, $1.71M]**

The wide confidence interval reflects high uncertainty in creator churn attribution. The lower bound of $0 indicates that if creator churn is due to factors OTHER than encoding latency (monetization, audience, competition), the intervention has zero value.

**Conditional on:**
- **[C1] Encoding latency causes churn** (not just correlated) - requires creator funnel instrumentation
- **[C2] Demand-side latency solved** - viewer p95 <300ms, otherwise creators churn due to viewer abandonment
- **[C3] Content quality sufficient** - bad content encoded fast is still bad content

**Falsified if:** A/B test (fast encoding vs slow encoding) shows creator retention delta <$423K/year (below 1σ threshold: $859K - $436K).

### The Supply Side Is Flowing

Marcus uploads at 2:10:00 PM. At 2:10:28 PM, his video is live with captions, cached at regional shields, visible in his analytics dashboard. Twenty-eight seconds, end to end. He checks the real-time view counter, sees 47 views in the first minute, and starts planning his next tutorial.

The creator pipeline is working. GPU quotas secured. ASR captions automated. Analytics streaming. The supply side of the platform equation is solved.

Sarah opens the app for the first time.

She has no watch history. No quiz results. No engagement signals. The prefetch model has nothing to learn from. It guesses - and guesses wrong. The first three videos are basic content she already knows. She swipes impatiently, encounters a fourth irrelevant video, and closes the app.

She never returns.

The platform delivers videos in 80ms. Marcus's tutorials are excellent. The infrastructure hums. And 40% of new users churn because the recommendation engine can't distinguish a beginner from an expert without data that doesn't exist yet.

GPU quotas, not GPU speed, were the bottleneck. Caption cost dominates pipeline economics. Real-time analytics protects $859K/year in creator retention. These lessons were hard-won.

But the cold start problem remains. Fast delivery of personalized content to users the system knows well. Generic delivery to users it's meeting for the first time. The gap between them is where growth dies.
