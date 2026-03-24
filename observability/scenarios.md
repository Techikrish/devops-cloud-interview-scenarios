# 📊 Observability — Scenario-Based Interview Questions

**Q1. [L1] Your application latency has suddenly spiked but CPU, Memory, and Network I/O metrics remain normal. What do you check first?**

> *What the interviewer is testing:* Understanding of external dependencies and basic troubleshooting workflow.

**Answer:**
If the application instance's local resources are fine, the latency is almost certainly caused by an external downstream dependency.
I would check APM (Application Performance Monitoring) distributed traces or dependency metrics. I am looking for:
1. Database query latency (e.g., table locks, missing indexes).
2. Third-party API timeouts or throttling (e.g., Stripe, SendGrid).
3. Cache latency (e.g., Redis cluster eviction policies taking too long or connection exhaustion).
If external telemetry indicates they are fast, the application might be experiencing thread pool exhaustion or garbage collection (GC) pauses internally, which APM thread/GC metrics would reveal despite low host CPU.

---

**Q2. [L2] You have an alerting rule: `CPU Usage > 80% for 5 minutes`. It keeps waking you up at 3 AM for a backend batch processing worker, but it resolves itself after 10 minutes without issues. What do you do?**

> *What the interviewer is testing:* Alert fatigue reduction, actionable alerting, understanding of batch workloads.

**Answer:**
Waking up for non-actionable, self-resolving alerts creates alert fatigue and burns out engineers. The alert is poorly designed for this workload.
Batch processing workers are *supposed* to use 100% CPU to finish their jobs as quickly as possible. CPU usage is not a symptom of failure here; it's a measure of efficiency.
I would:
1. Disable or silence the CPU alert for this specific batch worker tier.
2. Replace it with a Symptom-Based Alert (SLI/SLO): Alert if the batch job queue age exceeds X minutes or if the job failure rate spikes. Alert on the *outcome* the business cares about, not the resource utilization.

---

**Q3. [L2] A developer comes to you saying they cannot find an error log in Datadog/Kibana that they just triggered in production. You verify the application is generating the log. Why is it missing?**

> *What the interviewer is testing:* Log shipping path, ingestion latency, parsing filters.

