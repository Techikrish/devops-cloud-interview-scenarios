# 🤝 Contributing to DevOps & Cloud Interview Scenarios

Thank you for your interest in contributing! This repository thrives on community contributions. Whether you're adding new scenarios, improving existing answers, or fixing typos, your help is valued.

---

## 📋 How to Contribute

### Before You Start

1. **Check existing scenarios** — avoid duplicates. Use the search function or grep.
2. **Follow the format** — consistency makes the repo accessible.
3. **Know the level** — mark questions appropriately: `[L1]` (beginner), `[L2]` (intermediate), `[L3]` (senior/SRE).

---

## ✍️ Scenario Format

Each scenario follows this structure:

```markdown
**Q<number>. [L<level>] <Question text>**

> *What the interviewer is testing:* <Key concept being assessed>

**Answer:**
<Explanation and step-by-step solution>

---
```

### Rules

- **Question**: Plain English, scenario-based (not just "define X"). Real-world situations.
- **Level**: Be honest. `[L1]` = could be first week on the job. `[L2]` = mid-level engineer. `[L3]` = senior/SRE.
- **Answer**: 
  - 2-5 paragraphs max (unless very complex).
  - Include **steps/commands** when applicable.
  - Explain the "why," not just the "what."
  - If controversial, mention multiple approaches.

### Example

```markdown
**Q47. [L2] Your application is connecting to RDS in a private subnet but getting timeout errors. What do you check?**

> *What the interviewer is testing:* VPC/networking troubleshooting, instance connectivity.

**Answer:**
When an app can't reach RDS in a private subnet:

1. **Application is in the same VPC** — if the app is in a different VPC, use VPC Peering or VPC PrivateLink.
2. **Security Groups** — the RDS security group must allow inbound on the DB port (e.g., 5432 for Postgres) from the app's security group. And the app's SG must allow outbound on that port.
3. **Route Tables** — the app's subnet route table must have a route to the database subnet. Usually, within a VPC, local routes handle this (10.0.0.0/16 → local). If the DB is in a different VPC, the route must point to a peering connection or VPN.
4. **RDS endpoint reachability** — from the app server, test: `telnet <rds-endpoint> 5432` or `curl -v telnet://<rds-endpoint>:5432` to verify network connectivity.
5. **DNS resolution** — if using RDS endpoint DNS name (e.g., `mydb.xxxxxx.us-east-1.rds.amazonaws.com`), verify it resolves to the correct IP: `nslookup <rds-endpoint>`.

Most common issue: Security Group rules — the RDS SG doesn't have the app's SG in its inbound rules.
```

---

## 🗂️ File Organization

Scenarios are organized by domain:

```
kubernetes/scenarios.md
aws/scenarios.md
ci-cd/scenarios.md
terraform/scenarios.md
docker/scenarios.md
linux-sre/scenarios.md
observability/scenarios.md
networking/scenarios.md
security/scenarios.md
general-devops/scenarios.md
```

**Choose the right domain:**
- Is it about managing containers? → `docker/`
- About infrastructure as code? → `terraform/`
- Pipeline/deployment automation? → `ci-cd/`
- Monitoring/logging? → `observability/`
- Firewalls/VPCs/routing? → `networking/`
- Compliance/secrets/keys? → `security/`
- Odd mix or doesn't fit? → `general-devops/`

---

## 🚀 Contribution Workflow

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR-USERNAME/devops-cloud-interview-scenarios.git
cd devops-cloud-interview-scenarios
```

### 2. Create a Branch

Use a descriptive branch name:

```bash
git checkout -b add/aws-rds-failover-scenario
git checkout -b improve/kubernetes-networking-explanation
git checkout -b fix/typo-in-terraform-answers
```

### 3. Make Your Changes

- **Add new scenarios**: append to the end of the file. You'll need to update numbering if previous answers reference Q numbers.
- **Improve existing answers**: edit in place. Keep the Q number the same.
- **Fix typos/clarity**: go ahead, very welcome.

### 4. Test Your Markdown

Ensure the file renders correctly:
- Valid Markdown syntax.
- Code blocks are properly fenced with triple backticks.
- Links work (if any).

