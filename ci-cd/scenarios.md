# 🔄 CI/CD — Scenario-Based Interview Questions

---

## 🔴 Pipeline Failures & Debugging

---

**Q1. [L1] Your CI pipeline fails on every PR. Developers are frustrated and bypassing it. What do you do?**

**Answer:**
A pipeline that's always failing is worse than no pipeline — it loses trust and gets bypassed.

1. **Identify why it's failing** — flaky tests, environment issues, slow builds? Check the failure pattern. Is it always the same test? Same stage?
2. **Fix flaky tests** — quarantine them. Add a `@flaky` tag and move them to a non-blocking stage. Fix them properly later.
3. **Speed up the pipeline** — if it takes 40+ minutes, developers stop waiting for it. Parallelize, cache dependencies, split test suites.
4. **Communicate** — tell the team what's broken and when it'll be fixed. Never silently skip failures.
5. **Add metrics** — track pipeline success rate and mean time to fix. Set a goal: 95%+ success rate.

The rule: the pipeline must be trustworthy and fast. If either is missing, developers will route around it.

---

**Q2. [L2] Your Docker build in CI is taking 20 minutes every run because it reinstalls all dependencies from scratch. How do you fix it?**

**Answer:**
Use **layer caching**. Docker builds layers top-to-bottom. Unchanged layers are reused from cache.

Optimize Dockerfile layer order:
```dockerfile
# Copy dependency files FIRST (changes rarely)
COPY package.json package-lock.json ./
RUN npm install

# Then copy app code (changes every commit)
COPY . .
RUN npm run build
```

Now `npm install` layer is only rerun when package.json changes (rare). App code changes don't invalidate the dependency layer.

Also:
- **CI layer caching** — in GitHub Actions: `docker/build-push-action` has `cache-from/cache-to` for registry-based caching. In GitLab: enable Docker layer caching with runners.
- **BuildKit** — `DOCKER_BUILDKIT=1` enables parallel builds and better caching.

---

**Q3. [L2] A deployment to production failed midway. Half the instances are running the new version, half the old. What do you do?**

**Answer:**
This is a partial deployment — dangerous state. The two versions may be incompatible for traffic.

1. **Immediate action** — roll back by completing the rollback on remaining instances. Don't leave a mixed state.
2. **Check backward compatibility** — did the new version require a DB schema change that the old version doesn't support? If yes, you may have a data problem to deal with.
3. **Blue/green preferred** — this wouldn't happen with blue/green deployments. Traffic is only cut over after the full new environment is verified healthy.
4. **Investigate root cause** — why did the deployment fail midway? Disk space? Memory? Bad health check?

Prevention: use blue/green or canary deployments with an automated rollback trigger.

---

**Q4. [L3] Your deployment pipeline promotes to production automatically if staging tests pass. The prod deployment broke users anyway. What failed in your pipeline design?**

**Answer:**
Staging != Production. Common gaps:
1. **Data differences** — staging has fake/small data. Production has edge cases, huge data volumes.
2. **Traffic differences** — staging has 10 req/s. Prod has 50,000 req/s. A race condition that needs high concurrency never triggers in staging.
3. **Third-party integrations** — staging uses sandbox Stripe/Twilio. Prod uses real APIs that may behave differently.
4. **Infrastructure differences** — different instance sizes, different DB configs, missing env vars in prod.
5. **No canary stage** — promote to 1-5% of prod traffic first. Monitor error rates and latency. Only if clean, proceed to full rollout.

Fix: add a canary deployment step between staging and full prod. Monitor for 15-30 minutes. Add automated rollback on error rate threshold.

---

**Q5. [L2] Developers are committing secrets (API keys) to your Git repository. How do you prevent this?**

**Answer:**
**Pre-commit prevention** (stop it before it lands in Git):
1. **Pre-commit hooks** — use tools like `detect-secrets`, `gitleaks`, or `truffleHog` in a pre-commit hook. The commit fails if secrets are detected.
2. **Lefthook or Husky** — manage git hooks across the team.

**CI pipeline detection** (catch it early in the pipeline):
1. Add a secret scanning step in CI: `gitleaks detect --source=.` — fails the pipeline if secrets found.
2. GitLab has built-in secret detection. GitHub has secret scanning (free for public repos, enterprise for private).

