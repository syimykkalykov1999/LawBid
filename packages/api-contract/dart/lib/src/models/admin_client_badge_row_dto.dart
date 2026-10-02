// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_client_badge_row_dto_status.dart';
import 'admin_client_badge_row_dto_sub_status.dart';

part 'admin_client_badge_row_dto.g.dart';

@JsonSerializable()
class AdminClientBadgeRowDto {
  const AdminClientBadgeRowDto({
    required this.id,
    required this.userId,
    required this.status,
    required this.subStatus,
    required this.badgeActive,
    required this.documentsCount,
    required this.submittedAt,
    this.displayName,
    this.username,
    this.reviewedAt,
  });

  factory AdminClientBadgeRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeRowDtoFromJson(json);

  final String id;
  final String userId;
  final String? displayName;
  final String? username;
  final AdminClientBadgeRowDtoStatus status;
  final AdminClientBadgeRowDtoSubStatus subStatus;
  final bool badgeActive;
  final int documentsCount;
  final String submittedAt;
  final String? reviewedAt;

  Map<String, Object?> toJson() => _$AdminClientBadgeRowDtoToJson(this);
}
