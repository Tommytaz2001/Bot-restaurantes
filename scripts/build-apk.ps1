# Script para generar APK de Urbano Chef (Capacitor Android)
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Compilando Urbano Chef APK (Android)..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$rootDir = Split-Path -Parent $PSScriptRoot
$appChefDir = Join-Path $rootDir "app-chef"
$androidDir = Join-Path $appChefDir "android"
$gradlewBat = Join-Path $androidDir "gradlew.bat"
$outputApk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
$destRootApk = Join-Path $rootDir "UrbanoChef.apk"
$destUploadsApk = Join-Path $rootDir "uploads\UrbanoChef.apk"
$destVolumesApk = Join-Path $rootDir "volumes\uploads\UrbanoChef.apk"

# 1. Compilar bundle web con Vite
Write-Host "`n[1/4] Compilando web app con Vite..." -ForegroundColor Yellow
Set-Location $appChefDir
npm run build

# 2. Sincronizar Capacitor
Write-Host "`n[2/4] Sincronizando con Capacitor Android..." -ForegroundColor Yellow
npx cap sync android

# 3. Compilar APK con Gradle
Write-Host "`n[3/4] Compilando APK con Gradle..." -ForegroundColor Yellow
Set-Location $androidDir
& $gradlewBat assembleDebug

# 4. Copiar APK a la raiz y carpeta uploads
Write-Host "`n[4/4] Distribuyendo binario APK..." -ForegroundColor Yellow
if (Test-Path $outputApk) {
    Copy-Item $outputApk -Destination $destRootApk -Force
    Write-Host "[OK] Copiado a: $destRootApk" -ForegroundColor Green
    
    if (Test-Path (Split-Path $destUploadsApk)) {
        Copy-Item $outputApk -Destination $destUploadsApk -Force
        Write-Host "[OK] Copiado a: $destUploadsApk" -ForegroundColor Green
    }
    if (Test-Path (Split-Path $destVolumesApk)) {
        Copy-Item $outputApk -Destination $destVolumesApk -Force
        Write-Host "[OK] Copiado a: $destVolumesApk" -ForegroundColor Green
    }
    
    $fileInfo = Get-Item $destRootApk
    $sizeMb = [math]::Round($fileInfo.Length / 1MB, 2)
    Write-Host "`nAPK generado con exito!" -ForegroundColor Cyan
    Write-Host "Tamano: $sizeMb MB | Fecha: $($fileInfo.LastWriteTime)" -ForegroundColor Cyan
} else {
    Write-Host "Error: No se encontro el archivo generado en $outputApk" -ForegroundColor Red
    exit 1
}

Set-Location $rootDir
