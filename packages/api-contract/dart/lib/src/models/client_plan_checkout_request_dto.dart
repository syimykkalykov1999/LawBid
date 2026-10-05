// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'client_plan_checkout_request_dto.g.dart';

@JsonSerializable()
class ClientPlanCheckoutRequestDto {
  const ClientPlanCheckoutRequestDto({this.planCode});

  factory ClientPlanCheckoutRequestDto.fromJson(Map<String, Object?> json) =>
      _$ClientPlanCheckoutRequestDtoFromJson(json);

  /// Plan code from GET /plans?audience=client (default: the audience's default plan).
  final String? planCode;

  Map<String, Object?> toJson() => _$ClientPlanCheckoutRequestDtoToJson(this);
}
