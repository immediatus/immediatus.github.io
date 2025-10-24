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

This took about 3 weeks of learning, researching, and writing. Given the scope (3000+ lines covering distributed systems, ML pipelines, auction algorithms, financial compliance, and more), expect inconsistencies, calculation errors, and heavily opinionated architectural choices. Synthesizing knowledge across multiple domains while learning new material tends to produce those human artifacts.

Ironically, for a post about optimization, this one's pretty unoptimized - verbose, repetitive, twice as long as it needs to be. That's what happens when you learn while writing. Feedback and suggestions for cuts welcome.

**Note on costs:** Throughout this post, I'll discuss cost comparisons between different technologies. Please note that pricing varies significantly by cloud provider, region, contract negotiations, and changes over time. The cost figures I mention are rough approximations to illustrate relative differences, not exact pricing you should rely on. Always check current pricing from vendors and factor in your specific usage patterns and potential enterprise discounts.

---

## Part 1: Requirements and Constraints

{% part_toc(next_part="Part 2: High-Level Architecture") %}
<ul>
<li><a href="#functional-requirements">Functional Requirements</a>
<span class="part-toc-desc">Core capabilities: ad serving, targeting, bidding, billing</span></li>
<li><a href="#architectural-drivers-the-three-non-negotiables">Architectural Drivers: The Three Non-Negotiables</a>
<span class="part-toc-desc">Latency, scale, consistency requirements</span></li>
<li><a href="#non-functional-requirements-performance-modeling">Non-Functional Requirements: Performance Modeling</a>
<span class="part-toc-desc">Latency budgets, throughput targets, availability SLAs</span></li>
<li><a href="#scale-analysis">Scale Analysis</a>
<span class="part-toc-desc">Traffic patterns, storage calculations, bandwidth requirements</span></li>
</ul>
{% end %}

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

Before diving into non-functional requirements, we need to establish the three **immutable constraints** that guide every design decision. Understanding these upfront helps explain the architectural choices throughout this post.

**Driver 1: Latency (Sub-100ms p95)**

**Why this matters:** Mobile apps typically timeout after 150ms. Users expect ads to load instantly - if your ad is still loading when the page renders, you show a blank space and earn $0.

Amazon's 2006 study found that every 100ms of added latency costs ~1% of sales. In advertising, this translates directly: slower ads = fewer impressions = less revenue.

At our target scale of 1M queries per second, breaching the 150ms timeout threshold means mobile apps give up waiting, resulting in blank ad slots and complete revenue loss on those requests.

**The constraint:** Maintain sub-100ms p95 latency for the complete request lifecycle - from when the user opens the app to when the ad displays.

**Driver 2: Financial Accuracy (Zero Tolerance)**

**Why this matters:** Advertising is a financial transaction. When an advertiser sets a $10,000 campaign budget, they expect to spend $10,000 - not $10,500 or $9,500.

Billing discrepancies above 2-5% trigger lawsuits and regulatory scrutiny. Even 1% errors generate complaints and credit demands. Beyond legal risk, billing errors destroy advertiser trust - your platform's reputation depends on financial accuracy.

Regulatory frameworks (FTC in the US, Digital Services Act in EU) mandate accurate spend tracking and transparent billing.

**The constraint:** Achieve ≤1% billing accuracy for all advertiser spend. Under-delivery (spending less than budget) costs revenue; over-delivery (spending more than budget) causes legal and trust issues.

**Driver 3: Availability (99.9%+ Uptime)**

**Why this matters:** Unlike many services where downtime is annoying but tolerable, ad platforms lose revenue for every second they're unavailable. No availability = no ads = no money.

A 99.9% uptime target means 43 minutes of allowed downtime per month. This error budget must cover all sources of unavailability. However, through zero-downtime deployment and migration practices (detailed in Part 10), we can eliminate **planned** downtime entirely, reserving the full 43 minutes for **unplanned** failures.

**The constraint:** Maintain 99.9%+ availability with the system remaining operational even when individual components fail. All planned operations (deployments, schema changes, configuration updates) must be zero-downtime.

**When These Constraints Conflict:**

These three drivers sometimes conflict with each other. For example, ensuring financial accuracy may require additional verification steps that add latency. Maximizing availability might mean accepting some data staleness that could affect billing precision.

When trade-offs are necessary, we prioritize:

**Financial Accuracy > Availability > Latency**

Rationale: Legal and trust issues from billing errors have longer-lasting impact than temporary downtime; downtime has more severe consequences than slightly slower ad delivery. Throughout this post, when you see architectural decisions that seem to sacrifice latency or availability, they're usually protecting financial accuracy.

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

Using Little's Law to relate throughput, latency, and concurrency. With service time \\(S\\) and \\(N\\) servers:
$$N = \frac{Q_{peak} \times S}{U_{target}}$$

where \\(U_{target}\\) is target utilization. This fundamental queueing theory relationship helps us understand the capacity needed to handle peak traffic while maintaining acceptable response times.

**Availability Constraint:**

Target "five nines" (99.999% uptime):
$$A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \geq 0.99999$$

where MTBF = Mean Time Between Failures, MTTR = Mean Time To Recovery.

This translates to **26 seconds** of allowed downtime per month (0.43 minutes). A single bad deploy or infrastructure misconfiguration can exhaust this entire budget.

**Consistency Requirements:**

Different data types require different consistency guarantees. Treating everything as strongly consistent degrades performance, while treating everything as eventually consistent creates financial and correctness issues.

- **Financial data** (ad spend, billing): Strong consistency required
  $$\forall t_1 < t_2: \text{Read}(t_2) \text{ observes } \text{Write}(t_1)$$

  Billing accuracy is non-negotiable, but engineering trade-offs create acceptable bounds. The system must prevent unbounded over-delivery from race conditions. **Bounded over-delivery ≤1% of budget** is acceptable due to practical constraints like server failures and network partitions.

  Under-delivery is worse (lost revenue + advertiser complaints), so slight over-delivery is the lesser evil. Legal precedent: lawsuits typically arise from systematic errors >2-5%, not sub-1% technical variance.

- **User preferences and profiles**: Eventual consistency acceptable
  $$\lim_{t \to \infty} P(\text{AllReplicas consistent}) = 1$$

  If a user updates their interests and sees old targeting for a few seconds, it's not critical.

  **Practical example:** User adds "fitness equipment" to their interests. If they see ads for electronics for the next 10-20 seconds while the update propagates across replicas, that's acceptable. The user doesn't even notice, and we haven't lost revenue.

- **Operational dashboards and reporting**: Eventual consistency acceptable

  Real-time dashboards showing "impressions served so far today" can tolerate 10-30 second staleness. Advertisers checking campaign progress don't need millisecond-accurate counts.

**Key insight:** The challenge is reconciling strong consistency requirements for financial data with the latency constraints. Without proper atomic enforcement, race conditions could cause severe over-budget scenarios (e.g., multiple servers simultaneously allocating from the same budget). This is explored in detail in Part 7.

### Scale Analysis

**Data Volume Estimation:**

With 400M Daily Active Users (DAU), averaging 20 ad requests/user/day:
- Daily ad requests: **8B requests/day**
- Daily log volume (at 1KB per log): **8TB/day**

**Storage Requirements:**

- User profiles (10KB per user): **4TB**
- Historical ad performance (30 days retention, 100B per impression): **~24TB**

**Cache Requirements:**

To achieve acceptable response times, frequently accessed data needs to be cached. User access patterns follow a power law distribution where a small fraction of users generate the majority of traffic.

Estimated cache needs: **~800GB** of hot data to serve most requests from memory.

*Note: See Part 5 (Distributed Caching Architecture) for detailed analysis of cache sizing, hit rate optimization, and distribution strategies.*

---

## Part 2: High-Level Architecture

{% part_toc(prev_part="Part 1: Requirements and Constraints", next_part="Part 3: Real-Time Bidding (RTB) Integration") %}
<ul>
<li><a href="#system-components-and-request-flow">System Components and Request Flow</a>
<span class="part-toc-desc">Service architecture, request pipeline, component interactions</span></li>
<li><a href="#latency-budget-decomposition">Latency Budget Decomposition</a>
<span class="part-toc-desc">Breaking down 100ms budget across services</span></li>
<li><a href="#rate-limiting-volume-based-traffic-control">Rate Limiting: Volume-Based Traffic Control</a>
<span class="part-toc-desc">Token bucket, QPS limits, backpressure</span></li>
<li><a href="#critical-path-analysis">Critical Path Analysis</a>
<span class="part-toc-desc">Identifying bottlenecks, optimization priorities</span></li>
<li><a href="#fault-tolerance-and-circuit-breaker-patterns">Fault Tolerance and Circuit Breaker Patterns</a>
<span class="part-toc-desc">Resilience patterns, failure handling</span></li>
<li><a href="#degradation-strategy-when-services-breach-latency-budgets">Degradation Strategy: When Services Breach Latency Budgets</a>
<span class="part-toc-desc">Graceful degradation, fallback mechanisms</span></li>
</ul>
{% end %}

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

<style>
#tbl_gtw + table th:first-of-type  { width: 10%; }
#tbl_gtw + table th:nth-of-type(2) { width: 10%; }
#tbl_gtw + table th:nth-of-type(3) { width: 15%; }
#tbl_gtw + table th:nth-of-type(4) { width: 15%; }
#tbl_gtw + table th:nth-of-type(5) { width: 15%; }
#tbl_gtw + table th:nth-of-type(6) { width: 15%; }
#tbl_gtw + table th:nth-of-type(7) { width: 15%; }
</style>
<div id="tbl_gtw"></div>

| Technology | Overhead | Throughput (RPS) | Rate Limiting | Auth Methods | Istio Integration | Ops Complexity |
|------------|------------------|------------------|---------------|--------------|-------------------|----------------|
| **Envoy</br>Gateway** | 2-4ms | 150K</br>/node | Extension filters | JWT, OAuth2, External | Native</br>(same proxy) | Low</br>(unified) |
| Kong | 3-5ms | 100K</br>/node | Plugin-based | JWT, OAuth2, LDAP | External</br>(separate proxy) | Medium</br>(dual proxies) |
| AWS API</br>Gateway | 5-10ms | 10K</br>/endpoint | Built-in | IAM, Cognito, Lambda | No integration | Low</br>(managed) |
| NGINX Plus | 1-3ms | 200K</br>/node | Lua scripting | Custom modules | No integration | High |

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

### Rate Limiting: Volume-Based Traffic Control

> **Architectural Driver: Availability + Financial Accuracy** - Rate limiting protects infrastructure from overload, controls external API costs (DSP calls), and ensures fair resource allocation. This is **volume-based control** (you get N requests/second) complementing **pattern-based fraud detection** (your behavior looks suspicious) covered in Part 7.

**What Rate Limiting Does (vs Fraud Detection):**

Rate limiting answers: "Are you requesting too much?"
- Legitimate advertiser making 10K QPS (vs 1K QPS limit) → throttled with 429
- Protects infrastructure capacity and enforces SLA contracts

Fraud detection answers: "Are you malicious?" (see Part 7: Fraud Detection)
- Bot farm clicking ads with suspicious patterns → permanently blocked
- Protects advertiser budgets from wasted spend on fake traffic

**Both work together**: Rate limiting stops volume abuse, fraud detection stops sophisticated attacks.

**Why Rate Limiting is Critical:**

1. **Infrastructure protection**: Prevents single client from overwhelming 1.5M QPS capacity
2. **Cost control**: Limits external DSP calls (50K QPS cap prevents runaway API costs)
3. **Fair allocation**: Large advertisers (100K QPS tier) don't starve small advertisers (1K QPS tier)
4. **SLA enforcement**: API contracts specify request limits per advertiser tier

**Multi-Tier Rate Limiting Architecture:**

| Tier | Scope | Limit | Algorithm | Why This Tier |
|------|-------|-------|-----------|---------------|
| **Global** | Entire platform | 1.5M QPS | Token bucket | Protect infrastructure capacity |
| **Per-IP** | Client IP | 10K QPS | Sliding window | Prevent single-source abuse |
| **Per-Advertiser** | API key | 1K-100K QPS (tiered) | Token bucket with burst | SLA enforcement + fairness |
| **Per-Endpoint** | `/bid`, `/report`, etc. | Varies | Leaky bucket | Prevent expensive ops abuse |
| **DSP outbound** | External calls | 50K QPS total | Token bucket | Control external API costs |

**Distributed Rate Limiting Challenge:**

With 100+ gateway nodes, how do you enforce "1K QPS per advertiser" without centralizing every request?

