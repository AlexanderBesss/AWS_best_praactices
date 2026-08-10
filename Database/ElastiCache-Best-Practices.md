# ElastiCache Best Practices

## Engine Selection

> **Engine naming note:** Redis OSS forked into **Valkey** (Linux Foundation project) after Redis Inc. changed its licensing in 2024. Amazon ElastiCache now offers three engine options: **Valkey** (recommended for new workloads — actively developed, BSD-licensed, API-compatible with Redis OSS 7.2), **Redis OSS** (AWS supports up to the last BSD-licensed version, 7.1; available on a maintenance/extended-support track for existing workloads), and **Memcached**. New deployments should default to Valkey unless a specific Redis OSS-only feature or client compatibility issue requires otherwise.

### Valkey/Redis OSS vs Memcached

| Feature | Valkey / Redis OSS | Memcached |
|---------|-------|-----------|
| **Data structures** | Strings, lists, sets, sorted sets, hashes, streams | Strings, binary blobs |
| **Persistence** | RDB snapshots, AOF | None (ephemeral only) |
| **High Availability** | Multi-AZ with automatic failover | No built-in HA |
| **Clustering** | Sharding with replication | Sharding only |
| **Serverless option** | Yes (ElastiCache Serverless) | Yes (ElastiCache Serverless) |
| **Pub/Sub** | Yes | No |
| **Transactions** | MULTI/EXEC | No |
| **Lua scripting** | Yes | No |
| **Streams** | Yes (message queuing) | No |
| **Memory model** | Rich data types | Simple key-value |
| **Best for** | Sessions, leaderboards, caching, queues | Simple caching, distributed cache |

### Use Case Selection

| Use Case | Recommended Engine | Reason |
|----------|-------------------|--------|
| Session store | Valkey / Redis OSS | Persistence, replication |
| Leaderboard | Valkey / Redis OSS | Sorted sets |
| Simple caching | Either | Memcached simpler, Valkey more features |
| Message queue | Valkey / Redis OSS | Streams, pub/sub |
| Real-time analytics | Valkey / Redis OSS | Data structures, aggregation |
| Geospatial | Valkey / Redis OSS | Geospatial commands |
| Rate limiting | Valkey / Redis OSS | Atomic operations, sorted sets |
| High-throughput cache | Memcached | Simpler, multi-threaded |
| Unpredictable/spiky workloads | ElastiCache Serverless (Valkey, Redis OSS, or Memcached) | No capacity planning, scales automatically |

---

## Node Types

### Instance Classes

| Class | Generation | vCPU | Memory (approx.) | Use Case |
|-------|-----------|------|--------|----------|
| cache.t4g.micro | Graviton 2 | 2 | 0.5 GiB | Dev/test, small workloads |
| cache.t4g.medium | Graviton 2 | 2 | ~3.1 GiB | Small production |
| cache.r6g.large | Graviton 2 | 2 | ~13 GiB | Memory-optimized |
| cache.r6g.xlarge | Graviton 2 | 4 | ~26 GiB | Medium workloads |
| cache.r6g.2xlarge | Graviton 2 | 8 | ~53 GiB | Large workloads |
| cache.r7g.xlarge | Graviton 3 | 4 | ~26 GiB | Next-gen memory |
| cache.r7g.4xlarge | Graviton 3 | 16 | ~106 GiB | Very large workloads |

> Exact usable memory per node type is reserved/adjusted by ElastiCache and can change — verify current values in the [ElastiCache node type documentation](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/CacheNodes.SupportedTypes.html) before capacity planning. For variable or hard-to-predict workloads, consider **ElastiCache Serverless** instead of manually selecting node types.

### Sizing Guidelines

| Metric | Calculation | Recommendation |
|--------|-------------|----------------|
| **Dataset size** | Working set that fits in memory | Target 70-80% memory utilization |
| **Network capacity** | Requests/sec x avg payload | Monitor NetworkIn/NetworkOut |
| **CPU utilization** | Complex operations, serialization | Keep below 70% |
| **Connections** | Max connections per node | Monitor ConnectedOperations |

---

## Valkey / Redis OSS Architecture

### Deployment Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Cluster Mode Disabled** | Single shard, primary + up to 5 replicas, Multi-AZ | Simplicity, HA, smaller datasets |
| **Cluster Mode Enabled** | Sharded, auto-resharding | Large datasets, high throughput |
| **ElastiCache Serverless** | Fully managed, scales capacity automatically, no node/shard management | Unpredictable or spiky workloads, minimal ops overhead |
| **Memcached** | Multi-node, application-managed sharding | Simple caching |

