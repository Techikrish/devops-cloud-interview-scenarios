# 🐧 Linux / SRE — Scenario-Based Interview Questions

**Q1. [L1] A critical web server is unresponsive, butping still works. SSH connection is refused. What could be the issue and how would you resolve it?**

> *What the interviewer is testing:* Basic system troubleshooting, understanding of SSH vs. ICMP.

**Answer:**
If `ping` works but `ssh` is refused, the server is up (network layer is fine) but the SSH daemon (`sshd`) is either down, rejecting connections (e.g., max connections reached, TCP wrappers), or a local firewall is blocking port 22.

To resolve: If physical or console access (like AWS Systems Manager or a hypervisor console) is available, I would log in and check:
1. Is `sshd` running? `systemctl status sshd`
2. Check logs: `journalctl -u sshd` or `/var/log/auth.log`
3. Check firewall rules: `iptables -L` or `ufw status`
If it's an Out Of Memory (OOM) issue, `sshd` might have been killed by the OOM killer. I'd reboot the instance via the cloud provider console if no other access is possible to restore service, then investigate `/var/log/messages` after recovery.

---

**Q2. [L2] An application deployed on a Linux machine suddenly starts failing with "No space left on device", but `df -h` shows the partition is only 50% full. What is happening?**

> *What the interviewer is testing:* Understanding of Linux filesystems, inodes vs. disk space.

**Answer:**
This is a classic issue of running out of inodes. While the physical disk blocks might be available, the filesystem has exhausted its allocation of inodes, which are required to track every file and directory. This typically happens when an application creates millions of tiny files (like session files, logs, or cache files).

I would verify this by running `df -i`. If `IUse%` is at 100%, I need to find the directory with the massive number of files.
To find the culprit, I can run:
`find / -type d -size +100K` (Directories grow in size when they contain many entries)
Or the slower but precise method:
`for i in /*; do echo $i; find $i |wc -l; done`
Once found (often `/tmp` or `/var/lib/php/sessions`), I would delete or archive the files, potentially using `find <dir> -type f -mtime +7 -delete` to prevent arguments list too long errors.

---

**Q3. [L2] Your team receives PagerDuty alerts that CPU utilization is consistently hitting 100% on a database server. How do you find what's causing it?**

> *What the interviewer is testing:* CPU troubleshooting workflow, differentiating between system, user, and wait CPU.

**Answer:**
First, I'd SSH into the server and run `top` or `htop`. I'd check the load average to see the trend (1, 5, 15 minutes).
In `top`, I'd look at the CPU states:
- High `%us` (user): The application or DB process is working hard. I'd find the PID, then use `strace -p <PID>` or `perf top` or check DB-specific tools (like `SHOW PROCESSLIST` in MySQL) to see what queries are running.
- High `%sy` (system): The kernel is doing heavy work (e.g., millions of context switches or network interrupts).
- High `%wa` (iowait): The CPU is idling waiting for I/O. This means it's a disk bottleneck, not a CPU bottleneck. I'd switch to `iotop` or `iostat -x 1` to find the process thrashing the disk.
- High `%st` (steal): If it's a VM, the noisy neighbor syndrome. The hypervisor is allocating cycles elsewhere. I would migrate the VM or resize the instance.

---

**Q4. [L1] A user complains they cannot execute a script (`./script.sh`), getting a "Permission denied" error. They own the file and have `rwx` permissions. What else could cause this?**

> *What the interviewer is testing:* Filesystem mount options, SELinux/AppArmor, shell interpretation.

**Answer:**
Even if the file has `chmod +x` and the user owns it, execution can be blocked by:
1. **Mount options:** The filesystem where the script resides might be mounted with the `noexec` flag (often used for `/tmp` or `/var/tmp` for security). You can check this by running `mount | grep noexec`.
2. **Interpreter path:** The script's shebang (`#!/bin/bash`) might point to a missing interpreter, or the interpreter itself lacks execute permissions.
3. **SELinux/AppArmor:** Mandatory Access Control policies might block the execution. Checking `dmesg` or `/var/log/audit/audit.log` will reveal SELinux denials.
4. **Improper ACLs:** Extended ACLs (checked via `getfacl script.sh`) might have a deny rule superseding standard POSIX permissions.

