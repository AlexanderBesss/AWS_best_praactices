# VPC Best Practices

## Network Architecture

### Recommended VPC Design

| Component | Recommendation | CIDR Example |
|-----------|---------------|--------------|
| **VPC CIDR** | /16 for maximum flexibility | 10.0.0.0/16 (65,536 IPs) |
| **Public Subnets** | /24 per AZ (minimum 2 AZs) | 10.0.1.0/24, 10.0.2.0/24 |
| **Private Subnets** | /24 per AZ (minimum 2 AZs) | 10.0.10.0/24, 10.0.11.0/24 |
| **Database Subnets** | /24 per AZ, isolated | 10.0.20.0/24, 10.0.21.0/24 |
| **Elasticsearch Subnets** | /24 per AZ, isolated | 10.0.30.0/24, 10.0.31.0/24 |

### Subnet Sizing

| CIDR | Usable Hosts | Use Case |
|------|-------|----------|
| /28 | 11 | Minimum subnet size, NAT gateway, single instance |
| /27 | 27 | Small deployments |
| /26 | 59 | Medium deployments |
| /25 | 123 | Large deployments |
| /24 | 251 | Standard, recommended default |
| /23 | 507 | High-density deployments |
| /22 | 1019 | Very large deployments |

> **Note:** AWS reserves 5 IPs in each subnet (network address, VPC router, DNS, future use, and broadcast address), and /28 is the smallest subnet AWS allows.

```mermaid
graph TB
    subgraph VPC[VPC 10.0.0.0/16]
        subgraph Public[Public Subnets]
            PS1[PS-AZ1 10.0.1.0/24]
            PS2[PS-AZ2 10.0.2.0/24]
        end
        subgraph Private[Private Subnets]
            PRS1[PRS-AZ1 10.0.10.0/24]
            PRS2[PRS-AZ2 10.0.11.0/24]
        end
        subgraph DB[Database Subnets]
            DB1[DB-AZ1 10.0.20.0/24]
            DB2[DB-AZ2 10.0.21.0/24]
        end
        IGW[(Internet Gateway)]
        NAT[NAT Gateway]
        VPCE[VPC Endpoints]
    end
    Internet[(Internet)] <---> IGW
    IGW --> PS1
    IGW --> PS2
    PS1 --> NAT
    NAT --> PRS1
    NAT --> PRS2
    VPCE --> PRS1
    VPCE --> PRS2
    PRS1 --> DB1
    PRS2 --> DB2
    style IGW fill:#f9d,stroke:#333,stroke-width:2px,color:#000
    style NAT fill:#f9d,stroke:#333,stroke-width:2px,color:#000
    style VPCE fill:#f9d,stroke:#333,color:#000
    style Internet fill:#ddd,stroke:#333,color:#000
```

---

## Connectivity Options

### Internet Access

| Component | Purpose | Placement |
|-----------|---------|-----------|
| **Internet Gateway (IGW)** | Direct (non-NAT) two-way internet access for resources with public IPs | One per VPC, horizontally scaled and highly available |
| **NAT Gateway** | Outbound internet for private subnets | One per AZ in public subnet |
| **NAT Instance** | Low-cost alternative to NAT GW | Public subnet with public IP/Elastic IP |

### VPC Peering

| Feature | Description |
|---------|-------------|
| **Same Region** | Connect VPCs in same region |
| **Cross Region** | Connect VPCs across regions |
| **Different Accounts** | Peer VPCs owned by different AWS accounts |
| **No Transitive Peering** | Peering connections are not transitive |
| **No Overlapping CIDRs** | CIDR blocks must not overlap |

### AWS Transit Gateway

| Feature | Description | Benefit |
|---------|-------------|---------|
| **Hub-and-Spoke** | Centralized connectivity model | Simplifies VPC management |
| **Route Table Propagation** | Automatic route sharing | Reduces manual routing |
| **Transitive Routing** | Traffic flows through hub | Eliminates peering mesh |
| **Inter-Region Peering** | Connect TGWs across regions | Global network fabric |
| **On-Premises Connect** | Direct Gateway for Direct Connect | Hybrid cloud integration |

### Connectivity Comparison

