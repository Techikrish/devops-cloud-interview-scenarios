# ☸️ Kubernetes — Scenario-Based Interview Questions

---

## 🔴 Troubleshooting & Debugging

---

**Q1. [L1] Your pod is stuck in `Pending` state. What do you do?**

> *What the interviewer is testing:* Basic Kubernetes debugging workflow.

**Answer:**
First run `kubectl describe pod <pod-name>` and look at the **Events** section at the bottom. Common reasons for Pending:
- **No nodes with enough resources** — the node doesn't have enough CPU or memory. Check with `kubectl get nodes` and `kubectl describe node`.
- **No matching node selector or affinity** — the pod has a `nodeSelector` that doesn't match any node label.
- **Taints not tolerated** — the node has a taint the pod doesn't tolerate.
- **PVC not bound** — if the pod needs a volume, the PersistentVolumeClaim may be stuck.

Fix based on the root cause shown in the events.

---

**Q2. [L1] A pod is in `CrashLoopBackOff`. How do you debug it?**

> *What the interviewer is testing:* Log investigation and restart behavior understanding.

**Answer:**
`CrashLoopBackOff` means the container starts, crashes, and Kubernetes keeps restarting it with increasing delay.

Steps:
1. `kubectl logs <pod-name>` — read the logs. If the container already restarted, use `kubectl logs <pod-name> --previous` to get logs from the last crashed instance.
2. `kubectl describe pod <pod-name>` — check exit codes. Exit code `1` = app error, `137` = OOM killed, `139` = segfault.
3. If logs are empty, the container may be crashing before writing anything — check the image and entrypoint command.

Common causes: app error on startup, wrong config/env vars, missing secrets, OOM.

---

**Q3. [L2] A pod shows `OOMKilled` in its status. What happened and how do you fix it?**

> *What the interviewer is testing:* Resource limits understanding.

**Answer:**
OOMKilled means the container exceeded its memory limit and the kernel killed it.

Fix:
1. Check current limits: `kubectl describe pod <pod-name>` — look at the `Limits` section.
2. Increase the memory limit in the deployment spec under `resources.limits.memory`.
3. If you're unsure what the right value is, set a higher limit temporarily and monitor actual usage with `kubectl top pod <pod-name>`.
4. Long term: use VPA (Vertical Pod Autoscaler) to auto-tune resource requests and limits.

---

**Q4. [L2] Your deployment rollout is stuck. Pods from the new version aren't coming up but old ones are still running. What's happening?**

> *What the interviewer is testing:* RollingUpdate strategy and rollout debugging.

**Answer:**
This is typical RollingUpdate behavior when new pods fail healthchecks.

Check: `kubectl rollout status deployment/<name>` — it will show if it's stuck.

Then `kubectl describe pod <new-pod>` to see why new pods aren't ready. Common causes:
- Liveness or readiness probe failing in the new version.
- New image has a bug and is crashing.
- Resource limits hit — new pods can't schedule.

To rollback immediately: `kubectl rollout undo deployment/<name>`

To investigate without rolling back, describe the new failing pods and check logs.

---

**Q5. [L2] A pod is `Running` but your app is not reachable via the Service. What do you check?**

> *What the interviewer is testing:* Service-to-pod connectivity debugging.

**Answer:**
1. **Check pod labels vs service selector** — `kubectl describe service <name>` shows the selector. `kubectl get pod --show-labels` shows pod labels. They must match exactly.
2. **Check endpoints** — `kubectl get endpoints <service-name>`. If it shows `<none>`, the selector doesn't match any pod.
3. **Check if the pod is Ready** — even if Running, if the readiness probe fails, the pod is removed from endpoints.
4. **Check the port mapping** — service `targetPort` must match the container's listening port.
5. **Test from inside the cluster** — `kubectl exec -it <pod> -- curl <service-name>:<port>` to isolate if it's a network policy or external routing issue.

---

**Q6. [L3] A node in your cluster shows `NotReady`. Your team is panicking because several services are on it. What's your action plan?**

> *What the interviewer is testing:* Incident response, node troubleshooting, pod eviction understanding.

**Answer:**
1. **Don't panic — check if pods already rescheduled.** Kubernetes evicts pods from NotReady nodes after `pod-eviction-timeout` (default 5 min). Check `kubectl get pods -A -o wide | grep <node-name>`.
2. **Cordon the node** — `kubectl cordon <node>` prevents new pods from scheduling there while you investigate.
3. **SSH into the node** and check:
   - `systemctl status kubelet` — is kubelet running?
   - `journalctl -u kubelet -n 100` — kubelet logs.
   - Disk space: `df -h`. Full disk is a common cause.
   - Memory: `free -m`.
4. **Check the node's conditions**: `kubectl describe node <name>` — look for MemoryPressure, DiskPressure, PIDPressure.
5. If unrecoverable, drain and delete: `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data` then terminate the VM.

---

**Q7. [L2] Your HPA (Horizontal Pod Autoscaler) is not scaling up even though CPU usage is high. Why?**

> *What the interviewer is testing:* HPA prerequisites and metrics-server dependency.

**Answer:**
HPA needs `metrics-server` to be installed and working. Without it, HPA can't read CPU/memory metrics and shows `<unknown>` in `kubectl get hpa`.

Check:
1. `kubectl get hpa` — if it shows `<unknown>/50%` for current metric, metrics-server is missing or broken.
2. `kubectl top pods` — if this fails, metrics-server is the problem.
3. Also check that pods have **resource requests defined** — HPA calculates usage as a percentage of the request value. No requests = HPA can't calculate.

Fix: Install metrics-server, set resource requests on pods.

---

**Q8. [L3] A pod has been running fine for weeks and suddenly starts failing with `ImagePullBackOff`. Nothing in the pod spec changed. What could cause this?**

> *What the interviewer is testing:* Image registry auth and image availability awareness.

**Answer:**
Since nothing changed in the spec, suspect external changes:
1. **Registry credentials expired** — imagePullSecret token rotated or expired.
2. **Image was deleted from the registry** — someone deleted the tag from Docker Hub or ECR.
3. **Registry is down or unreachable** — network issue or registry outage.
4. **Rate limiting** — Docker Hub has pull rate limits for unauthenticated/free accounts.
5. **Private registry changed auth** — ECR tokens expire every 12 hours if not refreshed.

Check: `kubectl describe pod <name>` — the event will say exactly which registry returned what error (401 Unauthorized, 404 Not Found, etc.).

---

**Q9. [L2] You run `kubectl exec -it <pod> -- bash` and get "container not found." What's wrong?**

> *What the interviewer is testing:* Multi-container pod awareness.

**Answer:**
If a pod has multiple containers, you need to specify which one:
```
kubectl exec -it <pod> -c <container-name> -- bash
```

Get container names with: `kubectl get pod <pod> -o jsonpath='{.spec.containers[*].name}'`

Also — some minimal images (Alpine, distroless) don't have `bash`. Try `sh` instead.

---

**Q10. [L2] Your init container is stuck and the main container never starts. How do you debug?**

> *What the interviewer is testing:* Init container execution order and logging.

**Answer:**
Init containers run sequentially before the main container. If one fails, the pod stays in `Init:0/1` or similar state.

1. `kubectl describe pod <name>` — check init container status.
2. `kubectl logs <pod> -c <init-container-name>` — get init container logs.
3. Common causes: init container script fails (wrong path, missing file), waiting for a service that's not up (like a DB), permissions issue.

---

## 🔵 Deployments & Workloads

---

**Q11. [L1] What's the difference between a Deployment and a StatefulSet? When would you use each?**

**Answer:**
- **Deployment** — for stateless apps. Pods are interchangeable. Any pod can handle any request. Use for web servers, APIs, workers.
- **StatefulSet** — for stateful apps. Each pod gets a stable hostname (pod-0, pod-1...) and its own persistent volume. Pods start and stop in order. Use for databases, Kafka, Elasticsearch, Zookeeper.

If your app needs to remember who it is (stable network ID, stable storage), use StatefulSet. Otherwise use Deployment.

---

**Q12. [L2] You need to run a database in Kubernetes. Someone says just use a Deployment with a PVC. Is that okay?**

> *What the interviewer is testing:* StatefulSet necessity understanding.

**Answer:**
Not ideal. A Deployment doesn't guarantee stable pod identity or ordered startup/shutdown, which matters for clustered databases (Postgres HA, MySQL replication, Cassandra). Also, if a Deployment has multiple replicas, all pods might try to bind the same PVC — which only one can do (unless using ReadWriteMany).

StatefulSet is the right choice because:
- Each replica gets its own PVC via `volumeClaimTemplates`.
- Pods get stable DNS names (e.g., `mysql-0.mysql`, `mysql-1.mysql`) needed for replication setup.
- Ordered startup ensures primary starts before replicas.

For a single-instance DB with no replication, a Deployment + PVC works fine but is still a corner case.

---

**Q13. [L2] You updated a ConfigMap that's mounted as an environment variable in a pod. The pod still shows the old value. Why?**

**Answer:**
Environment variables are loaded at pod start time. Changing a ConfigMap doesn't restart running pods, so they keep the old values.

Fix: **Rolling restart** the deployment — `kubectl rollout restart deployment/<name>`. This creates new pods that pick up the new ConfigMap values.

Note: If the ConfigMap is mounted as a **volume file** (not env var), Kubernetes will eventually update the file in the running pod without restart (takes ~1 min). But env vars never auto-update.

---

**Q14. [L2] How would you ensure a critical pod always runs on the same node?**

