import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/client_plan/domain/client_plan_models.dart';
import 'package:lawbid/features/plans/data/plan_mappers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05 (plan builder): `/client-plans/*`. Throws
/// `ApiException` (see `guardApiCall`).
abstract interface class ClientPlanRepository {
  Future<ClientPlanOverview> me();

  /// Stripe's hosted page for [planCode] (null = the default client plan).
  Future<ClientPlanCheckout> checkout({String? planCode});

  /// Back from the browser: apply the paid session (no-op until paid).
  Future<ClientPlanOverview> completeCheckout(String sessionId);

  /// Stop renewing; the plan stays until the period ends.
  Future<ClientPlanOverview> cancel();

  /// Undo a cancel before the period ends.
  Future<ClientPlanOverview> resume();

  /// Owner 2026-10-06: Stripe Customer Portal of the client (update the
  /// card, invoices) — shared by the plan and the gold badge.
  Future<Uri> portalUrl();
}

class ApiClientPlanRepository implements ClientPlanRepository {
  ApiClientPlanRepository(Dio dio) : _api = api.PlansClient(dio);

  final api.PlansClient _api;

  static ClientSubscriptionInfo _info(api.ClientSubscriptionDto d) =>
      ClientSubscriptionInfo(
        id: d.id,
        status: SubscriptionStatus.parse(d.status.json),
        isActive: d.isActive,
        planCode: d.planCode,
        priceCents: d.priceCents,
        trialEndsAt: d.trialEndsAt,
        currentPeriodEnd: d.currentPeriodEnd,
        cancelAtPeriodEnd: d.cancelAtPeriodEnd,
        canceledAt: d.canceledAt,
      );

  static ClientPlanOverview _overview(api.ClientPlanMeDto d) =>
      ClientPlanOverview(
        subscription: d.subscription == null ? null : _info(d.subscription!),
        isActive: d.isActive,
        plan: d.plan == null ? null : PlanMappers.plan(d.plan!),
        entitlements: PlanMappers.entitlements(d.entitlements),
        plans: PlanMappers.plans(d.plans),
        trialEligible: d.trialEligible,
      );

  @override
  Future<ClientPlanOverview> me() async =>
      _overview((await guardApiCall(_api.clientPlanMe)).data);

  @override
  Future<ClientPlanCheckout> checkout({String? planCode}) async {
    final d = (await guardApiCall(
      () => _api.clientPlanCheckout(
        body: api.ClientPlanCheckoutRequestDto(planCode: planCode),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    final uri = Uri.tryParse(d.url);
    if (uri == null || !uri.hasScheme) {
      throw const ApiException(
        code: ApiException.networkErrorCode,
        message: 'Unexpected checkout URL from the server.',
      );
    }
    return ClientPlanCheckout(
      url: uri,
      sessionId: d.sessionId,
      priceCents: d.priceCents,
      trialDays: d.trialDays,
    );
  }

  @override
  Future<ClientPlanOverview> completeCheckout(String sessionId) async =>
      _overview(
        (await guardApiCall(
          () => _api.clientPlanCheckoutComplete(
            body: api.ClientPlanCompleteDto(sessionId: sessionId),
          ),
        ))
            .data,
      );

  @override
  Future<ClientPlanOverview> cancel() async =>
      _overview((await guardApiCall(_api.clientPlanCancel)).data);

  @override
  Future<ClientPlanOverview> resume() async =>
      _overview((await guardApiCall(_api.clientPlanResume)).data);

  @override
  Future<Uri> portalUrl() async {
    final d = (await guardApiCall(_api.clientPlanPortalSession)).data;
    final uri = Uri.tryParse(d.url);
    if (uri == null || !uri.hasScheme) {
      throw const ApiException(
        code: ApiException.networkErrorCode,
        message: 'Unexpected portal URL from the server.',
      );
    }
    return uri;
  }
}
