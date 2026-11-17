#!/usr/bin/env bash
# Проверка 17.11: стоящая версия (package-lock / pubspec.lock) против последней стабильной в реестре.
#   docs/dev/verify/versions.sh
# Ожидаемый вывод: строки "пакет | у нас | последняя | OK/СТАРЕЕ" (сеть: registry.npmjs.org, pub.dev).
set -uo pipefail
cd "$(dirname "$0")/../../.."
lock=package-lock.json
npm_used() { node -e "const l=require('./$lock').packages;const k=Object.keys(l).find(p=>p==='node_modules/$1'||p.endsWith('/node_modules/$1'));console.log(k?l[k].version:'-')"; }
for p in @nestjs/core prisma @prisma/client sharp bullmq ioredis socket.io @socket.io/redis-adapter \
         @aws-sdk/client-s3 heic-decode blurhash class-validator nestjs-pino typescript jest next react; do
  used=$(npm_used "$p"); latest=$(curl -s "https://registry.npmjs.org/$p/latest" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).version)}catch{console.log('?')}})")
  [ "$used" = "$latest" ] && st=OK || st=СТАРЕЕ
  echo "$p | $used | $latest | $st"
done
pub_used() { awk -v p="  $1:" '$0==p{f=1} f&&/version:/{gsub(/"/,"",$2);print $2;exit}' apps/mobile/pubspec.lock; }
for p in video_compress image_picker record just_audio video_player cached_network_image dio drift flutter_riverpod; do
  used=$(pub_used "$p"); latest=$(curl -s "https://pub.dev/api/packages/$p" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.latest.version+' ('+j.latest.published.slice(0,10)+')')}catch{console.log('?')}})")
  case "$latest" in "$used "*) st=OK ;; *) st=СТАРЕЕ ;; esac
  echo "pub:$p | $used | $latest | $st"
done
echo "node local: $(/opt/homebrew/opt/node@26/bin/node -v)"
echo "docker local/CI: $(grep -m1 'image: postgres' docker-compose.yml) ; $(grep -m1 'image: redis' docker-compose.yml)"
echo "CI: $(grep -m1 -o 'postgres:[0-9.]*' .github/workflows/api-ci.yml) ; $(grep -m1 -o 'redis:[0-9.]*-alpine' .github/workflows/api-ci.yml)"
echo "prod: database_major_version=$(grep -o '"database_major_version": *"[0-9]*"' infra/envs/prod/growth.auto.tfvars.json) ; redis_engine default=$(grep -A3 'variable "redis_engine"' infra/envs/prod/variables.tf | grep -o 'default *= *"[a-z]*"')"
