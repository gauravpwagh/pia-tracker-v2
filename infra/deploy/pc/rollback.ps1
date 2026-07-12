<#
.SYNOPSIS
  Roll the VM back to its previous release (over SSH).
.PARAMETER VmHost  VM hostname/IP.
.PARAMETER VmUser  SSH user (passwordless sudo).
.PARAMETER Root    Deploy root on the VM. Default /opt/pia.
.PARAMETER SshKey  Optional private key path.
#>
param(
  [Parameter(Mandatory)][string]$VmHost,
  [Parameter(Mandatory)][string]$VmUser,
  [string]$Root = '/opt/pia',
  [string]$SshKey
)
. "$PSScriptRoot\_common.ps1"
$sshArgs = @(); if ($SshKey) { $sshArgs += @('-i',$SshKey) }
$target = "$VmUser@$VmHost"

Warn2 "Rolling back $VmHost to its previous release…"
Exec 'ssh' ($sshArgs + @($target, "sudo $Root/scripts/rollback.sh"))
Good "Rollback requested. Verify with: ssh $target `"sudo $Root/scripts/status.sh`""
Warn2 "Note: your local ship-state still reflects the newer release. Re-run build/package before the next deploy if you changed files."

