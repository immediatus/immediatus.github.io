+++
authors = [ "Yuriy Polyulya" ]
title = "Dual-Source Revenue Engine: OpenRTB & ML Inference Pipeline"
description = "Implementing the dual-source architecture that generates 30-48% more revenue by parallelizing internal ML-scored inventory (65ms) with external RTB auctions (100ms). Deep dive into OpenRTB protocol implementation, GBDT-based CTR prediction, feature engineering, and timeout handling strategies at 1M+ QPS."
date = 2025-10-20
slug = "ads-platform-part-2-rtb-ml-pipeline"
draft = false

[taxonomies]
tags = ["distributed-systems", "real-time-bidding", "ml-inference", "ads-tech"]
series = ["architecting-ads-platforms"]

[extra]
toc = false
series_order = 2
series_title = "Architecting Real-Time Ads Platform"

+++

## Introduction: The Revenue Engine

Ad platforms face a fundamental challenge: **maximize revenue while meeting strict latency constraints**. The naive approach - relying solely on external real-time bidding (RTB) or only internal inventory - leaves significant revenue on the table:

- **RTB-only**: High revenue when demand is strong, but only 35% fill rate. 65% of impressions become blank ads, destroying user experience.
- **Internal-only**: 100% fill rate but fixed pricing. Misses market value when external DSPs would bid higher.

The solution is a **dual-source architecture** that parallelizes two independent revenue streams:

1. **Internal ML Path (65ms)**: Score direct-deal inventory using CTR prediction models
2. **External RTB Path (100ms)**: Broadcast to 50+ DSPs for programmatic bids

Both complete within the 150ms latency budget, then compete in a unified auction. This architecture generates **30-48% more revenue** than single-source approaches (baseline revenue vs 52-70% lower revenue) by:
- **Ensuring 100% fill rate** - Internal inventory fills gaps when RTB bids are low or timeout
- **Capturing market value** - External DSPs bid competitively when demand is high
- **Maintaining premium relationships** - Guaranteed delivery for direct deals with advertisers

**What this post covers:**

This post implements the revenue engine with concrete technical details:

- **Real-Time Bidding (RTB) Integration** - OpenRTB 2.5 protocol implementation, coordinating 50+ DSPs with 100ms timeouts, geographic sharding to handle physics constraints (NY-Asia: 200-300ms RTT), and adaptive timeout strategies
- **ML Inference Pipeline** - GBDT-based CTR prediction in 40ms, Tecton feature store with 3-tier freshness (batch/stream/real-time), eCPM calculation for ranking internal inventory
- **Parallel Execution Architecture** - How internal ML and external RTB paths execute independently and synchronize for unified auction, ensuring both contribute to revenue maximization

**The engineering challenge:**

Execute 50+ parallel network calls (RTB) AND run ML inference within 100ms total budget. Handle inevitable timeouts gracefully (DSPs fail, network delays, geographic distance). Ensure both paths contribute fair bids to the unified auction. Do all of this at 1M+ queries per second with consistent P99 latency.

**Broader applicability:**

The patterns explored here - parallel execution with synchronization points, adaptive timeout handling, cost-efficient ML serving, unified decision logic - apply beyond ad tech to any revenue-optimization system with real-time requirements. This demonstrates extracting maximum value from independent data sources under strict latency constraints.

Let's dive into how this works in practice.

## Real-Time Bidding (RTB) Integration


### Ad Inventory Model and Monetization Strategy

Before diving into OpenRTB protocol mechanics, understanding the **business model** is essential. Modern ad platforms monetize through two complementary inventory sources that serve different strategic purposes.

> **Architectural Driver: Revenue Maximization** - Dual-source inventory (internal + external) maximizes fill rate, ensures guaranteed delivery, and captures market value through real-time competition. This model generates 30-48% more revenue than single-source approaches.

#### What is Internal Inventory?

**Internal Inventory** refers to ads from **direct business relationships** between the publisher and advertisers, stored in the publisher's own database with pre-negotiated pricing. This contrasts with external RTB, where advertisers bid in real-time through programmatic marketplaces.

**Four types of internal inventory:**

1. **Direct Deals**: Sales team negotiates directly with advertiser
   - Example: Nike pays negotiated CPM for 1M impressions on sports pages over 3 months
   - Revenue: Predictable, guaranteed income
   - Use case: Premium brand relationships, custom targeting

2. **Guaranteed Campaigns**: Contractual commitment to deliver specific impressions
   - Example: "Deliver 500K impressions to males 18-34 at premium CPM"
   - Publisher must deliver or face penalties; gets priority in auction
   - Use case: Campaign-based advertising with volume commitments

3. **Programmatic Guaranteed**: Automated direct deals with fixed price/volume
   - Same economics as direct deals but transacted via API
   - Use case: Automated campaign management at scale

4. **House Ads**: Publisher's own promotional content (**NOT paid advertising inventory**)
   - **What they are**: Publisher's internal promotions like "Subscribe to newsletter", "Download our app", "Follow us on social media", "Upgrade to premium"
   - **Revenue**: **No advertising revenue** - generates zero revenue because no external advertiser is paying
   - **Value**: Still beneficial for publisher (drives newsletter signups, app downloads, user engagement, brand building)
   - **Use case**: Last-resort fallback when:
     - RTB auction timed out (no external bids arrived), AND
     - All paid internal inventory is exhausted or budget-depleted
     - **Better to show promotional content than blank ad space** (blank ads damage user trust and long-term CTR)
   - **Important distinction**: House Ads are fundamentally different from paid internal inventory (direct deals, guaranteed campaigns) which generate actual advertising revenue

**Storage:** Internal ad database (CockroachDB) storing:
- Ad metadata: `ad_id`, `advertiser`, `creative_url`
- Pricing: `base_cpm` (negotiated rate)
- Targeting: `targeting_rules` (audience criteria)
- Campaign lifecycle: `campaign_type`, `start_date`, `end_date`

All internal inventory has **base CPM pricing determined through negotiation**, not real-time bidding.

#### Why ML Scoring on Internal Inventory?

**The revenue optimization problem:** Base pricing doesn't reflect user-specific value. Two users seeing the same ad have vastly different engagement probabilities.

**Example scenario:**

**Ads:**
- Ad A: Nike running shoes, base \\(CPM = B_{low}\\)
- Ad B: Adidas shoes, base \\(CPM = B_{high}\\) (for example: \\(B_{high} = 1.33 \times B_{low}\\))

**Users:**
- User 1: Marathon runner, frequently clicks running gear
- User 2: Casual walker, rarely clicks athletic ads

**Without ML (naive ranking by base price):**
- Always show Ad B (higher base CPM)
- Actual CTR: User 1 clicks 5%, User 2 clicks 0.5%
- Average eCPM: No personalization benefit
- Revenue loss: Showing wrong ad to wrong user

**With ML personalization:**
- **User 1**: ML predicts 5% CTR for Nike, 3% CTR for Adidas
  - Nike eCPM: \\(0.05 × B_{low} × 1000 = 50 × B_{low}\\)
  - Adidas eCPM: \\(0.03 × B_{high} × 1000 = 40 × B_{low}\\) (adjusted for \\(B_{high} = 1.33 × B_{low}\\))
  - **Show Nike** (25% higher eCPM despite lower base price)

- **User 2**: ML predicts 1% CTR for Nike, 0.5% CTR for Adidas
  - Nike eCPM: \\(0.01 × B_{low} × 1000\\)  
  - Adidas eCPM: \\(0.005 × B_{high} × 1000\\)
  - **Show Nike** (50% higher eCPM with better targeting)

**Revenue formula:**
$$eCPM_{internal} = \text{predicted\\_CTR} \times \text{base\\_CPM} \times 1000$$

**Impact:** ML personalization increases internal inventory revenue by **15-40%** over naive base-price ranking by matching ads to users most likely to engage.

**ML model inputs:**
- User features: age, gender, interests, 1-hour click rate, 7-day CTR
- Ad features: category, brand, creative type, historical performance
- Context: time of day, device type, page content

**Implementation:** GBDT model (40ms latency) predicts CTR for 100 candidate ads, converts to eCPM, outputs ranked list.

#### Why Both Internal AND External Sources?

Modern ad platforms require both inventory sources for economic viability.

**Internal-only limitations:**
- Limited demand (only direct negotiated advertisers)
- Unsold inventory creates revenue waste (e.g., 40% fill rate = 60% blank ads)
- Large sales team overhead for deal negotiation
- No market price discovery
- Inflexible response to demand changes

