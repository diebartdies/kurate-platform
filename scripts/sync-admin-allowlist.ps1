# Keeps the admin allowlist in host nginx in sync with the dynamic public IP.
# Flow: detect public IP -> run EasyDNS updater (scripts/update-dyndns.js) ->
# patch the marked `allow` line in D:\nginx\conf\nginx.conf -> reload nginx.
# Scheduled via the "KuraTe-DDNS-Update" task (every 15 min, SYSTEM).
# Marker in nginx.conf:  allow <ip>; # admin-public-ip (auto-synced ...)

$ErrorActionPreference = 'Stop'
$RepoDir = 'D:\FullMinent'
$NginxConf = 'D:\nginx\conf\nginx.conf'
$NginxExe = 'D:\nginx\nginx.exe'
$LogFile = 'D:\nginx\logs\allowlist-sync.log'

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    $line | Out-File -FilePath $LogFile -Append -Encoding utf8
}

function Get-PublicIp {
    $urls = @('https://api.ipify.org', 'https://icanhazip.com', 'https://ifconfig.me/ip')
    foreach ($u in $urls) {
        try {
            $ip = (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 15).Content.Trim()
            if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') { return $ip }
        } catch { }
    }
    return $null
}

try {
    $ip = Get-PublicIp
    if (-not $ip) { Log 'SKIP: could not determine public IP'; exit 0 }

    # Keep DNS fresh too (writes scripts/.dyndns-lastip.json on change).
    try {
        & node "$RepoDir\scripts\update-dyndns.js" 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8
    } catch { Log "dyndns updater error: $($_.Exception.Message)" }

    $markerEsc = [regex]::Escape('# admin-public-ip (auto-synced')
    $lines = Get-Content -LiteralPath $NginxConf
    if (@($lines | Where-Object { $_ -match $markerEsc }).Count -eq 0) {
        Log 'ERROR: marker line not found in nginx.conf (expected "# admin-public-ip (auto-synced")'
        exit 1
    }
    $changedFrom = $null
    $lines = $lines | ForEach-Object {
        if ($_ -match $markerEsc -and $_ -match 'allow\s+(\d{1,3}(?:\.\d{1,3}){3});') {
            if ($Matches[1] -ne $ip) {
                $changedFrom = $Matches[1]
                $_ -replace 'allow\s+\d{1,3}(?:\.\d{1,3}){3};', "allow $ip;"
            } else { $_ }
        } else { $_ }
    }
    if (-not $changedFrom) { Log "OK: allowlist already $ip"; exit 0 }
    Set-Content -LiteralPath $NginxConf -Value ($lines -join "`r`n") -Encoding utf8NoBOM
    & $NginxExe -t -p 'D:\nginx\' -c 'conf/nginx.conf' 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { Log 'ERROR: nginx config test failed, NOT reloading'; exit 1 }
    & $NginxExe -s reload -p 'D:\nginx\' -c 'conf/nginx.conf' 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8
    Log "UPDATED: allowlist $changedFrom -> $ip, nginx reloaded"
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
