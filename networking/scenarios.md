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

---

**Q21. [L1] When architecting a new service, how do you decide between using TCP or UDP?**

> *What the interviewer is testing:* Transport layer protocols, reliability vs. speed trade-offs.

**Answer:**
- **TCP (Transmission Control Protocol):** Is a connection-oriented, stateful protocol. It guarantees delivery through acknowledgments, automatically retransmits lost packets, and orders packets correctly. I would use TCP for HTTP/HTTPS, database queries, SSH, and any system where data integrity is paramount and dropping a single byte corrupts the entire file.
- **UDP (User Datagram Protocol):** Is a connectionless, stateless protocol. It "fires and forgets" packets with no delivery guarantees, no acknowledgments, and no retransmission. It is vastly faster with less overhead. I would use UDP for video streaming, VoIP calls, online multiplayer gaming, or fast metrics (like StatsD), where missing a single frame of video is acceptable, but waiting 500ms for a retransmission would ruin the real-time experience.

---

**Q22. [L2] Two physical data centers are connected via two distinct ISPs. Traffic goes out via ISP 1, but the return packets from the internet come back via ISP 2. The corporate firewall immediately drops the return packets. Why?**

> *What the interviewer is testing:* Asymmetric Routing, stateful firewalls.

**Answer:**
This is called **Asymmetric Routing**.
The corporate firewall on ISP 2 is a **stateful firewall**. Stateful firewalls maintain an internal table of all outbound connections (the TCP handshake, sequence numbers, etc.). Because the initial outbound `SYN` packet left entirely through ISP 1's firewall, ISP 2’s firewall never saw the connection originate.
When the `SYN-ACK` or data packets arrive on ISP 2, the firewall checks its state table, finds no existing outbound connection matching those IPs/ports, assumes the packet is a blind intrusion attempt, and rightfully drops it. 
*Fix:* Ensure BGP routing enforces symmetry, or dynamically share state tables between the two firewalls (HA clustering).

---

**Q23. [L3] Your company hosts 100 different HTTPS websites (e.g., `clientA.com`, `clientB.com`) entirely behind a single Application Load Balancer with one single IP address. How does the ALB know which SSL/TLS certificate to present to the user during the highly cryptographic TCP handshake, before any HTTP headers are sent?**

> *What the interviewer is testing:* Server Name Indication (SNI), TLS handshake internals.

**Answer:**
In the early days of the internet, this was impossible—each HTTPS domain required its own dedicated IP address because the server didn't know which website the client wanted until *after* the TLS encryption was established, but it needed to provide the right certificate *to* establish it.
This is solved by **SNI (Server Name Indication)**.
SNI is an extension to the TLS protocol. During the very first step of the TLS handshake (the `ClientHello` packet), the user's browser transmits the requested hostname (`clientA.com`) in **plaintext** before encryption begins. The ALB reads this plaintext SNI extension, instantly searches its certificate store, selects the correct certificate for `clientA.com`, and completes the secure handshake.

---

**Q24. [L1] How does the `traceroute` command actually discover the routers between your computer and a destination server?**

> *What the interviewer is testing:* ICMP, TTL (Time To Live) expiration.

**Answer:**
`traceroute` cleverly exploits the IP **TTL (Time To Live)** field.
The TTL is meant to prevent packets from looping infinitely; every router decrements the TTL by 1. If TTL hits 0, the router drops the packet and sends an `ICMP Time Exceeded` message back to the sender.
1. `traceroute` sends a packet tailored for the destination with a TTL of **1**. The very first router decrements it to 0, drops it, and replies. `traceroute` records Router 1's IP.
2. It sends another packet with a TTL of **2**. Router 1 passes it, Router 2 drops it and replies. It records Router 2's IP.
3. It increments the TTL by 1 sequentially until the packet finally reaches the destination server, mapping every hop along the way.

---

**Q25. [L2] A malicious insider plugs a laptop into your office network switch. Suddenly, all traffic intended for the corporate router routes through the laptop first, allowing the insider to sniff passwords. How did they achieve this on a local network?**

> *What the interviewer is testing:* ARP Spoofing / ARP Poisoning, Layer 2 networking.

**Answer:**
This is an **ARP Spoofing (ARP Poisoning)** attack.
Inside a local network (Layer 2), computers communicate via MAC addresses. To find the router's MAC address, computers broadcast an "ARP Request" asking "Who has IP 192.168.1.1?".
The attacker's laptop maliciously spams the network with fake "ARP Reply" packets, falsely claiming "I am 192.168.1.1, and my MAC address is [Attacker's MAC]". 
Because ARP is a stateless, trusting protocol, all victims update their local ARP caches with the attacker's MAC. All traffic intended for the internet is now sent to the attacker at Layer 2, who sniffs it and silently forwards it to the true router.

---

