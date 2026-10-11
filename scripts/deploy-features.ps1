<#
.SYNOPSIS
  Deploy por features de KuraTe contra el VPS .95.

.DESCRIPTION
  Sube SOLO los archivos del manifiesto (scripts/deploy-manifest.txt) y ejecuta
  los pasos del deploy en el servidor. No empaqueta el repo entero: el working
  tree tiene cambios de otros features que no van en este deploy.

  Pasos, en orden:
    1. preflight local   (sintaxis de cada archivo del manifiesto)
    2. backup en el VPS  (users, services, professions + el codigo a pisar)
    3. upload            (solo las rutas del manifiesto)
    4. restart + health  (preflight de requires, restart, espera, busca errores)
    5. data              (182 servicios, 22 profesiones, backfill servicePaths)
    6. verify            (conteos, indices, explain)
    7. smoke             (endpoints publicos + admin rechaza sin token)

  Si algo falla, el paso 2 deja la carpeta de backup y el script imprime el
  comando de rollback.

.PARAMETER VpsIp
  IP del VPS. Default 192.168.1.95

.PARAMETER Steps
  Que partes correr. Default 'all'. Alternatives: preflight, backup, upload,
  restart, data, verify, smoke.

.PARAMETER DryRun
  Solo muestra que se sube y que se corre, sin escribir nada.

.EXAMPLE
  .\deploy-features.ps1
  .\deploy-features.ps1 -DryRun
  .\deploy-features.ps1 -Steps verify,smoke

.NOTES
  Para agregar un archivo nuevo a un feature: agregar la ruta a
  scripts/deploy-manifest.txt y volver a correr. No editar este script.
#>
[CmdletBinding()]
param(
  [string]$VpsIp      = "192.168.1.95",
  [string]$VpsUser    = "root",
  [string]$KeyPath    = "$env:USERPROFILE\.ssh\id_kurate_rsa",
  [string]$Manifest   = "",
  [string]$Steps      = "all",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
# PSScriptRoot no llega a tiempo en los defaults del param, se resuelve aca.
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Manifest) { $Manifest = Join-Path $ScriptDir 'deploy-manifest.txt' }
$AppDir = "/root/KuraTe-platform"
$RepoRoot = Split-Path $ScriptDir -Parent

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  OK   $msg" -ForegroundColor Green }
function Write-Bad($msg)  { Write-Host "  FALLA $msg" -ForegroundColor Red }

if (-not (Test-Path -LiteralPath $KeyPath)) { throw "No existe la clave SSH: $KeyPath" }
if (-not (Test-Path -LiteralPath $Manifest)) { throw "No existe el manifiesto: $Manifest" }

# --- leer el manifiesto: ruta + motivo, ignorando comentarios ---------------
$files = @()
foreach ($line in Get-Content -LiteralPath $Manifest) {
  $t = $line.Trim()
  if (-not $t -or $t.StartsWith('#')) { continue }
  $files += [pscustomobject]@{
    Path   = ($t -split '\s+')[0]
    Reason = ($t -replace '^\S+\s*', '').Trim()
  }
}
if ($files.Count -eq 0) { throw "El manifiesto no tiene archivos." }

