# EventBridge Best Practices

## Architecture

### EventBus Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Default Event Bus** | Receives events from AWS services | Standard event processing |
| **Custom Event Bus** | User-created, isolated | Application-specific events |
| **Partner Event Bus** | SaaS partner events | Third-party integration |
| **Archive** | Store events for replay | Debugging, compliance |
| **Replay** | Re-process archived events | Recovery, testing |

### Event Routing

| Component | Description | Direction |
|-----------|-------------|-----------|
| **Event Source** | Produces events | Inbound to bus |
| **Event Bus** | Routes events | Central hub |
| **Rule** | Matches and routes events | Pattern matching |
| **Target** | Receives routed events | Outbound from bus |

```mermaid
flowchart LR
    subgraph Sources["Event Sources"]
        S1[AWS Services]
        S2[Custom Apps]
        S3[SaaS Partners]
        S4[Scheduled Rules]
    end

    subgraph EventBus["Event Bus"]
        EB[Event Bus]
    end

    subgraph Rules["Event Rules"]
        R1[Rule 1\nPattern Match]
        R2[Rule 2\nPattern Match]
        R3[Rule N\nPattern Match]
    end

    subgraph Targets["Targets"]
        T1[Lambda]
        T2[SQS]
        T3[SNS]
        T4[Step Functions]
        T5[Kinesis]
    end

    S1 --> EB
    S2 --> EB
    S3 --> EB
    S4 --> EB
    EB --> R1
    EB --> R2
    EB --> R3
    R1 --> T1
    R2 --> T2
    R3 --> T3
    R1 --> T4
    R2 --> T5
```

---

## Event Pattern Design

### Pattern Matching

| Field | Operators | Description |
|-------|-----------|-------------|
| account | =, != | AWS account ID |
| time | =, !=, >, <, >=, <= | Event timestamp |
| region | =, != | AWS region |
| source | =, !=, begins-with | Event source |
| detail-type | =, !=, begins-with | Event type |
| resources | =, !=, begins-with | Resource ARNs |
| detail | =, !=, >, <, exists | Custom event data |

### Event Design Guidelines

| Guideline | Description | Example |
|-----------|-------------|---------|
| **Consistent format** | Standardize event structure | id, source, time, type, detail |
| **Include correlation ID** | Trace across services | UUID in detail |
| **Version events** | Handle schema changes | version field in detail |
| **Minimal data** | Only necessary fields | Avoid large payloads |
| **Idempotent targets** | Safe to replay | Deduplication logic |
| **Meaningful detail-type** | Easy filtering | "Order Created", "User Updated" |

---

## Rules

### Rule Configuration

| Setting | Recommendation | Reason |
|---------|---------------|--------|
| **Rule name** | Descriptive, prefixed by domain | Easy identification |
| **Event pattern** | Specific enough to avoid noise | Reduce unnecessary processing |
| **Schedule** | Cron or rate for periodic events | Scheduled tasks |
| **Target retry** | Default 24 hours / up to 185 attempts (configurable, max 24 hours) | Retry window |
| **Dead-letter queue** | Always configure | Capture permanent failures |
| **Input transformer** | Transform before target | Reduce target complexity |

### Rule Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Event pattern** | Match incoming events | Event-driven processing |
| **Schedule (rate)** | Fixed interval | Periodic tasks |
| **Schedule (cron)** | Cron expression | Complex schedules |

---

## Targets

### Supported Targets

| Target | Description | Configuration |
|--------|-------------|---------------|
| **Lambda** | Invoke function | Function ARN, qualifier |
| **SQS** | Send message | Queue ARN, group ID (FIFO) |
| **SNS** | Publish notification | Topic ARN |
| **Step Functions** | Start state machine | State machine ARN |
| **EC2** | Run instances | Instance IDs |
| **Kinesis** | Put record | Stream ARN |
| **CodeBuild** | Start build | Project name |
| **Grafana** | Send metric | Workspace ID |

### Target Configuration

| Setting | Recommendation |
|---------|---------------|
| **Retry policy** | Use default (24 hours / 185 attempts) or tune MaximumEventAgeInSeconds and MaximumRetryAttempts |
| **Dead-letter queue** | Always configure SQS DLQ |
| **Input path** | Transform event before sending |
| **Input transformer** | Extract specific fields |
| **HttpParameters** | For API destinations |

---

## Error Handling

### Retry Behavior

| Target | Retry Duration | Backoff | Notes |
|--------|---------------|---------|-------|
| Lambda | Up to 24 hours / 185 attempts | Exponential | Configurable DLQ |
| SQS | Up to 24 hours / 185 attempts | Exponential | Queue handles retries |
| SNS | Up to 24 hours / 185 attempts | Exponential | Subscribers handle retries |
| Step Functions | Up to 24 hours / 185 attempts | Exponential | Execution handles retries |
| Kinesis | Up to 24 hours / 185 attempts | Exponential | Stream handles retries |
> **Note:** 24 hours / 185 attempts is the maximum configurable retry policy on a rule target (default matches the maximum); can be reduced per target. |

### Dead-Letter Queue

| Setting | Recommendation |
|---------|---------------|
| **Always configure DLQ** | For all rules with Lambda targets |
| **DLQ retention** | Match compliance requirements |
| **DLQ monitoring** | Alert on messages in DLQ |
| **DLQ processing** | Lambda to process DLQ messages |

