@echo off
chcp 65001 >nul
rem ForeignTradeEnglish launcher - invokes ps1
rem %* forwards arguments, e.g.  启动外贸英语网站.bat -AllowPortChange
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动外贸英语网站.ps1" %*
