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

---

**Q21. [L2] Explain the difference between Blackbox and Whitebox monitoring, and when to use each.**

> *What the interviewer is testing:* Internal telemetry vs external probing.

**Answer:**
- **Whitebox Monitoring:** Depends on the internal state and telemetry exposed by the system itself (e.g., APM, custom app metrics, logs). It requires instrumenting the code. It is used to answer *why* the system is broken and isolate the exact failing component.
- **Blackbox Monitoring:** Tests the system from the outside simply by observing its external behavior, treating it as a completely opaque box. Examples include HTTP pongs (`/ping` endpoints), DNS resolution checks, or synthetic browser testing. It is used to quickly determine *if* the system is broken from the perspective of an actual user. You need both: Blackbox catches when the entire server crashes (where whitebox metrics simply stop arriving), and whitebox tells you why it crashed.

---

**Q22. [L1] Can you define SLA, SLO, and SLI?**

> *What the interviewer is testing:* SRE terminology and hierarchy.

**Answer:**
- **SLI (Service Level Indicator):** A quantitative, mathematical measure of some aspect of the level of service provided. Example: "The percentage of HTTP GET requests to `/home` that return a 200 OK within 100ms."
- **SLO (Service Level Objective):** A target value or range of values for a service level that is measured by an SLI. Example: "The SLI will be 99.9% measured over a rolling 30-day window." It represents what the business defines as "healthy."
- **SLA (Service Level Agreement):** A legal and financial contract with the customer that outlines the consequences (penalties, refunds) if the SLO is not met. Example: "If we drop below 99.9%, we refund 10% of the monthly bill." SREs manage SLOs and SLIs; lawyers manage SLAs.

---

**Q23. [L2] When measuring API latency, why is an Average (Mean) a terrible metric compared to Percentiles (P95, P99)?**

> *What the interviewer is testing:* Statistical distributions in distributed systems, long-tail latency.

**Answer:**
An **Average** hides extreme outliers. If 99 users experience lightning-fast 10ms latencies, but 1 user hits a database timeout and waits 5,000ms, the mathematical average is ~60ms. It looks perfectly healthy on a dashboard, masking the fact that a user had a terrible, broken experience.
**Percentiles** (like P99) order all requests from fastest to slowest. A P99 of 800ms means that 99% of requests were faster than 800ms, and the worst 1% of users experienced 800ms or worse. Alerting on P99 or P99.9 ensures you are monitoring the "long-tail" latency, protecting the experience of your most heavily impacted customers rather than just the majority.

---

**Q24. [L3] Your microservices communicate asynchronously via an SQS message queue or Kafka topic. Service A puts a message in, and Service B processes it 5 seconds later. How do you implement Distributed Tracing across this asynchronous gap?**

> *What the interviewer is testing:* W3C Trace Context propagation, asynchronous boundaries.

**Answer:**
Standard HTTP tracing relies on passing headers (like `traceparent`). A message queue breaks the HTTP chain.
To trace across the queue, you must explicitly inject the **Trace Context** into the metadata/headers of the message envelope itself.
1. When Service A generates the message payload, the tracing SDK intercepts it, takes active Trace ID, and injects it into the Kafka Record Headers (or SQS Message Attributes).
2. When Service B pulls the message from the queue, its tracing SDK acts as an extractor. It reads the Kafka headers, finds the injected Trace ID from Service A, and starts a new Span mathematically linked as a "child" or "follows_from" relationship to Service A's span. This unifies the entire asynchronous journey in tools like Jaeger or Datadog.

---

**Q25. [L2] A critical third-party payment API your app relies on starts returning 200 OK, but the JSON payload is silently empty `{}`, causing your app logic to fail downstream. Your standard `HTTP 5xx` alerts didn't fire. How do you monitor for this?**

> *What the interviewer is testing:* Semantic monitoring, validating response payloads, business metrics.

**Answer:**
Standard infrastructural monitoring only cares about HTTP status codes. To catch semantic/logic errors from third parties, you must implement **Business Metric Alerting** or payload validation.
1. **App-level Metrics:** The application code should explicitly parse the payment response. If it's missing expected fields, it should increment a custom Prometheus counter like `vendor_payment_payload_errors_total`. I can alert when this counter spikes.
2. **Synthetic Monitoring:** Run an automated script every minute that makes a real payment request, explicitly asserts the presence of the expected JSON keys in the response body, and alerts immediately if the assertion fails, regardless of the 200 OK status code.

---

**Q26. [L1] What is Synthetic Monitoring?**

> *What the interviewer is testing:* Proactive vs reactive monitoring.

**Answer:**
**Synthetic Monitoring** is simulating user traffic to proactively test your systems from the outside.
Instead of waiting for real customers to log in and report that the "Add to Cart" button is broken, you deploy a headless browser script (using tools like Datadog Synthetics, Cypress, or Selenium) running from various global AWS regions. It logs in, adds an item, and checks out every 5 minutes 24/7. If the workflow fails or takes too long, it triggers an alert before real users are severely impacted.

---

**Q27. [L3] Your CPU alert threshold is 90%. The server CPU oscillates between 89% and 92% every few seconds. This causes PagerDuty to trigger the alert, resolve it, and trigger it again 50 times an hour. How do you fix this?**

> *What the interviewer is testing:* Flapping alerts, hysteresis, `for` durations in PromQL.

**Answer:**
This is called a **Flapping Alert**. To fix it, you introduce **Hysteresis** or a Pending Duration.
In Prometheus, this is solved using the `for` clause in the alert evaluation rule.
```yaml
alert: HighCPU
expr: cpu_usage > 90
for: 5m
```
Rather than firing the millisecond the CPU hits 91%, the metric must *sustainably remain* above 90% for a continuous, unbroken 5-minute window. If it drops to 89% at minute 4, the timer resets. This guarantees you are only paged for sustained actual load, completely eliminating noise from instantaneous spikes.

---

**Q28. [L1] Prometheus is a pull-based system, meaning it scrapes targets that are continuously running. How do you monitor a cron job that runs for only 3 seconds and terminates before Prometheus has a chance to scrape it?**

> *What the interviewer is testing:* Pushgateway architecture.

**Answer:**
You use the **Prometheus Pushgateway**.
The Pushgateway is an intermediary, continuously running component. The short-lived cron job, right before it terminates, actively *pushes* its final metrics (like `job_duration_seconds` or `items_processed`) to the Pushgateway via an HTTP POST. 
The Pushgateway stores these metrics in memory indefinitely. Prometheus can then leisurely scrape the Pushgateway on its standard interval (e.g., every 15 seconds) to collect the metrics of the dead job.

---

**Q29. [L2] A production issue is occurring, but your application is set to `INFO` log level, which hides the detailed variables you need to debug. Restarting the app to change the log level to `DEBUG` will wipe the corrupted state in RAM, destroying the evidence. How should modern apps be architected to handle this?**

> *What the interviewer is testing:* Dynamic configuration management, feature flags.

**Answer:**
Modern cloud-native applications must support **Dynamic Log Level adjustments** without process restarts.
This is achieved by hooking the application's logging framework (like Logback in Java, or Winston in Node) to a dynamic configuration source.
1. A REST API endpoint: Expose an authenticated actuator endpoint (e.g., Spring Boot Admin) that allows an SRE to `POST /logger/DEBUG` to change it instantly in RAM.
2. A Configuration Server: Have the app poll Consul, AWS AppConfig, or Kubernetes ConfigMap equivalents. You update the flag in Consul, the app detects the change and switches to `DEBUG` output instantly on the fly, capturing the failing state.

