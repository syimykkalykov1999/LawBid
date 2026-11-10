# Size of the throw-away load-test stack for profile "u100k" (owner order 11, 2026-11-09).
# Must match loadtest/profiles.json (checked by loadtest/scripts/check-profiles.mjs).
api_max_tasks           = 48
worker_max_tasks        = 12
generator_count         = 6
database_instance_class = "db.r7g.4xlarge"
redis_node_type         = "cache.r7g.xlarge"
turn_second_enabled     = true
livekit_enabled         = false
