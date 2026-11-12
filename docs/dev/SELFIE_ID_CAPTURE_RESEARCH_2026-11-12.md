# «Selfie with your ID» camera: how others guide it (owner list row 62, 12.11.2026)

Owner complaint: the face oval and the card frame keep appearing and
disappearing, and the guide does not adapt to distance, so the attorney has
to hold the phone too far or too close.

Owner correction (12.11, binding): **the ONE «selfie holding the ID card»
photo stays.** No split into separate selfie / ID captures, no change to the
flow, the steps, the texts flow or the API. Only the guidance inside that
camera gets better.

## 1. What others do (live search, 12.11.2026)

| Who / source (date) | What they do | Taken for us |
|---|---|---|
| Vouched, "Selfie verification holding ID" (8 Dec 2025) | Arm's length so the whole face AND the ID fit; ID next to the face, not over the chin or cheek; all four card corners visible; straight-on angle; hold steady; bring the ID a bit closer if its text is blurry. Manual capture, no auto-capture described. | The pose and the order of hints: face first, then the card beside it, then «hold steady». |
| Incode, "ID Capture – Screens & States" (devhub, v1.1, undated, live) | Real-time quality gates (glare, cut-off, blur, edges); one short message at a time ("Move closer", "Avoid glare"…); auto-capture once all gates pass; a manual button appears after a timeout. | Auto-capture only when every gate holds; manual fallback after a timeout. |
| AuthenticID Document Scan SDK, "Capture modes" (readthedocs, current) | Waits until the device is stable before auto-capture; switches to manual capture after `autoCaptureTimeoutDuration`. | Steadiness as a gate (not just «face in the oval»); timeout → manual. |
| Smile ID SmartSelfie (Android docs, current) | Explicit states `DO_MOVE_CLOSER`, `FACE_TOO_CLOSE`, `NO_FACE_FOUND`; the app shows one prompt per state. | Separate «closer» / «back» states judged from the face size. |
| Innovatrics DOT Web Face Auto Capture 3.0.1 (docs, current) | Configurable `face_too_close` / too far messages ("Move closer"…). | Same. |
| A developer write-up of an ML Kit selfie oval (InCred tech, Medium, undated) | Compares the face box with the oval; if the face is less than half the oval's height → «move closer»; maps the oval from view to camera coordinates. | Distance from the face box, mapped to the screen. |
| Entrust (Onfido) iOS SDK changelog 30.2.0 (May 2024) | Resized the face oval for older, smaller iPhones. | The guide must scale to the screen. |
| Didit, "Optimizing iOS SDK for photo ID auto-capture" (Mar 2026); MetaMap Web SDK (Nov 2024); Shufti Pro | Auto-capture with live guidance on placement, lighting, alignment. | Auto-capture is the norm; manual stays as fallback. |
| Google ML Kit face detection docs (current) | Faces should be ≥ 100×100 px; boxes jitter frame to frame and single frames are missed. | Average the box, grace time for a missed frame. |

Not found in public sources: exact thresholds (face-size bands, hold times)
of Persona, Veriff, Jumio, Stripe Identity; none publish a «face + card in
one shot» guide spec. Stripe's help only says: clear, well-lit, no glare,
hold steady. Nobody publishes the smoothing / hysteresis they use; those
values are ours, chosen to be forgiving and covered by unit tests.

## 2. Why ours was awkward (from the code, before this change)

1. **Fixed spots.** The oval was always at 36 % / 40 % of the screen, half
   the screen wide, and the card frame always to its right. The attorney had
   to move the phone until the face matched that spot: with the card in hand
   this meant too far or too close.
2. **Flicker.** Every processed frame decided «face / no face» anew. ML Kit
   misses single frames, so the oval tone, the hint and the hold ring
   flipped several times a second. «Only one face» fired on one frame —
   sometimes on the small photo of the card itself.
3. **Hints on borders flipped** each frame (no hysteresis, no dwell).
4. **Card latch.** Once text was seen, the card counted as «there» forever,
   so the auto-capture did not wait for the card actually being beside the
   face.
5. **Mirroring ignored.** ML Kit boxes are unmirrored, the front preview is
   mirrored: a face on the left of the screen was judged as on the right.
6. Auto-capture did not require stillness.

## 3. What we chose

Same camera, same steps, same texts flow, same look (colours, oval, card
frame with corner brackets, ring, example animation, shutter), same API and
`captureMeta`.

- **Guide follows the face.** Oval width = 1.4 × the face box (clamped
  34–72 % of the screen width), ID-1 card frame (85.6 × 54 mm) beside it at
  chin height, on the side with room; the side changes only when the other
  side has clearly more room. Before a face is seen, the guide rests at the
  old spots (the look is unchanged). It glides (220 ms) and has a dead band
  (1.2 %), so it never trembles. Reduce-motion: no glide.
- **Distance from the face size on screen** (face box width / screen width):
  < 22 % «Поднесите телефон ближе», > 46 % or no room for the card
  «Отодвиньте телефон», centre out of the band «Поместите лицо в центр
  овала». Every border has hysteresis (3 %) once in place.
- **No flicker:** face box averaged (½ weight per frame); a face missing for
  < 0.6 s still counts; «Only one face» needs 2 frames in a row and ignores
  faces under half the main face (the photo on the ID); a new hint shows only
  after 0.3 s.
- **Card check all along** (text recognition every 0.6 s); the card frame is
  green while text was seen beside the face in the last 1.8 s; «Покажите
  удостоверение в рамке» otherwise. The soft gate stays (after 5 s the shot
  is allowed without a detected card; the verifier sees «not auto-detected»).
- **«Держите ровно»** (new hint, all 85 languages) when the face moves more
  than 8 % of its width between detections.
- **Auto-capture** when face in place + liveness prompt done + card (or its
  gate) + steady for 0.7 s. The shutter stays (enabled once face + prompt are
  done), «Всё равно сделать фото» after 9 s.
- Front camera boxes are mirrored like the preview.

Code: `domain/selfie_guide.dart` (geometry, debounce),
`domain/selfie_liveness.dart` (state machine), `data/selfie_frame_detector.dart`
(mirroring), `application/selfie_capture_session.dart` (card check cadence),
`presentation/widgets/id_selfie_overlay.dart` (draws the guide where it is
told). Tests: `test/features/verification/selfie_liveness_test.dart`,
`selfie_capture_session_test.dart`, `id_selfie_capture_view_test.dart`.

## 4. Not verified

Device behaviour: the mirroring direction of the front preview on real
Android / iOS builds, the face-size band on real arm lengths, text detection
of a held card at that distance, detection speed on a low-end Android. Owner
tests on the phones after the single final build.

Sources:
- https://www.vouched.id/learn/blog/selfie-verification-holding-id
- https://devhub.omnihub.incode.com/design-and-ux/id-capture-screens-and-states.md
- https://authenticid-developer-docs.readthedocs-hosted.com/en/stable/products/document-scan-sdk/ios/guides/capture-modes.html
- https://docs.usesmileid.com/integration-options/mobile/android/smile-id-sdk/smartselfie-capture
- https://developers.innovatrics.com/digital-onboarding/technical/remote/dot-web-face/3.0.1/documentation/
- https://medium.com/incred-technopedia/enhanced-selfie-experience-via-mlkit-ffc52017045b
- https://documentation.identity.entrust.com/sdk/ios/changelog/
- https://updates.didit.me/blog/optimizing-ios-sdk-for-seamless-photo-id-auto-capture/
- https://support.stripe.com/questions/troubleshooting-id-upload-for-identity-verification
- https://developers.google.com/ml-kit/vision/face-detection/ios
