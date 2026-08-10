# ECS/EKS Best Practices

## ECS vs EKS Selection

### Comparison

| Feature | ECS | EKS |
|---------|-----|-----|
| **Control plane** | Fully managed | Fully managed (no self-managed option) |
| **Kubernetes** | No (ECS native) | Yes (full Kubernetes) |
| **Learning curve** | Lower | Higher |
| **Cost** | Lower (Fargate or EC2) | Higher (control plane fee) |
| **Ecosystem** | AWS-native | Kubernetes ecosystem |
| **Networking** | Bridge, awsvpc, host | CNI (pod networking) |
| **Service mesh** | ECS Service Connect, App Mesh (deprecated) | Istio, Linkerd, Cilium |
| **Auto-scaling** | ECS Service, Cluster | HPA, VPA, Cluster Autoscaler, Karpenter, EKS Auto Mode |
| **Portability** | AWS-only | Multi-cloud |
| **Best for** | AWS-centric, simplicity | Kubernetes expertise, multi-cloud |

### Recommendation Matrix

| Requirement | Recommended |
|-------------|-------------|
| AWS-only deployment | ECS |
| Kubernetes expertise exists | EKS |
| Multi-cloud strategy | EKS |
| Simplicity preferred | ECS |
| Cost optimization | ECS |
| Kubernetes ecosystem tools | EKS |
| Fast time-to-market | ECS |
| Helm charts, operators | EKS |

```mermaid
graph TB
    subgraph ECS["Amazon ECS"]
        direction TB
        ECS1["ECS Cluster"]
        ECS1 --> ECS2["EC2 Launch Type"]
        ECS1 --> ECS3["Fargate Launch Type"]
        ECS2 --> ECS4["EC2 Container Instances"]
        ECS3 --> ECS5["Serverless Tasks"]
        ECS4 --> ECS6["Tasks w/ Containers"]
        ECS5 --> ECS6
        ECS6 --> ECS7["awsvpc Networking"]
    end

    subgraph EKS["Amazon EKS"]
        direction TB
        EKS1["EKS Control Plane<br/>Managed by AWS"]
        EKS1 --> EKS2["Managed Node Groups"]
        EKS1 --> EKS3["Fargate Profiles"]
        EKS1 --> EKS4["Self-Managed Nodes"]
        EKS2 --> EKS5["Pods w/ Containers"]
        EKS3 --> EKS5
        EKS4 --> EKS5
        EKS5 --> EKS6["CNI Pod Networking"]
    end

    ECS -.->|"Simpler, AWS-native"| A1[Users]
    EKS -.->|"Full Kubernetes"| A2[Users]
```

---

## ECS Architecture

### Launch Types

| Type | Description | Use Case |
|------|-------------|----------|
| **EC2 Launch Type** | Self-managed EC2 cluster (legacy, use Capacity Providers) | Cost control, dedicated hosts |
| **Fargate** | Serverless, AWS-managed | Simplicity, variable workloads |
| **ECS on AWS Fargate Spot** | Discounted Fargate | Fault-tolerant workloads |

### Networking Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **awsvpc** | Task gets ENI, own IP | **Recommended**, security groups |
| **Bridge** | Shared container network | Legacy, port mapping |
| **Host** | Host network stack | Performance, legacy apps |

### Capacity Providers

| Type | Description | Use Case |
|------|-------------|----------|
| **FARGATE_SPOT** | Spot-priced Fargate | Cost-optimized, fault-tolerant |
| **FARGATE** | On-demand Fargate | Production, reliability |
| **Auto (EC2)** | Auto-scaling EC2 | EC2 launch type |
| **Custom (EC2)** | Custom ASG | Specific instance needs |

---

## EKS Architecture

### Node Groups

| Type | Description | Use Case |
|------|-------------|----------|
| **Managed Node Group** | AWS-managed EC2 nodes | Standard workloads |
| **Self-Managed Node Group** | User-managed EC2 nodes | Custom AMI, configuration |
| **Fargate Profile** | Serverless pods | Variable workloads |
| **Spot Instances** | Spot-priced nodes | Cost-optimized, fault-tolerant |
| **EKS Auto Mode** | AWS-managed nodes, scaling (Karpenter), and add-ons | Minimal operational overhead |

### Kubernetes Version Support

