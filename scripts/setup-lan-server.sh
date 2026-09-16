#!/usr/bin/env bash
# First-time setup for a fresh Linux (Debian/Ubuntu) LAN box that will host KuraTe.
# Run AT THE CONSOLE of 192.168.1.95 as root (no SSH yet):
#   1. Copy this file over (USB stick) or type the commands manually.
#   2. bash setup-lan-server.sh
# After it finishes, the deploy machine reaches it via: ssh root@192.168.1.95
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (su - / sudo -i first)."
  exit 1
fi

echo "=== 1/5 packages ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y openssh-server docker.io docker-compose-plugin curl ca-certificates || {
  echo "distro compose plugin missing, installing standalone docker-compose..."
  apt-get install -y openssh-server docker.io curl ca-certificates
  curl -SL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
}

echo "=== 2/5 services ==="
systemctl enable --now ssh
systemctl enable --now docker
docker --version
(docker compose version || docker-compose version)

echo "=== 3/5 deploy key (this PC can ssh as root afterwards) ==="
mkdir -p /root/.ssh && chmod 700 /root/.ssh
cat >> /root/.ssh/authorized_keys <<'EOF'
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDJLKdRDmsfHEjoSL977CaWVZbzT7vghGJ+puOrRYyOrnmb+Jt1wKJxOa2aCnnIF3i4T5S/XNY9CwujCr+hvAulIW/jDoPzm8IriO6ghvb8m26BmwUOfJJRBLbNm2OmVQqlvHKHlC2t8dQ70A7v78ocv4PKTlgAjnBwD2qocDxoqxnbEu1RemLMJOpSp92y3Lx0iI8FVkBD+kyL66C5ZHxuby4hEtWvltEJTxQxRJkZXwBUeVALxoey44LRLGFsJSpkTLulwfvoQ7JKsJxP2vU2h1qMpba3vXhMxHPyLYLRt+gtR+v6j8EXuD3XmA/xQhknH45RHTaIdfdMs3nc/oRCgd2L4Pefo/XvaQgCgVac+vhadUiQbJ5f4PjRIR7HSQ+IRCb9HM3/OGS6mNASURM1dZUNsiN2CXME+4bl4AQjKISTrtH26idAetH8bcQcdwKe+p4s/WzrXINILE8veCysPd018cIqiU815uTkGQi3G0icXZ31Gl+XnCwwas5u8L+BopLLG2V0MqTdo5eptDyymCXy4Fupuz4cqdRmDMGYW0o55O6XZr2FrATwWoQFw/s/8QyiuQcggr4yxPN6Ai6q1yPYfatDMQkL/wiFAVheC6KL7h0/VRy+3IluGD0FOYctBmbfleppdX9TmK+jmYlGCuDc3PzfLFcTCDQM7DTVfQ== kurate-deploy-rsa
EOF
chmod 600 /root/.ssh/authorized_keys
echo "deploy key installed."

echo "=== 4/5 firewall (only if ufw is present and active) ==="
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  echo "ufw rules added."
else
  echo "ufw not active, skipping."
fi

echo "=== 5/5 verify ==="
systemctl is-active --quiet ssh && echo "sshd: RUNNING" || echo "sshd: NOT RUNNING (check journalctl -u ssh)"
systemctl is-active --quiet docker && echo "docker: RUNNING" || echo "docker: NOT RUNNING (check journalctl -u docker)"
echo "box IPs:"
ip -4 addr show scope global | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || true

echo ""
echo "DONE. From the deploy PC test: ssh -o StrictHostKeyChecking=no root@192.168.1.95 echo OK"
echo "TIP: reserve 192.168.1.95 for this MAC in the router (DHCP reservation) so the IP never changes."
