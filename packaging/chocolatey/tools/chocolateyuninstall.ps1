$ErrorActionPreference = 'Stop'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$destination = Join-Path $toolsDir 'gittriage.exe'
Uninstall-BinFile -Name 'gittriage' -Path $destination
Remove-Item -Force -ErrorAction SilentlyContinue $destination
