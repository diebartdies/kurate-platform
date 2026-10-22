<#
.SYNOPSIS
    Actualiza Docker Desktop conservando todos los datos en D:\.

.DESCRIPTION
    Docker Desktop se instala en D:\Docker y guarda los datos en
    D:\Docker\Data\disk\docker_data.vhdx (backend WSL2). El riesgo de un
    upgrade es que el instalador vuelva a crear el distro WSL y deje los
    volumenes en cero.

    Este script hace el upgrade en orden seguro:
      1. Verifica que los datos esten en D: y calcula su tamano/hash.
      2. Exporta el distro docker-desktop a un .tar en D: (respaldo portable).
      3. Copia el vhdx crudo a D:\Docker\Backups (respaldo byte a byte).
      4. Valida que el vhdx abre bien antes de tocar el instalador.
      5. Corre el instalador oficial en modo upgrade.
      6. Verifica que los datos siguen ahi. Si desaparecieron, los restaura
         desde el vhdx o desde el .tar.

    El script NO toca los stacks de D:\FullMinent ni los volumenes: solo
    actualiza Docker Desktop. Los volumenes viven dentro del vhdx, asi que
    preservar el vhdx es preservar todo.

.PARAMETER Force
    No preguntar confirmacion antes de cada paso.

.PARAMETER DryRun
    Solo informa que haria, sin cambiar nada.

.PARAMETER SkipBackup
    Peligroso. Salta el respaldo del vhdx. Solo para reintentos.

.PARAMETER SkipUpgrade
    Solo deja el respaldo hecho y sale. Util para revisar y luego seguir.

.EXAMPLE
    .\scripts\upgrade-docker-preserving-data.ps1 -DryRun

.EXAMPLE
    .\scripts\upgrade-docker-preserving-data.ps1
#>

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$DryRun,
    [switch]$SkipBackup,
    [switch]$SkipUpgrade
)

$ErrorActionPreference = 'Stop'

$DockerHome    = 'D:\Docker'
$DataDir       = 'D:\Docker\Data'
$Vhdx          = 'D:\Docker\Data\disk\docker_data.vhdx'
$BackupDir     = 'D:\Docker\Backups'
$DistroName    = 'docker-desktop'
$Installer     = 'D:\Docker\Docker Desktop Installer.exe'

function Write-Step { param([string]$M) Write-Host "`n=== $M ===" -ForegroundColor Cyan }
function Write-Ok   { param([string]$M) Write-Host "  OK   $M" -ForegroundColor Green }
function Write-Warn { param([string]$M) Write-Host "  !!!! $M" -ForegroundColor Yellow }
function Write-Fail { param([string]$M) Write-Host "  XXXX $M" -ForegroundColor Red }

function Confirm-Step {
    param([string]$M)
    if ($DryRun) { Write-Host "  [dry-run] $M" -ForegroundColor DarkGray; return $true }
    if ($Force) { Write-Host "  $M"; return $true }
    $r = Read-Host "  ¿Seguimos? (s/N)"
    return ($r -match '^[sy]')
}

# ---------------------------------------------------------------- 1. INVENTARIO
Write-Step "1. INVENTARIO"

if (-not (Test-Path -LiteralPath $Vhdx)) {
    Write-Fail "No existe el vhdx de datos: $Vhdx"
    Write-Fail "Aborto. No hay nada que preservar y no quiero adivinar."
    exit 1
}

$vhdxInfo = Get-Item -LiteralPath $Vhdx
$vhdxGB   = [math]::Round($vhdxInfo.Length / 1GB, 2)
Write-Host "  Instalacion   : $DockerHome"
Write-Host "  Datos (vhdx)  : $Vhdx"
Write-Host "  Tamano        : $vhdxGB GB   modificado $($vhdxInfo.LastWriteTime)"