---

**Q5. [L2] During an incident, you notice that a specific log file (`/var/log/app.log`) is growing at 5GB per minute, threatening to fill the disk. Deleting the file doesn't free up the disk space space. Why, and what do you do?**

> *What the interviewer is testing:* How Linux handles open file descriptors, disk space recovery without downtime.

**Answer:**
In Linux, when you `rm` a file, you delete the directory entry (the link to the inode). However, the disk blocks are not freed as long as any running process holds an open file descriptor to that file. The application is still writing to the deleted file's inode.

Running `lsof | grep deleted` will show the application holding the file open.
To actually free the space without restarting the application (which might cause downtime), I would truncate the file instead of deleting it. 
If the file is already deleted but held open, I would find it via the proc filesystem and truncate it:
1. Find PID using `lsof`.
2. Find the FD number in `lsof` output (e.g., FD 4).
3. Truncate it: `> /proc/<PID>/fd/4`
In the future, I'd configure `logrotate` to use `copytruncate` or send a `SIGHUP` to the app to force it to reopen logs gracefully.

---

**Q6. [L2] An application tries to bind to port 443 but fails with "Permission denied". The port is not in use. Why is this happening?**

> *What the interviewer is testing:* Linux privileged ports, setcap, port forwarding.

**Answer:**
In Linux, ports below 1024 are considered "privileged ports." Only processes running as `root` can bind to them. For security reasons, web servers and applications are typically run as non-root users.

To fix this without running the application as root, there are three common approaches:
1. **Capabilities (Modern/Best Practice):** Use `setcap` to grant the specific binary permission to bind to privileged ports: `setcap 'cap_net_bind_service=+ep' /path/to/app`.
2. **Reverse Proxy:** Run a reverse proxy like Nginx or HAProxy as root, bound to 443, and forward traffic to the app running on a high port (e.g., 8443) as a normal user.
3. **iptables:** Redirect traffic from port 443 to a high port: `iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 8443`.

---

**Q7. [L2] A developer accidentally ran `chmod -R 777 /var/www/html` and now the web server is throwing 500 errors. How do you recover?**

> *What the interviewer is testing:* File permissions, understanding of web server security context.

**Answer:**
`777` permissions mean anyone can read, write, and execute the files. Many modern web applications, PHP-FPM, or SSH instances will refuse to read configurations or execute scripts if they are globally writable, citing security risks.

To fix this, we need to revert to standard secure permissions: Directories should typically be `755` and files should be `644`.
I would run:
1. `find /var/www/html -type d -exec chmod 755 {} \;`
2. `find /var/www/html -type f -exec chmod 644 {} \;`
Then, I'd ensure the ownership is correct (e.g., owned by `nginx:nginx` or `www-data:www-data`): `chown -R www-data:www-data /var/www/html`. This restores standard secure execution parameters.

---

**Q8. [L3] The system is experiencing unexplained network latency. `ping` times internally jump from 1ms to 200ms periodically. How do you isolate the problem?**

> *What the interviewer is testing:* Advanced network troubleshooting, packet capture, kernel networking stack.

**Answer:**
Intermittent high latency is tricky. My workflow would be:
1. **Scope:** Is it affecting all instances? One AZ? One specific app? I'd ping the default gateway and another instance in the same subnet to isolate whether it's the host network stack or the physical network/hypervisor.
2. **Host metrics:** Check `dmesg` or `journalctl` for NIC errors, ring buffer drops, or `nf_conntrack` table full messages.
3. **Traffic Analysis:** Use `mtr` to track packet loss at hops. To capture the issue, I'd run `tcpdump -i eth0 -w capture.pcap` during the latency spikes.
4. **Kernel Drops:** Use `netstat -su` to see if UDP/TCP packets are being dropped by the kernel due to full receive buffers. I'd verify `top` to check if a specific CPU core handling NIC interrupts (`ksoftirqd`) is pinned at 100%, causing a processing bottleneck.
Based on the finding, I might tune ring buffers (`ethtool -G`), adjust `sysctl` buffers, or escalate to the cloud provider if the host metrics check out perfectly.

