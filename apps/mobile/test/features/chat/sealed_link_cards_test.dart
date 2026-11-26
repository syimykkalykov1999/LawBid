import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/link_preview_providers.dart';
import 'package:lawbid/features/chat/application/sealed_link_cards.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/presentation/link_preview_card.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/ux_harness.dart';

/// Third pass S3 (26.11; WhatsApp Security Whitepaper «Link previews»): in
/// an end-to-end encrypted chat the SENDER's phone makes the link card and
/// it travels inside the encryption; the receivers never ask the server.
void main() {
  const page = '''
<html><head>
<title>Fallback title</title>
<meta property="og:title" content="  Five   things​ to know ">
<meta name="description" content="Read it twice">
<meta property="og:image" content="/pic.png">
<meta property="og:site_name" content="Example">
</head><body>not read</body></html>''';

  group('parseOpenGraph (port of the server og-parser.ts)', () {
    test('reads Open Graph, cleans text, resolves the picture', () {
      final og = parseOpenGraph(page, Uri.parse('https://www.example.test/a'));
      expect(og.title, 'Five things to know');
      expect(og.description, 'Read it twice');
      expect(og.imageUrl, 'https://www.example.test/pic.png');
      expect(og.siteName, 'Example');
    });

    test('falls back to <title> and the host; refuses odd pictures', () {
      final og = parseOpenGraph(
        '<head><title>Only title</title> '
        '<meta property="og:image" content="javascript:alert(1)"></head>',
        Uri.parse('https://www.example.test/'),
      );
      expect(og.title, 'Only title');
      expect(og.imageUrl, isNull);
      expect(og.siteName, 'example.test');
    });
  });

  group('SealedLinkCard', () {
    test('round-trips through the encrypted payload', () {
      final card = SealedLinkCard(
        url: 'https://example.test/a',
        title: 'T',
        description: 'D',
        siteName: 'S',
        thumbnail: Uint8List.fromList([1, 2, 3]),
      );
      final payload = E2eePayload(
        kind: 'text',
        body: 'see https://example.test/a',
        extra: {'lp': card.toJson()},
      );
      final back = E2eePayload.decode(payload.encode());
      final got = SealedLinkCard.tryParse(back.extra['lp'])!;
      expect(got.url, card.url);
      expect(got.title, 'T');
      expect(got.description, 'D');
      expect(got.siteName, 'S');
      expect(got.thumbnail, [1, 2, 3]);
    });

    test('drops malformed or unsafe cards', () {
      expect(SealedLinkCard.tryParse(null), isNull);
      expect(SealedLinkCard.tryParse({'u': 'javascript:x', 'ti': 'T'}), isNull);
      expect(SealedLinkCard.tryParse({'u': 'https://e.test'}), isNull);
      final big = SealedLinkCard.tryParse({
        'u': 'https://e.test',
        'ti': 'T',
        'th': 'A' * (SealedLinkCard.maxThumbnailB64 + 4),
      })!;
      expect(big.thumbnail, isNull);
    });
  });

  test('the thumbnail is a small JPEG within the payload limit', () {
    final big = img.Image(width: 2000, height: 1000);
    img.fill(big, color: img.ColorRgb8(200, 30, 30));
    final png = Uint8List.fromList(img.encodePng(big));
    final thumb = makeLinkThumbnail(png)!;
    expect(
      base64Encode(thumb).length,
      lessThanOrEqualTo(SealedLinkCard.maxThumbnailB64),
    );
    expect(img.decodeJpg(thumb)!.width, SealedLinkCards.thumbWidth);
    expect(makeLinkThumbnail(Uint8List.fromList([1, 2, 3])), isNull);
  });

  test('the sender reads the site itself, never our server', () async {
    final picture = img.Image(width: 100, height: 50);
    final adapter = FakeHttpAdapter((o) async {
      if (o.uri.path == '/pic.png') {
        return ResponseBody.fromBytes(
          img.encodePng(picture),
          200,
          headers: {
            Headers.contentTypeHeader: ['image/png'],
          },
        );
      }
      return ResponseBody.fromString(
        page,
        200,
        headers: {
          Headers.contentTypeHeader: ['text/html; charset=utf-8'],
        },
      );
    });
    final dio = Dio(BaseOptions(responseType: ResponseType.stream))
      ..httpClientAdapter = adapter;
    final cards = SealedLinkCards(dio: dio);
    final card = (await cards.build('look https://example.test/a, ok'))!;
    expect(card.url, 'https://example.test/a');
    expect(card.title, 'Five things to know');
    expect(card.thumbnail, isNotNull);
    expect(
      adapter.requests.map((r) => r.uri.toString()),
      ['https://example.test/a', 'https://example.test/pic.png'],
    );
    // Asked once per address.
    await cards.build('again https://example.test/a');
    expect(adapter.requests, hasLength(2));
    expect(await cards.build('no link here'), isNull);
  });

  testWidgets('a sealed card draws without asking the server',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: LinkPreviewCard(
            url: 'https://example.test/a',
            mine: false,
            sealed: SealedLinkCard(
              url: 'https://example.test/a',
              title: 'Sealed title',
              siteName: 'Example',
              thumbnail: Uint8List.fromList(
                img.encodeJpg(img.Image(width: 4, height: 2)),
              ),
            ),
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            linkPreviewRepositoryProvider.overrideWithValue(_NeverAsked()),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sealed title'), findsOneWidget);
    expect(find.byType(Image), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _NeverAsked implements LinkPreviewRepository {
  @override
  Future<LinkPreview?> fetch(String url) =>
      throw StateError('the server must not be asked for $url');
}
