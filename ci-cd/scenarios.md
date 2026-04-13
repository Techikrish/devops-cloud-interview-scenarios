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

**Q61. [L2] Your team heavily utilizes GitHub Actions, but the monthly bill for GitHub-hosted runners has skyrocketed. You want to switch to self-hosted runners, but are worried about security and state poisoning if runners are reused. How do you implement this safely?**

> *What the interviewer is testing:* Ephemeral self-hosted CI agents.

**Answer:**
You must undeniably use **Ephemeral Runners** combined with Auto-Scaling (e.g., Actions Runner Controller in Kubernetes).
A standard self-hosted runner executes a job and remains alive to accept the next one. This means a malicious PR could execute `docker run crypto-miner` in the background, or leave behind hidden malware in the `/tmp` directory that instantly infects the next team's build.
By passing the `--ephemeral` flag when registering the runner, the runner mathematically guarantees it will cleanly accept only **one** single job. The moment the job finishes, the runner aggressively unregisters itself and the underlying Pod or EC2 instance is completely destroyed, guaranteeing an immutable, clean slate for every build.

---

**Q62. [L2] Your Kubernetes deployments in CI frequently fail with "ErrImagePull" and "Too Many Requests" from Docker Hub. How do you permanently eliminate Docker Hub rate limiting in your CI/CD pipelines?**

> *What the interviewer is testing:* Registry caching, authenticated pulls, pull-through cache.

**Answer:**
Docker Hub limits unauthenticated pulls to 100 per 6 hours per IP. CI NAT gateways run out of this allowance instantly.
1. **Authenticated Pulls:** The simplest fix is injecting Docker Hub credentials securely into the CI pipeline and Kubernetes pull-secrets. Authenticated users get much higher limits.
2. **Pull-Through Cache (Best Practice):** Relying on the public internet for critical CI builds is dangerous. Configure AWS ECR, Harbor, or Artifactory to act as a **Pull-Through Cache**. 
The CI pipeline points specifically to your internal registry (e.g., `my-registry.com/dockerhub/ubuntu:latest`). If the internal registry doesn't explicitly have it, it fetches it from Docker Hub once, heavily caches it locally forever, and serves it instantly to all future pipelines with zero rate limits and blazing fast local network speeds.

---

**Q63. [L3] A critical deployment pipeline fails completely because an End-to-End (E2E) Selenium UI test timed out. The developer checks the logs, sees the UI test was just checking a non-critical button color, restarts the pipeline, and it magically passes. How do you architecturally solve this flaky E2E issue from destroying team velocity?**

> *What the interviewer is testing:* Test pyramids, test isolation, quarantine mechanisms.

**Answer:**
This is a systemic failure of the **Test Pyramid**. 
UI E2E tests are inherently brittle and slow. If a test is flaky, it destroys developer trust until they start blindly bypassing the CI entirely.
1. **Quarantine:** Immediately tag the flaky test and move it out of the critical blocking pipeline. Run quarantined tests in an asynchronous nightly job until an engineer can explicitly fix its determinism.
2. **Shift Left:** Move the button-color assertion down the pyramid into a blazing fast Unit Test (e.g., using Jest/React Testing Library) which doesn't require launching a heavy, brittle headless browser.
3. **Mock External State:** If the E2E test relies on the network responding perfectly in 500ms, it will always randomly fail. Mock the API layer robustly so the E2E test strictly evaluates frontend logic, not network jitter.

---

**Q64. [L3] Your CI/CD pipeline deploys Application v2 and automatically runs Flyway to apply Database Migration V2. Ten minutes later, a critical bug is found. You swiftly click "Rollback" to Application v1. The pods securely spin up, hit the database, and immediately violently crash. Why, and how must migrations be structured in CI/CD?**

> *What the interviewer is testing:* Backward-compatible migrations, Expand & Contract deployment patterns.

**Answer:**
The application crashed because the **Database schema rolled forward, but the application code rolled backward**. 
If Migration V2 dropped a column or renamed a table, Application v1 mathematically cannot function anymore because the database it expects no longer exists physically. 
*Architectural Fix:* You must strictly enforce the **Expand and Contract Pattern** for database migrations:
1. **Expand (Release 1):** The migration simply *adds* the new column. The old Application v1 ignores it. Both v1 and v2 can safely run simultaneously.
2. **Migrate Data (Release 2):** Background jobs fill the new column cleanly.
3. **Contract (Release 3):** Only after Application v1 has been completely decommissioned and deleted for weeks, a new migration is allowed to finally physically drop the old column.
This ensures instant, painless rollbacks are always architecturally possible.

---

**Q65. [L2] In GitLab CI, you have 5 independent stages. Stage 3 logically cannot begin until Stage 2 finishes. However, Job X in Stage 3 relies strictly on Job A in Stage 1, completely ignoring Stage 2. How do you optimize the pipeline heavily so Job X isn't needlessly waiting?**

> *What the interviewer is testing:* Directed Acyclic Graphs (DAG) in CI.

**Answer:**
You would utilize a **Directed Acyclic Graph (DAG)** by implementing the `needs:` keyword.
By default, GitLab CI fundamentally operates sequentially: all jobs in Stage 1 must absolutely finish before *any* job in Stage 2 can begin.
By defining `needs: [job_a]` explicitly heavily on Job X, you break the rigid stage barrier. GitLab will instantly execute Job X the millisecond that Job A finishes, entirely ignoring the fact that Stage 2 jobs are still slowly churning. This dramatically accelerates parallel execution and drastically reduces overall pipeline wall-clock time.

---

**Q66. [L2] Your GitHub Actions pipeline uses a long-lived AWS Access Key to deploy securely to EKS. The security team mandates that no static long-lived keys can ever be stored in GitHub Secrets due to exfiltration risks. How do you deploy natively without keys?**

