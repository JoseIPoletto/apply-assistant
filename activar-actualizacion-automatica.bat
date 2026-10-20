@echo off
REM Crea una tarea de Windows que baja la ultima version de GitHub cada hora, sin ventanas.
REM La extension detecta la version nueva y se recarga sola.
cd /d "%~dp0"
schtasks /create /f /tn "Apply Assistant - actualizar" /sc hourly /tr "wscript.exe \"%~dp0actualizar-silencioso.vbs\"" || goto :error
schtasks /run /tn "Apply Assistant - actualizar" >nul
echo.
echo Listo: se actualiza sola cada hora.
echo Para desactivarla: schtasks /delete /tn "Apply Assistant - actualizar" /f
pause
exit /b
:error
echo.
echo No se pudo crear la tarea. Mandale captura de esta ventana a Claude.
pause
