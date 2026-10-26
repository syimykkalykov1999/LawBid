// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_billing_user_dto.g.dart';

@JsonSerializable()
class AdminBillingUserDto {
  const AdminBillingUserDto({
    required this.id,
    required this.name,
    required this.username,
    required this.email,
    required this.role,
  });

  factory AdminBillingUserDto.fromJson(Map<String, Object?> json) =>
      _$AdminBillingUserDtoFromJson(json);

  final String id;
  final String? name;
  final String? username;
  final String? email;
  final String? role;

  Map<String, Object?> toJson() => _$AdminBillingUserDtoToJson(this);
}
