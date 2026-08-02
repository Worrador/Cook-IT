@echo off

REM Ensure we run from the directory of this script
pushd %~dp0

REM Run PyInstaller with the spec file
pyinstaller Cook-IT.spec

REM Return to the original directory
popd

REM Optional: Pause to see output
pause