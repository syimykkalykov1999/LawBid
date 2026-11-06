import 'package:flutter/foundation.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// `GET /users/me/role/switch`: can this account switch its profile now.
@immutable
class RoleSwitchPreview {
  const RoleSwitchPreview({
    required this.to,
    required this.blockers,
    required this.needsOnboarding,
    required this.retryAfterSeconds,
  });

  final UserRole to;

  /// What must be finished first (`account.roleSwitch.blocker.<name>`).
  final List<String> blockers;

  /// The other profile does not exist yet: onboarding follows the switch.
  final bool needsOnboarding;

  /// > 0: the daily limit is used up.
  final int retryAfterSeconds;
}