| Method | Latency | Bandwidth | Use Case |
|--------|---------|-----------|----------|
| **VPC Peering** | Low | Up to VPC limit | Simple, 1-to-1 connections |
| **Transit Gateway** | Low | Up to 50 Gbps per VPC attachment | Hub-and-spoke, many VPCs |
| **Direct Connect** | Lowest | Up to 100 Gbps | Dedicated, predictable performance |
| **Site-to-Site VPN** | Low-Medium | Up to 1.25 Gbps | Quick hybrid connectivity |
| **Client VPN** | Low-Medium | Per-user | Remote worker access |
| **AWS VPN CloudHub** | Low-Medium | Hub-and-spoke VPN | Multiple sites via VPN |

```mermaid
graph LR
    subgraph OnPrem[On-Premises]
        DC[Data Center]
    end
    subgraph AWS[AWS Cloud]
        VPC1[VPC 1]
        VPC2[VPC 2]
        VPC3[VPC 3]
        TGW[Transit Gateway]
    end
    DC <-->|Direct Connect| TGW
    DC <-->|Site-to-Site VPN| TGW
    VPC1 <--> TGW
    VPC2 <--> TGW
    VPC3 <--> TGW
    VPC1 -.->|VPC Peering| VPC2
    style TGW fill:#f9d,stroke:#333,stroke-width:3px,color:#000
    style DC fill:#bbf,stroke:#333,color:#000
    style VPC1 fill:#dfd,stroke:#333,color:#000
    style VPC2 fill:#dfd,stroke:#333,color:#000
    style VPC3 fill:#dfd,stroke:#333,color:#000
```

---

## Security Groups

### Security Group Best Practices

| Practice | Description |
|----------|-------------|
| **Use SG references** | Reference other SGs instead of IP ranges |
| **Default deny** | All SGs start with no rules |
| **Named SGs** | Use descriptive names (e.g., `web-allow-https`) |
| **Minimal rules** | Fewest rules necessary |
| **Audit regularly** | Review and remove unused rules |
| **SG modifications take effect immediately** | No instance restart required for rule changes |

### Common SG Configurations

| Resource | Inbound Rules | Outbound Rules |
|----------|--------------|----------------|
| **Web Server (ALB)** | TCP/443 from 0.0.0.0/0, TCP/80 from 0.0.0.0/0 | All to private app SG |
| **Application Server** | TCP/8080 from ALB SG | TCP/5432 to DB SG, TCP/443 to IGW |
| **Database** | TCP/5432 from app SG only | TCP/443 to S3 endpoint, TCP/443 to patch repos, TCP/5432 to replicas |
| **Bastion Host** | TCP/22 from corporate IP only | All to private subnets |
| **Batch Worker** | None (or from coordinator SG) | TCP/443 to S3 VPC endpoint |

---

## AWS Network Firewall & Gateway Load Balancer

| Component | Purpose | Placement |
|-----------|---------|-----------|
| **AWS Network Firewall** | Stateful, managed IDS/IPS and traffic filtering (domain, protocol, signature-based rules) | Dedicated inspection subnet/VPC, typically routed via Transit Gateway |
| **Gateway Load Balancer (GWLB)** | Transparently insert third-party virtual appliances (firewalls, IDS/IPS) inline | Centralized inspection VPC, paired with GWLB endpoints in spoke VPCs |
| **Centralized Inspection Architecture** | Route inter-VPC/internet traffic through a shared inspection VPC | Combine with Transit Gateway for hub-and-spoke traffic inspection |

---

## Network ACLs

### NACL vs Security Group

| Feature | Security Group | Network ACL |
|---------|---------------|-------------|
| **Level** | Instance level | Subnet level |
| **Stateful** | Yes (return traffic auto-allowed) | No (explicit rules needed) |
| **Rules** | Allow only | Allow and Deny |
| **Scope** | Specific instances | All instances in subnet |
| **Rule Numbers** | No ordering | Ordered by rule number |
| **Default** | Deny all | Allow all (default) |

### NACL Rule Design

| Rule # | Type | Protocol | Port | Action | Purpose |
|--------|------|----------|------|--------|---------|
| 100 | HTTPS | TCP | 443 | Allow | Inbound HTTPS |
| 200 | HTTP | TCP | 80 | Allow | Inbound HTTP |
| 300 | Ephemeral | TCP | 1024-65535 | Allow | Return traffic |
| 400 | All Traffic | All | All | Deny | Explicit deny all |

---

## DNS & DHCP

### VPC DNS Settings

