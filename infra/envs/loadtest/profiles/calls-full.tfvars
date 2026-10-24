# Size of the throw-away load-test stack for profile "calls-full".
# Must match loadtest/profiles.json (checked by loadtest/scripts/check-profiles.mjs).
api_max_tasks           = 6
worker_max_tasks        = 2
generator_count         = 2
database_instance_class = "db.r7g.large"
redis_node_type         = "cache.r7g.large"
turn_second_enabled     = true
livekit_enabled         = true
