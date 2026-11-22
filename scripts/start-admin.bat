@echo off
chcp 65001 >nul
cd /d "%~dp0\..\frontend\admin"

if not exist node_modules (
  echo 正在安装管理端依赖...
  call npm install
  if errorlevel 1 goto error
)

echo 管理端启动中：http://localhost:5173
call npm run dev
goto end

:error
echo 依赖安装失败，请检查网络。
pause

:end