**Post-commit response**:
1. If a secret was committed and pushed, immediately rotate the credential (treat as compromised).
2. Remove from git history with `git filter-repo` (not `git filter-branch` — too slow).

Best approach: pre-commit hooks + CI step + developer education.

---

**Q6. [L2] Your CI pipeline runs tests that take 45 minutes. The team wants faster feedback. What do you do?**

**Answer:**
**Parallelize:**
1. Split tests into N groups and run each group on a separate parallel job. Most CI systems (GitHub Actions, GitLab CI) support job matrices. 4 parallel jobs = ~11 minutes.
2. Run fast tests (unit) first, slow tests (integration/E2E) last or only on PR merge.

**Cache:**
1. Cache dependency installs (`node_modules`, pip packages, Maven repo). Saves 2-10 minutes per run.
2. Cache build artifacts between steps.

**Test pyramid:**
1. More unit tests (fast), fewer E2E tests (slow). E2E tests are 100x slower than unit.
2. Quarantine known slow tests and run them nightly, not on every commit.

**Hardware:**
1. Use larger CI runners (more CPU). Build time scales with CPU for compilation-heavy projects.
2. Use caching proxies for package registries.

---

## 🔵 GitOps & Deployment Strategies

---

**Q7. [L2] Explain the difference between blue-green and canary deployments. When would you use each?**

**Answer:**
**Blue-Green:**
- Two identical environments: Blue (current live), Green (new version).
- Deploy to Green, test it, then flip traffic 100% from Blue to Green at once.
- Instant rollback: flip back to Blue.
- Requires 2x infrastructure cost during deployment.
- Best for: apps where a partial rollout would create incompatibility (DB schema changes), or where you need instant rollback capability.

**Canary:**
- Roll out to a small percentage of users (1-10%) first.
- Monitor error rates and latency.
- Gradually increase percentage (10% → 25% → 50% → 100%).
- Rollback: reduce canary percentage to 0%.
- Best for: catching production-specific issues that staging missed, feature releases where you want gradual user exposure.

**When to use each**: Blue-green for infrastructure changes or when you need cleanest rollback. Canary for application changes where you want gradual rollout and real-user testing.

---

**Q8. [L3] Your team practices trunk-based development. A long-running feature takes 3 weeks to build. How do you keep it out of production?**

**Answer:**
Use **feature flags** (feature toggles):
1. Wrap the new feature code in a flag: `if (featureFlags.isEnabled("new-checkout-flow")) { ... }`.
2. The code is deployed to production but the feature is OFF by default.
3. Enable it gradually: for internal users first → beta users → all users.
4. Rollback is instant — just turn the flag off without redeployment.

Tools: LaunchDarkly, Unleash, AWS AppConfig, or a simple Redis/DynamoDB-backed flag store.

Benefits:
- Continuous deployment without exposing incomplete features.
- Separate deployment from release.
- Easy A/B testing.
- Instant kill switch in production.

Downside: flag debt — flags must be cleaned up after feature fully rolls out. Accumulating old flags makes code messy.

---

**Q9. [L3] How do you implement GitOps with ArgoCD for a multi-environment setup (dev, staging, prod)?**

**Answer:**
Structure: one Git repo for application code, one (or same repo separate path) for Kubernetes manifests/Helm values.

```
├── environments/
│   ├── dev/
│   │   └── values.yaml   (image tag, replica count, etc.)
│   ├── staging/
│   │   └── values.yaml
│   └── prod/
│       └── values.yaml
└── helm-chart/
    └── ... (base chart)
```

ArgoCD setup:
1. Create an ArgoCD Application for each environment pointing to the respective environment directory.
2. Dev: auto-sync ON (deploy on every commit).
3. Staging: auto-sync ON after CI passes.
4. Prod: auto-sync OFF. Human approval required. Or auto-sync after staging soak period.

CI pipeline: builds image → pushes to registry → updates image tag in `environments/dev/values.yaml` via git commit → ArgoCD detects change → deploys to dev. Promotion to staging/prod = PR that updates that environment's values.yaml.

---

**Q10. [L2] Your team has a monorepo with 10 services. The CI pipeline runs all 10 services' tests on every commit. How do you optimize this?**

