$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$kartNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $kartNode) {
    $kartRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $kartRuntime) { & $kartRuntime 'scripts/lan.mjs'; exit $LASTEXITCODE }
    throw 'Install Node.js 24 or newer, then run this launcher again.'
}
& $kartNode.Source 'scripts/lan.mjs'
