# TURN server for calls (coturn)

Without a TURN relay calls between phones behind carrier NAT do not connect
(STUN alone is not enough). One small coturn on EC2, ≈ $7–8/month
(t4g.nano ≈ $3 + public IPv4 ≈ $3.6 + traffic). Code: `infra/modules/turn`.
The API needs no change: `calls.service.ts` issues short-lived logins from the
URL list and the secret (admin → Интеграции → TURN).

## 1. Apply (owner, on the Mac, only this module)

```
cd ~/Desktop/LawBid/infra/envs/prod && eval "$(aws configure export-credentials --format env)" && terraform init -backend-config=backend.hcl && terraform apply -target=module.stack.module.turn -var-file=launch.tfvars.example
```

Expected: the plan adds only `module.stack.module.turn[0]` resources
(instance, Elastic IP, security group, IAM role, SSM parameter): 0 to destroy.
Type `yes`. Run `terraform output stack` afterwards and copy `turn_public_ip`.

## 2. DNS (Namecheap → lawbid.dev → Advanced DNS)

Add: Type `A Record`, Host `turn`, Value = the `turn_public_ip` from step 1,
TTL Automatic. Check in a few minutes: `dig +short turn.lawbid.dev`.

## 3. Read the secret (never in git or in logs)

```
aws ssm get-parameter --region us-east-1 --name /lawbid-prod/turn/static-auth-secret --with-decryption --query Parameter.Value --output text
```

## 4. Admin → Интеграции → TURN

- urls: `turn:turn.lawbid.dev:3478?transport=udp,turn:turn.lawbid.dev:3478?transport=tcp`
- secret: the value from step 3
- STUN: leave as is
Save. Takes effect on the next call, no deploy and no new app build.

## Check

On a phone over mobile data call a phone on another network. Server side
(Session Manager on the instance): `sudo journalctl -u coturn -n 50` shows
`allocation` lines while a call is live.

## Notes

- The instance has no SSH; use Systems Manager → Session Manager.
- Relay is blocked from private ranges (VPC, 10/8, 172.16/12, 192.168/16),
  so it cannot be used as a proxy into our network.
- TLS on 5349 (for networks that block UDP and 3478) is a second step: a
  Let's Encrypt certificate for `turn.lawbid.dev` on the instance; the port
  is already open. Not required for the first release.
- Changing the secret or address replaces the instance (Elastic IP stays).
- Video calls stay off (`video_calls` flag) until TURN is checked.
