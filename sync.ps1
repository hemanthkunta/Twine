# ============================================================
# AETHER MESSAGING PROJECT - SAFE AUTO SYNC
# Windows PowerShell
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       AETHER MESSAGING PROJECT - AUTO SYNC" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# 1. Make sure we are inside a Git repository
# ------------------------------------------------------------

try {
    git rev-parse --is-inside-work-tree | Out-Null
}
catch {
    Write-Host "ERROR: This folder is not a Git repository." -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------
# 2. Show current branch
# ------------------------------------------------------------

$branch = git branch --show-current

if ([string]::IsNullOrWhiteSpace($branch)) {
    Write-Host "ERROR: Could not determine current Git branch." -ForegroundColor Red
    exit 1
}

Write-Host "Current branch: $branch" -ForegroundColor Yellow
Write-Host ""

# ------------------------------------------------------------
# 3. Do NOT allow sync on detached HEAD
# ------------------------------------------------------------

$head = git symbolic-ref --short HEAD 2>$null

if ([string]::IsNullOrWhiteSpace($head)) {
    Write-Host "ERROR: Repository is in detached HEAD state." -ForegroundColor Red
    Write-Host "Checkout your normal branch first." -ForegroundColor Yellow
    exit 1
}

# ------------------------------------------------------------
# 4. Fetch latest remote information
# ------------------------------------------------------------

Write-Host "[1/7] Fetching latest changes..." -ForegroundColor Cyan

git fetch origin

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git fetch failed." -ForegroundColor Red
    exit 1
}

Write-Host "Fetch successful." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 5. Detect local changes
# ------------------------------------------------------------

$status = git status --porcelain

if (-not [string]::IsNullOrWhiteSpace($status)) {

    Write-Host "[2/7] Local changes detected." -ForegroundColor Cyan
    Write-Host ""

    git status --short

    Write-Host ""
    Write-Host "Creating local checkpoint commit..." -ForegroundColor Yellow

    git add -A

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git add failed." -ForegroundColor Red
        exit 1
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    git commit -m "sync: automatic checkpoint $timestamp"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git commit failed." -ForegroundColor Red
        exit 1
    }

    Write-Host "Local changes committed." -ForegroundColor Green
}
else {
    Write-Host "[2/7] No local changes." -ForegroundColor Green
}

Write-Host ""

# ------------------------------------------------------------
# 6. Rebase local branch onto remote branch
# ------------------------------------------------------------

Write-Host "[3/7] Synchronizing with origin/$branch..." -ForegroundColor Cyan

git pull --rebase origin $branch

if ($LASTEXITCODE -ne 0) {

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "SYNC STOPPED - MERGE CONFLICT DETECTED" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""

    Write-Host "Git has stopped the rebase safely." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Run:" -ForegroundColor White
    Write-Host ""
    Write-Host "    git status" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Resolve the conflicted files, then run:" -ForegroundColor White
    Write-Host ""
    Write-Host "    git add ." -ForegroundColor Cyan
    Write-Host "    git rebase --continue" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "After the rebase finishes, run this script again." -ForegroundColor White
    Write-Host ""

    exit 1
}

Write-Host "Remote changes synchronized." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 7. Push everything
# ------------------------------------------------------------

Write-Host "[4/7] Pushing local changes..." -ForegroundColor Cyan

git push origin $branch

if ($LASTEXITCODE -ne 0) {

    Write-Host ""
    Write-Host "Push failed." -ForegroundColor Red
    Write-Host ""
    Write-Host "This usually means the remote changed again." -ForegroundColor Yellow
    Write-Host "Run the sync script again." -ForegroundColor Yellow
    Write-Host ""

    exit 1
}

Write-Host "Push successful." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 8. Final fetch
# ------------------------------------------------------------

Write-Host "[5/7] Verifying remote state..." -ForegroundColor Cyan

git fetch origin

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Verification fetch failed." -ForegroundColor Red
    exit 1
}

Write-Host "Remote state verified." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 9. Final status
# ------------------------------------------------------------

Write-Host "[6/7] Checking working tree..." -ForegroundColor Cyan

$finalStatus = git status --porcelain

if ([string]::IsNullOrWhiteSpace($finalStatus)) {
    Write-Host "Working tree is clean." -ForegroundColor Green
}
else {
    Write-Host "Working tree still contains changes:" -ForegroundColor Yellow
    git status --short
}

Write-Host ""

# ------------------------------------------------------------
# 10. Finish
# ------------------------------------------------------------

Write-Host "[7/7] SYNC COMPLETE" -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Your project is synchronized with origin/$branch" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

git log -1 --oneline

Write-Host ""
