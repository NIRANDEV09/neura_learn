@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NeuraLearn
cd /d "%~dp0"

rem Everything this launcher does is also written to server-launch.log so a
rem failed start can be diagnosed later instead of the window just vanishing.
set "LOG=%~dp0server-launch.log"
>"%LOG%" echo [%date% %time%] START.bat launched in %~dp0

if not exist "server.js" (
  echo server.js was not found next to START.bat.
  echo Extract the whole ZIP first, then run START.bat from inside the extracted folder.
  echo server.js missing in %~dp0>>"%LOG%"
  pause
  exit /b 1
)

rem Prefer the bundled Node.js so this works on a laptop with nothing installed.
set "NODE=%~dp0runtime\node.exe"
if exist "%NODE%" (
  >>"%LOG%" echo using bundled runtime\node.exe
  goto :havenode
)
set "NODE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE set "NODE=%%I"
if not defined NODE (
  echo Node.js was not found.
  echo.
  echo Either extract the ZIP with the runtime folder included, or install Node.js
  echo 20.19 or newer from https://nodejs.org and run START.bat again.
  echo node not found>>"%LOG%"
  pause
  exit /b 1
)
>>"%LOG%" echo using node from %NODE%
:havenode

for /f "tokens=1,2 delims=:" %%A in ('""%NODE%" launch-browser.cjs --pick-port"') do (
  set "PORT=%%A"
  set "ALREADY=%%B"
)
if not defined PORT (
  echo Could not find a free port for NeuraLearn.
  echo Ports 3003 and 3006-3010 are busy. Close the other server windows and try again.
  echo no free port>>"%LOG%"
  pause
  exit /b 1
)

if defined ALREADY (
  echo NeuraLearn is already running at http://localhost:!PORT!/ - opening it now.
  >>"%LOG%" echo already running on !PORT!
  start "" "http://localhost:!PORT!/"
  ping -n 3 127.0.0.1 >nul 2>nul
  exit /b 0
)

echo Using port !PORT!.
>>"%LOG%" echo using port !PORT!

rem The app is shipped already built in dist\, so normally nothing is installed
rem and no internet connection is needed. The npm steps below only run if a
rem developer deleted dist\ or node_modules\.
if not exist "dist\index.html" (
  echo Building the interface, this can take a minute...
  if not exist "node_modules\vite\bin\vite.js" (
    where npm >nul 2>nul
    if errorlevel 1 (
      echo npm was not found and the built interface is missing.
      echo Re-extract the ZIP so the dist folder is restored, then run START.bat again.
      echo dist missing and npm missing>>"%LOG%"
      pause
      exit /b 1
    )
    call npm ci
    if errorlevel 1 (
      echo Dependency installation failed. Check your internet connection, then try again.
      echo npm ci failed>>"%LOG%"
      pause
      exit /b 1
    )
  )
  call "%NODE%" "node_modules\vite\bin\vite.js" build --config vite.config.mjs
  if errorlevel 1 (
    echo The interface build failed.
    echo build failed>>"%LOG%"
    pause
    exit /b 1
  )
)

rem Open the browser as soon as the local server answers, and keep this window
rem alive for as long as the server runs.
start "NeuraLearn browser" /min "%NODE%" launch-browser.cjs
echo Starting NeuraLearn at http://localhost:!PORT!/ - keep this window open while you use the app.

"%NODE%" server.js
if errorlevel 1 (
  echo.
  echo The local server stopped with an error. The details above are also saved in server-launch.log.
  >>"%LOG%" echo server exited with an error
  pause
)

endlocal
