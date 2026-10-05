# ses-bounce-rate / ses-complaint-rate — e-mail reputation

**Для владельца.** AWS останавливает отправку всех писем (коды входа,
уведомления), если больше 10 % писем не доходят или больше 0,5 % людей
жмут «Спам». Тревога приходит намного раньше (4 % и 0,1 %). Плохие адреса
система отключает сама (SES suppression list). Что сделать: проверить, не
идёт ли лишняя рассылка (админка → Связь → Рассылки), и не регистрируются
ли боты (админка → Безопасность). Если не понятно — переслать письмо Claude.

**Check.** SES → Reputation metrics; CloudWatch Logs Insights on the api
log for `email send failed`; recent broadcasts; sign-up spikes from one
IP range (WAF logs).

**Act.** Pause broadcasts; tighten the disposable-domain list; lower the
WAF rate rule for `/auth/*`. Complaints → make sure every marketing e-mail
has an unsubscribe link and goes only to opted-in users.
