@echo off
REM Baja la ultima version de Micro Gambit desde GitHub.
cd /d "%~dp0"
git pull --ff-only
if errorlevel 1 (
  echo.
  echo No se pudo actualizar. Mandale captura de esta ventana a Claude.
) else (
  echo.
  echo Listo. Ahora en Opera: extensiones ^> Micro Gambit ^> boton de recargar.
  echo Despues recarga LinkedIn con F5.
)
pause
