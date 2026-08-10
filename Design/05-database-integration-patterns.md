# Database Integration Patterns

## Overview

Database integration with serverless services requires careful consideration of connection management, scaling behavior, and data consistency. This document covers best practices for connecting Lambda, SNS, and SQS with AWS database services.

---

## Table of Contents

- [Database Service Selection Matrix](#database-service-selection-matrix)
- [Pattern 1: Lambda + DynamoDB Direct Integration](#pattern-1-lambda--dynamodb-direct-integration)
- [Pattern 2: Lambda + RDS via RDS Proxy](#pattern-2-lambda--rds-via-rds-proxy)
- [Pattern 3: DynamoDB Trigger Pipeline](#pattern-3-dynamodb-trigger-pipeline)
- [Pattern 4: CQRS with DynamoDB + Event Sourcing](#pattern-4-cqrs-with-dynamodb--event-sourcing)
- [Pattern 5: Multi-Region Database Architecture](#pattern-5-multi-region-database-architecture)
- [Pattern 6: Database Connection Management for Lambda](#pattern-6-database-connection-management-for-lambda)
- [Pattern 7: SQS + Database Transactional Outbox](#pattern-7-sqs--database-transactional-outbox)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Database Service Selection Matrix

How AWS's database services compare for Lambda integration, connection model, and typical fit.

| Database | Type | Best For | Lambda Integration | Connection Model |
|----------|------|----------|-------------------|-----------------|
| **DynamoDB** | NoSQL Key-Value | Low-latency, high-scale, simple queries | Native trigger, SDK | HTTP (no connections) |
| **Aurora Serverless v2** | Relational (MySQL/PostgreSQL) | Complex queries, transactions, schema | RDS Proxy required | Connection pooling |
| **RDS** | Relational | Known scale, compliance | RDS Proxy required | Connection pooling |
| **Aurora Global DB** | Relational (multi-region) | Global read, disaster recovery | RDS Proxy per region | Connection pooling |
| **DocumentDB** | Document (MongoDB compat) | Document storage, flexible schema | Built-in connection pooling | Enhanced networking |
| **Neptune** | Graph | Relationship queries, graphs | Direct SDK (HTTP) | HTTP connections (Gremlin/SPARQL) |
| **ElastiCache** | In-memory cache | Caching, session store | Direct SDK | Connection pooling |
| **Redshift Serverless** | Data warehouse | Analytics, BI | Direct SDK | Connection pooling |
| **Timestream** | Time-series | IoT, metrics, logs | Direct SDK | HTTP (no connections) |

---

## Pattern 1: Lambda + DynamoDB Direct Integration

The simplest and most performant integration for NoSQL workloads.

```mermaid
graph TB
    subgraph "Write Path"
        A[API Gateway] --> B[Lambda<br/>Write Handler]
        B -->|PutItem / UpdateItem| C[(DynamoDB<br/>Orders Table)]
        C -->|DynamoDB Stream| D[DynamoDB Stream]
    end
    
    subgraph "Read Path"
        E[API Gateway] --> F[Lambda<br/>Read Handler]
        F -->|GetItem / Query| C
        F -->|DAX Cache| G[DAX Cluster<br/>Optional Cache Layer]
    end
    
    subgraph "Event Processing"
        D -->|Stream Trigger| H[Lambda<br/>Stream Processor]
        H -->|Transform| I[SNS Topic<br/>order-events]
        I --> J[SQS Queue<br/>downstream-queue]
        J -->|Poll| K[Lambda<br/>Downstream Worker]
    end
```

### Why This Pattern?

DynamoDB's HTTP-based API means Lambda never holds a stateful connection, so there is no connection pool to exhaust and no cold-start penalty from establishing a database session — each invocation just signs and sends a request over the SDK's shared HTTP client. This removes the entire class of concurrency-scaling problems that come with relational databases: a burst to thousands of concurrent Lambda executions doesn't threaten a fixed connection limit, and there's no proxy tier to size or operate. The tight coupling of API Gateway, Lambda, and DynamoDB with Streams also gives a built-in way to fan out change events without polling or building custom notification logic.

**Trade-off:** you give up SQL joins, ad hoc query flexibility, and multi-table transactions with arbitrary predicates — every access pattern has to be designed up front around partition/sort keys and GSIs, and retrofitting a new query shape later often means a table redesign or a costly Scan. If the workload needs relational integrity, complex reporting queries, or schema flexibility for evolving query patterns, this pattern forces expensive rework rather than a config change.

### DynamoDB Best Practices with Lambda

Recommended DynamoDB settings and features to use when paired with Lambda.

| Practice | Detail |
|----------|--------|
| **Use Provisioned + Auto Scaling** | Predictable cost, burst capacity for spikes |
| **Consider On-Demand mode** | Better for unpredictable workloads; pay-per-request, no capacity planning |
| **Enable DynamoDB Streams** | For event-driven downstream processing |
| **Use PartiQL** | SQL-like queries without schema changes |
| **Set TTL** | Automatic expiration for temporary data |
| **Use TransactWriteItems** | Multi-item atomic writes (up to 100 actions, raised from 25 in Sep 2022; aggregate item size ≤ 4 MB) |
| **Batch Write** | BatchWriteItems for bulk operations (25 items/batch) |
| **Use DAX** | For read-heavy workloads (10x read performance) |

### DynamoDB Stream Trigger Configuration

Key event source mapping parameters for a DynamoDB Streams trigger.

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `BatchSize` | 1-1000 | Records per invocation |
| `MaximumBatchingWindowInSeconds` | 0-300s | Buffer for larger batches |
| `StartingPosition` | `LATEST` / `TRIM_HORIZON` | Where to start reading |
| `MaximumRetryAttempts` | 0-18,000 | Retries on processing failure (DynamoDB Streams: 0-18,000; SQS: 0-10,000) |
| `FunctionResponseTypes` | `ReportBatchItemFailures` | Partial batch failure reporting |

### DynamoDB Stream Handler Example

```python
import boto3

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    for record in event['Records']:
        event_name = record['eventName']  # INSERT, MODIFY, REMOVE
        old_image = record.get('dynamodb', {}).get('OldImage')
        new_image = record.get('dynamodb', {}).get('NewImage')
        
        if event_name == 'INSERT':
            process_new_item(new_image)
        elif event_name == 'MODIFY':
            process_update(old_image, new_image)
        elif event_name == 'REMOVE':
            process_deletion(old_image)
    
    # For partial batch failure:
    # return {
    #     'batchItemFailures': [
    #         {'itemIdentifier': 'failed-record-id'}
    #     ]
    # }
```

---

## Pattern 2: Lambda + RDS via RDS Proxy

RDS Proxy is essential for Lambda-to-RDS connections to prevent connection exhaustion.

```mermaid
graph TB
    subgraph "VPC"
        subgraph "Public Subnet"
            A[API Gateway<br/>VPC Link]
        end
        
        subgraph "Private Subnet A"
            B[Lambda Function<br/>us-east-1a]
            C[RDS Proxy Endpoint]
        end
        
        subgraph "Private Subnet B"
            D[Lambda Function<br/>us-east-1b]
        end
        
        subgraph "RDS Subnet Group"
            E[Aurora Primary<br/>Writer]
            F[Aurora Replica<br/>Reader 1]
            G[Aurora Replica<br/>Reader 2]
        end
    end
    
    A --> B
    B -->|Connections| C
    D -->|Connections| C
    C -->|Pooled Connections| E
    C -->|Read Queries| F
    C -->|Read Queries| G
    
    subgraph "Connection Pool"
        H[Idle Connection Cache]
        I[Max Connections: 100]
        J[Connection Borrows: 1000+]
    end
```

### Why This Pattern?

Relational databases cap the number of simultaneous connections (RDS/Aurora `max_connections` is typically in the hundreds, sized to instance memory), but Lambda scales by running many concurrent, independent execution environments — each one opening its own connection if it talks to the database directly. A traffic spike that pushes Lambda to a few hundred concurrent invocations can open more connections than the database allows in seconds, causing "too many connections" errors for every client, not just the Lambda functions that caused the spike. RDS Proxy sits in front of the database and multiplexes many Lambda-side connections onto a much smaller, stable pool of physical database connections, decoupling Lambda's concurrency from the database's hard connection ceiling.

**Trade-off:** the proxy is an additional managed component with its own cost (billed per vCPU-hour of the underlying instances it provisions) and adds a small amount of latency to every query since traffic now hops through the proxy instead of going straight to the database. It also doesn't eliminate the need for query-level tuning — a proxy with a saturated pool still queues or rejects borrow requests, it just moves the bottleneck from "database connection limit" to "proxy pool size," which still needs to be sized against realistic peak concurrency.

### RDS Proxy Configuration

Key RDS Proxy settings and the reasoning behind each.

| Setting | Value | Rationale |
|---------|-------|-----------|
| `Idle Timeout` | 10-120s | Balance between reuse and freshness |
| `Max Connections` | 50-200 | Don't exceed RDS `max_connections` |
| `DB Idle Timeout` | 5-30s | Close idle DB connections |
| `TLS` | Required | Encrypt proxy-to-database traffic |
| `Auth Scheme` | Secrets Manager | Automatic password rotation |

### Lambda + RDS Proxy Example

```python
import pg8000
import os

# Reuse connection across invocations (outside handler)
db_pool = None

def get_connection():
    global db_pool
    if db_pool is None:
        db_pool = pg8000.dbapi.connect(
            host=os.environ['RDS_PROXY_ENDPOINT'],
            port=5432,
            database=os.environ['DB_NAME'],
            user=os.environ['DB_USER'],
            password=os.environ['DB_PASSWORD']  # From Secrets Manager
        )
    return db_pool

def lambda_handler(event, context):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM orders WHERE id = %s", [event['orderId']])
        return {'order': cur.fetchone()}
```

### Lambda Connection Reuse

In addition to RDS Proxy, reuse connections by keeping the DB client outside the handler function. The execution environment is often reused across invocations, making the connection effectively cached. However, RDS Proxy remains essential for high-concurrency scenarios.

### Lambda VPC Configuration

Networking settings to configure when a Lambda function needs VPC access to RDS.

| Setting | Value | Purpose |
|---------|-------|---------|
| `VPC Subnets` | 2+ AZs | High availability |
| `Security Groups` | Minimal egress | Least privilege |
| `VPC Endpoints` | For S3, DynamoDB | Avoid NAT Gateway costs |
| `Cold Start Mitigation` | Provisioned Concurrency | Keep VPC connections warm |

---

## Pattern 3: DynamoDB Trigger Pipeline

Using DynamoDB Streams to drive event-driven processing pipelines.

```mermaid
graph LR
    A[API / Lambda<br/>Write Data] -->|Put/Update/Delete| B[(DynamoDB Table)]
    B -->|Stream Enabled| C[DynamoDB Stream<br/>NEW_IMAGE / OLD_IMAGE]
    C -->|Stream Trigger| D{Lambda Processor<br/>Batch: 100}
    
    D -->|INSERT events| E[SNS Topic<br/>new-items]
    D -->|MODIFY events| F[SNS Topic<br/>updated-items]
    D -->|REMOVE events| G[SNS Topic<br/>deleted-items]
    
    E --> H[Lambda<br/>Search Indexer]
    F --> I[Lambda<br/>Cache Invalidation]
    G --> J[Lambda<br/>Cleanup Handler]
    
    H --> K[(OpenSearch)]
    I --> L[(ElastiCache Redis)]
    J --> M[S3<br/>Archive Bucket]
```

### Why This Pattern?

Without a change feed, keeping downstream systems (search indexes, caches, archives) in sync with a DynamoDB table means every write path has to remember to also update every consumer, or the application has to poll the table for changes — both approaches drift out of sync as new consumers are added or a write path is missed. DynamoDB Streams captures every item-level mutation in commit order and delivers it exactly once per shard to a trigger, so cache invalidation, search indexing, and archival become independent, decoupled subscribers to a single source of truth instead of code paths the write handler has to know about and call directly.

**Trade-off:** stream records expire after 24 hours, so a downstream consumer that's down or backlogged past that window permanently loses those change events with no replay mechanism beyond re-reading the table state; the fan-out via SNS/SQS also adds delivery latency (typically sub-second, but not instantaneous) between the write and the consumer seeing it, so this pattern is unsuitable for anything that needs the update to be immediately visible to a downstream read.

### Stream View Types

What each DynamoDB Streams view type includes, and when to pick it.

| View Type | Contents | Use Case |
|-----------|----------|----------|
| `KEYS_ONLY` | Primary key only | Trigger processing, key-based lookup |
| `NEW_IMAGE` | Full record after write | Downstream processing with new data |
| `OLD_IMAGE` | Full record before write | Audit trail, change detection |
| `NEW_AND_OLD_IMAGES` | Both before and after | Diff computation, full audit |

### EventBridge Pipes Alternative

EventBridge Pipes can route DynamoDB Streams directly to SQS, SNS, Lambda, or HTTP endpoints without a Lambda function. Useful for simple routing without compute overhead.

### When to Use DynamoDB Streams

- Use when you need to react to data changes in real-time
- Use for audit trails, cache invalidation, search indexing
- Don't use for high-throughput ordered streaming — consider Kinesis Data Streams

---

## Pattern 4: CQRS with DynamoDB + Event Sourcing

Command Query Responsibility Segregation for complex domains.

```mermaid
graph TB
    subgraph "Command Side (Writes)"
        A[API Gateway] --> B[Lambda<br/>Command Handler]
        B -->|Validate| C[(DynamoDB<br/>Events Table)]
        C -->|Stream| D[DynamoDB Stream]
    end
    
    subgraph "Event Processing"
        D --> E[Lambda<br/>Event Processor]
        E -->|Project| F[(DynamoDB<br/>Read Model)]
        E -->|Publish| G[SNS Topic<br/>domain-events]
    end
    
    subgraph "Query Side (Reads)"
        H[API Gateway] --> I[Lambda<br/>Query Handler]
        I -->|Read Optimized| F
        I -->|Cache| J[(DynamoDB DAX)]
    end
    
    subgraph "Event Consumers"
        G --> K[Lambda<br/>Notification]
        G --> L[SQS Queue<br/>Analytics]
        G --> M[Lambda<br/>Audit Log]
    end
```

### Why This Pattern?

A single DynamoDB table optimized for writes forces reads to either scan/filter inefficiently or bolt on GSIs that don't match every query shape the application eventually needs, and neither approach preserves a full history of how an item reached its current state — once a write overwrites an attribute, the prior value is gone unless captured separately. CQRS with event sourcing solves both problems by treating the events table as the append-only system of record and letting a stream processor build separate, purpose-built read models for each query pattern; the write path never has to be redesigned to serve a new report or view, and the event log itself is the audit trail.

**Trade-off:** the read models are only eventually consistent with the command side — a client that writes and immediately reads its own write may see stale data until the stream processor catches up — and the system now has two data stores to keep schema-compatible and operationally healthy instead of one. Rebuilding a read model after a bug fix means replaying the entire event history, which for a large `Events` table is a non-trivial batch job, not a quick migration.

### CQRS Table Design

DynamoDB tables used in this CQRS setup, their GSIs, and the access pattern each serves.

| Table | Purpose | GSI | Access Pattern |
|-------|---------|-----|---------------|
| `Events` | Event store (append-only) | ByAggregateId, ByEventType | Sequential writes, query by aggregate |
| `ReadModel` | Optimized read views | Multiple GSIs | High-read queries |
| `Projections` | Materialized views | ByEntityType | Denormalized reads |

### When to Use CQRS with Event Sourcing

- Use when you need full audit trail of all state changes
- Use when read and write access patterns differ significantly
- Use for complex domains with multiple read views
- Don't use for simple CRUD — direct database access is simpler

---

## Pattern 5: Multi-Region Database Architecture

For global applications requiring low-latency reads and disaster recovery.

```mermaid
graph TB
    subgraph "Primary Region: us-east-1"
        A1[API Gateway] --> B1[Lambda]
        B1 --> C1[(Aurora Primary)]
        C1 -->|Async Replication| D1[(Aurora Replica)]
        B1 -->|Writes| E1[(DynamoDB Global Table)]
    end
    
    subgraph "Secondary Region: eu-west-1"
        A2[API Gateway] --> B2[Lambda]
        B2 -->|Reads Only| D2[(Aurora Read Replica)]
        B2 -->|Reads/Writes| E2[(DynamoDB Global Table)]
    end
    
    subgraph "Global Services"
        E1 <-->|Cross-Region Sync| E2
        F[Route 53<br/>Failover Routing]
        G[CloudFront<br/>Edge Cache]
    end
    
    F --> A1
    F --> A2
    G --> A1
    G --> A2
```

### Why This Pattern?

A single-region database ties every user's latency to the distance from that region, and a regional outage takes the entire application down with no failover path — for a global user base or an availability SLA that requires surviving a region-level event, that's a single point of failure the business can't accept. Distributing data across regions (via DynamoDB Global Tables' multi-master replication or Aurora Global Database's fast cross-region replicas) lets reads happen close to the user and gives the application a standby region to fail over to, turning a regional AWS event into a bounded RPO/RTO incident instead of a full outage.

**Trade-off:** multi-region replication is asynchronous, so writes made in one region are not immediately visible in another, and concurrent writes to the same item in different regions (with Global Tables) are resolved by last-writer-wins, which can silently discard one of two conflicting updates. Aurora Global Database restricts writes to a single primary region, so failover to a secondary region requires a promotion step and a brief write-unavailability window — this pattern buys resilience and read locality at the cost of strict consistency and added replication cost, and isn't worth the complexity for an application that only serves one region.

### Multi-Region Database Options

Replication model and typical RPO/RTO/latency for each multi-region database option.

| Service | Replication | RPO | RTO | Read Latency | Write Latency |
|---------|------------|-----|-----|-------------|---------------|
| **DynamoDB Global Tables** | Multi-master, active-active | ~0s | ~0s | Local | Local |
| **Aurora Global DB** | Single-master, active-passive | <1s | <1min | Local (read) | Cross-region (write) |
| **Aurora Cross-Region Read Replica** | Async replication | Variable | Manual failover | Local | N/A (read-only) |
| **DocumentDB Global Cluster** | Multi-region, active-passive | <1s | <3min | Local (read) | Primary region (write) |

### Backup & Recovery

Backup method, point-in-time recovery, and cross-region support by database service.

| Service | Backup Method | PITR | Cross-Region |
|---------|-------------|------|--------------|
| **DynamoDB** | On-demand + continuous backups | Yes (up to 35 days) | Yes (cross-region backup) |
| **Aurora** | Automated snapshots + binlog | Yes (up to 35 days) | Yes (copy snapshots) |
| **RDS** | Automated + on-demand snapshots | Yes (up to 35 days) | Yes (copy snapshots) |
| **DocumentDB** | Continuous backups | Yes (up to 35 days) | No (manual export) |

### When to Use Multi-Region

- Use for global applications requiring low-latency reads worldwide
- Use for disaster recovery with defined RPO/RTO targets
- Don't use for single-region applications — adds complexity and cost

---

## Pattern 6: Database Connection Management for Lambda

Critical pattern to avoid connection exhaustion under high concurrency.

```mermaid
graph TB
    subgraph "Without RDS Proxy - Anti-Pattern"
        A1[Lambda Instance 1] -->|New Connection| DB1[(RDS)]
        A2[Lambda Instance 2] -->|New Connection| DB1
        A3[Lambda Instance 3] -->|New Connection| DB1
        A4[Lambda Instance N] -->|New Connection| DB1
        DB1 --> X[CONNECTION EXHAUSTED<br/>Error: too many connections]
    end
    
    subgraph "With RDS Proxy - Best Practice"
        B1[Lambda Instance 1] -->|Borrow Connection| P[RDS Proxy<br/>Connection Pool]
        B2[Lambda Instance 2] -->|Borrow Connection| P
        B3[Lambda Instance 3] -->|Borrow Connection| P
        B4[Lambda Instance N] -->|Borrow Connection| P
        P -->|Pooled: 100 connections| DB2[(RDS)]
        DB2 --> Y[HEALTHY<br/>Connections managed efficiently]
    end
```

### Why This Pattern?

Lambda's execution model — many short-lived, independently scaled execution environments — is fundamentally at odds with how relational databases manage connections: each environment that opens its own connection holds it for the lifetime of that environment, and a scale-out event can create far more simultaneous connections than the database's `max_connections` setting allows, producing outright connection errors rather than degraded performance. This is not a tuning problem that goes away with a bigger instance class; it's a structural mismatch between Lambda's concurrency model and a database's fixed connection budget, and it shows up precisely when the application is under the load it most needs to handle. Pooling connections behind RDS Proxy (or, for less extreme concurrency, disciplined connection reuse across warm invocations) is what keeps the number of physical database connections bounded regardless of how many Lambda instances are running.

**Trade-off:** connection reuse across invocations is opportunistic, not guaranteed — a connection held in global scope only survives if the execution environment is reused, so under highly variable or spiky traffic a meaningful fraction of invocations still pay the connection-establishment cost, and stale connections held across long idle periods can fail silently on the next query. RDS Proxy closes that gap but becomes another component whose pool size, idle timeout, and failover behavior have to be tuned against the actual concurrency profile — it shifts the problem rather than making connection management a non-issue.

### Connection Lifecycle Comparison

How connection handling differs between Lambda connecting directly to RDS versus through RDS Proxy.

| Aspect | Without Proxy | With RDS Proxy |
|--------|--------------|----------------|
| Connections per Lambda | 1 (new each invocation) | Shared from pool |
| Cold start impact | Full connection overhead | Minimal (proxy is always on) |
| Max Lambda concurrency | Limited by RDS max_connections | Limited by proxy pool size |
| Connection reuse | No (Lambda ephemeral) | Yes (idle connection cache) |
| Failover support | Manual | Automatic (Aurora Cluster) |

### Lambda SnapStart (Java)

For Java-based Lambda functions connecting to databases, enable SnapStart to reduce cold start times from seconds to milliseconds. SnapStart takes a snapshot of the Lambda execution environment after initialization, replaying it on cold starts.

### When to Use RDS Proxy

- Use when Lambda concurrency > 50 (connection exhaustion risk)
- Use for Aurora failover support
- Use when connection establishment time impacts latency
- Don't use for low-concurrency workloads (<10 concurrent Lambdas) — direct connection is simpler

---

## Pattern 7: SQS + Database Transactional Outbox

Ensuring reliable message delivery with database transactions.

```mermaid
graph TB
    A[API Gateway] --> B[Lambda<br/>Order Service]
    
    subgraph "Transactional Outbox Pattern"
        B -->|Transaction 1| C[(DynamoDB<br/>Order Table)]
        B -->|Transaction 1| D[(DynamoDB<br/>Outbox Table)]
        D -->|Stream| E[DynamoDB Stream]
        E -->|Trigger| F[Lambda<br/>Outbox Processor]
        F -->|Publish| G[SQS Queue<br/>order-events]
        F -->|Delete from Outbox| D
    end
    
    G -->|Poll| H[Lambda<br/>Event Consumer]
    H -->|Process| I[(DynamoDB<br/>Inventory Table)]
```

### Outbox Table Design

DynamoDB schema for the outbox table that buffers events until they're safely published.

| Attribute | Type | Purpose |
|-----------|------|---------|
| `id` | String (PK) | Unique outbox record ID |
| `event_type` | String | Event type for routing |
| `event_data` | String (JSON) | Serialized event payload |
| `created_at` | Number | Timestamp for ordering |
| `status` | String | PENDING / PUBLISHED |
| `retry_count` | Number | Retry tracking |

### Why This Pattern?

Failure scenarios the transactional outbox pattern is designed to eliminate.

| Problem | Solution |
|---------|----------|
| Database write succeeds, message publish fails | Outbox record persists, processor retries |
| Message publish succeeds, database write fails | Transaction rolls back, no orphaned message |
| Consumer processes before database commit | Outbox only published after transaction completes |

### Outbox Processor Example

```python
import boto3

sqs = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')
outbox_table = dynamodb.Table('outbox')

def lambda_handler(event, context):
    published_ids = []
    
    for record in event['Records']:
        outbox_id = record['dynamodb']['NewImage']['id']['S']
        event_data = record['dynamodb']['NewImage']['event_data']['S']
        
        try:
            sqs.send_message(
                QueueUrl=os.environ['QUEUE_URL'],
                MessageBody=event_data
            )
            published_ids.append(outbox_id)
        except Exception as e:
            print(f"Failed to publish {outbox_id}: {e}")
            continue
    
    # Mark as published AFTER confirming SQS receipt
    for outbox_id in published_ids:
        outbox_table.update_item(
            Key={'id': outbox_id},
            UpdateExpression='SET #status = :published',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':published': 'PUBLISHED'}
        )
```

### When to Use Outbox Pattern

- Use when you need exactly-once message delivery with database transactions
- Use for event sourcing with reliable downstream notification
- Don't use for simple fire-and-forget — direct SQS send is simpler

---

## Anti-Patterns to Avoid

Common database integration mistakes and the fix for each.

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| **Direct Lambda → RDS without proxy** | Connection exhaustion at scale | Always use RDS Proxy |
| **Long Lambda DB connections** | Connection leak on timeout | Set connection timeout < Lambda timeout |
| **Synchronous cross-region DB calls** | High latency, timeout failures | Use async replication |
| **No database retry logic** | Transient failures cause data loss | Implement exponential backoff |
| **Storing secrets in Lambda env vars** | Security risk, rotation difficulty | Use Secrets Manager |
| **Scanning DynamoDB in Lambda** | High cost, slow performance | Use Query with proper indexes |
| **Large DynamoDB items** | 400 KB limit, expensive reads | Store large data in S3, reference in DynamoDB |
