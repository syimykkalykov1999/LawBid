// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_users_filter_dto.dart';

part 'admin_users_bulk_preview_dto.g.dart';

@JsonSerializable()
class AdminUsersBulkPreviewDto {
  const AdminUsersBulkPreviewDto({required this.filter});

  factory AdminUsersBulkPreviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminUsersBulkPreviewDtoFromJson(json);

  final AdminUsersFilterDto filter;

  Map<String, Object?> toJson() => _$AdminUsersBulkPreviewDtoToJson(this);
}
