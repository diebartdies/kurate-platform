# KuraTe Platform — Agent Context

## Project
KuraTe — Professional services marketplace (kurate.drsrv.net.ar). Fork of SexAppeal-platform rebranded to general services.

## Infrastructure
- **VPS**: 192.168.1.67 (Oracle Linux 10.2, root SSH via id_kurate_rsa)
- **Domain**: kurate.drsrv.net.ar → 181.91.83.196 (public IP via router NAT)
- **Docker stack**: mongo 4.4 (port 27018), app (node), nginx (80/443)

## NAT / Firewall Rules (CRITICAL for SSL cert renewal)
- **Router NAT 80**: forward TCP port 80 external → 192.168.1.67:80 internal (ACME challenge)
- **Router NAT 443**: forward TCP port 443 external → 192.168.1.67:443 internal
- **VPS firewall**: if on internal network, open port 80 on VPS firewall (ufw/iptables) so nginx can serve ACME challenge files

Without port 80 from internet, Let's Encrypt cannot verify domain ownership and certbot will fail.

## Scheduled Tasks (via install-all-crons.sh)
- 03:00 UTC — MongoDB backup (cron /etc/cron.d/KuraTe-daily-backup)
- 04:15 UTC — SSL cert renewal (systemd certbot.timer, 30min jitter)
- 06:00 UTC — Git backup push
- 18:00 UTC — Git backup push

## SSL Cert Flow
- certbot issues cert → writes to certbot/conf/live/kurate.drsrv.net.ar/
- deploy hook copies fullchain.pem + privkey.pem → KurateCerts/
- nginx reads from KurateCerts/ (/etc/nginx/certs/)
- certbot.timer auto-renews daily at 04:15 UTC

## Key Files
- daily_backup.sh — MongoDB dump via docker exec, 7-day retention
- scripts/install-all-crons.sh — one-shot setup for all scheduled tasks
- scripts/certbot/issue-domain.sh — issue/renew cert via webroot ACME
- scripts/certbot/install-systemd.sh — install certbot systemd timer
- certbot/conf/renewal-hooks/deploy/reload-nginx.sh — deploy hook
