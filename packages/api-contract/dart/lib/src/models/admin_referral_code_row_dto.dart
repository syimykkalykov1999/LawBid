// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_referral_code_row_dto.g.dart';

@JsonSerializable()
class AdminReferralCodeRowDto {
  const AdminReferralCodeRowDto({
    required this.userId,
    required this.code,
    required this.ownerName,
    required this.ownerEmail,
    required this.invited,
    required this.createdAt,
  });

  factory AdminReferralCodeRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminReferralCodeRowDtoFromJson(json);

  final String userId;
  final String code;
  final String? ownerName;
  final String? ownerEmail;
  final int invited;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminReferralCodeRowDtoToJson(this);
}
