Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepositoryUrl = 'https://github.com/MJl2517/DnD2024-Battle-Tracker.git'
$BranchName = 'main'

function Get-ProjectRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Assert-GitInstalled {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    throw 'Git is not installed or is not available in PATH.'
  }
}

function Ensure-GitRepository {
  param([string]$Root)

  Push-Location $Root
  try {
    git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
      git init
    }

    $currentBranch = git branch --show-current
    if (-not $currentBranch) {
      git checkout -B $BranchName
    } elseif ($currentBranch -ne $BranchName) {
      git branch -M $BranchName
    }

    $remote = git remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $remote) {
      git remote add origin $RepositoryUrl
    } elseif ($remote.Trim() -ne $RepositoryUrl) {
      git remote set-url origin $RepositoryUrl
    }
  } finally {
    Pop-Location
  }
}

function Assert-SecretFolderIgnored {
  param([string]$Root)

  Push-Location $Root
  try {
    $trackedSecret = git ls-files secret
    if ($trackedSecret) {
      throw "The secret/ folder is tracked by Git. Remove it from the index first: git rm -r --cached secret"
    }

    git check-ignore -q secret
    if ($LASTEXITCODE -ne 0) {
      throw 'The secret/ folder is not ignored by Git. Check .gitignore before pushing.'
    }
  } finally {
    Pop-Location
  }
}
