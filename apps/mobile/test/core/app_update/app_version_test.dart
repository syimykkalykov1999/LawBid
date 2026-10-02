// ignore_for_file: lines_longer_than_80_chars
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/network/headers_interceptor.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../helpers/fake_http_adapter.dart';
import 'app_update_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(AppVersion.resetForTest);

  void mockPackageInfo(
    String version, {
    String packageName = 'com.lawbid.lawbid.dev',
  }) {
    PackageInfo.setMockInitialValues(
      appName: 'LawBid Dev',
      packageName: packageName,
      version: version,
      buildNumber: '42',
      buildSignature: '',
    );
  }

  test('load() reads the installed version from package_info_plus', () async {
    mockPackageInfo('2.3.4');
    expect(await AppVersion.load(), '2.3.4');
    expect(AppVersion.current, '2.3.4');
    expect(AppVersion.packageName, 'com.lawbid.lawbid.dev');
    expect(HeadersInterceptor.appVersion, '2.3.4');
  });

  test('a failing platform lookup keeps the non-blocking fallback', () async {
    final v = await AppVersion.load(
      source: () async => throw StateError('no plugin'),
    );
    expect(v, AppVersion.fallback);
    expect(AppVersion.packageName, isNull);
  });

  test(
      'every request carries the real version in X-App-Version (not a hardcoded one)',
      () async {
    mockPackageInfo('7.8.9');
    await AppVersion.load();

    final container = ProviderContainer(overrides: await baseOverrides());
    addTearDown(container.dispose);
    final adapter = FakeHttpAdapter((o) async => ok({'ok': true}));
    final dio = container.read(dioProvider)..httpClientAdapter = adapter;

    await dio.get<dynamic>(
      '/anything',
      options: Options(extra: const {'skipAuth': true}),
    );
    await dio.post<dynamic>(
      '/auth/otp/request',
      options: Options(extra: const {'skipAuth': true}),
    );

    expect(adapter.requests, hasLength(2));
    for (final r in adapter.requests) {
      expect(r.headers['X-App-Version'], '7.8.9');
      expect(r.headers['X-Platform'], anyOf('ios', 'android'));
    }
  });
}