**Q26. [L3] Your company policy mandates that all outbound internet traffic from 50 different AWS VPCs must be centrally inspected by a fleet of Next-Gen Firewalls (Palo Alto) before leaving AWS. Architecturally, how do you funnel all VPC outbound traffic to this inspection tier securely and without NAT overlapping?**

> *What the interviewer is testing:* AWS Transit Gateway, Egress VPCs, route tables.

**Answer:**
This requires a **Hub-and-Spoke Egress Architecture** utilizing **AWS Transit Gateway (TGW)**.
1. Deploy a central "Security VPC" (the Hub). Deploy the Firewall appliances and a NAT Gateway here.
2. Attach all 50 application VPCs (the Spokes) to the TGW.
3. In every Spoke VPC, configure the default route `0.0.0.0/0` to point to the TGW attachment.
4. On the TGW Route Table, configure the default route `0.0.0.0/0` to forward all traffic to the Security VPC attachment.
5. In the Security VPC, traffic is forced through the Firewall fleet for Deep Packet Inspection. If clean, it passes to the NAT Gateway and out strictly through the Security VPC's single Internet Gateway.

---

**Q27. [L1] Why is the tech industry pushing heavily toward HTTP/3? What fundamental underlying protocol does it change?**

> *What the interviewer is testing:* HTTP generation evolution, QUIC, TCP vs UDP.

**Answer:**
HTTP/1.1 and HTTP/2 are built on **TCP**. TCP suffers from "Head-of-Line Blocking"—if a single packet is lost, the entire TCP stream pauses to wait for retransmission, heavily penalizing modern webpages that download hundreds of assets concurrently.
**HTTP/3** discards TCP completely and is built on **QUIC (which runs over UDP)**.
By using UDP at the transport layer, HTTP/3 handles packet loss and stream multiplexing simultaneously within the application layer. If one image packet drops, the rest of the page continues loading smoothly. It also combines the cryptographic TLS handshake into the initial connection, establishing secure connections significantly faster than TCP.

---

**Q28. [L2] Users inside the corporate office navigate to `wiki.company.com` and hit the fast, private internal server IP `10.0.5.10`. Users working from a coffee shop navigate to `wiki.company.com` and hit the public AWS Load Balancer IP `203.0.113.1`. How is the same domain name returning two completely different IPs without conflict?**

> *What the interviewer is testing:* Split-Horizon DNS (Split-brain DNS).

**Answer:**
This is achieved via **Split-Horizon DNS**.
DNS servers are configured to return different answers based on the originating IP address of the requester.
- **Internal Zone:** The corporate office routers hand out internal DNS servers (like Active Directory DNS or Route 53 Resolver) via DHCP. These servers hold an authoritative internal zone for `company.com` and return `10.0.5.10`.
- **External Zone:** The rest of the world queries public DNS resolvers, which traverse to the public authoritative nameservers for `company.com` (e.g., Route 53 Public Hosted Zone), which returns the public ALB IP `203.0.113.1`.

---

**Q29. [L3] Your company has a 10 Gbps Direct Connect fiber line from London to Tokyo. However, a single large file transfer using scp/TCP maxes out at only 150 Mbps, despite the link being 99% idle. Why can't TCP fill the pipe, and how do you fix it?**

> *What the interviewer is testing:* TCP Window Scaling, Long Fat Networks (LFN), Bandwidth-Delay Product.

**Answer:**
This is classic behavior in a **Long Fat Network (LFN)**—high bandwidth, high latency.
The speed limit is not the bandwidth; it's the **TCP Receive Window**. TCP requires an acknowledgment (ACK) for data sent. If the window size is 64KB, the sender can only put 64KB of data "in flight" on the fiber cable before stopping to wait for the ACK from Tokyo. Because the round-trip time (ping) from London to Tokyo is huge (e.g., 250ms), the sender constantly stops and waits, wasting the 10Gbps pipe.
**To fix:** I must tune the OS kernel to enable **TCP Window Scaling** (`sysctl net.ipv4.tcp_window_scaling=1`) and massively increase the `rmem` and `wmem` buffer sizes so the sender can put gigabytes of data "in flight" without waiting for instant ACKs. Changing the congestion control algorithm to `BBR` also drastically improves throughput on long links.

---

**Q30. [L2] A purist network engineer argues that with the adoption of IPv6, NAT (Network Address Translation) is dead and should never be used. Why does IPv6 eliminate the need for NAT?**

> *What the interviewer is testing:* IPv4 address exhaustion, RFC 1918, IPv6 global routing.

