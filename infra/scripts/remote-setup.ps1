# remote-setup.ps1 — Run post-transfer setup steps on the remote server via SSH.
#
# Usage:
#   .\infra\scripts\remote-setup.ps1 -RemoteUser root -RemoteHost 10.77.48.80
#
# Run this AFTER build-and-ship.ps1 has completed successfully.

param(
    [Parameter(Mandatory)][string]$RemoteHost,
    [Parameter(Mandatory)][string]$RemoteUser,
    [string]$RemotePath  = "/opt/pia",
    [string]$SshKeyFile  = "",
    [switch]$SkipNginx   = $false,
    [switch]$SkipEnv     = $false,
    [switch]$SkipStart   = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$LASTEXITCODE = 0

$SshArgs = if ($SshKeyFile) { @("-i", $SshKeyFile) } else { @() }

function Log($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }

$SshBin = (Get-Command ssh -CommandType Application).Source

function RunSsh([string]$cmd) {
    & $SshBin @SshArgs "$RemoteUser@$RemoteHost" $cmd
    return $LASTEXITCODE
}

# ── 1. Patch system nginx ─────────────────────────────────────────────────────
if (-not $SkipNginx) {
    Log "Step 1: Patching /etc/nginx/conf.d/crs.conf with PIA locations"

    # Check if already patched
    $alreadyPatched = RunSsh "grep -q '/pia/api/' /etc/nginx/conf.d/crs.conf && echo yes || echo no"
    if ($alreadyPatched -match "yes") {
        Warn "PIA locations already present in crs.conf - skipping patch"
    } else {
        # Use Python (available on RHEL9) to insert PIA locations before the closing }
        # of the server block. Reads pia-locations.conf and injects it.
        $patchCmd = @'
python3 - <<'PYEOF'
import re, sys

with open('/etc/nginx/conf.d/crs.conf', 'r') as f:
    content = f.read()

with open('/opt/pia/infra/nginx/pia-locations.conf', 'r') as f:
    pia = f.read()

# Insert PIA locations before the final closing brace of the server block
patched = re.sub(r'(\n\}(\s*)$)', '\n' + pia + r'\1', content, count=1, flags=re.MULTILINE)

if patched == content:
    print("ERROR: Could not find insertion point in crs.conf", file=sys.stderr)
    sys.exit(1)

with open('/etc/nginx/conf.d/crs.conf', 'w') as f:
    f.write(patched)

print("crs.conf patched successfully")
PYEOF
'@
        $rc = RunSsh$patchCmd
        if ($rc -ne 0) { Die "Failed to patch crs.conf" }
        Ok "crs.conf patched"

        # Test nginx config
        Log "Testing nginx configuration"
        $rc = RunSsh "nginx -t"
        if ($rc -ne 0) { Die "nginx -t failed - check crs.conf manually" }
        Ok "nginx config valid"

        # Reload nginx
        Log "Reloading nginx"
        $rc = RunSsh "nginx -s reload"
        if ($rc -ne 0) { Die "nginx reload failed" }
        Ok "nginx reloaded"
    }
} else {
    Log "Skipping nginx patch [-SkipNginx]"
}

# ── 2. Create .env on server ──────────────────────────────────────────────────
if (-not $SkipEnv) {
    Log "Step 2: Setting up $RemotePath/infra/.env"

    $envExists = RunSsh "test -f $RemotePath/infra/.env && echo yes || echo no"
    if ($envExists -match "yes") {
        Warn ".env already exists - not overwriting. Edit manually if needed:"
        Warn "  ssh $RemoteUser@$RemoteHost 'vi $RemotePath/infra/.env'"
    } else {
        $rc = RunSsh "cp $RemotePath/infra/.env.prod.example $RemotePath/infra/.env"
        if ($rc -ne 0) { Die "Failed to create .env" }
        Ok ".env created from .env.prod.example"
        Write-Host ""
        Write-Host "  *** ACTION REQUIRED ***" -ForegroundColor Yellow
        Write-Host "  Edit passwords on the server before continuing:" -ForegroundColor Yellow
        Write-Host "    ssh $RemoteUser@$RemoteHost" -ForegroundColor Yellow
        Write-Host "    vi $RemotePath/infra/.env" -ForegroundColor Yellow
        Write-Host ""
        $confirm = Read-Host "  Press ENTER once you have saved the .env file"
    }
} else {
    Log "Skipping .env setup [-SkipEnv]"
}

# ── 3. Start PIA stack ────────────────────────────────────────────────────────
if (-not $SkipStart) {
    Log "Step 3: Starting PIA stack with podman-compose"

    $rc = RunSsh "cd $RemotePath/infra && podman-compose -f podman-compose.prod.yml up -d"
    if ($rc -ne 0) { Die "podman-compose up failed" }
    Ok "PIA stack started"

    # Give backend time to run Flyway migrations and become healthy
    Log "Waiting 30 s for backend to initialise"
    Start-Sleep -Seconds 30

    # ── 4. Verify ─────────────────────────────────────────────────────────────
    Log "Step 4: Verifying deployment"

    Write-Host "`n  Running containers:"
    RunSsh "podman ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

    Write-Host "`n  Backend health:"
    RunSsh "curl -fsS http://10.90.0.3:8080/actuator/health/readiness && echo OK || echo FAIL"

    Write-Host "`n  SPA reachable:"
    RunSsh "curl -fsS -o /dev/null -w '%{http_code}' http://10.77.48.80/pia/ && echo"

    Write-Host ""
    Ok "Done. Open http://10.77.48.80/pia/ in your browser."
} else {
    Log "Skipping stack start [-SkipStart]"
}
