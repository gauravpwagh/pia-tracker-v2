# build-and-ship.ps1 — Build PIA images locally and transfer to remote server.
#
# Usage:
#   .\infra\scripts\build-and-ship.ps1 -RemoteUser root -RemoteHost 10.77.48.80
#
# Prerequisites:
#   - Docker Desktop running locally
#   - SSH key-based auth to remote (or will prompt for password)
#   - scp available in PATH (comes with OpenSSH on Windows 10+)

param(
    [Parameter(Mandatory)][string]$RemoteHost,
    [Parameter(Mandatory)][string]$RemoteUser,
    [string]$RemotePath   = "/opt/pia",
    [string]$SshKeyFile   = "",          # e.g. C:\Users\you\.ssh\id_rsa
    [switch]$SkipBuild    = $false,      # skip image build (re-use existing local images)
    [switch]$SkipInfra    = $false,      # skip SCP of infra/ and dist/
    [switch]$SkipImages   = $false       # skip SCP of image tarball
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot   = Resolve-Path "$PSScriptRoot\..\.."
$InfraDir   = "$RepoRoot\infra"
$FrontendDir= "$RepoRoot\frontend"
$BackendDir = "$RepoRoot\backend"
$TarFile    = "$env:TEMP\pia-images.tar.gz"

$SshArgs = if ($SshKeyFile) { @("-i", $SshKeyFile) } else { @() }

function Log($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Die($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }

# ── 1. Build frontend dist ────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Log "Building frontend (base=/pia/ VITE_API_BASE=/pia/api/v1)"
    Push-Location $FrontendDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { Die "Frontend build failed" }
    } finally { Pop-Location }
} else {
    Log "Skipping frontend build (--SkipBuild)"
}

# ── 2. Build backend Docker image ─────────────────────────────────────────────
if (-not $SkipBuild) {
    Log "Building pia-backend:prod image (linux/amd64)"
    docker build --platform linux/amd64 -t pia-backend:prod "$BackendDir"
    if ($LASTEXITCODE -ne 0) { Die "Backend image build failed" }
} else {
    Log "Skipping image build (--SkipBuild)"
}

# ── 3. Pull third-party images for linux/amd64 ───────────────────────────────
if (-not $SkipImages) {
    $ThirdParty = @(
        "nginx:1.27-alpine",
        "postgres:16-alpine",
        "quay.io/minio/minio:latest",
        "quay.io/minio/mc:latest",
        "clamav/clamav:1.4",
        "prom/prometheus:latest",
        "grafana/grafana-oss:latest",
        "grafana/loki:latest"
    )

    Log "Pulling third-party images for linux/amd64"
    foreach ($img in $ThirdParty) {
        Write-Host "  Pulling $img ..."
        docker pull --platform linux/amd64 $img
        if ($LASTEXITCODE -ne 0) { Die "Failed to pull $img" }
    }

    # ── 4. Export all images to tar.gz ────────────────────────────────────────
    Log "Saving all images to $TarFile (this may take a few minutes)"
    $AllImages = @("pia-backend:prod") + $ThirdParty
    $saveArgs  = $AllImages -join " "

    # docker save pipes to gzip
    $proc = Start-Process -FilePath "docker" `
        -ArgumentList ("save " + $saveArgs) `
        -RedirectStandardOutput "$env:TEMP\pia-images.tar" `
        -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -ne 0) { Die "docker save failed" }

    Log "Compressing tar with gzip"
    & gzip -f "$env:TEMP\pia-images.tar"
    if ($LASTEXITCODE -ne 0) {
        # fallback: use PowerShell compression if gzip not in PATH
        Log "gzip not found — using PowerShell GZipStream"
        $src = [System.IO.File]::OpenRead("$env:TEMP\pia-images.tar")
        $dst = [System.IO.File]::Create($TarFile)
        $gz  = [System.IO.Compression.GZipStream]::new($dst, [System.IO.Compression.CompressionMode]::Compress)
        $src.CopyTo($gz)
        $gz.Close(); $dst.Close(); $src.Close()
        Remove-Item "$env:TEMP\pia-images.tar" -Force
    } else {
        Move-Item -Force "$env:TEMP\pia-images.tar.gz" $TarFile
    }

    $sizeMB = [math]::Round((Get-Item $TarFile).Length / 1MB, 0)
    Log "Image bundle ready: $TarFile ($sizeMB MB)"
} else {
    Log "Skipping image export (--SkipImages)"
}

# ── 5. Ensure remote directory exists ────────────────────────────────────────
Log "Creating remote directory $RemotePath"
& ssh @SshArgs "$RemoteUser@$RemoteHost" "mkdir -p $RemotePath/infra"
if ($LASTEXITCODE -ne 0) { Die "SSH failed — check host/user/key" }

# ── 6. Transfer image tarball ─────────────────────────────────────────────────
if (-not $SkipImages) {
    Log "Uploading image bundle to $RemoteHost:$RemotePath/ ..."
    & scp @SshArgs $TarFile "${RemoteUser}@${RemoteHost}:${RemotePath}/pia-images.tar.gz"
    if ($LASTEXITCODE -ne 0) { Die "SCP of image bundle failed" }
}

# ── 7. Transfer infra/ directory ──────────────────────────────────────────────
if (-not $SkipInfra) {
    Log "Uploading infra/ to $RemoteHost:$RemotePath/infra/"
    & scp @SshArgs -r "$InfraDir\." "${RemoteUser}@${RemoteHost}:${RemotePath}/infra/"
    if ($LASTEXITCODE -ne 0) { Die "SCP of infra/ failed" }

    Log "Uploading frontend dist/ to $RemoteHost:/usr/share/nginx/html/pia/"
    & ssh @SshArgs "$RemoteUser@$RemoteHost" "mkdir -p /usr/share/nginx/html/pia"
    & scp @SshArgs -r "$FrontendDir\dist\." "${RemoteUser}@${RemoteHost}:/usr/share/nginx/html/pia/"
    if ($LASTEXITCODE -ne 0) { Die "SCP of frontend dist/ failed" }
}

# ── 8. Remote: load images ────────────────────────────────────────────────────
Log "Loading images on remote server (this may take a few minutes)"
& ssh @SshArgs "$RemoteUser@$RemoteHost" "podman load < $RemotePath/pia-images.tar.gz"
if ($LASTEXITCODE -ne 0) { Die "podman load failed on remote" }

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host @"

===============================================================
  Transfer complete. Next steps ON THE SERVER:

  1. Add PIA nginx locations to /etc/nginx/conf.d/crs.conf:
       cat $RemotePath/infra/nginx/pia-locations.conf
     (paste the contents inside the server { listen 80 } block)
     Then: nginx -t && nginx -s reload

  2. Configure env:
       cd $RemotePath/infra
       cp .env.prod.example .env
       vi .env   # set all CHANGE_ME values

  3. Start PIA stack:
       podman-compose -f podman-compose.prod.yml up -d

  4. Verify:
       curl http://10.77.48.80/pia/
       podman ps
===============================================================
"@ -ForegroundColor Green