| Setting | Value | Description |
|---------|-------|-------------|
| **enableDnsSupport** | **true** | Required for DNS resolution in VPC |
| **enableDnsHostnames** | **true** | Instances get DNS hostnames |

### Private Hosted Zones

| Feature | Description |
|---------|-------------|
| **Association** | Link to one or more VPCs |
| **Resolution** | Only resolves within associated VPCs |
| **Use Case** | Internal domain names (e.g., `app.internal`) |
| **Integration** | Works with Route 53 Resolver |

---

## VPC Endpoints

### Interface Endpoints (PrivateLink)

| Service | Endpoint Type | Cost | Use Case |
|---------|--------------|------|----------|
| S3 | Gateway | Free | Private S3 access |
| DynamoDB | Gateway | Free | Private DynamoDB access |
| Lambda | Interface | $ per hour + data | Private Lambda invocation |
| SNS/SQS | Interface | $ per hour + data | Private messaging |
| Secrets Manager | Interface | $ per hour + data | Private secret retrieval |
| KMS | Interface | $ per hour + data | Private key operations |

### Endpoint Best Practices

| Practice | Description |
|----------|-------------|
| **Use Gateway endpoints** for S3/DynamoDB | Free, high performance |
| **Deploy in multiple AZs** | High availability |
| **Restrict with policies** | Limit accessible resources |
| **Use PrivateLink** | Access third-party services privately |
| **Monitor with CloudWatch** | Track endpoint metrics |

---

## Flow Logs

### Flow Log Configuration

| Setting | Recommendation | Reason |
|---------|---------------|--------|
| **Log Level** | ACCEPT and REJECT | Full visibility |
| **Destination** | S3 or CloudWatch Logs | Storage and analysis |
| **Traffic Type** | ALL | Capture all traffic |
| **Max Aggregation Interval** | 10 minutes | Balance cost and granularity |
| **TLS Encryption** | Enabled | Protect log data |

### Flow Log Analysis

| Use Case | Tool | Description |
|----------|------|-------------|
| **Security monitoring** | GuardDuty | Threat detection from flow logs |
| **Custom analysis** | Athena | SQL queries on flow log data |
| **Real-time alerts** | CloudWatch Logs Insights | Pattern-based alerts |
| **Visualization** | QuickSight | Traffic dashboards |

---

## Multi-AZ and Multi-Region

### High Availability Design

| Component | Single AZ | Multi-AZ | Multi-Region |
|-----------|-----------|----------|--------------|
| **Availability** | Low (AZ failure = downtime) | Medium (AZ failure = failover) | High (region failure = failover) |
| **Cost** | Lowest | Medium | Highest |
| **Complexity** | Low | Medium | High |
| **RTO** | Hours | Minutes | Minutes to hours |
| **RPO** | Backup interval | Near-zero | Near-zero |

### Disaster Recovery Strategies

| Strategy | RTO | RPO | Cost | Complexity |
|----------|-----|-----|------|------------|
| **Backup & Restore** | Hours to days | Last backup | Lowest | Low |
| **Pilot Light** | Hours | Minutes to hours | Low | Medium |
| **Warm Standby** | Minutes to hours | Near-zero | Medium | Medium |
| **Multi-Site Active-Active** | Minutes | Near-zero | Highest | High |

---

## CIDR Planning

### Private IP Ranges (RFC 1918)

| Range | CIDR | Total Hosts |
|-------|------|-------------|
| 10.0.0.0 - 10.255.255.255 | /8 | 16,777,216 |
| 172.16.0.0 - 172.31.255.255 | /12 | 1,048,576 |
| 192.168.0.0 - 192.168.255.255 | /16 | 65,536 |

### Overlap Avoidance

| Scenario | Risk | Solution |
|----------|------|----------|
| VPC peering with overlapping CIDRs | Not allowed | Use different CIDR ranges |
| Direct Connect with on-prem overlap | Route conflicts | Re-IP or use Transit Gateway |
| Multiple accounts in Organization | Planning complexity | Centralized IPAM |

### AWS IP Address Manager (IPAM)

| Feature | Description |
|---------|-------------|
| **Centralized pooling** | Manage IP address pools across accounts |
| **Automatic CIDR allocation** | Assign non-overlapping CIDRs to VPCs |
| **Hierarchical pools** | Organization > Region > Account structure |
| **Overlap detection** | Prevent CIDR conflicts proactively |
| **Public IP management** | Track and manage public IP addresses |
