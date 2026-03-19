$app = New-Object -ComObject "InDesign.Application.2026"
Write-Host "Version: $($app.Version)"

# Try DoScript to set UserInteractionLevel
try {
    $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;", 1246973031)
    Write-Host "DoScript (JavaScript): SUCCESS"
    $level = $app.ScriptPreferences.UserInteractionLevel
    Write-Host "Verified level: $level (expected 1852403060)"
} catch {
    Write-Host "DoScript FAILED: $($_.Exception.Message)"
}

# Alternative: just skip setting it and rely on InDesign's silent mode
# The key question: can we still open/enumerate docs without it?
try {
    Write-Host ""
    Write-Host "Testing doc enumeration without neverInteract..."
    $count = $app.Documents.Count
    Write-Host "  Documents: $count"
    if ($count -gt 0) {
        $doc = $app.Documents.Item(1)
        Write-Host "  First doc: $($doc.Name)"
        $linkCount = $doc.Links.Count
        Write-Host "  Links: $linkCount"
        if ($linkCount -gt 0) {
            $link = $doc.Links.Item(1)
            Write-Host "  First link: $($link.Name) - Status: $([int]$link.Status)"
        }
    }
    Write-Host "PASS: Doc/link enumeration works without setting UserInteractionLevel"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}

# Restore
try {
    $app.DoScript("app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;", 1246973031)
} catch {}