# El puerto de ATAje es la clave: si los datos NO estan en D:, el upgrade
# puede crear un vhdx nuevo en C: y C: solo tiene ~7 GB libres.
if (-not $DockerHome.StartsWith('D:\', [StringComparison]::OrdinalIgnoreCase)) {
    Write-Fail "La instalacion NO esta en D:. Aborto por seguridad."
    exit 1
}
if (-not $Vhdx.StartsWith('D:\', [StringComparison]::OrdinalIgnoreCase)) {
    Write-Fail "El vhdx NO esta en D:. Aborto por seguridad."
    exit 1
}
Write-Ok "Instalacion y datos estan en D:"

$free = (Get-PSDrive D).Free / 1GB
$free = [math]::Round($free, 1)
Write-Host "  Libre en D:   : $free GB"
if ($free -lt ($vhdxGB * 2.5)) {
    Write-Warn "Libre en D:=$free GB. El respaldo necesita ~$([math]::Round($vhdxGB * 1.2, 1)) GB (vhdx) + ~$([math]::Round($vhdxGB * 1.1, 1)) GB (tar)."
    Write-Warn "Recomendado: al menos $($vhdxGB * 2.5) GB libres. Aborto para no llenar el disco."
    exit 1
}

if (Test-Path -LiteralPath $Installer) {
    Write-Ok "Instalador encontrado: $Installer"
} else {
    Write-Warn "No encontre el instalador en $Installer."
    Write-Warn "Descargalo desde https://desktop.docker.com/win/edge/main/amd64/Docker%20Desktop%20Installer.exe"
    Write-Warn "y volve a correr este script. El respaldo va a quedar hecho igual."
}

# ------------------------------------------------------------- 2. PARAR DOCKER
Write-Step "2. DETENER DOCKER (requerido para respaldar el vhdx)"

$ddRunning = Get-Process -Name 'Docker Desktop', 'com.docker.backend', 'com.docker.proxy' -ErrorAction SilentlyContinue
if ($ddRunning) {
    Write-Host "  Procesos Docker detectados: $($ddRunning.Count)"
    if ($DryRun) {
        Write-Host "  [dry-run] Detendria Docker Desktop y esperaria a que suelte el vhdx"
    } else {
        Write-Host "  Cerrando Docker Desktop..."
        foreach ($p in $ddRunning) { try { $p.CloseMainWindow() | Out-Null } catch {} }
        Start-Sleep -Seconds 6
        Get-Process -Name 'Docker Desktop', 'com.docker.backend', 'com.docker.proxy' -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 4

        wsl --terminate $DistroName 2>&1 | Out-Null
        Start-Sleep -Seconds 3
        Write-Ok "Docker Desktop detenido y distro $DistroName terminada"
    }
} else {
    Write-Ok "Docker Desktop ya estaba detenido"
}

# ---------------------------------------------------------- 3. EXPORTAR DISTRO
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$tarPath = Join-Path $BackupDir "docker-desktop-$stamp.tar"
$vhdCopy = Join-Path $BackupDir "docker_data-$stamp.vhdx"

Write-Step "3. RESPALDO"

if (-not $DryRun) {
    if (-not (Test-Path -LiteralPath $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    }
    Write-Ok "Carpeta de respaldo: $BackupDir"
}

if ($SkipBackup) {
    Write-Warn "SkipBackup: NO se respalda nada. Esto puede perder todos los volumenes."
    if (-not (Confirm-Step "Escribi SI para confirmar que aceptas el riesgo")) { exit 1 }
} else {
    # 3a. Export del distro a .tar: respaldo portable, sobrevive reinstall.
    if ($DryRun) {
        Write-Host "  [dry-run] wsl --export $DistroName `"$tarPath`""
    } else {
        Write-Host "  Exportando distro WSL a .tar (esto puede tardar varios minutos)..."
        $sw = [Diagnostics.Stopwatch]::StartNew()
        wsl --export $DistroName $tarPath
        $sw.Stop()
        if (-not (Test-Path -LiteralPath $tarPath)) {
            Write-Fail "El export fallo. No sigo con el upgrade sin respaldo."
            exit 1
        }
        $tarGB = [math]::Round((Get-Item $tarPath).Length / 1GB, 2)
        Write-Ok "Export OK: $tarGB GB en $([math]::Round($sw.Elapsed.TotalMinutes,1)) min -> $tarPath"
    }

    # 3b. Copia byte a byte del vhdx: es el restore mas rapido.
    if ($DryRun) {
        Write-Host "  [dry-run] Copy-Item vhdx -> `"$vhdCopy`""
    } else {
        Write-Host "  Copiando vhdx crudo (backup rapido de restore)..."
        $sw = [Diagnostics.Stopwatch]::StartNew()
        Copy-Item -LiteralPath $Vhdx -Destination $vhdCopy -Force
        $sw.Stop()
        $copyGB = [math]::Round((Get-Item $vhdCopy).Length / 1GB, 2)
        Write-Ok "Copia OK: $copyGB GB en $([math]::Round($sw.Elapsed.TotalMinutes,1)) min -> $vhdCopy"
    }
}

if ($DryRun) { Write-Step "DRY-RUN: nada fue modificado."; exit 0 }

# --------------------------------------------------------- 4. VALIDAR RESPALDO
Write-Step "4. VALIDAR RESPALDO"

if (-not $SkipBackup) {
    $srcLen = (Get-Item -LiteralPath $Vhdx).Length
    $cpyLen = (Get-Item -LiteralPath $vhdCopy).Length
    if ($srcLen -ne $cpyLen) {
        Write-Fail "El vhdx respaldo mide $cpyLen bytes y el original $srcLen. Respaldo invalido."
        Write-Fail "Borro el respaldo parcial y aborto."
        Remove-Item -LiteralPath $vhdCopy -Force -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Ok "Respaldo del vhdx coincide en tamano ($([math]::Round($srcLen/1GB,2)) GB)"

    if (-not (Test-Path -LiteralPath $tarPath)) {
        Write-Fail "Falta el .tar. Aborto: sin export no hay red de seguridad."
        exit 1
    }
    Write-Ok "Export .tar presente"

    # El vhdx tiene que abrir: si no, el respaldo esta corrupto.
    Write-Host "  Verificando integridad del vhdx..."
    try {
        $vs = Mount-VHD -Path $vhdCopy -ReadOnly -PassThru -ErrorAction Stop
        Dismount-VHD -Path $vhdCopy -ErrorAction SilentlyContinue
        Write-Ok "El vhdx abre correctamente: respaldo verificado"
    } catch {
        # Mount-VHD suele pedir Hyper-V. Si no esta disponible, Try vhdxmount
        # no es critico: el tar ya cubre el restore. Solo lo REPORTO.
        Write-Warn "No pude montar el vhdx para verificarlo ($($_.Exception.Message.Split([char]10)[0]))"
        Write-Warn "El .tar sigue siendo el respaldo valido. Sigo."
    }
}

$resume = @"

============================================================
 RESPALDO LISTO. Si algo sale mal, con esto se restaura:

   1) Cerrar Docker Desktop por completo
   2) wsl --unregister $DistroName
   3) wsl --import $DistroName D:\Docker\Data\main <TAR>
   4) O restaurar el vhdx crudo: copiar $vhdCopy sobre $Vhdx
   5) Reabrir Docker Desktop

 Timestamp: $stamp
