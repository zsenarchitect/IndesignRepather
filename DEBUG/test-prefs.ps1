$app = New-Object -ComObject "InDesign.Application.2026"
Write-Host "Version: $($app.Version)"
Write-Host "Name: $($app.Name)"

# Test ScriptPreferences access
try {
    $prefs = $app.ScriptPreferences
    Write-Host "ScriptPreferences object: $prefs"
    Write-Host "ScriptPreferences type: $($prefs.GetType().FullName)"
    $level = $prefs.UserInteractionLevel
    Write-Host "Current UserInteractionLevel: $level"
    $prefs.UserInteractionLevel = 1852403060
    Write-Host "Set to neverInteract: SUCCESS"
    $prefs.UserInteractionLevel = 1699311169
    Write-Host "Restored: SUCCESS"
} catch {
    Write-Host "ScriptPreferences FAILED: $($_.Exception.Message)"
    Write-Host "Trying alternative: app.ScriptPreferences directly..."
    try {
        $app.ScriptPreferences.UserInteractionLevel = 1852403060
        Write-Host "Direct access: SUCCESS"
    } catch {
        Write-Host "Direct access FAILED: $($_.Exception.Message)"
        Write-Host "Trying InvokeSet..."
        try {
            [System.Runtime.InteropServices.Marshal]::GetActiveObject("InDesign.Application.2026").ScriptPreferences.UserInteractionLevel = 1852403060
            Write-Host "GetActiveObject path: SUCCESS"
        } catch {
            Write-Host "GetActiveObject path FAILED: $($_.Exception.Message)"
        }
    }
}
