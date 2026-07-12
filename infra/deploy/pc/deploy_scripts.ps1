<#
.SYNOPSIS
  Deploy the VM TOOLING: upload the VM bash scripts + systemd unit + .env example to
  /opt/pia/scripts, and (optionally) the base images to /opt/pia/images/base.
.DESCRIPTION
  This is the "ship the scripts" half of deployment (the app releases are shipped by
  deploy_project.ps1). Run it:
    - once at first-time setup (with -WithBase) BEFORE setup.sh + editing .env, and
    - whenever you change anything under deploy/vm/ (setup/deploy/start/... .sh) or the
      .env template.
.PARAMETER VmHost   VM hostname/IP.
.PARAMETER VmUser   SSH user (passwordless sudo for /opt/pia/scripts/*).
.PARAMETER Root     Deploy root on the VM. Default /opt/pia.
.PARAMETER SshKey   Optional private key path.
.PARAMETER WithBase Also upload the base image tars (from build.ps1 -Base). One-time / on base-image change.
#>
param(
  [Parameter(Mandatory)][string]$VmHost,
  [Parameter(Mandatory)][string]$VmUser,
  [string]$Root = '/opt/pia',
  [string]$SshKey,
  [switch]$WithBase
)
. "$PSScriptRoot\_common.ps1"

$sshArgs = @(); $scpArgs = @()
if ($SshKey) { $sshArgs += @('-i',$SshKey); $scpArgs += @('-i',$SshKey) }
$target = "$VmUser@$VmHost"
# NOTE: do NOT name these Ssh/Scp — PowerShell resolves `& 'ssh'` to a same-named
# function (case-insensitive, functions beat exes) which would recurse forever.
function Invoke-Ssh([string]$remoteCmd) { Exec 'ssh' ($sshArgs + @($target, $remoteCmd)) }
function Invoke-Scp([string]$local, [string]$remote) { Exec 'scp' ($scpArgs + @($local, "${target}:$remote")) }

Invoke-Ssh "mkdir -p $Root/scripts $Root/images/base $Root/tmp"

# ── VM scripts + systemd unit + .env example → /opt/pia/scripts ───────────────────
Info "Uploading VM scripts…"
Get-ChildItem $VmScriptsDir -File | ForEach-Object { Invoke-Scp $_.FullName "$Root/scripts/" }
Invoke-Scp $EnvExample "$Root/scripts/"
Invoke-Ssh "chmod +x $Root/scripts/*.sh"
Good "Scripts uploaded to $Root/scripts."

# ── Base images (one-time / on change) → /opt/pia/images/base ─────────────────────
if ($WithBase) {
  if (-not (Test-Path $ImagesBase)) { throw "No base images staged. Run build.ps1 -Base first." }
  Info "Uploading base images (one-time, large)…"
  Get-ChildItem $ImagesBase -Filter *.tar | ForEach-Object { Invoke-Scp $_.FullName "$Root/images/base/" }
  Invoke-Ssh "rm -f $Root/images/base/.loaded"   # force reload on next setup.sh
  Good "Base images uploaded."
}

$sudoHint = if ($Root -eq '/opt/pia') { 'sudo ' } else { '' }   # rootless dev roots run setup as the owning user
Good "Done. Next on the VM: ${sudoHint}$Root/scripts/setup.sh  then edit $Root/shared/.env"