# -Steps acepta coma O espacio como separador. Hace falta el espacio porque al
# invocar con -File, PowerShell parsea "verify,smoke" como ARRAY y el cast a
# [string] lo une con espacios: "verify smoke". Partir solo por coma daba un
# unico paso inválido y el script reportaba éxito sin ejecutar nada.
# OJO: la variable local NO puede llamarse $steps: PowerShell no distingue mayusculas
# de nombre, asi que $steps = ... sobreescribia el parametro $Steps y el -split
# recibia un unico string "a b c" -> "Paso(s) desconocido(s)".
$stepList = @($Steps -split '[,\s]+' | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
$runAll = $stepList -contains 'all'
function Want($s) { return $runAll -or ($stepList -contains $s) }

# Etapas pedidas que no existen: si solo se paso basura, Want() daria false para
# todo y el script terminaria "ok" sin haber hecho nada. Eso es peor que fallar.
$KNOWN_STEPS = @('all','preflight','backup','upload','restart','data','verify','smoke')
$unknown = @($stepList | Where-Object { $KNOWN_STEPS -notcontains $_ })
if ($unknown.Count -gt 0) {
  throw "Paso(s) desconocido(s): $($unknown -join ', '). Validos: $($KNOWN_STEPS -join ', ')"
}

Write-Step "DEPLOY POR FEATURES -> $VpsIp"
Write-Host "  archivos en el manifiesto: $($files.Count)"
Write-Host "  pasos: $($stepList -join ', ')"
if ($DryRun) { Write-Host "  MODO DRY-RUN: no se escribe nada" -ForegroundColor Yellow }

# --- 1. preflight local ------------------------------------------------------
if (Want 'preflight') {
  Write-Step "1. PREFLIGHT LOCAL (sintaxis)"
  $bad = 0
  $tmpMjs = Join-Path ([IO.Path]::GetTempPath()) ("kurate-check-" + [guid]::NewGuid().ToString('N') + ".mjs")
  try {
    foreach ($f in $files) {
      $abs = Join-Path $RepoRoot $f.Path
      if (-not (Test-Path -LiteralPath $abs)) { Write-Bad "$($f.Path) no existe en el repo"; $bad++; continue }
      if ($f.Path -like '*.js') {
        # Los .js del front son ESM y node --check los toma como CommonJS.
        # Se detectan por import/export: OJO, hay que mirar todo el archivo,
        # i18n.js tiene el primer "export" recien en la linea ~1250 (el dict
        # ocupa los primeros cientos de lineas) y 40 lineas no alcanzan.
        $head = Get-Content -LiteralPath $abs -Raw
        $isEsm = $head -match '(?m)^[ \t]*(import\s|export\s)'
        if ($isEsm) {
          Copy-Item -LiteralPath $abs -Destination $tmpMjs -Force
          node --check $tmpMjs 2>$null
          if ($LASTEXITCODE -ne 0) { Write-Bad "$($f.Path) tiene error de sintaxis (ESM)"; $bad++ }
          else { Write-Ok "$($f.Path) (ESM)" }
        } else {
          node --check $abs 2>$null
          if ($LASTEXITCODE -ne 0) { Write-Bad "$($f.Path) tiene error de sintaxis"; $bad++ }
          else { Write-Ok $f.Path }
        }
      } else {
        $len = (Get-Item -LiteralPath $abs).Length
        if ($len -lt 100) { Write-Bad "$($f.Path) parece vacio ($len bytes)"; $bad++ }
        else { Write-Ok "$($f.Path) ($([math]::Round($len/1KB,1)) KB)" }
      }
    }
  } finally {
    Remove-Item -LiteralPath $tmpMjs -Force -ErrorAction SilentlyContinue
  }
  if ($bad -gt 0) { throw "Preflight fallo con $bad archivo(s). No se sube nada." }
}

# --- helpers de transporte ---------------------------------------------------
$scpArgs = @('-i', $KeyPath, '-o', 'BatchMode=yes')
$sshArgs = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15')

function Invoke-Remote([string]$cmd) {
  $out = & ssh @sshArgs "$VpsUser@$VpsIp" $cmd 2>&1
  return @($out | ForEach-Object { $_.ToString() })
}

# El script remoto y el manifiesto tienen que estar en el servidor antes de
# cualquier paso, no solo cuando se hace backup: si se corre -Steps verify y el
# script no esta ahi, el ssh falla y el deploy recien lo reporta.
function Ensure-RemoteAssets {
  if ($DryRun) { return }
  & scp @scpArgs "$ScriptDir\deploy-remote.sh" "$VpsUser@$VpsIp`:/tmp/deploy-remote.sh" 2>$null
  if ($LASTEXITCODE -ne 0) { throw "No se pudo subir deploy-remote.sh al VPS." }
  & scp @scpArgs $Manifest "$VpsUser@$VpsIp`:$AppDir/scripts/deploy-manifest.txt" 2>$null
  if ($LASTEXITCODE -ne 0) { throw "No se pudo subir el manifiesto al VPS." }
}

# --- 2. backup ---------------------------------------------------------------
if (Want 'backup') {
  Write-Step "2. BACKUP EN EL VPS"
  if ($DryRun) { Write-Host "  (dry-run)" }
  else {
    Ensure-RemoteAssets
    $out = Invoke-Remote "MANIFEST=$AppDir/scripts/deploy-manifest.txt bash /tmp/deploy-remote.sh backup"
    $out | ForEach-Object { Write-Host "  $_" }
    if (-not ($out -match 'carpeta:')) { throw "El backup no devolvio carpeta: no se sigue." }
  }
}

# --- 3. upload ---------------------------------------------------------------
if (Want 'upload') {
  Write-Step "3. UPLOAD (solo el manifiesto)"
  if ($DryRun) {
    $files | ForEach-Object { Write-Host "  (dry-run) $($_.Path)" }
  } else {
    $n = 0
    foreach ($f in $files) {
      $abs = Join-Path $RepoRoot $f.Path
      $dir = Split-Path $f.Path -Parent
      if ($dir -and $dir -ne '.') { Invoke-Remote "mkdir -p '$AppDir/$dir'" | Out-Null }
      & scp @scpArgs $abs "$VpsUser@$VpsIp`:$AppDir/$($f.Path)" 2>$null
      if ($LASTEXITCODE -ne 0) { throw "Fallo al subir $($f.Path)" }
      $n++
      Write-Ok $f.Path
    }
    Write-Host "  subidos: $n archivos"
  }
}

# --- 4..7. pasos en el servidor ---------------------------------------------
$remoteMap = @{
  'restart' = 'restart'
  'data'    = 'data'
  'verify'  = 'verify'
  'smoke'   = 'smoke'
}
$remoteOrder = @('restart', 'data', 'verify', 'smoke')
$labels = @{ 'restart' = '4. RESTART + HEALTH'; 'data' = '5. DATOS'; 'verify' = '6. VERIFY'; 'smoke' = '7. SMOKE' }

foreach ($s in $remoteOrder) {
  if (-not (Want $s)) { continue }
  Write-Step $labels[$s]
  if ($DryRun) { Write-Host "  (dry-run) bash deploy-remote.sh $s"; continue }
  $out = Invoke-Remote "MANIFEST=$AppDir/scripts/deploy-manifest.txt bash /tmp/deploy-remote.sh $s"
  $out | ForEach-Object { Write-Host "  $_" }
  # El script remoto cierra con RESULTADO: OK o RESULTADO: HUBO FALLAS. Si no
  # aparece ninguno, el comando no llego a ejecutarse (falta el script, bash
  # fallo, sin red): eso tambien es un deploy roto.
  if ($out -match 'RESULTADO: HUBO FALLAS') {
    Write-Host ""
    Write-Bad "el paso '$s' fallo. Para volver atras:"
    Write-Host "  ssh -i `"$KeyPath`" $VpsUser@$VpsIp `"bash /tmp/deploy-remote.sh rollback`"" -ForegroundColor Yellow
    throw "Deploy detenido en el paso '$s'."
  }
  if (-not ($out -match 'RESULTADO: OK')) {
    Write-Bad "el paso '$s' no devolvio 'RESULTADO: OK'. El comando remoto no se completo."
    $out | ForEach-Object { Write-Host "    $_" }
    throw "Deploy detenido en el paso '$s'."
  }
}

Write-Step "DEPLOY COMPLETO"
Write-Ok "todo los pasos pasaron"
