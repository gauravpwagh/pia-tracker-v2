<#
.SYNOPSIS
  Same as build.ps1, but with the TEMPORARY WAF-override frontend build flags on
  (VITE_WAF_METHOD_OVERRIDE=true, VITE_WAF_PROXY_UPLOAD=true). See HANDOVER.md.
.DESCRIPTION
  Thin wrapper — all real build logic lives in build.ps1. This just forwards whatever
  args you pass, plus -WafOverride. Delete this file (and the -WafOverride param in
  build.ps1) once the network team's WAF allows PATCH/PUT/DELETE/OPTIONS through
  directly to the VM.
.PARAMETER Base
  Also pull + save the base images. Only needed the first time or when a base image
  version changes.
.PARAMETER SkipFrontend
  Skip the frontend build (reuse the dist already in staging).
.PARAMETER SkipBackend
  Skip the backend image build (reuse the tar already in staging).
#>
param(
  [switch]$Base,
  [switch]$SkipFrontend,
  [switch]$SkipBackend
)
& "$PSScriptRoot\build.ps1" @PSBoundParameters -WafOverride
