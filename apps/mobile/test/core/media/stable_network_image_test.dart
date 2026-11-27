import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/stable_network_image.dart';

// A 1×1 transparent PNG.
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpe'
  'qz8AAAAASUVORK5CYII=',
);

/// Links → bytes; any other link answers [status] (403 / 404).
class _FakeCache implements BaseCacheManager {
  _FakeCache(this.ok, {this.status = 404});

  final Map<String, List<int>> ok;
  final int status;
  final fetched = <String>[];
  final keys = <String>[];
  final _fs = MemoryCacheSystem();

  // `getSingleFile` returns package:file's File, which this app does not
  // depend on by name: answered through noSuchMethod.
  dynamic _get(String url, String? key) {
    fetched.add(url);
    keys.add(key ?? url);
    final bytes = ok[url];
    if (bytes == null) {
      return Future<Never>.error(HttpExceptionWithStatus(status, 'refused'));
    }
    // A flat file name (the memory file system has no folders); the
    // future's type comes from createFile (Future<File>).
    final created = _fs.createFile('picture${fetched.length}');
    return created.then((f) async {
      await f.writeAsBytes(bytes);
      return f;
    });
  }

  /// Copies already on the phone, by key: (bytes, valid till).
  final kept = <String, (List<int>, DateTime)>{};
  final removed = <String>[];

  @override
  Future<void> removeFile(String key) async {
    removed.add(key);
    kept.remove(key);
  }

