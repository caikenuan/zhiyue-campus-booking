@echo off
chcp 65001 >nul
start "智约-后端" cmd /k "%~dp0start-backend.bat"
ping -n 4 127.0.0.1 >nul
start "智约-管理端" cmd /k "%~dp0start-admin.bat"
echo 已打开后端和管理端窗口，关闭窗口即可停止服务。
