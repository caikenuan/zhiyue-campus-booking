@echo off
chcp 65001 >nul
cd /d "%~dp0"
call start-mysql.bat
cd /d "%~dp0\..\backend"

if not exist node_modules (
  echo 正在安装后端依赖...
  call npm install
  if errorlevel 1 goto error
)

echo 后端启动中：http://localhost:3000/api/health
npm start
goto end

:error
echo 依赖安装失败，请检查网络。
pause

:end
