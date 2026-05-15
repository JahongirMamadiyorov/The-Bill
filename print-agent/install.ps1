$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Clear-Host
Write-Host ""
Write-Host "  #############################################" -ForegroundColor Cyan
Write-Host "   THE BILL - Kitchen Print Agent Setup" -ForegroundColor Cyan
Write-Host "  #############################################" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Printer settings (IP, stations) are managed from" -ForegroundColor Gray
Write-Host "  the website: Settings -> Printers" -ForegroundColor Gray
Write-Host "  You only need your login credentials here." -ForegroundColor Gray
Write-Host ""

# Check Node.js
Write-Host "  Checking Node.js..." -ForegroundColor Yellow
$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCheck) {
    Write-Host ""
    Write-Host "  ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host "  Download from https://nodejs.org then run install.bat again." -ForegroundColor Yellow
    Write-Host ""
    Start-Process "https://nodejs.org"
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
$nodeVer = & node --version
Write-Host "  Node.js $nodeVer found." -ForegroundColor Green
Write-Host ""

# Step 1 - Login credentials only
Write-Host "  --- Login credentials ---" -ForegroundColor Cyan
Write-Host ""
$identifier = Read-Host "  Email or phone number"
$password   = Read-Host "  Password"
Write-Host ""

# Write config.json (credentials only - printers come from DB)
$configContent = @"
{
  "backendUrl": "https://the-bill-backend.onrender.com",
  "identifier": "$identifier",
  "password": "$password"
}
"@

$configPath = Join-Path $ScriptDir "config.json"
[System.IO.File]::WriteAllText($configPath, $configContent, [System.Text.Encoding]::UTF8)
Write-Host "  config.json saved." -ForegroundColor Green

# Install npm dependencies
Write-Host ""
Write-Host "  Installing dependencies..." -ForegroundColor Yellow
& npm install
Write-Host "  Done." -ForegroundColor Green

# Install PM2
Write-Host ""
Write-Host "  Installing PM2..." -ForegroundColor Yellow
& npm install -g pm2
Write-Host "  Done." -ForegroundColor Green

# Install pm2-windows-startup
Write-Host ""
Write-Host "  Setting up Windows auto-start..." -ForegroundColor Yellow
& npm install -g pm2-windows-startup
& pm2-startup install
Write-Host "  Done." -ForegroundColor Green

# Stop any existing instance
Write-Host ""
& pm2 stop TheBill-PrintAgent 2>&1 | Out-Null
& pm2 delete TheBill-PrintAgent 2>&1 | Out-Null

# Start the agent
Write-Host "  Starting print agent..." -ForegroundColor Yellow
& pm2 start index.js --name TheBill-PrintAgent --time
& pm2 save
Write-Host "  Started." -ForegroundColor Green

Write-Host ""
Write-Host "  #############################################" -ForegroundColor Green
Write-Host "   DONE! Print agent is running." -ForegroundColor Green
Write-Host "  #############################################" -ForegroundColor Green
Write-Host ""
Write-Host "  Running silently in the background." -ForegroundColor White
Write-Host "  Starts automatically on every reboot." -ForegroundColor White
Write-Host ""
Write-Host "  To change printers or stations:" -ForegroundColor Yellow
Write-Host "  Go to Settings -> Printers on the website." -ForegroundColor Yellow
Write-Host "  Changes take effect on the next order automatically." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Cyan
Write-Host "    pm2 status                     - check if running" -ForegroundColor Gray
Write-Host "    pm2 logs TheBill-PrintAgent    - view live logs" -ForegroundColor Gray
Write-Host "    pm2 restart TheBill-PrintAgent - restart" -ForegroundColor Gray
Write-Host ""
Write-Host "  Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
