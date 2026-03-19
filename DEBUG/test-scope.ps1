# Test: does $app persist after foreach + try/catch?
$app = $null

$progIds = @("InDesign.Application.2026")
foreach ($p in $progIds) {
    try {
        $test = New-Object -ComObject $p
        $v = $test.Version
        if ($v) {
            $script:app = $test
            Write-Host "Inside try: app=$($script:app), version=$v"
            break
        }
    } catch {}
}

Write-Host "Outside foreach: app=$app"
Write-Host "Type: $($app.GetType().FullName)"
Write-Host "Version: $($app.Version)"
Write-Host "ScriptPrefs: $($app.ScriptPreferences.UserInteractionLevel)"
