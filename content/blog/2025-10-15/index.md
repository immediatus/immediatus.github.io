+++
authors = [ "Yuriy Polyulya" ]
title = "Architecting Real-Time Ads Platforms: A Distributed Systems Engineer's Design Exercise"
description = "A design exploration of building real-time ads platforms serving 400M+ users with 150ms p95 latency. Applying distributed systems principles to RTB protocols, ML inference pipelines, auction algorithms, and resilience patterns - a thought experiment in solving complex distributed systems challenges."
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

Full disclosure: I've never built an ads platform before. This is a design exercise - my way of keeping the brain engaged with complex systems thinking. Think of it as a more interesting alternative to sudoku, except instead of filling in numbers, I'm optimizing auction latencies and cache hit rates.

What makes ad platforms compelling: every click has measurable value, every millisecond of latency has quantifiable revenue impact. A user opens an app, sees a relevant ad in under 150ms, clicks it, and the advertiser gets billed. Simple? Not when you're coordinating real-time auctions across 50+ bidding partners with 100ms timeouts, running ML predictions in <40ms, and handling 1M+ queries per second.

**Target scale:**
- **400M+ daily active users** generating continuous ad requests
- **1M+ queries per second** during peak traffic (with **1.5M QPS platform capacity** - 50% headroom for burst traffic and regional failover)
- **150ms p95 latency** for the entire request lifecycle
- **Real-time ML inference** for click-through rate prediction
- **Distributed auction mechanisms** coordinating with 50+ external bidding partners
- **Multi-region deployment** with eventual consistency challenges

**What this post covers:** Requirements modeling, high-level architecture and latency budgets, RTB integration (OpenRTB is... interesting), ML inference pipelines, distributed caching, auction mechanisms, budget pacing, fraud detection, multi-region failover, and what breaks and why.

Fair warning: I'm going to dive deep into the math and trade-offs. My goal is to show not just the "what" but the "why" behind design decisions.

**Acknowledgment:** This took 3 weeks of learning, researching, and writing. I used AI assistants extensively as research tools to compress domain research from weeks to days. Given the scope (4000+ lines covering distributed systems, ML pipelines, auction algorithms, financial compliance), expect inconsistencies and heavily opinionated choices. Ironically, for a post about optimization, this one's pretty unoptimized - verbose, repetitive, twice as long as it needs to be. That's what happens when you learn while writing.

**Note on costs:** All cost figures are rough approximations to illustrate relative differences, not exact pricing. Always check current vendor pricing.

Before diving into the architecture, let's establish a common vocabulary. The ad tech industry uses specialized terminology that can be confusing for engineers new to the domain.

## Glossary - Ad Industry Terms

**Programmatic Advertising:** Automated buying and selling of ad inventory through real-time auctions. Contrasts with direct sales (guaranteed deals with fixed pricing).

**SSP (Supply-Side Platform):** Platform that publishers use to sell ad inventory. Runs auctions and connects to multiple DSPs to maximize revenue.

**DSP (Demand-Side Platform):** Platform that advertisers/agencies use to buy ad inventory across multiple publishers. Examples: Google DV360, The Trade Desk, Amazon DSP.

**RTB (Real-Time Bidding):** Programmatic auction protocol where ad impressions are auctioned in real-time (~100ms) as users load pages/apps. Each impression triggers a bid request to multiple DSPs.

**OpenRTB:** Industry standard protocol (maintained by IAB Tech Lab) defining the format for RTB communication. Current version: 2.6. Specifies JSON/HTTP format for bid requests and responses.

**IAB (Interactive Advertising Bureau):** Industry trade organization that develops technical standards (OpenRTB, VAST, VPAID) and provides viewability guidelines for digital advertising.

**Pricing Models:**
- **CPM (Cost Per Mille):** Cost per 1000 impressions. Most common model. Example: $5 CPM = advertiser pays $5 for every 1000 ad views.
- **CPC (Cost Per Click):** Advertiser pays only when users click the ad. Risk shifts to publisher (no clicks = no revenue).
- **CPA (Cost Per Action/Acquisition):** Advertiser pays only for conversions (app installs, purchases). Highest risk for publisher.

**eCPM (Effective Cost Per Mille):** Metric that normalizes different pricing models (CPM/CPC/CPA) to "revenue per 1000 impressions" for comparison. Formula: `eCPM = (Total Earnings / Total Impressions) × 1000`. Used to rank ads fairly in auctions.

**CTR (Click-Through Rate):** Percentage of ad impressions that result in clicks. Formula: `CTR = (Clicks / Impressions) × 100`. Typical range: 0.5-2% for display ads. Critical for converting CPC bids to eCPM.

With the terminology established, let's define what we're actually building: the functional and non-functional requirements that will drive our architectural decisions.

## Part 1: Requirements and Constraints

{% part_toc(prev_part="Glossary - Ad Industry Terms", next_part="Part 2: High-Level Architecture") %}
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

This is where things get interesting. You're implementing OpenRTB 2.5+ (or whatever version is current), talking to 50+ demand-side platforms (DSPs - the external bidding partners who represent advertisers and bid on ad inventory) simultaneously. Industry standard RTB timeouts range from 100-200ms (Google AdX uses ~100ms, some exchanges allow up to 250ms), with most platforms targeting 100ms for the auction to balance revenue (more bidders = more competition) with user experience. Even with 100ms, you need to do 50+ network calls in parallel - and if you think that's easy, wait until you discover that some DSPs are in Europe, some are in Asia, and suddenly you're trying to do a 100ms global auction with 150ms round-trip times to some bidders.

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

**Driver 1: Latency (150ms p95 end-to-end)**

**Why this matters:** Mobile apps typically timeout after 150-200ms. Users expect ads to load instantly - if your ad is still loading when the page renders, you show a blank space and earn $0.

Amazon's 2006 study found that every 100ms of added latency costs ~1% of sales[^amazon-latency]. In advertising, this translates directly: slower ads = fewer impressions = less revenue.

At our target scale of 1M queries per second, breaching the 150ms timeout threshold means mobile apps give up waiting, resulting in blank ad slots and complete revenue loss on those requests.

**The constraint:** Maintain 150ms p95 end-to-end latency for the complete request lifecycle - from when the user opens the app to when the ad displays.

**Driver 2: Financial Accuracy (Zero Tolerance)**

**Why this matters:** Advertising is a financial transaction. When an advertiser sets a $10,000 campaign budget, they expect to spend $10,000 - not $10,500 or $9,500.

Billing discrepancies above 2-5% are considered material in industry practice and can trigger lawsuits and advertiser disputes. Even 1% errors generate complaints and credit demands. Beyond legal risk, billing errors destroy advertiser trust - your platform's reputation depends on financial accuracy.

While regulatory frameworks (FTC in the US, Digital Services Act in EU) mandate transparent billing and prohibit deceptive practices, the specific billing accuracy thresholds (≤1% target, <2% acceptable, >5% problematic) are driven by **industry best practices** and contractual SLAs rather than explicit regulatory mandates.

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
$$P(\text{Latency} \leq 150\text{ms}) \geq 0.95$$

So this means 95% of requests need to finish within 150ms. The tricky part is that total latency is the sum of all the services in the request path:

$$T_{total} = \sum_{i=1}^{n} T_i$$

where \\(T_i\\) is the latency of each service. With Real-Time Bidding (RTB) requiring 100-120ms for external DSP responses (industry standard per OpenRTB implementations), plus internal services (ML inference, user profile, ad selection), the 150ms budget requires careful allocation.

Strict latency budgets are critical: incremental service calls ("only 10ms each") compound quickly. The 150ms SLO aligns with industry standard RTB timeout (100-120ms) while maintaining responsive user experience.

**Latency Budget Breakdown:**
- **Total end-to-end SLO:** 150ms p95
- **Internal services budget:** ~50ms (network, gateway, user profile, ad selection)
- **RTB external calls:** ~100ms (industry standard timeout)
- **ML inference:** ~40ms (GPU model serving)

The 150ms total accommodates industry-standard RTB timeout (100ms) while maintaining responsive user experience. Internal services are optimized for <50ms to leave budget for external DSP calls.

**RTB Latency Reality Check:** The 100ms RTB budget is materially aggressive given global network physics (NY-London: 60-80ms RTT, NY-Asia: 200-300ms RTT). Achieving this requires multi-tier optimization: (1) **Geographic sharding** - regional ad server clusters call geographically-local DSPs only (15-25ms RTT), (2) **Dynamic bidder health scoring** - de-prioritize or skip consistently slow/low-value DSPs before making requests, (3) **Adaptive early termination** - 50-70ms operational target with progressive timeouts and 100ms as absolute fallback. Without these optimizations, global DSP calls would routinely exceed 100ms (see Part 3: RTB Geographic Sharding for detailed architecture).

**Throughput Requirements:**

Target peak load:
$$Q_{peak} \geq 1.5 \times 10^6 \text{ QPS}$$

Using Little's Law to relate throughput, latency, and concurrency. With service time \\(S\\) and \\(N\\) servers:
$$N = \frac{Q_{peak} \times S}{U_{target}}$$

where \\(U_{target}\\) is target utilization. This fundamental queueing theory relationship helps us understand the capacity needed to handle peak traffic while maintaining acceptable response times.

**Availability Constraint:**

Target "three nines" (99.9% uptime):
$$A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \geq 0.999$$

where MTBF = Mean Time Between Failures, MTTR = Mean Time To Recovery.

This translates to **43 minutes** of allowed downtime per month. Through zero-downtime deployments (detailed in Part 10), we eliminate **planned** downtime entirely, reserving the full error budget for **unplanned** failures.

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
<span class="part-toc-desc">Breaking down 150ms budget across services</span></li>
<li><a href="#rate-limiting-volume-based-traffic-control">Rate Limiting: Volume-Based Traffic Control</a>
<span class="part-toc-desc">Token bucket, QPS limits, backpressure</span></li>
<li><a href="#critical-path-and-dual-source-architecture">Critical Path and Dual-Source Architecture</a>
<span class="part-toc-desc">Request flow, parallel execution, timing analysis</span></li>
<li><a href="#resilience-graceful-degradation-and-circuit-breaking">Resilience: Graceful Degradation and Circuit Breaking</a>
<span class="part-toc-desc">Degradation hierarchy, circuit breakers, fallback mechanisms</span></li>
<li><a href="#p99-tail-latency-defense-the-unacceptable-tail">P99 Tail Latency Defense: The Unacceptable Tail</a>
<span class="part-toc-desc">Low-pause GC technology (ZGC), 120ms RTB absolute cutoff, forced failure strategy</span></li>
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
        AS[Ad Server Orchestrator<br/>Stateless, Horizontally Scaled<br/>150ms latency budget]

        subgraph "Core Services"
            UP[User Profile Service<br/>Demographics, Interests<br/>Target: 10ms]
            INTEGRITY[Integrity Check Service<br/>Lightweight Fraud Filter<br/>Target: <5ms]
            AD_SEL[Ad Selection Service<br/>Candidate Retrieval<br/>Target: 15ms]
            ML[ML Inference Service<br/>CTR Prediction<br/>Target: 40ms]
            RTB[RTB Auction Service<br/>OpenRTB Protocol<br/>Target: 100ms]
            BUDGET[Atomic Pacing Service<br/>Pre-Allocation<br/>Strong Consistency]
            AUCTION[Auction Logic<br/>Combine Internal + RTB<br/>First-Price Auction]
        end

        subgraph "Data Layer"
            REDIS[(Redis Cluster<br/>Atomic Counters: DECRBY/INCRBY<br/>Budget Enforcement)]
            CRDB[(CockroachDB<br/>Billing Ledger + User Profiles<br/>HLC Timestamps<br/>Multi-Region ACID)]
            FEATURE[(Feature Store<br/>ML Features<br/>Sub-10ms p99)]
        end
    end

    subgraph "Data Processing Pipeline - Background"
        KAFKA[Kafka<br/>Event Streaming<br/>100K events/sec]
        FLINK[Flink<br/>Stream Processing<br/>Real-time Aggregation]
        SPARK[Spark<br/>Batch Processing<br/>Feature Engineering]
        S3[(S3 + Athena<br/>Data Lake + Cold Archive<br/>500TB+ daily + 7-year retention)]
    end

    subgraph "ML Training Pipeline - Offline"
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

    AS -->|Fetch User| UP
    AS -->|Check Fraud| INTEGRITY
    AS -->|Get Ads| AD_SEL
    AS -->|RTB Parallel| RTB
    AS -->|Score Ads| ML
    AS -->|Run Auction| AUCTION
    AS -->|Check Budget| BUDGET

    UP -->|Read| REDIS
    UP -->|Read| CRDB

    INTEGRITY -->|Read Bloom Filter| REDIS
    INTEGRITY -->|Read Reputation| REDIS

    AD_SEL -->|Read| REDIS
    AD_SEL -->|Read| CRDB

    ML -->|Read Features| FEATURE

    RTB -->|OpenRTB 2.x| EXTERNAL[50+ DSP Partners]

    BUDGET -->|DECRBY/INCRBY| REDIS
    BUDGET -->|Audit Trail| CRDB

    AS -.->|Async Events| KAFKA
    KAFKA --> FLINK
    FLINK --> REDIS
    FLINK --> S3
    SPARK --> S3
    SPARK --> FEATURE

    CRDB -.->|Nightly Archive<br/>90-day-old records| S3

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
    class GW,AS,UP,AD_SEL,ML,RTB,BUDGET,AUCTION service
    class REDIS,CRDB,FEATURE,S3 data
    class KAFKA,FLINK,SPARK stream
{% end %}

**Request Flow Sequence:**

The diagram above shows both the **critical request path** (solid lines) and **background processing** (dotted lines). Here's what happens during a single ad request:

**1. Request Ingress (15ms total)**
- Client sends ad request to Global Load Balancer (Route53)
- Load balancer routes to nearest regional gateway (10ms network latency)
- Envoy Gateway performs authentication, rate limiting, request enrichment (5ms)

**2. Identity & Fraud Verification (15ms sequential)**
- **User Profile Service (10ms):** Fetches user demographics, interests, browsing history from Redis/CockroachDB cache hierarchy
- **Integrity Check Service (<5ms):** Lightweight fraud detection - checks user against Bloom filter (known bad IPs), validates device fingerprint, applies basic behavioral rules. BLOCKS fraudulent requests BEFORE expensive RTB fan-out to 50+ DSPs. Critical placement prevents wasting bandwidth on bot traffic.

**3. Parallel Path Split (ML + RTB run simultaneously after fraud check)**

**Path A: Internal ML Path (65ms after split)**
- **Feature Store Service (10ms):** Retrieves pre-computed behavioral features (1-hour click rate, 7-day CTR, etc.) from Redis
- **Ad Selection Service (15ms):** Queries internal ad database for candidate ads from direct deals, guaranteed campaigns, and house ads. Filters by user interests and features.
  - *Note: Retrieves internal inventory only - RTB ads come from external DSPs in the parallel path*
- **ML Inference Service (40ms):** Scores internal ad candidates using CTR prediction model, converts base CPM to eCPM

**Path B: External RTB Auction (100ms after split - CRITICAL PATH)**
- **RTB Auction Service (100ms):** Broadcasts OpenRTB bid requests to 50+ external Demand-Side Platforms (DSPs). DSPs run their own ML and return bids. Runs in parallel with ML path because it only needs user context from User Profile, operates on independent ad inventory from external partners.

**4. Unified Auction and Response (13ms avg, 15ms p99)**
- **Auction Logic (8ms avg, 10ms p99):**
  - Combines ML-scored internal ads with external RTB bids
  - Runs unified first-price auction to select highest eCPM across both sources (3ms)
  - Atomically checks and deducts from campaign budget via Redis Lua script (3ms avg, 5ms p99)
  - Overhead: 2ms (see Part 7: Budget Pacing for Bounded Micro-Ledger details)
- **Response Serialization (5ms):** Formats winning ad with tracking URLs, returns to client

**Total: 143ms avg (145ms p99)** (15ms ingress + 10ms User Profile + 5ms Integrity Check + 100ms RTB + 13ms auction/budget/response, with ML path completing in parallel at 65ms after split)

**Background Processing (Asynchronous):**
- Ad Server publishes impression/click/conversion events to Kafka (non-blocking)
- Flink processes events for real-time feature aggregation, updates Redis/Feature Store
- Spark runs batch jobs for model training data preparation
- Airflow orchestrates daily CTR model retraining, publishes to Model Registry
- CockroachDB archives 90-day-old billing records to S3 Glacier nightly (7-year regulatory retention, queryable via Athena)

**Data Dependencies:**
- **Sequential:** User Profile → Feature Store → Ad Selection → ML Inference (cannot parallelize due to feature dependencies)
- **Parallel:** RTB Auction runs alongside Feature Store + Ad Selection + ML (only needs user context from User Profile)
- **Critical Path:** RTB Auction (100ms after User Profile) determines overall latency, dominating the ML path (65ms parallel portion)

### Latency Budget Decomposition

For a 150ms total latency budget, we decompose the request path:

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
| **Envoy<br/>Gateway** | 2-4ms | 150K<br/>/node | Extension filters | JWT, OAuth2, External | Native<br/>(same proxy) | Low<br/>(unified) |
| Kong | 3-5ms | 100K<br/>/node | Plugin-based | JWT, OAuth2, LDAP | External<br/>(separate proxy) | Medium<br/>(dual proxies) |
| AWS API<br/>Gateway | 5-10ms | 10K<br/>/endpoint | Built-in | IAM, Cognito, Lambda | No integration | Low<br/>(managed) |
| NGINX Plus | 1-3ms | 200K<br/>/node | Lua scripting | Custom modules | No integration | High |

**Note on Performance Numbers:** The latency and throughput figures above are approximate and highly dependent on configuration (TLS settings, plugin/filter chains, request/response sizes, hardware specs). These represent reasonable expectations for well-tuned deployments, but actual performance should be validated through load testing with your specific configuration. Envoy's performance documentation notes that "performance varies greatly by configuration."

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

<style>
#tbl_rate_limit + table th:first-of-type  { width: 12%; }
#tbl_rate_limit + table th:nth-of-type(2) { width: 15%; }
#tbl_rate_limit + table th:nth-of-type(3) { width: 20%; }
#tbl_rate_limit + table th:nth-of-type(4) { width: 20%; }
#tbl_rate_limit + table th:nth-of-type(5) { width: 33%; }
</style>
<div id="tbl_rate_limit"></div>

| Tier | Scope | Limit | Algorithm | Why This Tier |
|------|-------|-------|-----------|---------------|
| **Global** | Entire platform | 1.5M QPS (capacity) | Token bucket | Protect infrastructure capacity |
| **Per-IP** | Client IP | 10K QPS | Sliding window | Prevent single-source abuse |
| **Per-Advertiser** | API key | 1K-100K QPS (tiered) | Token bucket with burst | SLA enforcement + fairness |
| **Per-Endpoint** | `/bid`, `/report`, etc. | Varies | Leaky bucket | Prevent expensive ops abuse |
| **DSP outbound** | External calls | 50K QPS total | Token bucket | Control external API costs |

**Distributed Rate Limiting Challenge:**

With 100+ gateway nodes, how do you enforce "1K QPS per advertiser" without centralizing every request?

**Naive approach (broken):**
- Each node enforces the full global limit locally → total cluster allows `N_nodes × global_limit` (massive over-budget)

**Correct approach (distributed counting):**

**Goal:** Enforce a global rate limit across distributed nodes without centralizing every request.

**Approach:**

1. **Simple partitioning**: Divide global limit evenly across nodes
   - Formula: `per_node_limit = global_limit / num_nodes`
   - Add headroom factor to account for traffic imbalance: `per_node_limit × (1 + headroom)`
   - Trade-off: Works if traffic is evenly distributed; fails if some nodes are hot

2. **Identify the problem**: Static per-node limits assume uniform distribution
   - In reality: load balancers may hash unevenly, some nodes handle more traffic
   - Result: Some nodes reject requests while others have idle capacity

**Better approach**: Centralized token bucket (discussed below)

**Solution: Redis-backed distributed token bucket**

**Data structure:** Store token counters per advertiser in Redis using a key pattern like `rate_limit:advertiser:{advertiser_id}`.

**Algorithm flow:**
1. **Atomic decrement**: When a request arrives, atomically decrement the advertiser's token count
2. **Decision**: If the result is negative (no tokens available), reject the request with HTTP 429 (Too Many Requests)
3. **Background refill**: A periodic job resets each advertiser's token counter to their maximum limit (with expiration matching the refill interval)

**Token bucket algorithm (Redis atomic operations):**

**Goal:** Provide smooth rate limiting with burst tolerance using centralized state.

**How it works:**

**Refill operation** (background job, runs periodically):
- Reset token counter to maximum capacity (your configured rate limit)
- Set expiration to match refill interval
- Atomic operation ensures consistent refill timing across all consumers

**Consume operation** (per request):
1. Read current token count from Redis
2. If tokens available:
   - Decrement counter atomically
   - Return success (allow request)
3. If no tokens:
   - Return failure (rate limit exceeded)

**Configuration decisions:**
- **Refill interval**: Shorter intervals (e.g., sub-second) = smoother rate limiting but higher Redis load. Longer intervals (e.g., multiple seconds) = burstier traffic but lower overhead.
- **Bucket capacity**: Set to `rate_limit × refill_interval_seconds` to allow sustained rate
- **Burst tolerance**: Optionally set capacity higher than base rate to allow short bursts (e.g., `2 × rate_limit` allows 2× burst for brief periods)

**Latency impact:**
- Redis local read: **0.3ms** (in-region)
- Rate limit decision: **0.5ms total** (within our 1ms budget)

**Optimization: Local cache with periodic sync**

To avoid Redis roundtrip on every request, use a hybrid approach:

**Hybrid local + distributed algorithm:**
1. Each gateway node maintains its own local token bucket with short TTL (e.g., 1 second)
2. Periodically (e.g., every second), each node allocates a portion of tokens from Redis (global budget divided by number of nodes)
3. Incoming requests are served from the local bucket (no Redis call required, sub-millisecond latency)
4. Local bucket is refilled every interval with a fresh allocation from Redis

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

When rejecting a request due to rate limiting, return HTTP status 429 (Too Many Requests) with informative headers:
- **X-RateLimit-Limit**: The maximum number of requests allowed in the window
- **X-RateLimit-Remaining**: How many requests are still available (0 when limit is exceeded)
- **X-RateLimit-Reset**: Unix timestamp when the limit resets
- **Retry-After**: Seconds to wait before retrying

**Tiered Rate Limits by Advertiser Size:**

<style>
#tbl_advertiser_tier + table th:first-of-type  { width: 12%; }
#tbl_advertiser_tier + table th:nth-of-type(2) { width: 18%; }
#tbl_advertiser_tier + table th:nth-of-type(3) { width: 15%; }
#tbl_advertiser_tier + table th:nth-of-type(4) { width: 35%; }
#tbl_advertiser_tier + table th:nth-of-type(5) { width: 20%; }
</style>
<div id="tbl_advertiser_tier"></div>

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

**Service Layer (Target: 125ms)**

The Ad Server orchestrates calls to 6 services. After User Profile lookup (10ms) and Integrity Check (5ms), execution splits into two parallel paths:

**Path A - Internal ML (parallel portion: 65ms):**
- Feature Store lookup: 10ms → retrieves pre-computed behavioral features (1-hour click rate, 7-day CTR)
- Ad Selection: 15ms → retrieves candidate ads (needs user interests and features for filtering)
- **ML inference: 40ms** → scores candidates (needs both user features AND ad features from Feature Store)

**Path B - External RTB (CRITICAL PATH - 100ms):**
- RTB auction: 100ms → external DSPs bid (needs user context, runs in parallel with Feature Store + Ad Selection + ML)

