+++
authors = [ "Yuriy Polyulya" ]
title = "Architecting Real-Time Ads Platforms: A Distributed Systems Engineer's Design Exercise"
description = "A design exploration of building real-time ads platforms serving 400M+ users with sub-100ms latency. Applying distributed systems principles to RTB protocols, ML inference pipelines, auction algorithms, and resilience patterns - a thought experiment in solving complex distributed systems challenges."
date = 2025-10-15

draft = false
slug = "architecting-real-time-ads-platforms-design-exercise"

[taxonomies]
tags = ["distributed-systems", "system-design"]

[extra]
toc = false
disclaimer = ""

+++

## Introduction: The Challenge of Real-Time Ad Serving at Scale

Full disclosure: I've never built an ads platform before. But I've spent years working on distributed systems and mathematical optimization problems - from cost optimization in large-scale infrastructure to performance tuning under strict latency constraints. This design exercise is my way of keeping the brain engaged with complex systems thinking. Think of it as a more interesting alternative to sudoku, except instead of filling in numbers, I'm optimizing auction latencies and cache hit rates.

What makes this problem particularly compelling is the combination of technical complexity and clear economic traceability. Unlike many distributed systems where cost optimization happens in abstract infrastructure units, ad platforms offer direct financial transparency - every click has a measurable value, every millisecond of latency has quantifiable revenue impact, and you can trace the complete economic chain from CAPEX (infrastructure costs) through OPEX (operational overhead) to revenue per impression. A user opens an app, sees a relevant ad in under 100ms, clicks it, and the advertiser gets billed. Straightforward, right? But decompose the mechanics - coordinating real-time auctions across dozens of bidding partners, running ML predictions in <40ms, maintaining budget consistency across regions, handling 1M+ queries per second - and it becomes a fascinating exercise in multi-dimensional optimization with hard constraints and measurable outcomes.

Here's the scale I'm designing for in this thought experiment:

- **400M+ daily active users** generating continuous ad requests
- **1M+ queries per second** during peak traffic
- **Sub-100ms p95 latency** for the entire request lifecycle
- **Real-time ML inference** for click-through rate prediction
- **Distributed auction mechanisms** coordinating with 50+ external bidding partners
- **Multi-region deployment** with eventual consistency challenges

I'm treating this as a design exercise - exploring how I'd apply my distributed systems experience to this domain. I'll walk through my thought process on:

1. **Figuring out requirements** and modeling performance constraints
2. **Designing the high-level architecture** and breaking down latency budgets
3. **Real-Time Bidding (RTB) integration** - OpenRTB is... interesting (and by interesting I mean "spec written in 2012 that everyone implements slightly differently")
4. **ML inference pipelines** that somehow need to finish in under 50ms
5. **Distributed caching strategies** (because hitting the database for everything won't scale)
6. **Auction mechanisms** - there's some cool game theory here
7. **Advanced topics** like budget pacing, fraud detection, multi-region failover
8. **What breaks and why** - because everything breaks eventually

Fair warning: I'm going to dive pretty deep into the math and trade-offs. My goal is to show not just the "what" but the "why" behind design decisions.

**Acknowledgment - On learning time optimization:** This design exercise involved diving deep into ad-tech domain knowledge I didn't previously have (OpenRTB protocols, auction mechanisms, RTB latency constraints, etc.). I used AI assistants extensively as research tools - to surface relevant technical papers, summarize industry standards, point me to the right documentation, and validate technical assumptions. Think of it as optimizing yet another cost dimension: **learning time**. Instead of spending weeks manually hunting through scattered documentation and outdated blog posts, AI helped compress domain research from weeks to days.

This took about 25 days of learning, researching, and writing. Given the scope (3000+ lines covering distributed systems, ML pipelines, auction algorithms, financial compliance, and more), expect inconsistencies, calculation errors, and heavily opinionated architectural choices. Synthesizing knowledge across multiple domains while learning new material tends to produce those human artifacts.

Ironically, for a post about optimization, this one's pretty unoptimized - verbose, repetitive, twice as long as it needs to be. That's what happens when you learn while writing. Feedback and suggestions for cuts welcome.

**Note on costs:** Throughout this post, I'll discuss cost comparisons between different technologies. Please note that pricing varies significantly by cloud provider, region, contract negotiations, and changes over time. The cost figures I mention are rough approximations to illustrate relative differences, not exact pricing you should rely on. Always check current pricing from vendors and factor in your specific usage patterns and potential enterprise discounts.

---

## Part 1: Requirements and Constraints

### Functional Requirements

Okay, so first things first - what does this system actually need to do? I've broken it down into a few key areas:

**1. Multi-Format Ad Delivery**

You need to handle all the different ad types users expect these days - story ads, video ads, carousel ads, even AR-enabled ads if you're feeling fancy. And of course, it all needs to work on iOS, Android, and web. The creative assets should come from a CDN (Content Delivery Network - obviously), aiming for sub-100ms first-byte time.

**2. Real-Time Bidding (RTB) Integration**

This is where things get interesting. You're implementing OpenRTB 2.5+ (or whatever version is current), talking to 50+ demand-side platforms (DSPs - the external bidding partners who represent advertisers and bid on ad inventory) simultaneously. The IAB (Interactive Advertising Bureau) standards give you a hard 30ms timeout for the auction - which sounds generous until you realize you need to do 50+ network calls in parallel. And if you think that's easy, wait until you discover that some DSPs are in Europe, some are in Asia, and suddenly you're trying to do a 30ms global auction with 150ms round-trip times to some bidders.

Oh, and you also need to handle both programmatic and guaranteed inventory, which have completely different SLAs and business logic. Fun!

**3. ML-Powered Targeting and Optimization**

The ML stuff is critical for revenue:
- Real-time CTR (click-through rate) prediction (you can't just serve random ads)
- Conversion rate optimization
- Dynamic creative optimization (showing different ad variants)
- Budget pacing algorithms (so advertisers don't blow their entire budget in the first hour)

**4. Campaign Management**

Then there's all the campaign management stuff - real-time performance metrics, A/B testing framework, frequency capping (nobody wants to see the same ad 50 times), quality scoring, policy compliance, etc.

### Architectural Drivers: The Three Non-Negotiables

Before diving into non-functional requirements, establish the three **immutable constraints** that guide every design decision. Violating these makes the platform economically unviable.

**Driver 1: Latency (Sub-100ms p95)**

Mobile apps timeout at 150ms. Amazon's 2006 study found every 100ms of latency costs 1% of sales. At 1M QPS (queries per second) targeting 100ms total budget, breaching the threshold causes mobile timeouts. At 1M QPS, every millisecond = 1000 concurrent requests in flight.

$$\text{Revenue Loss} = \text{Latency Penalty} \times \text{Impression Volume} \times \text{CPM}$$

Where CPM = Cost Per Mille (cost per thousand impressions), the standard pricing model in digital advertising.

Exceeding 150ms timeout → **100% loss** on timed-out requests. Staying at 100ms (vs degrading to 150ms) protects ~$800K/day revenue. This forces: rejecting cross-region queries, aggressive caching despite eventual consistency, regional DSP sharding.

**Driver 2: Financial Accuracy (Zero Tolerance)**

Billing discrepancies >2-5% trigger lawsuits; >1% causes complaints and credit demands. Regulatory compliance (FTC, EU DSA) mandates accurate spend tracking.

$$\text{Legal Risk} = P(\text{Billing Error}) \times \text{Average Settlement}$$

2-5% error on $100M spend = $2-5M discrepancy = $5-10M lawsuit + advertiser exodus. System design targets ≤1% over-delivery to stay well below litigation threshold. This forces: strong consistency for budgets, CockroachDB for globally ordered billing ledger with built-in HLC (Hybrid Logical Clock) timestamps, PostgreSQL for cold archive only.

**Driver 3: Availability (99.9%+ Uptime)**

Revenue directly tied to uptime. 1 hour outage = **$1M lost** at $1M/hour run rate. 99.9% = 43 min/month error budget.

$$\text{Downtime Cost} = \frac{\text{Annual Revenue}}{365 \times 24} \times \text{Downtime Hours}$$

This forces: multi-region deployment, circuit breakers on dependencies, graceful degradation, zero single points of failure.

**Conflict Resolution Hierarchy:**

$$\text{Financial Accuracy} > \text{Availability} > \text{Latency}$$

Lawsuits cost more than downtime; downtime costs more than slow ads. Example: Accept 15ms budget allocation latency (violates latency goal) because billing correctness is non-negotiable.

### Non-Functional Requirements: Performance Modeling

Formalizing the performance constraints:

**Latency Distribution Constraint:**
$$P(\text{Latency} \leq 100\text{ms}) \geq 0.95$$

So this just means 95% of requests need to finish within 100ms. The tricky part is that total latency is the sum of all the services in the request path:

$$T_{total} = \sum_{i=1}^{n} T_i$$

where \\(T_i\\) is the latency of each service. If you have 5 services each taking 20ms, you're already at 100ms with zero margin for error.

Strict latency budgets are critical: incremental service calls ("only 10ms each") compound quickly, potentially doubling p99 latency from 100ms to 200ms.

**Throughput Requirements:**

Target peak load:
$$Q_{peak} \geq 1.5 \times 10^6 \text{ QPS}$$

Now, Little's Law gives us a way to figure out how many servers we need. With service time \\(S\\) and \\(N\\) servers:
$$N = \frac{Q_{peak} \times S}{U_{target}}$$

Fixed percentage targets (e.g., \\(U_{target} = 0.7\\)) are wasteful at scale. With 1000 instances, a 30% buffer means 300 idle instances.

Instead, buffer capacity dynamically based on autoscaling response time:
$$N_{buffer} = \frac{dQ}{dt} \times T_{scale}$$

where:
- \\(\frac{dQ}{dt}\\) = traffic growth rate (QPS/second)
- \\(T_{scale}\\) = time to provision + warm up new instances

**Example:** If traffic grows at 10K QPS/second during peak, and instances take 90 seconds to provision and warm up, you need buffer for 900K QPS. At 1K QPS/instance, that's 900 instances buffer - regardless of fleet size.

Key insight: buffer is constant based on scaling speed, not a percentage of fleet. A 100-instance fleet and 10,000-instance fleet need the same buffer if they face the same traffic growth rate and provisioning time.

**Availability Constraint:**

Target "five nines" (99.999% uptime):
$$A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \geq 0.99999$$

where MTBF = Mean Time Between Failures, MTTR = Mean Time To Recovery.

This allows **26 seconds** of downtime per month (0.43 minutes). A bad deploy or misconfiguration (e.g., routing all traffic to a single region) can exhaust this budget instantly.

**Consistency Requirements:**

Different data types require different consistency guarantees. Treating everything as strongly consistent degrades performance:

- **Financial data** (ad spend, billing): Strong consistency with bounded over-delivery tolerance
  $$\forall t_1 < t_2: \text{Read}(t_2) \text{ observes } \text{Write}(t_1)$$

  Billing accuracy is non-negotiable, but engineering trade-offs create acceptable bounds. Strong consistency (Redis atomic counters) prevents unbounded over-delivery from race conditions. However, the pre-allocation pattern allows **bounded over-delivery ≤1% of budget** due to allocation chunk granularity - a server that crashes while holding a $100 allocation creates potential over-delivery until timeout recovery kicks in. Under-delivery is worse (lost revenue + angry advertisers), so slight over-delivery is the lesser evil. Legal precedent: lawsuits typically arise from systematic errors >2-5%, not sub-1% technical variance.

- **User preferences**: Eventual consistency is fine
  $$\lim_{t \to \infty} P(\text{AllReplicas consistent}) = 1$$

  If a user updates their interests and sees old targeting for a few seconds, it's not critical.

  **Practical example:** User adds "fitness equipment" to their interests. If they see ads for electronics for the next 10-20 seconds while the update propagates across replicas, that's acceptable. The user doesn't even notice, and we haven't lost revenue.

- **Ad inventory (budget enforcement)**: Strong consistency via pre-allocation

  Budget deductions use atomic operations (Redis DECRBY) to prevent **unbounded over-delivery** from race conditions. Each ad server pre-allocates a chunk of budget (e.g., 1000 impressions) from a central controller with strong consistency guarantees.

  **Bounded over-delivery tolerance:** Pre-allocation granularity creates bounded over-delivery ≤1% of budget (e.g., crashed servers holding allocations). This is acceptable compared to the alternative of centralizing every budget decision (10ms latency bottleneck).

  **Why this matters:** Without atomic enforcement, eventual consistency could allow 10 servers to each think they can serve 100 more impressions when only 50 remain, resulting in 1000 impressions served when budget was 50 - that's 20× over-budget vs. the 1% tolerance.

- **Ad inventory (reporting/dashboards)**: Eventual consistency acceptable

  Real-time dashboards showing "impressions served so far today" can tolerate 10-30 second staleness. Advertisers checking campaign progress don't need millisecond-accurate counts.

### Scale Analysis

**Data Volume Estimation:**

With 400M DAU, averaging 20 ad requests/user/day:
- Daily ad requests: **8B requests/day**
- Daily log volume (at 1KB per log): **8TB/day**

**Storage Requirements:**

- User profiles (10KB per user): **4TB**
- Historical ad performance (30 days retention, 100B per impression): **~24TB**

**Cache Sizing:**

For 95% cache hit rate with Zipfian distribution (\\(\alpha = 1.0\\)) - a power law that models real-world user access patterns where a small fraction of users generate most traffic - you need approximately 20% of total dataset:
- Required cache for 400M users: **~800GB**

Distributed across 100 cache nodes: **8GB per node**.

*Note: See "Cache Cost Optimization" section (Part 6) for detailed analysis of why Zipfian distribution models user behavior and comparison with alternative distributions.*

---

## Part 2: High-Level Architecture

### System Components and Request Flow

{% mermaid() %}
graph TB
    subgraph "Client Layer"
        CLIENT[Mobile/Web Client<br/>iOS, Android, Browser]
    end

    subgraph "Edge Layer"
        CDN[CDN<br/>CloudFront/Fastly<br/>Static assets]
        GLB[Global Load Balancer<br/>GeoDNS + Health Checks<br/>Route53]
    end

    subgraph "Regional Service Layer - Primary Region"
        GW[Envoy Gateway<br/>Rate Limiting: 1M QPS<br/>Auth: JWT/OAuth<br/>Istio Native]
        AS[Ad Server Orchestrator<br/>Stateless, Horizontally Scaled<br/>100ms latency budget]

        subgraph "Core Services"
            UP[User Profile Service<br/>Demographics, Interests<br/>Target: 10ms]
            AD_SEL[Ad Selection Service<br/>Candidate Retrieval<br/>Target: 15ms]
            ML[ML Inference Service<br/>CTR Prediction<br/>Target: 40ms]
            RTB[RTB Auction Service<br/>OpenRTB Protocol<br/>Target: 30ms]
            BUDGET[Budget Controller<br/>Pre-Allocation<br/>Strong Consistency]
        end

        subgraph "Data Layer"
            REDIS[(Redis Cluster<br/>Atomic Counters: DECRBY/INCRBY<br/>Budget Enforcement)]
            CRDB[(CockroachDB<br/>Billing Ledger + User Profiles<br/>HLC Timestamps<br/>Multi-Region ACID)]
            POSTGRES[(PostgreSQL<br/>Cold Archive<br/>7-year retention)]
            FEATURE[(Feature Store<br/>ML Features<br/>Sub-10ms p99)]
        end
    end

    subgraph "Data Processing Pipeline"
        KAFKA[Kafka<br/>Event Streaming<br/>100K events/sec]
        FLINK[Kafka Streams / Flink<br/>Stream Processing<br/>Real-time Aggregation]
        SPARK[Spark<br/>Batch Processing<br/>Feature Engineering]
        S3[(S3/HDFS<br/>Data Lake<br/>500TB+ daily)]
    end

    subgraph "ML Training Pipeline"
        AIRFLOW[Airflow<br/>Orchestration]
        TRAIN[Training Cluster<br/>Daily CTR Model<br/>Retraining]
        REGISTRY[Model Registry<br/>Versioning<br/>A/B Testing]
    end

    subgraph "Observability"
        PROM[Prometheus<br/>Metrics]
        JAEGER[Jaeger<br/>Distributed Tracing]
        GRAF[Grafana<br/>Dashboards]
    end

    CLIENT --> CDN
    CLIENT --> GLB
    GLB --> GW
    GW --> AS

    AS --> UP
    AS --> AD_SEL
    AS --> ML
    AS --> RTB
    AS --> BUDGET

    UP --> REDIS
    AD_SEL --> REDIS
    ML --> FEATURE
    RTB --> |OpenRTB 2.x| EXTERNAL[50+ DSP Partners]

    BUDGET --> |DECRBY/INCRBY| REDIS
    BUDGET --> |Audit Trail| POSTGRES

    UP --> CRDB
    AD_SEL --> CRDB

    AS --> KAFKA
    KAFKA --> FLINK
    FLINK --> REDIS
    FLINK --> S3
    SPARK --> S3
    SPARK --> FEATURE

    AIRFLOW --> TRAIN
    TRAIN --> REGISTRY
    REGISTRY --> ML

    AS -.-> PROM
    AS -.-> JAEGER
    PROM --> GRAF

    classDef client fill:#e1f5ff,stroke:#0066cc
    classDef edge fill:#fff4e1,stroke:#ff9900
    classDef service fill:#e8f5e9,stroke:#4caf50
    classDef data fill:#f3e5f5,stroke:#9c27b0
    classDef stream fill:#ffe0b2,stroke:#e65100

    class CLIENT client
    class CDN,GLB edge
    class GW,AS,UP,AD_SEL,ML,RTB,BUDGET service
    class REDIS,POSTGRES,CRDB,FEATURE,S3 data
    class KAFKA,FLINK,SPARK stream
{% end %}

### Latency Budget Decomposition

For a 100ms total latency budget, we decompose the request path:

$$T_{total} = T_{network} + T_{gateway} + T_{services} + T_{serialization}$$

**Network Overhead (Target: 10ms)**
- Client to edge: 5ms (CDN proximity)
- Edge to service: 5ms (regional deployment)

**API Gateway (Target: 5ms)**
- Authentication: 2ms
- Rate limiting: 1ms
- Request enrichment: 2ms

**Technology Selection: API Gateway**

| Technology | Latency Overhead | Throughput (RPS) | Rate Limiting | Auth Methods | Istio Integration | Ops Complexity |
|------------|------------------|------------------|---------------|--------------|-------------------|----------------|
| **Envoy Gateway** | 2-4ms | 150K/node | Extension filters | JWT, OAuth2, External | Native (same proxy) | Low (unified) |
| Kong | 3-5ms | 100K/node | Plugin-based | JWT, OAuth2, LDAP | External (separate proxy) | Medium (dual proxies) |
| AWS API Gateway | 5-10ms | 10K/endpoint | Built-in | IAM, Cognito, Lambda | No integration | Low (managed) |
| NGINX Plus | 1-3ms | 200K/node | Lua scripting | Custom modules | No integration | High |

**Decision: Envoy Gateway**

> **Architectural Driver: Latency** - Envoy Gateway's 2-4ms overhead fits within our 5ms gateway budget while unifying the proxy layer with our Istio service mesh, reducing operational complexity.

Rationale:
- **Unified proxy technology:** Same Envoy proxy for ingress + service mesh (Istio) - single control plane, unified observability
- **Better latency:** 2-4ms overhead vs Kong's 3-5ms
- **Higher throughput:** 150K RPS/node vs Kong's 100K RPS/node
- **No dual-proxy complexity:** Kong + Istio means two different proxies (NGINX/Lua + Envoy), different configs, different debugging tools
- **Cost:** Open-source (CNCF), no licensing vs Kong Enterprise
- **Service mesh native:** Istio Gateway API provides declarative routing with built-in mTLS

**Kong consideration:** More mature plugin ecosystem, but creates operational burden of running two proxy technologies (Kong for ingress, Envoy sidecars for service mesh). For auth + rate limiting + routing, Envoy Gateway's extension model is sufficient.

**NGINX Plus consideration:** Best-in-class latency (1-3ms), but no Istio integration and custom Lua development overhead.

**AWS API Gateway limitation:** 5-10ms latency overhead plus per-request pricing at sustained high throughput makes it cost-prohibitive for this scale.

**Latency breakdown:**
- TLS termination: ~1ms
- Authentication (JWT verify): ~2ms
- Rate limiting (distributed filter): ~0.5ms
- Request routing: ~0.5ms
- **Total: 4ms** - within budget, 1ms better than Kong

**Service Layer (Target: 75ms)**

The Ad Server makes parallel calls to 4 services. Total latency is bounded by the slowest:

- User Profile lookup: 10ms
- Ad Selection: 15ms
- **ML inference: 40ms** ← bottleneck
- RTB auction: 30ms

With parallel execution, we're limited by ML at **40ms**.

**Remaining Budget:**
- Auction logic: 5ms
- Serialization: 5ms

**Total: 65ms** (35ms headroom for variance)

### Critical Path Analysis

The critical path through the system determines overall latency. Using dependency graphs:

{% mermaid() %}
graph LR
    A[Request Arrives] -->|5ms| B[Gateway Auth]
    B -->|Parallel Fork| C[User Profile]
    B -->|Parallel Fork| D[Ad Selection]
    B -->|Parallel Fork| E[ML Inference]
    B -->|Parallel Fork| F[RTB Auction]

    C -->|10ms| G[Join Point]
    D -->|15ms| G
    E -->|40ms| G
    F -->|30ms| G

    G -->|5ms| H[Auction Logic]
    H -->|5ms| I[Response]

    style E fill:#ffcccc
    style G fill:#ffffcc
{% end %}

The **ML Inference Service** (40ms) is the critical path bottleneck. Optimization efforts should focus here first.

### Fault Tolerance and Circuit Breaker Patterns

> **Architectural Driver: Availability** - Circuit breakers prevent cascading failures from killing the entire platform. If the ML service fails, we gracefully degrade rather than serving blank ads.

To prevent cascading failures, implement **circuit breakers** for each downstream dependency. A circuit breaker monitors service health and automatically breaks the connection when failures exceed thresholds, preventing one failing service from bringing down the entire system.

**The three-state pattern:**

- **CLOSED** (normal): All requests pass through. Monitor error rates and latency continuously.
- **OPEN** (failed): When failures exceed threshold, stop all requests. Return cached/fallback responses immediately. This prevents overwhelming a struggling service with additional load.
- **HALF-OPEN** (testing): After timeout period, send small test traffic (1-5% of requests). If tests succeed, transition back to CLOSED. If tests fail, return to OPEN with exponential backoff.

**Example trigger**: If error rate \\(E(t) > 10\\%\\) for 60 seconds, trip circuit to OPEN. After 30-second timeout, test recovery with 100 requests - if ≥90% succeed, restore to CLOSED.

This pattern applies to both error-based failures (service crashes, timeouts) and latency-based failures (service slow but functional). We'll see the latency-specific implementation in the Degradation Strategy section below.

### Degradation Strategy: When Services Breach Latency Budgets

**The Core Problem:**

You've allocated 40ms for ML inference, but what happens when GPU load spikes and p99 latency hits 80ms? Do you:
- Wait for the slow ML response and violate the 100ms total SLA (Service Level Agreement - the latency target we promised)? (Result: Mobile timeouts, blank ads, lost revenue)
- Skip the request entirely? (Result: No ad served, 100% revenue loss on that request)
- **Degrade gracefully with a fallback?** (Result: Serve a less-optimal ad, ~10-20% revenue loss vs. perfect targeting)

The answer is clear: **graceful degradation**. Better to serve a decent ad quickly than a perfect ad slowly (or no ad at all).

**Per-Service Degradation Hierarchy:**

Each critical-path service has a **latency budget** and a **degradation ladder** defining fallback behavior when budgets are exceeded. The table below shows all degradation levels across the three most critical services:

| Level | ML Inference<br/>(40ms budget) | User Profile<br/>(10ms budget) | RTB Auction<br/>(30ms budget) |
|-------|---------------------------|---------------------------|--------------------------|
| **Level 0<br/>(Normal)** | GPU inference<br/>Latency: 30ms<br/>Revenue: 100%<br/>*Trigger: p99 < 40ms* | CockroachDB + Redis<br/>Latency: 8ms<br/>Accuracy: 100%<br/>*Trigger: p99 < 10ms* | Query all 50 DSPs<br/>Latency: 25ms<br/>Revenue: 100%<br/>*Trigger: p95 < 30ms* |
| **Level 1<br/>(Light Degradation)** | **Cached predictions**<br/>Redis cached CTR<br/>Latency: 5ms<br/>Revenue: 92% (-8%)<br/>*Trigger: p99 > 40ms for 60s* | **Stale cache**<br/>Extended TTL cache<br/>Latency: 2ms<br/>Accuracy: 95% (-5%)<br/>*Trigger: p99 > 10ms for 60s* | **Top 20 DSPs only**<br/>Highest-value DSPs<br/>Latency: 18ms<br/>Revenue: 94% (-6%)<br/>*Trigger: p95 > 30ms for 60s* |
| **Level 2<br/>(Moderate Degradation)** | **Heuristic model**<br/>Rule-based CTR<br/>Latency: 2ms<br/>Revenue: 85% (-15%)<br/>*Trigger: Cache miss > 30%* | **Segment defaults**<br/>Demographic avg<br/>Latency: 1ms<br/>Accuracy: 70% (-30%)<br/>*Trigger: DB unavailable* | **Cached bids**<br/>Predicted bids<br/>Latency: 8ms<br/>Revenue: 88% (-12%)<br/>*Trigger: p95 > 25ms for 60s* |
| **Level 3<br/>(Severe Degradation)** | **Global average**<br/>Category avg CTR<br/>Latency: 1ms<br/>Revenue: 75% (-25%)<br/>*Trigger: Still breaching SLA* | N/A | **Skip RTB entirely**<br/>Direct inventory only<br/>Latency: 0ms<br/>Revenue: 60% (-40%)<br/>*Trigger: All DSPs timeout* |

**Key observations:**

- **ML degradation is gradual**: 4 levels allow fine-grained fallback (100% → 92% → 85% → 75%)
- **User Profile degradation is binary**: Either fresh data or stale/default (fewer intermediate states needed)
- **RTB degradation is aggressive**: Each level significantly reduces scope to meet latency budget
- **Latency improvements are substantial**: Level 1 degradations save 25-35ms, buying time for recovery

**Mathematical Model of Degradation Impact:**

Total revenue under degradation:

$$R_{degraded} = R_{baseline} \times (1 - \alpha) \times (1 + \beta \times \Delta L)$$

where:
- \\(\alpha\\) = revenue loss from less accurate targeting (8% for Level 1, 15% for Level 2)
- \\(\beta\\) = revenue gain from reduced latency (empirically ~0.0002 per ms saved, or 0.02% per ms)
- \\(\Delta L\\) = latency improvement (e.g., 40ms → 5ms = 35ms saved)

**Example:** Level 1 degradation (cached predictions):
- Targeting accuracy loss: -8%
- Latency improvement: 35ms × 0.0002/ms = +0.007 = +0.7% revenue gain (faster load = higher CTR)
- **Net impact: -8% + 0.7% = -7.3% revenue**

But compare to the alternative:
- Breaching 100ms SLA → 150ms total latency → mobile timeout → 100% revenue loss on timed-out requests

**Circuit Breaker Implementation:**

Applying the circuit breaker pattern introduced earlier, we implement **latency-based circuit breaking** for each service. Instead of triggering on error rates, we trip the circuit when services exceed their latency budgets.

**State machine transitions:**

**CLOSED → OPEN** (Trip when latency exceeds budget):

$$L_{p99}(t) > L_{budget} + \delta \text{ for } \Delta t \geq 60s$$

**OPEN → HALF-OPEN** (Test recovery after exponential backoff):

$$t - t_{trip} > T_{backoff} \quad \text{where } T_{backoff} = 30s \times 2^{n}$$

**HALF-OPEN → CLOSED** (Restore if tests succeed):

$$\frac{\text{successes}}{\text{attempts}} > 0.90 \text{ over } N = 100 \text{ test requests}$$

**HALF-OPEN → OPEN** (Abort recovery if tests fail):

$$\text{Any failure during test period} \rightarrow \text{return to OPEN, increment } n$$

**Where:**
- \\(L_{p99}(t)\\) = current p99 latency measured over 1-minute rolling window
- \\(L_{budget}\\) = allocated latency budget per service
- \\(\delta\\) = tolerance threshold (5ms grace period before tripping)
- \\(n\\) = consecutive failure count (drives exponential backoff)
- \\(t_{trip}\\) = timestamp when circuit last opened

**Per-service circuit breaker thresholds:**

<style>
#tbl_0 + table th:first-of-type  { width: 20%; }
#tbl_0 + table th:nth-of-type(2) { width: 15%; }
#tbl_0 + table th:nth-of-type(3) { width: 15%; }
#tbl_0 + table th:nth-of-type(4) { width: 35%; }
#tbl_0 + table th:nth-of-type(5) { width: 15%; }
</style>
<div id="tbl_0"></div>

| Service | Budget | Trip Threshold | Fallback | Revenue Impact |
|---------|--------|---------------|----------|----------------|
| **ML Inference** | 40ms | p99 > 45ms<br/>for 60s | Cached CTR predictions | -8% |
| **User Profile** | 10ms | p99 > 15ms<br/>for 60s | Stale cache (5min TTL) | -5% |
| **RTB Auction** | 30ms | p95 > 35ms<br/>for 60s | Top 20 DSPs only | -6% |
| **Ad Selection** | 15ms | p99 > 20ms<br/>for 60s | Skip personalization, use category matching | -12% |

**Composite Degradation Impact:**

If **all services degrade simultaneously** (worst case, e.g., during regional failover):

$$R_{total} = R_{baseline} \times (1 - 0.08) \times (1 - 0.05) \times (1 - 0.06) \times (1 - 0.12)$$
$$R_{total} \approx 0.92 \times 0.95 \times 0.94 \times 0.88 = 0.728 R_{baseline}$$

**Result:** ~27% revenue loss under full degradation, but **system stays online**. Compare to outage scenario: 100% revenue loss.

**Recovery Strategy:**

**Hysteresis prevents flapping:**

$$
\begin{aligned}
\text{Degrade if: } & L_{p99} > L_{budget} + 5ms \text{ for } 60s \\\\
\text{Recover if: } & L_{p99} < L_{budget} - 5ms \text{ for } 300s
\end{aligned}
$$

Asymmetric thresholds (5ms tolerance vs 5ms buffer, 60s vs 300s duration) prevent oscillation between states. Example: GPU latency spike trips circuit at t=60s, switches to cached predictions; after 5min of healthy p99<35ms latency, circuit closes and resumes GPU inference.

**Monitoring Degradation State:**

Track composite degradation score: \\(\text{Score} = \sum_{i \in \text{services}} w_i \times \text{Level}_i\\) where \\(w_i\\) reflects revenue impact (ML=0.4, RTB=0.3, Profile=0.2, AdSelection=0.1). Alert on: any service at Level 2+ for >10min (P2), composite score >4 (P1 - cascading failure risk), revenue <85% forecast (P1), circuit flapping >3 transitions/5min.

**Testing Degradation Strategy:**

Validate via chaos engineering: (1) Inject 50ms latency to 10% ML requests, verify circuit trips and -8% revenue impact matches prediction; (2) Terminate 50% GPU nodes, confirm graceful degradation within 60s; (3) Quarterly regional failover drills validating <30% revenue loss and measuring recovery time.

**Trade-off Articulation:**

**Why degrade rather than scale?**

You might ask: "Why not just auto-scale GPU instances when latency spikes?"

**Problem:** Provisioning new GPU instances takes **90-120 seconds** (instance boot + model loading into VRAM). During traffic spikes, you'll breach SLAs for 90+ seconds before new capacity comes online.

**Note on 2025 optimizations:** With modern tooling (NVIDIA Model Streamer, Alluxio caching, pre-warmed images), cold start can be reduced to **30-40 seconds**. However, this requires significant infrastructure investment. The 90-120s baseline represents standard deployments without specialized optimizations.

**Cost-benefit comparison:**

| Strategy | Latency Impact | Revenue Impact | Cost |
|----------|---------------|----------------|------|
| **Wait for GPU**<br/>(no degradation) | 150ms<br/>total → timeout | -100%<br/>on timed-out requests | $0 |
| **Scale GPU instances** | 90s of 80ms<br/>latency → partial timeouts | -40%<br/>during scale-up window | +$500/hour for burst capacity |
| **Degrade to cached predictions** | 5ms<br/>immediate | -8%<br/>targeting accuracy | $0 |

**Decision:** Degradation costs less (-8% vs -40%) and reacts faster (immediate vs 90s).

**But we still auto-scale!** Degradation buys time for auto-scaling to provision capacity. Once new GPU instances are healthy (90s later), circuit closes and we return to normal operation.

**Degradation is a bridge, not a destination.**

---

## Part 3: Real-Time Bidding (RTB) Integration

### OpenRTB Protocol Deep Dive

The OpenRTB 2.5 specification defines the standard protocol for programmatic advertising auctions. A typical RTB request-response cycle:

{% mermaid() %}
sequenceDiagram
    participant AdServer as Ad Server
    participant DSP1 as DSP #1
    participant DSP2 as DSP #2-50
    participant Auction as Auction Logic

    Note over AdServer,Auction: 100ms Total Budget

    AdServer->>AdServer: Construct BidRequest<br/>OpenRTB 2.x format

    par Parallel DSP Calls (30ms timeout each)
        AdServer->>DSP1: HTTP POST /bid<br/>OpenRTB BidRequest
        activate DSP1
        DSP1-->>AdServer: BidResponse<br/>Price: $5.50
        deactivate DSP1
    and
        AdServer->>DSP2: Broadcast to 50 DSPs<br/>Parallel connections
        activate DSP2
        DSP2-->>AdServer: Multiple BidResponses<br/>[$3.20, $4.80, ...]
        deactivate DSP2
    end

    Note over AdServer: Timeout enforcement:<br/>Discard late responses

    AdServer->>Auction: Collected bids +<br/>ML CTR predictions
    Auction->>Auction: Run GSP Auction<br/>Compute winner
    Auction-->>AdServer: Winner + Price

    AdServer-->>DSP1: Win notification<br/>(async, best-effort)

    Note over AdServer,Auction: Total elapsed: ~35ms
{% end %}

**OpenRTB BidRequest Structure (Simplified):**

```json
{
  "id": "req_12345",
  "imp": [{
    "id": "1",
    "banner": {
      "w": 320,
      "h": 50
    },
    "bidfloor": 2.50,
    "bidfloorcur": "USD"
  }],
  "user": {
    "id": "user_hashed_id",
    "geo": {
      "country": "USA",
      "region": "CA"
    }
  },
  "device": {
    "ua": "Mozilla/5.0...",
    "ip": "192.0.2.1",
    "devicetype": 4
  },
  "tmax": 30
}
```

**Key Fields:**
- `tmax`: Maximum time (ms) for DSP response (typically 30-50ms)
- `bidfloor`: Minimum acceptable bid price
- `imp`: Impression opportunities (can be multiple)

**OpenRTB BidResponse Structure:**

```json
{
  "id": "req_12345",
  "seatbid": [{
    "bid": [{
      "id": "bid_1",
      "impid": "1",
      "price": 5.50,
      "adm": "<ad markup>",
      "crid": "creative_123"
    }]
  }],
  "cur": "USD"
}
```

### RTB Timeout Handling and Partial Auctions

**Problem:** With 50 DSPs and 30ms timeout, some responses may arrive late. How do we handle partial auctions?

**Strategy 1: Hard Timeout**
- Discard all responses after 30ms
- Run auction with collected bids only
- **Trade-off:** May miss highest bids, reduces revenue

**Strategy 2: Adaptive Timeout**

Maintain per-DSP latency histograms \\(H_{dsp}\\). Set per-DSP timeout \\(T_{dsp}\\):

$$T_{dsp} = \text{min}\left(P_{95}(H_{dsp}), T_{global}\right)$$

where \\(P_{95}(H_{dsp})\\) is the 95th percentile latency for DSP, \\(T_{global} = 30ms\\).

**Strategy 3: Progressive Auction**

- Run preliminary auction at 20ms with available bids
- Update with late arrivals up to 30ms if they beat current winner
- **Advantage:** Low latency for fast DSPs, opportunity for slow but high-value bids

**Mathematical Model:**

Let \\(B_i\\) be the bid from DSP \\(i\\) with arrival time \\(t_i\\). The auction winner at time \\(t\\):

$$W(t) = \arg\max_{i: t_i \leq t} B_i \times \text{CTR}_i$$

Revenue optimization:
$$\mathbb{E}[\text{Revenue}] = \sum_{i=1}^{N} P(t_i \leq T) \times B_i \times \text{CTR}_i$$

This shows the expected revenue decreases as timeout \\(T\\) decreases (fewer DSPs respond).

### Connection Pooling and HTTP/2 Multiplexing

To minimize connection overhead for 50+ DSPs:

**HTTP/1.1 Connection Pooling:**
- Maintain persistent connections per DSP
- Reuse connections across requests
- Connection pool size: \\(P = \frac{Q \times L}{N}\\)
  - \\(Q\\) = QPS to DSP
  - \\(L\\) = Average latency (s)
  - \\(N\\) = Number of servers

Example: 1000 QPS, 30ms latency, 10 servers → **3 connections per server**

**HTTP/2 Benefits:**
- Multiplexing: Single connection, multiple concurrent requests
- Header compression: HPACK reduces overhead by ~70%
- Server push: Pre-send creative assets (optional)

**What about gRPC?**

gRPC (built on HTTP/2) would be excellent for internal service communication, but there's a key constraint: **OpenRTB is a standardized JSON/HTTP protocol**. External DSPs expect HTTP REST endpoints with JSON payloads per the IAB spec.

**Trade-offs:**
- **External DSP communication**: Must use HTTP/JSON (OpenRTB spec requirement)
- **Internal services** (ML inference, cache layer, auction engine): gRPC is a strong choice
  - Benefits: Protobuf serialization (~3x smaller than JSON), native streaming, strong typing
  - Latency: ~2-5ms faster than JSON REST for internal calls
  - Trade-off: Need to maintain .proto schemas, handle version compatibility

**Practical approach:**
- Use HTTP/JSON for DSP bidding (spec compliance)
- Use gRPC for internal microservices (performance)
- Bridge at the edge with a thin HTTP→gRPC adapter

**Latency Improvement:**

Connection setup time \\(T_{conn}\\):
- HTTP/1.1: 50ms (TCP + TLS handshake per request)
- HTTP/2 with pooling: 0ms (amortized)
- gRPC (internal): 0ms amortized + faster serialization (~2-5ms savings)

**Latency savings: ~50ms per cold start** - critical for meeting 30ms RTB timeout.

### Geographic Distribution and Edge Deployment

**Latency Impact of Distance:**

Network latency is fundamentally bounded by the speed of light in fiber:

$$T_{propagation} \geq \frac{d}{c \times 0.67}$$

where \\(d\\) is distance, \\(c\\) is speed of light, 0.67 accounts for fiber optic refractive index.

**Example:** New York to London (5,585 km):
$$T_{propagation} \geq \frac{5,585,000m}{3 \times 10^8 m/s \times 0.67} \approx 28ms$$

**Important:** This 28ms is the **theoretical minimum** - the absolute best case if light could travel in a straight line through fiber with zero processing delays.

**Real-world latency is 2.5-3× higher due to:**
- **Router/switch processing**: 15-20 network hops × 1-2ms per hop = 15-40ms
- **Queuing delays**: Network congestion, buffer waits = 5-15ms
- **TCP/IP overhead**: Connection establishment, windowing = 10-20ms
- **Route inefficiency**: Actual fiber paths aren't straight lines (undersea cables, peering points) = +20-30% distance

**Measured latency** NY-London in practice: **80-100ms round-trip** (vs 28ms theoretical minimum).

This means the 30ms RTB budget is **impossible even for regional connections**, let alone global. Solution: deploy regionally to minimize distance.

**Optimal DSP Integration Points:**

Deploy RTB auction services in:
1. **US East** (Virginia): Proximity to major ad exchanges
2. **US West** (California): West coast advertisers
3. **EU** (Amsterdam/Frankfurt): GDPR-compliant EU auctions
4. **APAC** (Singapore): Asia-Pacific market

**Latency Reduction:**

With regional deployment, max distance reduced from 10,000km to ~1,000km:
$$T_{propagation} \approx \frac{1,000,000m}{3 \times 10^8 m/s \times 0.67} \approx 5ms$$

Again, this is theoretical minimum. **Practical regional latency** (within 1,000km): **15-25ms round-trip** including routing overhead.

**Savings:** From 80-100ms (global) to 15-25ms (regional) = **55-75ms reduction**, enough to include 10+ additional regional DSPs within the 30ms RTB budget.

### The 30ms RTB Timeout Challenge: Why It's Impossible to Meet Globally

**Reality Check:** For this architecture, we target an aggressive **30ms timeout for DSP responses** (tighter than typical industry timeouts of 100-250ms, but necessary for our 100ms total SLA). This sounds reasonable until you consider the physics of distributed systems across continents.

**Note:** The IAB OpenRTB specification defines a `tmax` field (maximum time in milliseconds) but does not mandate a specific value - implementations vary widely (Google AdX uses 100ms, Magnite CTV uses 250ms). Our 30ms choice prioritizes mobile user experience over DSP participation breadth.

**The Fundamental Problem:**

Network latency is bounded by the speed of light. For global DSP communication (showing **theoretical minimums** - real-world latency is 2-3× higher):

<style>
#tbl_1 + table th:first-of-type  { width: 25%; }
#tbl_1 + table th:nth-of-type(2) { width: 13%; }
#tbl_1 + table th:nth-of-type(3) { width: 13%; }
#tbl_1 + table th:nth-of-type(4) { width: 13%; }
#tbl_1 + table th:nth-of-type(5) { width: 15%; }
#tbl_1 + table th:nth-of-type(6) { width: 20%; }
</style>
<div id="tbl_1"></div>

| Route | Distance | Min Latency<br/>(one-way) | Round-trip<br/>(theoretical) | Practical Round-trip | Available time for DSP |
|-------|----------|---------------------|--------------------------|---------------------|---------------------|
| **US-East → US-West** | 4,000 km | ~13ms | ~26ms | ~60-80ms | -30 to -50ms<br/>**impossible!** |
| **US → Europe** | 6,000 km | ~20ms | ~40ms | ~100-120ms | -70 to -90ms<br/>**impossible!** |
| **US → Asia** | 10,000 km | ~33ms | ~66ms | ~150-200ms | -120 to -170ms<br/>**impossible!** |
| **Europe → Asia** | 8,000 km | ~27ms | ~54ms | ~120-150ms | -90 to -120ms<br/>**impossible!** |

**Mathematical reality:**

$$T_{RTB} = T_{\text{network to DSP}} + T_{\text{DSP processing}} + T_{\text{network from DSP}}$$

For a DSP in Singapore processing a request from New York (using **practical** latency measurements):
- Network to DSP: ~100ms (including routing, queuing, TCP overhead)
- DSP processing: 10ms (auction logic, database lookup)
- Network back: ~100ms
- **Total: 210ms** - more than **7× the 30ms budget**

Even the theoretical physics limit (66ms) exceeds the budget by 2×, but practical networking makes it far worse.

**Why we chose 30ms despite the challenges:**

Our 30ms timeout assumption works only for **regional** auctions where DSPs and SSPs are co-located within ~500km:
- Latency: ~5ms round-trip
- DSP processing: 15ms
- Response serialization: 5ms
- **Total: 25ms** - fits within budget with 5ms headroom

But serving **global** traffic with a 30ms timeout is fundamentally incompatible with physics - which is why we architect regional sharding and selective DSP participation (solutions explored below).

**Why we can't just increase the timeout:**

Remember our overall latency budget is 100ms for the entire ad request:

<style>
#tbl_2 + table th:first-of-type  { width: 32%; }
#tbl_2 + table th:nth-of-type(2) { width: 12%; }
#tbl_2 + table th:nth-of-type(3) { width: 12%; }
#tbl_2 + table th:nth-of-type(4) { width: 12%; }
#tbl_2 + table th:nth-of-type(5) { width: 12%; }
</style>
<div id="tbl_2"></div>

| Component | Budget | % of Total | Cumulative | Critical Path |
|-----------|--------|------------|------------|---------------|
| Network overhead | 10ms | 10% | 10ms | Yes |
| Gateway (Envoy) | 5ms | 5% | 15ms | Yes |
| **Parallel Services** (max of): | | | | |
| → User profile | 10ms | 10% | - | Parallel |
| → Ad selection | 15ms | 15% | - | Parallel |
| → **ML inference** | **40ms** | **40%** | - | **Bottleneck** |
| → RTB auction | 30ms | 30% | - | Parallel |
| **After parallel join** | **40ms** | - | **55ms** | (limited by ML) |
| Auction logic | 5ms | 5% | 60ms | Yes |
| Serialization | 5ms | 5% | 65ms | Yes |
| **Buffer for variance** | **35ms** | **35%** | **100ms** | - |

**Key constraint:** RTB auction gets 30ms budget - already our **second-largest allocation** after ML inference. Increasing RTB timeout to 60ms would push total latency to 130ms, violating our p95 SLO and causing mobile timeouts.

**Critical insight:** We can't just "add more time" to RTB - every service fights for milliseconds within a fixed 100ms envelope.

**Solution 1: Regional Sharding of DSPs**

Instead of broadcasting to all 50 global DSPs, **partition DSPs by region** and only query geographically-nearby partners:

{% mermaid() %}
graph TB
    subgraph "User Request Flow"
        USER[User in New York]
    end

    subgraph "Regional DSP Sharding"
        ADV[Ad Server<br/>US-East-1]

        ADV -->|5ms RTT| US_DSPS[US DSP Pool<br/>25 partners<br/>Latency: 15ms avg]
        ADV -.->|40ms RTT| EU_DSPS[EU DSP Pool<br/>15 partners<br/>SKIPPED - too slow]
        ADV -.->|66ms RTT| ASIA_DSPS[Asia DSP Pool<br/>10 partners<br/>SKIPPED - too slow]

        US_DSPS -->|Response| ADV
    end

    subgraph "Smart DSP Selection"
        PROFILE[(DSP Performance Profile<br/>Cached in Redis)]

        PROFILE -->|Lookup| SELECTOR[DSP Selector Logic]
        SELECTOR --> DECISION{Distance vs<br/>Historical Bid Value}

        DECISION -->|High value,<br/>close proximity| INCLUDE[Include in auction]
        DECISION -->|Low value or<br/>distant| SKIP[Skip to meet latency]
    end

    USER --> ADV
    ADV --> PROFILE

    classDef active fill:#ccffcc,stroke:#00cc00,stroke-width:2px
    classDef inactive fill:#ffcccc,stroke:#cc0000,stroke-width:2px,stroke-dasharray: 5 5
    classDef logic fill:#e3f2fd,stroke:#1976d2,stroke-width:2px

    class US_DSPS,INCLUDE active
    class EU_DSPS,ASIA_DSPS,SKIP inactive
    class PROFILE,SELECTOR,DECISION logic
{% end %}

**Regional Sharding Strategy:**

**DSP Selection Algorithm:**

For each auction request, select DSPs based on multi-criteria optimization:

**DSP Selection Criteria** (include if any condition is met):

- \\(L_i < 15\text{ms}\\) — Always include (low latency)
- \\(L_i < 25\text{ms} \land V_i > V_{\text{threshold}}\\) — Include if high-value
- \\(L_i < 30\text{ms} \land P_i > 0.80\\) — Include if reliable

where:
- \\(L_i\\) = estimated network latency (great circle distance ÷ speed of light × 0.67)
- \\(V_i\\) = historical average bid value from DSP
- \\(P_i\\) = participation rate (fraction of auctions where DSP responds)

**Optimization objective:**

$$\max \sum_{i \in \text{Selected}} P_i \times V_i \quad \text{subject to } \max(L_i) \leq 30ms$$

Maximize expected revenue while respecting latency constraint.

**Impact of regional sharding:**

- **Before**: Query 50 global DSPs, 20 timeout (40% response rate), avg latency 35ms
- **After**: Query 25 regional DSPs, 23 respond (92% response rate), avg latency 18ms

**Revenue trade-off:**
- Lost access to 25 distant DSPs
- But response rate improved 40% → 92%
- Net effect: **+15% effective bid volume** (more bids received per auction)
- Higher response rate → better price discovery → **+8% revenue per impression**

**Solution 2: Edge Bidding Caches**

For high-value DSPs that are geographically distant, **cache recent bids at the edge** and serve "predicted bids" when the DSP is too slow to respond. When a distant DSP (e.g., Asia-based) would exceed 30ms latency, the edge server queries a Redis cache for predicted bids based on similar historical contexts (user segment, time of day, ad category). A background GBDT model continuously updates predictions from historical bid logs. This allows including high-value distant DSPs without violating latency budgets.

**Bid Prediction Cache Architecture:**

**Cache key hierarchy** (Redis):

$$\text{Key} = \langle \text{DSP}_id, \text{UserSegment}, \text{AdCategory}, \text{Hour} \rangle$$

**Lookup strategy with fallback cascade:**

1. **Exact context match**: \\(O(1)\\) lookup for specific (user_segment, ad_category, hour)
2. **Segment-level aggregation**: If miss, lookup segment average (ignore hour/category)
3. **DSP global average**: Fallback to historical mean bid for DSP

**Prediction accuracy:**

$$\hat{b}_{dsp,context} = \mathbb{E}[\text{Bid} \mid \text{DSP}, \text{Context}]$$

Estimated from trailing 1-hour window of actual bids.

**Cache update policy:**

- TTL: 3600 seconds (1 hour)
- Async update when DSP responds (even if late >30ms)
- Track prediction error: \\(\epsilon = |\text{predicted} - \text{actual}|\\)

**When to use predicted bids:**

Not all DSPs should use predicted bids. Apply strategy selectively:

<style>
#tbl_3 + table th:first-of-type  { width: 35%; }
#tbl_3 + table th:nth-of-type(2) { width: 25%; }
#tbl_3 + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_3"></div>


| DSP Characteristics | Strategy | Reasoning |
|---------------------|----------|-----------|
| **High-value, distant**<br>(avg bid >$8, latency >30ms) | Use predicted bid | Revenue loss from excluding them > prediction error |
| **Low-value, distant**<br>(avg bid <$3, latency >30ms) | Skip entirely | Prediction error could make us lose money |
| **High-value, nearby**<br>(avg bid >$8, latency <20ms) | Always real-time | Best of both worlds |
| **Inconsistent bidders**<br>(bid rate <30%) | Skip | Unreliable predictions |

**Mathematical justification:**

Expected revenue from high-value distant DSP:

$$E[\text{Revenue}] = P(\text{wins auction}) \times \text{Bid Value}$$

**With real-time bid** (but 40% timeout rate):
$$E[\text{Revenue}] = 0.60 \times 0.15 \times \\$8.00 = \\$0.72$$

**With predicted bid** (100% response rate, but ±15% prediction error):
$$E[\text{Revenue}] = 1.00 \times 0.13 \times \\$7.50 = \\$0.975$$

Predicted bids yield **+35% revenue** from this DSP despite prediction inaccuracy.

**Cache hit rate requirements:**

For predicted bids to work, cache hit rate must be high (>80%). With Zipfian traffic distribution:

$$\text{Cache Size} = 0.2 \times \text{Total Contexts}$$

For 1M user segments × 50 ad categories × 24 hours = 1.2B possible contexts, cache 20% = **240M entries**

At 50 bytes per entry (DSP ID + bid + metadata): **12GB per edge location**

**Solution 3: Hybrid Approach (Recommended)**

The optimal strategy combines regional sharding with selective bid prediction: query nearby DSPs (<15ms) in real-time (Tier 1), use predicted bids for high-value distant DSPs (Tier 2), and skip low-value or unreliable partners (Tier 3). This yields ~28 total bids per auction with 18ms average latency, 97% response rate, and +12% revenue versus naive global broadcast.

**Monitoring & Validation:**

Monitor bid prediction error \\(\mu(\epsilon) < \\$1.50\\), DSP response rate \\(P(\text{response} < 30ms) > 0.85\\), revenue per auction (within 5% of baseline), and cache hit rate (>80%). Automatically demote underperforming DSPs between tiers or disable predictions when thresholds are breached.

**Validation approach:**

$$\text{A/B Test: } \frac{Revenue_{regional}}{Revenue_{global}} > 0.95$$

If regional sharding yields <95% of global revenue, strategy fails economic viability test.

**Theoretical impact:**

Based on the physics constraints shown above, regional sharding should yield:
- **Latency reduction**: From 5ms (regional) vs 28ms (transcontinental) — up to 5× improvement for distant DSPs
- **Response rate**: DSPs that previously timed out (>30ms) can now respond within budget
- **Revenue impact**: More responsive DSPs → better price discovery (exact uplift depends on DSP mix)
- **Timeout errors**: Eliminated for DSPs within regional proximity (<1000km)

**Conclusion:**

The 30ms RTB timeout is a **regional assumption** that breaks at global scale. The solution isn't to fight physics (you can't make light travel faster), but to architect around it:

1. **Regional sharding**: Only query nearby DSPs
2. **Edge caching**: Predict bids for high-value distant DSPs
3. **Selective participation**: Skip low-value or unreliable DSPs

> **Architectural Driver: Latency** - Regional DSP sharding and edge caching are direct responses to the 30ms RTB budget constraint. Physics (speed of light) makes global auctions impossible within our 100ms total latency budget.

This hybrid approach meets the 30ms budget **without sacrificing revenue** - and often improves it.

---

## Part 4: ML Inference Pipeline

### Feature Engineering Architecture

Machine learning for CTR prediction requires real-time feature computation. Features fall into three categories:

1. **Static features** (pre-computed, stored in cache): User demographics, advertiser account info, historical campaign performance
2. **Real-time features** (computed on request): Time of day, device type, current location, session context
3. **Aggregated features** (streaming aggregations): User's last 7-day engagement rate, advertiser's hourly budget pace, category-level CTR trends

The challenge is computing these features within our latency budget while maintaining consistency.

**Technology Selection: Event Streaming Platform**

Alright, before I even think about stream processing frameworks, I need to pick the event streaming backbone. This is one of those decisions where I went down a rabbit hole for days. Here's what I looked at:

<style>
#tbl_4 + table th:first-of-type  { width: 13%; }
#tbl_4 + table th:nth-of-type(2) { width: 15%; }
#tbl_4 + table th:nth-of-type(3) { width: 13%; }
#tbl_4 + table th:nth-of-type(4) { width: 17%; }
#tbl_4 + table th:nth-of-type(5) { width: 17%; }
#tbl_4 + table th:nth-of-type(6) { width: 25%; }
</style>
<div id="tbl_4"></div>

| Technology | Throughput/Partition | Latency (p99) | Durability | Ordering | Scalability |
|------------|---------------------|---------------|------------|----------|-------------|
| **Kafka** | 100MB/sec | 5-15ms | Disk-based replication | Per-partition | Horizontal (add brokers/partitions) |
| Pulsar | 80MB/sec | 10-20ms | BookKeeper (distributed log) | Per-partition | Horizontal (separate compute/storage) |
| RabbitMQ | 20MB/sec | 5-10ms | Optional persistence | Per-queue | Vertical (limited) |
| AWS Kinesis | 1MB/sec/shard | 200-500ms | S3-backed | Per-shard | Manual shard management |

**Decision: Kafka**

Rationale:
- **Throughput:** 100MB/sec per partition meets peak load (100K events/sec × 1KB/event)
- **Latency:** 5-15ms p99 fits within 100ms feature freshness budget
- **Durability:** Disk-based replication (RF=3) ensures data persistence across broker failures
- **Ecosystem maturity:** Kafka Connect, Flink, and Spark integrations well-established
- **Ordering guarantees:** Per-partition ordering preserves event causality (impressions before clicks)

While Pulsar offers elegant storage/compute separation, Kafka's ecosystem maturity and operational tooling provide better production support for this scale.

**Partitioning strategy:**

For 100K events/sec across 100 partitions, we get **1,000 events/sec per partition**.

Partition key: `user_id % 100` ensures:
- All events for a user go to same partition (maintains ordering)
- Balanced distribution (assuming uniform user distribution)

**Cost comparison:** Self-hosted Kafka (~$3-5K/month) is significantly cheaper than AWS Kinesis at high sustained throughput (20-50× cost difference at billions of PUTs/month). Managed services trade cost for operational simplicity.

**Technology Selection: Stream Processing**

**Stream Processing Frameworks:**

| Technology | Latency | Throughput | State Management | Exactly-Once | Deployment Model | Ops Complexity |
|------------|---------|------------|------------------|--------------|------------------|----------------|
| **Kafka Streams** | <50ms | 800K events/sec | Local RocksDB | Yes (transactions) | Library (embedded) | **Low** |
| Flink | <100ms | 1M events/sec | Distributed snapshots | Yes (Chandy-Lamport) | Separate cluster | Medium |
| Spark Streaming | ~500ms | 500K events/sec | Micro-batching | Yes (WAL) | Separate cluster | Medium |
| Storm | <10ms | 300K events/sec | Manual | No (at-least-once) | Separate cluster | High |

**Decision: Kafka Streams** (for simple aggregations) + **Flink** (for complex CEP)

**Initial recommendation: Kafka Streams for most use cases**

For this architecture's primary use case - windowed aggregations for feature engineering - **Kafka Streams is simpler**:

- **No separate cluster:** Kafka Streams runs as library in your application - just scale app instances
- **Better latency:** <50ms vs Flink's <100ms
- **Simpler ops:** No JobManager, TaskManager, savepoint management
- **Native Kafka integration:** Uses consumer groups directly, no external connector needed
- **Sufficient for:**
  - Windowed aggregations (user CTR last 1 hour)
  - Joins (clicks ⋈ impressions)
  - Stateful transformations

**When to use Flink instead:**

- **Complex Event Processing (CEP)**: Pattern matching across event sequences (e.g., detect fraud patterns)
- **Multi-source joins**: Joining streams from Kafka + database CDC + REST APIs
- **SQL interface**: Need Flink SQL for analyst-written streaming queries
- **Large state (>10GB per partition)**: Flink's distributed state management scales better

**Mathematical justification:**

For windowed aggregation with window size \\(W\\) and event rate \\(\lambda\\):

$$state\\_size = \lambda \times W \times event\\_size$$

Example: 100K events/sec, 60s window, 1KB/event → **~6GB state per operator**.

**Kafka Streams**: 6GB state stored locally in RocksDB per instance. With 10 app instances partitioning load, that's 600MB per instance - easily manageable.

**Trade-off accepted:** Start with Kafka Streams for operational simplicity. Migrate specific pipelines to Flink if/when complex CEP patterns needed (e.g., sophisticated fraud detection requiring temporal pattern matching).

**Batch Processing Framework:**

| Technology | Processing Speed | Fault Tolerance | Memory Usage | Ecosystem |
|------------|-----------------|-----------------|--------------|-----------|
| **Spark** | Fast (in-memory) | Lineage-based | High (RAM-heavy) | Rich (MLlib, SQL) |
| MapReduce | Slow (disk I/O) | Task restart | Low | Legacy |
| Dask | Fast (lazy eval) | Task graph | Medium | Python-native |

**Decision: Spark**
- **Daily batch jobs:** Not latency-sensitive (hours acceptable)
- **Feature engineering:** MLlib for statistical aggregations
- **SQL interface:** Data scientists can write feature queries
- **Cost efficiency:** In-memory caching for iterative computations

**Feature Store Technology:**

| Technology | Serving Latency | Feature Freshness | Online/Offline | Vendor |
|------------|----------------|-------------------|----------------|---------|
| **Tecton** | <10ms (p99) | 100ms | Both | SaaS |
| Feast | ~15ms | ~1s | Both | Open-source |
| Hopsworks | ~20ms | ~5s | Both | Open-source |
| Custom (Redis) | ~5ms | Manual | Online only | Self-built |

**Decision: Tecton** (with fallback to custom Redis)
- **Managed service:** Reduces operational burden
- **Sub-10ms SLA:** Meets latency budget
- **100ms freshness:** Stream feature updates via Flink
- **Trade-off:** Vendor lock-in vs. engineering time saved

**Cost analysis:**

Custom solution:
- 2 Senior engineers × 6 months (1 FTE-year)
- Salary cost: $250-320K (for engineers with ML systems expertise)
- Fully-loaded (2-2.5×): $500-800K
- Infrastructure: $50K/year
- **Total first year: $550-850K**, then $50K ongoing

Tecton: $100K/year SaaS fee = **$100K first year**, $100K ongoing

**Decision**: Tecton is **5-8× cheaper** in year one, plus faster time-to-market (weeks vs months). Custom solution only makes sense at massive scale or with unique requirements Tecton can't support.

**1. Real-Time Features (computed per request):**
- User context: time of day, location, device type
- Session features: current browsing session, last N actions
- Cross features: user × ad interactions

**2. Near-Real-Time Features (pre-computed, cache TTL ~10s):**
- User interests: aggregated from last 24h activity
- Ad performance: click rates, conversion rates (last hour)

**3. Batch Features (pre-computed daily):**
- User segments: demographic clusters, interest graphs
- Long-term CTR: 30-day aggregated performance

{% mermaid() %}
graph TB
    subgraph "Real-Time Feature Pipeline"
        REQ[Ad Request] --> PARSE[Request Parser]
        PARSE --> CONTEXT[Context Features<br/>time, location, device<br/>Latency: 5ms]
        PARSE --> SESSION[Session Features<br/>user actions<br/>Latency: 10ms]
    end

    subgraph "Feature Store"
        CONTEXT --> MERGE[Feature Vector Assembly]
        SESSION --> MERGE

        REDIS_RT[(Redis<br/>Near-RT Features<br/>TTL: 10s)] --> MERGE
        REDIS_BATCH[(Redis<br/>Batch Features<br/>TTL: 24h)] --> MERGE
    end

    subgraph "Stream Processing"
        EVENTS[User Events<br/>clicks, views] --> KAFKA[Kafka]
        KAFKA --> FLINK[Kafka Streams<br/>Windowed Aggregation]
        FLINK --> REDIS_RT
    end

    subgraph "Batch Processing"
        S3[S3 Data Lake] --> SPARK[Spark Jobs<br/>Daily]
        SPARK --> FEATURE_GEN[Feature Generation]
        FEATURE_GEN --> REDIS_BATCH
    end

    MERGE --> INFERENCE[ML Inference<br/>TensorFlow Serving<br/>Latency: 40ms]
    INFERENCE --> PREDICTION[CTR Prediction<br/>0.0 - 1.0]

    classDef rt fill:#ffe0e0,stroke:#cc0000
    classDef batch fill:#e0e0ff,stroke:#0000cc
    classDef store fill:#e0ffe0,stroke:#00cc00

    class REQ,PARSE,CONTEXT,SESSION rt
    class S3,SPARK,FEATURE_GEN,REDIS_BATCH batch
    class REDIS_RT,MERGE,INFERENCE store
{% end %}

### Feature Vector Construction

For each ad impression, construct feature vector \\(\mathbf{x} \in \mathbb{R}^n\\):

$$x = [x_{user}, x_{ad}, x_{context}, x_{cross}]$$

**User Features** \\(\mathbf{x}_{user} \in \mathbb{R}^{50}\\):
- Demographics: age, gender, location (one-hot encoded)
- Interests: [gaming: 0.8, fashion: 0.6, sports: 0.3, ...]
- Historical CTR: average click rate on similar ads

**Ad Features** \\(\mathbf{x}_{ad} \in \mathbb{R}^{30}\\):
- Creative type: video, image, carousel (categorical)
- Advertiser category: e-commerce, gaming, finance
- Global CTR: performance across all users
- Quality score: user feedback, policy compliance

**Context Features** \\(\mathbf{x}_{context} \in \mathbb{R}^{20}\\):
- Time: hour of day, day of week, is_weekend
- Device: iOS/Android, screen size, connection type
- Placement: story ad, feed ad, search ad

**Cross Features** \\(\mathbf{x}_{cross} \in \mathbb{R}^{50}\\):
- User-Ad interactions: has user clicked advertiser before?
- Interest-Category alignment: user.interests · ad.category
- Time-based: user active time × ad posting time

**Total dimensionality:** **150 features**.

### Model Architecture: Gradient Boosted Trees vs. Neural Networks

**Technology Selection: ML Model Architecture**

**Comparative Analysis:**

| Criterion | GBDT (LightGBM/XGBoost) | Deep Neural Network | Factorization Machines |
|-----------|------------------------|---------------------|------------------------|
| **Inference Latency** | 5-10ms (CPU) | 20-40ms (GPU required) | 3-5ms (CPU) |
| **Training Time** | 1-2 hours (daily) | 6-12 hours (daily) | 30min-1hour |
| **Data Efficiency** | Good (100K+ samples) | Requires 10M+ samples | Good (100K+ samples) |
| **Feature Engineering** | Manual required | Automatic interactions | Automatic 2nd-order |
| **Interpretability** | High (feature importance) | Low (black box) | Medium (learned weights) |
| **Memory Footprint** | 100-500MB | 1-5GB | 50-200MB |
| **Categorical Features** | Native support | Embedding layers needed | Native support |

**Latency Budget Analysis:**

Recall: ML inference budget = 40ms (out of 100ms total)

$$T_{ml} = T_{feature} + T_{inference} + T_{overhead}$$

* **GBDT:** \\(T_{ml} = 10ms + 8ms + 2ms = 20ms\\) ✓ Within budget
* **DNN:** \\(T_{ml} = 10ms + 30ms + 5ms = 45ms\\) ✗ Exceeds budget (requires GPU)
* **FM:** \\(T_{ml} = 10ms + 4ms + 1ms = 15ms\\) ✓ Best performance

**Accuracy Comparison:**

CTR prediction is fundamentally constrained by signal sparsity - user click rates are typically 0.1-2% in ads, creating severe class imbalance. Model performance expectations:

- **GBDT**: Target AUC 0.78-0.82 - Strong baseline for CTR tasks due to handling of feature interactions via tree splits. Performance ceiling exists because trees can't learn arbitrary feature combinations beyond depth limit.
- **DNN**: Target AUC 0.80-0.84 - Higher theoretical ceiling from learned embeddings and non-linear interactions, but requires significantly more training data (millions of samples) and risks overfitting with sparse signals.
- **FM**: Target AUC 0.75-0.78 - Lower ceiling due to limitation to pairwise feature interactions, but more data-efficient and stable with limited training samples.

AUC improvements translate directly to revenue: at 100M daily impressions with $2 CPM, a 1% AUC improvement (~0.5-1% CTR lift) = **$15-30K monthly revenue gain**.

**Decision Matrix (Infrastructure Costs Only):**

$$Value_{infra} = \alpha \times Accuracy - \beta \times Latency - \gamma_{infra} \times OpsCost$$

With \\(\alpha = 100\\) (revenue impact), \\(\beta = 50\\) (user experience), \\(\gamma_{infra} = 10\\) (infrastructure only):

- **GBDT:** \\(100 \times 0.80 - 50 \times 0.020 - 10 \times 5 = 29\\)
- **DNN:** \\(100 \times 0.82 - 50 \times 0.045 - 10 \times 20 = -120.25\\) (GPU cost makes this unviable)
- **FM:** \\(100 \times 0.76 - 50 \times 0.015 - 10 \times 3 = 45.25\\) ← **highest value**

**If infrastructure cost were the only factor**, FM would win. However, this matrix **omits operational complexity**.

**Production Decision: GBDT**

Adding operational complexity weight (\\(\gamma_{ops}\\)):

$$Value_{total} = \alpha \times Accuracy - \beta \times Latency - \gamma_{infra} \times InfraCost - \gamma_{ops} \times OpsBurden$$

**Operational factors favoring GBDT:**
1. **Ecosystem maturity:** LightGBM/XGBoost have 10× more production deployments than FM libraries - easier hiring, more Stack Overflow answers, better tooling
2. **Feature importance:** SHAP values critical for debugging why CTR dropped 5% (was it ad creative quality? user segment shift? seasonal effect?) - FM provides limited interpretability
3. **Incremental learning:** GBDT supports online learning with new data batches - FM requires full retraining
4. **Production risk:** Deploying less-common FM technology (\\(\gamma_{ops} \approx 40\\)) outweighs 16-point mathematical advantage

With \\(\gamma_{ops} = 40\\):
- **GBDT:** \\(29 - 40 \times 0.2 = 21\\) (low ops burden)
- **FM:** \\(45.25 - 40 \times 0.8 = 13.25\\) (high ops burden from uncommon tech)

**Trade-off:** Accept 5ms extra latency and 2-3% AUC gap for operational simplicity and team velocity.

> **Architectural Driver: Latency** - GBDT's 20ms total inference time (including feature lookup) fits within our 40ms ML budget. We rejected DNNs despite their 2-3% accuracy advantage because their 45ms latency would violate our 100ms total budget.

**Trade-off accepted:** 5ms extra latency (GBDT vs FM) for operational benefits.

**Option 1: Gradient Boosted Decision Trees (GBDT)**

**Advantages:**
- Fast inference: 5-10ms for 100 trees
- Handles categorical features naturally
- Interpretable feature importance

**Disadvantages:**
- Fixed feature interactions (up to tree depth)
- Requires manual feature engineering
- Model size grows with data complexity

**Typical hyperparameters:** 100 trees, depth 7, learning rate 0.05, with feature/data sampling for regularization. Inference latency scales linearly with tree count (~8ms for 100 trees).

**Option 2: Deep Neural Network (DNN)**

**Advantages:**
- Learns feature interactions automatically
- Scales with data (more data → better performance)
- Supports embedding layers for high-cardinality categoricals

**Disadvantages:**
- Slower inference: 20-40ms depending on model size
- Requires more training data (millions of samples)
- Less interpretable

**Typical architecture:** Embedding layers for categoricals, followed by 3 dense layers (256→128→64 units with ReLU, 0.3 dropout), sigmoid output. Trained via binary cross-entropy with Adam optimizer. Inference latency ~20-40ms depending on batch size and hardware (GPU vs CPU).

### The Cold Start Problem: Serving Ads Without Historical Data

**The Challenge:**

Your CTR prediction models depend on historical user behavior, advertiser performance, and engagement patterns. But what happens when:
- **New user** signs up - zero click history
- **New advertiser** launches first campaign - no performance data
- **Platform launch** (day 1) - entire system has no historical data

Serving random ads would devastate revenue and user experience. You need a **multi-tier fallback strategy** that gracefully degrades from personalized to increasingly generic predictions.

**Multi-Tier Cold Start Strategy:**

The key architectural principle: **graceful degradation from personalized to generic predictions** as data availability decreases. Each tier represents a fallback when insufficient data exists for the previous tier.

**Quick Comparison:**

| Tier | Data Threshold | Strategy | Relative Accuracy |
|------|----------------|----------|-------------------|
| **1** | >100 impressions | Personalized ML | Highest (baseline) |
| **2** | 10-100 impressions | Cohort-based | -10-15% vs Tier 1 |
| **3** | <10 impressions | Demographic avg | -15-25% vs Tier 1 |
| **4** | No data | Category priors | -20-30% vs Tier 1 |

**Tier 1: Rich User History (>100 impressions)**

- **Prediction source:** User-specific GBDT model trained on individual engagement patterns
- **When to use:** Returning users with weeks of interaction history
- **What you know:** Which ad categories they click, preferred formats (video vs static), optimal times (morning commute vs evening browse), device preferences
- **Example:** User has clicked 15 gaming ads, 8 e-commerce ads, ignored 200+ finance ads → confidently predict gaming/shopping interests

**Tier 2: User Cohort (10-100 impressions)**

- **Prediction source:** Similar users' aggregated CTR weighted by demographic/behavioral similarity
- **When to use:** New users (3-7 days old) with limited but non-zero history
- **What you know:** Basic demographics (age, location, device) plus a few app installs or early interactions
- **Example:** New user (age 25-34, NYC, iOS, installed 3 shopping apps) → match to cohort of "young urban professionals who shop on mobile" and use their average engagement rates

**Tier 3: Broad Segment (<10 impressions)**

- **Prediction source:** Segment-level CTR averaged across thousands of users in similar demographic buckets
- **When to use:** Brand new users in first session, or privacy-focused users with minimal tracking
- **What you know:** Only coarse signals (country, platform, time of day)
- **Example:** Anonymous user, first visit, only know (country=US, platform=mobile, time=evening) → use "US mobile evening users" segment baseline CTR

**Tier 4: Global Baseline (No user data)**

- **Prediction source:** Historical CTR by ad category/format across all users (industry benchmarks or platform historical averages)
- **When to use:** Platform launch, complete data loss, or strict privacy mode
- **What you know:** Nothing about the user - only the ad itself
- **Example:** Platform day 1, no user data exists → fall back to category priors like "e-commerce ads: 1.8% CTR, gaming ads: 3.2% CTR, finance ads: 0.9% CTR" from industry reports

**Accuracy Trade-off Pattern:**

Accuracy degrades as you move down tiers, but the **relative pattern matters more than exact numbers**:

$$Accuracy_{\text{(Tier N)}} < Accuracy_{\text{(Tier N-1)}}$$

**Typical degradation observed in production CTR systems** (based on industry reports from Meta, Google, Twitter ad platforms):
- **Tier 1 → Tier 2:** 10-15% accuracy loss (personalized → cohort)
- **Tier 2 → Tier 3:** Additional 5-10% loss (cohort → segment)
- **Tier 3 → Tier 4:** Additional 5-8% loss (segment → global)

**Total accuracy range:** Tier 1 might achieve AUC 0.78-0.82, while Tier 4 drops to 0.60-0.68. Exact values depend heavily on:
- Signal strength (ad creative quality, user engagement patterns)
- Feature richness (sparse vs dense user profiles)
- Domain (gaming ads have higher baseline CTR than insurance ads)
- Market maturity (established platform vs new market entry)

**Key insight:** Even degraded predictions (Tier 3-4) significantly outperform random serving (AUC 0.50), which would be catastrophic for revenue.

**Mathematical Model - ε-greedy Exploration:**

For new users, balance **exploitation** (show known high-CTR ads) vs **exploration** (gather data for future personalization):

$$a_t = \begin{cases}
\arg\max_a Q(a) & \text{with probability } 1 - \epsilon \\\\
\text{random action} & \text{with probability } \epsilon
\end{cases}$$

where:
- \\(Q(a)\\) = estimated CTR for ad \\(a\\) based on current data
- \\(\epsilon\\) = exploration rate (typically 0.05-0.10 for new users)

**Adaptive exploration rate:**

$$\epsilon(n) = \frac{\epsilon_0}{1 + \log(n + 1)}$$

where \\(n\\) is the number of impressions served to this user. New users get \\(\epsilon = 0.10\\) (10% random exploration), converging to \\(\epsilon = 0.02\\) after 1000 impressions.

**Advertiser Bootstrapping:**

New advertisers face similar challenges - their ads have no performance history. Strategy:

1. **Minimum spend requirement**: Require \$500 minimum spend before enabling full optimization
2. **Broad targeting phase**: First 10K impressions use broad targeting to gather signal across demographics
3. **Thompson Sampling**: Bayesian approach for bid optimization during bootstrap phase

$$P(\theta | D) \propto P(D | \theta) \times P(\theta)$$

where \\(\theta\\) = true CTR, \\(D\\) = observed clicks/impressions. Sample from posterior to balance exploration/exploitation.

**Platform Launch (Day 1) Scenario:**

When launching the entire platform with zero historical data:

1. **Pre-seed with industry benchmarks**: Use published CTR averages by vertical (e-commerce: 2%, finance: 0.5%, gaming: 5%)
2. **Synthetic data generation**: Create simulated user profiles and engagement patterns for initial model training
3. **Rapid learning mode**: First 48 hours run at \\(\epsilon = 0.20\\) (high exploration) to quickly gather training data
4. **Cohort velocity tracking**: Monitor how quickly each cohort accumulates usable signal

$$T_{bootstrap} = \frac{N_{min}}{R_{impressions} \times P_{engagement}}$$

where:
- \\(N_{min}\\) = minimum samples for reliable prediction (typically 100 clicks)
- \\(R_{impressions}\\) = impression rate per user/day
- \\(P_{engagement}\\) = estimated click rate

**Example**: To gather 100 clicks at 2% CTR with 10 impressions/day per user: \\(T = \frac{100}{10 \times 0.02} = 500\\) days per user. Solution: aggregate across cohorts to reach critical mass faster.

**Trade-off Analysis:**

Cold start strategy impacts revenue during bootstrap period:

- **Week 1**: Operating at ~65% of optimal revenue (global averages only)
- **Week 2-4**: Ramp to ~75% (cohort data accumulating)
- **Month 2+**: Reach ~90%+ (sufficient user-level history)

This is acceptable - **better to launch with 65% revenue than wait 6 months** for perfect data that won't exist until you launch.

### Model Serving Infrastructure

**Technology Selection: Model Serving**

**Model Serving Platforms:**

| Platform | Latency (p99) | Throughput | Batching | GPU Support | Ops Complexity |
|----------|--------------|------------|----------|-------------|----------------|
| **TensorFlow Serving** | 30-40ms | 1K req/sec | Auto | Excellent | Medium |
| TorchServe | 35-45ms | 800 req/sec | Auto | Good | Medium |
| NVIDIA Triton | 25-35ms | 1.5K req/sec | Auto | Excellent | High |
| Seldon Core | 40-50ms | 600 req/sec | Manual | Good | High (K8s) |
| Custom Flask/FastAPI | 50-100ms | 200 req/sec | Manual | Poor | Low |

**Decision: TensorFlow Serving** (primary) with **NVIDIA Triton** (evaluation)

**Rationale:**
- **Mature ecosystem:** Production-proven at Google scale
- **Auto-batching:** Automatically batches requests for GPU efficiency
- **gRPC support:** Lower serialization overhead than REST (15ms → 5ms)
- **Model versioning:** A/B testing without redeployment

**NVIDIA Triton consideration:** 20% lower latency, but requires heterogeneous model formats (TF, PyTorch, ONNX). Added complexity not justified unless multi-framework requirement emerges.

**Technology Selection: Container Orchestration**

Okay, container orchestration - this is where things get real. I need to pick something that'll handle GPU scheduling for ML, scale properly, and not lock me into one cloud provider. Here's what I compared:

| Technology | Learning Curve | Ecosystem | Auto-scaling | Multi-cloud | Networking |
|------------|----------------|-----------|--------------|-------------|------------|
| **Kubernetes** | Steep | Massive (CNCF) | HPA, VPA, Cluster Autoscaler | Yes (portable) | Advanced (CNI, Service Mesh) |
| AWS ECS | Medium | AWS-native | Target tracking, step scaling | No (AWS-only) | AWS VPC |
| Docker Swarm | Easy | Limited | Basic (replicas) | Yes (portable) | Overlay networking |
| Nomad | Medium | HashiCorp ecosystem | Auto-scaling plugins | Yes (portable) | Consul integration |

**Decision: Kubernetes**

> **Architectural Driver: Availability** - Kubernetes auto-scaling (HPA) and self-healing prevent capacity exhaustion during traffic spikes. GPU node affinity ensures ML inference survives node failures by automatically rescheduling pods.

Rationale:
- **GPU scheduling:** Native support for GPU node affinity and resource limits, critical for ML workloads
- **Custom metric scaling:** HPA supports queue depth and latency-based scaling (CPU/memory insufficient for GPU-bound workloads)
- **Ecosystem maturity:** 78% industry adoption, extensive tooling, readily available expertise
- **Service mesh integration:** Native Istio/Linkerd support for circuit breaking and traffic management
- **Multi-cloud portability:** Deploy to AWS, GCP, Azure without architectural changes

While Kubernetes introduces operational complexity, GPU orchestration and multi-cloud requirements justify the investment.

**Kubernetes-specific features critical for ads platform:**

1. **Horizontal Pod Autoscaler (HPA) with Custom Metrics:**

   CPU/memory metrics are lagging indicators for this workload - ML inference is GPU-bound (CPU at 20% while GPU saturated), and CPU spikes occur after queue buildup. Use workload-specific metrics instead:

   **Scaling formula:** \\(\text{desired replicas} = \lceil \text{current replicas} \times \frac{\text{current metric}}{\text{target metric}} \rceil\\)

   **Custom metrics:**
   - **Inference queue depth**: Target 100 requests (current: 250 → scale 10 to 25 pods)
   - **Request latency p99**: Target 80ms within 100ms budget
   - **Cache hit rate**: Scale cache tier when <85%

   **Accounting for provisioning delays:**

   $$N_{buffer} = \frac{dQ}{dt} \times (T_{provision} + T_{warmup})$$

   where \\(\frac{dQ}{dt}\\) = traffic growth rate, \\(T_{provision}\\) = node startup (90-120s for GPU instances), \\(T_{warmup}\\) = model loading (20-40s).

   **Example:** Traffic growing at 10K QPS/sec with 90s total startup requires scaling at \\(90\\% - \frac{900 \text{ pods}}{\text{capacity}}\\) to avoid overload during provisioning. Trade-off: GPU node startup latency forces earlier scaling with higher idle capacity cost.

2. **GPU Node Affinity:**
   - Schedule ML inference pods only on GPU nodes using node selectors
   - Prevents GPU resource waste by isolating GPU workloads

3. **StatefulSets for Stateful Services:**
   - Deploy CockroachDB, Redis clusters with stable network identities
   - Ordered pod creation/deletion (e.g., CockroachDB region placement first)

4. **Istio Service Mesh:**
   - **Traffic splitting:** A/B test new model versions (90% traffic to v1, 10% to v2)
   - **Circuit breaking:** Automatic failure detection, failover to backup services
   - **Observability:** Automatic trace injection, latency histograms per service

**Why not AWS ECS?**

ECS advantages (managed, lower cost) offset by:
- Vendor lock-in - migration to GCP/Azure requires rewriting task definitions
- Auto-scaling is limited to CPU/memory target tracking - no custom metrics
- GPU support requires manual AMI management without node affinity
- Insufficient for complex ML infrastructure

**Why not Docker Swarm:**

- Minimal ecosystem adoption (~5% market share, stagnant development)
- No GPU scheduling, limited auto-scaling, no service mesh
- High operational risk due to limited engineer availability
- Docker Inc. has de-prioritized in favor of Kubernetes

**The cost trade-off (rough comparison for ~100 nodes):**

Kubernetes (managed service like EKS):
- Control plane fees (managed)
- Worker node infrastructure costs
- Operational overhead (engineering time for management)
- **Rough total: Can vary widely** depending on instance types and configuration

AWS ECS (Fargate):
- Per-vCPU and per-GB-memory pricing
- No control plane fees
- Lower operational overhead (fully managed)
- **Generally 10-20% cheaper** than Kubernetes on EC2 instances for basic workloads

**So why might I still choose Kubernetes despite slightly higher costs?**

The GPU support and multi-cloud portability matter for this use case. ECS Fargate has limited GPU support, and I prefer not being locked into AWS. The premium (perhaps 10-20% higher monthly costs) acts as insurance against vendor lock-in and provides proper GPU scheduling for ML workloads.

That said, your calculation might differ - ECS could make sense if you're committed to AWS and don't need GPU orchestration.

**Deployment Strategy Comparison:**

| Strategy | Cold Start | Auto-scaling | Cost | Reliability |
|----------|------------|--------------|------|-------------|
| **Dedicated instances** | 0ms (always warm) | Manual | High (24/7) | High |
| **Kubernetes pods** | 30-60s | Auto (HPA) | Medium | Medium |
| Serverless (Lambda) | 5-10s | Instant | Low (pay-per-use) | Low (cold starts) |

**Decision: Dedicated GPU instances** with **Kubernetes orchestration**

**Cost-benefit calculation:**

**Option A: Dedicated T4 GPUs (always-on)**
- 10 instances × $0.526/hour × 720 hours/month = **$3,787/month**
- Latency: 30ms (no cold start)
- Availability: 99.9%

**Option B: Kubernetes with auto-scaling (3 min, 10 max instances)**
- Average load: 5 instances × $0.526/hour × 720 hours = **$1,894/month**
- Burst capacity: Additional instances provision in 90s
- Cost savings: **50%**, acceptable 90s warmup during spikes

**Option C: AWS Lambda with GPU**
- Not viable: 5-10s cold start violates 100ms latency SLA

**Winner: Option B (Kubernetes with auto-scaling)** - balances cost and performance.

To meet sub-40ms latency requirements, use TensorFlow Serving with optimizations:

**1. Request Batching**

Accumulate requests for 5ms, batch inference.

**Example:** Batch size 32, 25ms inference time → **~1,280 predictions/second per GPU**.

**2. Model Quantization**

Convert FP32 → INT8:

**Mathematical Transformation:**

For weight matrix \\(W \in \mathbb{R}^{m \times n}\\) with FP32 precision:

$$W_{int8}[i,j] = \text{round}\left(\frac{W[i,j] - W_{min}}{W_{max} - W_{min}} \times 255\right)$$

Inference:
$$y = W_{int8} \cdot x_{int8} \times scale + zero\\_point$$

**Benefits:**
- 4x memory reduction (32-bit → 8-bit)
- 2-4x inference speedup (INT8 ops faster)
- Accuracy loss: typically <1% AUC degradation

**3. GPU Acceleration**

Deploy on NVIDIA T4 GPUs:
- FP32 throughput: 65 TFLOPS
- INT8 throughput: 130 TOPS (2x faster)

**Cost-Benefit Analysis:**

CPU inference: 100 requests/sec per core, ~$0.042/hour per vCPU (c6i.xlarge: 4 vCPUs @ $0.17/hour)
GPU inference (g4dn.xlarge): 1,280 requests/sec, $0.526/hour

**Cost per 1M predictions:**
- CPU: \\(\frac{1,000,000}{100 \times 3600} \times 0.042 = \\$0.117\\)
- GPU: \\(\frac{1,000,000}{1,280 \times 3600} \times 0.526 = \\$0.114\\)

GPU is similar cost at scale but **significantly better latency** (meets <40ms requirement vs CPU's 100ms+).

**Source:** AWS EC2 g4dn.xlarge pricing: $0.526/hour, c6i.xlarge: $0.17/hour (instances.vantage.sh, October 2025)

### Feature Store: Tecton Architecture

{% mermaid() %}
graph TB
    subgraph "Feature Definition Layer"
        DEF[Feature Definitions<br/>Python/SQL DSL]
        DEF --> BATCH[Batch Feature Views]
        DEF --> STREAM[Stream Feature Views]
        DEF --> REALTIME[Real-Time Feature Views]
    end

    subgraph "Data Sources"
        S3_SOURCE[(S3/HDFS<br/>Historical Data)]
        KAFKA_SOURCE[Kafka Topics<br/>Event Stream]
        DB_SOURCE[(PostgreSQL<br/>Transactional Data)]
    end

    subgraph "Feature Computation"
        SPARK_BATCH[Spark Jobs<br/>Daily/Hourly]
        FLINK_STREAM[Flink Streaming<br/>Windowed Aggregations]
        API_RT[Real-Time API<br/>On-Demand Compute]
    end

    subgraph "Feature Storage"
        OFFLINE[(Offline Store<br/>S3 Parquet<br/>Historical Features)]
        ONLINE[(Online Store<br/>Redis/DynamoDB<br/>Low-latency Serving)]
    end

    subgraph "Serving Layer"
        REST[REST API<br/>HTTP/2]
        GRPC[gRPC API<br/>High Performance]
        SDK[Python/Java SDK]
    end

    S3_SOURCE --> SPARK_BATCH
    KAFKA_SOURCE --> FLINK_STREAM
    DB_SOURCE --> API_RT

    BATCH --> SPARK_BATCH
    STREAM --> FLINK_STREAM
    REALTIME --> API_RT

    SPARK_BATCH --> OFFLINE
    SPARK_BATCH --> ONLINE
    FLINK_STREAM --> ONLINE
    API_RT --> ONLINE

    ONLINE --> REST
    ONLINE --> GRPC
    ONLINE --> SDK

    REST --> INFERENCE[ML Inference Service]
    GRPC --> INFERENCE
    SDK --> INFERENCE

    classDef source fill:#e1f5fe,stroke:#01579b
    classDef compute fill:#f3e5f5,stroke:#4a148c
    classDef storage fill:#e8f5e9,stroke:#1b5e20
    classDef serving fill:#fff3e0,stroke:#e65100

    class S3_SOURCE,KAFKA_SOURCE,DB_SOURCE source
    class SPARK_BATCH,FLINK_STREAM,API_RT compute
    class OFFLINE,ONLINE storage
    class REST,GRPC,SDK,INFERENCE serving
{% end %}

**Feature Freshness Guarantees:**

- **Batch features:** \\(t_{fresh} \leq 24h\\)
- **Stream features:** \\(t_{fresh} \leq 100ms\\)
- **Real-time features:** \\(t_{fresh} = 0\\) (computed per request)

**Latency SLA:**
$$P(\text{FeatureLookup} \leq 10ms) \geq 0.99$$

Achieved with:
- Redis p99 latency: 5ms
- DynamoDB p99 latency: 8ms
- Feature vector assembly: 2ms

---

## Part 5: Distributed Caching Architecture

### Multi-Tier Cache Hierarchy

To achieve 95%+ cache hit rate with sub-10ms latency, implement three cache tiers:

**Technology Selection: Cache Tier Choices**

**L1 Cache Options:**

| Technology | Latency | Throughput | Memory | Pros | Cons |
|------------|---------|------------|--------|------|------|
| **Caffeine (JVM)** | ~1μs | 10M ops/sec | In-heap | Window TinyLFU eviction, lock-free reads | JVM-only, GC pressure |
| Guava Cache | ~1.5μs | 5M ops/sec | In-heap | Simple API, widely used | LRU only, lower hit rate |
| Ehcache | ~1.5μs | 8M ops/sec | In/off-heap | Off-heap option reduces GC | More complex configuration |

**Decision: Caffeine** - Superior eviction algorithm (Window TinyLFU) yields 10-15% higher hit rates than LRU-based alternatives. Benchmarks show ~2x throughput vs. Guava.

**L2 Cache Options:**

| Technology | Latency (p99) | Throughput | Clustering | Data Structures | Pros | Cons |
|------------|---------------|------------|------------|-----------------|------|------|
| **Redis Cluster** | 5ms | 100K ops/sec/node | Native sharding | Rich (lists, sets, sorted sets) | Lua scripting, atomic ops | More memory than Memcached |
| Memcached | 3ms | 150K ops/sec/node | Client-side sharding | Key-value only | Lower memory, simpler | No atomic ops, no persistence |
| Hazelcast | 8ms | 50K ops/sec/node | Native clustering | Rich data structures | Java integration | Higher latency, less mature |

**Decision: Redis Cluster**

> **Architectural Driver: Financial Accuracy** - Redis atomic operations (DECRBY/INCRBY) provide strong consistency for budget counters. Memcached lacks atomicity, which could cause budget race conditions and unbounded over-delivery (servers allocating from stale budget values).

- **Need atomic operations** for budget counters (DECRBY, INCRBY)
- **Complex data structures** for ad metadata (sorted sets for recency, hashes for attributes)
- **Persistence** for crash recovery (avoid cold cache startup)
- **Trade-off accepted:** 30% higher memory usage vs. Memcached for operational simplicity

**Performance Analysis:**

Memcached typically costs **~30% less** than Redis for equivalent capacity, but Redis offers atomic operations and richer data structures that justify the premium for this use case.

**Valkey Alternative (Redis Fork):**

In 2024, Redis Labs changed licensing from BSD to dual-license (SSPL + proprietary), creating uncertainty for commercial users. The Linux Foundation forked Redis into **Valkey** with permissive BSD-3 license:

- **API-compatible:** Drop-in replacement for Redis
- **Clear licensing:** BSD-3 (no SSPL restrictions)
- **Industry backing:** AWS, Google Cloud, Oracle backing Linux Foundation project
- **Migration path:** AWS ElastiCache transitioning to Valkey

**Recommendation:** Use Valkey for new deployments to avoid licensing ambiguity. Migration from Redis is trivial (same protocol, same commands, same performance).

**L3 Persistent Store Options:**

**Note:** Write throughput numbers reflect **cluster-level performance** at production scale (20-80 nodes for distributed databases). Single-node performance is typically 5-20K writes/sec depending on hardware and workload characteristics.

| Technology | Read Latency (p99) | Write Throughput<br/>(cluster-level) | Scalability | Consistency | HLC Built-in | Pros | Cons |
|------------|-------------------|------------------|-------------|-------------|--------------|------|------|
| **CockroachDB** | 10-15ms | 400K writes/sec<br/>(60-80 nodes) | Horizontal (Raft) | Strong (ACID) | Yes | SQL, multi-region, built-in HLC | License (BSL → Apache 2.0) |
| YugabyteDB | 10-15ms | 400K writes/sec<br/>(60-80 nodes) | Horizontal (Raft) | Strong (ACID) | Yes | PostgreSQL-compatible | Smaller ecosystem |
| Cassandra | 20ms | 500K writes/sec<br/>(100+ nodes) | Linear (peer-to-peer) | Tunable (eventual) | No | Multi-DC, mature | No JOINs, eventual consistency |
| PostgreSQL | 15ms | 50K writes/sec<br/>(single node) | Vertical + sharding | ACID transactions | No | SQL, JOINs, strong consistency | Manual sharding complex |
| DynamoDB | 10ms | 1M writes/sec<br/>(auto-scaled) | Fully managed | Eventual/strong | No | Auto-scaling, no ops | Vendor lock-in, cost at scale |

**Decision: CockroachDB**

> **Architectural Driver: Financial Accuracy + Latency** - CockroachDB provides strong ACID consistency with built-in Hybrid Logical Clocks (HLC), eliminating the need for custom clock synchronization implementation. 10-15ms reads (vs Cassandra's 20ms) help meet latency budgets while ensuring billing accuracy.

- **Scale requirement:** 400M users → 4TB+ user profiles
- **Strong consistency:** ACID transactions align with financial accuracy requirements (no custom eventual→strong reconciliation logic needed)
- **Built-in HLC:** Native timestamp ordering across regions eliminates 150+ lines of custom NTP+HLC implementation
- **Multi-region:** Built-in geo-partitioning with CL=QUORUM for regional writes
- **SQL compatibility:** Full SQL + JOINs simplify application development vs CQL
- **Better read latency:** 10-15ms vs Cassandra's 20ms

**Cassandra consideration:** Higher write throughput (500K vs 400K writes/sec), but eventual consistency creates complexity for financial data. Would require custom HLC implementation (lines 2234-2285) plus reconciliation logic.

**YugabyteDB alternative:** Similar architecture to CockroachDB, PostgreSQL wire-compatible. Either choice is valid; CockroachDB chosen for slightly more mature multi-region deployment tooling.

**PostgreSQL limitation:** Vertical scaling hits ceiling around 50-100TB. Sharding (e.g., Citus) adds operational complexity comparable to CockroachDB, but without native multi-region or HLC.

**DynamoDB consideration:** At 8B requests/day @ **$300K/month** (\\(\frac{8 \times 10^{9}}{1000} \times 1.25 \times 10^{-6} = \\$10,000/day\\))

CockroachDB on 60-80 nodes @ $500/node/month: **$30-40K/month** (7-10× cheaper at this scale).

{% mermaid() %}
graph TB
    subgraph "Request Flow"
        REQ[Cache Request<br/>user_id: 12345]
    end

    subgraph "L1: In-Process Cache"
        L1[Caffeine JVM Cache<br/>10-second TTL<br/>~1μs lookup<br/>100MB per server]
        L1_HIT{Hit?}
        L1_STATS[L1 Statistics<br/>Hit Rate: 60%<br/>Avg Latency: 1μs]
    end

    subgraph "L2: Distributed Cache"
        L2[Redis Cluster<br/>30-second TTL<br/>~5ms lookup<br/>1000 nodes × 16GB]
        L2_HIT{Hit?}
        L2_STATS[L2 Statistics<br/>Hit Rate: 35%<br/>Avg Latency: 5ms]
    end

    subgraph "L3: Persistent Store"
        L3[CockroachDB Cluster<br/>Multi-Region ACID<br/>~10-15ms read<br/>Strong Consistency]
        L3_STATS[L3 Statistics<br/>Hit Rate: 5%<br/>Avg Latency: 12ms]
    end

    subgraph "Hot Key Detection"
        MONITOR[Stream Processor<br/>Kafka Streams<br/>Count-Min Sketch]
        REPLICATE[Dynamic Replication<br/>3x copies for hot keys]
    end

    REQ --> L1
    L1 --> L1_HIT
    L1_HIT -->|60% Hit| RESP1[Response<br/>~1μs]
    L1_HIT -->|40% Miss| L2

    L2 --> L2_HIT
    L2_HIT -->|35% Hit| POPULATE_L1[Populate L1]
    POPULATE_L1 --> RESP2[Response<br/>~5ms]
    L2_HIT -->|5% Miss| L3

    L3 --> POPULATE_L2[Populate L2 + L1]
    POPULATE_L2 --> RESP3[Response<br/>~20ms]

    L2 -.->|0.1% sampling| MONITOR
    MONITOR -.->|Detect hot keys| REPLICATE
    REPLICATE -.->|Replicate to nodes| L2

    subgraph "Overall Performance"
        PERF[Total Hit Rate: 95%<br/>Average Latency: 2.75ms<br/>p99 Latency: 25ms]
    end

    classDef cache fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef source fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef monitor fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px

    class L1,L2 cache
    class L3 source
    class MONITOR,REPLICATE monitor
{% end %}

### Cache Performance Analysis

**Hit Rate Calculation:**

Let \\(H_i\\) be the hit rate of tier \\(i\\). Total hit rate:

$$H_{total} = H_1 + (1 - H_1) \times H_2 + (1 - H_1)(1 - H_2) \times H_3$$

With \\(H_1 = 0.60\\), \\(H_2 = 0.35\\), \\(H_3 = 1.0\\): **Overall hit rate = 95%**

**Average Latency:**

$$\mathbb{E}[L] = H_1 L_1 + (1-H_1)H_2 L_2 + (1-H_1)(1-H_2) L_3$$

With L2 hit rate of 87.5% (conditional on L1 miss) and latencies \\(L_1 = 0.001ms\\), \\(L_2 = 5ms\\), \\(L_3 = 20ms\\): **Expected latency = 2.75ms**

### Cache Cost Optimization: The Economic Tradeoff

> **Architectural Driver: Financial Accuracy + Latency** - Cache sizing is not just a performance problem but an economic optimization. At scale, every GB of Redis costs money, every cache miss hits the database (cost + latency), and every millisecond of added latency costs revenue. The optimal cache size balances these three factors.

**The Fundamental Tradeoff:**

At 1M QPS with 400M users, cache sizing decisions have massive financial impact:
- **Too small cache**: High miss rate → database overload + latency spikes → revenue loss
- **Too large cache**: Paying for Redis memory that delivers diminishing returns
- **Optimal size**: Maximizes profit = revenue - (cache cost + database cost + latency cost)

**Cost Model:**

The total cost function combines three components:

$$C_{total} = C_{cache}(S) + C_{db}(S) + C_{latency}(S)$$

where \\(S\\) = cache size (GB)

**Component 1: Cache Memory Cost**

$$C_{cache}(S) = S \times P_{memory} \times N_{nodes}$$

where:
- \\(S\\) = cache size per node (GB)
- \\(P_{memory}\\) = cost per GB-month (ElastiCache r7g: ~$10/GB/month, see pricing note below)
- \\(N_{nodes}\\) = number of Redis nodes

**AWS ElastiCache Pricing (2025):**
- cache.r7g.xlarge: $0.437/hour = $319/month for 26.32 GB → **$12.12/GB/month** (Redis OSS)
- Valkey (20% cheaper): $0.350/hour = $255/month → **$9.69/GB/month**
- Source: instances.vantage.sh/aws/elasticache/cache.r7g.xlarge (October 2025)
- **Using $10/GB/month** (conservative estimate between Valkey and Redis OSS)

**Example:** 1000 nodes × 16GB/node × $10/GB = **$160K/month**

**Component 2: Database Query Cost**

Cache misses hit CockroachDB, which costs both compute and I/O:

$$C_{db}(S) = Q_{total} \times (1 - H(S)) \times C_{query}$$

where:
- \\(Q_{total}\\) = total queries/month
- \\(H(S)\\) = hit rate as function of cache size
- \\(C_{query}\\) = cost per database query (~$0.0001 for CockroachDB read)

**Example:** 2.6B queries/month × 5% miss rate × $0.0001 = **$13K/month**

**Component 3: Revenue Loss from Latency**

Every cache miss adds ~15ms latency (database read vs cache hit). Amazon's study: 100ms latency = 1% revenue loss.

$$C_{latency}(S) = R_{monthly} \times (1 - H(S)) \times \frac{\Delta L}{100ms} \times 0.01$$

where:
- \\(R_{monthly}\\) = monthly revenue (~$10M for 1M QPS platform)
- \\(\Delta L\\) = latency penalty per miss (15ms)
- 0.01 = 1% revenue loss per 100ms

**Example:** $10M/month × 5% miss × (15ms/100ms) × 1% = **$7.5K/month** revenue loss

**Modeling User Access Patterns: Why Zipfian Distribution?**

Real-world user access patterns in web systems follow a **power law** distribution, not a uniform distribution. A small fraction of users (or items) account for a disproportionately large fraction of traffic.

**Zipfian distribution** (named after linguist George Zipf) models this phenomenon:
- The most popular item gets accessed \\(\frac{1}{1}\\) times as often as expected
- The 2nd most popular item gets \\(\frac{1}{2}\\) times as often
- The nth most popular item gets \\(\frac{1}{n}\\) times as often

**Why Zipfian for ad platforms?**
- **Empirically validated**: YouTube (2016): 10% of videos account for 80% of views. Facebook (2013): Top 1% of users generate 30% of content interactions.
- **User behavior**: Power users (daily active) access the platform far more frequently than casual users (weekly/monthly)
- **Advertiser concentration**: Large advertisers (Procter & Gamble, Unilever) run continuous campaigns; small advertisers run sporadic 1-week campaigns

**Alternative distributions considered:**

| Distribution | Formula | Use Case | Why NOT Used Here |
|--------------|---------|----------|-------------------|
| **Uniform** | \\(P(x) = \frac{1}{N}\\) | All items equally likely | Unrealistic - not all users access platform equally |
| **Normal (Gaussian)** | \\(P(x) = \frac{1}{\sigma\sqrt{2\pi}}e^{-\frac{(x-\mu)^2}{2\sigma^2}}\\) | Symmetric around mean | User access has long tail, not symmetric |
| **Exponential** | \\(P(x) = \lambda e^{-\lambda x}\\) | Time between events | Models timing, not popularity ranking |
| **Zipfian (power law)** | \\(P(\text{rank } r) \propto \frac{1}{r^{\alpha}}\\) | Popularity ranking | **Matches real-world access patterns** |

**Parameter choice:** \\(\alpha = 1.0\\) (classic Zipf's law) is standard for web caching literature. Higher \\(\alpha\\) (e.g., 1.5) means more concentration at the top; lower \\(\alpha\\) (e.g., 0.7) means flatter distribution.

**Hit Rate as Function of Cache Size (Zipfian Distribution):**

User access follows Zipfian distribution with \\(\alpha = 1.0\\) (power law):

$$P(\text{rank } r) = \frac{1/r}{\sum_{i=1}^{N} 1/i} \approx \frac{1}{r \times \ln(N)}$$

**Cache hit rate:**

$$H(S) = \frac{\text{\\# of cached items}}{\text{Total items}} \times \text{Access weight}$$

For Zipfian(\\(\alpha=1.0\\)):

| Cache Coverage | Hit Rate | Cache Size (% of total) |
|----------------|----------|------------------------|
| Top 1% of users | 45-50% | 1% × 4TB = 40GB |
| Top 5% of users | 70-75% | 5% × 4TB = 200GB |
| Top 10% of users | 80-85% | 10% × 4TB = 400GB |
| Top 20% of users | 90-95% | 20% × 4TB = 800GB |
| Top 40% of users | 96-98% | 40% × 4TB = 1.6TB |

**Key insight:** Zipfian distribution means **diminishing returns** after ~20% coverage.

**Marginal Cost Analysis:**

The optimal cache size occurs where marginal cost equals marginal benefit:

$$\frac{dC_{total}}{dS} = 0$$

**Marginal cost** (adding 1 GB of cache):
$$\text{MC}_{cache} = 1GB \times \\$10/GB \times 1000 \text{ nodes} = \\$10,000/month$$

**Marginal benefit** (hit rate improvement):

For Zipfian distribution, adding cache beyond 20% coverage yields <0.5% hit rate improvement:

$$\text{MB} = \Delta H \times (C_{db} + C_{latency})$$

**Example:**
- Going from 20% → 30% coverage: +0.5% hit rate
- Benefit: 0.005 × (2.6B queries × $0.0001 + $7.5K latency) ≈ **$1.7K/month**
- Cost: 10% × 4TB = 400GB additional cache × $10/GB × 1000 nodes = **$4M/month**

**Not worth it** - marginal cost far exceeds marginal benefit.

**Optimal Cache Size Calculation:**

Given our constraints:
- Total dataset: 4TB (400M users × 10KB/user)
- Monthly revenue: $10M
- Redis cost: $10/GB/month (corrected from $20/GB)
- Database query cost: $0.0001/query
- Latency penalty: 1% revenue per 100ms

**Optimize:**

$$\min_{S} \left[ S \times 10 \times 1000 + 2.6B \times (1-H(S)) \times 0.0001 + 10M \times (1-H(S)) \times 0.15 \times 0.01 \right]$$

Subject to:
- \\(H(S) \geq 0.80\\) (minimum acceptable hit rate)
- \\(L_{p99} \leq 10ms\\) (latency SLA)

**Solution:**

| Cache Size | Hit Rate | Monthly Cost Breakdown | Total Cost |
|------------|----------|------------------------|------------|
| **5% (200GB)** | 72% | Cache: $20K, DB: $73K, Latency: $42K | **$135K** (high DB+latency cost) |
| **10% (400GB)** | 83% | Cache: $40K, DB: $44K, Latency: $25.5K | **$109.5K** |
| **20% (800GB)** | 93% | Cache: $80K, DB: $18K, Latency: $10.5K | **$108.5K** (optimal) |
| **40% (1.6TB)** | 97% | Cache: $160K, DB: $8K, Latency: $4.5K | **$172.5K** (expensive for 4% gain) |

**Optimal choice: 20% coverage (800GB cache)**

- **20% coverage is now the clear winner** at $108.5K total cost (vs $109.5K for 10%)
- Provides 93% hit rate vs 83% for 10% coverage (10% better hit rate for just $1K/month more)
- Best total cost optimization: Lower cache + DB + latency costs combined

**Trade-off accepted:** We choose **20% coverage (800GB distributed across cluster)** because:
1. **Lowest total cost**: $108.5K/month (optimal point on cost curve)
2. 93% hit rate meets 80%+ requirement comfortably with safety margin
3. Latency cost minimized ($10.5K vs $25.5K for 10% coverage)
4. Worth paying $40K extra cache cost vs 10% to save $15K in latency + $26K in DB costs

**TTL Optimization: Freshness vs Hit Rate Tradeoff**

Time-to-live (TTL) settings create a second optimization problem:
- **Short TTL** (10s): Fresh data, but more cache misses after expiration
- **Long TTL** (300s): High hit rate, but stale data

**Staleness Cost Model:**

$$C_{staleness} = P(\text{stale}) \times C_{error}$$

For user profiles:
- 1% of profiles update per hour
- Average TTL/2 staleness window
- Cost of stale ad: ~$0.50 (poor targeting)

**Example: 30s TTL**
- Average staleness: 15s
- Probability stale: 0.01 × (15/3600) = 0.0042%
- Cost: 2.6B queries × 0.000042 × $0.50 = **$54.6K/month**

**Example: 300s TTL**
- Average staleness: 150s
- Probability stale: 0.01 × (150/3600) = 0.042%
- Cost: 2.6B queries × 0.00042 × $0.50 = **$546K/month**

**Optimal TTL: 30-60 seconds**

Balances freshness cost (<$100K/month) with reasonable hit rate.

**Multi-Tier Cost-Benefit Analysis**

**Question:** Does adding L1 in-process cache (Caffeine) pay off?

**L1 Cache Costs:**
- Memory: 100MB per server × 100 servers = 10GB (negligible, in-heap)
- CPU: ~2% overhead for cache management
- Complexity: Additional code, monitoring

**L1 Cache Benefits:**

From our architecture:
- L1 hit rate: 60% of all requests
- Latency improvement: 5ms (Redis) → 0.001ms (in-process) = **4.999ms saved**
- Revenue impact: 60% of 2.6B queries save 4.999ms ≈ 3ms average improvement

$$\text{Revenue gain} = 1.56B \times \frac{3ms}{100ms} \times 0.01 \times \\$10M = \\$4,680/month$$

**Not a clear win** - benefits are marginal compared to operational complexity.

**However:** L1 cache provides **resilience** during Redis outages:
- Without L1: Redis down → 100% cache miss → database overload
- With L1: Redis down → 60% hit rate → database load manageable

**Decision:** Keep L1 for **resilience**, not economics.

**Cost Summary Table:**

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| L1 Cache (Caffeine) | ~$0 | In-process, negligible memory |
| L2 Cache (Redis/Valkey) | $80K | 800GB, 93% hit rate (based on $10/GB validated pricing) |
| L3 Database infrastructure (CockroachDB) | $30-40K | 60-80 nodes baseline |
| Database query cost (cache misses) | $18K | 7% miss rate × 2.6B queries × $0.0001 |
| Cache miss latency cost | $10.5K | Revenue loss from slow queries |
| **Total caching infrastructure** | **$138.5-148.5K/month** | Optimized for 93% hit rate at 20% coverage |

**Alternative (no caching):**
- Database only: $120-150K/month (more nodes for load)
- Database query cost: $260K/month (2.6B × $0.0001, no cache)
- Latency cost: $150K/month (all queries at 15ms)
- **Total: $530-560K/month** + poor user experience

**Savings from caching: $380-420K/month** (73-75% cost reduction)

**Note:** Corrected pricing based on AWS ElastiCache r7g.xlarge: $0.437/hour = $12.12/GB/month for Redis OSS, $9.69/GB/month for Valkey (source: instances.vantage.sh, October 2025). Using conservative $10/GB estimate.

### Redis Cluster: Consistent Hashing and Sharding

**Cluster Configuration:**

- 1000 Redis nodes
- 16,384 hash slots (Redis default)
- Consistent hashing with virtual nodes

**Hash Slot Assignment:**

For key \\(k\\), compute hash:
$$\text{slot}(k) = \text{CRC16}(k) \mod 16384$$

Slot-to-node mapping maintained in cluster state.

**Virtual Nodes:**

Each physical node handles \\(\frac{16384}{1000} \approx 16\\) hash slots.

**Load Distribution:**

With uniform hash function, load variance:
$$\text{Var}[\text{load}] = \frac{\mu}{n \times v}$$

where:
- \\(\mu\\) = average load per node
- \\(n\\) = number of physical nodes
- \\(v\\) = number of virtual nodes per physical node

**Example:** 1000 QPS across 1000 nodes with 16 virtual nodes each → **standard deviation ≈ 25% of mean load**.

### Hot Partition Problem and Mitigation

**Problem Definition:**

A "celebrity user" generates 100x normal traffic:
- Normal user: 10 requests/second
- Celebrity user: 1,000 requests/second

Single Redis node cannot handle spike → becomes bottleneck.

**Detection: Count-Min Sketch**

Count-Min Sketch is a probabilistic data structure that tracks key frequencies in constant memory (~5KB for millions of keys) with O(1) operations. It provides conservative frequency estimates (never under-counts, may over-estimate), making it ideal for detecting hot keys without storing exact counters. Trade-off: tunable accuracy vs memory footprint.

**Dynamic Hot Key Replication:**

When Count-Min Sketch detects key with frequency > threshold (e.g., 100 req/sec):

1. **Replicate key** to \\(R\\) Redis nodes (e.g., \\(R = 3\\))
2. **Update routing table**: advertise replicas to all servers
3. **Client-side load balancing**: randomly select replica for reads

**Mathematical Analysis:**

Let \\(\lambda\\) be the request rate for a hot key, \\(R\\) be the number of replicas.

Per-replica load:
$$\lambda_{replica} = \frac{\lambda}{R}$$

**Example:** 1000 req/sec with replication factor 3 → **~333 req/sec per replica** (within single-node capacity).

### Workload Isolation: Separating Batch from Serving Traffic

One critical lesson from large-scale systems: **never let batch workloads interfere with serving traffic**.

**The Problem:**

Hourly batch jobs updating user profiles in CockroachDB (millions of writes/hour) can interfere with serving layer reads for ad personalization. Without isolation, batch writes can:
- Saturate disk I/O (batch writes compete with serving reads)
- Fill up queues and increase latency (p99 latency spikes from 20ms to 200ms)
- Trigger compactions that block reads

**Solution: Read/Write Replica Separation**

Pin batch workloads to dedicated replicas:

```
User Profile Table (RF=3):
- Replica A (US-East): Serving traffic only
- Replica B (US-West): Serving traffic only
- Replica C (EU-Central): Batch writes pinned here
```

**Implementation Pattern:**

Use CockroachDB's geo-partitioning with follower reads - partition user profiles by region and pin batch writes to a dedicated region. Configure replication with 3× factor across regions (us-east, us-west, eu-central), then direct batch workloads to eu-central nodes only using range-specific leases.

Serving traffic uses `FOLLOWER_READ_TIMESTAMP()` for local reads (eventual consistency with <1s staleness acceptable for user profiles), while batch writes use standard SERIALIZABLE writes to eu-central ranges. This separates I/O paths - batch writes don't contend with serving reads.

**Why this works:**

CockroachDB's Raft consensus ensures consistent replication, but follower reads allow serving traffic to read from local replicas without hitting the leaseholder (which may be absorbing batch writes). Batch write load concentrates on eu-central ranges, while serving traffic reads locally from us-east/us-west followers.

**Cost of isolation:**

Similar resource allocation - dedicated ranges for batch writes occupy ~33% of cluster capacity. For a 60-node cluster: 40 nodes serve traffic, 20 nodes handle batch writes. Trade-off: Strong consistency for financial data while isolating operational workloads.

**Monitoring the gap:**

Track replication lag between batch and serving replicas:

$$\text{Replication lag} = Timestamp_{\text{serving replica}} - Timestamp_{\text{batch replica}}$$

If lag exceeds 5 minutes, you might have a problem. Scale the batch replica or throttle batch writes.

### Cache Invalidation Strategies

**Problem:** When user data updates (e.g., profile change), how to invalidate stale cache?

**Strategy 1: TTL-Based (Passive)**

Set time-to-live on cache entries:
$$\text{Staleness} \leq \text{TTL}$$

**Pros:**
- Simple implementation
- No coordination required

**Cons:**
- Guaranteed staleness up to TTL
- Unnecessary cache misses after TTL

**Strategy 2: Active Invalidation (Event-Driven)**

On data update:
1. Publish invalidation event to Kafka topic
2. All cache servers subscribe and evict key from L1/L2

**Latency:**

Kafka publish latency: ~5ms
Consumer processing: ~10ms
Total invalidation propagation: **~15ms**

**Pros:**
- Low staleness (< 100ms)
- No unnecessary evictions

**Cons:**
- Requires event streaming infrastructure
- Network overhead for invalidation messages

**Strategy 3: Versioned Caching**

Include version in cache key:
```cache_key = user_id + ":" + version```

On update:
1. Increment version in metadata store
2. New requests fetch new version
3. Old version expires naturally via TTL

**Pros:**
- No explicit invalidation needed
- Multiple versions coexist temporarily

**Cons:**
- Metadata store becomes critical path
- Higher cache memory usage (duplicate versions)

**Hybrid Approach (Recommended):**

> **Architectural Drivers: Latency vs Financial Accuracy** - We use eventual consistency (30s TTL) for user preferences to meet latency targets, but strong consistency (active invalidation) for GDPR opt-outs where legal compliance is non-negotiable.

- **Normal updates:** TTL = 30s (passive invalidation)
- **Critical updates** (e.g., GDPR opt-out): Active invalidation via Kafka
- **Version metadata** for tracking update history

---

## Part 6: Auction Mechanism Design

### Generalized Second-Price (GSP) Auction

The standard auction mechanism for ads platforms is the Generalized Second-Price (GSP) auction, a variant of the Vickrey-Clarke-Groves (VCG) mechanism.

**Auction Setup:**

- \\(N\\) advertisers submit bids \\(b_1, b_2, \ldots, b_N\\)
- Each ad has predicted CTR: \\(\text{CTR}_1, \text{CTR}_2, \ldots, \text{CTR}_N\\)
- Single ad slot to allocate

**Effective Bid (eCPM - effective Cost Per Mille):**

Advertisers use different pricing models - some pay per impression (CPM), others per click (CPC), others per conversion (CPA). To compare apples-to-apples, we convert all bids to **eCPM**: expected revenue per 1000 impressions.

For a CPC bid (cost-per-click), the platform only earns revenue when users click. If an advertiser bids $4.00 per click, but their ad has 15% CTR (150 clicks per 1000 impressions):

$$\text{eCPM}_i = b_i \times \text{CTR}_i \times 1000 = \\$4.00 \times 0.15 \times 1000 = \\$600$$

This normalizes bids across pricing models: **eCPM represents expected revenue per 1000 impressions**, accounting for how likely users are to click.

**Why this matters**: A $6.00 CPC bid with 5% CTR (eCPM = $300) earns less than a $4.00 CPC bid with 15% CTR (eCPM = $600). The platform maximizes revenue by selecting the highest eCPM, not highest raw bid.

**Winner Selection:**

$$w = \arg\max_{i \in [1,N]} \text{eCPM}_i$$

**Price Determination (Second-Price):**

The winner pays the minimum bid needed to beat the second-highest bidder:

$$p_w = \frac{\text{eCPM}_{2nd}}{\text{CTR}_w \times 1000} + \epsilon$$

where \\(\epsilon\\) is a small increment (e.g., $0.01).

**Example:**

<style>
#tbl_5 + table th:first-of-type  { width: 15%; }
#tbl_5 + table th:nth-of-type(2) { width: 15%; }
#tbl_5 + table th:nth-of-type(3) { width: 15%; }
#tbl_5 + table th:nth-of-type(4) { width: 45%; }
#tbl_5 + table th:nth-of-type(5) { width: 10%; }
</style>
<div id="tbl_5"></div>

| Advertiser | Bid    | CTR  | eCPM           | Rank |
|------------|--------|------|----------------|------|
| A          | $5.00  | 0.10 | 5.00 × 0.10 × 1000 = $500 | 2    |
| B          | $4.00  | 0.15 | 4.00 × 0.15 × 1000 = $600 | 1    |
| C          | $6.00  | 0.05 | 6.00 × 0.05 × 1000 = $300 | 3    |

**Winner:** Advertiser B (highest eCPM = $600)

**Price paid by B:**
$$p_B = \frac{500}{0.15 \times 1000} = \frac{500}{150} = \\$3.33$$

Advertiser B bid $4.00 but only pays $3.33 (just enough to beat A).

### Game-Theoretic Properties

**Theorem 1: GSP is not truthful**

**Proof by counterexample:**

Consider 2 advertisers, 1 slot:
- Advertiser 1: true value \\(v_1 = 10\\), CTR = 0.1
- Advertiser 2: true value \\(v_2 = 8\\), CTR = 0.2

**Scenario A: Both bid truthfully**
- \\(\text{eCPM}_1 = 10 \times 0.1 = 1.0\\)
- \\(\text{eCPM}_2 = 8 \times 0.2 = 1.6\\)
- Winner: Advertiser 2
- Price: \\(\frac{1.0}{0.2} = 5\\)
- Profit for Advertiser 2: \\(8 - 5 = 3\\)

**Scenario B: Advertiser 2 bids strategically**

Advertiser 2 realizes they can bid lower and still win. Suppose they bid \\(b_2 = 6\\):
- \\(\text{eCPM}_2 = 6 \times 0.2 = 1.2\\)
- Winner: Still Advertiser 2 (1.2 > 1.0)
- Price: \\(\frac{1.0}{0.2} = 5\\)
- Profit: \\(8 - 5 = 3\\) (unchanged)

But if Advertiser 1 raises bid to \\(b_1 = 12\\):
- \\(\text{eCPM}_1 = 12 \times 0.1 = 1.2\\)
- Tie! (Typically broken by random selection or bid amount)

**Conclusion**: We've shown by counterexample that advertisers can deviate from truthful bidding and maintain the same outcome. Therefore, GSP is **not incentive-compatible** (not truthful) - advertisers have incentive to strategically shade their bids below true value. ∎

**Theorem 2: GSP Revenue ≥ VCG Revenue (in equilibrium)**

This is an empirical observation from auction theory, not always provable, but holds in most practical scenarios with rational bidders.

**Why use GSP if it's not truthful?**

1. **Higher revenue** than VCG in practice
2. **Simpler to explain** to advertisers
3. **Industry standard** (Google Ads uses GSP variant)
4. **Nash equilibrium exists** where rational bidders converge

### VCG (Vickrey-Clarke-Groves) Auction

**Alternative mechanism:** VCG is truthful but more complex.

**Pricing Formula:**

Winner \\(w\\) pays their **externality** (harm caused to others):

$$p_{w} = \sum_{j \neq w} \left( u_{j}(\text{allocation without } w) - u_j(\text{allocation with } w) \right)$$

where \\(u_j(\cdot)\\) is advertiser \\(j\\)'s utility.

**For single-slot auction:**

$$p_{w} = \max_{i \neq w} (\text{eCPM}) - \max_{i \neq w} (0) = \text{eCPM}_{2nd}$$

Wait, this is the same as GSP for single slot! The difference emerges with **multiple ad slots**.

**Multi-Slot VCG Example:**

3 slots with click probabilities: \\(\alpha_1 = 0.3\\), \\(\alpha_2 = 0.2\\), \\(\alpha_3 = 0.1\\)

4 advertisers with bids and CTRs:

| Advertiser | Bid  | CTR  | Value × CTR |
|------------|------|------|-------------|
| A          | $10  | 0.20 | 2.0         |
| B          | $8   | 0.25 | 2.0         |
| C          | $12  | 0.10 | 1.2         |
| D          | $6   | 0.15 | 0.9         |

**Allocation:**
- Slot 1 → A (value 2.0)
- Slot 2 → B (value 2.0)
- Slot 3 → C (value 1.2)

**VCG Pricing for A:**

Social welfare with A: \\(2.0 \times 0.3 + 2.0 \times 0.2 + 1.2 \times 0.1 = 1.12\\)

Social welfare without A (reallocate slots):
- Slot 1 → B: \\(2.0 \times 0.3 = 0.6\\)
- Slot 2 → C: \\(1.2 \times 0.2 = 0.24\\)
- Slot 3 → D: \\(0.9 \times 0.1 = 0.09\\)
- Total: 0.93

A's externality: \\(0.93 - (2.0 \times 0.2 + 1.2 \times 0.1) = 0.93 - 0.52 = 0.41\\)

A pays: \\(\frac{0.41}{0.20 \times 0.3} = \$6.83\\)

This differs from GSP pricing! VCG charges based on **total harm to society**, not just beating second-highest bid.

### Computational Complexity

**GSP Auction Complexity:**

- Sort advertisers by eCPM: \\(O(N \log N)\\)
- Select winner and compute price: \\(O(1)\\)
- **Total: \\(O(N \log N)\\)**

**VCG Auction Complexity:**

- Compute optimal allocation: \\(O(N \log N)\\)
- Compute counterfactual allocations (\\(N\\) times): \\(O(N^2 \log N)\\)
- **Total: \\(O(N^2 \log N)\\)**

For \\(N = 50\\) DSPs:
- GSP: ~282 operations
- VCG: ~14,100 operations

**Latency Impact:**

At 5ms budget for auction logic:
- GSP: easily achievable
- VCG: may require optimization or approximation

**Recommendation:** Use GSP for real-time auctions, reserve VCG for offline allocation optimization.

### Reserve Prices and Floor Prices

**The Problem:**

Without a reserve price (minimum bid), your auction might sell ad slots for pennies when competition is low. Consider a scenario where only one advertiser bids $0.10 for a premium slot - you'd rather show a house ad (promoting your own content) than sell it that cheaply.

**What is a Reserve Price?**

A **reserve price** \\(r\\) is the minimum eCPM required to participate in the auction. If no bids exceed \\(r\\), the impression is not sold (or filled with a house ad).

**The Revenue Trade-off:**

Setting the reserve price is a balancing act:

<style>
#tbl_6 + table th:first-of-type  { width: 15%; }
#tbl_6 + table th:nth-of-type(2) { width: 40%; }
#tbl_6 + table th:nth-of-type(3) { width: 45%; }
</style>
<div id="tbl_6"></div>

| Reserve Price | What Happens | Example |
|---------------|--------------|---------|
| **Too low**<br/>($0.50) | Sell almost all impressions, but accept low-value bids | 95% fill rate × $0.80 avg eCPM = $0.76 revenue per impression |
| **Optimal**<br/>($2.00) | Balance between fill rate and price | 70% fill rate × $3.50 avg eCPM = $2.45 revenue per impression |
| **Too high**<br/>($10.00) | Only premium bids qualify, but most impressions go unsold | 20% fill rate × $12.00 avg eCPM = $2.40 revenue per impression |

**Mathematical Formulation:**

Expected revenue per impression with reserve price \\(r\\):

$$\text{Revenue}(r) = r \times P(\text{bid} \geq r)$$

where \\(P(\text{bid} \geq r)\\) is the probability that at least one bid exceeds the reserve.

**Optimal Reserve Price:**

Find \\(r^*\\) that maximizes expected revenue. If bids follow a known distribution with CDF \\(F(v)\\):

$$r^* = \arg\max_r \left[ r \times (1 - F(r)) \right]$$

**Interpretation:**
- \\(r\\) = revenue when impression sells
- \\((1 - F(r))\\) = probability impression sells (fraction of bids above \\(r\\))

**Concrete Example:**

Suppose historical bids range uniformly from $0 to $10. What's the optimal reserve?

For uniform distribution: \\(P(\text{bid} \geq r) = 1 - \frac{r}{10}\\)

Expected revenue:
$$\text{Revenue}(r) = r \times \left(1 - \frac{r}{10}\right) = r - \frac{r^2}{10}$$

Maximize by taking derivative:
$$\frac{d}{dr}\left(r - \frac{r^2}{10}\right) = 1 - \frac{2r}{10} = 0$$

$$r^* = \frac{10}{2} = \\$5.00$$

**Result:** Optimal reserve is **half the maximum bid value** (when bids are uniformly distributed).

**Practical Approach:**

Rather than assuming a distribution, use empirical data:
- Analyze historical bid distribution from past auctions
- Set reserve at 40th-60th percentile of historical bids
- A/B test different reserve prices and measure actual revenue impact
- Adjust dynamically based on inventory quality (premium placements → higher reserve)

---

## Part 7: Advanced Topics

### Distributed Clock Synchronization and Time Consistency

> **Architectural Driver: Financial Accuracy** - Clock skew across regions can cause budget double-allocation or billing disputes. HLC + bounded allocation windows guarantee deterministic ordering for financial transactions.

**Problem:** In a multi-region, financially critical system, accurate timestamps are essential for budget tracking, billing reconciliation, and event ordering. Clock drift between servers can cause severe issues:

- **Billing disputes**: Server A (clock +2s) and Server B (clock -2s) disagree on which impressions happened within a campaign's flight window
- **Budget race conditions**: Two regions with skewed clocks both think they have budget remaining, causing overspend
- **Event causality violations**: User clicks ad before impression recorded (due to clock skew), breaking analytics pipelines

**Clock Drift Reality:**

Without synchronization, server clocks drift at **~1-50ms per day** depending on hardware quality. In a distributed system with 1000+ servers across 4 regions, this compounds quickly:

$$\text{Max Clock Skew} = \text{Drift Rate} \times \text{Time Since Sync} \times \text{Number of Servers}$$

After just 1 day without sync: \\(50ms \times 1 \times 1000 = 50,000ms = 50s\\) divergence across the fleet.

**Solution Spectrum: NTP → PTP → Global Clocks**

| Technology | Accuracy | Cost | Use Case |
|------------|----------|------|----------|
| **NTP**<br/>Network Time Protocol | ±50ms (public),<br/>±10ms (local) | Free | General-purpose time sync |
| **PTP**<br/>Precision Time Protocol | ±100μs | Medium (hardware switches) | High-frequency trading, telecom |
| **GPS-based Clocks** | ±1μs | High<br/>(GPS receivers per rack) | Critical infrastructure |
| **Google Spanner<br/>TrueTime** | ±7ms<br/>(bounded uncertainty) | Very high (proprietary) | Global strong consistency |
| **AWS Time Sync Service** | ±1ms | Free (on AWS) | Cloud deployments |

**For our ads platform: Multi-tier approach**

**Tier 1: Event Timestamping (NTP + AWS Time Sync)**

For most ad serving operations (impressions, clicks), **NTP or AWS Time Sync is sufficient**:

- **Why it works**: Ad delivery has inherent delays (network latency ~20-100ms dwarfs clock skew)
- **Accuracy**: ±1-10ms across regions is acceptable for event ordering
- **Configuration**: Sync every 60 seconds against AWS Time Sync or local NTP pool; alert if clock offset >100ms

**Tier 2: Financial Reconciliation (Bounded Uncertainty)**

For billing and budget operations, we need **guaranteed ordering despite clock uncertainty**. Since we're using **CockroachDB for financial data** (budget tracking, billing reconciliation), we get **Hybrid Logical Clocks (HLC) built-in** - no custom implementation needed.

**CockroachDB's Built-in HLC:**

CockroachDB automatically assigns HLC timestamps to every transaction, eliminating the need for custom clock synchronization logic. Each transaction timestamp is a tuple: \\((t_{physical}, c_{logical}, id_{node})\\)

**How it works (for understanding, not implementation):**

**Timestamp Generation Algorithm:**

$$
HLC(t) =
\begin{cases}
(t_{physical}, 0, id) & \text{if } t_{physical} > t_{last} \\\\
(t_{last}, c_{last} + 1, id) & \text{if } t_{physical} \leq t_{last}
\end{cases}
$$

**Total Ordering Relation:**

$$
HLC_1 < HLC_2 \iff
\begin{cases}
t_{physical,1} < t_{physical,2} & \text{or} \\\\
t_{physical,1} = t_{physical,2} \land c_{logical,1} < c_{logical,2} & \text{or} \\\\
t_{physical,1} = t_{physical,2} \land c_{logical,1} = c_{logical,2} \land id_1 < id_2
\end{cases}
$$

**Why HLC solves clock skew for financial data:**

- **Causality preserved**: If Event A → Event B (happened-before), then \\(HLC(A) < HLC(B)\\) guaranteed
- **No clock synchronization required**: Logical counters handle same-millisecond events without physical clock coordination
- **Total ordering**: Even concurrent events get deterministic ordering via node_id tie-breaker

**Example: Budget spend reconciliation**

Two ad servers in different regions spend advertiser budget simultaneously:

| Server | Physical Clock | HLC Timestamp | Allocation |
|--------|----------------|---------------|------------|
| US-East | 10:00:00.100 | (100ms, 0, us-east-1) | $50 |
| EU-West | 10:00:00.095 (5ms drift) | (95ms, 0, eu-west-1) | $50 |

Despite 5ms clock skew:
- HLC ordering: \\((95, 0, \text{eu-west}) < (100, 0, \text{us-east})\\)
- Reconciliation processes EU allocation first (deterministic ordering)
- Total spend: exactly $100 (no double-counting, no missing transactions)

**Tier 3: Critical Transactions (CockroachDB-Coordinated Time)**

For budget allocations and billing audit logs, **CockroachDB's built-in HLC provides single source of truth**: all budget operations write to CockroachDB with automatic HLC timestamps, providing globally consistent ordering across regions without custom implementation.

**Consistency guarantee (built into CockroachDB):**

$$\forall \text{ transactions } T_1, T_2: \text{ if } commit(T_1) < commit(T_2) \text{ then } HLC(T_1) < HLC(T_2)$$

CockroachDB's distributed consensus (Raft) ensures this ordering automatically, preventing race conditions where multiple regions over-allocate simultaneously. No custom synchronization code needed.

**Handling Multi-Region Budget Consistency:**

The hardest problem: Budget spend across regions must be strongly consistent to prevent overspend. Each region receives a pre-allocation (e.g., US-East: $3K, EU-West: $4K from $10K daily budget) tracked via Redis DECRBY for fast local spend. Regions spend locally, then periodically sync to CockroachDB with automatic HLC timestamps for global reconciliation. CockroachDB's ACID transactions verify allocated == spent + returned, with HLC ordering preventing duplicates. Alert if discrepancy >$50 (0.5%).

**Clock Skew Impact on Budget:**

Worst-case scenario: Region A (clock +10s) and Region B (clock -10s) both think it's 11:59:50pm when making final allocations for a daily budget. Both might allocate thinking they're within the day's window.

**Mitigation Strategy:**

$$\text{Safe Allocation Window} = \text{Day Boundary} \pm \text{Max Clock Skew}$$

With max clock skew \\(\delta = 100ms\\), create guard interval:

$$\text{Allocation forbidden for } t \in [23:59:59.900, 00:00:00.100]$$

This 200ms "dead zone" sacrifices potential impressions to guarantee budget correctness - acceptable trade-off given clock uncertainty.

**Decision: AWS Time Sync + CockroachDB Built-in HLC**

Google Spanner's TrueTime (±7ms via atomic clocks and GPS) isn't worth the complexity for ads: the gap from NTP (±10ms) is negligible given 20-100ms network variability already present.

**Our architecture:**
- **Event timestamping:** AWS Time Sync (±1ms, free)
- **Financial transactions:** CockroachDB built-in HLC (automatic, no implementation needed)
- **Trade-off:** Accept 200ms budget allocation dead zone at day boundaries

**Major advantage of CockroachDB:** Eliminates ~150 lines of custom HLC implementation code, reduces bugs, and provides battle-tested clock synchronization without operational burden.

**Monitoring Clock Health:**

Monitor clock offset (P1 alert if >100ms), HLC logical counter growth rate (P2 if >1000/sec sustained), budget reconciliation discrepancy (P1 if >0.5% of daily budget), and cross-region timestamp ordering violations (P2 if >0 events/hour). Alert when \\(|t_{server} - t_{reference}| > 100ms\\) or \\(\frac{d(c_{logical})}{dt} > 1000\\) increments/sec.

**Why this matters for ads:**

A real-world incident example:
- Regional clock skew caused budget to "reset" at midnight in one region 10 seconds before others
- That region over-allocated $5,000 in the 10-second window
- Advertiser demanded refund for over-delivery
- Cost: $5,000 + engineering time to debug + customer trust

With HLC + bounded allocation windows, this can't happen - worst case is 200ms of missed impressions at day boundary, not $5K overspend.

### Global Event Ordering for Financial Ledgers: The External Consistency Challenge

> **Architectural Driver: Financial Accuracy** - Financial audit trails require globally consistent event ordering across regions. CockroachDB's HLC-timestamped billing ledger provides near-external consistency, ensuring that events are ordered chronologically for regulatory compliance, while PostgreSQL serves only as cold archive.

**The Critical Problem: Why PostgreSQL Alone Is Insufficient**

The budget pre-allocation pattern (Redis atomic counters) solves **fast local enforcement**, but creates a second, harder problem: **global event ordering for the billing ledger**.

Consider this scenario:
- **T1 = 10:00:00.000** (wall clock): US-East server allocates $100 from campaign budget
- **T2 = 10:00:00.050** (wall clock): EU-West server spends $100, exhausting budget
- **T3 = 10:00:00.100** (wall clock): US-East server tries to use its $100 allocation

**Question:** Did T1 happen before T2? This determines if the US-East spend is valid or an over-delivery.

With separate PostgreSQL instances (or even a replicated PostgreSQL cluster):
- US-East PostgreSQL might timestamp T1 at `10:00:00.002` (local clock +2ms)
- EU-West PostgreSQL might timestamp T2 at `09:59:59.998` (local clock -2ms)
- **Audit log shows T2 before T1** - wrong ordering!

**Why This Violates Financial Accuracy:**

| Requirement | PostgreSQL Multi-Region | CockroachDB HLC |
|-------------|------------------------|-----------------|
| **Global event ordering** | **No** - each region uses local wall clock | **Yes** - HLC provides happens-before ordering |
| **External consistency** | **No** - can't guarantee real-time order | **Partial** - Near-external consistency (bounded uncertainty) |
| **Audit trail correctness** | **No** - Events may appear out-of-order | **Yes** - Causally consistent ordering |
| **Regulatory compliance** | **No** - Chronological ordering not guaranteed | **Yes** - SOX/MiFID compliant |
| **Dispute resolution** | **No** - "Did budget exhaustion happen before or after this impression?" = ambiguous | **Yes** - Clear happens-before relationship |

**External Consistency Requirement:**

For a financial ledger, we need **external consistency** (also called **linearizability** or **strict serializability**):

$$\forall T_1, T_2: \text{if } T_1 \text{ completes before } T_2 \text{ starts (in real-world time)} \implies timestamp(T_1) < timestamp(T_2)$$

This is the **strongest consistency guarantee** and is mandatory for:
- **Regulatory compliance**: SOX (Sarbanes-Oxley) and MiFID require chronologically accurate financial records kept for 5-7 years
- **Legal disputes**: "Did impression X happen before budget exhaustion?" must have unambiguous answer
- **Audit trails**: Regulators must be able to reconstruct event sequence accurately
- **Billing reconciliation**: Total spend = sum of all transactions in temporal order

**Why CockroachDB HLC Provides (Near) External Consistency:**

CockroachDB uses Hybrid Logical Clocks to provide **happens-before ordering** across regions:

$$HLC = (pt, c)$$

where:
- \\(pt\\) = physical time (close to wall clock)
- \\(c\\) = logical counter (captures causality when \\(pt\\) is equal)

**Guarantee (built into CockroachDB):**

$$\text{If transaction } T_1 \text{ happens-before } T_2 \text{ (causally)} \implies HLC(T_1) < HLC(T_2)$$

**External Consistency with Bounded Uncertainty:**

While CockroachDB with standard NTP doesn't provide **true external consistency** like Google Spanner's TrueTime (which uses atomic clocks), it provides **near-external consistency within the clock uncertainty window**:

$$\text{Uncertainty Window} = \pm \epsilon \text{ where } \epsilon \approx 100\text{ms (NTP)}$$

For ad tech financial ledgers, this is acceptable because:
1. **Network latency dominates**: Inter-region network latency (50-150ms) already exceeds clock uncertainty (±100ms)
2. **Causally related events** (same campaign, same user session) are correctly ordered via HLC
3. **Independent events** (different campaigns, different regions) within the 100ms window may have ambiguous ordering, but this doesn't affect financial correctness for our use case

**Architecture Decision: Three-Tier Financial Data Storage**

{% mermaid() %}
graph LR
    ADV[Ad Server<br/>1M QPS]
    REDIS[(Tier 1: Redis<br/>Atomic DECRBY<br/><1ms)]
    CRDB[(Tier 2: CockroachDB<br/>HLC Timestamps<br/>10-15ms<br/>90-day hot)]
    POSTGRES[(Tier 3: PostgreSQL/S3<br/>Cold Archive<br/>7-year retention)]

    ADV -->|Budget check| REDIS
    REDIS -->|Every 5 min<br/>HLC timestamped| CRDB
    CRDB -->|Nightly archive| POSTGRES

    classDef fast fill:#e3f2fd,stroke:#1976d2
    classDef ledger fill:#fff3e0,stroke:#f57c00
    classDef archive fill:#f3e5f5,stroke:#7b1fa2

    class REDIS fast
    class CRDB ledger
    class POSTGRES archive
{% end %}

**Why This Three-Tier Architecture:**

| Tier | Technology | Purpose | Consistency Requirement |
|------|------------|---------|------------------------|
| **Tier 1: Fast Path** | Redis | Real-time budget enforcement | Local atomic operations (DECRBY) |
| **Tier 2: Billing Ledger** | CockroachDB | Active financial transactions with global ordering | Serializable + HLC ordering (near-external consistency) |
| **Tier 3: Cold Archive** | PostgreSQL + S3 | 7-year regulatory retention | None (immutable archive) |

**Workflow:**

1. **Real-time spend** (1M QPS): Ad servers DECRBY from Redis pre-allocated budgets (<1ms)
2. **Periodic reconciliation** (every 5 min): Flush Redis deltas to CockroachDB with automatic HLC timestamps
3. **Nightly archival** (off-peak): Export 90-day-old CockroachDB records to PostgreSQL/S3 Glacier for 7-year retention

**CockroachDB Transaction Example:**

```sql
-- CockroachDB automatically assigns HLC timestamp to this transaction
BEGIN;

INSERT INTO billing_ledger (
    campaign_id,
    impression_id,
    spend_amount,
    region
    -- hlc_timestamp automatically added by CockroachDB
) VALUES (
    'camp_12345',
    'imp_98765',
    0.50,
    'us-east-1'
);

UPDATE campaign_budget
SET spent = spent + 0.50
WHERE campaign_id = 'camp_12345';

COMMIT;
-- CockroachDB's Raft consensus ensures this transaction gets
-- globally ordered HLC timestamp across all regions
```

**External Consistency Guarantee in Practice:**

When two independent regions write to CockroachDB:
- **US-East writes at T1 (real-world time)**
- **EU-West writes at T2 (real-world time)**, where T2 starts 50ms after T1 completes

CockroachDB ensures \\(HLC(T1) < HLC(T2)\\) **even if** EU-West's local clock is 10ms ahead, because:
1. HLC's physical component tracks maximum observed timestamp
2. Raft consensus propagates timestamp information across regions
3. Logical counter breaks ties when physical timestamps are close

**The ±100ms Uncertainty:**

For truly independent transactions (no causal relationship) occurring within 100ms window across regions, CockroachDB makes a **best-effort ordering** based on HLC. This is acceptable for ad tech because:

- **Same campaign budget operations**: Causally related → HLC guarantees correct order
- **Different campaigns**: Independent → relative ordering within 100ms doesn't affect financial correctness
- **Audit trail requirement**: Regulators need "reasonable" chronological ordering, not nanosecond precision

**Trade-off Accepted:**

**Gain**: Near-external consistency for financial ledger, built-in HLC (no custom code), multi-region ACID transactions
**Cost**: ±100ms uncertainty for independent cross-region events (vs Spanner's ±7ms with TrueTime)
**Decision**: Acceptable for ad tech - network latency (50-150ms) already dominates, and causal events are correctly ordered

**Why Not PostgreSQL for Billing Ledger:**

| Challenge | PostgreSQL | CockroachDB |
|-----------|-----------|-------------|
| Multi-region write consistency | **No** - Manual sharding, complex reconciliation | **Yes** - Built-in multi-region ACID |
| Global timestamp ordering | **No** - Each region uses local clock | **Yes** - HLC provides happens-before ordering |
| Schema evolution | **No** - Requires downtime for ALTER TABLE | **Yes** - Online schema changes |
| Horizontal scaling | **Limited** - Vertical scaling limit ~50TB | **Yes** - Horizontal scaling to petabytes |
| Operational complexity | **High** - Manual sharding, replication, failover | **Low** - Automatic, Raft-based |

**Financial Audit Trail Compliance:**

With CockroachDB HLC-timestamped billing ledger:

- **SOX (Sarbanes-Oxley) Compliance**: Chronologically ordered financial records
- **MiFID II (Markets in Financial Instruments Directive) Compliance**: Transaction timestamps with <1s accuracy (we achieve <100ms)
- **FTC (Federal Trade Commission) Requirements**: Accurate advertiser billing within acceptable tolerance
- **GDPR (General Data Protection Regulation)**: Right to erasure (can delete specific user records without breaking ledger consistency)

**Cost Analysis:**

| Component | Technology | Monthly Cost (at 8B requests/day) |
|-----------|-----------|-----------------------------------|
| Fast path (pre-allocation) | Redis Cluster (20 nodes, r6i.2xlarge) | $8K/month |
| Billing ledger (90-day hot) | CockroachDB (60-80 nodes, c6id.2xlarge @ ~$500/node) | $30-40K/month |
| Cold archive (7-year retention) | PostgreSQL + S3 Glacier | $2K/month |
| **Total** | | **$40-50K/month** |

**Compared to Single PostgreSQL:**
- PostgreSQL (sharded, 40 nodes): $20K/month infrastructure
- Custom HLC implementation: $250-400K engineering cost (6 engineer-months fully-loaded) + ongoing maintenance burden
- Testing and validation: Additional 2-3 months
- **Total custom solution: $20K/month + $250-400K upfront + maintenance risk**
- **Decision**: CockroachDB's built-in HLC and multi-region ACID eliminates $250-400K engineering cost plus ongoing maintenance burden. The $10-20K/month premium pays for itself immediately.

### Budget Pacing: Distributed Spend Control

> **Architectural Driver: Financial Accuracy** - Pre-allocation pattern with Redis atomic counters ensures budget consistency across regions. Max over-delivery bounded to 1% of daily budget (acceptable legal risk) while avoiding centralized bottleneck.

**Problem:** Advertisers set daily budgets (e.g., $10,000/day). In a distributed system serving 1M QPS, how do we prevent over-delivery without centralizing every spend decision?

**Challenge:**

Centralized approach (single database tracks spend):
- Latency: ~10ms per spend check
- Throughput bottleneck: ~100K QPS max
- Single point of failure

**Solution: Pre-Allocation with Periodic Reconciliation**

{% mermaid() %}
graph TD
    ADV[Advertiser X<br/>Daily Budget: $10,000]

    ADV --> BUDGET[Budget Controller]

    BUDGET --> REDIS[(Redis<br/>Atomic Counters)]
    BUDGET --> CRDB[(CockroachDB<br/>Billing Ledger<br/>HLC Timestamps)]

    BUDGET -->|Allocate $50| AS1[Ad Server 1]
    BUDGET -->|Allocate $75| AS2[Ad Server 2]
    BUDGET -->|Allocate $100| AS3[Ad Server 3]

    AS1 -->|Spent: $42<br/>Return: $8| BUDGET
    AS2 -->|Spent: $68<br/>Return: $7| BUDGET
    AS3 -->|Spent: $95<br/>Return: $5| BUDGET

    BUDGET -->|Periodic reconciliation<br/>HLC timestamped| CRDB

    TIMEOUT[Timeout Monitor<br/>5min intervals] -.->|Release stale<br/>allocations| REDIS

    REDIS -->|Budget < 10%| THROTTLE[Dynamic Throttle]
    THROTTLE -.->|Reduce allocation<br/>size $100→$10| BUDGET

    classDef server fill:#e3f2fd,stroke:#1976d2
    classDef budget fill:#fff3e0,stroke:#f57c00
    classDef advertiser fill:#e8f5e9,stroke:#4caf50

    class AS1,AS2,AS3 server
    class BUDGET,REDIS,CRDB,TIMEOUT,THROTTLE budget
    class ADV advertiser
{% end %}

**Budget Allocation Algorithm:**

The core algorithm has three operations:

**1. Request Allocation:**
- Ad server requests budget chunk (e.g., $100) from centralized Budget Controller
- Controller atomically decrements remaining budget using Redis `DECRBY` (prevents race conditions)
- If budget is low (<10% remaining), reduce allocation size to prevent over-delivery
- Log allocation to CockroachDB billing ledger with automatic HLC timestamp
- Return allocated amount (or 0 if budget exhausted)

**2. Report Spend:**
- Ad server reports actual spend after serving ads
- If `actual < allocated`, return unused portion via Redis `INCRBY`
- Log actual spend to CockroachDB billing ledger for reconciliation with HLC timestamp
- Example: Allocated $100, spent $87 → return $13 to budget pool

**3. Timeout Monitor (Background):**
- Every 5 minutes, scan for allocations older than 10 minutes with no spend report
- These likely represent crashed servers holding budget hostage
- Automatically return their allocations to the budget pool via `INCRBY`
- Prevents budget being permanently locked by failed servers

**Key design decisions:**
- **Redis for speed**: Atomic counters provide strong consistency with <1ms latency
- **CockroachDB for billing ledger**: HLC timestamps ensure global event ordering across regions, enables billing reconciliation with chronological accuracy
- **Pre-allocation strategy**: Servers get budget chunks upfront, avoiding per-request latency
- **Dynamic sizing**: Reduce allocation chunks when budget is low to minimize over-delivery risk

**Mathematical Analysis:**

**Over-Delivery Bound:**

Maximum over-delivery: $$\text{OverDelivery}_{max} = S \times A$$

where \\(S\\) = number of servers, \\(A\\) = allocation chunk size.

**Example:** 100 servers with $100 allocation each → **max $10,000 over-delivery** (10% of $100K daily budget).

**Mitigation:** Dynamic allocation sizing.

When budget remaining drops below 10%:
$$A_{new} = \frac{B_r}{S \times 10}$$

This reduces max over-delivery to **~1% of budget**.

### Fraud Detection: Real-Time Invalid Traffic Filtering

**Problem:** Detect and block fraudulent ad clicks in real-time without adding significant latency.

**Fraud Types:**

1. **Click Farms:** Bots or paid humans generating fake clicks
2. **SDK Spoofing:** Fake app installations reporting ad clicks
3. **Domain Spoofing:** Fraudulent publishers misrepresenting site content
4. **Ad Stacking:** Multiple ads layered, only top visible but all "viewed"

**Detection Strategy: Multi-Tier Filtering**

{% mermaid() %}
graph TB
    REQ[Ad Request/Click] --> L1{L1: Simple Rules<br/>0ms overhead}

    L1 -->|Known bad IP| BLOCK1[Block<br/>Bloom Filter]
    L1 -->|Pass| L2{L2: Behavioral<br/>5ms latency}

    L2 -->|Suspicious pattern| PROB[Probabilistic Block<br/>50% traffic]
    L2 -->|Pass| L3{L3: ML Model<br/>Async, 20ms}

    L3 -->|Fraud score > 0.8| BLOCK3[Post-Facto Block<br/>Refund advertiser]
    L3 -->|Pass| SERVE[Serve Ad]

    PROB --> SERVE
    SERVE -.->|Log for analysis| OFFLINE[Offline Analysis<br/>Update models]

    OFFLINE -.->|Update rules| L1
    OFFLINE -.->|Retrain model| L3

    classDef block fill:#ffcccc,stroke:#cc0000
    classDef pass fill:#ccffcc,stroke:#00cc00
    classDef async fill:#ffffcc,stroke:#cccc00

    class BLOCK1,BLOCK3 block
    class SERVE pass
    class L3,OFFLINE async
{% end %}

**L1: Simple Rules (Bloom Filter)**

**Why Bloom filters are ideal for fraud IP blocking:**

At 1M+ QPS, we need to check every incoming request against a blocklist of known fraudulent IPs. The naive approach of storing 100K+ IPs in a hash table would require significant memory (several MB per server) and introduce cache misses. We need something faster.

Bloom filters solve this perfectly:

**Space efficiency**: 10⁷ bits (only 1.25 MB) can represent 100K IPs with 0.01% false positive rate. That's **100× more space-efficient** than a hash table storing full IP addresses. The entire data structure fits in L2 cache, enabling sub-microsecond lookups.

**Zero false negatives**: If a Bloom filter says an IP is NOT in the blocklist, it's guaranteed correct. We never accidentally allow known fraudsters through. The only risk is false positives (0.01% chance of blocking a legitimate IP), which is acceptable - we have L2/L3 filters to catch legitimate users.

**Constant-time lookups**: O(k) hash operations regardless of set size. With k=7 hash functions, we can check membership in **<1 microsecond** - adding virtually zero latency to the request path.

**Lock-free reads**: Multiple threads can query simultaneously without contention. Critical for handling 1M+ QPS across hundreds of cores.

**Trade-off accepted**: 0.01% false positive rate means 1 in 10,000 legitimate users might get flagged at L1 and passed to L2 behavioral detection. This is far better than the alternative - either storing full IPs (100× more memory) or skipping fast filtering entirely and running expensive checks on every request.

**False Positive Rate:**

$$P_{fp} = \left(1 - e^{-kn/m}\right)^k$$

where \\(k\\) = hash functions, \\(n\\) = items, \\(m\\) = bit array size.

**Configuration:** 10⁷ bits (1.25 MB), 100K IPs, 7 hash functions → **0.01% false positive rate**.

**L2: Behavioral Detection**

**Why rule-based heuristics for the second layer:**

L1 (Bloom filter) catches known bad actors, but sophisticated fraudsters constantly rotate IPs. We need real-time behavioral analysis that can detect suspicious patterns without the latency cost of ML inference. Target: **<5ms overhead**.

**Design rationale:**

Simple rules encoded as thresholds can run extremely fast while catching ~70% of fraud that bypasses L1. The key insight is that bot behavior differs from human behavior in quantifiable ways:

**Click rate anomalies** (weight: 0.4):
- Normal users: <10 clicks/minute across the entire platform
- Bots/click farms: 30+ clicks/minute (often uniform timing)
- **Implementation**: Redis sorted sets with `ZCOUNT` for O(log N) time-window queries
- Store last 100 click timestamps per IP, queries complete in ~1ms

**User agent switching** (weight: 0.2):
- Legitimate users: 1-2 user agents (maybe desktop + mobile)
- Fraudsters: 5+ different user agents from same IP (attempting to evade detection)
- **Why this works**: Click farms often cycle through user agent lists to appear legitimate

**Geographic inconsistencies** (weight: 0.15):
- US-based IP but browser language set to Chinese/Russian
- VPN/proxy indicators (hosting provider ASNs rather than ISP)
- **Edge case handling**: Legitimate VPN users exist, so lower weight and combine with other signals

**Click-through rate** (weight: 0.25):
- Normal CTR: 1-3% for most ad campaigns
- Suspicious: >50% CTR (clicking almost every ad they see)
- **Why bots do this**: Paid per click, so maximize volume

**Scoring strategy:**
- Composite score 0-1, where >0.6 triggers probabilistic blocking (serve 50% traffic to reduce impact if false positive)
- Each signal is independent and fast to compute (<1ms each)
- Total L2 overhead: ~5ms, staying within latency budget

**Why not ML here?**
ML models (L3) are slower (20ms+) and run async. L2 needs to be synchronous to block requests in real-time. These simple heuristics provide good precision/recall trade-off while maintaining speed.

**L3: ML-Based Fraud Score**

**Model:** Gradient Boosted Trees (LightGBM) predicting fraud probability.

**Features (50+ dimensions):**

- Device fingerprint entropy
- Click timestamp distribution (uniform → bot, bursty → human)
- Network characteristics (ASN, hosting provider)
- Historical fraud rate of IP/device
- Engagement metrics (time on page, scroll depth)

**Training Data:**

- Positive labels: confirmed fraud (manual review, advertiser complaints)
- Negative labels: legitimate clicks (verified conversions)
- Class imbalance: ~1% fraud rate

**Handling Class Imbalance:**

```
Algorithm: TrainFraudDetectionModel
Input: Training data X, labels y (99% legitimate, 1% fraud)
Output: Trained GBDT classifier

// Strategy 1: Adjust class weights
// Give higher penalty to misclassifying fraud (positive class)
class_weight_fraud ← 99  // Compensates for 99:1 ratio
class_weight_legitimate ← 1

Model_Parameters:
  objective ← "binary_classification"
  metric ← "AUC"
  scale_pos_weight ← 99  // Weight for positive class (fraud)
  num_trees ← 100
  max_depth ← 7
  learning_rate ← 0.05

// Strategy 2: SMOTE (Synthetic Minority Over-sampling)
// Generate synthetic fraud examples to balance dataset
Procedure: SMOTE(X_minority, k_neighbors = 5, oversample_ratio = 10)
  X_synthetic ← empty list
  For each sample x in X_minority:
    // Find k nearest neighbors in feature space
    neighbors ← k_nearest(x, X_minority, k = k_neighbors)
    For i = 1 to oversample_ratio:
      // Randomly select one neighbor
      x_neighbor ← random_choice(neighbors)
      // Generate synthetic sample along line segment
      λ ← random_uniform(0, 1)
      x_synthetic ← x + λ × (x_neighbor - x)
      X_synthetic.append(x_synthetic)
  Return X_synthetic

// After oversampling, fraud class: 1% × 10 = 10% of dataset
// More balanced for training
```

**Deployment:**

Run model **asynchronously** after serving ad:
- Ad served immediately (no latency impact)
- Fraud score computed in background
- If fraud detected: refund advertiser, block device

**Economic Trade-Off:**

- **False Positive:** Block legitimate user → lost ad revenue
- **False Negative:** Allow fraud → wasted advertiser spend

**Cost Function:**

$$\text{Cost} = C_{fp} \times FP + C_{fn} \times FN$$

where:
- \\(C_{fp}\\) = cost of false positive (e.g., $0.50 lost revenue)
- \\(C_{fn}\\) = cost of false negative (e.g., $5.00 advertiser refund)

Typically \\(C_{fn} \gg C_{fp}\\), so optimize for **low false negative rate** (catch all fraud).

### Multi-Region Deployment and Failover

> **Architectural Driver: Availability** - Multi-region deployment with 20% standby capacity ensures we survive full regional outages (1 hour outage = $1M revenue loss). Auto-failover within 90 seconds minimizes impact.

**Scenario:** Primary region (US-East) fails, handling 60% of traffic. What happens?

{% mermaid() %}
graph TB
    subgraph "Global Layer"
        GLB[Global Load Balancer<br/>Health Check: 10s interval]
    end

    subgraph "US-East (PRIMARY - FAILED)"
        USE[API Gateway FAILED<br/>Ad Servers FAILED<br/>Redis FAILED]
        style USE fill:#ffcccc,stroke:#cc0000,stroke-width:3px
    end

    subgraph "US-West (SECONDARY - 3x TRAFFIC)"
        USW_GW[API Gateway DEGRADED<br/>3x traffic spike]
        USW_AS[Ad Servers<br/>Scaling: 30 to 100<br/>90 seconds to provision]
        USW_STANDBY[Standby Capacity<br/>+20% pre-warmed<br/>ACTIVATED]
        USW_REDIS[(Redis<br/>Cache hit: 60% to 45%<br/>Different user distribution)]

        style USW_GW fill:#ffffcc,stroke:#cccc00,stroke-width:2px
        style USW_AS fill:#ffffcc,stroke:#cccc00,stroke-width:2px
        style USW_STANDBY fill:#ccffcc,stroke:#00cc00,stroke-width:2px
    end

    subgraph "EU (NORMAL)"
        EU[API Gateway HEALTHY<br/>Ad Servers HEALTHY<br/>Redis HEALTHY]
        style EU fill:#ccffcc,stroke:#00cc00,stroke-width:2px
    end

    subgraph "Global Database"
        CRDB[(CockroachDB<br/>Multi-Region ACID<br/>Strong Consistency)]
    end

    GLB -->|60% traffic<br/>REROUTED| USW_GW
    GLB -->|30% traffic<br/>EU users| EU
    GLB -.->|Health check FAILED| USE

    USW_GW --> USW_AS
    USW_GW --> USW_STANDBY
    USW_AS --> USW_REDIS
    EU --> CRDB
    USW_AS --> CRDB

    classDef failed fill:#ffcccc,stroke:#cc0000,stroke-width:3px
    classDef degraded fill:#ffffcc,stroke:#cccc00,stroke-width:2px
    classDef healthy fill:#ccffcc,stroke:#00cc00,stroke-width:2px
{% end %}

**Timeline:**

**T+0s (Failure):**
- Load balancer detects health check failures
- DNS TTL: 60s (takes time for clients to see new routing)

**T+10s:**
- First clients fail over to US-West
- Traffic surge begins

**T+30s:**
- US-West sees 3x traffic (2x from US-East, 1x original)
- CPU utilization: 40% → 85%
- Standby capacity activated (20% headroom)

**T+60s:**
- Auto-scaling triggered
- New instances provisioning (takes 90s to boot)

**T+90s:**
- Cache hit rate degradation (different user distribution)
- Latency p95: 100ms → 150ms (cache misses hit database)

**T+150s:**
- New instances online
- Capacity restored
- Latency normalizing

**Mathematical Model:**

**Queuing Theory Insight:**

Server utilization: $$\rho = \frac{\lambda}{c \mu}$$

where \\(\lambda\\) = arrival rate, \\(c\\) = servers, \\(\mu\\) = service rate per server.

**Critical insight:** When \\(\rho > 0.8\\), queue length grows exponentially. When \\(\rho \geq 1.0\\), the system is unstable.

**Example:**
- Normal: 10K QPS across 100 servers (150 QPS capacity each) → \\(\rho = 0.67\\) ✓ Stable
- Failure: 30K QPS across 120 servers → \\(\rho = 1.67\\) ✗ Overload, queues grow unbounded

**Mitigation: Graceful Degradation**

> **Architectural Driver: Availability** - During regional failures, graceful degradation (serving stale cache, shedding low-value traffic) preserves 97.5% of revenue while maintaining uptime. Better to serve degraded ads than no ads.

1. **Increase cache TTL:** 30s → 300s (serve stale data)
2. **Disable expensive features:** Skip ML inference, use rule-based targeting
3. **Shed load:** Reject 10% of lowest-value traffic

**Load Shedding Strategy:**

When overload occurs, the key decision is **which** requests to drop. Random rejection wastes revenue - better to intelligently shed low-value traffic while preserving high-value requests.

{% mermaid() %}
graph TD
    REQ[Incoming Request]

    REQ --> CALC_UTIL{Calculate<br/>Utilization}

    CALC_UTIL -->|< 70%| ACCEPT1[Accept Request<br/>Normal operation]
    CALC_UTIL -->|70-90%| ACCEPT2[Accept Request<br/>Approaching limits]
    CALC_UTIL -->|> 90%| ESTIMATE[Estimate Request<br/>Revenue]

    ESTIMATE --> VALUE{Value vs<br/>P95 Threshold}

    VALUE -->|High value| ACCEPT3[Accept<br/>Preserve revenue]
    VALUE -->|Low value| PROB{Probabilistic<br/>50% chance}

    PROB -->|Accept| ACCEPT4[Accept<br/>Lucky low-value]
    PROB -->|Reject| REJECT[Reject with<br/>429 Too Many Requests]

    REJECT --> LOG[Log rejection<br/>Track lost revenue]

    BACKGROUND[Background: Update<br/>P95 threshold every 60s] -.-> VALUE

    classDef accept fill:#ccffcc,stroke:#00cc00
    classDef reject fill:#ffcccc,stroke:#cc0000
    classDef process fill:#e3f2fd,stroke:#1976d2

    class ACCEPT1,ACCEPT2,ACCEPT3,ACCEPT4 accept
    class REJECT,LOG reject
    class ESTIMATE,VALUE,PROB,BACKGROUND process
{% end %}

**Three-zone strategy:**

**Zone 1: Normal (<70% capacity)**
- Accept all requests
- No overhead from value estimation
- System operating well within limits

**Zone 2: Moderate (70-90% capacity)**
- Still accept all requests but monitor closely
- Auto-scaling should trigger here to add capacity
- Warning zone before shedding kicks in

**Zone 3: Critical (>90% capacity)**
- Estimate expected revenue per request: `predicted_CTR × advertiser_bid`
- Calculate P95 value threshold from recent request distribution
- **High-value requests** (above P95): Always accept - these are the 5% most valuable requests
- **Low-value requests** (below P95): Reject 50% probabilistically - spread impact across advertisers fairly
- Update P95 threshold every 60s based on rolling window

**Why this works:**
- Preserves ~97.5% of revenue while shedding 47.5% of traffic during extreme load
- Fair to advertisers: probabilistic rejection prevents single advertiser being completely blocked
- Adaptive: P95 threshold adjusts as traffic mix changes
- Cheap: Revenue estimation uses already-computed ML CTR scores, minimal overhead

**Impact:**

Reject 10% of requests → \\(\rho = \frac{27,000}{120 \times 150} = 1.5\\) (still overload)

Need to scale to 180 servers: \\(\rho = \frac{30,000}{180 \times 150} = 1.11\\) (still problematic)

**Conclusion:** 20% standby capacity is insufficient for 3x traffic spike. Need:

$$c_{standby} = c_{normal} \times \left(\frac{\lambda_{spike}}{\lambda_{normal}} - 1\right) = 100 \times (3 - 1) = 200 \text{ servers}$$

**Cost:** 200% over-provisioning → expensive. Alternative: accept degraded performance during rare failures.

### Schema Evolution: Zero-Downtime Data Migration

**The Challenge:**

You've been running your CockroachDB-based user profile store for 18 months. It's grown to **4TB across 60 nodes**. Now the product team wants to add a complex new feature that requires fundamental schema changes:
- Add new column for user preferences (JSONB structure)
- Modify table partitioning to include `region` for data locality compliance (GDPR)
- Add secondary index on `last_active_timestamp` for better query performance

**The constraint:** Zero downtime. You can't take the platform offline for migration.

**Why Schema Evolution in Distributed SQL:**

CockroachDB (distributed SQL) provides native schema migration support with `ALTER TABLE`, but large-scale changes still require careful planning:

1. **Online schema changes** - CockroachDB supports most DDL operations without blocking (ADD COLUMN, CREATE INDEX with CONCURRENTLY)
2. **Strong consistency** - ACID guarantees mean no dual-schema reads (unlike eventual consistency systems)
3. **Massive scale** - 4TB migration for index backfill = 2-4 hours with proper throttling
4. **Version compatibility** - Application code should use backward-compatible queries during rolling deployment

**Zero-Downtime Migration Strategy:**

**Phase 1: Add Column (Non-blocking - Day 1)**

CockroachDB supports online schema changes with `ALTER TABLE`:

```sql
-- Add new JSONB column (non-blocking, returns immediately)
ALTER TABLE user_profiles ADD COLUMN preferences JSONB DEFAULT '{}';

-- Backfill happens asynchronously, reads see NULL/default during backfill
```

Application code updated to write to new column immediately. Reads handle both NULL (old rows) and populated (new rows) gracefully.

**No dual-write complexity:** ACID transactions guarantee consistency - either transaction sees new schema or old schema, never inconsistent state.

**Phase 2: Add Index (Background with throttling - Week 1-2)**

Create index with `CONCURRENTLY` to avoid blocking writes:

```sql
-- Create index concurrently (non-blocking, runs in background)
CREATE INDEX CONCURRENTLY idx_last_active ON user_profiles (last_active_timestamp);
```

**Index backfill rate:**

CockroachDB throttles background index creation to ~25% of cluster resources to avoid impacting production traffic. For 4TB data:

$$T_{index} = \frac{4000 \text{ GB}}{100 \text{ MB/s} \times 0.25} \approx 4-6 \text{ hours}$$

Monitor progress: `SHOW JOBS` displays percentage complete and estimated completion time.

**Phase 3: Partition Restructuring (Complex - Week 2-4)**

Modifying table partitioning (adding `region` to partition key) requires creating new table with desired partitioning, then migrating data. This is the **only** operation that requires dual-write pattern:

```sql
-- Create new partitioned table
CREATE TABLE user_profiles_v2 (
  user_id UUID,
  region STRING,
  ... (other columns),
  PRIMARY KEY (region, user_id)
) PARTITION BY LIST (region) (
  PARTITION us VALUES IN ('US'),
  PARTITION eu VALUES IN ('EU'),
  PARTITION asia VALUES IN ('ASIA')
);
```

**Dual-write application logic** (temporary, 2-4 weeks):
- Write to both `user_profiles` and `user_profiles_v2`
- Read from `user_profiles` (authoritative)
- Background job migrates historical data
- After validation, switch reads to `user_profiles_v2`
- Drop `user_profiles`

**Why this is simpler than Cassandra:**
- ACID transactions eliminate consistency issues during migration
- No token range management - just batch SELECT/INSERT
- Built-in backpressure and throttling mechanisms

**Rollback Strategy:**

At any point during migration, rollback is possible:

| Phase | Rollback Complexity | Max Data Loss |
|-------|---------------------|---------------|
| Phase 1-2 (Dual-write) | Easy - flip read source back to old schema | 0 (both schemas current) |
| Phase 3-4 (Gradual cutover) | Medium - revert traffic percentage | 0 (still dual-writing) |
| Phase 5 (Cleanup started) | Hard - restore from archive | Up to 90 days if archive corrupted |

**Critical lesson:** Keep dual-write active for **2+ weeks after full cutover** to ensure new schema stability before cleanup.

**CockroachDB-Specific Advantages:**

**Online schema changes:**

CockroachDB performs most schema changes online without blocking - adding columns, creating indexes, and modifying constraints happen in the background while applications continue to operate normally.

**Partition restructuring complexity:**

Changing primary key requires full rewrite - you can't update partition key in place:

```
Old schema: PRIMARY KEY (user_id)
New schema: PRIMARY KEY ((region, user_id))
```

This requires **complete data copy** to new table with reshuffling across nodes. Plan for **2-4 week migration window** for large datasets (estimate varies based on data volume, cluster capacity, and acceptable impact on production traffic).

**Cost-Benefit Analysis:**

**Note:** The following estimates are **order-of-magnitude approximations** to illustrate trade-offs. Actual costs depend on team size, seniority, geographic location, data volume, and infrastructure configuration.

**Option A: Zero-downtime migration (described above)**
- Duration: \~8 weeks (estimate: 2 weeks dual-write setup + 4 weeks background migration + 2 weeks validation/cutover)
- Engineering cost: \~2 Senior/Staff engineers × 8 weeks = 16 engineer-weeks
  - Salary: \~$77-98K (at $250-320K/year for engineers with distributed systems expertise)
  - Fully-loaded (2-2.5× for benefits, payroll taxes, overhead): \~$155-245K
  - Associated costs (test infrastructure, code review, PM coordination): \~$20-35K
  - **Total: \~$175-280K**
- Risk: Low (gradual rollout, extensive validation, rollback safety)

**Option B: Maintenance window migration**
- Duration: 12-hour downtime window (optimistic - could be 24+ hours if issues arise)
- Engineering cost: ~1 engineer × 2 weeks prep + 12 hours execution
- Revenue loss: Assuming $1M/hour revenue rate (scaled platform), 12 hours = **\~$12M** loss

**Decision:** Zero-downtime migration cost (\~$175-280K) << downtime cost (\~$12M) by **43-69×**.

The exact multiplier depends on your revenue rate and engineering costs, but the conclusion holds across wide ranges: for high-traffic revenue-generating systems, zero-downtime migrations are economically justified despite higher engineering complexity.

---

## Part 8: Observability and Operations

### Service Level Indicators and Objectives

**Key SLIs:**

| Service | SLI | Target | Why |
|---------|-----|--------|-----|
| **Ad API** | Availability | 99.9% | Revenue tied to successful serves |
| **Ad API** | Latency | p95 <100ms, p99 <150ms | Mobile timeouts above 150ms |
| **ML** | Accuracy | AUC >0.78 | Below 0.75 = 15%+ revenue drop |
| **RTB** | Response Rate | >80% DSPs within 30ms | <80% = remove from rotation |
| **Budget** | Consistency | Over-delivery <1% | >2% = refunds, >5% = lawsuits |

**Error Budget Policy (99.9% = 43 min/month):**

When budget exhausted:
1. Freeze feature launches (critical fixes only)
2. Focus on reliability work
3. Mandatory root cause analysis
4. Next month: 99.95% target to rebuild trust

### Incident Response Dashboard

**What needs visibility during incidents:**

**SLO deviation metrics** - Show current vs target to quantify user impact:
- Request latency (p95, p99) vs SLO thresholds
- Error rate vs SLO targets
- *Why: Determines incident severity and whether to page on-call*

**Resource utilization** - Identify capacity vs configuration issues:
- Compute resources (GPU/CPU utilization, memory pressure)
- Active configuration state (model versions, feature flags, cache sizes)
- *Why: Distinguishes "need more capacity" from "wrong config deployed"*

**Dependency breakdown** - Isolate which service is the bottleneck:
- Per-dependency latency (cache layer, database, ML inference, external APIs)
- Compare current latency to baseline/normal ranges
- *Why: Prevents debugging the wrong service (e.g., tuning ML when database is slow)*

**Historical patterns** - Connect to similar past incidents:
- Recent incidents with similar symptoms
- Time-series showing when degradation started
- *Why: Recurring issues often have known mitigations; shows if this is new vs repeated problem*

The specific dashboard layout and tooling is team-dependent - what matters is having these data points readily accessible when responding to incidents.

### Distributed Tracing

Single user reports "ad not loading" among 1M+ req/sec:

```
Request ID: 7f3a8b2c...
Total: 287ms (VIOLATED SLO)

├─ API Gateway: 2ms
├─ User Profile: 45ms
│  └─ Redis: 43ms (normally 5ms)
│     └─ TCP timeout: 38ms
│        └─ Cause: Node failure, awaiting replica
├─ ML Inference: 156ms
│  └─ Batch incomplete: 8/32
│     └─ Cause: Low traffic (Redis failure reduced QPS)
└─ RTB: 84ms
```

**Root cause:** Redis node failure → cascading slowdown. Trace shows exactly why.

### Security and Compliance

**Service-to-Service Authentication: Zero Trust with mTLS**

In a distributed system with 50+ microservices, **network perimeters are insufficient** - an attacker who compromises one service shouldn't be able to impersonate others or intercept traffic. The solution is **mutual TLS (mTLS)** enforced via service mesh.

**Architecture:**

Every service gets a unique cryptographic identity (X.509 certificate) tied to its Kubernetes service account. When Service A calls Service B:

1. **Mutual authentication**: Both services present certificates and verify each other's identity
2. **Encrypted channel**: All traffic encrypted in transit (even within the cluster)
3. **Identity-based authorization**: Access control based on service identity, not IP address

**Implementation via Istio Service Mesh:**

- **Automatic certificate provisioning**: Istio CA issues short-lived certificates (24-hour TTL) to each workload via SPIFFE/SPIRE
- **Transparent to application code**: Envoy sidecar proxies handle TLS handshake, certificate rotation, and verification
- **Strict mode enforcement**: Reject all plaintext connections - services MUST use mTLS

**Authorization Policies (Least Privilege):**

Define explicit allow-lists for service-to-service communication:

- **Ad Server** → ML Inference Service: Allowed (needs CTR predictions)
- **Ad Server** → Budget Database: **Blocked** (must go through Budget Controller to enforce spend limits)
- **RTB Auction** → User Profile Service: Allowed (read-only)
- **External DSPs** → Internal Services: **Blocked** (external traffic terminates at API gateway)

**Example policy logic**: "Service `ad-server` (identity: `cluster.local/ns/prod/sa/ad-server`) is authorized to call path `/predict` on ML service, but nothing else."

**Certificate Lifecycle Management:**

- **Issuance**: Automatic on pod startup via CSR to Istio CA
- **Rotation**: Auto-rotate every 24 hours (short TTL limits blast radius if compromised)
- **Revocation**: If service compromised, revoke certificate cluster-wide within seconds
- **Monitoring**: Alert if certificate expiry < 2 hours (indicates rotation failure)

**Defense in Depth:**

mTLS provides layered security even if network segmentation or firewall rules fail:

$$\text{Security} = \text{Network Isolation} \land \text{mTLS} \land \text{AuthZ Policies}$$

If an attacker breaches the network perimeter, they still can't:
- Decrypt inter-service traffic (no valid certificate)
- Impersonate a service (can't forge certificate signed by trusted CA)
- Call unauthorized endpoints (AuthZ policies enforced at service mesh layer)

**PII Protection:**
- **Encryption at rest:** KMS-encrypted CockroachDB storage
- **Column-level encryption:** Only ML pipeline has decrypt permission
- **Data minimization:** Hashed user IDs, no email/name in ad requests
- **Log scrubbing:** `user_id=[REDACTED]`

**Secrets: Vault with Dynamic Credentials**
- Lease credentials auto-rotated every 24h
- Audit log: which service accessed what when
- Revoke access instantly if compromised

**ML Data Poisoning Protection:**

{% mermaid() %}
graph TD
    RAW[Raw Events] --> VALIDATE{Validation}

    VALIDATE --> CHECK1{CTR >3σ?}
    VALIDATE --> CHECK2{Low IP entropy?}
    VALIDATE --> CHECK3{Uniform timing?}

    CHECK1 -->|Yes| QUARANTINE[Quarantine]
    CHECK2 -->|Yes| QUARANTINE
    CHECK3 -->|Yes| QUARANTINE

    CHECK1 -->|No| CLEAN[Training Data]

    CLEAN --> TRAIN[Training] --> SIGN[GPG Sign]
    SIGN --> REGISTRY[Model Registry]

    REGISTRY --> INFERENCE[Inference]
    INFERENCE --> VERIFY{Verify GPG}

    VERIFY -->|Valid| LOAD[Load Model]
    VERIFY -->|Invalid| REJECT[Reject + Alert]

    classDef input fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef check fill:#fff9c4,stroke:#fbc02d,stroke-width:2px
    classDef danger fill:#ffebee,stroke:#d32f2f,stroke-width:2px
    classDef safe fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    classDef process fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px

    class RAW input
    class VALIDATE,CHECK1,CHECK2,CHECK3,VERIFY check
    class QUARANTINE,REJECT danger
    class CLEAN,LOAD safe
    class TRAIN,SIGN,REGISTRY,INFERENCE process
{% end %}

**Three validation checks:**
1. **CTR anomaly:** >3σ spike (e.g., 2%→8%)
2. **IP entropy:** <2.0 (clicks from narrow range = botnet)
3. **Temporal pattern:** Uniform intervals (human=bursty, bot=mechanical)

**Model integrity:** GPP signature prevents loading tampered models even if storage compromised.

### Data Lifecycle and GDPR

**Retention policies:**

| Data | Retention | Rationale |
|------|-----------|-----------|
| Raw events | 7 days | Real-time only; archive to S3 |
| Aggregated metrics | 90 days | Dashboard queries |
| Model training data | 30 days | Older data less predictive |
| User profiles | 365 days | GDPR; inactive purged |
| Audit logs | 7 years | Legal compliance |

**GDPR "Right to be Forgotten":**

Deletion across 10+ systems in parallel:
- CockroachDB: DELETE user_profiles
- Redis/Valkey: FLUSH user keys
- Kafka: Publish tombstone (log compaction)
- ML training: Mark deleted
- Backups: Crypto erasure (delete encryption key)

**Verification:** All systems confirm → send deletion certificate to user within 48h.

---

## Part 9: Production Operations at Scale

### Deployment Safety

Standard progressive rollout (canary → 10% → 50% → 100%) with automated gates on error rate, latency, and revenue. Feature flags for blast radius control. Well-established patterns - not diving into details here.

### Error Budgets: Balancing Velocity and Reliability

Error budgets formalize the trade-off between reliability and feature velocity. The core idea: SLO is not 100% - the gap between your SLO and 100% is your error budget to "spend" on releases, experiments, and acceptable failures.

**Calculating error budget:**

For 99.9% availability SLO (monthly):
$$\text{Error Budget} = (1 - 0.999) \times 30 \times 24 \times 60 = 43.2 \text{ minutes/month}$$

**Budget allocation strategy:**

| Source | Allocation | Rationale |
|--------|-----------|-----------|
| Planned deployments | 15 min (35%) | Progressive rollouts with measured risk |
| Infrastructure failures | 10 min (23%) | Cloud provider incidents, hardware failures |
| Dependency failures | 8 min (19%) | External DSP timeouts, third-party API issues |
| Unknown/buffer | 10 min (23%) | Unexpected issues, experiments |

**Burn rate alerting:**

Track how fast you're consuming budget. If burning at >10× normal rate, you'll exhaust budget in <3 hours:

$$\text{Burn Rate} = \frac{\text{Error Rate (current)}}{\text{Error Rate (target)}}$$

**Example:**
- Target error rate: \\(\frac{43 \text{ min}}{30 \times 24 \times 60} = 0.001\\) (0.1%)
- Current error rate: 0.015 (1.5%)
- Burn rate: \\(\frac{0.015}{0.001} = 15\times\\) → page on-call immediately

**Policy-driven decision making:**

Error budget remaining drives organizational behavior:

- **>75% budget remaining**: Ship aggressively, run experiments, test risky features
- **25-75% remaining**: Normal operations, standard release cadence
- **<25% remaining**: Freeze non-critical releases, focus on reliability improvements
- **Budget exhausted**: Code freeze except critical security/bug fixes, mandatory postmortems

**Why 99.9% not 99.99%?**

This is an economic decision, not a technical one:

$$\text{Cost of 9s} = \frac{\Delta \text{Infrastructure Cost}}{\Delta \text{Downtime Reduction}}$$

- 99.9% → 99.99%: Requires multi-region active-active (2× infrastructure cost)
- Downtime improvement: 43 min → 4.3 min/month (39 min saved)
- **Cost per minute of uptime**: \\(\frac{\text{2× infra cost}}{39 \text{ min}} \\)

For most ads platforms, the incremental revenue from 39 minutes/month of additional uptime doesn't justify doubling infrastructure spend. Revenue impact is non-linear - most ad requests have client-side retries, users refresh pages, and requests are spread across regions.

**Trade-offs:**
- More nines = exponentially higher cost
- Ads platforms can tolerate brief outages (unlike payment processing or healthcare)
- Better ROI: invest in reducing incident MTTR rather than adding more 9s

### Cost Management at Scale

Resource attribution with chargeback models (vCPU-hours, GPU-hours, storage IOPS per team). Standard optimizations: spot instances for training (70% cheaper), tiered storage, reserved capacity for baseline load. Track efficiency via vCPU-ms per request and investigate >15% month-over-month increases.

---

## Part 11: Resilience and Failure Scenarios

A robust architecture must survive catastrophic failures, security breaches, and business model pivots. This section addresses three critical scenarios:

**Catastrophic Regional Failure:** When an entire AWS region fails, our semi-automatic failover mechanism combines Route53 health checks (2-minute detection) with manual runbook execution to promote secondary regions. The critical challenge is budget counter consistency—asynchronous Redis replication creates potential overspend windows during failover. We mitigate this through pre-allocation patterns that limit blast radius to allocated quotas per ad server, bounded by replication lag multiplied by allocation size.

**Malicious Insider Attack:** Defense-in-depth through zero-trust architecture (SPIFFE/SPIRE for workload identity), mutual TLS between all services, and behavioral anomaly detection on budget operations. Critical financial operations like budget allocations require cryptographic signing with Kafka message authentication, creating an immutable audit trail. Lateral movement is constrained through Istio authorization policies enforcing least-privilege service mesh access.

**Business Model Pivot to Guaranteed Inventory:** Transitioning from auction-based to guaranteed delivery requires strong consistency for impression quotas. Rather than replacing our stack, we extend the existing pre-allocation pattern—CockroachDB maintains source-of-truth impression counters (leveraging the same HLC-based billing ledger) while Redis provides fast-path allocation with periodic reconciliation. This hybrid approach adds only 10-15ms to the critical path for guaranteed campaigns while preserving sub-millisecond performance for auction traffic. The 12-month evolution path reuses 80% of existing infrastructure (ML pipeline, feature store, Kafka, billing ledger) while adding campaign management and SLA tracking layers.

These scenarios validate that the architecture is not merely elegant on paper, but battle-hardened for production realities: regional disasters, adversarial threats, and fundamental business transformations.

---