**Answer:**
Two approaches:
1. **NodeSelector** — add a label to the node (`kubectl label node <node> type=critical`) and add `nodeSelector: {type: critical}` to the pod spec. Simple but inflexible.
2. **Node Affinity** — more expressive, supports `requiredDuringSchedulingIgnoredDuringExecution` (hard rule) or `preferredDuringScheduling...` (soft preference).

For "always the same node" — use `requiredDuringSchedulingIgnoredDuringExecution` with `nodeAffinity`. But be careful: if that node goes down, the pod won't reschedule elsewhere.

---

**Q15. [L2] You want to make sure two pods of the same app NEVER run on the same node. How?**

**Answer:**
Use **Pod Anti-Affinity**:

```yaml
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector:
        matchLabels:
          app: myapp
      topologyKey: kubernetes.io/hostname
```

`topologyKey: kubernetes.io/hostname` means "don't put two pods with label `app: myapp` on the same host." Use `required` for a hard rule or `preferred` to let Kubernetes still schedule if no option exists.

---

**Q16. [L3] Your deployment has 10 replicas. You need to do a zero-downtime deploy of a new version. How do you configure and verify it?**

**Answer:**
Configure RollingUpdate strategy:
```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 2        # max extra pods during update
    maxUnavailable: 0  # never kill old pod before new one is ready
```

`maxUnavailable: 0` ensures old pods aren't removed until new ones pass readiness probes.

Verify:
1. `kubectl rollout status deployment/<name>` — watch it progress.
2. Monitor your health endpoint / app metrics during rollout.
3. If something goes wrong: `kubectl rollout undo deployment/<name>`.

Also make sure your **readiness probe is accurate** — this is the gating mechanism for zero-downtime. A bad probe that returns ready too early defeats the whole strategy.

---

**Q17. [L1] What is a DaemonSet and when do you use it?**

**Answer:**
A DaemonSet ensures one pod runs on every node (or a subset of nodes). When a new node joins the cluster, the DaemonSet automatically places a pod on it.

Use cases:
- Log collectors (Fluentd, Filebeat) — need to run on every node to collect logs.
- Monitoring agents (Prometheus node-exporter) — need node-level metrics from every node.
- Network plugins (Calico, Weave) — need to run on every node.
- Security agents (Falco, Wazuh) — need to watch every node.

---

**Q18. [L2] You have a DaemonSet but some nodes aren't getting a pod. Why?**

**Answer:**
Common reasons:
1. **Node selector or affinity mismatch** — DaemonSet has a `nodeSelector` or affinity rule that doesn't match those nodes.
2. **Node has a taint** — the DaemonSet pods don't have a matching toleration. Add the toleration to the DaemonSet spec.
3. **Node is cordoned** — `kubectl cordon` prevents any new pod scheduling.

Check: `kubectl describe daemonset <name>` — look at the Selector and Tolerations. Compare with `kubectl describe node <problem-node>`.

---

**Q19. [L2] When would you use a Job vs a CronJob?**

**Answer:**
- **Job** — run a task once to completion. E.g., database migration on deploy, one-time data processing, sending a batch of emails.
- **CronJob** — run a task on a schedule (like cron in Linux). E.g., nightly backups, hourly reports, weekly cleanup jobs.

CronJob creates a new Job object on each schedule trigger. Both ensure the task runs to completion and can be configured to retry on failure.

---

**Q20. [L2] Your CronJob is creating overlapping runs — the previous job hasn't finished when the next one starts. How do you fix it?**

**Answer:**
Set `concurrencyPolicy: Forbid` in the CronJob spec. This skips the new run if the previous one is still running.

Options:
- `Allow` (default) — multiple jobs can run at the same time.
- `Forbid` — skip the new run if old one still running.
- `Replace` — kill the old run and start a new one.

Also check `startingDeadlineSeconds` — if a job is missed (e.g., cluster was down), Kubernetes may try to catch up on missed runs.

---

## 🟢 Networking

---

**Q21. [L1] What is the difference between ClusterIP, NodePort, and LoadBalancer service types?**

**Answer:**
- **ClusterIP** — only accessible inside the cluster. Default type. Used for internal service-to-service communication.
- **NodePort** — opens a port (30000–32767) on every node. Traffic to `<NodeIP>:<NodePort>` reaches the service. Used for dev/testing or when you manage your own load balancer.
- **LoadBalancer** — creates a cloud load balancer (AWS ELB, GCP LB) and assigns an external IP. Used in production to expose services to the internet. Only works in cloud environments.

---

**Q22. [L2] What is an Ingress and why do you need it when you already have LoadBalancer services?**

**Answer:**
Every LoadBalancer service creates a new cloud load balancer = new cost + new IP address. For 10 services, that's 10 load balancers.

Ingress uses **one** load balancer (the Ingress Controller) and routes HTTP/HTTPS traffic to different services based on hostname or URL path rules. Much cheaper and cleaner.

Example:
- `api.myapp.com` → API service
- `app.myapp.com` → Frontend service
- `myapp.com/admin` → Admin service

All through one load balancer.

---

**Q23. [L2] Your Ingress is returning 404 for a path that you've configured. What do you check?**

**Answer:**
1. **Check the Ingress resource** — `kubectl describe ingress <name>` — verify the path and service name are correct.
2. **Check the IngressClass** — does the Ingress have the right `ingressClassName`? If multiple controllers exist (nginx, traefik), the wrong one might be handling it.
3. **Check path type** — `Exact` vs `Prefix` vs `ImplementationSpecific`. `Exact` only matches `/api`, not `/api/users`. Use `Prefix` to match all subpaths.
4. **Check backend service** — is the service name and port correct? Does the service have endpoints?
5. **Ingress controller logs** — `kubectl logs -n ingress-nginx <controller-pod>` — nginx logs will show 404 details.

---

**Q24. [L3] You have a microservices app where Service A should never talk directly to Service C, only through Service B. How do you enforce this in Kubernetes?**

**Answer:**
Use **NetworkPolicy**. By default, all pods can talk to all other pods. NetworkPolicy lets you restrict this.

Example — block direct traffic to Service C except from Service B:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-only-from-b
spec:
  podSelector:
    matchLabels:
      app: service-c
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: service-b
```

This says: "Only accept incoming traffic to pods labeled `app: service-c` if it comes from pods labeled `app: service-b`."

Note: NetworkPolicy requires a CNI plugin that supports it (Calico, Cilium, Weave). Flannel does not support NetworkPolicy by default.

---

**Q25. [L2] What is a headless service and why would you use it?**

**Answer:**
A headless service has `clusterIP: None`. Instead of a single virtual IP, DNS queries for a headless service return the actual pod IPs directly.

Use cases:
1. **StatefulSets** — each pod needs its own DNS name (`pod-0.service`, `pod-1.service`) for inter-pod communication (like database replication).
2. **Client-side load balancing** — let the app choose which pod to connect to instead of going through kube-proxy.
3. **Service discovery** — let your app discover all pod IPs directly.

---

**Q26. [L3] A request is going from Pod A to Pod B via a Service and it's very slow. How do you troubleshoot network latency in Kubernetes?**

**Answer:**
1. **Baseline test** — `kubectl exec -it <pod-a> -- curl -o /dev/null -s -w "%{time_total}" http://<service>:<port>` to measure actual latency.
2. **Bypass the service** — test pod-to-pod directly using the pod IP to see if latency is in kube-proxy/iptables: `kubectl exec -it <pod-a> -- curl http://<pod-b-ip>:<port>`.
3. **Check kube-proxy mode** — iptables vs ipvs. ipvs is faster at scale.
4. **Check CNI** — network plugin issues. Run `ping` between pods to test raw network latency.
5. **DNS latency** — `kubectl exec -it <pod> -- time nslookup <service>` — DNS lookups through CoreDNS add latency. Consider `ndots:5` setting impact.
6. **Node-level network** — check if nodes are on the same AZ. Cross-AZ traffic adds ~1-2ms.

---

**Q27. [L2] DNS resolution is failing inside your cluster. Pods can't resolve service names. What do you check?**

**Answer:**
1. `kubectl get pods -n kube-system | grep coredns` — is CoreDNS running?
2. `kubectl logs -n kube-system <coredns-pod>` — any errors?
3. Test DNS from inside a pod: `kubectl exec -it <pod> -- nslookup kubernetes.default` — this should always resolve.
4. Check `resolv.conf` inside the pod: `kubectl exec -it <pod> -- cat /etc/resolv.conf` — should point to the cluster DNS IP.
5. Check CoreDNS ConfigMap: `kubectl get configmap coredns -n kube-system -o yaml` — misconfigured forwarders can break external DNS resolution.

---

## 🟡 Storage

---

**Q28. [L1] What is the difference between a PersistentVolume (PV) and a PersistentVolumeClaim (PVC)?**

**Answer:**
- **PV (PersistentVolume)** — the actual storage resource. Could be an AWS EBS volume, NFS share, local disk. Created by a cluster admin or dynamically provisioned.
- **PVC (PersistentVolumeClaim)** — a request for storage by a pod. The pod says "I need 10GB of ReadWriteOnce storage" — the PVC finds a matching PV and binds to it.

Think of PV as the actual parking spot and PVC as the parking ticket that reserves it.

---

**Q29. [L2] A PVC is stuck in `Pending` state. What do you check?**

