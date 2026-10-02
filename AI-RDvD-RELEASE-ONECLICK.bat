@echo off
setlocal EnableExtensions DisableDelayedExpansion
title AI RDvD - ONE CLICK RELEASE

REM ============================================================
REM AI RDvD - ONE CLICK RELEASE
REM Version release script - no commit / no push
REM ============================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

echo.
echo ============================================================
echo AI RDvD - ONE CLICK RELEASE
echo ============================================================
echo Project: %ROOT%
echo.

REM ---- Tool checks ----
where bun >nul 2>&1 || goto :NO_BUN
where npm >nul 2>&1 || goto :NO_NPM
where python >nul 2>&1 || goto :NO_PYTHON
where gh >nul 2>&1 || goto :NO_GH
where powershell >nul 2>&1 || goto :NO_PS
where curl >nul 2>&1 || goto :NO_CURL

REM ---- Project checks ----
if not exist "%ROOT%\package.json" goto :NO_PROJECT
if not exist "%ROOT%\package-lock.json" goto :NO_PROJECT
if not exist "%ROOT%\src-tauri\Cargo.toml" goto :NO_PROJECT
if not exist "%ROOT%\src-tauri\tauri.conf.json" goto :NO_PROJECT
if not exist "%ROOT%\.secrets\update-private.key" goto :NO_KEY

if not exist "%ROOT%\src-tauri\windows\installer\ai-rdvd-installer.ico" goto :NO_ASSETS
if not exist "%ROOT%\src-tauri\windows\installer\installer-header.bmp" goto :NO_ASSETS
if not exist "%ROOT%\src-tauri\windows\installer\installer-sidebar.bmp" goto :NO_ASSETS

REM ---- Installer config guard ----
powershell -NoProfile -Command ^
 "$j=Get-Content (Join-Path $env:ROOT 'src-tauri\tauri.conf.json') -Raw|ConvertFrom-Json;" ^
 "$n=$j.bundle.windows.nsis;" ^
 "if($null -eq $n){Write-Host '[LOI] Thieu bundle.windows.nsis';exit 1};" ^
 "if($n.displayLanguageSelector -ne $true){Write-Host '[LOI] displayLanguageSelector != true';exit 2};" ^
 "$langs=@($n.languages);" ^
 "if($langs -notcontains 'English' -or $langs -notcontains 'Vietnamese'){Write-Host '[LOI] Thieu English/Vietnamese';exit 3};" ^
 "if($n.installerIcon -ne 'windows/installer/ai-rdvd-installer.ico'){Write-Host '[LOI] Sai installerIcon';exit 4};" ^
 "if($n.headerImage -ne 'windows/installer/installer-header.bmp'){Write-Host '[LOI] Sai headerImage';exit 5};" ^
 "if($n.sidebarImage -ne 'windows/installer/installer-sidebar.bmp'){Write-Host '[LOI] Sai sidebarImage';exit 6};" ^
 "Write-Host 'Installer UI config: OK'"
if errorlevel 1 goto :FAIL

echo [1/9] Kiem tra GitHub CLI...
gh auth status >nul 2>&1
if errorlevel 1 (
  echo [LOI] GitHub CLI chua dang nhap. Chay: gh auth login
  goto :FAIL
)

REM ---- Version input ----
echo.
set "LATEST_JSON_TMP=%TEMP%\airdvd-latest-%RANDOM%.json"
set "CURRENT_VERSION="
set "NEXT_VERSION="

REM Uu tien doc latest.json tu GitHub de lay phien ban dang phat hanh thuc te.
curl -fsSL "https://github.com/anhbaokr/ai-rdvd-ui/releases/latest/download/latest.json" -o "%LATEST_JSON_TMP%" >nul 2>&1
if not errorlevel 1 (
  for /f "usebackq delims=" %%V in (`python -c "import json; from pathlib import Path; p=Path(r'%LATEST_JSON_TMP%'); print(json.loads(p.read_text(encoding='utf-8-sig'))['version'])" 2^>nul`) do set "CURRENT_VERSION=%%V"
)

