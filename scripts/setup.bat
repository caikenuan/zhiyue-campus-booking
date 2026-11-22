@echo off
chcp 65001 >nul
cd /d "%~dp0\.."

echo ============================================
echo   智约 · 本地环境一键安装
echo ============================================
echo.

echo [1/4] 准备 MySQL...
call scripts\setup-mysql.bat
if errorlevel 1 goto error

echo.
echo [2/4] 安装后端依赖...
cd /d "%~dp0\..\backend"
if not exist node_modules call npm install
if errorlevel 1 goto error

echo.
echo [3/4] 初始化数据库...
call npm run db:init
if errorlevel 1 goto error

echo.
echo [4/4] 安装管理端依赖...
cd /d "%~dp0\..\frontend\admin"
if not exist node_modules call npm install
if errorlevel 1 goto error

echo.
echo ============================================
echo   安装完成
echo   启动服务：scripts\start-all.bat
echo   管理端：http://localhost:5173
echo   小程序：用微信开发者工具导入 frontend\mini-program
echo ============================================
pause
exit /b 0

:error
echo.
echo [错误] 安装中断，请根据上面的提示排查。
pause
exit /b 1
