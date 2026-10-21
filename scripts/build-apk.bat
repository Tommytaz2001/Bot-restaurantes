@echo off
setlocal
echo ==========================================
echo  Compilando Urbano Chef APK (Android)...
echo ==========================================

cd /d "%~dp0\..\app-chef"
echo.
echo [1/4] Compilando web app con Vite...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo Error en npm run build
    exit /b %ERRORLEVEL%
)

echo.
echo [2/4] Sincronizando con Capacitor Android...
call npx cap sync android
if %ERRORLEVEL% neq 0 (
    echo Error en npx cap sync android
    exit /b %ERRORLEVEL%
)

echo.
echo [3/4] Compilando APK con Gradle...
cd android
call gradlew.bat assembleDebug
if %ERRORLEVEL% neq 0 (
    echo Error en gradlew assembleDebug
    exit /b %ERRORLEVEL%
)

echo.
echo [4/4] Distribuyendo binario APK...
cd /d "%~dp0\.."
copy /Y "app-chef\android\app\build\outputs\apk\debug\app-debug.apk" "UrbanoChef.apk"
if exist "uploads" (
    copy /Y "app-chef\android\app\build\outputs\apk\debug\app-debug.apk" "uploads\UrbanoChef.apk"
)
if exist "volumes\uploads" (
    copy /Y "app-chef\android\app\build\outputs\apk\debug\app-debug.apk" "volumes\uploads\UrbanoChef.apk"
)

echo.
echo ==========================================
echo  APK generado exitosamente: UrbanoChef.apk
echo ==========================================
