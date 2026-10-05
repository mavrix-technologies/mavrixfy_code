param(
  [ValidateSet('idle', 'audio-mini', 'audio-expanded', 'video', 'paused', 'background')]
  [string]$Scenario = 'audio-mini',
  [ValidateRange(1, 3600)][int]$DurationSeconds = 300,
  [ValidateRange(1, 60)][int]$IntervalSeconds = 15,
  [string]$Serial,
  [string]$Package = 'com.mavrixfy.app',
  [string]$AdbPath = (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $AdbPath)) { throw "ADB not found: $AdbPath" }
$onlineDevices = @(& $AdbPath devices | Select-String '^([^\s]+)\s+device$' | ForEach-Object { $_.Matches[0].Groups[1].Value })
if (-not $Serial) {
  if ($onlineDevices.Count -ne 1) { throw 'Connect one ADB device, or specify -Serial for an online device.' }
  $Serial = $onlineDevices[0]
}
if ($Serial -notin $onlineDevices) { throw 'The selected ADB device is not online.' }

function Read-Adb([string[]]$Arguments) {
  $result = @(& $AdbPath -s $Serial @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "ADB command failed: $($Arguments -join ' ')" }
  return ($result -join "`n")
}

$taskRoot = Split-Path -Parent $PSScriptRoot
$capturePath = Join-Path $taskRoot ("outputs\performance\{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $Scenario)
New-Item -ItemType Directory -Path $capturePath -Force | Out-Null
$isEmulator = (Read-Adb @('shell', 'getprop', 'ro.kernel.qemu')).Trim() -eq '1'
$device = [ordered]@{
  scenarioLabel = $Scenario
  package = $Package
  model = (Read-Adb @('shell', 'getprop', 'ro.product.model')).Trim()
  api = (Read-Adb @('shell', 'getprop', 'ro.build.version.sdk')).Trim()
  emulator = $isEmulator
  limitation = 'Scenario is a user-provided label. Battery temperature is not CPU temperature. Emulator readings cannot establish real-phone heat or battery drain. CPU/PSS are dumpsys samples, not FPS or tap latency.'
}
$device | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $capturePath 'device.json') -Encoding UTF8
(Read-Adb @('shell', 'dumpsys', 'package', $Package)) | Set-Content -LiteralPath (Join-Path $capturePath 'package.txt') -Encoding UTF8
(Read-Adb @('shell', 'dumpsys', 'gfxinfo', $Package, 'framestats')) | Set-Content -LiteralPath (Join-Path $capturePath 'frames-before.txt') -Encoding UTF8

Write-Output "Capturing $Scenario for $DurationSeconds seconds. Keep the app in that scenario; this script only reads device state."
if ($isEmulator) { Write-Output 'Emulator capture: thermal and battery readings are not physical measurements.' }
$watch = [Diagnostics.Stopwatch]::StartNew()
$samples = [Collections.Generic.List[object]]::new()
do {
  $stamp = Get-Date -Format 'HHmmss-fff'
  $battery = Read-Adb @('shell', 'dumpsys', 'battery')
  $memory = Read-Adb @('shell', 'dumpsys', 'meminfo', $Package)
  $cpu = Read-Adb @('shell', 'dumpsys', 'cpuinfo')
  $battery | Set-Content -LiteralPath (Join-Path $capturePath "$stamp-battery.txt") -Encoding UTF8
  $memory | Set-Content -LiteralPath (Join-Path $capturePath "$stamp-memory.txt") -Encoding UTF8
  $cpu | Set-Content -LiteralPath (Join-Path $capturePath "$stamp-cpu.txt") -Encoding UTF8
  (Read-Adb @('shell', 'dumpsys', 'thermalservice')) | Set-Content -LiteralPath (Join-Path $capturePath "$stamp-thermal.txt") -Encoding UTF8
  $temperatureMatch = [regex]::Match($battery, '(?m)^\s*temperature:\s*(\d+)')
  $levelMatch = [regex]::Match($battery, '(?m)^\s*level:\s*(\d+)')
  $pssMatch = [regex]::Match($memory, 'TOTAL PSS:\s*([\d,]+)')
  $cpuMatch = [regex]::Match($cpu, ('(?m)^\s*([\d.]+)%\s+\d+/{0}(?:\s|:)' -f [regex]::Escape($Package)))
  $samples.Add([pscustomobject]@{
    elapsedSeconds = [Math]::Round($watch.Elapsed.TotalSeconds, 1)
    timeUtc = (Get-Date).ToUniversalTime().ToString('o')
    batteryCelsius = if ($temperatureMatch.Success) { [double]$temperatureMatch.Groups[1].Value / 10 } else { $null }
    batteryPercent = if ($levelMatch.Success) { [int]$levelMatch.Groups[1].Value } else { $null }
    appPssKiB = if ($pssMatch.Success) { [long]($pssMatch.Groups[1].Value -replace ',', '') } else { $null }
    appCpuPercent = if ($cpuMatch.Success) { [double]::Parse($cpuMatch.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture) } else { $null }
  })
  $remaining = $DurationSeconds - $watch.Elapsed.TotalSeconds
  if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int]([Math]::Min($IntervalSeconds, $remaining) * 1000)) }
} while ($watch.Elapsed.TotalSeconds -lt $DurationSeconds)

$samples | Export-Csv -LiteralPath (Join-Path $capturePath 'samples.csv') -NoTypeInformation -Encoding UTF8
(Read-Adb @('shell', 'dumpsys', 'gfxinfo', $Package, 'framestats')) | Set-Content -LiteralPath (Join-Path $capturePath 'frames-after.txt') -Encoding UTF8
(Read-Adb @('shell', 'dumpsys', 'activity', 'services', $Package)) | Set-Content -LiteralPath (Join-Path $capturePath 'services.txt') -Encoding UTF8
Write-Output "Saved $($samples.Count) samples to $capturePath"