**Answer:**
Logs do not magically appear in aggregators; they traverse a pipeline. I would check:
1. **Ingestion Latency:** There might simply be a delay in processing logs if logstash/fluentd is backlogged. Check the lag metrics on the log shipper.
2. **Quota/Rate Limiting:** The log aggregator (like Datadog/Splunk) might be silently dropping logs because the daily index/ingestion quota was breached.
3. **Parse Failures (Grok patterns):** If the developer changed the log format in the latest deployment, the log shipper might fail to parse the JSON or regex pattern, sending it to a dead-letter queue or dropping it.
4. **Log level:** Ensure the production environment is actually configured to output `DEBUG`/`INFO` (often it's set to `WARN/ERROR` only).

---

**Q4. [L3] Your Prometheus server is running out of memory and crashing every few hours. How do you troubleshoot and fix this?**

> *What the interviewer is testing:* High cardinality, metric relabeling, Prometheus architecture.

**Answer:**
Prometheus OOMs almost exclusively due to **High Cardinality** in the metrics it scrapes or the queries being run against it.
1. **Find High Cardinality:** When it's running, query `topk(10, count by (__name__) ({__name__=~".+"}))` to find which metrics have millions of series. It's often caused by developers putting unbounded variables (like user IDs, session tokens, or full URLs) into metric labels instead of bounded HTTP status codes or methods.
2. **Mitigation:** Use `metric_relabel_configs` in the scrape config to `drop` the problematic metrics or strip the offending high-cardinality labels before ingestion.
3. **Long-term:** Talk to the developers to remove high cardinality labels. If the scale is simply huge, implement a horizontal scaling solution like Thanos or Cortex, rather than relying on a single Prometheus instance.

---

**Q5. [L1] What are the Three Pillars of Observability, and what specific problem does each solve?**

> *What the interviewer is testing:* Core definitions.

**Answer:**
1. **Metrics:** Time-series aggregated numbers (e.g., `requests_per_second`, `cpu_usage`). They are cheap to store and allow for fast alerting and dashboarding over long periods. They tell you *if* something is broken.
2. **Logs:** Immutable records of discrete events (e.g., an error stack trace or an access log). They contain detailed context. They tell you *why* something is broken.
3. **Distributed Traces:** Tracks a single request as it traverses across multiple microservices (via a unique Trace ID). They show the timing of each hop and dependency. They tell you *where* something is broken.

---

**Q6. [L2] You want to monitor the "availability" of your e-commerce checkout service. How do you calculate it?**

> *What the interviewer is testing:* SLI configuration, RED metrics, avoiding ping/uptime as availability.

**Answer:**
Availability shouldn't be measured purely by ping or CPU (host uptime), because the host could be up but the app returning 500 errors. 
The standard SRE approach uses the **RED Method** metrics, specifically Error Rate.
I would calculate availability as a ratio of successful requests to total requests over a window (e.g., 30 days).
`Availability % = (Total Requests - HTTP 5xx Errors) / Total Requests * 100`
This provides the Service Level Indicator (SLI). To make it actionable, I would set a Service Level Objective (SLO), such as `99.9%`, and alert if the Error Budget burn rate exceeds an acceptable threshold.

---

**Q7. [L2] A microservice architecture has 15 services. A user reports an API failure, but looking through the centralized logs of 15 services is impossible. How do you find the root cause?**

> *What the interviewer is testing:* Correlation IDs, Trace IDs, log injection.

**Answer:**
This is solved using **Trace IDs** or **Correlation IDs**.
When the user's request hits the API Gateway (the edge), the Gateway must generate a unique `X-B3-TraceId` (or similar W3C Trace Context) header and attach it to the request.
Every downstream service must:
1. Read this header.
2. Inject the Trace ID into every log line it outputs.
3. Pass the header forward to any subsequent downstream calls.
When an error occurs, I can simply search the centralized logging system (e.g., Kibana) for that exact unique Trace ID. It will pull up all logs from all 15 services precisely sequenced in chronological order for that specific request, revealing exactly where the failure originated.

---

**Q8. [L3] Your Grafana dashboard is taking 30 seconds to load. It queries a Prometheus database with 1 year of retention. How do you speed it up?**

> *What the interviewer is testing:* Recording rules, downsampling, query optimization.

**Answer:**
Querying raw data over long periods (e.g., aggregating 1 year of CPU data on the fly) involves analyzing billions of data points, choking the Prometheus CPU and taking forever.
To speed this up, I would:
1. **Recording Rules:** Instead of calculating complex aggregations or rates on the fly in the dashboard (like `rate(http_requests_total[5m])`), I would create a Prometheus Recording Rule. This pre-calculates the query continuously in the background and saves it as a new, pre-aggregated metric series. Grafana then queries this pre-computed metric instantly.
2. **Downsampling:** For long-term storage (like 1 year), I would use Thanos, Cortex, or VictoriaMetrics, which support downsampling. The system automatically reduces 15-second resolution data down to 5-minute or 1-hour resolution for data older than a week, drastically reducing the points Grafana has to load.

---

**Q9. [L1] A service uses 2GB of RAM. Do you alert when it hits 1.5GB (75%) or 1.9GB (95%)? Explain your reasoning.**

> *What the interviewer is testing:* Lead time, rate of change, threshold theory.

**Answer:**
A static threshold often fails because it ignores the *rate of change*. 
If memory is leaking slowly at 1 MB/hour, alerting at 75% gives me 500 hours to fix it — an annoying alert I don't need right now.
If it spikes extremely fast, alerting at 95% might only give me 2 seconds before the OOM kill happens, making the alert useless because it's too late.

The better approach is to alert on the **Time To Exhaustion**. I would use the Prometheus `predict_linear()` function over the last hour. If the slope indicates we will hit 100% in the next 4 hours, it alerts. This gives me actionable lead time, regardless of whether memory is currently at 40% or 90%.

---

**Q10. [L2] You have an ELK stack. The Elasticsearch cluster status turns Yellow. What does this mean, and what do you do?**

> *What the interviewer is testing:* Elasticsearch shard mechanics, replica management.

**Answer:**
Elasticsearch cluster states are:
- Green: All primary and replica shards are allocated.
- Yellow: All primary shards are allocated (data is safe, searching works), but one or more replica shards are unassigned.
- Red: One or more primary shards are missing (data loss or downtime).

A Yellow state usually happens because a node went down or restarted, and ES cannot allocate the replica shard to the same node holding the primary shard.
To fix:
1. Check `_cat/health` and `_cluster/allocation/explain` to see *why* and *which* shards aren't allocating.
2. The usual cause is either an offline node (I need to bring it back up, or wait for ES to timeout and recreate the replica on another node if there's space) or a disk watermark issue (disks are >85% full, preventing new shard allocation, so I need to clear old indices or add disk space).

---

**Q11. [L3] Your SLO is 99.9% availability. Your current availability for the month is 99.95%. A development team wants to push a massive refactor on Friday evening that hasn't been tested thoroughly. What do you do?**

> *What the interviewer is testing:* Error budgets, SRE cultural practices, blameless decision making.

**Answer:**
SRE uses Error Budgets to make data-driven decisions between feature velocity and reliability, removing the emotion from the conversation.
With a 99.9% SLO, we are allowed a 0.1% error budget for the month. Since we are at 99.95%, we have positive error budget remaining.
Technically, they have the budget to deploy. However, Friday evening deployments violate the core risk mitigation practice of having support available during business hours.

I would advise them: "You have the error budget, but deploying Friday night risks a major outage over the weekend. Because an outage will burn through the remaining budget—halting all feature deployments next week if we drop below 99.9%—I strongly recommend waiting until Monday morning when the team can monitor the rollout safely." 

---

**Q12. [L2] What is the difference between a Push-based monitoring system (like DataDog/StatsD) and a Pull-based system (like Prometheus)?**

> *What the interviewer is testing:* Architecture, network topologies, auto-discovery.

**Answer:**
1. **Push:** The application (or an agent on the host) writes metrics actively and sends them over the network to a centralized aggregator endpoint (e.g., Datadog, InfluxDB). 
   *Pros:* Easier to span NATs or firewalls (outbound is usually allowed), great for ephemeral/serverless functions that die too fast to be scraped.
   *Cons:* Can overwhelm the central server with UDP floods, and the aggregator doesn't inherently know if an agent died vs simply has no data to send.
2. **Pull (Prometheus):** The centralized server uses an HTTP GET request (scrape) to pull a `/metrics` endpoint exposed by the application.
   *Pros:* The server controls the ingestion rate, preventing DDOS. It implicitly knows when a service is dead because the HTTP GET fails (`up == 0`). It heavily relies on Service Discovery (like Consul or Kubernetes API) to find targets dynamically.

---

**Q13. [L1] A developer complains that their new logs aren't showing up in CloudWatch. They verified the IAM Role has permission to write logs. What else could be wrong?**

> *What the interviewer is testing:* CloudWatch agent configuration, log stream structure.

**Answer:**
If the IAM permissions are correct (i.e., `logs:CreateLogStream`, `logs:PutLogEvents`), the issue is often configuration:
1. **Agent Configuration:** If using the unified CloudWatch agent on EC2, the `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json` must be configured to list the exact absolute path to the log file.
2. **Service restart:** The agent must be restarted to pick up config file changes.
3. **Log Group constraints:** If the application creates log streams dynamically, check if the AWS account has hit a rate limit, or if the KMS key encrypting the log group lacks permissions for the compute service to use it.
4. **Time synchronization:** If the EC2 instance NTP clock is drastically delayed or ahead, CloudWatch will reject the log events stating the timestamps are invalid.

---

**Q14. [L3] Your team uses Jaeger for distributed tracing. You notice that your application performance drops by 30% when tracing is enabled in production. How do you resolve this?**

> *What the interviewer is testing:* Sampling strategies, open telemetry overhead.

**Answer:**
Distributed tracing is computationally expensive and memory-intensive because it tracks every span of a request. You should never trace 100% of requests in a high-throughput production environment.
The solution is **Sampling**.
1. **Head-Based Sampling (Probabilistic):** I would configure the Jaeger client in the application to use a probabilistic sampler of e.g., 1% or 0.1%. It decides at the start of the request whether to trace it. This drastically reduces CPU overhead.
2. **Tail-Based Sampling:** While Head-based is fast, it randomly misses interesting 500 errors. Tail-based sampling (often done via an OpenTelemetry Collector acting as a buffer) traces everything in memory, but only ships the trace to Jaeger's backend *after* the request completes, specifically keeping all errors or high-latency traces and discarding normal fast paths.

---

**Q15. [L2] You are building an alerting strategy for a newly launched microservice. What are the four 'Golden Signals' you should base your SLIs on?**

> *What the interviewer is testing:* Google SRE best practices, Golden Signals.

**Answer:**
Google's SRE book defines four "Golden Signals" as the baseline for user-facing systems:
1. **Latency:** The time it takes to service a request (differentiating between successful and failed requests).
2. **Traffic:** A measure of how much demand is being placed on your system (e.g., HTTP requests per second).
3. **Errors:** The rate of requests that fail (e.g., explicitly HTTP 500s or implicitly corrupt data).
4. **Saturation:** How "full" your service is. A measure of the most constrained resource (e.g., CPU, Memory, I/O, or database connection pool utilization).

---

**Q16. [L1] You ssh to a Linux box to check some logs manually via `less /var/log/syslog`. There are millions of lines. How do you find lines containing "error" and view the lines immediately around them without leaving `less`?**

> *What the interviewer is testing:* Command line skills for quick observability, `less` shortcuts.

**Answer:**
Inside `less` I would:
1. Press `/` and type `error` and press Enter to search forward. 
2. Use `n` to jump to the next match, and `N` to jump to previous match.
3. The lines immediately around the match are visible because `less` displays the page containing the match.
If I wanted to exit `less` and output this to another file, I'd use `grep -C 5 "error" /var/log/syslog > errors.txt` (where `-C 5` gives 5 lines of context before and after the match).

---

**Q17. [L2] A service has an internal queue. Would you alert on the number of items in the queue being high, or the age of the oldest item in the queue?**

> *What the interviewer is testing:* Alerting philosophy, latency vs. saturation.

**Answer:**
Alerting on the **age of the oldest item** is significantly better.
A queue with 10,000 items might be processed in 2 seconds if the workers are fast, resulting in no customer impact. Alerting purely on count will trigger false positives during harmless traffic spikes.
However, if the oldest item in the queue is 5 minutes old, you *know* a user has been waiting 5 minutes. This violates latency SLOs regardless of whether the queue contains 10 items or 10,000 items, and indicates either frozen workers or severe backpressure.

---

**Q18. [L3] Your log aggregator is consuming massive amounts of AWS storage costs because it retains all logs for 30 days. You need to keep 30 days of data for forensics, but cut costs deeply. What is the standard architectural design?**

> *What the interviewer is testing:* Log lifecycle management, cold storage architectures.

**Answer:**
SRE teams must implement a multi-tier storage architecture, often called Hot/Warm/Cold tiers.
1. **Hot Tier:** Keep only 3-7 days of logs in the expensive, fast-SSD log aggregator (e.g., Elasticsearch or Datadog) for immediate incident response and daily dashboarding.
2. **Cold Tier / Archive:** Use a routing layer (like fluentbit or logstash) to tee all raw log data concurrently to a cheap AWS S3 bucket as gzipped JSON files.
If a forensic audit is required 25 days later, the SRE queries the S3 bucket directly using AWS Athena (Presto over S3) without needing to pay the premium to keep that data instantly indexed in the hot tier.

---

**Q19. [L2] A third-party service you depend on is highly unstable, returning 500 errors often. Every time it fails, your application's threads hang waiting for it, eventually crashing your app and causing an outage for YOUR customers. How do you protect your app?**

> *What the interviewer is testing:* Resiliency patterns, Circuit Breakers, timeouts.

**Answer:**
The missing protection mechanism is a **Circuit Breaker** combined with **Timeouts**.
1. **Timeouts:** Ensure the HTTP client calling the vendor has a strict timeout (e.g., 2 seconds). The threads shouldn't hang indefinitely.
2. **Circuit Breaker:** Wrap the outbound call in a circuit breaker pattern (e.g., Netflix Hystrix, Resilience4j, or an Istio Envoy sidecar). If the vendor fails 5 times in a row, the circuit "trips/opens." For the next minute, any call to the vendor by your app immediately throws a predefined graceful fallback error *without* actually making the network call or blocking the thread. This gives the dependency time to recover and keeps your app alive for your customers.

---

**Q20. [L1] Explain the difference between `Gauge` and `Counter` metric types in Prometheus.**

> *What the interviewer is testing:* Fundamental metric types.

**Answer:**
1. **Counter:** A cumulative metric that can *only go up* (or reset to zero on restart). Examples include `http_requests_total` or `bytes_sent`. Because it only goes up, you never query its raw value directly; you always apply a rate function (e.g., `rate(http_requests_total[5m])`) to see how fast it's growing.
2. **Gauge:** A metric that can arbitrarily *go up and down* over time. Examples include `cpu_memory_usage`, `current_queue_depth`, or `temperature`. You can query gauges directly to evaluate their current value without needing a rate function.
