$ErrorActionPreference = 'Stop'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$version = $env:ChocolateyPackageVersion
if (-not $version) { $version = '0.1.1' }

$url64 = "https://github.com/bmmaral/gittriage/releases/download/v$version/gittriage-v$version-x86_64-pc-windows-msvc.exe"
$checksum64 = 'REPLACE_WITH_SHA256_FROM_RELEASE'

# After each release, set checksum64 from the uploaded .sha256 file:
# https://github.com/bmmaral/gittriage/releases/download/v$version/gittriage-v$version-x86_64-pc-windows-msvc.exe.sha256

$destination = Join-Path $toolsDir 'gittriage.exe'
Get-ChocolateyWebFile -PackageName 'gittriage' -FileFullPath $destination -Url64 $url64 -Checksum64 $checksum64 -ChecksumType64 'sha256'
Install-BinFile -Name 'gittriage' -Path $destination