---

**Q9. [L3] A service is being killed randomly every few days by the OOM Killer, but monitoring shows the machine has plenty of free RAM available. Why?**

> *What the interviewer is testing:* Cgroups, NUMA architectures, or memory fragmentation.

**Answer:**
If the host has free memory but a process is still OOM killed, the limitation is artificially imposed or architectural:
1. **Cgroups:** If the process runs in a Docker container or a systemd slice with strict `MemoryLimit=` or `--memory`, the cgroup will trigger the kernel OOM killer on the process specifically when it breaches its localized limit, regardless of host free memory. Check `dmesg -T | grep -i oom`.
2. **NUMA Nodes:** On large multi-socket servers, memory is tied to specific CPU sockets (NUMA nodes). If the application sets strict `numactl` policies to pin memory to a specific node, and *that* node runs out of memory, it may OOM kill rather than fetch memory across the slow QPI link from another socket.
3. **32-bit Architecture constraints:** Though rare nowadays, 32-bit apps max out around 3-4GB of accessible address space.

---

**Q10. [L1] You need to find all `.log` files modified in the last 7 days and copy them to an archive directory. What command do you use?**

> *What the interviewer is testing:* Familiarity with `find` and `xargs` or `-exec`.

**Answer:**
The most efficient command would be:
`find /path/to/search -name "*.log" -mtime -7 -type f -exec cp {} /path/to/archive/ \;`
Alternatively, for a large number of files (to avoid spawning multiple `cp` processes), use `xargs`:
`find /path/to/search -name "*.log" -mtime -7 -type f -print0 | xargs -0 -I {} cp {} /path/to/archive/`

The `-mtime -7` checks for files modified in less than 7 days, `-type f` restricts to files only, and `-print0` with `-0` handles filenames with spaces safely.

---

**Q11. [L3] You are investigating an application crash, but no core dump was generated. How do you ensure core dumps are created for future crashes?**

> *What the interviewer is testing:* Core dump mechanisms, ulimits, systemd.

**Answer:**
By default, core dumps are often disabled in production environments due to disk space and security concerns. To enable them:
1. **ulimit:** Check and set the soft/hard limits for core file size. `ulimit -S -c unlimited` in the script starting the app, or edit `/etc/security/limits.conf` to set `* soft core unlimited`.
2. **Kernel Pattern:** Check where dumps are written via `sysctl kernel.core_pattern`. It should point to a valid directory or a handler like systemd-coredump (e.g., `|/usr/lib/systemd/systemd-coredump %P %u %g %s %t %c %h`).
3. **Systemd:** If run as a systemd service, the unit file must have `LimitCORE=infinity` in the `[Service]` section.
4. **App configuration:** Ensure the application itself doesn't catch the SEGV signal without re-raising it, or hasn't called `prctl` to disable dumpability (e.g., `PR_SET_DUMPABLE`).

---

**Q12. [L2] Our application uses a third-party API. The API vendor claims they are receiving requests, but our app throws timeout errors. How do you prove whether the traffic is leaving our server successfully?**

> *What the interviewer is testing:* Packet capture, `tcpdump` usage.

