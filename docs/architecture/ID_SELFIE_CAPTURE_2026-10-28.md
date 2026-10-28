# Guided «selfie with your ID» camera — 2026-10-28

Owner request (binding, 2026-10-28): when an attorney takes the selfie with
the ID for verification, the app opens its **own** guided camera (like Stripe
Identity / Persona / Onfido / bank apps): front camera, face oval with an
ID-card frame beside it, "Hold your ID next to your face" in every app
language, a small looping example animation, capture **only** from the live
camera (no gallery), free and on-device (no paid verification service).
Later additions the same day: premium and smooth (colour feedback, haptic,
short countdown, never freeze) and forgiving (attorneys must not fight the
oval; typical capture under 10 s).

Builds on PR #489 (ID + selfie required by default).

## 1. Research (live search, 2026-10-28)

| What | Source (date) | Taken from it |
|---|---|---|
| Stripe Identity: `options.document.require_live_capture` disables uploads, the ID must come from the device camera; `require_matching_selfie` adds the selfie | Stripe docs "Adding selfie checks" docs.stripe.com/identity/selfie (page undated, current 2026-10); Stripe API reference (stripe-ruby rubydoc, current) | Live capture only, no upload path, for the selfie step |
| Onfido (now Entrust IDV): Motion = guided head turn as active liveness, alignment step with coloured corners; their UX write-up "taking a selfie is easy, a selfie video is hard" → strong live guidance | documentation.identity.entrust.com SDK changelogs (iOS/Android/RN, 2025–2026; Motion on all iOS devices from 29.9.0, new SDKs Jan 2026); Onfido tech blog "User guidance: how to provide meaningful feedback to users" (medium.com/onfido-tech) | One short live hint at a time, colour feedback on the guide, a head-turn prompt |
| Sumsub: live camera, face in frame, head movement; advanced liveness only in their SDK | support.sumsub.com "Liveness check steps", docs.sumsub.com/docs/liveness (undated, current) | Active challenge pattern |
| "Selfie holding your ID next to your face" is the common pattern; no fingers over the data or card edges | Wise help "How to take a selfie with your ID" (current 2026); Novo help "use a selfie to confirm identity" (updated June 2026); Youverify blog | The instruction text and the card frame beside the face |
| Veriff: document + selfie flow by camera | devdocs.veriff.com "Document + Selfie IDV"; help.veriff.com (current 2026) | (exact on-screen wording NOT confirmed) |
| Injection attacks: ISO/IEC 30107-3 covers presentation attacks only, not virtual cameras / hooked feeds; CEN/TS 18099 (2024–2025) is the injection-attack spec; iBeta started IAD testing against it in June 2026 | Biometric Update "iBeta launches injection attack detection testing" (June 2026); iProov blog "CEN/TS 18099" (16 Feb 2026); Signzy blog (2026) | Honest limits below: a client-side challenge is friction, not proof |
| ML Kit face detection on Flutter: `google_mlkit_face_detection` 0.15.1 (17 Aug 2026), classification gives eye-open probabilities, `headEulerAngleY` gives head turn; Android minSdk 21, iOS 15.5 | pub.dev package page + API (2026-08-17 release) | The detector; our app already has iOS 15.5 / minSdk 26 |
| Community thresholds: closed eyes < ~0.4–0.5 (stricter misses fast blinks), turn ≥ ~20°; iOS front-camera mirroring can flip the yaw sign | Medium "Flutter liveness detection with ML Kit" (undated, 2025–26); pub.dev flutter_liveness_actions docs | Eyes open ≥ 0.6, closed ≤ 0.4; turn ≥ 18°; a turn either way passes (direction recorded) |
| Binding a capture to a server nonce: Play Integrity guidance — server-made unpredictable nonce, single use, verify on the server; not enough alone on a compromised device | Android Developers Blog "Boost the security of your app with nonce" (May 2022, still the current guidance) | The one-time capture token; device attestation is a later step |

Could not be confirmed from public pages: Stripe's / Veriff's exact oval
wording and auto-capture timings, Persona's UI rules. We did not copy any
vendor's screens; the look uses LawBid's own design tokens.

## 2. What the attorney sees

