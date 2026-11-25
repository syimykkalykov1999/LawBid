// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_offer_case_dto.g.dart';

@JsonSerializable()
class HotlineOfferCaseDto {
  const HotlineOfferCaseDto({
    this.budgetAmountDollars,
    this.message,
    this.clientContactSharingConsent,
  });

  factory HotlineOfferCaseDto.fromJson(Map<String, Object?> json) =>
      _$HotlineOfferCaseDtoFromJson(json);

  final num? budgetAmountDollars;
  final String? message;

  /// The same consent as POST /cases (asked once; 403 CLIENT_CONTACT_SHARING_CONSENT_REQUIRED until given).
  final bool? clientContactSharingConsent;

  Map<String, Object?> toJson() => _$HotlineOfferCaseDtoToJson(this);
}
