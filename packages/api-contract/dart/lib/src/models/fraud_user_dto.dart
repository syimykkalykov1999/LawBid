// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_user_dto_role.dart';

part 'fraud_user_dto.g.dart';

@JsonSerializable()
class FraudUserDto {
  const FraudUserDto({
    required this.id,
    required this.name,
    required this.role,
    required this.accountStatus,
    required this.email,
    required this.phone,
    required this.createdAt,
  });

  factory FraudUserDto.fromJson(Map<String, Object?> json) =>
      _$FraudUserDtoFromJson(json);

  final String id;
  final String? name;
  final FraudUserDtoRole? role;

  /// users.status (active / suspended / …).
  final String accountStatus;

  /// Masked.
  final String? email;

  /// Masked.
  final String? phone;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$FraudUserDtoToJson(this);
}
