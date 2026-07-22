#!/bin/bash
# KuraTe Platform — Nginx reload hook for certbot
# Purpose: Called automatically by certbot after any successful certificate renewal.
# It tells the nginx container to reload its configuration (and pick up the new SSL cert).
# This script runs inside the host, not inside the nginx container.
# Project: KuraTe — Professional services marketplace (kurate.drsrv.net.ar)

cd /root/KuraTe-platform && docker compose exec nginx nginx -s reload
