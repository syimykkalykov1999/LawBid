// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_billing_reason_dto.g.dart';

@JsonSerializable()
class AdminBillingReasonDto {
  const AdminBillingReasonDto({required this.reason});

  factory AdminBillingReasonDto.fromJson(Map<String, Object?> json) =>
      _$AdminBillingReasonDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminBillingReasonDtoToJson(this);
}