REM Neu khong doc duoc remote, thu latest.json o project root.
if not defined CURRENT_VERSION if exist "%ROOT%\latest.json" (
  for /f "usebackq delims=" %%V in (`python -c "import json; from pathlib import Path; p=Path(r'%ROOT%\latest.json'); print(json.loads(p.read_text(encoding='utf-8-sig'))['version'])" 2^>nul`) do set "CURRENT_VERSION=%%V"
)

REM Cuoi cung fallback ve version hien tai cua package.json.
if not defined CURRENT_VERSION (
  for /f "usebackq delims=" %%V in (`python -c "import json; from pathlib import Path; print(json.loads(Path(r'%ROOT%\package.json').read_text(encoding='utf-8-sig'))['version'])" 2^>nul`) do set "CURRENT_VERSION=%%V"
)

del /q "%LATEST_JSON_TMP%" >nul 2>&1

if not defined CURRENT_VERSION (
  echo [LOI] Khong doc duoc phien ban hien tai tu latest.json/package.json.
  goto :FAIL
)

for /f "usebackq delims=" %%V in (`python -c "v='%CURRENT_VERSION%'.strip(); a=v.split('.'); import sys; ok=len(a)==3 and all(x.isdigit() for x in a); sys.exit(1) if not ok else print(f'{a[0]}.{a[1]}.{int(a[2])+1}')" 2^>nul`) do set "NEXT_VERSION=%%V"

if not defined NEXT_VERSION (
  echo [LOI] Phien ban hien tai khong co dang X.Y.Z: %CURRENT_VERSION%
  goto :FAIL
)

echo Phien ban hien tai : v%CURRENT_VERSION%
echo Phien ban de xuat  : %NEXT_VERSION%
echo.
set "NEW_VERSION="
set /p "NEW_VERSION=Nhap version moi (vi du %NEXT_VERSION%): "
if "%NEW_VERSION%"=="" goto :FAIL

python -c "import re,sys; v='%NEW_VERSION%'; sys.exit(0 if re.fullmatch(r'\d+\.\d+\.\d+',v) else 1)"
if errorlevel 1 (
  echo [LOI] Version phai co dang X.Y.Z, vi du %NEXT_VERSION%
  goto :FAIL
)

python -c "import sys; a=tuple(map(int,'%CURRENT_VERSION%'.split('.'))); b=tuple(map(int,'%NEW_VERSION%'.split('.'))); sys.exit(0 if b>a else 1)"
if errorlevel 1 (
  echo [LOI] Version moi phai lon hon version hien tai v%CURRENT_VERSION%.
  echo       Goi y: %NEXT_VERSION%
  goto :FAIL
)

set "TAG=v%NEW_VERSION%"
set "FILE_UPDATE_DIR=%ROOT%\File-Update\%NEW_VERSION%"

set "RELEASE_NOTES="
set /p "RELEASE_NOTES=Ghi chu release (Enter = AI RDvD v%NEW_VERSION%): "
if "%RELEASE_NOTES%"=="" set "RELEASE_NOTES=AI RDvD v%NEW_VERSION%"

echo.
echo Version hien tai : v%CURRENT_VERSION%
echo Version moi      : %NEW_VERSION%
echo GitHub tag       : %TAG%
echo Thu muc luu      : %FILE_UPDATE_DIR%
echo.

set "CONFIRM="
set /p "CONFIRM=Tiep tuc build va phat hanh? [Y/N]: "
if /I not "%CONFIRM%"=="Y" exit /b 0

REM ---- Backup ----
echo.
echo [2/9] Tao backup...
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd-HHmmss')"`) do set "STAMP=%%A"
set "BACKUP_DIR=%ROOT%\backup\release-%NEW_VERSION%-%STAMP%"
mkdir "%BACKUP_DIR%" >nul 2>&1
if errorlevel 1 goto :FAIL

copy /Y "%ROOT%\package.json" "%BACKUP_DIR%\package.json" >nul
copy /Y "%ROOT%\package-lock.json" "%BACKUP_DIR%\package-lock.json" >nul
copy /Y "%ROOT%\src-tauri\Cargo.toml" "%BACKUP_DIR%\Cargo.toml" >nul
copy /Y "%ROOT%\src-tauri\tauri.conf.json" "%BACKUP_DIR%\tauri.conf.json" >nul
echo Backup: %BACKUP_DIR%

