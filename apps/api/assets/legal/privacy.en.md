# Privacy Policy

*DRAFT for review by a licensed attorney. Not legal advice. Version: draft-2026-10-25.*

SiMA LLC dba LawBid ("LawBid", "we") runs the LawBid apps and website. This policy explains what personal information we collect, why, who gets it, how long we keep it, and your choices. Contact: privacy@lawbid.dev, [postal address].

## 1. Information we collect

- **Account**: name, phone number, email, username, photo, language, role (client, attorney, assistant), password hash or login tokens.
- **Attorney verification**: bar number, state, license status from public registries, firm, office address, documents you upload, and, if you agree, a selfie compared with the photo on your ID (see section 6).
- **Content you create**: case descriptions, bids, chat messages, voice messages, files, posts, reels, stories, questions, answers, reviews, profile text. Content you put in public places (public Q&A, public profile, posts) is public.
- **Calls and video**: connection metadata (who, when, how long, quality). **We do not record call or video content.**
- **Payments**: handled by Stripe, Apple and Google. We receive status, amount, last four digits and a customer token, not full card numbers.
- **Device and usage**: device model, OS, app version, IP address, crash reports, push token, security events, language settings.
- **Safety and support**: reports, moderation decisions, support tickets.
- **Contacts**: only if you choose to sync contacts; used to find people you know.

We do not knowingly collect information from anyone under 18.

## 2. How we use it

To run the Service; verify licenses; match and show cases and bids; deliver messages, calls and notifications; process payments; translate content you ask us to translate; keep the Service safe (fraud, spam, illegal content); give support; improve reliability; comply with law; enforce our Terms. We do not sell personal information, we do not share it for cross-context behavioral advertising, and we do not use your private messages to train AI models.

## 3. Private messages, attorney-client communications, and who can read them

- Chat messages are stored on our servers so they can be delivered, synced and searched by you. [They are encrypted in transit and at rest.]
- LawBid staff do **not** read private chats routinely. Access is limited to named staff, needs a recorded reason, and is logged. It happens only: (a) after a report, to the extent needed to review it; (b) to stop serious harm or illegal content; (c) to respond to valid legal process; (d) to fix a technical problem you asked us to look at; (e) where required by law.
- Automated systems may scan messages and media for spam, malware and illegal content.
- Because we are a platform and not part of the attorney-client relationship, **do not treat the Service as a secure vault**. Attorneys remain responsible for protecting client confidences under their professional rules. If you need a higher level of secrecy, use another channel.
- If you turn on translation for a conversation, the text of messages is sent to our translation provider (Google Cloud Translation) to produce the translation. Turn it off for a conversation to stop this.

## 4. Who we share with

- **The other participants**: attorneys see the cases that match them; clients see attorneys' profiles and bids; participants see what each writes in a shared chat. Your phone and email are not shown unless you share them.
- **Service providers** under contract: cloud hosting, storage, video delivery, SMS (Twilio), email (Amazon SES), push (Firebase), error reporting (Sentry), translation (Google), payments (Stripe), identity and license checks (including Amazon Rekognition for the selfie comparison, section 6).
- **Legal and safety**: courts, law enforcement and regulators when we believe the law requires it. We ask for a warrant or court order before releasing the content of messages, unless you consent, an emergency exists, or the law requires otherwise. Where allowed we tell you first. We report child sexual abuse material to NCMEC.
- **Business transfer**: in a merger or sale, with notice to you.

Categories disclosed for a business purpose in the last 12 months: identifiers, contact data, content, commercial information, internet activity, geolocation (approximate), professional information. We have not sold or shared personal information in the last 12 months.

## 5. Retention

Account data: while the account is open and 90 days after deletion for fraud and legal-request purposes, then removed or anonymized. Messages and files: per your chat settings; deleted with the account. Reports and moderation records: up to [3] years. Payment records: 7 years (tax law). Reported illegal material: preserved for 1 year as the law requires. Backups expire within [35] days. Legal holds may extend retention. Sign-in and security logs (IP address, device, browser): 2 years, and the IP address and browser of a session are removed after 90 days without use. Admin action log and records of what an official request looked at: 5 years. IP address and device stored with a contact disclosure: 2 years. Messages you delete are removed from view at once and the text is kept for up to 90 days in case of an official request, then erased. Your phone-book upload (one-way hashes): until you turn sync off or delete your account. Notifications: 180 days. Database backups are overwritten within 35 days and older versions of stored files within 90 days of deletion. Attorney verification selfies and ID pictures follow the shorter periods in section 6.

