param(
  [int]$Port = 4173,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
$indexPath = Join-Path $distRoot 'index.html'

if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
  Write-Host '没有找到已构建的 App 文件。请先运行 pnpm run build。' -ForegroundColor Red
  exit 1
}

$prefix = "http://127.0.0.1:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "无法启动本地服务：$prefix" -ForegroundColor Red
  Write-Host '端口可能已被占用。关闭占用该端口的程序后再试。'
  exit 1
}

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'
  '.png' = 'image/png'
  '.woff' = 'font/woff'
  '.woff2' = 'font/woff2'
}

Write-Host "App 已在本机运行：$prefix" -ForegroundColor Green
Write-Host '服务只接受本机连接。保持此窗口打开；按 Ctrl+C 可停止。'
if (-not $NoBrowser) {
  Start-Process $prefix
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response

    try {
      if ($context.Request.HttpMethod -notin @('GET', 'HEAD')) {
        $response.StatusCode = 405
        $response.Close()
        continue
      }

      $relativePath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = 'index.html'
      }
      $relativePath = $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $targetPath = [System.IO.Path]::GetFullPath((Join-Path $distRoot $relativePath))
      $rootPrefix = $distRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
      $insideDist = $targetPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or $targetPath -eq $indexPath

      if (-not $insideDist) {
        $response.StatusCode = 403
        $response.Close()
        continue
      }

      if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
        if ([System.IO.Path]::HasExtension($targetPath)) {
          $response.StatusCode = 404
          $response.Close()
          continue
        }
        $targetPath = $indexPath
      }

      $bytes = [System.IO.File]::ReadAllBytes($targetPath)
      $extension = [System.IO.Path]::GetExtension($targetPath).ToLowerInvariant()
      $contentType = $mimeTypes[$extension]
      if ([string]::IsNullOrEmpty($contentType)) {
        $contentType = 'application/octet-stream'
      }
      $response.StatusCode = 200
      $response.ContentType = $contentType
      $response.ContentLength64 = $bytes.LongLength
      $response.Headers['X-Content-Type-Options'] = 'nosniff'
      if ($context.Request.HttpMethod -eq 'GET') {
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      $response.Close()
    } catch {
      try {
        $response.StatusCode = 500
        $response.Close()
      } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