---

**Q30. [L3] Your company just acquired a massive monolithic C++ application built 15 years ago. It emits zero metrics and no useful logs. The developers left the company, and re-compiling the code is too dangerous. How do you gain deep observability into its network calls and database queries?**

> *What the interviewer is testing:* eBPF (Extended Berkeley Packet Filter), zero-instrumentation observability.

**Answer:**
When you cannot modify the application code (zero-instrumentation), you use **eBPF-based observability**.
eBPF allows executing sandboxed programs directly inside the Linux kernel. 
Using tools like Pixie, Cilium Hubble, or Datadog Universal Service Monitoring, an eBPF agent running on the host node attaches probes to kernel-level sockets (`tcp_sendmsg`, `tcp_recvmsg`).
It can intercept and parse the raw plaintext network packets (HTTP, DNS, MySQL protocols) right as they enter/leave the application, dynamically generating RED metrics (Request rates, Errors, Durations) and distributed traces for the legacy monolith without changing a single line of its original C++ code.

---

**Q31. [L2] What is an "Error Budget Burn Rate," and why is alerting on it superior to alerting on a static error count?**

> *What the interviewer is testing:* SRE Burn Rate Alerting, SLO math.

**Answer:**
Alerting on a static threshold (e.g., "Alert if 100 errors happen") is flawed because it ignores traffic volume: 100 errors out of 100 requests is a furious outage; 100 errors out of 10 million requests is background noise.
**Burn Rate** measures how fast you are consuming your 30-day Error Budget.
A burn rate of `1` means you will consume exactly 100% of your budget by day 30. A burn rate of `10` implies you are consuming the budget 10 times faster than allowed and will blow the budget in 3 days. Alerting on a spike to a *Burn Rate of 10x over 1 hour* mathematically proves a severe, user-impacting outage relative to your total traffic, eliminating false positives entirely.

---

**Q32. [L1] What does the Apdex (Application Performance Index) score measure in observability dashboards?**

> *What the interviewer is testing:* User satisfaction metrics vs raw latency.

**Answer:**
The **Apdex score** is an open standard to translate raw latency numbers into a single metric representing global **user satisfaction**, ranging from 0 (frustrated) to 1 (satisfied).
You define a target latency threshold `T` (e.g., 500ms).
- **Satisfied:** Requests completing in `< T`.
- **Tolerating:** Requests completing between `T` and `4 * T`.
- **Frustrated:** Requests taking longer than `4 * T` or throwing an error.
The Apdex score formula combines these into a single ratio, providing a business-friendly KPI (e.g., "Our Apdex is 0.94") rather than a technical "Our P95 is 700ms".

---

**Q33. [L3] Describe the role of "Exemplars" in Prometheus and how they bridge the gap between metrics and traces.**

> *What the interviewer is testing:* Context switching, Metric-to-Trace correlation, OpenMetrics format.

**Answer:**
Metrics are highly aggregated (e.g., "You had 50 requests take longer than 2 seconds"). Traces are highly specific. The painful gap historically was: "Out of the thousands of traces generated in those 5 minutes, which specific trace ID belongs to one of those 50 slow requests?"
**Exemplars** solve this. When an application increments a Prometheus histogram bucket indicating a 2-second delay, it attaches a specific `TraceID` to that specific observation as metadata (an Exemplar).
In Grafana, when you view the spike on the latency graph, little diamonds (Exemplars) appear on the peak. Clicking the diamond instantly pivots you directly to the exact Jaeger trace that caused that specific data point, eliminating the need to manually hunt for correlated traces.

---

**Q34. [L2] Why is it critical to enforce "Semantic Conventions" when setting up OpenTelemetry across dozens of microservices built by different teams?**

> *What the interviewer is testing:* Telemetry standardization, dashboard portability.

**Answer:**
If Team A tags their database queries as `{"db.table_name": "users"}`, Team B uses `{"db_table": "users"}`, and Team C uses `{"sql.target": "users"}`, creating a unified, company-wide dashboard to track database performance becomes impossible. You would have to write queries accounting for three different permutations.
**Semantic Conventions** define a standardized naming scheme for spans, metrics, and attributes (e.g., standardizing on `http.method` and `http.status_code` universally). Enforcing this at the SDK layer ensures telemetry is completely uniform across Python, Go, and Java services, allowing SRE to build single "Golden Master" dashboards that work automatically for any service.

---

**Q35. [L1] What is a Dead Letter Queue (DLQ), and what critical observability metrics should be built around it?**

> *What the interviewer is testing:* Message queue reliability, failure handling.

**Answer:**
A **Dead Letter Queue (DLQ)** is a secondary queue where an asynchronous system routes messages that completely fail to be processed after multiple retries (due to malformed JSON, missing database records, etc.), to prevent them from endlessly clogging the primary queue.
**Observability metrics needed:**
1. **DLQ Depth (Count):** SRE must alert if this goes above zero. A message in a DLQ represents a permanently failed business process (e.g., a processed payment but an unshipped order) requiring human intervention.
2. **Age of oldest message:** How long has this failure been ignored?

---

**Q36. [L3] Your Prometheus Time-Series Database (TSDB) is running on a massive disk with plenty of space left, but it is thrashing the CPU and IOPS with high "Compaction" activity. What causes excessive compaction?**

> *What the interviewer is testing:* Metric churn, TSDB internal mechanics, head block vs persistent blocks.

**Answer:**
High TSDB compaction (and resulting IOPS thrashing) is heavily correlated with **Metric Churn**.
Churn is different from High Cardinality. Churn happens when a service creates brand new metric series, stops updating them after highly ephemeral periods, and creates new ones.
For example, if a developer mistakenly uses the Kubernetes `Pod IP` as a metric label in a rapidly auto-scaling environment. Every time a pod is replaced, the old metric series is abandoned, and a new one is created. Prometheus groups recent data in temporary memory blocks. When moving to persistent disk, it "compacts" related series. Massive churn forces the compactor to constantly rewrite indices and stitch together millions of fragmented, short-lived series, burning massive CPU. The fix is to remove ephemeral labels (like Pod IPs) and use static identifiers (like Service Names).

---

**Q37. [L2] How does Real User Monitoring (RUM) differ from backend Application Performance Monitoring (APM)?**

> *What the interviewer is testing:* Browser telemetry, Core Web Vitals, edge latency.

**Answer:**
**Backend APM** measures performance from the moment the request hits your data center's load balancer until the server finishes processing it.
**RUM (Real User Monitoring)** uses a JavaScript snippet embedded in the actual browser page to measure performance from the user's physical device. 
RUM captures metrics APM cannot see: DNS lookup time on a mobile network, the time to download massive CSS payloads over a slow 3G connection, and Core Web Vitals (like "First Contentful Paint" or Javascript rendering freeze). RUM often reveals a site is agonizingly slow for customers despite backend APM showing sub-50ms response times.

---

**Q38. [L3] An application is occasionally utilizing 100% CPU, but the spike only lasts for 3 seconds every hour, making it impossible to confidently run `perf` or `top` in time to catch it live. How do you identify the exact function causing the spike?**

> *What the interviewer is testing:* Continuous Profiling in Production (e.g., Pyroscope, Datadog Profiler).

