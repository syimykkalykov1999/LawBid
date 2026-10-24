# Перенос домена lawbid.dev в Cloudflare (для фото в R2)

Домен остаётся куплен в Namecheap. В Cloudflare переезжают только записи DNS.
Сайт, приложение и почта не прерываются, если записи перенести точно.

## Шаги для владельца (≈ 15 минут, потом ожидание до нескольких часов)

1. Cloudflare → **Domains → Add a domain** → `lawbid.dev` → тариф **Free**.
2. Cloudflare сам найдёт записи. Сверьте со списком ниже: каждая должна быть,
   и у **каждой** облачко **серое** («DNS only»). Оранжевое облачко не включать.
3. Cloudflare покажет **два nameserver** (вида `xxx.ns.cloudflare.com`).
4. Namecheap → Domain List → lawbid.dev → **Nameservers → Custom DNS** →
   вписать эти два → сохранить.
5. Написать мне. Я проверю, что сайт, API, админка и почта работают, и
   дальше включу фото в R2 (bucket, адрес media.lawbid.dev, ключ).

## Записи, которые должны быть в Cloudflare (снято 2026-10-24)

| Имя | Тип | Значение | Зачем |
| --- | --- | --- | --- |
| `lawbid.dev` (@) | CNAME | `d28wq9t218p67x.cloudfront.net` | сайт (Cloudflare сам «распрямит» CNAME в корне) |
| `www` | CNAME | `d28wq9t218p67x.cloudfront.net` | сайт |
| `api` | CNAME | `lawbid-prod-alb-1784804712.us-east-1.elb.amazonaws.com` | сервер приложения |
| `admin` | CNAME | `lawbid-prod-alb-1784804712.us-east-1.elb.amazonaws.com` | админка |
| `_5eda52806173c2839c38c5c9b8e2a5fc` | CNAME | `_d45e7b05b2151faaf78043561f2b1bae.wzccmgtwzk.acm-validations.aws` | сертификат сайта |
| `_57b01c6d74e899100a9c25d167f161a1.www` | CNAME | `_a5a76101b0e5ea8d8a5ac054d33cf2d2.wzccmgtwzk.acm-validations.aws` | сертификат www |
| `vyjcsnvni5meghmx5ine4ymlgwfuz4rl._domainkey` | CNAME | `vyjcsnvni5meghmx5ine4ymlgwfuz4rl.dkim.amazonses.com` | почта (подпись) |
| `6tevsbspo2yvwxinnav7ouakygwge6zn._domainkey` | CNAME | `6tevsbspo2yvwxinnav7ouakygwge6zn.dkim.amazonses.com` | почта (подпись) |
| `m735wfkzvrmrifshkks6xy3ichdst22z._domainkey` | CNAME | `m735wfkzvrmrifshkks6xy3ichdst22z.dkim.amazonses.com` | почта (подпись) |
| `_amazonses` | TXT | значение из Namecheap (не менять) | почта (проверка домена) |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | почта |

Сертификат для api/admin (ACM) может иметь свою запись `_…api` / `_…admin` —
если Cloudflare её нашёл, оставить. Всё, что есть в Namecheap и чего нет
здесь, — тоже перенести как есть (Cloudflare делает это сам на шаге 2).

## Откат
Namecheap → Nameservers → **Namecheap BasicDNS**. Старые записи в Namecheap
не удаляются, поэтому всё возвращается как было.