---

## Schema Registry

### Event Schema Management

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Schema discovery** | Auto-discover event schemas | Event catalog |
| **Schema registry** | Store and version schemas | Schema governance |
| **Code generation** | Generate SDK code | Type-safe event handling |
| **Schema validation** | Validate events against schema | Data quality |

---

## Pipes

### EventBridge Pipes

EventBridge Pipes is a point-to-point integration service for connecting a single source (SQS, Kinesis, DynamoDB Streams, MSK, Amazon MQ) to a single target, with optional filtering, enrichment, and transformation in between. It is distinct from event bus rules, which fan out matched events to multiple targets.

| Component | Description |
|-----------|-------------|
| **Source** | Poller-based source (SQS, Kinesis, DynamoDB Streams, MSK, Amazon MQ) |
| **Filtering** | Drop events before processing (no cost for filtered-out events) |
| **Enrichment** | Add data (Lambda, Step Functions, API Destinations, API Gateway) |
| **Target** | Any EventBridge-supported target |
| **Parameters** | Configuration |

```mermaid
flowchart LR
    A[Source\nSQS/Kinesis/DynamoDB Streams] --> B[Filter]
    B --> C[Enrichment\nLambda/Step Functions/API Destination]
    C --> D[Target]
    D --> F1[Lambda]
    D --> F2[SQS]
    D --> F3[SNS]
    D --> F4[Step Functions]
    D --> F5[Kinesis]
```

### Pipes Use Cases

| Use Case | Components | Description |
|----------|-----------|-------------|
| **Data enrichment** | Source + Enrichment + Target | Add context to events |
| **Format transformation** | Source + Filter + Target | Convert event format |
| **Filtering** | Source + Filter + Target | Filter events before target |
| **Point-to-point streaming** | Source + Target | Move stream records to a target without writing custom polling code |

---

## Scheduler

### EventBridge Scheduler

EventBridge Scheduler is a dedicated scheduling service, separate from schedule-based rules on an event bus. Prefer it over scheduled rules for most new scheduling needs.

| Feature | Description |
|---------|-------------|
| **Scale** | Supports far more schedules per account/Region than the ~300 rule limit per event bus |
| **One-time schedules** | Native support, with automatic cleanup after invocation (`ActionAfterCompletion`) |
| **Recurring schedules** | Cron or rate expressions, with time zone and daylight-saving support |
| **Targets** | 270+ AWS API actions via universal targets, in addition to common targets (Lambda, SQS, Step Functions) |
| **Flexible time windows** | Spread invocations over a window to smooth load |
| **Retry/DLQ** | Configurable retry policy and dead-letter queue per schedule |

| When to Use | Recommendation |
|-------------|---------------|
| **High volume of schedules** | EventBridge Scheduler (avoids per-bus rule limits) |
| **One-time future task** | EventBridge Scheduler |
| **Simple periodic rule tied to existing bus rules** | Scheduled (cron/rate) rule on event bus |

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|----------------|
| IncomingEvents | Events received by bus | Sudden drop/spike |
| FailedEvents | Events that failed delivery | > 0 sustained |
| DeletedEvents | Events deleted from archive | Monitor for cleanup |
| ReplayedEvents | Events from replay | During replay operations |
| PublishedEvents | Events sent to targets | Match incoming events |
| MatchedEvents | Events matching rules | Validate rule patterns |

### Best Practices

| Practice | Description |
|----------|-------------|
| **Monitor DLQ** | Alert on messages in dead-letter queues |
| **Track latency** | Time from event to target processing |
| **Archive critical events** | For debugging and compliance |
| **Use X-Ray** | For distributed tracing |
| **CloudWatch Logs** | For rule evaluation logs |

---

## Cost Optimization

| Strategy | Description | Potential Savings |
|----------|-------------|-------------------|
| **Specific event patterns** | Reduce unnecessary rule matches | Lower target invocations |
| **Right-size archives** | Set retention period | Storage cost reduction |
| **Custom buses** | Isolate high-volume events | Better cost tracking |
| **Input transformers** | Reduce payload to targets | Lower target costs |
| **Batch targets** | SQS batching | Fewer target invocations |

### Pricing

| Component | Price |
|-----------|-------|
| **Events put** | $1.00 per 1M events |
| **Events matched** | $1.00 per 1M events |
| **Archive storage** | $0.50 per GB-month |
| **Replay** | $1.00 per 1M events |
| **Schema registry** | $1.00 per 1M API calls |
| **Pipes** | $0.40 per 1M events processed (cheaper than event bus for point-to-point) |
| **Scheduler** | $1.00 per 1M invocations (first 14M/month free) |

---

## Cross-Service Integration

| Service | Integration | Purpose |
|---------|------------|---------|
| Lambda | Primary target | Event processing |
| SQS | Decoupled processing | Reliable message delivery |
| SNS | Fan-out notifications | Multiple subscribers |
| Step Functions | Workflow orchestration | Complex workflows |
| S3 | Event source | Object change events |
| Kinesis | Stream processing | Real-time data |
| CodePipeline | CI/CD triggers | Automated deployments |
