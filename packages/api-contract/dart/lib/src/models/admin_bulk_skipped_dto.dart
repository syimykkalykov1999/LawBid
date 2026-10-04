// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_bulk_skipped_dto_reason.dart';

part 'admin_bulk_skipped_dto.g.dart';

@JsonSerializable()
class AdminBulkSkippedDto {
  const AdminBulkSkippedDto({required this.id, required this.reason});

  factory AdminBulkSkippedDto.fromJson(Map<String, Object?> json) =>
      _$AdminBulkSkippedDtoFromJson(json);

  final String id;
  final AdminBulkSkippedDtoReason reason;

  Map<String, Object?> toJson() => _$AdminBulkSkippedDtoToJson(this);
}
