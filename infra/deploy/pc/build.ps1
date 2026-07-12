<#
.SYNOPSIS
  Build the PIA app artifacts and assemble the release payload for packaging.
.DESCRIPTION
  Produces, under infra/deploy/staging/:
    release/                     the files that become releases/release-NNN on the VM
      docker-compose.production.yml, nginx/, postgres/init/, prometheus/, grafana/, frontend/dist/
    images/app/backend.tar       the built backend image (+ backend.digest)
  Optionally (-Base) also pulls + saves the fully-qualified BASE images to
    images/base/*.tar            (ship these to the VM ONCE).
.PARAMETER Base
  Also pull + save the base images (postgres, nginx, minio, ...). Only needed the
  first time or when a base image version changes.
.PARAMETER SkipFrontend
  Skip the frontend build (reuse the dist already in staging).
.PARAMETER SkipBackend
  Skip the backend image build (reuse the tar already in staging).
.PARAMETER WafOverride
  TEMPORARY (see HANDOVER.md): build the frontend with VITE_WAF_METHOD_OVERRIDE=true (so
  PATCH/PUT/DELETE go out as POST+?_method=<verb>) and VITE_WAF_PROXY_UPLOAD=true (so file
  uploads POST through the backend instead of PUTing to MinIO directly). Needed only while
  the VM's WAF blocks those methods directly. Normally invoked via build_waf_od.ps1 rather
  than passed here by hand. Drop this parameter (and build_waf_od.ps1) once the WAF is fixed.
#>
param(
  [switch]$Base,
  [switch]$SkipFrontend,
  [switch]$SkipBackend,
  [switch]$WafOverride
)
. "$PSScriptRoot\_common.ps1"

Ensure-Dir $Staging; Ensure-Dir $ImagesApp; Ensure-Dir $ReleasePayload

# ── 1. Assemble the static release payload (config + compose + observability) ──────
# Only these become a release; the tooling (pc/, vm/, RUNBOOK) and the .env example
# are NOT part of a release.
Info "Assembling release payload..."
Copy-Item (Join-Path $DeployRoot 'docker-compose.production.yml') $ReleasePayload -Force
foreach ($d in 'nginx','postgres','prometheus','grafana') {
  $dst = Join-Path $ReleasePayload $d
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  Copy-Item (Join-Path $DeployRoot $d) $dst -Recurse -Force
}

# ── 2. Frontend build → dist ──────────────────────────────────────────────────────
if (-not $SkipFrontend) {
  Info "Building frontend (SPA base '/', API '/api/v1')…"
  # Build ONLY the 'build' stage (produces /workspace/dist). The runtime stage COPYs
  # infra/nginx/spa.conf, which isn't in the frontend/ context — and we don't need it,
  # since the base nginx serves the dist files directly. Matches the dev compose target.
  $dockerBuildArgs = @('build','--target','build','-t','pia-frontend-tmp')
  if ($WafOverride) {
    Info "WAF override ON — PATCH/PUT/DELETE go out as POST+?_method=<verb>; uploads proxy through the backend."
    $dockerBuildArgs += @('--build-arg','VITE_WAF_METHOD_OVERRIDE=true')
    $dockerBuildArgs += @('--build-arg','VITE_WAF_PROXY_UPLOAD=true')
  }
  $dockerBuildArgs += (Join-Path $RepoRoot 'frontend')
  Exec 'docker' $dockerBuildArgs
  $cid = (& docker create pia-frontend-tmp).Trim()
  try {
    $distDst = Join-Path $ReleasePayload 'frontend'
    if (Test-Path $distDst) { Remove-Item $distDst -Recurse -Force }
    Ensure-Dir $distDst
    Exec 'docker' @('cp',"${cid}:/workspace/dist",(Join-Path $distDst 'dist'))
  } finally { & docker rm $cid | Out-Null }
  Good "Frontend dist ready."
}

# ── 3. Backend image → tar + digest ────────────────────────────────────────────────
if (-not $SkipBackend) {
  Info "Building backend image $AppImage…"
  Exec 'docker' @('build','-t',$AppImage,(Join-Path $RepoRoot 'backend'))
  Info "Saving backend image…"
  Exec 'docker' @('save','-o',(Join-Path $ImagesApp 'backend.tar'),$AppImage)
  $digest = (& docker inspect --format '{{.Id}}' $AppImage).Trim()
  Set-Content -Path (Join-Path $ImagesApp 'backend.digest') -Value $digest -NoNewline -Encoding ascii
  Good "Backend image saved (digest $($digest.Substring(0,19))…)."
}

# ── 4. Base images (optional, ship once) ───────────────────────────────────────────
if ($Base) {
  Ensure-Dir $ImagesBase
  foreach ($img in $BaseImages) {
    Info "Pull + save base image $img…"
    Exec 'docker' @('pull',$img)
    $safe = ($img -replace '[/:]','_') + '.tar'
    Exec 'docker' @('save','-o',(Join-Path $ImagesBase $safe),$img)
  }
  Good "Base images saved to $ImagesBase (ship these to the VM once)."
}

Good "Build complete. Next: package.ps1 -Release <NNN>"