1. Selfie step (unchanged look) → «Open camera».
2. The app asks the server for a one-time capture token, then opens the
   guided camera (front camera, fullscreen):
   - a face oval left of centre and an ID-card frame beside it, the rest
     dimmed (`SelfieGuideLayout` — one place for the painter and the checks);
   - at the bottom: a 64 px looping example (person raises a card next to the
     face, 2.4 s, vector, static under reduce-motion) and the line
     **"Hold your ID next to your face"**; above it one live hint:
     "Show your face in the oval" / "Move closer" / "Move back a little" /
     "Center your face in the oval" / "Only one face in the frame" /
     "More light, please" / the prompt ("Blink" or "Turn your head left/right,
     then back") / "Show your ID in the frame" / "Hold still…";
   - the oval goes neutral → gold (face found) → **green** (face + prompt done
     + card seen or its grace time over) with a haptic tick; a green ring fills
     around the oval for 0.9 s and the app takes the picture by itself
     (2 frames, keeps the larger JPEG = the sharper one), medium haptic;
   - the shutter is dimmed and inert until face + prompt are done;
   - after 9 s without success a big **"Take photo anyway"** button appears
     (still the live camera; flagged "skipped" for the verifier).
3. Review: Retake / Use photo (Retake = new random prompt, timers restart).

No gallery or file option exists on the selfie step or in this camera. ID
front/back photos keep the gallery option.

## 3. Liveness method (free, on-device)

`SelfieLivenessMachine` (pure Dart, `domain/selfie_liveness.dart`), fed by
Google ML Kit on the phone:

- exactly one face; its box (mapped from the camera frame to the screen,
  BoxFit.cover) centre within **25 %** of the oval's size from the oval's
  centre, height 0.40–1.45 × the oval's — wide on purpose;
- ONE random prompt per attempt (`Random.secure`): blink (eyes seen open ≥ 0.6,
  then closed ≤ 0.4, then open again) or head turn (|yaw| ≥ 18°, then back
  ≤ 10° so the kept picture is frontal). Because the front camera's mirroring
  differs per platform, a turn either way passes and `turnMatched` is noted;
- card hint (soft): ML Kit text recognition finds a text block (≥ 3 chars)
  beside the face at face height → the card frame turns green. Without it the
  shot is allowed after **4 s** anyway and the verifier sees "ID not
  auto-detected";
- auto-capture after everything holds for 0.9 s; fallback button at 9 s.
- No ML Kit (web, unsupported frame format, plugin error) → manual mode: the
  overlay and shutter work at once, liveness "not checked".

## 4. Anti-tamper (raises the bar; nothing here is 100 %)

- Selfie upload only from this flow: the app asks
  `POST /verification/requests/{id}/selfie-capture` right before the camera
  opens → `{ token, expiresAt, required }`. The token is 24 random bytes,
  stored in Redis only as a SHA-256 hash with `{user, request, iat, exp}`,
  valid **30 min**, bound to the attorney AND the request.
- `POST /verification/requests/{id}/documents` with `docType: selfie` must
  carry `captureToken` (spent with GETDEL — single use). Missing / unknown /
  used / someone else's / expired → **400 VALIDATION_ERROR** with
  `details.reason` = `capture_token_missing` | `capture_token_invalid` |
  `capture_token_expired` (the existing error style). A plain retry of an
  attach that already went through answers 201 again; a failed attach puts
  the token back. Capture data on a non-selfie document → 400.
- Switch `verification.selfie_live_capture_required` (admin «Настройки»,
  default **ON**): off = the old behaviour (any selfie file), e.g. while old
  app versions phase out. Old app versions get 400 on the selfie attach while
  it is on.
- Stored with the document (`verification_documents.capture_meta`, jsonb):
  the app's report (liveness passed / not_checked / skipped, prompt, fallback
  reason, face/card detected, frames, start/capture time, platform, device
  model) plus what the server itself checked (`tokenVerified`, token issued /
  used time). Old selfies have no record.
- Verifier (admin request card): next to the selfie — "Снято живой камерой
  приложения", liveness passed (which prompt) / not confirmed («Сделать фото
  всё равно») / not checked, "ID found in frame / not auto-detected", frames,
  device, time; a warning when there is no capture record.

Honest limits: the token proves the upload went through our app's flow, not
that the pixels are live. A modified app, a virtual camera / hooked camera
feed (injection, CEN/TS 18099 territory), a replayed video on a screen or a
good deepfake can pass a client-side blink/turn prompt. The verifier still
looks at the picture. Next steps when needed: Play Integrity / App Attest
bound to the capture token (nonce = token + SHA-256 of the picture), and a
server-side face match ID ↔ selfie.

## 5. Performance (owner: "never freeze")

- Preview: `CameraPreview` texture at the camera's native rate, in its own
  RepaintBoundary; nothing in Dart touches its frames.
- Detection: `startImageStream` (NV21 on Android, BGRA8888 on iOS, 720p).
  `DetectionThrottle`: **one detection in flight**; a frame arriving while
  busy is **dropped**, never queued; min interval **150 ms** (≈ every 5th
  frame at 30 fps, ≈ 6–7 detections/s); the interval follows the measured
  latency × 1.5 up to **600 ms**, so a slow low-end phone simply detects less
  often (the low-end fallback, instead of re-opening the camera at a lower
  preset). ML Kit inference runs on its native threads; the Dart side only
  passes the single plane's bytes (no copy/concatenation) and samples ~2 000
  bytes for brightness.
