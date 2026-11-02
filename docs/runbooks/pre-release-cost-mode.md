# Экономный режим до релиза

Решение владельца 2026-11-02: пока нет пользователей, убрать запасную копию базы (Multi-AZ) и второй узел Redis, перед запуском вернуть. WAF, NAT, метрики CloudWatch и секреты не трогаем.

## Сколько экономим
| Что | Было, $/сутки | Станет | Экономия |
|---|---|---|---|
| RDS Multi-AZ → Single-AZ (db.t4g.medium) | ≈ 2,5 | ≈ 1,25 | ≈ 1,25 |
| Redis 2 узла → 1 | ≈ 0,7 | ≈ 0,35 | ≈ 0,35 |
| **Итого** | | | **≈ 1,6 в сутки, ≈ 48 в месяц** |

Из этого нельзя получить «5–6 долларов в сутки»: остальное (Fargate, NAT, метрики, WAF, балансировщик) по решению владельца остаётся. Цифры оценочные по счёту за последние сутки, не по Cost Explorer.

## Риски и простой
- **Multi-AZ → Single-AZ:** AWS убирает запасную копию. Обычно без простоя, возможна короткая пауза записи (секунды). Не проверено на нашей базе. Пока включено Single-AZ, при сбое зоны база восстанавливается из резервной копии (минуты–часы), автоматического переключения нет.
- **Redis 2 → 1 узел:** удаляется запасной узел, основной остаётся, простоя нет. Пока узел один, его перезапуск или смена размера = несколько минут без Redis (очереди, чаты в реальном времени, кэш).
- Автомасштаб Redis на это время выключен (без запасного узла он не создаётся).
- Возврат: Single-AZ → Multi-AZ занимает до часа в фоне, без простоя, но с повышенной нагрузкой на диск.

## Включить
1. Мак-тред, с одобрением владельца с телефона:
   ```
   aws rds modify-db-instance --db-instance-identifier lawbid-prod-postgres \
     --no-multi-az --apply-immediately
   ```
2. Скопировать `infra/envs/prod/pre-release.tfvars.example` в `pre-release.tfvars`, проверить `redis_node_type` (см. комментарий в файле), `terraform plan -var-file=pre-release.tfvars`, затем apply.
3. Проверить: `aws rds describe-db-instances` → `MultiAZ=false`; `aws elasticache describe-replication-groups` → один узел; /health api.lawbid.dev.

## Вернуть перед релизом (чек-лист)
- [ ] `aws rds modify-db-instance --db-instance-identifier lawbid-prod-postgres --multi-az --apply-immediately`, дождаться `MultiAZ=true`.
- [ ] В tfvars: `redis_replicas = 1`, `redis_autoscale_enabled = true`, `database_multi_az = true`; apply.
- [ ] Проверка: Redis с автопереключением (`AutomaticFailover=enabled`), MultiAZ базы, тревоги CloudWatch в норме.
- [ ] Только после этого запуск и звонки.