**Answer:**
To definitively prove if the traffic is leaving the server and if we are receiving a response, I would use `tcpdump`.
I'd run:
`tcpdump -nni eth0 host <vendor-ip> and port 443`
I'd look at the TCP handshake. 
- If I see `SYN` leaving, but no `SYN-ACK` returning, the traffic is being dropped aggressively (firewall, routing issue on the path, or vendor blocking us).
- If the handshake completes, but SSL/TLS negotiation stalls, or we send an HTTP request and get no `PSH` data back, the vendor's application is hanging, proving the fault is on their end.
- If no `SYN` packets appear in tcpdump at all, the issue is internal to the host (e.g., the app is locked up, or local `iptables` rules drop outbound traffic before it hits the wire).

---

**Q13. [L2] A cron job configured to run every midnight is failing, but when you run the script manually as the same user, it works perfectly. Why?**

> *What the interviewer is testing:* Cron environment variations, absolute paths.

**Answer:**
This is almost always an environment variable issue.
When a user logs in interactively, profiles like `~/.bashrc` and `/etc/profile` are sourced, setting up `$PATH`, aliases, and application-specific variables. Cron executes with a heavily restricted, minimal environment (often just `/usr/bin:/bin`).

To fix this:
1. The script should use absolute paths for every command (e.g., `/usr/bin/curl` instead of `curl`).
2. Alternatively, the crontab can explicitly source the environment at execution:
`0 0 * * * . /home/user/.bash_profile; /home/user/script.sh`
3. Any variables needed by the script should be explicitly exported at the top of the script.

---

**Q14. [L3] Your infrastructure team is migrating to a new storage backend. You need to rsync 10TB of data with millions of tiny files between two Linux servers over the network. How do you optimize for speed?**

> *What the interviewer is testing:* Data transfer optimization, parallel processing, bypassing SSH overhead.

**Answer:**
Standard `rsync -avz` over SSH for millions of tiny files is extremely slow. The bottleneck becomes SSH encryption overhead and the serial nature of rsync analyzing one file at a time.
To optimize:
1. **Parallelization:** I would use `find` piped into `xargs` running multiple rsync processes in parallel, or use tools specifically designed for this like `fpsync` or `GNU parallel`.
2. **Disable Compression:** Remove the `-z` flag from rsync. Compressing already compressed files (like images) wastes CPU, and for tiny files, the compression overhead dominates.
3. **Change Cipher:** If I must use SSH, I'd use a faster cipher: `rsync -e "ssh -c aes128-ctr"`.
4. **Use Netcat/Tar (if secure):** In a trusted backend network, pipe a parallel tar stream directly over unencrypted TCP via `nc`. It avoids SSH entirely.
`Sender: tar -cf - folder | nc -l 1234`
`Receiver: nc <sender-ip> 1234 | tar -xf -`

---

**Q15. [L2] You see a process in `D` state in `top`. You use `kill -9` but it doesn't die. Why, and how do you remove it?**

> *What the interviewer is testing:* Uninterruptible sleep, kernel states, hardware/NFS lockups.

**Answer:**
The `D` state stands for "Uninterruptible Sleep". The process is waiting deeply within the kernel for a hardware or I/O operation to complete (often a hard disk or a stalled NFS mount). 
Because it's in the kernel context rather than user space, it ignores all signals, including `SIGKILL` (`kill -9`).

You cannot kill a `D` state process directly. The solutions are:
1. **Fix the I/O block:** If it's a hung NFS mount, forcing an unmount (`umount -f -l`) or restarting the NFS server might free it. If it's a dying hard drive, resolving the hardware fault is necessary.
2. **Reboot:** If the I/O cannot be restored, the only way to clear the process is to reboot the server. Over time, too many `D` state processes will artificially skyrocket the system Load Average until the machine hangs.

---

**Q16. [L1] How do you persistently mount a new EBS/block volume so it survives reboots?**

> *What the interviewer is testing:* `/etc/fstab` configuration, UUIDs vs device names.

