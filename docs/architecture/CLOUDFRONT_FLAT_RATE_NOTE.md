# CloudFront flat-rate plans: research note (S9-10, 2026-10-25)

Docs only: nothing in Terraform changes.

## What AWS offers

- Plans: Free $0, Pro $15, Business $200, Premium $1 000 per month; **one plan = one distribution**, one apex domain; no overage charges at all; WAF, DDoS protection, bot management, Route 53 DNS and CloudWatch Logs ingestion are bundled ([AWS docs: flat-rate pricing plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html), [AWS blog: new features and expanded capabilities](https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-cloudfront-flat-rate-pricing-plans-new-features-and-expanded-capabilities)).
- Allowances are NOT confirmed from an AWS page I could read. Third-party summaries say Free 1 M requests and Pro 10 M requests with a 50 TB transfer allowance ([BlazingCDN, 2026](https://blog.blazingcdn.com/en-us/cloudfront-flat-rate-plans-explained-limits-and-fine-print-2026)); sources disagree on the Free figure. Check the current AWS pricing page before deciding.

## What it would change for LawBid

- Today the `media` and `documents` distributions (infra/modules/s3/main.tf) are pay-as-you-go. A scraped or attacked media bucket is billed after the fact (budget alarms only report it).
- A plan removes that tail for the distribution it covers. Cost: $15 per month per distribution on Pro, so about $30 for media + documents, against about $0 pay-as-you-go at launch traffic (the free tier of CloudFront is 1 TB and 10 M requests a month).
- Public photos are planned to move to Cloudflare R2 (no egress fee), which already removes the same tail for media.

## Recommendation (no action now)

1. At launch size stay pay-as-you-go: $0 beats $15-30.
2. Re-evaluate when the monthly CloudFront line in the «Расходы» page (AWS by service) passes about $15, or after the first traffic spike that the budget alarm reports.
3. Before switching, test in staging: Origin Access Control to the S3 bucket, signed URLs / key groups for `documents`, the custom domain and ACM certificate, and the CloudWatch Logs bundle. A plan is bound to one distribution and one apex domain, so check that `media` and `documents` can be separate plans.
4. COST GATE: this would be a fixed monthly fee, so it must be a measured switch-on (the AWS line above $15), never a launch default.
