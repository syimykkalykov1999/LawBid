import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/network/trace_interceptor.dart';

void main() {
  tearDown(ClientTuning.reset);

  final w3c = RegExp(r'^00-[0-9a-f]{32}-[0-9a-f]{16}-(00|01)$');

  test(
    'traceparent is a valid W3C header, never sent at 0 % or on the web',
    () {
      final t = TraceInterceptor(random: Random(1), web: false);
      expect(t.newTraceparent(5), matches(w3c));
      expect(t.newTraceparent(0), isNull);
      expect(TraceInterceptor(web: true).newTraceparent(100), isNull);
    },
  );

  test('the sampled flag follows the percentage', () {
    final t = TraceInterceptor(random: Random(7), web: false);
    expect(t.newTraceparent(100), endsWith('-01'));
    final flags = [for (var i = 0; i < 2000; i++) t.newTraceparent(5)!];
    final sampled = flags.where((h) => h.endsWith('-01')).length;
    expect(sampled, inInclusiveRange(40, 170)); // about 5 % of 2000
  });

  test('onRequest adds the header from the admin percentage', () {
    ClientTuning.apply({'client.traceparent_percent': '100'});
    final opts = RequestOptions(path: '/feed');
    TraceInterceptor(
      random: Random(3),
      web: false,
    ).onRequest(opts, RequestInterceptorHandler());
    expect(opts.headers['traceparent'], matches(w3c));
    ClientTuning.apply({'client.traceparent_percent': '0'});
    final off = RequestOptions(path: '/feed');
    TraceInterceptor(web: false).onRequest(off, RequestInterceptorHandler());
    expect(off.headers.containsKey('traceparent'), isFalse);
  });

  test('span paths lose ids and queries', () {
    expect(
      TraceInterceptor.scrubPath(
        '/users/8b1f3c2a-1111-2222-3333-444455556666/posts?x=1',
      ),
      '/users/:id/posts',
    );
    expect(TraceInterceptor.scrubPath('/posts/12345'), '/posts/:id');
    expect(TraceInterceptor.scrubPath('/feed'), '/feed');
  });
}
