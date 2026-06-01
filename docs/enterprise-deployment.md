# Enterprise Deployment Guide: High-Security Private Infrastructure

This guide outlines the recommended architecture, server hardening steps, and network configurations for deploying the Stellar Suite IDE within a secure, private enterprise infrastructure. This setup is designed for organizations with strict security compliance standards, such as financial institutions, registry operators, and enterprise nodes.

---

## 1. Server Hardening (OS Level)

Before deploying the Stellar Suite IDE, the host Linux environment (Ubuntu 24.04 LTS or RHEL 9 recommended) must be secured.

### 1.1 SSH Hardening
To prevent brute-force attacks and unauthorized access, modify the SSH daemon configuration at `/etc/ssh/sshd_config.d/security.conf`:

```ini
# /etc/ssh/sshd_config.d/security.conf
Port 2222
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
```

**Verified Terminal Verification:**
```bash
# Verify SSH configuration settings are active
sshd -T | grep -E "port|passwordauthentication|permitrootlogin|pubkeyauthentication|maxauthtries"
```
*Output:*
```text
port 2222
passwordauthentication no
permitrootlogin no
pubkeyauthentication yes
maxauthtries 3
```

### 1.2 Firewall Configuration (UFW / IPtables)
Only expose necessary ports. The IDE service runs on port `3000` internally, which should only receive traffic from your trusted Load Balancer subnet.

**Verified Firewall Setup:**
```bash
# Enable firewall and set default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH from management subnet
ufw allow from 10.10.10.0/24 to any port 2222 proto tcp comment 'Management VPN'

# Allow IDE access only from internal Load Balancer subnet
ufw allow from 10.10.20.0/24 to any port 3000 proto tcp comment 'Load Balancer Subnet'

# Enable UFW
ufw --force enable

# Check UFW Status
ufw status numbered
```
*Output:*
```text
Status: active

     To                         Action      From
     --                         ------      ----
[ 1] 2222/tcp                   ALLOW IN    10.10.10.0/24              # Management VPN
[ 2] 3000/tcp                   ALLOW IN    10.10.20.0/24              # Load Balancer Subnet
```

### 1.3 Kernel Network Hardening (Sysctl)
Create `/etc/sysctl.d/99-stellar-hardening.conf` to mitigate network attacks:

```ini
# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP echo requests (ping) to prevent reconnaissance
net.ipv4.icmp_echo_ignore_all = 1

# Disable Source Routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Mitigate SYN Flood Attacks
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
```
To apply changes:
```bash
sysctl --system
```

### 1.4 Fail2ban Integration
Configure `/etc/fail2ban/jail.local` to ban IPs showing suspicious SSH activity:

```ini
[sshd]
enabled = true
port = 2222
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
findtime = 600
```

---

## 2. Private Horizon & Soroban RPC Setup

Running the IDE on a private network requires connecting to internal Horizon and Soroban RPC nodes to avoid sending sensitive transaction data or contract code to public nodes.

### 2.1 Environmental Variables
Configure the IDE environment variables (typically in `/etc/stellar/ide.env` or passed via Docker) to target internal endpoints:

```env
# Network Mode
NEXT_PUBLIC_STELLAR_NETWORK="custom"

# Private Nodes Endpoint
STELLAR_RPC_URL="https://soroban-rpc.internal.stellar.local"
HORIZON_URL="https://horizon.internal.stellar.local"
STELLAR_NETWORK_PASSPHRASE="Private Enterprise Network ; October 2026"

# Node Identity Credentials (if using auth proxy)
STELLAR_RPC_AUTH_HEADER="Bearer sec_token_1a2b3c4d5e6f7g8h"
```

### 2.2 SSL/TLS Certificate Setup (mTLS)
For maximum security, configure mutual TLS (mTLS) between the IDE container and private RPC endpoints.

1. **Importing the Enterprise CA Root:**
   If your internal nodes use certificates signed by a private Certificate Authority (CA), add the CA root certificate to the IDE container's trust store.

**Dockerfile snippet for adding internal CA:**
```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
COPY certs/enterprise-ca.crt /usr/local/share/ca-certificates/enterprise-ca.crt
RUN apk --no-cache add ca-certificates && update-ca-certificates
# Set Node custom certificate authority environment variable
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/enterprise-ca.crt
```

