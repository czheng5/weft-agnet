@echo off
node --experimental-strip-types "%~dp0src\cli.ts" %*