**External-only limitations:**
- No guaranteed revenue (bids fluctuate unpredictably)
- Can't offer guaranteed placements to premium advertisers
- DSP fees reduce margins (10-20% intermediary costs)
- Commoditized pricing from publisher competition
- Limited control over advertiser quality

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
| Guaranteed campaigns | 25% | Contractual, high priority | Baseline × 40% (2× avg eCPM) |
| Direct deals | 10% | Negotiated, premium pricing | Baseline × 12% (1.5× avg eCPM) |
| External RTB | 60% | Fills unsold inventory | Baseline × 48% (baseline eCPM) |
| House ads | 5% | **Publisher's own promos** - fallback when paid inventory exhausted | **No ad revenue** (not paid advertising) |
| **TOTAL** | **100%** | **All slots filled** | **Baseline revenue** |

**Why dual-source matters: The single-source tradeoff**

Each approach alone has critical weaknesses:

**Internal-only (guaranteed + direct deals):** High-value inventory but limited scale
- 35M impressions filled with premium campaigns (2× avg eCPM)
- 65M impressions remain blank (no inventory available)
- **Revenue loss:** 48% - you monetize fewer impressions despite high eCPM

**RTB-only (external marketplace):** High fill rate but misses premium pricing
- 100M impressions filled through programmatic auctions
- No access to guaranteed campaigns or negotiated direct deals
- **Revenue loss:** 30% - lower average eCPM despite filling all slots

**Dual-source unified auction:** Combines premium pricing with full coverage
- Internal campaigns compete on eCPM alongside RTB bids
- Premium inventory fills high-value slots, RTB fills the rest
- **Result:** 100% fill rate + optimal eCPM mix = baseline revenue maximized

The key insight: internal and external inventory compete in the same auction. Highest eCPM wins regardless of source, ensuring premium relationships stay profitable while RTB fills gaps.

#### External RTB: Industry-Standard Programmatic Marketplace

**Protocol:** OpenRTB 2.5 - industry standard for real-time bidding

**How RTB works:**
1. Ad server broadcasts bid request to 50+ DSPs with user context
2. DSPs run their own ML internally and respond with bids within 100ms
3. Ad server collects responses: `[(DSP_A, eCPM_high), (DSP_B, eCPM_mid), ...]`
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

**Note on Header Bidding vs Server-Side RTB:** This architecture focuses on **server-side RTB** where the ad server orchestrates auctions on the backend.

**Header bidding** (client-side auctions) now dominates programmatic advertising, accounting for ~70% of revenue for many publishers. It trades higher latency (adds 100-200ms client-side) for better auction competition by having browsers run parallel auctions before page load.

**Strategic choice:**
- **Header bidding:** Maximizes revenue per impression through broader DSP participation
- **Server-side RTB:** Optimizes user experience through tighter latency control
- **Hybrid approach:** Header bidding for web, server-side for mobile apps (where latency matters more)

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
        DSP1-->>AdServer: BidResponse<br/>Price: eCPM bid
        deactivate DSP1
    and
        AdServer->>DSP2: Broadcast to 50 DSPs<br/>Parallel connections
        activate DSP2
        DSP2-->>AdServer: Multiple BidResponses<br/>[eCPM_1, eCPM_2, ...]
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

The ad server sends a JSON request to DSPs (OpenRTB 2.5+):

```json
{
  "id": "req_a3f8b291",
  "imp": [
    {
      "id": "1",
      "banner": {
        "w": 320,
        "h": 50,
        "pos": 1,
        "format": [
          {"w": 320, "h": 50},
          {"w": 300, "h": 250}
        ]
      },
      "bidfloor": 0.50,
      "bidfloorcur": "USD",
      "tagid": "mobile-banner-top"
    }
  ],
  "app": {
    "id": "app123",
    "bundle": "com.example.myapp",
    "name": "MyApp",
    "publisher": {
      "id": "pub-456"
    }
  },
  "device": {
    "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_1...)",
    "ip": "192.0.2.1",
    "devicetype": 1,
    "make": "Apple",
    "model": "iPhone15,2",
    "os": "iOS",
    "osv": "17.0.1"
  },
  "user": {
    "id": "sha256_hashed_device_id",
    "geo": {
      "country": "USA",
      "region": "CA",
      "city": "San Francisco",
      "lat": 37.7749,
      "lon": -122.4194
    }
  },
  "at": 2,
  "tmax": 100,
  "cur": ["USD"]
}
```

**Key fields** (per OpenRTB 2.5 spec):
- `id`: Required unique request identifier
- `imp`: Required array of impression objects (at least one)
- `imp[].banner.format`: Multiple acceptable sizes for responsive ads
- `app` or `site`: Context object (mobile app vs website)
- `user.id`: Publisher-provided hashed identifier for frequency capping
- `device`: User agent, IP, OS for targeting and creative compatibility
- `at`: Auction type (1=first price, 2=second price)
- `tmax`: Maximum time DSP has to respond (milliseconds)

**OpenRTB BidResponse Structure:**

DSPs respond with their bid (OpenRTB 2.5+):

```json
{
  "id": "req_a3f8b291",
  "bidid": "bid-response-001",
  "seatbid": [
    {
      "seat": "dsp-seat-123",
      "bid": [
        {
          "id": "1",
          "impid": "1",
          "price": 2.50,
          "adid": "ad-789",
          "cid": "campaign-456",
          "crid": "creative-321",
          "adm": "<div><a href='https://example.com'><img src='https://cdn.example.com/ad.jpg'/></a></div>",
          "adomain": ["example.com"],
          "iurl": "https://dsp.example.com/creative-preview.jpg",
          "w": 320,
          "h": 50
        }
      ]
    }
  ],
  "cur": "USD"
}
```

**Key fields** (per OpenRTB 2.5 spec):
- `id`: Required - matches request ID for correlation
- `bidid`: Optional response tracking ID for win notifications
- `seatbid`: Array of seat bids (at least one required if bidding)
- `seatbid[].bid[]`: Individual bid objects
- `price`: Required bid price (CPM for banner, e.g., 2.50 = $2.50 per 1000 impressions)
- `impid`: Required - links to impression ID from request
- `adm`: Ad markup (HTML/VAST/VPAID creative to render)
- `crid`: Creative ID for audit and reporting
- `cid`: Campaign ID for tracking
- `adomain`: Advertiser domains for transparency/blocking
- `iurl`: Image URL for creative preview/validation

### RTB Timeout Handling and Partial Auctions

With 50 DSPs and 100ms timeout, some responses inevitably arrive late. Three strategies handle partial auctions:

**Strategy 1: Hard Timeout**
- Discard all responses after 100ms, run auction with collected bids only
- **Trade-off:** Simplest implementation but may miss highest bids

**Strategy 2: Adaptive Timeout**

Track per-DSP latency histograms \\(H_{dsp}\\) and set individualized timeouts:

$$T_{dsp} = \text{min}\left(P_{95}(H_{dsp}), T_{global}\right)$$

where \\(P_{95}(H_{dsp})\\) is the 95th percentile latency for each DSP, capped at \\(T_{global} = 100ms\\).

**Strategy 3: Progressive Auction**

- Run preliminary auction at 80ms with available bids
- Update winner if late arrivals (up to 100ms) beat current best bid
- **Advantage:** Balances low latency for fast DSPs with opportunity for high-value late bids

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

gRPC is excellent for internal services but faces a key constraint: **OpenRTB is a standardized JSON/HTTP protocol**. External DSPs expect HTTP REST endpoints per IAB spec.

**Hybrid approach:**
- **External DSP communication:** HTTP/JSON (OpenRTB spec requirement)
- **Internal services:** gRPC for ML inference, cache layer, auction engine
  - Benefits: Protobuf serialization (~3× smaller), native streaming, ~2-5ms faster
  - Trade-off: Schema maintenance and version compatibility overhead
- **Integration:** Thin HTTP→gRPC adapter at edge

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
#tbl_tier_assign + table th:first-of-type  { width: 22%; }
#tbl_tier_assign + table th:nth-of-type(2) { width: 18%; }
#tbl_tier_assign + table th:nth-of-type(3) { width: 35%; }
#tbl_tier_assign + table th:nth-of-type(4) { width: 25%; }
</style>
<div id="tbl_tier_assign"></div>

