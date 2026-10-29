#!/bin/bash
set -eu
WT=${1:?worktree path}
SHARED=/Users/sima/Desktop/LawBid/node_modules
cd "$WT"
if [ -L node_modules ]; then rm node_modules; fi
if [ -d node_modules ] && [ ! -d node_modules/.prisma-overlay ]; then echo "real dir not overlay"; exit 1; fi
mkdir -p node_modules/.prisma-overlay node_modules/@prisma
for p in "$SHARED"/* "$SHARED"/.bin "$SHARED"/.package-lock.json; do
  n=$(basename "$p"); [ "$n" = "@prisma" ] && continue
  [ -e "node_modules/$n" ] || ln -s "$p" "node_modules/$n"
done
for p in "$SHARED"/@prisma/*; do
  n=$(basename "$p"); [ "$n" = "client" ] && continue
  [ -e "node_modules/@prisma/$n" ] || ln -s "$p" "node_modules/@prisma/$n"
done
[ -d node_modules/@prisma/client ] || cp -R "$SHARED/@prisma/client" node_modules/@prisma/client
[ -e apps/api/node_modules ] || ln -s /Users/sima/Desktop/LawBid/apps/api/node_modules apps/api/node_modules
echo overlay ready