**Answer:**
I would implement **Continuous Profiling**.
Traditional profiling introduces massive overhead and is run manually ad-hoc. Continuous profilers (like Pyroscope or Datadog Continuous Profiler) run permanently in production utilizing extremely low-overhead eBPF or sampling techniques (e.g., capturing the stack trace only 100 times a second).
When the 3-second spike happens, the profiler automatically records it. The next morning, I can review the profiler's UI, select the exact 5-minute slice surrounding the spike, and look at the generated **Flamegraph**, which visualizes exactly which functions or lines of code consumed the CPU cycles across the entire fleet retroactively.

---

**Q39. [L1] In Kubernetes, what is the difference between a Liveness Probe and a Readiness Probe?**

> *What the interviewer is testing:* Health checks, load balancer routing vs process restarting.

**Answer:**
- **Liveness Probe:** Checks if the application container is fundamentally healthy and running. If the liveness probe fails (e.g., the app is deadlocked in an infinite loop), Kubernetes will actively **kill** the container and restart a fresh one.
- **Readiness Probe:** Checks if the application is currently prepared to accept live network traffic. If it fails (e.g., it is busy downloading a massive cache file, or the database connection dropped), Kubernetes does *not* kill it. It simply **removes** the Pod from the Service's routing table, stopping new requests from hitting it until it recovers and the probe passes again.

---

**Q40. [L2] You are building a multi-tenant SaaS application. You need to segregate metrics so each enterprise customer can view their own latency. Why is adding a `tenant_id` label to every Prometheus metric a bad idea, and what should you do instead?**

> *What the interviewer is testing:* Cardinality explosions, log vs metrics cost structures.

**Answer:**
Adding a `tenant_id` label to Prometheus metrics is a fatal mistake because it causes a catastrophic **Cardinality Explosion**.
If you have 10,000 tenants, and each interacts with 50 endpoints across 5 HTTP methods and 4 status codes, multiplying these combinations creates tens of millions of distinct metric series, which will quickly crash Prometheus due to OOM errors or bankrupt you in Datadog custom metric billing.
**Instead:** Fast, aggregated system health (Metrics) should *not* be split by customer. To provide per-tenant dashboards, you should inject the `tenant_id` exclusively into **Logs** or **Distributed Traces**. Those systems are built to index high-cardinality metadata cheaply. You can then use tools like Datadog Log Analytics or Elasticsearch to graph latency specifically filtered by `tenant_id` without breaking the core metric TSDB.

---

**Q41. [L1] Why are latency percentiles (P50, P95, P99) more useful than average (mean) latency for understanding user experience? Give a concrete example where average is misleading.**

> *What the interviewer is testing:* Understanding distribution statistics and user-centric metrics.

**Answer:**
Average latency is **deceptive** because it hides the temporal distribution of requests. A system can have a "good" average while users experience terrible performance.

**Concrete example:**
- 100 requests: 99 complete in 10ms, 1 takes 10,000ms (user hits a database lock or GC pause).
- Average = (99×10 + 1×10,000) / 100 = **109ms** (looks acceptable)
- P99 = 10,000ms (the 1% percentile experiencing the lock, which is unacceptable for a web app)

**Why percentiles matter:**
- **P50 (Median):** Half of users experience better, half worse.
- **P95:** 95% of users are fast. If P95 is 200ms, the slowest 5% experience delays.
- **P99:** Only the slowest 1% suffer. If P99 is 5 seconds, you're losing at least 1 in 100 users.

For SLOs, you never use average. You commit to "P99 latency < 200ms" because that's a user experience promise. Tail latency (P99, P99.9) is the metric operations teams care about.

---

**Q42. [L2] An alerting rule fires every 3 seconds, then clears every 5 seconds, creating 150+ PagerDuty incidents per hour. The actual metric oscillates around the threshold. How do you stabilize this?**

> *What the interviewer is testing:* Alert flapping, dampening strategies, alert fatigue reduction.

**Answer:**
This is **alert flapping**—when a metric oscillates around the threshold, causing rapid alert cycles. Engineers ignore the notifications (alert fatigue), defeating their purpose.

**Solutions (in order of increasing sophistication):**

1. **Raise the evaluation window:** Instead of `cpu > 80%`, use `avg(cpu) over 5m > 80%`. Oscillations within minutes won't trigger; only sustained issues will.

2. **Hysteresis (two-threshold approach):** 
   - Alert fires when metric > 85% (high threshold)
   - Alert clears only when metric < 75% (low threshold)
   - This creates a "dead zone" between 75-85%, preventing flapping.
   - Prometheus: Use `for: 5m` (must exceed threshold for 5 minutes before triggering).

3. **Aggregation:** Instead of single-instance CPU, alert on `avg(cpu) across all instances > 80%`. Aggregate metrics are smoother.

4. **Dynamic thresholding:** Replace static 80% with `predict_linear(cpu[1h], 3600) > 90%`. Only alert if the metric will hit 90% within the hour (giving lead time instead of flapping).

**Best practice example (Prometheus):**
```yaml
- alert: HighCPU
  expr: rate(node_cpu[1m]) > 0.8
  for: 5m  # Must be high for 5 consecutive minutes
  annotations:
    summary: "CPU sustained above 80%"
```

---

**Q43. [L3] Your Prometheus instance is crashing with OOM every few hours. You identify the culprit: a Kubernetes deployment metric with a `pod_name` label containing every pod UUID ever created in the cluster (including deleted pods). Why is cardinality so deadly, and how do you prevent this without restarting Prometheus?**

> *What the interviewer is testing:* Understanding metric cardinality, label design, active remediation.

**Answer:**
Each unique combination of label values creates a separate **time-series**. Prometheus stores each series' metadata, recent data points, and indices in memory.

**The Math:**
If you have a metric with labels `{job, instance, pod_name, container}`:
- 10 jobs × 100 instances × 50,000 pod UUIDs × 10 containers = **500 million series**
- Each series occupies ~1KB of memory (metadata, indices) = **500GB needed** (will OOM instantly on a 64GB server).

**Why deletes matter:** When a pod is deleted, Prometheus doesn't immediately purge its cardinality. The metric remains "recorded" until the TSDB compaction cycle runs (days later), so cardinality grows unbounded.

**Prevention & Remediation:**

1. **Label Design (Prevent):** Never use unbounded identifiers like pod_name or user_id as labels. Use only bounded dimensions:
   ```yaml
   # Bad: pod_name has infinite cardinality
   http_requests_total{method, status, pod_name}
   
   # Good: namespace and deployment are bounded (~100s)
   http_requests_total{method, status, namespace, deployment}
   ```

2. **Metric Relabeling (Active Remediation):** Without restarting, add `metric_relabel_configs` to your scrape config to drop the problematic label:
   ```yaml
   scrape_configs:
     - job_name: 'kubernetes'
       metric_relabel_configs:
         - source_labels: [pod_name]
           regex: '.+'
           action: drop  # Drop all metrics with a pod_name label
   ```
   Reload Prometheus: `kill -HUP <PID>` (no restart, configs reloaded live). New scraped metrics won't have `pod_name`, and Prometheus will garbage-collect the old series over time.

3. **Cardinality Budgets:** Proactively monitor cardinality:
   ```
   topk(10, count by (__name__) ({__name__=~".+"}))
   ```
   If a metric's cardinality exceeds 10,000, auto-alert before it crashes.

---

**Q44. [L1] A developer says "We should alert on average CPU being high". You say "No, that's a symptom. What's the root cause?" Explain the difference between alerting on symptoms vs root causes with a concrete example.**

> *What the interviewer is testing:* Alert design philosophy, SRE thinking, user impact.

**Answer:**
**Symptoms** are resource metrics (CPU, memory, disk). **Root causes** are user-facing impacts (errors, latency, requests failing).

