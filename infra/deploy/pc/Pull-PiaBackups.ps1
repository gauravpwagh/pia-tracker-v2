# Pull-PiaBackups.ps1 — nightly off-VM backup pull (PC-initiated, read-only).
#
# Runs as a scheduled task on this PC and PULLS backups down from the VM's
# restricted `pia-backup` account (SFTP-only, chrooted to /opt/pia/backup, no
# shell, no write access — see infra/deploy/RUNBOOK.md "Off-VM backups").
#
# The VM never holds credentials that reach back to this PC, so root on the VM
# has no path to touch what lands here — that's the point of pulling instead
# of pushing.
#
# First run must be interactive once (accepts the VM's host key into
# known_hosts); after that it's safe to run unattended via Task Scheduler.

param(
  [Parameter(Mandatory = $true)] [string]$VmHost,
  [string]$VmUser     = 'pia-backup',
  [string]$KeyPath    = "$HOME\.ssh\pia_backup_ed25519",
  [string]$LocalRoot  = 'D:\PIA-Backups',
  [int]$RetentionDays = 30
)

$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "[pia-backup] $m" -ForegroundColor Cyan }
function Good($m) { Write-Host "[pia-backup OK] $m" -ForegroundColor Green }

if (-not (Test-Path $KeyPath)) {
  throw "SSH key not found at $KeyPath — generate it first: ssh-keygen -t ed25519 -f `"$KeyPath`" -C pia-backup-pull"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest  = Join-Path $LocalRoot $stamp
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Info "Pulling from $VmUser@$VmHost into $dest ..."
# The remote account is chrooted to /opt/pia/backup, so "." is that directory's root.
& scp -i $KeyPath -o StrictHostKeyChecking=yes -r "${VmUser}@${VmHost}:." "$dest"
if ($LASTEXITCODE -ne 0) { throw "scp pull failed (exit $LASTEXITCODE)" }
Good "Pull complete: $dest"

# Prune local copies older than RetentionDays (cheap — this is our own disk).
Get-ChildItem -Path $LocalRoot -Directory |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  ForEach-Object {
    Info "Pruning old local backup: $($_.FullName)"
    Remove-Item -Recurse -Force $_.FullName
  }

Good 'Done.'
