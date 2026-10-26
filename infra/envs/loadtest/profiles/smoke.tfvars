# Size of the throw-away load-test stack for profile "smoke".
# Must match loadtest/profiles.json (checked by loadtest/scripts/check-profiles.mjs).
api_max_tasks           = 2
worker_max_tasks        = 1
generator_count         = 1
database_instance_class = "db.t4g.medium"
redis_node_type         = "cache.t4g.small"
turn_second_enabled     = false
livekit_enabled         = false
