@echo off
setlocal
cd /d "%~dp0"
"C:\Program Files\nodejs\npm.cmd" run dev -- --port 3000
