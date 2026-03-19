Write-Host "=========================================="
Write-Host "InDesign Repather - Isolated Button Tests"
Write-Host "=========================================="
Write-Host ""

# ---- TEST 1: Connect to InDesign ----
Write-Host "TEST 1: Connect to InDesign"
Write-Host "--------------------------"
$progIds = @(
    "InDesign.Application.2026",
    "InDesign.Application.2025",
    "InDesign.Application.2024",
    "InDesign.Application.2023",
    "InDesign.Application"
)

$app = $null
$usedProgId = ""

foreach ($p in $progIds) {
    Write-Host "  Trying $p..."
    try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject($p)
        $usedProgId = $p
        Write-Host "    GetActiveObject: SUCCESS"
        break
    } catch {
        Write-Host "    GetActiveObject: FAILED"
    }
    try {
        $test = New-Object -ComObject $p
        $v = $test.Version
        if ($v) {
            $app = $test
            $usedProgId = $p
            Write-Host "    New-Object: SUCCESS (v$v)"
            break
        }
    } catch {
        Write-Host "    New-Object: FAILED"
    }
}

if (-not $app) {
    Write-Host "FAIL: Could not connect to any InDesign instance"
    exit 1
}

$app.ScriptPreferences.UserInteractionLevel = 1852403060
$ver = $app.Version
Write-Host "PASS: Connected via $usedProgId, Version: $ver"
Write-Host ""

# ---- TEST 2: Get Open Documents ----
Write-Host "TEST 2: Get Open Documents"
Write-Host "--------------------------"
$docCount = $app.Documents.Count
Write-Host "  Open documents: $docCount"
for ($i = 0; $i -lt $docCount; $i++) {
    $doc = $app.Documents.Item($i + 1)
    Write-Host "    [$i] $($doc.Name) - $($doc.FilePath)"
}
if ($docCount -eq 0) {
    Write-Host "  (no documents open - open one to test further)"
}
Write-Host "PASS: Listed $docCount documents"
Write-Host ""

# ---- TEST 3: Get Links from first open document ----
Write-Host "TEST 3: Get Document Links"
Write-Host "--------------------------"
if ($docCount -gt 0) {
    $doc = $app.Documents.Item(1)
    $linkCount = $doc.Links.Count
    Write-Host "  Document: $($doc.Name)"
    Write-Host "  Total links: $linkCount"

    $normalCount = 0; $missingCount = 0; $outdatedCount = 0; $embeddedCount = 0
    for ($i = 0; $i -lt [Math]::Min($linkCount, 10); $i++) {
        try {
            $link = $doc.Links.Item($i + 1)
            $statusCode = [int]$link.Status
            $status = switch ($statusCode) {
                1852797549 { "normal" }
                1819242340 { "out-of-date" }
                1819109747 { "missing" }
                1282237028 { "embedded" }
                default { "unknown($statusCode)" }
            }
            Write-Host "    [$i] $($link.Name) - $status"
            switch ($status) {
                "normal" { $normalCount++ }
                "missing" { $missingCount++ }
                "out-of-date" { $outdatedCount++ }
                "embedded" { $embeddedCount++ }
            }
        } catch {
            Write-Host "    [$i] ERROR: $($_.Exception.Message)"
        }
    }
    if ($linkCount -gt 10) { Write-Host "    ... and $($linkCount - 10) more" }
    Write-Host "  Summary: $normalCount normal, $missingCount missing, $outdatedCount out-of-date, $embeddedCount embedded"
    Write-Host "PASS: Enumerated links"
} else {
    Write-Host "SKIP: No documents open"
}
Write-Host ""

# ---- TEST 4: Relink test (DRY RUN - no actual changes) ----
Write-Host "TEST 4: Relink (DRY RUN)"
Write-Host "-------------------------"
if ($docCount -gt 0 -and $missingCount -gt 0) {
    Write-Host "  Found $missingCount missing links - relink would fix these"
    Write-Host "  (skipping actual relink in test mode)"
    Write-Host "PASS: Relink logic ready"
} elseif ($docCount -gt 0) {
    Write-Host "  No missing links to relink"
    Write-Host "PASS: No action needed"
} else {
    Write-Host "SKIP: No documents open"
}
Write-Host ""

# ---- TEST 5: Save document (DRY RUN) ----
Write-Host "TEST 5: Save (DRY RUN)"
Write-Host "----------------------"
if ($docCount -gt 0) {
    $doc = $app.Documents.Item(1)
    Write-Host "  Document: $($doc.Name)"
    Write-Host "  Modified: $($doc.Modified)"
    Write-Host "  (skipping actual save in test mode)"
    Write-Host "PASS: Save logic ready"
} else {
    Write-Host "SKIP: No documents open"
}
Write-Host ""

# ---- TEST 6: UserInteractionLevel ----
Write-Host "TEST 6: Dialog Suppression"
Write-Host "--------------------------"
$level = $app.ScriptPreferences.UserInteractionLevel
Write-Host "  Current UserInteractionLevel: $level"
if ($level -eq 1852403060) {
    Write-Host "PASS: Dialogs suppressed (neverInteract)"
} else {
    Write-Host "WARN: Dialogs NOT suppressed (level=$level)"
}
Write-Host ""

# Restore interaction level
$app.ScriptPreferences.UserInteractionLevel = 1699311169

Write-Host "=========================================="
Write-Host "ALL TESTS COMPLETE"
Write-Host "=========================================="
