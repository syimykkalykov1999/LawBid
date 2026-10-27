// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_users_bulk_action.dart';
import 'admin_users_filter_dto.dart';

part 'admin_users_bulk_dto.g.dart';

@JsonSerializable()
class AdminUsersBulkDto {
  const AdminUsersBulkDto({
    required this.action,
    this.reason = '',
    this.ids,
    this.filter,
  });

  factory AdminUsersBulkDto.fromJson(Map<String, Object?> json) =>
      _$AdminUsersBulkDtoFromJson(json);

  final AdminUsersBulkAction action;

  /// Exactly one of `ids` or `filter`.
  final List<String>? ids;

  /// S18-10: «select all matching»: the server resolves the ids with the same filter as the list (at most BULK_PREVIEW_CAP users; q, role or status required) and audits the filter.
  final AdminUsersFilterDto? filter;
  final String reason;

  Map<String, Object?> toJson() => _$AdminUsersBulkDtoToJson(this);
}