**Naive approach (broken):**
- Each node allows 1K QPS locally → **100 nodes × 1K = 100K QPS total** (100× over budget!)

**Correct approach (distributed counting with gossip):**

```
Per-node limit = Global Limit / N nodes
With 20% headroom: Per-node = (1000 QPS / 100 nodes) × 1.2 = 12 QPS per node
```

**Problem**: Uneven traffic distribution means some nodes hit limits while others idle.

**Solution: Redis-backed distributed token bucket**

```
Key: rate_limit:advertiser:{id}
Algorithm:
1. HINCRBY rate_limit:advertiser:123 tokens -1  (atomic)
2. If result < 0 → reject (429 Too Many Requests)
3. Background refill: SET rate_limit:advertiser:123 1000 EX 1 (every second)
```

**Redis commands (atomic operations):**
```redis
-- Token bucket refill (every second)
EVAL "redis.call('SET', KEYS[1], ARGV[1], 'EX', 1) return 1" 1
     rate_limit:adv:123 1000

-- Consume token
EVAL "local tokens = redis.call('GET', KEYS[1]) or 0
      if tonumber(tokens) > 0 then
        redis.call('DECR', KEYS[1])
        return 1
      else
        return 0
      end" 1 rate_limit:adv:123
```

**Latency impact:**
- Redis local read: **0.3ms** (in-region)
- Rate limit decision: **0.5ms total** (within our 1ms budget)

**Optimization: Local cache with periodic sync**

To avoid Redis roundtrip on every request:

```
Algorithm (hybrid local + distributed):
1. Each gateway node maintains local token bucket (1-second TTL)
2. Allocate N tokens from Redis every second: GET_ALLOCATION(advertiser_id, 1000/100)
3. Serve from local bucket (no Redis call, <0.1ms)
4. Refill local bucket every second from Redis allocation
```

**Trade-off:**
- **Advantage**: 0.5ms → 0.1ms latency (5× faster), reduced Redis load (100× fewer calls)
- **Disadvantage**: Slightly looser enforcement (up to 2-second burst window if node crashes)
- **Decision**: Acceptable trade-off - 2s burst ≤0.2% of daily budget

**Cost Impact of Rate Limiting:**

**Without rate limiting:**
- Malicious client sends 10M requests/day (vs normal 100K)
- DSP calls: 10M wasted calls/month (~5% of infrastructure baseline cost)
- Infrastructure: 100× normal load spikes require significant overprovisioning to handle

**With rate limiting:**
- Redis cost: 20-node cluster (~4% of infrastructure baseline, already deployed for budget enforcement)
- Gateway CPU overhead: 0.5ms × 1.5M QPS = **0.75 vCPU overhead** (negligible)
- **Net savings: Avoids 20-30% infrastructure overprovisioning** (depends on attack frequency and overprovision strategy)

**Rate Limiting Response Headers (OpenAPI standard):**

```
HTTP 429 Too Many Requests
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640000000
Retry-After: 60
```

**Tiered Rate Limits by Advertiser Size:**

| Tier | Monthly Spend | QPS Limit | Burst Allowance | Cost |
|------|--------------|-----------|-----------------|------|
| **Free** | $0 | 10 QPS | 50 req/sec for 10s | $0 |
| **Starter** | $1K-10K | 100 QPS | 500 req/sec for 10s | Included |
| **Growth** | $10K-100K | 1K QPS | 5K req/sec for 10s | Included |
| **Enterprise** | $100K+ | 10K-100K QPS | Custom burst | Negotiated |

**Burst handling via token bucket:**

$$\text{Bucket Size} = \text{Rate} \times \text{Burst Duration}$$

**Example**: 1K QPS with 10s burst allowance = 10,000 token bucket

This allows clients to handle traffic spikes (e.g., Black Friday) without breaching limits during normal operation.

**Monitoring and Alerting:**

Track rate limit metrics:
- **Rejection rate**: If >5% → may need higher tier or optimization
- **Top rejected advertisers**: Alert if enterprise tier hitting limits (SLA breach)
- **Cost**: DSP call budget vs actual spend
- **Attack detection**: Sudden spike in rejections from single IP (DDoS)

**Key Insight**: Rate limiting is not just defensive - it's a cost optimization mechanism. At scale, proper rate limiting can save 20-30% of infrastructure baseline by preventing abuse and avoiding worst-case overprovisioning.

**Service Layer (Target: 75ms)**

The Ad Server orchestrates calls to 4 services, but they cannot all run in parallel due to data dependencies:

**Sequential path (critical):**
- User Profile lookup: 10ms → provides user features (demographics, interests)
- Ad Selection: 15ms → retrieves candidate ads (needs user interests for filtering)
- **ML inference: 40ms** → scores candidates (needs both user features AND ad features)

**Parallel path:**
- RTB auction: 30ms → external DSPs bid (needs user context, runs while Ad Selection + ML execute)

The critical path is **User Profile (10ms) → Ad Selection (15ms) → ML Inference (40ms) = 65ms**, not 40ms in isolation. RTB runs in parallel during the Ad Selection + ML phase.

**Complete Request Latency:**
- Network overhead + Gateway: 15ms
- Critical service path: 65ms
- Auction logic + Serialization: 10ms
- **Total: 90ms** (10ms variance buffer to stay under 100ms SLO)

### Critical Path Analysis

The critical path through the system determines overall latency. ML Inference requires features from both User Profile and Ad Selection candidates, creating sequential dependencies:

{% mermaid() %}
graph TB
    A[Request Arrives] -->|5ms| B[Gateway Auth]
    B --> C[User Profile<br/>10ms]

    C --> D[Ad Selection<br/>15ms]
    C --> F[RTB Auction<br/>30ms]

    D --> E[ML Inference<br/>40ms<br/>Needs: User + Ad Features]

    E --> G{Join Point}
    F --> G

    G -->|5ms| H[Auction Logic<br/>Combine Internal + RTB]
    H -->|5ms| I[Response]

    style E fill:#ffcccc
    style C fill:#ffe6e6
    style D fill:#ffe6e6
    style G fill:#ffffcc
{% end %}

**Critical Path (from diagram):** Gateway (5ms) → User Profile (10ms) → Ad Selection (15ms) → ML Inference (40ms) → Join Point → Auction Logic (5ms) → Response (5ms) = **80ms service layer**

**Parallel path:** Gateway (5ms) → User Profile (10ms) → RTB Auction (30ms) → Join Point = **45ms**

**Note:** Diagram shows service layer only. Add 10ms network overhead at the start for **90ms total request latency** (10ms buffer to 100ms SLO).

The **ML Inference Service** (40ms) is still the single slowest component, but the true bottleneck is the **sequential dependency chain** (User Profile → Ad Selection → ML Inference = 65ms). Cannot parallelize because ML needs features from ad candidates.

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
| **Scale GPU instances** | 90s of 80ms<br/>latency → partial timeouts | -40%<br/>during scale-up window | +30-50% GPU baseline for burst capacity |
| **Degrade to cached predictions** | 5ms<br/>immediate | -8%<br/>targeting accuracy | $0 |

**Decision:** Degradation costs less (-8% vs -40%) and reacts faster (immediate vs 90s).

**But we still auto-scale!** Degradation buys time for auto-scaling to provision capacity. Once new GPU instances are healthy (90s later), circuit closes and we return to normal operation.

**Degradation is a bridge, not a destination.**

---

## Part 3: Real-Time Bidding (RTB) Integration

{% part_toc(prev_part="Part 2: High-Level Architecture", next_part="Part 4: ML Inference Pipeline") %}
<ul>
<li><a href="#openrtb-protocol-deep-dive">OpenRTB Protocol Deep Dive</a>
<span class="part-toc-desc">Protocol specification, request/response format, bid construction</span></li>
<li><a href="#rtb-timeout-handling-and-partial-auctions">RTB Timeout Handling and Partial Auctions</a>
<span class="part-toc-desc">Timeout strategies, partial bid handling, latency tail management</span></li>
<li><a href="#connection-pooling-and-http-2-multiplexing">Connection Pooling and HTTP/2 Multiplexing</a>
<span class="part-toc-desc">Connection reuse, request multiplexing, performance optimization</span></li>
<li><a href="#geographic-distribution-and-edge-deployment">Geographic Distribution and Edge Deployment</a>
<span class="part-toc-desc">Regional presence, latency reduction, edge caching</span></li>
<li><a href="#the-30ms-rtb-timeout-challenge-why-it-s-impossible-to-meet-globally">The 30ms RTB Timeout Challenge</a>
<span class="part-toc-desc">Physics of latency, global constraints, architectural tradeoffs</span></li>
</ul>
{% end %}

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

```
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

```
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
| **Sequential Path (Critical):** | | | | |
| → User profile | 10ms | 10% | 25ms | Yes (needed by next) |
| → Ad selection | 15ms | 15% | 40ms | Yes (needed by ML) |
| → **ML inference** | **40ms** | **40%** | **80ms** | **Yes (needs ad candidates)** |
| **Parallel Path:** | | | | |
| → RTB auction | 30ms | 30% | 45ms | Runs parallel with Ad Selection + ML |
| **After join** | - | - | **80ms** | (limited by sequential path) |
| Auction logic | 5ms | 5% | 85ms | Yes |
| Serialization | 5ms | 5% | 90ms | Yes |
| **Buffer for variance** | **10ms** | **10%** | **100ms** | - |

**Key constraint:** RTB auction gets 30ms budget and runs in parallel with Ad Selection + ML (which take 55ms combined). If we increased RTB timeout to 60ms, it would become the critical path (15 + 60 = 75ms from User Profile), pushing total latency to 100ms (10ms + 75ms + 10ms = 95ms) with no buffer for variance - violations inevitable.

**Critical insight:** We can't just "add more time" to RTB without it becoming the bottleneck - every service fights for milliseconds within a fixed 100ms envelope.

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

{% part_toc(prev_part="Part 3: Real-Time Bidding (RTB) Integration", next_part="Part 5: Distributed Caching Architecture") %}
<ul>
<li><a href="#feature-engineering-architecture">Feature Engineering Architecture</a>
<span class="part-toc-desc">Feature pipeline design, real-time vs batch features, feature encoding</span></li>
<li><a href="#feature-vector-construction">Feature Vector Construction</a>
<span class="part-toc-desc">Embedding lookups, vector assembly, dimensionality considerations</span></li>
<li><a href="#model-architecture-gradient-boosted-trees-vs-neural-networks">Model Architecture: Gradient Boosted Trees vs. Neural Networks</a>
<span class="part-toc-desc">Model selection, latency tradeoffs, accuracy comparison</span></li>
<li><a href="#the-cold-start-problem-serving-ads-without-historical-data">The Cold Start Problem</a>
<span class="part-toc-desc">New advertiser handling, fallback strategies, bootstrapping approaches</span></li>
<li><a href="#model-serving-infrastructure">Model Serving Infrastructure</a>
<span class="part-toc-desc">Deployment architecture, version management, A/B testing</span></li>
<li><a href="#feature-store-tecton-architecture">Feature Store: Tecton Architecture</a>
<span class="part-toc-desc">Centralized feature management, consistency guarantees, online/offline serving</span></li>
</ul>
{% end %}

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

**Cost comparison:** Self-hosted Kafka (~1-2% of infrastructure baseline at scale) is significantly cheaper than AWS Kinesis at high sustained throughput (20-50× cost difference at billions of events/month). Managed services trade cost for operational simplicity.

**Note:** Kafka's cost advantage scales with throughput volume - at lower volumes, managed streaming services may be more cost-effective when factoring in operational overhead.

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
- Engineering cost: 1 FTE-year fully-loaded (salary + benefits + overhead)
- Infrastructure: ~2% of infrastructure baseline/year
- **Total first year: 1 FTE-year + 2% infrastructure baseline**, then 2% infrastructure baseline ongoing

Managed feature store (Tecton/Databricks): SaaS fee ≈ 10-15% of one engineer FTE/year

**Decision**: Managed feature store is **5-8× cheaper** in year one (avoids engineering cost), plus faster time-to-market (weeks vs months). Custom solution only makes sense at massive scale or with unique requirements managed solutions can't support.

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

AUC improvements translate directly to revenue: at 100M daily impressions with $2 CPM, a 1% AUC improvement (~0.5-1% CTR lift) = **$60K monthly revenue gain** (3B monthly impressions × $2 CPM × 1% = $60K).

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
- 10 instances always running (GPU baseline cost)
- Latency: 30ms (no cold start)
- Availability: 99.9%