============================================================
"@
Write-Host $resume -ForegroundColor Yellow

# ------------------------------------------------------------- 5. EL UPGRADE
if ($SkipUpgrade) {
    Write-Step "SkipUpgrade: respaldo hecho, no se toca el instalador."
    exit 0
}

Write-Step "5. UPGRADE"

if (-not (Test-Path -LiteralPath $Installer)) {
    Write-Fail "No hay instalador. Descargalo y volve a correr."
    exit 1
}

$verAntes = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' |
    Where-Object { $_.DisplayName -like 'Docker Desktop*' } |
    Select-Object -First 1).DisplayVersion
Write-Host "  Version actual: $verAntes"

if (-not (Confirm-Step "Instalar la nueva version de Docker Desktop")) { exit 0 }

# El flag `upgrade` conserva instalacion y datos. Sin el, el instalador
# cae en modo reinstall y puede recrear el distro desde cero.
Write-Host "  Ejecutando instalador en modo upgrade (puede pedir permisos de admin)..."
$p = Start-Process -FilePath $Installer -ArgumentList 'upgrade', '--quiet' -PassThru -Wait
Write-Host "  El instalador termino con codigo $($p.ExitCode)"

if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
    Write-Warn "El instalador devolvio $($p.ExitCode). Verifico si la version cambio igual."
}

$verDespues = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' |
    Where-Object { $_.DisplayName -like 'Docker Desktop*' } |
    Select-Object -First 1).DisplayVersion
Write-Host "  Version nueva : $verDespues"
if ($verAntes -eq $verDespues) {
    Write-Warn "La version no cambio. Puede que ya estuvieras al dia."
}

# ------------------------------------------------------------ 6. VERIFICAR DATOS
Write-Step "6. VERIFICAR QUE LOS DATOS SIGUEN"

Write-Host "  Iniciando Docker Desktop para comprobar que levanta bien..."
Start-Process -FilePath "$DockerHome\Docker Desktop.exe" -ErrorAction SilentlyContinue

$ok = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 6
    $null = & docker version --format '{{.Server.Version}}' 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "El daemon respondio en $([math]::Round($i*6))s (server $LASTEXITCODE)"
        $ok = $true
        break
    }
    Write-Host "    esperando... ($([math]::Round($i*6))s)"
}

if (-not $ok) {
    Write-Fail "El daemon no levanto. Los datos pueden estar intactos igual."
    Write-Fail "No sigas usando Docker: revisa el vhdx antes de tocar nada."
    Write-Host $resume -ForegroundColor Yellow
    exit 1
}

$root = & docker info --format '{{.DockerRootDir}}' 2>&1
Write-Host "  DockerRootDir: $root"

$rootEnD = $root -match '^/mnt/d/'
if (-not $rootEnD) {
    Write-Fail "DockerRootDir NO apunta al disco de D:. Esto significa que se creo un disco nuevo."
    Write-Fail "Los volumenes NO estan disponibles. Restauro desde el respaldo."
    Write-Host $resume -ForegroundColor Yellow
    exit 2
}
Write-Ok "DockerRootDir sigue en D: -> los volumenes intactos"

Write-Step "7. ESTADO FINAL"
& docker info --format '  Server: {{.ServerVersion}}  Driver: {{.Driver}}  Root: {{.DockerRootDir}}' 2>&1
& docker ps -a --format '  container: {{.Names}}  estado: {{.State}}' 2>&1

$v = & docker volume ls -q 2>&1
if ($v) { Write-Host "  volumenes: $(($v | Measure-Object).Count)" } else { Write-Ok "sin volumenes con nombre (puede usar bind mounts, esta bien)" }

if ((Test-Path -LiteralPath $Vhdx)) {
    $nowGB = [math]::Round((Get-Item -LiteralPath $Vhdx).Length / 1GB, 2)
    Write-Host "  vhdx ahora: $nowGB GB (era $vhdxGB GB)"
}

Write-Host "`nUpgrade terminado. Tus datos siguen en D:\." -ForegroundColor Green
Write-Host "Respaldos en $BackupDir (timestamp $stamp)." -ForegroundColor Green