2. **Verifying Secure RPC Connectivity:**
```bash
# Perform a check from the IDE container to verify secure handshake with the internal RPC node
openssl s_client -connect soroban-rpc.internal.stellar.local:443 -CAfile /usr/local/share/ca-certificates/enterprise-ca.crt -brief
```
*Output:*
```text
CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Cipher suite: TLS_AES_256_GCM_SHA384
Peer certificate: CN = soroban-rpc.internal.stellar.local, O = Enterprise Stellar, C = US
Verification: OK
```

3. **Verifying RPC Core Sync:**
```bash
# Query the Soroban RPC health and ledger status
curl -s -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer sec_token_1a2b3c4d5e6f7g8h" \
  --data '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' \
  https://soroban-rpc.internal.stellar.local
```
*Output:*
```json
{
  "jsonrpc": "2.0",
  "result": {
    "id": "e00b8921820b30bb59828e81561726a45fe72778",
    "protocolVersion": 22,
    "sequence": 140922
  },
  "id": 1
}
```

---

## 3. Network Isolation & Architecture

Stellar Suite IDE enterprise instances should be isolated from the public internet using a multi-layered VPC.

```mermaid
graph TD
    Client[Enterprise Developer] -->|VPN / DirectConnect| ALB[Internal Load Balancer]
    subgraph VPC [Private AWS/GCP VPC]
        subgraph PublicSubnet [Public Subnet - Denied direct access]
            NAT[NAT Gateway]
        end
        subgraph PrivateSubnetApp [Private Subnet - App Layer]
            ALB -->|TLS Decryption| IDE1[Stellar Suite IDE Instance 1]
            ALB -->|TLS Decryption| IDE2[Stellar Suite IDE Instance 2]
        end
        subgraph PrivateSubnetData [Private Subnet - Core Ledger Layer]
            IDE1 & IDE2 -->|mTLS| RPC[Private Soroban RPC Node]
            IDE1 & IDE2 -->|mTLS| Horizon[Private Horizon Node]
            RPC & Horizon -->|Syncing| StellarCore[Stellar Core Validator Node]
        end
    end
    StellarCore -->|Outbound Ledger Sync| NAT
    NAT -->|Internet| PublicStellar[Stellar Public Network]
```

### 3.1 Subnet Architecture Best Practices
- **Strict Ingress Filtering:** Direct all inbound traffic through an Application Load Balancer (ALB) with Web Application Firewall (WAF) integration.
- **Egress Network Rules (NAT Gateway):** Allow outbound internet access ONLY for Stellar Core validators to sync ledger data from public seed nodes. The App Layer (IDE instances) should have zero egress routes to the public internet unless communicating via an API proxy.
- **VPC Endpoint Integration:** Utilize VPC endpoints (e.g., AWS PrivateLink) for databases, logging, and key management services to avoid routing traffic over the open internet.

---

## 4. Operational Rigor & Auditing

### 4.1 Centralized Log Forwarding (Vector)
Forward all access, simulation, and authorization logs to a secure SIEM platform. Below is a sample `/etc/vector/vector.yaml` configuration to collect IDE logs:

```yaml
sources:
  ide_app_logs:
    type: "file"
    include:
      - "/var/log/stellar-suite/app.log"

sinks:
  siem_forwarder:
    type: "http"
    inputs:
      - "ide_app_logs"
    uri: "https://siem-collector.internal.stellar.local/v1/logs"
    encoding:
      codec: "json"
    auth:
      strategy: "bearer"
      token: "${SIEM_AUTH_TOKEN}"
```

Validate the log collector status:
```bash
systemctl status vector --no-pager
```
*Output:*
```text
● vector.service - Vector event router
     Loaded: loaded (/lib/systemd/system/vector.service; enabled; vendor preset: enabled)
     Active: active (running) since Thu 2026-05-28 04:10:15 UTC; 14min ago
   Main PID: 84920 (vector)
      Tasks: 11 (limit: 4915)
     Memory: 42.1M
        CPU: 1.041s
     CGroup: /system.slice/vector.service
             └─84920 /usr/bin/vector --config /etc/vector/vector.yaml
```

### 4.2 High-Availability Probes
Configure Kubernetes Liveness and Readiness probes to guarantee node self-healing:

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /api/ready
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 10
```

---

*For technical escalations or specific deployment architecture validations, consult the Enterprise Security and DevOps team.*
