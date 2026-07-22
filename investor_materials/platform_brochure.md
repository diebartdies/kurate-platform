# KuraTe Platform — Brochure Técnico & Estratégico

> **El motor de confianza para servicios profesionales** — Marketplace production-ready con verificación, búsqueda inteligente y SEO local.

**Web:** https://kurate.drsrv.net.ar · **Contacto:** admin@drsrv.net.ar

---

## Visión

KuraTe es un **sistema operativo completo** para conectar clientes con profesionales de servicios verificados: búsqueda por necesidad, matching inteligente, contacto protegido, directorio por ubicación, y trazabilidad server-side — no un simple listado.

Opera en el vertical de **servicios generales** (hogar, oficina, industria) con potencial de expansión a cualquier rubro profesional cambiando terminología, categorías y reglas.

---

## Arquitectura (resumen)

```
Clientes / Profesionales / Admin
         ↓ HTTPS
    Nginx (SSL, rate limit, admin LAN)
         ↓
    Express 5 API (Node.js)
    ├── Controllers (auth, professionals, hogar, admin, SEO)
    ├── Motores (needMatching, serviceTaxonomy, seoLocations)
    └── ActivityLog (trazabilidad server-side)
         ↓
    MongoDB 4.4 + uploads
         ↓
    SMTP · WhatsApp · Telegram · Twilio SMS
```

---

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | HTML5, CSS3, Vanilla JS ES Modules, i18n ES/EN |
| Backend | Node.js, Express 5, Mongoose 9 |
| Seguridad | Helmet, rate-limit, bcryptjs, JWT httpOnly |
| Gateway | Nginx Alpine + Let's Encrypt (auto-renewal) |
| Datos | MongoDB 4.4 (Docker volume, daily backup) |
| Deploy | Docker Compose, cron automático, git backup |
| Comms | Nodemailer, WhatsApp, Telegram, Twilio SMS |
| SEO | SSR meta, sitemap dinámico, URLs por ubicación (provincia/ciudad/barrio) |
| AI (opcional) | Ollama + Qwen 3 para query understanding (fallback graceful) |

---

## Búsqueda inteligente por necesidad

El usuario describe qué necesita en lenguaje natural:

```
"heladera Gafa no enfria, zona Villa Urquiza"
```

El motor de búsqueda:

1. **Taxonomía de servicios** — matchea contra árbol de categorías (Reparación > Electrodomésticos > Heladeras)
2. **Extracción de keywords** — tokeniza, remueve stop words, extrae palabras clave
3. **Matching por sinónimos** — "heladera" → "refrigerador", "frigider"
4. **Filtro por ubicación** — provincia + ciudad/barrio (regex case-insensitive)
5. **Scoring ponderado** — servicio (+30), bio (+10), ubicación (+15/+10), rating (+5×avg)
6. **AI opcional** — Ollama analiza intención, extrae marca, contexto de urgencia (2s timeout, fallback a taxonomy)

Devuelve top 50 profesionales ordenados por relevancia.

---

## Dos directorios especializados

### Compañantes / Profesionales premium
- Grid de descubrimiento con filtros por calidad, especialidad, ubicación
- Tarjetas con foto, alias, bio, servicios, contacto WhatsApp
- Sistema de calidad: verificados → Standard → Silver → Gold → Premium

### Técnicos hogar/oficina
- Directorio por área (hogar, oficina, pime, industria)
- Filtros: acción, categoría, disponibilidad, servicio, marca
- Contacto vía WhatsApp/Telegram
- Perfilar con servicios, marcas, disponibilidad

---

## Seguridad & trazabilidad

- **Contact shield** — WhatsApp/teléfono vía redirect API, no expuesto en HTML
- **Admin LAN-only** — protección por IP (solo redes privadas)
- **Rate limiting** — API (10 req/s), auth (3 req/s)
- **Guest browsing log** — cada visita anónima registra IP, User-Agent, path
- **JWT httpOnly** — sin cookies de tracking de terceros
- **Re-verificación** — cambios sensibles revierten a pending

---

## SEO local (por provincia/ciudad/barrio)

- URLs amigables: `/acompanantes/buenos-aires/caba`, `/perfil/alias`
- Sitemap dinámico generado desde base de datos
- Meta tags OpenGraph para compartir
- Robots.txt con Allow/Disallow por sección
- SSR meta tags para crawlers

---

## Infraestructura & Deploy

### VPS Oracle Linux 10.2 (192.168.1.67)
- Docker Compose: mongo 4.4 + app + nginx
- SSL: Let's Encrypt + certbot auto-renewal (04:15 UTC diario)
- Backup: MongoDB dump diario (03:00 UTC, retención 7 días)
- Git: backup push dos veces al día (06:00 y 18:00 UTC)
- Certbot: webroot ACME challenge, deploy hook copia cert + reload nginx

### Cron automático
| Hora UTC | Tarea |
|----------|-------|
| 03:00 | MongoDB backup (mongodump --gzip) |
| 04:15 | SSL cert renewal (certbot.timer + jitter 30min) |
| 06:00 | Git backup push |
| 18:00 | Git backup push |

---

## Modelo de negocio

1. **Registro gratuito** — profesionales se registran sin costo
2. **Suscripción mensual** — por categoría (roadmap)
3. **Período de evaluación** — trial 30 días
4. **Publicidad curada** — anuncios premium por zona (roadmap)
5. **Licencia white-label** — reutilizar engine para otros verticales

---

## Verticales reutilizables (white-label)

| Vertical | Adaptación |
|----------|------------|
| Servicios técnicos | Urgencia, disponibilidad, identidad verificada |
| Profesionales liberales | Especialidad, matrícula, verificación |
| Personal trainers | Certificaciones, portfolio, vacaciones |
| Belleza / estética | Fotos portfolio, ubicación por barrio |
| Educación / tutores | Materia, horarios, disponibilidad |
| Salud / médicos | Especialidad, matrícula, turnos |
| Real estate | SEO por zona (ya implementado) |
| Arte / eventos | Trial para nuevos talentos, reviews |

---

## Archivos clave

| Archivo | Propósito |
|---------|-----------|
| `utils/aiSearch.js` | Query understanding vía Ollama (opcional) |
| `utils/needMatching.js` | Taxonomía + keyword extraction |
| `utils/serviceTaxonomy.js` | Árbol de categorías de servicios |
| `utils/seoSitemap.js` | Generación dinámica de sitemap |
| `utils/seoLocations.js` | URLs por ubicación (provincia/ciudad) |
| `controllers/professionalController.js` | Búsqueda, scoring, directorio |
| `scripts/install-all-crons.sh` | Instalador one-shot de todos los crons |
| `scripts/certbot/issue-domain.sh` | Emisión/re-emisión de certificados SSL |
| `daily_backup.sh` | Backup MongoDB vía Docker |
| `AGENTS.md` | Documentación operativa del agente |

---

*Brochure v1.0 — Julio 2026*
