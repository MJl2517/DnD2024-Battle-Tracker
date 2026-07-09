param(
  [string]$Message = "Update DnD 2024 Battle Tracker"
)

. "$PSScriptRoot\git-common.ps1"

Assert-GitInstalled
$root = Get-ProjectRoot
Ensure-GitRepository -Root $root
Assert-SecretFolderIgnored -Root $root

Push-Location $root
try {
  git status --short
  git add -A
  Assert-SecretFolderIgnored -Root $root

  $staged = git diff --cached --name-only
  if (-not $staged) {
    Write-Host 'No staged changes to commit.'
  } else {
    git commit -m $Message
  }

  git push -u origin $BranchName
} finally {
  Pop-Location
}
