#!/bin/bash
# Deploy por features contra el VPS. Corre DENTRO del servidor.
#
#   bash deploy-remote.sh backup      # solo backup
#   bash deploy-remote.sh restart     # reinicio + health check
#   bash deploy-remote.sh data        # servicios + profesiones + backfill
#   bash deploy-remote.sh verify      # indices + estado + explain
#   bash deploy-remote.sh smoke       # endpoints publicos
#   bash deploy-remote.sh rollback <carpeta_backup>   # volver atras
#
# El orden correcto de un deploy completo es:
#   1) deploy-features.ps1  (sube los archivos del manifiesto y llama a este
#                            script con "all")
#   2) si algo falla, rollback con la carpeta que backup imprimio.
#
# Los archivos ya estan subidos cuando corre "restart": el upload lo hace el
# .ps1 del lado de Windows.
set -u

APP="${APP_DIR:-/root/KuraTe-platform}"
# Contenedor de la app (node) y contenedor de mongo (trae mongodump/mongorestore).
# Son distintos: la imagen de la app NO tiene las utilidades de mongo.
CONTAINER="${CONTAINER:-KuraTe_app}"
MONGO="${MONGO_CONTAINER:-KuraTe_mongo}"
# Health check interno: 127.0.0.1 y no "localhost", porque en este contenedor
# localhost resuelve a ::1 (IPv6) y node escucha solo en IPv4 (0.0.0.0).
INTERNAL="${INTERNAL:-http://127.0.0.1:5000}"
WEB="${WEB:-https://kurate.drsrv.net.ar}"
cd "$APP" || { echo "ERROR: no existe $APP"; exit 1; }

say() { echo; echo "=== $* ==="; }
ok()  { echo "  OK   $*"; }
bad() { echo "  FALLA  $*"; FAIL=1; }
FAIL=0

# ---------------------------------------------------------------- backup
do_backup() {
  say "1) BACKUP"
  URI=$(grep -o "mongodb://[^']*" "$APP/daily_backup.sh" 2>/dev/null | head -1)
  if [ -z "$URI" ]; then bad "no se pudo leer la URI de mongodump desde daily_backup.sh"; return 1; fi

  STAMP=$(date -u +%Y-%m-%dT%H-%M-%S)
  OUT="$APP/data/_predeploy-$STAMP"
  mkdir -p "$OUT" || return 1
  ok "carpeta: $OUT"

  for col in users services professions; do
    # mongodump corre en el contenedor de MONGO, no en el de la app.
    if docker exec "$MONGO" mongodump --quiet --archive --gzip \
         --uri="$URI" --collection="$col" > "$OUT/$col.gz" 2>/tmp/bk_$col.log; then
      if [ -s "$OUT/$col.gz" ]; then ok "$col: $(du -h "$OUT/$col.gz" | cut -f1)"
      else bad "$col: dump vacio"; fi
    else
      bad "$col: mongodump fallo"
    fi
  done

  # Codigo: todo lo que este en el manifiesto, por si hay que volver.
  mkdir -p "$OUT/code"
  n=0
  while read -r f; do
    case "$f" in ''|\#*) continue;; esac
    f=$(echo "$f" | awk '{print $1}')
    if [ -f "$f" ]; then
      mkdir -p "$OUT/code/$(dirname "$f")"
      cp "$f" "$OUT/code/$f"
      n=$((n+1))
    fi
  done < "$MANIFEST"
  ok "codigo respaldado: $n archivos"

  echo "$OUT" > /tmp/kurate_last_backup
  ok "dejar rollback con: bash deploy-remote.sh rollback $OUT"
}

