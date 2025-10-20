+++
authors = [ "Yuriy Polyulya" ]
title = "Architecting Real-Time Ads Platforms: A Distributed Systems Engineer's Design Exercise"
description = "A design exploration of building real-time ads platforms serving 400M+ users with sub-100ms latency. Applying distributed systems principles to RTB protocols, ML inference pipelines, auction algorithms, and resilience patterns - a thought experiment in solving complex distributed systems challenges."
date = 2025-10-15

draft = false
slug = "architecting-real-time-ads-platforms-design-exercise"

[taxonomies]
tags = ["distributed-systems", "system-design", "performance"]

[extra]
toc = false
disclaimer = ""

+++

## Introduction: The Challenge of Real-Time Ad Serving at Scale

Full disclosure: I've never built an ads platform before. But as someone who's spent years working with distributed systems, this problem immediately caught my attention. It's a fascinating puzzle that combines everything I find interesting about large-scale systems - real-time processing, distributed coordination, strict latency requirements, and financial accuracy at scale.

What drew me to explore this problem is the complexity underneath what seems simple. A user opens an app, sees a relevant ad in under 100ms, clicks it, and the advertiser gets billed. Straightforward, right? But when you start thinking about the mechanics - coordinating auctions across dozens of bidding partners, running ML predictions in real-time, maintaining budget consistency across regions, handling 1M+ queries per second - it becomes clear this is anything but simple.

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

**Note on costs:** Throughout this post, I'll discuss cost comparisons between different technologies. Please note that pricing varies significantly by cloud provider, region, contract negotiations, and changes over time. The cost figures I mention are rough approximations to illustrate relative differences, not exact pricing you should rely on. Always check current pricing from vendors and factor in your specific usage patterns and potential enterprise discounts.

---

## Part 1: Requirements and Constraints

### Functional Requirements

Okay, so first things first - what does this system actually need to do? I've broken it down into a few key areas:

**1. Multi-Format Ad Delivery**

You need to handle all the different ad types users expect these days - story ads, video ads, carousel ads, even AR-enabled ads if you're feeling fancy. And of course, it all needs to work on iOS, Android, and web. The creative assets should come from a CDN (obviously), aiming for sub-100ms first-byte time.

**2. Real-Time Bidding (RTB) Integration**

This is where things get interesting. You're implementing OpenRTB 2.5+ (or whatever version is current), talking to 50+ demand-side platforms simultaneously. The IAB standards give you a hard 30ms timeout for the auction - which sounds generous until you realize you need to do 50+ network calls in parallel. And if you think that's easy, wait until you discover that some DSPs are in Europe, some are in Asia, and suddenly you're trying to do a 30ms global auction with 150ms round-trip times to some bidders.

Oh, and you also need to handle both programmatic and guaranteed inventory, which have completely different SLAs and business logic. Fun!

**3. ML-Powered Targeting and Optimization**

