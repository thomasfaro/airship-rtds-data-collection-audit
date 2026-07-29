# Everything that has to be true before the server can start: local config in place,
# the latest code pulled, dependencies installed, interface built.
#
# Dot-sourced by scripts\start.ps1 (interactive launcher) and scripts\serve.ps1
# (background service) so the two can never drift apart. Mirrors prepare-app.sh —
# change one, change the other.

# Reinstall when the lockfile has moved since the last install. npm rewrites
# node_modules\.package-lock.json on every install, which makes it the marker to
# compare against: the folder's own timestamp does not change when a dependency is
# added. Without this an update that touches package.json leaves a missing module.
function Test-DcaNeedsInstall {
  param([Parameter(Mandatory = $true)][string]$Prefix)

  if (-not (Test-Path "$Prefix/node_modules")) { return $true }
  $marker = "$Prefix/node_modules/.package-lock.json"
  if (-not (Test-Path $marker)) { return $true }
  $lock = "$Prefix/package-lock.json"
  if (-not (Test-Path $lock)) { return $false }
  return (Get-Item $lock).LastWriteTimeUtc -gt (Get-Item $marker).LastWriteTimeUtc
}

function Invoke-DcaInstall {
  param(
    [Parameter(Mandatory = $true)][string]$Prefix,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (Test-Path "$Prefix/node_modules") {
    Write-Host "Updating $Label components..."
  } else {
    Write-Host "Installing $Label components (first run only, this takes a minute)..."
  }
  npm install --prefix $Prefix --no-audit --no-fund --loglevel=error
}

# Pull the latest code, but only when that is unambiguously safe. Every other case is
# left alone, and silently: this runs in front of someone who double-clicked a
# launcher, so the only acceptable failure mode is "you keep the version you had".
#
# The guards, each earning its place: no .git (a ZIP install) has nothing to pull;
# local changes mean someone is working here; a detached HEAD has no branch to
# fast-forward; --ff-only never merges or rewrites; prompts are refused and a stalled
# transfer is dropped, because a launcher waiting on a password is worse than an
# outdated one; and config\.no-auto-update is the explicit way out.
function Invoke-DcaAutoUpdate {
  if (-not (Test-Path ".git")) { return }
  if (Test-Path "config/.no-auto-update") { return }
  if ($env:RTDS_DCA_NO_AUTO_UPDATE -eq "1") { return }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return }

  $dirty = & git status --porcelain 2>$null
  if ($LASTEXITCODE -ne 0 -or $dirty) { return }

  $branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $branch -or $branch -eq "HEAD") { return }

  $before = (& git rev-parse HEAD 2>$null)

  $previousPrompt = $env:GIT_TERMINAL_PROMPT
  $env:GIT_TERMINAL_PROMPT = "0"
  try {
    & git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 `
      pull --ff-only --quiet origin $branch 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { return }
  } finally {
    $env:GIT_TERMINAL_PROMPT = $previousPrompt
  }

  $after = (& git rev-parse HEAD 2>$null)
  if ($after -and $after -ne $before) {
    Write-Host "Updated to the latest version."
  }
}

function Invoke-PrepareApp {
  param([Parameter(Mandatory = $true)][string]$Root)

  Set-Location $Root

  New-Item -ItemType Directory -Force -Path "config" | Out-Null

  if (-not (Test-Path "server/.env") -and (Test-Path "server/.env.example")) {
    Copy-Item "server/.env.example" "server/.env"
  }

  # First, so the checks below see whatever the update brought in.
  Invoke-DcaAutoUpdate

  if (Test-DcaNeedsInstall "server") { Invoke-DcaInstall "server" "server" }
  if (Test-DcaNeedsInstall "frontend") { Invoke-DcaInstall "frontend" "interface" }

  # Rebuild only when the build is missing or older than the sources it came from.
  $buildMarker = "frontend/dist/index.html"
  $needsBuild = $true
  if (Test-Path $buildMarker) {
    $builtAt = (Get-Item $buildMarker).LastWriteTimeUtc
    $sources = @("frontend/src", "frontend/public", "frontend/index.html", "frontend/package.json", "frontend/vite.config.js") |
      Where-Object { Test-Path $_ }
    $newer = $sources |
      ForEach-Object { Get-ChildItem $_ -Recurse -File -ErrorAction SilentlyContinue } |
      Where-Object { $_.LastWriteTimeUtc -gt $builtAt } |
      Select-Object -First 1
    $needsBuild = $null -ne $newer
  }

  if ($needsBuild) {
    Write-Host "Preparing the interface..."
    npm run build --prefix frontend --silent -- --logLevel error
  }
}
