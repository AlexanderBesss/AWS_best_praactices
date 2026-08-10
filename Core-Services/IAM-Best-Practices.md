# IAM Best Practices

## Core Principles

### Least Privilege Framework

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Least Privilege** | Grant only permissions required for the task | Use permission policies, not AdministratorAccess |
| **Permission Boundaries** | Set maximum permissions an entity can receive | IAM permission boundaries on roles/users |
| **Just-in-Time Access** | Temporary elevation when needed | AWS SSO permission sets, temporary roles |
| **Regular Review** | Audit and remove unused permissions | IAM Access Analyzer, credential reports |

```mermaid
graph LR
    PB[Permission Boundary] --> U1[IAM User]
    PB --> R1[IAM Role]
    U1 --> P1[Attached Policy]
    R1 --> P2[Attached Policy]
    PB -.->|limits max perms| P1
    PB -.->|limits max perms| P2
    style PB fill:#f9d,stroke:#333,stroke-width:2px,color:#000
    style U1 fill:#bbf,stroke:#333,color:#000
    style R1 fill:#bbf,stroke:#333,color:#000
    style P1 fill:#dfd,stroke:#333,color:#000
    style P2 fill:#dfd,stroke:#333,color:#000
```

### Permission Strategy

| Entity Type | Use Case | Best Practice |
|-------------|----------|---------------|
| **IAM Users** | Human identities, long-term access | Use AWS SSO / Identity Provider instead |
| **IAM Roles** | Temporary access for services, users, apps | **Preferred** - assume role with sts:AssumeRole |
| **IAM Groups** | Permission management for users | Assign policies to groups, not individual users |
| **AWS STS** | Temporary security credentials | Short-lived tokens for cross-account access |

---

## MFA Enforcement

### MFA Requirements

| Scope | Requirement | Implementation |
|-------|-------------|----------------|
| **Root Account** | **Mandatory** | Enable hardware or virtual MFA |
| **IAM Users** | **Mandatory** | Require MFA for console access |
| **Privileged Roles** | **Mandatory** | aws:MultiFactorAuthPresent condition |
| **CI/CD Roles** | Not required | Machine-to-machine, use IAM roles |
| **Service Roles** | Not required | EC2, Lambda, etc. use role assumption |

### MFA Condition Keys

| Condition Key | Description | Example |
|--------------|-------------|---------|
| aws:MultiFactorAuthPresent | Requires MFA for the request | Bool: true |
| aws:MultiFactorAuthAge | Time since MFA authentication | NumericLessThan: 3600 |

---

## Role Design

### Trust Policies

| Trusted Entity | Use Case | Example |
|---------------|----------|---------|
| **AWS Service** | EC2, Lambda, ECS assume role | Service: ec2.amazonaws.com |
| **AWS Account** | Cross-account access | AWS: arn:aws:iam::123456789012:root |
| **IAM User/Role** | Specific user/role assumption | AWS: arn:aws:iam::123456789012:role/RoleName |
| **External ID** | Third-party access with extra security | Condition: sts:ExternalId |
| **Federated User** | SAML/OIDC identity providers | Federated: arn:aws:iam::account:saml-provider/Provider |

### Session Duration

| Role Type | Default Max | Configurable Range | Recommendation |
|-----------|------------|-------------------|----------------|
| **IAM Role** | 1 hour | 1-12 hours | Shortest duration needed |
| **Federated Role** | 1 hour | 1-12 hours | Match session needs |
| **Web Identity Role** | 1 hour | Fixed at 1 hour (cannot be extended) | Use for mobile/web apps |

---

## Policy Best Practices

### Policy Structure

| Element | Description | Best Practice |
|---------|-------------|---------------|
| **Action** | API operations allowed | Use specific actions, not wildcard |
| **Resource** | ARNs of affected resources | Use specific ARNs, not wildcard |
| **Effect** | Allow or Deny | Explicit Deny for critical protections |
| **Condition** | When policy applies | IP, MFA, time, tag conditions |
| **Sid** | Statement identifier | Descriptive names for auditing |

### Common Condition Keys

| Condition Key | Type | Use Case |
|--------------|------|----------|
| aws:SourceIp | IpAddress | Restrict by IP range |
| aws:SourceVpc | StringEquals | Restrict to VPC |
| aws:PrincipalOrgID | StringEquals | Restrict to organization |
| aws:RequestTag/key-name | StringEquals | Enforce required tags on resource creation |
| aws:RequestedRegion | StringEquals | Restrict regions |
| aws:MultiFactorAuthPresent | Bool | Require MFA |
| aws:TokenIssueTime | NumericDate | Session age limit |

### Guardrail Policies

| Policy Name | Purpose | Description |
|-------------|---------|-------------|
| **Deny Billing Changes** | Prevent cost surprises | Deny billing console and API access |
| **Deny Region Access** | Comply with data residency | Deny actions in restricted regions |
| **Enforce Tagging** | Required tags on resource creation | aws:RequestTag conditions |
| **Deny Root Usage** | Prevent root account operations | Deny all for root user |
| **Deny Unencrypted S3** | Enforce encryption | Deny S3 PUT without encryption headers |

---

