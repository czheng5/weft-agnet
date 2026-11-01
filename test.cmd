@echo off
node --test --test-isolation=none --experimental-strip-types "%~dp0tests\all.test.ts"
