// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_user_list_item_dto_role.dart';
import 'admin_user_list_item_dto_status.dart';

part 'admin_user_list_item_dto.g.dart';

@JsonSerializable()
class AdminUserListItemDto {
  const AdminUserListItemDto({
    required this.id,
    required this.role,
    required this.status,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.username,
    required this.verificationStatus,
    required this.avatarUrl,
    required this.createdAt,
  });

  factory AdminUserListItemDto.fromJson(Map<String, Object?> json) =>
      _$AdminUserListItemDtoFromJson(json);

  final String id;
  final AdminUserListItemDtoRole? role;
  final AdminUserListItemDtoStatus status;
  final String? firstName;
  final String? lastName;
  final String? email;

  /// Attorneys only.
  final String? username;
  final String? verificationStatus;
  final String? avatarUrl;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminUserListItemDtoToJson(this);
}
