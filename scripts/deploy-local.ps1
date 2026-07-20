param(
  [switch]$NoSeed,
  [switch]$NoInstall,
  [switch]$NoBuild
)

$Root = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $env:TEMP "kurate-deploy.log"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  KuraTe - Deploy Local (Docker)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proyecto: $Root" -ForegroundColor Gray
Write-Host "Log:      $LogFile" -ForegroundColor Gray
Write-Host ""

# ─── Paso 1: npm install ─────────────────────────────────────────────────────
if (-not $NoInstall) {
  Write-Host "[1/5] Instalando dependencias host..." -ForegroundColor Yellow
  Write-Host "      npm install (Capacitor CLI, etc.)" -ForegroundColor Gray
  Push-Location $Root
  npm install 2>&1 | Out-File -Append $LogFile
  if ($LASTEXITCODE -ne 0) {
    Write-Host "      FALL. Revisa $LogFile" -ForegroundColor Red
    exit 1
  }
  Pop-Location
  Write-Host "      OK" -ForegroundColor Green
} else {
  Write-Host "[1/5] Skip npm install" -ForegroundColor Gray
}

# ─── Paso 2: Limpiar contenedores viejos ──────────────────────────────────────
Write-Host ""
Write-Host "[2/5] Limpiando contenedores legacy..." -ForegroundColor Yellow
$old = docker ps -a --filter "name=kurate-nginx" --format "{{.Names}}" 2>$null
if ($old) {
  docker rm -f kurate-nginx 2>$null
  Write-Host "      Eliminado: kurate-nginx" -ForegroundColor Gray
}
Write-Host "      OK" -ForegroundColor Green

# ─── Paso 3: Build + levantar stack Docker ────────────────────────────────────
Write-Host ""
Write-Host "[3/5] Buildeando y levantando stack Docker..." -ForegroundColor Yellow
Write-Host "      Servicios: mongo, app, nginx" -ForegroundColor Gray
Write-Host "      Puertos:   27018 (mongo), 5001 (app directo), 8080 (nginx)" -ForegroundColor Gray
Write-Host ""
Write-Host "      docker compose up -d --build" -ForegroundColor DarkGray
Push-Location $Root
docker compose up -d --build 2>&1 | Out-File -Append $LogFile
if ($LASTEXITCODE -ne 0) {
  Write-Host "      FALL. Revisa $LogFile" -ForegroundColor Red
  Pop-Location
  exit 1
}
Pop-Location

# Esperar a que la app este lista
Write-Host ""
Write-Host "      Esperando que la app responda..." -ForegroundColor Gray
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:8080/api/v1/locations/provinces" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Write-Host "." -NoNewline -ForegroundColor Gray
  Start-Sleep 2
}
Write-Host ""

if ($ready) {
  Write-Host ""
  Write-Host "      Stack Docker listo!" -ForegroundColor Green
  Write-Host ""
  Write-Host "      Endpoints:" -ForegroundColor Cyan
  Write-Host "        App (directo):  http://localhost:5001" -ForegroundColor Gray
  Write-Host "        Nginx gateway:  http://localhost:8080" -ForegroundColor Gray
  Write-Host "        API via nginx:  http://localhost:8080/api/v1/..." -ForegroundColor Gray
  Write-Host ""
  Write-Host "      Containers:" -ForegroundColor Cyan
  docker ps --filter "name=KuraTe" --format "        {{.Names}}  {{.Status}}  {{.Ports}}"
} else {
  Write-Host ""
  Write-Host "      La app no respondio despues de 60s." -ForegroundColor Red
  Write-Host "      Logs del app:" -ForegroundColor Red
  docker compose -f (Join-Path $Root "docker-compose.yml") logs app --tail 30
  exit 1
}

