@echo off
chcp 65001 >nul
rem ForeignTradeEnglish launcher - invokes ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动外贸英语网站.ps1"