# --------------------------------------------------------------- restart
do_restart() {
  say "2) REINICIO Y HEALTH CHECK"
  # Antes de reiniciar, que los modulos carguen: un require roto deja el
  # contenedor en crash-loop y eso SI es una caida.
  echo "  preflight de requires:"
  for f in server.js models/User.js models/Profession.js \
           controllers/professionalController.js controllers/adminController.js \
           controllers/adminReportController.js controllers/avisoController.js \
           controllers/aiController.js \
           utils/servicePathMatch.js utils/matriculaRules.js utils/aiAdvice.js \
           utils/otraBrand.js \
           data/serviceTree.js; do
    if [ -f "$f" ]; then
      docker exec "$CONTAINER" node --check "/app/$f" >/dev/null 2>&1 \
        && echo "    OK   $f" || { echo "    MAL  $f"; FAIL=1; }
    else
      echo "    FALTA $f"; FAIL=1
    fi
  done
  [ "$FAIL" -ne 0 ] && { bad "preflight fallo: no se reinicia"; return 1; }

  # Todos los requires de server.js tienen que existir, o el server no levanta.
  echo "  requires de server.js:"
  missing=0
  for r in $(grep -oE "require\('\./[^']+'\)" server.js | sed "s/require('//;s/')//" | sort -u); do
    found=""
    for ext in .js /index.js ''; do
      [ -f "$r$ext" ] && { found=1; break; }
    done
    [ -z "$found" ] && { echo "    FALTA $r"; missing=$((missing+1)); }
  done
  if [ "$missing" -gt 0 ]; then
    bad "server.js require $missing modulo(s) inexistente(s). Subilos antes de reiniciar."
    return 1
  fi
  ok "todos los requires de server.js existen"

  docker restart "$CONTAINER" >/dev/null
  ok "contenedor reiniciado"

  for i in $(seq 1 30); do
    st=$(docker inspect "$CONTAINER" --format '{{.State.Status}}' 2>/dev/null)
    if [ "$st" = "running" ]; then
      if docker exec "$CONTAINER" sh -c \
           "wget -qO- $INTERNAL/api/v1/health >/dev/null 2>&1" 2>/dev/null; then
        ok "sano en $((i*2))s"
        break
      fi
    fi
    [ "$i" -eq 30 ] && { bad "el contenedor no respondio el health en 60s"; return 1; }
    sleep 2
  done

  since=$(docker inspect "$CONTAINER" --format '{{.State.StartedAt}}')
  n=$(docker logs --since "$since" "$CONTAINER" 2>&1 | grep -icE "Cannot find module|SyntaxError|MODULE_NOT_FOUND")
  if [ "$n" -eq 0 ]; then ok "0 errores de modulo/sintaxis desde el arranque"
  else bad "$n errores de modulo/sintaxis"; docker logs --since "$since" "$CONTAINER" 2>&1 | tail -20; fi

  docker inspect "$CONTAINER" --format '  RestartCount={{.RestartCount}}' | sed 's/^/  /'
  return 0
}

