// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_client_badge_bulk_reject_dto.g.dart';

@JsonSerializable()
class AdminClientBadgeBulkRejectDto {
  const AdminClientBadgeBulkRejectDto({
    required this.reason,
    required this.ids,
  });

  factory AdminClientBadgeBulkRejectDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeBulkRejectDtoFromJson(json);

  final String reason;
  final List<String> ids;

  Map<String, Object?> toJson() => _$AdminClientBadgeBulkRejectDtoToJson(this);
}
