@echo off
cd /d "%~dp0"
echo Actualizando lista de exclusion (tus playlists)...
python scripts\build_excluded.py
echo Iniciando ev3c music en http://localhost:8123 ...
start "" "http://localhost:8123"
python -m http.server 8123