# ------------------------------------------------------------------ data
do_data() {
  say "3) DATOS: servicios, profesiones, backfill"
  docker exec "$CONTAINER" mkdir -p /app/scripts

  # scripts/* del manifiesto (por si el feature trae algun script nuevo).
  while read -r f; do
    case "$f" in ''|\#*) continue;; esac
    f=$(echo "$f" | awk '{print $1}')
    case "$f" in
      scripts/*) docker cp "$f" "$CONTAINER:/app/$f" >/dev/null 2>&1 && echo "    copiado /app/$f" ;;
    esac
  done < "$MANIFEST"

  # Los scripts de datos viven en $APP/scripts del host, pero NO estan montados
  # en el contenedor (docker cp, no bind). Hay que copiarlos SIEMPRE, aparte del
  # manifiesto: si no, un deploy cuyo manifiesto no los incluye (p.ej. solo
  # data/serviceTree.js) corre contra un /app/scripts viejo o inexistente y el
  # "sync" no hace nada. Eso fue exactamente el bug que dejo services en 191.
  echo
  echo "  copiando scripts de datos al contenedor:"
  for s in sync-service-tree.js seed-professions.js backfill-service-paths.js; do
    if [ -f "$APP/scripts/$s" ]; then
      docker cp "$APP/scripts/$s" "$CONTAINER:/app/scripts/$s" >/dev/null 2>&1 \
        && echo "    copiado /app/scripts/$s" || bad "no se pudo copiar $s"
    else
      bad "falta $APP/scripts/$s"
    fi
  done
  [ "$FAIL" -ne 0 ] && { bad "faltan scripts de datos: no se corre el sync"; return 1; }

  echo
  echo "  servicios (dry-run primero):"
  docker exec "$CONTAINER" node /app/scripts/sync-service-tree.js 2>&1 \
    | grep -E "dispositivos|services en mongo|nuevos a insertar|huerfanos|eliminados|dry-run" \
    | sed 's/^/    /'
  echo "  aplicando:"
  # El exit code del sync importa: si el script no existe o tira error, un grep
  # vacio haria pasar el paso como OK sin haber aplicado nada. Por eso se guarda
  # la salida y se valida que aparezca "aplicado" o "dry-run" (nada que aplicar).
  out_sync=$(docker exec "$CONTAINER" node /app/scripts/sync-service-tree.js --apply 2>&1)
  sync_rc=$?
  echo "$out_sync" | grep -E "aplicado|services ahora|nuevos a insertar" | sed 's/^/    /'
  # Casos validos: rc=0 y (aplico cambios "aplicado") o (no habia nada: el
  # script, con 0 ops, no imprime "aplicado" pero si "nuevos a insertar: 0"). Si
  # no aparece ninguna de las dos, el script no corrio (ausente / error de
  # sintaxis con rc anulado por el pipe de grep de arriba).
  if [ "$sync_rc" -ne 0 ]; then
    bad "sync-service-tree fallo (rc=$sync_rc)"
    echo "$out_sync" | tail -5 | sed 's/^/      /'
  elif echo "$out_sync" | grep -qE "aplicado|nuevos a insertar: *0"; then
    ok "sync-service-tree OK"
  else
    bad "sync-service-tree no aplico ni reporto nada (posible script ausente)"
    echo "$out_sync" | tail -5 | sed 's/^/      /'
  fi

  echo
  echo "  profesiones:"
  docker exec "$CONTAINER" node /app/scripts/seed-professions.js 2>&1 \
    | grep -E "Active professions|Reguladas|Deactivated" | sed 's/^/    /'

  echo
  echo "  backfill servicePaths (dry-run):"
  docker exec "$CONTAINER" node /app/scripts/backfill-service-paths.js 2>&1 \
    | grep -E "perfiles con servicios|cache a escribir|hogarProfile.servicePaths:|professionalProfile.servicePaths:|perfiles a actualizar|DRY-RUN" \
    | sed 's/^/    /'
  echo "  aplicando:"
  docker exec "$CONTAINER" node /app/scripts/backfill-service-paths.js --apply 2>&1 \
    | grep -E "escrito|verificacion" | sed 's/^/    /'
}

# ---------------------------------------------------------------- verify
do_verify() {
  say "4) VERIFICACION: datos, indices, explain"
  docker exec "$CONTAINER" node -e '
const m = require("mongoose");
(async () => {
  await m.connect(process.env.MONGO_URI);
  const db = m.connection.db;
  const c = async (n,q) => db.collection(n).countDocuments(q||{});
  const out = {
    users: await c("users"),
    services: await c("services"),
    professions: await c("professions"),
    reguladas: await c("professions", { regulated: true, active: true }),
    cacheHogar: await c("users", { "hogarProfile.servicePaths": { $exists: true } }),
    cacheProf: await c("users", { "professionalProfile.servicePaths": { $exists: true } }),
    indicesUsers: (await db.collection("users").indexes()).length
  };
  console.log("    " + JSON.stringify(out));
  await m.disconnect();
})().catch(e => { console.log("    ERROR " + e.message); process.exit(1); });
' 2>&1 | grep -vE 'injected|MONGODB|trace-warn'

  echo
  echo "  explain() de la busqueda:"
  docker exec "$CONTAINER" node -e '
const m = require("mongoose");
(async () => {
  await m.connect(process.env.MONGO_URI);
  const db = m.connection.db;
  const casos = [
    ["hogar depth3", { "hogarProfile.servicePaths": { $in: ["hogar/linea-blanca/heladera"] }, role: "professional" }],
    ["hogar depth2", { "hogarProfile.servicePaths": { $in: ["hogar/linea-blanca"] }, role: "professional" }],
    ["solo matriculados", { "hogarProfile.professions.matriculado": true, role: "professional" }],
    ["gasista matriculado", { "professionalProfile.professions.slug": "gasista", "professionalProfile.professions.matriculado": true, role: "professional" }]
  ];
  let collscan = 0;
  for (const [n, q] of casos) {
    const ex = await db.collection("users").find(q).explain("executionStats");
    const wp = JSON.stringify(ex.queryPlanner.winningPlan);
    const es = ex.executionStats || {};
    const idx = wp.match(/"indexName":"([^"]+)"/);
    if (wp.includes("COLLSCAN")) collscan++;
    console.log("    " + n.padEnd(20) + (wp.includes("COLLSCAN") ? "COLLSCAN" : "IXSCAN").padEnd(9) +
      " keys=" + String(es.totalKeysExamined).padStart(4) +
      " docs=" + String(es.totalDocsExamined).padStart(4) + " n=" + es.nReturned);
  }
  console.log(collscan ? "    ALERTA: " + collscan + " consulta(s) sin indice" : "    todas las consultas usan indice");
  await m.disconnect();
})().catch(e => { console.log("    ERROR " + e.message); process.exit(1); });
' 2>&1 | grep -vE 'injected|MONGODB|trace-warn'
}

# ----------------------------------------------------------------- smoke
do_smoke() {
  say "5) SMOKE TEST DE ENDPOINTS"
  for u in "/api/v1/health" "/api/v1/professions" \
           "/api/v1/hogar/professionals?area=hogar" \
           "/api/v1/hogar/professionals?area=hogar&service=hogar%2Flinea-blanca%2Fheladera" \
           "/api/v1/hogar/professionals?area=hogar&matriculado=1"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$WEB$u" 2>/dev/null)
    if [ "$code" = "200" ]; then ok "200  $u"; else bad "$code  $u"; fi
    sleep 1
  done

  # Los endpoints de admin tienen que rechazar sin token: si Contestan 200 es
  # que el reporte quedo expuesto.
  for u in "/api/v1/admin/reporte-performance"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$WEB$u" 2>/dev/null)
    if [ "$code" = "401" ] || [ "$code" = "403" ]; then ok "$code  $u (rechazado sin token, correcto)"
    else bad "$code  $u -- deberia ser 401/403"; fi
    sleep 1
  done
}

# --------------------------------------------------------------- rollback
do_rollback() {
  DIR="${1:-}"
  [ -z "$DIR" ] && DIR=$(cat /tmp/kurate_last_backup 2>/dev/null)
  [ -z "$DIR" ] || [ ! -d "$DIR/code" ] && { echo "ERROR: backup no encontrado ($DIR)"; exit 1; }
  say "ROLLBACK desde $DIR"
  ( cd "$DIR/code" && find . -type f -exec cp --parents {} "$APP/" \; )
  ok "codigo restaurado"
  echo "  restaurando colecciones..."
  URI=$(grep -o "mongodb://[^']*" "$APP/daily_backup.sh" | head -1)
  for col in users services professions; do
    [ -s "$DIR/$col.gz" ] || continue
    docker exec "$MONGO" mongorestore --quiet --drop --archive --gzip \
      --uri="$URI" --nsInclude="KuraTe.$col" < "$DIR/$col.gz" 2>/dev/null \
      && ok "$col restaurada" || bad "$col: mongorestore fallo"
  done
  do_restart && do_verify
}

MANIFEST="${MANIFEST:-$APP/scripts/deploy-manifest.txt}"
[ -f "$MANIFEST" ] || MANIFEST="$APP/deploy-manifest.txt"

case "${1:-all}" in
  backup)   do_backup ;;
  restart)  do_restart ;;
  data)     do_data ;;
  verify)   do_verify ;;
  smoke)    do_smoke ;;
  rollback) do_rollback "${2:-}" ;;
  all)
    do_backup   || exit 1
    do_restart  || exit 1
    do_data
    do_verify
    do_smoke
    ;;
  *) echo "uso: $0 {backup|restart|data|verify|smoke|rollback|all}"; exit 2 ;;
esac

echo
if [ "$FAIL" -ne 0 ]; then
  echo "RESULTADO: HUBO FALLAS. Para volver atras:"
  echo "  bash deploy-remote.sh rollback $(cat /tmp/kurate_last_backup 2>/dev/null)"
  exit 1
fi
echo "RESULTADO: OK"
