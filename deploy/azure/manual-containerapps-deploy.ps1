<#
════════════════════════════════════════════════════════════
xCloudPMIS — Manual Azure Container Apps Deploy
════════════════════════════════════════════════════════════

用途：
  在 GitHub Actions 因 Billing / spending limit 無法執行時，
  從本機直接使用 Azure CLI 進行部署。

流程：
  1. 使用 Azure Container Registry Tasks 建置 backend image
  2. 使用 Azure Container Registry Tasks 建置 frontend image
  3. 更新 Azure Container Apps backend
  4. 取得 backend internal FQDN
  5. 更新 Azure Container Apps frontend 並設定 BACKEND_HOST
  6. 驗證正式網址 /health 與 /api/health

前置條件：
  - 已安裝 Azure CLI
  - 已執行 az login
  - Azure 帳號具備 ACR build 與 Container Apps update 權限

範例：
  ./deploy/azure/manual-containerapps-deploy.ps1
  ./deploy/azure/manual-containerapps-deploy.ps1 -Version 20260506-83a26ae
#>

[CmdletBinding()]
param(
  [string]$ResourceGroup = 'pmis',
  [string]$AcrName = 'pmisacr3490',
  [string]$BackendApp = 'pmis-backend',
  [string]$FrontendApp = 'pmis-frontend',
  [string]$Version = '',
  [string]$ViteApiUrl = '/api',
  [string]$PublicUrl = 'https://pmis.cloudinfo.com.tw',
  [string]$Subscription = ''
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "▶ $Message" -ForegroundColor Cyan
}

function Invoke-HealthCheck([string]$Url, [string]$Name) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 30
    Write-Host "✅ $Name：$($response.StatusCode) $Url" -ForegroundColor Green
  } catch {
    Write-Host "⚠️ $Name 失敗：$Url" -ForegroundColor Yellow
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Step '確認 Azure CLI 與工作目錄'
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  throw '找不到 Azure CLI，請先安裝 az CLI。'
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot
Write-Host "Repo：$repoRoot"

if ($Subscription) {
  Write-Step "切換 Azure subscription：$Subscription"
  az account set --subscription $Subscription | Out-Null
}

$account = az account show --query '{name:name,id:id,user:user.name}' -o json | ConvertFrom-Json
Write-Host "Azure：$($account.name) / $($account.id) / $($account.user)"

if (-not $Version) {
  $shortSha = (git rev-parse --short HEAD).Trim()
  $Version = "$(Get-Date -Format yyyyMMdd)-$shortSha"
}

$acrLoginServer = "$AcrName.azurecr.io"
$backendImage = "$acrLoginServer/pmis-backend:$Version"
$frontendImage = "$acrLoginServer/pmis-frontend:$Version"

Write-Host ""
Write-Host '════════════════════════════════════════════════'
Write-Host ' xCloudPMIS Manual Deploy'
Write-Host " Resource Group：$ResourceGroup"
Write-Host " ACR：$acrLoginServer"
Write-Host " Version：$Version"
Write-Host " Backend：$backendImage"
Write-Host " Frontend：$frontendImage"
Write-Host '════════════════════════════════════════════════'

Write-Step '建置並推送 Backend image 到 ACR'
az acr build `
  --registry $AcrName `
  --image "pmis-backend:$Version" `
  --image 'pmis-backend:latest' `
  --file 'docker/backend/Dockerfile.prod' `
  .

Write-Step '建置並推送 Frontend image 到 ACR'
az acr build `
  --registry $AcrName `
  --image "pmis-frontend:$Version" `
  --image 'pmis-frontend:latest' `
  --file 'docker/frontend/Dockerfile.prod' `
  --build-arg "VITE_API_URL=$ViteApiUrl" `
  --build-arg "VITE_APP_VERSION=$Version" `
  .

Write-Step '更新 Backend Container App'
az containerapp update `
  --name $BackendApp `
  --resource-group $ResourceGroup `
  --image $backendImage | Out-Null

Write-Step '取得 Backend internal FQDN'
$backendFqdn = (az containerapp show `
  --name $BackendApp `
  --resource-group $ResourceGroup `
  --query properties.configuration.ingress.fqdn `
  -o tsv).Trim()
Write-Host "Backend FQDN：$backendFqdn"

Write-Step '更新 Frontend Container App'
az containerapp update `
  --name $FrontendApp `
  --resource-group $ResourceGroup `
  --image $frontendImage `
  --set-env-vars "BACKEND_HOST=$backendFqdn" | Out-Null

Write-Step '等待部署穩定'
Start-Sleep -Seconds 30

$frontendFqdn = (az containerapp show `
  --name $FrontendApp `
  --resource-group $ResourceGroup `
  --query properties.configuration.ingress.fqdn `
  -o tsv).Trim()

$actualBackendImage = (az containerapp show --name $BackendApp --resource-group $ResourceGroup --query properties.template.containers[0].image -o tsv).Trim()
$actualFrontendImage = (az containerapp show --name $FrontendApp --resource-group $ResourceGroup --query properties.template.containers[0].image -o tsv).Trim()

Write-Step '驗證部署結果'
Write-Host "Backend image：$actualBackendImage"
Write-Host "Frontend image：$actualFrontendImage"
Write-Host "Frontend URL：https://$frontendFqdn"
Write-Host "Public URL：$PublicUrl"

Invoke-HealthCheck "https://$frontendFqdn/health" 'Container Apps 前端健康檢查'
Invoke-HealthCheck "https://$frontendFqdn/api/health" 'Container Apps API 健康檢查'
if ($PublicUrl) {
  Invoke-HealthCheck "$PublicUrl/health" '正式網域前端健康檢查'
  Invoke-HealthCheck "$PublicUrl/api/health" '正式網域 API 健康檢查'
}

Write-Host ""
Write-Host '✅ Manual deploy completed.' -ForegroundColor Green
Write-Host "Version：$Version"
Write-Host "URL：$PublicUrl"