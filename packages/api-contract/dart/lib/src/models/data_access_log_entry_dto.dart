// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'data_access_log_entry_dto.g.dart';

@JsonSerializable()
class DataAccessLogEntryDto {
  const DataAccessLogEntryDto({
    required this.id,
    required this.adminId,
    required this.entityType,
    required this.entityId,
    required this.accessedAt,
  });

  factory DataAccessLogEntryDto.fromJson(Map<String, Object?> json) =>
      _$DataAccessLogEntryDtoFromJson(json);

  final String id;
  final String adminId;
  final String entityType;
  final String entityId;
  final DateTime accessedAt;

  Map<String, Object?> toJson() => _$DataAccessLogEntryDtoToJson(this);
}
