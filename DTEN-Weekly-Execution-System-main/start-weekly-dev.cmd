@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
"C:\Program Files\nodejs\npm.cmd" run dev -- -p 3000
