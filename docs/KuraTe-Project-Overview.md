# KuraTe — Platform Overview & Technical Documentation

**Version:** 1.0.0  
**Domain:** kurate.drsrv.net.ar  
**Last Updated:** July 2026  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Objectives](#2-project-objectives)
3. [Main Benefits](#3-main-benefits)
4. [Architecture Overview](#4-architecture-overview)
5. [Technology Stack](#5-technology-stack)
6. [Search System](#6-search-system)
7. [Infrastructure & Deployment](#7-infrastructure--deployment)
8. [Development History](#8-development-history)

---

## 1. Executive Summary

KuraTe is a **professional services marketplace** platform connecting clients with verified technicians and professionals across Argentina. Originally forked from the SexAppeal platform (an escort/adult services directory), KuraTe was rebranded and restructured to serve the **home services and technical repair industry** — covering areas like appliance repair, office equipment maintenance, industrial machinery, and rural property upkeep.

The platform operates as a **two-sided marketplace**:
- **Professionals** register, create profiles, list services/equipment brands they repair, and receive client connections
- **Clients** search by service type, equipment brand, location, and availability to find the right professional

---

## 2. Project Objectives

### Primary Goals

| Objective | Description |
|---|---|
| **Marketplace for Technical Services** | Connect clients with verified professionals for appliance repair, office maintenance, industrial services, and rural property upkeep |
| **Brand-Specific Search** | Allow users to search by specific equipment brand (e.g., "Samsung Heladera") and find professionals who repair that exact brand or the equipment generically |
| **Geographic Coverage** | Full Argentina coverage: 24 provinces, 404 cities, 47 CABA neighborhoods with SEO-optimized location pages |
| **Professional Verification** | Multi-step verification: DNI OCR, document upload, admin review, gesture verification, phone verification |
| **Monetization** | Subscription-based model with trial periods, invoicing, late fees (2%), and payment tracking |
| **WhatsApp Integration** | Direct client-professional connection via WhatsApp (both web.js QR mode and Twilio Business API) |
| **SEO Domination** | Server-rendered location pages, XML sitemaps, and structured data for organic traffic acquisition |
| **Mobile-Ready** | Capacitor wrapping for Android/iOS native apps from the same web codebase |

### Secondary Goals

- **Outreach Automation**: WhatsApp and SMS campaigns to recruit new professionals
- **AI-Assisted Search**: Natural language query parsing for free-text search
- **Admin Dashboard**: Complete back-office for verification, payments, logs, and outreach management
- **Disaster Recovery**: Documented DR process with automated backups and deployment scripts

---

## 3. Main Benefits

### For Clients

| Benefit | Details |
|---|---|
| **Find the Right Professional** | Search by service type, equipment brand, location, and availability |
| **Brand Matching** | Exact brand matches ranked higher; generic equipment matches still shown as alternatives |
| **Verified Professionals** | DNI verification, document review, admin approval before listing |
| **Direct Contact** | WhatsApp integration for instant communication |
| **Location-Based** | Province/city filtering with neighboring province suggestions |
| **Ratings & Reviews** | Community feedback system with 1-5 star ratings |

### For Professionals

| Benefit | Details |
|---|---|
| **Free Trial** | 30-day trial period to test the platform |
| **Profile Management** | Full dashboard for bio, photos, services, working hours, vacation settings |
| **Service Taxonomy** | Predefined service tree: 4 areas × 6 categories × 23+ devices × 20 brands each |
| **Lead Generation** | Appear in search results, receive WhatsApp connections |
| **Payment Tracking** | Invoice history, payment uploads, subscription status |
| **Multi-Profile Support** | Both `professionalProfile` and `hogarProfile` for different service contexts |

### For the Platform

| Benefit | Details |
|---|---|
| **Scalable Architecture** | Docker containerization, MongoDB, Nginx reverse proxy |
| **SEO Traffic** | 400+ location pages, XML sitemaps, structured data |
| **Automated Operations** | Cron jobs for backups, billing, email reminders, SEO refresh |
| **Security** | Rate limiting, JWT auth, CORS, HTTPS, admin IP restrictions |
| **Analytics** | Activity logs, photo click tracking, search analytics, statistics |

---

## 4. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                              │
│   (Browser / Capacitor Android / Capacitor iOS)              │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    NGINX (Port 80/443)                       │
│   • SSL Termination (Let's Encrypt)                         │
│   • Rate Limiting (10 req/s API, 3 req/s auth)              │
│   • Admin Route Restriction (LAN-only)                      │
│   • WebSocket Support                                       │
│   • HTTP → HTTPS Redirect                                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP (internal)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                EXPRESS APP (Port 5001)                       │
│                                                             │
│   Middleware Stack:                                          │
│   ├── express.json() (100MB limit)                          │
│   ├── helmet() (security headers)                           │
│   ├── cors() (origin whitelist)                             │
│   ├── Rate Limiters (strict/admin/read)                     │
│   ├── JWT Authentication                                    │
│   └── Guest Activity Tracker                                │
│                                                             │
│   Route Groups:                                             │
│   ├── /api/v1/auth/*        (Authentication)                │
│   ├── /api/v1/professionals/* (Search & Profiles)           │
│   ├── /api/v1/services/*    (Service Taxonomy)              │
│   ├── /api/v1/hogar/*       (Home Services)                 │
│   ├── /api/v1/admin/*       (Admin Panel)                   │
│   ├── /api/v1/feedback/*    (Ratings)                       │
│   ├── /api/v1/reviews/*     (Reviews)                       │
│   ├── /api/v1/locations/*   (Geography)                     │
│   └── /api/v1/support/*     (Support Tickets)               │
│                                                             │
│   Background Tasks:                                         │
│   ├── Guest session cleanup (hourly)                        │
│   ├── Trial expiration reminders (daily)                    │
│   ├── Billing/invoice engine (daily)                        │
│   ├── Photo upgrade enforcement (daily)                     │
│   ├── Feedback poll emails (hourly)                         │
│   └── SEO location refresh (daily)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ MongoDB Protocol
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              MONGODB 4.4 (Port 27018)                        │
│                                                             │
│   Collections:                                              │
│   ├── users (100 docs) — Core user data + profiles          │
│   ├── services (71 docs) — Service taxonomy tree            │
│   ├── cities (404 docs) — Argentine cities                  │
│   ├── provinces (24 docs) — Argentine provinces             │
│   ├── neighborhoods (47 docs) — CABA neighborhoods          │
│   ├── reviews — User reviews                                │
│   ├── feedbacks — Feedback/ratings                          │
│   ├── activitylogs — User activity                          │
│   ├── statistics — Daily contact stats                      │
│   ├── connections — Client-professional connections          │
│   ├── connectionrequests — Guest connection requests         │
│   ├── preregistrations — Pre-registration flow              │
│   ├── potential_professionals — Outreach leads              │
│   ├── specialties — Professional specialties                │
│   ├── whatsappinboundmessages — WhatsApp inbound            │
│   ├── whatsappoutboundmessages — WhatsApp outbound          │
│   ├── support_messages — Support tickets                    │
│   ├── interestnotes — Content/news                          │
│   └── publicipintels — IP intelligence cache                │
└─────────────────────────────────────────────────────────────┘
```

### Service Taxonomy (4 Areas)

```
┌─────────────────────────────────────────────────────────────┐
│                    SERVICE TREE                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HOGAR (23 devices, 6 categories)                          │
│  ├── Línea Blanca: Heladera, Freezer, Lavarropas,          │
│  │   Secarropa, Cocina, Horno, Microondas, Campana,        │
│  │   Lavavajillas, Calefactor                              │
│  ├── Línea Marrón: Heladera, Freezer, etc.                  │
│  ├── Climatización: Aire Acondicionado, etc.                │
│  ├── Electricidad, Plomería, Gas, Herramientas              │
│  └── 6 categories total                                    │
│                                                             │
│  OFICINA (16 devices, 6 categories)                        │
│  ├── Linea Blanca de Oficina: Frigobar, etc.                │
│  ├── Conectividad, Climatización, Seguridad                 │
│  └── 6 categories total                                    │
│                                                             │
│  INDUSTRIA (16 devices, 6 categories)                      │
│  ├── Línea Industrial: Compresores, etc.                    │
│  ├── Automatización, Electricidad Industrial                 │
│  └── 6 categories total                                    │
│                                                             │
│  CAMPO (16 devices, 6 categories)                          │
│  ├── Riego, Bombas, Energía Solar                          │
│  └── 6 categories total                                    │
│                                                             │
│  Total: 71 devices × ~20 brands each = ~1,400 service paths│
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Technology Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 22 (Alpine) | Runtime environment |
| **Express** | 5.2.1 | Web framework (Express 5) |
| **MongoDB** | 4.4 | Primary database |
| **Mongoose** | 8.24.1 | MongoDB ODM |
| **JWT** | 9.0.3 | Authentication tokens |
| **bcryptjs** | 3.0.3 | Password hashing |
| **Helmet** | 8.1.0 | Security headers |
| **Multer** | 1.4.5 | File upload handling |
| **Sharp** | 0.33.2 | Image processing/compression |
| **Nodemailer** | 9.0.1 | Email delivery (SMTP) |
| **Puppeteer** | 25.0.4 | Headless browser (SEO prerendering) |
| **Tesseract.js** | 7.0.0 | OCR (DNI validation) |

### Frontend

| Technology | Purpose |
|---|---|
| **Vanilla HTML/CSS/JS** | Static pages (no framework build step) |
| **Capacitor 8.4** | Mobile app wrapper (Android + iOS) |

### Communication

| Technology | Purpose |
|---|---|
| **Twilio SDK 6.0** | WhatsApp Business API + SMS |
| **whatsapp-web.js 1.34** | WhatsApp QR client automation |
| **Telegram Bot API** | Telegram outreach |
| **Google OAuth 2.0** | Social login |

### Infrastructure

| Technology | Purpose |
|---|---|
| **Docker** | Containerization (3-service stack) |
| **Docker Compose** | Multi-container orchestration |
| **Nginx** | Reverse proxy, SSL termination, rate limiting |
| **Let's Encrypt** | SSL certificates (auto-renewal) |
| **Ubuntu 22.04** | VPS operating system |
| **UFW** | Firewall (ports 22/80/443) |

### DevOps

| Technology | Purpose |
|---|---|
| **PowerShell** | Deployment scripts (Windows → VPS) |
| **Cron** | Automated backups, billing, SEO refresh |
| **certbot** | SSL certificate management |
| **Git** | Version control |

---

## 6. Search System

### Search Architecture

The search system is the core of the marketplace, connecting clients with professionals based on multiple criteria.

#### Search Flow

```
Client Request
     │
     ▼
┌─────────────────────────────────────────┐
│  1. QUERY PARSING                       │
│  ├── Structured: dropdown selections    │
│  │   (area → category → device → brand) │
│  └── Free-text: AI-assisted parsing     │
│      (analyzeQuery → buildSearchPlan)   │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  2. MONGODB FILTER                      │
│  ├── Base: role=professional, active    │
│  ├── Location: province/city regex      │
│  ├── Service: path/name matching        │
│  └── Brand: service path contains brand │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  3. SCORING (JavaScript)                │
│  ├── Action match:         5 pts        │
│  ├── Urgency match:        5 pts        │
│  ├── Service match:       30 pts        │
│  ├── Bio keywords:        10 pts        │
│  ├── Brand (exact):       25 pts        │
│  ├── Brand (generic):     12 pts        │
│  ├── Model (exact):       25 pts        │
│  ├── Model (generic):     12 pts        │
│  ├── Location (province): 15 pts        │
│  ├── Location (city):      7 pts        │
│  └── Rating bonus:     avg×2 pts        │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  4. RANKING & FILTERING                 │
│  ├── Remove zero-score results          │
│  ├── Remove brand/model required match  │
│  ├── Filter: pct >= 50%                 │
│  └── Sort: pct desc → score desc        │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  5. SUGGESTIONS (when few results)      │
│  ├── Expand location (barrio → CABA)    │
│  ├── Expand to province                 │
│  ├── Neighboring provinces              │
│  ├── Relax brand filter                 │
│  └── Relax model filter                 │
└─────────────────────────────────────────┘
```

### Brand Matching Logic

When a user specifies a brand (e.g., "Samsung"):

| Match Type | Score | Description |
|---|---|---|
| **Exact Brand Match** | 25 pts (100%) | Professional has "Samsung" in services or bio |
| **Generic Equipment Match** | 12 pts (50%) | Professional repairs same device type (e.g., heladera) but without Samsung specifically |
| **No Match** | 0 pts | Professional doesn't repair that equipment → filtered out |

This ensures:
- Samsung specialists appear first (highest score)
- General heladera repairers still appear (lower score)
- Unrelated professionals are excluded

### Weight Distribution

```
Total Possible Score (with brand + model):
  Action:           5 pts  ( 4%)
  Urgency:          5 pts  ( 4%)
  Service:         30 pts  (21%)
  Bio:             10 pts  ( 7%)
  Brand:           25 pts  (18%)
  Model:           25 pts  (18%)
  Location:        15 pts  (11%)
  Rating:          max ~10 pts ( 7%)
  ─────────────────────────────
  Total:          ~125 pts (100%)

Total Possible Score (without brand/model):
  Same but brand + model excluded from total
  → percentages are higher for service-focused searches
```

---

## 7. Infrastructure & Deployment

### VPS Configuration

| Property | Value |
|---|---|
| **VPS IP** | 192.168.1.67 (internal) |
| **Public IP** | 181.91.83.196 (via router NAT) |
| **Domain** | kurate.drsrv.net.ar |
| **OS** | Ubuntu 22.04.5 LTS |
| **Docker** | 29.6.2 + Compose v5.3.1 |
| **SSH Key** | RSA 4096-bit (`id_kurate_rsa`) |

### Docker Stack

| Service | Container | Port | Purpose |
|---|---|---|---|
| **mongo** | KuraTe_mongo | 27018→27017 | MongoDB 4.4 (WiredTiger 0.25GB) |
| **app** | KuraTe_app | internal | Node.js 22 application |
| **nginx** | KuraTe_nginx | 80, 443 | Reverse proxy + SSL |

### Cron Jobs (VPS)

| Schedule | Script | Purpose |
|---|---|---|
| `0 3 * * *` | `daily_backup.sh` | MongoDB dump + 7-day retention |
| `15 4 * * *` | `certbot renew` | SSL certificate renewal |
| `0 6,18 * * *` | `git push` | Code backup to GitHub |
| `0 * * * *` | Guest cleanup | Remove anonymous users > 24h |
| `0 * * * *` | Feedback emails | Send rating requests 7 days post-contact |
| `0 3 * * *` | Billing engine | Generate invoices, apply late fees |
| `0 3 * * *` | SEO refresh | Update location page registry |

### Deployment Process

```
1. Local Build
   └── deploy-vps.ps1
       ├── Tar project files
       ├── SCP to VPS /tmp/
       ├── SHA256 verification
       ├── Docker build (with optional Twilio)
       └── Docker compose up -d

2. SSL Setup (first time)
   └── certbot certonly --nginx -d kurate.drsrv.net.ar
       └── Auto-renewal via cron + deploy hook

3. Database Operations
   ├── seed-locations.js  (24 provinces, 404 cities, 47 neighborhoods)
   ├── seed-services.js   (71 devices, ~1400 brand paths)
   └── seed-hogar-techs.js (initial professional profiles)
```

---

## 8. Development History

### Phase 1: Foundation (SexAppeal → KuraTe Rebrand)

| Task | Status |
|---|---|
| Fork SexAppeal-platform codebase | ✅ Done |
| Rebrand to KuraTe | ✅ Done |
| MongoDB setup + Docker stack | ✅ Done |
| Express 5 + Mongoose 8 migration | ✅ Done |
| JWT authentication + Google OAuth | ✅ Done |
| Admin panel + verification workflow | ✅ Done |

### Phase 2: Search & Discovery

| Task | Status |
|---|---|
| Service taxonomy (4 areas × 6 categories) | ✅ Done |
| Cascading dropdowns (area → category → device → brand) | ✅ Done |
| Brand-specific search with scoring | ✅ Done |
| Generic equipment fallback (partial brand score) | ✅ Done |
| Location-based filtering (province/city) | ✅ Done |
| AI-assisted free-text search | ✅ Done |
| Search suggestions (relax brand/location) | ✅ Done |

### Phase 3: Infrastructure & DevOps

| Task | Status |
|---|---|
| Docker Compose (mongo + app + nginx) | ✅ Done |
| SSL via Let's Encrypt (auto-renewal) | ✅ Done |
| Nginx reverse proxy + rate limiting | ✅ Done |
| Automated backups (daily mongodump) | ✅ Done |
| Deployment script (Windows → VPS) | ✅ Done |
| Disaster Recovery documentation | ✅ Done |
| GitHub push with secret scanning | ✅ Done |

### Phase 4: Data & SEO

| Task | Status |
|---|---|
| Province/city seeding (24/404) | ✅ Done |
| CABA deduplication (426→404) | ✅ Done |
| Service tree seeding (71 devices) | ✅ Done |
| SEO location pages | ✅ Done |
| XML sitemaps | ✅ Done |
| robots.txt | ✅ Done |

### Phase 5: Local Development

| Task | Status |
|---|---|
| docker-compose.dev.yml (port 5002) | ✅ Done |
| Production dump → local restore | ✅ Done |
| Local dev environment working | ✅ Done |

### Current State

- **Production**: Live at kurate.drsrv.net.ar (VPS 192.168.1.67)
- **Local Dev**: Running on localhost:5002 (Docker)
- **Database**: 100 users, 71 services, 404 cities, 24 provinces
- **Search**: Fully functional with brand matching + generic fallback
- **Git**: Squashed commits, force-pushed to master

---

## Appendix A: Key Files Reference

| File | Path | Purpose |
|---|---|---|
| server.js | `D:\FullMinent\server.js` | Main Express app (796 lines) |
| professionalController.js | `D:\FullMinent\controllers\professionalController.js` | Search + profiles (1798 lines) |
| Service.js | `D:\FullMinent\models\Service.js` | Service taxonomy model |
| Arbol-entoro-categoria-dispositio-macas.txt | `D:\FullMinent\public\docs\` | JSON service tree |
| docker-compose.yml | `D:\FullMinent\docker-compose.yml` | Production stack |
| docker-compose.dev.yml | `D:\FullMinent\docker-compose.dev.yml` | Development stack |
| Kurate_DR_Recovery.md | `D:\FullMinent\docs\` | Disaster recovery guide |
| .env.example | `D:\FullMinent\.env.example` | Environment variables template |

---

## Appendix B: API Endpoints Summary

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/professionals` | Public | List professionals |
| GET | `/api/v1/professionals/search` | Public | Search with filters |
| GET | `/api/v1/services` | Public | Service taxonomy |
| GET | `/api/v1/services/brands` | Public | Brand list by path |
| GET | `/api/v1/locations/provinces` | Public | Province list |
| POST | `/api/v1/auth/register` | Public | User registration |
| POST | `/api/v1/auth/login` | Public | User login |
| PUT | `/api/v1/professionals/me/updateprofile` | Professional | Update profile |
| POST | `/api/v1/support` | Professional | Create support ticket |
| GET | `/api/v1/admin/*` | Admin (LAN) | Admin operations |

---

*Document generated from KuraTe platform codebase analysis — July 2026*
