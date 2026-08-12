# X-Ray Best Practices

Distributed tracing is critical for modern microservice architectures because requests span multiple services, making it impossible to pinpoint latency, errors, or bottlenecks by examining individual components in isolation. By capturing the full lifecycle of a request across all downstream dependencies, tracing provides end-to-end visibility that enables faster root-cause analysis, informed capacity planning, and reliable SLO tracking.

## Architecture

> **IMPORTANT (2026):** AWS X-Ray SDKs and Daemon are in **maintenance mode** (security fixes only). For new projects, use **AWS Distro for OpenTelemetry (ADOT)** / OpenTelemetry as the recommended instrumentation approach. Existing X-Ray deployments should plan migration to OpenTelemetry.

### Components

Understanding each building block and its role is essential for proper architecture, troubleshooting, and planning the migration from legacy X-Ray SDKs to OpenTelemetry.

| Component | Description | Purpose |
|-----------|-------------|---------|
| **OpenTelemetry SDK / ADOT** | Recommended instrumentation for new and migrated applications | Generate spans and propagate context |
| **CloudWatch agent or OpenTelemetry Collector** | Receive OTLP or X-Ray telemetry and export traces to X-Ray | Collection and routing |
| **X-Ray SDK / daemon** | Maintenance-mode legacy instrumentation and UDP segment collector | Existing deployments only |
| **X-Ray Service** | Store and analyze traces | Backend service |
| **CloudWatch Console (X-Ray section)** | Visualize traces | Analysis UI |
| **SDK** | Programmatic access | Integration |

### Deployment Options

Choosing the right deployment model ensures telemetry data reaches X-Ray reliably while matching your infrastructure's operational constraints and cost profile.

| Option | Description | Use Case |
|--------|-------------|----------|
| **EC2/on-premises** | CloudWatch agent or OpenTelemetry Collector | Hosts and traditional deployments |
| **ECS** | Collector sidecar or CloudWatch agent where supported | Container deployments |
| **EKS** | ADOT add-on/collector deployment | Kubernetes clusters |
| **Lambda** | Active tracing plus supported OpenTelemetry/ADOT instrumentation | Serverless functions |
| **AWS Services** | Native X-Ray support | Supported services |

```mermaid
flowchart LR
    A["Application\n(OpenTelemetry SDK)"] -->|"OTLP"| B["CloudWatch Agent or\nOpenTelemetry Collector"]
    L["Legacy application\n(X-Ray SDK)"] -->|"UDP 2000"| XD["X-Ray Daemon"]
    B -->|"Export over HTTPS"| C["X-Ray Service\n(AWS Backend)"]
    XD -->|"Segments over HTTPS"| C
    C --> SM["Service Map"]
    C --> E["Trace Graph"]
    C --> F["Groups and Insights"]
    SM --> G["Developer / SRE"]
    E --> G
    F --> G
```

---

## Instrumentation

### Instrumentation Choices

Selecting the right instrumentation approach now determines long-term maintainability, especially as X-Ray SDKs enter maintenance mode and OpenTelemetry becomes the standard.

| Choice | Status | Recommendation |
|--------|--------|----------------|
| OpenTelemetry SDKs and auto-instrumentation | Active ecosystem and AWS-recommended direction | Use for new instrumentation and migrations |
| AWS Distro for OpenTelemetry | AWS-supported OpenTelemetry distribution | Use when AWS-tested components and exporters fit the workload |
| X-Ray SDKs | Maintenance mode from February 25, 2026 | Maintain existing workloads while planning migration; do not expect feature enhancements |
| X-Ray daemon | Maintenance mode from February 25, 2026 | Replace with CloudWatch agent or an OpenTelemetry Collector where practical |

### Instrumentation Levels

Matching instrumentation depth to business value prevents wasted effort on low-impact code paths while ensuring critical flows receive the visibility they need.

| Level | Description | Effort | Coverage |
|-------|-------------|--------|----------|
| **Service-level** | AWS service calls | Low | AWS services only |
| **Subsegment-level** | Custom code sections | Medium | Application logic |
| **Full tracing** | All HTTP calls, DB queries | High | Complete coverage |
| **Auto-instrumentation** | Agent-based or library-assisted instrumentation | Low, but requires configuration and validation | Framework-dependent |

### Subsegment Best Practices

Well-designed subsegments turn raw trace data into actionable diagnostics, making it easier to isolate slow operations and reproduce errors.