**Answer:**
1. **No matching PV** — check if a PV exists with matching `storageClassName`, `accessMode`, and enough capacity: `kubectl get pv`.
2. **StorageClass doesn't exist** — `kubectl get storageclass`. If the PVC references a storage class that doesn't exist, it stays Pending.
3. **Dynamic provisioner not working** — if using dynamic provisioning (like AWS EBS CSI driver), check if the CSI driver pods are running: `kubectl get pods -n kube-system | grep csi`.
4. **Volume binding mode** — if the StorageClass has `volumeBindingMode: WaitForFirstConsumer`, the PVC stays Pending until a pod that uses it is scheduled. That's normal behavior.

---

**Q30. [L2] You deleted a PVC but the data is gone. How could you have protected it?**

**Answer:**
By setting the **Reclaim Policy** on the PV or StorageClass:
- `Delete` (default for dynamic provisioning) — deletes the underlying volume when PVC is deleted. Data is gone.
- `Retain` — PV stays after PVC deletion. Data is preserved. Admin must manually reclaim.
- `Recycle` — deprecated, performed basic cleanup.

Also: use **VolumeSnapshot** to take backups before deleting. Or enable backup tools like Velero that snapshot PVC data.

Lesson: Always check the StorageClass reclaim policy in production. Default `Delete` on cloud providers will wipe your data.

---

**Q31. [L3] A StatefulSet pod can't start because it's trying to attach a volume that's still attached to a terminated pod on a dead node. How do you fix it?**

**Answer:**
This is a common scenario when a node dies without gracefully releasing its volumes. The PV shows `Terminating` or the pod shows volume attach error.

Steps:
1. Force delete the stuck pod: `kubectl delete pod <pod> --grace-period=0 --force`
2. Check if the PV is stuck: `kubectl describe pv <pv-name>` — look for the node it's attached to.
3. On AWS (EBS): use AWS CLI to force detach the volume: `aws ec2 detach-volume --volume-id <vol-id> --force`
4. Check the VolumeAttachment object: `kubectl get volumeattachment` — delete the stuck one.
5. The new pod should then attach the volume successfully.

---

## 🟣 RBAC & Security

---

**Q32. [L2] A developer says they can't list pods in the `production` namespace but they can in `staging`. How do you debug this?**

**Answer:**
RBAC controls are namespace-scoped. Check:
1. `kubectl auth can-i list pods --namespace=production --as=<username>` — quick check.
2. `kubectl get rolebinding -n production` — see what roles are bound in the production namespace.
3. `kubectl get clusterrolebinding | grep <username>` — check if there's a cluster-level binding.

Fix: Create a RoleBinding in the `production` namespace giving the user the `view` or appropriate role:
```yaml
kubectl create rolebinding dev-view --clusterrole=view --user=<username> -n production
```

---

**Q33. [L2] You run a pod that needs to call the Kubernetes API (e.g., to list other pods). How do you set this up securely?**

**Answer:**
1. Create a **ServiceAccount**: `kubectl create serviceaccount my-app -n my-namespace`
2. Create a **Role** with only the needed permissions (principle of least privilege):
```yaml
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
```
3. Create a **RoleBinding** linking the ServiceAccount to the Role.
4. Set `serviceAccountName: my-app` in the pod spec.

The pod will then have a token mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token` which it can use to authenticate to the API server.

Avoid using the default ServiceAccount — it often has more permissions than needed.

---

**Q34. [L3] Someone accidentally ran `kubectl delete clusterrolebinding cluster-admin` and deleted the cluster admin binding. Now no one can manage the cluster. What do you do?**

**Answer:**
This is a serious situation. If you're locked out of the API server entirely:

1. **SSH directly to a control plane node**.
2. Use `kubectl` with the admin kubeconfig at `/etc/kubernetes/admin.conf` (set `KUBECONFIG=/etc/kubernetes/admin.conf`). This uses certificate-based auth that bypasses RBAC.
3. Recreate the cluster-admin binding:
```bash
kubectl create clusterrolebinding cluster-admin \
  --clusterrole=cluster-admin \
  --user=<your-user>
```

Prevention: Never give a single ClusterRoleBinding a name that might be confused with a default. Back up RBAC configs. Use `--dry-run=client` before destructive commands.

---

## 🔵 Scaling & Performance

---

**Q35. [L2] Your app gets a traffic spike every day at 9 AM when offices open. HPA isn't fast enough. What do you do?**

**Answer:**
HPA is reactive — it waits for metrics to breach thresholds before scaling. By then you've already had a slowdown.

Solutions:
1. **Predictive scaling with KEDA** — KEDA supports cron-based scaling. Scale up at 8:45 AM before the spike hits.
2. **VPA + HPA combo** — pre-tune pod sizes so each pod handles more load.
3. **Keep minimum replicas higher** — set HPA `minReplicas` higher during business hours using a CronJob that patches the HPA.
4. **Cluster Autoscaler tuning** — pre-warm nodes so pod scheduling isn't delayed when HPA does fire.
5. **Horizontal + Cache** — add caching (Redis) to reduce per-request load.

---

**Q36. [L2] HPA is scaling pods up and down too aggressively, causing instability. How do you fix it?**

**Answer:**
HPA has a stabilization window to prevent thrashing. Tune it:

```yaml
behavior:
  scaleDown:
    stabilizationWindowSeconds: 300  # wait 5 min before scaling down
    policies:
    - type: Pods
      value: 1
      periodSeconds: 60  # scale down max 1 pod per minute
  scaleUp:
    stabilizationWindowSeconds: 0
    policies:
    - type: Pods
      value: 4
      periodSeconds: 60
```

Scale up fast, scale down slow — this is the recommended pattern to handle spiky traffic without instability.

---

**Q37. [L3] Your cluster has 50 nodes and pod scheduling is taking 10+ seconds. What could cause this and how do you fix it?**

**Answer:**
The kube-scheduler evaluates all nodes for each pod. At 50 nodes it shouldn't be slow unless:
1. **High pod churn** — many pods being created/deleted rapidly, overwhelming the scheduler queue.
2. **Complex affinity rules** — complex pod/node affinity is O(n) per scheduling cycle.
3. **Scheduler config `percentageOfNodesToScore`** — default is 100% for small clusters but can be lowered for large ones.
4. **etcd latency** — scheduler reads from etcd. If etcd is slow, scheduling slows.
5. **Webhook admission controllers** — mutating or validating webhooks add latency per-pod.

Fix: Profile with scheduler metrics, simplify affinity rules, tune `percentageOfNodesToScore`, optimize admission webhooks.

---

## 🟠 Advanced Scenarios

---

**Q38. [L3] You need to run a privileged pod that can modify kernel parameters on the host. How do you do this and what are the security implications?**

**Answer:**
Set `securityContext` on the pod/container:
```yaml
securityContext:
  privileged: true
```

Or use specific capabilities instead of full privileged mode (much safer):
```yaml
securityContext:
  capabilities:
    add: ["SYS_ADMIN", "NET_ADMIN"]
```

Security implications:
- A privileged container can escape to the host — it's essentially root on the node.
- If the app is compromised, the attacker owns the node.
- Never run privileged in production unless absolutely necessary (CNI plugins, node debuggers).
- Use PSA (Pod Security Admission) or OPA/Gatekeeper to block privileged pods cluster-wide unless explicitly exempted.

---

**Q39. [L3] You need to do a zero-downtime migration of a StatefulSet (e.g., upgrading Postgres version). Walk me through your approach.**

**Answer:**
StatefulSets don't support zero-downtime rolling updates as cleanly as Deployments because each pod has unique state.

Approach:
1. **Take a backup first** — always. Snapshot the PVC with VolumeSnapshot or pg_dump.
2. **Set `updateStrategy` to `OnDelete`** — this lets you control which pods update manually.
3. **Update the StatefulSet spec** (new image version).
4. **Delete pods one at a time** — start with replicas (highest ordinal), not the primary. Let each pod restart with the new version and come up healthy before proceeding.
5. **Verify replication health** between each pod update.
6. **Update the primary last** — failover to a replica first if needed.

For major Postgres version upgrades: consider blue-green approach — spin up new StatefulSet, replicate data, cut traffic over.

---

**Q40. [L3] Your team wants to implement GitOps for Kubernetes. What tools would you recommend and what does the workflow look like?**

**Answer:**
Tools: **ArgoCD** or **Flux** — both are CNCF projects.

GitOps workflow:
1. Developer pushes code → CI pipeline builds image, pushes to registry, updates the image tag in the Git repo (Helm values or kustomize overlay).
2. ArgoCD/Flux watches the Git repo. Detects the change.
3. ArgoCD/Flux applies the new manifests to the cluster.
4. If the cluster state drifts from Git (someone does `kubectl apply` manually), ArgoCD marks the app as OutOfSync and can auto-correct.

Benefits:
- Git is the single source of truth.
- All changes are auditable (git log = change history).
- Rollback = `git revert`.
- No kubectl access needed for developers in production.

---

**Q41. [L2] How do you handle secrets in Kubernetes? What are the problems with default Kubernetes Secrets?**

**Answer:**
Default Kubernetes Secrets problems:
- They're only base64 encoded, not encrypted. Anyone with etcd access can read them.
- They're stored in etcd in plaintext by default (unless etcd encryption is enabled).
- RBAC can restrict who reads them, but it's easy to accidentally over-grant.

Better approaches:
1. **Encrypt etcd at rest** — enable `EncryptionConfiguration` in the API server.
2. **External secrets** — use **External Secrets Operator** to sync secrets from AWS Secrets Manager, HashiCorp Vault, or GCP Secret Manager into Kubernetes Secrets.
3. **Vault Agent Injector** — inject secrets directly into pods as files without storing in etcd at all.
4. **Sealed Secrets (Bitnami)** — encrypt secrets before storing in Git. Safe to commit.

Production recommendation: External Secrets Operator + AWS Secrets Manager or HashiCorp Vault.

---

**Q42. [L3] A developer wants to test a microservice that depends on 8 other services. Setting up the full cluster locally is impractical. What would you suggest?**

**Answer:**
Several approaches:
1. **Telepresence** — run the developer's service locally but connected to the real cluster. Traffic from/to the real cluster routes through the local process. Feels like running in-cluster.
2. **Skaffold** — automates build-deploy cycles. Code change → auto-build → auto-deploy to dev namespace. Fast inner loop.
3. **Namespace-based isolation** — give the developer their own namespace with all dependencies deployed but pointing to shared/mocked backends.
4. **Service virtualization** — mock the dependencies the developer doesn't care about using tools like WireMock or Microcks.
5. **KinD or k3d** — lightweight local Kubernetes for running the full stack locally if resources allow.

Best combo: Telepresence + a shared dev cluster where real dependent services run.

---

**Q43. [L2] Your cluster upgrade from 1.26 to 1.27 failed halfway through. Control plane is on 1.27 but worker nodes are still on 1.26. Is this okay?**

**Answer:**
Yes — this is a supported temporary state during upgrades. Kubernetes supports **N-2 version skew** between control plane and nodes. A 1.27 control plane can manage 1.25, 1.26, and 1.27 nodes.

Next steps:
1. Verify the control plane is healthy: `kubectl get nodes` — control plane nodes should show 1.27.
2. Continue upgrading worker nodes one by one: drain, upgrade kubelet/kubectl/kubeadm, uncordon.
3. Do not skip more than one minor version during upgrades.

Never upgrade worker nodes before the control plane — that would be an unsupported configuration.

---

**Q44. [L2] How do you handle configuration that differs between environments (dev, staging, prod) in Kubernetes?**

**Answer:**
Two main approaches:
1. **Kustomize** — base manifests + environment-specific overlays. Overlay patches change values (image tags, resource limits, replica counts) per environment without duplicating YAML.
2. **Helm** — use different `values.yaml` files per environment. `helm install -f values.prod.yaml` applies prod-specific values.

Best practice:
- Use same manifests for all environments (promotes "production parity").
- Only override what genuinely differs: image tags, replica counts, resource limits, ingress hostnames, secret references.
- Don't use separate Deployment files per environment — too much duplication and drift.

---

**Q45. [L3] You want to implement pod disruption budgets across your cluster. What is a PDB and how does it protect your services?**

**Answer:**
A **PodDisruptionBudget (PDB)** limits how many pods of a deployment can be voluntarily disrupted at the same time. "Voluntary disruption" includes node drains, rolling updates, and cluster upgrades.

Example:
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-app-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: my-app
```

