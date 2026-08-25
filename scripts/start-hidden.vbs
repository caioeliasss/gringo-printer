' Inicia o Gringo Printer sem janela visivel (usado pela tarefa agendada)
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = dir
shell.Run "node index.js", 0, False
