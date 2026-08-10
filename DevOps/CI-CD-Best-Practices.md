# CI/CD Best Practices

## Pipeline Architecture

### CodePipeline Stages

| Stage | Action | Description |
|-------|--------|-------------|
| **Source** | CodeCommit, CodeConnections (formerly CodeStar Connections), S3, GitHub | Code repository connection |
| **Build** | CodeBuild | Compile, test, package |
| **Test** | CodeBuild, AWS Device Farm, third-party tools | Automated testing |
| **Deploy** | CodeDeploy, ECS, Lambda, S3 | Application deployment |
| **Approve** | Manual approval | Human gate before production |

```mermaid
graph LR
    A[Source<br/>CodeCommit/GitHub/S3] --> B[Build<br/>CodeBuild]
    B --> C[Test<br/>Unit/Integration/E2E]
    C --> D{Tests Pass?}
    D -->|Yes| E[Deploy<br/>CodeDeploy/ECS/Lambda]
    D -->|No| F[Fail & Notify]
    E --> G{Approve?}
    G -->|Production| H[Manual Approval]
    H --> I[Production]
    G -->|Staging/Dev| I2[Staging/Dev]
    I --> J[Monitor<br/>CloudWatch]
    I2 --> J
    J --> K{Issues?}
    K -->|Yes| L[Rollback]
    K -->|No| M[Success]
```

### Pipeline Strategy

| Environment | Pipeline | Promotion |
|-------------|----------|-----------|
| **Development** | Automatic on commit | Every commit |
| **Staging** | Automatic from dev | After dev success |
| **Production** | Manual approval | After staging success |

---

## CodeBuild Configuration

### Build Environment

| Setting | Recommendation | Reason |
|---------|---------------|--------|
| **Image** | Managed image matching runtime | Pre-configured tools |
| **Compute type** | Match build complexity | Cost vs speed |
| **Timeout** | Minimum needed | Cost optimization |
| **Environment variables** | Use Parameter Store for secrets | Security |
| **Cache** | Enable dependency caching | Build speed |
| **Logs** | CloudWatch Logs | Build visibility |

### Build Spec Best Practices

| Practice | Description |
|----------|-------------|
| **Phased build** | install, pre_build, build, post_build | Organized build (no reports phase) |
| **Cache dependencies** | npm, pip, maven cache | Faster builds |
| **Parallel tests** | Split test suites | Faster feedback |
| **Artifact management** | Versioned artifacts | Traceability |
| **Report generation** | Test reports, code coverage | Quality metrics |

---

## Deployment Strategies

### CodeDeploy Strategies

| Strategy | Downtime | Risk | Rollback | Use Case |
|----------|----------|------|----------|----------|
| **In-Place** | Partial | Medium | Automatic | EC2, On-premises |
| **Blue/Green** | Zero | Low | Automatic (traffic swap) | EC2, Lambda (CodeDeploy) |
| **Canary** | None | Low | Automatic | Lambda, ECS |
| **All-at-Once** | Brief | High | Manual | Non-critical |
| **Rolling** | Partial | Medium | Automatic | Large fleets |
| **Rolling with Time** | Partial | Medium | Automatic | Controlled pace |

### Blue/Green Deployment

| Phase | Action | Description |
|-------|--------|-------------|
| 1 | Create green environment | New deployment |
| 2 | Run tests on green | Validate deployment |
| 3 | Shift traffic | Gradual or full switch |
| 4 | Monitor green | Verify stability |
| 5 | Terminate blue | Clean up old environment |
| 6 | Swap on failure | Quick rollback |

### Canary Deployment

| Setting | Recommendation |
|---------|---------------|
| **Percentage** | Start at 5-10% |
| **Interval** | 5-10 minute intervals |
| **Failure threshold** | Automatic rollback on errors |
| **Metrics** | CloudWatch alarms for rollback criteria |
| **Duration** | 30-60 minutes total canary period |

```mermaid
graph TB
    subgraph BlueGreen["Blue/Green Deployment"]
        direction LR
        BG1[Blue Environment<br/>v1.0 Live] --> BG2[Create Green<br/>v2.0]
        BG2 --> BG3[Test Green v2.0]
        BG3 --> BG4[Switch Traffic<br/>100% to Green]
        BG4 --> BG5[Terminate Blue]
    end

    subgraph Canary["Canary Deployment"]
        direction LR
        C1[Current v1.0<br/>100% Traffic] --> C2[Deploy Canary<br/>v2.0 at 10%]
        C2 --> C3{Metrics OK?}
        C3 -->|Yes| C4[Increase to 50%]
        C4 --> C5{Metrics OK?}
        C5 -->|Yes| C6[Increase to 100%]
        C5 -->|No| C7[Rollback to v1.0]
        C3 -->|No| C7
    end
```

