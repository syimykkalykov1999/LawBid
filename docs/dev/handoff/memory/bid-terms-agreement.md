---
name: bid-terms-agreement
description: Owner request 2026-10-27 — flexible payment terms in bids (retainer + monthly etc.) and an auto-generated signed fee-agreement PDF pinned in the case; in-app payments stay OFF
metadata:
  node_type: memory
  type: project
  originSessionId: 6d6b8c8c-3cb5-4d35-85a9-f97482dd18a3
  modified: 2026-10-27T22:50:01.757Z
---

Owner asked (2026-10-27 ~19:00) for: (1) richer payment terms in attorney bids — not only amount/percent/"уточню позже", but retainer/prepayment + monthly installments (example: $3000 upfront, then $1000/month), hourly, mixed; (2) after a bid is accepted, an agreement PDF: logo top-left, title "Договор между клиентом и адвокатом", what the client posted (case, amount), the attorney's offer and terms, counter-offers/acceptance, then both draw their signature in the app, signatures land in the PDF, the PDF goes to both parties and is pinned inside the case forever (evidence if they go to court). In-app payments between client and attorney stay OFF (switch exists; may be enabled later). Must not add server load (generate in a job, cheap PDF lib, S3).

**Why:** «если вдруг они поссорятся и пойдут в суд чтобы у них обоих был документ договора».

**How to apply:** research-first ([[research-first-workflow]]) → Q&A with owner → architecture doc → code after the merge train; everything behind a switch OFF by default with guide on «Инструкции»; app look frozen elsewhere, but this feature is an explicit UI ask. NY Part 1215 engagement letter and ESIGN/UETA audit trail matter. Research doc: docs/dev/BID_TERMS_AGREEMENT_RESEARCH_2026-10-27.md. Related: [[owner-working-rules]], [[scaling-principle]].