The critical path is **RTB Auction (100ms)** after User Profile (10ms) and Integrity Check (5ms), totaling 115ms for service orchestration. The internal ML path (65ms parallel execution) completes well before RTB responses arrive, so the system waits at a join point for RTB to finish before running the final auction logic.

**Complete Request Latency:**
- Network overhead + Gateway: 15ms
- User Profile (shared): 10ms
- Integrity Check (fraud filter): 5ms
- Critical service path: 100ms (RTB dominates - runs in parallel with ML)
- ML path (parallel): 65ms (completes before RTB)
- Auction logic + Budget check + Serialization: 13ms avg (15ms p99)
- **Total: 143ms avg (145ms p99)** with 5-7ms buffer to 150ms SLO

### Critical Path and Dual-Source Architecture

The platform serves ads from **two independent inventory sources** that compete in a unified auction:

- **Source 1 (Internal)**: Direct deals, guaranteed campaigns stored in internal database with pre-negotiated pricing. ML scores these ads to predict user-specific CTR and convert to eCPM.
- **Source 2 (External)**: Real-time bids from 50+ external DSPs via OpenRTB protocol. DSPs score internally and return bid prices.

Both sources compete in final auction. Highest eCPM wins (internal or external). This dual-source model enables parallel execution: ML scores internal inventory while RTB collects external bids simultaneously.

> **Architectural Driver: Revenue Optimization** - Unified auction maximizes revenue per impression by ensuring best ad wins regardless of source. Industry standard: Google Ad Manager, Amazon Publisher Services, Prebid.js.

**Why parallel execution works:** ML and RTB operate on independent ad inventories. ML doesn't need RTB results (scoring internal ads from our database). RTB doesn't need ML results (DSPs bid independently). Only synchronize at final auction when both paths complete.

*For detailed business model, revenue optimization, and economic rationale, see Part 3: "Ad Inventory Model and Monetization Strategy"*

#### Request Flow and Timing

The critical path is determined by **RTB Auction (100ms)**, which dominates the latency budget. Internal ML processing runs in parallel and completes faster at 65ms:

{% mermaid() %}
graph TB
    A[Request Arrives] -->|5ms| B[Gateway Auth]
    B --> C[User Profile<br/>10ms<br/>Cache hierarchy]
    C --> IC[Integrity Check<br/>5ms CRITICAL<br/>Lightweight fraud filter<br/>Bloom filter + basic rules<br/>BLOCKS fraudulent requests]

    IC -->|PASS| FS[Feature Store Lookup<br/>10ms<br/>Behavioral features]
    IC -->|PASS| F[RTB Auction<br/>100ms CRITICAL PATH<br/>OpenRTB to 50+ external DSPs<br/>Source 2: External inventory]
    IC -->|BLOCK| REJECT[Reject Request<br/>Return house ad or error<br/>No RTB call made]

    FS --> D[Ad Selection<br/>15ms<br/>Query internal ad DB<br/>Direct deals + guaranteed<br/>Source 1: Internal inventory]

    D --> E[ML Inference<br/>40ms<br/>CTR prediction on internal ads<br/>Output: eCPM-scored ads]

    E --> G[Synchronization<br/>Wait for both sources<br/>Internal: ready at 85ms<br/>External RTB: at 120ms]
    F --> G

    G -->|5ms| H[Unified Auction<br/>Combine Source 1 + Source 2<br/>Select highest eCPM<br/>Winner: internal OR external]
    H -->|5ms| I[Response]

    style F fill:#ffcccc
    style IC fill:#ffdddd
    style C fill:#ffe6e6
    style FS fill:#e6f3ff
    style G fill:#fff4cc
    style H fill:#e6ffe6
    style REJECT fill:#ff9999
{% end %}

**Critical Path (from diagram):** Gateway (5ms) → User Profile (10ms) → Integrity Check (5ms) → RTB Auction (100ms) → Sync → Final Auction (8ms avg, 10ms p99) → Response (5ms) = **133ms avg service layer (135ms p99)**

**Parallel path (Internal ML):** Gateway (5ms) → User Profile (10ms) → Integrity Check (5ms) → Feature Store (10ms) → Ad Selection (15ms) → ML Inference (40ms) → Sync (waiting) = **85ms**

**Note:** Diagram shows service layer only. Add 10ms network overhead at the start for **143ms avg total request latency (145ms p99)** with 5-7ms buffer to 150ms SLO.

> **Critical Design Decision: Integrity Check Placement** - The 5ms Integrity Check Service runs BEFORE the RTB fan-out to 50+ DSPs. This prevents wasting bandwidth and DSP processing time on fraudulent traffic. Cost impact: blocking 20-30% bot traffic before RTB saves $70M+/year in egress bandwidth costs (RTB requests to external DSPs incur data transfer charges at ~$0.09/GB). The 5ms latency investment delivers 14,000× ROI by eliminating fraud-induced RTB costs.

**Component explanations** (referencing dual-source architecture above):
- **User Profile (10ms)**: L1/L2/L3 cache hierarchy retrieves user demographics, interests, browsing history. Shared by both paths.
- **Integrity Check (5ms)**: Lightweight fraud detection using Bloom filter (known bad IPs), device fingerprint validation, and basic behavioral rules. Runs BEFORE expensive RTB calls to prevent wasting bandwidth on bot traffic. See Part 8: Fraud Detection for L1/L2/L3 tier details. Blocks 20-30% of fraudulent requests here.
- **Feature Store (10ms)**: Retrieves pre-computed behavioral features (1-hour click rate, 7-day CTR, etc.) from Redis. Used only by ML path.
- **Ad Selection (15ms)**: Queries **internal ad database** (CockroachDB) for top 100 candidates from direct deals, guaranteed campaigns, and house ads. Filters by user profile and features. Does NOT include RTB ads (those come from external DSPs).
- **ML Inference (40ms)**: GBDT model predicts CTR for internal ad candidates. Converts base CPM to eCPM using formula: `eCPM = predicted_CTR × base_CPM × 1000`. Output: List of internal ads with eCPM scores.
- **RTB Auction (100ms)**: Broadcasts OpenRTB request to 50+ external DSPs, collects bids. DSPs do their own ML internally. Output: List of external bids with prices.
- **Synchronization Point**: System waits here until BOTH paths complete. ML path (85ms total from start) finishes 35ms before RTB path (120ms total from start). Internal ads are cached while waiting for external RTB bids.
- **Final Auction (8ms avg, 10ms p99)**: Runs unified auction combining ML-scored internal ads (Source 1) with external RTB bids (Source 2). Selects winner with highest eCPM across both sources (3ms), then atomically checks and deducts campaign budget via Redis Lua script (3ms avg, 5ms p99), plus overhead (2ms). Winner could be internal OR external ad.

#### Parallel Execution and Unified Auction

**Why parallel execution works:** ML and RTB operate on **completely independent ad inventories** with no data dependency. ML scores internal inventory (direct deals in our database), while RTB collects bids from external DSPs (advertiser networks). They only merge at the final auction.

**Synchronization Point timing:**
1. ML path completes at t=85ms: Internal ads scored and cached
2. ML thread waits idle from t=85ms to t=120ms (35ms idle time)
3. RTB path completes at t=120ms: External DSP bids arrive
4. Both results available → proceed to Final Auction at t=120ms

**Unified Auction logic (8ms avg, 10ms p99: 3ms auction + 3ms avg budget check [5ms p99] + 2ms overhead):**
**Unified auction algorithm:**

1. **Calculate eCPM for internal ads:**
   - eCPM = predicted_CTR × base_CPM × 1000
   - Example: 0.05 CTR × $3 CPM × 1000 = $150 eCPM

2. **Use eCPM from RTB bids:**
   - DSP bids are already in eCPM format
   - No conversion needed

3. **Select winner:**
   - Choose candidate with highest eCPM across all sources
   - Winner can be internal ad OR external RTB bid

**Example outcome:**
**Auction results:**
- DSP_A (external): $180 eCPM **← WINNER** (external RTB wins)
- DSP_B (external): $160 eCPM
- Nike (internal): $150 eCPM
- Adidas (internal): $120 eCPM

Publisher earns $0.18 for this impression. If an internal ad scored $190 eCPM (highly personalized match), it would beat RTB - ensuring maximum revenue regardless of source.

**Latency comparison:**
- Sequential (ML after RTB): 100ms RTB + 40ms ML = 140ms (exceeds budget, no buffer)
- Parallel (independent sources): max(100ms RTB, 65ms ML) = 100ms (**35ms savings**)

**Why we can't start auction earlier:** We need BOTH ML-scored ads AND RTB bids for complete auction. Starting before RTB completes excludes external bidders, losing potential revenue.

### Resilience: Graceful Degradation and Circuit Breaking

The critical path analysis above assumes all services operate within their latency budgets. But what happens when they don't? The 150ms SLO leaves only a 15ms buffer - if any critical service exceeds its budget, the entire request fails.

> **Architectural Driver: Availability** - Serving a less-optimal ad quickly beats serving no ad at all. When services breach latency budgets, degrade gracefully through fallback layers rather than timing out.

**Example scenario:** ML inference allocated 40ms, but GPU load spikes push p99 latency to 80ms. Options:
- **Wait for slow ML response:** Violates 150ms SLA → mobile timeouts → blank ads → 100% revenue loss
- **Skip ML entirely:** Serve random ad → 100% revenue loss from poor targeting
- **Degrade gracefully:** Serve cached predictions → ~8% revenue loss, but ad still served

The answer: **graceful degradation**. Better to serve a less-optimal ad quickly than perfect ad slowly (or no ad at all).

#### Degradation Hierarchy: Per-Service Fallback Layers

Each critical-path service has a **latency budget** and a **degradation ladder** defining fallback behavior when budgets are exceeded. The table below shows all degradation levels across the three most critical services:

<style>
#tbl_degradation + table th:first-of-type  { width: 15%; }
#tbl_degradation + table th:nth-of-type(2) { width: 28%; }
#tbl_degradation + table th:nth-of-type(3) { width: 28%; }
#tbl_degradation + table th:nth-of-type(4) { width: 28%; }
</style>
<div id="tbl_degradation"></div>

| Level | ML Inference<br/>(40ms budget) | User Profile<br/>(10ms budget) | RTB Auction<br/>(100ms budget) |
|-------|---------------------------|---------------------------|--------------------------|
| **Level 0**<br/>Normal | GBDT on CPU<br/>Latency: 20ms<br/>Revenue: 100%<br/>*Trigger: p99 < 40ms* | CockroachDB + Redis<br/>Latency: 8ms<br/>Accuracy: 100%<br/>*Trigger: p99 < 10ms* | Query all 50 DSPs<br/>Latency: 85ms<br/>Revenue: 100%<br/>*Trigger: p95 < 100ms* |
| **Level 1**<br/>Light Degradation | **Cached predictions**<br/>Redis cached CTR<br/>Latency: 5ms<br/>Revenue: 92% (-8%)<br/>*Trigger: p99 > 40ms for 60s* | **Stale cache**<br/>Extended TTL cache<br/>Latency: 2ms<br/>Accuracy: 95% (-5%)<br/>*Trigger: p99 > 10ms for 60s* | **Top 30 DSPs only**<br/>Highest-value DSPs<br/>Latency: 80ms<br/>Revenue: 95% (-5%)<br/>*Trigger: p95 > 100ms for 60s* |
| **Level 2**<br/>Moderate Degradation | **Heuristic model**<br/>Rule-based CTR<br/>Latency: 2ms<br/>Revenue: 85% (-15%)<br/>*Trigger: Cache miss > 30%* | **Segment defaults**<br/>Demographic avg<br/>Latency: 1ms<br/>Accuracy: 70% (-30%)<br/>*Trigger: DB unavailable* | **Top 10 DSPs only**<br/>Ultra-high-value only<br/>Latency: 75ms<br/>Revenue: 88% (-12%)<br/>*Trigger: p95 > 110ms for 60s* |
| **Level 3**<br/>Severe Degradation | **Global average**<br/>Category avg CTR<br/>Latency: 1ms<br/>Revenue: 75% (-25%)<br/>*Trigger: Still breaching SLA* | N/A | **Skip RTB entirely**<br/>Direct inventory only<br/>Latency: 0ms<br/>Revenue: 65% (-35%)<br/>*Trigger: All DSPs timeout* |

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
- Breaching 150ms SLA → 200ms+ total latency → mobile timeout → 100% revenue loss on timed-out requests

#### Circuit Breakers: Automated Degradation Triggers

Degradation shouldn't require manual intervention. Implement **circuit breakers** that automatically detect when services exceed latency budgets and switch to fallback layers.

**Circuit breaker pattern:** Monitor service latency continuously. When a service consistently breaches its budget, "trip" the circuit and route traffic to the next degradation level until the service recovers.

**Three-state circuit breaker:**

**Goal:** Automatically detect service degradation and route around it, then carefully test recovery before fully restoring traffic.

**CLOSED (normal operation):**
- All traffic flows to primary service (e.g., ML inference)
- **Monitor continuously**: Track latency percentiles (p95, p99) over rolling time windows
- **Trip condition**: When latency exceeds `budget + tolerance_margin` for sustained period
  - **Tolerance margin**: Small buffer above budget to avoid false positives from transient spikes
  - **Duration threshold**: How long the breach must persist before tripping (balance: too short = false positives, too long = prolonged degradation)

**OPEN (degraded mode):**
- All traffic routed to fallback (cached data, simplified logic, etc.)
- Primary service not called (prevents overwhelming already-struggling service)
- **Wait period**: Exponential backoff before testing recovery
  - Start with base wait time, double on repeated failures
  - Prevents rapid retry loops that could worsen the problem

**HALF-OPEN (testing recovery):**
- **Send test traffic**: Route small percentage to primary service
  - Too much test traffic = risks overwhelming recovering service
  - Too little = takes too long to gain confidence in recovery
- **Success criteria**: Define what "healthy" means
  - Percentage of requests that must succeed
  - Maximum acceptable latency for test requests
  - Minimum sample size before declaring success
- **On failure**: Return to OPEN with increased backoff (service not ready)
- **On success**: Restore to CLOSED (service recovered)

**Configuration approach:**
- Set trip threshold slightly above budget to tolerate brief spikes
- Choose duration window based on your traffic volume (higher QPS = can detect issues faster)
- Size test traffic based on primary service capacity during recovery
- Use exponential backoff to give struggling services time to recover

**Per-service circuit breaker thresholds:**

<style>
#tbl_0 + table th:first-of-type  { width: 18%; }
#tbl_0 + table th:nth-of-type(2) { width: 12%; }
#tbl_0 + table th:nth-of-type(3) { width: 20%; }
#tbl_0 + table th:nth-of-type(4) { width: 32%; }
#tbl_0 + table th:nth-of-type(5) { width: 18%; }
</style>
<div id="tbl_0"></div>

| Service | Budget | Trip Threshold | Fallback | Revenue Impact |
|---------|--------|---------------|----------|----------------|
| **ML Inference** | 40ms | p99 > 45ms<br/>for 60s | Cached CTR predictions | -8% |
| **User Profile** | 10ms | p99 > 15ms<br/>for 60s | Stale cache (5min TTL) | -5% |
| **RTB Auction** | 100ms | p95 > 105ms<br/>for 60s | Top 20 DSPs only<br/>(Note: p99 protected by 120ms absolute cutoff*) | -6% |
| **Ad Selection** | 15ms | p99 > 20ms<br/>for 60s | Skip personalization, use category matching | -12% |