## AWS SSO / Identity Center

### Comparison: IAM Users vs Identity Center

| Feature | IAM Users | Identity Center (AWS SSO) |
|---------|-----------|--------------------------|
| **Password Management** | Per-user, manual | Centralized, SSO |
| **MFA** | Per-user configuration | Centralized enforcement |
| **Access Assignment** | IAM groups/policies | Permission sets on roles |
| **Just-in-Time Access** | No | Yes, time-bound elevation |
| **Audit Trail** | CloudTrail | Access report + CloudTrail |
| **External IdP** | SAML 2.0 setup | Native SAML/OIDC integration |
| **Recommendation** | **Avoid for humans** | **Use for all human access** |

### Permission Sets

| Concept | Description |
|---------|-------------|
| **Permission Set** | Reusable collection of IAM policies |
| **Assignment** | Links user/group to permission set to AWS account |
| **Session Duration** | Configurable per permission set (1-12 hours) |
| **Inline Policies** | Attached directly to permission set |
| **Managed Policies** | AWS or customer managed policies |

---

## Access Management for Services

### Service-Linked Roles

| Service | Role Purpose | Auto-Created |
|---------|-------------|--------------|
| **Auto Scaling** | Manage EC2 instances | Yes |
| **Elastic Load Balancing** | Describe/modify instances | Yes |
| **RDS** | Manage DB instances | Yes |
| **ECS** | Manage tasks and containers | Yes |
| **CloudFormation** | Create/manage resources | Yes |

### Cross-Account Access Patterns

| Pattern | Description | Use Case |
|---------|-------------|----------|
| **Role Assumption** | Account A assumes role in Account B | Centralized access management |
| **External ID** | Additional verification token | Third-party vendor access |
| **Organization SCPs** | Service Control Policies | Guardrails across accounts |
| **RAM Sharing** | Resource Access Manager | Share subnets, transit gateways |

```mermaid
graph LR
    A1[Admin in Account A] -->|sts:AssumeRole| R2[Role in Account B]
    R2 -->|trust policy| B1[AWS:arn:aws:iam::B:root]
    R2 -->|permission policy| R2R[Account B Resources]
    A1 -.->|ExternalId condition| R2
    style A1 fill:#bbf,stroke:#333,color:#000
    style R2 fill:#f9d,stroke:#333,stroke-width:2px,color:#000
    style R2R fill:#dfd,stroke:#333,color:#000
```

---

## Credential Management

### Credential Types

| Type | Lifetime | Use Case | Rotation |
|------|----------|----------|----------|
| **Access Keys** | Indefinite (manual rotation) | CLI, SDK, scripts | Rotate every 90 days |
| **STS Tokens** | 15 min - 12 hours | Temporary access | Auto-expire |
| **SSO Tokens** | Session duration | Console, CLI via SSO | Auto-expire |
| **Web Identity Tokens** | Provider-dependent | Mobile/web apps | Auto-expire |

### Credential Rotation Checklist

| Action | Frequency | Tool |
|--------|-----------|------|
| Rotate access keys | Every 90 days | IAM console, CLI |
| Disable unused keys | Monthly | Credential report |
| Remove inactive users | Quarterly | IAM Access Advisor |
| Review root key usage | Monthly | CloudTrail |
| Audit policy attachments | Quarterly | IAM Access Analyzer |

---

## AWS Organizations & SCPs

### SCP Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Allow List SCP** | Explicitly allow specific services/actions | Restrict to approved services only |
| **Deny List SCP** | Deny specific services/actions | Block dangerous operations |
| **Baseline SCP** | Applied to all accounts | Organization-wide guardrails |

### Common SCP Patterns

| SCP | Purpose | Actions Affected |
|-----|---------|-----------------|
| **Deny IAM Changes** | Prevent privilege escalation | iam:DeleteUser, iam:AttachPolicy |
| **Deny Region Access** | Data sovereignty | All actions in non-approved regions |
| **Deny Service Termination** | Prevent accidental deletion | ec2:TerminateInstances, rds:DeleteDBInstance |
| **Deny Public S3** | Prevent data exposure | s3:PutBucketPolicy (public) |
| **Deny Key Deletion** | Protect encryption | kms:ScheduleKeyDeletion |

---

## Monitoring & Auditing

| Tool | Purpose | Frequency |
|------|---------|-----------|
| **CloudTrail** | API call logging | Continuous |
| **IAM Access Analyzer** | Find unused permissions | Weekly review |
| **Credential Report** | List all users and key status | Monthly |
| **Access Advisor** | Service access history | Per-user review |
| **AWS Config Rules** | IAM policy compliance | Continuous |

### Key CloudTrail Events to Monitor

| Event | Concern | Action |
|-------|---------|--------|
| `ConsoleLogin` with `Failure` | Brute force attempt | Alert, block IP |
| `CreateAccessKey` | New credential creation | Verify authorization |
| `AttachUserPolicy` with `AdministratorAccess` | Privilege escalation | Alert immediately |
| `DeleteUser` | Account removal | Verify authorization |
| `PutUserPolicy` | Inline policy change | Review policy content |
| `AssumeRole` | Role assumption | Verify source and purpose |
