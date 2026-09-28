## Stage 3.9 follow-up: gaps found by the mobile work — docs/03 §4.1, §4.2, §7.2 — 2026-09-27

**API**
- `GET /attorneys/:username` now returns `avatarUrl` and `avatarUrl256`
  (signed media links, 1 h). Built by `FilesService.avatarUrls()`: only a
  clean, live `avatar` file is signed — verification documents/selfies can
  never come out of this path even if `avatar_file_id` pointed at one.
- `GET /cases/:caseId/review` — the client's own review of a case (404
  `NOT_FOUND` for anyone else or when there is none). `ReviewDto` gains
  `editable` (published and before `editableUntil`).
- Attorney photo is mandatory (OQ-012 update): `missing` gains `photo`
  (attorney without a clean own avatar, `FilesService.isCleanAvatar()`);
  onboarding completion answers 403 `ONBOARDING_INCOMPLETE` until it is set.
- Contract regenerated (`packages/api-contract`).

**Mobile**
- Public attorney profile header shows the photo (256 px variant, else the
  main one) for every viewer; the own-profile `/users/me` workaround is gone.
- Review form opened without a review loads `GET /cases/:caseId/review`
  (skeleton / offline / error + Retry) and opens it for editing; the
  server's `editable` flag locks moderated reviews.
- `MissingRequirement.photo`: the router guard keeps an attorney on the
  profile step; the photo row shows "Add a photo — it is required for
  attorneys." after Continue (pre-app design otherwise unchanged).
- New key: `onboarding.profile.error.photoRequired` (en + ru).

**Tests**: unit (files, profiles, reviews, onboarding), e2e (files: public
photo + 256 px + no selfie leak; reviews: GET own review; onboarding /
profiles-onboarding: `photo` blocks completion), Flutter widget + guard tests.

**Owner device test follow-ups**
- An onboarding action refused with `ONBOARDING_INCOMPLETE` /
  `CLIENT_CONTACTS_INCOMPLETE` (e.g. the tour's "Get started" for an
  attorney without a photo) re-reads `GET /users/me` and moves the user to
  the step that owns the missing item (`AppRouterGuard.forwardRoute`); that
  step shows the localized reason (photo: "Add a photo — it is required for
  attorneys.") and flags its required fields (`onboardingBlockerProvider`).
- Role screen with a role already set: the other card is disabled
  (`AppSizes.disabledOpacity`), a note says the role can't be changed
  (`onboarding.role.locked`, en + ru), Continue moves on without an API call.
