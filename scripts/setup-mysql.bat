@echo off
chcp 65001 >nul
setlocal
set "TOOLS=%USERPROFILE%\zhiyue-tools"
set "MYSQL=%TOOLS%\mysql"
set "DATA=%TOOLS%\mysql-data"
set "ZIP=%TOOLS%\mysql.zip"

if exist "%MYSQL%\bin\mysqld.exe" goto check_data

echo 未找到本地 MySQL，开始下载（约 280MB，只需一次）...
if not exist "%TOOLS%" mkdir "%TOOLS%"
curl -L --fail --retry 2 -o "%ZIP%" "https://cdn.mysql.com/archives/mysql-8.4/mysql-8.4.9-winx64.zip"
if errorlevel 1 goto download_error

echo 正在解压...
if exist "%TOOLS%\mysql-extract" rmdir /s /q "%TOOLS%\mysql-extract"
powershell -NoProfile -Command "Expand-Archive -Force '%ZIP%' '%TOOLS%\mysql-extract'"
if errorlevel 1 goto download_error
move "%TOOLS%\mysql-extract\mysql-8.4.9-winx64" "%MYSQL%" >nul
rmdir /s /q "%TOOLS%\mysql-extract"
del "%ZIP%" >nul 2>nul

:check_data
if exist "%DATA%" goto check_running
echo 正在初始化 MySQL 数据目录（首次运行）...
mkdir "%DATA%"
"%MYSQL%\bin\mysqld.exe" --initialize-insecure --basedir="%MYSQL%" --datadir="%DATA%" --console
if errorlevel 1 goto init_error

:check_running
tasklist /FI "IMAGENAME eq mysqld.exe" 2>nul | findstr /I "mysqld.exe" >nul
if not errorlevel 1 goto already_running
echo 正在启动 MySQL（端口 3306）...
start "智约-MySQL" /min "%MYSQL%\bin\mysqld.exe" --basedir="%MYSQL%" --datadir="%DATA%" --port=3306 --console
ping -n 5 127.0.0.1 >nul
echo MySQL 已启动。
exit /b 0

:already_running
echo MySQL 已在运行。
exit /b 0

:download_error
echo.
echo [错误] MySQL 下载或解压失败，请检查网络后重试。
echo 也可以手动下载后解压到：%MYSQL%
echo 下载地址：https://cdn.mysql.com/archives/mysql-8.4/mysql-8.4.9-winx64.zip
exit /b 1

:init_error
echo.
echo [错误] MySQL 初始化失败，请删除 %DATA% 后重试。
exit /b 1