This says: "When draining a node, don't proceed if it would bring my-app below 2 running pods."

Use:
- `minAvailable: 2` — at least 2 pods must remain.
- `maxUnavailable: 1` — at most 1 pod can be down at a time.

During a cluster upgrade when nodes are drained, without PDBs your entire deployment could go down if all pods happen to be on the nodes being drained.

---

**Q46. [L2] What happens to pods when you run `kubectl drain` on a node?**

**Answer:**
`kubectl drain` does two things:
1. **Cordons the node** — marks it unschedulable so no new pods land on it.
2. **Evicts all pods** — sends eviction requests (not delete) for every pod. Eviction respects PodDisruptionBudgets.

Exceptions — these pods are NOT evicted by default:
- DaemonSet pods (need `--ignore-daemonsets` flag to proceed).
- Pods with local storage (need `--delete-emptydir-data` flag).
- Pods not managed by a controller (standalone pods) — drain will fail unless you force it.

After drain: the node is empty and safe to maintain/terminate.

---

**Q47. [L3] Explain how the Kubernetes scheduler makes a placement decision for a new pod.**

**Answer:**
The scheduler goes through two phases:

**Phase 1: Filtering (Predicates)**
Eliminate nodes that can't run the pod:
- Does the node have enough CPU and memory?
- Does the node match the pod's `nodeSelector`?
- Does the pod tolerate the node's taints?
- Are the required volumes available in that zone?
- Does the pod's affinity/anti-affinity rule allow this node?

**Phase 2: Scoring (Priorities)**
Rank the remaining nodes:
- Least requested resources (prefer emptier nodes for better bin-packing).
- Affinity preference scores.
- Topology spread.
- Image locality (prefer nodes that already have the image pulled).

The highest-scoring node wins. If tied, a random one is picked.

The scheduler then writes the chosen node name into the pod's spec (`nodeName` field), and the kubelet on that node picks it up and starts the pod.

---

**Q48. [L2] What is a LimitRange and why would you use it?**

**Answer:**
A LimitRange sets default and maximum resource requests/limits for pods in a namespace. If a pod doesn't specify resources, LimitRange fills in defaults.

Why use it:
1. **Prevent runaway pods** — without limits, one pod can consume all node CPU/memory.
2. **Ensure HPA works** — HPA needs resource requests set. LimitRange auto-sets them.
3. **Fair resource sharing** — prevent a single team's namespace from monopolizing the cluster.

Example:
```yaml
limits:
- default:
    cpu: 500m
    memory: 256Mi
  defaultRequest:
    cpu: 100m
    memory: 128Mi
  type: Container
```

---

**Q49. [L3] You have a multi-tenant cluster where different teams share the cluster. How do you isolate them?**

**Answer:**
Soft multi-tenancy in Kubernetes (hard isolation requires separate clusters):

1. **Namespaces** — one namespace per team.
2. **RBAC** — teams can only access their own namespace.
3. **ResourceQuotas** — limit total CPU/memory/pods per namespace.
4. **LimitRanges** — default limits per pod/container.
5. **NetworkPolicies** — namespace-to-namespace traffic blocked by default.
6. **Pod Security Admission** — enforce security baselines (no privileged pods, no hostPath, etc.).
7. **OPA/Gatekeeper or Kyverno** — custom policy enforcement (e.g., all images must come from internal registry).

True hard isolation (different teams can't see each other's API resources at all) requires separate clusters or a multi-tenant solution like vCluster.

---

**Q50. [L3] Explain the difference between `kubectl apply` and `kubectl create`. When would you use each?**

**Answer:**
- **`kubectl create`** — imperative. Creates the resource. Fails if it already exists. Good for one-time resource creation.
- **`kubectl apply`** — declarative. Creates if not exists, updates if it does. Tracks changes using the `kubectl.kubernetes.io/last-applied-configuration` annotation. Good for GitOps and automation.

In CI/CD pipelines, always use `kubectl apply` — it's idempotent. Running the pipeline twice won't fail.

Use `kubectl create` when you specifically want the command to fail if the resource exists (e.g., to prevent accidental overwrites in a script).

`kubectl apply` with `--server-side` (SSA) is the modern approach — the server handles merge strategy instead of the client annotation.

---

**Q51. [L2] Your readiness probe keeps failing even though the app is working fine. What could be wrong?**

**Answer:**
1. **Wrong port or path** — probe is checking a different port/endpoint than the app actually serves.
2. **Probe timeout too short** — if the app takes 2 seconds to respond and `timeoutSeconds: 1`, it always times out.
3. **App returns non-200 for the health path under load** — the readiness endpoint has a bug.
4. **initialDelaySeconds too short** — app needs more time to start before readiness checks begin.
5. **Checking the wrong container port name** — if using `port: http` and the port isn't named, it fails.

Debug: `kubectl describe pod` shows probe failure reason. Also exec into the pod and manually curl the readiness endpoint to see what it returns.

---

**Q52. [L2] What is the difference between liveness and readiness probes? Give a scenario where each is important.**

**Answer:**
- **Liveness probe** — "is this container still alive?" If it fails, Kubernetes restarts the container. Use for detecting deadlocks or infinite loops where the process is running but not making progress.
  - Scenario: A Java app has a thread deadlock. The JVM is running but requests hang forever. Liveness probe detects no HTTP response → restarts container.
  
- **Readiness probe** — "is this container ready to serve traffic?" If it fails, the pod is removed from Service endpoints. Use for apps that need warmup time or temporarily can't serve (e.g., during a DB connection retry).
  - Scenario: App just started and is loading a 5GB ML model. Readiness fails until load completes. No traffic is sent yet. App is not restarted (liveness probe is fine).

Key: failed liveness = restart. Failed readiness = remove from load balancer rotation, but don't restart.

---

**Q53. [L3] Describe the pod lifecycle from `kubectl apply` to the app serving traffic.**

**Answer:**
1. **API server** receives the pod spec, validates it, stores it in etcd. Pod status: `Pending`.
2. **kube-scheduler** notices the unscheduled pod, runs filtering + scoring, writes the `nodeName` to the pod spec.
3. **kubelet on the chosen node** watches for pods assigned to it. Sees the new pod.
4. **kubelet calls the CRI** (Container Runtime Interface — containerd/CRI-O) to pull the image.
5. **Init containers run** sequentially to completion.
6. **Main containers start**. `postStart` lifecycle hook runs if defined.
7. **Liveness and readiness probes start** (after `initialDelaySeconds`).
8. Once **readiness probe passes**, kube-proxy adds the pod IP to the Service endpoints.
9. **Traffic flows** to the pod.

---

**Q54. [L2] Someone applied a bad NetworkPolicy that's blocking all traffic in the cluster. How do you recover?**

