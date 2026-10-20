' Lo ejecuta la tarea programada "Apply Assistant - actualizar": git pull sin abrir ventanas.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "git -C """ & dir & """ pull --ff-only", 0, True
