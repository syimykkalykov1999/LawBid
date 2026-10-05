// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'client_plan_checkout_dto.g.dart';

@JsonSerializable()
class ClientPlanCheckoutDto {
  const ClientPlanCheckoutDto({
    required this.url,
    required this.sessionId,
    required this.priceCents,
    required this.trialDays,
  });

  factory ClientPlanCheckoutDto.fromJson(Map<String, Object?> json) =>
      _$ClientPlanCheckoutDtoFromJson(json);

  final String url;
  final String sessionId;
  final int priceCents;
  final int trialDays;

  Map<String, Object?> toJson() => _$ClientPlanCheckoutDtoToJson(this);
}
