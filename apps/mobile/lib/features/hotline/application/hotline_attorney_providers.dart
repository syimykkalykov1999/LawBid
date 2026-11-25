import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/hotline/data/hotline_attorney_repository.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// The master switch (Флаги → «Горячая линия», /config/bootstrap).
const kHotlineAttorneyFlag = 'hotline';

final hotlineAttorneyRepositoryProvider = Provider<HotlineAttorneyRepository>(
  (ref) => ApiHotlineAttorneyRepository(ref.watch(dioProvider)),
);

/// The flag alone (no request while it is off).
final hotlineFlagOnProvider = Provider<bool>(
  (ref) =>
      ref.watch(featureFlagsControllerProvider).isEnabled(kHotlineAttorneyFlag),
);

/// The attorney himself (an assistant never waits for calls, the server
/// refuses it too).
final hotlineIsAttorneyProvider = Provider<bool>(
  (ref) =>
      ref.watch(currentUserRoleProvider) == UserRole.attorney &&
      !ref.watch(isAssistantProvider),
);

/// `GET /hotline/config` — read only while the flag is on, kept 5 minutes.
final hotlineAttorneyConfigProvider =
    FutureProvider.autoDispose<HotlineAttorneyConfig?>(
  (ref) async {
    if (!ref.watch(hotlineFlagOnProvider)) return null;
    if (ref.watch(sessionControllerProvider.select((s) => s?.sub)) == null) {
      return null;
    }
    final link = ref.keepAlive();
    final timer = Future<void>.delayed(const Duration(minutes: 5), link.close);
    ref.onDispose(timer.ignore);
    return ref.watch(hotlineAttorneyRepositoryProvider).config();
  },
  retry: (_, __) => null,
);

/// Whether the attorney's hotline button shows (mockup a1): the flag, the
/// server switch and `hotline.mode` not «Выкл для всех». With the flag off
/// nothing hotline shows anywhere.
final hotlineAttorneyVisibleProvider = Provider<bool>((ref) {
  if (!ref.watch(hotlineFlagOnProvider)) return false;
  if (!ref.watch(hotlineIsAttorneyProvider)) return false;
  final cfg = ref.watch(hotlineAttorneyConfigProvider).value;
  return cfg != null && cfg.enabled && cfg.mode != HotlineLineMode.offForAll;
});
