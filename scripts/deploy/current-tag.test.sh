#!/usr/bin/env bash
# current-tag.sh must never print a tfvars line for a missing/odd image
# (audit 2026-11-02: `api_image = "None"` reached terraform plan).
set -u
D="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cat >"$T/aws" <<'S'
#!/usr/bin/env bash
case "$2" in
  describe-services) echo "arn:td/$4" ;;
  describe-task-definition) eval "echo \"\${IMG_$(echo "$*" | sed -n "s/.*name=='\([a-z]*\)'.*/\1/p")}\"" ;;
esac
S
chmod +x "$T/aws"
fail=0
t() { # name want_rc want_out_substr api_img admin_img
  out="$(PATH="$T:$PATH" IMG_api="$4" IMG_admin="$5" sh "$D/current-tag.sh" 2>"$T/err")"; rc=$?
  all="$out$(cat "$T/err")"
  if [ "$rc" = "$2" ] && [[ "$all" == *"$3"* ]] && { [ "$2" = 0 ] || [ -z "$out" ]; }; then echo "ok   $1"; else echo "FAIL $1 (rc=$rc out=$all)"; fail=1; fi
}
t "both resolve" 0 'admin_image = "r/lawbid-admin:def"' "r/lawbid-api:abc" "r/lawbid-admin:def"
t "None stops, no partial output" 1 "no image found" "r/lawbid-api:abc" "None"
t "empty stops" 1 "no image found" "" "r/lawbid-admin:def"
t "odd shape stops" 1 "unexpected image" "lawbid-api" "r/lawbid-admin:def"
exit "$fail"