| Tier | Score Range | Treatment | Typical Count |
|------|------------|-----------|---------------|
| **Tier 1 (Premium)** | >80 | Always call from all regions | 10-15 DSPs |
| **Tier 2 (Regional)** | 50-80 | Call if same region + healthy | 20-25 DSPs |
| **Tier 3 (Opportunistic)** | 30-50 | Call only for premium inventory | 10-15 DSPs |
| **Tier 4 (Excluded)** | <30 OR P95>100ms | SKIP entirely (egress cost savings) | 5-10 DSPs |

**Note:** Tier assignment also incorporates P95 latency for cost optimization. See [Egress Bandwidth Cost Optimization](#egress-bandwidth-cost-optimization-predictive-dsp-timeouts) section below for detailed predictive timeout calculation and Tier 4 exclusion logic that achieves 45% egress cost reduction.

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
- Latency percentiles: `p50`, `p95`, `p99`
- Bid metrics: `bid_rate`, `win_rate`, `avg_bid_value`
- Response rates at different timeout thresholds: 50ms, ..: `response_50ms`, `response_70ms`, `response_80ms`
- Health scoring: `health_score`, `tier_assignment`

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
- **This platform**: 100ms p95 target (balances global reach with user experience), with **120ms absolute p99 cutoff** to protect tail latency (see [P99 Tail Latency Defense](/blog/ads-platform-part-1-foundation-architecture/#p99-tail-latency-defense-the-unacceptable-tail) in the architecture post for detailed rationale)

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

**After synchronization (13ms avg, 15ms p99):** Once RTB completes at 130ms, we run Auction Logic (3ms), Budget Check (3ms avg, 5ms p99) via Redis Lua script, add overhead (2ms), and serialize the response (5ms), reaching 143ms avg (145ms p99). The budget check uses Redis Lua script for atomic check-and-deduct (detailed in [the budget pacing section of Part 3](/blog/ads-platform-part-3-data-revenue/#budget-pacing-distributed-spend-control)).

**Buffer (5-7ms):** Leaves 5-7ms headroom to reach the 150ms SLO, accounting for network variance and tail latencies. The 5ms Integrity Check investment is justified by massive annual savings in RTB bandwidth costs (eliminating 20-30% fraudulent traffic before DSP fan-out).

**Key constraint:** Increasing RTB timeout beyond 100ms directly increases total latency. A 150ms RTB timeout would push total latency to 185ms (150 RTB + 25 startup + 10 final), violating the 150ms SLO by 35ms.

**Key architectural insight:** RTB auction (100ms) is the **critical path** - it dominates the latency budget. The internal ML path (Feature Store 10ms + Ad Selection 15ms + ML Inference 40ms = 65ms) completes well before RTB responses arrive, so they run in parallel without blocking each other.

**Why 100ms RTB timeout is the p95 target (with p99 protection at 120ms):**
- **Industry standard**: OpenRTB implementations typically use 100-200ms timeouts
- **Real-world examples**: Most SSPs allow 100-150ms, Magnite CTV uses 250ms
- **This platform's choice**: 100ms p95 target with operational target of 50-70ms, and **120ms absolute p99 cutoff** with forced failure to fallback inventory (see [P99 Tail Latency Defense](/blog/ads-platform-part-1-foundation-architecture/#p99-tail-latency-defense-the-unacceptable-tail) in the architecture post)
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
| **High-value, responsive**<br>(avg bid >2× baseline, p95 latency <80ms) | Always include | Best revenue potential with reliable response |
| **Medium-value, responsive**<br>(avg bid 0.75-2× baseline, p95 latency <80ms) | Include | Good balance of revenue and reliability |
| **Low-value or slow**<br>(avg bid <0.75× baseline or p95 >90ms) | Evaluate ROI | May skip to reduce tail latency |
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

### Egress Bandwidth Cost Optimization: Predictive DSP Timeouts

> **Architectural Driver: Cost Efficiency** - Egress bandwidth is the largest variable operational cost in RTB integration. At 1M QPS sending requests to 50+ DSPs, the platform pays for every byte sent to DSPs, regardless of whether they respond in time or win the auction. Optimizing which DSPs receive requests and with what timeouts directly impacts infrastructure costs.

**The Egress Bandwidth Problem:**

RTB integration involves sending HTTP POST requests (2-8KB each) to dozens of external DSPs for every ad request. At scale, this creates massive egress bandwidth costs:

**Bandwidth Calculation at 1M QPS:**
- **Request volume**: 1M ad requests/sec
- **DSPs per request**: 50 DSPs (without optimization)
- **Request size**: ~4KB average (OpenRTB 2.5 bid request JSON)
- **Egress bandwidth**: 1M × 50 × 4KB = **200GB/sec = 17,280 TB/day**
- **Baseline monthly egress**: 17,280 TB/month

**The Waste:** DSPs that consistently respond slowly (>100ms) rarely win auctions due to the 150ms total SLO constraint. Yet the platform still pays full egress costs to send them bid requests.

**Example of waste:**
- DSP "SlowBid Inc" has P95 latency = 150ms (too slow for 100ms RTB budget)
- Platform sends 1M requests/day to SlowBid
- SlowBid responds to only 15% within 100ms (rest timeout)
- **85% of egress bandwidth wasted** (requests sent but timeouts occur)
- Wasted bandwidth per slow DSP: 1M × 4KB × 0.85 = 3.4GB/day
- With 10-15 underperforming DSPs: **34-51 GB/day in pure waste per region**

**Solution: DSP Performance Tier Service with Predictive Timeouts**

Instead of using a global 100ms timeout for all DSPs, dynamically adjust timeout per DSP based on historical performance, and skip DSPs that won't respond in time.

**DSP Performance Tier Service Architecture:**

This is a dedicated microservice that:
1. **Tracks** P50, P95, P99 latency for every DSP (hourly rolling window)
2. **Calculates** predictive timeout for each DSP
3. **Assigns** DSPs to performance tiers
4. **Provides** real-time lookup for ad server (via Redis cache, <1ms lookup)

**Latency Budget Impact:**

The DSP performance lookup adds 1ms to the RTB auction phase and is accounted for within the existing 100ms RTB budget:

**RTB Phase Breakdown (100ms total):**
- **DSP selection (1ms):** Redis lookup for tier data, filter DSPs based on region and tier
- **HTTP fan-out (2-5ms):** Establish connections, send bid requests to 20-30 selected DSPs
- **DSP processing + network (50-70ms):** Wait for DSP responses with dynamic timeouts
- **Response collection (2-3ms):** Parse incoming bids, validate responses
- **Buffer (20-40ms):** Remaining time for slow DSPs up to their individual timeout limits

**Key point:** The 1ms lookup happens at the start of the RTB phase and reduces the effective fan-out budget from 100ms to 99ms. This is acceptable because:
- Dynamic timeouts reduce average wait time by 20-30ms (from 80ms to 50-60ms)
- Net latency impact: -20ms to -30ms improvement despite the 1ms lookup cost
- The lookup enables skipping 40-60% of DSPs, which eliminates their connection overhead (2-5ms per skipped DSP)

**Trade-off:** Spend 1ms upfront to save 20-30ms on average through smarter DSP selection and dynamic timeouts. The ROI is 20:1 to 30:1 in latency savings.

**Predictive Timeout Calculation:**

For each DSP, calculate dynamic timeout based on historical latency:

$$T_{DSP} = \min(P95_{DSP} + \text{safety margin}, T_{max})$$

Where:
- \\(P95_{DSP}\\) = 95th percentile latency for DSP over last hour
- \\(\text{safety margin}\\) = 10ms buffer for network variance
- \\(T_{max}\\) = 100ms (absolute maximum timeout)

**Example calculations:**

| DSP | P95 Latency (1h) | Predictive Timeout | Action |
|-----|------------------|-------------------|---------|
| Google AdX | 35ms | min(35+10, 100) = **45ms** | Include with short timeout |
| Magnite | 55ms | min(55+10, 100) = **65ms** | Include with medium timeout |
| Regional DSP A | 25ms | min(25+10, 100) = **35ms** | Include with very short timeout |
| SlowBid Inc | 145ms | min(145+10, 100) = **100ms** | Include but likely timeout |
| UnreliableDSP | 180ms | Exceeds 150ms | **SKIP entirely** (pre-filter) |

**Enhanced Tier Assignment with Cost Optimization:**

Extend the existing 3-tier system to incorporate egress cost optimization:

| Tier | Latency Profile | Predictive Timeout | Treatment | Egress Savings |
|------|----------------|-------------------|-----------|----------------|
| **Tier 1 (Premium)** | P95 < 50ms | P95 + 10ms (dynamic) | Always call, optimized timeout | Minimal waste |
| **Tier 2 (Regional)** | P95 50-80ms | P95 + 10ms (dynamic) | Call if same region | 15-25% reduction |
| **Tier 3 (Opportunistic)** | P95 80-100ms | P95 + 10ms (capped at 100ms) | Call only premium inventory | 40-50% reduction |
| **Tier 4 (Excluded)** | P95 > 100ms | N/A | **SKIP entirely** | **100% saved** |

**DSP Selection Algorithm with Cost Optimization:**

Enhanced algorithm that incorporates both latency AND cost:

**Step 1: User Context Identification**
- Determine user's geographic region from IP address (US-East, EU-West, or APAC)
- Identify inventory value tier (premium, standard, or remnant)

**Step 2: Fetch DSP Performance Data**

Ad Server retrieves current performance data from Redis cache for all DSPs:
- DSP tier assignment (1, 2, 3, or 4)
- Predictive timeout (individualized per DSP)
- P95 latency from last hour
- Response rate within 100ms window

**Step 3: Apply Tier-Based Filtering Rules**

**Tier 4 DSPs (P95 > 100ms):** Skip entirely. These DSPs timeout too frequently to justify egress bandwidth cost. **Result:** 100% egress savings for excluded DSPs.

**Tier 3 DSPs (P95 80-100ms):** Include only for premium inventory. For standard or remnant inventory, the slow response time doesn't justify waiting. **Result:** 40-50% of Tier 3 calls eliminated.

**Tier 2 DSPs (P95 50-80ms):** Include only if DSP region matches user region. Cross-region calls add 30-60ms network latency, making these DSPs non-competitive. **Result:** 15-25% of Tier 2 calls eliminated.

**Tier 1 DSPs (P95 < 50ms):** Always include with optimized timeout. Premium DSPs like Google AdX and Magnite have multi-region infrastructure, ensuring fast response regardless of user location.

**Step 4: Assign Dynamic Timeouts**

For each included DSP, set individualized timeout based on predictive timeout calculation. Fast DSPs get shorter timeouts (35-45ms), slower DSPs get longer timeouts (65-100ms), reducing average wait time.

**Step 5: Outcome**

**Selected DSPs:** 20-30 DSPs per request (down from 50 without optimization)

**Timeout distribution:**
- 10-15 DSPs with 35-50ms timeout (Tier 1)
- 8-12 DSPs with 50-70ms timeout (Tier 2)
- 2-3 DSPs with 80-100ms timeout (Tier 3)

**Savings achieved:**
- 40-60% fewer DSPs called (pre-filtering)
- 20-30ms reduced average wait time (dynamic timeouts)
- 45-55% total egress bandwidth reduction

**Cost Impact Analysis:**

**Before optimization** (baseline):
- DSPs called per request: 50
- Average timeout wait: 80ms
- Egress per request: 50 × 4KB = 200KB
- Monthly egress bandwidth: 17,280 TB (baseline = 100%)

**After optimization** (with predictive timeouts):
- DSPs called per request: 25-30 (Tier 1+2+3, Tier 4 excluded)
- Average timeout wait: 55ms (dynamic timeouts)
- Egress per request: 27.5 × 4KB = 110KB
- Monthly egress bandwidth: ~9,500 TB (55% of baseline)
- **Egress reduction: 45% compared to baseline**

**Additional benefits:**
- **Latency improvement**: Reduced average wait from 80ms → 55ms
- **Response quality**: Higher percentage of responses arrive in time
- **Revenue maintained**: 95-97% of revenue captured (only excluding non-competitive DSPs)

{% mermaid() %}
graph TB
    subgraph DSP_SERVICE["DSP Performance Tier Service"]
        METRICS[("Latency Metrics DB<br/>P50/P95/P99 per DSP<br/>Hourly rolling window")]
        CALC["Predictive Timeout Calculator<br/>T = min P95 + 10ms, 100ms"]
        TIER["Tier Assignment Logic<br/>Tier 1-4 based on P95"]
        CACHE[("Redis Cache<br/>DSP performance data<br/>1ms lookup latency")]

        METRICS --> CALC
        CALC --> TIER
        TIER --> CACHE
    end

    subgraph AD_FLOW["Ad Server Request Flow"]
        REQ["Ad Request<br/>1M QPS"]
        LOOKUP["Lookup DSP Performance<br/>from Redis cache"]
        FILTER["Filter DSPs<br/>Apply tier rules"]
        FANOUT["Fan-out to Selected DSPs<br/>With dynamic timeouts"]
        COLLECT["Collect Responses<br/>Progressive auction"]

        REQ --> LOOKUP
        LOOKUP --> FILTER
        FILTER --> FANOUT
        FANOUT --> COLLECT
    end

    subgraph COST["Cost Impact"]
        BEFORE["Before: 50 DSPs<br/>200KB egress per request<br/>Baseline 100 percent"]
        AFTER["After: 27 DSPs<br/>110KB egress per request<br/>55 percent of baseline"]
        SAVINGS["Improvement:<br/>45 percent egress reduction<br/>25 ms latency improvement"]

        BEFORE -.-> AFTER
        AFTER -.-> SAVINGS
    end

    CACHE --> LOOKUP
    FANOUT --> METRICS

    style SAVINGS fill:#d4edda
    style FILTER fill:#fff3cd
    style TIER fill:#e1f5ff
{% end %}

**Implementation Details:**

**1. DSP Performance Metrics Collection:**

Track per-DSP metrics with hourly aggregation using time-series database (InfluxDB or Prometheus):

**Latency Metrics:**
- P50 latency per DSP per region (e.g., Google AdX in US-East: 32ms)
- P95 latency per DSP per region (e.g., Google AdX in US-East: 45ms)
- P99 latency per DSP per region (e.g., Google AdX in US-East: 78ms)

**Performance Metrics:**
- Response rate within 100ms window (e.g., Google AdX: 95%)
- Bid rate (% of auctions where DSP submits bid, e.g., 85%)
- Win rate (% of bids that win auction, e.g., 12%)

Each metric is tagged with DSP identifier and region for granular analysis and tier assignment.

**2. Hourly Tier Recalculation:**

Automated job runs every hour:

1. **Query** last 1 hour of DSP latency data
2. **Calculate** P95 for each DSP
3. **Compute** predictive timeout: `T = min(P95 + 10ms, 100ms)`
4. **Assign** tier based on P95:
   - Tier 1: P95 < 50ms
   - Tier 2: P95 50-80ms
   - Tier 3: P95 80-100ms
   - Tier 4: P95 > 100ms (exclude)
5. **Update** Redis cache with new tier + timeout data
6. **Alert** if Tier 1 DSP degrades to Tier 2/3

**3. Ad Server Integration:**

Ad Server fetches DSP performance data via REST API endpoint. For a request from US-East region, the service returns current performance data for all DSPs:

**Example DSP Performance Data (US-East Region):**

| DSP | Tier | Predictive Timeout | P95 Latency | Response Rate | Region | Include? |
|-----|------|-------------------|-------------|---------------|--------|----------|
| Google AdX | 1 | 45ms | 35ms | 95% | Global | Yes (Always) |
| Regional DSP A | 2 | 38ms | 28ms | 92% | US-East | Yes (Same region) |
| Regional DSP B | 2 | 42ms | 32ms | 88% | EU-West | No (Cross-region) |
| Slow DSP | 4 | N/A | 145ms | 15% | US-East | No (Excluded) |

**Data Freshness:** Performance data updated hourly, cached timestamp indicates last recalculation (e.g., 2025-11-19 14:00:00 UTC).

**Ad Server Decision Logic:**
- **Google AdX (Tier 1):** Include with 45ms timeout (premium DSP, always called)
- **Regional DSP A (Tier 2):** Include with 38ms timeout (same region match)
- **Regional DSP B (Tier 2):** Skip (cross-region adds 30-60ms latency)
- **Slow DSP (Tier 4):** Skip entirely (P95 > 100ms, saves egress bandwidth)

**4. Monitoring & Alerting:**

Track cost optimization effectiveness:

**Metrics:**
- `egress_bandwidth_gb_per_day`: Total egress to DSPs
- `egress_cost_usd_per_day`: Calculated cost
- `dsp_exclusion_rate`: % of DSPs excluded per request
- `avg_dsps_per_request`: Average DSPs called (target: 25-30)
- `cost_savings_vs_baseline`: Monthly savings vs 50-DSP baseline

**Alerts:**
- **P1 Critical**: Tier 1 DSP degraded to Tier 3+ for >2 hours
- **P1 Critical**: Egress cost exceeds budget by >20%
- **P2 Warning**: >5 DSPs moved from Tier 2 → Tier 3 in single hour (infrastructure issue?)
- **P2 Warning**: Average DSPs per request > 35 (over-inclusive filtering)

**5. A/B Testing Impact:**

Validate cost savings without revenue loss:

**Test setup:**
- **Control group** (20% traffic): Use global 100ms timeout for all DSPs
- **Treatment group** (80% traffic): Use predictive timeouts with tier filtering

**Metrics tracked:**
- Revenue per 1000 impressions (eCPM)
- Egress bandwidth cost
- P95 RTB latency
- Fill rate (% requests with winning bid)

**Expected results:**
- eCPM: -1% to +1% (revenue neutral)
- Egress cost: -40% to -50%
- P95 latency: -20ms to -30ms (improved)
- Fill rate: -0.1% to +0.2% (maintained)

**Trade-offs Accepted:**

1. **Reduced DSP participation**: 50 → 27 DSPs per request
   - **Mitigation**: Tier 1 premium DSPs (Google AdX, Magnite) always included
   - **Impact**: Only low-performing DSPs excluded

2. **Complexity**: Additional service to maintain
   - **Justification**: 45% egress cost savings significantly exceeds incremental maintenance overhead
   - **Operational overhead**: Minimal (automated tier calculation, 1-2 days/month monitoring)

3. **False exclusions during DSP recovery**: If DSP was slow for 1 hour but recovers, stays excluded until next hourly update
   - **Mitigation**: Consider 15-minute recalculation window for Tier 1 DSPs
   - **Impact**: Minimal (most DSP performance is stable hour-to-hour)

**ROI Analysis:**

**Investment:**
- Engineering: 3 weeks × 2 engineers (one-time implementation effort)
- Infrastructure: Additional Redis cache + metrics database (ongoing infrastructure cost)
- Maintenance: Approximately 20% of one engineer's time for ongoing monitoring

**Benefits:**
- Egress bandwidth: 45% reduction (ongoing operational savings)
- Latency improvement: 20-30ms average reduction in RTB wait time
- Revenue impact: Neutral to slightly positive (95-97% revenue maintained while excluding only non-competitive DSPs)
- **Overall ROI**: Implementation cost recovered within first 1-2 months through reduced egress bandwidth charges

**Conclusion:**

Predictive DSP timeouts with tier-based filtering is a **high-impact, low-risk optimization** that:
- Reduces egress bandwidth costs by 45-50% compared to baseline
- Improves P95 RTB latency by 20-30ms
- Maintains 95-97% of revenue (only excludes non-competitive DSPs)
- Requires minimal engineering investment with payback period of 1-2 months

This optimization transforms egress bandwidth from the largest variable operational cost to a manageable, optimized expense.

---

## ML Inference Pipeline


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

**Partition count:** 100 partitions = 1,000 events/sec per partition (100K total throughput)
- Sweet spot: high enough for parallelism, low enough to avoid coordinator overhead
- Each partition handles ~100MB/sec max (well below Kafka's limit)

**Partition key:** `hash(user_id) % 100`
- **Why `user_id`:** Maintains event ordering per user (impression → click → conversion must stay ordered)
- **Trade-off:** Without `user_id` key, random partitioning gives better load distribution but loses ordering guarantees
- **Hot partition risk:** Power users (high event volume) can create skewed load. Monitor partition lag; if detected, use composite key: `hash(user_id || timestamp_hour) % 100` to spread hot users across partitions

Kafka guarantees ordering within a partition, not across partitions. User-keyed partitioning ensures causally-related events (same user's journey) stay ordered.

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

AUC improvements translate directly to revenue: at 100M daily impressions, a 1% AUC improvement (~0.5-1% CTR lift) generates **significant monthly revenue gain** proportional to baseline CPM and monthly volume.

**Decision Matrix (Infrastructure Costs Only):**

$$Value_{infra} = \alpha \times Accuracy - \beta \times Latency - \gamma_{infra} \times OpsCost$$

With \\(\alpha = 100\\) (revenue impact), \\(\beta = 50\\) (user experience), \\(\gamma_{infra} = 10\\) (infrastructure only):

- **GBDT:** \\(100 \times 0.80 - 50 \times 0.020 - 10 \times 5 = 29\\)
- **DNN:** \\(100 \times 0.82 - 50 \times 0.045 - 10 \times 20 = -120.25\\) (GPU cost makes this unviable)
- **FM:** \\(100 \times 0.76 - 50 \times 0.015 - 10 \times 3 = 45.25\\) ← **highest value**

FM has the highest infrastructure value, but this analysis **omits operational complexity**.

**Production Decision: GBDT**

Operational factors favor GBDT despite FM's infrastructure advantage:

1. **Ecosystem maturity:** LightGBM/XGBoost have 10× more production deployments - easier hiring, better tooling, more community support
2. **Debuggability:** SHAP values enable root cause analysis when CTR drops unexpectedly - FM provides limited interpretability
3. **Incremental learning:** GBDT supports online learning - FM requires full retraining
4. **Production risk:** Deploying less-common FM technology introduces operational burden that outweighs the 16-point mathematical advantage

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

1. **Minimum spend requirement**: Require minimum spend threshold before enabling full optimization
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

**Launch decision:** Accept 65% initial revenue rather than delaying for data that can only be gathered post-launch.

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

Container orchestration must handle GPU scheduling for ML workloads, scale appropriately, and avoid cloud vendor lock-in. Technology comparison:

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
- **Finding the sweet spot**: Test with production-like traffic to find where \\(\text{total\_latency} = \text{queue\_wait} + \text{inference\_time}\\) stays within your SLA while maximizing \\(\text{requests\_per\_second}\\)

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

**Throughput and Latency Analysis:**

| Compute Type | Throughput | Latency | SLA Compliance |
|--------------|------------|---------|----------------|
| **CPU inference** | 100 req/sec per core | 100ms+ | Violates <40ms SLA |
| **GPU inference (T4)** | 1,280 req/sec per GPU | <40ms | Meets SLA |

**Key advantages of GPU inference:**
- **12.8× higher throughput** per compute unit enables serving more traffic with fewer resources
- **2.5× better latency** (40ms vs 100ms) meets stringent real-time requirements
- **Similar infrastructure efficiency** at scale - GPU throughput gains offset hardware costs

**Decision:** GPU inference is the only viable option for meeting <40ms latency SLA at high QPS. CPU inference cannot achieve required latency regardless of scale.

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

The Feature Store integrates with the circuit breaker system for graceful degradation:

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
    subgraph SOURCES["Data Sources"]
        S3[(S3/Snowflake<br/>Historical batch data)]
        KAFKA[Kafka/Kinesis<br/>Real-time event streams]
        DB[(PostgreSQL/APIs<br/>Request-time data)]
    end

    subgraph COMPUTE["Feature Computation Paths"]
        BATCH[Path A: Batch Features<br/>Daily aggregations, user profiles<br/>Engine: Spark]
        STREAM[Path B: Stream Features<br/>Time-window aggregations hourly<br/>Engine: Spark Streaming or Rift]
        REALTIME[Path C: Real-Time Features<br/>Computed per request<br/>Engine: Rift]
    end

    subgraph STORAGE["Feature Storage Layer"]
        OFFLINE[(Offline Store<br/>S3 Parquet<br/>For ML training)]
        ONLINE[(Online Store<br/>Redis 5ms p99<br/>For serving)]
    end

    subgraph SERVING["Serving APIs"]
        API[Tecton Feature Server<br/>REST API<br/>gRPC API<br/>Python/Java SDK]
    end

    subgraph CONSUMERS["Consumers"]
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

## ML Operations & Continuous Model Monitoring

> **Architectural Driver: Production ML Reliability** - Deploying a CTR prediction model is the beginning, not the end. Production ML systems degrade over time as user behavior shifts, competitors change strategies, and seasonal patterns emerge. Without continuous monitoring and automated retraining, model accuracy drops 5-15% within weeks, directly impacting revenue.

**The Hidden Challenge of Production ML:**

Models trained on historical data assume the future resembles the past. This assumption breaks in real-world ad platforms:
- **Concept drift**: User behavior changes (holidays, economic shifts, competitor campaigns)
- **Feature drift**: Distribution of input features shifts (new device types, browser updates)
- **Training-serving skew**: Production data diverges from training data (data pipeline bugs, schema changes)

**Impact without MLOps:**
- Week 1 post-deployment: AUC = 0.78 (baseline)
- Week 4: AUC = 0.74 (5% degradation → ~3-5% revenue loss)
- Week 12: AUC = 0.70 (10% degradation → ~8-12% revenue loss)

**Solution:** Automated monitoring, drift detection, and retraining pipeline that maintains model performance within acceptable bounds (AUC ≥ 0.75) while minimizing operational overhead.

This section details the production ML infrastructure that keeps the CTR prediction model accurate and reliable at 1M+ QPS.

### Model Quality Metrics: Offline vs Online

Production ML requires **two complementary measurement systems**: offline metrics (training/validation) and online metrics (production). Both are necessary because they measure different aspects of model health.

**Offline Metrics (Training & Validation Phase):**

These metrics are computed on held-out validation data before deployment:

**AUC-ROC (Area Under Curve):**
- **Target**: ≥ 0.78 (established in ML Inference Pipeline section above)
- **Interpretation**: Probability that model ranks random positive (clicked ad) higher than random negative (not clicked)
- **Threshold logic**: AUC 0.78 means "78% chance model correctly ranks click vs non-click"
- **Why this target**: Industry benchmark for CTR prediction (Google: 0.75-0.80, Facebook: 0.78-0.82)

**Calibration (Predicted CTR vs Actual CTR):**
- **Target**: ±10% deviation across probability bins
- **Validation**: Divide predictions into 10 bins (0-10%, 10-20%, ..., 90-100%)
- **Check**: For each bin, \\(\frac{|\overline{predicted} - \overline{actual}|}{\overline{actual}} \leq 0.10\\)
- **Example**: If model predicts 2.0% CTR on average for a bin, actual CTR should be 1.8-2.2%
- **Why critical**: Budget pacing and eCPM calculations depend on accurate CTR estimates

**Log Loss (Cross-Entropy):**
- **Target**: < 0.10 (lower is better)
- **Formula**: \\(-\frac{1}{N} \sum [y_i \cdot \log(p_i) + (1-y_i) \cdot \log(1-p_i)]\\)
- **Purpose**: Penalizes confident wrong predictions more than uncertain ones
- **Use case**: Detect overconfident model (predicts 95% CTR but actual is 50%)

**Online Metrics (Production Monitoring):**

These metrics track real-world performance with live traffic:

**Click-Through Rate (CTR):**
- **Baseline**: 1.0% (established platform average)
- **Monitoring**: Track hourly, alert if deviates ±5% from baseline for 6+ hours
- **Calculation**: \\(\text{CTR} = \frac{\text{clicks}}{\text{impressions}} \times 100\\)
- **Why hourly**: Detects issues faster than daily aggregation (6-hour window captures problems before significant revenue loss)

**Effective Cost Per Mille (eCPM):**
- **Baseline**: Platform-specific (typically $3-8 for general audience)
- **Monitoring**: Daily average, alert if drops > 10% for 2 consecutive days
- **Relationship to model**: Better CTR predictions → more accurate eCPM → better auction decisions → higher revenue

**P95 Inference Latency:**
- **Target**: < 40ms (established constraint from architecture)
- **Monitoring**: Per-minute tracking, alert if P95 > 45ms for 5 minutes
- **Degradation signals**: Model complexity increased (too many trees), infrastructure issues (CPU throttling, memory pressure)

**Prediction Error Rate:**
- **Target**: < 0.1% (fewer than 1 in 1,000 predictions fail)
- **Causes**: Missing features, malformed input, service timeout
- **Response**: Circuit breaker trips at 1% error rate (fallback to previous model version)

**Why Both Offline AND Online:**

Offline metrics validate model quality before deployment (gate check), but cannot predict production behavior:
- **Offline alone misses**: Distribution shift, seasonal effects, competitor actions
- **Online alone misses**: Early warning (by the time online metrics degrade, revenue is already lost)
- **Combined approach**: Offline ensures quality at deployment, online detects drift and triggers retraining

### Concept Drift Detection: When Models Go Stale

**What is Concept Drift:**

Concept drift occurs when the statistical properties of the target variable change over time. In CTR prediction, this means the relationship between features and click probability shifts.

**Real-World Examples:**

1. **Seasonal drift**: Holiday shopping season (Nov-Dec) sees 30-40% higher CTR than baseline due to increased purchase intent
2. **Competitive drift**: New competitor launches aggressive campaign → user attention shifts → our CTR drops 5-10%
3. **Platform drift**: Browser updates change rendering behavior → creative load times shift → CTR patterns change
4. **Economic drift**: Recession reduces consumer spending → conversion rates drop → advertisers bid lower → auction dynamics shift

**Impact Magnitude:**

Without drift detection:
- **Week 1-4**: Gradual AUC decline from 0.78 → 0.75 (3% drop, acceptable)
- **Week 5-8**: Accelerated decline to 0.72 (6% drop, revenue loss: ~4-6%)
- **Week 9-12**: Model severely degraded to 0.68 (10% drop, revenue loss: ~8-12%)

**Detection Methods:**

**Population Stability Index (PSI):**

PSI measures distribution shift between training and production data.

**Formula:**
$$\text{PSI} = \sum_{i=1}^{n} (\text{actual}_i - \text{expected}_i) \times \ln\left(\frac{\text{actual}_i}{\text{expected}_i}\right)$$

where \\(n\\) = number of bins (typically 10).

**Interpretation Thresholds:**
- **PSI < 0.10**: Stable (no action needed)
- **0.10 ≤ PSI < 0.25**: Moderate drift (monitor closely, consider retraining)
- **PSI ≥ 0.25**: Significant drift (immediate retraining trigger)

**Implementation:**
- **Frequency**: Daily calculation on last 24 hours of production data
- **Baseline**: Compare against training data distribution (saved during model training)
- **Alert**: If PSI > 0.25 for **3 consecutive days** → trigger retraining

**Example Calculation:**

Compare training data distribution vs production data distribution (10 bins):

| Bin | Training % | Production % | PSI Contribution |
|-----|-----------|--------------|------------------|
| 1 | 10% | 8% | (0.08-0.10)×ln(0.08/0.10) = 0.0045 |
| 2 | 15% | 13% | (0.13-0.15)×ln(0.13/0.15) = 0.0029 |
| 3 | 20% | 22% | (0.22-0.20)×ln(0.22/0.20) = 0.0019 |
| ... | ... | ... | ... |
| 10 | 0.5% | 0.5% | (0.005-0.005)×ln(1) = 0 |

**Total PSI = 0.12** (Moderate drift - monitor closely)

**Kolmogorov-Smirnov (KS) Test:**

KS test detects if feature distributions have shifted.

**What it measures**: Maximum distance between cumulative distribution functions
**Threshold**: KS statistic > 0.2 indicates significant distribution change
**Applied to**: Top 20 features (by importance score from model)
**Frequency**: Weekly check

**Example:**
- Feature: `user_avg_session_duration`
- Training distribution: Mean = 120 sec, Std = 45 sec
- Production distribution: Mean = 95 sec, Std = 50 sec
- KS statistic = 0.28 > 0.2 → Feature drift detected

**Rolling AUC Monitoring:**

Track model AUC on production data over time.

**Method**:
- Compute AUC daily on previous day's impressions (clicks = positive, no-clicks = negative)
- Plot 7-day rolling average to smooth noise
- Alert if rolling AUC drops below threshold

**Thresholds:**
- **Warning**: AUC < 0.76 for 7 consecutive days (2% below target)
- **Critical**: AUC < 0.75 for 3 consecutive days (3% below target, immediate retraining)

**Automated Alerting Strategy:**

**P1 Critical Alerts (Immediate Retraining):**
- AUC < 0.75 for 3 consecutive days
- CTR drops > 10% compared to 30-day baseline for 6 hours
- PSI > 0.30 for 2 consecutive days (severe drift)

**P2 Warning Alerts (Schedule Retraining within 48 hours):**
- PSI > 0.25 for 3 consecutive days (significant drift)
- AUC gradual decline: 0.78 → 0.76 over 14 days (early degradation signal)
- Feature drift: >5 of top 20 features show KS > 0.2

**Why Multi-Signal Approach:**
- PSI catches distribution shift early (leading indicator)
- AUC confirms actual performance degradation (lagging indicator)
- CTR tracks business impact directly (financial indicator)
- Combining all three reduces false positives (avoid unnecessary retraining)

### Automated Retraining Pipeline: Keeping Models Fresh

**Retraining Triggers:**

Three trigger conditions initiate automated retraining:

1. **Scheduled**: Every Sunday at 2 AM UTC (weekly cadence, low-traffic window)
2. **Drift-Detected**: PSI > 0.25 for 3 days OR AUC < 0.75 for 3 days
3. **Manual**: Engineer-initiated via command-line tool (for major platform changes, new features)

**7-Step Retraining Pipeline:**

**Step 1: Data Collection (30 minutes)**

**What happens:**
- Query data warehouse for last 90 days of events
- Extract: impressions (100M+), clicks (1M+), feature vectors
- Include: `user_id`, `ad_id`, `timestamp`, features, `click` (0/1 label)

**Data volume:**
- Sample size target: 10M impressions (ensuring 100K+ clicks at 1% baseline CTR)
- Positive class: ~100K clicks (1% of 10M)
- Negative class: ~9.9M non-clicks (downsampled if needed for class balance)

**Quality gates:**
- Verify click rate 0.5-2.0% (if outside range, data pipeline issue)
- Check timestamp range covers 90 days (no gaps > 24 hours)

**Step 2: Data Validation (10 minutes)**

**Validation Checks:**

**Null Detection:**
- Critical features (`device_type`, `user_country`, `hour_of_day`): 0% nulls allowed
- Optional features (`user_interests`): < 5% nulls allowed
- Action: If critical feature >0% nulls → halt pipeline, alert data engineering

**Outlier Detection:**
- CTR per user: Flag if > 10% (likely bot or click fraud)
- Session duration: Flag if > 2 hours (suspicious behavior)
- Action: Remove outliers (top 0.1% by CTR, bottom 0.1% by duration)

**Distribution Validation:**
- Compute PSI between new training data and previous training data
- Threshold: PSI > 0.40 signals severe distribution shift (investigate before proceeding)
- Example: If new data has 50% mobile vs previous 80% mobile → likely data bug

**Action on Validation Failure:**
- Halt pipeline
- Alert: PagerDuty P1 to ML Engineering on-call
- Log: Validation failure details to S3 for investigation
- **Do NOT deploy model trained on bad data** (financial risk)

**Step 3: Model Training (2-4 hours)**

**Algorithm: LightGBM (Gradient Boosted Decision Trees)**

Already established choice (see Model Architecture section above for rationale).

**Hyperparameter Grid Search:**

Parameters to tune:
- `learning_rate`: [0.01, 0.05, 0.1] - Controls overfitting vs convergence speed
- `max_depth`: [4, 6, 8] - Tree depth (deeper = more complex, higher overfitting risk)
- `num_leaves`: [31, 63, 127] - Leaves per tree (more = more complex)
- `min_data_in_leaf`: [100, 500, 1000] - Prevents overfitting on rare patterns

**Search Strategy:**
- 5-fold cross-validation on training data
- Evaluate: AUC, log loss, calibration on each fold
- Select: Best hyperparameters by average AUC across folds
- **Trade-off**: Grid search 27 combinations (3×3×3) takes 2-4 hours vs single model (20 min)

**Hardware:**
- 32-core CPU instance (m5.8xlarge)
- 128GB RAM
- No GPU needed (GBDT is CPU-optimized)
- Cost: ~$1.50/training run

**Training Output:**
- Model binary: 50-100MB (serialized LightGBM model)
- Metadata: AUC, calibration curve, feature importance, hyperparameters
- Artifacts stored: S3 bucket for 30-day retention

**Step 4: Model Evaluation**

**Evaluation Criteria (All Must Pass):**

**Criterion 1: AUC Threshold**
- **Requirement**: AUC ≥ 0.78 on validation set
- **Rationale**: Established minimum performance bar
- **Action on failure**: Reject model, investigate data quality or feature engineering issues

**Criterion 2: Calibration Check**
- **Requirement**: Predicted CTR within ±10% of actual CTR across all probability bins
- **Method**: Divide predictions into 10 bins, compute \\(\frac{|predicted - actual|}{actual}\\) for each
- **Action on failure**: Reject model (miscalibrated predictions break eCPM calculations)

**Criterion 3: Performance Improvement**
- **Requirement**: New model AUC ≥ Current model AUC + 0.005 (0.5% improvement)
- **Rationale**: Avoid churning models for negligible gains (operational overhead)
- **Exception**: If AUC < 0.75 (degraded), deploy even if not improved (restore to baseline)

**Rejection Handling:**
- Log: Evaluation failure reason to ML monitoring dashboard
- Alert: P2 to ML Engineering (investigate feature engineering, data quality)
- Fallback: Keep current model in production
- Retry: Manual investigation before next scheduled retraining

**Step 5: Shadow Deployment (24 hours, 10% traffic)**

**What is Shadow Deployment:**

Run new model in parallel with current model, but **do NOT serve** new model's predictions to users. Log both models' predictions for comparison.

**Configuration:**
- **Traffic**: 10% of production requests (100K QPS out of 1M total)
- **Duration**: 24 hours (captures daily seasonality, sufficient sample size)
- **Logging**: Store predictions from both models with request context

**Metrics Tracked:**
- **AUC**: Compute offline AUC on shadow traffic (both models)
- **Calibration**: Check calibration bins
- **Latency**: P95 inference latency for new model
- **Error rate**: Prediction failures (missing features, crashes)

**Decision Criteria:**
- New model AUC ≥ Current model AUC (at least equal)
- New model P95 latency < 40ms (meets SLA)
- New model error rate < 0.1% (meets reliability target)

**Action:**
- **If all pass**: Proceed to Canary Deployment
- **If any fail**: Reject model, log failure reason, alert ML Engineering

**Step 6: Canary Deployment (48 hours, 10% production)**

**What is Canary:**

Serve **real traffic** with new model (10%), monitor business metrics.

**Configuration:**
- **Traffic split**: 10% new model, 90% current model
- **Duration**: 48 hours (captures weekday/weekend variance)
- **Routing**: Random assignment per request (not per user, avoids learning effects)

**Metrics Monitored:**

**Business Metrics:**
- **CTR**: New model CTR vs Current model CTR (must be within ±2%)
- **eCPM**: Revenue per 1K impressions (must be within ±3%)
- **Fill Rate**: % requests with ad served (must be ≥ 99%)

**Technical Metrics:**
- **Latency**: P95 < 40ms (unchanged from shadow)
- **Error Rate**: < 0.1% (unchanged from shadow)

**Rollback Triggers (Automatic):**
- CTR drops > 2% compared to control group for 6 hours
- eCPM drops > 3% compared to control group for 12 hours
- Error rate > 0.1% for 1 hour
- **Rollback time**: < 5 minutes (update config, reload previous model)

**Success Criteria:**
- **Primary**: eCPM within ±3% of control (neutral or positive revenue impact)
- **Secondary**: CTR within ±2% of control (acceptable variance)
- **Safety**: Error rate < 0.1% AND latency < 40ms (operational health)

**Step 7: Full Deployment (7-day ramp)**

**Gradual Rollout Schedule:**

- **Day 1**: 10% new model, 90% old (canary complete)
- **Day 2**: 25% new model, 75% old
- **Day 3**: 50% new model, 50% old
- **Day 4**: 75% new model, 25% old
- **Day 5**: 90% new model, 10% old
- **Day 6-7**: 100% new model (old model archived)

**Why Gradual:**
- Limits blast radius if unexpected issue emerges
- Captures full week of seasonality (weekday/weekend patterns)
- Allows time for monitoring before full commitment

**Monitoring at Each Stage:**
- Same metrics as canary (CTR, eCPM, latency, error rate)
- **Rollback decision**: Revert to previous stage if metrics degrade
- **Fast rollback**: < 5 min (update traffic split config, no redeployment)

**Model Archival:**
- Old model retained: 30 days in S3
- Metadata logged: Deployment date, traffic split history, performance metrics
- **Purpose**: Enable fast rollback if delayed issues discovered

**Pipeline Completion:**
- Archive current model as "previous_version"
- Promote new model to "current_version"
- Update monitoring baselines (new CTR/eCPM become reference)
- Log retraining event: Date, AUC improvement, deployment outcome

{% mermaid() %}
graph TB
    TRIGGER[Retraining Trigger<br/>Weekly or drift detected]

    DATA[Data Collection<br/>90 days, 10M samples<br/>30 min]

    VALIDATE[Data Validation<br/>Nulls, outliers, drift<br/>10 min]

    TRAIN[Model Training<br/>LightGBM + grid search<br/>2-4 hours]

    EVAL[Model Evaluation<br/>AUC ≥ 0.78?<br/>Calibration OK?]

    SHADOW[Shadow Deployment<br/>10% traffic, 24 hours<br/>Compare vs current]

    CANARY[Canary Deployment<br/>10% production<br/>48 hours]

    FULL[Full Deployment<br/>100% traffic<br/>7-day ramp]

    FAIL[Reject Model<br/>Investigate + retry]

    TRIGGER --> DATA
    DATA --> VALIDATE
    VALIDATE --> TRAIN
    TRAIN --> EVAL
    EVAL -->|Pass| SHADOW
    EVAL -->|Fail| FAIL
    SHADOW -->|Healthy| CANARY
    SHADOW -->|Issues| FAIL
    CANARY -->|Healthy| FULL
    CANARY -->|Issues| FAIL

    style EVAL fill:#ffffcc
    style FAIL fill:#ffe6e6
    style FULL fill:#e6ffe6
{% end %}

### A/B Testing Framework: Statistical Rigor for Model Comparison

**Purpose:**

A/B testing validates that new model versions improve business outcomes with statistical confidence before full deployment.

**Framework Design:**

**Traffic Splitting:**
- **Control Group (A)**: 90% traffic → current model v1.2.8
- **Treatment Group (B)**: 10% traffic → new model v1.3.0
- **Assignment**: Random per request (via hash of `request_id`)
- **Duration**: 7 days (captures weekly seasonality, sufficient sample size)

**Metrics Tracked:**

**Primary Metric (Decision Criterion):**
- **eCPM (Effective Cost Per Mille)**: Revenue per 1,000 impressions
- **Target**: Treatment eCPM ≥ Control eCPM + 1% (meaningful business improvement)

**Secondary Metrics (Health Checks):**
- **CTR**: Click-through rate (must not degrade > 5%)
- **P95 Latency**: Inference latency (must stay < 40ms)
- **Error Rate**: Prediction failures (must stay < 0.1%)

**Statistical Significance:**

**Hypothesis Test:**
- **Null hypothesis (H₀)**: Treatment eCPM = Control eCPM (no difference)
- **Alternative hypothesis (H₁)**: Treatment eCPM > Control eCPM (treatment better)
- **Significance level (α)**: 0.05 (5% false positive rate)
- **Power (1-β)**: 0.80 (80% chance of detecting true 1% improvement)

**Minimum Detectable Effect (MDE):**
- **Target MDE**: 1% eCPM improvement
- **Sample size**: ~8M impressions per group (at 1M QPS, ~80 seconds per group, easily collected in 7 days)
- **Calculation**: Use power analysis (two-sample t-test) to determine required sample size

**Winner Selection Criteria:**

**Model v1.3.0 wins if:**
1. **Statistical significance**: p-value < 0.05 (Treatment significantly better than Control)
2. **Practical significance**: Treatment eCPM ≥ Control eCPM + 1% (minimum meaningful improvement)
3. **Safety checks**: All secondary metrics within acceptable bounds

**Example Result:**
- Control eCPM: $5.00
- Treatment eCPM: $5.08 (+1.6%)
- P-value: 0.03 < 0.05 ✓
- Decision: **Deploy v1.3.0** (statistically and practically significant improvement)

**Guardrail Metrics:**

Even if eCPM improves, reject model if:
- CTR drops > 5% (degraded user experience)
- Latency P95 > 40ms (violates SLA)
- Error rate > 0.1% (reliability issue)

### Model Versioning & Rollback Strategy

**Versioning Scheme:**

Models use timestamp-based versioning (`YYYY-MM-DD-HH`) for chronological ordering without semantic version complexity. Each version includes the model binary, metadata (AUC, calibration metrics, hyperparameters), and feature list. Storage in S3 with 30-day retention balances rollback capability against storage costs, with last 3 production-stable models (deployed ≥7 days without incidents) retained indefinitely as ultimate fallback.

**Fast Rollback Architecture:**

Model servers poll configuration every 30 seconds, enabling sub-2-minute rollback when production metrics degrade. Configuration update triggers graceful model reload: in-flight requests complete with current model while new requests route to previous version loaded from S3 (10-second fetch). Total rollback time averages 70 seconds (30s config poll + 10s model load + 30s verification).

**Rollback Triggers:**
- Error rate >1.0% for 15+ minutes (10× baseline)
- Latency P99 >60ms for 15+ minutes (50% above SLA)
- Revenue drop >5% for 1+ hour (severe business impact)

{% mermaid() %}
graph LR
    DEPLOY[New Model Deployed<br/>v2025-11-19-14]
    MONITOR[Monitor Metrics<br/>Latency Error Rate Revenue]

    DEGRADED{Degradation<br/>Detected?}

    ROLLBACK[Rollback Triggered<br/>Load v2025-11-12-08]
    RELOAD[Servers Reload<br/>70 sec transition]
    VERIFY[Verify Recovery<br/>Metrics normalized]

    CONTINUE[Continue Monitoring<br/>Model stable]

    DEPLOY --> MONITOR
    MONITOR --> DEGRADED

    DEGRADED -->|Yes<br/>Threshold exceeded| ROLLBACK
    DEGRADED -->|No<br/>Within SLA| CONTINUE

    ROLLBACK --> RELOAD
    RELOAD --> VERIFY
    VERIFY --> MONITOR

    CONTINUE --> MONITOR

    style DEPLOY fill:#e1f5ff
    style DEGRADED fill:#fff4e6
    style ROLLBACK fill:#ffe6e6
    style VERIFY fill:#e6ffe6
    style CONTINUE fill:#e6ffe6
{% end %}

**Cross-References:**

- AUC target (≥ 0.78) established in Part 2's ML Inference Pipeline section above
- Latency budget (P95 < 40ms) from Part 2's Model Serving Infrastructure section above
- A/B testing integrates with [Part 4's testing strategy](/blog/ads-platform-part-4-production-operations/#critical-testing-requirements)
- Model serving infrastructure detailed in [Part 5's ML Service section](/blog/ads-platform-part-5-implementation/#ml-inference-service)

**Production MLOps Summary:**

This monitoring and retraining infrastructure ensures model quality remains high despite natural drift. The 7-step automated pipeline, combined with multi-signal drift detection, maintains AUC ≥ 0.75 with minimal manual intervention. A/B testing provides statistical rigor for model comparisons, while fast rollback (< 5 min) protects against bad deployments.

**Key Insight:** Production ML is an ongoing engineering challenge, not a one-time deployment. Without continuous monitoring and automated retraining, model accuracy degradation costs 8-12% revenue within 12 weeks. The investment in MLOps infrastructure ($50K engineering + $10K/year infrastructure) pays for itself within 2-3 months through prevented revenue loss.

---


## Summary: The Revenue Engine in Action

This post detailed the dual-source architecture combining real-time bidding with ML-powered internal inventory within 150ms latency.

**Architecture:**

**Parallel paths** (run simultaneously):
- Internal ML: 65ms (Feature Store → GBDT inference → eCPM scoring)
- External RTB: 100ms (50+ DSPs, OpenRTB 2.5, geographic sharding)
- Unified auction: 8ms (highest eCPM wins, atomic budget check)

**Total**: 143ms average (7ms safety margin from 150ms SLO)

**Business Impact:**

| Approach | Revenue | Fill Rate | Problem |
|----------|---------|-----------|---------|
| RTB only | 70% baseline | 35% | Blank ads, poor UX |
| Internal only | 52% baseline | 100% | Misses market pricing |
| **Dual-source** | **Baseline** | **100%** | **30-48% lift vs single-source** |

**Key Decisions:**

1. **GBDT over neural nets**: 20-40ms CPU inference vs 10-20ms GPU at 6-10× cost. Cost-efficiency wins at 1M QPS.

2. **Feature Store (Tecton)**: Pre-computed aggregations serve in 10ms p99 vs 50-100ms direct DB queries. Trades storage for latency.

3. **100ms RTB timeout**: Industry standard balances revenue (more DSPs) vs latency. Geographic sharding required (NY-Asia: 200-300ms RTT impossible otherwise).

**Core Insights:**

- **Parallel execution requires independence**: Internal vs external inventory enables true parallelism. Sequential dependencies can't be parallelized.
- **External dependencies dominate budgets**: RTB consumes 70% of 143ms total. Forces aggressive optimization elsewhere.
- **Feature engineering > model complexity**: Quality features (engagement history, temporal patterns) deliver better CTR prediction than complex models with poor features.
