# 🐳 Docker — Scenario-Based Interview Questions

---

**Q1. [L1] A container exits immediately after starting. How do you debug it?**
**Answer:** `docker logs <container-id>` — read why it exited. Use `docker run -it <image> sh` to start interactively. Check the entrypoint/cmd. Common cause: the main process exits (e.g., a script returns 0), so the container stops. Containers live only as long as their PID 1 runs.

**Q2. [L2] Your Docker build fails with "no space left on device" on the CI server. What do you do?**
**Answer:** Clean up: `docker system prune -af` removes unused images, containers, volumes, build cache. `docker images | grep '<none>'` finds dangling images. Set up automatic cleanup cron: `docker system prune -f --filter "until=24h"`. Long term: add more disk or use BuildKit with a cache limit.

**Q3. [L2] A containerized app can't connect to a database container on the same Docker host. What's wrong?**
**Answer:** By default, containers are isolated. They need to be on the same Docker network. Create a network: `docker network create app-net`. Run both containers with `--network app-net`. Then use the container name as hostname. If using Docker Compose, all services in the same compose file are auto-networked.

**Q4. [L2] Your Docker image is 2GB. How do you reduce it?**
**Answer:** Multi-stage build (build artifact in fat builder image, copy only artifact to slim runtime). Use alpine-based images. Clean up package manager cache in the same RUN layer. Remove build tools and test files. Use `.dockerignore`. Check with `docker history <image>` or `dive <image>` to find large layers.

**Q5. [L2] How do containers in the same pod (Kubernetes) communicate vs containers in different pods?**
**Answer:** Same pod: share network namespace → communicate via `localhost`. Different pods: need a Kubernetes Service. Direct pod IP works but is ephemeral (changes on restart). Always use Service DNS names.

**Q6. [L3] You need to run a Docker container with access to GPU. How?**
**Answer:** Install NVIDIA Container Toolkit on the host. Run with `--gpus all` or `--gpus '"device=0"'`. In Docker Compose: `deploy: resources: reservations: devices:`. The container can then use CUDA APIs. Verify: `docker run --gpus all nvidia/cuda:11.0-base nvidia-smi`.

**Q7. [L2] A container is consuming 100% CPU. How do you limit it without restarting?**
**Answer:** `docker update --cpus="1.5" <container>` — limit to 1.5 CPU cores. Also `--memory="512m"` for memory limit. For Kubernetes, update the resource limits in the pod spec and trigger a rolling restart.

**Q8. [L2] Explain the difference between COPY and ADD in a Dockerfile.**
**Answer:** COPY: copies files from build context to image. Simple and explicit. ADD: same as COPY but also supports URLs and auto-extracts tar archives. Prefer COPY — ADD's extra features make behavior less predictable. Use ADD only when you specifically need tar extraction.

**Q9. [L3] Your container needs to run as a non-root user for security. How do you set this up?**
**Answer:**
```dockerfile
RUN groupadd -r appuser && useradd -r -g appuser appuser
COPY --chown=appuser:appuser . .
USER appuser
```
The `USER` instruction sets the running user. Application files must be owned by this user. In Kubernetes, set `securityContext.runAsNonRoot: true` and `runAsUser: 1000`. Most base images now have a non-root user you can use (e.g., `node` user in Node.js images).

**Q10. [L2] What is the difference between CMD and ENTRYPOINT?**
**Answer:** ENTRYPOINT defines the main command that always runs. CMD provides default arguments. If ENTRYPOINT is `["nginx"]` and CMD is `["-g", "daemon off;"]`, running `docker run myimage -t` would execute `nginx -t` (CMD replaced by args). If only CMD: `docker run myimage bash` runs bash instead. Best practice: use ENTRYPOINT for the executable, CMD for default arguments.

**Q11. [L2] How do you share data between the host and a container?**
**Answer:** Bind mount: `docker run -v /host/path:/container/path`. Volume: `docker run -v myvolume:/container/path` (Docker manages storage location). Use bind mounts for development (live code changes). Use named volumes for production data (better performance, portable). Avoid bind mounts in production — ties container to specific host path.

**Q12. [L3] You have a microservices app with 10 containers. How do you manage them locally?**
**Answer:** Docker Compose. Define all services in `docker-compose.yml`. `docker-compose up` starts everything. Auto-creates networks, manages startup order with `depends_on`, handles volume mounts. For production: Kubernetes. Compose is for local dev only.

**Q13. [L2] A container is running but your app inside it crashed. Docker shows the container as "Up." Why?**
**Answer:** The container's PID 1 (init process) is still running but the app process (a child) crashed. If using shell scripts as entrypoint, the shell is still alive even after the app it started dies. Fix: use `exec` in shell scripts to replace the shell with the app process: `exec node server.js`. Or use a proper init system in the container. Add a healthcheck to detect app failure.

