$ErrorActionPreference = 'Stop'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$destination = Join-Path $toolsDir 'nexus.exe'
Uninstall-BinFile -Name 'nexus' -Path $destination
Remove-Item -Force -ErrorAction SilentlyContinue $destination
