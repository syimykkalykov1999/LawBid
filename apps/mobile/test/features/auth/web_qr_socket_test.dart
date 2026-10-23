import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/auth/application/qr_login_providers.dart';
import 'package:lawbid/features/auth/presentation/screens/web_qr_login_screen.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (docs/runbooks/QR_LOGIN.md): the website opens the
/// `/qr` socket for its code; «approved» makes the poll run at once instead
/// of on the next 10-second tick, «rejected» shows the refusal, «expired»
/// asks for a new code. The poll stays as the fallback.
class _Socket implements QrLoginSocket {
  final controller = StreamController<QrLoginSocketEvent>.broadcast();
  bool disposed = false;

  @override
  Stream<QrLoginSocketEvent> get events => controller.stream;

  @override
  void dispose() {
    disposed = true;
    unawaited(controller.close());
  }
}

class _Repo implements QrLoginRepository {
  int codes = 0;
  int polls = 0;
  WebLoginStatus polled = WebLoginStatus.pending;

  @override
  Future<WebLoginCode> createCode() async {
    codes++;
    return WebLoginCode(
      qrId: 'code-$codes-aaaaaaaaaaaaaaaa',
      pollSecret: 'secret',
      url: 'https://lawbid.dev/q/code-$codes',
      expiresIn: const Duration(seconds: 120),
    );
  }

  @override
  Future<WebLoginStatus> poll(WebLoginCode code) async {
    polls++;
    return polled;
  }

  @override
  Future<WebLoginPreview> preview(String qrId) => throw UnimplementedError();

  @override
  Future<void> answer(String qrId, {required bool approve}) async {}
}

void main() {
  late _Repo repo;
  late List<_Socket> sockets;
  late List<String> opened;

  Future<void> pump(WidgetTester tester) async {
    repo = _Repo();
    sockets = [];
    opened = [];
    await tester.pumpWidget(
      uxApp(
        const WebQrLoginScreen(),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            qrLoginRepositoryProvider.overrideWithValue(repo),
            qrLoginSocketFactoryProvider.overrideWithValue((api, qrId) {
              opened.add(qrId);
              final s = _Socket();
              sockets.add(s);
              return s;
            }),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('approved over the socket → an immediate poll', (tester) async {
    await pump(tester);
    expect(opened, ['code-1-aaaaaaaaaaaaaaaa']);
    expect(repo.polls, 0);
    repo.polled = WebLoginStatus.approved;
    sockets.single.controller.add(QrLoginSocketEvent.approved);
    await tester.pump();
    await tester.pump();
    expect(repo.polls, 1);
    await tester.pumpWidget(const SizedBox());
    expect(sockets.single.disposed, isTrue);
  });

  testWidgets('expired over the socket → a new code and a new socket',
      (tester) async {
    await pump(tester);
    sockets.single.controller.add(QrLoginSocketEvent.expired);
    await tester.pump();
    await tester.pump();
    expect(repo.codes, 2);
    expect(opened, ['code-1-aaaaaaaaaaaaaaaa', 'code-2-aaaaaaaaaaaaaaaa']);
    expect(sockets.first.disposed, isTrue);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('rejected over the socket → the refusal, no poll',
      (tester) async {
    await pump(tester);
    sockets.single.controller.add(QrLoginSocketEvent.rejected);
    await tester.pump();
    await tester.pump();
    expect(repo.polls, 0);
    expect(find.text('Declined on the phone'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
