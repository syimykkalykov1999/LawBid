// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/audience.dart';
import '../models/client_plan_checkout_envelope.dart';
import '../models/client_plan_checkout_request_dto.dart';
import '../models/client_plan_complete_dto.dart';
import '../models/client_plan_me_envelope.dart';
import '../models/my_entitlements_envelope.dart';
import '../models/plans_list_envelope.dart';
import '../models/portal_session_envelope.dart';

part 'plans_client.g.dart';

@RestApi()
abstract class PlansClient {
  factory PlansClient(Dio dio, {String? baseUrl}) = _PlansClient;

  /// Purchasable plans of an audience, with prices
  @GET('/plans')
  Future<PlansListEnvelope> listPlans({
    @Query('audience') Audience? audience,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The signed-in user's plan and entitlements
  @GET('/me/entitlements')
  Future<MyEntitlementsEnvelope> myEntitlements({
    @Extras() Map<String, dynamic>? extras,
  });

  /// The client's plan, entitlements and the plans for sale
  @GET('/client-plans/me')
  Future<ClientPlanMeEnvelope> clientPlanMe({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stripe's hosted page for a client plan
  @POST('/client-plans/checkout')
  Future<ClientPlanCheckoutEnvelope> clientPlanCheckout({
    @Body() required ClientPlanCheckoutRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Back from the payment page: apply the paid session
  @POST('/client-plans/checkout/complete')
  Future<ClientPlanMeEnvelope> clientPlanCheckoutComplete({
    @Body() required ClientPlanCompleteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stripe Customer Portal URL of the client (card, invoices)
  @POST('/client-plans/portal-session')
  Future<PortalSessionEnvelope> clientPlanPortalSession({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Stop renewing (the plan stays until the period ends)
  @POST('/client-plans/cancel')
  Future<ClientPlanMeEnvelope> clientPlanCancel({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Keep the plan (undo a cancel)
  @POST('/client-plans/resume')
  Future<ClientPlanMeEnvelope> clientPlanResume({
    @Extras() Map<String, dynamic>? extras,
  });
}