**Q14. [L2] How do you view resource usage (CPU, memory) of running containers?**
**Answer:** `docker stats` — live stream of CPU%, memory, network I/O, block I/O per container. `docker stats --no-stream` for a one-time snapshot. For historical metrics: use cAdvisor + Prometheus for container-level metrics, or cloud-native tools (CloudWatch Container Insights for ECS/EKS).

**Q15. [L3] Your Docker Compose app needs to wait for a database to be ready before starting the app container. How do you implement this?**
**Answer:** `depends_on` only waits for container start, not for the service inside to be ready.

Solutions:
1. **wait-for-it.sh** — shell script that polls the DB port until it responds.
2. **healthcheck + depends_on condition**:
```yaml
db:
  image: postgres
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 5s

app:
  depends_on:
    db:
      condition: service_healthy
```
`service_healthy` waits for the healthcheck to pass before starting the app.

**Q16. [L2] What is Docker BuildKit and why is it better than the classic builder?**
**Answer:** BuildKit is the modern Docker build backend. Benefits: parallel layer building (faster), better caching, secret mounts (pass secrets to build without storing in image), SSH mount for private repos, inline cache export, reduced image size. Enable: `DOCKER_BUILDKIT=1 docker build .` or set in Docker daemon config. Default in Docker 23+.

**Q17. [L3] You need to pass a GitHub token to `npm install` during Docker build without it ending up in the image. How?**
**Answer:** BuildKit secret mounts:
```dockerfile
RUN --mount=type=secret,id=github_token \
    export GITHUB_TOKEN=$(cat /run/secrets/github_token) && \
    npm install
```
Build: `docker build --secret id=github_token,src=~/.github_token .`

The secret is available only during that RUN step and NOT stored in any layer.

**Q18. [L2] What is the difference between `docker stop` and `docker kill`?**
**Answer:** `docker stop` sends SIGTERM, waits 10 seconds (configurable), then SIGKILL. App can handle SIGTERM for graceful shutdown. `docker kill` sends SIGKILL immediately (or a specified signal). Use `stop` for normal shutdown. Use `kill` only when `stop` doesn't work.

**Q19. [L2] How do you inspect a running container's environment variables and configuration?**
**Answer:** `docker inspect <container>` — full JSON config including environment variables, mounts, network, etc. `docker exec <container> env` — shows env vars from inside the container. `docker inspect --format='{{.Config.Env}}' <container>` for just env vars.

**Q20. [L3] Explain Docker networking modes.**
**Answer:**
- `bridge` (default) — container gets its own IP on a virtual network. Containers talk via bridge or by name (user-defined networks).
- `host` — container shares the host's network namespace. No port mapping needed. Better performance. Less isolation.
- `none` — no networking. Completely isolated.
- `overlay` — for Docker Swarm. Connects containers across multiple hosts.
- `macvlan` — assigns a real MAC address from the host network. Container appears as a physical device on the network.

---

**Q21-Q60. Rapid-fire Docker Scenarios**

**Q21. [L1]** How do you get a shell inside a running container? **Answer:** `docker exec -it <container> bash` or `sh` if bash isn't available.

**Q22. [L1]** What is the difference between a Docker image and a container? **Answer:** Image = read-only template (blueprint). Container = running instance of an image.

**Q23. [L2]** How do you copy a file from a container to the host? **Answer:** `docker cp <container>:/path/to/file /host/path`.

**Q24. [L2]** Your container image build is failing on `apt-get update`. What's likely wrong? **Answer:** Stale package lists or network issue. Add `--no-cache` to Docker build or restructure to always `apt-get update && apt-get install` in the same RUN command.

**Q25. [L2]** What is a multi-stage build and what problem does it solve? **Answer:** Multiple `FROM` statements in one Dockerfile. Build artifacts in a heavy build stage, copy only what's needed to a slim runtime stage. Final image contains no build tools, reducing size and attack surface.

**Q26. [L2]** How do you set environment variables when running a container? **Answer:** `docker run -e DB_HOST=localhost` or `docker run --env-file .env`. For Compose: `environment:` key or `env_file:` key.

**Q27. [L2]** A container writes logs to a file instead of stdout. How do you collect these logs? **Answer:** Mount a volume and use a log shipper sidecar to read and forward the file. Or configure the app to write to stdout. Containers should write to stdout/stderr — Docker captures these as container logs.

