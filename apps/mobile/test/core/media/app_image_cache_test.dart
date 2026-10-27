import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/app_image_cache.dart';

class _FailingService extends FileService {
  @override
  Future<FileServiceResponse> get(
    String url, {
    Map<String, String>? headers,
  }) =>
      Future<FileServiceResponse>.error(StateError('no network in a test'));
}

/// Caching round 2 (S2-11): the picture caches ask for a byte trim after
/// every [AppImageCaches.writesPerTrim] downloads, not only at app start and
/// once a day.
void main() {
  tearDown(() => AppImageCaches.onWriteBurst = null);

  test('the counting service counts every download and still delegates',
      () async {
    var n = 0;
    final service = CountingFileService(() => n++, inner: _FailingService());
    await expectLater(service.get('https://x/a.jpg'), throwsStateError);
    await expectLater(service.get('https://x/b.jpg'), throwsStateError);
    expect(n, 2);
  });

  test('a trim is requested once per writesPerTrim downloads', () {
    var trims = 0;
    AppImageCaches.onWriteBurst = () => trims++;
    // Reach a known position: finish whatever burst a previous test left.
    for (var i = 0; i < AppImageCaches.writesPerTrim; i++) {
      AppImageCaches.noteWrite();
    }
    trims = 0;
    for (var i = 0; i < AppImageCaches.writesPerTrim * 3; i++) {
      AppImageCaches.noteWrite();
    }
    expect(trims, 3);
  });

  test('without a listener the counter is harmless', () {
    AppImageCaches.onWriteBurst = null;
    for (var i = 0; i < AppImageCaches.writesPerTrim * 2; i++) {
      AppImageCaches.noteWrite();
    }
  });
}