```mermaid
graph TB
    subgraph "Redis Cluster"
      subgraph "Shard 1 (Slots 0-5460)"
        P1["Primary Node 1"]
        R1["Replica Node 1"]
        P1 --> R1
      end
      subgraph "Shard 2 (Slots 5461-10922)"
        P2["Primary Node 2"]
        R2["Replica Node 2"]
        P2 --> R2
      end
      subgraph "Shard 3 (Slots 10923-16383)"
        P3["Primary Node 3"]
        R3["Replica Node 3"]
        P3 --> R3
      end
    end
    Client["Cluster Client<br/>(Hash-based routing)"] --> P1
    Client --> P2
    Client --> P3
    style P1 fill:#2563eb,color:#fff
    style P2 fill:#2563eb,color:#fff
    style P3 fill:#2563eb,color:#fff
    style R1 fill:#16a34a,color:#fff
    style R2 fill:#16a34a,color:#fff
    style R3 fill:#16a34a,color:#fff
```

### Cluster Mode

| Feature | Description |
|---------|-------------|
| **Shards (Nodes Groups)** | Independent partitions of data |
| **Automatic resharding** | Add/remove shards without downtime |
| **Cross-slot operations** | Not supported (design keys carefully) |
| **Hash tags** | Force related keys to same slot |
| **Max shards** | Up to 500 per cluster (default quota 90; requires Valkey 7.2+ or Redis OSS 5.0.6+ for the higher limit) |

### Multi-AZ Configuration

| Setting | Description | Recommendation |
|---------|-------------|----------------|
| **Auto-failover** | Enable for HA | Always enable in production |
| **Number of replicas** | 1-5 per shard | Minimum 1 for HA |
| **Availability zones** | Automatic placement | Spread across AZs |
| **Preferred maintenance window** | Patching window | Low-traffic period |

---

## Performance Tuning

### Valkey/Redis OSS-Specific Tuning

| Parameter | Description | Recommendation |
|-----------|-------------|----------------|
| maxmemory-policy | Eviction policy | allkeys-lru for caches, noeviction for sessions |
| maxmemory | Memory limit | Set to 70-80% of node memory |
| timeout | Client connection timeout | 300 seconds |
| tcp-keepalive | Keep-alive interval | 300 seconds |
| hz | Redis background tasks frequency | 10 (default), increase for faster cleanup |
| activedefrag | Active defragmentation | Enable for large datasets |

### Connection Management

| Technique | Description | Benefit |
|-----------|-------------|---------|
| **Connection pooling** | Reuse connections | Reduce connection overhead |
| **Pipelining** | Send multiple commands without waiting | Higher throughput |
| **Cluster client** | Client-side routing | Transparent sharding |
| **Read replicas** | Route reads to replicas | Scale read throughput |
| **Client-side caching** | Cache in application memory | Reduce cache requests |

### Latency Optimization

| Factor | Impact | Mitigation |
|--------|--------|------------|
| **Network distance** | Higher latency | Place in same AZ as application |
| **Large values** | Higher serialization time | Compress, chunk large values |
| **Complex operations** | CPU-bound | Simplify data structures |
| **Eviction** | Memory pressure | Right-size, tune eviction policy |
| **AOF rewrite** | I/O spike | Schedule during low traffic |

---

## Persistence

### Valkey/Redis OSS Persistence Options

| Method | RPO | Performance Impact | Use Case |
|--------|-----|-------------------|----------|
| **RDB (snapshot)** | Last snapshot | Fork overhead | Point-in-time recovery |
| **AOF (append-only file)** | Last write (everysec) | Disk I/O on writes | Minimal data loss |
| **Both RDB + AOF** | Last write | Combined overhead | Maximum durability |
| **None** | None | None | Ephemeral cache only |

### Persistence Recommendations

| Scenario | RDB | AOF | Reason |
|----------|-----|-----|--------|
| **Cache (data can be rebuilt)** | Disabled | Disabled | No persistence needed |
| **Session store** | Enabled (hourly) | Enabled (everysec) | Balance durability and performance |
| **Critical data** | Enabled (frequent) | Enabled (everysec) | Maximum durability |
| **Leaderboard** | Enabled (daily) | Disabled | Accept some data loss |

---

## Security

### Security Checklist

| Control | Implementation | Priority |
|---------|---------------|----------|
| **VPC placement** | Private subnets only | CRITICAL |
| **Encryption at rest** | Enable with KMS | CRITICAL |
| **Encryption in transit** | TLS/SSL required | HIGH |
| **Auth token** | Set Valkey/Redis AUTH token (or use RBAC users) | HIGH |
| **Security groups** | Restrict to application SGs | HIGH |
| **Parameter group** | Disable dangerous commands | MEDIUM |
| **IAM auth** | Use IAM for ElastiCache API | MEDIUM |
| **Transit encryption** | Auth-enabled for TLS | HIGH |

### Dangerous Commands to Disable

| Command | Risk | Action |
|---------|------|--------|
| FLUSHDB | Delete all keys in database | Disable in parameter group |
| FLUSHALL | Delete all keys in all databases | Disable in parameter group |
| KEYS | Block server during execution | Disable, use SCAN instead |
| DEBUG | Debug commands | Disable in production |
| CONFIG | Modify runtime config | Disable in production |

---

## Monitoring

### Key Metrics

