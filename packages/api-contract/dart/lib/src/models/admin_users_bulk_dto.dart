// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_users_bulk_action.dart';

part 'admin_users_bulk_dto.g.dart';

@JsonSerializable()
class AdminUsersBulkDto {
  const AdminUsersBulkDto({
    required this.action,
    required this.ids,
    this.reason = '',
  });

  factory AdminUsersBulkDto.fromJson(Map<String, Object?> json) =>
      _$AdminUsersBulkDtoFromJson(json);

  final AdminUsersBulkAction action;
  final List<String> ids;
  final String reason;

  Map<String, Object?> toJson() => _$AdminUsersBulkDtoToJson(this);
}
