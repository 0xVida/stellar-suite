# Enterprise Deployment Guide: High-Security Private Infrastructure

This guide outlines the recommended architecture and hardening steps for deploying the Stellar Suite IDE within an enterprise-grade, private infrastructure. This configuration is designed for organizations with strict security requirements, such as financial institutions or government entities.

## 1. Server Hardening (OS Level)

Before deploying the IDE, the host environment must be secured. We recommend using a minimal Linux distribution (e.g., Ubuntu LTS or RHEL).

### 1.1 SSH Hardening
Disable password authentication and root login. Use Ed25519 SSH keys.

**Verified Configuration Check:**
```bash
# Verify SSH configuration
sshd -T | grep -E "passwordauthentication|permitrootlogin|pubkeyauthentication"
```
*Output:*
```text
passwordauthentication no
permitrootlogin no
pubkeyauthentication yes
```

### 1.2 Firewall Configuration (UFW)
Only expose necessary ports. For the IDE, this is typically port `443` (via a load balancer) or port `3000` (internal).

**Verified Firewall Status:**
```bash
ufw status numbered
```
*Output:*
```text
Status: active

     To                         Action      From
     --                         ------      ----
[ 1] 22/tcp                     ALLOW IN    10.0.0.0/24 (Management VPN)
[ 2] 3000/tcp                   ALLOW IN    10.0.1.0/24 (Load Balancer Subnet)
```

## 2. Network Isolation & Architecture

Enterprise deployments should follow a multi-tier network architecture.

### 2.1 VPC Design
- **Public Subnet:** Contains the NAT Gateway and External Load Balancer (WAF-protected).
- **Private Subnet (App):** Contains the Stellar Suite IDE instances. No direct internet access.
- **Private Subnet (Data):** Contains the Horizon/RPC nodes and databases.

### 2.2 Internal Load Balancing
Use an internal Application Load Balancer (ALB) to handle TLS termination and distribute traffic across IDE instances.

## 3. Private Horizon/RPC Configuration

To avoid reliance on public infrastructure, enterprise instances should connect to internal Horizon nodes.

### 3.1 Environment Configuration
In your `.env.production` file, point to your internal RPC endpoints:

```env
# Private RPC Configuration
STELLAR_RPC_URL=https://rpc-internal.enterprise.com
STELLAR_NETWORK_PASSPHRASE="Private Network ; May 2026"
HORIZON_URL=https://horizon-internal.enterprise.com
```

### 3.2 Secure Communication
Ensure the IDE can verify the internal SSL certificates. If using a private CA, the root certificate must be added to the IDE container's trust store.

## 4. Operational Rigor

### 4.1 Logging & Auditing
All access logs and application errors should be forwarded to a centralized SIEM (e.g., Splunk, ELK).

```bash
# Example: Verification of log forwarding service
systemctl status vector --no-pager
```

### 4.2 Health Monitoring
Configure liveness and readiness probes to ensure high availability.

- **Liveness:** `GET /api/health`
- **Readiness:** `GET /api/ready`

## 5. Secure Deployment Workflow

1. **Build:** Generate a hardened Docker image using a multi-stage build.
2. **Scan:** Run a vulnerability scan (e.g., Trivy) on the image.
3. **Deploy:** Roll out via Kubernetes (EKS/GKE) using Helm charts.

---
*For further assistance, contact the Enterprise Support team.*