| Metric | Warning | Critical | Description |
|--------|---------|----------|-------------|
| CurrConnections | > 70% max | > 90% max | Active connections |
| FreeableMemory | < 20% | < 10% | Available memory |
| UsedMemoryBytes | > 70% max | > 85% max | Memory utilization |
| CPUUtilization | > 70% | > 90% | CPU usage |
| GetHitRate (Memcached) / CacheHits (Redis) | < 80% | < 50% | Cache hit ratio (metric name varies by engine) |
| GetLatencyUs | > 1,000 us | > 5,000 us | Read latency |
| SetLatencyUs | > 1,000 us | > 5,000 us | Write latency |
| NetworkOut | Baseline + 2σ | Baseline + 3σ | Outbound traffic |
| ReplicationLag | > 1 sec | > 10 sec | Replica lag (Redis) |
| SwapUsage | > 0 | > 10% | Swap usage (bad sign) |

### Cache Hit Rate Analysis

| Hit Rate | Assessment | Action |
|----------|-----------|--------|
| > 95% | Excellent | Optimal cache usage |
| 80-95% | Good | Monitor for trends |
| 50-80% | Fair | Review cache strategy, TTLs |
| < 50% | Poor | Cache thrashing, review architecture |

---

## Cost Optimization

| Strategy | Description | Potential Savings |
|----------|-------------|-------------------|
| **Right-sizing** | Match node type to workload | 20-50% |
| **Reserved Nodes** | 1 or 3-year commitment | Up to 70% |
| **Savings Plans** | Compute commitment | Up to 65% |
| **Graviton nodes** | ARM-based instances | 20% better price/performance |
| **Choose Valkey over Redis OSS** | Valkey pricing is lower than other supported engines for equivalent nodes/Serverless | Lower per-node and Serverless cost |
| **Reduce replicas** | Minimum needed for HA | Per-node cost |
| **Tuning hit rate** | Higher hit rate = fewer source queries | Indirect DB cost savings |
| **Sharding** | Add/remove shards to distribute load | Growing datasets |
| **ElastiCache Serverless** | Pay only for consumed cache/ECPUs | Avoids over-provisioning for spiky/unknown workloads |

---

## Data Consistency Patterns

### Cache-Aside Pattern

| Step | Action | Description |
|------|--------|-------------|
| 1 | Check cache | GET key from ElastiCache |
| 2 | Cache hit | Return cached value |
| 3 | Cache miss | Query database |
| 4 | Populate cache | SET key with DB value + TTL |
| 5 | Return value | Return to application |

### Write-Through Pattern

| Step | Action | Description |
|------|--------|-------------|
| 1 | Write to cache | SET key in ElastiCache |
| 2 | Write to database | Persist to source of truth |
| 3 | Return result | Confirm write success |

### Pattern Comparison

| Pattern | Read Performance | Write Performance | Consistency | Complexity |
|---------|-----------------|-------------------|-------------|------------|
| **Cache-Aside** | Good (after first miss) | Good | Eventual | Low |
| **Write-Through** | Excellent | Slower writes | Stronger | Medium |
| **Write-Behind** | Excellent | Fast writes | Eventual | High |
| **Read-Through** | Excellent | Good | Medium | Medium |

```mermaid
graph TB
    subgraph "Cache-Aside"
      A1["Application"] --> A2{"GET Cache?"}
      A2 -->|Hit| A3["Return Cache Value"]
      A2 -->|Miss| A4["Query Database"]
      A4 --> A5["SET Cache + TTL"]
      A5 --> A6["Return Value"]
    end
    subgraph "Write-Through"
      W1["Application"] --> W2["Write to Cache"]
      W2 --> W3["Write to Database"]
      W3 --> W4["Confirm Success"]
    end
    subgraph "Write-Behind"
      B1["Application"] --> B2["Write to Cache"]
      B2 --> B3["Async Background Process"]
      B3 --> B4["Batch Write to Database"]
      B2 --> B5["Return Immediately"]
    end
    style A2 fill:#f59e0b,color:#000
    style W2 fill:#2563eb,color:#fff
    style B2 fill:#2563eb,color:#fff
    style B3 fill:#d97706,color:#fff
```

---

## Cross-Service Integration

| Service | Integration | Purpose |
|---------|------------|---------|
| Lambda | ElastiCache client | Serverless caching |
| MSK | Redis Streams consumer | Message processing |
| CloudWatch | Metrics, alarms | Monitoring |
| Systems Manager | Parameter Store for config | Centralized configuration |
| Secrets Manager | Auth token management | Secure credential storage |

---

## Global Datastore & Serverless

| Feature | Description |
|---------|-------------|
| **Global Datastore** | Cross-region replication for Valkey/Redis OSS clusters; near-real-time, asynchronous replication for disaster recovery and low-latency global reads |
| **ElastiCache Serverless** | On-demand capacity (compute + memory) that scales automatically per workload; supports Valkey, Redis OSS, and Memcached; no node/shard sizing required |
