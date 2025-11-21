+++
authors = [ "Yuriy Polyulya" ]
title = "Production Operations: Fraud, Multi-Region & Operational Excellence"
description = "Taking ad platforms from design to production at scale. Deep dive into pattern-based fraud detection (20-30% bot filtering), active-active multi-region deployment with 2-5min failover, zero-downtime schema evolution, clock synchronization for financial ledgers, observability with error budgets, zero-trust security, and chaos engineering validation."
date = 2025-11-02
slug = "ads-platform-part-4-production"
draft = false

[taxonomies]
tags = ["distributed-systems", "fraud-detection", "multi-region-deployment", "ads-tech"]
series = ["architecting-ads-platforms"]

[extra]
toc = false
series_order = 4
series_title = "Architecting Real-Time Ads Platform"

+++

## Introduction: From Design to Production

**Architecture on paper ≠ production system.** You can design the most elegant distributed architecture - perfect latency budgets, optimal caching strategies, fair auction mechanisms - and it will fail in production without addressing operational realities.

**The gap between design and production:**

Most architecture discussions focus on the "happy path":
- Requests succeed and services respond quickly
- Data stays consistent and caches stay fresh
- External dependencies (DSPs) behave predictably
- Traffic patterns match expectations
- No one tries to exploit the system

Production systems face harsher realities:

- **Malicious traffic**: Bot farms generate 20-30% of all clicks, draining advertiser budgets and wasting RTB bandwidth (64.8PB/month of fraudulent DSP calls)
- **Regional failures**: Entire AWS regions go down. It's not if, but when.
- **Schema evolution**: Database schemas change while the system serves 1M+ QPS with zero downtime
- **Clock drift**: Distributed timestamps diverge by milliseconds, breaking financial audit trails and causing budget discrepancies
- **Cascading failures**: One service degrades (Feature Store at 15ms instead of 10ms), triggering circuit breakers, forcing fallbacks, and creating revenue impact
- **Unknown unknowns**: Failure modes you never predicted - DNS issues, certificate expirations, upstream API changes

**Why this matters at scale:**

At 1M+ QPS serving 400M daily active users:
- **1% fraud rate** = 10K fraudulent requests/second = massive bandwidth waste
- **1 minute of downtime** = 60M failed requests = angry users + advertiser SLA violations
- **1ms of clock drift** = financial audit failures + regulatory compliance issues
- **1 bad deployment** = potential cascade to entire system

**What this post covers:**

This post addresses eight critical production topics that separate proof-of-concept from production-grade systems:

