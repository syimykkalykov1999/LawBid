import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/link_preview_providers.dart';
import 'package:lawbid/features/chat/data/link_preview_repository.dart';
import 'package:lawbid/features/chat/presentation/link_preview_card.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (link previews): `GET /link-preview?url=` draws a card
/// under a message with a link; no endpoint / no data = no card and no
/// error; one request per address; the Privacy switch turns it all off.
void main() {
  group('firstUrlIn', () {
    test('finds the first address and drops trailing punctuation', () {
      expect(
        firstUrlIn('see https://lawbid.dev/u/anna.'),
        'https://lawbid.dev/u/anna',
      );
      expect(
        firstUrlIn('(http://example.com/a?b=1), then more'),
        'http://example.com/a?b=1',
      );
      expect(firstUrlIn('no link here'), isNull);
      expect(firstUrlIn('mailto:a@b.co'), isNull);
    });
  });

  group('ApiLinkPreviewRepository', () {
    test('a preview once per address; 404 and errors give null', () async {
      var calls = 0;
      final adapter = FakeHttpAdapter((o) async {
        calls++;
        final url = o.queryParameters['url'];
        if (url == 'https://gone.test/') return apiError(404, 'NOT_FOUND');
        if (url == 'https://empty.test/') return ok({'url': url});
        return ok({
          'url': url,
          'title': 'Five things to know',
          'description': 'Read it twice',
          'imageUrl': 'https://cdn.test/og.jpg',
          'siteName': 'Example',
        });
      });
      final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
        ..httpClientAdapter = adapter;
      final repo = ApiLinkPreviewRepository(dio);

      final p = await repo.fetch('https://example.test/a');
      expect(p?.title, 'Five things to know');
      expect(p?.siteName, 'Example');
      expect(adapter.requests.single.path, '/link-preview');
      expect(adapter.requests.single.extra['cacheMaxAge'], isNotNull);

      // Remembered: no second request.
      await repo.fetch('https://example.test/a');
      expect(calls, 1);

      expect(await repo.fetch('https://gone.test/'), isNull);
      expect(await repo.fetch('https://empty.test/'), isNull);
      expect(calls, 3);
      // Nothing there is remembered too.
      await repo.fetch('https://gone.test/');
      expect(calls, 3);
    });
  });

  group('LinkPreviewCard', () {
    Future<void> pump(
      WidgetTester tester, {
      required LinkPreview? preview,
      bool enabled = true,
    }) async {
      SharedPreferences.setMockInitialValues({
        if (!enabled) 'chat.linkPreviews.v1': 'off',
      });
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        uxApp(
          const Scaffold(
            body: LinkPreviewCard(url: 'https://example.test/a', mine: false),
          ),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [
              sharedPreferencesProvider.overrideWithValue(prefs),
              linkPreviewRepositoryProvider.overrideWithValue(_Fixed(preview)),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('draws site, title and text', (tester) async {
      await pump(
        tester,
        preview: const LinkPreview(
          url: 'https://example.test/a',
          title: 'Five things to know',
          description: 'Read it twice',
          siteName: 'Example',
        ),
      );
      expect(find.text('Example'), findsOneWidget);
      expect(find.text('Five things to know'), findsOneWidget);
      expect(find.text('Read it twice'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('nothing without data, nothing while switched off',
        (tester) async {
      await pump(tester, preview: null);
      expect(find.byType(Container), findsNothing);
      await pump(
        tester,
        preview: const LinkPreview(url: 'https://example.test/a', title: 'T'),
        enabled: false,
      );
      expect(find.text('T'), findsNothing);
    });
  });
}

class _Fixed implements LinkPreviewRepository {
  _Fixed(this.preview);
  final LinkPreview? preview;

  @override
  Future<LinkPreview?> fetch(String url) async => preview;
}
