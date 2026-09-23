$ErrorActionPreference = 'Stop'
$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PARSE_API_KEY = [Environment]::GetEnvironmentVariable('PARSE_API_KEY','User')
$logDir = Join-Path $agentDir 'data'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Set-Location $agentDir
& node (Join-Path $agentDir 'src/run.mjs') *>> (Join-Path $logDir 'agents-automation.log')
exit $LASTEXITCODE