**Answer:**
1. **Identify the policy**: `kubectl get networkpolicy -A` — list all NetworkPolicies across namespaces.
2. **Delete the bad one**: `kubectl delete networkpolicy <name> -n <namespace>`.
3. Traffic should restore immediately after deletion (NetworkPolicy is applied in near-real-time by the CNI plugin).

Prevention: 
- Always test NetworkPolicy changes in a staging namespace first.
- Use `kubectl apply --dry-run=server` to validate.
- For complex policies, use tools like Cilium's policy editor to visualize impact before applying.

---

**Q55. [L3] What is the role of etcd in Kubernetes and what happens if etcd goes down?**

**Answer:**
etcd is the key-value store that is Kubernetes' "brain." Every cluster state (pod specs, node info, secrets, configmaps, events) is stored in etcd.

If etcd goes down:
- **Existing pods keep running** — kubelet runs pods independently of the API server.
- **No new pods can be created** — API server can't write new state.
- **No changes work** — no scaling, no new deployments, no config changes.
- **The cluster is effectively read-only and frozen**.

Recovery: restore etcd from a snapshot backup. This is why etcd backups are critical (using `etcdctl snapshot save`).

Production setup: etcd should have an **odd number of nodes (3, 5)** for quorum. With 3 nodes, cluster can tolerate 1 failure. With 5 nodes, 2 failures.

---

**Q56. [L2] How do you pass sensitive configuration (like DB passwords) to a pod without hardcoding them?**

**Answer:**
Use **Kubernetes Secrets**:
1. Create a secret: `kubectl create secret generic db-creds --from-literal=password=mypassword`
2. Reference in pod as env var:
```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-creds
      key: password
```
Or mount as a file:
```yaml
volumeMounts:
- name: creds
  mountPath: /etc/secrets
volumes:
- name: creds
  secret:
    secretName: db-creds
```

File mounting is more secure — env vars can leak in logs and process listings. Also avoid printing env vars in app error messages.

---

**Q57. [L3] You need to run a pod that requires access to the host network (like a network monitoring tool). How do you configure this?**

**Answer:**
```yaml
spec:
  hostNetwork: true
  hostPID: true  # if also needs host PID namespace
```

`hostNetwork: true` makes the pod share the node's network namespace. It can bind to host ports and see all host network interfaces.

Security implications:
- The pod can sniff all traffic on the node.
- Port conflicts — if the pod binds port 80, it conflicts with anything else on port 80 on the host.
- Should only be used for legitimate infrastructure tools (network debuggers, CNI components).
- Block with PSA policy in production namespaces.

---

**Q58. [L2] Explain the concept of resource requests vs limits. What happens if you only set limits and not requests?**

**Answer:**
- **Request** — the guaranteed amount. Scheduler uses this to decide which node has enough room.
- **Limit** — the maximum. Container is throttled (CPU) or killed (memory) if it exceeds this.

If you only set limits and not requests: Kubernetes sets requests equal to limits. This can make scheduling harder because the scheduler thinks each pod needs the full limit amount even if actual usage is much less.

If you set neither: pod gets `BestEffort` QoS class — it's the first to be evicted under node memory pressure.

Recommended practice:
- Set requests accurately based on average usage.
- Set limits higher to allow burst.
- For CPU: it's okay to have a 5x ratio. For memory: be careful — exceeding limit = OOM kill.

---

**Q59. [L3] What are the three QoS classes in Kubernetes and how does each affect eviction?**

**Answer:**
1. **Guaranteed** — `requests == limits` for all containers. Both CPU and memory. Highest priority. Evicted last.
2. **Burstable** — at least one container has requests < limits, or not all containers have both set. Medium priority.
3. **BestEffort** — no requests or limits set at all. Lowest priority. Evicted first when node is under memory pressure.

When a node runs out of memory, kubelet evicts pods in this order: BestEffort → Burstable (lowest priority score first) → Guaranteed.

For critical production workloads: use **Guaranteed** QoS (set requests = limits for memory at minimum) to protect them from eviction.

---

**Q60. [L2] You have a multi-container pod (sidecar pattern). How do the containers share data with each other?**

**Answer:**
Containers in the same pod share:
1. **Network namespace** — they can communicate via `localhost`. If container A serves on port 8080, container B can reach it at `localhost:8080`.
2. **Volumes** — mount a shared `emptyDir` volume. Both containers read/write to the same directory.

Example use case — log shipping sidecar: main app writes logs to `/var/log/app` (emptyDir volume), Fluentd sidecar reads from the same path and ships to Elasticsearch.

They do NOT share the filesystem by default — only through shared volumes.

---

**Q61-Q100 — Additional Kubernetes Scenarios**

---

**Q61. [L2] What is the difference between `emptyDir` and `hostPath` volumes?**

**Answer:**
- `emptyDir` — temporary directory created when pod starts, deleted when pod is removed. Shared between containers in the pod. Good for scratch space or sidecar data sharing.
- `hostPath` — mounts a path from the host node's filesystem. Survives pod restarts as long as the pod stays on the same node. Risky in production — pod is now tied to a specific node and can access host files.

Use `emptyDir` for temporary shared data. Avoid `hostPath` in production unless absolutely necessary (e.g., running Docker-in-Docker or accessing host logs).

---

**Q62. [L3] A cluster-autoscaler is not scaling up even though pods are Pending. What could be wrong?**

**Answer:**
1. **Pod is unschedulable for a reason other than resources** — e.g., node affinity requires a specific label that no node type has. CA won't add nodes it can't schedule the pod on.
2. **Max node count reached** — CA has a configured max. `--max-nodes-total` or per-node-group limit.
3. **Pod has `cluster-autoscaler.kubernetes.io/safe-to-evict: false`** — CA may refuse to scale if eviction of existing pods is blocked.
4. **Cooldown period** — CA has a scale-up cooldown (default 10 min). May be waiting.
5. **Budget exhausted** — cloud account has hit EC2/VM quota.
6. **CA can't provision the requested instance type** — spot capacity unavailable.

Check: CA logs — `kubectl logs -n kube-system <cluster-autoscaler-pod>` — it logs exactly why it's not scaling.

---

**Q63. [L2] How do you roll back a Helm release?**

**Answer:**
```bash
helm history <release-name>         # see all revisions
helm rollback <release-name> 2      # roll back to revision 2
helm rollback <release-name>        # roll back to previous revision
```

Helm keeps a history of all deployed revisions (stored as Secrets in the namespace). Each revision has a snapshot of the values and chart used.

If `--history-max` is set, older revisions are pruned automatically, limiting how far back you can roll.

---

**Q64. [L2] What is Helm and why is it used instead of raw YAML?**

**Answer:**
Helm is a package manager for Kubernetes. A Helm chart bundles all the Kubernetes YAML for an application (Deployment, Service, ConfigMap, Ingress, etc.) with templating.

Why use it:
- **Reusability** — parameterize with values instead of duplicating YAML per environment.
- **Versioning** — charts have versions. Rollback to a previous chart version.
- **Dependency management** — a chart can depend on other charts (e.g., your app chart depends on a Redis chart).
- **Community charts** — Artifact Hub has thousands of pre-built charts for common software.

Downside: Helm templates can get complex. For simpler cases, Kustomize is often cleaner.

---

**Q65. [L3] Explain how Kubernetes handles pod eviction during node memory pressure.**

**Answer:**
kubelet monitors node memory usage against eviction thresholds:
- **Soft eviction** — e.g., `memory.available < 500Mi`. kubelet gives pods a grace period (`eviction-soft-grace-period`, default 90s) to shut down before killing.
- **Hard eviction** — e.g., `memory.available < 100Mi`. kubelet immediately kills pods with no grace period.

Eviction order:
1. BestEffort pods first.
2. Burstable pods that exceed their memory request (most over request first).
3. Guaranteed pods (last resort).

After eviction, the node reports `MemoryPressure` condition and is tainted. New pods won't schedule there until pressure resolves.

---

**Q66. [L2] What is the purpose of `terminationGracePeriodSeconds`?**

**Answer:**
When a pod is deleted, Kubernetes sends `SIGTERM` to the container and waits `terminationGracePeriodSeconds` (default: 30s) for the app to shut down gracefully. After the grace period, `SIGKILL` is sent.

