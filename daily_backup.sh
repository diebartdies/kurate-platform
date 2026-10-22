#!/bin/bash
# Backup diario de MongoDB (corre por cron a las 03:00 UTC).
#
# Genera un mongodump --archive --gzip y lo valida ANTES de darlo por bueno:
#   1) exit code de mongodump == 0
#   2) tamano minimo razonable (un archive valido de KuraTe son varios MB; un
#      dump fallido puede dejar un .gz de pocos bytes que supera el chequeo -s)
#   3) mongorestore --dryRun: confirma que el archivo es un archive legible
# Si algo de eso falla, borra el archivo y sale con error (el cron lo registra
# en el log), en vez de dejar un "backup" que no restaura.
set -u

BACKUP_DIR=/root/KuraTe-platform/backups
MIN_BYTES=10240   # 10 KB: por debajo, seguro es un dump vacio/roto
DB_URI='mongodb://kurateApp:Kurate2026Secure!@localhost:27017/KuraTe?authSource=admin'
ADMIN_URI='mongodb://kurateApp:Kurate2026Secure!@localhost:27017/?authSource=admin'

mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/mongo_$DATE.gz"
ERR=/tmp/kurate_backup_err.log

docker exec KuraTe_mongo mongodump --archive --gzip --uri="$DB_URI" > "$OUT" 2>"$ERR"
RC=$?

# 1) exit code
if [ "$RC" -ne 0 ]; then
  echo "[$DATE] FAILED backup (mongodump rc=$RC). Error:"
  tail -5 "$ERR"
  rm -f "$OUT"
  exit 1
fi

# 2) tamano minimo
SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  echo "[$DATE] FAILED backup (archivo muy chico: ${SIZE} bytes). Error:"
  tail -5 "$ERR"
  rm -f "$OUT"
  exit 1
fi

# 3) restaurabilidad (dryRun no escribe: solo valida el archive).
# OJO: mongorestore con el archive por STDIN (docker exec ... < "$OUT") falla
# con "Failed: EOF" porque el stdin del exec no transporta el archivo. Hay que
# copiarlo DENTRO del contenedor y restaurarlo con --archive=<path>.
docker cp "$OUT" KuraTe_mongo:/tmp/kurate_verify.gz >/dev/null 2>&1
if ! docker exec KuraTe_mongo mongorestore --archive=/tmp/kurate_verify.gz --gzip --dryRun \
       --nsInclude='KuraTe.*' --uri="$ADMIN_URI" >/dev/null 2>"$ERR"; then
  echo "[$DATE] FAILED backup (el archive no restaura). Error:"
  tail -5 "$ERR"
  docker exec KuraTe_mongo rm -f /tmp/kurate_verify.gz >/dev/null 2>&1
  rm -f "$OUT"
  exit 1
fi
docker exec KuraTe_mongo rm -f /tmp/kurate_verify.gz >/dev/null 2>&1

find "$BACKUP_DIR" -name "mongo_*.gz" -mtime +7 -delete
echo "[$DATE] Backup OK: $(du -h "$OUT" | awk '{print $1}') y restaurable"
