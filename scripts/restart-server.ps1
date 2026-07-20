Write-Host "Deteniendo KuraTe..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2

Write-Host "Iniciando KuraTe en http://localhost:5001 ..." -ForegroundColor Yellow
Set-Location D:\FullMinent
$job = Start-Job -Name "KuraTe" -ScriptBlock { Set-Location D:\FullMinent; node server.js }
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep 1
  $port = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue
  if ($port) { break }
}
if ($port) { Write-Host "KuraTe corriendo" -ForegroundColor Green } else { Write-Host "Error: no responde" -ForegroundColor Red; Receive-Job -Name KuraTe }
