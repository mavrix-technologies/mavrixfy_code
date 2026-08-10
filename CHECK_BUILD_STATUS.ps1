# iOS Build Status Checker
# Run this script anytime to check your latest iOS build status

param(
    [switch]$Watch,
    [int]$WatchInterval = 30
)

function Get-BuildStatus {
    try {
        $response = Invoke-RestMethod -Uri "https://api.github.com/repos/mavrix-technologies/mavrixfy_code/actions/runs?per_page=5" -Headers @{"Accept"="application/vnd.github.v3+json"}
        $latestRun = $response.workflow_runs | Where-Object {$_.name -like "*iOS*"} | Select-Object -First 1
        
        if (-not $latestRun) {
            Write-Host "❌ No iOS workflow runs found" -ForegroundColor Red
            return
        }

        # Get job details
        $jobs = Invoke-RestMethod -Uri $latestRun.jobs_url
        $job = $jobs.jobs[0]

        # Clear screen for watch mode
        if ($Watch) { Clear-Host }

        # Header
        Write-Host "`n=== 📱 iOS Build Status ===" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Run Number:  " -NoNewline
        Write-Host "#$($latestRun.run_number)" -ForegroundColor Yellow
        
        Write-Host "Status:      " -NoNewline
        switch ($latestRun.status) {
            "completed" { 
                if ($latestRun.conclusion -eq "success") {
                    Write-Host "✅ COMPLETED - SUCCESS" -ForegroundColor Green
                } else {
                    Write-Host "❌ COMPLETED - FAILED" -ForegroundColor Red
                }
            }
            "in_progress" { Write-Host "🔄 IN PROGRESS" -ForegroundColor Yellow }
            "queued" { Write-Host "⏳ QUEUED" -ForegroundColor Gray }
            default { Write-Host "$($latestRun.status)" -ForegroundColor White }
        }
        
        Write-Host "Started:     " -NoNewline
        Write-Host ([DateTime]$latestRun.created_at).ToString('MMM dd, yyyy hh:mm:ss tt') -ForegroundColor White
        
        if ($latestRun.status -eq "completed") {
            Write-Host "Completed:   " -NoNewline
            Write-Host ([DateTime]$latestRun.updated_at).ToString('MMM dd, yyyy hh:mm:ss tt') -ForegroundColor White
            
            $duration = ([DateTime]$latestRun.updated_at - [DateTime]$latestRun.created_at).TotalMinutes
            Write-Host "Duration:    " -NoNewline
            Write-Host "$([Math]::Round($duration, 1)) minutes" -ForegroundColor White
        } else {
            $elapsed = ([DateTime]::UtcNow - [DateTime]$job.started_at).TotalMinutes
            Write-Host "Running for: " -NoNewline
            Write-Host "$([Math]::Round($elapsed, 1)) minutes" -ForegroundColor Yellow
        }

        Write-Host ""
        Write-Host "🔗 View online: " -NoNewline
        Write-Host $latestRun.html_url -ForegroundColor Blue

        # Steps progress
        Write-Host "`n📋 Build Steps:" -ForegroundColor Cyan
        Write-Host ""
        
        $job.steps | Where-Object {$_.name -ne 'Set up job' -and $_.name -ne 'Complete job' -and $_.name -notlike 'Post *'} | ForEach-Object {
            $icon = switch($_.conclusion) {
                "success" { "✅" }
                "failure" { "❌" }
                default { 
                    if($_.status -eq "in_progress") { "🔄" } 
                    else { "⏳" } 
                }
            }
            
            $color = switch($_.conclusion) {
                "success" { "Green" }
                "failure" { "Red" }
                default { 
                    if($_.status -eq "in_progress") { "Yellow" } 
                    else { "Gray" } 
                }
            }
            
            Write-Host "  $icon " -NoNewline
            Write-Host $_.name -ForegroundColor $color
        }

        # If completed successfully, show artifact info
        if ($latestRun.conclusion -eq "success") {
            Write-Host "`n🎉 Build Successful!" -ForegroundColor Green
            Write-Host ""
            Write-Host "📦 Download IPA:" -ForegroundColor Cyan
            Write-Host "  Artifact: Mavrixfy-iOS-IPA-Unsigned" -ForegroundColor White
            Write-Host "  Or check Releases: https://github.com/mavrix-technologies/mavrixfy_code/releases" -ForegroundColor Blue
            Write-Host ""
            Write-Host "📱 Installation:" -ForegroundColor Cyan
            Write-Host "  1. Download Sideloadly from https://sideloadly.io/" -ForegroundColor White
            Write-Host "  2. Download the IPA artifact" -ForegroundColor White
            Write-Host "  3. Connect your iPhone/iPad" -ForegroundColor White
            Write-Host "  4. Use Sideloadly to install" -ForegroundColor White
        }
        elseif ($latestRun.conclusion -eq "failure") {
            Write-Host "`n❌ Build Failed" -ForegroundColor Red
            Write-Host ""
            Write-Host "Check logs at: $($latestRun.html_url)" -ForegroundColor Yellow
        }
        elseif ($latestRun.status -eq "in_progress") {
            Write-Host "`n⏱️ Estimated time remaining: ~10 minutes" -ForegroundColor Yellow
            if ($Watch) {
                Write-Host "`nRefreshing every $WatchInterval seconds... (Press Ctrl+C to stop)" -ForegroundColor Gray
            }
        }

        Write-Host ""

    } catch {
        Write-Host "❌ Error fetching build status: $_" -ForegroundColor Red
    }
}

# Main execution
if ($Watch) {
    Write-Host "🔍 Watching iOS build status..." -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop watching" -ForegroundColor Gray
    Write-Host ""
    
    while ($true) {
        Get-BuildStatus
        Start-Sleep -Seconds $WatchInterval
    }
} else {
    Get-BuildStatus
}