1. **[Fraud Detection](#fraud-detection-pattern-based-abuse-detection)** - Pattern-based bot detection filtering 20-30% of malicious traffic BEFORE expensive RTB fan-out. Multi-tier detection (L1 real-time, L2 behavioral, L3 ML-based) with specific patterns for click farms, SDK spoofing, and domain fraud.

2. **[Multi-Region Deployment](#multi-region-deployment-and-failover)** - Active-active architecture across 3 AWS regions with CockroachDB automatic failover (30-60s) and Route53 health-check routing (2min). Handling split-brain scenarios, regional budget pacing, and bounded overspend during failover.

3. **[Schema Evolution](#schema-evolution-zero-downtime-data-migration)** - Zero-downtime migrations using dual-write patterns, backward/forward compatible schema changes, and gradual rollouts. Changing the database while serving 1M QPS without dropping a single request.

4. **[Clock Synchronization](#distributed-clock-synchronization-and-time-consistency)** - Why NTP (±50-100ms) isn't good enough for financial ledgers. Hybrid Logical Clocks (HLC) for distributed timestamp ordering without TrueTime hardware. Preventing clock-drift-induced budget discrepancies.

5. **[Observability & Operations](#observability-and-operations)** - SLO-based monitoring with error budgets (43min/month at 99.9%). RED metrics (Rate, Errors, Duration), distributed tracing for 150ms request paths, and structured logging at 1M+ QPS. Mean Time to Recovery (MTTR) as key operational metric.

6. **[Security & Compliance](#security-and-compliance)** - Zero-trust architecture (every request authenticated/authorized), encryption (TLS 1.3, AES-256 at rest), audit trails for financial compliance (GDPR/CCPA), and defense against insider threats.

7. **[Production Operations](#production-operations-at-scale)** - Progressive rollouts (1% → 10% → 50% → 100%), automated rollback triggers, chaos engineering validation, and incident response playbooks. Deployment safety at scale.

8. **[Resilience & Failure Scenarios](#resilience-and-failure-scenarios)** - Testing the architecture under extreme conditions: regional disasters, malicious insiders, and business model pivots. Validating theoretical resilience through controlled chaos.

**The core insight:**

Production-grade systems require **defense in depth across all dimensions**:

- **Technical resilience**: Multi-region, graceful degradation, zero-downtime operations
- **Security rigor**: Zero-trust, encryption, audit trails, compliance
- **Operational discipline**: Observability, deployment safety, incident response, chaos testing
- **Business protection**: Fraud prevention, financial accuracy, SLA compliance

Each dimension reinforces the others. Fraud detection protects the business. Multi-region protects availability. Zero-downtime migrations protect error budgets. Clock synchronization protects financial integrity. Observability protects MTTR. Security protects against insider threats. Progressive rollouts protect against bad deployments. Chaos testing validates it all actually works.

**Broader applicability:**

These patterns - fraud detection, multi-region failover, zero-downtime migrations, distributed time synchronization - apply beyond ad tech to high-stakes distributed systems:

- Financial platforms (transaction processing, regulatory compliance)
- E-commerce (fraud prevention, global traffic routing)
- Gaming (anti-cheat, regional failover)
- SaaS platforms (zero-downtime updates, tenant isolation)

A key insight: **operational excellence isn't bolted on after launch** - it must be designed into the system from the start. Circuit breakers, observability hooks, audit trails, multi-region data replication - these aren't implementation details, they're architectural requirements.

Let's explore each production topic and how they integrate into a cohesive operational strategy.

---

### Fraud Detection: Pattern-Based Abuse Detection

> **Architectural Driver: Financial Accuracy** - While rate limiting (covered in the architecture post) controls request **volume**, fraud detection identifies **malicious patterns**. A bot clicking 5 ads/minute might pass rate limits but shows suspicious behavioral patterns. Both mechanisms work together: rate limiting stops volume abuse, fraud detection stops sophisticated attacks.

**What Fraud Detection Does (vs Rate Limiting):**

**Fraud detection** answers: **"Are you malicious?"**
- Bot farm with 95% CTR, uniform timing, rotating IPs → blocked permanently
- Protects advertiser budgets from wasted spend and platform from massive RTB bandwidth costs (early filtering prevents 20-30% egress waste - typically one of top 3 infrastructure costs at scale)

**Rate limiting** answers: **"Are you requesting too much?"** (covered in the architecture post)
- Legitimate advertiser making 10K QPS (vs 1K limit) → throttled with 429
- Protects infrastructure capacity and enforces SLA

**Problem:** Detect and block fraudulent ad clicks in real-time without adding significant latency.

**CRITICAL: Integrity Check Service in Request Critical Path**

The **Integrity Check Service (L1 fraud detection)** runs in the synchronous request path immediately after User Profile lookup and **BEFORE** the expensive RTB fan-out to 50+ DSPs. This placement is critical for cost optimization:

**Cost Impact of Early Fraud Filtering:**
**Without early filtering:** RTB requests go to 50+ DSPs for ALL traffic, including 20-30% bot traffic
- **Bandwidth amplification:** Each RTB request = ~2-4KB payload × 50 DSPs = **100-200KB per request**
- **Bot traffic bandwidth waste:** At 1M QPS with 25% fraud = 250K fraudulent requests/sec
  - Wasted bandwidth: 25GB/sec = **64.8PB/month** on fraudulent RTB calls
  - **Egress cost magnitude:** Cloud providers charge egress bandwidth, making this one of the largest infrastructure cost categories at scale
- **DSP relationship cost:** 50+ DSPs waste CPU cycles processing fraudulent bid requests → strained relationships, potential rate limiting

**Solution:** 5ms Integrity Check Service blocks 20-30% of fraud BEFORE RTB fan-out, eliminating this massive bandwidth waste.

**Trade-off Analysis:**
- **Added latency:** 5ms per request (still within 150ms SLO with 5-7ms buffer)
- **Bandwidth savings:** Eliminates 20-30% of total RTB egress (64.8PB/month prevented)
- **Cost structure:** At scale, egress bandwidth is typically **one of top 3 infrastructure costs** (alongside compute and storage)
- **ROI:** The 5ms latency investment (costing ~0.5-1% of impressions from slower response) saves **10,000-25,000× more** in annual egress costs than it costs in lost opportunity
- **Secondary benefit:** Preserves DSP relationships by not flooding them with bot traffic

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

**Signal Loss Impact on Fraud Detection:**

Fraud detection becomes harder when `user_id` is unavailable (40-60% of mobile traffic due to ATT/Privacy Sandbox). Without stable identity:
- **L2 behavioral analysis degrades**: Can't track "this user clicked 50 ads today" - limited to IP/device fingerprint patterns
- **L3 historical features unavailable**: Lifetime clicks, account age, session history all require persistent identity

**Mitigation strategies for anonymous traffic:**
- **Lean harder on L1**: IP reputation, device fingerprint, and request metadata still available
- **Publisher-level fraud scoring**: Aggregate fraud rates by publisher compensate for missing user signals
- **Session-level patterns**: Short-term behavioral analysis within single anonymous session
- **Conservative blocking**: Lower thresholds for anonymous traffic (accept slightly higher false positive rate)

**Expected accuracy degradation**: AUC drops from 0.92 (identified) to ~0.82-0.85 (anonymous) - still effective but less precise.

**Latency impact on overall SLO:**

Fraud detection runs in PARALLEL with ad selection (as shown in the architecture post's critical path analysis):

**Ad serve critical path:**

{% mermaid() %}
gantt
    title Ad Serve Critical Path (140ms Total)
    dateFormat x
    axisFormat %L

    section Sequential 0-25ms
    Network 10ms               :done, 0, 10
    Gateway 5ms                :done, 10, 15
    User Profile 10ms          :done, 15, 25

    section Parallel Execution
    Ad Selection + ML 65ms     :crit, 25, 90
    Fraud Detection 0-15ms     :active, 25, 40

    section RTB + Final
    RTB Auction 100ms          :crit, 90, 190
    Final Processing 10ms      :done, 190, 200
{% end %}

**Key insight:** Fraud detection (0-15ms) runs in parallel with Ad Selection + ML (65ms) and completes before the ML path finishes. This means fraud detection adds **ZERO latency** to the critical path—the request must wait for ML anyway, so fraud checks happen "for free" during that wait time.

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

**Impact Analysis: Fraud Prevention vs False Positives**

**Baseline scenario** (typical ad platform at scale):
- Fraud rate: ~3% of total traffic (click fraud, impression fraud, bot traffic)
- Without detection: All fraudulent traffic billed to advertisers → billing disputes, trust erosion, potential legal liability

**Fraud detection effectiveness:**

If catching **80% of fraud**:
- **Fraud prevented:** 80% × 3% = **2.4% of total platform traffic** protected from fraudulent billing
- **Impact:** Prevents advertiser disputes, maintains platform trust, ensures compliance with payment processor requirements
- **Magnitude:** At scale, prevented fraud cost typically represents **5-15% of gross revenue** (varies by vertical and fraud sophistication)

**False positive trade-off:**

If **2% false positive rate**:
- **Legitimate traffic blocked:** 2% × 97% legitimate = **1.94% of total traffic**
- **Impact:** Lost impressions, reduced advertiser reach, opportunity cost on legitimate engagement
- **Magnitude:** Represents **~1-2% revenue loss** but prevents significantly larger fraud-related losses

**Net impact assessment:**

| Metric | Value | Notes |
|--------|-------|-------|
| **Fraud prevented** | ~2.4% of traffic | Prevents 5-15% revenue loss from fraud |
| **False positives** | ~1.94% of traffic | 1-2% revenue opportunity cost |
| **Net benefit** | **3-13% gross revenue protected** | Net positive after false positive cost |
| **Infrastructure overhead** | <0.5% of infrastructure spend | Redis, HBase, ML training - negligible vs benefit |
| **ROI multiplier** | **50-100×** | Benefit-to-infrastructure-cost ratio |

**Decision:** Fraud detection is **operationally critical**. The 2% false positive rate is an acceptable trade-off to prevent fraud-induced billing disputes (which would be catastrophic for advertiser trust and payment processor relationships).

### Critical Testing Requirements

> **Architectural Driver: Financial Accuracy & Trust** - Two testing aspects are non-negotiable for ads platforms: proving financial accuracy (≤1% budget overspend) and validating performance at scale (1M+ QPS). Traditional testing approaches miss both.

**The testing gap:** Unit tests validate individual components. Integration tests validate service interactions. End-to-end tests validate request flows. But none of these prove the two critical claims that make or break an ads platform:

1. **Financial accuracy under distributed contention**: Can 300+ servers concurrently decrement shared budgets without violating the ≤1% overspend guarantee?
2. **Performance at scale under realistic load**: Does the system actually handle 1M QPS sustained load with P95 < 150ms latency, or does it collapse at 800K?

**Why traditional testing insufficient:**
- **Unit tests** can't simulate race conditions across 300 distributed servers
- **Integration tests** run at low QPS (100-1K), missing performance cliffs that only appear at 800K-1M+ QPS
- **Canary deployments** risk significant revenue (10% of platform traffic if billing broken)

This section covers three specialized testing strategies required for financial systems at scale.

#### Financial Accuracy Validation: Proving the ≤1% Budget Overspend Claim

**The Challenge**

[Part 1](/blog/ads-platform-part-1-foundation-architecture/)'s architecture claims ≤1% budget overspend despite distributed contention. How do we prove this claim before production deployment?

**The problem:** Multiple servers (300+) concurrently decrementing shared advertiser budgets at 1M QPS creates inevitable race conditions. Without proper atomic operations ([Part 3's Redis DECRBY](/blog/ads-platform-part-3-data-revenue/#budget-pacing-distributed-spend-control)), budget overspend could reach 50-200% as servers race to approve the last available impressions.

**Claim to validate:** [Part 1](/blog/ads-platform-part-1-foundation-architecture/) guarantees ≤1% overspend through atomic distributed cache operations. This must be proven under realistic contention, not assumed.

**Testing Methodology**

**Setup:**
- **Test campaigns:** 1,000 campaigns with equal budgets
- **Ad servers:** 300 instances (production-scale)
- **Load generation:** 10M ad requests distributed across all servers
- **Contention strategy:** Intentional hot-spotting - route 50% of traffic to top 100 campaigns (simulates popular campaigns receiving disproportionate traffic)

**Validation:**
1. Track approved impressions per campaign (count every impression the system serves)
2. Calculate actual spend: `actual_spend = approved_impressions × CPM`
3. Assert: `(actual_spend - budget) / budget ≤ 1%` for 99.5%+ campaigns

**Why this methodology works:**
- **Realistic contention:** 300 servers competing for same budgets mirrors production conditions
- **Hot-spotting:** Concentrating 50% traffic on 100 campaigns creates worst-case race conditions
- **Statistical significance:** 1,000 campaigns provides confidence interval for overspend distribution
- **Binary validation:** Either overspend ≤1% (claim proven) or >1% (architecture broken, must fix before launch)

**What this validates:**
- [Part 1's financial accuracy claim](/blog/ads-platform-part-1-foundation-architecture/#architectural-drivers-the-three-non-negotiables) (≤1% overspend guarantee)
- [Part 3's atomic operations](/blog/ads-platform-part-3-data-revenue/#budget-pacing-distributed-spend-control) (Redis DECRBY correctness under contention)
- Race condition handling (proper distributed coordination)

**Why critical:** Real advertisers will sue if systematic overspend >1%. This test detects the bug before it costs millions in refunds and destroyed trust.

**Historical results from similar systems:**
- **99.8% campaigns within 1% threshold** (target: 99.5%)
- **Edge cases:** 1.1-1.3% overspend traced to Redis follower lag during failover (network partition delayed replication)
- **Verdict:** Acceptable within margin (documented as known limitation: "During network partitions, overspend may reach 1.3% for <1 minute")

#### Scale Validation: Performance Testing Beyond Unit Tests

**The problem:** Systems that pass unit tests at 1K QPS often collapse at 800K-1M QPS due to emergent behaviors invisible at low scale.

**Examples of scale-only failures:**
- **Cache stampede:** 1,000 requests for expired cache key overwhelm database (only appears at high QPS)
- **Connection pool exhaustion:** 10K concurrent connections exceed database limits (low QPS never hits limits)
- **GC pressure:** 250MB/sec allocation at 1M QPS triggers 50ms GC pauses (low QPS has negligible allocation)
- **Performance cliffs:** System handles 800K QPS fine, collapses at 1.1M (non-linear degradation)

**Critical Load Scenarios**

**Scenario 1: Baseline - 1M QPS Sustained (1 hour)**

**Configuration:**
- **Duration:** 1 hour continuous load
- **Request rate:** 1M QPS sustained (no ramp, immediate full load)
- **Concurrent users:** 50K (simulates realistic concurrency)
- **Traffic distribution:** Realistic mix (60% mobile, 30% web, 10% tablet)

**Success criteria:**
- P95 latency < 150ms (SLO from [Part 1](/blog/ads-platform-part-1-foundation-architecture/#latency-budget-decomposition))
- Error rate < 0.5% (acceptable error budget)
- No memory leaks (heap usage stable after 10 minutes)
- No connection pool exhaustion (all services maintain available connections)

**What this validates:**
- Latency budget claims from [Part 1](/blog/ads-platform-part-1-foundation-architecture/#latency-budget-decomposition) (150ms P95 holds under sustained load)
- Capacity planning (1M QPS baseline sustained without degradation)
- Memory management (no leaks, GC stable)

**Scenario 2: Burst - 1.5M QPS Spike (Black Friday Simulation)**

**Configuration:**
- **Ramp:** 1M → 1.5M QPS over 5 minutes (realistic traffic spike)
- **Duration:** 30 minutes at 1.5M QPS
- **Purpose:** Validate 50% headroom claim from [Part 1](/blog/ads-platform-part-1-foundation-architecture/#horizontal-scaling-model)

**Success criteria:**
- Auto-scaling triggers within 2 minutes (Kubernetes HPA detects load)
- Zero dropped requests (queue depth remains manageable)
- P95 latency < 175ms (acceptable 25ms degradation during burst)

**What this validates:**
- [Part 1's 50% headroom claim](/blog/ads-platform-part-1-foundation-architecture/#horizontal-scaling-model) (1.5M QPS capacity)
- Auto-scaling responsiveness (2-minute scale-up)
- Queue management (no request drops despite sudden spike)

**Scenario 3: Degraded Mode - Simulated Service Failures**

**Configuration:**
- **Inject failures:**
  - User Profile Service: +50ms latency (simulates cache miss storm)
  - Feature Store: 50% error rate (simulates database outage)
  - RTB Gateway: 3 DSPs timeout (simulates external partner issues)
- **Duration:** 15 minutes
- **Purpose:** Validate [Part 1's graceful degradation claims](/blog/ads-platform-part-1-foundation-architecture/#resilience-graceful-degradation-and-circuit-breaking)

**Success criteria:**
- Circuit breakers trip within 60 seconds (automatic failure detection)
- Graceful degradation activates (fallback to cached predictions, contextual ads)
- P95 latency < 200ms (degraded but not catastrophic)
- Revenue impact < 30% ([Part 1's composite degradation prediction](/blog/ads-platform-part-1-foundation-architecture/#resilience-graceful-degradation-and-circuit-breaking))

**What this validates:**
- [Part 1's degradation ladder](/blog/ads-platform-part-1-foundation-architecture/#resilience-graceful-degradation-and-circuit-breaking) (circuit breakers work as designed)
- Fallback paths functional (system doesn't crash, serves degraded ads)
- Revenue impact matches predictions (validates degradation math)

**Why these scenarios matter:**

Unit tests can't simulate distributed system behavior at scale:
- **Cache stampede** only appears when 1,000 concurrent requests hit expired key (impossible to replicate with 10 requests)
- **Performance cliffs** are non-linear - system works at 800K, collapses at 1.1M (can't extrapolate from low-QPS tests)
- **Emergent behaviors** like connection pool exhaustion, GC pressure, network saturation only manifest at production scale

**Testing infrastructure:** Dedicated load testing cluster (separate from production) with production-equivalent configuration (same instance types, same database sizing, same network topology).

#### Shadow Traffic: Financial System Validation Without User Impact

**Why Standard Canary Insufficient for Financial Systems**

**Standard canary deployment:**
- Route 10% real traffic to new version (v1.3.0)
- Monitor error rates, latency
- If healthy → ramp to 100%

**Problem for ads platforms:**
- **Revenue at risk:** 10% of platform traffic exposed to potential billing bugs
- **Detection lag:** Typical canary runs 30-60 minutes before promoting
- **Financial impact:** 30-60 minutes of billing errors at 10% traffic scale can represent significant financial exposure and advertiser trust damage
- **Advertiser trust:** Even small billing discrepancies trigger complaints, refund demands, lost contracts

**Risk unacceptable:** Cannot afford even 10-minute bug detection window for financial code.

**Shadow Traffic Approach: Zero User Impact Validation**

**Pattern:**
- **Primary (v1.2.3):** Serves 100% of user traffic (production version)
- **Shadow (v1.3.0):** Receives 10% sampled traffic (new version being validated)
- **Comparison engine:** Compares responses, latency, billing calculations
- **User impact:** ZERO (shadow responses discarded, only primary responses returned to users)

**Implementation:**

1. **Traffic sampling:** API Gateway duplicates 10% of requests
   - Original request → Primary service (v1.2.3) → user receives response
   - Duplicated request → Shadow service (v1.3.0) → response logged but discarded

2. **Response comparison:**
   - **Billing calculation diff:** Shadow charges $5.02, primary $5.00 → flag for investigation
   - **Latency regression:** Shadow P95 = 160ms, primary P95 = 145ms → block deployment
   - **Response divergence:** 0.1% of requests return different `ad_id` → manual review

3. **Validation metrics:**
   - **Billing accuracy:** Shadow vs primary spend must match within 0.1%
   - **Latency:** Shadow P95 must be ≤ primary P95 + 5ms (no regression)
   - **Error rate:** Shadow errors must be ≤ primary errors (no new failures)

**Ramp schedule:**

| Week | Shadow Traffic % | Validation | Decision |
|------|-----------------|------------|----------|
| **Week 1** | 1% | Stability check (memory leaks, crashes) | Proceed or abort |
| **Week 2** | 10% | Full validation (billing, latency, errors) | Proceed or abort |
| **Week 3** | Canary 10% | Promote to canary only if zero billing discrepancies | Proceed or abort |
| **Week 4+** | Ramp to 100% | Standard progressive rollout | Full deployment |

**Why this works:**
- **Zero financial risk:** Shadow traffic doesn't impact user responses or billing
- **Early detection:** Billing discrepancies found before any real traffic exposure
- **High confidence:** 10% shadow = millions of requests validated before canary
- **Reversibility:** Any issues detected → abort promotion, zero user impact

**Trade-off:**
- **Infrastructure cost:** Running shadow service doubles compute for 10% of traffic (10% overhead)
- **Engineering complexity:** Comparison engine adds operational complexity
- **Timeline:** Adds 2-3 weeks to deployment cycle (shadow → canary → full rollout)

**Value:** Preventing a single $100K billing error (30 min bug exposure at 10% canary) pays for years of shadow infrastructure costs.

#### Shadow Traffic Flow Diagram

{% mermaid() %}
graph TB
    PROD[Production Traffic<br/>1M QPS]

    GW[API Gateway<br/>Traffic Splitter]

    PRIMARY[Primary v1.2.3<br/>Serves response to user<br/>100% traffic]

    SHADOW[Shadow v1.3.0<br/>Logs results, discards<br/>10% sampled]

    USER[User receives response]

    COMPARE[Comparison Engine<br/>Latency, Errors, Response Diff<br/>Billing Calculation Validation]

    PROD --> GW
    GW -->|100%| PRIMARY
    GW -->|10% duplicate| SHADOW
    PRIMARY --> USER

    PRIMARY -.->|Metrics| COMPARE
    SHADOW -.->|Metrics| COMPARE

    COMPARE -->|Billing diff detected| ALERT[Alert + Block Promotion]
    COMPARE -->|Latency regression| ALERT
    COMPARE -->|All validations pass| PROMOTE[Promote to Canary]

    style SHADOW fill:#ffffcc
    style COMPARE fill:#ccffff
    style ALERT fill:#ffcccc
    style PROMOTE fill:#ccffcc
{% end %}

**Diagram explanation:**
- **Primary service** handles all user traffic (production stability)
- **Shadow service** receives duplicated sample (validation without user impact)
- **Comparison engine** validates billing accuracy, latency, error rates
- **Alerts** trigger on any discrepancy (billing diff, latency regression, error rate increase)
- **Promotion** only occurs after passing all validations (high confidence deployment)

#### Section Conclusion

**Three specialized testing strategies for financial systems:**

1. **Financial accuracy testing:** Validates [Part 1's ≤1% budget overspend claim](/blog/ads-platform-part-1-foundation-architecture/#architectural-drivers-the-three-non-negotiables) under distributed contention (300 servers, 10M requests, intentional race conditions)

2. **Scale testing:** Validates performance claims at production scale (1M QPS sustained, 1.5M burst, degraded mode scenarios that only manifest at high QPS)

3. **Shadow traffic:** Validates financial code changes with zero user impact (catches billing bugs before canary exposure, preventing $15K+ errors)

**Why critical:**
- Standard testing (unit, integration, E2E) **cannot** detect distributed race conditions, performance cliffs, or billing calculation errors
- Ads platforms are **financial systems** - billing bugs destroy trust and trigger lawsuits
- Scale-specific failures (cache stampede, connection exhaustion, GC pressure) only appear at 800K-1M+ QPS

**Cross-references:**
- **[Part 1](/blog/ads-platform-part-1-foundation-architecture/):** Financial accuracy testing validates the ≤1% budget overspend claim and 1M QPS capacity claim
- **[Part 3](/blog/ads-platform-part-3-data-revenue/):** Scale testing validates atomic Redis operations (DECRBY correctness) under 300-server contention

**Trade-offs accepted:**
- Shadow traffic adds 10% infrastructure cost and 2-3 weeks to deployment timeline
- **Value:** Prevents single $100K billing error, pays for itself many times over

With fraud detection protecting against malicious traffic and critical testing validating financial accuracy at scale, the platform is ready for multi-region deployment to ensure high availability.

---

### Multi-Region Deployment and Failover

> **Architectural Driver: Availability** - Multi-region deployment with 20% standby capacity ensures we survive full regional outages without complete service loss. At scale, even 1-hour regional outage represents significant revenue impact. Auto-failover within 90 seconds minimizes impact to <0.1% daily downtime.

**Why Multi-Region:**

**Business drivers:**

1. **Latency requirements**: Sub-100ms p95 latency is physically impossible with single region serving global traffic. Speed of light: US-East to EU = ~80ms one-way, already consuming 80% of our budget. Regional presence required.

2. **Availability**: Single-region architecture has single point of failure. AWS historical data: major regional outages occur 1-2 times per year, averaging 2-4 hours. Single outage can cause significant revenue loss proportional to platform scale and hourly revenue rate.

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
- **Interval**: 30 seconds (Standard tier) or 10 seconds (Fast tier)
- **Failure threshold**: 3 consecutive failures before marking unhealthy
- **Health checkers**: 15+ global endpoints test each region
- **Decision logic**: Healthy if ≥18% of checkers report success

**Failover trigger:** When health checks fail for 90 seconds (3 × 30s interval), Route53 marks region unhealthy and returns secondary region's IP for DNS queries.

**DNS TTL impact:** Set to 60 seconds. After failover triggered, new DNS queries immediately return healthy region, existing client DNS caches expire within 60s (50% of clients fail over in 30s, 95% within 90s).

**Why 60s TTL:** Balance between fast failover and DNS query load. Lower TTL (10s) = 6× more DNS queries hitting Route53 nameservers. At high query volumes, this increases costs, but the primary concern is cache efficiency - shorter TTLs mean resolvers cache records for less time, reducing effectiveness of DNS caching infrastructure.

**Health check vs TTL costs:** Note that health check intervals (10s vs 30s) have different pricing tiers. The 6× query multiplier applies to DNS resolution, not health checks.

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
- Campaign daily budget: B_daily
- US-East pre-allocated: 0.30 × B_daily (stored in US-East Redis)
- US-West pre-allocated: 0.40 × B_daily (stored in US-West Redis)
- EU-West pre-allocated: 0.30 × B_daily (stored in EU-West Redis)
- US-East fails at 2pm, having spent half of its allocation

**What happens:**

1. **Immediate impact:** Remaining allocation (0.15 × B_daily) in US-East Redis is lost (region unavailable)
2. **US-West takes over US-East traffic:** Continues spending from its own allocation
3. **Bounded over-delivery:** Max over-delivery = lost US-East allocation = 0.15 × B_daily
4. **Percentage impact:** 15% over-delivery (exceeds our 1% target!)

**Mitigation: CockroachDB-backed allocation tracking (implemented)**

Every 60 seconds, each region writes actual spend to CockroachDB:

**Heartbeat update** (US-East region, every 60s while healthy):
- Update campaign budget tracking table
- Set region-specific allocated amount (e.g., 0.30 × B_daily)
- Set region-specific spent amount (e.g., 50% of allocation)
- Update last heartbeat timestamp to current time
- Filter by campaign ID

**Failover recovery process:**

1. **T+0s:** US-East fails
2. **T+90s:** Health checks trigger failover, US-West starts receiving US-East traffic
3. **T+120s:** Atomic Pacing Service detects US-East heartbeat timeout (last write was 120s ago)
4. **T+120s:** Atomic Pacing Service reads last known state from CockroachDB:
   - US-East allocated: 0.30 × B_daily
   - US-East spent: 50% of allocation (written 120s ago)
   - Remaining (uncertain): ~15% of B_daily
5. **T+120s:** Atomic Pacing Service marks US-East allocation as "failed" and removes from available budget
6. **Result:** 15% of budget locked but not over-delivered

**Bounded under-delivery:** Max under-delivery = unspent allocation in failed region = 15% of budget.

**Why under-delivery is acceptable:**
- Advertiser complaint: "I paid for full budget, only got 85%" → refund difference
- Better than over-delivery: "I paid for budget X, you charged me 1.15X" → lawsuit

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

**Auto-scaling limitations:** Kubernetes HPA triggers at T+60s, but provisioning new capacity takes **30-40 seconds** for GPU-based ML inference nodes with modern tooling (pre-warmed images, model streaming, VRAM caching). Without optimization, this can extend to 90-120s (cold pulls, full model loading). During this window, the system operates at 2× over capacity, making graceful degradation essential.

**Mitigation: Graceful Degradation + Load Shedding**

> **Architectural Driver: Availability** - During regional failures, graceful degradation (serving stale cache, shedding low-value traffic) maintains uptime while minimizing revenue impact. Better to serve degraded ads than no ads.

The system employs a two-layer mitigation strategy:

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
- Service degradation: ~27% revenue reduction (from circuit breaker activations)
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
| Cross-region data transfer | None | 30% of baseline | Significant (new cost category) |
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

---

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

**Create new partitioned table** (`user_profiles_v2`):
- Columns: `user_id` (UUID), `region` (STRING), plus all existing columns
- Primary key: Composite key (`region`, `user_id`)
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
- **Old schema**: `PRIMARY KEY (user_id)`
- **New schema**: `PRIMARY KEY ((region, user_id))`

This requires **complete data copy** to new table with reshuffling across nodes. Plan for **2-4 week migration window** for large datasets (estimate varies based on data volume, cluster capacity, and acceptable impact on production traffic).

**Trade-off Analysis: Zero-Downtime vs Maintenance Window Migration**

**Context:** Database schema changes (like changing primary keys or sharding strategies) require data migration. The choice is between engineering complexity (zero-downtime) vs business impact (downtime).

**Option A: Zero-downtime migration (described above)**
- **Timeline:** ~8 weeks (2 weeks dual-write setup + 4 weeks background migration + 2 weeks validation/cutover)
- **Engineering investment:** ~2 Senior/Staff engineers × 8 weeks (0.3-0.4 engineer-years)
- **Additional overhead:** Test infrastructure, dual-write complexity, extensive validation
- **Risk profile:** Low - gradual rollout with continuous validation and rollback capability
- **Business impact:** **Zero downtime** - platform remains fully operational throughout

**Option B: Maintenance window migration**
- **Timeline:** 12-24 hour downtime window (optimistic estimate - issues can extend this significantly)
- **Engineering investment:** ~1 engineer × 2 weeks preparation + execution window
- **Simplicity:** Direct data copy - simpler implementation, less code complexity
- **Risk profile:** Medium-High - single point of failure, rollback requires restoration from backup
- **Business impact:** **12-24 hours complete downtime** = loss of **12-24 days worth of hourly revenue** (calculated as: hourly rate × 24 hours = equivalent daily revenue × 12-24)

**Decision framework:**

| Factor | Zero-Downtime | Maintenance Window |
|--------|--------------|-------------------|
| **Engineering cost** | 0.3-0.4 engineer-years | ~0.05 engineer-years |
| **Complexity** | High (dual-write, background sync) | Low (direct copy) |
| **Business impact** | Zero downtime | 12-24 days of hourly revenue lost |
| **Cost ratio** | **1×** (baseline) | **40-70× revenue impact** vs engineering cost |

**Decision:** For revenue-generating platforms at scale, zero-downtime migration is **economically justified by 40-70×**. The engineering investment (0.3-0.4 engineer-years) is negligible compared to downtime impact (weeks of revenue compressed into 12-24 hours).

This conclusion holds across wide parameter ranges: even if engineering costs are 2× higher or platform traffic is 5× lower, zero-downtime migration remains the optimal choice for business-critical systems.

---

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

**Example:** US-East allocates budget amount A (T1), EU-West spends A exhausting budget (T2). Without coordinated timestamps, separate regional databases using local clocks might timestamp T1 after T2 due to clock skew, showing wrong ordering in audit logs.

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
- **Cost**: S3 Glacier is 50-100× cheaper than active database storage for cold data
- **Compliance queries**: SOX/MiFID audits happen quarterly/annually, not daily - Athena query latency (seconds) is acceptable
- **Operational complexity**: No database to operate, patch, backup, or scale
- **Query capability**: Athena provides SQL interface for regulatory audits without maintaining a running database
- **Immutability**: S3 Object Lock enforces WORM (Write-Once-Read-Many) for regulatory compliance

**Build vs Buy:** Custom PostgreSQL + HLC implementation costs 1-1.5 engineer-years plus ongoing maintenance. CockroachDB's premium (20-30% of financial storage baseline) eliminates upfront engineering cost and operational burden. For cold archive, S3 + Athena is the clear choice - no operational burden and 50-100× cheaper than running a database.

### Financial Audit Log Reconciliation

**Purpose:** Verify operational ledger (CockroachDB) matches immutable audit log (ClickHouse) to detect data inconsistencies, event emission bugs, or system integrity issues before they compound into billing disputes.

**Dual-Ledger Architecture:**

{% mermaid() %}
graph TB
    ADV[Budget Service<br/>Ad Server]

    ADV -->|"1. Direct write<br/>Transactional"| CRDB[("CockroachDB<br/>Operational Ledger<br/>90-day hot")]
    ADV -->|"2. Publish event<br/>Async"| KAFKA[("Kafka<br/>Financial Events")]
    KAFKA -->|"Stream"| CH[("ClickHouse<br/>Immutable Audit Log<br/>7-year retention")]

    RECON[Reconciliation Job<br/>Daily 2:00 AM UTC]
    CRDB -.->|"Aggregate yesterday"| RECON
    CH -.->|"Aggregate yesterday"| RECON

    RECON -->|"99.999% match"| OK[No action]
    RECON -->|"Discrepancy detected"| ALERT[Alert Finance Team<br/>P1 Page]
    ALERT --> INVESTIGATE[Investigation:<br/>- Kafka lag 85%<br/>- Schema mismatch 10%<br/>- Event bug 5%]

    classDef operational fill:#fff3e0,stroke:#f57c00
    classDef audit fill:#e8f5e9,stroke:#388e3c
    classDef stream fill:#e3f2fd,stroke:#1976d2
    classDef check fill:#f3e5f5,stroke:#7b1fa2

    class CRDB operational
    class CH audit
    class KAFKA stream
    class RECON,ALERT,INVESTIGATE check
{% end %}

**Daily Reconciliation Job** (automated, runs 2:00 AM UTC):

**Step 1: Query Both Systems**

Extract previous 24 hours of financial data from both ledgers:
- **CockroachDB (Operational)**: Aggregate campaign charges by summing amounts from billing ledger for previous day, grouped by campaign
- **ClickHouse (Audit)**: Aggregate financial events (budget deductions, impression charges) from audit trail for previous day, grouped by campaign

**Step 2: Compare Aggregates**

Per-campaign validation with acceptable tolerance:
- **Match criteria**: Absolute difference between operational and audit totals must be less than the greater of (1 cent or 0.001% of operational total)
- **Rationale**: Allows rounding differences and sub-millisecond timing variations between systems
- **Expected result**: 99.999%+ campaigns match (typically 0-3 discrepancies out of 10,000+ active campaigns)

**Step 3: Alert on Discrepancies**

Automated notification when thresholds exceeded:
- **P1 page to finance team**: Campaign IDs with mismatches, delta amounts, percentage variance
- **Dashboard visualization**: Total campaigns affected, aggregate delta, trend analysis (increasing discrepancies indicate systemic issue)
- **Automated ticket creation**: Jira issue with forensic query suggestions pre-populated

**Step 4: Investigation Workflow**

Forensic analysis to identify root cause:
1. **Drill-down query**: Retrieve all transactions for affected `campaignId` from both systems ordered by timestamp
2. **Event correlation**: Match `requestId` between operational logs and audit trail to identify missing/duplicate events
3. **Common causes identified**:
   - **Kafka lag** (85% of discrepancies): Event delayed >24 hours due to consumer backlog → resolves automatically when ClickHouse catches up
   - **Schema mismatch** (10%): Field name change in event emission without updating ClickHouse parser → fix parser, backfill missing events
   - **Event emission bug** (5%): Edge case where Budget Service fails to emit event → fix bug, manual INSERT into ClickHouse with audit trail explanation

**Step 5: Resolution**

Manual intervention when automated reconciliation fails:
- **If CockroachDB correct**: Backfill missing event to ClickHouse with audit metadata (source, reason, approver identity, ticket reference)
- **If ClickHouse correct**: Investigate CockroachDB data corruption (extremely rare), restore from backup if needed, update operational ledger with correction entry

**Compliance Verification**

**Quarterly Audit Preparation:**

External auditor access workflow:
1. **Export ClickHouse data**: Generate Parquet files for audit period (e.g., Q4 2024: Oct 1 - Dec 31)
2. **Cryptographic verification**: Run hash chain validation across exported dataset, produce merkle tree root hash as tamper-evident seal
3. **Auditor query interface**: Provide read-only Metabase dashboard with pre-built queries (campaign spend totals, refund analysis, dispute history)
4. **Documentation bundle**: Reconciliation job logs, discrepancy resolution tickets, system architecture diagrams

**SOX Control Documentation:**

**Segregation of Duties:**
- **DBAs**: Cannot modify ClickHouse audit log (read-only access enforced via IAM roles)
- **Finance team**: Query-only access to both systems, no INSERT/UPDATE/DELETE privileges
- **Engineering team**: Can deploy code changes but cannot directly modify financial data
- **Audit trail**: All ClickHouse schema changes logged in separate audit table with approver identity and business justification

**Change Audit:**

Administrative operations on financial data systems logged separately:
- **CockroachDB schema changes**: Table alterations logged with timestamp, user, justification, approval ticket
- **ClickHouse partition operations**: Partition drops (only operation allowing data removal) require two-person approval and logged with business justification
- **Access control changes**: IAM role modifications logged and reviewed quarterly

**Access Control Matrix:**

| Role | CockroachDB | ClickHouse | Kafka | Permitted Operations |
|------|-------------|------------|-------|---------------------|
| Budget Service | Write-only | No access | Publish events | INSERT billing records |
| Finance Team | Read-only | Read-only | No access | Query, export, reporting |
| DBA Team | Admin | Read-only | Admin | Schema changes, performance tuning |
| Audit Team | Read-only | Read-only | Read-only | Compliance verification |
| Engineering | Read-only (production) | Read-only | Read-only | Debugging, monitoring |

**Retention Policy Enforcement:**

**Automated Archival** (runs monthly):

Data lifecycle management ensuring compliance while optimizing costs:
1. **Age detection**: Identify partitions older than 7 years based on timestamp conversion to year-month format
2. **Export to cold storage**: Write partition data to S3 Glacier in Parquet format with WORM (Write-Once-Read-Many) configuration
3. **External table creation**: Create ClickHouse external table pointing to S3 location (data remains queryable via standard SQL but stored at 1/50th cost)
4. **Partition drop**: Remove from ClickHouse hot storage after S3 export verified (logged as administrative action)
5. **Verification**: Monthly job validates S3 object count matches dropped partitions, alerts if mismatch detected

**Cost Impact:**

Retention policy reduces storage costs while maintaining compliance accessibility:
- **Active ClickHouse storage** (0-7 years): 180TB at standard ClickHouse rates
- **Cold storage** (>7 years): S3 Glacier at ~2% of active storage cost
- **Query capability**: Athena or ClickHouse external tables provide SQL interface to cold data (seconds latency acceptable for historical compliance queries)

---

## Observability and Operations


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

## Security and Compliance


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
- CockroachDB: Delete user profile records
- Redis/Valkey: Flush all user cache keys
- Kafka: Publish tombstone events (triggers log compaction)
- ML training: Mark user data as deleted
- S3 cold archive: Mark for deletion (note: 7-year financial audit trails may be retained per legal basis override)
- Backups: Crypto erasure (delete encryption key)

**Verification:** All systems confirm deletion completion → send deletion certificate to user **within one month** of request (target: 48-72 hours for standard cases).

**Note on financial records:** GDPR allows retention of financial transaction records beyond deletion requests when required by law (SOX, MiFID). User PII (name, email, demographics) is deleted, but anonymized transaction records ($X spent on date Y) are retained in S3 cold archive for regulatory compliance.

---

## Production Operations at Scale


### Deployment Safety and Zero-Downtime Operations

**The availability imperative:** With 99.9% SLO providing only 43 minutes/month error budget, we cannot afford to waste any portion on **planned** downtime. All deployments and schema changes must be zero-downtime operations.

**Progressive deployment strategy:**

Rolling deployments (canary → 10% → 50% → 100%) with automated gates on error rate, latency p99, and revenue metrics. Each phase must pass health checks before proceeding. Feature flags provide blast radius control - new features start dark, gradually enabled per user cohort.

**Zero-downtime schema migrations:**

Database schema changes consume zero availability budget through online DDL operations:

- **Simple changes** (ADD COLUMN, CREATE INDEX): CockroachDB's online schema changes with background backfill
- **Complex restructuring** (partition changes): Dual-write pattern with gradual cutover (detailed in the Schema Evolution section below)
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

## Resilience and Failure Scenarios

A robust architecture must survive catastrophic failures, security breaches, and business model pivots. This section addresses three critical scenarios:

**Catastrophic Regional Failure:** When an entire AWS region fails, our semi-automatic failover mechanism combines Route53 health checks (2-minute detection) with manual runbook execution to promote secondary regions. The critical challenge is budget counter consistency—asynchronous Redis replication creates potential overspend windows during failover. We mitigate this through pre-allocation patterns that limit blast radius to allocated quotas per ad server, bounded by replication lag multiplied by allocation size.

**Malicious Insider Attack:** Defense-in-depth through zero-trust architecture (SPIFFE/SPIRE for workload identity), mutual TLS between all services, and behavioral anomaly detection on budget operations. Critical financial operations like budget allocations require cryptographic signing with Kafka message authentication, creating an immutable audit trail. Lateral movement is constrained through Istio authorization policies enforcing least-privilege service mesh access.

**Business Model Pivot to Guaranteed Inventory:** Transitioning from auction-based to guaranteed delivery requires strong consistency for impression quotas. Rather than replacing our stack, we extend the existing pre-allocation pattern—CockroachDB maintains source-of-truth impression counters (leveraging the same HLC-based billing ledger) while Redis provides fast-path allocation with periodic reconciliation. This hybrid approach adds only 10-15ms to the critical path for guaranteed campaigns while preserving sub-millisecond performance for auction traffic. The 12-month evolution path reuses 80% of existing infrastructure (ML pipeline, feature store, Kafka, billing ledger) while adding campaign management and SLA tracking layers.

These scenarios validate that the architecture is not merely elegant on paper, but battle-hardened for production realities: regional disasters, adversarial threats, and fundamental business transformations.

---


## Summary: Production Readiness Across All Dimensions

Production-grade distributed systems require more than elegant design—they demand operational rigor across eight critical dimensions. This post bridged the gap between architecture and reality by addressing how systems survive at 1M+ QPS under real-world conditions.

**The eight pillars:**

**1. Fraud Detection** - Multi-tier pattern detection (L1 Bloom filters at 0.5ms, L2 behavioral rules, L3 ML batch) catches 20-30% of bot traffic before expensive RTB calls, saving significant external DSP bandwidth costs.

**2. Multi-Region Deployment** - Active-active architecture across 3 AWS regions with semi-automatic failover (2min Route53 detection + manual runbook execution). Handles split-brain through pre-allocation patterns limiting overspend to <1% during replication lag windows.

**3. Schema Evolution** - Zero-downtime migrations using dual-write patterns and gradual cutover preserve 99.9% availability SLO. Trade 2-4× engineering effort for keeping 43min/month error budget available for unplanned failures.

**4. Clock Synchronization** - Hybrid Logical Clocks (HLC) in CockroachDB provide causally-consistent timestamps for financial ledgers without TrueTime hardware, ensuring regulatory compliance for audit trails.

**5. Observability** - SLO-based monitoring with 99.9% availability target (43min/month downtime budget). Burn rate alerting triggers paging at 10× consumption rate. Prometheus metrics, Jaeger traces (1% sampling), centralized logs.

**6. Security & Compliance** - Zero-trust architecture with mTLS service mesh (Istio), workload identity (SPIFFE/SPIRE), encryption at rest/transit, immutable audit logs. GDPR right-to-deletion via cascade deletes, CCPA data export on demand.

**7. Production Operations** - Progressive rollouts (1% → 10% → 50% → 100%) with automated gates checking error rates and latency. <5min rollback SLA from detection to restored service. Rolling updates with health checks and connection draining.

**8. Resilience Validation** - Tested scenarios: regional disasters (2-5min recovery with bounded overspend), malicious insiders (zero-trust prevention), business model pivots (80% infrastructure reuse for auction→guaranteed delivery transition).

**Core insight:** Operational excellence isn't bolted on after launch—it must be designed into the architecture from day one. Circuit breakers, observability hooks, audit trails, multi-region replication, and progressive deployment are architectural requirements, not implementation details.

**Next:** [Part 5](/blog/ads-platform-part-5-implementation/) brings everything together with the complete technology stack—concrete choices, configurations, and integration patterns that transform abstract requirements into a deployable system.
