<#
.SYNOPSIS
  Deploy an app RELEASE to the VM: transfer the delta bundle + switch to it.
.DESCRIPTION
  Sends only what package.ps1 produced (changed files, and the app image only if it
  changed), then runs the VM-side deploy.sh. On success, commits the local ship-state
  so the NEXT package computes the delta correctly.
  (For uploading the VM tooling / base images, use deploy_scripts.ps1.)
.PARAMETER Release   Release number (integer), e.g. 12.
.PARAMETER VmHost    VM hostname/IP.
.PARAMETER VmUser    SSH user (needs passwordless sudo for /opt/pia/scripts/*).
.PARAMETER Root      Deploy root on the VM. Default /opt/pia.
.PARAMETER SshKey    Optional path to a private key.
.PARAMETER NoSudo    Rootless target (the dev stack under the piadev user): run the
                     remote scripts as the SSH user directly, without sudo.
                     Dev example:  -VmUser piadev -Root /opt/piadev -NoSudo
#>
param(
  [Parameter(Mandatory)][int]$Release,
  [Parameter(Mandatory)][string]$VmHost,
  [Parameter(Mandatory)][string]$VmUser,
  [string]$Root = '/opt/pia',
  [string]$SshKey,
  [switch]$NoSudo
)
. "$PSScriptRoot\_common.ps1"
$name = Release-Name $Release
$bundle = Join-Path $OutDir "$name.files.tgz"
if (-not (Test-Path $bundle)) { throw "No bundle for $name. Run package.ps1 -Release $Release first." }

$sshArgs = @(); $scpArgs = @()
if ($SshKey) { $sshArgs += @('-i',$SshKey); $scpArgs += @('-i',$SshKey) }
$target = "$VmUser@$VmHost"
# NOTE: do NOT name these Ssh/Scp — PowerShell resolves `& 'ssh'` to a same-named
# function (case-insensitive, functions beat exes) which would recurse forever.
function Invoke-Ssh([string]$remoteCmd) { Exec 'ssh' ($sshArgs + @($target, $remoteCmd)) }
function Invoke-Scp([string]$local, [string]$remote) { Exec 'scp' ($scpArgs + @($local, "${target}:$remote")) }

Invoke-Ssh "mkdir -p $Root/tmp"

# ── Transfer the delta bundle (+ app image only if present) ───────────────────────
Info "Transferring $name delta…"
Invoke-Scp $bundle "$Root/tmp/$name.files.tgz"
$appTar = Join-Path $OutDir 'app-image.tar'
if (Test-Path $appTar) {
  Info "Transferring app image (backend changed)…"
  Invoke-Scp $appTar "$Root/tmp/app-image.tar"
  Invoke-Scp (Join-Path $OutDir 'app-image.digest') "$Root/tmp/app-image.digest"
} else {
  Invoke-Ssh "rm -f $Root/tmp/app-image.tar $Root/tmp/app-image.digest"   # ensure a stale image isn't reused
}

# ── Run the VM-side deploy ────────────────────────────────────────────────────────
$sudo = if ($NoSudo) { '' } else { 'sudo ' }
Info "Running VM deploy.sh $Release…"
Invoke-Ssh "${sudo}$Root/scripts/deploy.sh $Release"

# ── Commit local ship-state so the next delta is correct ──────────────────────────
Copy-Item (Join-Path $OutDir "manifest-$name.txt") (Join-Path $ShipState 'last-manifest.txt') -Force
Copy-Item (Join-Path $ImagesApp 'backend.digest') (Join-Path $ShipState 'last-backend.digest') -Force
Good "Deployed $name to $VmHost. Status: ssh $target `"${sudo}$Root/scripts/status.sh`""
