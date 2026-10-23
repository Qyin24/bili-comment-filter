# build.ps1 — 打包分享用 zip
#
# 产物：dist/bili-comment-filter-<version>.zip
#   · 解压后只得到「一层」bili-comment-filter 文件夹
#   · manifest.json 在该文件夹根部（这样对方才能直接「加载解压缩的扩展」）

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $root 'manifest.json'

if (-not (Test-Path $manifestPath)) {
  throw "找不到 manifest.json：$manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$folderName = 'bili-comment-filter'
$zipName = "$folderName-v$version.zip"
$distDir = Join-Path $root 'dist'
$stageParent = Join-Path ([System.IO.Path]::GetTempPath()) ("bcf-build-" + [guid]::NewGuid().ToString('N'))
$stageRoot = Join-Path $stageParent $folderName

try {
  New-Item -ItemType Directory -Force -Path $distDir | Out-Null
  New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

  # 只带运行必需的 + 说明文档；不带 test/ 和 dist/
  Copy-Item $manifestPath $stageRoot
  foreach ($item in 'src', 'assets', 'userscript', 'README.md', 'LICENSE') {
    $p = Join-Path $root $item
    if (Test-Path $p) {
      Copy-Item $p -Destination $stageRoot -Recurse
    }
  }
  # userscript/ 整目录里混着构建源码；发布包只保留产物 .user.js
  $userSource = Join-Path $stageRoot 'userscript/source'
  if (Test-Path $userSource) {
    Remove-Item $userSource -Recurse -Force
  }

  $zipPath = Join-Path $distDir $zipName
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

  Compress-Archive -Path $stageRoot -DestinationPath $zipPath -CompressionLevel Optimal

  $sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
  Write-Host "打包完成：$zipPath ($sizeKb KB)"

  # 校验 zip 内的顶层结构
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entries = $zip.Entries | ForEach-Object { $_.FullName }
    $hasManifestAtRoot = $entries -contains ($folderName + '/manifest.json')
    $tops = $entries | ForEach-Object { ($_ -split '/')[0] } | Sort-Object -Unique
    Write-Host ("顶层目录：" + ($tops -join ', '))
    if ($hasManifestAtRoot) {
      Write-Host '校验通过：解压后只有一层文件夹，manifest.json 在其根部。'
    } else {
      Write-Warning '校验失败：manifest.json 不在 zip 根部文件夹下'
      exit 1
    }
  } finally {
    $zip.Dispose()
  }
} finally {
  if (Test-Path $stageParent) {
    Remove-Item $stageParent -Recurse -Force -ErrorAction SilentlyContinue
  }
}
