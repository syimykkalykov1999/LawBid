# Attorney onboarding (owner 2026-10-04)

One linear sequence. Every screen is shown once, and the next one is
decided by the server state, read again after every save. Nothing is
pushed on top of the onboarding step, so Back and Continue can't loop.

## Steps

| # | Step (route) | Shown when | Done when | Next |
|---|---|---|---|---|
| 1 | Code (`/auth/code`) | signed out | code accepted | 2 |
| 2 | Consents, contacts, profile, push (`/onboarding/...`) | `onboarding.step` points there | saved on the server | next step |
| 3a | **License** (`/onboarding/verification`, stage `license`) | verification is start, draft, needs more info or rejected | state + bar number + sworn checkbox submitted (self-attestation, approved at once) | 3b |
| 3a' | License pending (stage `licensePending`) | verification pending or suspended (admin review) | — | Continue → tour → feed |
| 3b | **Practices** (same route, stage `practices`) | license verified, no practice areas saved | "Save and continue" with at least one area | 3c |
| 3c | **Subscription offer** (same route, stage `subscription`) | practices saved, no active subscription or trial | "Start 7 days free" (card at start) **or** "Later" | 4 |
| 3d | Summary (stage `done`) | everything above is complete | Continue | 4 |
| 4 | Tour (`/onboarding/tour`) | — | Finish | feed |

The stage function is `attorneySetupStage()` in
`apps/mobile/lib/features/onboarding/domain/attorney_setup.dart`; the one
screen that shows it is `AttorneyVerificationStepScreen`.

## Rules

- **Returning attorney**: onboarding is completed, so the router guard
  (`AppRouterGuard`, `user.onboarding.isCompleted`) sends them straight to
  the feed and onboarding routes redirect away. A user who stopped in the
  middle lands on exactly the step `onboarding.step` names; inside step 3
  the stage comes from the server, so they land on the stage they miss.
- **Back**: from the tour goes to step 3 at the stage the server requires
  (never practices again once saved); from step 3 goes to the previous
  onboarding step.
- **Subscription**: "Later" is always allowed; without a subscription the
  attorney browses everything. Any action that needs it (the bid button,
  chats) opens the same offer (`/subscription-required?reason=...`,
  `PaywallScreen`). When the trial was used, the offer reads "Subscribe".
  Prices come from the API (admin Деньги → Цены).
- **Bids**: an attorney may bid on any open case in any state and any
  practice, including "Not sure". The server stores `outside_licensed_states`
  and `outside_practice` on the bid; the client sees a note on the bid and in
  the accept confirmation. The attorney sees an info note and is never
  blocked.

## Tests

- `apps/mobile/test/features/onboarding/attorney_setup_flow_test.dart`:
  fresh attorney end to end into the feed, "Later", Back never loops,
  already subscribed.
- `apps/mobile/test/core/navigation/app_router_guard_test.dart`: a returning
  attorney opens the feed; onboarding routes redirect.
- `apps/mobile/test/features/cases/attorney_bid_gate_test.dart`: no
  subscription → bid opens the offer; out-of-state "Not sure" case → bid form.
- `apps/api/test/stage-4-4.e2e-spec.ts`: out-of-state and "Not sure" bids
  are accepted and flagged for the client.
