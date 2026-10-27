import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/deeplinks/deep_link_controller.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/platform/spotlight_index.dart';
import 'package:lawbid/features/profile/application/profile_spotlight.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/social/application/post_spotlight.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-27 (app indexing): iPhone Spotlight finds the attorney
/// profiles and saved posts the user opened — on the device only, titles and
/// subtitles only, off for a user who opted out, emptied on sign-out; a tap
/// on a result is handled like a Universal Link.
class _FakeGateway implements SpotlightGateway {
  final List<SpotlightItem> indexed = [];
  final List<String> removed = [];
  int clears = 0;

  @override
  Future<void> index(SpotlightItem item) async => indexed.add(item);

  @override
  Future<void> remove(String url) async => removed.add(url);

  @override
  Future<void> clear() async => clears++;
}

PublicAttorneyProfile _attorney({
  String username = 'jane.doe',
  bool isSelf = false,
  bool isBlocked = false,
  bool hasBlockedMe = false,
  String? publicUrl,
}) =>
    PublicAttorneyProfile(
      id: 'a1',
      username: username,
      verifiedBadge: true,
      rating: const RatingInfo(average: 4.8, count: 12),
      isSelf: isSelf,
      isBlocked: isBlocked,
      hasBlockedMe: hasBlockedMe,
      publicUrl: publicUrl,
      firstName: 'Jane',
      lastName: 'Doe',
      bio: 'Call me on 555-0100 or jane@example.com',
      licensedStates: const [
        StateRef(code: 'NY', name: 'New York'),
        StateRef(code: 'NJ', name: 'New Jersey'),
      ],
      practices: const [
        SelectedPractice(
          id: 'p1',
          i18nKey: 'practice.divorce',
          nameEn: 'Divorce',
          categoryId: 'c1',
          categoryI18nKey: 'category.family',
        ),
        SelectedPractice(
          id: 'p2',
          i18nKey: 'practice.custody',
          nameEn: 'Custody',
          categoryId: 'c1',
          categoryI18nKey: 'category.family',
        ),
        SelectedPractice(
          id: 'p3',
          i18nKey: 'practice.adoption',
          nameEn: 'Adoption',
          categoryId: 'c1',
          categoryI18nKey: 'category.family',
        ),
      ],
    );