| Practice | Description |
|----------|-------------|
| **Name subsegments** | Descriptive, consistent naming |
| **Add metadata** | Relevant request/response data |
| **Add annotations** | Queryable key-value pairs |
| **Add SQL metadata** | Trace database operations without recording credentials, bind values, or sensitive query text |
| **Add HTTP calls** | External service calls |
| **Error handling** | Capture exceptions and errors |

---

## Service Map

### Map Features

The service map translates thousands of individual traces into an at-a-glance topology, letting teams spot problematic dependencies without diving into raw data.

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Service dependencies** | Visualize service graph | Architecture understanding |
| **Throttling indicators** | Show throttled services | Capacity issues |
| **Error indicators** | Show error rates | Problem identification |
| **Latency indicators** | Show slow services | Performance issues |
| **Correlated logs and alarms** | Open supported CloudWatch telemetry from a node | Faster investigation |

### Map Interpretation

Correctly reading the color-coded indicators turns the service map from a static diagram into an actionable incident-response tool.

| Indicator | Meaning | Action |
|-----------|---------|--------|
| **Green** | Successful calls | No action |
| **Yellow** | Client errors (4xx) | Investigate callers and request validation |
| **Red** | Server faults (5xx) | Investigate the service or dependency |
| **Purple** | Throttling (429) | Review quotas, capacity, and retry behavior |

---

## Trace Analysis

### Trace Details

Knowing which trace sections to examine first reduces mean-time-to-resolution when investigating latency spikes or intermittent failures.

| Section | Description | Use Case |
|---------|-------------|----------|
| **Service graph** | Visual dependency map | Architecture overview |
| **Timeline** | Sequential subsegment view | Latency analysis |
| **Statistics** | Aggregated metrics | Performance trends |
| **Raw JSON** | Complete trace data | Detailed debugging |

### Trace Sampling

Sampling directly balances observability against cost and overhead, so getting the rates right is essential for sustainable production tracing.

| Setting | Recommendation | Reason |
|---------|---------------|--------|
| **Default rate** | First request/sec (reservoir) + 5% of additional requests | Balance cost and coverage |
| **Reservoir size** | 1 request/sec (default) | Sets the sampling quota before the additional percentage rate; it is not a traffic-independent guarantee |
| **Custom rules** | Per-service rates | Focus on critical paths |
| **Production** | Set rates per route from traffic volume, incident-detection needs, and trace budget | Cost and coverage control |
| **Debugging** | 100% temporarily | Full visibility |

The default rule is a baseline, not a universal production target. With centralized sampling, X-Ray coordinates reservoir allocation across clients; local sampling rules can apply a reservoir per process and therefore sample more traffic as the fleet grows.

### Sampling Rules

Targeting sampling rules to high-value paths ensures critical transactions are captured while keeping overall trace volume manageable.

| Rule | Description | Use Case |
|------|-------------|----------|
| **Default rule** | All services, default rate | Baseline sampling |
| **Service rule** | Specific service, custom rate | Focus on critical services |
| **URL rule** | Specific URL pattern | API endpoint focus |
| **Host rule** | Specific host | Service-specific sampling |

```mermaid
flowchart TD
    R["Incoming request"] --> M["Select highest-priority matching rule"]
    M --> S{"Rule reservoir\nquota available?"}
    S -->|Yes| T["Sample trace"]
    S -->|No| U{"Random roll below\nrule fixed rate?"}
    U -->|Yes| T
    U -->|No| V["Drop trace"]
    T --> W["Generate segment"]
    W --> X["Send through configured collector"]
```

---

## Groups & Insights

### Trace Groups

An X-Ray group is a named filter expression, not a separate trace copy. Filter criteria can combine service/resource fields, annotations, HTTP attributes, response time, and error/fault flags.

Filter expressions are the mechanism that turns raw trace volume into focused, queryable views aligned with how your team investigates incidents.

| Filter criterion | Use Case |
|------------------|----------|
| **Service/resource** | Service-level analysis |
| **Annotation** | Business or tenant grouping using indexed, low-cardinality values |
| **HTTP URL path** | API analysis |
| **Fault/error/response time** | Incident-focused analysis |

### Insights

Automated anomaly detection surfaces problems before they cascade, but scoping insights to relevant groups prevents alert fatigue and unnecessary cost.

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Automatic insights** | Statistical modeling detects fault rates outside the expected range | Problem detection |
| **Per-group enablement** | Enable insights only on the X-Ray groups that need analysis | Scope and cost control |
| **Notifications** | Best-effort insight updates go to EventBridge and can route to SNS/SQS/Lambda | Alerting |
| **Root-cause and impact graphs** | Correlate the anomalous downstream service with affected upstream requests | Incident prioritization |

---

