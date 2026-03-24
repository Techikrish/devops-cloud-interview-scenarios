# 🌐 Networking — Scenario-Based Interview Questions

**Q1. [L1] A web application in a private subnet needs to download updates from the internet, but it keeps timing out. Why?**

> *What the interviewer is testing:* Public/Private subnet definitions, NAT Gateways, routing.

**Answer:**
By definition, a private subnet does not have a route to the Internet Gateway (IGW) and the instances within it do not have public IPs.
To allow outbound internet access (like downloading updates) while keeping the application secure from inbound connections, you must deploy a NAT Gateway (or NAT instance) in a *public* subnet.
Then, you must update the private subnet's Route Table to point all default traffic (`0.0.0.0/0`) to the NAT Gateway. The NAT Gateway will translate the private IPs to its own public IP, fetch the update, and return the data to the instance.

---

**Q2. [L2] Two EC2 instances in the exact same VPC and subnet cannot ping each other, but they can both reach the internet. What is the most likely cause?**

> *What the interviewer is testing:* Security Groups vs Network ACLs, default behaviors.

**Answer:**
If they can reach the internet, the routing table and internet gateways are correct. The issue is security at the instance or subnet level.
The most likely culprit is the **Security Group**. By default, AWS Security Groups permit all outbound traffic but deny all inbound traffic. If they are in the same security group, they still cannot ping each other unless there is an explicit inbound rule allowing ICMP traffic from the self-referencing security group ID (or the subnet's CIDR).
Other possibilities:
- Local OS firewall (`iptables` or `firewalld`) blocking ICMP.
- Network ACLs (NACLs) are usually stateless and evaluated before SGs, but if they were blocking local traffic, they'd likely block the internet return traffic too, unless misconfigured with exact IP denies.

---

**Q3. [L2] You type `facebook.com` in your browser. Explain the DNS resolution process step-by-step.**

> *What the interviewer is testing:* Foundational DNS knowledge, caching, root/TLD servers.

**Answer:**
1. **Browser Cache:** The browser checks its own DNS cache.
2. **OS Cache:** The OS checks its DNS cache (and the `hosts` file).
3. **Recursive Resolver:** The OS queries the configured DNS server (usually provided by the ISP or Google/Cloudflare like `8.8.8.8`). This resolver checks its massive cache.
4. **Root Server:** If the resolver misses, it asks the global Root Server (`.`), which points it to the appropriate Top-Level Domain (TLD) server for `.com`.
5. **TLD Server:** The resolver asks the `.com` TLD, which returns the IP address of the Authoritative Nameserver for `facebook.com` (e.g., Route53 or Cloudflare).
6. **Authoritative Server:** The resolver queries the authoritative server, retrieves the A record (IP address), returns it to the OS, caches it, and the browser makes the HTTP request to that IP.

---

**Q4. [L3] Your company has two VPCs in different AWS regions. You set up VPC Peering between them. From VPC A (10.0.0.0/16), you can reach a server in VPC B (10.1.0.0/16). However, the server in VPC A cannot access the internet *through* VPC B's NAT Gateway. Why?**

> *What the interviewer is testing:* VPC Peering limitations, transitive routing.

**Answer:**
AWS VPC Peering does not support **Transitive Edge Routing**.
This means traffic from VPC A cannot traverse VPC B to hit an edge device configured in VPC B (like an Internet Gateway, NAT Gateway, Direct Connect, or VPN). VPC Peering only allows communication strictly terminating at the instances within the peered VPCs.
To solve this, you would need to either:
1. Provide VPC A with its own NAT Gateway and Internet Route.
2. Use AWS Transit Gateway, which supports advanced routing topologies including routing edge internet traffic through a centralized egress VPC. 
3. Setup proxy software (e.g. Squid) on an instance in VPC B, and have VPC A explicitly use that proxy.

---

**Q5. [L2] What is the difference between an Application Load Balancer (ALB) and a Network Load Balancer (NLB)? When do you use which?**

> *What the interviewer is testing:* OSI model, Layer 7 vs Layer 4, TLS termination.

**Answer:**
- **ALB (Layer 7):** Operates at the Application layer. It understands HTTP/HTTPS headers, URLs, and cookies. You use it when you need path-based routing (e.g., `/api` to one target group, `/images` to another), WebSocket support, or advanced WAF integrations. It terminates the connection and creates a new one to the backend.
- **NLB (Layer 4):** Operates at the Transport layer. It only understands IP addresses and TCP/UDP ports. It is incredibly fast, handles millions of requests per second with ultra-low latency, and provides a **static IP address**. You use it for non-HTTP traffic (like databases, SSH, or custom TCP protocols) or when you require end-to-end TLS where the backend terminates the certificate.

---

**Q6. [L1] A customer complains of intermittent 502 Bad Gateway errors from an AWS Application Load Balancer. The backend instances show low CPU. What should you look for?**

> *What the interviewer is testing:* Load balancer timeout configurations, application keep-alive.

**Answer:**
A 502 Bad Gateway from an ALB means the ALB tried to communicate with the target instance, but the connection dropped or the target returned an invalid response.
The most common cause, aside from the app actually crashing, is a mismatch in **Keep-Alive timeouts**.
If the backend web server (like Nginx or Node.js) has an idle timeout configured shorter than the ALB's idle timeout (default 60 seconds), the backend might close the TCP connection just as the ALB decides to send a new request down that established pipe. The ALB gets a connection reset and throws a 502.
The fix is to ensure the backend application's idle timeout is greater than the ALB's idle timeout.

---

**Q7. [L3] Your database is in a private subnet with a Network ACL (NACL) that explicitly allows port 3306 inbound from the application subnet (10.0.1.0/24). However, the DB connections are timing out. The Security Group allows 3306. What is wrong?**

> *What the interviewer is testing:* Ephemeral ports, stateful vs. stateless firewalls.

**Answer:**
The problem is that Network ACLs are **stateless**. 
Security Groups are stateful (if you allow an inbound request, the outbound response is automatically allowed). Because NACLs are stateless, returning traffic is blocked unless explicitly permitted.
When the application server hits the DB on port 3306, the database must reply to the application server's random **Ephemeral Port** (usually ranging from 1024-65535, typical Linux is 32768-60999).
You must add an outbound rule on the database subnet's NACL to allow TCP traffic across the ephemeral port range back to the application subnet `10.0.1.0/24`.

---

**Q8. [L2] Users resolve `api.myapp.com`. Half of them connect successfully to the new server, and half keep hitting the old deprecated server even though you changed the Route53 DNS record an hour ago. Why?**

> *What the interviewer is testing:* DNS propagation, TTL (Time To Live).

**Answer:**
This is classic DNS caching behavior related to **TTL (Time To Live)**. 
When the original DNS record was created, it had a TTL (e.g., 24 hours). When Local ISPs, recursive resolvers (like 8.8.8.8), and user browsers resolve the domain, they cache the IP address for that duration.
Even though you updated the authoritative server in Route53, the downstream internet caches will not query Route53 again until their local TTL expires.
To prevent this in the future, you must lower the TTL on the old record to something short (e.g., 60 seconds) at least 24 hours *before* the migration, do the migration, and then raise the TTL back up on the new IP.

---

**Q9. [L3] A DDoS attack is targeting your application, overwhelming it with fake SYN packets (SYN Flood). How do you mitigate this at the infrastructure and OS levels?**

> *What the interviewer is testing:* TCP handshake, SYN cookies, Edge protection.

**Answer:**
A SYN flood exhausts the server's TCP connections by sending SYN packets but never responding to the SYN-ACK, leaving half-open connections in the kernel's queue until it drops legitimate traffic.

1. **Infrastructure Level:** I would move the application behind a Layer 4/7 edge protection network like AWS Shield/WAF, Cloudflare, or an AWS ALB. These services independently handle the TCP handshake and only pass fully established HTTP connections to the backend, completely absorbing the SYN flood.
2. **OS Level:** If it's a bare-metal server, I would enable **SYN Cookies** via `sysctl -w net.ipv4.tcp_syncookies=1`. This tells the Linux kernel to stop allocating memory for half-open connections and instead encode the connection state cryptographically into the SYN-ACK sequence number, verifying it only if the final ACK arrives.

---

**Q10. [L1] Explain the difference between SNAT and DNAT.**

> *What the interviewer is testing:* IP tables, Network Address Translation concepts.

**Answer:**
Network Address Translation alters IP headers as packets transit a router/firewall.
- **SNAT (Source NAT):** Translates the *Source* IP address. Used when internal private IPs need to reach the internet. The router (like an AWS NAT Gateway) changes the private source IP to its own public IP so the return traffic knows where to go back. (Usually happens Post-Routing).
- **DNAT (Destination NAT):** Translates the *Destination* IP address. Used for port forwarding. If an external user hits your router's public IP on port 80, the router changes the destination IP to an internal private server's IP. (Usually happens Pre-Routing).

---

**Q11. [L3] We have a BGP VPN connection established over IPSec from our data center to AWS. The tunnel is "UP", but large file transfers keep freezing or failing halfway through, while small pings and SSH commands work fine. What is happening?**

> *What the interviewer is testing:* MTU (Maximum Transmission Unit), MSS, Path MTU Discovery, IPsec header overhead.

**Answer:**
This is absolutely an **MTU (Maximum Transmission Unit)** mismatch issue.
Standard ethernet MTU is 1500 bytes. However, IPsec VPN tunnels add encryption headers (ESP, tunnel mode) which consume ~50-80 bytes. If an application tries to send a full 1500-byte packet with the "Don't Fragment" (DF) bit set, the VPN router drops it because it exceeds the tunnel's inner MTU, and sends an ICMP "Fragmentation Needed" message back.
However, if firewalls along the path are blocking these ICMP messages (breaking Path MTU Discovery), the application never slows down its packet size. Known as a "PMTUD Blackhole".
To fix:
1. Enable `TCP MSS Clamping` on the VPN router (modifying the TCP handshake to force a lower MSS, e.g., 1350).
2. Allow ICMP type 3 code 4 (Fragmentation Needed) on all firewalls.
3. Lower the MTU manually on the host interfaces.

---

**Q12. [L2] Your company acquired another startup. You need to peer their AWS VPC with yours. You try to set it up, but AWS rejects the peering connection due to "CIDR Overlap". How do you solve this so the networks can communicate?**

> *What the interviewer is testing:* IP addressing conflicts, VPNs, PrivateLink.

**Answer:**
VPC Peering strictly prohibits routing between overlapping CIDR blocks (e.g., both VPCs use `10.0.0.0/16`) because the routing tables would have no way to distinguish local vs remote traffic.
To solve this:
1. **AWS PrivateLink:** If you only need to expose specific services (e.g., API or DB), you can put an NLB in front of the startup's service and expose it via PrivateLink to an Endpoint in your VPC. This maps their service to an IP in *your* subnet, completely bypassing the CIDR conflict.
2. **Transit Gateway with NAT:** Use AWS Transit Gateway with an intermediary VPC running a NAT or proxy instance to translate the overlapping IPs.
3. **Re-IP:** The most painful but permanent solution is migrating one of the VPCs to a new, non-overlapping CIDR block.

---

**Q13. [L1] A user complains they cannot connect to an internal web app on `https://10.0.1.55`. You SSH into the box and run `netstat -tulpn`. You see the service listening on `127.0.0.1:443`. Why is the user failing to connect?**

> *What the interviewer is testing:* Loopback binding vs. wildcard binding.

**Answer:**
The service is bound exclusively to the **loopback interface** (`127.0.0.1` or `localhost`). 
This means it will only accept network connections originating from within the machine itself. It will ignore and drop any traffic coming in on the Ethernet/Network interface (like `10.0.1.55`).
To fix this, the application's configuration (e.g., Nginx, Node.js) must be changed to bind to `0.0.0.0:443` (all IPv4 interfaces) or specifically to `10.0.1.55:443`, and then restarted.

---

**Q14. [L2] What is Anycast DNS, and why do CDNs and large DNS providers (like Route53 or Cloudflare 1.1.1.1) use it?**

> *What the interviewer is testing:* BGP Anycast vs Unicast, global routing optimization.

**Answer:**
In standard Unicast networking, one IP address points to exactly one server in the world. 
**Anycast** is a BGP networking technique where the *exact same IP address* is advertised by multiple servers across different geographic data centers globally.
When a user in London queries `1.1.1.1`, the internet's BGP routing tables route their packets to the closest (shortest path) Cloudflare data center in London. When a user in Tokyo queries the exact same `1.1.1.1`, they are routed to Tokyo.
This drastically reduces latency, improves high availability (if the London node dies, BGP withdraws the route and Tokyo takes over), and inherently mitigates DDoS attacks by distributing the traffic load globally.

---

**Q15. [L3] You use an AWS Global Accelerator for your application. The backend is an ALB in us-east-1. How does Global Accelerator make the connection faster for a user in Australia compared to pointing their DNS directly to the ALB?**

> *What the interviewer is testing:* AWS network backbone, BGP Anycast, TCP termination at the edge.

**Answer:**
If the Australian user connects directly to the ALB, their TCP handshake and HTTP data traverse the public internet across multiple ISP hops, undersea cables, and peering points—which is slow, jittery, and packet-loss prone.
With **Global Accelerator**:
1. It uses Anycast IPs, so the Australian user's traffic is immediately routed to the closest AWS Edge Location in Sydney.
2. **TCP Termination at the Edge:** The TCP handshake completes instantly with the Sydney edge node, saving hundreds of milliseconds.
3. **AWS Backbone:** The data then travels from Sydney to us-east-1 strictly over AWS's dedicated, highly optimized, private fiber backbone, bypassing public internet congestion entirely.

---

**Q16. [L1] Your API server gets heavily trafficked and suddenly stops accepting new connections, citing "Too many open files". Why is a networking problem manifesting as a file problem?**

> *What the interviewer is testing:* "Everything is a file" philosophy in Linux, ulimits, sockets.

**Answer:**
In Unix/Linux operating systems, everything is a file—including network sockets. 
Every incoming or outgoing TCP connection requires a file descriptor. If the API is highly trafficked or if connections are hanging in `TIME_WAIT`, it exhausts the default file descriptor limit (often 1024 or 4096).
To resolve it, we must increase the hard and soft ulimits for the user running the application (`ulimit -n 65535` or edit `/etc/security/limits.conf`) and ensure the application pools/closes connections properly.

---

**Q17. [L2] How do you secure data in transit between two microservices inside an AWS VPC? Is traffic inside a VPC inherently encrypted?**

> *What the interviewer is testing:* Zero Trust, internal TLS (mTLS), VPC security posture.

**Answer:**
No, traffic inside an AWS VPC is **not** inherently encrypted by default (unless crossing AZs on specific modern instance types like Nitro where AWS does line-rate encryption). If an attacker breaches the network layer, they can sniff the plaintext TCP/HTTP traffic.

To secure data according to the Zero Trust model:
1. **mTLS (Mutual TLS):** Use a Service Mesh (like Istio or Linkerd) to automatically encrypt traffic between microservices and verify identities using internal certificates.
2. **Application TLS:** Configure internal microservices to serve HTTPS directly, utilizing internal Private Certificate Authorities (AWS PCA) to issue trusted certs.

---

**Q18. [L3] You need to block traffic from a specific malicious IP `203.0.113.50` hitting your web servers. Which is better and consumes less CPU: blocking it at the Application (Nginx config), OS Firewall (iptables), Security Group, or Network ACL?**

> *What the interviewer is testing:* Layers of defense, infrastructure offloading, network device hierarchy.

**Answer:**
The best place to block it is the outermost perimeter, the **Network ACL (NACL)** or **AWS WAF**.
If you block it at the NACL: AWS network hardware drops the packet before it even enters your subnet. It consumes *zero* CPU on your EC2 instance.
If you use Security Groups: Still excellent, handled by the AWS Nitro hypervisor below the guest OS. Zero CPU on the instance.
If you use `iptables`: Better than the app, drops in the kernel network stack, but still interrupts the CPU.
If you use Nginx: Worst option. The kernel accepts the connection, completes the TCP handshake, passes it to user space, and Nginx uses CPU/RAM to evaluate and drop it. This can be easily overwhelmed in a DDoS.

---

**Q19. [L2] You see many connections in the `TIME_WAIT` state on your busy proxy server. Is this an error? What causes it?**

> *What the interviewer is testing:* TCP state machine, socket termination, socket reuse.

**Answer:**
`TIME_WAIT` is **not an error**; it is a normal part of the TCP teardown process.
When the server closes a connection (by sending the first FIN packet), it enters the `TIME_WAIT` state for a period (usually 2 * MSL, around 60 seconds). This ensures that any delayed packets floating in the network are dropped and don't accidentally corrupt a new connection that happens to reuse the exact same source IP and port.
However, on a very busy proxy, too many `TIME_WAIT` sockets can exhaust ephemeral ports, preventing new outbound connections. It can be mitigated by keeping connections alive longer (connection pooling), or tuning `sysctl` (`tcp_tw_reuse=1` to safely reuse them for outbound connections).

---

**Q20. [L1] If an IP address is `192.168.1.10/24`, what does the `/24` mean? How many usable IP addresses are in this subnet?**

> *What the interviewer is testing:* Basic CIDR notation math.

**Answer:**
The `/24` is CIDR (Classless Inter-Domain Routing) notation. It means the first 24 bits (3 octets) of the 32-bit IPv4 address are locked as the network prefix (`192.168.1.x`).
This leaves 8 bits for host addresses ($2^8 = 256$ total addresses).
In a standard terrestrial network, you lose 2 addresses (Network Address `.0` and Broadcast Address `.255`), leaving **254** usable IPs.
*(Note: In an AWS VPC subnet, AWS reserves 5 addresses, leaving 251 usable IPs).*
