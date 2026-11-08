#!/bin/bash
# KuraTe - Obtiene la IP publica actual
# Salida: imprime SIEMPRE solo la direccion IP en stdout (o nada si falla)
# Uso: PUBLIC_IP=$(bash /ruta/script/get-public-ip.sh)
#
# El cache (.last-public-ip) es solo informativo para el log: NO debe
# condicionar la salida. Si la IP cambia, igual tiene que imprimirse.

PUBLIC_IP_URLS=(
    "https://api.ipify.org"
    "https://ifconfig.me/ip"
    "https://icanhazip.com"
    "https://ident.me"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_FILE="${PUBLIC_IP_CACHE:-$SCRIPT_DIR/../.last-public-ip}"

get_public_ip() {
    local url ip
    for url in "${PUBLIC_IP_URLS[@]}"; do
        ip=$(curl -s --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]') || continue
        if echo "$ip" | grep -qE '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'; then
            echo "$ip"
            return 0
        fi
    done
    return 1
}

PUBLIC_IP=$(get_public_ip)

if [ -z "$PUBLIC_IP" ]; then
    echo "ERROR: No se pudo determinar la IP publica" >&2
    exit 1
fi

# Cache best-effort: nunca debe romper el script ni silenciar la salida.
if [ -n "$CACHE_FILE" ]; then
    echo "$PUBLIC_IP" > "$CACHE_FILE" 2>/dev/null || true
fi

echo "$PUBLIC_IP"
exit 0