> *What the interviewer is testing:* OpenID Connect (OIDC) federation.

**Answer:**
You must implement **OpenID Connect (OIDC)** identity federation.
1. In AWS IAM, you natively register GitHub Actions as an authorized OIDC Identity Provider (IdP).
2. You create an IAM Role that explicitly trusts this IdP, attaching a Condition specifying that only your specific GitHub repository (`repo:my-org/my-app:*`) is allowed to assume it.
3. In the GitHub Actions YAML, use `aws-actions/configure-aws-credentials` and simply provide the IAM Role ARN.
GitHub dynamically requests a short-lived cryptographic JWT token, presents it natively to AWS STS, and receives temporary session credentials valid exclusively for the exact duration of the execution. There are zero static secrets to rotate or steal.

---

**Q67. [L3] Your company transitions entirely to a massive Monorepo housing 50 microservices. A developer alters the `README.md` in the root directory. Suddenly, 50 individual CI/CD pipelines trigger simultaneously, deploying all 50 services to production. How do you architect the CI to intelligently prevent this?**

> *What the interviewer is testing:* Monorepo change detection, path filtering, dependency graph analysis.

**Answer:**
Monorepos require highly intelligent **Path Filtering** and **Dependency Graph Analysis**.
1. **Path Filters:** In GitHub Actions (`paths:`) or GitLab (`rules: changes:`), explicitly restrict service deployments to trigger *only* if code actually changes physically inside that service's highly isolated directory (`src/services/service-a/**`).
2. **Dependency Graphing:** This easily breaks if `service-a` relies heavily on a shared library (`src/libs/auth`). If `auth` changes, `service-a` *must* confidently rebuild. Tools like **Nx, Bazel, or Turborepo** are absolutely mandatory here. They mathematically generate an internal AST dependency graph. If a commit touches `auth`, the tool intelligently analyzes the graph and explicitly triggers builds strictly for the specific subset of dependent microservices, entirely ignoring the other 49.

---

**Q68. [L1] A junior engineer configures the CI pipeline to outright fail explicitly if Code Coverage natively drops identically below `100%`. Why is this considered an extreme anti-pattern in DevOps engineering?**

> *What the interviewer is testing:* Law of Diminishing Returns, realistic metrics, Goodhart's Law.

**Answer:**
Because of **Goodhart's Law**: "When a measure becomes a target, it ceases to be a good measure."
Mandating 100% test coverage heavily incentivizes developers to write incredibly brittle, meaningless assertion-less tests simply to trick the coverage parser into executing every line of code. It actively punishes refactoring and destroys velocity.
Furthermore, the last 15% of coverage usually involves mocking obscure framework internals or impossible exception states (like the server catching fire), offering zero actual business value while doubling development time. Focus strictly heavily on tracking *critical path* functionally and keeping coverage around a realistic 70-85%.

---

**Q69. [L2] Your Artifactory (or Nexus) server abruptly crashes on a Thursday. You discover the disk is 100% full. The CI pipeline has been uploading every single 1GB Docker image and 500MB Java JAR from every single minor commit strictly for the past three years. How do you design an automated, resilient retention policy?**

> *What the interviewer is testing:* Artifact lifecycle management, snapshot vs release.

**Answer:**
Artifact registries must never be treated as infinite black holes. You must ruthlessly separate **Snapshots** (ephemeral development builds) from **Releases** (production artifacts).
1. Configure the strict registry retention policies differently:
   - **Snapshots/Feature Branches:** Ruthlessly delete these completely after 30 days, or explicitly retain only the 5 most recent builds per specific branch. They are inherently disposable.
   - **Releases/Tags:** Retain Production-tagged artifacts indefinitely (or specifically bound to organizational compliance data-retention laws).
2. Institute automated garbage collection pipelines that periodically aggressively purge isolated, untagged, dangling images across the registry to constantly enforce the baseline storage limits without manual intervention.

---

**Q70. [L3] For six months, the team has heavily used "Feature Flags" to safely test code in production. However, during a routine deployment, an engineer accidentally flips an old, forgotten flag named `new_payment_gateway_v1`. Production instantly goes down. What systemic process failed?**

> *What the interviewer is testing:* Feature Flag Technical Debt, Lifecycle management.

**Answer:**
The team treated feature flags essentially as permanent configuration switches rather than highly **Ephemeral Technical Debt**.
When a feature is successfully rolled out to 100% of users and validated, the flag transitions explicitly from a safety mechanism into a highly dangerous loaded gun hidden in the codebase.
*The Process Fix:* Feature Flags must possess a strict, trackable lifecycle heavily integrated into the sprint. Once a flag hits 100% adoption, an automated ticket must be generated directly into the team backlog heavily prioritizing the explicit removal of the flag logic from the codebase. Many enterprise tools natively flag stale flags that haven't toggled strictly in ~30 days, alerting the team to brutally delete them.

---

**Q71. [L2] A critical Sev-1 incident halts production checkout. The team utilizes strict Trunk-Based Development. Do you create a `hotfix` branch explicitly off the broken production release tag, urgently fix it, deploy it directly, and explicitly merge it back to main later?**

> *What the interviewer is testing:* Trunk-based hotfix patterns, "Roll-Forward" mentality.

**Answer:**
**No.** That is a traditional Git-Flow anti-pattern. If you heavily branch off production and deploy directly, you run the immense risk of forgetting to merge the explicit fix strictly back into `main`. The exact next standard sprint deployment will fatally overwrite your isolated fix, causing the Sev-1 incident to violently reappear identically.
In strict Trunk-Based Development, you fundamentally **Fix Forward**. You branch the hotfix directly off `main`, rapidly push the fix directly to `main`, allow the CI pipeline to run an accelerated emergency suite, and instantly deploy `main` strictly back into production. `main` must absolutely always heavily remain the central source of unadulterated truth constantly.