| Support Tier | Duration | Coverage |
|--------------|----------|----------|
| **Standard support** | 14 months from release | Control plane, EKS-published AMIs, add-ons |
| **Extended support** | Next 12 months (26 months total) | Control plane patches, critical AMI/add-on patches (additional cost) |

Upgrade clusters before standard support ends to avoid the extended-support surcharge; extended support is available for Kubernetes 1.21 and later.

### Node/Cluster Autoscaling

| Tool | Approach | Recommendation |
|------|----------|----------------|
| **Karpenter** | Direct EC2 API provisioning, bin-packing, fast scale-up (~1 min) | Preferred for new EKS clusters on AWS |
| **Cluster Autoscaler** | Scales existing Auto Scaling Groups/node groups | Simpler multi-cloud-portable option; slower scale-up |
| **EKS Auto Mode** | AWS-managed compute using Karpenter under the hood | Lowest operational overhead, less low-level control |

| Setting | Recommendation |
|---------|---------------|
| **Minimum nodes** | Match baseline load |
| **Maximum nodes** | Match peak capacity plan |
| **Scale-down delay** | 10 minutes (Cluster Autoscaler default) |
| **Spot instances** | Mix with on-demand for resilience |

---

## Auto-Scaling

### ECS Scaling

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Target Tracking** | Maintain target metric | CPU, memory, ALB requests |
| **Step Scaling** | Threshold-based adjustments | Variable patterns |
| **Scheduled Scaling** | Time-based scaling | Predictable patterns |
| **Custom Metrics** | Application-specific metrics | Business metrics |

### EKS Scaling

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **HPA (Horizontal Pod Autoscaler)** | Pod count based on metrics | CPU, memory, custom |
| **VPA (Vertical Pod Autoscaler)** | Resource requests/limits | Right-sizing pods |
| **Karpenter** | Node provisioning/consolidation via direct EC2 API calls | Preferred node autoscaler on AWS |
| **Cluster Autoscaler** | Node count based on pending pods, via ASGs | Multi-cloud-portable node scaling |
| **KEDA** | Event-driven autoscaling | Queue length, events |

### Scaling Metrics

| Metric | Source | Use Case |
|--------|--------|----------|
| CPU Utilization | Container Insights | General scaling |
| Memory Utilization | Container Insights | Memory-bound apps |
| ALB Request Count | Application LB | Request-based scaling |
| HTTP 5XX Errors | Application LB | Error-based scaling |
| Custom Metrics | CloudWatch | Business-specific |
| Queue Depth | SQS, Kinesis | Event-driven scaling |

---

## Service Mesh

> **AWS App Mesh is deprecated.** New customer onboarding closed in September 2024, and AWS will discontinue App Mesh support (console and resources) effective September 30, 2026. For new workloads, use **ECS Service Connect** (built-in ECS service discovery and traffic management) for ECS, or a third-party mesh (Istio, Linkerd, Cilium) for EKS. Existing App Mesh customers should plan migration before the end-of-support date.

### App Mesh (Deprecated)

| Component | Description |
|-----------|-------------|
| **Virtual Node** | Represents a service version |
| **Virtual Service** | Abstracts service discovery |
| **Virtual Router** | Routes traffic between services |
| **Virtual Gateway** | Ingress/egress gateway |
| **Envoy Proxy** | Sidecar proxy for each task/pod |

### Features

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Traffic splitting** | Canary, blue/green deployments | Gradual rollouts |
| **Retry policies** | Automatic retries | Resilience |
| **Circuit breaker** | Fail fast on errors | Fault isolation |
| **Timeouts** | Request timeouts | Latency control |
| **mTLS** | Mutual TLS between services | Security |
| **Observability** | Distributed tracing | Debugging |

```mermaid
graph TB
    subgraph Mesh["Service Mesh Architecture"]
        Client["Client Request"] --> Gateway["Virtual Gateway<br/>Ingress/Egress"]
        Gateway --> Router["Virtual Router<br/>Traffic Routing"]
        Router --> VS["Virtual Service<br/>Service Discovery"]

        subgraph ServiceA["Service A"]
            direction TB
            AppA["Application Container A"]
            EnvoyA["Envoy Sidecar Proxy A"]
            AppA <--> EnvoyA
        end

        subgraph ServiceB["Service B"]
            direction TB
            AppB["Application Container B"]
            EnvoyB["Envoy Sidecar Proxy B"]
            AppB <--> EnvoyB
        end

        VS --> VN1["Virtual Node A"]
        VS --> VN2["Virtual Node B"]
        VN1 --> EnvoyA
        VN2 --> EnvoyB

        EnvoyA ==>|mTLS| EnvoyB
    end
```