REM ---- Version update: NO regex in batch ----
echo.
echo [3/9] Cap nhat version...

call npm version %NEW_VERSION% --no-git-tag-version --allow-same-version
if errorlevel 1 goto :FAIL

python -c "import os; from pathlib import Path; p=Path(os.environ['ROOT'])/'src-tauri/Cargo.toml'; lines=p.read_text(encoding='utf-8').splitlines(True); i=next((i for i,x in enumerate(lines) if x.lstrip().startswith('version =')),None); assert i is not None, 'Khong tim thay dong version trong Cargo.toml'; lines[i]='version = '+chr(34)+os.environ['NEW_VERSION']+chr(34)+chr(10); p.write_text(''.join(lines),encoding='utf-8'); print('Cargo.toml version =',os.environ['NEW_VERSION'])"
if errorlevel 1 goto :FAIL

python -c "import os,json; from pathlib import Path; p=Path(os.environ['ROOT'])/'src-tauri/tauri.conf.json'; d=json.loads(p.read_text(encoding='utf-8-sig')); d['version']=os.environ['NEW_VERSION']; p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+chr(10),encoding='utf-8'); print('tauri.conf.json version =',os.environ['NEW_VERSION'])"
if errorlevel 1 goto :FAIL

python -c "import os,json,sys; from pathlib import Path; root=Path(os.environ['ROOT']); v=os.environ['NEW_VERSION']; pkg=json.loads((root/'package.json').read_text(encoding='utf-8-sig'))['version']; lock=json.loads((root/'package-lock.json').read_text(encoding='utf-8-sig'))['packages']['']['version']; tauri=json.loads((root/'src-tauri/tauri.conf.json').read_text(encoding='utf-8-sig'))['version']; cargo=next((x.split('=',1)[1].strip().strip(chr(34)) for x in (root/'src-tauri/Cargo.toml').read_text(encoding='utf-8').splitlines() if x.lstrip().startswith('version =')), ''); print('package.json =',pkg); print('package-lock.json =',lock); print('Cargo.toml =',cargo); print('tauri.conf.json =',tauri); sys.exit(0 if pkg==lock==cargo==tauri==v else 1)"
if errorlevel 1 (
  echo [LOI] 4 file version khong dong nhat.
  goto :FAIL
)

REM ---- Build ----
echo.
echo [4/9] Build NSIS + updater signature...
REM Tauri 2.11.x bundle signing reads TAURI_SIGNING_PRIVATE_KEY.
REM It accepts the private-key file path; do not expose the key contents in frontend/source.
set "TAURI_SIGNING_PRIVATE_KEY=%ROOT%\.secrets\update-private.key"
set "TAURI_SIGNING_PRIVATE_KEY_PATH="
set "TAURI_SIGNING_PRIVATE_KEY_PASSWORD="

call bun run tauri:build:exe
if errorlevel 1 goto :FAIL

REM ---- Discover output ----
echo.
echo [5/9] Tim installer + signature...

set "INSTALLER_NAME="
for %%F in ("%ROOT%\src-tauri\target\release\bundle\nsis\*_%NEW_VERSION%_x64-setup.exe") do (
 set "INSTALLER_NAME=%%~nxF"
)

if not defined INSTALLER_NAME (
 echo [LOI] Khong tim thay installer *_ %NEW_VERSION% _x64-setup.exe
 goto :FAIL
)

set "SOURCE_INSTALLER_PATH=%ROOT%\src-tauri\target\release\bundle\nsis\%INSTALLER_NAME%"
set "SOURCE_SIG_PATH=%SOURCE_INSTALLER_PATH%.sig"

if not exist "%SOURCE_INSTALLER_PATH%" (
 echo [LOI] Khong tim thay installer:
 echo %SOURCE_INSTALLER_PATH%
 goto :FAIL
)

if not exist "%SOURCE_SIG_PATH%" (
 echo [LOI] Khong tim thay signature:
 echo %SOURCE_SIG_PATH%
 goto :FAIL
)

