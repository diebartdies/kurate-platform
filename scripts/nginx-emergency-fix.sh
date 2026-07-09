#!/bin/bash
# Legacy entry point — use fix-nginx-now.sh
exec bash "$(dirname "$0")/fix-nginx-now.sh" "$@"
