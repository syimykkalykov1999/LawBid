import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';

void main() {
  late Directory root;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('media_cache_dir_test');
  });
  tearDown(() async {
    if (root.existsSync()) await root.delete(recursive: true);
  });

  File write(String rel, int bytes, {Duration age = Duration.zero}) {
    final f = File('${root.path}/$rel')
      ..createSync(recursive: true)
      ..writeAsBytesSync(List.filled(bytes, 1));
    if (age > Duration.zero)
      f.setLastModifiedSync(DateTime.now().subtract(age));
    return f;
  }

  group('PrefixedTempFiles', () {
    PrefixedTempFiles files() =>
        PrefixedTempFiles('voice_cache_', root: () async => root);

    test('counts only the files with the prefix', () async {
      write('voice_cache_a.m4a', 10);
      write('voice_cache_b.m4a', 5);
      write('other.bin', 100);
      write('sub/voice_cache_c.m4a', 100);
      expect(await files().size(), 15);
    });

    test('clear removes them and leaves everything else', () async {
      write('voice_cache_a.m4a', 10);
      final other = write('other.bin', 100);
      await files().clear();
      expect(await files().size(), 0);
      expect(other.existsSync(), isTrue);
    });

    test('dropOlderThan removes the old ones only', () async {
      final old =
          write('voice_cache_old.m4a', 10, age: const Duration(days: 5));
      final fresh = write('voice_cache_new.m4a', 10);
      final freed = await files().dropOlderThan(const Duration(days: 3));
      expect(freed, 10);
      expect(old.existsSync(), isFalse);
      expect(fresh.existsSync(), isTrue);
    });

    test('trimTo drops the oldest until the rest fits', () async {
      final oldest =
          write('voice_cache_1.m4a', 10, age: const Duration(hours: 3));
      final middle =
          write('voice_cache_2.m4a', 10, age: const Duration(hours: 2));
      final newest = write('voice_cache_3.m4a', 10);
      expect(await files().trimTo(20), 10);
      expect(oldest.existsSync(), isFalse);
      expect(middle.existsSync(), isTrue);
      expect(newest.existsSync(), isTrue);
      expect(await files().trimTo(100), 0);
    });
  });

  group('MediaCacheDir', () {
    MediaCacheDir dir() => MediaCacheDir('chunks', root: () async => root);

    test('clearContents empties the folder but keeps it', () async {
      write('chunks/a', 10);
      write('chunks/deep/b', 10);
      expect(await dir().size(), 20);
      await dir().clearContents();
      expect(await dir().size(), 0);
      expect(Directory('${root.path}/chunks').existsSync(), isTrue);
    });

    test('clear deletes the folder itself', () async {
      write('chunks/a', 10);
      await dir().clear();
      expect(Directory('${root.path}/chunks').existsSync(), isFalse);
    });

    test('a missing folder measures 0 and clears quietly', () async {
      expect(await dir().size(), 0);
      await dir().clearContents();
    });
  });
}
