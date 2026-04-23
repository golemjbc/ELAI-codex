param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$appPath = Join-Path $RepoRoot "app.js"

if (-not (Test-Path $appPath)) {
    throw "Soubor app.js nebyl nalezen: $appPath"
}

$content = Get-Content -LiteralPath $appPath -Raw
$pattern = 'const APP_VERSION = "v(\d+)\.(\d+)";'

if ($content -notmatch $pattern) {
    throw "V app.js jsem nenašel řádek s APP_VERSION."
}

$major = [int]$Matches[1]
$minor = [int]$Matches[2] + 1
$newVersion = "v{0}.{1}" -f $major, $minor

$updatedContent = [regex]::Replace(
    $content,
    $pattern,
    "const APP_VERSION = `"$newVersion`";",
    1
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($appPath, $updatedContent, $utf8NoBom)

Write-Host "Verze aktualizována na $newVersion"
