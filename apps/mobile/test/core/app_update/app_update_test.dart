// ignore_for_file: lines_longer_than_80_chars
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/app_update/app_update_gate.dart';
import 'package:lawbid/core/app_update/app_update_interceptor.dart';
import 'package:lawbid/core/app_update/app_update_providers.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/network/headers_interceptor.dart';
import 'package:lawbid/core/startup/app_startup.dart';

import '../../helpers/fake_http_adapter.dart';
import 'app_update_test_harness.dart';

/// X-Platform of the test host (macOS → "android", see
/// HeadersInterceptor.platformName) — the app_config keys are per platform.
final _p = HeadersInterceptor.platformName;

void main() {
  setUp(AppVersion.resetForTest); // current = 0.1.0

  Future<ProviderContainer> containerWith({
    Map<String, String> appConfig = const {},
    Map<String, Object> prefs = const {},
  }) async {
    final c = ProviderContainer(
      overrides: await baseOverrides(appConfig: appConfig, prefs: prefs),
    );
    addTearDown(c.dispose);
    return c;
  }

  group('426 APP_UPDATE_REQUIRED from any request', () {
    test('flips the forced-update state (status 426 + envelope)', () async {
      final c = await containerWith();
      final dio = c.read(dioProvider)
        ..httpClientAdapter = FakeHttpAdapter(
          (o) async =>
              apiError(426, 'APP_UPDATE_REQUIRED', {'minVersion': '9.0.0'}),
        );
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.upToDate);

      await expectLater(
        dio.get<dynamic>('/cases/feed'),
        throwsA(isA<DioException>()),
      );

      expect(c.read(forcedUpdateProvider), isTrue);
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.updateRequired);
    });

    test('also on the error code alone, and never for other errors', () async {
      final c = await containerWith();
      final adapter = FakeHttpAdapter((o) async => apiError(403, 'FORBIDDEN'));
      final dio = c.read(dioProvider)..httpClientAdapter = adapter;

      await expectLater(dio.get<dynamic>('/a'), throwsA(isA<DioException>()));
      expect(c.read(forcedUpdateProvider), isFalse);

      adapter.handler =
          (o) async => apiError(400, AppUpdateInterceptor.errorCode);
      await expectLater(dio.post<dynamic>('/b'), throwsA(isA<DioException>()));
      expect(c.read(forcedUpdateProvider), isTrue);
    });

    testWidgets('opens the forced-update screen over whatever is showing',
        (tester) async {
      final c = await containerWith();
      final dio = c.read(dioProvider)
        ..httpClientAdapter =
            FakeHttpAdapter((o) async => apiError(426, 'APP_UPDATE_REQUIRED'));
      await tester.pumpWidget(gatedApp(c));
      expect(find.text('HOME'), findsOneWidget);
      expect(find.byType(ForcedUpdateScreen), findsNothing);

      await tester.runAsync(() async {
        try {
          await dio.get<dynamic>('/users/me');
        } on DioException catch (_) {}
      });
      await tester.pumpAndSettle();

      expect(find.byType(ForcedUpdateScreen), findsOneWidget);
      expect(find.byKey(const Key('app_update.forced')), findsOneWidget);
      // Not dismissible: back is swallowed.
      final popScope = tester.widget<PopScope<dynamic>>(
        find.descendant(
          of: find.byType(ForcedUpdateScreen),
          matching: find.byWidgetPredicate((w) => w is PopScope),
        ),
      );
      expect(popScope.canPop, isFalse);
    });
  });

  group('bootstrap min_app_version', () {
    test('below the minimum → update required; at/above → up to date',
        () async {
      var c = await containerWith(appConfig: {'min_app_version_$_p': '0.2.0'});
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.updateRequired);
      c = await containerWith(appConfig: {'min_app_version_$_p': '0.1.0'});
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.upToDate);
    });
  });

  group('soft update (soft_update_version_*)', () {
    test('newer soft version → dismissible prompt; same/older → nothing',
        () async {
      var c =
          await containerWith(appConfig: {'soft_update_version_$_p': '0.3.0'});
      expect(
        c.read(appUpdateStatusProvider),
        AppUpdateStatus.softUpdateAvailable,
      );
      c = await containerWith(appConfig: {'soft_update_version_$_p': '0.1.0'});
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.upToDate);
      c = await containerWith(
        appConfig: {'soft_update_version_$_p': 'garbage'},
      );
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.upToDate);
    });

    test('dismissal is remembered per soft version; a newer one prompts again',
        () async {
      var c =
          await containerWith(appConfig: {'soft_update_version_$_p': '0.3.0'});
      await c.read(softUpdateDismissalProvider.notifier).dismiss('0.3.0');
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.upToDate);

      // Persisted: a fresh start with the same soft version stays quiet…
      c = await containerWith(
        appConfig: {'soft_update_version_$_p': '0.3.0'},
        prefs: {'app_update.soft_dismissed_version': '0.3.0'},
      );
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.upToDate);
      // …but a newer soft version prompts again.
      c = await containerWith(
        appConfig: {'soft_update_version_$_p': '0.4.0'},
        prefs: {'app_update.soft_dismissed_version': '0.3.0'},
      );
      expect(
        c.read(appUpdateStatusProvider),
        AppUpdateStatus.softUpdateAvailable,
      );
    });

    test('forced update wins over a soft prompt', () async {
      final c = await containerWith(
        appConfig: {
          'soft_update_version_$_p': '0.3.0',
          'min_app_version_$_p': '0.2.0',
        },
      );
      expect(c.read(appUpdateStatusProvider), AppUpdateStatus.updateRequired);
    });

    testWidgets(
        'prompt shows after startup, "Later" dismisses it, "Update" opens the store',
        (
      tester,
    ) async {
      final launched = <Uri>[];
      final c = ProviderContainer(
        overrides: [
          ...await baseOverrides(
            appConfig: {'soft_update_version_$_p': '0.3.0'},
            signedIn: true,
          ),
          storeLauncherProvider.overrideWithValue((url) async {
            launched.add(url);
            return true;
          }),
        ],
      );
      addTearDown(c.dispose);
      await tester.pumpWidget(gatedApp(c));
      await tester.pumpAndSettle();

      expect(c.read(appStartupProvider), StartupStatus.ready);
      expect(find.byType(SoftUpdatePrompt), findsOneWidget);
      expect(find.text('HOME'), findsOneWidget); // app stays usable underneath

      await tester.tap(find.byKey(const Key('app_update.soft.update')));
      await tester.pumpAndSettle();
      expect(launched, hasLength(1));
      if (_p == 'android') {
        expect(launched.single.host, 'play.google.com');
        expect(
          launched.single.queryParameters['id'],
          startsWith('com.lawbid.lawbid'),
        );
      }

      await tester.tap(find.byKey(const Key('app_update.soft.later')));
      await tester.pumpAndSettle();
      expect(find.byType(SoftUpdatePrompt), findsNothing);
      expect(c.read(softUpdateDismissalProvider), '0.3.0');
    });

    testWidgets(
        'no soft prompt in the pre-app (signed-out) flow; forced update still shows',
        (
      tester,
    ) async {
      var c =
          await containerWith(appConfig: {'soft_update_version_$_p': '0.3.0'});
      await tester.pumpWidget(gatedApp(c));
      await tester.pumpAndSettle();
      expect(
        c.read(appUpdateStatusProvider),
        AppUpdateStatus.softUpdateAvailable,
      );
      expect(find.byType(SoftUpdatePrompt), findsNothing);

      c = await containerWith(appConfig: {'min_app_version_$_p': '0.2.0'});
      await tester.pumpWidget(gatedApp(c));
      await tester.pumpAndSettle();
      expect(find.byType(ForcedUpdateScreen), findsOneWidget);
    });

    test('store_url_* from app_config overrides the computed store link',
        () async {
      final c = await containerWith(
        appConfig: {'store_url_$_p': 'https://example.com/get-lawbid'},
      );
      expect(
        c.read(storeUrlProvider),
        Uri.parse('https://example.com/get-lawbid'),
      );
    });
  });
}
