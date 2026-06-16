# Add Windows Firewall Rule for Python Backend
# Run this script as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Adding Firewall Rule for Backend" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host ""
    Write-Host "Right-click on PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "Then run this script again." -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}

Write-Host "✅ Running as Administrator" -ForegroundColor Green
Write-Host ""

# Remove existing rule if it exists
Write-Host "Removing old rule if exists..." -ForegroundColor Yellow
Remove-NetFirewallRule -DisplayName "Mavrixfy Backend (Port 8000)" -ErrorAction SilentlyContinue

# Add new rule
Write-Host "Adding new firewall rule..." -ForegroundColor Yellow
try {
    New-NetFirewallRule `
        -DisplayName "Mavrixfy Backend (Port 8000)" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 8000 `
        -Action Allow `
        -Profile Any `
        -Description "Allow inbound connections to Mavrixfy YouTube Music backend on port 8000"
    
    Write-Host ""
    Write-Host "✅ SUCCESS! Firewall rule added" -ForegroundColor Green
    Write-Host ""
    Write-Host "Backend is now accessible from network." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Backend should already be running (check other terminal)" -ForegroundColor White
    Write-Host "2. Reload your app (press 'r' in Expo terminal)" -ForegroundColor White
    Write-Host "3. Try opening lyrics (tap 🎵 icon)" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: Failed to add firewall rule" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    pause
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
pause