**Answer:**
NAT was heavily popularized primarily as a hack to solve **IPv4 Address Exhaustion**. Because there are only ~4 billion IPv4 addresses, we hide thousands of private corporate devices (RFC 1918 space like `10.x.x.x`) behind a single public router IP via NAT.
**IPv6** provides 340 undecillion addresses. Every grain of sand on Earth could have a unique public IPv6 address. Because there is virtually infinite supply, every server and device can have a globally unique, publicly routable IP address natively. NAT is fundamentally no longer required for address conservation. (Security is handled by strict stateful firewalls dropping inbound traffic, not NAT).

---

**Q31. [L1] What is a VLAN, and what problem does it solve in a physical data center?**

> *What the interviewer is testing:* Layer 2 segmentation, broadcast domains.

**Answer:**
A **VLAN (Virtual Local Area Network)** allows network engineers to logically segment a single physical switch into multiple isolated virtual switches.
For example, instead of buying two separate $5,000 switches for the "HR Server Rack" and the "Dev Server Rack," you plug them all into one switch. You assign HR ports to VLAN 10 and Dev ports to VLAN 20. 
At Layer 2, devices in VLAN 10 cannot see or intercept the broadcast traffic (like ARP requests) of VLAN 20. It effectively creates separate, secure **Broadcast Domains**, reducing network noise and isolating traffic without buying extra hardware.

---

**Q32. [L3] In Kubernetes, what is the architectural difference between a standard LoadBalancer Service and an Ingress Controller?**

> *What the interviewer is testing:* L4 vs L7 routing in K8s, cloud cost optimization.

**Answer:**
- **Service Type: LoadBalancer (Layer 4):** When you declare this, Kubernetes requests the cloud provider (AWS/GCP) to physically provision a brand new, dedicated Network/Classic Load Balancer. If you have 50 microservices, you get 50 ALBs, and you pay hourly for 50 ALBs. It routes raw IP traffic directly into the pod nodes.
- **Ingress Controller (Layer 7):** An Ingress Controller (like Nginx-Ingress) is essentially a software reverse proxy deployed *inside* the cluster itself as a Pod. You provision exactly **one** cloud Load Balancer to point all internet traffic to the Ingress pods. The Ingress pod acts as an API Gateway, reading the HTTP URL paths (`/serviceA`, `/serviceB`) and routing the traffic internally to the 50 different backend services. It collapses 50 cloud LBs into 1, massively saving costs and centralizing TLS termination.

---

**Q33. [L2] Your infrastructure team completely migrates a backend database to a new server with a new IP, updating DNS. All modern Go and Python services reconnect fine. However, a legacy Java application continues throwing connection timeouts trying to reach the old, dead IP address forever. Why?**

> *What the interviewer is testing:* Application-layer DNS caching, JVM defaults.

**Answer:**
This is an issue with the **Java Virtual Machine (JVM) DNS Cache**.
While OS kernels and Python respect the TTL (Time To Live) provided by the DNS record, older versions of the JVM completely ignore DNS TTL. Specifically, the `networkaddress.cache.ttl` security property is set to `-1` by default in some older Java versions, meaning Java will resolve the database hostname to an IP exactly once upon startup, cache it deeply in RAM, and **never query the DNS server again** for the lifetime of the process.
To fix it, you either restart the Java application to force a fresh lookup, or proactively change the `networkaddress.cache.ttl` variable in `java.security` to 60 seconds.

---

**Q34. [L1] What is the difference between a Layer 2 Switch and a Layer 3 Router?**

> *What the interviewer is testing:* OSI Model, MAC vs IP.

**Answer:**
- **Layer 2 Switch:** Operates at the Data Link layer. It moves packets strictly within the *same* local network. It forwards traffic based purely on physical **MAC Addresses**, utilizing an internal MAC address table to know which physical port a specific computer is plugged into.
- **Layer 3 Router:** Operates at the Network layer. It is responsible for bridging *different* networks together (e.g., connecting a home network to the internet). It routes traffic based on logical **IP Addresses**, using routing tables to determine the best path to send a packet across the globe.

---

**Q35. [L3] Your SaaS company provides a database-as-a-service. A massive banking client wants to securely connect to your database from their AWS VPC. Their strict compliance prohibits traversing the public internet, and prohibits VPC Peering because they refuse to expose their internal routing tables to you. How do you architect the connection?**

> *What the interviewer is testing:* AWS PrivateLink / VPC Endpoint Services, uni-directional security.

**Answer:**
This is the exact use case for **AWS PrivateLink (VPC Endpoint Services)**.
1. In your SaaS VPC, you place a Network Load Balancer (NLB) in front of the database and expose it as a VPC Endpoint Service.
2. The banking client requests to connect to your service. Upon your explicit approval, they create a VPC Interface Endpoint inside their own VPC.
3. This creates Elastic Network Interfaces (ENIs) natively inside the bank's subnets. 
The bank's applications communicate with these local ENIs using local private IPs. AWS PrivateLink securely pipes that traffic directly to your SaaS NLB under the hood over the AWS internal backbone.
**Why it passes audit:** Unlike VPC Peering, PrivateLink is purely **uni-directional**. The bank can initiate requests to you, but it is physically impossible for your SaaS network to initiate a reverse connection back into the bank's internal network to scan or attack them.