**Q28. [L3]** How do you scan a Docker image for vulnerabilities before pushing to a registry? **Answer:** `trivy image <image>` — scans OS packages and app libraries for CVEs. Integrate in CI: fail the pipeline on HIGH/CRITICAL findings. Also: `docker scout cves` (Docker's built-in tool), `snyk container test`.

**Q29. [L2]** What is the purpose of `.dockerignore`? **Answer:** Excludes files from the Docker build context. Smaller context = faster builds. Prevents accidentally copying secrets, `.git`, `node_modules` into the image.

**Q30. [L3]** How do you implement health checks in Docker? **Answer:** In Dockerfile: `HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost/health || exit 1`. Docker marks container as `healthy` or `unhealthy`. Compose and orchestrators use this for readiness.

**Q31. [L2]** How do you build an image for multiple CPU architectures (AMD64 and ARM64)? **Answer:** Docker Buildx with QEMU emulation: `docker buildx build --platform linux/amd64,linux/arm64 -t myimage:latest --push .` Creates a multi-arch manifest. Users automatically get the right architecture.

**Q32. [L2]** How do you push a Docker image to a private registry? **Answer:** `docker login <registry>`. `docker tag myimage:latest <registry>/myimage:latest`. `docker push <registry>/myimage:latest`.

**Q33. [L2]** What does `EXPOSE` do in a Dockerfile? **Answer:** Documents which port the container listens on. Doesn't actually publish the port. To publish: `docker run -p 8080:3000 myimage`. `EXPOSE` is documentation, not security or networking configuration.

**Q34. [L3]** How do you run Docker Compose in production? **Answer:** Docker Compose is not recommended for production at scale. For production: Kubernetes (EKS/GKE/AKS), ECS, or Docker Swarm (simpler than K8s). Compose is for local development and simple single-host deployments.

**Q35. [L2]** How do you override the default CMD when running a container? **Answer:** Add arguments after the image name: `docker run myimage custom-command --flag`. This replaces CMD. To override ENTRYPOINT: `docker run --entrypoint /bin/bash myimage`.

**Q36. [L2]** What is an `init` container (not Kubernetes)? Why might you use `--init` in Docker? **Answer:** `docker run --init` runs a tiny init process (tini) as PID 1. This properly handles zombie process reaping and signal forwarding. Without init, if PID 1 doesn't forward signals, `docker stop` becomes slow and unreliable.

**Q37. [L3]** How do you debug a container that crashes before you can exec into it? **Answer:** Override the entrypoint to sleep: `docker run --entrypoint sleep myimage 300`. Then exec in and investigate. Or: `docker run --entrypoint /bin/sh -it myimage` to get a shell without running the main app.

**Q38. [L2]** What is image layer caching and why does layer ORDER matter? **Answer:** Docker reuses unchanged layers from cache. Layers that change early in the Dockerfile invalidate all subsequent layers. Put slow-changing layers (base image, dependencies) first. Put fast-changing layers (app code) last.

**Q39. [L2]** How do you see which processes are running inside a container? **Answer:** `docker top <container>` — shows running processes. `docker exec <container> ps aux` for more detail.

**Q40. [L3]** Explain Docker content trust (DCT) and why it matters. **Answer:** DCT allows image publishers to sign images and consumers to verify signatures. `DOCKER_CONTENT_TRUST=1` enforces that only signed images can be pulled/run. Prevents running tampered images. Important for supply chain security.

**Q41. [L2]** What is a "dangling image" in Docker? **Answer:** An untagged image (shows as `<none>:<none>`). Created when you build a new image with the same tag — the old layers lose their tag. Clean up: `docker image prune`.

**Q42. [L2]** How do you set resource limits for a Docker Compose service? **Answer:** Under `deploy.resources.limits`: `cpus: '0.5'` and `memory: 512M`. Note: `deploy` key is only respected by Swarm mode; for regular Compose use `mem_limit` and `cpus` at the service level.

**Q43. [L3]** How does container networking work at the Linux kernel level? **Answer:** Each container gets a network namespace. A virtual ethernet pair (veth) connects the container's namespace to a Linux bridge (docker0). iptables rules handle NAT for outbound traffic and port mapping for inbound. The bridge routes traffic between containers on the same network.

**Q44. [L2]** How do you rebuild only a specific service in Docker Compose? **Answer:** `docker-compose build <service>` then `docker-compose up -d <service>`. Compose won't rebuild services that haven't changed unless you add `--build` flag.

**Q45. [L2]** What is the difference between `docker-compose up` and `docker-compose run`? **Answer:** `up` starts all services defined in the compose file as long-running services. `run` runs a one-off command in a service container: `docker-compose run app pytest`. Useful for running migrations, tests, one-time scripts.

**Q46. [L3]** You need to run a container with access to the host's Unix socket (e.g., Docker socket). What are the security implications? **Answer:** Mounting the Docker socket (`/var/run/docker.sock`) gives the container full control over the Docker daemon — effectively root on the host. Extremely dangerous. Alternative: use Docker socket proxy (Tecnativa) that limits which API calls the container can make. Never mount Docker socket in production unless absolutely necessary.

**Q47. [L2]** How do you roll back to a previous Docker image version in Kubernetes? **Answer:** Update the image tag in the deployment to the previous version's tag. `kubectl set image deployment/app container=registry/app:v1.2.3`. Or `kubectl rollout undo deployment/app` if using Deployment rollout history.

**Q48. [L2]** What is Docker Swarm and how does it compare to Kubernetes? **Answer:** Docker Swarm is Docker's built-in orchestration. Simpler to set up and use than Kubernetes. Less features (no Ingress, limited scheduling, smaller ecosystem). Good for: simple orchestration, small teams, single-cloud. Most production workloads have moved to Kubernetes.

**Q49. [L3]** How do you optimize Docker builds in a monorepo where multiple services share code? **Answer:** Use BuildKit's `--build-context` to pass multiple directories as build context. Use cache mounts for shared dependencies. Or extract shared code to a private package registry (npm, PyPI). Build parent images with shared deps, extend in child service Dockerfiles: `FROM shared-base:latest`.

**Q50. [L2]** How do you make sure containers restart on host reboot? **Answer:** `docker run --restart=unless-stopped` — restarts always except when manually stopped. Or `--restart=always`. Docker Compose: `restart: unless-stopped` in the service definition.

**Q51. [L2]** What is the purpose of `docker commit`? **Answer:** Creates a new image from a running container's current state. Rarely used in production (not reproducible). Use it for: quick debugging snapshots. Never for production images — always use Dockerfiles for reproducibility.

**Q52. [L2]** How do you pass build arguments (not environment variables) to a Docker build? **Answer:** `ARG VERSION=latest` in Dockerfile. Build: `docker build --build-arg VERSION=1.2.3 .`. ARG values are available only at build time, not at runtime (use ENV for runtime). Don't pass secrets via ARG — they appear in image history.

**Q53. [L3]** How do you implement a Docker image garbage collection policy in a registry? **Answer:** ECR lifecycle policies: keep only last N images, delete untagged images after X days. `aws ecr put-lifecycle-policy --lifecycle-policy-text file://policy.json`. For Docker Hub: use retention policies. This prevents registry storage costs from growing indefinitely.

**Q54. [L2]** What does `docker save` and `docker load` do? **Answer:** `docker save myimage > image.tar` — exports image to a tar file. `docker load < image.tar` — imports it. Use for air-gapped environments (no internet, can't pull from registry). Also for shipping specific image versions.

**Q55. [L3]** How do you ensure your containers run with the minimum required Linux capabilities? **Answer:** Drop all capabilities, add only needed ones:
```bash
docker run --cap-drop ALL --cap-add NET_BIND_SERVICE myimage
```
In K8s: `securityContext.capabilities.drop: ["ALL"]`, then `add: ["NET_BIND_SERVICE"]`. Running with reduced capabilities limits what a compromised container can do.

**Q56. [L2]** How do you view the Docker build history/layers of an image? **Answer:** `docker history <image>` — shows each layer, its size, and the command that created it. Use `--no-trunc` to see full commands. `dive <image>` for interactive layer explorer.

**Q57. [L2]** What is the difference between `VOLUME` instruction and runtime volume mount? **Answer:** `VOLUME /data` in Dockerfile tells Docker this path should be a volume. Docker auto-creates an anonymous volume at that path if none is provided. Runtime `-v` explicitly mounts a named volume or bind mount. VOLUME instructions ensure data isn't stored in the container layer even if no explicit mount is given.

**Q58. [L3]** How do you run integration tests in CI that require real external services (Redis, Kafka) using Docker? **Answer:** Docker Compose in CI (all services started via compose). Or CI service containers (GitHub Actions services, GitLab CI services). Or testcontainers — a library that programmatically starts Docker containers from test code. Tests spin up the exact services they need, test runs, containers are destroyed.

**Q59. [L2]** How do you debug network connectivity between two containers? **Answer:** `docker network inspect <network>` — see which containers are on the network. From one container: `ping <other-container-name>` (if on same user-defined network). `nslookup <container-name>` to verify DNS. `curl http://<container>:<port>` to test HTTP.

**Q60. [L3]** Explain the security implications of running containers in privileged mode and when it's acceptable. **Answer:** Privileged containers can access all devices, modify kernel parameters, and escape the container namespace. They have near-root access to the host. Acceptable only for: kernel-level tools, CNI plugins, certain monitoring agents, Docker-in-Docker (use Kaniko instead). In production: block with PSA/OPA. Log privileged container creation as a security event.

---

*More Docker scenarios added periodically. PRs welcome.*
