# Development Server Startup Script
# Allows easy switching between local, network, and ngrok modes

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "IMAGINE-DEBATE Dev Server" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Choose your development mode:" -ForegroundColor Yellow
Write-Host "[1] Local only (localhost:3000)"
Write-Host "[2] Network access (192.168.1.100:3000)"
Write-Host "[3] ngrok tunnel (public URL)"
Write-Host "[4] Network + ngrok (both at the same time)"
Write-Host ""

$choice = Read-Host "Enter your choice (1-4)"

switch ($choice) {
    "1" {
        Write-Host "Starting dev server on localhost only..." -ForegroundColor Green
        Write-Host "URL: http://localhost:3000" -ForegroundColor Green
        npm run dev
    }
    "2" {
        Write-Host "Starting dev server on network (192.168.1.100)..." -ForegroundColor Green
        Write-Host "URL: http://192.168.1.100:3000" -ForegroundColor Green
        Write-Host "Make sure you set NEXT_PUBLIC_APP_URL in .env.local" -ForegroundColor Yellow
        npm run dev -- --hostname 0.0.0.0
    }
    "3" {
        Write-Host "Starting dev server with ngrok..." -ForegroundColor Green
        Write-Host "Opening two terminals: one for dev server, one for ngrok" -ForegroundColor Green
        Write-Host ""
        Write-Host "Terminal 1: Starting Next.js on port 3000..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev -- --hostname 0.0.0.0"
        
        Start-Sleep -Seconds 3
        
        Write-Host "Terminal 2: Starting ngrok..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 3000"
        
        Write-Host ""
        Write-Host "ngrok will show your public URL. Copy it and update .env.local" -ForegroundColor Yellow
        Write-Host "Example: NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io" -ForegroundColor Yellow
    }
    "4" {
        Write-Host "Starting dev server with both network and ngrok..." -ForegroundColor Green
        Write-Host "Opening two terminals..." -ForegroundColor Green
        Write-Host ""
        Write-Host "Terminal 1: Starting Next.js on port 3000..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev -- --hostname 0.0.0.0"
        
        Start-Sleep -Seconds 3
        
        Write-Host "Terminal 2: Starting ngrok..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 3000"
        
        Write-Host ""
        Write-Host "Now you have both:" -ForegroundColor Green
        Write-Host "  • Local Network: http://192.168.1.100:3000" -ForegroundColor Green
        Write-Host "  • Public (ngrok): https://abc123.ngrok.io (check ngrok terminal)" -ForegroundColor Green
    }
    default {
        Write-Host "Invalid choice. Please run the script again." -ForegroundColor Red
    }
}
