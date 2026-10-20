' Lo ejecuta la tarea programada "Apply Assistant - actualizar": git pull sin abrir ventanas.
' GIT_TERMINAL_PROMPT=0: si Git necesitara contraseña, falla en vez de quedar colgado esperando.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.Environment("PROCESS")("GIT_TERMINAL_PROMPT") = "0"
sh.Run "git -C """ & dir & """ pull --ff-only", 0, True