---

**Q72. [L3] Your CI/CD pipeline runs `helm upgrade` heavily to deploy to production. Midway through the deployment, the new pods wildly crash-loop because someone provided an invalid database password in the Secrets file. Helm sits indefinitely in a "Pending-Upgrade" status. What critical Helm CI flags were forgotten?**

> *What the interviewer is testing:* Helm atomicity, `--wait`, `--atomic`.

**Answer:**
By default, `helm upgrade` is a "fire-and-forget" command. It confidently tells the Kubernetes API to update the deployment and immediately boldly returns a `Success (Exit Code 0)` back to the CI pipeline, strictly before Kubernetes even begins attempting to pull the new broken containers.
To ensure the CI aggressively accurately reflects cluster reality:
1. You must append `--wait`. Helm will actively intensely monitor the K8s rollout status and actively block the CI pipeline until the pods are completely natively `Ready`.
2. You must heavily append `--atomic`. If the pods wildly enter a CrashLoopBackOff and heavily fail the `--wait` timeout, `--atomic` forces Helm to automatically completely unroll the deployment safely back to the exact previous stable release flawlessly, leaving the cluster entirely healthy without human intervention.

---

**Q73. [L2] You have 40 distinct repositories. Each repository contains an identical `.gitlab-ci.yml` file heavily duplicating a 100-line shell script that securely deploys to Kubernetes. Security mandates a change to this script securely. How do you implement DRY (Don't Repeat Yourself) fundamentally in CI pipelines?**

> *What the interviewer is testing:* Pipeline Templates, Shared Libraries.

**Answer:**
You must heavily abstract the execution logic into inherently central **Pipeline Templates**.
- In **GitLab CI**, you create a centralized "DevOps" repository heavily containing a `deploy-template.yml`. The 40 repositories simply use the `include: - project: 'devops/templates' file: 'deploy-template.yml'` syntax to remotely import the specific logic.
- In **GitHub Actions**, heavily utilize **Reusable Workflows**.
- In **Jenkins**, strictly enforce **Shared Libraries** written in immutable Groovy.
When the security team mandates a change, you elegantly update the single central template explicitly, and all 40 repositories securely inherit the exact identical update seamlessly on their next immediate pipeline execution natively.

---

**Q74. [L2] You correctly configure GitHub Branch Protection heavily to enforce "Require Pull Request approvals before merging" on `main`. However, the lead developer simply pushes heavily directly to `main` anyway, ignoring the pipeline completely. Why didn't GitHub block them natively?**

> *What the interviewer is testing:* Administrator bypass, strictly enforcing protections.

**Answer:**
By default in GitHub, Branch Protection Rules implicitly natively **exempt Repository Administrators and Organization Owners**. Because the lead developer possessed explicitly elevated Admin rights, the platform natively allowed them to boldly bypass the strict rules heavily at their own discretion.
*Fix:* You must explicitly intensely check the setting **"Include administrators"** (or "Enforce all configured restrictions above for administrators" in exact terminology) buried within the branch protection rules. This democratizes the pipeline, heavily guaranteeing that absolutely nobody, not even the supreme Organization Owner, can ever unilaterally bypass the CI/CD pipeline checks natively.

---

**Q75. [L3] Your massive Jenkins Master node repeatedly crashes heavily with `OutOfMemoryError` identically every Friday afternoon, despite possessing 32GB of RAM. You securely isolated all actual compilation execution off to distributed Jenkins worker nodes. Why is the Master still fatally crashing under load?**

> *What the interviewer is testing:* Master-node JVM heap exhaustion, Pipeline Sandbox parsing, build history bloat.

**Answer:**
Even if you offload physical execution to workers natively, the Jenkins Master JVM is still heavily strictly responsible for dynamically parsing, compiling, and persistently tracking the immense Groovy AST (Abstract Syntax Tree) state for every single highly complex Declarative/Scripted Pipeline executing across the entire cluster.
1. **Pipeline State Bloat:** Highly complex `parallel` loops or deeply nested loops deeply exhaust the Master JVM memory because it aggressively tracks execution state continuously.
2. **Build History:** Aggressively immense amounts of un-rotated build history metadata loading heavily into the GUI crashes the JVM fundamentally.
*Fix:* You must mandate the `Discard Old Builds` plugin securely, drastically simplify the Groovy logic, ensure strictly NO massive parsing happens on the Master explicitly via `@NonCPS`, and aggressively rotate the JVM garbage collector tuning.

---

**Q76. [L2] The QA team strongly complains that testing new features heavily bottlenecks because the solitary "Staging" environment natively is constantly occupied or broken by conflicting developer branches. How do you permanently resolve this environmental constraint?**

> *What the interviewer is testing:* Ephemeral Preview Environments per PR.

**Answer:**
You dynamically eliminate the physical bottleneck by intensely adopting **Ephemeral Preview Environments**.
When a developer strictly opens a Pull Request natively, the CI pipeline heavily leverages GitOps (e.g., ArgoCD namespaces or Terraform workspaces) to explicitly auto-provision a completely isolated, miniature replica fully of the application securely bound to a dynamically generated URL (`pr-405.staging.company.com`).
The QA team explicitly intensely tests that specific PR heavily in total isolation natively. When the PR securely merges and closes, the pipeline receives a webhook to aggressively physically natively tear down and delete the temporary environment, saving huge infrastructural costs securely.

---

**Q77. [L2] Your team heavily integrates a massive 5GB Artificial Intelligence Machine Learning model binary dynamically into a Python application. The CI pipeline fetches this huge file heavily from S3 natively on every test execution, making pipelines take violently over 45 minutes simply downloading files. How do you resolve this?**

> *What the interviewer is testing:* Pre-baking AMIs/Images, caching limits.

**Answer:**
You cannot fundamentally cache a massive 5GB file efficiently via standard ephemeral CI caching mechanisms natively (they often forcefully timeout or natively exceed size quotas).
*Fix:* You must heavily transition to a **Pre-baking Strategy**.
Instead of fetching the model heavily at build execution time natively, heavily create a dedicated cron pipeline that expressly securely cooks the 5GB model deep into a foundational Docker Base Image natively (`company/ml-base-model:v2`).
The standard CI pipeline seamlessly securely updates its Dockerfile expressly pointing to `FROM company/ml-base-model:v2`. Because the immense model is already physically pre-cached securely in the immutable layer natively on the registry/nodes, the pipeline safely completes instantaneously natively.

---

**Q78. [L3] The stringent security compliance team completely mandates that production Kubernetes clusters must physically refuse to deploy any container image natively that wasn't strictly built and verified securely exclusively by the trusted corporate CI pipeline. How do you heavily enforce this cryptography fundamentally?**

> *What the interviewer is testing:* Container signing (Sigstore/Cosign), Admission Controllers.

**Answer:**
You must implement an overarching **Cryptographic Supply Chain Security Architecture** natively.
1. **Signing locally in CI:** Immediately after heavily compiling and aggressively pushing the Docker image securely to the registry natively, the CI pipeline natively leverages a tool explicitly like **Cosign (Sigstore)** (or Docker Content Trust) explicitly securely to cryptographically sign the specific Image SHA exactly using a highly guarded private key.
2. **Admission Controller Validation:** In the Production Kubernetes cluster natively, install a Mutating/Validating Admission Webhook (fundamentally like Kyverno heavily or OPA Gatekeeper). When ArgoCD instructs Kubernetes to strictly deploy the image natively, the Admission Controller violently pauses the request heavily, explicitly queries the registry securely natively for the signature, and mathematically aggressively verifies it strictly heavily against the authorized public key securely. If validation fails, deployment is furiously physically rejected natively.

---

**Q79. [L3] You strictly transition exactly to an ArgoCD GitOps architecture smoothly. However, ArgoCD perpetually strongly complains that a specific Kubernetes Application is hopelessly constantly "Out of Sync", even though you literally just deployed it. No humans physically touched the cluster. What invisible force is causing this?**

> *What the interviewer is testing:* GitOps drift caused by Mutating Admission Webhooks natively (e.g., Istio sidecars).

**Answer:**
This is aggressively commonly intensely caused explicitly by **Mutating Admission Webhooks** natively operating silently entirely within the cluster.
When ArgoCD tightly heavily deploys your vanilla `Deployment.yaml` strictly from Git, it strongly assumes the cluster state will strictly heavily match Git flawlessly. However, after the K8s API aggressively intercepts the physical deployment securely, an internal webhook securely (like an **Istio Sidecar Injector** or an AWS IAM role annotator) profoundly physically modifies the Pod specification directly underneath ArgoCD, furiously securely adding containers or profound labels natively.
Because ArgoCD aggressively compares Git to the altered live cluster, it falsely strictly identifies an immense drift securely natively.
*Fix:* You must explicitly strictly instruct ArgoCD securely violently in its configuration heavily to strictly `# argocd.argoproj.io/compare-options: IgnoreExtraneous` natively or aggressively securely configure it expressly to silently ignore the specific webhook-injected JSON paths natively completely entirely heavily to rapidly restore synchronization.

---

**Q80. [L3] Your team heavily tightly controls a specialized stateful backend deeply handling thousands of long-lived WebSockets explicitly continuously. The business strictly demands an aggressive zero-downtime deployment strategy natively tightly without violently severing the user connections furiously aggressively. Is standard Blue/Green the correct strict mechanism securely heavily?**

> *What the interviewer is testing:* WebSocket statelessness, graceful degradation strategies securely.

**Answer:**
**Absolutely No.** Standard Blue/Green fiercely flips the Load Balancer furiously instantly heavily natively. Active TCP WebSockets physically violently explicitly deeply bound securely directly heavily to the old instances will forcefully immediately abruptly strictly violently terminate natively immediately, causing massive connection drops entirely natively completely thoroughly.
*Fix:* You must intensely uniquely natively adopt a **Graceful Rolling Degradation** strategy explicitly:
1. Heavily spin up the entire newly K8s ReplicaSet intensely completely independently natively.
2. Configure the K8s Service firmly aggressively to explicitly only direct *new* incoming WebSocket handshake connections exclusively explicitly towards exclusively explicitly only heavily the new strictly completely explicitly new Pods violently Native completely exclusively heavily entirely uniquely.
3. Completely vigorously aggressively dispatch a `SIGTERM` exclusively completely furiously deeply explicitly to the old Pods heavily entirely natively natively exclusively. The application code must strictly securely explicitly fiercely intercept the signal completely heavily explicitly internally and heavily strongly cleanly forcefully send a delicate application-level explicit "reconnect explicitly" secure frame payload down explicitly internally completely aggressively internally to the specific connected client natively thoroughly heavily uniquely securely strictly to furiously strictly seamlessly reconnect cleanly.

---

## 🔐 Supply Chain Security & Advanced CI/CD

---

**Q81. [L3] Your security team discovers that the Python package `requests` used in your build was silently replaced in PyPI with a malicious version via a "dependency confusion" attack. No one noticed for 2 weeks because the version number was valid. How do you architect your CI pipeline to prevent this class of attack permanently?**

> *What the interviewer is testing:* Dependency integrity verification, private package mirrors, hash pinning.

**Answer:**
This is a **dependency confusion** or **typosquatting** supply chain attack. Three layers of defence are required:

1. **Hash Pinning:** Use `pip install --require-hashes -r requirements.txt`. Each package entry in `requirements.txt` contains its expected `sha256` hash. If the file downloaded from PyPI doesn't match the exact hash, pip aborts the build immediately.
2. **Private Mirror / Allowlist:** Configure your CI to pull packages exclusively from an **internal Artifactory or AWS CodeArtifact** repository, not directly from the public internet. Every package entering that mirror is scanned and approved by the security team once.
3. **SBOM + CVE Scanning:** Generate a Software Bill of Materials (SBOM) via `syft` on every build and scan it with `grype`. Any package that wasn't in the SBOM last build triggers an alert requiring human review.

---

**Q82. [L2] Your team runs `terraform plan` inside a GitHub Actions workflow. You notice that the plan output printed in the CI logs exposes the full contents of a secret stored in AWS Secrets Manager (because a developer added `output "db_password" { value = data.aws_secretsmanager_secret_version.db.secret_string }`). How do you prevent secret exfiltration via plan output?**

> *What the interviewer is testing:* Terraform sensitive outputs, CI log masking, least-privilege planning.

**Answer:**
Three controls must work together:

1. **Mark outputs sensitive in Terraform:** `output "db_password" { value = "..." sensitive = true }`. Terraform will redact its value in plan output with `(sensitive value)`.
2. **Use a read-only IAM role for `plan` jobs** — the plan role has permissions to *read* state but not `secretsmanager:GetSecretValue`. This means the plan step never even retrieves the plaintext secret.
3. **Scrub logs in CI:** GitHub Actions allows adding secrets to the masked list dynamically: `echo "::add-mask::$SECRET_VALUE"`. Any occurrence of that string in subsequent log output is replaced with `***`.

---

**Q83. [L2] A new SRE joins and notices that every CI pipeline in the organisation lacks any visibility — there are no dashboards showing average build time trends, failure rates, or queue wait times. How do you instrument your CI/CD platform to gain this observability?**

> *What the interviewer is testing:* CI pipeline observability, DORA metrics pipeline, OpenTelemetry for CI.

**Answer:**
Most CI systems emit webhook events on job start, completion, and failure. The observability stack is built on top:

1. **Webhook → Event Bus:** Configure GitHub/GitLab webhooks to push events to an SQS queue or Kafka topic.
2. **OpenTelemetry Spans:** Tools like `otel-cicd` or Honeycomb's CI integration produce an OTEL trace per pipeline run, with child spans per job and step. This gives end-to-end latency decomposition.
3. **DORA Dashboard in Grafana:** Use the Four Keys project (open-sourced by Google DORA) to calculate deployment frequency, lead time, change failure rate and MTTR from the event stream, rendered as Grafana panels.
4. **Alerts:** Alert on P95 queue wait time exceeding 5 minutes (runner starvation), or build success rate dropping below 90% in a rolling 1-hour window.

---

**Q84. [L3] You maintain a microservices platform where 200 services each have their own independent release cadence. A shared authentication library has a critical CVE patched. You need all 200 services to pick up the new library version within 24 hours. How do you automate this across your entire organisation without creating 200 manual PRs?**

> *What the interviewer is testing:* Automated dependency update bots, Renovate/Dependabot at scale.

**Answer:**
Use **Renovate Bot** configured at the organisation level rather than per-repository:

1. **Org-wide Renovate config** (`renovate.json` in a central `github-org/.github` repository): Set `"packageRules"` to auto-merge patch updates for internal libraries, and add a `"schedule"` to batch runs nightly.
2. When the CVE patch is released as version `2.1.1`, Renovate automatically opens a PR in all 200 repositories updating the lockfile. PRs that pass CI are auto-merged within minutes.
3. For emergency CVEs, trigger Renovate forcefully via API: `POST /api/repos/{repo}/trigger` — Renovate re-runs immediately, ignoring the schedule.
4. Track adoption via a **Dependency Dashboard** issue that Renovate auto-maintains in each repo, showing pending vs merged update PRs.

---

**Q85. [L2] Your GitHub Actions workflow is taking 18 minutes because it uploads a 4GB test artifact to GitHub Artifacts storage after every run, even for PRs that fail. How do you reduce pipeline cost and duration with minimal code changes?**

> *What the interviewer is testing:* Conditional artifact uploads, artifact retention policies.

**Answer:**
Two immediate improvements:

1. **Conditional upload:** Only upload artifacts when the job actually passes or when specifically triggered on `main`:
```yaml
- uses: actions/upload-artifact@v4
  if: success() && github.ref == 'refs/heads/main'
  with:
    name: test-results
    path: ./results/
    retention-days: 7
```
2. **Reduce artifact size:** Archive only the failed test reports, not the entire output directory. For a 4 GB binary artifact, push it to S3 directly from the workflow instead of GitHub Artifacts storage — it's 10× cheaper and not subject to GitHub's storage quotas.
3. Set `retention-days: 7` on all artifacts to prevent indefinite storage accumulation.

---

**Q86. [L3] Your organisation transitions from Jenkins to GitHub Actions. During migration, some teams leave their old Jenkins jobs running in parallel "just in case." Six months later, production deployments are happening from both systems simultaneously, causing race conditions. How do you enforce a clean cut-over?**

> *What the interviewer is testing:* Deployment locks, migration governance, single source of deployment truth.

**Answer:**
1. **Deployment Locks:** Introduce a deployment lock in the state store (DynamoDB table or Redis). Both Jenkins and GitHub Actions jobs must acquire the lock before deploying. This prevents simultaneous deployments regardless of source.
2. **Inventory and disable:** Script a Jenkins API query to list all active jobs: `curl -s http://jenkins/api/json?tree=jobs[name,color]`. Disable any job whose name maps to a service that has migrated.
3. **Governance gate:** Add a policy rule (via OPA or a custom GitHub App) that rejects any deployment token request from Jenkins service accounts after a cut-off date.
4. **Audit trail:** Send all deployment events (from both systems) to a central audit log (S3 + Athena). A weekly report highlights any Jenkins deployments still occurring, so the platform team can chase the owning team.

---

**Q87. [L2] A developer on your team commits a 500 MB binary model file directly into the Git repository. The clone time for your monorepo is now 45 minutes. How do you remove it without losing history and prevent it from ever happening again?**

> *What the interviewer is testing:* Git LFS, `git filter-repo`, pre-receive hooks.

**Answer:**
**Immediate cleanup:**
```bash
git filter-repo --path models/big_model.bin --invert-paths
git push --force --all
```
This rewrites history to completely remove the file from every commit. All team members must re-clone or run `git fetch --all && git reset --hard origin/main`.

**Long-term prevention — two layers:**
1. **Git LFS:** Move all binary assets to Git LFS (`git lfs track "*.bin" "*.pkl"`). LFS stores a small pointer in Git, and the actual binary lives in LFS storage (S3). Clone remains fast.
2. **Pre-receive hook (server side):** Configure the GitHub/GitLab server-side hook to reject any push where a single file exceeds 50 MB without also updating `.gitattributes` to track it with LFS.

---

**Q88. [L3] Your CI/CD pipeline deploys directly to production on every merge to `main`. One Friday afternoon, a developer merges a PR and goes offline. The deployment silently fails halfway through — 30% of pods are running new code, 70% are running old code. There are no automated rollback hooks. How do you recover, and how do you prevent this situation architecturally?**

> *What the interviewer is testing:* Deployment readiness, automated rollback, on-call accountability.

**Answer:**
**Immediate recovery:**
- Identify current state: `kubectl rollout status deployment/api` — if `Progressing` is stuck, the rollout is hanging.
- Manually roll back: `kubectl rollout undo deployment/api` — Kubernetes reverts to the previous ReplicaSet revision immediately. Verify with `kubectl rollout history deployment/api`.

**Architectural prevention:**
1. **`--atomic` on Helm, or rollout analysis on Argo Rollouts** — if the deployment does not reach 100% healthy within a timeout, it automatically rolls back.
2. **Deployment freeze rules:** Block merges to `main` after 3 PM on Fridays via a GitHub branch protection check that queries the current time. Simple but highly effective.
3. **Require on-call acknowledgement:** The pipeline sends a Slack message with "Deployment starting, confirm you're watching" and waits 60 seconds for a reaction emoji before proceeding. If no reaction, the pipeline pauses and pages on-call.

---

**Q89. [L2] You are asked to implement a CI check that enforces conventional commit message format (`feat:`, `fix:`, `chore:`, etc.) across all repositories. How do you enforce this both locally and in the CI pipeline?**

> *What the interviewer is testing:* Commit linting, pre-commit hooks, CI policy enforcement.

**Answer:**
**Local enforcement (pre-commit):**
Add `commitlint` to the repo with `husky`:
```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional husky
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit "$1"'
```
A commit with message `"updated stuff"` is now rejected locally with a clear error message.

**CI enforcement (catch bypasses):**
Developers can bypass pre-commit hooks with `git commit --no-verify`. Add a CI job:
```yaml
- name: Lint commit messages
  run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
```
This validates every commit in the PR diff. The PR cannot merge until all commits comply. Combine with branch protection to make this check required.

---

**Q90. [L3] Your infrastructure team uses Terraform Cloud for remote state and applies. In CI, developers run `terraform plan` on every PR. You discover that two developers' PRs simultaneously modified the same resource — when both were merged, the second apply overwrote the first silently. What mechanism prevents this Terraform race condition?**

> *What the interviewer is testing:* Terraform state locking, Terraform Cloud run queuing.

**Answer:**
This race condition is prevented by **state locking**. Terraform backend implementations (S3+DynamoDB, Terraform Cloud, etc.) acquire an exclusive lock on the state file before any `apply` operation. If a second `apply` tries to run while the first holds the lock, it fails immediately with a `state lock` error rather than proceeding.

The underlying issue here is that both PRs passed `plan` independently (with accurate plans), but the second `apply` did not re-plan after the first apply changed the state. Terraform Cloud's native solution is **Run Queuing** — applies are serialised per workspace. The second run queues and then re-plans against the updated state before applying, so it sees the changes already made by the first apply and only does the diff required.

For critical workspaces, enable `plan and apply` mode with manual confirmation to add a human gate before each apply.

---

**Q91. [L2] You need to implement a CI/CD pipeline for a machine learning model — not just the application code, but the model training, evaluation, and registration steps. How does an ML pipeline differ from a standard software CI/CD pipeline?**

> *What the interviewer is testing:* MLOps, model versioning, training as a CI stage.

**Answer:**
ML pipelines introduce three concerns that don't exist in standard pipelines:

| Concern | Standard CI/CD | ML Pipeline |
|---|---|---|
| **Artefact** | Docker image, JAR | Trained model weights (GB-scale) |
| **Test** | Unit/integration tests | Model evaluation metrics (accuracy, F1, latency) |
| **Versioning** | Git SHA | Model registry (MLflow, SageMaker Model Registry) |

The ML CI pipeline stages are:
1. **Data validation** — check that the training dataset schema and statistics match expectations (Great Expectations).
2. **Training** — run training job (SageMaker, Vertex AI, or GPU runner).
3. **Evaluation gate** — compare new model's metrics against the current production model. Block promotion if accuracy degrades >2%.
4. **Model registration** — push to model registry with tags, training run ID, and dataset hash.
5. **Deployment** — update the serving endpoint (canary rollout), monitor for prediction drift.

---

**Q92. [L2] Your team uses ArgoCD for GitOps. A hotfix needs to go to production in under 10 minutes, but the normal process requires a PR, review, and merge. The change is a single environment variable. What is the safest way to fast-track this without bypassing GitOps principles?**

> *What the interviewer is testing:* GitOps emergency process, ArgoCD manual sync, temporary sync windows.

**Answer:**
GitOps does not mean you can't move fast — it means Git is always the source of truth.

**Fast-track process:**
1. **Direct push to a `hotfix/*` branch** by a senior engineer with production write permission (bypassing the standard review requirement, which should be allowed in documented emergency runbooks).
2. **Open a PR immediately** (even simultaneously) so the change is reviewed asynchronously within the hour.
3. In ArgoCD, set a **manual sync** on the app pointing to the hotfix branch: `argocd app set myapp --revision hotfix/env-fix && argocd app sync myapp`. Production is updated within minutes directly from Git.
4. After the main PR merges, revert the app to track `main`: `argocd app set myapp --revision main`.

The key: Git still recorded every change with author and timestamp. The audit trail is intact.

---

**Q93. [L3] You run a SaaS platform and your enterprise customers require a "private build" of your software — compiled from source with their specific config, available only in their VPC, with a signed SBOM. How do you architect a multi-tenant CI/CD pipeline that produces isolated, customer-specific builds?**

> *What the interviewer is testing:* Multi-tenant CI, isolated build environments, SBOM generation.

**Answer:**
The architecture uses **build isolation per tenant**:

1. **Isolated build namespaces:** Each tenant gets a dedicated Kubernetes namespace or AWS CodeBuild project. Builds never share storage, network, or compute with another tenant.
2. **Tenant config injection:** A secure parameter store (AWS Secrets Manager) holds per-tenant config. The CI job assumes a tenant-specific IAM role that can only access that tenant's parameters.
3. **Deterministic builds:** The source code commit SHA is pinned at trigger time. The same SHA produces bitwise-identical output for the same tenant config — verifiable with checksums.
4. **SBOM generation:** After each build, `syft` generates a CycloneDX SBOM. This is signed with `cosign` using a tenant-specific private key and stored in their private S3 bucket.
5. **Delivery to VPC:** The signed image is pushed to a customer-private ECR repository with cross-account pull access granted only to their AWS account ID.

---

**Q94. [L2] Half of your engineering team works on Windows laptops and half on macOS. Your shell scripts in CI keep failing on Windows runners because of line ending issues (`\r\n` vs `\n`) and path separator differences. How do you make your CI pipelines platform-agnostic?**

> *What the interviewer is testing:* Cross-platform CI, `.gitattributes`, containerised CI builds.

**Answer:**
**Root cause:** Windows uses CRLF (`\r\n`) line endings; Linux/macOS use LF (`\n`). Shell scripts with `\r` characters fail silently or with cryptic errors on Linux runners.

**Solutions (layered):**
1. **`.gitattributes` normalisation:** Add `*.sh text eol=lf` and `*.bat text eol=crlf` to force correct line endings in the repo regardless of developer OS.
2. **Containerise the CI build:** Run all CI jobs inside a Linux Docker container (`runs-on: ubuntu-latest` with a Docker executor). Windows developers run the same container locally via Docker Desktop. The environment is identical everywhere.
3. **Replace shell scripts with Python or a task runner (Makefile / Taskfile):** Python handles path separators with `pathlib.Path` natively. Taskfile (`go-task`) has explicit cross-platform task definitions.
4. **Use `#!/usr/bin/env bash` consistently** and validate scripts with `shellcheck` in CI to catch portability issues.

---

**Q95. [L3] Your pipeline deploys to Kubernetes using `kubectl apply -f manifests/`. A colleague points out that no one validates the YAML before it hits the cluster — a typo in a resource limit field goes undetected until the pod fails to schedule. How do you add static validation to the pipeline?**

> *What the interviewer is testing:* Kubernetes manifest validation, kubeconform, OPA/Conftest policy gates.

**Answer:**
Add a dedicated **manifest validation stage** before any `kubectl apply`:

1. **Schema validation with `kubeconform`:**
```bash
kubeconform -strict -kubernetes-version 1.30.0 manifests/
```
This validates every field against the official Kubernetes OpenAPI schema. A wrong `resource.limits.memory: "512Mi"` (note the wrong field path) fails immediately.

2. **Policy validation with `conftest` (OPA):**
Write Rego policies enforcing your standards:
```rego
deny[msg] {
  input.kind == "Deployment"
  not input.spec.template.spec.containers[_].resources.limits
  msg := "All containers must have resource limits"
}
```
Run: `conftest test manifests/`. This catches policy violations the schema alone can't catch.

3. **Dry-run against a real cluster:** `kubectl apply --dry-run=server -f manifests/` sends the manifest to the API server for server-side validation without creating any resources. This catches admission webhook rejections too.

---

**Q96. [L2] Your CI pipeline needs to run database integration tests against a PostgreSQL database, but spinning up a full RDS instance for every PR is too slow and expensive. What is the correct pattern for fast, isolated database tests in CI?**

> *What the interviewer is testing:* Testcontainers, service containers, database-per-test isolation.

**Answer:**
Use **Testcontainers** or CI service containers — not a shared or cloud-hosted database:

**GitHub Actions service container approach:**
```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_PASSWORD: ci_pass
      POSTGRES_DB: test_db
    options: >-
      --health-cmd "pg_isready -U postgres"
      --health-interval 5s
      --health-timeout 3s
      --health-retries 10
```
This spins up a fresh, isolated PostgreSQL container for each job using Docker networking, available at `localhost:5432`. The container is destroyed after the job. No shared state, no cost.

**For even more isolation:** Use Testcontainers library within your test code. Each test class can start its own transient PostgreSQL container with a randomised schema, ensuring zero test interference even when parallelised.

---

**Q97. [L3] You implement a full GitOps pipeline where ArgoCD manages production. A developer accidentally pushes a Kubernetes deployment with `replicas: 0` to the GitOps repository. ArgoCD syncs it, silently taking down the entire service. How do you add a policy gate that prevents zero-replica deployments from ever reaching the GitOps repository?**

> *What the interviewer is testing:* Pre-merge policy gates, Conftest in CI, OPA/Kyverno at admission.

**Answer:**
Two layers of defence — one at the Git level, one at the cluster level:

**Layer 1 — CI policy gate on PR:**
In the CI pipeline that validates the GitOps repo, add a `conftest` check:
```rego
deny[msg] {
  input.kind == "Deployment"
  input.spec.replicas == 0
  msg := sprintf("Deployment %v has replicas=0 which would cause an outage", [input.metadata.name])
}
```
Run `conftest test` on every PR diff. The PR is blocked from merging until this passes.

**Layer 2 — Admission controller in the cluster:**
Install a Kyverno policy as a final defence:
```yaml
validate:
  message: "Replica count must be >= 1 for non-maintenance deployments"
  pattern:
    spec:
      replicas: ">=1"
```
Even if the Git gate is bypassed, the Kubernetes API server rejects the manifest. ArgoCD sync fails with a clear error message, and the service remains unaffected.

---

**Q98. [L2] Your team frequently accidentally breaks the `staging` environment because developers merge half-finished features under feature flags, but the flags are never cleaned up. Staging accumulates stale flag state and begins behaving differently from production. How do you bring hygiene to feature flag management in your CI/CD process?**

> *What the interviewer is testing:* Feature flag lifecycle, automated flag auditing.

**Answer:**
Feature flag rot is a process problem, not just a tooling one:

1. **Expiry dates on flags:** Require every flag created via your flag management tool (LaunchDarkly, Unleash) to have an explicit expiry date. After that date, the platform automatically disables the flag and creates a Jira ticket to remove the code.
2. **Flag-removal PR as part of the release process:** Add a pipeline step that checks for flags that have been at 100% rollout for >7 days and opens an automated PR removing the flag and its conditional branch.
3. **Staging flag parity check:** Add a CI job that compares the flags enabled in staging vs production. Any flag enabled in staging but not production that is older than 2 weeks triggers a Slack alert to the owning team.
4. **Clean staging on demand:** Script a monthly staging environment reset — tear down and recreate from the infrastructure-as-code template, getting a clean flag state matching the IaC defaults.

---

**Q99. [L2] You need to enforce that every Docker image pushed to your internal container registry has been scanned for CVEs and has zero Critical severity vulnerabilities. How do you implement this as a hard gate in the CI pipeline and in the registry itself?**

> *What the interviewer is testing:* Container image scanning, registry admission controls, Trivy or Grype in CI.

**Answer:**
**CI pipeline gate:**
```yaml
- name: Scan image for CVEs
  run: |
    trivy image --exit-code 1 --severity CRITICAL \
      --ignore-unfixed \
      ${{ env.IMAGE_TAG }}
```
`--exit-code 1` makes the job fail if any unfixed Critical CVEs are found. `--ignore-unfixed` skips CVEs where no upstream patch yet exists (reduces noise).

**Registry-level enforcement:**
Configure the registry (ECR, Harbor, or Artifactory) to enforce a scan policy:
- **ECR:** Enable **Enhanced Scanning** (powered by Inspector). Set a lifecycle policy to deny pull of images tagged `:latest` that have Critical findings.
- **Harbor:** Enable the **Interrogation Service** with Trivy. Set a project-level rule: "Prevent vulnerable images from running" at Critical threshold. Images failing the gate cannot be pulled by Kubernetes — the `imagePullPolicy` fails, preventing deployment.

---

**Q100. [L3] Six months after migrating 80 microservices to GitHub Actions, you realise the total GitHub Actions spend has tripled compared to your old Jenkins setup. An audit shows most workflows run on `ubuntu-latest` GitHub-hosted runners. What strategies do you apply to systematically reduce costs without slowing down developer feedback loops?**

> *What the interviewer is testing:* CI cost optimisation, runner right-sizing, caching strategy, job concurrency tuning.

**Answer:**
A systematic cost reduction framework:

1. **Identify top spenders:** GitHub's billing API exposes per-workflow minute usage. Export it and sort by cost. Focus optimisation on the top 10 workflows consuming 80% of spend.
2. **Self-hosted runners for heavy jobs:** Migrate compilation and Docker build jobs to spot EC2 instances (via Actions Runner Controller). Cost drops by ~70% for compute-heavy tasks.
3. **Aggressive dependency caching:** Calculate cache hit rates (GitHub shows this in each `actions/cache` step summary). A 30% cache hit rate means 70% of runs are downloading packages from scratch. Fix the cache key to be more stable.
4. **Cancel redundant runs:** Use `concurrency` groups with `cancel-in-progress: true`. If a developer pushes twice in 30 seconds, the first run is cancelled immediately.
5. **Step-level parallelism:** Replace sequential test steps with a build matrix, running tests in 4 parallel jobs. Total wall-clock time drops 4× but total minutes drop ~20% (faster = less idle time on expensive runners).
6. **Right-size runners:** Jobs that only run shell scripts don't need a 4-CPU runner. Use `runs-on: ubuntu-latest` (2 vCPU) for light jobs and `runs-on: [self-hosted, large]` only for heavy jobs.

---

*More CI/CD scenarios added periodically. PRs welcome.*