## 6. Biometric information (attorney identity check)

This section is our written policy for biometric information, including under the Illinois Biometric Information Privacy Act (740 ILCS 14/15), the Texas Capture or Use of Biometric Identifier Act (Bus. & Com. Code §503.001) and Washington RCW 19.375.

- **Purpose.** When an attorney applies for verification and agrees on the selfie screen, we automatically compare the selfie with the photo on their government ID, only to confirm that the person applying is the person on the ID. We do not use it to identify you anywhere else, to recognize you in other photos, for advertising, or to train any model.
- **What is collected.** The selfie you take, the pictures of your ID and licence documents you upload, and the comparison result: a similarity number from 0 to 100 and whether it passed. The face data needed for the comparison is computed by our vendor for that one comparison only. A LawBid verifier may look at the pictures to decide your request.
- **Vendor.** Amazon Web Services, Inc. (Amazon Rekognition, the CompareFaces operation), in the United States, acting as our service provider under contract. We send the two pictures and get the result back. We do not create a Rekognition face collection, so no face template of you is kept for us. [We have opted out of Amazon using this content to improve its services (AWS AI services opt-out policy).]
- **Retention and destruction.** The selfie and the ID and licence pictures are permanently deleted right after the final decision on your request: at approval or rejection, or, for an automatic rejection you can appeal, when the appeal is decided or the 30-day appeal period ends. If you leave a request unfinished, they are deleted 15 days after your last activity on it. If you ask to delete your account, they are deleted within an hour, without waiting for the deletion grace period. The comparison result is kept until your request is decided plus 30 days, then deleted, as the consent screen says. Copies in encrypted storage history are removed within 1 day of the deletion and copies in our encrypted disaster-recovery store within 30 days of upload; they are never used for anything else. In every case we destroy biometric information when the purpose is met and no later than 3 years after your last interaction with us.
- **What we keep without biometrics.** As proof of the check we keep the decision, its dates, who decided it, the state registry result, the type of each document, the similarity number for the period above, and the bar number you entered (a public registry number). No pictures and no face data.
- **No sale, no sharing.** We never sell, lease, trade or otherwise profit from biometric information. We disclose it only to Amazon as our service provider for the comparison, when you consent, or when the law or a valid warrant or subpoena requires it.
- **Consent.** We ask for your written consent on the selfie screen before any comparison and record the time and the text version. You can say no: a verifier then compares the pictures by eye. You can withdraw consent by retaking the selfie without it or by writing to us; no further comparison runs.
- **Security.** Pictures are kept encrypted in private storage, never in a public link, and opened by staff only through short signed links that are logged. We protect them at least as well as our other most sensitive data.
- **Questions.** Write to privacy@lawbid.dev with "Biometric" in the subject.

## 7. Your choices and rights

In the app (Settings, Privacy) you can download your data, correct it, delete your account, change notification settings, turn off contact sync, and control translation. You can also email privacy@lawbid.dev.

**California and other states.** If you live in California, Colorado, Connecticut, Virginia, Texas, Oregon or another state with a privacy law, you may have the right to know, access, correct, delete and port your data, to opt out of sale, sharing and targeted advertising (we do none), to limit the use of sensitive data (we use it only to provide the Service), and not to be discriminated against. We respond within 45 days. You can use an authorized agent. If we deny a request, you can appeal by replying to our answer, and may contact your state attorney general. We honor Global Privacy Control signals.

## 8. Security

Encryption in transit, access controls, audit logs of staff access, vendor reviews, and an incident response plan. If a breach affects you we will notify you and regulators within the time the law requires and no later than 30 days after discovery in New York.

## 9. Children

The Service is for adults 18 and over. If you believe a child has an account, email privacy@lawbid.dev and we will delete it.

## 10. International users

LawBid is operated in the United States. Information is processed in the US.

## 11. Cookies and SDKs

See the Cookie Notice.

## 12. Changes

We will post changes here and tell you of material changes in the app or by email before they take effect.
