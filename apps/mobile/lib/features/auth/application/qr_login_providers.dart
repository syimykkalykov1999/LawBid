import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/qr_login_repository.dart';
import 'package:lawbid/features/auth/data/qr_login_socket.dart';

export 'package:lawbid/features/auth/data/qr_login_repository.dart';
export 'package:lawbid/features/auth/data/qr_login_socket.dart';

final qrLoginRepositoryProvider = Provider<QrLoginRepository>(
  (ref) => QrLoginRepository(
    ref.watch(authApiClientProvider),
    ref.watch(sessionControllerProvider.notifier),
  ),
);

/// Owner 2026-10-22 (QR_LOGIN.md): the website's `/qr` socket for one
/// code — `auth:qr_approved` makes the poll run at once instead of on the
/// next 10-second tick. Null = no socket (tests; a platform without one).
final qrLoginSocketFactoryProvider = Provider<QrLoginSocketFactory?>(
  (ref) => SocketIoQrLoginSocket.new,
);
