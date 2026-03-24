# ⚙️ General DevOps — Scenario-Based Interview Questions

**Q1. [L1] A developer pushes code that passes all unit tests and builds successfully in CI, but when it deploys to production, the application crashes immediately. Why might this happen?**

> *What the interviewer is testing:* Configuration Drift, 12-Factor App methodology.

**Answer:**
This is the classic "It works on my machine" problem scaled to production. The most common causes are:
1. **Configuration Mismatch:** The production environment relies on environment variables, secrets, or database URLs that are either missing, misspelled, or configured for the staging environment (e.g., trying to write to a staging DB with production locked-down credentials).
2. **Dependency Drift:** The CI pipeline might be downloading the "latest" version of a transitive dependency (npm, pip, maven) which introduced a breaking change not captured in the developer's local `package-lock` or `requirements.txt`.
3. **Infrastructure Differences:** The code might have an implicit assumption about the underlying OS (e.g., specific file paths, package versions) that differs between the local/CI environment and production.

---

**Q2. [L2] Your team manages an application that writes millions of logs to disk each hour. Suddenly, all disks across the fleet fill up simultaneously, causing a massive outage. What is the fundamental architecture flaw, and how do you fix it?**

> *What the interviewer is testing:* Log rotation, log shipping, decoupling state.

**Answer:**
The architectural flaw is storing unbounded state (logs) on the application instance's local filesystem without rotation.
An SRE fix involves:
1. **Log Rotation:** Immediately configure `logrotate` to compress and delete logs older than a few hours or when they exceed a certain MB threshold. This caps the maximum disk usage.
2. **Decoupling State:** In modern DevOps (e.g., Docker/Kubernetes), applications shouldn't manage log files on disk at all. Applications should log purely to `STDOUT` and `STDERR`. A DaemonSet or sidecar agent (like Fluentbit or Filebeat) acts as a pipe, reading those streams and shipping them entirely off the host to a centralized aggregator (Datadog/Elasticsearch) preventing local disk exhaustion completely.

---

**Q3. [L3] A critical production database in AWS RDS goes down due to an underlying hardware failure in `us-east-1a`. How does the application recover if you have Multi-AZ enabled? What is the expected downtime?**

> *What the interviewer is testing:* RDS Multi-AZ failover mechanics, DNS TTL.

**Answer:**
Multi-AZ RDS maintains a synchronous standby replica in a different Availability Zone (e.g., `us-east-1b`).
When the primary hardware fails:
1. AWS detects the heartbeat failure.
2. It automatically promotes the synchronous standby in `us-east-1b` to become the new primary.
3. Crucially, AWS updates the backend CNAME DNS record of the database endpoint to point to the new primary's IP address.
**Downtime:** The failover process typically takes **60 to 120 seconds**. The application *will* experience database connection drops during this time. The application's database connection pool must be configured to automatically sever dead connections, resolve the DNS again (respecting the short TTL), and reconnect seamlessly to the new primary once it comes online.

---

**Q4. [L1] Explain the difference between Blue/Green deployment and Canary deployment.**

> *What the interviewer is testing:* Deployment strategies, risk mitigation.

**Answer:**
- **Blue/Green:** You maintain two identical production environments. The current live environment is "Blue". You deploy the new code to the "Green" environment, run integration tests against it in isolation, and when ready, you instantaneously flip the router/load balancer to send 100% of user traffic to Green. If something goes wrong, you instantly flip the router back to Blue for a zero-downtime rollback. It requires 2x the infrastructure capacity.
- **Canary:** You deploy the new code to a small subset of servers (the "canary"), and route only a tiny percentage of traffic (e.g., 5%) to it. You monitor the error rates and metrics on the canary. If stable, you gradually increase traffic (10%, 25%, 100%). If it fails, only 5% of users are impacted, and it automatically rolls back. It requires complex traffic routing (like a Service Mesh or ALB weighted rules).

---