**Answer:**
Use **change detection** to only build/test what changed:

In GitHub Actions:
```yaml
- uses: dorny/paths-filter@v2
  id: changes
  with:
    filters: |
      service-a:
        - 'services/service-a/**'
      service-b:
        - 'services/service-b/**'
```

Then: `if: steps.changes.outputs.service-a == 'true'` — only run service-a jobs if service-a files changed.

Tools: Nx (for Node.js monorepos), Bazel (Google's build system, very granular dependency tracking), Turborepo.

Also: shared libraries are special — if a shared library changes, all services that depend on it must rebuild/retest. Your dependency graph must be accurate.

---

**Q11. [L2] A developer pushed directly to the `main` branch and broke production. How do you prevent this?**

**Answer:**
**Branch protection rules** (GitHub/GitLab):
1. **Require pull requests** — no direct pushes to main. All changes must go through a PR.
2. **Require approvals** — at least 1 (or 2) reviewers must approve before merge.
3. **Require status checks** — CI must pass before merge is allowed.
4. **Require linear history** — no merge commits allowed, must rebase. Keeps history clean.
5. **Restrict who can push** — only CI service accounts can push to protected branches.

Even for small teams: enforce PRs. It takes 10 minutes to set up branch protection and can prevent hours of incident recovery.

---

**Q12. [L3] Your CI pipeline runs E2E tests against a shared staging environment. Multiple branches run tests simultaneously and they interfere with each other. How do you fix this?**

**Answer:**
**Ephemeral environments** — create a new environment for each PR/branch, run tests, then tear it down.

Approaches:
1. **Namespace-per-PR in Kubernetes** — each PR creates a new K8s namespace with all services deployed. Delete namespace when PR closes.
2. **Review Apps in GitLab** — built-in feature. GitLab creates/destroys environments per PR.
3. **Terraform workspaces** — create infra per environment, destroy after.
4. **Database isolation** — each ephemeral env gets its own DB schema or test database.

The cost is slightly higher infra usage, but test reliability is 100x better because there's no shared state pollution.

---

## 🟢 Jenkins & Pipeline Configuration

---

**Q13. [L2] Jenkins pipeline keeps failing with `no such DSL method` error for a step you're using. What's the issue?**

**Answer:**
The Jenkins plugin for that step isn't installed, or the pipeline is running in a restricted sandbox.

1. **Declarative pipeline sandbox** — Declarative Pipelines run in a Groovy sandbox with limited methods. Some methods need `@NonCPS` annotation or must be approved in `Manage Jenkins → In-process Script Approval`.
2. **Plugin missing** — if using `withDockerContainer()`, the Docker Pipeline plugin must be installed.
3. **Wrong pipeline type** — some steps only work in Declarative Pipeline, not Scripted, or vice versa.

Fix: Install the missing plugin, approve the method in Script Approval, or restructure the pipeline to avoid sandbox-restricted methods.

---

**Q14. [L2] Jenkins agents keep running out of disk space. What do you do?**

**Answer:**
1. **Workspace cleanup** — add `cleanWs()` at the end of every pipeline. Removes workspace files after the build.
2. **Docker image cleanup** — old Docker images accumulate. Add `docker system prune -f` as a periodic maintenance job.
3. **Build log rotation** — set `discard old builds` policy: keep only last 10 builds, max 30 days.
4. **Artifact cleanup** — don't archive large artifacts in Jenkins. Push to Nexus/Artifactory/S3 instead.
5. **Larger/separate disk** — mount a dedicated large volume for Jenkins workspaces.
6. **Kubernetes agents** — use ephemeral K8s pods as agents. Each build gets a fresh pod, then it's deleted. No disk accumulation.

---

**Q15. [L3] You need to build a multi-stage pipeline where the deployment to production requires manual approval, but the approval should expire after 24 hours if not taken. How do you implement this in Jenkins?**

**Answer:**
Use Jenkins `input` step with a timeout:

```groovy
stage('Deploy to Production') {
  steps {
    timeout(time: 24, unit: 'HOURS') {
      input message: 'Deploy to Production?',
            ok: 'Proceed',
            submitterParameter: 'APPROVER'
    }
    echo "Approved by: ${APPROVER}"
    // deploy steps
  }
}
```

If no one approves within 24 hours, the pipeline fails (or you can handle the timeout with a `try/catch` to abort gracefully).

Notify the approver: use a Slack or email notification step before the `input` step so approvers know action is needed.

---

## 🟡 GitHub Actions

---

**Q16. [L2] Your GitHub Actions workflow is running expensive jobs on every push to every branch, running up costs. How do you optimize?**

**Answer:**
Use **conditional triggers and filters**:

```yaml
on:
  push:
    branches: [main, release/*]  # only specific branches
    paths:
      - 'src/**'         # only when source files change
      - 'package.json'   # or dependencies

  pull_request:
    types: [opened, synchronize]  # not all PR events
```

Also:
- Use `concurrency` to cancel in-progress runs when new commit comes:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
- Cache dependencies aggressively (`actions/cache`).
- Use `if:` conditions on jobs — skip expensive tests on doc-only changes.
- Self-hosted runners for heavy builds (cheaper than GitHub-hosted for large teams).

---

**Q17. [L2] How do you securely pass secrets to a GitHub Actions workflow without hardcoding them?**

**Answer:**
1. **GitHub Secrets** — go to repo Settings → Secrets → add secrets. Reference in workflow as `${{ secrets.MY_SECRET }}`. Never printed in logs.
2. **GitHub Environment Secrets** — scope secrets to specific environments (production, staging). Require environment protection rules (manual approval before accessing prod secrets).
3. **OIDC with AWS/GCP** — instead of storing cloud credentials as secrets, use GitHub's OIDC provider to get short-lived credentials:
```yaml
- uses: aws-actions/configure-aws-credentials@v2
  with:
    role-to-assume: arn:aws:iam::123456789:role/github-actions-role
    aws-region: us-east-1
```
No access keys stored. The IAM role trusts GitHub Actions via OIDC. Most secure approach.

---

**Q18. [L3] You need to build a reusable CI/CD workflow that can be used by 50 different repositories in your GitHub organization. How do you structure this?**

**Answer:**
Use **reusable workflows** (`.github/workflows/` in a central repository):

Central repo (`.github/workflows/build-and-push.yml`):
```yaml
on:
  workflow_call:
    inputs:
      image-name:
        required: true
        type: string
    secrets:
      REGISTRY_TOKEN:
        required: true
```

Consumer repo:
```yaml
jobs:
  build:
    uses: my-org/shared-workflows/.github/workflows/build-and-push.yml@main
    with:
      image-name: my-app
    secrets:
      REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}
```

Benefits: one place to update the pipeline, all repos get the update. Version it with tags (`@v1`, `@v2`) for stability.

---

## 🔵 GitLab CI

---

**Q19. [L2] Your GitLab CI pipeline has a job that needs to run only when a specific file is changed. How do you configure this?**

**Answer:**
Use `rules` with `changes`:

```yaml
deploy-frontend:
  rules:
    - changes:
        - frontend/**
        - package.json
  script:
    - npm run build
    - npm run deploy
```

This job only runs when files under `frontend/` or `package.json` change in the commit.

For more complex conditions:
```yaml
rules:
  - if: '$CI_COMMIT_BRANCH == "main"'
    changes:
      - src/**
    when: always
  - when: never  # skip in all other cases
```

---

**Q20. [L2] A GitLab runner is picking up jobs but they're running much slower than expected. What do you investigate?**

**Answer:**
1. **Runner resources** — check CPU/memory on the runner machine. Is it overloaded with too many concurrent jobs?
2. **Concurrent job limit** — in runner config, `concurrent` setting limits how many jobs run simultaneously on one runner. If set to 10 on a 2-CPU machine, jobs compete for CPU.
3. **Network** — runner pulling Docker images from a slow registry. Add a local registry cache.
4. **No caching** — dependencies being reinstalled every run. Configure GitLab CI caching.
5. **Executor type** — shell executor vs Docker executor vs Kubernetes. Docker adds overhead for image pull.
6. **Shared runner congestion** — if using GitLab.com shared runners, they're shared across millions of users. Register your own dedicated runner.

---

## 🟠 Docker in CI/CD

---

**Q21. [L2] You need to build a Docker image in a GitLab CI pipeline but the pipeline runner uses Docker itself. How do you solve the "Docker-in-Docker" problem?**

**Answer:**
Two approaches:

**Option 1: Docker-in-Docker (DinD)**
- Add `docker:dind` as a service in your GitLab CI job.
- Set `DOCKER_HOST: tcp://docker:2376`.
- Works but requires privileged mode. Security concern.

**Option 2: Kaniko (recommended for security)**
- Kaniko builds Docker images without Docker daemon.
- Runs as a normal container, no privileged mode needed.
```yaml
build:
  image:
    name: gcr.io/kaniko-project/executor:latest
    entrypoint: [""]
  script:
    - /kaniko/executor --context . --destination my-registry/my-app:latest
```

**Option 3: Buildah** — rootless container image build.

Kaniko is the modern recommended approach for CI environments.

---

**Q22. [L2] Your Docker images are huge (3GB). CI pushes take forever. How do you reduce image size?**

**Answer:**
1. **Multi-stage builds** — build in one stage, copy only the artifact to a slim final stage:
```dockerfile
FROM node:18 AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:18-alpine AS runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```
Node image: 1GB. Node-alpine: 130MB. Huge difference.

2. **Use slim/alpine base images** — `ubuntu` = 70MB, `alpine` = 5MB.
3. **Clean up in the same layer** — `RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*`.
4. **`.dockerignore`** — exclude `node_modules`, `.git`, test files from build context.
5. **Use `--no-install-recommends`** for apt installs.
6. **Dive tool** — `dive <image>` shows which layers are large and what files are in them.

---

**Q23. [L3] You're building microservices and you want every service's Docker image to be uniquely and traceably tagged. What's your tagging strategy?**

**Answer:**
Never use `latest` in production — it makes rollback and debugging impossible.

Good strategies:
1. **Git commit SHA** — `my-service:abc1234` — fully unique, traceable. `git rev-parse --short HEAD`.
2. **Semantic version + SHA** — `my-service:1.4.2-abc1234` — human readable + traceable.
3. **Branch + SHA for non-main branches** — `my-service:feature-login-abc1234` for testing.

Workflow:
```yaml
IMAGE_TAG=$CI_COMMIT_SHA  # GitLab
# or
IMAGE_TAG=$GITHUB_SHA     # GitHub Actions
docker build -t my-registry/my-service:$IMAGE_TAG .
docker push my-registry/my-service:$IMAGE_TAG
```

In Kubernetes, the deployment image tag is updated to the new SHA. ArgoCD/Flux detects the change and deploys.

---

## 🟣 Testing in CI

---

**Q24. [L2] You have integration tests that require a database. How do you run them in CI without setting up a real database server?**

**Answer:**
Use service containers in CI:

**GitHub Actions:**
```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: testdb
    options: >-
      --health-cmd pg_isready
      --health-interval 10s

steps:
  - name: Run tests
    env:
      DATABASE_URL: postgres://postgres:testpass@localhost/testdb
    run: pytest tests/integration/
```

**GitLab CI:**
```yaml
services:
  - postgres:15

variables:
  POSTGRES_DB: testdb
  POSTGRES_PASSWORD: testpass
```

The database container runs alongside the test job, accessible at `localhost`. No external DB needed.

---

**Q25. [L3] Your test suite has 1000 tests. Some pass, some fail, some are flaky (fail randomly). How do you manage test reliability?**

**Answer:**
**Categorize tests:**
1. **Stable tests** — always pass or always fail deterministically. Block the pipeline.
2. **Flaky tests** — pass sometimes, fail sometimes. Don't block the pipeline. Quarantine them.
3. **Slow tests** — run in separate parallel job or nightly.

**Quarantine approach:**
- Tag flaky tests: `@pytest.mark.flaky` or `// @flaky` in Jest.
- Run them in a separate non-blocking pipeline step.
- Report results but don't fail the pipeline.
- Track flakiness rate. Priority fix if a test is > 20% flaky.

**Fix flaky tests:**
- Common causes: timing issues (use proper waits, not `sleep`), shared state between tests (isolate), network calls (mock them), race conditions.
- Use retry mechanism as a short-term fix: `pytest-rerunfailures` retries failed tests 2-3 times before marking as failure.

**Flaky test tracking:**
- Tools like BuildPulse, Gradle Enterprise, or custom dashboards track flakiness rate over time.

---

**Q26. [L2] How do you enforce code coverage requirements in your CI pipeline?**

**Answer:**
1. **Generate coverage report** — most test frameworks output coverage: `pytest --cov=. --cov-report=xml` or `jest --coverage`.
2. **Enforce threshold** — fail the CI job if coverage drops below a threshold:
   - pytest: `--cov-fail-under=80`
   - Jest: in `jest.config.js`: `coverageThreshold: { global: { lines: 80 } }`
3. **Coverage gates on diffs** — tools like Codecov or Coveralls check that new code added in a PR has coverage. Old uncovered code is grandfathered; new code must be tested.
4. **Report in PR** — Codecov posts a coverage report directly in the PR comment showing which lines are uncovered.

**Caution**: 100% coverage doesn't mean good tests. Focus on testing critical paths, not gaming the percentage.

---

## 🔵 Additional CI/CD Scenarios

---

**Q27. [L2] How do you handle database migrations in a CI/CD pipeline?**

**Answer:**
Run migrations as part of the deployment pipeline, but carefully:

**Approach:**
1. Migrations run in a pre-deploy job (or init container in K8s) before the new app version starts.
2. Always run migrations before the new app version, never after.
3. Use backward-compatible migrations — the migration must work with both the old app version AND the new app version (in case of rollback).

**Backward-compatible migration pattern:**
- Expand: add new column with a default (old app ignores it, new app uses it).
- Contract: remove old column only after old app version is fully gone.
Never rename a column in one deploy — that breaks the running old-version app.

**Tools:** Flyway, Liquibase, Alembic (Python), Rails migrations.

---

**Q28. [L2] Explain the concept of shift-left security in CI/CD.**

**Answer:**
"Shift-left" means moving security testing earlier in the pipeline (to the left side of the timeline) instead of only checking at the end.

Traditionally: code → build → test → deploy → then a security team scans. By then, findings are expensive to fix.

Shift-left approach — add security checks throughout:
1. **Pre-commit** — secret scanning (gitleaks), dependency vulnerability check.
2. **PR stage** — SAST (Static Application Security Testing) — Semgrep, SonarQube scan for code vulnerabilities.
3. **Build stage** — Docker image scan (Trivy, Snyk) for CVEs in base image and dependencies.
4. **Deploy stage** — DAST (Dynamic Application Security Testing) against staging — OWASP ZAP.
5. **Production** — runtime security (Falco, Wazuh).

Goal: catch 80% of vulnerabilities before they reach production, where they're cheap to fix.

---

**Q29. [L3] Your company has 100 microservices, each with their own CI/CD pipeline. Managing them is overwhelming. How do you standardize?**

**Answer:**
**Golden path** — create a standardized pipeline template that all services inherit:

1. **Reusable pipeline templates** — GitHub reusable workflows, GitLab CI includes, or Jenkins shared libraries. Define the "company standard pipeline" once.
2. **Service catalog** — Backstage.io or similar. Each service registers itself and auto-inherits pipeline config.
3. **Convention over configuration** — if your service is a Node.js app following the standard structure, the pipeline just works. Override only for exceptions.
4. **Platform team** — a small team owns the pipeline templates. Service teams are consumers, not pipeline authors.
5. **Semantic versioning enforcement** — all services use the same versioning pattern.

The goal: a developer creating a new service gets a full CI/CD pipeline out of the box by following the template. Zero pipeline configuration needed.

---

**Q30-Q60 — Rapid-fire CI/CD Scenarios**

**Q30. [L1]** What is the difference between CI and CD? **Answer:** CI = Continuous Integration (code merged, built, tested automatically). CD = Continuous Delivery (code deployable at any time, manual trigger to prod) or Continuous Deployment (auto-deploy to prod on every passing build).

**Q31. [L2]** Your pipeline takes 60 minutes. What is too long? **Answer:** Anything > 10 minutes delays developer feedback. > 20 minutes kills trunk-based development. Aim for < 10 min for the main feedback loop.

**Q32. [L2]** How do you roll back a production deployment in under 5 minutes? **Answer:** Blue/green: flip traffic back to blue. ArgoCD: `argocd app rollback <app> --revision=<prev>`. Helm: `helm rollback <release>`. Feature flags: disable the flag instantly.

**Q33. [L2]** What is a build matrix in CI? **Answer:** Run the same job with multiple combinations of parameters (OS, Python version, Node version). Useful for testing cross-compatibility.

**Q34. [L2]** How do you cache pip dependencies in GitHub Actions? **Answer:** Use `actions/setup-python` with `cache: pip` parameter, or `actions/cache` with the pip cache directory.

**Q35. [L3]** How do you implement zero-downtime deployments for a stateful service? **Answer:** Drain connections, use graceful shutdown, wait for in-flight requests to complete, then switch traffic. Use `terminationGracePeriodSeconds` in K8s. Blue/green for DB migrations.

**Q36. [L2]** What is artifact management and why do you need it? **Answer:** Store build outputs (JARs, Docker images, npm packages) in a repository (Nexus, Artifactory, ECR) for versioning, sharing, and auditability. Never rebuild from scratch for every deployment.

**Q37. [L2]** How do you trigger a pipeline only when a tag is pushed? **Answer:** GitHub Actions: `on: push: tags: ['v*']`. GitLab: `rules: - if: $CI_COMMIT_TAG`.

**Q38. [L2]** You want automated release notes generated from commit messages. How? **Answer:** Use Conventional Commits format (`feat:`, `fix:`, `chore:`). Tools: `semantic-release`, `release-drafter`, `conventional-changelog` auto-generate notes from commit messages.

**Q39. [L3]** How do you implement policy-as-code in your CI pipeline? **Answer:** Use OPA (Open Policy Agent) or Conftest to evaluate infrastructure code (Terraform, K8s YAML) against policies before deployment. E.g., no images from `docker.io`, all pods must have resource limits.

**Q40. [L2]** Your Docker push to ECR fails in CI: `no basic auth credentials`. **Answer:** Authentication expired. Run `aws ecr get-login-password | docker login --username AWS --password-stdin <ecr-endpoint>` before the push step. Add this to the pipeline before any Docker push.

**Q41. [L2]** How do you handle environment-specific secrets in a multi-environment pipeline? **Answer:** Use environment-scoped secrets in GitHub/GitLab. Define production secrets only in the production environment. The job only has access to its environment's secrets. Require approval to access production environment.

**Q42. [L3]** What is a release train model? **Answer:** Multiple teams' features are collected over a sprint and released together on a fixed schedule (e.g., every 2 weeks). Good for coordinating large teams. Downside: a broken feature blocks the whole train. Mitigate with feature flags.

**Q43. [L2]** How do you version Docker images in a way that's safe for rollbacks? **Answer:** Use immutable tags: image:commit-sha or image:v1.2.3. Never overwrite the `latest` tag. Store the deployed tag in your GitOps repo so you always know what's running.

**Q44. [L2]** What is the purpose of a pipeline stages timeout? **Answer:** Prevents stuck jobs from consuming runner resources indefinitely. If a stage hasn't completed in 30 minutes, it's likely hung. Timeout kills it and notifies. Set per-stage based on expected duration.

**Q45. [L3]** How do you implement compliance checks in CI for SOC 2 requirements? **Answer:** Required controls: no secrets in code (secret scanning), audit trail of all deployments (pipeline logs), code review requirement (branch protection), vulnerability scanning (Trivy/Snyk), access controls (who can trigger prod deployments). Generate compliance reports from pipeline metadata.

**Q46. [L2]** What is SBOM and why does your CI pipeline need to generate one? **Answer:** Software Bill of Materials — list of all dependencies and their versions in your software. Required by many compliance frameworks and executive orders. Tools: Syft, CycloneDX. Generate during build, store with artifacts. Used to quickly identify if a known vulnerable library (like Log4Shell) is in any of your apps.

**Q47. [L2]** How do you prevent a bad commit from reaching main when using squash merges? **Answer:** Enable branch protection with required CI checks. Squash merge doesn't bypass CI — the PR's branch must pass checks before the merge button activates.

**Q48. [L3]** How do you implement progressive delivery? **Answer:** Progressive delivery = controlled rollout with automated analysis. Use Argo Rollouts or Flagger. They send 10% traffic to new version, measure error rate and latency, automatically promote if metrics look good or rollback if they don't. No human intervention needed for standard deployments.

**Q49. [L2]** What is the purpose of a Dockerfile `.dockerignore` file? **Answer:** Excludes files from the Docker build context sent to the daemon. Exclude: `node_modules`, `.git`, test files, local configs. Smaller context = faster builds, smaller images, no secrets accidentally copied into the image.

**Q50. [L2]** Your Jenkins pipeline uses credentials stored in Jenkins Credentials Store. How are they accessed in the pipeline? **Answer:** `withCredentials([usernamePassword(credentialsId: 'my-cred', usernameVariable: 'USER', passwordVariable: 'PASS')]) { sh "docker login -u $USER -p $PASS" }`. Jenkins masks the secret values in build logs.

**Q51. [L3]** Explain trunk-based development vs Gitflow. **Answer:** Gitflow: long-lived branches (develop, release, hotfix, feature). Complex, merge hell with many developers. Trunk-based: everyone commits to main (trunk) via short-lived feature branches (< 2 days). Enables CI. Requires feature flags for incomplete features. Gitflow is dying; trunk-based is the modern standard.

**Q52. [L2]** How do you manage Helm chart versioning in CI/CD? **Answer:** Increment chart version on every change. In CI: if app version bumps, bump chart `appVersion` and `version`. Package chart: `helm package`. Push to chart museum (OCI registry or Helm repo). Deployment uses a specific chart version, not `latest`.

**Q53. [L2]** Your CI pipeline has a test that requires a real Stripe API call. How do you handle this in CI? **Answer:** Never make real third-party API calls in CI. Use Stripe test mode credentials (not live). Or better: use a mock server that simulates Stripe API responses. Tools: WireMock, MockServer, Stripe's own test mode. Real API calls add latency, cost, and flakiness to CI.

**Q54. [L3]** How do you implement a self-service deployment platform for developers? **Answer:** Backstage.io + GitHub Actions. Developer clicks "Deploy to staging" in Backstage → triggers a GitHub Actions workflow → deploys the service. Backstage handles auth, audit trail, rollback UI. Developers don't need kubectl access. Platform team builds and maintains the platform. Developers consume it.

**Q55. [L2]** What is the difference between `git merge` and `git rebase` in the context of CI/CD? **Answer:** Merge creates a merge commit, preserves history. Rebase replays commits on top of target, creates linear history. Linear history makes CI pipeline triggers cleaner (no extra merge commits triggering pipelines). Many teams use squash + rebase for clean main history.

**Q56. [L2]** How do you handle a situation where a dependency's latest version breaks your build? **Answer:** Pin dependency versions. Use lock files (package-lock.json, Pipfile.lock, go.sum). Never use `latest` or `^` (caret) ranges in production dependencies without testing. Use Dependabot/Renovate for automated PRs to test dependency updates.

**Q57. [L3]** Your deployment pipeline needs to update a secret in AWS Secrets Manager as part of the release. How do you do this securely? **Answer:** CI job assumes an IAM role (via OIDC — no stored credentials) with only `secretsmanager:PutSecretValue` permission on the specific secret ARN. Runs `aws secretsmanager put-secret-value --secret-id <n> --secret-string <value>`. Audit trail in CloudTrail.

**Q58. [L2]** What metrics would you track to measure CI/CD pipeline health? **Answer:** DORA metrics: Deployment Frequency (how often), Lead Time for Changes (commit to production), Change Failure Rate (% of deployments causing incidents), Mean Time to Recovery (time to restore after incident). Also: pipeline duration, pipeline success rate, queue time.

**Q59. [L3]** How do you implement a multi-cloud deployment pipeline? **Answer:** Abstract cloud differences behind a common interface. Use Terraform for infra (supports AWS, GCP, Azure). Helm/K8s for app deployment. CI pipeline: `terraform apply -var-file=aws.tfvars` for AWS, similar for GCP. Common app config with cloud-specific overrides. Test in all target clouds.

**Q60. [L2]** How do you handle secrets rotation in a running application without downtime? **Answer:** Support both old and new credentials simultaneously during rotation window. Steps: generate new credentials → deploy new version that accepts both old and new → remove old credentials from the service → wait for old version pods to drain → remove old credential support. Feature flags help here.

---

*More CI/CD scenarios added periodically. PRs welcome.*
