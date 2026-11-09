# Amazon SES: out of the sandbox (owner)

Checked 09.11.2026 (read-only, `aws sesv2`):

| What | State |
|---|---|
| Account | **sandbox**: `ProductionAccessEnabled = false`, 200 mails / 24 h, 1 per second. In the sandbox SES delivers ONLY to verified addresses. No single address is verified, so every user and alert e-mail fails («Email address is not verified») |
| Earlier request | exists: support case **179099293700409** (Transactional, https://lawbid.dev). AWS shows no decision on it |
| Sender | `SES_FROM_ADDRESS = no-reply@lawbid.dev` (API task env), region us-east-1 |
| Domain identity `lawbid.dev` | **verified**, DKIM **SUCCESS** (Easy DKIM, signing on) |
| Custom MAIL FROM `mail.lawbid.dev` | **FAILED**: the MX and SPF records are missing in Cloudflare. Mail still goes out, with the amazonses.com return path. DMARC passes on DKIM |
| Bounces and complaints | SES account-level suppression list is **on** for BOUNCE and COMPLAINT. A hard bounce or a spam complaint stops further mail to that address automatically. CloudWatch alarms: `lawbid-prod-ses-bounce-rate` (4 %), `lawbid-prod-ses-complaint-rate` (0.1 %), `lawbid-prod-ses-send-volume`. Opt-outs from notification mail are kept by the app (`ComplianceEmailProvider` stop-list, `List-Unsubscribe` header) |
| App webhook `POST /api/v1/webhooks/ses` | built, **not connected**: no SNS topic or event destination exists yet. It is not needed for the request; suppression works inside SES |

Since 09.11 the admin «Здоровье» card «Почта (Amazon SES)» says **«SES: песочница — письма не уходят»** after the first refused send, and turns green after the first delivered one.

## 1. Cloudflare: fix MAIL FROM (5 minutes, before the request)
Cloudflare → lawbid.dev → DNS → Records → **Add record**, twice:
1. Type **MX**, Name `mail`, Mail server `feedback-smtp.us-east-1.amazonses.com`, Priority `10` → Save.
2. Type **TXT**, Name `mail`, Content `v=spf1 include:amazonses.com -all` → Save.

Within about 15 minutes AWS shows SES → Identities → lawbid.dev → «Custom MAIL FROM domain» = **Successful**.

## 2. AWS: look at the earlier request
AWS Console (us-east-1) → **Support** → **Your support cases** → case **179099293700409**.
- If AWS asked for more information: **Reply**, paste the text below → **Submit**.
- If it was denied, or there is no case: SES → **Account dashboard** → **Request production access** (or «Edit your account details»). Fill in:
  - Mail type: **Transactional**
  - Website URL: `https://lawbid.dev`
  - Additional contacts: the owner's e-mail
  - Preferred contact language: English
  - Use case description: the text below
  - Tick «I agree to the AWS Service Terms and AUP» → **Submit request**

## 3. The text (paste as is)

> LawBid (https://lawbid.dev) is a marketplace where people post legal cases and licensed US
> attorneys bid on them (iOS, Android and web apps). We send e-mail from no-reply@lawbid.dev
> (domain verified, Easy DKIM, DMARC published) through Amazon SES in us-east-1.
>
> What we send:
> 1. Transactional messages a user triggers: sign-up and sign-in confirmation codes, password
>    reset, e-mail address confirmation.
> 2. Account notifications the user can switch off: a new bid on their case, a message from their
>    attorney, a case status change, receipts.
> 3. Operational alerts to our own staff mailboxes.
> 4. A small number of invitations to licensed attorneys whose business contact details are public
>    in state bar registries. Each one has a one-click List-Unsubscribe header and a visible opt-out
>    link, and opt-outs are honoured at once and permanently.
>
> Volume: we are in launch testing, so under 200 messages a day today. We expect about 1,000 a
> day in the first month and up to 5,000 a day at peak in the following months.
>
> List quality and bounces / complaints: addresses come only from our own users (confirmed by a
> code before any notification is sent) and the public registries above. We never buy or rent
> lists. SES account-level suppression is enabled for bounces and complaints, so a hard-bounced
> or complaining address is never mailed again. CloudWatch alarms watch the bounce rate (alert at
> 4 %), the complaint rate (alert at 0.1 %) and daily volume. Notification e-mails carry an
> unsubscribe link, and opt-outs are stored on our side as well.

## 4. After AWS approves
- SES → Account dashboard shows «Production access», with a daily quota of at least 50,000.
- Nothing to change in the app. The «Почта» card turns green on the next delivered mail.
- Optional, later: connect the bounce webhook (an SNS topic with event destinations
  Bounce / Complaint → `https://api.lawbid.dev/api/v1/webhooks/ses`, and the topic ARN in admin
  `compliance.sns.topic_arns`) so that bounces also show in the admin.