Why it matters:
- Your app should handle `SIGTERM` by finishing in-flight requests and closing connections before exiting.
- If your app needs more than 30s to drain (e.g., it's processing long jobs), increase the grace period.
- If `preStop` hook is defined, it runs before SIGTERM and counts against the grace period.

For web servers: graceful shutdown means finishing current HTTP requests. For consumers: finish processing the current message before stopping.

---

**Q67. [L3] You need to run a pod that will only start after a specific ConfigMap exists in the cluster. How do you implement this?**

**Answer:**
Use an **init container** that polls for the ConfigMap:

```yaml
initContainers:
- name: wait-for-config
  image: bitnami/kubectl
  command: ['sh', '-c', 'until kubectl get configmap my-config; do echo waiting; sleep 5; done']
```

The init container keeps checking every 5 seconds until the ConfigMap exists, then exits (allowing the main container to start).

This pattern is common for sequencing: wait for a database to be ready, wait for a service to exist, wait for a secret to be populated.

---

**Q68. [L2] What is the purpose of `podAntiAffinity` with `topologyKey: topology.kubernetes.io/zone`?**

**Answer:**
This spreads pods across availability zones rather than just across nodes. If your cluster spans 3 AZs (us-east-1a, 1b, 1c), this anti-affinity ensures no two pods of the same app land in the same AZ.

Why: Even with node anti-affinity, all your "different nodes" could be in the same AZ. If that AZ goes down, you lose everything. Zone-spread anti-affinity ensures true high availability across data center failures.

Combine with `topologySpreadConstraints` for finer control over pod distribution across zones and nodes.

---

**Q69. [L3] Describe the Container Storage Interface (CSI) and why it replaced in-tree volume plugins.**

**Answer:**
In-tree volume plugins (like the old AWS EBS plugin built into kubelet) had problems:
- They had to be updated with Kubernetes releases.
- Bugs in storage plugins could crash kubelet.
- Storage vendors couldn't release independently of Kubernetes.

**CSI (Container Storage Interface)** is a standard API that lets storage vendors write drivers that run as pods in the cluster, independent of Kubernetes core.

Flow: 
- PVC created → external-provisioner (CSI sidecar) calls the CSI driver to provision a volume.
- Pod scheduled → node-driver-registrar mounts the volume on the node.
- Container starts with the volume attached.

Vendors like AWS (EBS CSI), Azure Disk, GCP PD, and Portworx all now have CSI drivers. In-tree plugins are deprecated and being removed.

---

**Q70. [L3] What is a mutating admission webhook and give a practical use case?**

**Answer:**
Admission webhooks intercept API requests before they're stored in etcd. **Mutating** webhooks can modify the request (add/change fields). **Validating** webhooks can accept or reject it.

Practical use cases for mutating webhooks:
1. **Istio/Linkerd sidecar injection** — automatically inject the sidecar proxy container into every pod in labeled namespaces.
2. **Default resource limits** — if a pod has no resource limits, auto-add safe defaults.
3. **Label injection** — add team/cost-center labels to all pods.
4. **Image tag enforcement** — replace `latest` tag with the actual SHA digest.

The webhook is an HTTPS server (usually running as a pod). Kubernetes sends the resource spec to it, the server returns a JSON Patch with modifications.

---

**Q71-Q100. Rapid-fire Kubernetes Scenarios**

**Q71. [L1]** Pod shows `ErrImagePull`. **Answer:** Image not found or wrong tag. Check image name/tag. For private registry, ensure imagePullSecret is configured.

**Q72. [L2]** Deployment has 0 ready pods but desired is 3. **Answer:** All pods failing readiness. Check probe config and app logs.

**Q73. [L1]** How do you scale a deployment to 5 replicas? **Answer:** `kubectl scale deployment <name> --replicas=5` or update spec.replicas.

**Q74. [L2]** NodePort service not reachable from outside. **Answer:** Check firewall/security group rules allow the NodePort (30000-32767) range.

**Q75. [L2]** Two pods can't communicate even though NetworkPolicy allows it. **Answer:** CNI plugin may not support NetworkPolicy. Check CNI (Flannel doesn't, Calico does).

**Q76. [L3]** How do you upgrade Kubernetes version with zero downtime? **Answer:** Upgrade control plane first (API server, etcd, scheduler). Then drain, upgrade, uncordon worker nodes one by one.

**Q77. [L2]** Ingress shows `Address: <pending>`. **Answer:** No LoadBalancer IP assigned yet. On bare-metal, need MetalLB. On cloud, wait 1-2 min for cloud LB provisioning.

**Q78. [L1]** How do you get logs from all pods of a deployment? **Answer:** `kubectl logs -l app=<label>` or use label selector.

**Q79. [L2]** Horizontal Pod Autoscaler shows `unknown/50%` for current metric. **Answer:** metrics-server not installed or pods have no resource requests set.

**Q80. [L3]** etcd backup failed. Recovery steps? **Answer:** `etcdctl snapshot save backup.db`. Restore: stop API server, restore snapshot, restart.

**Q81. [L2]** A developer accidentally deleted a namespace. How do you recover? **Answer:** From backup/GitOps. There's no undo in kubectl. This is why GitOps (ArgoCD/Flux) matters — re-apply the Git state.

**Q82. [L2]** Pod shows `Terminating` for hours and won't delete. **Answer:** Force delete: `kubectl delete pod <name> --grace-period=0 --force`. Usually caused by finalizers or stuck volumes.

**Q83. [L3]** Service mesh vs NetworkPolicy — when do you use each? **Answer:** NetworkPolicy = L3/L4 (IP/port). Service mesh (Istio/Linkerd) = L7 (HTTP routing, mTLS, retries, circuit breaking). Use both for layered security.

**Q84. [L2]** How do you make a pod restart on config change without a code change? **Answer:** Add annotation with configmap hash: `checksum/config: {{ include (print .Template.BasePath "/configmap.yaml") . | sha256sum }}` in Helm. Or use Reloader operator.

**Q85. [L2]** A CronJob job ran but the pod isn't showing in `kubectl get jobs`. **Answer:** `successfulJobsHistoryLimit` may be 0 or 1 and old jobs were cleaned. Adjust to keep history.

**Q86. [L3]** Your admission webhook is blocking all pod creation cluster-wide. How do you recover? **Answer:** If webhook server is down, set `failurePolicy: Ignore` on the webhook or delete the `MutatingWebhookConfiguration` object.

**Q87. [L2]** How do you check if a service account has permission to create pods? **Answer:** `kubectl auth can-i create pods --as=system:serviceaccount:<namespace>:<sa-name>`

**Q88. [L1]** What is the difference between `kubectl get` and `kubectl describe`? **Answer:** `get` = brief summary table. `describe` = full detail including events. Use describe for debugging.

**Q89. [L2]** You want to run a one-off debug pod on a specific node. How? **Answer:** `kubectl debug node/<node-name> -it --image=ubuntu` or use `nodeName` field in pod spec.

**Q90. [L3]** Explain how kube-proxy implements Services using iptables. **Answer:** kube-proxy watches Services/Endpoints. Creates iptables DNAT rules: traffic to ClusterIP is redirected to one of the pod IPs using a round-robin probability chain.

**Q91. [L2]** What is topology spread constraints and when would you use it over pod anti-affinity? **Answer:** TopologySpreadConstraints gives fine-grained control over pod distribution (e.g., max skew of 1 between zones). Anti-affinity is binary. Use topology spread for better distribution control.

**Q92. [L2]** A pod needs GPU resources. How do you configure it? **Answer:** Node must have GPU + GPU device plugin installed. Pod requests: `resources.limits: nvidia.com/gpu: 1`. Scheduler finds a node with available GPU.

**Q93. [L3]** Describe leader election in Kubernetes control plane components. **Answer:** Scheduler and controller-manager use Lease objects in etcd. Only the leader processes work. Others watch. If leader fails to renew its lease, another takes over. Prevents split-brain in HA setups.

**Q94. [L2]** What is a finalizer and when would you use one? **Answer:** Finalizer is a string in `metadata.finalizers`. Prevents object deletion until the finalizer is removed. Use case: ensure external resources (cloud volumes, DNS records) are cleaned up before the Kubernetes object is deleted.

**Q95. [L3]** How does the Kubernetes garbage collector work? **Answer:** Uses owner references. When a parent object (Deployment) is deleted, GC deletes owned objects (ReplicaSets → Pods) in cascade. `--cascade=orphan` flag leaves children running.

**Q96. [L2]** How do you run a privileged debug container on a running pod without modifying the pod spec? **Answer:** `kubectl debug -it <pod> --image=ubuntu --share-processes --copy-to=debug-pod` — creates a copy of the pod with an extra debug container.

**Q97. [L3]** What is the Kubernetes watch mechanism and how do informers use it? **Answer:** The API server supports a `watch` query param. Client gets a stream of events (ADDED/MODIFIED/DELETED) instead of polling. Informers use this + a local cache to efficiently react to changes without hammering the API server.

**Q98. [L2]** Explain the difference between `kubectl apply` with a file vs `kubectl apply -k` (kustomize). **Answer:** `-f` applies a single file or directory of raw YAML. `-k` runs Kustomize, applying base + overlays, generating configs, and applying the merged result.

**Q99. [L3]** How would you migrate a stateful workload from one Kubernetes cluster to another with minimal downtime? **Answer:** 1) Snapshot PVC data (Velero). 2) Deploy workload in new cluster from same Git source. 3) Restore data snapshot to new cluster PVCs. 4) Test new cluster. 5) Switch DNS/load balancer to new cluster. 6) Decommission old cluster.

**Q100. [L3]** What is KEDA and how does it extend HPA? **Answer:** KEDA (Kubernetes Event-Driven Autoscaling) scales pods based on external event sources: Kafka topic lag, RabbitMQ queue depth, HTTP request rate, Azure Service Bus, AWS SQS, cron schedules. Standard HPA only uses CPU/memory. KEDA plugs in as a custom metrics source to HPA, enabling scale-to-zero and event-driven scaling.

---

*More Kubernetes scenarios added periodically. PRs welcome.*

---

## 🟤 Additional Kubernetes Scenarios (Q101-Q200)

---

**Q101. [L2] How do you expose a gRPC service in Kubernetes?**
**Answer:** Use a Service with the correct port and protocol annotation. For Ingress: you need an ingress controller that supports gRPC (nginx-ingress with `nginx.ingress.kubernetes.io/backend-protocol: GRPC` annotation, or Istio). gRPC requires HTTP/2, so TLS is typically required. With Istio: define a VirtualService with gRPC routing rules.

**Q102. [L3] Explain how Kubernetes handles rolling back a DaemonSet update.**
**Answer:** DaemonSets support `kubectl rollout undo daemonset/<name>` similar to Deployments. DaemonSet keeps rollout history (configurable via `revisionHistoryLimit`). During rollback, it re-applies the previous pod template spec, updating nodes one by one based on `updateStrategy`. The main difference from Deployments: there's no concept of "unavailable" limit since each node must have exactly one pod.

