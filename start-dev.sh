#!/bin/bash
# Persistent dev server launcher — survives parent shell exit.
cd /home/z/my-project
exec ./node_modules/.bin/next dev -p 3000