## Data Retention

### Retention Options

> **Note:** X-Ray trace and service-graph data is retained for **30 days** (fixed, non-configurable). If longer retention is required, design a separate telemetry export/archive path; X-Ray does not provide a retention setting that extends this window.

Planning around the fixed 30-day window early avoids last-minute data loss and ensures compliance or postmortem requirements are met.

| Duration | Description | Use Case |
|----------|-------------|----------|
| 30 days | Default and only retention period | Standard monitoring, trend analysis |
| Custom retrieval/export before expiry | Use X-Ray APIs or an observability pipeline designed for the required destination | Long-term archival |
| Parallel OpenTelemetry export | Send spans to additional approved backends through a collector | Search or retention requirements beyond X-Ray |

### Cost Considerations

Tracing cost scales with data volume, so understanding the cost drivers enables teams to maintain visibility without exceeding budget.

| Factor | Impact | Optimization |
|--------|--------|--------------|
| **Retention period** | Fixed at 30 days in X-Ray | Design external retention only when required |
| **Sampling rate** | Higher = more data | Adjust by environment |
| **Trace retrieval/scanning** | More analysis and retrieval can increase cost | Scope queries and analytics to the incident window |
| **Segment/trace size and annotations** | Subject to fixed service quotas and cardinality limits | Keep metadata useful, bounded, and non-sensitive |

---

## Monitoring

### Key Signals

Linking trace-derived signals to the right alerting mechanism ensures teams are notified on real problems rather than chasing telemetry noise.

| Signal | Description | Alerting approach |
|--------|-------------|-------------------|
| Request rate and latency | Trace-map/service response behavior | Prefer Application Signals or service-native CloudWatch metrics tied to SLOs |
| Error and fault rate | 4xx errors and 5xx faults represented in traces | Alarm on service metrics; use traces for diagnosis |
| Throttling | 429/throttle status in the trace map | Alarm on the throttled service's native metrics |
| Trace continuity | Expected requests have trace IDs and downstream context | Add telemetry pipeline health checks and collector/agent log alarms |

### CloudWatch Integration

Combining traces with metrics, logs, and dashboards creates a unified observability story that bridges the gap between alerting and diagnosis.

| Integration | Description |
|-------------|-------------|
| **Trace-derived metrics** | Some SDK/agent configurations can publish service metrics; do not assume a universal default X-Ray metric set |
| **Alarms** | Use Application Signals or service/custom CloudWatch metrics for paging |
| **Dashboards** | X-Ray widgets in CloudWatch |
| **Logs** | Correlate traces with logs |

---

## Cross-Service Integration

Proper cross-service integration ensures trace context survives every hop, so the service map and timelines reflect the true request path.

| Service | Integration | Purpose |
|---------|------------|---------|
| Lambda | Native X-Ray support | Serverless tracing |
| API Gateway | HTTP tracing | API traceability |
| DynamoDB | Instrumented AWS SDK calls | Downstream latency and error analysis |
| SQS/SNS | Trace-header propagation in supported flows; queues/topics do not necessarily emit their own X-Ray segments | Asynchronous context propagation |
| ECS/EKS | ADOT/OpenTelemetry Collector (legacy X-Ray daemon only while migrating) | Container tracing |
| CloudWatch | Metrics, dashboards | Monitoring |
| EventBridge | Insights notifications | Alerting |
| Step Functions | Workflow tracing | Workflow analysis |

---

## Additional Best Practices

- Propagate W3C trace context across synchronous and asynchronous boundaries, and verify propagation during integration tests.
- Put searchable, low-cardinality business attributes in annotations; put diagnostic detail in metadata. Never record secrets, tokens, full request bodies, or unnecessary personal data.
- Tailor sampling rules by service and route. Keep enough baseline sampling for low-volume critical paths and temporarily raise sampling during a bounded investigation.
- Monitor collector/agent health, rejected spans, exporter failures, and IAM/network access. A healthy application with a broken telemetry pipeline can otherwise look like a traffic drop.
- Correlate logs with trace and span IDs and use CloudWatch Application Signals when service-level objectives and service discovery are required.

## AWS References

- [X-Ray SDK and daemon support timeline](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-daemon-timeline.html)
- [Migrating X-Ray instrumentation to OpenTelemetry](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html)
- [X-Ray quotas and 30-day retention](https://docs.aws.amazon.com/general/latest/gr/xray.html)
- [Using the X-Ray trace map](https://docs.aws.amazon.com/xray/latest/devguide/xray-console-servicemap.html)
- [CloudWatch integration with X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-services-cloudwatch.html)
