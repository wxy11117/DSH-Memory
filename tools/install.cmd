@echo off
rem ---------------------------------------------------------------
rem dsh-hippocampus installer wrapper for Windows.
rem Finds a Node (PATH -> DSH Desktop bundled -> common install dirs)
rem and hands over to tools\install.mjs. No dsh CLI required.
rem
rem   install.cmd                 install into the auto-detected profile
rem   install.cmd -Dry            print the plan, change nothing
rem   install.cmd -Uninstall      undo
rem   install.cmd -CheckNode      just show which node would be used
rem ---------------------------------------------------------------
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
exit /b %ERRORLEVEL%