Post _post({
  String id = 'p1',
  String body = 'Tenants: what a landlord may not do.\nSecond line.',
  String? title,
  bool isClient = false,
  String status = 'published',
  DateTime? archivedAt,
}) =>
    Post(
      id: id,
      author: PostAuthor(
        id: 'a1',
        username: 'jane.doe',
        firstName: 'Jane',
        lastName: 'Doe',
        verified: true,
        isClient: isClient,
      ),
      title: title,
      body: body,
      media: const [],
      tags: const [],
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: true,
      isMine: false,
      createdAt: DateTime(2026, 10, 27, 12),
      status: status,
      archivedAt: archivedAt,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('what is indexed', () {
    test('an attorney: name, practices, states — no contact data', () {
      final item = attorneySpotlightItem(_attorney(), host: 'lawbid.dev')!;
      expect(item.title, 'Jane Doe');
      expect(item.subtitle, 'Attorney · Divorce, Custody · NY, NJ');
      expect(item.url, 'https://lawbid.dev/lawyer/jane.doe');
      expect(item.domain, SpotlightDomain.attorney);
      final text = '${item.title} ${item.subtitle} ${item.url}';
      expect(text, isNot(contains('555')));
      expect(text, isNot(contains('@example.com')));
    });

    test('the canonical public page is the link when the server sends it', () {
      final item = attorneySpotlightItem(
        _attorney(publicUrl: 'https://lawbid.dev/attorneys/jane.doe/'),
        host: 'lawbid.dev',
      )!;
      expect(item.url, 'https://lawbid.dev/attorneys/jane.doe/');
      // …and an http or empty value falls back to the app link.
      expect(
        attorneySpotlightItem(
          _attorney(publicUrl: 'http://evil.example/x'),
          host: 'lawbid.dev',
        )!
            .url,
        'https://lawbid.dev/lawyer/jane.doe',
      );
    });

    test('never the own profile, nor a blocked one', () {
      for (final p in [
        _attorney(isSelf: true),
        _attorney(isBlocked: true),
        _attorney(hasBlockedMe: true),
      ]) {
        expect(attorneySpotlightItem(p, host: 'lawbid.dev'), isNull);
      }
    });

    test('a saved post of an attorney: first line + author', () {
      final item = savedPostSpotlightItem(_post(), host: 'lawbid.dev')!;
      expect(item.title, 'Tenants: what a landlord may not do.');
      expect(item.subtitle, 'Jane Doe');
      expect(item.url, 'https://lawbid.dev/post/p1');
      expect(item.domain, SpotlightDomain.post);
      expect(
        savedPostSpotlightItem(_post(title: 'Card title'), host: 'lawbid.dev')!
            .title,
        'Card title',
      );
    });

    test('never a client post, a hidden / archived one, or an empty one', () {
      for (final p in [
        _post(isClient: true),
        _post(status: 'hidden'),
        _post(status: 'removed'),
        _post(archivedAt: DateTime(2026, 10, 26)),
        _post(body: '  \n '),
      ]) {
        expect(savedPostSpotlightItem(p, host: 'lawbid.dev'), isNull);
      }
    });

    test('long lines are cut with an ellipsis', () {
      final line = spotlightLine('a' * 200);
      expect(line.length, 80);
      expect(line, endsWith('…'));
      expect(spotlightLine('\n\n  first \nsecond'), 'first');
    });
  });

  group('SpotlightIndexer', () {
    late _FakeGateway gateway;
    late LocalKvStore store;
    var now = DateTime(2026, 10, 27, 12);
    var enabled = true;
    var optedOut = false;
    var optOutFails = false;
    var optOutReads = 0;

    SpotlightIndexer indexer() => SpotlightIndexer(
          gateway: gateway,
          store: store,
          now: () => now,
          enabled: () => enabled,
          optedOut: () async {
            optOutReads++;
            if (optOutFails) throw StateError('offline');
            return optedOut;
          },
        );

    SpotlightItem item(int i) => SpotlightItem(
          url: 'https://lawbid.dev/lawyer/user$i',
          title: 'User $i',
          subtitle: 'Attorney',
          domain: SpotlightDomain.attorney,
        );

    setUp(() async {
      gateway = _FakeGateway();
      SharedPreferences.setMockInitialValues({});
      store = LocalKvStore(await SharedPreferences.getInstance());
      now = DateTime(2026, 10, 27, 12);
      enabled = true;
      optedOut = false;
      optOutFails = false;
      optOutReads = 0;
    });

    test('indexes an item and remembers its link', () async {
      final s = indexer();
      await s.add(item(1));
      expect(gateway.indexed.map((i) => i.title), ['User 1']);
      expect(s.indexed, ['https://lawbid.dev/lawyer/user1']);
    });

    test('the same link is moved to the newest place, not duplicated',
        () async {
      final s = indexer();
      await s.add(item(1));
      await s.add(item(2));
      await s.add(item(1));
      expect(s.indexed, [
        'https://lawbid.dev/lawyer/user2',
        'https://lawbid.dev/lawyer/user1',
      ]);
    });

    test('at most ${SpotlightIndexer.maxItems} items: the oldest go first',
        () async {
      final s = indexer();
      for (var i = 0; i < SpotlightIndexer.maxItems + 2; i++) {
        await s.add(item(i));
      }
      expect(s.indexed.length, SpotlightIndexer.maxItems);
      expect(gateway.removed, [
        'https://lawbid.dev/lawyer/user0',
        'https://lawbid.dev/lawyer/user1',
      ]);
    });

    test('switched off (flag, platform): nothing is read or indexed',
        () async {
      enabled = false;
      final s = indexer();
      await s.add(item(1));
      await s.remove(item(1).url);
      expect(gateway.indexed, isEmpty);
      expect(gateway.removed, isEmpty);
      expect(optOutReads, 0);
    });

    test('a user who opted out is never indexed and the index is emptied once',
        () async {
      optedOut = true;
      final s = indexer();
      await s.add(item(1));
      await s.add(item(2));
      expect(gateway.indexed, isEmpty);
      expect(gateway.clears, 1);
      expect(s.indexed, isEmpty);
    });

    test('the privacy choice is re-read after the interval and then applies',
        () async {
      final s = indexer();
      await s.add(item(1));
      await s.add(item(2));
      expect(optOutReads, 1);
      optedOut = true;
      await s.add(item(3)); // still the cached answer
      expect(gateway.indexed.length, 3);
      now = now.add(SpotlightIndexer.optOutRecheck);
      await s.add(item(4));
      expect(gateway.indexed.length, 3);
      expect(gateway.clears, 1);
    });

    test('fails closed when the choice cannot be read', () async {
      optOutFails = true;
      final s = indexer();
      await s.add(item(1));
      expect(gateway.indexed, isEmpty);
      expect(gateway.clears, 0); // nothing is deleted on a hiccup
      optOutFails = false;
      await s.add(item(1));
      expect(gateway.indexed, hasLength(1));
    });

    test('remove() and clear() forget links', () async {
      final s = indexer();
      await s.add(item(1));
      await s.add(item(2));
      await s.remove(item(1).url);
      expect(s.indexed, ['https://lawbid.dev/lawyer/user2']);
      expect(gateway.removed, ['https://lawbid.dev/lawyer/user1']);
      await s.clear();
      expect(s.indexed, isEmpty);
      expect(gateway.clears, 1);
    });

    test('a failing native side never throws into the app', () async {
      final s = SpotlightIndexer(
        gateway: _ThrowingGateway(),
        store: store,
        now: () => now,
        enabled: () => true,
        optedOut: () async => false,
      );
      await s.add(item(1));
      await s.remove(item(1).url);
      await s.clear();
    });
  });

  group('a tap on a Spotlight result', () {
    const channel = MethodChannel(spotlightChannelName);
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

    Future<void> nativeOpens(Object? argument) =>
        messenger.handlePlatformMessage(
          spotlightChannelName,
          const StandardMethodCodec()
              .encodeMethodCall(MethodCall('open', argument)),
          (_) {},
        );

    tearDown(() {
      messenger.setMockMethodCallHandler(channel, null);
    });

    test('live: the link is emitted and routes like a Universal Link',
        () async {
      final source = SpotlightDeepLinkSource();
      final got = <Uri>[];
      final sub = source.links.listen(got.add);
      await nativeOpens('https://lawbid.dev/attorneys/jane.doe/');
      await nativeOpens(42); // not a link: ignored
      await sub.cancel();
      expect(got.map((u) => u.toString()), [
        'https://lawbid.dev/attorneys/jane.doe/',
      ]);
      expect(
        parseDeepLink(got.single, host: 'lawbid.dev'),
        const ContentDeepLink(ContentKind.lawyer, 'jane.doe'),
      );
      // A foreign host is never opened, whatever the native side sends.
      expect(
        parseDeepLink(
          Uri.parse('https://evil.example/attorneys/jane.doe/'),
          host: 'lawbid.dev',
        ),
        isNull,
      );
    });

    test('cold start: the native side hands out the pending link', () async {
      messenger.setMockMethodCallHandler(channel, (call) async {
        expect(call.method, 'initialLink');
        return 'https://lawbid.dev/post/p1';
      });
      final uri = await SpotlightDeepLinkSource().initialLink();
      expect(uri.toString(), 'https://lawbid.dev/post/p1');
      expect(
        parseDeepLink(uri!, host: 'lawbid.dev'),
        const ContentDeepLink(ContentKind.post, 'p1'),
      );
    });

    test('an old native build without the bridge: no link, no crash',
        () async {
      expect(await SpotlightDeepLinkSource().initialLink(), isNull);
    });

    test('merged source: first launch link wins, every source is asked',
        () async {
      final a = _FixedSource(null);
      final b = _FixedSource(Uri.parse('https://lawbid.dev/post/p1'));
      final c = _FixedSource(Uri.parse('https://lawbid.dev/case/c1'));
      final merged = MergedDeepLinkSource([a, b, c]);
      expect(
        (await merged.initialLink()).toString(),
        'https://lawbid.dev/post/p1',
      );
      expect([a.asked, b.asked, c.asked], [true, true, true]);
    });

    test('merged source: links of all sources flow', () async {
      final a = _FixedSource(null);
      final b = _FixedSource(null);
      final got = <Uri>[];
      final sub = MergedDeepLinkSource([a, b]).links.listen(got.add);
      a.emit(Uri.parse('https://lawbid.dev/post/p1'));
      b.emit(Uri.parse('https://lawbid.dev/case/c1'));
      await Future<void>.delayed(Duration.zero);
      await sub.cancel();
      expect(got.length, 2);
    });
  });
}

class _ThrowingGateway implements SpotlightGateway {
  @override
  Future<void> index(SpotlightItem item) => throw PlatformException(code: 'x');

  @override
  Future<void> remove(String url) => throw PlatformException(code: 'x');

  @override
  Future<void> clear() => throw PlatformException(code: 'x');
}

class _FixedSource implements DeepLinkSource {
  _FixedSource(this._initial);

  final Uri? _initial;
  bool asked = false;
  final _controller = StreamController<Uri>.broadcast();

  void emit(Uri uri) => _controller.add(uri);

  @override
  Future<Uri?> initialLink() async {
    asked = true;
    return _initial;
  }

  @override
  Stream<Uri> get links => _controller.stream;
}