```bash
# Check for common Markdown issues
grep -E '^\*\*Q[0-9]+\.' kubernetes/scenarios.md | head -5
```

### 5. Commit & Push

```bash
git add kubernetes/scenarios.md
git commit -m "Add: Kubernetes PDB scenario [L2]"
git push origin add/kubernetes-pdb-scenario
```

**Commit message style:**
- `Add: <scenario description>` — new scenario.
- `Improve: <file>: <change desc>` — enhance explanation.
- `Fix: <file>: <issue>` — typo, broken link, error in answer.

### 6. Open a Pull Request

On GitHub, create a PR with:
- **Title**: (same as commit message)
- **Description**: Why you're adding/changing this. Is this filling a gap? Fixing an error?

Example PR description:

```
Adds a scenario about Kubernetes PDB usage for better cluster resilience.
The scenario is [L2] — intermediate SREs should know PDBs.

Fills gap: there was no coverage on how to protect deployments during cluster upgrades.
```

---

## ✅ Quality Checklist

Before submitting, verify:

- [ ] Question is realistic (not contrived).
- [ ] Level (`[L1]`, `[L2]`, `[L3]`) is accurate.
- [ ] Answer is correct (tested knowledge, not guessed).
- [ ] Answer is 2-5 paragraphs (unless complex scenario warrants more).
- [ ] Markdown syntax is valid.
- [ ] No duplicate of existing scenario.
- [ ] Explanation includes "why," not just "what."
- [ ] Any commands/code blocks are tested (or reasonable assumptions).

---

## 🎯 Types of Contributions We Love

### 1. New Real-World Scenarios

Your own on-call incidents make great scenarios. Anonymize sensitive details.

```
"During a production incident last month, we had..."
```

### 2. Improving Answers

Existing answers can be clearer, more comprehensive, or more up-to-date. Suggest improvements!

### 3. Missing Domains

The domains listed above aren't exhaustive. If you have scenarios on a topic not covered, create a new domain! (Discuss first in an Issue.)

### 4. Proofreading

Typos, broken links, outdated tool recommendations — catch them!

### 5. Examples & Diagrams

If a scenario would benefit from a simple diagram (ASCII or Mermaid), add it!

```markdown
**Typical K8s scheduler workflow:**

```
User → kubectl apply
   ↓
API Server (validate & store in etcd)
   ↓
Scheduler (filter & score nodes, write nodeName to pod)
   ↓
Kubelet on chosen node (start container)
   ↓
Readiness probe (add to Service endpoints)
   ↓
Traffic flows
```
```

---

## 📝 Guidelines & Tone

- **Be inclusive**: answers should make sense to someone new to the topic without assuming deep expertise.
- **Be honest**: if there are multiple valid approaches, mention them. Don't pretend there's always one right answer.
- **Be practical**: focus on real-world debugging and problem-solving, not theoretical minutiae.
- **Be concise**: respect readers' time. Don't ramble.
- **Avoid strong opinions** unless backed by reasoning. E.g., instead of "Docker is better than Podman" say "For X use case, Docker is often preferred because..."

---

## 🔄 Review Process

1. **Automated checks**: CI runs a check for Markdown validity. Fix any errors.
2. **Community review**: other contributors review for accuracy, clarity, and fit.
3. **Maintainer approval**: a project maintainer approves and merges.

We usually review within 3-5 days. Please be patient!

---

## 🙋 Questions or Issues?

- **Have an idea but unsure?** Open an Issue first to discuss before writing a PR.
- **Found an error?** Open an Issue or PR with a fix.
- **Want to discuss the scope of the repo?** Start a Discussion.

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the same license as this repository. (See LICENSE file.)

---

## 🌟 Thank You!

This repo is only valuable because of fantastic contributions from the community. Every scenario, improvement, and correction makes it better for the next interviewer at 3 AM prepping for their big interview.

Thank you for making this a great resource! 🙏

---

**Happy contributing!** 🚀 If your PR is merged, consider adding yourself to a contributors list (if we start one). Your work is appreciated.