---

**Q36. [L2] You see logs indicating that packets arriving from the public internet have a source IP of `10.0.5.50` (a private IP in your own corporate network). What is this attack, and how is it stopped at the network border?**

> *What the interviewer is testing:* IP Spoofing, uRPF (Unicast Reverse Path Forwarding), ingress filtering.

**Answer:**
This is an **IP Spoofing** attack. The attacker manually alters the IP header of their malicious packet to falsely claim it originated from an internal, trusted IP, hoping your internal network implicitly trusts it and bypasses firewalls.
This is thwarted using **uRPF (Unicast Reverse Path Forwarding)** globally on border routers (often enforced by ISPs per BCP38), and Strict Ingress Filtering on corporate firewalls.
The border firewall evaluates the packet: "If I wanted to reply to this source IP `10.0.5.50`, my routing table says it lives on my internal LAN interface. But the packet just physically arrived on my external WAN interface. It's geographically impossible." The router instantly drops it as a spoofed packet.

---

**Q37. [L1] Define what a VPN (Virtual Private Network) is in simple terms, and briefly explain how IPSec secures it.**

> *What the interviewer is testing:* Encryption in transit, encapsulation.

**Answer:**
A **VPN** is a technology that allows a remote device to establish a secure, encrypted "tunnel" across the dangerous public internet, virtually inserting that device directly into a private corporate network exactly as if it were plugged into a switch in the office.
**IPSec (Internet Protocol Security)** handles the security at Layer 3:
1. It uses IKE (Internet Key Exchange) to cryptographically authenticate both sides and agree on encryption keys.
2. It takes the original internal packet (e.g., destined for `10.0.1.5`), completely encrypts it, and encapsulates it inside an entirely new outer public internet packet. 
3. The outer packet traverses the internet to the corporate router, which unwraps and decrypts the inner packet and forwards it to the internal destination cleanly.

---

**Q38. [L3] A major ISP accidentally misconfigures a BGP route, announcing to the world that they are the optimal path to reach Google's IP addresses. Suddenly, millions of users' traffic meant for Google is blackholed or severely degraded. What is this phenomenon called?**

> *What the interviewer is testing:* BGP Route Leaks, internet fragility.

**Answer:**
This is called a **BGP Route Leak** (or BGP Hijacking, if malicious).
Because the Border Gateway Protocol (BGP) was designed in an era of mutual trust, when the ISP incorrectly advertises a more specific prefix or a shorter path to Google's IPs, neighboring global routers dynamically update their tables and redirect traffic toward that ISP. 
If the ISP isn't actually Google, the traffic hits their edge and is dropped (blackholed), or it artificially bottlenecks their infrastructure causing massive outages. Modern networks mitigate this using RPKI (cryptographic route validation) and strict route filtering, refusing to accept Google announcements from untrusted Tier-3 ISPs.

---

**Q39. [L2] In a corporate network, an attacker executes a malicious script that generates millions of random fake MAC addresses and rapidly fills up the network switch's CAM table (MAC address table). What happens to the switch, and what security risk does this open?**

> *What the interviewer is testing:* MAC Flooding, fail-open behavior of switches.

**Answer:**
This is a **MAC Flooding** attack.
A switch has a limited amount of memory to map MAC addresses to physical ports. When the attacker's script completely exhausts this memory, the switch can no longer remember where legitimate devices are plugged in.
When a switch doesn't know where to send a packet, its default fail-safe protocol is to **"fail-open" and act like a Hub**. It broadcasts every single incoming packet out of *every single port* on the switch. 
The security risk is catastrophic: the attacker can now run a packet sniffer (like Wireshark) on their laptop and passively see all horizontal traffic intended for other computers, intercepting plaintext passwords and sessions. (Mitigated by configuring Switch Port Security algorithms limiting MACs per physical port).

---

**Q40. [L1] When a server wants to send data to an IP address, how does it decide whether to send it directly to the local network or send it to its Default Gateway?**

> *What the interviewer is testing:* Subnet masks, broadcast domains, routing tables.

**Answer:**
The server makes the decision using the **Subnet Mask**.
When it wants to talk to a destination IP, it mathematically performs a bitwise AND operation using its own IP, the destination IP, and the subnet mask.
- If the calculation results in the same network prefix, the server knows the destination is on its local LAN. It sends an ARP request to get the destination's MAC address and talks to it directly across the switch.
- If the network prefixes do not match, the server knows the destination is on a remote, foreign network. It immediately sends the packet to its **Default Gateway** (the router's MAC address), relying on the router to navigate the wider internet.
