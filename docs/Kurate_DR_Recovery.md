# KuraTe - Disaster Recovery Guide

> **Last updated:** 2026-07-24
> **VPS:** 192.168.1.67 (Ubuntu 22.04.5 LTS)
> **Domain:** kurate.drsrv.net.ar
> **Docker:** 29.6.2 + Compose v5.3.1

---

## Table of Contents

1. [Infrastructure Overview](#1-infrastructure-overview)
2. [Prerequisites](#2-prerequisites)
3. [SSH Key Setup](#3-ssh-key-setup)
4. [OS Update & Base Packages](#4-os-update--base-packages)
5. [Docker Installation](#5-docker-installation)
6. [Deploy KuraTe Stack](#6-deploy-kurate-stack)
7. [SSL Certificates](#7-ssl-certificates)
8. [Cron Jobs (Backups & Certbot)](#8-cron-jobs)
9. [Firewall (UFW) & SELinux](#9-firewall-ufw--selinux)
10. [DNS Configuration](#10-dns-configuration)
11. [Verification & Testing](#11-verification--testing)
12. [Quick Deploy (Normal Workflow)](#12-quick-deploy-normal-workflow)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Infrastructure Overview

```
                          Internet
                              │
                      181.91.83.196:80/443
                              │
                         ┌────┴────┐
                         │  VPS    │  Ubuntu 22.04.5 LTS
                         │         │  192.168.1.67
                         └────┬────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
        │  Nginx    │  │  KuraTe   │  │  MongoDB  │
        │  alpine   │  │  App      │  │  4.4      │
        │           │  │  Node.js  │  │           │
        │  80→80    │  │  5001→5000│  │  27018    │
        │  443→443  │  │           │  │  →27017   │
        └───────────┘  └───────────┘  └───────────┘
              │
        KurateCerts/
        (fullchain.pem + privkey.pem)
```

### Port Mapping

| Service  | Container Port | Host Port | Protocol |
|----------|---------------|-----------|----------|
| Nginx    | 80            | 80*       | HTTP (redirects to HTTPS) |
| Nginx    | 443           | 443*      | HTTPS |
| App      | 5000          | 5001      | HTTP (internal) |
| MongoDB  | 27017         | 27018     | TCP |

> *On production VPS, docker-compose.override.yml remaps nginx to 8080/8443. Remove the override for production 80/443.

### Volumes

| Volume              | Purpose                    | Backup Required |
|---------------------|----------------------------|-----------------|
| KuraTe_mongo_data   | MongoDB data               | **YES** (daily) |
| ./public            | Static files (bind mount)  | Covered by git  |
| ./KurateCerts       | SSL certificates           | **YES**         |

---

## 2. Prerequisites

### From Windows PC (DrGift / Administrator)

Required tools:
- SSH client (built-in `ssh.exe`)
- SCP (built-in `scp.exe`)
- PowerShell 7+
- Git (for repo access)

### SSH Key

Location: `C:\Users\Administrator\.ssh\id_kurate_rsa` (RSA 4096, no passphrase)

### VPS Access

- **IP:** 192.168.1.67
- **User:** root
- **Auth:** SSH key (`id_kurate_rsa`)

---

## 3. SSH Key Setup

### 3.1 Generate key (if lost)

```powershell
ssh-keygen -t rsa -b 4096 -f C:\Users\Administrator\.ssh\id_kurate_rsa -N "" -C "kurate-deploy-rsa"
```

### 3.2 Install key on fresh VPS

From VPS console (Hyper-V/VirtualBox/local terminal):

```bash
# Enable root password login
sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd
```

From Windows (with password):

```powershell
# Copy key to VPS
type C:\Users\Administrator\.ssh\id_kurate_rsa.pub | ssh root@192.168.1.67 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### 3.3 Harden SSH after key is installed

On VPS:

```bash
sed -i 's/PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

On Windows, update `~/.ssh/config`:

```
Host 192.168.1.67
    User root
    Port 22
    IdentityFile C:\Users\Administrator\.ssh\id_kurate_rsa
    IdentitiesOnly yes
    PubkeyAuthentication yes
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    StrictHostKeyChecking accept-new
```

---

## 4. OS Update & Base Packages

On VPS, after fresh install:

```bash
# Update OS
apt-get update -y && apt-get upgrade -y

# Install essential packages
apt-get install -y curl ca-certificates gnupg lsb-release net-tools selinux-utils ufw

# Verify
ifconfig          # from net-tools
getenforce        # from selinux-utils
ufw version       # from ufw
```

---

## 5. Docker Installation

On VPS:

```bash
# Install Docker via official script
curl -fsSL https://get.docker.com | sh

# Enable and start Docker
systemctl enable docker
systemctl start docker

# Verify
docker --version          # Docker version 29.6.2+
docker compose version    # Docker Compose version v5.3.1+
```

---

## 5. Deploy KuraTe Stack

### 5.1 Full deploy from scratch (DR scenario)

```powershell
# From Windows - run the deploy script
powershell -ExecutionPolicy Bypass -File D:\FullMinent\scripts\deploy-vps.ps1 -KeyPath C:\Users\Administrator\.ssh\id_kurate_rsa
```

This script:
1. Packages project (excludes node_modules, .git, android, ios)
2. Uploads via SCP
3. Verifies SHA256 checksum
4. Extracts on server
5. Builds Docker image
6. Starts all containers

### 5.2 Manual deploy (if script fails)

```powershell
# Step 1: Package
cd D:\FullMinent
tar -czf upload_package.tar.gz --exclude=node_modules --exclude=.git --exclude=android --exclude=ios -C . .

# Step 2: Upload
scp -i C:\Users\Administrator\.ssh\id_kurate_rsa upload_package.tar.gz root@192.168.1.67:/root/KuraTe-platform/

# Step 3: Extract on VPS
ssh -i C:\Users\Administrator\.ssh\id_kurate_rsa root@192.168.1.67 "cd /root/KuraTe-platform && tar -xzf upload_package.tar.gz && rm upload_package.tar.gz"

# Step 4: Build and start
ssh -i C:\Users\Administrator\.ssh\id_kurate_rsa root@192.168.1.67 "cd /root/KuraTe-platform && INSTALL_TWILIO=1 docker compose up -d --build"
```

### 5.3 Docker Compose Files

**docker-compose.yml** (base):

```yaml
services:
  mongo:
    image: mongo:4.4
    command: ["mongod", "--wiredTigerCacheSizeGB", "0.25", "--bind_ip_all"]
    container_name: KuraTe_mongo
    restart: unless-stopped
    ports:
      - "27018:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongo", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 40s

  app:
    build:
      context: .
      args:
        INSTALL_TWILIO: "${INSTALL_TWILIO:-1}"
    container_name: KuraTe_app
    restart: unless-stopped
    env_file: .env
    environment:
      - NODE_ENV=production
      - MONGO_URI=mongodb://mongo:27017/KuraTe
    volumes:
      - ./public:/app/public
      - ./controllers:/app/controllers
      - ./services:/app/services
      - ./models:/app/models
      - ./middleware:/app/middleware
      - ./utils:/app/utils
      - ./config:/app/config
      - ./data:/app/data
      - ./server.js:/app/server.js
    depends_on:
      mongo:
        condition: service_healthy

  nginx:
    image: nginx:alpine
    container_name: KuraTe_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./KurateCerts:/etc/nginx/certs:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - app

volumes:
  mongo_data:
    name: KuraTe_mongo_data
```

**docker-compose.override.yml** (dev/local — REMOVED on production):

```yaml
services:
  app:
    ports:
      - "5001:5000"
    environment:
      - PORT=5000
  nginx:
    ports: !override
      - "8080:80"
      - "8443:443"
```

> **IMPORTANT:** Delete `docker-compose.override.yml` on production VPS to use ports 80/443 directly.

### 5.4 Fix nginx upstream port

After deploy, verify nginx points to the correct app port:

```bash
# Check what port the app listens on
docker logs KuraTe_app --tail 5 | grep "running on port"

# If app runs on 5001 (from .env PORT=5001), fix nginx upstream:
sed -i 's/server app:5000/server app:5001/' /root/KuraTe-platform/nginx/conf.d/default.conf
docker exec KuraTe_nginx nginx -s reload
```

### 5.5 Seed location database

The database is empty after fresh install. Seed provinces, cities, and neighborhoods:

```bash
# Seed base locations (24 provinces, 229 cities, 47 CABA neighborhoods)
docker exec KuraTe_app node /app/scripts/seed-locations.js

# Import AMBA cities (197 cities from CSV)
docker exec KuraTe_app node /app/scripts/import-amba-cities.js

# Verify
docker exec KuraTe_nginx wget -qO- http://app:5001/api/v1/locations/provinces | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Provinces: {d[\"count\"]}')"
```

Expected output:
```
Seed complete!
Provinces: 24
Cities created: 176
```

### 5.6 Restore from backup (if available)

If you have a MongoDB dump from a previous VPS:

```bash
# Upload dump to VPS
scp -i C:\Users\Administrator\.ssh\id_kurate_rsa backup_dump.gz root@192.168.1.67:/tmp/

# Copy into mongo container
docker cp /tmp/backup_dump.gz KuraTe_mongo:/tmp/restore.gz

# Restore (drops existing data)
docker exec KuraTe_mongo mongorestore --gzip --archive=/tmp/restore.gz --drop

# Verify
docker exec KuraTe_mongo mongo KuraTe --quiet --eval 'db.users.count()'
```

> **Note:** The `--drop` flag replaces seed data with backup data. Run seed scripts first if you want to keep seed data alongside restored data.

---

## 6. SSL Certificates

### 6.1 Current certs location

```
/root/KuraTe-platform/KurateCerts/
├── cert.pem
├── chain.pem
├── fullchain.pem
├── privkey.pem
└── pub-key.pem
```

### 6.2 Install certbot

```bash
apt-get install -y certbot
```

### 6.3 Issue certificate

```bash
# Stop nginx to free port 80
docker stop KuraTe_nginx

# Issue cert
certbot certonly --standalone -d kurate.drsrv.net.ar --agree-tos --email admin@drsrv.net.ar

# Copy to KurateCerts
cp /etc/letsencrypt/live/kurate.drsrv.net.ar/fullchain.pem /root/KuraTe-platform/KurateCerts/
cp /etc/letsencrypt/live/kurate.drsrv.net.ar/privkey.pem /root/KuraTe-platform/KurateCerts/

# Restart nginx
docker start KuraTe_nginx
```

### 6.4 Auto-renewal

```bash
# Create renewal hook
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
cp /etc/letsencrypt/live/kurate.drsrv.net.ar/fullchain.pem /root/KuraTe-platform/KurateCerts/
cp /etc/letsencrypt/live/kurate.drsrv.net.ar/privkey.pem /root/KuraTe-platform/KurateCerts/
docker exec KuraTe_nginx nginx -s reload
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

## 7. Cron Jobs

### 7.1 Daily MongoDB backup (03:00 UTC)

```bash
cat > /root/KuraTe-platform/daily_backup.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/root/KuraTe-platform/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
docker exec KuraTe_mongo mongodump --archive --gzip > "$BACKUP_DIR/mongo_$DATE.gz"
find "$BACKUP_DIR" -name "mongo_*.gz" -mtime +7 -delete
SCRIPT
chmod +x /root/KuraTe-platform/daily_backup.sh

# Install cron
(crontab -l 2>/dev/null; echo "0 3 * * * /root/KuraTe-platform/daily_backup.sh >> /root/KuraTe-platform/backups/backup.log 2>&1") | crontab -
```

### 7.2 Certbot auto-renewal (04:15 UTC)

```bash
(crontab -l 2>/dev/null; echo "15 4 * * * certbot renew --quiet --deploy-hook '/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh'") | crontab -
```

### 7.3 Git backup (06:00 & 18:00 UTC)

```bash
cat > /root/KuraTe-platform/git_backup.sh << 'SCRIPT'
#!/bin/bash
cd /root/KuraTe-platform
git add -A
git commit -m "auto-backup $(date +%Y%m%d_%H%M%S)" --allow-empty
git push origin main 2>&1 || true
SCRIPT
chmod +x /root/KuraTe-platform/git_backup.sh

(crontab -l 2>/dev/null; echo "0 6,18 * * * /root/KuraTe-platform/git_backup.sh >> /root/KuraTe-platform/backups/git_backup.log 2>&1") | crontab -
```

### 7.4 Verify crons

```bash
crontab -l
```

Expected output:

```
0 3 * * * /root/KuraTe-platform/daily_backup.sh >> /root/KuraTe-platform/backups/backup.log 2>&1
15 4 * * * certbot renew --quiet --deploy-hook '/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh'
0 6,18 * * * /root/KuraTe-platform/git_backup.sh >> /root/KuraTe-platform/backups/git_backup.log 2>&1
```

---

## 9. Firewall (UFW) & SELinux

### Check and configure UFW on VPS

```bash
# Check status
ufw status

# If enabled, allow required ports
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload

# Verify
ufw status verbose
```

> Ensure your network/router forwards ports 80 and 443 to 192.168.1.67.

### SELinux

Ubuntu 22.04 does not ship with SELinux enabled by default (uses AppArmor instead). If SELinux is installed or you enable it manually:

```bash
# Check current SELinux status
getenforce

# Check if SELinux is installed
sestatus

# Set to permissive mode (temporary — resets on reboot)
setenforce 0

# Set to permissive mode (permanent — survives reboot)
sed -i 's/^SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
# or if SELINUX=disabled, change to:
sed -i 's/^SELINUX=disabled/SELINUX=permissive/' /etc/selinux/config

# Reboot to apply
reboot
```

> **Recommended:** Keep SELinux in `permissive` mode for KuraTe. Docker and MongoDB work without issues in permissive mode. If you need enforcing mode, you'll need custom policies for Docker socket, MongoDB ports, and nginx.

---

## 10. DNS Configuration

### EasyDNS (DDNS)

```bash
# In .env
EASYDNS_USERNAME=drcarloni
EASYDNS_HOSTNAME=kurate.drsrv.net.ar
```

### Manual DNS

If using Cloudflare or another DNS provider:

| Type  | Name    | Value                | TTL   |
|-------|---------|----------------------|-------|
| A     | kurate  | YOUR_VPS_PUBLIC_IP   | 300   |
| CNAME | www     | kurate.drsrv.net.ar  | 300   |

---

## 10. Verification & Testing

### 10.1 Check containers

```bash
ssh root@192.168.1.67 "docker ps --filter name=KuraTe"
```

Expected:

```
NAMES          STATUS          PORTS
KuraTe_nginx   Up X minutes    0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
KuraTe_app     Up X minutes    0.0.0.0:5001->5000/tcp
KuraTe_mongo   Up X minutes    0.0.0.0:27018->27017/tcp (healthy)
```

### 10.2 Test endpoints

```bash
# App direct
curl -s -o /dev/null -w "App (5001): %{http_code}\n" http://localhost:5001/

# Nginx HTTP (should redirect to HTTPS)
curl -s -o /dev/null -w "Nginx HTTP (80): %{http_code}\n" http://localhost:80/

# Nginx HTTPS
curl -s -o /dev/null -w "Nginx HTTPS (443): %{http_code}\n" -k https://localhost:443/

# External
curl -s -o /dev/null -w "External HTTPS: %{http_code}\n" https://kurate.drsrv.net.ar/
```

### 10.3 Check logs

```bash
# App logs
docker logs KuraTe_app --tail 20

# Nginx logs
docker logs KuraTe_nginx --tail 20

# MongoDB
docker logs KuraTe_mongo --tail 10
```

---

## 11. Quick Deploy (Normal Workflow)

For日常 deployments after initial setup:

```powershell
# One command deploy from Windows
powershell -ExecutionPolicy Bypass -File D:\FullMinent\scripts\deploy-vps.ps1 -KeyPath C:\Users\Administrator\.ssh\id_kurate_rsa
```

Or manually:

```powershell
# Build and restart on VPS
ssh -i C:\Users\Administrator\.ssh\id_kurate_rsa root@192.168.1.67 "cd /root/KuraTe-platform && INSTALL_TWILIO=1 docker compose up -d --build"
```

---

## 12. Troubleshooting

### Container won't start

```bash
docker logs KuraTe_app --tail 50
docker inspect KuraTe_app --format '{{json .State}}'
```

### MongoDB connection refused

```bash
docker exec KuraTe_app getent hosts mongo
docker exec KuraTe_mongo mongosh --eval "db.adminCommand('ping')"
```

### Nginx 502 Bad Gateway

```bash
docker exec KuraTe_nginx nginx -t
docker logs KuraTe_nginx --tail 20
curl http://app:5000/  # from nginx container
```

### SSL certificate expired

```bash
certbot renew
cp /etc/letsencrypt/live/kurate.drsrv.net.ar/fullchain.pem /root/KuraTe-platform/KurateCerts/
cp /etc/letsencrypt/live/kurate.drsrv.net.ar/privkey.pem /root/KuraTe-platform/KurateCerts/
docker exec KuraTe_nginx nginx -s reload
```

### Disk space low

```bash
docker system prune -f
docker volume prune -f
journalctl --vacuum-size=200M
```

### SSH connection refused

```bash
# From VPS console
systemctl restart sshd
ufw allow 22/tcp
```

### Full stack restart

```bash
cd /root/KuraTe-platform
docker compose down
docker compose up -d --build
```

---

## File Structure on VPS

```
/root/KuraTe-platform/
├── docker-compose.yml
├── docker-compose.override.yml  (DELETE for production)
├── .env                          (secrets - not in git)
├── server.js
├── package.json
├── daily_backup.sh
├── git_backup.sh
├── backups/
├── KurateCerts/
│   ├── fullchain.pem
│   └── privkey.pem
├── certbot/
│   └── conf/
├── nginx.conf
├── nginx/
│   └── conf.d/
│       └── default.conf
├── public/
├── controllers/
├── models/
├── services/
├── middleware/
├── utils/
├── config/
├── data/
└── scripts/
    ├── deploy-restart.sh
    ├── deploy-extract.sh
    └── ...
```

---

## Environment Variables (.env)

```
NODE_ENV=production
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27018/fullminent
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30

# SMTP
SMTP_HOST=mailout.easymail.ca
SMTP_PORT=587
SMTP_EMAIL=admin@drsrv.net.ar
FROM_EMAIL=admin@drsrv.net.ar
FROM_NAME=Kurate Platform

# EasyDNS DDNS
EASYDNS_USERNAME=drcarloni
EASYDNS_HOSTNAME=kurate.drsrv.net.ar

# Twilio (use .env file)
TWILIO_ACCOUNT_SID=<see .env>
TWILIO_MESSAGING_SERVICE_SID=<see .env>
TWILIO_WHATSAPP_FROM_NUMBER=<see .env>
SMS_ENABLED=true
SMS_ALLOW_NON_PROD=true

# AI (optional)
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:1.7b
AI_TIMEOUT_MS=2000
```

> **WARNING:** Do not commit `.env` to git. It contains API tokens and secrets.
