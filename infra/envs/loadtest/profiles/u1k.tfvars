# Size of the throw-away load-test stack for profile "u1k" (owner order 11, 2026-11-09).
# Must match loadtest/profiles.json (checked by loadtest/scripts/check-profiles.mjs).
api_max_tasks           = 12
worker_max_tasks        = 4
generator_count         = 1
database_instance_class = "db.r7g.large"
redis_node_type         = "cache.r7g.large"
turn_second_enabled     = false
livekit_enabled         = false
