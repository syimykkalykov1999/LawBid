import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/client_plan/client_plan_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-05 (plan builder): the server answered
/// ENTITLEMENT_REQUIRED — the user's plan lacks this feature.
bool isPlanRequired(Object error) =>
    error is ApiException && error.code == ApiErrorCodes.entitlementRequired;

/// Opens the plans: a client sees «Подписка клиента», an attorney (or an
/// assistant, whose attorney pays) the subscription paywall naming
/// [reason].
Future<void> openPlanOffer(
  BuildContext context,
  WidgetRef ref,
  PaywallReason reason,
) async {
  await context.push(
    planOfferPath(ref.read(currentUserRoleProvider), reason),
  );
}

String planOfferPath(UserRole? role, PaywallReason reason) =>
    role == UserRole.client
        ? ClientPlanRoutes.clientPlan
        : AppRoutes.subscriptionRequiredFor(reason.name);
