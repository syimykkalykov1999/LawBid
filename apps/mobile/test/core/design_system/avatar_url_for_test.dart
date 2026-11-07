import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';

/// Owner 2026-11-04 (R-405, «аватарки мыльные»): which avatar picture a
/// frame draws — the 256 px preview while it holds enough pixels, the full
/// one once the frame (points × pixel ratio) outgrows it.
void main() {
  const preview = 'https://media.lawbid.dev/avatar/s0/2026/11/f1_w256';
  const full = 'https://media.lawbid.dev/avatar/s0/2026/11/f1';

  group('avatarUrlFor', () {
    test('a list avatar keeps the preview (40 pt × 3 = 120 px ≤ 256)', () {
      expect(
        avatarUrlFor(preview, logicalSize: 40, devicePixelRatio: 3),
        preview,
      );
      // The profile header on a 3× phone: 76 × 3 = 228 px — still enough.
      expect(
        avatarUrlFor(preview, logicalSize: 76, devicePixelRatio: 3),
        preview,
      );
    });

    test('a big frame takes the full picture, derived from a public preview',
        () {
      // The call screen: 120 pt × 3 = 360 px > 256.
      expect(
        avatarUrlFor(preview, logicalSize: 120, devicePixelRatio: 3),
        full,
      );
      // A 2× tablet drawing 140 pt: 280 px > 256.
      expect(
        avatarUrlFor(preview, logicalSize: 140, devicePixelRatio: 2),
        full,
      );
      // The AVIF twin of the preview derives the (WebP/JPEG) main picture,
      // which every avatar has ([fullPictureOf]).
      expect(
        avatarUrlFor('$preview.avif', logicalSize: 120, devicePixelRatio: 3),
        full,
      );
    });

    test('an explicit full link from the server wins over derivation', () {
      expect(
        avatarUrlFor(
          preview,
          logicalSize: 120,
          devicePixelRatio: 3,
          fullUrl: 'https://cdn.test/full',
        ),
        'https://cdn.test/full',
      );
      // An empty one counts as none.
      expect(
        avatarUrlFor(
          preview,
          logicalSize: 120,
          devicePixelRatio: 3,
          fullUrl: '',
        ),
        full,
      );
    });

    test(
        'a signed link (dev: the signature covers the exact path) or a link '
        'that is no preview stays as it is', () {
      const signed = '$preview?X-Amz-Signature=abc&X-Amz-Expires=3600';
      expect(
        avatarUrlFor(signed, logicalSize: 120, devicePixelRatio: 3),
        signed,
      );
      expect(
        avatarUrlFor(full, logicalSize: 120, devicePixelRatio: 3),
        full,
      );
    });
  });

  group('avatarFullUrlFor (the full-screen view)', () {
    test("full link, else the preview's full picture, else the preview", () {
      expect(
        avatarFullUrlFor(preview, fullUrl: 'https://cdn.test/f'),
        'https://cdn.test/f',
      );
      expect(avatarFullUrlFor(preview), full);
      expect(
        avatarFullUrlFor('https://x.test/me.jpg'),
        'https://x.test/me.jpg',
      );
    });
  });
}
