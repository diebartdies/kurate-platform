param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Files)
$key = "C:\Users\Administrator\.ssh\id_kurate_rsa"
$h = "root@192.168.1.95"
foreach ($f in $Files) {
    scp -i $key -o StrictHostKeyChecking=no $f "${h}:/root/KuraTe-platform/$f" | Out-Null
    if ($LASTEXITCODE -eq 0) { "OK   $f" } else { "FAIL $f" }
}
