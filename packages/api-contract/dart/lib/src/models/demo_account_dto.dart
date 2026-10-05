// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_role.dart';

part 'demo_account_dto.g.dart';

@JsonSerializable()
class DemoAccountDto {
  const DemoAccountDto({
    required this.id,
    required this.role,
    required this.displayName,
    required this.createdAt,
    required this.lastSeenAt,
    required this.expiresAt,
  });

  factory DemoAccountDto.fromJson(Map<String, Object?> json) =>
      _$DemoAccountDtoFromJson(json);

  final String id;
  final DemoRole role;
  final String displayName;
  final DateTime createdAt;
  final DateTime? lastSeenAt;

  /// When the sweep deletes it unless it is used again.
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$DemoAccountDtoToJson(this);
}
