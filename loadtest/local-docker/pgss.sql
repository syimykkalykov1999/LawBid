\pset format unaligned
\pset fieldsep '|'
\pset tuples_only on
\o /tmp/pgss_total.txt
select queryid, calls, round(total_exec_time)::bigint tot, round(mean_exec_time::numeric,2) mean, round(total_plan_time)::bigint plan, rows, regexp_replace(query, '\s+', ' ', 'g') from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) order by total_exec_time desc limit 25;
\o /tmp/pgss_mean.txt
select queryid, calls, round(total_exec_time)::bigint tot, round(mean_exec_time::numeric,2) mean, round(total_plan_time)::bigint plan, rows, regexp_replace(query, '\s+', ' ', 'g') from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) and calls >= 3 order by mean_exec_time desc limit 25;
\o /tmp/pgss_calls.txt
select queryid, calls, round(total_exec_time)::bigint tot, round(mean_exec_time::numeric,2) mean, rows, left(regexp_replace(query, '\s+', ' ', 'g'), 300) from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) order by calls desc limit 40;
\o /tmp/pgss_sum.txt
select round(sum(total_exec_time)/1000) exec_s, round(sum(total_plan_time)/1000) plan_s, sum(calls) from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database());