**Q103. [L2] A Kubernetes Job is stuck at "0/1 Running" and never starts. What do you check?**
**Answer:** Same as any pod: `kubectl describe job <n>`, check the created pod's events. Common issues: image pull error, no nodes with enough resources, node selector mismatch, parallelism setting. For Jobs with `completions > 1`, check if `parallelism` is set too low or if previous failed pods are blocking.

**Q104. [L2] How do you configure a pod to get secrets from HashiCorp Vault without modifying app code?**
**Answer:** Use Vault Agent Injector (Vault installed in K8s). Annotate the pod:
```yaml
annotations:
  vault.hashicorp.com/agent-inject: "true"
  vault.hashicorp.com/role: "my-app"
  vault.hashicorp.com/agent-inject-secret-config: "secret/data/myapp"
```
The Vault Agent sidecar is injected into the pod. It authenticates with Vault using K8s ServiceAccount token, fetches the secrets, and writes them to a shared volume at `/vault/secrets/`. App reads files. No code change needed.

**Q105. [L3] What is the Kubernetes control loop and how does it apply to custom operators?**
**Answer:** The control loop pattern: watch current state → compare with desired state → take action to reconcile. Controllers (Deployment controller, ReplicaSet controller) do this continuously.

Custom operators use the same pattern for custom resources. You define a Custom Resource Definition (CRD) and write a controller that watches those CRs and reconciles. Example: a PostgreSQL operator watches `Postgres` CRs and creates/manages actual Postgres pods, services, and backups. Tools: kubebuilder, Operator SDK.

**Q106. [L2] How do you restrict a pod from accessing the cloud metadata endpoint (e.g., 169.254.169.254)?**
**Answer:** Without restriction, any pod can query the EC2 metadata endpoint and potentially steal the node's IAM role credentials. Block it with NetworkPolicy:
```yaml
spec:
  podSelector: {}  # all pods
  policyTypes: [Egress]
  egress:
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0
        except:
          - 169.254.169.254/32
```
On EKS: use IMDSv2 which requires a hop limit of 1 (pods can't reach it since they're an extra hop). Configure in the launch template.

**Q107. [L2] What is a ServiceAccount token and when does it expire?**
**Answer:** In K8s 1.21+, ServiceAccount tokens are **bound tokens** — time-limited (default 1 hour), audience-specific, automatically rotated by the kubelet. Older clusters used long-lived JWTs stored as Secrets. Pods access the token at `/var/run/secrets/kubernetes.io/serviceaccount/token`. The kubelet refreshes it before expiry, so the mounted file is always valid.

**Q108. [L3] Explain Kubernetes Operator pattern vs Helm chart. When would you build an Operator?**
**Answer:** Helm chart = templated K8s YAML for stateless deployment. No runtime intelligence. Good for most stateless apps.

Operator = custom controller with domain logic. It knows about the application's lifecycle and handles complex operational tasks: automated backups, failover, rolling upgrades with application-level validation, auto-scaling based on app-specific metrics.

Build an operator when: your app has complex stateful operations, you need automated operational tasks, or you're building a platform component that other teams will consume (like a database operator). Don't build one for simple stateless apps — Helm is simpler.

**Q109. [L2] How do you do a canary deployment on Kubernetes without a service mesh?**
**Answer:** Use two Deployments with the same Service label selector but different replica counts:
- `app-stable`: 9 replicas, version v1
- `app-canary`: 1 replica, version v2

The Service routes to all pods matching `app: myapp`. Traffic split ≈ 90%/10% based on replica ratio.

Pros: simple, no extra tools. Cons: rough traffic split (not exact percentage), all users might hit canary randomly. For precise splits, use Argo Rollouts or Flagger.

**Q110. [L3] What is the purpose of the `kube-proxy` and what happens if it goes down?**
**Answer:** kube-proxy runs on every node (as a DaemonSet) and maintains network rules (iptables or ipvs) that implement Services. It watches the API server for Service/Endpoint changes and updates the rules.

If kube-proxy goes down on a node:
- Existing connections continue (iptables rules still exist).
- New Service/Endpoint changes won't be applied on that node.
- New pods that need to reach a new Service may fail.
- Pods on that node may route to removed pods.

Recovery: restart the kube-proxy pod. It re-syncs all rules.

**Q111. [L2] How do you share a single Nginx config across multiple pods?**
**Answer:** Store the nginx.conf in a ConfigMap. Mount it as a volume in the Deployment. All pods get the same config from the same source. When config changes, update the ConfigMap, then trigger a rolling restart (`kubectl rollout restart deployment/<n>`).

**Q112. [L3] What is Pod Topology Spread Constraints and how is it different from `podAntiAffinity`?**
**Answer:** Both spread pods across topology domains (nodes, zones).

`podAntiAffinity`: binary — either pods can or can't be on the same node. Doesn't control HOW spread out they are.

Topology Spread Constraints: specifies `maxSkew` — the maximum difference in pod count between any two topology domains. `maxSkew: 1` means: never have more than 1 extra pod in one zone vs another. More granular control for even distribution.

Example: 10 pods across 3 zones. With `maxSkew: 1`: could be 4/3/3. Anti-affinity would just say "no two pods on same node" which doesn't ensure zone balance.

**Q113. [L2] How do you implement health checks for a gRPC service in Kubernetes?**
**Answer:** Use the gRPC Health Checking Protocol. Your service implements `grpc.health.v1.Health/Check`. In the probe:
```yaml
grpc:
  port: 50051
  service: "myapp"  # optional service name
```
This is available since K8s 1.24. For older versions: use `exec` probe with `grpc_health_probe` binary copied into the container.

**Q114. [L3] Describe how Kubernetes implements Services using IPVS mode instead of iptables.**
**Answer:** In iptables mode: kube-proxy creates a chain of iptables rules for each Service. With thousands of Services, rule traversal becomes linear (O(n)). Performance degrades.

In IPVS mode: kube-proxy creates an IPVS virtual server for each Service ClusterIP. IPVS uses hash tables for O(1) lookup. Scales to tens of thousands of Services. Also supports more load balancing algorithms: round-robin, least connections, IPIP, etc.

Enable: `--proxy-mode=ipvs` in kube-proxy config. Requires `ipvs` kernel modules. Recommended for large clusters.

**Q115. [L2] You have a Kubernetes cluster in two regions for disaster recovery. How do you sync workloads?**
**Answer:** Use GitOps (ArgoCD) with a shared Git repository. Both clusters sync from the same manifests repo. Each cluster has its own ArgoCD instance. If primary cluster fails: the DR cluster already has all the workload definitions; just ensure the workloads are running (they might be scaled to 0 in DR to save cost, scale them up).

For data: use database replication (Aurora Global, DynamoDB Global Tables). For traffic: Route 53 health checks with failover routing. If primary endpoint goes down, Route 53 automatically routes to DR cluster.

**Q116. [L3] What is the Container Runtime Interface (CRI) and what runtimes are commonly used?**
**Answer:** CRI is the API between kubelet and the container runtime. kubelet doesn't care what runtime is used as long as it speaks CRI.

Common runtimes:
- **containerd** — most popular. Lightweight, CNCF project. Used in EKS, AKS, GKE.
- **CRI-O** — designed specifically for K8s. Used in OpenShift.
- **Docker** (via dockershim) — removed from K8s 1.24. Docker now uses containerd internally anyway.

The runtime handles: pulling images, creating/stopping containers, managing namespaces. kubelet just calls CRI APIs.

**Q117. [L2] How do you implement autoscaling based on custom metrics (e.g., queue depth)?**
**Answer:** Use KEDA (Kubernetes Event-Driven Autoscaling). KEDA supports 50+ built-in scalers:
```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: worker-scaler
spec:
  scaleTargetRef:
    name: worker-deployment
  triggers:
  - type: aws-sqs-queue
    metadata:
      queueURL: https://sqs.us-east-1.amazonaws.com/123/my-queue
      queueLength: "5"
```
This scales the worker deployment based on SQS queue depth — 1 pod per 5 messages. Scales to zero when queue is empty.

**Q118. [L2] A pod is being scheduled and then immediately evicted. What's happening?**
**Answer:** Node is under resource pressure. kubelet evicts lower-priority pods to free resources. Check: `kubectl describe pod <n>` — reason will say `Evicted` with a reason (memory, disk). Check node conditions: `kubectl describe node <n>` — MemoryPressure, DiskPressure, PIDPressure.

Fix: increase node size, add more nodes, reduce pod resource requests, clean up eviction-causing pressure (disk full, memory leak).

**Q119. [L3] How do you implement multi-cluster service discovery so Service A in cluster 1 can call Service B in cluster 2?**
**Answer:** Options:
1. **Submariner** — CNCF project. Creates IPsec tunnels between clusters, enables pod-to-pod communication across clusters.
2. **Istio multi-cluster** — Istio service mesh spanning multiple clusters with shared control plane or separate control planes with federation.
3. **AWS Cloud Map + Route 53** — register services from both clusters in Cloud Map. Use DNS for discovery.
4. **External Ingress** — expose Service B via Ingress/NLB in cluster 2. Service A calls it via the external DNS name. Simple but requires internet or VPC peering.

