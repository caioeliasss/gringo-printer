' Inicia o Gringo Printer sem janela visivel (usado pela tarefa agendada)
' GRINGO_NO_BROWSER evita abrir o painel no navegador a cada logon do Windows
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = dir
shell.Environment("PROCESS")("GRINGO_NO_BROWSER") = "1"
shell.Run "node index.js", 0, False
