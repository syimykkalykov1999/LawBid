# Size of the throw-away load-test stack for profile "m10".
# Must match loadtest/profiles.json (checked by loadtest/scripts/check-profiles.mjs).
api_max_tasks           = 40
worker_max_tasks        = 8
generator_count         = 5
database_instance_class = "db.r7g.2xlarge"
redis_node_type         = "cache.r7g.xlarge"
turn_second_enabled     = true
livekit_enabled         = false