- Text recognition (heavier) at most every **900 ms** and only until a card is
  seen.
- Frame budget: at 60 Hz a UI frame has 16.7 ms (8.3 ms at 120 Hz). Per
  processed detection the UI isolate does: building `InputImage` (no copy),
  the brightness sample (~2 000 reads), the state machine (constant time) and
  — only when what is drawn changed (`SelfieLivenessView ==`) — one
  ValueNotifier update. Colour / ring / hint changes are implicit animations
  (TweenAnimationBuilder, AnimatedSwitcher, AnimatedOpacity, AnimatedSize):
  no setState per frame, the camera page itself never rebuilds per frame.
  A 200 ms ticker advances the timers when no frame comes.
- Lifecycle: on `inactive` the stream is stopped and the controller disposed
  (removed from the tree first); on `resumed` the camera reopens and a new
  attempt starts. Detector closed with the screen (autoDispose provider).

## 6. Code map

- API: `services/selfie-capture-tokens.service.ts` (+ spec),
  `verification-requests.service.ts` (`issueSelfieCapture`, token check in
  `attachDocument`, `selfieCaptureMeta`), `verification-admin.service.ts`
  (`selfieCaptureDto`), DTOs, migration `20261108090000_selfie_capture_meta`,
  setting in `app-settings.defaults.ts`, e2e in `test/verification.e2e-spec.ts`.
- Admin: `app/(app)/verification/[id]/page.tsx` (`SelfieCaptureNote`),
  config label.
- Mobile: `domain/selfie_liveness.dart`, `application/detection_throttle.dart`,
  `application/selfie_capture_session.dart`, `data/selfie_frame_detector.dart`
  (ML Kit), `presentation/screens/id_selfie_capture_screen.dart`,
  `presentation/widgets/id_selfie_capture_view.dart`, `id_selfie_overlay.dart`;
  wizard asks for the token and sends token + report with the attach; strings
  in `core/l10n/strings/id_selfie_strings.dart` (en/ru) and
  `translations_seed.xlsx` (all 85 languages); `core/platform/
  app_settings_opener.dart` (camera denied → Open Settings).
- New deps: `google_mlkit_face_detection ^0.15.1`,
  `google_mlkit_text_recognition ^0.17.1` (same ML Kit train as translation).

## 7. Not verified yet

Everything device-side is unverified until a phone test: ML Kit frame
formats/rotation on real Android and iOS front cameras, mirroring of yaw,
detection speed on a low-end Android, takePicture right after stopping the
stream, the iOS pod install of the two ML Kit pods (CI `flutter build ios`
runs it), app size growth from the bundled models; the universal / App
Link for `/verification/wizard` needs the new AASA published (seo-deploy)
and an installed app to open in the app; the SMS needs the real SMS
provider configured (local runs use the mock).

## 8. Computer / web: «continue on the phone» (owner addition, same day)

Many attorneys start on a computer. Flutter web has no on-device ML Kit,
so the liveness check cannot run in a browser; the web therefore never shows
a camera for the selfie and uses the phone for every web session (a laptop
webcam would only give an unchecked shot — not worth a weaker path).

- Selfie step on the web (`selfieNeedsPhoneProvider` = `kIsWeb`): a panel
  «Продолжить на телефоне» with a QR code of
  `https://<deepLinkHost>/verification/wizard` and «Отправить ссылку по SMS».
- The link: Android App Link path `/verification/wizard`
  (AndroidManifest), iOS universal link component in
  `docs/deeplinks/apple-app-site-association` (published by seo-deploy),
  `lawbid://verification/wizard` for the custom scheme.
  `parseDeepLink` → `TabDeepLink('/verification/wizard')`, which waits for
  sign-in and onboarding like every link, then opens the wizard. The wizard
  loads the SAME server draft and `resumeStep` lands on the selfie step:
  licences, bar card and ID photos entered on the computer are kept.
  App not installed → the https page opens in the phone's browser (store
  fallback is whatever that page shows; unverified).
- SMS: `POST /verification/requests/{id}/selfie-handoff-sms` texts the link to
  the attorney's OWN verified number (no number entry, so it can't be used to
  text strangers), 3 an hour, through the new
  `SmsComplianceService.sendOnDemand`: a one-time on-demand reply to the
  person's own request (FCC declaratory ruling, SoundBite, 2012-11-29) —
  no marketing consent needed, but a STOP'ed number is never texted. Uses the
  existing SMS provider (no new paid service). English text.
- The computer re-reads the draft every 5 s while the panel is on screen
  and the page is visible (stops when hidden / left); once the phone attached
  the selfie it moves to «Проверка и отправка» by itself.
- Back from the selfie step goes to the ID step; the draft lives on the
  server and is never re-created. Role screen: the role can still be changed
  until onboarding ends, but switching an already chosen role now asks
  «Сменить роль?» first.
