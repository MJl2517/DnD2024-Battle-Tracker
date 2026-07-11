param(
  [string]$Tag = "",
  [string]$Title = "",
  [switch]$Build,
  [switch]$AllowDirty,
  [switch]$Draft,
  [switch]$Prerelease,
  [switch]$SkipPush
)

. "$PSScriptRoot\git-common.ps1"

function Get-PackageVersion {
  param([string]$Root)

  $packagePath = Join-Path $Root "package.json"
  $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  return [string]$package.version
}

function Get-GitHubRepository {
  param([string]$RemoteUrl)

  $normalized = $RemoteUrl.Trim()
  if ($normalized -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(\.git)?$") {
    return @{
      Owner = $Matches.owner
      Repo = $Matches.repo
    }
  }

  throw "Cannot detect GitHub owner/repo from origin URL: $RemoteUrl"
}

function Assert-CleanWorkTree {
  param([switch]$AllowDirty)

  if ($AllowDirty) {
    return
  }

  $changes = git status --porcelain --untracked-files=no
  if ($changes) {
    throw "There are uncommitted tracked changes. Commit them first or rerun with -AllowDirty."
  }
}

function Get-ReleaseArtifacts {
  param(
    [string]$Root,
    [string]$Version
  )

  $releaseDir = Join-Path $Root "release"
  $installerName = "DnD-2024-Battle-Tracker-Setup-$Version.exe"
  $installerPath = Join-Path $releaseDir $installerName
  $blockmapPath = "$installerPath.blockmap"
  $latestPath = Join-Path $releaseDir "latest.yml"

  $required = @($installerPath, $blockmapPath, $latestPath)
  foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Release artifact is missing: $path`nRun npm.cmd run dist before publishing."
    }
  }

  return @(
    Get-Item -LiteralPath $installerPath,
    Get-Item -LiteralPath $blockmapPath,
    Get-Item -LiteralPath $latestPath
  )
}

function Ensure-ReleaseTag {
  param([string]$TagName)

  $existingTag = git tag --list $TagName
  if (-not $existingTag) {
    git tag -a $TagName -m "Release $TagName"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to create git tag $TagName."
    }
  }
}

function Push-BranchAndTag {
  param(
    [string]$Branch,
    [string]$TagName
  )

  git push -u origin $Branch
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to push branch $Branch."
  }

  git push origin $TagName
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to push tag $TagName."
  }
}

function Publish-WithGitHubCli {
  param(
    [string]$TagName,
    [string]$ReleaseTitle,
    [array]$Artifacts,
    [switch]$Draft,
    [switch]$Prerelease
  )

  $existingRelease = gh release view $TagName --json tagName 2>$null
  if ($LASTEXITCODE -eq 0 -and $existingRelease) {
    $artifactPaths = $Artifacts | ForEach-Object { $_.FullName }
    gh release upload $TagName @artifactPaths --clobber
    if ($LASTEXITCODE -ne 0) {
      throw "GitHub CLI failed to upload release assets."
    }
    return
  }

  $args = @("release", "create", $TagName, "--title", $ReleaseTitle, "--generate-notes")
  if ($Draft) {
    $args += "--draft"
  }
  if ($Prerelease) {
    $args += "--prerelease"
  }
  $args += ($Artifacts | ForEach-Object { $_.FullName })

  gh @args
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI failed to create release."
  }
}

function Invoke-GitHubJson {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body = $null
  )

  $parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $parameters.Body = ($Body | ConvertTo-Json -Depth 8)
    $parameters.ContentType = "application/json"
  }

  return Invoke-RestMethod @parameters
}

function Get-GitHubReleaseByTag {
  param(
    [string]$Owner,
    [string]$Repo,
    [string]$TagName,
    [hashtable]$Headers
  )

  try {
    return Invoke-GitHubJson -Method "GET" -Uri "https://api.github.com/repos/$Owner/$Repo/releases/tags/$TagName" -Headers $Headers
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) {
      return $null
    }
    throw
  }
}

function Publish-WithGitHubApi {
  param(
    [string]$Owner,
    [string]$Repo,
    [string]$TagName,
    [string]$ReleaseTitle,
    [array]$Artifacts,
    [switch]$Draft,
    [switch]$Prerelease
  )

  $token = $env:GH_TOKEN
  if (-not $token) {
    $token = $env:GITHUB_TOKEN
  }
  if (-not $token) {
    throw "GitHub CLI is not available and GH_TOKEN/GITHUB_TOKEN is not set."
  }

  $headers = @{
    Authorization = "Bearer $token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "DnD-2024-Battle-Tracker-release-script"
  }

  $release = Get-GitHubReleaseByTag -Owner $Owner -Repo $Repo -TagName $TagName -Headers $headers
  if (-not $release) {
    $body = @{
      tag_name = $TagName
      name = $ReleaseTitle
      draft = [bool]$Draft
      prerelease = [bool]$Prerelease
      generate_release_notes = $true
    }
    $release = Invoke-GitHubJson -Method "POST" -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -Headers $headers -Body $body
  }

  foreach ($artifact in $Artifacts) {
    $existingAsset = $release.assets | Where-Object { $_.name -eq $artifact.Name } | Select-Object -First 1
    if ($existingAsset) {
      Invoke-GitHubJson -Method "DELETE" -Uri "https://api.github.com/repos/$Owner/$Repo/releases/assets/$($existingAsset.id)" -Headers $headers | Out-Null
    }

    $assetName = [System.Uri]::EscapeDataString($artifact.Name)
    $uploadUrl = $release.upload_url -replace "\{\?name,label\}", "?name=$assetName"
    Invoke-RestMethod -Method "POST" -Uri $uploadUrl -Headers $headers -InFile $artifact.FullName -ContentType "application/octet-stream" | Out-Null
  }
}

Assert-GitInstalled
$root = Get-ProjectRoot
Ensure-GitRepository -Root $root
Assert-SecretFolderIgnored -Root $root

Push-Location $root
try {
  if ($Build) {
    npm.cmd run dist
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  Assert-CleanWorkTree -AllowDirty:$AllowDirty

  $version = Get-PackageVersion -Root $root
  if (-not $Tag) {
    $Tag = "v$version"
  }
  if (-not $Title) {
    $Title = "DnD 2024 Battle Tracker $version"
  }

  $artifacts = Get-ReleaseArtifacts -Root $root -Version $version
  $currentBranch = git branch --show-current
  if (-not $currentBranch) {
    $currentBranch = $BranchName
  }

  Ensure-ReleaseTag -TagName $Tag
  if (-not $SkipPush) {
    Push-BranchAndTag -Branch $currentBranch -TagName $Tag
  }

  $remoteUrl = git remote get-url origin
  $repo = Get-GitHubRepository -RemoteUrl $remoteUrl

  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if ($gh) {
    Publish-WithGitHubCli -TagName $Tag -ReleaseTitle $Title -Artifacts $artifacts -Draft:$Draft -Prerelease:$Prerelease
  } else {
    Publish-WithGitHubApi -Owner $repo.Owner -Repo $repo.Repo -TagName $Tag -ReleaseTitle $Title -Artifacts $artifacts -Draft:$Draft -Prerelease:$Prerelease
  }

  Write-Host "Release $Tag was published with assets:"
  foreach ($artifact in $artifacts) {
    Write-Host " - $($artifact.Name)"
  }
} finally {
  Pop-Location
}
