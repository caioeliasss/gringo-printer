@echo off
setlocal
set "APP_DIR=%~dp0.."
schtasks /create /f /tn "GringoPrinter" /tr "wscript.exe \"%APP_DIR%\scripts\start-hidden.vbs\"" /sc onlogon
if %errorlevel% neq 0 (
  echo Falha ao criar a tarefa. Execute como administrador se necessario.
) else (
  echo Tarefa "GringoPrinter" criada: o servico iniciara com o Windows, oculto.
)
pause
