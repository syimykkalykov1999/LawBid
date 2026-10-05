// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'outreach_partner_dto.g.dart';

@JsonSerializable()
class OutreachPartnerDto {
  const OutreachPartnerDto({
    required this.id,
    required this.userId,
    required this.name,
    required this.label,
    required this.code,
    required this.status,
  });

  factory OutreachPartnerDto.fromJson(Map<String, Object?> json) =>
      _$OutreachPartnerDtoFromJson(json);

  final String id;
  final String userId;
  final String? name;
  final String? label;

  /// The partner referral code (their link).
  final String code;
  final String status;

  Map<String, Object?> toJson() => _$OutreachPartnerDtoToJson(this);
}
