# Vendored: flutter_callkit_incoming 3.1.6 + upstream PR #872

- Source: https://github.com/hiennguyen92/flutter_callkit_incoming
- Base: tag v3.1.6, commit 27cd33c1665b7fbc4c8032a7866c929103029592 (MIT, see LICENSE)
- Applied as is: PR #872 head 4ae62216da7afcaf33efea9aed21d1f4a6623383
  ("fix(android): dismiss the full-screen incoming call when it ends",
  one file: CallkitIncomingActivity.kt, `setClassName` removed from `getIntentEnded`).
- Not copied: `example/` (it posts logs to an outside server), `images/`,
  `.github/`, `test/`.
- No other change. When upstream releases #872, switch back to the pub.dev package.