**Q5. [L2] Your team has deployed a new microservice that needs to talk to a legacy SOAP API hosted in a partner's data center. The partner has an IP whitelisting firewall. Since your microservices run on auto-scaling EC2 instances that constantly change IPs, how do you manage the whitelist?**

> *What the interviewer is testing:* NAT Gateways, Egress design, static IPs.

**Answer:**
To provide a static IP to a dynamically scaling fleet of instances, you must use a **NAT Gateway**.
1. Place all the dynamic EC2 Auto Scaling instances in a Private Subnet.
2. Deploy a NAT Gateway in a Public Subnet.
3. Attach an AWS **Elastic IP (EIP)** to the NAT Gateway. 
4. Route all outbound internet traffic (`0.0.0.0/0`) from the private subnet through the NAT Gateway.
All outbound HTTP requests from hundreds of dynamic EC2 instances will now appear to the partner's firewall as originating from the single, static Elastic IP of the NAT Gateway, which they can comfortably whitelist.

---

**Q6. [L2] A developer reports that their builds are taking 45 minutes because they compile massive C++ libraries from scratch every time they push to GitHub. How do you optimize the CI/CD pipeline?**

> *What the interviewer is testing:* Build caching, multi-stage docker builds, artifact repositories.

**Answer:**
Compiling dependencies from scratch on every commit wastes massive amounts of CI compute time.
To optimize:
1. **Docker Build Caching:** If using Docker, ensure the `Dockerfile` is structured correctly. Put `COPY package.json` (or CMake equivalent) and the compilation steps *before* copying the application source code. Docker will aggressively cache these intensive layers and only rebuild them if the dependency file itself changes.
2. **CI Distributed Caching:** Use GitHub Actions `actions/cache` or GitLab CI `cache` to save the compiled object files (`.o` files) or the dependency folder (`node_modules`/`~/.m2`) to an external S3 bucket/cache server. Subsequent runs restore this cache in seconds before compilation starts.
3. **Artifact Registry:** Pre-compile the heavy C++ libraries once during a nightly build, publish the binary to an artifact repository (like Artifactory or AWS ECR), and have the daily developer builds simply download the pre-compiled binary.

---

**Q7. [L3] Your company’s primary region (`us-east-1`) completely goes offline (a major AWS outage affecting the whole region). You are tasked with deciding when to trigger the Disaster Recovery failover to `us-west-2`. What metrics/business factors dictate this decision?**

> *What the interviewer is testing:* RTO, RPO, split-brain, cost of failover vs cost of downtime.

**Answer:**
A regional failover is the most destructive action an SRE can take; it risks massive data loss, split-brain scenarios, and hours of complex resolution. It should not be triggered lightly.

