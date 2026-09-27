import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/settings/account/presentation/screens/account_contact_flow_screen.dart';
import 'package:lawbid/features/settings/account/presentation/screens/account_screen.dart';

/// Settings → Account paths (docs/01 §10.3). Kept in this feature (not
/// `AppRoutes`) so the Account screens stay self-contained.
abstract final class AccountRoutes {
  static const account = '/profile/settings/account';

  /// `/profile/settings/account/contact/<phone|email>?mode=<primary|link>`.
  static const contactPattern = '/profile/settings/account/contact/:type';

  static String contact(ContactType type, AccountContactMode mode) =>
      '/profile/settings/account/contact/${type.name}?mode=${mode.name}';
}

/// Pushed on the ROOT navigator (same reasoning as `AppRoutes
/// .profileSettings`: full-screen settings pages cover the bottom nav).
List<RouteBase> accountRoutes(
        {GlobalKey<NavigatorState>? parentNavigatorKey}) =>
    [
      GoRoute(
        path: AccountRoutes.account,
        parentNavigatorKey: parentNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const AccountScreen()),
      ),
      GoRoute(
        path: AccountRoutes.contactPattern,
        parentNavigatorKey: parentNavigatorKey,
        pageBuilder: (context, state) {
          final type =
              ContactType.values.asNameMap()[state.pathParameters['type']] ??
                  ContactType.phone;
          final mode = AccountContactMode.values
                  .asNameMap()[state.uri.queryParameters['mode']] ??
              AccountContactMode.primary;
          return AppPageTransitions.push(
            state,
            AccountContactFlowScreen(type: type, mode: mode),
          );
        },
      ),
    ];
