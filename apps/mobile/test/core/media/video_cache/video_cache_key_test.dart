import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/video_cache/video_cache_proxy.dart';

void main() {
  group('VideoCacheProxy cache identity', () {
    test('a re-signed CloudFront URL keeps the same key', () {
      const path = 'https://cdn.example.com/chat/u1/v1.mp4';
      final a = Uri.parse('$path?Expires=1&Signature=aaa&Key-Pair-Id=K1');
      final b = Uri.parse('$path?Expires=999&Signature=bbb&Key-Pair-Id=K1');
      expect(VideoCacheProxy.identityOf(a), VideoCacheProxy.identityOf(b));
      expect(
        VideoCacheProxy.keyOf(VideoCacheProxy.identityOf(a), '_0'),
        VideoCacheProxy.keyOf(VideoCacheProxy.identityOf(b), '_0'),
      );
    });

    test('presigned S3 params (X-Amz-*) are ignored', () {
      const path = 'https://b.s3.amazonaws.com/v.mp4';
      final a =
          Uri.parse('$path?X-Amz-Signature=1&X-Amz-Date=2&X-Amz-Expires=3');
      final b = Uri.parse('$path?X-Amz-Signature=9&X-Amz-Date=8');
      expect(VideoCacheProxy.identityOf(a), VideoCacheProxy.identityOf(b));
    });

    test('different objects and non-signature params stay distinct', () {
      String id(String u) => VideoCacheProxy.identityOf(Uri.parse(u));
      const base = 'https://c.example.com';
      final a = id('$base/a.mp4?Signature=1');
      expect(a, isNot(id('$base/b.mp4?Signature=1')));
      expect(id('$base/a.mp4?v=1'), isNot(id('$base/a.mp4?v=2')));
      expect(id('$base/a.mp4?b=2&a=1&Signature=x'), id('$base/a.mp4?a=1&b=2'));
    });
  });
}
