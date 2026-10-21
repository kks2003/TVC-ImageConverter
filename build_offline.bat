@echo off
echo =========================================
echo Videoton TVC Image Converter V4.3
echo Offline Single-File HTML Build Inditasa...
echo =========================================
echo.
cmd /c "npm run build:offline"
echo.
if %ERRORLEVEL% EQU 0 (
    echo =========================================
    echo SIKERES BUILD!
    echo Fajl masolasa: image2tvc_offline_v4_3.html
    echo =========================================
    copy /Y "dist\index.html" "dist\image2tvc_offline_v4_3.html" >nul
    copy /Y "dist\index.html" "image2tvc_offline_v4_3.html" >nul
    echo.
    echo Fajl inditasa az alapertelmezett browserben...
    start "" "image2tvc_offline_v4_3.html"
) else (
    echo =========================================
    echo HIBA TORTENT A BUILD SORAN!
    echo =========================================
)
echo.
pause