**Q120. [L2] What is a pause container and why is it in every pod?**
**Answer:** The "infra container" or "sandbox container" that holds the network namespace for the pod. All containers in the pod join its network namespace (that's how they share localhost). If the app container dies and restarts, the network namespace (and IP address) is preserved because the pause container keeps running. Image: `pause:3.x` (few hundred KB). Managed by containerd/CRI-O, not visible in `kubectl get pods`.

**Q121-Q150. More Kubernetes Rapid-fire**

**Q121. [L2]** What is `imagePullPolicy: Always` vs `IfNotPresent`? **Answer:** Always: pulls from registry every pod start (ensures latest changes). IfNotPresent: uses local cache if image tag exists. Production: use specific tags + IfNotPresent (predictable). Dev with `latest`: Always (but avoid `latest` in prod).

**Q122. [L2]** How do you configure resource requests and limits for init containers? **Answer:** Same as regular containers under `initContainers[].resources`. Init containers don't run simultaneously, so effective pod request = max(init container requests, sum of app container requests).

**Q123. [L3]** What is a projected volume in Kubernetes? **Answer:** Combines multiple volume sources (secrets, configmaps, serviceAccountToken, downward API) into a single directory mount. Useful when the app expects all config in one place.

**Q124. [L2]** How do you check what labels are on a node? **Answer:** `kubectl get node <n> --show-labels` or `kubectl describe node <n>`. Add labels: `kubectl label node <n> key=value`.

**Q125. [L2]** What is the downward API in Kubernetes? **Answer:** Exposes pod/node metadata (pod name, namespace, labels, annotations, resource limits) to the container as env vars or volume files. Useful for apps that need to know their own pod name or resource limits without calling the API server.

**Q126. [L3]** How do you handle pod disruptions during Kubernetes version upgrades? **Answer:** Set PodDisruptionBudgets on all critical workloads. `kubectl drain --ignore-daemonsets --delete-emptydir-data`. The drain respects PDBs — won't proceed if it would violate them. Upgrade one node at a time. Monitor workloads between each node upgrade.

**Q127. [L2]** What is `kubectl diff`? **Answer:** Shows what would change if you applied a manifest, compared to what's currently running. Like `terraform plan` for Kubernetes.

**Q128. [L2]** How do you enforce that all pods in a namespace must have resource limits? **Answer:** LimitRange with `defaultRequest` and `default` limits OR use OPA/Gatekeeper/Kyverno policy that rejects pods without resource limits.

**Q129. [L3]** What is Vertical Pod Autoscaler (VPA) and when should you use it vs HPA? **Answer:** VPA adjusts CPU/memory requests of running pods based on actual usage. Use VPA for: workloads where you know they need more resources but can't scale horizontally (stateful single replicas). Use HPA for: stateless apps where horizontal scaling makes sense. Don't use both on the same deployment (conflict on CPU metrics).

**Q130. [L2]** How do you temporarily expose a service from a remote cluster to your local machine for debugging? **Answer:** `kubectl port-forward service/<name> 8080:80` — forwards local port 8080 to the service's port 80. Works through the API server tunnel. Kills when you close the terminal.

**Q131. [L2]** What is `kubectl top` and what does it need to work? **Answer:** Shows real-time CPU/memory usage of nodes and pods. Requires metrics-server to be installed. `kubectl top nodes` and `kubectl top pods`.

**Q132. [L3]** How does Kubernetes handle pod security with the Pod Security Standards? **Answer:** Three levels: Privileged (no restrictions), Baseline (blocks most dangerous capabilities — no privileged, no hostPath), Restricted (most secure — non-root, no capabilities, seccomp required). Apply per-namespace with PodSecurityAdmission: `pod-security.kubernetes.io/enforce: restricted` label on the namespace.

**Q133. [L2]** What is a Kubernetes lease? **Answer:** Lightweight K8s object used for leader election by control plane components (scheduler, controller-manager) and custom controllers. The holder updates the lease's `renewTime` periodically. If it misses renewal (dies), another candidate takes over by writing its identity to the lease.

**Q134. [L2]** How do you get events for a specific namespace sorted by time? **Answer:** `kubectl get events -n <namespace> --sort-by='.lastTimestamp'`. Events are a great first stop when debugging — they capture all resource state changes.

**Q135. [L3]** What is a Service Mesh and when is the complexity worth it? **Answer:** Service mesh (Istio, Linkerd) adds a sidecar proxy to every pod, enabling: mTLS, traffic policies, retries, circuit breaking, distributed tracing, traffic splitting. Complex to operate.

Worth it when: you have 10+ services and need consistent observability across all, you need mTLS for compliance (zero-trust), you want traffic management (canary deployments, circuit breaking) without code changes. Not worth it for: small number of services, team without mesh expertise.

**Q136. [L2]** How do you forward all logs from a Kubernetes pod to Elasticsearch? **Answer:** Use Fluentd or Filebeat as a DaemonSet. They read container logs from `/var/log/containers/` on each node and ship to Elasticsearch. Alternatively: configure your app to log in JSON format to stdout, and the DaemonSet collects and forwards.

**Q137. [L3]** What is eBPF and how is it used in Kubernetes networking? **Answer:** Extended Berkeley Packet Filter — runs sandboxed programs in the Linux kernel. In K8s: Cilium uses eBPF instead of iptables for service routing. Benefits: much faster (kernel bypass for Service lookup), better observability (Hubble), network policy at L7. Becoming the modern replacement for iptables-based kube-proxy.

**Q138. [L2]** What happens when you delete a namespace that has resources in it? **Answer:** K8s deletes all resources in the namespace in dependency order. The namespace stays in `Terminating` until all resources are deleted. If a resource has a finalizer that never gets removed, the namespace is stuck terminating forever. Fix: remove finalizers from stuck resources.

**Q139. [L2]** How do you run a pod on the control plane node? **Answer:** Control plane nodes are tainted with `node-role.kubernetes.io/control-plane:NoSchedule`. Add a toleration to your pod: `tolerations: [{key: "node-role.kubernetes.io/control-plane", operator: "Exists"}]`. Or use `nodeSelector` with the control-plane node label.

**Q140. [L3]** Explain Kubernetes Network Policies' default behavior and why it can be a security risk. **Answer:** By default, K8s has NO network isolation. All pods can talk to all other pods in the cluster, across namespaces. This is intentional (for ease of use) but dangerous in multi-tenant clusters. A pod in namespace A can directly reach a DB pod in namespace B if it knows the IP.

Fix: create a "default deny all" NetworkPolicy in every namespace, then explicitly allow required traffic. This is the secure-by-default approach.

**Q141. [L2]** What is a sidecar container pattern? **Answer:** A helper container that runs alongside the main app container in the same pod, sharing its network and volumes. Examples: Istio proxy (Envoy), Fluentd for log shipping, Vault agent for secrets, nginx as SSL terminator. The sidecar handles cross-cutting concerns without modifying the main app.

**Q142. [L2]** How do you pass the pod's own name to the app running inside it? **Answer:** Use downward API:
```yaml
env:
- name: POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
```

**Q143. [L3]** What is Kubernetes Federation and is it still recommended? **Answer:** Federation v1 (deprecated) tried to manage multiple clusters from a single control plane. It was complex and unreliable. Federation v2 (KubeFed) also proved difficult. Current recommendation: use GitOps (ArgoCD multi-cluster) or dedicated tools (Rancher, Anthos) for multi-cluster management instead.

**Q144. [L2]** How do you create a self-signed TLS certificate for an Ingress? **Answer:** Use cert-manager with `ClusterIssuer: selfsigned`. Or: `openssl req -x509 -nodes -newkey rsa:2048 -out tls.crt -keyout tls.key`, then `kubectl create secret tls my-tls --cert=tls.crt --key=tls.key`. Reference in Ingress `tls` section.

**Q145. [L3]** What is an Admission Controller and how does Kubernetes use them? **Answer:** Plugins that intercept API requests AFTER authentication/authorization but BEFORE persistence in etcd. Two types: Mutating (modify the resource) and Validating (accept/reject). Built-in examples: NamespaceLifecycle (rejects resources in terminating namespaces), ResourceQuota (rejects resources that exceed quota), LimitRanger (sets default limits). Custom ones use webhook admission.

**Q146. [L2]** How do you retrieve only the logs from a specific container in a pod that has multiple containers? **Answer:** `kubectl logs <pod> -c <container-name>`. Get container names: `kubectl get pod <pod> -o jsonpath='{.spec.containers[*].name}'`.

**Q147. [L2]** What is `kubectl apply --prune`? **Answer:** When combined with a label selector, it deletes resources that were previously applied with `kubectl apply` but are no longer in the current manifest set. Useful for GitOps without a full GitOps controller — cleans up old resources.

**Q148. [L3]** How do you implement an egress gateway in a Kubernetes cluster? **Answer:** Force all outbound traffic through a central point (useful for IP whitelisting at third-party APIs). With Istio: configure an EgressGateway service and VirtualService/DestinationRule to route external traffic through it. The gateway's pod IPs can be given static Elastic IPs on AWS. All external traffic appears from known IPs.

**Q149. [L2]** What is the significance of the `--dry-run=server` flag vs `--dry-run=client`? **Answer:** `client`: validates locally using the cached schema. `server`: sends to the API server which validates (including webhook admission controllers) without persisting. Server-side dry-run is more accurate — catches webhook validation issues that client-side misses.

**Q150. [L3]** How do you implement a global rate limiter for all requests to your services in Kubernetes? **Answer:** With Istio: EnvoyFilter or RateLimitPolicy using a Redis-backed rate limit service. With nginx-ingress: `nginx.ingress.kubernetes.io/limit-rps` annotation. With Envoy-based Ingress: global rate limiting service (Envoy Rate Limit) shared across all ingress instances for true global limits.
