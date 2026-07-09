. "$PSScriptRoot\git-common.ps1"

Assert-GitInstalled
$root = Get-ProjectRoot
Ensure-GitRepository -Root $root
Assert-SecretFolderIgnored -Root $root

Push-Location $root
try {
  git pull --rebase origin $BranchName
} finally {
  Pop-Location
}