**Option B: Kubernetes with auto-scaling (3 min, 10 max instances)**
- Average load: ~50% of dedicated GPU baseline
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

| Compute Type | Throughput | Relative Cost | Latency |
|--------------|------------|---------------|---------|
| **CPU inference** | 100 req/sec per core | Baseline | 100ms+ (violates SLA) |
| **GPU inference (T4)** | 1,280 req/sec per GPU | Similar to CPU at scale | <40ms (meets SLA) |

**Cost per 1M predictions:**
- CPU: Baseline cost per prediction
- GPU: ~97% of CPU baseline (similar cost but 12.8× throughput, 2.5× better latency)

GPU is cost-competitive at scale while **significantly better latency** (meets <40ms requirement vs CPU's 100ms+).

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

{% part_toc(prev_part="Part 4: ML Inference Pipeline", next_part="Part 6: Auction Mechanism Design") %}
<ul>
<li><a href="#multi-tier-cache-hierarchy">Multi-Tier Cache Hierarchy</a>
<span class="part-toc-desc">L1/L2/L3 architecture, cache selection, technology comparison</span></li>
<li><a href="#cache-performance-analysis">Cache Performance Analysis</a>
<span class="part-toc-desc">Hit rates, latency profiles, cost-benefit analysis</span></li>
<li><a href="#cache-cost-optimization-the-economic-tradeoff">Cache Cost Optimization: The Economic Tradeoff</a>
<span class="part-toc-desc">TCO calculations, cache sizing, budget allocation</span></li>
<li><a href="#redis-cluster-consistent-hashing-and-sharding">Redis Cluster: Consistent Hashing and Sharding</a>
<span class="part-toc-desc">Data distribution, rebalancing, cluster topology</span></li>
<li><a href="#hot-partition-problem-and-mitigation">Hot Partition Problem and Mitigation</a>
<span class="part-toc-desc">Load skew, replication strategies, request routing</span></li>
<li><a href="#workload-isolation-separating-batch-from-serving-traffic">Workload Isolation: Separating Batch from Serving Traffic</a>
<span class="part-toc-desc">Dedicated clusters, priority queues, QoS management</span></li>
<li><a href="#cache-invalidation-strategies">Cache Invalidation Strategies</a>
<span class="part-toc-desc">TTL policies, active invalidation, consistency patterns</span></li>
</ul>
{% end %}

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

**Database cost comparison at 8B requests/day:**

| Database | Relative Cost | Trade-offs |
|----------|---------------|------------|
| **DynamoDB** | 100% (managed baseline) | Fully managed, eventual consistency default, vendor lock-in |
| **CockroachDB** (60-80 nodes, self-hosted) | 10-15% of DynamoDB | Self-managed infrastructure, strong consistency, multi-region native, HLC built-in |
| **PostgreSQL** (sharded, self-hosted) | 8-12% of DynamoDB | Self-managed, no native multi-region, complex sharding |

**CockroachDB self-hosted at scale is 7-10× cheaper** than DynamoDB at billions of requests/day, while providing strong consistency and native multi-region support.

**Note:** Cost advantage primarily applies to self-hosted deployments at high volumes. CockroachDB Serverless vs DynamoDB has different economics - choose based on operational complexity tolerance and query patterns (read-heavy vs write-heavy workloads).

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
- \\(P_{memory}\\) = cost per GB-month (baseline cache cost unit)
- \\(N_{nodes}\\) = number of Redis nodes

**Cache pricing note:** Managed cache services (ElastiCache, Valkey) typically cost 10-12× per GB compared to raw compute instances. Self-hosted Redis on standard instances is cheaper but adds operational overhead.

**Example:** 1000 nodes × 16GB/node × baseline GB-month rate = **baseline cache cost**

**Component 2: Database Query Cost**

Cache misses hit CockroachDB, which costs both compute and I/O:

$$C_{db}(S) = Q_{total} \times (1 - H(S)) \times C_{query}$$

where:
- \\(Q_{total}\\) = total queries/month
- \\(H(S)\\) = hit rate as function of cache size
- \\(C_{query}\\) = cost per database query (baseline query cost unit)

**Example:** 2.6B queries/month × 5% miss rate × baseline query cost = **query cost component**

**Component 3: Revenue Loss from Latency**

Every cache miss adds ~15ms latency (database read vs cache hit). Amazon's study: 100ms latency = 1% revenue loss.

$$C_{latency}(S) = R_{monthly} \times (1 - H(S)) \times \frac{\Delta L}{100ms} \times 0.01$$

where:
- \\(R_{monthly}\\) = monthly revenue baseline
- \\(\Delta L\\) = latency penalty per miss (15ms)
- 0.01 = 1% revenue loss per 100ms

**Example:** Revenue baseline × 5% miss rate × (15ms/100ms) × 1% = **latency cost component**

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
$$MC_{cache} = 1GB \times P_{memory} \times N_{nodes}$$

**Marginal benefit** (hit rate improvement):

For Zipfian distribution, adding cache beyond 20% coverage yields <0.5% hit rate improvement:

$$MB = \Delta H \times (C_{db} + C_{latency})$$

**Example:**
- Going from 20% → 30% coverage: +0.5% hit rate
- Benefit: 0.005 × (query cost + latency cost components) ≈ **small benefit**
- Cost: 10% × 4TB = 400GB additional cache × cluster size = **very large cost**

**Not worth it** - marginal cost far exceeds marginal benefit beyond 20% coverage.

**Optimal Cache Size Calculation:**

Given our constraints:
- Total dataset: 4TB (400M users × 10KB/user)
- Monthly revenue: baseline (illustrative example: $10M for 1M QPS platform)
- Redis cost: baseline cache cost per GB-month
- Database query cost: baseline query cost
- Latency penalty: 1% revenue per 100ms

**Optimize:**

$$\min_{S} \left[ C_{cache}(S) + C_{db}(S) + C_{latency}(S) \right]$$

Subject to:
- \\(H(S) \geq 0.80\\) (minimum acceptable hit rate)
- \\(L_{p99} \leq 10ms\\) (latency SLA)

**Solution (relative costs as % of total caching infrastructure):**

| Cache Size | Hit Rate | Cost Breakdown (relative %) | Total Relative Cost | Analysis |
|------------|----------|----------------------------|---------------------|----------|
| **5% (200GB)** | 65-70% | Cache: 15%, DB: 54%, Latency: 31% | **100%** (baseline) | High DB+latency penalties |
| **10% (400GB)** | 75-80% | Cache: 37%, DB: 40%, Latency: 23% | **81%** | Better balance |
| **20% (800GB)** | 85-90% | Cache: 74%, DB: 16%, Latency: 10% | **80%** (optimal) | Best total cost |
| **40% (1.6TB)** | 93-96% | Cache: 93%, DB: 5%, Latency: 2% | **128%** | Expensive for marginal gain |

**Optimal choice: 20% coverage (800GB cache)**

- **20% coverage is the clear winner** at 80% of the 5%-coverage cost
- Provides 85-90% hit rate following Zipfian power-law distribution (α≈1.0)
- Best total cost optimization: Balances cache, database, and latency costs
- **Note:** Hit rates validated against web caching research showing 80-20 rule (20% of items serve 80% of traffic)

**Trade-off accepted:** We choose **20% coverage (800GB distributed across cluster)** because:
1. **Lowest total cost**: Optimal point on cost curve (80% of 5%-coverage baseline)
2. 85-90% hit rate meets 80%+ requirement comfortably with safety margin
3. Latency cost minimized (reduces latency penalty 59% vs 10% coverage)
4. Worth paying higher cache cost to save significantly on database and latency costs

**TTL Optimization: Freshness vs Hit Rate Tradeoff**

Time-to-live (TTL) settings create a second optimization problem:
- **Short TTL** (10s): Fresh data, but more cache misses after expiration
- **Long TTL** (300s): High hit rate, but stale data

**Staleness Cost Model:**

$$C_{staleness} = P(\text{stale}) \times C_{error}$$

For user profiles:
- 1% of profiles update per hour
- Average TTL/2 staleness window
- Cost of stale ad: targeting quality degradation

**Example: 30s TTL**
- Average staleness: 15s
- Probability stale: 0.01 × (15/3600) = 0.0042%
- Cost: Low staleness penalty (baseline)

**Example: 300s TTL**
- Average staleness: 150s
- Probability stale: 0.01 × (150/3600) = 0.042%
- Cost: 10× higher staleness penalty

**Optimal TTL: 30-60 seconds**

Balances freshness cost with reasonable hit rate. Longer TTLs increase staleness cost 10×.

**Multi-Tier Cost-Benefit Analysis**

**Question:** Does adding L1 in-process cache (Caffeine) pay off?

**L1 Cache Costs:**
- Memory: 100MB per server × 100 servers = 10GB (negligible, in-heap)
- CPU: ~2% overhead for cache management
- Complexity: Additional code, monitoring

**L1 Cache Benefits:**

From our architecture:
- L1 hit rate: 60% of all requests
- Latency improvement: 5ms (Redis) → 0.001ms (in-process) = **~5ms saved**
- Revenue impact: 60% of queries save ~5ms ≈ 3ms average improvement

$$\text{Revenue gain} = 0.60 \times Q_{total} \times \frac{3ms}{100ms} \times 0.01 \times R_{monthly}$$

**Not a clear win** - marginal revenue benefits compared to operational complexity.

**However:** L1 cache provides **resilience** during Redis outages:
- Without L1: Redis down → 100% cache miss → database overload
- With L1: Redis down → 60% hit rate → database load manageable

**Decision:** Keep L1 for **resilience**, not economics.

**Cost Summary (relative to total caching infrastructure):**

| Component | Relative Cost | Notes |
|-----------|---------------|-------|
| L1 Cache (Caffeine) | ~0% | In-process, negligible memory |
| L2 Cache (Redis/Valkey) | 58% | 800GB at 20% coverage, 85-90% hit rate |
| L3 Database infrastructure (CockroachDB) | 22-29% | 60-80 nodes baseline |
| Database query cost (cache misses) | 13% | 10-15% miss rate × query volume |
| Cache miss latency cost | 8% | Revenue loss from slow queries |
| **Total caching infrastructure** | **100%** | Optimized for 85-90% hit rate at 20% coverage |

**Alternative (no caching):**
- Database infrastructure: 23-28% (more nodes for load)
- Database query cost: 49% (all queries hit database)
- Latency cost: 28% (all queries at 15ms latency penalty)
- **Total: 380-400% of optimized caching cost** + poor user experience

**Savings from caching: 73-75% cost reduction** vs no-cache alternative

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

{% part_toc(prev_part="Part 5: Distributed Caching Architecture", next_part="Part 7: Advanced Topics") %}
<ul>
<li><a href="#generalized-second-price-gsp-auction">Generalized Second-Price (GSP) Auction</a>
<span class="part-toc-desc">Single-slot auction basics, eCPM calculation, second-price mechanism</span></li>
<li><a href="#multi-slot-gsp-position-dependent-auctions">Multi-Slot GSP: Position-Dependent Auctions</a>
<span class="part-toc-desc">Position effects, cascade model, multi-slot pricing</span></li>
<li><a href="#vcg-vickrey-clarke-groves-auction">VCG (Vickrey-Clarke-Groves) Auction</a>
<span class="part-toc-desc">Truthful mechanism, externality pricing, VCG vs GSP comparison</span></li>
<li><a href="#game-theoretic-properties">Game-Theoretic Properties</a>
<span class="part-toc-desc">Truthfulness, Nash equilibrium, LEFE, why GSP dominates in practice</span></li>
<li><a href="#quality-score-and-ad-rank-industry-practice">Quality Score and Ad Rank</a>
<span class="part-toc-desc">Google's quality factors, ML-based scoring, system architecture</span></li>
<li><a href="#computational-complexity">Computational Complexity</a>
<span class="part-toc-desc">Performance comparison: GSP O(N log N) vs VCG O(N² log N)</span></li>
<li><a href="#reserve-prices-and-floor-prices">Reserve Prices and Floor Prices</a>
<span class="part-toc-desc">Revenue optimization, dynamic pricing, multi-dimensional reserves</span></li>
<li><a href="#industry-evolution-first-price-auctions">Industry Evolution: First-Price Auctions</a>
<span class="part-toc-desc">Header bidding, bid shading, modern auction landscape</span></li>
</ul>
{% end %}

### Generalized Second-Price (GSP) Auction

The standard auction mechanism for ads platforms is the Generalized Second-Price (GSP) auction, a variant of the Vickrey-Clarke-Groves (VCG) mechanism.

**Auction Setup:**

- \\(N\\) advertisers submit bids \\(b_1, b_2, \ldots, b_N\\)
- Each ad has predicted **CTR** (Click-Through Rate): \\(\text{CTR}_1, \text{CTR}_2, \ldots, \text{CTR}_N\\) - the probability a user clicks the ad when shown
- Single ad slot to allocate

**Effective Bid (eCPM - effective Cost Per Mille):**

Advertisers use different pricing models - some pay per impression (CPM), others per click (CPC), others per conversion (CPA). To compare apples-to-apples, we convert all bids to **eCPM**: expected revenue per 1000 impressions.

For a CPC bid (cost-per-click), the platform only earns revenue when users click. If an advertiser bids $4.00 per click, but their ad has 15% CTR (150 clicks per 1000 impressions):

$$\text{eCPM}_i = b_i \times \text{CTR}_i \times 1000 = \\$4.00 \times 0.15 \times 1000 = \\$600$$

This normalizes bids across pricing models: eCPM represents expected revenue per 1000 impressions, accounting for how likely users are to click.

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

Winner: Advertiser B (highest eCPM = $600)

Price paid by B:
$$p_B = \frac{500}{0.15 \times 1000} = \frac{500}{150} = \\$3.33$$

Advertiser B bid $4.00 but only pays $3.33 (just enough to beat A).

### Multi-Slot GSP: Position-Dependent Auctions

The single-slot example above is foundational, but real search engines show multiple ads. In multi-slot auctions, **position matters** - top positions get more clicks.

**The Position Effect (Cascade Model):**

Users view ads from top to bottom. An ad in position 1 gets more visibility than position 2.

**Position-Dependent CTR:**

Actual clicks depend on both ad quality and position:

$$Clicks_{i} = baseCTR_{i} \times \alpha_{position} \times impressions$$

where \\(\alpha_1 > \alpha_2 > \alpha_3 > \ldots\\) are position-specific multipliers.

**Example: Position Effect**

Consider an ad with base CTR = 15%:

<style>
#tbl_gsp_multi + table th:first-of-type  { width: 20%; }
#tbl_gsp_multi + table th:nth-of-type(2) { width: 20%; }
#tbl_gsp_multi + table th:nth-of-type(3) { width: 30%; }
#tbl_gsp_multi + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_gsp_multi"></div>

| Position | Click Multiplier (α) | Calculation | Actual CTR |
|----------|---------------------|-------------|------------|
| Position 1 (Top) | α₁ = 1.0 | 15% × 1.0 | 15.0% |
| Position 2 | α₂ = 0.7 | 15% × 0.7 | 10.5% |
| Position 3 | α₃ = 0.5 | 15% × 0.5 | 7.5% |
| Position 4 | α₄ = 0.3 | 15% × 0.3 | 4.5% |

Same ad, different positions → dramatically different click-through rates.

**Multi-Slot GSP Allocation:**

**Step 1: Rank by eCPM (using base CTR)**

$$eCPM_{i} = b_i \times baseCTR_{i} \times 1000$$

**Step 2: Assign positions by rank**
- Highest eCPM → Position 1
- 2nd highest → Position 2
- 3rd highest → Position 3

**Multi-Slot GSP Pricing:**

Under the **separable CTR assumption** (clicks = baseCTR × position multiplier), advertiser in position \\(k\\) pays just enough to beat the advertiser in position \\(k+1\\):

$$p_{k} = \frac{eCPM_{k+1}}{baseCTR_{k} \times 1000}$$

**Key Insight:** The pricing formula is identical to single-slot GSP! The position effects cancel out because higher-ranked ads get better positions. The position multipliers (α) affect allocation but not pricing in equilibrium.

**Complete Multi-Slot Example:**

Setup: 3 ad positions with α₁ = 1.0, α₂ = 0.7, α₃ = 0.5

4 advertisers submit CPC bids:

<style>
#tbl_gsp_multi_example + table th:first-of-type  { width: 15%; }
#tbl_gsp_multi_example + table th:nth-of-type(2) { width: 10%; }
#tbl_gsp_multi_example + table th:nth-of-type(3) { width: 10%; }
#tbl_gsp_multi_example + table th:nth-of-type(4) { width: 10%; }
#tbl_gsp_multi_example + table th:nth-of-type(5) { width: 10%; }
#tbl_gsp_multi_example + table th:nth-of-type(6) { width: 30%; }
#tbl_gsp_multi_example + table th:nth-of-type(7) { width: 15%; }
</style>
<div id="tbl_gsp_multi_example"></div>

| Advertiser | Bid | Base CTR | eCPM | Rank | Position | Price per</br>Click |
|------------|-----|----------|------|------|----------|-----------------|
| A | $5.00 | 0.15 | $750 | 1 | Position 1 (α₁=1.0) | $4.00 |
| B | $6.00 | 0.10 | $600 | 2 | Position 2 (α₂=0.7) | $4.80 |
| C | $4.00 | 0.12 | $480 | 3 | Position 3 (α₃=0.5) | $2.00 |
| D | $3.00 | 0.08 | $240 | 4 | No position | N/A |

**Price Calculations:**

Using the formula \\(p_k = \frac{eCPM_{k+1}}{baseCTR_k \times 1000}\\):

- A pays: $600 / (0.15 × 1000) = $4.00 (bid $5, pay $4 - second-price)
- B pays: $480 / (0.10 × 1000) = $4.80
- C pays: $240 / (0.12 × 1000) = $2.00

**Key Property:** Positions assigned by eCPM rank (A=$750 > B=$600 > C=$480), ensuring highest-value ads get best positions. GSP prioritizes allocation efficiency over revenue maximization—a platform revenue-optimizing mechanism like VCG would be more complex.

**Connection to Single-Slot GSP:** Multi-slot GSP is the natural extension. Each position is allocated by eCPM ranking, and pricing ensures no advertiser wants to swap positions with another in equilibrium (locally envy-free equilibrium).

**Industry Standard:** Google Search Ads uses multi-slot GSP with position effects for sponsored search results. The cascade model (users view top-to-bottom) is well-established in academic literature ([Varian 2007](https://people.ischool.berkeley.edu/~hal/Papers/2006/position.pdf)).

### VCG (Vickrey-Clarke-Groves) Auction

The **VCG (Vickrey-Clarke-Groves) auction** is an alternative mechanism designed to be **truthful**: advertisers maximize their utility by bidding their true value, regardless of others' bids.

**The Problem VCG Solves:**

GSP incentivizes strategic bidding (bid shading, gaming). VCG eliminates this: **truthful bidding is always optimal**. The trade-off? Higher computational complexity.

**Core Principle: Pay Your Externality**

In VCG, winners pay for the **harm they cause to others** by participating in the auction. This aligns incentives: your payment equals the social cost of your presence, making truthful bidding optimal.

**Externality Definition:**

$$\text{Externality}_w = \text{Welfare (without } w) - \text{Welfare (with } w, \text{ excluding } w\text{'s utility)}$$

**Translation:** "How much worse off are other advertisers because you're in the auction?"

**Single-Slot VCG (Vickrey Auction):**

For **single-slot auctions**, VCG behaves similarly to GSP: winner pays second-highest value (externality equals opportunity cost to next-best bidder).

**Key insight:** With truthful bidding, single-slot VCG = single-slot GSP (both charge second-price).

The real difference between VCG and GSP emerges with **multiple ad slots**, where VCG calculates total reallocation cost while GSP uses simpler position-based pricing.

**Multi-Slot VCG:**

With multiple ad slots, VCG and GSP diverge significantly. VCG calculates the **total reallocation** if a winner weren't present.

**General VCG Payment Formula:**

For advertiser \\(i\\) assigned to slot \\(k\\) with click probability \\(\alpha_k\\), the VCG payment per click is:

$$p_i = \frac{SW_{-i} - SW_{-i}^{i}}{\text{CTR}_i \times \alpha_k}$$

where:
- \\(SW_{-i}\\) = social welfare **without** advertiser \\(i\\) (optimal reallocation of others)
- \\(SW_{-i}^{i}\\) = social welfare **with** advertiser \\(i\\), **excluding** \\(i\\)'s utility (others' welfare under current allocation)
- \\(\text{CTR}_i\\) = advertiser \\(i\\)'s click-through rate
- \\(\alpha_k\\) = slot \\(k\\)'s click probability

**Breaking it down:**
1. **Externality** (numerator): \\(SW_{-i} - SW_{-i}^{i}\\) = harm to others, measured in value per impression
2. **Clicks received** (denominator): \\(\text{CTR}_i \times \alpha_k\\) = advertiser's expected clicks per impression
3. **Payment per click**: Externality per impression ÷ Clicks per impression

**Intuition:** "How much harm do I cause others?" (externality) divided by "How many clicks do I get?" (my usage) = My cost per click.

**Example: 3 Slots, 4 Advertisers**

**Setup:**

| Advertiser | Value/Click | CTR  | Value × CTR | Rank |
|------------|-------------|------|-------------|------|
| A          | $10         | 0.20 | 2.00        | 1    |
| B          | $8          | 0.25 | 2.00        | 1    |
| C          | $12         | 0.10 | 1.20        | 3    |
| D          | $6          | 0.15 | 0.90        | 4    |

**Slots:** Position 1 (α₁ = 0.3 clicks), Position 2 (α₂ = 0.2), Position 3 (α₃ = 0.1)

**VCG Allocation:** Rank by value × CTR
- Slot 1 → A (2.00)
- Slot 2 → B (2.00)
- Slot 3 → C (1.20)

**VCG Pricing for A:**

**Step 1: Social welfare WITH A** (others only):
- B in slot 2: value 2.00 × 0.2 clicks = 0.40
- C in slot 3: value 1.20 × 0.1 clicks = 0.12
- Total (others): 0.52

**Step 2: Social welfare WITHOUT A** (reallocate):
- B → slot 1: 2.00 × 0.3 = 0.60
- C → slot 2: 1.20 × 0.2 = 0.24
- D → slot 3: 0.90 × 0.1 = 0.09
- Total (others): 0.93

**A's externality:** 0.93 - 0.52 = 0.41

**A pays:** \\(\frac{0.41}{0.20 \times 0.3} = \frac{0.41}{0.06} = \\$6.83\\) per click

**GSP would charge differently:** A would pay just enough to beat next-highest eCPM at their position.

**Why This Matters:**

**VCG Properties:**
- **Truthful:** Bidding true value is dominant strategy (no gaming)
- **Efficient allocation:** Maximizes social welfare
- **Complexity:** O(N² log N) - must recalculate welfare for each winner

**When to Use VCG:**
- Small-scale auctions where truthfulness is critical
- High-value auctions where computation cost is acceptable
- Environments where strategic bidding causes instability

**Why Most Platforms Use GSP Instead:**
- VCG requires O(N²) welfare calculations (slow for real-time)
- GSP is O(N log N) - much faster
- GSP generates 5-10% more revenue in equilibrium
- Industry has converged on GSP (network effects)

### Game-Theoretic Properties

**Why this section matters:** Pure auction theory says "use VCG (truthful mechanism)," but industry reality uses GSP. This section explains the gap and helps you choose the right mechanism for your platform. 

**For rigorous proofs**, see [Edelman et al. 2007](https://www.benedelman.org/publications/gsp-060801.pdf) and [Cornell CS6840 lecture notes](https://www.cs.cornell.edu/courses/cs6840/2020sp/note/CS6840_Apr29_scribenotes.pdf). 

**For implementation guidance**, read on.

**Key Strategic Properties of GSP:**

**1. GSP is NOT Truthful**

Unlike VCG (where bidding true value is optimal), **GSP incentivizes strategic bidding**. Advertisers can profit by bidding below their true value.

**Why:** In GSP, your bid affects both (a) which slot you get, and (b) what you pay. Sometimes a "worse" slot at much lower price yields higher profit than the "best" slot at high price. ([Proof with concrete example](https://www.cs.cornell.edu/courses/cs6840/2020sp/note/CS6840_Apr29_scribenotes.pdf) shows 177% profit gain from strategic bidding.)

**2. GSP Has Nash Equilibrium (Not Dominant Strategy)**

- **VCG:** Dominant strategy - "Bid true value regardless of others"
- **GSP:** Nash equilibrium - "Best response given what others bid"

This means bidders need to learn/adapt to market conditions rather than having a single optimal strategy.

**3. Multiple Equilibria → LEFE Refinement**

GSP has infinitely many Nash equilibria. In practice, bids converge to **Locally Envy-Free Equilibrium (LEFE)** where no advertiser wants to swap with neighbors at current prices.

**LEFE properties ([Edelman et al. 2007](https://www.benedelman.org/publications/gsp-060801.pdf)):**
- Efficient allocation (highest-value advertisers get best slots)
- Unique payments (despite multiple bid profiles)
- Emerges through learning (typically within weeks)
- **Generates ≥ VCG revenue** (proven, not just empirical)

**Why Industry Uses GSP Despite Non-Truthfulness:**

<style>
#tbl_gsp_vcg_compare + table th:first-of-type  { width: 25%; }
#tbl_gsp_vcg_compare + table th:nth-of-type(2) { width: 37%; }
#tbl_gsp_vcg_compare + table th:nth-of-type(3) { width: 38%; }
</style>
<div id="tbl_gsp_vcg_compare"></div>

| Property | VCG | GSP |
|----------|-----|-----|
| Truthfulness | Dominant strategy | Nash equilibrium only |
| Revenue | Lower (baseline) | 5-10% higher (proven) |
| Computational Complexity | O(N² log N) | O(N log N) |
| Explainability | Complex (externality) | Simple (rank by eCPM) |
| Efficiency | Always efficient | Efficient at LEFE |
| Stability | Unique equilibrium | Multiple (LEFE emerges) |
| Industry adoption | Rare | Universal |

**Bottom Line:** GSP trades dominant-strategy truthfulness for higher revenue, lower complexity, and better explainability. For real-time platforms serving billions of auctions daily, this is the right trade-off.

**Implementation Implications:**

**What to expect:**
1. **Strategic bidding:** Advertisers will NOT bid true values - design for learning/optimization
2. **Convergence:** Bids stabilize to LEFE within weeks (monitor for equilibrium)
3. **Bid assistance:** Consider providing bid suggestions to guide toward efficient equilibrium
4. **Revenue advantage:** GSP generates 5-10% more revenue than VCG at LEFE

**Mechanism design in practice:** Real-world constraints (simplicity, revenue, adoption, latency) often outweigh pure theoretical properties.

### Quality Score and Ad Rank (Industry Practice)

The GSP mechanism above assumes ads are ranked purely by eCPM = bid × CTR. In practice, **ad quality** also matters.

**The Quality Problem:**

Consider two advertisers:
- Advertiser X: Bid $10, fast landing page, relevant ad copy → users happy
- Advertiser Y: Bid $11, slow landing page, misleading ad → users complain

Should Y win just because they bid more? This degrades user experience.

**Google's Solution: Quality Score**

Since ~2005, Google Ads has incorporated **Quality Score** into auction ranking:

$$\text{Ad Rank} = \text{Bid} \times \text{Quality Score}$$

**Quality Score Components (1-10 scale):**

1. **Expected CTR** (40% weight): Historical click-through rate for this keyword/ad combination
2. **Ad Relevance** (30% weight): How well ad text matches search query intent
3. **Landing Page Experience** (30% weight): Page load speed, mobile-friendliness, content relevance, security (HTTPS)

**Modified Auction Ranking:**

Instead of ranking by eCPM alone, rank by **Ad Rank**:

$$\text{Ad Rank}_i = b_i \times \text{CTR}_i \times \text{QualityScore}_i \times 1000$$

**Example: Quality Beats Price**

<style>
#tbl_quality + table th:first-of-type  { width: 15%; }
#tbl_quality + table th:nth-of-type(2) { width: 12%; }
#tbl_quality + table th:nth-of-type(3) { width: 12%; }
#tbl_quality + table th:nth-of-type(4) { width: 18%; }
#tbl_quality + table th:nth-of-type(5) { width: 18%; }
#tbl_quality + table th:nth-of-type(6) { width: 13%; }
#tbl_quality + table th:nth-of-type(7) { width: 12%; }
</style>
<div id="tbl_quality"></div>

| Advertiser | Bid | CTR | Quality Score | Ad Rank | Position | Winner? |
|------------|-----|-----|---------------|---------|----------|---------|
| X | $5.00 | 0.15 | 10/10 (excellent) | 7,500 | 1 | Yes |
| Y | $7.00 | 0.15 | 6/10 (poor landing page) | 6,300 | 2 | No |

Advertiser X wins despite lower bid ($5 vs $7) because of higher quality (10/10 vs 6/10).

**System Design Implications:**

**1. Data Pipeline Requirements:**

- **Historical CTR tracking:** Store click/impression data per advertiser-keyword pair
- **Landing page metrics:** Collect page load times, bounce rates, mobile scores
- **Real-time signals:** HTTPS status, page availability checks
- **Storage:** Time-series database for CTR history, key-value store for current quality scores

**2. Computation Architecture:**

Quality Score is computed offline by ML model, cached, and served at auction time:

{% mermaid() %}
graph
    subgraph "Offline Pipeline - Runs Daily/Weekly"
        direction BT
        CACHE_WRITE[Cache Update<br/>Redis/Memcached<br/>Atomic Swap]
        PREDICT[Quality Score Prediction<br/>All Advertiser-Keyword Pairs<br/>Millions of Combinations]
        TRAIN[ML Model Training<br/>XGBoost/Neural Net<br/>Hours of Batch Processing]
        HD[(Historical Data Store<br/>Time-Series DB<br/>Billions of Auction Events)]

        HD --> TRAIN
        TRAIN --> PREDICT
        PREDICT --> CACHE_WRITE
    end

    subgraph "Online Pipeline - Real-Time <100ms"
        direction TB
        AUCTION[Auction Request<br/>User Query + Bids<br/>N Advertisers]
        CACHE_LOOKUP{Cache Lookup<br/>Redis Read<br/>< 1ms}
        CACHE_HIT[Quality Score Retrieved<br/>99%+ Hit Rate]
        CACHE_MISS[Cache Miss<br/>Use Default Score = 7/10<br/>< 1% Rate]
        COMPUTE[Compute Ad Rank<br/>Bid × CTR × QualityScore<br/>< 1ms]
        GSP[GSP Pricing<br/>Rank & Select Winner<br/>< 5ms]
        RESULT[Auction Result<br/>Winner + Price<br/>Click/Impression Event]

        AUCTION --> CACHE_LOOKUP
        CACHE_LOOKUP -->|Hit| CACHE_HIT
        CACHE_LOOKUP -->|Miss| CACHE_MISS
        CACHE_HIT --> COMPUTE
        CACHE_MISS --> COMPUTE
        COMPUTE --> GSP
        GSP --> RESULT
    end

    style HD fill:#e1f5ff
    style TRAIN fill:#e1f5ff
    style PREDICT fill:#e1f5ff
    style CACHE_WRITE fill:#e1f5ff
    style AUCTION fill:#fff4e1
    style CACHE_LOOKUP fill:#fffacd
    style CACHE_HIT fill:#d4edda
    style CACHE_MISS fill:#f8d7da
    style COMPUTE fill:#fff4e1
    style GSP fill:#fff4e1
    style RESULT fill:#fff4e1
{% end %}

**3. Performance Considerations:**

- **Latency impact:** Quality score lookup adds ~0.5-1ms to auction (cache hit)
- **Cache warming:** Pre-compute scores for active advertisers (99%+ hit rate)
- **Fallback:** Default quality score (e.g., 7/10) if cache miss
- **Update frequency:** Quality scores change slowly (update daily, not per-auction)

**4. ML Model Deployment:**

- **Training data:** Billions of historical auctions (click events, landing page metrics)
- **Features:** Ad-keyword relevance (NLP embeddings), historical CTR, page speed metrics
- **Model serving:** Offline batch prediction, not real-time inference (too slow for auction latency)
- **A/B testing:** Shadow scoring to test model changes before production

**Relationship to GSP:**

Quality-adjusted GSP is still a second-price auction:
- Rank by: Bid × CTR × Quality Score
- Pay: Just enough to beat next advertiser (accounting for quality difference)

The fundamental GSP property (not truthful, but Nash equilibrium exists) still holds.

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
| Too low<br/>($0.50) | Sell almost all impressions, but accept low-value bids | 95% fill rate × $0.80 avg eCPM = $0.76 revenue per impression |
| Optimal<br/>($2.00) | Balance between fill rate and price | 70% fill rate × $3.50 avg eCPM = $2.45 revenue per impression |
| Too high<br/>($10.00) | Only premium bids qualify, but most impressions go unsold | 20% fill rate × $12.00 avg eCPM = $2.40 revenue per impression |

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

**Result:** Optimal reserve is half the maximum bid value (when bids are uniformly distributed).

**Practical Approach:**

Rather than assuming a distribution, use empirical data:
- Analyze historical bid distribution from past auctions
- Set reserve at 40th-60th percentile of historical bids
- A/B test different reserve prices and measure actual revenue impact
- Adjust dynamically based on inventory quality (premium placements → higher reserve)

**System Design Implications:**

**1. Where to Apply Reserve Price in Auction Pipeline:**

{% mermaid() %}
graph LR
    START["Receive Bids<br/>N advertisers"]
    ECPM["Calculate eCPM<br/>Bid × CTR × 1000"]
    FILTER["Reserve Price Filter<br/>Remove if eCPM &lt; reserve_price<br/>Linear scan"]
    RANK["Rank by eCPM<br/>Sort qualified bids"]
    GSP["Run GSP Pricing<br/>Second-price calculation"]
    RESULT["Return Winner<br/>or No Fill"]

    START --> ECPM
    ECPM --> FILTER
    FILTER --> RANK
    RANK --> GSP
    GSP --> RESULT

    style START fill:#e1f5ff
    style ECPM fill:#fff4e1
    style FILTER fill:#fffacd
    style RANK fill:#fff4e1
    style GSP fill:#fff4e1
    style RESULT fill:#d4edda
{% end %}

**Performance:** Reserve price filtering is O(N) linear scan, negligible latency (<0.01ms for typical N < 1000 bids).

**2. Reserve Price Storage and Lookup:**

**Multi-dimensional pricing:** Segment reserves by ad unit, geography, device type, time of day, user segment (e.g., US desktop: $4.00 vs India mobile: $0.50).

**Caching strategy:**
```
Reserve Price Lookup:
  - L1: In-memory map (< 0.1ms latency)
  - L2: Redis cache (updated hourly)
  - L3: Database fallback
  - Default: Hardcoded minimum if all fail
```

**Storage key:** `reserve_{ad_unit}_{geo}_{device}_{hour_of_day}` with hierarchical fallback (specific → general).

**3. Dynamic Reserve Price Optimization:**

**Offline optimization service (runs hourly):**
- Pull last 24h bid data from analytics DB
- Segment by dimensions (ad unit, geo, device, hour)
- Calculate optimal reserve \\(r^*\\) per segment: maximize \\(r \times P(\text{bid} \geq r)\\)
- Update Redis cache with new reserves
- Monitor revenue impact vs baseline

**4. Operational Considerations:**

**Testing:** A/B test reserve price changes (7-day minimum for weekly seasonality), adopt if revenue lift >2%.

**Failure handling:** Use last-known value if cache miss (balances revenue and reliability).

**Monitoring:** Track fill rate, revenue per impression, cache hit rate (>99% target), auction latency p99.

### Industry Evolution: First-Price Auctions

**Historical Context:**

The GSP and VCG mechanisms discussed above are **second-price auctions** - winners pay less than their bid. However, the programmatic advertising industry underwent a major shift in 2019.

**The Transition:**

<style>
#tbl_first_second + table th:first-of-type  { width: 20%; }
#tbl_first_second + table th:nth-of-type(2) { width: 40%; }
#tbl_first_second + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_first_second"></div>

| Period | Dominant Mechanism | Context |
|--------|-------------------|---------|
| Pre-2015 | Second-price (GSP) | Google pioneered GSP for sponsored search |
| 2015-2018 | Modified second-price | Exchanges added floors, modified pricing rules |
| 2019-Present | First-price | Google AdX completed transition (Sept 2019) |

**What Changed:**

**Second-Price (GSP):**
- Winner pays \\(p = \frac{\text{eCPM}_{2nd}}{\text{CTR}_w \times 1000} + \epsilon\\)
- Bid shading unnecessary (closer to truthful bidding)

**First-Price:**
- Winner pays their actual bid: \\(p = b_w\\)
- Requires bid shading (bidders must estimate optimal bid below true value)

**Why the Shift? Header Bidding and Transparency**

**Header bidding** (publisher-side unified auctions) exposed inconsistencies: exchanges used "modified second-price" with hidden rules (secret floors, varying increments), making it impossible for publishers to compare prices fairly.

**Solution:** First-price auctions for transparency—winner pays exactly their bid, no hidden modifications.

**Impact on Bidders: Bid Shading Required**

First-price requires strategic bidding. Bidding true value \\(v\\) yields zero profit, so bidders shade: \\(b_i = v_i - s(v_i, \text{market})\\) where \\(s(\cdot)\\) is learned via ML.

**Example:** True value $10, estimated second-highest $7 → bid ~$7.50 → profit $2.50 if win.

**Modern Practice (2025):**

<style>
#tbl_modern + table th:first-of-type  { width: 30%; }
#tbl_modern + table th:nth-of-type(2) { width: 35%; }
#tbl_modern + table th:nth-of-type(3) { width: 35%; }
</style>
<div id="tbl_modern"></div>

| Auction Type | Used For | Rationale |
|--------------|----------|-----------|
| Second-Price (GSP) | Sponsored search (Google Search Ads) | Established ecosystem, simpler for advertisers |
| First-Price | Programmatic display/video (Google AdX, Prebid) | Transparency for header bidding |

**Implementation Considerations:**

| Factor | Second-Price (GSP) | First-Price |
|--------|-------------------|-------------|
| Bidder strategy | Closer to truthful | Requires bid shading (ML) |
| Transparency | Hidden pricing logic | Winner pays bid (transparent) |
| Complexity | Simpler for bidders | Simpler for publishers |
| Use case | Search ads (industry standard) | Programmatic display/video (post-2019) |

**This document focuses on GSP** because it's the foundation of sponsored search and has richer game-theoretic properties (Nash equilibria, LEFE, VCG comparison). First-price is mechanically simpler (winner pays bid) but requires bidder-side ML for shading.

---

## Part 7: Advanced Topics

{% part_toc(prev_part="Part 6: Auction Mechanism Design", next_part="Part 8: Observability and Operations") %}
<ul>
<li><a href="#budget-pacing-distributed-spend-control">Budget Pacing: Distributed Spend Control</a>
<span class="part-toc-desc">Pre-allocation, atomic counters, over-delivery prevention</span></li>
<li><a href="#fraud-detection-pattern-based-abuse-detection">Fraud Detection: Pattern-Based Abuse Detection</a>
<span class="part-toc-desc">Bot detection, click fraud, anomaly detection</span></li>
<li><a href="#multi-region-deployment-and-failover">Multi-Region Deployment and Failover</a>
<span class="part-toc-desc">Active-active architecture, data replication, regional failover</span></li>
<li><a href="#schema-evolution-zero-downtime-data-migration">Schema Evolution: Zero-Downtime Data Migration</a>
<span class="part-toc-desc">Backward compatibility, dual-write patterns, migration strategies</span></li>
<li><a href="#distributed-clock-synchronization-and-time-consistency">Distributed Clock Synchronization and Time Consistency</a>
<span class="part-toc-desc">NTP, TrueTime, timestamp ordering</span></li>
<li><a href="#global-event-ordering-for-financial-ledgers-the-external-consistency-challenge">Global Event Ordering for Financial Ledgers</a>
<span class="part-toc-desc">Spanner-style consistency, transaction ordering, audit trails</span></li>
</ul>
{% end %}


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

### Fraud Detection: Pattern-Based Abuse Detection

> **Architectural Driver: Financial Accuracy** - While rate limiting (Part 2) controls request **volume**, fraud detection identifies **malicious patterns**. A bot clicking 5 ads/minute might pass rate limits but shows suspicious behavioral patterns. Both mechanisms work together: rate limiting stops volume abuse, fraud detection stops sophisticated attacks.

**What Fraud Detection Does (vs Rate Limiting):**

**Fraud detection** answers: **"Are you malicious?"**
- Bot farm with 95% CTR, uniform timing, rotating IPs → blocked permanently
- Protects advertiser budgets from wasted spend ($500K-1M/year losses)

**Rate limiting** answers: **"Are you requesting too much?"** (see Part 2: Rate Limiting)
- Legitimate advertiser making 10K QPS (vs 1K limit) → throttled with 429
- Protects infrastructure capacity and enforces SLA

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

At 1M+ QPS, checking every request against a blocklist of 100K+ fraudulent IPs requires space-efficient data structures. Bloom filters provide 100× space savings (1.25 MB vs ~128 MB for hash tables) with sub-microsecond lookups and zero false negatives. The 0.01% false positive rate is acceptable - flagged legitimate users pass through to L2 behavioral checks.

$$P_{fp} = \left(1 - e^{-kn/m}\right)^k$$

**Configuration:** 10⁷ bits (1.25 MB), 100K IPs, 7 hash functions → 0.01% false positive rate.

**L2: Behavioral Detection (<5ms latency)**

Sophisticated fraudsters rotate IPs to evade L1. Rule-based heuristics catch ~70% of remaining fraud through weighted scoring:

| Signal | Normal | Suspicious | Weight | Implementation |
|--------|--------|------------|--------|----------------|
| **Click rate** | <10/min | >30/min | 0.4 | Redis sorted sets (ZCOUNT) |
| **CTR** | 1-3% | >50% | 0.25 | Historical click/impression ratio |
| **User agent switching** | 1-2 UAs | 5+ UAs from same IP | 0.2 | Bloom filter per IP |
| **Geo inconsistency** | IP/lang match | US IP + Chinese lang | 0.15 | GeoIP + browser headers |

Composite score >0.6 triggers probabilistic blocking (serve 50% traffic). Each signal computes in <1ms; total overhead ~5ms. ML models (L3) are too slow (20ms+) for synchronous blocking.

**L3: ML-Based Fraud Score (Async, 20ms)**

Gradient Boosted Trees (LightGBM) model with 50+ features: device fingerprint entropy, click timestamp distribution (uniform=bot, bursty=human), network characteristics (ASN, hosting providers), historical fraud rates, engagement metrics (time on page, scroll depth).

**Class imbalance handling (~1% fraud rate):**
- Class weighting (99:1 ratio) to penalize false negatives heavily
- SMOTE oversampling to generate synthetic fraud examples (1% → 10% of training data)

**Deployment:** Runs asynchronously after ad serving (no latency impact). If fraud detected post-facto: refund advertiser, block device.

**Cost optimization:**

$$\text{Cost} = C_{fp} \times FP + C_{fn} \times FN$$

Where \\(C_{fn}\\) (advertiser refund ~$5.00) \\(\gg C_{fp}\\) (lost revenue ~$0.50). Model optimizes for low false negative rate, accepting higher false positives.

### Multi-Region Deployment and Failover

> **Architectural Driver: Availability** - Multi-region deployment with 20% standby capacity ensures we survive full regional outages (1 hour outage = $1M revenue loss). Auto-failover within 90 seconds minimizes impact.

**Why Multi-Region:**

**Business drivers:**

1. **Latency requirements**: Sub-100ms p95 latency is physically impossible with single region serving global traffic. Speed of light: US-East to EU = ~80ms one-way, already consuming 80% of our budget. Regional presence required.

2. **Availability**: Single-region architecture has single point of failure. AWS historical data: major regional outages occur 1-2 times per year, averaging 2-4 hours. Single outage can cost multiple days worth of revenue (context: 2-4 hour regional outage at $1M/hour revenue rate = $2-4M loss for a scaled platform serving 1M QPS).

3. **Regulatory compliance**: GDPR requires EU user data stored in EU. Multi-region enables data locality compliance.

4. **User distribution**: for example 60% US, 20% Europe, 15% Asia, 5% other. Serving from nearest region reduces latency 50-100ms.

**Normal Multi-Region Operation:**

**Region allocation (Active-Passive Model):**

| Region | User Base | Normal Traffic | Role | Capacity |
|--------|-----------|----------------|------|----------|
| US-East-1 | 40% | 400K QPS | Primary US | 100% + 20% standby |
| US-West-2 | 20% | 200K QPS | Secondary US | 100% + 20% standby |
| EU-West-1 | 30% | 300K QPS | EU Primary | 100% + 20% standby |
| AP-Southeast-1 | 10% | 100K QPS | Asia Primary | 100% + 20% standby |

**Deployment model:** Active-passive within region pairs. Each region serves local users (lowest latency), can handle overflow from neighbor region (geographic redundancy), but cannot handle full global traffic (cost prohibitive).

**Trade-off accepted:** 20% standby insufficient for full regional takeover, but enables graceful degradation. Full redundancy (200% capacity per region) would triple infrastructure costs.

**Traffic Routing & DNS:**

**Global load balancing:** AWS Route53 with geolocation-based routing + health checks.

**Normal operation:**
- User in New York → routed to US-East-1 (10-15ms latency)
- User in London → routed to EU-West-1 (5-10ms latency)
- User in Singapore → routed to AP-Southeast-1 (8-12ms latency)

**Health check mechanism:**

```
Route53 Health Check Configuration:
- Protocol: HTTPS
- Path: /health/deep (checks database connectivity, not just "alive")
- Interval: 30 seconds (Standard, $0.50/month) or 10 seconds (Fast, $1.00/month)
- Failure threshold: 3 consecutive failures
- Health checkers: 15+ global endpoints
- Decision: Healthy if ≥18% of checkers report success
```

**Failover trigger:** When health checks fail for 90 seconds (3 × 30s interval), Route53 marks region unhealthy and returns secondary region's IP for DNS queries.

**DNS TTL impact:** Set to 60 seconds. After failover triggered, new DNS queries immediately return healthy region, existing client DNS caches expire within 60s (50% of clients fail over in 30s, 95% within 90s).

**Why 60s TTL:** Balance between fast failover and DNS query load. Lower TTL (10s) = 6× more DNS queries hitting Route53 nameservers. At high query volumes, this increases costs ($0.40 per million queries), but the primary concern is cache efficiency - shorter TTLs mean resolvers cache records for less time, reducing effectiveness of DNS caching infrastructure.

**Health check vs TTL costs:** Note that health check intervals (10s vs 30s) have different pricing: $1.00/month vs $0.50/month per check. The 6× query multiplier applies to DNS resolution, not health checks.

**Data Replication Strategy:**

**CockroachDB (Billing Ledger, User Profiles):**

Multi-region deployment with 5 replicas distributed across regions:

```
Table: billing_ledger
Replicas: 5 (2 in US-East, 1 in US-West, 1 in EU-West, 1 in AP-Southeast)
Survival goal: "zone" (survives AZ failure)
Leaseholder preference: "closest" (reads hit nearest replica)
```

**Why 5 replicas:** Survives any single region failure with quorum (5 → 3 remain). Write quorum = 3 replicas, so can lose up to 2.

**Write path:** Write acknowledged when 3/5 replicas confirm (Raft consensus). Typical cross-region write latency: 50-150ms (dominated by inter-region network).

**Read path:** Served by nearest replica with bounded staleness (default: 4.8s max staleness for follower reads). Strong-consistency reads go to leaseholder.

**Redis (Budget Pre-Allocation, User Sessions):**

**CRITICAL ARCHITECTURAL DECISION:** Redis does NOT replicate across regions in this design.

**Why no cross-region Redis replication:**
1. **Latency**: Redis replication is synchronous or asynchronous. Synchronous = 50-100ms write latency (violates our <1ms budget enforcement requirement). Asynchronous = data loss during failover.
2. **Complexity**: Redis Cluster cross-region replication requires custom solutions (RedisLabs, custom scripts).
3. **Acceptable trade-off**: Budget pre-allocations are already bounded loss (see below).

**Each region has independent Redis:**
- US-East Redis: Stores budget pre-allocations for campaigns served in US-East
- EU-West Redis: Independent budget allocations for EU campaigns
- No cross-region replication

**Data Consistency During Regional Failover (CRITICAL):**

**The Budget Counter Problem:** When US-East fails, what happens to budget allocations stored in US-East Redis?

**Example scenario:**
- Campaign daily budget: $10,000
- US-East pre-allocated: $3,000 (stored in US-East Redis)
- US-West pre-allocated: $4,000 (stored in US-West Redis)
- EU-West pre-allocated: $3,000 (stored in EU-West Redis)
- US-East fails at 2pm, having spent $1,500 of its $3,000

**What happens:**

1. **Immediate impact:** $1,500 remaining in US-East Redis is lost (region unavailable)
2. **US-West takes over US-East traffic:** Continues spending from its own $4,000 allocation
3. **Bounded over-delivery:** Max over-delivery = lost US-East allocation = $1,500
4. **Percentage impact:** $1,500 / $10,000 = **15% over-delivery** (exceeds our 1% target!)

**Mitigation: CockroachDB-backed allocation tracking (implemented)**

Every 60 seconds, each region writes actual spend to CockroachDB:

```sql
-- US-East writes every 60s (while healthy)
UPDATE campaign_budget
SET us_east_allocated = 3000,
    us_east_spent = 1500,
    last_heartbeat_us_east = now()
WHERE campaign_id = 'camp_123';
```

**Failover recovery process:**

1. **T+0s:** US-East fails
2. **T+90s:** Health checks trigger failover, US-West starts receiving US-East traffic
3. **T+120s:** Budget Controller detects US-East heartbeat timeout (last write was 120s ago)
4. **T+120s:** Budget Controller reads last known state from CockroachDB:
   - US-East allocated: $3,000
   - US-East spent: $1,500 (written 120s ago)
   - Remaining (uncertain): ~$1,500
5. **T+120s:** Budget Controller marks US-East allocation as "failed" and removes from available budget
6. **Result:** $1,500 locked but not over-delivered

**Bounded under-delivery:** Max under-delivery = unspent allocation in failed region = $1,500 = 15% of budget.

**Why under-delivery is acceptable:**
- Advertiser complaint: "I paid for $10K, only got $8.5K" → refund $1.5K
- Better than over-delivery: "I paid for $10K, you charged me $11.5K" → lawsuit

**Failure Scenario: US-East Regional Outage**

**Scenario:** Primary region (US-East) fails, handling 40% of traffic. What happens?

**Failover Timeline:**

<style>
#tbl_7 + table th:first-of-type  { width: 10%; }
#tbl_7 + table th:nth-of-type(2) { width: 45%; }
#tbl_7 + table th:nth-of-type(3) { width: 45%; }
</style>
<div id="tbl_7"></div>

| Time | Event | System State |
|------|-------|--------------|
| T+0s | Health check failures detected | DNS TTL delay (60s) |
| T+30s | 3× traffic hits US-West | CPU: 40%→85%, standby activated |
| T+60s | Auto-scaling triggered | Provisioning new capacity |
| T+90s | Cache hit degradation | Latency p95: 100ms→150ms |
| T+90s | Route53 marks US-East unhealthy | DNS failover begins |
| T+120s | Budget Controller locks US-East allocations | Under-delivery protection active |
| T+150-180s | New instances online | Capacity restored (90-120s provisioning delay) |

**Why 20% Standby is Insufficient:**

The timeline above shows a critical problem: from T+30s to T+180s (up to 150 seconds), US-West is severely overloaded. To understand why, we need queueing theory.

**Capacity Analysis:**

Server utilization in queueing theory:
$$\rho = \frac{\lambda}{c \mu}$$

where:
- \\(\lambda\\) = arrival rate (requests per second)
- \\(c\\) = number of servers
- \\(\mu\\) = service rate per server
- \\(\rho\\) = utilization (0 to 1+ scale)

**Critical thresholds:**
- \\(\rho < 0.8\\): Stable operation, reasonable queue lengths
- \\(0.8 < \rho < 1.0\\): Queues grow, latency increases
- \\(\rho \geq 1.0\\): System unstable, queues grow unbounded

**Normal operation (US-West):**
- Traffic: 200K QPS
- Capacity: 300K QPS (with 20% standby)
- \\(\rho = 200K / 300K = 0.67\\) ✓ Stable

**During US-East failure (US-West receives 40% of total traffic):**
- Traffic: 200K + 400K = 600K QPS
- Capacity: 300K QPS (20% standby already activated)
- \\(\rho = 600K / 300K = 2.0\\) ✗ Severe overload

**Auto-scaling limitations:** Kubernetes HPA triggers at T+60s, but provisioning new capacity takes **90-120 seconds** for GPU-based ML inference nodes (instance boot + model loading into VRAM), as detailed in Part 6. During this window, the system operates at 2× over capacity, making graceful degradation essential.

**Mitigation: Graceful Degradation + Load Shedding**

> **Architectural Driver: Availability** - During regional failures, graceful degradation (serving stale cache, shedding low-value traffic) maintains uptime while minimizing revenue impact. Better to serve degraded ads than no ads.

The system employs a two-layer mitigation strategy detailed in Part 2:

**Layer 1: Service-Level Degradation (Circuit Breakers)**
1. **ML Inference**: Switch to cached CTR predictions (-8% revenue impact)
2. **User Profiles**: Serve stale cache with 5-minute TTL (-5% impact)
3. **RTB Auction**: Reduce to top 20 DSPs only (-6% impact)

**Layer 2: Load Shedding (Utilization-Based)**

When utilization exceeds capacity despite degradation:

| Utilization | Action | Logic |
|-------------|--------|-------|
| <70% | Accept all | Normal operation |
| 70-90% | Accept all + degrade services | Circuit breakers active, auto-scaling triggered |
| >90% | Value-based shedding | Accept high-value (>P95), reject 50% of low-value |

**Combined impact during regional failover:**
- Service degradation: ~27% revenue reduction (see Part 2 Circuit Breaker section for details)
- Load shedding (if needed): Reject 47.5% of lowest-value traffic, preserve 97.5% of remaining revenue
- **Net result**: System stays online, handles capacity constraint within 90-120s auto-scaling window

**Failback Strategy:**

After US-East recovers, gradual traffic shift back:

**Automated steps:**

1. **T+0:** US-East infrastructure restored, health checks start passing
2. **T+5min:** Route53 marks US-East healthy again, BUT weight set to 0%
3. **T+5min:** Manual verification: Engineering team checks metrics, error rates
4. **T+10min:** Traffic ramp begins: 5% → 10% → 25% → 50% → 100% over 30 minutes
5. **T+40min:** Full traffic restored to US-East

**Manual gates:** Failback is semi-automatic. Requires manual approval at each stage to prevent cascade failures.

**Data reconciliation:**

CockroachDB: Already consistent (Raft consensus maintained across regions). Redis: Rebuild from scratch (Budget Controller re-allocates budgets based on CockroachDB source of truth, cold cache for 10-20 minutes).

**Why gradual failback:** Prevents "split-brain" scenario where both regions think they're primary.

**Cost Analysis: Multi-Region Economics**

**Infrastructure cost multipliers:**

| Component | Single Region | Multi-Region (4 regions) | Multiplier |
|-----------|---------------|--------------------------|------------|
| Compute (ad servers, ML) | Baseline | 3× baseline | 3× |
| CockroachDB (5 replicas) | Baseline | 3× baseline | 3× |
| Redis (per region) | Baseline | 3× baseline | 3× |
| Cross-region data transfer | $0 | 30% of baseline | ∞ (new cost, e.g., $0.02/GB) |
| Route53 (health checks) | Baseline | 3× baseline | 3× |
| **Total** | **Baseline** | **3.3× baseline** | **3.3×** |

**Cross-region data transfer breakdown:**
- CockroachDB replication: 5 replicas × request volume × average payload size
- Metric/log aggregation: Centralized monitoring across regions
- Backup replication: Cross-region redundancy

**Key cost drivers:**
- **Linear scaling (3×)**: Compute, databases, cache replicate fully per region
- **New cost category**: Cross-region data transfer (~30% of baseline compute costs)
- **Marginal costs**: DNS health checks scale linearly but are negligible

**Economic justification:**

Single region annual risk:
- Regional outages: 1-2 per year (AWS historical average)
- Average duration: 2-4 hours
- Expected availability: 99.8-99.9% (excludes regional outages)

Multi-region availability: 99.99%+ (survives full regional failures)

**Trade-off analysis:**
- Multi-region additional cost: **2.3× baseline annual infrastructure cost**
- Benefits: +0.1-0.2% availability improvement, 50-100ms latency reduction for international users, GDPR compliance
- Break-even: Multi-region pays off if single regional outage costs exceed 2.3× annual infrastructure baseline

**Intangible benefits:**
- Reputation protection (uptime matters for advertiser trust)
- Regulatory compliance (GDPR data locality requirements)
- Competitive advantage (global latency consistency)

**Decision:** Multi-region worth the 3.3× cost multiplier for platforms where revenue rate justifies availability investment.

**Note on cost multiplier:** The 3.3× figure represents infrastructure duplication (3-4 regions with some shared services) plus cross-region data transfer overhead. Industry patterns show 1.3-2× for dual-region setups; 4-region active-passive architecture with shared control plane extrapolates to 3-3.5× based on documented cost drivers.

**Capacity conclusion:** 20% standby insufficient for immediate regional takeover, but combined with auto-scaling (90-120s) and graceful degradation, provides cost-effective resilience. Alternative (200% over-provisioning per region) would reach 8-10× baseline costs. Trade-off: Accept degraded performance and bounded under-delivery during rare regional failures rather than excessive capacity overhead.

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
- Engineering cost: \~2 Senior/Staff engineers × 8 weeks = 16 engineer-weeks (0.3-0.4 engineer-years fully loaded)
- Associated costs: test infrastructure, code review, PM coordination
- Risk: Low (gradual rollout, extensive validation, rollback safety)

**Option B: Maintenance window migration**
- Duration: 12-hour downtime window (optimistic - could be 24+ hours if issues arise)
- Engineering cost: ~1 engineer × 2 weeks prep + 12 hours execution
- Revenue loss: 12-24 hours of complete downtime = **12-24 days worth of revenue** (For scaled platforms: 1M QPS, $1M/hour revenue rate = $12-24M loss. Smaller platforms: scale proportionally.)

**Decision:** Zero-downtime migration cost (0.3-0.4 engineer-years) << downtime cost (weeks of revenue) by **40-70×**.

The exact multiplier depends on your revenue rate and engineering costs, but the conclusion holds across wide ranges: for high-traffic revenue-generating systems, zero-downtime migrations are economically justified despite higher engineering complexity.

### Distributed Clock Synchronization and Time Consistency

> **Architectural Driver: Financial Accuracy** - Clock skew across regions can cause budget double-allocation or billing disputes. HLC + bounded allocation windows guarantee deterministic ordering for financial transactions.

**Problem:** Multi-region systems require accurate timestamps for budget tracking and billing reconciliation. Clock drift (1-50ms/day per server) causes billing disputes, budget race conditions, and causality violations. Without synchronization, 1000 servers can diverge by 50s in one day.

**Solution Spectrum: NTP → PTP → Global Clocks**

| Technology | Accuracy | Cost | Use Case |
|------------|----------|------|----------|
| **NTP**<br/>Network Time Protocol | ±50ms (public),<br/>±10ms (local) | Free | General-purpose time sync |
| **PTP**<br/>Precision Time Protocol | ±100μs | Medium (hardware switches) | High-frequency trading, telecom |
| **GPS-based Clocks** | ±1μs | High<br/>(GPS receivers per rack) | Critical infrastructure |
| **Google Spanner<br/>TrueTime** | ±7ms<br/>(bounded uncertainty) | Very high (proprietary) | Global strong consistency |
| **AWS Time Sync Service** | <100μs (0.1ms)<br/>Legacy: ±1ms | Free (on AWS) | Cloud deployments (upgraded 2023+) |

**Multi-tier time synchronization:**

**Tier 1 - Event Timestamping:** AWS Time Sync (<100μs, free). Network latency (20-100ms) dwarfs clock skew, making NTP sufficient for impressions/clicks.

**Tier 2 - Financial Reconciliation:** CockroachDB built-in HLC provides automatic globally-ordered timestamps: \\(HLC = (t_{physical}, c_{logical}, id_{node})\\). Guarantees causality preservation (if A→B then HLC(A) < HLC(B)) and deterministic ordering via logical counters + node ID tie-breaking.

**Clock skew mitigation:** Create 200ms "dead zone" at day boundaries (23:59:59.900 to 00:00:00.100) where budget allocations are forbidden. Prevents regions with skewed clocks from over-allocating across day boundaries.

**Architecture decision:** AWS Time Sync (±1ms, free) + CockroachDB built-in HLC. Google Spanner's TrueTime (±7ms) not worth complexity given 20-100ms network variability.

**Advantage:** Eliminates ~150 lines of custom HLC code, provides battle-tested clock synchronization.

**Monitoring:** Alert if clock offset >100ms, HLC logical counter growth >1000/sec sustained, or budget discrepancy >0.5% of daily budget.

### Global Event Ordering for Financial Ledgers: The External Consistency Challenge

> **Architectural Driver: Financial Accuracy** - Financial audit trails require globally consistent event ordering across regions. CockroachDB's HLC-timestamped billing ledger provides near-external consistency, ensuring that events are ordered chronologically for regulatory compliance, while PostgreSQL serves only as cold archive.

**The Problem: Global Event Ordering**

Budget pre-allocation (Redis) solves fast local enforcement, but billing ledgers require globally consistent event ordering across regions. Without coordinated timestamps, audit trails can show incorrect event sequences.

**Example:** US-East allocates $100 (T1), EU-West spends $100 exhausting budget (T2). Separate PostgreSQL instances using local clocks might timestamp T1 after T2 due to clock skew, showing wrong ordering in audit logs.

**Solution: CockroachDB HLC-Timestamped Ledger**

CockroachDB provides near-external consistency using Hybrid Logical Clocks: $$HLC = (pt, c)$$ where pt = physical time, c = logical counter.

**Guarantee:** Causally related transactions get correctly ordered timestamps via Raft consensus. Independent transactions within ±100ms uncertainty window may have ambiguous ordering, but this is acceptable - network latency (50-150ms) already dominates, and causally related events (same campaign) are correctly ordered.

**Requirements met:**
- SOX/MiFID regulatory compliance (chronologically ordered financial records, 5-7 year retention)
- Legal dispute resolution ("Did impression X happen before budget exhaustion?")
- Audit trail correctness for billing reconciliation

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

1. **Real-time spend** (1M QPS): Redis DECRBY on pre-allocated budgets (<1ms)
2. **Periodic reconciliation** (5min): Flush Redis deltas to CockroachDB with automatic HLC timestamps
3. **Nightly archival**: Export 90-day-old records to PostgreSQL/S3 Glacier (7-year retention)

**Cost Analysis:**

| Component | Technology | Relative Cost |
|-----------|-----------|---------------|
| Fast path | Redis Cluster (20 nodes) | 16-20% |
| Billing ledger (90-day hot) | CockroachDB (60-80 nodes) | 75-80% |
| Cold archive (7-year) | PostgreSQL + S3 Glacier | 4-5% |
| **Total financial storage** | | **100% baseline** |

**Build vs Buy:** Custom PostgreSQL + HLC implementation costs 1-1.5 engineer-years (6 engineer-months) plus ongoing maintenance. CockroachDB's premium (20-30% of financial storage baseline) eliminates upfront engineering cost and operational burden.

## Part 8: Observability and Operations

{% part_toc(prev_part="Part 7: Advanced Topics", next_part="Part 9: Security and Compliance") %}
<ul>
<li><a href="#service-level-indicators-and-objectives">Service Level Indicators and Objectives</a>
<span class="part-toc-desc">SLI/SLO definitions, availability targets, latency percentiles</span></li>
<li><a href="#incident-response-dashboard">Incident Response Dashboard</a>
<span class="part-toc-desc">Real-time monitoring, alert aggregation, runbook automation</span></li>
<li><a href="#distributed-tracing">Distributed Tracing</a>
<span class="part-toc-desc">Request tracing, latency attribution, performance debugging</span></li>
</ul>
{% end %}

### Service Level Indicators and Objectives

**Key SLIs:**

<style>
#tbl_key_slis + table th:first-of-type  { width: 15%; }
#tbl_key_slis + table th:nth-of-type(2) { width: 20%; }
#tbl_key_slis + table th:nth-of-type(3) { width: 30%; }
#tbl_key_slis + table th:nth-of-type(4) { width: 35%; }
</style>
<div id="tbl_key_slis"></div>

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

Effective incident response requires immediate access to:

**SLO deviation metrics** - Latency (p95, p99) and error rate vs targets to determine severity

**Resource utilization** - CPU/GPU/memory metrics plus active configuration (model versions, feature flags) to distinguish capacity from configuration issues

**Dependency breakdown** - Per-service latency (cache, database, ML, external APIs) to isolate the actual bottleneck

**Historical patterns** - Similar past incidents and time-series showing when degradation began

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

---

## Part 9: Security and Compliance

{% part_toc(prev_part="Part 8: Observability and Operations", next_part="Part 10: Production Operations at Scale") %}
<ul>
<li><a href="#data-lifecycle-and-gdpr">Data Lifecycle and GDPR</a>
<span class="part-toc-desc">User data retention, right to deletion, compliance automation</span></li>
</ul>
{% end %}

**Service-to-Service Authentication: Zero Trust with mTLS**

In distributed systems with 50+ microservices, network perimeters are insufficient. Solution: **mutual TLS (mTLS)** via Istio service mesh.

Every service receives a unique X.509 certificate (24-hour TTL) from Istio CA via SPIFFE/SPIRE. Envoy sidecar proxies automatically handle certificate rotation, mutual authentication, and traffic encryption - transparent to application code. All plaintext connections are rejected.

**Authorization policies** enforce least-privilege access:
- Ad Server → ML Inference: Allowed
- Ad Server → Budget Database: Blocked (must use Budget Controller)
- External DSPs → Internal Services: Blocked (terminate at gateway)

Defense in depth: Even if network segmentation fails, attackers cannot decrypt inter-service traffic, impersonate services, or call unauthorized endpoints.

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

Training pipeline validates incoming events before model training:
1. **CTR anomaly detection**: Quarantine events with >3σ CTR spikes (e.g., 2%→8%)
2. **IP entropy check**: Flag low-diversity IP clusters (<2.0 entropy = botnet)
3. **Temporal patterns**: Detect uniform timing intervals (human=bursty, bot=mechanical)

**Model integrity**: GPG-signed models prevent loading tampered artifacts. Inference servers verify signatures before loading models, rejecting invalid signatures with immediate alerting.

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

## Part 10: Production Operations at Scale

{% part_toc(prev_part="Part 9: Security and Compliance", next_part="Part 11: Resilience and Failure Scenarios") %}
<ul>
<li><a href="#deployment-safety-and-zero-downtime-operations">Deployment Safety and Zero-Downtime Operations</a>
<span class="part-toc-desc">Canary releases, blue-green deployments, rollback strategies</span></li>
<li><a href="#error-budgets-balancing-velocity-and-reliability">Error Budgets: Balancing Velocity and Reliability</a>
<span class="part-toc-desc">SLO-based development velocity, incident attribution</span></li>
<li><a href="#cost-management-at-scale">Cost Management at Scale</a>
<span class="part-toc-desc">Resource attribution, chargeback models, efficiency metrics</span></li>
</ul>
{% end %}

### Deployment Safety and Zero-Downtime Operations

**The availability imperative:** With 99.9% SLO providing only 43 minutes/month error budget, we cannot afford to waste any portion on **planned** downtime. All deployments and schema changes must be zero-downtime operations.

**Progressive deployment strategy:**

Rolling deployments (canary → 10% → 50% → 100%) with automated gates on error rate, latency p99, and revenue metrics. Each phase must pass health checks before proceeding. Feature flags provide blast radius control - new features start dark, gradually enabled per user cohort.

**Zero-downtime schema migrations:**

Database schema changes consume zero availability budget through online DDL operations:

- **Simple changes** (ADD COLUMN, CREATE INDEX): CockroachDB's online schema changes with background backfill
- **Complex restructuring** (partition changes): Dual-write pattern with gradual cutover (detailed in Part 7: Schema Evolution section)
- **Validation**: Shadow reads verify new schema correctness before cutover

The cost trade-off is clear: zero-downtime migrations require 2-4× more engineering effort than "take the system down" approaches, but protect against wasting the precious 43-minute availability budget on planned maintenance.

**Key insight:** The 43 minutes/month error budget is reserved for **unplanned** failures (infrastructure outages, cascading failures, external dependency failures). Planned operations (deployments, migrations, configuration changes) must never consume this budget.

### Error Budgets: Balancing Velocity and Reliability

Error budgets formalize the trade-off between reliability and feature velocity. For a 99.9% availability SLO, the error budget is 43.2 minutes/month of **unplanned** downtime.

$$\text{Error Budget} = (1 - 0.999) \times 30 \times 24 \times 60 = 43.2 \text{ minutes/month}$$

**Budget allocation strategy (unplanned failures only):**

| Source | Allocation | Rationale |
|--------|-----------|-----------|
| Infrastructure failures | 15 min (35%) | Cloud provider incidents, hardware failures, regional outages |
| Dependency failures | 12 min (28%) | External DSP timeouts, third-party API issues |
| Code defects | 8 min (19%) | Bugs escaping progressive rollout gates |
| Unknown/buffer | 8 min (18%) | Unexpected failure modes, cascading failures |

**Note:** Planned deployments and schema migrations target zero downtime through progressive rollouts and online DDL operations. When deployment-related issues occur (e.g., bad code pushed past canary gates), they count against "Code defects" budget.

**Burn rate alerting:**

Monitor how quickly budget is consumed. Burn rate = current error rate / target error rate. A 10× burn rate means exhausting the monthly budget in ~3 hours, triggering immediate on-call escalation.

**Policy-driven decision making:**

Error budget remaining drives release velocity:

- **>75% remaining**: Ship aggressively, run experiments, test risky features
- **25-75% remaining**: Normal operations, standard release cadence
- **<25% remaining**: Freeze non-critical releases, focus on reliability
- **Exhausted**: Code freeze except critical fixes, mandatory postmortems

**Why 99.9% not 99.99%?**

With zero-downtime deployments and migrations eliminating **planned** downtime, the 99.9% SLO (43 minutes/month) is entirely allocated to **unplanned** failures. Moving to 99.99% (4.3 minutes/month) would reduce our tolerance for unplanned failures from 43 to 4.3 minutes - a 10× tighter constraint.

This requires multi-region active-active with automatic failover (approximately doubling infrastructure costs) to achieve sub-minute recovery from regional outages. The economic question: is tolerating 39 fewer minutes of unplanned failures worth doubling infrastructure spend?

For advertising platforms with client-side retries and geographic distribution, the answer is typically no. Brief regional outages have limited revenue impact due to automatic retries and traffic redistribution. Better ROI comes from reducing MTTR (faster detection and recovery) than preventing all failures.

The tolerance for unplanned failures varies by domain - payment processing or healthcare systems require 99.99%+ because every transaction matters. Ad platforms operate at higher request volumes where statistical averaging and retries provide natural resilience.

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

## Conclusion: Known gaps and Missing Topics

Despite extensive coverage, several important areas were not explored in depth:

**1. A/B Testing and Experimentation Platform**
Statistical rigor for auction mechanism changes, feature rollouts, and ML model testing. Statistical power calculations, early stopping criteria, multi-armed bandits for automatic winner selection, and feature flag infrastructure for gradual rollouts.

**2. Capacity Planning and Predictive Autoscaling**
Mathematical models for forecasting resource needs during traffic spikes (Black Friday, Super Bowl). Cost trade-offs: over-provisioning waste vs revenue loss from under-provisioning. Predictive scaling vs reactive scaling latency.

**3. Chaos Engineering and Resilience Validation**
Systematic testing of failure scenarios claimed throughout this design. Controlled fault injection (kill Redis nodes, partition networks), blast radius measurement, validating actual MTTR vs theoretical calculations.

**4. Multi-Tenancy and Resource Isolation**
Preventing one advertiser's traffic spike from starving another's campaigns. CPU/memory quotas per tenant, noisy neighbor detection in shared Redis clusters, QoS enforcement at the platform level.

**5. Geographic Load Balancing and Traffic Steering**
DNS-based routing (Route53 latency-based policies), anycast for edge deployments, orchestrating regional failovers. Differs from Part 7's multi-region deployment by focusing on traffic routing intelligence.

**6. Backpressure and Admission Control**
Load shedding strategies beyond circuit breakers. Rejecting requests at the edge when backend capacity is saturated, graceful degradation coordination across services, preventing cascading overload.

**7. Data Lineage and Root Cause Analysis**
When ML predictions are wrong, how to trace feature staleness backward through Kafka→Flink→Redis→inference. Critical for debugging "why did this ad perform poorly?" in production.

**8. Disaster Recovery Testing and Validation**
RPO/RTO analysis, backup verification strategies, automated failover drills. How to validate that the multi-region architecture actually works during regional failures without waiting for AWS to have an outage.

---

## Final Thoughts

This 3 weeks learning exercise reinforced a fundamental truth: **everything is a trade-off with a price tag**. There's no "best" solution - only "best given constraints and costs."

If you've made it this far, thanks for reading. This was a mental exercise in systems thinking and cost optimization - treating distributed systems design like an extended puzzle. Better than sudoku, arguably.

**I'd love your feedback** - what I got wrong, what I missed, or alternative approaches. Found a calculation error? Have battle stories about cache sizing? Want to debate 99.9% vs 99.99% trade-offs? **[💭 Join the discussion on GitHub](https://github.com/immediatus/immediatus.github.io/discussions/)**. Let's optimize the cost function of learning together.