# ─── Paso 4: Seed locations ───────────────────────────────────────────────────
if (-not $NoSeed) {
  Write-Host ""
  Write-Host "[4/5] Sembrando ubicaciones (provincias, ciudades, barrios)..." -ForegroundColor Yellow

  # Crear script temporal para contar provincias
  $tempScript = Join-Path $env:TEMP "check-provinces.js"
  @"
const m = require('mongoose');
m.connect('mongodb://mongo:27017/KuraTe').then(() => {
  return m.connection.db.collection('provinces').countDocuments();
}).then(c => {
  console.log(c);
  process.exit(0);
}).catch(() => {
  console.log(0);
  process.exit(1);
});
"@ | Set-Content $tempScript

  $count = docker exec KuraTe_app node -e (Get-Content $tempScript -Raw) 2>$null
  $countNum = 0
  if ($count) { $countNum = [int]($count -replace '\D', '') }

  if (-not $countNum -or $countNum -eq 0) {
    Write-Host "      Base vacia, sembrando..." -ForegroundColor Gray
    docker exec KuraTe_app node scripts/seed-locations.js 2>&1 | Out-File -Append $LogFile
    if ($LASTEXITCODE -ne 0) {
      Write-Host "      FALL. Revisa $LogFile" -ForegroundColor Red
      exit 1
    }
    Write-Host "      24 provincias, 229 ciudades, 47 barrios sembrados" -ForegroundColor Green
  } else {
    Write-Host "      Ya hay $countNum provincias, skip" -ForegroundColor Gray
  }

  Remove-Item $tempScript -ErrorAction SilentlyContinue
} else {
  Write-Host "[4/5] Skip seed" -ForegroundColor Gray
}

# ─── Paso 5: Compilar APK ─────────────────────────────────────────────────────
if (-not $NoBuild) {
  Write-Host ""
  Write-Host "[5/5] Compilando APK para Android..." -ForegroundColor Yellow

  # Detectar IP local
  $localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch 'Loopback|Virtual|Bluetooth' -and $_.PrefixOrigin -ne 'WellKnown'
  }).IPAddress | Select-Object -First 1
  if (-not $localIp) { $localIp = "127.0.0.1" }
  Write-Host "      IP local: $localIp" -ForegroundColor Gray

  # Actualizar capacitor.config.json
  $capConfig = Join-Path $Root "capacitor.config.json"
  $capJson = Get-Content $capConfig -Raw | ConvertFrom-Json
  $capJson.server.url = "http://${localIp}:8080"
  $capJson | ConvertTo-Json | Set-Content $capConfig
  Write-Host "      server.url a http://${localIp}:8080 (nginx gateway)" -ForegroundColor Gray

  # Verificar JDK 21
  $jdk21 = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
  if (-not (Test-Path $jdk21)) {
    Write-Host "      JDK 21 no encontrado" -ForegroundColor Red
    Write-Host "      Instalar: choco install microsoft-openjdk-21 -y" -ForegroundColor Gray
    exit 1
  }
  $env:JAVA_HOME = $jdk21
  $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
  Write-Host "      JAVA_HOME:  $env:JAVA_HOME" -ForegroundColor Gray
  Write-Host "      ANDROID_HOME: $env:ANDROID_HOME" -ForegroundColor Gray

  # Sync Capacitor
  Write-Host "      Sincronizando Capacitor con Android..." -ForegroundColor Gray
  node (Join-Path $Root "node_modules\@capacitor\cli\bin\capacitor") sync android 2>&1 | Out-String

  # Build Gradle
  Write-Host "      Compilando Gradle (assembleDebug)..." -ForegroundColor Gray
  Push-Location (Join-Path $Root "android")
  $gradleResult = .\gradlew.bat assembleDebug --no-daemon 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    Pop-Location
    $apk = Get-ChildItem (Join-Path $Root "android\app\build\outputs\apk\debug\*.apk") | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($apk) {
      $sizeMB = [math]::Round($apk.Length / 1MB, 1)
      Write-Host ""
      Write-Host "      APK generado!" -ForegroundColor Green
      Write-Host "      Ruta: $($apk.FullName)" -ForegroundColor Gray
      Write-Host "      Tamano: ${sizeMB} MB" -ForegroundColor Gray
      Write-Host "      Instalar: adb install -r `"$($apk.FullName)`"" -ForegroundColor Gray
    }
  } else {
    Pop-Location
    Write-Host "      Error al compilar APK. Revisa el log." -ForegroundColor Red
  }
} else {
  Write-Host ""
  Write-Host "[5/5] Skip APK build" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploy completo!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