---

## Security

### ECS Security

| Control | Implementation |
|---------|---------------|
| **Task IAM roles** | Least privilege per task |
| **Execution role** | Pull images, write logs |
| **Network mode** | awsvpc with security groups |
| **Container images** | Scan in ECR |
| **Secrets** | Secrets Manager, SSM Parameter Store |
| **Logging** | FireLens for advanced logging |
| **Encryption** | EFS encrypted, secrets encrypted |

### EKS Security

| Control | Implementation |
|---------|---------------|
| **IAM Roles for Service Accounts (IRSA)** | Pod-level IAM permissions |
| **Pod Identity** | Native EKS pod identity |
| **Network Policies** | Calico, Cilium for pod networking |
| **Pod Security Standards** | Restricted, baseline, privileged |
| **Secrets encryption** | KMS encryption for etcd |
| **RBAC** | Kubernetes role-based access |
| **Image scanning** | ECR scan, Trivy |
| **SPIFFE/SPIRE** | Workload identity |

---

## Logging

### Logging Drivers

| Driver | Description | Use Case |
|--------|-------------|----------|
| **awslogs** | CloudWatch Logs | Default, simple |
| **fluentd** | Fluentd agent | Advanced processing |
| **fluent-bit** | Lightweight Fluent | Performance |
| **firelens** | Log router (Fluentd/Fluent Bit) | Multi-destination, advanced routing |
| **splunk** | Direct to Splunk | Splunk integration |

### Log Management

| Practice | Description |
|----------|-------------|
| **Centralized logging** | CloudWatch Logs, OpenSearch |
| **Log retention** | Match compliance requirements |
| **Log grouping** | By service, environment |
| **Log metrics** | CloudWatch Logs Insights |
| **Cost management** | Log rotation, compression |

---

## Monitoring

### Container Insights

| Metric | Description | Alert |
|--------|-------------|-------|
| CPU Utilization | Container CPU usage | > 80% |
| Memory Utilization | Container memory usage | > 80% |
| Network RX/TX | Container network traffic | Baseline deviation |
| Disk Read/Write | Container disk I/O | Baseline deviation |
| Pod/Task Restarts | Restart count | > 3/hour |
| Pull Image Latency | Image pull time | > 30s |

### X-Ray Integration

| Feature | Description |
|---------|-------------|
| **Tracing** | Distributed request tracing |
| **Service map** | Visualize service dependencies |
| **Latency analysis** | Identify slow services |
| **Error tracking** | Track exceptions and errors |

---

## Cost Optimization

| Strategy | Description | Potential Savings |
|----------|-------------|-------------------|
| **Fargate Spot** | Spot-priced serverless | Up to 70% |
| **EC2 Spot** | Spot instances for tasks | Up to 90% |
| **Right-size tasks** | Match CPU/memory to needs | 20-50% |
| **Auto-scaling** | Scale to demand | Variable workloads |
| **Graviton instances** | ARM-based, better price/performance | 20% |
| **Reserved capacity** | EC2 launch type reservations | Up to 70% |
| **Image optimization** | Smaller images, faster pulls | Time and bandwidth |
| **Cleanup** | Remove unused tasks, clusters | Eliminate waste |

---

## Cross-Service Integration

| Service | Integration | Purpose |
|---------|------------|---------|
| ALB/NLB | Container ingress | Load balancing |
| CloudMap | Service discovery | DNS-based discovery |
| ECS Service Connect | Service discovery + traffic management | Built-in ECS service-to-service networking |
| App Mesh (deprecated) | Service mesh | Traffic management (migrate before Sep 2026) |
| CloudWatch | Container Insights | Monitoring |
| X-Ray | Distributed tracing | Debugging |
| Secrets Manager | Secret injection | Secure credentials |
| ECR | Container registry | Image storage |
| CloudTrail | API activity logging | Audit trail |
| Config | Compliance rules | Governance |
