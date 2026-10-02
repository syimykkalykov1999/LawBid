// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_referral_reason_dto.g.dart';

@JsonSerializable()
class AdminReferralReasonDto {
  const AdminReferralReasonDto({required this.reason});

  factory AdminReferralReasonDto.fromJson(Map<String, Object?> json) =>
      _$AdminReferralReasonDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminReferralReasonDtoToJson(this);
}
