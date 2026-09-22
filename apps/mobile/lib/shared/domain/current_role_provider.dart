import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'user_role.dart';

/// STUB for stage 1.5: no real session exists yet, so this always reports
/// `client`. Stage 1.7 overrides/replaces this with the real session-backed
/// role once `SessionState` exists — every reader (`bottom_nav_config.dart`,
/// route guards) already goes through this provider, so nothing else needs
/// to change when that happens.
final currentUserRoleProvider = Provider<UserRole>((ref) => UserRole.client);
