# 🏗️ Terraform & IaC — Scenario-Based Interview Questions

---

## 🔴 State & Locking

---

**Q1. [L1] You ran `terraform apply` and now the state file shows resources that no longer exist in the cloud. How do you fix this?**

**Answer:**
Use `terraform refresh` to sync state with actual infrastructure, or more precisely `terraform plan -refresh-only` to see what would change.

For specific resources: `terraform state rm <resource.address>` removes them from state without deleting the actual resource. Useful when a resource was deleted manually from the console.

Then run `terraform plan` — it will show what needs to be created to reach desired state.

---

**Q2. [L2] Two developers ran `terraform apply` at the same time on the same workspace. What happened and how do you prevent it?**

**Answer:**
This is a race condition. The last write wins — whichever apply finishes last overwrites the state file. This can cause state corruption and out-of-sync infrastructure.

Prevention — **state locking**:
- Use an S3 backend with DynamoDB locking: Terraform writes a lock entry to DynamoDB before applying. If another apply is running, the lock is already taken and the second apply waits or fails.
- Terraform Cloud/HCE automatically handles locking.
- Never use local state files for team work — they can't be locked.

Best practice: Run Terraform only from CI/CD pipelines, never from developer laptops directly. The pipeline enforces sequential execution.

---

**Q3. [L2] Your Terraform state file got corrupted. What do you do?**

**Answer:**
1. **If using remote backend with versioning (S3 + versioning enabled)** — restore the previous version of the state file from S3.
2. **If using Terraform Cloud** — it keeps state history. Roll back to last known good state.
3. **Manual reconstruction** — worst case: use `terraform import` to re-import all existing resources into a fresh state file. Painful but possible.
4. **Prevention** — always use remote backend, enable S3 versioning, enable Terraform state locking.

Never manually edit the `.tfstate` file directly — it's JSON with checksums. If you must, use `terraform state` commands.

---

**Q4. [L3] You have a Terraform configuration that manages resources in 3 AWS accounts. How do you structure this?**

**Answer:**
Use multiple provider configurations with **aliases** or split into multiple **workspaces/modules**:

```hcl
provider "aws" {
  alias  = "account-a"
  assume_role {
    role_arn = "arn:aws:iam::111111111:role/terraform"
  }
}

provider "aws" {
  alias  = "account-b"
  assume_role {
    role_arn = "arn:aws:iam::222222222:role/terraform"
  }
}

resource "aws_s3_bucket" "a" {
  provider = aws.account-a
  bucket   = "my-bucket-a"
}
```

Better approach at scale: **separate Terraform root modules per account**. Each module has its own state file, backend config, and runs independently. Avoid cross-account state dependencies — they create tight coupling.

