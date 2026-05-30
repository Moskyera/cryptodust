<#
  CryptoDUST / AetherBubbles - Automated Git Push Script

  Usage:
    ./push.ps1
    npm run push
    npm run push -- "chore: update something"

  You can also pass a commit message as the first argument.
#>

Write-Host ""
Write-Host "🚀  CryptoDUST Auto Push" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor DarkGray
Write-Host ""

# Check if we're in a git repo
if (-not (Test-Path ".git")) {
    Write-Host "❌ Not a git repository." -ForegroundColor Red
    exit 1
}

# Show current branch
$branch = git rev-parse --abbrev-ref HEAD
Write-Host "Current branch: " -NoNewline
Write-Host $branch -ForegroundColor Yellow

# Show status
Write-Host ""
Write-Host "Git Status:" -ForegroundColor DarkGray
git status --short

$changes = git status --porcelain
if (-not $changes) {
    Write-Host ""
    Write-Host "✅ No changes to commit. Working tree is clean." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Changes detected." -ForegroundColor Yellow
Write-Host ""

# Prompt for commit message (supports argument for automation)
$defaultMessage = "chore: update"

if ($args.Count -gt 0 -and $args[0]) {
    $commitMessage = $args[0]
    Write-Host "Commit message provided via argument: " -NoNewline -ForegroundColor DarkGray
    Write-Host $commitMessage -ForegroundColor Magenta
} else {
    $commitMessage = Read-Host "Commit message (press Enter for '$defaultMessage')"
    if ([string]::IsNullOrWhiteSpace($commitMessage)) {
        $commitMessage = $defaultMessage
    }
}

Write-Host ""
Write-Host "📝  Commit message: " -NoNewline
Write-Host $commitMessage -ForegroundColor Magenta

# Confirm
$confirm = Read-Host "Proceed with commit + push? (y/n)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "❌ Push cancelled." -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "📦 Staging all changes..." -ForegroundColor Blue
git add .

Write-Host "💾 Committing..." -ForegroundColor Blue
git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Commit failed." -ForegroundColor Red
    exit 1
}

Write-Host "☁️  Pushing to origin/$branch ..." -ForegroundColor Blue
git push origin $branch

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅  Successfully pushed to origin/$branch" -ForegroundColor Green
    Write-Host ""
    git log --oneline -3
} else {
    Write-Host ""
    Write-Host "❌ Push failed. Check your connection or permissions." -ForegroundColor Red
    exit 1
}

Write-Host ""