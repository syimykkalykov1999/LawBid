// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_users_filter_dto_role.dart';
import 'admin_users_filter_dto_status.dart';

part 'admin_users_filter_dto.g.dart';

@JsonSerializable()
class AdminUsersFilterDto {
  const AdminUsersFilterDto({
    this.q,
    this.role,
    this.status,
    this.stateCode,
    this.countryCode,
    this.from,
    this.to,
  });

  factory AdminUsersFilterDto.fromJson(Map<String, Object?> json) =>
      _$AdminUsersFilterDtoFromJson(json);

  /// Name (substring), email, phone (any format), @username or user id. Empty = newest users.
  final String? q;
  final AdminUsersFilterDtoRole? role;
  final AdminUsersFilterDtoStatus? status;

  /// Owner 2026-10-04: clients of this state and attorneys licensed in it.
  final String? stateCode;

  /// Owner 2026-10-05: people of this country only.
  final String? countryCode;

  /// Registered at or after (inclusive).
  final DateTime? from;

  /// Registered before (exclusive).
  final DateTime? to;

  Map<String, Object?> toJson() => _$AdminUsersFilterDtoToJson(this);
}
