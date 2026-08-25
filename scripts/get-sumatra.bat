@echo off
rem Baixa o SumatraPDF portavel para vendor\SumatraPDF.exe (impressao silenciosa)
setlocal
cd /d "%~dp0.."

if exist "vendor\SumatraPDF.exe" (
  echo SumatraPDF ja existe em vendor\SumatraPDF.exe
  pause
  exit /b 0
)

where curl >nul 2>nul
if %errorlevel% neq 0 (
  echo curl nao encontrado. Baixe manualmente de:
  echo   https://www.sumatrapdfreader.org/download-free-pdf-viewer
  echo e coloque o executavel em vendor\SumatraPDF.exe
  pause
  exit /b 1
)

echo Baixando SumatraPDF portavel...
curl -L -f -o "%TEMP%\SumatraPDF-64.zip" https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip
if %errorlevel% neq 0 (
  echo Falha no download. Baixe manualmente e coloque em vendor\SumatraPDF.exe
  pause
  exit /b 1
)

if not exist vendor mkdir vendor
powershell -NoProfile -Command "Expand-Archive -Force '%TEMP%\SumatraPDF-64.zip' 'vendor'"
powershell -NoProfile -Command "$exe = Get-ChildItem -Recurse -Filter 'SumatraPDF*.exe' 'vendor' | Select-Object -First 1; if ($exe) { Move-Item -Force $exe.FullName 'vendor\SumatraPDF.exe' }"
del "%TEMP%\SumatraPDF-64.zip"

if exist "vendor\SumatraPDF.exe" (
  echo Concluido: vendor\SumatraPDF.exe
) else (
  echo Extracao falhou. Coloque manualmente o SumatraPDF.exe em vendor\
)
pause
