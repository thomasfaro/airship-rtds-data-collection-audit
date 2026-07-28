# Make a usable Node.js available to the launcher, in this order:
#   1. a recent enough Node already on PATH
#   2. the private copy a previous run installed in .node\
#   3. a fresh private copy downloaded from nodejs.org, checksum verified
#
# The private copy stays inside the app folder: no administrator rights, nothing
# installed system-wide, and deleting .node\ undoes it completely.
#
# Dot-sourced by scripts/start.ps1 — defines functions only.

$script:MinNodeMajor = if ($env:RTDS_DCA_MIN_NODE_MAJOR) { [int]$env:RTDS_DCA_MIN_NODE_MAJOR } else { 20 }
# Bump this to move to a newer Node line; any nodejs.org/dist channel name works.
$script:NodeChannel = if ($env:RTDS_DCA_NODE_CHANNEL) { $env:RTDS_DCA_NODE_CHANNEL } else { "latest-v22.x" }

function Test-NodeRecentEnough {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return $false }
  try {
    $version = (node -p "process.versions.node")
    return ([int]($version.Split(".")[0])) -ge $script:MinNodeMajor
  } catch {
    return $false
  }
}

function Get-NodeArchTag {
  switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { return "x64" }
    "ARM64" { return "arm64" }
    "x86" { return "x86" }
    default { return $null }
  }
}

function Install-PrivateNode {
  param([string]$TargetDir)

  $arch = Get-NodeArchTag
  if (-not $arch) {
    Write-Host "Unsupported processor: $env:PROCESSOR_ARCHITECTURE." -ForegroundColor Red
    return $false
  }

  $distUrl = "https://nodejs.org/dist/$script:NodeChannel"
  $progressBefore = $ProgressPreference
  $ProgressPreference = "SilentlyContinue"

  try {
    Write-Host "Looking up the current Node.js release..."
    try {
      $shasums = (Invoke-WebRequest -Uri "$distUrl/SHASUMS256.txt" -UseBasicParsing).Content
    } catch {
      Write-Host "Could not reach nodejs.org. Check the internet connection or your proxy settings." -ForegroundColor Red
      return $false
    }

    # Each line is "<sha256>  node-v22.17.0-win-x64.zip".
    $pattern = "^([0-9a-f]{64})\s+(node-v[0-9.]+-win-$arch\.zip)$"
    $entry = $shasums -split "`n" |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -match $pattern } |
      Select-Object -First 1
    if (-not $entry) {
      Write-Host "nodejs.org has no win-$arch build in the $script:NodeChannel channel." -ForegroundColor Red
      return $false
    }
    $entry -match $pattern | Out-Null
    $expected = $Matches[1]
    $filename = $Matches[2]

    $tmp = Join-Path $env:TEMP ("rtds-dca-node-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $archive = Join-Path $tmp $filename

    try {
      Write-Host "Downloading $filename (about 30 MB, once)..."
      Invoke-WebRequest -Uri "$distUrl/$filename" -OutFile $archive -UseBasicParsing

      Write-Host "Verifying the download..."
      $actual = (Get-FileHash -Path $archive -Algorithm SHA256).Hash.ToLower()
      if ($actual -ne $expected.ToLower()) {
        Write-Host "Checksum mismatch: the download is corrupted or was tampered with." -ForegroundColor Red
        Write-Host "Nothing was installed."
        return $false
      }

      if (Test-Path $TargetDir) { Remove-Item $TargetDir -Recurse -Force }
      Expand-Archive -Path $archive -DestinationPath $tmp -Force

      # The archive holds a single versioned folder; keep its contents, not the folder.
      $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
      if (-not $inner) {
        Write-Host "The downloaded archive looks empty." -ForegroundColor Red
        return $false
      }
      Move-Item -Path $inner.FullName -Destination $TargetDir

      if (-not (Test-Path (Join-Path $TargetDir "node.exe"))) {
        Write-Host "The unpacked Node.js looks incomplete." -ForegroundColor Red
        return $false
      }
      return $true
    } finally {
      if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    }
  } finally {
    $ProgressPreference = $progressBefore
  }
}

# Returns $true once node and npm are usable, $false if the user has to act.
function Ensure-NodeAvailable {
  param([string]$Root)

  if (Test-NodeRecentEnough) { return $true }

  $privateDir = Join-Path $Root ".node"

  if (Test-Path (Join-Path $privateDir "node.exe")) {
    $env:PATH = "$privateDir;$env:PATH"
    if (Test-NodeRecentEnough) {
      Write-Host "Using the Node.js copy in .node\ ($(node -v))."
      return $true
    }
  }

  if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "Node.js $(node -v) is installed, but this app needs version $script:MinNodeMajor or later."
  } else {
    Write-Host "Node.js is not installed on this machine."
  }
  Write-Host ""
  Write-Host "This launcher can install its own private copy of Node.js in:"
  Write-Host "  $privateDir"
  Write-Host ""
  Write-Host "It needs no administrator rights, changes nothing else on your machine,"
  Write-Host "and deleting that folder removes it completely."
  Write-Host ""

  if ($env:RTDS_DCA_AUTO_INSTALL_NODE -eq "1") {
    $reply = "y"
  } else {
    $reply = Read-Host "Install it now? [Y/n]"
  }

  if ($reply -and $reply -notmatch "^(y|yes)$") {
    Write-Host ""
    Write-Host "Nothing installed. Get Node.js $script:MinNodeMajor+ from https://nodejs.org,"
    Write-Host "then start this launcher again."
    return $false
  }

  if (-not (Install-PrivateNode -TargetDir $privateDir)) { return $false }

  $env:PATH = "$privateDir;$env:PATH"
  if (-not (Test-NodeRecentEnough)) {
    Write-Host "The private Node.js copy is not usable." -ForegroundColor Red
    return $false
  }

  Write-Host "Node.js $(node -v) is ready."
  return $true
}
