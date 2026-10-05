// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_partner_user_dto.g.dart';

@JsonSerializable()
class AdminPartnerUserDto {
  const AdminPartnerUserDto({
    required this.id,
    this.name,
    this.email,
    this.role,
  });

  factory AdminPartnerUserDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerUserDtoFromJson(json);

  final String id;
  final String? name;
  final String? email;
  final String? role;

  Map<String, Object?> toJson() => _$AdminPartnerUserDtoToJson(this);
}
