@echo off
chcp 65001 >nul
cd /d "%~dp0\..\backend"

if not exist node_modules (
  echo 正在安装后端依赖...
  call npm install
  if errorlevel 1 goto error
)

echo 正在初始化数据库（会重建表和演示数据）...
call npm run db:init
if errorlevel 1 goto error
echo.
echo 数据库初始化完成。
pause
exit /b 0

:error
echo.
echo [错误] 初始化失败，请确认 MySQL 已启动。
pause
exit /b 1
