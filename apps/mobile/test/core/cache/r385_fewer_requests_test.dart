import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderListenable;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/cache/keep_alive_for.dart';
import 'package:lawbid/core/l10n/i18n_api_client.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/data/case_payments_repository.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';

/// R-385 (owner 2026-11-04, «только по изменению идти на сервер»): a
/// screen opened again inside its window asks the server nothing.

class _CountingPayments extends CasePaymentsRepository {
  _CountingPayments() : super(Dio());

  int reads = 0;

  @override
  Future<PaymentSettings> settings() async {
    reads++;
    return const PaymentSettings(
      enabled: false,
      minAmountCents: 0,
      maxAmountCents: 0,
      allowCustomAmount: false,
      allowPartial: false,
      refundWindowDays: 0,
      processingFeePayer: 'client',
      saveCards: false,
      allowInvoices: false,
      allowInstallments: false,
      maxInstallments: 0,
      disclaimerEn: '',
      disclaimerRu: '',
    );
  }
}

/// Answers every request with [body] and remembers its `extra`.
class _Recorder extends Interceptor {
  _Recorder(this.body);

  final Object body;
  final extras = <Map<String, dynamic>>[];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    extras.add(Map.of(options.extra));
    handler.resolve(
      Response<Object>(requestOptions: options, data: body, statusCode: 200),
    );
  }
}

/// Opens a screen (listens), leaves it (closes), returns.
void _visit(ProviderContainer c, ProviderListenable<Object?> p) {
  c.listen(p, (_, __) {}).close();
}

void main() {
  group('Ref.keepAliveFor', () {
    test('re-entry inside the window reads nothing; after it, reads again', () {
      fakeAsync((async) {
        var reads = 0;
        final p = FutureProvider.autoDispose<int>((ref) {
          ref.keepAliveFor(const Duration(minutes: 5));
          return Future.value(++reads);
        });
        final c = ProviderContainer();
        addTearDown(c.dispose);

        _visit(c, p);
        async.flushMicrotasks();
        for (var i = 0; i < 3; i++) {
          async.elapse(const Duration(minutes: 1));
          _visit(c, p);
        }
        expect(reads, 1);

        async.elapse(const Duration(minutes: 5));
        _visit(c, p);
        async.flushMicrotasks();
        expect(reads, 2);
      });
    });

    test('an invalidation (a save, a realtime event) still re-reads', () {
      fakeAsync((async) {
        var reads = 0;
        final p = FutureProvider.autoDispose<int>((ref) {
          ref.keepAliveFor(const Duration(minutes: 5));
          return Future.value(++reads);
        });
        final c = ProviderContainer();
        addTearDown(c.dispose);
        _visit(c, p);
        c.invalidate(p);
        _visit(c, p);
        async.flushMicrotasks();
        expect(reads, 2);
      });
    });
  });

  test('payment settings: opening ten cases in an hour reads them once', () {
    fakeAsync((async) {
      final repo = _CountingPayments();
      final c = ProviderContainer(
        overrides: [casePaymentsRepositoryProvider.overrideWithValue(repo)],
      );
      addTearDown(c.dispose);
      for (var i = 0; i < 10; i++) {
        _visit(c, paymentSettingsProvider);
        async
          ..flushMicrotasks()
          ..elapse(const Duration(minutes: 5));
      }
      expect(repo.reads, 1);
    });
  });

  test('GET /i18n/languages may be answered from the phone for an hour',
      () async {
    final rec = _Recorder({'data': <Object>[]});
    final dio = Dio()..interceptors.add(rec);
    await I18nApiClient(dio).getLanguages();
    expect(
      rec.extras.single[kCacheMaxAgeExtra],
      const Duration(hours: 1).inSeconds,
    );
    expect(rec.extras.single['skipAuth'], isTrue);
  });

  test('reels: page 1 from the phone for 2 min; pull-down and pages ask',
      () async {
    final rec = _Recorder({'data': <Object>[], 'meta': <String, Object>{}});
    final dio = Dio()..interceptors.add(rec);
    final repo = ReelsRepository(apiDio: dio, storageDio: dio);
    await repo.reels();
    await repo.reels(fresh: true);
    await repo.reels(cursor: 'c2');
    expect(rec.extras[0][kCacheMaxAgeExtra], 120);
    expect(rec.extras[1][kCacheMaxAgeExtra], 0);
    expect(rec.extras[2].containsKey(kCacheMaxAgeExtra), isFalse);
  });
}
