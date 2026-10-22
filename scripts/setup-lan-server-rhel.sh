#!/usr/bin/env bash
# First-time setup for a fresh RHEL-family (Rocky/Alma/RHEL/Fedora) LAN box
# that will host KuraTe. Run AT THE CONSOLE as root:
#   bash setup-lan-server-rhel.sh
# After it finishes, the deploy machine reaches it via key auth:
#   ssh -i ~/.ssh/id_kurate_rsa root@192.168.1.95
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (su - first)."
  exit 1
fi

echo "=== 0/6 distro ==="
if [ -f /etc/os-release ]; then cat /etc/os-release | head -3; fi

echo "=== 1/6 SELinux state (informational — we keep it ENFORCING) ==="
getenforce || true
# sshd must be allowed to read the key we are about to install (default policy
# already allows it once contexts are correct; fix them explicitly below).

echo "=== 2/6 packages: openssh-server + Docker CE + compose plugin ==="
dnf install -y openssh-server policycoreutils-python-utils curl ca-certificates || yum install -y openssh-server curl ca-certificates
if ! command -v docker >/dev/null 2>&1; then
  dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo 2>/dev/null \
    || yum-config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
  dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin || {
    echo "Docker CE repo failed; falling back to distro docker..."
    dnf install -y docker docker-compose 2>/dev/null || dnf install -y docker 2>/dev/null || yum install -y docker
  }
fi

echo "=== 3/6 services ==="
systemctl enable --now sshd
systemctl enable --now docker
docker --version
(docker compose version || docker-compose version || echo "compose plugin check skipped")

echo "=== 4/6 root login + deploy key (SELinux-safe) ==="
mkdir -p /root/.ssh && chmod 700 /root/.ssh
cat >> /root/.ssh/authorized_keys <<'EOF'
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDJLKdRDmsfHEjoSL977CaWVZbzT7vghGJ+puOrRYyOrnmb+Jt1wKJxOa2aCnnIF3i4T5S/XNY9CwujCr+hvAulIW/jDoPzm8IriO6ghvb8m26BmwUOfJJRBLbNm2OmVQqlvHKHlC2t8dQ70A7v78ocv4PKTlgAjnBwD2qocDxoqxnbEu1RemLMJOpSp92y3Lx0iI8FVkBD+kyL66C5ZHxuby4hEtWvltEJTxQxRJkZXwBUeVALxoey44LRLGFsJSpkTLulwfvoQ7JKsJxP2vU2h1qMpba3vXhMxHPyLYLRt+gtR+v6j8EXuD3XmA/xQhknH45RHTaIdfdMs3nc/oRCgd2L4Pefo/XvaQgCgVac+vhadUiQbJ5f4PjRIR7HSQ+IRCb9HM3/OGS6mNASURM1dZUNsiN2CXME+4bl4AQjKISTrtH26idAetH8bcQcdwKe+p4s/WzrXINILE8veCysPd018cIqiU815uTkGQi3G0icXZ31Gl+XnCwwas5u8L+BopLLG2V0MqTdo5eptDyymCXy4Fupuz4cqdRmDMGYW0o55O6XZr2FrATwWoQFw/s/8QyiuQcggr4yxPN6Ai6q1yPYfatDMQkL/wiFAVheC6KL7h0/VRy+3IluGD0FOYctBmbfleppdX9TmK+jmYlGCuDc3PzfLFcTCDQM7DTVfQ== kurate-deploy-rsa
EOF
chmod 600 /root/.ssh/authorized_keys
# Critical on SELinux hosts: wrong contexts on ~/.ssh silently break key auth.
restorecon -Rv /root/.ssh
# Allow root password login too (key auth is used by automation either way).
if grep -q "^#\?PermitRootLogin" /etc/ssh/sshd_config; then
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
else
  echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
fi
if grep -q "^#\?PasswordAuthentication" /etc/ssh/sshd_config; then
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
fi
systemctl reload sshd

echo "=== 5/6 firewall (only if firewalld is active) ==="
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=ssh
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
  echo "firewalld rules added."
else
  echo "firewalld not active, skipping."
fi

echo "=== 6/6 verify ==="
systemctl is-active --quiet sshd && echo "sshd: RUNNING" || echo "sshd: NOT RUNNING"
systemctl is-active --quiet docker && echo "docker: RUNNING" || echo "docker: NOT RUNNING"
getenforce
echo "box IPs:"
ip -4 addr show scope global | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || true
echo "recent SSH denials (empty = good):"
ausearch -m avc -ts recent 2>/dev/null | grep -i ssh | tail -3 || true

echo ""
echo "DONE. From the deploy PC test:"
echo "  ssh -i ~/.ssh/id_kurate_rsa -o StrictHostKeyChecking=no root@192.168.1.95 echo OK"
echo "TIP: reserve 192.168.1.95 for this MAC in the router (DHCP reservation)."
