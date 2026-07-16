#!/bin/bash
# Watchdog: respawn next dev if it dies. Survives parent shell exit via setsid.
cd /home/z/my-project
while true; do
  echo "[watchdog] starting next dev at $(date -Iseconds)" >> /home/z/my-project/watchdog.log
  ./node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[watchdog] next dev exited ($?) at $(date -Iseconds), restarting in 3s" >> /home/z/my-project/watchdog.log
  sleep 3
done
