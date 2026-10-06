// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_created_by_dto.dart';
import 'demo_role.dart';

part 'admin_demo_account_dto.g.dart';

@JsonSerializable()
class AdminDemoAccountDto {
  const AdminDemoAccountDto({
    required this.id,
    required this.role,
    required this.displayName,
    required this.createdAt,
    required this.lastSeenAt,
    required this.expiresAt,
    required this.createdBy,
    required this.label,
    required this.hasInvite,
    required this.inviteExpiresAt,
  });

  factory AdminDemoAccountDto.fromJson(Map<String, Object?> json) =>
      _$AdminDemoAccountDtoFromJson(json);

  final String id;
  final DemoRole role;
  final String displayName;
  final DateTime createdAt;
  final DateTime? lastSeenAt;

  /// When the sweep deletes it unless it is used again.
  final DateTime expiresAt;
  final DemoCreatedByDto createdBy;
  final String? label;
  final bool hasInvite;
  final DateTime? inviteExpiresAt;

  Map<String, Object?> toJson() => _$AdminDemoAccountDtoToJson(this);
}
