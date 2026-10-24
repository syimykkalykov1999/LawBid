#!/bin/sh
# PgBouncer entrypoint (docs/architecture/DB_POOLER.md).
#
# Input (environment):
#   DATABASE_URL   required; the DIRECT database URL of the app role, from
#                  Secrets Manager (postgresql://user:pass@host:port/db?...).
#                  User, password and host are taken from it; the query part
#                  is ignored. Password characters may be percent-encoded.
#   POOL_SIZE      server connections per (database, user) pool   [20]
#   RESERVE_POOL   extra connections used when clients wait       [3]
#   MAX_DB_CONNECTIONS  hard cap of server connections of THIS task [POOL_SIZE + RESERVE_POOL]
#   MAX_CLIENT_CONN     client connections accepted               [5000]
#   MAX_PREPARED_STATEMENTS  protocol-level prepared statements per server connection [200]
#   DB_TLS_MODE    TLS towards the database (server_tls_sslmode)  [require]
#   QUERY_WAIT_TIMEOUT  seconds a client may wait for a server connection [30]
#   STATS_INTERVAL seconds between CloudWatch metric lines (0 = off)   [30]
#   METRICS_NAMESPACE   CloudWatch namespace of the metric lines  [LawBid/PgBouncer]
#
# Nothing secret is printed. The password only goes into the 0600 userlist.
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

D=/tmp/pgb
mkdir -p "$D"
chmod 700 "$D"

urldecode() {
  # backslashes first (printf %b would eat them), then %XX -> \xXX
  printf '%b' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/%\([0-9A-Fa-f][0-9A-Fa-f]\)/\\x\1/g')"
}

rest=${DATABASE_URL#*://}   # user:pass@host:port/db?query
rest=${rest%%\?*}           # drop ?query
userpass=${rest%@*}         # the LAST @ separates credentials from host
hostpart=${rest##*@}
db_user=$(urldecode "${userpass%%:*}")
db_pass=$(urldecode "${userpass#*:}")
hostport=${hostpart%%/*}
db_host=${hostport%%:*}
case "$hostport" in *:*) db_port=${hostport##*:} ;; *) db_port=5432 ;; esac

if [ -z "$db_user" ] || [ -z "$db_pass" ] || [ -z "$db_host" ]; then
  echo "entrypoint: DATABASE_URL has no user, password or host" >&2
  exit 1
fi

q() { printf '%s' "$1" | sed 's/"/""/g'; }

# Read-only console user for the metric loop: random per start, never stored.
stats_pw=$(openssl rand -hex 24)
umask 077
{
  printf '"%s" "%s"\n' "$(q "$db_user")" "$(q "$db_pass")"
  printf '"pgb_stats" "%s"\n' "$stats_pw"
} > "$D/userlist.txt"

# Self-signed certificate for client TLS (the app URL has sslmode=require).
# The traffic stays inside the VPC; the security group is the access control.
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout "$D/server.key" -out "$D/server.crt" -days 3650 -subj "/CN=lawbid-pgbouncer" 2>/dev/null

POOL_SIZE=${POOL_SIZE:-20}
RESERVE_POOL=${RESERVE_POOL:-3}
MAX_DB_CONNECTIONS=${MAX_DB_CONNECTIONS:-$((POOL_SIZE + RESERVE_POOL))}

cat > "$D/pgbouncer.ini" <<EOF
[databases]
* = host=${db_host} port=${db_port}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
unix_socket_dir = $D
pidfile = $D/pgbouncer.pid
logfile =
auth_type = scram-sha-256
auth_file = $D/userlist.txt
stats_users = pgb_stats
ignore_startup_parameters = extra_float_digits,options,application_name

; Transaction pooling: a server connection belongs to a client only while a
; transaction runs. This is what lets thousands of clients share ~${POOL_SIZE}.
pool_mode = transaction
max_client_conn = ${MAX_CLIENT_CONN:-5000}
default_pool_size = ${POOL_SIZE}
reserve_pool_size = ${RESERVE_POOL}
reserve_pool_timeout = 3
max_db_connections = ${MAX_DB_CONNECTIONS}
min_pool_size = 0
; Prisma uses named prepared statements; PgBouncer >= 1.21 tracks them.
max_prepared_statements = ${MAX_PREPARED_STATEMENTS:-200}

; Failover (Multi-AZ RDS flips the DNS name): short DNS cache, dead server
; connections are found by keepalives and by the check query.
dns_max_ttl = 15
dns_nxdomain_ttl = 5
server_check_query = select 1
server_check_delay = 10
server_lifetime = 1800
server_idle_timeout = 300
server_connect_timeout = 5
server_login_retry = 2
tcp_keepalive = 1
tcp_keepidle = 30
tcp_keepintvl = 10
tcp_keepcnt = 3
tcp_user_timeout = 30000

; Fail fast instead of piling up: a client that waits this long gets an error.
query_wait_timeout = ${QUERY_WAIT_TIMEOUT:-30}
client_login_timeout = 10
idle_transaction_timeout = 120
listen_backlog = 1024

client_tls_sslmode = require
client_tls_key_file = $D/server.key
client_tls_cert_file = $D/server.crt
server_tls_sslmode = ${DB_TLS_MODE:-require}

log_connections = 0
log_disconnections = 0
log_stats = 0
verbose = 0
EOF

# --- metrics: one CloudWatch "embedded metric format" JSON line per interval ----
# The awslogs driver ships stdout to CloudWatch Logs, which turns these lines
# into metrics (no IAM, no agent). SHOW POOLS columns: database user cl_active
# cl_waiting cl_active_cancel_req cl_waiting_cancel_req sv_active sv_active_cancel
# sv_being_canceled sv_idle sv_used sv_tested sv_login maxwait maxwait_us pool_mode
STATS_INTERVAL=${STATS_INTERVAL:-30}
if [ "$STATS_INTERVAL" -gt 0 ]; then
  (
    sleep 5
    while :; do
      if out=$(PGPASSWORD="$stats_pw" PGCONNECT_TIMEOUT=3 psql -h 127.0.0.1 -p 5432 -U pgb_stats -d pgbouncer -At -F '|' -c 'SHOW POOLS' 2>/dev/null); then
        printf '%s\n' "$out" | awk -F'|' -v ns="${METRICS_NAMESPACE:-LawBid/PgBouncer}" -v ts="$(date +%s)000" '
          $1 != "pgbouncer" && NF >= 14 {
            ca += $3; cw += $4; sa += $7; si += $10; su += $11; st += $12; sl += $13
            if ($14 + 0 > mw) mw = $14 + 0
          }
          END {
            printf "{\"_aws\":{\"Timestamp\":%s,\"CloudWatchMetrics\":[{\"Namespace\":\"%s\",\"Dimensions\":[[\"Service\"]],\"Metrics\":[{\"Name\":\"ClientsActive\",\"Unit\":\"Count\"},{\"Name\":\"ClientsWaiting\",\"Unit\":\"Count\"},{\"Name\":\"ServerConnections\",\"Unit\":\"Count\"},{\"Name\":\"ServerActive\",\"Unit\":\"Count\"},{\"Name\":\"MaxWaitSeconds\",\"Unit\":\"Seconds\"}]}]},\"Service\":\"pgbouncer\",\"ClientsActive\":%d,\"ClientsWaiting\":%d,\"ServerConnections\":%d,\"ServerActive\":%d,\"MaxWaitSeconds\":%d}\n", ts, ns, ca, cw, sa + si + su + st + sl, sa, mw
          }'
      fi
      sleep "$STATS_INTERVAL"
    done
  ) &
fi

exec pgbouncer "$D/pgbouncer.ini"
