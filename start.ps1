Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "             Figma2Insight Launcher                     " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting Python backend server on http://localhost:8001..." -ForegroundColor Green
$serverProc = Start-Process -FilePath "python" -ArgumentList "server.py" -PassThru
Start-Sleep -Seconds 3
Write-Host "Opening dashboard in browser..." -ForegroundColor Yellow
Start-Process "http://localhost:8001/#/workspace"
Write-Host ""
Write-Host "Dashboard is running at http://localhost:8001" -ForegroundColor Green
Write-Host "To stop the server, close the Python process or terminal." -ForegroundColor Gray

