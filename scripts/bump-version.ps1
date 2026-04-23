param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$indexPath = Join-Path $RepoRoot "index.html"

if (-not (Test-Path $indexPath)) {
    throw "Soubor index.html nebyl nalezen: $indexPath"
}

$content = Get-Content -LiteralPath $indexPath -Raw
$pattern = 'const APP_VERSION = "v(\d+)\.(\d+)";'

if ($content -notmatch $pattern) {
    throw "V index.html jsem nenašel řádek s APP_VERSION."
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
[System.IO.File]::WriteAllText($indexPath, $updatedContent, $utf8NoBom)

Write-Host "Verze aktualizována na $newVersion"