The ML stuff is critical for revenue:
- Real-time CTR prediction (you can't just serve random ads)
- Conversion rate optimization
- Dynamic creative optimization (showing different ad variants)
- Budget pacing algorithms (so advertisers don't blow their entire budget in the first hour)

**4. Campaign Management**

Then there's all the campaign management stuff - real-time performance metrics, A/B testing framework, frequency capping (nobody wants to see the same ad 50 times), quality scoring, policy compliance, etc.

### Non-Functional Requirements: Performance Modeling

Now here's where I like to get mathematical about it. Let me formalize the performance constraints:

**Latency Distribution Constraint:**
$$P(\text{Latency} \leq 100\text{ms}) \geq 0.95$$

So this just means 95% of requests need to finish within 100ms. The tricky part is that total latency is the sum of all the services in the request path:

$$T_{total} = \sum_{i=1}^{n} T_i$$

where \\(T_i\\) is the latency of each service. If you have 5 services each taking 20ms, you're already at 100ms with zero margin for error.

This is why latency budgets are so important - and why you need to be brutal about them. I've been in way too many meetings where someone says "oh we can just add another service call, it's only 10ms" and then suddenly your p99 latency is 200ms and you're wondering what happened.

**Throughput Requirements:**

For peak load, I'm targeting:
$$Q_{peak} \geq 1.5 \times 10^6 \text{ QPS}$$

Now, Little's Law gives us a way to figure out how many servers we need. With service time \\(S\\) and \\(N\\) servers:
$$N = \frac{Q_{peak} \times S}{U_{target}}$$

But here's the thing - \\(U_{target}\\) shouldn't be a fixed percentage like 0.7. That's wasteful at scale. With 1000 instances, a fixed 30% buffer means 300 idle instances just sitting there burning money.

Instead, buffer capacity dynamically based on autoscaling response time:
$$N_{buffer} = \frac{dQ}{dt} \times T_{scale}$$

where:
- \\(\frac{dQ}{dt}\\) = traffic growth rate (QPS/second)
- \\(T_{scale}\\) = time to provision + warm up new instances

**Example:** If traffic grows at 10K QPS/second during peak, and instances take 90 seconds to provision and warm up, you need buffer for 900K QPS. At 1K QPS/instance, that's 900 instances buffer - regardless of fleet size.

Key insight: buffer is constant based on scaling speed, not a percentage of fleet. A 100-instance fleet and 10,000-instance fleet need the same buffer if they face the same traffic growth rate and provisioning time.

**Availability Constraint:**

I'm aiming for "five nines" (99.995% uptime):
$$A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \geq 0.9995$$

where MTBF = Mean Time Between Failures, MTTR = Mean Time To Recovery.

This gives me about **26 minutes** of allowed downtime per month. That's... not a lot. A bad deploy can blow through that in minutes - or even seconds if something goes really wrong, like a config change that accidentally routes all traffic to a single region.

**Consistency Requirements:**

Here's where things get nuanced. Not all data needs the same consistency guarantees, and treating everything as strongly consistent will significantly degrade your performance:

- **Financial data** (ad spend, billing): Strong consistency - no exceptions
  $$\forall t_1 < t_2: \text{Read}(t_2) \text{ observes } \text{Write}(t_1)$$

  You cannot mess up billing. Ever. If an advertiser pays for 1000 impressions, they get exactly 1000 impressions. Not 999, not 1001. Exactly 1000. Companies have been sued over much smaller billing discrepancies than you might expect.

- **User preferences**: Eventual consistency is fine
  $$\lim_{t \to \infty} P(\text{AllReplicas consistent}) = 1$$

  If a user updates their interests and sees old targeting for a few seconds, it's not critical.

  **Practical example:** User adds "fitness equipment" to their interests. If they see ads for electronics for the next 10-20 seconds while the update propagates across replicas, that's acceptable. The user doesn't even notice, and we haven't lost revenue.

- **Ad inventory**: Bounded staleness (maybe 30 seconds?)
  $$|\text{Read}(t) - \text{TrueValue}(t)| \leq \epsilon \text{ for } t - t_{write} \leq 30s$$

  Slightly stale inventory counts are acceptable. We might over-serve a campaign by a few impressions, but we can reconcile that later.

  **Why this works:** An advertiser with a 100K impression budget won't notice if we serve 100,050 impressions due to stale counts. We can adjust billing retroactively. But if we under-serve by 5K impressions because we were too conservative? That's lost revenue and an angry advertiser.

### Scale Analysis

**Data Volume Estimation:**

With 400M DAU, averaging 20 ad requests/user/day:
- Daily ad requests: **8B requests/day**
- Daily log volume (at 1KB per log): **8TB/day**

**Storage Requirements:**

- User profiles (10KB per user): **4TB**
- Historical ad performance (30 days retention, 100B per impression): **~24TB**

**Cache Sizing:**

For 95% cache hit rate with Zipfian distribution (\\(\alpha = 1.0\\)), you need approximately 20% of total dataset:
- Required cache for 400M users: **~800GB**

Distributed across 100 cache nodes: **8GB per node**.

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
        GW[API Gateway<br/>Rate Limiting: 1M QPS<br/>Auth: JWT/OAuth]
        AS[Ad Server Orchestrator<br/>Stateless, Horizontally Scaled<br/>100ms latency budget]

        subgraph "Core Services"
            UP[User Profile Service<br/>Demographics, Interests<br/>Target: 10ms]
            AD_SEL[Ad Selection Service<br/>Candidate Retrieval<br/>Target: 15ms]
            ML[ML Inference Service<br/>CTR Prediction<br/>Target: 40ms]
            RTB[RTB Auction Service<br/>OpenRTB Protocol<br/>Target: 30ms]
        end

        subgraph "Data Layer"
            REDIS[(Redis Cluster<br/>1000 nodes<br/>Consistent Hashing)]
            CASS[(Cassandra<br/>User Profiles<br/>Ad Inventory<br/>RF=3, CL=QUORUM)]
            FEATURE[(Feature Store<br/>ML Features<br/>Sub-10ms p99)]
        end
    end

    subgraph "Data Processing Pipeline"
        KAFKA[Kafka<br/>Event Streaming<br/>100K events/sec]
        FLINK[Flink<br/>Stream Processing<br/>Real-time Aggregation]
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

    UP --> REDIS
    AD_SEL --> REDIS
    ML --> FEATURE
    RTB --> |OpenRTB 2.x| EXTERNAL[50+ DSP Partners]

    UP --> CASS
    AD_SEL --> CASS

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
    class GW,AS,UP,AD_SEL,ML,RTB service
    class REDIS,CASS,FEATURE,S3 data
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

So here's where I need to pick an API gateway. I've spent way too much time thinking about this, but it's such a critical component. Let me walk through my thought process:

| Technology | Latency Overhead | Throughput (RPS) | Rate Limiting | Auth Methods | Ops Complexity |
|------------|------------------|------------------|---------------|--------------|----------------|
| **Kong** | 3-5ms | 100K/node | Plugin-based | JWT, OAuth2, LDAP | Medium |
| AWS API Gateway | 5-10ms | 10K/endpoint | Built-in | IAM, Cognito, Lambda | Low (managed) |
| **NGINX Plus** | 1-3ms | 200K/node | Lua scripting | Custom modules | High |
| Envoy | 2-4ms | 150K/node | Extension filters | External auth service | High |

**My pick: Kong** (though this took some deliberation)

Why Kong appeals to me:
- The plugin ecosystem is really rich - rate limiting, auth, transformations all work out of the box
- 3-5ms overhead fits comfortably within my 5ms budget
- I can run it on-prem and avoid those nasty per-request AWS charges
- Developer experience is pretty solid with declarative config and OpenAPI integration

That said, I'll admit there's some bias here - debugging complex NGINX + Lua configurations can be... challenging, to put it mildly.

**I was tempted by NGINX Plus though:**
- That 1-3ms latency is *really* attractive - best in class
- 200K RPS/node is impressive
- But... writing custom Lua for complex auth logic? That's where I hesitated. It would add weeks to development time, and finding people who are both good at Lua and understand auth is harder than it should be.

**Why I ruled out AWS API Gateway:**

When I estimated the costs, the numbers were surprising:
- At 1M QPS (roughly 86B requests/day), AWS's per-request pricing can reach **hundreds of thousands per month**
- The 5-10ms latency overhead is also problematic - I need 2ms for authentication, so I'd be cutting it close
- It's great for serverless/event-driven stuff, but for sustained high throughput? Not ideal.

**Rough cost comparison (noting that pricing varies by region and can change):**

Kong self-hosted:
- Infrastructure: ~10 nodes with appropriate instance types
- License: Enterprise license if needed
- **Ballpark: ~$5-15K/month** depending on configuration

AWS API Gateway:
- Per-request pricing at this scale (billions of requests/month)
- **Ballpark: Could be 10-30× more expensive** than self-hosted

The cost difference at high sustained throughput is significant - potentially enough to fund multiple engineer salaries. Your mileage may vary based on AWS discounts and specific usage patterns.

**Sanity check on latency:**

Does Kong actually fit in my 5ms budget?
- TLS termination: ~1ms
- Authentication (JWT verify): ~2ms
- Rate limiting (Redis lookup): ~1ms
- Request routing: ~1ms
**Total: 5ms** - just barely fits within budget. Tight, but workable.

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

To prevent cascading failures, implement circuit breakers for each downstream dependency. The pattern works with three states:

- **CLOSED**: Normal operation - all requests pass through. Monitor error rate and p99 latency continuously.
- **OPEN**: When error rate exceeds 10% within a 1-minute window, trip to OPEN. Block all requests and serve from cache/fallback. This prevents overwhelming a struggling service.
- **HALF-OPEN**: After timeout (with exponential backoff), send 1% test traffic. If 90%+ succeeds for 10 requests, return to CLOSED. Any failure returns to OPEN with increased backoff.

**Circuit Breaker State Transitions:**

Let \\(E(t)\\) be the error rate at time \\(t\\), and \\(\tau\\) be the threshold (e.g., 0.10).

**CLOSED → OPEN transition:**
$$\text{If } E(t) > \tau \text{ for } \Delta t \geq 60s, \text{ then trip circuit}$$

**OPEN → HALF-OPEN transition:**
$$\text{After timeout } T_{backoff} = T_{base} \times 2^{n}$$
where \\(n\\) is the number of consecutive failures, \\(T_{base} = 30s\\).

**HALF-OPEN → CLOSED transition:**
$$\text{if } \frac{successes}{total\\_tests} \geq 0.90 \text{ for } N = 100 \text{ requests}$$

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

Network latency is bounded by speed of light:
$$T_{propagation} \geq \frac{d}{c \times 0.67}$$

where \\(d\\) is distance, \\(c\\) is speed of light, 0.67 accounts for fiber optic refractive index.

**Example:** New York to London (5,585 km):
$$T_{propagation} \geq \frac{5,585,000m}{3 \times 10^8 m/s \times 0.67} \approx 28ms$$

This is nearly the entire RTB budget! Solution: regional deployment.

**Optimal DSP Integration Points:**

Deploy RTB auction services in:
1. **US East** (Virginia): Proximity to major ad exchanges
2. **US West** (California): West coast advertisers
3. **EU** (Amsterdam/Frankfurt): GDPR-compliant EU auctions
4. **APAC** (Singapore): Asia-Pacific market

**Latency Reduction:**

With regional deployment, max distance reduced from 10,000km to ~1,000km:
$$T_{propagation} \approx \frac{1,000,000m}{3 \times 10^8 m/s \times 0.67} \approx 5ms$$

**Savings:** 23ms, enough to include 10+ additional DSPs within budget.

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

| Technology | Throughput/Partition | Latency (p99) | Durability | Ordering | Scalability |
|------------|---------------------|---------------|------------|----------|-------------|
| **Kafka** | 100MB/sec | 5-15ms | Disk-based replication | Per-partition | Horizontal (add brokers/partitions) |
| Pulsar | 80MB/sec | 10-20ms | BookKeeper (distributed log) | Per-partition | Horizontal (separate compute/storage) |
| RabbitMQ | 20MB/sec | 5-10ms | Optional persistence | Per-queue | Vertical (limited) |
| AWS Kinesis | 1MB/sec/shard | 200-500ms | S3-backed | Per-shard | Manual shard management |

**I'm going with Kafka** (yeah, I know, not exactly a hot take - but hear me out)

Here's my reasoning:
- **Throughput:** 100MB/sec per partition is exactly what I need for peak load (100K events/sec × 1KB/event = 100MB/sec)
- **Latency:** 5-15ms p99 leaves me plenty of headroom in my 100ms feature freshness budget
- **Durability:** The disk-based replication (RF=3) means I won't lose data when brokers fail. And they will fail eventually.
- **Ecosystem:** Everything works with Kafka - Flink, Spark, the whole Kafka Connect ecosystem. Well, "just works" might be generous - you'll still spend time tuning GC settings and figuring out consumer group rebalancing issues. But compared to alternatives? It's pretty solid.
- **Ordering:** Per-partition ordering is critical for event causality (you can't process a click before the impression)

Pulsar's architecture is genuinely elegant with its storage/compute separation, but the ecosystem maturity gap is real. Sometimes boring and battle-tested wins over architecturally pure.

**Partitioning strategy:**

For 100K events/sec across 100 partitions, we get **1,000 events/sec per partition**.

Partition key: `user_id % 100` ensures:
- All events for a user go to same partition (maintains ordering)
- Balanced distribution (assuming uniform user distribution)

**Rough cost comparison (prices vary by region and over time):**

Kafka self-hosted:
- Infrastructure: Several brokers with appropriate compute/storage
- Storage: NVMe SSDs for performance
- ZooKeeper cluster for coordination
- **Ballpark: ~$3-5K/month** for this workload

AWS Kinesis alternative:
- Per-shard hourly fees
- Per-PUT request fees at billions of PUTs per month
- **Ballpark: Could be 20-50× more expensive** than self-hosted Kafka at high sustained throughput

The cost difference is substantial at this scale - self-hosted Kafka can be **significantly cheaper** than managed stream services when you have high, consistent throughput. However, Kinesis might make sense for bursty or low-volume workloads where operational simplicity matters more than cost.

**Why I didn't pick RabbitMQ:**

I actually like RabbitMQ for certain things, but here it just doesn't fit:
- 20MB/sec throughput ceiling is way below what I need (I need 100MB/sec)
- Scaling is painful - you're mostly stuck with vertical scaling, and horizontal scaling gets messy
- It's really built for task queues, not event streaming. I'd be fighting the tool.

**Why I passed on Pulsar:**

Pulsar is interesting, and I genuinely considered it:
- The storage/compute separation is elegant, especially for long-term retention
- But the ecosystem isn't quite there yet - fewer integrations with the analytics tools I want to use
- The separate BookKeeper layer adds operational complexity that I'm not excited about
- For my 7-day retention requirement, that advanced storage architecture seems unnecessary

**Technology Selection: Stream Processing**

**Stream Processing Frameworks:**

| Technology | Latency | Throughput | State Management | Exactly-Once | Ops Complexity |
|------------|---------|------------|------------------|--------------|----------------|
| **Flink** | <100ms | 1M events/sec | Distributed snapshots | Yes (Chandy-Lamport) | Medium |
| Spark Streaming | ~500ms | 500K events/sec | Micro-batching | Yes (WAL) | Medium |
| Kafka Streams | <50ms | 800K events/sec | Local RocksDB | Yes (transactions) | Low |
| Storm | <10ms | 300K events/sec | Manual | No (at-least-once) | High |

**Decision: Flink**
- **Latency requirement:** 100ms feature freshness
- **True streaming:** Event-by-event processing (not micro-batches like Spark)
- **State management:** Distributed snapshots for windowed aggregations
- **Exactly-once semantics:** Critical for financial data (ad spend tracking)

**Mathematical justification:**

For windowed aggregation with window size \\(W\\) and event rate \\(\lambda\\):

$$state\\_size = \lambda \times W \times event\\_size$$

Example: 100K events/sec, 60s window, 1KB/event → **~6GB state per operator**.

Flink handles 6GB state with RocksDB backend efficiently. Spark's micro-batching would add 500ms delay, violating freshness constraint.

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

Custom solution: 2 engineers × 6 months × $200K/year = $200K development + $50K/year infrastructure = **$250K first year**, $50K ongoing

Tecton: $100K/year SaaS fee = **$100K first year**, $100K ongoing

Break-even at ~2 years, but faster time-to-market with Tecton.

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
        KAFKA --> FLINK[Flink<br/>Windowed Aggregation]
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

**GBDT:** \\(T_{ml} = 10ms + 8ms + 2ms = 20ms\\) ✓ Within budget
**DNN:** \\(T_{ml} = 10ms + 30ms + 5ms = 45ms\\) ✗ Exceeds budget (requires GPU)
**FM:** \\(T_{ml} = 10ms + 4ms + 1ms = 15ms\\) ✓ Best performance

**Accuracy Comparison (typical CTR prediction AUC):**

- GBDT: **0.78-0.82 AUC**
- DNN: **0.80-0.84 AUC** (+2-3% over GBDT)
- FM: **0.75-0.78 AUC** (-3-5% vs GBDT)

**Decision Matrix:**

$$\text{Value} = \alpha \times \text{Accuracy} - \beta \times \text{Latency} - \gamma \times \text{OpsCost}$$

With \\(\alpha = 100\\) (revenue impact), \\(\beta = 50\\) (user experience), \\(\gamma = 10\\) (infrastructure):

- **GBDT:** \\(100 \times 0.80 - 50 \times 0.020 - 10 \times 5 = 80 - 1 - 50 = 29\\)
- **DNN:** \\(100 \times 0.82 - 50 \times 0.045 - 10 \times 20 = 82 - 2.25 - 200 = -120.25\\) (GPU cost makes this unviable)
- **FM:** \\(100 \times 0.76 - 50 \times 0.015 - 10 \times 3 = 76 - 0.75 - 30 = 45.25\\)

**Winner: Factorization Machines** for low latency + good accuracy.

**However, GBDT chosen for production** due to:
1. **Ecosystem maturity:** Better tooling (LightGBM, XGBoost)
2. **Feature importance:** Critical for debugging model behavior
3. **Incremental learning:** Easier to update with new data
4. **Slight accuracy loss from FM acceptable:** 2-3% AUC difference

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

**GBDT Training Algorithm:**

```
Algorithm: GradientBoostedTreeTraining
Input: Training data X_train, labels y_train, hyperparameters
Output: Trained GBDT model

Parameters:
  num_trees ← 100
  max_depth ← 7
  learning_rate ← 0.05
  num_leaves ← 31
  feature_sampling_fraction ← 0.8
  data_sampling_fraction ← 0.8

Initialize: F₀(x) = argmin_γ Σᵢ L(yᵢ, γ)

For t = 1 to num_trees:
  // Compute negative gradients (pseudo-residuals)
  rᵢ ← -∂L(yᵢ, F(xᵢ))/∂F(xᵢ) for i = 1..n

  // Sample features and data
  sampled_features ← random_sample(features, feature_sampling_fraction)
  sampled_data ← random_sample(data, data_sampling_fraction)

  // Fit decision tree to residuals
  hₜ ← DecisionTree(sampled_data, rᵢ, max_depth, num_leaves)

  // Update model
  F_t(x) ← F_{t-1}(x) + learning_rate × hₜ(x)

Return: F(x) = Σₜ learning_rate × hₜ(x)

// Inference: ~8ms for 100 trees
Predict(x):
  Return F(x) = F₀ + Σₜ₌₁¹⁰⁰ 0.05 × hₜ(x)
```

**Option 2: Deep Neural Network (DNN)**

**Advantages:**
- Learns feature interactions automatically
- Scales with data (more data → better performance)
- Supports embedding layers for high-cardinality categoricals

**Disadvantages:**
- Slower inference: 20-40ms depending on model size
- Requires more training data (millions of samples)
- Less interpretable

**Architecture:**

```
Input Layer (150 features)
    ↓
Embedding Layers (categorical features → dense vectors)
    ↓
Dense Layer 1 (256 units, ReLU)
    ↓
Dropout (0.3)
    ↓
Dense Layer 2 (128 units, ReLU)
    ↓
Dropout (0.3)
    ↓
Dense Layer 3 (64 units, ReLU)
    ↓
Output Layer (1 unit, Sigmoid)
    ↓
CTR Prediction (0.0 - 1.0)
```

**Neural Network Forward Pass Algorithm:**

```
Algorithm: DNNForwardPass
Input: Feature vector x ∈ ℝ¹⁵⁰
Output: CTR prediction ∈ [0,1]

// Embedding layer for categorical features
For each categorical_feature in x:
  embedding_vector ← EmbeddingLookup(categorical_feature, embedding_dim=16)

// Concatenate embedded features with numerical features
h₀ ← Concatenate(embedding_vectors, numerical_features)

// Layer 1: Dense(256) + ReLU
z₁ ← W₁ × h₀ + b₁ where W₁ ∈ ℝ²⁵⁶ˣᵈ
h₁ ← ReLU(z₁) = max(0, z₁)

// Dropout (training only, p=0.3)
h₁ ← Dropout(h₁, keep_prob=0.7)

// Layer 2: Dense(128) + ReLU
z₂ ← W₂ × h₁ + b₂ where W₂ ∈ ℝ¹²⁸ˣ²⁵⁶
h₂ ← ReLU(z₂)

// Dropout (training only, p=0.3)
h₂ ← Dropout(h₂, keep_prob=0.7)

// Layer 3: Dense(64) + ReLU
z₃ ← W₃ × h₂ + b₃ where W₃ ∈ ℝ⁶⁴ˣ¹²⁸
h₃ ← ReLU(z₃)

// Output layer: Dense(1) + Sigmoid
z₄ ← W₄ × h₃ + b₄ where W₄ ∈ ℝ¹ˣ⁶⁴
ŷ ← Sigmoid(z₄) = 1/(1 + e⁻ᶻ⁴)

Return: ŷ  // Predicted CTR ∈ [0,1]

// Training: Minimize binary cross-entropy loss
Loss(y, ŷ) = -[y log(ŷ) + (1-y) log(1-ŷ)]
Optimizer: Adam with learning_rate=0.001
```

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

**I'm going with Kubernetes** (shocker, I know)

Look, Kubernetes is the obvious choice here, but let me explain why I didn't just cargo-cult this decision (even though... yeah, it's still Kubernetes):

- **Ecosystem:** It's become the de facto standard - 78% adoption means you can actually hire people who know it. Try hiring for Docker Swarm or Nomad and you'll see what I mean.
- **Auto-scaling:** HPA based on custom metrics (like inference queue depth) is exactly what I need
- **GPU support:** Native GPU scheduling with node affinity - this is critical for ML workloads. Other orchestrators' GPU support is... let's just say it's not their strong suit.
- **Service mesh:** Istio/Linkerd integration gives me circuit breaking and traffic splitting for free (well, "free" if you don't count the time you'll spend debugging mesh configuration issues)
- **Portability:** I can deploy to AWS, GCP, Azure, or even on-prem without rewriting everything

Unpopular opinion: Kubernetes is overly complex for 80% of use cases, but if you need GPU orchestration and multi-cloud portability, you're kind of stuck with it.

**Kubernetes-specific features critical for ads platform:**

1. **Horizontal Pod Autoscaler (HPA) with Custom Metrics:**

   **Why CPU/memory metrics fail (typically):**

   - **Lag indicator**: CPU spikes *after* request queue builds up. By the time CPU hits 80%, you're already dropping requests or breaching latency SLAs
   - **Doesn't reflect actual bottlenecks**:
     - ML inference is GPU-bound, not CPU-bound (CPU at 20% while GPU saturated at 100%)
     - I/O-bound workloads (cache calls, DB queries) show low CPU while latency degrades
   - **JVM warmup problem**: Fresh pods show high CPU during JIT compilation warmup, triggering premature scale-down
   - **Batching effects**: Batch processing can show 100% CPU while actually being I/O-blocked waiting for data
   - **No predictive signal**: CPU can't tell you traffic is growing 10K QPS/sec - you only react when it's already a problem

   **Example failure scenario:**
   - Traffic grows from 100K → 150K QPS over 60 seconds (growth rate: 833 QPS/sec)
   - CPU-based HPA: Notices CPU at 85% after 40 seconds → triggers scale (90s to provision) → requests drop for 50 seconds
   - Queue-based HPA: Detects queue depth increasing → scales immediately → new pods ready before overload

   Use custom metrics that reflect real workload:

   **Formula:** \\(\text{desired\_replicas} = \lceil \text{current\_replicas} \times \frac{\text{current\_metric}}{\text{target\_metric}} \rceil\\)

   **Custom metrics for ads platform:**
   - **Inference queue depth**: Scale ML pods when queue > 100 requests
     - Current queue: 250 requests, Target: 100, Current pods: 10 → \\(\lceil 10 \times \frac{250}{100} \rceil = 25\\) pods
   - **Request latency p99**: Scale when p99 > 80ms (you have 100ms budget)
     - Current p99: 95ms, Target: 80ms, Current pods: 20 → \\(\lceil 20 \times \frac{95}{80} \rceil = 24\\) pods
   - **Cache hit rate**: Scale cache tier when hit rate < 85%

   **Incorporating Node Start Time into Scaling Decisions:**

   The critical metric is **traffic growth rate with provisioning buffer**:
   $$N_{buffer} = \frac{dQ}{dt} \times (T_{provision} + T_{warmup})$$

   where:
   - \\(\frac{dQ}{dt}\\) = traffic growth rate (QPS/second)
   - \\(T_{provision}\\) = time to start new node (30-60s for cloud VMs, 90-120s for GPU instances)
   - \\(T_{warmup}\\) = application warmup time (JVM warmup, model loading: 20-40s)

   **Example:** Traffic growing at 10K QPS/sec:
   - Node provision time: 60s
   - App warmup (load ML model into GPU memory): 30s
   - Total: 90s end-to-end
   - Buffer needed: \\(\frac{10000 \times 90}{1000} = 900\\) pods

   **Why node start time matters:**
   - Start scaling when: \\(\text{current\_load} + \frac{dQ}{dt} \times T_{total} > \text{capacity}\\)
   - **Without accounting for start time**: Scale at 80% capacity → overload for 90 seconds during provision
   - **With start time incorporated**: Scale at \\(80\% - \frac{dQ/dt \times T_{total}}{\text{capacity}}\\) → zero downtime

   **Trade-off:** Longer start times (GPU nodes, large models) require earlier/more aggressive scaling = higher idle capacity cost.

2. **GPU Node Affinity:**
   - Schedule ML inference pods only on GPU nodes using node selectors
   - Prevents GPU resource waste by isolating GPU workloads

3. **StatefulSets for Stateful Services:**
   - Deploy Cassandra, Redis clusters with stable network identities
   - Ordered pod creation/deletion (e.g., Cassandra seed nodes first)

4. **Istio Service Mesh:**
   - **Traffic splitting:** A/B test new model versions (90% traffic to v1, 10% to v2)
   - **Circuit breaking:** Automatic failure detection, failover to backup services
   - **Observability:** Automatic trace injection, latency histograms per service

**Why not AWS ECS?**

ECS is tempting because it's managed and cheaper:
- Vendor lock-in is real - I can't migrate to GCP/Azure without rewriting task definitions
- Auto-scaling is limited to CPU/memory target tracking - no custom metrics
- GPU support is janky compared to Kubernetes (manual AMI management, no node affinity)
- It works great for simple microservices, but for complex ML infrastructure? Not so much.

**Why not Docker Swarm?**

Honestly, I wish Swarm had succeeded. It's so much simpler than Kubernetes. But:
- The ecosystem is basically dead - 5% market share and stagnant development
- No GPU scheduling, basic auto-scaling, no service mesh
- Operational risk is high - finding engineers who know Swarm is nearly impossible
- Docker Inc. has basically abandoned it in favor of Kubernetes

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
| **Serverless (Lambda)** | 5-10s | Instant | Low (pay-per-use) | Low (cold starts) |

**Decision: Dedicated GPU instances** with **Kubernetes orchestration**

**Cost-benefit calculation:**

**Option A: Dedicated T4 GPUs (always-on)**
- 10 instances × $0.35/hour × 720 hours/month = **$2,520/month**
- Latency: 30ms (no cold start)
- Availability: 99.9%

**Option B: Kubernetes with auto-scaling (3 min, 10 max instances)**
- Average load: 5 instances × $0.35/hour × 720 hours = **$1,260/month**
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

CPU inference: 100 requests/sec per core, $0.04/hour per core
GPU inference: 1,280 requests/sec, $0.35/hour

**Cost per 1M predictions:**
- CPU: \\(\frac{1,000,000}{100 \times 3600} \times 0.04 = \$0.11\\)
- GPU: \\(\frac{1,000,000}{1,280 \times 3600} \times 0.35 = \$0.076\\)

GPU is **31% cheaper** at scale, plus meets latency requirements.

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
- **Need atomic operations** for budget counters (DECRBY, INCRBY)
- **Complex data structures** for ad metadata (sorted sets for recency, hashes for attributes)
- **Persistence** for crash recovery (avoid cold cache startup)
- **Trade-off accepted:** 30% higher memory usage vs. Memcached for operational simplicity

**Performance Analysis:**

Memcached typically costs **~30% less** than Redis for equivalent capacity, but Redis offers atomic operations and richer data structures that justify the premium for this use case.

**L3 Persistent Store Options:**

| Technology | Read Latency (p99) | Write Throughput | Scalability | Consistency | Pros | Cons |
|------------|-------------------|------------------|-------------|-------------|------|------|
| **Cassandra** | 20ms | 500K writes/sec | Linear (peer-to-peer) | Tunable (CL=QUORUM) | Multi-DC, no SPOF | No JOINs, eventual consistency |
| PostgreSQL | 15ms | 50K writes/sec | Vertical + sharding | ACID transactions | SQL, JOINs, strong consistency | Manual sharding complex |
| MongoDB | 18ms | 200K writes/sec | Horizontal sharding | Tunable | Flexible schema | Less mature than Cassandra |
| DynamoDB | 10ms | 1M writes/sec | Fully managed | Eventual/strong | Auto-scaling, no ops | Vendor lock-in, cost at scale |

**Decision: Cassandra**
- **Scale requirement:** 400M users → 4TB+ user profiles
- **Write-heavy:** User profile updates, ad impression logs
- **Multi-region:** Built-in multi-datacenter replication (RF=3)
- **Linear scalability:** Add nodes without rebalancing entire cluster

**PostgreSQL limitation:** Vertical scaling hits ceiling around 50-100TB. Sharding (e.g., Citus) adds operational complexity comparable to Cassandra, but without peer-to-peer resilience.

**DynamoDB consideration:** At 8B requests/day @ **$300K/month** (\\(\frac{8 \times 10^{9}}{1000} \times 1.25 \times 10^{-6} = \\$10,000/day\\))

Cassandra on 100 nodes @ $500/node/month: **$50K/month** (6x cheaper at this scale).

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
        L3[Cassandra Ring<br/>Multi-DC Replication<br/>~20ms read<br/>Petabyte scale]
        L3_STATS[L3 Statistics<br/>Hit Rate: 5%<br/>Avg Latency: 20ms]
    end

    subgraph "Hot Key Detection"
        MONITOR[Stream Processor<br/>Flink/Spark<br/>Count-Min Sketch]
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

Count-Min Sketch is a probabilistic data structure that tracks key frequencies in constant memory - roughly **5KB to track millions of keys**. It provides approximate frequency counts with guaranteed over-estimation (never under-counts), making it perfect for detecting hot keys without storing exact counters for every key.

**Key benefits for hot partition detection:**
- **Memory efficient**: Track frequencies across 1M+ QPS stream in ~5KB of memory
- **Constant time operations**: O(1) updates and queries regardless of key cardinality
- **Tunable accuracy**: Configure error bounds vs memory trade-offs based on workload
- **Conservative estimates**: Never under-counts, so won't miss hot keys (may over-estimate)
- **Stream-friendly**: Works on infinite streams without bounded memory growth

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

Imagine you're running hourly batch jobs to update user profiles in Cassandra - millions of writes per hour. Meanwhile, your serving layer is trying to read those same profiles for ad personalization. Without isolation, your batch writes can:
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

**Implementation in Cassandra:**

Use data center aware replication:

```
CREATE KEYSPACE user_profiles
WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'us_east': 2,      // Serving replicas
  'eu_central': 1    // Batch replica
}
AND durable_writes = true;
```

Batch jobs write with consistency level:
```
CONSISTENCY LOCAL_ONE  // Write to eu_central only
```

Serving traffic reads from:
```
CONSISTENCY LOCAL_QUORUM  // Read from us_east replicas
```

**Why this works:**

The batch replica (EU-Central) can be crushed by write load without affecting serving latency in US regions. Replication happens asynchronously - the batch writes will eventually propagate to serving replicas, but on their own schedule.

**Cost of isolation:**

You're essentially dedicating 33% of your storage (1 out of 3 replicas) to absorbing batch load. For a 100-node cluster:
- 67 nodes serve traffic
- 33 nodes handle batch + replication

Is it worth it? Absolutely. The alternative is unpredictable latency spikes that violate your SLA.

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

$$\text{eCPM}_i = b_i \times \text{CTR}_i \times 1000$$

This represents expected revenue per 1000 impressions.

**Winner Selection:**

$$w = \arg\max_{i \in [1,N]} \text{eCPM}_i$$

**Price Determination (Second-Price):**

The winner pays the minimum bid needed to beat the second-highest bidder:

$$p_w = \frac{\text{eCPM}_{2nd}}{\text{CTR}_w \times 1000} + \epsilon$$

where \\(\epsilon\\) is a small increment (e.g., $0.01).

**Example:**

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

GSP creates **strategic bidding behavior** because advertisers can increase profit by bidding below true value while still winning. ∎

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

**Reserve Price:** Minimum bid to participate in auction.

**Economic Rationale:**

Without reserve price, advertisers with very low bids might win when competition is weak, resulting in low revenue.

**Optimal Reserve Price (Myerson 1981):**

For advertiser with value distribution \\(F(v)\\) and density \\(f(v)\\):

$$r^* = \arg\max_r \left[ r \times \left(1 - F(r)\right) \right]$$

**Interpretation:** Balance between:
- High reserve → more revenue per ad, but fewer impressions sold
- Low reserve → more impressions sold, but lower revenue per ad

**Example (Uniform Distribution):**

\\(F(v) = \frac{v}{v_{max}}\\) for \\(v \in [0, v_{max}]\\)

$$r^* = \arg\max_r \left[ r \times \left(1 - \frac{r}{v_{max}}\right) \right] = \arg\max_r \left[ r - \frac{r^2}{v_{max}} \right]$$

Take derivative and set to zero:
$$\frac{d}{dr}\left(r - \frac{r^2}{v_{max}}\right) = 1 - \frac{2r}{v_{max}} = 0$$

$$r^* = \frac{v_{max}}{2}$$

**Result:** Optimal reserve price is **half the maximum value** under uniform distribution.

**Reserve Price Computation Algorithm:**

```
Algorithm: ComputeOptimalReservePrice
Input: Historical bids array B = [b₁, b₂, ..., bₙ]
Output: Optimal reserve price r*

// Assume exponential distribution: F(v) = 1 - e^(-λv)
// For exponential distribution, optimal reserve: r* = 1/λ

Procedure: EstimateDistributionParameter(B)
  // Maximum likelihood estimation for exponential distribution
  mean_bid ← (Σᵢ bᵢ) / n
  λ ← 1 / mean_bid  // Rate parameter
  Return λ

λ_estimated ← EstimateDistributionParameter(B)
r_optimal ← 1 / λ_estimated

Return r_optimal

// Alternative: Empirical quantile method
// If distribution unknown, use quantile-based approach:
Procedure: QuantileBasedReserve(B, percentile)
  sorted_bids ← Sort(B)
  index ← floor(n × percentile)
  r_empirical ← sorted_bids[index]
  Return r_empirical

// Example: 50th percentile (median) as reserve price
// Balances between revenue and fill rate
```

---

## Part 7: Advanced Topics

### Budget Pacing: Distributed Spend Control

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
    BUDGET --> POSTGRES[(PostgreSQL<br/>Audit Log)]

    BUDGET -->|Allocate $50| AS1[Ad Server 1]
    BUDGET -->|Allocate $75| AS2[Ad Server 2]
    BUDGET -->|Allocate $100| AS3[Ad Server 3]

    AS1 -->|Spent: $42<br/>Return: $8| BUDGET
    AS2 -->|Spent: $68<br/>Return: $7| BUDGET
    AS3 -->|Spent: $95<br/>Return: $5| BUDGET

    BUDGET -->|Hourly reconciliation| POSTGRES

    TIMEOUT[Timeout Monitor<br/>5min intervals] -.->|Release stale<br/>allocations| REDIS

    REDIS -->|Budget < 10%| THROTTLE[Dynamic Throttle]
    THROTTLE -.->|Reduce allocation<br/>size $100→$10| BUDGET

    classDef server fill:#e3f2fd,stroke:#1976d2
    classDef budget fill:#fff3e0,stroke:#f57c00
    classDef advertiser fill:#e8f5e9,stroke:#4caf50

    class AS1,AS2,AS3 server
    class BUDGET,REDIS,POSTGRES,TIMEOUT,THROTTLE budget
    class ADV advertiser
{% end %}

**Budget Allocation Algorithm:**

The core algorithm has three operations:

**1. Request Allocation:**
- Ad server requests budget chunk (e.g., $100) from centralized Budget Controller
- Controller atomically decrements remaining budget using Redis `DECRBY` (prevents race conditions)
- If budget is low (<10% remaining), reduce allocation size to prevent over-delivery
- Log allocation to PostgreSQL for audit trail
- Return allocated amount (or 0 if budget exhausted)

**2. Report Spend:**
- Ad server reports actual spend after serving ads
- If `actual < allocated`, return unused portion via Redis `INCRBY`
- Log actual spend to PostgreSQL for billing reconciliation
- Example: Allocated $100, spent $87 → return $13 to budget pool

**3. Timeout Monitor (Background):**
- Every 5 minutes, scan for allocations older than 10 minutes with no spend report
- These likely represent crashed servers holding budget hostage
- Automatically return their allocations to the budget pool via `INCRBY`
- Prevents budget being permanently locked by failed servers

**Key design decisions:**
- **Redis for speed**: Atomic counters provide strong consistency with <1ms latency
- **PostgreSQL for durability**: Audit log enables billing reconciliation and debugging
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

**Scenario:** Primary region (US-East) fails, handling 60% of traffic. What happens?

{% mermaid() %}
graph TB
    subgraph "Global Layer"
        GLB[Global Load Balancer<br/>Health Check: 10s interval]
    end

    subgraph "US-East (PRIMARY - FAILED)"
        USE[API Gateway ❌<br/>Ad Servers ❌<br/>Redis ❌]
        style USE fill:#ffcccc,stroke:#cc0000,stroke-width:3px
    end

    subgraph "US-West (SECONDARY - 3x TRAFFIC)"
        USW_GW[API Gateway ⚠️<br/>3x traffic spike]
        USW_AS[Ad Servers<br/>30 → 100 scaling<br/>90 seconds to provision]
        USW_STANDBY[Standby Capacity<br/>+20% pre-warmed<br/>✅ ACTIVATED]
        USW_REDIS[(Redis<br/>Cache hit: 60% → 45%<br/>Different user distribution)]

        style USW_GW fill:#ffffcc,stroke:#cccc00,stroke-width:2px
        style USW_AS fill:#ffffcc,stroke:#cccc00,stroke-width:2px
        style USW_STANDBY fill:#ccffcc,stroke:#00cc00,stroke-width:2px
    end

    subgraph "EU (NORMAL)"
        EU[API Gateway ✅<br/>Ad Servers ✅<br/>Redis ✅]
        style EU fill:#ccffcc,stroke:#00cc00,stroke-width:2px
    end

    subgraph "Global Database"
        CASS[(Cassandra<br/>Multi-DC Replication<br/>RF=3, CL=QUORUM)]
    end

    GLB -->|60% traffic<br/>REROUTED| USW_GW
    GLB -->|30% traffic<br/>EU users| EU
    GLB -.->|Health check FAILED| USE

    USW_GW --> USW_AS
    USW_GW --> USW_STANDBY
    USW_AS --> USW_REDIS
    EU --> CASS
    USW_AS --> CASS

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
| **Budget** | Consistency | Over-delivery <1% | >5% = refunds + complaints |

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

**Service-to-Service Auth (mTLS):**
```yaml
# Istio PeerAuthentication
mtls:
  mode: STRICT  # Reject non-mTLS

# Authorization: Ad Server can't call Budget DB directly
principals: ["cluster.local/ns/prod/sa/ad-server"]
paths: ["/predict"]  # ML inference only
```

**PII Protection:**
- **Encryption at rest:** KMS-encrypted Cassandra columns
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
- Cassandra: DELETE user_profiles
- Redis: FLUSH user keys
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

**Business Model Pivot to Guaranteed Inventory:** Transitioning from auction-based to guaranteed delivery requires strong consistency for impression quotas. Rather than replacing our eventual-consistent stack, we extend the existing pre-allocation pattern—PostgreSQL maintains source-of-truth counters while Redis provides fast-path allocation with periodic reconciliation. This hybrid approach adds only 10ms to the critical path for guaranteed campaigns while preserving sub-millisecond performance for auction traffic. The 12-month evolution path reuses 80% of existing infrastructure (ML pipeline, feature store, Kafka) while adding campaign management and SLA tracking layers.

These scenarios validate that the architecture is not merely elegant on paper, but battle-hardened for production realities: regional disasters, adversarial threats, and fundamental business transformations.

---

