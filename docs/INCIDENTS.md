# KuraTe Incident History & Prevention

## Known Incidents

### 1. Database Wiped (Aug 7–11, 2026)
- **What**: MongoDB collections empty — only `activitylogs` (70) and `publicipintels` (25) remained
- **Cause**: Docker container recreated without preserving volume data
- **Impact**: All users, services, locations lost. Daily backups from Aug 7–10 captured empty DB (23 bytes each)
- **Fix**: Restored from Aug 11 backup (85KB, seed data)
- **Prevention**: 
  - Verified backup script now checks file size, gzip integrity, and document counts
  - Monitor alerts if any collection drops >20% or hits 0
  - Backup cron runs at 03:00 UTC with integrity checks

### 2. MongoDB Authentication Not Configured for App Container (Aug 13, 2026)
- **What**: App container `MONGO_URI` had no credentials after enabling x509 auth
- **Cause**: docker-compose.yml `environment` block overrode .env, lacked auth
- **Impact**: "command find requires authentication" errors — pre-registration and all DB queries failed
- **Fix**: Updated `MONGO_URI` in docker-compose.yml to include credentials
- **Prevention**: Always test app restart after MongoDB auth changes

### 3. TLS Certificate Mismatch (Aug 13, 2026)
- **What**: Server cert CN was `mongo` (Docker name) — external clients couldn't connect via SSL
- **Cause**: Cert generated without SAN for public IP
- **Impact**: External SSL connections failed
- **Fix**: Regenerated cert with SANs: `DNS:mongo, DNS:localhost, IP:91.208.206.35, IP:127.0.0.1`
- **Prevention**: Always include all hostnames/IPs in SAN when generating certs

### 4. JavaScript Syntax Error Blocking Modal (Aug 13, 2026)
- **What**: Duplicate `});` at line 1282 broke entire script block
- **Cause**: Copy/paste error
- **Impact**: Pre-registration modal auto-opened, close button non-functional
- **Fix**: Removed duplicate bracket
- **Prevention**: Run `node --check` on HTML inline scripts before deploy

## Monitoring Checklist

| Check | Frequency | Script |
|-------|-----------|--------|
| MongoDB doc counts | 5 min | `monitor-events.sh` |
| Container health | 5 min | `monitor-events.sh` |
| Disk space | 5 min | `monitor-events.sh` |
| Backup integrity | Daily 03:00 | `daily-backup-verified.sh` |
| Manual health check | On demand | `check-db-health.sh` |

## Deployment Checklist

Before any infrastructure change:
1. [ ] Backup database (`daily-backup-verified.sh`)
2. [ ] Test changes in local dev first
3. [ ] After docker-compose changes: verify all containers start and connect
4. [ ] After MongoDB auth changes: update ALL MONGO_URI references
5. [ ] After TLS changes: verify both internal and external connections
6. [ ] Run `check-db-health.sh` after changes
7. [ ] Check app logs for errors: `docker logs KuraTe_app --tail 20`
