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
