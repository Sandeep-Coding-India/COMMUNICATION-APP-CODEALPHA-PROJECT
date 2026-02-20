@echo off 
echo Starting Video Chat Application... 
echo. 
echo Step 1: Make sure MongoDB is running 
echo If MongoDB is not running, start it with: 
echo   net start MongoDB 
echo   OR 
echo   "C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe" --dbpath "C:\data\db" 
echo. 
echo Step 2: Starting the server... 
node server/server.js
