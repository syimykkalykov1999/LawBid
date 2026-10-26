// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_client_badge_bulk_approve_dto.g.dart';

@JsonSerializable()
class AdminClientBadgeBulkApproveDto {
  const AdminClientBadgeBulkApproveDto({required this.ids, this.free = false});

  factory AdminClientBadgeBulkApproveDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeBulkApproveDtoFromJson(json);

  /// Give the badge free (no $10 subscription needed).
  final bool free;
  final List<String> ids;

  Map<String, Object?> toJson() => _$AdminClientBadgeBulkApproveDtoToJson(this);
}
