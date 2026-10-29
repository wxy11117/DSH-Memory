<#
.SYNOPSIS
  把 dsh-hippocampus 装进一个 DSH profile —— 自动寻找 Node 22+，不需要 dsh 命令行。

.DESCRIPTION
  它只做一件事：找到本机能运行 ESM 的 Node 22+（含 DSH 桌面版自带的运行时），
  然后把参数原样交给 tools/install.mjs。所有真正的逻辑都在那个 .mjs 里，这里不重复实现。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\install.ps1
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Dry
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Uninstall
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Profile "$env:APPDATA\dsh-desktop\harness\profiles\web"
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$Dry,
  [string]$Profile,
  [switch]$CheckNode,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# 统一走 [Console]::Out（而不是 Write-Host）：Write-Host 在 stdout 被重定向时抓不到内容，
# 而安装器的输出经常要进日志、被测试断言、被 CI 收集。
function Write-Info($m) { [Console]::Out.WriteLine([string]$m) }
function Write-Bad($m)  { [Console]::Out.WriteLine([string]$m) }
function Write-Ok($m)   { [Console]::Out.WriteLine([string]$m) }

if ($Help) {
  $usage = @"
用法（Windows）：
  powershell -ExecutionPolicy Bypass -File tools\install.ps1                 装进自动找到的 profile
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Dry            只打印计划，不改文件
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Uninstall      撤销
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -Profile <目录> 指定 profile
  powershell -ExecutionPolicy Bypass -File tools\install.ps1 -CheckNode      只查「用哪个 node」然后退出

为什么要这个脚本：桌面版 DSH 用户机器上**不一定有 `node` 命令**（DSH 自己是 Electron，
它自带的 node 不一定在 PATH 里）。这个脚本负责把 node 找出来，再调 tools/install.mjs。
"@
Write-Info $usage
  exit 0
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$installer = Join-Path $here 'install.mjs'
if (-not (Test-Path -LiteralPath $installer)) {
  Write-Bad "找不到 $installer —— 这个脚本要和 install.mjs 放在同一个 tools 目录里。"
  exit 1
}

# ── 找 node ────────────────────────────────────────────────────────────
# 顺序：显式指定 > PATH 上的真 node.exe > 常见安装位 > DSH 自带 node.exe > DSH 的 shim。
# 为什么 shim 排最后：桌面版 DSH 在 %APPDATA%\dsh-desktop\harness\.desktop-bin\ 放了一个
# node.cmd，它是用 ELECTRON_RUN_AS_NODE 跑 DSH Desktop.exe。实测它能跑普通脚本（v24.17.0），
# 但对少数依赖终端/管道的脚本会静默失败，所以真 node.exe 优先。
function Find-Node {
  $found = @()

  if ($env:DSH_HIPPOCAMPUS_NODE -and (Test-Path -LiteralPath $env:DSH_HIPPOCAMPUS_NODE -PathType Leaf)) {
    $found += [pscustomobject]@{ Path = $env:DSH_HIPPOCAMPUS_NODE; From = '环境变量 DSH_HIPPOCAMPUS_NODE'; Kind = $(if ([IO.Path]::GetExtension($env:DSH_HIPPOCAMPUS_NODE) -eq '.exe') { 'real' } else { 'shim' }) }
  }

  foreach ($cmd in @(Get-Command node.exe -All -CommandType Application -ErrorAction SilentlyContinue)) {
    $found += [pscustomobject]@{ Path = $cmd.Source; From = 'PATH'; Kind = 'real' }
  }

  foreach ($location in @(
      @{ Root = $env:ProgramFiles; Tail = 'nodejs\node.exe' },
      @{ Root = ${env:ProgramFiles(x86)}; Tail = 'nodejs\node.exe' },
      @{ Root = $env:LOCALAPPDATA; Tail = 'Programs\nodejs\node.exe' },
      @{ Root = $env:APPDATA; Tail = 'npm\node.exe' }
    )) {
    if (-not $location.Root) { continue }
    $cand = Join-Path $location.Root $location.Tail
    if (Test-Path -LiteralPath $cand -PathType Leaf) { $found += [pscustomobject]@{ Path = $cand; From = '常见安装位'; Kind = 'real' } }
  }

  foreach ($location in @(
      @{ Root = $env:LOCALAPPDATA; Tail = 'Programs\DSH Desktop' },
      @{ Root = $env:ProgramFiles; Tail = 'DSH Desktop' }
    )) {
    if (-not $location.Root) { continue }
    $root = Join-Path $location.Root $location.Tail
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
    foreach ($hit in @(Get-ChildItem -LiteralPath $root -Filter node.exe -Recurse -File -ErrorAction SilentlyContinue | Sort-Object Length -Descending)) {
      $found += [pscustomobject]@{ Path = $hit.FullName; From = 'DSH 自带 node.exe'; Kind = 'real' }
    }
  }

  foreach ($any in @(Get-Command node -All -CommandType Application -ErrorAction SilentlyContinue)) {
    $found += [pscustomobject]@{ Path = $any.Source; From = "PATH 上的 $([IO.Path]::GetFileName($any.Source))"; Kind = 'shim' }
  }
  if ($env:APPDATA) {
    $binShim = Join-Path $env:APPDATA 'dsh-desktop\harness\.desktop-bin\node.cmd'
    if (Test-Path -LiteralPath $binShim -PathType Leaf) { $found += [pscustomobject]@{ Path = $binShim; From = 'DSH 桌面版 shim'; Kind = 'shim' } }
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  return @($found | Where-Object { $seen.Add([IO.Path]::GetFullPath($_.Path)) })
}

# 不能只看 -v：Electron shim 可能打印版本却没有实际执行脚本。
# 用同一个临时 .mjs 探测 ESM 执行、退出码和真实 Node 版本，不接触任何 DSH 配置。
function Test-NodeCandidate($candidate, $probePath) {
  try {
    $global:LASTEXITCODE = $null
    $output = @(& $candidate.Path $probePath 2>&1)
    if ($null -eq $global:LASTEXITCODE -or $global:LASTEXITCODE -ne 0) {
      return [pscustomobject]@{ Ok = $false; Reason = "探测执行失败（退出码 $global:LASTEXITCODE）" }
    }
    $match = [regex]::Match(($output -join "`n"), '(?m)^DSH_HIPPOCAMPUS_NODE_VERSION=(?<version>(?<major>\d+)\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\s*$')
    if (-not $match.Success) {
      return [pscustomobject]@{ Ok = $false; Reason = '没有收到 ESM 探测结果' }
    }
    if ([int]$match.Groups['major'].Value -lt 22) {
      return [pscustomobject]@{ Ok = $false; Reason = "需要 Node 22+，检测到 $($match.Groups['version'].Value)" }
    }
    return [pscustomobject]@{ Ok = $true; Version = $match.Groups['version'].Value }
  } catch {
    return [pscustomobject]@{ Ok = $false; Reason = "无法运行：$($_.Exception.Message)" }
  }
}

$nodes = @(Find-Node)
$chosen = $null
$probePath = Join-Path ([IO.Path]::GetTempPath()) ('dsh-hp-node-probe-' + [guid]::NewGuid().ToString('N') + '.mjs')
try {
  $probeSource = "import { basename } from 'node:path';`nif (!basename(import.meta.url)) throw new Error('ESM probe failed');`nprocess.stdout.write('DSH_HIPPOCAMPUS_NODE_VERSION=' + process.versions.node + '\n');`n"
  [IO.File]::WriteAllText($probePath, $probeSource, [System.Text.UTF8Encoding]::new($false))
  foreach ($candidate in $nodes) {
    $checked = Test-NodeCandidate $candidate $probePath
    if ($checked.Ok) {
      $chosen = [pscustomobject]@{ Path = $candidate.Path; From = $candidate.From; Kind = $candidate.Kind; Version = $checked.Version }
      break
    }
    Write-Info "跳过 Node：$($candidate.Path)（$($checked.Reason)）"
  }
} finally {
  if (Test-Path -LiteralPath $probePath) { Remove-Item -LiteralPath $probePath -ErrorAction SilentlyContinue }
}

if ($CheckNode) {
  if (-not $chosen) {
    Write-Bad '没有找到能运行 ESM 的 Node 22+。'
    Write-Info '装一个 Node 22+（https://nodejs.org），或者设 DSH_HIPPOCAMPUS_NODE=<node.exe 路径> 后重跑。'
    exit 1
  }
  Write-Ok "用这个 node：$($chosen.Path)"
  Write-Info "  来源：$($chosen.From)　类型：$(if ($chosen.Kind -eq 'shim') { 'shim（Electron 托管，能跑普通脚本）' } else { '真 node.exe' })"
  Write-Info "  已验证版本：v$($chosen.Version)（ESM 脚本执行成功）"
  exit 0
}

if (-not $chosen) {
  Write-Bad '没找到可用的 Node 22+ —— 所有候选均不存在或未通过 ESM 执行检查。'
  Write-Info ''
  Write-Info '三条路，任选一条：'
  Write-Info '  1. 装 Node（https://nodejs.org，选 LTS 即可），然后重跑本脚本；'
  Write-Info '  2. 设环境变量指定一个：$env:DSH_HIPPOCAMPUS_NODE = "C:\path\to\node.exe"；'
  Write-Info '  3. 手工装：把本目录的上层文件夹加进 profile 的 dependencies 与 dsh.profile.bundles'
  Write-Info '     （README 的「手工登记」一节有逐行说明）。'
  exit 1
}

if ($nodes.Count -gt 1 -and -not $env:DSH_HIPPOCAMPUS_NODE_QUIET) {
  Write-Info "用 node：$($chosen.Path)（$($chosen.From)）"
}

# ── 把参数原样交给 install.mjs ─────────────────────────────────────────
$extra = @()
if ($Uninstall) { $extra += '--uninstall' }
if ($Dry) { $extra += '--dry' }
if ($Profile) { $extra += @('--profile', $Profile) }

try {
  $global:LASTEXITCODE = $null
  & $chosen.Path $installer @extra
  $code = $global:LASTEXITCODE
  if ($null -eq $code) { exit 1 }
  exit $code
} catch {
  Write-Bad "安装器启动失败：$($_.Exception.Message)"
  exit 1
}