Use Terragrunt to DRY (Don't Repeat Yourself) across multiple root modules.

---

**Q5. [L2] `terraform plan` shows changes to a resource that you didn't touch. Why might this happen?**

**Answer:**
Several reasons:
1. **Provider upgrade** — a newer provider version may compute resource attributes differently.
2. **Drift** — someone changed the resource manually in the console. Plan detects the difference.
3. **Sensitive attribute** — some resources always show as changed due to how Terraform handles sensitive fields (passwords, keys).
4. **Computed values** — some attributes are computed by the cloud provider and Terraform can't know them until apply time. Shows as `(known after apply)`.
5. **Timestamp/random changes** — some providers generate new values on each plan.
6. **Deprecated attribute** — provider changed default for an attribute.

Check `terraform show` to see what the current state says vs what the config says.

---

## 🔵 Modules & Structure

---

**Q6. [L2] How do you structure a large Terraform codebase for a multi-environment setup?**

**Answer:**
Recommended structure:
```
infrastructure/
├── modules/              # reusable modules
│   ├── networking/
│   ├── eks/
│   └── rds/
├── environments/
│   ├── dev/
│   │   ├── main.tf       # calls modules with dev vars
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   └── production/
└── global/               # shared resources (IAM, Route53)
```

Each environment directory:
- Has its own `terraform.tfstate` (separate remote backend key per env).
- Calls the same modules with different variable values.
- Can be planned/applied independently.

**Terragrunt** simplifies this further by handling backend config, module sourcing, and dependency between environments.

---

**Q7. [L2] A module you're using from the Terraform Registry has a bug. You need to use a patched version. How do you do this?**

**Answer:**
1. **Fork the module** — fork the GitHub repo, apply your patch.
2. **Source from your fork**:
```hcl
module "vpc" {
  source = "github.com/my-org/terraform-aws-vpc//modules/vpc?ref=my-fix-branch"
}
```

Or:
3. **Local source temporarily** — while waiting for upstream fix:
```hcl
module "vpc" {
  source = "../local-copy/terraform-aws-vpc"
}
```

4. **File an issue/PR** upstream and pin to a specific version tag that doesn't have the bug.

Pin module versions always: `version = "3.14.0"` — never floating versions in production.

---

**Q8. [L3] How do you handle sensitive outputs (like DB passwords) in Terraform modules?**

**Answer:**
1. **Mark outputs as sensitive**:
```hcl
output "db_password" {
  value     = aws_db_instance.main.password
  sensitive = true
}
```
Terraform masks the value in plan/apply output.

2. **Don't output secrets if possible** — reference the resource directly, or retrieve the secret from Secrets Manager at runtime instead of passing through Terraform output.

3. **State contains secrets in plaintext** — if Terraform creates a password, it's in the state file. Use S3 SSE encryption for the state file. Use a remote backend with access controls.

4. **Better pattern** — let Terraform create the DB, then generate the password in AWS Secrets Manager (using `aws_secretsmanager_secret_version`). App retrieves it from Secrets Manager at runtime. Password never in Terraform outputs.

---

**Q9. [L2] What is `terraform taint` and when would you use it?**

**Answer:**
`terraform taint <resource>` marks a resource for destruction and recreation on the next `terraform apply`. Even if nothing in the config changed.

Use cases:
- A resource is in a broken/inconsistent state in the cloud but Terraform's state says it's fine.
- You want to force recreation of an EC2 instance to apply a new AMI (for resources that can't be updated in-place).

In Terraform 0.15.2+, `terraform taint` is replaced by `terraform apply -replace=<resource>` which is more explicit.

Note: tainting deletes and recreates. For stateful resources (databases, volumes), this means data loss. Be careful.

---

**Q10. [L3] Your Terraform plan wants to destroy and recreate a production RDS instance because you changed the instance identifier. How do you prevent the destroy?**

**Answer:**
Changing `identifier` for RDS forces replacement — Terraform deletes the old and creates a new one. That means downtime and potential data loss.

Prevent destruction:
1. **Lifecycle ignore_changes**:
```hcl
lifecycle {
  ignore_changes = [identifier]
}
```
This tells Terraform to ignore changes to the identifier field.

2. **lifecycle prevent_destroy**:
```hcl
lifecycle {
  prevent_destroy = true
}
```
Terraform will throw an error if anything tries to destroy this resource. Hard safety net.

3. **`terraform state mv`** — rename the resource in state without destroying:
```
terraform state mv aws_db_instance.old_name aws_db_instance.new_name
```
Update the config, then plan — Terraform sees the state and config match, no destroy needed.

---

## 🟢 Import & Migrations

---

**Q11. [L2] Infrastructure was created manually in the AWS console. Your team now wants to manage it with Terraform. How do you import it?**

**Answer:**
Use `terraform import`:

1. Write the Terraform resource configuration first (what the resource should look like in code).
2. Import the resource into state:
```bash
terraform import aws_instance.my_server i-1234567890abcdef0
```
3. Run `terraform plan` — it will show diffs between your config and the actual resource.
4. Fix the config to match reality until `plan` shows no changes.

For large-scale imports: **Terraformer** or **tf-import** can auto-generate Terraform code from existing AWS resources.

New in Terraform 1.5: `import` blocks in configuration files — declarative import as code.

---

**Q12. [L3] You need to move a Terraform resource from one module to another without destroying and recreating it. How?**

**Answer:**
Use `terraform state mv`:

```bash
# Move from root to a module
terraform state mv aws_s3_bucket.my_bucket module.storage.aws_s3_bucket.my_bucket

# Move between modules  
terraform state mv module.old.aws_s3_bucket.bucket module.new.aws_s3_bucket.bucket
```

Then update the configuration (move the resource block to the new module).

Run `terraform plan` — should show no changes if the state move was done correctly.

**Terraform 1.1+ `moved` blocks** — the modern approach, tracked as code:
```hcl
moved {
  from = aws_s3_bucket.old
  to   = module.storage.aws_s3_bucket.new
}
```
This is self-documenting and can be committed to Git.

---

## 🟡 Workspaces & CI/CD

---

**Q13. [L2] What is a Terraform workspace and what are its limitations?**

**Answer:**
Workspaces let you maintain multiple state files for the same configuration. `terraform workspace new staging` creates a `staging` workspace with its own state.

**Limitations:**
1. All workspaces use the same code — config differences between environments are hard (you'd use `terraform.workspace` variable conditionals, which gets messy).
2. Same backend — all workspace state files are in the same S3 bucket, just different keys.
3. No access control — you can't restrict who applies to production workspace vs dev workspace.
4. Better alternative for multiple environments: separate directories/modules, not workspaces.

**Use workspaces for:** small teams, temporary environments, exactly-same-config use cases.
**Don't use workspaces for:** production vs staging (different configs, different access controls).

---

**Q14. [L3] How do you run Terraform safely in a CI/CD pipeline? What are the guardrails?**

**Answer:**
**State handling:**
- Remote backend (S3 + DynamoDB locking) — never local state in CI.
- Each pipeline run acquires lock before apply, releases after.

**Plan before apply:**
- `terraform plan -out=plan.tfplan` in one stage.
- Human reviews the plan (or automated check for unexpected destroys).
- `terraform apply plan.tfplan` in a separate stage.

**Guardrails:**
1. Fail the pipeline if plan shows any `destroy` without explicit override.
2. Run `terraform fmt -check` to fail on unformatted code.
3. Run `terraform validate` to check syntax.
4. Run `tflint` for provider-specific lint rules.
5. Run `tfsec` or `checkov` for security misconfigurations.
6. Separate pipelines for different environments. Production requires manual approval.

**No developer applies directly:**
- All Terraform runs go through CI.
- Developers open PRs → plan runs → review → merge → apply runs.

---

**Q15. [L2] How do you handle provider version pinning in Terraform?**

**Answer:**
In `versions.tf`:
```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"  # allows 5.x, not 6.x
    }
  }
  required_version = ">= 1.5.0"
}
```

Then run `terraform init` and commit the `.terraform.lock.hcl` file. This file locks the exact provider version for all team members and CI.

Why pin: provider upgrades can introduce breaking changes. `~> 5.0` is a safe constraint — allows patch updates but not major changes.

Never use `>= 3.0` without an upper bound — you could suddenly get a breaking major version update.

---

## 🟠 Security & Best Practices

---

**Q16. [L2] How do you scan Terraform code for security misconfigurations before applying?**

**Answer:**
Several tools:
1. **tfsec** — open source. Checks for common security issues (S3 public access, unencrypted EBS, open security groups, missing logging).
2. **checkov** — open source. Broader coverage. Also supports CloudFormation, K8s, Helm.
3. **Snyk IaC** — commercial. Deep AWS/Azure/GCP policy coverage.
4. **OPA + Conftest** — write your own custom policies in Rego language.
5. **Terrascan** — NIST, SOC2, HIPAA, CIS benchmark checks.

Add to CI: run before `terraform apply`. Fail the pipeline on HIGH severity findings.

Example: `tfsec .` in CI stage. Fail if any HIGH/CRITICAL issues.

---

**Q17. [L3] Your Terraform module is creating resources but you want to ensure all resources have specific tags (owner, environment, cost-center). How do you enforce this?**

**Answer:**
**Option 1: Default tags (AWS provider)**
```hcl
provider "aws" {
  default_tags {
    tags = {
      Environment = var.environment
      Owner       = var.team
      ManagedBy   = "Terraform"
    }
  }
}
```
All resources created by this provider automatically get these tags.

**Option 2: Variable merge pattern**
```hcl
variable "common_tags" {
  type = map(string)
}

resource "aws_instance" "web" {
  tags = merge(var.common_tags, {
    Name = "web-server"
  })
}
```

**Option 3: Policy enforcement** — OPA/Conftest rule that fails if any resource is missing required tags.

---

**Q18. [L2] What is the `terraform_remote_state` data source and what are the risks of using it?**

**Answer:**
`terraform_remote_state` lets one Terraform module read outputs from another module's state file.

```hcl
data "terraform_remote_state" "vpc" {
  backend = "s3"
  config = {
    bucket = "my-tfstate"
    key    = "vpc/terraform.tfstate"
    region = "us-east-1"
  }
}

# Use VPC ID from another module
subnet_id = data.terraform_remote_state.vpc.outputs.private_subnet_id
```

**Risks:**
1. **Tight coupling** — if the VPC module's output changes, the consuming module breaks.
2. **State access permissions** — any module can read any state file it has S3 access to.
3. **State contains sensitive data** — reading another state file may expose passwords, keys.

**Alternative**: Use AWS SSM Parameter Store or Secrets Manager to share values between Terraform modules. Less coupling, better access control.

---

**Q19. [L3] You need to provision identical infrastructure across 10 AWS regions. How do you structure this in Terraform without duplicating code 10 times?**

**Answer:**
Use the `for_each` meta-argument with a module:

```hcl
variable "regions" {
  default = ["us-east-1", "us-west-2", "eu-west-1", ...]
}

module "regional_infra" {
  for_each = toset(var.regions)
  source   = "./modules/regional"
  
  providers = {
    aws = aws.by_region[each.key]
  }
  
  region = each.key
}
```

Define a provider per region using aliases:
```hcl
provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"
}
```

Or use **Terragrunt** with a `generate` block that creates provider config per region dynamically.

Separate state files per region (separate backend key per region) for independent management.

---

**Q20. [L2] What is `terraform validate` vs `terraform plan`?**

**Answer:**
- **`terraform validate`** — checks syntax and basic configuration correctness without connecting to any APIs. Fast. No credentials needed. Checks: valid HCL, valid attribute names, correct argument types.
- **`terraform plan`** — connects to the provider, reads current state, computes what changes would be made. Shows create/update/destroy. Slow (API calls). Needs credentials.

Use `validate` in pre-commit hooks (fast, no credentials). Use `plan` in CI after credentials are available. Both should run before any `apply`.

---

**Q21-Q60 — Rapid-fire Terraform Scenarios**

**Q21. [L1]** What is the purpose of `terraform init`? **Answer:** Downloads provider plugins, sets up the backend, downloads modules. Must run before any other command. Run again after changing providers or modules.

**Q22. [L2]** How do you upgrade a Terraform provider version? **Answer:** Update the version constraint in `required_providers`. Run `terraform init -upgrade`. Commit the updated `.terraform.lock.hcl`. Test with `terraform plan`.

**Q23. [L2]** What happens if you delete a resource from Terraform config without running destroy? **Answer:** Terraform will want to destroy it on the next apply. If you want to keep the resource but stop managing it with Terraform, use `terraform state rm <resource>` to remove it from state.

**Q24. [L2]** What is a `data` source in Terraform? **Answer:** Reads existing infrastructure. Doesn't create or manage. Example: `data "aws_ami" "amazon_linux"` finds the latest Amazon Linux AMI ID. Use to reference existing resources that Terraform didn't create.

**Q25. [L3]** How do you manage Terraform provider credentials without hardcoding them? **Answer:** Never put credentials in Terraform files. Use environment variables (`AWS_ACCESS_KEY_ID`), IAM instance profiles (on EC2/ECS), OIDC for CI/CD, or AWS profiles. The provider picks up credentials from the standard AWS credential chain.

**Q26. [L2]** What is the difference between `count` and `for_each`? **Answer:** `count` creates N identical resources, accessed by index. `for_each` creates one resource per map key/set element. `for_each` is preferred — removing an element from the middle of `count` destroys all resources with higher indexes.

**Q27. [L2]** How do you make Terraform wait for one resource before creating another? **Answer:** Use `depends_on`. Terraform infers dependencies from references automatically. Use explicit `depends_on` only when the dependency isn't captured by a reference (e.g., IAM policy propagation time).

**Q28. [L3]** What is Terragrunt and when would you use it over plain Terraform? **Answer:** Terragrunt adds DRY configuration for Terraform. Handles: auto-generating backend config per environment, module dependency ordering (`run-all apply`), input variable inheritance from parent dirs. Use for multi-account, multi-env setups with many root modules.

**Q29. [L2]** A `terraform apply` failed halfway. What's the state of your infrastructure? **Answer:** Partially applied. Resources created before the failure exist in the cloud AND in state. Resources that failed may exist in cloud but not in state (or vice versa). Re-run `terraform apply` — it will try to reconcile. Usually safe.

**Q30. [L2]** How do you test Terraform modules? **Answer:** Terratest (Go-based) — write tests that apply the module, verify outputs and real cloud resources, then destroy. Checkov/tfsec for static analysis. `terraform validate` for syntax. Kitchen-Terraform for Ruby-based testing.

**Q31. [L2]** What is the `.terraform.lock.hcl` file and should you commit it? **Answer:** Lock file records exact provider versions and checksums downloaded. Yes, commit it. This ensures all team members and CI use the same provider version. Don't commit the `.terraform/` directory itself.

**Q32. [L3]** How do you handle cross-region disaster recovery with Terraform? **Answer:** Separate Terraform workspaces/directories per region. Primary region deployed normally. DR region deployed from same modules with DR-specific variables (smaller instances, minimal resources). On DR activation, scale up DR region and redirect traffic.

**Q33. [L2]** What does `terraform output` do? **Answer:** Shows the output values defined in `outputs.tf` after an apply. Useful for scripting: `$(terraform output -raw vpc_id)`. Can be used to pass values between modules or to CI scripts.

**Q34. [L2]** You want to create an S3 bucket name based on the account ID to ensure uniqueness. How? **Answer:** Use `data "aws_caller_identity" "current" {}` → `bucket = "my-app-${data.aws_caller_identity.current.account_id}"`.

**Q35. [L3]** How do you handle Terraform state for resources that need to be shared across multiple teams? **Answer:** Use the `terraform_remote_state` data source (with risks noted above) or better: share resource identifiers via SSM Parameter Store. Team A creates VPC and stores VPC ID in `/shared/vpc/id`. Team B reads it from SSM. No state file dependency.

**Q36. [L2]** What is `terraform graph`? **Answer:** Outputs a DOT-format dependency graph of all resources. Visualize with Graphviz. Useful for debugging unexpected destroy ordering or understanding complex module dependencies.

**Q37. [L2]** You need to change a resource attribute that forces replacement but you want to minimize downtime. How? **Answer:** Use `create_before_destroy` lifecycle:
```hcl
lifecycle {
  create_before_destroy = true
}
```
Terraform creates the new resource first, then deletes the old one.

**Q38. [L3]** How do you implement infrastructure testing in a CI pipeline with real cloud resources without cost overrun? **Answer:** Use small/cheap instance types in tests. Destroy immediately after tests (Terratest handles this). Run tests only on PR, not on every commit. Use AWS Free Tier resources where possible. Set AWS Budget alerts.

**Q39. [L2]** What is `terraform fmt`? **Answer:** Formats Terraform files to the canonical style. Run `terraform fmt -check` in CI to fail if code isn't formatted. Run `terraform fmt -recursive` to auto-fix all files.

**Q40. [L2]** How do you reference the output of one module in another in the same root module? **Answer:** `module.vpc.vpc_id` — access module A's output from another resource in the same root. If in a separate root module, use `terraform_remote_state` or SSM.

**Q41. [L3]** How do you implement zero-downtime Terraform changes for an ALB? **Answer:** For listener rule changes: create new rule before deleting old. `create_before_destroy`. For target group changes: add new TG to ALB, shift traffic, remove old TG. Use weighted routing to gradually shift.

**Q42. [L2]** What does `terraform state list` do? **Answer:** Lists all resources in the current state file. Useful for finding the exact Terraform address of a resource before doing `state mv` or `state rm`.

**Q43. [L3]** How do you prevent accidental destruction of production resources in Terraform? **Answer:** Multiple layers: `lifecycle { prevent_destroy = true }` on critical resources. Pipeline policy that fails if plan contains destroys. AWS Config rules that alert on resource deletion. S3 MFA Delete for the state bucket itself.

**Q44. [L2]** What is the purpose of the `local` backend? **Answer:** Stores state in a local file (`terraform.tfstate`). Default if no backend configured. OK for learning but never for production: no locking, no shared access, no versioning.

**Q45. [L3]** How do you handle a situation where Terraform needs to create resources in a specific order (e.g., wait 30 seconds for IAM propagation)? **Answer:** Use `time_sleep` resource from the `hashicorp/time` provider:
```hcl
resource "time_sleep" "wait_30_seconds" {
  depends_on      = [aws_iam_role.example]
  create_duration = "30s"
}
```

**Q46. [L2]** What is the Terraform Registry? **Answer:** Public repository of Terraform modules and providers at registry.terraform.io. Maintained by community and HashiCorp. Use verified modules for common infrastructure patterns. Always review modules before using in production — read the source code.

**Q47. [L2]** How do you pass a list of values to a Terraform variable? **Answer:** In `terraform.tfvars`: `subnet_ids = ["subnet-abc", "subnet-def"]`. In CLI: `-var='subnet_ids=["subnet-abc","subnet-def"]'`. In the variable definition: `type = list(string)`.

**Q48. [L3]** What is the Open Policy Agent (OPA) integration with Terraform? **Answer:** OPA evaluates Terraform plan JSON against Rego policies. Example: deny any plan that creates a publicly accessible S3 bucket. Used in CI to enforce organizational policies before `apply`. Terraform Cloud has OPA policy sets built-in.

**Q49. [L2]** How do you manage multiple versions of Terraform itself in your team? **Answer:** Use `tfenv` (Terraform version manager, similar to `nvm` for Node). Commit a `.terraform-version` file in each project. `tfenv use` automatically switches to the correct version. CI pipeline uses `tfenv` too.

**Q50. [L2]** What is `terraform console`? **Answer:** Interactive REPL for evaluating Terraform expressions. Test functions: `> cidrsubnet("10.0.0.0/16", 8, 1)` → `10.0.1.0/24`. Debug complex expressions before committing. Read current state values.

**Q51. [L3]** How do you manage Terraform infrastructure across 50 AWS accounts in an AWS Organization? **Answer:** Use a CI/CD system per account (GitHub Actions with OIDC, separate role per account). Shared modules in a central registry. Terragrunt or Terraform Cloud for orchestration. Account vending machine (Control Tower) creates new accounts pre-wired for Terraform.

**Q52. [L2]** A Terraform resource shows as `(known after apply)` for an attribute. What does this mean? **Answer:** Terraform can't compute the value before applying because it depends on the cloud API's response (e.g., an auto-generated ID, assigned IP address). It will be known after the resource is created.

**Q53. [L3]** How do you refactor a large Terraform codebase into modules without state disruption? **Answer:** Use `terraform state mv` to move resources into module paths. Use `moved` blocks (Terraform 1.1+) as code-tracked refactoring. Test each move with `terraform plan` — should show no infrastructure changes.

**Q54. [L2]** What is the `replace_triggered_by` lifecycle argument? **Answer:** Forces resource replacement when another resource changes. Example: replace EC2 instance whenever the launch template changes:
```hcl
lifecycle {
  replace_triggered_by = [aws_launch_template.app]
}
```

**Q55. [L3]** How do you implement a drift detection system for your Terraform-managed infrastructure? **Answer:** Run `terraform plan` on a schedule in CI. If plan shows unexpected changes (someone edited the console), alert via Slack/PagerDuty. Set up a dedicated "drift detection" pipeline separate from the apply pipeline. Never auto-apply drift corrections — investigate first.

**Q56. [L2]** What is `terraform providers lock`? **Answer:** Generates or updates the `.terraform.lock.hcl` file for specific platforms. Useful for CI if the lock was created on Mac but CI runs on Linux: `terraform providers lock -platform=linux_amd64 -platform=darwin_amd64`.

**Q57. [L2]** How do you handle conditionally creating a resource in Terraform? **Answer:** Use `count`:
```hcl
resource "aws_cloudwatch_log_group" "app" {
  count = var.enable_logging ? 1 : 0
  name  = "/app/logs"
}
```
Or `for_each` with an empty map to skip: `for_each = var.enable ? {"log" = true} : {}`.

**Q58. [L3]** What is Pulumi and how does it compare to Terraform? **Answer:** Pulumi uses general-purpose languages (Python, TypeScript, Go) for IaC instead of HCL. Benefits: native language loops, conditionals, testing frameworks. Same provider ecosystem as Terraform. Downsides: more complexity, HCL is simpler for infra-only work. Choose Pulumi if developers prefer coding in their existing languages. Choose Terraform for IaC-focused teams.

**Q59. [L2]** How do you use Terraform to create IAM policies without hardcoding JSON? **Answer:** Use the `aws_iam_policy_document` data source:
```hcl
data "aws_iam_policy_document" "s3_read" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.data.arn}/*"]
  }
}
```
Clean HCL instead of embedded JSON strings. Properly interpolates ARNs.

**Q60. [L2]** What is `terraform apply -auto-approve` and when should you use it? **Answer:** Skips the interactive confirmation prompt. Use only in CI pipelines after a human has reviewed the plan. Never run with `-auto-approve` from a developer terminal without reviewing the plan first. Mistakes are permanent in production.

**Q61. [L2]** Your team renamed a variable in a shared module and now all consuming environments fail during `terraform plan`. How do you roll out that change safely? **Answer:** Treat module input changes as an interface change. First add the new variable while still supporting the old one, and map both to the same internal value temporarily. Update consumers environment by environment, run `plan` in each one, and only remove the old variable after every caller has migrated. For widely used modules, version the module and release the breaking change in a new major version.

**Q62. [L3]** You changed a resource from `count` to `for_each` and Terraform now wants to recreate everything. How do you avoid that? **Answer:** The resource addresses changed, so Terraform thinks the old objects disappeared and new ones must be created. Preserve state by moving addresses with `terraform state mv`, or use `moved` blocks if the mapping is straightforward. Do the refactor in a controlled sequence: update code, move state entries one by one, then run `terraform plan` until it shows no infrastructure replacement.

**Q63. [L2]** A developer accidentally committed `terraform.tfvars` with production values, including secrets. What should you do? **Answer:** Remove the sensitive file from Git tracking, rotate every exposed secret, and replace the workflow with a safer input method such as CI variables, Vault, AWS Secrets Manager, or environment variables. Add `.gitignore` rules so local tfvars files are not committed, and review whether the state file also contains those secrets because state storage needs the same level of protection.

**Q64. [L3]** You need one Terraform pipeline to deploy only the modules that changed in a monorepo. How would you design that? **Answer:** Split the repo into independent root modules, each with its own backend key and pipeline target. In CI, detect changed paths, map them to affected root modules, and run `terraform plan` only for those modules. Keep shared modules versioned or at least include dependency rules so that a shared module change triggers plans for all consumers. This scales much better than one giant root module with a single state file.

**Q65. [L2]** Your S3 backend bucket for Terraform state was deleted by mistake but the infrastructure still exists. What is your recovery path? **Answer:** First recreate the backend bucket and locking table if needed. Restore the latest valid state from S3 versioning or backup; if no backup exists, create a fresh backend and rebuild state by importing resources with `terraform import`. After recovery, enable versioning, restrict delete permissions, and document the backend as critical infrastructure so it is protected like production data.

**Q66. [L2]** You want to pass common values like region, environment, and tags into many modules without duplicating locals everywhere. How do you do that cleanly? **Answer:** Define shared locals or variables in the root module and pass them explicitly into child modules. A common pattern is a `common_tags` map plus environment and region variables that every module accepts. Keep the contract small and consistent. Avoid magic globals because Terraform modules should stay explicit about their inputs.

**Q67. [L3]** A resource was renamed in configuration, but there was no real infrastructure change. How do you make Terraform understand it is the same object? **Answer:** Use a `moved` block in Terraform 1.1+:
```hcl
moved {
  from = aws_security_group.old_name
  to   = aws_security_group.new_name
}
```
This records the rename in code and prevents destroy/create behavior. Older workflows can use `terraform state mv`, but `moved` blocks are better because the refactor is documented and repeatable in CI.

**Q68. [L2]** Your plan fails because a data source cannot find a resource that is created in the same apply. Why does this happen? **Answer:** Data sources read existing infrastructure during planning, before new resources are created. If the object does not already exist, the lookup fails. Use direct references to the managed resource instead of a data source when both live in the same configuration, or split the workflow into stages if the dependency truly must be read after creation.

**Q69. [L3]** How do you keep Terraform plans deterministic when teams use different laptops and plugin caches? **Answer:** Pin Terraform and provider versions, commit `.terraform.lock.hcl`, and run plans in a standard CI environment for the final source of truth. Local plans are fine for feedback, but merge decisions should rely on CI-generated plans. If plugin download speed matters, use a shared provider mirror or plugin cache, but version locking is what actually protects determinism.

**Q70. [L2]** You need to expose only a few outputs from a module even though the module creates many resources. What is the right approach? **Answer:** Export only the values consumers truly need, such as IDs, ARNs, or endpoints. Keep module outputs small and stable because outputs become part of the module interface. If you expose everything, consumers couple themselves to internals and future refactoring becomes painful. Good modules hide implementation details.

**Q71. [L3]** A `terraform destroy` in a non-prod environment is taking too long because some resources have deletion protection or dependent objects. How do you debug it? **Answer:** Start with the plan and identify the resource where deletion blocks. Common causes are S3 buckets that still contain objects, security groups attached to ENIs, load balancer target groups still in use, or managed databases with deletion protection enabled. Fix the blocking dependency first, then rerun destroy. For recurring issues, encode cleanup behavior in Terraform so teardown is predictable.

**Q72. [L2]** How do you manage environment-specific values like CIDR ranges and instance sizes without copying entire Terraform files per environment? **Answer:** Reuse the same root-module structure or shared child modules, and keep only the variable values different per environment through `tfvars`, CI variables, or Terragrunt inputs. The code should stay mostly identical while the environment data changes. If the files diverge heavily, you lose the main benefit of infrastructure as code.

**Q73. [L3]** You need to review a Terraform change that includes hundreds of resources because someone modified a shared module. What should you do before approving? **Answer:** Do not approve from the summary alone. Check whether the changes are expected from the module diff, look specifically for replacements or destroys, and verify that unchanged environments are not being affected accidentally. For high-blast-radius modules, test the module in an isolated environment first and prefer rolling the change out in smaller batches rather than all environments at once.

**Q74. [L2]** An engineer ran `terraform apply` with the wrong AWS profile and created resources in the wrong account. How do you reduce the chance of this happening again? **Answer:** Make the account context explicit in CI and local workflows. Use `assume_role` with fixed account IDs, print the current caller identity in pipeline logs, and prefer OIDC or dedicated roles over manually exported credentials. Some teams also add validation checks that compare the expected account ID against `data.aws_caller_identity.current.account_id` and fail if they do not match.

**Q75. [L3]** How do you use Terraform in a regulated environment where every infrastructure change needs an auditable approval trail? **Answer:** Run Terraform through CI/CD only, store plans as build artifacts, require pull request review plus manual approval before `apply`, and keep remote state with version history. Terraform Cloud, GitHub Actions, or similar systems can provide plan/apply logs tied to user identities. The key point is that the approved plan and the applied plan must match, so avoid re-planning between approval and apply.

**Q76. [L2]** Your module uses a `random_password` resource, and each environment gets a different value. What should you watch out for? **Answer:** The generated password is stored in Terraform state, so state protection matters as much as secret protection. Also be careful with resource replacement triggers: if the `random_password` resource is recreated unexpectedly, downstream credentials may rotate and break applications. Usually you store the generated secret in a secrets manager and make rotation an explicit action, not an accidental side effect of refactoring.

**Q77. [L3]** You want to enforce that no one can create public S3 buckets even if they bypass Terraform and use the console. Is Terraform alone enough? **Answer:** No. Terraform can express the desired configuration and detect drift, but it cannot stop out-of-band changes by itself. Pair Terraform with preventive controls such as AWS Organizations SCPs, IAM policies, and security guardrails. Terraform handles provisioning; platform policy enforces what is allowed.

**Q78. [L2]** A module output used by several other modules is changing format from a string to an object. How do you migrate safely? **Answer:** Introduce the new output alongside the old one first, keep both during a transition period, and update consumers incrementally. Once all consumers use the new output, remove the old one in a versioned breaking release. Output changes are API changes for Terraform modules, so they need the same care as application interface changes.

**Q79. [L3]** Your organization wants every Terraform change to be traceable back to a ticket or change request. How can you enforce that in practice? **Answer:** Enforce it in the delivery workflow, not just by convention. Require pull requests to reference a ticket, include the ticket ID in commit or PR templates, and gate production applies behind approved PRs in CI. If you use Terraform Cloud or another orchestration tool, integrate it with VCS and change-management systems so the audit trail ties together code review, plan, approval, and apply.

**Q80. [L2]** When should you split one Terraform project into multiple state files? **Answer:** Split when parts of the infrastructure have different lifecycles, owners, blast radius, or deployment frequency. Examples: shared networking, application stacks, and data services usually should not live in one giant state file. Smaller state files reduce lock contention and make failures easier to isolate. The tradeoff is more coordination between stacks, so split on real boundaries rather than arbitrarily.

---

*More Terraform scenarios added periodically. PRs welcome.*