  Future<FileInfo?> _cached(String key) async {
    final k = kept[key];
    if (k == null) return null;
    final f = await _fs.createFile('kept${key.hashCode}');
    await f.writeAsBytes(k.$1);
    return FileInfo(f, FileSource.Cache, k.$2, key);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #getFileFromCache) {
      return _cached(invocation.positionalArguments.first as String);
    }
    if (invocation.memberName == #getSingleFile) {
      final url = invocation.positionalArguments.first as String;
      final key = invocation.namedArguments[#key] as String? ?? url;
      final k = kept[key];
      // The package's own rule (cache_manager.dart getSingleFile): a copy
      // past its HTTP validTill is downloaded again.
      if (k != null && k.$2.isAfter(DateTime.now())) {
        return _cached(key).then((i) => i!.file);
      }
      return _get(
        invocation.positionalArguments.first as String,
        invocation.namedArguments[#key] as String?,
      );
    }
    return super.noSuchMethod(invocation);
  }
}

/// Resolves [provider] and waits for the picture or the error.
Future<bool> _loads(ImageProvider provider) {
  final done = Completer<bool>();
  final stream = provider.resolve(ImageConfiguration.empty);
  late final ImageStreamListener l;
  l = ImageStreamListener(
    (_, __) {
      if (!done.isCompleted) done.complete(true);
      stream.removeListener(l);
    },
    onError: (e, _) {
      printOnFailure('load error: $e');
      if (!done.isCompleted) done.complete(false);
      stream.removeListener(l);
    },
  );
  stream.addListener(l);
  return done.future;
}

const _expired = 'https://s3.local/media/avatar/s1/2026/10/f1_w256'
    '?X-Amz-Signature=old&X-Amz-Expires=3600';
const _fresh = 'https://s3.local/media/avatar/s1/2026/10/f1_w256'
    '?X-Amz-Signature=new&X-Amz-Expires=3600';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    StableNetworkImage.resetFailures();
    PaintingBinding.instance.imageCache
      ..clear()
      ..clearLiveImages();
  });

  test('root cause: the old provider equals itself across fresh links', () {
    // Same file, a new signature → "the same picture" → the Image keeps a
    // failed load forever.
    expect(
      CachedNetworkImageProvider(_expired, cacheKey: Uri.parse(_expired).path),
      CachedNetworkImageProvider(_fresh, cacheKey: Uri.parse(_fresh).path),
    );
  });

  testWidgets('an expired link fails, the fresh link of the same file loads',
      (tester) async {
    await tester.runAsync(() async {
      final cache = _FakeCache({_fresh: _png}, status: 403);
      final first = StableNetworkImage(_expired, cacheManager: cache);
      expect(await _loads(first), isFalse);

      final second = StableNetworkImage(_fresh, cacheManager: cache);
      // Differs from the failed one → the Image loads again.
      expect(second == first, isFalse);
      expect(await _loads(second), isTrue);
      // Kept on the phone by the file, not by the link.
      expect(cache.keys.toSet(), {'/media/avatar/s1/2026/10/f1_w256'});

      // After the success, links of that file are one picture again.
      expect(
        StableNetworkImage(_expired, cacheManager: cache),
        StableNetworkImage(_fresh, cacheManager: cache),
      );
    });
  });

  testWidgets('a missing preview falls back to the full picture',
      (tester) async {
    await tester.runAsync(() async {
      const preview = 'https://cdn.lawbid.test/avatar/s1/2026/10/f2_w256';
      const full = 'https://cdn.lawbid.test/avatar/s1/2026/10/f2';
      final cache = _FakeCache({full: _png});
      expect(
        await _loads(StableNetworkImage(preview, cacheManager: cache)),
        isTrue,
      );
      expect(cache.fetched, [preview, full]);
    });
  });

  testWidgets('a signed preview uses the given full-size link', (tester) async {
    await tester.runAsync(() async {
      const full = 'https://s3.local/media/avatar/s1/2026/10/f1'
          '?X-Amz-Signature=x&X-Amz-Expires=3600';
      final cache = _FakeCache({full: _png});
      final p = StableNetworkImage(
        _fresh,
        fallbackUrls: const [full],
        cacheManager: cache,
      );
      expect(await _loads(p), isTrue);
      expect(cache.fetched, [_fresh, full]);
    });
  });

  testWidgets('nothing loads → an error (the letters stay), no throw',
      (tester) async {
    await tester.runAsync(() async {
      final cache = _FakeCache({});
      expect(
        await _loads(
          StableNetworkImage(
            'https://cdn.lawbid.test/a/f3_w256',
            cacheManager: cache,
          ),
        ),
        isFalse,
      );
    });
  });

  test('fullPictureOf: public previews only', () {
    expect(
      fullPictureOf('https://cdn.x/avatar/f_w256'),
      'https://cdn.x/avatar/f',
    );
    expect(
      fullPictureOf('https://cdn.x/avatar/f_w256.avif'),
      'https://cdn.x/avatar/f',
    );
    expect(fullPictureOf('https://cdn.x/avatar/f'), isNull);
    expect(fullPictureOf(_fresh), isNull);
  });

  testWidgets(
    'owner 27.11: a kept chat photo past its HTTP max-age (1 h) loads from '
    'the phone, even when its saved link has expired',
    (tester) async {
      await tester.runAsync(() async {
        // Chat media answers `Cache-Control: private, max-age=3600`; the saved
        // link lives 15 min. Hours later: the copy is "stale", the link 403.
        final cache = _FakeCache({}, status: 403);
        const key = '/chat_attachment/u1/f9';
        cache.kept[key] = (
          _png,
          DateTime.now().subtract(const Duration(hours: 5)),
        );
        final photo = StableNetworkImage(
          'https://media.lawbid.test$key?Expires=1&Signature=s&Key-Pair-Id=k',
          cacheManager: cache,
        );
        expect(await _loads(photo), isTrue);
        expect(cache.fetched, isEmpty, reason: 'no download, no 403');
        expect(cache.removed, isEmpty, reason: 'the good copy stays');
      });
    },
  );

  testWidgets('a failed download never removes a copy (only a broken file)', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final cache = _FakeCache({}, status: 403);
      final photo = StableNetworkImage(
        'https://media.lawbid.test/chat_attachment/u1/f10'
        '?Expires=1&Signature=s&Key-Pair-Id=k',
        cacheManager: cache,
      );
      expect(await _loads(photo), isFalse);
      expect(cache.removed, isEmpty);
    });
  });

  test('signed link expiry: CloudFront Expires and S3 X-Amz-*', () {
    final now = DateTime.utc(2026, 11, 27, 22, 30);
    expect(
      signedLinkExpired(
        'https://m.test/a?Expires=${now.millisecondsSinceEpoch ~/ 1000 - 60}'
        '&Signature=s&Key-Pair-Id=k',
        now: now,
      ),
      isTrue,
    );
    expect(
      signedLinkExpired(
        'https://m.test/a?Expires=${now.millisecondsSinceEpoch ~/ 1000 + 900}'
        '&Signature=s&Key-Pair-Id=k',
        now: now,
      ),
      isFalse,
    );
    expect(
      signedLinkExpiry(
        'https://s3.test/a?X-Amz-Date=20261127T221500Z&X-Amz-Expires=900'
        '&X-Amz-Signature=s',
      ),
      DateTime.utc(2026, 11, 27, 22, 30),
    );
    expect(signedLinkExpired('https://cdn.test/a.jpg', now: now), isFalse);
  });
}
