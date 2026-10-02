// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/promo_validation_envelope.dart';
import '../models/validate_promo_dto.dart';

part 'billing_client.g.dart';

@RestApi()
abstract class BillingClient {
  factory BillingClient(Dio dio, {String? baseUrl}) = _BillingClient;

  /// Is this promo code usable by me for this purchase?
  @POST('/billing/promo/validate')
  Future<PromoValidationEnvelope> validatePromoCode({
    @Body() required ValidatePromoDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