### GitOps Deployments

| Tool | Target | Description |
|------|--------|-------------|
| **Argo CD** | EKS | Declarative, Git-sourced continuous delivery for Kubernetes |
| **Flux** | EKS | GitOps toolkit reconciling cluster state from Git |
| **CodePipeline + CodeDeploy** | ECS, Lambda, EC2 | AWS-native push-based CD (non-GitOps) |

Use GitOps for Kubernetes workloads where the Git repository is the single source of truth and an in-cluster controller reconciles drift; use CodePipeline/CodeDeploy for AWS-native push-based deployments to ECS, Lambda, or EC2.

---

## Environment Management

### Parameter Store Integration

| Parameter Type | Use Case | Example |
|---------------|----------|---------|
| **String** | Configuration values | DB endpoint, API URLs |
| **StringList** | Multiple values | Allowed origins, IPs |
| **SecureString** | Secrets | Passwords, API keys |
| **Hierarchy** | Organized parameters | /app/env/component |

### Environment Promotion

| Stage | Automation | Approval | Testing |
|-------|-----------|----------|---------|
| Dev | Full | None | Unit tests |
| Staging | Full | None | Integration tests |
| Pre-prod | Full | Optional | E2E tests |
| Production | Full | Required | Smoke tests |

---

## Security

### Pipeline Security

| Control | Implementation |
|---------|---------------|
| **Secrets management** | Secrets Manager, not environment variables |
| **IAM roles** | Least privilege for pipeline roles |
| **Scan for vulnerabilities** | Inspector, Snyk, Checkov |
| **Container scanning** | ECR scan before deployment |
| **Infrastructure scanning** | Checkov, cfn-nag for IaC |
| **Approval gates** | Manual approval for production |
| **Audit trail** | CloudTrail for pipeline actions |

### Secrets Management

| Method | Description | Use Case |
|--------|-------------|----------|
| **Secrets Manager** | Managed secrets with rotation | Database passwords, API keys |
| **Parameter Store (SecureString)** | Encrypted parameters | Configuration secrets |
| **SSM GetParameters** | Runtime retrieval | Application secrets |
| **CodeBuild secrets** | Parameter Store integration | Build-time secrets |

---

## Testing Strategy

### Test Pyramid

| Level | Tools | Frequency | Duration |
|-------|-------|-----------|----------|
| **Unit tests** | Jest, pytest, JUnit | Every commit | Seconds |
| **Integration tests** | Test containers, localstack | Every build | Minutes |
| **E2E tests** | Selenium, Cypress | Every staging deploy | Minutes |
| **Performance tests** | k6, JMeter | Before production | Hours |
| **Security tests** | Inspector, Snyk | Every build | Minutes |

### Test Automation

| Test Type | Pipeline Stage | Failure Action |
|-----------|---------------|----------------|
| Unit tests | Build | Fail pipeline |
| Integration tests | Build/Test | Fail pipeline |
| Linting | Build | Fail pipeline |
| Security scan | Build | Warn or fail |
| E2E tests | Post-deploy (staging) | Fail pipeline |
| Smoke tests | Post-deploy (prod) | Trigger rollback |

---

## Monitoring

### Pipeline Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|----------------|
| Pipeline execution time | Total duration | > baseline + 2 sigma |
| Build duration | Build stage time | > baseline + 2 sigma |
| Test failure rate | Failed tests / total | > 5% |
| Deployment success rate | Successful / total | < 95% |
| Rollback frequency | Rollbacks / deployments | > 10% |
| Pipeline failures | Failed executions | Any |

---

## Cost Optimization

| Strategy | Description | Potential Savings |
|----------|-------------|-------------------|
| **Right-size build instances** | Match to build needs | 20-50% |
| **Enable caching** | Dependency caching | 30-70% build time |
| **Parallel builds** | Multiple builds concurrently | Time savings |
| **Cleanup artifacts** | Lifecycle policies on S3 | Storage reduction |
| **Scheduled builds** | Only build when needed | Build cost reduction |
| **Shared build images** | Reuse custom images | Build time reduction |

---

## Cross-Service Integration

| Service | Integration | Purpose |
|---------|------------|---------|
| CodeCommit | Source control | Git repository |
| CodeBuild | Build and test | CI |
| CodeDeploy | Application deployment | CD |
| CodePipeline | Orchestration | Pipeline management |
| CloudWatch | Metrics, logs | Monitoring |
| Secrets Manager | Secret management | Security |
| SSM Parameter Store | Configuration | Environment config |
| SNS | Notifications | Alerts |
| Lambda | Custom actions | Extensibility |
| ECS/EKS | Container deployment | Container orchestration |
