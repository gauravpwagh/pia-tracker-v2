<#
.SYNOPSIS
  Compute the incremental delta and produce the transfer bundle for a release.
.DESCRIPTION
  Compares the freshly-built release payload against what was last shipped
  (infra/deploy/.ship-state) and writes, under infra/deploy/out/:
    release-NNN.files.tgz     ONLY the changed/new project files (a few KB/MB)
    app-image.tar (+ .digest) ONLY if the backend image digest changed
    manifest-NNN.txt          the new manifest (committed by deploy.ps1 on success)
  First release (no prior manifest) ships the full payload.
.PARAMETER Release
  The release number (integer), e.g. 12 becomes release-012.
.PARAMETER Full
  Ignore the ship-state and bundle the ENTIRE payload (not just the delta). Use this
  whenever the VM has no matching previous release — e.g. a from-scratch deploy or a
  wiped VM — otherwise deploy.sh has nothing to hardlink the unchanged files from and
  the release ends up missing nginx/postgres/frontend/etc.
#>
param(
  [Parameter(Mandatory)][int]$Release,
  [switch]$Full
)
. "$PSScriptRoot\_common.ps1"

if (-not (Test-Path $ReleasePayload)) { throw "No staged payload. Run build.ps1 first." }
Ensure-Dir $OutDir; Ensure-Dir $ShipState
$name = Release-Name $Release

# 1. Manifest of the current payload (relative path + sha256).
Info "Hashing payload..."
$payloadFull = (Resolve-Path $ReleasePayload).Path
$manifest = [ordered]@{}
Get-ChildItem -Path $ReleasePayload -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($payloadFull.Length + 1) -replace '\\','/'
  $manifest[$rel] = (Get-FileHash -Algorithm SHA256 -Path $_.FullName).Hash
}

# 2. Diff against the last shipped manifest (unless -Full forces the whole payload).
$prevFile = Join-Path $ShipState 'last-manifest.txt'
$prev = @{}
if ($Full) {
  Warn2 "-Full: ignoring ship-state; bundling the ENTIRE payload."
} elseif (Test-Path $prevFile) {
  Get-Content $prevFile | ForEach-Object {
    $p = $_ -split '  ',2; if ($p.Count -eq 2) { $prev[$p[1]] = $p[0] }
  }
} else { Warn2 "No prior manifest. First release ships the FULL payload." }

$changed = @($manifest.Keys | Where-Object { $prev[$_] -ne $manifest[$_] })
$removed = @($prev.Keys | Where-Object { -not $manifest.Contains($_) })
if ($removed.Count -gt 0) {
  Warn2 ("{0} file(s) removed since last release; not auto-deleted on the VM: {1}" -f $removed.Count, ($removed -join ', '))
}

# 3. Tar ONLY the changed files.
$bundle = Join-Path $OutDir "$name.files.tgz"
if (Test-Path $bundle) { Remove-Item $bundle -Force }
$listFile = Join-Path $OutDir "$name.filelist.txt"
Set-Content -Path $listFile -Value ($changed -join "`n") -Encoding ascii
Info ("Bundling {0} changed file(s)..." -f $changed.Count)
if ($changed.Count -gt 0) {
  Exec 'tar' @('-czf', $bundle, '-C', $payloadFull, '-T', $listFile)
} else {
  Warn2 "No file changes (image-only release). Bundling the compose file as a no-op marker."
  Exec 'tar' @('-czf', $bundle, '-C', $payloadFull, 'docker-compose.production.yml')
}

# 4. App image: include only if the digest changed.
$curDigest = (Get-Content (Join-Path $ImagesApp 'backend.digest') -Raw).Trim()
$prevDigestFile = Join-Path $ShipState 'last-backend.digest'
$prevDigest = if (Test-Path $prevDigestFile) { (Get-Content $prevDigestFile -Raw).Trim() } else { '' }
$appTarOut = Join-Path $OutDir 'app-image.tar'
$appDigOut = Join-Path $OutDir 'app-image.digest'
Remove-Item $appTarOut,$appDigOut -ErrorAction SilentlyContinue
if ($Full -or ($curDigest -ne $prevDigest)) {
  # -Full always ships the image: a from-scratch target (fresh VM, new rootless dev
  # store) has nothing loaded, regardless of what the ship-state digest says.
  Info "Including app-image.tar ($(if ($Full) { '-Full bundle' } else { 'backend image changed' }))."
  Copy-Item (Join-Path $ImagesApp 'backend.tar') $appTarOut -Force
  Set-Content -Path $appDigOut -Value $curDigest -NoNewline -Encoding ascii
} else {
  Good "Backend image unchanged. Skipping app image (saves GBs)."
}

# 5. Persist the new manifest for deploy.ps1 to commit on success.
$manifestOut = Join-Path $OutDir "manifest-$name.txt"
($manifest.GetEnumerator() | ForEach-Object { "$($_.Value)  $($_.Key)" }) | Set-Content $manifestOut -Encoding ascii

$size = if (Test-Path $bundle) { (Get-Item $bundle).Length } else { 0 }
$imgNote = if (Test-Path $appTarOut) { ' + app image' } else { '' }
Good ("Packaged {0}: {1} changed file(s), {2:N0} bytes{3}." -f $name, $changed.Count, $size, $imgNote)
Info "Next: deploy_project.ps1 -Release $Release -VmHost <host> -VmUser <user>"