for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "(Get-FileHash -LiteralPath $env:SOURCE_INSTALLER_PATH -Algorithm SHA256).Hash"`) do set "INSTALLER_SHA256=%%H"

if not defined INSTALLER_SHA256 (
 echo [LOI] Khong lay duoc SHA256.
 goto :FAIL
)

echo Installer: %INSTALLER_NAME%
echo SHA256:   %INSTALLER_SHA256%

REM ---- File-Update ----
echo.
echo [6/9] Tao File-Update\%NEW_VERSION%...
set "FILE_UPDATE_DIR=%ROOT%\File-Update\%NEW_VERSION%"
mkdir "%FILE_UPDATE_DIR%" >nul 2>&1
if errorlevel 1 goto :FAIL

set "INSTALLER_PATH=%FILE_UPDATE_DIR%\%INSTALLER_NAME%"
set "SIG_PATH=%FILE_UPDATE_DIR%\%INSTALLER_NAME%.sig"
set "MANIFEST=%FILE_UPDATE_DIR%\latest.json"
set "LOCAL_INFO=%FILE_UPDATE_DIR%\release-info.txt"

copy /Y "%SOURCE_INSTALLER_PATH%" "%INSTALLER_PATH%" >nul || goto :FAIL
copy /Y "%SOURCE_SIG_PATH%" "%SIG_PATH%" >nul || goto :FAIL

REM ---- latest.json ----
echo.
echo [7/9] Tao latest.json...

python -c "import json, os; from pathlib import Path; sig=Path(os.environ['SIG_PATH']).read_text(encoding='utf-8').strip(); name=os.environ['INSTALLER_NAME']; from urllib.parse import quote; url='https://github.com/anhbaokr/ai-rdvd-ui/releases/download/'+os.environ['TAG']+'/'+quote(name); data={'platforms':{'windows-x86_64':{'url':url,'signature':sig}},'version':os.environ['NEW_VERSION'],'notes':os.environ['RELEASE_NOTES']}; Path(os.environ['MANIFEST']).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')"
if errorlevel 1 goto :FAIL

python -c "import json, os; from pathlib import Path; m=Path(os.environ['MANIFEST']); d=json.loads(m.read_text(encoding='utf-8')); sig=Path(os.environ['SIG_PATH']).read_text(encoding='utf-8').strip(); b=m.read_bytes(); assert d['version']==os.environ['NEW_VERSION']; assert d['platforms']['windows-x86_64']['signature']==sig; assert not b.startswith(b'\xef\xbb\xbf'); print('latest.json OK'); print('URL='+d['platforms']['windows-x86_64']['url'])"
if errorlevel 1 goto :FAIL

python -c "from pathlib import Path; import os, datetime; t='AI RDvD Release\nVersion: '+os.environ['NEW_VERSION']+'\nTag: '+os.environ['TAG']+'\nInstaller: '+os.environ['INSTALLER_NAME']+'\nSHA256: '+os.environ['INSTALLER_SHA256']+'\nBuild time: '+datetime.datetime.now().astimezone().isoformat()+'\n'; Path(os.environ['FILE_UPDATE_DIR'],'release-info.txt').write_text(t,encoding='utf-8')"
if errorlevel 1 goto :FAIL

REM ---- GitHub Release ----
echo.
echo [8/9] Tao/cap nhat GitHub Release %TAG%...
set "NOTES_FILE=%TEMP%\airdvd-release-notes-%RANDOM%.txt"
powershell -NoProfile -Command "[IO.File]::WriteAllText($env:NOTES_FILE,$env:RELEASE_NOTES,(New-Object Text.UTF8Encoding($false)))"

gh release view "%TAG%" >nul 2>&1
if errorlevel 1 (
  gh release create "%TAG%" --title "AI RDvD %TAG%" --notes-file "%NOTES_FILE%" --latest --target main || goto :FAIL
) else (
  gh release edit "%TAG%" --title "AI RDvD %TAG%" --notes-file "%NOTES_FILE%" --latest || goto :FAIL
)

REM Upload EXE + SIG first. GitHub may normalize the asset name.
gh release upload "%TAG%" "%INSTALLER_PATH%" "%SIG_PATH%" --clobber || goto :FAIL

REM Read the ACTUAL asset URL assigned by GitHub.
REM IMPORTANT:
REM Do not use `gh release view --json assets` here. On the installed
REM GitHub CLI version, browserDownloadUrl is not exposed by that command.
REM GitHub's REST API returns browser_download_url reliably.
echo.
echo Lay URL installer thuc te tu GitHub...
set "REMOTE_RELEASE_JSON=%TEMP%\airdvd-release-%RANDOM%.json"
set "REMOTE_INSTALLER_META=%TEMP%\airdvd-installer-meta-%RANDOM%.txt"
set "REMOTE_INSTALLER_NAME="
set "REMOTE_INSTALLER_URL="

gh api "repos/anhbaokr/ai-rdvd-ui/releases/tags/%TAG%" > "%REMOTE_RELEASE_JSON%"
if errorlevel 1 (
  echo [LOI] Khong lay duoc thong tin Release %TAG% tu GitHub API.
  del /q "%REMOTE_RELEASE_JSON%" >nul 2>&1
  goto :FAIL
)

python -c "import json,os; from pathlib import Path; d=json.loads(Path(os.environ['REMOTE_RELEASE_JSON']).read_text(encoding='utf-8')); assets=[a for a in d.get('assets',[]) if a.get('name','').lower().endswith('.exe')]; assert assets, 'Khong tim thay asset .exe trong Release'; assert len(assets)==1, 'Phat hien nhieu asset .exe trong Release'; a=assets[0]; Path(os.environ['REMOTE_INSTALLER_META']).write_text(a['name']+chr(10)+a['browser_download_url']+chr(10),encoding='utf-8'); print('GitHub asset =',a['name']); print('GitHub URL   =',a['browser_download_url'])"
if errorlevel 1 (
  echo [LOI] Khong xac dinh duoc browser_download_url cua installer.
  del /q "%REMOTE_RELEASE_JSON%" >nul 2>&1
  del /q "%REMOTE_INSTALLER_META%" >nul 2>&1
  goto :FAIL
)

for /f "usebackq delims=" %%A in ("%REMOTE_INSTALLER_META%") do if not defined REMOTE_INSTALLER_NAME set "REMOTE_INSTALLER_NAME=%%A"
for /f "usebackq skip=1 delims=" %%A in ("%REMOTE_INSTALLER_META%") do if not defined REMOTE_INSTALLER_URL set "REMOTE_INSTALLER_URL=%%A"

del /q "%REMOTE_RELEASE_JSON%" >nul 2>&1
del /q "%REMOTE_INSTALLER_META%" >nul 2>&1

if not defined REMOTE_INSTALLER_NAME (
  echo [LOI] Khong lay duoc ten installer tren GitHub.
  goto :FAIL
)
if not defined REMOTE_INSTALLER_URL (
  echo [LOI] Khong lay duoc URL installer tren GitHub.
  goto :FAIL
)

if /I not "%REMOTE_INSTALLER_NAME%"=="%INSTALLER_NAME%" (
  echo [CANH BAO] GitHub da doi ten asset:
  echo          Local  : %INSTALLER_NAME%
  echo          GitHub : %REMOTE_INSTALLER_NAME%
)

echo GitHub installer : %REMOTE_INSTALLER_NAME%
echo GitHub URL       : %REMOTE_INSTALLER_URL%

REM Rebuild latest.json using GitHub's ACTUAL asset URL.
echo.
echo Tao latest.json theo URL thuc te cua GitHub...

python -c "import json,os; from pathlib import Path; sig=Path(os.environ['SIG_PATH']).read_text(encoding='utf-8').strip(); data={'platforms':{'windows-x86_64':{'url':os.environ['REMOTE_INSTALLER_URL'],'signature':sig}},'version':os.environ['NEW_VERSION'],'notes':os.environ['RELEASE_NOTES']}; Path(os.environ['MANIFEST']).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')"
if errorlevel 1 goto :FAIL

python -c "import json,os; from pathlib import Path; m=Path(os.environ['MANIFEST']); d=json.loads(m.read_text(encoding='utf-8')); sig=Path(os.environ['SIG_PATH']).read_text(encoding='utf-8').strip(); b=m.read_bytes(); assert d['version']==os.environ['NEW_VERSION']; assert d['platforms']['windows-x86_64']['signature']==sig; assert d['platforms']['windows-x86_64']['url']==os.environ['REMOTE_INSTALLER_URL']; assert not b.startswith(b'\xef\xbb\xbf'); print('latest.json OK'); print('URL='+d['platforms']['windows-x86_64']['url'])"
if errorlevel 1 goto :FAIL

REM Upload the final manifest only after the GitHub asset URL is known.
gh release upload "%TAG%" "%MANIFEST%" --clobber || goto :FAIL
del /q "%NOTES_FILE%" >nul 2>&1

REM ---- Remote verify ----
echo.
echo [9/9] Verify latest.json tu GitHub...
set "REMOTE_JSON=%TEMP%\airdvd-remote-%RANDOM%.json"
curl -fsSL "https://github.com/anhbaokr/ai-rdvd-ui/releases/latest/download/latest.json" -o "%REMOTE_JSON%" || goto :REMOTE_WARN

python -c "import json,os; from pathlib import Path; d=json.loads(Path(os.environ['REMOTE_JSON']).read_text(encoding='utf-8-sig')); print('Remote version =',d['version']); print('Remote URL     =',d['platforms']['windows-x86_64']['url']); assert d['version']==os.environ['NEW_VERSION']; assert d['platforms']['windows-x86_64']['url']==os.environ['REMOTE_INSTALLER_URL']"
if errorlevel 1 goto :REMOTE_WARN

del /q "%REMOTE_JSON%" >nul 2>&1

echo.
echo Kiem tra URL installer GitHub...
curl -fsSIL "%REMOTE_INSTALLER_URL%" >nul 2>&1
if errorlevel 1 (
  echo [CANH BAO] URL installer da co trong latest.json nhung HEAD/GET verification that bai.
  echo            URL: %REMOTE_INSTALLER_URL%
  goto :REMOTE_WARN
)
echo Installer URL: OK (HTTP reachable)

echo.
echo ============================================================
echo PHAT HANH THANH CONG
echo ============================================================
echo Version   : %NEW_VERSION%
echo Release   : %TAG%
echo Installer local : %INSTALLER_NAME%
echo Installer GitHub: %REMOTE_INSTALLER_NAME%
echo SHA256    : %INSTALLER_SHA256%
echo File      : %FILE_UPDATE_DIR%
echo Backup    : %BACKUP_DIR%
echo ============================================================
pause
exit /b 0

:REMOTE_WARN
del /q "%REMOTE_JSON%" >nul 2>&1
echo.
echo [CANH BAO] Da upload asset nhung chua verify remote.
echo Release: %TAG%
echo File   : %FILE_UPDATE_DIR%
pause
exit /b 0

:NO_BUN
echo [LOI] Khong tim thay bun trong PATH.
goto :FAIL
:NO_NPM
echo [LOI] Khong tim thay npm trong PATH.
goto :FAIL
:NO_PYTHON
echo [LOI] Khong tim thay Python trong PATH.
goto :FAIL
:NO_GH
echo [LOI] Khong tim thay GitHub CLI trong PATH.
goto :FAIL
:NO_PS
echo [LOI] Khong tim thay PowerShell trong PATH.
goto :FAIL
:NO_CURL
echo [LOI] Khong tim thay curl trong PATH.
goto :FAIL
:NO_PROJECT
echo [LOI] Khong du file project can thiet.
goto :FAIL
:NO_KEY
echo [LOI] Khong tim thay .secrets\update-private.key.
goto :FAIL
:NO_ASSETS
echo [LOI] Thieu installer assets.
echo Can co:
echo   src-tauri\windows\installer\ai-rdvd-installer.ico
echo   src-tauri\windows\installer\installer-header.bmp
echo   src-tauri\windows\installer\installer-sidebar.bmp
goto :FAIL
:FAIL
echo.
echo ============================================================
echo PHAT HANH THAT BAI
echo ============================================================
echo Backup: %BACKUP_DIR%
echo Khong tu dong rollback.
echo ============================================================
pause
exit /b 1
