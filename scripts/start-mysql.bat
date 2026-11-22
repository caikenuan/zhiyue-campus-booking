@echo off
chcp 65001 >nul
setlocal
set "TOOLS=%USERPROFILE%\zhiyue-tools"
set "MYSQL=%TOOLS%\mysql"
set "DATA=%TOOLS%\mysql-data"

if not exist "%MYSQL%\bin\mysqld.exe" (
  echo 未安装本地 MySQL，请先运行 scripts\setup-mysql.bat
  pause
  exit /b 1
)

tasklist /FI "IMAGENAME eq mysqld.exe" 2>nul | findstr /I "mysqld.exe" >nul
if not errorlevel 1 (
  echo MySQL 已在运行。
  exit /b 0
)

start "智约-MySQL" /min "%MYSQL%\bin\mysqld.exe" --basedir="%MYSQL%" --datadir="%DATA%" --port=3306 --console
ping -n 5 127.0.0.1 >nul
echo MySQL 已启动（端口 3306）。
