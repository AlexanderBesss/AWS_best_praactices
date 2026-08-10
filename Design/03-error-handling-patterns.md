# Error Handling & Resilience Patterns

## Overview

Building resilient serverless architectures requires defense-in-depth error handling across all layers. This document covers retry strategies, circuit breakers, dead-letter queues, and chaos engineering patterns for AWS Lambda, SNS, and SQS.

---

## Table of Contents

- [Retry Strategy Matrix](#retry-strategy-matrix)
- [Pattern 1: Exponential Backoff with Jitter](#pattern-1-exponential-backoff-with-jitter)
- [Pattern 2: Multi-Layer Dead-Letter Queue Strategy](#pattern-2-multi-layer-dead-letter-queue-strategy)
- [Pattern 3: Circuit Breaker Pattern](#pattern-3-circuit-breaker-pattern)
- [Pattern 4: Idempotency Patterns](#pattern-4-idempotency-patterns)
- [Pattern 5: Bulkhead Pattern](#pattern-5-bulkhead-pattern)
- [Pattern 6: Graceful Degradation](#pattern-6-graceful-degradation)
- [Pattern 7: Chaos Engineering for Serverless](#pattern-7-chaos-engineering-for-serverless)
- [Comprehensive Error Handling Checklist](#comprehensive-error-handling-checklist)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Retry Strategy Matrix

| Service | Retry Mechanism | Default Behavior | Configurable Range |
|---------|----------------|-----------------|-------------------|
| **Lambda Async** | Redrive policy | 0 retries, then DLQ | 0-2 retries |
| **SQS → Lambda** | Event Source Mapping | 10,000 retries (~3 days) | 0-10,000 |
| **SNS → Lambda** | SNS retry | Exponential backoff, ~15 hours | Custom DeliveryPolicy |
| **SNS → SQS** | SNS retry | Exponential backoff | Custom DeliveryPolicy |
| **DynamoDB Stream** | Event Source Mapping | 18,000 retries (~6 hours) | 0-18,000 |
| **EventBridge** | Rule retry | Up to 24h, 185 attempts, exponential backoff + jitter | `MaximumEventAgeInSeconds` (60-86400), `MaximumRetryAttempts` (0-185), Dead-letter target (DLQ) |
| **Step Functions** | Catch/Retry state | No retry unless `Retry` is declared | `MaxAttempts`: 3 default, up to 99,999,999 |
| **API Gateway** | No built-in retry | Returns error | Client-side or Lambda |

---

## Pattern 1: Exponential Backoff with Jitter

The foundation of all retry strategies.

```mermaid
graph LR
    A[Initial Request] --> B{Success?}
    B -->|Yes| C[Complete]
    B -->|No| D{Retry Count<br/>< Max?}
    D -->|No| E[Send to DLQ]
    D -->|Yes| F[Wait: base * 2^attempt + jitter]
    F --> G[Retry Request]
    G --> B
    
    subgraph "Backoff Calculation"
        H[Attempt 1: 1s + jitter] --> F
        I[Attempt 2: 2s + jitter] --> F
        J[Attempt 3: 4s + jitter] --> F
        K[Attempt 4: 8s + jitter] --> F
        L[Attempt 5: 16s + jitter] --> F
    end
```

### SNS Delivery Policy

```json
{
  "defaultHealthyRetryPolicy": {
    "minDelayTarget": 1,
    "maxDelayTarget": 20,
    "numNoDelayRetries": 0,
    "numMinDelayRetries": 5,
    "numMaxDelayRetries": 5,
    "backoffFunction": "exponential"
  },
  "throttlePolicy": {
    "maxReceivesPerSecond": 500
  },
  "sicklyRetryPolicy": null
}
```

### Retry Decision Framework

| Error Type | Retry? | Strategy |
|-----------|--------|----------|
| **5xx / Throttling** | Yes | Exponential backoff + jitter |
| **4xx (except 429)** | No | Send to DLQ immediately |
| **Timeout** | Yes | Increase timeout, then retry |
| **Connection Error** | Yes | Quick retry (max 2-3, then DLQ for persistent issues) |
| **Validation Error** | No | Send to DLQ (won't fix on retry) |
| **Idempotency Conflict** | No | Skip or handle in code |

### Cost Considerations

Retries multiply invocation costs. A message retried 10,000 times costs 10,000x a single invocation. Set appropriate retry limits and use DLQs to contain costs. Circuit breakers also add overhead — measure failure rates to tune thresholds.

---

## Pattern 2: Multi-Layer Dead-Letter Queue Strategy

A comprehensive DLQ strategy with escalation levels.

```mermaid
graph TB
    A[Primary SQS Queue] -->|Event Source Mapping| B[Lambda Processor]
    
    subgraph "Level 1: Automatic Retry"
        B -->|Max Retries: 3| C[DLQ Level 1<br/>retry-queue-l1]
        C -->|Scheduled Lambda| D[Lambda<br/>DLQ L1 Processor]
        D -->|Retry after 5min| A
    end
    
    subgraph "Level 2: Extended Retry"
        D -->|Max Retries: 3| E[DLQ Level 2<br/>retry-queue-l2]
        E -->|Scheduled Lambda| F[Lambda<br/>DLQ L2 Processor]
        F -->|Retry after 1hr| A
    end
    
    subgraph "Level 3: Manual Intervention"
        F -->|Max Retries: 3| G[DLQ Level 3<br/>poison-pill-queue]
        G -->|Alert| H[CloudWatch Alarm]
        H -->|Notify| I[Slack / SNS Email]
        G -->|Manual Review| J[Human Operator]
        J -->|Fix & Reprocess| A
        J -->|Discard| K[Audit Log<br/>S3 Bucket]
    end
```

### DLQ Monitoring Alarms

| Metric | Threshold | Action |
|--------|-----------|--------|
| DLQ L1 ApproximateDepth > 0 | Warning | Log alert |
| DLQ L2 ApproximateDepth > 10 | Error | Page on-call |
| DLQ L3 ApproximateDepth > 0 | Critical | Immediate escalation |
| DLQ AgeOfOldestMessage > 1hr | Warning | Investigate |
| Lambda Errors > 10/min | Error | Check logs |

---

## Pattern 3: Circuit Breaker Pattern

Prevent cascading failures when a downstream service is unhealthy.

```mermaid
graph TB
    subgraph "Circuit Breaker States"
        A[CLOSED<br/>Normal Operation] -->|Failure Rate > Threshold| B[OPEN<br/>Blocking Requests]
        B -->|Cooldown Expires| C[HALF-OPEN<br/>Test Request]
        C -->|Test Success| A
        C -->|Test Failure| B
    end
    
    subgraph "Request Flow"
        D[Lambda Function] --> E{Circuit State}
        E -->|CLOSED| F[Call Downstream Service]
        E -->|OPEN| G[Return Fallback Response]
        E -->|HALF-OPEN| H[Single Test Request]
        F -->|Success| I[Record Success]
        F -->|Failure| J[Record Failure]
        I --> E
        J --> E
        H -->|Success| A
        H -->|Failure| B
    end
```

### Circuit Breaker Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `failureThreshold` | 5 | Failures before opening circuit |
| `successThreshold` | 3 | Successes before closing circuit |
| `timeout` | 60s | Cooldown before half-open |
| `monitoringPeriod` | 30s | Window for failure counting |
| `failureRate` | 0.5 | 50% failure rate triggers open |

### AWS Implementation Options

| Approach | Tool | Complexity |
|----------|------|-----------|
| **Application-level** | Powertools Circuit Breaker | Low, in-code |
| **Infrastructure-level** | Step Functions Catch | Medium |
| **Network-level** | ALB health checks + target groups | High |
| **API-level** | API Gateway usage plan throttling | Medium |

### Powertools Circuit Breaker Example

Powertools for AWS Lambda (Python) ships a `circuit_breaker` decorator (currently under the `circuit_breaker_alpha` namespace — pin your Powertools version, as the API may still change before GA):

```python
from aws_lambda_powertools.utilities.circuit_breaker_alpha import circuit_breaker, CircuitBreakerError

@circuit_breaker(failure_threshold=5, recovery_timeout=30)
def call_downstream_service(payload):
    # Call to downstream dependency (HTTP, DB, etc.)
    return downstream_client.invoke(payload)

def lambda_handler(event, context):
    try:
        return call_downstream_service(event)
    except CircuitBreakerError:
        # Circuit is OPEN — return a fallback response instead of calling downstream
        return {"status": "degraded", "message": "Service temporarily unavailable"}
```

### When NOT to Use

- Don't use for errors that won't recover (validation errors) — send to DLQ directly
- Don't use with aggressive thresholds — risk of hiding real failures

---

## Pattern 4: Idempotency Patterns

Critical for at-least-once delivery systems to prevent duplicate processing.

```mermaid
graph TB
    A[Incoming Request] --> B{Idempotency Key<br/>in Headers/Body}
    B -->|Present| C{Check DynamoDB<br/>Idempotency Table}
    B -->|Absent| D[Process Normally]
    
    C -->|Found + COMPLETED| E[Return Cached Result]
    C -->|Found + IN_PROGRESS| F[Wait & Retry<br/>Max 5 attempts]
    C -->|Not Found| G[Mark IN_PROGRESS<br/>Conditional Write]
    
    G -->|Success| H[Process Request]
    G -->|Condition Failed| I[Another Lambda<br/>is processing]
    I --> F
    
    H -->|Success| J[Store Result + COMPLETED]
    H -->|Failure| K[Mark FAILED<br/>Allow Retry]
    K --> L[Return Error]
    
    J --> E
    F -->|Timeout| M[Return 503<br/>Try Again Later]
```

### Idempotency Table Design

| Attribute | Type | Purpose |
|-----------|------|---------|
| `idempotency_key` | String (PK) | Unique request identifier |
| `status` | String | IN_PROGRESS / COMPLETED / FAILED |
| `response` | String (JSON) | Cached response for replay |
| `created_at` | Number | Timestamp for TTL |
| `expires_at` | Number | TTL for automatic cleanup |

### Idempotency Key Sources

| Source | Example | Use Case |
|--------|---------|----------|
| **Client-generated** | `X-Idempotency-Key: req-123` | API requests, client retries |
| **Message ID** | `messageId` from SQS | Queue processing |
| **Business key** | `orderId: ORD-001` | Domain-specific deduplication |
| **Hash** | `SHA256(payload)` | Content-based deduplication |

---

## Pattern 5: Bulkhead Pattern

Isolate failures to prevent one service from taking down the entire system.

```mermaid
graph TB
    A[API Gateway] --> B{Lambda Function<br/>with Multiple Downstream Calls}
    
    subgraph "Bulkhead: Payment Service"
        B -->|Reserved Concurrency: 50| C1[Lambda<br/>Payment Handler]
        C1 --> C2[(Payment DB)]
        C1 --> C3[SQS DLQ<br/>payment-dlq]
    end
    
    subgraph "Bulkhead: Inventory Service"
        B -->|Reserved Concurrency: 50| D1[Lambda<br/>Inventory Handler]
        D1 --> D2[(Inventory DB)]
        D1 --> D3[SQS DLQ<br/>inventory-dlq]
    end
    
    subgraph "Bulkhead: Notification Service"
        B -->|Reserved Concurrency: 20| E1[Lambda<br/>Notification Handler]
        E1 --> E2[SES / SNS]
        E1 --> E3[SQS DLQ<br/>notification-dq]
    end
    
    subgraph "Unreserved Pool"
        F[Remaining Concurrency<br/>for other functions]
    end
```

### Concurrency Allocation Strategy

| Service | Priority | Reserved Concurrency | Rationale |
|---------|----------|---------------------|-----------|
| **Payment Processing** | Critical | 100 | Never starve, financial impact |
| **Order Processing** | High | 50 | Core business logic |
| **Notifications** | Medium | 20 | Important but not blocking |
| **Analytics** | Low | 10 | Can tolerate delays |
| **Unreserved** | Shared | Remaining | Flexibility for spikes |

---

## Pattern 6: Graceful Degradation

Maintain partial functionality when dependencies fail.

```mermaid
graph TB
    A[API Request] --> B[Lambda<br/>Order Service]
    B --> C{Primary Inventory<br/>Service Available?}
    
    C -->|Yes| D[Call Primary Service]
    C -->|No| E{Cache Available?}
    
    E -->|Yes| F[Return Cached Data<br/>+ Stale Warning]
    E -->|No| G{Fallback DB Available?}
    
    G -->|Yes| H[Read from Fallback<br/>DynamoDB Table]
    G -->|No| I[Return Default Response<br/>Queue for Async Processing]
    
    D --> J[Full Response]
    F --> J
    H --> J
    I --> J
    
    J --> K[Response with<br/>Service Health Headers]
    
    subgraph "Async Recovery"
        I --> L[SQS Queue<br/>recovery-queue]
        L --> M[Lambda<br/>Recovery Worker]
        M -->|Reprocess| D
    end
```

### Degradation Levels

| Level | Behavior | User Impact |
|-------|----------|-------------|
| **Full** | All services operational | None |
| **Reduced** | Non-critical features disabled | Minor |
| **Degraded** | Cached/stale data returned | Noticeable |
| **Minimal** | Core functionality only | Significant |
| **Maintenance** | Read-only or queued | Maximum |

---

## Pattern 7: Chaos Engineering for Serverless

Proactive resilience testing patterns.

```mermaid
graph TB
    subgraph "Chaos Experiment"
        A[Chaos Controller<br/>Lambda / Step Functions]
    end
    
    subgraph "Injection Points"
        A -->|Inject Latency| B[SQS Delay Queues]
        A -->|Inject Errors| C[Lambda Error Injection]
        A -->|Throttle Concurrency| D[Reserved Concurrency Reduction]
        A -->|Kill Connections| E[RDS Proxy Disruption]
        A -->|Block Network| F[Security Group Modifications]
    end
    
    subgraph "Monitoring"
        B --> G[CloudWatch Metrics]
        C --> G
        D --> G
        E --> G
        F --> G
        G --> H[X-Ray Traces]
        G --> I[Custom Dashboards]
        H --> J[Alert Evaluation]
        I --> J
    end
    
    subgraph "Recovery"
        J -->|Auto-Heal| K[Revert Changes]
        J -->|Report| L[Chaos Test Results]
    end
```

### Chaos Experiment Catalog

| Experiment | Injection Method | Expected Behavior | Validation |
|-----------|-----------------|------------------|------------|
| **Lambda Timeout** | Reduce timeout to 1s | DLQ receives messages | DLQ depth increases |
| **SQS Queue Full** | Stop consumer Lambda | Queue depth grows | No message loss |
| **DynamoDB Throttling** | Reduce RCUs/WCUs | Retry logic activates | Requests eventually succeed |
| **RDS Connection Limit** | Reduce RDS Proxy pool | Queue backs up | No connection errors leak |
| **Region Failure** | Route 53 failover | Traffic shifts to secondary | Requires pre-warming, DNS TTL tuning |

### AWS Fault Injection Simulator (FIS)

AWS FIS is a managed service for running chaos experiments. Use it instead of manual injection for repeatable, auditable experiments with built-in safety controls (targets, stop conditions, tags).

---

## Comprehensive Error Handling Checklist

### Lambda Function Level

- [ ] Set appropriate timeout (not default 3s)
- [ ] Configure reserved concurrency
- [ ] Implement structured logging with correlation IDs
- [ ] Add try-catch with specific error handling
- [ ] Configure DLQ for async invocations
- [ ] Use Powertools for structured logging and metrics
- [ ] Implement idempotency for SQS/DynamoDB triggers
- [ ] Use `ReportBatchItemFailures` for partial batch failure reporting (SQS → Lambda)
- [ ] Set environment-specific error thresholds

### Infrastructure Level

- [ ] Multi-AZ deployment for all stateful services
- [ ] DLQ on every SQS queue
- [ ] CloudWatch Alarms on error rates
- [ ] X-Ray tracing enabled
- [ ] Log retention policies configured
- [ ] Auto-scaling boundaries set (min/max)
- [ ] VPC endpoints for critical AWS services
- [ ] Backup and recovery tested

### Monitoring & Alerting

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Lambda Error Rate | >1% | >5% | Investigate logs |
| Lambda Duration p99 | >70% timeout | >90% timeout | Optimize code |
| SQS Queue Depth | >1000 | >10000 | Scale consumers |
| DLQ Depth | >0 | >100 | Manual review |
| Throttles | >10/min | >100/min | Increase concurrency |
| Cold Starts | >20% | >50% | Provisioned concurrency |
| DynamoDB IteratorAge | >300s | >900s | Scale stream consumers |

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| **Swallowing exceptions** | Silent failures, data loss | Log all exceptions, use DLQ |
| **Infinite retries** | Queue buildup, wasted cost | Set max retry attempts |
| **No circuit breaker** | Cascading failures | Implement circuit breaker |
| **Synchronous retries in hot path** | User-facing delays | Use async retry with SQS |
| **Single DLQ for all services** | Hard to diagnose, mixed priorities | Per-service DLQs |
| **No error classification** | Retry errors that won't fix | Classify 4xx vs 5xx |
| **Ignoring cold start latency** | Poor user experience | Provisioned concurrency for critical paths |
