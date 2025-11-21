+++
authors = [ "Yuriy Polyulya" ]
title = "Real-Time Ads Platform: System Foundation & Latency Engineering"
description = "Building the architectural foundation for ad platforms serving 1M+ QPS with 150ms P95 latency. Deep dive into requirements analysis, latency budgeting across critical paths, resilience through graceful degradation, and P99 tail latency defense using low-pause GC technology."
date = 2025-10-15
slug = "ads-platform-part-1-foundation-architecture"
draft = false

[taxonomies]
tags = ["distributed-systems", "system-architecture", "ads-tech"]
series = ["architecting-ads-platforms"]

[extra]
toc = false
disclaimer = ""
series_order = 1
series_title = "Architecting Real-Time Ads Platform"
series_description = "A comprehensive series exploring the design and architecture of real-time advertising platforms. From system foundations and ML inference pipelines to auction mechanisms and production operations, we dive deep into building systems that handle 1M+ QPS while maintaining sub-150ms latency at P99."

+++

## Introduction: The Challenge of Real-Time Ad Serving at Scale

Full disclosure: I've never built an ads platform before. This is a design exercise - a cognitive workout to keep engineering thinking sharp.

**Why Real-Time Ads?**

I chose this domain as a deliberate [cognitive workout](https://www.psychologytoday.com/us/blog/the-digital-self/202501/new-years-resolution-go-to-ais-cognitive-gym) - a concept from Psychology Today about training engineering thinking as AI tools get more powerful. Real-time ads forces specific mental disciplines: 150ms latency budgets train decomposition skills (you can't handwave "make it fast" when RTB takes 100ms alone), financial accuracy demands consistency modeling (which data needs strong consistency vs eventual), and 1M QPS coordination tests failure handling (when cache servers die, does the database melt down?). These aren't abstract exercises - they're the foundation for effective engineering decisions regardless of tooling.

What makes ad platforms compelling: every click has measurable value, every millisecond of latency has quantifiable revenue impact. A user opens an app, sees a relevant ad in under 150ms, clicks it, and the advertiser gets billed. Simple? Not when you're coordinating real-time auctions across 50+ bidding partners with 100ms timeouts, running ML predictions in <40ms, and handling 1M+ queries per second.

**Target scale:**
- **400M+ daily active users** generating continuous ad requests
- **1M+ queries per second** during peak traffic (with **1.5M QPS platform capacity** - 50% headroom for burst traffic and regional failover)
- **150ms p95 latency** for the entire request lifecycle
- **Real-time ML inference** for click-through rate prediction
- **Distributed auction mechanisms** coordinating with 50+ external bidding partners
- **Multi-region deployment** with eventual consistency challenges

**What this post covers:**

Building the architectural foundation requires making high-stakes decisions that cascade through every component. This post establishes the critical foundation:

- **Requirements and constraints** - Translating business goals (maximize revenue, minimize latency) into quantifiable system requirements with clear trade-offs
- **High-level system architecture** - The dual-source architecture that enables 100% fill rates while maintaining strict latency budgets
- **Latency budgeting** - Decomposing 150ms into per-component allocations across network, databases, ML inference, and external RTB calls
- **Resilience patterns** - Circuit breakers, graceful degradation, and multi-level fallback strategies that trade modest revenue loss for high availability
- **P99 tail latency defense** - Deep dive into GC analysis showing how low-pause garbage collection technology prevents 10,000 requests/second from timing out

**Why this foundation is critical:**

Every architectural decision made here creates constraints and opportunities for the entire system:

- **Latency budgets** force parallel execution patterns and limit database round-trips - there's no room for sequential operations on the critical path
- **Resilience requirements** allow aggressive optimization with safety nets - we can push components to their limits knowing degradation paths exist
- **Scale requirements** (1M QPS) drive infrastructure sizing, caching strategies, and force distributed architecture - a single instance can't handle this load
- **Financial accuracy requirements** dictate consistency models - eventual consistency for user profiles, strong consistency for advertiser budgets

Get these wrong and you're building the wrong system. Underestimate latency budgets and you violate SLOs, losing revenue. Misunderstand resilience needs and peak traffic brings cascading failures.

The ad tech industry uses specialized terminology. Let's establish a common vocabulary before diving into the architecture.

## Glossary - Ad Industry Terms

**Programmatic Advertising:** Automated buying and selling of ad inventory through real-time auctions. Contrasts with direct sales (guaranteed deals with fixed pricing).

**SSP (Supply-Side Platform):** Platform that publishers use to sell ad inventory. Runs auctions and connects to multiple DSPs to maximize revenue.

**DSP (Demand-Side Platform):** Platform that advertisers/agencies use to buy ad inventory across multiple publishers. Examples: Google DV360, The Trade Desk, Amazon DSP.

**RTB (Real-Time Bidding):** Programmatic auction protocol where ad impressions are auctioned in real-time (~100ms) as users load pages/apps. Each impression triggers a bid request to multiple DSPs.

**OpenRTB:** Industry standard protocol (maintained by IAB Tech Lab) defining the format for RTB communication. Current version: 2.6. Specifies JSON/HTTP format for bid requests and responses.

**IAB (Interactive Advertising Bureau):** Industry trade organization that develops technical standards (OpenRTB, VAST, VPAID) and provides viewability guidelines for digital advertising.

**Pricing Models:**
- **CPM (Cost Per Mille):** Cost per 1000 impressions. Most common model. Example: CPM of X = advertiser pays price X for every 1000 ad views.
- **CPC (Cost Per Click):** Advertiser pays only when users click the ad. Risk shifts to publisher (no clicks = no revenue).
- **CPA (Cost Per Action/Acquisition):** Advertiser pays only for conversions (app installs, purchases). Highest risk for publisher.

**eCPM (Effective Cost Per Mille):** Metric that normalizes different pricing models (CPM/CPC/CPA) to "revenue per 1000 impressions" for comparison. Formula: \\(eCPM = \frac{\text{Total Earnings}}{\text{Total Impressions}} \times 1000\\). Used to rank ads fairly in auctions.

**CTR (Click-Through Rate):** Percentage of ad impressions that result in clicks. Formula: \\(CTR = \frac{\text{Clicks}}{\text{Impressions}} \times 100\\). Typical range: 0.5-2% for display ads. Critical for converting CPC bids to eCPM.

With this terminology established, we can now define the system requirements that will drive our architectural decisions.

## Requirements and Constraints

### Functional Requirements

The system must deliver four core capabilities:

**1. Multi-Format Ad Delivery**

The platform needs to support all standard ad formats: story ads, video ads, carousel ads, and AR-enabled ads across iOS, Android, and web. Creative assets are served from a CDN targeting sub-100ms first-byte time.

**2. Real-Time Bidding (RTB) Integration**

The platform implements OpenRTB 2.5+ to coordinate with 50+ demand-side platforms (DSPs) simultaneously. Industry standard RTB timeouts range from 100-200ms, with most platforms targeting 100ms to balance revenue and user experience.

This creates an interesting challenge: executing 50+ parallel network calls within 100ms when some DSPs are geographically distant (NY-Asia RTT: 200-300ms). The system must handle both programmatic and guaranteed inventory with different SLAs and business logic.

**3. ML-Powered Targeting and Optimization**

Machine learning drives revenue optimization through:
- Real-time CTR (click-through rate) prediction for ad ranking
- Conversion rate optimization
- Dynamic creative optimization
- Budget pacing algorithms to distribute advertiser spend evenly over campaign duration

**4. Campaign Management**

The system provides real-time performance metrics, A/B testing frameworks, frequency capping (limiting ad repetition), quality scoring, and policy compliance.

### Architectural Drivers: The Three Non-Negotiables

Before diving into non-functional requirements, we need to establish the three **immutable constraints** that guide every design decision. Understanding these upfront helps explain the architectural choices throughout this post.

**Driver 1: Latency (150ms p95 end-to-end)**

**Why this matters:** Mobile apps typically timeout after 150-200ms. Users expect ads to load instantly - if your ad is still loading when the page renders, you show a blank space and earn no revenue.

Amazon's 2006 study found that every 100ms of added latency costs ~1% of sales[^amazon-latency]. In advertising, this translates directly: slower ads = fewer impressions = less revenue.

At our target scale of 1M queries per second, breaching the 150ms timeout threshold means mobile apps give up waiting, resulting in blank ad slots and complete revenue loss on those requests.

**The constraint:** Maintain 150ms p95 end-to-end latency for the complete request lifecycle - from when the user opens the app to when the ad displays.

**Driver 2: Financial Accuracy (Zero Tolerance)**

**Why this matters:** Advertising is a financial transaction. When an advertiser sets a campaign budget, they expect to spend exactly that amount - not 5% more or 5% less.

Billing discrepancies above 2-5% are considered material in industry practice and can trigger lawsuits. Even 1% errors generate complaints and credit demands. Beyond legal risk, billing errors destroy advertiser trust.

The specific billing accuracy thresholds (≤1% target, <2% acceptable, >5% problematic) come from **industry best practices** and contractual SLAs rather than explicit regulations, though regulatory frameworks (FTC, EU Digital Services Act) do mandate transparent billing.

**The constraint:** Achieve ≤1% billing accuracy for all advertiser spend. Under-delivery (spending less than budget) costs revenue; over-delivery (spending more than budget) causes legal and trust issues.

**Driver 3: Availability (99.9%+ Uptime)**

**Why this matters:** Unlike many services where downtime is annoying but tolerable, ad platforms lose revenue for every second they're unavailable. No availability = no ads = no money.

A 99.9% uptime target means 43 minutes of allowed downtime per month. This error budget must cover all sources of unavailability. However, through zero-downtime deployment and migration practices (detailed later in [Part 4](/blog/ads-platform-part-4-production/)), we can eliminate **planned** downtime entirely, reserving the full 43 minutes for **unplanned** failures.

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

This constraint requires 95% of requests to complete within 150ms. Total latency is the sum of all services in the request path:

$$T_{total} = \sum_{i=1}^{n} T_i$$

where \\(T_i\\) is the latency of each service. With Real-Time Bidding (RTB) requiring 100-120ms for external DSP responses, plus internal services (ML inference, user profile, ad selection), the 150ms budget requires careful allocation.

Strict latency budgets are critical: incremental service calls ("only 10ms each") compound quickly. The 150ms SLO aligns with industry standard RTB timeout (100-120ms) while maintaining responsive user experience.

**Latency Budget Breakdown:**
- **Total end-to-end SLO:** 150ms p95
- **Internal services budget:** ~50ms (network, gateway, user profile, ad selection)
- **RTB external calls:** ~100ms (industry standard timeout)
- **ML inference:** ~40ms (GPU model serving)

The 150ms total accommodates industry-standard RTB timeout (100ms) while maintaining responsive user experience. Internal services are optimized for <50ms to leave budget for external DSP calls.

**RTB Latency Reality Check:** The 100ms RTB budget is aggressive given global network physics (NY-London: 60-80ms RTT, NY-Asia: 200-300ms RTT). Understanding RTB timeouts requires distinguishing between specification and operational practice:

- **100ms timeout (tmax)**: The OpenRTB specification timeout - the **failure deadline** when we give up waiting for DSP responses. This is the maximum time we'll wait.
- **50-70ms operational target**: The **quality auction target** - the time by which we aim to have most responses. Waiting beyond 70ms yields only +1-2% additional revenue but adds 30ms latency.

Achieving practical 50-70ms operational targets while maintaining 100ms as fallback requires three optimizations:

1. **Geographic sharding** - Regional ad server clusters call geographically-local DSPs only (15-25ms RTT)
2. **Dynamic bidder health scoring** - De-prioritize or skip consistently slow/low-value DSPs
3. **Adaptive early termination** - Progressive auction at 50ms, 70ms, 80ms cutoffs capturing 95-97% revenue

Without these optimizations, global DSP calls would routinely exceed 100ms. Geographic sharding and adaptive timeout strategies are covered in detail in [Part 2's RTB integration section](/blog/ads-platform-part-2-rtb-ml-pipeline/#rtb-geographic-sharding-and-timeout-strategy).

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

This translates to **43 minutes** of allowed downtime per month. Through zero-downtime deployments (detailed in [Part 4](/blog/ads-platform-part-4-production/)), we eliminate **planned** downtime entirely, reserving the full error budget for **unplanned** failures.

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

**Key insight:** The challenge is reconciling strong consistency requirements for financial data with the latency constraints. Without proper atomic enforcement, race conditions could cause severe over-budget scenarios (e.g., multiple servers simultaneously allocating from the same budget). This is addressed through distributed budget pacing with atomic counters, covered in [Part 3](/blog/ads-platform-part-3-data-revenue/).

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

*Note: Detailed analysis of cache sizing, hit rate optimization, and distribution strategies is covered in [Part 3](/blog/ads-platform-part-3-data-revenue/).*

---

## System Architecture Overview

Before diving into detailed diagrams and flows, let's establish the fundamental architectural principles and component structure that shapes this platform.

### Service Architecture and Component Boundaries

Before diving into individual components, let's establish the logical view of the system. The diagram below shows component boundaries and their relationships - this is a **conceptual overview** to build intuition. Detailed request flows, protocols, and integration patterns follow in subsequent sections.

{% mermaid() %}
graph TB
    subgraph "Client Layer"
        CLIENT[Publishers & Users<br/>Mobile Apps, Websites]
    end

    subgraph "API Gateway Layer"
        GW[API Gateway<br/>Auth, Rate Limiting, Routing]
    end

    subgraph "Core Request Processing"
        ORCH[Ad Server Orchestrator<br/>Request Coordination & Auction]
    end

    subgraph "Profile & Security Services"
        PROFILE[User Profile Service<br/>Demographics, Interests]
        INTEGRITY[Integrity Check Service<br/>Fraud Detection, Validation]
    end

    subgraph "Revenue Engine Services"
        FEATURE[Feature Store<br/>ML Features Cache]
        ML[ML Inference Service<br/>CTR Prediction, eCPM Scoring]
        RTB[RTB Gateway<br/>External DSP Coordination]
    end

    subgraph "Financial & Auction Services"
        AUCTION[Auction Service<br/>Unified eCPM Ranking]
        BUDGET[Budget Service<br/>Spend Control, Atomic Ops]
    end

    subgraph "Storage Layer"
        CACHE[(L1/L2 Cache<br/>Caffeine + Valkey)]
        DB[(Database<br/>Transactional Storage)]
        DATALAKE[(Data Lake<br/>Analytics & ML Training)]
    end

    CLIENT --> GW
    GW --> ORCH

    ORCH --> PROFILE
    ORCH --> INTEGRITY
    ORCH --> ML
    ORCH --> RTB
    ORCH --> AUCTION
    ORCH --> BUDGET

    PROFILE --> CACHE
    ML --> FEATURE
    FEATURE --> CACHE
    BUDGET --> CACHE

    PROFILE --> DB
    BUDGET --> DB
    AUCTION --> DB

    ML --> DATALAKE

    style ORCH fill:#e1f5ff
    style GW fill:#fff4e1
    style CACHE fill:#f0f0f0
    style DB fill:#f0f0f0
    style DATALAKE fill:#f0f0f0
{% end %}

**Note:** This diagram represents logical component boundaries, not physical deployment topology. In production, services are distributed across multiple regions with complex networking, service mesh, and data replication - those details are covered in [Part 4](/blog/ads-platform-part-4-production/) and [Part 5](/blog/ads-platform-part-5-implementation/).

**Component Overview**

The platform decomposes into focused, independently scalable services. Each service owns a specific domain with clear responsibilities:

**Ad Server Orchestrator** - The central coordinator that orchestrates the entire ad request lifecycle. Receives requests, coordinates parallel calls to all downstream services (User Profile, Integrity Check, ML Inference, RTB Gateway), manages timeouts, runs the unified auction, and returns the winning ad. Stateless and horizontally scaled to handle 1M+ QPS.

**User Profile Service** - Manages user targeting data (demographics, interests, behavioral history). Optimized for read-heavy workloads with aggressive caching (95%+ cache hit rate). Tolerates eventual consistency - profile updates can lag by seconds without business impact.

**Integrity Check Service** - Validates request authenticity, detects fraud patterns, enforces rate limits. First line of defense against bot traffic and malicious requests. Must be fast (5ms budget) to stay off critical path.

**Feature Store** - Serves pre-computed ML features for CTR prediction. Fed by batch and streaming pipelines that aggregate user engagement history, contextual signals, and temporal patterns. Caches features aggressively to meet 10ms latency budget.

**ML Inference Service** - Runs gradient boosted decision trees (GBDT) for click-through rate prediction. Converts advertiser bids (CPM/CPC/CPA) into comparable eCPM scores for fair auction ranking. CPU-based inference for cost efficiency at 1M QPS scale.

**RTB Gateway** - Broadcasts bid requests to 50+ external demand-side platforms (DSPs) via OpenRTB protocol. Handles connection pooling, timeout management, partial auction logic. Geographically distributed to minimize latency to DSP data centers.

**Auction Service** - Executes the unified auction that ranks all bids (internal ML-scored + external RTB) by eCPM. Applies quality scores, reserve prices, and selects the winner. Stateless computation - no data persistence.

**Budget Service** - Enforces advertiser campaign budgets through distributed atomic operations. Requires strong consistency - cannot tolerate budget overspend. Uses distributed cache with atomic compare-and-swap operations and pre-allocation pattern to achieve 3ms latency.

**Why these boundaries:**

Service boundaries align with data access patterns, consistency requirements, and scaling characteristics:

- **Read-heavy vs write-heavy**: User Profile (read-heavy, aggressive cache) vs Budget Service (write-heavy, atomic ops)
- **Consistency needs**: Budget Service (strong consistency, atomic operations) vs User Profile (eventual consistency, cached)
- **Latency sensitivity**: Integrity Check (5ms, simple logic) vs ML Inference (40ms, complex computation)
- **External dependencies**: RTB Gateway (manages 50+ external DSPs) isolated from core services
- **Technology fit**: ML Service (CPU-optimized) vs Ad Server Orchestrator (memory-optimized for object allocation)

### Stateless Design Philosophy

All request-handling services (Ad Server, Auction, ML Inference, RTB Gateway) are **stateless** - they hold no session state between requests. This enables:

- **Horizontal scaling**: Add instances without coordination or data migration
- **Fault tolerance**: Failed instances replaced instantly without state recovery
- **Load balancing**: Traffic distributes freely across instances
- **Zero-downtime deployments**: Rolling updates with no session disruption

State lives in dedicated storage layers (multi-tier cache hierarchy and strongly-consistent databases) accessed by stateless services. This separation of compute and storage is fundamental to the architecture.

### Service Independence and Failure Isolation

Services communicate synchronously (gRPC) but are designed to fail independently:

- **Ad Server Orchestrator** can timeout a slow service without blocking the entire request
- **Feature Store** failure triggers fallback to cold-start features (10% revenue impact vs 100% if blocking)
- **RTB Gateway** timeout doesn't prevent internal ML auction from proceeding
- **Circuit breakers** isolate failures, preventing cascades

This failure isolation is critical at 1M QPS - any service failure must degrade gracefully rather than propagate.

*Detailed implementation of RTB Gateway (OpenRTB protocol, DSP coordination, timeout handling) and ML Inference pipeline (Feature Store architecture, GBDT model serving, feature engineering) are covered in [Part 2](/blog/ads-platform-part-2-rtb-ml-pipeline/).*

## Data Architecture

State management drives many architectural decisions. The platform requires three distinct storage patterns, each with different consistency, latency, and access characteristics.

### Storage Pattern Requirements

**Pattern 1: Strongly Consistent Transactional Data**
- Campaign configurations, advertiser budgets, billing records
- Requirement: Multi-region strong consistency with audit trails
- Constraint: Must survive regional failures without data loss
- Access pattern: Low-volume writes (1K-10K QPS), moderate reads
- Technology category: Distributed SQL or strongly consistent NoSQL

**Pattern 2: High-Throughput Atomic Operations**
- Budget counters, rate limiting state, idempotency keys
- Requirement: Sub-millisecond atomic updates at 1M+ QPS
- Constraint: Distributed coordination without locks
- Access pattern: High-volume reads and writes (1M+ QPS)
- Technology category: In-memory distributed cache with atomic operations

**Pattern 3: Read-Heavy Profile Data**
- User targeting profiles, engagement history
- Requirement: 1M+ reads/sec with predictable single-digit ms latency
- Constraint: Tolerates eventual consistency (seconds of lag acceptable)
- Access pattern: Extremely read-heavy (99%+ reads), global distribution
- Technology category: Globally replicated NoSQL document store

### Consistency Requirements by Data Type

Different data has different correctness requirements:

| Data Type | Consistency Need | Storage Pattern | Rationale |
|-----------|------------------|-----------------|-----------|
| **Advertiser budgets** | Strong (≤1% variance) | Pattern 2 + Pattern 1 ledger | Financial accuracy non-negotiable |
| **User profiles** | Eventual (seconds lag OK) | Pattern 3 | Profile updates don't need instant visibility |
| **Campaign configs** | Strong (immediate visibility) | Pattern 1 | Advertiser changes must take effect immediately |
| **ML features** | Eventual (minutes lag OK) | Pattern 2 cache | Stale features have minimal impact on CTR prediction |
| **Billing events** | Strong (linearizable) | Pattern 1 with ordering guarantees | Financial audit trails require total ordering |

This tiered approach optimizes for both performance (eventual consistency where acceptable) and correctness (strong consistency where required).

### Caching Strategy

To meet the 10ms latency budget for user profile and feature lookups at 1M+ QPS, aggressive caching is mandatory. A multi-tier cache hierarchy reduces database load by 95%:

- **L1 (In-Process)**: Sub-millisecond reads, limited by JVM heap size
- **L2 (Distributed)**: 1-2ms reads, shared across all service instances
- **L3 (Database)**: Fallback for cache misses

*[Part 3](/blog/ads-platform-part-3-data-revenue/) covers the complete data layer: specific technology selection for strongly-consistent transactional storage, distributed caching, and user profile storage, plus cache architecture implementation, hit rate optimization, invalidation strategies, and clustering patterns.*

## Communication Architecture

Services communicate synchronously using a binary RPC protocol for internal calls and REST for external integrations. This section explains why these choices align with latency requirements and operational constraints.

### Internal Service Communication: Binary RPC

All internal service-to-service calls (Ad Server → User Profile, Ad Server → ML Service, etc.) use a **binary RPC protocol over HTTP/2**.

**Why binary RPC:**
- **Performance**: Binary serialization is 3-10× smaller than JSON, reducing network overhead
- **HTTP/2 multiplexing**: Multiple requests share single TCP connection, avoiding connection setup overhead
- **Type safety**: Schema-based contracts provide compile-time validation between services
- **Latency**: Sub-millisecond serialization overhead vs 2-5ms for JSON parsing

**At 1M QPS scale**, JSON serialization would add 2-5ms per request - consuming 40-50% of the latency budget. Binary protocols keep serialization overhead under 1ms.

### External Communication: REST/JSON

External integrations (RTB DSPs, client apps) use **REST with JSON** over HTTP/1.1 or HTTP/2.

**Why REST for external:**
- **Industry standard**: OpenRTB protocol mandates JSON over HTTP
- **Compatibility**: External DSPs expect REST/JSON
- **Debugging**: JSON is human-readable, simplifying integration debugging
- **Flexibility**: REST doesn't require schema sharing with external parties

**Trade-off accepted**: External REST calls (RTB) have higher serialization overhead, but they're already consuming 100ms for network RTT - the 2-5ms JSON overhead is negligible compared to network latency.

### Why Not Asynchronous Messaging?

The architecture is **synchronous request/response** rather than event-driven/async messaging.

**Why synchronous:**
- **Latency requirements**: 150ms end-to-end budget doesn't allow time for message queue hops
- **Request-scoped transactions**: Each ad request is independent - no shared state across requests
- **Failure handling**: Immediate timeout/retry decisions vs delayed processing in queues
- **Debugging**: Synchronous stack traces are easier to debug than distributed event traces

**Async messaging exists** for non-critical-path workflows (billing events, analytics pipelines, ML feature computation), but the ad serving critical path is fully synchronous.

### Service Discovery

Services discover each other via **DNS-based service discovery** within the container orchestration platform.

- Service names resolve to cluster IPs
- No external service registry - platform-native DNS handles discovery
- Client-side load balancing via RPC framework built-in routing

*[Part 5](/blog/ads-platform-part-5-implementation/) (Final Architecture) covers complete technology selection and configuration: gRPC setup, container orchestration architecture, connection pooling strategies, and service mesh implementation.*

## Deployment Architecture

The platform deploys as a distributed system across multiple regions. This section establishes the deployment model and scaling principles - specific instance counts, cluster sizing, and resource allocation are covered in [Part 5](/blog/ads-platform-part-5-implementation/)'s implementation blueprint.

### Horizontal Scaling Model

All request-handling services are **stateless** and scale horizontally by adding instances. This architectural choice enables:

**Elastic capacity management:**
- Add instances during traffic spikes (holidays, viral events, new publisher onboarding)
- Remove instances during off-peak hours to reduce costs
- No coordination required between instances - each handles requests independently

**Fault tolerance:**
- Failed instances are replaced automatically without state recovery
- No session affinity required - any instance can handle any request
- Graceful degradation: losing 10% of instances reduces capacity by 10%, not catastrophic failure

**Zero-downtime deployments:**
- Rolling updates across instance pool
- New instances start serving traffic once healthy
- Old instances drain connections gracefully

**Scaling characteristics by service type:**
- **Request-path services** (Ad Server, ML Inference, User Profile): Scale based on QPS and CPU utilization
- **Atomic operation services** (Budget Service): Scale based on write throughput and contention metrics
- **External integration services** (RTB Gateway): Scale based on DSP fanout and connection pool saturation

**Why stateless matters:** At 1M+ QPS, stateful services create operational nightmares - instance failures require state migration, deploys need session draining, and horizontal scaling requires data sharding. Stateless design eliminates these concerns by pushing state to dedicated storage layers (distributed cache, database) that are designed for consistency and durability.

### Multi-Region Deployment

The platform deploys across **multiple geographic regions** to satisfy availability, latency, and data sovereignty requirements.

**Why multi-region is mandatory:**
- **Availability target**: 99.9% uptime (43 min/month error budget) cannot survive single-region failures. Cloud providers have multi-hour regional outages multiple times per year.
- **Latency optimization**: Serving users from the nearest region reduces network RTT by 50-100ms. A US user reaching EU servers adds 80-120ms before processing even starts - violating the 150ms P95 budget.
- **Data residency**: GDPR requires EU user data stays in EU regions. Single-region deployment forces choosing between compliance violations or serving all traffic from EU (unacceptable latency for US/APAC users).
- **Blast radius containment**: Regional isolation limits the impact of configuration errors, deployment bugs, or capacity exhaustion.

**Regional deployment model:**
- **Active-active architecture**: All regions serve production traffic simultaneously (no idle standby regions wasting capacity)
- **Over-provisioned capacity**: Each region sized to handle more than its baseline share to absorb failover traffic from another region
- **GeoDNS routing**: Traffic directed to geographically nearest healthy region with automatic failover

**Data layer considerations:**
- **Strongly-consistent data** (budgets, billing): Multi-region replication with consensus protocols for consistency
- **Eventually-consistent data** (user profiles, features): Async replication with bounded lag acceptable
- **Region-pinned data** (GDPR): EU user data never leaves EU region, even during failover

**Failover behavior:** When a region fails health checks, GeoDNS redirects traffic to next-nearest healthy region within 2-5 minutes. The surviving regions absorb the additional load without user-visible degradation due to over-provisioned capacity.

*Operational details of multi-region failover (GeoDNS health checks, split-brain prevention, regional budget pacing, RTO/RPO targets) are covered in [Part 4](/blog/ads-platform-part-4-production/). Specific regional sizing, instance counts, and cluster configurations are detailed in [Part 5](/blog/ads-platform-part-5-implementation/).*

### Financial Integrity: Immutable Audit Log

**Compliance Requirement:**

The operational ledger (CockroachDB) is mutable by design - rows can be updated for budget corrections, deleted during cleanup, or modified by database administrators. This violates SOX (Sarbanes-Oxley) and tax compliance requirements for non-repudiable financial records. Regulators and auditors require immutable, cryptographically verifiable transaction history that cannot be tampered with after the fact.

**Architectural Solution:**

Implement **dual-ledger architecture** separating concerns:
- **Operational Ledger** (CockroachDB): Mutable system optimized for real-time transactions (budget checks, billing writes) with 3ms latency
- **Immutable Audit Log** (Kafka → ClickHouse): Append-only permanent record for compliance, storing every financial event (budget deductions, charges, refunds) with cryptographic hash chaining

Every financial operation publishes an event to Kafka `financial-events` topic, which ClickHouse consumes into append-only MergeTree tables. ClickHouse retains records for 7 years (tax compliance requirement) with hash-based integrity verification preventing undetected tampering. Daily reconciliation job compares both systems to detect discrepancies.

**Trade-off:** Additional infrastructure complexity (Kafka cluster + ClickHouse deployment) and operational overhead (reconciliation monitoring) for regulatory compliance and audit confidence. Cost increase approximately 15-20% of database infrastructure budget, but eliminates compliance risk and enables advertiser dispute resolution with verifiable records.

Detailed architecture covered in [Part 3's Immutable Audit Log section](/blog/ads-platform-part-3-data-revenue/#immutable-financial-audit-log-compliance-architecture), implementation details in [Part 5](/blog/ads-platform-part-5-implementation/#immutable-audit-log-technology-stack).

### Load Balancing and Traffic Distribution

Traffic flows through multiple load balancing layers, each serving a distinct purpose:

**1. GeoDNS (Global Traffic Distribution)**
- Routes users to nearest healthy region based on geographic location
- DNS-based routing with health check integration
- Failover latency: 2-5 minutes (DNS TTL propagation time)

**2. Regional Load Balancer (Availability Zone Distribution)**
- Distributes traffic across availability zones within a region
- Protects against datacenter-level failures
- Health checks at network layer (L4) and application layer (L7)

**3. Service Mesh (Service Instance Distribution)**
- Distributes traffic across service instances with fine-grained health checks
- Enables circuit breakers, retries, and timeout enforcement
- Provides observability (latency histograms, error rates per instance)

**4. Client-Side Load Balancing (RPC-Level Distribution)**
- Services use client-side load balancing for direct service-to-service calls
- Avoids extra network hop through centralized load balancer
- Round-robin or least-connections algorithms depending on workload

**Why multi-tier load balancing:** Each layer optimizes for different failure domains and timescales. GeoDNS handles region failures (minutes), regional LB handles zone failures (seconds), service mesh handles instance failures (sub-second), and client-side LB handles request-level distribution (milliseconds).

This layered approach ensures traffic always reaches healthy capacity at every level of the infrastructure stack.

## High-Level Architecture

### System Components and Request Flow

{% mermaid() %}
graph TB
    subgraph "Client Layer"
        CLIENT[Mobile/Web Client<br/>iOS, Android, Browser]
    end

    subgraph "Edge Layer"
        CDN[Content Delivery Network<br/>Global PoPs<br/>Static assets]
        GLB[Global Load Balancer<br/>GeoDNS + Health Checks]
    end

    subgraph "Regional Service Layer - Primary Region"
        GW[API Gateway<br/>Rate Limiting: 1M QPS<br/>Auth: JWT/OAuth<br/>Service Mesh Integration]
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
            DISTRIBUTED_CACHE[(Distributed Cache<br/>Atomic Operations<br/>Budget Enforcement)]
            TRANSACTIONAL_DB[(Strongly Consistent DB<br/>Billing Ledger + User Profiles<br/>Logical Timestamps<br/>Multi-Region ACID)]
            FEATURE_STORE[(Feature Store<br/>ML Features<br/>Sub-10ms p99)]
        end
    end

    subgraph "Data Processing Pipeline - Background"
        EVENT_STREAM[Event Streaming<br/>100K events/sec]
        STREAM_PROC[Stream Processing<br/>Real-time Aggregation]
        BATCH_PROC[Batch Processing<br/>Feature Engineering]
        DATA_LAKE[(Object Storage<br/>Data Lake + Cold Archive<br/>500TB+ daily + 7-year retention)]
    end

    subgraph "ML Training Pipeline - Offline"
        WORKFLOW[Workflow Orchestration]
        TRAIN[Training Cluster<br/>Daily CTR Model<br/>Retraining]
        REGISTRY[Model Registry<br/>Versioning<br/>A/B Testing]
    end

    subgraph "Observability"
        METRICS[Metrics Collection<br/>Time-series DB]
        TRACING[Distributed Tracing<br/>Span Collection]
        DASHBOARDS[Visualization<br/>Dashboards & Alerts]
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

    UP -->|Read| DISTRIBUTED_CACHE
    UP -->|Read| TRANSACTIONAL_DB

    INTEGRITY -->|Read Bloom Filter| DISTRIBUTED_CACHE
    INTEGRITY -->|Read Reputation| DISTRIBUTED_CACHE

    AD_SEL -->|Read| DISTRIBUTED_CACHE
    AD_SEL -->|Read| TRANSACTIONAL_DB

    ML -->|Read Features| FEATURE_STORE

    RTB -->|OpenRTB 2.x| EXTERNAL[50+ DSP Partners]

    BUDGET -->|Atomic Ops| DISTRIBUTED_CACHE
    BUDGET -->|Audit Trail| TRANSACTIONAL_DB

    AS -.->|Async Events| EVENT_STREAM
    EVENT_STREAM --> STREAM_PROC
    STREAM_PROC --> DISTRIBUTED_CACHE
    STREAM_PROC --> DATA_LAKE
    BATCH_PROC --> DATA_LAKE
    BATCH_PROC --> FEATURE_STORE

    TRANSACTIONAL_DB -.->|Nightly Archive<br/>90-day-old records| DATA_LAKE

    WORKFLOW --> TRAIN
    TRAIN --> REGISTRY
    REGISTRY --> ML

    AS -.-> METRICS
    AS -.-> TRACING

    classDef client fill:#e1f5ff,stroke:#0066cc
    classDef edge fill:#fff4e1,stroke:#ff9900
    classDef service fill:#e8f5e9,stroke:#4caf50
    classDef data fill:#f3e5f5,stroke:#9c27b0
    classDef stream fill:#ffe0b2,stroke:#e65100

    class CLIENT client
    class CDN,GLB edge
    class GW,AS,UP,AD_SEL,ML,RTB,BUDGET,AUCTION service
    class DISTRIBUTED_CACHE,TRANSACTIONAL_DB,FEATURE_STORE,DATA_LAKE data
    class EVENT_STREAM,STREAM_PROC,BATCH_PROC stream
{% end %}

**Request Flow Sequence:**

The diagram above shows both the **critical request path** (solid lines) and **background processing** (dotted lines). Here's what happens during a single ad request:

**1. Request Ingress (15ms total)**
- Client sends ad request to Global Load Balancer
- Load balancer routes to nearest regional gateway (10ms network latency)
- API Gateway performs authentication, rate limiting, request enrichment (5ms)

**2. Identity & Fraud Verification (15ms sequential)**
- **User Profile Service (10ms):** Fetches user demographics, interests, browsing history from multi-tier cache hierarchy (L1/L2/L3)
- **Integrity Check Service (<5ms):** Lightweight fraud detection - checks user against Bloom filter (known bad IPs), validates device fingerprint, applies basic behavioral rules. BLOCKS fraudulent requests BEFORE expensive RTB fan-out to 50+ DSPs. Critical placement prevents wasting bandwidth on bot traffic.

**3. Parallel Path Split (ML + RTB run simultaneously after fraud check)**

**Path A: Internal ML Path (65ms after split)**
- **Feature Store Service (10ms):** Retrieves pre-computed behavioral features (1-hour click rate, 7-day CTR, etc.) from feature serving layer
- **Ad Selection Service (15ms):** Queries internal ad database for candidate ads from direct deals, guaranteed campaigns, and house ads. Filters by user interests and features.
  - *Note: Retrieves internal inventory only - RTB ads come from external DSPs in the parallel path*
- **ML Inference Service (40ms):** Scores internal ad candidates using CTR prediction model, converts base CPM to eCPM

**Path B: External RTB Auction (100ms after split - CRITICAL PATH)**
- **RTB Auction Service (100ms):** Broadcasts OpenRTB bid requests to 50+ external Demand-Side Platforms (DSPs). DSPs run their own ML and return bids. Runs in parallel with ML path because it only needs user context from User Profile, operates on independent ad inventory from external partners.

**4. Unified Auction and Response (13ms avg, 15ms p99)**
- **Auction Logic (8ms avg, 10ms p99):**
  - Combines ML-scored internal ads with external RTB bids
  - Runs unified first-price auction to select highest eCPM across both sources (3ms)
  - Atomically checks and deducts from campaign budget via distributed cache atomic operations (3ms avg, 5ms p99)
  - Overhead: 2ms (detailed in [budget pacing section of Part 3](/blog/ads-platform-part-3-data-revenue/#budget-pacing-distributed-spend-control))
- **Response Serialization (5ms):** Formats winning ad with tracking URLs, returns to client

**Total: 143ms avg (145ms p99)** (15ms ingress + 10ms User Profile + 5ms Integrity Check + 100ms RTB + 13ms auction/budget/response, with ML path completing in parallel at 65ms after split)

**Background Processing (Asynchronous):**
- Ad Server publishes impression/click/conversion events to event stream (non-blocking)
- Stream processing layer aggregates events in real-time, updates distributed cache and Feature Store
- Batch processing layer runs jobs for model training data preparation
- Workflow orchestration system schedules daily CTR model retraining, publishes to Model Registry
- Transactional database archives 90-day-old billing records to object storage nightly (7-year regulatory retention)

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

**API Gateway Requirements:**

> **Architectural Driver: Latency** - The API gateway must operate within a 5ms latency budget while providing authentication, rate limiting, and traffic routing at 1M+ QPS scale.

**Key requirements:**
- **Sub-5ms latency overhead** for the entire gateway layer (TLS, auth, rate limiting, routing)
- **High throughput:** 150K+ requests/second per gateway node
- **Service mesh integration:** Unified observability and mTLS with the underlying service mesh
- **Authentication:** Support for JWT and OAuth 2.0 token validation
- **Rate limiting:** Distributed token bucket algorithm with sub-millisecond token checks
- **Operational simplicity:** Minimize the number of distinct proxy technologies in the stack

**Latency budget breakdown:**
- TLS termination: ~1ms
- Authentication (JWT validation): ~2ms
- Rate limiting (token check): ~0.5ms
- Request routing and enrichment: ~1.5ms
- **Total target: <5ms**

*Specific technology selection (gateway products, configuration, and deployment patterns) is covered in [Part 5](/blog/ads-platform-part-5-implementation/).*

### Rate Limiting: Volume-Based Traffic Control

Rate limiting protects infrastructure from overload while ensuring fair resource allocation across clients. This section covers the architectural pattern for distributed rate limiting at 1M+ QPS scale.

**Why Rate Limiting:**

1. **Infrastructure protection**: Prevents single client from overwhelming 1.5M QPS platform capacity
2. **Cost control**: Limits outbound calls to external DSPs (50+ partners × 1M QPS = massive API costs without controls)
3. **Fair allocation**: Ensures large advertisers don't starve smaller ones
4. **SLA enforcement**: API contracts specify tiered rate limits per advertiser

**Rate Limiting vs Fraud Detection:**

These are complementary mechanisms:
- **Rate limiting**: Volume-based control - "Are you requesting too much?" → throttle with HTTP 429
- **Fraud detection**: Pattern-based control - "Is your behavior malicious?" → permanent block

*Pattern-based fraud detection (device fingerprinting, behavioral analysis, bot detection) is covered in [Part 4](/blog/ads-platform-part-4-production/#fraud-detection-pattern-based-abuse-detection).*

**Multi-Tier Architecture:**

| Tier | Scope | Limit | Purpose |
|------|-------|-------|---------|
| **Global** | Entire platform | 1.5M QPS | Protect total capacity |
| **Per-IP** | Client IP | 10K QPS | Prevent single-source abuse |
| **Per-Advertiser** | API key | 1K-100K QPS (tiered) | SLA enforcement + fairness |
| **DSP outbound** | External calls | 50K QPS total | Control API costs |

**Distributed Rate Limiting Pattern:**

The core architectural challenge: enforcing global rate limits across 100+ distributed gateway nodes without centralizing every request.

**Approach:** Token bucket algorithm with distributed cache-backed state

- **Each advertiser** gets a token bucket (capacity = rate limit)
- **Token consumption** happens via atomic cache operations
- **Token refill** runs periodically (every 1-10 seconds depending on smoothness requirements)
- **Distributed enforcement**: All gateway nodes share the same distributed token counters

**Key trade-off:**
- **Centralized state** (distributed cache) adds 1-2ms latency per request
- **Benefit**: Accurate global rate limiting across all nodes
- **Acceptable**: 1-2ms fits within 5ms gateway latency budget

**Latency Budget:**
- API Gateway total: 5ms (authentication 2ms + rate limiting 1ms + enrichment 2ms)
- Rate limiting: 1ms for distributed cache token bucket check

**Complete Request Latency:**
- Network overhead + Gateway: 15ms
- User Profile (shared): 10ms
- Integrity Check (fraud filter): 5ms
- Critical service path: 100ms (RTB dominates - runs in parallel with ML)
  - *Note: RTB phase includes 1ms DSP selection lookup (performance tier filtering for egress cost optimization) + 99ms DSP auction. See [Part 2's Egress Bandwidth Cost Optimization](/blog/ads-platform-part-2-rtb-ml-pipeline/#egress-bandwidth-cost-optimization-predictive-dsp-timeouts) for details on DSP Performance Tier Service.*
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

*For detailed business model, revenue optimization, and economic rationale, see the "Ad Inventory Model and Monetization Strategy" section in the RTB integration post of this series.*

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

> **Critical Design Decision: Integrity Check Placement** - The 5ms Integrity Check Service runs BEFORE the RTB fan-out to 50+ DSPs. This prevents wasting bandwidth and DSP processing time on fraudulent traffic. Cost impact: blocking 20-30% bot traffic before RTB eliminates massive egress bandwidth costs (RTB requests to external DSPs incur data transfer charges). At scale (1M QPS, 50+ DSPs, 2-4KB payloads), early fraud filtering saves **thousands of times more** in annual bandwidth costs than the 5ms latency investment costs in lost impressions.

**Component explanations** (referencing dual-source architecture above):
- **User Profile (10ms)**: L1/L2/L3 cache hierarchy retrieves user demographics, interests, browsing history. Shared by both paths.
- **Integrity Check (5ms)**: Lightweight fraud detection using Bloom filter (known bad IPs), device fingerprint validation, and basic behavioral rules. Runs BEFORE expensive RTB calls to prevent wasting bandwidth on bot traffic. Multi-tier fraud detection is detailed in [Part 4](/blog/ads-platform-part-4-production/#fraud-detection-pattern-based-abuse-detection). Blocks 20-30% of fraudulent requests here.
- **Feature Store (10ms)**: Retrieves pre-computed behavioral features (1-hour click rate, 7-day CTR, etc.) from distributed feature cache. Used only by ML path.
- **Ad Selection (15ms)**: Queries **internal ad database** (transactional database) for top 100 candidates from direct deals, guaranteed campaigns, and house ads. Filters by user profile and features. Does NOT include RTB ads (those come from external DSPs).
- **ML Inference (40ms)**: GBDT model predicts CTR for internal ad candidates. Converts base CPM to eCPM using formula: `eCPM = predicted_CTR × base_CPM × 1000`. Output: List of internal ads with eCPM scores.
- **RTB Auction (100ms)**: Broadcasts OpenRTB request to 50+ external DSPs, collects bids. DSPs do their own ML internally. Output: List of external bids with prices.
- **Synchronization Point**: System waits here until BOTH paths complete. ML path (85ms total from start) finishes 35ms before RTB path (120ms total from start). Internal ads are cached while waiting for external RTB bids.
- **Final Auction (8ms avg, 10ms p99)**: Runs unified auction combining ML-scored internal ads (Source 1) with external RTB bids (Source 2). Selects winner with highest eCPM across both sources (3ms), then atomically checks and deducts campaign budget via atomic distributed cache operations (3ms avg, 5ms p99), plus overhead (2ms). Winner could be internal OR external ad.

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
   - Example: 0.05 CTR × base_CPM of 3 × 1000 = eCPM of 150

2. **Use eCPM from RTB bids:**
   - DSP bids are already in eCPM format
   - No conversion needed

3. **Select winner:**
   - Choose candidate with highest eCPM across all sources
   - Winner can be internal ad OR external RTB bid

**Example outcome:**
**Auction results:**
- DSP_A (external): eCPM of 180 **← WINNER** (external RTB wins)
- DSP_B (external): eCPM of 160
- Nike (internal): eCPM of 150
- Adidas (internal): eCPM of 120

Publisher earns highest bid for this impression. If an internal ad scored eCPM of 190 (highly personalized match), it would beat RTB - ensuring maximum revenue regardless of source.

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
| **Level 0**<br/>Normal | GBDT on CPU<br/>Latency: 20ms<br/>Revenue: 100%<br/>*Trigger: p99 < 40ms* | Transactional DB + distributed cache<br/>Latency: 8ms<br/>Accuracy: 100%<br/>*Trigger: p99 < 10ms* | Query all 50 DSPs<br/>Latency: 85ms<br/>Revenue: 100%<br/>*Trigger: p95 < 100ms* |
| **Level 1**<br/>Light Degradation | **Cached predictions**<br/>Cached CTR predictions<br/>Latency: 5ms<br/>Revenue: 92% (-8%)<br/>*Trigger: p99 > 40ms for 60s* | **Stale cache**<br/>Extended TTL cache<br/>Latency: 2ms<br/>Accuracy: 95% (-5%)<br/>*Trigger: p99 > 10ms for 60s* | **Top 30 DSPs only**<br/>Highest-value DSPs<br/>Latency: 80ms<br/>Revenue: 95% (-5%)<br/>*Trigger: p95 > 100ms for 60s* |
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

**Note:** Without optimization (legacy deployments, cold container pulls, full model loading from object storage), cold start can take **90-120 seconds**. The 30-40s baseline assumes modern best practices: pre-warmed images, model streaming, and persistent VRAM caching across instance restarts.

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
| **Wait for GPU**<br/>(no degradation) | 150ms<br/>total → timeout | -100%<br/>on timed-out requests | None |
| **Scale GPU instances** | 90s of 80ms<br/>latency → partial timeouts | -40%<br/>during scale-up window | +30-50% GPU baseline for burst capacity |
| **Degrade to cached predictions** | 5ms<br/>immediate | -8%<br/>targeting accuracy | None |

**Decision:** Degradation costs less (-8% vs -40%) and reacts faster (immediate vs 90s).

**But we still auto-scale!** Degradation buys time for auto-scaling to provision capacity. Once new GPU instances are healthy (90s later), circuit closes and we return to normal operation.

**Degradation is a bridge, not a destination.**

### P99 Tail Latency Defense: The Unacceptable Tail

At 1 million QPS, the **P99 tail represents 10,000 requests per second** - a volume too large to ignore. Without P99 protection, these requests risk timeout, resulting in blank ads and complete revenue loss on the tail.

> **Architectural Driver: Revenue Protection** - The P99 tail is dominated by garbage collection pauses and the slowest RTB bidder. Protecting these 10,000 req/sec requires infrastructure choices (low-pause GC) and operational discipline (hard timeouts with forced failure).

**Two Primary P99 Contributors:**

1. **Garbage Collection Pauses**: Traditional garbage collectors can produce 10-50ms stop-the-world pauses, consuming 7-33% of the 150ms latency budget
2. **Slowest RTB Bidder**: With 25-30 DSPs per auction, a single slow bidder (110-120ms) can push total latency over the SLO

**Defense Strategy 1: Low-Pause GC Technology**

**Requirement: Sub-2ms GC pause times at P99.9**

At 1M QPS serving hundreds of thousands of requests per second per instance, managed runtime garbage collection becomes a critical latency contributor. Traditional stop-the-world collectors can pause application threads for 10-50ms, directly violating latency budgets.

**Why it matters:** Without low-pause GC, traditional collectors can add 41-55ms to P99.9 latency, violating the 150ms SLO and causing mobile client timeouts.

**Technology options:**
- **Low-pause JVM collectors**: Modern concurrent GC with <2ms pauses
- **Low-pause runtimes**: Languages with sub-millisecond GC or no GC at all
- **Trade-off**: Typically 10-15% throughput reduction for pause time predictability

*[Part 5](/blog/ads-platform-part-5-implementation/) (Final Architecture) covers complete GC technology selection: specific collectors (low-pause concurrent GC, incremental GC), runtime comparisons (JVM vs Go vs Rust), configuration details, and performance validation.*

**Defense Strategy 2: RTB 120ms Absolute Cutoff**

**Hard timeout at 120ms** forces the Ad Server to cancel all pending RTB requests and fail over to fallback inventory:

- **Fallback Level 1**: Internal inventory only (preserves ~40% of revenue vs complete loss)
- **Fallback Level 2**: House Ad (0% ad revenue, but preserves user experience and prevents CTR degradation)

**Why 120ms?** This ensures total latency stays within 153ms even at P99 (Gateway 5ms + User Profile 10ms + Integrity Check 5ms + RTB 120ms + Auction 8ms + Response 5ms = 153ms). A 3ms SLO violation is acceptable; a mobile timeout (>200ms) is not.

**Trade-off Analysis:**

Better to serve a guaranteed ad at 120ms than wait for a perfect RTB bid that might never arrive. The P99 tail (1% of traffic) sacrifices 40-60% of optimal revenue to prevent 100% loss from timeouts and the compounding UX damage of blank ads (which reduces CTR across ALL traffic by 0.5-1%).

*[Part 4](/blog/ads-platform-part-4-production/) covers implementation details: request cancellation patterns, fallback logic, monitoring strategies, and chaos testing for P99 defense.*

---

## External API Architecture

The platform exposes three distinct API surfaces for different user personas. Each API has different latency requirements, security models, and rate limiting strategies. Understanding these external interfaces is critical - they're not implementation details but architectural concerns that shape request flow, authentication overhead, and operational complexity.

**Why APIs matter architecturally:** The API layer sits on the critical path (contributing 5ms to latency budget), enforces security boundaries (preventing unauthorized access to high-value revenue streams), and manages external load (rate limiting 1M+ QPS from thousands of publishers). Get API design wrong and you either violate latency SLOs, create security vulnerabilities, or waste engineering time debugging integration issues.

**Three API types overview:**
- **Publisher Ad Request API**: Critical path for ad serving (150ms P95 latency, 1M+ QPS)
- **Advertiser Campaign Management API**: Non-critical management operations (500ms latency acceptable, 10K req/min)
- **Event Tracking API**: High-volume async analytics (5M events/sec, best-effort delivery)

These APIs integrate with Part 1's system architecture (API Gateway → Ad Server Orchestrator), [Part 3's cache invalidation patterns](/blog/ads-platform-part-3-data-revenue/#cache-invalidation-strategies) (budget updates propagate through L1/L2/L3), and [Part 4's security model](/blog/ads-platform-part-4-production/#security-and-compliance) (zero-trust, encryption at rest/transit).

### Publisher Ad Request API - Critical Path

**Purpose and Requirements**

This API serves the core ad request flow: mobile apps and websites request ads in real-time. It's the highest-traffic, most latency-sensitive endpoint in the entire platform.

**Latency constraint:** P95 < 150ms (matches internal SLO from [Part 1's latency budget decomposition](/blog/ads-platform-part-1-foundation-architecture/#latency-budget-decomposition))
**Throughput:** 1M QPS baseline, 1.5M QPS burst capacity (from Part 1's scale requirements)
**Availability:** 99.9% uptime (43 min/month error budget - same as overall platform SLA)

**Why this is critical path:** Every millisecond counts. Mobile apps timeout after 150-200ms. If this API breaches budget, users see blank ad slots and we earn zero revenue on those requests.

**Endpoint Design**

**HTTP Method:** POST
**Path:** `/v1/ad/request`
**Authentication:** API Key via `X-Publisher-ID` header

**Why API key instead of OAuth:** Latency. OAuth token validation requires JWT signature verification (RSA-2048: 2-3ms) plus potential token introspection calls (5-10ms if not cached). API keys validate via simple distributed cache lookup (0.5ms). At 1M QPS, this 2ms difference consumes 13% of the gateway's 5ms latency budget.

**Rate Limiting:** 10K QPS per publisher (tied to SLA tier)

Publishers are tiered (Bronze: 1K QPS, Silver: 5K, Gold: 10K, Platinum: 50K+). Rate limits enforce commercial agreements and prevent single publisher from overwhelming platform capacity.

**Request Schema**

The request payload contains three categories of data:

**User Context Section:**
- `user_id` (hashed for privacy): SHA-256 hash of device ID or email, enables cross-session tracking while protecting PII
- `demographics`: Age range (18-24, 25-34, etc.), gender (inferred or declared)
- `interests`: Array of categories ([sports, technology, travel]) from behavioral signals

**Why hashed `user_id`:** Privacy-preserving while allowing frequency capping and sequential retargeting. Raw device IDs violate GDPR/CCPA; hashes satisfy "pseudonymization" requirements while enabling core ad tech workflows.

**Placement Section:**
- `format`: banner, video, interstitial, native, rewarded-video
- `dimensions`: 320x50 (mobile banner), 728x90 (leaderboard), 300x250 (medium rectangle)
- `position`: above_fold, below_fold, in_feed (affects viewability and CPM pricing)

**Device Section:**
- `type`: mobile, desktop, tablet, connected-tv
- `os`: iOS 17.2, Android 14, Windows 11 (for creative compatibility)
- `ip`: Client IP address for fraud detection and geo-targeting

**Why IP included:** Essential for two critical functions: (1) Fraud detection ([Part 4's Integrity Check Service](/blog/ads-platform-part-4-production/#fraud-detection-pattern-based-abuse-detection)) - correlate IP with device fingerprint to detect bot farms, (2) Geo-targeting - advertisers pay premium for location-based campaigns (NYC restaurant targets Manhattan users).

**Payload size constraint:** < 4KB

Why limit size? At 1M QPS, 4KB requests = 4GB/sec network ingress = 32 Gbps. Keeping payloads compact reduces infrastructure costs and network latency (smaller payloads = faster transmission over TCP).

**Response Schema**

The response contains the winning ad plus tracking instrumentation:

**Ad Metadata:**
- `ad_id`: Unique identifier for this specific ad creative
- `creative_url`: CDN-hosted asset (image, video, HTML5) served from global PoPs (sub-100ms first-byte time)
- `click_url`: Destination URL when user taps/clicks the ad

**Tracking URLs:**
- `impression_url`: Pre-signed URL for impression event (fired when ad displays)
- `click_url`: Pre-signed URL for click event
- `viewability_url`: Optional URL for viewability tracking (50%+ pixels visible for 1+ seconds)

**Why pre-signed URLs:** Prevents tracking pixel fraud. Without signatures, malicious publishers could forge impression events by repeatedly calling `/v1/events/impression` with fabricated data. Pre-signed URLs use HMAC-SHA256 with secret key and 5-minute expiry - only the Ad Server can generate valid tracking URLs.

**TTL (Time-To-Live):** 300 seconds default

Advertisers want fresh targeting data (user's interests from 5 minutes ago, not 24 hours ago), but excessive freshness increases server load. 300s (5min) balances these concerns - cache hit rate remains high (80%+) while targeting stays reasonably current.

**Integration with System Architecture**

Request flow: `Client → API Gateway (5ms) → Ad Server Orchestrator → [User Profile, ML, RTB, Auction] → Response`

Reference [Part 1's request flow diagram](/blog/ads-platform-part-1-foundation-architecture/#system-components-and-request-flow) - the Publisher API is the entry point to the entire ad serving critical path. The 5ms gateway latency budget includes API key validation (0.5ms), rate limiting (1ms), and request enrichment (3.5ms for adding geo-location from IP, parsing headers, sanitizing inputs).

**Why synchronous:** Publishers need immediate responses to render ad content. Asynchronous processing (accept request, return job ID, poll for result) would require publishers to implement complex retry logic and delays ad display by seconds - unacceptable for user experience.

### Advertiser Campaign Management API

**Purpose and Requirements**

Advertisers use this API to create campaigns, adjust budgets, query real-time stats, and manage targeting parameters. Unlike the Publisher API (critical path), these are management operations where 500ms latency is acceptable.

**Latency constraint:** P95 < 500ms (non-critical path, acceptable to be slower than ad serving)
**Throughput:** 10K req/min (much lower than 1M QPS ad serving - advertisers make tens of API calls per campaign, not millions)
**Use cases:** Dashboard integrations, programmatic campaign optimization, bulk operations

**Endpoint Catalog**

**POST `/v1/campaigns`** - Create campaign
- Request: Campaign name, budget, targeting criteria (interests, demographics, geo), creative assets, pricing model (CPM/CPC/CPA)
- Response: Campaign ID, initial status (pending_review → advertiser must await approval before serving)

**GET `/v1/campaigns/{id}/stats`** - Query real-time performance
- Request: Campaign ID, time range (last_hour, today, last_7_days), metrics (impressions, clicks, spend)
- Response: Aggregated stats with 10-30 second staleness (eventual consistency acceptable)

**PATCH `/v1/campaigns/{id}/budget`** - Adjust spending
- Request: New budget amount, pacing strategy (even_distribution, frontloaded)
- Response: Updated budget, estimated time to depletion

**DELETE `/v1/campaigns/{id}`** - Pause/stop campaign
- Request: Campaign ID
- Response: Confirmation, final spend report

**Authentication Model**

**OAuth 2.0 Authorization Code Flow**

**Why OAuth instead of API keys:** Long-lived sessions. Advertisers log into web dashboards for 30-60 minute sessions. OAuth provides:
- Access tokens (15 min expiry) - prevents token replay attacks
- Refresh tokens (rotation on use) - enables long sessions without storing credentials
- Scope-based permissions (read-only, billing-only, admin) - granular access control

OAuth's 2-3ms latency overhead is acceptable here because we have 500ms budget (vs 150ms for Publisher API).

**Scope-based permissions:**
- `campaigns:read` - View campaigns and stats
- `campaigns:write` - Create, update, pause campaigns
- `billing:read` - View invoices and spend
- `billing:write` - Update payment methods (admin only)

**Stats API Deep-Dive**

**The challenge:** Advertisers expect stats within 5 seconds (not 30 seconds from batch processing), but querying billions of impression/click events in real-time would violate latency budget and overwhelm the transactional database.

**Solution:** Separate analytics path with pre-aggregated data

Introduce a columnar analytics database (ClickHouse or Apache Druid) optimized for time-series aggregations:
- **Raw events:** Stream from Kafka to analytics database (not transactional database)
- **Pre-aggregation:** Hourly rollups compute `SUM(impressions), SUM(clicks), SUM(spend)` grouped by campaign_id
- **Query time:** Fetch pre-aggregated hourly data (1000× faster than scanning raw events)

**Trade-off:** 10-20 seconds staleness (eventual consistency). Events flow: User clicks ad → Kafka → Stream Processor → Analytics DB → Hourly rollup job → Stats API cache. Total pipeline latency: 10-20 seconds.

**Why acceptable:** Advertisers checking campaign progress don't need millisecond-accurate counts. Showing 99.6% budget utilization with 20-second lag is fine. Critical financial accuracy (budget enforcement) uses separate strongly-consistent path ([Part 3's atomic operations](/blog/ads-platform-part-3-data-revenue/#budget-pacing-distributed-spend-control)).

**Budget Update Workflow**

Advertiser updates budget via `PATCH /v1/campaigns/{id}/budget`:

1. **Request validated:** Check authorization (OAuth scopes), validate new budget > current spend
2. **Database write:** Update campaign budget in transactional database (strong consistency required)
3. **Cache invalidation cascade:** Propagate change through L1/L2/L3 cache hierarchy

**Cache invalidation mechanics** (reference [Part 3's cache hierarchy](/blog/ads-platform-part-3-data-revenue/#multi-tier-cache-hierarchy)):
- L1 (in-process Caffeine cache on 300 Ad Server instances): Pub/sub message triggers `cache.invalidate(campaign_id)` - propagation time <60 seconds
- L2 (distributed Valkey cache): `DEL campaign:{id}:budget` - immediate
- L3 (transactional database): Already updated (source of truth)

**Propagation time:** 10-20 seconds for all instances to see new budget

**Why this doesn't violate financial accuracy:** Budget enforcement uses pre-allocated windows ([Part 3's atomic pacing](/blog/ads-platform-part-3-data-revenue/#budget-pacing-distributed-spend-control)). Even if some servers see stale budget for 20 seconds, the atomic budget counter in distributed cache enforces spending limits with ≤1% variance. Worst case: slight over-delivery during propagation window, but bounded by pre-allocation limits.

### Event Tracking API

**Purpose and Requirements**

Track impressions (ad displayed), clicks (user tapped ad), and conversions (user installed app or made purchase). This API handles the highest volume - 5× the ad request rate due to retries, duplicates, and background analytics beacons.

**Volume:** 5M events/sec (5× ad request rate)
- 1M ad requests/sec → 1M impressions/sec (100% display rate)
- × 2-3% CTR = 30K clicks/sec
- × Retry/duplicate multiplier (2-3×) = 90K events/sec
- + Background analytics = 5M events/sec total

**Latency:** Best-effort (async processing acceptable)

Unlike ad serving (must complete in 150ms), event tracking can tolerate seconds of delay. Analytics dashboards update with 10-30 second lag, and that's fine.

**Endpoint Design**

**POST `/v1/events/impression`** - Ad displayed
**POST `/v1/events/click`** - Ad clicked
**POST `/v1/events/conversion`** - User converted (installed app, purchased product)

**Authentication:** Pre-signed URLs (embedded in ad response, no API key needed)

The ad response from Publisher API includes `impression_url: "/v1/events/impression?ad_id=123&sig=HMAC(...)"`. The client fires this URL when displaying the ad. HMAC signature validates request authenticity - only the Ad Server could have generated this URL with correct signature.

**Design Pattern**

**Client sends event → API Gateway → Kafka (async) → 200 OK immediately**

The API Gateway doesn't wait for Kafka acknowledgment or downstream processing. It accepts the event, publishes to Kafka, and returns success immediately. This non-blocking pattern achieves sub-10ms response times even at 5M events/sec.

**Idempotency via event_id:**

Mobile networks are unreliable. Clients retry failed requests, causing duplicate events. To prevent double-counting:
- Client generates unique `event_id` (UUID) per event
- Stream processor maintains a 24-hour deduplication cache (distributed Bloom filter)
- Duplicate events (same `event_id`) are discarded before analytics/billing

**Batching support:**

Mobile SDKs batch 10-50 events into single request to reduce network overhead:
```
POST /v1/events/batch
[
  {"type": "impression", "ad_id": 123, "timestamp": ...},
  {"type": "impression", "ad_id": 456, "timestamp": ...},
  {"type": "click", "ad_id": 123, "timestamp": ...}
]
```

Batching reduces request count by 10-50×, saving mobile battery and reducing server load.

**Why Async is Acceptable**

Events serve three purposes:
1. **Analytics dashboards:** Advertisers see campaign performance (eventual consistency acceptable - 10-30 sec lag)
2. **Billing reconciliation:** Monthly billing reports (eventual consistency acceptable - daily batch jobs)
3. **ML training data:** Historical click patterns feed CTR models (eventual consistency acceptable - model retrain daily)

None of these require real-time processing. Trading lower client latency (10ms vs 50ms if we waited for Kafka ack) for eventual consistency (10-30 sec lag) is a clear win.

### API Gateway Configuration

**Technology Choice Rationale**

Reference [Part 5's gateway selection](/blog/ads-platform-part-5-implementation/#communication-layer-grpc--linkerd) (detailed implementation covered in final architecture post). Requirements for this workload:
- **JWT validation:** 2ms overhead for OAuth tokens (Advertiser API)
- **API key validation:** 0.5ms overhead for distributed cache lookup (Publisher API)
- **Rate limiting:** 1ms overhead for distributed token bucket check
- **Total overhead target:** 2-4ms (fits within 5ms gateway budget from [Part 1's latency decomposition](/blog/ads-platform-part-1-foundation-architecture/#latency-budget-decomposition))

**Why these requirements matter:** At 1M QPS, every millisecond of gateway overhead consumes 0.67% of the 150ms latency budget. Inefficient gateways (10-15ms overhead) would violate SLOs before requests even reach the Ad Server.

**Per-API Configuration**

**Publisher API:**
- Authentication: API key validation via distributed cache (0.5ms)
- Rate limiting: Distributed token bucket (1ms) - enforces per-publisher QPS limits
- TLS termination: Required for PII protection (GDPR/CCPA compliance)

**Advertiser API:**
- Authentication: JWT validation (2ms) + OAuth token introspection (cached, 1ms)
- Rate limiting: Per-user token bucket (less aggressive than Publisher - 1K req/min vs 10K QPS)
- CORS handling: Dashboard integrations require cross-origin support

**Events API:**
- Authentication: Pre-signed URL HMAC verification (0.3ms - faster than API key)
- Rate limiting: Relaxed (clients batch requests, volume naturally throttled)
- Connection pooling: Persistent HTTP/2 connections reduce overhead for high-volume clients

**Cross-Region Routing**

**Publisher API:** Route to nearest region (GeoDNS - minimize latency)
- Client in NYC → us-east-1 gateway (10ms RTT)
- Client in London → eu-west-1 gateway (15ms RTT)
- Why: Latency-sensitive critical path - every millisecond counts

**Advertiser API:** Route to campaign's home region (data locality)
- Campaign created in us-east-1 → always route to us-east-1 (avoid cross-region data access)
- Why: 500ms latency budget allows cross-region routing if needed (80-120ms penalty acceptable)

**Events API:** Route to nearest Kafka cluster (minimize network hops)
- Event from mobile client in California → us-west-1 Kafka cluster
- Why: Reduces event ingestion latency and network egress costs

**Rate Limiting Architecture**

**Multi-tier limits** (from [Part 1's rate limiting section](/blog/ads-platform-part-1-foundation-architecture/#rate-limiting-volume-based-traffic-control)):
- **Global:** 1.5M QPS (platform capacity ceiling)
- **Per-publisher:** 10K QPS (enforce SLA tiers)
- **Per-IP:** 100 QPS (prevent DDoS from single source)

**Distributed cache-backed token bucket:**
- Each publisher has token bucket stored in distributed cache (Valkey/Redis)
- Bucket capacity = rate limit (e.g., 10K tokens for 10K QPS)
- Token consumption: Atomic `DECRBY bucket_key 1` operation (1ms latency)
- Token refill: Background job adds tokens every 100ms (smooth refill rate)

**Why distributed cache:** Centralized truth prevents "split-brain" scenarios where different gateway instances enforce different limits. Trade-off: 1ms cache lookup latency (acceptable within 5ms budget) for accurate global limits.

### API Versioning Strategy

**Versioning Approach**

**URL-based versioning:** `/v1/`, `/v2/`, `/v3/`

**Why URL-based instead of header-based:**
- **Simplicity:** Developers can test different versions by changing URL (no custom headers)
- **Caching:** CDNs and proxies cache by URL - header-based versioning breaks HTTP caching
- **Visibility:** Logs and metrics show version in URL path (easier debugging)

**Backward compatibility:** 12 months support for deprecated versions

When releasing `/v2/ad/request`, we maintain `/v1/ad/request` for 12 months. Publishers have 1 year to migrate before forced cutoff.

**Deprecation Workflow**

1. **Announce 6 months in advance** (blog post, email, dashboard banner)
2. **Response headers warn clients:**
   - `X-API-Deprecated: true`
   - `X-API-Sunset: 2026-01-01` (RFC 8594 Sunset Header)
3. **Migration tools** for common patterns (SDK code generators, automated migration scripts)
4. **Forced cutoff** after 12 months - `/v1` returns HTTP 410 Gone

**Breaking Change Examples**

**Requires new version:**
- Removing fields (breaks existing clients expecting those fields)
- Changing field types (`user_id` from integer to string)
- Stricter validation (rejecting previously-accepted invalid data could break clients)

**No new version needed:**
- Adding optional fields (clients ignore unknown fields)
- Deprecating fields (mark as deprecated but keep functioning)
- Looser validation (accepting more input variants)

**Why this matters:** Breaking changes frustrate developers and damage platform adoption. Clear versioning strategy builds trust - developers know migrations are manageable (12-month window) and predictable (semantic versioning).

### Security Model

**Authentication Methods**

**Publisher API: API Keys**
- Rotation: Quarterly mandatory, triggered rotation on suspected compromise
- Storage: Keys hashed (SHA-256) in database, distributed cache stores hash for validation
- Distribution: Dashboard allows publishers to generate/revoke keys (OAuth-protected admin panel)

**Key management:** Publishers can create multiple keys (dev, staging, production) with independent rate limits. Compromised key = revoke specific key without disrupting other environments.

**Advertiser API: OAuth 2.0**
- **Access token:** 15 min expiry (limits replay attack window)
- **Refresh token:** Rotation on use (prevents token theft long-term)
- **Authorization server:** Centralized OAuth provider handles token issuance, validation, revocation

**Why 15 min expiry:** Balances security (short window for stolen token abuse) vs user experience (refresh tokens silently renew access without re-login).

**Events API: Pre-signed URLs**
- **HMAC-SHA256 signature:** Verifies URL wasn't tampered with
- **5-minute expiry:** Prevents replay attacks (old impression URLs can't be reused days later to forge events)
- **Parameters signed:** `ad_id`, `campaign_id`, `timestamp` included in HMAC input - prevents parameter tampering

**Authorization Granularity**

**Publisher: Domain whitelisting**
- Publishers register allowed domains/apps (`example.com`, `com.example.app`)
- Requests from non-whitelisted origins rejected (prevents API key theft and use on malicious sites)

**Advertiser: Tenant isolation**
- Advertisers can only access their own campaigns (row-level security in database)
- RBAC roles:
  - **Admin:** Full campaign management + billing access
  - **Read-only:** View-only dashboard access
  - **Billing-only:** Invoice and payment method access (no campaign creation)

**Why tenant isolation matters:** Shared infrastructure (multi-tenant platform) requires strict boundaries. Advertiser A must never see Advertiser B's campaign data, even through API exploits or SQL injection attempts. Defense-in-depth: API layer enforces authorization, database layer enforces row-level security.

**Threat Mitigation**

**API key leakage:**
- **Automatic rotation:** Quarterly forced rotation reduces long-term exposure
- **Rate limit per key:** Leaked key limited to 10K QPS (can't overwhelm platform)
- **Anomaly detection:** Sudden traffic spike from single key triggers alert + automatic temporary suspension

**Token theft (OAuth):**
- **Short-lived access tokens (15 min):** Limits abuse window
- **Refresh token rotation:** Stolen refresh token invalidated on next legitimate refresh
- **IP geofencing:** Suspicious IP changes (NYC → China in 5 minutes) trigger re-authentication

**Replay attacks:**
- **Nonce-based idempotency:** `event_id` uniqueness enforced (duplicate events rejected)
- **Timestamp validation:** Requests with timestamps >5 min old rejected
- **HMAC expiry:** Pre-signed URLs expire after 5 minutes (can't replay old tracking URLs)

### API Architecture Diagrams

**Diagram 1: API Request Flow**

This diagram shows how the three client types (mobile apps, web dashboards, tracking SDKs) connect through the API Gateway to backend services, each with distinct authentication and latency requirements.

{% mermaid() %}
graph TB
    subgraph "Client Applications"
        MOBILE[Mobile App<br/>Publisher API]
        WEB[Web Dashboard<br/>Advertiser API]
        SDK[Tracking SDK<br/>Events API]
    end

    subgraph "API Gateway Layer"
        GW[Envoy Gateway<br/>Auth + Rate Limiting<br/>2-4ms overhead]
    end

    subgraph "Backend Services"
        AS[Ad Server<br/>Critical Path<br/>150ms SLO]
        CAMPAIGN[Campaign Service<br/>Non-Critical<br/>500ms SLO]
        KAFKA[Kafka<br/>Event Streaming<br/>Async]
    end

    MOBILE -->|POST /v1/ad/request<br/>API Key| GW
    WEB -->|GET /v1/campaigns/stats<br/>OAuth 2.0| GW
    SDK -->|POST /v1/events/impression<br/>Pre-signed URL| GW

    GW -->|Sync| AS
    GW -->|Sync| CAMPAIGN
    GW -->|Async| KAFKA

    AS -->|Response<br/>ad_creative + tracking_urls| MOBILE
    CAMPAIGN -->|Response<br/>stats JSON| WEB
    KAFKA -->|200 OK<br/>Non-blocking| SDK

    classDef client fill:#e1f5ff,stroke:#0066cc
    classDef gateway fill:#fff4e1,stroke:#ff9900
    classDef service fill:#e8f5e9,stroke:#4caf50
    classDef async fill:#ffe0b2,stroke:#e65100

    class MOBILE,WEB,SDK client
    class GW gateway
    class AS,CAMPAIGN service
    class KAFKA async
{% end %}

**Diagram 2: Authentication Flow Comparison**

This diagram illustrates the three authentication methods and their latency trade-offs - API keys for low latency (Publisher), OAuth for security (Advertiser), and pre-signed URLs for volume (Events).

{% mermaid(init='{ "flowchart": { "nodeSpacing": 50, "rankSpacing": 80, "curve": "basis", "useMaxWidth": true, "padding": 30 } }') %}
graph LR
    subgraph PUBLISHER ["Publisher API<br/>Low Latency Priority (0.5ms total)"]
        direction LR
        P1[Client Request<br/>X-API-Key header] --> P2[Gateway:<br/>Cache lookup<br/>for API key]
        P2 --> P3[Validation<br/>✓ Key exists<br/>✓ Not revoked<br/>0.5ms]
        P3 --> P4[Forward to<br/>Ad Server]
    end

    subgraph ADVERTISER ["Advertiser API<br/>Security Priority (2-3ms total)"]
        direction LR
        A1[Client Request<br/>OAuth Bearer token] --> A2[Gateway:<br/>JWT signature<br/>verification]
        A2 --> A3[Validation<br/>✓ RSA-2048 signature<br/>✓ Token not expired<br/>✓ Scopes match]
        A3 --> A4[2ms<br/>validation] --> A5[Forward to<br/>Campaign Service]
    end

    subgraph EVENTS ["Events API<br/>Volume Priority (0.3ms total)"]
        direction LR
        E1[Client Request<br/>Pre-signed URL<br/>with HMAC] --> E2[Gateway:<br/>HMAC-SHA256<br/>verification]
        E2 --> E3[Validation<br/>✓ Signature valid<br/>✓ Not expired<br/>0.3ms]
        E3 --> E4[Forward to<br/>Kafka async]
    end

    classDef fast fill:#e6ffe6,stroke:#4caf50,stroke-width:2px
    classDef medium fill:#fff4e6,stroke:#ff9900,stroke-width:2px
    classDef ultrafast fill:#ccffcc,stroke:#339933,stroke-width:2px

    class P1,P2,P3,P4 fast
    class A1,A2,A3,A4,A5 medium
    class E1,E2,E3,E4 ultrafast
{% end %}

**Section Conclusion**

The three API surfaces - Publisher (critical path, 150ms latency), Advertiser (management, 500ms latency), Events (high volume, async) - each have distinct requirements that shape authentication, rate limiting, and infrastructure choices.

**Key insights:**
- **Latency drives authentication:** Publisher API uses API keys (0.5ms) instead of OAuth (2-3ms) because every millisecond matters at 1M QPS
- **Security models match threat profiles:** Pre-signed URLs prevent tracking fraud (billions of events/day), OAuth prevents account takeover (financial access)
- **Rate limiting protects revenue:** Without limits, single malicious publisher could consume 1.5M QPS capacity, DDoSing legitimate traffic

**Cross-references:**
- [Part 3's cache invalidation strategy](/blog/ads-platform-part-3-data-revenue/#cache-invalidation-strategies) details how budget updates propagate through L1/L2/L3 tiers after Advertiser API calls
- [Part 4's security section](/blog/ads-platform-part-4-production/#security-and-compliance) covers zero-trust architecture, encryption at rest/transit, and defense-in-depth patterns underlying these auth mechanisms
- [Part 5](/blog/ads-platform-part-5-implementation/) specifies the concrete gateway technology (Envoy vs Kong vs custom) and configuration to meet these latency requirements

With these API foundations established, the platform has clear external interfaces for publishers (ad serving), advertisers (campaign management), and analytics (event tracking). Next, we'll explore how the system maintains these SLOs under failure conditions.

---

## Summary: Building a Solid Foundation

This post established the architectural foundation for a real-time ads platform serving 1M+ QPS with 150ms latency targets. The key principles and decisions made here will ripple through all subsequent design choices.

**Core Requirements:**
- **Latency**: 150ms p95 end-to-end, with 143ms avg (145ms p99) leaving 5-7ms buffer
- **Scale**: 1M QPS peak (1.5M capacity), 400M DAU, 8B requests/day
- **Financial accuracy**: ≤1% billing variance (strong consistency for spend, eventual for profiles)
- **Availability**: 99.9% uptime (43 min/month error budget, zero planned downtime)

**Architectural Decisions:**

1. **Dual-Source Architecture**: Internal ML inventory + External RTB inventory compete in unified auction
   - Parallel execution (ML: 65ms, RTB: 100ms) maximizes revenue within latency budget
   - 100% fill rate through fallback hierarchy

2. **Latency Budget Decomposition**: Every millisecond allocated and defended
   - Network: 15ms | User Profile: 10ms | Integrity Check: 5ms
   - Critical path: RTB (100ms) | Auction + Budget: 13ms | Response: 5ms
   - Total: 143ms avg with 7ms safety margin

3. **Resilience Through Degradation**: Multi-level fallback preserves availability
   - Circuit breakers detect service degradation (p99 breaches for 60s)
   - Graceful degradation ladder: cached predictions → heuristics → global averages
   - Trade modest revenue loss (8-25%) for 100% availability vs complete outages

4. **P99 Tail Latency Defense**: Protecting 10,000 req/sec from timeouts
   - **Infrastructure**: Low-pause GC runtime (32GB heap, 200 threads per instance)
     - Eliminates GC pauses as P99 contributor (<1ms vs 41-55ms with traditional GC)
     - Calculated from actual workload: 250-400 MB/sec allocation, 5K QPS per instance
   - **Operational**: 120ms absolute RTB cutoff with forced failure
     - Prevents P99 tail from violating 150ms SLO (would reach 184-198ms)
     - Falls back to internal inventory (40% revenue) vs blank ads (0% revenue)

5. **Rate Limiting**: Infrastructure protection + cost control
   - Distributed cache-backed distributed token bucket (centralized truth)
   - Multi-tier limits: global (1.5M QPS), per-IP (10K), per-advertiser (1K-100K)
   - Prevents 20-30% infrastructure overprovisioning for attack scenarios

**Why This Foundation Matters:**

The architectural decisions made in this foundation phase create the constraints and opportunities that shape the entire system:

- **Latency budgets** force parallel execution patterns and limit database round-trips - sequential operations on the critical path are simply not viable
- **Dual-source architecture** enables maximum revenue (combining internal ML and external RTB) but requires unified auction complexity to fairly compete bids
- **Resilience patterns** allow aggressive optimization (tight latency budgets) with safety nets (graceful degradation) - we can push components to their limits knowing fallback paths exist
- **GC analysis** demonstrates how infrastructure choices (low-pause GC runtime, heap sizing, thread pool configuration) directly impact SLO compliance - preventing 10,000 requests/second from timing out

**Core Insights from This Analysis:**

1. **Quantify everything**: Latency budgets, failure modes, and trade-offs must be measured, not assumed. Calculate actual GC pause times from allocation rates. Prove circuit breaker thresholds from P99 distributions.

2. **Design for degradation**: Perfect availability is impossible at scale. Build graceful degradation paths that trade modest revenue loss (8-25%) for continued operation vs complete outages.

3. **Infrastructure drives SLOs**: Language runtime choices (GC), heap sizing, and thread pool configuration aren't implementation details - they determine whether you meet or violate latency SLOs at P99.

4. **Parallel execution is mandatory**: With 150ms total budget and 100ms external dependencies, sequential operations violate SLOs. The dual-source architecture with parallel ML and RTB execution is a requirement, not an optimization.

5. **Financial accuracy shapes consistency models**: Advertiser budgets demand strong consistency (≤1% variance), while user profiles tolerate eventual consistency. Choose the right model for each data type based on business impact.
