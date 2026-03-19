$progIds = @(
    "InDesign.Application.2026",
    "InDesign.Application.2025",
    "InDesign.Application"
)

foreach ($p in $progIds) {
    Write-Host "Trying $p..."

    # Method 1: GetActiveObject
    try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject($p)
        Write-Host "  GetActiveObject: SUCCESS"
        $ver = $app.Version
        Write-Host "  Version: $ver"
        Write-Host "  CONNECTED via GetActiveObject with $p"
        exit 0
    } catch {
        Write-Host "  GetActiveObject: FAILED - $($_.Exception.Message)"
    }

    # Method 2: New-Object
    try {
        $app = New-Object -ComObject $p
        Write-Host "  New-Object: created"
        $ver = $app.Version
        Write-Host "  Version: $ver"
        Write-Host "  CONNECTED via New-Object with $p"
        exit 0
    } catch {
        Write-Host "  New-Object: FAILED - $($_.Exception.Message)"
    }
}

Write-Host "ALL METHODS FAILED"
exit 1