**Answer:**
First, I verify the block device name (`lsblk`), format it (`mkfs.ext4 /dev/nvmeXn1`), and mount it temporarily to verify (`mount /dev/nvmeXn1 /data`).
To make it persistent:
I should never use the device name (like `/dev/nvmeXn1`) in `/etc/fstab` because cloud providers do not guarantee device name ordering across reboots. Instead, I use the UUID.
1. Find the UUID: `blkid /dev/nvmeXn1`
2. Add an entry to `/etc/fstab`:
   `UUID=123-abc-456 /data ext4 defaults,nofail 0 2`
3. Test the entry without rebooting: `umount /data` then `mount -a`. If no errors are thrown, the system will safely mount it on the next boot. (The `nofail` option ensures the server still boots if the volume is detached).

---

**Q17. [L3] An incident occurred where a server ran out of memory, but the `oom-killer` didn't trigger, causing a complete kernel hang (hard lockup). How do you configure the kernel to automatically panic and reboot if this happens again?**

> *What the interviewer is testing:* Sysctl tuning, kernel panic parameters, high availability recovery.

**Answer:**
If the system becomes completely unresponsive in a hard lockup or OOM stall, manual intervention is slow. I would configure the kernel to panic and automatically reboot. This allows auto-scaling groups or load balancers to immediately replace or re-route traffic from the failed node.
Using `sysctl`:
1. `kernel.panic = 10` (Reboot 10 seconds after a panic)
2. `vm.panic_on_oom = 1` (Panic if the kernel hits an unresolvable OOM state, rather than trying to kill processes if the killer is disabled or failing)
3. `kernel.hung_task_panic = 1` (Panic if tasks are hung for too long, like the `D` state lockups).
These settings are added to `/etc/sysctl.conf` to persist across reboots, forcing the system to "fail fast" and rely on infrastructure redundancy.

---

**Q18. [L2] A junior admin removed the executable bit from the `chmod` command itself (`chmod -x /bin/chmod`). How do you fix this since you can't use chmod to fix chmod?**

> *What the interviewer is testing:* Deep understanding of Linux dynamic linking and program execution.

**Answer:**
Since `/bin/chmod` is essentially just an ELF binary, you can invoke the dynamic linker directly to execute the file without it needing the execute bit. 
The dynamic linker/loader itself is executable.
` /lib64/ld-linux-x86-64.so.2 /bin/chmod +x /bin/chmod` (path varies by distro).

Alternatively, you could use a language interpreter built into the system that already has execute permissions:
Python: `python -c "import os; os.chmod('/bin/chmod', 0o755)"`
Or simply copy a tool that can set attributes: `cp /bin/ls /tmp/ls; cat /bin/chmod > /tmp/ls` (Wait, this is complex). The dynamic linker or Python approach is the cleanest SRE-level answer.

---

**Q19. [L1] A user wants to safely store passwords and application secrets as environment variables. What is the standard SRE approach to this?**

> *What the interviewer is testing:* Secret management best practices vs. hardcoding.

**Answer:**
Environment variables are an improvement over hardcoded passwords in git, but they are still insecure because they show up in `printenv`, `/proc/<pid>/environ`, and crash dumps.
The SRE best practice is to never store secrets in shell environment variables. Instead, use a centralized Secret Management system (like AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets).
The application should use an SDK to fetch the secret into memory dynamically at runtime using an IAM role or temporary token, or secrets should be injected securely by a sidecar/init container directly into a temporary RAM disk (`tmpfs`) file that the application reads once and clears.

---

**Q20. [L2] What is an inode, and why is an inode number identical for two different files?**

> *What the interviewer is testing:* Understanding of hard links and filesystem architecture.

**Answer:**
An inode (index node) is a data structure on a standard Linux filesystem that stores metadata about a file, like its size, permissions, ownership, and pointers to the disk blocks where the data is stored. It does *not* store the file name.

If two different file names (paths) have the exact same inode number (verified via `ls -i`), it means they are **Hard Links**. Hard links act as multiple names pointing to the same underlying inode and data. Because they reference the same inode, changes made to the data under one name are immediately reflected in the other. Hard links cannot span different filesystems.
