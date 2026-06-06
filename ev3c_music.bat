@echo off
cd /d "%~dp0"
echo Iniciando ev3c music en http://localhost:8123 ...
start "" "http://localhost:8123"
python -m http.server 8123
