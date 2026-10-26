// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_bulk_reason_dto.g.dart';

@JsonSerializable()
class AdminBulkReasonDto {
  const AdminBulkReasonDto({required this.ids, this.reason = ''});

  factory AdminBulkReasonDto.fromJson(Map<String, Object?> json) =>
      _$AdminBulkReasonDtoFromJson(json);

  final String reason;
  final List<String> ids;

  Map<String, Object?> toJson() => _$AdminBulkReasonDtoToJson(this);
}
