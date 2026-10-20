import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/qr_login_repository.dart';

export 'package:lawbid/features/auth/data/qr_login_repository.dart';

final qrLoginRepositoryProvider = Provider<QrLoginRepository>(
  (ref) => QrLoginRepository(
    ref.watch(authApiClientProvider),
    ref.watch(sessionControllerProvider.notifier),
  ),
);
