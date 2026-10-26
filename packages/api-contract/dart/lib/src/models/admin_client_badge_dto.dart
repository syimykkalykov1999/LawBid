// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_client_badge_document_dto.dart';
import 'admin_client_badge_dto_status.dart';
import 'admin_client_badge_dto_sub_status.dart';

part 'admin_client_badge_dto.g.dart';

@JsonSerializable()
class AdminClientBadgeDto {
  const AdminClientBadgeDto({
    required this.id,
    required this.userId,
    required this.status,
    required this.subStatus,
    required this.badgeActive,
    required this.documentsCount,
    required this.submittedAt,
    required this.cancelAtPeriodEnd,
    required this.documents,
    this.displayName,
    this.username,
    this.reviewedAt,
    this.note,
    this.rejectReason,
    this.revokeReason,
    this.currentPeriodEnd,
  });

  factory AdminClientBadgeDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeDtoFromJson(json);

  final String id;
  final String userId;
  final String? displayName;
  final String? username;
  final AdminClientBadgeDtoStatus status;
  final AdminClientBadgeDtoSubStatus subStatus;
  final bool badgeActive;
  final int documentsCount;
  final String submittedAt;
  final String? reviewedAt;
  final String? note;
  final String? rejectReason;
  final String? revokeReason;
  final String? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final List<AdminClientBadgeDocumentDto> documents;

  Map<String, Object?> toJson() => _$AdminClientBadgeDtoToJson(this);
}