**Example:**
- **Symptom:** CPU > 80%
- **Root cause:** Application latency > 500ms OR error rate > 1%

You could have high CPU from:
- A batch job (acceptable, expected, users don't care)
- A memory leak in a thread (critical, users see slow requests)
- A noisy neighbor VM (critical for your app, but your app itself is fine)
- Efficient code using available resources (healthy, no issue)

**Why symptom alerts fail:**
If you alert on "CPU > 80%", you'll wake on-call for the batch job and ignore the memory leak causing user errors. Alert fatigue makes engineers stop responding to alerts.

**Root cause alerting:**
Instead, alert on:
- "Error rate > 1%" (users are failing)
- "P99 latency > 500ms for 5 min" (user experience degraded)
- "API response 500 errors > 50/min" (app crashed or hung)

These align with what users *actually experience*. If the root cause is firing, you're guaranteed there's a real problem worth waking for. If CPU is high but latency and errors are normal, sleep through it.

---

**Q45. [L2] An application generates 500,000 log lines per second. Storing everything costs $100,000/month. You need detailed debugging capability but cannot afford full-volume storage. What sampling strategy allows you to capture errors while discarding routine logs?**

> *What the interviewer is testing:* Log cost optimization, sampling strategies, tail-based sampling.

**Answer:**
**Log sampling** reduces volume while preserving critical signals. There are two approaches:

**1. Head-Based Sampling (Probabilistic):**
At the point where the log is generated, randomly decide: keep this log with probability P (e.g., 1% of logs). The decision is made instantly, lowest CPU overhead.
```python
import random
if random.random() < 0.01:  # Keep 1%
    logger.info("request completed")
```
**Problem:** You randomly discard errors. With 1% sampling, you'll miss 99% of the stack traces.

**2. Tail-Based Sampling (Intelligent):**
Capture *all* logs in a temporary buffer, but only ship to the aggregator if they match certain criteria:
- All logs from *error* requests (even if they're low-volume)
- All logs from *slow* requests (latency > 1000ms)
- Random sample of *success* requests (1% to track healthy profiles)

A log forwarder like Fluentbit or OpenTelemetry Collector buffers logs in memory as they arrive, tags them with request outcome (error/success/latency), and makes shipping decisions *after* the request completes.

**Example (with OpenTelemetry):**
```yaml
processors:
  tail_sampling:
    policies:
      - name: error_policy
        type: error
        error_policy:
          status_code:
            status_codes: [500, 502, 503]
      
      - name: slow_policy
        type: latency
        latency_policy:
          threshold_ms: 1000
      
      - name: probabilistic
        type: probabilistic
        probabilistic_policy:
          sampling_percentage: 1
```

**Cost Math:**
- Full volume: 500,000 logs/sec × $10 per million logs = $150,000/month
- With tail-based sampling (errors + 1% sample): 
  - Errors: ~5,000/sec, success sample: ~5,000/sec = 10,000 logs/sec
  - Monthly cost: 10,000 × 86400 × 30 × $10 / 1,000,000 = **$2,592/month** (98% savings)
- Debugging capability: All errors captured + representative success traces for normal behavior analysis.

---

**Q46. [L3] Your observability infrastructure costs $200,000/month (Datadog, Prometheus, etc.), but the CFO demands a 40% cost reduction. You cannot lose visibility into production. Design a cost-aware observability strategy with specific architectural changes.**

> *What the interviewer is testing:* Business-aware engineering, observability architecture, cost vs reliability tradeoffs.

**Answer:**
Cost reduction requires **architectural restructuring**—not just turning off features. The strategy is **Hot/Warm/Cold tiers with intelligent routing**.

**Current High-Cost Architecture:**
- Full-resolution metrics (15-second granularity) for 30 days in Datadog = billions of data points @ $0.05 per 1000
- All logs ingested into Splunk/Datadog for instant searchability = $$$

**Cost-Optimized Architecture:**

1. **Metrics Tiering:**
   - **Hot (3 days):** Full-resolution (15s) Prometheus on cheap local hardware. Covers "right now" incident response. Cost: ~$1,000/month (hardware).
   - **Warm (7-30 days):** Downsampled (5-minute resolution) shipped to S3/Thanos with query-on-demand. Cost: ~$500/month (storage).
   - **Cold (>30 days):** Parquet/ORC format in S3. Queries require Athena (serverless) scanning. Cost: ~$100/month (occasional audits).
   - **Savings:** From $80k/month in Datadog to $1.6k/month.

2. **Log Tiering:**
   - **Hot (7 days):** High-priority logs only (errors, warnings) in Elasticsearch. Cost: ~$2,000/month.
   - **Warm (30 days):** All logs (unindexed) in S3 gzip archives. Query via Athena/Splunk on-demand. Cost: ~$500/month.
   - **Cold (>30 days):** Compliance/audit archives (immutable, rarely retrieved). Cost: ~$50/month.
   - **Savings:** From $90k/month in Datadog logs to $2.55k/month.

3. **Traces (formerly 100% sampled at all times):**
   - **Intelligent Sampling:** Jaeger/Datadog samples at 0.5% baseline (random), but bumps to 100% for:
     - Errors (always trace failures)
     - High latency requests (>500ms)
     - Specific high-value transactions (payment checkout)
   - **Savings:** From $30k/month in trace storage to $3k/month (only interesting requests traced).

4. **Alerts & Notification:**
   - Move from expensive alerting (Datadog Monitors @ $40/monitor) to cheaper **open-source tools:**
     - Prometheus AlertManager + custom webhook integrations (free)
     - Grafana alerts (open-source, self-hosted) (free)
   - **Savings:** $40k/month in monitor licensing to ~$500/month infrastructure.

**Operational Changes:**
- On-call engineers know: "For the last 30 days, query the hot Elasticsearch. For 30-day-old issues, run Athena queries (5-min query latency)."
- For post-mortems, sacrifice instant query time, enable Athena scanning of S3 (acceptable, not urgent).
- Batch jobs and non-critical services use only logs + metrics (no traces).

**Total Monthly Cost Reduction:**
- Before: Datadog basic tier at $200k/month
- After: Self-hosted Prometheus/Grafana/ELK + S3 = $8.5k/month
- **Savings: 95.75% cost reduction ($191.5k/month)**

**Trade-offs Accepted:**
- Instant instant query latency lost (but alerts still fast)
- Team must relearn on-call procedures
- Requires in-house expertise to maintain ELK and Prometheus

---

**Q47. [L2] Your on-call runbook for a database outage is 50 pages long with flowcharts, escalation procedures, and conflicting instructions from different teams. A junior engineer pages you at 2 AM confused by step 15. How do you structure a runbook so incident responders can act decisively under stress?**

> *What the interviewer is testing:* Operational documentation, decision trees, incident response design.

**Answer:**
A good runbook is **not a novel**—it's a **decision tree**. It guides humans through uncertainty without requiring them to read 50 pages at 3 AM.

**Structure (Better Practice):**

**1. One-page summary (Top of runbook):**
```
SERVICE: Database Primary
SYMPTOMS: Queries timing out OR connection refused
IMPACT: Users cannot place orders, checkout broken
MITIGATION: Failover to replica (estimated 5 min recovery)
ESCALATION: Page DBAs if failover fails
```

**2. Decision tree (Flowchart, not prose):**
```
Q: Can you SSH to primary DB?
├─ YES → Q: Are there error messages in /var/log/mysql/error.log?
│        ├─ YES (deadlock) → Run: ANALYZE and OPTIMIZE tables (procedure #1)
│        ├─ YES (out of memory) → Restart MySQL (procedure #2)
│        └─ NO → Check replication lag (procedure #3)
└─ NO → Primary host is offline → Initiate failover (procedure #4)
```

**3. Procedures (Numbered, atomic tasks):**
```
## Procedure #1: Clear Deadlock
1. SSH db-primary-01
2. mysql> SHOW ENGINE INNODB STATUS; (identify locked table)
3. Kill the blocking transaction: KILL <TXN_ID>;
4. Verify queries resume: watch 'SHOW PROCESSLIST;' (< 100 queries)
5. If not resolved → Escalate to DBA (page @dba-oncall)
```

**4. Escalation paths (Clear handoff):**
```
LEVEL 1 (Incident Lead): First responder follows procedures #1-#3
  ↓ (If still broken after 10 min)
LEVEL 2 (Database Engineer): @dba-oncall pages, takes over
  ↓ (If still broken after 20 min)
LEVEL 3 (VP Engineering): Nuclear option, prepare communication + customer refund
```

**5. Post-incident actions:**
```
AFTER the incident is resolved:
- [ ] Notify #incidents Slack channel
- [ ] Trigger post-mortem (7 days later)
- [ ] Update this runbook if procedures changed
```

**Best Practices:**
- **Testability:** Run the runbook quarterly in a non-prod environment. If the junior engineer can't follow it, rewrite it.
- **Roles:** Assign who does what (Lead vs. Database Engineer vs. Infrastructure). Reduces conflict.
- **Timing:** Note estimated time for each procedure ("Failover takes ~5 min"). Sets expectations.
- **Links:** Reference actual commands/tickets, not generic "check the system". Runbooks are **not** learning documents; they're **action guides**.
- **What NOT to do:** Avoid "If you're unsure, call the database team." Be specific.

**Example (Better):**
```
DECISION: Is replication lagged?
COMMAND: ssh db-primary-01 && mysql -e "SHOW SLAVE STATUS\G" | grep "Seconds_Behind_Master"
OUTPUT:
  - 0-5 seconds: Acceptable, continue troubleshooting (procedure #3)
  - >5 seconds: Replication is lagged, stop writes (procedure #5)
```

Runbooks succeed when junior engineers can copy-paste commands and make progress without interpretation.

---

**Q48. [L2] After deploying OpenTelemetry instrumentation, traces appear in staging but not production. The application logs show spans are being created. Where do you look first?**

> *What the interviewer is testing:* OpenTelemetry pipeline debugging, collector/exporter configuration.

**Answer:**
If spans are created inside the application but do not reach the backend, the problem is usually between the SDK and the telemetry backend.
I would check:
1. **Collector endpoint:** Confirm production points to the correct OpenTelemetry Collector address and protocol (`grpc` vs `http/protobuf`).
2. **Collector pipelines:** Verify the `traces` pipeline has a receiver, required processors, and the correct exporter wired together.
3. **Exporter errors:** Look at collector logs and metrics such as send failures, queue size, dropped spans, and retry counts.
4. **Network and auth:** Check NetworkPolicy, security groups, proxy settings, API keys, and TLS certificates.
5. **Sampling:** Confirm production is not configured with an accidental 0% sampler.

The fastest test is to enable collector debug logging or temporarily export to a local logging exporter. That proves whether spans reached the collector before debugging the vendor/backend side.

---

**Q49. [L3] You need to run an OpenTelemetry Collector for hundreds of services sending metrics, logs, and traces. What production safeguards do you configure so the collector does not become the outage?**

> *What the interviewer is testing:* Collector architecture, backpressure, batching, memory protection.

**Answer:**
I would treat the collector as production infrastructure, not a side experiment.
Key safeguards:
1. **Memory limiter processor:** Drops or refuses data before the collector OOMs.
2. **Batch processor:** Sends telemetry in efficient batches instead of one event at a time.
3. **Exporter queues and retries:** Absorb short backend outages without blocking application threads.
4. **Horizontal scaling:** Run multiple collector replicas behind a load balancer or DaemonSet, depending on whether data is node-local or service-level.
5. **Separate pipelines:** Keep traces, metrics, and logs in separate pipelines so log floods do not starve critical metrics.
6. **Self-observability:** Alert on collector dropped spans, exporter failures, queue size, memory usage, and scrape health.

For very high-volume tracing, I would use an agent collector close to workloads and a gateway collector layer for sampling, enrichment, and export.

---

**Q50. [L1] What is the difference between a Prometheus Histogram and a Summary?**

> *What the interviewer is testing:* Metric type fundamentals, percentile calculation tradeoffs.

**Answer:**
A **Histogram** stores observations in configurable buckets, such as requests under `100ms`, `300ms`, `1s`, and `5s`. Prometheus can aggregate histograms across instances and calculate percentiles later with `histogram_quantile()`.

A **Summary** calculates quantiles inside the client application, such as P95 or P99. It can be accurate for one process, but those quantiles cannot be safely averaged across many replicas.

In production, I usually prefer histograms for request latency because they aggregate well across pods, zones, and services. Summaries are useful when you need client-side quantiles for a single process and do not need fleet-wide aggregation.

---

**Q51. [L2] You need an alert for P95 HTTP latency from Prometheus histogram metrics. What query shape do you use, and what mistake should you avoid?**

> *What the interviewer is testing:* Correct PromQL for histograms and percentile aggregation.

**Answer:**
For a classic Prometheus histogram, I would calculate P95 from the bucket rate:
```promql
histogram_quantile(
  0.95,
  sum by (le, service) (
    rate(http_request_duration_seconds_bucket[5m])
  )
) > 0.5
```
This says: calculate the 95th percentile latency per service over the last 5 minutes and alert if it is above 500ms.

The major mistake is averaging per-pod P95 values:
```promql
avg(http_request_duration_p95)
```
That is mathematically wrong because percentiles are not additive. A pod with 10 requests and a pod with 100,000 requests should not have equal weight. Aggregate buckets first, then calculate the percentile.

---

**Q52. [L3] A team wants very accurate latency percentiles but their classic Prometheus histograms create too many bucket time series. What options do you discuss?**

> *What the interviewer is testing:* Histogram bucket design, native histograms, cost vs accuracy.

**Answer:**
Classic histograms multiply time series by every bucket and every label combination. If a metric has 20 buckets and many labels, cost and memory grow quickly.

I would discuss three options:
1. **Fix bucket boundaries:** Use fewer buckets that match real SLO boundaries, such as `100ms`, `300ms`, `1s`, and `3s`, instead of many generic buckets.
2. **Reduce labels:** Remove high-cardinality labels from histogram metrics, especially user IDs, raw paths, tenant IDs, and pod UIDs.
3. **Evaluate native histograms:** Native histograms can represent distributions more compactly and with dynamic buckets, but the team must verify support across Prometheus, remote storage, Grafana, alert rules, and client libraries.

The decision is a tradeoff: enough precision for SLOs, without turning latency measurement itself into the largest source of telemetry cost.

---

**Q53. [L2] A database outage causes 40 application alerts to page at the same time. How do you reduce the noise without hiding the real incident?**

> *What the interviewer is testing:* Alertmanager grouping, inhibition, dependency-aware alerting.

**Answer:**
This is a dependency fan-out problem. The database is the likely root cause, while the application alerts are symptoms.

I would use Alertmanager or the equivalent alerting tool to:
1. **Group alerts** by service, cluster, and incident type so responders receive one grouped notification instead of 40 pages.
2. **Inhibit downstream alerts** when a higher-level dependency alert is firing. For example, if `DatabaseUnavailable` is active, suppress `CheckoutDatabaseErrors` pages while still showing them in the incident view.
3. **Keep severity meaningful:** Page for the root cause and major user impact; send dependent symptoms to chat or the incident timeline.
4. **Add dependency labels:** Include labels such as `dependency="postgres"` so routing and inhibition rules can be precise.

The goal is not to delete signal. It is to present one clear incident with supporting context.

---

**Q54. [L1] What should a production health check endpoint verify, and what should it avoid?**

> *What the interviewer is testing:* Health check design, dependency checks, Kubernetes probes.

**Answer:**
A health check should be cheap, fast, and designed for the action that will be taken when it fails.

For a **liveness** endpoint, I keep it shallow: can the process respond, is the main event loop alive, and is the app not deadlocked? It should not call every dependency, because a temporary database issue could cause Kubernetes to restart healthy pods unnecessarily.

For a **readiness** endpoint, I check whether the app can safely receive traffic: required config loaded, database connection pool initialized, cache warmed if required, and migrations compatible.

Avoid expensive queries, calls to optional third-party services, or checks that can overload dependencies during an outage. Bad health checks can turn a small dependency issue into a full restart storm.

---

**Q55. [L2] A dashboard turns red every deployment because latency and errors spike briefly during rollout, but users are not affected. How do you make the dashboard more useful?**

> *What the interviewer is testing:* Dashboard design, deploy awareness, separating normal changes from incidents.

**Answer:**
Dashboards should show deploy context and user impact, not just raw spikes.
I would add:
1. **Deployment annotations:** Mark deploy start, version, environment, and rollback events on latency/error graphs.
2. **Version labels:** Split metrics by `version` or `release` so I can compare old and new pods during rollout.
3. **User-facing SLIs:** Keep the top row focused on availability, P95/P99 latency, and error rate, not internal restart noise.
4. **Burn-rate or sustained windows:** Show whether the spike is large enough and long enough to matter.
5. **Canary panels:** Compare canary vs stable before the release hits 100%.

If the deployment behavior is expected, the dashboard should make that obvious while still exposing abnormal deploy regressions.

---

**Q56. [L3] Distributed traces are broken between two services after one team migrated from B3 headers to W3C Trace Context. What is happening and how do you fix it?**

> *What the interviewer is testing:* Trace propagation standards and cross-team compatibility.

**Answer:**
The services are using different propagation formats. One service injects trace context using headers such as `traceparent` and `tracestate`, while the other expects B3 headers such as `X-B3-TraceId`. The downstream service starts a new trace because it cannot extract the parent context.

To fix it:
1. Configure all services to use one standard, preferably W3C Trace Context for new systems.
2. During migration, enable multi-propagator support so services can extract both B3 and W3C while injecting the chosen standard.
3. Verify API gateways, service meshes, and async message producers preserve trace headers.
4. Add a test that sends a request through both services and asserts one shared trace ID.

Trace propagation is a contract. It must be standardized the same way API auth headers are standardized.

---

**Q57. [L2] Your logs accidentally contain passwords, access tokens, and customer PII. What controls do you put in place?**

> *What the interviewer is testing:* Secure logging, redaction, data governance.

**Answer:**
I would fix this at multiple layers because relying on one filter is risky.
1. **Application allowlisting:** Log known-safe fields instead of dumping full request bodies or objects.
2. **Redaction middleware:** Mask fields such as `password`, `authorization`, `cookie`, `token`, `ssn`, and `credit_card`.
3. **Collector-side filtering:** Add Fluent Bit, Logstash, or OpenTelemetry Collector processors to redact known patterns before export.
4. **Access control:** Restrict who can query sensitive logs and audit log searches.
5. **Retention policy:** Shorten retention for sensitive sources and route regulated data to compliant storage only when required.
6. **Tests:** Add unit or integration tests that fail if known secret field names are emitted.

The best answer is prevention in application logging, with pipeline redaction as a backup.

---

**Q58. [L1] What is structured logging, and why is it better than plain text logs for production troubleshooting?**

> *What the interviewer is testing:* Log format basics and queryability.

**Answer:**
Structured logging writes logs as key-value data, usually JSON:
```json
{"level":"error","service":"checkout","order_id":"123","trace_id":"abc","message":"payment failed"}
```
Plain text logs are easy for humans to read but hard for machines to search reliably.

Structured logs let you filter and aggregate by fields:
1. Find all errors for `service=checkout`.
2. Search a specific `trace_id` or `order_id`.
3. Count failures by `payment_provider`.
4. Build alerts from fields without fragile regex parsing.

In production, structured logs reduce guesswork because every important piece of context has a consistent field name.

---

**Q59. [L2] A Prometheus graph shows gaps for a service after pods restart. Does a missing line mean the service was healthy with zero traffic? How do you alert on missing data correctly?**

> *What the interviewer is testing:* Prometheus staleness, absent metrics, scrape health.

**Answer:**
Missing data does not mean zero. It usually means Prometheus did not scrape the target, the metric disappeared, or the pod restarted and the series went stale.

I would separate two cases:
1. **Zero value:** The service exported the metric with value `0`.
2. **No series:** Prometheus has no current sample for that label set.

For scrape health, alert on:
```promql
up{job="checkout"} == 0
```
For a metric that must always exist, use:
```promql
absent(rate(http_requests_total{service="checkout"}[5m]))
```
or alert when expected targets disappear from service discovery.

This prevents treating missing telemetry as healthy behavior.

---

**Q60. [L3] Your SLO alert pages too late during fast outages and too often during tiny blips. How do multi-window burn-rate alerts help?**

> *What the interviewer is testing:* Practical SLO alerting and paging signal quality.

**Answer:**
Multi-window burn-rate alerts combine a short window and a long window.

A fast outage should page quickly, so the short window detects rapid error budget consumption. But short windows are noisy, so the long window confirms the issue is sustained enough to matter.

Example approach:
1. **Page:** High burn rate over both `5m` and `1h`. This catches severe active incidents.
2. **Ticket or chat:** Lower burn rate over `30m` and `6h`. This catches slow reliability degradation.

This design avoids two bad outcomes:
- Waiting hours to page during a complete outage.
- Paging for a harmless one-minute spike.

It aligns alerts with user impact and error budget consumption instead of static error counts.

---

**Q61. [L2] A canary deployment serves only 5% of traffic. Overall error rate looks normal, but canary users are failing. How do you catch this?**

> *What the interviewer is testing:* Canary observability, label-based comparisons, aggregation pitfalls.

**Answer:**
Aggregate dashboards hide small-scope failures. If the canary has a 20% error rate but receives only 5% of traffic, the global error rate may barely move.

I would:
1. Add a `version`, `release`, or `deployment_track` label to request metrics, logs, and traces.
2. Compare canary vs stable for request rate, error rate, latency, and saturation.
3. Use automated promotion gates that fail the rollout if canary error rate or latency is worse than stable by a defined threshold.
4. Ensure logs and traces include the same version label for root cause analysis.

Canary monitoring must compare cohorts. Overall averages are not enough.

---

**Q62. [L1] What is the difference between monitoring and observability?**

> *What the interviewer is testing:* Conceptual clarity beyond tools.

**Answer:**
**Monitoring** tells you whether known failure modes are happening. Example: CPU is high, disk is full, or the service is returning 500 errors.

**Observability** helps you understand unknown failure modes by exposing enough telemetry to ask new questions without shipping new code. Example: "Only users in one region using one payment method are slow after version 2.4.1."

Monitoring is usually dashboard and alert focused. Observability includes metrics, logs, traces, events, profiling, and good metadata so engineers can investigate systems they do not fully predict in advance.

You need both: monitoring for fast detection, observability for fast explanation.

---

**Q63. [L2] Users in Europe report checkout failures, but US synthetic checks are green. What is wrong with the monitoring strategy?**

> *What the interviewer is testing:* Synthetic coverage, regional dependency failures, user-path monitoring.

**Answer:**
The synthetic checks do not match the user population or the failing path. A single US probe cannot prove global availability.

I would improve coverage by:
1. Running synthetic checks from multiple regions where customers actually live.
2. Testing the full checkout workflow, not just the homepage or `/health`.
3. Separating DNS, CDN, TLS, frontend, API, and payment-provider timing in the synthetic result.
4. Alerting on regional failure patterns, such as Europe failing while US remains green.
5. Comparing synthetic checks with RUM data from real browsers.

Monitoring must test from the user's point of view. Otherwise, it only proves the service works from the monitoring vendor's nearest region.

---

**Q64. [L3] After enabling service mesh telemetry, Prometheus cardinality explodes because metrics include source pod, destination pod, path, method, response code, and workload labels. How do you control it?**

> *What the interviewer is testing:* Service mesh metrics, label control, aggregation strategy.

**Answer:**
Service mesh telemetry is powerful but can create a series for every source-destination-path combination.

I would control it by:
1. Dropping pod-level labels from high-volume metrics and keeping workload, namespace, and service labels.
2. Normalizing paths, such as `/orders/{id}` instead of `/orders/12345`.
3. Keeping method and response-code class, but avoiding unnecessary headers or user-level labels.
4. Creating recording rules for common service-to-service RED metrics.
5. Applying metric relabeling at scrape time to remove labels that are not used in alerts or dashboards.
6. Setting cardinality budgets per team and reviewing top series regularly.

The goal is service-level observability, not a unique time series for every request shape.

---

**Q65. [L2] A pod crashes before the log shipper sends its final error lines. How do you avoid losing the most important logs?**

> *What the interviewer is testing:* Container logging, buffering, termination behavior.

**Answer:**
I would design logging so logs leave the process quickly and survive container restarts.
1. Write logs to stdout/stderr in structured format so the container runtime captures them.
2. Run a node-level log agent, such as Fluent Bit or the OpenTelemetry Collector, that tails container log files outside the pod lifecycle.
3. Tune buffering so the agent can survive short backend outages without dropping error logs.
4. Set graceful termination periods so the application flushes logs before exit.
5. For critical failures, emit a metric or event in addition to logs because logs alone can be delayed or dropped.

I would also check previous container logs with `kubectl logs --previous` during investigation.

---

**Q66. [L2] Prometheus graphs have regular gaps every 15 minutes for many targets. What do you investigate?**

> *What the interviewer is testing:* Scrape reliability, timeouts, sample limits, target health.

**Answer:**
Regular gaps point to scrape or ingestion problems, not random application behavior.

I would check:
1. `up` for affected targets during the gaps.
2. `scrape_duration_seconds` to see whether scrapes are timing out.
3. `scrape_samples_scraped` and sample-limit errors if exporters produce too many metrics.
4. Prometheus CPU, memory, WAL, and disk I/O during the gap.
5. Network, DNS, service discovery, or load balancer behavior on a 15-minute schedule.
6. Exporter logs for slow collection, especially exporters that call cloud APIs or databases.

The fix depends on the cause: increase scrape timeout carefully, reduce exporter work, shard Prometheus, or remove expensive metrics.

---

**Q67. [L3] You must trace all failed checkout requests for debugging, but privacy rules forbid exporting raw customer identifiers. How do you design trace sampling and attributes?**

> *What the interviewer is testing:* Tail sampling, privacy-aware telemetry, attribute hygiene.

**Answer:**
I would combine tail-based sampling with strict attribute controls.

For sampling:
1. Keep 100% of failed checkout traces.
2. Keep 100% of very slow checkout traces.
3. Keep a small random sample of successful checkout traces for baseline behavior.

For privacy:
1. Do not attach raw email, name, phone, address, card, or token values to spans.
2. Use safe identifiers such as hashed customer ID only if policy allows it.
3. Keep coarse business attributes, such as `payment_method_type`, `country`, `app_version`, and `checkout_step`.
4. Redact at the SDK and collector layer before export.

This preserves the debugging value of traces without turning the tracing backend into a sensitive data store.

---

**Q68. [L1] What are MTTD and MTTR, and how does observability improve them?**

> *What the interviewer is testing:* Incident metrics and operational outcomes.

**Answer:**
**MTTD** means Mean Time To Detect: how long it takes to notice a problem after it starts.

**MTTR** means Mean Time To Restore or Recover: how long it takes to bring the service back to an acceptable state.

Observability improves MTTD with good alerts, synthetic checks, SLO burn-rate alerts, and clear user-impact dashboards.

It improves MTTR with useful logs, traces, metrics, deployment markers, runbooks, and correlation IDs that help engineers find the failing dependency quickly.

The goal is not just more telemetry. The goal is shorter time from user impact to confident mitigation.

---

**Q69. [L2] Every alert in your system has severity `critical`, so on-call gets paged for low-risk issues. How do you design alert severity levels?**

> *What the interviewer is testing:* Alert prioritization, paging discipline, incident response.

**Answer:**
Severity should map to required human action.

I would define levels like:
1. **Page immediately:** User-facing outage, fast error budget burn, data loss risk, security-impacting production issue.
2. **Urgent ticket or chat:** Degradation that needs same-day action but is not actively hurting users.
3. **Backlog ticket:** Capacity trend, cleanup task, non-production issue, or informational warning.

Each alert should include owner, service, impact, runbook, dashboard link, and escalation path. If no one needs to wake up and act immediately, it should not be a paging alert.

This reduces alert fatigue and makes critical pages meaningful again.

---

**Q70. [L3] How do you design observability for serverless functions such as AWS Lambda where instances are short-lived and you cannot scrape them like normal servers?**

> *What the interviewer is testing:* Serverless telemetry patterns, cold starts, async failures.

**Answer:**
Serverless observability must use the platform telemetry path because functions may start and disappear before a pull-based scraper can reach them.

I would capture:
1. **Logs:** Structured logs to CloudWatch Logs or a collector subscription.
2. **Metrics:** Invocation count, errors, duration, throttles, concurrency, iterator age for streams, and DLQ depth for async failures.
3. **Custom metrics:** Business outcomes such as orders processed or payment failures.
4. **Traces:** Enable distributed tracing and propagate trace context through API Gateway, queues, and downstream calls.
5. **Cold starts:** Track initialization time separately from handler duration.
6. **Timeouts and retries:** Alert on retry storms, partial batch failures, and poison messages.

For serverless, absence of hosts does not mean absence of operations. You move observability to invocations, events, and managed-service metrics.

---

**Q71. [L2] CPU and memory look normal, but requests are timing out. What internal saturation metrics should you check?**

> *What the interviewer is testing:* Saturation beyond host resources.

**Answer:**
Host CPU and memory are not the only bottlenecks. I would check saturation inside the application and dependencies:
1. Thread pool active count and queue length.
2. Database connection pool usage and wait time.
3. HTTP client connection pool usage.
4. Garbage collection pause time.
5. Worker queue depth and age of oldest item.
6. File descriptors and socket counts.
7. Rate limiter rejections or circuit breaker state.

A service can be idle from a CPU perspective but completely blocked waiting for database connections or outbound sockets. Good observability exposes these internal queues and pools.

---

**Q72. [L1] What is an absence alert, and when would you use one?**

> *What the interviewer is testing:* Missing signal detection.

**Answer:**
An absence alert fires when expected telemetry stops arriving.

Examples:
1. A cron job should publish `backup_success_total` every night, but no sample appears.
2. A payment service should always have some traffic during business hours, but request metrics disappear.
3. A log shipper stops sending heartbeat logs.

This is different from alerting on a metric value. You are alerting that the signal itself is missing.

Absence alerts are useful for batch jobs, telemetry pipelines, and critical services where "no data" might mean monitoring is broken or the job never ran.

---

**Q73. [L2] After a frontend deployment, the API returns 200 OK but users see a blank page. Backend APM is green. What telemetry would catch this?**

> *What the interviewer is testing:* Frontend observability, browser errors, user experience monitoring.

**Answer:**
Backend APM cannot see browser rendering failures.

I would use:
1. **Real User Monitoring:** Capture JavaScript errors, route changes, page load timings, and Core Web Vitals from real browsers.
2. **Synthetic browser checks:** Load the page, execute JavaScript, and assert that key UI elements render.
3. **Frontend release tags:** Attach build version, route, browser, and device metadata to errors.
4. **CDN/static asset metrics:** Check 404s, cache behavior, and asset download latency.
5. **Source maps:** Upload source maps securely so minified JavaScript stack traces are readable.

The alert should be based on user-visible failure, such as a spike in JavaScript errors or failed synthetic checkout, not only backend status codes.

---

**Q74. [L3] During an incident, dashboards show "no data" for several critical services. How do you distinguish a telemetry outage from an application outage?**

> *What the interviewer is testing:* Meta-monitoring and observability reliability.

**Answer:**
Observability systems need their own monitoring.

I would check:
1. Collector and log shipper health: dropped data, queue size, exporter failures, restarts.
2. Prometheus scrape health and target discovery.
3. Remote-write or vendor ingestion status.
4. Independent blackbox checks against the application.
5. Cloud/load balancer metrics that do not depend on the same telemetry pipeline.
6. Recent deploys or config changes to collectors and agents.

If blackbox checks and platform metrics are healthy but telemetry pipelines are failing, it is a monitoring incident. If both user-facing probes and telemetry are bad, it is likely an application or infrastructure incident.

I would also alert separately on telemetry pipeline failure, because "no data" during an outage is itself a severe operational risk.

---

**Q75. [L2] Logs and traces from different services appear out of order by several minutes. What causes this and how do you fix it?**

> *What the interviewer is testing:* Time synchronization, event timestamps, distributed debugging.

**Answer:**
The most common cause is clock skew between hosts, containers, or regions. Distributed systems rely on timestamps for log ordering, trace timelines, and incident reconstruction.

I would check:
1. NTP or chrony status on nodes and base images.
2. Whether logs use event time from the application or ingestion time from the collector.
3. Timezone formatting and timestamp parsing in the log pipeline.
4. Collector buffering delays that make ingestion time misleading.

The fix is to enforce time synchronization on all nodes, emit timestamps in UTC with a standard format, and preserve both event timestamp and ingestion timestamp when possible.

Trace tools can tolerate small clock skew, but minutes of skew makes root cause analysis unreliable.

---

**Q76. [L1] Why should every log, metric, and trace include service name, environment, and version metadata?**

> *What the interviewer is testing:* Telemetry correlation and release debugging.

**Answer:**
Without consistent metadata, telemetry is hard to search and easy to misread.

Key fields:
1. `service.name`: Which service emitted the data.
2. `deployment.environment`: Production, staging, development, or another environment.
3. `service.version`: Which build or release is running.
4. Region, cluster, namespace, and team owner when relevant.

This metadata lets engineers answer practical questions:
- Did errors start after version `2.8.0`?
- Is only production affected?
- Is one region bad?
- Which team owns the service?

Good metadata turns separate metrics, logs, and traces into correlated evidence.

---

**Q77. [L2] After a Kubernetes upgrade, Prometheus shows `up == 0` for many pod scrape targets. What do you check?**

> *What the interviewer is testing:* Kubernetes service discovery, scraping, network and auth issues.

**Answer:**
I would troubleshoot the scrape path from Prometheus to the pods.
1. **Service discovery:** Are the pods still discovered with the expected labels and annotations?
2. **Endpoint changes:** Did ServiceMonitor, PodMonitor, or scrape configs stop matching after label changes?
3. **NetworkPolicy:** Can Prometheus still reach pod IPs and metrics ports?
4. **TLS/auth:** Did certificates, service account tokens, or mTLS settings change?
5. **Metrics endpoint:** Does `/metrics` still respond from inside the cluster?
6. **Prometheus logs:** Look for scrape errors such as timeout, connection refused, 401, 403, or x509 failures.

`up == 0` is a scrape failure. The application may be healthy, but Prometheus cannot collect its metrics.

---

**Q78. [L3] Your metrics vendor has an outage. Prometheus remote write queues grow, local disk fills, and the monitoring stack becomes unstable. How do you design for this failure mode?**

> *What the interviewer is testing:* Remote write backpressure, queue tuning, failure isolation.

**Answer:**
Remote storage must be treated as a dependency that can fail.

I would:
1. Tune remote write queue capacity, shard count, retry backoff, and sample age limits.
2. Keep local retention sufficient for short vendor outages, but not so large that disks fill silently.
3. Alert on remote write failed samples, retried samples, queue length, and WAL disk usage.
4. Drop or downsample non-critical metrics during prolonged backend outages.
5. Run HA Prometheus pairs carefully so both instances do not overload the vendor with duplicate retries.
6. Maintain local dashboards for active incidents even if the vendor UI is unavailable.

The goal is graceful degradation: keep critical local alerting alive even when long-term storage is down.

---

**Q79. [L2] A tracing backend becomes expensive and slow because span names include full URLs like `/users/123/orders/987`. What is the problem and how do you fix it?**

> *What the interviewer is testing:* Span naming, high-cardinality trace attributes.

**Answer:**
The span name contains unbounded identifiers. Every user ID and order ID creates a different operation name, making search, aggregation, and storage expensive.

I would normalize span names:
```text
Bad:  GET /users/123/orders/987
Good: GET /users/{user_id}/orders/{order_id}
```
Then I would store IDs only as attributes if they are safe and necessary, and avoid indexing high-cardinality attributes by default.

Good span names represent the operation shape, not one specific request. This lets the tracing backend group latency, errors, and throughput by endpoint correctly.

---

**Q80. [L3] The business asks for an executive dashboard showing whether checkout is healthy. Infrastructure dashboards are too technical. What do you include?**

> *What the interviewer is testing:* Business-aligned observability and executive-level SLIs.

**Answer:**
I would build the dashboard around the customer journey, not servers.

Top-level signals:
1. Checkout availability: successful checkout attempts divided by total attempts.
2. Checkout latency: P95 or P99 time from cart submit to order confirmation.
3. Payment success rate and provider error rate.
4. Order creation rate compared with normal baseline.
5. Revenue-impacting failure count.
6. Current SLO status and error budget remaining.
7. Active incidents, recent deploys, and rollback status.

Technical panels can exist below the fold, but the first view should answer: "Can customers buy right now, how many are failing, and is this within our reliability target?"
