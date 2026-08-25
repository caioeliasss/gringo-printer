@echo off
schtasks /delete /f /tn "GringoPrinter"
if %errorlevel% neq 0 (
  echo Nao foi possivel remover a tarefa.
) else (
  echo Tarefa "GringoPrinter" removida.
)
pause
