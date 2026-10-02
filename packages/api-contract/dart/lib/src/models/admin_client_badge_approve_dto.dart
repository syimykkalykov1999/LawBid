// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_client_badge_approve_dto.g.dart';

@JsonSerializable()
class AdminClientBadgeApproveDto {
  const AdminClientBadgeApproveDto({this.free = false});

  factory AdminClientBadgeApproveDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeApproveDtoFromJson(json);

  /// Give the badge free (no $10 subscription needed).
  final bool free;

  Map<String, Object?> toJson() => _$AdminClientBadgeApproveDtoToJson(this);
}
