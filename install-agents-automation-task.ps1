param([string]$Time = '09:00')
$ErrorActionPreference = 'Stop'
if ($Time -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw 'Time must be HH:mm in Pakistan local time.' }
$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Get-Command node -ErrorAction Stop | Out-Null
$dataDir = Join-Path $agentDir 'data'
$configPath = Join-Path $agentDir 'config.json'
$hasCsv = (Test-Path (Join-Path $dataDir 'inbox')) -and @((Get-ChildItem (Join-Path $dataDir 'inbox') -Filter '*.csv' -File)).Count -gt 0
$hasFeed = (Test-Path $configPath) -and [bool]((Get-Content $configPath -Raw | ConvertFrom-Json).feedUrl)
$isMarketplace = (Test-Path $configPath) -and ((Get-Content $configPath -Raw | ConvertFrom-Json).source -eq 'parsebot')
if (-not ($hasCsv -or $hasFeed -or $isMarketplace)) { throw 'Configure a marketplace source, feedUrl, or CSV before scheduling.' }
if ($isMarketplace -and -not [Environment]::GetEnvironmentVariable('PARSE_API_KEY','User')) { throw 'Set PARSE_API_KEY as a Windows user environment variable before scheduling; a shell-only variable is not available to the daily task.' }
$taskName = 'Agents Automation Daily'
$runner = Join-Path $agentDir 'run-agents-automation.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`"" -WorkingDirectory $agentDir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Run the Agents Automation marketplace research workflow once per day' -Force | Out-Null
Write-Host "Installed '$taskName' for $Time local Windows time. Ensure Windows is set to Asia/Karachi."