The decision is governed by **RTO (Recovery Time Objective)** and **RPO (Recovery Point Objective)**:
1. Is the outage estimated to last longer than our business-defined RTO? (e.g., if RTO is 4 hours, and AWS says it's an hour fix, we wait. If AWS says ETA unknown, we fail over).
2. What is the state of the cross-region database replication? If the replication lag was 2 hours behind when the region died, failing over now guarantees 2 hours of permanent data loss (violating a strict 1-hour RPO).
3. We must ensure the `us-east-1` environment is completely fenced off (DNS isolated) to prevent a "split-brain" where systems come back online and start writing conflicting data to the old primary database while the new `us-west-2` primary is active.

---

**Q8. [L1] Provide three immutable infrastructure practices.**

> *What the interviewer is testing:* Pet vs Cattle concept, Configuration Management vs Baking AMIs.

**Answer:**
1. **Never SSH and patch:** If an EC2 instance needs a security update or a configuration change, you never SSH into the live server to run `apt-get upgrade` or edit a config file. This creates "snowflakes".
2. **Bake Images (AMI Builder/Packer):** The new configuration is scripted via Packer or Docker. A fresh, fully-configured Amazon Machine Image (AMI) or Docker Image is stamped out into an artifact registry.
3. **Replace, don't update:** The infrastructure orchestrator (Terraform/Auto Scaling Group) terminates the old instances completely and spawns identical fresh instances from the newly baked image.

---

**Q9. [L3] An application exposes an endpoint `/generate-report`. It takes 30 seconds to run a heavy database query and return a PDF. If three users click it simultaneously, the server CPU hits 100% and crashes. How do you redesign this architecture for scale?**

> *What the interviewer is testing:* Asynchronous processing, message queues, worker patterns.

**Answer:**
The current architecture is **Synchronous** and deeply coupled, blocking the web server thread and exhausting resources.
It must be redesigned to an **Asynchronous / Event-Driven Pattern**:
1. When the user hits `/generate-report`, the web server immediately pushes a message (JSON payload with the user ID and report parameters) onto a Message Queue (e.g., AWS SQS, RabbitMQ, Kafka).
2. The web server instantly returns an `HTTP 202 Accepted` response with a tracking ID to the user, freeing its thread.
3. An independent fleet of "Worker" instances pulls messages from the SQS queue at their own pace. If a worker can only handle 1 report at a time, it pulls 1 message. The queue absorbs the spike (buffering).
4. When the worker finishes generating the PDF, it uploads it to S3, and updates a database flag or triggers a WebSocket to notify the user's frontend that the report is ready to download.

---

**Q10. [L2] Your Auto Scaling Group (ASG) keeps starting new EC2 instances, but they immediately fail the load balancer health checks and are subsequently terminated by the ASG in an infinite "thrashing" loop. How do you debug this?**

> *What the interviewer is testing:* ASG lifecycle hooks, scaling failure modes, graceful startup.

**Answer:**
If the instance is terminated immediately upon failing the health check, you never get a chance to SSH in and look at the logs.
To debug:
1. **Suspend ASG Processes:** I would temporarily suspend the `Terminate` process on the ASG using the AWS Console or CLI. This allows the failing instance to remain alive so I can SSH in, check `/var/log/cloud-init-output.log` or the application logs, and find the syntax error or missing dependency crashing the boot script.
2. **Check Grace Period:** The application might naturally take 4 minutes to compile and start, but the ASG Health Check Grace Period might be set to 60 seconds. The ASG kills it prematurely because it hasn't finished booting. I would increase the Grace Period.
3. **Lifecycle Hooks:** Use an ASG Lifecycle Hook (`autoscaling:EC2_INSTANCE_LAUNCHING`) to place the instance in a `Pending:Wait` state while it boots, preventing the ALB from checking it until the instance explicitly signals it is fully ready.

---

**Q11. [L1] A user wants to manually delete a massive S3 bucket containing 100 million objects. They click "Delete" in the AWS Console, but it fails, saying the bucket is not empty. Using the CLI `aws s3 rm --recursive` might take days. What is the fastest, "Ops" way to delete it?**

> *What the interviewer is testing:* S3 Lifecycle policies, understanding of S3 scale.

**Answer:**
The fastest and most cost-effective way to delete millions of objects is to let the S3 backend do the work asynchronously.
I would apply an **S3 Lifecycle Rule** to the bucket:
1. Set the rule to target the entire bucket (no prefix filter).
2. Set the action to "Expire current versions of objects" and "Permanently delete noncurrent versions" after **1 day**.
3. Apply the rule. Over the next 24-48 hours, AWS backend processes will asynchronously and freely sweep through the bucket and delete all 100 million objects. Once empty, I can simply delete the bucket.

---

**Q12. [L2] You have a cron job script taking database backups at 2 AM every night. One night, the backup takes 25 hours instead of 2 hours because the DB grew. At 2 AM the next night, the cron job fires again. Now two heavy backups are running simultaneously, locking the DB. How do you prevent this in the script?**

> *What the interviewer is testing:* Idempotency, locking mechanisms (flock/pid files).

**Answer:**
Cron jobs must be designed to be self-aware of overlapping executions.
This is solved using **File Locking**. The script must attempt to acquire an exclusive lock before running the heavy operation. If it cannot get the lock, it immediately exits.
In Linux, the standard tool is `flock`:
`0 2 * * * /usr/bin/flock -n /var/run/backup.lock /path/to/backup_script.sh`
The `-n` (non-blocking) flag tells `flock` to immediately fail if the lock file is currently held by a previous, still-running instance of the script. This guarantees only one backup can ever run at a time.

---

**Q13. [L2] Your team uses Terraform. Developer A runs `terraform apply`, but Developer B runs `terraform apply` on the same directory at the exact same time. What happens, and what mechanism should be in place to prevent disaster?**

> *What the interviewer is testing:* State locking, DynamoDB/S3 backend architectures.

**Answer:**
If they are using local state or a remote state backend without locking (e.g., basic S3 only), both executions will run simultaneously. They will race to update the cloud APIs, resulting in massive resource conflict, split-brain infrastructure, and guaranteed corruption of the `terraform.tfstate` file.
To prevent this, production DevOps teams use a **Remote Backend with State Locking**.
The standard AWS architecture is storing the state file in S3, and using a **DynamoDB Table** for the lock.
When Developer A runs `apply`, Terraform automatically writes a lock entry to DynamoDB. When Developer B runs `apply` a millisecond later, Terraform checks DynamoDB, sees the lock, and immediately aborts Developer B's run with a `Lock exists` error, safely protecting the state.

---

**Q14. [L3] A legacy monolithic application is tightly coupled to a single master database. You want to break it into microservices, but they all still query the massive 10TB monolithic database. What is this anti-pattern called, and how do you migrate away from it?**

> *What the interviewer is testing:* Integration Database anti-pattern, Strangler Fig pattern, database per service.

**Answer:**
The anti-pattern is an **Integration Database**. It ruins the benefits of microservices because the database becomes a massive single point of failure; a schema change by Service A breaks Service B, and scaling the DB becomes near impossible.
The migration approach is the **Strangler Fig Pattern** combined with **Database per Service**:
1. Identify a small, bounded context (e.g., User Profiles) in the monolith.
2. Build the new `UserProfileService` and give it its own entirely separate, small database.
3. Keep them in sync during migration using Change Data Capture (CDC, like Debezium) streaming from the monolith DB to the new DB.
4. Update the API Gateway to route `/users` traffic to the new microservice.
5. Once stable, sever the sync and delete the tables from the monolithic database. Repeat for all domains until the monolith is "strangled."

---

**Q15. [L1] Explain the difference between Continuous Integration (CI), Continuous Delivery (CD), and Continuous Deployment (CD).**

> *What the interviewer is testing:* DevOps core definitions.

**Answer:**
1. **Continuous Integration (CI):** Developers frequently merge their code changes into a central repository mainline. Automated builds and unit tests run immediately on every commit to ensure the codebase remains stable and compilable.
2. **Continuous Delivery (CD):** The step after CI. Code that passes CI is automatically built into a release artifact (like a Docker image) and deployed to a staging/UAT environment. The code is *always in a deployable state*, but deploying to Production still requires a **manual human approval** button click.
3. **Continuous Deployment (CD):** A more advanced evolution where every change that passes all automated tests in the pipeline is deployed directly into Production automatically. There is **no explicit human intervention** step.

---

**Q16. [L2] You have an architecture running 50 identical EC2 instances. You need to deploy a rapid emergency patch. Using Ansible, what is the problem with running the playbook against the inventory sequentially, and how do you speed it up?**

> *What the interviewer is testing:* Parallel execution, forks, Ansible configuration.

**Answer:**
By default, Ansible runs tasks against hosts sequentially or with a severely limited parallel factor (the default `forks` parameter in `ansible.cfg` is 5). 
If patching takes 2 minutes per host, running with 5 forks against 50 instances will take 20 minutes ((50/5) * 2). In a critical emergency, this lead time is unacceptable.

To drastically speed it up, I would increase the parallel execution by overriding the `forks` limit on the command line:
`ansible-playbook -i inventory deploy.yml -f 50`
This tells Ansible to spawn 50 worker processes and execute the tasks across all 50 instances simultaneously in parallel, reducing the total patch time down to approximately 2 minutes.

---

**Q17. [L3] Your team manages an AWS account. An auditor demands to know precisely who deleted a critical S3 bucket yesterday at 14:00. Where do you find this information, and what specific data points are you looking for?**

> *What the interviewer is testing:* AWS CloudTrail, event logging analysis.

**Answer:**
I would query **AWS CloudTrail**, which logs all API activity within the AWS account.
I can query it via the AWS Console CloudTrail Event History, using AWS Athena if the logs are backed to S3, or via CLI:
`aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket`
The critical data points I'm extracting from the JSON log are:
1. `userIdentity.arn` (Who did it? e.g., an IAM User `arn:aws:iam::123:user/bob` or an assumed role).
2. `eventName` (e.g., `DeleteBucket`).
3. `sourceIPAddress` (Where did the API call originate from? Corporate VPN, or Russian IP space?).
4. `requestParameters.bucketName` (To confirm it's the exact bucket).

---

**Q18. [L2] A Redis cache server is placed in front of a slow database. During a major marketing campaign launch, the cache suddenly purges its keys, and the database instantly crashes under the thundering herd of traffic. What is this phenomenon called, and how do you mitigate it?**

> *What the interviewer is testing:* Cache stampede, cache penetration/misses, jitter.

**Answer:**
This is called a **Cache Stampede** (or Thundering Herd). It happens when a highly popular cached key expires. Instantly, thousands of concurrent requests hit the cache, find a miss, and *all* of them simultaneously bypass the cache and query the database to regenerate the exact same data, crashing the database.

Mitigation strategies:
1. **Adding Jitter:** Instead of setting a strict 1-hour expiration on keys, add random jitter (e.g., 60 minutes + random 0 to 5 minutes) so keys expire staggeringly, preventing massive simultaneous purges.
2. **Mutex Locks:** When a cache miss occurs, the first thread acquires a distributed lock (e.g., Redis `SETNX`) for that specific key. It proceeds to query the database. The other 999 concurrent threads fail to get the lock, and sleep/poll for 50ms until the first thread populates the cache for them.

---

**Q19. [L1] A developer keeps merging code to the `main` branch that breaks the build because they forgot to run the code formatter (`black` or `prettier`) locally. How do you force this compliance automatically?**

> *What the interviewer is testing:* Git hooks, pre-commit frameworks, shift-left security.

**Answer:**
The SRE/DevOps approach is to "Shift Left" and employ automation before the code ever leaves the developer's laptop.
I would implement a **Pre-commit Hook**.
Using a framework like `pre-commit` (Python) or `husky` (Node), I configure a `.pre-commit-config.yaml` in the repo. When the developer types `git commit`, the hook automatically intercepts the action and runs the code formatter. If the format violates rules, the commit is rejected locally before it can even be pushed to the remote repository.

---

**Q20. [L2] In Terraform, you have accidentally deleted an RDS instance definition from your `main.tf` file and hit `apply`. Terraform is now attempting to destroy the production database. How do you architect Terraform files to protect against catastrophic accidental deletions?**

> *What the interviewer is testing:* Terraform lifecycle rules, Prevent Destroy.

**Answer:**
While strict code reviews and IAM `Deny` policies are essential, Terraform has an explicit safety net for this exact scenario.
You should use the Terraform `lifecycle` block on any stateful, catastrophic-to-lose resources (like RDS, S3 buckets, DynamoDB tables).
```hcl
resource "aws_db_instance" "production" {
  # ... configuration ...
  lifecycle {
    prevent_destroy = true
  }
}
```
If a developer deletes this block or attempts to run `terraform destroy`, Terraform will parse the state file, observe the `prevent_destroy` metadata still attached to that resource, and flat-out refuse to execute the plan, throwing an error and saving the database.
