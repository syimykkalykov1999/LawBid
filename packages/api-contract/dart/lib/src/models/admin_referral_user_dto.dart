// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_referral_user_dto.g.dart';

@JsonSerializable()
class AdminReferralUserDto {
  const AdminReferralUserDto({
    required this.id,
    this.name,
    this.email,
    this.role,
  });

  factory AdminReferralUserDto.fromJson(Map<String, Object?> json) =>
      _$AdminReferralUserDtoFromJson(json);

  final String id;
  final String? name;
  final String? email;
  final String? role;

  Map<String, Object?> toJson() => _$AdminReferralUserDtoToJson(this);
}