*\*RTB p99 protection: The 120ms absolute cutoff forces immediate fallback to internal inventory or House Ad when RTB exceeds the hard timeout, preventing P99 tail requests (10,000 req/sec at 1M QPS) from timing out at the mobile client. See [P99 Tail Latency Defense](#p99-tail-latency-defense-the-unacceptable-tail) for complete strategy.*

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

Track composite degradation score: \\(Score = \sum_{i \in \text{services}} w_i \times \text{Level}_i\\) where \\(w_i\\) reflects revenue impact (ML=0.4, RTB=0.3, Profile=0.2, AdSelection=0.1). Alert on: any service at Level 2+ for >10min (P2), composite score >4 (P1 - cascading failure risk), revenue <85% forecast (P1), circuit flapping >3 transitions/5min.

**Testing Degradation Strategy:**

Validate via chaos engineering: (1) Inject 50ms latency to 10% ML requests, verify circuit trips and -8% revenue impact matches prediction; (2) Terminate 50% GPU nodes, confirm graceful degradation within 60s; (3) Quarterly regional failover drills validating <30% revenue loss and measuring recovery time.

**Trade-off Articulation:**

**Why degrade rather than scale?**

You might ask: "Why not just auto-scale GPU instances when latency spikes?"

**Problem:** Provisioning new GPU instances takes **30-40 seconds** with modern tooling (NVIDIA Model Streamer, Alluxio caching, pre-warmed container images) - instance boot + model loading into VRAM. During traffic spikes, you'll still breach SLAs for 30+ seconds before new capacity comes online.

**Note:** Without optimization (legacy deployments, cold container pulls, full model loading from S3), cold start can take **90-120 seconds**. The 30-40s baseline assumes modern best practices: pre-warmed images, model streaming, and persistent VRAM caching across instance restarts.

**Cost-benefit comparison:**

<style>
#tbl_degrade_strategy + table th:first-of-type  { width: 28%; }
#tbl_degrade_strategy + table th:nth-of-type(2) { width: 24%; }
#tbl_degrade_strategy + table th:nth-of-type(3) { width: 24%; }
#tbl_degrade_strategy + table th:nth-of-type(4) { width: 24%; }
</style>
<div id="tbl_degrade_strategy"></div>

| Strategy | Latency Impact | Revenue Impact | Cost |
|----------|---------------|----------------|------|
| **Wait for GPU**<br/>(no degradation) | 150ms<br/>total → timeout | -100%<br/>on timed-out requests | $0 |
| **Scale GPU instances** | 90s of 80ms<br/>latency → partial timeouts | -40%<br/>during scale-up window | +30-50% GPU baseline for burst capacity |
| **Degrade to cached predictions** | 5ms<br/>immediate | -8%<br/>targeting accuracy | $0 |

**Decision:** Degradation costs less (-8% vs -40%) and reacts faster (immediate vs 90s).

**But we still auto-scale!** Degradation buys time for auto-scaling to provision capacity. Once new GPU instances are healthy (90s later), circuit closes and we return to normal operation.

**Degradation is a bridge, not a destination.**

### P99 Tail Latency Defense: The Unacceptable Tail

The degradation and circuit breaker strategies above focus primarily on P95 latency targets (150ms SLO). But at 1 million QPS, the **P99 tail represents 10,000 requests per second** that exceed the acceptable threshold - a massive volume that can significantly impact revenue and user experience.

> **Architectural Driver: Revenue Protection** - The P99 tail is dominated by the slowest RTB bidder and garbage collection (GC) pauses in the Ad Server Orchestrator. Without strict P99 protection, these 10,000 req/sec become timeout victims, resulting in blank ads and 100% revenue loss on the tail. Protecting the tail requires both infrastructure choices (low-pause GC) and operational discipline (hard timeouts with forced failure).

**The Problem: P99 Tail is Dominated by Two Factors**

1. **Slowest RTB Bidder**: With 25-30 DSPs per auction, the RTB critical path is bounded by the slowest responder. A single DSP taking 110ms delays the entire auction.
2. **Garbage Collection Pauses**: Traditional JVM GC (G1GC) can produce 10-50ms stop-the-world pauses at P99, directly violating latency budgets.

**The Scale of the Problem:**

At 1M QPS:
- **P95 (150ms)**: 950,000 req/sec meet SLO → good user experience
- **P99 (>150ms)**: 10,000 req/sec exceed SLO → risk timeout and revenue loss
- **P99.9 (>200ms)**: 1,000 req/sec likely timeout → guaranteed revenue loss

**Revenue impact**: Assuming $0.50 avg revenue per impression:
- P99 tail loss: 10,000 req/sec × $0.50 = $5,000/sec = **$432M/day potential loss**
- Even 10% of P99 tail timing out = $43M/day lost revenue

This is unacceptable. We need strict P99 defense mechanisms.

#### P99 Defense Strategy 1: Ad Server Orchestrator - Low-Pause GC Technology

**Technology Choice: Java with ZGC or Shenandoah (Alternative: Go or Rust)**

The Ad Server Orchestrator is the central orchestration layer coordinating User Profile, Integrity Check, Feature Store, Ad Selection, ML Inference, RTB Auction, and final auction logic. As the request coordinator, it's in the critical path for every request.

**Traditional GC Problem:**

Standard JVM garbage collectors (G1GC, CMS) produce stop-the-world (STW) pauses:
- **G1GC typical**: 5-15ms p99 pauses (acceptable), but 20-50ms p99.9 pauses (unacceptable)
- **CMS**: Can produce 100ms+ full GC pauses under heap pressure
- **Impact**: A single 50ms GC pause pushes request latency from 143ms to 193ms, violating 150ms SLO by 43ms

**Low-Pause GC Solutions:**

**Option 1: Java with ZGC (Z Garbage Collector)**
- **Pause times**: <1ms typical pause times, <2ms p99.9 (for heaps up to 16TB)
- **Trade-off**: 10-15% throughput reduction due to concurrent GC work (design goal <15% vs G1GC)
- **Benefit**: Predictable tail latency, eliminates GC as a P99 contributor
- **Production readiness**: Stable since Java 15 (2020), proven in production by Netflix and Twitter

**Option 2: Java with Shenandoah**
- **Pause times**: <10ms p99 (concurrent compaction)
- **Trade-off**: Similar CPU overhead to ZGC
- **Benefit**: Better than G1GC for tail latency, slightly higher pauses than ZGC
- **Production readiness**: Stable since Java 12 (2019)

**Option 3: Go (Golang)**
- **Pause times**: Sub-millisecond to <2ms p99.9 with concurrent tri-color mark-and-sweep (typical for well-tuned Go applications, highly workload-dependent)
- **Trade-off**: Learning curve for Java-heavy teams, less mature ecosystem for ad tech
- **Benefit**: Sub-millisecond GC pauses by default, excellent concurrency primitives
- **Production adoption**: Growing in ad tech (Cloudflare Workers, Discord, parts of Google infrastructure)

**Option 4: Rust**
- **Pause times**: 0ms (no garbage collector - manual memory management via ownership system)
- **Trade-off**: Steeper learning curve, longer development time
- **Benefit**: Zero GC pauses, maximum performance
- **Production adoption**: Growing in ad tech (used by Cloudflare Workers, Discord)

**Recommended Choice: Java 21+ with ZGC**

**Rationale:**
1. **Ecosystem maturity**: Rich Java ecosystem (Spring Boot, Netty, observability tools)
2. **Team familiarity**: Most ad tech teams have deep Java expertise
3. **Sub-millisecond pauses**: ZGC delivers <1ms p99 pauses, effectively eliminating GC as a P99 contributor
4. **Production validation**: Proven at scale by Netflix and Twitter, with growing adoption across major platforms

**Configuration Approach:**

**Goal:** Eliminate GC pauses as a contributor to P99 latency violations. Traditional garbage collectors (G1GC) can pause for 20-50ms, consuming 13-33% of your entire 150ms latency budget.

**How to configure:**

1. **Heap sizing strategy**: Match minimum and maximum heap sizes to prevent runtime resizing pauses. Size based on your steady-state memory usage plus headroom for allocation spikes. Under-provisioning causes frequent GC cycles (CPU overhead), over-provisioning wastes memory capacity.

2. **Proactive vs reactive GC**: Choose between running GC proactively at intervals (uses CPU cycles even when memory pressure is low, but prevents allocation stalls) versus waiting for memory pressure (lower CPU overhead, but risks unpredictable pause timing during traffic spikes). For latency-sensitive systems, proactive GC provides more predictable performance.

3. **Allocation spike tolerance**: Configure how much your allocation rate can spike before triggering emergency GC. Higher tolerance = fewer false alarms during burst traffic, but requires more memory headroom. Lower tolerance = more frequent preemptive collections.

**How to determine values:**
- Measure your allocation rate under peak load (bytes allocated per second)
- Profile your object lifetime distribution (short-lived vs long-lived objects)
- Calculate required heap based on: `working_set_size + (allocation_rate × collection_interval)`
- Test with production-like traffic to validate pause times stay sub-millisecond at p99

**Monitoring:**
- **GC pause time**: Alert if p99 exceeds your latency budget allocation for GC (typically <2ms)
- **GC frequency**: Track collection intervals to ensure they align with your allocation patterns
- **Heap pressure**: Monitor allocation rate vs GC throughput to detect capacity issues before they cause pauses

**Impact on P99 latency:**
- **Before (G1GC)**: 145ms p99, but 170-190ms p99.9 due to 20-50ms GC pauses
- **After (ZGC)**: 145ms p99, 147ms p99.9 (sub-millisecond GC pauses don't impact tail)

**Alternative for teams with Go expertise**: If the team has strong Go experience, Go runtime provides superior low-pause guarantees (sub-millisecond to <2ms p99.9, highly workload-dependent) with simpler concurrency primitives. However, the Java ecosystem advantages (mature observability, extensive ad tech libraries, team familiarity, enterprise tooling) generally outweigh Go's GC advantages for most teams.

#### P99 Defense Strategy 2: RTB 120ms Absolute Cutoff with Forced Failure

While the operational RTB target is 50-70ms and the standard timeout is 100ms (p95 target), **P99 protection requires a strict 120ms absolute cutoff** where the Ad Server Orchestrator forcefully cancels all pending work and fails over to fallback inventory.

**Why 120ms?**

**Critical path timing with buffer:**

| Component | Latency | Notes |
|-----------|---------|-------|
| Gateway | 5ms | Request routing |
| User Profile | 10ms | Fetch user data |
| Integrity Check | 5ms | Fraud/validation |
| RTB Auction | 100ms | **← Standard p95 target** |
| Auction Logic | 8ms | Bid evaluation |
| Response | 5ms | Format and return |
| **Total** | **133ms** | **Average case** |

**Problem at higher percentiles:**
- **At P99**: RTB can spike to 110-115ms → Total: 143-148ms (within 150ms SLO, but tight)
- **At P99.9**: RTB can spike to 130-150ms → Total: 163-183ms (**VIOLATES 150ms SLO by 13-33ms**)

**The 120ms absolute cutoff ensures:**

| Component | Latency | Notes |
|-----------|---------|-------|
| Gateway | 5ms | Request routing |
| User Profile | 10ms | Fetch user data |
| Integrity Check | 5ms | Fraud/validation |
| RTB Auction | **120ms** | **← HARD CUTOFF at P99** |
| Auction Logic | 8ms | Bid evaluation |
| Response | 5ms | Format and return |
| **Total** | **153ms** | **3ms SLO violation, acceptable** |

**At 120ms, better to serve a guaranteed ad than wait for the perfect RTB bid that might never arrive.**

**Implementation: Request Cancellation and Forced Failure**

{% mermaid() %}
flowchart TD
    Start[Start RTB Auction] --> Launch[Launch RTB auction with 120ms timeout]
    Launch --> Wait{Wait for result}

    Wait -->|Completes within 120ms| Success[Receive RTB bids]
    Wait -->|Timeout at 120ms| Timeout[Timeout Exception]

    Timeout --> Record[Record P99 timeout metrics]
    Record --> Cancel[Cancel all pending DSP requests]
    Cancel --> Empty[Return empty bid list]

    Empty --> CheckInternal{Internal ads<br/>available?}
    Success --> Unified[Run unified auction:<br/>RTB + Internal ads]

    CheckInternal -->|Yes| InternalOnly[Run auction with<br/>internal inventory only]
    CheckInternal -->|No| HouseAd[Serve House Ad<br/>Publisher's own promo]

    InternalOnly --> Return1[Return winning ad<br/>~40% revenue]
    HouseAd --> Return2[Return house ad<br/>$0 ad revenue<br/>Not paid inventory]
    Unified --> Return3[Return best bid<br/>100% revenue]

    style Timeout fill:#f99
    style Cancel fill:#fcc
    style HouseAd fill:#fcc
    style Unified fill:#9f9
{% end %}

**Request Cancellation Pattern (DSP-Level):**

When the 120ms hard timeout is reached, the system performs three key operations:

1. **Cancel all pending HTTP requests**: Use context cancellation to send RST_STREAM frames (HTTP/2), stopping in-flight requests to DSPs without waiting for responses

2. **Record timeout per DSP**: Track which DSPs timed out for health score degradation, allowing the system to deprioritize slow bidders in future auctions

3. **Preserve connection pool**: HTTP/2 RST_STREAM keeps the TCP connection alive (doesn't close it), so the connection pool remains warm for the next auction, avoiding expensive TLS handshake overhead on subsequent requests

**Fallback Hierarchy at P99:**

When RTB times out at 120ms:

**Level 1: Internal Inventory Only** (preferred fallback)
- Run auction with ML-scored internal ads (direct deals, guaranteed campaigns)
- **Revenue impact**: ~40% of normal (loses external RTB competition)
- **Latency**: Total = 133ms (within SLO)
- **Success rate**: 95% (most requests have at least one internal ad)

**Level 2: House Ad** (last resort - **NOT paid advertising**)
- **What it is**: Publisher's own promotional content (newsletter signup, app download, follow on social media, etc.) - **NOT revenue-generating advertising inventory**
- **Revenue impact**: **$0 advertising revenue** (no external advertiser is paying)
- **Why still valuable**: Drives publisher goals (newsletter signups, app installs, user engagement, brand awareness)
- **Why better than blank**: Blank ads damage user trust and long-term CTR; House Ads preserve user experience
- **Latency**: Total = 128ms (skips auction logic)
- **Use case**: Internal paid inventory exhausted or budget-depleted (RTB already timed out)

**Level 3: No-Fill** (rare, only for non-critical placements)
- Return empty ad slot
- **Revenue impact**: 100% loss on that impression
- **Latency**: Total = 125ms
- **Use case**: Non-critical placements where blank space is acceptable (e.g., sidebar widget, not main content)

**Monitoring and Alerting:**

Track P99 tail separately from P95:

**Metrics to monitor:**
- RTB timeout count (tagged with reason like "p99_absolute_cutoff")
- RTB timeout rate at p99 percentile (target: <1% of total requests)
- Fallback counters: internal-only, house ad, and no-fill counts

**Alert thresholds:**
- **WARN**: P99 timeout rate > 0.5% for 5+ minutes (50 req/sec at 1M QPS)
- **ERROR**: P99 timeout rate > 1.0% for 5+ minutes (100 req/sec at 1M QPS)
- **P1 (Critical)**: P99 timeout rate > 2.0% for 2+ minutes (200 req/sec at 1M QPS)

**Alert on**:
- **P99 timeout rate > 1%**: Indicates systematic RTB performance degradation (DSP issues, network congestion, or misconfigured timeout)
- **House ad rate > 5%**: Internal inventory exhausted or budget pacing too aggressive
- **No-fill rate > 0.5%**: Critical inventory shortage

**Revenue Impact Analysis:**

At 1M QPS with P99 = 10,000 req/sec potentially affected:

**Scenario 1: No P99 protection (current state)**
- P99.9 requests (1,000 req/sec) timeout at mobile client (>200ms) → 100% revenue loss
- Lost revenue: 1,000 req/sec × $0.50 = $500/sec = **$43M/day**

**Scenario 2: With 120ms cutoff + fallback (proposed)**
- P99-P99.9 requests (9,000 req/sec) complete with internal-only auction → 40% revenue
- P99.9 requests (1,000 req/sec) serve House Ad → 0% revenue (but preserved UX)
- Revenue with fallback: 9,000 × ($0.50 × 0.40) + 1,000 × $0 = $1,800/sec = **$155M/day**
- **Net improvement: $155M - $0 = $155M/day** (assumes current state loses all P99 tail revenue)

Even in a more optimistic baseline where 50% of P99 tail currently completes:
- Current revenue: 10,000 × $0.50 × 0.50 = $2,500/sec = **$216M/day**
- With P99 protection: **$155M/day**
- Net cost: $61M/day **BUT**: Improved user experience (no blank ads) increases overall CTR by 2-5%, recovering $50-125M/day across all traffic

**The trade-off is acceptable**: Losing some P99 tail revenue beats losing user trust from blank ads.

**Testing P99 Defense:**

Validate via load testing and chaos engineering:

1. **Inject 120ms+ latency** into 10% of DSP requests:
   - Verify RTB timeout triggers at exactly 120ms
   - Confirm internal-only auction completes successfully
   - Measure fallback latency (target: <133ms total)

2. **Simulate GC pauses** (pre-ZGC validation):
   - Inject artificial 50ms pauses every 10 seconds
   - Confirm P99 latency degrades to 190ms+ (demonstrates problem)
   - Deploy ZGC → re-test → verify P99 improves to 147ms

3. **P99 load test** with realistic traffic:
   - Generate 1M QPS with long-tail latency distribution
   - Target: 99% of requests complete within 150ms
   - Measure: P99.9 latency (should be <160ms with fallback)

4. **Quarterly chaos drills**:
   - Force 50% of DSPs to timeout
   - Validate graceful degradation to internal inventory
   - Measure revenue impact (target: <50% loss at P99 tail)

**Summary: P99 Tail Latency Defense**

| Mechanism | Target | Impact | Revenue Protection |
|-----------|--------|--------|-------------------|
| **ZGC (Low-Pause GC)** | <1ms p99 GC pauses | Eliminates GC as P99 contributor | Prevents 20-50ms GC spikes that violate SLO |
| **120ms RTB Absolute Cutoff** | P99 < 153ms total latency | Forces fallback at 120ms, prevents client timeout | Saves 10,000 req/sec from becoming blank ads |
| **Internal-Only Fallback** | 95% success rate | Preserves 40% revenue on RTB timeout | Recovers $155M/day vs 100% loss |
| **House Ad Fallback** | 100% UX preservation | $0 revenue but maintains user experience | Prevents blank ads that damage CTR long-term |

**Key Insight:** P99 protection is not about optimizing the tail - it's about **failing fast with a guaranteed fallback**. At 1M QPS, the P99 tail (10,000 req/sec) is too large to ignore. Better to serve a guaranteed ad at 120ms than wait for a perfect RTB bid that might never arrive (or arrives at 180ms, violating SLO and causing mobile timeout).

**This is the engineering trade-off**: Accept 40-50% revenue loss on 1% of traffic (P99 tail) to preserve user experience and prevent 100% loss from blank ads and mobile timeouts.

---

## Part 3: Real-Time Bidding (RTB) Integration

{% part_toc(prev_part="Part 2: High-Level Architecture", next_part="Part 4: ML Inference Pipeline") %}
<ul>
<li><a href="#ad-inventory-model-and-monetization-strategy">Ad Inventory Model and Monetization Strategy</a>
<span class="part-toc-desc">Internal vs external inventory, business model, revenue optimization</span></li>
<li><a href="#openrtb-protocol-deep-dive">OpenRTB Protocol Deep Dive</a>
<span class="part-toc-desc">Protocol specification, request/response format, bid construction</span></li>
<li><a href="#rtb-timeout-handling-and-partial-auctions">RTB Timeout Handling and Partial Auctions</a>
<span class="part-toc-desc">Timeout strategies, partial bid handling, latency tail management</span></li>
<li><a href="#connection-pooling-and-http-2-multiplexing">Connection Pooling and HTTP/2 Multiplexing</a>
<span class="part-toc-desc">Connection reuse, request multiplexing, performance optimization</span></li>
<li><a href="#geographic-distribution-and-edge-deployment">Geographic Distribution and Edge Deployment</a>
<span class="part-toc-desc">Regional presence, latency reduction, edge caching</span></li>
<li><a href="#rtb-geographic-sharding-and-timeout-strategy">RTB Geographic Sharding and Timeout Strategy</a>
<span class="part-toc-desc">Regional clusters, bidder health scoring, early termination, implementation details</span></li>
<li><a href="#the-100ms-rtb-timeout-why-multi-tier-optimization-is-mandatory">The 100ms RTB Timeout: Why Multi-Tier Optimization is Mandatory</a>
<span class="part-toc-desc">Physics constraints, mandatory optimizations, latency budget reality</span></li>
</ul>
{% end %}

### Ad Inventory Model and Monetization Strategy

Before diving into OpenRTB protocol mechanics, understanding the **business model** is essential. Modern ad platforms monetize through two complementary inventory sources that serve different strategic purposes.

> **Architectural Driver: Revenue Maximization** - Dual-source inventory (internal + external) maximizes fill rate, ensures guaranteed delivery, and captures market value through real-time competition. This model generates 30-48% more revenue than single-source approaches.

#### What is Internal Inventory?

**Internal Inventory** refers to ads from **direct business relationships** between the publisher and advertisers, stored in the publisher's own database with pre-negotiated pricing. This contrasts with external RTB, where advertisers bid in real-time through programmatic marketplaces.

**Four types of internal inventory:**

1. **Direct Deals**: Sales team negotiates directly with advertiser
   - Example: Nike pays $5 CPM for 1M impressions on sports pages over 3 months
   - Revenue: Predictable, guaranteed income
   - Use case: Premium brand relationships, custom targeting

2. **Guaranteed Campaigns**: Contractual commitment to deliver specific impressions
   - Example: "Deliver 500K impressions to males 18-34 at $8 CPM"
   - Publisher must deliver or face penalties; gets priority in auction
   - Use case: Campaign-based advertising with volume commitments

3. **Programmatic Guaranteed**: Automated direct deals with fixed price/volume
   - Same economics as direct deals but transacted via API
   - Use case: Automated campaign management at scale

4. **House Ads**: Publisher's own promotional content (**NOT paid advertising inventory**)
   - **What they are**: Publisher's internal promotions like "Subscribe to newsletter", "Download our app", "Follow us on social media", "Upgrade to premium"
   - **Revenue**: Base CPM = **$0** - generates **zero advertising revenue** because no external advertiser is paying
   - **Value**: Still beneficial for publisher (drives newsletter signups, app downloads, user engagement, brand building)
   - **Use case**: Last-resort fallback when:
     - RTB auction timed out (no external bids arrived), AND
     - All paid internal inventory is exhausted or budget-depleted
     - **Better to show promotional content than blank ad space** (blank ads damage user trust and long-term CTR)
   - **Important distinction**: House Ads are fundamentally different from paid internal inventory (direct deals, guaranteed campaigns) which generate actual advertising revenue

**Storage:** Internal ad database (CockroachDB) storing:
- Ad metadata: ad_id, advertiser, creative_url
- Pricing: base_cpm (negotiated rate)
- Targeting: targeting_rules (audience criteria)
- Campaign lifecycle: campaign_type, start_date, end_date

All internal inventory has **base CPM pricing determined through negotiation**, not real-time bidding.

#### Why ML Scoring on Internal Inventory?

**The revenue optimization problem:** Base pricing doesn't reflect user-specific value. Two users seeing the same ad have vastly different engagement probabilities.

**Example scenario:**

**Ads:**
- Ad A: Nike running shoes, base CPM = $3.00
- Ad B: Adidas shoes, base CPM = $4.00

**Users:**
- User 1: Marathon runner, frequently clicks running gear
- User 2: Casual walker, rarely clicks athletic ads

**Without ML (naive ranking by base price):**
- Always show Ad B (higher base CPM $4 > $3)
- Actual CTR: User 1 clicks 5%, User 2 clicks 0.5%
- Average eCPM: $4 (no personalization benefit)
- Revenue loss: Showing wrong ad to wrong user

**With ML personalization:**
- **User 1**: ML predicts 5% CTR for Nike, 3% CTR for Adidas
  - Nike eCPM: `0.05 × $3 × 1000 = $150`
  - Adidas eCPM: `0.03 × $4 × 1000 = $120`
  - **Show Nike** (higher predicted value despite lower base price)

- **User 2**: ML predicts 1% CTR for Nike, 0.5% CTR for Adidas
  - Nike eCPM: `0.01 × $3 × 1000 = $30`
  - Adidas eCPM: `0.005 × $4 × 1000 = $20`
  - **Show Nike** (better targeting)

**Revenue formula:**
$$eCPM_{internal} = \text{predicted\\_CTR} \times \text{base\\_CPM} \times 1000$$

**Impact:** ML personalization increases internal inventory revenue by **15-40%** over naive base-price ranking by matching ads to users most likely to engage.

**ML model inputs:**
- User features: age, gender, interests, 1-hour click rate, 7-day CTR
- Ad features: category, brand, creative type, historical performance
- Context: time of day, device type, page content

**Implementation:** GBDT model (40ms latency) predicts CTR for 100 candidate ads, converts to eCPM, outputs ranked list.

#### Why Both Internal AND External Sources?

Modern ad platforms cannot survive on a single source. The economics require both.

**If you only had Internal Inventory:**
- Limited demand (only advertisers you can negotiate with directly)
- Unsold inventory (if direct deals don't fill all slots → blank ads → $0 revenue)
- Large sales team overhead to negotiate each deal
- No market price discovery
- Inflexible (can't quickly adjust to demand changes)

**Example failure:** Platform has 100M daily impressions, but direct deals cover only 40M (40% fill rate). Remaining 60M impressions go unsold = **60% revenue waste**.

**If you only had External RTB:**
- No guaranteed revenue (bids fluctuate unpredictably)
- Can't offer guaranteed placements to premium advertisers
- DSP fees (10-20% taken by intermediaries)
- Race to bottom (competing with all publishers → lower prices)
- No control over advertiser quality

**Example failure:** Premium advertiser wants guaranteed 1M impressions on sports section. RTB can't guarantee delivery (depends on real-time bidding). Advertiser goes to competitor with direct deals. You lose **high-value relationship**.

**Dual-source optimum:**

<style>
#tbl_revenue_source + table th:first-of-type  { width: 20%; }
#tbl_revenue_source + table th:nth-of-type(2) { width: 15%; }
#tbl_revenue_source + table th:nth-of-type(3) { width: 35%; }
#tbl_revenue_source + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_revenue_source"></div>

| Source | % Impressions | Characteristics | Daily Revenue (100M impressions) |
|--------|---------------|-----------------|----------------------------------|
| Guaranteed campaigns | 25% | Contractual, high priority | $200K ($8 avg eCPM) |
| Direct deals | 10% | Negotiated, premium pricing | $60K ($6 avg eCPM) |
| External RTB | 60% | Fills unsold inventory | $240K ($4 avg eCPM) |
| House ads | 5% | **Publisher's own promos** - fallback when paid inventory exhausted | **$0 ad revenue** (not paid advertising) |
| **TOTAL** | **100%** | **All slots filled** | **$500K/day** |

**Without RTB (internal only):** 35M filled, 65M blank → $260K/day (**48% loss**)
**Without internal (RTB only):** No premium deals, avg drops to $3.50 eCPM → $350K/day (**30% loss**)

**Unified auction:** Internal and external compete. Highest eCPM wins regardless of source. Publisher maximizes revenue while ensuring 100% fill rate and maintaining premium advertiser relationships.

#### External RTB: Industry-Standard Programmatic Marketplace

**Protocol:** OpenRTB 2.5 - industry standard for real-time bidding

**How RTB works:**
1. Ad server broadcasts bid request to 50+ DSPs with user context
2. DSPs run their own ML internally and respond with bids within 100ms
3. Ad server collects responses: `[(DSP_A, $180), (DSP_B, $160), ...]`
4. DSP bids already represent eCPM (no additional scoring needed by publisher)

**Why no ML re-scoring on RTB bids:**
- DSPs already scored internally (their bid reflects confidence)
- Re-scoring would add 40ms latency → 140ms total (exceeds budget)
- OpenRTB standard treats DSP bids as authoritative
- Minimal accuracy gain for significant latency cost
- Trust model: DSPs know their advertisers best

**Latency:** 100ms timeout (industry standard, critical path bottleneck)

**Revenue implications:** RTB provides market-driven pricing. When demand is high, bids increase automatically. When low, internal inventory fills gaps - ensuring revenue stability.

*The sections below detail OpenRTB protocol implementation, timeout handling, and DSP integration mechanics.*

### OpenRTB Protocol Deep Dive

The OpenRTB 2.5 specification defines the standard protocol for programmatic advertising auctions.

**Note on Header Bidding vs Server-Side RTB:** This architecture focuses on **server-side RTB** where the ad server orchestrates auctions on the backend. However, **header bidding** (client-side auctions) now dominates programmatic advertising, accounting for ~70% of revenue for many publishers. Header bidding trades higher latency (adds 100-200ms client-side) for better auction competition - browsers run parallel auctions before the page loads. The choice depends on monetization strategy: header bidding maximizes revenue per impression through broader participation, while server-side RTB optimizes user experience through tighter latency control. Many platforms use hybrid approaches (header bidding for web, server-side for mobile apps where client latency matters more).

**A typical server-side RTB request-response cycle:**

{% mermaid() %}
sequenceDiagram
    participant AdServer as Ad Server
    participant DSP1 as DSP #1
    participant DSP2 as DSP #2-50
    participant Auction as Auction Logic

    Note over AdServer,Auction: 150ms Total Budget

    AdServer->>AdServer: Construct BidRequest<br/>OpenRTB 2.x format

    par Parallel DSP Calls (100ms timeout each)
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
    Auction->>Auction: Run First-Price Auction<br/>Highest eCPM wins
    Auction-->>AdServer: Winner + Price

    AdServer-->>DSP1: Win notification<br/>(async, best-effort)

    Note over AdServer,Auction: Total elapsed: ~35ms
{% end %}

**OpenRTB BidRequest Structure:**

The ad server sends a JSON request to DSPs containing:

- **id**: Unique request identifier (e.g., "req_12345")
- **imp** (impressions): Array of available ad slots
  - **id**: Impression identifier
  - **banner**: Ad dimensions (width × height, e.g., 320×50 pixels)
  - **bidfloor**: Minimum acceptable bid price (e.g., $2.50)
  - **bidfloorcur**: Currency code (e.g., "USD")
- **user**: User information
  - **id**: Hashed user identifier (privacy-safe)
  - **geo**: Geographic data (country, region/state)
- **device**: Device information
  - **ua**: User agent string (browser/app)
  - **ip**: IP address
  - **devicetype**: Device category (mobile, tablet, desktop, etc.)
- **tmax**: Maximum response time in milliseconds (typically 30-50ms)

**OpenRTB BidResponse Structure:**

DSPs respond with a JSON structure containing:
- **id**: Matches the request ID for correlation
- **seatbid**: Array of seat bids (one per bidder)
  - **bid**: Array of individual bids
    - **id**: Unique bid identifier
    - **impid**: Which impression this bid is for (matches request)
    - **price**: Bid amount (e.g., 5.50)
    - **adm**: Ad markup (HTML/creative content to display)
    - **crid**: Creative ID for tracking
- **cur**: Currency code (e.g., "USD")

### RTB Timeout Handling and Partial Auctions

**Problem:** With 50 DSPs and 100ms timeout, some responses may arrive late. How do we handle partial auctions?

**Strategy 1: Hard Timeout**
- Discard all responses after 100ms
- Run auction with collected bids only
- **Trade-off:** May miss highest bids, reduces revenue

**Strategy 2: Adaptive Timeout**

Maintain per-DSP latency histograms \\(H_{dsp}\\). Set per-DSP timeout \\(T_{dsp}\\):

$$T_{dsp} = \text{min}\left(P_{95}(H_{dsp}), T_{global}\right)$$

where \\(P_{95}(H_{dsp})\\) is the 95th percentile latency for DSP, \\(T_{global} = 100ms\\).

**Strategy 3: Progressive Auction**

- Run preliminary auction at 80ms with available bids
- Update with late arrivals up to 100ms if they beat current winner
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

Example: 1000 QPS, 100ms latency, 10 servers → **10 connections per server**

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

**Latency savings: ~50ms per cold start** - important for minimizing tail latency in RTB auctions.

### Geographic Distribution and Edge Deployment

**Latency Impact of Distance:**

Network latency is fundamentally bounded by the speed of light in fiber:

$$T_{propagation} \geq \frac{d}{c \times 0.67}$$

where \\(d\\) is distance, \\(c\\) is speed of light, 0.67 accounts for fiber optic refractive index[^fiber-refractive].

**Example:** New York to London (5,585 km):
$$T_{propagation} \geq \frac{5,585,000m}{3 \times 10^8 m/s \times 0.67} \approx 28ms$$

**Important:** This 28ms is the **theoretical minimum** - the absolute best case if light could travel in a straight line through fiber with zero processing delays.

**Real-world latency is 2.5-3× higher due to:**
- **Router/switch processing**: 15-20 network hops × 1-2ms per hop = 15-40ms
- **Queuing delays**: Network congestion, buffer waits = 5-15ms
- **TCP/IP overhead**: Connection establishment, windowing = 10-20ms
- **Route inefficiency**: Actual fiber paths aren't straight lines (undersea cables, peering points) = +20-30% distance

**Measured latency** NY-London in practice: **80-100ms round-trip** (vs 28ms theoretical minimum).

This demonstrates why latency budgets must account for real-world networking overhead, not just theoretical limits. The 100ms RTB maximum timeout (industry standard fallback) is impossible to achieve for global DSPs without geographic sharding - regional deployment is mandatory, not optional, to minimize distance and achieve practical 50-70ms response times.

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

**Savings:** From 80-100ms (global) to 15-25ms (regional) = **55-75ms reduction**, allowing significantly more regional DSPs to respond within practical 50-70ms operational timeouts while maintaining high response rates.

### RTB Geographic Sharding and Timeout Strategy

> **Architectural Driver: Latency** - Physics constraints make global DSP participation within 100ms impossible. Geographic sharding with aggressive early termination (50-70ms cutoff) captures 95%+ revenue while maintaining sub-150ms SLO.

**The 100ms Timeout Reality:**

While OpenRTB documentation cites 100ms `tmax` timeouts, **production reality requires more aggressive cutoffs**:

- **Timeout specification (tmax):** 100ms (when we give up waiting)
- **Production target:** 50-70ms p80 for quality auctions
- **Absolute cutoff:** 80ms (capturing 85-90% of DSPs)

**Why the discrepancy?** The 100ms timeout is your **failure deadline**, not your target. High-performing platforms aim for 50-70ms p80 to maximize auction quality.

**Geographic Sharding Architecture:**

Regional clusters call only geographically proximate DSPs:

<style>
#tbl_geo_sharding + table th:first-of-type  { width: 15%; }
#tbl_geo_sharding + table th:nth-of-type(2) { width: 20%; }
#tbl_geo_sharding + table th:nth-of-type(3) { width: 15%; }
#tbl_geo_sharding + table th:nth-of-type(4) { width: 25%; }
#tbl_geo_sharding + table th:nth-of-type(5) { width: 25%; }
</style>
<div id="tbl_geo_sharding"></div>

| Region | Calls DSPs in | Avg RTT | Response Rate (80ms cutoff) | DSPs Called |
|--------|---------------|---------|----------------------------|-------------|
| **US-East** | US + Canada | 15-30ms | 92-95% | 20-25 regional + 10 premium |
| **EU-West** | EU + EMEA | 10-25ms | 93-96% | 25-30 regional + 10 premium |
| **APAC** | Asia-Pacific | 15-35ms | 88-92% | 15-20 regional + 10 premium |

**Premium Tier (10-15 DSPs):** High-value DSPs (Google AdX, Magnite, PubMatic) called globally regardless of latency - their bid value justifies lower response rate (65-75%).

**How Premium Tier DSPs Achieve Global Coverage Within Physics Constraints:**

Major DSPs operate multi-region infrastructure with geographically-distributed endpoints, enabling "global" coverage without violating latency budgets:

**Regional endpoint architecture:**
- **Google AdX**: `adx-us.google.com` (Virginia), `adx-eu.google.com` (Frankfurt), `adx-asia.google.com` (Singapore)
- **Magnite**: `us-east.magnite.com`, `eu-west.magnite.com`, `apac.magnite.com`
- **PubMatic**: Similar regional deployment across major markets

**Request routing per region:**
- **US-East cluster** → calls `adx-us.google.com` (15-25ms RTT) - Within 70ms target
- **EU-West cluster** → calls `adx-eu.google.com` (10-20ms RTT) - Within 70ms target
- **APAC cluster** → calls `adx-asia.google.com` (15-30ms RTT) - Within 70ms target
- **NOT**: US-East → `adx-asia.google.com` (200ms RTT) - Physics impossible

**What "called globally" means:**
- **Global user coverage**: Every user worldwide sees premium DSPs (called from their nearest regional cluster)
- **Physics compliance**: Only regional latencies (15-30ms), not cross-continental calls (200ms)
- **Lower response rate (65-75%)**: Premium DSPs receive higher total QPS across all regions, leading to occasional capacity-based timeouts or rate limiting (not distance-based timeouts)

**Smaller DSPs without multi-region infrastructure** (most Tier 2/3 DSPs) operate single endpoints and are assigned to specific regions only. For example, "BidCo" with a single US datacenter is only called from US-East/West clusters, not from EU or APAC.

**Configuration example:**

Premium DSP configuration (e.g., Google AdX):
- **DSP ID**: google_adx
- **Tier**: 1 (Premium - always included)
- **Multi-region**: Enabled
- **Regional endpoints**:
  - US-East: adx-us.google.com/bid
  - EU-West: adx-eu.google.com/bid
  - APAC: adx-asia.google.com/bid

This architecture resolves the apparent contradiction: premium DSPs are "globally available" (all users can access them) while respecting the 50-70ms operational latency target (each region calls local endpoints only).

**Dynamic Bidder Health Scoring:**

Multi-dimensional scoring (updated hourly):

$$Score_{DSP} = 0.3 \times S_{latency} + 0.25 \times S_{bid rate} + 0.25 \times S_{win rate} + 0.2 \times S_{value}$$

**Tier Assignment:**

<style>
#tbl_tier_assign + table th:first-of-type  { width: 25%; }
#tbl_tier_assign + table th:nth-of-type(2) { width: 20%; }
#tbl_tier_assign + table th:nth-of-type(3) { width: 35%; }
#tbl_tier_assign + table th:nth-of-type(4) { width: 20%; }
</style>
<div id="tbl_tier_assign"></div>

| Tier | Score Range | Treatment | Typical Count |
|------|------------|-----------|---------------|
| **Tier 1 (Premium)** | >80 | Always call from all regions | 10-15 DSPs |
| **Tier 2 (Regional)** | 50-80 | Call if same region + healthy | 20-25 DSPs |
| **Tier 3 (Opportunistic)** | 30-50 | Call only for premium inventory | 10-15 DSPs |

**Early Termination Strategy:**

Progressive timeout tiers:

- **50ms:** First cutoff - run preliminary auction (captures 60-70% of DSPs, 85-88% revenue)
- **70ms:** Second cutoff - update if better bid arrives (captures 85-90% of DSPs, 95-97% revenue)
- **80ms:** Final cutoff - last chance stragglers (captures 90-92% of DSPs, 97-98% revenue)

**Trade-off:** Waiting 70ms→100ms (+30ms) yields only +1-2% revenue. **Not worth the latency cost.**

**Revenue Impact Model:**

$$\text{Revenue}(t) = \sum_{i=1}^{N} P(\text{DSP}_i \text{ responds by } t) \times E[\text{bid}_i] \times \text{CTR}_i$$

**Empirical data:**

<style>
#tbl_timeout_perf + table th:first-of-type  { width: 15%; }
#tbl_timeout_perf + table th:nth-of-type(2) { width: 25%; }
#tbl_timeout_perf + table th:nth-of-type(3) { width: 30%; }
#tbl_timeout_perf + table th:nth-of-type(4) { width: 30%; }
</style>
<div id="tbl_timeout_perf"></div>

| Timeout | DSPs Responding | Revenue (% of max) | Latency Impact |
|---------|----------------|-------------------|----------------|
| 50ms | 30-35 (70%) | 85-88% | Excellent (fast UX) |
| 70ms | 40-45 (85%) | 95-97% | Good (target) |
| 80ms | 45-48 (90%) | 97-98% | Acceptable |
| 100ms | 48-50 (95%) | 98-99% | Slow (diminishing returns) |

**Monitoring:**

**Metrics tracked per DSP (hourly aggregation):**
- Latency percentiles: p50, p95, p99
- Bid metrics: bid_rate, win_rate, avg_bid_value
- Response rates at different timeout thresholds: 50ms, 70ms, 80ms
- Health scoring: health_score, tier_assignment

**Alerts:**
- **P1 (Critical)**: Tier 1 DSP p95 exceeds 100ms for 1+ hour, OR revenue drops below 85% of forecast
- **P2 (Warning)**: Tier 2 DSP degraded, OR overall response rate falls below 75%

#### Implementation: DSP Selection and Request Cancellation

**DSP Selection Logic (Pre-Request Filtering):**

The bidder health scoring system actively **skips slow DSPs before making requests**, not just timing them out after sending:

**DSP Selection Algorithm:**

For each incoming ad request:

1. **Determine user region** from IP address (US-East, EU-West, or APAC)
2. **Calculate health score** for each DSP (based on latency, bid rate, win rate, value)
3. **Assign tier** based on health score threshold
4. **Apply tier-specific selection logic:**
   - **Tier 1 (Premium)**: Always include, regardless of region - multi-region endpoints ensure low latency
   - **Tier 2 (Regional)**: Include only if same region AND score > 50, else SKIP (avoids cross-region latency)
   - **Tier 3 (Opportunistic)**: Include only for premium inventory AND score > 30, else SKIP (saves bandwidth)

5. **Result**: ~25-30 selected DSPs (not all 50)
6. **Savings**: ~40% fewer HTTP requests, reduced bandwidth and tail latency

**Request Cancellation Pattern:**

**Algorithm for parallel DSP requests with timeout:**

{% mermaid() %}
flowchart TD
    Start[Start RTB Auction] --> Context[Create 70ms timeout context]
    Context --> FanOut[Fan-out: Launch parallel HTTP requests<br/>to 25-30 selected DSPs]

    FanOut --> Fast[Fast DSPs 20-30ms]
    FanOut --> Medium[Medium DSPs 40-60ms]
    FanOut --> Slow[Slow DSPs 70ms+]

    Fast --> Collect[Progressive Collection:<br/>Stream bids as they arrive]
    Medium --> Collect
    Slow --> Timeout{70ms<br/>timeout?}

    Timeout -->|Before timeout| Collect
    Timeout -->|After timeout| Cancel[Cancel pending requests]

    Cancel --> RST[HTTP/2: Send RST_STREAM<br/>HTTP/1.1: Close connection]
    RST --> Record[Record timeout per DSP<br/>for health scores]

    Collect --> Check{Collected<br/>sufficient bids?}
    Record --> Check

    Check -->|Yes 95-97%| Auction[Proceed to auction with<br/>available responses]
    Check -->|No| Auction

    Auction --> End[Return winning bid]

    style Timeout fill:#ffa
    style Cancel fill:#f99
    style Auction fill:#9f9
{% end %}

**Key behaviors:**
- **Progressive collection**: Bids processed as they arrive, not blocked until timeout
- **Graceful cancellation**: HTTP/2 stream-level termination preserves connection pool efficiency
- **Monitoring integration**: Timeout metrics update hourly health scores
- **No retries**: Failed/timeout DSPs excluded from current auction

**Key Implementation Details:**

1. **Pre-request filtering**: Tier 3 DSPs don't receive requests for normal inventory → saves ~20-25 HTTP requests per auction
2. **Progressive collection**: Bids collected as they arrive (streaming), not blocking until timeout
3. **Graceful cancellation**: HTTP/2 stream-level cancellation (RST_STREAM) preserves connection pool
4. **Monitoring integration**: Record timeouts per DSP to update health scores hourly

**Statistical Clarification:**

The 100ms timeout is a **p95 target across all DSPs in a single auction**, not per-DSP mean:
- **Per-DSP p95**: 95% of requests to DSP_A individually complete within 80ms
- **Cross-DSP p95**: 95% of auctions have all selected DSPs respond within 100ms (the slowest DSP in the group determines auction latency)
- **Operational target**: 70ms ensures most auctions complete before stragglers arrive, capturing 95-97% revenue

With 25-30 DSPs per auction, the probability that at least one times out increases. The 70ms target mitigates this tail latency risk.

### The 100ms RTB Timeout: Why Multi-Tier Optimization is Mandatory

**Industry Context:** This architecture uses a **100ms timeout for DSP responses**, aligning with industry standard OpenRTB implementations (IAB OpenRTB `tmax` field). However, as demonstrated in the physics analysis and geographic sharding section above, achieving this timeout with global DSP participation is **impossible without aggressive optimization**. This section explains the constraint and why the multi-tier approach (geographic sharding + bidder health scoring + early termination) is not optional - it's mandatory.

The IAB OpenRTB specification defines a `tmax` field (maximum time in milliseconds) but does not mandate a specific value. Real-world implementations vary:
- **Google AdX**: ~100ms
- **Most SSPs**: 100-150ms
- **Magnite CTV**: 250ms
- **This platform**: 100ms p95 target (balances global reach with user experience), with **120ms absolute p99 cutoff** to protect tail latency (see [P99 Tail Latency Defense](#p99-tail-latency-defense-the-unacceptable-tail) for detailed rationale)

**The Physics Reality:**

Network latency is fundamentally bounded by the speed of light. For global DSP communication (showing **theoretical minimums** - real-world latency is 2-3× higher due to routing overhead):

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
- **Total: 210ms** - exceeds even the generous 100ms industry-standard timeout by 2×

Even the theoretical physics limit (66ms one-way, 132ms round-trip) would challenge a 100ms budget, and practical networking makes it far worse.

**Why the 100ms timeout enables global DSP participation:**

With regional deployment and intelligent DSP selection:
- **Regional DSPs** (co-located within ~500km): 15-25ms round-trip - can respond reliably
- **Cross-region DSPs** (1,000-3,000km): 40-80ms round-trip - many can respond within budget
- **Global DSPs** (5,000-10,000km): 100-200ms round-trip - timeout frequently, but high-value bids justify occasional participation

The 100ms budget accepts that some global DSPs will timeout, but captures enough responses to maximize auction competition while maintaining user experience (within 150ms total SLO).

**Why we can't just increase the timeout:**

The 150ms total budget breaks down into three phases: sequential startup, parallel execution (where RTB is the bottleneck), and final sequential processing.

{% mermaid() %}
gantt
    title Request Latency Breakdown (150ms Budget)
    dateFormat x
    axisFormat %L

    section Sequential 0-25ms
    Network overhead 10ms      :done, 0, 10
    Gateway 5ms                :done, 10, 15
    User Profile 10ms          :done, 15, 25

    section Parallel ML Path
    Feature Store 10ms         :active, 25, 35
    Ad Selection 15ms          :active, 35, 50
    ML Inference 40ms          :active, 50, 90
    Idle wait 35ms             :90, 125

    section Parallel RTB Path
    RTB Auction 100ms          :crit, 25, 125

    section Final 125-150ms
    Auction + Budget 8ms       :done, 125, 133
    Serialization 5ms          :done, 133, 138
    Buffer 12ms                :138, 150
{% end %}

**Before parallel execution (30ms):** Network overhead (10ms), gateway routing (5ms), user profile lookup (10ms), and integrity check (5ms) must complete sequentially before the parallel ML/RTB phase begins.

**Parallel execution phase:** Two independent paths start at 30ms (after User Profile + Integrity Check):
- **Internal ML path (65ms):** Feature Store (10ms) → Ad Selection (15ms) → ML Inference (40ms). Completes at 95ms and waits idle for 35ms.
- **External RTB path (100ms):** Broadcasts to 50+ DSPs and waits for responses. Completes at 130ms. **This is the bottleneck** - the critical path that determines overall timing.

**After synchronization (13ms avg, 15ms p99):** Once RTB completes at 130ms, we run Auction Logic (3ms), Budget Check (3ms avg, 5ms p99) via Redis Lua script, add overhead (2ms), and serialize the response (5ms), reaching 143ms avg (145ms p99). The budget check uses Redis Lua script for atomic check-and-deduct (see Part 7: Budget Pacing).

**Buffer (5-7ms):** Leaves 5-7ms headroom to reach the 150ms SLO, accounting for network variance and tail latencies. The 5ms Integrity Check investment is justified by $70M+/year savings in RTB bandwidth costs.

**Key constraint:** Increasing RTB timeout beyond 100ms directly increases total latency. A 150ms RTB timeout would push total latency to 185ms (150 RTB + 25 startup + 10 final), violating the 150ms SLO by 35ms.

**Key architectural insight:** RTB auction (100ms) is the **critical path** - it dominates the latency budget. The internal ML path (Feature Store 10ms + Ad Selection 15ms + ML Inference 40ms = 65ms) completes well before RTB responses arrive, so they run in parallel without blocking each other.

**Why 100ms RTB timeout is the p95 target (with p99 protection at 120ms):**
- **Industry standard**: OpenRTB implementations typically use 100-200ms timeouts
- **Real-world examples**: Most SSPs allow 100-150ms, Magnite CTV uses 250ms
- **This platform's choice**: 100ms p95 target with operational target of 50-70ms, and **120ms absolute p99 cutoff** with forced failure to fallback inventory (see [P99 Tail Latency Defense](#p99-tail-latency-defense-the-unacceptable-tail))
- **Critical constraint**: Without optimization, global DSPs cannot respond within 100ms (physics impossibility shown above)

**The 150ms SLO:**
The 150ms total latency provides good user experience (mobile apps typically timeout at 200-300ms) while accommodating industry-standard RTB mechanics. However, meeting this SLO requires the multi-tier optimization approach described earlier.

**Why Regional Sharding + Bidder Health Scoring are Mandatory (not optional)**

The physics constraints demonstrated above make it clear: **regional sharding is not an optimization - it's a mandatory requirement**. Without geographic sharding, dynamic bidder selection, and early termination, the 100ms RTB budget is impossible to achieve:

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

$$\max \sum_{i \in \text{Selected}} P_i \times V_i \quad \text{subject to } \max(L_i) \leq 100ms$$

Maximize expected revenue while respecting latency constraint.

**Impact of regional sharding:**

- **Before**: Query 50 global DSPs, 20 timeout (40% response rate), avg latency 35ms
- **After**: Query 25 regional DSPs, 23 respond (92% response rate), avg latency 18ms

**Revenue trade-off:**
- Lost access to 25 distant DSPs
- But response rate improved 40% → 92%
- Net effect: **+15% effective bid volume** (more bids received per auction)
- Higher response rate → better price discovery → **+8% revenue per impression**

**Optimization 2: Selective DSP Participation**

With a 100ms timeout budget, prioritize DSPs based on historical performance metrics rather than geography alone:

**DSP Selection Criteria:**

<style>
#tbl_dsp_criteria + table th:first-of-type  { width: 35%; }
#tbl_dsp_criteria + table th:nth-of-type(2) { width: 25%; }
#tbl_dsp_criteria + table th:nth-of-type(3) { width: 40%; }
</style>
<div id="tbl_dsp_criteria"></div>

| DSP Characteristics | Strategy | Reasoning |
|---------------------|----------|-----------|
| **High-value, responsive**<br>(avg bid >$8, p95 latency <80ms) | Always include | Best revenue potential with reliable response |
| **Medium-value, responsive**<br>(avg bid $3-8, p95 latency <80ms) | Include | Good balance of revenue and reliability |
| **Low-value or slow**<br>(avg bid <$3 or p95 >90ms) | Evaluate ROI | May skip to reduce tail latency |
| **Inconsistent bidders**<br>(bid rate <30%) | Consider removal | Unreliable participation wastes auction slots |

**Performance-Based Routing:**

**For each auction, the system:**

1. **Selects DSPs** based on historical performance:
   - Historical p95 latency < 80ms
   - Bid rate > 50%
   - Average bid value justifies inclusion cost
2. **Sends bid requests** to selected DSPs in parallel
3. **Waits** up to 100ms for responses
4. **Proceeds** with whatever bids have arrived by the deadline

**Monitoring & Validation:**

Monitor per-DSP metrics:
- Response rate: \\(P(\text{response} < 100ms) > 0.85\\)
- Average bid value
- Win rate (indicates competitive bidding)
- Revenue contribution per 1000 auctions

Automatically demote underperforming DSPs or increase timeout threshold for consistently slow but high-value partners (up to 120ms).

**Theoretical impact:**

Based on the physics constraints shown above, regional sharding should yield:
- **Latency reduction**: From 5ms (regional) vs 28ms (transcontinental) — up to 5× improvement for distant DSPs
- **Response rate**: DSPs that previously timed out (>100ms) can now respond within budget with regional deployment
- **Revenue impact**: More responsive DSPs → better price discovery (exact uplift depends on DSP mix)
- **Timeout errors**: Eliminated for DSPs within regional proximity (<1000km)

**Conclusion:**

The 100ms RTB timeout aligns with **industry-standard practices**, but achieving it requires **mandatory multi-tier optimization** (not optional enhancements). The three-layer defense is essential:

1. **Geographic sharding (mandatory)**: Regional ad server clusters call geographically-local DSPs only (15-25ms RTT vs 200-300ms global)
2. **Dynamic bidder health scoring (mandatory)**: De-prioritize/skip slow DSPs before making requests based on p50/p95/p99 latency tracking and revenue contribution
3. **Adaptive early termination (mandatory)**: 50-70ms operational target with progressive timeout ladder (not 100ms as primary goal)

> **Architectural Driver: Latency + Revenue** - The 100ms RTB timeout is the **absolute fallback deadline**, not the operational target. The multi-tier optimization approach achieves 60-70ms typical latency while capturing 95-97% of revenue, making the 150ms total SLO achievable with real-world network physics.

**Reality of this approach:**
- **Regional DSP participation**: 60-70ms practical response time enables 92-95% response rates within geographic clusters
- **Selective global participation**: High-value DSPs (Google AdX, Magnite) called globally despite latency risk, justified by revenue contribution
- **Physics compliance**: Acknowledges that NY→Asia (200-300ms RTT) makes global broadcast impossible; regional sharding is not optional

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

<style>
#tbl_stream_proc + table th:first-of-type  { width: 15%; }
#tbl_stream_proc + table th:nth-of-type(2) { width: 12%; }
#tbl_stream_proc + table th:nth-of-type(3) { width: 14%; }
#tbl_stream_proc + table th:nth-of-type(4) { width: 17%; }
#tbl_stream_proc + table th:nth-of-type(5) { width: 13%; }
#tbl_stream_proc + table th:nth-of-type(6) { width: 16%; }
#tbl_stream_proc + table th:nth-of-type(7) { width: 13%; }
</style>
<div id="tbl_stream_proc"></div>

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

<style>
#tbl_batch_proc + table th:first-of-type  { width: 18%; }
#tbl_batch_proc + table th:nth-of-type(2) { width: 20%; }
#tbl_batch_proc + table th:nth-of-type(3) { width: 20%; }
#tbl_batch_proc + table th:nth-of-type(4) { width: 20%; }
#tbl_batch_proc + table th:nth-of-type(5) { width: 22%; }
</style>
<div id="tbl_batch_proc"></div>

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

<style>
#tbl_feature_store + table th:first-of-type  { width: 18%; }
#tbl_feature_store + table th:nth-of-type(2) { width: 18%; }
#tbl_feature_store + table th:nth-of-type(3) { width: 18%; }
#tbl_feature_store + table th:nth-of-type(4) { width: 18%; }
#tbl_feature_store + table th:nth-of-type(5) { width: 28%; }
</style>
<div id="tbl_feature_store"></div>

| Technology | Serving Latency | Feature Freshness | Online/Offline | Vendor |
|------------|----------------|-------------------|----------------|---------|
| **Tecton** | <10ms (p99) | 100ms | Both | SaaS |
| Feast | ~15ms | ~1s | Both | Open-source (no commercial backing since 2023) |
| Hopsworks | ~20ms | ~5s | Both | Open-source/managed |
| Custom (Redis) | ~5ms | Manual | Online only | Self-built |

**Note on Latency Comparisons:** Serving latencies vary significantly by configuration (online store choice, feature complexity, deployment architecture). The figures shown represent typical ranges observed in production deployments, but actual performance depends on workload characteristics and infrastructure choices.

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

Managed feature store (Tecton/Databricks): SaaS fee ≈ 10-15% of one engineer FTE/year (consumption-based pricing varies by usage, contract, and scale)

**Decision**: Managed feature store is **5-8× cheaper** in year one (avoids engineering cost), plus faster time-to-market (weeks vs months). Custom solution only makes sense at massive scale or with unique requirements managed solutions can't support. Note that Tecton uses consumption-based pricing (platform fee + per-credit costs), so actual costs scale with usage.

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

<style>
#tbl_ml_models + table th:first-of-type  { width: 20%; }
#tbl_ml_models + table th:nth-of-type(2) { width: 27%; }
#tbl_ml_models + table th:nth-of-type(3) { width: 26%; }
#tbl_ml_models + table th:nth-of-type(4) { width: 27%; }
</style>
<div id="tbl_ml_models"></div>

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

Recall: ML inference budget = 40ms (out of 150ms total)

$$T_{ml} = T_{feature} + T_{inference} + T_{overhead}$$

* **GBDT:** \\(T_{ml} = 10ms + 8ms + 2ms = 20ms\\) (within budget)
* **DNN:** \\(T_{ml} = 10ms + 30ms + 5ms = 45ms\\) (exceeds budget, requires GPU)
* **FM:** \\(T_{ml} = 10ms + 4ms + 1ms = 15ms\\) (best performance, within budget)

**Accuracy Comparison:**

CTR prediction is fundamentally constrained by signal sparsity - user click rates are typically 0.1-2% in ads, creating severe class imbalance. Model performance expectations:

- **GBDT**: Target AUC 0.78-0.82 - Strong baseline for CTR tasks due to handling of feature interactions via tree splits. Performance ceiling exists because trees can't learn arbitrary feature combinations beyond depth limit.
- **DNN**: Target AUC 0.80-0.84 - Higher theoretical ceiling from learned embeddings and non-linear interactions, but requires significantly more training data (millions of samples) and risks overfitting with sparse signals.
- **FM**: Target AUC 0.75-0.78 - Lower ceiling due to limitation to pairwise feature interactions, but more data-efficient and stable with limited training samples.
- **DeepFM** (Hybrid): Target AUC 0.80-0.82 with 10-15ms latency - Modern approach combining FM's efficient feature interactions with DNN's representation learning. Bridges the GBDT vs DNN gap but adds architectural complexity. Research shows DeepFM outperforms pure FM or pure DNN components alone. Not evaluated here due to less mature production ecosystem compared to GBDT, but worth considering for teams comfortable with hybrid architectures.

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

> **Architectural Driver: Latency** - GBDT's 20ms total inference time (including feature lookup) fits within our 40ms ML budget. We rejected DNNs despite their 2-3% accuracy advantage because their 45ms latency would push the ML path to 75ms, reducing our variance buffer significantly.

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

<style>
#tbl_ml_serving + table th:first-of-type  { width: 22%; }
#tbl_ml_serving + table th:nth-of-type(2) { width: 16%; }
#tbl_ml_serving + table th:nth-of-type(3) { width: 16%; }
#tbl_ml_serving + table th:nth-of-type(4) { width: 14%; }
#tbl_ml_serving + table th:nth-of-type(5) { width: 16%; }
#tbl_ml_serving + table th:nth-of-type(6) { width: 16%; }
</style>
<div id="tbl_ml_serving"></div>

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

   where \\(\frac{dQ}{dt}\\) = traffic growth rate, \\(T_{provision}\\) = node startup (30-40s for modern GPU instances with pre-warmed images), \\(T_{warmup}\\) = model loading (10-15s with model streaming).

   **Example:** Traffic growing at 10K QPS/sec with 40s total startup requires scaling at \\(90\\% - \frac{400 \text{ pods}}{\text{capacity}}\\) to avoid overload during provisioning. Trade-off: GPU node startup latency forces earlier scaling with higher idle capacity cost.

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

**Goal:** Maximize GPU utilization by processing multiple predictions simultaneously, trading a small amount of latency for significantly higher throughput.

**Approach:**
- **Accumulation window**: Wait briefly (milliseconds) to collect multiple incoming requests before running inference
- **Batch size selection**: Balance throughput vs latency
  - Larger batches = better GPU utilization (higher throughput) but longer queuing delay
  - Smaller batches = lower latency but underutilized GPU capacity
- **Finding the sweet spot**: Test with production-like traffic to find where `total_latency = queue_wait + inference_time` stays within your SLA while maximizing `requests_per_second`

**How to determine values:**
1. Measure single-request inference latency (baseline)
2. Incrementally increase batch size and measure both throughput and total latency
3. Stop when latency approaches your budget (e.g., if you have 40ms total budget and queuing adds 10ms, ensure inference completes in <30ms)
4. Consider dynamic batching that adjusts based on queue depth

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

#### Architectural Overview

Tecton implements a declarative feature platform with strict separation between definition (what features to compute) and execution (how to compute them). Critical for ads platforms: achieving sub-10ms p99 serving latency while maintaining 100ms feature freshness for streaming aggregations.

#### Key Architectural Decisions

**1. Flink Integration Model**

**Critical distinction**: Flink is **external to Tecton**, not a computation engine. Flink handles stateful stream preparation (deduplication, enrichment, cross-stream joins) upstream, publishing cleaned events to Kafka/Kinesis. Tecton's engines (Spark Streaming or Rift) consume these pre-processed streams for feature computation.

**Integration pattern**:

{% mermaid() %}
graph LR
    RAW[Raw Events<br/>clicks, impressions<br/>bid requests]
    FLINK[Apache Flink<br/>Data Quality Layer<br/>Deduplication<br/>Enrichment<br/>Cross-stream joins]
    KAFKA[Kafka/Kinesis<br/>Cleaned Events<br/>System Boundary]
    STREAM[Tecton StreamSource<br/>Event Consumer]
    COMPUTE[Feature Computation<br/>Rift or Spark Streaming<br/>Time windows<br/>Aggregations]

    RAW --> FLINK
    FLINK --> KAFKA
    KAFKA --> STREAM
    STREAM --> COMPUTE

    style FLINK fill:#f0f0f0,stroke:#666,stroke-dasharray: 5 5
    style KAFKA fill:#fff3cd,stroke:#333,stroke-width:3px
    style STREAM fill:#e1f5ff
    style COMPUTE fill:#e1f5ff
{% end %}

This separation follows the "dbt for streams" pattern - Flink normalizes data infrastructure concerns (left of Kafka), Tecton handles ML-specific transformations (right of Kafka).

**2. Computation Engine Selection**

Tecton abstracts three engines behind a unified API:

| Engine | Throughput Threshold | Operational Complexity | Strategic Direction |
|--------|---------------------|------------------------|---------------------|
| **Spark** | Batch (TB-scale) | High (cluster management) | Mature, stable |
| **Spark Streaming** | >1K events/sec | High (Spark cluster + streaming semantics) | For high-throughput only |
| **Rift** | <1K events/sec | Low (managed, serverless) | Primary (GA 2025) |

**Rift is Tecton's strategic direction**: Purpose-built for feature engineering workloads, eliminates Spark cluster overhead for the 80% use case. Most streaming features don't exceed 1K events/sec threshold where Spark Streaming's complexity becomes justified.

**3. Dual-Store Architecture**

The offline/online store separation addresses fundamentally different access patterns:

**Offline Store (S3 Parquet)**:
- **Access pattern**: Analytical (time-range scans, point-in-time queries)
- **Consistency model**: Eventual (batch materialization acceptable)
- **Query example**: "All features for user X between timestamps T1-T2"
- **Critical for**: Point-in-time correct training data (prevents label leakage)

**Online Store (Redis)**:
- **Access pattern**: Transactional (single-key lookups)
- **Consistency model**: Strong (latest materialized value)
- **Query example**: "Current features for user X"
- **Critical for**: Inference-time serving (<10ms p99 SLA)
- **Technology choice**: Redis selected over DynamoDB (5ms vs 8ms p99 latency, see detailed comparison in Database Technology Decisions section)

**Why not a unified store?** Columnar formats (Parquet) optimize analytical queries but introduce 100ms+ latency for point lookups. Key-value stores (Redis) can't efficiently handle time-range scans. The dual-store pattern accepts storage duplication to optimize each access pattern independently.

**4. Data Source Abstractions**

Tecton's source types map to different freshness/availability guarantees:

- **BatchSource**: Historical data (S3, Snowflake) - daily/hourly materialization
- **StreamSource**: Event streams (Kafka, Kinesis) - <1s freshness via continuous processing
- **RequestSource**: Request-time context (APIs, DBs) - 0ms freshness, computed on-demand

**Architectural insight**: RequestSource features bypass the online store entirely - computed per-request via Rift. This avoids cache invalidation complexity for contextual data (time-of-day, request headers) that changes per-request.

#### Feature Materialization Flow

For a streaming aggregation feature (e.g., "user's 1-hour click rate"):

{% mermaid() %}
graph TB
    KAFKA[Kafka Events<br/>user_id: 12345, event: click]
    RIFT[Rift Engine<br/>Sliding Window Aggregation]

    ONLINE[(Online Store<br/>Redis)]
    OFFLINE[(Offline Store<br/>S3 Parquet)]

    REQ_SERVE[Inference Request]
    REQ_TRAIN[Training Query<br/>time range: 14 days]

    RESP_SERVE[Response<br/>5ms p99]
    RESP_TRAIN[Historical Data<br/>Point-in-time correct]

    KAFKA -->|Stream Events| RIFT
    RIFT -->|OVERWRITE latest| ONLINE
    RIFT -->|APPEND timestamped| OFFLINE

    REQ_SERVE -->|Lookup user_id| ONLINE
    ONLINE -->|Return current features| RESP_SERVE

    REQ_TRAIN -->|Scan user_id + timestamps| OFFLINE
    OFFLINE -->|Return time-series| RESP_TRAIN

    style RIFT fill:#e1f5ff
    style ONLINE fill:#fff3cd
    style OFFLINE fill:#fff3cd
    style RESP_SERVE fill:#d4edda
    style RESP_TRAIN fill:#d4edda
{% end %}

**Critical property**: Both stores materialize from the **same transformation definition** (executed in Rift), guaranteeing training/serving consistency. The transformation runs once, writes to both stores atomically.

#### Performance Characteristics

**Latency budget allocation** (within 150ms total SLO):
- Feature Store lookup: 10ms (p99)
  - Redis read: 5ms
  - Feature vector assembly: 2ms
  - Protocol overhead: 3ms
- Leaves 40ms for ML inference, 100ms for RTB auction (parallel paths)

**Feature freshness guarantees**:
- Batch: ≤24h (acceptable for long-term aggregations like "30-day CTR")
- Stream: ≤100ms (critical for recent behavior like "last-hour clicks")
- Real-time: 0ms (computed per-request for contextual features)

**Serving APIs**: REST (HTTP/2), gRPC (lower protocol overhead), and SDK (testing/batch) all query the same online store - interface choice driven by client requirements, not architectural constraints.

**Feature Classification and SLA:**

Not all features are equal - different types have different freshness and failure characteristics:

| Feature Type | Examples | Freshness | Fallback on Failure |
|--------------|----------|-----------|---------------------|
| **Stale (Pre-computed)** | 7-day avg CTR, user segment | 1-5 min | Use 1-hour-old cache |
| **Fresh (Contextual)** | Time of day, device battery | Real-time | Compute locally (0ms) |
| **Semi-Fresh** | 1-hour CTR, session ad count | 30-60s | Use 24-hour avg |
| **Static** | Device model, OS version | Daily | Use defaults |

**Distribution:** 70% Stale, 20% Fresh (local), 8% Semi-Fresh, 2% Static

**Feature Store SLA:**

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Latency p99** | <10ms | Fits within 150ms total SLO |
| **Availability** | 99.9% | Matches platform SLA |
| **Freshness** | <60s for streaming | Balance accuracy vs ops complexity |
| **Cache hit rate** | >95% | Redis availability requirement |

**Circuit Breaker Integration:**

Add to Part 2 circuit breaker system (degradation hierarchy):

| Service | Budget | Trip Threshold | Fallback | Revenue Impact |
|---------|--------|----------------|----------|----------------|
| **Feature Store** | 10ms | p99 > 15ms for 60s | Cold start features | -10% |

**Cold Start Fallback Strategy:**

When Feature Store fails/exceeds budget:

**Normal features (35-50 from Redis):**
- User: 7-day CTR, segment, lifetime impressions
- Campaign: historical CTR, bid floor, creative format
- Context: time, location, device, connection type

**Cold start features (8-12, local only):**
- Context: time of day, device type, OS, connection (from request)
- Campaign: bid floor, format (from in-memory cache)
- User: NONE (assume new user)

**Cold start ML model:**
- Simplified GBDT trained on cold start features only
- Latency: 5ms (vs 40ms full model)
- Accuracy: AUC 0.66 vs 0.78 (85% of full model accuracy)
- Revenue impact: -10% (degraded targeting)

**Failure Modes:**

**Mode 1: Individual cache misses (5-10%)** - Use default values, -1-2% revenue

**Mode 2: Partial Redis failure (30-50%)** - Mixed normal + cold start, -4-6% revenue

**Mode 3: Total Redis failure (100%)** - All cold start, -10% revenue, P1 alert

**Mode 4: Latency spike (p99 > 15ms)** - Circuit trips, cold start, -10% revenue

**Monitoring:**

**Metrics:**
- Feature Store latency percentiles (p50, p95, p99)
- Redis cache hit rate (tracked per feature type)
- Cold start fallback rate (features not cached)
- Feature freshness lag (staleness of features)

**Alerts:**
- **P1 (Critical)**: Feature Store p99 > 15ms for 5+ minutes, OR cache hit < 90%, OR cold start > 5%
- **P2 (Warning)**: Feature freshness lag > 5 minutes

#### Build vs. Buy Economics

**Custom implementation costs**:
- Initial: 1 FTE-year (2 senior engineers × 6 months)
- Ongoing: 0.2-0.3 FTE (maintenance, on-call, feature development)
- Infrastructure: ~2% of baseline (storage, compute for materialization jobs)

**Managed Tecton**:
- SaaS fee: 10-15% of 1 FTE/year (consumption-based pricing)
- Infrastructure: Included (though customer pays for online/offline storage)

**Break-even**: Year 1, managed is 5-8× cheaper (avoids engineering cost). Custom only justified at massive scale (>10B features/day) or unique requirements (specialized hardware, exotic data sources).

#### Integration Context

Feature Store sits on the critical path with strict latency requirements:

{% mermaid() %}
graph LR
    AD_REQ[Ad Request<br/>100ms RTB timeout]
    USER_PROF[User Profile Lookup<br/>10ms budget]
    FEAT_STORE[Feature Store Lookup<br/>10ms budget<br/>Redis: 5ms read<br/>Assembly: 2ms<br/>Protocol: 3ms]
    ML_INF[ML Inference<br/>40ms budget<br/>GBDT model]
    AUCTION[Auction Logic<br/>10ms budget]
    BID_RESP[Bid Response<br/>Total: 70ms<br/>Margin: 30ms]

    AD_REQ --> USER_PROF
    USER_PROF --> FEAT_STORE
    FEAT_STORE --> ML_INF
    ML_INF --> AUCTION
    AUCTION --> BID_RESP

    style FEAT_STORE fill:#fff3cd
    style ML_INF fill:#e1f5ff
    style BID_RESP fill:#d4edda
{% end %}

**Architectural constraint**: Feature lookup must complete within 10ms to preserve 40ms ML inference budget. This eliminates database-backed stores (CockroachDB: 10-15ms p99) and necessitates in-memory key-value stores. **Redis selected** (5ms p99) over DynamoDB (8ms p99) for the tightest latency margin.

The diagram below illustrates how features flow through Tecton's architecture - from raw data ingestion through computation and storage, to serving ML inference. The system supports three parallel computation paths optimized for different data freshness requirements: batch (daily updates), streaming (sub-second updates), and real-time (computed per request).

{% mermaid() %}
graph TB
    subgraph "1. Data Sources"
        S3[(S3/Snowflake<br/>Historical batch data)]
        KAFKA[Kafka/Kinesis<br/>Real-time event streams]
        DB[(PostgreSQL/APIs<br/>Request-time data)]
    end

    subgraph "2. Feature Computation Paths"
        BATCH[Path A: Batch Features<br/>Daily aggregations, user profiles<br/>Engine: Spark]
        STREAM[Path B: Stream Features<br/>Time-window aggregations hourly<br/>Engine: Spark Streaming or Rift]
        REALTIME[Path C: Real-Time Features<br/>Computed per request<br/>Engine: Rift]
    end

    subgraph "3. Feature Storage Layer"
        OFFLINE[(Offline Store<br/>S3 Parquet<br/>For ML training)]
        ONLINE[(Online Store<br/>Redis 5ms p99<br/>For serving)]
    end

    subgraph "4. Serving APIs"
        API[Tecton Feature Server<br/>━━━━━━━━━<br/>REST API<br/>gRPC API<br/>Python/Java SDK]
    end

    subgraph "5. Consumers"
        TRAIN[ML Training<br/>Batch jobs]
        INFERENCE[ML Inference<br/>Real-time serving]
    end

    S3 -->|Historical data| BATCH
    KAFKA -->|Event stream| STREAM
    DB -->|Request-time| REALTIME

    BATCH -->|Materialize| OFFLINE
    BATCH -->|Materialize| ONLINE
    STREAM -->|Materialize| ONLINE
    REALTIME -->|Compute on request| API

    OFFLINE -->|Training datasets| TRAIN
    ONLINE -->|Feature lookup| API
    API -->|Features| INFERENCE

    classDef source fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef compute fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef storage fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef serving fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef consumer fill:#f3e5f5,stroke:#4a148c,stroke-width:2px

    class S3,KAFKA,DB source
    class BATCH,STREAM,REALTIME compute
    class OFFLINE,ONLINE storage
    class API serving
    class TRAIN,INFERENCE consumer
{% end %}

**Key architectural points:**

1. **Three computation paths** run independently based on data source characteristics:
   - **Path A (Batch)**: Processes historical data daily for features like "user's average CTR over 30 days"
   - **Path B (Stream)**: Processes real-time events for features like "clicks in last 1 hour"
   - **Path C (Real-Time)**: Computes features on-demand per request for context-specific features

2. **Engine alternatives** (not separate systems):
   - Batch path uses **Spark** for distributed processing
   - Stream path uses **Spark Streaming OR Rift** (Tecton's proprietary engine - choice depends on scale and latency requirements)
   - Real-time path uses **Rift** for sub-10ms computation

3. **Serving API consolidation**: Single Feature Server exposes **three API options** (REST, gRPC, SDK) - these are different interfaces to the same service, not separate deployments

4. **Dual storage purpose**:
   - **Offline Store**: Provides point-in-time consistent training datasets for ML model training
   - **Online Store**: Optimized for low-latency feature lookup during real-time inference (<10ms p99)

**Feature Freshness Guarantees:**

- **Batch features:** \\(t_{fresh} \leq 24h\\)
- **Stream features:** \\(t_{fresh} \leq 100ms\\)
- **Real-time features:** \\(t_{fresh} = 0\\) (computed per request)

**Latency SLA:**
$$P(\text{FeatureLookup} \leq 10ms) \geq 0.99$$

Achieved with Redis (selected):
- Redis p99 latency: 5ms (selected over DynamoDB's 8ms for tighter margin)
- Feature vector assembly: 2ms
- Protocol overhead: 3ms
- **Total**: 10ms budget fully allocated

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

To achieve high cache hit rates with sub-10ms latency, implement three cache tiers (target: **95% combined hit rate** from L1+L2+L3, with L2/Redis alone providing 85-90% hit rate at 20% coverage):

**Technology Selection: Cache Tier Choices**

**L1 Cache Options:**

<style>
#tbl_l1_cache + table th:first-of-type  { width: 18%; }
#tbl_l1_cache + table th:nth-of-type(2) { width: 12%; }
#tbl_l1_cache + table th:nth-of-type(3) { width: 15%; }
#tbl_l1_cache + table th:nth-of-type(4) { width: 12%; }
#tbl_l1_cache + table th:nth-of-type(5) { width: 23%; }
#tbl_l1_cache + table th:nth-of-type(6) { width: 20%; }
</style>
<div id="tbl_l1_cache"></div>

| Technology | Latency | Throughput | Memory | Pros | Cons |
|------------|---------|------------|--------|------|------|
| **Caffeine (JVM)** | ~1μs | 10M ops/sec | In-heap | Window TinyLFU eviction, lock-free reads | JVM-only, GC pressure |
| Guava Cache | ~1.5μs | 5M ops/sec | In-heap | Simple API, widely used | LRU only, lower hit rate |
| Ehcache | ~1.5μs | 8M ops/sec | In/off-heap | Off-heap option reduces GC | More complex configuration |

**Decision: Caffeine** - Superior eviction algorithm (Window TinyLFU) yields 10-15% higher hit rates than LRU-based alternatives. Benchmarks show ~2x throughput vs. Guava.

**L2 Cache: Redis vs Memcached**

The L2 cache choice came down to one requirement: atomic operations for budget counters. Memcached is faster (3ms vs 5ms p99) and cheaper (~30% less memory), but it can't do DECRBY/INCRBY atomically. Without atomic operations, budget counters would have race conditions - multiple servers could allocate from stale budget values, causing unbounded over-delivery.

Redis also gives us:
- Rich data structures (sorted sets for ad recency, hashes for attributes)
- Persistence for crash recovery (avoids cold cache startup)
- Lua scripting for complex operations

The 30% memory premium over Memcached is worth it to avoid budget race conditions. Hazelcast (8ms latency) was too slow to consider seriously.

**Valkey Alternative (Redis Fork):**

In 2024, Redis Labs changed licensing from BSD to dual-license (SSPL + proprietary), creating uncertainty for commercial users. The Linux Foundation forked Redis into **Valkey** with permissive BSD-3 license:

- **API-compatible:** Drop-in replacement for Redis
- **Clear licensing:** BSD-3 (no SSPL restrictions)
- **Industry backing:** AWS, Google Cloud, Oracle backing Linux Foundation project
- **Migration path:** AWS ElastiCache transitioning to Valkey

**Recommendation:** Use Valkey for new deployments to avoid licensing ambiguity. Migration from Redis is trivial (same protocol, same commands, same performance).

**L3 Persistent Store Options:**

**Note:** Write throughput numbers reflect **cluster-level performance** at production scale (20-80 nodes for distributed databases). Single-node performance is typically 5-20K writes/sec depending on hardware and workload characteristics.

<style>
#tbl_l3_db + table th:first-of-type  { width: 12%; }
#tbl_l3_db + table th:nth-of-type(2) { width: 12%; }
#tbl_l3_db + table th:nth-of-type(3) { width: 15%; }
#tbl_l3_db + table th:nth-of-type(4) { width: 11%; }
#tbl_l3_db + table th:nth-of-type(5) { width: 11%; }
#tbl_l3_db + table th:nth-of-type(6) { width: 10%; }
#tbl_l3_db + table th:nth-of-type(7) { width: 14%; }
#tbl_l3_db + table th:nth-of-type(8) { width: 14%; }
</style>
<div id="tbl_l3_db"></div>

| Technology | Read Latency (p99) | Write Throughput<br/>(cluster-level) | Scalability | Consistency | HLC Built-in | Pros | Cons |
|------------|-------------------|------------------|-------------|-------------|--------------|------|------|
| **CockroachDB** | 10-15ms | 400K writes/sec<br/>(60-80 nodes) | Horizontal (Raft) | Strong (ACID) | Yes | SQL, multi-region, built-in HLC | License (BSL → Apache 2.0) |
| YugabyteDB | 10-15ms | 400K writes/sec<br/>(60-80 nodes) | Horizontal (Raft) | Strong (ACID) | Yes | PostgreSQL-compatible | Smaller ecosystem |
| Cassandra | 20ms | 500K writes/sec<br/>(100+ nodes) | Linear (peer-to-peer) | Tunable (eventual) | No | Multi-DC, mature | No JOINs, eventual consistency |
| PostgreSQL | 15ms | 50K writes/sec<br/>(single node) | Vertical + sharding | ACID transactions | No | SQL, JOINs, strong consistency | Manual sharding complex |
| DynamoDB | 10ms | 1M writes/sec<br/>(auto-scaled) | Fully managed | Eventual/strong | No | Auto-scaling, no ops | Vendor lock-in, cost at scale |

**Why CockroachDB**

The persistent store needs to handle 400M user profiles (4TB+) with strong consistency for billing data. Cassandra looked appealing initially - higher write throughput (500K vs 400K writes/sec), battle-tested at scale. But eventual consistency is a nightmare for financial data. I'd need to build custom HLC implementation (~150 lines), reconciliation logic, and explain to auditors why our billing system uses "eventual consistency."

CockroachDB gives me what I need without custom code:
- Serializable ACID transactions (financial accuracy requirement)
- Built-in HLC for timestamp ordering across regions
- Multi-region geo-partitioning with quorum writes
- Full SQL + JOINs (vs learning CQL)
- Better read latency: 10-15ms vs Cassandra's 20ms

YugabyteDB would also work here (similar architecture, PostgreSQL-compatible). I picked CockroachDB for slightly more mature multi-region tooling, but either is fine.

PostgreSQL doesn't scale horizontally without manual sharding (Citus adds complexity without HLC or native multi-region support).

**Database cost comparison at 8B requests/day:**

| Database | Relative Cost | Trade-offs |
|----------|---------------|------------|
| **DynamoDB** | 100% (managed baseline) | Fully managed, eventual consistency default, vendor lock-in |
| **CockroachDB** (60-80 nodes, self-hosted) | 10-15% of DynamoDB | Self-managed infrastructure, strong consistency, multi-region native, HLC built-in |
| **PostgreSQL** (sharded, self-hosted) | 8-12% of DynamoDB | Self-managed, no native multi-region, complex sharding |

**CockroachDB self-hosted at scale is 7-10× cheaper** than DynamoDB at billions of requests/day (infrastructure costs only), while providing strong consistency and native multi-region support.

**Important Caveats on Cost Comparison:**
- **Workload dependency**: The 7-10× advantage applies to **write-heavy workloads** at billions of requests/day. For read-heavy or sporadic workloads, DynamoDB's on-demand pricing may be competitive or cheaper.
- **Operational overhead**: Self-hosted CockroachDB requires **2-3 FTEs** for database operations (monitoring, upgrades, capacity planning, incident response). This operational cost (~$300-500K/year fully loaded) should be factored into total cost of ownership (TCO). At smaller scales, managed DynamoDB may have lower TCO despite higher infrastructure costs.
- **Managed vs self-hosted**: CockroachDB Serverless vs DynamoDB has different economics - choose based on operational complexity tolerance and scale.
- **Break-even analysis**: Self-hosted becomes cost-effective when infrastructure savings exceed operational overhead - typically around 1-5B requests/day depending on team costs.

{% mermaid() %}
graph TB
    subgraph "Request Flow"
        REQ[Cache Request<br/>user_id: 12345]
    end

    subgraph "L1: In-Process Cache"
        L1[Caffeine JVM Cache<br/>10-second TTL<br/>1μs lookup<br/>100MB per server]
        L1_HIT{Hit?}
        L1_STATS[L1 Statistics<br/>Hit Rate: 60%<br/>Avg Latency: 1μs]
    end

    subgraph "L2: Distributed Cache"
        L2[Redis Cluster<br/>30-second TTL<br/>5ms lookup<br/>800GB usable capacity]
        L2_HIT{Hit?}
        L2_STATS[L2 Statistics<br/>Hit Rate: 35%<br/>Avg Latency: 5ms]
    end

    subgraph "L3: Persistent Store"
        L3[CockroachDB Cluster<br/>Multi-Region ACID<br/>10-15ms read<br/>Strong Consistency]
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

Every cache miss adds ~15ms latency (database read vs cache hit). Amazon's study: 100ms latency = 1% revenue loss[^amazon-latency].

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

<style>
#tbl_cache_sizing + table th:first-of-type  { width: 15%; }
#tbl_cache_sizing + table th:nth-of-type(2) { width: 12%; }
#tbl_cache_sizing + table th:nth-of-type(3) { width: 30%; }
#tbl_cache_sizing + table th:nth-of-type(4) { width: 18%; }
#tbl_cache_sizing + table th:nth-of-type(5) { width: 25%; }
</style>
<div id="tbl_cache_sizing"></div>

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

**Goal:** Prevent hot keys (e.g., celebrity users, viral content) from overwhelming a single cache node and creating bottlenecks.

**Approach:**

1. **Detection threshold**: Configure the request rate that triggers replication
   - Too low = unnecessary replication overhead (memory waste across multiple nodes)
   - Too high = hot keys cause bottlenecks before mitigation kicks in
   - Determine based on single-node capacity and typical access patterns

2. **Replication factor selection**: Choose how many replicas to create
   - Calculate: `replicas_needed = hot_key_traffic / single_node_capacity` (rounded up)
   - Trade-off: More replicas = better load distribution but higher memory overhead
   - Consider network topology (replicate across availability zones for resilience)

3. **Load distribution**: Spread reads across replicas
   - Random selection = simple, uniform distribution
   - Locality-aware = lower latency but more complex routing

**How to determine values:**
- Measure your cache node's request handling capacity under load
- Profile your key access distribution (use histograms or probabilistic counters)
- Set detection threshold at 60-80% of single-node capacity to trigger before saturation
- Calculate replication factor dynamically: `max(2, ceil(observed_traffic / node_capacity))`

### Workload Isolation: Separating Batch from Serving Traffic

One critical lesson from large-scale systems: **never let batch workloads interfere with serving traffic**.

**The Problem:**

Hourly batch jobs updating user profiles in CockroachDB (millions of writes/hour) can interfere with serving layer reads for ad personalization. Without isolation, batch writes can:
- Saturate disk I/O (batch writes compete with serving reads)
- Fill up queues and increase latency (p99 latency spikes from 20ms to 200ms)
- Trigger compactions that block reads

**Solution: Read/Write Replica Separation**

**Goal:** Isolate batch write workloads from latency-sensitive serving reads to prevent I/O contention, queue buildup, and compaction-induced stalls.

**Approach:**

1. **Workload characterization**: Measure your read/write ratio and latency requirements
   - Serving traffic: high-volume reads, strict latency SLAs (e.g., <20ms p99)
   - Batch jobs: bursty writes, throughput-focused, can tolerate higher latency

2. **Capacity allocation strategy**: Dedicate infrastructure based on workload intensity
   - Calculate: `batch_capacity = (batch_write_throughput × replication_factor) / node_write_capacity`
   - Calculate: `serving_capacity = (serving_read_throughput × safety_margin) / node_read_capacity`
   - Trade-off: Over-provisioning batch capacity wastes resources; under-provisioning causes spillover that degrades serving latency

3. **Consistency vs staleness trade-off**: Decide what staleness is acceptable for serving reads
   - Strong consistency = all reads hit the write leader (no isolation benefit, full contention)
   - Eventual consistency = reads from local replicas (isolation achieved, but data may be slightly stale)
   - Determine staleness tolerance based on business requirements (user profiles can tolerate seconds of lag, financial data may require strong consistency)

4. **Topology design**: Pin workloads to specific regions/nodes
   - Use database-specific primitives (range leases, follower reads, read replicas)
   - Concentrate batch writes on dedicated infrastructure
   - Serve reads from separate replicas that aren't absorbing write load

**How to determine capacity split:**
- Profile your workload: measure read QPS, write QPS, and their respective resource consumption
- Calculate resource needs: `serving_nodes = ceil(read_load / (node_capacity × target_utilization))`
- Calculate batch needs: `batch_nodes = ceil(write_load × replication_factor / node_write_capacity)`
- Validate with load testing that serving latency remains stable during batch job execution

**Cost of isolation:**
You're essentially paying for separate infrastructure to prevent contention. The cost is proportional to your batch workload intensity. If batch jobs consume 30% of total database operations, expect to provision roughly 30-40% additional capacity for isolation (accounting for replication overhead).

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
- **Cache key format**: user_id:version (e.g., "user123:v2")

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
<li><a href="#first-price-auctions-industry-standard-for-rtb">First-Price Auctions: Industry Standard for RTB</a>
<span class="part-toc-desc">Winner pays bid, eCPM ranking, transparency</span></li>
<li><a href="#quality-score-and-ad-rank">Quality Score and Ad Rank</a>
<span class="part-toc-desc">Quality-adjusted ranking, ML-based scoring, system architecture</span></li>
<li><a href="#reserve-prices-and-floor-prices">Reserve Prices and Floor Prices</a>
<span class="part-toc-desc">Revenue optimization, dynamic pricing, multi-dimensional reserves</span></li>
<li><a href="#bid-shading-in-first-price-auctions">Bid Shading in First-Price Auctions</a>
<span class="part-toc-desc">ML-based bid optimization, landscape estimation, DSP strategies</span></li>
<li><a href="#computational-complexity">Computational Complexity</a>
<span class="part-toc-desc">First-price O(N log N), implementation considerations</span></li>
<li><a href="#historical-context-second-price-auctions">Historical Context: Second-Price Auctions</a>
<span class="part-toc-desc">GSP for search, VCG mechanism, why RTB shifted to first-price</span></li>
</ul>
{% end %}

### First-Price Auctions: Industry Standard for RTB

Since 2019, the programmatic advertising industry has standardized on **first-price auctions** for Real-Time Bidding (RTB) and display advertising. In a first-price auction, **the winner pays their bid** - not the second-highest bid.

**Why First-Price Became Standard:**

The industry shifted from second-price to first-price auctions to address transparency concerns and bid landscape visibility. Key drivers:
- **Header bidding transparency**: Publishers could see all bids, making second-price manipulation visible
- **Simpler economics**: "Winner pays bid" is easier to explain than second-price mechanisms
- **DSP preference**: Major demand-side platforms (Google DV360, The Trade Desk) prefer first-price with bid shading
- **Revenue impact**: First-price with bid shading generates 5-15% higher revenue in practice (theoretical revenue neutrality assumes perfect shading, but DSPs shade conservatively)

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

**Price Determination (First-Price):**

The winner pays **their bid** (not the second-highest bid):

$$p_w = b_w$$

This is fundamentally different from second-price auctions where winners paid just enough to beat the runner-up.

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

Price paid by B in first-price auction:
$$p_B = b_B = \\$4.00$$

Advertiser B bid $4.00 and pays $4.00 (their full bid).

**Comparison: Second-Price vs First-Price**

In a second-price auction (historical approach), Advertiser B would have paid only $3.33 (just enough to beat A's $500 eCPM). In first-price, they pay their full $4.00 bid.

**The Bid Shading Response:**

First-price auctions incentivize **bid shading** - DSPs use machine learning to predict the minimum bid needed to win and bid slightly above that. This recovers much of the economic efficiency of second-price auctions while maintaining transparency. (See "Bid Shading in First-Price Auctions" section below for details.)

### Quality Score and Ad Rank

Ads are ranked by eCPM = bid × CTR, but in practice **ad quality** also matters for user experience.

**The Quality Problem:**

Consider two advertisers:
- Advertiser X: Bid $10, fast landing page, relevant ad copy → users happy
- Advertiser Y: Bid $11, slow landing page, misleading ad → users complain

Should Y win just because they bid more? This degrades user experience.

**Google's Solution: Quality Score**

Since ~2005, Google Ads has incorporated **Quality Score** into auction ranking:

$$\text{Ad Rank} = \text{Bid} \times \text{Quality Score}$$

**Quality Score Components (1-10 scale):**

Google evaluates three components, though exact weights are not publicly disclosed:

1. **Expected CTR** (highest impact): Historical click-through rate for this keyword/ad combination
2. **Landing Page Experience** (highest impact): Page load speed, mobile-friendliness, content relevance, security (HTTPS)
3. **Ad Relevance** (moderate impact): How well ad text matches search query intent

**Note:** Research shows improving CTR or Landing Page Experience has roughly twice the impact of improving Ad Relevance. Focus optimization efforts on the top two components.

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
        FIRST_PRICE[First-Price Auction<br/>Rank & Select Winner<br/>< 5ms]
        RESULT[Auction Result<br/>Winner + Price<br/>Click/Impression Event]

        AUCTION --> CACHE_LOOKUP
        CACHE_LOOKUP -->|Hit| CACHE_HIT
        CACHE_LOOKUP -->|Miss| CACHE_MISS
        CACHE_HIT --> COMPUTE
        CACHE_MISS --> COMPUTE
        COMPUTE --> FIRST_PRICE
        FIRST_PRICE --> RESULT
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
    style FIRST_PRICE fill:#fff4e1
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

**Relationship to First-Price Auctions:**

Quality-adjusted first-price auctions work the same way:
- Rank by: Bid × CTR × Quality Score (Ad Rank)
- Pay: Your bid (first-price)

The quality score affects ranking (who wins) but not the fundamental pricing (winner pays bid). This encourages advertisers to improve landing pages, ad relevance, and user experience to achieve better ad positions at lower bids.

### Computational Complexity

**First-Price Auction Complexity:**

- Sort advertisers by eCPM: \\(O(N \log N)\\)
- Select winner and compute price: \\(O(1)\\) (winner pays bid - no second-price calculation needed)
- **Total: \\(O(N \log N)\\)**

For \\(N = 50\\) DSPs:
- First-price: ~282 operations (sort + select)

**Latency Impact:**

At 5ms budget for auction logic:
- First-price auction: easily achievable
- Sorting 50 DSPs by eCPM: <1ms with optimized comparisons
- Winner selection: <0.1ms (just pick highest eCPM)

**Implementation Note:** First-price auctions are computationally identical to second-price auctions (both O(N log N)). The difference is purely in pricing: first-price returns the winner's bid, while second-price calculates the minimum bid needed to beat the runner-up.

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
- Simulate different reserve prices offline and estimate revenue impact
- Run A/B tests with small traffic percentages to validate optimal reserve
- Monitor fill rate vs. revenue trade-off continuously

**Multi-Dimensional Reserve Prices:**

In practice, reserve prices are often **segmented** by:
- **Geo**: Higher reserves for premium markets (US/UK) vs. developing markets
- **Device**: Mobile vs. desktop vs. CTV (Connected TV)
- **User segment**: High-value users (purchase intent) vs. casual browsers
- **Time of day**: Peak hours vs. off-peak
- **Inventory quality**: Above-the-fold vs. below-the-fold

**Implementation Note:**

Reserve prices work identically in first-price and second-price auctions - they filter out bids below the threshold before ranking. The difference is only in what the winner pays (their bid vs. second-highest bid).

### Bid Shading in First-Price Auctions

With first-price auctions, DSPs face a strategic problem: bidding true value guarantees zero profit (you pay exactly what the impression is worth to you). This creates the **bid shading** optimization problem.

**The Bid Shading Problem:**

In first-price auctions:
- **Bid too high**: You win but overpay (negative ROI)
- **Bid too low**: You lose to competitors (missed opportunity)
- **Optimal strategy**: Bid just above the second-highest bidder (but you don't know their bid!)

**How Bid Shading Works:**

DSPs use machine learning to predict the **competitive landscape** and bid strategically:

1. **Collect historical data**: Track wins, losses, and winning prices across millions of auctions
2. **Build bid landscape model**: For each impression context (user, publisher, time), predict:
   - Probability of winning at price \\(p\\): \\(P(\text{win} | \text{bid} = p)\\)
   - Distribution of competitor bids
3. **Optimize bid**: Choose bid \\(b\\) that maximizes expected profit:

$$b^* = \arg\max_b \left[ (v - b) \times P(\text{win} | b) \right]$$

where \\(v\\) is the true value of the impression to the advertiser.

**Example:**

Suppose an advertiser values an impression at $5.00 (based on predicted conversion rate). The bid landscape model predicts:
- Bid $5.00: 90% win rate (no profit - paying true value)
- Bid $4.00: 75% win rate (expected profit: $1.00 × 75% = $0.75)
- Bid $3.50: 60% win rate (expected profit: $1.50 × 60% = $0.90)
- Bid $3.00: 40% win rate (expected profit: $2.00 × 40% = $0.80)

**Optimal bid: $3.50** (maximizes expected profit at $0.90 per auction)

**Why First-Price + Bid Shading ≈ Second-Price:**

Bid shading recovers much of the economic efficiency of second-price auctions:
- **Second-price**: Winner pays second-highest bid (e.g., $3.40)
- **First-price + shading**: Winner bids slightly above predicted second-price (e.g., $3.50)

The ~$0.10 difference represents the DSP's uncertainty about the competitive landscape. As bid landscape models improve, first-price with shading converges toward second-price revenue.

**System Design Implications:**

From the SSP (supply-side platform) perspective:
- **Expect strategic bidding**: DSPs will NOT bid true value - this is intentional and economically efficient
- **Bid landscape opacity**: Don't share winning bid distributions (preserves auction integrity)
- **Revenue impact**: First-price with bid shading can generate approximately 5-15% higher revenue than second-price in practice, though exact figures vary by market conditions and DSP sophistication. The revenue lift comes from imperfect bid shading - DSPs tend to shade conservatively to avoid losing auctions, resulting in slightly higher clearing prices.

**Implementation Note:** SSPs don't implement bid shading - that's the DSP's responsibility. The SSP simply runs a first-price auction (rank by eCPM, winner pays bid). The complexity of bid optimization happens on the demand side.

### Historical Context: Second-Price Auctions

Before 2019, the programmatic advertising industry primarily used **second-price auctions** (specifically, Generalized Second-Price or GSP auctions). Understanding this history helps explain design decisions in legacy systems and why the industry shifted to first-price.

**Why Second-Price Was Popular (2000s-2018):**

1. **Theoretical elegance**: Encouraged truthful bidding (in theory)
2. **Simpler for advertisers**: "Bid your true value" was easier to explain than bid shading
3. **Google's influence**: Google Search Ads used GSP successfully, setting industry precedent
4. **Established ecosystem**: Bidding algorithms optimized for second-price dynamics

**How Second-Price (GSP) Works:**

In a second-price auction, the winner pays **just enough to beat the second-highest bidder**:

$$p_w = \frac{\text{eCPM}_{2nd}}{\text{CTR}_w \times 1000} + \epsilon$$

where \\(\epsilon\\) is a small increment (e.g., $0.01).

**Example:**

| Advertiser | Bid    | CTR  | eCPM           | Rank |
|------------|--------|------|----------------|------|
| A          | $5.00  | 0.10 | $500 | 2    |
| B          | $4.00  | 0.15 | $600 | 1    |
| C          | $6.00  | 0.05 | $300 | 3    |

Winner: Advertiser B (highest eCPM = $600)

Price paid by B in **second-price**:
$$p_B = \frac{500}{0.15 \times 1000} = \\$3.33$$

Advertiser B bid $4.00 but only pays $3.33 (just enough to beat A's $500 eCPM).

**Why the Industry Shifted to First-Price (2017-2019):**

Several factors drove the migration:

1. **Header bidding transparency**: Publishers could see all bids simultaneously, making second-price "bid reduction" visible and contentious
2. **Price floor manipulation**: SSPs could manipulate second-price auctions by setting floors strategically
3. **Complexity**: Second-price pricing logic was opaque ("Why did I pay $3.33 when I bid $4.00?")
4. **DSP preference**: Major DSPs (Google DV360, The Trade Desk) preferred first-price with their own bid shading
5. **Revenue impact**: First-price with bid shading generates 5-15% higher revenue in practice (DSPs shade conservatively)

**Timeline:**

- **2017**: AppNexus (now Xandr) pioneered first-price for programmatic
- **2018**: Google AdX announced transition to first-price
- **2019**: Industry-wide shift complete - first-price became standard for RTB

**GSP Still Used for Sponsored Search:**

Google Search Ads, Microsoft Ads, and Amazon Sponsored Products still use **GSP (second-price)** because:
- Established advertiser ecosystems
- Different transparency requirements (no header bidding)
- Decades of advertiser education and tooling
- Network effects (switching cost too high)

**Key Difference: Search vs. Display:**

| Auction Type | Used For | Pricing |
|--------------|----------|---------|
| **GSP (Second-Price)** | Sponsored search (Google Search Ads) | Winner pays second-highest + $0.01 |
| **First-Price** | Programmatic display/video/CTV (RTB) | Winner pays their bid |

**This blog focuses on first-price auctions** because they are the modern standard for Real-Time Bidding (RTB) and programmatic display advertising - the architecture described in this document.

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

    ADV --> BUDGET[Atomic Pacing Service]

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

**How it works:**

1. **Atomic Pacing Service** pre-allocates budget chunks to Ad Servers (e.g., $50, $75, $100)
2. **Ad Servers** spend from local allocation using **Redis atomic counters** (no coordination needed)
3. **Periodic reconciliation** (every 30 seconds): Ad Servers return unused budget to Atomic Pacing Service
4. **CockroachDB** records all spend events with **HLC (Hybrid Logical Clock) timestamps** for globally ordered audit trail
5. **Timeout Monitor** releases stale allocations after 5 minutes (handles server crashes)
6. **Dynamic Throttle** reduces allocation size when budget < 10% remaining (prevents over-delivery)

**Budget Allocation Operations:**

**Allocation request** (Ad Server requests budget chunk):
- Operation: Atomically decrement global budget counter (e.g., deduct $50)
- Returns: Remaining budget or error if insufficient
- Frequency: Every 30-60 seconds per Ad Server

**Reconciliation** (Ad Server returns unused budget):
- Operation: Atomically increment global budget counter (e.g., return $8 unused)
- Returns: Updated budget total
- Frequency: When allocation period expires or Ad Server scales down

**Key Properties:**

- **Atomic operations**: `DECRBY` is atomic, prevents race conditions
- **No coordination latency**: Each Ad Server decides locally
- **Bounded over-delivery**: Maximum over-delivery = (# servers) × (allocation size)
- **Self-healing**: Timeout monitor recovers from server failures

**Mathematical Analysis:**

**Over-Delivery Bound:**

Maximum over-delivery: $$\text{OverDelivery}_{max} = S \times A$$

where \\(S\\) = number of servers, \\(A\\) = allocation chunk size.

**Example:** 100 servers with $100 allocation each → **max $10,000 over-delivery** (10% of $100K daily budget).

**Mitigation:** Dynamic allocation sizing.

When budget remaining drops below 10%:
$$A_{new} = \frac{B_r}{S \times 10}$$

This reduces max over-delivery to **~1% of budget**.

#### The Critical Path: Synchronous Budget Check (5ms)

**The Missing Piece:** The pre-allocation strategy above handles **periodic budget allocation** (every 30-60s), but **doesn't explain the per-request budget check** that must happen on EVERY ad request at 1M QPS. This synchronous check is the critical path component that ensures financial accuracy while meeting the 150ms SLO.

**The Challenge at 1M QPS:**

Naive approach (query CockroachDB on every request):
- Latency: 10-15ms per query (p99)
- **Result:** Violates 150ms SLO (adds 10-15ms to critical path)
- Throughput: Creates massive database contention

**Solution: Bounded Micro-Ledger (BML) Architecture**

The BML system provides **three-tier budget enforcement** that achieves both low latency (3-5ms) and financial accuracy (bounded overspend):

**Three-Tier BML Architecture (Critical Financial Atomicity Mechanism):**

**Tier 1: Synchronous Budget Check (Redis Lua Script - 3ms)**
- **Component**: Atomic Pacing Service executes Lua script in Redis
- **Function**: Check if `current_spend + cost ≤ budget_limit + INACCURACY_BOUND`
- **Critical Property**: The `INACCURACY_BOUND` (typically 0.5-1% of budget_limit, e.g., $5 for $1000 budget or $50 for $10K budget) is the mathematical guarantee that ensures ≤1% billing accuracy
- **Atomicity**: Lua script runs single-threaded in Redis, preventing race conditions
- **Latency**: 3ms avg (5ms p99) - fits within critical path budget

**Tier 2: Asynchronous Delta Propagation (Redis → Kafka)**
- **Component**: Redis publishes spend deltas to Kafka topic
- **Function**: Stream of spend events for audit trail and reconciliation
- **Frequency**: Every 5 seconds per campaign or on threshold (e.g., $100 cumulative change)
- **Event format**: `{campaign_id, spend_delta, timestamp, transaction_id}`
- **Implementation**: After Lua script completes successfully, Atomic Pacing Service emits event to Kafka asynchronously (non-blocking, does not impact 3ms budget)

**Tier 3: Reconciliation Processor (Flink/Kafka Streams → CockroachDB)**
- **Component**: Flink job consumes Kafka stream and batch-commits to CockroachDB
- **Function**: Maintain strong-consistency ledger as source of truth
- **Batch window**: 30-second aggregation window
- **Strong consistency**: CockroachDB ACID transactions with HLC timestamps
- **Periodic sync**: Every 60s, sync Redis counters from CockroachDB to correct drift

**Why This Three-Tier Architecture is Required:**
- **Tier 1** alone: Fast but lacks audit trail and drift correction
- **Tier 3** alone: Accurate but too slow (10-15ms) for 1M QPS critical path
- **Combined**: 3ms latency + mathematical bounded overspend + immutable audit trail

{% mermaid() %}
graph TB
    subgraph "Synchronous Tier (3ms - Critical Path)"
        REQ[Ad Request<br/>1M QPS] --> AUCTION[Auction Selects Winner<br/>Ad from Campaign X<br/>Cost: $2.50]
        AUCTION --> BML_CHECK{BML: Atomic<br/>Check & Deduct}

        BML_CHECK -->|Budget OK| REDIS_LUA[Redis Lua Script<br/>ATOMIC:<br/>if spend+cost < limit+bound<br/>  then deduct<br/>Latency: 3ms]

        REDIS_LUA -->|SUCCESS| SERVE[Serve Ad<br/>Revenue: $2.50]
        BML_CHECK -->|Budget EXHAUSTED| NEXT[Try Next Bidder<br/>or House Ad]
    end

    subgraph "Asynchronous Tier (Reconciliation)"
        REDIS_LUA -.->|Emit delta<br/>every 5s| KAFKA[Kafka<br/>Spend Events]
        KAFKA -.-> FLINK[Flink<br/>Aggregate]
        FLINK -.->|Batch commit<br/>every 30s| CRDB[(CockroachDB<br/>Billing Ledger<br/>Source of Truth)]
    end

    CRDB -.->|Periodic sync<br/>every 60s| REDIS_LUA

    classDef critical fill:#ffcccc,stroke:#cc0000,stroke-width:2px
    classDef async fill:#ccffcc,stroke:#00cc00,stroke-dasharray: 5 5

    class REQ,AUCTION,BML_CHECK,REDIS_LUA,SERVE critical
    class KAFKA,FLINK,CRDB async
{% end %}

**Bounded Micro-Ledger (BML) Components:**

**1. Synchronous Tier: Redis Atomic Counter (3ms Budget)**

Purpose: Fast, atomic check-and-deduct for every ad request

**Atomic Check-and-Deduct Algorithm:**

The algorithm executes atomically within Redis (single-threaded, no concurrent modifications possible):

**Inputs:**
- `campaign_id`: Which campaign to check
- `cost`: Dollars to spend for this ad impression (e.g., $2.50)
- `inaccuracy_bound`: Safety buffer to prevent unbounded overspend (e.g., $5.00)

**Algorithm Steps:**

1. **Read current state** from Redis hash for this campaign:
   - `current_spend`: How much already spent today
   - `budget_limit`: Daily budget cap

2. **Calculate remaining budget:**
   - `remaining = budget_limit - current_spend`

3. **Atomic decision: Check if spend is allowed**
   - **CRITICAL CONDITION** (Key to ≤1% billing accuracy):
     ```
     current_spend + cost ≤ budget_limit + inaccuracy_bound
     ```
   - If TRUE (budget available):
     - Increment spend counter by `cost` atomically
     - Return SUCCESS with new remaining budget
   - If FALSE (budget exhausted):
     - Do NOT modify spend counter
     - Return BUDGET_EXHAUSTED with current remaining

> **Critical Design Property**: The `inaccuracy_bound` parameter in the Lua script condition is the mathematical enforcement mechanism that guarantees ≤1% billing accuracy. By setting `inaccuracy_bound = 0.01 × budget_limit`, we ensure maximum overspend is bounded to 1% of daily budget. This is the ONLY way to achieve bounded financial accuracy while maintaining 3ms latency at 1M QPS.

**Why This is Atomic:**

Redis executes the entire algorithm as a single atomic operation (Lua script runs single-threaded). Even if 1,000 requests arrive simultaneously, Redis processes them serially one-at-a-time, guaranteeing no race conditions.

**Key Properties:**

- **Atomic**: Lua script executes atomically in Redis (single-threaded execution)
- **Fast**: 5ms p99 total latency (3ms script execution + 2ms network RTT)
- **Bounded inaccuracy**: The `inaccuracy_bound` ($5) prevents unbounded overspend
- **High throughput**: Redis handles 1M+ ops/sec per shard

**2. Asynchronous Tier: Reconciliation to CockroachDB**

Purpose: Periodic sync to source of truth for audit trail and accuracy

**Reconciliation Process (Flink Stream Processing Job, runs every 30s):**

**Step 1: Aggregate Spending Deltas**
- Flink consumes spend events from Kafka stream
- Groups events by `campaign_id`
- Aggregates total spend per campaign over 30-second window
- Example: Campaign 12345 spent $2.50 + $3.00 + $1.75 = $7.25 in this window

**Step 2: Batch Commit to CockroachDB**
- Open distributed transaction across CockroachDB cluster
- For each campaign with spending activity:
  - Insert new spending record with HLC timestamp (for global ordering)
  - If campaign record exists, increment cumulative spend counter
  - If campaign record doesn't exist, create new entry
- Commit transaction atomically across all shards
- CockroachDB ensures ACID guarantees and audit trail

**Step 3: Sync Redis from Source of Truth (every 60s)**
- Query CockroachDB for true cumulative spend per campaign
- Update Redis hash with authoritative spend values
- Detect drift: if Redis and CockroachDB differ by >$50, alert operations team
- This corrects any Redis cache inconsistencies (restarts, clock skew, missed events)

**Why Two-Tier Works:**
- **Redis**: Fast but eventually consistent (acceptable for bounded inaccuracy)
- **CockroachDB**: Slow but strongly consistent (source of truth for billing)
- **Reconciliation**: Bridges the gap, keeping Redis approximately correct while maintaining perfect audit trail

**3. Integration with Request Flow**

The budget check sits in the Auction Logic phase:

**Before:**
- Auction Logic (5ms): Sort by eCPM, select winner

**After (with BML):**
- Auction Logic (8ms avg, 10ms p99):
  - Sort by eCPM, select winner: 3ms
  - **Budget check (BML):** 3ms avg (5ms p99) ← **NEW**
  - Overhead: 2ms
  - If budget OK: serve ad
  - If budget exhausted: try next bidder (repeat check)

**Updated Request Flow Timing:**

**Complete request path latency breakdown:**

| Component | Latency | Notes |
|-----------|---------|-------|
| Network + Gateway | 15ms | |
| User Profile | 10ms | |
| Integrity Check | 5ms | Fraud detection (BEFORE RTB) |
| Feature Store | 10ms | |
| Ad Selection | 15ms | |
| ML Inference | 40ms | (parallel execution) |
| RTB Auction | 100ms | **(parallel, critical path)** |
| Auction + Budget Check | 8ms | Budget enforcement |
| Response | 5ms | |
| **Total** | **143ms** | **(5-7ms buffer to 150ms SLO)** |

**Mathematical Proof: Bounded Overspend of $5 per Campaign**

**Theorem:** Maximum overspend per campaign is bounded to the `inaccuracy_bound` value ($5).

**Proof:**

Define:
- \\(B\\) = Daily budget limit
- \\(S(t)\\) = Recorded spend at time \\(t\\)
- \\(\Delta\\) = Inaccuracy bound ($5)
- \\(c_i\\) = Cost of request \\(i\\)

The Lua script allows spend if:
$$S(t) + c_i \leq B + \Delta$$

**Worst case scenario:**
Multiple concurrent requests hit Redis simultaneously before the spend counter updates.

**Maximum concurrent overshoot:**

At most \\(\Delta\\) dollars can be spent beyond the limit because:

1. Once \\(S(t) > B\\), the Lua script rejects ALL future requests
2. The maximum "in-flight" spend that can sneak through is bounded by \\(\Delta\\)
3. Even if 1000 requests arrive at the exact same nanosecond, Redis executes Lua scripts serially

**Mathematical upper bound:**

$$\text{Total Spend} \leq B + \Delta$$

$$\text{Overspend} = \max(0, \text{Total Spend} - B) \leq \Delta = \\$5$$

**Practical example:**

Campaign has $1000 daily budget with $5 inaccuracy bound:
- True limit in Lua script: $1005
- Maximum possible spend: $1005
- Maximum overspend: $5 (0.5% of budget)
- Legally acceptable under standard advertising contracts

**4. Handling Reconciliation Drift**

**Problem:** Redis counter drifts from CockroachDB source of truth due to:
- Redis cache misses/restarts
- Delayed reconciliation
- Clock skew

**Solution: Periodic Sync Procedure (runs every 60s):**

**Algorithm:**

1. **Query Source of Truth**
   - For each active campaign, query CockroachDB billing ledger
   - Compute true cumulative spend: `SUM(spend) WHERE campaign_id = X`
   - This is the authoritative value (immutable audit trail)

2. **Update Redis Cache**
   - Write true spend value to Redis hash for this campaign
   - Overwrite any stale or drifted value
   - Redis now reflects accurate state from source of truth

3. **Detect and Alert on Drift**
   - Read current Redis value before overwriting
   - Calculate drift: `|true_spend - redis_spend|`
   - If drift exceeds threshold ($50):
     - Alert operations team via PagerDuty
     - Log discrepancy for investigation
     - Common causes: Redis node restart, delayed reconciliation, split-brain scenario

**Why Drift Happens:**

- **Redis restarts**: Counter resets to 0, reconciliation hasn't caught up yet
- **Reconciliation lag**: 30-60s delay between spend and CockroachDB commit
- **Network partition**: Redis shard temporarily isolated from reconciliation stream

**Why Drift is Acceptable:**

- Maximum drift bounded by reconciliation window: $X spent in 60s
- For typical campaign ($1,000/day budget): 60s ≈ $0.70 at uniform pacing
- Actual drift usually <$10 (well within $5 inaccuracy bound per transaction)
- Periodic sync corrects drift before it accumulates

**Failure Mode: Tier 3 Reconciliation Outage**

If Flink job or Kafka become unavailable:

1. **Tier 1 continues operating**: Budget checks work normally (Redis is independent)
2. **Impact**: Audit trail writing to CockroachDB is paused
3. **Detection**: Periodic sync (60s) detects drift > $50, alerts operations team via PagerDuty
4. **Recovery**: When Flink recovers, processes backlog from Kafka (Kafka retains events for 7 days)
5. **Maximum data loss**: None - Kafka retention ensures event replay capability
6. **Bounded risk**: Redis continues enforcing spend limits, preventing unbounded overspend

This failure mode demonstrates **graceful degradation**: critical path (Tier 1) remains operational while audit trail temporarily lags. Financial accuracy is maintained via bounded inaccuracy, audit completeness is recovered via Kafka replay.

**Why This Works at 1M QPS:**

1. **Sharding**: Redis cluster sharded by campaign_id (100+ shards)
2. **Per-shard throughput**: 10K QPS per shard (well within Redis capacity)
3. **Latency**: Lua script execution: 1-3ms, network RTT: 1-2ms = **3-5ms total**
4. **Bounded inaccuracy**: $5 overspend is legally acceptable (0.05-0.5% of typical campaign budgets)

**Why CockroachDB Alone Doesn't Work:**

- Latency: 10-15ms p99 (too slow for critical path)
- Throughput: Would require complex sharding strategy
- Contention: Hot campaigns would create write bottlenecks
- Cost: 3× more expensive than Redis for high-frequency operations

**Trade-offs:**

| Approach | Latency | Accuracy | Cost | Scalability |
|----------|---------|----------|------|-------------|
| **CockroachDB only** | 10-15ms (slow) | Perfect | High | Limited |
| **Redis only** | 5ms | Bounded ($5) | Low | Excellent |
| **BML (both tiers)** | 5ms | Bounded + audited | Medium | Excellent |

**Conclusion:**

The Bounded Micro-Ledger architecture achieves the "impossible trinity" of:
1. Low latency (5ms budget check)
2. Financial accuracy (mathematically proven $5 max overspend)
3. High throughput (1M+ QPS)

This is the **only viable architecture** for real-time budget pacing at scale while maintaining financial integrity.

### Fraud Detection: Pattern-Based Abuse Detection

> **Architectural Driver: Financial Accuracy** - While rate limiting (Part 2) controls request **volume**, fraud detection identifies **malicious patterns**. A bot clicking 5 ads/minute might pass rate limits but shows suspicious behavioral patterns. Both mechanisms work together: rate limiting stops volume abuse, fraud detection stops sophisticated attacks.

**What Fraud Detection Does (vs Rate Limiting):**

**Fraud detection** answers: **"Are you malicious?"**
- Bot farm with 95% CTR, uniform timing, rotating IPs → blocked permanently
- Protects advertiser budgets from wasted spend and platform from RTB bandwidth costs ($70M+/year in egress savings from early filtering)

**Rate limiting** answers: **"Are you requesting too much?"** (see Part 2: Rate Limiting)
- Legitimate advertiser making 10K QPS (vs 1K limit) → throttled with 429
- Protects infrastructure capacity and enforces SLA

**Problem:** Detect and block fraudulent ad clicks in real-time without adding significant latency.

**CRITICAL: Integrity Check Service in Request Critical Path**

The **Integrity Check Service (L1 fraud detection)** runs in the synchronous request path immediately after User Profile lookup and **BEFORE** the expensive RTB fan-out to 50+ DSPs. This placement is critical for cost optimization:

**Cost Impact of Early Fraud Filtering:**
- **Without early filtering:** RTB requests go to 50+ DSPs for ALL traffic, including 20-30% bot traffic
- **Bandwidth cost:** Each RTB request = ~2KB payload × 50 DSPs = 100KB per request (typical: 3-4KB uncompressed = 150-200KB)
- **Bot traffic bandwidth waste:** At 1M QPS with 25% fraud = 250K fraudulent requests/sec = 25GB/sec = **64.8PB/month** wasted bandwidth
- **AWS data transfer cost:** ~$0.09/GB egress (first 10TB tier) = **$5.8M/month** wasted on bot traffic RTB calls
- **DSP processing waste:** 50+ DSPs waste CPU cycles processing fraudulent bid requests

**Solution:** 5ms Integrity Check Service blocks 20-30% of fraud BEFORE RTB fan-out, saving $70M+/year in bandwidth + DSP relationship costs.

**Latency Investment vs Cost Savings:**
- Added latency: 5ms (still within 150ms SLO with 5-7ms buffer)
- Annual savings: $70M+ in bandwidth (conservative estimate with 2KB payloads; actual typical payloads of 3-4KB would yield $130M+ savings)
- ROI: **14,000× return** on the 5ms latency investment (conservative; up to 26,000× with typical payload sizes)

**Fraud Types:**

1. **Click Farms:** Bots or paid humans generating fake clicks
2. **SDK Spoofing:** Fake app installations reporting ad clicks
3. **Domain Spoofing:** Fraudulent publishers misrepresenting site content
4. **Ad Stacking:** Multiple ads layered, only top visible but all "viewed"

**Detection Strategy: Multi-Tier Filtering**

{% mermaid() %}
graph TB
    REQ[Ad Request] --> UP[User Profile<br/>10ms]
    UP --> L1{L1: Integrity Check Service<br/>5ms CRITICAL PATH<br/>Runs BEFORE RTB}

    L1 -->|Known bad IP| BLOCK1[Block Request<br/>Bloom Filter<br/>No RTB call made]
    L1 -->|Pass| RTB[RTB Auction<br/>100ms<br/>50+ DSPs]

    RTB --> L2{L2: Behavioral<br/>Post-click analysis<br/>Async}

    L2 -->|Suspicious pattern| PROB[Flag for Review<br/>50% sampled]
    L2 -->|Pass| L3{L3: ML Model<br/>10ms async<br/>Post-impression}

    L3 -->|Fraud score > 0.8| BLOCK2[Block User<br/>Update Bloom filter]
    L3 -->|Pass| ALLOW[Legitimate Traffic]

    PROB -->|If sampled| BLOCK3[Add to Training Data]
    PROB -->|If not sampled| ALLOW

    BLOCK1 --> LOG[Log to fraud DB]
    BLOCK2 --> LOG
    BLOCK3 --> LOG

    style BLOCK1 fill:#ff6b6b
    style BLOCK2 fill:#ff6b6b
    style BLOCK3 fill:#ff6b6b
    style L1 fill:#ffdddd
    style ALLOW fill:#51cf66
{% end %}

**L1: Integrity Check Service (5ms critical path, 20-30% fraud caught)**

**Implementation: Bloom filter + IP reputation + Device fingerprinting**

**Component: Integrity Check Service** - Runs in synchronous request path BEFORE RTB fan-out

**Decision flow (5ms budget):**

1. Check IP against Bloom filter (~0.1ms) → if match, confirm with Redis (1ms) → BLOCK if confirmed (no RTB call)
2. Check device ID against IMPOSSIBLE_DEVICES list → BLOCK if invalid
3. Validate User-Agent format → BLOCK if malformed
4. Check device/OS combination validity → BLOCK if impossible (SDK spoofing)
5. Basic rate checks: Requests/sec from this IP/device → BLOCK if exceeds threshold
6. PASS to RTB/ML paths if all checks pass

**Bloom filter characteristics:**
- **Size:** 10M entries, 0.1% false positive rate
- **Memory:** ~18 MB for Bloom filter (14.378 bits per item); total fraud detection data ~120MB including reputation cache
- **Lookup:** O(1), ~100 CPU cycles (~0.1ms)
- **Update:** Every 5 minutes from fraud database (async)
- **Storage:** Redis cluster (replicated for high availability)

**Latency breakdown:**
- Bloom filter lookup: 0.1ms
- Redis reputation check (if Bloom filter hits): 1ms
- Device fingerprint validation: 0.5ms
- User-Agent parsing: 0.3ms
- Rate check (local counter): 0.1ms
- **Total budget: 5ms** (includes network overhead + safety margin)

**Examples caught by L1:**
- IP 1.2.3.4 previously flagged for 10,000 clicks/hour → BLOCKED, no RTB call made
- Device fingerprint "iPhone_FRAUD_123" (known emulator signature) → BLOCKED immediately
- User-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 99_0)" (impossible OS version) → BLOCKED
- IP making 1000 requests/sec (DDoS pattern) → BLOCKED

**Critical Impact:** Blocking at L1 saves 100-200KB bandwidth per blocked request (2-4KB × 50 DSPs) + DSP processing time

**L2: Behavioral Analysis (Async post-click, 40-50% additional fraud caught)**

**Component: Fraud Analysis Service** - Runs ASYNCHRONOUSLY after ad click/impression events, NOT in request critical path

**When it runs:** Triggered by click/impression events published to Kafka, analyzes patterns over time

**Feature extraction (5ms per event):**

1. Redis lookup: Fetch user history (3ms) - last 100 impressions, clicks, IPs, device changes
2. Calculate features (2ms):
   - **Time patterns:** clicks/hour, avg interval between clicks, timing stddev (bots have low variance)
   - **CTR analysis:** click rate over last 100 impressions
   - **Device diversity:** unique IPs in last 24h, device changes in last 7 days
   - **Behavioral entropy:** IP diversity, category spread

**Rule-based thresholds → SUSPICIOUS if ANY:**
- CTR > 50% (normal users: 0.5-2%)
- Timing stddev < 2.0 seconds (mechanical bot behavior)
- Unique IPs/day > 50 (IP rotation / bot farm)
- IP entropy < 2.0 (concentrated in single subnet / data center)

**Actions:**
- If SUSPICIOUS: Add IP/device to Bloom filter (blocks future requests at L1)
- If high confidence (multiple signals): Immediate block + refund advertiser
- If borderline: Pass to L3 ML model for deeper analysis

**Processing time:**
- Redis lookup (user history): 3ms
- Feature calculation: 2ms
- **Total: 5ms** (async, does not impact request latency)

**Examples caught by L2:**
- User clicked 127 of last 100 ads (CTR = 1.27) → clearly fraud
- Clicks every 12.3 seconds ±0.1s for 2 hours → mechanical
- 847 unique IPs in 24 hours → bot farm with IP rotation
- IP entropy 1.2 (concentrated in /24 subnet) → data center origin

**L3: ML Model (10ms latency, 10-15% additional fraud caught)**

**Gradient Boosted Decision Tree (GBDT) model:**

**Feature enrichment and inference (10ms):**

1. Take 15 features from L2 (time patterns, CTR, device diversity, entropy)
2. Add 25 computed features:
   - **Temporal:** hour of day, day of week, is weekend
   - **Historical aggregates:** lifetime clicks, account age, avg session duration
   - **Reputation scores:** device fraud score, IP fraud score (from lookup tables)
   - **Publisher context:** publisher fraud rate

3. GBDT inference (200 trees, depth 6) → fraud score 0.0-1.0

**Decision thresholds:**
- **Score > 0.8:** BLOCK (high confidence fraud)
- **Score 0.5-0.8:** SUSPICIOUS (flag for manual review)
- **Score < 0.5:** ALLOW (legitimate traffic)

**Model characteristics:**
- **Training data:** 30 days of labeled fraud events (1B events, 3% fraud rate)
- **Features:** 40 total (15 from L2, 25 computed in L3)
- **Model:** GBDT with 200 trees, max depth 6
- **Latency:** 10ms (CPU inference)
- **Accuracy:** AUC 0.92 (fraud detection quality)
- **Update frequency:** Weekly retraining, daily incremental updates

**Examples caught by L3:**
- Fraud score 0.87: Sophisticated bot with randomized timing but weak device fingerprint
- Fraud score 0.82: Click farm with realistic timing but publisher reputation low
- Fraud score 0.79: SDK spoofing with valid-looking data but statistical anomalies

**Performance Characteristics:**

<style>
#tbl_fraud_perf + table th:first-of-type  { width: 12%; }
#tbl_fraud_perf + table th:nth-of-type(2) { width: 14%; }
#tbl_fraud_perf + table th:nth-of-type(3) { width: 20%; }
#tbl_fraud_perf + table th:nth-of-type(4) { width: 24%; }
#tbl_fraud_perf + table th:nth-of-type(5) { width: 30%; }
</style>
<div id="tbl_fraud_perf"></div>

| Tier | Latency | Fraud Caught | False Positive Rate | Cost |
|------|---------|--------------|---------------------|------|
| **L1** | 0ms | 20-30% | <0.1% | Negligible (Bloom filter) |
| **L2** | 5ms | 40-50% | 1-2% | Low (Redis lookup + compute) |
| **L3** | 10ms | 10-15% | 0.5-1% | Medium (GBDT inference) |
| **Total** | 0-15ms | 70-95% | ~1-2% | Acceptable |

**Latency impact on overall SLO:**

Fraud detection runs in PARALLEL with ad selection (see Part 2 critical path):

**Ad serve critical path:**
- Network: 10ms
- Gateway: 5ms
- User Profile: 10ms
- **[Parallel execution]:**
  - Ad Selection + ML: 65ms
  - Fraud Detection: 0-15ms (L1→L2→L3)
- RTB: 100ms
- Final: 10ms

**Total: 140ms** (fraud detection does NOT add to critical path if < 65ms)

**Because fraud detection (0-15ms) completes faster than Ad Selection + ML (65ms), it adds ZERO latency to the critical path.**

**Monitoring and Alerting:**

**Key metrics to track:**
- **Latency metrics**: p50, p95, p99 latencies (target: <15ms)
- **Block rates**: Percentage of requests blocked at each tier (L1, L2, L3)
- **False positive rate**: Ratio of complaints to blocks (indicates legitimate users being blocked)
- **Model quality**: AUC score for fraud detection model
- **Business impact**: Estimated advertiser spend protected from fraud

**Critical alerts (P1):**
- Fraud block rate drops below 1% for 1+ hour (suggests model failure)
- Fraud block rate spikes above 20% for 15+ minutes (suggests new attack pattern)
- False positive rate exceeds 5% (blocking too many legitimate users)

**Warning alerts (P2):**
- Fraud detection latency p99 exceeds 20ms (approaching budget limit)
- Model AUC drops below 0.85 (model quality degrading)
- New fraud pattern detected (requires manual rule update)

**Cost-Benefit Analysis:**

For a platform serving 1M QPS with 3% fraud rate:
- Fraudulent clicks: 1M × 0.03 = 30K clicks/sec
- Avg cost per click: $0.50
- Daily fraud cost: 30K × $0.50 × 86400 = **$1.3M/day**

**Fraud detection effectiveness:**

If catching 80% of fraud:
- Fraud prevented: $1.3M × 0.80 = **$1.04M/day saved**
- Annual savings: **$380M**

**False positive cost:**

If 2% false positive rate:
- Legitimate users blocked: 1M × 0.97 × 0.02 = 19.4K/sec
- Revenue loss: 19.4K × $0.10 avg revenue × 86400 = **$168K/day**
- Annual cost: **$61M**

**Net benefit:** $380M - $61M = **$319M annual value**

**Infrastructure cost:** ~$5M/year (Redis, HBase, ML training)

**ROI:** 64× return on investment

**Decision:** Fraud detection is critical, worth the 2% false positive rate.

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

<style>
#tbl_region_capacity + table th:first-of-type  { width: 18%; }
#tbl_region_capacity + table th:nth-of-type(2) { width: 15%; }
#tbl_region_capacity + table th:nth-of-type(3) { width: 20%; }
#tbl_region_capacity + table th:nth-of-type(4) { width: 18%; }
#tbl_region_capacity + table th:nth-of-type(5) { width: 29%; }
</style>
<div id="tbl_region_capacity"></div>

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

**Route53 Health Check Configuration:**
- **Protocol**: HTTPS
- **Path**: /health/deep (checks database connectivity, not just simple "alive" response)
- **Interval**: 30 seconds (Standard, $0.50/month) or 10 seconds (Fast, $1.00/month)
- **Failure threshold**: 3 consecutive failures before marking unhealthy
- **Health checkers**: 15+ global endpoints test each region
- **Decision logic**: Healthy if ≥18% of checkers report success

**Failover trigger:** When health checks fail for 90 seconds (3 × 30s interval), Route53 marks region unhealthy and returns secondary region's IP for DNS queries.

**DNS TTL impact:** Set to 60 seconds. After failover triggered, new DNS queries immediately return healthy region, existing client DNS caches expire within 60s (50% of clients fail over in 30s, 95% within 90s).

**Why 60s TTL:** Balance between fast failover and DNS query load. Lower TTL (10s) = 6× more DNS queries hitting Route53 nameservers. At high query volumes, this increases costs ($0.40 per million queries), but the primary concern is cache efficiency - shorter TTLs mean resolvers cache records for less time, reducing effectiveness of DNS caching infrastructure.

**Health check vs TTL costs:** Note that health check intervals (10s vs 30s) have different pricing: $1.00/month vs $0.50/month per check. The 6× query multiplier applies to DNS resolution, not health checks.

**Data Replication Strategy:**

**CockroachDB (Billing Ledger, User Profiles):**

**Multi-region replication strategy:**

**Goal:** Survive regional failures while maintaining data consistency and acceptable write latency.

**Approach:**

1. **Determine survival requirements**: What failure scenarios must you tolerate?
   - Single AZ failure = need 3 replicas minimum (quorum of 2)
   - Single region failure = need cross-region distribution
   - Multiple concurrent failures = need higher replication factor

2. **Calculate replication factor**: Based on consensus quorum requirements
   - Quorum size = `floor(replicas / 2) + 1`
   - To survive N failures and maintain quorum: `replicas ≥ 2N + 1`
   - Example: survive 1 region failure → need at least 3 replicas (quorum=2, can lose 1)
   - Example: survive 2 region failures → need at least 5 replicas (quorum=3, can lose 2)

3. **Replica placement strategy**: Distribute across regions based on traffic and failure domains
   - Place more replicas in high-traffic regions (reduces read latency)
   - Ensure geographic diversity (regions should have independent failure modes)
   - Balance cost vs resilience (more replicas = higher storage cost)

4. **Trade-offs**:
   - More replicas = better fault tolerance but higher cost and write latency
   - Fewer replicas = lower cost but reduced resilience
   - Write latency increases with geographic spread (cross-region = 50-150ms vs same-region = 5-20ms)

**Write path:** Writes acknowledged when quorum of replicas confirm (Raft consensus). Cross-region write latency typically ranges 50-150ms, dominated by inter-region network round-trips.

**Read path:** Reads served by nearest replica with bounded staleness for eventually-consistent reads (stale reads acceptable for most use cases). Strong-consistency reads must hit the leaseholder (higher latency, but guaranteed fresh data).

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

**Heartbeat update** (US-East region, every 60s while healthy):
- Update campaign budget tracking table
- Set region-specific allocated amount (e.g., $3000)
- Set region-specific spent amount (e.g., $1500)
- Update last heartbeat timestamp to current time
- Filter by campaign ID

**Failover recovery process:**

1. **T+0s:** US-East fails
2. **T+90s:** Health checks trigger failover, US-West starts receiving US-East traffic
3. **T+120s:** Atomic Pacing Service detects US-East heartbeat timeout (last write was 120s ago)
4. **T+120s:** Atomic Pacing Service reads last known state from CockroachDB:
   - US-East allocated: $3,000
   - US-East spent: $1,500 (written 120s ago)
   - Remaining (uncertain): ~$1,500
5. **T+120s:** Atomic Pacing Service marks US-East allocation as "failed" and removes from available budget
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
| T+90-100s | New instances online | Capacity restored (30-40s provisioning after T+60s trigger) |
| T+120s | Atomic Pacing Service locks US-East allocations | Under-delivery protection active |

**Why 20% Standby is Insufficient:**

The timeline above shows a critical problem: from T+30s to T+90-100s (60-70 seconds with modern tooling), US-West is severely overloaded. To understand why, we need queueing theory.

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
- \\(\rho = 200K / 300K = 0.67\\) (stable)

**During US-East failure (US-West receives 40% of total traffic):**
- Traffic: 200K + 400K = 600K QPS
- Capacity: 300K QPS (20% standby already activated)
- \\(\rho = 600K / 300K = 2.0\\) (severe overload)

**Auto-scaling limitations:** Kubernetes HPA triggers at T+60s, but provisioning new capacity takes **30-40 seconds** for GPU-based ML inference nodes with modern tooling (pre-warmed images, model streaming, VRAM caching), as detailed in Part 6. Without optimization, this can extend to 90-120s (cold pulls, full model loading). During this window, the system operates at 2× over capacity, making graceful degradation essential.

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
- **Net result**: System stays online, handles capacity constraint within 30-40s auto-scaling window (modern tooling) or 90-120s (legacy deployments)

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

CockroachDB: Already consistent (Raft consensus maintained across regions). Redis: Rebuild from scratch (Atomic Pacing Service re-allocates budgets based on CockroachDB source of truth, cold cache for 10-20 minutes).

**Why gradual failback:** Prevents "split-brain" scenario where both regions think they're primary.

**Cost Analysis: Multi-Region Economics**

**Infrastructure cost multipliers:**

<style>
#tbl_multiregion_cost + table th:first-of-type  { width: 25%; }
#tbl_multiregion_cost + table th:nth-of-type(2) { width: 18%; }
#tbl_multiregion_cost + table th:nth-of-type(3) { width: 30%; }
#tbl_multiregion_cost + table th:nth-of-type(4) { width: 27%; }
</style>
<div id="tbl_multiregion_cost"></div>

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
- Infrastructure availability: 99.8-99.9% (accounting for regional outages)

Multi-region infrastructure availability: 99.99%+ (survives full regional failures)

Note: Our service SLO remains 99.9% regardless of deployment strategy. Multi-region provides availability headroom - the infrastructure supports higher uptime than we commit to users, providing buffer for application-level failures.

**Trade-off analysis:**
- Multi-region additional cost: **2.3× baseline annual infrastructure cost**
- Benefits: +0.1-0.2% infrastructure availability improvement, 50-100ms latency reduction for international users, GDPR compliance
- Break-even: Multi-region pays off if single regional outage costs exceed 2.3× annual infrastructure baseline

**Intangible benefits:**
- Reputation protection (uptime matters for advertiser trust)
- Regulatory compliance (GDPR data locality requirements)
- Competitive advantage (global latency consistency)

**Decision:** Multi-region worth the 3.3× cost multiplier for platforms where revenue rate justifies availability investment.

**Note on cost multiplier breakdown:** The 3.3× figure is derived from:
- **3 active regions × 100% compute** = 3.0× (US-East, US-West, EU)
- **Cross-region data transfer** ≈ +0.3× baseline (CockroachDB Raft replication, Kafka mirroring, CDN egress)
- **Shared control plane** ≈ -0.2× savings (observability stack, CI/CD, model training run once)
- **Passive standby region** (APAC) adds +0.2× for data replication only
- **Total: 3.3×** (range: 2.5-4× depending on active-active vs active-passive architecture)

Industry validation: Dual-region setups typically cost 1.3-2× (not 2×) due to shared infrastructure. For 4-region deployments, the multiplier falls between 3-3.5× based on documented case studies. This estimate is order-of-magnitude accurate but workload-dependent.

**Capacity conclusion:** 20% standby insufficient for immediate regional takeover, but combined with auto-scaling (30-40s with modern tooling, 90-120s legacy) and graceful degradation, provides cost-effective resilience. Alternative (200% over-provisioning per region) would reach 8-10× baseline costs. Trade-off: Accept degraded performance and bounded under-delivery during rare regional failures rather than excessive capacity overhead.

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

**Schema change** (non-blocking, returns immediately):
- Add new JSONB column to user_profiles table
- Column name: preferences
- Default value: empty JSON object
- Backfill happens asynchronously
- Reads see NULL or default during backfill period

Application code updated to write to new column immediately. Reads handle both NULL (old rows) and populated (new rows) gracefully.

**No dual-write complexity:** ACID transactions guarantee consistency - either transaction sees new schema or old schema, never inconsistent state.

**Phase 2: Add Index (Background with throttling - Week 1-2)**

Create index with `CONCURRENTLY` to avoid blocking writes:

**Index creation** (concurrent, non-blocking):
- Create index on user_profiles table
- Index name: idx_last_active
- Indexed column: last_active_timestamp
- Runs in background without blocking writes
- Uses concurrent mode to avoid table locks

**Index backfill rate:**

CockroachDB throttles background index creation to ~25% of cluster resources to avoid impacting production traffic. For 4TB data:

$$T_{index} = \frac{4000 \text{ GB}}{100 \text{ MB/s} \times 0.25} \approx 4-6 \text{ hours}$$

Monitor progress: `SHOW JOBS` displays percentage complete and estimated completion time.

**Phase 3: Partition Restructuring (Complex - Week 2-4)**

Modifying table partitioning (adding `region` to partition key) requires creating new table with desired partitioning, then migrating data. This is the **only** operation that requires dual-write pattern:

**Create new partitioned table** (user_profiles_v2):
- Columns: user_id (UUID), region (STRING), plus all existing columns
- Primary key: Composite key (region, user_id)
- Partitioning strategy: LIST partitioning by region
- Partitions:
  - US partition: Contains rows where region = 'US'
  - EU partition: Contains rows where region = 'EU'
  - ASIA partition: Contains rows where region = 'ASIA'

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

**Schema change:**
- **Old schema**: PRIMARY KEY (user_id)
- **New schema**: PRIMARY KEY ((region, user_id))

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
| **AWS Time Sync Service** | <100μs (modern instances)<br/>±1ms (legacy) | Free (on AWS) | Cloud deployments (Nitro system 2021+) |

**Multi-tier time synchronization:**

**Tier 1 - Event Timestamping:** AWS Time Sync (<100μs with modern instances, ±1ms legacy, free). Network latency (20-100ms) dwarfs clock skew, making NTP sufficient for impressions/clicks.

**Tier 2 - Financial Reconciliation:** CockroachDB built-in HLC provides automatic globally-ordered timestamps: \\(HLC = (t_{physical}, c_{logical}, id_{node})\\). Guarantees causality preservation (if A→B then HLC(A) < HLC(B)) and deterministic ordering via logical counters + node ID tie-breaking.

**Clock skew mitigation:** Create 200ms "dead zone" at day boundaries (23:59:59.900 to 00:00:00.100) where budget allocations are forbidden. Prevents regions with skewed clocks from over-allocating across day boundaries.

**Architecture decision:** AWS Time Sync (<100μs with modern instances, ±1ms legacy, free) + CockroachDB built-in HLC. Google Spanner's TrueTime (±7ms) not worth complexity given 20-100ms network variability.

**Note on AWS Time Sync accuracy:** AWS upgraded Time Sync Service in 2021. Current-generation EC2 instances (Nitro system, 2021+) achieve <100μs accuracy using PTP hardware support. Older instance types (pre-2021 AMIs) see ±1ms. For this architecture, assume modern instances (<100μs). If using legacy infrastructure, adjust HLC uncertainty interval accordingly (see CockroachDB `--max-offset` flag).

**Advantage:** Eliminates ~150 lines of custom HLC code, provides battle-tested clock synchronization.

**Monitoring:** Alert if clock offset >100ms, HLC logical counter growth >1000/sec sustained, or budget discrepancy >0.5% of daily budget.

### Global Event Ordering for Financial Ledgers: The External Consistency Challenge

> **Architectural Driver: Financial Accuracy** - Financial audit trails require globally consistent event ordering across regions. CockroachDB's HLC-timestamped billing ledger provides near-external consistency, ensuring that events are ordered chronologically for regulatory compliance. S3 + Athena serves as immutable cold archive for 7-year retention.

**The Problem: Global Event Ordering**

Budget pre-allocation (Redis) solves fast local enforcement, but billing ledgers require globally consistent event ordering across regions. Without coordinated timestamps, audit trails can show incorrect event sequences.

**Example:** US-East allocates $100 (T1), EU-West spends $100 exhausting budget (T2). Without coordinated timestamps, separate regional databases using local clocks might timestamp T1 after T2 due to clock skew, showing wrong ordering in audit logs.

**Solution: CockroachDB HLC-Timestamped Ledger**

CockroachDB provides near-external consistency using Hybrid Logical Clocks: $$HLC = (pt, c)$$ where pt = physical time, c = logical counter.

**Guarantee:** Causally related transactions get correctly ordered timestamps via Raft consensus. CockroachDB's HLC uncertainty interval is dynamically bounded - legacy deployments use 500ms max_offset (default), but modern deployments with AWS Time Sync achieve **<2ms uncertainty** (500× improvement, see CockroachDB issue #75564). Independent transactions within this uncertainty window may have ambiguous ordering, but this is acceptable - even with 2ms uncertainty, network latency (50-150ms) already dominates, and causally related events (same campaign) are correctly ordered.

**Requirements met:**
- SOX/MiFID regulatory compliance (chronologically ordered financial records, 5-7 year retention)
- Legal dispute resolution ("Did impression X happen before budget exhaustion?")
- Audit trail correctness for billing reconciliation

**Architecture Decision: Three-Tier Financial Data Storage**

{% mermaid() %}
graph LR
    ADV["Ad Server<br/>1M QPS<br/>Local budget: 0ms"]
    REDIS[("Tier 1: Redis<br/>Atomic DECRBY<br/>Allocation only")]
    CRDB[("Tier 2: CockroachDB<br/>HLC Timestamps<br/>10-15ms<br/>90-day hot")]
    S3[("Tier 3: S3 Glacier + Athena<br/>Cold Archive<br/>7-year retention")]

    ADV -.->|"Allocation request<br/>Every 30-60s (async)"| REDIS
    REDIS -->|"Reconciliation<br/>Every 5 min"| CRDB
    CRDB -->|"Nightly archive<br/>Parquet format"| S3

    classDef fast fill:#e3f2fd,stroke:#1976d2
    classDef ledger fill:#fff3e0,stroke:#f57c00
    classDef archive fill:#f3e5f5,stroke:#7b1fa2

    class REDIS fast
    class CRDB ledger
    class S3 archive
{% end %}

**Why This Three-Tier Architecture:**

| Tier | Technology | Purpose | Consistency Requirement |
|------|------------|---------|------------------------|
| **Local Counter** | In-memory CAS | Per-request spend tracking (0ms) | Atomic in-memory operations |
| **Tier 1: Allocation** | Redis | Global budget allocation (async) | Atomic DECRBY/INCRBY |
| **Tier 2: Billing Ledger** | CockroachDB | Financial audit trail with global ordering | Serializable + HLC ordering |
| **Tier 3: Cold Archive** | S3 Glacier + Athena | 7-year regulatory retention | None (immutable archive) |

**Workflow:**

1. **Per-request spend** (1M QPS): Local in-memory counter increment (0ms, not in critical path)
2. **Allocation request** (every 30-60s): Ad Server requests budget chunk from Redis via DECRBY (async)
3. **Reconciliation** (every 5min): Ad Server reports spend to CockroachDB with HLC timestamps
4. **Nightly archival**: Export 90-day-old records to S3 Glacier in Parquet format (7-year retention, queryable via Athena for compliance audits)

**Cost Analysis:**

| Component | Technology | Relative Cost |
|-----------|-----------|---------------|
| Fast path | Redis Cluster (20 nodes) | 18-22% |
| Billing ledger (90-day hot) | CockroachDB (60-80 nodes) | 77-80% |
| Cold archive (7-year) | S3 Glacier + Athena | 1-2% |
| **Total financial storage** | | **100% baseline** |

**Why S3 Glacier + Athena over PostgreSQL:**
- **Cost**: S3 Glacier at ~$1/TB/month vs PostgreSQL ~$50-100/TB/month (50-100× cheaper)
- **Compliance queries**: SOX/MiFID audits happen quarterly/annually, not daily - Athena query latency (seconds) is acceptable
- **Operational complexity**: No database to operate, patch, backup, or scale
- **Query capability**: Athena provides SQL interface for regulatory audits without maintaining a running database
- **Immutability**: S3 Object Lock enforces WORM (Write-Once-Read-Many) for regulatory compliance

**Build vs Buy:** Custom PostgreSQL + HLC implementation costs 1-1.5 engineer-years plus ongoing maintenance. CockroachDB's premium (20-30% of financial storage baseline) eliminates upfront engineering cost and operational burden. For cold archive, S3 + Athena is the clear choice - no operational burden and 50-100× cheaper than running a database.

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
| **Ad API** | Latency | p95 <150ms, p99 <200ms | Mobile timeouts above 200ms |
| **ML** | Accuracy | AUC >0.78 | Below 0.75 = 15%+ revenue drop |
| **RTB** | Response Rate | >80% DSPs within 100ms | <80% = remove from rotation |
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

**Request ID**: 7f3a8b2c...
**Total latency**: 287ms (VIOLATED SLO)

**Trace breakdown:**
- **API Gateway**: 2ms (normal)
- **User Profile**: 45ms (normally 10ms - **4.5× slower**)
  - Redis: 43ms (normally 5ms)
    - TCP timeout: 38ms
    - **Cause**: Node failure, awaiting replica promotion
- **ML Inference**: 156ms (normally 40ms - **3.9× slower**)
  - Batch incomplete: 8/32 requests
  - **Cause**: Low traffic (Redis failure reduced overall QPS)
- **RTB**: 84ms (normally 70ms - slightly elevated)

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
- Ad Server → Budget Database: Blocked (must use Atomic Pacing Service)
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

Per GDPR Article 12, the platform must respond to erasure requests **within one month** (can be extended to three months for complex cases). Deletion is executed across 10+ systems in parallel:
- CockroachDB: DELETE user_profiles
- Redis/Valkey: FLUSH user keys
- Kafka: Publish tombstone (log compaction)
- ML training: Mark deleted
- S3 cold archive: Mark for deletion (note: 7-year financial audit trails may be retained per legal basis override)
- Backups: Crypto erasure (delete encryption key)

**Verification:** All systems confirm deletion completion → send deletion certificate to user **within one month** of request (target: 48-72 hours for standard cases).

**Note on financial records:** GDPR allows retention of financial transaction records beyond deletion requests when required by law (SOX, MiFID). User PII (name, email, demographics) is deleted, but anonymized transaction records ($X spent on date Y) are retained in S3 cold archive for regulatory compliance.

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

Despite these gaps, the exercise has been valuable. Let me share some closing reflections.

## Final Thoughts

This 3 weeks learning exercise reinforced a fundamental truth: **everything is a trade-off with a price tag**. There's no "best" solution - only "best given constraints and costs."

If you've made it this far, thanks for reading. This was a mental exercise in systems thinking and cost optimization - treating distributed systems design like an extended puzzle. Better than sudoku, arguably.

**I'd love your feedback** - what I got wrong, what I missed, or alternative approaches. Found a calculation error? Have battle stories about cache sizing? Want to debate 99.9% vs 99.99% trade-offs? **[Join the discussion on GitHub](https://github.com/immediatus/immediatus.github.io/discussions/)**. Let's optimize the cost function of learning together.
