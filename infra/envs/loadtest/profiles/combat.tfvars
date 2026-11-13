# Profile "combat" (owner row 59, 2026-11-13): a SHORT real test of prod's
# automation on a small stack, max $50 (plan: docs/dev/AWS_COMBAT_TEST_PLAN_2026-11-13.md).
# Like prod (infra/envs/prod/growth.auto.tfvars.json): Graviton ARM64, api /
# worker / pgbouncer on Fargate Spot (1 regular + Spot 4:1), Spot fallback
# Lambda on, db + redis autoscale Lambdas really acting ("on").
# Must match loadtest/profiles.json (checked by loadtest/scripts/check-profiles.mjs).
api_max_tasks           = 10
worker_max_tasks        = 4
generator_count         = 2
database_instance_class = "db.t4g.medium"
redis_node_type         = "cache.t4g.small"
turn_second_enabled     = false
livekit_enabled         = false

cpu_architecture    = "ARM64"
pgbouncer_spot      = true
pgbouncer_max_tasks = 4

# the db-autoscale Lambda grows in the day only on Multi-AZ (require_multi_az)
database_multi_az                  = true
db_autoscale_enabled               = true
db_autoscale_mode                  = "on"
db_autoscale_initial_ceiling_class = "db.t4g.large"
# grow after 2 x 5 min at >= 70 % CPU (prod 3 x 5 min); 10 min between steps (prod 30)
db_autoscale_tuning = { up_cpu_points = 2, up_cooldown_min = 10 }

redis_autoscale_enabled               = true
redis_autoscale_initial_ceiling_class = "cache.t4g.medium"
# shrink after 15 quiet minutes (prod 1 h) so the way DOWN is seen inside the run
redis_autoscale_tuning = { down_window_h = 0.25, down_cooldown_h = 0.25, up_cooldown_min = 10 }

# back to Spot 10 min after the fallback drill (prod 30 min)
spot_fallback_tuning = { restore_after_min = 10 }

# 5 waiting jobs per worker (prod 50): a short run can prove queue -> +workers -> -workers
worker_jobs_per_task = 5
