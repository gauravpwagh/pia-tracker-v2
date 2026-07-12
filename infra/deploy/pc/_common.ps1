# Shared helpers + paths for the PIA PC-side deployment scripts (Windows + Docker Desktop).
# Dot-source at the top of each script:  . "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

# infra/deploy/pc  ->  repo root is three levels up
$script:RepoRoot     = (Resolve-Path "$PSScriptRoot\..\..\..").Path
$script:DeployRoot   = (Resolve-Path "$PSScriptRoot\..").Path              # infra/deploy (payload + tooling)
$script:VmScriptsDir = Join-Path $DeployRoot 'vm'                          # VM bash scripts + systemd unit
$script:EnvExample   = Join-Path $DeployRoot '.env.production.example'
$script:Staging    = Join-Path $DeployRoot 'staging'                  # assembled release payload
$script:OutDir     = Join-Path $DeployRoot 'out'                      # bundles to transfer
$script:ShipState  = Join-Path $DeployRoot '.ship-state'             # what was last shipped
$script:ImagesApp  = Join-Path $Staging 'images\app'
$script:ImagesBase = Join-Path $Staging 'images\base'
$script:ReleasePayload = Join-Path $Staging 'release'                  # files that become releases/release-NNN

# Fully-qualified base images to pre-seed the air-gapped VM (shipped once).
$script:BaseImages = @(
  'docker.io/library/postgres:16-alpine',
  'docker.io/library/nginx:1.27-alpine',
  'quay.io/minio/minio:latest',
  'quay.io/minio/mc:latest',
  'docker.io/clamav/clamav:1.4',
  'docker.io/prom/prometheus:latest',
  'docker.io/grafana/grafana-oss:latest',
  'docker.io/grafana/loki:latest'
)
$script:AppImage = 'localhost/pia/backend:prod'

function Info($m)  { Write-Host "[pia] $m" -ForegroundColor Cyan }
function Good($m)  { Write-Host "[pia OK] $m" -ForegroundColor Green }
function Warn2($m) { Write-Host "[pia !] $m" -ForegroundColor Yellow }

# Run a native command; throw if it returns non-zero.
function Exec([string]$cmd, [string[]]$cmdArgs) {
  & $cmd @cmdArgs
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $cmd $($cmdArgs -join ' ')" }
}

function Ensure-Dir($p) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null } }

# Normalise a release number: 12 -> "release-012"
function Release-Name([int]$n) { 'release-{0:D3}' -f $n }

