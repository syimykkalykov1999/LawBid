import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/auth_interceptor.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/auth/application/sign_out.dart';
import 'package:lawbid/features/notifications/application/push_service.dart';

import '../../helpers/fake_http_adapter.dart';

/// R2-A #10 (Instagram / Telegram): Log out signs the phone out at once; the
/// server is told afterwards, with the token of the session that ended.

class _Session extends SessionController {
  int clears = 0;

  @override
  SessionState? build() => SessionState(
        accessToken: 'old-token',
        sub: 'me',
        role: 'client',
        sid: 's1',
        verified: true,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2100),
      );

  @override
  Future<void> clear() async {
    clears++;
    state = null;
  }

  void signIn(String token) => state = SessionState(
        accessToken: token,
        sub: 'other',
        role: 'client',
        sid: 's2',
        verified: true,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2100),
      );
}

class _Push extends PushService {
  _Push(super.ref);

  @override
  ({String? voip, String? push}) detachForSignOut() =>
      (voip: 'voip-1', push: 'push-1');
}

class _Files implements UploadFiles {
  @override
  Future<void> forgetOnSignOut() async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late FakeHttpAdapter http;
  late Completer<void> server;
  late _Session session;
  late WidgetRef widgetRef;

  Future<void> pump(WidgetTester tester) async {
    server = Completer<void>();
    session = _Session();
    http = FakeHttpAdapter((o) async {
      await server.future;
      return ok({'loggedOut': true});
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          pushServiceProvider.overrideWith(_Push.new),
          uploadFilesProvider.overrideWithValue(_Files()),
          dioProvider.overrideWith((ref) {
            final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
              ..httpClientAdapter = http;
            dio.interceptors.add(AuthInterceptor(ref, dio));
            return dio;
          }),
        ],
        child: MaterialApp(
          home: Consumer(
            builder: (context, ref, _) {
              widgetRef = ref;
              return const SizedBox();
            },
          ),
        ),
      ),
    );
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
  }

  testWidgets('the phone is signed out before the server answers',
      (tester) async {
    await pump(tester);
    // Returns although the server has not answered anything yet.
    await signOut(widgetRef);
    expect(session.clears, 1);
    expect(session.state, isNull);
    await settle(tester);
    // The token deletes go out first, in parallel, with the old token.
    expect(
      http.requests.map((r) => '${r.method} ${r.path}'),
      ['DELETE /push-tokens/voip', 'DELETE /push-tokens'],
    );
    server.complete();
    await settle(tester);
    expect(
      http.requests.map((r) => '${r.method} ${r.path}').last,
      'POST /auth/logout',
    );
    for (final r in http.requests) {
      expect(r.headers['Authorization'], 'Bearer old-token');
    }
  });

  testWidgets(
      'a sign-in that comes before the server half does not lend it the new '
      'token, and its errors do not touch the new session', (tester) async {
    await pump(tester);
    http.handler = (o) async {
      await server.future;
      return apiError(401, 'AUTH_SESSION_REVOKED');
    };
    await signOut(widgetRef);
    session.signIn('new-token');
    server.complete();
    await settle(tester);
    expect(http.requests.last.path, '/auth/logout');
    for (final r in http.requests) {
      expect(r.headers['Authorization'], 'Bearer old-token');
    }
    expect(session.state?.accessToken, 'new-token');
    expect(session.clears, 1);
  });
}
